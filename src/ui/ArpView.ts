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

import {
  ARP_MODES,
  type ArpDestination,
  type ArpMode,
  type ArpRunResult,
  type ArpSettings,
  type ArpStep,
} from '../model/arp';
import { ARP_DIRECTIONS, type ArpDirection } from '../model/chord';
import { midiToNoteName } from '../model/notes';
import {
  ARP_DIAL_LABELS,
  ARP_HINT,
  type ArpDial,
  arpDestinationLine,
  arpReplaceNote,
  arpSummary,
  chordCaption,
  dialCaption,
  dialText,
  fitText,
  formatRow,
  hearRunLabel,
  rollBlock,
  rollGrid,
  rollStepCenter,
  sliderKnobX,
  sliderValueAt,
  type RollRect,
} from './arpBoard';

/**
 * ArpView — the ARP page, the place a run is DIALED, HEARD and written.
 *
 * ── The shape ────────────────────────────────────────────────────────────────
 * A status strip with the page's one session switch, then two columns: `SHAPE THE
 * RUN` down the left (direction, octaves, rate, intensity, source mode, and the
 * two buttons under them), and on the right the `PREVIEW` — a real pitch-versus-
 * step chart of the run — over `WRITE TO PATTERN`, which names its destination
 * before it is pressed.
 *
 * ── It holds no dials and no run ─────────────────────────────────────────────
 * Every dial, the destination and the RUN come back from the scene on each paint,
 * and every change goes back through a handler, so the page's own state is only
 * which control is selected. The run is the scene's single `arpRun` call — the
 * same one the audition and the write read — so the picture cannot promise a run
 * the button would not commit. The dials are SONG data (they round-trip in the
 * file and the script), a nudge is an undoable edit, and `WRITE RUN` is ONE undo
 * step for the run's own cells.
 */

export interface ArpHandlers {
  onOpenChange?: (open: boolean) => void;
  /** The dials the page is showing (the song's, or the defaults). */
  settings: () => ArpSettings;
  /** Nudge one dial. `perGesture` coalesces a held key into a single undo step. */
  setDial: (dial: ArpDial, step: number, perGesture: boolean) => void;
  /**
   * Set one NUMBER dial to an absolute value: the INTENSITY slider dragged, or an
   * OCTAVES button pressed. `perGesture` coalesces a whole drag into one undo step.
   */
  setDialValue: (dial: ArpDial, value: number, perGesture: boolean) => void;
  /** Choose one WORD dial outright — a DIRECTION or SOURCE MODE button. */
  choose: (dial: 'direction' | 'mode', word: ArpDirection | ArpMode) => void;
  /**
   * The run the dials describe, for the current destination.
   *
   * ONE call answers the preview, `HEAR RUN` and `WRITE RUN` in the scene, so the
   * page draws a run it would also sound and commit. `ok: false` carries the
   * reason there is no run — an empty cell, or a song with no progression — rather
   * than an empty run, because those are different things to tell a person.
   */
  run: () => ArpRunResult;
  /** Where a write would land: the pattern's index, the channel and the start row. */
  destination: () => ArpDestinationPoint;
  /** Move the destination: `pattern`, `track` or `row`, by `step`. */
  select: (part: ArpPart, step: number) => void;
  /** How many patterns the song holds. */
  patternCount: () => number;
  /** The song's channel names, in order, for the CHANNEL selector. */
  channelNames: () => string[];
  /** How many steps the destination pattern has. */
  rows: () => number;
  /** Commit the run into the destination. ONE undo step, and only its cells. */
  write: () => void;
  /** Hear the run through the destination channel, spaced by `rate`. */
  audition: () => void;
  /** Stop a running audition: what every change that would outdate it does first. */
  stopAudition: () => void;
  /** Whether a run is echoing right now, so the button can say STOP. */
  auditioning: () => boolean;
  /**
   * Hear the SOURCE chord as a chord — every tone at once, through the
   * destination channel.
   *
   * The run walks the chord one note at a time; this is the other half of the
   * question, and the one a person asks first, because a run you cannot recognise
   * is a run you cannot tune. It is deliberately NOT the echo: it fires and is
   * over, so pressing it never turns `HEAR RUN` into `STOP`.
   */
  hearChord: () => void;
  /** Hear one tone of the source chord, from its own chip. */
  hearNote: (midi: number) => void;
  /**
   * Whether the page auditions the run AS THE DIALS MOVE — `arp hear on|off`.
   * It is the scene's session state, not the page's, so a script can turn it on
   * and leave the page listening.
   */
  hear: () => boolean;
  /** Turn AUTO HEAR over, from the page's own switch. */
  toggleHear: () => void;
  /** Put every dial back to a fresh page's. ONE undo step. Writes no notes. */
  reset: () => void;
  close: () => void;
}

/** The three parts of the destination the page's selectors move. */
export type ArpPart = 'pattern' | 'track' | 'row';

/** Where the page is aiming a write, as the scene's own cursor. */
export interface ArpDestinationPoint {
  /** The pattern's index in the song. */
  pattern: number;
  /** The channel, 0-based. */
  track: number;
  /** The start row. */
  startRow: number;
}

/** Everything the arrows can land on, in the order they walk. */
export type ArpControl =
  | { kind: 'dial'; dial: ArpDial }
  | { kind: 'select'; part: ArpPart }
  | { kind: 'hear' }
  | { kind: 'reset' }
  | { kind: 'write' };

/** The walk the up/down arrows make, top to bottom then back to the start. */
export const ARP_CONTROLS: readonly ArpControl[] = [
  { kind: 'dial', dial: 'direction' },
  { kind: 'dial', dial: 'octaves' },
  { kind: 'dial', dial: 'rate' },
  { kind: 'dial', dial: 'gate' },
  { kind: 'dial', dial: 'mode' },
  { kind: 'select', part: 'pattern' },
  { kind: 'select', part: 'track' },
  { kind: 'select', part: 'row' },
  { kind: 'hear' },
  { kind: 'reset' },
  { kind: 'write' },
];

/** A control as one comparable word, so the view can find the one it is on. */
export function controlId(control: ArpControl): string {
  return control.kind === 'dial' ? `dial:${control.dial}` : control.kind === 'select' ? `select:${control.part}` : control.kind;
}

/** Which control a step from `control` lands on, wrapping at both ends. */
export function moveControl(control: ArpControl, step: number): ArpControl {
  const at = ARP_CONTROLS.findIndex((one) => controlId(one) === controlId(control));
  const count = ARP_CONTROLS.length;
  const index = ((Math.max(0, at) + step) % count + count) % count;
  return ARP_CONTROLS[index];
}

const CANVAS_W = 720;
const PAGE_TOP = 39;
const PAGE_BOTTOM = 341;

const STATUS: Rect = { x: 8, y: 41, width: 704, height: 17 };
const LEFT: Rect = { x: 8, y: 60, width: 224, height: 252 };
const PREVIEW: Rect = { x: 238, y: 60, width: 474, height: 208 };
const WRITE: Rect = { x: 238, y: 272, width: 474, height: 40 };
const FOOT: Rect = { x: 8, y: 316, width: 704, height: 22 };

/** The left column's usable edges. */
const LX = LEFT.x + 7;
const LR = LEFT.x + LEFT.width - 7;
const LW = LR - LX;

/** The right column's usable edges. */
const RX = PREVIEW.x + 6;
const RR = PREVIEW.x + PREVIEW.width - 6;
const RW = RR - RX;

// --- SHAPE THE RUN, row by row ---------------------------------------------

const TITLE_Y = LEFT.y + 6;
const DIR_LABEL_Y = LEFT.y + 18;
const DIR_BTN_Y = LEFT.y + 28;
const DIR_BTN_H = 17;
const DIR_CAPTION_Y = LEFT.y + 48;
const OCT_LABEL_Y = LEFT.y + 58;
const OCT_BTN_Y = LEFT.y + 68;
const OCT_CAPTION_Y = LEFT.y + 88;
const RATE_LABEL_Y = LEFT.y + 98;
const RATE_CTL_Y = LEFT.y + 108;
const RATE_CAPTION_Y = LEFT.y + 128;
const GATE_LABEL_Y = LEFT.y + 138;
const GATE_TRACK_Y = LEFT.y + 149;
const GATE_TRACK_H = 8;
const GATE_CAPTION_Y = LEFT.y + 161;
const MODE_LABEL_Y = LEFT.y + 171;
const MODE_BTN_Y = LEFT.y + 181;
const MODE_CAPTION_Y = LEFT.y + 201;

/**
 * The `TRY IT FIRST` panel: its box, its two buttons, and the words beside them.
 *
 * The caption is wrapped into two short lines rather than one long one, because a
 * single sentence at this width would run under the buttons — the one thing a
 * fixed panel must not do.
 */
const TRY: Rect = { x: LX, y: LEFT.y + 214, width: LW, height: LEFT.y + LEFT.height - (LEFT.y + 214) - 6 };
const HEAR_BTN: Rect = { x: LX + 96, y: TRY.y + 7, width: 70, height: 20 };
const RESET_BTN: Rect = { x: LX + 170, y: TRY.y + 7, width: 40, height: 20 };

/** One button of a segmented row: `count` of them across the column's width. */
function segment(i: number, count: number, y: number, height: number): Rect {
  const gap = 5;
  const width = Math.floor((LW - gap * (count - 1)) / count);
  return { x: LX + i * (width + gap), y, width, height };
}

const DIR_BUTTONS: readonly Rect[] = ARP_DIRECTIONS.map((_one, i) => segment(i, ARP_DIRECTIONS.length, DIR_BTN_Y, DIR_BTN_H));
const OCTAVE_BUTTONS: readonly Rect[] = [0, 1, 2, 3].map((i) => segment(i, 4, OCT_BTN_Y, DIR_BTN_H));
const MODE_BUTTONS: readonly Rect[] = ARP_MODES.map((_one, i) => segment(i, ARP_MODES.length, MODE_BTN_Y, DIR_BTN_H));

/** The RATE stepper: `‹` `value` `›`, right-aligned in the column. */
const RATE_STEP_W = 18;
const RATE_BOX: Rect = { x: LR - RATE_STEP_W * 2 - 50, y: RATE_CTL_Y, width: 50, height: 17 };
const RATE_MINUS: Rect = { x: RATE_BOX.x - RATE_STEP_W - 2, y: RATE_CTL_Y, width: RATE_STEP_W, height: 17 };
const RATE_PLUS: Rect = { x: RATE_BOX.x + RATE_BOX.width + 2, y: RATE_CTL_Y, width: RATE_STEP_W, height: 17 };

/** The INTENSITY track and its knob. */
const GATE_TRACK: RollRect = { x: LX, y: GATE_TRACK_Y, width: 150, height: GATE_TRACK_H };
const GATE_KNOB = 11;

// --- PREVIEW ---------------------------------------------------------------

const PREVIEW_TITLE_Y = PREVIEW.y + 6;
/** The destination strip: PATTERN / CHANNEL / START ROW, each a label and a stepper. */
const SEL_Y = PREVIEW.y + 16;
const SEL_H = 20;
const SEL_STEP_W = 14;
const SEL_BOX_H = 15;
/** Label, `‹`, box, `›` — measured left to right so the three cannot overlap. */
const SELECTORS = ((): { part: ArpPart; label: string; labelX: number; minus: Rect; box: Rect; plus: Rect }[] => {
  const defs: { part: ArpPart; label: string; labelW: number; boxW: number }[] = [
    { part: 'pattern', label: 'PATTERN', labelW: 44, boxW: 30 },
    { part: 'track', label: 'CHANNEL', labelW: 48, boxW: 78 },
    { part: 'row', label: 'START ROW', labelW: 58, boxW: 30 },
  ];
  let x = RX;
  return defs.map((def) => {
    const labelX = x;
    const minus: Rect = { x: labelX + def.labelW + 2, y: SEL_Y + 2, width: SEL_STEP_W, height: SEL_BOX_H };
    const box: Rect = { x: minus.x + SEL_STEP_W + 3, y: SEL_Y + 2, width: def.boxW, height: SEL_BOX_H };
    const plus: Rect = { x: box.x + def.boxW + 3, y: SEL_Y + 2, width: SEL_STEP_W, height: SEL_BOX_H };
    x = plus.x + SEL_STEP_W + 10;
    return { part: def.part, label: def.label, labelX, minus, box, plus };
  });
})();

/**
 * The chord readout. Its x leaves room for the LONGER of the two captions
 * (`CHORD FROM THE PROGRESSION:`), and the caption is fitted to that room as well,
 * so a longer wording can never run into the chord it is describing.
 */
const CHORD_Y = SEL_Y + SEL_H + 4;
const CHORD_LABEL_W = 108;
const CHORD_BOX: Rect = { x: RX + CHORD_LABEL_W, y: CHORD_Y, width: 34, height: 14 };
const CHORD_CHIP_W = 30;
const CHORD_CHIP_GAP = 4;
const CHORD_CHIPS_X = CHORD_BOX.x + CHORD_BOX.width + 8;
const CHORD_CHIP_Y = CHORD_Y - 1;

const RULER_Y = CHORD_Y + 18;
const ROLL_AXIS_W = 30;
const ROLL: RollRect = {
  x: RX + ROLL_AXIS_W + 2,
  y: RULER_Y + 12,
  width: RW - ROLL_AXIS_W - 2,
  height: 88,
};
const AXIS: Rect = { x: RX, y: ROLL.y, width: ROLL_AXIS_W, height: ROLL.height };

const GENERATED_LABEL_Y = ROLL.y + ROLL.height + 5;
const GENERATED_Y = GENERATED_LABEL_Y + 9;
const GENERATED_H = 20;
/** Six readouts across the panel, so a full bar of sixteenths is one row of names. */
const GENERATED_VISIBLE = 6;
const GENERATED_W = Math.floor((RW - 5 * 4) / GENERATED_VISIBLE);
const SUMMARY_Y = GENERATED_Y + GENERATED_H + 4;

// --- WRITE TO PATTERN ------------------------------------------------------

const WRITE_TITLE_Y = WRITE.y + 5;
const WRITE_DEST_Y = WRITE.y + 18;
const WRITE_NOTE_Y = WRITE.y + 28;
const PREVIEW_BADGE: Rect = { x: WRITE.x + 262, y: WRITE.y + 4, width: 62, height: 14 };
const WRITE_BTN: Rect = { x: WRITE.x + 332, y: WRITE.y + 3, width: 84, height: 20 };
const UNDO_X = WRITE.x + WRITE.width - 6;

// --- the status strip's AUTO HEAR switch -----------------------------------

const HEAR_LABEL_X = STATUS.x + STATUS.width - 104;
const HEAR_SWITCH: Rect = { x: STATUS.x + STATUS.width - 6 - 40, y: STATUS.y + 2, width: 40, height: 13 };

const DEPTH_BACK = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_MARK = 972;
const DEPTH_STATE = 976;
const DEPTH_HOVER = 977;
const DEPTH_TEXT = 980;

export class ArpView {
  private readonly scene: Phaser.Scene;
  private readonly handlers: ArpHandlers;

  private readonly back: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly stateGfx: Phaser.GameObjects.Graphics;
  private readonly hoverGfx: Phaser.GameObjects.Graphics;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly curtain: Phaser.GameObjects.Zone;

  private readonly statusText: Phaser.GameObjects.Text;

  private texts: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  /**
   * Undo functions for listeners that outlive one paint.
   *
   * The slider drag listens on the SCENE's input rather than on a zone, because a
   * drag that had to stay inside the track would be a row of buttons with extra
   * steps. A listener like that has to be taken off again on every repaint, or the
   * page would leave one behind each time it drew.
   */
  private cleanups: (() => void)[] = [];

  private control: ArpControl = { kind: 'dial', dial: 'direction' };
  private status = '';
  private hover: string | null = null;
  private hoverRect: Rect | null = null;
  /** A slider drag runs the whole width from one press, so it is either on or off. */
  private draggingGate = false;

  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: ArpHandlers) {
    this.scene = scene;
    this.handlers = handlers;

    this.back = scene.add.graphics().setDepth(DEPTH_BACK);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.marks = scene.add.graphics().setDepth(DEPTH_MARK);
    this.stateGfx = scene.add.graphics().setDepth(DEPTH_STATE);
    this.hoverGfx = scene.add.graphics().setDepth(DEPTH_HOVER);
    this.layer = scene.add.container(0, 0).setDepth(DEPTH_TEXT);

    this.statusText = uiText(scene, STATUS.x + 6, STATUS.y + 4, '', { size: 8, color: activeColors().textPrimary });
    this.statusText.setDepth(DEPTH_TEXT + 1);

    this.curtain = scene.add.zone(0, PAGE_TOP, CANVAS_W, PAGE_BOTTOM - PAGE_TOP).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);

    this.unsubscribe = onThemeChanged(() => { if (this.opened) this.render(); });
    this.setOpen(false);
  }

  get isOpen(): boolean { return this.opened; }

  show(): void {
    this.status = '';
    this.setOpen(true);
    this.render();
  }

  hide(): void {
    this.setOpen(false);
  }

  private setOpen(open: boolean): void {
    const changed = open !== this.opened;
    this.opened = open;
    for (const g of [this.back, this.frame, this.marks, this.stateGfx, this.hoverGfx]) g.setVisible(open);
    this.layer.setVisible(open);
    this.curtain.setVisible(open);
    this.statusText.setVisible(open);
    if (!open) this.clearDynamic();
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- keyboard -------------------------------------------------------------

  /**
   * `UP`/`DOWN` pick a CONTROL  ·  `[`/`]` change it  ·  `ENTER` hear  ·  `W` write.
   *
   * The arrows walk every control on the page — the five dials, the three
   * selectors and the two buttons — rather than the dials alone, because the
   * selectors are how a person aims the run somewhere else and leaving them to the
   * mouse would make the keyboard a second-class way to use the page.
   */
  handleKey(e: KeyboardEvent): void {
    switch (e.code) {
      case 'Escape':
        e.preventDefault();
        this.handlers.close();
        return;
      case 'ArrowUp':
        e.preventDefault();
        this.pick(-1);
        return;
      case 'ArrowDown':
        e.preventDefault();
        this.pick(1);
        return;
      case 'BracketLeft':
        e.preventDefault();
        this.change(-1);
        return;
      case 'BracketRight':
        e.preventDefault();
        this.change(1);
        return;
      case 'Enter': case 'NumpadEnter':
        e.preventDefault();
        this.handlers.audition();
        return;
      case 'KeyW':
        e.preventDefault();
        this.handlers.write();
        return;
      default:
    }
  }

  /** Move the selection, and re-state it so the strip always says where you are. */
  private pick(step: number): void {
    this.control = moveControl(this.control, step);
    this.status = this.controlLabel();
    this.render();
  }

  /** `[` / `]`: change whichever control is selected, in the way that control takes. */
  private change(step: number): void {
    if (this.control.kind === 'dial') {
      const dial = this.control.dial;
      this.handlers.setDial(dial, step, false);
      if (this.handlers.hear()) this.handlers.audition();
      this.status = `${ARP_DIAL_LABELS[dial]}  ${dialText(this.handlers.settings(), dial)}`;
    } else if (this.control.kind === 'select') {
      this.handlers.select(this.control.part, step);
      this.status = this.controlLabel();
    } else if (this.control.kind === 'hear') {
      this.handlers.toggleHear();
      this.status = this.controlLabel();
    }
    this.render();
  }

  private controlLabel(): string {
    if (this.control.kind === 'dial') {
      return `${ARP_DIAL_LABELS[this.control.dial]}  ${dialText(this.handlers.settings(), this.control.dial)}`;
    }
    if (this.control.kind === 'select') {
      const d = this.handlers.destination();
      const value = this.control.part === 'pattern' ? String(d.pattern + 1)
        : this.control.part === 'track' ? (this.handlers.channelNames()[d.track] ?? String(d.track + 1))
          : formatRow(d.startRow);
      return `${this.control.part === 'row' ? 'START ROW' : this.control.part === 'track' ? 'CHANNEL' : 'PATTERN'}  ${value}`;
    }
    if (this.control.kind === 'hear') return `AUTO HEAR  ${this.handlers.hear() ? 'ON' : 'OFF'}`;
    if (this.control.kind === 'reset') return 'RESET';
    return 'WRITE RUN';
  }

  private isSelected(id: string): boolean {
    return controlId(this.control) === id;
  }

  // --- paint ----------------------------------------------------------------

  render(): void {
    const c = activeColors();
    this.frame.clear();
    this.clearDynamic();

    drawPanel(this.frame, STATUS, 1, c);
    drawPanel(this.frame, LEFT, 1, c);
    drawPanel(this.frame, PREVIEW, 1, c);
    drawPanel(this.frame, WRITE, 1, c);
    drawPanel(this.frame, FOOT, 1, c);

    const settings = this.handlers.settings();
    this.statusText.setText(this.status === '' ? 'ARP  \u00b7  TURN A CHORD INTO A RUN' : `ARP  \u00b7  ${this.status}`);
    this.statusText.setColor(css(c.textPrimary));

    this.hearSwitch();
    this.shapePanel(settings);
    this.previewPanel(settings);
    this.writePanel();

    this.pushText(FOOT.x + 6, FOOT.y + 8, fitText(ARP_HINT, FOOT.width - 130, 8), c.textDim, 8);
    const on = this.handlers.hear();
    this.pushText(FOOT.x + FOOT.width - 6, FOOT.y + 8, on ? 'AUTO HEAR ON' : 'AUTO HEAR OFF', on ? c.ward : c.textDim, 8, 1);
  }

  /** The one session switch the strip carries, as a clickable toggle. */
  private hearSwitch(): void {
    const c = activeColors();
    const on = this.handlers.hear();
    this.pushText(HEAR_LABEL_X, STATUS.y + 5, 'AUTO HEAR', on ? c.ward : c.textDim, 8);
    this.pushText(HEAR_SWITCH.x + HEAR_SWITCH.width / 2, HEAR_SWITCH.y + 3, on ? 'ON' : 'OFF', on ? c.textPrimary : c.textDim, 8, 0.5);
    this.pushText(HEAR_LABEL_X - 8, STATUS.y + 5, '', c.textDim, 8);
    this.ring(HEAR_SWITCH, this.isSelected('hear'));
    this.hit('hear', HEAR_SWITCH, () => { this.control = { kind: 'hear' }; this.status = this.controlLabel(); this.handlers.toggleHear(); this.render(); });
  }

  // --- SHAPE THE RUN --------------------------------------------------------

  private shapePanel(settings: ArpSettings): void {
    const c = activeColors();
    this.pushText(LX, TITLE_Y, 'SHAPE THE RUN', c.textPrimary, 8);

    // DIRECTION — three buttons, one per word, so the choice is visible at once.
    this.pushText(LX, DIR_LABEL_Y, ARP_DIAL_LABELS.direction, this.rowColor('dial:direction'), 8);
    ARP_DIRECTIONS.forEach((direction, i) => {
      this.button(`dir:${direction}`, DIR_BUTTONS[i], direction.toUpperCase(), settings.direction === direction, 'dial:direction', () => {
        this.control = { kind: 'dial', dial: 'direction' };
        this.handlers.choose('direction', direction);
        if (this.handlers.hear()) this.handlers.audition();
      });
    });
    this.pushText(LX, DIR_CAPTION_Y, fitText(dialCaption(settings, 'direction'), LW, 8), c.textDim, 8);

    // OCTAVES — four buttons, so `1 2 3 4` reads as a range rather than a number.
    this.pushText(LX, OCT_LABEL_Y, ARP_DIAL_LABELS.octaves, this.rowColor('dial:octaves'), 8);
    OCTAVE_BUTTONS.forEach((r, i) => {
      const value = i + 1;
      this.button(`oct:${value}`, r, String(value), settings.octaves === value, 'dial:octaves', () => {
        this.control = { kind: 'dial', dial: 'octaves' };
        this.handlers.setDialValue('octaves', value, false);
        if (this.handlers.hear()) this.handlers.audition();
      });
    });
    this.pushText(LX, OCT_CAPTION_Y, fitText(dialCaption(settings, 'octaves'), LW, 8), c.textDim, 8);

    // RATE (STEPS PER NOTE) — named on the row, because the unit is the point.
    this.pushText(LX, RATE_LABEL_Y, ARP_DIAL_LABELS.rate, this.rowColor('dial:rate'), 8);
    this.stepRow(
      'dial:rate', this.isSelected('dial:rate'), RATE_MINUS, RATE_BOX, RATE_PLUS, String(settings.rate),
      () => { this.control = { kind: 'dial', dial: 'rate' }; this.nudgeDial('rate', -1); },
      () => { this.control = { kind: 'dial', dial: 'rate' }; this.nudgeDial('rate', 1); },
    );
    this.pushText(LX, RATE_CAPTION_Y, fitText(dialCaption(settings, 'rate'), LW, 8), c.textDim, 8);

    // INTENSITY (GATE) — the slider, and the number it is set to beside it.
    this.pushText(LX, GATE_LABEL_Y, ARP_DIAL_LABELS.gate, this.rowColor('dial:gate'), 8);
    this.intensity(settings);
    // The caption is the whole reason the row is called INTENSITY (GATE): the
    // number is a velocity, and a slider called `gate` alone would read as note
    // length, which is the one thing in this app it does not control.
    this.pushText(LX, GATE_CAPTION_Y, fitText(dialCaption(settings, 'gate'), LW, 8), c.textDim, 8);

    // SOURCE MODE — the chord the run walks.
    this.pushText(LX, MODE_LABEL_Y, ARP_DIAL_LABELS.mode, this.rowColor('dial:mode'), 8);
    ARP_MODES.forEach((mode, i) => {
      this.button(`mode:${mode}`, MODE_BUTTONS[i], mode === 'chord' ? 'CHORD' : 'SONG SOURCE', settings.mode === mode, 'dial:mode', () => {
        this.control = { kind: 'dial', dial: 'mode' };
        this.handlers.choose('mode', mode);
        if (this.handlers.hear()) this.handlers.audition();
      });
    });
    this.pushText(LX, MODE_CAPTION_Y, settings.mode === 'chord' ? 'Uses the chord at the cursor.' : 'Follows chords in the song.', c.textDim, 8);

    this.tryPanel();
  }

  /** The colour of a row's label: the accent when it is the selected control. */
  private rowColor(id: string): number {
    const c = activeColors();
    return this.isSelected(id) ? c.ward : c.textDim;
  }

  /** `TRY IT FIRST` — hear the run, or put the dials back. */
  private tryPanel(): void {
    const c = activeColors();
    drawPanel(this.marks, TRY, 1, c);
    this.pushText(TRY.x + 5, TRY.y + 5, 'TRY IT FIRST', c.textPrimary, 8);
    this.pushText(TRY.x + 5, TRY.y + 15, 'Hear the run', c.textDim, 8);
    this.pushText(TRY.x + 5, TRY.y + 23, 'before writing.', c.textDim, 8);

    const result = this.handlers.run();
    const canHear = result.ok && result.run.steps.length > 0;
    const playing = this.handlers.auditioning();
    // One button, two verbs: it starts the run, and pressing it while the run is
    // already echoing stops it. Nothing else on the page can silence an echo — a
    // page whose only way to make a sound is also its only way to stop one.
    this.button('hear-run', HEAR_BTN, hearRunLabel(playing, canHear), canHear || playing, '', () => {
      if (playing) this.handlers.stopAudition();
      else if (canHear) this.handlers.audition();
    });
    this.button('reset', RESET_BTN, 'RESET', false, 'reset', () => {
      this.control = { kind: 'reset' };
      this.status = 'RESET';
      this.handlers.reset();
    });
  }

  /** The INTENSITY slider: a track, a filled part, a knob, and the percentage. */
  private intensity(settings: ArpSettings): void {
    const c = activeColors();
    const knobX = sliderKnobX(GATE_TRACK, settings.gate, GATE_KNOB);
    const g = this.stateGfx;
    g.fillStyle(c.ink, 1);
    g.fillRect(GATE_TRACK.x, GATE_TRACK.y, GATE_TRACK.width, GATE_TRACK.height);
    g.fillStyle(c.ward, 0.85);
    g.fillRect(GATE_TRACK.x, GATE_TRACK.y, Math.max(0, knobX - GATE_TRACK.x), GATE_TRACK.height);
    g.fillStyle(c.textPrimary, 1);
    g.fillRect(knobX - GATE_KNOB / 2, GATE_TRACK.y - 2, GATE_KNOB, GATE_TRACK.height + 4);
    this.pushText(LR, GATE_LABEL_Y, `${settings.gate}%`, c.textPrimary, 8, 1);

    const track: Rect = { x: GATE_TRACK.x, y: GATE_TRACK.y - 3, width: GATE_TRACK.width, height: GATE_TRACK.height + 6 };
    this.ring(track, this.isSelected('dial:gate'));
    const zone = this.scene.add.zone(track.x, track.y, track.width, track.height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.setDepth(DEPTH_TEXT - 1);
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.control = { kind: 'dial', dial: 'gate' };
      this.draggingGate = true;
      this.handlers.setDialValue('gate', sliderValueAt(pointer.x, GATE_TRACK, GATE_KNOB), true);
      this.afterGateMove();
    });
    // A drag runs the length of the track without the pointer having to stay on it,
    // which is what makes it a slider rather than a row of buttons.
    const move = (pointer: Phaser.Input.Pointer) => {
      if (!this.draggingGate) return;
      this.handlers.setDialValue('gate', sliderValueAt(pointer.x, GATE_TRACK, GATE_KNOB), true);
      this.afterGateMove();
    };
    const up = () => { this.draggingGate = false; };
    this.scene.input.on('pointermove', move);
    this.scene.input.on('pointerup', up);
    this.zones.push(zone);
    this.cleanups.push(() => {
      this.scene.input.off('pointermove', move);
      this.scene.input.off('pointerup', up);
    });
  }

  /** After a gate change: hear it if AUTO HEAR is on, and repaint the knob. */
  private afterGateMove(): void {
    if (this.handlers.hear()) this.handlers.audition();
    this.render();
  }

  // --- PREVIEW --------------------------------------------------------------

  private previewPanel(settings: ArpSettings): void {
    const c = activeColors();
    const result = this.handlers.run();
    const destination = this.handlers.destination();
    const names = this.handlers.channelNames();
    const rows = this.handlers.rows();

    this.pushText(RX, PREVIEW_TITLE_Y, 'PREVIEW', c.textPrimary, 8);
    this.selectorStrip(destination, names);

    const source = result.ok ? result.run.source : null;
    const steps = result.ok ? result.run.steps : [];
    // The count is the RUN's, both halves: how many notes, and how many steps the
    // pattern has for them to land in.
    this.pushText(RR, PREVIEW_TITLE_Y, `${steps.length} ${steps.length === 1 ? 'NOTE' : 'NOTES'}  \u00b7  ${rows} STEPS`, c.textDim, 8, 1);

    // CHORD AT CURSOR — the chord the run walks, and its notes as chips. Both are
    // AUDIBLE: the box is the whole chord at once and each chip is its own tone,
    // because a run you cannot recognise is a run you cannot tune.
    this.pushText(RX, CHORD_Y + 3, fitText(chordCaption(settings.mode), CHORD_LABEL_W - 4, 8), c.textDim, 8);
    drawInset(this.marks, CHORD_BOX, 1, c);
    this.pushText(CHORD_BOX.x + 3, CHORD_BOX.y + 3, fitText(source && source.chord !== '' ? source.chord : '\u2014', CHORD_BOX.width - 6, 8), c.textPrimary, 8);
    if (source) {
      this.hit('chord', CHORD_BOX, () => this.handlers.hearChord());
      source.tones.slice(0, 8).forEach((midi, i) => {
        const chip: Rect = { x: CHORD_CHIPS_X + i * (CHORD_CHIP_W + CHORD_CHIP_GAP), y: CHORD_CHIP_Y, width: CHORD_CHIP_W, height: 14 };
        if (chip.x + chip.width > RR) return;
        drawInset(this.marks, chip, 1, c);
        this.pushText(chip.x + 3, chip.y + 3, midiToNoteName(midi), c.textPrimary, 8);
        this.hit(`tone:${midi}`, chip, () => this.handlers.hearNote(midi));
      });
    }
    // With no source there is no chord and no chips, and so no zones either: the
    // readout already says why in the roll below, and a control that would play
    // silence is worse than no control.

    this.roll(result);
    this.generatedNotes(steps);
    this.pushText(PREVIEW.x + PREVIEW.width / 2, SUMMARY_Y, arpSummary(settings), c.textDim, 8, 0.5);
  }

  /** PATTERN / CHANNEL / START ROW, each a label and a `‹ value ›` stepper. */
  private selectorStrip(destination: ArpDestinationPoint, names: readonly string[]): void {
    const values: Record<ArpPart, string> = {
      pattern: String(destination.pattern + 1),
      track: names[destination.track] ?? String(destination.track + 1),
      row: formatRow(destination.startRow),
    };
    for (const selector of SELECTORS) {
      this.pushText(selector.labelX, SEL_Y + 6, selector.label, this.rowColor(`select:${selector.part}`), 8);
      this.stepRow(
        `select:${selector.part}`, this.isSelected(`select:${selector.part}`),
        selector.minus, selector.box, selector.plus, values[selector.part],
        () => { this.control = { kind: 'select', part: selector.part }; this.handlers.select(selector.part, -1); this.render(); },
        () => { this.control = { kind: 'select', part: selector.part }; this.handlers.select(selector.part, 1); this.render(); },
      );
    }
  }

  /**
   * The pitch-versus-step chart.
   *
   * Vertical position is PITCH (high at the top, one row per pitch the run sounds)
   * and horizontal position is the STEP it lands on, so the picture is the run
   * itself: a rising line is `up`, a falling one is `down`, and the gaps between
   * blocks are `rate`. The start row is marked, because that is where `WRITE RUN`
   * begins.
   */
  private roll(result: ArpRunResult): void {
    const c = activeColors();
    const destination = this.handlers.destination();
    const rows = this.handlers.rows();
    const steps = result.ok ? result.run.steps : [];
    const grid = rollGrid(steps.map((step) => step.note), rows, ROLL, destination.startRow);
    const g = this.stateGfx;

    // The piano axis: one key per pitch the run sounds.
    drawInset(this.marks, AXIS, 1, c);
    for (const row of grid.rows) {
      g.fillStyle(c.ink, 1);
      g.fillRect(AXIS.x + 1, row.y, AXIS.width, Math.max(1, row.height - 1));
      if (grid.labelRows) {
        this.pushText(AXIS.x + 3, row.y + Math.max(0, Math.floor((row.height - uiPx(8)) / 2)), midiToNoteName(row.pitch), c.textDim, 8);
      }
    }

    // The step columns, with every fourth step brighter — one beat at the default
    // grid, the same landmark the tracker's own grid draws.
    drawInset(this.marks, { x: ROLL.x, y: ROLL.y, width: ROLL.width, height: ROLL.height }, 1, c);
    for (const column of grid.columns) {
      if (column.step % 4 === 0) {
        g.fillStyle(c.ward, 0.10);
        g.fillRect(column.x, ROLL.y, Math.max(1, column.width), ROLL.height);
      }
      const at = rollStepCenter(grid, column.step);
      if (at !== null) this.pushText(at, RULER_Y + 1, formatRow(column.step), c.textDim, 8, 0.5);
    }

    // The start row's own line, so the beginning of the write is unmistakable.
    const start = grid.columns.find((column) => column.step === destination.startRow);
    if (start) {
      g.fillStyle(c.ward, 0.9);
      g.fillRect(Math.round(start.x), ROLL.y, 1, ROLL.height);
    }

    // The notes.
    for (const step of steps) {
      const block = rollBlock(grid, step.step, step.note);
      if (!block) continue;
      g.fillStyle(c.ward, 0.85);
      g.fillRect(block.x, block.y, block.width, block.height);
      if (grid.labelBlocks) {
        const name = midiToNoteName(step.note);
        const width = name.length * uiPx(8) * 0.62;
        if (width <= block.width - 2) {
          this.pushText(block.x + block.width / 2, block.y + Math.max(0, (block.height - uiPx(8)) / 2), name, c.ink ?? c.textPrimary, 8, 0.5);
        }
      }
    }

    if (!result.ok) {
      // The reason there is no run, wrapped by hand: this panel is the only place
      // a person can find out what to do about it.
      const words = result.reason.split(' ');
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        if (line === '') line = word;
        else if (`${line} ${word}`.length * uiPx(8) * 0.62 <= ROLL.width - 12) line = `${line} ${word}`;
        else { lines.push(line); line = word; }
      }
      if (line !== '') lines.push(line);
      const top = ROLL.y + Math.max(0, (ROLL.height - lines.length * 11) / 2);
      lines.slice(0, Math.max(1, Math.floor(ROLL.height / 11))).forEach((text, i) => {
        this.pushText(ROLL.x + ROLL.width / 2, top + i * 11, text, c.textDim, 8, 0.5);
      });
    } else if (steps.length === 0) {
      this.pushText(ROLL.x + ROLL.width / 2, ROLL.y + ROLL.height / 2 - 4, 'NO ROOM PAST THIS ROW', c.textDim, 8, 0.5);
    }
  }

  /** GENERATED NOTES — the first few cells as readouts: step, pitch and velocity. */
  private generatedNotes(steps: readonly ArpStep[]): void {
    const c = activeColors();
    this.pushText(RX, GENERATED_LABEL_Y, 'GENERATED NOTES', c.textDim, 8);
    for (let i = 0; i < GENERATED_VISIBLE; i++) {
      const step = steps[i];
      const r: Rect = { x: RX + i * (GENERATED_W + 4), y: GENERATED_Y, width: GENERATED_W, height: GENERATED_H };
      drawInset(this.marks, r, 1, c);
      if (!step) {
        this.pushText(r.x + 4, r.y + 6, '\u2014', c.textDim, 8);
        continue;
      }
      this.pushText(r.x + 4, r.y + 3, formatRow(step.step), c.textDim, 8);
      this.pushText(r.x + r.width - 4, r.y + 3, midiToNoteName(step.note), c.textPrimary, 8, 1);
      this.pushText(r.x + r.width / 2, r.y + 11, `VEL ${step.velocity}`, c.textDim, 8, 0.5);
    }
    if (steps.length > GENERATED_VISIBLE) {
      const more = `+${steps.length - GENERATED_VISIBLE} MORE`;
      const onSummary = SUMMARY_Y;
      this.pushText(RR, onSummary, more, c.textDim, 8, 1);
    }
  }

  // --- WRITE TO PATTERN -----------------------------------------------------

  /**
   * What a write would do, said BEFORE it does it.
   *
   * The destination is named (which pattern, which channel, which rows) and the
   * cells it would replace are counted, so the button is never a leap: by the time
   * a person presses it they have already read exactly which notes will change.
   */
  private writePanel(): void {
    const c = activeColors();
    const result = this.handlers.run();
    const destination: ArpDestination = result.ok
      ? result.run.destination
      : { pattern: this.handlers.destination().pattern, track: this.handlers.destination().track, row: this.handlers.destination().startRow, lastRow: this.handlers.destination().startRow, cells: 0, replaced: 0 };
    const names = this.handlers.channelNames();

    this.pushText(WRITE.x + 6, WRITE_TITLE_Y, 'WRITE TO PATTERN', c.textPrimary, 8);
    const label = names[destination.track] ? `  (${fitText(names[destination.track], 70, 8)})` : '';
    this.pushText(WRITE.x + 6, WRITE_DEST_Y, `${arpDestinationLine(destination)}${label}`, c.textPrimary, 8);
    this.pushText(WRITE.x + 6, WRITE_NOTE_Y, fitText(arpReplaceNote(destination), 290, 8), result.ok ? c.textDim : c.danger, 8);

    // PREVIEW ONLY is the honest state of the page: nothing has been written yet,
    // and a badge says so even while a run is drawn and ready.
    drawPanel(this.marks, PREVIEW_BADGE, 1, c);
    this.pushCentered(PREVIEW_BADGE, 'PREVIEW ONLY', c.textDim, 8);

    const canWrite = result.ok && result.run.steps.length > 0;
    this.button('write', WRITE_BTN, '\u25b6  WRITE RUN', canWrite, 'write', () => {
      this.control = { kind: 'write' };
      this.status = 'WRITE RUN';
      if (canWrite) this.handlers.write();
    });

    this.pushText(UNDO_X, WRITE_DEST_Y + 10, 'ONE UNDO STEP', c.textDim, 8, 1);
  }

  // --- small pieces ---------------------------------------------------------

  /**
   * One button: a panel, a fill when it is the chosen value, and a ring when the
   * keyboard is on it.
   *
   * `control` is the control this button STANDS FOR, which is what lets the arrows
   * land on a button and the ring show it — an empty string for a button that only
   * acts (HEAR RUN), since there is nothing about it to select.
   */
  private button(id: string, r: Rect, label: string, on: boolean, control: string, onPress: () => void): void {
    const c = activeColors();
    drawPanel(this.marks, r, 1, c);
    if (on) {
      const g = this.stateGfx;
      g.fillStyle(c.ward, 0.8);
      g.fillRect(r.x + 1, r.y + 1, Math.max(0, r.width - 2), Math.max(0, r.height - 2));
    }
    this.pushCentered(r, fitText(label, r.width - 6, 8), on ? (c.ink ?? c.textPrimary) : c.textDim, 8);
    if (control !== '') this.ring(r, this.isSelected(control));
    this.hit(id, r, () => { onPress(); this.render(); });
  }

  /** A `‹ value ›` stepper, used by RATE and all three destination selectors. */
  private stepRow(
    id: string,
    selected: boolean,
    minus: Rect,
    box: Rect,
    plus: Rect,
    value: string,
    onMinus: () => void,
    onPlus: () => void,
  ): void {
    const c = activeColors();
    drawPanel(this.marks, minus, 1, c);
    this.pushCentered(minus, '\u2039', selected ? c.ward : c.textPrimary, 8);
    drawInset(this.marks, box, 1, c);
    this.pushText(box.x + 3, box.y + 3, fitText(value, box.width - 6, 8), c.textPrimary, 8);
    drawPanel(this.marks, plus, 1, c);
    this.pushCentered(plus, '\u203a', selected ? c.ward : c.textPrimary, 8);
    this.hit(`${id}:minus`, minus, onMinus);
    this.hit(`${id}:plus`, plus, onPlus);
  }

  private nudgeDial(dial: ArpDial, step: number): void {
    this.handlers.setDial(dial, step, false);
    if (this.handlers.hear()) this.handlers.audition();
    this.status = `${ARP_DIAL_LABELS[dial]}  ${dialText(this.handlers.settings(), dial)}`;
    this.render();
  }

  /** The selected-control ring, drawn ON TOP of a control's own box. */
  private ring(r: Rect, selected: boolean): void {
    if (!selected) return;
    this.stateGfx.lineStyle(1, activeColors().ward, 1);
    this.stateGfx.strokeRect(r.x - 1.5, r.y - 1.5, r.width + 3, r.height + 3);
  }

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
    for (const undo of this.cleanups) undo();
    this.cleanups = [];
    this.marks.clear();
    this.stateGfx.clear();
    this.hoverGfx.clear();
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

  private pushText(x: number, y: number, text: string, color: number, size = 8, originX = 0): void {
    const obj = uiText(this.scene, x, y, text, { size, color, origin: { x: originX, y: 0 } });
    this.layer.add(obj);
    this.texts.push(obj);
  }

  private pushCentered(r: Rect, text: string, color: number, size = 8): void {
    this.pushText(Math.round(r.x + r.width / 2), Math.round(r.y + (r.height - uiPx(size)) / 2), text, color, size, 0.5);
  }

  destroy(): void {
    this.clearDynamic();
    this.unsubscribe();
    this.statusText.destroy();
    this.back.destroy();
    this.frame.destroy();
    this.marks.destroy();
    this.stateGfx.destroy();
    this.hoverGfx.destroy();
    this.layer.destroy();
    this.curtain.destroy();
  }
}

/** A theme colour as CSS, for the status line. */
function css(color: number): string {
  return '#' + ((color >>> 0) & 0xffffff).toString(16).padStart(6, '0');
}
