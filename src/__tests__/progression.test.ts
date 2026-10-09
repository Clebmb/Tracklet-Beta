import { describe, expect, it } from 'vitest';

import {
  applyScript,
  CHORD_SONG_FILE_VERSION,
  createSong,
  DEFAULT_PROGRESSION_HOLD,
  DRUM_SONG_FILE_VERSION,
  MAX_PROGRESSION_HOLD,
  MAX_PROGRESSION_STEPS,
  PROGRESSION_NONE_WORD,
  PROGRESSION_SONG_FILE_VERSION,
  progressionHold,
  progressionScript,
  progressionStartRows,
  progressionStartsAt,
  progressionStepAt,
  progressionStepLabel,
  progressionStepNotes,
  progressionStepRoot,
  progressionStepSize,
  SCRIPT_KEYWORDS,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  songFromJson,
  songToJson,
  songToScript,
  withProgressionSteps,
  type Progression,
  type ProgressionStep,
  type Song,
} from '../model';
import { SCRIPT_COMMANDS, SCRIPT_VERSION, scriptCapabilities } from '../model/capabilities';

/**
 * THE PROGRESSION — the chord loop the song hangs on.
 *
 * A progression is the first thing in this app that is harmony WITHOUT being
 * notes: it is a decision (`Am F C G`) that the cells were written from, and the
 * two followers in the language are what turn it back into notes. This file holds
 * the four things that make that safe — the loop's own arithmetic (where each
 * chord falls, and which notes it is), the two spellings (a chord name and a scale
 * degree, resolved in the song's key), the two followers through a real script,
 * and the file's version and round trip.
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

/** A song whose first channel is wide, so a chord can live in one cell. */
function wide(source: string, song: Song = createSong()): Song {
  return applied(`tracks 2\ntrack 1 poly 4\n${source}`, song);
}

/** The loop as a plain list of labels, for asserting about the whole thing. */
function labelsOf(progression: Progression | null): string {
  return progression === null ? 'none' : progression.steps.map(progressionStepLabel).join(' ');
}

describe('the loop, as an object', () => {
  it('holds the chords in order and one length for how long each lasts', () => {
    const loop = withProgressionSteps([{ kind: 'degree', degree: 1 }], 8);
    expect(loop.steps).toHaveLength(1);
    expect(loop.hold).toBe(8);
    expect(progressionHold(loop)).toBe(8);
  });

  it('clamps the length rather than trusting it, and defaults to one beat', () => {
    expect(DEFAULT_PROGRESSION_HOLD).toBe(4);
    expect(progressionHold(withProgressionSteps([{ kind: 'degree', degree: 1 }], 999))).toBe(MAX_PROGRESSION_HOLD);
    expect(progressionHold(withProgressionSteps([{ kind: 'degree', degree: 1 }], 0))).toBe(1);
    expect(progressionHold(withProgressionSteps([{ kind: 'degree', degree: 1 }], Number.NaN)))
      .toBe(DEFAULT_PROGRESSION_HOLD);
  });

  it('copies its steps, so one line cannot reach back into another', () => {
    const step: ProgressionStep = { kind: 'degree', degree: 6 };
    const loop = withProgressionSteps([step], 4);
    expect(loop.steps[0]).not.toBe(step);
    expect(loop.steps[0]).toEqual(step);
  });

  it('names each step the way it was written', () => {
    expect(progressionStepLabel({ kind: 'name', root: 9, quality: 'minor' })).toBe('Am');
    expect(progressionStepLabel({ kind: 'name', root: 6, quality: 'diminished' })).toBe('F#o');
    expect(progressionStepLabel({ kind: 'name', root: 0, quality: 'major-7' })).toBe('CM7');
    // A degree stays a numeral: which chord it becomes is the key's business.
    expect(progressionStepLabel({ kind: 'degree', degree: 6 })).toBe('6');
  });

  it('writes itself as the line a person would have typed', () => {
    const loop = applied('tracks 2\nprogression Am F C G hold 8\nprogression Am F C G\n').progression;
    expect(labelsOf(loop)).toBe('Am F C G');
    expect(progressionHold(loop!)).toBe(DEFAULT_PROGRESSION_HOLD);
    const held = applied('tracks 2\nprogression Am F C G hold 8\n').progression!;
    expect(progressionScript(held)).toBe('progression Am F C G hold 8');
    // And the default says nothing, the same way `swing 0` says nothing.
    expect(progressionScript(loop!)).toBe('progression Am F C G');
  });
});

describe('where each chord falls', () => {
  const loop = withProgressionSteps(
    [
      { kind: 'name', root: 9, quality: 'minor' },
      { kind: 'name', root: 5, quality: 'major' },
      { kind: 'name', root: 0, quality: 'major' },
      { kind: 'name', root: 7, quality: 'major' },
    ],
    4,
  );

  it('holds each chord for its own length and then moves on', () => {
    expect([0, 1, 3, 4, 7, 8, 15].map((row) => progressionStepLabel(progressionStepAt(loop, row))))
      .toEqual(['Am', 'Am', 'Am', 'F', 'F', 'C', 'G']);
  });

  it('loops, because a progression is a loop rather than a list', () => {
    expect(progressionStepLabel(progressionStepAt(loop, 16))).toBe('Am');
    expect(progressionStepLabel(progressionStepAt(loop, 21))).toBe('F');
    expect(progressionStepLabel(progressionStepAt(loop, 64))).toBe('Am');
  });

  it('knows which rows a chord STARTS on', () => {
    expect(progressionStartsAt(loop, 0)).toBe(true);
    expect(progressionStartsAt(loop, 3)).toBe(false);
    expect(progressionStartRows(loop, 16)).toEqual([0, 4, 8, 12]);
    // A follower may start anywhere: the rows are the same grid from there on.
    expect(progressionStartRows(loop, 16, 5)).toEqual([5, 9, 13]);
  });

  it('clamps a negative row rather than dividing into the negative', () => {
    expect(progressionStepLabel(progressionStepAt(loop, -3))).toBe('Am');
    expect(progressionStartRows(loop, 8, -4)).toEqual([0, 4]);
  });
});

describe('what a chord IS, in the song\\u2019s key', () => {
  it('resolves a chord name absolutely — the same notes wherever the song sits', () => {
    const inC = progressionStepNotes({ kind: 'name', root: 9, quality: 'minor' }, createSong().key, 4);
    expect(inC).toEqual([69, 72, 76]);
    const inD = applied('tracks 2\nkey D minor\n', createSong()).key;
    expect(progressionStepNotes({ kind: 'name', root: 9, quality: 'minor' }, inD, 4)).toEqual(inC);
  });

  it('resolves a scale degree in the key, which is the point of writing one', () => {
    const key = createSong().key;
    // In C major: the first chord of the key is C E G, and the sixth is A C E.
    expect(progressionStepNotes({ kind: 'degree', degree: 1 }, key, 4)).toEqual([60, 64, 67]);
    expect(progressionStepNotes({ kind: 'degree', degree: 6 }, key, 4)).toEqual([69, 72, 76]);
    // The same two numbers in A minor are another two chords, from the same line.
    const minor = applied('tracks 2\nkey A minor\n', createSong()).key;
    expect(progressionStepNotes({ kind: 'degree', degree: 1 }, minor, 4)).toEqual([69, 72, 76]);
    // Degree 6 sits above the octave's own tonic, so its chord lands up there —
    // `degreeChord`'s rule, shared with `chord 0 1 6`, which is the point of
    // reusing it rather than owning a second opinion about what a degree is.
    expect(progressionStepNotes({ kind: 'degree', degree: 6 }, minor, 4)).toEqual([77, 81, 84]);
  });

  it('sizes a step from its own name, not from a house default', () => {
    expect(progressionStepSize({ kind: 'name', root: 0, quality: 'major' })).toBe(3);
    expect(progressionStepSize({ kind: 'name', root: 0, quality: 'major-7' })).toBe(4);
    expect(progressionStepSize({ kind: 'degree', degree: 2 })).toBe(3);
  });

  it('gives the root as the chord\\u2019s lowest note, so a bass cannot drift', () => {
    const key = createSong().key;
    expect(progressionStepRoot({ kind: 'name', root: 9, quality: 'minor' }, key, 3)).toBe(57);
    expect(progressionStepRoot({ kind: 'degree', degree: 6 }, key, 3))
      .toBe(progressionStepNotes({ kind: 'degree', degree: 6 }, key, 3)[0]);
  });
});

describe('the progression statement', () => {
  it('is a word the language knows, and one command row for a tool to read', () => {
    expect(SCRIPT_KEYWORDS).toContain('progression');
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(17);
    const row = SCRIPT_COMMANDS.find((command) => command.word === 'progression');
    expect(row).toBeTruthy();
    expect(row?.example).toContain('progression ');
    expect(row?.what).toContain('hold');
  });

  it('sets the loop, and the loop travels with the song', () => {
    const song = applied('tracks 2\nprogression Am F C G\n');
    expect(labelsOf(song.progression)).toBe('Am F C G');
    expect(progressionHold(song.progression!)).toBe(DEFAULT_PROGRESSION_HOLD);
  });

  it('takes the song\\u2019s own keys for its degrees, wherever the line sits', () => {
    // `key` above the line decides the chords, which is the same order rule every
    // statement follows: a script reads top to bottom.
    const song = applied('tracks 2\nkey A minor\nprogression 1 6 3 7\n');
    expect(labelsOf(song.progression)).toBe('1 6 3 7');
    expect(progressionStepNotes(song.progression!.steps[0], song.key, 4)).toEqual([69, 72, 76]);
  });

  it('clears the loop when asked, and only when asked', () => {
    const cleared = applied('tracks 2\nprogression Am F\nprogression none\n');
    expect(cleared.progression).toBeNull();
    expect(errorsOf(`tracks 2\nprogression ${PROGRESSION_NONE_WORD} Am\n`)[0]).toContain('takes nothing else');
  });

  it('reads the hold clause at the end, and refuses a silly one', () => {
    expect(progressionHold(applied('tracks 2\nprogression Am F hold 8\n').progression!)).toBe(8);
    expect(errorsOf('tracks 2\nprogression Am F hold\n')[0]).toContain(`needs a number of steps 1..${MAX_PROGRESSION_HOLD}`);
    expect(errorsOf('tracks 2\nprogression Am F hold 400\n')[0]).toContain(`1..${MAX_PROGRESSION_HOLD}`);
    expect(errorsOf('tracks 2\nprogression Am F hold 4 8\n')[0]).toContain('once and last');
  });

  it('refuses a word that is not a chord, naming both spellings', () => {
    const message = errorsOf('tracks 2\nprogression Am H C G\n')[0];
    expect(message).toContain('"H" is not a chord');
    expect(message).toContain('scale degree 1..7');
  });

  it('tells a two-word chord to close the gap rather than teaching another one', () => {
    const message = errorsOf('tracks 2\nprogression C maj7 F G\n')[0];
    expect(message).toContain('single words');
    expect(message).toContain('write "Cmaj7"');
    // A word that is only a shape has nothing to join onto, so it gets the
    // listing rather than a spelling nobody meant.
    expect(errorsOf('tracks 2\nprogression maj7 F G\n')[0]).toContain('is not a chord');
    // And the closed-up spelling is taken, with the seventh's four notes.
    const song = applied('tracks 2\nprogression Cmaj7 F G\n');
    expect(progressionStepSize(song.progression!.steps[0])).toBe(4);
  });

  it('refuses a loop longer than the ceiling, and one with no chords at all', () => {
    const many = Array.from({ length: MAX_PROGRESSION_STEPS + 1 }, () => 'Am').join(' ');
    expect(errorsOf(`tracks 2\nprogression ${many}\n`)[0]).toContain(`at most ${MAX_PROGRESSION_STEPS}`);
    expect(errorsOf('tracks 2\nprogression\n')[0]).toContain('at least one chord');
  });
});

describe('the two followers', () => {
  it('writes the chords into one cell each, one cell per chord', () => {
    const song = wide('progression Am F C G\nchord 0 1 follow\n');
    const pattern = song.patterns[0];
    expect(pattern.steps[0][0].note).toBe(69);
    expect(pattern.steps[0][0].extra).toEqual([72, 76]);
    expect([0, 4, 8, 12].map((row) => pattern.steps[row][0].note)).toEqual([69, 65, 60, 67]);
    // Eight rows and in between are left alone: a follower writes where the
    // chords land, not the whole channel.
    expect(pattern.steps[2][0].note).toBeNull();
  });

  it('writes the roots for a bass channel, one note per chord', () => {
    const song = applied('octave 2\ntracks 2\nprogression Am F C G\nnote 0 2 follow\n');
    const pattern = song.patterns[0];
    expect([0, 4, 8, 12].map((row) => pattern.steps[row][1].note)).toEqual([45, 41, 36, 43]);
    expect(pattern.steps[0][1].extra).toEqual([]);
  });

  it('follows the loop\\u2019s own length, and then loops it', () => {
    const song = wide('steps 32\ntracks 2\ntrack 1 poly 4\nprogression Am F hold 8\nchord 0 1 follow\n');
    const pattern = song.patterns[0];
    expect(pattern.steps.length).toBe(32);
    expect([0, 8, 16, 24].map((row) => pattern.steps[row][0].note)).toEqual([69, 65, 69, 65]);
    // And a follower may start part way in, where the loop is already running.
    const late = wide('steps 32\ntracks 2\ntrack 1 poly 4\nprogression Am F hold 8\nchord 8 1 follow\n');
    expect(late.patterns[0].steps[8][0].note).toBe(65);
    expect(late.patterns[0].steps[0][0].note).toBeNull();
  });

  it('carries a SNAPSHOT: a later line cannot reach back into an earlier one', () => {
    const song = wide('progression Am F G\nchord 0 1 follow\nprogression C D E\n');
    // The follower wrote the loop the lines ABOVE it made, not the song's last
    // word on it — the same order rule every other statement follows.
    expect(song.patterns[0].steps[0][0].note).toBe(69);
    expect(labelsOf(song.progression)).toBe('C D E');
  });

  it('refuses to follow nothing, and says where a loop comes from', () => {
    const message = errorsOf('tracks 2\nchord 0 1 follow\n')[0];
    expect(message).toContain('nothing to follow');
    expect(message).toContain('progression Am F C G');
    expect(errorsOf('tracks 2\nnote 0 1 follow\n')[0]).toContain('nothing to follow');
  });

  it('refuses a chord too wide for the channel, and names the way out', () => {
    const message = errorsOf('tracks 2\nprogression Cmaj7 F\nchord 0 1 follow\n')[0];
    expect(message).toContain('4 notes at a time');
    expect(message).toContain('track 1 poly 4');
    // With the channel widened in the same script, the same two lines apply.
    expect(applied('tracks 2\ntrack 1 poly 4\nprogression Cmaj7 F\nchord 0 1 follow\n')
      .patterns[0].steps[0][0].extra).toEqual([64, 67, 71]);
  });

  it('refuses a follower with a gesture bolted on, rather than ignoring it', () => {
    expect(errorsOf('tracks 2\nprogression Am F\nchord 0 1 follow arp up 4\n')[0]).toContain('no arp');
    expect(errorsOf('tracks 2\nprogression Am F\nnote 0 1 follow 40\n')[0]).toContain('takes nothing after it');
  });

  it('follows a loop the SONG already has, with no line of its own', () => {
    // A script pasted onto a song is applied to THAT song, so a follower can hang
    // a channel on the four chords the song is already made of — the same bargain
    // `track 2 bus DRUMS` makes with a group the script never declared.
    const first = applied('tracks 2\nprogression Am F C G\n');
    const second = applied('track 1 poly 4\nchord 0 1 follow\n', first);
    expect(second.patterns[0].steps[0][0].note).toBe(69);
  });
});

describe('the progression in a file', () => {
  it('is a version of its own, because an older build would drop the loop', () => {
    const plain = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    expect(plain.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(plain)).not.toContain('progression');
    const looped = JSON.parse(songToJson(applied('tracks 2\nprogression Am F C G hold 8\n'))) as Record<string, unknown>;
    expect(looped.version).toBe(PROGRESSION_SONG_FILE_VERSION);
    // AT LEAST, not exactly: a progression was the newest file kind when this
    // line was written, and the version ceiling belongs to whatever is newest now.
    expect(SONG_FILE_VERSION_MAX).toBeGreaterThanOrEqual(PROGRESSION_SONG_FILE_VERSION);
    expect(PROGRESSION_SONG_FILE_VERSION).toBeGreaterThan(CHORD_SONG_FILE_VERSION);
    expect(PROGRESSION_SONG_FILE_VERSION).toBeGreaterThan(DRUM_SONG_FILE_VERSION);
    // Written as the WORDS, because a loop is a decision about harmony and the
    // register is the follower's business.
    expect(looped.progression).toEqual({ chords: ['Am', 'F', 'C', 'G'], hold: 8 });
  });

  it('writes its line into the script, in the order it was written', () => {
    const song = applied('tracks 2\nprogression Am F C G\nsection A 1 1\n');
    const script = songToScript(song);
    expect(script).toContain('progression Am F C G');
    expect(script.indexOf('progression ')).toBeLessThan(script.indexOf('section A'));
  });

  it('round trips through JSON, notes and all', () => {
    const song = wide('progression Am F C G hold 8\nchord 0 1 follow\n');
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error(back.errors.join(' / '));
    expect(labelsOf(back.song.progression)).toBe('Am F C G');
    expect(progressionHold(back.song.progression!)).toBe(8);
    expect(songToJson(back.song)).toBe(songToJson(song));
    expect(songToScript(back.song)).toBe(songToScript(song));
  });

  it('round trips a loop written in the song\\u2019s own key', () => {
    const song = applied('tracks 2\nkey A minor\nprogression 1 6 3 7\n');
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error(back.errors.join(' / '));
    expect(labelsOf(back.song.progression)).toBe('1 6 3 7');
    // The degrees stay degrees: they are relative to the key in the file (A
    // minor), so they resolve where the file says they do.
    expect(progressionStepNotes(back.song.progression!.steps[0], back.song.key, 4)).toEqual([69, 72, 76]);
  });

  it('refuses a loop it cannot mean, rather than guessing at one', () => {
    const read = (progression: unknown): string => {
      const file = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
      file.progression = progression;
      const back = songFromJson(JSON.stringify(file));
      return back.ok ? '' : back.errors.join(' / ');
    };
    expect(read({ chords: ['Am', 'H'], hold: 4 })).toContain('is not a chord');
    expect(read({ chords: [], hold: 4 })).toContain('at least one chord');
    expect(read({ chords: ['Am'], hold: 400 })).toContain(`1..${MAX_PROGRESSION_HOLD}`);
    expect(read({ chords: [7], hold: 4 })).toContain('written as a name');
    expect(read({ chords: ['Am'] })).toBe('');
    expect(read('Am F C G')).toContain('must be an object');
  });

  it('leaves a song with no loop exactly the file it always was', () => {
    const bare = applied('tracks 2\n');
    const withLoopThenCleared = applied('tracks 2\nprogression Am F\nprogression none\n');
    expect(songToJson(withLoopThenCleared)).toBe(songToJson(bare));
    expect(songToScript(withLoopThenCleared)).toBe(songToScript(bare));
  });
});

describe('the published manifest', () => {
  it('says what a loop is and what it may hold', () => {
    const caps = scriptCapabilities();
    const published = caps.vocabulary.progression;
    expect(published.follow).toBe('follow');
    expect(published.hold).toBe('hold');
    expect(published.none).toBe('none');
    expect(published.chordSpellings).toContain('m7b5');
    expect(caps.limits.progressions.steps.max).toBe(MAX_PROGRESSION_STEPS);
    expect(caps.limits.progressions.hold.atDefault).toBe(DEFAULT_PROGRESSION_HOLD);
    expect(caps.versionNotes.find((entry) => entry.version === 17)?.note).toContain('PROGRESSION');
  });
});
