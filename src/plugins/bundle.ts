/**
 * plugins/bundle — a song that carries its plugins (and samples) with it.
 *
 * A song file is kilobytes of text that NAMES things: plugin ids, sample
 * names. On another machine those names may mean nothing, which is exactly
 * what the lockfile and the fallbacks are for — but "plays with fallbacks"
 * is not "plays". So a song can travel as a bundle: a store-only zip (the
 * `.tracklet-plugin` layout one level up) holding the song JSON, every named
 * plugin's manifest plus module source, and every named sample as a `.wav`.
 *
 * The layout, flat and greppable:
 *
 *   song.json                        the `tracklet-song` file, as saved
 *   plugins/<id>/manifest.json       the manifest the song pinned
 *   plugins/<id>/<entry basename>    the module source (`./index.ts` -> `index.ts`)
 *   samples/<NAME>.wav               a named recording the song plays
 *
 * Building and parsing are both pure bytes in, answers out: the scene
 * collects the parts (its banks, its manifests) and acts on what comes back
 * (installs the plugins, loads the samples, opens the song). Anything that
 * is not exactly this layout is a named refusal, never a half-opened song.
 */

import { zipStore } from '../audio/zip';
import { readZipStore, type ZipEntryFile } from './install';

/** The song file inside every bundle, so the opener finds it blind. */
export const BUNDLE_SONG_NAME = 'song.json';
/** Where one plugin's two files live: `plugins/<id>/manifest.json` + module. */
export const BUNDLE_PLUGIN_DIR = 'plugins';
/** Where the song's named recordings live: `samples/<NAME>.wav`. */
export const BUNDLE_SAMPLE_DIR = 'samples';
/** A bundle download: `<stem>.tracklet-bundle.zip`, beside `<stem>.json`. */
export function songBundleFileName(stem: string): string {
  return `${stem}.tracklet-bundle.zip`;
}

/** One bundled plugin: the manifest the song pinned plus its module source. */
export interface SongBundlePlugin {
  id: string;
  manifestJson: unknown;
  /** The module source as text, still unimported. */
  moduleText: string;
  /** The entry path as the manifest spelled it. */
  entry: string;
}

/** One bundled sample: the name the song says plus the recording as a wav. */
export interface SongBundleSample {
  name: string;
  wavBytes: Uint8Array;
}

/** A bundle opened: the song plus everything it names. */
export interface SongBundle {
  songJson: string;
  plugins: SongBundlePlugin[];
  samples: SongBundleSample[];
}

/** The file a wav travels under: the sample name with path characters folded. */
export function bundleSampleName(name: string): string {
  const safe = name.replace(/[\\/]/g, '_').trim();
  return `${safe === '' ? 'sample' : safe}.wav`;
}

/** The last segment of an entry path: `./index.ts` travels as `index.ts`. */
function entryBaseName(entry: string): string {
  const trimmed = entry.trim().replace(/^\.\//, '').replace(/^\/+/, '');
  const segments = trimmed.split('/');
  return segments[segments.length - 1] ?? 'index.js';
}

/**
 * Pack a song bundle: the song JSON first, then each plugin's two files,
 * then each sample's wav. Empty plugin and sample lists pack a song alone —
 * a bundle of a song that names nothing is still a bundle, and still opens.
 */
export function buildSongBundle(parts: {
  songJson: string;
  plugins: readonly { id: string; manifestJson: unknown; moduleText: string; entry: string }[];
  samples: readonly { name: string; wavBytes: Uint8Array }[];
}): Uint8Array {
  const files: { name: string; bytes: Uint8Array }[] = [
    { name: BUNDLE_SONG_NAME, bytes: new TextEncoder().encode(parts.songJson) },
  ];
  for (const plugin of parts.plugins) {
    files.push({
      name: `${BUNDLE_PLUGIN_DIR}/${plugin.id}/manifest.json`,
      bytes: new TextEncoder().encode(JSON.stringify(plugin.manifestJson)),
    });
    files.push({
      name: `${BUNDLE_PLUGIN_DIR}/${plugin.id}/${entryBaseName(plugin.entry)}`,
      bytes: new TextEncoder().encode(plugin.moduleText),
    });
  }
  for (const sample of parts.samples) {
    files.push({ name: `${BUNDLE_SAMPLE_DIR}/${bundleSampleName(sample.name)}`, bytes: sample.wavBytes });
  }
  return zipStore(files);
}

/**
 * Open a song bundle: the song, each plugin's manifest plus source, each
 * sample's wav. A missing song, a song file that is not a `tracklet-song`,
 * a plugin folder with no manifest or no module, each refuse naming what
 * broke — while one bad plugin folder never costs the rest: it is skipped
 * with... no. A bundle is exact or it is refused: a half-opened song that
 * plays some plugins and silently drops one is the failure this format
 * exists to prevent.
 */
export function parseSongBundle(bytes: Uint8Array): { ok: true; bundle: SongBundle } | { ok: false; error: string } {
  const read = readZipStore(bytes);
  if (!read.ok) return read;
  const song = read.files.find((file) => file.name === BUNDLE_SONG_NAME);
  if (song === undefined) {
    return { ok: false, error: 'that is not a song bundle: no song.json inside. A song bundle holds the song plus the plugins and samples it names.' };
  }
  const songJson = new TextDecoder('utf-8').decode(song.bytes);
  let format: unknown;
  try {
    format = (JSON.parse(songJson) as { format?: unknown } | null)?.format;
  } catch {
    return { ok: false, error: 'that bundle\u2019s song.json is not JSON: the song it opens with has to parse.' };
  }
  if (format !== 'tracklet-song') {
    return { ok: false, error: `that bundle\u2019s song.json is a \u201c${String(format)}\u201d file, not a tracklet-song: the song inside has to be a song.` };
  }
  const plugins: SongBundlePlugin[] = [];
  for (const manifestFile of read.files.filter((file) => isPluginManifestName(file.name))) {
    const id = manifestFile.name.split('/')[1] ?? '';
    const parsed = parseBundledPlugin(id, manifestFile, read.files);
    if (!parsed.ok) return parsed;
    plugins.push(parsed.plugin);
  }
  const samples: SongBundleSample[] = [];
  for (const file of read.files) {
    if (!file.name.startsWith(`${BUNDLE_SAMPLE_DIR}/`) || !file.name.toLowerCase().endsWith('.wav')) continue;
    const base = file.name.slice(BUNDLE_SAMPLE_DIR.length + 1);
    samples.push({ name: base.slice(0, -'.wav'.length), wavBytes: file.bytes.slice() });
  }
  return { ok: true, bundle: { songJson, plugins, samples } };
}

/** What a zip is, before anything opens it: a song bundle, a plugin, or neither. */
export function bundleFileKind(bytes: Uint8Array): 'song-bundle' | 'plugin-bundle' | 'other' {
  const read = readZipStore(bytes);
  if (!read.ok) return 'other';
  if (read.files.some((file) => file.name === BUNDLE_SONG_NAME)) return 'song-bundle';
  if (read.files.some((file) => file.name === 'manifest.json')) return 'plugin-bundle';
  return 'other';
}

/** `plugins/<id>/manifest.json`, with a non-empty id. */
function isPluginManifestName(name: string): boolean {
  const segments = name.split('/');
  return segments.length === 3 && segments[0] === BUNDLE_PLUGIN_DIR && (segments[1] ?? '') !== '' && segments[2] === 'manifest.json';
}

/** One plugin folder: its manifest plus the module its entry names. */
function parseBundledPlugin(
  id: string,
  manifestFile: ZipEntryFile,
  files: readonly ZipEntryFile[],
): { ok: true; plugin: SongBundlePlugin } | { ok: false; error: string } {
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(new TextDecoder('utf-8').decode(manifestFile.bytes));
  } catch {
    return { ok: false, error: `that bundle\u2019s plugin \"${id}\" has a manifest that is not JSON: every plugin folder opens with a manifest that parses.` };
  }
  const entry = (manifestJson as { entry?: unknown } | null)?.entry;
  if (typeof entry !== 'string' || entry.trim() === '') {
    return { ok: false, error: `that bundle\u2019s plugin \"${id}\" names no entry module: its manifest needs an entry path.` };
  }
  const wanted = `${BUNDLE_PLUGIN_DIR}/${id}/${entryBaseName(entry)}`;
  const module = files.find((file) => file.name === wanted);
  if (module === undefined) {
    return { ok: false, error: `that bundle\u2019s plugin \"${id}\" names \"${entry}\" but holds no such file: the module travels inside the bundle.` };
  }
  return { ok: true, plugin: { id, manifestJson, moduleText: new TextDecoder('utf-8').decode(module.bytes), entry } };
}
