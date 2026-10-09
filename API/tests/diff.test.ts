/**
 * `song.diff` — the edit list between two songs, and the claim that it replays.
 *
 * The one assertion worth having is not "the diff mentions the tempo" but "applying
 * the diff to the first song produces the second one", checked through the song's
 * own writer so two differently-built songs compare by what they hold rather than
 * by the order their keys happen to sit in. Every test that changes something ends
 * by REPLAYING the returned edits through `song.edit` and comparing — the same
 * thing `verify` does internally, held to from the outside.
 *
 * The second theme is honesty: a change the vocabulary cannot express (a removed
 * pattern, a lost channel, an arrangement the edits do not write) must show up in
 * `notes` and must leave `verified` false, never be silently dropped.
 */

import { describe, expect, it } from 'vitest';

import { callOperation } from '../src/index';
import {
  applyScript,
  createSong,
  emptyCell,
  emptyPattern,
  setCellDrum,
  songToJson,
  type Song,
} from '../../src/model';

const SOURCE = [
  'new',
  'song "SUBJECT"',
  'key D minor',
  'tempo 100',
  'steps 16',
  'tracks 3',
  'track 1 "LEAD" voice lead',
  'track 2 "BASS" voice bass level 64',
  'track 3 "HAT"  voice hat',
  'pattern 1 "A"',
  'D-5 D-2 kick',
  '',
].join('\n');

function subject(): Song {
  const applied = applyScript(createSong(), SOURCE);
  if (!applied.ok) throw new Error('the fixture must parse');
  return applied.song;
}

interface DiffResult {
  identical: boolean;
  changed: number;
  edits: Record<string, unknown>[];
  changes: { edit: number; op: string; target: string; from: string; to: string; changed: boolean }[];
  notes: string[];
  verified: boolean;
}

async function diff(before: Song, after: Song): Promise<DiffResult> {
  const result = await callOperation('song.diff', { before, after });
  if (!result.ok) throw new Error(`diff failed: ${JSON.stringify(result.error)}`);
  return result.result as DiffResult;
}

/** Canonical text for a song, so two songs compare by music and not by key order. */
const text = (song: Song): string => songToJson(song, { volume: null });

/** The edits actually turn `before` into `after` through the normal editor. */
async function replayReaches(before: Song, result: DiffResult, after: Song): Promise<boolean> {
  const applied = await callOperation('song.edit', { song: before, edits: result.edits });
  if (!applied.ok) return false;
  return text((applied.result as { song: Song }).song) === text(after);
}

describe('the diff is an edit list that replays', () => {
  it('says nothing changed, and verifies it, for a song against itself', async () => {
    const result = await diff(subject(), subject());
    expect(result.identical).toBe(true);
    expect(result.changed).toBe(0);
    expect(result.edits).toEqual([]);
    expect(result.verified).toBe(true);
  });

  it('finds a tempo change as one song.set, and replays it', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.bpm = 132;
    const result = await diff(before, after);
    expect(result.changed).toBe(1);
    expect(result.edits[0]).toMatchObject({ op: 'song.set', bpm: 132 });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a channel change as one track.set, and replays it', async () => {
    const before = subject();
    const after = structuredClone(before);
    const bass = after.tracks[1];
    if (!bass) throw new Error('fixture has no bass');
    bass.level = 40;
    bass.pan = -30;
    bass.muted = true;
    const result = await diff(before, after);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]).toMatchObject({ op: 'track.set', track: 2, level: 40, pan: -30, muted: true });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a written note and replays it', async () => {
    const before = subject();
    const after = structuredClone(before);
    const cell = after.patterns[0]?.steps[0]?.[0];
    if (!cell) throw new Error('fixture has no cell');
    cell.note = 65;
    cell.extra = [];
    const result = await diff(before, after);
    expect(result.edits[0]).toMatchObject({ op: 'cell.set', pattern: 1, row: 0, track: 1, notes: [65] });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a cleared step as a cell.clear', async () => {
    const before = subject();
    const after = structuredClone(before);
    const pattern = after.patterns[0];
    if (!pattern?.steps[0]) throw new Error('fixture has no row');
    pattern.steps[0][0] = emptyCell();
    const result = await diff(before, after);
    expect(result.edits[0]).toMatchObject({ op: 'cell.clear', pattern: 1, row: 0, track: 1 });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a drum and replays it', async () => {
    const before = subject();
    const after = structuredClone(before);
    const cell = after.patterns[0]?.steps[0]?.[2];
    if (!cell) throw new Error('fixture has no drum cell');
    setCellDrum(cell, 'snare');
    const result = await diff(before, after);
    expect(result.edits[0]).toMatchObject({ op: 'cell.set', pattern: 1, row: 0, track: 3, drum: 'snare' });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('records the per-note feel only when it moved', async () => {
    const before = subject();
    const after = structuredClone(before);
    const cell = after.patterns[0]?.steps[0]?.[0];
    if (!cell) throw new Error('fixture has no cell');
    cell.velocity = 44;
    cell.slide = true;
    const result = await diff(before, after);
    expect(result.edits[0]).toMatchObject({ op: 'cell.set', velocity: 44, slide: true });
    // The step's NOTE did not move, only its velocity — and the log says so
    // rather than reporting an unchanged token as if nothing had happened.
    expect(result.changes[0]?.changed).not.toBe(false);
    expect(result.changes[0]?.from).not.toBe(result.changes[0]?.to);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds an added pattern and replays it, without a line per empty step', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.patterns.push(emptyPattern('PATTERN 2', 16, 3));
    const added = after.patterns[1]?.steps[0]?.[0];
    if (!added) throw new Error('added pattern has no cell');
    added.note = 69;
    const result = await diff(before, after);
    expect(result.edits).toEqual([{ op: 'cell.set', pattern: 2, row: 0, track: 1, notes: [69] }]);
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds an arrangement change and replays it', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.order = [1, 1, 1];
    const result = await diff(before, after);
    expect(result.edits).toContainEqual({ op: 'order.set', order: [1, 1, 1] });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('says what moved, in the same log song.edit would', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.bpm = 90;
    const result = await diff(before, after);
    expect(result.changes[0]).toMatchObject({ op: 'song.set', target: 'tempo', from: '100', to: '90' });
  });
});

describe('what the vocabulary cannot say is said, not dropped', () => {
  it('notes a removed pattern and refuses to call the diff verified', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.patterns.push(emptyPattern('PATTERN 2', 16, 3));
    const removed = await diff(after, before);
    expect(removed.verified).toBe(false);
    expect(removed.notes.join(' ')).toContain('remove a pattern');
  });

  it('notes an added EMPTY pattern, which nothing in the vocabulary can create', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.patterns.push(emptyPattern('PATTERN 2', 16, 3));
    const result = await diff(before, after);
    expect(result.verified).toBe(false);
    expect(result.notes.join(' ')).toContain('empty pattern');
  });

  it('notes a lost channel', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.tracks.pop();
    const result = await diff(before, after);
    expect(result.verified).toBe(false);
    expect(result.notes.join(' ')).toContain('add or remove a channel');
  });

  it('notes a renamed pattern', async () => {
    const before = subject();
    const after = structuredClone(before);
    const pattern = after.patterns[0];
    if (!pattern) throw new Error('fixture has no pattern');
    pattern.name = 'VERSE';
    const result = await diff(before, after);
    expect(result.notes.join(' ')).toContain('renamed');
    expect(result.verified).toBe(false);
  });

  it('notes a change to a surface the vocabulary does not touch', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.tuning = 'just';
    const result = await diff(before, after);
    expect(result.notes.join(' ')).toContain('tuning');
    expect(result.verified).toBe(false);
  });

  it('writes an added automation lane as one automation.set, and replays it', async () => {
    // The ARRANGER's lanes are editable now, so a lane that appeared is part of
    // the replayable list rather than a note about a surface the vocabulary
    // cannot touch.
    const before = subject();
    const after = structuredClone(before);
    after.automation.push({ track: 1, target: 'level', from: 40, to: 90, startBar: 1, endBar: 2 });
    const result = await diff(before, after);
    expect(result.notes).toEqual([]);
    expect(result.edits).toContainEqual({
      op: 'automation.set', index: 1, track: 1, target: 'level', from: 40, to: 90, startBar: 1, endBar: 2,
    });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('finds a group added or moved, and replays it', async () => {
    const before = subject();
    const after = structuredClone(before);
    after.buses = [{ name: 'DRUMS', level: 70 }];
    after.tracks[0].bus = 'DRUMS';
    const result = await diff(before, after);
    expect(result.notes).toEqual([]);
    expect(result.edits).toContainEqual({ op: 'bus.set', name: 'DRUMS', level: 70 });
    expect(result.edits.find((edit) => edit.op === 'track.set')).toMatchObject({ track: 1, bus: 'DRUMS' });
    expect(result.verified).toBe(true);
    expect(await replayReaches(before, result, after)).toBe(true);
  });

  it('refuses when one of the two songs is missing', async () => {
    expect((await callOperation('song.diff', { after: subject() })).ok).toBe(false);
    expect((await callOperation('song.diff', { before: subject() })).ok).toBe(false);
  });
});
