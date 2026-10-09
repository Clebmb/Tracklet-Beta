import { describe, expect, it } from 'vitest';

import { buildNote, VIBRATO_CENTS, VIBRATO_HZ, VOICE_PEAK } from '../audio/synth';
import { DEFAULT_VOICE, midiToFreq, patchFromVoice } from '../model';

/**
 * The note builder, tested on the graph it builds rather than on the sound it
 * makes.
 *
 * There is no AudioContext in a unit test, so the arithmetic that matters — where
 * a gliding note STARTS, when a vibrato reaches full depth, how far a velocity
 * scales the envelope — is asserted against the calls the builder makes. That is
 * the only way to check the thing that would be worst to get wrong: that a note
 * on a channel with no glide plays at its OWN pitch, on the exact parameter this
 * app has always set, rather than starting at the note before it and staying
 * there.
 *
 * The stub records every scheduled value on every parameter and nothing else;
 * `connect` returns the node, so a chain reads the way the real API does.
 */

interface ParamCall {
  method: 'set' | 'ramp' | 'target';
  value: number;
  time: number;
}

interface FakeParam {
  value: number;
  calls: ParamCall[];
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  setTargetAtTime(value: number, time: number, constant: number): void;
  cancelScheduledValues(time: number): void;
}

interface FakeOsc {
  type: string;
  frequency: FakeParam;
  detune: FakeParam;
  started?: number;
  stopped?: number;
  start(time: number): void;
  stop(time: number): void;
}

interface FakeGain {
  gain: FakeParam;
}

function param(value = 0): FakeParam {
  return {
    value,
    calls: [],
    setValueAtTime(v, t) { this.calls.push({ method: 'set', value: v, time: t }); },
    linearRampToValueAtTime(v, t) { this.calls.push({ method: 'ramp', value: v, time: t }); },
    setTargetAtTime(v, t) { this.calls.push({ method: 'target', value: v, time: t }); },
    cancelScheduledValues() { /* nothing to cancel in a stub */ },
  };
}

/** A node that can be connected and disconnected, and remembers nothing else. */
function output(): { connect(destination: unknown): unknown; disconnect(): void } {
  return {
    connect() { return this; },
    disconnect() { /* no-op */ },
  };
}

function fakeContext() {
  const oscillators: FakeOsc[] = [];
  const gains: FakeGain[] = [];
  const ctx = {
    createOscillator(): FakeOsc {
      const osc: FakeOsc = {
        ...output(),
        type: 'sine',
        frequency: param(),
        detune: param(),
        start(time: number) { this.started = time; },
        stop(time: number) { this.stopped = time; },
      };
      oscillators.push(osc);
      return osc;
    },
    createGain(): FakeGain {
      const gain: FakeGain = { ...output(), gain: param() };
      gains.push(gain);
      return gain;
    },
    createBiquadFilter() {
      return { ...output(), type: 'lowpass', frequency: param(), Q: param() };
    },
  };
  return { ctx, oscillators, gains };
}

const DESTINATION = output() as unknown as AudioNode;
/** One plain layer at full gain, so a note is one oscillator and one envelope. */
const PATCH = patchFromVoice(DEFAULT_VOICE);

function build(options: Parameters<typeof buildNote>[7]) {
  const { ctx, oscillators, gains } = fakeContext();
  buildNote(ctx as unknown as BaseAudioContext, PATCH, 60, 0, 1, DESTINATION, null, options);
  return { oscillators, gains };
}

/** The names of the calls made on a parameter, in order. */
const methodsOn = (p: FakeParam): string[] => p.calls.map((call) => call.method);

describe('a plain note is the note this app always built', () => {
  it('sets one frequency and never ramps it', () => {
    const { oscillators } = build({});
    expect(oscillators).toHaveLength(1);
    expect(methodsOn(oscillators[0].frequency)).toEqual(['set']);
    expect(oscillators[0].frequency.calls[0].value).toBeCloseTo(midiToFreq(60), 9);
  });

  it('starts the note in tune wherever the channel was before', () => {
    // The channel played a different note a moment ago, but this channel has no
    // glide — so this note begins at ITS OWN pitch, not the previous one. A note
    // that started at the old pitch and never ramped would be a channel stuck
    // playing the note before it, and would only show up on the notes that move.
    const { oscillators } = build({ glide: 0, fromMidi: 45 });
    expect(methodsOn(oscillators[0].frequency)).toEqual(['set']);
    expect(oscillators[0].frequency.calls[0].value).toBeCloseTo(midiToFreq(60), 9);
  });
});

describe('glide', () => {
  it('starts at the previous pitch and ramps to its own over a share of the note', () => {
    const { oscillators } = build({ glide: 50, fromMidi: 57 });
    const calls = oscillators[0].frequency.calls;
    expect(calls[0]).toMatchObject({ method: 'set', time: 0 });
    expect(calls[0].value).toBeCloseTo(midiToFreq(57), 9);
    expect(calls[1]).toMatchObject({ method: 'ramp', time: 0.5 });
    expect(calls[1].value).toBeCloseTo(midiToFreq(60), 9);
  });

  it('slides the whole of the note at 100, and none of it at 0', () => {
    expect(build({ glide: 100, fromMidi: 48 }).oscillators[0].frequency.calls[1].time).toBeCloseTo(1, 9);
    expect(methodsOn(build({ glide: 0, fromMidi: 48 }).oscillators[0].frequency)).toEqual(['set']);
  });

  it('does not ramp when the pitch has not moved, or there is nothing to slide from', () => {
    // A repeated note is already where it belongs, and the first note of a song
    // has nothing behind it — neither is a slide, and both must stay silent.
    expect(methodsOn(build({ glide: 100, fromMidi: 60 }).oscillators[0].frequency)).toEqual(['set']);
    expect(methodsOn(build({ glide: 100, fromMidi: null }).oscillators[0].frequency)).toEqual(['set']);
  });
});

describe('vibrato', () => {
  it('adds no oscillator at all when it is off', () => {
    expect(build({ vibrato: 0 }).oscillators).toHaveLength(1);
  });

  it('drives the layer from one slow LFO, fading the depth in', () => {
    const { oscillators, gains } = build({ vibrato: 50 });
    expect(oscillators).toHaveLength(2);
    const lfo = oscillators[1];
    expect(lfo.frequency.calls[0].value).toBe(VIBRATO_HZ);
    expect(lfo.started).toBe(0);
    // The depth gain is the note's second gain, and it fades IN from nothing
    // rather than starting at its full width.
    expect(gains).toHaveLength(2);
    const depth = gains[1].gain;
    expect(depth.calls[0]).toMatchObject({ method: 'set', value: 0 });
    expect(depth.calls[1].method).toBe('ramp');
    expect(depth.calls[1].value).toBeCloseTo(VIBRATO_CENTS * 0.5, 9);
  });

  it('leaves the layer detune alone, so the wobble rides on top of it', () => {
    const { oscillators } = build({ vibrato: 100 });
    expect(oscillators[0].detune.calls[0].value).toBe(0);
  });
});

describe('velocity', () => {
  it('scales the envelope peak, and full force is the level this app always used', () => {
    const full = build({ velocity: 100 }).gains[0].gain.calls[1].value;
    expect(full).toBeCloseTo(VOICE_PEAK, 9);
    expect(build({ velocity: 50 }).gains[0].gain.calls[1].value).toBeCloseTo(VOICE_PEAK * 0.5, 9);
    expect(build({ velocity: 0 }).gains[0].gain.calls[1].value).toBeCloseTo(0, 9);
  });

  it('clamps a velocity a bug or a hand-edited file could hand it', () => {
    expect(build({ velocity: 5000 }).gains[0].gain.calls[1].value).toBeCloseTo(VOICE_PEAK, 9);
    expect(build({ velocity: -20 }).gains[0].gain.calls[1].value).toBeCloseTo(0, 9);
  });
});
