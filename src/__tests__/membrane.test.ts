import { describe, expect, it } from 'vitest';

import {
  buildNote,
  makeMembraneBuffer,
  MEMBRANE_BANK,
  membraneFor,
  membraneIndexFor,
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
 * The membrane bank: a struck skin, the struck family's second member.
 *
 * Two properties make it its own family, and both are in the numbers. Its
 * overtones are the DENSE, close Bessel ratios of a circle — 1, 1.59, 2.14, 2.30,
 * 2.65 … — packed tightly enough that an ear hears a thud with a pitch rather than
 * a bar's sparse chime. And a skin RELAXES, so its pitch DROOPS as it sounds,
 * which a bar's does not. Like `mallet` it is a rendered one-shot: it sounds once
 * and rings down, and `hold` cannot stretch it.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the membrane bank', () => {
  it('has six named drums, each with an ascending set of partials', () => {
    expect(MEMBRANE_BANK).toHaveLength(6);
    expect(new Set(MEMBRANE_BANK.map((v) => v.id)).size).toBe(MEMBRANE_BANK.length);
    for (const drum of MEMBRANE_BANK) {
      expect(drum.blurb.length).toBeGreaterThan(10);
      expect(drum.rootHz).toBeGreaterThan(0);
      expect(drum.partials.length).toBeGreaterThanOrEqual(4);
      let previous = 0;
      for (const partial of drum.partials) {
        expect(partial.gain).toBeGreaterThan(0);
        expect(partial.decay).toBeGreaterThan(0);
        expect(partial.ratio).toBeGreaterThan(previous);
        previous = partial.ratio;
      }
      // Every drum's fundamental is the note itself.
      expect(drum.partials[0].ratio).toBe(1);
    }
    expect(membraneFor(0).id).toBe(MEMBRANE_BANK[0].id);
    expect(membraneFor(100).id).toBe(MEMBRANE_BANK[MEMBRANE_BANK.length - 1].id);
  });

  it('picks a drum by duty, spread evenly and clamped', () => {
    expect(membraneIndexFor(0)).toBe(0);
    expect(membraneIndexFor(100)).toBe(MEMBRANE_BANK.length - 1);
    expect(membraneIndexFor(-10)).toBe(0);
    expect(membraneIndexFor(1000)).toBe(MEMBRANE_BANK.length - 1);
    expect(membraneFor(0).id).toBe('tom');
    expect(membraneFor(100).id).toBe('frame');
  });

  it('is DENSE where a bar is sparse — the ratios crowd together', () => {
    // The whole difference from `mallet`: a circle's overtones sit close to the
    // fundamental, uniformly spaced, rather than leaping to 4 or 10. Every
    // consecutive gap is well under a whole step, and the top partial stays low.
    for (const drum of MEMBRANE_BANK) {
      const ratios = drum.partials.map((p) => p.ratio);
      for (let i = 1; i < ratios.length; i++) {
        expect(ratios[i] - ratios[i - 1]).toBeLessThan(1);
      }
      expect(ratios[ratios.length - 1]).toBeLessThan(3.4);
    }
  });

  it('is INHARMONIC, which is the whole reason it is not a spectrum', () => {
    // Dense, yes, but still not whole multiples of the note — every drum carries
    // at least one overtone that is not an integer (the natural 1.59, 2.14, 2.44 …).
    for (const drum of MEMBRANE_BANK) {
      expect(drum.partials.slice(1).some((p) => !Number.isInteger(p.ratio))).toBe(true);
    }
  });

  it('droops in pitch — the skin starts a little high and settles', () => {
    // A skin relaxes as it sounds, so the note begins above its own pitch and
    // rolls down. Zero crossings isolate the PITCH (amplitude cannot move them),
    // so a higher crossing rate right after the strike than later is the droop.
    const data = makeMembraneBuffer(fakeContext().ctx as unknown as BaseAudioContext, 17).getChannelData(0);
    const crossings = (from: number, to: number) => {
      let n = 0;
      for (let i = from + 1; i < to; i++) {
        if ((data[i - 1] < 0) !== (data[i] < 0)) n++;
      }
      return n / (to - from);
    };
    // Just past the strike click, then well after the droop has settled.
    const early = crossings(300, 1300);
    const later = crossings(Math.floor(44100 * 0.2), Math.floor(44100 * 0.2) + 1000);
    expect(early).toBeGreaterThan(later);
  });
});

describe('membrane is a wave, but not one a new channel walks', () => {
  it('names it, with the skin spelling too', () => {
    expect(waveFromName('membrane')).toBe('membrane');
    expect(waveFromName('membranes')).toBe('membrane');
    expect(waveFromName('skin')).toBe('membrane');
    expect(WAVE_LABELS.membrane).toBe('MEM');
    expect(WAVE_LABELS.membrane).toHaveLength(3);
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

const membraneVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'membrane', duty });

describe('the engine strikes a skin once', () => {
  it('uses a NON-looping buffer source, not an oscillator', () => {
    const { sources } = build(membraneVoice(0));
    expect(sources).toHaveLength(1);
    // Struck, so it is a one-shot: it rings down rather than looping forever.
    expect(sources[0].loop).toBe(false);
    expect(sources[0].buffer).not.toBeNull();
  });

  it('plays the note pitch by rate, doubling an octave up', () => {
    const root = MEMBRANE_BANK[0].rootHz;
    const low = build(membraneVoice(0), 60);
    const high = build(membraneVoice(0), 72);
    expect(low.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(60) / root, 2);
    expect(high.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(72) / root, 2);
    expect(high.sources[0].playbackRate.value / low.sources[0].playbackRate.value).toBeCloseTo(2, 2);
  });

  it('picks a different drum for a different duty, and the same one twice', () => {
    const a = build(membraneVoice(0));
    const b = build(membraneVoice(100));
    expect(Array.from(a.buffers[0].data)).not.toEqual(Array.from(b.buffers[0].data));
    const again = build(membraneVoice(0));
    expect(Array.from(again.buffers[0].data)).toEqual(Array.from(a.buffers[0].data));
  });

  it('caches one buffer per bank slot', () => {
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    expect(makeMembraneBuffer(real, 0)).toBe(makeMembraneBuffer(real, 0));
    expect(makeMembraneBuffer(real, 100)).not.toBe(makeMembraneBuffer(real, 0));
  });

  it('strikes once and rings down — the tail is quieter than the start', () => {
    const data = makeMembraneBuffer(fakeContext().ctx as unknown as BaseAudioContext, 0).getChannelData(0);
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

describe('a membrane channel in a script and a file', () => {
  it('sets the wave, by either spelling', () => {
    expect(applied('tracks 1\ntrack 1 "TOM" wave membrane duty 0').song.tracks[0].voice.wave).toBe('membrane');
    expect(applied('tracks 1\ntrack 1 "KIT" wave skin duty 90').song.tracks[0].voice.wave).toBe('membrane');
  });

  it('refuses an unknown wave, listing membrane among the choices', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "LEAD" wave wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('membrane');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'membrane', duty: 20 };

    const json = songToJson(song);
    expect(json).toContain('"membrane"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('membrane');
    expect(parsed.song.tracks[0].voice.duty).toBe(20);

    expect(songToScript(song)).toContain('wave membrane');
  });
});
