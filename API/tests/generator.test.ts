/**
 * The composer plugins over the API: listing them, spreading a rhythm,
 * hanging a bassline — and refusing what cannot be written.
 *
 * Three claims, in the order an agent meets them:
 *
 *   • `generator.describe` lists the seated composers with their ranges, and
 *     whether the song at hand has a machine and a loop to write into;
 *   • `generator.generate` writes what they compose into the song as ordinary
 *     rows and cells — cell-for-cell equal to what the script word writes;
 *   • a generator that cannot be asked, or a song with nothing to hang on, is
 *     refused by name rather than written in silence.
 */

import { describe, expect, it } from 'vitest';

import { callOperation } from '../src/index';
import {
  applyScript,
  createSong,
  MAX_MACHINE_BARS,
  MAX_PADS,
  type Song,
} from '../../src/model';

const LOOP_SONG = [
  'new',
  'key A minor',
  'steps 16',
  'tracks 2',
  'track 1 "LEAD" voice lead',
  'track 2 "BASS" voice bass',
  'progression Am F C G',
  'pattern 1 "A"',
  '',
].join('\n');

function subject(source = LOOP_SONG): Song {
  const applied = applyScript(createSong(), source);
  if (!applied.ok) throw new Error(`the fixture must parse: ${JSON.stringify(applied.errors)}`);
  return applied.song;
}

interface GeneratorDescription {
  generators: { id: string; name: string; version: string; mode: string; description: string | null }[];
  machine: null | { steps: number; pads: number; bars: number };
  progression: null | { chords: number; hold: number };
  rhythms: string[];
  ranges: { pad: { min: number; max: number }; bar: { min: number; max: number }; octave: { min: number; max: number } };
}

async function describeGenerators(input: Record<string, unknown>): Promise<GeneratorDescription> {
  const result = await callOperation('generator.describe', input);
  if (!result.ok) throw new Error(`generator.describe failed: ${JSON.stringify(result.error)}`);
  return result.result as GeneratorDescription;
}

async function generate(input: Record<string, unknown>): Promise<{ song: Song } & Record<string, unknown>> {
  const result = await callOperation('generator.generate', input);
  if (!result.ok) throw new Error(`generator.generate failed: ${JSON.stringify(result.error)}`);
  return result.result as { song: Song } & Record<string, unknown>;
}

async function generateError(input: Record<string, unknown>) {
  const result = await callOperation('generator.generate', input);
  expect(result.ok).toBe(false);
  return result.ok ? null : result.error;
}

describe('generator.describe lists the composers', () => {
  it('seats euclid-drums and bass-follow as constructive writers', async () => {
    const read = await describeGenerators({});
    expect(read.generators.map((entry) => entry.id)).toEqual([
      'com.example.euclid-drums',
      'com.example.bass-follow',
    ]);
    for (const entry of read.generators) expect(entry.mode).toBe('constructive');
    expect(read.rhythms).toEqual(['four', 'half', 'offbeat']);
    expect(read.ranges.pad.max).toBe(MAX_PADS);
    expect(read.ranges.bar.max).toBe(MAX_MACHINE_BARS);
  });

  it('reports the loop and the machine the song has', async () => {
    const bare = await describeGenerators({});
    expect(bare.machine).toBeNull();
    expect(bare.progression).toBeNull();
    const read = await describeGenerators({ song: subject(`${LOOP_SONG}generate euclid pad 1 5\n`) });
    expect(read.machine?.steps).toBe(16);
    expect(read.progression?.chords).toBe(4);
  });
});

describe('generator.generate spreads a rhythm', () => {
  it('writes five hits on the pad it names', async () => {
    const made = await generate({ song: subject(), generator: 'euclid', pad: 1, pulses: 5 });
    expect(made.pattern).toBe('9...9..9..9..9..');
    expect(made.song.machine?.pads[0].steps.filter((hit) => hit > 0)).toHaveLength(5);
  });

  it('is the same row the script word writes', async () => {
    const song = subject();
    const made = await generate({ song, generator: 'euclid', pad: 1, pulses: 5, rotate: 2 });
    const scripted = subject(`${LOOP_SONG}generate euclid pad 1 5 rotate 2\n`);
    expect(made.song.machine?.pads[0].steps).toEqual(scripted.machine?.pads[0].steps);
  });

  it('refuses a pad, a count and a bar that do not fit', async () => {
    expect((await generateError({ song: subject(), generator: 'euclid', pad: 99, pulses: 5 }))?.code).toBe(
      'not_found',
    );
    expect((await generateError({ song: subject(), generator: 'euclid', pad: 1, pulses: 99 }))?.code).toBe(
      'invalid_input',
    );
    expect((await generateError({ song: subject(), generator: 'euclid', pad: 1, pulses: 5, bar: 99 }))?.code).toBe(
      'invalid_input',
    );
    expect((await generateError({ song: subject(), generator: 'wobble', pad: 1, pulses: 5 }))?.code).toBe(
      'invalid_input',
    );
  });
});

describe('generator.generate hangs a bassline', () => {
  it('writes one root per chord on the channel it names', async () => {
    const made = await generate({ song: subject(), generator: 'bass', pattern: 1, row: 0, track: 2, octave: 4 });
    expect(made.written).toBe(4);
    const scripted = subject(`${LOOP_SONG}generate bass 0 2\n`);
    const column = (song: Song) => song.patterns[0].steps.map((row) => row[1]?.note ?? null);
    expect(column(made.song)).toEqual(column(scripted));
  });

  it('refuses a rhythm it was never taught and a song with no loop', async () => {
    expect(
      (await generateError({ song: subject(), generator: 'bass', pattern: 1, row: 0, track: 2, rhythm: 'swing' }))
        ?.code,
    ).toBe('invalid_input');
    expect(
      (await generateError({ generator: 'bass', pattern: 1, row: 0, track: 2 }))?.code,
    ).toBe('invalid_input');
  });
});
