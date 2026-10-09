import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  MAX_OCTAVE_SHIFT,
  MAX_ROWS,
  MIDI_MAX,
  MIN_OCTAVE_SHIFT,
  MIN_ROW_REPEAT,
  repeatEnd,
  repeatProblem,
  repeatRange,
  ROW_RANGE_WORD,
  ROW_TRANSFORMS,
  ROW_TRANSFORM_WORDS,
  rowRangeLabel,
  rowRangeLength,
  rowRangeProblem,
  SCRIPT_KEYWORDS,
  shiftRangeOctaves,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  type Pattern,
  type RowRange,
  type Song,
} from '../model';
import { SCRIPT_COMMANDS, SCRIPT_VERSION, scriptCapabilities } from '../model/capabilities';

/**
 * A range of steps, and the things a range can be told to do.
 *
 * The roadmap called this "the one grammar the language is missing": every other
 * statement names ONE place, and five separate ideas (`fill`, a row-range
 * `repeat`, `octave`, `harmonize`, `variation`) were all waiting on a way to say
 * "these rows". This file holds the grammar, three of the four transformations
 * (`roll` has its own suite, `roll.test.ts`, because it is the one that rewrites
 * how a hit is PLAYED rather than where it sits), and the strongest inertness
 * claim the project has — that `rows` changes the CELLS a song holds and nothing
 * else, so no file version moves and no existing song's bytes change.
 */

/** The song a script made, insisting it parsed. */
function applied(source: string, song: Song = createSong()): Song {
  const result = applyScript(song, source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song;
}

/** What a script says, insisting it is refused. */
function refused(source: string, song: Song = createSong()): string {
  const result = applyScript(song, source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map((error) => error.message).join(' ');
}

/** One channel's notes, in row order. */
function column(song: Song, track = 0, rows = 16): (number | null)[] {
  return song.patterns[0].steps.slice(0, rows).map((row) => row[track]?.note ?? null);
}

/** A pattern with `n` rows, for the arithmetic tests below. */
function patternOf(n: number): Pattern {
  const song = applied(`tracks 1\nsteps ${n}`);
  return song.patterns[0];
}

describe('the range, as arithmetic', () => {
  it('labels itself and counts both ends, the way a person reads it', () => {
    expect(rowRangeLabel({ from: 0, to: 3 })).toBe(`0 ${ROW_RANGE_WORD} 3`);
    expect(rowRangeLength({ from: 0, to: 3 })).toBe(4);
    expect(rowRangeLength({ from: 7, to: 7 })).toBe(1);
  });

  it('accepts any run inside the grid, and refuses what falls off either end', () => {
    expect(rowRangeProblem({ from: 0, to: 15 }, 16)).toBeNull();
    expect(rowRangeProblem({ from: 15, to: 15 }, 16)).toBeNull();
    // A range that runs backwards names no run at all.
    expect(rowRangeProblem({ from: 4, to: 1 }, 16)).toContain('earlier row to a later one');
    expect(rowRangeProblem({ from: 4, to: 1 }, 16)).toContain('Swap the two ends');
    // ...and one that runs off the end names rows the pattern does not have.
    expect(rowRangeProblem({ from: 12, to: 19 }, 16)).toContain('rows 0..15');
    expect(rowRangeProblem({ from: -1, to: 3 }, 16)).toContain('rows 0..15');
    expect(rowRangeProblem({ from: 0, to: 3 }, 16)).toBeNull();
  });

  it('works out where a repeat ends, and whether that fits', () => {
    expect(repeatEnd({ from: 0, to: 3 }, 4)).toBe(16);
    expect(repeatEnd({ from: 4, to: 5 }, 2)).toBe(8);
    expect(repeatProblem({ from: 0, to: 3 }, 4, 16)).toBeNull();
    const message = repeatProblem({ from: 0, to: 3 }, 8, 16);
    expect(message).toContain('4 rows played 8 times in all');
    expect(message).toContain('needs 32 rows');
    expect(message).toContain('the pattern holds 16');
    expect(message).toContain('steps N');
  });

  it('moves only the notes in the range, by whole octaves', () => {
    const pattern = patternOf(16);
    pattern.steps[0][0].note = 60; // C-4
    pattern.steps[8][0].note = 60; // outside the range
    expect(shiftRangeOctaves(pattern, { from: 0, to: 3 }, 1)).toBe(1);
    expect(pattern.steps[0][0].note).toBe(72);
    expect(pattern.steps[8][0].note).toBe(60);
    // Down is the same arithmetic the other way, and an empty cell is left alone.
    expect(shiftRangeOctaves(pattern, { from: 0, to: 3 }, -1)).toBe(1);
    expect(pattern.steps[0][0].note).toBe(60);
    expect(shiftRangeOctaves(pattern, { from: 4, to: 7 }, 1)).toBe(0);
  });

  it('clamps at the top and the bottom rather than refusing a whole range', () => {
    // The rule every pitch this model COMPUTES already follows (`clampMidi`, and
    // the chord tool with it): the range is the guarantee, and an octave too many
    // is a run that has arrived at the edge.
    const pattern = patternOf(16);
    pattern.steps[0][0].note = MIDI_MAX; // B-8
    pattern.steps[1][0].note = 12; // C-0
    expect(shiftRangeOctaves(pattern, { from: 0, to: 1 }, 1)).toBe(2);
    expect(pattern.steps[0][0].note).toBe(MIDI_MAX);
    expect(pattern.steps[1][0].note).toBe(24);
    expect(shiftRangeOctaves(pattern, { from: 0, to: 1 }, -9)).toBe(2);
    expect(pattern.steps[1][0].note).toBe(12);
  });

  it('copies the SOURCE out before it writes, so a repeat of a range that overlaps its output works', () => {
    // `rows 0 to 7 repeat 2` writes rows 8..15 from rows 0..7 — no overlap. But
    // `rows 0 to 7 repeat 3` on a 24-row grid writes 8..15 and 16..23 from the
    // ORIGINAL eight rows, and the test that matters is the second copy: it must
    // be the figure the author wrote, not the figure the first copy left behind.
    const pattern = patternOf(24);
    pattern.steps[0][0].note = 60;
    pattern.steps[1][0].note = 62;
    expect(repeatRange(pattern, { from: 0, to: 7 }, 3)).toBe(4);
    for (const row of [0, 8, 16]) expect(pattern.steps[row][0].note).toBe(60);
    for (const row of [1, 9, 17]) expect(pattern.steps[row][0].note).toBe(62);
  });

  it('carries everything a cell holds into every copy', () => {
    const pattern = patternOf(16);
    pattern.steps[0][0] = { note: 60, extra: [], drum: null, velocity: 40, slide: true, stutter: 3, grace: 0, bend: 0 };
    repeatRange(pattern, { from: 0, to: 3 }, 2);
    expect(pattern.steps[4][0]).toEqual({ note: 60, extra: [], drum: null, velocity: 40, slide: true, stutter: 3, grace: 0, bend: 0 });
    // A copy is a copy, not a second reference to the same cell.
    pattern.steps[4][0].velocity = 90;
    expect(pattern.steps[0][0].velocity).toBe(40);
  });
});

describe('the word in a script', () => {
  const ROWS = (rows: string) => `tracks 2\n${rows}`;

  it('moves the pitches in the range, and leaves the rest of the pattern alone', () => {
    const song = applied(`${ROWS('A-4 .\nC-5 .\nE-5 .\nA-5 .\nC-5 .\nrows 0 to 3 octave up')}`);
    expect(column(song)).toEqual([81, 84, 88, 93, 72, null, null, null, null, null, null, null, null, null, null, null]);
    // The word on its own is one octave, and the count is optional.
    const down = applied(`${ROWS('A-5 .\nrows 0 to 0 octave down')}`);
    expect(column(down)[0]).toBe(69);
  });

  it('takes how many octaves after the direction, and in no other order', () => {
    const times2 = applied(`${ROWS('C-4 .\nrows 0 to 0 octave up 2')}`);
    expect(column(times2)[0]).toBe(84); // C-4 -> C-6
    const times3 = applied(`${ROWS('C-4 .\nrows 0 to 0 octave down 3')}`);
    expect(column(times3)[0]).toBe(24); // C-4 -> C-1
    expect(MIN_OCTAVE_SHIFT).toBe(1);
    expect(MAX_OCTAVE_SHIFT).toBe(8);
  });

  it('keeps the force and the articulation of a note it moves, because it changes the PITCH', () => {
    const song = applied(`${ROWS('A-4~40>*2 .\nrows 0 to 0 octave up')}`);
    const cell = song.patterns[0].steps[0][0];
    expect(cell.note).toBe(81);
    expect(cell.velocity).toBe(40);
    expect(cell.slide).toBe(true);
    expect(cell.stutter).toBe(2);
  });

  it('plays a range as many times as it says, from where it starts', () => {
    const song = applied(`${ROWS('A-4 .\n.   C-4\nrows 0 to 1 repeat 4')}`);
    expect(column(song)).toEqual([69, null, 69, null, 69, null, 69, null, null, null, null, null, null, null, null, null]);
    expect(column(song, 1)).toEqual([null, 60, null, 60, null, 60, null, 60, null, null, null, null, null, null, null, null]);
  });

  it('is sugar over typing the figure out, and writes exactly that', () => {
    // The strongest claim the feature can make: an expanded repeat IS the script a
    // hand would have written, byte for byte in both formats — which is why no
    // file format had to learn the word.
    const figure = 'A-4~40 D-4\n.   .\nE-4*3 .\n.   .\n';
    const repeated = applied(`${ROWS(figure + 'rows 0 to 3 repeat 4')}`);
    const typed = applied(`${ROWS(figure.repeat(4))}`);
    expect(songToJson(repeated)).toBe(songToJson(typed));
    expect(songToScript(repeated)).toBe(songToScript(typed));
  });

  it('acts on the pattern `pattern` selected, the way `note` and `erase` do', () => {
    const song = applied(`tracks 1\npattern 1\nC-4\npattern 2\nC-4\nrows 0 to 0 octave up`);
    // The statement lands on the pattern selected at that point in the script,
    // which is the second one — and the first keeps the note it was given.
    expect(song.patterns[0].steps[0][0].note).toBe(60);
    expect(song.patterns[1].steps[0][0].note).toBe(72);
  });

  it('combines with the grid, which is the `fill` a drum part has always wanted', () => {
    // A four-row figure, tiled four times: the idiom this clause was built for,
    // and the reason the roadmap lists `fill` and a row-range `repeat` together.
    const song = applied('tracks 1\nsteps 16\nC-1\n. \nC-1\n. \nrows 0 to 3 repeat 4');
    const kick = 24; // C-1, the note a kick drum sits on
    expect(column(song)).toEqual([kick, null, kick, null, kick, null, kick, null, kick, null, kick, null, kick, null, kick, null]);
  });

  it('transposes a run and then repeats it, which is one line each', () => {
    // Two statements rather than two words, because they are two decisions — and
    // the language composes them for free by acting on the song in order.
    const song = applied('tracks 1\nC-4\nD-4\nE-4\nF-4\nrows 0 to 3 octave up\nrows 0 to 3 repeat 4');
    expect(column(song)).toEqual([72, 74, 76, 77, 72, 74, 76, 77, 72, 74, 76, 77, 72, 74, 76, 77]);
  });
});

describe('what it refuses', () => {
  const SONG = 'tracks 2\n';

  it('refuses a range that names no run, or one the pattern does not hold', () => {
    expect(refused(`${SONG}rows 4 to 1 octave up`)).toContain('earlier row to a later one');
    expect(refused(`${SONG}rows 0 to 16 octave up`)).toContain('rows 0..15');
    expect(refused(`${SONG}steps 8\nrows 0 to 8 octave up`)).toContain('rows 0..7');
    // ...and the last row of the grid is INSIDE it, which is the boundary the
    // message prints.
    expect(applied(`${SONG}rows 15 to 15 octave up`)).toBeTruthy();
  });

  it('refuses a range that is not written "A to B"', () => {
    expect(refused(`${SONG}rows 0 3 octave up`)).toContain('written "A to B"');
    expect(refused(`${SONG}rows 0 til 3 octave up`)).toContain('written "A to B"');
  });

  it('refuses a statement that says what to do with nothing', () => {
    const message = refused(`${SONG}rows 0 to 3`);
    expect(message).toContain('a range of steps and what to do with them');
    expect(message).toContain('octave up');
    expect(message).toContain('repeat');
  });

  it('refuses a transformation it does not have, and lists the ones it does', () => {
    const message = refused(`${SONG}rows 0 to 3 sideways`);
    expect(message).toContain('"sideways" is not something a range of steps can do');
    for (const words of ROW_TRANSFORM_WORDS) expect(message).toContain(words);
  });

  it('refuses a direction it cannot move in, and a count of octaves out of range', () => {
    expect(refused(`${SONG}rows 0 to 3 octave`)).toContain('UP or DOWN');
    expect(refused(`${SONG}rows 0 to 3 octave sideways`)).toContain('UP or DOWN');
    expect(refused(`${SONG}rows 0 to 3 octave up 0`)).toContain('whole number 1..8');
    expect(refused(`${SONG}rows 0 to 3 octave up 9`)).toContain('whole number 1..8');
    expect(refused(`${SONG}rows 0 to 3 octave up 1 1`)).toContain('UP or DOWN');
  });

  it('refuses a repeat that means nothing, and one that does not fit', () => {
    // `repeat 1` is refused for the reason `arrange` refuses it and a cell refuses
    // `*1`: a count that means nothing should not look like a count that did.
    expect(refused(`${SONG}rows 0 to 3 repeat 1`)).toContain('just the range on its own');
    expect(refused(`${SONG}rows 0 to 3 repeat 0`)).toContain('2 or more');
    expect(refused(`${SONG}rows 0 to 3 repeat twice`)).toContain('2 or more');
    expect(refused(`${SONG}rows 0 to 3 repeat`)).toContain('IN ALL');
    expect(refused(`${SONG}rows 0 to 3 repeat 2 2`)).toContain('IN ALL');
    const fit = refused(`${SONG}rows 0 to 3 repeat 8`);
    expect(fit).toContain('needs 32 rows');
    expect(MIN_ROW_REPEAT).toBe(2);
  });

  it('leaves the song it was applied to untouched, because a script works on a copy', () => {
    const song = applied(`${SONG}C-4\nrows 0 to 0 octave up`);
    refused(`${SONG}C-4\nrows 0 to 0 sideways`, song);
    refused(`${SONG}C-4\nrows 0 to 0 repeat 99`, song);
    expect(song.patterns[0].steps[0][0].note).toBe(72);
  });
});

describe('the file does not move, which is the point', () => {
  it('writes version 12 for a song whose only new thing is a range of steps', () => {
    // A transposed run and a repeated one are CELLS, which a song already stores:
    // no version is declared, no key appears, and `SONG_FILE_VERSION_MAX` stands.
    const song = applied('tracks 2\nC-4 .\nD-4 .\nrows 0 to 1 octave up\nrows 0 to 1 repeat 4');
    const raw = JSON.parse(songToJson(song)) as Record<string, unknown>;
    expect(SONG_FILE_VERSION).toBe(12);
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(SONG_FILE_VERSION).toBeLessThanOrEqual(SONG_FILE_VERSION_MAX);
    expect(JSON.stringify(raw)).not.toContain('rows');
    expect(JSON.stringify(raw)).not.toContain('octave up');
    expect(JSON.stringify(raw)).not.toContain('repeat');
  });

  it('writes the notes out rather than spelling the statement, because a writer writes the song', () => {
    const song = applied('tracks 1\nC-4\nD-4\nrows 0 to 1 octave up\nrows 0 to 1 repeat 4');
    const text = songToScript(song);
    expect(text).toContain('C-5');
    expect(text).toContain('D-5');
    const back = applied(text, createSong());
    expect(songToJson(back)).toBe(songToJson(song));
  });

  it('round-trips through both formats', () => {
    const song = applied('tracks 2\nA-4~40 D-4\n.   .\nE-4*3 .\nrows 0 to 2 repeat 3');
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(songToJson(back.song)).toBe(songToJson(song));
    expect(applied(songToScript(song), createSong())).toBeTruthy();
  });

  it('goes back to nothing when a script starts a new song', () => {
    // `new` resets every cell, so the transposed notes go with them — the same
    // promise every other cell-writing statement keeps.
    const song = applied('tracks 1\nC-4\nrows 0 to 0 octave up');
    expect(applied('new', song).patterns[0].steps[0][0].note).toBeNull();
  });
});

describe('the language and the manifest', () => {
  it('is the one word this feature adds, and the language is otherwise where it was', () => {
    expect(SCRIPT_KEYWORDS).toContain('rows');
    // Not a verb for the transformations themselves: they are VALUES on the
    // statement, which is §5's own order of preference. `repeat` is the word
    // `arrange` already uses, and `octave` is the word the language already had
    // for octaves — neither is a new keyword, and neither is a second meaning:
    // both are about the thing they were always about.
    expect(SCRIPT_KEYWORDS).not.toContain('repeat');
    expect(SCRIPT_KEYWORDS).toContain('octave');
    expect(ROW_TRANSFORMS.map((one) => one.words)).toContain('repeat');
    for (const word of ['fill', 'harmonize', 'variation', 'transpose']) {
      expect(SCRIPT_KEYWORDS).not.toContain(word);
    }
  });

  it('publishes the statement, its transformations and its ranges', () => {
    const caps = scriptCapabilities();
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(12);
    expect(caps.versionNotes.find((entry) => entry.version === 12)?.note).toContain('rows');
    expect(SCRIPT_COMMANDS.map((command) => command.word)).toEqual([...SCRIPT_KEYWORDS]);
    expect(SCRIPT_COMMANDS.find((command) => command.word === 'rows')?.example).toBe('rows 0 to 3 octave up');
    expect(caps.vocabulary.rowTransforms.map((one) => one.words)).toEqual([...ROW_TRANSFORM_WORDS]);
    expect(caps.limits.rows.octaves).toEqual({ min: MIN_OCTAVE_SHIFT, max: MAX_OCTAVE_SHIFT });
    expect(caps.limits.rows.repeat).toEqual({ min: MIN_ROW_REPEAT });
    // Every published transformation, applied — the manifest cannot describe a
    // word the parser does not take.
    for (const one of caps.vocabulary.rowTransforms) {
      const count = one.id === 'repeat' ? ' 2' : '';
      expect(applied(`tracks 1\nC-4\nrows 0 to 0 ${one.words}${count}`)).toBeTruthy();
    }
  });

  it('is a run of steps rather than a limit on how long one may be', () => {
    // `steps N` sets the grid; a range only ever names part of it, so the two
    // ceilings are different numbers and the range's is the pattern's.
    expect(MAX_ROWS).toBeGreaterThan(16);
    expect(applied(`tracks 1\nsteps ${MAX_ROWS}\nrows 0 to ${MAX_ROWS - 1} octave up`)).toBeTruthy();
    const range: RowRange = { from: MAX_ROWS - 4, to: MAX_ROWS - 1 };
    expect(rowRangeProblem(range, MAX_ROWS)).toBeNull();
    expect(rowRangeProblem(range, MAX_ROWS - 1)).not.toBeNull();
  });
});
