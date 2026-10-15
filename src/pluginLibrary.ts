/**
 * pluginLibrary — remembering the plugins you installed.
 *
 * The same one-key bargain as `voiceLibrary.ts` and `kitLibrary.ts`: one
 * namespaced key in `localStorage`, read and written through the tiny store
 * interface in `themePrefs.ts`, and treated as untrusted input.
 *
 * The decisions are theirs, repeated because a plugin list is the most
 * load-bearing of the three:
 *
 *   • IT IS NOT SONG DATA. A song carries a plugin's ID and param values, not
 *     its code. Uninstalling a plugin never edits the song — the song falls
 *     back to a built-in voice and says so in words (the soundfont/sample
 *     bargain), and reinstalling restores it as written.
 *
 *   • WHAT IS STORED IS VALIDATED ON READ. `parsePluginManifests` drops stale
 *     entries (a newer host API, a hand-edited id) and keeps the rest, so one
 *     bad row never costs the user the whole list.
 *
 *   • FAILING TO REMEMBER IS NOT FAILING. A private window throws on write and
 *     a blocked store throws on read; both are swallowed. Installing a plugin
 *     in a window that forgets still works for the session.
 */

import { parsePluginGrants, type PluginGrants } from './plugins/grants';
import { fingerprintPluginCode, normalizePluginSource } from './plugins/install';
import { parsePluginManifests, type TrackletPluginManifest } from './plugins/manifest';
import { webStore, type KeyValueStore } from './themePrefs';

/** Where the installed plugin manifests live. Namespaced, because the origin is shared. */
export const PLUGIN_LIBRARY_STORAGE_KEY = 'tracklet.plugins';

/**
 * The installed plugins, or none.
 *
 * Never throws and never returns rubbish: a malformed value, a blocked store,
 * or a half-written list all come back as the manifests that COULD be read.
 */
export function loadPluginLibrary(store: KeyValueStore | null = webStore()): TrackletPluginManifest[] {
  const raw = readItem(store, PLUGIN_LIBRARY_STORAGE_KEY);
  if (raw === null || raw === '') return [];
  try {
    return parsePluginManifests(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Write the whole library. Returns whether it was written, so the caller can
 * say 'installed' honestly — a session that cannot persist still works, and
 * the session's registry still lists the new plugin.
 */
export function savePluginLibrary(library: readonly TrackletPluginManifest[], store: KeyValueStore | null = webStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(PLUGIN_LIBRARY_STORAGE_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

function readItem(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Where installed plugin SOURCES live: one namespaced key holding
 * `{ id: moduleText }`, beside the manifests above.
 *
 * A manifest is what a song pins; the source is what re-seats it after a
 * reload. Both are validated on read and both fail silent — a private window
 * that forgets still installs for the session, and one bad row never costs
 * the rest their code.
 */
export const PLUGIN_CODE_STORAGE_KEY = 'tracklet.pluginCode';

/** Every remembered source, by plugin id. Never throws, never returns rubbish. */
export function loadInstalledPluginCode(store: KeyValueStore | null = webStore()): Record<string, string> {
  const raw = readItem(store, PLUGIN_CODE_STORAGE_KEY);
  if (raw === null || raw === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const code: Record<string, string> = {};
    for (const [id, text] of Object.entries(parsed)) {
      if (typeof text === 'string' && text !== '') code[id] = text;
    }
    return code;
  } catch {
    return {};
  }
}

/** Remember one plugin's source. Only seated code is saved — the caller keeps what passed the gates. */
export function saveInstalledPluginCode(id: string, text: string, store: KeyValueStore | null = webStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(PLUGIN_CODE_STORAGE_KEY, JSON.stringify({ ...loadInstalledPluginCode(store), [id]: text }));
    return true;
  } catch {
    return false;
  }
}

/** Forget one plugin's source, e.g. beside an uninstall. Unknown ids are a no-op. */
export function forgetInstalledPluginCode(id: string, store: KeyValueStore | null = webStore()): void {
  try {
    if (!store) return;
    const code = loadInstalledPluginCode(store);
    if (!(id in code)) return;
    delete code[id];
    store.setItem(PLUGIN_CODE_STORAGE_KEY, JSON.stringify(code));
  } catch {
    // Forgetting to forget is not failing: the source seats nothing by itself.
  }
}

/**
 * Where each install came from: one namespaced key holding `{ id: source }`,
 * beside the manifests, the code, and the answers.
 *
 * Provenance is a pointer for a person, not trust by itself: a URL the
 * plugin was fetched from, a file it arrived as, a bundle that carried it.
 * What is remembered is always short (trimmed, capped) and always honest —
 * a missing source installs exactly like a named one, and the trust UI
 * names the origin long after the toast faded. Forgotten beside an
 * uninstall, like the code and the answers: a reinstall says where from.
 */
export const PLUGIN_SOURCES_STORAGE_KEY = 'tracklet.pluginSources';

/** Every remembered origin, by plugin id. Never throws, never returns rubbish. */
export function loadPluginSources(store: KeyValueStore | null = webStore()): Record<string, string> {
  const raw = readItem(store, PLUGIN_SOURCES_STORAGE_KEY);
  if (raw === null || raw === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const sources: Record<string, string> = {};
    for (const [id, source] of Object.entries(parsed)) {
      const kept = normalizePluginSource(source);
      if (id !== '' && kept !== null) sources[id] = kept;
    }
    return sources;
  } catch {
    return {};
  }
}

/**
 * Remember where one plugin came from. A missing source forgets the row
 * rather than writing a blank — absent and blank mean the same thing.
 */
export function savePluginSource(id: string, source: unknown, store: KeyValueStore | null = webStore()): boolean {
  try {
    if (!store) return false;
    const kept = normalizePluginSource(source);
    const sources = loadPluginSources(store);
    if (kept === null) {
      if (!(id in sources)) return true;
      delete sources[id];
    } else {
      sources[id] = kept;
    }
    store.setItem(PLUGIN_SOURCES_STORAGE_KEY, JSON.stringify(sources));
    return true;
  } catch {
    return false;
  }
}

/** Forget one plugin's origin, e.g. beside an uninstall. Unknown ids are a no-op. */
export function forgetPluginSource(id: string, store: KeyValueStore | null = webStore()): void {
  try {
    if (!store) return;
    const sources = loadPluginSources(store);
    if (!(id in sources)) return;
    delete sources[id];
    store.setItem(PLUGIN_SOURCES_STORAGE_KEY, JSON.stringify(sources));
  } catch {
    // Forgetting to forget is not failing: a missing origin installs the same.
  }
}

/**
 * What each installed module weighed when it was installed: one namespaced
 * key holding `{ id: fingerprint }`, beside the code it watches.
 *
 * The boot re-seat hashes what it is about to run and seats only what still
 * matches — bitrot, a hand-edit, or a swapped zip seats nothing and says so
 * in words. An id with remembered code but no fingerprint seats as before:
 * it was installed before fingerprints existed, and bricking old installs
 * would be the opposite of remembering. Forgotten beside an uninstall, like
 * everything else on these shelves.
 */
export const PLUGIN_FINGERPRINTS_STORAGE_KEY = 'tracklet.pluginFingerprints';

/** Every remembered weight, by plugin id. Never throws, never returns rubbish. */
export function loadPluginFingerprints(store: KeyValueStore | null = webStore()): Record<string, string> {
  const raw = readItem(store, PLUGIN_FINGERPRINTS_STORAGE_KEY);
  if (raw === null || raw === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const prints: Record<string, string> = {};
    for (const [id, print] of Object.entries(parsed)) {
      if (id !== '' && typeof print === 'string' && /^[0-9a-f]{8}$/.test(print)) prints[id] = print;
    }
    return prints;
  } catch {
    return {};
  }
}

/** Remember what one plugin's code weighed. Only seated code is weighed — the caller keeps what passed the gates. */
export function savePluginFingerprint(id: string, fingerprint: string, store: KeyValueStore | null = webStore()): boolean {
  try {
    if (!store) return false;
    if (!/^[0-9a-f]{8}$/.test(fingerprint)) return false;
    store.setItem(PLUGIN_FINGERPRINTS_STORAGE_KEY, JSON.stringify({ ...loadPluginFingerprints(store), [id]: fingerprint }));
    return true;
  } catch {
    return false;
  }
}

/** Forget one plugin's weight, e.g. beside an uninstall. Unknown ids are a no-op. */
export function forgetPluginFingerprint(id: string, store: KeyValueStore | null = webStore()): void {
  try {
    if (!store) return;
    const prints = loadPluginFingerprints(store);
    if (!(id in prints)) return;
    delete prints[id];
    store.setItem(PLUGIN_FINGERPRINTS_STORAGE_KEY, JSON.stringify(prints));
  } catch {
    // Forgetting to forget is not failing: a missing weight seats as before.
  }
}

/**
 * Whether remembered code is still the code that was installed: a missing
 * weight is old (seats as before), a match seats, anything else refuses.
 * The boot re-seat's one question, asked before any dynamic import.
 */
export function pluginCodeMatchesFingerprint(id: string, text: string, fingerprints: Record<string, string>): boolean {
  const remembered = fingerprints[id];
  if (remembered === undefined) return true;
  return fingerprintPluginCode(text) === remembered;
}

/**
 * Where this machine's permission answers live: one namespaced key holding
 * `{ id: ["network", ...] }`, beside the manifests and the sources.
 *
 * Grants are person-level choices, not song data: they are never written
 * into a song, never packed into a bundle, and never leave the machine. A
 * reinstall asks again — forgetting is the point, so a decision made for
 * one copy of a plugin never silently covers its replacement.
 */
export const PLUGIN_GRANTS_STORAGE_KEY = 'tracklet.pluginGrants';

/**
 * The remembered grants, or none.
 *
 * Never throws and never invents permission: a malformed value, a blocked
 * store, or a half-written map all come back as the decisions that COULD be
 * read — and a decision that cannot be read is denied, the trust model's
 * default.
 */
export function loadPluginGrants(store: KeyValueStore | null = webStore()): PluginGrants {
  const raw = readItem(store, PLUGIN_GRANTS_STORAGE_KEY);
  if (raw === null || raw === '') return {};
  try {
    return parsePluginGrants(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * Write the whole grants map. Returns whether it was written, so the caller
 * can say 'remembered' honestly — a session that cannot persist still
 * decides for the session, and the decisions still stand until reload.
 */
export function savePluginGrants(grants: PluginGrants, store: KeyValueStore | null = webStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(PLUGIN_GRANTS_STORAGE_KEY, JSON.stringify(grants));
    return true;
  } catch {
    return false;
  }
}
