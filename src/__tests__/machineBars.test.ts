/**
 * Machine BARS and an ORDER — the machine's own little arrangement.
 *
 * One machine bar was the whole of the drum machine: a beat that looped forever.
 * These tests hold the three claims that make a SECOND bar mean something:
 *
 *   • the MODEL keeps bar 1 in the pads' own rows and the other bars beside them,
 *     so a one-bar machine is exactly the machine that existed before bars;
 *   • the SCRIPT and the FILE round-trip a machine that varies — `machine pattern
 *     N`, `machine order 1 1 2 1` — at version 38, while a one-bar machine still
 *     writes version 37;
 *   • the PLACEMENT plays the bar the order names in each song bar, which is the
 *     whole point of having more than one.
 */

import { describe, expect, it } from 'vitest';

import {
  MACHINE_BARS_SONG_FILE_VERSION,
  MACHINE_SONG_FILE_VERSION,
  applyScript,
  countMachineHits,
  createMachine,
  createSong,
  machineBarAt,
  machineBarCount,
  machineBarRows,
  machineOrder,
  resizeMachine,
  setMachineOrder,
  songFromJson,
  songToJson,
  songToScript,
  withMachineBar,
  addMachineBar,
  removeMachineBar,
  type DrumMachine,
  type Song,
} from '../model';
import { machineHitsInRange } from '../audio/machine';

/** A machine whose bar 1 is a kick on step 0 and whose bar 2 is a hit on step 4. */
function twoBars(): DrumMachine {
  const base = createMachine(8);
  const bar2 = base.pads.map((_pad, index) =>
    index === 0 ? [0, 0, 0, 0, 100, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0, 0],
  );
  const withBars = withMachineBar({ ...base, pads: base.pads.map((pad, i) => (i === 0 ? { ...pad, steps: [100, 0, 0, 0, 0, 0, 0, 0] } : pad)) }, 2, bar2);
  return setMachineOrder(withBars, [1, 2]);
}

describe('the machine keeps bar 1 in the pads and the rest beside them', () => {
  it('counts bar 1 plus the extra bars', () => {
    const machine = twoBars();
    expect(machineBarCount(machine)).toBe(2);
    expect(machineBarCount(createMachine(8))).toBe(1);
  });

  it('reads a bar as one row per pad', () => {
    const machine = twoBars();
    expect(machineBarRows(machine, 1)[0]?.[0]).toBe(100);
    expect(machineBarRows(machine, 2)[0]?.[4]).toBe(100);
    expect(machineBarRows(machine, 2)[0]?.[0]).toBe(0);
  });

  it('grows with RESTS when a bar is named past the end', () => {
    const grown = withMachineBar(createMachine(4), 3, [[100, 0, 0, 0]]);
    expect(machineBarCount(grown)).toBe(3);
    // Bar 2 was never written, so it is silence rather than a copy.
    expect(grown.bars[0]?.[0]).toEqual([0, 0, 0, 0]);
    expect(grown.bars[1]?.[0]).toEqual([100, 0, 0, 0]);
  });

  it('adds a bar as a COPY of the last, so a variation starts as the beat', () => {
    const one = createMachine(4);
    one.pads[0] = { ...one.pads[0], steps: [0, 100, 0, 0] };
    const two = addMachineBar(one);
    expect(machineBarCount(two)).toBe(2);
    expect(machineBarRows(two, 2)[0]).toEqual([0, 100, 0, 0]);
    // And it is a COPY, not a share.
    expect(two.bars[0]?.[0]).not.toBe(one.pads[0]?.steps);
  });

  it('drops a bar and clamps what the order pointed at beyond it', () => {
    const three = withMachineBar(twoBars(), 3, [[0, 0, 0, 0, 0, 0, 0, 100]]);
    const ordered = setMachineOrder(three, [1, 2, 3]);
    const trimmed = removeMachineBar(ordered, 3);
    expect(machineBarCount(trimmed)).toBe(2);
    // The order is not renumbered: what pointed at the removed bar clamps to the
    // last one that is left, so the third song bar still plays a beat.
    expect(machineOrder(trimmed)).toEqual([1, 2, 2]);
    // Bar 1 is never dropped.
    expect(removeMachineBar(trimmed, 1)).toBe(trimmed);
  });

  it('resizes every bar with the machine, so no bar can disagree about length', () => {
    const wider = resizeMachine(twoBars(), 16);
    expect(wider.pads[0]?.steps).toHaveLength(16);
    expect(machineBarRows(wider, 2)[0]).toHaveLength(16);
  });

  it('counts hits in every bar, so a beat in bar 2 is not called empty', () => {
    const machine = twoBars();
    expect(countMachineHits(machine)).toBe(2);
  });

  it('plays bar 1 forever when there is no order', () => {
    const machine = withMachineBar(createMachine(4), 2, [[0, 0, 100, 0]]);
    expect(machineOrder(machine)).toEqual([1]);
    expect([0, 1, 2, 3].map((index) => machineBarAt(machine, index))).toEqual([1, 1, 1, 1]);
  });

  it('walks the order by song bar, and clamps a bar past the end', () => {
    const machine = setMachineOrder(twoBars(), [1, 2]);
    expect([0, 1, 2, 3].map((index) => machineBarAt(machine, index))).toEqual([1, 2, 1, 2]);
    // An order naming a bar that does not exist clamps to the last one at PLAY time.
    expect(machineBarAt(setMachineOrder(machine, [9]), 0)).toBe(machineBarCount(machine));
  });
});

const SOURCE = [
  'new',
  'song "TWO BARS"',
  'tempo 120',
  'tracks 1',
  'track 1 "BASS" voice bass',
  'machine steps 16 beat 4',
  'pad 1 "KICK" pattern "9..............."',
  'machine pattern 2',
  'pad 1 pattern "....9..........."',
  'machine order 1 1 2 1',
  '',
].join('\n');

function song(): Song {
  const applied = applyScript(createSong(), SOURCE);
  if (!applied.ok) throw new Error(`the fixture must parse: ${JSON.stringify(applied.errors)}`);
  return applied.song;
}

describe('a machine that varies crosses the script and the file', () => {
  it('parses `machine pattern N` and `machine order`, writing the row into that bar', () => {
    const parsed = song();
    expect(machineBarCount(parsed.machine!)).toBe(2);
    expect(machineBarRows(parsed.machine!, 1)[0]?.[0]).toBe(100);
    expect(machineBarRows(parsed.machine!, 2)[0]?.[4]).toBe(100);
    expect(machineOrder(parsed.machine!)).toEqual([1, 1, 2, 1]);
  });

  it('round-trips through SAVE AS SCRIPT', () => {
    const before = song();
    const written = applyScript(createSong(), songToScript(before));
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(written.song.machine).toEqual(before.machine);
  });

  it('round-trips through the JSON format', () => {
    const before = song();
    const back = songFromJson(songToJson(before));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.machine).toEqual(before.machine);
  });

  it('writes version 38 for a machine with more than one bar', () => {
    const raw = JSON.parse(songToJson(song())) as { version: number };
    expect(raw.version).toBe(MACHINE_BARS_SONG_FILE_VERSION);
  });

  it('leaves a one-bar machine at version 37', () => {
    const one = applyScript(createSong(), 'new\nsong "ONE"\ntracks 1\npad 1 pattern "9...9..."\n');
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const raw = JSON.parse(songToJson(one.song)) as { version: number };
    expect(raw.version).toBe(MACHINE_SONG_FILE_VERSION);
  });
});

describe('the order decides which bar plays in each song bar', () => {
  it('places bar 2 in the second song bar', () => {
    const track = song();
    // 16 rows to a song bar at the default. The order (1, 1, 2, 1) plays: bar 1's
    // kick at row 0, bar 1 again at 16, bar 2's hit on its step 4 at 32+4, bar 1
    // again at 48 — and stops before row 64.
    const hits = machineHitsInRange(track.machine, 4, 0, 64);
    expect(hits.map((hit) => hit.row)).toEqual([0, 16, 36, 48]);
  });
});
