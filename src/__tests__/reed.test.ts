import { describe, expect, it } from 'vitest';

import {
  buildNote,
  REED_BANK,
  reedFor,
  reedIndexFor,
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
 * The reed bank: a wind instrument from first principles.
 *
 * Two properties make a reed a REED rather than another wavetable: the spectrum
 * has HUMPS where the tube resonates on top of the exciter's buzz, and the bore's
 * shape decides which harmonic FAMILIES survive — a clarinet's stopped tube keeps
 * the odd ones and hollows the tone, an oboe's conical bore keeps both. `duty`
 * picks the reed from the bank, and the whole thing is deterministic, so a note is
 * the same reed in the app, in an export and here. Like the vowel it is a
 * `PeriodicWave`, so it SUSTAINS for as long as `hold` says.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the reed bank', () => {
  it('has six named reeds, each with one or more resonant peaks', () => {
    expect(REED_BANK).toHaveLength(6);
    expect(new Set(REED_BANK.map((v) => v.id)).size).toBe(REED_BANK.length);
    for (const voicing of REED_BANK) {
      expect(voicing.blurb.length).toBeGreaterThan(10);
      expect(voicing.peaks.length).toBeGreaterThanOrEqual(2);
      // A reed is a tube with resonances: they climb, the way a bore's do.
      let previous = 0;
      for (const peak of voicing.peaks) {
        expect(peak.hz).toBeGreaterThan(0);
        expect(peak.gain).toBeGreaterThan(0);
        expect(peak.width).toBeGreaterThan(0);
        expect(peak.hz).toBeGreaterThan(previous);
        previous = peak.hz;
      }
      // The even family is a fraction, and the exciter's roll-off is positive.
      expect(voicing.even).toBeGreaterThanOrEqual(0);
      expect(voicing.even).toBeLessThanOrEqual(1);
      expect(voicing.rolloff).toBeGreaterThan(0);
    }
    expect(reedFor(0).id).toBe(REED_BANK[0].id);
    expect(reedFor(100).id).toBe(REED_BANK[REED_BANK.length - 1].id);
  });

  it('picks a reed by duty, spread evenly and clamped', () => {
    expect(reedIndexFor(0)).toBe(0);
    expect(reedIndexFor(100)).toBe(REED_BANK.length - 1);
    expect(reedIndexFor(-10)).toBe(0);
    expect(reedIndexFor(1000)).toBe(REED_BANK.length - 1);
    expect(reedFor(0).id).toBe('clarinet');
    expect(reedFor(100).id).toBe('bagpipe');
  });

  it('gives the clarinet the hollowest bore and the sax the fullest', () => {
    // The one number that makes a clarinet woody: its stopped tube keeps almost no
    // even harmonics. Nothing else in the bank is anywhere near as hollow.
    const even = (id: string) => REED_BANK.find((v) => v.id === id)!.even;
    expect(even('clarinet')).toBeLessThan(0.1);
    expect(even('clarinet')).toBeLessThan(even('bassoon'));
    expect(even('sax')).toBeGreaterThan(0.8);
  });
});

describe('reed is a wave, but not one a new channel walks', () => {
  it('names it, with the plural spelling too', () => {
    expect(waveFromName('reed')).toBe('reed');
    expect(waveFromName('reeds')).toBe('reed');
    expect(WAVE_LABELS.reed).toBe('RED');
    expect(WAVE_LABELS.reed).toHaveLength(3);
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

const reedVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'reed', duty });

/** The harmonics a reed is built from, read back off the fake PeriodicWave. */
function harmonicsOf(duty: number): Float32Array {
  const { ctx, waves } = fakeContext();
  reedPeriodicWave(ctx as unknown as BaseAudioContext, duty);
  return waves[waves.length - 1].imag;
}

describe('the engine wears a reed as a periodic wave', () => {
  it('builds an OSCILLATOR, not a one-shot buffer source', () => {
    const { oscillators } = build(reedVoice(0));
    expect(oscillators).toHaveLength(1);
    // A reed SUSTAINS, so it is an oscillator wearing a spectrum rather than a
    // fixed-length sound triggered once.
    expect(oscillators[0].wave).not.toBeNull();
    expect(Array.from(oscillators[0].wave!.imag).some((v) => v !== 0)).toBe(true);
  });

  it('caches one periodic wave per bank slot and per context', () => {
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    expect(reedPeriodicWave(real, 0)).toBe(reedPeriodicWave(real, 0));
    expect(reedPeriodicWave(real, 60)).not.toBe(reedPeriodicWave(real, 0));
  });

  it('gives each reed its own spectrum', () => {
    const clarinet = harmonicsOf(0);
    const sax = harmonicsOf(60);
    expect(Array.from(clarinet)).not.toEqual(Array.from(sax));
  });

  it('hollows the clarinet and fills the oboe, which is the bore talking', () => {
    // The one knob that makes a clarinet woody: its stopped tube kills the even
    // harmonics. Comparing the 2nd harmonic against the 1st — a ratio, so the
    // bank's absolute levels do not matter — the clarinet's even family is all but
    // gone where the oboe's is intact.
    const ratio = (curve: Float32Array) => curve[2] / curve[1];
    const clarinet = ratio(harmonicsOf(0));
    const oboe = ratio(harmonicsOf(30));
    expect(clarinet).toBeLessThan(oboe / 10);
  });

  it('still builds no periodic wave for a tonal triangle', () => {
    const { oscillators } = build({ ...DEFAULT_VOICE, wave: 'triangle' });
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].wave).toBeNull();
  });
});

// --- the language and the files --------------------------------------------

describe('a reed channel in a script and a file', () => {
  it('sets the wave, by either spelling', () => {
    expect(applied('tracks 1\ntrack 1 "REED" wave reed duty 0').song.tracks[0].voice.wave).toBe('reed');
    expect(applied('tracks 1\ntrack 1 "PIPE" wave reeds duty 90').song.tracks[0].voice.wave).toBe('reed');
  });

  it('refuses an unknown wave, listing reed among the choices', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "LEAD" wave wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('reed');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'reed', duty: 40 };

    const json = songToJson(song);
    expect(json).toContain('"reed"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('reed');
    expect(parsed.song.tracks[0].voice.duty).toBe(40);

    expect(songToScript(song)).toContain('wave reed');
  });
});
