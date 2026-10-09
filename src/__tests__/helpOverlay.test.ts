/**
 * The F1 screen is a page of prose in two columns, and nothing on it wraps: a
 * row that outgrows its column runs into the next one, and a column that outgrows
 * the frame is drawn past the bottom of the canvas and lost. Neither shows up as
 * a failure anywhere else in the build, so both are budgets kept here — WIDTH and
 * HEIGHT.
 *
 * The width budgets are counted in CHARACTERS, because nothing in a headless
 * runner can measure a font: the widest row today is `INSTRUMENTS - WHAT IT CAN
 * SOUND LIKE` (34 characters, 193px of the 208px between its key column and the
 * next column) and the longest key label is `CLICK / SHIFT+CLICK` (19 of the
 * 128px the key column has).
 *
 * The height budget is arithmetic rather than a font measurement, because the
 * page is built out of whole lines: every row, title and gap is a multiple of
 * `LINE_H`, so the height of a column is a sum, and the sum can be compared with
 * the window the page is read through. That check did not exist, and the table
 * grew a row at a time until eleven of its rows — everything under `CHANNELS`,
 * all of `THE SONG`, all of `SCRIPT` — were drawn below y=405: invisible, on the
 * one screen whose entire job is to list what exists. Everything below is the
 * arithmetic that would have caught it, plus the scroll it made necessary.
 *
 * The numbers come from `helpBoard.ts`, which is Phaser-free and holds the same
 * table the view draws, so this file checks the page rather than a copy of it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COPY_TOP,
  HELP_COLUMNS,
  LINE_H,
  SECTION_GAP,
  VIEW,
  helpColumnHeight,
  helpColumnLines,
  helpContentHeight,
  helpPageLines,
  helpRowInView,
  helpScrollBy,
  helpScrollLimit,
} from '../ui/helpBoard';

const OVERLAY = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'HelpOverlay.ts');

const ROWS = HELP_COLUMNS.flatMap((column) => column.flatMap((section) => section.rows));

/** Room for the longest key label that fits, plus nothing to spare. */
const KEY_BUDGET = 22;
/** Room for the longest explanation that fits, measured from the widest one today. */
const ACTION_BUDGET = 36;

/** The tallest column's height, in pixels, which is what the window must reach. */
const CONTENT = helpContentHeight(HELP_COLUMNS);
/** How far the page scrolls, in pixels — always a whole number of lines. */
const LIMIT = helpScrollLimit(HELP_COLUMNS);

/** The y of every row and title, if the tallest column were drawn from the top. */
function latticedRows(): number[] {
  const lines = Math.max(...HELP_COLUMNS.map(helpColumnLines));
  return Array.from({ length: lines }, (_one, i) => COPY_TOP + i * LINE_H);
}

describe('the F1 controls menu', () => {
  it('finds its rows, so a rename cannot silently stop this checking anything', () => {
    expect(ROWS.length).toBeGreaterThan(30);
    expect(ROWS.every((row) => row.keys !== '' && row.action !== '')).toBe(true);
    expect(HELP_COLUMNS.length).toBe(2);
  });

  it('keeps every key label inside the key column', () => {
    const long = ROWS.filter((row) => row.keys.length > KEY_BUDGET);
    expect(long.map((row) => row.keys)).toEqual([]);
  });

  it('keeps every explanation inside the column the keys leave', () => {
    const long = ROWS.filter((row) => row.action.length > ACTION_BUDGET);
    expect(long.map((row) => row.action)).toEqual([]);
  });

  it('is taller than the window it is read through, which is why it scrolls', () => {
    expect(CONTENT).toBeGreaterThan(VIEW.height);
    expect(LIMIT).toBeGreaterThan(0);
    expect(LIMIT % LINE_H).toBe(0);
  });

  it('can bring the last row of the longest column into view', () => {
    const lastTop = COPY_TOP + Math.max(...HELP_COLUMNS.map(helpColumnLines)) * LINE_H - LINE_H;
    expect(helpRowInView(lastTop, LIMIT)).toBe(true);
    // ...and the scroll it takes to get there is inside the range.
    expect(lastTop + LINE_H - (VIEW.y + VIEW.height)).toBeLessThanOrEqual(LIMIT);
  });

  it('can bring every row of both columns into view at some scroll position', () => {
    const positions: number[] = [];
    for (let at = 0; at <= LIMIT; at += LINE_H) positions.push(at);
    const unreachable = latticedRows().filter((y) => !positions.some((at) => helpRowInView(y, at)));
    expect(unreachable).toEqual([]);
  });

  it('shows rows whole, never cut by the window', () => {
    const whole = latticedRows().every((y) =>
      Array.from({ length: LIMIT / LINE_H + 1 }, (_one, i) => i * LINE_H).every((at) => {
        if (!helpRowInView(y, at)) return true;
        const top = y - at;
        return top >= VIEW.y && top + LINE_H <= VIEW.y + VIEW.height;
      }),
    );
    expect(whole).toBe(true);
  });

  it('draws nothing outside the frame, at either end of the scroll', () => {
    for (const at of [0, LIMIT]) {
      const drawn = latticedRows().filter((y) => helpRowInView(y, at)).map((y) => y - at);
      expect(drawn.every((top) => top >= VIEW.y && top + LINE_H <= VIEW.y + VIEW.height)).toBe(true);
    }
  });

  it('clamps the scroll at both ends', () => {
    expect(helpScrollBy(0, -1, LIMIT)).toBe(0);
    expect(helpScrollBy(0, 1, LIMIT)).toBe(LINE_H);
    expect(helpScrollBy(LIMIT, 1, LIMIT)).toBe(LIMIT);
    expect(helpScrollBy(LIMIT, 999, LIMIT)).toBe(LIMIT);
    expect(helpScrollBy(0, -999, LIMIT)).toBe(0);
  });

  it('moves a wheel notch by a line and a page by whole lines', () => {
    expect(helpPageLines()).toBeGreaterThan(1);
    const page = helpScrollBy(0, helpPageLines(), LIMIT);
    expect(page % LINE_H).toBe(0);
    expect(page).toBeLessThanOrEqual(LIMIT);
  });

  it('keeps the air between sections on the line lattice', () => {
    // Every promise this file makes about whole rows rests on this: a gap that is
    // not a whole number of lines drifts the rows after it off the lattice, and a
    // scrolled window then cuts one in half. It was six pixels.
    expect(SECTION_GAP % LINE_H).toBe(0);
  });

  it('draws its rows from the board geometry, so the drawn page is the measured one', () => {
    const source = readFileSync(OVERLAY, 'utf8');
    // The row origin is the one place the two files must agree, and the overlay
    // cannot be built in a headless runner to check it — a second `+ 2` here is
    // a page that measures one thing and draws another.
    expect(source).toMatch(/let y = COPY_TOP;/);
    // The geometry is the board's to own: a copy of `LINE_H`, `MODAL` or `VIEW`
    // in the view is a second answer waiting to disagree with the first.
    for (const name of ['LINE_H', 'MODAL', 'VIEW', 'KEY_W', 'COL_W']) {
      expect(source).not.toMatch(new RegExp(`^const ${name}\\b`, 'm'));
    }
  });

  it('ends its two columns close together, so neither runs out early', () => {
    const heights = HELP_COLUMNS.map(helpColumnHeight);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(LINE_H * 4);
  });
});
