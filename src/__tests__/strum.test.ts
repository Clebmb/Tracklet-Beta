import { describe, expect, it } from 'vitest';

import {
  clampStrum,
  createSong,
  DEFAULT_STRUM,
  MAX_STRUM,
  MIN_STRUM,
  strumLabel,
  strumOffsets,
  tidyTrackName,
} from '../model';
import { applyScript } from '../model/script';
import { songFromJson, songToJson, songToScript } from '../model/songfile';

/**
 * The strum: how far a channel ROLLS a chord, in steps.
 *
 * A chord written in one cell (`C-4,E-4,G-4`) is a block by default and a roll
 * when the channel says so — the first note on the step, the last `strum` steps
 * later, the rest spread evenly between. The one rule `strumOffsets` owns is the
 * arithmetic the scheduler, the renderer and the MIDI writer all share, so a chord
 * rolls the same live, in an export and in a `.mid`.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the strum span', () => {
  it('clamps to whole steps 0..4, with 0 the default', () => {
    expect(MIN_STRUM).toBe(0);
    expect(MAX_STRUM).toBe(4);
    expect(DEFAULT_STRUM).toBe(0);
    expect(clampStrum(-1)).toBe(0);
    expect(clampStrum(0)).toBe(0);
    expect(clampStrum(2.4)).toBe(2);
    expect(clampStrum(999)).toBe(MAX_STRUM);
    expect(clampStrum(Number.NaN)).toBe(DEFAULT_STRUM);
  });

  it('reads OFF at 0 and a step count above it', () => {
    expect(strumLabel(0)).toBe('OFF');
    expect(strumLabel(1)).toBe('1 step');
    expect(strumLabel(2)).toBe('2 steps');
    expect(strumLabel(40)).toBe('4 steps');
  });
});

describe('where a chord falls', () => {
  it('is a block for a single note or a channel at 0', () => {
    expect(strumOffsets(1, 2)).toEqual([0]);
    expect(strumOffsets(3, 0)).toEqual([0, 0, 0]);
    expect(strumOffsets(4, -5)).toEqual([0, 0, 0, 0]);
  });

  it('spreads a chord evenly, first on the step and last `span` steps later', () => {
    expect(strumOffsets(3, 1)).toEqual([0, 0.5, 1]);
    expect(strumOffsets(3, 4)).toEqual([0, 2, 4]);
    expect(strumOffsets(2, 3)).toEqual([0, 3]);
    expect(strumOffsets(5, 4)).toEqual([0, 1, 2, 3, 4]);
  });

  it('clamps the span before it spreads', () => {
    expect(strumOffsets(3, 100)).toEqual(strumOffsets(3, MAX_STRUM));
  });
});

// --- the language and the files --------------------------------------------

describe('a strummed channel in a script and a file', () => {
  it('sets the span from a track line', () => {
    const song = applied('tracks 1\ntrack 1 "GTR" wave sine strum 2').song;
    expect(song.tracks[0].strum).toBe(2);
  });

  it('starts at 0, so a channel that says nothing is a block', () => {
    const song = applied('tracks 1\ntrack 1 "GTR" wave sine').song;
    expect(song.tracks[0].strum).toBe(DEFAULT_STRUM);
  });

  it('refuses a span outside 0..4, in words', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "GTR" wave sine strum 9');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('strum');
  });

  it('round-trips through both formats', () => {
    const song = createSong();
    song.tracks[0].name = tidyTrackName('GTR');
    song.tracks[0].strum = 2;

    const json = songToJson(song);
    expect(json).toContain('"strum": 2');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].strum).toBe(2);

    expect(songToScript(song)).toContain('strum 2');
  });

  it('leaves a block channel out of the written file, so old songs are byte-identical', () => {
    const song = createSong();
    expect(songToJson(song)).not.toContain('"strum"');
    expect(songToScript(song)).not.toContain('strum');
  });
});
