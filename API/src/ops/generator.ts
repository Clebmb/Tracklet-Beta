/**
 * ops/generator — the composer plugins as data, and a write as an instruction.
 *
 * A generator WRITES music: `euclid-drums` spreads a Euclidean rhythm over a
 * drum-machine pad, `bass-follow` hangs a bassline on the song's chord loop.
 * Both are constructive — they write ordinary pad rows and cells, the same
 * bargain `arp.generate` makes — so a preview and a write cannot disagree:
 * neither operation re-derives a rhythm. Both call the one function the script
 * word calls (`euclidPattern`, `bassFollowNotes`), over the plugin's own
 * expansion.
 *
 * `generator.describe` is the read half — which generators this build seats,
 * their ranges, and whether the song at hand has a loop and a machine to write
 * into. `generator.generate` is the write half, handing the changed song back.
 */

import {
  createMachine,
  createSong,
  defaultPad,
  ensurePattern,
  machineBarRows,
  MAX_MACHINE_BARS,
  MAX_PADS,
  padAt,
  SCRIPT_OCTAVE_MAX,
  SCRIPT_OCTAVE_MIN,
  setCellNotes,
  withMachineBar,
  withPad,
} from '../../../src/model';
import {
  BASS_RHYTHMS,
  bassFollowNotes,
  euclidPattern,
  euclidPatternString,
} from '../../../src/plugins/generator';
import { BUILT_IN_GENERATORS } from '../../../src/plugins/builtIn';
import { maybeNumber, maybeStr } from '../input';
import { field, schema, type ApiOperation } from '../operation';
import { ok, refuse } from '../result';
import { songFromInput } from '../songAccess';

/** The generators this build seats, as a caller reads them. */
function generatorRows(): unknown[] {
  return BUILT_IN_GENERATORS.map((plugin) => ({
    id: plugin.manifest.id,
    name: plugin.manifest.name,
    version: plugin.manifest.version,
    mode: plugin.mode,
    description: plugin.manifest.description ?? null,
  }));
}

export const generatorOperations: ApiOperation[] = [
  {
    name: 'generator.describe',
    title: 'Read the composer plugins',
    summary:
      'The generator plugins this build seats — euclid-drums (a Euclidean rhythm for a drum-machine pad) and bass-follow (a bassline hanging on the song\u2019s chord loop) — their ranges, and whether the song at hand has a machine and a loop to write into.',
    category: 'generator',
    example: {},
    input: schema({
      song: field('object', 'The song to read the loop and the machine from. Omit to list the generators alone.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
    }),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      return ok({
        generators: generatorRows(),
        machine: song.machine
          ? { steps: song.machine.steps, pads: song.machine.pads.length, bars: 1 + song.machine.bars.length }
          : null,
        progression: song.progression
          ? { chords: song.progression.steps.length, hold: song.progression.hold }
          : null,
        rhythms: [...BASS_RHYTHMS],
        ranges: {
          pad: { min: 1, max: MAX_PADS },
          bar: { min: 1, max: MAX_MACHINE_BARS },
          octave: { min: SCRIPT_OCTAVE_MIN, max: SCRIPT_OCTAVE_MAX },
        },
      });
    },
  },
  {
    name: 'generator.generate',
    title: 'Write what a generator composes',
    summary:
      'Ask euclid-drums for a rhythm (pulses over a pad\u2019s row, turned by rotate, into a machine bar) or bass-follow for a bassline (the loop\u2019s roots from a row on a channel, thinned by a rhythm) — written into the song as ordinary rows and cells, and handed back with exactly what was written.',
    category: 'generator',
    example: { generator: 'euclid', pad: 1, pulses: 5 },
    input: schema(
      {
        song: field('object', 'The song to write into. Omit to write into a blank song.'),
        songJson: field('string', 'The same, as the text of a .json song file.'),
        generator: field('string', 'Which composer to ask: euclid (a rhythm) or bass (a bassline).'),
        pad: field('number', 'Euclid only: the drum-machine pad (1-based) the rhythm is written to.'),
        pulses: field('number', 'Euclid only: how many hits the machine\u2019s steps hold.'),
        rotate: field('number', 'Euclid only: how many steps to turn the rhythm forward. Defaults to 0.'),
        bar: field('number', 'Euclid only: which machine bar owns the row. Defaults to 1.'),
        pattern: field('number', 'Bass only: the pattern number (1-based) to write into; created if it does not exist.'),
        row: field('number', 'Bass only: the step (0-based) the bassline starts on.'),
        track: field('number', 'Bass only: the channel (1-based) the bassline is written to.'),
        rhythm: field('string', 'Bass only: four (every chord), half (every other) or offbeat. Defaults to four.'),
        octave: field('number', `Bass only: the octave for the roots, ${SCRIPT_OCTAVE_MIN}..${SCRIPT_OCTAVE_MAX}. Defaults to 2.`),
      },
      ['generator'],
    ),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const which = (maybeStr(input, 'generator') ?? '').trim().toLowerCase();
      if (which !== 'euclid' && which !== 'bass') {
        refuse('invalid_input', '"generator" must be euclid (a rhythm for a pad) or bass (a bassline for a channel).');
      }

      if (which === 'euclid') {
        const rawPad = maybeNumber(input, 'pad');
        const rawPulses = maybeNumber(input, 'pulses');
        if (rawPad === null || rawPulses === null) {
          refuse('invalid_input', 'generator.generate with euclid needs "pad" (which pad) and "pulses" (how many hits).');
        }
        const pad = Math.round(rawPad as number);
        const pulses = Math.round(rawPulses as number);
        const rotate = Math.round(maybeNumber(input, 'rotate') ?? 0);
        const bar = Math.round(maybeNumber(input, 'bar') ?? 1);
        if (pad < 1 || pad > MAX_PADS) {
          refuse('not_found', `generator.generate: a machine has ${MAX_PADS} pads, so "pad" must be 1..${MAX_PADS}.`);
        }
        const machine = song.machine ?? (song.machine = createMachine());
        if (pulses < 1 || pulses > machine.steps) {
          refuse('invalid_input', `generator.generate: this machine holds ${machine.steps} steps, so "pulses" must be 1..${machine.steps}.`);
        }
        if (bar < 1 || bar > MAX_MACHINE_BARS) {
          refuse('invalid_input', `generator.generate: "bar" must be 1..${MAX_MACHINE_BARS}.`);
        }
        const hits = euclidPattern(pulses, machine.steps, rotate);
        const row = hits.map((hit) => (hit ? 100 : 0));
        const existing = padAt(machine, pad) ?? defaultPad(pad, machine.steps);
        if (bar === 1) {
          song.machine = withPad(machine, pad, { ...existing, steps: row.slice() });
        } else {
          const grown = withPad(machine, pad, { ...existing });
          const rows = machineBarRows(grown, bar);
          rows[pad - 1] = row.slice();
          song.machine = withMachineBar(grown, bar, rows);
        }
        return ok({
          song,
          generator: 'euclid',
          pad,
          bar,
          pulses,
          rotate,
          hits: hits.filter(Boolean).length,
          pattern: euclidPatternString(pulses, machine.steps, rotate),
        });
      }

      const rawPattern = maybeNumber(input, 'pattern');
      const rawRow = maybeNumber(input, 'row');
      const rawTrack = maybeNumber(input, 'track');
      if (rawPattern === null || rawRow === null || rawTrack === null) {
        refuse('invalid_input', 'generator.generate with bass needs "pattern", "row" and "track" — where the bassline is written.');
      }
      const pattern = ensurePattern(song, Math.round(rawPattern as number));
      const row = Math.round(rawRow as number);
      const track = Math.round(rawTrack as number);
      if (row < 0 || row >= pattern.steps.length) {
        refuse('not_found', `generator.generate: this pattern has ${pattern.steps.length} steps, so "row" must be 0..${pattern.steps.length - 1}.`);
      }
      if (track < 1 || track > song.tracks.length) {
        refuse('not_found', `generator.generate: this song has ${song.tracks.length} channels, so "track" must be 1..${song.tracks.length}.`);
      }
      const rhythm = (maybeStr(input, 'rhythm') ?? 'four').trim().toLowerCase();
      if (!(BASS_RHYTHMS as readonly string[]).includes(rhythm)) {
        refuse('invalid_input', `generator.generate: "${rhythm}" is not a bass rhythm. The rhythms are: ${BASS_RHYTHMS.join(', ')}.`);
      }
      if (song.progression === null) {
        refuse('invalid_input', 'generator.generate with bass needs a chord loop: write "progression Am F C G" first.');
      }
      const octave = Math.min(
        Math.max(Math.round(maybeNumber(input, 'octave') ?? 2), SCRIPT_OCTAVE_MIN),
        SCRIPT_OCTAVE_MAX,
      );
      const notes = bassFollowNotes(
        song.progression,
        song.key,
        octave,
        pattern.steps.length,
        row,
        rhythm as (typeof BASS_RHYTHMS)[number],
      );
      for (const note of notes) {
        const cell = pattern.steps[note.row]?.[track - 1];
        if (!cell) continue;
        setCellNotes(cell, [note.midi]);
      }
      return ok({
        song,
        generator: 'bass',
        pattern: song.patterns.indexOf(pattern) + 1,
        row,
        track,
        rhythm,
        octave,
        written: notes.length,
        notes,
      });
    },
  },
];
