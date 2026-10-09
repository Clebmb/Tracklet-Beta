import type Phaser from 'phaser';
import type { Rect } from '../types';
import { activeColors, onThemeChanged } from '../theme/themes';
import { drawIcon } from '../styles/icons';
import { drawDivider } from '../styles/panels';
import { uiPx } from '../styles/scale';
import { uiText } from '../styles/text';
import type { MenuRow, MenuView } from './model';
import { clampCursor } from './model';

/**
 * MenuListPanel — draws a `MenuView` in the framework's panel style.
 *
 * This is the reusable form of the original editor's option panel: a heading,
 * a stack of rows, and a cursor. It owns the DRAWING and the mouse hit-regions;
 * it does not own the cursor's meaning, so a scene moves the cursor with
 * `setCursor(...)` and the panel just shows it. Activating a row (click or the
 * caller's confirm handling) is reported back, and the caller is the only thing
 * that mutates app state.
 *
 * The panel is drawn in three layers so it can repaint cheaply:
 *
 *   cursor  the selection band — the ONLY thing `setCursor` touches
 *   rows    swatches, icons, markers and the heading
 *   text    a Text object per label/value, destroyed and rebuilt on `setView`
 *
 * Keeping the cursor in its own layer matters: a hover that moved the cursor
 * used to rebuild every row and its input zone, which destroyed the very zone
 * that had just been hovered and broke the click that followed. A cursor move
 * must never touch the hit-regions.
 *
 * A theme change rebuilds the labels: Graphics hold coloured draw commands and
 * Text objects cache their colour, so a recolour in place cannot work.
 */

export interface MenuListPanelOptions {
  /** Height of one row, in design units. */
  rowH?: number;
  /** Y of the first row inside the content rect, in design units. */
  top?: number;
  /** Left padding for the label, in design units. */
  padX?: number;
  /** Right padding for a row's value, in design units. */
  valueRight?: number;
  /** Draw the cursor band. Off for a list that is not keyboard-driven. */
  showCursor?: boolean;
}

export interface MenuListPanelHandlers {
  /** A row was activated (click, or the caller's own confirm handling). */
  onActivate?: (row: MenuRow, index: number) => void;
  /** The pointer entered/left a row (null on leave). */
  onHover?: (index: number | null) => void;
}

/** Row metrics in design units (see `styles/scale`). */
const DEFAULTS = {
  rowH: 11,
  top: 2,
  padX: 4,
  valueRight: 4,
  showCursor: true,
};

/** Height of the heading strip, when the view has a title. */
const titleH = (): number => uiPx(12);

export class MenuListPanel {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly rect: Rect;
  private readonly opts: Required<MenuListPanelOptions>;
  private readonly handlers: MenuListPanelHandlers;
  private readonly cursorGfx: Phaser.GameObjects.Graphics;
  private readonly rowsGfx: Phaser.GameObjects.Graphics;

  private view: MenuView;
  private labels: Phaser.GameObjects.Text[] = [];
  private values: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private titleObj: Phaser.GameObjects.Text | null = null;
  private unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    rect: Rect,
    view: MenuView,
    handlers: MenuListPanelHandlers = {},
    options: MenuListPanelOptions = {},
  ) {
    this.scene = scene;
    this.rect = rect;
    this.opts = {
      ...DEFAULTS,
      ...options,
      rowH: uiPx(options.rowH ?? DEFAULTS.rowH),
      top: uiPx(options.top ?? DEFAULTS.top),
      padX: uiPx(options.padX ?? DEFAULTS.padX),
      valueRight: uiPx(options.valueRight ?? DEFAULTS.valueRight),
    };
    this.handlers = handlers;
    this.view = { ...view, cursor: clampCursor(view.rows, view.cursor) };

    this.container = scene.add.container(rect.x, rect.y);
    this.cursorGfx = scene.add.graphics();   // bottom layer
    this.rowsGfx = scene.add.graphics();
    this.container.add([this.cursorGfx, this.rowsGfx]);

    this.unsubscribe = onThemeChanged(() => this.render());
    this.render();
  }

  /** The row cursor is on (-1 when the list is empty). */
  get cursor(): number { return this.view.cursor; }

  /** The rows currently drawn. */
  get rows(): readonly MenuRow[] { return this.view.rows; }

  /** The whole view currently drawn. */
  get currentView(): MenuView { return this.view; }

  /** Replace the whole view (rows and/or cursor). Rebuilds the rows. */
  setView(view: MenuView): void {
    this.view = { ...view, cursor: clampCursor(view.rows, view.cursor) };
    this.render();
  }

  /** Move just the cursor. Touches nothing but the cursor band. */
  setCursor(index: number): void {
    const next = clampCursor(this.view.rows, index);
    if (next === this.view.cursor) return;
    this.view = { ...this.view, cursor: next };
    this.paintCursor();
  }

  /** The y the first row starts at (below the heading, when there is one). */
  private rowsTop(): number {
    return this.opts.top + (this.view.title ? titleH() : 0);
  }

  /** Where each row is, in panel-local coordinates (for external hit tests). */
  rowRects(): Rect[] {
    const { rowH } = this.opts;
    const top = this.rowsTop();
    return this.view.rows.map((_, i) => ({
      x: 0, y: top + i * rowH, width: this.rect.width, height: rowH,
    }));
  }

  /** The row index at a panel-local point, or null. */
  rowAtLocal(y: number): number | null {
    const { rowH } = this.opts;
    const i = Math.floor((y - this.rowsTop()) / rowH);
    return i >= 0 && i < this.view.rows.length ? i : null;
  }

  /** Rebuild the rows and repaint the cursor. */
  render(): void {
    const c = activeColors();
    const { rowH, padX, valueRight } = this.opts;

    for (const t of this.labels) t.destroy();
    for (const t of this.values) t.destroy();
    for (const z of this.zones) z.destroy();
    this.labels = [];
    this.values = [];
    this.zones = [];
    this.rowsGfx.clear();
    if (this.titleObj) { this.titleObj.destroy(); this.titleObj = null; }

    const valueX = this.rect.width - valueRight;
    const top = this.rowsTop();

    if (this.view.title) {
      const header = titleH();
      this.titleObj = uiText(this.scene, uiPx(4), Math.max(1, Math.round((header - uiPx(8)) / 2)), this.view.title, { size: 8, color: c.wordmark });
      this.container.add(this.titleObj);
      drawDivider(this.rowsGfx, 2, header - uiPx(2), this.rect.width - 4, 1, c);
    }

    this.view.rows.forEach((row, i) => {
      const y = top + i * rowH;
      const cy = y + Math.floor(rowH / 2);

      // gutter: swatch or icon
      const textY = y + uiPx(2);
      let textX = padX;
      if (row.swatch !== undefined) {
        drawSwatch(this.rowsGfx, padX, cy, row.swatch, c);
        textX = padX + uiPx(9);
      } else if (row.icon !== undefined) {
        drawIcon(this.rowsGfx, row.icon, padX + uiPx(3), cy, row.disabled ? c.textDim : c.textPrimary);
        textX = padX + uiPx(9);
      } else if (row.kind === 'back') {
        drawIcon(this.rowsGfx, 'back', padX + uiPx(3), cy, c.textDim);
        textX = padX + uiPx(9);
      }

      const label = uiText(this.scene, textX, textY, row.label, { size: 8, color: labelColorFor(row, c) });
      this.container.add(label);
      this.labels.push(label);

      // right-hand marker
      if (row.value !== undefined) {
        const value = uiText(this.scene, valueX, textY, row.value, {
          size: 8, color: c.textDim, origin: { x: 1, y: 0 },
        });
        this.container.add(value);
        this.values.push(value);
      } else if (row.kind === 'nav') {
        drawIcon(this.rowsGfx, 'chevron-right', valueX - uiPx(3), cy, c.textPrimary);
      } else if (row.kind === 'choice' && row.on) {
        // A small ladder of dots, one cell per step of the design grid.
        const dot = uiPx(3);
        this.rowsGfx.fillStyle(c.ooze, 0.95);
        this.rowsGfx.fillRect(valueX - uiPx(8), cy - dot + uiPx(2), dot, dot);
        this.rowsGfx.fillRect(valueX - uiPx(5), cy - dot + uiPx(3), dot, dot);
        this.rowsGfx.fillRect(valueX - uiPx(2), cy - dot + uiPx(4), dot, dot);
      }

      // mouse zone (stable across cursor moves — they are a separate layer)
      const zone = this.scene.add.zone(0, y, this.rect.width, rowH)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: row.kind !== 'header' && !row.disabled });
      zone.on('pointerover', () => this.handlers.onHover?.(i));
      zone.on('pointerout', () => this.handlers.onHover?.(null));
      zone.on('pointerdown', () => {
        if (row.kind === 'header' || row.disabled) return;
        this.handlers.onActivate?.(row, i);
      });
      this.container.add(zone);
      this.zones.push(zone);
    });

    this.paintCursor();
  }

  /**
   * The cursor band, in the original editor's grammar: a faint ward wash with a
   * solid ward bar down its left edge. A solid accent fill would swamp an 8px
   * label sitting on it, which is why the editor never used one for its option
   * panel (the pause menu's sidebar did, and keeps it — see MenuSidebar).
   */
  private paintCursor(): void {
    const c = activeColors();
    const { rowH, showCursor } = this.opts;
    this.cursorGfx.clear();
    if (!showCursor || this.view.cursor < 0) return;
    const y = this.rowsTop() + this.view.cursor * rowH;
    this.cursorGfx.fillStyle(c.ward, 0.22);
    this.cursorGfx.fillRect(2, y, this.rect.width - 4, rowH - uiPx(2));
    this.cursorGfx.fillStyle(c.ward, 0.9);
    this.cursorGfx.fillRect(2, y, 1, rowH - uiPx(2));
  }

  destroy(): void {
    this.unsubscribe();
    this.container.destroy();
  }
}

function labelColorFor(row: MenuRow, c: ReturnType<typeof activeColors>): number {
  if (row.disabled) return c.textDim;
  switch (row.kind) {
    case 'header': return c.textDim;
    case 'back': return c.textDim;
    case 'action': return c.ooze;
    default: return row.on ? c.textGreen : c.textPrimary;
  }
}

function drawSwatch(
  g: Phaser.GameObjects.Graphics,
  x: number, cy: number, color: number,
  c: ReturnType<typeof activeColors>,
): void {
  const s = uiPx(6);
  const y = cy - Math.floor(s / 2);
  g.fillStyle(c.ink, 1);
  g.fillRect(x, y, s + 2, s + 2);
  g.fillStyle(color, 1);
  g.fillRect(x + 1, y + 1, s, s);
}
