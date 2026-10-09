/**
 * ops/library — the songs on this machine, and where a new one goes.
 *
 * Two folders in this repository are full of music: `scripts/` (songs written as
 * Tracklet Script by a person or a model) and `storage/songs/` (the author's own
 * work). They are the best examples the language has — they are real songs, not
 * snippets — and an agent that can read them has a vocabulary of working
 * notation to imitate.
 *
 * `library.list` is also the API's health check: it applies every file to a
 * fresh song, so a single call reports whether this checkout's songs still parse.
 *
 * `library.write` is the other direction, and it is deliberately narrow: a new
 * song is written into ONE folder (`storage/songs/agent`), the extension picks the
 * format, and an existing file is never replaced unless the caller says so. Read
 * wide, write narrow — the library is the whole repository's music, and this
 * operation is a draft pad beside it rather than a way to edit somebody's work.
 *
 * `library.update` is the third step, and the one that makes the pad usable: a
 * draft that has already been saved can be edited IN PLACE, sending only the
 * changes. Without it, a person reviewing a draft with an agent would have to ship
 * the whole song back to change one level — the same all-or-nothing problem
 * `song.edit` was written to fix, one file further out. It reuses that operation's
 * edit vocabulary verbatim (see `../edits`) and stays inside the same one folder.
 */

import {
  SCRIPT_FILE_EXTENSION,
  SONG_FILE_EXTENSION,
  applyScript,
  createSong,
  parseSongFile,
  summarizeSong,
  type Song,
} from '../../../src/model';
import { maybeBool, maybeNumber, maybeObject, maybeStr, str } from '../input';
import { refuse, ok } from '../result';
import { field, schema, type ApiOperation } from '../operation';
import { describeSong, songFromInput } from '../songAccess';
import { EDIT_OPS, applyEdits, editList } from '../edits';
import { NEW_SONG_FOLDER, listSongs, readDraft, readSong, songRoots, writeSong } from '../library';

export const libraryOperations: ApiOperation[] = [
  {
    name: 'library.list',
    title: 'List the example songs',
    summary: 'Every Tracklet Script under scripts/ and storage/songs/, each applied to a fresh song: title, key, tempo, size, and whether it parses.',
    category: 'library',
    example: {},
    input: schema({
      query: field('string', 'Only files whose path contains this text, case-insensitively.'),
      limit: field('number', 'Stop after this many entries.'),
    }),
    run: (input) => {
      const query = maybeStr(input, 'query') ?? undefined;
      const limit = maybeNumber(input, 'limit') ?? undefined;
      const entries = listSongs({ query, limit });
      const okCount = entries.filter((entry) => entry.ok).length;
      return ok({ count: entries.length, parsed: okCount, failed: entries.length - okCount, entries });
    },
  },
  {
    name: 'library.read',
    title: 'Read a song script',
    summary: 'The raw text of one example song, by its path relative to the repository.',
    category: 'library',
    example: { path: 'scripts/deepseek/01-twelve-bar-midnight.txt' },
    input: schema({ path: field('string', 'A path under scripts/ or storage/songs/.') }, ['path']),
    run: (input) => {
      const path = str(input, 'path');
      const file = readSong(path);
      return ok(file);
    },
  },
  {
    name: 'library.open',
    title: 'Open an example song',
    summary: 'Read a song file, apply it to a fresh song, and return the song plus its summary — the same result script.apply gives, from a path.',
    category: 'library',
    example: { path: 'scripts/deepseek/06-sunrise-set.txt' },
    input: schema({ path: field('string', 'A path under scripts/ or storage/songs/.') }, ['path']),
    run: (input) => {
      const path = str(input, 'path');
      const file = readSong(path);
      const result = applyScript(createSong(), file.text);
      if (!result.ok) {
        refuse('script_refused', `"${path}" did not parse.`, result.errors.map((e) => `line ${e.line}: ${e.message}`));
      }
      return ok({
        path: file.path,
        script: file.text,
        song: result.song,
        summary: result.summary,
        description: describeSong(result.song),
      });
    },
  },
  {
    name: 'library.folders',
    title: 'Where songs are read and written',
    summary: `The folders this API reads songs from, and the one it writes into (${NEW_SONG_FOLDER}), with the rules a writer has to follow — worth asking before saving your first song.`,
    category: 'library',
    example: {},
    input: schema({}),
    run: () =>
      ok({
        readFolders: ['scripts', 'storage/songs'],
        writeFolder: NEW_SONG_FOLDER,
        reading: songRoots().length,
        extensions: { script: SCRIPT_FILE_EXTENSION, song: SONG_FILE_EXTENSION },
        rules: [
          `a new song goes into ${NEW_SONG_FOLDER} — not into scripts/, where every song is a finished example the test suite holds to a minimum size.`,
          `the extension picks the format: ${SONG_FILE_EXTENSION} keeps every setting, ${SCRIPT_FILE_EXTENSION} is the readable one.`,
          'an existing file is never replaced unless the call passes "overwrite": true.',
          'a path may not leave that folder: "../.." and absolute paths are refused.',
        ],
      }),
  },
  {
    name: 'library.write',
    title: 'Write a song into the library',
    summary: `Save a song as a ${SCRIPT_FILE_EXTENSION} script or a ${SONG_FILE_EXTENSION} file under ${NEW_SONG_FOLDER}, where the app can open it. Refuses to leave that folder, and refuses to overwrite unless told.`,
    category: 'library',
    example: {},
    input: schema({
      song: field('object', 'The song to write.'),
      songJson: field('string', 'The same, as the text of a song file.'),
      script: field('string', 'The same, as Tracklet Script. It is parsed first, and refused with its line numbers if it does not parse.'),
      path: field('string', `Where to put it, inside ${NEW_SONG_FOLDER}. Default: the song's title, slugged.`),
      overwrite: field('boolean', 'Replace a file that is already there. Off by default, so a draft cannot land on top of something.'),
    }),
    run: (input) => {
      const script = maybeStr(input, 'script');
      const given = [script !== null, maybeObject(input, 'song') !== null, maybeStr(input, 'songJson') !== null].filter(Boolean).length;
      if (given === 0) refuse('invalid_input', 'give the song as "song", "songJson" or "script".');
      if (given > 1) refuse('invalid_input', 'give the song as ONE of "song", "songJson" or "script", not several.');

      let song: Song;
      if (script !== null) {
        const applied = applyScript(createSong(), script);
        if (!applied.ok) {
          refuse('script_refused', 'the script was refused, so nothing was written.', applied.errors.map((e) => `line ${e.line}: ${e.message}`));
        }
        song = applied.song;
      } else {
        const fromInput = songFromInput(input);
        if (!fromInput) refuse('invalid_input', 'that is not a song this build can read.');
        song = fromInput;
      }

      const path = maybeStr(input, 'path');
      const overwrite = maybeBool(input, 'overwrite');
      const written = writeSong({
        song,
        ...(path === null ? {} : { path }),
        ...(overwrite === null ? {} : { overwrite }),
      });
      return ok({
        ...written,
        title: song.title,
        summary: summarizeSong(song),
        next: written.created
          ? 'open it in the app: F2, then OPEN, then pick this file.'
          : 'the file that was already there has been replaced.',
      });
    },
  },
  {
    name: 'library.update',
    title: 'Edit a saved draft in place',
    summary: `Change a song that is already saved under ${NEW_SONG_FOLDER}, sending only the edits — the same list song.edit takes — and get back what moved. The file keeps its format and is never silently rewritten as a whole.`,
    category: 'library',
    example: {
      path: 'my-tune.txt',
      edits: [{ op: 'track.set', track: 2, level: 70 }],
    },
    input: schema(
      {
        path: field(
          'string',
          `The draft, under ${NEW_SONG_FOLDER}. Both the short name library.write takes and the full path library.list reports are accepted.`,
        ),
        edits: field('array', `The changes, in order — the same ${EDIT_OPS.join(', ')} that song.edit takes.`),
      },
      ['path', 'edits'],
    ),
    run: (input) => {
      const path = str(input, 'path');
      // Read the edits and the file BEFORE touching anything: a bad edit list
      // should refuse without a file having been opened, and a missing draft
      // should refuse without a single change having been made in memory.
      const edits = editList(input);
      const draft = readDraft(path);
      const parsed = parseSongFile(draft.text);
      if (!parsed.ok) {
        refuse('file_refused', `"${draft.path}" is saved but no longer parses, so nothing was changed.`, parsed.errors.slice(0, 12));
      }

      const song = parsed.song as Song;
      const changes = applyEdits(song, edits);
      const written = writeSong({ song, path: draft.relative, overwrite: true });
      return ok({
        ...written,
        edits: changes,
        changed: changes.filter((change) => change.changed).length,
        title: song.title,
        summary: summarizeSong(song),
        next: 'open it in the app: F2, then OPEN, then pick this file.',
      });
    },
  },
];
