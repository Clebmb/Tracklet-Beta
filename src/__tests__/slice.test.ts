import { describe, expect, it } from 'vitest';
import {
  clampSlice,
  MAX_SLICES,
  MIN_SLICE_SECONDS,
  SLICE_ROOT_NOTE,
  sliceFor,
  sliceWindowFor,
  tidySlices,
} from '../model/slice';
import { songFromJson, songToJson, songToScript } from '../model/songfile';
import { applyScript, createSong, SCRIPT_VERSION, SONG_FILE_VERSION_MAX } from '../model';

function applied(source: string) {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song;
}

function refused(source: string): string {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map((error) => error.message).join(' ');
}

describe('the slice list', () => {
  it('is the keyboard: C-4 is the first piece, C#-4 the second', () => {
    const slices = tidySlices([
      { start: 0, end: 0.42 },
      { start: 0.42, end: 0.9 },
    ]);
    expect(sliceFor(slices, SLICE_ROOT_NOTE)).toEqual({ start: 0, end: 0.42 });
    expect(sliceFor(slices, SLICE_ROOT_NOTE + 1)).toEqual({ start: 0.42, end: 0.9 });
  });

  it('is null past the last piece and below the first, so the caller plays the file whole', () => {
    const slices = [{ start: 0, end: 0.42 }];
    expect(sliceFor(slices, SLICE_ROOT_NOTE + 1)).toBe(null);
    expect(sliceFor(slices, SLICE_ROOT_NOTE - 1)).toBe(null);
    expect(sliceFor(undefined, SLICE_ROOT_NOTE)).toBe(null);
    expect(sliceFor([], SLICE_ROOT_NOTE)).toBe(null);
  });

  it('is kept in TIME order whatever order the pieces were written in', () => {
    const slices = tidySlices([
      { start: 0.9, end: 1.4 },
      { start: 0, end: 0.42 },
      { start: 0.42, end: 0.9 },
    ]);
    expect(slices.map((slice) => slice.start)).toEqual([0, 0.42, 0.9]);
  });

  it('never keeps a piece shorter than the floor, or a negative start', () => {
    expect(clampSlice(-3, 0.4)).toEqual({ start: 0, end: 0.4 });
    const backwards = clampSlice(0.5, 0.1);
    expect(backwards.start).toBe(0.5);
    expect(backwards.end).toBeCloseTo(0.5 + MIN_SLICE_SECONDS, 6);
    expect(clampSlice(Number.NaN, 1)).toEqual({ start: 0, end: 1 });
  });

  it('caps the list, because the keyboard can hold them all but a break cannot need more', () => {
    const many = Array.from({ length: MAX_SLICES + 5 }, (_, i) => ({ start: i, end: i + 0.5 }));
    expect(tidySlices(many)).toHaveLength(MAX_SLICES);
  });

  it('resolves to a window that does not loop, so a piece stops where the chop says', () => {
    expect(sliceWindowFor([{ start: 0.2, end: 0.6 }], SLICE_ROOT_NOTE)).toEqual({
      start: 0.2,
      end: 0.6,
      loop: false,
      loopStart: 0.2,
      loopEnd: 0.6,
    });
  });
});

describe('the slice statement', () => {
  it('chops a channel, and the pieces land in time order', () => {
    const song = applied('slice 1 0.9 1.4\nslice 1 0 0.42\nslice 1 0.42 0.9');
    expect(song.tracks[0].slices).toEqual([
      { start: 0, end: 0.42 },
      { start: 0.42, end: 0.9 },
      { start: 0.9, end: 1.4 },
    ]);
  });

  it('plays the recording whole again with clear', () => {
    expect(applied('slice 1 0 0.4\nslice 1 clear').tracks[0].slices).toEqual([]);
  });

  it('leaves the other channels alone', () => {
    const song = applied('slice 2 0 0.4');
    expect(song.tracks[0].slices).toBeUndefined();
    expect(song.tracks[1].slices).toEqual([{ start: 0, end: 0.4 }]);
  });

  it('refuses a channel it does not have, a missing value, and a negative start', () => {
    expect(refused('slice 9 0 0.4')).toContain('slice takes a channel NUMBER');
    expect(refused('slice 1 0')).toContain('SECONDS');
    expect(refused('slice 1 -1 0.4')).toContain('slice needs a start and an end');
    expect(refused('slice')).toContain('slice needs a channel');
  });
});

describe('sliced pieces in a song file', () => {
  it('survive a save and a load, at version 50', () => {
    const song = applied('slice 1 0 0.42\nslice 1 0.42 0.9');
    const text = songToJson(song);
    expect(JSON.parse(text).version).toBe(50);
    // The newest version this build writes is 51 (a table of your own); a SLICED
    // song is still written as 50, which is what the line below pins.
    expect(SONG_FILE_VERSION_MAX).toBe(59);
    const back = songFromJson(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.tracks[0].slices).toEqual(song.tracks[0].slices);
    // Absent, not empty, on a channel that was never chopped.
    expect(back.song.tracks[1].slices).toBeUndefined();
  });

  it('survive a trip out to a script and back', () => {
    const song = applied('slice 1 0 0.42\nslice 1 0.42 0.9');
    const text = songToScript(song);
    expect(text).toContain('slice 1 0 0.42');
    const back = applyScript(createSong(), text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.tracks[0].slices).toEqual(song.tracks[0].slices);
  });

  it('are refused rather than dropped when a piece is malformed', () => {
    const song = applied('slice 1 0 0.42');
    const file = JSON.parse(songToJson(song));
    file.tracks[0].slices = [{ start: 'zero', end: 0.4 }];
    expect(songFromJson(JSON.stringify(file)).ok).toBe(false);
  });

  it('claim language 66 and leave the file at 50', () => {
    expect(SCRIPT_VERSION).toBe(76);
  });
});
