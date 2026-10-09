import type Phaser from 'phaser';
import {
  activeColors,
  Button,
  drawDivider,
  drawInset,
  drawPanel,
  intToCss,
  onThemeChanged,
  uiText,
  type Rect,
  type UiColors,
} from 'phaser-ui-canvas';

import {
  clampLayerField,
  LAYER_FIELDS,
  layerAt,
  layerCount,
  MAX_LAYERS,
  neutralLayer,
  type Layer,
  type LayerField,
  type StackedSound,
} from '../model/instrument';
import {
  clampParam,
  MAX_PARAM,
  MIN_PARAM,
  PARAM_STEP,
  VOICE_PARAMS,
  WAVES,
  WAVE_LABELS,
  type VoiceParamId,
  type Wave,
} from '../model/voice';
import {
  clampEffect,
  EFFECT_STEP,
  effectLabel,
  MAX_EFFECT,
  MIN_EFFECT,
  TRACK_EFFECTS,
  TRACK_EFFECT_BY_ID,
  type ChannelEffects,
  type TrackEffectId,
} from '../model/song';
import { wrap } from './instrumentRows';
import { menuIntent } from './menuKeys';

/**
 * PatchMenu — the F7 menu: what a channel is MADE of.
 *
 * `F4` answers "what does this channel sound like" with a name and nine knobs,
 * and that is still the right answer for almost every channel in a song. This
 * menu is the layer UNDER that answer, and it exists because one oscillator is a
 * buzzer: a channel's sound is really a STACK of up to four layers — the voice
 * being layer 1 — and every one of them plays every note the channel plays.
 *
 * ── Why a menu of its own ─────────────────────────────────────────────────────
 * The alternative was a layer strip inside `F4`, and it loses twice. To a
 * beginner, `F4` is "pick an instrument and shape it", and nothing here belongs
 * in that sentence. To the code, every one of `F4`'s handlers is about a voice —
 * apply a preset, save a sound for the next song — and making each of them
 * layer-aware would put a second meaning on a screen that has one. So the deep
 * half of the instrument lives behind its own key, the way `F6` does, and `F4`
 * is left exactly as it was.
 *
 * ── The two halves of the screen ──────────────────────────────────────────────
 * Across the top is the STACK ITSELF: one chip per layer — `1 VOICE SQR`,
 * `2 SAW`, `3 TRI` — which is the one thing a stack has to say at a glance: how
 * many there are, and what each one is. Under it the body is split down the
 * middle. The left half says what a layer IS: its waveform, then the three
 * things a voice does not have — `octave`, `detune` and `gain`. The right half
 * holds the nine knobs it shares with a voice, in the same order `F4` shows
 * them, so reading the two screens side by side is reading the same list.
 *
 * Every control is a row the arrows will reach, a value `-`/`+` will move, and a
 * bar you can click where you want it. That is the whole interface, and it is
 * deliberately the same one `F4` and `F5` already taught.
 *
 * ── Why layer 1 is shown but not editable ─────────────────────────────────────
 * Layer 1 IS the voice, so it has no pitch and no level of its own: it is in
 * tune with itself at full level by definition. That is not a limitation, it is
 * the identity every song written before stacks existed depends on. So the three
 * fields are drawn on layer 1 with the REASON where their value would be — a row
 * that vanishes reads as a bug, and a number that cannot matter would be a lie —
 * and touching one says how to get what you were reaching for.
 *
 * ── What adding a layer does ──────────────────────────────────────────────────
 * `INS` (or `LAYER +`) adds a COPY of the layer below, so what you just added is
 * audible at once and the first move is to MOVE it: detune it a few cents for
 * width, drop it an octave for weight, turn its gain down so the stack grows
 * rather than merely gets louder. `DEL` takes the selected layer out and shifts
 * the ones above it down, the same way `DEL` takes a bar out of the order list —
 * a stack is a list, and this app already has one way to take an item out of one.
 *
 * The scene owns the song, the undo history and the audio graph, so every edit
 * here is a callback: the menu never writes to the model, and it re-reads the
 * channel on every redraw rather than holding a copy of it.
 */

export interface PatchMenuHandlers {
  /** The menu opened or closed, so the scene can pause its own input. */
  onOpenChange?: (open: boolean) => void;
  /** How many channels the song has, for the `CHANNEL -` / `CHANNEL +` buttons. */
  channels: () => number;
  /**
   * The channel being edited: its index, its name, and its sound.
   *
   * The sound is handed over whole and read through the model's own `layerAt` /
   * `layerCount`, so the menu never has to know that layer 1 is stored inside
   * the voice and layers 2..4 in an array — one list is what it draws, and one
   * list is what the model gives it.
   */
  track: () => { index: number; name: string; sound: StackedSound; effects: ChannelEffects };
  /** Move the editor to another channel, so the menu edits THAT one. */
  selectChannel: (index: number) => void;
  /** Add a layer above the top one, as a copy of the one below. Returns the status line. */
  addLayer: () => string;
  /** Take out layer `index` (1-based, 2 or more). Returns the status line. */
  removeLayer: (index: number) => string;
  /** Set one layer's waveform. */
  setLayerWave: (index: number, wave: Wave) => string;
  /** Set one layer's `octave`, `detune` or `gain`, already in range. */
  setLayerField: (index: number, id: LayerField, value: number) => string;
  /** Set one of a layer's nine knobs, already a 0..100 percentage. */
  setLayerKnob: (index: number, id: VoiceParamId, value: number) => string;
  /**
   * Set one of the channel's six effects, already a 0..100 percentage.
   *
   * An effect belongs to the CHANNEL rather than to the sound — the same pad
   * wants no drive under a singer and a lot of it under a solo — which is why it
   * is a callback of its own rather than another field of a layer.
   */
  setEffect: (id: TrackEffectId, value: number) => string;
  /** Sound a note on the current channel, so a layer or an effect can be heard. */
  audition: () => void;
}

/** The canvas the app is drawn in. */
const CANVAS_W = 720;
const CANVAS_H = 405;

/** The menu frame, in canvas coordinates. The same size as the voice menu. */
const MODAL: Rect = { x: 64, y: 22, width: 592, height: 350 };

/** Render depths: dim < curtain < frame < text and buttons. Above the toast. */
const DEPTH_DIM = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_FRONT = 980;

const BODY_X = MODAL.x + 4;
const BODY_W = MODAL.width - 8;

/**
 * The chip strip: one chip per layer a channel can have, sized so four of them
 * fill the body exactly. A stack that is shorter than four leaves the rest of the
 * row empty, which is what says "there is room for more" without a sentence.
 */
const STRIP_Y = MODAL.y + 34;
const CHIP_H = 16;
const CHIP_W = Math.floor((BODY_W - 8 * (MAX_LAYERS - 1)) / MAX_LAYERS);
const CHIP_GAP = Math.floor((BODY_W - CHIP_W * MAX_LAYERS) / Math.max(1, MAX_LAYERS - 1));
/** The rule that closes the strip off from the two columns under it. */
const RULE_Y = STRIP_Y + CHIP_H + 6;

/**
 * The two columns, on ONE grid.
 *
 * The left column is four rows — the waveform and the three things a layer adds
 * — and the right one is the nine knobs it shares with a voice. They start at
 * the same y and step by the same amount, so the whole screen reads as one list
 * of dials with a gap in the middle rather than as two panes that nearly match.
 *
 * The row height is arithmetic rather than taste: nine rows, the status line and
 * the buttons have to fit inside 350 pixels, and this is what is left over.
 */
const GRID_TOP = RULE_Y + 8;
const ROW_H = 20;
const LEFT_X = BODY_X;
const LEFT_W = 280;
const RIGHT_X = BODY_X + LEFT_W + 14;
const RIGHT_W = BODY_W - LEFT_W - 14;

/** Where a row's bar sits inside its row, and how tall it is. */
const BAR_Y = 11;
const BAR_H = 7;

/** The readout and the notes that fill the space under the left column. */
const READOUT_Y = GRID_TOP + 4 * ROW_H + 12;
const DETAIL_Y = READOUT_Y + 14;
const NOTES_Y = DETAIL_Y + 20;
const NOTE_H = 14;

/** The status line, and the rule that closes the grid off above it. */
const STATUS_RULE_Y = GRID_TOP + VOICE_PARAMS.length * ROW_H + 6;
const STATUS_TOP = STATUS_RULE_Y + 8;
const HINT_TOP = STATUS_TOP + 20;
const HINT_H = 14;

const BTN_H = 20;
const BTN_GAP = 6;
const BTN_COUNT = 7;
const BTN_W = Math.floor((BODY_W - BTN_GAP * (BTN_COUNT - 1)) / BTN_COUNT);
const BTN_TOP = MODAL.y + MODAL.height - BTN_H - 6;

/**
 * How much further a bracket press moves than an arrow press.
 *
 * One rule rather than a per-row table: an arrow is one step and a bracket is
 * five, so "left and right for fine, `[` and `]` to get there faster" is a thing
 * a person can hold in their head while they are listening rather than reading.
 */
const COARSE = 5;

/** Which half of the grid a row is drawn in. `strip` is the chip bar itself. */
type Column = 'strip' | 'left' | 'right';

/**
 * The two things this screen can be showing.
 *
 * `layers` is what the channel is MADE of, `fx` is what it is played through.
 * They are two pages of one screen rather than two screens because they are two
 * answers to one question — what does this channel sound like — and because the
 * second page needs exactly the geometry the first one already has: a column of
 * dials with a name, two ends, a value and a bar.
 */
type Page = 'layers' | 'fx';

/** Everything the keyboard can be on: the strip, the waveform, then every dial. */
type RowKind = 'strip' | 'wave' | LayerField | VoiceParamId | TrackEffectId;

/** A row's own shape: what it is called, where it lives, and what it can be. */
interface RowSpec {
  kind: RowKind;
  /** Which page the row lives on, so one walker can serve both. */
  page: Page;
  label: string;
  caption: string;
  min: number;
  max: number;
  step: number;
  col: Column;
  /** The row's line within its column, and its index in `ROWS` for the strip. */
  line: number;
}

/**
 * Every control on the screen, in the order the arrows walk them.
 *
 * Built from the model's own tables rather than written out twice: the three
 * fields come from `LAYER_FIELDS` and the nine knobs from `VOICE_PARAMS`, so a
 * knob can never appear here without existing in the language, in the catalog and
 * in the file format too. The table is built once, at module load, which is also
 * what lets a row be identified by its position in it.
 */
function buildRows(): RowSpec[] {
  const out: RowSpec[] = [
    {
      kind: 'strip', page: 'layers', label: 'LAYERS', caption: 'THE STACK', col: 'strip', line: 0,
      min: 1, max: MAX_LAYERS, step: 1,
    },
    {
      kind: 'wave', page: 'layers', label: 'WAVE', caption: `${WAVES[0]} ... ${WAVES[WAVES.length - 1]}`, col: 'left', line: 0,
      min: 0, max: WAVES.length - 1, step: 1,
    },
  ];
  LAYER_FIELDS.forEach((field, i) => out.push({
    kind: field.id, page: 'layers', label: field.label, caption: `${field.low} ... ${field.high}`,
    col: 'left', line: 1 + i, min: field.min, max: field.max, step: field.step,
  }));
  VOICE_PARAMS.forEach((param, i) => out.push({
    kind: param.id, page: 'layers', label: param.label, caption: `${param.low} ... ${param.high}`,
    col: 'right', line: i, min: MIN_PARAM, max: MAX_PARAM, step: PARAM_STEP,
  }));
  return out;
}

/**
 * The effects page: the one-knob effects, in the model's own order.
 *
 * Two columns rather than one, because the screen above already reads as two
 * columns of dials and the effects split the same way the model presents them:
 * the six that shape a SOUND (`drive`, `crush`, `cab`, `tape`, `radio`, `vinyl`),
 * then the two that shape a MIX and the one that shapes a PART. The COLUMN BOUNDARY
 * is the model's own grouping rather than a count, and the model keeps its sound
 * family at the front of the list — which is why a seventh and an eighth effect
 * cost this file nothing, and why the ninth and tenth each cost exactly one
 * character.
 *
 * The order within a column is `TRACK_EFFECTS`', so this screen, the `track`
 * line, the file and the catalog cannot disagree about what comes first.
 */
const FX_COLUMN_SPLIT = 6;
function buildEffects(): RowSpec[] {
  return TRACK_EFFECTS.map((effect, i) => ({
    kind: effect.id, page: 'fx' as Page, label: effect.label,
    caption: `${effect.low.toUpperCase()} ... ${effect.high.toUpperCase()}`,
    col: i < FX_COLUMN_SPLIT ? 'left' : 'right', line: i % FX_COLUMN_SPLIT,
    min: MIN_EFFECT, max: MAX_EFFECT, step: EFFECT_STEP,
  }));
}

/**
 * The two pages, built at module load.
 *
 * Both calls live HERE, at the END of the constants and under the functions that
 * read them, and that placement is load-bearing rather than tidy: a table built
 * at module load runs in SOURCE ORDER, so a call anywhere above a `const` it
 * reads throws a `ReferenceError` before the first frame is ever drawn — which is
 * a blank screen and nothing else to go on. `ROWS` reads the layout constants
 * above it and `FX_ROWS` reads `FX_COLUMN_SPLIT`, three lines up, and neither can
 * be hoisted past its own inputs.
 */
const ROWS: readonly RowSpec[] = buildRows();
const FX_ROWS: readonly RowSpec[] = buildEffects();

/** The index of the waveform row, which is drawn as segments rather than a bar. */
const WAVE_ROW = 1;

/** Which theme colour a piece of copy wears, so a recolour can find it. */
type TextRole = 'body' | 'dim' | 'accent';

interface StaticText {
  obj: Phaser.GameObjects.Text;
  role: TextRole;
}

export class PatchMenu {
  private readonly scene: Phaser.Scene;
  private readonly handlers: PatchMenuHandlers;

  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  /** Everything the controls are: rebuilt on every render, like every menu here. */
  private readonly rowLayer: Phaser.GameObjects.Container;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly buttons: Button[] = [];
  private readonly staticCopy: StaticText[] = [];
  /** The chrome that changes every render, kept out of the colour-repainting loop. */
  private readonly dynamic: Phaser.GameObjects.Text[] = [];

  /** A row's label, its two ends and its value, three pooled texts per render. */
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private rowZones: Phaser.GameObjects.Zone[] = [];

  /** Which row the keyboard is on: an index into the page's own table. */
  private focus = 0;
  /**
   * Which page is showing, and where the keyboard was on each of them.
   *
   * Remembered per page rather than shared, because the two tables have nothing
   * to do with each other: row 7 is a knob on one and `gate` on the other, so
   * carrying an index across would land the reader somewhere they never were.
   */
  private page: Page = 'layers';
  private readonly focusMemory: Record<Page, number> = { layers: 0, fx: 0 };
  /** Which layer is being edited, 0-based — so 0 is the voice, layer 1. */
  private selected = 0;
  private status = '';
  private opened = false;
  private readonly unsubscribe: () => void;

  private targetObj: Phaser.GameObjects.Text | null = null;
  private titleObj: Phaser.GameObjects.Text | null = null;
  private readoutObj: Phaser.GameObjects.Text | null = null;
  private detailObj: Phaser.GameObjects.Text | null = null;
  private statusObj: Phaser.GameObjects.Text | null = null;
  /** The four lines under the grid and the two under the status: this screen's manual. */
  private readonly notes: Phaser.GameObjects.Text[] = [];
  private readonly hints: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, handlers: PatchMenuHandlers) {
    this.scene = scene;
    this.handlers = handlers;

    this.dim = scene.add.graphics().setDepth(DEPTH_DIM);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.rowLayer = scene.add.container(0, 0).setDepth(DEPTH_FRONT + 1);

    // A full-screen zone in front of the app, so a stray click under the menu
    // cannot edit the song. It dismisses the menu as well, because a modal you
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

  get isOpen(): boolean { return this.opened; }

  show(): void {
    // Open on the channel the cursor is in, at the VOICE: the bottom of the stack
    // is the sound the channel already was, so the screen opens showing what you
    // were just listening to rather than the top of something you have not heard.
    // ...and on the LAYERS page, because a stack is the reason this screen exists.
    this.selected = 0;
    this.page = 'layers';
    this.focus = this.focusMemory.layers = 0;
    this.status = '';
    this.setOpen(true);
    this.render();
    // Opening is SILENT on purpose, exactly as `F4` is: this is a look at the
    // sound, not a request to hear it. A note plays when you change something.
  }

  hide(): void { this.setOpen(false); }

  // --- what is being edited --------------------------------------------------

  /**
   * The rows of the page being shown, which is the whole of the page switch.
   *
   * One walker — focus, `-`/`+`, a click, the coarse keys — serves both pages
   * because it only ever asks the ACTIVE table what is under the keyboard; the
   * only other thing a page owns is which of the two models a row writes to, and
   * `rowValue` / `rowSet` ask `spec.page` that.
   */
  private rows(): readonly RowSpec[] {
    return this.page === 'fx' ? FX_ROWS : ROWS;
  }

  private sound(): StackedSound {
    return this.handlers.track().sound;
  }

  /** The channel's six effects, read from the song on every draw. */
  private effects(): ChannelEffects {
    return this.handlers.track().effects;
  }

  /** The layer being edited, as the model hands it back — layer 1 included. */
  private layer(): Layer {
    const sound = this.sound();
    return layerAt(sound, Math.min(this.selected + 1, layerCount(sound))) ?? neutralLayer();
  }

  /** The 1-based index of the layer being edited, as the model and the script count. */
  private index(): number {
    return Math.min(this.selected + 1, layerCount(this.sound()));
  }

  /** Keep the selected layer inside the stack, after a layer is taken out. */
  private clampSelection(): void {
    this.selected = Math.max(0, Math.min(this.selected, layerCount(this.sound()) - 1));
  }

  private setOpen(open: boolean): void {
    // Only report a CHANGE: the constructor closes once to reach a known state,
    // and the scene would otherwise hear "closed" before its input exists.
    const changed = open !== this.opened;
    this.opened = open;
    this.dim.setVisible(open);
    this.frame.setVisible(open);
    this.curtain.setVisible(open);
    this.reveal();
    if (changed) this.handlers.onOpenChange?.(open);
  }

  /** Turn every object on or off, so a repaint and a close agree about visibility. */
  private reveal(): void {
    const open = this.opened;
    this.rowLayer.setVisible(open);
    for (const entry of this.staticCopy) entry.obj.setVisible(open);
    for (const button of this.buttons) button.container.setVisible(open);
    for (const text of this.rowTexts) text.setVisible(open);
    for (const zone of this.rowZones) zone.setVisible(open);
    for (const obj of this.dynamic) obj.setVisible(open);
  }

  // --- keyboard --------------------------------------------------------------

  /**
   * The keys, in one place.
   *
   * Up/Down (and `W`/`S`, through the shared table) walk the rows; Left/Right are
   * claimed here FIRST, because in a menu whose rows each hold a VALUE a
   * horizontal arrow means the value rather than the next row — the same bargain
   * `F5` makes with its level bars. `[`/`]` are the same key five times as far,
   * and `INS`/`DEL` are the two things a stack needs that no other menu has.
   */
  handleKey(e: KeyboardEvent): void {
    if (e.code === 'Tab') { e.preventDefault(); this.setPage(this.page === 'fx' ? 'layers' : 'fx'); return; }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); this.nudge(-1, 1); return; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); this.nudge(1, 1); return; }
    if (e.code === 'BracketLeft' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
      e.preventDefault(); this.nudge(-1, COARSE); return;
    }
    if (e.code === 'BracketRight' || e.code === 'Equal' || e.code === 'NumpadAdd') {
      e.preventDefault(); this.nudge(1, COARSE); return;
    }
    if (e.code === 'Insert') { e.preventDefault(); this.addLayer(); return; }
    if (e.code === 'Delete') { e.preventDefault(); this.removeLayer(); return; }
    if (e.code === 'KeyZ') { e.preventDefault(); this.cycleChannel(-1); return; }
    if (e.code === 'KeyX') { e.preventDefault(); this.cycleChannel(1); return; }

    const intent = menuIntent(e.code);
    if (intent === 'close') { e.preventDefault(); this.hide(); return; }
    if (intent === 'up') { e.preventDefault(); this.moveFocus(-1); return; }
    if (intent === 'down') { e.preventDefault(); this.moveFocus(1); return; }
    if (intent === 'first') { e.preventDefault(); this.moveFocus(-this.rows().length); return; }
    if (intent === 'last') { e.preventDefault(); this.moveFocus(this.rows().length); return; }
    if (intent === 'pick') { e.preventDefault(); this.audition(); }
  }

  private moveFocus(delta: number): void {
    this.focus = Math.max(0, Math.min(this.rows().length - 1, this.focus + delta));
    this.render();
  }

  /**
   * Change page, remembering where the keyboard was on the one being left.
   *
   * The status line is cleared rather than kept: a sentence about the last layer
   * would read as a sentence about the first effect.
   */
  private setPage(page: Page): void {
    if (page === this.page) return;
    this.focusMemory[this.page] = this.focus;
    this.page = page;
    this.focus = Math.min(this.focusMemory[page], this.rows().length - 1);
    this.status = '';
    this.render();
  }

  /** A horizontal key: the value of the row the keyboard is on, or the layer. */
  private nudge(direction: number, times: number): void {
    const spec = this.rows()[this.focus];
    if (!spec) return;
    if (spec.kind === 'strip') { this.pickLayer(direction); return; }
    this.rowSet(spec, this.rowValue(spec) + direction * spec.step * times);
  }

  /**
   * Left/Right on the strip: which layer is being edited.
   *
   * The strip is the one row whose "value" is not a number but a layer out of the
   * stack, so a horizontal key there picks rather than nudges. Saying which end
   * you have reached is friendlier than a key that silently stops.
   */
  private pickLayer(direction: number): void {
    const next = Math.max(0, Math.min(layerCount(this.sound()) - 1, this.selected + direction));
    if (next === this.selected) {
      this.status = direction < 0 ? 'THAT IS THE VOICE, THE BOTTOM OF THE STACK.' : 'THAT IS THE TOP LAYER.';
      this.render();
      return;
    }
    this.selectLayer(next);
  }

  private selectLayer(index: number): void {
    this.selected = index;
    this.status = index === 0
      ? 'THE VOICE: LAYER 1 OF THE STACK.'
      : `LAYER ${index + 1} OF ${layerCount(this.sound())}.`;
    this.hear();
  }

  /** The channel's six effects, as the dials of the FX page. */
  private drawEffects(g: Phaser.GameObjects.Graphics, c: ReturnType<typeof activeColors>): void {
    const effects = this.effects();
    for (const spec of FX_ROWS) {
      const value = effects[spec.kind as TrackEffectId] ?? MIN_EFFECT;
      this.drawDial(spec, value, effectLabel(value), g, c);
    }
  }

  // --- reading and writing a row ---------------------------------------------

  /** Where a row's value is right now, read from the model on every draw. */
  private rowValue(spec: RowSpec): number {
    if (spec.kind === 'strip') return this.selected;
    if (spec.page === 'fx') return this.effects()[spec.kind as TrackEffectId] ?? MIN_EFFECT;
    const layer = this.layer();
    if (spec.kind === 'wave') return Math.max(0, WAVES.indexOf(layer.wave));
    // The three fields a voice has not, named one by one so the compiler can see
    // that an `fx` id — ruled out with the page above — can never index a layer.
    if (spec.kind === 'octave' || spec.kind === 'detune' || spec.kind === 'gain') return layer[spec.kind];
    return layer[spec.kind as VoiceParamId];
  }

  /**
   * Write a row's value, by whichever door that row's kind goes through.
   *
   * The value is snapped to the row's own step first, so a click and a key press
   * can never land on two different numbers for the same intent — and the range
   * and the step are the ones the model, the script and the file format already
   * agree on, so the menu can invent neither.
   */
  private rowSet(spec: RowSpec, raw: number): void {
    if (spec.kind === 'strip') return;
    const snapped = Math.max(spec.min, Math.min(spec.max, Math.round(raw / spec.step) * spec.step));

    // An effect belongs to the channel, so it goes through the scene's own
    // effect door rather than through `setTrackLayer` — and it is clamped by the
    // model's own function, so a click cannot land on a value the script would
    // refuse.
    if (spec.page === 'fx') {
      const value = clampEffect(snapped);
      if (value === this.rowValue(spec)) return;
      this.status = this.handlers.setEffect(spec.kind as TrackEffectId, value);
      this.hear();
      return;
    }

    const layer = this.layer();
    const index = this.index();

    if (spec.kind === 'wave') {
      const wave = WAVES[snapped];
      if (wave === undefined || wave === layer.wave) return;
      this.status = this.handlers.setLayerWave(index, wave);
      this.hear();
      return;
    }

    // Layer 1 IS the voice, and a voice has no pitch and no level of its own:
    // asking for one is the wrong gesture, so the answer names the right one
    // rather than moving a number that could not matter.
    if (index === 1 && (spec.kind === 'octave' || spec.kind === 'detune' || spec.kind === 'gain')) {
      this.status = 'LAYER 1 IS THE VOICE: ITS PITCH AND LEVEL COME FROM THE CHANNEL. PRESS INS TO STACK ONE ABOVE IT.';
      this.render();
      return;
    }

    if (spec.kind === 'octave' || spec.kind === 'detune' || spec.kind === 'gain') {
      const id = spec.kind;
      const value = clampLayerField(id, snapped);
      if (layer[id] === value) return;
      this.status = this.handlers.setLayerField(index, id, value);
    } else {
      // The remaining kinds are the voice's knobs: the effects were ruled out
      // with the page, and the three fields with the branch above.
      const id = spec.kind as VoiceParamId;
      const value = clampParam(snapped);
      if (layer[id] === value) return;
      this.status = this.handlers.setLayerKnob(index, id, value);
    }
    this.hear();
  }

  // --- the two things only this menu does -----------------------------------

  private addLayer(): void {
    const before = layerCount(this.sound());
    this.status = this.handlers.addLayer();
    const after = layerCount(this.sound());
    // Move to what was just added — it is a copy of what was there, so the sound
    // has not changed yet and the thing to do next is to MOVE it.
    if (after > before) this.selected = after - 1;
    this.hear();
  }

  private removeLayer(): void {
    if (this.selected === 0) {
      this.status = 'LAYER 1 IS THE VOICE AND CANNOT BE REMOVED. MUTE THE CHANNEL, OR PICK ANOTHER VOICE.';
      this.render();
      return;
    }
    this.status = this.handlers.removeLayer(this.selected + 1);
    this.clampSelection();
    this.hear();
  }

  private cycleChannel(delta: number): void {
    const count = this.handlers.channels();
    const current = this.handlers.track().index;
    const next = Math.max(0, Math.min(count - 1, current + delta));
    if (next === current) {
      this.status = delta < 0 ? 'THAT IS THE FIRST CHANNEL.' : 'THAT IS THE LAST CHANNEL.';
      this.render();
      return;
    }
    this.handlers.selectChannel(next);
    this.selected = 0;
    this.status = `EDITING ${this.handlers.track().name}.`;
    this.hear();
  }

  /** Play the channel, so a change can be judged by ear rather than by eye. */
  private hear(): void {
    this.handlers.audition();
    this.render();
  }

  /** Enter, or the `HEAR IT` button: the whole stack, with nothing claimed about it. */
  private audition(): void {
    this.handlers.audition();
    this.status = 'THAT IS THE WHOLE STACK PLAYING.';
    this.render();
  }

  // --- building ------------------------------------------------------------

  private buildCopy(): void {
    this.targetObj = this.addDynamic(BODY_X, MODAL.y + 4, 'accent');
    this.titleObj = this.addDynamic(BODY_X + BODY_W, MODAL.y + 4, 'dim', 1);
    this.readoutObj = this.addDynamic(LEFT_X, READOUT_Y, 'body');
    this.detailObj = this.addDynamic(LEFT_X, DETAIL_Y, 'dim');
    this.statusObj = this.addDynamic(BODY_X, STATUS_TOP, 'dim');

    // The four lines under the grid are this screen's whole manual, and so are
    // the two under the status line. They are DYNAMIC rather than static because
    // each page teaches its own subject — a stack on one, an effect on the other
    // — and they sit where a four-row column leaves room, which is the same place
    // on both pages so the screen does not jump when the page changes.
    for (let i = 0; i < 4; i++) this.notes.push(this.addDynamic(LEFT_X, NOTES_Y + i * NOTE_H, 'dim'));
    this.hints.push(this.addDynamic(BODY_X, HINT_TOP, 'accent'));
    this.hints.push(this.addDynamic(BODY_X, HINT_TOP + HINT_H, 'dim'));
  }

  /**
   * The copy that changes with the page: the notes, the two hints, the chrome.
   *
   * `F4` and `F5` teach in the same places, and this is the same bargain: the
   * screen a person is looking at should be the manual for what they can reach,
   * and a screen with two pages has to say which one is showing and what the
   * other one is for.
   */
  private drawCopy(): void {
    const n = this.handlers.track().index + 1;
    if (this.page === 'fx') {
      const spec = FX_ROWS[this.focus] ?? FX_ROWS[0];
      const effect = TRACK_EFFECT_BY_ID[spec.kind as TrackEffectId];
      const blurb = wrap(effect.blurb.toUpperCase(), 74).slice(0, 2);
      this.setCopy(this.notes, [
        blurb[0] ?? '',
        blurb[1] ?? '',
        `REACH FOR IT: ${effect.reach.toUpperCase()}`,
        `SCRIPT:  TRACK ${n} ${effect.id} 40`,
      ]);
      this.setCopy(this.hints, [
        'TAB OR THE BUTTONS SWAP LAYERS AND FX \u00b7 ARROWS PICK AN EFFECT \u00b7 LEFT/RIGHT CHANGES IT',
        '[ ] OR - + GO FIVE TIMES AS FAR \u00b7 ENTER HEARS \u00b7 Z/X CHANNEL \u00b7 F7 OR ESC CLOSES',
      ]);
      return;
    }
    this.setCopy(this.notes, [
      'LAYER 1 IS THE VOICE.',
      'INS STACKS A COPY OF THIS ONE.',
      'THEN MOVE IT: DETUNE FOR WIDTH,',
      'OCT -1 FOR WEIGHT, GAIN TO TUCK.',
    ]);
    this.setCopy(this.hints, [
      'ARROWS PICK A ROW \u00b7 LEFT/RIGHT CHANGES IT \u00b7 INS STACKS \u00b7 DEL REMOVES',
      '[ ] OR - + GO FIVE TIMES AS FAR \u00b7 ENTER HEARS \u00b7 Z/X CHANNEL \u00b7 F7 OR ESC CLOSES',
    ]);
  }

  /** Write a handful of pooled lines, hiding the ones a page does not use. */
  private setCopy(objects: readonly Phaser.GameObjects.Text[], lines: readonly string[]): void {
    objects.forEach((obj, i) => {
      const line = lines[i] ?? '';
      obj.setText(line);
      obj.setVisible(this.opened && line !== '');
    });
  }

  private addDynamic(x: number, y: number, role: TextRole, originX = 0): Phaser.GameObjects.Text {
    const obj = uiText(this.scene, x, y, '', {
      size: 8,
      color: colorForRole(role, activeColors()),
      origin: { x: originX, y: 0 },
    });
    obj.setDepth(DEPTH_FRONT + 2);
    obj.setVisible(this.opened);
    this.dynamic.push(obj);
    return obj;
  }

  private buildButtons(): void {
    // Six buttons, each one a thing this menu is for: which page you are on, two
    // ways to change the stack, hearing the result, which channel you are on, and
    // leaving. The arrow keys already write every value on the screen, so no
    // button duplicates one — and the two layer buttons RECOLOUR rather than
    // vanish on the FX page, because a button that disappears reads as a bug.
    const specs: ReadonlyArray<readonly [string, () => void]> = [
      ['LAYERS', () => this.setPage('layers')],
      ['FX', () => this.setPage('fx')],
      ['LAYER +', () => this.addLayer()],
      ['LAYER -', () => this.removeLayer()],
      ['HEAR IT', () => this.audition()],
      ['CHANNEL', () => this.cycleChannel(1)],
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

  /**
   * Point the six buttons at the page being shown.
   *
   * The page's own button is DISABLED, which is what the app already does with a
   * control that cannot do anything here (`F5` draws a room row dim when there is
   * no room), and the two layer buttons are too on the FX page: a stack is not
   * what that page is about. Nothing moves, so nothing is relearned.
   */
  private updateButtons(): void {
    const layers = this.page === 'layers';
    const on = (i: number, enabled: boolean): void => { this.buttons[i]?.setEnabled(enabled); };
    on(0, !layers);
    on(1, layers);
    on(2, layers);
    on(3, layers);
  }



  /** One piece of pooled row copy, in the layer that is cleared on every render. */
  private pushRowText(x: number, y: number, text: string, color: number, anchorX = 0): void {
    const obj = uiText(this.scene, x, y, text, { size: 8, color, origin: { x: anchorX, y: 0 } });
    obj.setDepth(DEPTH_FRONT + 1);
    this.rowLayer.add(obj);
    this.rowTexts.push(obj);
  }

  /**
   * One row's click target, rebuilt with the row so it can never go stale.
   *
   * The pointer is passed through because a bar's whole gesture is WHERE you
   * clicked: the zones and the graphics are in the same coordinate space, so the
   * pointer's x IS the value, and no extra maths stands between the two.
   */
  private pushZone(
    x: number,
    y: number,
    width: number,
    height: number,
    run: (pointer: Phaser.Input.Pointer) => void,
  ): void {
    const zone = this.scene.add.zone(x, y, width, height)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => run(pointer));
    this.rowLayer.add(zone);
    this.rowZones.push(zone);
  }

  // --- drawing ---------------------------------------------------------------

  render(): void {
    const c = activeColors();
    const g = this.frame;

    // The dim layer first: the app has to read as BEHIND the menu, or the pattern
    // grid underneath competes with the instrument on top of it.
    this.dim.clear();
    this.dim.fillStyle(c.ink, 0.82);
    this.dim.fillRect(0, 0, CANVAS_W, CANVAS_H);

    g.clear();
    drawPanel(g, MODAL, 1, c);
    drawDivider(g, MODAL.x + 2, MODAL.y + 26, MODAL.width - 4, 1, c);
    // The rule under the strip, so the stack above reads as a heading for the
    // controls below rather than as the first of the rows.
    drawDivider(g, MODAL.x + 2, RULE_Y, MODAL.width - 4, 1, c);
    drawDivider(g, MODAL.x + 2, STATUS_RULE_Y, MODAL.width - 4, 1, c);

    for (const text of this.rowTexts) text.destroy();
    for (const zone of this.rowZones) zone.destroy();
    this.rowTexts = [];
    this.rowZones = [];

    this.clampSelection();
    const sound = this.sound();
    const layer = this.layer();

    this.drawChrome(c, sound);
    this.drawStrip(g, c, sound);
    if (this.page === 'fx') {
      this.drawEffects(g, c);
    } else {
      this.drawWaveRow(g, c, layer);
      this.drawFields(g, c, layer);
      this.drawKnobs(g, c, layer);
    }
    this.drawStatus(c, layer);
    this.drawCopy();

    // Every piece of static copy gets its colour back on every render, because the
    // theme can have changed under it — the same reason every menu here does this.
    for (const entry of this.staticCopy) entry.obj.setColor(intToCss(colorForRole(entry.role, c)));

    this.updateButtons();
    this.reveal();
  }

  /**
   * The two ends of the title row: which channel, and what is being edited.
   *
   * The right-hand end is the page indicator, and it is a sentence rather than a
   * word because it has to answer "is anything on" as well: `2 LAYERS` says how
   * thick the sound is, and `3 OF 6 ON` says how much of it is shaped. Both are
   * facts about the channel a person is trying to hear, so neither is a label on
   * a tab.
   */
  private drawChrome(c: ReturnType<typeof activeColors>, sound: StackedSound): void {
    const track = this.handlers.track();
    const count = layerCount(sound);
    if (this.targetObj) {
      this.targetObj.setText(`CHANNEL ${track.index + 1}  ${track.name}`);
      this.targetObj.setColor(intToCss(c.ward));
    }
    if (this.titleObj) {
      this.titleObj.setText(this.page === 'fx'
        ? `SOUND DESIGN  -  FX  ${effectsOn(track.effects)} OF ${TRACK_EFFECTS.length} ON`
        : `SOUND DESIGN  -  ${count} LAYER${count === 1 ? '' : 'S'}`);
      this.titleObj.setColor(intToCss(c.textDim));
    }
  }

  /**
   * The stack, one chip per layer: `1 VOICE SQR`, `2 SAW`, `3 TRI`.
   *
   * The whole point of drawing the stack as a row rather than as a count is that
   * the shapes are what a reader is comparing — "a triangle an octave down under a
   * saw" is a sound, and "three layers" is not.
   */
  private drawStrip(g: Phaser.GameObjects.Graphics, c: ReturnType<typeof activeColors>, sound: StackedSound): void {
    const count = layerCount(sound);
    // The chips stay on BOTH pages, because they are the channel's identity —
    // what the sound is made of does not stop being true when you turn to its
    // effects — but they are only part of the LAYERS page's walk, so on the FX
    // page a chip is a click that takes you back to the layer you picked.
    const focused = this.page === 'layers' && this.rows()[this.focus]?.kind === 'strip';
    if (focused) {
      g.fillStyle(c.ooze, 0.14);
      g.fillRect(BODY_X - 4, STRIP_Y - 3, BODY_W + 8, CHIP_H + 6);
    }
    for (let i = 0; i < count; i++) {
      const chip = { x: BODY_X + i * (CHIP_W + CHIP_GAP), y: STRIP_Y, width: CHIP_W, height: CHIP_H };
      const on = i === this.selected;
      drawInset(g, chip, 1, c);
      if (on) {
        g.fillStyle(focused ? c.ward : c.ooze, 0.8);
        g.fillRect(chip.x + 1, chip.y + 1, chip.width - 2, chip.height - 2);
      }
      const wave = layerAt(sound, i + 1)?.wave ?? WAVES[0];
      const label = i === 0 ? `1  VOICE  ${WAVE_LABELS[wave]}` : `${i + 1}  ${WAVE_LABELS[wave]}`;
      this.pushRowText(chip.x + 8, chip.y + 4, label, on ? c.ink : c.textPrimary);
      this.pushZone(chip.x, chip.y, chip.width, chip.height, () => {
        // A chip clicked from the FX page is a request to shape that layer, so it
        // swaps back to the page where layers are shaped rather than selecting a
        // layer the grid under the pointer is not showing.
        if (this.page === 'fx') this.setPage('layers');
        if (i !== this.selected) this.selectLayer(i);
        else this.render();
      });
    }
  }

  /**
   * The waveform: one segment per shape, because a shape is PICKED and not dialled.
   *
   * A bar would read as "mostly square", which is not a thing — so this row gets
   * the one control that says "one of these", and one click zone per segment so
   * clicking the shape you want gets you that shape. The same drawing `F4` uses,
   * for the same reason.
   */
  private drawWaveRow(g: Phaser.GameObjects.Graphics, c: ReturnType<typeof activeColors>, layer: Layer): void {
    const spec = ROWS[WAVE_ROW];
    const focused = this.focus === WAVE_ROW;
    const y = GRID_TOP + spec.line * ROW_H;
    const waveIndex = Math.max(0, WAVES.indexOf(layer.wave));
    if (focused) {
      g.fillStyle(c.ooze, 0.14);
      g.fillRect(LEFT_X - 4, y - 3, LEFT_W + 8, ROW_H - 2);
    }
    this.pushRowText(LEFT_X, y, spec.label, focused ? c.ward : c.textPrimary);
    this.pushRowText(LEFT_X + Math.floor(LEFT_W / 2), y, spec.caption, c.textDim, 0.5);
    this.pushRowText(
      LEFT_X + LEFT_W, y,
      `${WAVE_LABELS[layer.wave]}  ${waveIndex + 1}/${WAVES.length}`,
      focused ? c.ward : c.textPrimary,
      1,
    );

    const gap = 4;
    const width = Math.floor((LEFT_W - gap * (WAVES.length - 1)) / WAVES.length);
    WAVES.forEach((_wave, i) => {
      const segment = { x: LEFT_X + i * (width + gap), y: y + BAR_Y, width, height: BAR_H };
      drawInset(g, segment, 1, c);
      if (i === waveIndex) {
        g.fillStyle(focused ? c.ward : c.ooze, 0.8);
        g.fillRect(segment.x + 1, segment.y + 1, Math.max(1, segment.width - 2), segment.height - 2);
      }
      this.pushZone(segment.x, y - 3, width, ROW_H - 2, () => {
        this.focus = WAVE_ROW;
        this.rowSet(spec, i);
      });
    });
  }

  /** `octave`, `detune` and `gain`: the three things a voice does not have. */
  private drawFields(g: Phaser.GameObjects.Graphics, c: ReturnType<typeof activeColors>, layer: Layer): void {
    const isVoice = this.selected === 0;
    LAYER_FIELDS.forEach((field) => {
      const spec = ROWS.find((row) => row.kind === field.id);
      if (!spec) return;
      const value = layer[field.id];
      // A voice's pitch and level are the channel's, so the row shows the REASON
      // where its value would be and its bar stays an empty groove: a control
      // that cannot do anything should not look like one that can.
      this.drawDial(spec, value, isVoice ? 'VOICE' : formatField(field.id, value), g, c);
    });
  }

  /** The nine knobs, which every layer shares with the voice of its channel. */
  private drawKnobs(g: Phaser.GameObjects.Graphics, c: ReturnType<typeof activeColors>, layer: Layer): void {
    for (const param of VOICE_PARAMS) {
      const spec = ROWS.find((row) => row.kind === param.id);
      if (!spec) continue;
      const value = layer[param.id];
      this.drawDial(spec, value, value === 0 ? 'OFF' : String(value), g, c);
    }
  }

  /**
   * One dial: its name, its two ends, its value, and the bar underneath.
   *
   * Every control on this screen is drawn by this one function — the three layer
   * fields and the nine knobs — which is what makes twelve rows read as one list
   * of dials rather than as two kinds of thing. The waveform is the one exception,
   * and it is a row of segments for a reason of its own.
   */
  private drawDial(spec: RowSpec, value: number, valueText: string, g: Phaser.GameObjects.Graphics, c: ReturnType<typeof activeColors>): void {
    // The index within the row's OWN page, because `focus` counts from the top of
    // the page showing: an effect is the 2nd row of FX, not the 20th row of the
    // layer table — and a dial that never lit up would be a dial you cannot see
    // yourself turning.
    const index = this.rows().indexOf(spec);
    const focused = index === this.focus;
    const inRight = spec.col === 'right';
    const x = inRight ? RIGHT_X : LEFT_X;
    const width = inRight ? RIGHT_W : LEFT_W;
    const y = GRID_TOP + spec.line * ROW_H;

    if (focused) {
      g.fillStyle(c.ooze, 0.14);
      g.fillRect(x - 4, y - 3, width + 8, ROW_H - 2);
    }
    this.pushRowText(x, y, spec.label, focused ? c.ward : c.textPrimary);
    this.pushRowText(x + Math.floor(width / 2), y, spec.caption, c.textDim, 0.5);
    this.pushRowText(x + width, y, valueText, focused ? c.ward : c.textPrimary, 1);

    const bar = { x, y: y + BAR_Y, width, height: BAR_H };
    drawInset(g, bar, 1, c);
    const span = spec.max - spec.min;
    const filled = span === 0 ? 0 : Math.round(bar.width * ((value - spec.min) / span));
    if (filled > 0) {
      g.fillStyle(focused ? c.ward : c.ooze, 0.8);
      g.fillRect(bar.x + 1, bar.y + 1, Math.max(1, filled - 2), bar.height - 2);
    }

    // Clicking the row sets the value where you clicked, snapped to the row's own
    // step, so the gesture is "put it about there" and the keys stay for exactness.
    this.pushZone(x, y - 3, width, ROW_H - 2, (pointer) => {
      this.focus = index;
      const ratio = Math.max(0, Math.min(1, (pointer.x - x) / width));
      this.rowSet(spec, spec.min + ratio * span);
    });
  }

  /**
   * The line under the grid: what the selected layer is, and how to read it.
   *
   * With nothing to report it teaches instead — what a stack is FOR, which is the
   * one sentence a beginner needs to make their first one — and the readout above
   * it answers "where am I" in the same breath.
   */
  private drawStatus(c: ReturnType<typeof activeColors>, layer: Layer): void {
    const count = layerCount(this.sound());
    if (this.page === 'fx') {
      const spec = FX_ROWS[this.focus] ?? FX_ROWS[0];
      const effect = TRACK_EFFECT_BY_ID[spec.kind as TrackEffectId];
      if (this.readoutObj) {
        this.readoutObj.setText(`FX ${FX_ROWS.indexOf(spec as RowSpec) + 1} OF ${FX_ROWS.length}  -  ${effect.label}`);
        this.readoutObj.setColor(intToCss(c.textPrimary));
      }
      if (this.detailObj) {
        this.detailObj.setText(`${effect.low.toUpperCase()} ... ${effect.high.toUpperCase()}   ${effectLabel(this.effects()[effect.id])}`);
        this.detailObj.setColor(intToCss(c.textDim));
      }
      if (!this.statusObj) return;
      const off = 'OFF IS NOT A LITTLE: AN EFFECT AT 0 IS THE CHANNEL YOU ALREADY HAD, SAMPLE FOR SAMPLE.';
      this.statusObj.setText(this.status === '' ? off : this.status);
      this.statusObj.setColor(intToCss(this.status === '' ? c.textDim : c.textPrimary));
      return;
    }
    if (this.readoutObj) {
      this.readoutObj.setText(`LAYER ${this.index()} OF ${count}  -  ${WAVE_LABELS[layer.wave]}`);
      this.readoutObj.setColor(intToCss(c.textPrimary));
    }
    if (this.detailObj) {
      this.detailObj.setText(this.selected === 0
        ? 'THIS IS THE VOICE - THE CHANNEL ITSELF'
        : `OCT ${signed(layer.octave)}   DET ${signed(layer.detune)}c   GAIN ${layer.gain}`);
      this.detailObj.setColor(intToCss(c.textDim));
    }
    if (!this.statusObj) return;
    const fallback = this.selected === 0
      ? 'A STACK IS THE SAME SOUND AGAIN, MOVED: DETUNE IT FOR WIDTH, OCT -1 FOR WEIGHT.'
      : 'EVERY LAYER PLAYS EVERY NOTE OF THIS CHANNEL. TURN COPIES DOWN SO IT GROWS, NOT LOUDER.';
    this.statusObj.setText(this.status === '' ? fallback : this.status);
    this.statusObj.setColor(intToCss(this.status === '' ? c.textDim : c.textPrimary));
  }

  destroy(): void {
    this.unsubscribe();
    for (const text of this.rowTexts) text.destroy();
    for (const entry of this.staticCopy) entry.obj.destroy();
    for (const obj of this.dynamic) obj.destroy();
    for (const button of this.buttons) button.destroy();
    this.dim.destroy();
    this.frame.destroy();
    this.rowLayer.destroy();
    this.curtain.destroy();
  }
}

/** How many of a channel's six effects are on, for the title row. */
function effectsOn(effects: ChannelEffects): number {
  return TRACK_EFFECTS.filter((effect) => (effects[effect.id] ?? 0) > 0).length;
}

/** `+3`, `0`, `-8` — a signed value, because the sign is the direction. */
function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * How one layer field reads in the value column.
 *
 * A sign is a DIRECTION, so it is shown only where there is one: an octave above
 * or below, a detune sharp or flat. A gain is a level from 0 to 100, and a level
 * of `+100` would read as something you could exceed.
 */
function formatField(id: LayerField, value: number): string {
  if (id === 'detune') return `${signed(value)}c`;
  if (id === 'octave') return signed(value);
  return String(value);
}

/**
 * The colour a piece of static copy wears.
 *
 * Resolved on every render rather than stored, because `F9` can change the theme
 * while the menu is closed and the labels must come back in the new one's
 * colours — the same reason every other view here repaints from `onThemeChanged`.
 */
function colorForRole(role: TextRole, c: UiColors): number {
  switch (role) {
    case 'accent': return c.ooze;
    case 'dim': return c.textDim;
    default: return c.textPrimary;
  }
}
