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
 *   kits/<NAME>.json                 a kit of your own the song NAMES
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
/**
 * Where a KIT OF YOUR OWN travels: `kits/<NAME>.json`.
 *
 * A song names its kit and the voices behind that name live in the app's kit
 * library — so without this a bundle arrived with the right name and the wrong
 * drummer, falling back to a built-in kit and saying nothing. Only the kit the
 * song NAMES is packed: a library of twenty is not the song.
 */
export const BUNDLE_KIT_DIR = 'kits';
/**
 * Where a RECORDED INSTRUMENT travels: `fonts/<NAME>.sf2` or `<NAME>.instrument.json`.
 *
 * Packed only when the song plays `wave font`, because that is the only case where
 * the other end is guaranteed to need it — and the bytes are carried rather than
 * the parsed font, since this build can read a soundfont but cannot write one.
 */
export const BUNDLE_FONT_DIR = 'fonts';

/**
 * The largest pack this build will hand back: 48 MiB.
 *
 * A pack is built WHOLE in memory — every sample, plugin and instrument in one
 * array, then a download — so the ceiling is about the tab surviving rather than
 * about taste. It also happens to be the number at which a store-only zip starts
 * to look silly: this writer does not compress, which matters most for the one
 * thing that can be tens of megabytes, a recorded instrument.
 */
export const MAX_BUNDLE_BYTES = 48 * 1024 * 1024;

/** A byte count as a person reads it: `5.2 MB`, `412 KB`. */
export function bundleSizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Why a pack of this size should not be made, or null when it is fine.
 *
 * Refused rather than trimmed: a pack with the instrument left out opens and
 * plays the WRONG SOUND on the other machine, which is worse than not being made
 * at all — the same judgement `shareLink` makes about a link that does not fit.
 */
export function bundleSizeProblem(bytes: number): string | null {
  if (bytes <= MAX_BUNDLE_BYTES) return null;
  return `this pack would be ${bundleSizeLabel(bytes)}, and a pack is built whole in memory before it is handed back, so the ceiling is ${bundleSizeLabel(MAX_BUNDLE_BYTES)}. The recorded instrument is usually the reason: a soundfont is megabytes and this build writes an uncompressed zip. Remove the instrument from the song (or play a built-in wave) and pack again.`;
}
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

/** One bundled kit of your own: the name the song says plus the voices. */
export interface SongBundleKit {
  name: string;
  json: unknown;
}

/** One bundled instrument: the file it was read from, going along with the song. */
export interface SongBundleFont {
  name: string;
  kind: 'soundfont' | 'noislet';
  bytes: Uint8Array;
}

/** A bundle opened: the song plus everything it names. */
export interface SongBundle {
  songJson: string;
  plugins: SongBundlePlugin[];
  samples: SongBundleSample[];
  kits: SongBundleKit[];
  fonts: SongBundleFont[];
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
  /** The kits of your own the song names — usually none, or one. */
  kits?: readonly { name: string; json: unknown }[];
  /** The recorded instruments the song plays, for a song on `wave font`. */
  fonts?: readonly SongBundleFont[];
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
  for (const font of parts.fonts ?? []) {
    files.push({
      // `bundleSampleName` folds a name to a file name and ends it in `.wav`, so
      // the recording suffix comes back off before an instrument's own extension
      // goes on — otherwise this machine reads `FIRE BED.wav.sf2` back as a font
      // called `FIRE BED.wav`.
      name: `${BUNDLE_FONT_DIR}/${bundleSampleName(font.name).replace(/\.wav$/i, '')}${font.kind === 'noislet' ? '.instrument.json' : '.sf2'}`,
      bytes: font.bytes,
    });
  }
  for (const kit of parts.kits ?? []) {
    files.push({
      name: `${BUNDLE_KIT_DIR}/${bundleSampleName(kit.name).replace(/\.wav$/, '.json')}`,
      bytes: new TextEncoder().encode(JSON.stringify(kit.json)),
    });
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
  // The kits of your own. A kit file that does not parse REFUSES the bundle,
  // plugins' reason one folder over: a half-carried kit is a song that plays
  // somebody else's drums without saying so.
  const kits: SongBundleKit[] = [];
  for (const file of read.files) {
    if (!file.name.startsWith(`${BUNDLE_KIT_DIR}/`) || !file.name.toLowerCase().endsWith('.json')) continue;
    const base = file.name.slice(BUNDLE_KIT_DIR.length + 1);
    const name = base.slice(0, -'.json'.length);
    try {
      kits.push({ name, json: JSON.parse(new TextDecoder('utf-8').decode(file.bytes)) });
    } catch {
      return { ok: false, error: `that bundle\u2019s kit \"${name}\" is not JSON: every kit in a bundle has to parse.` };
    }
  }
  // The recorded instruments. Decided by the file the writer chose, and named the
  // way the instrument is named, so the report on the way out can say which one
  // arrived.
  const fonts: SongBundleFont[] = [];
  for (const file of read.files) {
    if (!file.name.startsWith(`${BUNDLE_FONT_DIR}/`)) continue;
    const base = file.name.slice(BUNDLE_FONT_DIR.length + 1);
    if (base.toLowerCase().endsWith('.instrument.json')) {
      fonts.push({ name: base.slice(0, -'.instrument.json'.length), kind: 'noislet', bytes: file.bytes.slice() });
    } else if (base.toLowerCase().endsWith('.sf2')) {
      fonts.push({ name: base.slice(0, -'.sf2'.length), kind: 'soundfont', bytes: file.bytes.slice() });
    }
  }
  return { ok: true, bundle: { songJson, plugins, samples, kits, fonts } };
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
