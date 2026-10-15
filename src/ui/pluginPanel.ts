/**
 * pluginPanel — which plugin page is floating over the canvas, if any.
 *
 * A plugin panel is an OVERLAY, not a screen: the tracker stays up behind it,
 * the way the script panel floats over the tracker rather than replacing it.
 * That is what keeps an uninstalled panel from breaking the seven built-in
 * pages — there is nothing to break, because the page underneath never left.
 *
 * This file is the SESSION, Phaser-free beside the view that will draw nothing
 * (the box is DOM): which reference is open, resolved through the same
 * `resolvePanelRef` the script word leans on, so a script, a dropdown and this
 * session cannot disagree about what "open" means. The scene owns the box, the
 * mount and the repaint; this owns the answer to "what is showing".
 */

import { panelPageRef, parsePanelRef, resolvePanelRef, seatPanelCode, type PanelCodeBank, type PanelTheme } from '../plugins/panel';
import { seatPanelModule } from '../plugins/loader';
import type { TrackletPluginManifest } from '../plugins/manifest';

/** The app colors a panel theme is digested from: body text, fill, accent. */
export interface PanelThemeSource {
  textPrimary: number;
  panelFill: number;
  ooze: number;
}

/** A palette number as the `#rrggbb` a panel's inline styles read. */
function toCss(color: number): string {
  return '#' + ((color >>> 0) & 0xffffff).toString(16).padStart(6, '0');
}

/**
 * The theme digest one mounted panel reads: the app's own tokens, as CSS.
 *
 * Pure so the contrast guard can hold every shipped theme to account without
 * a scene: body text on the panel fill at AA, the accent at AA-large — the
 * same bars the app's own rows keep (see `contrast.test.ts`). The scale
 * factor travels untouched; the panel decides what it means in pixels (the
 * meter proof reads `8px` per step), so a text-scale change repaints rather
 * than rescales the box.
 */
export function panelThemeDigest(colors: PanelThemeSource, textScale: number): PanelTheme {
  return {
    text: toCss(colors.textPrimary),
    background: toCss(colors.panelFill),
    accent: toCss(colors.ooze),
    textScale,
  };
}

/** A panel the session may show: its id and whether it may run. */
export interface PanelSeat {
  id: string;
  enabled: boolean;
}

/** Opening a panel: the id to mount, or the notice that refused it. */
export type PanelOpen = { ok: true; id: string } | { ok: false; notice: string };

/**
 * One overlay at a time. Opening resolves the reference — an unknown or
 * disabled id refuses with its notice and leaves whatever was showing alone —
 * and closing forgets it. The scene mounts on `ok` and unmounts on close.
 */
export class PluginPanelSession {
  private openRef: string | null = null;

  /** The reference showing now, or null for the bare tracker. */
  get current(): string | null {
    return this.openRef;
  }

  /** Show a panel reference. A refusal changes nothing about what is showing. */
  open(ref: string, known: readonly PanelSeat[]): PanelOpen {
    const resolved = resolvePanelRef(ref, known);
    if (resolved.kind === 'tracker-fallback') return { ok: false, notice: resolved.notice };
    this.openRef = ref;
    return { ok: true, id: resolved.id };
  }

  /** Put the panel away. Returns the reference that was showing, if any. */
  close(): string | null {
    const was = this.openRef;
    this.openRef = null;
    return was;
  }
}

/**
 * A panel the registry knows but this build has no code for: installed, yet
 * unopenable here. Said in words with the tracker staying up, the same bargain
 * as a missing instrument's fallback.
 */
export function panelCodeMissingNotice(id: string): string {
  return `panel "${id}" is installed but its code is not loaded in this build - the tracker stays up.`;
}

/** One seated panel as the page dropdown lists it: its reference plus its name. */
export interface PanelDropdownRow {
  /** The `page` value that opens it, e.g. `plugin:com.example.meter-panel`. */
  ref: string;
  /** The manifest name in dropdown caps, e.g. `METER`. */
  label: string;
}

/**
 * The dropdown's panel rows, after the seven built-in pages: one per known
 * panel, in the order handed over, so the list and the script word read the
 * same seating. A blank name falls back to the id rather than a blank row.
 */
export function panelDropdownRows(known: readonly { id: string; name: string }[]): PanelDropdownRow[] {
  return known.map((panel) => ({
    ref: panelPageRef(panel.id),
    label: panel.name.trim() === '' ? panel.id : panel.name.trim().toUpperCase(),
  }));
}

/** Where a dropdown pick goes: an overlay for a panel reference, a screen otherwise. */
export type PageSelection = { kind: 'panel'; ref: string } | { kind: 'page' };

/**
 * Route one dropdown pick. A `plugin:<id>` reference opens its overlay; any
 * other id is a built-in screen the scene switches to. Malformed references
 * (a bare `plugin:`, whitespace) are not panel words, so they stay pages and
 * the scene's own switch says the rest.
 */
export function routePageSelection(id: string): PageSelection {
  const parsed = parsePanelRef(id);
  if (parsed === null) return { kind: 'page' };
  return { kind: 'panel', ref: panelPageRef(parsed) };
}

/** Fetch one installed panel's entry module: dynamic `import()`, never `eval`. */
export type PanelCodeImporter = (id: string) => Promise<Record<string, unknown>>;

/** What loading the installed panels did, per id and in words. */
export interface PanelCodeLoad {
  /** Installed and seated: openable from the dropdown and the `page` word. */
  seated: string[];
  /** Arrived but untrustworthy: the loader's one named reason each. */
  refused: { id: string; error: string }[];
  /** No code behind the manifest: imports that threw, still openable never. */
  missing: string[];
}

/**
 * Load every installed panel's code and seat what passes.
 *
 * The manifests are the library's (names without code); the importer is the
 * caller's — a user-approved path turned into a module, which is the one
 * half of installing the trust rules leave to the UI (M6 owns that screen).
 * Without an importer there is nothing to fetch, so every manifest is
 * missing: today's behaviour, said as data rather than special-cased. A
 * refusal or a throwing import seats nothing, so one bad panel never costs
 * the rest their code.
 */
export async function loadInstalledPanelCode(
  manifests: readonly TrackletPluginManifest[],
  bank: PanelCodeBank,
  importer?: PanelCodeImporter,
): Promise<PanelCodeLoad> {
  const load: PanelCodeLoad = { seated: [], refused: [], missing: [] };
  for (const manifest of manifests) {
    if (manifest.kind !== 'panel') continue;
    if (importer === undefined) {
      load.missing.push(manifest.id);
      continue;
    }
    let module: Record<string, unknown>;
    try {
      module = await importer(manifest.id);
    } catch {
      load.missing.push(manifest.id);
      continue;
    }
    const seated = seatPanelModule(manifest as unknown, module);
    if (!seated.ok) {
      load.refused.push({ id: manifest.id, error: seated.error });
      continue;
    }
    seatPanelCode(bank, seated.seated.plugin);
    load.seated.push(manifest.id);
  }
  return load;
}
