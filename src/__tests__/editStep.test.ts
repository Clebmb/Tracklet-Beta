import { describe, expect, it } from 'vitest';

import {
  advanceAfterWrite,
  advanceByStep,
  applyScript,
  clampEditStep,
  createSong,
  MAX_EDIT_STEP,
  MIN_EDIT_STEP,
  SCRIPT_KEYWORDS,
  type Pattern,
} from '../model';
import { SCRIPT_COMMANDS, SCRIPT_VERSION, scriptCapabilities } from '../model/capabilities';

/**
 * The EDIT STEP: how far the cursor walks after a note.
 *
 * Two halves worth testing apart. The arithmetic is a clamp and an add, and the
 * clamp is where a bad setting would become a cursor off the grid. The word is a
 * session setting, so what matters is that it parses, that it refuses what it
 * cannot take, and that it never reaches the song.
 */

function eightRows(): Pattern {
  const result = applyScript(createSong(), 'tracks 1\nsteps 8');
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song.patterns[0];
}

function applied(source: string): ReturnType<typeof applyScript> {
  return applyScript(createSong(), source);
}

describe('the step, as arithmetic', () => {
  it('clamps to what an editor can take, and defaults a nonsense value to one', () => {
    expect(clampEditStep(-3)).toBe(MIN_EDIT_STEP);
    expect(clampEditStep(99)).toBe(MAX_EDIT_STEP);
    expect(clampEditStep(2.6)).toBe(3);
    expect(clampEditStep(Number.NaN)).toBe(1);
    expect(clampEditStep(0)).toBe(0);
  });

  it('moves the cursor down by the step and keeps it on the grid', () => {
    const pattern = eightRows();
    expect(advanceByStep({ row: 0, track: 0 }, 2, pattern, 1)).toEqual({ row: 2, track: 0 });
    expect(advanceByStep({ row: 0, track: 0 }, 8, pattern, 1)).toEqual({ row: 7, track: 0 });
    // A step that runs past the last row lands ON the last row, not outside it.
    expect(advanceByStep({ row: 6, track: 0 }, 4, pattern, 1)).toEqual({ row: 7, track: 0 });
  });

  it('stays where it is at 0, which is how notes stack into one step', () => {
    const pattern = eightRows();
    expect(advanceByStep({ row: 3, track: 0 }, 0, pattern, 1)).toEqual({ row: 3, track: 0 });
  });

  it('leaves the plain one-row advance exactly as it was', () => {
    const pattern = eightRows();
    expect(advanceAfterWrite({ row: 1, track: 0 }, pattern, 1)).toEqual({ row: 2, track: 0 });
    expect(advanceAfterWrite({ row: 7, track: 0 }, pattern, 1)).toEqual({ row: 7, track: 0 });
  });
});

describe('the word', () => {
  it('sets the step for the session and never for the song', () => {
    const result = applied('advance 3\nnote 0 1 C-4');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.advance).toBe(3);
    expect((result.song as unknown as Record<string, unknown>).advance).toBeUndefined();
  });

  it('takes the two ends, which are both real settings', () => {
    for (const step of [0, 8]) {
      const result = applied(`advance ${step}`);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.advance).toBe(step);
    }
  });

  it('says nothing when it was never said', () => {
    const result = applied('note 0 1 C-4');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.advance).toBeUndefined();
  });

  it('refuses a number it cannot take, naming the range and the zero', () => {
    for (const [source, said] of [
      ['advance 9', '0..8'],
      ['advance -1', '0..8'],
      ['advance 1.5', '0..8'],
      ['advance two', '0..8'],
    ] as const) {
      const result = applied(source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].message).toContain(said);
    }
  });

  it('refuses no value and two values', () => {
    for (const source of ['advance', 'advance 2 4']) {
      const result = applied(source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].message).toContain('advance needs one whole number');
    }
  });

  it('sits in the language beside the octave, and is published', () => {
    expect(SCRIPT_KEYWORDS.indexOf('advance')).toBe(SCRIPT_KEYWORDS.indexOf('octave') + 1);
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(60);
    const caps = scriptCapabilities();
    expect(caps.versionNotes.map((entry) => entry.version)).toContain(60);
    expect(caps.versionNotes.find((entry) => entry.version === 60)?.note).toContain('EDIT STEP');
    expect(SCRIPT_COMMANDS.map((one) => one.word)).toContain('advance');
  });
});
