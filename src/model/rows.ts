/**
 * rows — a RANGE OF STEPS, and the few things a range can be told to do.
 *
 * ── Why this is a grammar rather than one more generator ─────────────────────
 * Every other statement in this language names ONE place: a `note` names a row and
 * a channel, a `chord` names a row, a `layer` names a channel and a layer, a
 * `track` names a channel. The one shape the language never had was a RUN — "these
 * rows, this many of them" — and it turned out to be the thing five separate
 * ideas were waiting on:
 *
 * - `fill`, which fills a range of steps and so has to name one;
 * - a row-range `repeat`, which tiles a figure rather than a whole pattern;
 * - `octave`, which moves the pitches in a run of steps;
 * - `harmonize` and `variation`, which are transformations of a range of cells.
 *
 * So the range is the grammar and the transformations are modifiers on it, which
 * is §5's own order of preference (a new value on an existing statement, then a
 * modifier, then a verb, then a file format). This module is the arithmetic half:
 * what a range IS, whether it fits, and what shifting or tiling one does to a
 * pattern's cells. It is pure — no Phaser, no audio, no DOM — like the rest of
 * `model/`, so both the parser and a test can ask it the same questions.
 *
 * ── What it deliberately is NOT ──────────────────────────────────────────────
 * Not a selection, and not state: nothing here remembers the last range, because
 * this language has no hidden state and a statement that meant something different
 * depending on what came before it would be exactly that. A range is written on
 * the line that uses it, the way `automate ... bars 8 to 15` names its bars.
 *
 * Not a loop either (§9 keeps variables, loops and arithmetic out): `repeat 4` is
 * a NUMBER on a statement, expanded while the script is read, so the language
 * never grows an execution model — it grows a way of saying "that figure, four
 * times", which is one line of text an author could equally have typed out.
 */

import { MAX_STUTTER, MIN_STUTTER } from './articulation';
import { clampMidi } from './notes';
import { REPEAT_WORD } from './sections';
import { cellNotes, copyCell, setCellNotes, type Pattern } from './song';

/**
 * The word between the two ends of a range, spelled exactly as a lane spells its
 * bars (`bars 8 to 15`) — one idiom for "from here to there" rather than two.
 */
export const ROW_RANGE_WORD = 'to';

/** How many whole octaves one `octave up`/`octave down` may move a range. */
export const MIN_OCTAVE_SHIFT = 1;
export const MAX_OCTAVE_SHIFT = 8;

/**
 * How many times one `repeat N` may play its range IN ALL.
 *
 * `1` is not a repeat, so it is refused for the same reason `arrange` refuses
 * `repeat 1` and a cell refuses `*1`: a count that means nothing should not look
 * like a count that did. This is the floor only — where the ceiling is depends on
 * the pattern (a repeat has to FIT), so `repeatProblem` is what checks the top.
 */
export const MIN_ROW_REPEAT = 2;

/**
 * How many times one `roll N` retriggers each hit in its step.
 *
 * The range IS the stutter's own range (`articulation.ts`), and deliberately so:
 * a roll is nothing but a stutter written across a run of steps rather than on
 * one cell, so the two cannot drift apart — `MIN_STUTTER`/`MAX_STUTTER` are
 * imported rather than restated. `roll` on its own is the default below, because
 * every other transformation has a sensible one (`octave up` is one octave,
 * `repeat` needs a count that would be arbitrary) and "roll this bar" is a thing
 * a person says without naming a number.
 */
/** The word a range is told to retrigger its hits with. */
export const ROLL_WORD = 'roll';

export const MIN_ROLL_HITS = MIN_STUTTER;
export const MAX_ROLL_HITS = MAX_STUTTER;
export const DEFAULT_ROLL_HITS = 4;

/**
 * The word a range is told to play backwards.
 *
 * No count and no argument, because there is only one thing to reverse a run of
 * steps into: the run read the other way. It is the `rows` grammar's own gesture
 * rather than a new statement — `rows A to B reverse` names the run, and the word
 * says which way to read it.
 */
export const REVERSE_WORD = 'reverse';

/** What a range of steps can be told to do. */
export type RowTransformId = 'octave-up' | 'octave-down' | 'repeat' | 'roll' | 'reverse';

/** One transformation: how it is written, and what it does to the range. */
export interface RowTransform {
  id: RowTransformId;
  /** The words a person types, e.g. `octave up` — what a message lists. */
  words: string;
  /** One line, for the manifest: what this does to the steps it names. */
  what: string;
}

/**
 * The four transformations.
 *
 * One table, so the parser's refusal can list them, the manifest can publish them
 * and the docs cannot drift from either — and `repeat` reuses the word `arrange`
 * already uses for the same idea in a different scope, rather than inventing a
 * second name for "do that again". `roll` is `repeat`'s loud cousin: where
 * `repeat` tiles the FIGURE forward, `roll` retriggers each HIT inside the step it
 * is already on.
 */
export const ROW_TRANSFORMS: readonly RowTransform[] = [
  { id: 'octave-up', words: 'octave up', what: 'move every note up whole octaves' },
  { id: 'octave-down', words: 'octave down', what: 'move every note down whole octaves' },
  { id: 'repeat', words: REPEAT_WORD, what: 'play the range again from where it starts' },
  { id: 'roll', words: ROLL_WORD, what: 'retrigger every hit in the range inside its own step' },
  { id: 'reverse', words: REVERSE_WORD, what: 'read the range backwards — the last step first' },
];

/** The four, said the way a person types them. */
export const ROW_TRANSFORM_WORDS: readonly string[] = ROW_TRANSFORMS.map((one) => one.words);

/** A run of steps, both ends included. Rows count from 0, as the grid shows them. */
export interface RowRange {
  from: number;
  to: number;
}

/** `0 to 3`, for a message. */
export function rowRangeLabel(range: RowRange): string {
  return `${range.from} ${ROW_RANGE_WORD} ${range.to}`;
}

/** How many steps a range spans, both ends included. */
export function rowRangeLength(range: RowRange): number {
  return range.to - range.from + 1;
}

/**
 * Whether a range names any steps of a pattern `rows` long, or why it does not.
 *
 * Asked at PARSE time, from the same `steps` count the parser is already tracking,
 * so a range that falls off the end of the grid is a mistake with a line number
 * rather than a statement that quietly does nothing to the rows it could reach.
 */
export function rowRangeProblem(range: RowRange, rows: number): string | null {
  if (range.from > range.to) {
    return `a range of steps runs from an earlier row to a later one, e.g. "rows 0 to 3"; got "rows ${rowRangeLabel(range)}". Swap the two ends, or write two statements if the rows are not one run.`;
  }
  if (range.from < 0 || range.to >= rows) {
    return `a range of steps has to stay inside the pattern, rows 0..${rows - 1} (the grid shows rows 00..${rows - 1}); got "rows ${rowRangeLabel(range)}". "steps N" makes the grid longer.`;
  }
  return null;
}

/** Where `times` copies of a range end, exclusive — so it may be at most `rows`. */
export function repeatEnd(range: RowRange, times: number): number {
  return range.from + rowRangeLength(range) * times;
}

/**
 * Whether a repeat fits in the pattern, or the arithmetic that says it does not.
 *
 * The message spells the sum out (how many rows the figure is, how many times, how
 * many rows that needs) because the fix is almost always one of those three
 * numbers rather than a syntax lesson.
 */
export function repeatProblem(range: RowRange, times: number, rows: number): string | null {
  const end = repeatEnd(range, times);
  if (end > rows) {
    return `that is ${rowRangeLength(range)} rows played ${times} times in all, which needs ${end} rows; the pattern holds ${rows}. Start the range earlier, repeat it fewer times, or make the grid longer with "steps N".`;
  }
  return null;
}

/**
 * Move every note in a range by whole octaves, and answer with how many moved.
 *
 * A note that would leave the range Tracklet can name is CLAMPED rather than
 * refused, which is the rule every pitch this model computes already follows
 * (`clampMidi`, and the chord tool with it): the range is the safety guarantee,
 * and the worst an octave too many can do is a run that has arrived at the top.
 * Empty cells are left exactly as they are, and a note keeps its force and its
 * articulation — this changes the PITCH and nothing else, and it changes it for
 * EVERY note a cell holds: a chord moved by octaves is a chord, not its root.
 *
 * A DRUM is left exactly as it is, and that is a decision rather than an
 * oversight: percussion has no pitch to move — a hit's sound is a NAME the cell
 * carries and the note beside it is the kit's own (`drum.ts`) — so a range moved
 * up an octave keeps its beat where it is, which is what a real arrangement does
 * when a section rises. Moving the note alone would either desynchronise the hit
 * from the drum it names or quietly turn a kick into a melodic note.
 */
export function shiftRangeOctaves(pattern: Pattern, range: RowRange, octaves: number): number {
  let moved = 0;
  for (let row = range.from; row <= range.to; row += 1) {
    const cells = pattern.steps[row];
    if (!cells) continue;
    for (const cell of cells) {
      if (cell.drum !== null) continue;
      const notes = cellNotes(cell);
      if (notes.length === 0) continue;
      setCellNotes(cell, notes.map((midi) => clampMidi(midi + octaves * 12)));
      moved += notes.length;
    }
  }
  return moved;
}

/**
 * Retrigger every hit in a range `hits` times inside its own step, and answer
 * with how many hits were rolled.
 *
 * A ROLL is a stutter written across a run of steps rather than on one cell — a
 * drum roll, a trap hat, a dance snare fill — so this writes the same field the
 * `*N` suffix writes (`cell.stutter`) and adds no audio machinery at all: the
 * engine, the renderer and the MIDI writer already turn a stutter into evenly
 * spaced hits through `articulationHits`.
 *
 * A cell with no note is left exactly as it is, because there is nothing to
 * retrigger — a roll ornaments a figure, it does not invent one. A DRUM is rolled
 * like a note, which is the case a roll is mostly for: a snare does not "have a
 * pitch" but it does have hits. And the GRACE is taken off a cell that carries
 * one, deliberately: a grace and a stutter fill the same instant two ways (which
 * is why a cell may not write both), and a statement that says `roll` is the
 * statement about that instant — the same way re-typing a note over a slid one
 * takes the slide off rather than refusing to write the note.
 */
export function rollRange(pattern: Pattern, range: RowRange, hits: number): number {
  const count = Math.min(MAX_ROLL_HITS, Math.max(MIN_ROLL_HITS, Math.round(hits)));
  let rolled = 0;
  for (let row = range.from; row <= range.to; row += 1) {
    const cells = pattern.steps[row];
    if (!cells) continue;
    for (const cell of cells) {
      if (cellNotes(cell).length === 0 && cell.drum === null) continue;
      cell.stutter = count;
      cell.grace = 0;
      rolled += 1;
    }
  }
  return rolled;
}

/**
 * Read a range BACKWARDS — the last step first — and answer with how many notes
 * were moved.
 *
 * The run keeps its notes, its forces and its gestures; only the ORDER of the
 * steps changes. That is a swell played backwards (a shoegaze riser), a figure
 * that answers itself (A then its reverse), or the reversed tail of a sampled
 * break — and it is the one transformation a range can do that needs no number,
 * because there is exactly one way to read a run the other way.
 *
 * The rows are COPIED OUT before anything is written, for the reason `repeatRange`
 * copies: a range is read as the author wrote it, not as it is being rearranged
 * under the loop. An empty step reverses like any other, which is what makes a
 * `reverse` of a figure with rests sound like the figure backwards rather than
 * like a figure with its rests dropped.
 */
export function reverseRange(pattern: Pattern, range: RowRange): number {
  const length = rowRangeLength(range);
  const source = pattern.steps
    .slice(range.from, range.to + 1)
    .map((row) => row.map((cell) => copyCell(cell)));
  let moved = 0;
  for (let i = 0; i < length; i += 1) {
    const target = pattern.steps[range.from + i];
    const from = source[length - 1 - i];
    for (let track = 0; track < from.length; track += 1) {
      if (!target[track]) continue;
      target[track] = from[track];
      moved += cellNotes(from[track]).length;
    }
  }
  return moved;
}

/**
 * Play a range `times` times in all, forward from where it starts, and answer with
 * how many notes were written.
 *
 * The source rows are COPIED OUT before anything is written, so a range that
 * overlaps its own output still repeats the figure the author wrote rather than
 * the rows it has just overwritten — the same reason `copyPattern` copies a
 * pattern rather than aliasing its rows. Everything a cell carries travels with
 * it: the pitch, the force it is hit at, a slide, a stutter. A repeat is a repeat.
 */
export function repeatRange(pattern: Pattern, range: RowRange, times: number): number {
  const length = rowRangeLength(range);
  const source = pattern.steps
    .slice(range.from, range.to + 1)
    .map((row) => row.map((cell) => copyCell(cell)));
  let written = 0;
  for (let i = 1; i < times; i += 1) {
    for (let k = 0; k < length; k += 1) {
      const target = pattern.steps[range.from + length * i + k];
      if (!target) continue;
      source[k].forEach((cell, track) => {
        if (!target[track]) return;
        // `copyCell` rather than four assignments, so a cell that grows a field
        // (a chord, a drum, a nibble) is copied by the same code that copies a
        // PATTERN — a repeat that quietly dropped a column is the worst bug a
        // music app can have, because it sounds almost right.
        target[track] = copyCell(cell);
        written += cellNotes(cell).length;
      });
    }
  }
  return written;
}
