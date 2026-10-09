import { describe, expect, it } from 'vitest';

import { makeSample } from '../model/sample';
import {
  MIN_TAKE_WINDOW_SECONDS,
  clampTakeTime,
  clearTakeLoop,
  isTakeName,
  makeTake,
  peakOf,
  resetTakeWindow,
  retakeTake,
  sameTakeName,
  setTakeLoop,
  setTakeTrim,
  takeFromSample,
  takeIsLooped,
  takeIsTrimmed,
  takeLabel,
  takeLoop,
  takeMeta,
  takeOriginLabel,
  takeWindow,
  takeWindowSeconds,
  waveformBars,
} from '../model/take';

/**
 * A take — the recording the RECORDER page shows, and the window it plays through.
 *
 * The guard has three jobs. The first is that a fresh take is the WHOLE recording:
 * a capture nobody has touched plays from its start to its end. The second is that
 * trim and loop are WINDOWS, clamped to the take and to each other, so no sequence
 * of handle drags can make a take that plays backwards, plays nothing, or loops
 * outside the part it uses. The third is that the waveform is a reduction of the
 * frames — the loudest sample in each column, not an average that would erase the
 * transients a person reads a waveform by.
 */

/** A take over a `seconds`-long recording at `peak`, as a capture would make. */
function take(seconds = 10, peak = 0.8): ReturnType<typeof makeTake> {
  return makeTake('HOOK', seconds, peak);
}

describe('a fresh take is the whole recording', () => {
  it('starts untrimmed and unlooped', () => {
    const one = take(4, 0.5);
    expect(one.trimStart).toBe(0);
    expect(one.trimEnd).toBe(4);
    expect(takeWindow(one)).toEqual({ start: 0, end: 4, seconds: 4 });
    expect(takeLoop(one)).toBeNull();
    expect(takeIsTrimmed(one)).toBe(false);
    expect(takeIsLooped(one)).toBe(false);
  });

  it('tidies the name and clamps the length and peak', () => {
    const one = makeTake('  my hook ', 999, 5);
    expect(one.name).toBe('my-hook');
    expect(one.seconds).toBe(30);
    expect(one.peak).toBe(1);
    expect(isTakeName('HOOK')).toBe(true);
    expect(isTakeName('2HOOK')).toBe(false);
    expect(sameTakeName('hook', 'HOOK')).toBe(true);
  });
});

describe('the window is ordered and clamped', () => {
  it('reads the trim handles in either order', () => {
    const one = setTakeTrim(take(10), 6, 2);
    expect(takeWindow(one)).toEqual({ start: 2, end: 6, seconds: 4 });
  });

  it('never leaves the recording', () => {
    const one = setTakeTrim(take(10), -3, 99);
    expect(takeWindow(one)).toEqual({ start: 0, end: 10, seconds: 10 });
    expect(takeWindowSeconds(one)).toBe(10);
  });

  it('grows a window that would collapse to nothing', () => {
    const one = setTakeTrim(take(10), 5, 5);
    const window = takeWindow(one);
    expect(window.seconds).toBeCloseTo(MIN_TAKE_WINDOW_SECONDS, 6);
    expect(window.start).toBeCloseTo(5, 6);
  });

  it('clamps a non-number to zero', () => {
    expect(clampTakeTime(Number.NaN, 10)).toBe(0);
    expect(clampTakeTime(4, 0)).toBe(0);
    expect(clampTakeTime(4, 10)).toBe(4);
  });
});

describe('a loop lives inside the window', () => {
  it('reports loop points narrower than the window', () => {
    const one = setTakeLoop(take(10), 3, 5);
    expect(takeLoop(one)).toEqual({ start: 3, end: 5, seconds: 2 });
    expect(takeIsLooped(one)).toBe(true);
  });

  it('treats a loop over the whole window as no loop', () => {
    const one = setTakeLoop(take(10), 0, 10);
    expect(takeLoop(one)).toBeNull();
    expect(takeIsLooped(one)).toBe(false);
  });

  it('treats a loop shorter than the floor as no loop', () => {
    const one = setTakeLoop(take(10), 4, 4.01);
    expect(takeLoop(one)).toBeNull();
  });

  it('clamps a loop into the used window', () => {
    const one = setTakeLoop(take(10), 8, 12);
    expect(takeLoop(one)).toEqual({ start: 8, end: 10, seconds: 2 });
  });

  it('re-fits a loop when the window moves, or resets it', () => {
    // The loop is inside the new window, so it is kept (clamped).
    const kept = setTakeTrim(setTakeLoop(take(10), 3, 5), 0, 4);
    expect(takeLoop(kept)).toEqual({ start: 3, end: 4, seconds: 1 });

    // The loop is outside the new window, so it is reset to the window.
    const reset = setTakeTrim(setTakeLoop(take(10), 3, 5), 6, 9);
    expect(takeLoop(reset)).toBeNull();
  });

  it('clears back to playing through', () => {
    const one = clearTakeLoop(setTakeLoop(take(10), 3, 5));
    expect(takeLoop(one)).toBeNull();
  });
});

describe('a take re-times to a new recording without losing its handles', () => {
  it('clamps the window and loop into the shorter take', () => {
    const one = setTakeLoop(setTakeTrim(take(10), 2, 9), 4, 6);
    const shorter = retakeTake(one, 5, 0.4);
    expect(shorter.seconds).toBe(5);
    expect(shorter.peak).toBe(0.4);
    expect(takeWindow(shorter)).toEqual({ start: 2, end: 5, seconds: 3 });
    expect(takeLoop(shorter)).toEqual({ start: 4, end: 5, seconds: 1 });
  });

  it('keeps the name', () => {
    expect(retakeTake(take(10), 3, 0.2).name).toBe('HOOK');
  });
});

describe('a take read off a loaded recording', () => {
  it('covers the whole sample, with its peak', () => {
    const made = makeSample('BRK', 4, new Float32Array([0, 0.5, -0.9, 0.1]));
    if (!made.ok) throw new Error(made.error);
    const one = takeFromSample(made.sample);
    expect(one.name).toBe('BRK');
    expect(one.seconds).toBeCloseTo(1, 6);
    expect(one.peak).toBeCloseTo(0.9, 5);
    expect(one.trimEnd).toBeCloseTo(1, 6);
  });

  it('reports the loudest frame, capped at one', () => {
    expect(peakOf(new Float32Array([0.2, -0.7, 0.1]))).toBeCloseTo(0.7, 5);
    expect(peakOf(new Float32Array([1.5, 0]))).toBe(1);
    expect(peakOf(new Float32Array([]))).toBe(0);
  });
});

describe('the waveform is the loudest frame in each column', () => {
  it('reduces frames to bucket peaks', () => {
    const bars = waveformBars(new Float32Array([0, 1, 0, -0.8]), 2);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toBe(1);
    expect(bars[1]).toBeCloseTo(0.8, 5);
  });

  it('keeps a transient an average would erase', () => {
    expect(waveformBars(new Float32Array([0, 1]), 1)).toEqual([1]);
  });

  it('answers a sensible array for an empty or absurd request', () => {
    expect(waveformBars(new Float32Array([]), 4)).toEqual([0, 0, 0, 0]);
    expect(waveformBars(new Float32Array([0.5]), 0)).toHaveLength(1);
    expect(waveformBars(new Float32Array([0.5]), 1e9).length).toBe(4096);
  });
});

describe('a take reads as a line', () => {
  it('names its window, peak and whether it is trimmed or looped', () => {
    const fresh = takeMeta(makeTake('HOOK', 2, 0.5));
    expect(fresh).toContain('2.00s');
    expect(fresh).toContain('of 2.00s');
    expect(fresh).toContain('peak 50%');
    expect(fresh).not.toContain('trimmed');
    expect(fresh).not.toContain('looped');

    const trimmed = takeMeta(setTakeTrim(take(10), 1, 3));
    expect(trimmed).toContain('2.00s');
    expect(trimmed).toContain('of 10.00s');
    expect(trimmed).toContain('trimmed');

    const looped = takeMeta(setTakeLoop(take(10), 2, 4));
    expect(looped).toContain('looped');

    expect(takeLabel(makeTake('HOOK', 2, 0.5))).toMatch(/^HOOK  ·  /);
  });
});

describe('a take remembers where it came from', () => {
  it('is RECORDED unless it was read off a file', () => {
    expect(makeTake('HOOK', 1, 0.5).origin).toBe('recorded');
    expect(takeOriginLabel(makeTake('HOOK', 1, 0.5))).toBe('RECORDED');
    const pcm = new Float32Array(800);
    pcm[10] = 0.9;
    const made = makeSample('BRK', 8000, pcm);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const loaded = takeFromSample(made.sample);
    expect(loaded.origin).toBe('imported');
    expect(takeOriginLabel(loaded)).toBe('IMPORTED');
  });

  it('keeps its origin through a re-capture', () => {
    const loaded = makeTake('BRK', 1, 0.5, 'imported');
    expect(retakeTake(loaded, 2, 0.4).origin).toBe('imported');
  });
});

describe('RESET TRIM is the whole recording again', () => {
  it('drops the window and the loop', () => {
    const shaped = setTakeLoop(setTakeTrim(take(10), 2, 8), 3, 7);
    const reset = resetTakeWindow(shaped);
    expect(takeWindow(reset)).toEqual({ start: 0, end: 10, seconds: 10 });
    expect(takeLoop(reset)).toBeNull();
  });
});
