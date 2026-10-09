import type Phaser from 'phaser';
import type { Rect } from '../types';
import { drawDivider, drawPanel } from '../styles/panels';
import { drawIcon } from '../styles/icons';
import { uiPx } from '../styles/scale';
import { uiText, type UiFont } from '../styles/text';
import { activeColors, onThemeChanged } from '../theme/themes';

/**
 * Window — a titled, framed panel that can be dragged and closed.
 *
 * The original app's most desktop-like surface was a stack of panels with
 * header bars; this is that idea as a component. A window is a panel with:
 *
 *   - a header strip carrying its title (in the wordmark colour)
 *   - an optional close button
 *   - optional dragging by the header
 *   - a `content` rect for callers to place children in
 *
 * It does not manage z-order or focus — that is `WindowManager`'s job — so an
 * app that only wants one floating panel can use a Window on its own.
 */

export interface WindowOptions {
  title?: string;
  closable?: boolean;
  draggable?: boolean;
  /** Header (title bar) height, in design units. */
  headerH?: number;
  /** Inner padding from the frame to `content`, in design units. */
  padding?: number;
  titleFont?: UiFont;
  /** Title size, in design units. */
  titleSize?: number;
  depth?: number;
}

/** Sizes here are in design units (see `styles/scale`). */
const DEFAULTS = {
  closable: true, draggable: true, headerH: 11, padding: 4, titleSize: 8, depth: 900,
};

export class Window {
  /** The window's root container (move this to move the window). */
  readonly container: Phaser.GameObjects.Container;

  /** Fired when the close button is pressed. */
  onClose: (() => void) | null = null;
  /** Fired when the window is grabbed/released for dragging. */
  onDragChange: ((dragging: boolean) => void) | null = null;

  private readonly scene: Phaser.Scene;
  private readonly size: Rect;
  private readonly opts: Required<Omit<WindowOptions, 'title' | 'titleFont' | 'titleSize'>> & WindowOptions;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text | null = null;
  private headerZone: Phaser.GameObjects.Zone;
  private closeZone: Phaser.GameObjects.Zone | null = null;
  private dragging = false;
  private dragDX = 0;
  private dragDY = 0;
  /** `destroy` is not a request; anything may ask, but it happens once. */
  private destroyed = false;
  private readonly unsubscribe: () => void;
  private readonly onMove: (pointer: Phaser.Input.Pointer) => void;
  private readonly onUp: () => void;

  constructor(scene: Phaser.Scene, rect: Rect, options: WindowOptions = {}) {
    this.scene = scene;
    this.size = rect;
    this.opts = {
      ...DEFAULTS,
      ...options,
      headerH: uiPx(options.headerH ?? DEFAULTS.headerH),
      padding: uiPx(options.padding ?? DEFAULTS.padding),
    };

    this.container = scene.add.container(rect.x, rect.y).setDepth(this.opts.depth);
    this.gfx = scene.add.graphics();
    this.container.add(this.gfx);

    if (this.opts.title !== undefined) {
      const titleSize = this.opts.titleSize ?? DEFAULTS.titleSize;
      this.titleText = uiText(scene, uiPx(4), Math.max(1, Math.round((this.opts.headerH - uiPx(titleSize)) / 2)), this.opts.title, {
        size: titleSize, font: this.opts.titleFont,
      });
      this.container.add(this.titleText);
    }

    // Header drag zone (also raises the window for a manager, via onHover).
    this.headerZone = scene.add.zone(0, 0, rect.width, this.opts.headerH)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: this.opts.draggable });
    if (this.opts.draggable) {
      this.headerZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.beginDrag(pointer));
    }
    this.container.add(this.headerZone);

    if (this.opts.closable) {
      const s = this.opts.headerH - 2;
      this.closeZone = scene.add.zone(rect.width - s - 2, 1, s, s)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      this.closeZone.on('pointerdown', () => this.onClose?.());
      this.container.add(this.closeZone);
    }

    this.onMove = (pointer: Phaser.Input.Pointer) => this.drag(pointer);
    this.onUp = () => this.endDrag();
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);

    this.unsubscribe = onThemeChanged(() => this.redraw());
    this.redraw();
  }

  /** The rect content should be placed in, in WORLD coordinates. */
  get content(): Rect {
    const pad = this.opts.padding;
    const top = this.opts.headerH;
    return {
      x: this.container.x + pad,
      y: this.container.y + top + pad,
      width: this.size.width - pad * 2,
      height: this.size.height - top - pad * 2,
    };
  }

  get position(): { x: number; y: number } {
    return { x: this.container.x, y: this.container.y };
  }

  setTitle(title: string): void {
    this.opts.title = title;
    this.redraw();
  }

  setDepth(depth: number): void {
    this.container.setDepth(depth);
  }

  get depth(): number {
    return this.container.depth;
  }

  /** True when the point is inside the window's outer rect. */
  contains(x: number, y: number): boolean {
    return x >= this.container.x && x < this.container.x + this.size.width
      && y >= this.container.y && y < this.container.y + this.size.height;
  }

  /**
   * Reparent a component's container into this window, keeping its on-screen
   * position. Components create themselves in the scene at world coordinates;
   * a window lives at a high depth so it can float over everything, which
   * would hide any content left behind in the scene. Attaching moves the child
   * into the window's own container (adjusting for its position) so the
   * content draws with the window and travels with it when it is dragged.
   */
  attach(child: { container: Phaser.GameObjects.Container }): void {
    const c = child.container;
    c.setPosition(c.x - this.container.x, c.y - this.container.y);
    this.container.add(c);
  }

  moveTo(x: number, y: number, bounds?: Rect): void {
    this.container.setPosition(
      clampAxis(x, this.size.width, bounds?.x, bounds ? bounds.x + bounds.width : undefined),
      clampAxis(y, this.size.height, bounds?.y, bounds ? bounds.y + bounds.height : undefined),
    );
  }

  private beginDrag(pointer: Phaser.Input.Pointer): void {
    this.dragging = true;
    this.dragDX = pointer.x - this.container.x;
    this.dragDY = pointer.y - this.container.y;
    this.onDragChange?.(true);
  }

  private drag(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging || !pointer.isDown) return;
    this.container.setPosition(pointer.x - this.dragDX, pointer.y - this.dragDY);
  }

  private endDrag(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.onDragChange?.(false);
  }

  redraw(): void {
    const c = activeColors();
    const r = { x: 0, y: 0, width: this.size.width, height: this.size.height };
    const hh = this.opts.headerH;
    this.gfx.clear();
    drawPanel(this.gfx, r, 1, c);
    // header face
    this.gfx.fillStyle(c.stone, 1);
    this.gfx.fillRect(1, 1, this.size.width - 2, hh);
    this.gfx.fillStyle(c.stoneHi, 0.5);
    this.gfx.fillRect(1, 1, this.size.width - 2, 1);
    drawDivider(this.gfx, 1, hh, this.size.width - 2, 1, c);
    if (this.opts.closable) {
      drawIcon(this.gfx, 'close', this.size.width - hh / 2 - 2, Math.floor(hh / 2), c.textPrimary);
    }
    if (this.titleText) this.titleText.setColor(cssOf(c.wordmark));
  }

  /**
   * Destroy the window and everything in it.
   *
   * Idempotent on purpose: a window can be closed by its own button, by its
   * manager, by the app's Escape key and by a scene shutdown, and those arrive
   * in whatever order the frame decides. The first one wins.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerup', this.onUp);
    this.container.destroy();
  }
}

function clampAxis(v: number, size: number, lo?: number, hi?: number): number {
  let out = v;
  if (lo !== undefined) out = Math.max(lo, out);
  if (hi !== undefined) out = Math.min(hi - size, out);
  return out;
}

function cssOf(color: number): string {
  return '#' + (color >>> 0 & 0xffffff).toString(16).padStart(6, '0');
}
