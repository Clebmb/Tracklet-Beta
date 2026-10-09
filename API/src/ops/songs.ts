/**
 * ops/song — making a song, and looking at the one you have.
 *
 * There are two ways to get music into this API, and they are complementary
 * rather than redundant. You can write a SCRIPT (`script.apply`), which is the
 * language and the whole point; or you can call `song.create` for a correctly
 * sized, correctly keyed blank song and then build on it. The second is here
 * because a model that has been asked for "a 32-step loop in F# minor with six
 * channels" should not have to spell a header by hand to get one, and because a
 * blank song with a title and a tempo is exactly what `script.format` prints.
 *
 * The READ side matters just as much. An agent cannot hear, so the only honest
 * way for it to check its own work is to be told what it made: `song.describe`
 * and `song.analyze` are that, and `song.grid` renders one pattern as the text a
 * tracker would show — the closest thing to looking at the screen.
 */

import {
  applyScript,
  createSong,
  parseKey,
  patternRows,
  songFromJson,
  songToJson,
  summarizeSong,
  type Song,
} from '../../../src/model';
import { maybeNumber, maybeStr, text } from '../input';
import { refuse, ok } from '../result';
import { field, schema, type ApiOperation } from '../operation';
import { carryingTracks, describeSong, gridText, songFromInput } from '../songAccess';

/** Quote and shrink a title so it can sit on a `song` line without breaking it. */
function scriptTitle(title: string): string {
  return title.replace(/"/g, "'").slice(0, 32);
}

export const songOperations: ApiOperation[] = [
  {
    name: 'song.create',
    title: 'Create a blank song',
    summary: 'A correctly sized, correctly keyed empty song — the header of a script, applied for you — returned as a song and as the script that makes it.',
    category: 'song',
    example: { title: 'NEW TUNE', key: 'A minor', tempo: 124, tracks: 6, steps: 16, beat: 4 },
    input: schema({
      title: field('string', 'The song title, at most 32 characters.'),
      key: field('string', 'The key and scale, e.g. "D minor" or "A pentatonic".'),
      tempo: field('number', 'Beats per minute, 40-300.'),
      tracks: field('number', 'How many channels, 1-8.'),
      steps: field('number', 'How many steps each pattern holds, 1-512.'),
      beat: field('number', 'How many steps are one beat, 1-16.'),
    }),
    run: (input) => {
      const title = maybeStr(input, 'title');
      const key = maybeStr(input, 'key');
      const tempo = maybeNumber(input, 'tempo');
      const tracks = maybeNumber(input, 'tracks');
      const steps = maybeNumber(input, 'steps');
      const beat = maybeNumber(input, 'beat');

      // The header is BUILD THIS WAY on purpose: a header written as a script and
      // applied by the parser is a header that cannot disagree with the parser
      // about what a legal key or a legal tempo is. There is no second definition
      // of "A minor" here to drift away from the language.
      const lines = ['new'];
      if (title) lines.push(`song "${scriptTitle(title)}"`);
      if (key) {
        if (!parseKey(key)) refuse('invalid_input', `"${key}" is not a key this language spells.`, [
          'write a tonic and a scale, e.g. "D minor", "F# dorian" or "A pentatonic".',
        ]);
        lines.push(`key ${key}`);
      }
      if (tempo !== null) lines.push(`tempo ${Math.round(tempo)}`);
      if (steps !== null) lines.push(`steps ${Math.round(steps)}`);
      if (beat !== null) lines.push(`beat ${Math.round(beat)}`);
      if (tracks !== null) lines.push(`tracks ${Math.round(tracks)}`);
      const script = `${lines.join('\n')}\n`;

      const result = applyScript(createSong(), script);
      if (!result.ok) {
        refuse('script_refused', 'that header is not a legal song.', result.errors.map((e) => `line ${e.line}: ${e.message}`));
      }
      return ok({ song: result.song, script, summary: result.summary, description: describeSong(result.song) });
    },
  },
  {
    name: 'song.describe',
    title: 'Describe a song',
    summary: 'Title, key, tempo and form, then one row per channel and one line per pattern. The answer to "what is in here".',
    category: 'song',
    example: {},
    input: schema({
      song: field('object', 'The song to describe. Omit to describe a blank song.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
    }),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      return ok(describeSong(song));
    },
  },
  {
    name: 'song.analyze',
    title: 'Analyze a song',
    summary: 'Like describe, plus the parser\'s own advisories and which channels actually carry something — the checks a model cannot make by listening.',
    category: 'song',
    example: {},
    input: schema({
      song: field('object', 'The song to analyze. Omit to analyze a blank song.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
    }),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const summary = summarizeSong(song);
      return ok({
        description: describeSong(song),
        advisories: summary.advisories,
        carryingTracks: carryingTracks(song),
        steps: patternRows(song),
      });
    },
  },
  {
    name: 'song.grid',
    title: 'Print one pattern as a grid',
    summary: 'A pattern as text: one line per step, one token per channel, empty steps as ".". The closest an agent gets to looking at the screen.',
    category: 'song',
    example: { pattern: 1 },
    input: schema({
      song: field('object', 'The song to print from. Omit to print from a blank song.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
      pattern: field('number', 'The pattern number, 1-based, as the app numbers them.'),
    }, ['pattern']),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const pattern = maybeNumber(input, 'pattern');
      if (pattern === null) refuse('invalid_input', '"pattern" is required and must be a number.');
      const number = Math.round(pattern);
      return ok({ pattern: number, text: gridText(song, number) });
    },
  },
  {
    name: 'song.to_json',
    title: 'Write a song as a song file',
    summary: 'The .json a saved song is: everything the song holds, versioned, readable by the app and by script.parse_file.',
    category: 'song',
    example: {},
    input: schema({
      song: field('object', 'The song to write. Omit to write a blank song.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
      volume: field('number', 'The master level to write, 0-100. Omit to leave it out of the file.'),
    }),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const volume = maybeNumber(input, 'volume');
      return ok({ json: songToJson(song, { volume }) });
    },
  },
  {
    name: 'song.from_json',
    title: 'Read a song file',
    summary: 'Parse the text of a .json song file back into a song, refusing with the reader\'s own reasons when it does not fit.',
    category: 'song',
    example: {},
    input: schema({ json: field('string', 'The text of a .json song file.') }, ['json']),
    run: (input) => {
      const source = text(input, 'json');
      const parsed = songFromJson(source);
      if (!parsed.ok) {
        refuse('file_refused', 'that is not a Tracklet song file.', parsed.errors.slice(0, 12));
      }
      return ok({ song: parsed.song as Song, description: describeSong(parsed.song) });
    },
  },
];
