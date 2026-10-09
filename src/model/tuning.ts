/**
 * tuning — how the twelve notes of an octave are spaced: the song's INTONATION.
 *
 * Every pitch in this app has come from one line of arithmetic: equal
 * temperament, twelve equal steps to the octave, the compromise a piano is tuned
 * to because it keeps every key usable. It is a compromise, though — a real
 * musician tunes to the SOUND, and a fifth or a third played pure is a different
 * and sweeter interval than the one equal temperament can offer. A TEMPERAMENT is
 * a choice about that compromise, and it is the one thing on this shelf that
 * changes no timbre at all: play the same notes under a different temperament and
 * they are the same instruments, tuned differently.
 *
 * ── What a temperament is here ───────────────────────────────────────────────
 * Twelve numbers — how many CENTS each degree above the song's tonic sits above
 * where equal temperament would put it. Degree 0 is the tonic and stays put, so
 * the key note is always where the player left it and a tuning changes the
 * INTERVALS rather than the pitch of the song. `just` sweetens the thirds and
 * fifths in the home key; `pythagorean` makes the fifths pure and the thirds
 * wide; `meantone` splits the difference the way the Renaissance did; `septimal`
 * adds the flat seventh that gives a blues its blue note.
 *
 * ── Why it is anchored to the KEY ────────────────────────────────────────────
 * Just intonation is only pure RELATIVE to a tonic: the same ratios on a
 * different root are a different set of intervals. So the temperament is read
 * against `Song.key.tonic`, which the app already has — a song in D tuned `just`
 * is pure in D. That is also why the numbers are offsets rather than absolute
 * frequencies: the song says which key it is in, and the temperament says how
 * that key is spaced.
 *
 * Phaser-free on purpose, like the rest of `model/`: the script, the file
 * format, the keyboard and the audio engine all read this one table, so a tuning
 * cannot exist in the UI and not in the language.
 */

import { midiToFreq } from './notes';

/** The temperaments, as ids the script, the file and the menu all speak. */
export type TuningId = 'equal' | 'just' | 'pythagorean' | 'meantone' | 'septimal';

export interface Tuning {
  id: TuningId;
  /** What the menu and the docs call it. */
  label: string;
  /** One line, in the same voice a scale's or a voice's blurb uses. */
  blurb: string;
  /**
   * Cents above equal temperament for each of the twelve degrees ABOVE THE
   * TONIC. Index 0 is the tonic itself and is always 0 — a tuning moves the
   * intervals, never the key note.
   */
  cents: readonly number[];
}

/** Round to a tenth of a cent, which is finer than any ear and keeps tables tidy. */
function cents(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The cents each degree sits above equal temperament, from a list of ratios to
 * the tonic — how just intonation is actually written down.
 *
 * A ratio of `r` for degree `d` is `1200·log₂(r)` cents above the tonic, and
 * equal temperament puts that degree at `d·100`, so the difference is the offset
 * the engine needs.
 */
function fromRatios(ratios: readonly number[]): number[] {
  return ratios.map((ratio, degree) => cents(1200 * Math.log2(ratio) - degree * 100));
}

/**
 * The cents each degree sits above equal temperament, from a single PURE FIFTH.
 *
 * Stacking fifths is how a whole temperament can be generated from one number:
 * the note seven degrees up is one fifth, two degrees up is two fifths, and so
 * on around the circle until every degree has been reached. A fifth of 702 cents
 * is Pythagorean (pure), 696.6 is quarter-comma meantone (narrowed to make the
 * thirds pure), and the arithmetic is the same for both.
 */
function fromFifth(fifthCents: number): number[] {
  const out: number[] = [];
  for (let degree = 0; degree < 12; degree++) {
    // Eleven up-fifths reach every degree (7 is coprime with 12); the twelfth is
    // the octave, which lands back on the tonic and is not a new note.
    const fifths = (7 * degree) % 12;
    let value = (fifthCents * fifths) % 1200;
    if (value < 0) value += 1200;
    // Reduce to the representative within a tritone of where equal temperament
    // would put the degree, so every offset reads as a small correction.
    let offset = value - degree * 100;
    while (offset > 600) offset -= 1200;
    while (offset <= -600) offset += 1200;
    out.push(cents(offset));
  }
  return out;
}

/** A pure fifth, in cents — the interval Pythagorean tuning is built from. */
const PURE_FIFTH = 1200 * Math.log2(3 / 2); // ~701.955
// Meantone narrows each fifth by a quarter of a syntonic comma (81/80), which is
// exactly enough to make the major thirds pure — the trade it is named for.
const QUARTER_COMMA = 1200 * Math.log2(81 / 80) / 4; // ~5.377 cents
const MEANTONE_FIFTH = PURE_FIFTH - QUARTER_COMMA; // ~696.578

/**
 * The temperaments, in the order the menu cycles them: the default first, then
 * from the sweetest home key outward.
 *
 * Five is the ceiling for the same reason the voices and the scales have one: a
 * list nobody reads is not a choice. These cover the two a beginner will hear
 * immediately (equal against just), the two historic answers (Pythagorean and
 * meantone) and one deliberately strange one (septimal, whose flat seventh is
 * the sound of a blues).
 */
export const TUNINGS: readonly Tuning[] = [
  {
    id: 'equal', label: 'EQUAL',
    blurb: 'the piano: twelve equal steps, every key usable and nothing quite pure',
    cents: new Array<number>(12).fill(0),
  },
  {
    id: 'just', label: 'JUST',
    blurb: 'pure thirds and fifths in the home key: sweet and still, but only in one key',
    cents: fromRatios([1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8]),
  },
  {
    id: 'pythagorean', label: 'PYTHAGOREAN',
    blurb: 'pure fifths and wide thirds: bright, open, and the sound of medieval music',
    cents: fromFifth(PURE_FIFTH),
  },
  {
    id: 'meantone', label: 'MEANTONE',
    blurb: 'quarter-comma: fifths narrowed a little so the major thirds ring pure',
    cents: fromFifth(MEANTONE_FIFTH),
  },
  {
    id: 'septimal', label: 'SEPTIMAL',
    blurb: '7-limit just: a flat seventh and a harmonic colour, the sound of a blues',
    cents: fromRatios([1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 7 / 5, 3 / 2, 8 / 5, 5 / 3, 7 / 4, 15 / 8]),
  },
];

/** What a tuning reads as, by id, for a caller that only has the id. */
export const TUNING_BY_ID: Readonly<Record<TuningId, Tuning>> =
  Object.fromEntries(TUNINGS.map((tuning) => [tuning.id, tuning])) as Record<TuningId, Tuning>;

/**
 * What a song is tuned to when nobody has chosen: equal temperament, which is
 * what every note in this app has always been. The default is the guarantee that
 * a tuning changes nothing until it is asked for.
 */
export const DEFAULT_TUNING: TuningId = 'equal';

/** The next tuning in the menu's cycle, for a click-to-cycle control. */
export function nextTuning(id: TuningId): TuningId {
  const index = TUNINGS.findIndex((tuning) => tuning.id === id);
  return TUNINGS[(index + 1) % TUNINGS.length].id;
}

/** The tuning with this id, or null. */
export function tuningById(id: string): Tuning | null {
  return TUNING_BY_ID[id as TuningId] ?? null;
}

/** The tuning a song is tuned to, whether the id is known or not. */
export function tuningFor(id: TuningId): Tuning {
  return TUNING_BY_ID[id] ?? TUNING_BY_ID[DEFAULT_TUNING];
}

/**
 * Accept the spellings a person (or a model) actually writes. `ji` and `5-limit`
 * mean just intonation, `et` and `12-tet` mean equal, and `pyth` means
 * Pythagorean — the same forgiving-but-strict bargain the voices and the
 * waveforms make.
 */
export function tuningFromName(text: string): Tuning | null {
  switch (text.trim().toLowerCase()) {
    case 'equal': case 'et': case '12-tet': case '12tet': case 'piano': return TUNING_BY_ID.equal;
    case 'just': case 'ji': case '5-limit': case '5limit': return TUNING_BY_ID.just;
    case 'pythagorean': case 'pythagoras': case 'pyth': return TUNING_BY_ID.pythagorean;
    case 'meantone': case 'mean': case 'quarter-comma': return TUNING_BY_ID.meantone;
    case 'septimal': case '7-limit': case '7limit': case 'harmonic': case 'blues': return TUNING_BY_ID.septimal;
    default: return null;
  }
}

/** The tunings a script may name, for an error message that lists them. */
export function tuningNames(): string {
  return TUNINGS.map((tuning) => tuning.label.toLowerCase()).join(', ');
}

/**
 * The frequency of a MIDI note under a temperament, anchored to the song's tonic.
 *
 * Equal temperament is returned untouched, so a song that never chose a tuning is
 * built from exactly the frequency it always was — the same promise every knob on
 * this shelf makes. Otherwise the note keeps its equal-tempered pitch and is
 * moved by the offset for its degree above the tonic, which is what makes the
 * tonic the one note a tuning never touches.
 */
export function tunedFreq(midi: number, tuning: Tuning, tonic = 0): number {
  const base = midiToFreq(midi);
  if (tuning.id === 'equal') return base;
  const degree = (((midi - tonic) % 12) + 12) % 12;
  const offset = tuning.cents[degree] ?? 0;
  return offset === 0 ? base : base * Math.pow(2, offset / 1200);
}
