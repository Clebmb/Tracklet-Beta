import { describe, expect, it } from 'vitest';

import { applyScript } from '../model/script';
import { createSong, patternLength, patternRows } from '../model/song';
import { PATTERN_LENGTH_SONG_FILE_VERSION, songFromJson, songToJson, songToScript } from '../model/songfile';

function play(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`${source} should parse: ${JSON.stringify(result.errors)}`);
  return result.song;
}

describe('per-pattern length: a verse and a chorus can be different sizes', () => {
  it('gives one pattern its own grid with `steps N pattern P`', () => {
    const song = play('steps 16\npattern 2 "B"\nsteps 32 pattern 2');
    expect(patternLength(song, 0)).toBe(16);
    expect(patternLength(song, 1)).toBe(32);
    // The song's own length is untouched: pattern 1 still decides it.
    expect(patternRows(song)).toBe(16);
  });

  it('lets a note be written past the song length, in the longer pattern', () => {
    // The parser has to follow the scope too, or row 20 in a 32-step pattern is
    // refused by a parser that still believes every grid is 16 tall.
    const song = play('steps 16\npattern 2 "B"\nsteps 32 pattern 2\nnote 19 1 C-4');
    expect(song.patterns[1]?.steps).toHaveLength(32);
    expect(song.patterns[1]?.steps[19]?.[0]?.note).toBe(60);
  });

  it('keeps `steps N` alone meaning every pattern', () => {
    const song = play('steps 16\npattern 2 "B"\nsteps 8');
    expect(patternLength(song, 0)).toBe(8);
    expect(patternLength(song, 1)).toBe(8);
  });

  it('trims the tail when a pattern is shortened, like the song-wide statement', () => {
    const song = play('steps 32\nnote 28 1 C-4\nsteps 8 pattern 1');
    expect(patternLength(song, 0)).toBe(8);
  });

  it('survives the file at version 58, with both lengths intact', () => {
    const song = play('steps 16\npattern 2 "B"\nsteps 32 pattern 2\nnote 20 1 C-4');
    const json = songToJson(song);
    expect(JSON.parse(json).version).toBe(PATTERN_LENGTH_SONG_FILE_VERSION);
    const read = songFromJson(json);
    if (!read.ok) throw new Error(read.errors.join('\n'));
    // The loss this rung exists to prevent: the reader used to resize every
    // pattern to the song's `steps`, quietly cutting the chorus in half.
    expect(patternLength(read.song, 0)).toBe(16);
    expect(patternLength(read.song, 1)).toBe(32);
    expect(read.song.patterns[1]?.steps[20]?.[0]?.note).toBe(60);
  });

  it('survives the script round trip, spelling the clause back out', () => {
    const song = play('steps 16\npattern 2 "B"\nsteps 32 pattern 2');
    const script = songToScript(song);
    expect(script).toContain('steps 32 pattern 2');
    const back = play(script);
    expect(patternLength(back, 0)).toBe(16);
    expect(patternLength(back, 1)).toBe(32);
  });

  it('stays at the older version when every pattern matches the song', () => {
    const even = play('steps 16\npattern 2 "B"');
    expect(JSON.parse(songToJson(even)).version).toBeLessThan(PATTERN_LENGTH_SONG_FILE_VERSION);
  });

  it('refuses a pattern number this build does not have', () => {
    const result = applyScript(createSong(), 'steps 16 pattern 999');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.stringify(result.errors)).toContain('pattern number');
  });
});
