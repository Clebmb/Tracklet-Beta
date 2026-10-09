import { describe, expect, it } from 'vitest';

import {
  buildNote,
  DRAWBAR_FOOTAGES,
  makeOrganBuffer,
  ORGAN_BANK,
  organFor,
  organIndexFor,
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
 * The drawbar organ: additive tonewheels, summed from the footages.
 *
 * Three properties make an organ a DRAWBAR ORGAN rather than another wavetable:
 * it ADDS sines rather than shaping one; its two lowest stops (16 feet and 5⅓
 * feet) sit BELOW the note, which no `PeriodicWave` can do; and it LOOPS, so a
 * held chord sustains for as long as `hold` says. `duty` picks the registration
 * from the bank, the way it picks a wavetable, a vowel or a sample.
 */

const SR = 44100;

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the drawbar bank', () => {
  it('has five registrations, each a nine-drawbar stack', () => {
    expect(ORGAN_BANK).toHaveLength(5);
    expect(new Set(ORGAN_BANK.map((o) => o.id)).size).toBe(ORGAN_BANK.length);
    for (const organ of ORGAN_BANK) {
      expect(organ.label.length).toBeGreaterThanOrEqual(3);
      expect(organ.blurb.length).toBeGreaterThan(10);
      expect(organ.drawbars).toHaveLength(DRAWBAR_FOOTAGES.length);
      expect(organ.rootHz).toBeGreaterThan(0);
      for (const level of organ.drawbars) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(8);
      }
      expect(organ.drawbars.some((level) => level > 0)).toBe(true);
    }
    expect(organFor(0).id).toBe(ORGAN_BANK[0].id);
    expect(organFor(100).id).toBe(ORGAN_BANK[ORGAN_BANK.length - 1].id);
  });

  it('gets progressively richer, so duty rises through the bank', () => {
    const counts = ORGAN_BANK.map((o) => o.drawbars.filter((level) => level > 0).length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[0]).toBeLessThan(counts[counts.length - 1]);
    // The two stops below the note are what the buffer buys over a `PeriodicWave`.
    expect(DRAWBAR_FOOTAGES[0]).toBe(0.5);
    expect(DRAWBAR_FOOTAGES[1]).toBeCloseTo(1 / 3, 6);
    expect(DRAWBAR_FOOTAGES[DRAWBAR_FOOTAGES.length - 1]).toBe(8);
  });

  it('picks a registration by duty, spread evenly and clamped', () => {
    expect(organIndexFor(0)).toBe(0);
    expect(organIndexFor(100)).toBe(ORGAN_BANK.length - 1);
    expect(organIndexFor(-10)).toBe(0);
    expect(organIndexFor(1000)).toBe(ORGAN_BANK.length - 1);
    expect(organFor(40).id).toBe('jazz');
  });
});

describe('organ is a wave, but not one a new channel walks', () => {
  it('names it, with the drawbar spellings', () => {
    expect(waveFromName('organ')).toBe('organ');
    expect(waveFromName('drawbar')).toBe('organ');
    expect(waveFromName('drawbars')).toBe('organ');
    expect(waveFromName('tonewheel')).toBe('organ');
    expect(waveFromName('hammond')).toBe('organ');
    expect(WAVE_LABELS.organ).toBe('ORG');
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
    sampleRate: SR,
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

const organVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'organ', duty });

/** The rendered tone for a registration, read back off the fake AudioBuffer. */
function tone(duty: number): Float32Array {
  const { ctx, buffers } = fakeContext();
  makeOrganBuffer(ctx as unknown as BaseAudioContext, duty);
  return buffers[buffers.length - 1].data;
}

/** How much of a single frequency a buffer holds, by a one-bin Fourier sum. */
function sineEnergy(data: Float32Array, hz: number): number {
  let re = 0;
  let im = 0;
  for (let n = 0; n < data.length; n++) {
    const a = (2 * Math.PI * hz * n) / SR;
    re += data[n] * Math.cos(a);
    im += data[n] * Math.sin(a);
  }
  return Math.sqrt(re * re + im * im) / data.length;
}

describe('the engine holds an organ', () => {
  it('uses a LOOPING buffer source, unlike a one-shot sample', () => {
    const { sources } = build(organVoice(0));
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(true);
    expect(sources[0].buffer).not.toBeNull();
  });

  it('plays the note pitch by rate, doubling an octave up', () => {
    const root = ORGAN_BANK[0].rootHz;
    const low = build(organVoice(0), 60);
    const high = build(organVoice(0), 72);
    expect(low.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(60) / root, 2);
    expect(high.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(72) / root, 2);
    expect(high.sources[0].playbackRate.value / low.sources[0].playbackRate.value).toBeCloseTo(2, 2);
  });

  it('renders the same tone twice, and a different one per registration', () => {
    const a = tone(0);
    const b = tone(0);
    const full = tone(100);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(full));
    // A tone is normalised, so no registration clips.
    const peak = Math.max(...Array.from(full, Math.abs));
    expect(peak).toBeGreaterThan(0.9);
    expect(peak).toBeLessThanOrEqual(1.0001);
  });

  it('caches one buffer per bank slot', () => {
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    expect(makeOrganBuffer(real, 0)).toBe(makeOrganBuffer(real, 0));
    expect(makeOrganBuffer(real, 100)).not.toBe(makeOrganBuffer(real, 0));
  });

  it('loops without a click: the wrap is no bigger than a normal step', () => {
    for (let i = 0; i < ORGAN_BANK.length; i++) {
      const data = tone(i * 20);
      let maxStep = 0;
      for (let n = 1; n < data.length; n++) maxStep = Math.max(maxStep, Math.abs(data[n] - data[n - 1]));
      const wrap = Math.abs(data[0] - data[data.length - 1]);
      expect(wrap).toBeLessThanOrEqual(maxStep * 1.2 + 0.02);
    }
  });

  it('sounds the sub-octave a PeriodicWave cannot', () => {
    const root = ORGAN_BANK[0].rootHz;
    // FLUTE is the 8-foot stop alone: the note and nothing below it.
    const flute = tone(0);
    expect(sineEnergy(flute, root)).toBeGreaterThan(0.4);
    expect(sineEnergy(flute, root / 2)).toBeLessThan(0.01);
    // JAZZ pulls 16 and 5⅓ feet, which are an octave and a twelfth DOWN.
    const jazz = tone(40);
    expect(sineEnergy(jazz, root / 2)).toBeGreaterThan(0.05);
    expect(sineEnergy(jazz, root / 3)).toBeGreaterThan(0.05);
  });

  it('still builds an oscillator for a tonal wave', () => {
    const { sources } = build({ ...DEFAULT_VOICE, wave: 'triangle' });
    expect(sources).toHaveLength(0);
  });
});

// --- the language and the files --------------------------------------------

describe('an organ channel in a script and a file', () => {
  it('sets the wave, by either spelling', () => {
    expect(applied('tracks 1\ntrack 1 "LEAD" wave organ duty 0').song.tracks[0].voice.wave).toBe('organ');
    expect(applied('tracks 1\ntrack 1 "LEAD" wave drawbar duty 100').song.tracks[0].voice.wave).toBe('organ');
  });

  it('refuses an unknown wave, listing organ among the choices', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "LEAD" wave wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('organ');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'organ', duty: 45 };

    const json = songToJson(song);
    expect(json).toContain('"organ"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('organ');
    expect(parsed.song.tracks[0].voice.duty).toBe(45);

    expect(songToScript(song)).toContain('wave organ');
  });
});
