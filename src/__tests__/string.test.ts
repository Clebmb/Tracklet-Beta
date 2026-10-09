import { describe, expect, it } from 'vitest';

import {
  buildNote,
  makeStringBuffer,
  STRING_BANK,
  stringFor,
  stringIndexFor,
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
 * The string bank: a plucked string from first principles, Karplus-Strong.
 *
 * Two properties make a string a STRING rather than an oscillator: it is
 * RENDERED (a noise burst ringing through a delay line, then played back), and it
 * is PITCHED by its playback rate, exactly the way a sample is. The render is
 * deterministic — no `Math.random` — so a note draws the same string in the app,
 * in an export and here. `duty` picks from the bank, the way it picks a wavetable
 * or a one-shot.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the string bank', () => {
  it('has five named strings, each at a real pitch', () => {
    expect(STRING_BANK).toHaveLength(5);
    expect(new Set(STRING_BANK.map((s) => s.id)).size).toBe(STRING_BANK.length);
    for (const string of STRING_BANK) {
      expect(string.label.length).toBeGreaterThanOrEqual(3);
      expect(string.blurb.length).toBeGreaterThan(10);
      expect(string.rootHz).toBeGreaterThan(0);
    }
    expect(stringFor(0).id).toBe(STRING_BANK[0].id);
    expect(stringFor(100).id).toBe(STRING_BANK[STRING_BANK.length - 1].id);
  });

  it('renders a normalized, non-silent buffer the same way every time', () => {
    for (const string of STRING_BANK) {
      const a = string.render(44100);
      const b = string.render(44100);
      expect(a.length).toBeGreaterThan(1000);
      expect(Array.from(a)).toEqual(Array.from(b));
      const peak = Math.max(...Array.from(a, Math.abs));
      expect(peak).toBeGreaterThan(0.9);
      expect(peak).toBeLessThanOrEqual(1.0001);
    }
  });

  it('picks a string by duty, spread evenly and clamped', () => {
    expect(stringIndexFor(0)).toBe(0);
    expect(stringIndexFor(100)).toBe(STRING_BANK.length - 1);
    expect(stringIndexFor(-10)).toBe(0);
    expect(stringIndexFor(1000)).toBe(STRING_BANK.length - 1);
  });
});

describe('string is a wave, but not one a new channel walks', () => {
  it('names it, with the karplus spellings', () => {
    expect(waveFromName('string')).toBe('string');
    expect(waveFromName('str')).toBe('string');
    expect(waveFromName('karplus')).toBe('string');
    expect(waveFromName('karplus-strong')).toBe('string');
    expect(WAVE_LABELS.string).toBe('STR');
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

const stringVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'string', duty });

describe('the engine plucks a string once', () => {
  it('uses a NON-looping buffer source, unlike the noise register', () => {
    const { sources } = build(stringVoice(0));
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(false);
    expect(sources[0].buffer).not.toBeNull();
  });

  it('plays the note pitch by rate, doubling an octave up', () => {
    const root = STRING_BANK[0].rootHz;
    const low = build(stringVoice(0), 60);
    const high = build(stringVoice(0), 72);
    expect(low.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(60) / root, 2);
    expect(high.sources[0].playbackRate.value).toBeCloseTo((midiToFreq(72) / root), 2);
    expect(high.sources[0].playbackRate.value / low.sources[0].playbackRate.value).toBeCloseTo(2, 2);
  });

  it('picks a different buffer for a different duty, and the same one twice', () => {
    const a = build(stringVoice(0));
    const b = build(stringVoice(100));
    expect(Array.from(a.buffers[0].data)).not.toEqual(Array.from(b.buffers[0].data));
    const again = build(stringVoice(0));
    expect(Array.from(again.buffers[0].data)).toEqual(Array.from(a.buffers[0].data));
  });

  it('caches one buffer per bank slot', () => {
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    expect(makeStringBuffer(real, 0)).toBe(makeStringBuffer(real, 0));
    expect(makeStringBuffer(real, 100)).not.toBe(makeStringBuffer(real, 0));
  });

  it('still builds an oscillator for a tonal wave', () => {
    const { sources } = build({ ...DEFAULT_VOICE, wave: 'triangle' });
    expect(sources).toHaveLength(0);
  });
});

// --- the language and the files --------------------------------------------

describe('a string channel in a script and a file', () => {
  it('sets the wave, by either spelling', () => {
    expect(applied('tracks 1\ntrack 1 "LEAD" wave string duty 0').song.tracks[0].voice.wave).toBe('string');
    expect(applied('tracks 1\ntrack 1 "LEAD" wave karplus duty 90').song.tracks[0].voice.wave).toBe('string');
  });

  it('refuses an unknown wave, listing string among the choices', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "LEAD" wave wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('string');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'string', duty: 75 };

    const json = songToJson(song);
    expect(json).toContain('"string"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('string');
    expect(parsed.song.tracks[0].voice.duty).toBe(75);

    expect(songToScript(song)).toContain('wave string');
  });
});
