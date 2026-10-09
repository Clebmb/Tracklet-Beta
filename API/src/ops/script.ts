/**
 * ops/script — the operations that read and write Tracklet Script.
 *
 * This is the heart of the API, because Tracklet Script is the app's own
 * interface to a song: the whole language, atomic, deterministic and
 * parse-before-apply. An agent that can only call four operations can still write
 * music, and these are the four:
 *
 *   • `script.validate` — parse it and say what is wrong, changing nothing. The
 *     safe call. A model should make it before every apply.
 *   • `script.apply` — parse, then apply to a COPY, and hand back the song. One
 *     mistake means no song at all, never half of one.
 *   • `script.format` — the inverse: a song back out as the script that
 *     reproduces it exactly. The fastest way for an agent to learn a feature is
 *     to read the notation this prints.
 *   • `script.parse_file` — read a `.txt` script OR a `.json` song from a string,
 *     telling you which one it was.
 *
 * `script.apply` takes an optional `song` to build on; without one it starts from
 * a blank song, which is what a from-scratch generation wants. With one, the
 * script edits that song — the same "describe the whole thing again" rule the app
 * follows, where the script is still the whole result.
 */

import {
  applyScript,
  createSong,
  parseSongFile,
  songToScript,
  type ScriptSettings,
} from '../../../src/model';
import { maybeNumber, text } from '../input';
import { refuse, ok } from '../result';
import { field, schema, type ApiOperation } from '../operation';
import { songFromInput, describeSong } from '../songAccess';

function diagnosticsOf(errors: readonly { line: number; message: string }[]): string[] {
  return errors.map((error) => `line ${error.line}: ${error.message}`);
}

export const scriptOperations: ApiOperation[] = [
  {
    name: 'script.validate',
    title: 'Check a script without applying it',
    summary: 'Parse a script and report every problem at once; on success, return the summary of the song it WOULD make. Changes nothing.',
    category: 'script',
    example: { script: 'new\nsong "IDEA"\nkey A minor\ntempo 120\ntracks 3\ntrack 1 "LEAD" voice lead\npattern 1 "A"\nA-4 .\n' },
    input: schema({ script: field('string', 'The whole Tracklet Script to check.') }, ['script']),
    run: (input) => {
      const source = text(input, 'script');
      const result = applyScript(createSong(), source);
      if (!result.ok) {
        return ok({ valid: false, diagnostics: diagnosticsOf(result.errors) });
      }
      return ok({ valid: true, diagnostics: [], summary: result.summary, advisories: result.summary.advisories });
    },
  },
  {
    name: 'script.apply',
    title: 'Apply a script to a song',
    summary: 'Parse and apply a whole script, all-or-nothing, to a blank song or to one you pass in. Returns the new song, its summary, and the session settings it asked for.',
    category: 'script',
    example: { script: 'new\nsong "IDEA"\nkey A minor\ntempo 120\ntracks 3\ntrack 1 "LEAD" voice lead\npattern 1 "A"\nA-4 .\n' },
    input: schema({
      script: field('string', 'The whole Tracklet Script to apply.'),
      song: field('object', 'The song to build on. Omit to start from a blank song.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
    }, ['script']),
    run: (input) => {
      const source = text(input, 'script');
      const base = songFromInput(input) ?? createSong();
      const result = applyScript(base, source);
      if (!result.ok) {
        refuse('script_refused', 'the script was refused; nothing was changed.', diagnosticsOf(result.errors));
      }
      return ok({
        song: result.song,
        summary: result.summary,
        settings: result.settings,
        advisories: result.summary.advisories,
        description: describeSong(result.song),
      });
    },
  },
  {
    name: 'script.format',
    title: 'Write a song back out as a script',
    summary: 'The inverse of apply: a Tracklet Script that reproduces the song exactly, the way SAVE AS SCRIPT prints it.',
    category: 'script',
    example: {},
    input: schema({
      song: field('object', 'The song to print. Omit to print a blank song.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
      volume: field('number', 'The master level to write, 0-100. Omit to leave it out of the script.'),
    }),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const volume = maybeNumber(input, 'volume');
      const settings: ScriptSettings = { volume };
      return ok({ script: songToScript(song, settings) });
    },
  },
  {
    name: 'script.parse_file',
    title: 'Read a script or a song file from text',
    summary: 'Parse the text of either kind of song file, .txt or .json, and say which it was — the same reader the app uses when you open a file.',
    category: 'script',
    example: { text: 'new\nsong "IDEA"\ntracks 3\ntrack 1 "LEAD" voice lead\npattern 1 "A"\nA-4 .\n' },
    input: schema({ text: field('string', 'The text of a Tracklet .txt script or .json song file.') }, ['text']),
    run: (input) => {
      const source = text(input, 'text');
      const parsed = parseSongFile(source);
      if (!parsed.ok) {
        return ok({ valid: false, diagnostics: parsed.errors.slice(0, 12) });
      }
      return ok({
        valid: true,
        kind: parsed.kind,
        song: parsed.song,
        settings: parsed.settings,
        description: describeSong(parsed.song),
      });
    },
  },
];
