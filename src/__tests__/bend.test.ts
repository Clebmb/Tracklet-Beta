import { describe, expect, it } from 'vitest';

import { buildNote } from '../audio/synth';
import {
  applyScript,
  articulationHits,
  articulationLabel,
  articulationProblem,
  articulationText,
  ARTICULATION_SONG_FILE_VERSION,
  BEND_MAX_SECONDS,
  BEND_MIN_SECONDS,
  bendSeconds,
  bendText,
  clampBend,
  createSong,
  DEFAULT_BEND,
  DEFAULT_VOICE,
  FALL_CHAR,
  FALL_SPAN,
  MAX_BEND,
  MIN_BEND,
  NO_ARTICULATION,
  parseArticulation,
  patchFromVoice,
  rowNotes,
  SCOOP_CHAR,
  SCOOP_SPAN,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION_MAX,
  type Articulation,
  type VoiceParams,
} from '../model';

/**
 * The bend: a note moving its OWN pitch.
 *
 * `^` scoops up onto the pitch from below and `v` falls away from it, 1–12
 * semitones, two by default. It is the one pitch gesture that belongs to a single
 * note — a `>` slide is a relationship between two notes, and a channel's `glide`
 * is a setting — which is why it is a suffix, and why the audio reaches for the
 * oscillator's own `detune` (the parameter the vibrato rides) rather than a
 * second mechanism. The identity that matters is the one every suffix keeps: a
 * bend of 0 schedules exactly the single `setValueAtTime` this app has always
 * made.
 */

function applied(source: string, song = createSong()) {
  const result = applyScript(song, source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

function refused(source: string): string {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map((error) => error.message).join(' ');
}

function cell(source: string) {
  return applied(source).song.patterns[0].steps[0][0];
}

describe('reading the gesture', () => {
  it('reads ^ as a scoop and v as a fall, two semitones by default', () => {
    expect(parseArticulation(SCOOP_CHAR)).toEqual({ ...NO_ARTICULATION, bend: DEFAULT_BEND });
    expect(parseArticulation(`${SCOOP_CHAR}7`)).toEqual({ ...NO_ARTICULATION, bend: 7 });
    expect(parseArticulation(`${FALL_CHAR}3`)).toEqual({ ...NO_ARTICULATION, bend: -3 });
    expect(parseArticulation(`${FALL_CHAR}`)).toEqual({ ...NO_ARTICULATION, bend: -DEFAULT_BEND });
  });

  it('reads a bend beside the other gestures', () => {
    expect(parseArticulation(`${SCOOP_CHAR}2*3`)).toEqual({ slide: false, stutter: 3, grace: 0, bend: 2 });
    expect(parseArticulation(`>${FALL_CHAR}2`)).toEqual({ slide: true, stutter: 1, grace: 0, bend: -2 });
    expect(parseArticulation(`${FALL_CHAR}2!`)).toEqual({ slide: false, stutter: 1, grace: 1, bend: -2 });
  });

  it('refuses a bend with no direction, two bends, and a scoop that slides', () => {
    expect(parseArticulation(`${SCOOP_CHAR}2${FALL_CHAR}2`)).toBeNull();
    expect(parseArticulation(`>${SCOOP_CHAR}2`)).toBeNull();
    expect(parseArticulation(`${SCOOP_CHAR}0`)).toBeNull();
    expect(parseArticulation(`${SCOOP_CHAR}${MAX_BEND + 1}`)).toBeNull();
    // A FALL is a departure rather than an arrival, so it rides with a slide.
    expect(parseArticulation(`>${FALL_CHAR}2`)).not.toBeNull();
  });

  it('says why, in words', () => {
    expect(articulationProblem(`${SCOOP_CHAR}2${FALL_CHAR}2`)).toContain('bends one way');
    expect(articulationProblem(`>${SCOOP_CHAR}2`)).toContain('arrives one way');
    expect(articulationProblem(`${SCOOP_CHAR}${MAX_BEND + 1}`)).toContain(`${MIN_BEND}..${MAX_BEND} semitones`);
    expect(articulationProblem(`${SCOOP_CHAR}2${SCOOP_CHAR}2`)).toContain('bends once');
    expect(articulationProblem(`${SCOOP_CHAR}2`)).toBeNull();
  });

  it('writes and names the gesture, leaving the default count out', () => {
    expect(articulationText({ slide: false, stutter: 1, grace: 0, bend: 2 })).toBe(SCOOP_CHAR);
    expect(articulationText({ slide: false, stutter: 1, grace: 0, bend: 7 })).toBe(`${SCOOP_CHAR}7`);
    expect(articulationText({ slide: false, stutter: 1, grace: 0, bend: -3 })).toBe(`${FALL_CHAR}3`);
    expect(bendText(0)).toBe('');
    expect(articulationLabel({ slide: false, stutter: 1, grace: 0, bend: 2 })).toBe('SCOOP 2');
    expect(articulationLabel({ slide: true, stutter: 3, grace: 0, bend: -4 })).toBe('SLIDE + FALL 4 + STUTTER x3');
  });

  it('clamps a bend to a whole number of semitones inside the range', () => {
    expect(clampBend(0)).toBe(0);
    expect(clampBend(2.4)).toBe(2);
    expect(clampBend(-2.6)).toBe(-3);
    expect(clampBend(99)).toBe(MAX_BEND);
    expect(clampBend(-99)).toBe(-MAX_BEND);
    expect(clampBend(Number.NaN)).toBe(0);
  });
});

describe('how long a bend takes', () => {
  it('is a fraction of the note, capped at a speed a hand can play', () => {
    expect(bendSeconds(0.2, SCOOP_SPAN)).toBeCloseTo(0.2 * SCOOP_SPAN);
    // A long note does not take proportionally longer to arrive: a bend is a
    // SPEED, so a two-second pad and a ten-second one bend in the same time.
    expect(bendSeconds(2, SCOOP_SPAN)).toBe(BEND_MAX_SECONDS);
    expect(bendSeconds(10, FALL_SPAN)).toBe(BEND_MAX_SECONDS);
    expect(bendSeconds(0, SCOOP_SPAN)).toBe(BEND_MIN_SECONDS);
    expect(bendSeconds(Number.NaN, SCOOP_SPAN)).toBe(BEND_MIN_SECONDS);
  });
});

describe('where the bend falls in a note', () => {
  it('scoops on the hit ON the beat, not on a grace before it', () => {
    const hits = articulationHits({ slide: false, stutter: 1, grace: 1, bend: 2 }, 0);
    expect(hits[0].at).toBeLessThan(0); // the grace
    expect(hits[0].bend).toBe(0); // a grace is already at the pitch it ornaments
    expect(hits[1].bend).toBe(2); // the note itself arrives
  });

  it('falls on the LAST hit of a stutter, and scoops on the FIRST', () => {
    const scooped = articulationHits({ slide: false, stutter: 4, grace: 0, bend: 2 }, 0);
    expect(scooped.map((hit) => hit.bend)).toEqual([2, 0, 0, 0]);
    const fallen = articulationHits({ slide: false, stutter: 4, grace: 0, bend: -2 }, 0);
    expect(fallen.map((hit) => hit.bend)).toEqual([0, 0, 0, -2]);
  });

  it('says nothing at all for a plain note, which is the identity', () => {
    expect(articulationHits(NO_ARTICULATION, 30)[0]).toEqual({ at: 0, length: 1, glide: 30, bend: 0 });
  });
});

// --- the synthesis ----------------------------------------------------------

interface SetCall { v: number; t: number }
interface FakeOsc {
  type: string;
  frequency: { value: number; sets: SetCall[]; ramps: SetCall[] };
  detune: {
    value: number;
    sets: SetCall[];
    ramps: SetCall[];
    setValueAtTime(v: number, t: number): void;
    exponentialRampToValueAtTime(v: number, t: number): void;
    linearRampToValueAtTime(v: number, t: number): void;
    setTargetAtTime(): void;
  };
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
  const oscillators: FakeOsc[] = [];
  const base = () => ({ connect(target: unknown) { return target; }, disconnect() {} });
  const ctx = {
    sampleRate: 44100,
    createOscillator(): FakeOsc {
      const osc = { ...base(), type: 'square', frequency: param(), detune: param(), setPeriodicWave() {}, start() {}, stop() {} };
      oscillators.push(osc);
      return osc;
    },
    createGain() { return { ...base(), gain: param() }; },
    createBiquadFilter() { return { ...base(), type: 'lowpass', frequency: param(), Q: { value: 0 } }; },
    createBufferSource() {
      return { ...base(), buffer: null, loop: false, playbackRate: param(), detune: param(), start() {}, stop() {} };
    },
  };
  return { ctx, oscillators };
}

const DESTINATION = { connect() { return this; }, disconnect() {} } as unknown as AudioNode;

function built(duration: number, bend: number) {
  const fake = fakeContext();
  buildNote(
    fake.ctx as unknown as BaseAudioContext,
    patchFromVoice(DEFAULT_VOICE as VoiceParams),
    60, 0, duration, DESTINATION, null, { bend },
  );
  expect(fake.oscillators).toHaveLength(1);
  return fake.oscillators[0].detune;
}

describe('the engine builds the bend', () => {
  it('leaves a bend-0 note the one tuning value it always was', () => {
    const detune = built(1, 0);
    expect(detune.sets).toHaveLength(1);
    expect(detune.ramps).toHaveLength(0);
  });

  it('starts a scoop BELOW the pitch and ramps onto it', () => {
    const detune = built(1, 2);
    // The layer's own tuning is set first, then the bend's start overrides it:
    // a whole tone is 200 cents, and the note begins there...
    expect(detune.sets[0].v).toBeCloseTo(0);
    expect(detune.sets[1].v).toBeCloseTo(-200);
    expect(detune.sets[1].t).toBe(0);
    // ...and arrives at its own tuning within the cap, well inside the note.
    expect(detune.ramps).toHaveLength(1);
    expect(detune.ramps[0].v).toBeCloseTo(0);
    expect(detune.ramps[0].t).toBeCloseTo(BEND_MAX_SECONDS);
    expect(detune.ramps[0].t).toBeLessThan(1);
  });

  it('holds the pitch and then lets a fall go over the note s tail', () => {
    const detune = built(1, -3);
    expect(detune.sets.every((call) => call.v === 0)).toBe(true);
    // The hold is a ramp to the same value, which is what makes the fall sit at
    // the END of the note rather than smearing across it.
    expect(detune.ramps[0].v).toBeCloseTo(0);
    expect(detune.ramps[0].t).toBeCloseTo(1 - BEND_MAX_SECONDS);
    expect(detune.ramps[1].v).toBeCloseTo(-300);
    expect(detune.ramps[1].t).toBeCloseTo(1);
  });

  it('bends a short note over its own length rather than past it', () => {
    const detune = built(0.1, -2);
    expect(detune.ramps[1].t).toBeCloseTo(0.1);
    expect(detune.ramps[0].t).toBeLessThan(0.1);
  });
});

// --- the language and the files --------------------------------------------

describe('a bent note in a script, a file and a writer', () => {
  it('reads ^ and v off a grid cell and off a note line', () => {
    expect(cell('tracks 1\nC-4^2').bend).toBe(2);
    expect(cell('tracks 1\nC-4v').bend).toBe(-DEFAULT_BEND);
    expect(cell('tracks 1\nnote 0 1 C-4 ^3').bend).toBe(3);
    expect(cell('tracks 1\nnote 0 1 C-4 v2*3').bend).toBe(-2);
  });

  it('refuses a bend it cannot play, and leaves the song alone', () => {
    expect(refused('tracks 1\nC-4^13')).toContain(`${MIN_BEND}..${MAX_BEND} semitones`);
    expect(refused('tracks 1\nC-4^2v2')).toContain('bends one way');
    expect(refused('tracks 1\nC-4>^2')).toContain('arrives one way');
    const song = applied('tracks 1\nC-4^2').song;
    const bad = applyScript(song, 'C-4^99');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(song.patterns[0].steps[0][0].bend).toBe(2);
  });

  it('travels with the note out of the grid, so both audio paths and the writer see it', () => {
    const articulation: Articulation = rowNotes(applied('tracks 1\nC-4v2').song.patterns[0], 0)[0].articulation;
    expect(articulation.bend).toBe(-2);
  });

  it('writes one articulation string, so the file version does not move', () => {
    const song = applied('tracks 1\nC-4^2*3').song;
    const raw = JSON.parse(songToJson(song)) as { version: number; patterns: { steps: unknown[][] }[] };
    // A bend is the suffix a cell already carries: no new key, no new version.
    expect(raw.version).toBe(ARTICULATION_SONG_FILE_VERSION);
    expect(ARTICULATION_SONG_FILE_VERSION).toBeLessThanOrEqual(SONG_FILE_VERSION_MAX);
    // And the count is left out when it is the default, so a whole-tone scoop
    // costs one character: `C-4^2*3` is written `C-4^*3`.
    expect(raw.patterns[0].steps[0][0]).toEqual([60, 100, '^*3']);
  });

  it('round-trips through both formats', () => {
    const song = applied('tracks 1\nC-4^2*3~40\nD-4v4').song;
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(songToJson(back.song)).toBe(songToJson(song));
    const script = songToScript(song);
    expect(script).toContain('C-4^*3~40');
    const reread = applied(script.replace(/^new\n/, ''));
    expect(reread.song.patterns[0].steps[0][0].bend).toBe(2);
    expect(reread.song.patterns[0].steps[1][0].bend).toBe(-4);
  });

  it('goes back to plain when a script starts a new song', () => {
    const song = applied('tracks 1\nC-4^2').song;
    expect(applied('new\ntracks 1\nC-4', song).song.patterns[0].steps[0][0].bend).toBe(0);
  });
});
