import { describe, expect, it } from 'vitest';

import { buildNote, fmDepth, FM_MAX_INDEX, FM_RATIO } from '../audio/synth';
import {
  CHIPS,
  chipById,
  chipNameFor,
  chipVoiceFor,
  createSong,
  DEFAULT_VOICE,
  patchFromVoice,
  WAVE_LABELS,
  waveForTrack,
  waveFromName,
  type VoiceParams,
} from '../model';
import { applyScript } from '../model/script';
import { songFromJson, songToJson, songToScript } from '../model/songfile';

/**
 * FM, the last source on the chiptune shelf: a SINE carrier whose pitch is bent
 * by a second oscillator, which is how a Genesis or an AdLib makes everything
 * that is not a simple pulse.
 *
 * The tests pin the two decisions that make it FM rather than another wavetable.
 * First, the timbre comes from the RELATIONSHIP between two pitches — a carrier
 * and a modulator — not from a shape, so the carrier is a plain sine and the
 * character is the modulator's depth. Second, the depth scales with the note, so
 * a voice keeps its colour up and down the keyboard the way an FM chip does.
 * Everything is reached on purpose: the default four-shape cycle is untouched,
 * and a square at full duty is still the browser's own square.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the modulation maths', () => {
  it('bends the carrier by the index times the modulator frequency', () => {
    // The modulator runs FM_RATIO above the carrier, so the bend is
    // index x (FM_RATIO x frequency).
    expect(fmDepth(100, 220)).toBeCloseTo(FM_MAX_INDEX * FM_RATIO * 220);
  });

  it('is a pure sine at duty zero, and linear up to the top', () => {
    expect(fmDepth(0, 220)).toBe(0);
    expect(fmDepth(50, 220)).toBeCloseTo(fmDepth(100, 220) / 2);
  });

  it('clamps outside the knob, so a script cannot drive it off the rails', () => {
    expect(fmDepth(-40, 220)).toBe(0);
    expect(fmDepth(400, 220)).toBeCloseTo(fmDepth(100, 220));
  });
});

describe('fm is a wave, but not one a new channel walks', () => {
  it('names it, with the synth and freqmod spellings', () => {
    expect(waveFromName('fm')).toBe('fm');
    expect(waveFromName('fmsynth')).toBe('fm');
    expect(waveFromName('freqmod')).toBe('fm');
    expect(WAVE_LABELS.fm).toBe('FM');
    // The default cycle is still the four tonal shapes.
    expect(waveForTrack(4)).toBe('square');
    expect(waveForTrack(7)).toBe('sine');
  });
});

// --- the synthesis ----------------------------------------------------------

interface SetCall { v: number; t: number }
interface FakeParam {
  value: number;
  sets: SetCall[];
  ramps: SetCall[];
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
  setTargetAtTime(v: number, t: number, c: number): void;
}

function param(): FakeParam {
  const p: FakeParam = {
    value: 0,
    sets: [],
    ramps: [],
    setValueAtTime(v, t) { this.value = v; this.sets.push({ v, t }); },
    linearRampToValueAtTime(v, t) { this.value = v; this.ramps.push({ v, t }); },
    setTargetAtTime() {},
  };
  return p;
}

interface Node {
  connect(target: unknown): unknown;
  disconnect(): void;
}

interface FakeOsc extends Node {
  type: string;
  frequency: FakeParam;
  detune: FakeParam;
  setPeriodicWave(w: unknown): void;
  start(t: number): void;
  stop(t: number): void;
}

/** A context that records what connects to what, so the FM chain can be walked. */
function fakeContext() {
  const oscillators: FakeOsc[] = [];
  const gains: { gain: FakeParam }[] = [];
  const connections: { from: unknown; to: unknown }[] = [];

  const base = () => ({
    connect(target: unknown) { connections.push({ from: this, to: target }); return target; },
    disconnect() {},
  });

  const ctx = {
    sampleRate: 44100,
    createOscillator(): FakeOsc {
      const osc: FakeOsc = { ...base(), type: 'sine', frequency: param(), detune: param(), setPeriodicWave() {}, start() {}, stop() {} };
      oscillators.push(osc);
      return osc;
    },
    createGain() {
      const g = { ...base(), gain: param() };
      gains.push(g);
      return g;
    },
    createBiquadFilter() { return { ...base(), type: 'lowpass', frequency: param(), Q: param() }; },
    createBufferSource() {
      return { ...base(), buffer: null, loop: false, playbackRate: param(), detune: param(), start() {}, stop() {} };
    },
  };
  return { ctx, oscillators, gains, connections };
}

const DESTINATION = { connect() { return this; }, disconnect() {} } as unknown as AudioNode;

function build(voice: VoiceParams, options: Record<string, unknown> = {}) {
  const fake = fakeContext();
  buildNote(fake.ctx as unknown as BaseAudioContext, patchFromVoice(voice), 60, 0, 1, DESTINATION, null, options);
  return fake;
}

/** The depth gain is whatever the modulator feeds into the carrier's frequency. */
function depthOf(fake: ReturnType<typeof fakeContext>): { gain: FakeParam } {
  const carrier = fake.oscillators[0];
  const conn = fake.connections.find((c) => c.to === carrier.frequency);
  if (!conn) throw new Error('no node is wired into the carrier frequency');
  return conn.from as { gain: FakeParam };
}

const fmVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'fm', duty });

describe('the engine builds an FM voice', () => {
  it('is a sine carrier at the note, plus a modulator an octave up', () => {
    const { oscillators } = build(fmVoice(45));
    expect(oscillators).toHaveLength(2);
    const [carrier, mod] = oscillators;
    // The carrier is the sine the ear hears the pitch of; the shape is not the sound.
    expect(carrier.type).toBe('sine');
    // The modulator is an octave above, and carries the same detune as the carrier.
    expect(mod.type).toBe('sine');
    expect(mod.frequency.sets.at(-1)!.v).toBeCloseTo(carrier.frequency.sets.at(-1)!.v * FM_RATIO);
    expect(mod.detune.sets.at(-1)!.v).toBe(carrier.detune.sets.at(-1)!.v);
  });

  it('routes the modulator through a depth gain into the carrier frequency', () => {
    const fake = build(fmVoice(45));
    const { oscillators, connections } = fake;
    const [carrier, mod] = oscillators;
    const depth = depthOf(fake);
    // The depth is exactly the index for this duty and this note.
    expect(depth.gain.sets.at(-1)!.v).toBeCloseTo(fmDepth(45, carrier.frequency.sets.at(-1)!.v));
    // modulator -> depth -> carrier.frequency, the textbook two-operator chain.
    expect(connections.some((c) => c.from === mod && c.to === depth)).toBe(true);
  });

  it('turns the depth up with the knob, from silent to metallic', () => {
    // At duty zero the depth is zero, so the carrier is a pure sine.
    expect(depthOf(build(fmVoice(0))).gain.sets.at(-1)!.v).toBe(0);
    expect(depthOf(build(fmVoice(100))).gain.sets.at(-1)!.v).toBeGreaterThan(0);
  });

  it('slides the modulator with the carrier, so a glide stays in tune', () => {
    const { oscillators } = build(fmVoice(40), { glide: 60, fromMidi: 55 });
    const [carrier, mod] = oscillators;
    // Both the carrier and the modulator ramp to their target pitch.
    expect(carrier.frequency.ramps.at(-1)!.v).toBeCloseTo(carrier.frequency.sets.at(-1)!.v * Math.pow(2, 5 / 12));
    expect(mod.frequency.ramps.length).toBeGreaterThan(0);
    expect(mod.frequency.ramps.at(-1)!.v).toBeCloseTo(carrier.frequency.ramps.at(-1)!.v * FM_RATIO);
  });
});

// --- the chips that are FM ------------------------------------------------

describe('the FM consoles', () => {
  it('gives the Genesis and the AdLib their FM channels in the profile order', () => {
    const genesis = chipById('genesis')!;
    expect(genesis.roles.map((r) => r.wave)).toEqual(['fm', 'fm', 'fm', 'fm', 'fm', 'noise']);
    const opl = chipById('opl')!;
    expect(opl.roles.map((r) => r.wave)).toEqual(['fm', 'fm', 'fm', 'fm', 'fm', 'noise']);
    // They are told apart by the depth dialled into each operator, not the wave.
    expect(genesis.roles[0].duty).not.toBe(opl.roles[0].duty);
  });

  it('lays fm voices over a song with `chip genesis` and `chip opl`', () => {
    const { song } = applied('tracks 6\nchip genesis');
    expect(song.tracks.map((t) => t.voice.wave)).toEqual(['fm', 'fm', 'fm', 'fm', 'fm', 'noise']);
    expect(chipNameFor(song.tracks.map((t) => t.voice))).toBe('genesis');

    const opl = applied('tracks 2\nchip opl').song;
    expect(opl.tracks.map((t) => t.voice.wave)).toEqual(['fm', 'fm']);
    expect(opl.tracks[0].voice.duty).toBe(chipVoiceFor(chipById('opl')!, 0).duty);
  });

  it('is still just voices, so an FM song travels as one', () => {
    const { song } = applied('tracks 2\nchip genesis');
    const json = songToJson(song);
    expect(json).not.toContain('"chip"');

    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('fm');
    expect(parsed.song.tracks[0].voice.duty).toBe(chipById('genesis')!.roles[0].duty);

    expect(songToScript(song)).toContain('wave fm');
  });
});

describe('an fm channel in a script', () => {
  it('sets the wave, by any spelling, and keeps its own duty', () => {
    const one = applied('tracks 1\ntrack 1 "LEAD" wave fm duty 30');
    expect(one.song.tracks[0].voice.wave).toBe('fm');
    expect(one.song.tracks[0].voice.duty).toBe(30);
    const two = applied('tracks 1\ntrack 1 "LEAD" wave fmsynth');
    expect(two.song.tracks[0].voice.wave).toBe('fm');
  });

  it('lists the wave in its refusal, so the next line is easy to write', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "X" wave warp');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('fm');
  });
});

// Keep the chip list honest: the two FM consoles are the newest entries.
describe('the chip shelf', () => {
  it('ends with the two FM consoles', () => {
    expect(CHIPS.slice(-2).map((c) => c.id)).toEqual(['genesis', 'opl']);
  });
});
