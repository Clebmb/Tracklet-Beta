import type Phaser from 'phaser';
import type { Rect } from '../types';
import { drawBar, drawInset, drawKnob } from '../styles/panels';
import { uiText, type UiFont } from '../styles/text';
import { uiPx } from '../styles/scale';
import { sliderFill, sliderHit, sliderKnobX, sliderTrack } from '../layout/rect';
import { activeColors, onThemeChanged } from '../theme/themes';

/**
 * Slider — a labelled value control.
 *
 * The original UI had sliders for volume and for UI opacity, each a groove, a
 * filled part, a knob and a read-out. This is that, made generic: a `min..max`
 * range, an optional `step`, an optional label and value text, and a mouse
 * drag that keeps following the hand even after it leaves the row (which is
 * what a slider does). Callers can also `nudge()` it with the arrow keys.
 *
 * The value is a number; `format` turns it into the read-out string, so a
 * volume can read `85%` and a grid size can read `16 PX`.
 */

export interface SliderOptions {
  label?: string;
  min?: number;
  max?: number;
  /** Snap step. Omit for a continuous slider. */
  step?: number;
  /** Value to start on. Defaults to `min`. */
  value?: number;
  /** Label/read-out size, in design units. */
  size?: number;
  font?: UiFont;
  /** Show the numeric read-out on the right. Default true. */
  showValue?: boolean;
  /** Turn a value into its read-out. Default `Math.round(v)`. */
  format?: (value: number) => string;
}

const DEFAULTS = {
  min: 0, max: 1, step: 0, size: 8, showValue: true,
};

export class Slider {
  readonly container: Phaser.GameObjects.Container;

  /** Fired whenever the value changes (drag, nudge or `setValue`). */
  onChange: ((value: number) => void) | null = null;
  /** Fired when a drag begins/ends, so a parent can pause its own input. */
  onGrabChange: ((grabbed: boolean) => void) | null = null;

  private readonly scene: Phaser.Scene;
  private readonly rect: Rect;
  private readonly opts: Required<Omit<SliderOptions, 'label' | 'format' | 'font' | 'value'>> & SliderOptions;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private labelText: Phaser.GameObjects.Text | null = null;
  private valueText: Phaser.GameObjects.Text | null = null;
  private zone: Phaser.GameObjects.Zone | null = null;
  private value: number;
  private grabbed = false;
  private unsubscribe: () => void;
  private readonly onMove: (pointer: Phaser.Input.Pointer) => void;
  private readonly onUp: () => void;

  constructor(scene: Phaser.Scene, rect: Rect, options: SliderOptions = {}) {
    this.scene = scene;
    this.rect = rect;
    this.opts = { ...DEFAULTS, ...options };
    this.value = this.clampSnap(options.value ?? this.opts.min);

    this.container = scene.add.container(rect.x, rect.y);
    this.gfx = scene.add.graphics();
    this.container.add(this.gfx);

    if (this.opts.label !== undefined) {
      this.labelText = uiText(scene, 0, uiPx(1), this.opts.label, { size: this.opts.size, font: this.opts.font });
      this.container.add(this.labelText);
    }
    if (this.opts.showValue) {
      this.valueText = uiText(scene, rect.width, uiPx(1), this.readout(), {
        size: this.opts.size, font: this.opts.font, origin: { x: 1, y: 0 },
      });
      this.container.add(this.valueText);
    }

    const track = this.track();
    this.zone = scene.add.zone(track.x, track.y - uiPx(5), Math.max(1, track.width), track.height + uiPx(10))
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.beginGrab(pointer));
    this.container.add(this.zone);

    this.onMove = (pointer: Phaser.Input.Pointer) => this.drag(pointer);
    this.onUp = () => this.endGrab();
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);

    this.unsubscribe = onThemeChanged(() => this.redraw());
    this.redraw();
  }

  get current(): number { return this.value; }

  /** A 0..1 position along the track. */
  get fraction(): number {
    const span = this.opts.max - this.opts.min;
    return span <= 0 ? 0 : (this.value - this.opts.min) / span;
  }

  setValue(value: number, silent = false): void {
    const next = this.clampSnap(value);
    if (next === this.value) return;
    this.value = next;
    this.redraw();
    if (!silent) this.onChange?.(this.value);
  }

  /** Move by `steps` of the step size (or 5% of the range when continuous). */
  nudge(dir: 'left' | 'right', coarse = false): void {
    const span = this.opts.max - this.opts.min;
    const step = this.opts.step > 0
      ? (coarse ? this.opts.step * 5 : this.opts.step)
      : span * (coarse ? 0.1 : 0.05);
    const sign = dir === 'right' ? 1 : -1;
    this.setValue(this.value + sign * step);
  }

  private track(): Rect {
    const labelW = this.labelText ? Math.ceil(this.labelText.width) + uiPx(6) : 0;
    const valueW = this.valueText ? Math.ceil(this.valueText.width) + uiPx(6) : 0;
    const inner: Rect = {
      x: labelW, y: 0,
      width: Math.max(1, this.rect.width - labelW - valueW),
      height: this.rect.height,
    };
    return sliderTrack(inner, 0, uiPx(3));
  }

  private beginGrab(pointer: Phaser.Input.Pointer): void {
    this.grabbed = true;
    this.onGrabChange?.(true);
    this.drag(pointer);
  }

  private drag(pointer: Phaser.Input.Pointer): void {
    if (!this.grabbed || !pointer.isDown) return;
    const track = this.track();
    const localX = pointer.x - this.container.x;
    const amount = sliderHit(track, localX);
    if (amount === null) return;
    this.setValue(this.opts.min + amount * (this.opts.max - this.opts.min));
  }

  private endGrab(): void {
    if (!this.grabbed) return;
    this.grabbed = false;
    this.onGrabChange?.(false);
  }

  private clampSnap(value: number): number {
    const { min, max, step } = this.opts;
    let v = Math.max(min, Math.min(max, value));
    if (step > 0) {
      const steps = Math.round((v - min) / step);
      v = min + steps * step;
    }
    return Number(v.toFixed(6));
  }

  private readout(): string {
    return this.opts.format ? this.opts.format(this.value) : String(Math.round(this.value));
  }

  private redraw(): void {
    const c = activeColors();
    const track = this.track();
    this.gfx.clear();
    drawInset(this.gfx, track, 1, c);
    drawBar(this.gfx, sliderFill(track, this.fraction), c.ooze, 1);
    drawKnob(this.gfx, sliderKnobX(track, this.fraction), track.y + Math.floor(track.height / 2), track.height + uiPx(4), c);
    this.valueText?.setText(this.readout());
  }

  destroy(): void {
    this.unsubscribe();
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerup', this.onUp);
    this.container.destroy();
  }
}
