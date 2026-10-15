/**
 * plugins/install — a `.tracklet-plugin` zip becomes a seated plugin.
 *
 * Installing means executing somebody's module, so every half of the bargain
 * is said here: the bytes arrive as a zip of STOREd files (the format
 * `audio/zip.ts` writes — method 0, no timestamps, no cleverness), the bundle
 * holds `manifest.json` plus the entry module its `entry` names, the manifest
 * registers through the registry's own validation, and the module seats
 * through the loader's trust gates. Anything that is not exactly that is a
 * named refusal, never a half-installed plugin.
 *
 * The module crosses from text to code in exactly one place: a Blob URL fed
 * to a dynamic `import()`, never `eval` (the M0 loading rule). That crossing
 * is a browser act, so it hangs off an injected importer — the scene passes
 * none and gets the Blob path, and the tests pass a fake and never touch the
 * network, the DOM, or storage. Everything else here is pure bytes in,
 * answers out.
 */

import { seatEffectModule, seatGeneratorModule, seatInstrumentModule, seatPanelModule } from './loader';
import { validatePluginManifest } from './manifest';
import { registerPlugin, type RegistryEntry } from './registry';
import type { EffectPlugin } from './effect';
import type { GeneratorPlugin } from './generator';
import type { InstrumentPlugin } from './instrument';
import type { PanelPlugin } from './panel';
import type { Song } from '../model/song';

/** One file read out of an archive: its name and its bytes. */
export interface ZipEntryFile {
  name: string;
  bytes: Uint8Array;
}

/** `PK\3\4` — a file's own header, the only record a reader walks. */
const LOCAL_SIGNATURE = 0x04034b50;
/** `PK\1\2` — the directory: where the files stop. */
const CENTRAL_SIGNATURE = 0x02014b50;
/** `PK\5\6` — the end: where an empty archive starts. */
const END_SIGNATURE = 0x06054b50;
/** A local header is 30 bytes before the name. */
const LOCAL_FIXED = 30;
/** `store`: the bytes are the file. The only method a bundle may use. */
const METHOD_STORE = 0;
/** Bit 0: encrypted. Bit 3: a data descriptor holds the real sizes. */
const FLAG_ENCRYPTED = 0x01;
const FLAG_DESCRIPTOR = 0x08;
/** A bundle is small by design: past this it is not a plugin. */
const MAX_BUNDLE_FILES = 256;
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;

/**
 * Read a store-only zip: the files in archive order.
 *
 * Refuses rather than guesses: a non-zip, a truncation, a compressed or
 * encrypted entry, a checksum mismatch, a name that climbs out of the
 * archive (`..`, an absolute path, a backslash) — each names the file that
 * broke the bargain. The central directory is where the walk stops; it is
 * not re-verified, because the local headers already said everything twice.
 */
export function readZipStore(bytes: Uint8Array): { ok: true; files: ZipEntryFile[] } | { ok: false; error: string } {
  if (bytes.length < 4) return { ok: false, error: 'that is not a plugin bundle: a .tracklet-plugin is a zip of manifest.json plus its entry module.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const decoder = new TextDecoder('utf-8');
  const files: ZipEntryFile[] = [];
  let total = 0;
  let at = 0;
  while (at + 4 <= bytes.length) {
    const signature = view.getUint32(at, true);
    if (signature === CENTRAL_SIGNATURE || signature === END_SIGNATURE) break;
    if (signature !== LOCAL_SIGNATURE) {
      return { ok: false, error: 'that is not a plugin bundle: the archive breaks where a file should begin.' };
    }
    if (at + LOCAL_FIXED > bytes.length) {
      return { ok: false, error: 'that plugin bundle is truncated: a file header stops mid-sentence.' };
    }
    const flags = view.getUint16(at + 6, true);
    const method = view.getUint16(at + 8, true);
    const crc = view.getUint32(at + 14, true);
    const compressed = view.getUint32(at + 18, true);
    const uncompressed = view.getUint32(at + 22, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const nameStart = at + LOCAL_FIXED;
    if (nameStart + nameLength + extraLength > bytes.length) {
      return { ok: false, error: 'that plugin bundle is truncated: a file name runs past the archive.' };
    }
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (name === '' || name.endsWith('/')) {
      return { ok: false, error: `that plugin bundle holds "${name === '' ? 'a nameless file' : name}": a bundle holds files, not folders.` };
    }
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
      return { ok: false, error: `that plugin bundle climbs out of its folder in "${name}": entry names stay inside the archive.` };
    }
    if ((flags & FLAG_ENCRYPTED) !== 0) {
      return { ok: false, error: `"${name}" is encrypted: a bundle is plain files, never a locked one.` };
    }
    if ((flags & FLAG_DESCRIPTOR) !== 0) {
      return { ok: false, error: `"${name}" hides its sizes in a data descriptor: a bundle states them up front.` };
    }
    if (method !== METHOD_STORE) {
      return { ok: false, error: `"${name}" is compressed (method ${method}): re-zip the bundle stored, with no compression.` };
    }
    if (compressed !== uncompressed) {
      return { ok: false, error: `"${name}" disagrees with itself about its size: a stored file states it once.` };
    }
    const dataStart = nameStart + nameLength + extraLength;
    if (dataStart + compressed > bytes.length) {
      return { ok: false, error: `"${name}" is truncated: the archive ends inside its bytes.` };
    }
    const data = bytes.slice(dataStart, dataStart + compressed);
    let checksum = 0xffffffff;
    for (let i = 0; i < data.length; i++) checksum = (CRC_TABLE[(checksum ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (checksum >>> 8);
    if (((checksum ^ 0xffffffff) >>> 0) !== crc) {
      return { ok: false, error: `"${name}" fails its checksum: the bundle changed after it was zipped.` };
    }
    files.push({ name, bytes: data });
    total += compressed;
    if (files.length > MAX_BUNDLE_FILES || total > MAX_BUNDLE_BYTES) {
      return { ok: false, error: 'that plugin bundle is too big: a plugin is kilobytes of code, not an archive of archives.' };
    }
    at = dataStart + compressed;
  }
  return { ok: true, files };
}

/** The CRC-32 table, beside `audio/zip.ts`'s own: the reader checks what the writer wrote. */
const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

/** A bundle opened: the manifest as written plus the entry module as text. */
export interface PluginBundle {
  manifestJson: unknown;
  /** The module's source, still text: the importer turns it into code. */
  moduleText: string;
  /** The entry path as the manifest spelled it. */
  entry: string;
}

/** A manifest path with its `./` coat taken off, for matching archive names. */
function normalizeEntryPath(entry: string): string {
  return entry.trim().replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Open a bundle's files: `manifest.json` plus the module its `entry` names.
 * Extra files (samples, a readme) are ignored — room the format grows into,
 * not errors. A missing manifest, unparseable JSON, a missing entry name, or
 * an entry with no file behind it each refuse in words.
 */
export function parsePluginBundle(files: readonly ZipEntryFile[]): { ok: true; bundle: PluginBundle } | { ok: false; error: string } {
  const manifest = files.find((file) => file.name === 'manifest.json');
  if (manifest === undefined) {
    return { ok: false, error: 'that plugin bundle has no manifest.json: a bundle is a manifest plus its entry module.' };
  }
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(new TextDecoder('utf-8').decode(manifest.bytes));
  } catch {
    return { ok: false, error: 'that bundle\u2019s manifest.json is not JSON: the file it opens with has to parse.' };
  }
  const entry = (manifestJson as { entry?: unknown } | null)?.entry;
  if (typeof entry !== 'string' || entry.trim() === '') {
    return { ok: false, error: 'that bundle\u2019s manifest names no entry module: it needs an entry path, e.g. "./index.js".' };
  }
  const wanted = normalizeEntryPath(entry);
  const module = files.find((file) => normalizeEntryPath(file.name) === wanted);
  if (module === undefined) {
    return { ok: false, error: `that bundle names "${entry}" but holds no such file: the entry module travels inside the zip.` };
  }
  return { ok: true, bundle: { manifestJson, moduleText: new TextDecoder('utf-8').decode(module.bytes), entry } };
}

/** Read the archive and open the bundle: the two refusals in one call. */
export function bundleFromZipBytes(bytes: Uint8Array): { ok: true; bundle: PluginBundle } | { ok: false; error: string } {
  const read = readZipStore(bytes);
  if (!read.ok) return read;
  return parsePluginBundle(read.files);
}

/** The kinds whose code this build can seat: everything but `io`. */
export type SeatedPluginKind = 'instrument' | 'effect' | 'generator' | 'panel';

/** One seated third-party plugin, of whatever kind it proved to be. */
export interface SeatedAnyPlugin {
  kind: SeatedPluginKind;
  plugin: InstrumentPlugin | EffectPlugin | GeneratorPlugin | PanelPlugin;
}

/**
 * Seat an already-imported module beside its manifest, by the kind the
 * manifest claims: the four loader gates behind one door. An unknown kind
 * (today: `io`) is refused with the milestone that seats it, not with a
 * crash — the same rule the gates keep one level down.
 */
export function seatModuleForKind(
  manifestJson: unknown,
  module: Record<string, unknown>,
): { ok: true; seated: SeatedAnyPlugin } | { ok: false; error: string } {
  const checked = validatePluginManifest(manifestJson);
  if (!checked.ok) return { ok: false, error: checked.error };
  const kind = checked.manifest.kind;
  if (kind === 'instrument') {
    const seated = seatInstrumentModule(manifestJson, module);
    if (!seated.ok) return seated;
    return { ok: true, seated: { kind, plugin: seated.seated.plugin } };
  }
  if (kind === 'effect') {
    const seated = seatEffectModule(manifestJson, module);
    if (!seated.ok) return seated;
    return { ok: true, seated: { kind, plugin: seated.seated.plugin } };
  }
  if (kind === 'generator') {
    const seated = seatGeneratorModule(manifestJson, module);
    if (!seated.ok) return seated;
    return { ok: true, seated: { kind, plugin: seated.seated.plugin } };
  }
  if (kind === 'panel') {
    const seated = seatPanelModule(manifestJson, module);
    if (!seated.ok) return seated;
    return { ok: true, seated: { kind, plugin: seated.seated.plugin } };
  }
  return { ok: false, error: `plugin "${checked.manifest.id}" is ${kind}, which this build cannot seat yet: instruments, effects, generators and panels install; io arrives in its own milestone.` };
}

/** Turn module text into an importable module: a Blob URL, never `eval`. */
export type PluginModuleImporter = (text: string, entry: string) => Promise<Record<string, unknown>>;

/**
 * The browser's crossing from text to code: the source becomes a Blob URL and
 * a dynamic `import()` reads it back as a module. The URL is revoked once the
 * module is instantiated, so one install leaves no address behind.
 */
export async function importModuleText(text: string): Promise<Record<string, unknown>> {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  try {
    return (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Fetch a `.tracklet-plugin` zip from a URL the user approved, as bytes.
 *
 * Remote installs are OFF by default: nothing in the app fetches a plugin
 * unasked — the call is the approval (a `plugin install URL` line the user
 * wrote, a button they pressed). Only `http:` and `https:` go out; anything
 * else is refused before a packet forms, because a plugin URL is a web
 * address, never a scheme trick. Failures name the URL and the HTTP status,
 * the sample-loading precedent one scope over.
 */
export async function fetchPluginBundle(
  url: string,
  fetcher: (input: string) => Promise<{ ok: boolean; status: number; bytes: () => Promise<Uint8Array> }> = defaultBundleFetcher,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  let scheme: string;
  try {
    scheme = new URL(url).protocol;
  } catch {
    return { ok: false, error: `"${url}" is not a plugin URL: install from an http(s) address, e.g. "plugin install https://example.com/reverb.tracklet-plugin".` };
  }
  if (scheme !== 'http:' && scheme !== 'https:') {
    return { ok: false, error: `"${url}" is not a plugin URL: install from an http(s) address, e.g. "plugin install https://example.com/reverb.tracklet-plugin".` };
  }
  let response: { ok: boolean; status: number; bytes: () => Promise<Uint8Array> };
  try {
    response = await fetcher(url);
  } catch {
    return { ok: false, error: `could not read "${url}": the server did not answer.` };
  }
  if (!response.ok) {
    return { ok: false, error: `could not load "${url}" (HTTP ${response.status}).` };
  }
  try {
    return { ok: true, bytes: await response.bytes() };
  } catch {
    return { ok: false, error: `could not read "${url}": the download stopped halfway.` };
  }
}

/** The browser's fetch, shaped for tests to fake. */
async function defaultBundleFetcher(url: string): Promise<{ ok: boolean; status: number; bytes: () => Promise<Uint8Array> }> {
  const response = await fetch(url);
  return {
    ok: response.ok,
    status: response.status,
    bytes: async () => new Uint8Array(await response.arrayBuffer()),
  };
}

/**
 * Every plugin id a song names: channel instruments plus seated insert ids,
 * deduplicated in first-mention order. What the lockfile pins and the bundle
 * packs — a song that names none locks nothing.
 */
export function songPluginIds(song: Song): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const keep = (id: string): void => {
    if (id.trim() === '' || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const track of song.tracks) {
    if (track.plugin !== null) keep(track.plugin);
    for (const seated of track.fx) keep(seated.id);
  }
  return ids;
}

/** A locked `MAJOR.MINOR.PATCH` split for comparing, or null when misshapen. */
function splitPinnedVersion(version: string): [number, number, number] | null {
  const parts = version.trim().split('.');
  if (parts.length !== 3) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0];
}

/**
 * What opening a song with a lockfile should say, one line per pinned plugin.
 *
 * The lockfile (`pluginVersions` on the file) is what the song was saved
 * against; `known` is what this machine holds now. A match is silence — the
 * common case is not news. Anything else names the id and the two versions:
 * a missing plugin falls back (the play-time bargain, said up front), an
 * older installed copy warns (the song may ask for knobs it predates), a
 * newer minor notes the upgrade (forward, recorded, never backgrounded), and
 * a different major warns loudly (a new major may sound like a new plugin).
 * A disabled plugin is reported as itself — present but switched off — and a
 * misshapen pin is the file's problem, said as such.
 */
export function pluginMigrationNotices(
  locked: Record<string, string>,
  known: readonly { id: string; version: string; enabled: boolean }[],
): string[] {
  const notices: string[] = [];
  for (const [id, pinned] of Object.entries(locked)) {
    const entry = known.find((plugin) => plugin.id === id);
    if (entry === undefined) {
      notices.push(`"${id}" was saved at ${pinned} but is not installed here - its channels fall back until it is.`);
      continue;
    }
    if (!entry.enabled) {
      notices.push(`"${id}" is installed but disabled - its channels fall back until it is enabled.`);
      continue;
    }
    const was = splitPinnedVersion(pinned);
    const is = splitPinnedVersion(entry.version);
    if (was === null) {
      notices.push(`"${id}" was saved with "${pinned}", which is not a version - it plays as installed (${entry.version}).`);
      continue;
    }
    if (is === null) continue;
    if (was[0] !== is[0]) {
      notices.push(`"${id}" moved major ${was[0]} to ${is[0]} since this song was saved - hear it before trusting it.`);
    } else if (was[1] !== is[1] || was[2] !== is[2]) {
      notices.push(
        is[1] > was[1] || (is[1] === was[1] && is[2] > was[2])
          ? `"${id}" moved ${pinned} to ${entry.version} since this song was saved - forward, as locked.`
          : `"${id}" was saved at ${pinned} but this machine holds ${entry.version} - older, so new knobs may be missing.`,
      );
    }
  }
  return notices;
}

/**
 * How long a remembered source may be: a URL or a filename, not an essay.
 * Longer arrives truncated, because provenance is a pointer for a person,
 * not storage for a document.
 */
export const MAX_PLUGIN_SOURCE_LENGTH = 512;

/**
 * What an installed module weighed, as eight hex digits: FNV-1a over the
 * UTF-8 bytes of the source text.
 *
 * Integrity, not security — a checksum that catches bitrot, a hand-edit,
 * or a zip that changed between download and install. It authenticates
 * nothing (no keys in v1, per the roadmap's open question 4): a changed
 * fingerprint means "not the code that was installed", and the host
 * answers that by refusing to seat it, in words. Sync and dependency-free
 * so both clocks, the tests, and the boot re-seat share the one function.
 */
export function fingerprintPluginCode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Where an install came from, cleaned for remembering: trimmed, or null
 * when nothing was said. Non-strings and blanks are null — provenance is
 * informational, so a missing source installs exactly like a named one,
 * and what is remembered is always a short honest string.
 */
export function normalizePluginSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.slice(0, MAX_PLUGIN_SOURCE_LENGTH);
}

/** What an install did, said plainly enough for a toast. */
export interface PluginInstall {
  registry: RegistryEntry[];
  entry: RegistryEntry;
  /**
   * Where it came from: the URL it was fetched from, the file it was
   * dropped as, the bundle that carried it — or null when nobody said.
   * The caller persists it beside the manifest and the source, so the
   * trust UI can name the origin long after the toast faded.
   */
  source: string | null;
  /**
   * What the installed module weighed: `fingerprintPluginCode(moduleText)`.
   * The caller persists it beside the code, so the boot re-seat can tell
   * changed code from installed code and seat only the latter.
   */
  fingerprint: string;
  /** The seated code, or null with the reason it stayed unloadable. */
  seated: SeatedAnyPlugin | null;
  unseatedReason: string | null;
  /** The module source, for the caller to persist when seating passed. */
  moduleText: string;
}

/**
 * Install a `.tracklet-plugin` zip: open, register, import, seat.
 *
 * Registration and seating are kept apart on purpose. A bundle whose manifest
 * validates REGISTERS even when its code will not seat — the manifest is what
 * songs pin and what the dropdown lists, and an installed-but-unloaded plugin
 * falls back in words rather than vanishing. So only a corrupt archive or a
 * bad manifest fails the install; a module that will not import or seat
 * installs with `seated: null` and the reason, and the caller persists the
 * source only when seating passed.
 */
export async function installPluginBundle(
  zipBytes: Uint8Array,
  registry: readonly RegistryEntry[],
  options: { importModule?: PluginModuleImporter; source?: unknown } = {},
): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string; registry: readonly RegistryEntry[] }> {
  const opened = bundleFromZipBytes(zipBytes);
  if (!opened.ok) return { ok: false, error: opened.error, registry };
  return installBundledPlugin(
    registry,
    opened.bundle.manifestJson,
    opened.bundle.moduleText,
    options.importModule,
    opened.bundle.entry,
    options.source,
  );
}

/**
 * Install one plugin from an already-opened manifest plus its module source:
 * register, import, seat. The shared tail of a `.tracklet-plugin` zip and a
 * song bundle's `plugins/` folder — one door, so a bundle installs exactly
 * what a zip installs, with the same register-then-seat bargain.
 */
export async function installBundledPlugin(
  registry: readonly RegistryEntry[],
  manifestJson: unknown,
  moduleText: string,
  importModule: PluginModuleImporter = importModuleText,
  entry = '',
  source: unknown = null,
): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string; registry: readonly RegistryEntry[] }> {
  const registered = registerPlugin(registry, manifestJson);
  if (!('entry' in registered)) return { ok: false, error: registered.error, registry };
  const origin = normalizePluginSource(source);
  let module: Record<string, unknown>;
  try {
    module = await importModule(moduleText, entry);
  } catch {
    return {
      ok: true,
      install: {
        registry: registered.registry,
        entry: registered.entry,
        source: origin,
        seated: null,
        unseatedReason: `"${registered.entry.manifest.id}" registered, but its code did not load - it falls back in words until it is reinstalled.`,
        moduleText,
        fingerprint: fingerprintPluginCode(moduleText),
      },
    };
  }
  const seated = seatModuleForKind(manifestJson, module);
  if (!seated.ok) {
    return {
      ok: true,
      install: {
        registry: registered.registry,
        entry: registered.entry,
        source: origin,
        seated: null,
        unseatedReason: seated.error,
        moduleText,
        fingerprint: fingerprintPluginCode(moduleText),
      },
    };
  }
  return {
    ok: true,
    install: {
      registry: registered.registry,
      entry: registered.entry,
      source: origin,
      seated: seated.seated,
      unseatedReason: null,
      moduleText,
      fingerprint: fingerprintPluginCode(moduleText),
    },
  };
}
