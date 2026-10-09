/**
 * pianoRoll — the pattern read as a PIANO ROLL: time across, pitch up.
 *
 * The note grid is the right view for a tracker and the wrong one for anyone who
 * has met music on a piano: a step's pitch is three characters in a cell, and a
 * melody is something you read rather than see. So the same model gets a second
 * reading. Nothing here is a second copy of anything — the notes come from the
 * same `Cell`s, the key from the same song — which is what makes it a VIEW rather
 * than a format.
 *
 * Pure and Phaser-free, like `stepView.ts` and `overview.ts`: this owns the
 * arithmetic (which pitch a y is, which step an x is, how much of the pattern
 * fits) and the view class owns the pixels.
 */

import { MIDI_MAX, MIDI_MIN, cellNotes, isInKey, type Pattern, type SongKey } from '../model';

/** The keyboard strip down the left edge. */
export const ROLL_GUTTER = 34;

/** How tall the roll is at least: an octave, so one held note still reads. */
export const MIN_ROLL_SPAN = 12;
/** And at most: three octaves, past which a row is a hairline. */
export const MAX_ROLL_SPAN = 36;
/** The narrowest a step column may get before the roll starts scrolling. */
export const MIN_STEP_W = 6;
/** What the roll falls back to when the channel has no notes yet. */
export const EMPTY_ROLL_CENTRE = 60; // C-4, the octave the app opens on.

/** Where the roll is showing, and how it maps to pixels. */
export interface RollLayout {
  /** The pitch drawn at the BOTTOM of the panel. */
  low: number;
  /** How many semitones tall the roll is. */
  span: number;
  /** The first step drawn, when the pattern is wider than the panel. */
  firstStep: number;
  /** How many step columns are drawn. */
  columns: number;
  /** The step column width and the pitch row height, in pixels. */
  stepW: number;
  rowH: number;
  width: number;
  height: number;
}

/** Every pitch this channel sounds anywhere in the pattern. */
export function channelPitches(pattern: Pattern, track: number): number[] {
  const pitches: number[] = [];
  for (const row of pattern.steps) {
    const cell = row[track];
    if (cell !== undefined) pitches.push(...cellNotes(cell));
  }
  return pitches;
}

/**
 * The pitch range to draw, as a `[low, high]` pair.
 *
 * Centred on the channel's own music and grown to at least an octave, so a part
 * that plays one note is not a single line across the middle of a three-octave
 * void — and clamped into the MIDI range, because the gutter has to be able to
 * label every row it draws.
 */
export function rollRange(pattern: Pattern, track: number, centre = EMPTY_ROLL_CENTRE): { low: number; high: number } {
  const pitches = channelPitches(pattern, track);
  const lowNote = pitches.length === 0 ? centre : Math.min(...pitches);
  const highNote = pitches.length === 0 ? centre + MIN_ROLL_SPAN - 1 : Math.max(...pitches);
  let low = lowNote;
  let high = highNote;
  // Grow symmetrically until the span is at least an octave.
  while (high - low + 1 < MIN_ROLL_SPAN) {
    if (low > MIDI_MIN) low -= 1;
    if (high - low + 1 < MIN_ROLL_SPAN && high < MIDI_MAX) high += 1;
  }
  // Then trim from the top if the part is wider than the roll may be, and clamp
  // into the note range — re-trimming after the clamp, since a part pressed
  // against the top of the range keeps its height rather than growing past MIDI.
  if (high - low + 1 > MAX_ROLL_SPAN) low = high - MAX_ROLL_SPAN + 1;
  low = Math.max(MIDI_MIN, low);
  high = Math.min(MIDI_MAX, high);
  if (high - low + 1 > MAX_ROLL_SPAN) low = high - MAX_ROLL_SPAN + 1;
  low = Math.max(MIDI_MIN, low);
  high = Math.max(low, high);
  return { low, high };
}

/**
 * Where the roll's window sits: which steps are drawn, and how wide they are.
 *
 * A 16-step bar fills the panel and the columns are generous; a 512-step song
 * cannot, so the columns stop shrinking at `MIN_STEP_W` and the window follows the
 * cursor instead — the same bargain the note grid makes vertically, turned on its
 * side.
 */
export function rollLayout(
  pattern: Pattern,
  track: number,
  cursorStep: number,
  width: number,
  height: number,
): RollLayout {
  const steps = Math.max(1, pattern.steps.length);
  const usable = Math.max(1, width - ROLL_GUTTER);
  const stepW = Math.max(MIN_STEP_W, Math.floor(usable / steps));
  const columns = Math.max(1, Math.min(steps, Math.floor(usable / Math.max(1, stepW))));
  const maxFirst = Math.max(0, steps - columns);
  const firstStep = Math.max(0, Math.min(maxFirst, cursorStep - Math.floor(columns / 2)));
  const { low, high } = rollRange(pattern, track);
  const span = Math.max(MIN_ROLL_SPAN, high - low + 1);
  const rowH = Math.max(1, height / span);
  return { low, span, firstStep, columns, stepW, rowH, width, height };
}

/**
 * The pitch a point in the roll's body is on.
 *
 * Clamped to the rows the roll DRAWS rather than to the note range: a click on
 * the very top pixel is the highest row on screen, not the highest note a song
 * could hold, or the wrong note would be written from a click nobody made.
 */
export function pitchAtY(y: number, layout: RollLayout): number {
  const fromTop = Math.floor(y / layout.rowH);
  const pitch = layout.low + (layout.span - 1 - fromTop);
  return Math.max(layout.low, Math.min(layout.low + layout.span - 1, pitch));
}

/** The top edge of a pitch's row, in panel coordinates. */
export function yForPitch(pitch: number, layout: RollLayout): number {
  return (layout.span - 1 - (pitch - layout.low)) * layout.rowH;
}

/** The step a point in the roll's body is on, or null when it is left of the roll. */
export function stepAtX(x: number, layout: RollLayout): number | null {
  if (x < ROLL_GUTTER) return null;
  const step = layout.firstStep + Math.floor((x - ROLL_GUTTER) / layout.stepW);
  return step < 0 ? null : step;
}

/** The left edge of a step's column, in panel coordinates. */
export function xForStep(step: number, layout: RollLayout): number {
  return ROLL_GUTTER + (step - layout.firstStep) * layout.stepW;
}

/** Is a pitch one the song's KEY uses? The roll tints the rows that are. */
export function pitchInKey(pitch: number, key: SongKey): boolean {
  return isInKey(pitch, key);
}
