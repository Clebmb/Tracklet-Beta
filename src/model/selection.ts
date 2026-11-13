/**
 * selection — a BLOCK of cells, and the three things a block can do.
 *
 * A cursor is one cell; a selection is the rectangle between two of them. It is
 * deliberately the same idea `rows` already has on the script side — which steps,
 * then what happens to them — so a mouse and a script describe one region the
 * same way and a transform written for one works on the other.
 *
 * The rectangle lives here rather than in the scene because the three things that
 * go wrong with a hand-rolled block edit are all geometry: which corner is the
 * top, what happens at the pattern's edge, and what a copy does when the block
 * runs past it. One place answers those, so the grid's highlight and the
 * clipboard can never disagree about what is selected.
 */

import type { Cursor } from './editor';
import { copyCell, emptyCell, setCellNotes, type Cell, type Pattern } from './song';

/**
 * Two corners of a block. Either may be the one the cursor sits on — dragging up
 * and to the left is a selection like any other, and normalising it here is what
 * keeps `paste` from needing to care which way the hand went.
 */
export interface Selection {
  anchor: Cursor;
  head: Cursor;
}

/** A selection with its corners in order: the top row is always `top`. */
export interface Block {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function selectionBlock(sel: Selection): Block {
  return {
    top: Math.min(sel.anchor.row, sel.head.row),
    bottom: Math.max(sel.anchor.row, sel.head.row),
    left: Math.min(sel.anchor.track, sel.head.track),
    right: Math.max(sel.anchor.track, sel.head.track),
  };
}

/** How many rows a selection covers — 1 for a single cell, never 0. */
export function selectionRows(sel: Selection): number {
  const block = selectionBlock(sel);
  return block.bottom - block.top + 1;
}

/** How many channels a selection covers — 1 for a single cell, never 0. */
export function selectionTracks(sel: Selection): number {
  const block = selectionBlock(sel);
  return block.right - block.left + 1;
}

/** A selection covering the whole pattern, which is what `Ctrl+A` means. */
export function selectAll(pattern: Pattern, trackCount: number): Selection {
  return {
    anchor: { row: 0, track: 0 },
    head: {
      row: Math.max(0, pattern.steps.length - 1),
      track: Math.max(0, Math.max(1, trackCount) - 1),
    },
  };
}

/** Whether a cell is inside the block — the grid's highlight asks this per cell. */
export function inBlock(block: Block, row: number, track: number): boolean {
  return row >= block.top && row <= block.bottom && track >= block.left && track <= block.right;
}

/**
 * The cells of a block, as copies, top-left first.
 *
 * Copies rather than references, because a clipboard that aliased the song would
 * be a clipboard that changed when the song did — paste a bar, edit the bar,
 * paste again, and the second paste would carry the edit. The row is the outer
 * array so a block keeps its shape: a selection two rows tall pastes two rows
 * tall, on any channel, in any pattern.
 */
export function copyBlock(pattern: Pattern, sel: Selection): Cell[][] {
  const block = selectionBlock(sel);
  const cells: Cell[][] = [];
  for (let row = block.top; row <= block.bottom; row++) {
    const line: Cell[] = [];
    for (let track = block.left; track <= block.right; track++) {
      const cell = pattern.steps[row]?.[track];
      line.push(cell ? copyCell(cell) : emptyCell());
    }
    cells.push(line);
  }
  return cells;
}

/**
 * Empty every cell a block covers — what `cut` leaves behind, and what `Delete`
 * on a selection does.
 *
 * A cell is emptied through the same writers a keystroke uses, so a cut leaves
 * exactly what pressing Backspace on each cell would: no notes, no stop, no drum.
 * The velocity and the other play-fields stay, because they are the cell's
 * SETTINGS rather than its content — the same reason emptying a step by hand
 * leaves its force alone.
 */
export function clearBlock(pattern: Pattern, sel: Selection): number {
  const block = selectionBlock(sel);
  let cleared = 0;
  for (let row = block.top; row <= block.bottom; row++) {
    for (let track = block.left; track <= block.right; track++) {
      const cell = pattern.steps[row]?.[track];
      if (!cell || (cell.note === null && (cell.gesture ?? null) === null)) continue;
      setCellNotes(cell, []);
      cleared++;
    }
  }
  return cleared;
}

/**
 * Write a block of cells at a position, its top-left on `at`.
 *
 * The write is CLIPPED at the pattern's edge rather than refused: a bar pasted
 * one row from the bottom fills the rows it can and says how many it took, which
 * is what a hand expects from a paste that lands partly off the grid — refusing
 * the whole thing would leave nothing behind and no explanation, and wrapping to
 * the top would move music nobody asked to move.
 *
 * Everything is written, blanks included: a paste REPLACES the block it lands on.
 * The alternative — a paste that skips empty cells and leaves what was under them
 * — is the "merge" a tracker's block paste is deliberately not.
 */
export function pasteBlock(pattern: Pattern, at: Cursor, cells: readonly (readonly Cell[])[]): number {
  let written = 0;
  for (const { target, from } of pasteTargets(pattern, at, cells)) {
    if (sameCell(target, from)) continue;
    const copy = copyCell(from);
      target.note = copy.note;
      target.extra = copy.extra;
      target.drum = copy.drum;
      target.gesture = copy.gesture;
    target.velocity = copy.velocity;
    target.slide = copy.slide;
    target.stutter = copy.stutter;
    target.grace = copy.grace;
    target.bend = copy.bend;
    written++;
  }
  return written;
}

/**
 * Whether a paste at this position would change anything.
 *
 * Asked BEFORE the write, and it is what keeps a paste of the block you just
 * copied onto itself from spending an undo step — a history full of steps that
 * changed nothing is a history you cannot step back through in one press.
 */
export function blockDiffers(pattern: Pattern, at: Cursor, cells: readonly (readonly Cell[])[]): boolean {
  return pasteTargets(pattern, at, cells).some(({ target, from }) => !sameCell(target, from));
}

/** Every cell a paste would write, with the copy it would write into it. */
function pasteTargets(
  pattern: Pattern,
  at: Cursor,
  cells: readonly (readonly Cell[])[],
): { target: Cell; from: Cell }[] {
  const tracks = pattern.steps[at.row]?.length ?? 0;
  const pairs: { target: Cell; from: Cell }[] = [];
  for (let i = 0; i < cells.length; i++) {
    const row = at.row + i;
    if (row < 0 || row >= pattern.steps.length) continue;
    const line = pattern.steps[row];
    const source = cells[i];
    for (let j = 0; j < source.length; j++) {
      const track = at.track + j;
      if (track < 0 || track >= tracks) continue;
      const target = line[track];
      const from = source[j];
      if (!target || !from) continue;
      pairs.push({ target, from });
    }
  }
  return pairs;
}

/** Whether two cells hold the same thing, for "did this paste change anything". */
function sameCell(a: Cell, b: Cell): boolean {
  if (a.note !== b.note || a.drum !== b.drum || (a.gesture ?? null) !== (b.gesture ?? null)) return false;
  if (a.velocity !== b.velocity || a.slide !== b.slide || a.stutter !== b.stutter) return false;
  if (a.grace !== b.grace || a.bend !== b.bend) return false;
  if (a.extra.length !== b.extra.length) return false;
  return a.extra.every((note, i) => note === b.extra[i]);
}
