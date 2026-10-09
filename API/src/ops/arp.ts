/**
 * ops/arp — the ARP page as data, and a run as an instruction.
 *
 * The ARP page dials a stored run and commits it. Its DIALS are song data (one
 * `arp` key, file version 42), written through `script.apply`'s `arp …` lines or
 * `song.edit`'s `arp.set`/`arp.clear`; its NOTES are ordinary cells. This is the
 * read half and the generator: `arp.describe` reports the stored dials AND, for a
 * given step, the run `generateArp` would produce over the chord sitting there, so
 * an agent can look at the page and PREVIEW exactly what a write would do rather
 * than re-deriving the walk itself. `arp.generate` is the write half — a run
 * committed into cells from a chord, a row and a channel.
 *
 * ── One function decides the run ─────────────────────────────────────────────
 *
 * Neither operation re-derives an arpeggio. Both call `generateArp`, the same
 * function `arp write` and `chord … arp` call, over the chord modifier's own
 * `arpNotes`. That is the whole reason a description and a write cannot disagree:
 * there is one walk, and this file is a window onto it.
 */

import {
  ARP_DIRECTIONS,
  ARP_MODES,
  DEFAULT_ARP,
  DEFAULT_CHORD_DEGREES,
  DEFAULT_VELOCITY,
  MAX_ARP_GATE,
  MAX_ARP_OCTAVES,
  MAX_ARP_RATE,
  MIN_ARP_GATE,
  MIN_ARP_OCTAVES,
  MIN_ARP_RATE,
  SCRIPT_OCTAVE_MAX,
  SCRIPT_OCTAVE_MIN,
  arpLabel,
  baseMidiForOctave,
  cellNotes,
  chordPitches,
  clampArp,
  createSong,
  degreeChord,
  ensurePattern,
  generateArp,
  midiToNoteName,
  parseChordName,
  parseDegree,
  setCellNotes,
  type ArpSettings,
  type Song,
} from '../../../src/model';
import { maybeNumber, maybeStr } from '../input';
import { field, schema, type ApiOperation } from '../operation';
import { ok, refuse } from '../result';
import { songFromInput } from '../songAccess';

/** The dials a fresh page carries, so a description can name them when none exist. */
const EMPTY_LABEL = '(no arp dials)';

/**
 * The chord a write or a preview walks, resolved the way `arp write` resolves it:
 * a chord NAME (`Am`, `F#7`), or a bare scale degree (`1`..`7`) taken against the
 * song's key, at the octave the caller names (the script's own default, 4).
 */
function chordTones(song: Song, raw: string, octave: number): number[] {
  const asDegree = parseDegree(raw);
  if (asDegree !== null) return degreeChord(asDegree, song.key, octave, DEFAULT_CHORD_DEGREES);
  const named = parseChordName(raw);
  if (named === null) {
    refuse('invalid_input', `"${raw}" is not a chord — write a name (Am, F#7, Cmaj7) or a scale degree 1..7, e.g. "Am".`);
  }
  return chordPitches(baseMidiForOctave(octave) + named.root, named.quality);
}

/** A pattern by 1-based number that already exists, or a refusal naming the count. */
function existingPattern(song: Song, number: number, where: string) {
  const pattern = song.patterns[number - 1];
  if (!pattern) {
    refuse('not_found', `${where}: this song has ${song.patterns.length} patterns, so "pattern" must be 1..${song.patterns.length}.`);
  }
  return pattern;
}

/** One run as data: where each note lands, what it is, and how hard. */
function stepsData(steps: ReturnType<typeof generateArp>): unknown[] {
  return steps.map((step) => ({
    step: step.step,
    note: step.note,
    name: midiToNoteName(step.note),
    velocity: step.velocity,
  }));
}

/** The dial ranges, so a caller can clamp without asking the language first. */
const ARP_RANGES = {
  octaves: { min: MIN_ARP_OCTAVES, max: MAX_ARP_OCTAVES },
  rate: { min: MIN_ARP_RATE, max: MAX_ARP_RATE },
  gate: { min: MIN_ARP_GATE, max: MAX_ARP_GATE },
};

export const arpOperations: ApiOperation[] = [
  {
    name: 'arp.describe',
    title: 'Read the ARP page',
    summary:
      'The stored arp dials and their label, and — for a given pattern, row and channel — the run generateArp would produce over the chord in that cell, as notes, so a caller can preview exactly what a write would commit.',
    category: 'arp',
    example: { pattern: 1, row: 0, track: 1 },
    input: schema({
      song: field('object', 'The song whose arp dials to read. Omit to read a blank song, which has none.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
      pattern: field('number', 'A pattern number (1-based) to preview the run from. Omit to read the dials only.'),
      row: field('number', 'The step (0-based) the run would start on.'),
      track: field('number', 'The channel (1-based) whose cell holds the chord the run walks.'),
    }),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const settings = song.arp;
      const pattern = maybeNumber(input, 'pattern');
      const row = maybeNumber(input, 'row');
      const track = maybeNumber(input, 'track');

      let preview: unknown = null;
      if (pattern !== null || row !== null || track !== null) {
        if (pattern === null || row === null || track === null) {
          refuse('invalid_input', 'a preview needs all three of "pattern", "row" and "track" — or none of them to read the dials alone.');
        }
        const target = existingPattern(song, pattern as number, 'arp.describe');
        const startRow = Math.round(row as number);
        if (startRow < 0 || startRow >= target.steps.length) {
          refuse('not_found', `arp.describe: this pattern has ${target.steps.length} steps, so "row" must be 0..${target.steps.length - 1}.`);
        }
        const channel = Math.round(track as number);
        if (channel < 1 || channel > song.tracks.length) {
          refuse('not_found', `arp.describe: this song has ${song.tracks.length} channels, so "track" must be 1..${song.tracks.length}.`);
        }
        const cell = target.steps[startRow]?.[channel - 1];
        const tones = cell ? cellNotes(cell) : [];
        const steps = generateArp(tones, startRow, settings ?? DEFAULT_ARP, target.steps.length - startRow);
        preview = {
          pattern: pattern as number,
          row: startRow,
          track: channel,
          chord: tones.map((midi) => midiToNoteName(midi)),
          tones,
          count: steps.length,
          steps: stepsData(steps),
        };
      }

      const { octaves, rate, gate } = ARP_RANGES;
      return ok({
        settings: settings ?? null,
        label: settings ? arpLabel(settings) : EMPTY_LABEL,
        defaults: { ...DEFAULT_ARP },
        ranges: { octaves, rate, gate },
        directions: [...ARP_DIRECTIONS],
        modes: [...ARP_MODES],
        preview,
      });
    },
  },
  {
    name: 'arp.generate',
    title: 'Commit a run into cells',
    summary:
      'Write the run generateArp produces for a chord, a row and a channel into the pattern as ordinary cells — one note per step — and hand the changed song back, so a caller gets exactly what arp write or chord … arp would commit.',
    category: 'arp',
    example: { pattern: 1, row: 0, track: 1, chord: 'Am' },
    input: schema(
      {
        song: field('object', 'The song to write into. Omit to write into a blank song.'),
        songJson: field('string', 'The same, as the text of a .json song file.'),
        pattern: field('number', 'The pattern number (1-based) to write into; created if it does not exist.'),
        row: field('number', 'The step (0-based) the run starts on.'),
        track: field('number', 'The channel (1-based) the run is written to.'),
        chord: field('string', 'The chord to walk — a name (Am, F#7, Cmaj7) or a scale degree 1..7, e.g. "Am".'),
        octave: field('number', `The octave for a named chord, ${SCRIPT_OCTAVE_MIN}..${SCRIPT_OCTAVE_MAX}. Defaults to 4.`),
        direction: field('string', 'Override the walked direction for this run: up, down or updown.'),
        octaves: field('number', `Override how many octaves the run climbs, ${MIN_ARP_OCTAVES}..${MAX_ARP_OCTAVES}.`),
        rate: field('number', `Override how many steps each note occupies, ${MIN_ARP_RATE}..${MAX_ARP_RATE}.`),
        gate: field('number', `Override how hard each note lands, ${MIN_ARP_GATE}..${MAX_ARP_GATE}.`),
        stored: field('boolean', 'When true, also store the dials used (including any overrides) in the song. Defaults to false, which writes the notes only.'),
      },
      ['pattern', 'row', 'track', 'chord'],
    ),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const rawPattern = maybeNumber(input, 'pattern');
      const rawRow = maybeNumber(input, 'row');
      const rawTrack = maybeNumber(input, 'track');
      const chord = maybeStr(input, 'chord');
      if (rawPattern === null || rawRow === null || rawTrack === null) {
        refuse('invalid_input', 'arp.generate needs "pattern", "row" and "track" — where the run is written.');
      }
      if (chord === null) {
        refuse('invalid_input', 'arp.generate needs "chord" — the chord to walk, a name like "Am" or a scale degree 1..7.');
      }
      const pattern = ensurePattern(song, Math.round(rawPattern as number));
      const row = Math.round(rawRow as number);
      const track = Math.round(rawTrack as number);

      if (row < 0 || row >= pattern.steps.length) {
        refuse('not_found', `arp.generate: this pattern has ${pattern.steps.length} steps, so "row" must be 0..${pattern.steps.length - 1}.`);
      }
      if (track < 1 || track > song.tracks.length) {
        refuse('not_found', `arp.generate: this song has ${song.tracks.length} channels, so "track" must be 1..${song.tracks.length}.`);
      }

      const octave = Math.min(
        Math.max(Math.round(maybeNumber(input, 'octave') ?? SCRIPT_OCTAVE_MIN + 4), SCRIPT_OCTAVE_MIN),
        SCRIPT_OCTAVE_MAX,
      );

      // The dial overrides, clamped by the model's own `clampArp` over the stored
      // dials — so a run this writes can never be a run the page, the file and the
      // script would each refuse.
      const override: Partial<ArpSettings> = {};
      const direction = maybeStr(input, 'direction');
      if (direction !== null) {
        if (!ARP_DIRECTIONS.includes(direction.trim().toLowerCase() as (typeof ARP_DIRECTIONS)[number])) {
          refuse('invalid_input', `arp.generate: "${direction}" is not an arp direction. The directions are: ${ARP_DIRECTIONS.join(', ')}.`);
        }
        override.direction = direction.trim().toLowerCase() as ArpSettings['direction'];
      }
      for (const key of ['octaves', 'rate', 'gate'] as const) {
        const value = maybeNumber(input, key);
        if (value !== null) override[key] = Math.round(value);
      }
      const settings = clampArp({ ...(song.arp ?? DEFAULT_ARP), ...override });

      const tones = chordTones(song, chord, octave);
      const steps = generateArp(tones, row, settings, pattern.steps.length - row);
      for (const step of steps) {
        const cell = pattern.steps[step.step]?.[track - 1];
        if (!cell) continue;
        setCellNotes(cell, [step.note]);
        // GATE is the one per-cell intensity a cell holds. At the default it writes
        // nothing a plain run would not, which keeps this equal to `chord … arp`.
        if (step.velocity !== DEFAULT_VELOCITY) cell.velocity = step.velocity;
      }

      const store = input['stored'] === true;
      if (store) song.arp = settings;

      return ok({
        song,
        pattern: song.patterns.indexOf(pattern) + 1,
        row,
        track,
        chord,
        tones,
        settings,
        label: arpLabel(settings),
        written: steps.length,
        stored: store,
        steps: stepsData(steps),
      });
    },
  },
];
