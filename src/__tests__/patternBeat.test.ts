import { describe, expect, it } from 'vitest';

import { applyScript } from '../model/script';
import { createSong, patternBeat } from '../model/song';
import { PATTERN_BEAT_SONG_FILE_VERSION, songFromJson, songToJson, songToScript } from '../model/songfile';

function play(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`${source} should parse: ${JSON.stringify(result.errors)}`);
  return result.song;
}

describe('per-pattern beat: a pattern in three beside a song in four', () => {
  it('gives one pattern its own count with `beat N pattern P`', () => {
    const song = play('beat 4\npattern 2 "B"\nbeat 3 pattern 2');
    expect(patternBeat(song, 0)).toBe(4);
    expect(patternBeat(song, 1)).toBe(3);
    // The song's own count is untouched.
    expect(song.rowsPerBeat).toBe(4);
  });

  it('leaves `beat N` alone meaning every pattern', () => {
    const song = play('pattern 2 "B"\nbeat 3 pattern 2\nbeat 6');
    expect(song.patterns[0]?.beat).toBeUndefined();
    expect(song.patterns[1]?.beat).toBe(3);
    expect(song.rowsPerBeat).toBe(6);
  });

  it('stores NOTHING when a pattern agrees with the song', () => {
    // A song that never disagrees must save byte-identically to what it always
    // wrote, which means the key is deleted rather than set to the song's value.
    const song = play('beat 4\npattern 2 "B"\nbeat 4 pattern 2');
    expect(song.patterns[1]?.beat).toBeUndefined();
    expect(JSON.parse(songToJson(song)).version).toBeLessThan(PATTERN_BEAT_SONG_FILE_VERSION);
  });

  it('survives the file at version 59, with both counts intact', () => {
    const song = play('beat 4\npattern 2 "B"\nbeat 3 pattern 2');
    const json = songToJson(song);
    expect(JSON.parse(json).version).toBe(PATTERN_BEAT_SONG_FILE_VERSION);
    const read = songFromJson(json);
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(patternBeat(read.song, 0)).toBe(4);
    expect(patternBeat(read.song, 1)).toBe(3);
  });

  it('survives the script round trip, spelling the clause back out', () => {
    const song = play('pattern 2 "B"\nbeat 3 pattern 2');
    const script = songToScript(song);
    expect(script).toContain('beat 3 pattern 2');
    const back = play(script);
    expect(patternBeat(back, 1)).toBe(3);
  });

  it('refuses a pattern number this build does not have, and a count out of range', () => {
    const missing = applyScript(createSong(), 'beat 3 pattern 999');
    expect(missing.ok).toBe(false);
    const wild = applyScript(createSong(), 'beat 0');
    expect(wild.ok).toBe(false);
  });

  it('does nothing for a pattern number the build allows but the song lacks', () => {
    // The parser cannot know how many patterns a song has — `pattern 4` may be
    // written a few lines later — so this is a no-op rather than a refusal, which
    // is exactly what `steps 32 pattern 3` does on a one-pattern song. Recorded
    // here so the behaviour is a decision rather than a surprise.
    const song = play('pattern 2 "B"\nbeat 3 pattern 99');
    expect(song.patterns.map((_, index) => patternBeat(song, index))).toEqual([4, 4]);
    expect(song.rowsPerBeat).toBe(4);
  });

  it('refuses a file whose pattern beat is not a whole count', () => {
    const json = JSON.parse(songToJson(play('pattern 2 "B"')));
    json.patterns[1].beat = 2.5;
    const read = songFromJson(JSON.stringify(json));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.errors.join(' ')).toContain('beat');
  });
});
