/**
 * synth — the part of the sound that turns ONE note into nodes.
 *
 * This file exists because Tracklet needs to make a note in two places: while
 * you are PLAYING, onto a live `AudioContext`, and while EXPORTING, onto an
 * `OfflineAudioContext` that runs as fast as the CPU allows. Those two jobs want
 * the same instrument and nothing else in common, so the instrument lives here
 * and each caller brings its own clock.
 *
 * ── What a note is made of ───────────────────────────────────────────────────
 * A note is built from a PATCH (see `model/instrument.ts`), and a patch is a
 * stack of layers. Each layer is one instrument-voice:
 *
 *   oscillators ─┐
 *   (a THICK copy at ±detune) ├─→ envelope ─→ low-pass (BRIGHT) ─→ destination
 *   (NOISE, if any) ─────────┘
 *
 * The nine knobs keep exactly the meanings `voice.ts` promises — that promise is
 * the reason this app can be learned — and the layer's own three fields (octave,
 * detune, gain) say WHERE that voice sits in the stack rather than how it sounds.
 *
 * ── Why the arithmetic looks the way it does ─────────────────────────────────
 * A patch of ONE layer at full gain, in tune and un-transposed, produces the
 * exact signal this app produced before layers existed. That is not a
 * coincidence to be re-derived later: `patchFromVoice` builds precisely that
 * patch for every voice, and `model/__tests__/instrument.test.ts` pins the round
 * trip. So this is a refactor of where the numbers live, not a change to them.
 *
 * Dependency-free beyond Web Audio, and Phaser-free, so the live engine and the
 * offline renderer cannot drift apart.
 */

import { clampGlide, clampVelocity, clampVibrato, MAX_VELOCITY } from '../model/song';
import { DEFAULT_TUNING, tuningFor, tunedFreq, type Tuning } from '../model/tuning';
import { clampParam, MAX_PARAM } from '../model/voice';
import { DEFAULT_SHAPE, type FilterShape } from '../model/shape';
import { DEFAULT_SPEED, clampSpeed, speedFactor } from '../model/speed';
import {
  clampDrift,
  DRIFT_FLUTTER_CENTS,
  DRIFT_FLUTTER_HZ,
  DRIFT_MAX_CENTS,
  DRIFT_WOW_DRIFT_HZ,
  DRIFT_WOW_DRIFT_WEIGHT,
  DRIFT_WOW_HZ,
} from '../model/drift';
import {
  bendSeconds,
  clampBend,
  FALL_SPAN,
  SCOOP_SPAN,
  type Articulation,
} from '../model/articulation';
import { NO_TONE_SHIFT, type ToneShift } from '../model/variation';
import type { DrumId } from '../model/drum';
import type { Layer, Patch } from '../model/instrument';
import { SAMPLE_ROOT_HZ, sampleSeconds, type Sample, type SampleWindow } from '../model/sample';
import {
  kitFor,
  presetFor,
  zoneForNote,
  type FontPreset,
  type FontZone,
  type SoundFont,
} from '../model/soundfont';

/**
 * How fast a vibrato wobbles, in cycles per second.
 *
 * One fixed rate rather than a second knob, because a rate control is a control
 * nobody reaches for until they already know what they want, and every rate in
 * this neighbourhood reads as "alive" rather than as "wobbling". A voice that
 * wants a different one wants a different voice, not a different number here.
 */
export const VIBRATO_HZ = 5.5;

/**
 * How wide a full vibrato is, in cents — a hundredth of a semitone.
 *
 * Forty cents either side of the note: wide enough to hear on a single tone,
 * narrow enough that it never reads as being out of tune, and about where a
 * singer's own vibrato sits. Unlike a layer's detune this does not change the
 * pitch the note MEANS, which is why it is measured in cents rather than in
 * semitones.
 */
export const VIBRATO_CENTS = 40;

/**
 * How a note is played, beyond which pitch it is.
 *
 * The three numbers come from three different places — one note's velocity, its
 * channel's glide and vibrato — and they arrive together because they are the
 * same kind of thing: everything about a note that is not the note.
 */
export interface NoteOptions {
  /** How hard the note is hit, 0..100. Defaults to full. */
  velocity?: number;
  /** How much of the note's length is spent sliding into pitch, 0..100. */
  glide?: number;
  /** The pitch the slide starts from, or null when there is nothing to slide from. */
  fromMidi?: number | null;
  /**
   * The note's own PITCH BEND, in semitones, signed: `+N` scoops up onto the note
   * from N semitones below, `-N` falls away from it by N over its tail, and `0`
   * (the default) holds the pitch it was written at.
   *
   * A bend rather than a slide, because a slide is a relationship between two
   * notes and this is one note moving its own pitch — see
   * `model/articulation.ts`, which also owns how long a bend takes. The transport
   * is the oscillator's own `detune`, which is the parameter the vibrato rides, so
   * a bend and a wobble add rather than one replacing the other and every source
   * kind (an oscillator, a recording, a chip register) is bent by the same line.
   */
  bend?: number;
  /**
   * How this HIT varies from the note as written: a few cents of pitch, a little
   * level, a little brightness — the round-robin and velocity layers of
   * `model/variation.ts`, summed into one record by the sequencer that knows which
   * hit this is.
   *
   * Handed over whole rather than as the two settings, deliberately: the synth's
   * business is one note, and how a channel got to these three numbers (which hit
   * of the cycle, how hard it was struck) is the model's. Absent or all-zero is
   * the identity, so a note that varies in no way is built with the same numbers
   * as it was before this existed.
   */
  tone?: ToneShift;
  /** How much the pitch wobbles, 0..100. */
  vibrato?: number;
  /**
   * How far the pitch WANDERS, 0..100 — the wow and flutter of a worn transport,
   * the same wobble the `tape` effect carries but on its own. See
   * `model/drift.ts`, whose rates and widths this builds from.
   *
   * A note that says nothing holds the pitch it was written at, and a channel at
   * 0 schedules exactly the nodes it did before drift existed.
   */
  drift?: number;
  /**
   * The master tape SPEED, in percent of the written speed. See
   * `model/speed.ts`.
   *
   * The PITCH half of tape speed: every source's frequency is multiplied by the
   * factor, so an oscillator, a recorded key and a one-shot all move by the same
   * interval. The TIME half is the sequencer's (`secondsPerRow`). Absent or `100`
   * is the identity, so a song at normal speed is built exactly as before.
   */
  speed?: number;
  /**
   * The TEMPERAMENT the note is tuned by. Defaults to equal temperament, which
   * is exactly the frequency every note in this app was before tunings existed.
   */
  tuning?: Tuning;
  /** The tonic the tuning is read against, as a pitch class (0 = C). */
  tonic?: number;
  /**
   * The SOUNDFONT loaded for `wave font`, or null when none is.
   *
   * A soundfont is not part of a song — a song file is a few kilobytes of text
   * and a font is megabytes of somebody's recordings — so it travels with the
   * PERFORMANCE rather than with the notes. Passing it here is what keeps a song
   * portable: a song that says `wave font` plays the font you have open, and
   * plays its own fallback when you have none.
   */
  font?: SoundFont | null;
  /**
   * The recording this note's CHANNEL named, or null when it named none (or the
   * app has no file under that name). Travels beside `font` for the same reason:
   * the audio is the app's, the reference is the song's, and a note that named a
   * recording this machine lacks still has to sound — which is what the built-in
   * bank below is for.
   */
  sample?: Sample | null;
  /**
   * The PART of that recording the note plays — a take's trim window, and its
   * loop when it has one. Null (or absent) plays the whole file, which is what a
   * sample with no take behind it does. `sample` alone is the file; this is the
   * shape the RECORDER page put on it.
   */
  sampleWindow?: SampleWindow | null;
  /**
   * The drum this note is, or null (the default) for a melodic note.
   *
   * Only a `wave font` channel is affected, and only when the font has a drum
   * kit: the hit then plays the font's own kit rather than a preset the `duty`
   * knob happened to land on. Every other channel ignores it, because a drum hit
   * on a synthesized channel is already the sound it is. See `prepareFontVoice`.
   */
  drum?: DrumId | null;
}

/** A note's expression, clamped once so every layer is given the same numbers. */
interface NoteExpression {
  velocity: number;
  glide: number;
  fromMidi: number | null;
  /** The note's own pitch bend, in semitones, signed. See `NoteOptions.bend`. */
  bend: number;
  /** How this hit varies from the note as written. See `NoteOptions.tone`. */
  tone: ToneShift;
  vibrato: number;
  /** How far the pitch wanders. See `NoteOptions.drift`. */
  drift: number;
  /** The master tape speed. See `NoteOptions.speed`. */
  speed: number;
  tuning: Tuning;
  tonic: number;
  /** The soundfont this note may play, or null when none is loaded. */
  font: SoundFont | null;
  /**
   * The drum this note IS, or null for a melodic note.
   *
   * A drum hit on a `wave font` channel plays the FONT'S OWN KIT — the one
   * preset a `duty` cannot name (see `SoundFont.presets` past `MAX_FONT_PRESETS`,
   * and `kitFor`) — so the flag has to reach the synth. It is the same fact
   * `Cell.drum` carries, travelling the same way `font` does: with the note, for
   * the one note it describes.
   */
  drum: DrumId | null;
  /** The recording this note's channel named and the app has, or null. */
  sample: Sample | null;
  /** The part of that recording the note plays, or null for the whole file. */
  sampleWindow: SampleWindow | null;
  /** The frequency of a MIDI note under this note's temperament. */
  hz: (midi: number) => number;
}

/**
 * A note the sequencer should sound: which track, which MIDI pitch, and how hard
 * it is hit (0..100). See `velocity` in `model/song.ts`.
 *
 * The velocity travels WITH the note rather than being read off the song when the
 * note plays, so a note queued a moment ago sounds the way it was queued — the
 * same rule the engine already keeps for a channel's sound and note length.
 */
export interface ScheduledNote {
  track: number;
  midi: number;
  velocity: number;
  /**
   * How this note is PLAYED rather than what pitch it is: `>` slides into it,
   * `*3` hits it three times inside its own length. See
   * `model/articulation.ts`.
   *
   * It travels with the note for the same reason velocity does, and it is
   * REQUIRED rather than defaulted here, so a sequencer has to say what it
   * means: `rowNotes` answers with `NO_ARTICULATION` for a cell that says
   * nothing, which is one hit at the start for the whole length at the channel's
   * own glide — the note this interface described before articulation existed.
   */
  articulation: Articulation;
  /**
   * The DRUM this hit is, or null for a melodic note. See `Cell.drum`.
   *
   * It travels with the note for the same reason velocity and articulation do:
   * it is the third thing about THIS hit rather than about the channel — and on a
   * kit channel it is the whole point, since a kick, a snare and a hat share one
   * channel and are told apart by nothing else. `rowNotes` answers with the cell's
   * own drum, which is null for every cell a song had before kits.
   */
  drum: DrumId | null;
}

/**
 * What a sequencer asks for, once per step (one row of one pattern).
 *
 * `step` is the row within the song, so it wraps when the song loops — the grid's
 * reading. `absoluteStep` counts forward and never wraps: the reading a LIVE cue
 * needs, because a launch waits for a bar line that may be several loops away. It
 * is optional so a caller that only plays the order can ignore it.
 */
export type StepNotesFn = (step: number, absoluteStep?: number) => ScheduledNote[];

/** Peak amplitude of a single voice, before the master gain. */
export const VOICE_PEAK = 0.22;

/** A note rings for this share of its step, leaving a small gap between steps. */
export const NOTE_FILL = 0.9;

/** Everything one sounding note is made of, so a caller can unplug it. */
export interface NoteGraph {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  /** The voice's own envelope, so a caller can release it early. */
  env: GainNode;
}

/**
 * Map a BRIGHT percentage onto a low-pass cutoff, in Hz.
 *
 * Geometric rather than linear because that is how hearing works: 0 is a
 * muffled ~300 Hz, 50 is around a kilohertz, 100 is a wide-open 12 kHz. The
 * exact curve is not a promise — the RANGE is, and `bright 60` will keep
 * meaning "a bit more open than 50" even if the filter behind it changes.
 */
export function cutoffFor(bright: number): number {
  return 300 * Math.pow(40, Math.max(0, Math.min(100, bright)) / 100);
}

/**
 * The filter a SHAPE is, as a Web Audio node type.
 *
 * The model names the four in the words a person hears (`round`, `sharp`,
 * `nasal`, `hollow` — see `model/shape.ts`); this is where they become nodes,
 * beside the note they filter, so the model keeps its promise of knowing nothing
 * about audio. `round` is the low-pass every note here has always been, which is
 * why it is the one that gets whatever nobody recognises.
 */
const FILTER_TYPES: Readonly<Record<FilterShape, BiquadFilterType>> = {
  round: 'lowpass',
  sharp: 'highpass',
  nasal: 'bandpass',
  hollow: 'notch',
};

/**
 * How wide the filter's corner is, per shape.
 *
 * A low-pass or a high-pass at 0.7 is the gentle shelf this app has always had,
 * and anything sharper would colour the top of every note. The two that pass a
 * BAND are the opposite: at 0.7 a band-pass is so wide it is barely a shape at
 * all, so they narrow — enough to sound like a vowel or a telephone rather than a
 * tone control, and no narrower, or the note disappears when `bright` moves.
 */
const FILTER_Q: Readonly<Record<FilterShape, number>> = {
  round: 0.7,
  sharp: 0.7,
  nasal: 2.2,
  hollow: 1.6,
};

/** The node type a channel's filter shape is, for `buildNote`. */
export function filterTypeFor(shape: FilterShape): BiquadFilterType {
  return FILTER_TYPES[shape] ?? 'lowpass';
}

/** How wide that filter's corner is, for `buildNote`. */
export function filterQFor(shape: FilterShape): number {
  return FILTER_Q[shape] ?? FILTER_Q.round;
}

/**
 * How many octaves a full SWEEP throws the filter open, above the note's own
 * brightness.
 *
 * Three octaves is 8x, which is enough to go from a dull tone to a bright one
 * across the keyboard without the top notes screaming into the top of hearing —
 * the same reason `bright` tops out at 12 kHz rather than at Nyquist.
 */
export const SWEEP_OCTAVES = 3;

/**
 * How much longer the DECAY may be made, in seconds, at the top of the knob.
 *
 * The base decay is the short, proportional drop the envelope has always made;
 * `decay 100` adds this on top, which is enough to turn a hit into a slow swell
 * without the fall outlasting an ordinary note.
 */
export const DECAY_SPAN = 1.2;

/**
 * How much slower the RELEASE fades, in seconds, at the top of the knob.
 *
 * This is a TIME CONSTANT, not a duration: the level reaches about a third of
 * the way down in one of these, so the tail is a few times this long. The base
 * is the short tail the app has always had.
 */
export const RELEASE_SPAN = 0.6;

/**
 * How much longer a fully-released note's source keeps sounding, in seconds.
 *
 * A `setTargetAtTime` never quite reaches zero, so the oscillator has to be
 * stopped by hand — late enough that the tail has faded out (about five time
 * constants) rather than being cut off mid-ring.
 */
export const RELEASE_TAIL = 3;

/** Where a sweep is allowed to open to, however bright the note already is. */
export const MAX_FILTER_HZ = 18000;

/**
 * The cutoff a fully-swept note STARTS at, for a given brightness and sweep.
 *
 * The same geometric reasoning as `cutoffFor`: a sweep is heard as an interval
 * (an octave of opening), not as a number of hertz, so it is multiplied rather
 * than added. At sweep 0 this is exactly `cutoffFor(bright)`, which is what keeps
 * a note with no sweep the plain, steady tone it always was.
 */
export function sweepOpenFor(bright: number, sweep: number): number {
  const octaves = (Math.max(0, Math.min(100, sweep)) / 100) * SWEEP_OCTAVES;
  return Math.min(MAX_FILTER_HZ, cutoffFor(bright) * Math.pow(2, octaves));
}

/** Half a second of white noise, made once and looped by every hissy note. */
export function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * The narrowest and widest part of the wave a DUTY value can mean.
 *
 * A square is a pulse that is half on; `duty 0` is the thin 12.5% pulse a NES or
 * Game Boy lead uses, and `duty 100` is the 50% square this app has always made.
 * The range is deliberately inside the shapes that sound like an instrument: a
 * pulse narrower than an eighth is a click, and wider than half is the same
 * shape mirrored, so both ends are real sounds. See `model/voice.ts`.
 */
export const MIN_PULSE_WIDTH = 0.125;
export const MAX_PULSE_WIDTH = 0.5;

/** Map a DUTY percentage onto the fraction of the period the pulse is on. */
export function pulseWidthFor(duty: number): number {
  const d = Math.max(0, Math.min(100, duty)) / 100;
  return MIN_PULSE_WIDTH + d * (MAX_PULSE_WIDTH - MIN_PULSE_WIDTH);
}

/**
 * One pulse wave per width per context, because a Fourier series is not free.
 *
 * The coefficients depend only on the width, and a song usually uses one or two
 * widths for its whole length, so caching turns "a hundred notes a second" into
 * "a handful of tables". Keyed on the CONTEXT as well as the width, because a
 * `PeriodicWave` belongs to the context that made it and the offline renderer
 * builds its own.
 */
const PULSE_TABLES = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

/**
 * A pulse wave of the given DUTY, as a `PeriodicWave` the oscillators can wear.
 *
 * Built from the exact Fourier series of a rectangular pulse, so a narrower duty
 * genuinely has the reedy, nasal harmonics a chip lead has rather than being a
 * filtered square. Eighty harmonics is past the point the ear can tell (and past
 * where the browser's own antialiasing stops adding anything) without making a
 * table expensive to build.
 */
export function pulsePeriodicWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const width = pulseWidthFor(duty);
  const key = Math.round(width * 1000);
  let tables = PULSE_TABLES.get(ctx);
  if (!tables) {
    tables = new Map();
    PULSE_TABLES.set(ctx, tables);
  }
  const cached = tables.get(key);
  if (cached) return cached;
  const harmonics = 80;
  const real = new Float32Array(harmonics);
  const imag = new Float32Array(harmonics);
  for (let n = 1; n < harmonics; n++) {
    const scale = 2 / (n * Math.PI);
    real[n] = scale * Math.sin(2 * Math.PI * n * width);
    imag[n] = scale * (1 - Math.cos(2 * Math.PI * n * width));
  }
  const wave = ctx.createPeriodicWave(real, imag);
  tables.set(key, wave);
  return wave;
}

// --- FM: one oscillator bending another's pitch ----------------------------

/**
 * The ratio the modulator runs at, against the carrier.
 *
 * Two, so the modulator is an octave above the note. A ratio of ONE is also a
 * classic (it sweeps a sine toward a sawtooth as the index rises), but two is the
 * brighter, hollower colour that a Genesis or an AdLib is recognised by, and it
 * is different enough from this app's square and saw waves to be worth a slot of
 * its own. A fixed ratio rather than a control because a ratio is the sort of
 * number that makes an FM synth a spreadsheet; the SHAPE control is `duty`.
 */
export const FM_RATIO = 2;

/**
 * The modulation index at `duty 100`, against the carrier frequency.
 *
 * An index is how many times the modulator's own frequency the carrier's pitch
 * is bent by. Zero is a pure sine and about eight is a bright, metallic, almost
 * broken-up tone — the whole usable range of a two-operator FM voice, with the
 * middle of the knob the sweet spot for basses and leads.
 */
export const FM_MAX_INDEX = 8;

/**
 * How far, in Hz, the carrier's pitch is bent — the modulation DEPTH.
 *
 * The index times the modulator's frequency, which is why this scales with the
 * note: a voice keeps its timbre up and down the keyboard instead of going dull
 * low and screaming high, exactly as an FM chip does.
 */
export function fmDepth(duty: number, frequency: number): number {
  const d = Math.max(0, Math.min(100, duty)) / 100;
  return d * FM_MAX_INDEX * frequency * FM_RATIO;
}

// --- chip wavetable: a period built from a table of harmonics --------------

/**
 * One chip wavetable: a named spectrum that `duty` selects.
 *
 * A wavetable is how a Game Boy or a PC Engine makes every non-square sound — a
 * small table of samples looped as one period of the wave. The samples are not
 * what matters (they are just a shape); what matters is that a chip has a BANK of
 * them and you PICK one, which is why `duty` on a `table` wave selects a table
 * rather than dialling a number. The spectra here are written as harmonic
 * amplitudes, which is the same table by another name and keeps each one short
 * enough to read.
 */
export interface ChipWaveTable {
  id: string;
  /** The three-to-seven letter name shown on screen. */
  label: string;
  /** One line, in the same voice a voice's blurb uses. */
  blurb: string;
  /** Harmonic amplitudes, index 1..N; index 0 is the (unused) DC term. */
  harmonics: readonly number[];
}

/** How many harmonics each table is built from — plenty past what an ear can hear. */
const TABLE_HARMONICS = 48;

function harmonicsOf(spec: (n: number) => number): number[] {
  const out: number[] = new Array(TABLE_HARMONICS + 1).fill(0);
  for (let n = 1; n <= TABLE_HARMONICS; n++) out[n] = spec(n);
  return out;
}

/**
 * The bank, soft to rich, because `duty` rises through it in this order.
 *
 * Each is chosen to be something the four plain waves are NOT, so the table is
 * worth having beside them: a hollow tone that is neither square nor triangle, a
 * glassy one you cannot get by filtering a sine, a reedy one with a formant, a
 * buzzy saw-like one, and a drawbar organ.
 */
export const WAVE_TABLES: readonly ChipWaveTable[] = [
  {
    id: 'hollow', label: 'HOLLOW', blurb: 'a soft, hooting tone: a square that has lost its buzz',
    harmonics: harmonicsOf((n) => (n % 2 === 1 ? 1 / (n * n) : 0)),
  },
  {
    id: 'glass', label: 'GLASS', blurb: 'sparse high harmonics: a thin, glassy ring',
    harmonics: harmonicsOf((n) => {
      if (n === 1) return 1;
      if (n === 3) return 0.12;
      if (n === 5) return 0.5;
      if (n === 7) return 0.2;
      return 0;
    }),
  },
  {
    id: 'reed', label: 'REED', blurb: 'a formant on the third and fifth: reedy and nasal',
    harmonics: harmonicsOf((n) => {
      if (n % 2 === 0) return 0;
      const boost = n === 3 || n === 5 ? 1.6 : 1;
      return boost / n;
    }),
  },
  {
    id: 'buzz', label: 'BUZZ', blurb: 'every harmonic, barely damped: a bright, saw-like buzz',
    harmonics: harmonicsOf((n) => 1 / Math.pow(n, 0.75)),
  },
  {
    id: 'organ', label: 'ORGAN', blurb: 'a drawbar stack: octaves and fifths, churchy and steady',
    harmonics: harmonicsOf((n) => {
      const weights: Record<number, number> = { 1: 1, 2: 0.6, 3: 0.4, 4: 0.3, 6: 0.2, 8: 0.15 };
      return weights[n] ?? 0;
    }),
  },
];

/** Which table a `duty` picks: the bank spread evenly across 0..100. */
export function waveTableIndexFor(duty: number): number {
  const d = Math.max(0, Math.min(100, duty));
  const count = WAVE_TABLES.length;
  return Math.min(count - 1, Math.floor((d / 100) * count));
}

/** The table a `duty` picks, for a menu that wants to name it. */
export function waveTableFor(duty: number): ChipWaveTable {
  return WAVE_TABLES[waveTableIndexFor(duty)];
}

/** One table per context, because a Fourier series is not free and a bank is fixed. */
const TABLE_WAVES = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

/** A chip wavetable as a `PeriodicWave` the oscillators can wear. */
export function wavetablePeriodicWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const index = waveTableIndexFor(duty);
  let tables = TABLE_WAVES.get(ctx);
  if (!tables) {
    tables = new Map();
    TABLE_WAVES.set(ctx, tables);
  }
  const cached = tables.get(index);
  if (cached) return cached;
  const { harmonics } = WAVE_TABLES[index];
  const real = new Float32Array(harmonics.length);
  const imag = new Float32Array(harmonics.length);
  for (let n = 1; n < harmonics.length; n++) imag[n] = harmonics[n];
  const wave = ctx.createPeriodicWave(real, imag);
  tables.set(index, wave);
  return wave;
}

/** The waveform an oscillator can wear: the chip sources are not `OscillatorType`s. */
function oscillatorShape(wave: Layer['wave']): OscillatorType {
  // `fm` is a SINE carrier with a modulator bending it; the rest of the chip
  // sources are not oscillators at all and never reach here.
  if (wave === 'fm') return 'sine';
  return wave === 'noise' || wave === 'table' || wave === 'sample' || wave === 'string'
    || wave === 'formant' || wave === 'organ' || wave === 'granular' || wave === 'font'
    || wave === 'reed' || wave === 'brass' || wave === 'bow' || wave === 'mallet'
    || wave === 'membrane' || wave === 'plate'
    ? 'square'
    : wave;
}

// --- chip noise: the LFSR ------------------------------------------------

/**
 * The pitch that plays the noise register at speed 1, and the fastest and
 * slowest it will go.
 *
 * The chip noise channel is PITCHED: the note does not sound a tone, it sets how
 * fast the shift register is clocked, which is why a low note is a coarse rumble
 * and a high one a fine hiss. Middle C is the reference so `C-4` is the neutral
 * speed, and the ends are clamped because a note four octaves up must not clock
 * the register faster than the audio rate can carry.
 */
export const NOISE_REFERENCE_HZ = 261.63;
export const NOISE_RATE_MIN = 0.125;
export const NOISE_RATE_MAX = 24;
/** A DUTY below this picks the SHORT (6-bit) register — the metallic one. */
export const NOISE_SHORT_DUTY = 50;
/** Chip noise is busy, so it sits under a square of the same peak for a start. */
export const NOISE_WAVE_GAIN = 0.55;

/** How fast to clock the noise register for a note of this frequency. */
export function noiseRate(frequency: number): number {
  return Math.max(NOISE_RATE_MIN, Math.min(NOISE_RATE_MAX, frequency / NOISE_REFERENCE_HZ));
}

/**
 * The bit stream a shift register makes, as a `Float32Array` of +1 and -1.
 *
 * This IS the chip noise from first principles: a linear-feedback shift register
 * with the NES's feedback (bit 0 XOR bit 1), run for one whole period. The LONG
 * setting is the 15-bit register — 32767 steps before it repeats, which is white
 * enough to hear as hiss — and the SHORT one is 6-bit, only 63 steps, which
 * repeats so fast it rings as a metallic tone. That difference is the whole
 * reason a chip has two noise colours.
 *
 * Deterministic on purpose: no `Math.random`, so the same note draws the same
 * waveform in the app, in an export, and in a test.
 */
export function lfsrSequence(short: boolean): Float32Array {
  const bits = short ? 6 : 15;
  const period = (1 << bits) - 1;
  const out = new Float32Array(period);
  let reg = 1;
  for (let i = 0; i < period; i++) {
    const bit = ((reg & 1) ^ ((reg >> 1) & 1)) & 1;
    reg = (reg >>> 1) | (bit << (bits - 1));
    out[i] = (reg & 1) === 1 ? 1 : -1;
  }
  return out;
}

/** One register per mode per context; the sequence is the same for all of them. */
const LFSR_BUFFERS = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

export function makeLfsrBuffer(ctx: BaseAudioContext, short: boolean): AudioBuffer {
  const key = short ? 'short' : 'long';
  let buffers = LFSR_BUFFERS.get(ctx);
  if (!buffers) {
    buffers = new Map();
    LFSR_BUFFERS.set(ctx, buffers);
  }
  const cached = buffers.get(key);
  if (cached) return cached;
  const sequence = lfsrSequence(short);
  const buffer = ctx.createBuffer(1, sequence.length, ctx.sampleRate);
  buffer.getChannelData(0).set(sequence);
  buffers.set(key, buffer);
  return buffer;
}

// --- chip samples: short one-shots, played once ----------------------------

/**
 * A built-in ONE-SHOT: a short sound the note triggers rather than a source that
 * runs for the note's length.
 *
 * This is what "sample" means in a chip — the Super NES and the Advance held
 * banks of short recordings and played them back, pitched, with no synthesis at
 * all. Tracklet has no files to load, so the bank is SYNTHESIZED here instead,
 * deterministically and once per context: each entry is a handful of lines that
 * render a short, decaying waveform. The point is not where the numbers came
 * from, it is the BEHAVIOUR — a fixed-length sound that rings out on its own, so
 * `hold` cannot stretch it and two notes on one channel are two hits.
 *
 * `duty` picks from the bank, the same way it picks a wavetable, because a chip
 * selects a sample from a bank and never interpolates between two.
 */
export interface ChipSample {
  id: string;
  /** The name shown on screen and in the docs. */
  label: string;
  /** One line, in the same voice a voice's blurb uses. */
  blurb: string;
  /** The pitch the sample is written at; a note plays it at note/root. */
  rootHz: number;
  /** Render the samples. Deterministic, so a render is the file you heard. */
  render(sampleRate: number): Float32Array;
}

/** A tiny deterministic noise source, so a rendered sample is the same every time. */
function seededNoise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
}

/** Fill a length-in-seconds buffer, then normalise it to a peak of 1. */
function renderInto(sampleRate: number, seconds: number, at: (t: number, i: number) => number): Float32Array {
  const length = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(length);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const value = at(i / sampleRate, i);
    out[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  if (peak > 0) for (let i = 0; i < length; i++) out[i] /= peak;
  return out;
}

const ROOT_HZ = 261.63;

/**
 * The bank, brightest and shortest to longest and most ringing.
 *
 * Chosen so each is something the synth cannot otherwise make in one note: a
 * menu blip, a plucked string, a woodblock, a clap, a tom and a bell.
 */
export const SAMPLE_BANK: readonly ChipSample[] = [
  {
    id: 'blip', label: 'BLIP', blurb: 'a bright 8-bit blip: short, square and gone', rootHz: ROOT_HZ,
    render: (sr) => renderInto(sr, 0.12, (t) => Math.sign(Math.sin(2 * Math.PI * ROOT_HZ * t)) * Math.exp(-t * 26)),
  },
  {
    id: 'pluck', label: 'PLUCK', blurb: 'a struck string: bright at first, then only its low notes', rootHz: ROOT_HZ,
    render: (sr) => renderInto(sr, 0.5, (t) => {
      let sum = 0;
      for (let k = 1; k <= 8; k++) sum += (1 / k) * Math.sin(2 * Math.PI * ROOT_HZ * k * t) * Math.exp(-t * (5 + k * 2));
      return sum;
    }),
  },
  {
    id: 'wood', label: 'WOOD', blurb: 'a woodblock: a click of noise over a fast, dead tone', rootHz: ROOT_HZ,
    render: (sr) => {
      const noise = seededNoise(0x1234);
      return renderInto(sr, 0.14, (t) => 0.6 * Math.sin(2 * Math.PI * ROOT_HZ * 3 * t) * Math.exp(-t * 45) + 0.4 * noise() * Math.exp(-t * 70));
    },
  },
  {
    id: 'clap', label: 'CLAP', blurb: 'a hand clap: three quick bursts of noise and a short tail', rootHz: ROOT_HZ,
    render: (sr) => {
      const noise = seededNoise(0x51ce);
      const env = (t: number) => {
        const burst = (at: number) => Math.exp(-Math.pow((t - at) / 0.006, 2));
        return Math.max(burst(0), burst(0.011) * 0.9, burst(0.023) * 0.8) + 0.35 * Math.exp(-t * 16) * (t > 0.02 ? 1 : 0);
      };
      return renderInto(sr, 0.3, (t) => noise() * env(t));
    },
  },
  {
    id: 'tom', label: 'TOM', blurb: 'a tom drum: one low note that falls as it dies', rootHz: ROOT_HZ,
    render: (sr) => renderInto(sr, 0.35, (t) => {
      const freq = ROOT_HZ * (1.6 - 0.6 * Math.min(1, t / 0.12));
      return Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 8);
    }),
  },
  {
    id: 'bell', label: 'BELL', blurb: 'a struck bell: a few inharmonic partials ringing out', rootHz: ROOT_HZ,
    render: (sr) => {
      const ratios = [1, 2.76, 5.4, 8.9];
      const amps = [1, 0.5, 0.3, 0.18];
      const decays = [2.5, 4, 5.5, 7];
      return renderInto(sr, 1.2, (t) => {
        let sum = 0;
        for (let k = 0; k < ratios.length; k++) sum += amps[k] * Math.sin(2 * Math.PI * ROOT_HZ * ratios[k] * t) * Math.exp(-t * decays[k]);
        return sum;
      });
    },
  },
];

/** Which sample a `duty` picks: the bank spread evenly across 0..100. */
export function sampleIndexFor(duty: number): number {
  const d = Math.max(0, Math.min(100, duty));
  const count = SAMPLE_BANK.length;
  return Math.min(count - 1, Math.floor((d / 100) * count));
}

export function sampleFor(duty: number): ChipSample {
  return SAMPLE_BANK[sampleIndexFor(duty)];
}

/** How fast a note plays a sample: its pitch against the sample's own pitch. */
export function sampleRateFor(frequency: number, rootHz: number): number {
  return Math.max(0.05, Math.min(32, frequency / rootHz));
}

/** One rendered sample per bank slot per context. */
const SAMPLE_BUFFERS = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

export function makeSampleBuffer(ctx: BaseAudioContext, duty: number): AudioBuffer {
  const index = sampleIndexFor(duty);
  let buffers = SAMPLE_BUFFERS.get(ctx);
  if (!buffers) {
    buffers = new Map();
    SAMPLE_BUFFERS.set(ctx, buffers);
  }
  const cached = buffers.get(index);
  if (cached) return cached;
  const data = SAMPLE_BANK[index].render(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  buffers.set(index, buffer);
  return buffer;
}

/** One buffer per loaded recording per context. */
const OWNED_BUFFERS = new WeakMap<Sample, WeakMap<BaseAudioContext, AudioBuffer>>();

/** How close to the whole recording a window must be to count as untouched. */
const SAMPLE_WINDOW_EPSILON = 1e-4;

/** A loop shorter than this is a stutter, not a setting — the take model's rule. */
const MIN_LOOP_SECONDS = 0.02;

/**
 * A loaded recording as an `AudioBuffer`, one per context.
 *
 * Cached because a chord asks for the same recording several times in the same
 * instant and `createBuffer` COPIES the frames in — so without the cache an
 * eight-note chord on one sample would copy the whole file eight times per note,
 * which is the kind of cost that only shows up on somebody else's laptop. The
 * WeakMap is keyed by the `Sample` object, so replacing the file under a name (a
 * fresh import) makes a fresh buffer and the old one is collectable.
 */
export function ownedSampleBuffer(ctx: BaseAudioContext, sample: Sample): AudioBuffer {
  let byContext = OWNED_BUFFERS.get(sample);
  if (!byContext) {
    byContext = new WeakMap();
    OWNED_BUFFERS.set(sample, byContext);
  }
  const cached = byContext.get(ctx);
  if (cached) return cached;
  // The file's OWN rate, so a 22.05 kHz or 48 kHz recording plays in tune and at
  // its recorded length — the browser resamples on playback, and the pitch
  // question is the note's (see `sampleRateFor`).
  const buffer = ctx.createBuffer(1, Math.max(1, sample.pcm.length), sample.rate);
  buffer.getChannelData(0).set(sample.pcm);
  byContext.set(ctx, buffer);
  return buffer;
}

/** A recording's played window: the sliced buffer, and its loop points inside it. */
export interface WindowedSampleBuffer {
  /** The slice's frames, at the recording's own rate. */
  buffer: AudioBuffer;
  /** Where the loop starts, in seconds from the SLICE's start. */
  loopStart: number;
  /** Where the loop ends, in seconds from the SLICE's start. */
  loopEnd: number;
}

/** One sliced buffer per (recording, context, window), so a chord copies once. */
const WINDOWED_BUFFERS = new WeakMap<Sample, WeakMap<BaseAudioContext, Map<string, WindowedSampleBuffer>>>();

/**
 * A recording cut to its window, so playing the slice IS playing the trim.
 *
 * Slicing rather than starting the source at an offset is what makes the trim's
 * END honest: a source handed an offset still runs to the end of the buffer, so
 * audio a person trimmed away would be heard anyway and only stopped by the
 * note's own envelope. A slice ends where the window ends, and its loop points
 * are relative to the slice, so one descriptor drives both the trim and the loop
 * without the player ever knowing which seconds of the file it holds.
 *
 * Cached per recording per context per window, for `ownedSampleBuffer`'s reason:
 * `createBuffer` COPIES, and an eight-note chord on a trimmed take would copy the
 * window eight times a note without this. The key is the frame bounds and the loop
 * frames, so dragging a handle makes a new entry and the same trim reused across
 * a chord is one copy. The map is small and cleared when it grows past a session's
 * worth of edits, which bounds it without an eviction policy.
 */
export function windowedSampleBuffer(ctx: BaseAudioContext, sample: Sample, window: SampleWindow): WindowedSampleBuffer {
  let byContext = WINDOWED_BUFFERS.get(sample);
  if (!byContext) {
    byContext = new WeakMap();
    WINDOWED_BUFFERS.set(sample, byContext);
  }
  let byKey = byContext.get(ctx);
  if (!byKey) {
    byKey = new Map();
    byContext.set(ctx, byKey);
  }
  const frames = Math.max(1, sample.pcm.length);
  const from = Math.max(0, Math.min(Math.round(window.start * sample.rate), frames - 1));
  const to = Math.max(from + 1, Math.min(Math.round(window.end * sample.rate), frames));
  const span = to - from;
  const loopFrom = Math.max(0, Math.min(Math.round((window.loopStart - window.start) * sample.rate), span));
  const loopTo = Math.max(loopFrom, Math.min(Math.round((window.loopEnd - window.start) * sample.rate), span));
  const key = `${from}:${to}:${window.loop ? 1 : 0}:${loopFrom}:${loopTo}`;
  const cached = byKey.get(key);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, span, sample.rate);
  buffer.getChannelData(0).set(sample.pcm.subarray(from, to));
  const made: WindowedSampleBuffer = { buffer, loopStart: loopFrom / sample.rate, loopEnd: loopTo / sample.rate };
  if (byKey.size > 64) byKey.clear();
  byKey.set(key, made);
  return made;
}

// --- the plucked string: Karplus-Strong ------------------------------------

/**
 * A plucked string, from first principles: Karplus-Strong.
 *
 * The idea is one sentence long — fill a delay line one period long with a burst
 * of noise, then feed it back through an averaging filter and let it ring. The
 * averaging is a lowpass, so the high harmonics die first and what is left is the
 * slow wobble of a string; the loop's gain is the string's DAMPING, so it decides
 * how long the note rings. Two lines of arithmetic, and a sound no oscillator can
 * make, which is exactly why it is worth a wave of its own.
 *
 * ── Why it is RENDERED rather than wired up live ─────────────────────────────
 * The obvious Web Audio version is a feedback loop: a `DelayNode` fed back
 * through a filter. That version cannot play the top of the keyboard — a delay
 * inside a loop is clamped to one render quantum (~2.7 ms), so any string shorter
 * than that comes out at the wrong pitch. Rendering the string into a buffer and
 * playing it back PITCHED, the way `sample` does, has no such ceiling and is
 * deterministic besides: no `Math.random`, so the same note draws the same string
 * in the app, in an export, and in a test.
 *
 * `duty` picks from the bank, the same way it picks a wavetable or a one-shot,
 * because on this shelf a chip selects from a bank and never interpolates.
 */
export interface PluckedString {
  id: string;
  /** The name shown on screen and in the docs. */
  label: string;
  /** One line, in the same voice a voice's blurb uses. */
  blurb: string;
  /** The pitch the string is written at; a note plays it at note/root. */
  rootHz: number;
  /** Render the string. Deterministic, so a render is the file you heard. */
  render(sampleRate: number): Float32Array;
}

/**
 * The bank, dampest to longest, because `duty` rises through it in that order.
 *
 * Each entry is the same model with different numbers: `damping` is the loop's
 * gain (how long the string rings) and `tone` how much of the excitation's top
 * end survives into the string (how bright the pluck is). `seconds` is only how
 * long to compute — a string that has faded out has nothing left to say.
 */
interface StringSpec {
  id: string;
  label: string;
  blurb: string;
  damping: number;
  tone: number;
  seconds: number;
  seed: number;
}

const STRING_SPECS: readonly StringSpec[] = [
  { id: 'pluck', label: 'PLUCK', blurb: 'a bright plectrum: a sharp attack and a quick decay', damping: 0.994, tone: 1, seconds: 0.9, seed: 0x9e37 },
  { id: 'steel', label: 'STEEL', blurb: 'a steel guitar string: bright, ringing and even', damping: 0.997, tone: 0.85, seconds: 1.3, seed: 0x51ce },
  { id: 'nylon', label: 'NYLON', blurb: 'a soft nylon string: round, quick and without edge', damping: 0.988, tone: 0.3, seconds: 0.8, seed: 0x4f1b },
  { id: 'harp', label: 'HARP', blurb: 'a harp: mellow and long, the pluck almost gone', damping: 0.9985, tone: 0.5, seconds: 1.6, seed: 0x27d4 },
  { id: 'koto', label: 'KOTO', blurb: 'a plucked zither: bright and short, with a hard metallic edge', damping: 0.991, tone: 1, seconds: 0.7, seed: 0x11ab },
];

/**
 * One Karplus-Strong string, rendered offline.
 *
 * The delay line is one period of the note, filled with a noise burst that the
 * loop's averaging filter then rounds off. `tone` lowpasses that burst first, so
 * a soft string starts with less high end than a bright one — a real plectrum and
 * a fingertip are not the same excitation.
 */
function karplusStrong(
  sampleRate: number,
  frequency: number,
  spec: Pick<StringSpec, 'damping' | 'tone' | 'seconds' | 'seed'>,
): Float32Array {
  const seconds = spec.seconds;
  const length = Math.max(1, Math.floor(sampleRate * seconds));
  const period = Math.max(2, Math.round(sampleRate / frequency));
  const rnd = seededNoise(spec.seed);

  const delay = new Float32Array(period);
  let smooth = 0;
  for (let i = 0; i < period; i++) {
    smooth += spec.tone * (rnd() - smooth);
    delay[i] = smooth;
  }

  const out = new Float32Array(length);
  let peak = 0;
  let idx = 0;
  for (let i = 0; i < length; i++) {
    const next = (idx + 1) % period;
    const value = 0.5 * (delay[idx] + delay[next]) * spec.damping;
    delay[idx] = value;
    out[i] = value;
    peak = Math.max(peak, Math.abs(value));
    idx = next;
  }
  if (peak > 0) for (let i = 0; i < length; i++) out[i] /= peak;
  return out;
}

/** The bank, as the `ChipSample` shape the sample machinery already speaks. */
export const STRING_BANK: readonly PluckedString[] = STRING_SPECS.map((spec) => ({
  id: spec.id,
  label: spec.label,
  blurb: spec.blurb,
  rootHz: ROOT_HZ,
  render: (sampleRate) => karplusStrong(sampleRate, ROOT_HZ, spec),
}));

/** Which string a `duty` picks: the bank spread evenly across 0..100. */
export function stringIndexFor(duty: number): number {
  const d = Math.max(0, Math.min(100, duty));
  const count = STRING_BANK.length;
  return Math.min(count - 1, Math.floor((d / 100) * count));
}

/** The string a `duty` picks, for a menu that wants to name it. */
export function stringFor(duty: number): PluckedString {
  return STRING_BANK[stringIndexFor(duty)];
}

/** One rendered string per bank slot per context. */
const STRING_BUFFERS = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

export function makeStringBuffer(ctx: BaseAudioContext, duty: number): AudioBuffer {
  const index = stringIndexFor(duty);
  let buffers = STRING_BUFFERS.get(ctx);
  if (!buffers) {
    buffers = new Map();
    STRING_BUFFERS.set(ctx, buffers);
  }
  const cached = buffers.get(index);
  if (cached) return cached;
  const data = STRING_BANK[index].render(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  buffers.set(index, buffer);
  return buffer;
}

// --- struck bodies: inharmonic partials ------------------------------------

/**
 * The struck family, from first principles: a hit body whose overtones do not
 * agree with each other.
 *
 * Everything above this line is a HARMONIC sound — its overtones are whole
 * multiples of the note, which is exactly what a `PeriodicWave` can wear. A
 * struck body is not. Hit a metal bar or a rosewood key and the overtones land at
 * roughly 1 : 2.76 : 5.4 : 8.9, the sound of a glockenspiel rather than of a
 * flute; hit a drum SKIN and the overtones are the Bessel ratios of a circular
 * membrane — 1 : 1.59 : 2.14 : 2.30 : 2.65 … — dense, close together and just as
 * non-integer. That is why this family is a rendered BUFFER rather than a
 * spectrum: a `PeriodicWave` cannot say a ratio that is not an integer, and the
 * ratios that are not are the whole point.
 *
 * So a voicing here is its partials — each a RATIO of the note, a loudness and a
 * decay — plus the click of the strike that set them ringing and, for a membrane,
 * a BEND: the pitch of a struck skin droops as the skin relaxes, which is what
 * makes a tom sound like a tom rather than a bell. A struck body is a ONE-SHOT
 * like `string` and `sample`: it sounds once when the note lands and rings down at
 * its own rates, and `hold` cannot stretch it.
 *
 * The strike is a few milliseconds of seeded noise, so a render is the same file
 * it was the last time — the same determinism every other bank promises. Two banks
 * share this machinery: `MALLET_BANK` for the bars and `MEMBRANE_BANK` for the
 * skins, because a bar and a skin differ in the numbers (and that one bend) rather
 * than in the model.
 */
export interface StruckBody {
  id: string;
  /** The name shown on screen and in the docs. */
  label: string;
  /** One line, in the same voice a voice's blurb uses. */
  blurb: string;
  /** The pitch the body is written at; a note plays it at note/root. */
  rootHz: number;
  /** The overtones it is built from — the reason it is not a `PeriodicWave`. */
  partials: readonly BarPartial[];
  /** Render the strike. Deterministic, so a render is the file you heard. */
  render(sampleRate: number): Float32Array;
}

/** One overtone of a struck body: where it sits against the note, how loud and how long. */
export interface BarPartial {
  /** Frequency as a multiple of the note — NOT an integer, for a struck body. */
  ratio: number;
  gain: number;
  /** The time constant of its ring-down, in seconds. */
  decay: number;
}

interface StruckBodySpec {
  id: string;
  label: string;
  blurb: string;
  seconds: number;
  /** How loud the strike's own click is against the body. */
  strike: number;
  /**
   * How far the body's pitch starts ABOVE its note and falls to it, as a fraction.
   *
   * A drum skin is under tension when it is hit and relaxes as it rings, so its
   * pitch droops; a wooden or metal bar does not move and leaves this at 0.
   */
  bend?: number;
  seed: number;
  partials: readonly BarPartial[];
}

/**
 * How long the strike's own click lasts, in seconds.
 *
 * A few milliseconds, because that is what a hit is: the noise is the mallet or
 * the hand touching the body, and everything after it is the body ringing.
 */
export const STRIKE_SECONDS = 0.004;

/**
 * How long a membrane's pitch droop takes to settle, in seconds.
 *
 * Short — a few tens of milliseconds — because the droop is the skin relaxing,
 * and it is over almost as soon as the hit is.
 */
export const STRUCK_BEND_SECONDS = 0.03;

/**
 * Six struck bars, from a soft rosewood key to a music box, because `duty` rises
 * through the bank in this order.
 *
 * The RATIOS are the family's whole point, and they differ per instrument: a
 * marimba's bar is cut so its first overtone is a fourth above (4), a xylophone's
 * so it is a twelfth (3), and an untuned metal bar keeps its natural 2.76. The
 * `decay` of each partial is what makes a vibraphone ring for seconds and a
 * xylophone knock and stop, and the split between a bar's partials decaying at
 * DIFFERENT rates is what an ear hears as metal versus wood.
 */
const MALLET_SPECS: readonly StruckBodySpec[] = [
  {
    id: 'marimba', label: 'MARIMBA', blurb: 'a soft rosewood key: warm, woody, with the first overtone a fourth above',
    seconds: 1.4, strike: 0.5, seed: 0x31a7,
    partials: [{ ratio: 1, gain: 1, decay: 0.7 }, { ratio: 4, gain: 0.4, decay: 0.35 }, { ratio: 10, gain: 0.15, decay: 0.2 }],
  },
  {
    id: 'xylophone', label: 'XYLOPHONE', blurb: 'a hard wooden key: bright and short, the first overtone a twelfth up',
    seconds: 0.8, strike: 0.7, seed: 0x4b2c,
    partials: [{ ratio: 1, gain: 1, decay: 0.35 }, { ratio: 3, gain: 0.5, decay: 0.18 }, { ratio: 6, gain: 0.2, decay: 0.1 }],
  },
  {
    id: 'vibraphone', label: 'VIBRAPHONE', blurb: 'a metal bar that rings: long, soft partials that fade one by one',
    seconds: 3, strike: 0.35, seed: 0x5c8d,
    partials: [{ ratio: 1, gain: 1, decay: 1.8 }, { ratio: 4, gain: 0.35, decay: 1 }, { ratio: 10, gain: 0.12, decay: 0.5 }],
  },
  {
    id: 'glockenspiel', label: 'GLOCKENSPIEL', blurb: 'a bright, high metal bar: its natural inharmonic 2.76 partial shining',
    seconds: 1.8, strike: 0.6, seed: 0x6e1f,
    partials: [{ ratio: 1, gain: 1, decay: 0.9 }, { ratio: 2.76, gain: 0.5, decay: 0.6 }, { ratio: 5.4, gain: 0.25, decay: 0.35 }],
  },
  {
    id: 'musicbox', label: 'MUSIC BOX', blurb: 'a small plucked comb: a high, glassy shimmer with several inharmonic partials',
    seconds: 1.1, strike: 0.55, seed: 0x7a3b,
    partials: [{ ratio: 1, gain: 1, decay: 0.5 }, { ratio: 2.76, gain: 0.6, decay: 0.3 }, { ratio: 5.4, gain: 0.3, decay: 0.2 }, { ratio: 8.93, gain: 0.15, decay: 0.12 }],
  },
  {
    id: 'kalimba', label: 'KALIMBA', blurb: 'a thumb piano: a small, soft metal tine with a hollow, quick ring',
    seconds: 1, strike: 0.45, seed: 0x8d4e,
    partials: [{ ratio: 1, gain: 1, decay: 0.55 }, { ratio: 3.5, gain: 0.35, decay: 0.25 }, { ratio: 6.5, gain: 0.2, decay: 0.15 }],
  },
];

/**
 * One struck body, rendered offline.
 *
 * The sum of its partials, each an inharmonic sine ringing down at its own rate,
 * with the strike's click laid over the first few milliseconds. A membrane's PITCH
 * droop is folded into the phase rather than applied per partial: a frequency that
 * starts `bend` above the note and relaxes to it is a phase that advances faster
 * at first, which is the integral of that. At `bend` 0 the phase is exactly
 * `2π·f·t`, which is every bar. Normalised to a peak of one at the end, so `gain`
 * and `level` mean the same thing on every wave.
 */
function struckBody(sampleRate: number, frequency: number, spec: StruckBodySpec): Float32Array {
  const length = Math.max(1, Math.floor(sampleRate * spec.seconds));
  const out = new Float32Array(length);
  const rnd = seededNoise(spec.seed);
  const bend = spec.bend ?? 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * frequency * (t + bend * STRUCK_BEND_SECONDS * (1 - Math.exp(-t / STRUCK_BEND_SECONDS)));
    let value = 0;
    for (const partial of spec.partials) {
      value += partial.gain * Math.exp(-t / partial.decay) * Math.sin(phase * partial.ratio);
    }
    if (t < STRIKE_SECONDS) value += spec.strike * (1 - t / STRIKE_SECONDS) * rnd();
    out[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  if (peak > 0) for (let i = 0; i < length; i++) out[i] /= peak;
  return out;
}

/** One rendered body per bank slot per context — the shared caching both banks use. */
function struckBodyBuffer(
  ctx: BaseAudioContext,
  cache: WeakMap<BaseAudioContext, Map<number, AudioBuffer>>,
  bank: readonly StruckBody[],
  index: number,
): AudioBuffer {
  let buffers = cache.get(ctx);
  if (!buffers) {
    buffers = new Map();
    cache.set(ctx, buffers);
  }
  const cached = buffers.get(index);
  if (cached) return cached;
  const data = bank[index].render(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  buffers.set(index, buffer);
  return buffer;
}

/** The mallet bank, as the one-shot shape the sample machinery already speaks. */
export const MALLET_BANK: readonly StruckBody[] = MALLET_SPECS.map((spec) => ({
  id: spec.id,
  label: spec.label,
  blurb: spec.blurb,
  rootHz: ROOT_HZ,
  partials: spec.partials,
  render: (sampleRate) => struckBody(sampleRate, ROOT_HZ, spec),
}));

/** Which bar a `duty` picks: the bank spread evenly across 0..100. */
export function malletIndexFor(duty: number): number {
  return bankIndexFor(duty, MALLET_BANK.length);
}

/** The bar a `duty` picks, for a menu that wants to name it. */
export function malletFor(duty: number): StruckBody {
  return MALLET_BANK[malletIndexFor(duty)];
}

/** One rendered bar per bank slot per context. */
const MALLET_BUFFERS = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

/** A struck bar as a buffer the note triggers once. */
export function makeMalletBuffer(ctx: BaseAudioContext, duty: number): AudioBuffer {
  return struckBodyBuffer(ctx, MALLET_BUFFERS, MALLET_BANK, malletIndexFor(duty));
}

/**
 * Six drum skins, from a deep tom to a tight frame drum, because `duty` rises
 * through the bank in this order.
 *
 * A skin is the same struck body as a bar with two differences the numbers carry.
 * Its partials are the DENSE Bessel ratios of a circle — 1, 1.59, 2.14, 2.30,
 * 2.65 … — packed close enough that an ear hears a thud with a pitch rather than a
 * chord, and its pitch DROOPS as the skin relaxes, which is the `bend`. The
 * `strike` is heavier than any bar's because a drum hit is mostly the beater
 * touching the skin, and it falls off the deepest (`timpani`) to the tightest
 * (`djembe`) so a line of them works as a kit.
 */
const MEMBRANE_SPECS: readonly StruckBodySpec[] = [
  {
    id: 'tom', label: 'TOM', blurb: 'a mid tom: a round thud with a short, singing pitch',
    seconds: 0.9, strike: 1.2, bend: 0.12, seed: 0x1d2f,
    partials: [{ ratio: 1, gain: 1, decay: 0.5 }, { ratio: 1.59, gain: 0.6, decay: 0.3 }, { ratio: 2.14, gain: 0.35, decay: 0.22 }, { ratio: 2.3, gain: 0.25, decay: 0.18 }, { ratio: 2.65, gain: 0.15, decay: 0.14 }],
  },
  {
    id: 'timpani', label: 'TIMPANI', blurb: 'a kettledrum: deep, long, with the pitch rolling down as it rings',
    seconds: 2.5, strike: 0.8, bend: 0.06, seed: 0x2e4a,
    partials: [{ ratio: 1, gain: 1, decay: 1.5 }, { ratio: 1.5, gain: 0.55, decay: 0.8 }, { ratio: 2, gain: 0.4, decay: 0.6 }, { ratio: 2.44, gain: 0.3, decay: 0.4 }, { ratio: 2.9, gain: 0.2, decay: 0.3 }],
  },
  {
    id: 'conga', label: 'CONGA', blurb: 'a hand drum: a hard slap over a bright, open tone',
    seconds: 0.7, strike: 1.4, bend: 0.18, seed: 0x3f5b,
    partials: [{ ratio: 1, gain: 1, decay: 0.4 }, { ratio: 1.6, gain: 0.5, decay: 0.25 }, { ratio: 2.2, gain: 0.3, decay: 0.18 }, { ratio: 2.6, gain: 0.2, decay: 0.12 }],
  },
  {
    id: 'tabla', label: 'TABLA', blurb: 'a tuned hand drum: a tight, pitched ring with a ringing overtone',
    seconds: 1.2, strike: 1, bend: 0.1, seed: 0x4a6c,
    partials: [{ ratio: 1, gain: 1, decay: 0.6 }, { ratio: 1.55, gain: 0.5, decay: 0.35 }, { ratio: 2.1, gain: 0.35, decay: 0.25 }, { ratio: 2.35, gain: 0.25, decay: 0.2 }, { ratio: 2.8, gain: 0.15, decay: 0.15 }],
  },
  {
    id: 'djembe', label: 'DJEMBE', blurb: 'a goblet drum: a sharp, dry crack with a quick low thump',
    seconds: 0.6, strike: 1.6, bend: 0.2, seed: 0x5b7d,
    partials: [{ ratio: 1, gain: 1, decay: 0.35 }, { ratio: 1.65, gain: 0.5, decay: 0.22 }, { ratio: 2.2, gain: 0.3, decay: 0.15 }, { ratio: 2.7, gain: 0.2, decay: 0.1 }],
  },
  {
    id: 'frame', label: 'FRAME', blurb: 'a frame drum: a broad, breathy skin with a soft, rolling tone',
    seconds: 1.2, strike: 1.3, bend: 0.15, seed: 0x6c8e,
    partials: [{ ratio: 1, gain: 1, decay: 0.8 }, { ratio: 1.5, gain: 0.55, decay: 0.5 }, { ratio: 2, gain: 0.35, decay: 0.35 }, { ratio: 2.4, gain: 0.25, decay: 0.25 }, { ratio: 2.8, gain: 0.18, decay: 0.2 }, { ratio: 3.2, gain: 0.12, decay: 0.15 }],
  },
];

/** The membrane bank, at the same one-shot shape as the mallet bank. */
export const MEMBRANE_BANK: readonly StruckBody[] = MEMBRANE_SPECS.map((spec) => ({
  id: spec.id,
  label: spec.label,
  blurb: spec.blurb,
  rootHz: ROOT_HZ,
  partials: spec.partials,
  render: (sampleRate) => struckBody(sampleRate, ROOT_HZ, spec),
}));

/** Which skin a `duty` picks: the bank spread evenly across 0..100. */
export function membraneIndexFor(duty: number): number {
  return bankIndexFor(duty, MEMBRANE_BANK.length);
}

/** The skin a `duty` picks, for a menu that wants to name it. */
export function membraneFor(duty: number): StruckBody {
  return MEMBRANE_BANK[membraneIndexFor(duty)];
}

/** One rendered skin per bank slot per context. */
const MEMBRANE_BUFFERS = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

/** A struck skin as a buffer the note triggers once. */
export function makeMembraneBuffer(ctx: BaseAudioContext, duty: number): AudioBuffer {
  return struckBodyBuffer(ctx, MEMBRANE_BUFFERS, MEMBRANE_BANK, membraneIndexFor(duty));
}

/**
 * Six metal plates, from a tower bell to a cymbal, because `duty` rises through
 * the bank in this order.
 *
 * A plate is the struck body at its SPARSEST and its longest: a bell's overtones
 * are a handful of non-integer ratios spread far apart — a hum an octave below the
 * strike tone, a tierce a minor third above it, a nominal an octave up — and they
 * ring for seconds, far longer than any bar or skin. That spread and that length
 * are what an ear hears as metal rather than wood. The `strike` is a light tap,
 * because a bell or a gong is set ringing by a small mallet, and the length rises
 * to the biggest gong (`tamtam`) and falls to the hardest and shortest hit
 * (`anvil`) so a line of them works as a bell tower or a kit.
 */
const PLATE_SPECS: readonly StruckBodySpec[] = [
  {
    id: 'bell', label: 'BELL', blurb: 'a tower bell: a deep hum under a bright strike tone that rings for seconds',
    seconds: 4, strike: 0.5, seed: 0x9f10,
    partials: [{ ratio: 0.5, gain: 0.8, decay: 4 }, { ratio: 1, gain: 1, decay: 3.5 }, { ratio: 1.2, gain: 0.5, decay: 2 }, { ratio: 2, gain: 0.7, decay: 2.5 }, { ratio: 3, gain: 0.35, decay: 1.4 }],
  },
  {
    id: 'chime', label: 'CHIME', blurb: 'a long tubular chime: pure, sparse partials that hang in the air',
    seconds: 3.2, strike: 0.4, seed: 0xa021,
    partials: [{ ratio: 1, gain: 1, decay: 3 }, { ratio: 2.4, gain: 0.4, decay: 1.8 }, { ratio: 4.5, gain: 0.18, decay: 1 }, { ratio: 7, gain: 0.08, decay: 0.6 }],
  },
  {
    id: 'gong', label: 'GONG', blurb: 'a bronze gong: a struck wash whose low partials swell and hang',
    seconds: 4.5, strike: 0.6, seed: 0xb032,
    partials: [{ ratio: 1, gain: 1, decay: 3.6 }, { ratio: 1.5, gain: 0.55, decay: 2.6 }, { ratio: 2.7, gain: 0.35, decay: 1.8 }, { ratio: 4.2, gain: 0.2, decay: 1.1 }, { ratio: 5.4, gain: 0.1, decay: 0.7 }],
  },
  {
    id: 'tamtam', label: 'TAM-TAM', blurb: 'a huge flat gong: the lowest and longest ring of all, a slow roar',
    seconds: 5.5, strike: 0.7, seed: 0xc043,
    partials: [{ ratio: 1, gain: 1, decay: 4.5 }, { ratio: 1.45, gain: 0.5, decay: 3.4 }, { ratio: 2.4, gain: 0.3, decay: 2.4 }, { ratio: 3.9, gain: 0.18, decay: 1.6 }, { ratio: 6.1, gain: 0.1, decay: 1 }],
  },
  {
    id: 'anvil', label: 'ANVIL', blurb: 'a struck metal block: a hard, high clang that stops almost at once',
    seconds: 1, strike: 0.8, seed: 0xd054,
    partials: [{ ratio: 1, gain: 1, decay: 0.5 }, { ratio: 2.76, gain: 0.6, decay: 0.3 }, { ratio: 5.4, gain: 0.3, decay: 0.16 }, { ratio: 8.9, gain: 0.15, decay: 0.09 }],
  },
  {
    id: 'crash', label: 'CRASH', blurb: 'a cymbal: a bright, spread clang with a long shimmering tail',
    seconds: 2.6, strike: 0.9, seed: 0xe065,
    partials: [{ ratio: 1, gain: 1, decay: 1.8 }, { ratio: 2.4, gain: 0.5, decay: 1.4 }, { ratio: 3.6, gain: 0.35, decay: 1.1 }, { ratio: 5.4, gain: 0.22, decay: 0.8 }, { ratio: 7.8, gain: 0.14, decay: 0.55 }, { ratio: 10.5, gain: 0.08, decay: 0.35 }],
  },
];

/** The plate bank, at the same one-shot shape as the mallet and membrane banks. */
export const PLATE_BANK: readonly StruckBody[] = PLATE_SPECS.map((spec) => ({
  id: spec.id,
  label: spec.label,
  blurb: spec.blurb,
  rootHz: ROOT_HZ,
  partials: spec.partials,
  render: (sampleRate) => struckBody(sampleRate, ROOT_HZ, spec),
}));

/** Which plate a `duty` picks: the bank spread evenly across 0..100. */
export function plateIndexFor(duty: number): number {
  return bankIndexFor(duty, PLATE_BANK.length);
}

/** The plate a `duty` picks, for a menu that wants to name it. */
export function plateFor(duty: number): StruckBody {
  return PLATE_BANK[plateIndexFor(duty)];
}

/** One rendered plate per bank slot per context. */
const PLATE_BUFFERS = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

/** A struck plate as a buffer the note triggers once. */
export function makePlateBuffer(ctx: BaseAudioContext, duty: number): AudioBuffer {
  return struckBodyBuffer(ctx, PLATE_BUFFERS, PLATE_BANK, plateIndexFor(duty));
}

// --- the formant vowel: a glottal tone shaped by resonances ----------------

/**
 * A vowel, from first principles: formant synthesis.
 *
 * A vowel is not a shape — it is a FIXED set of resonant peaks (FORMANTS) that
 * the throat and mouth put on top of the buzz of the vocal folds. Sing any vowel
 * on one pitch and the harmonics never move; what moves is which ones the peaks
 * let through. So a vowel is described here the way a phonetics text describes
 * one: its first three formants, each a centre frequency, a relative loudness and
 * a width. `AH` has its two low formants far apart, `EE` a very low first and a
 * high second, `OO` the two low ones close together — and that pair of movements,
 * not the exact hertz, is the whole difference an ear hears between them.
 *
 * ── Why it is a `PeriodicWave` rather than a rendered one-shot ──────────────
 * A vowel SUSTAINS: hold a note and it should ring for as long as the note lasts,
 * which a one-shot `sample` or `string` cannot do. It is also a purely PERIODIC
 * sound, so it has an exact harmonic spectrum — and Web Audio will wear that
 * spectrum as a `PeriodicWave` on an ordinary oscillator. So the same machinery
 * the wavetable uses is reused: compute the harmonics once, loop them forever,
 * and let the oscillator glide and sustain like any tonal wave.
 *
 * The one honest limitation: a `PeriodicWave`'s harmonics are multiples of the
 * note, so the formants follow the pitch rather than staying put. A real voice
 * keeps its vowels put across the keyboard; this one shifts them, the same way
 * the `table` and `sample` banks do. In exchange it loops perfectly and sustains,
 * which is what makes it a playable vowel rather than a spoken syllable.
 */
export interface FormantVowel {
  id: string;
  /** The two-letter name shown on screen and in the docs. */
  label: string;
  /** One line, in the same voice a voice's blurb uses. */
  blurb: string;
  /** The first three formants, in order. */
  formants: readonly FormantPeak[];
}

/** One resonant peak: where it sits, how loud and how wide. */
export interface FormantPeak {
  /** Centre frequency in Hz. */
  hz: number;
  /** Relative loudness against the other peaks. */
  gain: number;
  /** Width in Hz — a wide peak keeps its neighbours, a narrow one is sharp. */
  width: number;
}

/**
 * The five cardinal vowels, from `AH` to `OO`, because `duty` rises through the
 * bank in that order.
 *
 * The numbers are the classic ones a singer is taught. The first formant falls
 * as the mouth closes toward `OO` while the second climbs and falls, and it is
 * that pair of movements, not the exact hertz, that makes each one a vowel.
 */
export const FORMANT_BANK: readonly FormantVowel[] = [
  {
    id: 'ah', label: 'AH', blurb: 'the open "ah": a low first formant with the second well above it',
    formants: [{ hz: 730, gain: 1, width: 120 }, { hz: 1090, gain: 0.5, width: 140 }, { hz: 2440, gain: 0.25, width: 200 }],
  },
  {
    id: 'eh', label: 'EH', blurb: 'the bright "eh": the second formant lifted toward the middle',
    formants: [{ hz: 530, gain: 1, width: 110 }, { hz: 1840, gain: 0.45, width: 160 }, { hz: 2480, gain: 0.22, width: 200 }],
  },
  {
    id: 'ee', label: 'EE', blurb: 'the narrow "ee": a very low first formant and a high second',
    formants: [{ hz: 270, gain: 1, width: 100 }, { hz: 2290, gain: 0.5, width: 170 }, { hz: 3010, gain: 0.2, width: 220 }],
  },
  {
    id: 'oh', label: 'OH', blurb: 'the rounded "oh": both low formants drawn close together',
    formants: [{ hz: 570, gain: 1, width: 120 }, { hz: 840, gain: 0.55, width: 130 }, { hz: 2410, gain: 0.2, width: 200 }],
  },
  {
    id: 'oo', label: 'OO', blurb: 'the deep "oo": formants low and dark, the opposite of "ee"',
    formants: [{ hz: 300, gain: 1, width: 110 }, { hz: 870, gain: 0.4, width: 120 }, { hz: 2240, gain: 0.15, width: 200 }],
  },
];

/** Which vowel a `duty` picks: the bank spread evenly across 0..100. */
export function formantIndexFor(duty: number): number {
  const d = Math.max(0, Math.min(100, duty));
  const count = FORMANT_BANK.length;
  return Math.min(count - 1, Math.floor((d / 100) * count));
}

/** The vowel a `duty` picks, for a menu that wants to name it. */
export function formantFor(duty: number): FormantVowel {
  return FORMANT_BANK[formantIndexFor(duty)];
}

/**
 * One vowel's harmonics: a glottal source shaped by its formant peaks.
 *
 * The source is a sawtooth's `1/n` roll-off — the buzz of the vocal folds — and
 * each harmonic is scaled by how much the three peaks let it through, a peak's
 * pull falling off with the square of the distance from its centre. The result is
 * a spectrum with humps where the mouth resonates rather than the even ladder of
 * a plain wave, which is what a vowel IS.
 */
function formantHarmonics(vowel: FormantVowel): number[] {
  const out: number[] = new Array(TABLE_HARMONICS + 1).fill(0);
  for (let n = 1; n <= TABLE_HARMONICS; n++) {
    const hz = n * ROOT_HZ;
    let shaped = 0;
    for (const peak of vowel.formants) {
      const x = (hz - peak.hz) / (peak.width / 2);
      shaped += peak.gain / (1 + x * x);
    }
    out[n] = shaped / Math.pow(n, 0.7);
  }
  return out;
}

/** One vowel per context, because a Fourier series is not free and a bank is fixed. */
const FORMANT_WAVES = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

/** A vowel as a `PeriodicWave` the oscillators can wear. */
export function formantPeriodicWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const index = formantIndexFor(duty);
  let waves = FORMANT_WAVES.get(ctx);
  if (!waves) {
    waves = new Map();
    FORMANT_WAVES.set(ctx, waves);
  }
  const cached = waves.get(index);
  if (cached) return cached;
  const harmonics = formantHarmonics(FORMANT_BANK[index]);
  const real = new Float32Array(harmonics.length);
  const imag = new Float32Array(harmonics.length);
  for (let n = 1; n < harmonics.length; n++) imag[n] = harmonics[n];
  const wave = ctx.createPeriodicWave(real, imag);
  waves.set(index, wave);
  return wave;
}

// --- excited tubes: a reed and a brass, from first principles --------------

/**
 * The wind family, from first principles: an exciter driving a resonant tube.
 *
 * A clarinet is not a shape any more than a vowel is, and neither is a trumpet.
 * Both are the same two-part machine, and it is worth saying once for both:
 *
 * - an EXCITER chops a steady airstream into a pulsed, harmonically rich train —
 *   a reed snapping for a clarinet, a player's lips buzzing for a trumpet;
 * - a TUBE, with its own length and shape, decides which of those harmonics
 *   survive. It RESONATES at fixed frequencies (the way a vowel's formants sit
 *   still), putting humps in the spectrum rather than an even ladder.
 *
 * Two things then separate the instruments, and both are numbers here:
 *
 * - WHERE the tube's peaks sit, and how wide — the "formant" of the bore;
 * - whether the EVEN harmonics survive. A stopped cylindrical bore — a clarinet —
 *   kills them outright and sounds hollow and woody; a conical bore — an oboe, and
 *   every brass instrument — keeps both families and sounds bright and full.
 *
 * So a voicing here is the exciter's roll-off, the tube's resonant peaks, and how
 * much of the even harmonics the bore keeps. `duty` PICKS one from a bank, exactly
 * as it picks a vowel, a registration or a kit — "which instrument" is a choice,
 * not a number. Two banks share this machinery: `REED_BANK` for the reeds and
 * `BRASS_BANK` for the lip-driven ones, because a lip and a reed differ in the
 * numbers rather than in the model.
 *
 * ── Why it is a `PeriodicWave`, like the vowel next door ────────────────────
 * A wind instrument SUSTAINS — hold a note and a clarinet holds it — so it cannot
 * be a one-shot; and it is periodic, so it has an exact harmonic spectrum. The
 * same machinery the vowel uses therefore applies: compute the harmonics once,
 * hand them to the oscillator as a `PeriodicWave`, and let it glide and sustain.
 * The limitation is the vowel's too: the peaks are multiples of the note, so they
 * follow the pitch instead of staying put across the keyboard.
 */
export interface ExciterVoicing {
  id: string;
  /** The name shown on screen and in the docs. */
  label: string;
  /** One line, in the same voice a voice's blurb uses. */
  blurb: string;
  /** The tube's resonant peaks, in order. */
  peaks: readonly FormantPeak[];
  /** How much of the even harmonics the bore keeps, 0..1: a clarinet keeps almost none. */
  even: number;
  /** The exciter's roll-off — the exponent on `1/n`. Smaller is buzzier. */
  rolloff: number;
}

/** Which slot a `duty` picks: a bank spread evenly across 0..100, clamped at both ends. */
export function bankIndexFor(duty: number, count: number): number {
  const d = Math.max(0, Math.min(100, duty));
  return Math.min(count - 1, Math.floor((d / 100) * count));
}

/**
 * One voicing's harmonics: an exciter shaped by the tube's peaks.
 *
 * The source is a sawtooth's `1/n` roll-off, bent by the voicing's own exponent —
 * the bite of the exciter — and each harmonic is scaled by how much the tube's
 * peaks let it through, a peak's pull falling off with the square of the distance
 * from its centre. The even family is then scaled down by the bore's `even`, which
 * is the one number that makes a clarinet hollow: at 0.04 the even harmonics are
 * all but gone, and that missing ladder is what an ear hears as "woody".
 */
function exciterHarmonics(voicing: ExciterVoicing): number[] {
  const out: number[] = new Array(TABLE_HARMONICS + 1).fill(0);
  for (let n = 1; n <= TABLE_HARMONICS; n++) {
    const hz = n * ROOT_HZ;
    let shaped = 0;
    for (const peak of voicing.peaks) {
      const x = (hz - peak.hz) / (peak.width / 2);
      shaped += peak.gain / (1 + x * x);
    }
    const even = n % 2 === 0 ? voicing.even : 1;
    out[n] = (shaped * even) / Math.pow(n, voicing.rolloff);
  }
  return out;
}

/**
 * A banked voicing as a `PeriodicWave`, cached per context and per slot.
 *
 * One cache per bank, because a Fourier series is not free and a bank is fixed:
 * two notes on the same reed share one wave, and the same slot on two channels
 * does too.
 */
function voicingPeriodicWave(
  ctx: BaseAudioContext,
  cache: WeakMap<BaseAudioContext, Map<number, PeriodicWave>>,
  bank: readonly ExciterVoicing[],
  index: number,
): PeriodicWave {
  let waves = cache.get(ctx);
  if (!waves) {
    waves = new Map();
    cache.set(ctx, waves);
  }
  const cached = waves.get(index);
  if (cached) return cached;
  const harmonics = exciterHarmonics(bank[index]);
  const real = new Float32Array(harmonics.length);
  const imag = new Float32Array(harmonics.length);
  for (let n = 1; n < harmonics.length; n++) imag[n] = harmonics[n];
  const wave = ctx.createPeriodicWave(real, imag);
  waves.set(index, wave);
  return wave;
}

/**
 * Six reeds, from the hollow clarinet to the drone of a pipe, because `duty`
 * rises through the bank in this order.
 *
 * Each is chosen to be a character a player would name rather than a spectrum: the
 * clarinet's odd-harmonic tube, the oboe's bright conical bore, the bassoon's deep
 * one, the sax's warm breathy one, a harmonica's piercing buzz and a bagpipe's
 * locked drone. The numbers are the shapes a bore is taught to have; the pair of
 * movements that matters — where the first peak sits and whether the even family
 * survives — is what an ear uses to tell them apart.
 */
export const REED_BANK: readonly ExciterVoicing[] = [
  {
    id: 'clarinet', label: 'CLARINET', blurb: 'a hollow wooden tube: odd harmonics only, one clear formant',
    peaks: [{ hz: 1500, gain: 1, width: 600 }, { hz: 3000, gain: 0.35, width: 900 }],
    even: 0.04, rolloff: 1,
  },
  {
    id: 'oboe', label: 'OBOE', blurb: 'a bright, nasal conical bore: both harmonic families, a high formant',
    peaks: [{ hz: 900, gain: 1, width: 400 }, { hz: 2900, gain: 0.6, width: 900 }],
    even: 0.85, rolloff: 0.85,
  },
  {
    id: 'bassoon', label: 'BASSOON', blurb: 'a deep, reedy bore: a low formant under a woody buzz',
    peaks: [{ hz: 440, gain: 1, width: 220 }, { hz: 1180, gain: 0.5, width: 400 }, { hz: 2400, gain: 0.25, width: 700 }],
    even: 0.6, rolloff: 1.1,
  },
  {
    id: 'sax', label: 'SAX', blurb: 'a warm, breathy brass bore: a broad low formant and a soft buzz',
    peaks: [{ hz: 700, gain: 1, width: 350 }, { hz: 1900, gain: 0.45, width: 700 }],
    even: 0.9, rolloff: 0.9,
  },
  {
    id: 'harmonica', label: 'HARMONICA', blurb: 'a small free reed: a piercing, buzzy mid formant',
    peaks: [{ hz: 1100, gain: 1, width: 300 }, { hz: 2600, gain: 0.7, width: 600 }],
    even: 0.75, rolloff: 0.7,
  },
  {
    id: 'bagpipe', label: 'BAGPIPE', blurb: 'a chanter over a drone: a locked, buzzing, sustained tone',
    peaks: [{ hz: 500, gain: 1, width: 250 }, { hz: 1400, gain: 0.7, width: 450 }, { hz: 2800, gain: 0.4, width: 800 }],
    even: 0.35, rolloff: 0.8,
  },
];

/** Which reed a `duty` picks: the bank spread evenly across 0..100. */
export function reedIndexFor(duty: number): number {
  return bankIndexFor(duty, REED_BANK.length);
}

/** The reed a `duty` picks, for a menu that wants to name it. */
export function reedFor(duty: number): ExciterVoicing {
  return REED_BANK[reedIndexFor(duty)];
}

/** One reed per context, because a Fourier series is not free and a bank is fixed. */
const REED_WAVES = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

/** A reed as a `PeriodicWave` the oscillators can wear. */
export function reedPeriodicWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  return voicingPeriodicWave(ctx, REED_WAVES, REED_BANK, reedIndexFor(duty));
}

/**
 * Six brass instruments, from the brilliant trumpet to the harmon-muted one,
 * because `duty` rises through the bank in this order.
 *
 * The lip is the same exciter the reed is, so the model is the reed's and only the
 * numbers change — and the numbers say what brass IS. A conical bore keeps BOTH
 * harmonic families, so `even` is high everywhere here: that fullness is the family
 * sound, and it is why no voicing in this bank is hollow the way a clarinet is. The
 * bell flares, which lifts the upper harmonics, so the roll-offs are small (the
 * spectrum stays bright when the note climbs) and a mouthpiece peak sits around a
 * kilohertz. The muted voicing is the exception that proves the point: a harmon
 * mute puts a narrow high formant in front of the bell and swallows the lows, which
 * is why it sounds thin and nasal while the tube behind it is unchanged.
 */
export const BRASS_BANK: readonly ExciterVoicing[] = [
  {
    id: 'trumpet', label: 'TRUMPET', blurb: 'a brilliant conical bore: a high mouthpiece peak and the whole harmonic ladder',
    peaks: [{ hz: 900, gain: 1, width: 500 }, { hz: 2200, gain: 0.6, width: 1000 }],
    even: 0.95, rolloff: 0.7,
  },
  {
    id: 'trombone', label: 'TROMBONE', blurb: 'a bold, round bore: a lower peak and a wide, full spectrum',
    peaks: [{ hz: 600, gain: 1, width: 400 }, { hz: 1800, gain: 0.55, width: 900 }],
    even: 0.95, rolloff: 0.85,
  },
  {
    id: 'horn', label: 'HORN', blurb: 'a mellow french horn: a low, soft peak and a dark, covered tone',
    peaks: [{ hz: 450, gain: 1, width: 350 }, { hz: 1400, gain: 0.5, width: 800 }],
    even: 0.9, rolloff: 0.95,
  },
  {
    id: 'tuba', label: 'TUBA', blurb: 'a deep, huge bore: the lowest peak and a weighty low end',
    peaks: [{ hz: 300, gain: 1, width: 250 }, { hz: 900, gain: 0.6, width: 600 }],
    even: 0.9, rolloff: 1,
  },
  {
    id: 'flugel', label: 'FLUGEL', blurb: 'a soft, warm flugelhorn: a broad mid peak and a gentle bite',
    peaks: [{ hz: 700, gain: 1, width: 450 }, { hz: 1900, gain: 0.45, width: 900 }],
    even: 0.9, rolloff: 0.9,
  },
  {
    id: 'muted', label: 'MUTED', blurb: 'a harmon-muted trumpet: a narrow high formant and a thin, nasal buzz',
    peaks: [{ hz: 1200, gain: 1, width: 400 }, { hz: 2800, gain: 0.8, width: 800 }],
    even: 0.7, rolloff: 0.6,
  },
];

/** Which brass instrument a `duty` picks: the bank spread evenly across 0..100. */
export function brassIndexFor(duty: number): number {
  return bankIndexFor(duty, BRASS_BANK.length);
}

/** The brass instrument a `duty` picks, for a menu that wants to name it. */
export function brassFor(duty: number): ExciterVoicing {
  return BRASS_BANK[brassIndexFor(duty)];
}

/** One brass voice per context, because a Fourier series is not free and a bank is fixed. */
const BRASS_WAVES = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

/** A brass instrument as a `PeriodicWave` the oscillators can wear. */
export function brassPeriodicWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  return voicingPeriodicWave(ctx, BRASS_WAVES, BRASS_BANK, brassIndexFor(duty));
}

/**
 * Six bowed strings, from a singing violin to a whole section, because `duty`
 * rises through the bank in this order.
 *
 * A bow is the third exciter, and the same two-part machine again: the bow drags
 * and releases the string (stick-slip) into a rich, sawtooth-like train, and the
 * hollow BODY shapes it. A body is not the tube a wind instrument has — it is a
 * box with an air resonance low down and a broad "bridge hill" up top — so the
 * peaks here sit low and wide, and the second of them is a hump rather than a
 * point. The bow keeps BOTH harmonic families, so `even` is near full throughout;
 * what makes a violin a violin is where the box rings, not a missing ladder. The
 * `strings` voicing is the section rather than the soloist: peaks deliberately
 * wide, so no one resonance pokes out — which is what several players sound like.
 */
export const BOW_BANK: readonly ExciterVoicing[] = [
  {
    id: 'violin', label: 'VIOLIN', blurb: 'a bright, singing box: a low air resonance and a bridge hill up high',
    peaks: [{ hz: 300, gain: 1, width: 150 }, { hz: 3000, gain: 0.6, width: 900 }],
    even: 0.95, rolloff: 0.85,
  },
  {
    id: 'viola', label: 'VIOLA', blurb: 'a warm, darker box: the air resonance lifted, the hill brought down',
    peaks: [{ hz: 400, gain: 1, width: 200 }, { hz: 2200, gain: 0.55, width: 900 }],
    even: 0.95, rolloff: 0.95,
  },
  {
    id: 'cello', label: 'CELLO', blurb: 'a rich, woody box: a low body resonance under a full mid',
    peaks: [{ hz: 250, gain: 1, width: 150 }, { hz: 1800, gain: 0.6, width: 800 }],
    even: 0.95, rolloff: 1.05,
  },
  {
    id: 'bass', label: 'BASS', blurb: 'a double bass: a very low resonance and a thick, dark body',
    peaks: [{ hz: 150, gain: 1, width: 120 }, { hz: 900, gain: 0.6, width: 600 }],
    even: 0.95, rolloff: 1.15,
  },
  {
    id: 'erhu', label: 'ERHU', blurb: 'a small two-string fiddle: a nasal mid resonance and a taut, singing bite',
    peaks: [{ hz: 700, gain: 1, width: 300 }, { hz: 2600, gain: 0.8, width: 700 }],
    even: 0.8, rolloff: 0.8,
  },
  {
    id: 'strings', label: 'STRINGS', blurb: 'a whole section: broad, overlapping resonances and no single voice poking out',
    peaks: [{ hz: 350, gain: 1, width: 400 }, { hz: 2500, gain: 0.5, width: 1400 }],
    even: 1, rolloff: 0.95,
  },
];

/** Which bowed string a `duty` picks: the bank spread evenly across 0..100. */
export function bowIndexFor(duty: number): number {
  return bankIndexFor(duty, BOW_BANK.length);
}

/** The bowed string a `duty` picks, for a menu that wants to name it. */
export function bowFor(duty: number): ExciterVoicing {
  return BOW_BANK[bowIndexFor(duty)];
}

/** One bowed string per context, because a Fourier series is not free and a bank is fixed. */
const BOW_WAVES = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

/** A bowed string as a `PeriodicWave` the oscillators can wear. */
export function bowPeriodicWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  return voicingPeriodicWave(ctx, BOW_WAVES, BOW_BANK, bowIndexFor(duty));
}

// --- the drawbar organ: additive tonewheels --------------------------------

/**
 * A drawbar organ, from first principles: additive tonewheels.
 *
 * A tonewheel organ makes its sound the simplest way there is — it ADDS together
 * pure sines. Nine of them, one per DRAWBAR, each at a fixed musical interval
 * above (or below) the note: 16 feet is an octave down, 5⅓ feet a twelfth down,
 * 8 feet the note itself, then 4, 2⅔, 2, 1⅗, 1⅓ and 1 feet climbing above it.
 * Pull a drawbar out and its sine gets louder; push it in and it is silent. A
 * REGISTRATION is which of the nine are out and how far, which is why `duty`
 * PICKS one from a bank instead of dialling a number — the same choice a player
 * makes by sliding nine little bars, and the whole reason an organ can be a
 * whisper or a shout without a single note changing.
 *
 * ── Why it is a looping BUFFER rather than a `PeriodicWave` ─────────────────
 * The 16-foot and 5⅓-foot stops sit BELOW the note, at half and a third of its
 * frequency, and a `PeriodicWave` can only hold whole-number multiples of the
 * note — it has no way to sound a sub-octave. Rendering the tone into a buffer
 * removes that ceiling, and the buffer is an exact whole number of cycles of
 * every stop, so it LOOPS without a click and rings for as long as `hold` says.
 * Playing it back pitched, the way a `sample` is, moves the whole stack with the
 * note. It is written at middle C.
 */
export interface DrawbarOrgan {
  id: string;
  /** The name shown on screen and in the docs. */
  label: string;
  /** One line, in the same voice a voice's blurb uses. */
  blurb: string;
  /** Nine drawbar levels, 0–8, from the 16-foot stop up to the 1-foot one. */
  drawbars: readonly number[];
  /** The pitch the tone is written at; a note plays it at note/root. */
  rootHz: number;
}

/**
 * The nine footages a stack spans, 16 feet up to 1 foot, as multiples of the
 * note. The low two are the reason this is a buffer (see above); the rest are
 * plain harmonics an ear reads as octaves and fifths.
 */
export const DRAWBAR_FOOTAGES: readonly number[] = [0.5, 1 / 3, 1, 2, 3, 4, 5, 6, 8];
/** How many cycles of the note a rendered tone spans: enough for the ½ and ⅓ stops. */
const ORGAN_LOOP_PERIODS = 6;

/**
 * The registrations, plain to loud, because `duty` rises through them that way.
 *
 * Each is the nine drawbar positions of a well-known organ sound, from a single
 * 8-foot stop up to every stop pulled out — a flute, a soft duo, the classic
 * jazz setting, a broad church sound and the full organ.
 */
export const ORGAN_BANK: readonly DrawbarOrgan[] = [
  { id: 'flute', label: 'FLUTE', blurb: 'one 8-foot stop alone: plain, hollow and quiet', drawbars: [0, 0, 8, 0, 0, 0, 0, 0, 0], rootHz: ROOT_HZ },
  { id: 'mellow', label: 'MELLOW', blurb: 'the 8-foot stop with its 4-foot octave: soft and rounded', drawbars: [0, 0, 8, 4, 0, 0, 0, 0, 0], rootHz: ROOT_HZ },
  { id: 'jazz', label: 'JAZZ', blurb: 'the classic jazz setting — 16, 5⅓ and 8 feet: warm and full', drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0], rootHz: ROOT_HZ },
  { id: 'church', label: 'CHURCH', blurb: 'the low stops with the 4-foot octave: broad and hymn-like', drawbars: [8, 8, 8, 8, 0, 0, 0, 0, 0], rootHz: ROOT_HZ },
  { id: 'full', label: 'FULL', blurb: 'every stop pulled out: the biggest, brightest sound the organ has', drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8], rootHz: ROOT_HZ },
];

/** Which registration a `duty` picks: the bank spread evenly across 0..100. */
export function organIndexFor(duty: number): number {
  const d = Math.max(0, Math.min(100, duty));
  const count = ORGAN_BANK.length;
  return Math.min(count - 1, Math.floor((d / 100) * count));
}

/** The registration a `duty` picks, for a menu that wants to name it. */
export function organFor(duty: number): DrawbarOrgan {
  return ORGAN_BANK[organIndexFor(duty)];
}

/**
 * One tone: every pulled drawbar as a sine, summed and normalised.
 *
 * The buffer is `ORGAN_LOOP_PERIODS` cycles of the note long, so every footage —
 * the ½ and ⅓ ones included — lands on a whole number of cycles and the loop
 * joins without a click. Deterministic: sines and arithmetic, no noise.
 */
function renderDrawbars(sampleRate: number, organ: DrawbarOrgan): Float32Array {
  const length = Math.max(1, Math.round((sampleRate / ROOT_HZ) * ORGAN_LOOP_PERIODS));
  const out = new Float32Array(length);
  let peak = 0;
  for (let n = 0; n < length; n++) {
    const phase = (n / length) * ORGAN_LOOP_PERIODS;
    let sum = 0;
    for (let i = 0; i < DRAWBAR_FOOTAGES.length; i++) {
      const level = organ.drawbars[i] ?? 0;
      if (level > 0) sum += (level / 8) * Math.sin(2 * Math.PI * DRAWBAR_FOOTAGES[i] * phase);
    }
    out[n] = sum;
    peak = Math.max(peak, Math.abs(sum));
  }
  if (peak > 0) for (let n = 0; n < length; n++) out[n] /= peak;
  return out;
}

/** One rendered tone per bank slot per context. */
const ORGAN_BUFFERS = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

export function makeOrganBuffer(ctx: BaseAudioContext, duty: number): AudioBuffer {
  const index = organIndexFor(duty);
  let buffers = ORGAN_BUFFERS.get(ctx);
  if (!buffers) {
    buffers = new Map();
    ORGAN_BUFFERS.set(ctx, buffers);
  }
  const cached = buffers.get(index);
  if (cached) return cached;
  const data = renderDrawbars(ctx.sampleRate, ORGAN_BANK[index]);
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  buffers.set(index, buffer);
  return buffer;
}

// --- the grain cloud: granular synthesis -----------------------------------

/**
 * A grain cloud, from first principles: granular synthesis.
 *
 * Granular synthesis starts from one idea — a sound is not a wave but a CLOUD of
 * tiny grains, each a few milliseconds long, sprayed out in time and allowed to
 * overlap. Change how long a grain is and how often one fires and the same note
 * becomes a crackle, a rough buzz or a smooth breathing pad, which is why it is a
 * whole way of making sound rather than a setting on one. Each grain here is a
 * windowed burst of a sine at (or near) the note's pitch, so the pitch still
 * follows the keyboard while the TEXTURE is what the knobs move.
 *
 * ── Why it is a looping BUFFER, like the organ ──────────────────────────────
 * A grain cloud sustains, so like the organ it is rendered into a buffer and
 * looped rather than triggered once. The buffer is a whole number of cycles of
 * the note, and every grain is written WRAPPING past the end back to the start,
 * so the cloud is exactly periodic and the loop joins without a click. Playing it
 * back pitched moves the whole cloud — and its grain rate — with the note, the
 * way a sampler shifts a texture.
 *
 * `duty` picks the character from the bank, the same way it picks a wavetable, a
 * vowel, a sample or a registration: one knob, and the wave says what it means.
 */
export interface GrainCloud {
  id: string;
  /** The name shown on screen and in the docs. */
  label: string;
  /** One line, in the same voice a voice's blurb uses. */
  blurb: string;
  /** How long each grain lasts, in seconds. */
  grainSeconds: number;
  /** How many grains fire per second. */
  grainsPerSecond: number;
  /** How far each grain's pitch scatters from the note, in cents. */
  scatter: number;
  /** The pitch the cloud is written at; a note plays it at note/root. */
  rootHz: number;
  /** Kept so a render is the same bytes in the app, an export and a test. */
  seed: number;
}

/**
 * How many cycles of the note a rendered cloud spans, long enough to hold the
 * longest grain and to give the spray room to breathe before it repeats.
 */
const GRAIN_LOOP_PERIODS = 32;

/**
 * The characters, crackly to smooth, because `duty` rises through them that way.
 *
 * Each is the same idea at a different scale: a grain a few milliseconds long and
 * sparse is a crackle, the same grains crowded together are a buzz, and grains
 * long enough to bury each other merge into a shimmer. `scatter` is how far each
 * grain's pitch wanders from the note — wide for percussion, near zero for a
 * pitched shimmer.
 */
export const GRANULAR_BANK: readonly GrainCloud[] = [
  { id: 'crackle', label: 'CRACKLE', blurb: 'tiny sparse grains: a dry crackle, almost a drum', grainSeconds: 0.004, grainsPerSecond: 160, scatter: 900, rootHz: ROOT_HZ, seed: 0x1a7f },
  { id: 'rain', label: 'RAIN', blurb: 'short grains at a patter: an unstable, rainy texture', grainSeconds: 0.010, grainsPerSecond: 120, scatter: 600, rootHz: ROOT_HZ, seed: 0x2b3d },
  { id: 'buzz', label: 'BUZZ', blurb: 'short grains crowded together: a rough, buzzy tone', grainSeconds: 0.018, grainsPerSecond: 150, scatter: 150, rootHz: ROOT_HZ, seed: 0x3c5b },
  { id: 'cloud', label: 'CLOUD', blurb: 'long overlapping grains: a soft, breathing cloud', grainSeconds: 0.060, grainsPerSecond: 50, scatter: 80, rootHz: ROOT_HZ, seed: 0x4d79 },
  { id: 'smear', label: 'SMEAR', blurb: 'grains so long they merge: a near-continuous shimmer', grainSeconds: 0.100, grainsPerSecond: 34, scatter: 40, rootHz: ROOT_HZ, seed: 0x5e91 },
];

/** Which character a `duty` picks: the bank spread evenly across 0..100. */
export function granularIndexFor(duty: number): number {
  const d = Math.max(0, Math.min(100, duty));
  const count = GRANULAR_BANK.length;
  return Math.min(count - 1, Math.floor((d / 100) * count));
}

/** The character a `duty` picks, for a menu that wants to name it. */
export function granularFor(duty: number): GrainCloud {
  return GRANULAR_BANK[granularIndexFor(duty)];
}

/**
 * One cloud: grains sprayed across a buffer that is a whole number of note cycles.
 *
 * Every grain is a sine under a raised half-sine window, so it starts and ends at
 * zero and cannot click. Grain positions and pitch offsets come from a seeded
 * noise source, so the spray is fixed: the same cloud in the app, in an export
 * and in a test. Grains longer than the buffer are clamped, and each is written
 * WRAPPING so the cloud is exactly periodic — the window ends at zero, so the
 * join is smooth.
 */
function renderGrains(sampleRate: number, cloud: GrainCloud): Float32Array {
  const length = Math.max(1, Math.round((sampleRate / ROOT_HZ) * GRAIN_LOOP_PERIODS));
  const out = new Float32Array(length);
  const grainLen = Math.min(length, Math.max(2, Math.round(cloud.grainSeconds * sampleRate)));
  const count = Math.max(1, Math.round(cloud.grainsPerSecond * (length / sampleRate)));
  const rnd = seededNoise(cloud.seed);
  const unit = () => (rnd() + 1) / 2;
  for (let g = 0; g < count; g++) {
    const start = Math.floor(unit() * length) % length;
    const hz = ROOT_HZ * Math.pow(2, (cloud.scatter * rnd()) / 1200);
    for (let i = 0; i < grainLen; i++) {
      const window = Math.sin(Math.PI * (i / grainLen));
      out[(start + i) % length] += window * Math.sin((2 * Math.PI * hz * i) / sampleRate);
    }
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < length; i++) out[i] /= peak;
  return out;
}

/** One rendered cloud per bank slot per context. */
const GRANULAR_BUFFERS = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

export function makeGranularBuffer(ctx: BaseAudioContext, duty: number): AudioBuffer {
  const index = granularIndexFor(duty);
  let buffers = GRANULAR_BUFFERS.get(ctx);
  if (!buffers) {
    buffers = new Map();
    GRANULAR_BUFFERS.set(ctx, buffers);
  }
  const cached = buffers.get(index);
  if (cached) return cached;
  const data = renderGrains(ctx.sampleRate, GRANULAR_BANK[index]);
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  buffers.set(index, buffer);
  return buffer;
}

// --- the soundfont: somebody else's recordings -----------------------------

/**
 * A soundfont: play back a recorded instrument instead of synthesizing one.
 *
 * The one source on the shelf whose samples were not made by this app. A font is
 * read by `model/soundfont.ts` into presets of ZONES — a key range, the recording
 * it plays, and how that recording is pitched — and this section turns one of
 * those zones into an `AudioBuffer` of actual recorded sound.
 *
 * ── Why it is not just another bank ──────────────────────────────────────────
 * `sample`, `string`, `organ` and `granular` are all ONE sound per `duty` slot,
 * pitched by playback rate. A font is many recordings: a piano is not one sample
 * stretched across eighty-eight keys, it is a handful of samples each covering a
 * run of keys, swapped as you cross a range boundary. So the zone the note lands
 * in is chosen PER NOTE from the font's key map, which is the difference between
 * pretending to be a sampler and being one.
 *
 * The samples are the font's own 16-bit PCM, so nothing is stretched to fit a
 * fixed length and nothing is normalized: a font sounds like itself, which is the
 * whole reason to reach for one.
 */

/** One playable zone, with its recording ready to hand to a buffer source. */
export interface FontZoneSound extends FontZone {
  /** The rendered recording, cached per context. */
  buffer(ctx: BaseAudioContext): AudioBuffer;
  /**
   * Where the recording's sustain loop starts, in seconds INTO THIS RECORDING.
   *
   * A font's `smpl` chunk is one flat run of frames and its loop points are
   * indexes into ALL of it, while the buffer holds only the frames this sample
   * owns (`sample.start`..`sample.end`) — so the loop is measured from
   * `sample.start`, not from the top of the file. Getting that wrong is silent
   * rather than wrong-sounding: Web Audio clamps a loop that lies past the end of
   * its buffer to nothing, so the note plays no sound at all.
   */
  loopStartSeconds: number;
  /** Where the recording's sustain loop ends, in seconds into this recording. */
  loopEndSeconds: number;
}

/** A preset's zones, prepared: one font slot's worth of playable sound. */
export interface FontVoice {
  /** The preset, with its zones replaced by the prepared ones. */
  preset: FontPreset;
  zones: readonly FontZoneSound[];
}

/**
 * How much of the output's top a font recording may keep when it is played
 * FASTER than it was recorded.
 *
 * A font is a handful of recordings and a key map, so most of what it plays is
 * one recording transposed: the same piano note stretched across forty keys. Up
 * is where that stops being free. Playing a recording at twice its rate asks for
 * content twice as high, and whatever passes the output's own Nyquist does not
 * disappear — it FOLDS, coming back down as tones at no harmonic of the note,
 * which is the gritty, broken edge a heavily stretched soundfont note has. A
 * player that resamples by its playback rate alone cannot prevent that; a player
 * that filters first can, and the filter is what this share sizes: the highest
 * the recording may reach once the rate is taken into account. Half of the
 * output's Nyquist is exactly the frequency that would fold at each rate.
 *
 * Only a rate ABOVE 1 needs it. A recording played slower is interpolated rather
 * than decimated, and has nothing to fold — so a piano note near its own root
 * key is the same recording it has always been, sample for sample.
 */
export const FONT_GUARD_SHARE = 0.5;
/**
 * The guard's stages, 12 dB/octave each. Two is the same "one pole too few"
 * compromise every sampler of this size makes: a fold at the top of the band is
 * attenuated by 24 dB rather than removed, which is the difference between a
 * transposed recording that sounds duller and one that sounds broken.
 */
export const FONT_GUARD_STAGES = 2;
/** Butterworth, so the stages multiply into a flat passband rather than a bump. */
export const FONT_GUARD_Q = 0.7071;

/**
 * The frequency a recording played at this rate may reach, in Hz.
 *
 * `Infinity` when the rate is 1 or below, which is the answer that makes the
 * caller build no filter at all: nothing is decimated, so nothing can fold.
 */
export function fontGuardCutoff(rate: number, sampleRate: number): number {
  if (!(rate > 1)) return Infinity;
  return (FONT_GUARD_SHARE * sampleRate) / rate;
}

/**
 * Prepare the preset a `duty` picks out of a font, or null when it has none.
 *
 * Cheap: it maps the font's zone table and captures a buffer accessor per zone.
 * The recordings themselves are rendered lazily by `fontSampleBuffer`, so
 * choosing a preset costs nothing until a note actually plays — which matters
 * because the knob can be auditioned and a font's samples can be tens of
 * megabytes of PCM.
 */
export function prepareFontVoice(font: SoundFont, duty: number, drum: DrumId | null = null): FontVoice | null {
  // A DRUM HIT plays the font's own kit, which no `duty` can name: the kit lives
  // on the percussion bank, past the slot window on a long font like Arachno.
  // A font with no kit falls through to the `duty` preset, so a drum channel on a
  // melodic-only font still sounds rather than going silent.
  const preset = drum === null ? presetFor(font, duty) : kitFor(font) ?? presetFor(font, duty);
  if (!preset || preset.zones.length === 0) return null;
  const zones: FontZoneSound[] = preset.zones.map((zone) => {
    const sample = font.samples[zone.sample];
    const rate = sample && sample.sampleRate > 0 ? sample.sampleRate : 44100;
    return {
      ...zone,
      buffer: (ctx: BaseAudioContext) => fontSampleBuffer(ctx, font, zone.sample),
      loopStartSeconds: sample ? Math.max(0, sample.loopStart - sample.start) / rate : 0,
      loopEndSeconds: sample ? Math.max(0, sample.loopEnd - sample.start) / rate : 0,
    };
  });
  return { preset: { ...preset, zones }, zones };
}

/** One rendered recording per sample index, per font, per context. */
const FONT_BUFFERS = new WeakMap<BaseAudioContext, Map<SoundFont, Map<number, AudioBuffer>>>();

/**
 * The recording at one sample index, as an `AudioBuffer`, rendered once and kept.
 *
 * The font's PCM is at ITS sample rate and the context may be at another, so the
 * frames are resampled — linearly, which is the same cheap interpolation every
 * sampler of this size uses. A font saved at 44.1 kHz into a 48 kHz context
 * therefore still plays in tune, which is the one arithmetic mistake that would
 * make every sampled instrument sound slightly wrong.
 */
export function fontSampleBuffer(ctx: BaseAudioContext, font: SoundFont, index: number): AudioBuffer {
  let byFont = FONT_BUFFERS.get(ctx);
  if (!byFont) {
    byFont = new Map();
    FONT_BUFFERS.set(ctx, byFont);
  }
  let buffers = byFont.get(font);
  if (!buffers) {
    buffers = new Map();
    byFont.set(font, buffers);
  }
  const cached = buffers.get(index);
  if (cached) return cached;
  const buffer = renderFontSample(ctx, font, index);
  buffers.set(index, buffer);
  return buffer;
}

/**
 * Read one recording out of a font's PCM and resample it for a context.
 *
 * Three things are being reconciled at once, and each one is a mistake waiting
 * to be made by hand:
 *
 *   the font's RATE and the context's — a font recorded at 44.1 kHz played into
 *   a 48 kHz context is resampled linearly, so every imported instrument is in
 *   tune rather than a few cents sharp on one machine and flat on another;
 *   the font's CHANNEL COUNT and the buffer's — a stereo recording (a Noislet
 *   sound, whose pan is part of the sound) keeps its two channels, and a mono one
 *   is a buffer Web Audio upmixes exactly as it always did;
 *   and FRAME indexes versus PCM indexes — `start`, `end` and the loop points
 *   are frame numbers, so a frame in a stereo sample costs TWO values. Reading
 *   it as one value per frame is the arithmetic bug that makes a stereo import
 *   play at half speed through the left channel of a chipmunk, which is why the
 *   indexing lives in one function.
 */
function renderFontSample(ctx: BaseAudioContext, font: SoundFont, index: number): AudioBuffer {
  const sample = font.samples[index];
  // The font's width, not a sample's: it is one flat array, so every sample in it
  // is laid out the same way. A SoundFont is 1; a Noislet import is 2 when any of
  // its sounds is stereo (see `model/instrumentLibrary.ts`).
  const channels = font.channels;
  const frames = Math.max(1, sample ? sample.end - sample.start : 1);
  const from = sample ? sample.sampleRate : ctx.sampleRate;
  const ratio = ctx.sampleRate / (from > 0 ? from : ctx.sampleRate);
  const length = Math.max(1, Math.round(frames * ratio));
  const buffer = ctx.createBuffer(channels, length, ctx.sampleRate);
  if (!sample) return buffer;
  const pcm = font.pcm;
  /** The value at a frame and a channel, clamped inside the sample's own run. */
  const frameAt = (frame: number, channel: number): number => {
    const clamped = Math.min(frames - 1, Math.max(0, frame));
    return pcm[(sample.start + clamped) * channels + channel] ?? 0;
  };
  for (let channel = 0; channel < channels; channel++) {
    const out = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const position = i / ratio;
      const i0 = Math.floor(position);
      const frac = position - i0;
      const a = frameAt(i0, channel);
      const b = frameAt(i0 + 1, channel);
      // 16-bit signed PCM to the -1..1 a Web Audio buffer wants.
      out[i] = (a + (b - a) * frac) / 32768;
    }
  }
  return buffer;
}

/**
 * One layer of a patch, as nodes, at a scheduled time.
 *
 * Split out because a patch is a loop over layers and each layer is this — and
 * because the loop is the part worth reading, so the arithmetic gets its own
 * function.
 */
function buildLayer(
  ctx: BaseAudioContext,
  layer: Layer,
  midi: number,
  at: number,
  duration: number,
  destination: AudioNode,
  noiseBuffer: AudioBuffer | null,
  expression: NoteExpression,
  shape: FilterShape,
): NoteGraph {
  const frequency = expression.hz(midi) * Math.pow(2, layer.octave);
  // The note's own velocity, then the layer's share of the stack. Both are the
  // same kind of number — a percentage of a full voice — so one note at full
  // velocity through a one-layer patch is exactly the signal this app made before
  // velocity existed, which is what lets it be added to a hundred songs at once.
  const peak = VOICE_PEAK * (layer.gain / 100) * (expression.velocity / MAX_VELOCITY)
    // And how much of the level THIS hit keeps: the round-robin's few percent, so
    // the second hit of a drum is not the first hit at the same loudness. At a
    // tone gain of 0 the factor is exactly 1, which is the sound this line made
    // before variation existed.
    * (1 + expression.tone.gain / 100);
  // GLIDE: where this note starts, when it is sliding in from the note before it.
  // Null unless there is a slide to make — nothing to slide from, no distance to
  // cover, or a glide of zero — which keeps the common case exactly the single
  // `setValueAtTime` this app has always made. Anything else (a note that started
  // at the previous pitch and never ramped) would be a channel stuck playing the
  // note before it, the worst kind of bug because it only shows up on the notes
  // that MOVE.
  const slide = (expression.glide / 100) * duration;
  const from = slide > 0 && expression.fromMidi !== null && expression.fromMidi !== midi
    ? expression.hz(expression.fromMidi) * Math.pow(2, layer.octave)
    : null;
  // BEND: the note's own pitch gesture, in cents on the source's DETUNE rather
  // than in hertz on its frequency — which is what lets one rule bend an
  // oscillator, a recording and a chip register alike, and what keeps it additive
  // with the vibrato instead of being cancelled by it (`detunes`, below). At a
  // bend of 0 this schedules nothing at all, so a note that says nothing is the
  // single `setValueAtTime` this app has always made.
  const bend = clampBend(expression.bend);
  const bendCents = Math.abs(bend) * 100;
  const bendReach = bendSeconds(duration, bend > 0 ? SCOOP_SPAN : FALL_SPAN);
  const bendTuning = (param: AudioParam, base: number): void => {
    if (bend === 0) return;
    if (bend > 0) {
      // A SCOOP starts low and arrives: the note is already at its pitch by the
      // time the listener has heard the attack, which is what makes it a bend
      // into the note rather than a slide up to it.
      param.setValueAtTime(base - bendCents, at);
      param.linearRampToValueAtTime(base, at + bendReach);
      return;
    }
    // A FALL holds the pitch and then leaves it, over the note's tail — so it
    // matters most on a note that RINGS, which is the note a player would dive on.
    const leaveAt = Math.max(at, at + duration - bendReach);
    param.setValueAtTime(base, at);
    param.linearRampToValueAtTime(base, leaveAt);
    param.linearRampToValueAtTime(base - bendCents, at + duration);
  };

  const env = ctx.createGain();
  const attack = (layer.attack / 100) * 1.2;
  const sustain = 0.12 + 0.88 * (layer.ring / 100);
  const top = at + 0.004 + attack;
  // DECAY: how long the fall from the peak to the held level takes. The base is
  // the short, proportional drop the envelope has always made; the knob ADDS to
  // it, so `decay 0` is exactly the old envelope and a bigger value is a slower
  // swell down to the note's held level. The amp envelope and the filter
  // envelope share this time, so a swept note's brightness and its level fall
  // together instead of one outliving the other.
  const decayTime = Math.min(0.2, Math.max(0.02, duration * 0.5)) + (layer.decay / 100) * DECAY_SPAN;
  const decayDone = top + decayTime;

  // SHAPE: which part of the sound survives. A low-pass is the whole history of
  // this app, so a patch that names no shape gets exactly the node it always
  // got; a patch that names one keeps `bright` as the filter's own FREQUENCY,
  // which means a high-pass grows thinner as the knob rises and a band-pass
  // moves its vowel up (see `model/shape.ts`).
  const filter = ctx.createBiquadFilter();
  filter.type = filterTypeFor(shape);
  // BRIGHT, moved by this hit's TONE: a soft note at `touch` above 0 is darker
  // as well as quieter, and every note of a round-robin is a little brighter or
  // duller than the one before it. Both are points of the same knob, and the
  // SAME shifted value feeds the sweep below, so a swept note's opening moves
  // with its tone rather than being measured from somewhere else.
  const bright = clampParam(layer.bright + expression.tone.bright);
  const cutoff = cutoffFor(bright);
  // SWEEP: the filter envelope. At sweep 0 the cutoff is the one value it has
  // always been — a single `setValueAtTime` and nothing else, so every note
  // written before this knob existed is the same steady tone it was. Above it,
  // the note OPENS wide and closes down to `bright` as it decays, which is what
  // turns a plain tone into a pluck, a wah or a swelling pad.
  if (layer.sweep > 0) {
    filter.frequency.setValueAtTime(sweepOpenFor(bright, layer.sweep), at);
    filter.frequency.exponentialRampToValueAtTime(cutoff, decayDone);
  } else {
    filter.frequency.setValueAtTime(cutoff, at);
  }
  filter.Q.value = filterQFor(shape);

  // The level a note holds is the RING knob; its release catches whatever is
  // left at the end, so a `pad` fades and a `pluck` is already near silent.
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(peak, top);
  env.gain.linearRampToValueAtTime(peak * sustain, decayDone);
  // RELEASE: how long the note keeps ringing once it ends. The same short tail
  // as before, made slower by the knob — so `release 0` is the old fade exactly,
  // and a big value lets a bell or a pad ring on after its last step.
  env.gain.setTargetAtTime(
    0.0001,
    at + Math.max(duration * 0.82, top - at),
    0.02 + (1 - layer.ring / 100) * 0.05 + (layer.release / 100) * RELEASE_SPAN,
  );

  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [filter, env];

  // Every detune param the wobble drives, so one vibrato can move the whole layer
  // together — a wobble that reached only the first copy would pull the layer out
  // of tune with itself instead of ornamenting it.
  const detunes: AudioParam[] = [];

  // DUTY: a square wave is a 50% pulse, and narrowing it is the whole chiptune
  // lead sound. At the default duty of 100 the shape is left to `osc.type`, so a
  // song that never touched the knob is built from exactly the oscillator it
  // always was; only a narrowed pulse pays for a Fourier table. A duty on any
  // other waveform is inert, the same way a filter on a sine barely shows.
  const pulse = layer.wave === 'square' && layer.duty < MAX_PARAM;
  // NOISE: the chip's own noise channel rather than a tonal wave. It is its own
  // source — a looping shift register, not an oscillator — and on it `duty`
  // chooses the register LENGTH (the long hiss or the short metallic ring).
  const isNoise = layer.wave === 'noise';
  // SAMPLE: a short built-in one-shot, played ONCE. Also not an oscillator, and
  // on it `duty` chooses which sound from the bank (see `SAMPLE_BANK`).
  const isSample = layer.wave === 'sample';
  // STRING: a rendered Karplus-Strong string, played ONCE and PITCHED by its
  // playback rate. Like a sample it is not an oscillator, and like a sample
  // `duty` picks from the bank (see `STRING_BANK`).
  const isString = layer.wave === 'string';
  // ORGAN: a rendered drawbar tone, LOOPED so a held chord sustains, and pitched
  // by its playback rate. It is the third bank-backed source, and `duty` picks
  // the registration (see `ORGAN_BANK`).
  const isOrgan = layer.wave === 'organ';
  // GRANULAR: a rendered grain cloud, LOOPED like the organ so the texture
  // sustains, pitched by its playback rate. `duty` picks the character (see
  // `GRANULAR_BANK`).
  const isGranular = layer.wave === 'granular';
  // MALLET: a struck bar, whose overtones are INHARMONIC — which is why it is a
  // rendered one-shot rather than a spectrum. `duty` picks the bar (see
  // `MALLET_SPECS`); like `sample` and `string` it sounds once and rings down.
  const isMallet = layer.wave === 'mallet';
  // MEMBRANE: a struck skin, whose overtones are denser and closer than a bar's
  // — inharmonic, so it is a rendered one-shot too, and it droops in pitch as the
  // skin settles. `duty` picks the drum (see `MEMBRANE_SPECS`).
  const isMembrane = layer.wave === 'membrane';
  // PLATE: a struck metal plate, the sparsest and longest-ringing body of them
  // all — a bell's few spread partials. A rendered one-shot like the other two.
  const isPlate = layer.wave === 'plate';
  // FONT: somebody else's recordings, played back by key range. `duty` picks the
  // preset; the note picks the zone. Prepared once per layer so a stack shares
  // one lookup, and null when a `font` channel has no font open — in which case
  // the note falls back to the built-in samples below, because a soundfont is a
  // sample player and this app's own samples are the closest thing to one that
  // always exists. A note that came out silent would break the range guarantee.
  const isFontWave = layer.wave === 'font';
  const fontVoice = isFontWave && expression.font
    ? prepareFontVoice(expression.font, layer.duty, expression.drum)
    : null;
  const isFont = fontVoice !== null;
  const fontFallback = isFontWave && !isFont;
  // The recording this note lands in, chosen ONCE so that the rate the note plays
  // at and the guard below are talking about the same zone. `prepareFontVoice`
  // keeps only presets that have zones, so this is null only when there is no
  // font at all — the same thing `isFont` already says.
  const fontZone = isFont && fontVoice ? zoneForNote(fontVoice.zones, midi) : null;
  // YOURS: the recording this note's CHANNEL named (`sample BRK02`), when the app
  // has that name loaded. It takes the place of the built-in one-shot a `sample`
  // layer would have played, and — the whole point of the fallback — `null` here
  // is not a failure: the bank below plays, which is the sound the channel would
  // have made if the line had never been written. Only a `sample` wave is
  // affected; every other wave ignores the channel's sample, so a channel can
  // carry the reference and a lead layer of its own without a fight.
  const owned = isSample ? expression.sample : null;

  /**
   * One raw source for this layer: a pulse/square oscillator, or chip noise.
   *
   * A closure because a layer needs this twice — the voice and its THICK copy —
   * and the two must be the same instrument. The source's own detune is returned
   * beside it so the vibrato can reach both, and glide works on either by ramping
   * the frequency of an oscillator or the playback rate of the register.
   */
  const makeSource = (detuneCents: number): {
    source: AudioScheduledSourceNode;
    detune: AudioParam;
    /** Extra nodes an FM carrier brings with it, to be started and collected. */
    extras: { sources: AudioScheduledSourceNode[]; nodes: AudioNode[] };
    /**
     * How fast the recording is played, against the rate it was recorded at. 1
     * for every source that is not somebody else's recording — and, for one that
     * is, the FASTEST the note reaches, so a note that glides up is guarded for
     * where it arrives rather than where it left.
     */
    rate: number;
  } => {
    // The layer's own tuning, moved by this HIT's tone: a few cents flat or sharp
    // is what makes the second hit of a drum a second hit. It is a detune rather
    // than a frequency so that it applies to every source kind at once (an
    // oscillator, a recording, a chip register) and so that a BEND written on the
    // same note bends from the varied pitch rather than cancelling it.
    const tuned = detuneCents + expression.tone.cents;
    const extras = { sources: [] as AudioScheduledSourceNode[], nodes: [] as AudioNode[] };
    if (isFont && fontZone) {
      // SOUNDFONT: the recording whose key range covers this note, played at the
      // rate that puts its ROOT key on this note's pitch. The root is tuned by
      // the song's temperament too, so an imported piano is not the one
      // instrument in the song that is still in equal temperament.
      const zone = fontZone;
      const src = ctx.createBufferSource();
      src.buffer = zone.buffer(ctx);
      // Only a LOOPED recording sustains; a piano note plays once and rings out,
      // which is what its own sample does and what its release tail is for.
      if (zone!.loop && zone!.loopEndSeconds > zone!.loopStartSeconds) {
        src.loop = true;
        src.loopStart = zone!.loopStartSeconds;
        src.loopEnd = zone!.loopEndSeconds;
      }
      const rootHz = expression.hz(zone.rootKey) * Math.pow(2, zone.tuneCents / 1200);
      const rate = (f: number) => sampleRateFor(f, rootHz);
      const startRate = rate(from ?? frequency);
      const endRate = rate(frequency);
      src.playbackRate.setValueAtTime(startRate, at);
      if (from !== null && slide > 0) src.playbackRate.linearRampToValueAtTime(endRate, at + slide);
      src.detune.setValueAtTime(tuned, at);
      bendTuning(src.detune, tuned);
      return { source: src, detune: src.detune, extras, rate: Math.max(startRate, endRate) };
    }
    if (isNoise || isSample || isString || isOrgan || isGranular || isMallet || isMembrane || isPlate || fontFallback) {
      const src = ctx.createBufferSource();
      // A sample or a string plays ONCE; the noise register LOOPS because it grits
      // for the whole note; an ORGAN and a GRAIN CLOUD loop so they sustain, and
      // glide by ramping their rate. One flag is what separates a chip hit from a
      // sustaining instrument.
      if (isSample || isString || isOrgan || isGranular || isMallet || isMembrane || isPlate || fontFallback) {
        const banked = isGranular ? granularFor(layer.duty)
          : isOrgan ? organFor(layer.duty)
          : isString ? stringFor(layer.duty)
          : isMallet ? malletFor(layer.duty)
          : isMembrane ? membraneFor(layer.duty)
          : isPlate ? plateFor(layer.duty)
          : sampleFor(layer.duty);
        // The channel's own recording when it has one, played at the app's
        // sample ROOT — a WAV says nothing about its pitch, so the app assumes
        // middle C and transposes from there, exactly like its own one-shots.
        // A take's window, when the page set one, is played as its own SLICE so
        // a trim really ends where it was drawn and its loop points are inside
        // that slice (see `windowedSampleBuffer`).
        const playWindow = owned !== null ? expression.sampleWindow : null;
        const windowed = playWindow !== null && owned !== null
          ? windowedSampleBuffer(ctx, owned, playWindow)
          : null;
        if (windowed !== null && playWindow !== null && owned !== null) {
          const trims = playWindow.start > SAMPLE_WINDOW_EPSILON
            || playWindow.end < sampleSeconds(owned) - SAMPLE_WINDOW_EPSILON;
          if (trims || playWindow.loop) {
            // A trim, a loop, or both: the slice IS the window, so the played
            // sound ends where the drawing ends.
            src.buffer = windowed.buffer;
            const looped = playWindow.loop && windowed.loopEnd - windowed.loopStart > MIN_LOOP_SECONDS;
            src.loop = looped;
            if (looped) {
              src.loopStart = windowed.loopStart;
              src.loopEnd = windowed.loopEnd;
            }
          } else {
            // An untouched window: the whole file, shared, exactly as before.
            src.buffer = ownedSampleBuffer(ctx, owned);
            src.loop = isOrgan || isGranular;
          }
        } else {
          src.buffer = owned !== null ? ownedSampleBuffer(ctx, owned)
            : isGranular ? makeGranularBuffer(ctx, layer.duty)
            : isOrgan ? makeOrganBuffer(ctx, layer.duty)
            : isString ? makeStringBuffer(ctx, layer.duty)
            : isMallet ? makeMalletBuffer(ctx, layer.duty)
            : isMembrane ? makeMembraneBuffer(ctx, layer.duty)
            : isPlate ? makePlateBuffer(ctx, layer.duty)
            : makeSampleBuffer(ctx, layer.duty);
          src.loop = isOrgan || isGranular;
        }
        const rate = (f: number) => sampleRateFor(f, owned !== null ? SAMPLE_ROOT_HZ : banked.rootHz);
        src.playbackRate.setValueAtTime(rate(from ?? frequency), at);
        if (from !== null && slide > 0) src.playbackRate.linearRampToValueAtTime(rate(frequency), at + slide);
      } else {
        src.buffer = makeLfsrBuffer(ctx, layer.duty < NOISE_SHORT_DUTY);
        src.loop = true;
        // The register's speed IS its pitch: a slow clock is coarse, a fast one fine.
        src.playbackRate.setValueAtTime(noiseRate(from ?? frequency), at);
        if (from !== null && slide > 0) src.playbackRate.linearRampToValueAtTime(noiseRate(frequency), at + slide);
      }
      src.detune.setValueAtTime(tuned, at);
      bendTuning(src.detune, tuned);
      return { source: src, detune: src.detune, extras, rate: 1 };
    }
    const osc = ctx.createOscillator();
    // `noise` returned above, so a TABLE or a PULSE wears a PeriodicWave and the
    // rest are the browser's own oscillators. The table is picked by `duty`, the
    // same way a pulse's width is: one knob, and the wave decides what it means.
    // A TABLE and a FORMANT both wear a PeriodicWave whose choice `duty` makes:
    // the table's place in its bank, or the vowel. One knob, and the wave says
    // what it means.
    if (layer.wave === 'table') osc.setPeriodicWave(wavetablePeriodicWave(ctx, layer.duty));
    else if (layer.wave === 'formant') osc.setPeriodicWave(formantPeriodicWave(ctx, layer.duty));
    else if (layer.wave === 'reed') osc.setPeriodicWave(reedPeriodicWave(ctx, layer.duty));
    else if (layer.wave === 'brass') osc.setPeriodicWave(brassPeriodicWave(ctx, layer.duty));
    else if (layer.wave === 'bow') osc.setPeriodicWave(bowPeriodicWave(ctx, layer.duty));
    // (`font` never reaches here: it either played a recording or fell back to a
    // one-shot, and `oscillatorShape` only stands in for it as a last resort.)
    else if (pulse) osc.setPeriodicWave(pulsePeriodicWave(ctx, layer.duty));
    else osc.type = oscillatorShape(layer.wave);
    // A gliding note STARTS at the previous pitch and ramps to its own. A plain
    // one starts where it belongs, which is the arithmetic this app always ran.
    osc.frequency.setValueAtTime(from ?? frequency, at);
    if (from !== null && slide > 0) osc.frequency.linearRampToValueAtTime(frequency, at + slide);
    // The layer's own detune, so a stack can be tuned against itself. Zero for
    // every layer a voice makes, which is what keeps the old sound exact.
    osc.detune.setValueAtTime(tuned, at);
    bendTuning(osc.detune, tuned);
    // FM: a second oscillator, an octave up, bending the carrier's pitch through
    // a depth gain. The carrier is a SINE (see `oscillatorShape`); the timbre is
    // the modulator's, which is the whole idea of FM — the wave you hear comes
    // from the relationship between two pitches, not from a shape.
    if (layer.wave === 'fm') {
      const mod = ctx.createOscillator();
      mod.type = 'sine';
      const modFreq = (f: number) => f * FM_RATIO;
      mod.frequency.setValueAtTime(modFreq(from ?? frequency), at);
      if (from !== null && slide > 0) mod.frequency.linearRampToValueAtTime(modFreq(frequency), at + slide);
      // The modulator takes the SAME detune as the carrier, so the vibrato and
      // the layer's tuning move the pair together rather than beating them apart.
      mod.detune.setValueAtTime(tuned, at);
      // The MODULATOR bends with the carrier, so the FM ratio holds through the
      // gesture: a bend that moved only one of the pair would change the TIMBRE
      // as it moved, which is a different sound rather than a bent one.
      bendTuning(mod.detune, tuned);
      detunes.push(mod.detune);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(fmDepth(layer.duty, frequency), at);
      mod.connect(depth).connect(osc.frequency);
      mod.start(at);
      extras.sources.push(mod);
      extras.nodes.push(depth);
    }
    return { source: osc, detune: osc.detune, extras, rate: 1 };
  };

  const primary = makeSource(layer.detune);
  detunes.push(primary.detune);
  // An FM carrier brings its modulator with it; both are stopped by the same
  // loop below, because the extras are pushed onto `sources` here.
  for (const extra of primary.extras.sources) sources.push(extra);
  for (const extra of primary.extras.nodes) nodes.push(extra);
  // ANTI-ALIAS: what a recording played faster than it was made cannot carry.
  //
  // The guard is per NOTE rather than per channel, because the rate is: one note
  // of a melody sits on its sample's root and needs nothing, the next is an octave
  // and a half up and needs everything. At `Infinity` — a rate of 1 or below — no
  // node is made at all, so a font note near its own root key is the note it has
  // always been, and only the stretched ones pay for the filter.
  const guardCutoff = isFont ? fontGuardCutoff(primary.rate, ctx.sampleRate) : Infinity;
  const guards: AudioNode[] = [];
  if (Number.isFinite(guardCutoff)) {
    for (let stage = 0; stage < FONT_GUARD_STAGES; stage++) {
      const guard = ctx.createBiquadFilter();
      guard.type = 'lowpass';
      guard.frequency.setValueAtTime(Math.max(20, guardCutoff), at);
      guard.Q.value = FONT_GUARD_Q;
      guards.push(guard);
      nodes.push(guard);
    }
  }
  /** A source into the envelope, through the guard and then any trim of its own. */
  const intoEnv = (source: AudioScheduledSourceNode, trim?: AudioNode): void => {
    let last: AudioNode = source;
    for (const guard of guards) last = last.connect(guard);
    if (trim) last = last.connect(trim);
    last.connect(env);
  };

  if (isNoise) {
    // Noise is broadband, so it reads louder than a tone at the same peak; the
    // trim keeps a noise channel in the mix rather than on top of it.
    const level = ctx.createGain();
    level.gain.value = NOISE_WAVE_GAIN;
    intoEnv(primary.source, level);
    nodes.push(level);
  } else {
    intoEnv(primary.source);
  }
  primary.source.start(at);
  sources.push(primary.source);

  // THICK: a second copy, detuned. Under ~10 it is a slow beating warmth; high
  // it widens into the two-players-at-once sound a pad needs.
  if (layer.thick > 0) {
    const second = makeSource(layer.detune + 5 + (layer.thick / 100) * 25);
    detunes.push(second.detune);
    for (const extra of second.extras.sources) sources.push(extra);
    for (const extra of second.extras.nodes) nodes.push(extra);
    const blend = ctx.createGain();
    blend.gain.value = (layer.thick / 100) * 0.55;
    intoEnv(second.source, blend);
    second.source.start(at);
    sources.push(second.source);
    nodes.push(blend);
  }

  // NOISE: broadband hiss under the tone. It goes through the same envelope as
  // the oscillator, so a hit stays a hit and wind keeps its soft start.
  if (layer.noise > 0 && noiseBuffer) {
    const hiss = ctx.createBufferSource();
    hiss.buffer = noiseBuffer;
    hiss.loop = true;
    const amount = ctx.createGain();
    amount.gain.value = (layer.noise / 100) * 0.5;
    hiss.connect(amount).connect(env);
    hiss.start(at);
    sources.push(hiss);
    nodes.push(amount);
  }

  // VIBRATO: one LFO on every oscillator's detune, so the layer wobbles as one
  // player rather than as several. The depth RAMPS IN instead of starting at its
  // widest, because a wobble that is already full on the attack reads as a
  // synthesiser; by the time a held note has settled it is at its full width.
  if (expression.vibrato > 0) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(VIBRATO_HZ, at);
    const depth = ctx.createGain();
    const cents = VIBRATO_CENTS * (expression.vibrato / 100);
    const ramp = Math.min(0.2, Math.max(0.05, duration * 0.4));
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(cents, at + ramp);
    lfo.connect(depth);
    for (const detune of detunes) depth.connect(detune);
    lfo.start(at);
    sources.push(lfo);
    nodes.push(depth);
  }

  // DRIFT: the wow and flutter of a worn transport, on the same detune the
  // vibrato rides above — so a wobbling note and a drifting one ADD rather than
  // one replacing the other. Two wow rates that share no period, plus a fast
  // flutter an order of magnitude under them: the numbers `model/drift.ts` owns,
  // which are the tape effect's own. The depth ramps in over the vibrato's
  // window, for the vibrato's reason — a wobble that is already full on the
  // attack reads as a synthesiser rather than as a machine.
  if (expression.drift > 0) {
    const scale = expression.drift / 100;
    const ramp = Math.min(0.2, Math.max(0.05, duration * 0.4));
    const wobble = (hz: number, cents: number): void => {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(hz, at);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(cents, at + ramp);
      lfo.connect(depth);
      for (const detune of detunes) depth.connect(detune);
      lfo.start(at);
      sources.push(lfo);
      nodes.push(depth);
    };
    const wow = DRIFT_MAX_CENTS * scale;
    wobble(DRIFT_WOW_HZ, wow);
    wobble(DRIFT_WOW_DRIFT_HZ, wow * DRIFT_WOW_DRIFT_WEIGHT);
    wobble(DRIFT_FLUTTER_HZ, DRIFT_FLUTTER_CENTS * scale);
  }

  env.connect(filter).connect(destination);

  // A long release needs its source to keep running, so the stop is deferred by
  // the tail the knob asked for (nothing at `release 0`, the old stop exactly).
  const stopAt = at + duration + 0.1 + (layer.release / 100) * RELEASE_TAIL;
  for (const source of sources) {
    try { source.stop(stopAt); } catch { /* already stopping */ }
  }

  return { sources, nodes, env };
}

/**
 * A whole patch's worth of nodes for one note: every layer, summed into
 * `destination`.
 *
 * The layers are independent — each has its own envelope, filter and tuning — so
 * adding one is not a special case of anything. The caller owns the returned
 * graph and is responsible for releasing it, which is what lets the live engine
 * hold a channel's note and cut it when the next one arrives.
 */
export function buildNote(
  ctx: BaseAudioContext,
  patch: Patch,
  midi: number,
  at: number,
  duration: number,
  destination: AudioNode,
  noiseBuffer: AudioBuffer | null,
  options: NoteOptions = {},
): NoteGraph {
  // Clamped once, here, so every layer of a stacked patch is given the same
  // numbers and the range holds however the caller got them.
  const expression: NoteExpression = {
    velocity: clampVelocity(options.velocity ?? MAX_VELOCITY),
    glide: clampGlide(options.glide ?? 0),
    fromMidi: options.fromMidi ?? null,
    bend: clampBend(options.bend ?? 0),
    tone: options.tone ?? NO_TONE_SHIFT,
    vibrato: clampVibrato(options.vibrato ?? 0),
    drift: clampDrift(options.drift ?? 0),
    speed: clampSpeed(options.speed ?? DEFAULT_SPEED),
    tuning: options.tuning ?? tuningFor(DEFAULT_TUNING),
    tonic: options.tonic ?? 0,
    font: options.font ?? null,
    drum: options.drum ?? null,
    sample: options.sample ?? null,
    sampleWindow: options.sampleWindow ?? null,
    hz: () => 0,
  };
  // Bound once, here, so every layer of a stacked patch is tuned together and
  // the equal-temperament fast path (`tunedFreq` returns the plain frequency) is
  // the one a song that never chose a tuning walks.
  // The master SPEED multiplies every frequency here — the one place pitch is
  // decided for the whole synth — so the tape-speed interval reaches oscillators,
  // recorded keys and one-shots alike. At `100` the factor is exactly one.
  expression.hz = (midi: number) => tunedFreq(midi, expression.tuning, expression.tonic) * speedFactor(expression.speed);
  // The channel's filter shape is the PATCH's, not the note's: every layer of a
  // stack is one voice through one filter, so the knock-on of a `track 2 shape
  // sharp` reaches all of them and the shape is resolved once, here.
  const shape = patch.shape ?? DEFAULT_SHAPE;
  const layers = patch.layers.map((layer) => buildLayer(ctx, layer, midi, at, duration, destination, noiseBuffer, expression, shape));
  return {
    sources: layers.flatMap((layer) => layer.sources),
    nodes: layers.flatMap((layer) => layer.nodes),
    env: layers[0].env,
  };
}

/**
 * How long a note rings, in seconds, from a step length and a channel's `hold`.
 *
 * One step keeps the small gap that makes a run of notes sound like separate
 * events; a longer hold fills its whole time, because the point of a long note
 * is that it does NOT stop between steps. Shared so that a rendered file and a
 * live performance phrase identically.
 */
export function noteLength(stepSeconds: number, hold: number): number {
  const steps = Math.max(1, hold);
  return stepSeconds * (steps > 1 ? steps : NOTE_FILL);
}

/**
 * Let a note that is already scheduled fall away, as another takes its place.
 *
 * A SCHEDULED release, at the moment the next note begins, so a note queued a
 * few milliseconds ahead is not clipped. One implementation because two callers
 * need it — the live engine, when a channel is monophonic or its voices are
 * full, and the offline renderer, for the same two reasons — and a stolen voice
 * that faded differently in a file than in the app would be a bug nobody could
 * hear until they compared the two.
 */
export function releaseNote(graph: NoteGraph, at: number, fade = 0.008): void {
  try {
    graph.env.gain.cancelScheduledValues(at);
    graph.env.gain.setTargetAtTime(0.0001, at, fade);
    for (const source of graph.sources) source.stop(at + 0.05);
  } catch {
    /* already stopped: nothing to release */
  }
}
