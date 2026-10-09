import type Phaser from 'phaser';
import { drawPanel } from '../styles/panels';
import { uiPx } from '../styles/scale';
import { uiText } from '../styles/text';
import { intToCss } from '../styles/color';
import { activeColors } from '../theme/themes';

/**
 * Toast — bottom-right notification badges.
 *
 * One badge shows at a time (the rest queue); each slides in from the right,
 * holds, then fades out. It is drawn with the same framed-panel painter as
 * everything else, so a toast reads as part of the same UI family.
 *
 * Extend it with `show(text, color)`; the queue is capped so a burst of events
 * cannot stack minutes of toasts.
 */

export interface ToastOptions {
  /** Right-edge anchor in canvas px. */
  x?: number;
  /** Bottom-edge anchor in canvas px. */
  y?: number;
  /** Total visible time per badge (ms). */
  showMs?: number;
  /** Slide in/out duration (ms). */
  slideMs?: number;
  /** Render depth. */
  depth?: number;
  /** Default text tint when `show` is called without one. */
  color?: number;
  /** Largest number of queued badges. */
  maxQueue?: number;
}

interface QueuedToast { text: string; color: number; }

const DEFAULTS = {
  x: 316, y: 168, showMs: 1400, slideMs: 160, depth: 910, color: 0xfef3c0, maxQueue: 5,
};

export class Toast {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly opts: Required<ToastOptions>;
  private queue: QueuedToast[] = [];
  private active: QueuedToast | null = null;
  private activeT = 0;
  private tween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, options: ToastOptions = {}) {
    this.scene = scene;
    this.opts = { ...DEFAULTS, ...options };

    this.container = scene.add.container(this.opts.x, this.opts.y)
      .setScrollFactor(0).setDepth(this.opts.depth).setAlpha(0);
    this.gfx = scene.add.graphics();
    this.label = uiText(scene, 0, 0, '', { size: 8, origin: { x: 1, y: 0.5 } });
    this.container.add([this.gfx, this.label]);
  }

  /** Queue a badge: text + value tint (default = a warm coin gold). */
  show(text: string, color: number = this.opts.color): void {
    this.queue.push({ text, color });
    if (this.queue.length > this.opts.maxQueue) this.queue.shift();
  }

  /** Drive it from the scene's update loop. `dt` is in seconds. */
  update(dt: number): void {
    if (!this.active && this.queue.length > 0) {
      this.active = this.queue.shift()!;
      this.activeT = 0;
      this.label.setText(this.active.text);
      this.label.setColor(intToCss(this.active.color));
      this.drawBadge();
      this.container.setAlpha(0).setX(this.opts.x + uiPx(10));
      this.tween?.stop();
      this.tween = this.scene.tweens.add({
        targets: this.container, alpha: 1, x: this.opts.x,
        duration: this.opts.slideMs, ease: 'Quad.easeOut',
      });
    }

    if (this.active) {
      this.activeT += dt * 1000;
      if (this.activeT > this.opts.showMs) {
        this.active = null;
        this.tween?.stop();
        this.tween = this.scene.tweens.add({
          targets: this.container, alpha: 0, x: this.opts.x + uiPx(6),
          duration: this.opts.slideMs, ease: 'Quad.easeIn',
        });
      }
    }
  }

  /** Draw the badge panel around the current label. */
  private drawBadge(): void {
    const c = activeColors();
    const w = this.label.width + uiPx(10);
    const h = uiPx(12);
    const x = -w;      // right-anchored: the badge extends left from the anchor
    const y = -h / 2;
    this.gfx.clear();
    drawPanel(this.gfx, { x, y, width: w, height: h }, 1, c);
  }

  destroy(): void {
    this.tween?.stop();
    this.container.destroy();
  }
}
