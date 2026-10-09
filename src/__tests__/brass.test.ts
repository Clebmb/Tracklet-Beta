import { describe, expect, it } from 'vitest';

import {
  BRASS_BANK,
  brassFor,
  brassIndexFor,
  brassPeriodicWave,
  buildNote,
  REED_BANK,
  reedPeriodicWave,
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
 * The brass bank: a lip-driven wind instrument, built on the reed's machinery.
 *
 * The two families differ in their NUMBERS, not their model, and the number that
 * matters most is `even`. A conical bore — every brass instrument — keeps both
 * harmonic families, so nothing here is hollow the way a clarinet is; what makes a
 * muted trumpet thin is a formant in front of the bell, not a missing ladder.
 * `duty` picks the instrument, and the whole thing is deterministic.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the brass bank', () => {
  it('has six named instruments, each with one or more resonant peaks', () => {
    expect(BRASS_BANK).toHaveLength(6);
    expect(new Set(BRASS_BANK.map((v) => v.id)).size).toBe(BRASS_BANK.length);
    for (const voicing of BRASS_BANK) {
      expect(voicing.blurb.length).toBeGreaterThan(10);
      expect(voicing.peaks.length).toBeGreaterThanOrEqual(2);
      let previous = 0;
      for (const peak of voicing.peaks) {
        expect(peak.hz).toBeGreaterThan(0);
        expect(peak.gain).toBeGreaterThan(0);
        expect(peak.width).toBeGreaterThan(0);
        expect(peak.hz).toBeGreaterThan(previous);
        previous = peak.hz;
      }
      // A conical bore keeps BOTH families: this is the family's whole sound, and
      // it is what separates brass from the hollow clarinet in the reed bank.
      expect(voicing.even).toBeGreaterThan(0.6);
      expect(voicing.rolloff).toBeGreaterThan(0);
      // ...and the bell flares, so the spectrum stays bright — brass never rolls
      // off the way a deep bore does.
      expect(voicing.rolloff).toBeLessThanOrEqual(1);
    }
    expect(brassFor(0).id).toBe(BRASS_BANK[0].id);
    expect(brassFor(100).id).toBe(BRASS_BANK[BRASS_BANK.length - 1].id);
  });

  it('picks an instrument by duty, spread evenly and clamped', () => {
    expect(brassIndexFor(0)).toBe(0);
    expect(brassIndexFor(100)).toBe(BRASS_BANK.length - 1);
    expect(brassIndexFor(-10)).toBe(0);
    expect(brassIndexFor(1000)).toBe(BRASS_BANK.length - 1);
    expect(brassFor(0).id).toBe('trumpet');
    expect(brassFor(100).id).toBe('muted');
  });

  it('keeps the even harmonics a clarinet throws away', () => {
    // The comparison that makes the two banks two families rather than one moved
    // around: the least full brass voicing still keeps far more of its even
    // harmonics than the hollow reed next door.
    const even = (id: string) => BRASS_BANK.find((v) => v.id === id)!.even;
    const hollowReed = REED_BANK.find((v) => v.id === 'clarinet')!.even;
    expect(even('muted')).toBeGreaterThan(hollowReed * 5);
  });
});

describe('brass is a wave, but not one a new channel walks', () => {
  it('names it, with the plural spelling too', () => {
    expect(waveFromName('brass')).toBe('brass');
    expect(waveFromName('brasses')).toBe('brass');
    expect(WAVE_LABELS.brass).toBe('BRS');
    expect(WAVE_LABELS.brass).toHaveLength(3);
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

const brassVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'brass', duty });

/** The harmonics a brass instrument is built from, read back off the fake wave. */
function harmonicsOf(duty: number): Float32Array {
  const { ctx, waves } = fakeContext();
  brassPeriodicWave(ctx as unknown as BaseAudioContext, duty);
  return waves[waves.length - 1].imag;
}

describe('the engine wears brass as a periodic wave', () => {
  it('builds an OSCILLATOR, not a one-shot buffer source', () => {
    const { oscillators } = build(brassVoice(0));
    expect(oscillators).toHaveLength(1);
    // Brass SUSTAINS, so it is an oscillator wearing a spectrum.
    expect(oscillators[0].wave).not.toBeNull();
    expect(Array.from(oscillators[0].wave!.imag).some((v) => v !== 0)).toBe(true);
  });

  it('caches one periodic wave per bank slot and per context', () => {
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    expect(brassPeriodicWave(real, 0)).toBe(brassPeriodicWave(real, 0));
    expect(brassPeriodicWave(real, 60)).not.toBe(brassPeriodicWave(real, 0));
  });

  it('gives each instrument its own spectrum', () => {
    expect(Array.from(harmonicsOf(0))).not.toEqual(Array.from(harmonicsOf(100)));
  });

  it('keeps the second harmonic a reed would drop', () => {
    // Compared with a clarinet on the same fake context, so the only difference is
    // the number that decides a bore's fullness.
    const ratio = (curve: Float32Array) => curve[2] / curve[1];
    const { ctx: reedCtx, waves: reedWaves } = fakeContext();
    reedPeriodicWave(reedCtx as unknown as BaseAudioContext, 0);
    const clarinet = ratio(reedWaves[reedWaves.length - 1].imag);
    expect(ratio(harmonicsOf(0))).toBeGreaterThan(clarinet * 5);
  });

  it('still builds no periodic wave for a tonal square', () => {
    const { oscillators } = build({ ...DEFAULT_VOICE, wave: 'square' });
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].wave).toBeNull();
  });
});

// --- the language and the files --------------------------------------------

describe('a brass channel in a script and a file', () => {
  it('sets the wave, by either spelling', () => {
    expect(applied('tracks 1\ntrack 1 "HORN" wave brass duty 40').song.tracks[0].voice.wave).toBe('brass');
    expect(applied('tracks 1\ntrack 1 "STAB" wave brasses duty 0').song.tracks[0].voice.wave).toBe('brass');
  });

  it('refuses an unknown wave, listing brass among the choices', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "LEAD" wave wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('brass');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'brass', duty: 20 };

    const json = songToJson(song);
    expect(json).toContain('"brass"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('brass');
    expect(parsed.song.tracks[0].voice.duty).toBe(20);

    expect(songToScript(song)).toContain('wave brass');
  });
});
