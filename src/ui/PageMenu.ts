import type Phaser from 'phaser';
import {
  activeColors,
  Button,
  drawPanel,
  onThemeChanged,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';

import { PAGE_NAMES } from '../model/pages';

/**
 * PageMenu — the tab switcher in the header: a dropdown that changes which SCREEN
 * the app is showing.
 *
 * The app is growing more than one full screen — the tracker, the drum machine,
 * and whatever comes next — and a fixed function key per screen does not scale:
 * `F1`-`F9` are already the menus. So the screens are a small LIST the header
 * names, and this is the control that reads it: one button that says which screen
 * you are on, and a list of the others under it.
 *
 * ── Why a dropdown and not a strip of tabs ───────────────────────────────────
 * A row of tabs would eat the header the wordmark and the song title live in, and
 * would have to be re-laid-out every time a screen is added. A list costs one
 * button's width however many screens there are, and the button already says
 * where you are — the thing you check before you switch.
 *
 * It holds no state of its own: the current screen and the list both come back
 * through getters on every paint, so it can never show a tab the app is not on.
 * That is the same bargain every menu here makes.
 */

/**
 * The screens the app can show, as the language spells them. Grows as more
 * tabs land — the list itself lives in `model/pages.ts` so the parser can
 * validate `page NAME` without reaching into Phaser; this is the same list, as
 * a type, so the dropdown and the language cannot name different pages.
 */
export type PageId = (typeof PAGE_NAMES)[number];

/** One screen as the dropdown lists it. */
export interface PageRow {
  id: PageId;
  label: string;
}

/**
 * The dropdown's rows, in the order it shows them.
 *
 * Exported so the scene does not keep a second copy, and so a test can pin the
 * ids here to `PAGE_NAMES` — the list the parser accepts. Adding a page means
 * its name in `model/pages.ts` and its row here, nothing else.
 */
export const PAGE_ROWS: readonly PageRow[] = [
  { id: 'tracker', label: 'TRACKER' },
  { id: 'machine', label: 'DRUM MACHINE' },
  { id: 'mixer', label: 'MIXER' },
  { id: 'arranger', label: 'ARRANGER' },
  { id: 'arp', label: 'ARP' },
  { id: 'live', label: 'LIVE' },
  { id: 'recorder', label: 'RECORDER' },
];

export interface PageMenuHandlers {
  /** The screens, in the order the dropdown shows them. */
  rows: () => PageRow[];
  /** Which one is on screen now. */
  current: () => PageId;
  /** The user picked one. The scene is what actually changes the screen. */
  select: (id: PageId) => void;
  /** The list opened or closed, so the scene can route Escape to it. */
  onOpenChange?: (open: boolean) => void;
}

/** The canvas, so the click-away scrim can cover it. */
const CANVAS_W = 720;
const CANVAS_H = 405;

/** The button's box in the header, and so where the list hangs from. */
export const PAGE_MENU_RECT: Rect = { x: 720 - 12 - 138, y: 11, width: 138, height: 18 };
/** How much of the header the button claims, for the title to keep clear of. */
export const PAGE_MENU_WIDTH = PAGE_MENU_RECT.width;

/** One row of the list, and the padding around the rows. */
const ROW_H = 16;
const LIST_PAD = 3;

/** Depths: the list floats over every screen; the scrim is one under it. */
const DEPTH_SCRIM = 998;
const DEPTH_LIST = 1000;

export class PageMenu {
  private readonly scene: Phaser.Scene;
  private readonly handlers: PageMenuHandlers;
  private readonly button: Button;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly scrim: Phaser.GameObjects.Zone;
  private readonly hint: Phaser.GameObjects.Text;
  private rowButtons: Button[] = [];
  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: PageMenuHandlers) {
    this.scene = scene;
    this.handlers = handlers;

    this.button = new Button(
      scene,
      { x: PAGE_MENU_RECT.x, y: PAGE_MENU_RECT.y, width: PAGE_MENU_RECT.width, height: PAGE_MENU_RECT.height },
      '',
      { size: 8 },
    );
    this.button.onPress = () => this.toggle();
    this.button.container.setDepth(DEPTH_LIST);

    this.gfx = scene.add.graphics().setDepth(DEPTH_LIST);
    this.layer = scene.add.container(0, 0).setDepth(DEPTH_LIST + 1);
    this.hint = uiText(scene, PAGE_MENU_RECT.x + PAGE_MENU_RECT.width - 12, PAGE_MENU_RECT.y + 5, '\u25be', {
      size: 8, color: activeColors().textPrimary, origin: { x: 1, y: 0 },
    });
    this.hint.setDepth(DEPTH_LIST + 2);

    // The scrim is only up while the list is: a full-canvas zone that closes the
    // list on a click anywhere else, and swallows that click so it cannot also
    // press the thing behind it.
    this.scrim = scene.add.zone(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setInteractive();
    this.scrim.setDepth(DEPTH_SCRIM);
    this.scrim.on('pointerdown', () => this.close());

    this.unsubscribe = onThemeChanged(() => this.render());
    this.setOpen(false);
    this.render();
  }

  /** True while the list is down; the scene routes Escape to it then. */
  get isOpen(): boolean { return this.opened; }

  toggle(): void { if (this.opened) this.close(); else this.open(); }

  open(): void { this.setOpen(true); this.render(); }
  close(): void { this.setOpen(false); this.render(); }

  /** Escape closes the list; every other key is left to whatever is under it. */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.opened) return false;
    if (e.code === 'Escape') {
      e.preventDefault();
      this.close();
    }
    return true;
  }

  destroy(): void {
    this.unsubscribe();
    this.destroyRows();
    this.button.destroy();
    this.gfx.destroy();
    this.hint.destroy();
    this.layer.destroy();
    this.scrim.destroy();
  }

  private setOpen(open: boolean): void {
    const changed = open !== this.opened;
    this.opened = open;
    this.gfx.setVisible(open);
    this.layer.setVisible(open);
    this.hint.setVisible(!open);
    this.scrim.setVisible(open);
    if (!open) this.destroyRows();
    if (changed) this.handlers.onOpenChange?.(open);
  }

  private destroyRows(): void {
    for (const button of this.rowButtons) button.destroy();
    this.rowButtons = [];
  }

  render(): void {
    const c = activeColors();
    const rows = this.handlers.rows();
    const current = this.handlers.current();
    const currentLabel = rows.find((row) => row.id === current)?.label ?? 'PAGES';
    this.button.setText(currentLabel);

    this.gfx.clear();
    if (!this.opened) {
      this.hint.setColor(cssOf(c.textPrimary));
      return;
    }

    this.hint.setVisible(false);
    const height = rows.length * ROW_H + LIST_PAD * 2;
    const list: Rect = { x: PAGE_MENU_RECT.x, y: PAGE_MENU_RECT.y + PAGE_MENU_RECT.height + 2, width: PAGE_MENU_RECT.width, height };
    drawPanel(this.gfx, list, 1, c);

    this.destroyRows();
    rows.forEach((row, index) => {
      const button = new Button(
        this.scene,
        { x: list.x + LIST_PAD, y: list.y + LIST_PAD + index * ROW_H, width: list.width - LIST_PAD * 2, height: ROW_H },
        row.id === current ? `${row.label}  \u00b7` : row.label,
        { size: 8 },
      );
      button.onPress = () => {
        this.close();
        this.handlers.select(row.id);
      };
      button.container.setDepth(DEPTH_LIST + 1);
      this.layer.add(button.container);
      this.rowButtons.push(button);
    });
  }
}

/** A theme colour as CSS, for the small caret. */
function cssOf(color: number): string {
  return '#' + ((color >>> 0) & 0xffffff).toString(16).padStart(6, '0');
}
