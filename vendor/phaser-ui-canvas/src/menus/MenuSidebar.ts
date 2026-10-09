import type Phaser from 'phaser';
import type { Rect } from '../types';
import { activeColors, onThemeChanged } from '../theme/themes';
import { uiPx } from '../styles/scale';
import { uiText } from '../styles/text';

/**
 * MenuSidebar — the left-hand category list: rows and the selection
 * highlight, the way the original pause menu and editor panels both worked.
 *
 * The selection is communicated by the accent band alone (no cursor sprite),
 * which is the original's look. The sidebar owns its mouse hover/click
 * regions; navigation-sound decisions and what "select" MEANS stay with the
 * caller.
 */

export interface SidebarCategory {
  displayLabel: string;
  enabled: boolean;
}

export interface MenuSidebarHandlers {
  onSelect?: (index: number) => void;
  onHover?: (index: number | null) => void;
}

export interface MenuSidebarOptions {
  /** Row height, in design units. */
  rowH?: number;
  /** First row's y offset inside the panel, in design units. */
  rowTop?: number;
  /** Label x offset, in design units. */
  labelX?: number;
}

/** Sizes here are in design units (see `styles/scale`). */
const DEFAULTS = { rowH: 12, rowTop: 1, labelX: 5 };

export class MenuSidebar {
  readonly container: Phaser.GameObjects.Container;
  /** The y of each row, panel-local. */
  readonly rowYs: number[] = [];

  private readonly scene: Phaser.Scene;
  private readonly rect: Rect;
  private readonly opts: Required<MenuSidebarOptions>;
  private readonly categories: readonly SidebarCategory[];

  private readonly gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private selected = -1;
  private unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    rect: Rect,
    categories: readonly SidebarCategory[],
    handlers: MenuSidebarHandlers = {},
    options: MenuSidebarOptions = {},
  ) {
    this.scene = scene;
    this.rect = rect;
    this.opts = {
      ...DEFAULTS,
      ...options,
      rowH: uiPx(options.rowH ?? DEFAULTS.rowH),
      rowTop: uiPx(options.rowTop ?? DEFAULTS.rowTop),
      labelX: uiPx(options.labelX ?? DEFAULTS.labelX),
    };
    this.categories = categories;
    this.handlers = handlers;

    this.container = scene.add.container(rect.x, rect.y);
    this.gfx = scene.add.graphics();
    this.container.add(this.gfx);

    this.unsubscribe = onThemeChanged(() => this.render());
    this.render();
    this.setSelected(0);
  }

  private readonly handlers: MenuSidebarHandlers;

  get selectedIndex(): number { return this.selected; }

  /** Move the highlight to a row; plays no sound (the caller's job). */
  setSelected(index: number): void {
    this.selected = Math.max(0, Math.min(index, this.categories.length - 1));
    this.drawHighlight();
  }

  /** The rows' y positions (panel-local). */
  get rows(): number[] { return this.rowYs; }

  update(_timeMs: number): void {
    /* reserved for a pulse on the highlight, as in the original */
  }

  private drawHighlight(): void {
    const c = activeColors();
    const { rowH, rowTop } = this.opts;
    const y = rowTop + this.selected * rowH;
    this.gfx.clear();
    if (this.selected < 0) return;
    this.gfx.fillStyle(c.ooze, 0.9);
    this.gfx.fillRect(2, y, this.rect.width - 4, rowH - uiPx(2));
    this.gfx.fillStyle(c.oozeDim, 0.18);
    this.gfx.fillRect(3, y + 1, this.rect.width - 6, rowH - uiPx(4));
  }

  private render(): void {
    const c = activeColors();
    const { rowH, rowTop, labelX } = this.opts;

    for (const t of this.labels) t.destroy();
    for (const z of this.zones) z.destroy();
    this.labels = [];
    this.zones = [];
    this.rowYs.length = 0;

    this.categories.forEach((cat, i) => {
      const y = rowTop + i * rowH;
      this.rowYs.push(y);
      const alpha = cat.enabled ? 1 : 0.35;
      const label = uiText(this.scene, labelX, y + uiPx(3), cat.displayLabel, {
        size: 8, color: cat.enabled ? c.textPrimary : c.textDim,
      });
      label.setAlpha(alpha);
      this.container.add(label);
      this.labels.push(label);

      const zone = this.scene.add.zone(0, y, this.rect.width, rowH)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.handlers.onHover?.(i));
      zone.on('pointerout', () => this.handlers.onHover?.(null));
      zone.on('pointerdown', () => this.handlers.onSelect?.(i));
      this.container.add(zone);
      this.zones.push(zone);
    });

    this.drawHighlight();
  }

  destroy(): void {
    this.unsubscribe();
    for (const z of this.zones) z.destroy();
    this.container.destroy();
  }
}
