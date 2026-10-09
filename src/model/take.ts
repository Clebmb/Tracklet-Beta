/**
 * take — a recording you have captured, and the window it plays through.
 *
 * ── Why this is not in the song ─────────────────────────────────────────────
 * A recording lives in the APP (`src/model/sample.ts`): the bytes are megabytes
 * and a song is a few kilobytes of text, so a song holds only a NAME. A **take**
 * is the other half of that bargain — the thing the RECORDER page shows while you
 * are still deciding. It is the same recording, described well enough to draw:
 * how long it is, how loud its peak was, and where its TRIM and LOOP points sit.
 *
 * Like the bank, a take is **app state**. `sample NAME` on a track line is still
 * the only thing that reaches the song, so trimming a take never changes a file
 * and no file version moves. A take that is never given to a channel simply sits
 * in the app, the way a loaded sample you never name does.
 *
 * ── Trim is a WINDOW, never a rewrite ───────────────────────────────────────
 * `trimStart`/`trimEnd` are seconds from the take's own start, and they say which
 * part of the recording is USED — not a cut made to your `.wav`. The same honesty
 * the rest of the app keeps about what it can and cannot do: the file you loaded
 * is untouched, and the window is applied whenever the take plays.
 *
 * ── Everything here is arithmetic ───────────────────────────────────────────
 * The module is Phaser-free and audio-free, exactly like `sample.ts` beside it:
 * the engine decides what a frame becomes, and the page draws what the numbers
 * say. That is what makes trimming and looping testable without a browser.
 */

import {
  MAX_SAMPLE_SECONDS,
  MIN_SAMPLE_SECONDS,
  sameSampleName,
  sampleNameProblem,
  sampleSeconds,
  tidySampleName,
  type Sample,
  type SampleWindow,
} from './sample';

/**
 * Where a take came from: the microphone, or a file you loaded.
 *
 * The page shows it on every card, because "did I play this or did I drop it
 * in?" is the first thing a person asks of a list of takes — and because the
 * two are made by different gestures (`RECORD`, `IMPORT AUDIO`) and it is worth
 * being able to see which one made a given recording at a glance.
 */
export type TakeOrigin = 'recorded' | 'imported';

/** One captured take, as the RECORDER page reads it. */
export interface Take {
  /** The name a song writes with `sample NAME`, exactly as the bank stores it. */
  name: string;
  /** How this take arrived: from the microphone, or from a loaded file. */
  origin: TakeOrigin;
  /** How long the whole recording is, in seconds. */
  seconds: number;
  /** The loudest sample in it, 0..1, for the meter and the waveform's scale. */
  peak: number;
  /** Where the used window starts, in seconds from the take's own start. */
  trimStart: number;
  /** Where the used window ends, in seconds from the take's own start. */
  trimEnd: number;
  /** Where a loop starts, in seconds — inside the trim window. */
  loopStart: number;
  /** Where a loop ends, in seconds — inside the trim window. */
  loopEnd: number;
}

/** A trim window resolved to ordered, clamped seconds. */
export interface TakeWindow {
  start: number;
  end: number;
  seconds: number;
}

/** Loop points resolved to ordered, clamped seconds inside the window. */
export interface TakeLoopPoints {
  start: number;
  end: number;
  seconds: number;
}

/** The longest a take may be — the sample bank's own cap, for the same reason. */
export const MAX_TAKE_SECONDS = MAX_SAMPLE_SECONDS;

/** The shortest a take may be. */
export const MIN_TAKE_SECONDS = MIN_SAMPLE_SECONDS;

/**
 * The shortest a used window may be.
 *
 * A window of zero length is a take that plays nothing, which is never what a
 * person meant — so a trim that would collapse the window is widened to this, and
 * a loop shorter than it is treated as no loop rather than as a stutter.
 */
export const MIN_TAKE_WINDOW_SECONDS = 0.05;

/** How close two times must be to be the same, for the "is it trimmed" question. */
const TIME_EPSILON = 1e-4;

/** Clamp a time into `0..seconds`, turning a non-number into 0. */
export function clampTakeTime(value: number, seconds: number): number {
  const length = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), length);
}

/** Two take names mean the same recording, in any case — the bank's own rule. */
export function sameTakeName(a: string, b: string): boolean {
  return sameSampleName(a, b);
}

/** True when a name is one the bank and a song can both spell. */
export function isTakeName(name: string): boolean {
  return sampleNameProblem(tidySampleName(name)) === null;
}

/**
 * A fresh take over a whole recording: the full window, and no loop.
 *
 * The default a capture produces before anyone has touched a handle — trim from
 * the start to the end, and loop points that span the whole window, which
 * `takeLoop` reads as "play it through".
 */
export function makeTake(name: string, seconds: number, peak: number, origin: TakeOrigin = 'recorded'): Take {
  const length = clampTakeTime(seconds, MAX_TAKE_SECONDS);
  return {
    name: tidySampleName(name),
    origin,
    seconds: length,
    peak: Math.min(Math.max(Number.isFinite(peak) ? peak : 0, 0), 1),
    trimStart: 0,
    trimEnd: length,
    loopStart: 0,
    loopEnd: length,
  };
}

/**
 * The window a take plays through: `trimStart..trimEnd`, ordered and clamped.
 *
 * The values are read in either order — dragging the end handle past the start is
 * a thing a hand does — so the window is always the ordered pair, never a
 * backwards span.
 */
export function takeWindow(take: Take): TakeWindow {
  const raw = [clampTakeTime(take.trimStart, take.seconds), clampTakeTime(take.trimEnd, take.seconds)];
  const start = Math.min(raw[0], raw[1]);
  const end = Math.max(raw[0], raw[1]);
  return { start, end, seconds: end - start };
}

/** How long the used window is, in seconds. */
export function takeWindowSeconds(take: Take): number {
  return takeWindow(take).seconds;
}

/** True when the window is narrower than the whole recording. */
export function takeIsTrimmed(take: Take): boolean {
  const window = takeWindow(take);
  return window.start > TIME_EPSILON || window.end < take.seconds - TIME_EPSILON;
}

/**
 * The take's loop, or null when it plays straight through.
 *
 * Loop points equal to the whole window are what a fresh take carries and what a
 * person means by "not looped", so they read as no loop rather than as a loop over
 * everything. A loop outside the window is clamped to it, and a loop shorter than
 * `MIN_TAKE_WINDOW_SECONDS` is no loop either — a stutter is a mistake, not a
 * setting.
 */
export function takeLoop(take: Take): TakeLoopPoints | null {
  const window = takeWindow(take);
  const raw = [clampTakeTime(take.loopStart, take.seconds), clampTakeTime(take.loopEnd, take.seconds)];
  const start = Math.min(raw[0], raw[1]);
  const end = Math.max(raw[0], raw[1]);
  const seconds = end - start;
  if (seconds < MIN_TAKE_WINDOW_SECONDS) return null;
  // A loop that spans the whole window is the "no loop" the default carries.
  if (start <= window.start + TIME_EPSILON && end >= window.end - TIME_EPSILON) return null;
  const inside: TakeLoopPoints = {
    start: Math.max(start, window.start),
    end: Math.min(end, window.end),
    seconds: 0,
  };
  inside.seconds = inside.end - inside.start;
  if (inside.seconds < MIN_TAKE_WINDOW_SECONDS) return null;
  return inside;
}

/** True when the take has a loop narrower than its own window. */
export function takeIsLooped(take: Take): boolean {
  return takeLoop(take) !== null;
}

/** A take with a new trim window; its loop is re-fitted to the window. */
export function setTakeTrim(take: Take, start: number, end: number): Take {
  const next: Take = { ...take, trimStart: start, trimEnd: end };
  const window = takeWindow(next);
  // Grow a window that would collapse, so a take always plays something.
  if (window.seconds < MIN_TAKE_WINDOW_SECONDS) {
    const grown = Math.min(take.seconds, window.start + MIN_TAKE_WINDOW_SECONDS);
    next.trimStart = Math.max(0, grown - MIN_TAKE_WINDOW_SECONDS);
    next.trimEnd = grown;
  }
  return refitLoop(next);
}

/** A take with new loop points, clamped inside its window. */
export function setTakeLoop(take: Take, start: number, end: number): Take {
  const next: Take = { ...take, loopStart: start, loopEnd: end };
  return refitLoop(next);
}

/** Clear a take's loop — back to playing straight through. */
export function clearTakeLoop(take: Take): Take {
  const window = takeWindow(take);
  return { ...take, loopStart: window.start, loopEnd: window.end };
}

/**
 * Fit a take's loop back inside its window.
 *
 * Called after a trim, because moving an edge can leave the loop outside — and a
 * loop that is no longer inside the window is reset to the window rather than
 * silently kept, which is the one thing a handle can do that a number cannot.
 */
function refitLoop(take: Take): Take {
  const window = takeWindow(take);
  const loop = takeLoop(take);
  if (!loop) return { ...take, loopStart: window.start, loopEnd: window.end };
  return { ...take, loopStart: loop.start, loopEnd: loop.end };
}

/**
 * Re-time a take after a re-capture: keep its name, take the new length and peak,
 * and clamp the window and loop into it.
 */
export function retakeTake(take: Take, seconds: number, peak: number): Take {
  const fresh = makeTake(take.name, seconds, peak, take.origin);
  return refitLoop({
    ...fresh,
    trimStart: clampTakeTime(take.trimStart, fresh.seconds),
    trimEnd: clampTakeTime(take.trimEnd, fresh.seconds),
    loopStart: clampTakeTime(take.loopStart, fresh.seconds),
    loopEnd: clampTakeTime(take.loopEnd, fresh.seconds),
  });
}

/** A take read off a loaded recording — the whole thing, no loop, IMPORTED. */
export function takeFromSample(sample: Sample): Take {
  return makeTake(sample.name, sampleSeconds(sample), peakOf(sample.pcm), 'imported');
}

/**
 * A take back to its whole recording: the full window and no loop.
 *
 * What `RESET TRIM` does. It is `makeTake`'s default said a second time rather
 * than a mutation of the handles, so the one place that knows what an untouched
 * window is stays the one place that decides it.
 */
export function resetTakeWindow(take: Take): Take {
  return { ...take, trimStart: 0, trimEnd: take.seconds, loopStart: 0, loopEnd: take.seconds };
}

/** How a take's origin reads on a card and in a status line. */
export function takeOriginLabel(take: Take): string {
  return take.origin === 'imported' ? 'IMPORTED' : 'RECORDED';
}

/**
 * A take's window as the AUDIO layer wants it — the slice a note plays.
 *
 * The one conversion between "the shape I set on the RECORDER page" and "the
 * frames a source plays", so the live engine and the offline renderer cannot
 * disagree with the waveform: both ask the same two functions (`takeWindow`,
 * `takeLoop`) that the page draws from, and a loop that spans the whole window
 * reads as no loop here exactly as it does there.
 */
export function takeSampleWindow(take: Take): SampleWindow {
  const window = takeWindow(take);
  const loop = takeLoop(take);
  return {
    start: window.start,
    end: window.end,
    loop: loop !== null,
    loopStart: loop?.start ?? window.start,
    loopEnd: loop?.end ?? window.end,
  };
}

/** The loudest absolute sample in a run of frames, 0..1. */
export function peakOf(pcm: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const value = Math.abs(pcm[i]);
    if (value > peak) peak = value;
  }
  return Math.min(peak, 1);
}

/**
 * A recording drawn as `bars` peak columns, each 0..1.
 *
 * The waveform a page paints, reduced from the frames once so the draw loop does
 * nothing but move a pen. Each bucket reports the LOUDEST sample in it rather than
 * an average, because an average flattens exactly the transients that make a
 * waveform readable. `bars` is clamped to a sensible number so a page cannot ask
 * for a million columns.
 */
export function waveformBars(pcm: Float32Array, bars: number): number[] {
  const count = Math.max(1, Math.min(Math.round(bars), 4096));
  const out: number[] = new Array(count).fill(0);
  if (pcm.length === 0) return out;
  const span = pcm.length / count;
  for (let bucket = 0; bucket < count; bucket++) {
    const from = Math.floor(bucket * span);
    const to = Math.max(from + 1, Math.floor((bucket + 1) * span));
    let peak = 0;
    for (let i = from; i < to && i < pcm.length; i++) {
      const value = Math.abs(pcm[i]);
      if (value > peak) peak = value;
    }
    out[bucket] = Math.min(peak, 1);
  }
  return out;
}

/**
 * The take with this name, or null — the bank's own rule, any case.
 *
 * Takes are matched the way samples are, because a take IS a sample's other
 * half: a song names one with `sample NAME`, and a script that trims `HOOK`
 * must find the take a channel plays whether it was written `HOOK` or `hook`.
 */
export function takeByName(takes: readonly Take[], name: string): Take | null {
  return takes.find((take) => sameTakeName(take.name, name)) ?? null;
}

/**
 * A trim a script asked for: `record trim NAME START END`, in seconds.
 *
 * The SAME shape a take's own window uses (`trimStart`/`trimEnd`), because it is
 * the same arithmetic — the module that clamps and orders a drag is the module
 * that applies a line, so a script and a hand cannot produce different windows.
 */
export interface TakeTrimEdit {
  name: string;
  start: number;
  end: number;
}

/** A loop a script asked for: `record loop NAME START END`, in seconds. */
export interface TakeLoopEdit {
  name: string;
  start: number;
  end: number;
}

/**
 * Apply a trim to the named take, returning the new list and whether it was found.
 *
 * The take's name is kept; only its window moves. A name the list does not have
 * changes nothing and says so (`found: false`) rather than throwing — a script
 * that trims a take this machine has not made yet is a reference, not a broken
 * script, exactly as `sample NAME` on a channel is.
 */
export function trimTakeByName(
  takes: readonly Take[],
  name: string,
  start: number,
  end: number,
): { takes: Take[]; found: boolean } {
  let found = false;
  const next = takes.map((take) => {
    if (!sameTakeName(take.name, name)) return take;
    found = true;
    return setTakeTrim(take, start, end);
  });
  return { takes: next, found };
}

/** Set the loop points of the named take, for `trimTakeByName`'s reasons. */
export function loopTakeByName(
  takes: readonly Take[],
  name: string,
  start: number,
  end: number,
): { takes: Take[]; found: boolean } {
  let found = false;
  const next = takes.map((take) => {
    if (!sameTakeName(take.name, name)) return take;
    found = true;
    return setTakeLoop(take, start, end);
  });
  return { takes: next, found };
}

/** A take's size, as a line's second half: how long, how loud, whether it loops. */
export function takeMeta(take: Take): string {
  const window = takeWindow(take);
  const parts = [`${window.seconds.toFixed(2)}s`];
  parts.push(`of ${take.seconds.toFixed(2)}s`);
  parts.push(`peak ${Math.round(take.peak * 100)}%`);
  if (takeIsLooped(take)) parts.push('looped');
  else if (takeIsTrimmed(take)) parts.push('trimmed');
  return parts.join('  \u00b7  ');
}

/** A take as a line of a menu or a status line: its name, then its size. */
export function takeLabel(take: Take): string {
  return `${take.name.toUpperCase()}  \u00b7  ${takeMeta(take)}`;
}
