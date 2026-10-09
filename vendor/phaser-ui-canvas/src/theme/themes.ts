/**
 * themes — the framework's looks, as data, plus the one that is live.
 *
 * A theme is a named `UiColors` palette. The ten shipped here are lifted
 * straight from the original game's editor themes (their `chrome` halves,
 * name for name) — they are the places that project goes, spelled in thirty
 * colours, and they are what makes "theme switching" a real feature rather
 * than a tint. An app that only ever wants one look can ignore all of this and
 * call `drawPanel` with nothing; the default is the shipped reliquary.
 *
 * The active theme is module-level state, because a UI framework draws chrome
 * in sixty places and not one of them has an opinion about which theme is on:
 * they ask `activeColors()` at draw time. `setActiveTheme` is the single
 * writer, and `onThemeChanged` is how a scene hears about a change — panels
 * hold *coloured draw commands* and Text objects *cache their colour*, so a
 * theme change is usually a redraw of the chrome, not a recolour (see the
 * README's theme section).
 *
 * This file is Phaser-free on purpose so the palettes and their rules can be
 * unit tested.
 */

import { DEFAULT_COLORS, type PanelPalette, type UiColors } from './palette';

/** A named look. `extras` is the app's own slot for non-panel colours. */
export interface UiTheme<Extras = unknown> {
  id: string;
  /** The name on its row in a theme picker. Short: the row is a field. */
  name: string;
  /** What it is, in one line, for a status bar or a tooltip. */
  note: string;
  colors: UiColors;
  /** Optional app-defined colour set (overlay marks, map washes, ...). */
  extras?: Extras;
}

/**
 * A theme's `extras` is opaque to the framework, so the shipped list is typed
 * with `unknown`. Apps that ship their own themed extras can re-type via the
 * generic on `themeById<T>`.
 */
export type BuiltinTheme = UiTheme<unknown>;

/**
 * The ten shipped themes.
 *
 * Chosen to be places rather than ten tints of one navy: the reliquary the
 * default look is made of, the moor, the deep water, the catacomb, the ooze's
 * own bioluminescence, the forge, the fungal deep, the bog, the nest, and —
 * last, and the one that is not a place — parchment, which is light on purpose
 * for working over a map whose own darkness is the problem. It is also the one
 * theme whose text is dark on light, which is why any contrast rule in an app
 * should be about the GAP between a colour and its panel rather than about
 * which of the two is brighter.
 */
export const THEMES: readonly BuiltinTheme[] = [
  {
    id: 'reliquary',
    name: 'RELIQUARY',
    note: 'STONE, OOZE AND WARD: THE FRAMEWORK AS IT SHIPPED.',
    colors: DEFAULT_COLORS,
  },
  {
    id: 'moorland',
    name: 'MOORLAND',
    note: 'COLD SLATE AND MOSS: A STORMY PLAIN\'S OWN LIGHT.',
    colors: {
      panelFill: 0x080b0a,
      panelFillAlpha: 1,
      stone: 0x2e3a35,
      stoneHi: 0x46564d,
      ink: 0x02040a,
      ooze: 0x9cbf3f,
      oozeDim: 0x6f8a33,
      ward: 0x8fb0a8,
      textPrimary: 0xdde3d0,
      textDim: 0x87937f,
      textGreen: 0x9cbf3f,
      danger: 0xc4693f,
      wordmark: 0x9cbf3f,
    },
  },
  {
    id: 'the-deep',
    name: 'THE DEEP',
    note: 'INK TEAL AND AQUA, FOR HOURS UNDERWATER.',
    colors: {
      panelFill: 0x040a10,
      panelFillAlpha: 1,
      stone: 0x1f3a44,
      stoneHi: 0x37606d,
      ink: 0x01040a,
      ooze: 0x46d6c0,
      oozeDim: 0x2a8f84,
      ward: 0x6fb6c9,
      textPrimary: 0xcfe6e6,
      textDim: 0x7794a0,
      textGreen: 0x6fe3b0,
      danger: 0xc2604a,
      wordmark: 0x46d6c0,
    },
  },
  {
    id: 'ossuary',
    name: 'OSSUARY',
    note: 'BONE AND AMBER ON BROWN-BLACK, FOR THE CATACOMBS.',
    colors: {
      panelFill: 0x0d0a06,
      panelFillAlpha: 1,
      stone: 0x453a2a,
      stoneHi: 0x64553c,
      ink: 0x070502,
      ooze: 0xd8b25a,
      oozeDim: 0x9a7c38,
      ward: 0xc0a37a,
      textPrimary: 0xe4d9be,
      textDim: 0x92836a,
      textGreen: 0xd8b25a,
      danger: 0xb5452f,
      wordmark: 0xd8b25a,
    },
  },
  {
    id: 'underglow',
    name: 'UNDERGLOW',
    note: 'INDIGO AND MAGENTA: A LIVING GLOW IN THE DARK.',
    colors: {
      panelFill: 0x0a0614,
      panelFillAlpha: 1,
      stone: 0x2f2450,
      stoneHi: 0x4a3a75,
      ink: 0x05030c,
      ooze: 0xd94fc0,
      oozeDim: 0x8f2f80,
      ward: 0x74d8ff,
      textPrimary: 0xe0d8f0,
      textDim: 0x8d83ab,
      textGreen: 0x64e0c0,
      danger: 0xd05a5a,
      wordmark: 0xd94fc0,
    },
  },
  {
    id: 'forge',
    name: 'FORGE',
    note: 'IRON PANELS AND AN EMBER ACCENT.',
    colors: {
      panelFill: 0x0c0b0a,
      panelFillAlpha: 1,
      stone: 0x3b3a39,
      stoneHi: 0x585452,
      ink: 0x070605,
      ooze: 0xff9a3c,
      oozeDim: 0xa8601f,
      ward: 0x8f8b86,
      textPrimary: 0xe0dbd4,
      textDim: 0x8d8880,
      textGreen: 0xd8a34a,
      danger: 0xc04030,
      wordmark: 0xff9a3c,
    },
  },
  {
    id: 'mycelium',
    name: 'MYCELIUM',
    note: 'SPORE PINK IN A VIOLET DARK, LIT FROM INSIDE.',
    colors: {
      panelFill: 0x0d0812,
      panelFillAlpha: 1,
      stone: 0x3a2f45,
      stoneHi: 0x584668,
      ink: 0x07040a,
      ooze: 0xe89ac8,
      oozeDim: 0x9a5f85,
      ward: 0xc9b8d8,
      textPrimary: 0xe8dff0,
      textDim: 0x95889f,
      textGreen: 0x8fe0a8,
      danger: 0xd05a6a,
      wordmark: 0xe89ac8,
    },
  },
  {
    id: 'boghollow',
    name: 'BOGHOLLOW',
    note: 'SWAMP OCHRE AND DANK GREEN, FOR WADING IN.',
    colors: {
      panelFill: 0x0a0b06,
      panelFillAlpha: 1,
      stone: 0x3a3823,
      stoneHi: 0x565331,
      ink: 0x050502,
      ooze: 0xc9a83f,
      oozeDim: 0x8a7226,
      ward: 0x7f9a5a,
      textPrimary: 0xe2dfc6,
      textDim: 0x8f8d74,
      textGreen: 0x9fbf5f,
      danger: 0xb5542f,
      wordmark: 0xc9a83f,
    },
  },
  {
    id: 'nest',
    name: 'NEST',
    note: 'CHITIN AND GLASS-WING PALE.',
    colors: {
      panelFill: 0x0e0906,
      panelFillAlpha: 1,
      stone: 0x443026,
      stoneHi: 0x644737,
      ink: 0x080503,
      ooze: 0xcfe0e8,
      oozeDim: 0x7f96a0,
      ward: 0x9a8f70,
      textPrimary: 0xe6ddd0,
      textDim: 0x93857a,
      textGreen: 0x8fd4a8,
      danger: 0xc04a3a,
      wordmark: 0xcfe0e8,
    },
  },
  {
    id: 'parchment',
    name: 'PARCHMENT',
    note: 'BONE PANELS AND INK: FOR WORK OVER SOMETHING DARK.',
    colors: {
      panelFill: 0xd8cfae,
      panelFillAlpha: 1,
      stone: 0x8a7f63,
      stoneHi: 0xf0e8cd,
      ink: 0x2a2318,
      ooze: 0x8f4a1f,
      oozeDim: 0xb08a5a,
      ward: 0x5f7a8a,
      textPrimary: 0x2a2318,
      textDim: 0x6f6551,
      textGreen: 0x4f6a2f,
      danger: 0x9a3020,
      wordmark: 0x8f4a1f,
    },
  },
];

/** The theme a fresh install draws with. */
export const DEFAULT_THEME_ID = 'reliquary';

/** The theme with this id, or the shipped one when nothing has it. */
export function themeById<T = unknown>(id: string): UiTheme<T> {
  return (THEMES.find((t) => t.id === id) ?? THEMES[0]) as UiTheme<T>;
}

/** Its index in the list, which is what ← / → step through. */
export function themeIndex(id: string): number {
  const i = THEMES.findIndex((t) => t.id === id);
  return i < 0 ? 0 : i;
}

/** The next/previous theme id, wrapping — for a picker's arrow keys. */
export function neighborThemeId(id: string, dir: 'next' | 'prev'): string {
  const i = themeIndex(id);
  const n = THEMES.length;
  const next = dir === 'next' ? (i + 1) % n : (i - 1 + n) % n;
  return THEMES[next].id;
}

/** The theme the framework is drawing with right now. */
let current: BuiltinTheme = THEMES[0];

/** The active theme, whole. */
export function activeTheme(): BuiltinTheme {
  return current;
}

/** Point the framework at a theme. Returns the theme that is now active. */
export function setActiveTheme(id: string): BuiltinTheme {
  current = themeById(id);
  for (const cb of listeners) cb(current);
  return current;
}

/** The panels and their text, as they are right now. */
export function activeColors(): UiColors {
  return current.colors;
}/**
 * Just the panel half — what a framed panel is made of. A painter that only
 * frames a box asks for this, so it cannot depend on a lock it does not need.
 */
export function activePalette(): PanelPalette {
  return current.colors;
}

const listeners = new Set<(theme: BuiltinTheme) => void>();

/**
 * Hear about theme changes. Returns an unsubscribe function. Use it to redraw
 * chrome when the theme moves (a rebuild, not a recolour).
 */
export function onThemeChanged(cb: (theme: BuiltinTheme) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
