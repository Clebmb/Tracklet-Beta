/**
 * grid — the SHAPE of a bar, said in note values instead of arithmetic.
 *
 * A song has always been able to say exactly what its grid is, and it says it in
 * numbers: `steps 16` is how many steps a bar holds, and `beat 4` is how many of
 * those steps are one beat. That pair is precise and unreadable, and the two
 * things a person actually wants to write are arithmetic they have to get right:
 *
 * ```text
 * steps 12  beat 3     # eighth-note triplets — a shuffle, or a 12/8 feel
 * steps 14  beat 2     # seven eight notes to the bar
 * ```
 *
 * `grid` and `meter` are SUGAR over that pair, and nothing else: each one works
 * out a `steps`/`beat` pair and writes it, so the engine, the renderer, the file
 * and every other reader keep seeing two plain numbers and never learn these
 * words exist. A bar is a whole note and the app's own default is a sixteenth
 * grid (`steps 16`, `beat 4`), which is the anchor both spellings measure against:
 *
 * ```text
 * grid 16      # sixteenth notes in a bar of 4/4 — the default
 * grid 8t      # eighth-note triplets: 12 steps, 3 to the beat
 * meter 7 8    # seven eighth notes to the bar: 14 steps, 2 to the beat
 * meter 3 4    # a waltz
 * ```
 *
 * The last of `steps`, `beat`, `grid` and `meter` to appear writes the bar, which
 * is the same rule the tempo map, the lanes and `section` all follow: the last
 * line about a thing is the one that counts. Neither spelling reads the other, so
 * they do not compose — `meter` is how you say a bar that is not four quarters,
 * and `grid` is how you say a subdivision of one that is.
 *
 * Phaser-free and audio-free like the rest of `model/`.
 */

import { DEFAULT_ROWS, MAX_ROWS, MAX_ROWS_PER_BEAT, MIN_ROWS, MIN_ROWS_PER_BEAT } from './song';

/**
 * How many steps a whole note is worth at the app's own default grid.
 *
 * Sixteen, because a bar of 4/4 is a whole note and the default `steps 16` with
 * `beat 4` makes each step a sixteenth. This single number is what gives the two
 * sugar words their meaning, and it is the DEFAULT rather than the current grid
 * on purpose: `grid 16` must mean sixteenth notes whether or not an earlier line
 * already moved the bar, or the same word would mean different things in
 * different songs.
 */
export const STEPS_PER_WHOLE = DEFAULT_ROWS;

/** A bar, as the two numbers the language has always used for it. */
export interface BarShape {
  /** How many steps the bar holds — what `steps` sets. */
  steps: number;
  /** How many steps make one beat — what `beat` sets. */
  stepsPerBeat: number;
}

/**
 * The grids `grid` accepts, as the names a person types.
 *
 * A CLOSED LIST, and short, which is the language's own rule for a word from a
 * table: these are the powers of two that fit the `beat` range (1..16 steps to the
 * beat) and their triplets, so `grid 2` (half a step to the beat) and `grid 128`
 * (thirty-two) are refused with the list in the message rather than worked out
 * into numbers nobody can play. `16` is the default and `64` is as fine as a bar
 * gets.
 */
export const GRID_NAMES: readonly string[] = ['4', '8', '16', '32', '64', '8t', '16t', '32t'];

/** The grids as one string, for an error message that has to list them. */
export const GRID_NAME_LIST = GRID_NAMES.join(', ');

/**
 * The note values a `meter` beat may be, as the bottom number of a time signature.
 *
 * Powers of two up to sixteen, which is exactly the set that divides a whole note
 * into a whole number of steps at the default grid — so `meter 7 8` is seven
 * eighths (2 steps each) and `meter 7 3` is not a thing this app can say.
 */
export const METER_UNITS: readonly number[] = [1, 2, 4, 8, 16];

/** The note values as one string, for an error message that has to list them. */
export const METER_UNIT_LIST = METER_UNITS.join(', ');

/** Whether a shape is one a song can actually hold. Shared, so both spellings agree. */
function fits(steps: number, stepsPerBeat: number): boolean {
  return (
    Number.isInteger(steps) && steps >= MIN_ROWS && steps <= MAX_ROWS
    && Number.isInteger(stepsPerBeat) && stepsPerBeat >= MIN_ROWS_PER_BEAT && stepsPerBeat <= MAX_ROWS_PER_BEAT
  );
}

/**
 * The bar a grid name asks for, or `null` when there is no such grid.
 *
 * The name is a subdivision of a whole note: `16` is sixteenths, so a bar of
 * sixteenths is sixteen steps at four to the beat, and `8t` is eighth-note
 * triplets, which are three to the beat — twelve steps. A trailing `t` is the
 * whole of the triplet syntax, because a triplet is a grid a person names rather
 * than a modifier they stack.
 */
export function gridShape(name: string): BarShape | null {
  const text = name.trim().toLowerCase();
  const triplet = text.endsWith('t');
  const base = Number(triplet ? text.slice(0, -1) : text);
  if (!Number.isInteger(base) || base <= 0) return null;
  // Four subdivisions to the beat is the default grid, so a bar is `base` steps
  // and a beat is a quarter of them; a triplet takes three of them where two sat.
  const steps = triplet ? (base * 3) / 2 : base;
  const stepsPerBeat = triplet ? (base * 3) / 8 : base / 4;
  if (!fits(steps, stepsPerBeat)) return null;
  return { steps, stepsPerBeat };
}

/**
 * The bar a meter asks for, or `null` when it is not one this app can say.
 *
 * `beats` is the top number of a time signature and `unit` its bottom: `meter 7 8`
 * is seven eighth notes, `meter 3 4` is a waltz. A beat is `unit` of a whole note,
 * so it is `STEPS_PER_WHOLE / unit` steps and the bar is `beats` of them.
 */
export function meterShape(beats: number, unit: number): BarShape | null {
  if (!Number.isInteger(beats) || beats < 1) return null;
  if (!METER_UNITS.includes(unit)) return null;
  const stepsPerBeat = STEPS_PER_WHOLE / unit;
  const steps = beats * stepsPerBeat;
  if (!fits(steps, stepsPerBeat)) return null;
  return { steps, stepsPerBeat };
}
