/**
 * The filter a note-clock brightness lane builds.
 *
 * These assertions are about the CALLS the scheduler makes, not the sound: a
 * `BiquadFilterNode`'s frequency is a timeline, so "the cutoff walks 90 -> 20 over
 * two steps" is a list of scheduled breakpoints, and a stub that records them can
 * say whether they land where the lane says. Nobody can hear a test, so this is the
 * closest thing to hearing it that a headless run has.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildNote } from '../audio/synth';
import { patchFromVoice } from '../model/instrument';
import { createSong } from '../model/song';

type Call = [kind: 'set' | 'ramp' | 'hold', value: number, time: number];

/** A context stub whose filter frequency records what was scheduled on it. */
function stubContext(): { ctx: BaseAudioContext; frequencies: Call[][] } {
  const frequencies: Call[][] = [];
  const quietParam = (): Record<string, unknown> => ({
    value: 0,
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const frequencyParam = (): Record<string, unknown> => {
    const calls: Call[] = [];
    frequencies.push(calls);
    return {
      value: 0,
      setValueAtTime: (value: number, time: number) => calls.push(['set', value, time]),
      exponentialRampToValueAtTime: (value: number, time: number) => calls.push(['ramp', value, time]),
      linearRampToValueAtTime: (value: number, time: number) => calls.push(['ramp', value, time]),
      setTargetAtTime: (value: number, time: number) => calls.push(['hold', value, time]),
      cancelScheduledValues: vi.fn(),
    };
  };
  const make = (kind: string): Record<string, unknown> => {
    const node: Record<string, unknown> = {
      kind,
      gain: quietParam(),
      detune: quietParam(),
      frequency: kind === 'biquad' ? frequencyParam() : quietParam(),
      Q: quietParam(),
      delayTime: quietParam(),
      pan: quietParam(),
      buffer: null,
      loop: false,
      curve: null,
      oversample: 'none',
      type: '',
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    };
    node.connect = vi.fn(() => node);
    return node;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => make('gain'),
    createBiquadFilter: () => make('biquad'),
    createOscillator: () => make('oscillator'),
    createBufferSource: () => make('bufferSource'),
    createWaveShaper: () => make('shaper'),
    createDynamicsCompressor: () => make('compressor'),
    createDelay: () => make('delay'),
    createChannelMerger: () => make('merger'),
    createStereoPanner: () => make('panner'),
    createConstantSource: () => make('constant'),
    createBuffer: (channels: number, length: number, rate: number) => {
      const data = new Float32Array(length);
      return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: () => data };
    },
  } as unknown as BaseAudioContext;
  return { ctx, frequencies };
}

function build(options: Parameters<typeof buildNote>[7] = {}) {
  const song = createSong();
  const { ctx, frequencies } = stubContext();
  const out = ctx.createGain();
  buildNote(ctx, patchFromVoice(song.tracks[0].voice), 60, 1, 0.5, out, null, options);
  // The layer's filter is the one the builder sets a cutoff on; the patch's shape
  // is one filter for the whole voice, so the first recorded list is it.
  return frequencies[0] ?? [];
}

describe('a brightness lane on the note clock', () => {
  it('walks the lane point by point, one step apart at the song tempo', () => {
    const calls = build({
      brightCurve: {
        points: [
          { step: 0, value: 90 },
          { step: 2, value: 20 },
        ],
        stepSeconds: 0.1,
      },
    });
    expect(calls[0][0]).toBe('set');
    expect(calls[0][2]).toBe(1);
    expect(calls[1][0]).toBe('ramp');
    // Two steps after the hit, at the note's start: `at + 2 * 0.1`.
    expect(calls[1][2]).toBeCloseTo(1.2, 6);
    // A brighter lane is a higher cutoff, which is the whole point of the knob.
    expect(calls[0][1]).toBeGreaterThan(calls[1][1]);
  });

  it('is one cutoff at the start when there is no lane', () => {
    const calls = build();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['set', expect.any(Number), 1]);
  });

  it('is one cutoff when a lane says the same thing on every step', () => {
    const calls = build({
      brightCurve: { points: [{ step: 0, value: 60 }], stepSeconds: 0.1 },
    });
    expect(calls).toHaveLength(1);
  });

  it('never ramps to a cutoff a filter cannot take', () => {
    const calls = build({
      brightCurve: {
        points: [
          { step: 0, value: 100 },
          { step: 1, value: 0 },
        ],
        stepSeconds: 0.1,
      },
    });
    for (const [, value] of calls) expect(value).toBeGreaterThanOrEqual(1);
  });
});
