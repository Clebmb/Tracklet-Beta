import { describe, expect, it } from 'vitest';

import {
  buildNote,
  GRANULAR_BANK,
  granularFor,
  granularIndexFor,
  makeGranularBuffer,
} from '../audio/synth';
import {
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
import { midiToFreq } from '../model/notes';

/**
 * The grain cloud: granular synthesis.
 *
 * The idea is a CLOUD of short grains rather than a wave, so two properties
 * matter: the texture is built from grains (sparse ones crackle, long overlapping
 * ones merge) and it LOOPS, because a cloud sustains like an organ. The spray is
 * seeded, so a render is the same bytes in the app, an export and here, and
 * `duty` picks the character from the bank.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the granular bank', () => {
  it('has five named characters, each a real cloud', () => {
    expect(GRANULAR_BANK).toHaveLength(5);
    expect(new Set(GRANULAR_BANK.map((c) => c.id)).size).toBe(GRANULAR_BANK.length);
    for (const cloud of GRANULAR_BANK) {
      expect(cloud.label.length).toBeGreaterThanOrEqual(3);
      expect(cloud.blurb.length).toBeGreaterThan(10);
      expect(cloud.grainSeconds).toBeGreaterThan(0);
      expect(cloud.grainsPerSecond).toBeGreaterThan(0);
      expect(cloud.scatter).toBeGreaterThanOrEqual(0);
      expect(cloud.rootHz).toBeGreaterThan(0);
      expect(cloud.seed).toBeGreaterThan(0);
    }
    expect(granularFor(0).id).toBe(GRANULAR_BANK[0].id);
    expect(granularFor(100).id).toBe(GRANULAR_BANK[GRANULAR_BANK.length - 1].id);
  });

  it('runs from crackly to smooth, so duty rises through the bank', () => {
    // Grains get longer, narrower in pitch and more overlapped as the bank rises:
    // a crackle is many tiny scattered ticks, a smear a few long in-tune grains.
    const overlap = (c: (typeof GRANULAR_BANK)[number]) => c.grainsPerSecond * c.grainSeconds;
    for (let i = 1; i < GRANULAR_BANK.length; i++) {
      expect(GRANULAR_BANK[i].grainSeconds).toBeGreaterThan(GRANULAR_BANK[i - 1].grainSeconds);
      expect(GRANULAR_BANK[i].scatter).toBeLessThan(GRANULAR_BANK[i - 1].scatter);
      expect(overlap(GRANULAR_BANK[i])).toBeGreaterThan(overlap(GRANULAR_BANK[i - 1]));
    }
  });

  it('picks a character by duty, spread evenly and clamped', () => {
    expect(granularIndexFor(0)).toBe(0);
    expect(granularIndexFor(100)).toBe(GRANULAR_BANK.length - 1);
    expect(granularIndexFor(-10)).toBe(0);
    expect(granularIndexFor(1000)).toBe(GRANULAR_BANK.length - 1);
    expect(granularFor(60).id).toBe('cloud');
  });
});

describe('granular is a wave, but not one a new channel walks', () => {
  it('names it, with the grain spellings', () => {
    expect(waveFromName('granular')).toBe('granular');
    expect(waveFromName('grain')).toBe('granular');
    expect(waveFromName('grains')).toBe('granular');
    expect(waveFromName('cloud')).toBe('granular');
    expect(WAVE_LABELS.granular).toBe('GRN');
    // The default cycle is still the four tonal shapes.
    expect(waveForTrack(4)).toBe('square');
  });
});

// --- the synthesis ----------------------------------------------------------

interface FakeParam {
  value: number;
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
  setTargetAtTime(v: number, t: number, c: number): void;
}

function param(): FakeParam {
  return {
    value: 0,
    setValueAtTime(v: number) { this.value = v; },
    linearRampToValueAtTime(v: number) { this.value = v; },
    setTargetAtTime() {},
  };
}

function fakeContext() {
  const sources: { loop: boolean; buffer: { data: Float32Array } | null; playbackRate: FakeParam; detune: FakeParam }[] = [];
  const buffers: { data: Float32Array }[] = [];
  const ctx = {
    sampleRate: 44100,
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      const buffer = { length, data, getChannelData: () => data };
      buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      const src = {
        loop: false as boolean,
        buffer: null as { data: Float32Array } | null,
        playbackRate: param(),
        detune: param(),
        connect() { return this; },
        start() {},
        stop() {},
      };
      sources.push(src);
      return src;
    },
    createOscillator() { return { type: 'sine', frequency: param(), detune: param(), setPeriodicWave() {}, connect() { return this; }, start() {}, stop() {} }; },
    createGain() { return { gain: param(), connect() { return this; }, disconnect() {} }; },
    createBiquadFilter() { return { type: 'lowpass', frequency: param(), Q: param(), connect() { return this; } }; },
    createPeriodicWave() { return {}; },
  };
  return { ctx, sources, buffers };
}

const DESTINATION = { connect() { return this; }, disconnect() {} } as unknown as AudioNode;

function build(voice: VoiceParams, midi = 60) {
  const fake = fakeContext();
  buildNote(fake.ctx as unknown as BaseAudioContext, patchFromVoice(voice), midi, 0, 1, DESTINATION, null, {});
  return fake;
}

const granularVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'granular', duty });

/** The rendered cloud for a character, read back off the fake AudioBuffer. */
function cloud(duty: number): Float32Array {
  const { ctx, buffers } = fakeContext();
  makeGranularBuffer(ctx as unknown as BaseAudioContext, duty);
  return buffers[buffers.length - 1].data;
}

/** How much of the buffer is actually sounding, as a rough texture measure. */
function coverage(data: Float32Array): number {
  let live = 0;
  for (const sample of data) if (Math.abs(sample) > 0.05) live++;
  return live / data.length;
}

describe('the engine sprays a grain cloud', () => {
  it('uses a LOOPING buffer source, so the texture sustains', () => {
    const { sources } = build(granularVoice(0));
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(true);
    expect(sources[0].buffer).not.toBeNull();
  });

  it('plays the note pitch by rate, doubling an octave up', () => {
    const root = GRANULAR_BANK[0].rootHz;
    const low = build(granularVoice(0), 60);
    const high = build(granularVoice(0), 72);
    expect(low.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(60) / root, 2);
    expect(high.sources[0].playbackRate.value / low.sources[0].playbackRate.value).toBeCloseTo(2, 2);
  });

  it('renders the same cloud twice, and a different one per character', () => {
    const a = cloud(0);
    const b = cloud(0);
    const full = cloud(100);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(full));
    const peak = Math.max(...Array.from(a, Math.abs));
    expect(peak).toBeGreaterThan(0.9);
    expect(peak).toBeLessThanOrEqual(1.0001);
    expect(a.length).toBeGreaterThan(1000);
  });

  it('caches one buffer per bank slot', () => {
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    expect(makeGranularBuffer(real, 0)).toBe(makeGranularBuffer(real, 0));
    expect(makeGranularBuffer(real, 100)).not.toBe(makeGranularBuffer(real, 0));
  });

  it('loops without a click: the wrap is no bigger than a normal step', () => {
    for (let i = 0; i < GRANULAR_BANK.length; i++) {
      const data = cloud(i * 20);
      let maxStep = 0;
      for (let n = 1; n < data.length; n++) maxStep = Math.max(maxStep, Math.abs(data[n] - data[n - 1]));
      const wrap = Math.abs(data[0] - data[data.length - 1]);
      expect(wrap).toBeLessThanOrEqual(maxStep * 1.2 + 0.02);
    }
  });

  it('sprays grains: a long-grain cloud fills more of the buffer than a crackle', () => {
    // Small sparse grains leave most of the buffer silent; long overlapping ones
    // cover it. That gap is the whole difference between the two characters.
    const crackle = coverage(cloud(0));
    const smear = coverage(cloud(100));
    expect(smear).toBeGreaterThan(crackle + 0.1);
  });

  it('still builds an oscillator for a tonal wave', () => {
    const { sources } = build({ ...DEFAULT_VOICE, wave: 'triangle' });
    expect(sources).toHaveLength(0);
  });
});

// --- the language and the files --------------------------------------------

describe('a granular channel in a script and a file', () => {
  it('sets the wave, by either spelling', () => {
    expect(applied('tracks 1\ntrack 1 "LEAD" wave granular duty 0').song.tracks[0].voice.wave).toBe('granular');
    expect(applied('tracks 1\ntrack 1 "LEAD" wave grain duty 100').song.tracks[0].voice.wave).toBe('granular');
  });

  it('refuses an unknown wave, listing granular among the choices', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "LEAD" wave wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('granular');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'granular', duty: 60 };

    const json = songToJson(song);
    expect(json).toContain('"granular"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('granular');
    expect(parsed.song.tracks[0].voice.duty).toBe(60);

    expect(songToScript(song)).toContain('wave granular');
  });
});
