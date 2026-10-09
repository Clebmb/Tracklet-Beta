import { describe, expect, it } from 'vitest';

import {
  BOW_BANK,
  bowFor,
  bowIndexFor,
  bowPeriodicWave,
  BRASS_BANK,
  buildNote,
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
 * The bow bank: a bowed string, the third exciter on the same machinery.
 *
 * A bow's stick-slip is the exciter and a hollow BODY is the resonator, which is
 * what separates this bank from the wind instruments: a body's resonances sit low
 * and broad (an air resonance plus a diffuse "bridge hill"), where a tube's sit
 * high and pointed. And it SUSTAINS, which is the whole reason to reach for `bow`
 * over `string` — a pluck is over as soon as it starts.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the bow bank', () => {
  it('has six named strings, each with one or more resonant peaks', () => {
    expect(BOW_BANK).toHaveLength(6);
    expect(new Set(BOW_BANK.map((v) => v.id)).size).toBe(BOW_BANK.length);
    for (const voicing of BOW_BANK) {
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
      // A bow keeps both harmonic families, like brass — nothing here is hollow.
      expect(voicing.even).toBeGreaterThan(0.6);
      expect(voicing.rolloff).toBeGreaterThan(0);
    }
    expect(bowFor(0).id).toBe(BOW_BANK[0].id);
    expect(bowFor(100).id).toBe(BOW_BANK[BOW_BANK.length - 1].id);
  });

  it('picks an instrument by duty, spread evenly and clamped', () => {
    expect(bowIndexFor(0)).toBe(0);
    expect(bowIndexFor(100)).toBe(BOW_BANK.length - 1);
    expect(bowIndexFor(-10)).toBe(0);
    expect(bowIndexFor(1000)).toBe(BOW_BANK.length - 1);
    expect(bowFor(0).id).toBe('violin');
    expect(bowFor(100).id).toBe('strings');
  });

  it('rings a box, not a tube: the peaks sit lower than a wind instrument\'s', () => {
    // The family's signature, as a number: a body resonator rings below where a
    // mouthpiece or a reed does, so the lowest peak of every bowed voicing sits
    // under the lowest peak of the brass bank.
    const lowestPeak = (bank: readonly { peaks: readonly { hz: number }[] }[]) =>
      Math.min(...bank.map((v) => v.peaks[0].hz));
    expect(lowestPeak(BOW_BANK)).toBeLessThan(lowestPeak(BRASS_BANK));
    for (const voicing of BOW_BANK) expect(voicing.peaks[0].hz).toBeLessThan(800);
    // ...and the section is BROAD rather than pointed: wide overlapping peaks are
    // what several players at once sound like.
    const strings = BOW_BANK.find((v) => v.id === 'strings')!;
    expect(strings.peaks[0].width).toBeGreaterThanOrEqual(400);
  });
});

describe('bow is a wave, but not one a new channel walks', () => {
  it('names it, with the past-tense spelling too', () => {
    expect(waveFromName('bow')).toBe('bow');
    expect(waveFromName('bowed')).toBe('bow');
    expect(WAVE_LABELS.bow).toBe('BOW');
    expect(WAVE_LABELS.bow).toHaveLength(3);
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

const bowVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'bow', duty });

/** The harmonics a bowed string is built from, read back off the fake wave. */
function harmonicsOf(duty: number): Float32Array {
  const { ctx, waves } = fakeContext();
  bowPeriodicWave(ctx as unknown as BaseAudioContext, duty);
  return waves[waves.length - 1].imag;
}

describe('the engine wears a bow as a periodic wave', () => {
  it('builds an OSCILLATOR, not a one-shot buffer source', () => {
    const { oscillators } = build(bowVoice(0));
    expect(oscillators).toHaveLength(1);
    // A bow SUSTAINS, so it is an oscillator wearing a spectrum rather than the
    // fixed-length pluck a `string` is.
    expect(oscillators[0].wave).not.toBeNull();
    expect(Array.from(oscillators[0].wave!.imag).some((v) => v !== 0)).toBe(true);
  });

  it('caches one periodic wave per bank slot and per context', () => {
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    expect(bowPeriodicWave(real, 0)).toBe(bowPeriodicWave(real, 0));
    expect(bowPeriodicWave(real, 60)).not.toBe(bowPeriodicWave(real, 0));
  });

  it('gives each instrument its own spectrum', () => {
    expect(Array.from(harmonicsOf(0))).not.toEqual(Array.from(harmonicsOf(100)));
  });

  it('still builds no periodic wave for a tonal sine', () => {
    const { oscillators } = build({ ...DEFAULT_VOICE, wave: 'sine' });
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].wave).toBeNull();
  });
});

// --- the language and the files --------------------------------------------

describe('a bow channel in a script and a file', () => {
  it('sets the wave, by either spelling', () => {
    expect(applied('tracks 1\ntrack 1 "CELLO" wave bow duty 40').song.tracks[0].voice.wave).toBe('bow');
    expect(applied('tracks 1\ntrack 1 "ENS" wave bowed duty 100').song.tracks[0].voice.wave).toBe('bow');
  });

  it('refuses an unknown wave, listing bow among the choices', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "LEAD" wave wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('bow');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'bow', duty: 40 };

    const json = songToJson(song);
    expect(json).toContain('"bow"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('bow');
    expect(parsed.song.tracks[0].voice.duty).toBe(40);

    expect(songToScript(song)).toContain('wave bow');
  });
});
