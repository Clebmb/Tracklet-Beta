import { describe, expect, it } from 'vitest';

import { applyScript } from '../model/script';
import { createSong, patternLength } from '../model/song';
import { songFromJson, songToJson, songToScript } from '../model/songfile';
import { shareLink, shareSongFromUrl } from '../model/shareLink';
import { buildSongBundle, parseSongBundle } from '../plugins/bundle';

/**
 * The whole roadmap in one song, then through every road out and back.
 *
 * Each feature has its own test; this one exists because features break each
 * other. A cell clause survives `cellText` but not the pack, a pattern length
 * survives the file but not the script writer, a credit survives the script but
 * not the link — every one of those is invisible to a test that only walks one
 * path. Here a single deliberately awkward song walks all of them, and what comes
 * back has to BE what went in.
 */
const SCRIPT = [
  'song "PARITY"',
  'credits "MADE BY ME — break from a 1972 record"',
  'tracks 16',
  'steps 16',
  // The clauses are a CELL spelling — `note ROW TRACK` does not take them — so the
  // fixture writes them the one way the language accepts: a grid row.
  'grid 16',
  'C-4:late2:pan-30 E-4:seek25:fade40 kick . cut . . . . . . . . . G-3 .',
  'push 1 1 1 1',
  'pattern 2 "B"',
  'steps 32 pattern 2',
  'note 28 16 G-3',
].join('\n');

function play(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`should parse: ${JSON.stringify(result.errors)}\n${source}`);
  return result.song;
}

/** What every road is compared on: the things a person would notice were lost. */
function shapeOf(song: ReturnType<typeof play>) {
  return {
    title: song.title,
    credits: song.credits ?? null,
    tracks: song.tracks.length,
    patternLengths: song.patterns.map((_, index) => patternLength(song, index)),
    // Written as the script spells a cell, so a lost clause shows up here as the
    // plainer cell it became rather than as a number nobody reads.
    cells: songToScript(song)
      .split('\n')
      .filter((line) => /C-4|E-4|kick|cut|G-3/.test(line))
      .map((line) => line.trim()),
  };
}

describe('a clause written where a pitch belongs', () => {
  it('is explained as a cell spelling, not called a bad note', () => {
    // Found by writing this file's fixture wrong: the first version put the
    // suffix on a `note` line and the parser answered "is not a note", which
    // sends a person to look at their pitch instead of their placement.
    const result = applyScript(createSong(), 'note 0 1 C-4:late2');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.stringify(result.errors)).toContain('cell spelling');
  });
});

describe('the whole roadmap, out and back', () => {
  const song = play(SCRIPT);
  const shape = shapeOf(song);

  it('is the song the script says it is', () => {
    expect(shape.tracks).toBe(16);
    expect(shape.patternLengths).toEqual([16, 32]);
    expect(shape.credits).toBe('MADE BY ME — break from a 1972 record');
  });

  it('survives the FILE unchanged, clauses and all', () => {
    const read = songFromJson(songToJson(song));
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(shapeOf(read.song)).toEqual(shape);
  });

  it('survives the SCRIPT unchanged', () => {
    expect(shapeOf(play(songToScript(song)))).toEqual(shape);
  });

  it('survives a PACK, with the kit and the instrument arriving beside it', () => {
    const kit = { name: 'MYHOUSE', voices: {} };
    const font = { name: 'FIRE BED', kind: 'soundfont' as const, bytes: Uint8Array.from([1, 2, 3]) };
    const bytes = buildSongBundle({
      songJson: songToJson(song),
      plugins: [],
      samples: [],
      kits: [{ name: 'MYHOUSE', json: kit }],
      fonts: [font],
    });
    const parsed = parseSongBundle(bytes);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.bundle.kits).toEqual([{ name: 'MYHOUSE', json: kit }]);
    expect(parsed.bundle.fonts[0]?.name).toBe('FIRE BED');
    const read = songFromJson(parsed.bundle.songJson);
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(shapeOf(read.song)).toEqual(shape);
  });

  it('survives a LINK unchanged', () => {
    const made = shareLink(song, 'https://example.com/tracklet/');
    if (!made.ok) throw new Error(made.reason);
    const shared = shareSongFromUrl(made.url);
    if (!shared.ok) throw new Error(shared.reason);
    expect(shapeOf(play(shared.script))).toEqual(shape);
  });
});
