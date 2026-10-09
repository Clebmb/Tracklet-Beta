/**
 * midiIn — a real keyboard, and a clock: MIDI arriving at a running app.
 *
 * `midi.ts` READS a `.mid` file, which is somebody's finished music arriving as
 * bytes. This is the other direction in time: a person at a keyboard, and the
 * pulses that say where the beat is. It is the last piece of the interop story,
 * and the one that changes how the app FEELS — with a keyboard plugged in,
 * Tracklet stops being a page you type into and becomes something you play.
 *
 * ── What arrives, and what this file does with it ────────────────────────────
 * Web MIDI hands over raw three-byte messages, so the first job is DECODING them:
 * a note-on with velocity 0 is a note-off (the running-status trick every synth
 * uses), a note-on with a real velocity is a note, and the rest — clock, start,
 * stop, continue, control changes, pitch bend, program changes — are words the
 * app either acts on or deliberately ignores. Nothing here touches a song: it
 * answers what a message MEANS, which is the part worth testing without a browser.
 *
 * ── The clock is arithmetic, and it is where the care goes ───────────────────
 * MIDI's clock is 24 pulses per QUARTER NOTE — a tempo-independent heartbeat, so
 * following one means MEASURING it. That measurement is of somebody else's
 * clock, which jitters, so it is the median of the last handful of pulse
 * intervals rather than the last one — a tempo that changed on every pulse would
 * be a strobe, not a sync. A clock also carries the transport (start, stop,
 * continue), which is the other half of what "in sync" means.
 *
 * What the app does NOT do is slave its sample-accurate scheduler to the pulses
 * themselves: playing is scheduled against the audio clock, which is the thing
 * that actually keeps two sounds together. So the tempo is followed and the
 * transport obeys, and the docs say plainly where that stops being exact.
 *
 * ── Why a MODE and not a switch ──────────────────────────────────────────────
 * Listening and RECORDING are different intents: a person may want to hear their
 * keyboard without a stray note landing in the bar. So the app's one control has
 * three stops — off, listen, record — and record only ever writes while the song
 * is PLAYING, at the step the playhead is on, which is what a tracker means by
 * playing into the grid.
 *
 * Phaser-free, audio-free and browser-free, like the rest of `model/`.
 */

import { writeNote } from './editor';
import { clampMidi } from './notes';
import {
  BPM_MAX,
  BPM_MIN,
  clampBpm,
  clampVelocity,
  stepToSlot,
  type Song,
} from './song';

/** MIDI's clock: 24 pulses to every quarter note, which is also a beat here. */
export const MIDI_CLOCK_PPQ = 24;

/** A note-on with at most this velocity is a note-OFF. Every synth does this. */
export const MIDI_VELOCITY_OFF = 0;

/**
 * How many pulse intervals a tempo reading averages over.
 *
 * One beat's worth of pulses: 24 is enough to swallow the jitter of a USB clock
 * and short enough that a real tempo change is followed within a beat.
 */
export const MIDI_TEMPO_WINDOW = 24;

/**
 * A pulse interval outside this many milliseconds is not a tempo, it is a
 * dropout: a cable pulled, a clock stopped, a browser tab asleep. Rejected
 * rather than averaged, because one 2-second gap inside a median would still be
 * harmless, but inside a MEAN it would be a wrong tempo for a beat.
 */
export const MIDI_PULSE_MIN_MS = 2;
export const MIDI_PULSE_MAX_MS = 250;

/**
 * What a MIDI message means, once decoded.
 *
 * A closed list, because it is what the app knows how to act on: everything else
 * a MIDI stream can carry is dropped at the door rather than half-honoured. The
 * `noteOff`/`allNotesOff` cases are here even though a keyboard's note-off only
 * matters for a sounding audition, because a decoder that silently dropped them
 * would be lying about what it read.
 */
export type MidiInMessage =
  | { kind: 'noteOn'; channel: number; note: number; velocity: number }
  | { kind: 'noteOff'; channel: number; note: number }
  | { kind: 'allNotesOff'; channel: number }
  | { kind: 'control'; channel: number; controller: number; value: number }
  | { kind: 'pitchBend'; channel: number; value: number }
  | { kind: 'program'; channel: number; program: number }
  | { kind: 'clock' }
  | { kind: 'start' }
  | { kind: 'continue' }
  | { kind: 'stop' };

/** The status nibbles this decoder knows, as numbers. */
const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL = 0xb0;
const PROGRAM = 0xc0;
const PITCH_BEND = 0xe0;
/** The one control number worth naming: 123 takes every sounding note off. */
export const MIDI_ALL_NOTES_OFF = 123;
const CLOCK_TICK = 0xf8;
const START = 0xfa;
const CONTINUE = 0xfb;
const STOP = 0xfc;

/**
 * Decode one Web MIDI message, or null when this app has no use for it.
 *
 * Never throws and never reads past the data: a device that sends a two-byte
 * message we expected three of comes back as null rather than as a number made
 * out of `undefined`. A note-on at velocity 0 becomes the note-off it means, so
 * no caller has to know that trick.
 */
export function decodeMidiIn(data: ArrayLike<number> | null | undefined): MidiInMessage | null {
  if (data === null || data === undefined || data.length === 0) return null;
  const status = data[0] ?? 0;
  // The SYSTEM messages first: their status byte carries no channel.
  if (status === CLOCK_TICK) return { kind: 'clock' };
  if (status === START) return { kind: 'start' };
  if (status === CONTINUE) return { kind: 'continue' };
  if (status === STOP) return { kind: 'stop' };
  const kind = status & 0xf0;
  const channel = status & 0x0f;
  if (kind === NOTE_ON || kind === NOTE_OFF) {
    if (data.length < 3) return null;
    const note = clampRaw(data[1] ?? 0);
    const velocity = clampRaw(data[2] ?? 0);
    if (kind === NOTE_ON && velocity > MIDI_VELOCITY_OFF) return { kind: 'noteOn', channel, note, velocity };
    return { kind: 'noteOff', channel, note };
  }
  if (kind === CONTROL) {
    if (data.length < 3) return null;
    const controller = clampRaw(data[1] ?? 0);
    const value = clampRaw(data[2] ?? 0);
    if (controller === MIDI_ALL_NOTES_OFF && value === 0) return { kind: 'allNotesOff', channel };
    return { kind: 'control', channel, controller, value };
  }
  if (kind === PROGRAM) {
    if (data.length < 2) return null;
    return { kind: 'program', channel, program: clampRaw(data[1] ?? 0) };
  }
  if (kind === PITCH_BEND) {
    if (data.length < 3) return null;
    // The two data bytes are a signed 14-bit value with 8192 as centre; the app
    // has no bend wheel to spend it on, so it is reported in that raw shape.
    return { kind: 'pitchBend', channel, value: (data[1] ?? 0) | ((data[2] ?? 0) << 7) };
  }
  return null;
}

function clampRaw(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(127, Math.round(value)));
}

/**
 * A MIDI velocity (1..127) as this app's (1..100) — the INVERSE of
 * `midiExport`'s `midiVelocity`, which scales the other way.
 *
 * A note-on is never 0 — a zero is a note-off, and the decoder has already
 * turned it into one — so the floor is 1: a MIDI note that arrives with the
 * lightest possible touch still lands as an audible step rather than as a cell
 * whose velocity says \"there is no note here\".
 */
export function velocityFromMidi(velocity: number): number {
  if (!Number.isFinite(velocity) || velocity <= 0) return 1;
  return Math.max(1, clampVelocity(Math.round((velocity / 127) * 100)));
}

/**
 * A tempo, in BPM, from the gaps between clock pulses — or null when there is
 * nothing to measure yet.
 *
 * The MEDIAN, because a clock is a measurement and measurements jitter: one late
 * pulse from a busy USB bus would move a mean by a whole BPM and a median by
 * nothing. Gaps outside the plausible range are dropped first, so a clock that
 * just started (one huge gap) or just stopped (a huge gap) cannot poison the
 * reading, and the answer is clamped to the tempo range the rest of the app uses.
 */
export function tempoFromPulses(intervalsMs: readonly number[]): number | null {
  const usable = intervalsMs.filter(
    (gap) => Number.isFinite(gap) && gap >= MIDI_PULSE_MIN_MS && gap <= MIDI_PULSE_MAX_MS,
  );
  if (usable.length === 0) return null;
  const sorted = [...usable].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)]!;
  if (middle <= 0) return null;
  // 24 pulses to a quarter note, and a BPM is a quarter note per minute.
  return clampBpm(Math.round(60000 / (middle * MIDI_CLOCK_PPQ)));
}

/** Is a measured tempo within the range a song may hold? */
export function midiTempoPlausible(bpm: number): boolean {
  return bpm >= BPM_MIN && bpm <= BPM_MAX;
}

/**
 * Put a played note into the song at a step, as live recording does.
 *
 * The playhead's step is already the grid's own unit — the engine counts in
 * steps — so the only work is finding WHICH bar that step is in right now (the
 * order decides, and the same bar can appear twice) and writing the cell. The
 * note REPLACES whatever was in the cell, exactly as typing one does: a live
 * take is a performance, and a performance that left yesterday's note under
 * today's would be a cell nobody could read.
 *
 * Returns true when the song changed, like every other write in `editor.ts`, so
 * the caller can decide whether the take needs an undo step.
 */
export function placeLiveNote(song: Song, step: number, track: number, midi: number, velocity: number): boolean {
  const slot = stepToSlot(song, step);
  const pattern = song.patterns[slot.pattern];
  const cell = pattern?.steps[slot.row]?.[track];
  if (!cell) return false;
  const written = writeNote(pattern, slot.row, track, clampMidi(midi));
  const wanted = velocityFromMidi(velocity);
  const changed = written || cell.velocity !== wanted;
  cell.velocity = wanted;
  return changed;
}

// ── the one control: off, listen, record ────────────────────────────────────

/**
 * The three things the app's MIDI control can be doing.
 *
 * `listen` sounds what you play and changes nothing; `record` also writes it
 * into the bar the playhead is on, while the song is running. A mode rather
 * than two switches because the interesting question is not \"is MIDI in\" but
 * \"what is it doing\" — and because a person who arms recording once and forgets
 * it should be able to see that from the row.
 */
export const MIDI_MODES = ['off', 'listen', 'record'] as const;
export type MidiMode = typeof MIDI_MODES[number];
export const DEFAULT_MIDI_MODE: MidiMode = 'off';

/** The next mode in the cycle, wrapping at the end. */
export function nextMidiMode(mode: MidiMode): MidiMode {
  const at = MIDI_MODES.indexOf(mode);
  return MIDI_MODES[(at + 1) % MIDI_MODES.length] ?? DEFAULT_MIDI_MODE;
}

/** How a row or a sentence writes the mode. */
export function midiModeLabel(mode: MidiMode): string {
  switch (mode) {
    case 'listen': return 'LISTENING';
    case 'record': return 'RECORDING';
    default: return 'OFF';
  }
}

/** One line about what a mode does, for the row under the label. */
export function midiModeAbout(mode: MidiMode): string {
  switch (mode) {
    case 'listen':
      return 'What you play sounds on the selected channel. Nothing is written.';
    case 'record':
      return 'What you play sounds AND lands in the bar the playhead is on, on the selected channel, while the song runs.';
    default:
      return 'The app does not ask the browser for a MIDI input.';
  }
}

/**
 * The whole state one row has to show: the mode, the input, and the clock.
 *
 * Kept in the model because it is a SENTENCE about three facts that can disagree
 * — a person who turned recording on and has no keyboard needs to see that the
 * mode is armed and nothing is arriving, which is the difference between a
 * mistake and a missing cable.
 */
export interface MidiStatus {
  mode: MidiMode;
  /** How many inputs the browser listed, 0 when none answered. */
  inputs: number;
  /** The name of the input the spot is on, or null. */
  device: string | null;
  /** True once a clock pulse has arrived recently enough to be followed. */
  synced: boolean;
  /** The tempo the clock is playing at, or null when nothing is measuring. */
  clockBpm: number | null;
  /** Why there is no input — the browser's refusal, or that there is none. */
  problem: string | null;
}

/** A row's label: the mode, and what the app is hearing it from. */
export function midiRowLabel(status: MidiStatus): string {
  if (status.mode === 'off') return 'OFF';
  if (status.problem !== null) return 'UNAVAILABLE';
  if (status.inputs === 0) return 'NO INPUT';
  const clock = status.synced && status.clockBpm !== null ? `  SYNC ${status.clockBpm}` : '';
  return `${midiModeLabel(status.mode)}${clock}`;
}

/** The sentences under the row: what is on, and what is (or is not) arriving. */
export function midiStatusAbout(status: MidiStatus): string[] {
  const lines = [midiModeAbout(status.mode)];
  if (status.mode === 'off') return lines;
  if (status.problem !== null) {
    lines.push(status.problem);
    return lines;
  }
  lines.push(status.inputs === 0
    ? 'No MIDI input is connected. Plug a keyboard in and it will appear here.'
    : `${status.inputs} MIDI input${status.inputs === 1 ? '' : 's'}${status.device === null ? '' : `: ${status.device}`}.`);
  lines.push(status.synced
    ? 'An external clock is arriving, so the song follows its tempo and its start and stop.'
    : 'If the device sends a clock, the song follows its tempo and its start and stop.');
  return lines;
}
