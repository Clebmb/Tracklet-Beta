import { describe, expect, it } from 'vitest';

import { buildNote } from '../audio/synth';
import {
  createSong,
  DEFAULT_TUNING,
  DEFAULT_VOICE,
  nextTuning,
  patchFromVoice,
  TUNING_BY_ID,
  TUNINGS,
  tunedFreq,
  tuningById,
  tuningFor,
  tuningFromName,
  tuningNames,
  type TuningId,
  type VoiceParams,
} from '../model';
import { midiToFreq } from '../model/notes';
import { applyScript } from '../model/script';
import { SONG_FILE_VERSION, songFromJson, songToJson, songToScript } from '../model/songfile';

/**
 * Temperaments: how the twelve notes of an octave are spaced.
 *
 * Two promises carry the feature. The default is EQUAL temperament — the
 * frequency every note in this app has always had — so nothing changes until a
 * tuning is asked for. And a tuning is read against the song's KEY: `just` in C
 * is pure in C, and moving the key to D moves the purity with it. The test of a
 * temperament is its INTERVALS, so that is what these check: a pure fifth, a
 * pure third, a flat seventh, and a tonic that never moves.
 */

const CENT = 1 / 1200;

/** The ratio between two notes, with the tonic's own pitch divided out. */
function intervalRatio(tuning: TuningId, lowMidi: number, highMidi: number, tonic = 0): number {
  return tunedFreq(highMidi, tuningFor(tuning), tonic) / tunedFreq(lowMidi, tuningFor(tuning), tonic);
}

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the temperament table', () => {
  it('holds five named tunings, each twelve offsets with the tonic at zero', () => {
    expect(TUNINGS).toHaveLength(5);
    expect(new Set(TUNINGS.map((t) => t.id)).size).toBe(TUNINGS.length);
    for (const tuning of TUNINGS) {
      expect(tuning.label.length).toBeGreaterThanOrEqual(3);
      expect(tuning.blurb.length).toBeGreaterThan(10);
      expect(tuning.cents).toHaveLength(12);
      expect(tuning.cents[0]).toBe(0);
      expect(TUNING_BY_ID[tuning.id]).toBe(tuning);
    }
    expect(tuningById('just')).toBe(TUNING_BY_ID.just);
    expect(tuningById('nope')).toBeNull();
  });

  it('keeps every note within a quarter tone of equal temperament', () => {
    // The range IS the guarantee: a temperament colours the intervals, it never
    // makes a note painful or unrecognisable.
    for (const tuning of TUNINGS) {
      for (const offset of tuning.cents) {
        expect(Math.abs(offset)).toBeLessThan(50);
      }
    }
  });

  it('is exactly equal temperament by default', () => {
    expect(DEFAULT_TUNING).toBe('equal');
    expect(TUNING_BY_ID.equal.cents.every((c) => c === 0)).toBe(true);
    for (const midi of [12, 60, 69, 119]) expect(tunedFreq(midi, TUNING_BY_ID.equal)).toBe(midiToFreq(midi));
  });

  it('gives just intonation pure thirds and fifths in the home key', () => {
    expect(intervalRatio('just', 60, 64)).toBeCloseTo(5 / 4, 3); // a major third, pure
    expect(intervalRatio('just', 60, 67)).toBeCloseTo(3 / 2, 3); // a fifth, pure
    // Which means the equal-tempered third was sharp: just pulls it DOWN.
    expect(TUNING_BY_ID.just.cents[4]).toBeLessThan(0);
    expect(TUNING_BY_ID.just.cents[7]).toBeGreaterThan(0);
  });

  it('gives Pythagorean a pure fifth and a wide third, meantone the trade', () => {
    expect(intervalRatio('pythagorean', 60, 67)).toBeCloseTo(3 / 2, 3);
    expect(TUNING_BY_ID.pythagorean.cents[4]).toBeGreaterThan(0); // thirds sharp
    expect(intervalRatio('meantone', 60, 64)).toBeCloseTo(5 / 4, 3); // thirds pure
    expect(TUNING_BY_ID.meantone.cents[7]).toBeLessThan(0); // fifths narrowed
  });

  it('gives the septimal tuning its flat seventh', () => {
    // 7/4 is about 31 cents below the equal-tempered minor seventh — the blue note.
    expect(intervalRatio('septimal', 60, 70)).toBeCloseTo(7 / 4, 3);
    expect(TUNING_BY_ID.septimal.cents[10]).toBeLessThan(-30);
  });
});

describe('frequencies under a temperament', () => {
  it('anchors the tonic to the song key, so purity follows the key', () => {
    // The same intervals in C and in D: a pure third either way.
    expect(intervalRatio('just', 62, 66, 2)).toBeCloseTo(5 / 4, 3);
    expect(intervalRatio('just', 62, 69, 2)).toBeCloseTo(3 / 2, 3);
    // The tonic itself is never moved by the tuning.
    expect(tunedFreq(62, tuningFor('just'), 2)).toBe(midiToFreq(62));
    expect(tunedFreq(60, tuningFor('just'), 0)).toBe(midiToFreq(60));
  });

  it('keeps octaves exactly double, in every temperament', () => {
    for (const tuning of TUNINGS) {
      for (const midi of [60, 61, 62, 67]) {
        expect(tunedFreq(midi + 12, tuning) / tunedFreq(midi, tuning)).toBeCloseTo(2, 6);
      }
    }
  });

  it('names its spellings, and cycles', () => {
    expect(tuningFromName('equal')).toBe(TUNING_BY_ID.equal);
    expect(tuningFromName('ET')).toBe(TUNING_BY_ID.equal);
    expect(tuningFromName('just')).toBe(TUNING_BY_ID.just);
    expect(tuningFromName('ji')).toBe(TUNING_BY_ID.just);
    expect(tuningFromName('pyth')).toBe(TUNING_BY_ID.pythagorean);
    expect(tuningFromName('quarter-comma')).toBe(TUNING_BY_ID.meantone);
    expect(tuningFromName('7-limit')).toBe(TUNING_BY_ID.septimal);
    expect(tuningFromName('banana')).toBeNull();
    expect(tuningNames()).toContain('just');
    expect(tuningNames()).toContain('meantone');
    // Cycling visits every tuning and comes home.
    let id = DEFAULT_TUNING;
    const seen = new Set<TuningId>();
    for (let i = 0; i < TUNINGS.length; i++) { seen.add(id); id = nextTuning(id); }
    expect(seen.size).toBe(TUNINGS.length);
    expect(id).toBe(DEFAULT_TUNING);
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
  const oscillators: { type: string; frequency: FakeParam }[] = [];
  const ctx = {
    sampleRate: 44100,
    createBuffer(_channels: number, length: number) { const data = new Float32Array(length); return { length, data, getChannelData: () => data }; },
    createBufferSource() { return { loop: false, buffer: null, playbackRate: param(), detune: param(), connect() { return this; }, start() {}, stop() {} }; },
    createOscillator() {
      const osc = { type: 'sine', frequency: param(), detune: param(), setPeriodicWave() {}, connect() { return this; }, start() {}, stop() {} };
      oscillators.push(osc);
      return osc;
    },
    createGain() { return { gain: param(), connect() { return this; }, disconnect() {} }; },
    createBiquadFilter() { return { type: 'lowpass', frequency: param(), Q: param(), connect() { return this; } }; },
    createPeriodicWave() { return {}; },
  };
  return { ctx, oscillators };
}

const DESTINATION = { connect() { return this; }, disconnect() {} } as unknown as AudioNode;

function playedFrequency(midi: number, tuning: TuningId, tonic = 0): number {
  const { ctx, oscillators } = fakeContext();
  const voice: VoiceParams = { ...DEFAULT_VOICE, wave: 'sine' };
  buildNote(
    ctx as unknown as BaseAudioContext,
    patchFromVoice(voice),
    midi, 0, 1, DESTINATION, null,
    { tuning: tuningFor(tuning), tonic },
  );
  return oscillators[0].frequency.value;
}

describe('the engine plays a note at the tuned frequency', () => {
  it('uses the tuning it is handed', () => {
    expect(playedFrequency(64, 'just')).toBeCloseTo(midiToFreq(64) * Math.pow(2, TUNING_BY_ID.just.cents[4] * CENT), 4);
    expect(playedFrequency(67, 'just')).toBeCloseTo(midiToFreq(67) * Math.pow(2, TUNING_BY_ID.just.cents[7] * CENT), 4);
  });

  it('plays exactly the equal-tempered note when told nothing', () => {
    // The guarantee, pinned: a note with no tuning is the frequency it always was.
    const { ctx, oscillators } = fakeContext();
    buildNote(ctx as unknown as BaseAudioContext, patchFromVoice({ ...DEFAULT_VOICE, wave: 'sine' }), 64, 0, 1, DESTINATION, null, {});
    expect(oscillators[0].frequency.value).toBe(midiToFreq(64));
  });
});

// --- the language and the files --------------------------------------------

describe('a tuned song in a script and a file', () => {
  it('sets the temperament, by either spelling', () => {
    expect(applied('tuning just').song.tuning).toBe('just');
    expect(applied('tuning ji').song.tuning).toBe('just');
    expect(applied('new\ntuning meantone').song.tuning).toBe('meantone');
    // A fresh song is equal-tempered: `new` forgets the last tuning.
    expect(applied('tuning just\nnew').song.tuning).toBe('equal');
  });

  it('refuses an unknown tuning, listing them', () => {
    const bad = applyScript(createSong(), 'tuning wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors[0].message).toContain('just');
      expect(bad.errors[0].message).toContain('meantone');
    }
  });

  it('writes the tuning only when it is not equal, and round-trips it', () => {
    const equal = createSong();
    expect(songToJson(equal)).not.toContain('"tuning"');
    expect(songToScript(equal)).not.toContain('tuning');

    const song = createSong();
    song.tuning = 'just';
    const json = songToJson(song);
    expect(json).toContain('"tuning": "just"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tuning).toBe('just');
    expect(songToScript(song)).toContain('tuning just');
    expect(JSON.parse(json).version).toBe(SONG_FILE_VERSION);
  });

  it('refuses a file whose tuning it does not know', () => {
    const file = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    file.tuning = 'lydian';
    const parsed = songFromJson(JSON.stringify(file));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(' ')).toContain('lydian');
  });
});
