/**
 * plugins/panel — what a plugin with UI IS, before it draws anything.
 *
 * An instrument renders notes, an effect processes them, a generator writes
 * them; a panel SHOWS something. Its whole contract is one mount:
 *
 *   mount(el, api) -> { unmount, update? }
 *
 * `el` is the panel's OWN element — an empty box the host owns, floating over
 * the canvas the way the script panel floats over the tracker. The panel may
 * fill that box and nothing else: no global CSS, no `document.body` reaches,
 * no selectors that escape the subtree (the `scopePanelElement` bargain
 * below). `unmount` removes everything the mount added, so uninstalling a
 * plugin cannot break the seven built-in pages; `update` re-renders on a song
 * replace, a theme change or a text-scale change, so a panel survives all
 * three without remounting.
 *
 * The api is capabilities, not access: a read-only digest of the song, the
 * theme tokens the panel must honor (F9 themes plus text scale), its own
 * params, a read-only transport snapshot, a notice line, and a `close` that
 * asks the host to put the panel away. A panel never edits the song directly
 * and never drives transport — it reads, it shows, and it closes. Editing
 * from a panel is a later milestone, not this one.
 *
 * This module is Phaser-free. It types `el` as `HTMLElement` but only touches
 * the structural half (children, append, remove, style) — so the contract is
 * unit tested in Node with a fake element, and the browser runs the same code
 * against the real thing.
 */

import type { TrackletPluginManifest } from './manifest';
import type { PluginParamValues } from './instrument';

/** A plugin page reference, e.g. `plugin:com.example.meter-panel`. */
export const PANEL_PAGE_PREFIX = 'plugin:';

/** The reference a `page` line holds for a plugin panel. */
export function panelPageRef(id: string): string {
  return `${PANEL_PAGE_PREFIX}${id}`;
}

/** Whether this `page` value names a plugin panel rather than a built-in screen. */
export function isPanelPageRef(value: string): boolean {
  return value.startsWith(PANEL_PAGE_PREFIX);
}

/**
 * The plugin id inside a `plugin:<id>` page reference, or null when the value
 * is not a well-formed reference (missing id, whitespace, a second prefix).
 * Null is not an error here — it means "not a panel word", and the caller
 * keeps reading the value as a built-in page name.
 */
export function parsePanelRef(value: string): string | null {
  if (!value.startsWith(PANEL_PAGE_PREFIX)) return null;
  const id = value.slice(PANEL_PAGE_PREFIX.length).trim();
  if (id === '' || /\s/.test(id) || id.includes(PANEL_PAGE_PREFIX)) return null;
  return id;
}

/**
 * Who shows a panel reference right now: the panel when it is known, otherwise
 * nobody — with the notice line the app shows so the substitution is said in
 * words, never silent. Unlike a voice there is no built-in fallback screen: a
 * missing panel leaves the tracker showing, which is the screen a song opened
 * onto.
 */
export function resolvePanelRef(
  ref: string,
  known: readonly { id: string; enabled: boolean }[],
): { kind: 'panel'; id: string } | { kind: 'tracker-fallback'; id: string; notice: string } {
  const id = parsePanelRef(ref) ?? ref;
  const entry = known.find((panel) => panel.id === id);
  if (entry !== undefined && entry.enabled) return { kind: 'panel', id };
  if (entry !== undefined) {
    return { kind: 'tracker-fallback', id, notice: `panel "${id}" is disabled - the tracker stays up until it is enabled.` };
  }
  return { kind: 'tracker-fallback', id, notice: `panel "${id}" is not installed - the tracker stays up until it is.` };
}

/** One channel as a panel reads it: its name and how many notes it holds. */
export interface PanelTrackView {
  name: string;
  notes: number;
}

/** The song as a panel may read it: counts and names, never cells. */
export interface PanelSongView {
  title: string;
  tracks: PanelTrackView[];
  machineHits: number;
}

/** The look a panel must honor: F9 theme tokens plus text scale. */
export interface PanelTheme {
  text: string;
  background: string;
  accent: string;
  textScale: number;
}

/** Transport as a panel may read it: position and motion, never control. */
export interface PanelTransport {
  playing: boolean;
  bar: number;
}

/**
 * What a panel may touch. Small on purpose: every capability here is
 * auditable, and anything not here is not available.
 */
export interface PanelApi {
  /** The song's digest, replaced wholesale on every `update`. */
  song: PanelSongView;
  /** The theme tokens, replaced wholesale on every `update`. */
  theme: PanelTheme;
  /** The panel's own knob values, host-clamped 0–100. */
  params: PluginParamValues;
  /** Where transport is, read-only. */
  transport: PanelTransport;
  /** A notice line, routed to the app's notice channel. */
  notify(message: string): void;
  /** Ask the host to put the panel away (back to the tracker). */
  close(): void;
}

/** A mounted panel: how to put it away, and how to repaint it. */
export interface MountedPanel {
  /** Remove everything the mount added, leaving siblings alone. */
  unmount(): void;
  /** Re-render from a fresh api (song replace, theme or text-scale change). */
  update?(api: PanelApi): void;
}

/**
 * A panel plugin: its manifest plus the one mount.
 *
 * `mount` fills `el` and hands back its own teardown. It must be scoped (only
 * `el`'s subtree), deterministic (same api, same box), and total (never
 * throws for a song with no notes — an empty song is a panel's first screen).
 */
export interface PanelPlugin {
  manifest: TrackletPluginManifest;
  mount(el: HTMLElement, api: PanelApi): MountedPanel;
}

/**
 * The class a panel's box carries: `tpl-p-<id>` with dots and case folded out,
 * so one plugin's styles cannot leak onto another's — or onto the app.
 */
export function panelClass(id: string): string {
  const slug = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `tpl-p-${slug === '' ? 'panel' : slug}`;
}

/**
 * Mark a box as one plugin's own: its scoped class plus a data attribute
 * naming the id, so a test (or a reviewer) can prove a mount stayed inside.
 */
export function scopePanelElement(el: HTMLElement, pluginId: string): void {
  el.classList.add(panelClass(pluginId));
  el.setAttribute('data-tracklet-panel', pluginId);
}

/** The one-line label under a panel row: id, version and params. */
export function describePanel(plugin: PanelPlugin): string {
  const params = plugin.manifest.params.length;
  return `${plugin.manifest.id}@${plugin.manifest.version} ${params} param${params === 1 ? '' : 's'}`;
}

/**
 * Installed panel code, seated this session.
 *
 * Built-ins arrive through a static import (`builtIn.ts`) — a dynamically
 * imported path outside `src/` would work in development and go missing in
 * the built app. Installed panels arrive here instead: the caller owns
 * fetching the bytes (a user-approved path, dynamic `import()`, never
 * `eval` — the M0 loading rule) and seats the module through the loader's
 * `seatPanelModule`, and the bank remembers the code that passed. The scene
 * reads built-ins first and this bank second, so a bundled panel always wins
 * an id clash and an installed panel fills the gaps the bundle leaves.
 */
export interface PanelCodeBank {
  plugins: PanelPlugin[];
}

/** An empty bank: no installed code seated yet. */
export function createPanelCodeBank(): PanelCodeBank {
  return { plugins: [] };
}

/**
 * Seat installed code, replacing any earlier seating of the same id: seating
 * a newer copy is an upgrade the caller records, never a background swap.
 */
export function seatPanelCode(bank: PanelCodeBank, plugin: PanelPlugin): void {
  const at = bank.plugins.findIndex((seated) => seated.manifest.id === plugin.manifest.id);
  if (at < 0) bank.plugins.push(plugin);
  else bank.plugins[at] = plugin;
}

/**
 * Unseat installed code, e.g. beside an uninstall: the id leaves the bank so
 * a channel naming it falls back with a notice instead of playing remembered
 * code. Unknown ids are a no-op — forgetting what was never seated is not an
 * error, it is nothing to do.
 */
export function unseatPanelCode(bank: PanelCodeBank, id: string): void {
  bank.plugins = bank.plugins.filter((seated) => seated.manifest.id !== id);
}

/**
 * The code behind an id: the bundle first, installed seatings second, null
 * when neither carries it. Null is not an error here — it means "installed
 * but unloaded", and the caller says so in words with the tracker staying
 * up (`panelCodeMissingNotice`).
 */
export function findPanelCode(
  bank: PanelCodeBank,
  builtIn: readonly PanelPlugin[],
  id: string,
): PanelPlugin | null {
  return (
    builtIn.find((plugin) => plugin.manifest.id === id) ??
    bank.plugins.find((plugin) => plugin.manifest.id === id) ??
    null
  );
}

/** Every id with code behind it, bundle first: what the dropdown may offer. */
export function panelCodeIds(bank: PanelCodeBank, builtIn: readonly PanelPlugin[]): string[] {
  const ids = builtIn.map((plugin) => plugin.manifest.id);
  for (const plugin of bank.plugins) {
    if (!ids.includes(plugin.manifest.id)) ids.push(plugin.manifest.id);
  }
  return ids;
}

/**
 * Where transport is, from the clock's own readings: playing plus the step
 * currently sounding over the song's row count. Stopped is bar 1 — the bar
 * the song restarts from — and a song with no rows cannot divide, so it is
 * bar 1 too. The scene's overlay api and its once-per-frame repaint both
 * read this one function, so the box and the transport cannot disagree.
 */
export function panelTransport(playing: boolean, sounding: number, rows: number): PanelTransport {
  return {
    playing,
    bar: sounding < 0 || rows <= 0 ? 1 : 1 + Math.floor(sounding / rows),
  };
}
