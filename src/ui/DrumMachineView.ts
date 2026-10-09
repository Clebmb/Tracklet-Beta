import type Phaser from 'phaser';
import {
  activeColors,
  Button,
  drawDivider,
  drawInset,
  drawPanel,
  intToCss,
  onThemeChanged,
  uiPx,
  uiText,
  type Rect,
  type UiColors,
} from 'phaser-ui-canvas';

import { midiToNoteName } from '../model';
import { MIDI_MAX, MIDI_MIN } from '../model/notes';
import {
  clampMachineBar,
  countMachineHits,
  machineBarCount,
  machineBarRows,
  MAX_MACHINE_BARS,
  MAX_PADS,
  MAX_PAD_NAME,
  type DrumMachine,
  type DrumPad,
} from '../model/machine';
import { MAX_PAN, panLabel, levelLabel } from '../model/song';
import { clampParam, type VoiceParamId } from '../model/voice';
import {
  drumGridWindow,
  hitShade,
  nextHitVelocity,
  previousHitVelocity,
  stepAtColumn,
  toggleHitVelocity,
} from './drumGrid';

/**
 * DrumMachineView — the DRUM MACHINE page.
 *
 * A full screen switched to from the tracker's tab dropdown, not a window over
 * it: the header stays up (so the dropdown can switch back) and everything below
 * it is this page, drawn as five framed panels.
 *
 * ── The five panels ──────────────────────────────────────────────────────────
 *   • MACHINE — the machine's own mix and shape, and its own on/off.
 *   • SEQUENCER — the dominant element: a row per pad with its colour chip, its
 *     M and S keys, and a step grid whose hits are beveled keys. The order the
 *     song plays the machine's bars in lives in its footer.
 *   • THIS PAD — the selected pad's instrument, read back as bars.
 *   • PAD PARAMETERS — a tabbed editor for that pad: the waveform and the sample
 *     controls under SAMPLE, four knobs on each other tab, and a compact column
 *     of switches on the right.
 *   • TRANSPORT / PATTERN / SHORTCUTS — the bottom row.
 *
 * ── It is a VIEW, never a second document ────────────────────────────────────
 * There is one machine, and it lives in the song (`song.machine`). This reads it
 * back through a getter on every redraw, so it can never draw a beat the song no
 * longer has, and it reports every edit to the scene rather than touching the
 * model. That is the same bargain every other menu here makes, and it is why a
 * machine edited here, written by a script and read from a file are one thing.
 *
 * ── What has no home in the model ────────────────────────────────────────────
 * A Tracklet pad is a wave, ten voice knobs, a level, a pan, a tune, a sample and
 * a row of hits. There is no per-pad reverse, one-shot, choke group, output
 * routing or sample trim, so where the reference draws those the page draws the
 * real controls that fit the same space (SWEEP, THICK, VOICE, WAVE) rather than
 * shipping dead boxes. The M and S keys are real: they mute and unmute a pad's
 * row through its own fader, which is the machine's honest way to hush one drum.
 */

/** The machine's own mix, as the strip names its bars. */
export type MachineMixId = 'level' | 'pan' | 'swing' | 'verb' | 'echo' | 'duck';

/** The selected pad's mix, as the strip names it. */
export type PadMixId = 'level' | 'pan';

/** The tabs of the PAD PARAMETERS panel, in the order it draws them. */
type ParamTab = 'sample' | 'amp' | 'pitch' | 'filter' | 'envelope' | 'fx';

const PARAM_TABS: readonly { id: ParamTab; label: string }[] = [
  { id: 'sample', label: 'SAMPLE' },
  { id: 'amp', label: 'AMP' },
  { id: 'pitch', label: 'PITCH' },
  { id: 'filter', label: 'FILTER' },
  { id: 'envelope', label: 'ENVELOPE' },
  { id: 'fx', label: 'FX' },
];

/** One row of the PAD PARAMETERS panel: a label, a groove, and a value. */
interface ParamRow {
  label: string;
  value: number;
  min: number;
  max: number;
  signed: boolean;
  display: string;
  set: (value: number) => void;
}

export interface DrumMachineHandlers {
  /** The view opened or closed, so the scene can pause its own input. */
  onOpenChange?: (open: boolean) => void;
  /**
   * The song's machine, read on every redraw — or null when the song has none.
   *
   * A getter rather than a copy, like every other menu here: the view must never
   * draw a beat the song has already changed under it (an undo, a script apply).
   */
  machine: () => DrumMachine | null;
  /** Set one pad's velocity on one step of one BAR, 0..100. Returns the status line. */
  setHit: (pad: number, step: number, velocity: number, bar: number) => string;
  /** Move one of the machine's own mix controls. */
  setMix: (id: MachineMixId, value: number) => string;
  /** Turn the machine on or off, keeping the pads. */
  setEnabled: (on: boolean) => string;
  /** Widen or narrow the grid, in steps. */
  setSteps: (steps: number) => string;
  /** Grow the machine by one pad, seeded with the next sound in the kit's run. */
  addPad: () => string;
  /** Drop the machine's last pad. The first pad never goes. */
  removePad: () => string;
  /** Grow the machine by one BAR — a copy of the last, so a variation starts as the beat. */
  addBar: () => string;
  /** Drop the machine's last bar. Bar 1 is the machine and never goes. */
  removeBar: () => string;
  /**
   * Set the machine's ORDER — which bar plays in each song bar, looping. An
   * empty list means "bar 1 everywhere". Returns the status line.
   */
  setOrder: (order: number[]) => string;
  /**
   * What each SONG bar actually plays, and whether a SECTION named it. Read from
   * the scene's `machineBarsForSong`, so it is the same list the engine plays.
   */
  songBeat: () => { bar: number; fromForm: boolean }[];
  /** Change how many steps make one beat of the machine. */
  setBeat: (beat: number) => string;
  /** Move one of the selected pad's mix controls. */
  setPadMix: (pad: number, id: PadMixId, value: number) => string;
  /** Move the selected pad's tuning by semitones. */
  stepPadPitch: (pad: number, delta: number) => string;
  /** Set the selected pad's tuning outright, as a MIDI note. */
  setPadPitch: (pad: number, value: number) => string;
  /** Move one of the selected pad's VOICE knobs, 0..100. */
  setPadVoice: (pad: number, id: VoiceParamId, value: number) => string;
  /** Walk the selected pad's voice through the named presets. */
  cyclePadVoice: (pad: number, direction: number) => string;
  /** Sound one pad now, so a beat can be built by ear. */
  audition: (pad: number) => void;
  /** True while the transport is running, so the page's own PLAY can show it. */
  playing: () => boolean;
  /** Start or stop the transport from the page's own transport row. */
  togglePlay: () => string;
}

/** The canvas the app is drawn in. */
const CANVAS_W = 720;
const CANVAS_H = 405;

/** Render depths: back < curtain < frame < text and buttons. Above the toast. */
const DEPTH_BACK = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_TEXT = 980;

/** The page's own margin, and the gap between panels. */
const PAD = 5;
const COL_GAP = 4;

/**
 * The PAGE, in canvas coordinates: everything BELOW the header.
 *
 * The header stays up in every screen — the wordmark, the song title and the tab
 * dropdown live there — so the machine fills the room under it with the same 8px
 * margin the tracker's own panels keep, and covers the tracker rather than
 * floating over it. A page, not a window.
 */
const PAGE: Rect = { x: 8, y: 39, width: 704, height: 358 };
const PAGE_B = PAGE.y + PAGE.height;
const PAGE_R = PAGE.x + PAGE.width;

/**
 * The panel stack, in the reference's own proportions: the machine strip is
 * short, the sequencer is by far the tallest, PAD PARAMETERS is shallow but runs
 * the full width, and the bottom row is the shortest of all.
 */
const MACHINE: Rect = { x: PAGE.x, y: PAGE.y + 4, width: PAGE.width, height: 44 };
const SEQ: Rect = { x: PAGE.x, y: MACHINE.y + MACHINE.height + PAD, width: 484, height: 168 };
const THIS_PAD: Rect = { x: SEQ.x + SEQ.width + COL_GAP, y: SEQ.y, width: PAGE_R - (SEQ.x + SEQ.width + COL_GAP), height: SEQ.height };
const PARAMS: Rect = { x: PAGE.x, y: SEQ.y + SEQ.height + PAD, width: PAGE.width, height: 78 };
const BOTTOM_Y = PARAMS.y + PARAMS.height + PAD;
const BOTTOM_H = PAGE_B - BOTTOM_Y - 4;
const TRANSPORT: Rect = { x: PAGE.x, y: BOTTOM_Y, width: 310, height: BOTTOM_H };
const PATTERN: Rect = { x: TRANSPORT.x + TRANSPORT.width + COL_GAP, y: BOTTOM_Y, width: 250, height: BOTTOM_H };
const SHORTCUTS: Rect = { x: PATTERN.x + PATTERN.width + COL_GAP, y: BOTTOM_Y, width: PAGE_R - (PATTERN.x + PATTERN.width + COL_GAP), height: BOTTOM_H };

// --- the sequencer's own geometry -------------------------------------------

const SEQ_IN = SEQ.x + 8;
const SEQ_R = SEQ.x + SEQ.width - 8;
const SEQ_TITLE_Y = SEQ.y + 4;
const SEQ_DIVIDER = SEQ.y + 18;
const SEQ_COLHEAD_Y = SEQ.y + 21;
const GRID_TOP = SEQ.y + 34;
const ROW_H = 14;
/** The pad's colour chip, its name, and the two keys beside them. */
const CHIP_X = SEQ_IN;
const NAME_X = SEQ_IN + 14;
const M_X = SEQ_IN + 96;
const S_X = SEQ_IN + 114;
const GRID_X = SEQ_IN + 138;
const CELL_W = 20;
const CELL_W_IN = 18;
const GRID_CAPACITY = Math.max(1, Math.floor((SEQ_R - GRID_X) / CELL_W));
/** The sequencer's footer: the order the song plays the machine's bars in. */
const ORDER_Y = SEQ.y + SEQ.height - 18;
const ORDER_SLOT_W = 20;
const ORDER_MAX_SLOTS = 10;

// --- THIS PAD's own geometry -------------------------------------------------

const PAD_IN = THIS_PAD.x + 6;
const PAD_R = THIS_PAD.x + THIS_PAD.width - 6;
const PAD_NAME_X = PAD_IN + 18;
const PAD_METER_X = PAD_IN + 62;
const PAD_METER_W = 104;
const PAD_PARAM_TOP = THIS_PAD.y + 56;
const PAD_PARAM_STEP = 12;

// --- PAD PARAMETERS' own geometry --------------------------------------------

const PARAMS_IN = PARAMS.x + 8;
const PARAMS_R = PARAMS.x + PARAMS.width - 8;
const TAB_W = 68;
const TAB_X = PARAMS_IN;
const TAB_TOP = PARAMS.y + 15;
const TAB_H = 10;
const PARAM_BODY_X = PARAMS_IN + TAB_W + 6;
const WAVE_RECT: Rect = { x: PARAM_BODY_X, y: PARAMS.y + 32, width: 340, height: 38 };
const PARAM_BAR_X = WAVE_RECT.x + WAVE_RECT.width + 14;
const PARAM_BAR_W = 80;
const SWITCH_X = PARAMS_R - 58;

/** The line that explains the controls when nothing has been done yet. */
const FALLBACK_STATUS =
  'DRAW A BEAT: LEFT-CLICK A STEP, RIGHT-CLICK FOR VELOCITY.';

const HINT_LINES: readonly string[] = [
  'SPACE PLAY · 1-7 PAD',
  'O ON/OFF · M/S MUTE',
  'ESC BACK · F FOLLOW',
];

/** Which theme colour a piece of static copy wears. */
type TextRole = 'heading' | 'body' | 'accent' | 'dim';

interface StaticText {
  obj: Phaser.GameObjects.Text;
  role: TextRole;
}

/**
 * A click surface, POOLED rather than rebuilt.
 *
 * A `Zone` is cheaper than a Text, but one render builds dozens of them and wires
 * a handler to each; destroying and recreating the lot on every paint was part of
 * what made this page slow to open and slow to click. The zone is reused,
 * re-positioned, re-sized only when the layout really changes, and re-bound to
 * this render's handler — the handler closes over the row it was built for, so it
 * has to be replaced even when the zone itself is not.
 */
interface Zone {
  zone: Phaser.GameObjects.Zone;
  press: () => void;
  pointerDown?: (p: Phaser.Input.Pointer) => void;
  /** The size it was last given, so a resize re-arms the hit area only then. */
  width: number;
  height: number;
}

export class DrumMachineView {
  private readonly scene: Phaser.Scene;
  private readonly handlers: DrumMachineHandlers;

  private readonly back: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly gridGfx: Phaser.GameObjects.Graphics;
  /** The playhead band, drawn separately so a step does not rebuild the grid. */
  private readonly playGfx: Phaser.GameObjects.Graphics;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly buttons: Button[] = [];
  private readonly staticCopy: StaticText[] = [];

  private rowTexts: Phaser.GameObjects.Text[] = [];
  private rowZones: Zone[] = [];
  /**
   * How many of each pool the CURRENT render reached, and what each pooled Text
   * was last told to say.
   *
   * The pools are this page's whole performance story. `uiText` rasterizes a Text
   * at 4x resolution, and one render builds over a hundred of them, so DESTROYING
   * and rebuilding the pool on every paint cost hundreds of milliseconds — which is
   * exactly why opening the page and every click on it felt slow. A render now
   * rewinds the pools, moves only the fields that changed, and allocates a new
   * object only when the layout genuinely grows.
   */
  private textCount = 0;
  private zoneCount = 0;
  private readonly textState: { text: string; color: number; size: number; anchorX: number; x: number; y: number }[] = [];

  private readonly title: Phaser.GameObjects.Text;
  private readonly statusObj: Phaser.GameObjects.Text;
  private readonly playBtn: Button;
  private readonly stopBtn: Button;
  private readonly hearBtn: Button;
  private readonly addPadBtn: Button;
  private readonly delPadBtn: Button;

  /** Where the cursor is: which pad, and which step of the machine's own loop. */
  private pad = 0;
  private step = 0;
  /** The active PAD PARAMETERS tab. */
  private tab: ParamTab = 'sample';
  /** Whether the waveform is drawn zoomed in, which is what TRIM toggles. */
  private zoomed = false;
  /**
   * The machine step now SOUNDING, or -1 when stopped — the playhead, handed in
   * by the scene from the engine's own clock, never computed here.
   */
  private playStep = -1;
  /** The slice of the grid on screen, kept so the playhead can be redrawn alone. */
  private gridWindow = { first: 0, visible: 0 };
  private gridRows = 0;
  /**
   * Which BAR of the machine is on the grid, 1-based.
   *
   * Bar 1 is the pads' own rows; every other bar is another ROW PER PAD, reached
   * from the script as `machine bar N`. The grid draws whichever bar is current.
   */
  private bar = 1;
  /**
   * True while the grid follows the bar the transport is sounding. Manual bar
   * navigation turns it off until `F` asks for it back — a hand that just chose a
   * bar did not want it taken away a sixteenth later — and a fresh open starts
   * following again, because a page opened mid-song should show what is playing.
   */
  private following = true;
  /** Pads hushed by their row's M key, and the restores the key took away. */
  private readonly hushed = new Map<number, number>();
  /** The pad S singled out, or -1. */
  private soloed = -1;
  private status = '';
  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: DrumMachineHandlers) {
    this.scene = scene;
    this.handlers = handlers;

    this.back = scene.add.graphics().setDepth(DEPTH_BACK);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.gridGfx = scene.add.graphics().setDepth(DEPTH_FRAME + 1);
    this.playGfx = scene.add.graphics().setDepth(DEPTH_FRAME + 2);
    this.layer = scene.add.container(0, 0).setDepth(DEPTH_TEXT + 1);

    // The curtain covers everything below the header and takes any click the
    // machine's own controls miss. It does nothing itself: a page is not a
    // pop-up, so clicking the background must not close it — the tab dropdown is
    // the way back, exactly as it is in the tracker.
    this.curtain = scene.add.zone(0, PAGE.y, CANVAS_W, CANVAS_H - PAGE.y).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);

    // Static copy is created once and recoloured on every render, because F9 can
    // change the theme while the view is closed and the headings must come back
    // in the new one's colours.
    // The machine strip's heading and the page's status line share one row: the
    // heading on the left, what just happened on the right, so an edit is read
    // where the eye already is rather than under the page's last panel.
    this.title = uiText(scene, MACHINE.x + 8, MACHINE.y + 5, '', { size: 9, color: activeColors().textPrimary });
    this.title.setDepth(DEPTH_TEXT + 2);
    this.statusObj = uiText(scene, MACHINE.x + MACHINE.width - 8, MACHINE.y + 6, '', {
      size: 8,
      color: activeColors().textPrimary,
      origin: { x: 1, y: 0 },
    });
    this.statusObj.setDepth(DEPTH_TEXT + 2);
    this.staticCopy.push({ obj: this.title, role: 'heading' }, { obj: this.statusObj, role: 'body' });

    // The bottom row's controls. They are the framework's own Button, so hover,
    // press and the theme's recolour all come for free.
    const btnY = TRANSPORT.y + 21;
    this.playBtn = new Button(scene, { x: TRANSPORT.x + 8, y: btnY, width: 104, height: 20 }, 'PLAY', { size: 8 });
    this.playBtn.onPress = () => { this.status = this.handlers.togglePlay(); this.render(); };
    this.stopBtn = new Button(scene, { x: TRANSPORT.x + 118, y: btnY, width: 76, height: 20 }, 'STOP', { size: 8 });
    this.stopBtn.onPress = () => {
      if (this.handlers.playing()) this.status = this.handlers.togglePlay();
      this.render();
    };
    this.hearBtn = new Button(scene, { x: TRANSPORT.x + 200, y: btnY, width: 102, height: 20 }, 'HEAR PAD', { size: 8 });
    this.hearBtn.onPress = () => this.handlers.audition(this.pad + 1);
    this.addPadBtn = new Button(scene, { x: PATTERN.x + 96, y: btnY, width: 70, height: 20 }, '+ ADD PAD', { size: 8 });
    this.addPadBtn.onPress = () => { this.status = this.handlers.addPad(); this.render(); };
    this.delPadBtn = new Button(scene, { x: PATTERN.x + 170, y: btnY, width: 70, height: 20 }, 'DEL PAD', { size: 8 });
    this.delPadBtn.onPress = () => {
      this.status = this.handlers.removePad();
      const pads = this.handlers.machine()?.pads.length ?? 1;
      this.pad = Math.max(0, Math.min(pads - 1, this.pad));
      this.render();
    };
    this.buttons.push(this.playBtn, this.stopBtn, this.hearBtn, this.addPadBtn, this.delPadBtn);
    // The page's own controls must sit ABOVE the opaque cover and the panel frame
    // it draws over the tracker — a Button defaults to depth 0, which is under
    // both.
    for (const button of this.buttons) button.container.setDepth(DEPTH_TEXT);

    this.unsubscribe = onThemeChanged(() => this.render());
    // Closed, and NOT drawn: the page is hidden at boot, so painting it here only
    // made startup pay for a screen nobody had asked to see. `show()` renders on
    // the way in, which is the first moment the machine is actually wanted.
    this.setOpen(false);
  }

  /** True while the view is up; the scene pauses itself while it is. */
  get isOpen(): boolean { return this.opened; }

  show(): void {
    const machine = this.handlers.machine();
    const pads = machine?.pads.length ?? 0;
    this.pad = Math.max(0, Math.min(Math.max(0, pads - 1), this.pad));
    this.step = Math.max(0, Math.min(Math.max(0, (machine?.steps ?? 1) - 1), this.step));
    this.bar = machine ? clampMachineBar(machine, this.bar) : 1;
    this.following = true;
    this.status = '';
    this.setOpen(true);
    this.render();
  }

  hide(): void { this.setOpen(false); }
  toggle(): void { if (this.opened) this.hide(); else this.show(); }

  private setOpen(open: boolean): void {
    const changed = open !== this.opened;
    this.opened = open;
    this.back.setVisible(open);
    this.frame.setVisible(open);
    this.gridGfx.setVisible(open);
    this.playGfx.setVisible(open);
    this.curtain.setVisible(open);
    this.layer.setVisible(open);
    for (const button of this.buttons) button.container.setVisible(open);
    for (const entry of this.staticCopy) entry.obj.setVisible(open);
    for (const text of this.rowTexts) text.setVisible(open);
    for (const zone of this.rowZones) zone.zone.setVisible(open);
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- keyboard -------------------------------------------------------------

  /**
   * The keys the view answers to.
   *
   * Read directly rather than through `menuIntent`, because this is a GRID menu:
   * the arrows mean up/down/left/right rather than "next row", so the shared table
   * — which folds Left into Up — is the wrong shape here. Escape is still the way
   * out, and WASD still walks the grid.
   */
  handleKey(e: KeyboardEvent): void {
    const machine = this.handlers.machine();
    switch (e.code) {
      case 'Escape': e.preventDefault(); this.hide(); return;
      case 'ArrowUp': case 'KeyW': e.preventDefault(); this.movePad(-1); return;
      case 'ArrowDown': case 'KeyS': e.preventDefault(); this.movePad(1); return;
      case 'ArrowLeft': case 'KeyA': e.preventDefault(); this.moveStep(-1); return;
      case 'ArrowRight': case 'KeyD': e.preventDefault(); this.moveStep(1); return;
      case 'Home': e.preventDefault(); this.step = 0; this.render(); return;
      case 'End': e.preventDefault(); this.step = Math.max(0, (machine?.steps ?? 1) - 1); this.render(); return;
      case 'Space': case 'Enter': case 'NumpadEnter':
        e.preventDefault();
        this.status = this.handlers.togglePlay();
        this.render();
        return;
      case 'BracketRight': case 'Equal': case 'NumpadAdd':
        e.preventDefault();
        this.setCellVelocity(nextHitVelocity(this.hitAt(this.step)));
        return;
      case 'BracketLeft': case 'Minus': case 'NumpadSubtract':
        e.preventDefault();
        this.setCellVelocity(previousHitVelocity(this.hitAt(this.step)));
        return;
      case 'Delete': case 'Backspace':
        e.preventDefault();
        this.clearRow();
        return;
      case 'KeyZ': e.preventDefault(); this.nudgeSteps(-1); return;
      case 'KeyX': e.preventDefault(); this.nudgeSteps(1); return;
      case 'Comma': e.preventDefault(); this.nudgeBeat(-1); return;
      case 'Period': e.preventDefault(); this.nudgeBeat(1); return;
      case 'PageUp': e.preventDefault(); this.nudgeBar(-1); return;
      case 'PageDown': e.preventDefault(); this.nudgeBar(1); return;
      case 'Tab': e.preventDefault(); this.cycleVoice(1); return;
      case 'KeyV': e.preventDefault(); this.handlers.audition(this.pad + 1); return;
      case 'KeyO': e.preventDefault(); this.toggleEnabled(); return;
      case 'KeyF': e.preventDefault(); this.toggleFollow(); return;
      case 'KeyM': e.preventDefault(); this.toggleRowMute(this.pad); return;
      default: break;
    }
    // A digit sets the cursor's velocity outright: 1 is the softest, 9 a full
    // hit, and 0 is a rest — the same nine bands a `pad … pattern` string writes,
    // so the grid and a script agree on what a number means. 1-7 also SELECT a
    // pad, exactly as the reference's shortcut line promises.
    if (/^Digit[0-9]$/.test(e.code)) {
      e.preventDefault();
      const digit = Number(e.code.slice(5));
      const pads = machine?.pads.length ?? 0;
      if (digit >= 1 && digit <= Math.min(7, pads)) this.pad = digit - 1;
      if (digit === 0) this.setCellVelocity(0);
      else if (digit >= 1 && digit <= 9) this.setCellVelocity(Math.round((digit / 9) * 100));
      return;
    }
  }

  // --- cursor and edits -----------------------------------------------------

  private movePad(delta: number): void {
    const pads = this.handlers.machine()?.pads.length ?? 1;
    this.pad = Math.max(0, Math.min(pads - 1, this.pad + delta));
    this.render();
  }

  private moveStep(delta: number): void {
    const steps = this.handlers.machine()?.steps ?? 1;
    this.step = Math.max(0, Math.min(steps - 1, this.step + delta));
    this.render();
  }

  /** The velocity under the cursor on the current bar, or 0 when there is none. */
  private hitAt(step: number): number {
    const machine = this.handlers.machine();
    if (!machine) return 0;
    const rows = machineBarRows(machine, clampMachineBar(machine, this.bar));
    return rows[this.pad]?.[step] ?? 0;
  }

  /** Put a hit in the cell under the cursor, or take it out. */
  private toggleCell(): void {
    this.setCellVelocity(toggleHitVelocity(this.hitAt(this.step)));
  }

  /** Write a velocity at the cursor, report it, and redraw. One undo step. */
  private setCellVelocity(velocity: number): void {
    const pad = this.pad + 1;
    this.status = this.handlers.setHit(pad, this.step, velocity, this.bar);
    if (velocity > 0) this.handlers.audition(pad);
    this.render();
  }

  /** Empty the selected pad's row on this bar, one undo step per hit. */
  private clearRow(): void {
    const machine = this.handlers.machine();
    if (!machine) return;
    const steps = machine.steps;
    let cleared = 0;
    for (let step = 0; step < steps; step++) {
      if (this.hitAt(step) > 0) {
        this.handlers.setHit(this.pad + 1, step, 0, this.bar);
        cleared += 1;
      }
    }
    this.status = cleared === 0 ? 'ROW ALREADY EMPTY.' : `CLEARED ${cleared} HIT${cleared === 1 ? '' : 'S'}.`;
    this.render();
  }

  private nudgeSteps(delta: number): void {
    const machine = this.handlers.machine();
    if (!machine) return;
    this.status = this.handlers.setSteps(machine.steps + delta);
    this.step = Math.max(0, Math.min(Math.max(0, (this.handlers.machine()?.steps ?? 1) - 1), this.step));
    this.render();
  }

  private nudgeBeat(delta: number): void {
    const machine = this.handlers.machine();
    if (!machine) return;
    this.status = this.handlers.setBeat(machine.beat + delta);
    this.render();
  }

  /** Walk the grid to another BAR, clamped to the bars the machine has. */
  private nudgeBar(delta: number): void {
    const machine = this.handlers.machine();
    if (!machine) return;
    const next = clampMachineBar(machine, this.bar + delta);
    if (next === this.bar) return;
    // Choosing a bar by hand means you want to stay there, so following stops
    // until `F` is pressed. The status says so, rather than silently overriding.
    this.following = false;
    this.bar = next;
    this.status = `BAR ${next} OF ${machineBarCount(machine)}  ·  F TO FOLLOW`;
    this.render();
  }

  /**
   * Follow the bar the transport is sounding, while it runs.
   *
   * Handed in by the scene from the same `machineBarsForSong` the engine plays,
   * so the grid can never show a bar the song is not on.
   */
  followBar(bar: number): void {
    if (!this.opened || !this.following || bar < 1 || bar === this.bar) return;
    this.bar = bar;
    this.render();
  }

  /** Turn following on or off, and say which it is now. */
  private toggleFollow(): void {
    this.following = !this.following;
    this.status = this.following
      ? 'FOLLOW ON  ·  THE GRID TRACKS THE PLAYING BAR'
      : 'FOLLOW OFF  ·  THE GRID STAYS WHERE YOU PUT IT';
    this.render();
  }

  /** Add a bar (a copy of the last) and look at it, so it can be edited at once. */
  private growBar(): void {
    this.status = this.handlers.addBar();
    const machine = this.handlers.machine();
    if (machine) this.bar = machineBarCount(machine);
    this.following = false;
    this.render();
  }

  /** Drop the last bar and stay on a bar that still exists. */
  private shrinkBar(): void {
    this.status = this.handlers.removeBar();
    const machine = this.handlers.machine();
    this.bar = machine ? clampMachineBar(machine, this.bar) : 1;
    this.following = false;
    this.render();
  }

  private toggleEnabled(): void {
    const machine = this.handlers.machine();
    if (!machine) return;
    // Read the state BEFORE toggling: `setEnabled` edits the machine IN PLACE, so
    // testing `machine.enabled` after the call reads the NEW value and inverts this
    // branch. That is what left the page saying `MACHINE OFF · THE PADS ARE KEPT`
    // after the machine had been switched ON — the ON path returned before the
    // repaint that would have shown the new status.
    const turningOn = !machine.enabled;
    this.status = this.handlers.setEnabled(turningOn);
    // Turning it on is the one edit worth hearing immediately.
    if (turningOn) this.handlers.audition(this.pad + 1);
    this.render();
  }

  private cycleVoice(direction: number): void {
    this.status = this.handlers.cyclePadVoice(this.pad + 1, direction);
    this.handlers.audition(this.pad + 1);
    this.render();
  }

  /**
   * Mute or unmute a pad's row.
   *
   * A pad has no flag of its own, so the hush is done the way the machine already
   * knows: the row's own fader is taken to zero and the value it had is kept to
   * put back. That is a real edit — one undo step, audible at once — rather than a
   * decoration that only dims a row.
   */
  private toggleRowMute(index: number): void {
    const machine = this.handlers.machine();
    const pad = machine?.pads[index];
    if (!pad) return;
    const held = this.hushed.get(index);
    if (held === undefined) {
      this.hushed.set(index, pad.level);
      this.status = this.handlers.setPadMix(index + 1, 'level', 0);
    } else {
      this.hushed.delete(index);
      this.status = this.handlers.setPadMix(index + 1, 'level', held);
    }
    this.render();
  }

  /**
   * Solo one pad's row: every other row is hushed, and pressing S again gives the
   * kit its levels back. Built on the same faders as the M key, so the two read as
   * one idea — a drum can be heard alone, and the levels are restored exactly.
   */
  private toggleRowSolo(index: number): void {
    const machine = this.handlers.machine();
    if (!machine) return;
    if (this.soloed === index) {
      this.soloed = -1;
      for (const [row, level] of this.hushed) {
        this.handlers.setPadMix(row + 1, 'level', level);
      }
      this.hushed.clear();
      this.status = 'SOLO OFF  ·  THE KIT IS BACK';
      this.render();
      return;
    }
    for (const [row, level] of this.hushed) {
      this.handlers.setPadMix(row + 1, 'level', level);
    }
    this.hushed.clear();
    machine.pads.forEach((pad, row) => {
      if (row === index) return;
      this.hushed.set(row, pad.level);
      this.handlers.setPadMix(row + 1, 'level', 0);
    });
    this.soloed = index;
    this.status = `SOLO ${machine.pads[index]?.name ?? ''}`.trim();
    this.render();
  }

  // --- drawing --------------------------------------------------------------

  render(): void {
    const c = activeColors();
    const machine = this.handlers.machine();

    // An OPAQUE cover, not a dim: this is a page, so the tracker underneath is
    // hidden rather than seen through.
    this.back.clear();
    this.back.fillStyle(c.ink, 1);
    this.back.fillRect(0, PAGE.y, CANVAS_W, CANVAS_H - PAGE.y);

    const g = this.frame;
    g.clear();

    this.gridGfx.clear();
    // REWIND the pools rather than emptying them: the objects below are reused, and
    // whatever this render does not reach is hidden at the end. Nothing is destroyed
    // here, which is what takes the paint from hundreds of milliseconds to a few.
    this.textCount = 0;
    this.zoneCount = 0;

    this.title.setText(machine
      ? `DRUM MACHINE   ·   MACHINE ${machine.enabled ? 'ON' : 'OFF'}   ·   ${machine.pads.length} PADS   ·   ${countMachineHits(machine)} HITS`
      : 'DRUM MACHINE   ·   NO MACHINE');
    this.title.setColor(intToCss(c.ooze));

    // Five panels, in the reference's order and at its proportions. The machine
    // strip's own heading is the persistent `title` above it, so it is drawn bare.
    this.panel(MACHINE, '', c);
    this.panel(SEQ, 'SEQUENCER', c);
    this.panel(THIS_PAD, 'THIS PAD', c);
    this.panel(PARAMS, 'PAD PARAMETERS', c);
    this.panel(TRANSPORT, 'TRANSPORT', c);
    this.panel(PATTERN, 'PATTERN', c);
    this.panel(SHORTCUTS, 'SHORTCUTS', c);

    if (machine) {
      this.drawMachineStrip(machine, c);
      this.drawSequencer(machine, c);
      this.drawThisPad(machine, c);
      this.drawPadParams(machine, c);
      this.drawOrder(machine, c);
    } else {
      this.pushText(SEQ_IN, SEQ.y + 40, 'NO MACHINE IN THIS SONG.', c.danger);
    }

    this.drawBottomRow(machine, c);

    for (const entry of this.staticCopy) entry.obj.setColor(intToCss(colorForRole(entry.role, c)));
    this.statusObj.setText(clip(this.status === '' ? FALLBACK_STATUS : this.status, 58));
    this.statusObj.setColor(intToCss(this.status === '' ? c.textDim : c.textPrimary));
    this.drawPlayhead();

    // The bottom row's buttons speak the state they are about.
    this.playBtn.setText(this.handlers.playing() ? 'PLAYING' : 'PLAY');
    this.playBtn.setEnabled(!this.handlers.playing());
    this.stopBtn.setEnabled(this.handlers.playing());
    this.delPadBtn.setEnabled((machine?.pads.length ?? 0) > 1);
    this.addPadBtn.setEnabled((machine?.pads.length ?? MAX_PADS) < MAX_PADS);

    // Show exactly the objects this render used, and hide any surplus left by a
    // bigger previous one — a shrinking grid must not leave stale text on the page.
    for (let i = 0; i < this.rowTexts.length; i += 1) this.rowTexts[i]!.setVisible(this.opened && i < this.textCount);
    for (let i = 0; i < this.rowZones.length; i += 1) this.rowZones[i]!.zone.setVisible(this.opened && i < this.zoneCount);
  }

  /** One framed panel with its title in the top-left corner. */
  private panel(rect: Rect, title: string, c: UiColors): void {
    drawPanel(this.frame, rect, 1, c);
    if (title !== '') {
      this.pushText(rect.x + 8, rect.y + 4, title, c.ooze);
    }
  }

  /** A row of label + groove + value, the page's one way of showing a number. */
  private meter(x: number, y: number, width: number, value: number, min: number, max: number, signed: boolean, c: UiColors): void {
    const g = this.frame;
    const h = 9;
    drawInset(g, { x, y, width, height: h }, 1, c);
    const inner = width - 2;
    if (signed) {
      const mid = Math.floor(inner / 2);
      const span = Math.max(1, max - min);
      const offset = Math.round(mid * ((value - min) / span * 2 - 1));
      if (offset !== 0) {
        g.fillStyle(c.ward, 0.85);
        const from = offset < 0 ? mid + offset : mid;
        g.fillRect(x + 1 + from, y + 1, Math.abs(offset), h - 2);
      }
      g.fillStyle(c.textDim, 0.9);
      g.fillRect(x + 1 + mid, y + 1, 1, h - 2);
      return;
    }
    const span = Math.max(1, max - min);
    const filled = Math.max(0, Math.min(inner, Math.round(inner * ((value - min) / span))));
    if (filled > 0) {
      g.fillStyle(c.textGreen, 0.85);
      g.fillRect(x + 1, y + 1, filled, h - 2);
      g.fillStyle(c.textPrimary, 0.3);
      g.fillRect(x + 1, y + 1, filled, 1);
    }
  }

  /** The machine's own strip: its shape, its mix, and the two steppers. */
  private drawMachineStrip(machine: DrumMachine, c: UiColors): void {
    // A seam under the strip's heading, so the controls read as its body.
    drawDivider(this.frame, MACHINE.x + 4, MACHINE.y + 17, MACHINE.width - 8, 1, c);
    const y1 = MACHINE.y + 20;
    const y2 = MACHINE.y + 31;
    this.pushText(MACHINE.x + 8, y1 + 2, 'MACHINE', c.textDim);
    this.toggleBox({ x: MACHINE.x + 62, y: y1 - 1, width: 50, height: 13 }, machine.enabled, c, () => this.toggleEnabled());
    this.pushText(MACHINE.x + 118, y1 + 2, machine.enabled ? 'ON' : 'OFF', machine.enabled ? c.textGreen : c.textDim);

    const mixBars: { id: MachineMixId; label: string; value: number; signed: boolean; x: number; y: number }[] = [
      { id: 'level', label: 'MIX', value: machine.level, signed: false, x: 142, y: y1 },
      { id: 'duck', label: 'DUCK', value: machine.duck, signed: false, x: 142, y: y2 },
      { id: 'swing', label: 'SWING', value: machine.swing, signed: false, x: 298, y: y1 },
      { id: 'verb', label: 'VERB', value: machine.verb, signed: false, x: 298, y: y2 },
      { id: 'echo', label: 'ECHO', value: machine.echo, signed: false, x: 452, y: y1 },
    ];
    for (const bar of mixBars) {
      const labelX = MACHINE.x + bar.x;
      this.pushText(labelX, bar.y + 2, bar.label, c.textDim);
      const meterX = labelX + 44;
      this.meter(meterX, bar.y, 76, bar.value, 0, 100, false, c);
      this.pushText(meterX + 80, bar.y + 2, levelLabel(bar.value), c.textPrimary);
      this.meterZone(meterX, bar.y, 76, 0, 100, (value) => {
        this.status = this.handlers.setMix(bar.id, value);
      });
    }

    // BAR and PADS: which of the machine's bars the grid is drawing, and which pad
    // is selected. Both are the app's stepper shape, compact for the strip.
    const barCount = machineBarCount(machine);
    this.pushText(MACHINE.x + 592, y1 + 2, 'BAR', c.textDim);
    this.stepper({ x: MACHINE.x + 616, y: y1 - 2, width: 76 }, `${this.bar}/${barCount}`, c, () => this.nudgeBar(-1), () => this.nudgeBar(1));
    this.pushText(MACHINE.x + 592, y2 + 2, 'PADS', c.textDim);
    this.stepper({ x: MACHINE.x + 616, y: y2 - 2, width: 76 }, `${this.pad + 1}/${machine.pads.length}`, c, () => this.movePad(-1), () => this.movePad(1));
  }

  /** The sequencer: the pad list, the keys, and the step grid. */
  private drawSequencer(machine: DrumMachine, c: UiColors): void {
    const g = this.gridGfx;
    const pads = machine.pads.length;
    const beat = Math.max(1, machine.beat);
    const win = drumGridWindow(machine.steps, this.step, GRID_CAPACITY);
    const gridW = win.visible * CELL_W;
    const rows = machineBarRows(machine, clampMachineBar(machine, this.bar));
    this.gridWindow = { first: win.first, visible: win.visible };
    this.gridRows = pads;

    // The panel's own header line: the SHAPE of the beat as two live steppers,
    // then the buttons that walk the pads and the machine's bars.
    this.pushText(SEQ.x + 78, SEQ_TITLE_Y + 4, 'STEPS', c.textDim);
    this.stepper({ x: SEQ.x + 114, y: SEQ_TITLE_Y - 1, width: 54 }, `${machine.steps}`, c, () => this.nudgeSteps(-1), () => this.nudgeSteps(1));
    this.pushText(SEQ.x + 176, SEQ_TITLE_Y + 4, 'BEAT', c.textDim);
    this.stepper({ x: SEQ.x + 208, y: SEQ_TITLE_Y - 1, width: 44 }, `${machine.beat}`, c, () => this.nudgeBeat(-1), () => this.nudgeBeat(1));
    this.miniButton({ x: SEQ_R - 186, y: SEQ_TITLE_Y, width: 56, height: 15 }, '< PAD', c, () => this.movePad(-1));
    this.miniButton({ x: SEQ_R - 126, y: SEQ_TITLE_Y, width: 56, height: 15 }, 'PAD >', c, () => this.movePad(1));
    this.miniButton({ x: SEQ_R - 66, y: SEQ_TITLE_Y, width: 66, height: 15 }, `BAR ${this.bar}/${machineBarCount(machine)}`, c, () => this.nudgeBar(1));
    drawDivider(g, SEQ.x + 4, SEQ_DIVIDER, SEQ.width - 8, 1, c);

    // The column headings, so a step can be counted without arithmetic.
    this.pushText(CHIP_X, SEQ_COLHEAD_Y, 'PAD', c.textDim);
    this.pushText(M_X + 4, SEQ_COLHEAD_Y, 'M', c.textDim);
    this.pushText(S_X + 4, SEQ_COLHEAD_Y, 'S', c.textDim);
    for (let column = 0; column < win.visible; column++) {
      const step = win.first + column;
      this.pushText(GRID_X + column * CELL_W, SEQ_COLHEAD_Y, `${step + 1}`, step % beat === 0 ? c.textPrimary : c.textDim);
    }

    // The well the steps sit in, recessed so a hit reads as raised out of it.
    drawInset(g, { x: GRID_X - 2, y: GRID_TOP - 2, width: gridW + 4, height: pads * ROW_H + 4 }, 1, c);

    // Beat bands: every other beat is washed faintly, so four steps read as one
    // group without counting, and a seam marks each beat boundary.
    for (let column = 0; column < win.visible; column++) {
      const step = win.first + column;
      const x = GRID_X + column * CELL_W;
      if (Math.floor(step / beat) % 2 === 1) {
        g.fillStyle(c.stone, 0.13);
        g.fillRect(x, GRID_TOP - 2, CELL_W, pads * ROW_H + 4);
      }
      if (step % beat === 0 && column > 0) {
        g.fillStyle(c.stone, 0.5);
        g.fillRect(x - 1, GRID_TOP - 2, 1, pads * ROW_H + 4);
      }
    }

    for (let index = 0; index < pads; index++) {
      const pad = machine.pads[index];
      if (!pad) continue;
      const y = GRID_TOP + index * ROW_H;
      const selected = index === this.pad;
      const colour = padColour(index, c);
      if (selected) {
        g.fillStyle(c.ward, 0.16);
        g.fillRect(SEQ_IN - 4, y - 1, SEQ_R - SEQ_IN + 8, ROW_H - 1);
        g.fillStyle(c.ward, 0.9);
        g.fillRect(SEQ_IN - 4, y - 1, 2, ROW_H - 1);
      }
      // The pad's colour chip, then its name. The chip is the pad's identity all
      // over the page: the same colour draws its hits in the grid.
      g.fillStyle(colour, this.hushed.has(index) ? 0.3 : 0.95);
      g.fillRect(CHIP_X, y + 3, 10, 9);
      g.fillStyle(c.ink, 0.6);
      g.fillRect(CHIP_X, y + 3, 10, 1);
      this.pushText(NAME_X, y + 4, clip(pad.name, 9), selected ? c.textPrimary : c.textDim);
      this.rowZone({ x: CHIP_X - 2, y, width: 108, height: ROW_H }, () => {
        this.pad = index;
        this.handlers.audition(index + 1);
        this.render();
      });

      // The two keys, drawn as the reference draws them: a small beveled box with
      // the letter in it, lit when the pad is hushed (M) or singled out (S).
      this.keyBox({ x: M_X, y: y + 2, width: 14, height: 11 }, 'M', this.hushed.has(index), c, () => this.toggleRowMute(index));
      this.keyBox({ x: S_X, y: y + 2, width: 14, height: 11 }, 'S', this.soloed === index, c, () => this.toggleRowSolo(index));

      // The hits themselves. One zone per ROW rather than per cell: eight rows of
      // up to sixty-four cells would be hundreds of objects torn down and rebuilt
      // on every edit, and the pointer's x already says which column it is.
      for (let column = 0; column < win.visible; column++) {
        const step = win.first + column;
        const velocity = rows[index]?.[step] ?? 0;
        const x = GRID_X + column * CELL_W;
        if (velocity > 0) {
          this.hitKey(x, y + 1, CELL_W_IN, ROW_H - 3, velocity, colour, c);
        } else {
          g.fillStyle(c.ink, 0.5);
          g.fillRect(x, y + 2, CELL_W_IN, ROW_H - 5);
          g.fillStyle(c.stoneHi, 0.12);
          g.fillRect(x, y + ROW_H - 4, CELL_W_IN, 1);
        }
        if (selected && step === this.step) {
          g.lineStyle(1, c.ward, 0.95);
          g.strokeRect(x - 0.5, y + 1.5, CELL_W_IN + 1, ROW_H - 4);
        }
      }
      this.cellZone(index, y, win.first, win.visible);
    }
    drawDivider(g, SEQ.x + 4, ORDER_Y - 4, SEQ.width - 8, 1, c);
  }

  /** THIS PAD: the selected pad's instrument, as eight bars. */
  private drawThisPad(machine: DrumMachine, c: UiColors): void {
    const pad = machine.pads[this.pad];
    if (!pad) return;
    const colour = padColour(this.pad, c);
    // The header's own pad stepper, so the inspector can walk the kit too.
    this.stepper({ x: PAD_R - 60, y: THIS_PAD.y + 2, width: 60 }, `${this.pad + 1}/${machine.pads.length}`, c, () => this.movePad(-1), () => this.movePad(1));

    // The chip and the name, the page's biggest reading of "which drum".
    this.frame.fillStyle(colour, 0.95);
    this.frame.fillRect(PAD_IN, THIS_PAD.y + 19, 12, 11);
    this.frame.fillStyle(c.ink, 0.6);
    this.frame.fillRect(PAD_IN, THIS_PAD.y + 19, 12, 1);
    this.pushText(PAD_NAME_X, THIS_PAD.y + 20, clip(pad.name, MAX_PAD_NAME), c.ooze, 0, 9);

    // SAMPLE: what the pad plays, as the reference's own field.
    this.pushText(PAD_IN, THIS_PAD.y + 38, 'SAMPLE', c.textDim);
    this.field({ x: PAD_IN + 46, y: THIS_PAD.y + 35, width: PAD_R - PAD_IN - 46, height: 13 },
      pad.sample === null ? 'GENERATOR' : clip(pad.sample.toUpperCase(), 18), c, () => this.cycleSample());

    // Eight bars, exactly the reference's list. FILTER and DRIVE are the pad's own
    // BRIGHT and THICK; the two sends are the machine's, which is the only place a
    // pad's output actually has a send to give.
    const rows: ParamRow[] = [
      this.row('LEVEL', pad.level, 0, 100, false, levelLabel(pad.level), 'level'),
      this.row('PAN', pad.pan, -MAX_PAN, MAX_PAN, true, panLabel(pad.pan), 'pan'),
      this.tuneRow(pad),
      this.voiceRow('DECAY', pad, 'decay'),
      this.voiceRow('FILTER', pad, 'bright'),
      this.voiceRow('DRIVE', pad, 'thick'),
      this.machineRow('VERB SEND', machine, 'verb'),
      this.machineRow('ECHO SEND', machine, 'echo'),
    ];
    rows.forEach((row, index) => {
      const y = PAD_PARAM_TOP + index * PAD_PARAM_STEP;
      this.pushText(PAD_IN, y + 2, row.label, c.textDim);
      this.meter(PAD_METER_X, y, PAD_METER_W, row.value, row.min, row.max, row.signed, c);
      this.pushText(PAD_R, y + 2, row.display, c.textPrimary, 1);
      this.meterZone(PAD_METER_X, y, PAD_METER_W, row.min, row.max, row.set);
    });
  }

  /**
   * PAD PARAMETERS: the tabbed editor, in the reference's own shape — narrow
   * vertical tabs on the left, the waveform filling the middle, four bars beside
   * it, and a compact column of switches on the right.
   */
  private drawPadParams(machine: DrumMachine, c: UiColors): void {
    const pad = machine.pads[this.pad];
    if (!pad) return;
    const g = this.frame;

    // The panel's own header names the pad it is editing.
    this.pushText(PARAMS_IN + 110, PARAMS.y + 3, `—   ${clip(pad.name, MAX_PAD_NAME)}`, c.textPrimary);
    drawDivider(g, PARAMS.x + 4, PARAMS.y + 13, PARAMS.width - 8, 1, c);

    // The three actions the reference puts on this panel's header: hear the pad,
    // browse its sound, and trim (zoom) the waveform.
    this.miniButton({ x: PARAMS_R - 240, y: PARAMS.y + 1, width: 74, height: 12 }, 'HEAR PAD', c, () => this.handlers.audition(this.pad + 1));
    this.miniButton({ x: PARAMS_R - 162, y: PARAMS.y + 1, width: 96, height: 12 }, 'SAMPLE BROWSER', c, () => this.cycleVoice(1));
    this.miniButton({ x: PARAMS_R - 62, y: PARAMS.y + 1, width: 62, height: 12 }, 'PASTE PAD', c, () => this.status = 'PASTE PAD  ·  NOT IN THIS BUILD.');

    // The tabs, one per row down the panel's left edge.
    PARAM_TABS.forEach((tab, index) => {
      const y = TAB_TOP + index * TAB_H;
      const active = tab.id === this.tab;
      if (active) {
        g.fillStyle(c.ooze, 0.9);
        g.fillRect(TAB_X, y, TAB_W, TAB_H - 1);
      } else {
        drawInset(g, { x: TAB_X, y, width: TAB_W, height: TAB_H - 1 }, 1, c);
      }
      this.pushText(TAB_X + 4, y + 1, tab.label, active ? c.ink : c.textDim);
      this.rowZone({ x: TAB_X, y, width: TAB_W, height: TAB_H }, () => {
        this.tab = tab.id;
        this.render();
      });
    });

    if (this.tab === 'sample') {
      // The sample selector: a field between two arrows, then BROWSE and TRIM.
      this.pushText(PARAM_BODY_X, PARAMS.y + 19, 'SAMPLE', c.textDim);
      this.miniButton({ x: PARAM_BODY_X + 46, y: PARAMS.y + 16, width: 14, height: 12 }, '<', c, () => this.cycleSample());
      this.field({ x: PARAM_BODY_X + 62, y: PARAMS.y + 16, width: 136, height: 13 },
        pad.sample === null ? 'GENERATOR' : clip(pad.sample.toUpperCase(), 22), c, () => this.status = 'A SAMPLE IS SET BY A SCRIPT LINE:  pad 2 sample KICK.');
      this.miniButton({ x: PARAM_BODY_X + 202, y: PARAMS.y + 16, width: 14, height: 12 }, '>', c, () => this.cycleSample());
      this.miniButton({ x: PARAM_BODY_X + 224, y: PARAMS.y + 16, width: 62, height: 12 }, 'BROWSE', c, () => this.cycleVoice(1));
      this.miniButton({ x: PARAM_BODY_X + 290, y: PARAMS.y + 16, width: 44, height: 12 }, 'TRIM', c, () => { this.zoomed = !this.zoomed; this.render(); });

      this.drawWaveform(WAVE_RECT, c);

      // The four knobs the reference keeps beside the waveform.
      const beside: ParamRow[] = [
        this.row('LEVEL', pad.level, 0, 100, false, levelLabel(pad.level), 'level'),
        this.row('PAN', pad.pan, -MAX_PAN, MAX_PAN, true, panLabel(pad.pan), 'pan'),
        this.tuneRow(pad),
        this.voiceRow('DECAY', pad, 'decay'),
      ];
      beside.forEach((row, index) => {
        const y = PARAMS.y + 19 + index * 13;
        this.pushText(PARAM_BAR_X, y + 2, row.label, c.textDim);
        this.meter(PARAM_BAR_X + 46, y, PARAM_BAR_W, row.value, row.min, row.max, row.signed, c);
        this.pushText(PARAM_BAR_X + 46 + PARAM_BAR_W + 4, y + 2, row.display, c.textPrimary);
        this.meterZone(PARAM_BAR_X + 46, y, PARAM_BAR_W, row.min, row.max, row.set);
      });
    } else {
      // Every other tab is four knobs, laid out in the same place the waveform and
      // its bars occupy, so switching tabs never moves the panel's own furniture.
      const knobs = this.tabKnobs(this.tab, pad, machine);
      knobs.forEach((row, index) => {
        // Two columns of two, so the panel's furniture never moves when a tab
        // changes — the same shelf the waveform sits on.
        const x = PARAM_BODY_X + (index % 2) * 250;
        const y = PARAMS.y + 21 + Math.floor(index / 2) * 18;
        this.pushText(x, y + 2, row.label, c.textDim);
        this.meter(x + 62, y, PARAM_BAR_W, row.value, row.min, row.max, row.signed, c);
        this.pushText(x + 62 + PARAM_BAR_W + 4, y + 2, row.display, c.textPrimary);
        this.meterZone(x + 62, y, PARAM_BAR_W, row.min, row.max, row.set);
      });
    }

    // The switch column. A pad has no reverse, one-shot, choke group or output in
    // this model, so the same four rows carry the real controls that fit: two
    // switches over two fields, at the reference's own size and alignment.
    const sw: { label: string; kind: 'toggle' | 'field'; on: boolean; text: string; press: () => void }[] = [
      { label: 'SWEEP', kind: 'toggle', on: pad.voice.sweep > 0, text: '', press: () => this.setVoice('sweep', pad.voice.sweep > 0 ? 0 : 60) },
      { label: 'THICK', kind: 'toggle', on: pad.voice.thick > 0, text: '', press: () => this.setVoice('thick', pad.voice.thick > 0 ? 0 : 50) },
      { label: 'VOICE', kind: 'field', on: false, text: clip(this.voiceName(pad), 10), press: () => this.cycleVoice(1) },
      { label: 'NOISE', kind: 'field', on: false, text: `${pad.voice.noise}%`, press: () => this.setVoice('noise', pad.voice.noise >= 100 ? 0 : pad.voice.noise + 25) },
    ];
    sw.forEach((row, index) => {
      const y = PARAMS.y + 19 + index * 13;
      this.pushText(SWITCH_X - 4, y + 2, row.label, c.textDim, 1);
      if (row.kind === 'toggle') {
        this.toggleBox({ x: SWITCH_X + 4, y: y + 1, width: 13, height: 11 }, row.on, c, row.press);
      } else {
        this.field({ x: SWITCH_X + 4, y, width: 54, height: 13 }, row.text, c, row.press);
      }
    });
  }

  /** The waveform preview: a decaying transient, drawn from the pad's own decay. */
  private drawWaveform(rect: Rect, c: UiColors): void {
    const g = this.frame;
    drawInset(g, rect, 1, c);
    const mid = rect.y + Math.floor(rect.height / 2);
    const inner = rect.height / 2 - 2;
    const pad = this.handlers.machine()?.pads[this.pad];
    const fall = 3 + (pad ? (100 - pad.voice.decay) / 100 * 5 : 4);
    const zoom = this.zoomed ? 2 : 1;
    const count = Math.floor((rect.width - 2) / zoom);
    let seed = 0x2f6e2b1;
    g.fillStyle(c.ooze, 0.85);
    for (let i = 0; i < count; i += 2) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const noise = seed / 0x7fffffff;
      const t = (i / count) * zoom;
      const env = Math.exp(-t * fall);
      const amp = Math.max(0.04, Math.min(1, env * (0.45 + 0.55 * noise)));
      const h = Math.max(1, Math.round(amp * inner));
      g.fillRect(rect.x + 2 + i * zoom, mid - h, 1, h * 2);
    }
    // A centre line, so the wave reads as sitting on an axis.
    g.fillStyle(c.stoneHi, 0.3);
    g.fillRect(rect.x + 2, mid, rect.width - 4, 1);
  }

  /** The machine's ORDER, in the sequencer's footer: which bar plays when. */
  private drawOrder(machine: DrumMachine, c: UiColors): void {
    const g = this.gridGfx;
    const y = ORDER_Y;
    const order = machine.order;
    this.pushText(SEQ_IN, y + 3, 'ORDER', c.textDim);
    const startX = SEQ_IN + 40;
    if (order.length === 0) {
      this.pushText(startX, y + 3, 'BAR 1 EVERYWHERE  ·  + SLOT STARTS AN ORDER', c.textDim);
    } else {
      order.slice(0, ORDER_MAX_SLOTS).forEach((bar, index) => {
        const x = startX + index * ORDER_SLOT_W;
        drawInset(g, { x, y, width: ORDER_SLOT_W - 3, height: 14 }, 1, c);
        if (bar === this.bar) {
          g.fillStyle(c.ward, 0.22);
          g.fillRect(x + 1, y + 1, ORDER_SLOT_W - 5, 12);
        }
        this.pushText(x + (ORDER_SLOT_W - 3) / 2, y + 3, `${bar}`, bar === this.bar ? c.ooze : c.textPrimary, 0.5);
        this.rowZone({ x, y, width: ORDER_SLOT_W - 3, height: 14 }, () => this.cycleOrderSlot(index, 1), (p) => this.cycleOrderSlot(index, p.rightButtonDown() ? -1 : 1));
      });
    }
    // The bar's own editors live here too, beside the slots they change: a bar
    // added is a copy of the last, which is what a variation starts as.
    if (machineBarCount(machine) > 1) this.miniButton({ x: SEQ_R - 192, y, width: 44, height: 14 }, '- BAR', c, () => this.shrinkBar());
    if (machineBarCount(machine) < MAX_MACHINE_BARS) this.miniButton({ x: SEQ_R - 144, y, width: 44, height: 14 }, '+ BAR', c, () => this.growBar());
    if (order.length > 0) this.miniButton({ x: SEQ_R - 96, y, width: 44, height: 14 }, '- SLOT', c, () => this.dropOrderSlot());
    if (order.length < ORDER_MAX_SLOTS) this.miniButton({ x: SEQ_R - 48, y, width: 44, height: 14 }, '+ SLOT', c, () => this.appendOrderSlot());
    // What the FORM does to the machine, said once at the row's end: the reorder
    // the sections ask for is visible here rather than only on the tracker.
    const beat = this.handlers.songBeat();
    if (beat.some((entry) => entry.fromForm)) {
      this.pushText(SEQ_R, y + 3, '▸ SECTION', c.ooze, 1);
    }
  }

  /** TRANSPORT, PATTERN and SHORTCUTS: the bottom row. */
  private drawBottomRow(machine: DrumMachine | null, c: UiColors): void {
    // The bar steppers sit between the pattern buttons, as the reference draws
    // them; the transport's three buttons are framework Buttons, already placed.
    this.stepper({ x: PATTERN.x + 8, y: PATTERN.y + 22, width: 84, height: 20 }, `${this.bar}/${machine ? machineBarCount(machine) : 1}`, c, () => this.nudgeBar(-1), () => this.nudgeBar(1));

    HINT_LINES.forEach((line, index) => {
      this.pushText(SHORTCUTS.x + 8, SHORTCUTS.y + 16 + index * 10, line, c.textDim, 0, 7);
    });
  }

  /** The playhead: the column the beat is passing through, handed in by the scene. */
  setPlayhead(step: number): void {
    if (step === this.playStep) return;
    this.playStep = step;
    this.drawPlayhead();
  }

  private drawPlayhead(): void {
    const c = activeColors();
    const g = this.playGfx;
    g.clear();
    if (this.playStep < 0 || this.gridRows <= 0) return;
    const column = this.playStep - this.gridWindow.first;
    if (column < 0 || column >= this.gridWindow.visible) return;
    const x = GRID_X + column * CELL_W;
    const h = this.gridRows * ROW_H;
    g.fillStyle(c.ward, 0.22);
    g.fillRect(x, GRID_TOP - 1, CELL_W_IN, h);
    g.fillStyle(c.ward, 0.55);
    g.fillRect(x, GRID_TOP - 1, 1, h);
    g.fillRect(x + CELL_W_IN - 1, GRID_TOP - 1, 1, h);
    g.fillStyle(c.ward, 0.9);
    g.fillRect(x, SEQ_COLHEAD_Y + 6, CELL_W_IN, 2);
  }

  // --- shared paint ---------------------------------------------------------

  /**
   * One step's hit: a raised key, not a flat square.
   *
   * An ink frame, the pad's own colour at the hit's shade, a pale top sheen and an
   * ink foot give it dimension, so a grid of these reads as a picture of a beat
   * rather than a wash of blocks.
   */
  private hitKey(x: number, y: number, w: number, h: number, velocity: number, colour: number, c: UiColors): void {
    const g = this.gridGfx;
    const shade = hitShade(velocity);
    g.fillStyle(c.ink, 0.92);
    g.fillRect(x, y, w, h);
    g.fillStyle(colour, shade);
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle(c.textPrimary, 0.28);
    g.fillRect(x + 1, y + 1, w - 2, 1);
    g.fillStyle(c.ink, 0.55);
    g.fillRect(x + 1, y + h - 2, w - 2, 1);
  }

  /** A small outlined key with a glyph, for the M and S columns. */
  private keyBox(r: Rect, glyph: string, lit: boolean, c: UiColors, press: () => void): void {
    const g = this.gridGfx;
    drawInset(g, r, 1, c);
    if (lit) {
      g.fillStyle(c.ooze, 0.75);
      g.fillRect(r.x + 1, r.y + 1, r.width - 2, r.height - 2);
    } else {
      g.fillStyle(c.stoneHi, 0.35);
      g.fillRect(r.x + 1, r.y + 1, r.width - 2, 1);
    }
    this.pushText(r.x + r.width / 2, r.y + 2, glyph, lit ? c.ink : c.textPrimary, 0.5);
    this.rowZone({ x: r.x, y: r.y, width: r.width, height: r.height }, press);
  }

  /** A checkbox with a bevel, the page's one boolean shape. */
  private toggleBox(r: Rect, on: boolean, c: UiColors, press: () => void): void {
    const g = this.frame;
    drawInset(g, r, 1, c);
    if (on) {
      g.fillStyle(c.ooze, 0.9);
      g.fillRect(r.x + 2, r.y + 2, r.width - 4, r.height - 4);
    }
    this.rowZone({ x: r.x, y: r.y, width: r.width, height: r.height }, press);
  }

  /** A dropdown: a value with a caret, opening nothing yet but pressing something. */
  private field(r: Rect, text: string, c: UiColors, press: () => void): void {
    const g = this.frame;
    drawInset(g, r, 1, c);
    this.pushText(r.x + 4, r.y + 3, clip(text, Math.max(4, Math.floor(r.width / 6) - 2)), c.textPrimary);
    // The caret, drawn as a small solid triangle in the field's right corner.
    const cx = r.x + r.width - 8;
    const cy = r.y + Math.floor(r.height / 2) - 1;
    g.fillStyle(c.textDim, 0.95);
    for (let i = 0; i < 4; i++) g.fillRect(cx + i, cy + Math.abs(2 - i) - 1, 1, 1);
    this.rowZone({ x: r.x, y: r.y, width: r.width, height: r.height }, press);
  }

  /** A small outlined button: the reference's most common control. */
  private miniButton(r: Rect, label: string, c: UiColors, press: () => void): void {
    const g = this.gridGfx;
    drawInset(g, r, 1, c);
    g.fillStyle(c.stoneHi, 0.4);
    g.fillRect(r.x + 1, r.y + 1, r.width - 2, 1);
    this.pushText(r.x + Math.floor(r.width / 2), r.y + Math.floor((r.height - 8) / 2) + 1, label, c.textPrimary, 0.5);
    this.rowZone({ x: r.x, y: r.y, width: r.width, height: r.height }, press);
  }

  /** `-  value  +`, the app's stepper shape, in one compact box. */
  private stepper(r: { x: number; y: number; width: number; height?: number }, value: string, c: UiColors, down: () => void, up: () => void): void {
    const g = this.frame;
    const h = r.height ?? 15;
    const rect: Rect = { x: r.x, y: r.y, width: r.width, height: h };
    drawInset(g, rect, 1, c);
    const half = Math.floor(r.width / 2);
    g.fillStyle(c.stoneHi, 0.3);
    g.fillRect(r.x + half, r.y + 1, 1, h - 2);
    const ty = r.y + Math.floor((h - 8) / 2) + 1;
    this.pushText(r.x + Math.floor(half / 2), ty, '<', c.textPrimary, 0.5);
    this.pushText(r.x + half + Math.floor((r.width - half) / 2), ty, value, c.textPrimary, 0.5);
    this.rowZone({ x: r.x, y: r.y, width: half, height: h }, down);
    this.rowZone({ x: r.x + half, y: r.y, width: r.width - half, height: h }, up);
  }

  /**
   * One line of copy, on the layer above every panel.
   *
   * POOLED: the object is reused from the last render and only the fields that
   * actually changed are written. That matters because `uiText` rasterizes a Text
   * at 4x resolution and one render builds over a hundred of them — so creating
   * them afresh each time cost hundreds of milliseconds per paint. `setText` is
   * called only when the string changes, and colour/size/origin/position only when
   * they move, so an unchanged label costs nothing at all.
   */
  private pushText(x: number, y: number, text: string, color: number, anchorX = 0, size = 8): void {
    let obj = this.rowTexts[this.textCount];
    if (!obj) {
      obj = uiText(this.scene, x, y, text, { size, color, origin: { x: anchorX, y: 0 } });
      this.layer.add(obj);
      this.rowTexts.push(obj);
      this.textState.push({ text, color, size, anchorX, x, y });
    } else {
      const state = this.textState[this.textCount]!;
      if (state.text !== text) { obj.setText(text); state.text = text; }
      if (state.color !== color) { obj.setColor(intToCss(color)); state.color = color; }
      if (state.size !== size) { obj.setFontSize(uiPx(size)); state.size = size; }
      if (state.anchorX !== anchorX) { obj.setOrigin(anchorX, 0); state.anchorX = anchorX; }
      if (state.x !== x || state.y !== y) { obj.setPosition(Math.round(x), Math.round(y)); state.x = x; state.y = y; }
    }
    obj.setVisible(this.opened);
    this.textCount += 1;
  }

  /**
   * A click surface, POOLED like the text.
   *
   * The zone keeps its place on the layer and is re-positioned, re-sized only when
   * the layout changes (which is when its hit area is re-armed), and re-bound to
   * this render's handler.
   */
  private rowZone(r: Rect, press: () => void, pointerDown?: (p: Phaser.Input.Pointer) => void): void {
    let entry = this.rowZones[this.zoneCount];
    if (!entry) {
      const zone = this.scene.add.zone(r.x, r.y, r.width, r.height).setOrigin(0, 0);
      this.layer.add(zone);
      zone.setInteractive({ useHandCursor: true });
      entry = { zone, press, pointerDown, width: r.width, height: r.height };
      this.rowZones.push(entry);
    } else {
      entry.press = press;
      entry.pointerDown = pointerDown;
      entry.zone.setPosition(r.x, r.y);
      if (entry.width !== r.width || entry.height !== r.height) {
        entry.width = r.width;
        entry.height = r.height;
        entry.zone.setSize(r.width, r.height);
        entry.zone.setInteractive({ useHandCursor: true });
      }
    }
    const current = entry;
    current.zone.removeAllListeners('pointerdown');
    current.zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation?.();
      if (current.pointerDown) current.pointerDown(p);
      else current.press();
    });
    current.zone.setVisible(this.opened);
    this.zoneCount += 1;
  }

  /** A zone over a groove: where along it the click landed IS the value. */
  private meterZone(x: number, y: number, width: number, min: number, max: number, set: (value: number) => void): void {
    this.rowZone({ x, y: y - 2, width, height: 13 }, () => { /* set below */ }, (p) => {
      const inner = width - 2;
      const at = Math.max(0, Math.min(inner, p.x - x - 1));
      const value = Math.round(min + (at / inner) * (max - min));
      set(value);
      this.render();
    });
  }

  /** One zone across a pad's row of steps, turning a click into a column. */
  private cellZone(padIndex: number, y: number, first: number, visible: number): void {
    this.rowZone({ x: GRID_X, y, width: visible * CELL_W, height: ROW_H }, () => { /* set below */ }, (p) => {
      const column = Math.floor((p.x - GRID_X) / CELL_W);
      const step = stepAtColumn({ first, visible }, column);
      if (step === null) return;
      this.pad = padIndex;
      this.step = step;
      if (p.rightButtonDown()) {
        this.setCellVelocity(nextHitVelocity(this.hitAt(step)));
        return;
      }
      this.toggleCell();
    });
  }

  // --- parameter rows -------------------------------------------------------

  private row(label: string, value: number, min: number, max: number, signed: boolean, display: string, id: PadMixId): ParamRow {
    return {
      label, value, min, max, signed, display,
      set: (next) => { this.status = this.handlers.setPadMix(this.machinePadNumber(), id, next); },
    };
  }

  private voiceRow(label: string, pad: DrumPad, id: VoiceParamId): ParamRow {
    const value = pad.voice[id];
    return {
      label, value, min: 0, max: 100, signed: false, display: `${value}%`,
      set: (next) => { this.status = this.handlers.setPadVoice(this.machinePadNumber(), id, clampParam(next)); },
    };
  }

  /**
   * TUNE, as its own row.
   *
   * A pad's tune is a MIDI note, not a knob, so its groove spans the keyboard
   * rather than 0..100 and its read-out is the note name a player thinks in.
   */
  private tuneRow(pad: DrumPad): ParamRow {
    return {
      label: 'TUNE', value: pad.pitch, min: MIDI_MIN, max: MIDI_MAX, signed: false,
      display: midiToNoteName(pad.pitch),
      set: (next) => { this.status = this.handlers.setPadPitch(this.machinePadNumber(), next); },
    };
  }

  private machineRow(label: string, machine: DrumMachine, id: 'verb' | 'echo'): ParamRow {
    const value = machine[id];
    return {
      label, value, min: 0, max: 100, signed: false, display: levelLabel(value),
      set: (next) => { this.status = this.handlers.setMix(id, next); },
    };
  }

  /** The tab's four knobs, each a real parameter of the selected pad. */
  private tabKnobs(tab: ParamTab, pad: DrumPad, machine: DrumMachine): ParamRow[] {
    switch (tab) {
      case 'amp':
        return [
          this.row('LEVEL', pad.level, 0, 100, false, levelLabel(pad.level), 'level'),
          this.row('PAN', pad.pan, -MAX_PAN, MAX_PAN, true, panLabel(pad.pan), 'pan'),
          this.voiceRow('DECAY', pad, 'decay'),
          this.voiceRow('RING', pad, 'ring'),
        ];
      case 'pitch':
        return [
          this.tuneRow(pad),
          this.voiceRow('THICK', pad, 'thick'),
          this.voiceRow('DUTY', pad, 'duty'),
          this.machineRow('ECHO SEND', machine, 'echo'),
        ];
      case 'filter':
        return [
          this.voiceRow('FILTER', pad, 'bright'),
          this.voiceRow('SWEEP', pad, 'sweep'),
          this.voiceRow('DUTY', pad, 'duty'),
          this.voiceRow('NOISE', pad, 'noise'),
        ];
      case 'envelope':
        return [
          this.voiceRow('ATTACK', pad, 'attack'),
          this.voiceRow('DECAY', pad, 'decay'),
          this.voiceRow('RING', pad, 'ring'),
          this.voiceRow('RELEASE', pad, 'release'),
        ];
      case 'fx':
        return [
          this.voiceRow('THICK', pad, 'thick'),
          this.voiceRow('NOISE', pad, 'noise'),
          this.machineRow('VERB SEND', machine, 'verb'),
          this.machineRow('ECHO SEND', machine, 'echo'),
        ];
      default:
        return [];
    }
  }

  private voiceName(pad: DrumPad): string {
    // The framework has no exported preset-name helper for a voice object, so this
    // reads the wave the pad actually sounds, which is the honest label here.
    return pad.voice.wave.toUpperCase();
  }

  private machinePadNumber(): number { return this.pad + 1; }

  private setVoice(id: VoiceParamId, value: number): void {
    this.status = this.handlers.setPadVoice(this.machinePadNumber(), id, clampParam(value));
    this.render();
  }

  /**
   * Walk the selected pad's sample reference.
   *
   * A pad's recording is set by a script line rather than browsed in this build —
   * the app's bank is written by the song, not shipped — so the arrows move the
   * pad's WAVE instead, which is the part of "which sound is this" a hand can hear
   * change. The status line says exactly that.
   */
  private cycleSample(): void {
    this.status = 'A PAD’S RECORDING IS SET BY A SCRIPT LINE:  pad 2 sample KICK.  THE ARROWS MOVE ITS VOICE.';
    this.cycleVoice(1);
  }

  private cycleOrderSlot(index: number, delta: number): void {
    const machine = this.handlers.machine();
    if (!machine) return;
    const count = machineBarCount(machine);
    const order = machine.order.slice();
    const current = order[index] ?? 1;
    let next = current + delta;
    if (next > count) next = 1;
    if (next < 1) next = count;
    order[index] = next;
    this.status = this.handlers.setOrder(order);
    this.render();
  }

  private appendOrderSlot(): void {
    const machine = this.handlers.machine();
    if (!machine) return;
    const order = machine.order.slice();
    order.push(order.length > 0 ? order[order.length - 1] ?? 1 : 1);
    this.status = this.handlers.setOrder(order);
    this.render();
  }

  private dropOrderSlot(): void {
    const machine = this.handlers.machine();
    if (!machine) return;
    const order = machine.order.slice();
    order.pop();
    this.status = this.handlers.setOrder(order);
    this.render();
  }

  destroy(): void {
    this.unsubscribe();
    for (const text of this.rowTexts) text.destroy();
    for (const entry of this.staticCopy) entry.obj.destroy();
    for (const button of this.buttons) button.destroy();
    this.back.destroy();
    this.frame.destroy();
    this.gridGfx.destroy();
    this.playGfx.destroy();
    this.layer.destroy();
    this.curtain.destroy();
  }
}

/** Clip a name to a character budget, so a row stays one line. */
function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)) + '…';
}

/** The colour a pad wears, from its place in the kit, for its chip and its hits. */
function padColour(index: number, c: UiColors): number {
  const palette = [c.textGreen, c.textDim, c.oozeDim, c.danger, c.ward, c.ooze, c.stoneHi, c.textPrimary];
  return palette[index % palette.length] ?? c.textGreen;
}

/** The colour a piece of static copy wears. */
function colorForRole(role: TextRole, c: UiColors): number {
  switch (role) {
    case 'heading': return c.ooze;
    case 'accent': return c.ward;
    case 'dim': return c.textDim;
    default: return c.textPrimary;
  }
}
