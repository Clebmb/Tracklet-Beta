/**
 * `library.update` — surgical editing, one file further out.
 *
 * `song.edit` proved the edit vocabulary; this proves the FILE half: that a saved
 * draft can be changed by sending only the change, that it keeps its format, that
 * it refuses to touch anything outside the one writable folder, and — the claim
 * that matters most — that a call with one bad edit leaves the file exactly as it
 * was rather than half-edited.
 *
 * Every test runs against a temporary library root, so nothing in the real
 * checkout is read or written: `TRACKLET_LIBRARY_ROOT` is pointed at a folder this
 * file owns and restored afterwards.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { callOperation } from '../src/index';
import { NEW_SONG_FOLDER, draftRelativePath, readDraft } from '../src/library';
import { applyScript, createSong, parseSongFile, songToJson, type Song } from '../../src/model';

const SOURCE = [
  'new',
  'song "DRAFT"',
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

function fixture(): Song {
  const applied = applyScript(createSong(), SOURCE);
  if (!applied.ok) throw new Error('the fixture must parse');
  return applied.song;
}

async function write(path: string, song: Song = fixture()) {
  const result = await callOperation('library.write', { song, path });
  if (!result.ok) throw new Error(`write failed: ${JSON.stringify(result.error)}`);
  return result.result as { path: string; format: string };
}

async function update(path: string, edits: unknown[]) {
  return callOperation('library.update', { path, edits });
}

async function updated(path: string, edits: unknown[]) {
  const result = await update(path, edits);
  if (!result.ok) throw new Error(`update failed: ${JSON.stringify(result.error)}`);
  return result.result as { path: string; format: string; changed: number; edits: { target: string; from: string; to: string }[] };
}

const disk = (relative: string): string => readFileSync(join(root, NEW_SONG_FOLDER, relative), 'utf8');

let root: string;
const previous = process.env.TRACKLET_LIBRARY_ROOT;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'tracklet-update-'));
  process.env.TRACKLET_LIBRARY_ROOT = root;
});

afterAll(() => {
  if (previous === undefined) delete process.env.TRACKLET_LIBRARY_ROOT;
  else process.env.TRACKLET_LIBRARY_ROOT = previous;
  rmSync(root, { recursive: true, force: true });
});

describe('a saved draft can be changed by sending only the change', () => {
  it('edits a script in place and reports what moved', async () => {
    await write('in-place.txt');
    const result = await updated('in-place.txt', [
      { op: 'song.set', bpm: 124 },
      { op: 'track.set', track: 2, level: 70 },
    ]);
    expect(result.changed).toBe(2);
    expect(result.edits.map((change) => change.target)).toEqual(['tempo', 'channel 2 level']);
    // The change is on disk, not just in the answer.
    const onDisk = disk('in-place.txt');
    expect(onDisk).toContain('tempo 124');
    expect(onDisk).toContain('level 70');
  });

  it('accepts the path library.list reports as well as the short one', async () => {
    await write('both-ways.txt');
    const full = `${NEW_SONG_FOLDER}/both-ways.txt`;
    const result = await updated(full, [{ op: 'song.set', bpm: 90 }]);
    expect(result.path).toBe(full);
    expect(disk('both-ways.txt')).toContain('tempo 90');
  });

  it('keeps the draft’s own format', async () => {
    const song = fixture();
    await callOperation('library.write', { songJson: songToJson(song, { volume: null }), path: 'kept.json' });
    const result = await updated('kept.json', [{ op: 'song.set', bpm: 111 }]);
    expect(result.format).toBe('json');
    const parsed = parseSongFile(disk('kept.json'));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.song.bpm).toBe(111);
  });

  it('returns the draft as a song, so an agent can read it back on the next call', async () => {
    await write('round-trip.txt');
    const result = await updated('round-trip.txt', [{ op: 'cell.set', pattern: 1, row: 0, track: 1, note: 'F-4' }]);
    const opened = await callOperation('library.open', { path: result.path });
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      const song = (opened.result as { song: Song }).song;
      expect(song.patterns[0]?.steps[0]?.[0]?.note).toBe(65);
    }
  });
});

describe('an update that does not fit leaves the file alone', () => {
  it('refuses a bad edit, and the file is byte-for-byte what it was', async () => {
    await write('atomic.txt');
    const before = disk('atomic.txt');
    const result = await update('atomic.txt', [
      { op: 'song.set', bpm: 175 },
      { op: 'track.set', track: 99, level: 50 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_found');
      expect(result.error.message).toContain('edit 2');
    }
    expect(disk('atomic.txt')).toBe(before);
  });

  it('refuses an empty edit list before opening anything', async () => {
    await write('empty.txt');
    expect((await update('empty.txt', [])).ok).toBe(false);
  });

  it('refuses a path outside the writable folder', async () => {
    for (const path of ['../escape.txt', '..\\escape.txt', '/etc/passwd']) {
      const result = await update(path, [{ op: 'song.set', bpm: 100 }]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(['invalid_input', 'not_found']).toContain(result.error.code);
    }
  });

  it('refuses a draft that is not there', async () => {
    const result = await update('never-written.txt', [{ op: 'song.set', bpm: 100 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('refuses a file that is not a song', async () => {
    const result = await update('notes.md', [{ op: 'song.set', bpm: 100 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });
});

describe('the draft path is written both ways', () => {
  it('normalizes the two spellings the library uses', () => {
    expect(draftRelativePath('my-tune.txt')).toBe('my-tune.txt');
    expect(draftRelativePath(`${NEW_SONG_FOLDER}/my-tune.txt`)).toBe('my-tune.txt');
    expect(draftRelativePath(`./${NEW_SONG_FOLDER}/deep/my-tune.txt`)).toBe('deep/my-tune.txt');
  });

  it('reads a draft and says which format it is', async () => {
    await write('readable.txt');
    const draft = readDraft('readable.txt', root);
    expect(draft.path).toBe(`${NEW_SONG_FOLDER}/readable.txt`);
    expect(draft.relative).toBe('readable.txt');
    expect(draft.format).toBe('script');
    expect(draft.text).toContain('song "DRAFT"');
  });
});
