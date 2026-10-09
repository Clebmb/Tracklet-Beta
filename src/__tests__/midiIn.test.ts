import { describe, expect, it } from 'vitest';

import {
  applyScript,
  BPM_MAX,
  BPM_MIN,
  createSong,
  decodeMidiIn,
  DEFAULT_MIDI_MODE,
  MIDI_ALL_NOTES_OFF,
  MIDI_MODES,
  MIDI_PULSE_MAX_MS,
  MIDI_TEMPO_WINDOW,
  midiModeAbout,
  midiModeLabel,
  midiRowLabel,
  midiStatusAbout,
  nextMidiMode,
  patternRows,
  placeLiveNote,
  tempoFromPulses,
  velocityFromMidi,
  type MidiMode,
  type MidiStatus,
  type Song,
} from '../model';

/**
 * MIDI arriving at a running app: notes from a keyboard, and a clock.
 *
 * `midi.test.ts` is the file reader — somebody's finished music arriving as
 * bytes. This is the live end: three-byte messages from a device, the tempo a
 * clock implies, and the one write that turns a performance into a bar. The
 * parts that touch no browser are all here, which is deliberately most of it.
 */

/** A song whose order plays, so `placeLiveNote` has somewhere to land. */
function playing(source = 'tracks 1\nsteps 16\nnote 0 1 C-4'): Song {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' | '));
  return result.song;
}

const bytes = (...data: number[]): number[] => data;

describe('decoding a MIDI message', () => {
  it('reads a note-on, and turns a zero velocity into the note-off it means', () => {
    expect(decodeMidiIn(bytes(0x90, 60, 100))).toEqual({ kind: 'noteOn', channel: 0, note: 60, velocity: 100 });
    // Channel 5, and the running-status convention every synth uses.
    expect(decodeMidiIn(bytes(0x95, 64, 1))).toEqual({ kind: 'noteOn', channel: 5, note: 64, velocity: 1 });
    expect(decodeMidiIn(bytes(0x90, 60, 0))).toEqual({ kind: 'noteOff', channel: 0, note: 60 });
    expect(decodeMidiIn(bytes(0x85, 40, 64))).toEqual({ kind: 'noteOff', channel: 5, note: 40 });
  });

  it('reads the clock and the transport it carries', () => {
    expect(decodeMidiIn(bytes(0xf8))).toEqual({ kind: 'clock' });
    expect(decodeMidiIn(bytes(0xfa))).toEqual({ kind: 'start' });
    expect(decodeMidiIn(bytes(0xfb))).toEqual({ kind: 'continue' });
    expect(decodeMidiIn(bytes(0xfc))).toEqual({ kind: 'stop' });
  });

  it('reads a control change, and names the one that means "all notes off"', () => {
    expect(decodeMidiIn(bytes(0xb0, 7, 100))).toEqual({ kind: 'control', channel: 0, controller: 7, value: 100 });
    expect(decodeMidiIn(bytes(0xb3, MIDI_ALL_NOTES_OFF, 0))).toEqual({ kind: 'allNotesOff', channel: 3 });
    // The same controller with a value is a real message, not a panic.
    expect(decodeMidiIn(bytes(0xb3, MIDI_ALL_NOTES_OFF, 10))).toEqual({ kind: 'control', channel: 3, controller: MIDI_ALL_NOTES_OFF, value: 10 });
  });

  it('reads a program change and a pitch bend', () => {
    expect(decodeMidiIn(bytes(0xc2, 40))).toEqual({ kind: 'program', channel: 2, program: 40 });
    // Two seven-bit bytes, little end first: 8192 is the centre.
    expect(decodeMidiIn(bytes(0xe0, 0, 64))).toEqual({ kind: 'pitchBend', channel: 0, value: 8192 });
  });

  it('answers null for anything this app has no use for, rather than guessing', () => {
    expect(decodeMidiIn(null)).toBeNull();
    expect(decodeMidiIn(undefined)).toBeNull();
    expect(decodeMidiIn([])).toBeNull();
    // A two-byte note-on is a device sending something this app cannot read.
    expect(decodeMidiIn(bytes(0x90, 60))).toBeNull();
    expect(decodeMidiIn(bytes(0xc0))).toBeNull();
    // Aftertouch and sysex are dropped at the door.
    expect(decodeMidiIn(bytes(0xa0, 60, 10))).toBeNull();
    expect(decodeMidiIn(bytes(0xf0, 0x7e, 0x7f))).toBeNull();
    // A data byte is clamped rather than trusted.
    expect(decodeMidiIn(bytes(0x90, 300, 999))).toEqual({ kind: 'noteOn', channel: 0, note: 127, velocity: 127 });
  });
});

describe('a velocity, this way round', () => {
  it('scales 1..127 to 1..100 and never lands on zero', () => {
    expect(velocityFromMidi(127)).toBe(100);
    expect(velocityFromMidi(64)).toBe(50);
    expect(velocityFromMidi(1)).toBe(1);
    // A zero velocity is a note-off and the decoder has already taken it, but a
    // caller that passes one gets the lightest audible note rather than a cell
    // whose velocity says there is no note here.
    expect(velocityFromMidi(0)).toBe(1);
    expect(velocityFromMidi(Number.NaN)).toBe(1);
  });
});

describe('a tempo, measured from a clock', () => {
  /** The gap between pulses at a tempo: 60 seconds over `bpm` quarter notes, over 24. */
  const gapFor = (bpm: number): number => 60000 / (bpm * 24);

  it('turns pulse gaps into a tempo', () => {
    expect(tempoFromPulses(new Array(MIDI_TEMPO_WINDOW).fill(gapFor(120)))).toBe(120);
    expect(tempoFromPulses(new Array(MIDI_TEMPO_WINDOW).fill(gapFor(90)))).toBe(90);
    expect(tempoFromPulses(new Array(MIDI_TEMPO_WINDOW).fill(gapFor(174)))).toBe(174);
  });

  it('takes the MEDIAN, so one late pulse cannot move the tempo', () => {
    const gaps = new Array(MIDI_TEMPO_WINDOW).fill(gapFor(120));
    // One pulse a whole beat late is what a busy USB bus looks like. In a mean it
    // would be a different tempo; in a median it is one value out of twenty-four.
    gaps.push(gapFor(40));
    expect(tempoFromPulses(gaps)).toBe(120);
  });

  it('drops the gaps that are not tempos, so a dropout is not a tempo change', () => {
    // A clock that just started, or just stopped: one enormous gap.
    expect(tempoFromPulses([gapFor(120), gapFor(120), 2000])).toBe(120);
    expect(tempoFromPulses([0.5, gapFor(120), gapFor(120)])).toBe(120);
    // Nothing plausible in the list is nothing to measure, not a tempo of zero.
    expect(tempoFromPulses([])).toBeNull();
    expect(tempoFromPulses([0.1, MIDI_PULSE_MAX_MS + 1])).toBeNull();
  });

  it('clamps to the range a song may hold', () => {
    expect(tempoFromPulses([gapFor(1000)])).toBe(BPM_MAX);
    expect(tempoFromPulses([gapFor(10)])).toBe(BPM_MIN);
  });
});

describe('playing into the grid', () => {
  it('writes a played note at the playhead step, with its velocity', () => {
    const song = playing();
    expect(placeLiveNote(song, 0, 0, 67, 127)).toBe(true);
    const cell = song.patterns[0].steps[0][0];
    expect(cell.note).toBe(67);
    expect(cell.velocity).toBe(100);
  });

  it('follows the ORDER, so a note played in the second bar lands in that bar', () => {
    const song = playing('tracks 1\npattern 1 "A"\nC-4\n.\n.\n.\npattern 2 "B"\n.\n.\n.\n.\norder 2 1');
    // Slot 0 of the order plays bar 2, so the song OPENS on a different bar from
    // the one the grid was written in — which is exactly what makes the order's
    // step-to-bar arithmetic worth asking the model rather than assuming.
    expect(placeLiveNote(song, 0, 0, 62, 64)).toBe(true);
    expect(song.patterns[1].steps[0][0].note).toBe(62);
    // One bar along, the order's second slot plays bar 1.
    expect(placeLiveNote(song, patternRows(song), 0, 65, 64)).toBe(true);
    expect(song.patterns[0].steps[0][0].note).toBe(65);
  });

  it('REPLACES what was in the cell, like typing a note does', () => {
    const song = playing();
    // The script wrote C-4 at step 0; a live take over it is a performance.
    placeLiveNote(song, 0, 0, 60, 64);
    placeLiveNote(song, 0, 0, 72, 64);
    expect(song.patterns[0].steps[0][0].note).toBe(72);
    // And a chord is thinned to the one note just played.
    expect(song.patterns[0].steps[0][0].extra).toEqual([]);
  });

  it('is a no-op when the same note and velocity land again', () => {
    const song = playing();
    placeLiveNote(song, 0, 0, 72, 100);
    expect(placeLiveNote(song, 0, 0, 72, 100)).toBe(false);
    // ...but a different VELOCITY is a change, which is what an accent is.
    expect(placeLiveNote(song, 0, 0, 72, 40)).toBe(true);
    expect(song.patterns[0].steps[0][0].velocity).toBe(31);
  });

  it('refuses a step or a channel the song does not have', () => {
    const song = playing();
    expect(placeLiveNote(song, 0, 7, 60, 100)).toBe(false);
  });
});

describe('the one control', () => {
  it('cycles off, listen, record, and back', () => {
    expect(MIDI_MODES).toEqual(['off', 'listen', 'record']);
    expect(DEFAULT_MIDI_MODE).toBe('off');
    expect(nextMidiMode('off')).toBe('listen');
    expect(nextMidiMode('listen')).toBe('record');
    expect(nextMidiMode('record')).toBe('off');
  });

  it('says what each mode does, in a sentence', () => {
    for (const mode of MIDI_MODES) {
      expect(midiModeLabel(mode).length).toBeGreaterThan(0);
      expect(midiModeAbout(mode).length).toBeGreaterThan(20);
    }
    expect(midiModeLabel('off')).toBe('OFF');
    expect(midiModeLabel('record')).toBe('RECORDING');
  });
});

describe('the row', () => {
  const status = (over: Partial<MidiStatus> = {}): MidiStatus => ({
    mode: 'listen', inputs: 1, device: 'KEYS', synced: false, clockBpm: null, problem: null, ...over,
  });

  it('reads OFF when it is off, whatever else is true', () => {
    expect(midiRowLabel(status({ mode: 'off' }))).toBe('OFF');
  });

  it('says so when the browser gave no input, rather than looking armed', () => {
    expect(midiRowLabel(status({ inputs: 0, device: null }))).toBe('NO INPUT');
    expect(midiRowLabel(status({ problem: 'no Web MIDI' }))).toBe('UNAVAILABLE');
    expect(midiStatusAbout(status({ problem: 'no Web MIDI' })).join(' ')).toContain('no Web MIDI');
    expect(midiStatusAbout(status({ inputs: 0, device: null })).join(' ')).toContain('No MIDI input is connected');
  });

  it('shows the mode, and the tempo it has locked on to', () => {
    expect(midiRowLabel(status())).toBe('LISTENING');
    expect(midiRowLabel(status({ mode: 'record' }))).toBe('RECORDING');
    expect(midiRowLabel(status({ synced: true, clockBpm: 128 }))).toBe('LISTENING  SYNC 128');
    expect(midiStatusAbout(status({ synced: true, clockBpm: 128 })).join(' ')).toContain('follows its tempo');
    expect(midiStatusAbout(status()).join(' ')).toContain('the song follows its tempo');
  });

  it('describes what the mode does and what it is hearing', () => {
    const lines = midiStatusAbout(status({ mode: 'record' }));
    expect(lines[0]).toContain('lands in the bar');
    expect(lines.join(' ')).toContain('KEYS');
  });

  it('is silent about hardware when the mode is off', () => {
    expect(midiStatusAbout(status({ mode: 'off' }))).toHaveLength(1);
  });
});

describe('the mode the app starts in', () => {
  it('is off, so a fresh load asks the browser for nothing', () => {
    const mode: MidiMode = DEFAULT_MIDI_MODE;
    expect(mode).toBe('off');
  });
});
