/**
 * A machine-only song, end to end — the guard the roadmap asked for.
 *
 * `machine.test.ts` proves the model, the file and the placement arithmetic.
 * `golden.test.ts` proves a machine fixture is unmoved. What neither owns is the
 * CLAIM a machine-only song makes to an author: that a script with no channel notes
 * at all is a real, playable song — it parses, it survives a round trip through
 * `SAVE AS SCRIPT`, and it reaches the renderer as something that makes a sound.
 *
 * ── What "non-silent" can honestly mean in a headless test ──────────────────
 *
 * `renderSongToPcm` needs an `OfflineAudioContext`, which a Node test runner does
 * not have (`canRender()` says so), so the DSP is not run here. What IS checked is
 * its INPUT: the plan the renderer is handed places at least one hit, at a non-zero
 * velocity, through a machine whose gain is above zero — the three ways a machine
 * could be silent (no hit, a hit at velocity 0, a fader at 0) are each ruled out.
 * That is the same bargain `golden.test.ts` makes with its hash, and it is stated
 * rather than left for a reader to assume.
 */

import { describe, expect, it } from 'vitest';

import { machineGain, machineHitsInRange, machineLoopRows } from '../audio/machine';
import {
  applyScript,
  countMachineHits,
  createSong,
  songToJson,
  songToScript,
  type Song,
} from '../model';
import { renderPlan } from './goldenPlan';

/**
 * A machine and nothing else: no notes, no drum channel — the beat is the whole
 * song. Two bars so the arrangement is real, and a pad the kit does not name, so
 * the guard covers a designed sound as well as a kit drum.
 */
const MACHINE_ONLY = [
  'new',
  'song "JUST THE MACHINE"',
  'key D minor',
  'tempo 122',
  'tracks 1',
  '',
  'track 1 "BASS" voice bass',
  '',
  'machine steps 8 beat 4 swing 30 level 90 pan -10 duck 40 verb 20',
  'machine drive 25',
  'pad 1 "KICK" pattern "9...9..."',
  'pad 2 "SNARE" pattern "....9..."',
  'pad 5 "TOM" wave membrane tune -4 pattern "..9...5."',
  '',
  'pattern 1 "A"',
  '.',
  '',
  'order 1 1',
  '',
].join('\n');

function song(): Song {
  const applied = applyScript(createSong(), MACHINE_ONLY);
  if (!applied.ok) throw new Error(`the fixture must parse: ${JSON.stringify(applied.errors)}`);
  return applied.song;
}

describe('a machine-only script is a whole song', () => {
  it('parses, with a machine and no channel notes', () => {
    const parsed = song();
    expect(parsed.machine).not.toBeNull();
    expect(parsed.machine?.pads).toHaveLength(5);
    // Three pads carry hits; the two kit pads left silent are rests, not notes.
    expect(countMachineHits(parsed.machine!)).toBe(5);
    expect(parsed.patterns[0]?.steps.flat().every((cell) => cell.note === null && cell.drum === null)).toBe(true);
  });

  it('survives SAVE AS SCRIPT, landing on the same plan', () => {
    const before = song();
    const written = applyScript(createSong(), songToScript(before));
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    // The script is the whole song: re-applying it produces the same plan, byte
    // for byte, machine included.
    expect(renderPlan(written.song)).toBe(renderPlan(before));
  });

  it('writes a file the build can open, at the machine version', () => {
    const text = songToJson(song());
    expect(text).toContain('"machine"');
    expect(text).toContain('"version": 37');
    // And a song with no machine writes none of it.
    expect(songToJson(createSong())).not.toContain('"machine"');
  });

  it('is wiped by `new`, so a machine cannot outlive the song that asked for it', () => {
    // A script that says `new` starts a BLANK song — including the drum machine.
    // The bug this pins: `resetInto` reset every other song-level thing (tracks,
    // patterns, order, buses, sections) but not `machine`, so applying a fresh
    // script after a beat left the old pads and hits in place, and a new beat was
    // drawn ON TOP of the last one.
    const withMachine = song();
    expect(withMachine.machine).not.toBeNull();
    const blanked = applyScript(withMachine, [
      'new',
      'song "AFTER"',
      'tracks 1',
      'track 1 "LEAD" voice lead',
    ].join('\n'));
    expect(blanked.ok).toBe(true);
    if (!blanked.ok) return;
    expect(blanked.song.machine).toBeNull();
    // And a file written from it carries no machine at all.
    expect(songToJson(blanked.song)).not.toContain('"machine"');
  });

  it('reaches the renderer as something that makes a sound', () => {
    const track = song();
    const machine = track.machine;
    if (!machine) throw new Error('the fixture has a machine');
    const loop = machineLoopRows(machine, track.rowsPerBeat);
    const hits = machineHitsInRange(machine, track.rowsPerBeat, 0, loop[machine.steps] ?? 0);
    // A hit is placed in the loop...
    expect(hits.length).toBeGreaterThan(0);
    // ...at a velocity that is audible...
    expect(hits.every((hit) => hit.velocity > 0)).toBe(true);
    // ...through a machine whose fader is up and whose beat is played.
    expect(machine.enabled).toBe(true);
    expect(machineGain(machine)).toBeGreaterThan(0);
  });
});
