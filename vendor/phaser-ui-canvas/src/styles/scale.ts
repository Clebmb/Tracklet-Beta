/**
 * scale — the UI's global size knob.
 *
 * The framework is drawn on an 8px design grid: an 8px face, 11-12px headers,
 * 4px padding, 7x7 icons. That grid looks right on a laptop and small on a
 * television, and the answer is not to hand-edit several hundred call sites.
 * Instead every *size-like* value in the framework is expressed in DESIGN
 * UNITS and multiplied by one number here:
 *
 *   - `uiText({ size: 8 })` draws a 12px glyph when the scale is 1.5;
 *   - a `Panel`'s `headerH`/`padding`, a `Button`'s font size and its icon
 *     gutter, a `MenuListPanel`'s `rowH`, a `Window`'s title bar — all scale;
 *   - every internal offset that is a multiple of the grid (label centring,
 *     icon cells, knob width) is computed through `uiPx`.
 *
 * What does NOT scale is GEOMETRY the app hands over: x/y, widths, heights and
 * word-wrap widths are canvas pixels, exactly as before. A canvas is a fixed
 * number of pixels, so an app that scales its chrome up also has to re-lay its
 * panels out — this knob makes the *elements* bigger, not the canvas.
 *
 * At the default scale of 1 every formula below is the identity, so an app that
 * never calls `setUiScale` renders byte-for-byte as it always did.
 *
 *     import { setUiScale } from 'phaser-ui-canvas/styles';
 *     setUiScale(1.5);          // every panel, menu and button grows by half
 */

/** The scale the framework draws at until an app says otherwise. */
export const DEFAULT_UI_SCALE = 1;

let scale = DEFAULT_UI_SCALE;

/**
 * Set the global UI scale. Values that are not a finite positive number are
 * ignored, and the change affects everything created *after* the call — a
 * component reads the scale as it builds, so scaling at startup is the intended
 * use (re-laying out a live screen is the app's business, not the framework's).
 */
export function setUiScale(next: number): void {
  if (!Number.isFinite(next) || next <= 0) return;
  scale = next;
}

/** The active UI scale (1 by default). */
export function uiScale(): number {
  return scale;
}

/**
 * A design-grid length in canvas pixels — `uiPx(4)` is 4 at scale 1 and 6 at
 * scale 1.5. Round to whole pixels so nothing lands on a half-pixel and blurs.
 */
export function uiPx(units: number): number {
  return Math.round(units * scale);
}
