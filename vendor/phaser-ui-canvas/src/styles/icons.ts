/**
 * icons — tiny 7x7 code-drawn glyphs.
 *
 * The original UI drew its category icons inline, hard-coded to the game's
 * categories. That is not reusable, so the framework keeps the DRAWING (cells on
 * a 7x7 design grid, centred) but makes the SET a registry: the framework
 * ships a handful of general-purpose glyphs, and an app registers its own
 * with `registerIcon` without touching the framework.
 *
 * A drawer is handed the Graphics, the icon centre, a colour and an alpha, and
 * fills cells relative to the centre via the `cell` helper convention —
 * `cell(g, cx, cy, 0, -2, 3, 1)` is a 3x1 bar two cells above centre.
 */

import type Phaser from 'phaser';
import { uiPx, uiScale } from './scale';

/** Draws one icon, centred on (cx, cy), in `color`. */
export type IconDrawer = (
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number,
  color: number,
  alpha: number,
) => void;

const registry = new Map<string, IconDrawer>();

/** Register (or replace) an icon. Returns an unregister function. */
export function registerIcon(name: string, drawer: IconDrawer): () => void {
  registry.set(name, drawer);
  return () => { registry.delete(name); };
}

export function hasIcon(name: string): boolean {
  return registry.has(name);
}

export function iconNames(): string[] {
  return [...registry.keys()];
}

/**
 * Draw a registered icon. Unknown names draw a single dim pixel rather than
 * nothing, so a missing glyph is visible instead of silent.
 */
export function drawIcon(
  g: Phaser.GameObjects.Graphics,
  name: string,
  cx: number, cy: number,
  color: number,
  alpha = 1,
): void {
  const drawer = registry.get(name);
  if (drawer) {
    drawer(g, cx, cy, color, alpha);
    return;
  }
  g.fillStyle(color, alpha * 0.5);
  g.fillRect(Math.round(cx), Math.round(cy), uiPx(1), uiPx(1));
}

/**
 * Helper for authoring drawers: cells on the 7x7 grid, relative to the icon
 * centre — `cell(g, cx, cy, 0, -2, 3, 1)` is a 3x1 bar two cells above centre.
 *
 * One cell is one design unit, so an icon grows with the UI scale; the cells are
 * laid out from a single snapped origin and each one ends where the next begins,
 * so a scaled icon has no seams in it.
 */
export function cell(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number,
  ox: number, oy: number, w = 1, h = 1,
): void {
  const s = uiScale();
  const x0 = Math.round(cx - 3 * s);
  const y0 = Math.round(cy - 3 * s);
  const at = (units: number) => Math.round(units * s);
  const x = at(ox + 3);
  const y = at(oy + 3);
  g.fillRect(
    x0 + x, y0 + y,
    Math.max(1, at(ox + 3 + w) - x),
    Math.max(1, at(oy + 3 + h) - y),
  );
}

// --- the shipped glyph set -------------------------------------------------

/** A left-return arrow (back). */
registerIcon('back', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -2, 0); cell(g, cx, cy, -1, -1); cell(g, cx, cy, -1, 1);
  cell(g, cx, cy, 0, -2, 1, 5); cell(g, cx, cy, 1, -1); cell(g, cx, cy, 1, 1);
});

/** A right-pointing chevron (drill in). */
registerIcon('chevron-right', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -1, -2); cell(g, cx, cy, 0, -1); cell(g, cx, cy, 1, 0);
  cell(g, cx, cy, 0, 1); cell(g, cx, cy, -1, 2);
});

/** A down-pointing chevron (open a dropdown). */
registerIcon('chevron-down', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -2, -1); cell(g, cx, cy, -1, 0); cell(g, cx, cy, 0, 1);
  cell(g, cx, cy, 1, 0); cell(g, cx, cy, 2, -1);
});

/** An up-pointing chevron (collapse). */
registerIcon('chevron-up', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -2, 1); cell(g, cx, cy, -1, 0); cell(g, cx, cy, 0, -1);
  cell(g, cx, cy, 1, 0); cell(g, cx, cy, 2, 1);
});

/** A cross (close). */
registerIcon('close', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  for (let i = -2; i <= 2; i++) { cell(g, cx, cy, i, i); cell(g, cx, cy, i, -i); }
});

/** A minimise bar. */
registerIcon('minimize', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -2, 2, 5, 1);
});

/** A tick. */
registerIcon('check', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -2, 0); cell(g, cx, cy, -1, 1); cell(g, cx, cy, 0, 0);
  cell(g, cx, cy, 1, -1); cell(g, cx, cy, 2, -2);
});

/** A filled dot (a radio/selected mark). */
registerIcon('dot', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -1, -1, 3, 3);
});

/** A ring (an empty radio mark). */
registerIcon('ring', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -2, -2, 5, 1); cell(g, cx, cy, -2, 2, 5, 1);
  cell(g, cx, cy, -2, -1, 1, 3); cell(g, cx, cy, 2, -1, 1, 3);
});

/** A plus (add / zoom in). */
registerIcon('plus', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -2, 0, 5, 1); cell(g, cx, cy, 0, -2, 1, 5);
});

/** A minus (remove / zoom out). */
registerIcon('minus', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -2, 0, 5, 1);
});

/** A gear (settings). */
registerIcon('gear', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -1, -2, 3, 1); cell(g, cx, cy, -1, 2, 3, 1);
  cell(g, cx, cy, -2, -1, 1, 3); cell(g, cx, cy, 2, -1, 1, 3);
  cell(g, cx, cy, -1, -1, 3, 3);
});

/** A left/right arrows pair (a choice row). */
registerIcon('choice', (g, cx, cy, color, alpha) => {
  g.fillStyle(color, alpha);
  cell(g, cx, cy, -3, 0); cell(g, cx, cy, -2, -1); cell(g, cx, cy, -2, 1);
  cell(g, cx, cy, 3, 0); cell(g, cx, cy, 2, -1); cell(g, cx, cy, 2, 1);
});
