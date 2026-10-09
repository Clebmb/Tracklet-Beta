import type Phaser from 'phaser';
import {
  activeColors,
  drawDivider,
  drawInset,
  drawPanel,
  intToCss,
  onThemeChanged,
  uiText,
  type Rect,
  type UiColors,
} from 'phaser-ui-canvas';

import { busLevelFor, MAX_BUSES, type Bus } from '../model/bus';
import type { DrumMachine } from '../model/machine';
import { audible, channelGain, soloing } from '../model/mix';
import {
  clampDuck,
  clampEffect,
  clampLevel,
  clampPan,
  clampRoom,
  clampSend,
  duckLabel,
  effectLabel,
  levelLabel,
  MAX_DUCK,
  MAX_EFFECT,
  MAX_PAN,
  MAX_ROOM,
  MIN_DUCK,
  MIN_EFFECT,
  panLabel,
  roomLabel,
  sendLabel,
  stepDuck,
  stepEffect,
  stepLevel,
  stepPan,
  stepSend,
  TRACK_DUCK,
  TRACK_EFFECTS,
  TRACK_EFFECT_BY_ID,
  type ChannelEffects,
  type Track,
  type TrackEffectId,
} from '../model/song';
import {
  busIn,
  channelColumns,
  clampChannel,
  clampPage,
  effectPages,
  isMachineChannel,
  MACHINE_CHANNEL,
  MIX_NUMBER_FIELDS,
  MIX_ROWS,
  moveChannel,
  newBusName,
  nextBusChoice,
  nextPage,
  sameScene,
  sceneTargets,
  snapshotMachineMix,
  snapshotTrackMix,
  type MixRowId,
  type MixScene,
  type MixSnapshot,
} from './mixerBoard';
import { trackColor } from './trackColor';

/**
 * MixerView — the MIXER page, the app's third full screen.
 *
 * ── A page, not a modal ─────────────────────────────────────────────────────
 * The F5 mix is now this: a screen you switch to, the way the drum machine is.
 * The reference draws the mix as a page and it is right to: a mix is something
 * you LOOK at while the song plays, and a modal you cannot hear through is the
 * wrong shape for it. So the old modal is gone and `F5` opens this page.
 *
 * ── The transport is NOT redrawn, and that is deliberate ─────────────────────
 * The drum machine page covers the whole screen below the header and draws its
 * own PLAY/STOP row. This page stops ABOVE the tracker's own transport bar,
 * which therefore stays up, stays live and stays THE transport — same buttons,
 * same state, same tempo/volume/swing sliders. There are not two transports to
 * keep in step, because there is one transport and this page simply does not
 * cover it. (The reference's bottom row is that same bar, so the picture is
 * matched by reusing rather than by copying.)
 *
 * ── Every control reads the song, none of them keeps a copy ──────────────────
 * Like every other view here, the page holds no mix: it asks the scene for the
 * song on each paint and reports every edit back, so a change made in the
 * tracker, by a script, by an undo or by the drum machine page shows up here the
 * moment the page redraws — and there is exactly one source of truth for every
 * number on the screen.
 *
 * ── Two kinds of state, and only one of them is in the song ──────────────────
 * LEVEL, PAN, SENDS, DUCK, BUS, EFFECTS, THE ROOM and THE MIX are song data:
 * they are written to files, they are undone, and a script can set them. SOLO is
 * not: it is a way of LISTENING, so it never reaches a file, never costs an undo
 * step, and is the scene's state rather than the song's — the same bargain the
 * modal made, kept exactly.
 *
 * ── Where it departs from the reference ─────────────────────────────────────
 *   • The reference's strips carry a VERTICAL level fader; so do these.
 *   • The reference repeats each channel's GROUP fader in its strip. These do
 *     not: a group's fader is one control and it lives in GROUPS, or there would
 *     be two places to move the same number and two ways to disagree.
 *   • The reference's channel panel pages its effects 4 to a page; this build
 *     has TEN real channel effects, so it pages `TRACK_EFFECTS` 5 to a page and
 *     shows all of them rather than the four a drawing happened to fit.
 *   • No meters, no EQ, no plugin slots: a control that does not move a real
 *     number in the song does not exist here.
 */

/** The machine's own faders the strip and the panel edit, as the scene names them. */
export type MixerMachineMix = 'level' | 'pan' | 'verb' | 'echo' | 'duck';

export interface MixerHandlers {
  /** The page opened or closed, so the scene can pause its own input and repaint. */
  onOpenChange?: (open: boolean) => void;
  /** How many channels the song has. */
  trackCount: () => number;
  /** One channel, read on every redraw so the page cannot show a stale mix. */
  track: (index: number) => Track | undefined;
  /** Which channel the scene is on: a track index, or `MACHINE_CHANNEL`. */
  selectedChannel: () => number;
  /** The user picked a column. The scene is what moves the cursor. */
  select: (index: number) => void;
  /** Which channels are soloed — the scene's listening state, never the song's. */
  solos: () => readonly boolean[];
  /**
   * A new gesture is about to begin — a key press, or a click into a control.
   *
   * The scene banks ONE undo step per gesture rather than per change, so a held
   * key or a drag is one Ctrl+Z while a whole evening of mixing is many. This is
   * only the announcement: who records what, and when, is the scene's business.
   */
  beginEdit: () => void;

  setLevel: (index: number, level: number) => void;
  setPan: (index: number, pan: number) => void;
  setSend: (index: number, which: 'verb' | 'echo', amount: number) => void;
  setDuck: (index: number, amount: number) => void;
  /** One of a channel's ten effects, 0..100. */
  setEffect: (index: number, id: TrackEffectId, amount: number) => void;
  /** Join a group, or leave every one of them with `null`. */
  setBus: (index: number, name: string | null) => void;
  toggleMute: (index: number) => void;
  toggleSolo: (index: number) => void;
  /** Sound one note on a channel, so a level can be set by ear. */
  audition: (index: number) => void;

  /** The song's groups, read live: the GROUPS panel draws these and only these. */
  buses: () => readonly Bus[];
  /** Move one group's fader, 0..100. */
  setBusLevel: (name: string, level: number) => void;
  /** Make a new group with a generated name, and say what happened. */
  addBus: () => string;

  /** The room the whole song plays in: the two sends' shared effect. */
  room: () => { reverb: number; echo: number };
  setRoom: (reverb: number, echo: number) => void;
  /** The effects on everything at once, as the WHOLE MIX panel reads them. */
  master: () => ChannelEffects;
  setMasterEffect: (id: TrackEffectId, amount: number) => void;

  /** The song's drum machine, or null when it has none. */
  machine: () => DrumMachine | null;
  setMachineMix: (id: MixerMachineMix, value: number) => string;
  setMachineEnabled: (on: boolean) => string;
  setMachineBus: (name: string | null) => string;
  setMachineEffect: (id: TrackEffectId, amount: number) => void;
  /** Sound one pad of the machine, so its level can be set by ear. */
  auditionMachine: () => void;

  /** True while the transport runs, so this page can say so. */
  playing: () => boolean;
  /** Start or stop the transport — the same state the visible transport bar shows. */
  togglePlay: () => string;
  /** Leave the page, the way Escape does. */
  close: () => void;
}

/** The canvas the app is drawn in. */
const CANVAS_W = 720;
/**
 * Where the page ends, in canvas y.
 *
 * The tracker's own transport bar starts at 345 and is 52 tall, so the page
 * stops at 341: four pixels of background between the mixer's last panel and the
 * transport's first, which is the same air every other pair of panels keeps.
 */
const PAGE_TOP = 39;
const PAGE_BOTTOM = 341;

/** Render depths: opaque cover < curtain < frame < bars < text and zones. */
const DEPTH_BACK = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_BARS = 972;
const DEPTH_TEXT = 980;

/** The four framed panels, in the reference's own arrangement. */
const STRIPS: Rect = { x: 8, y: PAGE_TOP, width: 484, height: 206 };
const CHANNEL: Rect = { x: 496, y: PAGE_TOP, width: 216, height: 206 };
const ROW2_Y = PAGE_TOP + 210;
const GROUPS: Rect = { x: 8, y: ROW2_Y, width: 240, height: 92 };
const ROOM: Rect = { x: 252, y: ROW2_Y, width: 210, height: 92 };
const MIX: Rect = { x: 466, y: ROW2_Y, width: 246, height: 92 };

/** The strips' own padding, and the gap between two columns. */
const STRIP_PAD = 4;
const STRIP_GAP = 2;
/**
 * No strip grows past this: a one-channel song should not draw a letterbox.
 *
 * A ceiling rather than a fixed width, because the columns divide whatever the
 * song has: eight channels get narrow strips and four get wide ones, and the row
 * fills its panel either way. (Two thirds of the panel is the point past which a
 * two-channel song stops looking like a mixer and starts looking like a mistake.)
 */
const STRIP_MAX = 118;

/** A channel panel row's pitch, and the panel's own working width. */
const CH_IN = CHANNEL.x + 8;
const CH_R = CHANNEL.x + CHANNEL.width - 8;
const CH_MIX_ROW = 12;
const CH_MIX_TOP = CHANNEL.y + 34;
const CH_FX_TOP = CHANNEL.y + 122;
const CH_FX_ROW = 13;
// The six rows that are NOT effects (`MIX_ROWS`) come from the board rather than
// being listed again here: they are which controls a channel HAS, so the panel
// that draws them, the keyboard that walks them and the clipboard that copies
// them all read one list, and a seventh row would be drawn, walked and copied by
// adding it there.

/** The label each mix row wears. */
const MIX_ROW_LABEL: Readonly<Record<MixRowId, string>> = {
  level: 'LEVEL',
  pan: 'PAN',
  verb: 'VERB SEND',
  echo: 'ECHO SEND',
  duck: TRACK_DUCK.label,
  bus: 'BUS',
};

/**
 * The legend, in the ROOM panel's spare corner.
 *
 * Three short lines rather than two long ones, because they are drawn in a 210 px
 * panel and a shortcut nobody can read is not a documented shortcut.
 */
const HINTS: readonly string[] = [
  '- + CHANGE \u00b7 TAB FX PAGE',
  'M MUTE \u00b7 O SOLO \u00b7 H HEAR',
  'P PUMP \u00b7 C CENTRE \u00b7 G GROUP',
  'CTRL+C/V COPY \u00b7 B A/B \u00b7 SPACE',
];

const FALLBACK_STATUS = 'EVERY CONTROL HERE MOVES THE SONG. SOLO IS ONLY HOW YOU LISTEN.';

/** Which theme colour a piece of static copy wears, so a recolour can find it. */
type TextRole = 'heading' | 'body' | 'accent' | 'dim';

interface StaticText {
  obj: Phaser.GameObjects.Text;
  role: TextRole;
}

/**
 * A click surface, POOLED rather than rebuilt.
 *
 * One render builds dozens of these and wires a handler to each; destroying and
 * recreating the lot on every paint was part of what made this page slow to open
 * and slow to click. The zone is reused, re-positioned, re-sized only when the
 * layout really changes, and re-bound to this render's handler — the handler
 * closes over the column it was built for, so it has to be replaced even when the
 * zone itself is not.
 */
interface Zone {
  zone: Phaser.GameObjects.Zone;
  press?: () => void;
  pointerDown?: (p: Phaser.Input.Pointer) => void;
  /** The size it was last given, so a resize re-arms the hit area only then. */
  width: number;
  height: number;
}

/** Where a strip's parts live, in canvas coordinates. */
interface StripLayout {
  x: number;
  width: number;
  chipY: number;
  keysY: number;
  panLabelY: number;
  panBarY: number;
  levelLabelY: number;
  faderY: number;
  faderH: number;
  levelValueY: number;
  verbLabelY: number;
  verbBarY: number;
  echoLabelY: number;
  echoBarY: number;
  busLabelY: number;
  busY: number;
  hearY: number;
}

/**
 * Lay one column out.
 *
 * Written as arithmetic over the column's own x and width rather than as a table
 * of absolute numbers, because the columns are sized to the song: four channels
 * get wide strips and eight get narrow ones, and every part of a strip has to
 * follow the width it was given rather than a number that was true for nine.
 */
function stripLayout(x: number, width: number): StripLayout {
  // The columns start BELOW the panel's heading row, not at its top: the
  // heading (and the status line that shares it) is a row of its own, and a chip
  // drawn beside the title would read as part of the title.
  const y = STRIPS.y + 22;
  return {
    x,
    width,
    chipY: y,
    keysY: y + 13,
    panLabelY: y + 27,
    panBarY: y + 37,
    levelLabelY: y + 48,
    faderY: y + 58,
    // Short enough that the eight parts of a strip fit under the heading: the
    // fader is the one thing here with room to give, because its knob is what
    // the eye reads and the groove around it can be shorter.
    faderH: 30,
    levelValueY: y + 91,
    verbLabelY: y + 101,
    verbBarY: y + 110,
    echoLabelY: y + 118,
    echoBarY: y + 127,
    busLabelY: y + 136,
    busY: y + 146,
    hearY: y + 162,
  };
}

export class MixerView {
  private readonly scene: Phaser.Scene;
  private readonly handlers: MixerHandlers;

  private readonly back: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly staticCopy: StaticText[] = [];
  private readonly title: Phaser.GameObjects.Text;

  private rowTexts: Phaser.GameObjects.Text[] = [];
  private rowZones: Zone[] = [];
  /**
   * The pools the last render filled, and the fields each pooled Text was last
   * written with, so an unchanged label costs nothing at all.
   */
  private textCount = 0;
  private zoneCount = 0;
  private readonly textState: { text: string; color: number; anchorX: number; x: number; y: number }[] = [];

  /** Which column is selected: a track index, or `MACHINE_CHANNEL`. */
  private selected = 0;
  /** Which row of THIS CHANNEL the keyboard is on: the six mix rows, then the FX. */
  private focus = 0;
  /** Which page of CHANNEL FX is showing. */
  private fxPage = 0;
  /** Which page of WHOLE MIX is showing. */
  private mixPage = 0;
  /**
   * The mix on the page's own clipboard, and the column it came from.
   *
   * The page's state and not the song's — a copy is a way of MOVING a mix, not
   * part of one — so it is never written to a file, never costs an undo step, and
   * goes away with the page. The name is kept only so the status line can say
   * where a paste came from, which is the one question a copy leaves open.
   */
  private copied: { name: string; from: number; mix: MixSnapshot } | null = null;
  /**
   * Two balances, and which of them the song is playing.
   *
   * A/B is the one form of undo a mixer actually asks for: not "take that back"
   * but "play me the other one", so a whole evening of balancing can be judged
   * against the version before it without discarding either. `null` is a slot
   * nobody has filled yet, which is what makes the first press of B a COPY of A
   * — the standard "duplicate this, then experiment" starting point — rather than
   * a switch to an empty song.
   */
  private readonly slots: [MixScene | null, MixScene | null] = [null, null];
  private live: 0 | 1 = 0;
  /** The last thing a control did, drawn in the strips panel's title row. */
  private status = '';
  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: MixerHandlers) {
    this.scene = scene;
    this.handlers = handlers;

    this.back = scene.add.graphics().setDepth(DEPTH_BACK);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.bars = scene.add.graphics().setDepth(DEPTH_BARS);
    this.layer = scene.add.container(0, 0).setDepth(DEPTH_TEXT);

    // The curtain covers the page and nothing else, so a click that misses every
    // control cannot reach the tracker behind the page — while the transport bar
    // BELOW the page stays clickable, which is the whole point of stopping short.
    this.curtain = scene.add.zone(0, PAGE_TOP, CANVAS_W, PAGE_BOTTOM - PAGE_TOP).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);

    this.title = uiText(scene, STRIPS.x + 8, STRIPS.y + 5, '', { size: 9, color: activeColors().ooze });
    this.title.setDepth(DEPTH_TEXT + 1);
    this.staticCopy.push({ obj: this.title, role: 'heading' });

    this.unsubscribe = onThemeChanged(() => this.render());
    this.setOpen(false);
  }

  /** True while the page is up; the scene pauses itself while it is. */
  get isOpen(): boolean { return this.opened; }

  /** How many columns the page draws: the channels, plus the machine's when there is one. */
  private get columns(): number[] {
    return channelColumns(this.handlers.trackCount(), this.handlers.machine() !== null);
  }

  show(): void {
    this.selected = clampChannel(
      this.handlers.selectedChannel(),
      this.handlers.trackCount(),
      this.handlers.machine() !== null,
    );
    this.focus = 0;
    this.status = '';
    this.setOpen(true);
    this.render();
  }

  hide(): void { this.setOpen(false); }

  private setOpen(open: boolean): void {
    const changed = open !== this.opened;
    this.opened = open;
    this.back.setVisible(open);
    this.frame.setVisible(open);
    this.bars.setVisible(open);
    this.curtain.setVisible(open);
    this.layer.setVisible(open);
    for (const entry of this.staticCopy) entry.obj.setVisible(open);
    for (const text of this.rowTexts) text.setVisible(open);
    for (const zone of this.rowZones) zone.zone.setVisible(open);
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- keyboard -------------------------------------------------------------

  /**
   * The keys the page answers to.
   *
   * Read directly rather than through `menuIntent`, because this page is a ROW
   * of columns with a column of controls beside it — left/right is the row and
   * up/down is the panel, so folding the two axes together (which the shared
   * table does for single-column lists) would be exactly wrong here.
   *
   *   LEFT / RIGHT (A / D)   pick a channel
   *   UP / DOWN (W / S)      pick a control in THIS CHANNEL
   *   - / = ([ / ])          move the focused control
   *   TAB                    the next page of CHANNEL FX
   *   M / O                  mute / solo the selected channel
   *   H                      hear the selected channel
   *   P / C                  walk the pump / centre the pan
   *   G                      add a group
   *   CTRL+C / CTRL+V        copy a column's mix / paste one onto it
   *   B                      play the other balance (A/B)
   *   SPACE                  play / stop
   *   ESCAPE                 back to the tracker
   */
  handleKey(e: KeyboardEvent): void {
    const machine = this.handlers.machine();
    const tracks = this.handlers.trackCount();
    const hasMachine = machine !== null;

    // Ctrl+C / Ctrl+V are the mix's own clipboard: one channel's whole mix, move
    // to any other column of THIS song (the machine's included). They are read
    // here because they are the only modified keys this page owns, and they are
    // the two acts a mixer repeats most — setting eight channels from one of
    // them is the job, and typing the same six numbers eight times is not.
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
      e.preventDefault();
      this.copyColumn();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
      e.preventDefault();
      this.pasteColumn();
      return;
    }
    // `B` is the other balance: the first press fills B with a copy of A and
    // moves there, and each press after that saves what is playing into the slot
    // it is leaving and plays the other one.
    if (e.code === 'KeyB' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.switchBalance(this.live === 0 ? 1 : 0);
      return;
    }

    switch (e.code) {
      case 'Escape':
        e.preventDefault();
        this.handlers.close();
        return;
      case 'ArrowLeft': case 'KeyA':
        e.preventDefault();
        this.pick(moveChannel(this.selected, -1, tracks, hasMachine));
        return;
      case 'ArrowRight': case 'KeyD':
        e.preventDefault();
        this.pick(moveChannel(this.selected, 1, tracks, hasMachine));
        return;
      case 'ArrowUp': case 'KeyW':
        e.preventDefault();
        this.moveFocus(-1);
        return;
      case 'ArrowDown': case 'KeyS':
        e.preventDefault();
        this.moveFocus(1);
        return;
      case 'Minus': case 'NumpadSubtract': case 'BracketLeft':
        e.preventDefault();
        this.nudgeFocus(-1, e.repeat);
        return;
      case 'Equal': case 'NumpadAdd': case 'BracketRight':
        e.preventDefault();
        this.nudgeFocus(1, e.repeat);
        return;
      case 'Tab':
        e.preventDefault();
        this.status = `CHANNEL FX  PAGE ${nextPage(this.fxPage, effectPages().length) + 1} OF ${effectPages().length}`;
        this.fxPage = nextPage(this.fxPage, effectPages().length);
        this.render();
        return;
      case 'KeyM':
        e.preventDefault();
        if (isMachineChannel(this.selected)) {
          this.status = this.handlers.setMachineEnabled(!(machine?.enabled ?? false));
        } else {
          this.handlers.toggleMute(this.selected);
          this.status = `${this.columnName()} ${this.handlers.track(this.selected)?.muted ? 'MUTED' : 'BACK IN THE MIX'}`;
        }
        this.render();
        return;
      case 'KeyO':
        e.preventDefault();
        if (isMachineChannel(this.selected)) {
          this.status = this.handlers.setMachineEnabled(!(machine?.enabled ?? false));
        } else {
          this.handlers.toggleSolo(this.selected);
          this.status = this.soloStatus();
        }
        this.render();
        return;
      case 'KeyH':
        e.preventDefault();
        this.hear();
        return;
      case 'Space':
        e.preventDefault();
        this.status = this.handlers.togglePlay();
        this.render();
        return;
      case 'KeyG':
        e.preventDefault();
        this.status = this.handlers.addBus();
        this.render();
        return;
      case 'KeyP':
        // `P` is the PUMP: it puts the keyboard on the duck row and walks it, so
        // the one control that moves the OTHER channels is one key away from
        // wherever the player was — which is how the modal offered it, kept.
        e.preventDefault();
        this.focus = MIX_ROWS.indexOf('duck');
        this.nudgeFocus(1, e.repeat);
        return;
      case 'KeyC':
        // `C` centres the PAN, the way the modal's did: a pan is a place, and
        // "put it back in the middle" is the one thing you want from it in a
        // hurry. On the machine it is the machine's own pan.
        e.preventDefault();
        if (isMachineChannel(this.selected)) {
          this.status = this.handlers.setMachineMix('pan', 0);
        } else {
          const track = this.handlers.track(this.selected);
          if (!track) return;
          this.handlers.beginEdit();
          this.handlers.setPan(this.selected, 0);
          this.status = `${this.columnName()} PAN CENTRED`;
        }
        this.render();
        return;
      default:
        return;
    }
  }

  /** Select a column, and tell the scene so the tracker's cursor follows. */
  private pick(index: number): void {
    const next = clampChannel(index, this.handlers.trackCount(), this.handlers.machine() !== null);
    if (next === this.selected) return;
    this.selected = next;
    this.handlers.select(next);
    this.status = `SELECTED ${this.columnName()}`;
    this.render();
  }

  /** How many rows the keyboard can be on: the six mix rows, then the FX page. */
  private get focusCount(): number {
    const fx = effectPages()[clampPage(this.fxPage, effectPages().length)]?.length ?? 0;
    return MIX_ROWS.length + fx;
  }

  private moveFocus(delta: number): void {
    const count = this.focusCount;
    this.focus = Math.max(0, Math.min(count - 1, this.focus + delta));
    this.render();
  }

  /** The focused row's own id, or the effect it names. */
  private focusedRow(): MixRowId | TrackEffectId {
    if (this.focus < MIX_ROWS.length) return MIX_ROWS[this.focus];
    const page = effectPages()[clampPage(this.fxPage, effectPages().length)] ?? [];
    return page[this.focus - MIX_ROWS.length] ?? MIX_ROWS[MIX_ROWS.length - 1];
  }

  /**
   * Move the focused control one nudge, in the direction the key asked for.
   *
   * `repeat` is the browser's own word for "this keydown is one of a held key's
   * repeats", and it is the difference between one undo step and thirty: a press
   * starts a gesture, and the repeats that follow it ride along inside it, so
   * holding `-` until a level sounds right is ONE Ctrl+Z. The gesture is the
   * scene's to bank; this is only the news that a new one has begun.
   */
  private nudgeFocus(direction: number, repeat: boolean): void {
    if (isMachineChannel(this.selected)) {
      this.nudgeMachineFocus(direction, repeat);
      return;
    }
    const track = this.handlers.track(this.selected);
    if (!track) return;
    const row = this.focusedRow();
    if (!repeat) this.handlers.beginEdit();
    switch (row) {
      case 'level': {
        const next = stepLevel(track.level, direction);
        if (next === track.level) { this.status = `LEVEL IS ALREADY ${levelLabel(next)}`; break; }
        this.handlers.setLevel(this.selected, next);
        this.status = `${this.columnName()} LEVEL ${levelLabel(next)}`;
        break;
      }
      case 'pan': {
        const next = stepPan(track.pan, direction);
        if (next === track.pan) { this.status = `PAN IS ALREADY ${panLabel(next)}`; break; }
        this.handlers.setPan(this.selected, next);
        this.status = `${this.columnName()} PAN ${panLabel(next)}`;
        break;
      }
      case 'verb': case 'echo': {
        const next = stepSend(track[row], direction);
        if (next === track[row]) { this.status = `${MIX_ROW_LABEL[row]} IS ALREADY ${sendLabel(next)}`; break; }
        this.handlers.setSend(this.selected, row, next);
        this.status = `${this.columnName()} ${MIX_ROW_LABEL[row]} ${sendLabel(next)}`;
        break;
      }
      case 'duck': {
        const next = stepDuck(track.duck, direction);
        if (next === track.duck) { this.status = `${TRACK_DUCK.label} IS ALREADY ${duckLabel(next)}`; break; }
        this.handlers.setDuck(this.selected, next);
        this.status = next <= MIN_DUCK
          ? `${TRACK_DUCK.label} OFF  \u00b7  THIS CHANNEL PUSHES NOTHING DOWN`
          : `${this.columnName()} ${TRACK_DUCK.label} ${duckLabel(next)}  \u00b7  THE OTHERS STEP BACK`;
        break;
      }
      case 'bus': {
        const choice = nextBusChoice(this.handlers.buses(), track.bus, direction);
        this.handlers.setBus(this.selected, choice.name);
        this.status = `${this.columnName()} BUS ${choice.label}`;
        break;
      }
      default: {
        const value = clampEffect(track[row] ?? MIN_EFFECT);
        const next = stepEffect(value, direction);
        if (next === value) { this.status = `${TRACK_EFFECT_BY_ID[row].label} IS ALREADY ${effectLabel(next)}`; break; }
        this.handlers.setEffect(this.selected, row, next);
        this.status = `${this.columnName()} ${TRACK_EFFECT_BY_ID[row].label} ${effectLabel(next)}`;
        break;
      }
    }
    this.render();
  }

  /** The same walk, on the machine's own numbers. */
  private nudgeMachineFocus(direction: number, repeat: boolean): void {
    const machine = this.handlers.machine();
    if (!machine) return;
    const row = this.focusedRow();
    if (!repeat) this.handlers.beginEdit();
    switch (row) {
      case 'level': {
        const next = stepLevel(machine.level, direction);
        if (next === machine.level) { this.status = `MACHINE LEVEL IS ALREADY ${levelLabel(next)}`; break; }
        this.status = this.handlers.setMachineMix('level', next);
        break;
      }
      case 'pan': {
        const next = stepPan(machine.pan, direction);
        if (next === machine.pan) { this.status = `MACHINE PAN IS ALREADY ${panLabel(next)}`; break; }
        this.status = this.handlers.setMachineMix('pan', next);
        break;
      }
      case 'verb': case 'echo': {
        const next = stepSend(machine[row], direction);
        if (next === machine[row]) { this.status = `MACHINE ${MIX_ROW_LABEL[row]} IS ALREADY ${sendLabel(next)}`; break; }
        this.status = this.handlers.setMachineMix(row, next);
        break;
      }
      case 'duck': {
        const next = stepDuck(machine.duck, direction);
        if (next === machine.duck) { this.status = `MACHINE ${TRACK_DUCK.label} IS ALREADY ${duckLabel(next)}`; break; }
        this.status = this.handlers.setMachineMix('duck', next);
        break;
      }
      case 'bus': {
        const choice = nextBusChoice(this.handlers.buses(), machine.bus, direction);
        this.status = this.handlers.setMachineBus(choice.name);
        break;
      }
      default: {
        const value = clampEffect(machine.effects[row] ?? MIN_EFFECT);
        const next = stepEffect(value, direction);
        if (next === value) { this.status = `MACHINE ${TRACK_EFFECT_BY_ID[row].label} IS ALREADY ${effectLabel(next)}`; break; }
        this.handlers.setMachineEffect(row, next);
        this.status = `MACHINE ${TRACK_EFFECT_BY_ID[row].label} ${effectLabel(next)}`;
        break;
      }
    }
    this.render();
  }

  /**
   * Put the selected column's whole mix on the clipboard.
   *
   * The snapshot is a VALUE — a copy of the numbers rather than a view of the
   * column — so editing the source afterwards cannot change what a paste will
   * write, and replacing the song cannot leave the clipboard pointing into one
   * that no longer exists.
   */
  private copyColumn(): void {
    const machine = this.handlers.machine();
    const taken = isMachineChannel(this.selected)
      ? machine ? snapshotMachineMix(machine) : null
      : (() => { const track = this.handlers.track(this.selected); return track ? snapshotTrackMix(track) : null; })();
    if (!taken) return;
    this.copied = { name: this.columnName(), from: this.selected, mix: taken };
    this.status = `COPIED ${this.copied.name}  \u00b7  ITS LEVEL, PAN, SENDS, DUCK, GROUP AND FX`;
    this.render();
  }

  /**
   * Write the clipboard onto the selected column.
   *
   * Every field goes through the handler the corresponding control uses, so a
   * paste is not a second way to write a song: the scene clamps, tells the engine
   * and banks the undo step, exactly as it does for a drag. `beginEdit` once at
   * the front makes the whole paste ONE Ctrl+Z, which is what a person expects of
   * a single act — and the fields that follow fold into that gesture by the same
   * window a held key does.
   */
  private pasteColumn(): void {
    const copy = this.copied;
    if (!copy) {
      this.status = 'NOTHING COPIED YET  \u00b7  PRESS CTRL+C ON A CHANNEL FIRST';
      this.render();
      return;
    }
    const buses = this.handlers.buses();
    const mix = copy.mix;
    // A group the song does not have cannot be joined, so the paste lands on none
    // of them and SAYS so: a control that silently dropped a name would make the
    // clipboard look broken rather than the group look absent.
    const lostGroup = mix.bus !== null && busIn(mix, buses) === null;

    this.handlers.beginEdit();
    this.writeColumn(this.selected, isMachineChannel(this.selected), mix, buses);

    const where = copy.name === this.columnName() ? 'BACK ONTO ITSELF' : `INTO ${this.columnName()}`;
    this.status = `${copy.name}'S MIX PASTED ${where}${lostGroup ? `  \u00b7  ${mix.bus} IS NOT A GROUP HERE` : ''}`;
    this.render();
  }

  /**
   * Read the song's WHOLE mix, as one value.
   *
   * Every part comes from the handler the corresponding control uses, so a scene
   * can only ever hold things the page can also move — and the two are read in one
   * pass, so there is no third list of "what a balance is" to keep in step.
   */
  private captureScene(): MixScene {
    const tracks: MixSnapshot[] = [];
    for (let index = 0; index < this.handlers.trackCount(); index++) {
      const track = this.handlers.track(index);
      if (track) tracks.push(snapshotTrackMix(track));
    }
    const machine = this.handlers.machine();
    const room = this.handlers.room();
    return {
      tracks,
      machine: machine ? snapshotMachineMix(machine) : null,
      buses: this.handlers.buses().map((bus) => ({ name: bus.name, level: bus.level })),
      room: { reverb: room.reverb, echo: room.echo },
      master: this.handlers.master(),
    };
  }

  /**
   * Play one of the two balances: save what is playing, then load the other.
   *
   * Saving on the way out is what makes A and B two VERSIONS rather than one
   * undo stack: whatever was changed while a slot was live belongs to that slot,
   * so switching back and forth loses nothing and each side can be worked on for
   * as long as it takes. `beginEdit` once at the front keeps the whole load as one
   * Ctrl+Z, exactly as a paste is.
   */
  private switchBalance(which: 0 | 1): void {
    // Nothing stored yet: fill both from what is playing, so B starts as a copy
    // of A and the first press is "give me somewhere to experiment".
    if (this.slots[0] === null && this.slots[1] === null) {
      const scene = this.captureScene();
      this.slots[0] = scene;
      this.slots[1] = scene;
      this.live = which;
      this.status = `${which === 0 ? 'A' : 'B'} IS LIVE  \u00b7  CHANGE ANYTHING, THEN PRESS B TO COMPARE`;
      this.render();
      return;
    }
    const want = this.slots[which];
    if (want === null) {
      this.status = `${which === 0 ? 'A' : 'B'} IS EMPTY  \u00b7  PRESS THE OTHER SIDE FIRST`;
      this.render();
      return;
    }
    if (which === this.live) {
      this.status = `ALREADY ON ${which === 0 ? 'A' : 'B'}`;
      this.render();
      return;
    }
    if (sameScene(this.captureScene(), want)) {
      // The two sides hold the same numbers, so there is nothing to hear — but the
      // press still counts as arriving at `which`, which is what a person means.
      this.live = which;
      this.status = `${which === 0 ? 'A' : 'B'} IS LIVE  \u00b7  THE TWO SIDES MATCH`;
      this.render();
      return;
    }
    this.slots[this.live] = this.captureScene();
    // The label is passed rather than read from `this.live`, because the side
    // being PLAYED is the one being loaded and not the one being left.
    this.applyScene(want, which === 0 ? 'A' : 'B');
    this.live = which;
    this.render();
  }

  /**
   * Write a scene into the song through the same handlers every control uses.
   *
   * What a song cannot take is DROPPED AND SAID, never invented: a balance from
   * an eight-channel song pressed into a four-channel one moves four channels and
   * says how many were left, and a machine's mix into a song with no machine is
   * reported rather than quietly lost.
   */
  private applyScene(scene: MixScene, label: string): void {
    const hasMachine = this.handlers.machine() !== null;
    const targets = sceneTargets(scene, this.handlers.trackCount(), hasMachine);
    this.handlers.beginEdit();
    for (const target of targets.tracks) this.writeColumn(target.index, false, target.mix, this.handlers.buses());
    if (targets.machine) this.writeColumn(MACHINE_CHANNEL, true, targets.machine, this.handlers.buses());
    for (const bus of scene.buses) this.handlers.setBusLevel(bus.name, bus.level);
    this.handlers.setRoom(scene.room.reverb, scene.room.echo);
    for (const effect of TRACK_EFFECTS) this.handlers.setMasterEffect(effect.id, scene.master[effect.id]);
    const dropped = targets.droppedTracks === 0 && !targets.droppedMachine
      ? ''
      : `  \u00b7  ${targets.droppedMachine ? 'NO MACHINE HERE' : `${targets.droppedTracks} CHANNEL${targets.droppedTracks === 1 ? '' : 'S'} DID NOT FIT`}`;
    this.status = `PLAYING ${label}${dropped}`;
  }

  /**
   * Write one column's mix, whoever is holding it.
   *
   * Shared by PASTE and by A/B because they are the same act — a mix arriving at
   * a column — and the only difference is where the value came from. The group is
   * checked against the song rather than trusted, so neither can join a group the
   * song does not have.
   */
  private writeColumn(index: number, isMachine: boolean, mix: MixSnapshot, buses: readonly Bus[]): void {
    for (const field of MIX_NUMBER_FIELDS) {
      const value = mix[field];
      if (isMachine) this.handlers.setMachineMix(field, value);
      else if (field === 'level') this.handlers.setLevel(index, value);
      else if (field === 'pan') this.handlers.setPan(index, value);
      else if (field === 'verb' || field === 'echo') this.handlers.setSend(index, field, value);
      else this.handlers.setDuck(index, value);
    }
    for (const effect of TRACK_EFFECTS) {
      if (isMachine) this.handlers.setMachineEffect(effect.id, mix.effects[effect.id]);
      else this.handlers.setEffect(index, effect.id, mix.effects[effect.id]);
    }
    const bus = busIn(mix, buses);
    if (isMachine) this.handlers.setMachineBus(bus);
    else this.handlers.setBus(index, bus);
  }

  /** Sound the selected column: a note on a channel, a pad on the machine. */
  private hear(): void {
    if (isMachineChannel(this.selected)) {
      this.handlers.auditionMachine();
      this.status = 'HEARING THE MACHINE.';
    } else {
      this.handlers.audition(this.selected);
      this.status = `HEARING ${this.columnName()}.`;
    }
    this.render();
  }

  /** What SOLO is currently doing, in one sentence. */
  private soloStatus(): string {
    const solos = this.handlers.solos();
    if (!soloing(solos)) return 'SOLO OFF  \u00b7  EVERY CHANNEL PLAYS.';
    const names: string[] = [];
    const tracks = this.handlers.trackCount();
    for (let i = 0; i < tracks; i++) {
      if (solos[i]) names.push(this.handlers.track(i)?.name ?? `CH ${i + 1}`);
    }
    return `SOLO: ${names.join(' + ')}  \u00b7  NOT SAVED WITH THE SONG.`;
  }

  /** The selected column's name, for the status line. */
  private columnName(): string {
    if (isMachineChannel(this.selected)) return 'MACHINE';
    return this.handlers.track(this.selected)?.name ?? `CH ${this.selected + 1}`;
  }

  // --- drawing --------------------------------------------------------------

  render(): void {
    const c = activeColors();

    // An opaque cover, not a dim: this is a page, so the tracker underneath is
    // hidden rather than seen through — and it stops at the transport, which is
    // the one part of the tracker this page does not own.
    this.back.clear();
    this.back.fillStyle(c.ink, 1);
    this.back.fillRect(0, PAGE_TOP, CANVAS_W, PAGE_BOTTOM - PAGE_TOP);

    this.frame.clear();
    this.bars.clear();
    // REWIND the pools rather than empty them: the Text and Zone objects below are
    // reused, and whatever this render does not reach is hidden at the end. Building
    // them afresh on every paint cost over a second per open, because `uiText`
    // rasterizes each Text at 4x resolution and a mix page builds over a hundred.
    this.textCount = 0;
    this.zoneCount = 0;

    const hasMachine = this.handlers.machine() !== null;
    // A song shrunk under the page must not leave the selection on a column that
    // no longer exists: the same repair `show` makes, made on every paint.
    this.selected = clampChannel(this.selected, this.handlers.trackCount(), hasMachine);
    this.fxPage = clampPage(this.fxPage, effectPages().length);
    this.mixPage = clampPage(this.mixPage, effectPages().length);

    this.panel(STRIPS, '', c);
    this.panel(CHANNEL, 'THIS CHANNEL', c);
    this.panel(GROUPS, 'GROUPS', c);
    this.panel(ROOM, 'ROOM', c);
    this.panel(MIX, 'WHOLE MIX', c);
    this.drawMixPager(c);

    this.drawStrips(c);
    this.drawChannelPanel(c);
    this.drawGroups(c);
    this.drawRoom(c);
    this.drawMix(c);

    for (const entry of this.staticCopy) entry.obj.setColor(intToCss(colorForRole(entry.role, c)));
    const count = this.handlers.trackCount();
    const soloed = soloing(this.handlers.solos());
    // The machine is named only when the song HAS one: the reference's subtitle
    // says "tracks + machine" because its song has both, and a page that claims a
    // machine a song does not have would be describing a different song.
    const parts = ['MIXER', `TRACKS${hasMachine ? ' + MACHINE' : ''}`, `${count} CHANNEL${count === 1 ? '' : 'S'}`];
    if (soloed) parts.push('SOLOING');
    this.title.setText(parts.join('  \u00b7  '));
    this.title.setColor(intToCss(c.ooze));
    this.drawStatus(c);

    for (let i = 0; i < this.rowTexts.length; i += 1) this.rowTexts[i]!.setVisible(this.opened && i < this.textCount);
    for (let i = 0; i < this.rowZones.length; i += 1) this.rowZones[i]!.zone.setVisible(this.opened && i < this.zoneCount);
  }

  /** One framed panel with its title in the top-left corner. */
  private panel(rect: Rect, title: string, c: UiColors): void {
    drawPanel(this.frame, rect, 1, c);
    if (title !== '') this.pushText(rect.x + 8, rect.y + 5, title, c.ooze);
  }

  /** The strips' heading row: what just happened, right-aligned in the panel. */
  private drawStatus(c: UiColors): void {
    const text = this.status === '' ? FALLBACK_STATUS : this.status;
    this.pushText(STRIPS.x + STRIPS.width - 8, STRIPS.y + 6, clip(text, 42), this.status === '' ? c.textDim : c.textPrimary, 1);
    drawDivider(this.frame, STRIPS.x + 4, STRIPS.y + 17, STRIPS.width - 8, 1, c);
  }

  /**
   * How many characters a strip's name row holds.
   *
   * One rule for every column, the machine's included, so the widest name the row
   * can draw is the same everywhere — and computed from the width the column was
   * actually given, because eight channels get half the room that four do.
   */
  private nameBudget(layout: StripLayout): number {
    return Math.max(3, Math.floor((layout.width - 16) / 5));
  }

  /**
   * The channel strips row: one column per channel, plus the machine's.
   *
   * The columns divide the panel's width among however many there are, capped so
   * a one-channel song does not draw a strip the size of the panel.
   */
  private drawStrips(c: UiColors): void {
    const columns = this.columns;
    const inner = STRIPS.width - STRIP_PAD * 2;
    const count = Math.max(1, columns.length);
    const width = Math.min(STRIP_MAX, Math.floor((inner - STRIP_GAP * (count - 1)) / count));
    const tracks = this.handlers.trackCount();
    const machine = this.handlers.machine();
    const buses = this.handlers.buses();
    const solos = this.handlers.solos();
    const levels: number[] = [];
    const mutes: boolean[] = [];
    for (let i = 0; i < tracks; i++) {
      const track = this.handlers.track(i);
      levels.push(track?.level ?? 100);
      mutes.push(track?.muted ?? false);
    }

    columns.forEach((index, column) => {
      const x = STRIPS.x + STRIP_PAD + column * (width + STRIP_GAP);
      const layout = stripLayout(x, width);
      const selected = index === this.selected;

      if (selected) {
        this.frame.fillStyle(c.ooze, 0.14);
        this.frame.fillRect(x - 2, STRIPS.y + 20, width + 4, STRIPS.height - 24);
        this.frame.fillStyle(c.ooze, 0.9);
        this.frame.fillRect(x - 2, STRIPS.y + 20, 2, STRIPS.height - 24);
      }
      // The column whose mix is on the clipboard wears a line under its name, so
      // "where did that copy come from?" is answered on the screen rather than by
      // pasting and comparing.
      if (this.copied !== null && this.copied.from === index) {
        this.frame.fillStyle(c.ward, 0.9);
        this.frame.fillRect(x + 2, layout.chipY + 11, width - 4, 1);
      }
      // The whole column selects, drawn first so every control inside it wins
      // the click it is under.
      this.zone({ x: x - 2, y: STRIPS.y + 20, width: width + 4, height: STRIPS.height - 24 }, () => this.pick(index));

      if (isMachineChannel(index)) {
        if (machine) this.drawMachineStrip(layout, machine, buses, selected, c);
      } else {
        const track = this.handlers.track(index);
        if (!track) return;
        const busLevel = busLevelFor(buses, track.bus);
        const quiet = !audible(index, mutes, solos) || channelGain(index, levels, mutes, solos, busLevel) === 0;
        this.drawTrackStrip(layout, index, track, quiet, solos[index] === true, c);
      }
    });
  }

  /** One channel's column: its identity, its two keys, and its four faders. */
  private drawTrackStrip(
    layout: StripLayout,
    index: number,
    track: Track,
    quiet: boolean,
    soloed: boolean,
    c: UiColors,
  ): void {
    const x = layout.x;
    const right = x + layout.width;

    // The chip and the name: the same colour the channel wears everywhere else.
    this.frame.fillStyle(c.ink, 1);
    this.frame.fillRect(x + 2, layout.chipY, 10, 10);
    this.frame.fillStyle(trackColor(index, c), quiet ? 0.3 : 1);
    this.frame.fillRect(x + 3, layout.chipY + 1, 8, 8);
    this.pushText(x + 16, layout.chipY + 1, clip(track.name, this.nameBudget(layout)), quiet ? c.textDim : c.textPrimary);

    // M and O: mute and solo. Mute is a fact about the song; solo is a fact
    // about how you are listening, which is why it is drawn differently (a lit
    // box that will not be saved) and why the status line says so.
    this.stackedKeys(layout, track.muted, soloed, c, {
      onMute: () => {
        this.pick(index);
        this.handlers.toggleMute(index);
        this.status = `${track.name} ${this.handlers.track(index)?.muted ? 'IS MUTED IN THE SONG' : 'IS BACK IN THE MIX'}`;
        this.render();
      },
      onSolo: () => {
        this.pick(index);
        this.handlers.toggleSolo(index);
        this.status = this.soloStatus();
        this.render();
      },
    });

    // PAN: a bar filled from the CENTRE out, so a channel's place reads as a side
    // and a distance at once — the same picture the F5 menu drew.
    this.pushText(x + 2, layout.panLabelY, 'PAN', c.textDim);
    this.pushText(right - 2, layout.panLabelY, panLabel(track.pan), c.textPrimary, 1);
    const barW = layout.width - 4;
    drawInset(this.bars, { x: x + 2, y: layout.panBarY, width: barW, height: 9 }, 1, c);
    const mid = Math.floor((barW - 2) / 2);
    const offset = Math.round(mid * (track.pan / MAX_PAN));
    if (offset !== 0) {
      this.bars.fillStyle(c.ward, quiet ? 0.3 : 0.85);
      const from = offset < 0 ? mid + offset : mid;
      this.bars.fillRect(x + 3 + from, layout.panBarY + 1, Math.abs(offset), 7);
    }
    this.bars.fillStyle(c.textDim, 0.9);
    this.bars.fillRect(x + 3 + mid, layout.panBarY + 1, 1, 7);
    this.zone({ x: x + 2, y: layout.panBarY - 3, width: barW, height: 14 }, undefined, (p) => {
      this.pick(index);
      this.handlers.beginEdit();
      const inner = barW - 2;
      const at = Math.max(0, Math.min(inner, p.x - x - 3));
      const pan = Math.round(((at / inner) * 2 - 1) * MAX_PAN);
      this.handlers.setPan(index, clampPan(pan));
      this.status = `${track.name} PAN ${panLabel(this.handlers.track(index)?.pan ?? pan)}`;
      this.render();
    });

    // LEVEL: the reference's VERTICAL fader, which is also the only control on
    // the page tall enough to be found by eye.
    this.pushText(x + 2, layout.levelLabelY, 'LEVEL', c.textDim);
    this.verticalFader(layout, track.level, quiet, () => {
      this.handlers.beginEdit();
      // The click's distance from the groove's foot IS the level.
    }, (p) => {
      this.pick(index);
      this.handlers.beginEdit();
      const inner = layout.faderH - 2;
      const at = Math.max(0, Math.min(inner, layout.faderY + layout.faderH - 2 - p.y));
      this.handlers.setLevel(index, clampLevel(Math.round((at / inner) * 100)));
      this.status = `${track.name} LEVEL ${levelLabel(this.handlers.track(index)?.level ?? 0)}`;
      this.render();
    });
    this.pushText(x + Math.floor(layout.width / 2), layout.levelValueY, levelLabel(track.level), quiet ? c.textDim : c.textPrimary, 0.5);

    // The two sends: a bar for the amount, the number beside it. Filled from the
    // left because a send is an amount rather than a place.
    this.sendRow(layout, 'VERB', layout.verbLabelY, layout.verbBarY, track.verb, quiet, c, (amount) => {
      this.pick(index);
      this.handlers.beginEdit();
      this.handlers.setSend(index, 'verb', clampSend(amount));
      this.status = `${track.name} VERB SEND ${sendLabel(amount)}`;
      this.render();
    });
    this.sendRow(layout, 'ECHO', layout.echoLabelY, layout.echoBarY, track.echo, quiet, c, (amount) => {
      this.pick(index);
      this.handlers.beginEdit();
      this.handlers.setSend(index, 'echo', clampSend(amount));
      this.status = `${track.name} ECHO SEND ${sendLabel(amount)}`;
      this.render();
    });

    // BUS: the group this channel joins. A field that cycles rather than a menu,
    // because the choices are the song's own groups and there are at most five
    // of them — the same press-to-cycle bargain the groove and scale buttons make.
    this.pushText(x + 2, layout.busLabelY, 'BUS', c.textDim);
    this.busField(x + 2, layout.busY, layout.width, track.bus, this.handlers.buses(), c, () => {
      this.pick(index);
      const choice = nextBusChoice(this.handlers.buses(), this.handlers.track(index)?.bus ?? null, 1);
      this.handlers.beginEdit();
      this.handlers.setBus(index, choice.name);
      this.status = choice.name === null
        ? `${track.name} LEFT ITS GROUP.`
        : `${track.name} JOINS ${choice.label}.`;
      this.render();
    });

    // HEAR: one note on this channel, so a level can be set by ear.
    this.miniButton({ x: x + 2, y: layout.hearY, width: layout.width - 4, height: 14 }, 'HEAR', c, () => {
      this.pick(index);
      this.hear();
    });
  }

  /** The machine's column: the same shape, with ON/OFF where M/O would be. */
  private drawMachineStrip(layout: StripLayout, machine: DrumMachine, buses: readonly Bus[], selected: boolean, c: UiColors): void {
    const x = layout.x;
    const right = x + layout.width;
    const busLevel = busLevelFor(buses, machine.bus);
    const quiet = !machine.enabled || channelGain(0, [machine.level], [false], [], busLevel) === 0;
    const colour = selected ? c.ooze : c.textGreen;

    // The chip and the name. The machine HAS no channel colour — it is not one of
    // the song's channels — so it wears the accent, which is how the reference
    // paints it too.
    this.frame.fillStyle(c.ink, 1);
    this.frame.fillRect(x + 2, layout.chipY, 10, 10);
    this.frame.fillStyle(colour, quiet ? 0.3 : 1);
    this.frame.fillRect(x + 3, layout.chipY + 1, 8, 8);
    this.pushText(x + 16, layout.chipY + 1, clip('MACHINE', this.nameBudget(layout)), quiet ? c.textDim : c.textPrimary);

    // ON / OFF in the keys' place: a machine is PLAYING or it is not, and calling
    // that "mute" would promise semantics it does not have (no solo, no per-part
    // hush). One box, the whole width, saying which it is.
    this.toggleBox(
      { x: x + 2, y: layout.keysY, width: layout.width - 4, height: 12 },
      machine.enabled,
      machine.enabled ? c.textGreen : c.danger,
      machine.enabled ? 'ON' : 'OFF',
      c,
      () => {
        this.pick(MACHINE_CHANNEL);
        this.status = this.handlers.setMachineEnabled(!machine.enabled);
        this.render();
      },
    );

    this.pushText(x + 2, layout.panLabelY, 'PAN', c.textDim);
    this.pushText(right - 2, layout.panLabelY, panLabel(machine.pan), c.textPrimary, 1);
    const barW = layout.width - 4;
    drawInset(this.bars, { x: x + 2, y: layout.panBarY, width: barW, height: 9 }, 1, c);
    const mid = Math.floor((barW - 2) / 2);
    const offset = Math.round(mid * (machine.pan / MAX_PAN));
    if (offset !== 0) {
      this.bars.fillStyle(c.ward, quiet ? 0.3 : 0.85);
      const from = offset < 0 ? mid + offset : mid;
      this.bars.fillRect(x + 3 + from, layout.panBarY + 1, Math.abs(offset), 7);
    }
    this.bars.fillStyle(c.textDim, 0.9);
    this.bars.fillRect(x + 3 + mid, layout.panBarY + 1, 1, 7);
    this.zone({ x: x + 2, y: layout.panBarY - 3, width: barW, height: 14 }, undefined, (p) => {
      this.pick(MACHINE_CHANNEL);
      const inner = barW - 2;
      const at = Math.max(0, Math.min(inner, p.x - x - 3));
      this.status = this.handlers.setMachineMix('pan', clampPan(Math.round(((at / inner) * 2 - 1) * MAX_PAN)));
      this.render();
    });

    this.pushText(x + 2, layout.levelLabelY, 'LEVEL', c.textDim);
    this.verticalFader(layout, machine.level, quiet, () => { /* the zone below does the work */ }, (p) => {
      this.pick(MACHINE_CHANNEL);
      const inner = layout.faderH - 2;
      const at = Math.max(0, Math.min(inner, layout.faderY + layout.faderH - 2 - p.y));
      this.status = this.handlers.setMachineMix('level', clampLevel(Math.round((at / inner) * 100)));
      this.render();
    });
    this.pushText(x + Math.floor(layout.width / 2), layout.levelValueY, levelLabel(machine.level), quiet ? c.textDim : c.textPrimary, 0.5);

    this.sendRow(layout, 'VERB', layout.verbLabelY, layout.verbBarY, machine.verb, quiet, c, (amount) => {
      this.pick(MACHINE_CHANNEL);
      this.status = this.handlers.setMachineMix('verb', clampSend(amount));
      this.render();
    });
    this.sendRow(layout, 'ECHO', layout.echoLabelY, layout.echoBarY, machine.echo, quiet, c, (amount) => {
      this.pick(MACHINE_CHANNEL);
      this.status = this.handlers.setMachineMix('echo', clampSend(amount));
      this.render();
    });

    this.pushText(x + 2, layout.busLabelY, 'BUS', c.textDim);
    this.busField(x + 2, layout.busY, layout.width, machine.bus, buses, c, () => {
      this.pick(MACHINE_CHANNEL);
      const choice = nextBusChoice(buses, this.handlers.machine()?.bus ?? null, 1);
      this.status = this.handlers.setMachineBus(choice.name);
      this.render();
    });

    this.miniButton({ x: x + 2, y: layout.hearY, width: layout.width - 4, height: 14 }, 'HEAR PAD', c, () => {
      this.pick(MACHINE_CHANNEL);
      this.hear();
    });
  }

  /** THIS CHANNEL: the selected column's numbers, and its ten effects, paged. */
  private drawChannelPanel(c: UiColors): void {
    const machine = this.handlers.machine();
    const isMachine = isMachineChannel(this.selected);
    const bus = isMachine ? machine?.bus ?? null : this.handlers.track(this.selected)?.bus ?? null;
    const buses = this.handlers.buses();

    // The chip and the name, the panel's biggest reading of "which column".
    const name = isMachine ? 'MACHINE' : this.handlers.track(this.selected)?.name ?? `CH ${this.selected + 1}`;
    const colour = isMachine ? c.ooze : trackColor(this.selected, c);
    this.frame.fillStyle(colour, 0.95);
    this.frame.fillRect(CH_IN, CHANNEL.y + 19, 12, 11);
    this.frame.fillStyle(c.ink, 0.6);
    this.frame.fillRect(CH_IN, CHANNEL.y + 19, 12, 1);
    this.pushText(CH_IN + 18, CHANNEL.y + 20, clip(name, 14), c.textPrimary);

    // COPY and PASTE, in the panel's heading: the two acts a mixer repeats, and
    // the only pair of controls here that means something across channels. PASTE
    // is drawn dim while the clipboard is empty, so "can I paste?" is answered by
    // looking rather than by pressing and reading an apology.
    this.miniButton({ x: CH_R - 87, y: CHANNEL.y + 3, width: 42, height: 13 }, 'COPY', c, () => this.copyColumn());
    this.miniButton(
      { x: CH_R - 42, y: CHANNEL.y + 3, width: 42, height: 13 },
      'PASTE',
      c,
      () => this.pasteColumn(),
      this.copied === null,
    );

    // Six rows of real numbers. Each is a label, a groove you click, and the
    // value at the end — the bargain every other control in this app makes.
    MIX_ROWS.forEach((row, index) => {
      const y = CH_MIX_TOP + index * CH_MIX_ROW;
      const focused = this.focus === index;
      const value = this.mixRowValue(row);
      const display = this.mixRowDisplay(row, value);
      if (focused) {
        this.frame.fillStyle(c.ooze, 0.12);
        this.frame.fillRect(CH_IN - 4, y - 2, CH_R - CH_IN + 8, CH_MIX_ROW);
      }
      this.pushText(CH_IN, y, MIX_ROW_LABEL[row], focused ? c.ward : c.textDim);
      if (row === 'bus') {
        this.pushText(CH_R, y, this.busValueLabel(bus, buses), focused ? c.ward : c.textPrimary, 1);
      } else {
        this.pushText(CH_R, y, display, focused ? c.ward : c.textPrimary, 1);
      }

      // The groove's span, per row: a bus is a list of names rather than a range,
      // so it gets a click that CYCLES instead of a bar.
      if (row === 'bus') {
        this.field({ x: CH_IN + 62, y: y - 4, width: CH_R - CH_IN - 62, height: 13 }, this.busValueLabel(bus, buses), c, () => {
          this.focus = index;
          const choice = nextBusChoice(buses, bus, 1);
          this.handlers.beginEdit();
          this.applyBus(choice.name);
          this.status = isMachine
            ? this.handlers.machine()?.bus === null ? 'MACHINE LEFT ITS GROUP.' : `MACHINE JOINS ${choice.label}.`
            : choice.name === null ? `${name} LEFT ITS GROUP.` : `${name} JOINS ${choice.label}.`;
          this.render();
        });
        return;
      }
      const barX = CH_IN + 62;
      const barW = CH_R - CH_IN - 74;
      const { min, max, signed } = this.mixRowRange(row);
      drawInset(this.bars, { x: barX, y: y - 1, width: barW, height: 9 }, 1, c);
      this.meterFill(barX, y - 1, barW, value, min, max, signed, focused ? c.ward : row === 'duck' ? c.danger : c.textGreen, c);
      this.zone({ x: barX, y: y - 4, width: barW, height: 14 }, () => { this.focus = index; this.render(); }, (p) => {
        this.focus = index;
        this.handlers.beginEdit();
        const inner = barW - 2;
        const at = Math.max(0, Math.min(inner, p.x - barX - 1));
        const next = signed
          ? Math.round(((at / inner) * 2 - 1) * MAX_PAN)
          : Math.round(min + (at / inner) * (max - min));
        this.applyMixRow(row, next);
        this.render();
      });
    });

    // CHANNEL FX, with the reference's own pager in the heading.
    const pages = effectPages();
    this.pushText(CH_IN, CHANNEL.y + 108, 'CHANNEL FX', c.ooze);
    this.pager({ x: CH_R - 74, y: CHANNEL.y + 106, width: 74, height: 13 }, this.fxPage, pages.length, c,
      () => { this.fxPage = clampPage(this.fxPage - 1, pages.length); this.render(); },
      () => { this.fxPage = clampPage(this.fxPage + 1, pages.length); this.render(); });

    const page = pages[this.fxPage] ?? [];
    page.forEach((id, index) => {
      const y = CH_FX_TOP + index * CH_FX_ROW;
      const focused = this.focus === MIX_ROWS.length + index;
      const value = this.effectValue(id);
      const info = TRACK_EFFECT_BY_ID[id];
      if (focused) {
        this.frame.fillStyle(c.ooze, 0.12);
        this.frame.fillRect(CH_IN - 4, y - 1, CH_R - CH_IN + 8, CH_FX_ROW);
      }
      this.pushText(CH_IN, y, info.label, focused ? c.ward : c.textDim);
      const barX = CH_IN + 62;
      const barW = CH_R - CH_IN - 74;
      drawInset(this.bars, { x: barX, y: y - 1, width: barW, height: 8 }, 1, c);
      this.meterFill(barX, y - 1, barW, value, MIN_EFFECT, MAX_EFFECT, false, focused ? c.ward : c.ooze, c);
      this.pushText(CH_R, y - 1, effectLabel(value), focused ? c.ward : c.textPrimary, 1);
      this.zone({ x: barX, y: y - 4, width: barW, height: 13 }, () => { this.focus = MIX_ROWS.length + index; this.render(); }, (p) => {
        this.focus = MIX_ROWS.length + index;
        this.handlers.beginEdit();
        const inner = barW - 2;
        const at = Math.max(0, Math.min(inner, p.x - barX - 1));
        const next = clampEffect(Math.round((at / inner) * MAX_EFFECT));
        this.applyEffect(id, next);
        this.status = `${this.columnName()} ${info.label} ${effectLabel(next)}`;
        this.render();
      });
    });

    // HEAR: the reference's big button at the panel's foot.
    const hearLabel = isMachine ? 'HEAR PAD' : 'HEAR TRACK';
    this.miniButton({ x: CH_IN, y: CHANNEL.y + CHANNEL.height - 22, width: CH_R - CH_IN, height: 16 }, hearLabel, c, () => this.hear());
  }

  /** GROUPS: the song's own buses, one fader each — and a way to make another. */
  private drawGroups(c: UiColors): void {
    const buses = this.handlers.buses();
    const plus = newBusName(buses);
    this.miniButton({ x: GROUPS.x + GROUPS.width - 60, y: GROUPS.y + 3, width: 54, height: 13 }, '+ GROUP', c, () => {
      this.status = this.handlers.addBus();
      this.render();
    });
    if (buses.length === 0) {
      this.pushText(GROUPS.x + 8, GROUPS.y + 30, 'NO GROUPS YET.', c.textDim);
      this.pushText(GROUPS.x + 8, GROUPS.y + 44, 'A GROUP IS ONE FADER OVER', c.textDim);
      this.pushText(GROUPS.x + 8, GROUPS.y + 56, 'SEVERAL CHANNELS: PRESS + GROUP.', c.textDim);
      return;
    }
    buses.slice(0, MAX_BUSES).forEach((bus, index) => {
      const y = GROUPS.y + 24 + index * 17;
      const barX = GROUPS.x + 76;
      const barW = GROUPS.width - 76 - 44;
      this.pushText(GROUPS.x + 8, y + 1, clip(bus.name, 12), c.textPrimary);
      drawInset(this.bars, { x: barX, y: y, width: barW, height: 9 }, 1, c);
      this.meterFill(barX, y, barW, bus.level, 0, 100, false, c.textGreen, c);
      this.pushText(GROUPS.x + GROUPS.width - 8, y, levelLabel(bus.level), c.textPrimary, 1);
      this.zone({ x: barX, y: y - 3, width: barW, height: 14 }, undefined, (p) => {
        this.handlers.beginEdit();
        const inner = barW - 2;
        const at = Math.max(0, Math.min(inner, p.x - barX - 1));
        this.handlers.setBusLevel(bus.name, clampLevel(Math.round((at / inner) * 100)));
        this.status = `${bus.name} ${levelLabel(this.handlers.buses().find((one) => one.name === bus.name)?.level ?? bus.level)}`;
        this.render();
      });
    });
    if (plus === null) this.pushText(GROUPS.x + 8, GROUPS.y + GROUPS.height - 12, `${MAX_BUSES} GROUPS IS THE MOST A SONG HOLDS.`, c.danger);
  }

  /** ROOM: the shared reverb and echo, and the page's own shortcut legend. */
  private drawRoom(c: UiColors): void {
    const room = this.handlers.room();
    const rows: { label: string; value: number; which: 'reverb' | 'echo' }[] = [
      { label: 'REVERB', value: room.reverb, which: 'reverb' },
      { label: 'ECHO', value: room.echo, which: 'echo' },
    ];
    rows.forEach((row, index) => {
      const y = ROOM.y + 24 + index * 18;
      const barX = ROOM.x + 56;
      const barW = ROOM.width - 56 - 44;
      this.pushText(ROOM.x + 8, y + 1, row.label, c.textDim);
      drawInset(this.bars, { x: barX, y, width: barW, height: 9 }, 1, c);
      this.meterFill(barX, y, barW, row.value, 0, MAX_ROOM, false, c.textGreen, c);
      this.pushText(ROOM.x + ROOM.width - 8, y, roomLabel(row.value), c.textPrimary, 1);
      this.zone({ x: barX, y: y - 3, width: barW, height: 14 }, undefined, (p) => {
        this.handlers.beginEdit();
        const inner = barW - 2;
        const at = Math.max(0, Math.min(inner, p.x - barX - 1));
        const value = clampRoom(Math.round((at / inner) * MAX_ROOM));
        this.handlers.setRoom(row.which === 'reverb' ? value : room.reverb, row.which === 'echo' ? value : room.echo);
        this.status = `${row.which.toUpperCase()} ${roomLabel(value)}${value === 0 ? '  \u00b7  DRY.' : ''}`;
        this.render();
      });
    });
    HINTS.forEach((line, index) => {
      this.pushText(ROOM.x + 8, ROOM.y + 52 + index * 10, line, c.textDim);
    });
  }

  /** WHOLE MIX: the same effects as a channel's, on everything at once. */
  private drawMix(c: UiColors): void {
    const master = this.handlers.master();
    // A and B, in the panel's heading, lit on the side the song is playing. Two
    // separate boxes rather than one toggle, because "which one am I on?" is the
    // question this control exists to answer, and a light answers it at a glance.
    // They sit left of the panel's own pager and do not overlap it: two 15 px
    // boxes at 594 and 611, the pager from 628.
    this.toggleBox({ x: MIX.x + MIX.width - 118, y: MIX.y + 3, width: 15, height: 13 }, this.live === 0, c.textGreen, 'A', c, () => this.switchBalance(0));
    this.toggleBox({ x: MIX.x + MIX.width - 101, y: MIX.y + 3, width: 15, height: 13 }, this.live === 1, c.textGreen, 'B', c, () => this.switchBalance(1));
    const page = effectPages()[this.mixPage] ?? [];
    page.forEach((id, index) => {
      const y = MIX.y + 24 + index * 13;
      const info = TRACK_EFFECT_BY_ID[id];
      const value = clampEffect(master[id] ?? MIN_EFFECT);
      const barX = MIX.x + 70;
      const barW = MIX.x + MIX.width - 42 - barX;
      this.pushText(MIX.x + 8, y, info.label, c.textDim);
      drawInset(this.bars, { x: barX, y: y - 1, width: barW, height: 8 }, 1, c);
      this.meterFill(barX, y - 1, barW, value, MIN_EFFECT, MAX_EFFECT, false, c.textGreen, c);
      this.pushText(MIX.x + MIX.width - 8, y - 1, effectLabel(value), c.textPrimary, 1);
      this.zone({ x: barX, y: y - 4, width: barW, height: 13 }, undefined, (p) => {
        this.handlers.beginEdit();
        const inner = barW - 2;
        const at = Math.max(0, Math.min(inner, p.x - barX - 1));
        const next = clampEffect(Math.round((at / inner) * MAX_EFFECT));
        this.handlers.setMasterEffect(id, next);
        this.status = next === MIN_EFFECT
          ? `${info.label} OFF  \u00b7  THE WHOLE MIX IS BACK TO ITS PLAIN SOUND.`
          : `${info.label} ${effectLabel(next)}  \u00b7  ${info.high.toUpperCase()}`;
        this.render();
      });
    });
  }

  /** WHOLE MIX's pager, drawn in the panel's own heading row. */
  private drawMixPager(c: UiColors): void {
    const pages = effectPages().length;
    if (pages <= 1) return;
    this.pager({ x: MIX.x + MIX.width - 84, y: MIX.y + 3, width: 76, height: 13 }, this.mixPage, pages, c,
      () => { this.mixPage = clampPage(this.mixPage - 1, pages); this.render(); },
      () => { this.mixPage = clampPage(this.mixPage + 1, pages); this.render(); });
  }

  // --- the chart's own values -----------------------------------------------

  /** The number a THIS CHANNEL mix row shows. */
  private mixRowValue(row: MixRowId): number {
    if (isMachineChannel(this.selected)) {
      const machine = this.handlers.machine();
      if (!machine) return 0;
      switch (row) {
        case 'level': return machine.level;
        case 'pan': return machine.pan;
        case 'duck': return machine.duck;
        case 'verb': return machine.verb;
        case 'echo': return machine.echo;
        default: return 0;
      }
    }
    const track = this.handlers.track(this.selected);
    if (!track) return 0;
    // BUS is the one row of the six that is a NAME rather than a number, so it
    // has no place in this function: the panel draws it as a word and reports it
    // through `nextBusChoice` instead.
    if (row === 'bus') return 0;
    return track[row];
  }

  private mixRowDisplay(row: MixRowId, value: number): string {
    switch (row) {
      case 'level': return levelLabel(value);
      case 'pan': return panLabel(value);
      case 'verb': case 'echo': return sendLabel(value);
      case 'duck': return duckLabel(value);
      default: return '';
    }
  }

  private mixRowRange(row: MixRowId): { min: number; max: number; signed: boolean } {
    switch (row) {
      case 'pan': return { min: -MAX_PAN, max: MAX_PAN, signed: true };
      case 'duck': return { min: 0, max: MAX_DUCK, signed: false };
      default: return { min: 0, max: 100, signed: false };
    }
  }

  /** Write one of the panel's six rows, wherever the value came from. */
  private applyMixRow(row: MixRowId, value: number): void {
    if (isMachineChannel(this.selected)) {
      if (row === 'bus') return;
      const clamped = row === 'pan' ? clampPan(value) : clampEffect(row === 'duck' ? clampDuck(value) : clampLevel(value));
      this.status = this.handlers.setMachineMix(row, clamped);
      return;
    }
    switch (row) {
      case 'level': this.handlers.setLevel(this.selected, clampLevel(value)); break;
      case 'pan': this.handlers.setPan(this.selected, clampPan(value)); break;
      case 'verb': case 'echo': this.handlers.setSend(this.selected, row, clampSend(value)); break;
      case 'duck': this.handlers.setDuck(this.selected, clampDuck(value)); break;
      case 'bus': break;
    }
    this.status = `${this.columnName()} ${MIX_ROW_LABEL[row]} ${this.mixRowDisplay(row, this.mixRowValue(row))}`;
  }

  /** Assign a group to whichever column is selected. */
  private applyBus(name: string | null): void {
    if (isMachineChannel(this.selected)) this.handlers.setMachineBus(name);
    else this.handlers.setBus(this.selected, name);
  }

  /** One channel effect's or the machine's value, as the FX rows read it. */
  private effectValue(id: TrackEffectId): number {
    if (isMachineChannel(this.selected)) return clampEffect(this.handlers.machine()?.effects[id] ?? MIN_EFFECT);
    return clampEffect(this.handlers.track(this.selected)?.[id] ?? MIN_EFFECT);
  }

  /** Write one effect back, to the channel or to the machine. */
  private applyEffect(id: TrackEffectId, amount: number): void {
    if (isMachineChannel(this.selected)) this.handlers.setMachineEffect(id, amount);
    else this.handlers.setEffect(this.selected, id, amount);
  }

  /** How the BUS field writes a name, or `NONE`. */
  private busValueLabel(name: string | null, buses: readonly Bus[]): string {
    if (name === null) return 'NONE';
    const known = buses.some((bus) => bus.name === name.toUpperCase());
    return known ? name.toUpperCase() : `${name.toUpperCase()}?`;
  }

  // --- the page's own controls ----------------------------------------------

  /** The reference's vertical fader: a groove, a fill from the foot, and a knob. */
  private verticalFader(
    layout: StripLayout,
    value: number,
    quiet: boolean,
    onGrab: () => void,
    onSet: (pointer: Phaser.Input.Pointer) => void,
  ): void {
    const w = 7;
    const x = layout.x + Math.floor((layout.width - w) / 2);
    const y = layout.faderY;
    const h = layout.faderH;
    const c = activeColors();
    drawInset(this.bars, { x, y, width: w, height: h }, 1, c);
    const inner = h - 2;
    const filled = Math.max(0, Math.min(inner, Math.round(inner * (value / 100))));
    if (filled > 0) {
      this.bars.fillStyle(quiet ? c.stone : c.textGreen, quiet ? 0.5 : 0.85);
      this.bars.fillRect(x + 1, y + h - 1 - filled, w - 2, filled);
    }
    // The knob: a light cap wherever the fader sits, which is how a fader is read.
    const knobY = y + h - 1 - filled;
    this.bars.fillStyle(c.ward, quiet ? 0.4 : 1);
    this.bars.fillRect(x - 1, knobY - 3, w + 2, 4);
    this.bars.fillStyle(c.ink, 1);
    this.bars.fillRect(x - 1, knobY - 1, w + 2, 1);
    this.zone({ x: x - 6, y: y - 4, width: w + 12, height: h + 8 }, onGrab, onSet);
  }

  /** A send row: its label, its number, and a bar you click. */
  private sendRow(
    layout: StripLayout,
    label: string,
    labelY: number,
    barY: number,
    amount: number,
    quiet: boolean,
    c: UiColors,
    onSet: (amount: number) => void,
  ): void {
    const x = layout.x;
    const barW = layout.width - 4;
    this.pushText(x + 2, labelY, label, c.textDim);
    this.pushText(x + layout.width - 2, labelY, sendLabel(amount), c.textPrimary, 1);
    drawInset(this.bars, { x: x + 2, y: barY, width: barW, height: 5 }, 1, c);
    const inner = barW - 2;
    const filled = Math.round(inner * (amount / 100));
    if (filled > 0) {
      this.bars.fillStyle(c.ooze, quiet ? 0.3 : 0.8);
      this.bars.fillRect(x + 3, barY + 1, filled, 3);
    }
    this.zone({ x: x + 2, y: barY - 4, width: barW, height: 13 }, undefined, (p) => {
      const at = Math.max(0, Math.min(inner, p.x - x - 3));
      onSet(Math.round((at / inner) * 100));
    });
  }

  /** The BUS field: a name with a caret, cycling on a press. */
  private busField(
    x: number,
    y: number,
    width: number,
    name: string | null,
    buses: readonly Bus[],
    c: UiColors,
    press: () => void,
  ): void {
    const rect: Rect = { x, y, width: width - 4, height: 14 };
    drawInset(this.bars, rect, 1, c);
    const text = this.busValueLabel(name, buses);
    this.pushText(rect.x + 4, rect.y + 3, clip(text, Math.max(3, Math.floor((rect.width - 14) / 5))), c.textPrimary);
    // The caret: a small triangle in the field's right corner, the same mark the
    // drum machine's own fields draw.
    const cx = rect.x + rect.width - 8;
    const cy = rect.y + Math.floor(rect.height / 2) - 1;
    this.bars.fillStyle(c.textDim, 0.95);
    for (let i = 0; i < 4; i++) this.bars.fillRect(cx + i, cy + Math.abs(2 - i) - 1, 1, 1);
    this.zone(rect, press);
  }

  /** `-  1/2  +`, the pager shape both effect panels wear. */
  private pager(
    rect: Rect,
    page: number,
    pages: number,
    c: UiColors,
    back: () => void,
    forward: () => void,
  ): void {
    drawInset(this.bars, rect, 1, c);
    const third = Math.floor(rect.width / 3);
    this.bars.fillStyle(c.stoneHi, 0.3);
    this.bars.fillRect(rect.x + third, rect.y + 1, 1, rect.height - 2);
    this.bars.fillRect(rect.x + third * 2, rect.y + 1, 1, rect.height - 2);
    const ty = rect.y + Math.floor((rect.height - 8) / 2) + 1;
    this.pushText(rect.x + Math.floor(third / 2), ty, '<', c.textPrimary, 0.5);
    this.pushText(rect.x + third + Math.floor(third / 2), ty, `${page + 1}/${pages}`, c.textPrimary, 0.5);
    this.pushText(rect.x + third * 2 + Math.floor((rect.width - third * 2) / 2), ty, '>', c.textPrimary, 0.5);
    this.zone({ x: rect.x, y: rect.y, width: third, height: rect.height }, back);
    this.zone({ x: rect.x + third * 2, y: rect.y, width: rect.width - third * 2, height: rect.height }, forward);
  }

  /** The two toggle keys a channel strip wears, side by side. */
  private stackedKeys(
    layout: StripLayout,
    muted: boolean,
    soloed: boolean,
    c: UiColors,
    actions: { onMute: () => void; onSolo: () => void },
  ): void {
    const gap = 3;
    const each = Math.floor((layout.width - 4 - gap) / 2);
    this.toggleBox({ x: layout.x + 2, y: layout.keysY, width: each, height: 12 }, muted, c.danger, 'M', c, actions.onMute);
    this.toggleBox({ x: layout.x + 2 + each + gap, y: layout.keysY, width: each, height: 12 }, soloed, c.ward, 'O', c, actions.onSolo);
  }

  /** A box that fills in when it is on, with a short letter in it. */
  private toggleBox(r: Rect, on: boolean, onColor: number, glyph: string, c: UiColors, press: () => void): void {
    drawInset(this.bars, r, 1, c);
    if (on) {
      this.bars.fillStyle(onColor, 0.8);
      this.bars.fillRect(r.x + 1, r.y + 1, r.width - 2, r.height - 2);
    }
    this.pushText(r.x + r.width / 2, r.y + 2, clip(glyph, Math.max(1, Math.floor(r.width / 5))), on ? c.ink : c.textPrimary, 0.5);
    this.zone(r, press);
  }

  /**
   * A small outlined button: the reference's most common control.
   *
   * `dim` is for a button that is pressable but has nothing to do yet — a PASTE
   * with an empty clipboard. It stays live rather than being disabled, because
   * the words it says when pressed are more use than a dead pixel, but it is drawn
   * in the quiet colour so the state is visible before it is pressed.
   */
  private miniButton(r: Rect, label: string, c: UiColors, press: () => void, dim = false): void {
    drawInset(this.bars, r, 1, c);
    this.bars.fillStyle(c.stoneHi, 0.35);
    this.bars.fillRect(r.x + 1, r.y + 1, r.width - 2, 1);
    this.pushText(r.x + Math.floor(r.width / 2), r.y + Math.floor((r.height - 8) / 2) + 1, label, dim ? c.textDim : c.textPrimary, 0.5);
    this.zone(r, press);
  }

  /** A read-only field with a caret, for the panel's bus row. */
  private field(r: Rect, text: string, c: UiColors, press: () => void): void {
    drawInset(this.bars, r, 1, c);
    this.pushText(r.x + 4, r.y + 3, clip(text, Math.max(3, Math.floor((r.width - 14) / 5))), c.textPrimary);
    this.zone(r, press);
  }

  /** A groove's fill, signed from the centre or grown from the left. */
  private meterFill(
    x: number,
    y: number,
    width: number,
    value: number,
    min: number,
    max: number,
    signed: boolean,
    color: number,
    c: UiColors,
  ): void {
    const inner = width - 2;
    if (signed) {
      const mid = Math.floor(inner / 2);
      const span = Math.max(1, max - min);
      const offset = Math.round(mid * (((value - min) / span) * 2 - 1));
      if (offset !== 0) {
        this.bars.fillStyle(color, 0.85);
        const from = offset < 0 ? mid + offset : mid;
        this.bars.fillRect(x + 1 + from, y + 1, Math.abs(offset), 7);
      }
      this.bars.fillStyle(c.textDim, 0.9);
      this.bars.fillRect(x + 1 + mid, y + 1, 1, 7);
      return;
    }
    const span = Math.max(1, max - min);
    const filled = Math.max(0, Math.min(inner, Math.round(inner * ((value - min) / span))));
    if (filled > 0) {
      this.bars.fillStyle(color, 0.85);
      this.bars.fillRect(x + 1, y + 1, filled, 7);
    }
  }

  /**
   * One line of copy, on the layer above every panel.
   *
   * POOLED: the object is reused from the last render and only the fields that
   * actually changed are written. That matters because `uiText` rasterizes a Text
   * at 4x resolution and one mix page builds over a hundred of them, so creating
   * them afresh each time cost hundreds of milliseconds per paint. `setText` is
   * called only when the string changes, and colour/origin/position only when they
   * move, so an unchanged label costs nothing at all.
   */
  private pushText(x: number, y: number, text: string, color: number, anchorX = 0): void {
    let obj = this.rowTexts[this.textCount];
    if (!obj) {
      obj = uiText(this.scene, x, y, text, { size: 8, color, origin: { x: anchorX, y: 0 } });
      this.layer.add(obj);
      this.rowTexts.push(obj);
      this.textState.push({ text, color, anchorX, x, y });
    } else {
      const state = this.textState[this.textCount]!;
      if (state.text !== text) { obj.setText(text); state.text = text; }
      if (state.color !== color) { obj.setColor(intToCss(color)); state.color = color; }
      if (state.anchorX !== anchorX) { obj.setOrigin(anchorX, 0); state.anchorX = anchorX; }
      if (state.x !== x || state.y !== y) { obj.setPosition(Math.round(x), Math.round(y)); state.x = x; state.y = y; }
    }
    obj.setVisible(this.opened);
    this.textCount += 1;
  }

  /**
   * A click surface, POOLED like the text.
   *
   * The zone keeps its place on the layer, is re-positioned, re-sized only when
   * the layout changes (which is when its hit area is re-armed), and re-bound to
   * this render's handler.
   */
  private zone(r: Rect, press?: () => void, pointerDown?: (p: Phaser.Input.Pointer) => void): void {
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
      else current.press?.();
    });
    current.zone.setVisible(this.opened);
    this.zoneCount += 1;
  }

  destroy(): void {
    this.unsubscribe();
    for (const text of this.rowTexts) text.destroy();
    for (const entry of this.staticCopy) entry.obj.destroy();
    for (const zone of this.rowZones) zone.zone.destroy();
    this.back.destroy();
    this.frame.destroy();
    this.bars.destroy();
    this.layer.destroy();
    this.curtain.destroy();
  }
}

/** Clip a name to a character budget, so a column stays one line. */
function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)) + '\u2026';
}

/** The colour a piece of static copy wears, resolved on every render. */
function colorForRole(role: TextRole, c: UiColors): number {
  switch (role) {
    case 'heading': return c.ooze;
    case 'accent': return c.ooze;
    case 'dim': return c.textDim;
    default: return c.textPrimary;
  }
}

