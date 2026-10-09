import { describe, expect, it } from 'vitest';

import {
  baseMidiForOctave,
  isSharpSemitone,
  KEYBOARD_SEMITONES,
  keyForSemitone,
  midiToNoteName,
  octaveOf,
  PIANO_KEY_SEMITONES,
  pianoKeys,
} from '../model';

const WIDTH = 638;
const HEIGHT = 36;
const GAP = 8;

describe('the semitone -> key map', () => {
  it('is the exact inverse of the keyboard map', () => {
    for (const [code, semitone] of Object.entries(PIANO_KEY_SEMITONES)) {
      expect(keyForSemitone(semitone)).toBe(code.replace(/^Key|^Digit/, ''));
    }
  });

  it('covers exactly the keys that exist', () => {
    for (let semitone = 0; semitone < KEYBOARD_SEMITONES; semitone++) {
      expect(keyForSemitone(semitone)).toBeTruthy();
    }
    expect(keyForSemitone(KEYBOARD_SEMITONES)).toBeNull();
  });

  it('knows which semitones are black keys', () => {
    // C, D, E, F, G, A, B are white; the five between are black.
    const whites = [0, 2, 4, 5, 7, 9, 11];
    for (let pc = 0; pc < 12; pc++) {
      expect(isSharpSemitone(pc)).toBe(!whites.includes(pc));
    }
  });

  it('maps an octave to its base MIDI note', () => {
    expect(baseMidiForOctave(4)).toBe(60);
    expect(octaveOf(60)).toBe(4);
    expect(octaveOf(baseMidiForOctave(7) + 23)).toBe(8);
  });
});

describe('the on-screen keyboard layout', () => {
  const keys = pianoKeys(WIDTH, HEIGHT, baseMidiForOctave(4), { octaveGap: GAP });
  const whites = keys.filter((k) => k.white);
  const blacks = keys.filter((k) => !k.white);

  it('lays out two octaves: fourteen white keys and ten black ones', () => {
    expect(keys).toHaveLength(24);
    expect(whites).toHaveLength(14);
    expect(blacks).toHaveLength(10);
  });

  it('names every key, ascending, starting at the base note', () => {
    const ascending = [...keys].sort((a, b) => a.semitone - b.semitone);
    ascending.forEach((key, i) => {
      expect(key.semitone).toBe(i);
      expect(key.midi).toBe(60 + i);
      expect(midiToNoteName(key.midi)).toHaveLength(3);
    });
  });

  it('tiles the white keys across the width with no gaps', () => {
    const left = Math.min(...whites.map((k) => k.rect.x));
    const right = Math.max(...whites.map((k) => k.rect.x + k.rect.width));
    expect(left).toBe(0);
    // The gap between the two groups is spent INSIDE the strip, so the keys
    // still reach both edges.
    expect(right).toBe(WIDTH);

    // No white key overlaps the next one.
    const byX = [...whites].sort((a, b) => a.rect.x - b.rect.x);
    for (let i = 1; i < byX.length; i++) {
      expect(byX[i].rect.x).toBeGreaterThanOrEqual(byX[i - 1].rect.x + byX[i - 1].rect.width);
    }
  });

  it('leaves a gap between the two octave groups', () => {
    const firstGroup = whites.filter((k) => k.semitone < 12);
    const secondGroup = whites.filter((k) => k.semitone >= 12);
    const firstRight = Math.max(...firstGroup.map((k) => k.rect.x + k.rect.width));
    const secondLeft = Math.min(...secondGroup.map((k) => k.rect.x));
    expect(secondLeft - firstRight).toBe(GAP);
  });

  it('draws black keys shorter than white keys, inside the strip', () => {
    for (const key of blacks) {
      expect(key.rect.height).toBeLessThan(HEIGHT);
      expect(key.rect.y).toBe(0);
      expect(key.rect.x).toBeGreaterThanOrEqual(0);
      expect(key.rect.x + key.rect.width).toBeLessThanOrEqual(WIDTH);
    }
    for (const key of whites) expect(key.rect.height).toBe(HEIGHT);
  });

  it('straddles each black key across the boundary it leans on', () => {
    // C#4 sits over the seam between C-4 and D-4.
    const c4 = whites.find((k) => k.semitone === 0)!;
    const cSharp4 = blacks.find((k) => k.semitone === 1)!;
    const seam = c4.rect.x + c4.rect.width;
    const centre = cSharp4.rect.x + cSharp4.rect.width / 2;
    expect(Math.abs(centre - seam)).toBeLessThanOrEqual(1);
  });

  it('has no black key between E and F, or between B and C', () => {
    expect(blacks.some((k) => k.semitone % 12 === 5)).toBe(false); // F
    expect(blacks.some((k) => k.semitone % 12 === 0)).toBe(false); // C
    expect(blacks.map((k) => k.semitone % 12).sort((a, b) => a - b)).toEqual([1, 1, 3, 3, 6, 6, 8, 8, 10, 10]);
  });

  it('never produces a zero-width key on a narrow strip', () => {
    for (const key of pianoKeys(40, 20, 60, { octaveGap: 8 })) {
      expect(key.rect.width).toBeGreaterThan(0);
    }
  });
});
