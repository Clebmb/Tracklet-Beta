import type Phaser from 'phaser';
import {
  activeColors,
  activeTheme,
  Button,
  drawDivider,
  drawPanel,
  intToCss,
  onThemeChanged,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';

import { historyRows, type HistoryRow, type HistoryStep } from './historyRows';
import { menuIntent } from './menuKeys';

/**
 * HistoryMenu — the F10 menu: the steps you took, newest first, as a list you can
 * jump back to.
 *
 * Undo already works one press at a time, and that is the right default. What it
 * cannot answer is "what have I done?" — a `Ctrl+Z` that lands somewhere
 * unexpected is a guess, and after a dozen edits nobody remembers the order. So
 * this screen shows the TIMELINE: the state on screen, then each step back with
 * the change that made it written beside it (`TEMPO 120 -> 128`, `CHANNEL 2 -
 * BASS`, `NOTES +6`), read from the snapshots themselves rather than from a
 * label anyone had to remember to write.
 *
 * Jumping is the same mechanism as undoing, run several times in a row — so a
 * jump leaves the redo branch exactly where one press at a time would have, and
 * editing afterwards discards it. Nothing here is special-cased, which is why it
 * cannot disagree with `Ctrl+Z` about what the past is.
 *
 * It is a plain canvas modal like F1 and F3: read-only except for the jump, no
 * DOM, no audio, and one undoable effect.
 */

export interface HistoryMenuHandlers {
  /** The menu opened or closed, so the scene can pause its own input. */
  onOpenChange?: (open: boolean) => void;
  /** The undo stack, OLDEST first — what `History.states()` hands back. */
  steps: () => readonly HistoryStep[];
  /** The state on screen now, which the stack does not contain. */
  current: () => HistoryStep;
  /** Go `back` steps into the past (0 is the present) and report nothing. */
  goTo: (back: number) => void;
}

/** The canvas the app is drawn in. */
const CANVAS_W = 720;
const CANVAS_H = 405;

/** The menu frame, in canvas coordinates. */
const MODAL: Rect = { x: 96, y: 30, width: 528, height: 340 };

/** Render depths: dim < curtain < frame < text. Above the toast at 950. */
const DEPTH_DIM = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_FRONT = 980;

const BODY_X = MODAL.x + 8;
const BODY_W = MODAL.width - 16;
const LIST_TOP = MODAL.y + 30;
const LINE_H = 15;
const VISIBLE = 15;
const LABEL_W = 64;

export class HistoryMenu {
  private readonly scene: Phaser.Scene;
  private readonly handlers: HistoryMenuHandlers;

  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly rowLayer: Phaser.GameObjects.Container;
  private readonly closeButton: Button;

  private rowTexts: Phaser.GameObjects.Text[] = [];
  private titleObj: Phaser.GameObjects.Text | null = null;
  private hintObj: Phaser.GameObjects.Text | null = null;

  private rows: HistoryRow[] = [];
  private selected = 0;
  private top = 0;
  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: HistoryMenuHandlers) {
    this.scene = scene;
    this.handlers = handlers;

    this.dim = scene.add.graphics().setDepth(DEPTH_DIM);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.rowLayer = scene.add.container(0, 0).setDepth(DEPTH_FRONT + 1);

    // A full-screen zone in front of the app, so a stray click cannot edit the
    // song, and so clicking away dismisses the menu like every other one here.
    this.curtain = scene.add.zone(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);
    this.curtain.on('pointerdown', () => this.hide());

    const btnW = 116;
    this.closeButton = new Button(scene, {
      x: MODAL.x + MODAL.width - btnW - 8,
      y: MODAL.y + MODAL.height - 28,
      width: btnW,
      height: 20,
    }, 'CLOSE', { size: 8, icon: 'close' });
    this.closeButton.container.setDepth(DEPTH_FRONT);
    this.closeButton.onPress = () => this.hide();

    this.unsubscribe = onThemeChanged(() => this.render());
    this.setOpen(false);
    this.render();
  }

  get isOpen(): boolean { return this.opened; }

  show(): void {
    this.selected = 0;
    this.top = 0;
    this.setOpen(true);
    this.render();
  }

  hide(): void { this.setOpen(false); }
  toggle(): void { if (this.opened) this.hide(); else this.show(); }

  /** Arrows move, Enter jumps to the highlighted step, Esc closes. */
  handleKey(e: KeyboardEvent): void {
    const intent = menuIntent(e.code);
    if (intent === 'close') { e.preventDefault(); this.hide(); return; }
    if (intent === 'up') { e.preventDefault(); this.move(-1); return; }
    if (intent === 'down') { e.preventDefault(); this.move(1); return; }
    if (intent === 'first') { e.preventDefault(); this.select(0); return; }
    if (intent === 'last') { e.preventDefault(); this.select(this.rows.length - 1); return; }
    if (intent === 'pick') { e.preventDefault(); this.jump(); }
  }

  private move(delta: number): void {
    this.select(this.selected + delta);
  }

  private select(index: number): void {
    if (this.rows.length === 0) return;
    this.selected = Math.max(0, Math.min(this.rows.length - 1, index));
    if (this.selected < this.top) this.top = this.selected;
    if (this.selected >= this.top + VISIBLE) this.top = this.selected - VISIBLE + 1;
    this.render();
  }

  /**
   * Go back to the highlighted state.
   *
   * The list is REBUILT from the stack afterwards rather than adjusted by hand:
   * after a jump the timeline is shorter by however many steps were taken, and a
   * list that patched itself would be a second opinion about that.
   */
  private jump(): void {
    const back = this.selected;
    if (back === 0) return;
    this.handlers.goTo(back);
    this.selected = 0;
    this.top = 0;
    this.render();
  }

  private setOpen(open: boolean): void {
    const changed = open !== this.opened;
    this.opened = open;
    this.dim.setVisible(open);
    this.frame.setVisible(open);
    this.curtain.setVisible(open);
    this.closeButton.container.setVisible(open);
    this.rowLayer.setVisible(open);
    if (changed) this.handlers.onOpenChange?.(open);
  }

  render(): void {
    const c = activeColors();
    const theme = activeTheme();

    this.rows = historyRows(this.handlers.steps(), this.handlers.current());

    this.dim.clear();
    this.dim.fillStyle(c.ink, 0.8);
    this.dim.fillRect(0, 0, CANVAS_W, CANVAS_H);

    this.frame.clear();
    drawPanel(this.frame, MODAL, 1, c);
    drawDivider(this.frame, MODAL.x + 2, MODAL.y + 14, MODAL.width - 4, 1, c);
    drawDivider(this.frame, MODAL.x + 8, MODAL.y + MODAL.height - 40, MODAL.width - 16, 1, c);

    if (!this.titleObj) {
      this.titleObj = uiText(this.scene, MODAL.x + 4, MODAL.y + 2, '', { size: 8, color: theme.colors.ooze });
      this.titleObj.setDepth(DEPTH_FRONT);
      this.hintObj = uiText(this.scene, BODY_X, MODAL.y + MODAL.height - 30, '', { size: 8, color: c.textDim });
      this.hintObj.setDepth(DEPTH_FRONT);
    }
    const depth = this.rows.length - 1;
    this.titleObj.setText(`HISTORY  -  ${depth} STEP${depth === 1 ? '' : 'S'} BACK`);
    this.titleObj.setColor(intToCss(theme.colors.ooze));
    this.titleObj.setVisible(this.opened);
    this.hintObj?.setText('ARROWS MOVE   ENTER GO BACK TO IT   ESC CLOSES');
    this.hintObj?.setColor(intToCss(c.textDim));
    this.hintObj?.setVisible(this.opened);

    for (const text of this.rowTexts) text.destroy();
    this.rowTexts = [];

    for (let i = 0; i < Math.min(VISIBLE, this.rows.length); i += 1) {
      const index = this.top + i;
      const row = this.rows[index];
      if (row === undefined) break;
      const y = LIST_TOP + i * LINE_H;
      const selected = index === this.selected;
      if (selected) {
        this.frame.fillStyle(c.ooze, 0.18);
        this.frame.fillRect(BODY_X - 4, y - 2, BODY_W + 8, LINE_H - 1);
        this.frame.fillStyle(c.ooze, 0.9);
        this.frame.fillRect(BODY_X - 4, y - 2, 2, LINE_H - 1);
      }
      this.push(BODY_X, y, row.label, selected ? c.ward : c.textDim);
      this.push(BODY_X + LABEL_W, y, row.detail, selected ? c.textPrimary : c.textDim);
    }

    for (const text of this.rowTexts) text.setVisible(this.opened);
  }

  private push(x: number, y: number, text: string, color: number): void {
    const obj = uiText(this.scene, x, y, text, { size: 8, color });
    obj.setDepth(DEPTH_FRONT + 2);
    this.rowLayer.add(obj);
    this.rowTexts.push(obj);
  }

  destroy(): void {
    this.unsubscribe();
    for (const text of this.rowTexts) text.destroy();
    this.titleObj?.destroy();
    this.hintObj?.destroy();
    this.closeButton.destroy();
    this.dim.destroy();
    this.frame.destroy();
    this.rowLayer.destroy();
    this.curtain.destroy();
  }
}
