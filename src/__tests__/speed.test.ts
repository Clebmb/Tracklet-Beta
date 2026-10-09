import { describe, expect, it } from 'vitest';

import { buildNote } from '../audio/synth';
import {
  applyScript,
  clampSpeed,
  createSong,
  DEFAULT_SPEED,
  DEFAULT_VOICE,
  patchFromVoice,
  secondsPerRow,
  songFromJson,
  SONG_FILE_VERSION_MAX,
  MACHINE_BARS_SONG_FILE_VERSION,
  MACHINE_PAD_SAMPLE_SONG_FILE_VERSION,
  MACHINE_SECTION_BAR_SONG_FILE_VERSION,
  MACHINE_SONG_FILE_VERSION,
  SCENES_SONG_FILE_VERSION,
  ARP_SONG_FILE_VERSION,
  songToJson,
  songToScript,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_NORMAL,
  SPEED_SONG_FILE_VERSION,
  speedFactor,
  speedLabel,
  speedSemitones,
  type VoiceParams,
} from '../model';

/**
 * The master speed: the tape transport, as one ratio that moves PITCH and TIME
 * together.
 *
 * The two halves are read from the same factor in two places — `secondsPerRow`
 * divides by it, the synth multiplies every frequency by it — so the coupling is
 * the one thing to pin: half speed is twice as long AND an octave down, and
 * `100` is exactly the identity on both.
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

describe('the ratio', () => {
  it('clamps into the wide range and names normal', () => {
    expect(clampSpeed(-10)).toBe(SPEED_MIN);
    expect(clampSpeed(1000)).toBe(SPEED_MAX);
    expect(clampSpeed(80.4)).toBe(80);
    expect(clampSpeed(Number.NaN)).toBe(DEFAULT_SPEED);
    expect(speedLabel(DEFAULT_SPEED)).toBe('100% (normal)');
    expect(speedLabel(80)).toBe('80%');
  });

  it('is the identity at 100 and a ratio elsewhere', () => {
    expect(speedFactor(100)).toBe(1);
    expect(speedFactor(50)).toBe(0.5);
    expect(speedFactor(200)).toBe(2);
    expect(SPEED_NORMAL).toBe(DEFAULT_SPEED);
  });

  it('is an interval: half speed is exactly an octave down', () => {
    expect(speedSemitones(50)).toBeCloseTo(-12, 5);
    expect(speedSemitones(200)).toBeCloseTo(12, 5);
    expect(speedSemitones(100)).toBeCloseTo(0, 5);
  });
});

describe('the clock', () => {
  it('leaves a row alone at normal speed', () => {
    expect(secondsPerRow(120, 4, 100)).toBeCloseTo(secondsPerRow(120, 4), 10);
  });

  it('stretches the row at half speed and shortens it at double', () => {
    const base = secondsPerRow(120, 4, 100);
    expect(secondsPerRow(120, 4, 50)).toBeCloseTo(base * 2, 10);
    expect(secondsPerRow(120, 4, 200)).toBeCloseTo(base / 2, 10);
  });
});

describe('speed in a script and a file', () => {
  it('reads a speed statement', () => {
    const song = applied('speed 80').song;
    expect(song.speed).toBe(80);
  });

  it('refuses a speed out of range, and one with no value', () => {
    expect(refused('speed 10')).toContain('percentage');
    expect(refused('speed fast')).toContain('percentage');
    expect(refused('speed')).toContain('percentage');
  });

  it('writes nothing at normal speed, so old songs are unchanged', () => {
    const song = applied('tracks 2\ntrack 1 "S" wave sine').song;
    expect(songToJson(song)).not.toContain('"speed"');
    expect(songToScript(song)).not.toContain('speed');
    expect(JSON.parse(songToJson(song)).version).toBe(12);
  });

  it('round-trips a speed through JSON and the script', () => {
    const song = applied('tracks 2\nspeed 80\ntrack 1 "S" wave sine').song;
    const json = songToJson(song);
    expect(json).toContain('"speed": 80');
    expect(JSON.parse(json).version).toBe(SPEED_SONG_FILE_VERSION);
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.speed).toBe(80);

    const script = songToScript(song);
    expect(script).toContain('speed 80');
    expect(applied(script).song.speed).toBe(80);
  });

  it('is one below the newest file version this build can read', () => {
    expect(SPEED_SONG_FILE_VERSION).toBe(36);
    // The DRUM MACHINE claimed 37, one past the tape speed; a machine with MORE
    // THAN ONE BAR claimed 38 on top of it, and a machine with a PAD on a
    // recording claimed 39 above that.
    expect(SPEED_SONG_FILE_VERSION).toBe(MACHINE_SONG_FILE_VERSION - 1);
    expect(MACHINE_SONG_FILE_VERSION).toBe(MACHINE_BARS_SONG_FILE_VERSION - 1);
    expect(MACHINE_BARS_SONG_FILE_VERSION).toBe(MACHINE_PAD_SAMPLE_SONG_FILE_VERSION - 1);
    expect(MACHINE_PAD_SAMPLE_SONG_FILE_VERSION).toBe(MACHINE_SECTION_BAR_SONG_FILE_VERSION - 1);
    // And the LIVE page's SCENES claimed 41 on top of that; the ARP page's DIALS
    // claimed 42, which is the ceiling.
    expect(MACHINE_SECTION_BAR_SONG_FILE_VERSION).toBe(SCENES_SONG_FILE_VERSION - 1);
    expect(SCENES_SONG_FILE_VERSION).toBe(ARP_SONG_FILE_VERSION - 1);
    expect(ARP_SONG_FILE_VERSION).toBe(SONG_FILE_VERSION_MAX);
  });
});

// --- the synthesis ----------------------------------------------------------

interface FakeOsc {
  type: string;
  frequency: { value: number; sets: Array<{ v: number }> };
  detune: { value: number; sets: Array<{ v: number }> };
}

function param() {
  const p = {
    value: 0,
    sets: [] as Array<{ v: number }>,
    setValueAtTime(v: number) { this.value = v; this.sets.push({ v }); },
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

function pitchAt(speed: number): number {
  const fake = fakeContext();
  buildNote(
    fake.ctx as unknown as BaseAudioContext,
    patchFromVoice(DEFAULT_VOICE as VoiceParams),
    69, 0, 0.5, DESTINATION, null, { speed },
  );
  const first = fake.oscillators[0].frequency.sets[0];
  if (!first) throw new Error('the oscillator was never given a frequency');
  return first.v;
}

describe('the pitch the synth builds', () => {
  it('is the written pitch at normal speed', () => {
    expect(pitchAt(100)).toBeCloseTo(440, 3);
  });

  it('moves by the same ratio as the clock', () => {
    expect(pitchAt(50)).toBeCloseTo(220, 3);
    expect(pitchAt(200)).toBeCloseTo(880, 3);
  });
});
