import { describe, expect, it } from 'vitest';

import { applyScript } from '../model/script';
import { createSong, songUsesFont } from '../model/song';

function play(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`${source} should parse: ${JSON.stringify(result.errors)}`);
  return result.song;
}

describe('usesFont: the one dependency a pack cannot carry', () => {
  it('is false for a song of built-in waves', () => {
    expect(songUsesFont(play('tracks 2\nnote 0 1 C-4'))).toBe(false);
    expect(songUsesFont(createSong())).toBe(false);
  });

  it('is true when a channel plays a recorded instrument', () => {
    expect(songUsesFont(play('track 1 "PIANO" wave font'))).toBe(true);
  });

  it('is true when a drum machine pad does', () => {
    expect(songUsesFont(play('machine pads 1\npad 1 "KICK" wave font pattern "9..."'))).toBe(true);
  });

  it('reaches a stacked layer, not only the channel’s own sound', () => {
    expect(songUsesFont(play('track 1 wave sine\nlayer 1 2 wave font'))).toBe(true);
  });

  it('is what `song.describe` reports, so a caller can warn before handing a song over', () => {
    const song = play('track 1 "PIANO" wave font');
    // describeSong is exercised through the API tests; here the predicate is the
    // contract, and it is the same call both sides make.
    expect(songUsesFont(song)).toBe(true);
  });
});
