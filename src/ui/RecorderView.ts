import type Phaser from 'phaser';
import {
  activeColors,
  drawInset,
  drawPanel,
  onThemeChanged,
  uiPx,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';

import type { MicDevice, MicLevel } from '../audio/recorder';
import { bounceBars, fitBounce, type BounceRange } from '../model/bounce';
import { loudLabel } from '../model/loudness';
import type { Song } from '../model/song';
import {
  clearTakeLoop,
  resetTakeWindow,
  takeLoop,
  takeOriginLabel,
  takeWindow,
  type Take,
} from '../model/take';
import { RenameBox } from './RenameBox';
import {
  HANDLE_STEP_SECONDS,
  METER_TICKS,
  RECORDER_EXPORTS,
  RECORDER_HINT,
  TAKE_HANDLES,
  clampZoom,
  cycleHandle,
  dragHandle,
  dropdownRect,
  dropdownRowRect,
  formatDbfs,
  formatSeconds,
  handleIsLoop,
  loudnessRowIndex,
  loudnessRows,
  meterCells,
  moveDropdownRow,
  nearestHandle,
  openDropdown,
  peakClips,
  stepTakeHandle,
  takeHandleTime,
  windowAt,
  windowTimeToX,
  windowXToTime,
  waveformColumns,
  zoomStep,
  type DropdownState,
  type RecorderExportId,
  type TakeHandle,
} from './recorderBoard';

/**
 * RecorderView — the RECORDER page, the place audio goes in and comes out.
 *
 * ── The shape ────────────────────────────────────────────────────────────────
 * A status line across the top, then an INPUT row (the microphone, its level, and
 * `● RECORD`), then three panels across the middle — the TAKES library on the
 * left, the WAVEFORM EDITOR in the centre, and THIS TAKE / USE IN SONG on the
 * right — and finally an EXPORT SONG band over a key-hint line.
 *
 * It is one screen with two ends: the takes are captured, trimmed, looped and
 * named on the way IN; the region, loudness and three writers send the SONG out.
 * Nothing here owns audio: the waveform comes back from the scene on every paint,
 * a drag goes back through `setTake`, and the exports call the SAME producers
 * `F2 -> EXPORT...` runs, so a file is identical whichever screen asked for it.
 *
 * ── It holds no take ────────────────────────────────────────────────────────
 * The selected take, the focused handle, the zoom and the meter's own latch are
 * the page's VIEW state; every take, the song and the input come back from the
 * scene each paint. A take is app state — never a song field — so the one control
 * that reaches the song is `GIVE TO CHANNEL`, and that is one undo step.
 */

/** A short sentence's tone, for the input note. */
export type InputTone = 'ok' | 'warn' | 'error';

export interface RecorderHandlers {
  onOpenChange?: (open: boolean) => void;

  // --- the take library ---
  /** The takes the app holds, in capture order. */
  takes: () => Take[];
  /** Which take the page is showing. */
  selected: () => number;
  select: (index: number) => void;
  /** Waveform columns for one take, reduced from its decoded frames. */
  waveform: (take: Take, columns: number) => number[];
  /** The recording's own sample rate, for the header's `48 kHz`. */
  rate: (take: Take) => number;
  /** Replace one take — the commit for a trim/loop drag or a stepper. No undo. */
  setTake: (index: number, take: Take) => void;
  rename: (index: number, name: string) => void;
  /** Take one recording out of the bank. Guarded here by a two-press arm. */
  remove: (index: number) => void;
  /** Pick a `.wav` and add it to the bank and the take list. */
  importAudio: () => void;

  // --- the input ---
  /** The microphones the browser offers, in order. */
  devices: () => MicDevice[];
  /** Which device the meter is on. */
  deviceIndex: () => number;
  /** Choose a microphone by row, re-arming the meter if it is open. */
  selectDevice: (index: number) => void;
  /** True while a live input meter is open. */
  metering: () => boolean;
  /** Open or close the input meter — an explicit microphone gesture. */
  toggleMeter: () => void;
  /** A reason this build cannot reach a microphone, or null. */
  refusal: () => string | null;
  /** What the last microphone attempt said (permission refused), or null. */
  micError: () => string | null;
  /** The name the next capture will take. */
  nextTakeName: () => string;
  recording: () => boolean;
  /** Start capturing, or stop when a capture is running. */
  capture: () => void;

  // --- the song side ---
  song: () => Song;
  /** The channel `GIVE TO CHANNEL` would point at a take. */
  selectedChannel: () => number;
  selectChannel: (index: number) => void;
  /** Give a take's recording to the selected channel; ONE undo step. */
  give: (index: number) => void;
  /** Audition a take through the selected channel. */
  audition: (index: number) => void;
  /** Whether `HEAR` loops the take's loop points, or plays it through once. */
  loopAudition: () => boolean;
  toggleLoopAudition: () => void;
  /** Add a channel to the song — the dashed button under the panels. */
  addChannel: () => void;

  // --- the export ---
  /** The region an export renders, or null for the whole song. */
  bounce: () => BounceRange | null;
  /** Select the whole song. */
  setWholeSong: () => void;
  /** Select a bar range (a sensible first range if none is set). */
  setBarRange: () => void;
  /** Move one end of the bar range by a number of bars. */
  nudgeBar: (end: 'from' | 'to', step: number) => void;
  /** The loudness an export normalises to, or null for none. */
  loudness: () => number | null;
  /** Choose a loudness target outright, or null for OFF. */
  setLoudness: (value: number | null) => void;
  /** Run one of the three writers, behaving exactly as `F2 -> EXPORT...` does. */
  export: (id: RecorderExportId) => void;

  /** The page opened a DOM text box, so the scene must keep quiet. */
  setTextEditing: (editing: boolean) => void;
  close: () => void;
}

const CANVAS_W = 720;
const PAGE_TOP = 39;
const PAGE_BOTTOM = 341;

const STATUS: Rect = { x: 8, y: 40, width: 704, height: 16 };
const INPUT: Rect = { x: 8, y: 58, width: 704, height: 34 };
const TAKES: Rect = { x: 8, y: 94, width: 156, height: 146 };
const WAVE_PANEL: Rect = { x: 166, y: 94, width: 336, height: 146 };
const RIGHT: Rect = { x: 504, y: 94, width: 208, height: 146 };
const ADDBAR: Rect = { x: 8, y: 240, width: 704, height: 16 };
const EXPORT: Rect = { x: 8, y: 258, width: 704, height: 56 };
const FOOT: Rect = { x: 8, y: 316, width: 704, height: 22 };

// --- INPUT internals ---
const DEVICE: Rect = { x: 52, y: 64, width: 142, height: 20 };
const METER: Rect = { x: 204, y: 66, width: 244, height: 8 };
const METER_TICK_Y = METER.y + METER.height + 1;
const DBFS_X = 456;
const CLIP_BOX: Rect = { x: 512, y: 66, width: 10, height: 10 };
const RECORD_BTN: Rect = { x: 556, y: 61, width: 96, height: 26 };
const NEW_TAKE_X = 658;

// --- TAKES internals ---
const CARD_H = 32;
const CARD_GAP = 3;
const CARDS_Y = TAKES.y + 16;
const IMPORT_BTN: Rect = { x: TAKES.x + 6, y: TAKES.y + TAKES.height - 20, width: TAKES.width - 12, height: 16 };

// --- WAVEFORM internals ---
const PLOT: Rect = { x: WAVE_PANEL.x + 22, y: WAVE_PANEL.y + 22, width: WAVE_PANEL.width - 30, height: 68 };
const RULER_Y = PLOT.y + PLOT.height + 3;
const WAVE_READOUT_Y = RULER_Y + 13;
const WAVE_BTN_Y = WAVE_PANEL.y + 120;
const ZOOM_FIT: Rect = { x: WAVE_PANEL.x + WAVE_PANEL.width - 42, y: WAVE_PANEL.y + 4, width: 34, height: 15 };
const ZOOM_PLUS: Rect = { x: ZOOM_FIT.x - 20, y: ZOOM_FIT.y, width: 17, height: 15 };
const ZOOM_MINUS: Rect = { x: ZOOM_PLUS.x - 19, y: ZOOM_FIT.y, width: 17, height: 15 };
const HEAR_BTN: Rect = { x: WAVE_PANEL.x + 6, y: WAVE_BTN_Y, width: 92, height: 18 };
const LOOP_BTN: Rect = { x: HEAR_BTN.x + HEAR_BTN.width + 4, y: WAVE_BTN_Y, width: 84, height: 18 };
const RESET_BTN: Rect = { x: LOOP_BTN.x + LOOP_BTN.width + 4, y: WAVE_BTN_Y, width: 78, height: 18 };

// --- RIGHT internals ---
const NAME_FIELD: Rect = { x: RIGHT.x + 46, y: RIGHT.y + 16, width: RIGHT.width - 52, height: 15 };
const FIELD_W = (RIGHT.width - 18) / 2;
const FIELD_COL0 = RIGHT.x + 6;
const FIELD_COL1 = FIELD_COL0 + FIELD_W + 6;
const TRIM_LABEL_Y = RIGHT.y + 32;
const TRIM_CTL_Y = RIGHT.y + 41;
const LOOP_LABEL_Y = RIGHT.y + 54;
const LOOP_CTL_Y = RIGHT.y + 63;
const CLEAR_LOOP: Rect = { x: RIGHT.x + 6, y: RIGHT.y + 78, width: RIGHT.width - 12, height: 15 };
const USE_HEAD_Y = RIGHT.y + 102;
const CHANNEL_SEL: Rect = { x: RIGHT.x + 6, y: RIGHT.y + 110, width: RIGHT.width - 12, height: 16 };
const GIVE_BTN: Rect = { x: RIGHT.x + 6, y: RIGHT.y + 126, width: RIGHT.width - 12, height: 15 };

// --- EXPORT internals ---
const WHOLE_BTN: Rect = { x: 14, y: 274, width: 82, height: 16 };
const RANGE_BTN: Rect = { x: 100, y: 274, width: 86, height: 16 };
const START_LABEL_X = 192;
const END_LABEL_X = 296;
const BARS_TEXT_X = 400;
const EXPORT_BTN_Y = 270;
const EXPORT_BTN_W = 90;
const EXPORT_BTN_H = 22;
const EXPORT_BUTTONS: readonly Rect[] = [
  { x: 430, y: EXPORT_BTN_Y, width: EXPORT_BTN_W, height: EXPORT_BTN_H },
  { x: 524, y: EXPORT_BTN_Y, width: EXPORT_BTN_W, height: EXPORT_BTN_H },
  { x: 618, y: EXPORT_BTN_Y, width: EXPORT_BTN_W, height: EXPORT_BTN_H },
];
const LOUD_LABEL_X = 14;
const LOUD_DROP: Rect = { x: 112, y: 292, width: 96, height: 16 };

const DEPTH_BACK = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_MARK = 972;
const DEPTH_STATE = 976;
const DEPTH_HOVER = 977;
/** The open dropdown's panel — above the page's marks, below its own texts. */
const DEPTH_MENU = 978;
const DEPTH_TEXT = 980;
/**
 * The open dropdown's input layers, in the order they must win.
 *
 * A control's own hit zone sits at `DEPTH_TEXT - 1`; the catcher that closes a
 * menu on a click-away goes just ABOVE every one of them, and the rows just above
 * the catcher — which is what makes an open list modal without a second mode flag
 * in every control.
 */
const DEPTH_CATCH = 979.5;
const DEPTH_MENU_ROW = 979.6;

/** One row of an open dropdown, in page pixels. */
const MENU_ROW_H = 12;

/** Which control's list is open. */
type MenuId = 'device' | 'channel' | 'loudness';

/** The `<`/`>` stepper width on a time field or a bar field. */
const STEP_W = 13;
const FIELD_H = 12;

export class RecorderView {
  private readonly scene: Phaser.Scene;
  private readonly handlers: RecorderHandlers;

  private readonly back: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly stateGfx: Phaser.GameObjects.Graphics;
  private readonly hoverGfx: Phaser.GameObjects.Graphics;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly curtain: Phaser.GameObjects.Zone;

  private readonly statusText: Phaser.GameObjects.Text;
  private readonly meterGfx: Phaser.GameObjects.Graphics;
  private readonly dbfsText: Phaser.GameObjects.Text;
  private readonly clipText: Phaser.GameObjects.Text;
  private readonly menuGfx: Phaser.GameObjects.Graphics;

  /** The open dropdown, or null — one at a time, as a menu should be. */
  private menu: { id: MenuId; anchor: Rect; rows: string[]; state: DropdownState } | null = null;

  private readonly nameBox: RenameBox;
  private renameIndex = -1;
  private nameBoxRect: Rect | null = null;

  private texts: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];

  private selectedHandle: TakeHandle = 'trimStart';
  private zoom = 1;
  private zoomCenter = 0;
  private listStart = 0;
  private lastSelected = -1;
  private removeArmed = false;

  private liveLevel: MicLevel = { rms: 0, peak: 0 };
  private status = '';
  private hover: string | null = null;
  private hoverRect: Rect | null = null;

  /** The pointer drag in progress, if any. */
  private dragging: TakeHandle | null = null;
  private readonly onPointerMoveCb: (p: Phaser.Input.Pointer) => void;
  private readonly onPointerUpCb: () => void;

  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: RecorderHandlers) {
    this.scene = scene;
    this.handlers = handlers;

    this.back = scene.add.graphics().setDepth(DEPTH_BACK);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.marks = scene.add.graphics().setDepth(DEPTH_MARK);
    this.stateGfx = scene.add.graphics().setDepth(DEPTH_STATE);
    this.hoverGfx = scene.add.graphics().setDepth(DEPTH_HOVER);
    this.layer = scene.add.container(0, 0).setDepth(DEPTH_TEXT);

    this.statusText = uiText(scene, STATUS.x + 6, STATUS.y + 3, '', { size: 8, color: activeColors().textPrimary });
    this.statusText.setDepth(DEPTH_TEXT + 1);

    // The input meter's own layer: it is repainted on the scene's clock without a
    // full page redraw, so it gets dedicated graphics and two persistent labels.
    this.meterGfx = scene.add.graphics().setDepth(DEPTH_STATE + 1);
    this.dbfsText = uiText(scene, DBFS_X, METER.y - 1, '--', { size: 8, color: activeColors().textPrimary });
    this.dbfsText.setDepth(DEPTH_TEXT + 2);
    this.clipText = uiText(scene, CLIP_BOX.x + CLIP_BOX.width + 3, CLIP_BOX.y, 'CLIP', { size: 8, color: activeColors().textDim });
    this.clipText.setDepth(DEPTH_TEXT + 2);
    this.menuGfx = scene.add.graphics().setDepth(DEPTH_MENU);

    this.curtain = scene.add.zone(0, PAGE_TOP, CANVAS_W, PAGE_BOTTOM - PAGE_TOP).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);

    this.onPointerMoveCb = (pointer) => this.dragTo(pointer.x);
    this.onPointerUpCb = () => { this.dragging = null; };

    this.nameBox = new RenameBox(scene, {
      rect: () => (this.renameIndex >= 0 ? this.nameBoxRect : null),
      maxLength: 16,
      ariaLabel: 'Take name',
      onCommit: (value) => {
        const index = this.renameIndex;
        this.renameIndex = -1;
        if (index >= 0 && value.trim() !== '') this.handlers.rename(index, value);
        this.render();
      },
      onEditingChange: (editing) => {
        this.handlers.setTextEditing(editing);
        if (!editing) this.render();
      },
    });

    this.unsubscribe = onThemeChanged(() => { if (this.opened) this.render(); });
    this.setOpen(false);
  }

  get isOpen(): boolean { return this.opened; }

  /** True while the take-name box owns the keyboard, so the scene keeps quiet. */
  get isRenaming(): boolean { return this.nameBox.isOpen; }

  /**
   * Show a fresh input level.
   *
   * Called by the scene on its own clock while the meter is open, and it touches
   * ONLY the meter's own graphics and readout — never a full `render`, which
   * would rebuild every zone and text on the page sixty times a second and make
   * the hover flicker. The bar is the one thing on the page that moves by itself.
   */
  setLevel(level: MicLevel): void {
    this.liveLevel = level;
    if (this.opened) this.paintMeter();
  }

  show(): void {
    this.status = '';
    this.dragging = null;
    this.removeArmed = false;
    this.menu = null;
    this.setOpen(true);
    this.render();
  }

  hide(): void {
    this.nameBox.finish(true);
    this.dragging = null;
    this.menu = null;
    this.setOpen(false);
  }

  private setOpen(open: boolean): void {
    const changed = open !== this.opened;
    this.opened = open;
    for (const g of [this.back, this.frame, this.marks, this.stateGfx, this.hoverGfx, this.meterGfx, this.menuGfx]) g.setVisible(open);
    this.layer.setVisible(open);
    this.curtain.setVisible(open);
    for (const text of this.texts) text.setVisible(open);
    for (const zone of this.zones) zone.setVisible(open);
    this.statusText.setVisible(open);
    this.dbfsText.setVisible(open);
    this.clipText.setVisible(open);
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- keyboard -------------------------------------------------------------

  /**
   * `LEFT/RIGHT` pick a take  ·  `TAB` / `[` `]` pick a handle  ·  `R` record  ·
   * `ENTER` give  ·  `A` hear  ·  `DEL` remove  ·  `-` `=` zoom  ·  `0` fit  ·
   * `ESCAPE` back.
   */
  handleKey(e: KeyboardEvent): void {
    // An open dropdown is MODAL: the arrows walk it, Enter takes a row and
    // Escape puts it away, and nothing else on the page acts until it is closed.
    if (this.menu) {
      switch (e.code) {
        case 'Escape':
          e.preventDefault();
          this.closeMenu();
          return;
        case 'ArrowUp':
          e.preventDefault();
          this.moveMenu(-1);
          return;
        case 'ArrowDown':
          e.preventDefault();
          this.moveMenu(1);
          return;
        case 'Enter': case 'NumpadEnter':
          e.preventDefault();
          this.commitMenu();
          return;
        default:
          e.preventDefault();
          return;
      }
    }
    const takes = this.handlers.takes();
    const selected = this.handlers.selected();
    switch (e.code) {
      case 'Escape':
        e.preventDefault();
        this.handlers.close();
        return;
      case 'ArrowLeft':
        e.preventDefault();
        this.pickTake(selected - 1);
        return;
      case 'ArrowRight':
        e.preventDefault();
        this.pickTake(selected + 1);
        return;
      case 'Tab':
        e.preventDefault();
        this.pickHandle(e.shiftKey ? -1 : 1);
        return;
      case 'BracketLeft':
        e.preventDefault();
        this.pickHandle(-1);
        return;
      case 'BracketRight':
        e.preventDefault();
        this.pickHandle(1);
        return;
      case 'KeyR':
        e.preventDefault();
        this.handlers.capture();
        return;
      case 'Enter': case 'NumpadEnter':
        e.preventDefault();
        if (takes.length > 0) this.handlers.give(selected);
        return;
      case 'KeyA':
        e.preventDefault();
        if (takes.length > 0) this.handlers.audition(selected);
        return;
      case 'Delete': case 'Backspace':
        e.preventDefault();
        if (takes.length > 0) this.pressRemove();
        return;
      case 'Minus': case 'NumpadSubtract':
        e.preventDefault();
        this.setZoom(zoomStep(this.zoom, -1));
        return;
      case 'Equal': case 'NumpadAdd':
        e.preventDefault();
        this.setZoom(zoomStep(this.zoom, 1));
        return;
      case 'Digit0':
        e.preventDefault();
        this.setZoom(1);
        return;
      default:
    }
  }

  // --- the dropdowns --------------------------------------------------------

  /** Open one control's list, on the row it is currently showing. */
  private openMenuFor(id: MenuId, anchor: Rect, rows: string[], selectedRow: number): void {
    this.menu = { id, anchor, rows, state: openDropdown(selectedRow, rows.length) };
    this.render();
  }

  private closeMenu(): void {
    if (!this.menu) return;
    this.menu = null;
    this.render();
  }

  /** Walk the open list, wrapping. */
  private moveMenu(step: number): void {
    const menu = this.menu;
    if (!menu) return;
    menu.state = moveDropdownRow(menu.state, menu.rows.length, step);
    this.paintMenu();
  }

  /**
   * Press the highlighted row.
   *
   * The three lists are handed their choice through the SAME handlers the rest of
   * the page uses — a channel by index, a device by index, a loudness target by
   * value — so a menu pick and a `record select` in a script land in one place.
   */
  private commitMenu(): void {
    const menu = this.menu;
    if (!menu) return;
    const row = menu.state.row;
    const label = row >= 0 ? menu.rows[row] : null;
    this.menu = null;
    if (label === null) { this.render(); return; }
    if (menu.id === 'device') this.handlers.selectDevice(row);
    else if (menu.id === 'channel') this.handlers.selectChannel(row);
    else this.handlers.setLoudness(loudnessRows()[row]?.value ?? null);
    this.render();
  }

  /**
   * The open list: its catcher, its rows' hit targets and its texts.
   *
   * Rebuilt on every `render` (the zones and texts are), while the highlight is
   * repainted on its own by `paintMenu` so hovering a row does not rebuild the
   * page. The catcher is what makes the list modal: it sits above every control
   * and closes the menu on any click that is not on a row.
   */
  private menuLayer(): void {
    const menu = this.menu;
    if (!menu) return;
    const c = activeColors();
    const list = dropdownRect(menu.anchor, menu.rows.length, MENU_ROW_H, PAGE_BOTTOM, CANVAS_W);
    const catcher = this.scene.add.zone(0, PAGE_TOP, CANVAS_W, PAGE_BOTTOM - PAGE_TOP).setOrigin(0, 0).setInteractive();
    catcher.setDepth(DEPTH_CATCH);
    catcher.on('pointerdown', () => this.closeMenu());
    this.zones.push(catcher);
    menu.rows.forEach((label, row) => {
      const r = dropdownRowRect(list, row, MENU_ROW_H);
      this.pushText(r.x + 4, r.y + 2, truncate(label, r.width - 8, 8), c.textPrimary, 8);
      const zone = this.scene.add.zone(r.x, r.y, r.width, r.height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      zone.setDepth(DEPTH_MENU_ROW);
      zone.on('pointerover', () => {
        if (this.menu && this.menu.state.row !== row) { this.menu.state.row = row; this.paintMenu(); }
      });
      // The row under the pointer wins, not whatever was highlighted: a mouse
      // fires `pointerover` before it presses, but a TOUCH does not — and a
      // finger that lands on the third row must take the third row.
      zone.on('pointerdown', () => {
        if (this.menu) this.menu.state.row = row;
        this.commitMenu();
      });
      this.zones.push(zone);
    });
    this.paintMenu();
  }

  /** The list's panel and its highlighted row — redrawn without a full render. */
  private paintMenu(): void {
    const g = this.menuGfx;
    g.clear();
    const menu = this.menu;
    if (!menu) return;
    const c = activeColors();
    const list = dropdownRect(menu.anchor, menu.rows.length, MENU_ROW_H, PAGE_BOTTOM, CANVAS_W);
    drawPanel(g, list, 1, c);
    if (menu.state.row < 0) return;
    const r = dropdownRowRect(list, menu.state.row, MENU_ROW_H);
    g.fillStyle(c.ward, 0.22);
    g.fillRect(r.x, r.y, r.width, r.height);
    g.fillStyle(c.ward, 0.9);
    g.fillRect(r.x, r.y, 1, r.height);
  }

  private pickTake(index: number): void {
    this.handlers.select(index);
    this.removeArmed = false;
    this.render();
  }

  private pickHandle(step: number): void {
    this.selectedHandle = cycleHandle(this.selectedHandle, step);
    this.status = `HANDLE  ${this.selectedHandle.toUpperCase()}`;
    this.render();
  }

  private setZoom(zoom: number): void {
    this.zoom = clampZoom(zoom);
    this.status = this.zoom === 1 ? 'FIT' : `ZOOM  ${this.zoom}x`;
    this.render();
  }

  /** The two-press removal: the first press arms, the second takes it out. */
  private pressRemove(): void {
    if (!this.removeArmed) {
      this.removeArmed = true;
      this.status = 'PRESS DEL AGAIN TO REMOVE';
      this.render();
      return;
    }
    this.removeArmed = false;
    this.handlers.remove(this.handlers.selected());
  }

  // --- pointer drag ---------------------------------------------------------

  /** The visible window of a take: the whole recording at FIT, a slice when zoomed. */
  private plotWindow(take: Take) {
    return windowAt(take.seconds, this.zoom, take.seconds / 2 + this.zoomCenter);
  }

  private beginDrag(x: number): void {
    const take = this.handlers.takes()[this.handlers.selected()];
    if (!take) return;
    const time = windowXToTime(x, PLOT, this.plotWindow(take));
    this.dragging = nearestHandle(take, time);
    this.selectedHandle = this.dragging;
    this.dragTo(x);
    this.scene.input.on('pointermove', this.onPointerMoveCb);
    this.scene.input.on('pointerup', this.onPointerUpCb);
  }

  private dragTo(x: number): void {
    if (!this.dragging) return;
    const index = this.handlers.selected();
    const take = this.handlers.takes()[index];
    if (!take) return;
    const time = windowXToTime(x, PLOT, this.plotWindow(take));
    this.handlers.setTake(index, dragHandle(take, this.dragging, time));
    this.render();
  }

  // --- paint ----------------------------------------------------------------

  render(): void {
    const c = activeColors();
    this.frame.clear();
    this.clearDynamic();

    drawPanel(this.frame, STATUS, 1, c);
    drawPanel(this.frame, INPUT, 1, c);
    drawPanel(this.frame, TAKES, 1, c);
    drawPanel(this.frame, WAVE_PANEL, 1, c);
    drawPanel(this.frame, RIGHT, 1, c);
    drawPanel(this.frame, EXPORT, 1, c);
    drawPanel(this.frame, FOOT, 1, c);

    const takes = this.handlers.takes();
    const selected = this.handlers.selected();
    if (selected !== this.lastSelected) {
      this.lastSelected = selected;
      this.removeArmed = false;
    }
    const take = takes[selected] ?? null;
    const recording = this.handlers.recording();
    const metering = this.handlers.metering();

    // --- status line ---
    const count = takes.length === 1 ? '1 TAKE' : `${takes.length} TAKES`;
    const state = recording ? '● RECORDING' : metering ? 'LISTENING' : 'READY';
    this.statusText.setText(this.status === '' ? `RECORDER  ·  ${count}  ·  ${state}` : `RECORDER  ·  ${this.status}`);
    this.statusText.setColor(css(recording ? c.danger : c.textPrimary));

    this.input();
    this.takeLibrary(takes, selected);
    this.waveform(take);
    this.thisTake(take);
    this.useInSong(take);
    this.addBar();
    this.exportPanel();
    this.pushText(FOOT.x + 6, FOOT.y + 8, RECORDER_HINT, c.textDim, 8);
    this.paintMeter();
    // Last, so an open list draws over the page it belongs to.
    this.menuLayer();
  }

  /**
   * The input meter's bar, readout and CLIP lamp — repainted on its own.
   *
   * A live meter is the one thing on the page that changes between frames, so it
   * lives on a layer of its own (`meterGfx`) and two persistent labels, and the
   * scene nudges it with `setLevel` rather than redrawing the whole screen.
   */
  private paintMeter(): void {
    const c = activeColors();
    const g = this.meterGfx;
    g.clear();
    drawInset(g, METER, 1, c);
    const metering = this.handlers.metering();
    const live = metering && this.handlers.micError() === null;
    const cells = 30;
    const lit = live ? meterCells(this.liveLevel.peak, cells) : 0;
    const cellW = METER.width / cells;
    for (let i = 0; i < cells; i++) {
      if (i >= lit) continue;
      const on = i / cells;
      const color = on > 0.92 ? c.danger : on > 0.72 ? c.ward : c.ooze;
      g.fillStyle(color, 0.95);
      g.fillRect(METER.x + 1 + Math.round(i * cellW), METER.y + 1, Math.max(1, Math.round(cellW) - 1), METER.height - 2);
    }
    const clip = live && (peakClips(this.liveLevel.peak) || peakClips(this.liveLevel.rms * 1.4));
    g.fillStyle(clip ? c.danger : c.stone, 1);
    g.fillRect(CLIP_BOX.x, CLIP_BOX.y, CLIP_BOX.width, CLIP_BOX.height);
    this.dbfsText.setText(live ? formatDbfs(this.liveLevel.peak) : '--');
    this.dbfsText.setColor(css(c.textPrimary));
    this.clipText.setColor(css(clip ? c.danger : c.textDim));
  }

  // --- INPUT ----------------------------------------------------------------

  private input(): void {
    const c = activeColors();
    this.pushText(INPUT.x + 6, INPUT.y + 14, 'INPUT', c.textDim, 8);

    // The device: an inset row with its name and a drop glyph. Clicking it walks
    // to the next input, and (because choosing an input is an explicit gesture)
    // re-arms the meter on it.
    const devices = this.handlers.devices();
    const index = Math.max(0, Math.min(this.handlers.deviceIndex(), Math.max(0, devices.length - 1)));
    const label = devices[index]?.label ?? 'Default input';
    drawInset(this.marks, DEVICE, 1, c);
    this.pushText(DEVICE.x + 5, DEVICE.y + 4, truncate(label.toUpperCase(), DEVICE.width - 22, 8), c.textPrimary, 8);
    this.pushText(DEVICE.x + DEVICE.width - 12, DEVICE.y + 4, '▾', c.textDim, 8);
    // A real list, not a cycle: a machine with three microphones should show
    // three, and one with none should say so rather than stepping to a ghost.
    const deviceRows = devices.length > 0 ? devices.map((device) => device.label) : ['NO MICROPHONE FOUND'];
    this.hit('device', DEVICE, () => this.openMenuFor('device', DEVICE, deviceRows, index));

    // The meter is the explicit "listen" control: clicking it opens/closes the
    // mic. Its bar, readout and CLIP lamp are painted on their own layer by
    // `paintMeter`, so a live level never forces a whole-page redraw.
    const metering = this.handlers.metering();
    const refusal = this.handlers.refusal();
    const error = this.handlers.micError();
    for (let i = 0; i < METER_TICKS.length; i++) {
      const t = METER_TICKS[i];
      const at = METER.x + (i / (METER_TICKS.length - 1)) * METER.width;
      this.pushText(Math.round(at) - 6, METER_TICK_Y, String(t), c.textDim, 8);
    }
    this.hit('meter', METER, () => { this.handlers.toggleMeter(); });

    // RECORD: a red-outlined switch that also arms the meter on the way in.
    const recording = this.handlers.recording();
    const canCapture = refusal === null;
    this.stateGfx.fillStyle(c.ink, 1);
    this.stateGfx.fillRect(RECORD_BTN.x, RECORD_BTN.y, RECORD_BTN.width, RECORD_BTN.height);
    this.stateGfx.lineStyle(1, canCapture ? c.danger : c.stone, 1);
    this.stateGfx.strokeRect(RECORD_BTN.x + 0.5, RECORD_BTN.y + 0.5, RECORD_BTN.width - 1, RECORD_BTN.height - 1);
    this.pushCentered(RECORD_BTN, recording ? '■ STOP' : '● RECORD', canCapture ? c.danger : c.textDim, 8);
    this.hit('record', RECORD_BTN, () => { if (canCapture) this.handlers.capture(); });

    // The next take's name, so `RECORD` says what it will make.
    this.pushText(NEW_TAKE_X, INPUT.y + 6, 'NEW TAKE', c.textDim, 8);
    this.pushText(NEW_TAKE_X, INPUT.y + 16, truncate(this.handlers.nextTakeName().toUpperCase(), 58, 8), c.textPrimary, 8);

    // The note under the input: a refusal, an error, or what to do next.
    const note = error ?? refusal ?? (metering
      ? 'LISTENING  ·  CLICK THE METER TO STOP'
      : 'MIC OFF  ·  CLICK THE METER OR RECORD TO LISTEN');
    const tone: InputTone = error || refusal ? 'error' : metering ? 'ok' : 'warn';
    const color = tone === 'error' ? c.danger : tone === 'ok' ? c.ooze : c.textDim;
    this.pushText(DEVICE.x, INPUT.y + 26, truncate(note.toUpperCase(), 330, 8), color, 8);
  }

  // --- TAKES ----------------------------------------------------------------

  private takeLibrary(takes: Take[], selected: number): void {
    const c = activeColors();
    this.pushText(TAKES.x + 6, TAKES.y + 4, `TAKES  ·  ${takes.length}`, c.textDim, 8);

    const visible = Math.max(1, Math.floor((IMPORT_BTN.y - CARDS_Y) / (CARD_H + CARD_GAP)));
    // Keep the selection in view without a scrollbar: slide the window until it is.
    if (selected < this.listStart) this.listStart = selected;
    if (selected >= this.listStart + visible) this.listStart = selected - visible + 1;
    this.listStart = Math.max(0, Math.min(this.listStart, Math.max(0, takes.length - visible)));

    if (takes.length === 0) {
      this.pushText(TAKES.x + 6, CARDS_Y + 14, 'NO TAKES YET', c.textDim, 8);
      this.pushText(TAKES.x + 6, CARDS_Y + 26, 'PRESS RECORD OR', c.textDim, 8);
      this.pushText(TAKES.x + 6, CARDS_Y + 36, 'IMPORT A FILE', c.textDim, 8);
    }

    for (let row = 0; row < visible; row++) {
      const index = this.listStart + row;
      const take = takes[index];
      if (!take) break;
      const r: Rect = { x: TAKES.x + 6, y: CARDS_Y + row * (CARD_H + CARD_GAP), width: TAKES.width - 12, height: CARD_H };
      const on = index === selected;
      if (on) drawPanel(this.marks, r, 1, c);
      else drawInset(this.marks, r, 1, c);
      const accent = take.origin === 'imported' ? c.ward : c.ooze;
      this.pushText(r.x + 4, r.y + 3, truncate(take.name.toUpperCase(), r.width - 8, 8), on ? accent : c.textPrimary, 8);
      this.pushText(r.x + 4, r.y + 12, `${formatSeconds(takeWindow(take).seconds)}s  ·  ${takeOriginLabel(take)}`, c.textDim, 8);
      this.miniWave(take, { x: r.x + 4, y: r.y + 20, width: r.width - 8, height: 9 }, accent);
      this.hit(`take:${index}`, r, () => this.pickTake(index));
    }

    // The dashed import button, whose whole job is the file picker behind it.
    this.dashed(IMPORT_BTN, c.stone);
    this.pushCentered(IMPORT_BTN, '+ IMPORT AUDIO', c.textPrimary, 8);
    this.hit('import', IMPORT_BTN, () => { this.handlers.importAudio(); });
  }

  /** A faint waveform preview inside a card. */
  private miniWave(take: Take, r: { x: number; y: number; width: number; height: number }, color: number): void {
    const columns = waveformColumns(r.width);
    const bars = this.handlers.waveform(take, columns);
    if (bars.length === 0) return;
    const mid = r.y + r.height / 2;
    const half = Math.max(1, r.height / 2);
    const step = r.width / bars.length;
    const g = this.stateGfx;
    g.fillStyle(color, 0.85);
    for (let i = 0; i < bars.length; i++) {
      const h = Math.max(1, Math.round(bars[i] * half));
      g.fillRect(r.x + Math.round(i * step), Math.round(mid - h), Math.max(1, Math.round(step)), h * 2);
    }
  }

  // --- WAVEFORM -------------------------------------------------------------

  private waveform(take: Take | null): void {
    const c = activeColors();
    if (!take) {
      this.pushText(WAVE_PANEL.x + 8, WAVE_PANEL.y + 6, 'WAVEFORM', c.textDim, 8);
      this.pushCentered({ x: PLOT.x, y: PLOT.y + PLOT.height / 2 - 5, width: PLOT.width, height: 10 }, 'NO TAKE YET  ·  RECORD OR IMPORT', c.textDim, 8);
      drawInset(this.marks, PLOT, 1, c);
      return;
    }

    const rate = this.handlers.rate(take);
    const khz = rate >= 1000 ? `${(rate / 1000).toFixed(rate % 1000 === 0 ? 0 : 1)} kHz` : `${Math.round(rate)} Hz`;
    this.pushText(WAVE_PANEL.x + 7, WAVE_PANEL.y + 5, truncate(take.name.toUpperCase(), 120, 8), c.textPrimary, 8);
    this.pushText(WAVE_PANEL.x + 7 + Math.round(truncate(take.name.toUpperCase(), 120, 8).length * uiPx(8) * 0.6) + 10, WAVE_PANEL.y + 6,
      `MONO  ·  ${khz}  ·  ${formatSeconds(take.seconds)} s`, c.textDim, 8);

    // zoom controls
    this.smallBtn(ZOOM_MINUS, '−', () => this.setZoom(zoomStep(this.zoom, -1)));
    this.smallBtn(ZOOM_PLUS, '+', () => this.setZoom(zoomStep(this.zoom, 1)));
    this.smallBtn(ZOOM_FIT, 'FIT', () => this.setZoom(1));

    drawInset(this.marks, PLOT, 1, c);
    const win = this.plotWindow(take);
    const span = win.span > 0 ? win.span : take.seconds;

    // y-axis labels
    const labels = ['1.0', '0.5', '0.0', '-0.5', '-1.0'];
    for (let i = 0; i < labels.length; i++) {
      const y = PLOT.y + Math.round((i / (labels.length - 1)) * PLOT.height) - 3;
      this.pushText(WAVE_PANEL.x + 5, y, labels[i], c.textDim, 8);
    }
    const mid = PLOT.y + PLOT.height / 2;

    // waveform columns over the visible window
    const columns = Math.min(512, Math.max(1, waveformColumns(PLOT.width) * this.zoom));
    const all = this.handlers.waveform(take, columns);
    const from = span > 0 ? Math.floor((win.start / take.seconds) * all.length) : 0;
    const to = span > 0 ? Math.ceil(((win.start + span) / take.seconds) * all.length) : all.length;
    const slice = all.slice(Math.max(0, from), Math.max(from + 1, to));
    const accent = take.origin === 'imported' ? c.ward : c.ooze;
    const half = PLOT.height / 2 - 1;
    const step = PLOT.width / Math.max(1, slice.length);
    const g = this.stateGfx;
    g.fillStyle(accent, 0.85);
    for (let i = 0; i < slice.length; i++) {
      const h = Math.max(1, Math.round(slice[i] * half));
      g.fillRect(PLOT.x + Math.round(i * step), Math.round(mid - h), Math.max(1, Math.round(step)), h * 2);
    }

    // the loop band and the dimmed outside-window regions
    const window = takeWindow(take);
    const loop = takeLoop(take);
    if (loop) {
      const a = windowTimeToX(loop.start, win, PLOT);
      const b = windowTimeToX(loop.end, win, PLOT);
      g.fillStyle(c.ward, 0.16);
      g.fillRect(Math.min(a, b), PLOT.y, Math.abs(b - a), PLOT.height);
    }
    g.fillStyle(c.ink, 0.5);
    const winStartX = windowTimeToX(window.start, win, PLOT);
    const winEndX = windowTimeToX(window.end, win, PLOT);
    g.fillRect(PLOT.x, PLOT.y, Math.max(0, winStartX - PLOT.x), PLOT.height);
    g.fillRect(winEndX, PLOT.y, Math.max(0, PLOT.x + PLOT.width - winEndX), PLOT.height);

    // the four handles, drawn at their own times
    for (const handle of TAKE_HANDLES) {
      const time = takeHandleTime(take, handle);
      const x = windowTimeToX(time, win, PLOT);
      const on = handle === this.selectedHandle;
      const color = handleIsLoop(handle) ? c.ward : c.ooze;
      g.fillStyle(color, on ? 1 : 0.75);
      g.fillRect(x, PLOT.y, on ? 2 : 1, PLOT.height);
      g.fillRect(x - 1, PLOT.y, 3, 3);
      g.fillRect(x - 1, PLOT.y + PLOT.height - 3, 3, 3);
    }

    // The grab zone: a pointer-down starts a drag on the nearest handle.
    const zone = this.scene.add.zone(PLOT.x, PLOT.y, PLOT.width, PLOT.height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.setDepth(DEPTH_TEXT - 1);
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.beginDrag(pointer.x));
    this.zones.push(zone);

    // The ruler: the start, middle and end of the visible window.
    this.pushText(PLOT.x, RULER_Y, formatSeconds(win.start), c.textDim, 8);
    this.pushText(Math.round(PLOT.x + PLOT.width / 2) - 8, RULER_Y, formatSeconds(win.start + span / 2), c.textDim, 8);
    this.pushText(PLOT.x + PLOT.width - 20, RULER_Y, formatSeconds(win.start + span), c.textDim, 8);

    // The readout: trim on the left, loop after a divider.
    const trimText = `TRIM ${formatSeconds(window.start)} → ${formatSeconds(window.end)} s  ·  USED ${formatSeconds(window.seconds)} s`;
    this.pushText(PLOT.x, WAVE_READOUT_Y, trimText, c.textPrimary, 8);
    const loopText = loop
      ? `LOOP ${formatSeconds(loop.start)} → ${formatSeconds(loop.end)} s  ·  ${formatSeconds(loop.seconds)} s`
      : 'LOOP OFF';
    const dividerX = PLOT.x + Math.round(trimText.length * uiPx(8) * 0.6) + 10;
    this.pushText(Math.min(dividerX, PLOT.x + 176), WAVE_READOUT_Y, '|', c.textDim, 8);
    this.pushText(Math.min(dividerX, PLOT.x + 176) + 7, WAVE_READOUT_Y, loopText, loop ? c.ward : c.textDim, 8);

    // The action row: hear, loop audition, reset, and the drag hint.
    this.pushCentered(HEAR_BTN, '▶ HEAR TAKE', c.ooze, 8);
    this.hit('hear', HEAR_BTN, () => this.handlers.audition(this.handlers.selected()));
    const loopOn = this.handlers.loopAudition();
    this.pushCentered(LOOP_BTN, loopOn ? '⟲ LOOP ON' : '⟲ LOOP OFF', loopOn ? c.ward : c.textDim, 8);
    this.hit('loop-audition', LOOP_BTN, () => this.handlers.toggleLoopAudition());
    this.pushCentered(RESET_BTN, 'RESET TRIM', c.textPrimary, 8);
    this.hit('reset-trim', RESET_BTN, () => this.handlers.setTake(this.handlers.selected(), resetTakeWindow(take)));
    this.pushText(RESET_BTN.x + RESET_BTN.width + 6, WAVE_BTN_Y + 5, 'DRAG GREEN HANDLES TO TRIM  ·  PURPLE SET THE LOOP', c.textDim, 8);
  }

  private smallBtn(r: Rect, label: string, onPress: () => void): void {
    drawPanel(this.marks, r, 1, activeColors());
    this.pushCentered(r, label, activeColors().textPrimary, 8);
    this.hit(`zoom:${label}`, r, onPress);
  }

  // --- THIS TAKE ------------------------------------------------------------

  private thisTake(take: Take | null): void {
    const c = activeColors();
    this.pushText(RIGHT.x + 6, RIGHT.y + 4, 'THIS TAKE', c.ooze, 8);

    if (!take) {
      this.pushText(RIGHT.x + 6, RIGHT.y + 24, 'NO TAKE SELECTED', c.textDim, 8);
      this.pushText(RIGHT.x + 6, RIGHT.y + 36, 'RECORD OR IMPORT ONE', c.textDim, 8);
      return;
    }

    // NAME — an inset that opens the DOM rename box.
    this.pushText(RIGHT.x + 6, NAME_FIELD.y + 4, 'NAME', c.textDim, 8);
    drawInset(this.marks, NAME_FIELD, 1, c);
    this.pushText(NAME_FIELD.x + 4, NAME_FIELD.y + 3, truncate(take.name.toUpperCase(), NAME_FIELD.width - 8, 8), c.textPrimary, 8);
    this.nameBoxRect = NAME_FIELD;
    this.hit('name', NAME_FIELD, () => {
      this.renameIndex = this.handlers.selected();
      this.render();
      this.nameBox.start(this.handlers.takes()[this.handlers.selected()]?.name ?? '');
    });

    // The four time fields, each label + `<` value `>`.
    this.timeField('TRIM IN', 'trimStart', take, FIELD_COL0, TRIM_LABEL_Y, TRIM_CTL_Y);
    this.timeField('TRIM OUT', 'trimEnd', take, FIELD_COL1, TRIM_LABEL_Y, TRIM_CTL_Y);
    this.timeField('LOOP IN', 'loopStart', take, FIELD_COL0, LOOP_LABEL_Y, LOOP_CTL_Y);
    this.timeField('LOOP OUT', 'loopEnd', take, FIELD_COL1, LOOP_LABEL_Y, LOOP_CTL_Y);

    // CLEAR LOOP.
    const loop = takeLoop(take);
    this.pushCentered(CLEAR_LOOP, 'CLEAR LOOP', loop ? c.textPrimary : c.textDim, 8);
    this.hit('clear-loop', CLEAR_LOOP, () => {
      if (loop) this.handlers.setTake(this.handlers.selected(), clearTakeLoop(take));
    });
  }

  private timeField(label: string, handle: TakeHandle, take: Take, x: number, labelY: number, ctlY: number): void {
    const c = activeColors();
    this.pushText(x, labelY, label, c.textDim, 8);
    const minus: Rect = { x, y: ctlY, width: STEP_W, height: FIELD_H };
    const value: Rect = { x: x + STEP_W + 2, y: ctlY, width: FIELD_W - STEP_W * 2 - 4, height: FIELD_H };
    const plus: Rect = { x: x + FIELD_W - STEP_W, y: ctlY, width: STEP_W, height: FIELD_H };
    this.stepBtn(`minus:${handle}`, minus, '‹', () => this.nudgeHandle(handle, -HANDLE_STEP_SECONDS));
    this.stepBtn(`plus:${handle}`, plus, '›', () => this.nudgeHandle(handle, HANDLE_STEP_SECONDS));
    drawInset(this.marks, value, 1, c);
    this.pushCentered(value, `${formatSeconds(takeHandleTime(take, handle))} s`, handle === this.selectedHandle ? c.ooze : c.textPrimary, 8);
    this.hit(`field:${handle}`, value, () => { this.selectedHandle = handle; this.render(); });
  }

  private nudgeHandle(handle: TakeHandle, delta: number): void {
    this.selectedHandle = handle;
    const index = this.handlers.selected();
    const take = this.handlers.takes()[index];
    if (!take) return;
    this.handlers.setTake(index, stepTakeHandle(take, handle, delta));
    this.render();
  }

  private stepBtn(id: string, r: Rect, glyph: string, onPress: () => void): void {
    drawPanel(this.marks, r, 1, activeColors());
    this.pushCentered(r, glyph, activeColors().textPrimary, 8);
    this.hit(id, r, onPress);
  }

  // --- USE IN SONG ----------------------------------------------------------

  private useInSong(take: Take | null): void {
    const c = activeColors();
    this.pushText(RIGHT.x + 6, USE_HEAD_Y, 'USE IN SONG', c.ooze, 8);

    // REMOVE TAKE lives on the header row, in the destructive colour, behind the
    // two-press arm. Its label says what a second press will do.
    const removeLabel = this.removeArmed ? 'SURE?' : 'REMOVE TAKE';
    const removeRect: Rect = { x: RIGHT.x + RIGHT.width - 76, y: USE_HEAD_Y - 3, width: 70, height: 14 };
    this.pushText(removeRect.x + removeRect.width, USE_HEAD_Y, removeLabel, this.removeArmed ? c.danger : c.textDim, 8, 1);
    this.hit('remove', removeRect, () => { if (take) this.pressRemove(); });

    const song = this.handlers.song();
    const index = Math.max(0, Math.min(this.handlers.selectedChannel(), Math.max(0, song.tracks.length - 1)));
    const track = song.tracks[index];
    const label = track ? `TRACK ${index + 1}  ·  ${truncate(track.name.toUpperCase(), 70, 8)}` : 'NO CHANNEL';
    drawInset(this.marks, CHANNEL_SEL, 1, c);
    this.pushText(CHANNEL_SEL.x + 5, CHANNEL_SEL.y + 5, label, c.textPrimary, 8);
    this.pushText(CHANNEL_SEL.x + CHANNEL_SEL.width - 12, CHANNEL_SEL.y + 5, '▾', c.textDim, 8);
    // Every channel the song has, by the name it carries on the tracker.
    const channelRows = song.tracks.map((one, at) => `TRACK ${at + 1}  ·  ${one.name.toUpperCase()}`);
    this.hit('channel', CHANNEL_SEL, () => this.openMenuFor('channel', CHANNEL_SEL, channelRows, index));

    this.pushCentered(GIVE_BTN, '▶ GIVE TO CHANNEL', take ? c.ooze : c.textDim, 8);
    this.hit('give', GIVE_BTN, () => { if (take) this.handlers.give(this.handlers.selected()); });
  }

  // --- the add-channel bar --------------------------------------------------

  private addBar(): void {
    const c = activeColors();
    const r: Rect = { x: ADDBAR.x + (ADDBAR.width - 150) / 2, y: ADDBAR.y + 1, width: 150, height: 14 };
    this.dashed(r, c.stone);
    this.pushCentered(r, '+ ADD CHANNEL', c.textPrimary, 8);
    this.hit('add-channel', r, () => { this.handlers.addChannel(); });
  }

  // --- EXPORT SONG ----------------------------------------------------------

  private exportPanel(): void {
    const c = activeColors();
    const song = this.handlers.song();
    const bars = Math.max(1, song.order.length);
    const range = this.handlers.bounce();
    const fitted = range ? fitBounce(range, bars) : null;

    this.pushText(EXPORT.x + 6, EXPORT.y + 4, 'EXPORT SONG', c.ooze, 8);
    const ready = fitted ? `READY TO EXPORT  ·  BARS ${pad(fitted.from)}-${pad(fitted.to)}` : 'READY TO EXPORT  ·  WHOLE SONG';
    this.pushText(EXPORT.x + EXPORT.width - 6, EXPORT.y + 5, ready, c.textDim, 8, 1);

    // WHOLE SONG / BAR RANGE
    const whole = fitted === null;
    this.toggle(WHOLE_BTN, 'WHOLE SONG', whole, () => this.handlers.setWholeSong());
    this.toggle(RANGE_BTN, 'BAR RANGE', !whole, () => this.handlers.setBarRange());

    // START / END bar steppers.
    this.barField('START', 'from', fitted?.from ?? 1, START_LABEL_X);
    this.barField('END', 'to', fitted?.to ?? bars, END_LABEL_X);
    // The bar count only reads out for a RANGE: with the whole song there is no
    // number to name, and a "THE WHOLE SONG" here would run into the EXPORT WAV
    // button at this width.
    if (fitted) {
      const count = bounceBars(fitted, bars);
      this.pushText(BARS_TEXT_X, WHOLE_BTN.y + 4, `${count} ${count === 1 ? 'BAR' : 'BARS'}`, c.textPrimary, 8);
    }

    // LOUDNESS TARGET
    this.pushText(LOUD_LABEL_X, LOUD_DROP.y + 4, 'LOUDNESS TARGET', c.textDim, 8);
    const loud = this.handlers.loudness();
    drawInset(this.marks, LOUD_DROP, 1, c);
    this.pushText(LOUD_DROP.x + 5, LOUD_DROP.y + 5, loudLabel(loud), c.textPrimary, 8);
    this.pushText(LOUD_DROP.x + LOUD_DROP.width - 12, LOUD_DROP.y + 5, '▾', c.textDim, 8);
    // The four published stops and OFF, from the model's own ladder.
    const loudRows = loudnessRows();
    this.hit('loudness', LOUD_DROP, () => this.openMenuFor('loudness', LOUD_DROP, loudRows.map((row) => row.label), loudnessRowIndex(loud)));
    this.pushText(LOUD_DROP.x + LOUD_DROP.width + 8, LOUD_DROP.y + 5, 'APPLIES TO AUDIO EXPORTS', c.textDim, 8);

    // The three writers.
    RECORDER_EXPORTS.forEach((writer, i) => {
      const r = EXPORT_BUTTONS[i];
      if (!r) return;
      this.pushCentered(r, writer.label, c.ooze, 8);
      this.pushCentered({ x: r.x, y: r.y + r.height, width: r.width, height: 10 }, writer.blurb, c.textDim, 8);
      this.hit(`export:${writer.id}`, r, () => this.handlers.export(writer.id));
    });
  }

  private toggle(r: Rect, label: string, on: boolean, onPress: () => void): void {
    const c = activeColors();
    if (on) drawPanel(this.marks, r, 1, c);
    else drawInset(this.marks, r, 1, c);
    this.pushCentered(r, label, on ? c.ooze : c.textPrimary, 8);
    this.hit(`toggle:${label}`, r, onPress);
  }

  private barField(label: string, end: 'from' | 'to', value: number, labelX: number): void {
    const c = activeColors();
    this.pushText(labelX, WHOLE_BTN.y + 4, label, c.textDim, 8);
    const minus: Rect = { x: labelX + 42, y: WHOLE_BTN.y, width: 14, height: 16 };
    const box: Rect = { x: labelX + 57, y: WHOLE_BTN.y, width: 26, height: 16 };
    const plus: Rect = { x: labelX + 84, y: WHOLE_BTN.y, width: 14, height: 16 };
    this.stepBtn(`bar-minus:${end}`, minus, '‹', () => this.handlers.nudgeBar(end, -1));
    this.stepBtn(`bar-plus:${end}`, plus, '›', () => this.handlers.nudgeBar(end, 1));
    drawInset(this.marks, box, 1, c);
    this.pushCentered(box, pad(value), c.textPrimary, 8);
  }

  // --- small helpers --------------------------------------------------------

  private hit(id: string, r: Rect, onPress: () => void): void {
    if (this.hover === id) this.hoverRect = r;
    const zone = this.scene.add.zone(r.x, r.y, r.width, r.height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.setDepth(DEPTH_TEXT - 1);
    zone.on('pointerdown', () => onPress());
    zone.on('pointerover', () => { if (this.hover !== id) { this.hover = id; this.hoverRect = r; this.paintHover(); } });
    zone.on('pointerout', () => { if (this.hover === id) { this.hover = null; this.hoverRect = null; this.paintHover(); } });
    this.zones.push(zone);
  }

  private clearDynamic(): void {
    this.marks.clear();
    this.stateGfx.clear();
    this.hoverGfx.clear();
    this.menuGfx.clear();
    for (const text of this.texts) text.destroy();
    for (const zone of this.zones) zone.destroy();
    this.texts = [];
    this.zones = [];
    this.hover = null;
    this.hoverRect = null;
  }

  private paintHover(): void {
    const g = this.hoverGfx;
    g.clear();
    const r = this.hoverRect;
    if (!r) return;
    g.lineStyle(1, activeColors().ward, 0.9);
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
  }

  /** A dashed outline — the "drop something here" affordance on the two add-ons. */
  private dashed(r: Rect, color: number): void {
    const g = this.marks;
    g.fillStyle(color, 0.9);
    const dash = 4;
    for (let x = r.x; x < r.x + r.width; x += dash * 2) {
      g.fillRect(x, r.y, Math.min(dash, r.x + r.width - x), 1);
      g.fillRect(x, r.y + r.height - 1, Math.min(dash, r.x + r.width - x), 1);
    }
    for (let y = r.y; y < r.y + r.height; y += dash * 2) {
      g.fillRect(r.x, y, 1, Math.min(dash, r.y + r.height - y));
      g.fillRect(r.x + r.width - 1, y, 1, Math.min(dash, r.y + r.height - y));
    }
  }

  private pushText(x: number, y: number, text: string, color: number, size = 8, originX = 0): void {
    const obj = uiText(this.scene, x, y, text, { size, color, origin: { x: originX, y: 0 } });
    this.layer.add(obj);
    this.texts.push(obj);
  }

  private pushCentered(r: Rect, text: string, color: number, size = 8): void {
    const px = uiPx(size);
    const obj = uiText(this.scene, Math.round(r.x + r.width / 2), Math.round(r.y + (r.height - px) / 2), text, {
      size, color, origin: { x: 0.5, y: 0 },
    });
    this.layer.add(obj);
    this.texts.push(obj);
  }

  destroy(): void {
    this.unsubscribe();
    this.scene.input.off('pointermove', this.onPointerMoveCb);
    this.scene.input.off('pointerup', this.onPointerUpCb);
    this.nameBox.destroy();
    for (const text of this.texts) text.destroy();
    for (const zone of this.zones) zone.destroy();
    this.statusText.destroy();
    this.meterGfx.destroy();
    this.dbfsText.destroy();
    this.clipText.destroy();
    this.menuGfx.destroy();
    this.back.destroy();
    this.frame.destroy();
    this.marks.destroy();
    this.stateGfx.destroy();
    this.hoverGfx.destroy();
    this.layer.destroy();
    this.curtain.destroy();
  }
}

/** `7` -> `07`, for a bar number that reads like a bar number. */
function pad(value: number): string {
  const n = Math.max(1, Math.round(value));
  return n < 10 ? `0${n}` : String(n);
}

/** A theme colour as CSS, for the status line. */
function css(color: number): string {
  return '#' + ((color >>> 0) & 0xffffff).toString(16).padStart(6, '0');
}

/** A rough character width for the pixel font, so a label can be measured. */
function truncate(text: string, widthPx: number, size: number): string {
  const per = Math.max(1, uiPx(size) * 0.62);
  const max = Math.max(1, Math.floor(widthPx / per));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}
