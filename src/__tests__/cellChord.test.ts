import { describe, expect, it } from 'vitest';

import {
  applyScript,
  CELL_NOTE_SEPARATOR,
  cellNotes,
  cellText,
  clampPoly,
  copyPattern,
  countNotes,
  createSong,
  emptyCell,
  emptyPattern,
  MAX_CELL_NOTES,
  MAX_POLY,
  MIDI_MAX,
  MIDI_MIN,
  rowNotes,
  SCRIPT_KEYWORDS,
  setCellNotes,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION,
  CHORD_SONG_FILE_VERSION,
  type Song,
} from '../model';
import { SCRIPT_COMMANDS, SCRIPT_VERSION, scriptCapabilities } from '../model/capabilities';

/**
 * A CHORD IN ONE CELL — the notation half of polyphonic channels.
 *
 * For as long as the app has existed a cell held one note per channel, so a triad
 * cost three channels: the chord tool spread its notes across the channels that
 * followed, and that was the only way to write one. A cell now holds a list —
 * `C-4,E-4,G-4` — which is a cell a channel SOUNDS together, and the whole point
 * of `poly`. This file holds the model's two-field invariant, the language's two
 * ways of writing it, the file's version, and the one refusal that keeps a chord
 * from being thinned out in silence.
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

/** A channel wide enough for a triad, and the triad written in one cell. */
function triad(): Song {
  return applied('tracks 1\ntrack 1 poly 3\nC-4,E-4,G-4');
}

/** Every note in a pattern, in row order, flattened. */
function notes(song: Song, track = 0): number[][] {
  return song.patterns[0].steps.map((row) => cellNotes(row[track]!));
}

describe('a cell, and the notes it holds', () => {
  it('holds a list behind one name, so nothing outside the model knows there are two fields', () => {
    const cell = emptyCell();
    expect(cellNotes(cell)).toEqual([]);
    setCellNotes(cell, [60, 64, 67]);
    expect(cell.note).toBe(60);
    expect(cell.extra).toEqual([64, 67]);
    expect(cellNotes(cell)).toEqual([60, 64, 67]);
    // The pair is one value: an empty list empties the STEP, which is what makes
    // `erase` and a `.` in a grid row mean the whole cell.
    setCellNotes(cell, []);
    expect(cell.note).toBeNull();
    expect(cell.extra).toEqual([]);
  });

  it('drops a repeat rather than sounding one pitch twice, and keeps the order it was given', () => {
    const cell = emptyCell();
    setCellNotes(cell, [67, 60, 64, 60]);
    expect(cellNotes(cell)).toEqual([67, 60, 64]);
  });

  it('clamps a wild pitch and stops at the ceiling, like every other computed note', () => {
    const cell = emptyCell();
    setCellNotes(cell, [60, 9999, -3]);
    expect(cellNotes(cell)).toEqual([60, MIDI_MAX, MIDI_MIN]);
    setCellNotes(cell, [60, 61, 62, 63, 64, 65, 66, 67, 68, 69]);
    expect(cellNotes(cell)).toHaveLength(MAX_CELL_NOTES);
  });

  it('wears the same ceiling a channel does, because a wider cell would steal from itself', () => {
    expect(MAX_CELL_NOTES).toBe(MAX_POLY);
    expect(MAX_CELL_NOTES).toBe(8);
    expect(CELL_NOTE_SEPARATOR).toBe(',');
  });

  it('says `+N` in three characters, because that is all a grid column has', () => {
    const cell = emptyCell();
    expect(cellText(cell)).toBe('...');
    setCellNotes(cell, [60]);
    expect(cellText(cell)).toBe('C-4');
    setCellNotes(cell, [60, 64, 67]);
    expect(cellText(cell)).toBe('C-4+2');
  });

  it('counts every note, so the header does not under-report a chord', () => {
    const pattern = emptyPattern('P', 1, 1);
    setCellNotes(pattern.steps[0][0]!, [60, 64, 67]);
    expect(countNotes(pattern)).toBe(3);
  });

  it('answers a row with every note of every cell, each wearing its cell\'s force and gesture', () => {
    const pattern = emptyPattern('P', 2, 2);
    setCellNotes(pattern.steps[0][0]!, [60, 64, 67]);
    pattern.steps[0][0]!.velocity = 40;
    pattern.steps[0][0]!.stutter = 3;
    setCellNotes(pattern.steps[0][1]!, [48]);
    expect(rowNotes(pattern, 0)).toEqual([
      { track: 0, midi: 60, velocity: 40, articulation: { slide: false, stutter: 3, grace: 0, bend: 0 }, drum: null },
      { track: 0, midi: 64, velocity: 40, articulation: { slide: false, stutter: 3, grace: 0, bend: 0 }, drum: null },
      { track: 0, midi: 67, velocity: 40, articulation: { slide: false, stutter: 3, grace: 0, bend: 0 }, drum: null },
      { track: 1, midi: 48, velocity: 100, articulation: { slide: false, stutter: 1, grace: 0, bend: 0 }, drum: null },
    ]);
  });

  it('travels with a copied pattern, deep enough that the copy is not a second reference', () => {
    const song = createSong();
    setCellNotes(song.patterns[0].steps[0][0]!, [60, 64, 67]);
    copyPattern(song, 1, 2);
    const copy = song.patterns[1].steps[0][0]!;
    expect(cellNotes(copy)).toEqual([60, 64, 67]);
    copy.extra.push(72);
    expect(cellNotes(song.patterns[0].steps[0][0]!)).toEqual([60, 64, 67]);
  });
});

describe('writing a chord, in the language', () => {
  it('reads a comma run as one cell, in a grid row and on a note line alike', () => {
    expect(notes(triad())[0]).toEqual([60, 64, 67]);
    // The cell is written whole: a chord SHARES its force and its gesture, which
    // is what one cell means — one event, however many notes it names.
    const held = applied('tracks 1\ntrack 1 poly 3\nC-4,E-4,G-4>*3~40');
    expect(notes(held)[0]).toEqual([60, 64, 67]);
    expect(held.patterns[0].steps[0][0]!.velocity).toBe(40);
    expect(held.patterns[0].steps[0][0]!.stutter).toBe(3);
    // The command spelling is the same value, the way a single note is.
    const line = applied('tracks 1\ntrack 1 poly 3\nnote 0 1 C-4,E-4,G-4');
    expect(notes(line)).toEqual(notes(triad()));
    // ...and a bare pitch is still one note in one cell, byte for byte.
    expect(notes(applied('tracks 1\nC-4'))[0]).toEqual([60]);
  });

  it('refuses a chord the channel cannot SOUND, naming both ways out', () => {
    const message = refused('tracks 1\nC-4,E-4,G-4');
    expect(message).toContain('this cell holds 3 notes, but channel 1 sounds 1 at a time');
    expect(message).toContain('track 1 poly 3');
    expect(message).toContain('chord 0 1');
    // A `note` line names its own channel, so it has no column prefix.
    expect(refused('tracks 1\nnote 0 1 C-4,E-4,G-4')).toContain('this cell holds 3 notes');
    // The order rule every other channel fact follows: the width is read as of
    // where it is written, so widening the channel BELOW the chord is too late.
    expect(refused('tracks 1\nC-4,E-4,G-4\ntrack 1 poly 3')).toContain('sounds 1 at a time');
    expect(applied('tracks 1\ntrack 1 poly 3\nC-4,E-4,G-4')).toBeTruthy();
    // Widening a channel to three does not make it a place for four.
    expect(refused('tracks 1\ntrack 1 poly 3\nC-4,E-4,G-4,B-4')).toContain('sounds 3 at a time');
  });

  it('holds the ceiling to the cell, not to the language', () => {
    const tooBig = [60, 62, 64, 65, 67, 69, 71, 72, 74].map((midi) => noteNameOf(midi).replace('-', '')).join(',');
    const message = refused(`tracks 1\ntrack 1 poly 8\n${tooBig}`);
    expect(message).toContain(`a cell holds at most ${MAX_CELL_NOTES} notes`);
    expect(message).toContain('a second cell');
  });

  it('keeps a pitch that is named twice in one cell once', () => {
    expect(notes(applied('tracks 1\ntrack 1 poly 3\nC-4,C-4,E-4'))[0]).toEqual([60, 64]);
  });

  it('puts a `chord` statement in ONE cell on a wide channel, and spreads it on a narrow one', () => {
    // The promise `poly` made: a triad costs one channel rather than three.
    const one = applied('tracks 3\ntrack 1 poly 3\nchord 0 1 Am');
    expect(cellNotes(one.patterns[0].steps[0][0]!)).toEqual([69, 72, 76]);
    expect(cellNotes(one.patterns[0].steps[0][1]!)).toEqual([]);
    // A channel nobody widened spreads its notes, exactly as it always did: this
    // is the song a version-12 build wrote, and it is still the song it writes.
    const spread = applied('tracks 3\nchord 0 1 Am');
    expect(spread.patterns[0].steps[0].map((cell) => cell.note)).toEqual([69, 72, 76]);
    expect(cellNotes(spread.patterns[0].steps[0][0]!)).toEqual([69]);
    // ...and the channels-after-it shortage only matters when neither fits.
    expect(refused('tracks 2\nchord 0 1 Am')).toContain('needs 3 channels');
    expect(refused('tracks 2\nchord 0 1 Am')).toContain('track 1 poly 3');
    expect(applied('tracks 1\ntrack 1 poly 3\nchord 0 1 Am')).toBeTruthy();
  });

  it('moves and repeats a chord with the range statements, since a chord is just notes', () => {
    const up = applied('tracks 1\ntrack 1 poly 3\nC-4,E-4,G-4\nrows 0 to 0 octave up');
    expect(notes(up)[0]).toEqual([72, 76, 79]);
    const tiled = applied('tracks 1\ntrack 1 poly 3\nC-4,E-4,G-4\n.\n.\n.\nrows 0 to 0 repeat 4');
    expect(notes(tiled).slice(0, 4)).toEqual([[60, 64, 67], [60, 64, 67], [60, 64, 67], [60, 64, 67]]);
  });
});

describe('the file, and the tool that writes one', () => {
  it('is a version of its own, because a cell changed SHAPE rather than gaining a key', () => {
    // A plain song keeps writing the version it always wrote: no key anywhere, so
    // a file this build writes for it is byte-for-byte what version 12 wrote.
    const plain = createSong();
    plain.patterns[0].steps[0][0]!.note = 60;
    const plainFile = JSON.parse(songToJson(plain)) as Record<string, unknown>;
    expect(plainFile.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(plainFile)).not.toContain('extra');
    // A chord is a version of its own: an older build would find a LIST where it
    // expected a pitch, so the file has to say so rather than be guessed at.
    const chordal = JSON.parse(songToJson(triad())) as { version: number; patterns: { steps: unknown[][] }[] };
    expect(chordal.version).toBeGreaterThan(SONG_FILE_VERSION);
    // A chord always carries its force: `[[notes], velocity]`, because a bare list
    // would be a cell whose LENGTH says something.
    expect(chordal.patterns[0].steps[0][0]).toEqual([[60, 64, 67], 100]);
  });

  it('round-trips a chord through the JSON format', () => {
    const song = triad();
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error(back.errors.join(' / '));
    expect(notes(back.song)[0]).toEqual([60, 64, 67]);
    expect(back.song.tracks[0]!.poly).toBe(3);
  });

  it('writes the chord into a script and reads it back note for note', () => {
    const text = songToScript(triad());
    expect(text).toContain('C-4,E-4,G-4');
    // The width travels too, or the script would refuse itself: the chord and the
    // channel that can sound it are one thing.
    expect(text).toContain('poly 3');
    // A song with no chord writes no separator anywhere in its grid: the comment
    // header is prose and may use punctuation, the STEPS are what must not move.
    const plain = songToScript(applied('tracks 1\nC-4')).split('\n').filter((line) => !line.startsWith('#'));
    expect(plain.join('\n')).not.toContain(CELL_NOTE_SEPARATOR);
    expect(notes(applied(text))).toEqual(notes(triad()));
  });

  it('refuses a file whose step is wider than the channel it lands on', () => {
    // The door a hand-edited file comes through. A step holding three notes on a
    // channel that sounds one would play as a chord with two notes missing — the
    // one kind of wrongness nobody hears as wrongness, so it is refused.
    const file = JSON.parse(songToJson(triad())) as { tracks: { poly: number }[]; patterns: { steps: unknown[][] }[] };
    file.tracks[0]!.poly = 1;
    const read = songFromJson(JSON.stringify(file));
    expect(read.ok).toBe(false);
    if (read.ok) throw new Error('expected a refusal');
    expect(read.errors.join(' ')).toContain('this step holds 3 notes, but the channel sounds 1 at a time');
  });

  it('exports every note of a chord to MIDI, on the one channel it belongs to', async () => {
    const { songToMidi } = await import('../model/midiExport');
    const song = triad();
    const exported = songToMidi(song);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.errors.join(' / '));
    expect(exported.summary.notes).toBe(3);
    expect(exported.summary.tracks).toBe(1);
  });
});

describe('the language surface', () => {
  it('adds NO word: a chord is a cell spelling, not a statement of its own', () => {
    // §5's own order of preference: a value on an existing line before a new verb.
    // The cell gained a SEPARATOR, and no statement was added for it — the words
    // are exactly the words version 12 had, in exactly the order it had them.
    for (const word of ['cell', 'notes', 'chordcell', 'stack']) expect(SCRIPT_KEYWORDS).not.toContain(word);
    expect(SCRIPT_COMMANDS.map((command) => command.word)).toEqual([...SCRIPT_KEYWORDS]);
  });

  it('publishes the version, the ceiling and the separator a tool has to spell', () => {
    const caps = scriptCapabilities();
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(13);
    expect(caps.versionNotes.find((entry) => entry.version === 13)?.note).toContain('CHORD');
    expect(caps.limits.cellNotes).toEqual({ max: MAX_CELL_NOTES });
    expect(caps.vocabulary.cellNoteSeparator).toBe(CELL_NOTE_SEPARATOR);
    // The published separator is the one the parser actually reads, in both
    // directions: a tool that writes what the manifest describes is never refused.
    const written = [60, 64, 67].map((midi) => noteNameOf(midi)).join(caps.vocabulary.cellNoteSeparator);
    expect(notes(applied(`tracks 1\ntrack 1 poly 3\n${written}`))[0]).toEqual([60, 64, 67]);
  });

  it('widens the version the FILE declares, so the two versions stay one story', () => {
    expect(CHORD_SONG_FILE_VERSION).toBeGreaterThan(SONG_FILE_VERSION);
    expect(clampPoly(3)).toBe(3);
  });
});

/** A pitch name the way the grid spells it, for the round-trip check above. */
function noteNameOf(midi: number): string {
  const names = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
