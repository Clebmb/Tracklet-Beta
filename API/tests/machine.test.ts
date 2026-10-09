/**
 * The drum machine over the API: reading it, editing it a field at a time, and
 * diffing two of them.
 *
 * Three claims, in the order an agent meets them:
 *
 *   • `machine.describe` shows a machine the way the model stores it — the mix as
 *     numbers, and every pad's row as both velocities and the pattern string a
 *     script writes — and answers `null` for a song that has none;
 *   • `song.edit` can change a pad's name, sound, pitch and its hits one step at a
 *     time, and can build a machine on a song that never had one;
 *   • `song.diff` finds those same changes and REPLAYS them, and says out loud the
 *     two things the vocabulary cannot do: remove a machine, and remove a pad.
 */

import { describe, expect, it } from 'vitest';

import { callOperation } from '../src/index';
import { applyScript, createSong, songToJson, type Song } from '../../src/model';

const SOURCE = [
  'new',
  'song "MACHINE TEST"',
  'key D minor',
  'tempo 120',
  'steps 16',
  'tracks 2',
  'track 1 "LEAD" voice lead',
  'track 2 "BASS" voice bass level 64',
  'pattern 1 "A"',
  'machine steps 16 beat 4 swing 20 level 90 duck 25 verb 15',
  'pad 1 "KICK"  pattern "9...9...9...9..."',
  'pad 2 "SNARE" pattern "....9.......9..."',
  'pad 5 "TOM"   wave membrane tune -4',
  '',
].join('\n');

function subject(): Song {
  const applied = applyScript(createSong(), SOURCE);
  if (!applied.ok) throw new Error(`the fixture must parse: ${JSON.stringify(applied.errors)}`);
  return applied.song;
}

interface MachineDescription {
  hasMachine: boolean;
  label: string | null;
  hits: number;
  pads: number;
  machine: {
    enabled: boolean;
    steps: number;
    beat: number;
    swing: number;
    level: number;
    duck: number;
    verb: number;
    barCount: number;
    order: number[];
    bars: string[][];
    pads: { name: string; pitch: number; tune: number; level: number; pattern: string; steps: number[] }[];
  } | null;
}

async function readMachine(song: Song): Promise<MachineDescription> {
  const result = await callOperation('machine.describe', { song });
  if (!result.ok) throw new Error(`describe failed: ${JSON.stringify(result.error)}`);
  return result.result as MachineDescription;
}

interface EditResult {
  song: Song;
  edits: { op: string; target: string; from: string; to: string; changed: boolean }[];
}

async function edited(song: Song, edits: Record<string, unknown>[]): Promise<EditResult> {
  const result = await callOperation('song.edit', { song, edits });
  if (!result.ok) throw new Error(`edit failed: ${JSON.stringify(result.error)}`);
  return result.result as EditResult;
}

async function editError(song: Song, edits: Record<string, unknown>[]) {
  const result = await callOperation('song.edit', { song, edits });
  expect(result.ok).toBe(false);
  return result.ok ? null : result.error;
}

describe('machine.describe reads the machine back', () => {
  it('answers null for a song with no machine', async () => {
    const read = await readMachine(createSong());
    expect(read.hasMachine).toBe(false);
    expect(read.machine).toBeNull();
    expect(read.pads).toBe(0);
  });

  it('reports the mix, the pad count and the hits', async () => {
    const read = await readMachine(subject());
    expect(read.hasMachine).toBe(true);
    expect(read.machine?.level).toBe(90);
    expect(read.machine?.swing).toBe(20);
    expect(read.machine?.duck).toBe(25);
    expect(read.machine?.verb).toBe(15);
    expect(read.pads).toBe(5);
    // four kicks and two snares
    expect(read.hits).toBe(6);
    expect(read.label).toContain('5 PADS');
  });

  it('prints each pad row as both velocities and the pattern a script writes', async () => {
    const read = await readMachine(subject());
    const kick = read.machine?.pads[0];
    expect(kick?.name).toBe('KICK');
    expect(kick?.pattern).toBe('9...9...9...9...');
    expect(kick?.steps[0]).toBe(100);
    expect(kick?.steps[1]).toBe(0);
  });

  it('reports a pad\'s tuning next to its absolute pitch', async () => {
    const read = await readMachine(subject());
    const tom = read.machine?.pads[4];
    expect(tom?.name).toBe('TOM');
    expect(tom?.tune).toBe(-4);
    expect(tom?.pitch).toBe(41); // the tom's kit pitch, 45, minus four semitones
  });

  it('reports the machine\'s bars and its order', async () => {
    const read = await readMachine(subject());
    // A machine written before bars existed has one bar, no extra rows, and an
    // order that reads as bar 1 everywhere.
    expect(read.machine?.barCount).toBe(1);
    expect(read.machine?.order).toEqual([1]);
    expect(read.machine?.bars).toEqual([]);
  });
});

describe('song.edit changes the machine one field at a time', () => {
  it('creates a machine on a song that has none', async () => {
    const before = createSong();
    expect(before.machine).toBeNull();
    const result = await edited(before, [{ op: 'machine.set', level: 80, steps: 8 }]);
    expect(result.song.machine).not.toBeNull();
    expect(result.song.machine?.level).toBe(80);
    expect(result.song.machine?.steps).toBe(8);
    // A created machine is the four kit pads, every row resized to the new size.
    expect(result.song.machine?.pads).toHaveLength(4);
    expect(result.song.machine?.pads[0]?.steps).toHaveLength(8);
  });

  it('sets a pad\'s name, level and sound', async () => {
    const result = await edited(subject(), [
      { op: 'pad.set', pad: 3, name: 'ride', level: 60, pan: -20, wave: 'plate' },
    ]);
    const pad = result.song.machine?.pads[2];
    expect(pad?.name).toBe('RIDE');
    expect(pad?.level).toBe(60);
    expect(pad?.pan).toBe(-20);
    expect(pad?.voice.wave).toBe('plate');
    expect(result.edits.map((change) => change.target)).toEqual([
      'pad 3 name',
      'pad 3 level',
      'pad 3 pan',
      'pad 3 wave',
    ]);
  });

  it('sets a pad\'s pitch as a tune from its kit drum', async () => {
    const result = await edited(subject(), [{ op: 'pad.set', pad: 2, tune: 5 }]);
    // The snare's kit pitch is 38, so tune 5 lands on 43.
    expect(result.song.machine?.pads[1]?.pitch).toBe(43);
  });

  it('writes a whole pad row through a pattern string', async () => {
    const result = await edited(subject(), [{ op: 'pad.set', pad: 3, pattern: '9.9.9.9.9.9.9.9.' }]);
    const hat = result.song.machine?.pads[2];
    expect(hat?.steps.filter((velocity) => velocity > 0)).toHaveLength(8);
    expect(result.edits[0]?.target).toBe('pad 3 pattern');
  });

  it('changes one hit, and leaves the rest of the row where it was', async () => {
    const result = await edited(subject(), [{ op: 'pad.step', pad: 1, step: 2, velocity: 50 }]);
    const kick = result.song.machine?.pads[0];
    expect(kick?.steps[2]).toBe(50);
    expect(kick?.steps[0]).toBe(100);
    expect(result.edits[0]).toMatchObject({ op: 'pad.step', target: 'pad 1 step 2', from: '0', to: '50' });
  });

  it('writes a pad row into another BAR, leaving bar 1 alone', async () => {
    const result = await edited(subject(), [{ op: 'pad.set', pad: 1, bar: 2, pattern: '9.9.9.9.9.9.9.9.' }]);
    // Naming bar 2 grows the machine to two bars, and the row lands there.
    expect(result.song.machine?.bars).toHaveLength(1);
    expect(result.song.machine?.bars[0]?.[0]?.filter((v) => v > 0)).toHaveLength(8);
    // Bar 1's kick — `9...9...9...9...` — is untouched.
    expect(result.song.machine?.pads[0]?.steps[0]).toBe(100);
    expect(result.edits[0]).toMatchObject({ op: 'pad.set', target: 'pad 1 bar 2 pattern' });
  });

  it('changes one hit on another bar', async () => {
    const twoBars = await edited(subject(), [{ op: 'pad.set', pad: 2, bar: 2, pattern: '................' }]);
    const result = await edited(twoBars.song, [{ op: 'pad.step', pad: 2, bar: 2, step: 4, velocity: 80 }]);
    expect(result.song.machine?.bars[0]?.[1]?.[4]).toBe(80);
    // Bar 1's snare keeps its own hit at step 4 (the pattern's `....9...`).
    expect(result.song.machine?.pads[1]?.steps[4]).toBe(100);
    expect(result.edits[0]).toMatchObject({ op: 'pad.step', target: 'pad 2 bar 2 step 4', from: '0', to: '80' });
  });

  it('sets the order that says which bar plays in each song bar', async () => {
    const result = await edited(subject(), [
      { op: 'pad.set', pad: 1, bar: 2, pattern: '9...9...9...9...' },
      { op: 'machine.set', order: [1, 1, 2, 2] },
    ]);
    expect(result.song.machine?.order).toEqual([1, 1, 2, 2]);
    expect(result.edits.some((change) => change.target === 'machine order')).toBe(true);
  });

  it('clears one bar, leaving the others', async () => {
    const twoBars = await edited(subject(), [{ op: 'pad.set', pad: 1, bar: 2, pattern: '9...9...9...9...' }]);
    const result = await edited(twoBars.song, [{ op: 'machine.clear', bar: 2 }]);
    expect(result.song.machine?.bars[0]?.every((row) => row.every((v) => v === 0))).toBe(true);
    expect(result.song.machine?.pads[0]?.steps.some((v) => v > 0)).toBe(true);
  });

  it('clears the beat, and clears one pad when asked', async () => {
    const whole = await edited(subject(), [{ op: 'machine.clear' }]);
    expect(whole.song.machine?.pads.every((pad) => pad.steps.every((v) => v === 0))).toBe(true);
    expect(whole.edits[0]?.from).toBe('6 hits');

    const one = await edited(subject(), [{ op: 'machine.clear', pad: 1 }]);
    expect(one.song.machine?.pads[0]?.steps.every((v) => v === 0)).toBe(true);
    expect(one.song.machine?.pads[1]?.steps.some((v) => v > 0)).toBe(true);
  });

  it('points a pad at a recording, and clears it', async () => {
    const set = await edited(subject(), [{ op: 'pad.set', pad: 2, wave: 'sample', sample: 'BRK02' }]);
    expect(set.song.machine?.pads[1]?.sample).toBe('BRK02');
    expect(set.edits.map((change) => change.target)).toEqual(['pad 2 wave', 'pad 2 sample']);

    // An empty string is how a caller leaves the recording — the same `none` a
    // script writes, said as an empty name.
    const cleared = await edited(set.song, [{ op: 'pad.set', pad: 2, sample: '' }]);
    expect(cleared.song.machine?.pads[1]?.sample).toBeNull();
    expect(cleared.edits[0]).toMatchObject({ target: 'pad 2 sample', from: 'BRK02', to: 'none' });
  });

  it('refuses a pad number, a bus and a pattern that do not fit', async () => {
    expect((await editError(subject(), [{ op: 'pad.set', pad: 9, level: 50 }]))?.code).toBe('invalid_input');
    // A name that could never be a name is refused; a name the bank merely lacks
    // is the fallback and is allowed.
    expect((await editError(subject(), [{ op: 'pad.set', pad: 1, sample: '8bad' }]))?.code).toBe('invalid_input');
    expect((await editError(subject(), [{ op: 'track.set', track: 1, sample: 'my break' }]))?.code).toBe('invalid_input');
    expect((await editError(subject(), [{ op: 'machine.set', bus: 'GHOST' }]))?.code).toBe('invalid_input');
    // Sixteen steps of text on a sixteen-step machine is fine; longer is not.
    expect((await editError(subject(), [{ op: 'pad.set', pad: 1, pattern: '9'.repeat(17) }]))?.code).toBe('invalid_input');
    expect((await editError(subject(), [{ op: 'pad.step', pad: 1, step: 99, velocity: 50 }]))?.code).toBe('not_found');
    expect((await editError(subject(), [{ op: 'pad.set', pad: 1, wave: 'sawblade' }]))?.code).toBe('invalid_input');
    expect((await editError(subject(), [{ op: 'machine.set', pads: 0 }]))?.code).toBe('invalid_input');
    expect((await editError(subject(), [{ op: 'machine.set', bars: 99 }]))?.code).toBe('invalid_input');
  });

  it('adds and removes pads by count, as ADD PAD and DEL PAD do', async () => {
    const grown = await edited(subject(), [{ op: 'machine.set', pads: 6, bars: 3 }]);
    expect(grown.song.machine?.pads).toHaveLength(6);
    const trimmed = await edited(grown.song, [{ op: 'machine.set', pads: 4 }]);
    expect(trimmed.song.machine?.pads).toHaveLength(4);
    // The rows come off every bar with the pad, so no ghost row is left behind.
    expect(trimmed.song.machine?.bars.length).toBe(2);
    expect(trimmed.song.machine?.bars.every((bar) => bar.length === 4)).toBe(true);
  });

  it('adds and removes bars by count, copying the last bar as + BAR does', async () => {
    const seeded = await edited(subject(), [{ op: 'pad.set', pad: 1, pattern: '9...9...9...9...' }]);
    const grown = await edited(seeded.song, [{ op: 'machine.set', bars: 3 }]);
    expect(grown.song.machine?.bars).toHaveLength(2);
    // A variation starts as the beat: bar 2 is a copy of bar 1's row.
    expect(grown.song.machine?.bars[0]?.[0]?.slice(0, 4)).toEqual([100, 0, 0, 0]);
    const shrunk = await edited(grown.song, [{ op: 'machine.set', bars: 1 }]);
    expect(shrunk.song.machine?.bars).toHaveLength(0);
  });
});

interface DiffResult {
  changed: number;
  edits: Record<string, unknown>[];
  notes: string[];
  verified: boolean;
}

async function diff(before: Song, after: Song): Promise<DiffResult> {
  const result = await callOperation('song.diff', { before, after });
  if (!result.ok) throw new Error(`diff failed: ${JSON.stringify(result.error)}`);
  return result.result as DiffResult;
}

const text = (song: Song): string => songToJson(song, { volume: null });

async function replayReaches(before: Song, result: DiffResult, after: Song): Promise<boolean> {
  const applied = await callOperation('song.edit', { song: before, edits: result.edits });
  if (!applied.ok) return false;
  return text((applied.result as { song: Song }).song) === text(after);
}

describe('song.diff finds machine changes and replays them', () => {
  it('finds a mix change as one machine.set', async () => {
    const before = subject();
    const after = structuredClone(before);
    if (after.machine) after.machine.level = 40;
    const result = await diff(before, after);
    expect(result.edits[0]).toMatchObject({ op: 'machine.set', level: 40 });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds one moved hit as one pad.step', async () => {
    const before = subject();
    const after = structuredClone(before);
    const kick = after.machine?.pads[0];
    if (kick?.steps) kick.steps[2] = 50;
    const result = await diff(before, after);
    expect(result.edits).toEqual([{ op: 'pad.step', pad: 1, step: 2, velocity: 50 }]);
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a renamed pad and a re-tuned pad', async () => {
    const before = subject();
    const after = structuredClone(before);
    const tom = after.machine?.pads[4];
    if (tom) {
      tom.name = 'FLOOR';
      tom.pitch = 36;
    }
    const result = await diff(before, after);
    expect(result.edits[0]).toMatchObject({ op: 'pad.set', pad: 5, name: 'FLOOR', tune: -9 });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('builds a machine that was added, from nothing to its pads and hits', async () => {
    const after = subject();
    const before = structuredClone(after);
    before.machine = null;
    const result = await diff(before, after);
    expect(result.edits[0]?.op).toBe('machine.set');
    expect(result.notes).toEqual([]);
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a pad put on a recording as one pad.set', async () => {
    const before = subject();
    const after = structuredClone(before);
    const snare = after.machine?.pads[1];
    if (snare) {
      snare.sample = 'BRK02';
      snare.voice.wave = 'sample';
    }
    const result = await diff(before, after);
    expect(result.edits[0]).toMatchObject({ op: 'pad.set', pad: 2, wave: 'sample', sample: 'BRK02' });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a channel put on a recording as one track.set', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.tracks[0].sample = 'BRK02';
    const result = await diff(before, after);
    expect(result.edits[0]).toMatchObject({ op: 'track.set', track: 1, sample: 'BRK02' });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a hit on another bar and an order change', async () => {
    const before = subject();
    const after = (await edited(before, [
      { op: 'pad.set', pad: 1, bar: 2, pattern: '9...9...9...9...' },
      { op: 'machine.set', order: [1, 1, 2, 2] },
    ])).song;
    const result = await diff(before, after);
    expect(result.edits.some((edit) => edit.op === 'pad.step' && edit.bar === 2)).toBe(true);
    expect(result.edits.find((edit) => edit.op === 'machine.set')).toMatchObject({ order: [1, 1, 2, 2] });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('notes a removed machine and will not call it verified', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.machine = null;
    const result = await diff(before, after);
    expect(result.notes.join(' ')).toContain('remove a machine');
    expect(result.verified).toBe(false);
  });

  it('finds a pad that was removed as one machine.set, and replays it', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.machine?.pads.pop();
    const result = await diff(before, after);
    expect(result.notes).toEqual([]);
    expect(result.edits.find((edit) => edit.op === 'machine.set')).toMatchObject({
      pads: (before.machine?.pads.length ?? 0) - 1,
    });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });
});
