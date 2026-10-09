import { describe, expect, it } from 'vitest';

import {
  createSong,
  REVERSE_WORD,
  reverseRange,
  ROW_TRANSFORM_WORDS,
  songFromJson,
  songToJson,
  songToScript,
  type Song,
} from '../model';
import { SCRIPT_VERSION, scriptCapabilities } from '../model/capabilities';
import { applyScript } from '../model/script';

/**
 * `rows A to B reverse` — the fifth thing a range of steps can do.
 *
 * Reading a run BACKWARDS: the last step first, with every note, force and gesture
 * kept and only the ORDER changed. It takes no number, because there is exactly one
 * way to read a run the other way, and it needs no audio machinery and no file
 * version: a reversed song is a song whose cells were rearranged.
 */

function applied(source: string, song: Song = createSong()): Song {
  const result = applyScript(song, source);
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

/** The cell a script left at `row`, channel `track` (1-based, as a person counts). */
function cell(song: Song, row: number, track = 1) {
  return song.patterns[0].steps[row][track - 1];
}

/** The melody of a range, so a test can read it the way the ear would. */
function pitches(song: Song, rows: number, track = 1): Array<number | null> {
  return Array.from({ length: rows }, (_, row) => cell(song, row, track).note);
}

describe('reversing a range', () => {
  it('reads the steps backwards, the last first', () => {
    const song = applied('tracks 1\nsteps 4\nC-4\nD-4\nE-4\nF-4\nrows 0 to 3 reverse');
    expect(pitches(song, 4)).toEqual([65, 64, 62, 60]); // F E D C
  });

  it('leaves rows outside the range alone', () => {
    const song = applied('tracks 1\nsteps 4\nC-4\nD-4\nE-4\nF-4\nrows 0 to 1 reverse');
    expect(pitches(song, 4)).toEqual([62, 60, 64, 65]); // D C E F
  });

  it('carries the force and the gesture with each step', () => {
    const song = applied('tracks 1\nsteps 2\nC-4~40\nD-4>\nrows 0 to 1 reverse');
    expect(cell(song, 0).note).toBe(62); // D, which was row 1
    expect(cell(song, 0).slide).toBe(true);
    expect(cell(song, 1).note).toBe(60); // C, which was row 0
    expect(cell(song, 1).velocity).toBe(40);
  });

  it('keeps empty steps empty, so rests reverse too', () => {
    const song = applied('tracks 1\nsteps 4\nC-4\n.\n.\nG-4\nrows 0 to 3 reverse');
    expect(pitches(song, 4)).toEqual([67, null, null, 60]);
  });

  it('reverses a DRUM hit like a note', () => {
    const song = applied('tracks 4\nsteps 2\nkick . . .\nsnare . . .\nrows 0 to 1 reverse');
    expect(cell(song, 0, 1).drum).toBe('snare');
    expect(cell(song, 1, 1).drum).toBe('kick');
  });

  it('is its own inverse: reversing twice is the figure you wrote', () => {
    const song = applied('tracks 1\nsteps 4\nC-4\nD-4\nE-4\nF-4\nrows 0 to 3 reverse\nrows 0 to 3 reverse');
    expect(pitches(song, 4)).toEqual([60, 62, 64, 65]); // C D E F
  });
});

describe('the arithmetic, on its own', () => {
  it('reverses a range in place and answers with the notes moved', () => {
    const song = applied('tracks 1\nsteps 3\nC-4\nD-4\nE-4');
    const moved = reverseRange(song.patterns[0], { from: 0, to: 2 });
    expect(moved).toBe(3);
    expect(pitches(song, 3)).toEqual([64, 62, 60]); // E D C
  });
});

describe('the language and the manifest', () => {
  it('is a published transformation, with no number of its own', () => {
    expect(REVERSE_WORD).toBe('reverse');
    expect(ROW_TRANSFORM_WORDS).toContain(REVERSE_WORD);
    const caps = scriptCapabilities();
    expect(caps.vocabulary.rowTransforms.map((one) => one.words)).toEqual([...ROW_TRANSFORM_WORDS]);
    expect(caps.vocabulary.rowTransforms.some((one) => one.id === 'reverse')).toBe(true);
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(40);
  });

  it('refuses anything after the word, because there is only one way', () => {
    expect(refused('tracks 1\nsteps 4\nC-4\nrows 0 to 3 reverse 2')).toContain('backwards');
    expect(refused('tracks 1\nsteps 4\nC-4\nrows 0 to 3 backwards')).toContain('not something a range of steps can do');
  });

  it('needs no file version: a reversed song is a song of moved cells', () => {
    const song = applied('tracks 1\nsteps 4\nC-4\nD-4\nE-4\nF-4\nrows 0 to 3 reverse');
    const json = songToJson(song);
    expect(JSON.parse(json).version).toBe(12);
    const read = songFromJson(json);
    if (!read.ok) throw new Error(read.errors.join(' / '));
    expect(pitches(read.song, 4)).toEqual([65, 64, 62, 60]);
    // And the script writes the NOTES it now holds, not the word: a reverse is an
    // edit, not a setting, so what saves is the figure it produced.
    expect(songToScript(song)).not.toContain('reverse');
  });
});
