import type Phaser from 'phaser';
import type { Rect } from '../types';
import { drawInset, drawPanel } from '../styles/panels';
import { uiText, type UiFont } from '../styles/text';
import { uiPx } from '../styles/scale';
import { drawIcon } from '../styles/icons';
import { activeColors, onThemeChanged } from '../theme/themes';

/**
 * Button — a framed, labelled control with the four states a UI needs.
 *
 * It is drawn in the same family as a panel, so a button reads as a small
 * raised panel:
 *   normal    the panel frame
 *   hover     a brighter stone border and an accent lip
 *   pressed   inverted (an inset well) so it looks pushed in
 *   disabled  dim text and a flat frame
 *   focused   an accent outline, for keyboard-driven menus
 *
 * It owns a mouse zone; a click or a confirm key (delivered by the caller as
 * `press()`) fires `onPress`. No sound decisions live here.
 */

export type ButtonState = 'normal' | 'hover' | 'pressed' | 'disabled';

export interface ButtonOptions {
  /** Text size, in design units (multiplied by the active UI scale). */
  size?: number;
  font?: UiFont;
  /** Optional icon drawn in the gutter. */
  icon?: string;
  /** Center the label (default) or left-align it. */
  align?: 'center' | 'left';
  /** Disabled to start. */
  disabled?: boolean;
}

export class Button {
  readonly container: Phaser.GameObjects.Container;

  /** Fired on click or `press()`. */
  onPress: (() => void) | null = null;
  /** Fired when hover begins/ends. */
  onHover: ((over: boolean) => void) | null = null;

  private readonly scene: Phaser.Scene;
  private readonly rect: Rect;
  private readonly opts: ButtonOptions;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly zone: Phaser.GameObjects.Zone;
  /** The label's font size in canvas px (the option, scaled once). */
  private readonly textSize: number;
  private labelObj: Phaser.GameObjects.Text;
  private text: string;
  private state: ButtonState;
  private focused = false;
  private unsubscribe: () => void;

  constructor(scene: Phaser.Scene, rect: Rect, text: string, options: ButtonOptions = {}) {
    this.scene = scene;
    this.rect = rect;
    this.opts = options;
    this.text = text;
    this.state = options.disabled ? 'disabled' : 'normal';
    this.textSize = uiPx(options.size ?? 8);

    this.container = scene.add.container(rect.x, rect.y);
    this.gfx = scene.add.graphics();
    this.container.add(this.gfx);

    this.labelObj = this.makeLabel();
    this.container.add(this.labelObj);

    this.zone = scene.add.zone(0, 0, rect.width, rect.height)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: !options.disabled });
    this.zone.on('pointerover', () => this.setState('hover'));
    this.zone.on('pointerout', () => this.setState(this.opts.disabled ? 'disabled' : 'normal'));
    this.zone.on('pointerdown', () => this.setState('pressed'));
    this.zone.on('pointerup', () => {
      if (this.opts.disabled) return;
      this.setState('hover');
      this.onPress?.();
    });
    this.container.add(this.zone);

    this.unsubscribe = onThemeChanged(() => this.redraw());
    this.redraw();
  }

  get enabled(): boolean { return !this.opts.disabled; }
  get isFocused(): boolean { return this.focused; }

  setEnabled(enabled: boolean): void {
    this.opts.disabled = !enabled;
    if (enabled) this.setState('normal');
    else this.setState('disabled');
    this.zone.setInteractive({ useHandCursor: enabled });
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.redraw();
  }

  setText(text: string): void {
    this.text = text;
    this.labelObj.setText(text);
    this.layoutLabel();
  }

  /** Fire the press as a keyboard confirm would. No-op when disabled. */
  press(): void {
    if (this.opts.disabled) return;
    this.onPress?.();
  }

  private setState(state: ButtonState): void {
    if (this.opts.disabled && state !== 'disabled') state = 'disabled';
    if (this.state === state) return;
    const prev = this.state;
    this.state = state;
    if (prev !== 'hover' && state === 'hover') this.onHover?.(true);
    if (prev === 'hover' && state !== 'hover') this.onHover?.(false);
    this.redraw();
  }

  private makeLabel(): Phaser.GameObjects.Text {
    const color = activeColors().textPrimary;
    return uiText(this.scene, 0, 0, this.text, {
      size: this.opts.size ?? 8,
      font: this.opts.font,
      color,
    });
  }

  /**
   * Centre the label in the button. The offset is the label's own height rather
   * than a constant, so a button stays centred at any font size — the gutter is
   * one icon wide when the button has an icon, and a hair's padding when not.
   */
  private layoutLabel(): void {
    const cy = Math.floor((this.rect.height - this.textSize) / 2);
    if (this.opts.align === 'left') {
      const x = uiPx(this.opts.icon ? 12 : 4);
      this.labelObj.setPosition(x, cy);
    } else {
      this.labelObj.setPosition(Math.round(this.rect.width / 2), cy)
        .setOrigin(0.5, 0);
    }
  }

  redraw(): void {
    const c = activeColors();
    const r = { x: 0, y: 0, width: this.rect.width, height: this.rect.height };
    this.gfx.clear();

    if (this.state === 'pressed') {
      drawInset(this.gfx, r, 1, c);
    } else {
      drawPanel(this.gfx, r, 1, c);
      if (this.state === 'hover') {
        this.gfx.fillStyle(c.ward, 0.9);
        this.gfx.fillRect(2, 0, this.rect.width - 4, 1);
      }
    }
    if (this.focused) {
      this.gfx.fillStyle(c.ooze, 1);
      this.gfx.fillRect(2, this.rect.height - 1, this.rect.width - 4, 1);
    }
    if (this.opts.icon) {
      drawIcon(this.gfx, this.opts.icon, uiPx(6), Math.floor(this.rect.height / 2),
        this.opts.disabled ? c.textDim : c.textPrimary);
    }

    const color = this.opts.disabled ? c.textDim : (this.state === 'hover' ? c.textGreen : c.textPrimary);
    this.labelObj.setColor(cssOf(color));
    this.layoutLabel();
  }

  destroy(): void {
    this.unsubscribe();
    this.container.destroy();
  }
}

function cssOf(color: number): string {
  return '#' + (color >>> 0 & 0xffffff).toString(16).padStart(6, '0');
}
