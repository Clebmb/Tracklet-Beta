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

import { instrumentCatalog } from '../model';
import { browserRows, MAX_DETAIL_LINES, searchRows, selectableRows, type Row } from './instrumentRows';
import { menuIntent } from './menuKeys';

/**
 * InstrumentBrowser — the F6 menu: everything the app can sound like, in one
 * place, read from `model/catalog.ts`.
 *
 * ── Why it exists beside the F4 menu ─────────────────────────────────────────
 * F4 answers "make THIS channel sound different", one channel at a time. It can
 * never answer the question a beginner actually starts with — "what is a
 * wavetable, which voices are for bass, what does `chip pce` do?" — because that
 * question is about the whole vocabulary and has no channel to hang on. So this
 * screen is the map: the waves, the nine knobs, the voices by family, and the
 * console line-ups, browsable and readable, with nothing to change and nothing
 * to break.
 *
 * ── Why it is dumb on purpose ────────────────────────────────────────────────
 * Every word here comes from the catalog, which is built from the engine's own
 * tables — so this screen cannot advertise a voice the app does not have, and a
 * new wave or console appears here with no edit. The browser owns layout and
 * scrolling and exactly no content, which is what keeps the two in step.
 *
 * Read-only, so it lives entirely in canvas (like the F1 screen): no DOM, no
 * audio, no undo step. Selecting a row only shows it; nothing is applied.
 */

export interface InstrumentBrowserHandlers {
  /** The menu opened or closed, so the scene can pause its own input. */
  onOpenChange?: (open: boolean) => void;
}

const CANVAS_W = 720;
const CANVAS_H = 405;

/** The menu frame, in canvas coordinates. */
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
 * How wide the detail copy may run, in characters.
 *
 * Derived from the pane's width rather than guessed, so a longer console name or
 * a change to the frame cannot silently push a blurb out of its column. Six
 * pixels a character is the WIDE end of 8px UI type, so the wrap errs on the
 * side of an extra line rather than a line hanging off the frame.
 */
const DETAIL_CHARS = Math.floor(DETAIL_W / 6);

export class InstrumentBrowser {
  private readonly handlers: InstrumentBrowserHandlers;

  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly closeButton: Button;
  private readonly titleObj: Phaser.GameObjects.Text;
  private readonly hintObj: Phaser.GameObjects.Text;
  private readonly rowTexts: Phaser.GameObjects.Text[] = [];
  private readonly detailTexts: Phaser.GameObjects.Text[] = [];

  /** Every row, unfiltered. The search never rebuilds it, only narrows a view. */
  private readonly allRows: Row[];
  /** The rows on screen: `allRows`, or what the search left of it. */
  private rows: Row[];
  /** Indices into `rows` of the selectable ones, so arrows skip the headings. */
  private items: number[];
  /** The text each pooled Text already shows, so a filter rewrite is minimal. */
  private readonly rowTextValue: string[] = [];

  /** What has been typed since `/`, and whether the keys are going there. */
  private query = '';
  private searching = false;

  private selected = 0;
  private top = 0;
  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: InstrumentBrowserHandlers = {}) {
    this.handlers = handlers;

    this.allRows = browserRows(instrumentCatalog(), DETAIL_CHARS);
    this.rows = this.allRows;
    this.items = selectableRows(this.rows);

    this.dim = scene.add.graphics().setDepth(DEPTH_DIM);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.highlight = scene.add.graphics().setDepth(DEPTH_FRAME + 1);

    this.curtain = scene.add.zone(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);
    this.curtain.on('pointerdown', () => this.hide());

    this.titleObj = uiText(scene, MODAL.x + 4, MODAL.y + 2, 'INSTRUMENTS  -  WAVES, KNOBS, VOICES, KITS, CONSOLES', {
      size: 8, color: activeTheme().colors.ooze,
    });
    this.titleObj.setDepth(DEPTH_FRONT);

    this.hintObj = uiText(scene, MODAL.x + 6, MODAL.y + MODAL.height - 40, 'ARROWS BROWSE   F6 OR ESC CLOSES', {
      size: 8, color: activeColors().textDim,
    });
    this.hintObj.setDepth(DEPTH_FRONT);

    // One Text per row, built once and only moved, so scrolling is a `setY`
    // rather than a create/destroy storm on every arrow press.
    // One Text per row of the FULL list, because a filter only ever shortens the
    // list: a row that is filtered out is hidden, never destroyed, so clearing the
    // search costs nothing and the pool never grows.
    this.allRows.forEach((row, i) => {
      const indent = row.kind === 'heading' ? 0 : 8;
      const obj = uiText(scene, LIST_X + indent, LIST_TOP + i * LINE_H, row.kind === 'heading' ? row.text : row.title, {
        size: 8, color: activeColors().textPrimary,
      });
      obj.setDepth(DEPTH_FRONT);
      this.rowTexts.push(obj);
      this.rowTextValue.push(row.kind === 'heading' ? row.text : row.title);
    });

    for (let i = 0; i < MAX_DETAIL_LINES; i++) {
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

  show(): void {
    this.setOpen(true);
    this.render();
  }

  hide(): void {
    // A search belongs to one look at the list, so closing the browser forgets
    // it: reopening shows the whole vocabulary rather than a filtered corner of it
    // left over from a question asked minutes ago.
    this.searching = false;
    if (this.query !== '') this.setQuery('');
    this.setOpen(false);
  }

  /**
   * Arrows browse, Home/End jump, Esc closes, and `/` starts a search. Nothing
   * here edits a song.
   *
   * Search is a MODE rather than "just start typing" because this screen speaks
   * the same key language every other menu here does, and `W A S D` are part of
   * it: typing a query beginning "wave" must not also walk the list down four
   * rows. So `/` puts the keyboard into the query, where every printable key is a
   * character, the arrows still browse, Enter accepts the filter and Escape clears
   * it. The hint line says so, because a mode nobody can find is a mode nobody
   * has.
   */
  handleKey(e: KeyboardEvent): void {
    if (this.searching) {
      if (e.key === 'Escape') { e.preventDefault(); this.searching = false; this.setQuery(''); return; }
      if (e.key === 'Enter') { e.preventDefault(); this.searching = false; this.render(); return; }
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (this.query === '') this.searching = false;
        else this.setQuery(this.query.slice(0, -1));
        this.render();
        return;
      }
      // Any printable character (and Space, which a query needs) is a character
      // here rather than a command. Arrows and the rest fall through below.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.setQuery(this.query + e.key);
        return;
      }
    } else if (e.key === '/') {
      e.preventDefault();
      this.searching = true;
      this.render();
      return;
    }
    const intent = menuIntent(e.code);
    if (intent === 'close') { e.preventDefault(); this.hide(); return; }
    if (intent === 'up') { e.preventDefault(); this.move(-1); return; }
    if (intent === 'down') { e.preventDefault(); this.move(1); return; }
    if (intent === 'first') { e.preventDefault(); this.select(0); return; }
    if (intent === 'last') { e.preventDefault(); this.select(this.items.length - 1); }
  }

  /**
   * Narrow the list to a query and show the result from the top.
   *
   * The whole view resets — the selection to the first result, the scroll to the
   * top — because a selection that stayed at an index into a list that no longer
   * exists would point at a different entry, which is exactly the surprise a
   * filter must not have.
   */
  private setQuery(next: string): void {
    this.query = next;
    this.rows = searchRows(this.allRows, next);
    this.items = selectableRows(this.rows);
    this.selected = 0;
    this.top = 0;
    this.render();
  }

  private move(delta: number): void {
    this.select(this.selected + delta);
  }

  private select(index: number): void {
    this.selected = Math.max(0, Math.min(this.items.length - 1, index));
    this.scrollToSelection();
    this.render();
  }

  /**
   * Keep the chosen row on screen, with the heading it belongs under.
   *
   * The heading matters as much as the row: "BELL" means little on its own, and
   * "LEAD / BELL" is the thing the reader came for. So scrolling UP lands on the
   * section's heading rather than on the item with its title just out of view.
   */
  private scrollToSelection(): void {
    const row = this.items[this.selected];
    if (row < this.top || row >= this.top + VISIBLE) {
      this.top = this.headingAtOrBefore(row);
      if (row >= this.top + VISIBLE) this.top = row - VISIBLE + 1;
    }
    this.top = Math.max(0, Math.min(Math.max(0, this.rows.length - VISIBLE), this.top));
  }

  /** The index of the nearest heading at or above a row, or the row itself. */
  private headingAtOrBefore(row: number): number {
    for (let i = row; i >= 0; i--) if (this.rows[i].kind === 'heading') return i;
    return row;
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
    // The title says whether a filter is on, and the hint line says what a key
    // will do right now — the one thing that makes a MODE discoverable.
    this.titleObj.setText(this.query === ''
      ? 'INSTRUMENTS  -  WAVES, KNOBS, VOICES, KITS, CONSOLES'
      : `INSTRUMENTS  -  SEARCH  "${this.query.toUpperCase()}"  -  ${this.items.length} FOUND`);
    this.hintObj.setText(this.searching
      ? 'TYPE TO FILTER   ENTER KEEPS IT   ESC CLEARS   ARROWS BROWSE'
      : 'PRESS / TO SEARCH   ARROWS BROWSE   F6 OR ESC CLOSES');

    const selectedRow = this.items[this.selected];

    this.highlight.clear();
    const view = selectedRow - this.top;
    if (view >= 0 && view < VISIBLE) {
      const y = LIST_TOP + view * LINE_H - 1;
      this.highlight.fillStyle(c.ooze, 0.18);
      this.highlight.fillRect(LIST_X - 2, y, LIST_W, LINE_H);
      this.highlight.fillStyle(c.ooze, 0.9);
      this.highlight.fillRect(LIST_X - 2, y, 2, LINE_H);
    }

    // Every pooled Text is visited, not just the visible ones: a filter can leave
    // rows where the last full list had none, and a stale row left visible under a
    // search result is worse than no search at all.
    this.rowTexts.forEach((obj, i) => {
      const row = this.rows[i];
      const at = i - this.top;
      if (row === undefined || at < 0 || at >= VISIBLE) { obj.setVisible(false); return; }
      obj.setVisible(this.opened);
      obj.setY(LIST_TOP + at * LINE_H);
      obj.setX(LIST_X + (row.kind === 'heading' ? 0 : 8));
      const value = row.kind === 'heading' ? row.text : row.title;
      if (this.rowTextValue[i] !== value) { obj.setText(value); this.rowTextValue[i] = value; }
      if (row.kind === 'heading') obj.setColor(intToCss(theme.colors.ooze));
      else if (i === selectedRow) obj.setColor(intToCss(c.ward));
      else obj.setColor(intToCss(c.textPrimary));
    });

    const chosen = this.rows[selectedRow];
    const detail = chosen !== undefined && chosen.kind === 'item' ? chosen.detail : [];
    this.detailTexts.forEach((obj, i) => {
      const line = detail[i];
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
