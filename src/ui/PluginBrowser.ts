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

import { wrap } from './instrumentRows';
import { clampPluginSelection, emptyPluginText } from './pluginBoard';
import { NO_ARM, stepRemoval, type RemovalArm } from './removalArm';
import { menuIntent } from './menuKeys';

/**
 * PluginBrowser — the installed plugin bundles as rows, opened from the F2
 * menu because every `F` key is spoken for (the `drumMachine` precedent: a
 * FILE-menu row rather than a key).
 *
 * ── Why it is dumb on purpose ────────────────────────────────────────────────
 * Like its F6 sibling it owns layout and scrolling and exactly no content:
 * the scene hands it `{ id, label, detail }` rows computed from the registry,
 * the grants and the meter through `pluginBoard.ts`, and the view only shows
 * them. A row the scene did not compute cannot appear here, so the screen can
 * never disagree with the shelves — every action repaints from a fresh read.
 *
 * ── What the keys do, and do not ─────────────────────────────────────────────
 * Arrows browse; Enter allows the row's next pending word; `X` takes back the
 * row's next granted word; `DEL` forgets, armed the `removalArm` way (the
 * second press removes the row the FIRST press was about, never the row you
 * walked to since). There is deliberately no enable/disable key: enabled
 * flags are session-only (the library persists manifests, not switches), and
 * a switch that silently resets on reload would be a trap, not a control.
 * Granting, denying and forgetting all persist; the scene says each one in
 * words beside the repaint.
 */

export interface PluginBrowserRow {
  /** The plugin id: what the arm and the scene's actions name. */
  id: string;
  /** One line, already shaped by `pluginRowLabel`. */
  label: string;
  /** Wrapped detail lines, already shaped by `pluginDetail` and `wrap`. */
  detail: string[];
}

export interface PluginBrowserHandlers {
  /** The menu opened or closed, so the scene can pause its own input. */
  onOpenChange?: (open: boolean) => void;
  /** Allow the row's next pending word. The scene repaints after. */
  onAllow?: (id: string) => void;
  /** Take back the row's next granted word. The scene repaints after. */
  onDeny?: (id: string) => void;
  /** Forget the row, second DEL only. The scene uninstalled and repaints. */
  onDelete?: (id: string) => void;
}

const CANVAS_W = 720;
const CANVAS_H = 405;

/** The menu frame, in canvas coordinates: the F6 frame's own measure. */
const MODAL: Rect = { x: 32, y: 14, width: 656, height: 377 };

const DEPTH_DIM = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_FRONT = 980;

const LINE_H = 11;
/** The list on the left; the detail of the chosen row on the right. */
const LIST_X = MODAL.x + 6;
const LIST_W = 236;
const LIST_TOP = MODAL.y + 26;
const VISIBLE = 24;
const DETAIL_X = LIST_X + LIST_W + 14;
const DETAIL_W = MODAL.width - (DETAIL_X - MODAL.x) - 10;
/**
 * How wide a detail line may run, in characters, exported so the scene wraps
 * to the pane rather than guessing: six pixels a character is the WIDE end of
 * 8px UI type, so the wrap errs on the side of an extra line.
 */
export const PLUGIN_BROWSER_DETAIL_CHARS = Math.floor(DETAIL_W / 6);
/** How many detail lines the pane holds; the scene slices to this. */
export const PLUGIN_BROWSER_DETAIL_LINES = 12;

export class PluginBrowser {
  private readonly handlers: PluginBrowserHandlers;

  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly closeButton: Button;
  private readonly titleObj: Phaser.GameObjects.Text;
  private readonly hintObj: Phaser.GameObjects.Text;
  private readonly rowTexts: Phaser.GameObjects.Text[] = [];
  private readonly detailTexts: Phaser.GameObjects.Text[] = [];

  /** The rows on screen, newest refresh first: replaced wholesale, never edited. */
  private rows: PluginBrowserRow[] = [];
  private selected = 0;
  private top = 0;
  /** The row a first DEL marked, dropped the moment its id leaves the list. */
  private arm: RemovalArm = { ...NO_ARM };
  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: PluginBrowserHandlers = {}) {
    this.handlers = handlers;

    this.dim = scene.add.graphics().setDepth(DEPTH_DIM);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.highlight = scene.add.graphics().setDepth(DEPTH_FRAME + 1);

    this.curtain = scene.add.zone(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);
    this.curtain.on('pointerdown', () => this.hide());

    this.titleObj = uiText(scene, MODAL.x + 4, MODAL.y + 2, 'PLUGINS  -  INSTALLED BUNDLES, THEIR ASK, THEIR COST', {
      size: 8, color: activeTheme().colors.ooze,
    });
    this.titleObj.setDepth(DEPTH_FRONT);

    this.hintObj = uiText(scene, MODAL.x + 6, MODAL.y + MODAL.height - 40, '', {
      size: 8, color: activeColors().textDim,
    });
    this.hintObj.setDepth(DEPTH_FRONT);

    // One Text per visible row, built once and only moved, so scrolling is a
    // `setY` rather than a create/destroy storm on every arrow press.
    for (let i = 0; i < VISIBLE; i++) {
      const obj = uiText(scene, LIST_X, LIST_TOP + i * LINE_H, '', {
        size: 8, color: activeColors().textPrimary,
      });
      obj.setDepth(DEPTH_FRONT);
      this.rowTexts.push(obj);
    }

    for (let i = 0; i < PLUGIN_BROWSER_DETAIL_LINES; i++) {
      const obj = uiText(scene, DETAIL_X, LIST_TOP + i * LINE_H, '', { size: 8, color: activeColors().textPrimary });
      obj.setDepth(DEPTH_FRONT);
      this.detailTexts.push(obj);
    }

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

  get isOpen(): boolean { return this.opened; }

  /** The row the keys act on, into the last `setRows` list. */
  get selectedIndex(): number { return this.selected; }

  show(): void {
    this.setOpen(true);
    this.render();
  }

  hide(): void {
    // Leaving the chooser drops the arm: a confirmation that waited behind a
    // closed screen would be a delayed accident, the `removalArm` bargain.
    this.arm = { ...NO_ARM };
    this.setOpen(false);
  }

  /**
   * The list replaced wholesale: the scene's fresh read after every open and
   * every action. The selection clamps into what is left; the arm survives
   * only while its id does, so a repaint can never point it at a stranger.
   */
  setRows(rows: PluginBrowserRow[]): void {
    this.rows = rows;
    if (!rows.some((row) => row.id === this.arm.id)) this.arm = { ...NO_ARM };
    this.selected = clampPluginSelection(this.selected, rows.length);
    this.top = Math.max(0, Math.min(Math.max(0, rows.length - VISIBLE), this.top));
    this.scrollToSelection();
    this.render();
  }

  /**
   * Arrows browse, Enter allows, `X` takes back, `DEL` forgets twice, Esc
   * closes. `W A S D` are navigation here, the menu language everywhere else
   * in the app — so allowing is Enter, never `A`.
   */
  handleKey(e: KeyboardEvent): void {
    const intent = menuIntent(e.code);
    if (intent === 'close') { e.preventDefault(); this.hide(); return; }
    if (intent === 'up') { e.preventDefault(); this.move(-1); return; }
    if (intent === 'down') { e.preventDefault(); this.move(1); return; }
    if (intent === 'first') { e.preventDefault(); this.select(0); return; }
    if (intent === 'last') { e.preventDefault(); this.select(this.rows.length - 1); return; }
    if (intent === 'pick') {
      e.preventDefault();
      const row = this.rows[this.selected];
      if (row !== undefined) this.handlers.onAllow?.(row.id);
      return;
    }
    if (e.key === 'x' || e.key === 'X') {
      const row = this.rows[this.selected];
      if (row !== undefined) this.handlers.onDeny?.(row.id);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const row = this.rows[this.selected];
      const step = stepRemoval(this.arm, row?.id ?? null);
      this.arm = step.arm;
      if (step.kind === 'remove') this.handlers.onDelete?.(step.id);
      else this.render();
    }
  }

  private move(delta: number): void {
    this.select(this.selected + delta);
  }

  private select(index: number): void {
    this.selected = clampPluginSelection(index, this.rows.length);
    this.scrollToSelection();
    this.render();
  }

  /** Keep the chosen row on screen. */
  private scrollToSelection(): void {
    if (this.selected < this.top || this.selected >= this.top + VISIBLE) {
      this.top = this.selected;
    }
    this.top = Math.max(0, Math.min(Math.max(0, this.rows.length - VISIBLE), this.top));
  }

  private setOpen(open: boolean): void {
    const changed = open !== this.opened;
    this.opened = open;
    this.dim.setVisible(open);
    this.frame.setVisible(open);
    this.highlight.setVisible(open);
    this.curtain.setVisible(open);
    this.titleObj.setVisible(open);
    this.hintObj.setVisible(open);
    this.closeButton.container.setVisible(open);
    for (const obj of this.rowTexts) obj.setVisible(open);
    for (const obj of this.detailTexts) obj.setVisible(open);
    if (changed) this.handlers.onOpenChange?.(open);
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
    drawDivider(this.frame, MODAL.x + 4, MODAL.y + MODAL.height - 46, MODAL.width - 8, 1, c);
    drawDivider(this.frame, DETAIL_X - 8, MODAL.y + 18, 1, MODAL.height - 68, c);

    this.titleObj.setColor(intToCss(theme.colors.ooze));
    this.hintObj.setColor(intToCss(c.textDim));
    this.titleObj.setText(`PLUGINS  -  ${this.rows.length} INSTALLED`);
    const armed = this.rows.some((row) => row.id === this.arm.id) ? this.arm.id : null;
    this.hintObj.setText(armed !== null
      ? `DEL AGAIN FORGETS "${armed}"   ESC CLOSES`
      : 'ARROWS BROWSE   ENTER ALLOWS   X TAKES BACK   DEL FORGETS (TWICE)   ESC CLOSES');

    this.highlight.clear();
    const view = this.selected - this.top;
    if (this.rows.length > 0 && view >= 0 && view < VISIBLE) {
      const y = LIST_TOP + view * LINE_H - 1;
      this.highlight.fillStyle(c.ooze, 0.18);
      this.highlight.fillRect(LIST_X - 2, y, LIST_W, LINE_H);
      this.highlight.fillStyle(c.ooze, 0.9);
      this.highlight.fillRect(LIST_X - 2, y, 2, LINE_H);
    }

    // The empty registry draws no rows: the list stays blank and the wide
    // detail pane carries the one line that installs the hello starter.
    const empty = this.rows.length === 0;
    this.rowTexts.forEach((obj, i) => {
      const at = this.top + i;
      if (empty) { obj.setVisible(false); return; }
      const row = this.rows[at];
      if (row === undefined) { obj.setVisible(false); return; }
      obj.setVisible(this.opened);
      obj.setY(LIST_TOP + i * LINE_H);
      obj.setX(LIST_X);
      obj.setText(row.label);
      obj.setColor(intToCss(at === this.selected ? c.ward : c.textPrimary));
    });

    const chosen = this.rows[this.selected];
    const emptyLines = empty ? wrap(emptyPluginText(), PLUGIN_BROWSER_DETAIL_CHARS) : [];
    this.detailTexts.forEach((obj, i) => {
      const line = empty ? emptyLines[i] : chosen?.detail[i];
      obj.setText(line ?? '');
      obj.setVisible(this.opened && line !== undefined);
      obj.setColor(intToCss(i === 0 ? c.ward : c.textPrimary));
    });
  }

  destroy(): void {
    this.unsubscribe();
    for (const obj of this.rowTexts) obj.destroy();
    for (const obj of this.detailTexts) obj.destroy();
    this.titleObj.destroy();
    this.hintObj.destroy();
    this.closeButton.destroy();
    this.dim.destroy();
    this.frame.destroy();
    this.highlight.destroy();
    this.curtain.destroy();
  }
}
