import type Phaser from 'phaser';
import {
  activeColors,
  onThemeChanged,
  Button,
  Slider,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';
import { BPM_MAX, BPM_MIN, DEFAULT_GROOVE, DEFAULT_SWING, grooveLabel, MAX_SWING, MIN_SWING } from '../model/song';
import { keyName, scaleById, tonicName, type SongKey } from '../model/scale';
import type { GrooveId } from '../model/song';

/**
 * TransportBar — the strip along the bottom: play/stop, the pattern stepper,
 * tempo and master volume.
 *
 * It composes the framework's own `Button` and `Slider` rather than drawing its
 * own controls, so hover, drag, disabled and focus behaviour all come for free
 * and stay consistent with the rest of the app. The bar owns no state: every
 * interaction is a callback, and the scene pushes the current values back in
 * with the `set*` methods. That one-way flow is why the tempo read-out can
 * never disagree with what the sequencer is doing.
 *
 * Octave lives on the piano, not here: it changes which notes the KEYBOARD
 * writes, so it belongs with the keyboard.
 *
 * KEY lives here for the same reason TEMPO does: it is a property of the SONG,
 * not of an edit. Two buttons walk the tonic and the scale name is a button that
 * cycles the five scales, so the control is three presses wide and needs no menu
 * — and the piano redraws the instant it moves, which is the real feedback.
 *
 * SWING is the third slider, and the odd one out in one way worth knowing: it is
 * the only control here that changes when notes SOUND rather than which notes
 * play. It sits beside tempo because that is the other number a person reaches
 * for while the song is running — you set a lilt by ear, not by arithmetic.
 *
 * GROOVE is the other half of that: the feel the song is PLAYED with, next to
 * the key because it is the same sort of control — a word the whole song wears,
 * cycled by pressing it, with no theory in between.
 */

export interface TransportHandlers {
  onPlay?: () => void;
  onStop?: () => void;
  onTempo?: (bpm: number) => void;
  onVolume?: (volume: number) => void;
  /** The song's swing amount moved, 0..100. */
  onSwing?: (swing: number) => void;
  /** The groove button was pressed: move on to the next feel. */
  onGrooveCycle?: () => void;
  onPatternPrev?: () => void;
  onPatternNext?: () => void;
  /** The tonic moved by -1 or +1 semitone. */
  onTonicStep?: (delta: number) => void;
  /** The scale moved on to the next one in the list. */
  onScaleCycle?: () => void;
}

export interface TransportOptions {
  bpm: number;
  volume: number;
  /** The song's swing amount, 0..100. */
  swing?: number;
  /** The named feel the song is played with. */
  groove?: GrooveId;
  patternLabel: string;
  key: SongKey;
}

const ROW_H = 16;
const GAP = 8;
const STEP_W = 20;
const PLAY_W = 52;
/** Wide enough for `HARMONIC MINOR`, the longest scale name. */
const SCALE_W = 92;
/** Wide enough for `LAID BACK`, the longest groove label. */
const GROOVE_W = 92;
/** How much room the word GROOVE needs before its button. */
const GROOVE_TITLE_W = 42;

export class TransportBar {
  private readonly play: Button;
  private readonly stop: Button;
  private readonly patPrev: Button;
  private readonly patNext: Button;
  private readonly tempo: Slider;
  private readonly volume: Slider;
  private readonly swing: Slider;
  private readonly patLabel: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly tonicPrev: Button;
  private readonly tonicNext: Button;
  private readonly tonicLabel: Phaser.GameObjects.Text;
  private readonly scaleButton: Button;
  private readonly keyTitle: Phaser.GameObjects.Text;
  private readonly grooveButton: Button;
  private readonly grooveTitle: Phaser.GameObjects.Text;
  /** What the scale button would say if it were wide enough: the whole key. */
  scaleButtonHint = '';
  /** Whether the sequencer is running, and what MIDI has to say about it. */
  private playing = false;
  private midi = '';
  private unsubscribe: () => void;

  constructor(scene: Phaser.Scene, rect: Rect, handlers: TransportHandlers, options: TransportOptions) {
    const row1Y = rect.y;
    const row2Y = rect.y + ROW_H + 6;
    const row2H = Math.max(12, rect.height - ROW_H - 6);

    let x = rect.x;
    const next = (w: number): Rect => {
      const r = { x, y: row1Y, width: w, height: ROW_H };
      x += w + GAP;
      return r;
    };

    this.play = new Button(scene, next(PLAY_W), 'PLAY', { size: 8, icon: 'chevron-right' });
    this.stop = new Button(scene, next(PLAY_W), 'STOP', { size: 8 });
    this.play.onPress = () => handlers.onPlay?.();
    this.stop.onPress = () => handlers.onStop?.();
    this.stop.setEnabled(false);
    x += GAP * 2; // a little air between the transport and the song controls

    this.patPrev = new Button(scene, next(STEP_W), '<', { size: 8 });
    this.patPrev.onPress = () => handlers.onPatternPrev?.();
    const patRect = next(64);
    this.patLabel = uiText(scene, patRect.x, patRect.y + 4, options.patternLabel, { size: 8 });
    this.patNext = new Button(scene, next(STEP_W), '>', { size: 8 });
    this.patNext.onPress = () => handlers.onPatternNext?.();

    // KEY: the tonic is two steppers, the scale is a button that says its own
    // name, and the whole control reads left to right as the sentence it is —
    // "key, D, minor".
    x += GAP * 2;
    this.keyTitle = uiText(scene, x, row1Y + 4, 'KEY', { size: 8, color: activeColors().textDim });
    x += 26;
    this.tonicPrev = new Button(scene, next(STEP_W), '<', { size: 8 });
    this.tonicPrev.onPress = () => handlers.onTonicStep?.(-1);
    const tonicRect = next(18);
    this.tonicLabel = uiText(scene, tonicRect.x, tonicRect.y + 4, '', { size: 8 });
    this.tonicNext = new Button(scene, next(STEP_W), '>', { size: 8 });
    this.tonicNext.onPress = () => handlers.onTonicStep?.(1);
    this.scaleButton = new Button(scene, next(SCALE_W), '', { size: 8 });
    this.scaleButton.onPress = () => handlers.onScaleCycle?.();
    this.setKey(options.key);

    // GROOVE: the song's FEEL, beside the key because it is the same kind of
    // control — a word the whole song is played with, cycled by pressing it. It
    // is not a slider because a feel is chosen rather than dialled: the part of
    // one that IS a number is SWING, on the row below, and `backbeat` is a
    // decision where `60%` is not.
    x += GAP * 2;
    this.grooveTitle = uiText(scene, x, row1Y + 4, 'GROOVE', { size: 8, color: activeColors().textDim });
    x += GROOVE_TITLE_W;
    this.grooveButton = new Button(scene, next(GROOVE_W), '', { size: 8 });
    this.grooveButton.onPress = () => handlers.onGrooveCycle?.();
    this.setGroove(options.groove ?? DEFAULT_GROOVE);

    this.status = uiText(scene, rect.x + rect.width, row1Y + 4, 'STOPPED', {
      size: 8, color: activeColors().textDim, origin: { x: 1, y: 0 },
    });

    // Three sliders rather than two, because FEEL belongs with the other two
    // by-ear controls: tempo, level and swing are the three things a person
    // reaches for mid-playback, and all three have to be visible while the song
    // runs. Swing is a property of the SONG like tempo, and it is the whole of a
    // lilting rhythm — one number, no theory. Its read-out says STRAIGHT at zero,
    // which is the word for the grid everything else assumes.
    const third = Math.floor((rect.width - 20) / 3);
    this.tempo = new Slider(scene, { x: rect.x, y: row2Y, width: third, height: row2H }, {
      label: 'TEMPO', min: BPM_MIN, max: BPM_MAX, step: 1, value: options.bpm,
      format: (v) => `${v} BPM`,
    });
    this.tempo.onChange = (v) => handlers.onTempo?.(v);
    this.volume = new Slider(scene, { x: rect.x + third + 10, y: row2Y, width: third, height: row2H }, {
      label: 'VOLUME', min: 0, max: 1, step: 0.05, value: options.volume,
      format: (v) => `${Math.round(v * 100)}%`,
    });
    this.volume.onChange = (v) => handlers.onVolume?.(v);
    this.swing = new Slider(scene, { x: rect.x + (third + 10) * 2, y: row2Y, width: rect.width - (third + 10) * 2, height: row2H }, {
      // Step 1, not 5: a script or a file can set any whole percentage, and a
      // control that snaps its own read-out to the nearest five would then be
      // saying something the song does not say. One percent is a fine enough
      // nudge for a feel, and the number on screen is always the number playing.
      label: 'SWING', min: MIN_SWING, max: MAX_SWING, step: 1, value: options.swing ?? DEFAULT_SWING,
      format: (v) => (v <= MIN_SWING ? 'STRAIGHT' : v >= MAX_SWING ? 'MAX LILT' : `${v}%`),
    });
    this.swing.onChange = (v) => handlers.onSwing?.(v);

    this.recolor();
    this.unsubscribe = onThemeChanged(() => this.recolor());
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    this.play.setEnabled(!playing);
    this.stop.setEnabled(playing);
    this.renderStatus();
  }

  /**
   * What MIDI is doing, when it has something to say: `RECORDING`, `SYNC 128`,
   * `NO MIDI`, or `''` for "nothing worth a word".
   *
   * The word REPLACES `PLAYING`/`STOPPED` rather than joining it, and that is a
   * layout fact worth writing down: this line is right-aligned beside the GROOVE
   * button and fits about twenty characters, so "STOPPED, and also…" does not go.
   * The word that wins is the more urgent one — a person who sees `SYNC 128`
   * already knows the song is running, and one who sees `RECORDING` knows it too.
   */
  setMidi(label: string): void {
    this.midi = label;
    this.renderStatus();
  }

  setTempo(bpm: number): void {
    this.tempo.setValue(bpm, true);
  }

  setVolume(volume: number): void {
    this.volume.setValue(volume, true);
  }

  setSwing(swing: number): void {
    this.swing.setValue(swing, true);
  }

  /** Push the song's feel into the button. Read from the song, never cached. */
  setGroove(groove: GrooveId): void {
    this.grooveButton.setText(grooveLabel(groove));
  }

  setPatternLabel(label: string): void {
    this.patLabel.setText(label);
  }

  /** Push the song's key into the control. The two halves move independently. */
  setKey(key: SongKey): void {
    this.tonicLabel.setText(tonicName(key.tonic));
    // The button shows only the scale, because the tonic is right beside it: the
    // three pieces together read as "KEY D MINOR".
    this.scaleButton.setText(scaleById(key.scale).label);
    this.scaleButtonHint = `KEY ${keyName(key)}`;
  }

  private renderStatus(): void {
    const text = this.midi !== '' ? this.midi : this.playing ? 'PLAYING' : 'STOPPED';
    this.status.setText(text);
    this.status.setColor(cssOf(this.playing ? activeColors().ooze : activeColors().textDim));
  }

  private recolor(): void {
    const c = activeColors();
    this.patLabel.setColor(cssOf(c.textPrimary));
    this.keyTitle.setColor(cssOf(c.textDim));
    this.grooveTitle.setColor(cssOf(c.textDim));
    this.tonicLabel.setColor(cssOf(c.textPrimary));
    this.renderStatus();
  }

  destroy(): void {
    this.unsubscribe();
    for (const b of [this.play, this.stop, this.patPrev, this.patNext, this.tonicPrev, this.tonicNext, this.scaleButton, this.grooveButton]) b.destroy();
    this.tempo.destroy();
    this.volume.destroy();
    this.swing.destroy();
    this.patLabel.destroy();
    this.tonicLabel.destroy();
    this.keyTitle.destroy();
    this.grooveTitle.destroy();
    this.status.destroy();
  }
}

function cssOf(color: number): string {
  return '#' + (color >>> 0 & 0xffffff).toString(16).padStart(6, '0');
}
