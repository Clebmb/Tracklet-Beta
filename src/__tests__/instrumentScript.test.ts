import { describe, expect, it } from 'vitest';

import { applyScript, createSong, SCRIPT_KEYWORDS, SCRIPT_QUICK_REFERENCE } from '../model';

/**
 * `instrument` in the script language: the two statements, and the one rule that
 * makes them safe.
 *
 * The interesting part is not that they parse — it is WHERE they end up. An
 * instrument is not song data (the song only ever says `wave font`), so the two
 * statements must travel out in `settings` and leave the song byte-identical,
 * exactly like `theme` and `volume`. A test that only checked the parse would
 * miss a statement that had quietly started writing to the song, and that is the
 * mistake that would make a song file depend on somebody's import list.
 */

const fresh = () => createSong();

describe('instrument statements in a script', () => {
  it('collects `instrument use` as a setting, naming the instrument by text', () => {
    const result = applyScript(fresh(), 'instrument use "GRAVEL KIT"');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The TEXT, unresolved: only the app knows what has been imported.
    expect(result.settings.instrumentUse).toBe('GRAVEL KIT');
  });

  it('accepts a number, because that is how a person talks about a list', () => {
    const result = applyScript(fresh(), 'instrument use 2');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.instrumentUse).toBe('2');
  });

  it('collects `instrument import` as a request for the file picker', () => {
    const result = applyScript(fresh(), 'instrument import');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.instrumentImport).toBe(true);
  });

  it('collects `instrument load` as the font to fetch, path and all', () => {
    // The URL text, unresolved — fetching is the app's, not the language's.
    const result = applyScript(fresh(), 'instrument load "storage/soundfonts/dkc/font.sf2"');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.instrumentLoad).toBe('storage/soundfonts/dkc/font.sf2');
  });

  it('reads an unquoted path with spaces in it as one path', () => {
    // A font's file name is full of spaces and brackets, and the tokenizer splits
    // it on those spaces however it is written — so the statement joins them back.
    const result = applyScript(fresh(), 'instrument load storage/soundfonts/dkc/Donkey Kong Country 2012.sf2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.instrumentLoad).toBe('storage/soundfonts/dkc/Donkey Kong Country 2012.sf2');
    }
  });

  it('keeps a load and a use as two separate asks', () => {
    // Both travel out untouched, because they are settled in ORDER by the app:
    // the use is applied when the bytes land, and only the app knows when that is.
    const result = applyScript(fresh(), 'instrument load "a/f.sf2"\ninstrument use "KIT"');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.instrumentLoad).toBe('a/f.sf2');
    expect(result.settings.instrumentUse).toBe('KIT');
  });

  it('leaves a load out of the song, like the other two', () => {
    const withStatements = applyScript(fresh(), 'track 1 FONT wave font\ninstrument load "f.sf2"');
    const without = applyScript(fresh(), 'track 1 FONT wave font');
    expect(withStatements.ok).toBe(true);
    expect(without.ok).toBe(true);
    if (!withStatements.ok || !without.ok) return;
    expect(withStatements.song).toEqual(without.song);
  });

  it('leaves the song completely alone, which is the whole point', () => {
    // A channel on `wave font` plus an instrument statement, and the song that
    // comes out is the song that went in: an import is app state, so a file never
    // carries it and a reload can never disagree with one.
    const source = 'track 1 FONT wave font\ninstrument use "KIT"\ninstrument import';
    const withStatements = applyScript(fresh(), source);
    const without = applyScript(fresh(), 'track 1 FONT wave font');
    expect(withStatements.ok).toBe(true);
    expect(without.ok).toBe(true);
    if (!withStatements.ok || !without.ok) return;
    expect(withStatements.song).toEqual(without.song);
    expect(withStatements.settings.instrumentUse).toBe('KIT');
    expect(without.settings.instrumentUse).toBeUndefined();
  });

  it('lets the last statement win, like every other setting', () => {
    const result = applyScript(fresh(), 'instrument use 1\ninstrument use "SECOND"');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.instrumentUse).toBe('SECOND');
  });

  it('says what it wanted when it is written wrong, and names the fix', () => {
    const bare = applyScript(fresh(), 'instrument');
    expect(bare.ok).toBe(false);
    if (!bare.ok) {
      expect(bare.errors[0].message).toContain('"use", "import" or "load"');
      expect(bare.errors[0].line).toBe(1);
    }

    const noName = applyScript(fresh(), 'instrument use');
    expect(noName.ok).toBe(false);
    if (!noName.ok) expect(noName.errors[0].message).toContain('needs a name or a number');

    const noPath = applyScript(fresh(), 'instrument load');
    expect(noPath.ok).toBe(false);
    if (!noPath.ok) expect(noPath.errors[0].message).toContain('needs a path');

    const wrong = applyScript(fresh(), 'instrument frobnicate 3');
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.errors[0].message).toContain('"use", "import" or "load"');
  });

  it('is one of the words the language knows, and one the panel shows', () => {
    expect(SCRIPT_KEYWORDS).toContain('instrument');
    // The cheat sheet is how a person finds a command, and a test in
    // `docs.test.ts` holds every keyword to being in it — the WORD, not every
    // form of it: `track` shows one of its dozen options for the same reason.
    // The panel's column is finite, so a second statement means folding, which is
    // why `instrument` is paired with `key` there and `instrument import` lives in
    // the reference instead.
    expect(SCRIPT_QUICK_REFERENCE.join(' ')).toContain('instrument use');
    // Twenty lines and thirty-two characters each is the CARD's geometry, not a
    // style rule: `ScriptPanel` draws them 11px apart from y=46, so the block ends
    // at 266 and the footer's last label at 360, with the modal ending at 391 and
    // the canvas at 405. One line was added when `automate` landed, and one more
    // when the form arrived (`section`/`arrange`); `grid`/`meter` then arrived
    // without one, folding the fifth `track` line into the fourth instead. A
    // thirty-third character, or a twenty-first line, would run into something.
    // `bus` is that twenty-first line, and it fits: with the block at 277 the last
    // doc label lands at 371 and the modal ends at 391. A twenty-second line would
    // not, so the next word must fold or the panel must grow.
    expect(SCRIPT_QUICK_REFERENCE.length).toBeLessThanOrEqual(21);
    expect(SCRIPT_QUICK_REFERENCE.every((line) => line.length <= 32)).toBe(true);
  });

  it('does not make a channel sound like a font that is not loaded', () => {
    // `wave font` with nothing imported is still a legal script: the voice is
    // song data and the instrument is not, so the song is written and the
    // channel falls back to the built-in samples until something is imported.
    const result = applyScript(fresh(), 'track 1 FONT wave font\ninstrument use 1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].voice.wave).toBe('font');
  });
});
