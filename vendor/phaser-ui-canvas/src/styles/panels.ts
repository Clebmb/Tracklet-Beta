/**
 * panels — the framework's signature drawing: a framed stone panel.
 *
 * Everything the UI is made of is built from three painters here:
 *
 *   drawPanel   the framed box: ink outline, wet-stone border, solid
 *               near-black fill, gothic corner notches and a violet ward trim
 *               along the top border. Menus, windows, toasts and toolbars are
 *               all this shape at different sizes.
 *   drawDivider a 1px seam with a shadow hairline under it.
 *   drawInset   the inverse of drawPanel: a recessed well for slider tracks,
 *               input fields and anything you "reach into".
 *
 * Every painter takes an optional palette and defaults to the ACTIVE theme's,
 * so a scene that never calls `setActiveTheme` draws exactly the shipped look,
 * and one that does gets the whole UI in the new colours for free.
 *
 * All drawing is in whole canvas pixels at the app's internal resolution, so
 * it stays pixel-crisp under the canvas's nearest-neighbour upscaling.
 */

import type Phaser from 'phaser';
import type { Rect } from '../types';
import type { PanelPalette } from '../theme/palette';
import { activePalette } from '../theme/themes';
import { uiPx } from './scale';

/**
 * Draw one framed stone panel: ink outline, wet-stone border, solid fill, and
 * gothic corner notches with a pale-violet glint. A 1px violet ward line runs
 * the top border — the signature trim.
 */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  r: Rect,
  alpha = 1,
  colors: PanelPalette = activePalette(),
): void {
  const { x, y, width: w, height: h } = r;
  // ink outline (outside)
  g.fillStyle(colors.ink, 0.95 * alpha);
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  // border (stone)
  g.fillStyle(colors.stone, alpha);
  g.fillRect(x, y, w, h);
  // interior — solid, nothing bleeds through
  g.fillStyle(colors.panelFill, colors.panelFillAlpha * alpha);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  // top-edge highlight strip (wet sheen)
  g.fillStyle(colors.stoneHi, 0.55 * alpha);
  g.fillRect(x + 1, y + 1, w - 2, 1);
  // violet ward trim along the top border
  g.fillStyle(colors.ward, 0.45 * alpha);
  g.fillRect(x + 3, y, w - 6, 1);
  // bottom-edge shadow strip
  g.fillStyle(colors.ink, 0.6 * alpha);
  g.fillRect(x + 1, y + h - 2, w - 2, 1);
  // corner notches: clear the 4 corner cells of the border, then dot the
  // surviving diagonal with a brighter violet glint
  const notch = uiPx(2);
  g.fillStyle(colors.ink, alpha);
  g.fillRect(x - 1, y - 1, notch, notch);
  g.fillRect(x + w - 1, y - 1, notch, notch);
  g.fillRect(x - 1, y + h - 1, notch, notch);
  g.fillRect(x + w - 1, y + h - 1, notch, notch);
  g.fillStyle(colors.ward, 0.9 * alpha);
  g.fillRect(x + 1, y + 1, 1, 1);
  g.fillRect(x + w - 2, y + 1, 1, 1);
  g.fillRect(x + 1, y + h - 2, 1, 1);
  g.fillRect(x + w - 2, y + h - 2, 1, 1);
}

/** A 1px horizontal seam divider with a shadow hairline below it. */
export function drawDivider(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, alpha = 1,
  colors: Pick<PanelPalette, 'stone' | 'ink'> = activePalette(),
): void {
  g.fillStyle(colors.stone, 0.7 * alpha);
  g.fillRect(x, y, w, 1);
  g.fillStyle(colors.ink, 0.6 * alpha);
  g.fillRect(x, y + 1, w, 1);
}

/**
 * A recessed well — the inverse of a panel: a dark ink groove with a light
 * bottom lip, so it reads as pressed INTO the surface. Slider tracks, input
 * fields and progress channels are drawn with this.
 */
export function drawInset(
  g: Phaser.GameObjects.Graphics,
  r: Rect,
  alpha = 1,
  colors: PanelPalette = activePalette(),
): void {
  const { x, y, width: w, height: h } = r;
  g.fillStyle(colors.ink, 0.9 * alpha);
  g.fillRect(x, y, w, h);
  g.fillStyle(colors.stoneHi, 0.4 * alpha);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillStyle(colors.ink, alpha);
  g.fillRect(x, y, w, 1);
}

/**
 * A raised bar fill (the "on" part of a slider, a progress meter): a solid
 * accent block with a lighter top edge.
 */
export function drawBar(
  g: Phaser.GameObjects.Graphics,
  r: Rect,
  color: number,
  alpha = 1,
): void {
  if (r.width <= 0 || r.height <= 0) return;
  g.fillStyle(color, 0.9 * alpha);
  g.fillRect(r.x, r.y, r.width, r.height);
  g.fillStyle(color, 0.35 * alpha);
  g.fillRect(r.x, r.y, r.width, 1);
}

/** The octagonal knob used by sliders and scroll thumbs. */
export function drawKnob(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number, h: number,
  colors: PanelPalette = activePalette(),
): void {
  const w = uiPx(3);
  const x = cx - Math.floor(w / 2);
  const y = cy - Math.floor(h / 2);
  g.fillStyle(colors.ink, 1);
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(colors.stoneHi, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(colors.ward, 0.9);
  g.fillRect(x, y - 1, w, 1);
  g.fillRect(x, y + h, w, 1);
}
