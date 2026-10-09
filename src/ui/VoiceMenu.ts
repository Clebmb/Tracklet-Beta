import type Phaser from 'phaser';
import {
  activeColors,
  activeTheme,
  Button,
  drawDivider,
  drawInset,
  drawPanel,
  intToCss,
  onThemeChanged,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';

import {
  clampParam,
  MAX_PARAM,
  MAX_VOICE_NAME,
  MIN_PARAM,
  nextWave,
  PARAM_STEP,
  tidyVoiceName,
  VOICES,
  VOICE_FAMILIES,
  VOICE_PARAMS,
  voiceNameProblem,
  WAVES,
  WAVE_LABELS,
  sameVoice,
  type Voice,
  type VoiceFamily,
  type VoiceParam,
  type VoiceParamId,
  type VoiceParams,
  type Wave,
} from '../model/voice';
import {
  layerAt,
  layerCount,
  savedSound,
  sameSound,
  savedStackChip,
  type StackedSound,
  type UserVoice,
} from '../model/instrument';
import { clampGlide, clampVibrato } from '../model/song';
import { menuIntent } from './menuKeys';
import { RenameBox } from './RenameBox';

/**
 * VoiceMenu — the F4 menu: what a channel SOUNDS like.
 *
 * This is the answer to "how do I make this note sound like a different
 * instrument", and the design is one sentence: LEFT picks an instrument, RIGHT
 * shows the five dials inside it. Nothing here needs a manual, because nothing
 * here is a unit a beginner has to learn:
 *
 *   • A VOICE has a name you already know — `pad`, `pluck`, `hat` — and a
 *     one-line blurb saying what it is for. Click it and the channel is that
 *     instrument, immediately, out loud.
 *   • A KNOB is a percentage with two named ends (`dark…bright`, `pluck…pad`),
 *     so "make it less bright" is a sentence you can act on without knowing what
 *     a filter cutoff is. Every knob is a bar you can drag along, and a key you
 *     can nudge.
 *
 * ── Why a bar and not a number ───────────────────────────────────────────────
 * A tracker's usual answer to "the sound" is a column of hexadecimal. A bar that
 * fills from the left is the same information with the maths already done, and
 * it makes the RANGE visible: you can see that 0 and 100 are the ends, so you
 * can never be surprised by a value you did not know existed.
 *
 * ── Why the edits are one undo step ──────────────────────────────────────────
 * A menu about a SOUND is a menu you fiddle in: ten nudges and then "no, the
 * first one". The scene records one snapshot for the whole visit, so a single
 * Ctrl+Z undoes the fiddling rather than the tenth of it.
 *
 * ── When the channel is STACKED ──────────────────────────────────────────────
 * A channel can be more than one layer of sound — see `F7` — and this menu stays
 * about ONE of them: layer 1, the voice, which is what `F4` has always meant and
 * what these nine knobs have always edited. It does not quietly become a second
 * editor for the other layers, because two meanings on one screen is the thing
 * this app spends the most effort avoiding. What it does instead is SAY what it
 * is part of: a strip of chips beside the pane's heading, `1 SQR  2 TRI  3 SAW`,
 * drawn only when the channel has more than one layer, with the first chip lit
 * because that is the one on the bench. Click it and the design screen opens on
 * the same channel, which is the whole distance between the two halves of "what
 * does this sound like" and "what is it made of".
 *
 * ── MY SOUNDS ────────────────────────────────────────────────────────────────
 * The preset list is a starting point, not a menu. `SAVE AS…` names the sound the
 * channel is on right now and puts it at the top of the list, so the next song
 * can use it without dialing it in again; `DELETE` removes it. A saved sound is
 * addressed exactly like a built-in one — click it here, or write
 * `track 1 voice MYPAD` in a script — because to the author there is one list of
 * instruments, however many tables sit behind it.
 *
 * The scene owns the song, the undo history and the saved library, so every
 * change here is a callback: the menu never writes to the model directly, and it
 * re-reads the channel on every redraw rather than holding a copy.
 */

export interface VoiceMenuHandlers {
  /** The menu opened or closed, so the scene can pause its own input. */
  onOpenChange?: (open: boolean) => void;
  /** The name box opened or closed, so the scene can suspend its own input. */
  onEditingChange?: () => void;
  /** How many channels the song has, for the CHANNEL - / + buttons. */
  channels: () => number;
  /** The channel being edited: its index, its name and its sound. */
  voice: () => { index: number; name: string; params: VoiceParams };
  /** Move the editor to another channel, so the menu edits THAT one. */
  selectChannel: (index: number) => void;
  /**
   * Apply a named instrument — a built-in voice (`pad`) or one of the user's
   * saved sounds (`MYPAD`). Returns the status line to show.
   */
  applyVoice: (name: string) => string;
  /** Set one knob on the current channel, already a 0..100 percentage. */
  setKnob: (id: VoiceParamId, value: number) => string;
  /** Set the channel's waveform. */
  setWave: (wave: Wave) => string;
  /**
   * The channel's expression — how it slides between notes and how far its pitch
   * wobbles, both 0..100.
   *
   * Read and written through the TRACK rather than through `voice`, because they
   * are properties of the channel and not of its instrument: `SAVE AS…` names a
   * sound, and `glide 40` is how that sound is played, so a saved sound does not
   * carry them.
   */
  glide: () => number;
  setGlide: (value: number) => string;
  vibrato: () => number;
  setVibrato: (value: number) => string;
  /**
   * The channel being edited, VOICE AND ALL — read only to say what the voice is
   * part of.
   *
   * A channel can be a stack of up to four layers (see `F7`), and this menu is
   * about exactly one of them: layer 1, the voice, which is what `F4` has always
   * meant. So rather than this menu becoming a second editor for the other three
   * — two meanings on a screen that has one — the strip below merely reports the
   * stack, and clicking it goes where the stack can be changed.
   */
  sound: () => StackedSound;
  /** The strip was clicked: show the `F7` design screen for the same channel. */
  openDesign: () => void;
  /** Sound a note on the current channel, so a change can be heard. */
  audition: () => void;
  /** The sounds the user has saved, read on every redraw. */
  savedVoices: () => readonly UserVoice[];
  /** Save the channel's current sound under this name. Returns the status line. */
  saveVoice: (name: string) => string;
  /** Forget the saved sound with this name. Returns the status line. */
  removeVoice: (name: string) => string;
}

const CANVAS_W = 720;
const CANVAS_H = 405;

const MODAL: Rect = { x: 64, y: 22, width: 592, height: 350 };

const DEPTH_DIM = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_FRONT = 980;

const BODY_X = MODAL.x + 4;
const BODY_W = MODAL.width - 8;

/** The left half: the list of instruments. */
const LIST_X = BODY_X + 2;
const LIST_W = 250;
const LIST_TOP = MODAL.y + 30;
const ROW_H = 20;
const VISIBLE = 8;

/** The right half: the dials inside the chosen instrument. */
const PANE_X = LIST_X + LIST_W + 14;
const PANE_W = MODAL.width - (PANE_X - MODAL.x) - 8;

const LINE_H = 11;
const STATUS_TOP = MODAL.y + 262;
const HINT_TOP = MODAL.y + 296;

/**
 * The stack strip, which rides the pane's own heading row.
 *
 * There is no room for a thirteenth dial — the twelve rows of the pane end
 * exactly on the status line, which is what `KNOB_H` was chosen to make true — so
 * the one honest thing this menu can say about a stack goes where there is width
 * going spare instead: to the right of the `SOUND` heading, in chips the same
 * shape as the ones `F7` draws, so the two screens read as one instrument.
 */
const STACK_Y = MODAL.y + 16;
const STACK_H = 12;
/**
 * The strip's padding and gaps, which are as small as they are for a reason.
 *
 * A full stack is FOUR chips and the row has 148 pixels of clear width to the
 * right of the `SOUND` heading (`504` to the body's `652`), so four `1 SQR`-sized
 * chips have to come in under that together. Three pixels a side and three
 * between them is 144 — which is why the number, the padding and the gap are the
 * three numbers on this screen that cannot simply be made friendlier.
 */
const STACK_PAD = 3;
const STACK_GAP = 3;

const BTN_H = 20;
const BTN_GAP = 6;
const BTN_W = Math.floor((BODY_W - BTN_GAP * 5) / 6);
const BTN_TOP = MODAL.y + MODAL.height - BTN_H - 6;

/**
 * How tall one dial is, and where its bar sits.
 *
 * A dial is TWO lines — its name, its ends and its value on top, the bar under
 * them — because a bar with a label and a readout squeezed onto the same line
 * runs out of width, and a bar is worth more room than a caption.
 *
 * Twelve rows — the waveform, the NINE knobs, and the two expression dials — all
 * have to fit above the status line on a 405-pixel canvas, and that is what sets
 * this number. It is tight, so it is the first thing to move when a row is added:
 * the bar sits high in its row and only the space around it narrows, which keeps
 * the pane reading as one list of dials rather than as two that nearly match.
 */
const KNOB_H = 19;
const BAR_H = 8;
const BAR_Y = 9;

/**
 * The heading drawn over each family's voices.
 *
 * Read from the model's one family table rather than written out again here, so
 * the menu and the machine-readable catalog can never disagree about what a
 * family is called.
 */
const FAMILY_LABELS: Readonly<Record<VoiceFamily, string>> =
  Object.fromEntries(VOICE_FAMILIES.map((family) => [family.id, family.heading])) as Record<VoiceFamily, string>;

type TextRole = 'heading' | 'body' | 'accent' | 'dim';

interface StaticText {
  obj: Phaser.GameObjects.Text;
  role: TextRole;
}

/** Which pane the keys are talking to. */
type Pane = 'voices' | 'knobs';

/**
 * One row of the list, which is ONE list of instruments even though it is built
 * from two tables: the sounds the user saved, then the built-in voices.
 *
 * Keeping them as one list of entries is what makes everything downstream —
 * moving, scrolling, applying, naming the row you are on — a single code path
 * rather than two that have to be kept in step.
 */
type ListEntry =
  | { kind: 'user'; saved: UserVoice }
  | { kind: 'voice'; voice: Voice };

/** The heading of the user's own sounds, which lead the list. */
const SAVED_LABEL = 'MY SOUNDS';

export class VoiceMenu {
  private readonly scene: Phaser.Scene;
  private readonly handlers: VoiceMenuHandlers;

  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Container;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly buttons: Button[] = [];
  private readonly staticCopy: StaticText[] = [];

  private rowTexts: Phaser.GameObjects.Text[] = [];
  private rowZones: Phaser.GameObjects.Zone[] = [];
  private knobTexts: Phaser.GameObjects.Text[] = [];
  private knobZones: Phaser.GameObjects.Zone[] = [];
  private headerTexts: Phaser.GameObjects.Text[] = [];
  private titleObj: Phaser.GameObjects.Text | null = null;
  private targetObj: Phaser.GameObjects.Text | null = null;
  private statusObj: Phaser.GameObjects.Text | null = null;

  private pane: Pane = 'voices';
  private selected = 0;
  private top = 0;
  /** 0 is the waveform, 1..9 are the nine knobs, in `VOICE_PARAMS` order. */
  private knob = 0;
  private status = '';
  private opened = false;
  private readonly unsubscribe: () => void;
  /**
   * The name box, floated over the status line.
   *
   * It lives on the same row the status line does because that is the row the
   * question is about: the status says what just happened, and while you are
   * naming a sound the name IS what is happening. It is a DOM `<input>` for the
   * same reason a channel rename is.
   */
  private readonly box: RenameBox;

  constructor(scene: Phaser.Scene, handlers: VoiceMenuHandlers) {
    this.scene = scene;
    this.handlers = handlers;

    this.dim = scene.add.graphics().setDepth(DEPTH_DIM);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.body = scene.add.container(0, 0).setDepth(DEPTH_FRONT + 1);

    this.curtain = scene.add.zone(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);
    this.curtain.on('pointerdown', () => this.hide());

    this.box = new RenameBox(scene, {
      rect: () => (this.opened ? { x: BODY_X, y: STATUS_TOP - 3, width: BODY_W, height: 15 } : null),
      maxLength: MAX_VOICE_NAME,
      ariaLabel: 'Name for this sound',
      onCommit: (typed) => this.nameTheSound(typed),
      onEditingChange: () => { this.handlers.onEditingChange?.(); this.render(); },
    });

    this.buildCopy();
    this.buildButtons();

    this.unsubscribe = onThemeChanged(() => this.render());
    this.setOpen(false);
    this.render();
  }

  get isOpen(): boolean { return this.opened; }

  /** True while a name is being typed, so the scene keeps its keyboard quiet. */
  get isNaming(): boolean { return this.box.isOpen; }

  show(): void {
    // Open on the instrument the channel is ALREADY using, so the list is a map
    // of where you are rather than a list you have to find your place in. A
    // saved sound counts: setting that match is the same search either way.
    const at = this.currentIndex();
    if (at >= 0) this.selected = at;
    this.knob = 0;
    this.pane = 'voices';
    this.status = '';
    this.scrollToSelection();
    this.setOpen(true);
    this.render();
    // Opening the menu is SILENT on purpose: F4 is a look at the sound, not a
    // request to hear it. A note plays when you choose a voice, move to another
    // one or touch a knob — never just for arriving.
  }

  hide(): void { this.box.commit(); this.setOpen(false); }

  // --- the one list ---------------------------------------------------------

  /** Every instrument on offer: the user's saved sounds, then the built-ins. */
  private entries(): ListEntry[] {
    const out: ListEntry[] = this.handlers.savedVoices().map((saved) => ({ kind: 'user' as const, saved }));
    for (const voice of VOICES) out.push({ kind: 'voice', voice });
    return out;
  }

  /**
   * The row whose sound is exactly the one a channel is on, or -1.
   *
   * The WHOLE sound is compared, layers included: a channel playing a saved
   * supersaw is on that row, and is not on the row of whichever plain voice it
   * happens to share its first layer with. A saved sound that is one voice and a
   * preset are therefore compared exactly as they always were, which is why this
   * still opens the list on the right row for every song that has no stack.
   */
  private currentIndex(): number {
    const sound = this.handlers.sound();
    return this.entries().findIndex((entry) => {
      // A preset is one voice, so a channel wearing a stack is on no preset's
      // row; a saved sound is compared as the whole thing it is.
      if (entry.kind === 'user') return sameSound(sound, savedSound(entry.saved));
      return sound.stack.length === 0 && sameVoice(sound.voice, entry.voice.params);
    });
  }

  /** The name a row applies: a saved sound's name, or a preset's id. */
  private entryName(entry: ListEntry): string {
    return entry.kind === 'user' ? entry.saved.name : entry.voice.id;
  }

  private setOpen(open: boolean): void {
    const changed = open !== this.opened;
    this.opened = open;
    this.dim.setVisible(open);
    this.frame.setVisible(open);
    this.curtain.setVisible(open);
    this.body.setVisible(open);
    // Closing the menu closes the name box with it: a text box floating over a
    // menu that is no longer there is the one way a DOM input can be left behind.
    if (!open) this.box.commit();
    for (const button of this.buttons) button.container.setVisible(open);
    for (const entry of this.staticCopy) entry.obj.setVisible(open);
    for (const text of this.rowTexts) text.setVisible(open);
    for (const zone of this.rowZones) zone.setVisible(open);
    for (const text of this.knobTexts) text.setVisible(open);
    for (const zone of this.knobZones) zone.setVisible(open);
    for (const text of this.headerTexts) text.setVisible(open);
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- keyboard -------------------------------------------------------------

  handleKey(e: KeyboardEvent): void {
    // Left/Right are aliases of Up/Down in the shared menu table, so they are
    // claimed here first: in a two-pane menu a horizontal nudge means "the other
    // pane", which is the one thing the shared table cannot say.
    if (e.code === 'ArrowLeft') { e.preventDefault(); this.setPane('voices'); return; }
    if (e.code === 'ArrowRight') { e.preventDefault(); this.setPane('knobs'); return; }

    const intent = menuIntent(e.code);
    if (intent === 'close') { e.preventDefault(); this.hide(); return; }
    if (intent === 'up') { e.preventDefault(); this.move(-1); return; }
    if (intent === 'down') { e.preventDefault(); this.move(1); return; }
    if (intent === 'first') { e.preventDefault(); this.select(0); return; }
    if (intent === 'last') { e.preventDefault(); this.select(this.entries().length - 1); return; }
    if (intent === 'pick') { e.preventDefault(); this.activate(); return; }

    const code = e.code;
    if (code === 'BracketLeft' || code === 'Minus' || code === 'NumpadSubtract') {
      e.preventDefault(); this.nudge(-PARAM_STEP); return;
    }
    if (code === 'BracketRight' || code === 'Equal' || code === 'NumpadAdd') {
      e.preventDefault(); this.nudge(PARAM_STEP); return;
    }
    if (code === 'KeyZ') { e.preventDefault(); this.cycleChannel(-1); return; }
    if (code === 'KeyX') { e.preventDefault(); this.cycleChannel(1); }
  }

  // --- actions --------------------------------------------------------------

  private setPane(pane: Pane): void {
    if (this.pane === pane) return;
    this.pane = pane;
    this.render();
  }

  private move(delta: number): void {
    if (this.pane === 'voices') this.select(this.selected + delta);
    else this.selectKnob(this.knob + delta);
  }

  private select(index: number): void {
    this.selected = Math.max(0, Math.min(this.entries().length - 1, index));
    this.scrollToSelection();
    this.render();
  }

  private selectKnob(index: number): void {
    // Twelve rows: the waveform, the nine knobs, then glide and vibrato.
    const rows = VOICE_PARAMS.length + 3;
    this.knob = ((index % rows) + rows) % rows;
    this.render();
  }

  /** Enter, or a click: apply an instrument, or audition the current one. */
  private activate(): void {
    if (this.pane === 'voices') {
      const entry = this.entries()[this.selected];
      if (!entry) return;
      this.status = this.handlers.applyVoice(this.entryName(entry));
      this.handlers.audition();
      this.render();
      return;
    }
    this.handlers.audition();
    this.status = 'THAT IS IT PLAYING';
    this.render();
  }

  private cycleChannel(delta: number): void {
    const count = this.handlers.channels();
    const current = this.handlers.voice().index;
    const next = Math.max(0, Math.min(count - 1, current + delta));
    if (next === current) {
      this.status = delta < 0 ? 'THAT IS THE FIRST CHANNEL' : 'THAT IS THE LAST CHANNEL';
      this.render();
      return;
    }
    this.handlers.selectChannel(next);
    this.status = `EDITING ${this.handlers.voice().name}`;
    this.handlers.audition();
    this.render();
  }

  private nudge(delta: number): void {
    if (this.pane !== 'knobs') {
      // On the list pane the same keys cycle the waveform, which is the one knob
      // that is also a shape and so does not get a bar.
      this.status = this.handlers.setWave(nextWave(this.handlers.voice().params.wave));
      this.handlers.audition();
      this.render();
      return;
    }
    if (this.knob === 0) {
      this.status = this.handlers.setWave(nextWave(this.handlers.voice().params.wave));
      this.handlers.audition();
      this.render();
      return;
    }
    if (this.knob === VOICE_PARAMS.length + 1) {
      this.setExpressionTo('glide', this.handlers.glide() + delta);
      return;
    }
    if (this.knob === VOICE_PARAMS.length + 2) {
      this.setExpressionTo('vibrato', this.handlers.vibrato() + delta);
      return;
    }
    const param = VOICE_PARAMS[this.knob - 1];
    const current = this.handlers.voice().params[param.id];
    this.status = this.handlers.setKnob(param.id, clampParam(current + delta));
    this.handlers.audition();
    this.render();
  }

  private setKnobTo(id: VoiceParamId, value: number): void {
    this.status = this.handlers.setKnob(id, clampParam(value));
    this.handlers.audition();
    this.render();
  }

  /**
   * Set the channel's glide or vibrato, from a click or a key.
   *
   * Both are clamped HERE as well as in the model, because a bar that was clicked
   * a pixel past its end would otherwise ask for 101 — and the range being the
   * guarantee is a promise the menu makes to the hand, not just to the file.
   */
  private setExpressionTo(which: 'glide' | 'vibrato', value: number): void {
    const clamped = which === 'glide' ? clampGlide(value) : clampVibrato(value);
    this.status = which === 'glide'
      ? this.handlers.setGlide(clamped)
      : this.handlers.setVibrato(clamped);
    this.handlers.audition();
    this.render();
  }

  private scrollToSelection(): void {
    const total = this.entries().length;
    if (this.selected < this.top) this.top = this.selected;
    if (this.selected >= this.top + VISIBLE) this.top = this.selected - VISIBLE + 1;
    this.top = Math.max(0, Math.min(this.top, Math.max(0, total - VISIBLE)));
  }

  // --- saving a sound ------------------------------------------------------

  /**
   * `SAVE AS…`: name the sound the channel is on right now.
   *
   * The box opens with the name it would naturally take — the instrument it
   * already matches, or `MY SOUND` — because a name you have to invent from
   * nothing is one more thing between an idea and a saved sound.
   */
  private startNaming(): void {
    const entry = this.entries()[this.currentIndex()];
    const suggestion = entry ? this.entryName(entry) : 'MY SOUND';
    this.box.commit();
    this.box.recolor(activeColors());
    this.status = 'NAME THIS SOUND, THEN PRESS ENTER';
    this.box.start(tidyVoiceName(suggestion));
    this.render();
  }

  /** The name box was committed: validate it, save, and say what happened. */
  private nameTheSound(typed: string): void {
    const name = tidyVoiceName(typed);
    // The name is its own `ignore`: saving over a sound you already have IS the
    // point of SAVE AS… — you iterated — so the only rules that can refuse here
    // are the ones about the name's SHAPE (and about shadowing a built-in).
    const problem = voiceNameProblem(name, this.handlers.savedVoices(), name);
    if (problem !== null) {
      // The refusal is the STATUS LINE rather than a dialog, and the box is left
      // closed: the message names the fix, and SAVE AS… is one keypress away.
      this.status = problem.toUpperCase();
      this.render();
      return;
    }
    this.status = this.handlers.saveVoice(name);
    this.select(this.entries().findIndex((entry) => entry.kind === 'user' && entry.saved.name === name));
    this.handlers.audition();
  }

  /**
   * `DELETE`: remove the highlighted SAVED sound.
   *
   * Only saved ones. The built-in voices are the app's vocabulary — a script may
   * name any of them — so the button says why rather than doing nothing.
   */
  private deleteSelected(): void {
    const entry = this.entries()[this.selected];
    if (!entry || entry.kind !== 'user') {
      this.status = 'ONLY YOUR OWN SOUNDS CAN BE DELETED.';
      this.render();
      return;
    }
    this.status = this.handlers.removeVoice(entry.saved.name);
    this.select(Math.min(this.selected, this.entries().length - 1));
  }

  // --- building -------------------------------------------------------------

  private buildCopy(): void {
    this.addStatic(LIST_X, MODAL.y + 16, 'INSTRUMENT  -  CLICK ONE TO USE IT', 'heading');
    this.addStatic(PANE_X, MODAL.y + 16, 'SOUND  -  DRAG A BAR OR NUDGE IT', 'heading');
    this.addStatic(BODY_X, HINT_TOP, 'ARROWS MOVE   LEFT/RIGHT SWITCH SIDE   ENTER USE OR HEAR', 'accent');
    this.addStatic(BODY_X, HINT_TOP + LINE_H, '[ ] OR - + NUDGE ONE KNOB   Z/X CHANNEL   F4 OR ESC CLOSES', 'dim');
  }

  private addStatic(x: number, y: number, text: string, role: TextRole): void {
    const obj = uiText(this.scene, x, y, text, { size: 8, color: activeColors().textPrimary });
    obj.setDepth(DEPTH_FRONT + 2);
    this.staticCopy.push({ obj, role });
  }

  private buildButtons(): void {
    // Six buttons, each one a thing the menu is for: which channel, hearing it,
    // naming the sound you just dialed in, removing one, and leaving. The arrow
    // keys already nudge a knob, so the two wave buttons they used to share this
    // row with are gone — a button should be for what the keys cannot reach.
    const specs: ReadonlyArray<readonly [string, () => void]> = [
      ['CHANNEL -', () => this.cycleChannel(-1)],
      ['CHANNEL +', () => this.cycleChannel(1)],
      ['HEAR IT', () => this.activate()],
      ['SAVE AS...', () => this.startNaming()],
      ['DELETE', () => this.deleteSelected()],
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
    this.dim.clear();
    this.dim.fillStyle(c.ink, 0.82);
    this.dim.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const g = this.frame;
    g.clear();
    drawPanel(g, MODAL, 1, c);
    drawDivider(g, MODAL.x + 2, MODAL.y + 14, MODAL.width - 4, 1, c);
    // The split between the two panes, so the list and the dials read as two
    // answers to two questions rather than one wall of text.
    g.fillStyle(c.stone, 0.5);
    g.fillRect(PANE_X - 8, MODAL.y + 18, 1, MODAL.height - 40);

    const target = this.handlers.voice();
    this.drawTitle(c);
    this.drawTarget(target.name, c);

    for (const text of this.rowTexts) text.destroy();
    for (const zone of this.rowZones) zone.destroy();
    for (const text of this.headerTexts) text.destroy();
    for (const text of this.knobTexts) text.destroy();
    for (const zone of this.knobZones) zone.destroy();
    this.rowTexts = [];
    this.rowZones = [];
    this.headerTexts = [];
    this.knobTexts = [];
    this.knobZones = [];

    this.scrollToSelection();
    this.drawVoiceList(c);
    this.drawStack(c);
    this.drawKnobs(target.params, c);
    this.drawStatus(c);

    this.reveal();
  }

  /** Turn every freshly-built object back on, whatever `setOpen` last set. */
  private reveal(): void {
    for (const text of this.rowTexts) text.setVisible(this.opened);
    for (const zone of this.rowZones) zone.setVisible(this.opened);
    for (const text of this.headerTexts) text.setVisible(this.opened);
    for (const text of this.knobTexts) text.setVisible(this.opened);
    for (const zone of this.knobZones) zone.setVisible(this.opened);
    for (const entry of this.staticCopy) entry.obj.setVisible(this.opened);
    if (this.titleObj) this.titleObj.setVisible(this.opened);
    if (this.targetObj) this.targetObj.setVisible(this.opened);
    if (this.statusObj) this.statusObj.setVisible(this.opened);
  }

  /**
   * The instrument list: the user's saved sounds, then the built-in voices by
   * family.
   *
   * Both kinds are rows of one list, so they look the same, move the same and
   * apply the same — the only difference a reader sees is the heading above them
   * and the colour of the name, which is exactly as much difference as there is.
   */
  private drawVoiceList(c: ReturnType<typeof activeColors>): void {
    const g = this.frame;
    const entries = this.entries();
    const current = this.currentIndex();
    let y = LIST_TOP;
    let shown = 0;
    let lastHeading: string | null = null;

    for (let i = this.top; i < entries.length && shown < VISIBLE; i++) {
      const entry = entries[i];
      const heading = entry.kind === 'user' ? SAVED_LABEL : FAMILY_LABELS[entry.voice.family];
      if (heading !== lastHeading) {
        lastHeading = heading;
        const header = uiText(this.scene, LIST_X, y, heading, {
          size: 8, color: activeTheme().colors.ooze,
        });
        header.setDepth(DEPTH_FRONT + 1);
        this.body.add(header);
        this.headerTexts.push(header);
        y += LINE_H + 2;
      }

      const selected = i === this.selected;
      const here = i === current;
      if (selected) {
        g.fillStyle(c.ooze, 0.18);
        g.fillRect(LIST_X, y - 1, LIST_W, ROW_H - 1);
        g.fillStyle(c.ooze, 0.9);
        g.fillRect(LIST_X, y - 1, 2, ROW_H - 1);
      }

      const text = entry.kind === 'user' ? entry.saved.name : entry.voice.label.toUpperCase();
      const rest = entry.kind === 'user' ? c.ward : c.textPrimary;
      const label = uiText(this.scene, LIST_X + 6, y, text, {
        size: 8, color: selected ? c.ward : here ? c.textGreen : rest,
      });
      label.setDepth(DEPTH_FRONT + 1);
      this.body.add(label);
      this.rowTexts.push(label);

      // A saved sound that is more than its voice says so, right after its name
      // and in the same words the channel rows use (`+2`), so picking a sound is
      // never a surprise about how thick it is. Presets never carry this, because
      // a preset is one voice by definition.
      const chip = entry.kind === 'user' ? savedStackChip(entry.saved) : '';
      if (chip !== '') {
        const mark = uiText(this.scene, LIST_X + 12 + label.width, y, chip, {
          size: 8, color: selected ? c.ward : c.ooze,
        });
        mark.setDepth(DEPTH_FRONT + 1);
        this.body.add(mark);
        this.rowTexts.push(mark);
      }

      if (here) {
        const inUse = uiText(this.scene, LIST_X + LIST_W - 6, y, 'IN USE', {
          size: 8, color: c.textGreen, origin: { x: 1, y: 0 },
        });
        inUse.setDepth(DEPTH_FRONT + 1);
        this.body.add(inUse);
        this.rowTexts.push(inUse);
      }

      const zone = this.scene.add.zone(LIST_X, y - 1, LIST_W, ROW_H - 1)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      const index = i;
      zone.on('pointerdown', () => {
        this.selected = index;
        this.pane = 'voices';
        this.activate();
      });
      this.body.add(zone);
      this.rowZones.push(zone);

      y += ROW_H;
      shown += 1;
    }
  }

  /**
   * The waveform, the nine knobs, and the two dials that are how the channel is
   * PLAYED rather than what it is made of.
   *
   * Every dial is a label, a bar, and its two named ends, so a row answers all
   * three questions at once: what it is called, where it is now, and what either
   * end sounds like. Drawing them through one function is what keeps twelve rows
   * of dials reading as one list.
   */
  private drawKnobs(params: VoiceParams, c: ReturnType<typeof activeColors>): void {
    let y = this.drawWaveRow(params, c);

    VOICE_PARAMS.forEach((param, i) => {
      y = this.drawDial({
        label: param.label,
        caption: dutyCaption(param, params),
        value: params[param.id],
        focused: this.pane === 'knobs' && this.knob === i + 1,
        focus: () => { this.pane = 'knobs'; this.knob = i + 1; },
        set: (value) => this.setKnobTo(param.id, value),
      }, y, c);
    });

    // The two expression dials, last because they are about the PLAYING rather
    // than the instrument: a saved SOUND does not carry them, and a listener
    // hears them only once a note moves or holds.
    const expression: ReadonlyArray<{ which: 'glide' | 'vibrato'; label: string; caption: string }> = [
      { which: 'glide', label: 'GLIDE', caption: 'none ... whole note' },
      { which: 'vibrato', label: 'VIBRATO', caption: 'steady ... wide' },
    ];
    expression.forEach((dial, i) => {
      const index = VOICE_PARAMS.length + 1 + i;
      y = this.drawDial({
        label: dial.label,
        caption: dial.caption,
        value: dial.which === 'glide' ? this.handlers.glide() : this.handlers.vibrato(),
        focused: this.pane === 'knobs' && this.knob === index,
        focus: () => { this.pane = 'knobs'; this.knob = index; },
        set: (value) => this.setExpressionTo(dial.which, value),
      }, y, c);
    });
  }

  /**
   * The stack, as chips: `1 SQR  2 TRI  3 SAW`, right-aligned in the heading row.
   *
   * Drawn ONLY when the channel has layers above its voice, so a channel that is
   * one sound — which is almost every channel, and every channel of every song
   * written before stacks existed — sees a screen byte-identical to the one it
   * always saw. There is nothing to say about a stack of one.
   *
   * Chip 1 is the lit one, always: this menu edits the voice, and saying WHICH
   * layer that is costs one fill and answers the only question the strip raises.
   * The whole strip is one click target rather than one per chip — it is a
   * signpost, not a control panel, and a click belongs to "take me there".
   */
  private drawStack(c: ReturnType<typeof activeColors>): void {
    const sound = this.handlers.sound();
    const count = layerCount(sound);
    if (count < 2) return;

    const g = this.frame;
    // The copy is built first and measured second, because a chip has to be as
    // wide as the label inside it and only the label knows how wide that is. The
    // frames are then drawn UNDER the text they belong to: depth decides what is
    // on top here, not the order of these two passes.
    const labels: Phaser.GameObjects.Text[] = [];
    for (let i = 1; i <= count; i++) {
      const wave = layerAt(sound, i)?.wave ?? WAVES[0];
      const obj = uiText(this.scene, 0, STACK_Y + 2, `${i} ${WAVE_LABELS[wave]}`, {
        size: 8, color: c.textPrimary,
      });
      obj.setDepth(DEPTH_FRONT + 1);
      this.body.add(obj);
      this.knobTexts.push(obj);
      labels.push(obj);
    }

    const widths = labels.map((label) => Math.ceil(label.width) + STACK_PAD * 2);
    const total = widths.reduce((sum, width) => sum + width, 0) + STACK_GAP * (count - 1);
    let x = BODY_X + BODY_W - total;
    labels.forEach((label, i) => {
      const chip = { x, y: STACK_Y, width: widths[i], height: STACK_H };
      drawInset(g, chip, 1, c);
      if (i === 0) {
        g.fillStyle(c.ward, 0.85);
        g.fillRect(chip.x + 1, chip.y + 1, chip.width - 2, chip.height - 2);
      }
      label.setPosition(x + STACK_PAD, STACK_Y + 2);
      label.setColor(intToCss(i === 0 ? c.ink : c.textPrimary));
      x += chip.width + STACK_GAP;
    });

    const zone = this.scene.add.zone(BODY_X + BODY_W - total, STACK_Y - 1, total, STACK_H + 2)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.handlers.openDesign());
    this.body.add(zone);
    this.knobZones.push(zone);
  }

  /** The waveform row: one segment per shape, because a shape is picked and not dialled. */
  private drawWaveRow(params: VoiceParams, c: ReturnType<typeof activeColors>): number {
    const g = this.frame;
    const y = LIST_TOP;
    const focused = this.pane === 'knobs' && this.knob === 0;
    if (focused) {
      g.fillStyle(c.ooze, 0.14);
      g.fillRect(PANE_X - 4, y - 3, PANE_W + 8, KNOB_H - 2);
    }
    this.pushKnobText(PANE_X, y, 'WAVE', focused ? c.ward : c.textPrimary);
    const waveIndex = WAVES.indexOf(params.wave);
    this.pushKnobText(PANE_X + Math.floor(PANE_W / 2), y, 'square ... font', c.textDim, 0.5);
    this.pushKnobText(PANE_X + PANE_W, y, `${WAVE_LABELS[params.wave]}  ${waveIndex + 1}/${WAVES.length}`, c.textPrimary, 1);
    // SEGMENTS rather than a bar: a waveform has no amount, so a bar would read
    // as "mostly square", which is not a thing. One lit segment among the many
    // says "pick one of these" without a word of explanation.
    const gap = 6;
    const segmentW = Math.floor((PANE_W - gap * (WAVES.length - 1)) / WAVES.length);
    WAVES.forEach((_wave, i) => {
      const segment = { x: PANE_X + i * (segmentW + gap), y: y + BAR_Y, width: segmentW, height: BAR_H };
      drawInset(g, segment, 1, c);
      if (i === waveIndex) {
        g.fillStyle(focused ? c.ward : c.ooze, 0.75);
        g.fillRect(segment.x + 1, segment.y + 1, segment.width - 2, segment.height - 2);
      }
    });
    const zone = this.scene.add.zone(PANE_X, y - 4, PANE_W, KNOB_H - 4)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      this.pane = 'knobs';
      this.knob = 0;
      this.status = this.handlers.setWave(nextWave(this.handlers.voice().params.wave));
      this.handlers.audition();
      this.render();
    });
    this.body.add(zone);
    this.knobZones.push(zone);
    return y + KNOB_H + 4;
  }

  /**
   * One dial: its name, its two ends and its value on top, a bar under them, and
   * a click zone that sets the value wherever it landed.
   */
  private drawDial(
    dial: {
      label: string;
      caption: string;
      value: number;
      focused: boolean;
      focus: () => void;
      set: (value: number) => void;
    },
    y: number,
    c: ReturnType<typeof activeColors>,
  ): number {
    const g = this.frame;
    const { label, caption, value, focused } = dial;
    if (focused) {
      g.fillStyle(c.ooze, 0.14);
      g.fillRect(PANE_X - 4, y - 3, PANE_W + 8, KNOB_H - 2);
    }

    this.pushKnobText(PANE_X, y, label, focused ? c.ward : c.textPrimary);
    this.pushKnobText(PANE_X + Math.floor(PANE_W / 2), y, caption, c.textDim, 0.5);
    this.pushKnobText(PANE_X + PANE_W, y, value === 0 ? 'OFF' : String(value), focused ? c.ward : c.textPrimary, 1);

    const bar = { x: PANE_X, y: y + BAR_Y, width: PANE_W, height: BAR_H };
    drawInset(g, bar, 1, c);
    const ratio = (value - MIN_PARAM) / (MAX_PARAM - MIN_PARAM);
    const filled = Math.round(bar.width * ratio);
    if (filled > 0) {
      g.fillStyle(focused ? c.ward : c.ooze, 0.75);
      g.fillRect(bar.x + 1, bar.y + 1, Math.max(1, filled - 2), bar.height - 2);
    }

    // Click anywhere along the bar to SET the dial there: a dial you cannot point
    // at is a dial a beginner has to nudge ten times.
    const zone = this.scene.add.zone(bar.x, y - 4, bar.width, KNOB_H - 4)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dial.focus();
      const ratio = Math.max(0, Math.min(1, (p.x - bar.x) / bar.width));
      // Snapped to the same step a key nudge uses, so the two never disagree.
      const raw = Math.round((MIN_PARAM + ratio * (MAX_PARAM - MIN_PARAM)) / PARAM_STEP) * PARAM_STEP;
      dial.set(raw);
    });
    this.body.add(zone);
    this.knobZones.push(zone);

    return y + KNOB_H;
  }

  private pushKnobText(x: number, y: number, text: string, color: number, originX = 0): void {
    const obj = uiText(this.scene, x, y, text, { size: 8, color, origin: { x: originX, y: 0 } });
    obj.setDepth(DEPTH_FRONT + 1);
    this.body.add(obj);
    this.knobTexts.push(obj);
  }

  private drawTitle(c: ReturnType<typeof activeColors>): void {
    const saved = this.handlers.savedVoices().length;
    const mine = saved > 0 ? ` + ${saved} SAVED` : '';
    const text = `VOICES  -  ${VOICES.length} BUILT IN${mine}, ${VOICE_PARAMS.length} KNOBS`;
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

  /** Which channel the dials are pointed at, in the header and coloured by it. */
  private drawTarget(name: string, c: ReturnType<typeof activeColors>): void {
    const index = this.handlers.voice().index;
    const text = `CHANNEL ${index + 1}  ${name}`;
    if (!this.targetObj) {
      this.targetObj = uiText(this.scene, BODY_X, MODAL.y + 4, text, { size: 8, color: c.ward });
      this.targetObj.setDepth(DEPTH_FRONT + 2);
      this.staticCopy.push({ obj: this.targetObj, role: 'accent' });
    }
    this.targetObj.setText(text);
    this.targetObj.setColor(intToCss(c.ward));
  }

  /** The status line: the last change, or the highlighted instrument's own blurb. */
  private drawStatus(c: ReturnType<typeof activeColors>): void {
    if (!this.statusObj) {
      const obj = uiText(this.scene, BODY_X, STATUS_TOP, '', { size: 8, color: c.textPrimary });
      obj.setDepth(DEPTH_FRONT + 2);
      this.staticCopy.push({ obj, role: 'body' });
      this.statusObj = obj;
    }
    const entry = this.entries()[this.selected];
    // With nothing to report, the line teaches: what the highlighted instrument
    // is FOR — the whole reason a list of names beats a list of numbers for
    // someone who has never used a synth — or, once a knob moves, how to keep the
    // sound you just made.
    const fallback = this.pane === 'voices' && entry
      ? entry.kind === 'user'
        ? `ONE OF YOURS: ENTER USES IT ON THIS CHANNEL, DELETE FORGETS IT.`
        : entry.voice.blurb
      : this.handlers.savedVoices().length === 0
        ? 'EVERY KNOB IS A PERCENTAGE - SAVE AS... KEEPS THIS SOUND.'
        : 'EVERY KNOB IS A PERCENTAGE: 0 AND 100 ARE BOTH A REAL SOUND.';
    this.statusObj.setText(this.status === '' ? fallback : this.status);
    this.statusObj.setColor(intToCss(this.status === '' ? c.textDim : c.textPrimary));
  }

  destroy(): void {
    this.unsubscribe();
    this.box.destroy();
    for (const text of this.rowTexts) text.destroy();
    for (const text of this.headerTexts) text.destroy();
    for (const text of this.knobTexts) text.destroy();
    for (const entry of this.staticCopy) entry.obj.destroy();
    for (const button of this.buttons) button.destroy();
    this.dim.destroy();
    this.frame.destroy();
    this.body.destroy();
    this.curtain.destroy();
  }
}

/**
 * A dial's two ends in words.
 *
 * Almost every knob means the same thing on every shape, so this is normally the
 * knob's own `low ... high`. `duty` is the exception: it is the pulse's WIDTH on
 * a square, the register's LENGTH on a noise wave, a SLOT in the bank on a
 * `table` or a `sample` or a `string`, the VOWEL on a `formant`, the
 * REGISTRATION on an `organ` and the character on a `granular`, so its two ends
 * are named after the wave the channel is actually on. That is the one place a
 * single knob means several things, and the caption is where that is said rather
 * than left to the docs.
 */
function dutyCaption(param: VoiceParam, params: VoiceParams): string {
  if (param.id === 'duty') {
    if (params.wave === 'noise') return 'long ... short';
    if (params.wave === 'table') return 'hollow ... organ';
    if (params.wave === 'sample') return 'blip ... bell';
    if (params.wave === 'fm') return 'sine ... metal';
    if (params.wave === 'string') return 'pluck ... koto';
    if (params.wave === 'formant') return 'ah ... oo';
    if (params.wave === 'organ') return 'flute ... full';
    if (params.wave === 'granular') return 'crackle ... smear';
    // The bank is the loaded FONT's, so the menu cannot name its presets — the
    // knob walks them in order, and which one is which is the font's business.
    if (params.wave === 'font') return 'first preset ... last';
  }
  return `${param.low} ... ${param.high}`;
}
