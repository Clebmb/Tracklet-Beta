import { describe, expect, it } from 'vitest';

import { windowedSampleBuffer } from '../audio/synth';
import { makeSample, type Sample } from '../model/sample';
import { makeTake, setTakeLoop, setTakeTrim, takeSampleWindow } from '../model/take';

/**
 * The TRIM and LOOP a take carries, as the audio layer sees them.
 *
 * The page draws a window; the engine and the offline renderer have to PLAY that
 * window. These tests hold the join between the two: that the descriptor a take
 * produces matches what the wafer says (a whole untouched window is no loop; a
 * trimmed one starts and ends where it is drawn), and that the sliced buffer a
 * note plays really is those frames with its loop points measured from the
 * slice's own start.
 */

describe('a take describes the window a note plays', () => {
  it('reads an untouched take as the whole recording, unlooped', () => {
    const window = takeSampleWindow(makeTake('HOOK', 4, 0.8));
    expect(window).toEqual({ start: 0, end: 4, loop: false, loopStart: 0, loopEnd: 4 });
  });

  it('reads a trim as the window, and a loop as the loop', () => {
    const shaped = setTakeLoop(setTakeTrim(makeTake('HOOK', 5, 0.8), 0.25, 4.75), 1, 4);
    expect(takeSampleWindow(shaped)).toEqual({
      start: 0.25, end: 4.75, loop: true, loopStart: 1, loopEnd: 4,
    });
  });

  it('reads a loop that spans the whole window as no loop', () => {
    // `setTakeTrim` re-fits the loop to the new window, so the loop spans it and
    // the descriptor must say `loop: false` — the same answer the page draws.
    const trimmed = setTakeTrim(makeTake('HOOK', 5, 0.8), 1, 3);
    expect(takeSampleWindow(trimmed).loop).toBe(false);
  });
});

/** A stand-in context that records the buffers it is asked to make. */
function fakeCtx() {
  const made: { length: number; data: Float32Array }[] = [];
  const ctx = {
    createBuffer: (_channels: number, length: number, rate: number) => {
      const data = new Float32Array(length);
      const buffer = {
        numberOfChannels: 1, length, sampleRate: rate, duration: length / rate,
        getChannelData: () => data,
      };
      made.push({ length, data });
      return buffer;
    },
  };
  return { ctx: ctx as unknown as BaseAudioContext, made };
}

/** A recording whose frames are 0,1,2,… so a slice is obvious. */
function ramp(frames: number, rate: number): Sample {
  const pcm = new Float32Array(frames);
  for (let i = 0; i < frames; i++) pcm[i] = i;
  const made = makeSample('BRK', rate, pcm);
  if (!made.ok) throw new Error(made.error);
  return made.sample;
}

describe('a recording is sliced to its window', () => {
  it('copies exactly the window’s frames', () => {
    const sample = ramp(10, 10); // 1 second at 10 Hz: one frame per 0.1 s
    const { ctx, made } = fakeCtx();
    const sliced = windowedSampleBuffer(ctx, sample, { start: 0.2, end: 0.6, loop: false, loopStart: 0, loopEnd: 0 });
    expect(made).toHaveLength(1);
    expect(sliced.buffer.length).toBe(4);
    expect([...made[0].data]).toEqual([2, 3, 4, 5]);
  });

  it('measures the loop points from the slice’s own start', () => {
    const sample = ramp(10, 10);
    const { ctx, made } = fakeCtx();
    const sliced = windowedSampleBuffer(ctx, sample, { start: 0.2, end: 0.6, loop: true, loopStart: 0.3, loopEnd: 0.5 });
    // The slice begins at frame 2; a loop from 0.3 to 0.5 is 1 to 3 INTO the slice.
    expect(sliced.loopStart).toBeCloseTo(0.1, 6);
    expect(sliced.loopEnd).toBeCloseTo(0.3, 6);
    expect(made[0].length).toBe(4);
  });

  it('clamps a window past the recording’s end', () => {
    const sample = ramp(10, 10);
    const { ctx } = fakeCtx();
    const sliced = windowedSampleBuffer(ctx, sample, { start: 0.7, end: 9, loop: false, loopStart: 0, loopEnd: 0 });
    expect(sliced.buffer.length).toBe(3);
  });

  it('copies a given window once, not once per note', () => {
    const sample = ramp(10, 10);
    const { ctx, made } = fakeCtx();
    const window = { start: 0.2, end: 0.6, loop: false, loopStart: 0, loopEnd: 0 };
    const first = windowedSampleBuffer(ctx, sample, window);
    const second = windowedSampleBuffer(ctx, sample, window);
    expect(second).toBe(first);
    expect(made).toHaveLength(1);
  });
});
