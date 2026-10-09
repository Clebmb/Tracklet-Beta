import { describe, expect, it } from 'vitest';

import {
  buildNote,
  WAVE_TABLES,
  waveTableFor,
  waveTableIndexFor,
  wavetablePeriodicWave,
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
 * The chip wavetable, the last source on the chiptune shelf: a wave whose shape is
 * a TABLE, the way a Game Boy or a PC Engine makes everything that is not a
 * square.
 *
 * The tests pin the two decisions that make it a chip feature rather than a synth
 * one. First, `duty` PICKS a table from a fixed bank rather than dialling a
 * continuum — a chip selects a table, it does not interpolate. Second, the wave is
 * reached on purpose: the default four-shape cycle is untouched, and a square at
 * full duty is still the browser's own square, so nothing existing moved.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the table bank', () => {
  it('has a named spectrum each, and enough of them to be a bank', () => {
    expect(WAVE_TABLES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(WAVE_TABLES.map((t) => t.id)).size).toBe(WAVE_TABLES.length);
    for (const table of WAVE_TABLES) {
      expect(table.label.length).toBeGreaterThanOrEqual(3);
      expect(table.blurb.length).toBeGreaterThan(10);
      // A fundamental, and at least one upper harmonic, or it is not a table.
      expect(table.harmonics[1]).toBeGreaterThan(0);
      const upper = table.harmonics.slice(2).some((a) => a > 0);
      expect(upper).toBe(true);
    }
  });

  it('picks a table by duty, spread evenly and clamped at the ends', () => {
    expect(waveTableIndexFor(0)).toBe(0);
    expect(waveTableIndexFor(100)).toBe(WAVE_TABLES.length - 1);
    expect(waveTableIndexFor(-50)).toBe(0);
    expect(waveTableIndexFor(999)).toBe(WAVE_TABLES.length - 1);
    expect(waveTableFor(100)).toBe(WAVE_TABLES[WAVE_TABLES.length - 1]);
  });
});

describe('table is a wave, but not one a new channel walks', () => {
  it('names it, with wavetable as a spelling', () => {
    expect(waveFromName('table')).toBe('table');
    expect(waveFromName('wavetable')).toBe('table');
    expect(WAVE_LABELS.table).toHaveLength(3);
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

function fakeContext() {
  const oscillators: { type: string; table: { imag: Float32Array } | null; setPeriodicWave(w: { imag: Float32Array }): void }[] = [];
  let periodicCalls = 0;
  const ctx = {
    createOscillator() {
      const osc = {
        type: 'sine',
        table: null as { imag: Float32Array } | null,
        frequency: param(),
        detune: param(),
        setPeriodicWave(w: { imag: Float32Array }) { this.table = w; },
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
      periodicCalls += 1;
      return { real, imag };
    },
  };
  return { ctx, oscillators, calls: () => periodicCalls };
}

const DESTINATION = { connect() { return this; }, disconnect() {} } as unknown as AudioNode;

function build(voice: VoiceParams) {
  const fake = fakeContext();
  buildNote(fake.ctx as unknown as BaseAudioContext, patchFromVoice(voice), 60, 0, 1, DESTINATION, null, {});
  return fake;
}

const tableVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'table', duty });

describe('the engine builds a table wave', () => {
  it('wears a PeriodicWave rather than an oscillator shape', () => {
    const { oscillators } = build(tableVoice(10));
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].table).not.toBeNull();
  });

  it('gives a different spectrum for a different duty', () => {
    const soft = build(tableVoice(0)).oscillators[0].table!;
    const rich = build(tableVoice(100)).oscillators[0].table!;
    expect(Array.from(soft.imag)).not.toEqual(Array.from(rich.imag));
  });

  it('still leaves a full square as the browser square, so nothing moved', () => {
    const { oscillators } = build({ ...DEFAULT_VOICE, wave: 'square', duty: 100 });
    expect(oscillators[0].table).toBeNull();
    expect(oscillators[0].type).toBe('square');
  });

  it('caches one table per bank slot', () => {
    const { ctx, calls } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    const a = wavetablePeriodicWave(real, 10);
    const b = wavetablePeriodicWave(real, 10);
    expect(a).toBe(b);
    expect(calls()).toBe(1);
    wavetablePeriodicWave(real, 90);
    expect(calls()).toBe(2);
  });
});

// --- the language and the files --------------------------------------------

describe('a table channel in a script and a file', () => {
  it('sets the wave, by either spelling', () => {
    const one = applied('tracks 1\ntrack 1 "WAVE" wave table duty 10');
    expect(one.song.tracks[0].voice.wave).toBe('table');
    const two = applied('tracks 1\ntrack 1 "WAVE" wave wavetable duty 90');
    expect(two.song.tracks[0].voice.wave).toBe('table');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'table', duty: 10 };

    const json = songToJson(song);
    expect(json).toContain('"table"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('table');
    expect(parsed.song.tracks[0].voice.duty).toBe(10);

    expect(songToScript(song)).toContain('wave table');
  });
});
