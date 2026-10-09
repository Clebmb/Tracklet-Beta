/**
 * The ARP page over the API: reading the dials, previewing a run, committing it,
 * and editing the dials as song data.
 *
 * Four claims, in the order an agent meets them:
 *
 *   • `arp.describe` reports the stored dials and, for a step, the run `generateArp`
 *     would produce over the chord sitting there — the same run `arp write` commits;
 *   • `arp.generate` writes that run into cells, cell-for-cell equal to the cells a
 *     script's `arp write` writes for the matching dials;
 *   • `song.edit` can set and clear the dials with `arp.set`/`arp.clear`, refusing a
 *     word the language would refuse;
 *   • `song.diff` finds a dial change and REPLAYS it, so a replay reproduces the
 *     song exactly.
 */

import { describe, expect, it } from 'vitest';

import { callOperation } from '../src/index';
import {
  applyScript,
  createSong,
  DEFAULT_ARP,
  MAX_ARP_OCTAVES,
  type ArpSettings,
  type Song,
} from '../../src/model';

/** An A-minor triad in one cell on channel 1, at step 0. */
const CHORD_SONG = [
  'new',
  'key A minor',
  'steps 16',
  'tracks 1',
  'track 1 "KEYS" voice pad poly 3',
  'pattern 1 "A"',
  'chord 0 1 Am',
  '',
].join('\n');

function subject(source = CHORD_SONG): Song {
  const applied = applyScript(createSong(), source);
  if (!applied.ok) throw new Error(`the fixture must parse: ${JSON.stringify(applied.errors)}`);
  return applied.song;
}

interface ArpDescription {
  settings: ArpSettings | null;
  label: string;
  defaults: ArpSettings;
  ranges: { octaves: { min: number; max: number }; rate: { min: number; max: number }; gate: { min: number; max: number } };
  directions: string[];
  modes: string[];
  preview: null | {
    pattern: number;
    row: number;
    track: number;
    chord: string[];
    tones: number[];
    count: number;
    steps: { step: number; note: number; name: string; velocity: number }[];
  };
}

async function describeArp(input: Record<string, unknown>): Promise<ArpDescription> {
  const result = await callOperation('arp.describe', input);
  if (!result.ok) throw new Error(`arp.describe failed: ${JSON.stringify(result.error)}`);
  return result.result as ArpDescription;
}

interface GenerateResult {
  song: Song;
  pattern: number;
  row: number;
  track: number;
  settings: ArpSettings;
  label: string;
  written: number;
  stored: boolean;
  steps: { step: number; note: number; velocity: number }[];
}

async function generate(input: Record<string, unknown>): Promise<GenerateResult> {
  const result = await callOperation('arp.generate', input);
  if (!result.ok) throw new Error(`arp.generate failed: ${JSON.stringify(result.error)}`);
  return result.result as GenerateResult;
}

async function generateError(input: Record<string, unknown>) {
  const result = await callOperation('arp.generate', input);
  expect(result.ok).toBe(false);
  return result.ok ? null : result.error;
}

/** A channel's notes in row order. */
function column(song: Song, track = 0, rows = 16): (number | null)[] {
  return song.patterns[0].steps.slice(0, rows).map((row) => row[track]?.note ?? null);
}

describe('arp.describe reads the dials and previews the run', () => {
  it('starts with no dials, publishing the ranges and closed lists anyway', async () => {
    const read = await describeArp({});
    expect(read.settings).toBeNull();
    expect(read.label).toContain('no arp dials');
    expect(read.defaults).toEqual(DEFAULT_ARP);
    expect(read.ranges.octaves.max).toBe(MAX_ARP_OCTAVES);
    expect(read.directions).toEqual(['up', 'down', 'updown']);
    expect(read.modes).toEqual(['chord', 'source']);
    expect(read.preview).toBeNull();
  });

  it('reports the stored dials a script wrote, with their label', async () => {
    const song = subject(`${CHORD_SONG}arp direction updown\narp octaves 3 rate 2 gate 60\n`);
    const read = await describeArp({ song });
    expect(read.settings).toEqual({ direction: 'updown', octaves: 3, rate: 2, gate: 60, mode: 'chord' });
    expect(read.label).toContain('UPDOWN');
  });

  it('previews the run generateArp would write over the chord in the cell', async () => {
    const read = await describeArp({ song: subject(), pattern: 1, row: 0, track: 1 });
    expect(read.preview?.tones).toEqual([69, 72, 76]);
    expect(read.preview?.chord).toEqual(['A-4', 'C-5', 'E-5']);
    // Default dials: up, two octaves, one note per step — a triad fills six steps.
    expect(read.preview?.count).toBe(6);
    expect(read.preview?.steps.map((step) => step.note)).toEqual([69, 72, 76, 81, 84, 88]);
    expect(read.preview?.steps.map((step) => step.step)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('refuses a partial preview address, and an address past the grid', async () => {
    const partial = await callOperation('arp.describe', { pattern: 1, row: 0 });
    expect(partial.ok).toBe(false);
    const past = await callOperation('arp.describe', { pattern: 1, row: 99, track: 1 });
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.error.message).toContain('"row" must be 0..');
  });
});

describe('arp.generate commits the run the dials describe', () => {
  it('is the same cells a script’s `arp write` writes for the matching dials', async () => {
    const generated = await generate({ song: subject(), pattern: 1, row: 0, track: 1, chord: 'Am', octaves: 2, rate: 1, gate: 100 });
    expect(generated.written).toBe(6);
    const scripted = subject(`${CHORD_SONG}arp octaves 2\narp write 0 1 Am`);
    expect(column(generated.song).slice(0, 6)).toEqual(column(scripted).slice(0, 6));
    expect(column(generated.song).slice(0, 6)).toEqual([69, 72, 76, 81, 84, 88]);
  });

  it('spaces the notes out with rate and turns them around with direction', async () => {
    const spaced = await generate({ song: subject(), pattern: 1, row: 0, track: 1, chord: 'Am', octaves: 2, rate: 2 });
    expect(column(spaced.song).slice(0, 12)).toEqual([69, null, 72, null, 76, null, 81, null, 84, null, 88, null]);
    const down = await generate({ song: subject(), pattern: 1, row: 0, track: 1, chord: 'Am', octaves: 2, direction: 'down' });
    expect(column(down.song).slice(0, 6)).toEqual([88, 84, 81, 76, 72, 69]);
  });

  it('writes GATE as the cell velocity, and stores the dials only when asked', async () => {
    const loud = await generate({ song: subject(), pattern: 1, row: 0, track: 1, chord: 'Am', gate: 60, stored: true });
    expect(loud.song.patterns[0].steps[0][0].velocity).toBe(60);
    expect(loud.song.arp?.gate).toBe(60);
    expect(loud.stored).toBe(true);
    const quiet = await generate({ song: subject(), pattern: 1, row: 0, track: 1, chord: 'Am' });
    expect(quiet.song.arp).toBeNull();
  });

  it('stops at the end of the pattern rather than running off it', async () => {
    const song = await generate({ song: subject(), pattern: 1, row: 14, track: 1, chord: 'Am', octaves: 4 });
    expect(column(song.song).slice(14)).toEqual([69, 72]);
  });

  it('refuses a bad chord, a bad direction, and an address past the grid', async () => {
    const badChord = await generateError({ song: subject(), pattern: 1, row: 0, track: 1, chord: 'Hm' });
    expect(badChord?.message).toContain('is not a chord');
    const badDirection = await generateError({ song: subject(), pattern: 1, row: 0, track: 1, chord: 'Am', direction: 'sideways' });
    expect(badDirection?.message).toContain('is not an arp direction');
    const past = await generateError({ song: subject(), pattern: 1, row: 99, track: 1, chord: 'Am' });
    expect(past?.message).toContain('"row" must be 0..');
    const missing = await generateError({ song: subject(), pattern: 1, row: 0, track: 1 });
    expect(missing?.message).toContain('needs "chord"');
  });
});

describe('the arp dials are editable song data', () => {
  it('sets only the dials named, merging over the defaults', async () => {
    const result = await callOperation('song.edit', { song: createSong(), edits: [{ op: 'arp.set', direction: 'updown', octaves: 3 }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const song = (result.result as { song: Song }).song;
    expect(song.arp).toEqual({ ...DEFAULT_ARP, direction: 'updown', octaves: 3 });
  });

  it('refuses a word the language refuses, and an empty set', async () => {
    const bad = await callOperation('song.edit', { song: createSong(), edits: [{ op: 'arp.set', direction: 'sideways' }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.message).toContain('is not an arp direction');
    const empty = await callOperation('song.edit', { song: createSong(), edits: [{ op: 'arp.set' }] });
    expect(empty.ok).toBe(false);
  });

  it('clears the dials, so the song writes no key again', async () => {
    const song = subject(`${CHORD_SONG}arp direction down\n`);
    const result = await callOperation('song.edit', { song, edits: [{ op: 'arp.clear' }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.result as { song: Song }).song.arp).toBeNull();
  });
});

describe('song.diff replays an arp dial change', () => {
  it('emits one arp.set and verifies the replay', async () => {
    const before = createSong();
    const setResult = await callOperation('song.edit', { song: createSong(), edits: [{ op: 'arp.set', direction: 'updown', octaves: 3, rate: 2 }] });
    expect(setResult.ok).toBe(true);
    if (!setResult.ok) return;
    const after = (setResult.result as { song: Song }).song;

    const diff = await callOperation('song.diff', { before, after });
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    const found = diff.result as { edits: Record<string, unknown>[]; verified: boolean };
    expect(found.edits).toContainEqual({ op: 'arp.set', direction: 'updown', octaves: 3, rate: 2, gate: 100, mode: 'chord' });
    expect(found.verified).toBe(true);
  });

  it('emits arp.clear when the dials go away', async () => {
    const withArp = subject(`${CHORD_SONG}arp direction down\n`);
    const result = await callOperation('song.diff', { before: withArp, after: subject() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const found = result.result as { edits: Record<string, unknown>[]; verified: boolean };
    expect(found.edits).toContainEqual({ op: 'arp.clear' });
    expect(found.verified).toBe(true);
  });
});
