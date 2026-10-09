import { describe, expect, it } from 'vitest';

import {
  buildNote,
  makeMalletBuffer,
  MALLET_BANK,
  malletFor,
  malletIndexFor,
  STRIKE_SECONDS,
} from '../audio/synth';
import {
  createSong,
  DEFAULT_VOICE,
  midiToFreq,
  patchFromVoice,
  WAVE_LABELS,
  waveForTrack,
  waveFromName,
  type VoiceParams,
} from '../model';
import { applyScript } from '../model/script';
import { songFromJson, songToJson, songToScript } from '../model/songfile';

/**
 * The mallet bank: a struck bar, the struck family's first member.
 *
 * Two properties make it its own family. Its overtones are INHARMONIC — not whole
 * multiples of the note — which is why it is a rendered one-shot rather than a
 * `PeriodicWave`: a spectrum cannot say 2.76. And a bar is STRUCK, so like `string`
 * and `sample` it sounds once and rings down; `hold` cannot stretch it.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the mallet bank', () => {
  it('has six named bars, each with an ascending set of partials', () => {
    expect(MALLET_BANK).toHaveLength(6);
    expect(new Set(MALLET_BANK.map((v) => v.id)).size).toBe(MALLET_BANK.length);
    for (const bar of MALLET_BANK) {
      expect(bar.blurb.length).toBeGreaterThan(10);
      expect(bar.rootHz).toBeGreaterThan(0);
      expect(bar.partials.length).toBeGreaterThanOrEqual(2);
      let previous = 0;
      for (const partial of bar.partials) {
        expect(partial.gain).toBeGreaterThan(0);
        expect(partial.decay).toBeGreaterThan(0);
        expect(partial.ratio).toBeGreaterThan(previous);
        previous = partial.ratio;
      }
      // Every bar's fundamental is the note itself.
      expect(bar.partials[0].ratio).toBe(1);
    }
    expect(malletFor(0).id).toBe(MALLET_BANK[0].id);
    expect(malletFor(100).id).toBe(MALLET_BANK[MALLET_BANK.length - 1].id);
  });

  it('picks a bar by duty, spread evenly and clamped', () => {
    expect(malletIndexFor(0)).toBe(0);
    expect(malletIndexFor(100)).toBe(MALLET_BANK.length - 1);
    expect(malletIndexFor(-10)).toBe(0);
    expect(malletIndexFor(1000)).toBe(MALLET_BANK.length - 1);
    expect(malletFor(0).id).toBe('marimba');
    expect(malletFor(100).id).toBe('kalimba');
  });

  it('is INHARMONIC, which is the whole reason it is not a spectrum', () => {
    // A harmonic wave's overtones are 2, 3, 4 … times the note. A struck bar's are
    // not, and that gap is the family. At least one bar must have a partial that is
    // not a whole multiple — the metal ones carry the natural 2.76.
    const inharmonic = MALLET_BANK.filter((bar) => bar.partials.some((p) => !Number.isInteger(p.ratio)));
    expect(inharmonic.length).toBeGreaterThan(0);
    const glock = MALLET_BANK.find((bar) => bar.id === 'glockenspiel')!;
    expect(glock.partials.some((p) => Math.abs(p.ratio - 2.76) < 1e-9)).toBe(true);
    // ...and a bar's partials decay at DIFFERENT rates, which a spectrum cannot do.
    const spread = (bar: typeof MALLET_BANK[number]) =>
      Math.max(...bar.partials.map((p) => p.decay)) / Math.min(...bar.partials.map((p) => p.decay));
    expect(spread(glock)).toBeGreaterThan(1.5);
  });
});

describe('mallet is a wave, but not one a new channel walks', () => {
  it('names it, with the struck spelling too', () => {
    expect(waveFromName('mallet')).toBe('mallet');
    expect(waveFromName('mallets')).toBe('mallet');
    expect(waveFromName('struck')).toBe('mallet');
    expect(WAVE_LABELS.mallet).toBe('MLT');
    expect(WAVE_LABELS.mallet).toHaveLength(3);
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

const malletVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'mallet', duty });

describe('the engine strikes a bar once', () => {
  it('uses a NON-looping buffer source, not an oscillator', () => {
    const { sources } = build(malletVoice(0));
    expect(sources).toHaveLength(1);
    // Struck, so it is a one-shot: it rings down rather than looping forever.
    expect(sources[0].loop).toBe(false);
    expect(sources[0].buffer).not.toBeNull();
  });

  it('plays the note pitch by rate, doubling an octave up', () => {
    const root = MALLET_BANK[0].rootHz;
    const low = build(malletVoice(0), 60);
    const high = build(malletVoice(0), 72);
    expect(low.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(60) / root, 2);
    expect(high.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(72) / root, 2);
    expect(high.sources[0].playbackRate.value / low.sources[0].playbackRate.value).toBeCloseTo(2, 2);
  });

  it('picks a different bar for a different duty, and the same one twice', () => {
    const a = build(malletVoice(0));
    const b = build(malletVoice(100));
    expect(Array.from(a.buffers[0].data)).not.toEqual(Array.from(b.buffers[0].data));
    const again = build(malletVoice(0));
    expect(Array.from(again.buffers[0].data)).toEqual(Array.from(a.buffers[0].data));
  });

  it('caches one buffer per bank slot', () => {
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    expect(makeMalletBuffer(real, 0)).toBe(makeMalletBuffer(real, 0));
    expect(makeMalletBuffer(real, 100)).not.toBe(makeMalletBuffer(real, 0));
  });

  it('strikes once and rings down — the tail is quieter than the start', () => {
    // The envelope a struck bar must have, checked on the rendered samples: loud
    // at the attack, quieter later, but never a square of constant level.
    const data = makeMalletBuffer(fakeContext().ctx as unknown as BaseAudioContext, 0).getChannelData(0);
    const rms = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / Math.max(1, to - from));
    };
    const head = rms(0, Math.floor(44100 * STRIKE_SECONDS));
    const tail = rms(data.length - 4410, data.length);
    expect(head).toBeGreaterThan(tail);
  });

  it('still builds an oscillator for a tonal wave', () => {
    const { sources } = build({ ...DEFAULT_VOICE, wave: 'triangle' });
    expect(sources).toHaveLength(0);
  });
});

// --- the language and the files --------------------------------------------

describe('a mallet channel in a script and a file', () => {
  it('sets the wave, by either spelling', () => {
    expect(applied('tracks 1\ntrack 1 "MAR" wave mallet duty 0').song.tracks[0].voice.wave).toBe('mallet');
    expect(applied('tracks 1\ntrack 1 "BOX" wave struck duty 90').song.tracks[0].voice.wave).toBe('mallet');
  });

  it('refuses an unknown wave, listing mallet among the choices', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "LEAD" wave wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('mallet');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'mallet', duty: 20 };

    const json = songToJson(song);
    expect(json).toContain('"mallet"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('mallet');
    expect(parsed.song.tracks[0].voice.duty).toBe(20);

    expect(songToScript(song)).toContain('wave mallet');
  });
});
