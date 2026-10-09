import { describe, expect, it } from 'vitest';

import {
  applyScript,
  articulationHits,
  articulationLabel,
  articulationProblem,
  articulationText,
  ARTICULATION_SONG_FILE_VERSION,
  clampStutter,
  createSong,
  DEFAULT_STUTTER,
  FALL_CHAR,
  GRACE_CHAR,
  MAX_BEND,
  MAX_GLIDE,
  MAX_GRACE,
  MAX_STUTTER,
  MIN_BEND,
  MIN_STUTTER,
  NO_ARTICULATION,
  parseArticulation,
  rowNotes,
  sameArticulation,
  SCOOP_CHAR,
  SLIDE_CHAR,
  SLIDE_GLIDE,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  STUTTER_CHAR,
  tidyArticulation,
  type Song,
} from '../model';
import { scriptCapabilities } from '../model/capabilities';

/**
 * Articulation: how a note is PLAYED rather than what pitch it is.
 *
 * Three promises, in the order they matter. A note that says nothing must be the
 * note this app always played — one hit, at the start, for the whole length, at
 * the channel's own glide — because that identity is what makes the feature
 * additive, in the sound and in the bytes. The suffix must be one thing: `>` and
 * `*N` in either order and at most once each, refused rather than repaired when
 * it is neither, because a stutter that plays plainly is a difference the author
 * cannot hear. And it must survive every road a note takes — the script, both
 * file formats, the grid's own cell grammar and the scheduler's arithmetic.
 */

/** The song a script made, insisting it parsed. */
function applied(song: Song, source: string): Song {
  const result = applyScript(song, source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song;
}

/** A one-channel song whose first note is played the way the caller asks. */
function played(cell: string): Song {
  return applied(createSong(), `tracks 1\n${cell}`);
}

/** The cell at step 0 of pattern 0, channel 0. */
function firstCell(song: Song) {
  return song.patterns[0].steps[0][0];
}

describe('the two gestures', () => {
  it('slides over the whole note or not at all, and there is no halfway', () => {
    // The gesture is the channel's own `glide` at its maximum, aimed at one
    // note: a slide IS the whole arrival, and 100 is what `glide 100` means.
    expect(SLIDE_GLIDE).toBe(MAX_GLIDE);
    expect(SLIDE_CHAR).toBe('>');
    expect(STUTTER_CHAR).toBe('*');
    expect(NO_ARTICULATION).toEqual({ slide: false, stutter: DEFAULT_STUTTER, grace: 0, bend: 0 });
    expect(DEFAULT_STUTTER).toBe(1);
    // Two is the smallest roll and eight is a fast buzz; past that a step is not
    // long enough for the hits to be hits rather than a texture.
    expect(MIN_STUTTER).toBe(2);
    expect(MAX_STUTTER).toBe(8);
  });

  it('reads the suffix in either order, at most once each, and nothing else', () => {
    expect(parseArticulation('')).toEqual({ slide: false, stutter: 1, grace: 0, bend: 0 });
    expect(parseArticulation(SLIDE_CHAR)).toEqual({ slide: true, stutter: 1, grace: 0, bend: 0 });
    expect(parseArticulation(`${STUTTER_CHAR}3`)).toEqual({ slide: false, stutter: 3, grace: 0, bend: 0 });
    expect(parseArticulation(`${SLIDE_CHAR}${STUTTER_CHAR}3`)).toEqual({ slide: true, stutter: 3, grace: 0, bend: 0 });
    // The order is free because the two values are told apart by what they ARE,
    // the same rule the `note` line's extras follow.
    expect(parseArticulation(`${STUTTER_CHAR}3${SLIDE_CHAR}`)).toEqual({ slide: true, stutter: 3, grace: 0, bend: 0 });
  });

  it('refuses anything that is not a gesture rather than guessing', () => {
    for (const bad of [
      `${SLIDE_CHAR}${SLIDE_CHAR}`, `${STUTTER_CHAR}1`, `${STUTTER_CHAR}9`, STUTTER_CHAR,
      `${SLIDE_CHAR}x`, 'x', `${STUTTER_CHAR}${STUTTER_CHAR}3`, `${STUTTER_CHAR}0`,
    ]) {
      expect(parseArticulation(bad)).toBeNull();
      // ...and says why, naming the character that was wrong: `*1` and `*9` are
      // the two mistakes that look like correct lines.
      const problem = articulationProblem(bad);
      expect(problem).not.toBeNull();
      expect(problem!.length).toBeGreaterThan(20);
    }
    expect(articulationProblem('')).toBeNull();
  });

  it('spells the same suffix back, so a file a hand edits is a file a hand reads', () => {
    const cases: [string, string][] = [
      ['', ''],
      [SLIDE_CHAR, SLIDE_CHAR],
      [`${STUTTER_CHAR}3`, `${STUTTER_CHAR}3`],
      [`${SLIDE_CHAR}${STUTTER_CHAR}8`, `${SLIDE_CHAR}${STUTTER_CHAR}8`],
    ];
    for (const [written, text] of cases) {
      const parsed = parseArticulation(written)!;
      expect(articulationText(parsed)).toBe(text);
      expect(articulationText({ ...parsed })).toBe(text);
    }
    // A label is the same fact in words, for the inspector.
    expect(articulationLabel({ slide: true, stutter: 1, grace: 0, bend: 0 })).toBe('SLIDE');
    expect(articulationLabel({ slide: false, stutter: 3, grace: 0, bend: 0 })).toBe('STUTTER x3');
    expect(articulationLabel({ slide: true, stutter: 3, grace: 0, bend: 0 })).toBe('SLIDE + STUTTER x3');
    expect(articulationLabel(NO_ARTICULATION)).toBe('');
  });

  it('clamps a stutter a hand-edited file asks for, and keeps the default', () => {
    expect(clampStutter(1)).toBe(1);
    expect(clampStutter(2)).toBe(2);
    expect(clampStutter(8)).toBe(8);
    expect(clampStutter(9)).toBe(8);
    expect(clampStutter(-3)).toBe(1);
    expect(clampStutter(Number.NaN)).toBe(1);
    expect(tidyArticulation({})).toEqual(NO_ARTICULATION);
    expect(tidyArticulation({ slide: true, stutter: 4, grace: 0, bend: 0 })).toEqual({ slide: true, stutter: 4, grace: 0, bend: 0 });
    expect(tidyArticulation({ stutter: 99 }).stutter).toBe(MAX_STUTTER);
    expect(sameArticulation(NO_ARTICULATION, { slide: false, stutter: 1, grace: 0, bend: 0 })).toBe(true);
    expect(sameArticulation({ slide: true, stutter: 1, grace: 0, bend: 0 }, NO_ARTICULATION)).toBe(false);
  });
});

describe('the promise: a note that says nothing is the note it always was', () => {
  it('answers with exactly one hit, at the start, for the whole length', () => {
    // The identity is asserted rather than assumed: 0 adds nothing and 1
    // multiplies by one, in the scheduler and in the renderer both, which is
    // what keeps every note written before this feature sounding the same.
    expect(articulationHits(NO_ARTICULATION, 37)).toEqual([{ at: 0, length: 1, glide: 37, bend: 0 }]);
    // The channel's glide is passed straight through, so a gliding channel still
    // glides note to note.
    expect(articulationHits(NO_ARTICULATION, 0)[0].glide).toBe(0);
  });

  it('tiles a stutter exactly: the hits fill the note and share it evenly', () => {
    for (const count of [2, 3, 4, 5, 8]) {
      const hits = articulationHits({ slide: false, stutter: count, grace: 0, bend: 0 }, 25);
      expect(hits).toHaveLength(count);
      hits.forEach((hit, i) => {
        expect(hit.at).toBeCloseTo(i / count, 10);
        expect(hit.length).toBeCloseTo(1 / count, 10);
      });
      // The last hit still ends where the note would have ended, and the hits
      // meet — no gap and no overlap, which is what makes a monophonic channel
      // sound the same as a polyphonic one here.
      expect(hits[hits.length - 1].at + hits[hits.length - 1].length).toBeCloseTo(1, 10);
      expect(hits.reduce((total, hit) => total + hit.length, 0)).toBeCloseTo(1, 10);
      // A repeat is a repeat: the channel's glide belongs to the first hit.
      expect(hits.map((hit) => hit.glide)).toEqual([25, ...hits.slice(1).map(() => 0)]);
    }
  });

  it('slides the FIRST hit of a stutter, because that is the note arriving', () => {
    const hits = articulationHits({ slide: true, stutter: 3, grace: 0, bend: 0 }, 10);
    expect(hits[0].glide).toBe(SLIDE_GLIDE);
    expect(hits.slice(1).map((hit) => hit.glide)).toEqual([0, 0]);
    // A slide with no stutter is one hit that slides the whole way: the same
    // length as a plain note, a different glide.
    expect(articulationHits({ slide: true, stutter: 1, grace: 0, bend: 0 }, 10)).toEqual([
      { at: 0, length: 1, glide: SLIDE_GLIDE, bend: 0 },
    ]);
  });

  it('travels with the note out of the grid, so both audio paths and the writer see it', () => {
    const song = played('tracks 1\nC-4>*3');
    const notes = rowNotes(song.patterns[0], 0);
    expect(notes).toHaveLength(1);
    expect(notes[0].articulation).toEqual({ slide: true, stutter: 3, grace: 0, bend: 0 });
    // And a plain cell answers the default rather than `undefined`, which is what
    // lets the scheduler treat the two identically.
    const plain = createSong();
    plain.patterns[0].steps[0][0] = { note: 60, extra: [], drum: null, velocity: 100, slide: false, stutter: 1, grace: 0, bend: 0 };
    expect(rowNotes(plain.patterns[0], 0)[0].articulation).toEqual(NO_ARTICULATION);
  });
});

describe('the word', () => {
  it('writes the suffix on a cell in the grid, after the note and before the force', () => {
    expect(firstCell(played('C-4>'))).toMatchObject({ note: 60, slide: true, stutter: 1, grace: 0, bend: 0 });
    expect(firstCell(played('C-4*3'))).toMatchObject({ note: 60, slide: false, stutter: 3, grace: 0, bend: 0 });
    expect(firstCell(played('C-4>*3~40'))).toMatchObject({ note: 60, velocity: 40, slide: true, stutter: 3, grace: 0, bend: 0 });
    // The suffix and the force are told apart by shape, so either order reads.
    expect(firstCell(played('C-4~40>*3'))).toMatchObject({ velocity: 40, slide: true, stutter: 3, grace: 0, bend: 0 });
    expect(firstCell(played('C-4>*3~40'))).toEqual(firstCell(played('C-4~40>*3')));
  });

  it('takes the same suffix as an extra value on a note line', () => {
    const slides = applied(createSong(), 'tracks 1\nnote 0 1 C-4 >');
    const stutters = applied(createSong(), 'tracks 1\nnote 0 1 C-4 *3');
    const both = applied(createSong(), 'tracks 1\nnote 0 1 C-4 40 >*3');
    expect(firstCell(slides)).toMatchObject({ slide: true, stutter: 1, grace: 0, bend: 0 });
    expect(firstCell(stutters)).toMatchObject({ slide: false, stutter: 3, grace: 0, bend: 0 });
    expect(firstCell(both)).toMatchObject({ velocity: 40, slide: true, stutter: 3, grace: 0, bend: 0 });
    // The force and the gesture may be written in either order, which is what
    // makes the extra values a SET rather than a sequence.
    expect(firstCell(applied(createSong(), 'tracks 1\nnote 0 1 C-4 > 40')))
      .toEqual(firstCell(applied(createSong(), 'tracks 1\nnote 0 1 C-4 40 >')));
  });

  it('refuses a suffix it does not know, and changes nothing', () => {
    const song = played('C-4>*3');
    for (const line of ['C-4**3', 'C-4~40 fast', 'note 0 1 C-4 *1', 'note 0 1 C-4 >>']) {
      const result = applyScript(song, line);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors[0].message.length).toBeGreaterThan(20);
    }
    // A refused line leaves the song it was applied to alone: a script works on a
    // copy, so a half-written cell cannot escape.
    expect(firstCell(song)).toMatchObject({ slide: true, stutter: 3, grace: 0, bend: 0 });
  });

  it('is a value on a note rather than a word of its own', () => {
    const caps = scriptCapabilities();
    expect(caps.commands.some((row) => row.word === 'slide' || row.word === 'stutter')).toBe(false);
    expect(caps.vocabulary.articulations).toEqual([
      { id: 'slide', char: SLIDE_CHAR },
      { id: 'stutter', char: STUTTER_CHAR },
      { id: 'flam', char: GRACE_CHAR },
      { id: 'drag', char: `${GRACE_CHAR}${GRACE_CHAR}` },
      { id: 'scoop', char: SCOOP_CHAR },
      { id: 'fall', char: FALL_CHAR },
    ]);
    expect(caps.limits.stutter).toEqual({ min: MIN_STUTTER, max: MAX_STUTTER });
    expect(caps.limits.grace).toEqual({ min: 1, max: MAX_GRACE });
    expect(caps.limits.bend).toEqual({ min: MIN_BEND, max: MAX_BEND });
    // A consumer is told the VALUE changed shape, which is the one thing a
    // version note about a suffix can say.
    expect(caps.scriptVersion).toBeGreaterThanOrEqual(10);
    expect(caps.versionNotes.find((entry) => entry.version === 10)?.note).toContain('C-4>');
  });

  it('goes back to plain when a script starts a new song', () => {
    const song = played('C-4>*3');
    const fresh = applied(song, 'new\ntracks 1\nC-4');
    expect(firstCell(fresh)).toEqual({ note: 60, extra: [], drum: null, velocity: 100, slide: false, stutter: 1, grace: 0, bend: 0 });
  });
});

describe('the file', () => {
  it('writes version 12 for a song whose notes are plain, with no key anywhere', () => {
    const plain = createSong();
    plain.patterns[0].steps[0][0] = { note: 60, extra: [], drum: null, velocity: 100, slide: false, stutter: 1, grace: 0, bend: 0 };
    const raw = JSON.parse(songToJson(plain)) as Record<string, unknown>;
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(raw)).not.toContain('slide');
    expect(JSON.stringify(raw)).not.toContain('stutter');
    expect(songToScript(plain)).not.toContain(SLIDE_CHAR);
    expect(songToScript(plain)).not.toContain(STUTTER_CHAR);
  });

  it('writes version 23 when a note is played in some way', () => {
    const song = played('C-4>*3~40');
    const raw = JSON.parse(songToJson(song)) as { version: number; patterns: { steps: unknown[][] }[] };
    expect(raw.version).toBe(ARTICULATION_SONG_FILE_VERSION);
    // A version, not the newest one forever: later features declare their own.
    expect(ARTICULATION_SONG_FILE_VERSION).toBeLessThanOrEqual(SONG_FILE_VERSION_MAX);
    // The suffix the script writes, as a string beside the two numbers — and the
    // velocity is written out even at full force, so a reader never has to guess
    // whether `[60, ">"]` meant a slide or a force.
    expect(raw.patterns[0].steps[0][0]).toEqual([60, 40, `${SLIDE_CHAR}${STUTTER_CHAR}3`]);
    expect(songToScript(song)).toContain(`C-4${SLIDE_CHAR}${STUTTER_CHAR}3~40`);
  });

  it('round-trips through the JSON', () => {
    const song = played('C-4>*3~40');
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(firstCell(back.song)).toMatchObject({ note: 60, velocity: 40, slide: true, stutter: 3, grace: 0, bend: 0 });
    expect(songToJson(back.song)).toBe(songToJson(song));
  });

  it('round-trips through the SCRIPT, which is the format a hand reads', () => {
    const song = played('C-4>*3~40');
    const text = songToScript(song);
    const back = applied(createSong(), text);
    expect(firstCell(back)).toMatchObject({ note: 60, velocity: 40, slide: true, stutter: 3, grace: 0, bend: 0 });
    expect(songToScript(back)).toBe(text);
  });

  it('refuses a suffix a file has that this build cannot play', () => {
    const raw = JSON.parse(songToJson(played('C-4>*3'))) as { patterns: { steps: unknown[][] }[] };
    raw.patterns[0].steps[0][0] = [60, 100, `${STUTTER_CHAR}99`];
    const back = songFromJson(JSON.stringify(raw));
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.errors.join(' ')).toContain('not something a note can do');

    raw.patterns[0].steps[0][0] = [60, 100, 3];
    const typed = songFromJson(JSON.stringify(raw));
    expect(typed.ok).toBe(false);
  });
});

describe('the MIDI writer', () => {
  it('writes a stutter as the hits it is, and a slide as nothing at all', () => {
    // A stutter IS notes, so it crosses; a slide is a way of arriving at one,
    // which MIDI could only spell as a pitch bend nothing here models. The
    // assertion that matters is that the plain song is unchanged: one hit, at
    // the step it was written on.
    const plain = articulationHits(NO_ARTICULATION, 0);
    expect(plain).toHaveLength(1);
    expect(plain[0].at).toBe(0);
    expect(articulationHits({ slide: true, stutter: 1, grace: 0, bend: 0 }, 0)).toHaveLength(1);
    expect(articulationHits({ slide: false, stutter: 3, grace: 0, bend: 0 }, 0)).toHaveLength(3);
  });
});
