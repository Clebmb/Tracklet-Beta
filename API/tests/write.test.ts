/**
 * `library.write`, tested both ways it can fail and once for real.
 *
 * The interesting part of writing a file is not that bytes land on disk — it is
 * every path that must NOT: a `..` escape, an absolute path, a folder in the way,
 * an extension the app cannot open, and a file that is already there. So most of
 * this file is refusals, checked against a temporary root so nothing real is
 * touched, plus ONE real write through the operation — with a name nobody else
 * will use — to prove the path the operation actually takes works, and then
 * deletes it again.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { callOperation } from '../src/index';
import {
  NEW_SONG_FOLDER,
  defaultSongPath,
  newSongFolder,
  repositoryRoot,
  writeSong,
} from '../src/library';
import { SONG_FILE_EXTENSION, applyScript, createSong, parseSongFile } from '../../src/model';

const SOURCE = [
  'new',
  'song "A SMALL DRAFT"',
  'key D minor',
  'tempo 96',
  'steps 16',
  'tracks 3',
  'track 1 "LEAD" voice lead',
  'track 2 "BASS" voice bass',
  'track 3 "HAT"  voice hat',
  'pattern 1 "A"',
  'D-5 D-2 kick',
  'C-5 A-2 hat',
  'F-5 D-2 snare',
  'A-5 A-2 hat',
  '',
].join('\n');

const song = (() => {
  const applied = applyScript(createSong(), SOURCE);
  if (!applied.ok) throw new Error('the fixture script must parse');
  return applied.song;
})();

let temp: string;

beforeAll(() => {
  temp = mkdtempSync(join(tmpdir(), 'tracklet-write-'));
});

afterAll(() => {
  rmSync(temp, { recursive: true, force: true });
});

/** Unwrap a result, or fail with the refusal's own words. */
function unwrap(result: { ok: boolean; result?: unknown; error?: unknown }): Record<string, unknown> {
  if (!result.ok) throw new Error(`expected a result, got: ${JSON.stringify(result.error)}`);
  return result.result as Record<string, unknown>;
}

describe('the name a song gets', () => {
  it('is the title, slugged, as a script by default', () => {
    expect(defaultSongPath(song)).toBe('a-small-draft.txt');
    expect(defaultSongPath(song, SONG_FILE_EXTENSION)).toBe('a-small-draft.json');
  });

  it('survives a title full of things a file name may not have', () => {
    const odd = { ...song, title: 'A/B: "TUNE"  *2026*' };
    const path = defaultSongPath(odd);
    expect(path).toMatch(/^[a-z0-9-]+\.txt$/);
  });
});

describe('writing a song', () => {
  it('writes the script, and the file reads back as the same song', () => {
    const written = writeSong({ song }, temp);
    expect(written.path).toBe(`${NEW_SONG_FOLDER}/a-small-draft.txt`);
    expect(written.format).toBe('script');
    expect(written.created).toBe(true);
    expect(written.overwrote).toBe(false);
    expect(written.bytes).toBeGreaterThan(50);

    const text = readFileSync(join(newSongFolder(temp), 'a-small-draft.txt'), 'utf8');
    const parsed = parseSongFile(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.song.title).toBe('A SMALL DRAFT');
    expect(parsed.song).toEqual(song);
  });

  it('creates the folder it needs, several levels deep if asked', () => {
    // A root of its own, because the assertion is that the folder did NOT exist.
    const fresh = mkdtempSync(join(tmpdir(), 'tracklet-write-fresh-'));
    try {
      const folder = newSongFolder(fresh);
      expect(existsSync(folder)).toBe(false);
      writeSong({ song: { ...song, title: 'DEEP' }, path: 'drafts/deep/nested-song.txt' }, fresh);
      expect(existsSync(join(folder, 'drafts', 'deep', 'nested-song.txt'))).toBe(true);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('writes the lossless format when the name says so, and it round-trips', () => {
    const written = writeSong({ song: { ...song, title: 'LOSSLESS' }, path: 'lossless.json' }, temp);
    expect(written.format).toBe('json');
    const text = readFileSync(join(newSongFolder(temp), 'lossless.json'), 'utf8');
    expect(text.trimStart().startsWith('{')).toBe(true);
    const parsed = parseSongFile(text);
    expect(parsed.ok && parsed.song).toEqual({ ...song, title: 'LOSSLESS' });
  });

  it('refuses to replace a file unless it is told to', () => {
    const first = writeSong({ song: { ...song, title: 'KEPT' }, path: 'kept.txt' }, temp);
    expect(first.created).toBe(true);

    expect(() => writeSong({ song: { ...song, title: 'REPLACED' }, path: 'kept.txt' }, temp)).toThrow(/already a file/);
    // The refusal left the file alone, which is the point of refusing.
    expect(readFileSync(join(newSongFolder(temp), 'kept.txt'), 'utf8')).toContain('KEPT');

    const second = writeSong({ song: { ...song, title: 'REPLACED' }, path: 'kept.txt', overwrite: true }, temp);
    expect(second.created).toBe(false);
    expect(second.overwrote).toBe(true);
    expect(readFileSync(join(newSongFolder(temp), 'kept.txt'), 'utf8')).toContain('REPLACED');
  });
});

describe('the paths it refuses', () => {
  const escapes = ['../escape.txt', '../../escape.txt', 'drafts/../../escape.txt', '/tmp/escape.txt', 'sub/../../out.txt'];

  it('never leaves the folder it writes into', () => {
    for (const path of escapes) {
      expect(() => writeSong({ song, path }, temp), path).toThrow(new RegExp(`outside ${NEW_SONG_FOLDER}`));
    }
    // Not one of them landed anywhere.
    expect(existsSync(join(temp, 'escape.txt'))).toBe(false);
    expect(existsSync(join(temp, 'out.txt'))).toBe(false);
  });

  it('refuses an extension the app cannot open', () => {
    for (const path of ['draft.mid', 'draft', 'draft.json.bak']) {
      expect(() => writeSong({ song, path }, temp), path).toThrow(/is written as/);
    }
  });

  it('accepts a name that only differs by case and stray space', () => {
    // `.TXT` is the same extension on the two systems that do not care and a
    // different one on the one that does, and the app opens both — so the check is
    // case-insensitive and the path is trimmed, rather than a caller being told off
    // for a trailing space a form added.
    const written = writeSong({ song: { ...song, title: 'SHOUTY' }, path: '  shouty.TXT  ' }, temp);
    expect(written.format).toBe('script');
    expect(existsSync(join(newSongFolder(temp), 'shouty.TXT'))).toBe(true);
  });

  it('refuses to write over a folder', () => {
    const folder = newSongFolder(temp);
    mkdirSync(join(folder, 'blocker.txt'), { recursive: true });
    expect(() => writeSong({ song, path: 'blocker.txt' }, temp)).toThrow(/is a folder/);
  });
});

describe('the operation', () => {
  it('says where songs are read from and the one folder they are written to', async () => {
    const folders = unwrap(await callOperation('library.folders', {}));
    expect(folders.writeFolder).toBe(NEW_SONG_FOLDER);
    expect(folders.readFolders).toEqual(['scripts', 'storage/songs']);
    expect(String(folders.rules)).toContain('overwrite');
  });

  it('refuses no song, and refuses two songs', async () => {
    const none = await callOperation('library.write', {});
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.code).toBe('invalid_input');

    const both = await callOperation('library.write', { script: SOURCE, songJson: '{}' });
    expect(both.ok).toBe(false);
    if (!both.ok) expect(both.error.message).toContain('ONE of');
  });

  it('refuses a script that does not parse, and writes nothing', async () => {
    const result = await callOperation('library.write', { script: 'new\nnonsense here\n', path: 'never-written.txt' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('script_refused');
    expect(result.error.details?.some((line) => /line \d+/.test(line))).toBe(true);
    expect(existsSync(join(newSongFolder(), 'never-written.txt'))).toBe(false);
  });

  it('writes a real file where a person can open it, then cleans up after itself', async () => {
    // The one test that touches the real library, and the only one that proves the
    // DEFAULT root works rather than a temporary one. The name is unique, the file
    // is removed in `finally`, and the folder is only removed if this left it
    // empty — so a run cannot damage what was already there.
    const path = `api-write-test-${process.pid}-${Date.now()}.txt`;
    const full = join(newSongFolder(), path);
    try {
      const written = unwrap(await callOperation('library.write', { script: SOURCE, path }));
      expect(written.path).toBe(`${NEW_SONG_FOLDER}/${path}`);
      expect(written.created).toBe(true);
      expect(written.title).toBe('A SMALL DRAFT');
      expect((written.summary as { notes: number }).notes).toBeGreaterThan(0);
      expect(String(written.next)).toContain('F2');
      expect(existsSync(full)).toBe(true);

      // And the app can open what it wrote: the same call the library uses.
      const opened = unwrap(await callOperation('library.open', { path: written.path as string }));
      expect((opened.song as { title: string }).title).toBe('A SMALL DRAFT');
    } finally {
      rmSync(full, { force: true });
      // `rmdir` rather than `rm`: it refuses a folder that is not empty, which is
      // exactly the rule this cleanup wants — remove what this test made, and
      // nothing that was already there.
      try {
        rmdirSync(newSongFolder());
      } catch {
        /* not empty, or never created: leave it alone */
      }
    }
  });

  it('refuses a path outside the folder it writes into, through the operation', async () => {
    const result = await callOperation('library.write', { script: SOURCE, path: '../../../outside.txt' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
  });

  it('reaches the write folder inside the repository it was pointed at', () => {
    expect(newSongFolder()).toBe(join(repositoryRoot(), NEW_SONG_FOLDER));
  });
});
