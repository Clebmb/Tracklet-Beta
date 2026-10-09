import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  GENRE_IDS,
  GENRE_WORD,
  GENRES,
  genreFromName,
  genreLabel,
  genreNames,
  isGenreName,
  parseScript,
  parseSongFile,
  progressionHold,
  progressionStepLabel,
  SCRIPT_KEYWORDS,
  SCRIPT_QUICK_REFERENCE,
  SONG_FILE_VERSION_MAX,
  songToJson,
  songToScript,
  type Song,
} from '../model';
import { SCRIPT_COMMANDS, SCRIPT_VERSION, scriptCapabilities } from '../model/capabilities';

/**
 * THE GENRE STARTERS — a whole song to begin from, as data.
 *
 * The feature's whole promise is that `start house` is a WORKING song rather
 * than a preset: real notes on the default grid, one undo step, editable like
 * anything else, and left with the loop in it so the next bar can be written
 * rather than retyped. That promise is only worth anything if the three
 * skeletons are still valid scripts, still audible, and still say what they
 * claim — so this file applies every one of them, reads the song it made, and
 * checks that beginning from a genre is a beginning rather than a merge.
 *
 * It is also the guard on the SPLICE: `start house` is the starter's own lines,
 * read on in the same parse state (see `parseScript`). The test that matters is
 * the fourth one here — a script that names a channel the starter made, writes a
 * grid row as wide as the starter's song, and arranges a pattern the starter
 * never mentioned only parses because the lines BELOW a `start` are checked
 * against the shape it just wrote.
 */

/** The song a script made, insisting it parsed. */
function applied(source: string, song: Song = createSong()): Song {
  const result = applyScript(song, source);
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join(' | '));
  return result.song;
}

/** The errors a script produced, or an empty list when it parsed. */
function errorsOf(source: string, song: Song = createSong()): string[] {
  const result = applyScript(song, source);
  return result.ok ? [] : result.errors.map((error) => error.message);
}

/** The song a bare `start NAME` makes. */
function started(id: string): Song {
  return applied(`${GENRE_WORD} ${id}`);
}

/** Every starter's script, as lines, with comments and blank lines kept out. */
function statementsOf(script: string): string[] {
  return script
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)#.*$/, '').trim())
    .filter((line) => line !== '');
}

describe('the starters, as data', () => {
  it('names each one once, as a single lower-case word', () => {
    const ids = GENRES.map((genre) => genre.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
    for (const genre of GENRES) {
      expect(genre.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(genre.label).toBe(genre.id.toUpperCase());
      expect(genre.blurb.length).toBeGreaterThan(40);
      expect(genre.blurb.length).toBeLessThanOrEqual(240);
    }
    expect(GENRE_IDS).toEqual(ids);
    expect(genreNames()).toBe(ids.join(', '));
  });

  it('is found by name, case-insensitively, and known by the parser', () => {
    for (const genre of GENRES) {
      expect(genreFromName(genre.id)?.id).toBe(genre.id);
      expect(genreFromName(genre.id.toUpperCase())?.id).toBe(genre.id);
      expect(isGenreName(` ${genre.id} `)).toBe(true);
      expect(genreLabel(genre.id)).toBe(genre.label);
    }
    expect(genreFromName('techno')).toBeNull();
    expect(isGenreName('techno')).toBe(false);
    expect(genreLabel('techno')).toBe('TECHNO');
  });

  it('begins every script with `new`, so a starter replaces rather than merges', () => {
    for (const genre of GENRES) {
      expect(statementsOf(genre.script)[0]).toBe('new');
    }
  });

  it('applies every starter to a blank song, with notes in it', () => {
    for (const genre of GENRES) {
      const result = applyScript(createSong(), genre.script);
      expect(result.ok, `${genre.id}: ${result.ok ? '' : result.errors.map((e) => e.message).join(' | ')}`).toBe(true);
      if (!result.ok) continue;
      const { summary } = result;
      expect(summary.notes, genre.id).toBeGreaterThan(0);
      expect(summary.tracks, genre.id).toBeGreaterThanOrEqual(4);
      expect(summary.steps, genre.id).toBeGreaterThanOrEqual(16);
    }
  });

  it('leaves a song that has a form, a loop and a set of channels', () => {
    for (const genre of GENRES) {
      const song = started(genre.id);
      // The three things every starter promises: named channels with sounds,
      // a form the bars are played in, and a chord loop to keep working from.
      expect(song.tracks.length, genre.id).toBeGreaterThanOrEqual(4);
      expect(song.tracks.every((track) => track.name !== ''), genre.id).toBe(true);
      expect(song.sections.length, genre.id).toBeGreaterThanOrEqual(3);
      expect(song.arrangement.length, genre.id).toBeGreaterThanOrEqual(6);
      expect(song.progression, genre.id).not.toBeNull();
      expect(song.patterns.length, genre.id).toBeGreaterThanOrEqual(2);
      // ...and it is not a fresh song with knobs on it.
      expect(song.title, genre.id).toBe(genre.label);
    }
  });

  it('differs from the others: every genre, a different record', () => {
    const tempos = GENRES.map((genre) => started(genre.id).bpm);
    expect(new Set(tempos).size).toBe(GENRES.length);
    const kits = GENRES.map((genre) => started(genre.id).kit);
    expect(new Set(kits).size).toBeGreaterThan(1);
    const loops = GENRES.map((genre) => {
      const loop = started(genre.id).progression;
      return loop === null ? '' : `${loop.steps.map(progressionStepLabel).join(' ')} hold ${progressionHold(loop)}`;
    });
    expect(new Set(loops).size).toBe(GENRES.length);
  });

  it('differs by FEEL and by SOUND as well as by tempo', () => {
    // A shelf of nine tempos would pass everything above and still be nine
    // versions of one record: the things that make a genre a genre are how the
    // bar is PLAYED and what is PLAYING it. Both are facts about the song, so
    // both are checkable — a feel is the song's own `groove`, and a sound is
    // the set of voices its channels are on.
    const feels = GENRES.map((genre) => started(genre.id).groove);
    expect(new Set(feels).size).toBeGreaterThanOrEqual(3);
    const sounds = GENRES.map((genre) => {
      const song = started(genre.id);
      return song.tracks.map((track) => track.voice.wave).join(' ');
    });
    expect(new Set(sounds).size).toBeGreaterThanOrEqual(3);
  });

  it('is the same song every time, so a starter is not a roll of the dice', () => {
    for (const genre of GENRES) {
      expect(songToJson(started(genre.id))).toBe(songToJson(started(genre.id)));
    }
  });
});

describe('starting from one', () => {
  it('discards what was on screen, the way `new` does', () => {
    const old = applied('song "OLD"\ntracks 2\nC-4\nC-5\nC-4\nC-5\n');
    const fresh = applied(`${GENRE_WORD} house`, old);
    expect(fresh.title).toBe('HOUSE');
    expect(songToJson(fresh)).toBe(songToJson(started('house')));
  });

  it('lets the lines BELOW it be read against the shape it made', () => {
    // The tail names channel 6 and writes a six-column row, neither of which a
    // blank song has room for — and arranges a section the starter never
    // mentioned, which only works because the starter defined one it can use.
    const tail = [
      'track 6 "EXTRA" voice pluck',
      'pattern 4 "TAIL"',
      'kick . . A-2 . C-6',
      'section TAIL 4',
      'arrange GROOVE TAIL GROOVE',
    ].join('\n');
    const song = applied(`${GENRE_WORD} house\n${tail}`);
    expect(song.patterns[3].name).toBe('TAIL');
    expect(song.patterns[3].steps[0][5].note).toBe(84);
    expect(song.arrangement.map((name) => name)).toContain('TAIL');
    // The same tail on a blank song is refused, which is what makes the above a
    // statement about the SEEDING rather than about the tail being harmless.
    const errors = errorsOf(tail);
    expect(errors.join(' ')).toContain('track number must be 1..4');
    expect(errors.join(' ')).toContain('this grid row has 6 notes but the song has 4 tracks');
  });

  it('can be overridden by the lines after it, like any other statement', () => {
    const song = applied(`${GENRE_WORD} house\ntempo 90\ntrack 1 level 40`);
    expect(song.bpm).toBe(90);
    expect(song.tracks[0].level).toBe(40);
  });

  it('is refused when it has no name, too many, or one nobody knows', () => {
    expect(errorsOf(GENRE_WORD)[0]).toContain(`e.g. ${GENRE_WORD} house`);
    expect(errorsOf(`${GENRE_WORD} house extra`)[0]).toContain(`e.g. ${GENRE_WORD} house`);
    expect(errorsOf(`${GENRE_WORD} techno`)[0]).toContain('is not a starter');
    expect(errorsOf(`${GENRE_WORD} techno`)[0]).toContain(genreNames());
  });

  it('names the starters it does have in the refusal', () => {
    // A word no starter claims — the shelf grows, so the example has to be one
    // the shelf will never want (`techno` is a genre this app does not ship).
    const message = errorsOf(`${GENRE_WORD} techno`)[0];
    for (const id of GENRE_IDS) expect(message).toContain(id);
  });

  it('reports the lines a starter brought with it as the `start` line', () => {
    // The line numbers are the language's promise, and a starter's lines are not
    // in the author's file: there is no other line they could be reported
    // against, so they belong to the one that asked for them — and the author's
    // OWN lines below keep their own numbers, which is what makes a mistake in a
    // script that begins with `start house` still findable.
    const context = { trackCount: 4, rows: 16, rowsPerBeat: 4 };
    const parsed = parseScript(`${GENRE_WORD} house`, context);
    expect(parsed.errors).toEqual([]);
    expect(parsed.commands.length).toBeGreaterThan(10);
    expect(parsed.commands.every((command) => command.line === 1)).toBe(true);
    const withTail = parseScript(`${GENRE_WORD} house\ntempo 90`, context);
    expect(withTail.commands[withTail.commands.length - 1]).toMatchObject({ kind: 'tempo', line: 2, bpm: 90 });
    expect(withTail.commands.slice(0, -1).every((command) => command.line === 1)).toBe(true);
  });
});

describe('a starter in the rest of the app', () => {
  it('brings no file format with it: the song saves as its own features need', () => {
    for (const genre of GENRES) {
      const json = JSON.parse(songToJson(started(genre.id))) as Record<string, unknown>;
      expect(json.version, genre.id).toBeLessThanOrEqual(SONG_FILE_VERSION_MAX);
      expect(Object.keys(json)).not.toContain('start');
      expect(Object.keys(json)).not.toContain('genre');
      expect(json.format).toBe('tracklet-song');
    }
  });

  it('reads back exactly what it printed, so a started song can be saved and opened', () => {
    for (const genre of GENRES) {
      const song = started(genre.id);
      const printed = songToScript(song);
      const back = parseSongFile(printed);
      expect(back.ok, `${genre.id}: ${back.ok ? '' : back.errors.join(' | ')}`).toBe(true);
      if (!back.ok) continue;
      expect(songToJson(back.song), genre.id).toBe(songToJson(song));
      expect(song.progression, genre.id).not.toBeNull();
    }
  });

  it('prints the whole skeleton back out, which is how a starter teaches', () => {
    const printed = songToScript(started('house'));
    const lines = printed.split('\n');
    for (const word of ['new', 'song', 'key', 'tempo', 'kit', 'tracks', 'progression', 'section', 'arrange', 'pattern']) {
      expect(lines.some((line) => line === word || line.startsWith(`${word} `)), word).toBe(true);
    }
  });
});

describe('the starter manifest', () => {
  it('is a word the language knows, with its own version', () => {
    expect(SCRIPT_KEYWORDS).toContain(GENRE_WORD);
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(18);
    const { versionNotes, vocabulary, scriptVersion } = scriptCapabilities();
    expect(scriptVersion).toBe(SCRIPT_VERSION);
    expect(versionNotes.some((entry) => entry.version === 18)).toBe(true);
    expect(vocabulary.genres.map((genre) => genre.id)).toEqual([...GENRE_IDS]);
    expect(vocabulary.genres.every((genre) => genre.blurb.length > 0)).toBe(true);
  });

  it('has a command row, in the parser\u2019s own order, with a working example', () => {
    expect(SCRIPT_COMMANDS.map((command) => command.word)).toEqual([...SCRIPT_KEYWORDS]);
    const row = SCRIPT_COMMANDS.find((command) => command.word === GENRE_WORD);
    expect(row).toBeDefined();
    expect(row?.example).toBe(`${GENRE_WORD} ${GENRE_IDS[0]}`);
    expect(applied(row?.example ?? '').title).toBe(GENRES[0].label);
  });

  it('is on the cheat sheet beside the paste box', () => {
    expect(SCRIPT_QUICK_REFERENCE.join(' / ')).toContain(GENRE_WORD);
  });
});
