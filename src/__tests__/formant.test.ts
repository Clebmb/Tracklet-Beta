import { describe, expect, it } from 'vitest';

import {
  buildNote,
  FORMANT_BANK,
  formantFor,
  formantIndexFor,
  formantPeriodicWave,
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

/**
 * The formant bank: a vowel from first principles, formant synthesis.
 *
 * Two properties make a vowel a VOWEL rather than another wavetable: the spectrum
 * has HUMP where the mouth resonates on top of the glottal buzz, and it LOOPS, so
 * a note sustains for as long as `hold` says — which is what separates it from a
 * one-shot `sample` or `string`. `duty` picks the vowel from the bank, the way it
 * picks a wavetable or a sample, and the whole thing is deterministic, so a note
 * is the same vowel in the app, in an export and here.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the formant bank', () => {
  it('has five named vowels, each with three formants', () => {
    expect(FORMANT_BANK).toHaveLength(5);
    expect(new Set(FORMANT_BANK.map((v) => v.id)).size).toBe(FORMANT_BANK.length);
    for (const vowel of FORMANT_BANK) {
      expect(vowel.label).toHaveLength(2);
      expect(vowel.blurb.length).toBeGreaterThan(10);
      expect(vowel.formants).toHaveLength(3);
      for (const peak of vowel.formants) {
        expect(peak.hz).toBeGreaterThan(0);
        expect(peak.gain).toBeGreaterThan(0);
        expect(peak.width).toBeGreaterThan(0);
      }
      // The first formant is the loudest and never above the second: a vowel whose
      // low formant outshouted the rest would read as a buzz and not a vowel.
      expect(vowel.formants[0].hz).toBeLessThan(vowel.formants[1].hz);
      expect(vowel.formants[1].hz).toBeLessThan(vowel.formants[2].hz);
    }
    expect(formantFor(0).id).toBe(FORMANT_BANK[0].id);
    expect(formantFor(100).id).toBe(FORMANT_BANK[FORMANT_BANK.length - 1].id);
  });

  it('picks a vowel by duty, spread evenly and clamped', () => {
    expect(formantIndexFor(0)).toBe(0);
    expect(formantIndexFor(100)).toBe(FORMANT_BANK.length - 1);
    expect(formantIndexFor(-10)).toBe(0);
    expect(formantIndexFor(1000)).toBe(FORMANT_BANK.length - 1);
    expect(formantFor(40).id).toBe('ee');
  });
});

describe('formant is a wave, but not one a new channel walks', () => {
  it('names it, with the vowel spellings', () => {
    expect(waveFromName('formant')).toBe('formant');
    expect(waveFromName('vowel')).toBe('formant');
    expect(waveFromName('vowels')).toBe('formant');
    expect(waveFromName('vox')).toBe('formant');
    expect(WAVE_LABELS.formant).toBe('FRM');
    expect(WAVE_LABELS.formant).toHaveLength(3);
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
  return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} };
}

interface FakeWave {
  real: Float32Array;
  imag: Float32Array;
}

function fakeContext() {
  const waves: FakeWave[] = [];
  const oscillators: { type: string; wave: FakeWave | null }[] = [];
  const ctx = {
    sampleRate: 44100,
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return { length, data, getChannelData: () => data };
    },
    createBufferSource() {
      return {
        loop: false,
        buffer: null,
        playbackRate: param(),
        detune: param(),
        connect() { return this; },
        start() {},
        stop() {},
      };
    },
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: param(),
        detune: param(),
        wave: null as FakeWave | null,
        setPeriodicWave(w: FakeWave) { this.wave = w; },
        connect() { return this; },
        start() {},
        stop() {},
      };
      oscillators.push(osc);
      return osc;
    },
    createGain() { return { gain: param(), connect() { return this; }, disconnect() {} }; },
    createBiquadFilter() { return { type: 'lowpass', frequency: param(), Q: param(), connect() { return this; } }; },
    createPeriodicWave(real: Float32Array, imag: Float32Array) {
      const wave: FakeWave = { real, imag };
      waves.push(wave);
      return wave;
    },
  };
  return { ctx, oscillators, waves };
}

const DESTINATION = { connect() { return this; }, disconnect() {} } as unknown as AudioNode;

function build(voice: VoiceParams) {
  const fake = fakeContext();
  buildNote(fake.ctx as unknown as BaseAudioContext, patchFromVoice(voice), 60, 0, 1, DESTINATION, null, {});
  return fake;
}

const formantVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'formant', duty });

/** The harmonics a vowel is built from, read back off the fake PeriodicWave. */
function harmonicsOf(duty: number): Float32Array {
  const { ctx, waves } = fakeContext();
  formantPeriodicWave(ctx as unknown as BaseAudioContext, duty);
  return waves[waves.length - 1].imag;
}

describe('the engine wears a vowel as a periodic wave', () => {
  it('builds an OSCILLATOR, not a one-shot buffer source', () => {
    const { oscillators } = build(formantVoice(0));
    expect(oscillators).toHaveLength(1);
    // A vowel SUSTAINS, so it is an oscillator wearing a spectrum rather than a
    // fixed-length sound triggered once.
    expect(oscillators[0].wave).not.toBeNull();
    expect(Array.from(oscillators[0].wave!.imag).some((v) => v !== 0)).toBe(true);
  });

  it('caches one periodic wave per bank slot and per context', () => {
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    expect(formantPeriodicWave(real, 0)).toBe(formantPeriodicWave(real, 0));
    expect(formantPeriodicWave(real, 40)).not.toBe(formantPeriodicWave(real, 0));
  });

  it('gives each vowel its own spectrum', () => {
    const ah = harmonicsOf(0);
    const ee = harmonicsOf(40);
    expect(Array.from(ah)).not.toEqual(Array.from(ee));
  });

  it('puts the "ee" fundamental inside its low first formant', () => {
    // "ee" has a very low F1 (~270 Hz), so the note's fundamental lands on it and
    // rings loud; "ah" has its first formant up near 730 Hz, so harmonic 1 is far
    // from any peak and stays quiet.
    const ah = harmonicsOf(0);
    const ee = harmonicsOf(40);
    expect(ee[1]).toBeGreaterThan(ah[1] * 5);
  });

  it('lifts the second formant as a hump, and puts it in a different place', () => {
    // "ee"'s second formant is high (~2290 Hz, near the ninth harmonic of middle C),
    // so harmonic 9 stands above harmonic 3. "ah"'s is at ~1090 Hz, near harmonic
    // 4, so the same pair reverses — the pair of resonances MOVING is the vowel.
    const ah = harmonicsOf(0);
    const ee = harmonicsOf(40);
    expect(ee[9]).toBeGreaterThan(ee[3]);
    expect(ah[3]).toBeGreaterThan(ah[9]);
  });

  it('still builds no oscillator buffer for a tonal wave', () => {
    const { oscillators } = build({ ...DEFAULT_VOICE, wave: 'triangle' });
    // A triangle never calls setPeriodicWave, so its oscillator wears no wave.
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].wave).toBeNull();
  });
});

// --- the language and the files --------------------------------------------

describe('a formant channel in a script and a file', () => {
  it('sets the wave, by either spelling', () => {
    expect(applied('tracks 1\ntrack 1 "LEAD" wave formant duty 0').song.tracks[0].voice.wave).toBe('formant');
    expect(applied('tracks 1\ntrack 1 "LEAD" wave vowel duty 80').song.tracks[0].voice.wave).toBe('formant');
  });

  it('refuses an unknown wave, listing formant among the choices', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "LEAD" wave wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('formant');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'formant', duty: 40 };

    const json = songToJson(song);
    expect(json).toContain('"formant"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('formant');
    expect(parsed.song.tracks[0].voice.duty).toBe(40);

    expect(songToScript(song)).toContain('wave formant');
  });
});
