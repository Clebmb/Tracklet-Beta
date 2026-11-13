import { describe, expect, it } from 'vitest';
import {
  applyScript,
  cellText,
  createSong,
  emptyCell,
  rowStops,
  setCellNotes,
  setCellStop,
  stopFromName,
  songFromJson,
  songToJson,
  songToScript,
  STOP_SONG_FILE_VERSION,
} from '../model';
import { stepStops } from '../model/live';
import { readMidi } from '../model/midi';
import { songToMidi } from '../model/midiExport';

/** Apply a script to a blank song, failing the test if it does not parse. */
function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(result.errors.map((error) => `${error.line}: ${error.message}`).join(' / '));
  return result.song;
}

describe('a stop', () => {
  it('is a cell of its own, holding no note', () => {
    const cell = emptyCell();
    setCellNotes(cell, [60]);
    setCellStop(cell, 'off');
    expect(cell.note).toBeNull();
    expect(cell.extra).toEqual([]);
    expect(cell.drum).toBeNull();
    expect(cell.gesture).toBe('off');
    // And it reads as the word, in the same three characters a note or a drum
    // gets — the whole point of writing it in a column rather than an effect lane.
    expect(cellText(cell)).toBe('OFF');
    setCellStop(cell, 'cut');
    expect(cellText(cell)).toBe('CUT');
  });

  it('is taken off by a note written over it', () => {
    const cell = emptyCell();
    setCellStop(cell, 'cut');
    setCellNotes(cell, [64]);
    expect(cell.gesture).toBeNull();
    expect(cellText(cell)).toBe('E-4');
  });

  it('reads its two words and nothing else', () => {
    expect(stopFromName('off')).toBe('off');
    expect(stopFromName('CUT')).toBe('cut');
    expect(stopFromName('cutoff')).toBeNull();
  });

  it('is answered per row and per channel', () => {
    const song = createSong();
    setCellStop(song.patterns[0].steps[3][1], 'off');
    expect(rowStops(song.patterns[0], 3)).toEqual([{ track: 1, stop: 'off' }]);
    expect(rowStops(song.patterns[0], 2)).toEqual([]);
  });
});

describe('a stop in the language', () => {
  it('is a word a grid row can hold', () => {
    const song = applied('tracks 2\nC-4 .\noff .');
    expect(song.patterns[0].steps[1][0].gesture).toBe('off');
    expect(cellText(song.patterns[0].steps[1][0])).toBe('OFF');
    // The channel beside it is untouched: a stop silences ONE channel.
    expect(song.patterns[0].steps[1][1].note).toBeNull();
    expect(song.patterns[0].steps[1][1].gesture).toBeNull();
  });

  it('takes no force and no gesture of its own', () => {
    const result = applyScript(createSong(), 'tracks 1\noff~40');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toMatch(/is a stop, so it takes no force/);
  });

  it('is written out by SAVE and read back by APPLY', () => {
    const song = applied('tracks 2\nC-4 .\noff .');
    const script = songToScript(song);
    expect(script).toContain('off');
    const again = applied(script);
    expect(again.patterns[0].steps[1][0].gesture).toBe('off');
  });
});

describe('a stop in the file', () => {
  it('writes version 47 and a bare word', () => {
    const song = applied('tracks 2\nC-4 .\noff .');
    const raw = JSON.parse(songToJson(song)) as { version: number; patterns: { steps: unknown[][] }[] };
    expect(raw.version).toBe(STOP_SONG_FILE_VERSION);
    expect(raw.patterns[0].steps[1][0]).toBe('off');
  });

  it('round-trips, because an older build would have saved it away', () => {
    const song = applied('tracks 2\nC-4 .\ncut .');
    const read = songFromJson(songToJson(song));
    if (!read.ok) throw new Error(read.errors.join(' / '));
    expect(read.song.patterns[0].steps[1][0].gesture).toBe('cut');
    expect(cellText(read.song.patterns[0].steps[1][0])).toBe('CUT');
  });

  it('refuses a word with a force after it', () => {
    const song = applied('tracks 1');
    const raw = JSON.parse(songToJson(song)) as Record<string, unknown>;
    const patterns = raw.patterns as { steps: unknown[][] }[];
    patterns[0].steps[0][0] = ['off', 80];
    const read = songFromJson(JSON.stringify(raw));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.errors[0]).toMatch(/a stop takes nothing after it/);
  });
});

describe('a stop in a MIDI file', () => {
  /** The one note an exported one-channel song wrote, in ticks. */
  function exportedNote(source: string) {
    const song = applied(source);
    const result = songToMidi(song);
    if (!result.ok) throw new Error(result.errors.join(' / '));
    const read = readMidi(result.bytes);
    if (!read.ok) throw new Error(read.errors.join(' / '));
    expect(read.midi.notes).toHaveLength(1);
    return read.midi.notes[0];
  }

  it('ends the note where the step says rather than at the hold', () => {
    // 16 steps of hold, stopped on step 4: 120 ticks a step, so 480 rather than
    // 1920. A file that wrote the hold would export a pad nobody played.
    const stopped = exportedNote('tracks 1\ntrack 1 hold 16\nC-4\n.\n.\n.\noff');
    expect(stopped.length).toBe(480);
    const ringing = exportedNote('tracks 1\ntrack 1 hold 16\nC-4');
    expect(ringing.length).toBe(1920);
  });
});

describe('a stop while performing', () => {
  it('comes from the order when nothing is performing', () => {
    const song = applied('tracks 2\nC-4 .\noff .');
    expect(stepStops(song, [], 1, 1)).toEqual([{ track: 0, stop: 'off' }]);
  });

  it('comes from the scene clip that plays the channel', () => {
    // Pattern 2 holds the stop; scene A plays pattern 2 on channel 1 only, so the
    // stop is that channel's and the borrowed pattern is not read as a whole.
    const song = applied('tracks 2\nC-4 .\n. .\npattern 2\nC-5 .\noff .\nscene A 2 1');
    const atRow = stepStops(song, [{ atStep: 0, scene: 0 }], 1, 1);
    expect(atRow).toEqual([{ track: 0, stop: 'off' }]);
  });
});
