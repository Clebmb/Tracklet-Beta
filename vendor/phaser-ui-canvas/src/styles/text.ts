/**
 * text — the framework's text factory.
 *
 * One face for small UI (Silkscreen) and two display faces for headings that
 * want a little character (Alagard) or a chunky banner-like wordmark
 * (Unbalanced), all pixel/bitmap fonts. Text is snapped to whole pixels and
 * drawn at a high resolution so it stays crisp under the canvas's
 * nearest-neighbour upscaling — the same trick the original UI used.
 *
 * The default colour is the active theme's primary text, so switching themes
 * moves the text with the panels.
 */

import type Phaser from 'phaser';
import { intToCss } from './color';
import { activeColors } from '../theme/themes';
import { uiPx } from './scale';

/**
 * The framework's faces: one for small UI, two display faces an app can reach
 * for when it wants a wordmark to look like the family's banners.
 *
 *   silkscreen  the UI face — designed at 1px strokes, crisp from 8px up
 *   alagard     pixel blackletter, for a heading that wants a little character
 *   unbalanced  heavy display face with narrow, high contrast strokes — what
 *               the Noislet wordmark is set in
 */
export type UiFont = 'silkscreen' | 'alagard' | 'unbalanced';

/** The CSS family stack for each face (with a sane fallback). */
export function uiFontFamily(font: UiFont = 'silkscreen'): string {
  switch (font) {
    case 'alagard': return 'Alagard, serif';
    case 'unbalanced': return 'Unbalanced, serif';
    default: return 'Silkscreen, monospace';
  }
}

export interface UiTextOptions {
  /**
   * Font size in DESIGN UNITS, multiplied by the active UI scale (`uiPx`).
   * Default 8 — the UI grid. Coordinates and wrap widths are canvas px.
   */
  size?: number;
  /** Text colour as a packed 0xRRGGBB. Default: the active theme's primary. */
  color?: number;
  /** Which face. Default 'silkscreen'. */
  font?: UiFont;
  /** Extra alpha (1 = opaque). */
  alpha?: number;
  /** Text origin; default top-left (0,0). */
  origin?: { x: number; y: number };
  /** Rasterization resolution; default 4 for crisp upscaling. */
  resolution?: number;
  /** Word-wrap width in canvas px, for body copy. */
  wordWrapWidth?: number;
}

/**
 * Create a pixel-snapped Text. Coordinates are rounded so glyphs land on the
 * pixel grid, and the object is created through the scene's display list like
 * any other game object (so it participates in depth/containers normally).
 */
export function uiText(
  scene: Phaser.Scene,
  x: number, y: number,
  content: string,
  opts: UiTextOptions = {},
): Phaser.GameObjects.Text {
  const size = uiPx(opts.size ?? 8);
  const color = intToCss(opts.color ?? activeColors().textPrimary);
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: uiFontFamily(opts.font),
    fontSize: `${size}px`,
    color,
  };
  if (opts.wordWrapWidth !== undefined) {
    style.wordWrap = { width: opts.wordWrapWidth, useAdvancedWrap: true };
  }
  const text = scene.add.text(Math.round(x), Math.round(y), content, style);
  const origin = opts.origin ?? { x: 0, y: 0 };
  text.setOrigin(origin.x, origin.y);
  text.setResolution(opts.resolution ?? 4);
  if (opts.alpha !== undefined) text.setAlpha(opts.alpha);
  return text;
}

/**
 * Format seconds as `H:MM:SS` — the clock format the original menus used for
 * playtime, kept because it is a common thing a UI needs and it is small.
 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
