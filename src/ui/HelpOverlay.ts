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
} from 'phaser-ui-canvas';
import {
  BODY,
  COL_W,
  COPY_TOP,
  FOOT_RULE_Y,
  HELP_COLUMNS,
  KEY_W,
  LINE_H,
  MODAL,
  SECTION_GAP,
  VIEW,
  helpContentHeight,
  helpPageLines,
  helpRowInView,
  helpScrollBy,
  helpScrollLimit,
} from './helpBoard';

/**
 * HelpOverlay — the F1 menu: every key, click and function the app has, on one
 * screen.
 *
 * It exists because the inspector's five-line legends can only ever answer
 * "what do I do next". A tracker has a real vocabulary — two piano rows, an
 * octave shift, patterns, channel editing, undo — and a beginner who cannot
 * find it either pokes at the mouse until something happens or gives up. One
 * key (F1, the universal "help") that lists the whole vocabulary is the
 * cheapest fix there is, and it doubles as the map a new player reads first.
 *
 * It is drawn the way the SCRIPT modal is drawn, and for the same reason: a dim
 * layer, a full-screen curtain that swallows clicks meant for the app behind
 * it, a `drawPanel` frame, and pooled `uiText` for the copy. There is no DOM
 * element here, because the menu is read-only — nothing to select, paste or
 * type — so it can live entirely in canvas and inherit the active theme.
 *
 * The copy is DATA (`COLUMNS` below), laid out with a running y per column. A
 * new control is a new row, not a new block of drawing code, and the two
 * columns stay balanced by eye.
 */

export interface HelpOverlayHandlers {
  /** The menu opened or closed, so the scene can pause its own input. */
  onOpenChange?: (open: boolean) => void;
}

/** The canvas the app is drawn in. */
const CANVAS_W = 720;
const CANVAS_H = 405;

/** Render depths: dim < curtain < frame < text. Above the toast at 950. */
const DEPTH_DIM = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_FRONT = 980;

/** Which theme colour a piece of copy wears, so a recolour can find it. */
type TextRole = 'heading' | 'body' | 'accent' | 'dim';

interface Copy {
  obj: Phaser.GameObjects.Text;
  role: TextRole;
  /** Where the row sits at rest, before any scrolling: the scroll moves from here. */
  y: number;
  /** False for the title and the footer — the frame's own copy, which never moves. */
  scrolls: boolean;
}

export class HelpOverlay {
  private readonly scene: Phaser.Scene;
  private readonly handlers: HelpOverlayHandlers;

  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly closeButton: Button;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly copy: Copy[] = [];

  /** Kept on the instance so the scene's wheel listener can be taken back off. */
  private readonly onWheel: (
    pointer: Phaser.Input.Pointer,
    over: Phaser.GameObjects.GameObject[],
    dx: number,
    dy: number,
  ) => void;

  private opened = false;
  private readonly unsubscribe: () => void;

  /**
   * How far the copy may be scrolled, in pixels, always a whole number of lines.
   *
   * Zero would mean the page fits — and then the bar, the hint and the keys are
   * all absent, which is the honest way to say "there is nothing below".
   */
  private readonly scrollLimit = helpScrollLimit(HELP_COLUMNS);
  private scrollY = 0;

  constructor(scene: Phaser.Scene, handlers: HelpOverlayHandlers = {}) {
    this.scene = scene;
    this.handlers = handlers;

    this.dim = scene.add.graphics().setDepth(DEPTH_DIM);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);

    // Under the copy, so the bar can never cross a word — the frame's own
    // furniture, like the rules it is drawn beside.
    this.bar = scene.add.graphics().setDepth(DEPTH_FRAME);

    // A full-screen zone in front of the app, so a stray click under the menu
    // cannot edit the song. It also dismisses the menu, because a modal you
    // cannot leave by clicking is worse than no modal.
    this.curtain = scene.add.zone(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);
    this.curtain.on('pointerdown', () => this.hide());

    // The wheel is the one gesture a reader tries without being told to, so the
    // page takes it while it is up and ignores it otherwise: a wheel over the
    // tracker is the tracker's, and the scene must never scroll the grid out
    // from under a menu that is only pretending to be gone.
    this.onWheel = (_pointer, _over, _dx, dy) => {
      if (this.opened && dy !== 0) this.scrollLines(dy > 0 ? 1 : -1);
    };
    scene.input.on('wheel', this.onWheel);

    this.buildCopy();

    const btnW = 116;
    this.closeButton = new Button(scene, {
      x: MODAL.x + MODAL.width - btnW - 6,
      y: MODAL.y + MODAL.height - 26,
      width: btnW,
      height: 20,
    }, 'CLOSE', { size: 8, icon: 'close' });
    this.closeButton.container.setDepth(DEPTH_FRONT);
    this.closeButton.onPress = () => this.hide();

    this.unsubscribe = onThemeChanged(() => this.render());
    this.setOpen(false);
    this.render();
  }

  /** True while the menu is up; the scene pauses itself while it is. */
  get isOpen(): boolean {
    return this.opened;
  }

  show(): void { this.setOpen(true); }
  hide(): void { this.setOpen(false); }
  toggle(): void { this.setOpen(!this.opened); }

  private setOpen(open: boolean): void {
    // Only report a CHANGE: the constructor closes once to reach a known state,
    // and the scene would otherwise hear "closed" before its input exists.
    const changed = open !== this.opened;
    this.opened = open;
    // Opening starts at the top: a menu read to the bottom and closed is a menu
    // whose beginning should be there the next time it is asked for.
    if (changed && open) this.scrollY = 0;
    this.dim.setVisible(open);
    this.frame.setVisible(open);
    this.curtain.setVisible(open);
    this.closeButton.container.setVisible(open);
    this.bar.setVisible(open);
    this.layout();
    if (changed) this.handlers.onOpenChange?.(open);
  }

  /**
   * Put every row where the scroll says it goes, and show only the rows the
   * window can hold WHOLE.
   *
   * The copy is not clipped by a mask, it is filtered: a row is drawn or it is
   * not, never half of one. That is possible only because the rows sit on an
   * [`LINE_H`] lattice and the scroll moves by whole lines — the two facts the
   * board is built on — and it is why a section gap of six pixels had to become
   * one blank line: six put every row after the first section half-way between
   * two positions, and a half-shown row is exactly what this avoids.
   */
  private layout(): void {
    for (const entry of this.copy) {
      if (!entry.scrolls) {
        entry.obj.setVisible(this.opened);
        continue;
      }
      entry.obj.setY(entry.y - this.scrollY);
      entry.obj.setVisible(this.opened && helpRowInView(entry.y, this.scrollY));
    }
    this.drawBar();
  }

  /**
   * Scroll by whole lines.
   *
   * Nothing here decides how far is allowed: [`helpScrollBy`] clamps to the
   * range the board measured, so a wheel that keeps spinning at either end can
   * only sit still.
   */
  private scrollLines(lines: number): void {
    const next = helpScrollBy(this.scrollY, lines, this.scrollLimit);
    if (next === this.scrollY) return;
    this.scrollY = next;
    this.layout();
  }

  /**
   * The keys the open menu answers.
   *
   * The scene hands every key here while the menu is up and acts on none of
   * them itself, so this is the whole keyboard contract of the menu: scroll, or
   * ignore. `ESC` stays with the scene, because closing a modal is not the
   * modal's business.
   */
  handleKey(e: KeyboardEvent): void {
    if (this.scrollLimit <= 0) return;
    switch (e.code) {
      case 'ArrowDown': this.scrollLines(1); break;
      case 'ArrowUp': this.scrollLines(-1); break;
      case 'PageDown': this.scrollLines(helpPageLines()); break;
      case 'PageUp': this.scrollLines(-helpPageLines()); break;
      case 'Home': this.scrollLines(-this.scrollLimit / LINE_H); break;
      case 'End': this.scrollLines(this.scrollLimit / LINE_H); break;
      default: return;
    }
    e.preventDefault();
  }

  /**
   * The bar down the right edge, which is the only thing that says "there is
   * more" to somebody who has not thought to scroll.
   *
   * The thumb's length is the share of the page the window is showing, and it
   * is drawn even when the copy is short enough to fit — a bar with nothing to
   * travel is still the answer to "is this all of it?".
   */
  private drawBar(): void {
    const c = activeColors();
    this.bar.clear();
    if (this.scrollLimit <= 0) return;

    const x = MODAL.x + MODAL.width - 4;
    const length = Math.round(VIEW.height * (VIEW.height / helpContentHeight(HELP_COLUMNS)));
    const thumb = Math.max(18, Math.min(VIEW.height, length));
    const travel = VIEW.height - thumb;
    const at = Math.round(travel * (this.scrollY / this.scrollLimit));

    this.bar.fillStyle(c.textDim, 0.25);
    this.bar.fillRect(x, VIEW.y, 3, VIEW.height);
    this.bar.fillStyle(c.textDim, 0.9);
    this.bar.fillRect(x, VIEW.y + at, 3, thumb);
  }

  /**
   * The menu is static, so its Text objects are built ONCE and only recoloured
   * when the theme changes. Building them per open would put a few dozen Text
   * creations on the one keystroke a stuck beginner is most likely to press.
   */
  private buildCopy(): void {
    const body = BODY;
    this.addText(MODAL.x + 4, MODAL.y + 2, 'CONTROLS  -  EVERY KEY, CLICK AND BUTTON', 'accent', false);

    const colX = [body.x, body.x + COL_W];
    HELP_COLUMNS.forEach((sections, column) => {
      // The one y every row in both columns is measured from: the board's copy
      // top, so the drawn page and the page the board measured are the same
      // page. A missing `+ 2` here is a row that scrolls out of reach.
      let y = COPY_TOP;
      for (const section of sections) {
        this.addText(colX[column], y, section.title, 'heading', true);
        y += LINE_H;
        for (const row of section.rows) {
          this.addText(colX[column], y, row.keys, 'accent', true);
          this.addText(colX[column] + KEY_W, y, row.action, 'body', true);
          y += LINE_H;
        }
        y += SECTION_GAP;
      }
    });

    const footTop = FOOT_RULE_Y + 6;
    this.addText(body.x, footTop, 'EVERY CONTROL HERE HAS A SCRIPT EQUIVALENT.', 'dim', false);
    this.addText(body.x, footTop + LINE_H, "SEE doc/03-script-reference.md", 'accent', false);
    // The hint is a promise about the page: it is only there when scrolling is
    // possible, so it cannot tell a reader to scroll a page that fits.
    const closeHint = this.scrollLimit > 0
      ? 'PRESS F1 OR ESC TO CLOSE   -   SCROLL: WHEEL, UP / DOWN, PGUP / PGDN'
      : 'PRESS F1 OR ESC, OR CLICK ANYWHERE, TO CLOSE';
    this.addText(body.x, footTop + LINE_H * 2, closeHint, 'dim', false);
  }

  private addText(x: number, y: number, text: string, role: TextRole, scrolls: boolean): void {
    const obj = uiText(this.scene, x, y, text, { size: 8, color: activeColors().textPrimary });
    obj.setDepth(DEPTH_FRONT);
    this.copy.push({ obj, role, y, scrolls });
  }

  render(): void {
    const c = activeColors();
    const theme = activeTheme();

    this.dim.clear();
    this.dim.fillStyle(c.ink, 0.8);
    this.dim.fillRect(0, 0, CANVAS_W, CANVAS_H);

    this.frame.clear();
    drawPanel(this.frame, MODAL, 1, c);
    drawDivider(this.frame, MODAL.x + 2, MODAL.y + 12, MODAL.width - 4, 1, c);
    drawDivider(this.frame, MODAL.x + 4, FOOT_RULE_Y, MODAL.width - 8, 1, c);

    const roleColor: Record<TextRole, number> = {
      heading: c.textDim,
      body: c.textPrimary,
      accent: theme.colors.ooze,
      dim: c.textDim,
    };
    for (const entry of this.copy) entry.obj.setColor(intToCss(roleColor[entry.role]));
    this.drawBar();
  }

  destroy(): void {
    this.unsubscribe();
    this.scene.input.off('wheel', this.onWheel);
    for (const entry of this.copy) entry.obj.destroy();
    this.closeButton.destroy();
    this.dim.destroy();
    this.frame.destroy();
    this.bar.destroy();
    this.curtain.destroy();
  }
}
