import type Phaser from 'phaser';
import type { Rect } from '../types';
import { drawDivider, drawPanel } from '../styles/panels';
import { uiPx } from '../styles/scale';
import { uiText, type UiFont } from '../styles/text';
import { activeColors, onThemeChanged } from '../theme/themes';

/**
 * Panel — a framed box, the atom everything else is built from.
 *
 * It draws the framework's signature frame (see `drawPanel`) and, when given a
 * title, a header line with a divider under it. It exposes its `body` rect for
 * callers to place content in, and repaints itself when the theme changes.
 */

export interface PanelOptions {
  /** Panel alpha, for fading a whole window in/out. */
  alpha?: number;
  /** Optional header title. */
  title?: string;
  /** Title size, in design units. */
  titleSize?: number;
  titleFont?: UiFont;
  /** Header height when a title is present, in design units. */
  headerH?: number;
  /** Inner padding from the frame to `body`, in design units. */
  padding?: number;
}

/** The default header and padding, in design units (see `styles/scale`). */
const DEFAULTS = { alpha: 1, headerH: 12, padding: 4 };

export class Panel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly rect: Rect;
  private readonly opts: Required<Omit<PanelOptions, 'title' | 'titleSize' | 'titleFont'>> & PanelOptions;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text | null = null;
  private unsubscribe: () => void;

  constructor(scene: Phaser.Scene, rect: Rect, options: PanelOptions = {}) {
    this.scene = scene;
    this.rect = rect;
    this.opts = {
      ...DEFAULTS,
      ...options,
      headerH: uiPx(options.headerH ?? DEFAULTS.headerH),
      padding: uiPx(options.padding ?? DEFAULTS.padding),
    };
    this.container = scene.add.container(rect.x, rect.y);
    this.gfx = scene.add.graphics();
    this.container.add(this.gfx);
    this.unsubscribe = onThemeChanged(() => this.redraw());
    this.redraw();
  }

  /** The panel's outer rect, in world coordinates. */
  get outer(): Rect { return this.rect; }

  /**
   * The rect content should be placed in (world coordinates): the panel inset
   * by its padding, and starting below the header when there is a title.
   */
  get body(): Rect {
    const pad = this.opts.padding;
    const top = this.opts.title !== undefined ? this.opts.headerH : 0;
    return {
      x: this.rect.x + pad,
      y: this.rect.y + top + pad,
      width: this.rect.width - pad * 2,
      height: this.rect.height - top - pad * 2,
    };
  }

  setTitle(title: string): void {
    this.opts.title = title;
    this.redraw();
  }

  setAlpha(alpha: number): void {
    this.opts.alpha = alpha;
    this.container.setAlpha(alpha);
  }

  /** Repaint the frame and header (called automatically on theme change). */
  redraw(): void {
    const c = activeColors();
    const a = this.opts.alpha;
    const r = { x: 0, y: 0, width: this.rect.width, height: this.rect.height };

    this.gfx.clear();
    drawPanel(this.gfx, r, a, c);

    if (this.opts.title !== undefined) {
      const headerH = this.opts.headerH;
      drawDivider(this.gfx, 2, headerH - 1, this.rect.width - 4, a, c);
      if (!this.titleText) {
        this.titleText = uiText(
          this.scene, uiPx(4), headerTextY(headerH, uiPx(this.opts.titleSize ?? 8)), this.opts.title,
          { size: this.opts.titleSize ?? 8, font: this.opts.titleFont, color: c.wordmark },
        );
        this.container.add(this.titleText);
      } else {
        this.titleText.setText(this.opts.title);
        this.titleText.setColor(cssOf(c.wordmark));
      }
    }
  }

  destroy(): void {
    this.unsubscribe();
    this.container.destroy();
  }
}

/** Local helper so a Text colour can be updated without importing the util. */
function cssOf(color: number): string {
  return '#' + (color >>> 0 & 0xffffff).toString(16).padStart(6, '0');
}

/**
 * The y that centres a title of `textH` px inside a `headerH` header. A grid
 * header of 12 with an 8px face lands on 2, which is where it has always been.
 */
function headerTextY(headerH: number, textH: number): number {
  return Math.max(1, Math.round((headerH - textH) / 2));
}
