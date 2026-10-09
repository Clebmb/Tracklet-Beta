/**
 * HostExitPrompt — "EXIT TO THE ...?" with a YES and a NO.
 *
 * The last thing an editor opened by a launcher needs: one key — Escape — that
 * means "I am done", asked as a question rather than obeyed, because leaving
 * throws away whatever is on screen. It is here, in the framework, because all
 * of the kit's editors need exactly the same object and because it is a *UI*
 * object: a shade, a frame, a question and two buttons, drawn in the theme.
 *
 * What it deliberately does NOT own:
 *
 *   • the decision that Escape means "leave". That is the app's, because only
 *     the app knows whether something is open in front of it (a menu, a dialog,
 *     a half-typed name) — and a prompt that appeared over a menu would be
 *     answering a question nobody asked. See `readLaunch` for the other half of
 *     the contract: an app offers this only when something actually launched it.
 *
 *   • the navigation. `onConfirm` is the caller's, with a sensible default: go
 *     to the launcher's URL, or back a page when it did not give one.
 *
 * The prompt is a self-contained overlay — its own shade, its own Graphics and
 * its own input zones — created when it opens and destroyed when it closes, so
 * a covered editor cannot be clicked while it is up and nothing is left behind
 * after it goes.
 *
 * ## Sizes, in this fork of the framework
 *
 * This copy of the UI carries the global `uiScale` knob, so `uiText`, `Button`,
 * `Panel` and `drawPanel` all multiply their own *size-like* options by it
 * internally. That splits the arithmetic here in two, and the split is the
 * framework's own rule rather than a local convention:
 *
 *   `this.px(n)`  — GEOMETRY: a rect, an offset, a button's width. Canvas
 *                   pixels, because a canvas is a fixed number of pixels and
 *                   nothing but the caller can re-lay an app out.
 *   `size: n`     — a FONT SIZE, left in design units so the component scales
 *                   it exactly once. Multiplying it here as well would square
 *                   the scale — an 18px title on a studio that draws at 1.5x.
 *
 * `scale` is therefore the geometry multiplier, and an app that never sets
 * `uiScale` (every caller of this file but Noislet) sees `px()` as the
 * identity when it leaves `scale` alone.
 */

import type Phaser from 'phaser';
import { Button } from '../components/Button';
import { activeColors, onThemeChanged } from '../theme/themes';
import { drawPanel } from '../styles/panels';
import { uiText } from '../styles/text';
import type { Rect } from '../types';
import { exitKey } from './exitAnswer';
import { hostBackUrl, type HostLaunch } from './launch';

/** Above windows (900+) and any app chrome; the prompt is the top of the app. */
const DEFAULT_DEPTH = 2000;

const PANEL_WIDTH = 300;
const PANEL_HEIGHT = 96;
const BUTTON_WIDTH = 96;
const BUTTON_HEIGHT = 20;
const TITLE_SIZE = 12;
const BUTTON_TEXT_SIZE = 8;

export interface HostExitPromptOptions {
  /** The question. Default `EXIT TO THE DOODADARIUM?` — the kit's own name. */
  title?: string;
  /** What YES does. Default: navigate to the launcher (or back a page). */
  onConfirm?: (launch: HostLaunch) => void;
  /** Called after the prompt closes, however it went. */
  onClose?: () => void;
  /** The area to shade, in world coordinates. Default: the whole camera. */
  bounds?: Rect;
  /** Depth the overlay starts at. */
  depth?: number;
  /** Which option starts focused. The safe answer, NO, unless told otherwise. */
  focus?: 'yes' | 'no';
  /**
   * A multiplier on the GEOMETRY above, for an app drawn larger than the 8px
   * design grid (Noislet's studio is authored at 1.5x). Font sizes are not
   * multiplied here — the components scale those themselves.
   */
  scale?: number;
}

/** Everything `open` builds, kept together so `close` can take it apart again. */
interface Built {
  shade: Phaser.GameObjects.Graphics;
  blocker: Phaser.GameObjects.Zone;
  frame: Phaser.GameObjects.Graphics;
  title: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
  yes: Button;
  no: Button;
}

export class HostExitPrompt {
  /** What the app was launched by, and how to get back. */
  readonly launch: HostLaunch;

  private readonly scene: Phaser.Scene;
  private readonly opts: HostExitPromptOptions;
  private built: Built | null = null;
  private focusIsYes: boolean;
  private unsubscribe: () => void = () => undefined;
  private readonly scale: number;

  constructor(scene: Phaser.Scene, launch: HostLaunch, options: HostExitPromptOptions = {}) {
    this.scene = scene;
    this.launch = launch;
    this.opts = options;
    this.focusIsYes = options.focus === 'yes';
    this.scale = options.scale ?? 1;
  }

  /** A design-grid LENGTH in canvas px for this app (geometry only). */
  private px(design: number): number {
    return Math.round(design * this.scale);
  }

  get isOpen(): boolean {
    return this.built !== null;
  }

  /** The bounds the shade covers: the camera's own frame unless told otherwise. */
  private bounds(): Rect {
    if (this.opts.bounds) return this.opts.bounds;
    return { x: 0, y: 0, width: this.scene.scale.width, height: this.scene.scale.height };
  }

  /** The frame, centred in the shaded area, at this app's scale. */
  private panelRect(): Rect {
    const area = this.bounds();
    const width = this.px(PANEL_WIDTH);
    const height = this.px(PANEL_HEIGHT);
    return {
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height,
    };
  }

  open(): void {
    if (this.built) return;
    const depth = this.opts.depth ?? DEFAULT_DEPTH;
    const area = this.bounds();
    const panel = this.panelRect();
    const x = panel.x;
    const y = panel.y;

    const shade = this.scene.add.graphics().setDepth(depth);
    shade.fillStyle(activeColors().ink, 0.72);
    shade.fillRect(area.x, area.y, area.width, area.height);

    const frame = this.scene.add.graphics().setDepth(depth + 1);
    // Swallow clicks on the shade, so the editor behind cannot be used while the
    // question is up. A zone rather than a hit test: Phaser already routes it.
    const blocker = this.scene.add.zone(area.x, area.y, area.width, area.height)
      .setOrigin(0, 0)
      .setInteractive();
    blocker.setDepth(depth + 1);
    blocker.on('pointerdown', () => undefined);

    const title = uiText(this.scene, x + Math.round(panel.width / 2), y + this.px(10), this.title(), {
      size: TITLE_SIZE, origin: { x: 0.5, y: 0 },
    }).setDepth(depth + 2);

    const buttonY = y + this.px(34);
    const yes = new Button(
      this.scene,
      { x: x + this.px(16), y: buttonY, width: this.px(BUTTON_WIDTH), height: this.px(BUTTON_HEIGHT) },
      'YES',
      { size: BUTTON_TEXT_SIZE },
    );
    yes.container.setDepth(depth + 2);
    yes.onPress = () => this.confirm();
    yes.onHover = (over) => { if (over) this.setFocus(true); };
    yes.setFocused(this.focusIsYes);

    const no = new Button(
      this.scene,
      {
        x: x + panel.width - this.px(16) - this.px(BUTTON_WIDTH),
        y: buttonY, width: this.px(BUTTON_WIDTH), height: this.px(BUTTON_HEIGHT),
      },
      'NO',
      { size: BUTTON_TEXT_SIZE },
    );
    no.container.setDepth(depth + 2);
    no.onPress = () => this.close();
    no.onHover = (over) => { if (over) this.setFocus(false); };
    no.setFocused(!this.focusIsYes);

    const hint = uiText(
      this.scene, x + Math.round(panel.width / 2), y + panel.height - this.px(14),
      'ARROWS CHOOSE   ENTER CHOOSES IT   Y OR N ANSWERS',
      { size: BUTTON_TEXT_SIZE, origin: { x: 0.5, y: 0 } },
    ).setDepth(depth + 2);

    this.built = { shade, blocker, frame, title, hint, yes, no };
    this.paintFrame();
    this.unsubscribe = onThemeChanged(() => this.repaint());
  }

  close(): void {
    const built = this.built;
    if (!built) return;
    this.built = null;
    this.unsubscribe();
    this.unsubscribe = () => undefined;
    built.shade.destroy();
    built.blocker.destroy();
    built.frame.destroy();
    built.title.destroy();
    built.hint.destroy();
    built.yes.destroy();
    built.no.destroy();
    this.opts.onClose?.();
  }

  /**
   * Handle a keydown. Returns whether the prompt used the key, so the caller can
   * stop it before the editor's own shortcuts see it. False when closed.
   */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.built) return false;
    // Which key means what is `exitAnswer.ts`'s, so it is tested without a canvas
    // — including the case that used to be wrong in every app at once: Enter
    // answering YES whatever the highlight was on, while NO starts highlighted.
    const meaning = exitKey(event.key, this.focusIsYes ? 'yes' : 'no');
    switch (meaning.kind) {
      case 'answer':
        if (meaning.choice === 'yes') this.confirm();
        else this.close();
        return true;
      case 'focus':
        this.setFocus(meaning.choice === 'yes');
        return true;
      default:
        return false;
    }
  }

  destroy(): void {
    this.close();
  }

  /** Answer the question: leave. */
  private confirm(): void {
    const handler = this.opts.onConfirm ?? ((launch: HostLaunch) => this.leaveTo(launch));
    this.close();
    handler(this.launch);
  }

  private leaveTo(launch: HostLaunch): void {
    if (typeof window === 'undefined') return;
    const url = hostBackUrl(launch);
    if (url !== null) window.location.assign(url);
    else window.history.back();
  }

  private title(): string {
    return this.opts.title ?? 'EXIT TO THE DOODADARIUM?';
  }

  private setFocus(yes: boolean): void {
    if (!this.built) return;
    this.focusIsYes = yes;
    this.built.yes.setFocused(yes);
    this.built.no.setFocused(!yes);
  }

  private repaint(): void {
    if (!this.built) return;
    const colors = activeColors();
    this.built.title.setColor(css(colors.wordmark));
    this.built.hint.setColor(css(colors.textDim));
    this.paintFrame();
  }

  private paintFrame(): void {
    if (!this.built) return;
    const g = this.built.frame;
    g.clear();
    drawPanel(g, this.panelRect(), 1, activeColors());
  }
}

function css(color: number): string {
  return '#' + (color >>> 0 & 0xffffff).toString(16).padStart(6, '0');
}
