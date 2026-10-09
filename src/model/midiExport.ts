/**
 * midiExport — writing a Standard MIDI File from a song.
 *
 * The other half of `midi.ts`. That file brings somebody else's music IN, and
 * until this one existed the door swung one way only: an app that reads a format
 * and will not write it is a place you visit, not a place you work. What is here
 * is the inverse of the mapping `songFromMidi` documents, note for note, so the
 * two are checked against each other in `src/__tests__/midiExport.test.ts` by
 * exporting a song and reading it straight back.
 *
 * ── What a file carries, and what it cannot ─────────────────────────────────
 * A `.mid` holds NOTES: when one starts, how long it lasts, how hard it was hit,
 * what instrument took it, and what the tempo was. That is the whole list, and it
 * is not a coincidence — it is the intersection of what this app stores and what
 * every other program agrees on. What does NOT cross: the sound itself (layers,
 * the effects, pan, the sends, the room), the feel (`swing`, a channel's
 * `groove` and `humanize`), automation lanes, sections, the pattern names, and a
 * note's SLIDE — which is not a note at all but a way of arriving at one, and
 * which MIDI could only spell as a pitch bend that nothing here models. A
 * STUTTER does cross, because a stutter IS notes: see `placed` below.
 * Those are Tracklet's, and a file that claimed to carry them would be lying to
 * whoever opened it. The exported file is the notes; the song is in the `.json`.
 *
 * ── The three decisions worth knowing ───────────────────────────────────────
 *   • ONE `MTrk` PER CHANNEL that holds a note, after a conductor track. Format
 *     1, which is what every DAW writes and what this app's own reader expects.
 *   • a MONOPHONIC channel's note ends where its next note begins, because that
 *     is what the channel SOUNDS like (see `poly`: a mono channel gives way to
 *     the note that follows it). A polyphonic one keeps its full `hold`, because
 *     that channel really does ring the two together — so the file plays what the
 *     app played rather than an ideal of it.
 *   • a PERCUSSION channel is written to MIDI's drum channel (9), on the General
 *     MIDI pitch for the drum, because a drum part is a drum everywhere else too —
 *     and because that is what makes a drum song survive the round trip.
 *   • the DRUM MACHINE is one more chunk on the drum channel: its grid is not a
 *     channel, but a beat made on it is music in the same song, so each hit is a
 *     short note at the pad's own pitch. This is what lets a machine-only song
 *     export at all — before it, the machine was the one instrument in a song that
 *     wrote silence to a `.mid`.
 *
 * ── A region ───────────────────────────────────────────────────────────────
 * `songToMidi(song, bounce)` writes only a range of BARS, the LOOP REGION the
 * audio exports take too — so "export the chorus" means the same bars whichever
 * writer you point at it — and the file's own clock begins at that bar rather
 * than carrying the song's time up to it. No region means the whole order, which
 * is what every caller before this got.
 *
 * Phaser-free on purpose, like the rest of `model/`.
 */

import { bounceSteps, type BounceRange } from './bounce';
import { clampMidi } from './notes';
import { DRUM_CHANNEL } from './midi';
import { DRUMS, type DrumId } from './drum';
import { articulationHits } from './articulation';
import {
  clampBpm,
  clampHold,
  clampVelocity,
  patternRows,
  rowNotes,
  strumOffsets,
  songTempoAtSlot,
  stepToSlot,
  type Song,
} from './song';
import { sameVoice, VOICES, type VoiceParams } from './voice';
// The machine's PLACEMENT — which pad fires on which song row, with the order,
// the bars, the machine's swing and the song's tempo map all folded in. It lives
// in `audio/` beside the renderer that also needs it, and it is pure (no Web Audio,
// no Phaser), so the writer imports it rather than keeping a second copy of the
// arithmetic that could drift from what the app PLAYS.
import { machineBarsForSong, machineHitsInRange } from '../audio/machine';

/** The extension an exported file is saved with. */
export const MIDI_EXPORT_FILE_EXTENSION = '.mid';

/**
 * Ticks per quarter note, the resolution the writer divides time by.
 *
 * 480 is the number MIDI files have used for thirty years, and it is chosen the
 * way the reader wants it: a fourth of it is 120, so a Tracklet step (a quarter
 * of a beat, on the default grid) is a whole number of ticks and an imported note
 * lands back on the step it left. A coarser 96 would work too; a finer 960 buys
 * nothing this app can express.
 */
export const MIDI_EXPORT_PPQ = 480;

/** The SMF format written: 1, several tracks sharing one timeline. */
export const MIDI_EXPORT_FORMAT = 1;

/**
 * The General MIDI pitch of each of the four percussion voices.
 *
 * Lifted from the kit itself (`drum.ts`), so a drum has ONE pitch in this app and
 * the writer, the reader and a `drum 0 4 kick` line cannot disagree about it. The
 * reader's `drumVoiceFor` is the loose inverse, and the two are tested together:
 * 36 is a kick, 38 and 40 a snare, everything above a hat or a cymbal — so `wind`
 * lands in that last group and a wind channel returns as a hat. That is the closest
 * drum MIDI has to weather, and the one place the round trip loses a name rather
 * than a note.
 */
export const DRUM_PITCHES: Readonly<Record<string, number>> = Object.fromEntries(
  DRUMS.map((drum) => [drum.id, drum.pitch]),
);

/**
 * The GM program each melodic voice is written as.
 *
 * These are the SAME families the reader reads back: a program in the piano range
 * returns as `glass`, a program among the guitars as `pluck`, and so on — which is
 * why `voiceForProgram(gmProgramForVoice(v))` is the voice `v` again for every
 * entry here. `sub` is deliberately `bass`: MIDI has no program for "the same
 * bass, an octave down", so a sub returns as a bass, and that is the better lie
 * than returning as a lead.
 */
export const VOICE_PROGRAMS: Readonly<Record<string, number>> = {
  lead: 81,    // synth lead
  pluck: 24,   // nylon guitar
  bell: 9,     // glockenspiel
  glass: 0,    // acoustic grand
  bass: 33,    // electric bass (finger)
  sub: 33,
  pad: 88,     // pad 1 (new age)
  strings: 48, // string ensemble
  organ: 16,   // drawbar organ
  flute: 73,   // flute
  wind: 119,   // reverse cymbal — the noise end of the sound-effects bank
};

/** What one export produced, for the line the menu puts on screen. */
export interface MidiExportSummary {
  /** How many channel tracks were written, not counting the conductor. */
  tracks: number;
  /** How many notes left the app. */
  notes: number;
  /** How many bars of the order they cover. */
  bars: number;
  /** Ticks per quarter note in the file. */
  ppq: number;
}

export type MidiExport =
  | { ok: true; bytes: Uint8Array; summary: MidiExportSummary }
  | { ok: false; errors: string[] };

// --- the two lookups --------------------------------------------------------

/**
 * The drum pitch a voice is, or `null` for a melodic voice.
 *
 * A voice is a drum here when it is one of the built-in percussion presets, which
 * is the same question `voiceNameFor` answers — and the same one the reader asks
 * when it turns a pitch on channel 9 back into a part.
 */
export function drumPitchForVoice(voice: VoiceParams): number | null {
  for (const preset of VOICES) {
    if (!sameVoice(preset.params, voice)) continue;
    const pitch = DRUM_PITCHES[preset.id];
    if (pitch !== undefined) return pitch;
    break;
  }
  return null;
}

/**
 * The GM program a melodic voice is written as.
 *
 * A voice nobody named — a sound built in `F7`, a `table`, a `formant` — has no
 * program that means it, so it is written as the lead: every program is wrong for
 * a sound somebody designed, and the one that is least wrong is the one that says
 * "this is the melody".
 */
export function gmProgramForVoice(voice: VoiceParams): number {
  for (const preset of VOICES) {
    if (!sameVoice(preset.params, voice)) continue;
    return VOICE_PROGRAMS[preset.id] ?? VOICE_PROGRAMS.lead;
  }
  return VOICE_PROGRAMS.lead;
}

/** A velocity in this app's 0–100 as MIDI's 1–127. */
export function midiVelocity(velocity: number): number {
  // 1 rather than 0: a note-on at velocity 0 IS a note-off, so a silent note
  // written as 0 would arrive as a note of no length at all. The app can hold a
  // velocity of 0; MIDI cannot, and 1 is one step from silent rather than lost.
  return Math.max(1, Math.min(127, Math.round((clampVelocity(velocity) * 127) / 100)));
}

// --- writing the bytes ------------------------------------------------------

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** A variable-length quantity: the delta time every event is prefixed with. */
function varlen(value: number): number[] {
  const out = [value & 0x7f];
  let rest = Math.floor(value / 128);
  while (rest > 0) {
    out.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return out;
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0) & 0x7f);
}

function chunk(tag: string, data: number[]): number[] {
  return [...ascii(tag), ...u32(data.length), ...data];
}

/** A name meta event — `0x03`, the one a reader shows in a track list. */
function nameMeta(text: string): number[] {
  const bytes = ascii(text);
  return [0xff, 0x03, ...varlen(bytes.length), ...bytes];
}

/** The tempo, as microseconds per quarter note, which is how MIDI counts it. */
function tempoMeta(bpm: number): number[] {
  const micros = Math.round(60_000_000 / clampBpm(bpm));
  return [0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff];
}

/** The bar, as `numerator/4` — one app beat is a quarter note by construction. */
function timeSignatureMeta(beatsPerBar: number): number[] {
  return [0xff, 0x58, 0x04, beatsPerBar & 0xff, 0x02, 24, 8];
}

/** One event, waiting to be written: when, what, and in what order at that tick. */
interface Timed {
  tick: number;
  /**
   * 0 for a note-off or a meta event, 1 for a note-on.
   *
   * Two events at the same tick have to be written in an order, and the order is
   * not decoration: a note-off has to come BEFORE the note-on that re-states the
   * same pitch, or a reader pairs the two the wrong way round and the first note
   * comes back several steps long.
   */
  order: number;
  bytes: number[];
}

function trackChunk(events: Timed[]): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data: number[] = [];
  let tick = 0;
  for (const event of sorted) {
    data.push(...varlen(Math.max(0, event.tick - tick)), ...event.bytes);
    tick = Math.max(tick, event.tick);
  }
  data.push(0, 0xff, 0x2f, 0x00);
  return chunk('MTrk', data);
}

// --- the song, as a file ----------------------------------------------------

/** One note, placed on the step of the ORDER it sounds on. */
interface PlacedNote {
  /** Which step of `songSteps(song)` it starts on. */
  step: number;
  /**
   * How far into that step it begins, as a fraction of the channel's hold — `0`
   * for every note but the second and later hits of a STUTTER.
   */
  at: number;
  /**
   * How much of the channel's hold it lasts, as a fraction: `1` for a plain
   * note, `1/N` for one of N stutter hits.
   *
   * Fractions rather than ticks because the note's length is the channel's
   * `hold`, which is not known until the channel is, and because the scheduler
   * and the renderer measure the same two numbers the same way; see
   * `articulationHits`.
   */
  length: number;
  /** How many STEPS a chord strum pushes this note, so a roll exports too. */
  strum: number;
  midi: number;
  velocity: number;
  /**
   * The drum this hit is, or null — see `Cell.drum`. A kit's notes carry theirs,
   * which is what tells the writer that a step on a channel whose voice is a
   * snare may still be a KICK.
   */
  drum: DrumId | null;
}

/**
 * Write the song out as a Standard MIDI File.
 *
 * A refusal rather than an empty file when there is nothing to write: this app's
 * own reader refuses a file with no notes in it ("this MIDI file has no notes in
 * it"), and a download that cannot be opened again is worse than a sentence
 * saying so. Everything else about the song — the sound, the feel, the lanes —
 * is dropped on purpose; see the note at the top of this file.
 */
export function songToMidi(song: Song, bounce: BounceRange | null = null): MidiExport {
  const rows = Math.max(1, patternRows(song));
  const ticksPerStep = Math.max(1, Math.round(MIDI_EXPORT_PPQ / Math.max(1, song.rowsPerBeat)));

  // The LOOP REGION, if one is set: the same span the audio exports use, so the
  // three writers of this app agree about which bars of a song "only these bars"
  // means. A region is what makes an export of a chorus possible at all; bars are
  // the song's own unit and one bar is one pattern, so the span is arithmetic.
  const span = bounceSteps(song, bounce);
  const firstSlot = Math.round(span.first / rows) + 1;

  // Every note the ORDER plays, on the channel it belongs to. Reading the order
  // rather than the patterns is the whole point: a bar that the song never plays
  // is not in the song, and exporting it would add music nobody wrote.
  const placed: PlacedNote[][] = song.tracks.map(() => []);
  for (let step = span.first; step < span.last; step++) {
    const at = stepToSlot(song, step);
    const pattern = song.patterns[at.pattern];
    if (!pattern) continue;
    const rowNoteList = rowNotes(pattern, at.row);
    // How many notes each channel has on this row: a chord rolled by `strum` is
    // spread by its own size, so the count is taken before the first note is
    // written — the same rule the scheduler and the renderer follow.
    const chordSize = new Map<number, number>();
    for (const one of rowNoteList) chordSize.set(one.track, (chordSize.get(one.track) ?? 0) + 1);
    const chordAt = new Map<number, number>();
    for (const note of rowNoteList) {
      const list = placed[note.track];
      if (!list) continue; // a note on a channel the song no longer has
      const chordIndex = chordAt.get(note.track) ?? 0;
      chordAt.set(note.track, chordIndex + 1);
      const track = song.tracks[note.track];
      // How many STEPS this note's strum pushes it, so a rolled chord lands in
      // the file where it landed in the app rather than as a block.
      const strum = track ? strumOffsets(chordSize.get(note.track) ?? 1, track.strum)[chordIndex] ?? 0 : 0;
      // A stutter is written as the hits it is: `*3` is three notes inside one
      // step, because that is three notes and a file that wrote one would be
      // exporting a different part. A note that says nothing answers with one
      // hit at the start for the whole hold, which is the single entry this line
      // always pushed. A slide's glide is dropped — the writer has no pitch bend
      // — so the hits are asked for with the channel's own `glide` of 0.
      for (const hit of articulationHits(note.articulation, 0)) {
        list.push({
          // Measured from the REGION's first step, because a file's clock starts
          // at zero however late in the song the region begins: every tick below
          // is this number times a step, so subtracting it here is the whole of
          // "the export begins at bar 8".
          step: step - span.first, at: hit.at, length: hit.length, strum,
          midi: note.midi, velocity: note.velocity, drum: note.drum,
        });
      }
    }
  }

  // --- the drum machine, as one more part ------------------------------------
  // A pad is a HIT on a grid rather than a note with a length, so the machine is
  // not one of `song.tracks` — but it is music in the same song, and a beat made
  // on it belongs in the file. Each hit becomes a short note on MIDI's DRUM
  // channel (9) at the pad's OWN pitch, which is the General MIDI drum most pads
  // already sit on: kick 36, snare 38, hat 42. A tuned or unusual pad exports at
  // its own note, the honest reading of a drum machine's grid — and because the
  // placement helper already folds in the order, the bars and the machine's swing,
  // the file has the beat the app plays rather than a second guess at it.
  const machine = song.machine && song.machine.enabled ? song.machine : null;
  const machineHits = machine
    ? machineHitsInRange(machine, song.rowsPerBeat, span.first, span.last, machineBarsForSong(song))
    : [];

  const noteCount = placed.reduce((total, list) => total + list.length, 0) + machineHits.length;
  if (noteCount === 0) {
    return { ok: false, errors: ['there is nothing to export: this song has no notes in it.'] };
  }

  // --- one chunk per channel, plus the conductor -----------------------------
  const channelTracks: number[][] = [];
  let nextChannel = 0;
  song.tracks.forEach((track, index) => {
    const notes = placed[index];
    if (notes.length === 0) return; // a silent channel is not a part of the file
    const drumPitch = drumPitchForVoice(track.voice);
    // A channel is percussion when its VOICE is a drum — which is how percussion
    // has always been written — or when its own hits name drums, which is what a
    // kit channel is. So `track 4 "DRUMS" voice pad` with `drum 0 4 kick` lines on
    // it still exports into MIDI's drum channel, where the drums belong.
    const percussion = drumPitch !== null || notes.some((note) => note.drum !== null);
    let channel: number;
    if (percussion) {
      channel = DRUM_CHANNEL;
    } else {
      // Channel 9 belongs to the drums whether or not this song has any, because
      // that is the convention every reader (this app's included) assumes.
      if (nextChannel === DRUM_CHANNEL) nextChannel += 1;
      channel = Math.min(15, nextChannel++);
    }

    const hold = clampHold(track.hold);
    const events: Timed[] = [
      { tick: 0, order: 0, bytes: nameMeta(track.name) },
    ];
    if (!percussion) {
      events.push({ tick: 0, order: 0, bytes: [0xc0 | channel, gmProgramForVoice(track.voice)] });
    }

    const holdTicks = hold * ticksPerStep;
    // Within a step the hits of a stutter are in PLAYING order, which is what the
    // monophonic rule below needs: the first hit ends where the second begins.
    const ordered = [...notes].sort((a, b) => a.step - b.step || a.at - b.at || a.strum - b.strum || a.midi - b.midi);
    ordered.forEach((note, i) => {
      // Clamped at zero: a grace hit of a flam sits BEFORE its step, and the very
      // first step of a region has nothing before it — a tick the file cannot
      // hold. The grace lands on the downbeat instead, which is where a listener
      // hears it anyway (it is tens of milliseconds, not a beat).
      const start = Math.max(0, note.step * ticksPerStep + Math.round(note.at * holdTicks) + Math.round(note.strum * ticksPerStep));
      const natural = start + Math.max(1, Math.round(note.length * holdTicks));
      // A monophonic channel gives way to the note that follows it, so the note it
      // was holding ends where the next one begins; that is the length you HEARD,
      // and writing the full `hold` instead would export a sustaining part that
      // never sustains. A polyphonic channel keeps every note whole.
      const next = ordered[i + 1];
      const nextStart = next ? Math.max(0, next.step * ticksPerStep + Math.round(next.at * holdTicks) + Math.round(next.strum * ticksPerStep)) : natural;
      const end = track.poly > 1
        ? natural
        : Math.min(natural, nextStart);
      // The pitch of a drum hit is the DRUM's own (`note.midi`, which the model
      // keeps at the kit's General MIDI pitch); the pitch of a note on a drum
      // channel is the channel's drum; anything else is the note it was written.
      const pitch = note.drum !== null
        ? clampMidi(note.midi)
        : percussion && drumPitch !== null
        ? drumPitch
        : clampMidi(note.midi);
      const velocity = midiVelocity(note.velocity);
      events.push({ tick: start, order: 1, bytes: [0x90 | channel, pitch, velocity] });
      events.push({ tick: Math.max(start + 1, end), order: 0, bytes: [0x80 | channel, pitch, 64] });
    });

    channelTracks.push(trackChunk(events));
  });

  // The machine's own chunk, after the channels and on the drum channel whatever
  // they used — a machine is percussion everywhere else too. Every hit is a short
  // note (a drum is a one-shot, not a held note), and its tick is the fractional
  // song row the placement gave it times a row's ticks, so a machine that counts
  // eight to the beat lands BETWEEN a song's rows where it is played.
  if (machine && machineHits.length > 0) {
    const drumTicks = Math.max(1, Math.round(ticksPerStep / 4));
    const events: Timed[] = [{ tick: 0, order: 0, bytes: nameMeta('DRUM MACHINE') }];
    for (const hit of machineHits) {
      const pad = machine.pads[hit.padIndex];
      if (!pad) continue;
      const start = Math.max(0, Math.round((hit.row - span.first) * ticksPerStep));
      const pitch = clampMidi(pad.pitch);
      events.push({ tick: start, order: 1, bytes: [0x90 | DRUM_CHANNEL, pitch, midiVelocity(hit.velocity)] });
      events.push({ tick: start + drumTicks, order: 0, bytes: [0x80 | DRUM_CHANNEL, pitch, 64] });
    }
    channelTracks.push(trackChunk(events));
  }

  const beatsPerBar = rows / Math.max(1, song.rowsPerBeat);
  const conductor: Timed[] = [
    { tick: 0, order: 0, bytes: nameMeta(song.title) },
    { tick: 0, order: 0, bytes: tempoMeta(songTempoAtSlot(song, firstSlot)) },
  ];
  if (Number.isInteger(beatsPerBar) && beatsPerBar >= 1 && beatsPerBar <= 32) {
    conductor.push({ tick: 0, order: 0, bytes: timeSignatureMeta(beatsPerBar) });
  }
  // The tempo map, bar by bar. A `BY` point slides here and MIDI has no slide, so
  // the map arrives as the tempos it passes through — the same read the app's own
  // sequencer makes of it, written where another program can see it.
  let previous = clampBpm(songTempoAtSlot(song, firstSlot));
  for (let slot = firstSlot + 1; slot <= Math.round(span.last / rows); slot++) {
    const bpm = clampBpm(songTempoAtSlot(song, slot));
    if (bpm === previous) continue;
    previous = bpm;
    // Relative to the region's own first bar, which is beat zero of the file.
    conductor.push({ tick: (slot - firstSlot) * rows * ticksPerStep, order: 0, bytes: tempoMeta(bpm) });
  }

  const chunks = [trackChunk(conductor), ...channelTracks.map((data) => data)];
  const bytes = new Uint8Array([
    ...chunk('MThd', [...u16(MIDI_EXPORT_FORMAT), ...u16(chunks.length), ...u16(MIDI_EXPORT_PPQ)]),
    ...chunks.flat(),
  ]);

  return {
    ok: true,
    bytes,
    summary: {
      tracks: channelTracks.length,
      notes: noteCount,
      bars: Math.round(span.last / rows) - firstSlot + 1,
      ppq: MIDI_EXPORT_PPQ,
    },
  };
}
