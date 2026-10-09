/**
 * bounce — the region an export renders: the loop region.
 *
 * A song is a whole thing and an export is usually the whole thing, but a person
 * who wants the chorus of a track, the eight bars they just fixed, or a loop to
 * drop into a video does not want to cut the file up afterwards. That is what a
 * loop region is: `EXPORT AUDIO` and `EXPORT STEMS` render these bars and stop.
 *
 * ── It is a SESSION setting, not song data ───────────────────────────────────
 * The song is the whole song whether you bounce four bars of it or all of it, so
 * a region travels BESIDE the song exactly as the master `volume`, the `theme`
 * and `solo` do: nothing about it is in `Song`, no file carries one, and saving a
 * song you bounced once does not save the bounce. That is the same bargain those
 * three make, and for the same reason — a region is what you are DOING with the
 * song, and a file that imposed one would open somebody else's song with two
 * thirds of it missing.
 *
 * ── The words ────────────────────────────────────────────────────────────────
 * `export bars 8 to 15` sets it, `export all` takes it off, and the two hands it
 * has are the `L` key in `F3` (where a bar is a row you can point at) and the
 * EXPORT page's own row, which shows the region before anything renders. A
 * region is stored as WRITTEN and fitted to the order when it is used: a script
 * may say `export bars 8 to 15` above the `arrange` line that makes the song
 * fifteen bars long, so refusing it while parsing would refuse the honest script
 * and the answer at the end of it is the same either way.
 *
 * Phaser-free, like the rest of `model/`.
 */

import { patternRows, type Song } from './song';

/** A range of BARS of the order: 1-based, inclusive, `from <= to`. */
export interface BounceRange {
  /** The first bar of the region, counting from 1 like every bar in the app. */
  from: number;
  /** The last bar of the region, INCLUSIVE. `{ from: 3, to: 3 }` is one bar. */
  to: number;
}

/** The word the language writes a region with: `export bars 8 to 15`. */
export const BOUNCE_WORD = 'export';
/** The clause that names the region: `export bars 8 to 15`. */
export const BOUNCE_BARS_WORD = 'bars';
/** `export all`: the whole song again, which is what saying nothing means. */
export const BOUNCE_ALL_WORD = 'all';
/** The word between the two numbers, borrowed from `rows 0 to 3`. */
export const BOUNCE_TO_WORD = 'to';

/**
 * A range fitted to a song: 1-based, ordered, inside the order.
 *
 * Clamped rather than refused, and that is the point of doing it HERE rather than
 * while parsing: a script may name a region above the `arrange` line that makes
 * the order long enough for it, so the only moment a region can be checked is the
 * moment it is used. Turning `8 to 15` into `1 to 4` for a four-bar song is the
 * answer that renders something rather than nothing, and `bodyReach` below is
 * what tells the author it happened.
 */
export function fitBounce(range: BounceRange, bars: number): BounceRange {
  const last = Math.max(1, Math.round(bars));
  const ends = [Math.round(range.from), Math.round(range.to)].map((end) => Math.max(1, Math.min(last, end)));
  // Ordered as well as clamped, because one end may have been clamped further
  // than the other: `8 to 15` in a four-bar song is two ends that both become 4,
  // and `9 to 2` — which the parser refuses but a hand-edited file could hold —
  // is a range the two numbers still describe, just backwards.
  return { from: Math.min(ends[0] ?? 1, ends[1] ?? 1), to: Math.max(ends[0] ?? 1, ends[1] ?? 1) };
}

/** True when the region reaches past the end of the order. */
export function bounceReaches(range: BounceRange, bars: number): boolean {
  return Math.round(range.to) > Math.max(1, Math.round(bars));
}

/**
 * The steps a region covers, as a half-open span of the song's own step clock.
 *
 * The one conversion between BARS and STEPS in this feature, so the renderer, the
 * MIDI writer and the label cannot disagree: every pattern shares the song's grid,
 * so bar *n* begins at `(n - 1) × rows` and the region ends where the bar after
 * it begins. A null range is the whole song, which is what every caller did
 * before a region existed.
 */
export function bounceSteps(song: Song, range: BounceRange | null | undefined): { first: number; last: number } {
  const rows = Math.max(1, patternRows(song));
  const last = Math.max(1, song.order.length) * rows;
  if (!range) return { first: 0, last };
  const fitted = fitBounce(range, song.order.length);
  return { first: (fitted.from - 1) * rows, last: fitted.to * rows };
}

/** How many bars a region covers, once fitted. */
export function bounceBars(range: BounceRange | null | undefined, bars: number): number {
  if (!range) return Math.max(1, Math.round(bars));
  const fitted = fitBounce(range, bars);
  return fitted.to - fitted.from + 1;
}

/** `BARS 8-15`, `BAR 4`, or `THE WHOLE SONG` — what a screen and a status line print. */
export function bounceLabel(range: BounceRange | null | undefined, bars: number): string {
  if (!range) return 'THE WHOLE SONG';
  const fitted = fitBounce(range, bars);
  return fitted.from === fitted.to ? `BAR ${fitted.from}` : `BARS ${fitted.from}-${fitted.to}`;
}

/** The line that sets a region: `export bars 8 to 15`. */
export function bounceScript(range: BounceRange): string {
  const fitted = fitBounce(range, Math.max(range.from, range.to));
  return `${BOUNCE_WORD} ${BOUNCE_BARS_WORD} ${fitted.from} ${BOUNCE_TO_WORD} ${fitted.to}`;
}

/**
 * What the `L` key has been told so far, in `F3`.
 *
 * Two presses make a region and a third takes it off, and the state has to hold
 * the half-finished case: a region needs a beginning AND an end, and there is no
 * sensible default for the second one. It is data rather than a pair of fields
 * inside the menu so the rule below can be read — and tested — without a canvas.
 */
export type BounceMark =
  /** No region and nothing waiting: the whole song exports. */
  | { kind: 'none' }
  /** A beginning, waiting for the bar it ends on. */
  | { kind: 'start'; bar: number }
  /** A whole region. */
  | { kind: 'range'; range: BounceRange };

/** What the menu starts in, and what a cleared region returns to. */
export const NO_BOUNCE: BounceMark = { kind: 'none' };

/**
 * One press of `L` on a bar.
 *
 *   nothing  ->  the region begins here (the status line asks for the end)
 *   a start  ->  the region is finished (the two bars, in order, whichever way
 *                they were pointed at)
 *   a region ->  pressing on the bar it ENDS at takes it off, which is the only
 *                rule that needs no extra key: the mark you can see at that bar
 *                is the one you press, and anywhere else starts a new region.
 */
export function markBounce(mark: BounceMark, bar: number): BounceMark {
  const at = Math.max(1, Math.round(bar));
  if (mark.kind === 'none') return { kind: 'start', bar: at };
  if (mark.kind === 'start') {
    return { kind: 'range', range: { from: Math.min(mark.bar, at), to: Math.max(mark.bar, at) } };
  }
  if (at === mark.range.to) return NO_BOUNCE;
  return { kind: 'start', bar: at };
}

/** The region a mark stands for, or null while it is nothing or half-made. */
export function markedBounce(mark: BounceMark): BounceRange | null {
  return mark.kind === 'range' ? mark.range : null;
}

/** The mark that stands for a region, for a caller that has one and not the other. */
export function bounceMarkFor(range: BounceRange | null): BounceMark {
  return range ? { kind: 'range', range } : NO_BOUNCE;
}

/** One line for the `F3` status well, in the app's own voice. */
export function bounceMarkStatus(mark: BounceMark, bars: number): string {
  if (mark.kind === 'none') return 'LOOP OFF - THE WHOLE SONG EXPORTS.';
  if (mark.kind === 'start') return `LOOP STARTS AT BAR ${mark.bar} - PRESS L WHERE IT ENDS.`;
  return `LOOP ${bounceLabel(mark.range, bars)} - PRESS L ON BAR ${fitBounce(mark.range, bars).to} TO TAKE IT OFF.`;
}
