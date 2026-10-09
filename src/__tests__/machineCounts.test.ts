/**
 * `machine pads N` and `machine bars N` — the drum machine's COUNTS in a script.
 *
 * Before these two settings the language could GROW a machine but never shrink
 * one: `pad 6` added a sixth pad and `machine pattern 3` grew a third bar, but
 * nothing could take either away, so the two buttons on the page that do — `DEL
 * PAD` and `- BAR` — had no script (and no MCP) counterpart, and `song.diff` had
 * to note a shrunk machine as something it could not say. These tests hold the two
 * new settings to the same semantics the page's buttons have, and hold the script
 * to the round trip a saved song makes.
 */

import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  machineBarCount,
  machineBarRows,
  padAt,
  songToScript,
  type Song,
} from '../model';

/** Apply a machine-only script to a fresh song, refusing to hide a parse error. */
function machineSong(lines: string[]): Song {
  const source = ['new', 'tracks 1', ...lines].join('\n');
  const applied = applyScript(createSong(), source);
  if (!applied.ok) throw new Error(`the script must parse: ${JSON.stringify(applied.errors)}`);
  return applied.song;
}

/** The script a saved song writes, re-read — the round trip a file makes. */
function roundTrip(song: Song): Song {
  const written = songToScript(song);
  const reread = applyScript(createSong(), written);
  if (!reread.ok) throw new Error(`a saved script must parse: ${JSON.stringify(reread.errors)}`);
  return reread.song;
}

describe('machine pads N sets how many pads a machine has', () => {
  it('grows the machine with the kit pads the way `pad N` does', () => {
    const song = machineSong(['machine pads 6', 'pad 6 TOM pattern "9...9..."']);
    expect(song.machine?.pads).toHaveLength(6);
    expect(padAt(song.machine!, 6)?.name).toBe('TOM');
  });

  it('shrinks from the last pad, and takes its row off every bar', () => {
    const song = machineSong([
      'machine pads 6 bars 3',
      'machine pattern 2',
      'pad 6 TOM pattern "9...9..."',
      'machine pads 4',
    ]);
    expect(song.machine?.pads).toHaveLength(4);
    // Every bar's rows follow the pads, so no ghost row for pad 5 or 6 survives.
    expect(song.machine?.bars.every((bar) => bar.length === 4)).toBe(true);
    expect(machineBarRows(song.machine!, 2)).toHaveLength(4);
  });

  it('refuses a pad count outside 1..8', () => {
    expect(applyScript(createSong(), 'machine pads 0').ok).toBe(false);
    expect(applyScript(createSong(), 'machine pads 99').ok).toBe(false);
    expect(applyScript(createSong(), 'machine pads nine').ok).toBe(false);
  });
});

describe('machine bars N sets how many bars a machine has', () => {
  it('grows by COPYING the last bar, as `+ BAR` does', () => {
    const song = machineSong(['pad 1 pattern "9...9..."', 'machine bars 3']);
    expect(machineBarCount(song.machine!)).toBe(3);
    // A variation starts as the beat, not as silence.
    expect(machineBarRows(song.machine!, 2)).toEqual(machineBarRows(song.machine!, 1));
    expect(machineBarRows(song.machine!, 3)).toEqual(machineBarRows(song.machine!, 1));
  });

  it('shrinks from the end, and bar 1 never goes', () => {
    const song = machineSong(['machine bars 4', 'machine bars 1']);
    expect(machineBarCount(song.machine!)).toBe(1);
  });

  it('refuses a bar count outside 1..16', () => {
    expect(applyScript(createSong(), 'machine bars 0').ok).toBe(false);
    expect(applyScript(createSong(), 'machine bars 99').ok).toBe(false);
  });

  it('leaves a bar context written after it on a bar that exists', () => {
    const song = machineSong(['machine bars 3', 'machine pattern 3', 'pad 2 SNARE pattern "9...9..."']);
    expect(machineBarCount(song.machine!)).toBe(3);
    const rows = machineBarRows(song.machine!, 3);
    expect(rows[1]?.some((velocity) => velocity > 0)).toBe(true);
  });
});

describe('a machine with counts survives the script round trip', () => {
  it('writes and re-reads a six-pad, three-bar machine unchanged', () => {
    const song = machineSong([
      'machine pads 6 bars 3',
      'pad 6 TOM pattern "9...9..."',
      'machine pattern 3',
      'pad 1 KICK pattern "9......."',
    ]);
    const reread = roundTrip(song);
    expect(reread.machine?.pads).toHaveLength(6);
    expect(machineBarCount(reread.machine!)).toBe(machineBarCount(song.machine!));
    expect(reread.machine).toEqual(song.machine);
  });
});
