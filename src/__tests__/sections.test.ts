import { describe, expect, it } from 'vitest';

import {
  appendOrder,
  applyScript,
  arrangementBars,
  arrangementDescribes,
  arrangementLabel,
  arrangementScript,
  clampSectionBars,
  createSong,
  MAX_ORDER,
  MAX_SECTION_NAME,
  formUnarranged,
  MAX_SECTIONS,
  orderSectionLabels,
  patternRows,
  removeOrder,
  sameSection,
  sameSectionName,
  sectionByName,
  sectionLabel,
  sectionNameProblem,
  sectionScript,
  sectionsNeverPlayed,
  sectionsToScript,
  SECTIONS_SONG_FILE_VERSION,
  SONG_FILE_VERSION,
  songFromJson,
  songToJson,
  songToScript,
  SCRIPT_KEYWORDS,
  setOrderPattern,
  summarizeSong,
  tidySection,
  tidySectionName,
  tidySections,
  withSection,
  withoutSection,
  type Section,
} from '../model';
import { scriptCapabilities } from '../model/capabilities';

/**
 * Sections, tested as the promise they are: **a name for a group of bars, and a
 * song whose bars have no names plays exactly as it always did.**
 *
 * The half worth reading twice is that `arrange` BUILDS the order rather than
 * describing it: a section is a way of writing an arrangement, so `model/song.ts`,
 * the engine, the renderer, the tempo map and the lanes all keep seeing a plain
 * list of bars. Everything here that looks like bookkeeping — that an edit to the
 * order forgets the form, that a drifted arrangement is dropped rather than
 * refused — is that promise being kept.
 */

/** A section, with the fields a test does not care about filled in. */
function section(name = 'VERSE', bars: number[] = [1, 1, 2, 1]): Section {
  return { name, bars };
}

/** The published three-part form, ready to extend. */
const FORM = `new
song "FORM"
tracks 4
section VERSE 1 1 2 1
section CHORUS 3 4 3 5
section OUTRO 4
arrange VERSE VERSE CHORUS VERSE CHORUS OUTRO
`;

describe('a section is a name for a group of bars', () => {
  it('is one word, upper case, and no longer than the budget', () => {
    expect(tidySectionName('  verse ')).toBe('VERSE');
    expect(tidySectionName('Chorus')).toBe('CHORUS');
    expect(tidySectionName('a'.repeat(MAX_SECTION_NAME + 8))).toHaveLength(MAX_SECTION_NAME);
    expect(sectionNameProblem('VERSE')).toBeNull();
    expect(sectionNameProblem('VERSE-2')).toBeNull();
    expect(sectionNameProblem('OUTRO_1')).toBeNull();
    expect(sectionNameProblem('V1')).toBeNull();
  });

  it('refuses a name it cannot use, and says what one is', () => {
    // A refusal rather than a repair, and the one place this module draws that
    // line: a name is how `arrange` refers to a section, so quietly rewriting
    // "MY CHORUS" into "MYCHORUS" would rewrite the arrangement that used it.
    expect(sectionNameProblem('')).toContain('needs a name');
    expect(sectionNameProblem('   ')).toContain('needs a name');
    expect(sectionNameProblem('MY CHORUS')).toContain('one word');
    expect(sectionNameProblem('MY CHORUS')).toContain('no spaces');
    expect(sectionNameProblem('"THE DROP"')).toContain('one word');
    expect(sectionNameProblem('a'.repeat(MAX_SECTION_NAME + 1))).toContain('at most 12 characters');
  });

  it('treats two spellings of a name as the same section', () => {
    expect(sameSectionName('verse', 'VERSE')).toBe(true);
    expect(sameSectionName('Verse', ' chorus')).toBe(false);
    expect(sameSection(section(), section())).toBe(true);
    expect(sameSection(section(), section('VERSE', [1, 2]))).toBe(false);
    expect(sameSection(section(), section('CHORUS'))).toBe(false);
  });

  it('clamps the bars a section may hold, and cuts it to what a song plays', () => {
    expect(clampSectionBars([1, 0, 999])).toEqual([1, 1, 64]);
    expect(clampSectionBars([1, Number.NaN, 2])).toEqual([1, 2]);
    expect(clampSectionBars(Array.from({ length: MAX_ORDER + 5 }, () => 1))).toHaveLength(MAX_ORDER);
  });

  it('tidies a whole list: no nameless sections, no duplicates, and a ceiling', () => {
    const tidied = tidySections([
      section('VERSE', [1]),
      section('', [2]),
      section('verse', [3, 3]),
      section('NO BARS', []),
    ]);
    expect(tidied).toEqual([{ name: 'VERSE', bars: [3, 3] }]);
    expect(tidySections(Array.from({ length: MAX_SECTIONS + 4 }, (_, i) => section(`S${i}`)))).toHaveLength(MAX_SECTIONS);
    expect(tidySection(section('chorus', [0, 200]))).toEqual({ name: 'CHORUS', bars: [1, 64] });
  });

  it('adds a section, and REPLACES one whose name it already has', () => {
    const one = withSection([], section('VERSE', [1, 1]));
    expect(one).toEqual([{ name: 'VERSE', bars: [1, 1] }]);
    const two = withSection(one, section('verse', [3, 3, 3]));
    // Replacing rather than appending is what makes `section VERSE …` twice mean
    // "the verse is this now" — the same bargain the tempo map makes.
    expect(two).toEqual([{ name: 'VERSE', bars: [3, 3, 3] }]);
    expect(withSection(two, section('CHORUS', [2]))[1].name).toBe('CHORUS');
  });

  it('looks a name up however it was typed, and drops one by name', () => {
    const list = [section('VERSE', [1]), section('CHORUS', [2])];
    expect(sectionByName(list, 'verse')?.bars).toEqual([1]);
    expect(sectionByName(list, 'BRIDGE')).toBeNull();
    expect(withoutSection(list, 'verse')).toEqual([{ name: 'CHORUS', bars: [2] }]);
  });
});

describe('an arrangement is the order, written with names', () => {
  const sections = [section('VERSE', [1, 1, 2, 1]), section('CHORUS', [3, 4, 3, 5]), section('OUTRO', [4])];

  it('expands section names into the bars they play', () => {
    const { bars, missing } = arrangementBars(sections, ['VERSE', 'CHORUS']);
    expect(missing).toBeNull();
    expect(bars).toEqual([1, 1, 2, 1, 3, 4, 3, 5]);
  });

  it('lets a section be used as many times as the form wants', () => {
    const { bars } = arrangementBars(sections, ['VERSE', 'VERSE', 'VERSE']);
    expect(bars).toEqual([1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1]);
  });

  it('stops at the first name the song does not define, and reports it', () => {
    // A form with a hole in it is not a form: the caller needs the NAME, because
    // the message it prints has to say which word was wrong.
    const { bars, missing } = arrangementBars(sections, ['VERSE', 'BRIDGE', 'CHORUS']);
    expect(missing).toBe('BRIDGE');
    expect(bars).toEqual([1, 1, 2, 1]);
  });

  it('knows when an arrangement still describes an order, and when it does not', () => {
    const order = [1, 1, 2, 1, 3, 4, 3, 5];
    expect(arrangementDescribes(order, sections, ['VERSE', 'CHORUS'])).toBe(true);
    expect(arrangementDescribes(order, sections, [])).toBe(false);
    expect(arrangementDescribes(order, [], ['VERSE'])).toBe(false);
    // A hand edit changes the order and the claim stops being true…
    expect(arrangementDescribes([...order, 4], sections, ['VERSE', 'CHORUS'])).toBe(false);
    expect(arrangementDescribes([1, 1, 2, 1, 3, 4, 3, 4], sections, ['VERSE', 'CHORUS'])).toBe(false);
    // …and so does a section that has been redefined since.
    expect(arrangementDescribes(order, [section('VERSE', [1]), section('CHORUS', [2])], ['VERSE', 'CHORUS'])).toBe(false);
  });

  it('labels each bar of the order with the section it came from', () => {
    const order = [1, 1, 2, 1, 3, 4, 3, 5];
    expect(orderSectionLabels(order, sections, ['VERSE', 'CHORUS']))
      .toEqual(['VERSE', 'VERSE', 'VERSE', 'VERSE', 'CHORUS', 'CHORUS', 'CHORUS', 'CHORUS']);
  });

  it('says nothing about a bar rather than something almost right', () => {
    // Every case where the form is no longer a description of the order: no form
    // at all, a form of the wrong length, and a form whose bars have moved.
    const order = [1, 2, 3];
    const nothing = [null, null, null];
    expect(orderSectionLabels(order, sections, [])).toEqual(nothing);
    expect(orderSectionLabels(order, [], ['VERSE'])).toEqual(nothing);
    expect(orderSectionLabels(order, sections, ['VERSE'])).toEqual(nothing);
    expect(orderSectionLabels([1, 1, 2, 1], sections, ['VERSE', 'CHORUS'])).toEqual([null, null, null, null]);
  });

  it('writes itself back out as the statements that read it', () => {
    expect(sectionScript(section('VERSE', [1, 1, 2, 1]))).toBe('section VERSE 1 1 2 1');
    expect(sectionsToScript([])).toBe('');
    expect(sectionsToScript(sections)).toContain('section CHORUS 3 4 3 5');
    expect(sectionLabel(section('VERSE', [1, 2]))).toBe('VERSE  1 2');
    expect(arrangementLabel(['VERSE', 'CHORUS'])).toBe('VERSE CHORUS');
    expect(arrangementScript(['VERSE', 'CHORUS'])).toBe('arrange VERSE CHORUS');
    expect(arrangementScript([])).toBe('');
  });
});

describe('the words', () => {
  const run = (text: string) => applyScript(createSong(), text);

  it('names a group of bars without changing anything you can hear', () => {
    const result = run('section VERSE 1 1 2 1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.sections).toEqual([{ name: 'VERSE', bars: [1, 1, 2, 1] }]);
    // A definition, not a change: the song still plays one bar.
    expect(result.song.order).toEqual([1]);
    expect(result.song.arrangement).toEqual([]);
  });

  it('builds the order out of names', () => {
    const result = run(FORM);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.order).toEqual([1, 1, 2, 1, 1, 1, 2, 1, 3, 4, 3, 5, 1, 1, 2, 1, 3, 4, 3, 5, 4]);
    expect(result.song.arrangement).toEqual(['VERSE', 'VERSE', 'CHORUS', 'VERSE', 'CHORUS', 'OUTRO']);
    // The form is a description of the order it built, which is the whole point.
    expect(arrangementDescribes(result.song.order, result.song.sections, result.song.arrangement)).toBe(true);
  });

  it('creates a pattern a section names, exactly as `order` does', () => {
    const result = run('section CHORUS 4 4\narrange CHORUS');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.patterns).toHaveLength(4);
    expect(result.song.order).toEqual([4, 4]);
  });

  it('reads two spellings of a name as one section', () => {
    const result = run('section verse 1 1\narrange VERSE');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.sections[0].name).toBe('VERSE');
    expect(result.song.order).toEqual([1, 1]);
  });

  it('redefines a name the later line mentions, and arranges the new one', () => {
    const result = run('section CHORUS 3 4\nsection CHORUS 3 4 3 5\narrange CHORUS');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.sections).toEqual([{ name: 'CHORUS', bars: [3, 4, 3, 5] }]);
    expect(result.song.order).toEqual([3, 4, 3, 5]);
  });

  it('uses a section the SONG already has, for a script that only arranges', () => {
    // A form is something a song HAS rather than something a script invents: a
    // script pasted onto a song with sections may arrange one it never wrote.
    const first = run('section VERSE 1 1 2 1\narrange VERSE');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyScript(first.song, 'arrange VERSE VERSE');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.song.order).toEqual([1, 1, 2, 1, 1, 1, 2, 1]);
  });

  it('is read top to bottom, so a name must be defined above its arrangement', () => {
    const result = run('arrange VERSE\nsection VERSE 1 1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('arrange names a section the song does not have: "VERSE"');
    expect(result.errors[0].message).toContain('ABOVE the line that arranges it');
    expect(result.errors[0].message).toContain('the song has none yet');
  });

  it('lists the names it does have when an arrangement names one it does not', () => {
    const result = run('section VERSE 1 1\narrange VERSE BRIDGE');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('"BRIDGE"');
    expect(result.errors[0].message).toContain('the song has: VERSE');
  });

  it('refuses a bare section, a bare arrangement, and a name it cannot use', () => {
    const bare = run('section');
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.errors[0].message).toContain('section needs a name and the bars');

    const nothing = run('arrange');
    expect(nothing.ok).toBe(false);
    if (!nothing.ok) expect(nothing.errors[0].message).toContain('arrange needs one or more section names');

    const spaced = run('section "MY CHORUS" 1 2');
    expect(spaced.ok).toBe(false);
    if (!spaced.ok) expect(spaced.errors[0].message).toContain('one word');

    // And an UNQUOTED two-word name never reaches that refusal: the line reads as
    // the name `MY` and the bar `CHORUS`, so the bar message is the one that has
    // to explain it — which is why it says what a name is.
    const unquoted = run('section MY CHORUS 1 2');
    expect(unquoted.ok).toBe(false);
    if (!unquoted.ok) {
      expect(unquoted.errors[0].message).toContain('A section NAME is one word');
      expect(unquoted.errors[0].message).toContain('got "CHORUS"');
    }
  });

  it('refuses a section with no bars, and one longer than a song', () => {
    const lonely = run('section VERSE');
    expect(lonely.ok).toBe(false);
    if (!lonely.ok) expect(lonely.errors[0].message).toContain('needs at least one bar');

    const long = run(`section LONGDAY ${Array.from({ length: MAX_ORDER + 1 }, () => 1).join(' ')}`);
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors[0].message).toContain(`at most ${MAX_ORDER} bars`);
  });

  it('refuses a bar that is not a pattern number', () => {
    const zero = run('section VERSE 0 1');
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.errors[0].message).toContain('takes pattern numbers 1..64');

    const note = run('section VERSE A-4 C-5');
    expect(note.ok).toBe(false);
    if (!note.ok) expect(note.errors[0].message).toContain('takes pattern numbers 1..64');
  });

  it(`stops at ${MAX_SECTIONS} names, and says so on the one after`, () => {
    const many = Array.from({ length: MAX_SECTIONS }, (_, i) => `section S${i} 1`).join('\n');
    const full = run(many);
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(full.song.sections).toHaveLength(MAX_SECTIONS);
    const oneMore = applyScript(full.song, 'section ONE_TOO_MANY 1');
    expect(oneMore.ok).toBe(false);
    if (oneMore.ok) return;
    expect(oneMore.errors[0].message).toContain(`at most ${MAX_SECTIONS} named sections`);
  });

  it('checks `new` against an EMPTY form, not the one already on screen', () => {
    // `new` replaces the song, so it has to replace every list the parser was
    // seeded from the song with — the sections, the groups, the chord loop and the
    // lanes alike. While only the shape was reset, a script pasted over a song
    // that already had a form was refused for names the fresh song would never
    // have: ten old sections plus fifteen new ones is over any cap there is.
    const existing = run(Array.from({ length: 10 }, (_, i) => `section S${i} 1`).join('\n'));
    expect(existing.ok).toBe(true);
    if (!existing.ok) return;

    const fresh = Array.from({ length: MAX_SECTIONS }, (_, i) => `section T${i} 1`).join('\n');
    const applied = applyScript(existing.song, `new\n${fresh}`);
    expect(applied.ok, applied.ok ? '' : applied.errors.map((e) => `${e.line}: ${e.message}`).join(' / ')).toBe(true);
    if (!applied.ok) return;
    expect(applied.song.sections).toHaveLength(MAX_SECTIONS);
    expect(applied.song.sections.map((one) => one.name)).not.toContain('S0');
  });

  it('refuses an arrangement longer than a song plays', () => {
    const long = `section LONG1 ${Array.from({ length: MAX_ORDER }, () => 1).join(' ')}\narrange LONG1 LONG1`;
    const result = run(long);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain(`that arrangement is ${MAX_ORDER * 2} bars long`);
    expect(result.errors[0].message).toContain('Use fewer sections, or shorter ones');
  });

  it('is two command words of its own, not settings on a track line', () => {
    expect(SCRIPT_KEYWORDS).toContain('section');
    expect(SCRIPT_KEYWORDS).toContain('arrange');
  });

  it('takes the line the reference and the cheat sheet show', () => {
    // Both are prose with fences and a joined string around them, so the lines
    // they show are applied here instead: an example that does not parse is worse
    // than no example at all.
    const reference = run('section VERSE 1 2\narrange VERSE'); // the cheat sheet's own line
    expect(reference.ok).toBe(true);
    if (!reference.ok) return;
    expect(reference.song.order).toEqual([1, 2]);
  });
});

describe('the form and the order cannot disagree', () => {
  it('is forgotten by a hand edit, because the claim stops being true', () => {
    const arranged = applyScript(createSong(), FORM);
    expect(arranged.ok).toBe(true);
    if (!arranged.ok) return;
    expect(arranged.song.arrangement).not.toEqual([]);

    // Every route into the order clears it: the F3 menu's three verbs, and the
    // `order` statement itself.
    const appended = structuredClone(arranged.song);
    appendOrder(appended, 1);
    expect(appended.arrangement).toEqual([]);

    const removed = structuredClone(arranged.song);
    removeOrder(removed, 0);
    expect(removed.arrangement).toEqual([]);

    const pointed = structuredClone(arranged.song);
    setOrderPattern(pointed, 0, 4);
    expect(pointed.arrangement).toEqual([]);

    const rewritten = applyScript(arranged.song, 'order 1 2 1');
    expect(rewritten.ok).toBe(true);
    if (!rewritten.ok) return;
    expect(rewritten.song.arrangement).toEqual([]);
    // The SECTIONS survive all of it: the form is forgotten, not destroyed.
    expect(rewritten.song.sections).toHaveLength(3);
  });

  it('is cleared by `new`, like every other piece of the song', () => {
    const arranged = applyScript(createSong(), FORM);
    expect(arranged.ok).toBe(true);
    if (!arranged.ok) return;
    const fresh = applyScript(arranged.song, 'new\nsong "CLEAN"\ntracks 4');
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(fresh.song.sections).toEqual([]);
    expect(fresh.song.arrangement).toEqual([]);
  });
});

describe('what the app notices about the form', () => {
  // A song with NOTES, because the advisory channel opens with "no notes yet" and
  // gives up there: a form observation is only interesting once there is music.
  const NOTED = `new
song "NOTED"
tracks 2
section VERSE 1 1
section CHORUS 2
section BRIDGE 1 2
arrange VERSE CHORUS VERSE
pattern 1 "V"
C-4 .
E-4 .
pattern 2 "C"
G-4 .
B-4 .
`;

  const noted = () => {
    const result = applyScript(createSong(), NOTED);
    if (!result.ok) throw new Error('the noted form fixture does not parse');
    return result.song;
  };

  it('names the sections the arrangement never plays, and only when one exists', () => {
    const list = [section('VERSE', [1]), section('CHORUS', [2]), section('OUTRO', [3])];
    expect(sectionsNeverPlayed(list, ['VERSE'])).toEqual(['CHORUS', 'OUTRO']);
    // A name is the same section however it was typed, exactly as `arrange` reads it.
    expect(sectionsNeverPlayed(list, ['verse'])).toEqual(['CHORUS', 'OUTRO']);
    // No arrangement means no claim, so every section would look unplayed: that is
    // the hand-edited song, and saying "nothing is played" there would be noise.
    expect(sectionsNeverPlayed(list, [])).toEqual([]);
    expect(sectionsNeverPlayed(list, ['VERSE', 'CHORUS', 'OUTRO'])).toEqual([]);
  });

  it('says a song has a form it is not using exactly when that is true', () => {
    const list = [section('VERSE', [1])];
    expect(formUnarranged(list, [])).toBe(true);
    expect(formUnarranged(list, ['VERSE'])).toBe(false);
    expect(formUnarranged([], [])).toBe(false);
  });

  it('tells a noted song about the part it saved and never plays', () => {
    const summary = summarizeSong(noted());
    expect(summary.advisories.some((a) => a === 'section "BRIDGE" is defined but the arrangement never plays it.')).toBe(true);
    expect(summary.advisories.some((a) => a.includes('not an arrangement'))).toBe(false);
  });

  it('tells a song whose form was forgotten that one line brings it back', () => {
    const song = structuredClone(noted());
    setOrderPattern(song, 0, 2);
    expect(song.arrangement).toEqual([]);
    const summary = summarizeSong(song);
    expect(summary.advisories).toContain('the song defines sections but its order is not an arrangement of them - one "arrange ..." line writes the form.');
    // And with no arrangement to read, no section is called unplayed.
    expect(summary.advisories.some((a) => a.includes('never plays it'))).toBe(false);
  });

  it('says nothing about the form of a song that has none, or a complete one', () => {
    const plain = applyScript(createSong(), 'new\ntracks 2\npattern 1\nC-4 .\n');
    expect(plain.ok).toBe(true);
    if (!plain.ok) return;
    expect(plain.summary.advisories.some((a) => a.includes('arrangement'))).toBe(false);

    // The same song without the section it never plays: every name is in the
    // arrangement, so there is nothing left to notice.
    const whole = applyScript(createSong(), NOTED.replace('section BRIDGE 1 2\n', ''));
    expect(whole.ok).toBe(true);
    if (!whole.ok) return;
    expect(whole.summary.advisories.some((a) => a.includes('arrangement') || a.includes('never plays it'))).toBe(false);
  });
});

describe('the file', () => {
  const arranged = () => {
    const result = applyScript(createSong(), FORM);
    if (!result.ok) throw new Error('the form fixture does not parse');
    return result.song;
  };

  it('declares version 18 when the bars have names, and 12 when they do not', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(raw)).not.toContain('section');

    const file = songToJson(arranged());
    expect(file).toContain(`"version": ${SECTIONS_SONG_FILE_VERSION}`);
    expect(file).toContain('"sections"');
    expect(file).toContain('"arrangement"');
  });

  it('writes a section as a name and the bars it plays', () => {
    const raw = JSON.parse(songToJson(arranged())) as { sections: unknown[]; arrangement: string[] };
    expect(raw.sections[0]).toEqual({ name: 'VERSE', bars: [1, 1, 2, 1] });
    expect(raw.arrangement).toEqual(['VERSE', 'VERSE', 'CHORUS', 'VERSE', 'CHORUS', 'OUTRO']);
  });

  it('reads the form back byte for byte', () => {
    const song = arranged();
    const file = songToJson(song);
    const back = songFromJson(file);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.sections).toEqual(song.sections);
    expect(back.song.arrangement).toEqual(song.arrangement);
    expect(back.song.order).toEqual(song.order);
    expect(songToJson(back.song)).toBe(file);
  });

  it('writes the form into the SCRIPT too, and reads it back', () => {
    const song = arranged();
    const script = songToScript(song);
    expect(script).toContain('section VERSE 1 1 2 1');
    expect(script).toContain('arrange VERSE VERSE CHORUS VERSE CHORUS OUTRO');
    // The names are the arrangement's way of saying it, so the plain order line is
    // NOT written as well: two ways of saying one thing in one file would be a
    // reader's problem, not a reader's help.
    expect(script).not.toContain('order ');
    const again = applyScript(createSong(), script);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.song.sections).toEqual(song.sections);
    expect(again.song.order).toEqual(song.order);
  });

  it('writes the plain order for a song whose bars are unnamed', () => {
    const result = applyScript(createSong(), 'order 1 2 1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const script = songToScript(result.song);
    expect(script).toContain('order 1 2 1');
    expect(script).not.toContain('arrange');
  });

  it('opens a file written before form existed as a song with no names', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const older = songFromJson(JSON.stringify({ ...raw, sections: undefined, arrangement: undefined }));
    expect(older.ok).toBe(true);
    if (!older.ok) return;
    expect(older.song.sections).toEqual([]);
    expect(older.song.arrangement).toEqual([]);
  });

  it('DROPS an arrangement that no longer describes the order, and keeps the music', () => {
    // Repaired rather than refused: the order is what plays, and a label is not
    // music. What must not survive is a claim the file no longer supports.
    const raw = JSON.parse(songToJson(arranged())) as Record<string, unknown>;
    const drifted = songFromJson(JSON.stringify({ ...raw, order: [1, 1, 2, 1] }));
    expect(drifted.ok).toBe(true);
    if (!drifted.ok) return;
    expect(drifted.song.order).toEqual([1, 1, 2, 1]);
    expect(drifted.song.sections).toHaveLength(3);
    expect(drifted.song.arrangement).toEqual([]);
  });

  it('cuts a name to the budget and clamps a bar it cannot use', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const tidy = songFromJson(JSON.stringify({
      ...raw,
      version: SECTIONS_SONG_FILE_VERSION,
      sections: [{ name: 'a'.repeat(MAX_SECTION_NAME + 4), bars: [0, 999] }],
    }));
    expect(tidy.ok).toBe(true);
    if (!tidy.ok) return;
    expect(tidy.song.sections[0].name).toHaveLength(MAX_SECTION_NAME);
    expect(tidy.song.sections[0].bars).toEqual([1, 64]);
  });

  it('refuses a section with no name, no bars, or a bar that is not a number', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const withSections = (sections: unknown) => songFromJson(JSON.stringify({
      ...raw, version: SECTIONS_SONG_FILE_VERSION, sections,
    }));

    const nameless = withSections([{ bars: [1] }]);
    expect(nameless.ok).toBe(false);
    if (!nameless.ok) expect(nameless.errors.join(' ')).toContain('needs a "name"');

    const empty = withSections([{ name: 'VERSE', bars: [] }]);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.errors.join(' ')).toContain('needs "bars"');

    const nonsense = withSections([{ name: 'VERSE', bars: ['C-4'] }]);
    expect(nonsense.ok).toBe(false);
    if (!nonsense.ok) expect(nonsense.errors.join(' ')).toContain('not a number');

    const notAList = withSections({ name: 'VERSE' });
    expect(notAList.ok).toBe(false);
    if (!notAList.ok) expect(notAList.errors.join(' ')).toContain('"sections" must be an array');
  });

  it('refuses more sections than a song may have, and an arrangement naming a stranger', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const tooMany = songFromJson(JSON.stringify({
      ...raw,
      version: SECTIONS_SONG_FILE_VERSION,
      sections: Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => ({ name: `S${i}`, bars: [1] })),
    }));
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.errors.join(' ')).toContain(`at most ${MAX_SECTIONS} sections`);

    const stranger = songFromJson(JSON.stringify({
      ...raw,
      version: SECTIONS_SONG_FILE_VERSION,
      sections: [{ name: 'VERSE', bars: [1] }],
      arrangement: ['VERSE', 'BRIDGE'],
    }));
    expect(stranger.ok).toBe(false);
    if (!stranger.ok) expect(stranger.errors.join(' ')).toContain('"BRIDGE"');
  });

  it('reads the bars a section holds against one pattern, like everything else', () => {
    // A section is a list of pattern numbers, so it needs to know nothing about
    // steps or bars — but a reader should be able to see that for themselves.
    const song = arranged();
    expect(patternRows(song)).toBe(song.patterns[0].steps.length);
  });
});

describe('what the build says about it', () => {
  it('publishes the sections and the name budget', () => {
    const { limits, versionNotes, scriptVersion } = scriptCapabilities();
    expect(limits.sections.max).toBe(MAX_SECTIONS);
    expect(limits.sections.nameChars.max).toBe(MAX_SECTION_NAME);
    expect(versionNotes.some((note) => note.version === 7 && note.note.includes('section'))).toBe(true);
    expect(scriptVersion).toBeGreaterThanOrEqual(7);
  });

  it('lists both words, with an example a test applies', () => {
    const { commands, tiers } = scriptCapabilities();
    for (const word of ['section', 'arrange']) {
      const command = commands.find((one) => one.word === word);
      expect(command, word).toBeDefined();
      expect(command!.example).toContain(word);
    }
    expect(tiers.core).toContain('section');
    expect(tiers.core).toContain('arrange');
  });

  it('publishes the file version a song with a form declares', () => {
    // The newest version a build reads is whatever the NEWEST feature needs, so
    // this is a floor rather than an equality: a later feature raises it again.
    const { fileVersions } = scriptCapabilities();
    expect(fileVersions.max).toBeGreaterThanOrEqual(SECTIONS_SONG_FILE_VERSION);
    expect(SECTIONS_SONG_FILE_VERSION).toBeGreaterThan(SONG_FILE_VERSION);
  });
});
