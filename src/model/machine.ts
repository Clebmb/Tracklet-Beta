/**
 * machine — the DRUM MACHINE: pads, a step grid, and its own little mix.
 *
 * `drum.ts` answers which hit a CELL is and `kit.ts` answers what those four hits
 * sound like. Both live inside the tracker's grid: a beat is a channel whose
 * cells name drums. This module is the other instrument — a DRUM MACHINE, the
 * thing a beat is usually made on. It has PADS you design, a STEP GRID you draw
 * one hit at a time, and its own fader, pan, sends, duck and effects, and it plays
 * BESIDE the tracker rather than inside one of its channels.
 *
 * The whole design is one sentence: **a drum machine is a song-level instrument,
 * not a second document.** Everything follows from keeping it inside the same
 * song, the same script and the same file:
 *
 *   • PADS ARE GENERATORS, not samples. A pad is the same `VoiceParams` a channel
 *     has, so the machine adds no audio format, no loading and no memory story —
 *     and a pad can be a tom, a clap or a crash rather than only the four kit
 *     drums, because a generator is what makes a new sound in this app.
 *
 *   • THE FIRST FOUR PADS ARE THE SONG'S KIT. `kit 808` still colours a machine,
 *     because a pad that names no voice is seeded from `drumVoice`. The machine is
 *     a second way to PLAY a kit, not a second kit.
 *
 *   • A HIT IS A VELOCITY PER STEP. A row is one number per step, `0` for a rest,
 *     0..100 for how hard the hit lands — the one field a step sequencer needs,
 *     and the one a cell already carries. Nothing new is stored for a hit.
 *
 *   • ABSENT MEANS ABSENT. A song with no machine holds `machine: null`, writes no
 *     field, and is byte-for-byte the file it was; every song written before this
 *     sounds exactly as it did.
 *
 * Pure and Phaser-free, like the rest of `model/`, so every rule here is unit
 * tested (see `__tests__/machine.test.ts`).
 */

import { drumVoice, type DrumId } from './drum';
import { copyVoice, DEFAULT_VOICE, type VoiceParams } from './voice';
import { NO_EFFECTS, type ChannelEffects } from './song';
import { tidySampleName } from './sample';

/**
 * One pad: a sound, a place in the mix, and a row of hits.
 *
 * The row is the whole of the machine's sequencing: `steps[i]` is how hard the
 * pad is hit on step `i`, and `0` is a rest. It is a list of NUMBERS rather than
 * a list of hits because a velocity is already the only thing that differs from
 * step to step — a hit with no velocity is a hit at 100, which the number says —
 * and because a dense list of numbers is what a file, an undo snapshot and a
 * tab all want to carry.
 */
export interface DrumPad {
  /** What the pad is called, ≤16 characters: `KICK`, `TOM`. */
  name: string;
  /** The pad's sound — the same wave, nine knobs and envelope a channel has. */
  voice: VoiceParams;
  /** This pad's own fader inside the machine, 0..100. */
  level: number;
  /** Where the pad sits, −100..100. */
  pan: number;
  /** The MIDI note the pad sounds, so a tom can be tuned to the kit. */
  pitch: number;
  /**
   * The recording this pad names, or null for the generator its `voice` builds.
   *
   * The SAME reference a channel carries (`sample BRK02`): the bytes live in the
   * app's bank and the pad holds only a name, so a pad naming a recording you do
   * not have still plays — the built-in one-shot plays instead, exactly the sound
   * the pad would have made if the line had never been written. A pad uses it when
   * its `voice` wave is `sample`; every other wave ignores the name, so a pad can
   * carry the reference and its own sound at once. `null` is "no recording", which
   * is every pad a song made before pads could name one.
   */
  sample: string | null;
  /** One velocity per step, 0..100; `0` is a rest. Length is the machine's steps. */
  steps: number[];
}

/**
 * The whole instrument: a grid of pads and the mix they land in.
 *
 * It is `null` on a song that has none, which is what keeps every song before
 * this playing — and sounding — exactly as it did.
 */
export interface DrumMachine {
  /** Whether the machine plays. `off` keeps the pads and silences the machine. */
  enabled: boolean;
  /** How many steps one bar of the machine holds, 1..64. */
  steps: number;
  /** How many of those steps are one beat, 1..16. */
  beat: number;
  /** The machine's own lilt over the song's, 0..100. */
  swing: number;
  /** How far forward the machine sits, 0..100. */
  level: number;
  /** Where it sits left to right, −100..100. */
  pan: number;
  /** A mix group to join, declared with `bus`, or null. */
  bus: string | null;
  /** How much of the machine is fed to the room, 0..100. */
  verb: number;
  /** How much of the machine is fed to the echo, 0..100. */
  echo: number;
  /** How far the machine pushes the rest of the mix down while it plays, 0..100. */
  duck: number;
  /** The ten channel effects, on the machine's whole output. */
  effects: ChannelEffects;
  /** The pads, in pad order. At most `MAX_PADS`. `pads[i].steps` is BAR 1's row. */
  pads: DrumPad[];
  /**
   * The machine's OTHER bars, bar 2 onward: one entry per bar, each a row of
   * velocities per pad.
   *
   * Bar 1 lives in `pads[].steps` and is not repeated here, which is the whole
   * reason a machine with one bar is byte-identical to the machine this build
   * always wrote — "absent means absent" one level down. The bars hold ROWS only:
   * a pad's sound, level, pan and pitch are one instrument, shared by every bar,
   * the way a channel's sound is shared by every pattern.
   */
  bars: number[][][];
  /**
   * Which machine bar plays in each SONG bar, 1-based: `[1,1,2,2]` is two bars of
   * the first beat, then two of the second.
   *
   * Empty means "bar 1, forever" — which is every machine written before a machine
   * could have more than one bar, and the reason the order is not defaulted to
   * `[1]` in the model: an empty list writes no key at all.
   */
  order: number[];
}

// --- the ranges -------------------------------------------------------------

export const MIN_MACHINE_STEPS = 1;
export const MAX_MACHINE_STEPS = 64;
/** One bar at the default `beat 4`, and what a machine that says nothing gets. */
export const DEFAULT_MACHINE_STEPS = 16;

export const MIN_MACHINE_BEAT = 1;
export const MAX_MACHINE_BEAT = 16;
export const DEFAULT_MACHINE_BEAT = 4;

export const MIN_TUNE = -24;
export const MAX_TUNE = 24;
export const DEFAULT_TUNE = 0;

/**
 * How many pads a machine may have, and why eight.
 *
 * Four would be the kit itself and no more, which makes the machine a second way
 * to play the four presets rather than a machine; a dozen would be a sampler. Eight
 * is two hands' worth of pads and enough room for a kit plus a fill sound, a crash
 * and a tuned tom — the things a beat actually adds to four drums.
 */
export const MAX_PADS = 8;

/**
 * How many BARS a machine may have.
 *
 * Sixteen is one per pattern a song is likely to use and two hands' worth of
 * variations — a verse beat, a chorus beat, a fill, a break — without the machine
 * becoming the second arrangement the machine-less design was avoiding.
 */
export const MAX_MACHINE_BARS = 16;

/** How long a pad's name may be: the same ceiling a channel's name has. */
export const MAX_PAD_NAME = 16;

/** The default pad level, so a machine that says nothing is not a quiet one. */
export const DEFAULT_PAD_LEVEL = 100;

/** The character a rest is written with in a pad pattern. */
export const PAD_REST_CHAR = '.';

/** The first pad a new machine comes with: the four kit drums. */
export const INITIAL_PADS = 4;

// --- clamping ---------------------------------------------------------------

/** The number of steps a machine may have, rounded and clamped. */
export function clampMachineSteps(steps: number): number {
  if (!Number.isFinite(steps)) return DEFAULT_MACHINE_STEPS;
  return Math.max(MIN_MACHINE_STEPS, Math.min(MAX_MACHINE_STEPS, Math.round(steps)));
}

/** Steps per beat, rounded and clamped. */
export function clampMachineBeat(beat: number): number {
  if (!Number.isFinite(beat)) return DEFAULT_MACHINE_BEAT;
  return Math.max(MIN_MACHINE_BEAT, Math.min(MAX_MACHINE_BEAT, Math.round(beat)));
}

/** How far a pad may be tuned, in semitones, rounded and clamped. */
export function clampTune(tune: number): number {
  if (!Number.isFinite(tune)) return DEFAULT_TUNE;
  return Math.max(MIN_TUNE, Math.min(MAX_TUNE, Math.round(tune)));
}

/** A pad's name, tidied: trimmed, upper-cased, spaces closed up, cut to length. */
export function tidyPadName(name: string): string {
  return name.trim().replace(/\s+/g, '-').toUpperCase().slice(0, MAX_PAD_NAME);
}

// --- the seeds --------------------------------------------------------------

/**
 * One pad's starting point, by pad number.
 *
 * The first four ARE the kit's four drums — the same voices, on the same General
 * MIDI pitches — so a machine sounds like the song it is in before anybody edits
 * it, and `kit 808` reaches the machine the way it reaches a channel. The rest are
 * the four sounds a beat reaches for after a knockout drum: a tom, a handclap, a
 * crash and a ride. Every one is a GEN wave this app already speaks, so a pad adds
 * vocabulary to the machine and none to the language.
 */
interface PadSeed {
  name: string;
  pitch: number;
  voice: VoiceParams;
}

function padSeed(index: number): PadSeed {
  const drum = drumVoiceFor(index);
  if (drum !== null) {
    return { name: drum.name, pitch: drum.pitch, voice: drum.voice };
  }
  switch (index) {
    case 5:
      return { name: 'TOM', pitch: 45, voice: { ...DEFAULT_VOICE, wave: 'membrane', duty: 0, bright: 40, ring: 35, decay: 25 } };
    case 6:
      return { name: 'CLAP', pitch: 39, voice: { ...DEFAULT_VOICE, wave: 'noise', noise: 100, bright: 85, ring: 8, decay: 15 } };
    case 7:
      return { name: 'CRASH', pitch: 49, voice: { ...DEFAULT_VOICE, wave: 'plate', duty: 100, bright: 80, ring: 90, release: 40 } };
    case 8:
      return { name: 'RIDE', pitch: 51, voice: { ...DEFAULT_VOICE, wave: 'plate', duty: 40, bright: 70, ring: 55, release: 25 } };
    default:
      return { name: `PAD ${index}`, pitch: 36, voice: drumVoice('kick') };
  }
}

/** The kit drum pad `index` sits on, or null for a pad the kit does not name. */
function drumVoiceFor(index: number): { name: string; pitch: number; voice: VoiceParams } | null {
  const drums: { index: number; id: DrumId; name: string; pitch: number }[] = [
    { index: 1, id: 'kick', name: 'KICK', pitch: 36 },
    { index: 2, id: 'snare', name: 'SNARE', pitch: 38 },
    { index: 3, id: 'hat', name: 'HAT', pitch: 42 },
    { index: 4, id: 'wind', name: 'WIND', pitch: 44 },
  ];
  const found = drums.find((entry) => entry.index === index);
  return found ? { name: found.name, pitch: found.pitch, voice: drumVoice(found.id) } : null;
}

/** A row of rests, one per step. */
export function emptyRow(steps: number): number[] {
  return new Array<number>(clampMachineSteps(steps)).fill(0);
}

/** The default pad a machine seeds pad `index` (1..8) with. */
export function defaultPad(index: number, steps: number): DrumPad {
  const seed = padSeed(clampPadIndex(index));
  return {
    name: seed.name,
    voice: copyVoice(seed.voice),
    level: DEFAULT_PAD_LEVEL,
    pan: 0,
    pitch: seed.pitch,
    sample: null,
    steps: emptyRow(steps),
  };
}

/**
 * A pad's recorded name, tidied: trimmed, inner space closed up.
 *
 * The same tidying a channel's `sample` line gets, and for the same reason — a
 * name out of a file dialog may hold a space that a script's word cannot, so the
 * two doors land the same string. Validity is `sampleNameProblem`'s question, not
 * this one's, so a bad name is refused by the caller that can print a sentence.
 */
export function tidyPadSample(name: string): string {
  return tidySampleName(name);
}

/** A pad number, clamped into 1..MAX_PADS. */
export function clampPadIndex(index: number): number {
  if (!Number.isFinite(index)) return 1;
  return Math.max(1, Math.min(MAX_PADS, Math.round(index)));
}

// --- the bars ---------------------------------------------------------------

/** How many bars the machine has: bar 1 plus the extra ones. */
export function machineBarCount(machine: DrumMachine): number {
  return 1 + machine.bars.length;
}

/** One bar's rows, pad by pad, shaped to this machine (each `steps` long). */
export function machineBarRows(machine: DrumMachine, bar: number): number[][] {
  if (bar <= 1) return machine.pads.map((pad) => pad.steps.slice());
  const stored = machine.bars[bar - 2] ?? [];
  return machine.pads.map((_pad, index) => resizeRow(stored[index] ?? [], machine.steps));
}

/**
 * The machine with bar `bar`'s rows set, growing the bar list with REST bars.
 *
 * Growing with rests is the same bargain `withPad` makes: `machine bar 4` means
 * the fourth bar whether or not bars 2 and 3 were written, and the bars in
 * between are the silence they would have been. Bar 1 writes the PADS' rows, so
 * there is still exactly one place a bar's hits live.
 */
export function withMachineBar(machine: DrumMachine, bar: number, rows: readonly (readonly number[])[]): DrumMachine {
  // Clamped to the CEILING, not to the bars that exist yet: this is the function
  // that GROWS the list, so clamping to the current count would make bar 2
  // impossible to reach. `clampMachineBar` is the read-side clamp, for a bar that
  // must already exist.
  const at = Number.isFinite(bar) ? Math.max(1, Math.min(MAX_MACHINE_BARS, Math.round(bar))) : 1;
  const shaped = machine.pads.map((_pad, index) => resizeRow(rows[index] ?? [], machine.steps));
  if (at === 1) {
    return { ...machine, pads: machine.pads.map((pad, index) => ({ ...pad, steps: shaped[index] ?? [] })) };
  }
  const bars = machine.bars.map((one) => one.map((row) => row.slice()));
  while (bars.length < at - 1) bars.push(machine.pads.map(() => emptyRow(machine.steps)));
  bars[at - 2] = shaped;
  return { ...machine, bars };
}

/** A bar number, clamped into 1..the machine's bar count. */
export function clampMachineBar(machine: DrumMachine, bar: number): number {
  const count = machineBarCount(machine);
  if (!Number.isFinite(bar)) return 1;
  return Math.max(1, Math.min(count, Math.round(bar)));
}

/**
 * The machine with one more bar: a COPY of the last, so a variation starts as the
 * beat rather than as silence.
 *
 * A copy, unlike `withMachineBar`'s rests, because the two are different asks:
 * growing to reach bar 4 is filling in what was always implied, while `add bar` is
 * "the same beat, and now change it" — the move `copy` makes for a pattern.
 */
export function addMachineBar(machine: DrumMachine): DrumMachine {
  if (machineBarCount(machine) >= MAX_MACHINE_BARS) return machine;
  const copy = machineBarRows(machine, machineBarCount(machine)).map((row) => row.slice());
  return { ...machine, bars: [...machine.bars.map((one) => one.map((row) => row.slice())), copy] };
}

/**
 * The machine with bar `bar` dropped, and the order clamped to what is left.
 *
 * Bar 1 is never dropped — a machine always has a beat — so asking to remove it
 * is a no-op rather than an error. The order is NOT renumbered: a bar that moved
 * down keeps its neighbours' references meaningful, and the clamp drops only what
 * pointed past the end.
 */
export function removeMachineBar(machine: DrumMachine, bar: number): DrumMachine {
  const at = clampMachineBar(machine, bar);
  if (at === 1) return machine;
  const bars = machine.bars.filter((_one, index) => index !== at - 2).map((one) => one.map((row) => row.slice()));
  const count = 1 + bars.length;
  const order = machine.order.map((entry) => Math.max(1, Math.min(count, Math.round(entry))));
  return { ...machine, bars, order };
}

/** The machine's order, or `[1]` when it has none — bar 1 forever. */
export function machineOrder(machine: DrumMachine): number[] {
  return machine.order.length > 0 ? machine.order.slice() : [1];
}

/** Which bar plays in SONG bar `index` (0-based), looping the machine's order. */
export function machineBarAt(machine: DrumMachine, index: number): number {
  const order = machineOrder(machine);
  const count = machineBarCount(machine);
  const at = ((index % order.length) + order.length) % order.length;
  const wanted = order[at] ?? 1;
  return Math.max(1, Math.min(count, Math.round(wanted)));
}

/**
 * The machine with its order set. Entries are kept as written, not truncated to
 * the bars that happen to exist yet.
 *
 * Deliberately unclamped to the bar count: a script may say `machine order 1 1 2 1`
 * before (or instead of) growing the machine to two bars, and `machineBarAt` clamps
 * when it PLAYS — so the order and the bars can be written in either order and mean
 * the same thing. An empty list is kept empty — "bar 1 forever" — rather than
 * written out as `[1]`, so an order the author cleared leaves the file as it was.
 */
export function setMachineOrder(machine: DrumMachine, list: readonly number[]): DrumMachine {
  const order = list.map((entry) => Math.max(1, Math.round(Number.isFinite(entry) ? entry : 1)));
  return { ...machine, order };
}

/**
 * A brand-new machine: four silent pads, straight down the middle.
 *
 * Four, because that is a kit and a machine should be playable the moment it
 * exists; every row is a rest, because a machine that arrived with a beat already
 * in it would be putting words in the author's mouth.
 */
export function createMachine(steps: number = DEFAULT_MACHINE_STEPS): DrumMachine {
  const size = clampMachineSteps(steps);
  return {
    enabled: true,
    steps: size,
    beat: DEFAULT_MACHINE_BEAT,
    swing: 0,
    level: DEFAULT_PAD_LEVEL,
    pan: 0,
    bus: null,
    verb: 0,
    echo: 0,
    duck: 0,
    effects: { ...NO_EFFECTS },
    pads: Array.from({ length: INITIAL_PADS }, (_, i) => defaultPad(i + 1, size)),
    // One bar to begin with, and no order: a machine that says nothing extra is
    // the machine this build always made, in the file and in memory alike.
    bars: [],
    order: [],
  };
}

/**
 * The same machine with a different number of steps, every row resized in step.
 *
 * Grow and the new steps are rests; shrink and the tail is dropped. It is the one
 * way `steps` changes, which is what keeps the field and the rows from ever
 * disagreeing — the invariant a file reader and the tab both rely on.
 */
export function resizeMachine(machine: DrumMachine, steps: number): DrumMachine {
  const size = clampMachineSteps(steps);
  return {
    ...machine,
    steps: size,
    pads: machine.pads.map((pad) => ({ ...pad, steps: resizeRow(pad.steps, size) })),
    // Every BAR moves with the machine, so the field and all the rows — bar 1
    // included — can never disagree about how long a bar is.
    bars: machine.bars.map((bar) => bar.map((row) => resizeRow(row, size))),
  };
}

/** A row resized to `steps`, padded with rests and truncated. */
export function resizeRow(row: readonly number[], steps: number): number[] {
  const size = clampMachineSteps(steps);
  const out = emptyRow(size);
  for (let i = 0; i < Math.min(size, row.length); i++) out[i] = clampHitVelocity(row[i] ?? 0);
  return out;
}

/** A hit's velocity, 0..100, rounded. `0` is a rest. */
export function clampHitVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 0;
  return Math.max(0, Math.min(100, Math.round(velocity)));
}

// --- the pattern string -----------------------------------------------------

/**
 * The character a pad pattern writes a velocity with: `9` is a full hit, `1` the
 * softest, and `.` a rest.
 *
 * The mapping is ninths because a single character has to carry a velocity, and
 * nine bands is what a row of type can hold without a legend: `9...9...` reads as
 * four-on-the-floor to anyone who has used a drum machine, and a `5` in a hat row
 * reads as "a lighter tick" without arithmetic.
 */
export function padPatternChar(velocity: number): string {
  const amount = clampHitVelocity(velocity);
  if (amount <= 0) return PAD_REST_CHAR;
  return String(Math.max(1, Math.min(9, Math.round((amount / 100) * 9))));
}

/** The velocity a pattern character means: `.` is a rest, `1`..`9` a hit. */
export function padPatternVelocity(char: string): number | null {
  if (char === PAD_REST_CHAR) return 0;
  if (char.length !== 1 || char < '1' || char > '9') return null;
  return Math.round((Number(char) / 9) * 100);
}

/** A pad's row as the string a script writes and `SAVE AS SCRIPT` prints. */
export function padPatternString(row: readonly number[], steps: number): string {
  return resizeRow(row, steps).map((velocity) => padPatternChar(velocity)).join('');
}

/** Either a row of hits, or the sentence explaining why the text is not one. */
export type PadPatternResult = { ok: true; row: number[] } | { ok: false; message: string };

/**
 * Read a pad pattern string into a row, or return the sentence a refusal prints.
 *
 * The text may be shorter than the machine and the tail is rests — a one-bar
 * figure under a longer machine simply stops — but it may not be LONGER, which is
 * the one mistake that would otherwise be silent: the steps past the end would
 * have nowhere to go, and a beat that quietly loses its last hits is worse than
 * a line that is refused.
 */
export function parsePadPattern(text: string, steps: number, padName: string): PadPatternResult {
  const size = clampMachineSteps(steps);
  const body = stripQuotes(text.trim());
  if (body.length > size) {
    return {
      ok: false,
      message: `pad "${padName}" has a ${body.length}-step pattern but the machine has ${size}. Write at most ${size} characters, or widen the machine first: "machine steps ${body.length}".`,
    };
  }
  const row = emptyRow(size);
  for (let i = 0; i < body.length; i++) {
    const velocity = padPatternVelocity(body[i]);
    if (velocity === null) {
      return {
        ok: false,
        message: `pad "${padName}": "${body[i]}" is not a hit. A pad pattern is "." for a rest and 1-9 for how hard the hit lands, e.g. "9...9...9...9...".`,
      };
    }
    row[i] = velocity;
  }
  return { ok: true, row };
}

/** The inside of a quoted token, or the token as given when it is not quoted. */
function stripQuotes(text: string): string {
  if (text.length >= 2 && (text.startsWith('"') || text.startsWith("'")) && text.endsWith(text[0])) {
    return text.slice(1, -1);
  }
  return text;
}

// --- reading a machine ------------------------------------------------------

/** The pad numbered `index` (1-based), or null when the machine has no such pad. */
export function padAt(machine: DrumMachine, index: number): DrumPad | null {
  return machine.pads[index - 1] ?? null;
}

/**
 * The machine with pad `index` set to `pad`, growing the list with DEFAULT pads
 * when the index is past the end.
 *
 * Growing with defaults is what lets `pad 5` mean the fifth pad whether or not
 * pads 1-4 were written: the machine always reads forward from pad 1, and the
 * pads in between are the kit drums they would have been.
 */
export function withPad(machine: DrumMachine, index: number, pad: DrumPad): DrumMachine {
  const at = clampPadIndex(index);
  const pads = machine.pads.slice();
  while (pads.length < at) pads.push(defaultPad(pads.length + 1, machine.steps));
  pads[at - 1] = pad;
  return { ...machine, pads };
}

/** How hard pad `index` is hit on step `step`: 0 for a rest, or no such pad. */
export function machineHit(machine: DrumMachine, index: number, step: number): number {
  if (step < 0 || step >= machine.steps) return 0;
  return padAt(machine, index)?.steps[step] ?? 0;
}

/** How many hits the machine holds, across every pad. */
export function countMachineHits(machine: DrumMachine): number {
  let count = 0;
  // Every BAR, so a machine whose beat lives in bar 2 is not called empty.
  const bars = [machine.pads.map((pad) => pad.steps), ...machine.bars];
  for (const bar of bars) {
    for (const row of bar) for (const velocity of row) if (velocity > 0) count += 1;
  }
  return count;
}

/** True when the machine would make a sound: it exists, is on, and has a hit. */
export function machineActive(machine: DrumMachine | null | undefined): machine is DrumMachine {
  return machine != null && machine.enabled && countMachineHits(machine) > 0;
}

/** How many pads a machine has, so a summary can say it without counting twice. */
export function countPads(machine: DrumMachine): number {
  return machine.pads.length;
}

/**
 * One line naming the machine, for a status bar and a toast.
 *
 * The same shape as the app's other summaries: what it is, then the two numbers
 * that say how much of it there is. Silence is said rather than implied, because
 * a machine that is on and empty looks exactly like one that is broken.
 */
export function machineLabel(machine: DrumMachine): string {
  const pads = countPads(machine);
  const hits = countMachineHits(machine);
  if (!machine.enabled) return `MACHINE OFF  \u00b7  ${pads} PADS`;
  if (hits === 0) return `MACHINE  \u00b7  ${pads} PADS  \u00b7  NO HITS YET`;
  return `MACHINE  \u00b7  ${pads} PADS  \u00b7  ${hits} HITS`;
}

/**
 * A machine as data for a tool, an agent or a file: the mix as numbers, and every
 * pad's row as the same pattern string a script writes.
 *
 * The counterpart of `padPatternString` for the whole instrument, so a caller
 * that only has the model can print a machine back out without knowing how a
 * velocity is stored — and the reason the API's `machine.describe` needs no
 * second traversal.
 */
export interface MachineDescription {
  enabled: boolean;
  steps: number;
  beat: number;
  swing: number;
  level: number;
  pan: number;
  bus: string | null;
  verb: number;
  echo: number;
  duck: number;
  effects: ChannelEffects;
  /** How many bars the machine has, and which one plays in each song bar. */
  barCount: number;
  order: number[];
  /**
   * Bars 2..n, each as one pattern string per pad — the readable form of what
   * `bars` holds. Bar 1 is the `pads` below, and is not repeated here, for the same
   * reason the model does not repeat it.
   */
  bars: string[][];
  pads: {
    name: string;
    pitch: number;
    /** How far the pitch sits from the pad's kit drum, in semitones — the `tune` a script sets. */
    tune: number;
    level: number;
    pan: number;
    /** The recording the pad names, or null — the `sample` a script and a file carry. */
    sample: string | null;
    /** The row as plain velocities, 0..100 — the lossless reading. */
    steps: number[];
    /** The same row as the string a script writes — the readable one. */
    pattern: string;
  }[];
}

export function describeMachine(machine: DrumMachine): MachineDescription {
  return {
    enabled: machine.enabled,
    steps: machine.steps,
    beat: machine.beat,
    swing: machine.swing,
    level: machine.level,
    pan: machine.pan,
    bus: machine.bus,
    verb: machine.verb,
    echo: machine.echo,
    duck: machine.duck,
    effects: { ...machine.effects },
    barCount: machineBarCount(machine),
    order: machineOrder(machine),
    bars: machine.bars.map((bar) =>
      machine.pads.map((_pad, index) => padPatternString(bar[index] ?? [], machine.steps)),
    ),
    pads: machine.pads.map((pad, index) => ({
      name: pad.name,
      pitch: pad.pitch,
      // Tuning is always measured from the pad's KIT pitch, which is what makes
      // `pad 5 tune -4` mean one thing however many times it is written — so the
      // description reports the same number an edit and a script both write.
      tune: pad.pitch - defaultPad(index + 1, machine.steps).pitch,
      level: pad.level,
      pan: pad.pan,
      sample: pad.sample,
      steps: pad.steps.slice(),
      pattern: padPatternString(pad.steps, machine.steps),
    })),
  };
}
