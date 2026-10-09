/**
 * stepView — what a step CELL says, in both views of the pattern.
 *
 * `PatternGrid.ts` owns the frame: the gutter, the row window, the pooled text,
 * the playhead and the cursor. This file owns the CONTENT — the string one cell
 * shows and how solid it is — because the pattern has two views of the same
 * steps and the difference between them is exactly that question.
 *
 * ── The two views, and why there are two ────────────────────────────────────
 * The note grid (`F8` off) is a column per channel, and a drum hit wears its
 * name there: `KCK`, `SNR`, `HAT`, `WND`. That is enough to READ a beat and not
 * enough to SEE one — a kick and a hat are two columns that happen to hit on the
 * same steps, which is what a tracker has always looked like and what a drummer
 * does not think in.
 *
 * The drum view (`F8`) turns the panel into a LANE per drum of the kit, one row
 * per step, for the channel the cursor is on. A hit is a mark, a miss is a gap,
 * and a beat reads the way it is played. It also shows two things the note grid
 * has no room for: how HARD the hit is (`~40`) and how it is played (`>`, `*3`),
 * because a percussion step that rolls is the whole point of `hat*3` and a grid
 * that prints `HAT` for it hides the one character that matters.
 *
 * ── The rule that keeps the two honest ─────────────────────────────────────
 * A cell is either a HIT or a NOTE — the model makes that exclusive (`setCellDrum`
 * clears a chord, `setCellNotes` takes the drum off) — so the drum view has one
 * case that is not a hit at all: a note on a channel that also plays drums. A
 * note belongs to no LANE, so it is drawn in every lane at a dimmer alpha rather
 * than being filed under a drum it has nothing to do with. The row then says
 * \"there is something here, and it is not a hit\", which is true, and `F8` takes
 * you to the grid that spells it out.
 *
 * Phaser-free on purpose: a canvas-free test can check what a cell says without
 * a browser, and the arithmetic below is the kind that goes wrong quietly.
 */

import { clampVelocity, MAX_VELOCITY, cellText, type Cell } from '../model/song';
import { DRUMS, type DrumId } from '../model/drum';
import { SLIDE_CHAR, STUTTER_CHAR } from '../model/articulation';

/** The four lanes of the drum view, in the order they are drawn. */
export const DRUM_LANES = DRUMS;

/**
 * The mark a hit shows in its lane.
 *
 * `x` rather than a block or a dot: every drum machine a person has seen uses
 * it, the app's pixel font draws it at 8px without a doubt, and the LANE already
 * says which drum it is — so the character is free to say what SIZE the hit is
 * when the velocity or a gesture needs spelling out.
 */
export const HIT_CHAR = 'x';

/**
 * What an empty step shows, which is the grid's own three dots.
 *
 * Spelled here rather than imported because `cellText` builds it inline; the test
 * that pins the two together is what keeps them from drifting apart.
 */
export const EMPTY_STEP_TEXT = '...';

/** How solid an EMPTY step reads, in both views. */
export const EMPTY_ALPHA = 0.4;

/** How solid a note reads in the grid. */
export function cellAlpha(cell: Cell): number {
  if (cell.note === null) return EMPTY_ALPHA;
  return 0.45 + 0.55 * (clampVelocity(cell.velocity) / MAX_VELOCITY);
}

/** Which lane a drum belongs to, or -1 for no drum at all. */
export function laneIndex(drum: DrumId | null): number {
  if (drum === null) return -1;
  return DRUM_LANES.findIndex((lane) => lane.id === drum);
}

/** The drum a lane holds, or null for a lane that does not exist. */
export function laneDrum(lane: number): DrumId | null {
  return DRUM_LANES[lane]?.id ?? null;
}

/** The lane labels, for the grid's heading strip. */
export function laneLabels(): string[] {
  return DRUM_LANES.map((lane) => lane.short);
}

/**
 * A hit, spelled the way a note cell spells itself: the mark, then the gesture,
 * then the force.
 *
 * `x`, `x>`, `x*3`, `x~40`, `x>*4~70` — exactly the order `C-4>*3~40` uses, so a
 * person who has read one has read both. Full force says nothing (it is the
 * default), which is what keeps a plain beat three characters wide.
 */
export function hitText(cell: Cell): string {
  let out = HIT_CHAR;
  if (cell.slide) out += SLIDE_CHAR;
  if (cell.stutter > 1) out += `${STUTTER_CHAR}${cell.stutter}`;
  const velocity = clampVelocity(cell.velocity);
  if (velocity < MAX_VELOCITY) out += `~${velocity}`;
  return out;
}

/**
 * What one lane of one step shows.
 *
 * Three answers, and the order of the checks is the whole of it: a hit shows on
 * its OWN lane and leaves the other three empty, anything that is not a hit shows
 * `cellText` — the note's own spelling, the same in every lane — and an empty
 * step shows the three dots everywhere.
 */
export function drumCellText(cell: Cell, lane: number): string {
  const mine = laneIndex(cell.drum);
  if (mine >= 0) return mine === lane ? hitText(cell) : EMPTY_STEP_TEXT;
  return cellText(cell);
}

/** True when this lane holds the cell's hit, so the grid knows to colour it. */
export function drumCellLit(cell: Cell, lane: number): boolean {
  return laneIndex(cell.drum) === lane;
}

/**
 * How solid a lane cell is.
 *
 * A hit is as solid as it was struck, the way a note is, so force is visible
 * without a fourth character. An empty step keeps the faint `0.4` the grid has
 * always drawn, and so does the three lanes a hit is NOT on — `drumCellText` gave
 * them the empty step's dots, so they have to wear the empty step's weight or the
 * row would read as three things that are there and one that is. A note that is
 * not a hit is the one thing in this view that is neither, and it is dimmer than
 * any hit because percussion is what the lanes are for.
 */
export function drumCellAlpha(cell: Cell, lane: number): number {
  const mine = laneIndex(cell.drum);
  if (mine >= 0) return mine === lane ? cellAlpha(cell) : EMPTY_ALPHA;
  if (cell.note === null) return EMPTY_ALPHA;
  return cellAlpha(cell) * 0.65;
}
