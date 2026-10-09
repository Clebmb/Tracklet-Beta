/**
 * The LIVE page over the API: reading the launch grid, editing scenes, and diffing
 * two sets.
 *
 * Three claims, in the order an agent meets them:
 *
 *   • `live.describe` shows the scene rows the way the page draws them — one row
 *     per scene, the pattern names its channels play, and its drum-machine bar —
 *     and says plainly that WHICH row is performing is session state the API cannot
 *     see;
 *   • `song.edit` can define, append, rename, copy and clear a scene with
 *     `scene.set`/`scene.add`/`scene.rename`/`scene.duplicate`/`scene.clear`,
 *     refusing what the language would refuse;
 *   • `song.diff` finds those changes and REPLAYS them, so a changed scene is one
 *     `scene.set` and a removed one is one `scene.clear`.
 */

import { describe, expect, it } from 'vitest';

import { callOperation } from '../src/index';
import {
  applyScript,
  createSong,
  MAX_SCENES,
  songToJson,
  type Song,
} from '../../src/model';

const SOURCE = [
  'new',
  'song "LIVE TEST"',
  'key D minor',
  'tempo 120',
  'steps 16',
  'tracks 3',
  'track 1 "LEAD" voice lead',
  'track 2 "BASS" voice bass',
  'track 3 "PAD" voice pad',
  'pattern 1 "A"',
  'D-5 D-2',
  'pattern 2 "B"',
  'F-5 F-2',
  'scene VERSE 1 1',
  'scene CHORUS 2 - 2 kit 2',
  '',
].join('\n');

function subject(): Song {
  const applied = applyScript(createSong(), SOURCE);
  if (!applied.ok) throw new Error(`the fixture must parse: ${JSON.stringify(applied.errors)}`);
  return applied.song;
}

/** A song with every scene slot taken, for the too-many-scenes refusals. */
function full(): Song {
  const lines = ['new', 'steps 16', 'tracks 2', 'pattern 1 "A"', 'D-5', 'pattern 2 "B"', 'F-5'];
  for (let n = 1; n <= MAX_SCENES; n++) lines.push(`scene S${n} 1 2`);
  const applied = applyScript(createSong(), lines.join('\n'));
  if (!applied.ok) throw new Error(`the full fixture must parse: ${JSON.stringify(applied.errors)}`);
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

interface LiveDescription {
  scenes: {
    name: string;
    script: string;
    clips: { channel: number; channelName: string; pattern: number | null; patternName: string | null; notes: number }[];
    machine: number | null;
    machineLabel: string | null;
  }[];
  count: number;
  maxScenes: number;
  channels: number;
  bars: number;
  hasMachine: boolean;
  script: string;
  performing: null;
  note: string;
}

async function describeLive(song: Song): Promise<LiveDescription> {
  const result = await callOperation('live.describe', { song });
  if (!result.ok) throw new Error(`live.describe failed: ${JSON.stringify(result.error)}`);
  return result.result as LiveDescription;
}

describe('live.describe reads the launch grid back', () => {
  it('shows one row per scene, with the pattern each channel plays', async () => {
    const read = await describeLive(subject());
    expect(read.count).toBe(2);
    expect(read.scenes.map((scene) => scene.name)).toEqual(['VERSE', 'CHORUS']);
    expect(read.maxScenes).toBe(MAX_SCENES);
    expect(read.channels).toBe(3);

    const verse = read.scenes[0];
    expect(verse?.script).toBe('VERSE');
    expect(verse?.clips.map((clip) => clip.pattern)).toEqual([1, 1, null]);
    expect(verse?.clips.map((clip) => clip.patternName)).toEqual(['A', 'A', null]);
    expect(verse?.clips.map((clip) => clip.channelName)).toEqual(['LEAD', 'BASS', 'PAD']);
    // Every channel sounds its clip's own note at its own column.
    expect(verse?.clips.slice(0, 2).map((clip) => clip.notes)).toEqual([1, 1]);
    expect(verse?.clips[2]?.notes).toBe(0);
  });

  it('carries the drum-machine bar a scene performs', async () => {
    const read = await describeLive(subject());
    expect(read.scenes[0]?.machine).toBeNull();
    expect(read.scenes[0]?.machineLabel).toBeNull();
    expect(read.scenes[1]?.machine).toBe(2);
    expect(read.scenes[1]?.machineLabel).toBe('B2');
  });

  it('writes the rows as a script block a caller can paste back', async () => {
    const read = await describeLive(subject());
    expect(read.script).toBe('scene VERSE 1 1 -\nscene CHORUS 2 - 2 kit 2');
  });

  it('says which row is performing is session state it cannot see', async () => {
    const read = await describeLive(subject());
    expect(read.performing).toBeNull();
    expect(read.note).toContain('session state');
  });

  it('answers a blank song with no scenes', async () => {
    const read = await describeLive(createSong());
    expect(read.count).toBe(0);
    expect(read.scenes).toEqual([]);
    expect(read.script).toBe('');
  });
});

describe('song.edit writes scenes with the scene.* edits', () => {
  it('defines a scene with scene.set, clips and machine bar', async () => {
    const result = await edited(createSong(), [
      { op: 'scene.set', name: 'INTRO', clips: [1, 2, null], machine: 3 },
    ]);
    expect(result.song.scenes).toEqual([{ name: 'INTRO', clips: [1, 2, null, null], machine: 3 }]);
    expect(result.edits[0]).toMatchObject({ op: 'scene.set', target: 'scene INTRO' });
  });

  it('replaces a scene already defined under the same name', async () => {
    const result = await edited(subject(), [{ op: 'scene.set', name: 'VERSE', clips: [2, 2, 2] }]);
    expect(result.song.scenes).toHaveLength(2);
    // The CHORUS row is untouched; VERSE is replaced in place.
    expect(result.song.scenes[0]).toEqual({ name: 'VERSE', clips: [2, 2, 2], machine: null });
    expect(result.song.scenes[1]).toMatchObject({ name: 'CHORUS' });
  });

  it('appends an empty row with scene.add, named or fresh', async () => {
    const fresh = await edited(subject(), [{ op: 'scene.add' }]);
    expect(fresh.song.scenes.map((scene) => scene.name)).toEqual(['VERSE', 'CHORUS', 'SCENE 1']);
    expect(fresh.song.scenes[2]?.clips).toEqual([null, null, null]);

    const named = await edited(subject(), [{ op: 'scene.add', name: 'OUTRO' }]);
    expect(named.song.scenes.map((scene) => scene.name)).toEqual(['VERSE', 'CHORUS', 'OUTRO']);
  });

  it('renames a scene in place', async () => {
    const result = await edited(subject(), [{ op: 'scene.rename', name: 'VERSE', to: 'INTRO' }]);
    expect(result.song.scenes.map((scene) => scene.name)).toEqual(['INTRO', 'CHORUS']);
    expect(result.edits[0]).toMatchObject({ op: 'scene.rename', from: 'VERSE', to: 'INTRO' });
  });

  it('copies a scene right after itself, with scene.duplicate', async () => {
    const result = await edited(subject(), [{ op: 'scene.duplicate', name: 'VERSE' }]);
    expect(result.song.scenes.map((scene) => scene.name)).toEqual(['VERSE', 'SCENE 1', 'CHORUS']);
    // The copy carries the source's clips.
    expect(result.song.scenes[1]?.clips).toEqual([1, 1, null]);

    const named = await edited(subject(), [{ op: 'scene.duplicate', name: 'CHORUS', to: 'CHORUS 2' }]);
    expect(named.song.scenes.map((scene) => scene.name)).toEqual(['VERSE', 'CHORUS', 'CHORUS 2']);
    expect(named.song.scenes[2]?.machine).toBe(2);
  });

  it('removes one scene by name, or every scene with no name', async () => {
    const one = await edited(subject(), [{ op: 'scene.clear', name: 'VERSE' }]);
    expect(one.song.scenes.map((scene) => scene.name)).toEqual(['CHORUS']);

    const all = await edited(subject(), [{ op: 'scene.clear' }]);
    expect(all.song.scenes).toEqual([]);
    expect(all.edits[0]).toMatchObject({ op: 'scene.clear', target: 'scenes' });
  });

  it('refuses a bad name, bad clips, an unknown scene and too many scenes', async () => {
    const blank = createSong();
    // A name beyond the 16-character budget.
    expect((await editError(blank, [{ op: 'scene.set', name: 'ABCDEFGHIJKLMNOPQ', clips: [1] }]))?.code).toBe('invalid_input');
    // No clips list at all.
    expect((await editError(blank, [{ op: 'scene.set', name: 'A' }]))?.code).toBe('invalid_input');
    // A clip that is neither a number nor silence.
    expect((await editError(blank, [{ op: 'scene.set', name: 'A', clips: ['x'] }]))?.code).toBe('invalid_input');
    // Addressing a scene that does not exist.
    expect((await editError(subject(), [{ op: 'scene.rename', name: 'NOPE', to: 'X' }]))?.code).toBe('not_found');
    expect((await editError(subject(), [{ op: 'scene.duplicate', name: 'NOPE' }]))?.code).toBe('not_found');
    expect((await editError(subject(), [{ op: 'scene.clear', name: 'NOPE' }]))?.code).toBe('not_found');
    // A song may hold at most 32 scenes; the 33rd add is refused.
    expect((await editError(full(), [{ op: 'scene.add' }]))?.code).toBe('invalid_input');
    expect((await editError(full(), [{ op: 'scene.set', name: 'EXTRA', clips: [1] }]))?.code).toBe('invalid_input');
  });
});

interface LaunchResult {
  name: string;
  index: number;
  scene: { name: string };
  quantize: number;
  wait: string;
  queued: boolean;
  note: string;
}

describe('live.launch resolves a scene without changing the song', () => {
  it('resolves a scene by name and names the wait', async () => {
    const result = await callOperation('live.launch', { song: subject(), name: 'VERSE' });
    if (!result.ok) throw new Error('live.launch failed');
    const launch = result.result as LaunchResult;
    expect(launch.name).toBe('VERSE');
    expect(launch.index).toBe(0);
    expect(launch.quantize).toBe(1);
    expect(launch.wait).toBe('the next bar');
    expect(launch.queued).toBe(false);
    expect(launch.note).toContain('never saved to the song');
  });

  it('honours the quantize it is given, including immediate', async () => {
    const immediate = await callOperation('live.launch', { song: subject(), name: 'CHORUS', quantize: 0 });
    if (!immediate.ok) throw new Error('live.launch failed');
    expect((immediate.result as LaunchResult).wait).toBe('the next step');

    const bars = await callOperation('live.launch', { song: subject(), name: 'CHORUS', quantize: 4 });
    if (!bars.ok) throw new Error('live.launch failed');
    expect((bars.result as LaunchResult).wait).toBe('the next 4 bars');
  });

  it('refuses a scene it does not have', async () => {
    const result = await callOperation('live.launch', { song: subject(), name: 'NOPE' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
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

describe('song.diff finds scene changes and replays them', () => {
  it('finds a changed scene as one scene.set', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.scenes[0].clips[1] = 2;
    after.scenes[0].machine = 4;
    const result = await diff(before, after);
    expect(result.edits).toEqual([
      { op: 'scene.set', name: 'VERSE', clips: [1, 2, null], machine: 4 },
    ]);
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a removed scene as one scene.clear', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.scenes.splice(0, 1);
    const result = await diff(before, after);
    expect(result.edits).toEqual([{ op: 'scene.clear', name: 'VERSE' }]);
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('clears every scene when the after song has none', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.scenes = [];
    const result = await diff(before, after);
    expect(result.edits).toEqual([
      { op: 'scene.clear', name: 'VERSE' },
      { op: 'scene.clear', name: 'CHORUS' },
    ]);
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });
});
