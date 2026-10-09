import { describe, expect, it } from 'vitest';

import {
  buildNote,
  lfsrSequence,
  makeLfsrBuffer,
  NOISE_SHORT_DUTY,
  noiseRate,
  NOISE_REFERENCE_HZ,
} from '../audio/synth';
import {
  createSong,
  DEFAULT_VOICE,
  layerFromVoice,
  makePatch,
  nextWave,
  patchFromVoice,
  WAVE_LABELS,
  WAVES,
  waveForTrack,
  waveFromName,
  type VoiceParams,
} from '../model';
import { applyScript } from '../model/script';
import { songFromJson, songToJson, songToScript } from '../model/songfile';

/**
 * Chip noise, the second piece of the chiptune shelf: a shift register rather
 * than an oscillator.
 *
 * Two properties matter and the tests are built around them. First, the register
 * is DETERMINISTIC and from first principles — no `Math.random` — so a noise note
 * draws the same waveform in the app, in an export and here, and the long and
 * short registers are the two colours a chip actually has. Second, the DEFAULT
 * CYCLE is untouched: a new song's channels still walk the four tonal waves, so
 * adding noise changed no existing sound.
 */

describe('the shift register', () => {
  it('is a maximal-length sequence of the right size, and only +1/-1', () => {
    const long = lfsrSequence(false);
    const short = lfsrSequence(true);
    expect(long).toHaveLength((1 << 15) - 1);
    expect(short).toHaveLength((1 << 6) - 1);
    for (const seq of [long, short]) {
      for (const v of seq) expect(Math.abs(v)).toBe(1);
    }
    // Not a constant, and not trivially periodic.
    expect(new Set(long).size).toBe(2);
  });

  it('is deterministic, so a noise note is the same note every time', () => {
    expect(Array.from(lfsrSequence(false))).toEqual(Array.from(lfsrSequence(false)));
  });

  it('clocks faster for a higher note and slower for a lower one', () => {
    expect(noiseRate(NOISE_REFERENCE_HZ)).toBeCloseTo(1, 9);
    expect(noiseRate(NOISE_REFERENCE_HZ * 2)).toBeCloseTo(2, 9);
    expect(noiseRate(NOISE_REFERENCE_HZ / 2)).toBeCloseTo(0.5, 9);
    // And it never runs off the ends, however extreme the note.
    expect(noiseRate(1e9)).toBeLessThanOrEqual(24);
    expect(noiseRate(1e-9)).toBeGreaterThan(0);
  });
});

describe('noise is a wave, but not one a new channel walks', () => {
  it('names it, with its machine name as a spelling', () => {
    expect(waveFromName('noise')).toBe('noise');
    expect(waveFromName('lfsr')).toBe('noise');
    expect(WAVES).toContain('noise');
    expect(WAVE_LABELS.noise).toHaveLength(3);
  });

  it('keeps the four-shape default cycle, so channels 5–8 are unchanged', () => {
    expect(waveForTrack(4)).toBe('square');
    expect(waveForTrack(5)).toBe('triangle');
    // But the click-to-cycle chip can still reach noise, at the end.
    expect(nextWave('sine')).toBe('noise');
    expect(nextWave('noise')).toBe('table');
    expect(nextWave('table')).toBe('sample');
    expect(nextWave('sample')).toBe('fm');
    expect(nextWave('fm')).toBe('string');
    expect(nextWave('string')).toBe('formant');
    expect(nextWave('formant')).toBe('organ');
    expect(nextWave('organ')).toBe('granular');
    expect(nextWave('granular')).toBe('font');
    expect(nextWave('font')).toBe('reed');
    expect(nextWave('reed')).toBe('brass');
    expect(nextWave('brass')).toBe('bow');
    expect(nextWave('bow')).toBe('mallet');
    expect(nextWave('mallet')).toBe('membrane');
    expect(nextWave('membrane')).toBe('plate');
    expect(nextWave('plate')).toBe('square');
  });
});

// --- the synthesis ----------------------------------------------------------

interface FakeParam {
  value: number;
  calls: { method: string; value: number }[];
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
  setTargetAtTime(v: number, t: number, c: number): void;
}

function param(): FakeParam {
  const p: FakeParam = {
    value: 0,
    calls: [],
    setValueAtTime(v) { this.calls.push({ method: 'set', value: v }); },
    linearRampToValueAtTime(v) { this.calls.push({ method: 'ramp', value: v }); },
    setTargetAtTime(v) { this.calls.push({ method: 'target', value: v }); },
  };
  return p;
}

function node(): { connect(d: unknown): unknown; disconnect(): void } {
  return { connect() { return this; }, disconnect() {} };
}

function fakeContext() {
  const buffers: { length: number; data: Float32Array }[] = [];
  const sources: { playbackRate: FakeParam; detune: FakeParam; loop: boolean; buffer: { length: number } | null; started: boolean }[] = [];
  const oscillators: unknown[] = [];
  const ctx = {
    sampleRate: 44100,
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      const buffer = { length, getChannelData: () => data };
      buffers.push({ length, data });
      return buffer;
    },
    createBufferSource() {
      const src = { ...node(), playbackRate: param(), detune: param(), loop: false, buffer: null as { length: number } | null, started: false, start() { this.started = true; }, stop() {} };
      sources.push(src);
      return src;
    },
    createOscillator() {
      const osc = { ...node(), type: 'sine', frequency: param(), detune: param(), start() {}, stop() {} };
      oscillators.push(osc);
      return osc;
    },
    createGain() { return { ...node(), gain: param() }; },
    createBiquadFilter() { return { ...node(), type: 'lowpass', frequency: param(), Q: param() }; },
    createPeriodicWave() { return {}; },
  };
  return { ctx, sources, buffers, oscillators };
}

const DESTINATION = node() as unknown as AudioNode;

function build(voice: VoiceParams, options: Parameters<typeof buildNote>[7] = {}) {
  const fake = fakeContext();
  buildNote(fake.ctx as unknown as BaseAudioContext, patchFromVoice(voice), 60, 0, 1, DESTINATION, null, options);
  return fake;
}

function buildPatch(patch: ReturnType<typeof makePatch>) {
  const fake = fakeContext();
  buildNote(fake.ctx as unknown as BaseAudioContext, patch, 60, 0, 1, DESTINATION, null, {});
  return fake;
}

function noiseVoice(duty: number): VoiceParams {
  return { ...DEFAULT_VOICE, wave: 'noise', duty };
}

describe('the engine builds a register, not an oscillator', () => {
  it('uses a looping buffer source for a noise wave', () => {
    const { sources, oscillators } = build(noiseVoice(100));
    expect(sources).toHaveLength(1);
    expect(oscillators).toHaveLength(0);
    expect(sources[0].loop).toBe(true);
    expect(sources[0].started).toBe(true);
  });

  it('picks the LONG register at the default duty and the SHORT one below 50', () => {
    expect(build(noiseVoice(100)).buffers[0].length).toBe((1 << 15) - 1);
    expect(build(noiseVoice(NOISE_SHORT_DUTY - 1)).buffers[0].length).toBe((1 << 6) - 1);
  });

  it('sets the register speed from the note, not a fixed rate', () => {
    const low = build(noiseVoice(100), {});
    // Middle C is the reference speed of 1 (midiToFreq rounds the reference a
    // hair, so this is close rather than exact).
    expect(low.sources[0].playbackRate.calls[0].value).toBeCloseTo(1, 3);
  });

  it('carries a layer detune onto the register, and zero for a plain voice', () => {
    expect(build(noiseVoice(100)).sources[0].detune.calls[0].value).toBe(0);
    const detuned = makePatch([{ ...layerFromVoice(noiseVoice(100)), detune: -30 }]);
    expect(buildPatch(detuned).sources[0].detune.calls[0].value).toBe(-30);
  });

  it('ramps the register speed when a noise note glides in', () => {
    const { sources } = build(noiseVoice(100), { glide: 50, fromMidi: 48 });
    const rate = sources[0].playbackRate;
    // Starts at the previous note's speed and ramps to this note's over half a note.
    expect(rate.calls[0].method).toBe('set');
    expect(rate.calls[0].value).toBeCloseTo(noiseRate(130.81), 2);
    expect(rate.calls[1].method).toBe('ramp');
    expect(rate.calls[1].value).toBeCloseTo(noiseRate(261.63), 2);
  });

  it('still builds an oscillator for a tonal wave', () => {
    const { sources, oscillators } = build({ ...DEFAULT_VOICE, wave: 'sawtooth' });
    expect(sources).toHaveLength(0);
    expect(oscillators).toHaveLength(1);
  });

  it('is deterministic end to end: the same note draws the same bytes', () => {
    const [a] = build(noiseVoice(100)).buffers;
    const [b] = build(noiseVoice(100)).buffers;
    expect(Array.from(a.data.slice(0, 256))).toEqual(Array.from(b.data.slice(0, 256)));
  });

  it('caches one register per mode', () => {
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    expect(makeLfsrBuffer(real, false)).toBe(makeLfsrBuffer(real, false));
    expect(makeLfsrBuffer(real, true)).not.toBe(makeLfsrBuffer(real, false));
  });
});

// --- the language and the files --------------------------------------------

describe('noise in the script and the files', () => {
  it('sets the wave, by either spelling', () => {
    const one = applyScript(createSong(), 'tracks 1\ntrack 1 "HAT" wave noise');
    expect(one.ok && one.song.tracks[0].voice.wave).toBe('noise');
    const two = applyScript(createSong(), 'tracks 1\ntrack 1 "HAT" wave lfsr duty 20');
    if (!two.ok) throw new Error(two.errors.map((e) => e.message).join(' / '));
    expect(two.song.tracks[0].voice.wave).toBe('noise');
    expect(two.song.tracks[0].voice.duty).toBe(20);
  });

  it('round-trips a noise channel through both file formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'noise', duty: 20 };

    const json = songToJson(song);
    expect(json).toContain('"noise"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('noise');
    expect(parsed.song.tracks[0].voice.duty).toBe(20);

    expect(songToScript(song)).toContain('wave noise');
  });
});
