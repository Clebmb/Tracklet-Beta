import { describe, expect, it } from 'vitest';

import { buildNote, cutoffFor, MAX_FILTER_HZ, SWEEP_OCTAVES, sweepOpenFor } from '../audio/synth';
import {
  createSong,
  DEFAULT_VOICE,
  patchFromVoice,
  sameVoice,
  VOICE_PARAM_BY_ID,
  VOICES,
  type VoiceParams,
} from '../model';
import { applyScript } from '../model/script';
import { songFromJson, songToJson, songToScript } from '../model/songfile';

/**
 * SWEEP, the filter envelope: the seventh knob, and the one that makes a note
 * MOVE.
 *
 * The tests pin the promise the knob makes to every song written before it:
 * `sweep 0` is a steady filter, exactly the one value the cutoff always was, so
 * nothing existing changed. Above zero the filter opens wide and closes down to
 * `bright`, and the two decisions worth testing are that the opening is
 * GEOMETRIC (an interval, like `bright` itself) and that it is TIMED by the same
 * decay the amplitude uses, so a pluck's brightness and its level fall together.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the sweep maths', () => {
  it('is exactly the steady cutoff at sweep 0, so nothing existing moved', () => {
    for (const bright of [0, 25, 70, 100]) {
      expect(sweepOpenFor(bright, 0)).toBe(cutoffFor(bright));
    }
  });

  it('opens by an INTERVAL, not a number of hertz', () => {
    // A full sweep is SWEEP_OCTAVES above the note's own brightness, wherever
    // that brightness is — the same reason `bright` is geometric.
    const ratio = Math.pow(2, SWEEP_OCTAVES);
    expect(sweepOpenFor(50, 100)).toBeCloseTo(Math.min(MAX_FILTER_HZ, cutoffFor(50) * ratio));
    expect(sweepOpenFor(20, 100)).toBeCloseTo(cutoffFor(20) * ratio);
  });

  it('never opens past the top of hearing, however bright the note already is', () => {
    expect(sweepOpenFor(100, 100)).toBeLessThanOrEqual(MAX_FILTER_HZ);
    expect(sweepOpenFor(100, 100)).toBeGreaterThan(cutoffFor(100));
  });

  it('rises with the knob and clamps at both ends', () => {
    expect(sweepOpenFor(60, 50)).toBeGreaterThan(sweepOpenFor(60, 10));
    expect(sweepOpenFor(60, -20)).toBe(sweepOpenFor(60, 0));
    expect(sweepOpenFor(60, 400)).toBe(sweepOpenFor(60, 100));
  });
});

describe('sweep is a knob', () => {
  it('is in the knob table, with two named ends and the filter-env spellings', () => {
    const param = VOICE_PARAM_BY_ID.sweep;
    expect(param.label).toBe('SWEEP');
    expect(param.low).toBe('flat');
    expect(param.high).toBe('wah');
    expect(param.aliases).toContain('filter-env');
    expect(param.blurb.length).toBeGreaterThan(20);
  });

  it('defaults to no movement, so every preset and every old song is steady', () => {
    expect(DEFAULT_VOICE.sweep).toBe(0);
    for (const voice of VOICES) expect(voice.params.sweep).toBe(0);
  });

  it('counts as part of a sound, so two sweeps are two sounds', () => {
    const a = { ...DEFAULT_VOICE, sweep: 30 };
    const b = { ...DEFAULT_VOICE, sweep: 60 };
    expect(sameVoice(a, DEFAULT_VOICE)).toBe(false);
    expect(sameVoice(a, b)).toBe(false);
  });
});

// --- the synthesis ----------------------------------------------------------

interface SetCall { v: number; t: number }
interface FakeFilter {
  type: string;
  frequency: {
    value: number;
    sets: SetCall[];
    ramps: SetCall[];
    setValueAtTime(v: number, t: number): void;
    exponentialRampToValueAtTime(v: number, t: number): void;
    linearRampToValueAtTime(v: number, t: number): void;
    setTargetAtTime(v: number, t: number, c: number): void;
  };
  Q: { value: number };
  connect(target: unknown): unknown;
  disconnect(): void;
}

function param() {
  const p = {
    value: 0,
    sets: [] as SetCall[],
    ramps: [] as SetCall[],
    setValueAtTime(v: number, t: number) { this.value = v; this.sets.push({ v, t }); },
    exponentialRampToValueAtTime(v: number, t: number) { this.value = v; this.ramps.push({ v, t }); },
    linearRampToValueAtTime(v: number, t: number) { this.value = v; this.ramps.push({ v, t }); },
    setTargetAtTime() {},
  };
  return p;
}

function fakeContext() {
  const filters: FakeFilter[] = [];
  const base = () => ({ connect(target: unknown) { return target; }, disconnect() {} });
  const ctx = {
    sampleRate: 44100,
    createOscillator() {
      return { ...base(), type: 'square', frequency: param(), detune: param(), setPeriodicWave() {}, start() {}, stop() {} };
    },
    createGain() { return { ...base(), gain: param() }; },
    createBiquadFilter(): FakeFilter {
      const filter = { ...base(), type: 'lowpass', frequency: param(), Q: { value: 0 } };
      filters.push(filter);
      return filter;
    },
    createBufferSource() {
      return { ...base(), buffer: null, loop: false, playbackRate: param(), detune: param(), start() {}, stop() {} };
    },
  };
  return { ctx, filters };
}

const DESTINATION = { connect() { return this; }, disconnect() {} } as unknown as AudioNode;

function build(voice: VoiceParams) {
  const fake = fakeContext();
  buildNote(fake.ctx as unknown as BaseAudioContext, patchFromVoice(voice), 60, 0, 1, DESTINATION, null, {});
  return fake;
}

describe('the engine builds the filter envelope', () => {
  it('leaves a sweep-0 note the plain steady cutoff it always was', () => {
    const { filters } = build({ ...DEFAULT_VOICE, bright: 70, sweep: 0 });
    expect(filters).toHaveLength(1);
    expect(filters[0].frequency.sets.map((s) => s.v)).toEqual([cutoffFor(70)]);
    expect(filters[0].frequency.ramps).toHaveLength(0);
  });

  it('opens the filter to the swept value and closes it to `bright`', () => {
    const { filters } = build({ ...DEFAULT_VOICE, bright: 70, sweep: 60 });
    const filter = filters[0];
    // It STARTS wide open...
    expect(filter.frequency.sets[0].v).toBeCloseTo(sweepOpenFor(70, 60));
    expect(filter.frequency.sets[0].v).toBeGreaterThan(cutoffFor(70));
    // ...and ramps down to the note's own brightness.
    expect(filter.frequency.ramps).toHaveLength(1);
    expect(filter.frequency.ramps[0].v).toBeCloseTo(cutoffFor(70));
    expect(filter.frequency.ramps[0].t).toBeGreaterThan(filter.frequency.sets[0].t);
  });
});

// --- the language and the files --------------------------------------------

describe('a swept channel in a script and a file', () => {
  it('sets the knob by its name and its aliases', () => {
    expect(applied('tracks 1\ntrack 1 "LEAD" sweep 60').song.tracks[0].voice.sweep).toBe(60);
    expect(applied('tracks 1\ntrack 1 "LEAD" filter-env 25').song.tracks[0].voice.sweep).toBe(25);
    expect(applied('tracks 1\ntrack 1 "LEAD" env 100').song.tracks[0].voice.sweep).toBe(100);
  });

  it('refuses a value past the range, and names what each end means', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "X" sweep 400');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors[0].message).toContain('sweep');
      expect(bad.errors[0].message).toContain('wah');
    }
  });

  it('leaves the default sweep out of a file, and writes it when it moves', () => {
    const plain = JSON.parse(songToJson(createSong())) as { version: number; tracks: { voice: Record<string, unknown> }[] };
    expect(plain.version).toBe(12);
    for (const track of plain.tracks) expect('sweep' in track.voice).toBe(false);

    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, sweep: 55 };
    const json = songToJson(song);
    expect(JSON.parse(json).tracks[0].voice.sweep).toBe(55);
    expect(songToScript(song)).toContain('sweep 55');

    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.sweep).toBe(55);
  });

  it('reads a file written before sweep existed as a steady filter', () => {
    const file = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    file.version = 9;
    const parsed = songFromJson(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.sweep).toBe(0);
  });
});
