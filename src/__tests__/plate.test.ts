import { describe, expect, it } from 'vitest';

import {
  buildNote,
  makePlateBuffer,
  PLATE_BANK,
  plateFor,
  plateIndexFor,
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
 * The plate bank: a struck plate, the struck family's third and most metallic
 * member.
 *
 * Two properties separate it from a bar or a skin, and both are in the numbers.
 * Its overtones are SPARSE and spread far apart — a bell's hum sits an octave
 * BELOW its strike tone, a tierce a minor third above it, a nominal an octave up —
 * so the top partial sits several times the fundamental away, where a skin's all
 * crowd under three. And they ring for SECONDS, far longer than a bar. Like
 * `mallet` and `membrane` it is a rendered one-shot: it sounds once and rings
 * down, and `hold` cannot stretch it.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the plate bank', () => {
  it('has six named plates, each with an ascending set of partials', () => {
    expect(PLATE_BANK).toHaveLength(6);
    expect(new Set(PLATE_BANK.map((v) => v.id)).size).toBe(PLATE_BANK.length);
    for (const plate of PLATE_BANK) {
      expect(plate.blurb.length).toBeGreaterThan(10);
      expect(plate.rootHz).toBeGreaterThan(0);
      // Sparse, unlike a skin: a handful of partials, never a crowd.
      expect(plate.partials.length).toBeGreaterThanOrEqual(4);
      expect(plate.partials.length).toBeLessThanOrEqual(6);
      let previous = 0;
      for (const partial of plate.partials) {
        expect(partial.gain).toBeGreaterThan(0);
        expect(partial.decay).toBeGreaterThan(0);
        expect(partial.ratio).toBeGreaterThan(previous);
        previous = partial.ratio;
      }
      // Every plate carries its strike tone (the nominal an octave up is extra).
      expect(plate.partials.some((p) => p.ratio === 1)).toBe(true);
    }
    expect(plateFor(0).id).toBe(PLATE_BANK[0].id);
    expect(plateFor(100).id).toBe(PLATE_BANK[PLATE_BANK.length - 1].id);
  });

  it('picks a plate by duty, spread evenly and clamped', () => {
    expect(plateIndexFor(0)).toBe(0);
    expect(plateIndexFor(100)).toBe(PLATE_BANK.length - 1);
    expect(plateIndexFor(-10)).toBe(0);
    expect(plateIndexFor(1000)).toBe(PLATE_BANK.length - 1);
    expect(plateFor(0).id).toBe('bell');
    expect(plateFor(100).id).toBe('crash');
  });

  it('is SPARSE and far-spread where a skin is dense — the opposite extreme', () => {
    // A membrane's top partial stays under 3.4x; a plate's leaps to 3x or far
    // beyond, which is the gap an ear reads as cast metal rather than a drumhead.
    for (const plate of PLATE_BANK) {
      const top = plate.partials[plate.partials.length - 1].ratio;
      expect(top).toBeGreaterThanOrEqual(3);
    }
  });

  it('is INHARMONIC, with a bell partial BELOW its strike tone', () => {
    for (const plate of PLATE_BANK) {
      expect(plate.partials.some((p) => !Number.isInteger(p.ratio))).toBe(true);
    }
    // The bell's hum rings an octave under the nominal — the signature of a bell.
    const bell = PLATE_BANK.find((p) => p.id === 'bell')!;
    expect(bell.partials.some((p) => p.ratio < 1)).toBe(true);
  });

  it('rings LONG — the biggest plate still sounds far later than the hardest hit', () => {
    const ctx = fakeContext().ctx as unknown as BaseAudioContext;
    const tail = (data: Float32Array) => {
      const from = data.length - 4410;
      let sum = 0;
      for (let i = from; i < data.length; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / 4410);
    };
    const tamtam = tail(makePlateBuffer(ctx, 60).getChannelData(0)); // tam-tam
    const anvil = tail(makePlateBuffer(ctx, 80).getChannelData(0));  // anvil
    expect(tamtam).toBeGreaterThan(anvil);
  });
});

describe('plate is a wave, but not one a new channel walks', () => {
  it('names it, with the plural spelling too', () => {
    expect(waveFromName('plate')).toBe('plate');
    expect(waveFromName('plates')).toBe('plate');
    expect(WAVE_LABELS.plate).toBe('PLT');
    expect(WAVE_LABELS.plate).toHaveLength(3);
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

const plateVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'plate', duty });

describe('the engine strikes a plate once', () => {
  it('uses a NON-looping buffer source, not an oscillator', () => {
    const { sources } = build(plateVoice(0));
    expect(sources).toHaveLength(1);
    // Struck, so it is a one-shot: it rings down rather than looping forever.
    expect(sources[0].loop).toBe(false);
    expect(sources[0].buffer).not.toBeNull();
  });

  it('plays the note pitch by rate, doubling an octave up', () => {
    const root = PLATE_BANK[0].rootHz;
    const low = build(plateVoice(0), 60);
    const high = build(plateVoice(0), 72);
    expect(low.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(60) / root, 2);
    expect(high.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(72) / root, 2);
    expect(high.sources[0].playbackRate.value / low.sources[0].playbackRate.value).toBeCloseTo(2, 2);
  });

  it('picks a different plate for a different duty, and the same one twice', () => {
    const a = build(plateVoice(0));
    const b = build(plateVoice(100));
    expect(Array.from(a.buffers[0].data)).not.toEqual(Array.from(b.buffers[0].data));
    const again = build(plateVoice(0));
    expect(Array.from(again.buffers[0].data)).toEqual(Array.from(a.buffers[0].data));
  });

  it('caches one buffer per bank slot', () => {
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    expect(makePlateBuffer(real, 0)).toBe(makePlateBuffer(real, 0));
    expect(makePlateBuffer(real, 100)).not.toBe(makePlateBuffer(real, 0));
  });

  it('strikes once and rings down — the tail is quieter than the start', () => {
    const data = makePlateBuffer(fakeContext().ctx as unknown as BaseAudioContext, 0).getChannelData(0);
    const rms = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / Math.max(1, to - from));
    };
    const head = rms(0, Math.floor(44100 * STRIKE_SECONDS));
    const tail = rms(data.length - 4410, data.length);
    expect(head).toBeGreaterThan(tail);
  });
});

// --- the language and the files --------------------------------------------

describe('a plate channel in a script and a file', () => {
  it('sets the wave, by either spelling', () => {
    expect(applied('tracks 1\ntrack 1 "BEL" wave plate duty 0').song.tracks[0].voice.wave).toBe('plate');
    expect(applied('tracks 1\ntrack 1 "CYMB" wave plates duty 100').song.tracks[0].voice.wave).toBe('plate');
  });

  it('refuses an unknown wave, listing plate among the choices', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "LEAD" wave wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('plate');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'plate', duty: 20 };

    const json = songToJson(song);
    expect(json).toContain('"plate"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('plate');
    expect(parsed.song.tracks[0].voice.duty).toBe(20);

    expect(songToScript(song)).toContain('wave plate');
  });
});
