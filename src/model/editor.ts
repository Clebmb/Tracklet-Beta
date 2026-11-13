/**
 * editor — the cursor and the edit operations, as pure rules.
 *
 * Phaser-free and, where it matters, mutation-free: navigation and queries
 * return new values, so the cursor can never drift out of bounds no matter
 * which key or click produced the move. The three WRITE helpers mutate the
 * pattern they are handed, because the app owns exactly one song and threading
 * a copy through every note-on would buy nothing.
 *
 * Keeping this here (rather than in the scene) is what lets the rules be unit
 * tested and reused by a future "undo", a piano-roll view or a qwerty macro.
 */

import type { DrumId } from './drum';
import { clampMidi } from './notes';
import { cellNotes, cellText, setCellDrum, setCellNotes, type Cell, type Pattern } from './song';

/** Where the edit cursor is: a row and a track column. */
export interface Cursor {
  row: number;
  track: number;
}

export function clampCursor(cursor: Cursor, pattern: Pattern, trackCount: number): Cursor {
  const rows = pattern.steps.length;
  const tracks = Math.max(1, trackCount);
  return {
    row: Math.max(0, Math.min(rows - 1, cursor.row)),
    track: Math.max(0, Math.min(tracks - 1, cursor.track)),
  };
}

/** Move the cursor by a delta and keep it in bounds. */
export function moveCursor(
  cursor: Cursor,
  deltaRow: number,
  deltaTrack: number,
  pattern: Pattern,
  trackCount: number,
): Cursor {
  return clampCursor(
    { row: cursor.row + deltaRow, track: cursor.track + deltaTrack },
    pattern,
    trackCount,
  );
}

/**
 * How far the cursor may step after a note: 0 stays on the row, 8 is a whole
 * half-bar at sixteen steps.
 *
 * The two ends are both real settings. `0` is how a chord or a drum fill gets
 * written into ONE step — the note lands, the cursor does not move, the next
 * note joins it — and `8` is how a four-on-the-floor is typed in one pass. A
 * number outside this range is not a step anybody types.
 */
export const MIN_EDIT_STEP = 0;
export const MAX_EDIT_STEP = 8;

/** A step the editor can actually take: a whole number in `0..8`, 1 by default. */
export function clampEditStep(step: number): number {
  if (!Number.isFinite(step)) return 1;
  return Math.max(MIN_EDIT_STEP, Math.min(MAX_EDIT_STEP, Math.round(step)));
}

/**
 * Move DOWN by the edit step after writing a note, the way a tracker does — it
 * turns typing a melody into one keystroke per note. Stops at the last row
 * rather than wrapping, so a fast run never silently teleports to the top.
 */
export function advanceByStep(
  cursor: Cursor,
  step: number,
  pattern: Pattern,
  trackCount: number,
): Cursor {
  return clampCursor(
    { row: cursor.row + clampEditStep(step), track: cursor.track },
    pattern,
    trackCount,
  );
}

/** One row, the step every tracker has until somebody says otherwise. */
export function advanceAfterWrite(cursor: Cursor, pattern: Pattern, trackCount: number): Cursor {
  return advanceByStep(cursor, 1, pattern, trackCount);
}

// --- reads ------------------------------------------------------------------

/** The cell at a cursor, or null when the position is off the grid. */
export function cellAt(pattern: Pattern, row: number, track: number): Cell | null {
  return pattern.steps[row]?.[track] ?? null;
}

/** The three-character label at a position (`C-4`, or `...`). */
export function cellLabelAt(pattern: Pattern, row: number, track: number): string {
  const cell = cellAt(pattern, row, track);
  return cell ? cellText(cell) : '...';
}

// --- writes -----------------------------------------------------------------

/**
 * Put ONE note in a cell, replacing everything that was there.
 *
 * Writing a note writes its whole self, which is the rule velocity and
 * articulation already follow: typing over a chord leaves a single note rather
 * than adding to it, because the alternative — a hand that presses a piano key
 * and finds the old chord still under the new note — is a cell nobody can empty
 * one keystroke at a time. A chord is written by a script (`C-4,E-4,G-4`), not by
 * a single key.
 */
export function writeNote(pattern: Pattern, row: number, track: number, midi: number): boolean {
  const cell = cellAt(pattern, row, track);
  const note = clampMidi(midi);
  if (!cell || (cell.note === note && cell.extra.length === 0)) return false;
  setCellNotes(cell, [note]);
  return true;
}

/**
 * Put a CHORD in ONE cell, replacing every note that was there.
 *
 * The one-cell form of a chord, and the reason a channel can be WIDE at all: on a
 * channel that holds enough notes at once, one gesture writes one cell of three
 * notes rather than three cells on three channels. It is `writeNote`'s rule one
 * scope out — the cell is written whole, so a chord over a chord replaces it — and
 * it REFUSES a chord wider than `capacity`, because a cell holding notes its
 * channel would thin out is a cell that lies about what it plays. The caller
 * answers a refusal by spreading the notes across the channels that follow.
 *
 * Returns true when something changed, like `writeNote`.
 */
export function writeChord(
  pattern: Pattern,
  row: number,
  track: number,
  midis: readonly number[],
  capacity: number,
): boolean {
  const cell = cellAt(pattern, row, track);
  if (!cell || midis.length === 0 || midis.length > capacity) return false;
  const held = cellNotes(cell);
  if (held.length === midis.length && midis.every((midi, i) => held[i] === midi)) return false;
  setCellNotes(cell, midis);
  return true;
}

/**
 * Put a DRUM HIT in one cell — what a click in the `F8` drum view writes.
 *
 * `writeNote`'s rule, one kind over: the cell is written whole, so a hit replaces
 * whatever note or chord was there, and a second click on the same drum is a
 * no-op rather than a second hit in a cell that holds one. A cell holds at most
 * one drum — it is a STEP, and a step is one hit — so a kick under a hat is
 * replaced by the hat rather than played with it; the place for two drums on one
 * step is two kit channels, which is what a kit channel per lane already means.
 *
 * Returns true when something changed, so the caller can bank one undo step for
 * exactly the clicks that wrote something.
 */
export function writeDrum(pattern: Pattern, row: number, track: number, drum: DrumId): boolean {
  const cell = cellAt(pattern, row, track);
  if (!cell || cell.drum === drum) return false;
  setCellDrum(cell, drum);
  return true;
}

/** Empty a cell — every note it holds. Returns true when something changed. */
export function clearCell(pattern: Pattern, row: number, track: number): boolean {
  const cell = cellAt(pattern, row, track);
  if (!cell || cell.note === null) return false;
  setCellNotes(cell, []);
  return true;
}

/** Empty every cell in a pattern. */
export function clearPattern(pattern: Pattern): void {
  for (const row of pattern.steps) for (const cell of row) setCellNotes(cell, []);
}
