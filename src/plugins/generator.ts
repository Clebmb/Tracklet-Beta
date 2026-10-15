/**
 * plugins/generator — what a music-writing plugin IS, before it writes a note.
 *
 * An instrument renders notes and an effect processes them; a generator WRITES
 * them. Its whole contract is one pure function:
 *
 *   expand(input, params, seed) -> edits
 *
 * Pure means no song mutation, no I/O, no `Math.random()` — variation comes
 * from the seed the host provides, so the same inputs always write the same
 * notes (the strictest determinism rule in the roadmap: a generator that
 * disagrees with itself is a broken composer). The host previews the edits
 * (parse-before-apply, the same rule as the script language) and commits them
 * as one undo step.
 *
 * Every generator declares whether it is CONSTRUCTIVE (writes cells the song
 * keeps, like `arp write`) or INTERPRETIVE (played live without writing, like
 * `arp hear on`). v1 seats constructive generators only; an interpretive
 * module is refused with the milestone that seats it, never a crash.
 *
 * This module is Phaser-free and DOM-free, so the contract is unit tested with
 * real writes: the two proof generators expand here and the tests pin their
 * shape and determinism.
 */

import type { TrackletPluginManifest } from './manifest';
import type { PluginParamValues } from './instrument';
import type { SongKey } from '../model/scale';
import {
  progressionHold,
  progressionStartRows,
  progressionStepRoot,
  type Progression,
} from '../model/progression';

/** How a generator reaches the song: written cells, or live play without writing. */
export type GeneratorMode = 'constructive' | 'interpretive';

/**
 * A generator plugin: its manifest, its mode, and the one pure expansion.
 *
 * `expand` receives the input the caller built (a Euclidean rhythm request, a
 * bass-follow request), the host-clamped 0–100 params, and a seed — and hands
 * back edits the host previews before committing. It must be deterministic
 * (same inputs, same edits), finite, and free of side effects.
 */
export interface GeneratorPlugin {
  manifest: TrackletPluginManifest;
  mode: GeneratorMode;
  expand(
    input: GeneratorInput,
    params: PluginParamValues,
    seed: number,
  ): GeneratorEdits;
}

/** What a generator can be asked to write. */
export type GeneratorInput =
  | { kind: 'euclid'; pulses: number; steps: number; rotate?: number }
  | { kind: 'bass'; progression: Progression; key: SongKey; octave: number; rows: number; from?: number; rhythm?: BassRhythm };

/** What a generator hands back: edits the host previews, then commits as one step. */
export type GeneratorEdits =
  | { kind: 'euclid'; hits: boolean[]; pattern: string }
  | { kind: 'bass'; notes: { row: number; midi: number }[] };

// --- euclid-drums: a Euclidean rhythm ---------------------------------------

/** The most hits one Euclidean request may ask for: one per step of a full machine bar. */
export const MAX_EUCLID_STEPS = 64;

/**
 * A Euclidean rhythm: `pulses` hits spread as evenly as `steps` allows.
 *
 * The Bjorklund distribution in one line — step `i` is a hit when
 * `(i * pulses) % steps < pulses` — rotated forward by `rotate` steps. No RNG,
 * so there is no seed to disagree about: the same three numbers always write
 * the same beat. `E(3, 8)` is `9..9..9.`; `E(5, 16)` is the kin of
 * `9..9.9..9..9.` a drummer's right hand already knows.
 */
export function euclidPattern(pulses: number, steps: number, rotate = 0): boolean[] {
  const at = Math.max(1, Math.min(MAX_EUCLID_STEPS, Math.round(steps)));
  const hits = Math.max(0, Math.min(at, Math.round(pulses)));
  const turn = ((Math.round(rotate) % at) + at) % at;
  const out = new Array<boolean>(at).fill(false);
  for (let i = 0; i < at; i++) {
    const evenly = (i * hits) % at < hits;
    out[(i + turn) % at] = evenly;
  }
  return out;
}

/**
 * The same rhythm as the string a `pad` line writes: `9` for a hit, `.` for a
 * rest. The host writes exactly this into the pad's row, so a generator's
 * output pasted from the docs parses and applies — the M4 done-means.
 */
export function euclidPatternString(pulses: number, steps: number, rotate = 0): string {
  return euclidPattern(pulses, steps, rotate).map((hit) => (hit ? '9' : '.')).join('');
}

// --- bass-follow: a bassline that hangs on the loop --------------------------

/** The rhythm templates a bass-follow request may name. */
export const BASS_RHYTHMS = ['four', 'half', 'offbeat'] as const;

/** One of the named bass rhythms. */
export type BassRhythm = (typeof BASS_RHYTHMS)[number];

/** Whether the value names a bass rhythm the generator can play. */
export function isBassRhythm(value: unknown): value is BassRhythm {
  return typeof value === 'string' && (BASS_RHYTHMS as readonly string[]).includes(value);
}

/**
 * The rows a bass rhythm keeps, from the rows the loop starts on.
 *
 * `four` walks every chord (`Am F C G` is four roots a bar); `half` walks every
 * other start (the half-note bass under a ballad); `offbeat` shifts each start
 * by half a hold (the skank's answer, clamped at least one step late). The
 * notes themselves are the loop's ROOTS at the octave — the lowest note of
 * each chord, so a bassline cannot drift a third away from the keyboard above
 * it (the `progressionStepRoot` bargain).
 */
export function bassFollowNotes(
  progression: Progression,
  key: SongKey,
  octave: number,
  rows: number,
  from = 0,
  rhythm: BassRhythm = 'four',
): { row: number; midi: number }[] {
  const size = Math.max(0, Math.round(rows));
  if (size === 0 || progression.steps.length === 0) return [];
  const hold = progressionHold(progression);
  const starts = progressionStartRows(progression, size, Math.max(0, Math.round(from)));
  const kept =
    rhythm === 'half'
      ? starts.filter((_row, index) => index % 2 === 0)
      : rhythm === 'offbeat'
        ? starts.map((row) => row + Math.max(1, Math.floor(hold / 2))).filter((row) => row < size)
        : starts;
  return kept.map((row) => {
    const at = ((row % size) + size) % size;
    const stepIndex = Math.floor(at / hold) % progression.steps.length;
    const step = progression.steps[stepIndex]!;
    return { row: at, midi: progressionStepRoot(step, key, octave) };
  });
}
