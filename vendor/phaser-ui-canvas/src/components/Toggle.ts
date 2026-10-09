import type Phaser from 'phaser';
import type { Rect } from '../types';
import { drawInset } from '../styles/panels';
import { drawIcon } from '../styles/icons';
import { uiPx } from '../styles/scale';
import { uiText, type UiFont } from '../styles/text';
import { activeColors, onThemeChanged } from '../theme/themes';

/**
 * Toggle — a checkbox with an optional label.
 *
 * The original settings screens used ON/OFF rows; a checkbox is the same idea
 * at a smaller scale, and it composes into those rows (put a label on the row
 * and leave the toggle unlabelled). Clicking the box OR the label flips it.
 */

export interface ToggleOptions {
  label?: string;
  /** Label size, in design units. */
  size?: number;
  font?: UiFont;
  value?: boolean;
  /** Box side length, in design units. */
  boxSize?: number;
}

/** Sizes here are in design units (see `styles/scale`). */
const DEFAULTS = { size: 8, boxSize: 9 };

export class Toggle {
  readonly container: Phaser.GameObjects.Container;

  onChange: ((value: boolean) => void) | null = null;

  private readonly rect: Rect;
  private readonly opts: Required<Omit<ToggleOptions, 'label' | 'font' | 'value'>> & ToggleOptions;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private labelText: Phaser.GameObjects.Text | null = null;
  private zone: Phaser.GameObjects.Zone;
  private value: boolean;
  private unsubscribe: () => void;

  constructor(scene: Phaser.Scene, rect: Rect, options: ToggleOptions = {}) {
    this.rect = rect;
    this.opts = {
      ...DEFAULTS,
      ...options,
      boxSize: uiPx(options.boxSize ?? DEFAULTS.boxSize),
    };
    this.value = options.value ?? false;

    this.container = scene.add.container(rect.x, rect.y);
    this.gfx = scene.add.graphics();
    this.container.add(this.gfx);

    if (this.opts.label !== undefined) {
      const textSize = uiPx(this.opts.size ?? DEFAULTS.size);
      // Sit the label on the box's line, with the same 1px optical nudge the
      // grid has always used.
      const y = Math.max(0, Math.floor((rect.height - textSize) / 2)) + 1;
      this.labelText = uiText(scene, this.opts.boxSize + uiPx(4), y, this.opts.label, { size: this.opts.size, font: this.opts.font });
      this.container.add(this.labelText);
    }

    this.zone = scene.add.zone(0, 0, rect.width, rect.height)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.zone.on('pointerdown', () => this.toggle());
    this.container.add(this.zone);

    this.unsubscribe = onThemeChanged(() => this.redraw());
    this.redraw();
  }

  get current(): boolean { return this.value; }

  setValue(value: boolean, silent = false): void {
    if (value === this.value) return;
    this.value = value;
    this.redraw();
    if (!silent) this.onChange?.(this.value);
  }

  toggle(): void {
    this.setValue(!this.value);
  }

  private redraw(): void {
    const c = activeColors();
    const s = this.opts.boxSize;
    const y = Math.max(0, Math.floor((this.rect.height - s) / 2));
    this.gfx.clear();
    drawInset(this.gfx, { x: 0, y, width: s, height: s }, 1, c);
    if (this.value) {
      drawIcon(this.gfx, 'check', Math.floor(s / 2), y + Math.floor(s / 2), c.textGreen);
      if (this.labelText) this.labelText.setColor(cssOf(c.textGreen));
    } else if (this.labelText) {
      this.labelText.setColor(cssOf(c.textPrimary));
    }
  }

  destroy(): void {
    this.unsubscribe();
    this.container.destroy();
  }
}

function cssOf(color: number): string {
  return '#' + (color >>> 0 & 0xffffff).toString(16).padStart(6, '0');
}
