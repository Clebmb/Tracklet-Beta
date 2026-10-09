import { describe, expect, it, vi } from 'vitest';

import { AudioEngine } from '../audio/engine';
import { makeSample, type Sample } from '../model/sample';

/**
 * `HEAR TAKE` — the engine's own audition of a recording's window.
 *
 * The RECORDER page's `▶ HEAR TAKE` must play the RECORDING (its trim, and its
 * loop when LOOP ON), not a pitch from the channel's patch — so the engine grew a
 * `previewTake` beside `previewNote`. These tests pin the four things that make
 * the button honest, with a stand-in `AudioContext` where there is no browser:
 *
 *   • a plain audition starts at the window's start and runs its length;
 *   • a LOOPED one loops BETWEEN the window's points, not the whole file;
 *   • the returned handle stops the sound;
 *   • with no context at all it returns null rather than pretending.
 */

/** A loaded recording with `seconds` of frames at 8000 Hz. */
function recording(name: string, seconds: number): Sample {
  const made = makeSample(name, 8000, new Float32Array(Math.round(8000 * seconds)).fill(0.2));
  if (!made.ok) throw new Error(made.error);
  return made.sample;
}

/** A stand-in audio context that records what a buffer source was asked to do. */
function fakeContext() {
  const started: unknown[][] = [];
  const stopped: unknown[][] = [];
  const src: Record<string, unknown> = {
    buffer: null as unknown,
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    connect: (node: unknown) => node,
    start: (...args: unknown[]) => started.push(args),
    stop: (...args: unknown[]) => stopped.push(args),
  };
  const gain = {
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), value: 0.9 },
    connect: (node: unknown) => node,
  };
  const ctx = {
    currentTime: 10,
    createBuffer: (_c: number, length: number, rate: number) => ({
      duration: length / rate,
      getChannelData: () => ({ set: () => undefined }),
    }),
    createBufferSource: () => src,
    createGain: () => gain,
  };
  return { ctx, src, gain, started, stopped };
}

/** An engine wired to a stand-in context, bypassing `build()`. */
function wired() {
  const engine = new AudioEngine();
  const fake = fakeContext();
  const internals = engine as unknown as { ctx: unknown; master: unknown };
  internals.ctx = fake.ctx;
  internals.master = { connect: () => undefined };
  return { engine, ...fake };
}

describe('the engine auditions a take’s own window', () => {
  it('starts at the trim start and runs the window length', () => {
    const { engine, src, started } = wired();
    const handle = engine.previewTake(0, recording('HOOK', 5), { start: 1, end: 3, seconds: 2 }, false);
    expect(handle).not.toBeNull();
    expect(src.loop).toBe(false);
    expect(started).toHaveLength(1);
    // start(at, offset, duration)
    expect(started[0].slice(1)).toEqual([1, 2]);
  });

  it('loops BETWEEN the window points, not the whole file', () => {
    const { engine, src, started, stopped } = wired();
    engine.previewTake(0, recording('HOOK', 5), { start: 1, end: 3, seconds: 2 }, true);
    expect(src.loop).toBe(true);
    expect(src.loopStart).toBe(1);
    expect(src.loopEnd).toBe(3);
    // A loop has no per-window duration to schedule: it rings until stopped.
    expect(started[0].slice(1)).toEqual([1]);
    // …but it carries a long cap, so a forgotten audition cannot ring forever.
    expect(stopped.length).toBeGreaterThan(0);
  });

  it('clamps a window past the recording’s own end', () => {
    const { engine, src } = wired();
    engine.previewTake(0, recording('HOOK', 2), { start: 1, end: 9, seconds: 8 }, true);
    expect(src.loopEnd).toBeCloseTo(2, 5);
  });

  it('hands back a handle that stops the sound', () => {
    const { engine, gain, stopped } = wired();
    const handle = engine.previewTake(0, recording('HOOK', 5), { start: 0, end: 1, seconds: 1 }, false);
    expect(handle).not.toBeNull();
    const used = stopped.length;
    handle!.stop();
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalled();
    expect(stopped.length).toBeGreaterThan(used);
    // Stopping twice is safe: a source that already ended throws on a second stop.
    expect(() => handle!.stop()).not.toThrow();
  });

  it('answers null rather than pretending when there is no audio', () => {
    const engine = new AudioEngine();
    expect(engine.previewTake(0, recording('HOOK', 5), { start: 0, end: 1, seconds: 1 }, false)).toBeNull();
  });

  it('answers null for an empty window', () => {
    const { engine } = wired();
    expect(engine.previewTake(0, recording('HOOK', 5), { start: 2, end: 2, seconds: 0 }, false)).toBeNull();
  });
});
