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

import { fitBounce, markedBounce, type BounceMark } from '../model/bounce';
import { orderSectionLabels, sectionByName } from '../model/sections';
import { countNotes, isPatternEmpty, MAX_ORDER, type Song } from '../model/song';
import { tuningById } from '../model/tuning';
import { menuIntent } from './menuKeys';

/**
 * SongMenu — the F3 menu: the song's ORDER, as a list of bars you can edit.
 *
 * A pattern is one bar of music. The order is the list of bars, so `1 1 2 1` is
 * two bars of verse, a chorus bar and the verse again — which is the difference
 * between a loop and a song, and the one structural thing a tracker has that
 * this app was missing.
 *
 * It is a LIST rather than a new panel because there is nowhere to put a panel:
 * the main screen is exactly as full as it can be, and inventing a fifth strip
 * would cost the pattern grid room it needs. A modal costs nothing, and the app
 * already has three of them, so `F3` is a key a player has already learned.
 *
 * The whole model is four verbs, and each one is both a button and a key, so the
 * menu is fully usable with the mouse alone and fully usable from the keyboard
 * alone:
 *
 *   MOVE    click a bar, or the arrows          — and clicking also GOES there
 *   CHANGE  PAT - / PAT +, or [ and ]           — point this bar at another pattern
 *   ADD     ADD BAR, or Insert                  — the bar you are editing joins the song
 *   REMOVE  REMOVE BAR, or Delete               — never the last one
 *
 * The scene owns every edit, the same way it does for the channel list, so an
 * add or a removal is one undo step and every view refreshes through one path.
 * The menu reads the song through a getter rather than holding a copy, so it can
 * never draw an order the app no longer has.
 */

export interface SongMenuHandlers {
  /** The menu opened or closed, so the scene can pause its own input. */
  onOpenChange?: (open: boolean) => void;
  /** The song as it stands now, read on every redraw. */
  song: () => Song;
  /** Append the pattern the editor is on. Returns the status line to show. */
  addBar: () => string;
  removeBar: (index: number) => string;
  setBarPattern: (index: number, pattern: number) => string;
  /** Put the editor (and playback) on the pattern a bar plays. */
  goToBar: (index: number) => string;
  /** Move the song on to its next TEMPERAMENT. Returns the status line to show. */
  cycleTuning: () => string;
  /**
   * `M` on a bar: move the drum machine BAR its section plays on by one.
   *
   * The cycle is the model's (`off`, then each bar the machine has, then off),
   * and the sentence comes back from the scene because a machine edit takes an
   * undo step and the scene is what owns history. Optional so the menu can be
   * built in a test without a scene behind it.
   */
  cycleSectionMachine?: (barIndex: number) => string;
  /**
   * The bars an export will render, as a MARK — the half-made state included.
   *
   * The scene owns it, because the scene is what exports: this menu reads it to
   * draw the `[` and `]` and writes it through `markBounce` below. A getter
   * rather than a copy, like `song`, so the list can never draw a bar marked for
   * an export that has since been cleared.
   */
  bounce?: () => BounceMark;
  /** `L` on a bar: begin a region, finish one, or take one off. */
  markBounce?: (bar: number) => string;
}

/** The canvas the app is drawn in. */
const CANVAS_W = 720;
const CANVAS_H = 405;

/** The menu frame, in canvas coordinates. */
const MODAL: Rect = { x: 76, y: 26, width: 568, height: 336 };

/** Render depths: dim < curtain < frame < text and buttons. Above the toast at 950. */
const DEPTH_DIM = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_FRONT = 980;

const BODY_X = MODAL.x + 4;
const BODY_W = MODAL.width - 8;

/** Rows: ten bars at a time, which is more than anyone reads at once. */
const ROW_H = 22;
const VISIBLE = 10;
const LIST_TOP = MODAL.y + 24;

/** The columns inside a row. */
const COL_SLOT = BODY_X + 2;
/** Where a bar's export-region bracket goes, between the number and the pattern. */
const COL_MARK = BODY_X + 15;
const COL_PAT = BODY_X + 30;
const COL_NAME = BODY_X + 80;
/**
 * Where a bar's SECTION is drawn, clear of the pattern's name and of the notes
 * count that is right-aligned at the far end. A label is at most twelve
 * characters, so the column never runs into either.
 */
const COL_SECTION = BODY_X + 208;

const LINE_H = 11;
const STATUS_TOP = MODAL.y + 256;
/** The two key hints, under the status line. */
const HINT_TOP = MODAL.y + 288;

const BTN_H = 20;
const BTN_GAP = 6;
const BTN_W = Math.floor((BODY_W - BTN_GAP * 6) / 7);
const BTN_TOP = MODAL.y + MODAL.height - BTN_H - 6;

/** Which theme colour a piece of copy wears, so a recolour can find it. */
type TextRole = 'heading' | 'body' | 'accent' | 'dim';

interface StaticText {
  obj: Phaser.GameObjects.Text;
  role: TextRole;
}

export class SongMenu {
  private readonly scene: Phaser.Scene;
  private readonly handlers: SongMenuHandlers;

  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly rowLayer: Phaser.GameObjects.Container;
  private readonly buttons: Button[] = [];
  private readonly staticCopy: StaticText[] = [];

  private rowTexts: Phaser.GameObjects.Text[] = [];
  private rowZones: Phaser.GameObjects.Zone[] = [];

  private selected = 0;
  /** The first visible bar, so a long order can be walked past ten at a time. */
  private top = 0;
  private status = '';
  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: SongMenuHandlers) {
    this.scene = scene;
    this.handlers = handlers;

    this.dim = scene.add.graphics().setDepth(DEPTH_DIM);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.rowLayer = scene.add.container(0, 0).setDepth(DEPTH_FRONT + 1);

    // A full-screen zone in front of the app, so a stray click under the menu
    // cannot edit the song. It also dismisses the menu, because a modal you
    // cannot leave by clicking is worse than no modal.
    this.curtain = scene.add.zone(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);
    this.curtain.on('pointerdown', () => this.hide());

    this.buildCopy();
    this.buildButtons();

    this.unsubscribe = onThemeChanged(() => this.render());
    this.setOpen(false);
    this.render();
  }

  /** True while the menu is up; the scene pauses itself while it is. */
  get isOpen(): boolean { return this.opened; }

  show(): void {
    this.selected = Math.min(this.selected, Math.max(0, this.handlers.song().order.length - 1));
    this.setOpen(true);
    this.render();
  }

  hide(): void { this.setOpen(false); }
  toggle(): void { if (this.opened) this.hide(); else this.show(); }

  private setOpen(open: boolean): void {
    // Only report a CHANGE: the constructor closes once to reach a known state,
    // and the scene would otherwise hear "closed" before its input exists.
    const changed = open !== this.opened;
    this.opened = open;
    this.dim.setVisible(open);
    this.frame.setVisible(open);
    this.curtain.setVisible(open);
    this.rowLayer.setVisible(open);
    for (const button of this.buttons) button.container.setVisible(open);
    for (const entry of this.staticCopy) entry.obj.setVisible(open);
    for (const text of this.rowTexts) text.setVisible(open);
    for (const zone of this.rowZones) zone.setVisible(open);
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- keyboard -------------------------------------------------------------

  /**
   * The keys the menu answers to beyond the shared menu set.
   *
   * `[` and `]` change the selected bar's pattern and `Insert`/`Delete` add and
   * remove bars — the four things the shared set has no intent for. They are
   * read here rather than added to `menuIntent` because they mean something only
   * in THIS menu, and widening the shared table would make the other three menus
   * carry keys they ignore.
   */
  private extraKey(code: string): 'patternDown' | 'patternUp' | 'add' | 'remove' | 'loop' | 'machine' | null {
    switch (code) {
      case 'BracketLeft': case 'Minus': case 'NumpadSubtract': return 'patternDown';
      case 'BracketRight': case 'Equal': case 'NumpadAdd': return 'patternUp';
      case 'Insert': return 'add';
      case 'Delete': case 'Backspace': return 'remove';
      case 'KeyL': return 'loop';
      // `M` for the MACHINE bar the bar's section plays — the one machine fact
      // that belongs to the FORM rather than to the instrument.
      case 'KeyM': return 'machine';
      default: return null;
    }
  }

  handleKey(e: KeyboardEvent): void {
    const intent = menuIntent(e.code);
    if (intent === 'close') {
      e.preventDefault();
      this.hide();
      return;
    }
    if (intent === 'up') { e.preventDefault(); this.move(-1); return; }
    if (intent === 'down') { e.preventDefault(); this.move(1); return; }
    if (intent === 'first') { e.preventDefault(); this.select(0); return; }
    if (intent === 'last') { e.preventDefault(); this.select(this.bars() - 1); return; }
    if (intent === 'pick') { e.preventDefault(); this.act(() => this.handlers.goToBar(this.selected)); return; }

    const extra = this.extraKey(e.code);
    if (extra === 'patternDown') { e.preventDefault(); this.stepPattern(-1); return; }
    if (extra === 'patternUp') { e.preventDefault(); this.stepPattern(1); return; }
    if (extra === 'add') { e.preventDefault(); this.addBar(); return; }
    if (extra === 'loop') { e.preventDefault(); this.markLoop(); return; }
    if (extra === 'machine') {
      e.preventDefault();
      const run = this.handlers.cycleSectionMachine;
      this.act(() => run ? run(this.selected) : 'NO SECTIONS IN THIS MENU');
      return;
    }
    if (extra === 'remove') { e.preventDefault(); this.act(() => this.handlers.removeBar(this.selected)); }
  }

  // --- actions --------------------------------------------------------------

  private bars(): number {
    return this.handlers.song().order.length;
  }

  /** Run an edit, show what it said, and redraw from the song it changed. */
  private act(run: () => string): void {
    this.status = run();
    this.selected = Math.min(this.selected, Math.max(0, this.bars() - 1));
    this.render();
  }

  private select(index: number): void {
    const last = Math.max(0, this.bars() - 1);
    this.selected = Math.max(0, Math.min(last, index));
    this.scrollToSelection();
    this.render();
  }

  private move(delta: number): void {
    this.select(this.selected + delta);
  }

  /**
   * Add a bar and FOLLOW it: the bar you just added is the one you most likely
   * want to point somewhere, and leaving the highlight up at bar 1 would mean
   * the next `PAT +` edits a bar you are not looking at.
   */
  private addBar(): void {
    const before = this.bars();
    this.act(() => this.handlers.addBar());
    if (this.bars() > before) this.select(this.bars() - 1);
  }

  /** Point the selected bar at the pattern `delta` away from the one it has. */
  private stepPattern(delta: number): void {
    const song = this.handlers.song();
    const current = song.order[this.selected] ?? 1;
    const next = Math.max(1, current + delta);
    if (next === current) {
      this.status = delta < 0 ? 'THAT IS THE FIRST PATTERN' : 'THAT IS THE LAST PATTERN';
      this.render();
      return;
    }
    this.act(() => this.handlers.setBarPattern(this.selected, next));
  }

  /**
   * `L`: mark the highlighted bar as one end of the export region.
   *
   * The gesture is two presses — the bar it starts at, then the bar it ends at —
   * and a press on the END bar takes the region off again. Which press means what
   * is the model's rule (`markBounce`), and the sentence that comes back is its
   * own line too, because a region is invisible on the main screen and this is
   * the one place it is explained rather than drawn.
   */
  private markLoop(): void {
    const at = this.selected + 1;
    const status = this.handlers.markBounce?.(at);
    if (status === undefined) return;
    this.status = status;
    this.render();
  }

  private scrollToSelection(): void {
    if (this.selected < this.top) this.top = this.selected;
    if (this.selected >= this.top + VISIBLE) this.top = this.selected - VISIBLE + 1;
    this.top = Math.max(0, Math.min(this.top, Math.max(0, this.bars() - VISIBLE)));
  }

  // --- building -------------------------------------------------------------

  private buildCopy(): void {
    // The title is rebuilt on every render (it counts the bars), so only the
    // parts that never change are built once.
    this.addStatic(BODY_X, MODAL.y + 4, 'BAR       PLAYS', 'heading');
    // The form's own heading, drawn only when the song has a form: the column is
    // empty for a song whose bars have no names, and an empty heading would be a
    // word about nothing.
    this.sectionHeading = this.addStatic(COL_SECTION, MODAL.y + 4, 'SECTION', 'heading');
    this.addStatic(BODY_X, HINT_TOP, 'ARROWS MOVE   ENTER GO THERE   [ ] CHANGE ITS PATTERN', 'accent');
    this.addStatic(BODY_X, HINT_TOP + LINE_H, 'INS ADD   DEL REMOVE   L EXPORT LOOP   M SECTION\u2019S DRUM BAR   ESC CLOSES', 'dim');
  }

  private addStatic(x: number, y: number, text: string, role: TextRole): Phaser.GameObjects.Text {
    const obj = uiText(this.scene, x, y, text, { size: 8, color: activeColors().textPrimary });
    obj.setDepth(DEPTH_FRONT + 2);
    this.staticCopy.push({ obj, role });
    return obj;
  }

  private buildButtons(): void {
    const specs: ReadonlyArray<readonly [string, () => void]> = [
      ['PAT -', () => this.stepPattern(-1)],
      ['PAT +', () => this.stepPattern(1)],
      ['ADD BAR', () => this.addBar()],
      ['REMOVE BAR', () => this.act(() => this.handlers.removeBar(this.selected))],
      ['DRUM BAR', () => this.act(() => this.handlers.cycleSectionMachine?.(this.selected) ?? 'NO SECTIONS IN THIS MENU')],
      ['TUNING', () => this.act(() => this.handlers.cycleTuning())],
      ['CLOSE', () => this.hide()],
    ];
    specs.forEach(([label, run], i) => {
      const button = new Button(
        this.scene,
        { x: BODY_X + i * (BTN_W + BTN_GAP), y: BTN_TOP, width: BTN_W, height: BTN_H },
        label,
        { size: 8 },
      );
      button.container.setDepth(DEPTH_FRONT + 2);
      button.onPress = run;
      this.buttons.push(button);
    });
  }

  // --- drawing --------------------------------------------------------------

  render(): void {
    const c = activeColors();
    const theme = activeTheme();
    const g = this.frame;

    // The dim layer first: the app must read as BEHIND the menu, or the two
    // look like one screen and the pattern grid underneath competes with the
    // list for attention.
    this.dim.clear();
    this.dim.fillStyle(c.ink, 0.8);
    this.dim.fillRect(0, 0, CANVAS_W, CANVAS_H);

    g.clear();
    drawPanel(g, MODAL, 1, c);
    drawDivider(g, MODAL.x + 2, MODAL.y + 14, MODAL.width - 4, 1, c);

    const song = this.handlers.song();
    const bars = song.order.length;
    // Which section each bar came from, or nothing at all for a song whose form
    // was not named — the reading is the model's, not this screen's, and it says
    // nothing rather than something almost right when the order has been edited
    // by hand since the arrangement was written.
    const labels = orderSectionLabels(song.order, song.sections, song.arrangement);
    const named = labels.some((label) => label !== null);
    // The EXPORT REGION, fitted to the order as the exporter fits it: a mark that
    // reaches past the song's last bar is drawn on the bars that exist, which is
    // exactly what it will render.
    const marked = markedBounce(this.handlers.bounce?.() ?? { kind: 'none' });
    const region = marked === null ? null : fitBounce(marked, bars);
    this.drawTitle(bars, song.patterns.length, c);

    for (const text of this.rowTexts) text.destroy();
    for (const zone of this.rowZones) zone.destroy();
    this.rowTexts = [];
    this.rowZones = [];

    // Keep the window on the selection however it moved (a key, a click, or a
    // removal that pulled the list up from under it).
    this.scrollToSelection();

    for (let i = 0; i < Math.min(VISIBLE, bars); i++) {
      const index = this.top + i;
      const oneBased = song.order[index];
      const y = LIST_TOP + i * ROW_H;
      const selected = index === this.selected;
      const pattern = song.patterns[oneBased - 1];

      if (selected) {
        g.fillStyle(c.ooze, 0.18);
        g.fillRect(BODY_X, y - 1, BODY_W, ROW_H - 1);
        g.fillStyle(c.ooze, 0.9);
        g.fillRect(BODY_X, y - 1, 2, ROW_H - 1);
      }

      if (region !== null && index + 1 >= region.from && index + 1 <= region.to) {
        // Everything the export will render wears a bracket on its left edge,
        // because a region that only showed at its two ends would be invisible on
        // a scrolled list. One bar is `[]`, and the ends of a longer one are `[`
        // and `]` — the same two marks the hint line names.
        g.fillStyle(c.ward, 0.16);
        g.fillRect(BODY_X, y - 1, 3, ROW_H - 1);
      }
      const empty = pattern === undefined || isPatternEmpty(pattern);
      const name = pattern?.name ?? 'MISSING';
      this.pushRowText(COL_SLOT, y, String(index + 1).padStart(2, '0'), c.textDim);
      if (region !== null) {
        const bar = index + 1;
        const mark = bar === region.from && bar === region.to
          ? '[]'
          : bar === region.from ? '[' : bar === region.to ? ']' : '';
        if (mark !== '') this.pushRowText(COL_MARK, y, mark, c.ward);
      }
      this.pushRowText(COL_PAT, y, `PAT ${oneBased}`, selected ? c.ward : c.textPrimary);
      this.pushRowText(COL_NAME, y, clip(name, 24), empty ? c.textDim : c.textPrimary);
      const label = labels[index];
      if (label !== null && label !== undefined) {
        // The section's drum machine BAR rides beside its name, when it names one
        // — so the form view answers "which beat is this part?" without a trip to
        // the machine. A section that names none draws its name alone.
        const machineBar = sectionByName(song.sections, label)?.machineBar;
        const text = machineBar == null ? label : `${label} m${machineBar}`;
        this.pushRowText(COL_SECTION, y, clip(text, 16), selected ? c.ward : c.ooze);
      }
      const notes = pattern === undefined ? '' : `${countNotes(pattern)} NOTES`;
      const right = uiText(this.scene, BODY_X + BODY_W - 6, y, notes, {
        size: 8, color: empty ? c.textDim : theme.colors.ooze, origin: { x: 1, y: 0 },
      });
      this.rowLayer.add(right);
      this.rowTexts.push(right);

      // One zone per row, spanning the whole width: a bar is a row, and clicking
      // it means "take me there", which is the only thing a click could mean.
      const zone = this.scene.add.zone(BODY_X, y - 1, BODY_W, ROW_H - 1)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        this.selected = index;
        this.scrollToSelection();
        this.act(() => this.handlers.goToBar(index));
      });
      this.rowLayer.add(zone);
      this.rowZones.push(zone);
    }

    this.drawStatus(bars, c);
    for (const entry of this.staticCopy) entry.obj.setVisible(this.opened);
    // After the loop above, which shows every static line: the section heading is
    // the one piece of copy that also depends on the SONG having a form.
    this.sectionHeading?.setVisible(this.opened && named);
    for (const text of this.rowTexts) text.setVisible(this.opened);
    for (const zone of this.rowZones) zone.setVisible(this.opened);
  }

  private pushRowText(x: number, y: number, text: string, color: number): void {
    const obj = uiText(this.scene, x, y, text, { size: 8, color });
    this.rowLayer.add(obj);
    this.rowTexts.push(obj);
  }

  /** The title and the status line, which change every render. */
  private titleObj: Phaser.GameObjects.Text | null = null;
  private statusObj: Phaser.GameObjects.Text | null = null;
  /** The `SECTION` heading, which exists only while the song has a form. */
  private sectionHeading: Phaser.GameObjects.Text | null = null;

  private drawTitle(bars: number, patterns: number, c: ReturnType<typeof activeColors>): void {
    // The TUNING joins the title rather than a row of its own: it is one word,
    // it belongs to the whole song like the bar count does, and the TUNING
    // button below is where it is changed.
    const temperament = tuningById(this.handlers.song().tuning);
    const tuning = temperament ? `  -  ${temperament.label}` : '';
    const text = `SONG ORDER  -  ${bars} BAR${bars === 1 ? '' : 'S'}  -  ${patterns} PATTERN${patterns === 1 ? '' : 'S'}${tuning}`;
    if (!this.titleObj) {
      this.titleObj = uiText(this.scene, BODY_X + BODY_W, MODAL.y + 4, text, {
        size: 8, color: c.textDim, origin: { x: 1, y: 0 },
      });
      this.titleObj.setDepth(DEPTH_FRONT + 2);
      this.staticCopy.push({ obj: this.titleObj, role: 'dim' });
    }
    this.titleObj.setText(text);
    this.titleObj.setColor(intToCss(c.textDim));
  }

  private drawStatus(bars: number, c: ReturnType<typeof activeColors>): void {
    if (!this.statusObj) {
      const obj = uiText(this.scene, BODY_X, STATUS_TOP, '', { size: 8, color: c.textPrimary });
      obj.setDepth(DEPTH_FRONT + 2);
      this.staticCopy.push({ obj, role: 'body' });
      this.statusObj = obj;
    }
    // The status doubles as the "why is this refused" line, so it is never
    // blank: with nothing to report it explains what an order IS, and it says so
    // in advance when the song has reached its ceiling.
    const fallback = bars >= MAX_ORDER
      ? `A SONG HOLDS AT MOST ${MAX_ORDER} BARS.`
      : 'BARS PLAY IN ORDER, THEN THE SONG LOOPS.';
    this.statusObj.setText(this.status === '' ? fallback : this.status);
    this.statusObj.setColor(intToCss(this.status === '' ? c.textDim : c.textPrimary));
  }

  destroy(): void {
    this.unsubscribe();
    for (const text of this.rowTexts) text.destroy();
    for (const entry of this.staticCopy) entry.obj.destroy();
    for (const button of this.buttons) button.destroy();
    this.dim.destroy();
    this.frame.destroy();
    this.rowLayer.destroy();
    this.curtain.destroy();
  }
}

/** Clip a name to a character budget, so a row stays one line. */
function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)) + '\u2026';
}
