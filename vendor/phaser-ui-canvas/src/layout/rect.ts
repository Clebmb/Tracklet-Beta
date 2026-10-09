/**
 * rect — plain rectangle math for building and hit-testing UI.
 *
 * Deliberately Phaser-free: the layout of a menu is arithmetic, and arithmetic
 * is worth testing. Scenes convert a `Rect` to a Phaser Geom.Rectangle only
 * when an API demands one.
 */

import type { Rect } from '../types';

/** Build a rect. */
export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function right(r: Rect): number { return r.x + r.width; }
export function bottom(r: Rect): number { return r.y + r.height; }
export function centerX(r: Rect): number { return r.x + r.width / 2; }
export function centerY(r: Rect): number { return r.y + r.height / 2; }

/** True when the point is inside the rect (half-open on the far edges). */
export function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < right(r) && y >= r.y && y < bottom(r);
}

/** Shrink a rect by `dx`/`dy` on each side. */
export function inset(r: Rect, dx: number, dy = dx): Rect {
  return rect(r.x + dx, r.y + dy, Math.max(0, r.width - dx * 2), Math.max(0, r.height - dy * 2));
}

/** A sub-rect at an absolute offset inside `r`, clipped to `r`. */
export function sub(r: Rect, x: number, y: number, width: number, height: number): Rect {
  const maxW = right(r) - (r.x + x);
  const maxH = bottom(r) - (r.y + y);
  return rect(r.x + x, r.y + y, Math.max(0, Math.min(width, maxW)), Math.max(0, Math.min(height, maxH)));
}

/** Split a rect into `count` equal columns with `gap` px between them. */
export function columns(r: Rect, count: number, gap = 0): Rect[] {
  if (count <= 0) return [];
  const total = r.width - gap * (count - 1);
  const w = total / count;
  return Array.from({ length: count }, (_, i) =>
    rect(r.x + i * (w + gap), r.y, w, r.height));
}

/** Split a rect into `count` equal rows with `gap` px between them. */
export function rows(r: Rect, count: number, gap = 0): Rect[] {
  if (count <= 0) return [];
  const total = r.height - gap * (count - 1);
  const h = total / count;
  return Array.from({ length: count }, (_, i) =>
    rect(r.x, r.y + i * (h + gap), r.width, h));
}

/** The y offset of each of `count` stacked rows of `rowH`, from `top`. */
export function rowOffsets(count: number, rowH: number, top = 0): number[] {
  return Array.from({ length: count }, (_, i) => top + i * rowH);
}

// --- sliders ---------------------------------------------------------------

/**
 * The track a slider row draws and is aimed at: an inset groove centred in the
 * row. `insetX` keeps the knob's travel inside the row, and `trackH` is the
 * groove height (the knob is drawn taller than this).
 */
export function sliderTrack(row: Rect, insetX = 0, trackH = 3): Rect {
  const w = Math.max(0, row.width - insetX * 2);
  const h = Math.min(trackH, row.height);
  return rect(row.x + insetX, row.y + Math.floor((row.height - h) / 2), w, h);
}

/**
 * A click at `x` on a track, as a 0..1 amount — or null when it missed the
 * track horizontally. The result is clamped, so a drag that runs past the end
 * pins to the end rather than wrapping.
 */
export function sliderHit(track: Rect, x: number): number | null {
  if (track.width <= 0) return null;
  const raw = (x - track.x) / track.width;
  if (raw < -0.5 || raw > 1.5) return null;
  return Math.max(0, Math.min(1, raw));
}

/** The x a knob sits at for a 0..1 fraction along its track. */
export function sliderKnobX(track: Rect, fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  return track.x + Math.round(f * track.width);
}

/** The filled part of a slider track for a 0..1 fraction. */
export function sliderFill(track: Rect, fraction: number): Rect {
  const f = Math.max(0, Math.min(1, fraction));
  return rect(track.x, track.y, Math.round(track.width * f), track.height);
}
