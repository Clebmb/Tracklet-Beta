/**
 * arp — the ARP page's arithmetic: a chord, a walk, and the cells a run becomes.
 *
 * ── Why this is not the chord modifier, and why it is ───────────────────────
 * The language can already turn a chord into a run — `chord 0 1 Am arp up 8`
 * writes the chord's tones one per step, climbing — and `model/chord.ts` holds
 * that arithmetic (`arpNotes`). This module does NOT re-derive it: it is a FACE
 * over the same function, so the run the ARP page previews and writes is the run
 * a script writes. The two cannot disagree, because there is one walk.
 *
 * Where it goes BEYOND the modifier is the three dials a page needs and a single
 * line does not: how many OCTAVES to climb, how many steps each note holds (RATE),
 * and how much of each note sounds (GATE). Those are STORED in the song, so a run
 * can be reopened and tuned rather than re-derived — which is the whole point of
 * the page — and they are clamped here rather than in the view.
 *
 * ── What a cell can hold ────────────────────────────────────────────────────
 * A run is ordinary tracker cells: one note per step, in an order. This module
 * therefore returns `ArpStep[]` — a step, a note and a velocity — and NOTHING
 * about duration, because a note's LENGTH in this app is the channel's `hold`,
 * a property of the channel rather than of one cell. So GATE, the page's "how
 * much of the step each note sounds", writes the one per-cell intensity the grid
 * holds: the cell's VELOCITY. At `gate 100` (the default) it writes nothing a
 * plain run would not, which is what keeps a written run equal to the modifier's.
 *
 * Phaser-free and pure, like the rest of `model/`.
 */

import {
  ARP_DIRECTIONS,
  DEFAULT_ARP_DIRECTION,
  MAX_ARP_STEPS,
  arpNotes,
  chordQualityOf,
  chordShape,
  type ArpDirection,
} from './chord';
import { NOTE_NAMES } from './notes';
import {
  progressionStepAt,
  progressionStepLabel,
  progressionStepNotes,
  type Progression,
} from './progression';
import type { SongKey } from './scale';
import { DEFAULT_VELOCITY } from './song';

/** Where a run's notes come from: the chord under the cursor, or the song's loop. */
export type ArpMode = 'chord' | 'source';
export const ARP_MODES: readonly ArpMode[] = ['chord', 'source'];

/**
 * Everything the ARP page dials, stored in the song.
 *
 * `direction` is the chord modifier's own word (one walk, one spelling), and the
 * other four are the page's three extra dials plus which chord to walk.
 */
export interface ArpSettings {
  /** Which way the run walks the chord. */
  direction: ArpDirection;
  /** How many octaves the walk climbs before it stops, 1..4. */
  octaves: number;
  /** How many steps each note occupies: 1 is one note per step. */
  rate: number;
  /** How hard each note lands, 0..100. 100 is the default a plain run writes. */
  gate: number;
  /** Which chord the run walks: the one under the cursor, or the song's loop. */
  mode: ArpMode;
}

export const MIN_ARP_OCTAVES = 1;
export const MAX_ARP_OCTAVES = 4;
export const MIN_ARP_RATE = 1;
export const MAX_ARP_RATE = 4;
export const MIN_ARP_GATE = 0;
export const MAX_ARP_GATE = 100;

/**
 * The dials a fresh page carries: up, two octaves, one note per step, full gate,
 * walking the chord under the cursor. Two octaves is what makes a triad fill a
 * bar's worth of sixteenths rather than stopping after three.
 */
export const DEFAULT_ARP: ArpSettings = {
  direction: DEFAULT_ARP_DIRECTION,
  octaves: 2,
  rate: 1,
  gate: DEFAULT_VELOCITY,
  mode: 'chord',
};

/** A whole number in a range, or the fallback when the value is not one. */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(Math.max(number, min), max);
}

/**
 * The dials, with every field forced into range.
 *
 * A word that is not a direction, or a mode this build does not have, falls back
 * to the default rather than throwing: the five dials are a setting, and a setting
 * that cannot be read is the one the page already has — the same rule `groove` and
 * `shape` follow when a file names one this build was never taught.
 */
export function clampArp(partial: Partial<ArpSettings> = {}): ArpSettings {
  const direction = ARP_DIRECTIONS.includes(partial.direction as ArpDirection)
    ? (partial.direction as ArpDirection)
    : DEFAULT_ARP.direction;
  const mode = ARP_MODES.includes(partial.mode as ArpMode) ? (partial.mode as ArpMode) : DEFAULT_ARP.mode;
  return {
    direction,
    mode,
    octaves: clampInt(partial.octaves, MIN_ARP_OCTAVES, MAX_ARP_OCTAVES, DEFAULT_ARP.octaves),
    rate: clampInt(partial.rate, MIN_ARP_RATE, MAX_ARP_RATE, DEFAULT_ARP.rate),
    gate: clampInt(partial.gate, MIN_ARP_GATE, MAX_ARP_GATE, DEFAULT_ARP.gate),
  };
}

/** True when two sets of dials say the same thing. */
export function sameArp(a: ArpSettings, b: ArpSettings): boolean {
  return a.direction === b.direction
    && a.octaves === b.octaves
    && a.rate === b.rate
    && a.gate === b.gate
    && a.mode === b.mode;
}

/**
 * How many notes a run holds.
 *
 * Two caps, whichever bites first: the walk stops after `octaves` trips up the
 * chord (`tones.length * octaves` notes), and it can only place a note every
 * `rate` steps within the room it has (`availableSteps` rows from the start).
 * A monotonic cap rather than a floor, so a run always begins at the row it was
 * asked for and simply stops earlier when there is no room.
 */
export function arpNoteCount(
  tones: readonly number[],
  settings: ArpSettings,
  availableSteps = MAX_ARP_STEPS,
): number {
  if (tones.length === 0) return 0;
  const room = Math.floor((Math.max(0, availableSteps) - 1) / settings.rate) + 1;
  return Math.max(0, Math.min(tones.length * settings.octaves, room));
}

/** One cell of a run: where it lands, what note, and how hard. */
export interface ArpStep {
  /** The row, relative to the pattern's own start. */
  step: number;
  /** The MIDI note. */
  note: number;
  /** How hard it lands, 0..100 — the cell's velocity. */
  velocity: number;
}

/**
 * The cells a run writes: `tones` walked from `row`, one note every `rate` steps.
 *
 * The ORDER of the notes comes from `arpNotes` — the chord modifier's own walk —
 * so `generateArp(tones, 0, { direction: 'up', octaves: 3, rate: 1, gate: 100, … },
 * 8)` returns exactly the notes `chord 0 1 Am arp up 8` writes, in the same cells.
 * Everything this function adds is WHERE each note lands (`rate`) and how hard it
 * is (`gate`); the run itself is unchanged.
 */
export function generateArp(
  tones: readonly number[],
  row: number,
  settings: ArpSettings,
  availableSteps = MAX_ARP_STEPS,
): ArpStep[] {
  const count = arpNoteCount(tones, settings, availableSteps);
  if (count === 0) return [];
  const order = arpNotes(tones, { direction: settings.direction, steps: count });
  return order.map((note, index) => ({
    step: row + index * settings.rate,
    note,
    velocity: settings.gate,
  }));
}

/**
 * The dials as one line, for the page's status strip and a summary.
 *
 * Built here rather than in the view for the reason every label in this app is:
 * the status line and the tests read the same string, so they cannot drift.
 */
export function arpLabel(settings: ArpSettings): string {
  return [
    settings.direction.toUpperCase(),
    `${settings.octaves} OCT`,
    `RATE ${settings.rate}`,
    `GATE ${settings.gate}`,
    settings.mode === 'chord' ? 'CHORD' : 'SOURCE',
  ].join('  \u00b7  ');
}

/** The `arp` script lines that would set these dials back, for `SAVE AS SCRIPT`. */
export function arpScript(settings: ArpSettings): string[] {
  return [
    `arp direction ${settings.direction}`,
    `arp octaves ${settings.octaves} rate ${settings.rate} gate ${settings.gate}`,
    `arp mode ${settings.mode}`,
  ];
}

// --- where a run's chord comes from ----------------------------------------

/**
 * The octave a SONG SOURCE chord is voiced at.
 *
 * The script's own default (`octave 4`), because that is where `chord 0 3 follow`
 * voices the progression: a page that picked a different octave would preview and
 * write a run a follower would not, and the two faces of the same loop would
 * disagree.
 */
export const ARP_SOURCE_OCTAVE = 4;

/** Which of the two sources a run's chord came from. */
export type ArpSourceFrom = 'cell' | 'progression';

/** The chord a run walks, resolved: the notes, and how to name them. */
export interface ArpSource {
  /** The chord's notes, in the order the walk climbs them. Never empty. */
  tones: number[];
  /**
   * The chord's short name (`Am`, `F#7`, `3`), or `''` for a stack of notes that
   * is not a chord this build knows — see `shortChordName`.
   */
  chord: string;
  /** Which source answered: the cell the destination points at, or the song's loop. */
  from: ArpSourceFrom;
}

/** A resolved source, or the REASON there is none. Never an empty chord. */
export type ArpSourceResult = { ok: true; source: ArpSource } | { ok: false; reason: string };

/**
 * A chord's short name from its notes: `Am`, `F#7`, or `''`.
 *
 * The root's letter plus the shape's own suffix — the spelling a progression step
 * prints through `progressionStepLabel`, so the page showing the chord it is
 * walking and a script writing that chord name the same thing. `''` rather than a
 * guess for a stack that is not a chord: a cell may hold any notes at all, and
 * inventing a name for them would be the page lying about what it is playing.
 */
function shortChordName(notes: readonly number[]): string {
  if (notes.length === 0) return '';
  const sorted = [...notes].sort((a, b) => a - b);
  const quality = chordQualityOf(sorted);
  if (quality === null) return '';
  return `${NOTE_NAMES[((sorted[0] % 12) + 12) % 12]}${chordShape(quality).suffix}`;
}

/**
 * Which chord a run walks, and the honest answer when there is none.
 *
 * CHORD mode reads the cell the destination points at — the page's "the chord at
 * the cursor". SONG SOURCE reads the song's PROGRESSION at the destination row:
 * the same loop `chord 0 3 follow` writes from, at the same octave, so a run
 * dialed here and a follower written there agree about the chord. `progressionStepAt`
 * loops, so a progression is a loop here exactly as it is there.
 *
 * The two refusals are spelled out rather than falling through to an empty run,
 * because "the page is silent" and "the page has nothing to walk" are different
 * sentences, and only the second one tells a person what to do next.
 */
export function arpSource(input: {
  mode: ArpMode;
  /** The destination cell's notes — CHORD mode's whole source. */
  cell: readonly number[];
  /** The song's chord loop, or null when it has none. */
  progression: Progression | null;
  /** The song's key: how a degree step of the loop becomes notes. */
  key: SongKey;
  /** Where the run starts, which picks the loop's chord in SOURCE mode. */
  row: number;
}): ArpSourceResult {
  if (input.mode === 'chord') {
    if (input.cell.length === 0) {
      return {
        ok: false,
        reason: 'no chord in this cell — write one there, or set SOURCE MODE to SONG SOURCE.',
      };
    }
    const tones = [...input.cell];
    return { ok: true, source: { tones, chord: shortChordName(tones), from: 'cell' } };
  }
  const progression = input.progression;
  if (progression === null || progression.steps.length === 0) {
    return {
      ok: false,
      reason: 'this song has no progression, so SONG SOURCE has nothing to walk — write one ("progression Am F C G") or set SOURCE MODE to CHORD.',
    };
  }
  const step = progressionStepAt(progression, input.row);
  const tones = progressionStepNotes(step, input.key, ARP_SOURCE_OCTAVE);
  if (tones.length === 0) {
    return {
      ok: false,
      reason: `the progression's chord at this row (${progressionStepLabel(step)}) has no notes.`,
    };
  }
  return { ok: true, source: { tones, chord: progressionStepLabel(step), from: 'progression' } };
}

// --- the run: one computation, three faces --------------------------------

/** Where a run lands: the cells it writes, and how many of them were occupied. */
export interface ArpDestination {
  /** The pattern's index in the song. */
  pattern: number;
  /** The channel, 0-based. */
  track: number;
  /** The row the run starts on. */
  row: number;
  /** The last row the run touches — `row` itself when the run is empty. */
  lastRow: number;
  /** How many cells the run writes. */
  cells: number;
  /** How many of those cells already hold a note, so a write replaces them. */
  replaced: number;
}

/** Everything the page draws and the write commits, from ONE computation. */
export interface ArpRun {
  source: ArpSource;
  /** The cells, in the order they land. */
  steps: ArpStep[];
  destination: ArpDestination;
}

/** A run, or the reason there is none. */
export type ArpRunResult = { ok: true; run: ArpRun } | { ok: false; reason: string };

/** Everything the run needs: the dials, the source, and where it lands. */
export interface ArpRunInput {
  settings: ArpSettings;
  /** CHORD mode's source: the notes of the destination cell. */
  cell: readonly number[];
  /** SONG SOURCE mode's source: the song's chord loop, or null when it has none. */
  progression: Progression | null;
  /** The song's key, for a degree step of the loop. */
  key: SongKey;
  /** The destination: the pattern's index in the song. */
  pattern: number;
  /** The destination channel, 0-based. */
  track: number;
  /** The destination's start row. */
  row: number;
  /** How many steps the destination pattern has. */
  rows: number;
  /** The rows of the destination channel that already hold a note. */
  occupied?: readonly number[];
}

/**
 * The run the dials describe, for the destination they are aimed at.
 *
 * ── The one computation ─────────────────────────────────────────────────────
 * The page PREVIEWS this, `HEAR RUN` AUDITIONS this and `WRITE RUN` commits
 * this. One function, three faces — the same bargain `generateArp` already makes
 * with `chord … arp`, carried one level up so the page cannot draw a run it would
 * not hear or hear a run it would not write. Pitches, the rows they land on, the
 * velocity each carries and the row the run stops at all come from here, so there
 * is nothing left for the three to disagree about.
 *
 * The room is measured from the destination row to the pattern's OWN end, so a
 * run stops at the pattern's edge rather than running past it — and the edge it
 * stopped at is reported in `destination`, which is what the page prints above
 * `WRITE RUN` so the cells are known before anything is committed.
 */
export function arpRun(input: ArpRunInput): ArpRunResult {
  const resolved = arpSource({
    mode: input.settings.mode,
    cell: input.cell,
    progression: input.progression,
    key: input.key,
    row: input.row,
  });
  if (!resolved.ok) return resolved;
  const start = Math.max(0, input.row);
  const room = Math.max(0, Math.max(0, input.rows) - start);
  const steps = generateArp(resolved.source.tones, input.row, input.settings, room);
  const occupied = input.occupied ?? [];
  return {
    ok: true,
    run: {
      source: resolved.source,
      steps,
      destination: {
        pattern: input.pattern,
        track: input.track,
        row: input.row,
        lastRow: steps.length === 0 ? input.row : steps[steps.length - 1].step,
        cells: steps.length,
        replaced: steps.reduce((count, step) => (occupied.includes(step.step) ? count + 1 : count), 0),
      },
    },
  };
}

/**
 * How far apart an audition plays the run, in milliseconds.
 *
 * `rate` is steps PER NOTE, so a note every two steps must be heard a step later —
 * spacing an audition by one row would play a `rate 2` run at double speed and
 * make the page's own echo disagree with the grid the write produces. The row
 * length comes from the song's tempo, so this is the clock the tracker plays on
 * rather than a second guess at it.
 */
export function arpAuditionSpacingMs(settings: ArpSettings, secondsPerRow: number): number {
  const rate = Math.max(1, Math.round(settings.rate));
  return Math.max(1, Math.round(Math.max(0, secondsPerRow) * 1000 * rate));
}
