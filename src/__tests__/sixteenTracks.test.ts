import { describe, expect, it } from 'vitest';

import { applyScript } from '../model/script';
import { createSong, MAX_TRACKS, TRACKS_PER_BANK } from '../model/song';
import {
  SIXTEEN_TRACKS_SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  songFromJson,
  songToJson,
  songToScript,
} from '../model/songfile';

function play(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`${source} should parse: ${JSON.stringify(result.errors)}`);
  return result.song;
}

describe('sixteen channels: two banks of eight', () => {
  it('is the ceiling the language and the model agree on', () => {
    expect(MAX_TRACKS).toBe(16);
    expect(TRACKS_PER_BANK).toBe(8);
    expect(MAX_TRACKS).toBe(TRACKS_PER_BANK * 2);
  });

  it('accepts `tracks 12` and writes a note on the twelfth channel', () => {
    const song = play('tracks 12\nnote 0 12 C-4');
    expect(song.tracks).toHaveLength(12);
    expect(song.patterns[0]?.steps[0]?.[11]?.note).toBe(60);
  });

  it('refuses `tracks 17`, naming the ceiling', () => {
    const result = applyScript(createSong(), 'tracks 17');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.stringify(result.errors)).toContain('1..16');
  });

  it('saves a sixteen-channel song at the newest version and reads it back whole', () => {
    const song = play('tracks 16\nnote 0 16 C-4');
    const json = songToJson(song);
    // Sixteen channels is its OWN rung (57); 58 is newer and about pattern
    // lengths, so a song only claims it when it needs it.
    expect(JSON.parse(json).version).toBe(SIXTEEN_TRACKS_SONG_FILE_VERSION);
    expect(SIXTEEN_TRACKS_SONG_FILE_VERSION).toBeLessThan(SONG_FILE_VERSION_MAX);
    const read = songFromJson(json);
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(read.song.tracks).toHaveLength(16);
    // The point of the version rung: the ninth channel's notes come back, rather
    // than the song coming back eight wide and silent about the four it lost.
    expect(read.song.patterns[0]?.steps[0]?.[15]?.note).toBe(60);
  });

  it('leaves an eight-channel song at the version it had', () => {
    const eight = play('tracks 8\nnote 0 8 C-4');
    expect(JSON.parse(songToJson(eight)).version).toBeLessThan(SONG_FILE_VERSION_MAX);
  });

  it('survives the script round trip at sixteen channels', () => {
    const song = play('tracks 16\nnote 0 9 C-4\nnote 1 16 E-4');
    const back = play(songToScript(song));
    expect(back.tracks).toHaveLength(16);
    expect(back.patterns[0]?.steps[0]?.[8]?.note).toBe(60);
    expect(back.patterns[0]?.steps[1]?.[15]?.note).toBe(64);
  });
});
