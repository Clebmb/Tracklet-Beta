import { describe, expect, it } from 'vitest';

import { buildNote } from '../audio/synth';
import {
  applyScript,
  AUTOMATION_TARGET_BY_ID,
  automatedDrift,
  clampDrift,
  createSong,
  DEFAULT_DRIFT,
  DEFAULT_VOICE,
  DRIFT_FLUTTER_CENTS,
  DRIFT_FLUTTER_HZ,
  DRIFT_MAX,
  DRIFT_MAX_CENTS,
  DRIFT_MIN,
  DRIFT_SONG_FILE_VERSION,
  DRIFT_WOW_DRIFT_HZ,
  DRIFT_WOW_HZ,
  driftLabel,
  patchFromVoice,
  songFromJson,
  SONG_FILE_VERSION_MAX,
  songToJson,
  songToScript,
  type AutomationLane,
  type VoiceParams,
} from '../model';

/**
 * The drift: the wobble of a worn transport, as a knob and as a lane target.
 *
 * `drift` is the tape effect's wow and flutter pulled out as a plain channel
 * VALUE — a number the synth reads when it builds a note rather than a node in the
 * chain. That is exactly what makes it the one effect-like thing an `automate`
 * lane can move: a curve can fade in a value, but it cannot fade in a node that
 * does not exist at zero. The identity that matters is the one every setting here
 * keeps: `drift 0` holds every pitch and builds exactly the nodes it built before.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

function refused(source: string): string {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map((error) => error.message).join(' ');
}

function lane(over: Partial<AutomationLane> = {}): AutomationLane {
  return { track: 3, target: 'drift', from: 0, to: 100, startBar: 1, endBar: 8, ...over };
}

describe('the range and the label', () => {
  it('clamps a whole percentage like every other knob', () => {
    expect(clampDrift(-10)).toBe(DRIFT_MIN);
    expect(clampDrift(150)).toBe(DRIFT_MAX);
    expect(clampDrift(40.4)).toBe(40);
    expect(clampDrift(Number.NaN)).toBe(DEFAULT_DRIFT);
  });

  it('names itself OFF at zero and a percentage otherwise', () => {
    expect(driftLabel(DEFAULT_DRIFT)).toBe('OFF');
    expect(driftLabel(40)).toBe('40%');
  });

  it('keeps the flutter well under the wow', () => {
    expect(DRIFT_MAX_CENTS).toBeGreaterThan(0);
    expect(DRIFT_FLUTTER_CENTS).toBeGreaterThan(0);
    expect(DRIFT_FLUTTER_CENTS).toBeLessThan(DRIFT_MAX_CENTS);
  });
});

describe('the lane target', () => {
  it('is published as a channel-scope value over 0..100', () => {
    const info = AUTOMATION_TARGET_BY_ID.drift;
    expect(info.scope).toBe('channel');
    expect(info.min).toBe(DRIFT_MIN);
    expect(info.max).toBe(DRIFT_MAX);
    expect(info.reach.length).toBeGreaterThan(20);
  });

  it('is null when nothing moves it, and moves otherwise', () => {
    expect(automatedDrift([], 3, 0, 0, 4)).toBeNull();
    expect(automatedDrift([], 3, 40, 0, 4)).toBeNull();
    expect(automatedDrift([lane({ from: 40, to: 90 })], 3, 0, 0, 4)).toBe(40);
    // A lane that arrives where the channel already is says nothing.
    expect(automatedDrift([lane({ from: 40, to: 40 })], 3, 40, 0, 4)).toBeNull();
    // A lane on another channel does not reach this one.
    expect(automatedDrift([lane({ track: 2 })], 3, 0, 0, 4)).toBeNull();
  });
});

describe('drift in a script and a file', () => {
  it('reads drift off a track line', () => {
    const song = applied('tracks 4\ntrack 3 "PAD" voice pad drift 40').song;
    expect(song.tracks[2].drift).toBe(40);
  });

  it('reads drift as an automate destination', () => {
    const song = applied('tracks 4\ntrack 3 "PAD"\nautomate 3 drift 10 90 bars 8 to 15').song;
    expect(song.automation).toHaveLength(1);
    expect(song.automation[0]).toMatchObject({ track: 3, target: 'drift', from: 10, to: 90, startBar: 8, endBar: 15 });
  });

  it('refuses a drift that is not a percentage, in words', () => {
    expect(refused('track 3 "PAD" drift 150')).toContain('percentage');
    expect(refused('track 3 "PAD" drift wobbly')).toContain('percentage');
  });

  it('writes nothing for a steady channel, so old songs are unchanged', () => {
    const song = applied('tracks 2\ntrack 1 "S" wave sine level 70').song;
    expect(songToJson(song)).not.toContain('"drift"');
    expect(songToScript(song)).not.toContain('drift');
    expect(JSON.parse(songToJson(song)).version).toBe(12);
  });

  it('round-trips drift through JSON and the script', () => {
    const song = applied('tracks 4\ntrack 3 "PAD" voice pad drift 40').song;
    const json = songToJson(song);
    expect(json).toContain('"drift": 40');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[2].drift).toBe(40);

    const script = songToScript(song);
    expect(script).toContain(' drift 40');
    expect(applied(script).song.tracks[2].drift).toBe(40);
  });

  it('writes the file version a wandering song needs, and it is the newest', () => {
    const wandered = applied('tracks 4\ntrack 3 "PAD" wave sine drift 40').song;
    expect(JSON.parse(songToJson(wandered)).version).toBe(DRIFT_SONG_FILE_VERSION);
    expect(DRIFT_SONG_FILE_VERSION).toBe(35);
    expect(DRIFT_SONG_FILE_VERSION).toBeLessThan(SONG_FILE_VERSION_MAX);
  });
});

// --- the synthesis ----------------------------------------------------------

interface SetCall { v: number; t: number }
interface FakeOsc {
  type: string;
  frequency: { value: number; sets: SetCall[] };
  detune: { value: number; sets: SetCall[] };
}

function param() {
  const p = {
    value: 0,
    sets: [] as SetCall[],
    setValueAtTime(v: number, t: number) { this.value = v; this.sets.push({ v, t }); },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
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

function built(drift: number): FakeOsc[] {
  const fake = fakeContext();
  buildNote(
    fake.ctx as unknown as BaseAudioContext,
    patchFromVoice(DEFAULT_VOICE as VoiceParams),
    60, 0, 0.5, DESTINATION, null, { drift },
  );
  return fake.oscillators;
}

describe('the wobble the synth builds', () => {
  it('builds nothing extra for a steady channel', () => {
    expect(built(DRIFT_MIN)).toHaveLength(1);
  });

  it('builds one modulator per wow rate and one for the flutter', () => {
    const oscillators = built(DRIFT_MAX);
    expect(oscillators).toHaveLength(1 + 3);
    const rates = oscillators.slice(1).map((osc) => osc.frequency.value);
    expect(rates).toEqual([DRIFT_WOW_HZ, DRIFT_WOW_DRIFT_HZ, DRIFT_FLUTTER_HZ]);
  });
});
