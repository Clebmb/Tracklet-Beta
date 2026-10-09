import { describe, expect, it } from 'vitest';

import {
  drumVoiceFor,
  MIDI_FILE_EXTENSIONS,
  readMidi,
  songFromMidi,
  voiceForProgram,
} from '../model/midi';
import { voiceNameFor } from '../model/voice';
import { midiToNoteName } from '../model/notes';

/**
 * The MIDI reader, and the mapping from a file to a song.
 *
 * A `.mid` is binary and comes from outside, so two things matter more than the
 * happy path: the reader must pair note-ons with note-offs CORRECTLY (a chord, a
 * repeated pitch and running status are all places to get it wrong), and it must
 * never throw — a truncated or mislabelled file is an error list, not a crash.
 * The mapping is then checked for the promises it makes: chords per channel, drums
 * as three parts, velocity scaled, notes quantized to a step, and anything that
 * does not fit counted rather than silently lost.
 */

// --- building MIDI bytes by hand --------------------------------------------

/** A variable-length quantity, the way a file writes a delta time. */
function varlen(value: number): number[] {
  const out = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    out.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return out;
}

function chunk(tag: string, data: number[]): number[] {
  const length = data.length;
  return [
    ...[...tag].map((c) => c.charCodeAt(0)),
    (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff,
    ...data,
  ];
}

function header(format: number, tracks: number, division: number): number[] {
  return chunk('MThd', [
    (format >>> 8) & 0xff, format & 0xff,
    (tracks >>> 8) & 0xff, tracks & 0xff,
    (division >>> 8) & 0xff, division & 0xff,
  ]);
}

const END = [0, 0xff, 0x2f, 0x00];
const PPQ = 480;

function on(delta: number, channel: number, pitch: number, velocity: number): number[] {
  return [...varlen(delta), 0x90 | channel, pitch, velocity];
}
function off(delta: number, channel: number, pitch: number, velocity = 64): number[] {
  return [...varlen(delta), 0x80 | channel, pitch, velocity];
}
function program(delta: number, channel: number, value: number): number[] {
  return [...varlen(delta), 0xc0 | channel, value];
}
function tempo(delta: number, microsPerQuarter: number): number[] {
  return [...varlen(delta), 0xff, 0x51, 0x03, (microsPerQuarter >> 16) & 0xff, (microsPerQuarter >> 8) & 0xff, microsPerQuarter & 0xff];
}
function name(delta: number, text: string): number[] {
  return [...varlen(delta), 0xff, 0x03, text.length, ...[...text].map((c) => c.charCodeAt(0))];
}
function track(...events: number[][]): number[] {
  return chunk('MTrk', [...events.flat(), ...END]);
}
function bytes(...parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}

function file(...tracks: number[][]): Uint8Array {
  return bytes(header(1, tracks.length, PPQ), ...tracks);
}

// --- reading ----------------------------------------------------------------

describe('reading a MIDI file', () => {
  it('reads the header, the tempo, the name and the notes', () => {
    const read = readMidi(file(track(
      tempo(0, 500_000),                 // 120 BPM
      name(0, 'MY TUNE'),
      program(0, 0, 40),                 // a string ensemble
      on(0, 0, 60, 100),
      off(480, 0, 60),                   // a quarter note long
      on(0, 0, 64, 64),
      off(240, 0, 64),                   // an eighth
    )));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const { midi } = read;
    expect(midi.ppq).toBe(PPQ);
    expect(midi.bpm).toBe(120);
    expect(midi.title).toBe('MY TUNE');
    expect(midi.trackCount).toBe(1);
    expect(midi.programs[0]).toBe(40);
    expect(midi.notes).toHaveLength(2);
    const first = midi.notes.find((n) => n.note === 60)!;
    expect(first).toMatchObject({ channel: 0, velocity: 100, start: 0, length: 480 });
    const second = midi.notes.find((n) => n.note === 64)!;
    expect(second).toMatchObject({ velocity: 64, start: 480, length: 240 });
  });

  it('pairs a chord, a repeated pitch and running status correctly', () => {
    // Three notes at once, then the same pitch again while an earlier one is still
    // open. A note-off closes the MOST RECENT note-on for that pitch, so the two
    // 64s come out at 240 and 480 ticks rather than both the same.
    const read = readMidi(file(track(
      on(0, 0, 60, 80),
      on(0, 0, 64, 90),
      on(0, 0, 67, 100),
      // Running status: no status byte at all before these two data bytes.
      [0, 64, 64],
      off(120, 0, 67),
      off(120, 0, 64),                   // the SECOND 64, one is still open
      off(120, 0, 60),
      off(120, 0, 64),                   // closes the first 64
    )));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const { notes } = read.midi;
    expect(notes).toHaveLength(4);
    const sixtyFour = notes.filter((n) => n.note === 64).sort((a, b) => a.start - b.start);
    expect(sixtyFour).toHaveLength(2);
    expect(sixtyFour[0]).toMatchObject({ start: 0, length: 240 });
    expect(sixtyFour[1]).toMatchObject({ start: 0, length: 480 });
    expect(notes.find((n) => n.note === 67)).toMatchObject({ start: 0, length: 120 });
  });

  it('treats a note-on with velocity zero as a note-off', () => {
    const read = readMidi(file(track(
      on(0, 0, 60, 100),
      on(200, 0, 60, 0),                 // the "note off" most files actually write
    )));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.midi.notes).toHaveLength(1);
    expect(read.midi.notes[0]).toMatchObject({ note: 60, length: 200 });
  });

  it('closes a note the file forgot to end, at the last tick', () => {
    const read = readMidi(file(track(on(0, 0, 60, 100))));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.midi.notes).toHaveLength(1);
    expect(read.midi.notes[0].length).toBeGreaterThan(0);
  });

  it('defaults the tempo to 120 when the file never says', () => {
    const read = readMidi(file(track(on(0, 0, 60, 100), off(120, 0, 60))));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.midi.bpm).toBe(120);
  });
});

describe('refusing a file that is not one', () => {
  function refusal(data: Uint8Array): string {
    const result = readMidi(data);
    expect(result.ok).toBe(false);
    return result.ok ? '' : result.errors.join(' ');
  }

  it('says so when the bytes are not a MIDI file', () => {
    expect(refusal(new Uint8Array([...'not a midi file at all, sorry'].map((c) => c.charCodeAt(0))))).toContain('MThd');
  });

  it('refuses a file that ends in the middle of an event', () => {
    const full = file(track(on(0, 0, 60, 100), off(480, 0, 60)));
    expect(refusal(full.slice(0, full.length - 6))).toContain('ends in the middle');
  });

  it('refuses SMPTE time, which is frames rather than beats', () => {
    const smpte = bytes(header(1, 1, 0xe728), track(on(0, 0, 60, 100), off(10, 0, 60)));
    expect(refusal(smpte)).toContain('SMPTE');
  });

  it('refuses a file with no notes', () => {
    expect(refusal(file(track(tempo(0, 500_000))))).toContain('no notes');
  });

  it('refuses a format it does not know', () => {
    const weird = bytes(header(9, 1, PPQ), track(on(0, 0, 60, 100), off(120, 0, 60)));
    expect(refusal(weird)).toContain('format');
  });
});

// --- mapping ----------------------------------------------------------------

describe('mapping a MIDI file to a song', () => {
  it('gives each channel a track, a name and the voice its instrument suggests', () => {
    const result = songFromMidi(file(
      track(program(0, 0, 35), on(0, 0, 40, 100), off(480, 0, 40)),   // a bass
      track(program(0, 1, 48), on(0, 1, 60, 100), off(480, 1, 60)),   // strings
    ), 'my song.mid');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { song, summary } = result;
    expect(summary.tracks).toBe(2);
    expect(song.tracks[0].name).toBe('CH 1');
    expect(voiceNameFor(song.tracks[0].voice)).toBe('bass');
    expect(song.tracks[1].name).toBe('CH 2');
    expect(voiceNameFor(song.tracks[1].voice)).toBe('strings');
    expect(summary.notes).toBe(2);
    expect(song.patterns[0].steps.length).toBe(16);
    expect(song.order).toEqual([1]);
  });

  it('splits the drum channel into kick, snare and hat', () => {
    const result = songFromMidi(file(track(
      on(0, 9, 36, 100), on(0, 9, 38, 90), on(0, 9, 42, 70),
      off(120, 9, 36), off(0, 9, 38), off(0, 9, 42),
    )));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { song, summary } = result;
    expect(summary.tracks).toBe(3);
    expect(song.tracks.map((t) => t.name)).toEqual(['KICK', 'SNARE', 'HAT']);
    expect(song.tracks.map((t) => voiceNameFor(t.voice))).toEqual(['kick', 'snare', 'hat']);
    // Each part lands on its own channel, all on the first step.
    expect(song.patterns[0].steps[0][0].note).not.toBeNull();
    expect(song.patterns[0].steps[0][1].note).not.toBeNull();
    expect(song.patterns[0].steps[0][2].note).not.toBeNull();
  });

  it('quantizes starts to a step, scales velocity and keeps the bar structure', () => {
    // ppq 480 at four steps per beat = 120 ticks a step.
    const result = songFromMidi(file(track(
      tempo(0, 545_454),                 // ~110 BPM
      on(0, 0, 60, 127),
      off(120, 0, 60),
      // Step 20 is bar 2 (16 steps a bar), row 4.
      on(120 * 20, 0, 62, 64),
      off(120, 0, 62),
      // A long note: 480 ticks = 4 steps, which becomes the channel's hold.
      on(0, 0, 65, 100),
      off(480, 0, 65),
    )), 'unused');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { song, summary } = result;
    expect(summary.bpm).toBe(110);
    expect(summary.patterns).toBe(2);
    expect(song.order).toEqual([1, 2]);
    // Velocity 127 -> 100, 64 -> 50.
    expect(song.patterns[0].steps[0][0]).toMatchObject({ note: 60, velocity: 100 });
    expect(song.patterns[1].steps[5][0]).toMatchObject({ note: 62, velocity: 50 });
    // The median note length of the three (1, 1, 4 steps) is 1.
    expect(song.tracks[0].hold).toBe(1);
    expect(song.title).toBe('UNUSED');
  });

  it('holds the median note length when a channel mostly plays long notes', () => {
    const events: number[][] = [];
    for (let i = 0; i < 3; i++) {
      events.push(on(0, 0, 60, 100), off(480 * 2, 0, 60));     // 8 steps
    }
    events.push(on(0, 0, 62, 100), off(120, 0, 62));           // 1 step
    const result = songFromMidi(file(track(...events)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].hold).toBe(8);
  });

  it('counts the notes that did not fit rather than losing them silently', () => {
    // 64 bars is 1024 steps; a note at tick 120 * 1200 is past that.
    const result = songFromMidi(file(track(
      on(0, 0, 60, 100), off(120, 0, 60),
      on(120 * 1200, 0, 62, 100), off(120, 0, 62),
    )));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.patterns).toBeLessThanOrEqual(64);
    expect(result.summary.dropped).toBe(1);
    expect(result.summary.notes).toBe(1);
  });

  it('names the song from the track, or from the file name when the track is silent', () => {
    const named = songFromMidi(file(track(name(0, 'From The File'), on(0, 0, 60, 100), off(120, 0, 60))));
    expect(named.ok && named.song.title).toBe('FROM THE FILE');
    const unnamed = songFromMidi(file(track(on(0, 0, 60, 100), off(120, 0, 60))), 'my_cool_song.mid');
    expect(unnamed.ok && unnamed.song.title).toBe('MY COOL SONG');
  });

  it('keeps the loudest note when two land on one step', () => {
    const result = songFromMidi(file(track(
      on(0, 0, 60, 40),
      on(10, 0, 67, 120),                // quantizes to the same step, louder
      off(120, 0, 60),
      off(120, 0, 67),
    )));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cell = result.song.patterns[0].steps[0][0];
    expect(cell.note).toBe(67);
    expect(cell.velocity).toBe(Math.round((120 / 127) * 100));
  });

  it('uses the same equal-tempered default it always did', () => {
    const result = songFromMidi(file(track(on(0, 0, 60, 100), off(120, 0, 60))));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tuning).toBe('equal');
    expect(midiToNoteName(result.song.patterns[0].steps[0][0].note!)).toBe('C-4');
  });
});

describe('the instrument and drum maps', () => {
  it('places each GM family at a sensible voice', () => {
    expect(voiceForProgram(-1)).toBe('lead');
    expect(voiceForProgram(0)).toBe('glass');    // piano
    expect(voiceForProgram(35)).toBe('bass');
    expect(voiceForProgram(48)).toBe('strings');
    expect(voiceForProgram(88)).toBe('pad');
    expect(voiceForProgram(120)).toBe('hat');
  });

  it('places a drum pitch at one of the three parts', () => {
    expect(drumVoiceFor(35)).toBe('kick');
    expect(drumVoiceFor(38)).toBe('snare');
    expect(drumVoiceFor(42)).toBe('hat');
    expect(drumVoiceFor(49)).toBe('hat');
  });

  it('knows the extensions a MIDI file uses', () => {
    expect(MIDI_FILE_EXTENSIONS).toContain('.mid');
    expect(MIDI_FILE_EXTENSIONS).toContain('.midi');
  });
});
