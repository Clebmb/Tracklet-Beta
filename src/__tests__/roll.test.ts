import { describe, expect, it } from 'vitest';

import {
  articulationHits,
  createSong,
  DEFAULT_ROLL_HITS,
  DEFAULT_STUTTER,
  MAX_ROLL_HITS,
  MIN_ROLL_HITS,
  ROLL_WORD,
  ROW_TRANSFORM_WORDS,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  songFromJson,
  songToJson,
  songToScript,
  type Song,
} from '../model';
import { scriptCapabilities, SCRIPT_VERSION } from '../model/capabilities';
import { applyScript } from '../model/script';

/**
 * `rows A to B roll [N]` — the fourth thing a range of steps can do.
 *
 * A roll is a stutter written across a run of steps instead of on one cell: every
 * hit in the range is retriggered `N` times inside its own step (2–8, four by
 * default), which is a drum roll, a snare fill or a trap hat — `repeat`'s loud
 * cousin, because `repeat` tiles the FIGURE and a roll retriggers each HIT. It
 * writes the same cell field the `*N` suffix writes, so it needs no audio
 * machinery and no file version: a rolled song is a song full of stuttered cells.
 */

/** The song a script made, insisting it parsed. */
function applied(source: string, song: Song = createSong()): Song {
  const result = applyScript(song, source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song;
}

/** What a script says, insisting it is refused. */
function refused(source: string): string {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map((error) => error.message).join(' ');
}

/** The cell a script left at `row`, channel `track` (1-based, as a person counts). */
function cell(song: Song, row: number, track = 1) {
  return song.patterns[0].steps[row][track - 1];
}

describe('rolling a range', () => {
  it('retriggers every hit in the range, four times by default', () => {
    const song = applied('tracks 1\nsteps 4\nC-4\nD-4\nE-4\nF-4\nrows 0 to 1 roll');
    expect(DEFAULT_ROLL_HITS).toBe(4);
    expect(cell(song, 0).stutter).toBe(4);
    expect(cell(song, 1).stutter).toBe(4);
    // Rows outside the range are untouched, which is what a range means.
    expect(cell(song, 2).stutter).toBe(DEFAULT_STUTTER);
    expect(cell(song, 3).stutter).toBe(DEFAULT_STUTTER);
  });

  it('says how many hits each step becomes, inside the stutter s own range', () => {
    const three = applied('tracks 1\nsteps 2\nC-4\nC-4\nrows 0 to 1 roll 3');
    expect(cell(three, 0).stutter).toBe(3);
    expect(cell(three, 1).stutter).toBe(3);
    const eight = applied('tracks 1\nsteps 2\nC-4\nC-4\nrows 0 to 1 roll 8');
    expect(cell(eight, 0).stutter).toBe(8);
    expect(MIN_ROLL_HITS).toBe(2);
    expect(MAX_ROLL_HITS).toBe(8);
  });

  it('leaves an empty step empty, because a roll ornaments a figure rather than invents one', () => {
    const song = applied('tracks 1\nsteps 4\nC-4\n.\nD-4\n.\nrows 0 to 3 roll');
    expect(cell(song, 0).stutter).toBe(4);
    expect(cell(song, 1).note).toBeNull();
    expect(cell(song, 1).stutter).toBe(DEFAULT_STUTTER);
    expect(cell(song, 3).note).toBeNull();
  });

  it('rolls a DRUM, which is what a roll is mostly for', () => {
    const song = applied('tracks 1\nsteps 4\nsnare\n.\nsnare\n.\nrows 0 to 3 roll 6');
    expect(cell(song, 0).drum).toBe('snare');
    expect(cell(song, 0).stutter).toBe(6);
    // The empty rows stay empty, so the fill does not smear across the bar.
    expect(cell(song, 1).drum).toBeNull();
    expect(cell(song, 2).stutter).toBe(6);
  });

  it('takes a flam OFF a cell it rolls, because the two fill the same instant differently', () => {
    const song = applied('tracks 1\nsteps 2\nsnare!\n.\nrows 0 to 1 roll');
    expect(cell(song, 0).grace).toBe(0);
    expect(cell(song, 0).stutter).toBe(4);
  });

  it('acts on the pattern `pattern` selected, like `note` and `erase` do', () => {
    const song = applied('tracks 1\nsteps 2\nC-4\n.\npattern 2\nC-4\n.\npattern 1\nrows 0 to 1 roll');
    expect(cell(song, 0).stutter).toBe(4);
    expect(song.patterns[1].steps[0][0].stutter).toBe(DEFAULT_STUTTER);
  });

  it('composes with the other transformations, in the order they are written', () => {
    const song = applied('tracks 1\nsteps 8\nC-4\n.\nC-4\n.\nrows 0 to 3 repeat 2\nrows 0 to 7 roll 2');
    for (let row = 0; row < 8; row += 1) {
      if (cell(song, row).note !== null) expect(cell(song, row).stutter).toBe(2);
    }
    expect(cell(song, 0).note).not.toBeNull();
    expect(cell(song, 4).note).not.toBeNull();
  });
});

describe('what a roll sounds like', () => {
  it('is the stutter the engine already plays — evenly spaced hits in one step', () => {
    const song = applied('tracks 1\nsteps 1\nC-4\nrows 0 to 0 roll 4');
    const rolled = cell(song, 0);
    const hits = articulationHits(
      { slide: rolled.slide, stutter: rolled.stutter, grace: rolled.grace, bend: rolled.bend },
      0,
    );
    expect(hits).toHaveLength(4);
    expect(hits.map((hit) => hit.at)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(hits.every((hit) => hit.length === 0.25)).toBe(true);
  });
});

describe('rolling badly', () => {
  it('refuses a count that means nothing or is too many, in words', () => {
    expect(refused(`tracks 1\nC-4\nrows 0 to 0 roll 1`)).toContain('on its own is 4');
    expect(refused(`tracks 1\nC-4\nrows 0 to 0 roll 9`)).toContain('2..8 times inside its own step');
    expect(refused(`tracks 1\nC-4\nrows 0 to 0 roll twice`)).toContain('2..8 times inside its own step');
  });

  it('refuses a count with something after it', () => {
    expect(refused(`tracks 1\nC-4\nrows 0 to 0 roll 4 4`)).toContain('and nothing else');
  });

  it('refuses a range that falls off the grid, like the rest of the statement', () => {
    expect(refused(`tracks 1\nsteps 4\nC-4\nrows 0 to 7 roll`)).toContain('inside the pattern');
  });
});

describe('the language and the manifest', () => {
  it('is a VALUE on `rows` rather than a new word of its own', () => {
    expect(ROW_TRANSFORM_WORDS).toContain(ROLL_WORD);
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(35);
    const caps = scriptCapabilities();
    expect(caps.versionNotes.find((entry) => entry.version === 35)?.note).toContain('ROLL');
    expect(caps.vocabulary.rowTransforms.map((one) => one.words)).toEqual([...ROW_TRANSFORM_WORDS]);
    expect(caps.limits.rows.roll).toEqual({ min: MIN_ROLL_HITS, max: MAX_ROLL_HITS });
  });

  it('applies every published transformation, the roll among them', () => {
    for (const one of scriptCapabilities().vocabulary.rowTransforms) {
      const count = one.id === 'repeat' ? ' 2' : '';
      expect(applied(`tracks 1\nC-4\nrows 0 to 0 ${one.words}${count}`)).toBeTruthy();
    }
  });
});

describe('the file does not move, which is the point', () => {
  it('writes no new version and no new key, because a roll is a stutter', () => {
    // The roll adds nothing a file did not already have to say: the same two
    // hits, at the same version, as the song it was written over.
    const plain = applied('tracks 1\nsteps 2\nsnare\n.\n');
    const rolled = applied('tracks 1\nsteps 2\nsnare\n.\nrows 0 to 1 roll');
    const plainRaw = JSON.parse(songToJson(plain)) as Record<string, unknown>;
    const rolledRaw = JSON.parse(songToJson(rolled)) as Record<string, unknown>;
    expect(rolledRaw.version).toBe(plainRaw.version);
    expect(SONG_FILE_VERSION).toBeLessThanOrEqual(SONG_FILE_VERSION_MAX);
    expect(JSON.stringify(rolledRaw)).not.toContain('roll');
  });

  it('round-trips through both formats, as the stuttered cells it became', () => {
    const song = applied('tracks 1\nsteps 4\nA-4~40\n.\nE-4\n.\nrows 0 to 3 roll 3');
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(songToJson(back.song)).toBe(songToJson(song));
    // The written script is the CELLS, not the statement: a writer writes the song.
    const text = songToScript(song);
    expect(text).toContain('*3');
    expect(applied(text).patterns[0].steps[0][0].stutter).toBe(3);
  });
});
