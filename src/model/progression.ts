/**
 * progression — a chord LOOP the whole song hangs on.
 *
 * Every other piece of harmony in this app is written one place at a time: a
 * `chord` statement puts a stack of notes in a cell, and the chord tool writes one
 * wherever the cursor is. That is the right way to write a bar and the wrong way
 * to write a SONG — a three-minute piece is the same four chords under eighty
 * bars, and eighty hand-written stacks is how a beginner ends up with a
 * progression that drifts a semitone in the second verse.
 *
 * So a progression is an OBJECT on the song: a list of chords and how long each
 * one lasts. Nothing below this line plays it — it is data, like `sections` — and
 * what USES it are the two followers in the language:
 *
 *   chord 0 3 follow    the progression's chords on a keyboard channel
 *   note  0 4 follow    the progression's roots on a bass channel
 *
 * Both of them WRITE the notes into cells rather than generating them at playback,
 * which is the same bargain `arp` and `rows repeat` make and the reason for it is
 * the same: the grid is the song. A follower that played notes nobody could see
 * would be a channel you cannot edit, cannot export and cannot explain.
 *
 * ── The two ways to name a chord ───────────────────────────────────────────
 * A step is written either as a chord NAME (`Am`, `F#7`, `Bbdim` — absolute: A C E
 * wherever the song sits) or as a scale DEGREE (`1`..`7` — relative: the chord on
 * that step of the song's key, which is what makes `1 6 3 7` a sound thing to type
 * and lets a song in another key use the same four numbers). The distinction is
 * the one `chord` already makes, down to the parsing: a progression's step IS a
 * `chord`'s third value, so the two can never disagree about what `Dm7` means.
 *
 * ── How long a chord lasts ─────────────────────────────────────────────────
 * In STEPS, the grid's own unit, and the word is `hold` — the same word and the
 * same unit a channel uses for how long its notes ring, so there is one thing to
 * learn. The default is one BEAT (`ROWS_PER_BEAT`, four steps at the default
 * grid), which is the length that makes a four-chord progression fit one 16-step
 * bar — the loop under most songs a beginner is trying to write. `hold 8` is two
 * chords to the bar, `hold 16` one chord to the bar.
 */

import {
  chordPitches,
  chordShape,
  degreeChord,
  DEFAULT_CHORD_DEGREES,
  type ChordQuality,
} from './chord';
import { baseMidiForOctave, NOTE_NAMES } from './notes';
import type { SongKey } from './scale';
import { ROWS_PER_BEAT } from './song';

/**
 * One step of a progression: a chord, named one of the two ways `chord` names one.
 *
 * `root` is a PITCH CLASS (0..11) rather than a MIDI note, because a chord name
 * says which chord and not how high it is: `Am` is the same chord wherever it is
 * played, and the OCTAVE comes from the follower's own line — exactly as it does
 * for `chord 0 1 Am`.
 */
export type ProgressionStep =
  | { kind: 'name'; root: number; quality: ChordQuality }
  | { kind: 'degree'; degree: number };

/** A loop of chords, and how many steps each one lasts. */
export interface Progression {
  /** In playing order. Never empty: no progression at all is `null`. */
  steps: ProgressionStep[];
  /** How many STEPS each chord lasts. */
  hold: number;
}

/** The statement that sets one. Spelled once, for the parser and the messages. */
export const PROGRESSION_WORD = 'progression';
/** The word that clears it: `progression none`. */
export const PROGRESSION_NONE_WORD = 'none';
/**
 * The word that makes a channel follow it, in the slot where `chord` and `note`
 * expect a chord or a pitch: `chord 0 3 follow`, `note 0 4 follow`.
 */
export const FOLLOW_WORD = 'follow';
/** The clause that says how long each chord lasts: `progression Am F C G hold 8`. */
export const PROGRESSION_HOLD_WORD = 'hold';

/** The fewest steps a chord can last: one step is a stab, not a chord. */
export const MIN_PROGRESSION_HOLD = 1;
/**
 * The most: sixty-four steps, which at the default grid is four bars — longer
 * than any chord this app would call a progression, and the ceiling exists so a
 * typo (`hold 32000`) is refused rather than making a follower write one chord.
 */
export const MAX_PROGRESSION_HOLD = 64;
/** Four steps — one beat at the default grid. See the header for why. */
export const DEFAULT_PROGRESSION_HOLD = ROWS_PER_BEAT;
/**
 * How many chords a progression may hold.
 *
 * Sixteen is four bars of one chord per beat at the default grid, and it is also
 * a LIST rather than a structure: past this, what somebody wants is two sections
 * with two progressions, which is what sections are for.
 */
export const MAX_PROGRESSION_STEPS = 16;

/**
 * A progression from parts, copied and clamped — the one door the parser and a
 * file reader both come through.
 *
 * Copied rather than adopted because a progression is pointed at by name in two
 * places (the song and every follower command's snapshot), and a shared step
 * object would let a later line's edit reach into a line that already ran.
 */
export function withProgressionSteps(
  steps: readonly ProgressionStep[],
  hold: number = DEFAULT_PROGRESSION_HOLD,
): Progression {
  return { steps: steps.map((step) => ({ ...step })), hold: clampProgressionHold(hold) };
}

export function clampProgressionHold(hold: number): number {
  const rounded = Math.round(hold);
  if (!Number.isFinite(rounded)) return DEFAULT_PROGRESSION_HOLD;
  return Math.max(MIN_PROGRESSION_HOLD, Math.min(MAX_PROGRESSION_HOLD, rounded));
}

/** How many steps one chord of this progression lasts. */
export function progressionHold(progression: Progression): number {
  return clampProgressionHold(progression.hold);
}

/** How many notes the chord on a step has: a triad unless the name says otherwise. */
export function progressionStepSize(step: ProgressionStep): number {
  return step.kind === 'name' ? chordShape(step.quality).intervals.length : DEFAULT_CHORD_DEGREES;
}

/**
 * The notes of one step, at an octave.
 *
 * The two branches are the two spellings, and they resolve exactly where `chord`'s
 * applier resolves them: a name is absolute, so it is the root's pitch class placed
 * at the octave and stacked with its own shape; a degree is relative, so it is the
 * song's key that decides which notes those are — which is why a degree cannot be
 * resolved before the key is known and why this function takes it.
 */
export function progressionStepNotes(step: ProgressionStep, key: SongKey, octave: number): number[] {
  if (step.kind === 'name') {
    return chordPitches(baseMidiForOctave(octave) + step.root, step.quality);
  }
  return degreeChord(step.degree, key, octave, DEFAULT_CHORD_DEGREES);
}

/**
 * The ROOT of one step, as a single note — what a bass channel plays.
 *
 * The lowest note of the chord rather than a second opinion about where the root
 * is: a `Bb` chord built from `Bb` has Bb at the bottom by construction, and
 * asking the chord itself means a bass line cannot drift a third away from the
 * keyboard sitting above it.
 */
export function progressionStepRoot(step: ProgressionStep, key: SongKey, octave: number): number {
  return progressionStepNotes(step, key, octave)[0];
}

/** Which step of the progression covers a row. Loops, so a progression repeats. */
export function progressionStepAt(progression: Progression, row: number): ProgressionStep {
  const hold = progressionHold(progression);
  const index = Math.floor(Math.max(0, row) / hold) % progression.steps.length;
  return progression.steps[index];
}

/** True when a chord STARTS at this row — the rows a follower writes a hit on. */
export function progressionStartsAt(progression: Progression, row: number): boolean {
  return Math.max(0, row) % progressionHold(progression) === 0;
}

/**
 * The rows of a pattern a chord starts on: `from` and every `hold` steps after it,
 * while they are inside the pattern.
 *
 * The follower's own arithmetic, in one place, so the script applier and a screen
 * that wants to draw the chords under the grid cannot disagree about where they
 * fall.
 */
export function progressionStartRows(progression: Progression, rows: number, from = 0): number[] {
  const hold = progressionHold(progression);
  const out: number[] = [];
  for (let row = Math.max(0, from); row < rows; row += hold) out.push(row);
  return out;
}

/**
 * The name of one step, the way a person wrote it: `Am`, `F#7`, `3`.
 *
 * Derived from the parsed step rather than remembered from the text, so a label
 * and a chord cannot disagree — the same reason `chordName` reads a chord back out
 * of its own notes. A degree stays a numeral, because that is what it is: which
 * chord it becomes is the key's business and would be a lie in A minor to print in
 * C.
 */
export function progressionStepLabel(step: ProgressionStep): string {
  if (step.kind === 'degree') return String(step.degree);
  return `${NOTE_NAMES[step.root]}${chordShape(step.quality).suffix}`;
}

/** The whole loop as text: `Am F C G`, or `Am F C G hold 8` when it is not the default. */
export function progressionLabel(progression: Progression): string {
  const chords = progression.steps.map(progressionStepLabel).join(' ');
  const hold = progressionHold(progression);
  return hold === DEFAULT_PROGRESSION_HOLD ? chords : `${chords} ${PROGRESSION_HOLD_WORD} ${hold}`;
}

/** The line a script — and the saved `.txt` — writes for a progression. */
export function progressionScript(progression: Progression): string {
  return `${PROGRESSION_WORD} ${progressionLabel(progression)}`;
}

/** Whether two progressions are the same loop, so a no-op can be recognised. */
export function sameProgression(a: Progression | null, b: Progression | null): boolean {
  if (a === null || b === null) return a === b;
  if (progressionHold(a) !== progressionHold(b) || a.steps.length !== b.steps.length) return false;
  return a.steps.every((step, i) => sameStep(step, b.steps[i]));
}

function sameStep(a: ProgressionStep, b: ProgressionStep): boolean {
  if (a.kind === 'degree' || b.kind === 'degree') {
    return a.kind === 'degree' && b.kind === 'degree' && a.degree === b.degree;
  }
  return a.root === b.root && a.quality === b.quality;
}
