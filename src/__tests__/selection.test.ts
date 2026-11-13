import { describe, expect, it } from 'vitest';

import {
  applyScript,
  blockDiffers,
  clearBlock,
  copyBlock,
  createSong,
  DEFAULT_VELOCITY,
  inBlock,
  pasteBlock,
  selectAll,
  selectionBlock,
  selectionRows,
  selectionTracks,
  setCellDrum,
  setCellNotes,
  setCellStop,
  type Pattern,
  type Song,
} from '../model';

/**
 * A block of cells: which corners it has, what a copy of it holds, and what a
 * paste does at the pattern's edge.
 *
 * The geometry is the part worth testing on its own. A highlight that disagrees
 * with a clipboard is the kind of bug a person blames on the app never working,
 * because the screen said one thing and the paste did another.
 */

function applied(source: string): Song {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song;
}

/** Four rows on two channels, with a note on the first cell of the first. */
function twoByFour(): Pattern {
  return applied('tracks 2\nsteps 4\nnote 0 1 C-4').patterns[0];
}

const at = (row: number, track: number): { row: number; track: number } => ({ row, track });

describe('the block, as geometry', () => {
  it('orders its corners however the hand drew them', () => {
    const block = selectionBlock({ anchor: at(3, 1), head: at(1, 0) });
    expect(block).toEqual({ top: 1, bottom: 3, left: 0, right: 1 });
  });

  it('counts both ends, so one cell is one row and one channel', () => {
    const one = { anchor: at(2, 1), head: at(2, 1) };
    expect(selectionRows(one)).toBe(1);
    expect(selectionTracks(one)).toBe(1);
    const block = { anchor: at(0, 0), head: at(3, 1) };
    expect(selectionRows(block)).toBe(4);
    expect(selectionTracks(block)).toBe(2);
  });

  it('selects everything, including the last row and last channel', () => {
    const pattern = twoByFour();
    const all = selectAll(pattern, 2);
    expect(selectionBlock(all)).toEqual({ top: 0, bottom: 3, left: 0, right: 1 });
  });

  it('knows what it covers and what it does not', () => {
    const block = { top: 1, bottom: 2, left: 1, right: 1 };
    expect(inBlock(block, 1, 1)).toBe(true);
    expect(inBlock(block, 2, 1)).toBe(true);
    expect(inBlock(block, 0, 1)).toBe(false);
    expect(inBlock(block, 1, 0)).toBe(false);
  });
});

describe('a copy', () => {
  it('keeps the shape of the block, row by row', () => {
    const pattern = twoByFour();
    const cells = copyBlock(pattern, { anchor: at(0, 0), head: at(1, 1) });
    expect(cells.length).toBe(2);
    expect(cells[0].length).toBe(2);
    expect(cells[0][0].note).toBe(60);
    expect(cells[0][1].note).toBe(null);
  });

  it('is a copy, not a second name for the same cells', () => {
    const pattern = twoByFour();
    setCellNotes(pattern.steps[1][0], [64, 67]);
    const cells = copyBlock(pattern, { anchor: at(1, 0), head: at(1, 0) });
    cells[0][0].extra.push(72);
    expect(pattern.steps[1][0].extra).toEqual([67]);
  });

  it('carries a stop and a drum, because a block is whatever was selected', () => {
    const pattern = twoByFour();
    setCellStop(pattern.steps[1][0], 'off');
    setCellDrum(pattern.steps[2][0], 'kick');
    const cells = copyBlock(pattern, { anchor: at(1, 0), head: at(2, 0) });
    expect(cells[0][0].gesture).toBe('off');
    expect(cells[1][0].drum).toBe('kick');
    expect(cells[1][0].note).not.toBe(null);
  });

  it('reads past the end of a pattern as empty rather than throwing', () => {
    const pattern = twoByFour();
    const cells = copyBlock(pattern, { anchor: at(0, 0), head: at(9, 4) });
    expect(cells.length).toBe(10);
    expect(cells[9][0].note).toBe(null);
  });
});

describe('a cut', () => {
  it('empties every note and stop it covers, and leaves the force alone', () => {
    const pattern = twoByFour();
    setCellNotes(pattern.steps[0][0], [60, 64]);
    setCellStop(pattern.steps[1][0], 'cut');
    pattern.steps[0][1].velocity = 40;
    // Two cells held something; the third held only a force, and a cell with
    // nothing in it is already cleared.
    const cleared = clearBlock(pattern, { anchor: at(0, 0), head: at(1, 1) });
    expect(cleared).toBe(2);
    expect(pattern.steps[0][0].note).toBe(null);
    expect(pattern.steps[0][0].extra).toEqual([]);
    expect(pattern.steps[1][0].gesture).toBe(null);
    // The velocity is the cell's SETTING, not its content: emptying a step by
    // hand has always left it, so a cut does too.
    expect(pattern.steps[0][1].velocity).toBe(40);
  });

  it('says it cleared nothing when the block was already empty', () => {
    const pattern = twoByFour();
    expect(clearBlock(pattern, { anchor: at(2, 0), head: at(3, 1) })).toBe(0);
  });
});

describe('a paste', () => {
  it('lands its top-left on the cursor and keeps the block whole', () => {
    const pattern = twoByFour();
    const cells = copyBlock(pattern, { anchor: at(0, 0), head: at(1, 0) });
    const written = pasteBlock(pattern, at(2, 0), cells);
    // Row 1 of the block was empty and the row it lands on is empty too, so the
    // count is of CELLS CHANGED rather than cells visited — a paste that says
    // "two cells" where nothing moved would be a paste you check twice.
    expect(written).toBe(1);
    expect(pattern.steps[2][0].note).toBe(60);
    expect(pattern.steps[3][0].note).toBe(null);
  });

  it('clips at the edge instead of wrapping or refusing', () => {
    const pattern = twoByFour();
    // A four-row block of real notes, so the clip is what decides how many land.
    for (let row = 0; row < 4; row++) setCellNotes(pattern.steps[row][0], [60 + row]);
    const cells = copyBlock(pattern, { anchor: at(0, 0), head: at(3, 0) });
    const written = pasteBlock(pattern, at(2, 0), cells);
    expect(written).toBe(2);
    expect(pattern.steps[2][0].note).toBe(60);
    expect(pattern.steps[3][0].note).toBe(61);
    // Nothing wrapped to the top: the cells that were not written are untouched.
    expect(pattern.steps[0][0].note).toBe(60);
  });

  it('replaces what it lands on, blanks included', () => {
    const pattern = twoByFour();
    const blank = copyBlock(pattern, { anchor: at(2, 0), head: at(2, 0) });
    const written = pasteBlock(pattern, at(0, 0), blank);
    expect(written).toBe(1);
    expect(pattern.steps[0][0].note).toBe(null);
  });

  it('knows whether it would change anything, so a no-op spends no undo step', () => {
    const pattern = twoByFour();
    const cells = copyBlock(pattern, { anchor: at(0, 0), head: at(1, 1) });
    expect(blockDiffers(pattern, at(0, 0), cells)).toBe(false);
    expect(blockDiffers(pattern, at(1, 0), cells)).toBe(true);
  });

  it('does not touch cells it was not given', () => {
    const pattern = twoByFour();
    const cells = copyBlock(pattern, { anchor: at(0, 0), head: at(0, 0) });
    pasteBlock(pattern, at(3, 1), cells);
    expect(pattern.steps[3][0].note).toBe(null);
    expect(pattern.steps[3][1].note).toBe(60);
    expect(pattern.steps[0][0].note).toBe(60);
  });

  it('copies a chord as a chord', () => {
    const pattern = twoByFour();
    setCellNotes(pattern.steps[1][0], [60, 64, 67]);
    const cells = copyBlock(pattern, { anchor: at(1, 0), head: at(1, 0) });
    pasteBlock(pattern, at(2, 0), cells);
    expect(pattern.steps[2][0].note).toBe(60);
    expect(pattern.steps[2][0].extra).toEqual([64, 67]);
  });
});

describe('the default a fresh cell keeps', () => {
  it('is the force a note is written at', () => {
    const pattern = twoByFour();
    expect(pattern.steps[0][0].velocity).toBe(DEFAULT_VELOCITY);
  });
});
