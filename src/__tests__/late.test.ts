import { describe, expect, it } from 'vitest';
import {
  clampLate,
  createSong,
  LATE_TICKS_PER_STEP,
  lateSeconds,
  MAX_LATE,
  applyScript,
  rowNotes,
  songToScript,
  songFromJson,
  songToJson,
} from '../model';

describe('how late a hit lands', () => {
  it('is whole ticks, never negative, never past the ceiling', () => {
    expect(clampLate(-2)).toBe(0);
    expect(clampLate(2.4)).toBe(2);
    expect(clampLate(99)).toBe(MAX_LATE);
    expect(clampLate(Number.NaN)).toBe(0);
  });

  it('is a fraction of the STEP, so the push is the same at any tempo', () => {
    // Two ticks at 0.1s per step is a thirtieth of a second; at twice the tempo it
    // is half that — the same push in musical time, which is the whole point.
    expect(lateSeconds(2, 0.1)).toBeCloseTo((2 / LATE_TICKS_PER_STEP) * 0.1, 9);
    expect(lateSeconds(2, 0.05)).toBeCloseTo(lateSeconds(2, 0.1) / 2, 9);
    // And zero is exactly zero, so a song that never asks is scheduled as it was.
    expect(lateSeconds(0, 0.1)).toBe(0);
  });

  it('travels with the note the sequencer reads', () => {
    const song = createSong();
    song.patterns[0].steps[0][0].note = 60;
    song.patterns[0].steps[0][0].late = 2;
    const [note] = rowNotes(song.patterns[0], 0);
    expect(note.late).toBe(2);
    // A cell that says nothing answers zero, not undefined.
    const [plain] = rowNotes(song.patterns[0], 1);
    expect(plain).toBeUndefined();
  });

  it('is written by the script: push PATTERN ROW TRACK TICKS', () => {
    const song = createSong();
    song.patterns[0].steps[0][0].note = 60;
    const result = applyScript(song, 'push 1 1 1 2');
    if (!result.ok) throw new Error(result.errors[0].message);
    expect(result.song.patterns[0].steps[0][0].late).toBe(2);
    // And `0` puts it back on the step by TAKING THE FIELD AWAY, rather than
    // storing a zero: a cell that says nothing about its time has nothing to say.
    const cleared = applyScript(result.song, 'push 1 1 1 0');
    if (!cleared.ok) throw new Error(cleared.errors[0].message);
    expect(cleared.song.patterns[0].steps[0][0].late).toBeUndefined();
  });

  it('writes the clauses back out, so SAVE and APPLY are inverses', () => {
    // A script is how a song travels. A writer that dropped these would save a
    // phrased song as a straight one, and nothing would ever say so.
    const song = createSong();
    const cell = song.patterns[0].steps[0][0];
    cell.note = 60;
    cell.late = 2;
    cell.start = 25;
    cell.pan = -30;
    cell.fade = 40;
    const text = songToScript(song);
    expect(text).toContain('C-4:late2:seek25:pan-30:fade40');
    const back = applyScript(createSong(), text);
    if (!back.ok) throw new Error(back.errors[0].message);
    expect(back.song.patterns[0].steps[0][0]).toEqual(cell);
  });

  it('spells a cell\'s clauses on the note: C-4:late2:pan-30', () => {
    const result = applyScript(createSong(), 'grid 16\nC-4:late2:pan-30');
    if (!result.ok) throw new Error(result.errors[0].message);
    const cell = result.song.patterns[0].steps[0][0];
    expect(cell.note).toBe(60);
    expect(cell.late).toBe(2);
    expect(cell.pan).toBe(-30);
    // The same cell the statements write, because they ARE the statements.
    const byStatement = applyScript(createSong(), 'grid 16\nC-4\npush 1 1 1 2\npan 1 1 1 -30');
    if (!byStatement.ok) throw new Error(byStatement.errors[0].message);
    expect(byStatement.song.patterns[0].steps[0][0]).toEqual(cell);
    // An unknown clause is refused by name rather than played plainly.
    expect(applyScript(createSong(), 'grid 16\nC-4:wobble2').ok).toBe(false);
  });

  it('expands the chord already in a cell: arp write ROW TRACK *', () => {
    const song = createSong();
    // A triad on channel 1, then the run asked for by name — the two spellings
    // must land the same cells, which is what one writer is for.
    const starred = applyScript(song, 'arp direction up\narp octaves 2 rate 1\ntrack 1 poly 3\nnote 0 1 C-4,E-4,G-4\narp write 0 1 *');
    if (!starred.ok) throw new Error(starred.errors[0].message);
    expect(starred.song.patterns[0].steps.slice(0, 6).map((line) => line[0].note)).toEqual([60, 64, 67, 72, 76, 79]);
    // And an empty cell is a no-op, not a hole: nothing is cleared.
    const empty = applyScript(createSong(), 'arp write 0 1 *');
    expect(empty.ok).toBe(true);
  });

  it('fades a note with `fade`, and stores how much of it is the fall', () => {
    const song = createSong();
    song.patterns[0].steps[0][0].note = 60;
    const result = applyScript(song, 'fade 1 1 1 40');
    if (!result.ok) throw new Error(result.errors[0].message);
    expect(result.song.patterns[0].steps[0][0].fade).toBe(40);
    expect(rowNotes(result.song.patterns[0], 0)[0].fade).toBe(40);
    // A fade through the whole note is allowed (a swell), zero is no fade at all.
    expect(applyScript(song, 'fade 1 1 1 100').ok).toBe(true);
    const cleared = applyScript(result.song, 'fade 1 1 1 0');
    if (!cleared.ok) throw new Error(cleared.errors[0].message);
    expect(cleared.song.patterns[0].steps[0][0].fade).toBeUndefined();
  });

  it('leans a hit with `pan`, relative to the channel, and survives a file', () => {
    const song = createSong();
    song.patterns[0].steps[0][0].note = 60;
    const result = applyScript(song, 'pan 1 1 1 -30');
    if (!result.ok) throw new Error(result.errors[0].message);
    expect(result.song.patterns[0].steps[0][0].pan).toBe(-30);
    // Only the hits that lean answer with one, so every row that never asks is
    // the record it always was.
    expect(rowNotes(result.song.patterns[0], 0)[0].pan).toBe(-30);
    const centred = applyScript(result.song, 'pan 1 1 1 0');
    if (!centred.ok) throw new Error(centred.errors[0].message);
    expect(centred.song.patterns[0].steps[0][0].pan).toBeUndefined();
    expect(rowNotes(centred.song.patterns[0], 0)[0].pan).toBeUndefined();
  });

  it('addresses a SPAN of rows, so a whole snare row can lean together', () => {
    const song = createSong();
    for (let row = 0; row < 4; row++) song.patterns[0].steps[row][0].note = 60 + row;
    const result = applyScript(song, 'push 1 1-4 1 2');
    if (!result.ok) throw new Error(result.errors[0].message);
    for (let row = 0; row < 4; row++) expect(result.song.patterns[0].steps[row][0].late).toBe(2);
    // Row 5 was never named, so it never moved — a span is what the line says and
    // nothing beyond it.
    expect(result.song.patterns[0].steps[4]?.[0]?.late).toBeUndefined();
    // And a backwards span is refused rather than quietly swapped.
    expect(applyScript(song, 'push 1 4-1 1 2').ok).toBe(false);
  });

  it('refuses a push past the ceiling rather than rounding it', () => {
    const song = createSong();
    song.patterns[0].steps[0][0].note = 60;
    const result = applyScript(song, 'push 1 1 1 9');
    if (result.ok) throw new Error('a push past the ceiling must be refused');
    expect(result.errors[0].message).toContain('TICKS 0..3');
  });

  it('survives a save and a load, in a fourth slot, at version 52', () => {
    const song = createSong();
    song.patterns[0].steps[0][0].note = 60;
    song.patterns[0].steps[0][0].late = 2;
    const text = songToJson(song);
    expect(JSON.parse(text).version).toBe(52);
    const back = songFromJson(text);
    if (!back.ok) throw new Error(back.errors.join('; '));
    expect(back.song.patterns[0].steps[0][0].late).toBe(2);
    // A song that never pushes a hit does not claim the version.
    expect(JSON.parse(songToJson(createSong())).version).not.toBe(52);
  });

  it('refuses a fourth slot that is not a number, rather than guessing', () => {
    const song = createSong();
    song.patterns[0].steps[0][0].note = 60;
    song.patterns[0].steps[0][0].late = 2;
    const file = JSON.parse(songToJson(song));
    file.patterns[0].steps[0][0] = [60, 100, '', 'a bit'];
    expect(songFromJson(JSON.stringify(file)).ok).toBe(false);
  });

  it('seeks into the sample with `seek`, and starts again at 0', () => {
    const song = createSong();
    song.patterns[0].steps[0][0].note = 60;
    const sought = applyScript(song, 'seek 1 1 1 25');
    if (!sought.ok) throw new Error(sought.errors[0].message);
    expect(sought.song.patterns[0].steps[0][0].start).toBe(25);
    expect(rowNotes(sought.song.patterns[0], 0)[0].start).toBe(25);
    const back = applyScript(sought.song, 'seek 1 1 1 0');
    if (!back.ok) throw new Error(back.errors[0].message);
    expect(back.song.patterns[0].steps[0][0].start).toBeUndefined();
    // And it travels in the file, at its own version, so a seeked hit is not
    // silently straightened on the way back in.
    const text = songToJson(sought.song);
    expect(JSON.parse(text).version).toBe(53);
    const loaded = songFromJson(text);
    if (!loaded.ok) throw new Error(loaded.errors.join('; '));
    expect(loaded.song.patterns[0].steps[0][0].start).toBe(25);
  });

  it('refuses a seek past the point where an attack is left', () => {
    const song = createSong();
    song.patterns[0].steps[0][0].note = 60;
    const result = applyScript(song, 'seek 1 1 1 99');
    if (result.ok) throw new Error('a seek past 95% must be refused');
    expect(result.errors[0].message).toContain('PERCENTAGE 0..95');
  });

  it('is clamped on the way out, so a wild number never reaches the audio graph', () => {
    const song = createSong();
    song.patterns[0].steps[0][0].note = 60;
    song.patterns[0].steps[0][0].late = 99;
    expect(rowNotes(song.patterns[0], 0)[0].late).toBe(MAX_LATE);
  });
});
