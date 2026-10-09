/**
 * overview — the mini-map down the grid's right edge: what the whole pattern
 * LOOKS like, and which step a click on it lands on.
 *
 * A pattern may be 512 steps long while the grid shows a window of about
 * twenty-five, so the little scroll bar down the edge was the only thing that
 * said "there is more music below". A thumb says how FAR; it does not say WHERE.
 * This turns that bar into a map: one mark per step that carries a note, so the
 * song is a shape you can read at a glance, with the window you are looking
 * through lit over it. Click it to go there.
 *
 * Pure and Phaser-free, like `stepView.ts`, so the density and the hit test are
 * checked without a canvas — the grid owns the pixels, this owns the arithmetic.
 */

import type { Pattern } from '../model';

/**
 * Notes sounding on each step, in order — the density the overview draws.
 *
 * A CELL counts once per note it holds, because a chord in one cell is several
 * voices on that step, exactly as `countNotes` counts them; the map is about
 * loudness in a broad sense, and one lit mark per voice is the honest version.
 */
export function overviewDensity(pattern: Pattern): number[] {
  return pattern.steps.map((row) => {
    let notes = 0;
    for (const cell of row) if (cell.note !== null) notes += 1 + cell.extra.length;
    return notes;
  });
}

/**
 * The step under a point in the overview strip.
 *
 * The strip is `height` pixels tall over `rows` steps, so the map is linear and
 * the answer is CLAMPED: a click on the last pixel is the last step, not a step
 * one past the end, and a click above the strip is the first step rather than a
 * negative row. Out-of-range is a normal answer here rather than a refusal,
 * because a pointer dragged past the edge should still land somewhere sensible.
 */
export function overviewRowAt(y: number, top: number, height: number, rows: number): number {
  if (rows <= 1 || height <= 0) return 0;
  const fraction = (y - top) / height;
  return Math.max(0, Math.min(rows - 1, Math.floor(fraction * rows)));
}

/**
 * The y to draw a step's mark at, inside a strip of `height` pixels.
 *
 * The inverse of `overviewRowAt`, and deliberately NOT forced to round-trip
 * exactly with it: when there are more steps than pixels several steps share a
 * pixel row, and a map that insisted on a perfect inverse would be lying about
 * how much it can show. Both are clamped to the strip.
 */
export function overviewYAt(row: number, top: number, height: number, rows: number): number {
  if (rows <= 0 || height <= 0) return top;
  const clamped = Math.max(0, Math.min(rows - 1, row));
  return top + Math.min(height - 1, Math.floor((clamped / rows) * height));
}

/**
 * How tall a step's mark is in the strip: one pixel per step when the pattern
 * fits, and one pixel when it does not.
 *
 * Returned rather than left to the caller so the "several steps share a pixel"
 * case is decided once. A min of one keeps a mark visible on a 512-step song
 * drawn in 200 pixels, where a true proportional height would round to nothing.
 */
export function overviewMarkH(height: number, rows: number): number {
  if (rows <= 0) return 1;
  return Math.max(1, Math.floor(height / rows));
}
