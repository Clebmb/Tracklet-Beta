/**
 * midi — reading a Standard MIDI File into a song.
 *
 * A `.mid` file is the one thing on this shelf that comes from OUTSIDE: not a
 * sound and not a scale, but somebody else's music, written by another program in
 * another decade. Supporting it is the difference between an app you write songs
 * in and an app you can bring songs TO, and it is the last piece of the far end
 * because it is the only one that is about a FORMAT rather than a sound.
 *
 * ── What a MIDI file is ─────────────────────────────────────────────────────
 * A header chunk ("MThd") saying how many tracks there are and how finely time is
 * divided, then one "MTrk" chunk per track. Inside a track: a stream of events,
 * each prefixed by a DELTA time in ticks — how long since the last one — where a
 * tick is a fraction of a beat. A note is two events, a note-on and a note-off,
 * and everything else (tempo, the track's name, which instrument is playing) is a
 * "meta" event or a program change.
 *
 * ── What this reader does, and deliberately does not ────────────────────────
 * It reads the four things Tracklet has a place for — notes, their velocity,
 * their length, and the tempo — plus the two that make an import sound like the
 * file it came from: each channel's instrument (via its GM program change) and the
 * drum channel's pitch, which picks a drum voice. It ignores everything else,
 * because a filter sweep written for somebody else's synth is not music this app
 * can honour, and pretending otherwise would be worse than dropping it.
 *
 * It never throws. A file that is truncated, mislabelled or from a program that
 * wrote something odd comes back as a list of errors in the same shape every
 * other reader here uses.
 *
 * Phaser-free on purpose, like the rest of `model/`.
 */

import { clampMidi } from './notes';
import {
  clampBpm,
  clampHold,
  clampRowsPerBeat,
  clampVelocity,
  createSong,
  DEFAULT_BPM,
  ensurePattern,
  emptyPattern,
  MAX_PATTERNS,
  ROWS_PER_BEAT,
  setPatternRows,
  setTrackCount,
  tidySongTitle,
  tidyTrackName,
  UNTITLED_TITLE,
  MAX_TRACKS,
  type Song,
} from './song';
import { copyVoice, DEFAULT_VOICE, voiceById, type VoiceParams } from './voice';

/** The MIDI channel (0-based) the General MIDI standard reserves for drums. */
export const DRUM_CHANNEL = 9;

/** The extensions a MIDI file is saved with, lower-cased. */
export const MIDI_FILE_EXTENSIONS: readonly string[] = ['.mid', '.midi'];

/** One note, as a file wrote it: when it starts, how long it lasts, how hard. */
export interface MidiNote {
  /** The channel it was on, 0..15. */
  channel: number;
  /** MIDI pitch, 0..127. */
  note: number;
  /** Velocity, 1..127 (a note-on with velocity 0 is a note-off). */
  velocity: number;
  /** Start time, in ticks. */
  start: number;
  /** Length, in ticks. */
  length: number;
}

/** A MIDI file, reduced to the handful of facts a song can use. */
export interface MidiFile {
  /** Ticks per quarter note, from the header. */
  ppq: number;
  /** The first tempo, in beats per minute (120 when the file says nothing). */
  bpm: number;
  /** The first track name the file carries, or null. */
  title: string | null;
  /** Every note, in the order the file closed them. */
  notes: MidiNote[];
  /** How many `MTrk` chunks the file had. */
  trackCount: number;
  /** The last program change on each channel (0..127), or -1 for none. */
  programs: number[];
}

export type MidiRead =
  | { ok: true; midi: MidiFile }
  | { ok: false; errors: string[] };

export interface MidiSummary {
  /** How many Tracklet channels the import made. */
  tracks: number;
  /** How many patterns (bars) it filled. */
  patterns: number;
  /** Rows in each pattern. */
  steps: number;
  /** How many notes landed in the song. */
  notes: number;
  /** How many notes there was no room for, and were dropped. */
  dropped: number;
  bpm: number;
}

export type MidiImport =
  | { ok: true; song: Song; summary: MidiSummary }
  | { ok: false; errors: string[] };

// --- reading ----------------------------------------------------------------

/** Thrown when the bytes run out or a length is nonsense; caught at the top. */
class MidiError extends Error {}

/**
 * A cursor over the file's bytes, big-endian, that refuses to read past the end.
 *
 * Every read is bounds-checked because the input is a file somebody else wrote:
 * a truncated download is the normal case, not the exceptional one, and the
 * alternative is an index out of range in the middle of a parse.
 */
class Reader {
  private pos = 0;

  constructor(private readonly bytes: Uint8Array, private readonly end = bytes.length) {}

  get remaining(): number { return this.end - this.pos; }

  private need(count: number): void {
    if (this.pos + count > this.end) throw new MidiError('the file ends in the middle of an event.');
  }

  peek(): number | null {
    if (this.remaining <= 0) return null;
    return this.bytes[this.pos];
  }

  u8(): number {
    this.need(1);
    return this.bytes[this.pos++];
  }

  u16(): number {
    this.need(2);
    const value = (this.bytes[this.pos] << 8) | this.bytes[this.pos + 1];
    this.pos += 2;
    return value;
  }

  u32(): number {
    this.need(4);
    const value = ((this.bytes[this.pos] << 24) | (this.bytes[this.pos + 1] << 16)
      | (this.bytes[this.pos + 2] << 8) | this.bytes[this.pos + 3]) >>> 0;
    this.pos += 4;
    return value;
  }

  ascii(count: number): string {
    this.need(count);
    let text = '';
    for (let i = 0; i < count; i++) text += String.fromCharCode(this.bytes[this.pos + i]);
    this.pos += count;
    return text;
  }

  skip(count: number): void {
    if (count < 0) throw new MidiError('a chunk declared a negative length.');
    this.need(count);
    this.pos += count;
  }

  /** A variable-length quantity: up to four 7-bit groups, high bit = "more". */
  varlen(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new MidiError('a variable-length number ran on past four bytes.');
  }

  /** A sub-reader over the next `length` bytes, for one track chunk. */
  slice(length: number): Reader {
    if (length < 0) throw new MidiError('a chunk declared a negative length.');
    this.need(length);
    const view = new Reader(this.bytes, this.pos + length);
    view.pos = this.pos;
    this.pos += length;
    return view;
  }
}

/** An open note, waiting for its note-off. */
interface Held { start: number; velocity: number; }

/**
 * Read one track chunk's events into `out`, pairing note-ons with note-offs.
 *
 * The pairing is a map rather than a queue because a channel can hold several
 * notes at once — a chord is exactly that — and each one ends on its own. A note
 * left open when the track runs out is closed at the last tick, which is what a
 * file that forgot its note-off means.
 */
function readTrack(track: Reader, midi: MidiFile): number {
  const held = new Map<number, Held[]>();
  let tick = 0;
  let running = 0;

  // A note is identified by its channel AND its pitch, because the same pitch can
  // be ringing on two channels at once and each has its own note-off.
  const key = (channel: number, pitch: number): number => channel * 128 + pitch;

  const close = (channel: number, pitch: number, at: number): void => {
    const open = held.get(key(channel, pitch))?.pop();
    if (!open) return;
    midi.notes.push({
      channel,
      note: pitch,
      velocity: open.velocity,
      start: open.start,
      length: Math.max(1, at - open.start),
    });
  };

  while (track.remaining > 0) {
    tick += track.varlen();
    const first = track.peek();
    if (first === null) break;
    let status: number;
    if (first >= 0x80) {
      status = track.u8();
      // Running status: a channel message remembers its status byte, and the next
      // event may leave it out. Meta and sysex events never become running status.
      if (status < 0xf0) running = status;
    } else {
      status = running;
    }
    if (status === 0) throw new MidiError('an event used running status before any status byte.');

    if (status === 0xff) {
      const type = track.u8();
      const length = track.varlen();
      if (type === 0x51 && length === 3) {
        const micros = (track.u8() << 16) | (track.u8() << 8) | track.u8();
        if (midi.bpm === 0 && micros > 0) midi.bpm = clampBpm(60_000_000 / micros);
      } else if (type === 0x03 && midi.title === null) {
        let text = '';
        for (let i = 0; i < length; i++) text += String.fromCharCode(track.u8());
        midi.title = text;
      } else {
        track.skip(length);
      }
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      track.skip(track.varlen());
      continue;
    }

    const kind = status & 0xf0;
    const ch = status & 0x0f;
    if (kind === 0x80 || kind === 0x90) {
      const pitch = track.u8();
      const velocity = track.u8();
      if (kind === 0x90 && velocity > 0) {
        const slot = key(ch, pitch);
        const stack = held.get(slot) ?? [];
        stack.push({ start: tick, velocity });
        held.set(slot, stack);
      } else {
        close(ch, pitch, tick);
      }
    } else if (kind === 0xa0 || kind === 0xb0 || kind === 0xe0) {
      track.skip(2);
    } else if (kind === 0xc0) {
      midi.programs[ch] = track.u8();
    } else if (kind === 0xd0) {
      track.skip(1);
    } else {
      throw new MidiError(`an event had an unknown status byte (0x${status.toString(16)}).`);
    }
  }

  // Anything still open was left without a note-off: close it at the last tick.
  for (const [slot, stack] of held) {
    const channel = Math.floor(slot / 128);
    const pitch = slot % 128;
    for (const open of stack) {
      midi.notes.push({
        channel,
        note: pitch,
        velocity: open.velocity,
        start: open.start,
        length: Math.max(1, tick - open.start),
      });
    }
  }
  return tick;
}

/**
 * Read the bytes of a `.mid` file.
 *
 * One pass over the header, then one over each track. The reader tolerates the
 * two things real files do that the spec frowns on — more or fewer chunks than
 * the header promised — because a file that opens is worth more than a file that
 * is refused for a number nobody checks.
 */
export function readMidi(bytes: ArrayBuffer | Uint8Array): MidiRead {
  try {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (data.length < 14) return { ok: false, errors: ['this file is too small to be a MIDI file.'] };
    const reader = new Reader(data);

    if (reader.ascii(4) !== 'MThd') {
      return { ok: false, errors: ['this is not a MIDI file: it does not start with "MThd".'] };
    }
    const headerLength = reader.u32();
    if (headerLength < 6) return { ok: false, errors: ['the MIDI header is too short to be read.'] };
    const format = reader.u16();
    const declaredTracks = reader.u16();
    const division = reader.u16();
    if ((division & 0x8000) !== 0) {
      return { ok: false, errors: ['this MIDI file uses SMPTE time (frames), which Tracklet cannot read. Re-export it with musical time.'] };
    }
    if (division === 0) return { ok: false, errors: ['the MIDI file divides time into zero ticks per beat.'] };
    reader.skip(headerLength - 6);

    const midi: MidiFile = {
      ppq: division,
      bpm: 0,
      title: null,
      notes: [],
      trackCount: 0,
      programs: new Array<number>(16).fill(-1),
    };

    // Every track is read through the same pass; the `channel` argument is only a
    // hint, because the events themselves carry their channel.
    while (reader.remaining >= 8) {
      const tag = reader.ascii(4);
      const length = reader.u32();
      if (tag !== 'MTrk') { reader.skip(length); continue; }
      midi.trackCount++;
      readTrack(reader.slice(length), midi);
    }

    if (declaredTracks === 0) return { ok: false, errors: ['the MIDI file declares no tracks.'] };
    if (format > 2) return { ok: false, errors: [`this MIDI file is format ${format}, which Tracklet does not know (0, 1 and 2 are).`] };
    if (midi.notes.length === 0) return { ok: false, errors: ['this MIDI file has no notes in it.'] };
    if (midi.bpm === 0) midi.bpm = DEFAULT_BPM;
    // A stray character in a track name is common; trim it the way a typed title
    // would be, and let the caller fall back to the file's own name.
    midi.title = midi.title === null ? null : midi.title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || null;
    return { ok: true, midi };
  } catch (error) {
    const message = error instanceof MidiError ? error.message : 'the MIDI file could not be read.';
    return { ok: false, errors: [message] };
  }
}

// --- converting to a song ---------------------------------------------------

/** Rows in each imported pattern: one bar, at Tracklet's four steps per beat. */
const BAR_STEPS = ROWS_PER_BEAT * 4;

/**
 * A GM program (0..127) as the Tracklet voice that plays it best.
 *
 * General MIDI groups its 128 instruments into sixteen families, and each family
 * is a reasonable guess at the sound somebody meant — an organ is an organ, a
 * string ensemble is a pad, a slap bass is a bass. It is a guess, and a loose one,
 * but the alternative is an imported song where every part is a square wave, and
 * a wrong guess here is one click in the `F4` menu away from right.
 */
export function voiceForProgram(program: number): string {
  if (program < 0) return 'lead';
  if (program < 8) return 'glass';        // piano
  if (program < 16) return 'bell';        // chromatic percussion
  if (program < 24) return 'organ';       // organ
  if (program < 32) return 'pluck';       // guitar
  if (program < 40) return 'bass';        // bass
  if (program < 56) return 'strings';     // strings and ensembles
  if (program < 64) return 'lead';        // brass
  if (program < 72) return 'flute';       // reed
  if (program < 80) return 'flute';       // pipe
  if (program < 88) return 'lead';        // synth lead
  if (program < 96) return 'pad';         // synth pad
  if (program < 112) return 'glass';      // effects, ethnic, percussive
  return 'hat';                           // sound effects
}

/** A drum pitch as one of the three percussion voices Tracklet has. */
export function drumVoiceFor(pitch: number): string {
  if (pitch < 38) return 'kick';   // 35/36 kick, and the low toms
  if (pitch <= 40) return 'snare'; // 38/39/40
  return 'hat';                    // hats, cymbals and the high toms
}

/** One channel's worth of the import: a name, a sound and the notes on it. */
interface MidiGroup {
  name: string;
  voice: VoiceParams;
  notes: MidiNote[];
}

function voiceParamsNamed(id: string): VoiceParams {
  const voice = voiceById(id);
  return voice ? copyVoice(voice.params) : { ...DEFAULT_VOICE };
}

/** The length a channel should hold, as the MEDIAN of its notes, in steps. */
function medianHold(notes: readonly MidiNote[], ticksPerStep: number): number {
  const lengths = notes.map((note) => Math.max(1, Math.round(note.length / ticksPerStep))).sort((a, b) => a - b);
  const middle = lengths[Math.floor(lengths.length / 2)];
  return clampHold(middle);
}

/**
 * Turn a MIDI file into a song.
 *
 * The mapping is the whole feature, so it is worth saying plainly:
 *
 *   • each melodic MIDI CHANNEL becomes a Tracklet channel, named after the
 *     channel and given the voice its GM instrument suggests (see
 *     `voiceForProgram`);
 *   • the DRUM channel becomes up to three channels — kick, snare and hat — so a
 *     groove arrives as the three parts a groove is made of rather than as one
 *     part played on wrong instruments;
 *   • a note's start is QUANTIZED to the nearest step of a sixteen-step bar, and
 *     its VELOCITY is scaled from 0–127 to 0–100;
 *   • a channel's `hold` is the median of its notes' lengths, because that is the
 *     one place Tracklet keeps a length and a file's notes vary;
 *   • one bar of sixteen steps becomes one PATTERN, and the bar order plays them
 *     in sequence.
 *
 * Whatever does not fit — a file longer than sixty-four bars, or wider than eight
 * channels — is dropped and COUNTED, so the caller can say so rather than leaving
 * a silent gap.
 */
export function songFromMidi(bytes: ArrayBuffer | Uint8Array, name = ''): MidiImport {
  const read = readMidi(bytes);
  if (!read.ok) return read;
  const midi = read.midi;

  const ticksPerStep = midi.ppq / ROWS_PER_BEAT;
  const lastTick = midi.notes.reduce((end, note) => Math.max(end, note.start + note.length), 0);
  const wantedBars = Math.max(1, Math.ceil(lastTick / ticksPerStep / BAR_STEPS));
  const bars = Math.min(MAX_PATTERNS, wantedBars);

  // Group the notes: melodic channels in channel order, then the drum channel
  // split into its parts.
  const groups: MidiGroup[] = [];
  const melodic = new Map<number, MidiNote[]>();
  const drums: MidiNote[] = [];
  for (const note of midi.notes) {
    if (note.channel === DRUM_CHANNEL) { drums.push(note); continue; }
    const list = melodic.get(note.channel) ?? [];
    list.push(note);
    melodic.set(note.channel, list);
  }
  // Reserve room for the drum parts, so a wide file does not lose its groove.
  const drumParts = drums.length === 0 ? 0 : Math.min(3, new Set(drums.map((note) => drumVoiceFor(note.note))).size);
  const melodicBudget = Math.max(1, MAX_TRACKS - drumParts);
  for (const [channel, notes] of [...melodic.entries()].sort((a, b) => a[0] - b[0])) {
    if (groups.length >= melodicBudget) break;
    groups.push({ name: `CH ${channel + 1}`, voice: voiceParamsNamed(voiceForProgram(midi.programs[channel] ?? -1)), notes });
  }
  if (drums.length > 0) {
    for (const id of ['kick', 'snare', 'hat']) {
      const notes = drums.filter((note) => drumVoiceFor(note.note) === id);
      if (notes.length === 0) continue;
      if (groups.length >= MAX_TRACKS) break;
      groups.push({ name: id.toUpperCase(), voice: voiceParamsNamed(id), notes });
    }
  }
  if (groups.length === 0) return { ok: false, errors: ['none of the MIDI file\u2019s channels could be mapped to a Tracklet channel.'] };

  const song = createSong();
  song.title = tidySongTitle(midi.title ? midi.title.slice(0, 32) : stemOf(name) ?? UNTITLED_TITLE);
  song.bpm = midi.bpm;
  song.rowsPerBeat = clampRowsPerBeat(ROWS_PER_BEAT);
  setTrackCount(song, groups.length);
  setPatternRows(song, BAR_STEPS);
  song.patterns = Array.from({ length: bars }, (_, i) => emptyPattern(`BAR ${i + 1}`, BAR_STEPS, groups.length));
  song.order = Array.from({ length: bars }, (_, i) => i + 1);

  let placed = 0;
  let dropped = 0;
  const totalSteps = bars * BAR_STEPS;
  groups.forEach((group, track) => {
    const channel = song.tracks[track];
    channel.name = tidyTrackName(group.name);
    channel.voice = copyVoice(group.voice);
    channel.hold = medianHold(group.notes, ticksPerStep);
    for (const note of group.notes) {
      const step = Math.round(note.start / ticksPerStep);
      if (step >= totalSteps) { dropped++; continue; }
      const pattern = ensurePattern(song, Math.floor(step / BAR_STEPS) + 1);
      const cell = pattern.steps[step % BAR_STEPS][track];
      const velocity = clampVelocity(Math.round((note.velocity / 127) * 100));
      // Two notes landing on one step: the louder wins, because a step can hold
      // one note and the accent is the more useful of the two to keep.
      if (cell.note === null || velocity > cell.velocity) {
        cell.note = clampMidi(note.note);
        cell.velocity = velocity;
      }
      placed++;
    }
  });

  return {
    ok: true,
    song,
    summary: { tracks: groups.length, patterns: bars, steps: BAR_STEPS, notes: placed, dropped, bpm: song.bpm },
  };
}

/** The title a file name suggests: `my song.mid` -> `MY SONG`. */
function stemOf(name: string): string | null {
  const stem = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return stem === '' ? null : stem.toUpperCase();
}
