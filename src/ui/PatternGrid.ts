import type Phaser from 'phaser';
import {
  activeColors,
  activeTheme,
  onThemeChanged,
  drawDivider,
  uiText,
  inside,
  type Rect,
} from 'phaser-ui-canvas';
import { cellText, ROWS_PER_BEAT, type Cell, type Pattern } from '../model/song';
import { trackColor } from './trackColor';
import {
  DRUM_LANES,
  EMPTY_ALPHA,
  EMPTY_STEP_TEXT,
  cellAlpha,
  drumCellAlpha,
  drumCellLit,
  drumCellText,
  laneLabels,
} from './stepView';
import { overviewDensity, overviewMarkH, overviewRowAt, overviewYAt } from './overview';

/**
 * PatternGrid — the pattern editor: a row-number gutter, one column per track,
 * an edit cursor and a playback playhead.
 *
 * It has TWO views of the same steps, and the only difference between them is
 * what a column means:
 *
 *   the note grid    one column per CHANNEL, a cell three characters wide
 *   the drum view    one column per DRUM of the kit on the cursor's channel,
 *                    a hit a mark in its own lane (`F8` toggles)
 *
 * `stepView.ts` owns what a cell SAYS in each of them — the string, its colour
 * and its weight — because both views answer that question from the same model
 * facts and a second opinion about them in here is how two views drift apart.
 * What lives here is the frame: the gutter, the row window, the pooled text, the
 * playhead, the cursor, and the arithmetic that maps a click to a step.
 *
 * It is a VIEW. It never edits the song itself; a click or a hover is reported
 * back through its handlers, and everything the app changes is pushed in again
 * with `setPattern` / `refreshCell` / `setCursor` / `setPlayhead`. That split is
 * what keeps the grid honest when the playback head and the edit cursor are on
 * different rows.
 *
 * Drawing is layered so the cheap, per-frame updates (the playhead) never
 * rebuild text:
 *
 *   bg      row stripes, beat lines, the gutter and column seams
 *   play    the playback band
 *   cursor  the edit band and its gutter marker
 *   text    a POOL of Texts, one slot per on-screen row, rewritten in place
 *   empty   the friendly overlay shown while the pattern has no notes
 *
 * A pattern may be up to 512 steps long, which is far more than fits legibly in
 * 228 pixels. So the grid draws a WINDOW of rows and scrolls it: `visibleCount`
 * rows are shown at a minimum of `MIN_ROW_H` pixels each, and the window follows
 * the edit cursor and the playhead. A 16-step pattern — the default, and so the
 * common case — fits whole and behaves exactly as it did before this existed.
 *
 * The text layer is POOLED rather than rebuilt, and that is what keeps a
 * scrolling playhead smooth. Creating a Phaser Text costs milliseconds (a
 * canvas, a texture, a display-list entry) while `setText` on an existing one
 * costs microseconds, so the grid keeps one slot per on-screen row and, when
 * the window slides down by one row, rotates its ring: the slot that fell off
 * the top is handed the row that just scrolled in and only that one is
 * rewritten. Destroying and recreating the whole window instead cost about a
 * second per step — a visible stall every time the playhead crossed a page.
 *
 * It is built from the framework's own painters (`drawDivider`, `uiText`,
 * `activeColors`), so it inherits whatever theme the app has active.
 */

export interface PatternGridHandlers {
  /** A cell was clicked. */
  onPick?: (row: number, track: number) => void;
  /** A cell was right-clicked (or shift-clicked): clear it, the mouse's Backspace. */
  onSecondaryPick?: (row: number, track: number) => void;
  /**
   * A LANE was clicked in the drum view. `lane` is an index into `DRUM_LANES`.
   *
   * A lane is not a channel, so it is not reported as one: passing a lane index
   * to `onPick` would edit the wrong channel on the way back, and the whole point
   * of reporting at all is that the app can trust the number it is handed.
   */
  onLane?: (row: number, lane: number) => void;
  /** A lane was right-clicked: take that hit out, if it is that hit. */
  onSecondaryLane?: (row: number, lane: number) => void;
  /** The pointer entered/left a cell (null on leave). */
  onHover?: (cell: { row: number; track: number } | null) => void;
  /** The window of rows on screen changed, so the title can show the range. */
  onWindow?: (first: number, last: number) => void;
  /**
   * A step was picked on the right-edge OVERVIEW strip. It carries a row and no
   * channel, because the map is of the whole pattern and has no columns: the
   * caller moves the cursor to that row on whatever channel it is already on.
   */
  onOverview?: (row: number) => void;
}

export interface PatternGridOptions {
  /** Column headings; falls back to `TRK n`. */
  trackNames?: readonly string[];
  /** Steps per beat, for the beat emphasis. Defaults to four. */
  rowsPerBeat?: number;
}

const GUTTER_W = 24;
const HEAD_H = 12;
const CELL_PAD = 4;
/** The shortest a row is allowed to get before the grid starts paging. */
const MIN_ROW_H = 9;
/** Width of the overview strip down the right edge. Wide enough to click. */
const BAR_W = 6;
/** A cache value that no real string or colour can equal, so it always writes. */
const UNSET = '\u0000';

/**
 * The CSS family stack for a DISPLAY line: the empty pattern's heading.
 *
 * 'Maze' is Tracklet's own display face, declared in `index.html` and awaited in
 * `main.ts` — a decorative, geometric face that is deliberately NOT the one the
 * interface uses. Alagard is named after it so that a missing font file costs a
 * fallback face rather than a fallback to the browser's default serif.
 *
 * One stack lives here rather than in the line's options because `uiText` only
 * knows the framework's two faces (`'silkscreen' | 'alagard'`); the swap is made
 * with `setFontFamily` after creation, the same way the header wordmark does it.
 */
const DISPLAY_FONT = "'Maze', 'Alagard', serif";

/**
 * One pooled line of text: the gutter number plus one Text per track. The grid
 * keeps one slot per on-screen row and rewrites it as the window scrolls, so
 * only a row that has actually changed re-rasterizes. Every cached field is
 * compared before it is written, which makes `writeSlot` (and the single-cell
 * `writeCell` under it) cheap to call unconditionally.
 */
interface RowSlot {
  /** The absolute row it currently shows, or -1 while unassigned. */
  row: number;
  /** The y last applied, so a no-op move costs nothing. */
  y: number;
  num: Phaser.GameObjects.Text;
  numValue: string;
  numColor: number;
  cells: Phaser.GameObjects.Text[];
  cellValue: string[];
  cellColor: number[];
  cellAlpha: number[];
}

export class PatternGrid {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly rect: Rect;
  private readonly handlers: PatternGridHandlers;

  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly playGfx: Phaser.GameObjects.Graphics;
  private readonly hoverGfx: Phaser.GameObjects.Graphics;
  private readonly cursorGfx: Phaser.GameObjects.Graphics;
  private readonly barGfx: Phaser.GameObjects.Graphics;
  private readonly overlayGfx: Phaser.GameObjects.Graphics;
  private readonly overlay: Phaser.GameObjects.Container;
  private readonly zone: Phaser.GameObjects.Zone;
  /** The overview strip is its own zone, added last so it wins a click at the edge. */
  private readonly barZone: Phaser.GameObjects.Zone;
  private readonly texts: Phaser.GameObjects.Container;

  private pattern: Pattern;
  private trackNames: readonly string[];
  private rowsPerBeat: number;
  private cursor = { row: 0, track: 0 };
  private playhead = -1;
  private hovered: { row: number; track: number } | null = null;
  private emptyShown = false;
  /**
   * Whether the panel shows the drum LANES rather than one column per channel.
   *
   * The lanes are the four drums of the kit on the CURSOR'S channel, so the view
   * follows the cursor: arrowing to another channel shows that channel's kit,
   * which is how a song with two kits is read one lane row at a time.
   */
  private drumView = false;
  private barInteractive = false;
  /**
   * What the pooled cells were last written FROM: the view, and which channel the
   * drum view is following.
   *
   * Cached strings make a repaint cheap, but they also make it possible to leave
   * a cell holding the right characters from the wrong channel — so both of the
   * things that decide what a cell shows are remembered together, and a change to
   * either one throws the caches away rather than trusting them.
   */
  private viewKey = '';
  /** The first row of the on-screen window. */
  private top = 0;

  /** The pooled text of the window: one slot per on-screen row, reused. */
  private slots: RowSlot[] = [];
  /** Ring index of the slot showing the TOP row. */
  private slotStart = 0;
  /** How many slots the ring holds (the rows the window can show). */
  private liveSlots = 0;
  /** The window top and column count the slots were last written for. */
  private slotTop = -1;
  private slotTracks = -1;
  private headTexts: Phaser.GameObjects.Text[] = [];
  private overlayTexts: Phaser.GameObjects.Text[] = [];
  private unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    rect: Rect,
    pattern: Pattern,
    handlers: PatternGridHandlers = {},
    options: PatternGridOptions = {},
  ) {
    this.scene = scene;
    this.rect = rect;
    this.pattern = pattern;
    this.handlers = handlers;
    this.trackNames = options.trackNames ?? [];
    this.rowsPerBeat = Math.max(1, options.rowsPerBeat ?? ROWS_PER_BEAT);

    this.container = scene.add.container(rect.x, rect.y);
    this.bg = scene.add.graphics();
    this.playGfx = scene.add.graphics();
    this.hoverGfx = scene.add.graphics();
    this.cursorGfx = scene.add.graphics();
    this.barGfx = scene.add.graphics();
    this.texts = scene.add.container(0, 0);
    this.overlay = scene.add.container(0, 0);
    this.overlayGfx = scene.add.graphics();
    this.overlay.add(this.overlayGfx);
    this.container.add([
      this.bg, this.playGfx, this.hoverGfx, this.cursorGfx, this.barGfx, this.texts, this.overlay,
    ]);

    // One interactive zone for the whole grid: a click or a hover is mapped to
    // a cell by arithmetic, so a 16x8 pattern never costs 128 zones — and a
    // 512-step pattern does not cost 4096 of them either.
    this.zone = scene.add.zone(GUTTER_W, HEAD_H, Math.max(1, rect.width - GUTTER_W), Math.max(1, rect.height - HEAD_H))
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const cell = this.cellAtLocal(p.x - this.rect.x, p.y - this.rect.y);
      if (!cell) return;
      // Right-click (or shift-click) is the mouse's Backspace. Beginners reach
      // for the mouse first, and a grid you can only WANT to erase is a grid
      // you are afraid to fill in.
      const secondary = p.rightButtonDown() || (p.event as MouseEvent | undefined)?.shiftKey === true;
      if (this.drumView) {
        // In the drum view the column is a LANE, and the two acts a lane has are
        // its own: hit it, or take that hit out. Neither is reported as a
        // channel edit, because a lane index is not a channel index.
        if (secondary) this.handlers.onSecondaryLane?.(cell.row, cell.track);
        else this.handlers.onLane?.(cell.row, cell.track);
        return;
      }
      if (secondary) this.handlers.onSecondaryPick?.(cell.row, cell.track);
      else this.handlers.onPick?.(cell.row, cell.track);
    });
    this.zone.on('pointermove', (p: Phaser.Input.Pointer) => {
      const cell = this.cellAtLocal(p.x - this.rect.x, p.y - this.rect.y);
      this.setHover(cell);
    });
    this.zone.on('pointerout', () => this.setHover(null));
    this.container.add(this.zone);

    // The overview strip, over the cells' zone so a click at the very edge is a
    // jump to that step rather than an edit of the last channel's cell. Its own
    // zone rather than a branch in the cell handler, because a 512-step song is
    // exactly when the edge is dense with music and a misread click is costly.
    // It is interactive only while the strip is drawn (a long pattern, scrolled).
    this.barZone = scene.add.zone(this.barRectLocal().x, this.barRectLocal().y, BAR_W, this.barRectLocal().height)
      .setOrigin(0, 0);
    const pickOverview = (p: Phaser.Input.Pointer): void => {
      const local = p.y - this.rect.y;
      this.handlers.onOverview?.(overviewRowAt(local, HEAD_H + 1, this.rect.height - HEAD_H - 2, this.rows));
    };
    this.barZone.on('pointerdown', pickOverview);
    this.barZone.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) pickOverview(p); });
    this.container.add(this.barZone);

    this.unsubscribe = onThemeChanged(() => this.render());
    this.render();
  }

  // --- geometry -------------------------------------------------------------

  private get rows(): number { return this.pattern.steps.length; }
  private get trackCount(): number { return this.pattern.steps[0]?.length ?? 0; }
  /**
   * How many columns the panel is drawing: the channels, or the kit's four lanes.
   *
   * Everything that lays out or pools a COLUMN reads this one getter, so the two
   * views cannot disagree about how wide the panel is — and switching between
   * them rebuilds the pool exactly once, because the pooled column count is
   * compared against this.
   */
  private get columns(): number { return this.drumView ? DRUM_LANES.length : this.trackCount; }
  /** The channel the drum view is showing the kit of. */
  private get viewTrack(): number { return this.cursor.track; }
  /** How many rows fit at a legible height. */
  private get visibleCount(): number {
    const usable = Math.max(1, this.rect.height - HEAD_H);
    return Math.max(1, Math.min(this.rows, Math.floor(usable / MIN_ROW_H)));
  }
  private get rowsShown(): number { return this.visibleCount; }
  private get maxTop(): number { return Math.max(0, this.rows - this.rowsShown); }
  /** Row height in pixels: the same for every row in the window. */
  private get rowH(): number { return (this.rect.height - HEAD_H) / this.rowsShown; }
  private get colW(): number { return (this.rect.width - GUTTER_W) / Math.max(1, this.columns); }
  /** Digits needed for the largest row number, so the gutter stays aligned. */
  private get gutterDigits(): number { return Math.max(2, String(Math.max(0, this.rows - 1)).length); }

  private colX(track: number): number { return GUTTER_W + Math.round(track * this.colW); }
  /** The overview strip, in container-local coordinates. */
  private barRectLocal(): { x: number; y: number; height: number } {
    return { x: this.rect.width - BAR_W, y: HEAD_H + 1, height: this.rect.height - HEAD_H - 2 };
  }
  /** The strip is drawn only when the pattern is longer than the window. */
  private get barShown(): boolean { return this.rows > this.rowsShown; }
  /** The y of an ABSOLUTE row, or a nonsense value when it is off-window. */
  private rowY(row: number): number { return HEAD_H + Math.round((row - this.top) * this.rowH); }

  /** The grid cell under a container-local point, or null. */
  cellAtLocal(x: number, y: number): { row: number; track: number } | null {
    if (!inside({ x: GUTTER_W, y: HEAD_H, width: this.rect.width - GUTTER_W, height: this.rect.height - HEAD_H }, x, y)) {
      return null;
    }
    const row = this.top + Math.floor((y - HEAD_H) / this.rowH);
    const track = Math.floor((x - GUTTER_W) / this.colW);
    if (row < 0 || row >= this.rows) return null;
    if (track < 0 || track >= this.columns) return null;
    return { row, track };
  }

  // --- app-facing state -----------------------------------------------------

  /** Point the grid at a (possibly resized) pattern and rebuild it. */
  setPattern(pattern: Pattern): void {
    this.pattern = pattern;
    this.top = 0;
    this.render();
  }

  setTrackNames(names: readonly string[]): void {
    this.trackNames = names;
    this.render();
  }

  /**
   * Show the drum lanes of the cursor's channel, or the channel columns again.
   *
   * Pressed by `F8`. Nothing about the song changes — this is a way of LOOKING at
   * the same steps, which is why it takes no undo step of its own and why the
   * cursor, the playhead and the edits underneath it carry straight on.
   */
  setDrumView(on: boolean): void {
    if (this.drumView === on) return;
    this.drumView = on;
    this.render();
  }

  get drumViewOn(): boolean { return this.drumView; }

  /** The grid resolution changed, so the beat emphasis did too. */
  setRowsPerBeat(rowsPerBeat: number): void {
    const next = Math.max(1, rowsPerBeat);
    if (next === this.rowsPerBeat) return;
    this.rowsPerBeat = next;
    this.render();
  }

  /** Scroll the window so this row is on screen. Returns true if it moved. */
  private scrollTo(row: number): boolean {
    const before = this.top;
    if (row < this.top) this.top = row;
    else if (row >= this.top + this.rowsShown) this.top = row - this.rowsShown + 1;
    this.top = Math.max(0, Math.min(this.maxTop, this.top));
    if (this.top === before) return false;
    this.notifyWindow();
    return true;
  }

  private notifyWindow(): void {
    this.handlers.onWindow?.(this.top, Math.min(this.rows, this.top + this.rowsShown) - 1);
  }

  /** Move the edit cursor. Repaints the cursor layer, and scrolls if paged. */
  setCursor(row: number, track: number): void {
    const scrolled = this.scrollTo(row);
    if (row === this.cursor.row && track === this.cursor.track && !scrolled) return;
    // In the drum view the whole panel follows the cursor's channel — the lanes
    // are that channel's kit — so moving sideways is a repaint of every cell
    // rather than a band moved across one.
    const rekit = this.drumView && track !== this.cursor.track;
    this.cursor = { row, track };
    if (scrolled || rekit) this.repaint(scrolled);
    else this.paintCursor();
  }

  /** Move the playback band, or pass -1 to hide it. Follows the playhead. */
  setPlayhead(row: number): void {
    if (row === this.playhead) return;
    this.playhead = row;
    if (row >= 0 && this.scrollTo(row)) this.repaint(true);
    else {
      this.paintPlayhead();
      this.paintBar();
    }
  }

  /**
   * Repaint a single cell after an edit. The row's other fields are checked too,
   * but the slot's caches make that free, so only the change re-rasterizes.
   *
   * In the drum view one edit can touch all four lanes of the row — a hit written
   * where another drum was is a mark that MOVED — so a row refresh rewrites the
   * row. The grid is asked to refresh the channel the edit happened on, and in
   * the drum view that is the kit channel every lane is showing.
   */
  refreshCell(row: number, track: number): void {
    const slot = this.slotFor(row);
    if (!slot) return;
    // An edit changes the MAP too — a note added or taken away is a mark gained
    // or lost — so the overview is redrawn with the cell it is about.
    this.paintBar();
    if (this.drumView) {
      for (let col = 0; col < this.columns; col++) this.writeCell(slot, row, col);
      return;
    }
    const text = slot.cells[track];
    if (!text) return;
    this.writeCell(slot, row, track);
  }

  /** Show or hide the "this pattern is empty" overlay. */
  setEmptyState(show: boolean): void {
    if (show === this.emptyShown) return;
    this.emptyShown = show;
    this.overlay.setVisible(show);
    if (show) this.paintOverlay();
  }

  private setHover(cell: { row: number; track: number } | null): void {
    const same = (a: typeof cell, b: typeof cell) =>
      (a === null && b === null) || (!!a && !!b && a.row === b.row && a.track === b.track);
    if (same(cell, this.hovered)) return;
    this.hovered = cell;
    this.paintHover();
    this.handlers.onHover?.(cell);
  }

  // --- drawing --------------------------------------------------------------

  render(): void {
    this.repaint(false);
  }

  /**
   * Redraw the grid. `advance` is set only when the window slid DOWN by exactly
   * one row — the playback case — which lets the text pool move and rewrite the
   * single row that scrolled in instead of every row on screen. Anything else
   * (a jump, a resize, a new pattern, a theme change) rewrites the window.
   */
  private repaint(advance: boolean): void {
    this.top = Math.max(0, Math.min(this.maxTop, this.top));
    this.drawBackground();
    this.syncHeadings();
    this.syncText(advance);
    this.paintPlayhead();
    this.paintBar();
    this.paintHover();
    this.paintCursor();
    this.paintOverlay();
    this.overlay.setVisible(this.emptyShown);
    this.notifyWindow();
  }

  /** True when the row is inside the on-screen window. */
  private onScreen(row: number): boolean {
    return row >= this.top && row < this.top + this.rowsShown;
  }

  private drawBackground(): void {
    const c = activeColors();
    const g = this.bg;
    g.clear();

    // The grid well, slightly darker than the panel behind it.
    g.fillStyle(c.ink, 0.55);
    g.fillRect(GUTTER_W, HEAD_H, this.rect.width - GUTTER_W, this.rect.height - HEAD_H);

    for (let row = this.top; row < this.top + this.rowsShown && row < this.rows; row++) {
      const y = this.rowY(row);
      const h = this.rowY(row + 1) - y;
      const beat = row % this.rowsPerBeat === 0;
      if (beat) {
        g.fillStyle(c.stone, 0.22);
        g.fillRect(GUTTER_W, y, this.rect.width - GUTTER_W, h);
      } else if (row % 2 === 0) {
        g.fillStyle(c.stone, 0.08);
        g.fillRect(GUTTER_W, y, this.rect.width - GUTTER_W, h);
      }
      if (beat) {
        g.fillStyle(c.ward, 0.28);
        g.fillRect(GUTTER_W, y, this.rect.width - GUTTER_W, 1);
      }
    }

    // Row-number gutter.
    g.fillStyle(c.ink, 0.85);
    g.fillRect(0, HEAD_H, GUTTER_W, this.rect.height - HEAD_H);
    g.fillStyle(c.stone, 0.5);
    g.fillRect(GUTTER_W - 1, HEAD_H, 1, this.rect.height - HEAD_H);

    // Column seams.
    g.fillStyle(c.stone, 0.22);
    for (let t = 1; t < this.columns; t++) {
      g.fillRect(this.colX(t), HEAD_H, 1, this.rect.height - HEAD_H);
    }

    // Heading strip.
    g.fillStyle(c.stone, 0.55);
    g.fillRect(0, 0, this.rect.width, HEAD_H);
    g.fillStyle(c.stoneHi, 0.35);
    g.fillRect(0, 0, this.rect.width, 1);
    drawDivider(g, 0, HEAD_H - 1, this.rect.width, 1, c);
  }

  /**
   * Column headings. Pooled like the rows: a name changes rarely, but the grid
   * repaints often, so the Text outlives the label. Extra headings from a
   * previous, wider song are hidden rather than destroyed, so adding and
   * removing channels never churns Text objects either.
   *
   * In the drum view the four headings are the drums' own short names — `KCK`,
   * `SNR`, `HAT`, `WND` — which is the whole label a lane needs and the one thing
   * that tells a glance this is not the note grid.
   */
  private syncHeadings(): void {
    const c = activeColors();
    const labels = this.drumView ? laneLabels() : null;
    for (let t = 0; t < this.columns; t++) {
      const name = labels ? labels[t] : this.trackNames[t] ?? `TRK ${t + 1}`;
      const max = Math.max(1, Math.floor((this.colW - CELL_PAD * 2) / 5));
      const label = name.length > max ? name.slice(0, max) : name;
      let text = this.headTexts[t];
      if (!text) {
        text = uiText(this.scene, this.colX(t) + CELL_PAD, 2, label, { size: 8, color: c.textDim });
        this.texts.add(text);
        this.headTexts[t] = text;
      } else {
        text.setX(this.colX(t) + CELL_PAD);
        if (text.text !== label) text.setText(label);
        text.setColor(cssOf(c.textDim));
      }
      text.setVisible(true);
    }
    for (let t = this.columns; t < this.headTexts.length; t++) this.headTexts[t].setVisible(false);
  }

  /** The pooled slot showing this absolute row, or null when it is off-window. */
  private slotFor(row: number): RowSlot | null {
    if (this.liveSlots <= 0) return null;
    for (let i = 0; i < this.liveSlots; i++) {
      const slot = this.slots[(this.slotStart + i) % this.liveSlots];
      if (slot.row === row) return slot;
    }
    return null;
  }

  /** Build one slot: a gutter number and one cell Text per track. */
  private makeSlot(): RowSlot {
    const c = activeColors();
    const num = uiText(this.scene, GUTTER_W - 5, 0, '', {
      size: 8, color: c.textDim, origin: { x: 1, y: 0 },
    });
    this.texts.add(num);
    const cells: Phaser.GameObjects.Text[] = [];
    const cellValue: string[] = [];
    const cellColor: number[] = [];
    const cellAlpha: number[] = [];
    for (let t = 0; t < this.columns; t++) {
      const text = uiText(this.scene, this.colX(t) + CELL_PAD, 0, '', { size: 8, color: c.textPrimary });
      this.texts.add(text);
      cells.push(text);
      cellValue.push(UNSET);
      cellColor.push(-1);
      cellAlpha.push(-1);
    }
    return { row: -1, y: Number.NaN, num, numValue: UNSET, numColor: -1, cells, cellValue, cellColor, cellAlpha };
  }

  /**
   * Grow the pool to `count` rows, rebuilding it only when the column count
   * changed. Adding or removing a channel is the one case where the cells have
   * to be replaced rather than rewritten; everything else reuses them.
   */
  private ensureSlots(count: number): void {
    if (this.slotTracks !== this.columns) {
      for (const slot of this.slots) {
        slot.num.destroy();
        for (const cell of slot.cells) cell.destroy();
      }
      this.slots = [];
      this.slotStart = 0;
      this.liveSlots = 0;
      this.slotTop = -1;
      this.slotTracks = this.trackCount;
    }
    while (this.slots.length < count) this.slots.push(this.makeSlot());
  }

  /**
   * The cell one column of one row reads from.
   *
   * In the channel view a column is a channel on that row. In the drum view every
   * column is the SAME cell — the step on the channel the cursor is on — and the
   * lane only decides how that one cell is spelled. A cursor past the last channel
   * (possible for the frame between a channel being removed and the cursor being
   * clamped) reads as an empty step rather than throwing: a view that can crash
   * the app is worse than a view that shows `...`.
   */
  private cellIn(row: number, col: number): Cell | null {
    if (!this.drumView) return this.pattern.steps[row]?.[col] ?? null;
    return this.pattern.steps[row]?.[this.viewTrack] ?? null;
  }

  /**
   * Write one pooled cell. Every field is compared against the cache first, so
   * calling this on a slot that only moved re-renders nothing.
   *
   * A filled cell is bright and wears its channel's colour, so a note's column is
   * readable at a glance and matches its chip in the track list; an empty one is a
   * faint `...` gutter. The drum view keeps the same bargain with different
   * content: a lane that holds the hit wears the channel's colour at the hit's own
   * weight, the lanes it does not hold are the empty step, and a melodic note on a
   * kit channel is the one dimmer thing — see `stepView`.
   */
  private writeCell(slot: RowSlot, row: number, col: number): void {
    const c = activeColors();
    const cell = this.cellIn(row, col);
    const text = slot.cells[col];
    if (!text) return;
    const value = cell === null
      ? EMPTY_STEP_TEXT
      : this.drumView ? drumCellText(cell, col) : cellText(cell);
    if (slot.cellValue[col] !== value) {
      text.setText(value);
      slot.cellValue[col] = value;
    }
    const lit = cell !== null && (this.drumView ? drumCellLit(cell, col) : cell.note !== null);
    const color = lit ? trackColor(this.drumView ? this.viewTrack : col, c) : c.textDim;
    if (slot.cellColor[col] !== color) {
      text.setColor(cssOf(color));
      slot.cellColor[col] = color;
    }
    const alpha = cell === null
      ? EMPTY_ALPHA
      : this.drumView ? drumCellAlpha(cell, col) : cellAlpha(cell);
    if (slot.cellAlpha[col] !== alpha) {
      text.setAlpha(alpha);
      slot.cellAlpha[col] = alpha;
    }
  }

  /**
   * Write one slot: its gutter number, then every column.
   *
   * This is the whole-row path; `writeCell` is what both it and a single-cell
   * refresh go through, so a click and a repaint cannot spell a cell differently.
   */
  private writeSlot(slot: RowSlot): void {
    const c = activeColors();
    const row = slot.row;

    const numValue = String(row).padStart(this.gutterDigits, '0');
    if (slot.numValue !== numValue) {
      slot.num.setText(numValue);
      slot.numValue = numValue;
    }
    const numColor = row % this.rowsPerBeat === 0 ? c.textPrimary : c.textDim;
    if (slot.numColor !== numColor) {
      slot.num.setColor(cssOf(numColor));
      slot.numColor = numColor;
    }

    for (let t = 0; t < this.columns; t++) this.writeCell(slot, row, t);
  }

  /** Move a slot onto its row, so a slide is a transform and not a re-render. */
  private positionSlot(slot: RowSlot): void {
    const y = this.cellY(slot.row);
    if (slot.y === y) return;
    slot.y = y;
    slot.num.setY(y);
    for (const cell of slot.cells) cell.setY(y);
  }

  /**
   * Bring the pool in line with the window. When the window slid down exactly
   * one row, every slot but one already holds the right row, so the ring is
   * rotated and only the slot that fell off the top is rewritten with the row
   * that scrolled in. Any other change rewrites the whole window.
   */
  private syncText(advance: boolean): void {
    const shown = this.rowsShown;
    // A view change (F8, or the cursor moving to another channel while the drum
    // view is up) makes every cache in the pool a claim about the WRONG cell, so
    // the caches are thrown away before anything is written from them.
    const key = `${this.drumView ? 'drum' : 'track'}|${this.drumView ? this.viewTrack : -1}`;
    if (key !== this.viewKey) {
      this.viewKey = key;
      for (const slot of this.slots) {
        slot.numValue = UNSET;
        for (let t = 0; t < slot.cellValue.length; t++) {
          slot.cellValue[t] = UNSET;
          slot.cellColor[t] = -1;
          slot.cellAlpha[t] = -1;
        }
      }
      // And the advance path is refused once: it rewrites the single row that
      // scrolled in and trusts the rest, which is exactly the trust just broken.
      this.slotTop = -1;
    }
    const canAdvance = advance
      && shown > 0
      && this.slotTracks === this.columns
      && this.liveSlots === shown
      && this.slotTop === this.top - 1
      && this.top + shown <= this.rows;

    this.ensureSlots(shown);

    if (canAdvance) {
      const recycled = this.slots[this.slotStart];
      this.slotStart = (this.slotStart + 1) % shown;
      recycled.row = this.top + shown - 1;
      this.writeSlot(recycled);
    } else {
      this.slotStart = 0;
      for (let i = 0; i < shown; i++) {
        const slot = this.slots[i];
        slot.row = this.top + i;
        this.writeSlot(slot);
      }
    }

    for (let i = 0; i < shown; i++) this.positionSlot(this.slots[(this.slotStart + i) % shown]);
    for (let i = shown; i < this.slots.length; i++) {
      const slot = this.slots[i];
      slot.num.setVisible(false);
      for (const cell of slot.cells) cell.setVisible(false);
    }

    this.liveSlots = shown;
    this.slotTop = this.top;
    this.slotTracks = this.columns;
  }

  private cellY(row: number): number {
    return this.rowY(row) + Math.round((this.rowH - 8) / 2) - 1;
  }

  /** A band at the bottom of the space a row would occupy, so rows never touch. */
  private paintBand(g: Phaser.GameObjects.Graphics, row: number, color: number, alpha: number): void {
    const y = this.rowY(row);
    const h = this.rowY(row + 1) - y;
    g.fillStyle(color, alpha);
    g.fillRect(GUTTER_W, y, this.rect.width - GUTTER_W, Math.max(1, h - 1));
  }

  private paintCursor(): void {
    const c = activeColors();
    const g = this.cursorGfx;
    g.clear();
    const { row, track } = this.cursor;
    if (row < 0 || row >= this.rows || track < 0 || track >= this.trackCount) return;
    if (!this.onScreen(row)) return;
    // In the drum view the cursor is a whole ROW: the four lanes are one channel's
    // kit, and the edit cursor is not on a lane, it is on the step — a band across
    // the row is the honest picture of that, and it is also what a drum machine
    // shows as you walk the sequence.
    const x = this.drumView ? GUTTER_W : this.colX(track);
    const y = this.rowY(row);
    const w = this.drumView ? this.rect.width - GUTTER_W - BAR_W : this.colX(track + 1) - x;
    const h = this.rowY(row + 1) - y;
    g.fillStyle(c.ward, 0.22);
    g.fillRect(x, y, w, h - 1);
    g.fillStyle(c.ward, 0.95);
    g.fillRect(x, y, 2, h - 1);
    g.fillStyle(c.ward, 0.6);
    g.fillRect(x, y + h - 1, w, 1);

    // A marker in the gutter, so the edit row reads even when the eye is left.
    g.fillStyle(c.ward, 0.95);
    g.fillRect(2, y, 2, h - 2);
  }

  /** A quiet wash under the pointer, so the mouse feels alive on the grid. */
  private paintHover(): void {
    const c = activeColors();
    const g = this.hoverGfx;
    g.clear();
    const cell = this.hovered;
    if (!cell || cell.row < 0 || cell.row >= this.rows || cell.track < 0 || cell.track >= this.trackCount) return;
    if (!this.onScreen(cell.row)) return;
    const x = this.colX(cell.track);
    const y = this.rowY(cell.row);
    const w = this.colX(cell.track + 1) - x;
    const h = this.rowY(cell.row + 1) - y;
    g.fillStyle(c.stoneHi, 0.14);
    g.fillRect(x, y, w, h - 1);
  }

  private paintPlayhead(): void {
    const c = activeColors();
    const g = this.playGfx;
    g.clear();
    if (this.playhead < 0 || this.playhead >= this.rows || !this.onScreen(this.playhead)) return;
    this.paintBand(g, this.playhead, c.ooze, 0.16);
    const y = this.rowY(this.playhead);
    g.fillStyle(c.ooze, 0.85);
    g.fillRect(GUTTER_W, y, this.rect.width - GUTTER_W, 1);
  }

  /**
   * The OVERVIEW strip: the whole pattern down the right edge, drawn only when it
   * is longer than the window. Without it a scrolled grid looks exactly like a
   * grid whose music stops halfway.
   *
   * It is a MAP, not just a scrollbar: every step that carries a note gets a mark,
   * brighter the more notes it holds, so the song reads as a shape — a wall of
   * beats, a quiet intro, a chorus that comes back. The window you are looking
   * through is the lit band over it, and clicking the strip jumps to that step.
   *
   * The band is an OUTLINE rather than a fill, so the marks inside it stay
   * readable; a solid thumb would hide exactly the steps you are looking at.
   */
  private paintBar(): void {
    const c = activeColors();
    const g = this.barGfx;
    g.clear();
    const shown = this.barShown;
    this.setBarInteractive(shown);
    if (!shown) return;
    const { x, y: trackY, height: trackH } = this.barRectLocal();
    g.fillStyle(c.ink, 0.7);
    g.fillRect(x, trackY, BAR_W, trackH);

    // One mark per step that has a note, scaled by its density. Several steps may
    // share a pixel on a long song; drawing them in order means the brightest wins.
    const density = overviewDensity(this.pattern);
    const markH = overviewMarkH(trackH, this.rows);
    density.forEach((notes, row) => {
      if (notes === 0) return;
      const my = overviewYAt(row, trackY, trackH, this.rows);
      const alpha = Math.min(0.85, 0.3 + notes * 0.18);
      g.fillStyle(c.textPrimary, alpha);
      g.fillRect(x + 1, my, BAR_W - 2, markH);
    });

    // The window, as a band whose edges are lit and whose middle is a wash.
    const thumbH = Math.max(6, Math.round(trackH * (this.rowsShown / this.rows)));
    const travel = trackH - thumbH;
    const thumbY = trackY + Math.round(travel * (this.top / Math.max(1, this.maxTop)));
    g.fillStyle(c.ward, 0.16);
    g.fillRect(x, thumbY, BAR_W, thumbH);
    g.fillStyle(c.ward, 0.9);
    g.fillRect(x, thumbY, BAR_W, 1);
    g.fillRect(x, thumbY + thumbH - 1, BAR_W, 1);
  }

  /** Let the overview be clicked only while it is on screen. */
  private setBarInteractive(on: boolean): void {
    if (on === this.barInteractive) return;
    this.barInteractive = on;
    if (on) this.barZone.setInteractive({ useHandCursor: true });
    else this.barZone.disableInteractive();
  }

  /**
   * The friendly "this pattern is empty" overlay. Its Texts are built once and
   * then only recoloured: this ran on every repaint of every pattern, empty or
   * not, and rebuilding five Texts each time was a stall of its own.
   */
  private paintOverlay(): void {
    const g = this.overlayGfx;
    g.clear();
    if (!this.emptyShown) return;

    const c = activeColors();
    const theme = activeTheme();
    const top = HEAD_H;
    const h = this.rect.height - top;
    g.fillStyle(c.ink, 0.78);
    g.fillRect(GUTTER_W, top, this.rect.width - GUTTER_W, h);

    const cx = Math.round((GUTTER_W + this.rect.width) / 2);
    const cy = top + Math.round(h / 2);
    const lines: { text: string; y: number; size: number; color: number; display?: boolean }[] = [
      // The one line in the app set in a DISPLAY face rather than the UI one. An
      // empty pattern is not asking to be read so much as looked at, so this
      // heading is allowed to be decorative — where every label, menu and note
      // name stays in the face that is legible at eight pixels.
      //
      // It is set at 20px, not the 12 it used to be, because a decorative face
      // draws small for its point size: 'Maze' has a cap height of about 8px at
      // 12px, the same as the 8px UI text below it, so the heading read as a
      // run-on from its own sub-lines. At 20 its cap height is ~14px — twice the
      // body — and it is lifted clear so the two no longer crowd.
      { text: 'NOTHING HERE YET', y: cy - 42, size: 20, color: theme.colors.ooze, display: true },
      { text: 'CLICK A PIANO KEY BELOW', y: cy - 8, size: 8, color: c.textPrimary },
      { text: 'OR TYPE ON THE Z/X/C AND Q/W/E ROWS', y: cy + 2, size: 8, color: c.textPrimary },
      { text: 'SPACE PLAYS IT BACK', y: cy + 14, size: 8, color: c.textDim },
      { text: 'OR PRESS SCRIPT TO WRITE ONE AS TEXT', y: cy + 26, size: 8, color: c.textDim },
    ];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let text = this.overlayTexts[i];
      if (!text) {
        text = uiText(this.scene, cx, line.y, line.text, {
          size: line.size,
          color: line.color,
          // `uiText`'s `font` option knows the framework's two faces only, so a
          // display line names Alagard here as its fallback and then swaps in
          // Tracklet's own family after the fact (see DISPLAY_FONT).
          font: line.display ? 'alagard' : undefined,
          origin: { x: 0.5, y: 0 },
        });
        if (line.display) text.setFontFamily(DISPLAY_FONT);
        this.overlay.add(text);
        this.overlayTexts[i] = text;
      }
      text.setX(cx);
      text.setY(line.y);
      text.setColor(cssOf(line.color));
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
