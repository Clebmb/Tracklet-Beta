/**
 * ops/machine — reading a song's DRUM MACHINE back out.
 *
 * The drum machine is a song-level instrument: pads you design, a step grid you
 * draw one hit at a time, and its own little mix beside the tracker's channels.
 * `script.apply` writes one, `song.edit` changes it a field at a time, and this is
 * the third leg — the READ. Without it an agent could build a beat but not look at
 * the one it built, which is the shape that leads a model to regenerate a whole
 * machine to change one hit.
 *
 * The answer is `describeMachine` from the model, passed through untouched, because
 * the model already needs that digest for its own tests and its own tab: the mix as
 * numbers, and every pad's row as BOTH the plain velocities (what a caller computes
 * with) and the pattern string a script writes (what a caller, or a person, reads).
 * A pad's `tune` is in there too, next to its absolute `pitch`, so the number an
 * agent changes is the one it can also see.
 *
 * A song with no machine is not an error: `machine` is null and `hasMachine` says
 * so, which is the honest answer to "what is the drum machine doing" for a song
 * that has not got one yet.
 */

import { countMachineHits, describeMachine, machineLabel } from '../../../src/model';
import { field, schema, type ApiOperation } from '../operation';
import { ok } from '../result';
import { songFromInput } from '../songAccess';

export const machineOperations: ApiOperation[] = [
  {
    name: 'machine.describe',
    title: 'Read the drum machine',
    summary:
      "The song's drum machine as data: its mix and clock, then each pad's name, sound, pitch and row — as hit velocities and as the pattern string a script writes. Null when the song has none.",
    category: 'machine',
    example: {},
    input: schema({
      song: field('object', 'The song whose machine to read. Omit to read a blank song, which has none.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
    }),
    run: (input) => {
      const machine = songFromInput(input)?.machine ?? null;
      return ok({
        hasMachine: machine !== null,
        label: machine ? machineLabel(machine) : null,
        hits: machine ? countMachineHits(machine) : 0,
        pads: machine ? machine.pads.length : 0,
        machine: machine ? describeMachine(machine) : null,
      });
    },
  },
];
