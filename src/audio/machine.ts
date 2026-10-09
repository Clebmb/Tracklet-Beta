/**
 * machine — where the drum machine's grid lands in the song's clock.
 *
 * `model/machine.ts` owns what a machine IS: pads, a row of hits per pad, a fader
 * and a loop length. This file owns the one thing neither the model nor the two
 * schedulers can own alone — WHEN a hit happens. The live engine races a real
 * clock and the offline renderer is handed the whole song at once, so they cannot
 * share a loop; but they can, and must, share the answer to "which pad fires on
 * which row", or a beat would sound one way live and another in an export.
 *
 * ── What a machine step is in song rows ──────────────────────────────────────
 * A machine says how many of its steps are one BEAT (`beat`), and the song says
 * how many of its rows are one beat (`rowsPerBeat`). One machine step is therefore
 * `rowsPerBeat / beat` song rows — exactly one row at the default four-and-four,
 * half a row when a machine counts eight to the beat over a song that counts four.
 * Measuring in ROWS rather than seconds is the whole trick: a row already carries
 * the tempo map, the swing and the master speed, so a hit placed at a row lands
 * where the song says, whatever the song is doing at that moment.
 *
 * ── The machine's own swing ──────────────────────────────────────────────────
 * A machine's `swing` leans its own pairs the way the song's `swing` leans the
 * song's — through the same `stepTimeFactor`, so the two are one idea. The song's
 * swing has already moved the row boundaries this file places hits inside; the
 * machine's moves the hits within its own loop. Both are heard, which is what
 * "song and machine together" means.
 *
 * Pure, like everything in `model/`, so the placement is unit tested without a
 * browser. `machine.test.ts` is the other half of that claim.
 */

import {
  machineActive,
  machineBarAt,
  machineBarCount,
  machineBarRows,
  machineOrder,
  clampMachineSteps,
  type DrumMachine,
  type DrumPad,
} from '../model/machine';
import { orderSectionLabels, sectionByName } from '../model/sections';
import { clampLevel, clampPan, MIN_DUCK, MAX_LEVEL, stepTimeFactor, type Song } from '../model/song';
import type { ChannelChainOptions } from './chain';

/**
 * How many song rows one machine step spans, before either swing.
 *
 * The one conversion between the machine's grid and the song's. Always positive —
 * `beat` is clamped to at least one by the model — so a caller can divide by it.
 */
export function machineUnitRows(machine: DrumMachine, rowsPerBeat: number): number {
  const beat = Math.max(1, Math.round(machine.beat));
  const rows = Math.max(1, Math.round(rowsPerBeat));
  return rows / beat;
}

/**
 * The machine's step boundaries within ONE loop, in song rows: `steps + 1` numbers.
 *
 * `[i]` is where step `i` begins and `[steps]` is where the loop ends, which is
 * the length a caller steps by to find the next loop. The machine's own swing is
 * built in here, so every consumer gets the same leaning grid rather than each
 * re-deriving it.
 */
export function machineLoopRows(machine: DrumMachine, rowsPerBeat: number): number[] {
  const unit = machineUnitRows(machine, rowsPerBeat);
  const steps = clampMachineSteps(machine.steps);
  const out: number[] = [0];
  let at = 0;
  for (let i = 0; i < steps; i++) {
    at += unit * stepTimeFactor(machine.swing, i);
    out.push(at);
  }
  return out;
}

/** One machine step's length in seconds, from a song row's length in seconds. */
export function machineStepSeconds(machine: DrumMachine, rowSeconds: number, rowsPerBeat: number): number {
  return machineUnitRows(machine, rowsPerBeat) * rowSeconds;
}

/**
 * Which step of the machine's own loop a song ROW falls on, or -1 when none.
 *
 * The machine's grid is its own — a step may span a fraction of a song row, or
 * more than one — so this asks the same `machineLoopRows` the scheduler places
 * hits by, and the two cannot disagree about which column is sounding. `row` is a
 * song row measured the way the engine measures it (from the start of the song),
 * and the loop repeats every `loopRows`. The playhead on the drum machine's page
 * is the one caller: it lights the column the beat is passing through.
 */
export function machineStepAtRow(machine: DrumMachine, rowsPerBeat: number, row: number): number {
  if (!Number.isFinite(row) || row < 0) return -1;
  const steps = clampMachineSteps(machine.steps);
  const loop = machineLoopRows(machine, rowsPerBeat);
  const loopRows = loop[steps] ?? 0;
  if (!(loopRows > 0)) return -1;
  const rel = row % loopRows;
  for (let i = steps - 1; i >= 0; i -= 1) {
    if (rel >= (loop[i] ?? 0)) return i;
  }
  return 0;
}

/** One pad firing: which pad, and how hard. */
export interface MachineStepHit {
  /** Pad number, 1-based, as the language and the tab name it. */
  pad: number;
  /** Pad index, 0-based, for `machine.pads[padIndex]`. */
  padIndex: number;
  /** How hard the hit lands, 1..100. */
  velocity: number;
}

/**
 * The pads that fire on one step of the machine's loop, in pad order.
 *
 * `step` is the index within the loop, so a caller walking its own hits can ask
 * about the step it holds rather than about its absolute place in the order.
 */
export function machineHitsOnStep(machine: DrumMachine, step: number): MachineStepHit[] {
  return machineBarHitsOnStep(machine, 1, step);
}

/**
 * The pads that fire on one step of ONE machine BAR, in pad order.
 *
 * `machineHitsOnStep` is this for bar 1 — the bar every one-bar machine has — and
 * a scheduler asks about the bar the ORDER names for the song bar it is placing,
 * which is what lets a beat change across the form without a second instrument.
 */
export function machineBarHitsOnStep(machine: DrumMachine, bar: number, step: number): MachineStepHit[] {
  const size = clampMachineSteps(machine.steps);
  if (step < 0 || step >= size) return [];
  const rows = machineBarRows(machine, bar);
  const hits: MachineStepHit[] = [];
  machine.pads.forEach((_pad, padIndex) => {
    const velocity = rows[padIndex]?.[step] ?? 0;
    if (velocity > 0) hits.push({ pad: padIndex + 1, padIndex, velocity });
  });
  return hits;
}

/** One hit with the song-row position it lands on, so a scheduler can place it. */
export interface MachineHit extends MachineStepHit {
  /** The fractional song row the hit sits on, measured from the order's first step. */
  row: number;
  /** The machine step within its loop this hit belongs to, 0-based. */
  step: number;
}

/**
 * Every machine hit whose row falls in `[fromRow, toRow)`, in time order.
 *
 * The one function the engine and the renderer both call, once per song step, so
 * neither has to keep a machine playhead of its own and the two can never drift:
 * a hit belongs to the step that contains its row, and asking twice about the same
 * span answers the same hits twice.
 *
 * The range is half-open, so stepping by one schedules each hit exactly once. A
 * machine that is off or empty answers nothing, which is what keeps a silent
 * machine free of the arithmetic.
 */
export function machineHitsInRange(
  machine: DrumMachine | null | undefined,
  rowsPerBeat: number,
  fromRow: number,
  toRow: number,
  /**
   * The machine bar each song bar plays, from `machineBarsForSong`, when the song
   * has sections that name one. Omitted (or empty) leaves the machine's own
   * `order` to answer, which is every machine before sections could name a bar.
   */
  bars?: readonly (number | null)[],
): MachineHit[] {
  if (!machineActive(machine)) return [];
  const loop = machineLoopRows(machine, rowsPerBeat);
  const size = machine.steps;
  const loopRows = loop[size] ?? 0;
  if (!(loopRows > 0) || toRow <= fromRow) return [];

  const hits: MachineHit[] = [];
  // Which BAR each loop plays is the machine's order, walked by SONG bar — so the
  // second time round the form can be a different beat. Bar 1 forever when the
  // order is empty, which is every machine that has one bar.
  const first = Math.floor(fromRow / loopRows);
  // A generous guard rather than an unbounded walk: a caller asking about a whole
  // song walks one loop per bar, and a caller asking about one step walks one.
  const guard = 4096;
  let walked = 0;
  for (let index = first; walked < guard; index++, walked++) {
    const base = index * loopRows;
    if (base >= toRow) break;
    for (let step = 0; step < size; step++) {
      const row = base + (loop[step] ?? 0);
      if (row >= toRow) break;
      if (row < fromRow) continue;
      // An entry of `null` is a bar that plays NOTHING — the LIVE page's way of
      // sitting the machine out in one scene — so the hit is skipped rather than
      // falling back to the machine's own order.
      let bar: number;
      if (bars && bars.length > 0) {
        const pick = bars[index % bars.length];
        if (pick === null) continue;
        bar = pick ?? machineBarAt(machine, index);
      } else {
        bar = machineBarAt(machine, index);
      }
      for (const hit of machineBarHitsOnStep(machine, bar, step)) hits.push({ ...hit, row, step });
    }
  }
  return hits;
}

/**
 * The machine BAR each song bar plays, with the sections' own choices folded in.
 *
 * The one place the FORM and the beat meet. A section may name the machine bar it
 * plays (`section CHORUS 3 4 machine 2`), and where it does that bar governs every
 * song bar the section covers — the beat follows the form rather than a
 * hand-kept `machine order` list. Where a section names nothing (or the song's
 * arrangement no longer describes its order, so no bar can be attributed to a
 * section), the machine's own `order` answers, exactly as before.
 *
 * One entry per song bar of the order; a named bar is CLAMPED to the machine's
 * bar count at play time, the same bargain `machineBarAt` makes, so a section may
 * name bar 2 before the machine has one and simply play bar 1 until it does. Empty
 * for a song with no machine.
 */
export function machineBarsForSong(song: Song): number[] {
  const machine = song.machine;
  if (!machine) return [];
  const count = machineBarCount(machine);
  const fallback = machineOrder(machine);
  const labels = orderSectionLabels(song.order, song.sections, song.arrangement);
  return song.order.map((_bar, index) => {
    const label = labels[index] ?? null;
    const section = label === null ? null : sectionByName(song.sections, label);
    const wanted = section && section.machineBar != null ? section.machineBar : fallback[index % fallback.length] ?? 1;
    return Math.max(1, Math.min(count, Math.round(wanted)));
  });
}

/** Every machine hit in the whole loop, for a tool, a tab or a test. */
export function machineSchedule(machine: DrumMachine, rowsPerBeat: number): MachineHit[] {
  const loop = machineLoopRows(machine, rowsPerBeat);
  return machineHitsInRange(machine, rowsPerBeat, 0, loop[machine.steps] ?? 0);
}

/**
 * The machine's fader as a gain, 0..1, with its mix group's level folded in.
 *
 * The same two numbers `channelGain` multiplies for a channel, and the same
 * division by a hundred: the machine sits in the mix exactly the way a channel
 * does, so a group moved in the app moves the machine with it.
 */
export function machineGain(machine: DrumMachine, busLevel: number = MAX_LEVEL): number {
  const own = clampLevel(machine.level);
  const group = Number.isFinite(busLevel) ? clampLevel(busLevel) : MAX_LEVEL;
  return clampLevel((own * group) / 100) / 100;
}

/** True when the machine would duck the rest of the mix: it is on and asks to. */
export function machineDucks(machine: DrumMachine | null | undefined): boolean {
  return machine != null && machine.enabled && machine.duck > MIN_DUCK;
}

/**
 * The strip one PAD plays through, as `buildChannelChain` takes it.
 *
 * A pad has a fader and a place between the speakers and NOTHING else — no sends,
 * no effects, no duck — so a pad's strip is the smallest one the chain builder
 * makes: an input gain that IS the fader, and a stereo pair. That is what puts a
 * pad's `level` and `pan` in the audio path, where before there was one fader for
 * the whole machine and a pad's pan existed only in the file and the tab.
 *
 * Shared by the live engine and the offline renderer for the same reason the
 * placement arithmetic is: the two cannot disagree about which knob is a fader and
 * which is a place in the field. `level` is a GAIN here (0..1), the unit the chain
 * builder takes, exactly as `machineGain` is.
 */
export function padStripOptions(pad: DrumPad): ChannelChainOptions {
  return { level: clampLevel(pad.level) / 100, pan: clampPan(pad.pan), verb: 0, echo: 0 };
}
