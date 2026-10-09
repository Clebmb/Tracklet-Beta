import { describe, expect, it } from 'vitest';

import { createSong, ensurePattern, setCellNotes, type Pattern } from '../model';
import {
  MAX_ROLL_SPAN,
  MIN_ROLL_SPAN,
  MIN_STEP_W,
  ROLL_GUTTER,
  channelPitches,
  pitchAtY,
  pitchInKey,
  rollLayout,
  rollRange,
  stepAtX,
  xForStep,
  yForPitch,
} from '../ui/pianoRoll';

/**
 * The piano roll's arithmetic, tested without a canvas.
 *
 * The view class owns the pixels; everything a click or a note rectangle depends
 * on is here, which is the half worth checking — a mapping that is off by one row
 * writes the wrong note into the song.
 */

function patternOf(notes: Array<[number, number, number]>, steps = 16): Pattern {
  const song = createSong();
  const pattern = ensurePattern(song, 0);
  while (pattern.steps.length < steps) pattern.steps.push(pattern.steps[0].map((cell) => ({ ...cell, note: null, extra: [] })));
  for (const [row, track, pitch] of notes) setCellNotes(pattern.steps[row][track], [pitch]);
  return pattern;
}

describe('the roll range', () => {
  it('reads only the channel it was asked about', () => {
    const pattern = patternOf([[0, 0, 60], [0, 1, 36], [1, 0, 64]]);
    expect(channelPitches(pattern, 0).sort((a, b) => a - b)).toEqual([60, 64]);
    expect(channelPitches(pattern, 1)).toEqual([36]);
  });

  it('grows a one-note part to at least an octave', () => {
    const { low, high } = rollRange(patternOf([[0, 0, 60]]), 0);
    expect(high - low + 1).toBeGreaterThanOrEqual(MIN_ROLL_SPAN);
    expect(low).toBeLessThanOrEqual(60);
    expect(high).toBeGreaterThanOrEqual(60);
  });

  it('keeps a tight range tight, rather than padding it out to the maximum', () => {
    // C-4 to C-5 is 13 semitones, so the roll should be 13 rows — not a padded
    // three octaves, which would squeeze the melody into a third of the panel.
    const { low, high } = rollRange(patternOf([[0, 0, 60], [1, 0, 72]]), 0);
    expect(low).toBeLessThanOrEqual(60);
    expect(high).toBeGreaterThanOrEqual(72);
    expect(high - low + 1).toBeLessThanOrEqual(MAX_ROLL_SPAN);
    expect(high - low + 1).toBeLessThan(20);
  });

  it('never draws more than three octaves, even for a wild part', () => {
    const { low, high } = rollRange(patternOf([[0, 0, 24], [1, 0, 110]]), 0);
    expect(high - low + 1).toBeLessThanOrEqual(MAX_ROLL_SPAN);
    expect(high).toBeGreaterThanOrEqual(110);
  });

  it('stays inside the range a note may have', () => {
    for (const pitch of [12, 60, 119]) {
      const { low, high } = rollRange(patternOf([[0, 0, pitch]]), 0);
      expect(low).toBeGreaterThanOrEqual(12);
      expect(high).toBeLessThanOrEqual(119);
    }
  });

  it('centres on C-4 for a channel with nothing on it yet', () => {
    const { low, high } = rollRange(patternOf([]), 0);
    expect(low).toBeLessThanOrEqual(60);
    expect(high).toBeGreaterThanOrEqual(60);
  });
});

describe('the roll window', () => {
  it('fits a short pattern whole, with columns at least the minimum width', () => {
    const layout = rollLayout(patternOf([[0, 0, 60]]), 0, 0, 600, 228);
    expect(layout.columns).toBe(16);
    expect(layout.firstStep).toBe(0);
    expect(layout.stepW).toBeGreaterThanOrEqual(MIN_STEP_W);
  });

  it('follows the cursor when a long pattern cannot fit', () => {
    const pattern = patternOf([[0, 0, 60]], 512);
    const atStart = rollLayout(pattern, 0, 0, 600, 228);
    const inMiddle = rollLayout(pattern, 0, 300, 600, 228);
    expect(atStart.columns).toBeLessThan(512);
    expect(atStart.firstStep).toBe(0);
    expect(inMiddle.firstStep).toBeGreaterThan(0);
    // The cursor is inside the window, which is the whole bargain.
    expect(inMiddle.firstStep).toBeLessThanOrEqual(300);
    expect(inMiddle.firstStep + inMiddle.columns).toBeGreaterThan(300);
  });

  it('never scrolls past either end', () => {
    const pattern = patternOf([[0, 0, 60]], 512);
    expect(rollLayout(pattern, 0, 0, 600, 228).firstStep).toBe(0);
    const end = rollLayout(pattern, 0, 511, 600, 228);
    expect(end.firstStep + end.columns).toBeGreaterThanOrEqual(511);
  });
});

describe('mapping a point to a pitch and a step', () => {
  const layout = rollLayout(patternOf([[0, 0, 60]]), 0, 0, 600, 228);

  it('round-trips a pitch through its y', () => {
    for (const pitch of [layout.low, layout.low + 4, layout.low + layout.span - 1]) {
      const y = yForPitch(pitch, layout) + layout.rowH / 2;
      expect(pitchAtY(y, layout)).toBe(pitch);
    }
  });

  it('reads the TOP of the panel as the highest pitch, not the lowest', () => {
    expect(pitchAtY(0, layout)).toBe(layout.low + layout.span - 1);
  });

  it('clamps a point past the top or bottom into the range', () => {
    expect(pitchAtY(-500, layout)).toBe(layout.low + layout.span - 1);
    expect(pitchAtY(9999, layout)).toBe(layout.low);
  });

  it('maps a step column both ways', () => {
    for (const step of [0, 3, 9, 15]) {
      const x = xForStep(step, layout) + 1;
      expect(stepAtX(x, layout)).toBe(step);
    }
  });

  it('says nothing at all for a point over the keyboard strip', () => {
    expect(stepAtX(ROLL_GUTTER - 1, layout)).toBeNull();
    expect(stepAtX(0, layout)).toBeNull();
  });
});

describe('the key', () => {
  it('tints the notes the song is written in', () => {
    const cMajor = { tonic: 0, scale: 'major' as const };
    expect(pitchInKey(60, cMajor)).toBe(true);
    expect(pitchInKey(61, cMajor)).toBe(false);
  });
});
