/**
 * plugins/manifest — what a Tracklet plugin CLAIMS to be, checked before
 * anything loads it.
 *
 * A plugin is a TypeScript module plus this manifest: its id, name, version,
 * kind, entry point, the host API it targets, and the knobs (params) it wants
 * the host to own. The manifest is the parse-before-apply boundary from
 * Tracklet Script carried over to plugins: a manifest with one mistake means
 * zero effect, and the mistake is named — plugin id, field, fix — in the same
 * actionable style as the script diagnostics in `model/script.ts`.
 *
 * This module is pure and Phaser-free (like everything in `model/`), so the
 * rules are unit tested without a DOM: `validatePluginManifest` for the
 * strict single-manifest check, `parsePluginManifests` for the LENIENT
 * stored-library read that drops bad entries and keeps good ones (the
 * `parseUserKits` pattern in `model/kit.ts`).
 */

/** The host API version this build of Tracklet speaks. */
export const HOST_API_VERSION = 1;

/** The kinds of plugin the host knows how to seat. */
export const PLUGIN_KINDS = ['instrument', 'effect', 'generator', 'panel', 'io'] as const;

/** One seat in the host: where the plugin plugs in. */
export type PluginKind = (typeof PLUGIN_KINDS)[number];

/** How long a plugin name may be, shown in the browser and menus. */
export const MAX_PLUGIN_NAME = 32;

/** How many params one plugin may declare. */
export const MAX_PLUGIN_PARAMS = 32;

/** How long a param id or label may be. */
export const MAX_PLUGIN_PARAM_ID = 24;
export const MAX_PLUGIN_PARAM_LABEL = 32;

/** How many output buses one plugin may declare. */
export const MAX_PLUGIN_OUTS = 8;

/** How long one output name may be, shown in stem files and menus. */
export const MAX_PLUGIN_OUT_NAME = 24;

/**
 * What a plugin may ask the host for: the closed list from the trust model.
 *
 * Two words, and only two: `network` (fetch through the host, for a panel
 * that loads help text or a sample list) and `storage` (a namespaced scope,
 * never raw localStorage). A closed list so the browser can name the ask and
 * the future grant screen can keep it — anything else is a refusal, not a
 * guess.
 */
export const PLUGIN_PERMISSIONS = ['network', 'storage'] as const;

/** One thing a plugin may ask the host for: the network, or its own storage scope. */
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

/**
 * How much latency a plugin may declare, in whole milliseconds.
 *
 * 100ms stays inside the scheduler's ~120ms look-ahead, so the host can
 * always start a latent note early rather than late: a bigger claim could
 * not be honoured at schedule time, so it is refused rather than clamped.
 */
export const MAX_PLUGIN_LATENCY_MS = 100;

/** A knob the host owns on the plugin's behalf: 0–100, never 0–1. */
export interface PluginParamDecl {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
}

/** The manifest: a plugin's claim about itself, validated before load. */
export interface TrackletPluginManifest {
  id: string;
  name: string;
  version: string;
  kind: PluginKind;
  entry: string;
  apiVersion: number;
  params: PluginParamDecl[];
  /**
   * How late the plugin's transients land behind the scheduled start, in
   * whole milliseconds — the lookahead a compressor or oversampled saturator
   * ate. Absent means 0: most renders start at their attack. The host starts
   * the note early by this much on both clocks, so the transient lands on
   * the grid it was written on.
   */
  latencyMs?: number;
  /**
   * The names of the render's output buses, bus 0 first: a drum kit's
   * `kick`, `snare`, `hat`. Optional — an undeclared multi-out render gets
   * `out1..N`. The names are what per-out stems will be called when they
   * land, so they must be stable file-safe words.
   */
  outs?: string[];
  /**
   * What the plugin asks the host for, beyond the seeded RNG and the scoped
   * log every plugin gets. Optional — absent is none, and none is everything
   * the audio path needs. The claim is visible before it is enforced: the
   * browser names it, so the ask is on screen at install time. Today the
   * host hands every plugin the same small surface, so a permission is a
   * promise the grant screen will keep, not a key that turns yet.
   */
  permissions?: PluginPermission[];
  description?: string;
  author?: string;
  license?: string;
}

/**
 * Whether the value names a plugin kind the host can seat.
 */
export function isPluginKind(value: unknown): value is PluginKind {
  return typeof value === 'string' && (PLUGIN_KINDS as readonly string[]).includes(value);
}

/**
 * Whether the value names a permission the host grants.
 *
 * The stored grants read's whole question: storage is hand-editable, so a
 * word from outside the closed list is dropped, never trusted.
 */
export function isPluginPermission(value: unknown): value is PluginPermission {
  return typeof value === 'string' && (PLUGIN_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * The one problem with a manifest, or null when it loads.
 *
 * Strict on purpose: this is the install/registration path, where refusing
 * with a named fix is cheap and loading something half-understood is not.
 * (Reading the STORED library back is the lenient `parsePluginManifests`
 * below, because storage is shared, hand-editable, and outlives the build.)
 */
export function pluginManifestProblem(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return 'a plugin manifest is an object with id, name, version, kind and entry.';
  }
  const fields = raw as Record<string, unknown>;
  const idProblem = pluginIdProblem(fields.id);
  if (idProblem !== null) return idProblem;
  const id = fields.id as string;
  if (typeof fields.name !== 'string' || fields.name.trim() === '') {
    return `plugin "${id}" needs a name of 1-${MAX_PLUGIN_NAME} characters.`;
  }
  if (fields.name.trim().length > MAX_PLUGIN_NAME) {
    return `plugin "${id}" has a name longer than ${MAX_PLUGIN_NAME} characters. Shorten it.`;
  }
  if (typeof fields.version !== 'string' || !isSemver(fields.version)) {
    return `plugin "${id}" needs a version like "1.2.3". Got ${quoteShort(fields.version)}.`;
  }
  if (!isPluginKind(fields.kind)) {
    return `plugin "${id}" has kind ${quoteShort(fields.kind)}. Pick one of: ${PLUGIN_KINDS.join(', ')}.`;
  }
  if (typeof fields.entry !== 'string' || fields.entry.trim() === '') {
    return `plugin "${id}" needs an entry module path, e.g. "./index.ts".`;
  }
  if (
    typeof fields.apiVersion !== 'number' ||
    !Number.isInteger(fields.apiVersion) ||
    fields.apiVersion < 1 ||
    fields.apiVersion > HOST_API_VERSION
  ) {
    return `plugin "${id}" targets apiVersion ${quoteShort(fields.apiVersion)}, but this build speaks 1-${HOST_API_VERSION}.`;
  }
  if (fields.params !== undefined) {
    const paramsProblem = pluginParamsProblem(id, fields.params);
    if (paramsProblem !== null) return paramsProblem;
  }
  const latencyProblem = pluginLatencyProblem(id, fields.latencyMs);
  if (latencyProblem !== null) return latencyProblem;
  const outsProblem = pluginOutsProblem(id, fields.outs);
  if (outsProblem !== null) return outsProblem;
  const permissionsProblem = pluginPermissionsProblem(id, fields.permissions);
  if (permissionsProblem !== null) return permissionsProblem;
  for (const field of ['description', 'author', 'license'] as const) {
    const value = fields[field];
    if (value !== undefined && typeof value !== 'string') {
      return `plugin "${id}" has a ${field} that is not text. Remove it or make it a string.`;
    }
  }
  return null;
}

/**
 * The validated manifest, or the reason it cannot load.
 *
 * The success value is a fresh object with trimmed text and defaulted params,
 * so callers never share (or mutate) the input.
 */
export function validatePluginManifest(
  raw: unknown,
): { ok: true; manifest: TrackletPluginManifest } | { ok: false; error: string } {
  const problem = pluginManifestProblem(raw);
  if (problem !== null) return { ok: false, error: problem };
  const fields = raw as Record<string, unknown>;
  const params = Array.isArray(fields.params)
    ? (fields.params as PluginParamDecl[]).map((param) => ({ ...param }))
    : [];
  const manifest: TrackletPluginManifest = {
    id: (fields.id as string).trim(),
    name: (fields.name as string).trim(),
    version: (fields.version as string).trim(),
    kind: fields.kind as PluginKind,
    entry: (fields.entry as string).trim(),
    apiVersion: fields.apiVersion as number,
    params,
  };
  if (typeof fields.latencyMs === 'number') manifest.latencyMs = fields.latencyMs;
  if (Array.isArray(fields.outs)) manifest.outs = (fields.outs as string[]).map((name) => name.trim());
  if (Array.isArray(fields.permissions)) {
    manifest.permissions = (fields.permissions as string[]).map((name) => name.trim() as PluginPermission);
  }
  for (const field of ['description', 'author', 'license'] as const) {
    const value = fields[field];
    if (typeof value === 'string' && value.trim() !== '') {
      manifest[field] = value.trim();
    }
  }
  return { ok: true, manifest };
}

/**
 * Read a stored plugin library out of untrusted storage, and drop anything
 * wrong.
 *
 * Lenient on purpose (see `parseUserKits`): storage is shared, hand-editable,
 * and outlives the build that wrote it, so a stale entry must not cost the
 * user the plugins that still read. An entry that fails validation, duplicates
 * an id already kept, or targets a newer host API than this build is dropped.
 */
export function parsePluginManifests(raw: unknown): TrackletPluginManifest[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackletPluginManifest[] = [];
  for (const entry of raw) {
    const checked = validatePluginManifest(entry);
    if (!checked.ok) continue;
    if (out.some((kept) => kept.id === checked.manifest.id)) continue;
    out.push(checked.manifest);
  }
  return out;
}

/**
 * The one-line example a plugin contributes to `window.__tracklet.trackletPlugins`,
 * so an agent can act on it without memorizing docs.
 */
export function pluginExample(manifest: TrackletPluginManifest): string {
  switch (manifest.kind) {
    case 'instrument':
      return `track 1 voice plugin:${manifest.id}`;
    case 'effect':
      return `track 1 fx ${manifest.id} 45`;
    case 'generator':
      // The line must PARSE, so it names the composer's word rather than its
      // id: the two proofs this build seats are `euclid` (a rhythm for a pad)
      // and `bass` (a bassline for a channel), and anything else seats the
      // rhythm writer — the one composer that needs no chord loop.
      if (manifest.id === 'com.example.bass-follow') return 'generate bass 0 2';
      return 'generate euclid pad 1 5';
    case 'panel':
      // The line must PARSE, so it names the panel the way the `page` word
      // reads it: `page plugin:<id>`, the voice-plugin bargain one scope over.
      return `page plugin:${manifest.id}`;
    case 'io':
      return `import ${manifest.id}`;
  }
}

/**
 * The one problem with a manifest's latency claim, or null when it stands.
 *
 * Absent is 0 (most renders start at their attack), and the claim is whole
 * milliseconds inside the scheduler's look-ahead — a fractional or negative
 * claim, or one no schedule could honour, is a refusal with the range, the
 * manifest path's bargain: cheap to fix at install, wrong to guess at play.
 */
export function pluginLatencyProblem(pluginId: string, value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_PLUGIN_LATENCY_MS) {
    return `plugin "${pluginId}" declares latencyMs ${quoteShort(value)}, but latency is 0-${MAX_PLUGIN_LATENCY_MS} whole milliseconds.`;
  }
  return null;
}

/**
 * A manifest's latency in seconds, for the two clocks that schedule it.
 *
 * Clamped rather than trusted, because manifests also arrive hand-built in
 * code (built-ins, tests) past the validated path: a wild claim costs the
 * compensation, never the note. Absent is 0 — no claim, no shift.
 */
export function pluginLatencySec(manifest: Pick<TrackletPluginManifest, 'latencyMs'>): number {
  const ms = manifest.latencyMs ?? 0;
  if (!Number.isFinite(ms)) return 0;
  return Math.min(MAX_PLUGIN_LATENCY_MS, Math.max(0, ms)) / 1000;
}

/**
 * The one problem with a manifest's output names, or null when they stand.
 *
 * Absent is undeclared (the host falls back to `out1..N`), and a declared
 * list is 1–8 unique file-safe words — the names per-out stems will carry,
 * so blanks, doubles and names no file row fits are refusals with the fix,
 * the manifest path's bargain: cheap to fix at install, wrong to guess at
 * export.
 */
export function pluginOutsProblem(pluginId: string, value: unknown): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PLUGIN_OUTS) {
    return `plugin "${pluginId}" declares outs ${quoteShort(value)}, but outs is 1-${MAX_PLUGIN_OUTS} names.`;
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '' || entry.trim().length > MAX_PLUGIN_OUT_NAME) {
      return `plugin "${pluginId}" has an out name ${quoteShort(entry)}. Use a file-safe word of 1-${MAX_PLUGIN_OUT_NAME} characters, e.g. "kick".`;
    }
    const name = entry.trim();
    if (seen.has(name)) return `plugin "${pluginId}" declares out "${name}" twice.`;
    seen.add(name);
  }
  return null;
}

/**
 * The one problem with a manifest's permission claim, or null when it stands.
 *
 * Absent (or empty) is none — the audio path's whole world. A declared list
 * names only what the host grants (`network`, `storage`), each once: anything
 * else is a refusal naming the set, the manifest path's bargain — cheap to
 * fix at install, wrong to guess at play.
 */
export function pluginPermissionsProblem(pluginId: string, value: unknown): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) {
    return `plugin "${pluginId}" declares permissions ${quoteShort(value)}, but permissions is a list like ["storage"]. Ask for any of: ${PLUGIN_PERMISSIONS.join(', ')}.`;
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !(PLUGIN_PERMISSIONS as readonly string[]).includes(entry.trim())) {
      return `plugin "${pluginId}" asks for permission ${quoteShort(entry)}. The host grants: ${PLUGIN_PERMISSIONS.join(', ')}.`;
    }
    const name = entry.trim();
    if (seen.has(name)) return `plugin "${pluginId}" asks for "${name}" twice.`;
    seen.add(name);
  }
  return null;
}

/**
 * The name of output bus `index`: the manifest's, or `out1..N` undeclared.
 *
 * Clamped rather than trusted, because renders also arrive hand-built past
 * the validated path: a wild index still names something file-safe.
 */
export function pluginOutName(manifest: Pick<TrackletPluginManifest, 'outs'>, index: number): string {
  const declared = manifest.outs?.[index];
  if (typeof declared === 'string' && declared !== '') return declared;
  return `out${Math.max(0, Math.floor(index)) + 1}`;
}

function pluginIdProblem(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'a plugin manifest needs an id like "com.example.supersaw" (reverse-DNS, lowercase, dots).';
  }
  const id = value.trim();
  const labels = id.split('.');
  const labelOk = (label: string): boolean => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label);
  if (labels.length < 2 || !labels.every(labelOk)) {
    return `plugin id "${id}" is not reverse-DNS. Use lowercase letters, digits and hyphens with at least one dot, e.g. "com.example.supersaw".`;
  }
  if (id.length > 64) {
    return `plugin id "${id}" is longer than 64 characters. Shorten it.`;
  }
  return null;
}

function pluginParamsProblem(pluginId: string, raw: unknown): string | null {
  if (!Array.isArray(raw)) {
    return `plugin "${pluginId}" has params that are not a list. Use a list of { id, label, min, max, default }.`;
  }
  if (raw.length > MAX_PLUGIN_PARAMS) {
    return `plugin "${pluginId}" declares ${raw.length} params, but at most ${MAX_PLUGIN_PARAMS} fit.`;
  }
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return `plugin "${pluginId}" has a param that is not an object. Each param is { id, label, min, max, default }.`;
    }
    const param = entry as Record<string, unknown>;
    if (typeof param.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(param.id)) {
      return `plugin "${pluginId}" has a param id ${quoteShort(param.id)}. Use a lowercase word starting with a letter, e.g. "cutoff".`;
    }
    if (seen.has(param.id)) {
      return `plugin "${pluginId}" declares param "${param.id}" twice.`;
    }
    seen.add(param.id);
    if (param.id.length > MAX_PLUGIN_PARAM_ID) {
      return `plugin "${pluginId}" param "${param.id}" is longer than ${MAX_PLUGIN_PARAM_ID} characters.`;
    }
    if (typeof param.label !== 'string' || param.label.trim() === '' || param.label.trim().length > MAX_PLUGIN_PARAM_LABEL) {
      return `plugin "${pluginId}" param "${param.id}" needs a label of 1-${MAX_PLUGIN_PARAM_LABEL} characters.`;
    }
    for (const bound of ['min', 'max', 'default'] as const) {
      if (typeof param[bound] !== 'number' || !Number.isFinite(param[bound])) {
        return `plugin "${pluginId}" param "${param.id}" needs ${bound} to be a number 0-100.`;
      }
    }
    const min = param.min as number;
    const max = param.max as number;
    const fallback = param.default as number;
    if (min < 0 || max > 100 || min >= max) {
      return `plugin "${pluginId}" param "${param.id}" needs 0 <= min < max <= 100.`;
    }
    if (fallback < min || fallback > max) {
      return `plugin "${pluginId}" param "${param.id}" has a default outside min-max. Put it between ${min} and ${max}.`;
    }
  }
  return null;
}

/** MAJOR.MINOR.PATCH, all digits — the only version shape songs pin. */
function isSemver(value: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(value.trim());
}

function quoteShort(value: unknown): string {
  if (typeof value === 'string') return `"${value.slice(0, 32)}"`;
  if (value === null || value === undefined) return 'nothing';
  return String(value).slice(0, 32);
}
