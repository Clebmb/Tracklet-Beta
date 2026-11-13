/**
 * SLICES — the chop points inside one recording.
 *
 * ── The problem this solves ────────────────────────────────────────────────
 * A break, a phrase, a drum loop is one file. Chopping it with the recorder means
 * eight files, eight loads and eight names, and then the song's channel can only
 * ever play one of them per note — so a chopped break is not an instrument, it is
 * a bank of unrelated one-shots.
 *
 * A slice list says "this recording is these pieces": `slice 1 0 0.42` then
 * `slice 1 0.42 0.9` and so on. On a sliced channel the note NUMBER picks the
 * piece — C-4 is the first, C#-4 the second, D-4 the third — which is the
 * convention every tracker with slices uses, and the reason a chop plays like a
 * keyboard rather than like a menu.
 *
 * ── Why seconds, and why a list of ranges ──────────────────────────────────
 * Seconds because that is what the recording itself is measured in, and a chop
 * point is a place in a waveform rather than a fraction of a bar: it must not move
 * when the tempo does. A list of `{start, end}` ranges rather than starts alone
 * because a person building a break is deciding where a piece ENDS — a tail that
 * rings into the next piece is a mistake you can hear, and a gap is silence you
 * can hear, so both ends are the author's.
 *
 * Nothing here knows what a `Sample` is beyond its length, and nothing here
 * touches audio: a slice resolves to a `SampleWindow`, which is the shape the
 * engine and the renderer already take.
 */

import type { SampleWindow } from './sample';

/** One piece of a recording, in the recording's own seconds. */
export interface Slice {
  /** Where the piece starts, in seconds from the recording's start. */
  start: number;
  /** Where it ends, in the same seconds. Always after `start`. */
  end: number;
}

/** How many pieces one channel may have. A break, chopped finely, and no more. */
export const MAX_SLICES = 32;

/** The MIDI note a sliced channel's first piece plays at — middle C, as ever. */
export const SLICE_ROOT_NOTE = 60;

/** Shorter than this is a click or a typing mistake, not a piece. */
export const MIN_SLICE_SECONDS = 0.01;

/** A piece the model can hold: ordered, at least `MIN_SLICE_SECONDS` long. */
export function clampSlice(start: number, end: number): Slice {
  const from = Number.isFinite(start) ? Math.max(0, start) : 0;
  const to = Number.isFinite(end) ? Math.max(from + MIN_SLICE_SECONDS, end) : from + MIN_SLICE_SECONDS;
  return { start: from, end: to };
}

/**
 * A slice list the model can hold: in TIME order, capped, nothing degenerate.
 *
 * Sorted by start rather than by the order it was written, because the list IS
 * the keyboard: piece 0 is C-4 whatever line wrote it, so two scripts that wrote
 * the same pieces in different orders must play the same instrument. A piece that
 * starts inside another is kept — an overlapping tail is a real thing to want —
 * and an empty one is dropped, because it can only ever be a click.
 */
export function tidySlices(slices: readonly Slice[]): Slice[] {
  return slices
    .filter((slice) => Number.isFinite(slice.start) && Number.isFinite(slice.end))
    .map((slice) => clampSlice(slice.start, slice.end))
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .slice(0, MAX_SLICES);
}

/**
 * The piece a note plays, or null for a channel with no slices and a note past the
 * end of the ones it has.
 *
 * Null rather than a fallback, because the two fallbacks are the caller's: the
 * engine plays the whole recording, and a test wants to see the miss on its own.
 */
export function sliceFor(slices: readonly Slice[] | undefined, midi: number): Slice | null {
  if (!slices || slices.length === 0) return null;
  const index = midi - SLICE_ROOT_NOTE;
  if (!Number.isInteger(index) || index < 0 || index >= slices.length) return null;
  return slices[index] ?? null;
}

/**
 * The window a note plays: the piece it lands on, or null to play the file whole.
 *
 * `loop: false` because a slice is a hit — the piece ends where the chop says,
 * rather than ringing the tail forever the way a trimmed take can. That is what
 * makes a break play as a break: every piece stops when the next one starts.
 */
/**
 * The SAME window, begun later: a seek inside the piece rather than the file.
 *
 * `percent` is of the window's own length, so a note on a slice skips a quarter
 * of THAT piece and not a quarter of the recording it came from. Clamped here as
 * well as at the model's door, because this is the last function before the
 * audio graph and a window that runs backwards would throw.
 */
export function seekWindow<T extends { start: number; end: number }>(window: T, percent: number): T {
  const amount = typeof percent === 'number' && Number.isFinite(percent) ? percent : 0;
  const fraction = Math.max(0, Math.min(95, amount)) / 100;
  if (fraction <= 0) return window;
  const start = window.start + (window.end - window.start) * fraction;
  if (!(start < window.end)) return window;
  return { ...window, start };
}

export function sliceWindowFor(slices: readonly Slice[] | undefined, midi: number): SampleWindow | null {
  const slice = sliceFor(slices, midi);
  if (slice === null) return null;
  return { start: slice.start, end: slice.end, loop: false, loopStart: slice.start, loopEnd: slice.end };
}
