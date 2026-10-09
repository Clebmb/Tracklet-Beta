/**
 * The ARRANGER over the API: reading the timeline, editing a lane, and diffing
 * two of them.
 *
 * Three claims, in the order an agent meets them:
 *
 *   • `arranger.describe` shows the timeline the way the page draws it — the bars
 *     of the order with their section names, one row per channel, and every lane
 *     grouped by channel and target with the value it resolves to on each bar;
 *   • `song.edit` can add, move, clamp and drop a lane with `automation.set` and
 *     `automation.clear`, refusing what the language would refuse;
 *   • `song.diff` finds those changes and REPLAYS them, so a moved lane is one
 *     `automation.set` rather than a clear-and-re-add.
 */

import { describe, expect, it } from 'vitest';

import { callOperation } from '../src/index';
import { applyScript, createSong, songToJson, type Song } from '../../src/model';

const SOURCE = [
  'new',
  'song "ARRANGER TEST"',
  'key D minor',
  'tempo 120',
  'steps 16',
  'tracks 3',
  'track 1 "LEAD" voice lead',
  'track 2 "BASS" voice bass level 64',
  'track 3 "PAD" voice pad',
  'pattern 1 "A"',
  'D-5 D-2',
  'section VERSE 1',
  'section CHORUS 1',
  'arrange VERSE CHORUS CHORUS',
  'automate 1 bright 20 90 bars 1 to 2',
  'automate 2 level 70 100 bars 2 to 2',
  '',
].join('\n');

function subject(): Song {
  const applied = applyScript(createSong(), SOURCE);
  if (!applied.ok) throw new Error(`the fixture must parse: ${JSON.stringify(applied.errors)}`);
  return applied.song;
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

interface ArrangerDescription {
  bars: number;
  tracks: number;
  patternRows: number;
  laneCount: number;
  hasArrangement: boolean;
  ruler: { bar: number; pattern: number; section: string | null }[];
  rows: { track: number; name: string; notes: number; drums: number; used: boolean }[];
  laneGroups: {
    track: number;
    trackName: string;
    target: string;
    label: string;
    range: { min: number; max: number };
    lanes: { from: number; to: number; startBar: number; endBar: number; script: string; values: { bar: number; value: number }[] }[];
  }[];
}

async function describeArranger(song: Song): Promise<ArrangerDescription> {
  const result = await callOperation('arranger.describe', { song });
  if (!result.ok) throw new Error(`arranger.describe failed: ${JSON.stringify(result.error)}`);
  return result.result as ArrangerDescription;
}

describe('arranger.describe reads the timeline back', () => {
  it('shows the bars of the order with their section names', async () => {
    const read = await describeArranger(subject());
    expect(read.bars).toBe(3);
    expect(read.hasArrangement).toBe(true);
    expect(read.ruler.map((bar) => bar.section)).toEqual(['VERSE', 'CHORUS', 'CHORUS']);
    expect(read.ruler.map((bar) => bar.bar)).toEqual([1, 2, 3]);
  });

  it('gives one row per channel, with what each one carries', async () => {
    const read = await describeArranger(subject());
    expect(read.rows.map((row) => row.name)).toEqual(['LEAD', 'BASS', 'PAD']);
    expect(read.rows.map((row) => row.used)).toEqual([true, true, false]);
    // The PAD channel has no notes in the fixture's one written row.
    expect(read.rows[2]?.notes).toBe(0);
  });

  it('groups lanes by channel and target, resolving each bar', async () => {
    const read = await describeArranger(subject());
    expect(read.laneCount).toBe(2);
    expect(read.laneGroups.map((group) => `${group.track}:${group.target}`)).toEqual(['1:bright', '2:level']);
    const bright = read.laneGroups[0];
    expect(bright?.range).toMatchObject({ min: 0, max: 100 });
    const lane = bright?.lanes[0];
    expect(lane?.values.map((sample) => sample.bar)).toEqual([1, 2]);
    expect(lane?.values[0]?.value).toBe(20);
    // The line walks from 20 towards 90, so bar 2 is somewhere between them.
    expect(lane?.values[1]?.value).toBeGreaterThan(20);
    expect(lane?.values[1]?.value).toBeLessThan(90);
    expect(lane?.script).toBe('automate 1 bright 20 90 bars 1 to 2');
  });

  it('answers a blank song with one bar and no lanes', async () => {
    const read = await describeArranger(createSong());
    expect(read.laneCount).toBe(0);
    expect(read.laneGroups).toEqual([]);
    expect(read.ruler).toHaveLength(1);
  });
});

describe('song.edit writes lanes with automation.set and automation.clear', () => {
  it('appends a lane when no index is given', async () => {
    const result = await edited(createSong(), [
      { op: 'automation.set', track: 1, target: 'level', from: 40, to: 90, startBar: 1, endBar: 2 },
    ]);
    expect(result.song.automation).toEqual([
      { track: 1, target: 'level', from: 40, to: 90, startBar: 1, endBar: 2 },
    ]);
    expect(result.edits[0]).toMatchObject({ op: 'automation.set', target: 'lane 1 (added)' });
  });

  it('moves the lane at an index without touching the others', async () => {
    const result = await edited(subject(), [
      { op: 'automation.set', index: 1, track: 1, target: 'bright', from: 0, to: 100, startBar: 1, endBar: 3 },
    ]);
    expect(result.song.automation[0]).toEqual({ track: 1, target: 'bright', from: 0, to: 100, startBar: 1, endBar: 3 });
    // The level lane is still there, unchanged.
    expect(result.song.automation[1]).toMatchObject({ track: 2, target: 'level' });
    expect(result.song.automation).toHaveLength(2);
  });

  it('clamps a value and a bar into the range its own table allows', async () => {
    const result = await edited(createSong(), [
      { op: 'automation.set', track: 1, target: 'level', from: -50, to: 500, startBar: 1, endBar: 1 },
    ]);
    expect(result.song.automation[0]).toMatchObject({ from: 0, to: 100 });
  });

  it('drops one lane by index, or every lane with no index', async () => {
    const one = await edited(subject(), [{ op: 'automation.clear', index: 2 }]);
    expect(one.song.automation).toHaveLength(1);
    expect(one.song.automation[0]).toMatchObject({ target: 'bright' });

    const all = await edited(subject(), [{ op: 'automation.clear' }]);
    expect(all.song.automation).toEqual([]);
  });

  it('refuses a target, a channel, a backwards range, a bad index and too many lanes', async () => {
    const blank = createSong();
    expect((await editError(blank, [{ op: 'automation.set', track: 1, target: 'punch', from: 0, to: 9, startBar: 1, endBar: 1 }]))?.code).toBe('invalid_input');
    expect((await editError(blank, [{ op: 'automation.set', track: 9, target: 'level', from: 0, to: 9, startBar: 1, endBar: 1 }]))?.code).toBe('invalid_input');
    expect((await editError(blank, [{ op: 'automation.set', track: 1, target: 'level', from: 0, to: 9, startBar: 3, endBar: 1 }]))?.code).toBe('invalid_input');
    expect((await editError(subject(), [{ op: 'automation.set', index: 9, track: 1, target: 'level', from: 0, to: 9, startBar: 1, endBar: 1 }]))?.code).toBe('not_found');
    expect((await editError(subject(), [{ op: 'automation.clear', index: 9 }]))?.code).toBe('not_found');
    // A song may hold at most 32 lanes; the 33rd append is refused.
    const tooMany = Array.from({ length: 33 }, () => ({
      op: 'automation.set', track: 1, target: 'level', from: 0, to: 9, startBar: 1, endBar: 1,
    }));
    expect((await editError(blank, tooMany))?.code).toBe('invalid_input');
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

describe('song.diff finds lane changes and replays them', () => {
  it('finds a moved lane as one automation.set', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.automation[0].to = 40;
    after.automation[0].endBar = 3;
    const result = await diff(before, after);
    expect(result.edits).toEqual([
      { op: 'automation.set', index: 1, track: 1, target: 'bright', from: 20, to: 40, startBar: 1, endBar: 3 },
    ]);
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a removed lane as one automation.clear by index', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.automation.splice(1, 1);
    const result = await diff(before, after);
    expect(result.edits).toEqual([{ op: 'automation.clear', index: 2 }]);
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('clears every lane when the after song has none', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.automation = [];
    const result = await diff(before, after);
    expect(result.edits).toEqual([{ op: 'automation.clear' }]);
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });
});

describe('workspace.describe names every page', () => {
  it('lists the pages with one model summary each', async () => {
    const result = await callOperation('workspace.describe', { song: subject() });
    if (!result.ok) throw new Error('workspace.describe failed');
    const workspace = result.result as {
      current: string | null;
      pages: { id: string; label: string; summary: string; detail: unknown }[];
    };
    expect(workspace.pages.map((page) => page.id)).toEqual(['tracker', 'machine', 'mixer', 'arranger', 'arp', 'live', 'recorder']);
    expect(workspace.pages.map((page) => page.label)).toEqual(['TRACKER', 'DRUM MACHINE', 'MIXER', 'ARRANGER', 'ARP', 'LIVE', 'RECORDER']);
    expect(workspace.pages.every((page) => page.summary.length > 0)).toBe(true);
    expect(workspace.pages[3]?.summary).toContain('2 lanes');
  });

  it('echoes the page the caller says is showing, and refuses one it does not have', async () => {
    const shown = await callOperation('workspace.describe', { song: subject(), page: 'arranger' });
    if (!shown.ok) throw new Error('workspace.describe failed');
    expect((shown.result as { current: string | null }).current).toBe('arranger');

    const none = await callOperation('workspace.describe', { song: subject() });
    if (!none.ok) throw new Error('workspace.describe failed');
    expect((none.result as { current: string | null }).current).toBeNull();

    const refused = await callOperation('workspace.describe', { song: subject(), page: 'sampler' });
    expect(refused.ok).toBe(false);
  });
});
