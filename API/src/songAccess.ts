/**
 * songAccess — how an operation receives and describes a song.
 *
 * A caller should never have to decide whether to pass a Song as an object or as
 * the JSON text of a `.json` file: both are the same music, and both arrive here.
 * `songFromInput` accepts either, validates it through the model's own file
 * reader (so a hand-built object is checked exactly as a saved file is), and
 * refuses with the reader's own reasons when it does not fit. That is the same
 * bargain the app makes when it opens a file: the file is parsed before anything
 * is touched.
 *
 * The rest of the file is the READ side — turning a Song into the kind of digest
 * a person, a log line or a model actually wants: a title and a tempo, then one
 * row per channel, then one line per pattern. None of it is clever; it is the
 * answer to "what is in here", which every agent asks first.
 */

import {
  countSongNotes,
  createSong,
  keyName,
  midiToNoteName,
  patternRows,
  songFromJson,
  songToJson,
  usedTracks,
  type Cell,
  type Song,
  type Track,
} from '../../src/model';
import type { ApiInput } from './input';
import { maybeObject, maybeStr } from './input';
import { refuse } from './result';

/** Deep copy, so an operation can never mutate the caller's song by accident. */
export function cloneSong(song: Song): Song {
  return structuredClone(song);
}

/**
 * A song from an input field: an object, the text of a `.json`, or null.
 *
 * The round trip through `songToJson`/`songFromJson` is deliberate. It normalizes
 * anything missing (a song written by hand may omit a field an older version
 * never had), and it catches a malformed shape with the file reader's own
 * sentence rather than letting a bad object reach the engine — where the failure
 * would be a number that is `NaN` three calls later instead of a message now.
 */
export function songFromInput(input: ApiInput, field = 'song'): Song | null {
  const inline = maybeObject(input, field);
  const asText = inline ? null : maybeStr(input, `${field}Json`);
  if (!inline && !asText) return null;

  let text: string;
  if (inline) {
    try {
      text = songToJson(inline as unknown as Song);
    } catch (error) {
      refuse('file_refused', `"${field}" is not a Tracklet song: ${messageOf(error)}`);
    }
  } else {
    text = asText as string;
  }

  const parsed = songFromJson(text);
  if (!parsed.ok) {
    refuse('file_refused', `"${field}" is not a Tracklet song.`, parsed.errors.slice(0, 12));
  }
  return parsed.song;
}

/** A song from the input, or a brand-new blank one when none was given. */
export function songOrNew(input: ApiInput, field = 'song'): Song {
  return songFromInput(input, field) ?? createSong();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What one channel holds: what it is called, how it is set, and how busy it is. */
export interface TrackDigest {
  track: number;
  name: string;
  /** How many pitched notes this channel plays across every pattern. */
  notes: number;
  /** How many drum hits it plays, if it is a kit channel. */
  drums: number;
  /** True when the channel plays anything at all. */
  used: boolean;
  /** The lowest and highest MIDI pitches it uses, or null when silent. */
  range: { low: number; high: number } | null;
  level: number;
  hold: number;
  poly: number;
  muted: boolean;
}

export interface PatternDigest {
  pattern: number;
  name: string;
  steps: number;
  /** Pitched notes in this pattern. */
  notes: number;
  /** Drum hits in this pattern. */
  drums: number;
  empty: boolean;
}

export interface SongDescription {
  title: string;
  key: string;
  bpm: number;
  steps: number;
  stepsPerBeat: number;
  bars: number;
  tracks: number;
  patterns: number;
  notes: number;
  lanes: number;
  buses: number;
  sections: number;
  /** The order, as pattern numbers. */
  order: number[];
  trackList: TrackDigest[];
  patternList: PatternDigest[];
}

function cellNotes(cell: Cell | undefined): number[] {
  if (!cell) return [];
  const notes: number[] = [];
  if (cell.note !== null) notes.push(cell.note);
  notes.push(...cell.extra);
  return notes;
}

/** Count what each channel and each pattern holds, in one pass over the grid. */
function countCells(song: Song): { perTrack: TrackDigest[]; perPattern: PatternDigest[] } {
  const perTrack: TrackDigest[] = song.tracks.map((track, index) => ({
    track: index + 1,
    name: track.name,
    notes: 0,
    drums: 0,
    used: false,
    range: null,
    level: track.level,
    hold: track.hold,
    poly: track.poly,
    muted: track.muted,
  }));
  const perPattern: PatternDigest[] = song.patterns.map((pattern, index) => ({
    pattern: index + 1,
    name: pattern.name,
    steps: pattern.steps.length,
    notes: 0,
    drums: 0,
    empty: true,
  }));

  song.patterns.forEach((pattern, patternIndex) => {
    const digest = perPattern[patternIndex];
    if (!digest) return;
    pattern.steps.forEach((row) => {
      row.forEach((cell, trackIndex) => {
        const column = perTrack[trackIndex];
        if (!column) return;
        const notes = cellNotes(cell);
        if (notes.length > 0) {
          column.notes += notes.length;
          column.used = true;
          digest.notes += notes.length;
          digest.empty = false;
          for (const note of notes) {
            if (column.range === null) column.range = { low: note, high: note };
            else column.range = { low: Math.min(column.range.low, note), high: Math.max(column.range.high, note) };
          }
        }
        if (cell?.drum) {
          column.drums += 1;
          column.used = true;
          digest.drums += 1;
          digest.empty = false;
        }
      });
    });
  });
  return { perTrack, perPattern };
}

/** Everything a caller wants to know about a song, in one object. */
export function describeSong(song: Song): SongDescription {
  const { perTrack, perPattern } = countCells(song);
  return {
    title: song.title,
    key: keyName(song.key),
    bpm: song.bpm,
    steps: patternRows(song),
    stepsPerBeat: song.rowsPerBeat,
    bars: song.order.length,
    tracks: song.tracks.length,
    patterns: song.patterns.length,
    notes: countSongNotes(song),
    lanes: song.automation.length,
    buses: song.buses.length,
    sections: song.sections.length,
    order: [...song.order],
    trackList: perTrack,
    patternList: perPattern,
  };
}

/** One pattern, printed the way the app prints it: a row a line, a channel a token. */
export function gridText(song: Song, patternNumber: number): string {
  const pattern = song.patterns[patternNumber - 1];
  if (!pattern) refuse('not_found', `this song has no pattern ${patternNumber}.`);
  const width = Math.max(2, String(pattern.steps.length - 1).length);
  const columns = song.tracks.map((track) => track.name.slice(0, 6).padEnd(6)).join(' ');
  const lines = [`     ${columns}`];
  pattern.steps.forEach((row, index) => {
    const tokens = song.tracks.map((_track, trackIndex) => cellToken(row[trackIndex]).padEnd(6));
    lines.push(`${String(index).padStart(width, ' ')} | ${tokens.join(' ')}`);
  });
  return lines.join('\n');
}

function cellToken(cell: Cell | undefined): string {
  if (!cell) return '.';
  if (cell.drum) return cell.drum;
  const notes = cellNotes(cell).map((note) => midiToNoteName(note));
  return notes.length > 0 ? notes.join(',') : '.';
}

/**
 * The channels that carry something, 1-based, in channel order.
 *
 * This is the model's own `usedTracks`, and it already counts a DRUM hit: a
 * drum cell carries its kit's General MIDI pitch in `note`, precisely so that
 * every reader that only knows about notes sees a part rather than a hole. So a
 * one-channel kit is a channel that "carries something" here and a part in a stem
 * set, which is the answer an agent asking the question wants.
 */
export function carryingTracks(song: Song): number[] {
  const used = usedTracks(song);
  return used.flatMap((yes, index) => (yes ? [index + 1] : []));
}

/** A track's name, for a message that has a number and wants a word. */
export function trackName(song: Song, track: number): string {
  return song.tracks[track - 1]?.name ?? `track ${track}`;
}

/** Re-exported so the operations share one spelling of a channel's shape. */
export type { Track };
