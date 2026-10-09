import { describe, expect, it } from 'vitest';

import { createSong, ensurePattern, setCellNotes } from '../model';
import { overviewDensity, overviewMarkH, overviewRowAt, overviewYAt } from '../ui/overview';

/** A pattern of `rows` empty steps with the given notes written in. */
function patternWith(notes: Array<[number, number, number[],]> = [], rows = 16) {
  const song = createSong();
  const pattern = ensurePattern(song, 0);
  while (pattern.steps.length < rows) pattern.steps.push(pattern.steps[0].map((cell) => ({ ...cell, note: null, extra: [] })));
  for (const [row, track, pitch] of notes) setCellNotes(pattern.steps[row][track], pitch);
  return pattern;
}

describe('the overview density', () => {
  it('counts the voices on each step, in order', () => {
    const pattern = patternWith([[0, 0, [60]], [0, 1, [48]], [2, 0, [64]]]);
    const density = overviewDensity(pattern);
    expect(density[0]).toBe(2);
    expect(density[2]).toBe(1);
    expect(density[1]).toBe(0);
    expect(density).toHaveLength(16);
  });

  it('counts a chord in one cell as every note it holds', () => {
    const pattern = patternWith([[0, 0, [60, 64, 67]]]);
    expect(overviewDensity(pattern)[0]).toBe(3);
  });

  it('is all zeros on an empty pattern, so nothing is marked', () => {
    expect(overviewDensity(patternWith()).every((n) => n === 0)).toBe(true);
  });
});

describe('the overview strip maps a point to a step', () => {
  it('maps the strip linearly and clamps at both ends', () => {
    expect(overviewRowAt(0, 10, 160, 16)).toBe(0);
    expect(overviewRowAt(10, 10, 160, 16)).toBe(0);
    expect(overviewRowAt(19, 10, 160, 16)).toBe(0);
    expect(overviewRowAt(20, 10, 160, 16)).toBe(1);
    expect(overviewRowAt(170, 10, 160, 16)).toBe(15);
    // Past the end is the last step rather than a step one row beyond it.
    expect(overviewRowAt(9999, 10, 160, 16)).toBe(15);
    expect(overviewRowAt(-9999, 10, 160, 16)).toBe(0);
  });

  it('never asks for a step the pattern does not have', () => {
    for (let y = -20; y < 200; y++) {
      const row = overviewRowAt(y, 10, 160, 512);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThanOrEqual(511);
    }
  });
});

describe('the overview strip draws a step', () => {
  it('keeps every mark inside the strip, whatever the pitch of the step', () => {
    const top = 10;
    const height = 160;
    for (const row of [0, 1, 15, 255, 511]) {
      const y = overviewYAt(row, top, height, 512);
      expect(y).toBeGreaterThanOrEqual(top);
      expect(y).toBeLessThan(top + height);
    }
  });

  it('gives one pixel per step when a long pattern is squeezed', () => {
    expect(overviewMarkH(200, 512)).toBe(1);
    expect(overviewMarkH(200, 16)).toBe(12);
  });

  it('agrees with the mapping a click reads', () => {
    // A step drawn at y, clicked at y, must come back as that step (or, on a
    // crowded map, as the step whose pixel it shares — never a different one).
    for (const row of [0, 3, 7, 11, 15]) {
      const y = overviewYAt(row, 10, 160, 16);
      expect(overviewRowAt(y, 10, 160, 16)).toBe(row);
    }
  });
});
