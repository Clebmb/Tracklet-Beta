/**
 * library — the songs already on this machine, as data.
 *
 * The most useful thing an agent can do with a new tool is read something that
 * already works in it. Tracklet's repository has two folders full of exactly
 * that: `scripts/` (songs written as Tracklet Script, by hand and by other
 * models) and `storage/songs/` (the author's own songs, kept with the kit). This
 * module walks them, applies each file to a fresh song the way the app would, and
 * reports what came back — title, key, tempo, and whether it even parsed.
 *
 * Two rules make it safe to point at a checkout:
 *
 *   • every path is resolved and then CONTAINED — a name that escapes the song
 *     roots through `..` is refused rather than read, because a library reader is
 *     not a file browser;
 *   • a file that fails to parse is still LISTED, with the reason. A folder that
 *     silently hides the broken file is a folder that cannot be cleaned up.
 *
 * The roots are found relative to this file (up three levels from `API/src` to the
 * repository), and may be overridden with `TRACKLET_LIBRARY_ROOT` for a caller
 * that keeps the songs somewhere else.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCRIPT_FILE_EXTENSION,
  SONG_FILE_EXTENSION,
  applyScript,
  createSong,
  keyName,
  parseSongFile,
  songFileStem,
  songToJson,
  songToScript,
  type Song,
} from '../../src/model';
import { refuse } from './result';

/** Where the songs live, relative to this module: `API/src` -> the repository. */
export function repositoryRoot(): string {
  const override = process.env.TRACKLET_LIBRARY_ROOT;
  if (override) return resolve(override);
  return resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
}

/** The two folders this library reads, in the order a person would browse them. */
export function songRoots(): string[] {
  const root = repositoryRoot();
  return [join(root, 'scripts'), join(root, 'storage', 'songs')];
}

export interface SongLibraryEntry {
  /** Path relative to the repository, with forward slashes: `scripts/deepseek/01-….txt`. */
  path: string;
  /** The folder it lives in, relative to the repository. */
  folder: string;
  /** The file's own name, without the folder. */
  name: string;
  /** True when the file parsed and became a song. */
  ok: boolean;
  /** The first refusal, when it did not. */
  error?: string;
  title?: string;
  key?: string;
  bpm?: number;
  tracks?: number;
  patterns?: number;
  notes?: number;
  bars?: number;
}

/** Every `.txt` under the song roots, depth-first and sorted, ignoring noise. */
function songFiles(dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch {
    return; // a root that does not exist is simply empty
  }
  for (const name of names) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
    const path = join(dir, name);
    let isDirectory = false;
    try {
      isDirectory = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (isDirectory) {
      songFiles(path, out);
    } else if (name.endsWith('.txt')) {
      out.push(path);
    }
  }
}

/** The entry one file makes, applied to a fresh song. */
function entryFor(root: string, path: string): SongLibraryEntry {
  const rel = relative(root, path).split(sep).join('/');
  const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  const base: SongLibraryEntry = { path: rel, folder, name, ok: false };
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
  const result = applyScript(createSong(), source);
  if (!result.ok) {
    const first = result.errors[0];
    return {
      ...base,
      error: first ? `line ${first.line}: ${first.message}` : 'the song did not parse.',
    };
  }
  const { summary } = result;
  return {
    ...base,
    ok: true,
    title: summary.title,
    key: summary.key,
    bpm: summary.bpm,
    tracks: summary.tracks,
    patterns: summary.patterns,
    notes: summary.notes,
    bars: summary.slots,
  };
}

export interface ListOptions {
  /** Only files whose path contains this text, case-insensitively. */
  query?: string;
  /** Stop after this many entries. The whole repository is a few hundred files. */
  limit?: number;
}

/** Every song this machine has, whether or not each one parses. */
export function listSongs(options: ListOptions = {}): SongLibraryEntry[] {
  const root = repositoryRoot();
  const files: string[] = [];
  for (const songs of songRoots()) songFiles(songs, files);
  const needle = options.query?.toLowerCase() ?? '';
  const entries: SongLibraryEntry[] = [];
  for (const path of files) {
    const entry = entryFor(root, path);
    if (needle && !entry.path.toLowerCase().includes(needle)) continue;
    entries.push(entry);
    if (options.limit !== undefined && entries.length >= options.limit) break;
  }
  return entries;
}

/** Read one song file's text, refusing anything outside the song roots. */
export function readSong(path: string): { path: string; text: string } {
  const root = repositoryRoot();
  const full = resolve(root, path);
  const inside = songRoots().some((allowed) => full === allowed || full.startsWith(allowed + sep));
  if (!inside || !full.startsWith(root + sep)) {
    refuse('invalid_input', `"${path}" is outside the song folders this machine keeps.`);
  }
  if (!existsSync(full) || !statSync(full).isFile()) {
    refuse('not_found', `there is no file at "${path}".`);
  }
  return { path: relative(root, full).split(sep).join('/'), text: readFileSync(full, 'utf8') };
}

// --- writing: where a NEW song goes -----------------------------------------

/**
 * The one folder this API writes into, relative to the repository.
 *
 * A folder of its own rather than `scripts/`, and the reason is a test. Every song
 * under `scripts/` is a CURATED example: `songs.test.ts` walks that folder and
 * holds each one to at least fifty notes, two patterns and three channels. An
 * agent's draft — a bar it is trying out, a two-note experiment — would fail those
 * rules, and a feature that breaks the repository's own test suite is a feature
 * nobody can leave switched on.
 *
 * So drafts go beside the author's work instead: `storage/songs/` is a song root
 * this library already reads, its subfolders are the existing convention there
 * (`dkc/`, `frog/`), it is gitignored, and nothing walks it looking for finished
 * music. A song written here can be opened in the app and, once it is good, saved
 * wherever the author wants it.
 */
export const NEW_SONG_FOLDER = 'storage/songs/agent';

/** The absolute folder a written song lands in. */
export function newSongFolder(root: string = repositoryRoot()): string {
  return join(root, NEW_SONG_FOLDER);
}

/**
 * Resolve `path` inside `folder`, or refuse.
 *
 * The same rule the reader follows, kept stricter: a relative path is joined, an
 * absolute one is not (so `/etc/passwd` resolves outside and is refused), and the
 * result is checked to be inside the folder rather than merely to contain its
 * name — `../songs-of-mine` is not inside `songs`.
 */
function containedPath(folder: string, path: string): string {
  const full = resolve(folder, path);
  if (full !== folder && !full.startsWith(folder + sep)) {
    refuse('invalid_input', `"${path}" would write outside ${NEW_SONG_FOLDER}.`, [
      `songs are written inside ${NEW_SONG_FOLDER}, so a path like "my-tune.txt" is all this needs.`,
    ]);
  }
  return full;
}

/** The file name a song gets when the caller does not choose one. */
export function defaultSongPath(song: Song, extension: string = SCRIPT_FILE_EXTENSION): string {
  return `${songFileStem(song.title)}${extension}`;
}

export interface WriteSongRequest {
  song: Song;
  /** A path inside the write folder. Defaults to the song's title, slugged. */
  path?: string;
  /** Replace a file that is already there. Off by default. */
  overwrite?: boolean;
}

export interface WriteSongResult {
  /** The path written, relative to the repository, with forward slashes. */
  path: string;
  /** The folder it lives in, relative to the repository. */
  folder: string;
  bytes: number;
  /** Which format the extension chose. */
  format: 'script' | 'json';
  /** True when the file did not exist before. */
  created: boolean;
  /** True when it did exist and was replaced. */
  overwrote: boolean;
}

/**
 * Write a song into the library, and check it can be read back.
 *
 * The read-back is the part worth the extra parse: the whole point of writing is
 * that something ELSE opens the file later, and a writer that emits something its
 * own reader refuses has produced a file that looks fine and cannot be opened.
 * Doing it here turns that into an `internal` refusal at the moment of writing,
 * where it is a bug report, rather than at the moment of opening, where it is a
 * mystery.
 */
export function writeSong(request: WriteSongRequest, root: string = repositoryRoot()): WriteSongResult {
  const folder = newSongFolder(root);
  const asked = request.path?.trim() ?? '';
  const relativePath = asked === '' ? defaultSongPath(request.song) : asked;
  const full = containedPath(folder, relativePath);

  const extension = extname(full).toLowerCase();
  if (extension !== SCRIPT_FILE_EXTENSION && extension !== SONG_FILE_EXTENSION) {
    refuse('invalid_input', `a song is written as ${SCRIPT_FILE_EXTENSION} or ${SONG_FILE_EXTENSION}, not "${extension || relativePath}".`, [
      `${SCRIPT_FILE_EXTENSION} is the readable one the app opens as text; ${SONG_FILE_EXTENSION} is the lossless one that keeps every setting.`,
    ]);
  }
  const format: 'script' | 'json' = extension === SONG_FILE_EXTENSION ? 'json' : 'script';
  const text = format === 'json' ? songToJson(request.song, { volume: null }) : songToScript(request.song, { volume: null });

  const parsed = parseSongFile(text);
  if (!parsed.ok) {
    refuse('internal', 'the song was serialised into something this build cannot read back.', parsed.errors.slice(0, 6));
  }

  const existed = existsSync(full);
  if (existed && statSync(full).isDirectory()) {
    refuse('invalid_input', `"${relativePath}" is a folder, not a file.`);
  }
  if (existed && request.overwrite !== true) {
    refuse('invalid_input', `there is already a file at "${relativePath}".`, [
      'pass "overwrite": true to replace it, or choose another path.',
    ]);
  }

  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, 'utf8');

  return {
    path: relative(root, full).split(sep).join('/'),
    folder: NEW_SONG_FOLDER,
    bytes: Buffer.byteLength(text, 'utf8'),
    format,
    created: !existed,
    overwrote: existed,
  };
}

/**
 * Read a DRAFT back — a song under the write folder, by a path a caller holds.
 *
 * The reader for the other half of the library, and deliberately narrower than
 * `readSong`: a draft is writable, so it is the one file this API is allowed to
 * change, and it is only ever read to be changed. Either spelling of the path is
 * accepted — the repository-relative one `library.list` reports
 * (`storage/songs/agent/my-tune.txt`) or the short one `library.write` takes
 * (`my-tune.txt`) — because an agent will have one or the other in hand and being
 * made to convert between them is a trap, not a rule.
 *
 * The format comes back with the text, picked by the extension exactly as
 * `writeSong` picks it, so an update rewrites a `.json` as `.json` and a `.txt` as
 * `.txt` rather than silently converting a draft on first edit.
 */
export function readDraft(
  path: string,
  root: string = repositoryRoot(),
): { path: string; relative: string; format: 'script' | 'json'; text: string } {
  const folder = newSongFolder(root);
  const inner = draftRelativePath(path);
  const full = containedPath(folder, inner);
  if (!existsSync(full) || !statSync(full).isFile()) {
    refuse('not_found', `there is no draft at "${path}".`, [
      `a draft is a file under ${NEW_SONG_FOLDER}; list them with library.list.`,
    ]);
  }
  const extension = extname(full).toLowerCase();
  if (extension !== SCRIPT_FILE_EXTENSION && extension !== SONG_FILE_EXTENSION) {
    refuse('invalid_input', `"${path}" is not a song file; a draft is ${SCRIPT_FILE_EXTENSION} or ${SONG_FILE_EXTENSION}.`);
  }
  return {
    path: relative(root, full).split(sep).join('/'),
    relative: inner.split(sep).join('/'),
    format: extension === SONG_FILE_EXTENSION ? 'json' : 'script',
    text: readFileSync(full, 'utf8'),
  };
}

/**
 * A draft path, short — the write folder's name stripped off when it is there.
 *
 * `library.write` and `library.read` name the same file differently: the writer
 * takes a path INSIDE `${NEW_SONG_FOLDER}` and the reader reports one relative to
 * the repository. Normalizing here means both are accepted everywhere a draft is
 * named, and neither spelling can reach outside the folder — `containedPath` still
 * has the last word.
 */
export function draftRelativePath(path: string): string {
  const cleaned = path.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const prefix = `${NEW_SONG_FOLDER}/`;
  return cleaned.startsWith(prefix) ? cleaned.slice(prefix.length) : cleaned;
}

/** The song a library entry holds, for an operation that wants the object itself. */
export function songAt(path: string): Song {
  const { text } = readSong(path);
  const result = applyScript(createSong(), text);
  if (!result.ok) {
    refuse(
      'script_refused',
      `"${path}" did not parse.`,
      result.errors.slice(0, 12).map((error) => `line ${error.line}: ${error.message}`),
    );
  }
  return result.song;
}

/** The key of a song, spelled the way the app spells it, for a library row. */
export function songKey(song: Song): string {
  return keyName(song.key);
}
