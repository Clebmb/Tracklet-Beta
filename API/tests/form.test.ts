/**
 * The song's FORM over the API: naming groups of bars, arranging them, and
 * pointing a part at a bar of the drum machine.
 *
 * Three claims, in the order an agent meets them:
 *
 *   • `song.edit` can define a section (`section.set`), drop one
 *     (`section.clear`) and write the order as a list of names (`arrange.set`),
 *     exactly as the `section` and `arrange` lines a script writes already do;
 *   • a section names which drum-machine bar it plays, so the beat can follow
 *     the form;
 *   • `song.diff` finds those same changes and REPLAYS them — the section edits,
 *     the arrangement, and the section's machine bar.
 *
 * The fixture is the smallest song that HAS a form: two patterns, two named
 * groups of bars, and an arrangement that uses both.
 */

import { describe, expect, it } from 'vitest';

import { callOperation } from '../src/index';
import { applyScript, createSong, songFromJson, songToJson, type Song } from '../../src/model';

const SOURCE = [
  'new',
  'song "FORM TEST"',
  'key D minor',
  'tempo 120',
  'steps 16',
  'tracks 2',
  'track 1 "LEAD" voice lead',
  'track 2 "BASS" voice bass level 64',
  'pattern 1 "A"',
  'pattern 2 "B"',
  'section VERSE 1 1 2 1',
  'section CHORUS 2 2 1 2',
  'arrange VERSE CHORUS VERSE',
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

/**
 * A song as the file it saves as, through a round trip — the CANONICAL form.
 *
 * Not `songToJson` alone: a section whose bars no longer match the arrangement
 * leaves a claim the file READER drops, so an in-memory song straight after an
 * edit can carry an arrangement that its own saved file would not keep. Reading
 * it back is what `song.diff` and `library.update` actually see, so it is what a
 * replay has to be compared against.
 */
function canon(song: Song): string {
  const parsed = songFromJson(songToJson(song, { volume: null }));
  return parsed.ok ? songToJson(parsed.song, { volume: null }) : songToJson(song, { volume: null });
}

async function replayReaches(before: Song, result: DiffResult, after: Song): Promise<boolean> {
  const applied = await callOperation('song.edit', { song: before, edits: result.edits });
  if (!applied.ok) return false;
  return canon((applied.result as { song: Song }).song) === canon(after);
}

describe('the fixture really has a form', () => {
  it('holds two sections and an arrangement that builds the order', () => {
    const song = subject();
    expect(song.sections.map((one) => one.name)).toEqual(['VERSE', 'CHORUS']);
    expect(song.arrangement).toEqual(['VERSE', 'CHORUS', 'VERSE']);
    // VERSE is 1 1 2 1, CHORUS is 2 2 1 2, VERSE again.
    expect(song.order).toEqual([1, 1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1]);
  });
});

describe('song.edit writes the form', () => {
  it('defines a section and arranges the song with it', async () => {
    const result = await edited(subject(), [
      { op: 'section.set', name: 'bridge', bars: [2, 2] },
      { op: 'arrange.set', sections: ['VERSE', 'BRIDGE'] },
    ]);
    expect(result.song.sections.map((one) => one.name)).toEqual(['VERSE', 'CHORUS', 'BRIDGE']);
    expect(result.song.arrangement).toEqual(['VERSE', 'BRIDGE']);
    // The order is BUILT from the names: VERSE 1 1 2 1, then BRIDGE 2 2.
    expect(result.song.order).toEqual([1, 1, 2, 1, 2, 2]);
    const ops = result.edits.map((change) => change.op);
    expect(ops).toContain('section.set');
    expect(ops).toContain('arrange.set');
  });

  it('replaces a section by name — the last line about it counts', async () => {
    const result = await edited(subject(), [
      { op: 'section.set', name: 'VERSE', bars: [1, 2] },
    ]);
    const verse = result.song.sections.find((one) => one.name === 'VERSE');
    expect(verse?.bars).toEqual([1, 2]);
    // ...and the order it describes no longer matches, so it is no arrangement.
    expect(result.edits[0]).toMatchObject({ op: 'section.set', target: 'section VERSE', from: '1 1 2 1', to: '1 2' });
  });

  it("names a section's drum-machine bar, and un-names it", async () => {
    const named = await edited(subject(), [
      { op: 'section.set', name: 'CHORUS', bars: [2, 2, 1, 2], machine: 2 },
    ]);
    expect(named.song.sections.find((one) => one.name === 'CHORUS')?.machineBar).toBe(2);

    const unnamed = await edited(named.song, [
      { op: 'section.set', name: 'CHORUS', bars: [2, 2, 1, 2] },
    ]);
    expect(unnamed.song.sections.find((one) => one.name === 'CHORUS')?.machineBar ?? null).toBeNull();
  });

  it('drops a section, and it leaves the arrangement with it', async () => {
    const result = await edited(subject(), [{ op: 'section.clear', name: 'CHORUS' }]);
    expect(result.song.sections.map((one) => one.name)).toEqual(['VERSE']);
    expect(result.song.arrangement).toEqual(['VERSE', 'VERSE']);
    expect(result.edits[0]).toMatchObject({ op: 'section.clear', target: 'section CHORUS' });
  });

  it('clears the arrangement without touching the order', async () => {
    const before = subject();
    const result = await edited(before, [{ op: 'arrange.set', sections: [] }]);
    expect(result.song.arrangement).toEqual([]);
    expect(result.song.order).toEqual(before.order);
  });

  it('refuses a name that is not a name, empty bars, and an arrangement of a ghost', async () => {
    expect((await editError(subject(), [{ op: 'section.set', name: 'MY CHORUS', bars: [1] }]))?.code).toBe('invalid_input');
    expect((await editError(subject(), [{ op: 'section.set', name: 'VERSE', bars: [] }]))?.code).toBe('invalid_input');
    expect((await editError(subject(), [{ op: 'arrange.set', sections: ['GHOST'] }]))?.code).toBe('invalid_input');
    expect((await editError(subject(), [{ op: 'section.clear', name: 'GHOST' }]))?.code).toBe('not_found');
  });
});

describe('song.diff finds form changes and replays them', () => {
  it('finds a new section and the arrangement that uses it', async () => {
    const before = subject();
    const after = (await edited(before, [
      { op: 'section.set', name: 'BRIDGE', bars: [2, 2] },
      { op: 'arrange.set', sections: ['VERSE', 'BRIDGE', 'CHORUS'] },
    ])).song;
    const result = await diff(before, after);
    expect(result.edits.some((edit) => edit.op === 'section.set' && edit.name === 'BRIDGE')).toBe(true);
    expect(result.edits.some((edit) => edit.op === 'arrange.set')).toBe(true);
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it("finds a section's machine bar as one section.set", async () => {
    const before = subject();
    const after = (await edited(before, [
      { op: 'section.set', name: 'VERSE', bars: [1, 1, 2, 1], machine: 3 },
    ])).song;
    const result = await diff(before, after);
    expect(result.edits).toEqual([
      { op: 'section.set', name: 'VERSE', bars: [1, 1, 2, 1], machine: 3 },
    ]);
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a section that was removed, as one section.clear', async () => {
    const before = subject();
    const after = (await edited(before, [{ op: 'section.clear', name: 'CHORUS' }])).song;
    const result = await diff(before, after);
    expect(result.edits[0]).toMatchObject({ op: 'section.clear', name: 'CHORUS' });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds changed bars in a section', async () => {
    const before = subject();
    const after = (await edited(before, [
      { op: 'section.set', name: 'VERSE', bars: [1, 1, 2, 1, 2] },
    ])).song;
    const result = await diff(before, after);
    expect(result.edits[0]).toMatchObject({ op: 'section.set', name: 'VERSE', bars: [1, 1, 2, 1, 2] });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });
});
