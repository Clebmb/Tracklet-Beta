import {
  clampLiveQuantize,
  machineActive,
  machineBarCount,
  MAX_LIVE_QUANTIZE,
  MIN_LIVE_QUANTIZE,
  quantizeSpan,
  type Pattern,
  type Scene,
  type Song,
} from '../model';

/**
 * liveGrid — the arithmetic of the LIVE page's launch grid, as pure functions.
 *
 * The page is a grid: one ROW per scene, one COLUMN per channel, each cell the
 * pattern that channel plays in that scene (or silence). Nothing here draws: the
 * cursor, the cycling and the quantize choices are the arithmetic the view and its
 * guard both use, so a key press, a click and a test cannot disagree about what
 * "the next pattern" or "the next quantize" means.
 *
 * Kept beside the other board modules (`arrangerBoard`, `mixerBoard`) for the same
 * reason: the page is a VIEW, and the small decisions it makes on a key press are
 * worth checking without a canvas.
 */

/** Which cell the page is on: a SCENE row and a CHANNEL column, both 0-based. */
export interface LiveCursor {
  row: number;
  col: number;
}

/** The quantize values the strip offers, in the order `Q` cycles them. */
export const LIVE_QUANTIZE_CHOICES: readonly number[] = [0, 1, 2, 4, 8, 16];

/** How many scenes the grid can show, at least one row so there is always a cursor. */
export function liveRowCount(song: Song): number {
  return Math.max(1, song.scenes.length);
}

/** How many channels the grid can show, at least one column. */
export function liveColumnCount(song: Song): number {
  const channels = Math.max(1, song.tracks.length);
  // The drum machine is a column of the grid too, exactly as it is on the mixer,
  // but only when the song HAS one — a song with no machine has no column.
  return channels + (machineActive(song.machine) ? 1 : 0);
}

/** True when `col` is the drum-machine column (the one past the channels). */
export function isMachineColumn(song: Song, col: number): boolean {
  return machineActive(song.machine) && Math.round(col) === Math.max(1, song.tracks.length);
}

/** What a machine cell says: `B2` for a bar, `SILENT` for a scene that sits it out. */
export function machineBarLabel(bar: number | null): string {
  return bar === null ? 'SILENT' : `B${bar}`;
}

/**
 * The machine bar one step of cycling lands on.
 *
 * The same shape the pattern cycle has — silence → bar 1 → … → the machine's last
 * bar → silence — over the MACHINE's own bars rather than the song's patterns.
 */
export function cycleMachineBar(song: Song, bar: number | null, direction: number): number | null {
  const count = song.machine ? Math.max(1, machineBarCount(song.machine)) : 0;
  const current = bar === null || !Number.isFinite(bar) || Math.round(bar) < 1 || Math.round(bar) > count ? null : Math.round(bar);
  const at = current === null ? 0 : current;
  const span = count + 1;
  const steps = Math.max(1, Math.round(Math.abs(direction)));
  const next = ((at + (direction < 0 ? -steps : steps)) % span + span) % span;
  return next === 0 ? null : next;
}

/**
 * A cursor that is really ON the grid.
 *
 * Rows are held inside the scene list and columns inside the channel list, so a
 * cursor left over from a bigger song (or a song with no scenes at all) still
 * points at a cell that exists rather than one the page would draw off the edge.
 */
export function clampLiveCursor(song: Song, cursor: LiveCursor): LiveCursor {
  const rows = liveRowCount(song);
  const cols = liveColumnCount(song);
  const row = Math.max(0, Math.min(rows - 1, Math.round(cursor.row)));
  const col = Math.max(0, Math.min(cols - 1, Math.round(cursor.col)));
  return { row, col };
}

/** Move the cursor by a signed number of rows and columns, wrapping at the edges. */
export function moveLiveCursor(song: Song, cursor: LiveCursor, dRow: number, dCol: number): LiveCursor {
  const rows = liveRowCount(song);
  const cols = liveColumnCount(song);
  const at = clampLiveCursor(song, cursor);
  const row = ((at.row + dRow) % rows + rows) % rows;
  const col = ((at.col + dCol) % cols + cols) % cols;
  return { row, col };
}

/**
 * The clip one step of cycling lands on.
 *
 * The cycle is SILENCE -> pattern 1 -> pattern 2 -> ... -> the song's last pattern
 * -> silence, so a cell can be emptied as well as filled from the keyboard. The
 * count is the song's own pattern list, so cycling never invents a pattern the
 * song does not have — the same rule every list here keeps.
 */
export function cycleClip(song: Song, clip: number | null, direction: number): number | null {
  const count = Math.max(1, song.patterns.length);
  const current = clampClipToCount(clip, count);
  const steps = Math.max(1, Math.round(Math.abs(direction)));
  // The index runs over `count + 1` stops: silence is stop 0, pattern N is stop N.
  const at = current === null ? 0 : current;
  const span = count + 1;
  const next = ((at + (direction < 0 ? -steps : steps)) % span + span) % span;
  return next === 0 ? null : next;
}

/** A clip held inside the song's patterns, or silence for a number past the end. */
function clampClipToCount(clip: number | null, count: number): number | null {
  if (clip === null || !Number.isFinite(clip)) return null;
  const n = Math.round(clip);
  return n >= 1 && n <= count ? n : null;
}

/** What a cell says: `P3` for a clip, `..` for silence. */
export function cellText(clip: number | null): string {
  return clip === null ? '..' : `P${clip}`;
}

/** One scene's clips, as the grid reads them (silence past the channel count). */
export function sceneCells(song: Song, sceneIndex: number): (number | null)[] {
  const scene: Scene | undefined = song.scenes[Math.round(sceneIndex)];
  const cols = liveColumnCount(song);
  const channels = Math.max(1, song.tracks.length);
  const out: (number | null)[] = [];
  // The grid's columns are 0-based like every row and column here, and a scene's
  // `clips` are indexed the same way — the one place a channel is 0-based.
  for (let col = 0; col < channels; col++) {
    out.push(scene ? (scene.clips[col] ?? null) : null);
  }
  // The machine column, when the song has one, carries the scene's machine BAR.
  if (cols > channels) out.push(scene ? (scene.machine ?? null) : null);
  return out;
}

/** The next quantize value `Q` lands on, wrapping through the strip's choices. */
export function nextQuantize(current: number, direction: number): number {
  const at = LIVE_QUANTIZE_CHOICES.indexOf(clampLiveQuantize(current));
  const from = at >= 0 ? at : LIVE_QUANTIZE_CHOICES.indexOf(1);
  const span = LIVE_QUANTIZE_CHOICES.length;
  const next = ((from + (direction < 0 ? -1 : 1)) % span + span) % span;
  return LIVE_QUANTIZE_CHOICES[next];
}

/** The quantize label the strip shows: `1 BAR`, `4 BARS`, `NOW`. */
export function quantizeLabel(bars: number): string {
  const value = clampLiveQuantize(bars);
  if (value === 0) return 'NOW';
  return `${value} BAR${value === 1 ? '' : 'S'}`;
}

/** The quantize range, for a guard to pin against the model's own. */
export const LIVE_QUANTIZE_MIN = MIN_LIVE_QUANTIZE;
export const LIVE_QUANTIZE_MAX = MAX_LIVE_QUANTIZE;

/**
 * How far through the wait to the next launch we are, in BEATS.
 *
 * The status line's `n BEATS` and its pips are this: the beats already elapsed
 * inside the span the transport is in, and how many a span holds. `null` for
 * quantize `NOW`, which has no wait to count — the honest reading, because a span
 * of one step is a landing rather than a countdown.
 */
export function launchCountdown(step: number, bars: number, rowsPerBar: number, rowsPerBeat: number): { elapsed: number; total: number } | null {
  if (clampLiveQuantize(bars) === 0) return null;
  const span = quantizeSpan(bars, rowsPerBar);
  const at = Math.max(0, Math.floor(Number.isFinite(step) ? step : 0));
  const start = Math.floor(at / span) * span;
  const per = Math.max(1, Math.round(rowsPerBeat));
  const inside = at - start;
  return {
    elapsed: Math.floor(inside / per),
    total: Math.max(1, Math.round(span / per)),
  };
}

/** One note of a clip's preview: where it sits in the bar and at what pitch. */
export interface ClipNote {
  /** The step inside the pattern, 0-based. */
  step: number;
  /** Its pitch, so the preview shows the shape as well as the density. */
  pitch: number;
}

/**
 * The notes a clip draws: the selected channel's own column of the pattern it
 * plays, read from the song rather than copied — so a preview cannot go stale when
 * a pattern is edited. A silent cell, a pattern the song no longer has or a
 * channel that plays nothing there all answer with an empty list.
 */
export function clipPreview(song: Song, patternNumber: number | null, channel: number): ClipNote[] {
  if (patternNumber === null) return [];
  const pattern = song.patterns[Math.round(patternNumber) - 1] as Pattern | undefined;
  if (!pattern) return [];
  const out: ClipNote[] = [];
  pattern.steps.forEach((row, step) => {
    const cell = row[Math.round(channel)];
    if (cell && cell.note !== null) out.push({ step, pitch: cell.note });
  });
  return out;
}

/** How many steps a pattern has, for a preview's horizontal scale. */
export function patternStepCount(song: Song, patternNumber: number | null): number {
  if (patternNumber === null) return 0;
  const pattern = song.patterns[Math.round(patternNumber) - 1] as Pattern | undefined;
  return pattern ? Math.max(1, pattern.steps.length) : 0;
}
