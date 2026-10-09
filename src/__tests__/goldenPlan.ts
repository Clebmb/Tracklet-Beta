import { createHash } from 'node:crypto';

import { applyScript, createSong, patchForTrack, patchFromVoice, songToJson, type Song } from '../model';
import { describeMachine, type DrumMachine } from '../model/machine';
import { busLevelFor } from '../model/bus';
import { renderSeconds } from '../audio/render';
import { machineDucks, machineGain, machineHitsInRange, machineLoopRows, machineUnitRows, padStripOptions } from '../audio/machine';

/**
 * The render plan and its digest — the machinery behind every golden hash.
 *
 * Shared by `golden.test.ts` (the two hand-written fixture songs) and
 * `starterGolden.test.ts` (every `start` skeleton), so the two freeze the SAME
 * things. That is the point of it living here: what counts as "everything the
 * engine is handed" is one definition, and a later phase cannot quietly narrow
 * one tripwire without the other noticing.
 *
 * The plan is a song, as one string:
 *
 * - the song file the app would write for it — so the format, every field the
 *   writer omits, and every field it carries are covered;
 * - how long the render is (`renderSeconds`, which walks the tempo map, the swing
 *   and the tail exactly as the offline renderer does);
 * - the PATCH of every channel — voice plus stack, at layer level, which is what
 *   `buildNote` is actually given;
 * - every channel setting that is not part of a patch, named EXPLICITLY. The file
 *   above already carries these, so why list them twice? Because the file OMITS a
 *   setting that is at its default — which is the right thing for a format and the
 *   wrong thing for a tripwire: a knob that quietly acquired a non-zero default
 *   would leave every old song's bytes untouched and change how every old song
 *   SOUNDS. Naming the fields here means the day a default moves, the hash moves
 *   with it.
 *
 * ── What this does NOT cover, honestly ──────────────────────────────────────
 * The samples. `renderSongToPcm` needs an `OfflineAudioContext`, which a headless
 * test runner does not have (see `canRender()`), so the DSP is not run here. What
 * is frozen is the input to it: any change to the model, the file writer, the
 * timing arithmetic or the patch that would move a single sample shows up as a
 * different hash, while a change purely inside the oscillators or the room does
 * not.
 */

/** A song, from a script that must be clean — a fixture that does not parse hashes nothing. */
export function fixture(source: string): Song {
  const result = applyScript(createSong(), source);
  if (!result.ok) {
    throw new Error(`a golden song does not parse: ${result.errors.map((e) => `${e.line}: ${e.message}`).join(' | ')}`);
  }
  return result.song;
}

/**
 * The machine's place in the plan — what the scheduler and the synth are handed.
 *
 * The counterpart of the `patches` and `channels` blocks for the drum machine: a
 * song with one freezes its pads, its rows and the rows in the SONG's clock, so a
 * change to how a machine is placed, patched or levelled moves the hash even when
 * no track did. A song with NO machine leaves the key out entirely, which is what
 * keeps every fixture written before the machine hashing exactly as it was.
 */
function machinePlan(machine: DrumMachine, song: Song): unknown {
  const loop = machineLoopRows(machine, song.rowsPerBeat);
  return {
    describe: describeMachine(machine),
    unitRows: machineUnitRows(machine, song.rowsPerBeat),
    loopRows: loop,
    hits: machineHitsInRange(machine, song.rowsPerBeat, 0, loop[machine.steps] ?? 0),
    gain: machineGain(machine, busLevelFor(song.buses, machine.bus)),
    ducks: machineDucks(machine),
    patches: machine.pads.map((pad) => patchFromVoice(pad.voice)),
    // One strip per pad — the fader and the place in the field each pad's notes
    // are handed, which is a node rather than a number as of the per-pad strips.
    // Frozen for the same reason every channel's mix is: a pad's pan reaching the
    // audio path is a claim, and this is where a change to it shows up.
    strips: machine.pads.map((pad) => padStripOptions(pad)),
  };
}

export function renderPlan(song: Song): string {
  return JSON.stringify({
    file: songToJson(song),
    seconds: renderSeconds(song, { repeats: 1 }),
    // Left out when there is no machine, so a machine-less song hashes the exact
    // string it hashed before the machine existed.
    ...(song.machine ? { machine: machinePlan(song.machine, song) } : {}),
    patches: song.tracks.map((track) => patchForTrack(track)),
    channels: song.tracks.map((track) => ({
      level: track.level, pan: track.pan, glide: track.glide, vibrato: track.vibrato,
      verb: track.verb, echo: track.echo,
      drive: track.drive, chorus: track.chorus, crush: track.crush,
      punch: track.punch, tilt: track.tilt, gate: track.gate,
      cab: track.cab, tape: track.tape, radio: track.radio, vinyl: track.vinyl,
    })),
  });
}

/** The short, readable digest of a plan. Eighteen hex digits is plenty for a tripwire. */
export function goldenOf(song: Song): string {
  return createHash('sha256').update(renderPlan(song)).digest('hex').slice(0, 18);
}
