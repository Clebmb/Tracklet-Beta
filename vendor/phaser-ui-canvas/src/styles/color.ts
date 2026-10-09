/**
 * color — tiny helpers for working with 0xRRGGBB integers.
 *
 * Phaser-free so it can be used (and tested) anywhere, including pure models
 * that only need to compose a style string.
 */

/** `0x7ec850` -> `'#7ec850'`. Always six digits, lower-case. */
export function intToCss(color: number): string {
  return '#' + (color >>> 0 & 0xffffff).toString(16).padStart(6, '0');
}

/** Scale a colour's channels toward black (`0..1`, 1 = unchanged). */
export function shade(color: number, factor: number): number {
  const f = Math.max(0, Math.min(1, factor));
  const r = Math.round(((color >> 16) & 0xff) * f);
  const g = Math.round(((color >> 8) & 0xff) * f);
  const b = Math.round((color & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

/** Linear blend `a` -> `b` by `t` (`0..1`). */
export function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

/** Perceived luminance of a packed colour, 0..1 (for contrast decisions). */
export function luminance(color: number): number {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
