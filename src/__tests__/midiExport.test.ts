import { describe, expect, it } from 'vitest';

import { DRUM_CHANNEL, readMidi, songFromMidi } from '../model/midi';
import {
  DRUM_PITCHES,
  MIDI_EXPORT_FILE_EXTENSION,
  MIDI_EXPORT_FORMAT,
  MIDI_EXPORT_PPQ,
  VOICE_PROGRAMS,
  drumPitchForVoice,
  gmProgramForVoice,
  midiVelocity,
  songToMidi,
} from '../model/midiExport';
import {
  clampVelocity,
  createSong,
  emptyPattern,
  rowNotes,
  setPatternRows,
  setTrackCount,
  songSteps,
  stepToSlot,
  withTempoPoint,
  type Song,
} from '../model/song';
import { copyVoice, voiceById, voiceNameFor } from '../model/voice';
import { createMachine, setMachineOrder, withMachineBar } from '../model/machine';

/**
 * The MIDI writer, and the round trip it exists for.
 *
 * Two things matter more than the happy path here. The first is that the file is
 * READABLE — by this app's own reader, byte for byte, because the writer is the
 * inverse of the reader and the only proof of that is doing both. The second is
 * that the mapping is honest: what MIDI cannot carry (the sound, the feel, the
 * lanes) must not appear in the bytes, and what it does carry must be the thing
 * you heard — a monophonic channel's note ends where the next one begins.
 */

/** A song of `tracks` channels, `rows` rows over `bars` bars of order. */
function blank(tracks: number, rows = 16, bars = 1): Song {
  const song = createSong();
  setTrackCount(song, tracks);
  setPatternRows(song, rows);
  song.patterns = Array.from({ length: bars }, (_, i) => emptyPattern(`BAR ${i + 1}`, rows, tracks));
  song.order = Array.from({ length: bars }, (_, i) => i + 1);
  return song;
}

/** Put a note on a channel, on a step of a pattern. */
function put(song: Song, bar: number, row: number, track: number, midi: number, velocity?: number): void {
  const cell = song.patterns[bar].steps[row][track];
  cell.note = midi;
  if (velocity !== undefined) cell.velocity = velocity;
}

/** Give a channel a preset voice by name, and return the song for chaining. */
function voice(song: Song, track: number, id: string): Song {
  const preset = voiceById(id);
  if (preset) song.tracks[track].voice = copyVoice(preset.params);
  return song;
}

/** Every note the order plays, per channel, as `step:note@velocity`. */
function flat(song: Song): string[] {
  const out: string[] = [];
  for (let step = 0; step < songSteps(song); step++) {
    const at = stepToSlot(song, step);
    const pattern = song.patterns[at.pattern];
    if (!pattern) continue;
    for (const note of rowNotes(pattern, at.row)) {
      out.push(`${note.track}:${step}:${note.midi}@${note.velocity}`);
    }
  }
  return out.sort();
}

/** Every note, grouped by the part that plays it, so channel ORDER does not matter. */
function byPart(song: Song): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const entry of flat(song)) {
    const [track, ...rest] = entry.split(':');
    // Keyed on the SOUND rather than the name, because the reader names a melodic
    // channel after its MIDI channel (`CH 1`) and keeps only the first name it
    // meets as the song's title.
    const key = voiceNameFor(song.tracks[Number(track)].voice);
    (groups[key] ??= []).push(rest.join(':'));
  }
  return groups;
}

/** The summary of an export that is expected to succeed. */
function exported(song: Song) {
  const result = songToMidi(song);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result;
}

/** The reader's view of an exported song. */
function reopened(song: Song) {
  const read = readMidi(exported(song).bytes);
  expect(read.ok).toBe(true);
  if (!read.ok) throw new Error(read.errors.join('; '));
  return read.midi;
}

// --- the bytes --------------------------------------------------------------

describe('writing a MIDI file', () => {
  it('starts with a format 1 header at 480 ticks per quarter', () => {
    const song = blank(1);
    put(song, 0, 0, 0, 60);
    const { bytes, summary } = exported(song);
    // "MThd", a length of 6, format, track count, division.
    expect([...bytes.slice(0, 4)].map((b) => String.fromCharCode(b)).join('')).toBe('MThd');
    expect([...bytes.slice(4, 8)]).toEqual([0, 0, 0, 6]);
    expect([...bytes.slice(8, 10)]).toEqual([0, MIDI_EXPORT_FORMAT]);
    // One conductor plus one channel.
    expect([...bytes.slice(10, 12)]).toEqual([0, 2]);
    expect([...bytes.slice(12, 14)]).toEqual([(MIDI_EXPORT_PPQ >> 8) & 0xff, MIDI_EXPORT_PPQ & 0xff]);
    expect(summary).toMatchObject({ tracks: 1, notes: 1, bars: 1, ppq: MIDI_EXPORT_PPQ });
    expect(MIDI_EXPORT_FILE_EXTENSION).toBe('.mid');
  });

  it('writes one track per channel that has a note, and none for a silent one', () => {
    const song = blank(3);
    put(song, 0, 0, 0, 60);
    put(song, 0, 2, 2, 72);
    const read = reopened(song);
    expect(read.trackCount).toBe(3);            // conductor + two channels
    expect(read.notes.map((n) => n.note).sort()).toEqual([60, 72]);
  });

  it('writes a note-on and a note-off a whole hold apart', () => {
    const song = blank(1);
    song.tracks[0].hold = 4;
    put(song, 0, 1, 0, 60, 80);
    const midi = reopened(song);
    // One step is a sixteenth: 480 ticks a quarter, four rows a beat = 120.
    expect(midi.notes).toHaveLength(1);
    expect(midi.notes[0]).toMatchObject({ channel: 0, note: 60, start: 120, length: 480 });
    // 80% of 127 is 101.6, and the reader gives back 80.
    expect(midi.notes[0].velocity).toBe(102);
  });

  it('gives a monophonic channel the length it sounds, and a polyphonic one its hold', () => {
    // The same four notes under a hold of four steps, once on a channel that can
    // only sound one note at a time and once on one that can sound eight.
    const mono = blank(1);
    mono.tracks[0].hold = 4;
    const poly = blank(1);
    poly.tracks[0].hold = 4;
    poly.tracks[0].poly = 4;
    for (let row = 0; row < 4; row++) {
      put(mono, 0, row, 0, 60 + row);
      put(poly, 0, row, 0, 60 + row);
    }
    // Mono: each note ends where the next begins, so the last one keeps the hold.
    expect(reopened(mono).notes.map((n) => [n.start, n.length]))
      .toEqual([[0, 120], [120, 120], [240, 120], [360, 480]]);
    // Poly: every note is whole, so they overlap.
    expect(reopened(poly).notes.map((n) => [n.start, n.length]))
      .toEqual([[0, 480], [120, 480], [240, 480], [360, 480]]);
  });

  it('writes the title, the channel names and the tempo', () => {
    const song = blank(2);
    song.title = 'A SMALL SONG';
    song.bpm = 137;
    song.tracks[0].name = 'LEAD';
    song.tracks[1].name = 'BASS';
    put(song, 0, 0, 0, 60);
    put(song, 0, 0, 1, 40);
    const midi = reopened(song);
    expect(midi.title).toBe('A SMALL SONG');
    expect(midi.bpm).toBe(137);
    // Both names are in the file, even though the reader only keeps the first.
    const text = [...exported(song).bytes].map((b) => String.fromCharCode(b)).join('');
    expect(text).toContain('LEAD');
    expect(text).toContain('BASS');
  });

  it('writes a program change for a melodic channel and none for a drum', () => {
    const song = blank(2);
    voice(song, 0, 'strings');
    voice(song, 1, 'kick');
    put(song, 0, 0, 0, 60);
    put(song, 0, 0, 1, 36);
    const midi = reopened(song);
    expect(midi.programs[0]).toBe(VOICE_PROGRAMS.strings);
    expect(midi.programs[DRUM_CHANNEL]).toBe(-1);
  });

  it('writes the tempo map as tempo events, a slide read bar by bar', () => {
    const song = blank(1, 16, 3);
    put(song, 0, 0, 0, 60);
    put(song, 2, 0, 0, 62);
    song.tempoMap = withTempoPoint(song.tempoMap, { slide: false, bpm: 160, slot: 3 });
    const midi = reopened(song);
    // The first tempo wins for the reader; the change is still in the bytes at
    // the tick the third bar starts on (two bars of 16 steps of 120 ticks).
    expect(midi.bpm).toBe(120);
    const read = readMidi(exported(song).bytes);
    expect(read.ok).toBe(true);
    const raw = [...exported(song).bytes];
    // 160 BPM is 375000 microseconds a quarter: 0x05B8D8.
    const at = raw.findIndex((b, i) => b === 0xff && raw[i + 1] === 0x51 && raw[i + 3] === 0x05 && raw[i + 4] === 0xb8);
    expect(at).toBeGreaterThan(0);
  });

  it('writes the bar as a time signature, and says nothing when the bar is not whole beats', () => {
    const four = blank(1);
    put(four, 0, 0, 0, 60);
    const rawFour = [...exported(four).bytes];
    // 0xFF 0x58 0x04 numerator=4 denominator=2 (a quarter).
    const sig = (raw: number[]) => raw.findIndex((b, i) => b === 0xff && raw[i + 1] === 0x58);
    expect(rawFour[sig(rawFour) + 3]).toBe(4);
    expect(rawFour[sig(rawFour) + 4]).toBe(2);
  });

  it('refuses a song with no notes rather than downloading a file that cannot open', () => {
    const result = songToMidi(blank(2));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain('no notes');
    // The app's own reader refuses one too, which is the reason it is a refusal.
    const read = readMidi(new Uint8Array(0));
    expect(read.ok).toBe(false);
  });

  it('is deterministic', () => {
    const song = blank(2);
    put(song, 0, 0, 0, 60);
    put(song, 0, 3, 1, 40);
    expect([...exported(song).bytes]).toEqual([...exported(song).bytes]);
  });

  it('leaves a pattern the order never plays out of the file', () => {
    const song = blank(1, 16, 2);
    put(song, 0, 0, 0, 60);
    put(song, 1, 0, 0, 62);
    song.order = [1];                            // bar 2 is written but never heard
    expect(reopened(song).notes.map((n) => n.note)).toEqual([60]);
  });

  it('carries notes and nothing else: the sound, the feel and the lanes do not change the bytes', () => {
    const plain = blank(1);
    put(plain, 0, 0, 0, 60);
    const dressed = blank(1);
    put(dressed, 0, 0, 0, 60);
    dressed.tracks[0].level = 20;
    dressed.tracks[0].pan = -80;
    dressed.tracks[0].drive = 70;
    dressed.tracks[0].groove = 'shuffle';
    dressed.tracks[0].humanize = 60;
    dressed.swing = 55;
    dressed.reverb = 40;
    dressed.automation = [{ track: 0, target: 'bright', from: 10, to: 90, startBar: 1, endBar: 1 }];
    expect([...exported(dressed).bytes]).toEqual([...exported(plain).bytes]);
  });
});

// --- the two lookups --------------------------------------------------------

describe('the voice a channel is written as', () => {
  it('maps every preset to a program that reads back as the same voice', () => {
    for (const [id, program] of Object.entries(VOICE_PROGRAMS)) {
      const preset = voiceById(id)!;
      expect(gmProgramForVoice(preset.params)).toBe(program);
    }
  });

  it('knows a drum by its voice, and a lead is not one', () => {
    expect(drumPitchForVoice(voiceById('kick')!.params)).toBe(DRUM_PITCHES.kick);
    expect(drumPitchForVoice(voiceById('hat')!.params)).toBe(DRUM_PITCHES.hat);
    expect(drumPitchForVoice(voiceById('lead')!.params)).toBeNull();
  });

  it('writes a sound nobody named as the lead, because every program is wrong for it', () => {
    const custom = { ...voiceById('lead')!.params, bright: 3, sweep: 97 };
    expect(voiceNameFor(custom)).toBe('custom');
    expect(gmProgramForVoice(custom)).toBe(VOICE_PROGRAMS.lead);
  });

  it('scales a velocity into MIDI and back to the number it came from', () => {
    expect(midiVelocity(100)).toBe(127);
    expect(midiVelocity(0)).toBe(1);            // a note-on at 0 IS a note-off
    for (let v = 1; v <= 100; v++) {
      expect(clampVelocity(Math.round((midiVelocity(v) / 127) * 100))).toBe(v);
    }
    expect(clampVelocity(Math.round((midiVelocity(0) / 127) * 100))).toBe(1);
  });
});

// --- the round trip ---------------------------------------------------------

describe('exporting and reading back', () => {
  it('brings a melodic song back note for note', () => {
    const song = blank(2, 16, 2);
    song.tracks[0].hold = 2;
    song.tracks[1].hold = 1;
    put(song, 0, 0, 0, 60, 100);
    put(song, 0, 4, 0, 64, 50);
    put(song, 0, 8, 1, 36, 90);
    put(song, 1, 2, 0, 67, 30);
    put(song, 1, 12, 1, 43, 100);
    const back = songFromMidi(exported(song).bytes);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.bpm).toBe(song.bpm);
    expect(back.summary.notes).toBe(5);
    expect(back.summary.dropped).toBe(0);
    // The order the notes play in, and how hard, is the whole point.
    expect(flat(back.song)).toEqual(flat(song));
    expect(back.song.tracks.map((t) => t.hold)).toEqual([2, 1]);
  });

  it('brings the voices back through the program changes', () => {
    const song = blank(3);
    voice(song, 0, 'strings');
    voice(song, 1, 'bass');
    voice(song, 2, 'bell');
    put(song, 0, 0, 0, 60);
    put(song, 0, 1, 1, 40);
    put(song, 0, 2, 2, 84);
    const back = songFromMidi(exported(song).bytes);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.tracks.map((t) => voiceNameFor(t.voice))).toEqual(['strings', 'bass', 'bell']);
  });

  it('brings a drum song back as kick, snare and hat', () => {
    const song = blank(3);
    voice(song, 0, 'kick');
    voice(song, 1, 'snare');
    voice(song, 2, 'hat');
    put(song, 0, 0, 0, 36, 100);
    put(song, 0, 4, 0, 36, 90);
    put(song, 0, 4, 1, 38, 70);
    put(song, 0, 2, 2, 42, 40);
    put(song, 0, 6, 2, 42, 60);
    const midi = reopened(song);
    // All three parts are on MIDI's drum channel, at the General MIDI pitches.
    expect(new Set(midi.notes.map((n) => n.channel))).toEqual(new Set([DRUM_CHANNEL]));
    expect(new Set(midi.notes.map((n) => n.note))).toEqual(new Set([36, 38, 42]));
    const back = songFromMidi(exported(song).bytes);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.summary.tracks).toBe(3);
    expect(back.song.tracks.map((t) => t.name)).toEqual(['KICK', 'SNARE', 'HAT']);
    expect(back.song.tracks.map((t) => voiceNameFor(t.voice))).toEqual(['kick', 'snare', 'hat']);
    expect(flat(back.song)).toEqual(flat(song));
  });

  it('brings a polyphonic channel back with its parts still overlapping', () => {
    const song = blank(1);
    song.tracks[0].hold = 4;
    song.tracks[0].poly = 3;
    put(song, 0, 0, 0, 60, 100);
    put(song, 0, 2, 0, 64, 80);
    put(song, 0, 4, 0, 67, 60);
    const back = songFromMidi(exported(song).bytes);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.tracks[0].hold).toBe(4);
    expect(flat(back.song)).toEqual(flat(song));
  });

  it('keeps every part when a song mixes drums with melodic channels', () => {
    const song = blank(3);
    voice(song, 0, 'lead');
    voice(song, 1, 'kick');
    voice(song, 2, 'bass');
    song.tracks[0].name = 'LEAD';
    song.tracks[1].name = 'KICK';
    song.tracks[2].name = 'BASS';
    put(song, 0, 0, 0, 60);
    put(song, 0, 4, 1, 36);
    put(song, 0, 6, 2, 36);
    const back = songFromMidi(exported(song).bytes);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    // The reader takes a file's melodic channels in order and its drum channel
    // LAST, so a song that interleaves percussion with melodic parts comes back
    // with the drums at the end. Which channel plays what is not negotiable.
    expect(back.song.tracks.map((t) => `${t.name}:${voiceNameFor(t.voice)}`))
      .toEqual(['CH 1:lead', 'CH 2:bass', 'KICK:kick']);
    expect(byPart(back.song)).toEqual(byPart(song));
  });

  it('brings the title and the tempo back', () => {
    const song = blank(1);
    song.title = 'EXPORT ME';
    song.bpm = 90;
    put(song, 0, 0, 0, 60);
    const back = songFromMidi(exported(song).bytes);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.title).toBe('EXPORT ME');
    expect(back.summary.bpm).toBe(90);
  });

  it('exports a song the app could not have imported, and it still reads back', () => {
    // A shape only this app writes: a 14-row bar at two rows a beat (`meter 7 8`).
    const song = blank(1, 14, 2);
    song.rowsPerBeat = 2;
    put(song, 0, 0, 0, 60);
    put(song, 1, 13, 0, 72);
    const midi = reopened(song);
    // A row is half a beat here, so 480/2 = 240 ticks and the bar is 3360. The
    // second note is on the second bar's last row: step 27.
    expect(midi.notes.map((n) => n.start)).toEqual([0, 27 * 240]);
    expect(songToMidi(song).ok).toBe(true);
  });
});

// --- the drum machine's lane -------------------------------------------------

describe('the drum machine writes its beat to the MIDI file', () => {
  /** A song of one silent channel, whose machine is a kick on every fourth row. */
  function machineSong(): Song {
    const song = blank(1);
    const machine = createMachine(16);
    const pads = machine.pads.map((pad, index) =>
      index === 0 ? { ...pad, steps: [100, 0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0] } : { ...pad, steps: new Array(16).fill(0) },
    );
    song.machine = { ...machine, pads };
    return song;
  }

  it('exports a machine-only song instead of refusing it', () => {
    const song = machineSong();
    const { summary } = exported(song);
    // One drum track, four kicks, and no channel track for the silent channel.
    expect(summary.tracks).toBe(1);
    expect(summary.notes).toBe(4);
  });

  it('puts every hit on the drum channel at the pad\'s own pitch', () => {
    const midi = reopened(machineSong());
    const drum = midi.notes.filter((note) => note.channel === DRUM_CHANNEL);
    expect(drum).toHaveLength(4);
    // The kick's kit pitch, and one hit per beat: 480 ticks apart at 4 rows a beat.
    expect(unique(drum.map((note) => note.note))).toEqual([36]);
    expect(drum.map((note) => note.start)).toEqual([0, 480, 960, 1440]);
  });

  it('reads the machine\'s beat back as a drum part', () => {
    const back = songFromMidi(exported(machineSong()).bytes);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    // The reader turns channel 9 into drum channels; the kicks survive.
    expect(back.summary.notes).toBe(4);
  });

  it('writes nothing for a machine that is off, and refuses an empty song', () => {
    const off = machineSong();
    if (off.machine) off.machine.enabled = false;
    const result = songToMidi(off);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('nothing to export');
  });

  it('places the bar the ORDER names, so a two-bar beat exports its form', () => {
    // Two bars of song, so the machine's own order has somewhere to change.
    const song = machineSong();
    song.order = [1, 2];
    const machine = song.machine!;
    // Bar 2 puts the kick on the OFF beats, and the order plays it once bar 1 and
    // once bar 2 — so the file's second bar is the second beat, not the first.
    const bar2 = machine.pads.map((_pad, index) =>
      index === 0 ? [0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100, 0] : new Array(16).fill(0),
    );
    const withBar = withMachineBar(machine, 2, bar2);
    song.machine = setMachineOrder(withBar, [1, 2]);
    const midi = reopened(song);
    const starts = midi.notes.filter((note) => note.channel === DRUM_CHANNEL).map((note) => note.start);
    // Bar 1's four kicks land on 0, 480, 960, 1440; bar 2's on 1920+240, +720, …
    expect(starts).toContain(0);
    expect(starts).toContain(2160);
    // Bar 1's downbeat is still there — the two bars are the two beats, not one.
    expect(starts.filter((tick) => tick === 0)).toHaveLength(1);
  });
});

/** The distinct values in a list, in first-seen order. */
function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
