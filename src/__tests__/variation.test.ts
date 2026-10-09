import { describe, expect, it } from 'vitest';

import {
  applyScript,
  clampRobin,
  clampTouch,
  createSong,
  DEFAULT_ROBIN,
  DEFAULT_TOUCH,
  hitShift,
  isToneShift,
  MAX_ROBIN_BRIGHT,
  MAX_ROBIN_CENTS,
  MAX_ROBIN_GAIN,
  MAX_TOUCH_BRIGHT,
  NO_TONE_SHIFT,
  robinLabel,
  ROBIN_MAX,
  ROBIN_MIN,
  roundRobinShift,
  ROUND_ROBIN_CYCLE,
  songFromJson,
  SONG_FILE_VERSION_MAX,
  songToJson,
  songToScript,
  TOUCH_MAX,
  TOUCH_MIN,
  touchLabel,
  touchShift,
  VARIATION_SONG_FILE_VERSION,
} from '../model';

/**
 * The variation settings: a round-robin (`robin`) that makes successive hits
 * differ, and velocity layers (`touch`) that darken a soft hit.
 *
 * Both answer with the same small record — a `ToneShift` of cents, level and
 * brightness — and both must keep the identity EXACT: `robin 0`/`touch 0`, and
 * the first hit of any channel, are the note exactly as written.
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

describe('the round-robin', () => {
  it('is the note as written for the first hit, and off at robin 0', () => {
    expect(roundRobinShift(DEFAULT_ROBIN, 0)).toBe(NO_TONE_SHIFT);
    expect(roundRobinShift(60, 0)).toBe(NO_TONE_SHIFT);
    for (let index = 0; index < 8; index += 1) {
      expect(roundRobinShift(ROBIN_MIN, index)).toBe(NO_TONE_SHIFT);
    }
  });

  it('walks a fixed cycle of four, so the same song plays the same way', () => {
    for (let index = 0; index < 12; index += 1) {
      expect(roundRobinShift(80, index)).toEqual(roundRobinShift(80, index + ROUND_ROBIN_CYCLE));
    }
    expect(roundRobinShift(80, 0)).toBe(NO_TONE_SHIFT);
    expect(roundRobinShift(80, ROUND_ROBIN_CYCLE)).toBe(NO_TONE_SHIFT);
  });

  it('reaches the published maxima at robin 100', () => {
    const first = roundRobinShift(ROBIN_MAX, 1);
    expect(first.cents).toBeCloseTo(MAX_ROBIN_CENTS, 5);
    expect(first.gain).toBeCloseTo(-MAX_ROBIN_GAIN / 2, 5);
    expect(Math.abs(first.bright)).toBeLessThanOrEqual(MAX_ROBIN_BRIGHT);
    // No hit overshoots what the language publishes.
    for (let index = 0; index < ROUND_ROBIN_CYCLE; index += 1) {
      const shift = roundRobinShift(ROBIN_MAX, index);
      expect(Math.abs(shift.cents)).toBeLessThanOrEqual(MAX_ROBIN_CENTS);
      expect(Math.abs(shift.gain)).toBeLessThanOrEqual(MAX_ROBIN_GAIN);
      expect(Math.abs(shift.bright)).toBeLessThanOrEqual(MAX_ROBIN_BRIGHT);
    }
  });

  it('scales with the amount', () => {
    const full = roundRobinShift(100, 2);
    const half = roundRobinShift(50, 2);
    expect(half.cents).toBeCloseTo(full.cents / 2, 5);
    expect(half.gain).toBeCloseTo(full.gain / 2, 5);
    expect(half.bright).toBeCloseTo(full.bright / 2, 5);
  });

  it('clamps and labels like every other percentage', () => {
    expect(clampRobin(150)).toBe(ROBIN_MAX);
    expect(clampRobin(-5)).toBe(ROBIN_MIN);
    expect(clampRobin(Number.NaN)).toBe(DEFAULT_ROBIN);
    expect(robinLabel(DEFAULT_ROBIN)).toBe('OFF');
    expect(robinLabel(60)).toBe('60%');
  });
});

describe('the touch layer', () => {
  it('leaves a full-velocity hit and touch 0 exactly as written', () => {
    expect(touchShift(DEFAULT_TOUCH, 0)).toBe(NO_TONE_SHIFT);
    expect(touchShift(70, 100)).toBe(NO_TONE_SHIFT);
    expect(touchShift(70, 120)).toBe(NO_TONE_SHIFT);
  });

  it('darkens a soft hit, by the amount and the softness', () => {
    expect(touchShift(TOUCH_MAX, 0).bright).toBeCloseTo(-MAX_TOUCH_BRIGHT, 5);
    expect(touchShift(TOUCH_MAX, 50).bright).toBeCloseTo(-MAX_TOUCH_BRIGHT / 2, 5);
    expect(touchShift(TOUCH_MAX, 50).cents).toBe(0);
    expect(touchShift(TOUCH_MAX, 50).gain).toBe(0);
  });

  it('falls away as the hit gets softer', () => {
    let last = 0;
    for (const velocity of [100, 80, 60, 40, 20, 0]) {
      const bright = touchShift(90, velocity).bright;
      expect(bright).toBeLessThanOrEqual(last);
      last = bright;
    }
  });

  it('clamps and labels like every other percentage', () => {
    expect(clampTouch(150)).toBe(TOUCH_MAX);
    expect(clampTouch(-5)).toBe(TOUCH_MIN);
    expect(clampTouch(Number.NaN)).toBe(DEFAULT_TOUCH);
    expect(touchLabel(DEFAULT_TOUCH)).toBe('OFF');
    expect(touchLabel(70)).toBe('70%');
  });
});

describe('one hit, both settings', () => {
  it('sums the two shifts and keeps the first hit identical', () => {
    expect(hitShift({ robin: 100, touch: 100 }, 0, 100)).toBe(NO_TONE_SHIFT);
    const robin = roundRobinShift(100, 1);
    const touch = touchShift(100, 0);
    const both = hitShift({ robin: 100, touch: 100 }, 1, 0);
    expect(both.cents).toBeCloseTo(robin.cents + touch.cents, 5);
    expect(both.gain).toBeCloseTo(robin.gain + touch.gain, 5);
    expect(both.bright).toBeCloseTo(robin.bright + touch.bright, 5);
  });

  it('is the identity only when both are off', () => {
    expect(isToneShift(NO_TONE_SHIFT)).toBe(true);
    expect(isToneShift(hitShift({ robin: 60, touch: 60 }, 1, 100))).toBe(false);
    expect(isToneShift(roundRobinShift(100, 1))).toBe(false);
  });
});

// --- the language and the files --------------------------------------------

describe('variation in a script and a file', () => {
  it('reads robin and touch off a track line', () => {
    const song = applied('tracks 2\ntrack 1 "SNARE" voice snare robin 60 touch 70').song;
    expect(song.tracks[0].robin).toBe(60);
    expect(song.tracks[0].touch).toBe(70);
  });

  it('refuses a setting that is not a percentage, in words', () => {
    expect(refused('track 2 "S" robin 150')).toContain('percentage');
    expect(refused('track 2 "S" touch nope')).toContain('percentage');
  });

  it('writes nothing for a channel that does not vary, so old songs are unchanged', () => {
    const song = applied('tracks 2\ntrack 1 "S" wave sine level 70').song;
    expect(songToJson(song)).not.toContain('"robin"');
    expect(songToJson(song)).not.toContain('"touch"');
    expect(songToScript(song)).not.toContain('robin');
    expect(songToScript(song)).not.toContain('touch');
  });

  it('round-trips both settings through JSON and the script', () => {
    const song = applied('tracks 2\ntrack 1 "S" voice snare robin 60 touch 70').song;
    const json = songToJson(song);
    expect(json).toContain('"robin": 60');
    expect(json).toContain('"touch": 70');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].robin).toBe(60);
    expect(parsed.song.tracks[0].touch).toBe(70);

    const script = songToScript(song);
    expect(script).toContain(' robin 60');
    expect(script).toContain(' touch 70');
    const fromScript = applied(script).song;
    expect(fromScript.tracks[0].robin).toBe(60);
    expect(fromScript.tracks[0].touch).toBe(70);
  });

  it('writes the file version a varying song needs, and it is the newest', () => {
    const plain = applied('tracks 2\ntrack 1 "S" wave sine').song;
    expect(JSON.parse(songToJson(plain)).version).toBe(12);

    const varied = applied('tracks 2\ntrack 1 "S" wave sine robin 40').song;
    expect(JSON.parse(songToJson(varied)).version).toBe(VARIATION_SONG_FILE_VERSION);

    expect(VARIATION_SONG_FILE_VERSION).toBe(34);
    expect(SONG_FILE_VERSION_MAX).toBeGreaterThanOrEqual(VARIATION_SONG_FILE_VERSION);
  });
});
