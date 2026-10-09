import { describe, expect, it } from 'vitest';

import { applyScript, createSong } from '../model';
import { SCRIPT_COMMANDS, SCRIPT_VERSION, scriptCapabilities } from '../model/capabilities';
import { PAGE_NAMES, isPageName, pageNameHint, type PageName } from '../model/pages';
import { SCRIPT_KEYWORDS, SCRIPT_QUICK_REFERENCE } from '../model/script';

/**
 * The `page` statement, and the closed list of screens it may name.
 *
 * `page arranger` is the one word that turns the four full screens into
 * something ONE script can drive, so its guard is the same shape as every
 * session setting here: the word is in the language, its name list is published,
 * and a name this build does not have is refused in words rather than switching
 * to a screen that does not exist.
 */
describe('the page statement', () => {
  it('lists the pages this build can show, in the dropdown order', () => {
    expect([...PAGE_NAMES]).toEqual(['tracker', 'machine', 'mixer', 'arranger', 'arp', 'live', 'recorder']);
  });

  it('accepts every page name it publishes', () => {
    for (const name of PAGE_NAMES) {
      const result = applyScript(createSong(), `new\npage ${name}`);
      expect(result.ok, `page ${name}`).toBe(true);
      if (result.ok) expect(result.settings.page).toBe(name);
    }
  });

  it('is case-insensitive, like every other word', () => {
    const result = applyScript(createSong(), 'new\npage MIXER');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.page).toBe('mixer');
  });

  it('refuses a page this build does not have, in words', () => {
    // A page a build was never taught must be refused rather than opening a
    // screen that is not there. This is the forward-compatibility promise the
    // language keeps — and the reason `PAGE_NAMES` holds only the screens THIS
    // build can show.
    for (const name of ['sampler', 'nonsense']) {
      const result = applyScript(createSong(), `new\npage ${name}`);
      expect(result.ok, `page ${name}`).toBe(false);
      if (!result.ok) expect(result.errors[0].message).toContain('is not a page');
    }
  });

  it('needs exactly one name', () => {
    for (const line of ['page', 'page mixer extra']) {
      const result = applyScript(createSong(), `new\n${line}`);
      expect(result.ok, line).toBe(false);
    }
  });

  it('leaves the setting absent when the script says nothing', () => {
    const result = applyScript(createSong(), 'new\nsong "X"');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.page).toBeUndefined();
  });

  it('is a word the language, the cheat sheet and the manifest all know', () => {
    expect(SCRIPT_KEYWORDS).toContain('page');
    expect(SCRIPT_COMMANDS.find((command) => command.word === 'page')?.example).toBe('page arranger');
    expect(SCRIPT_QUICK_REFERENCE.join(' ').toLowerCase()).toContain('page');
    expect(scriptCapabilities().vocabulary.pages).toEqual([...PAGE_NAMES]);
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(46);
  });

  it('teaches the allowed names in its refusal', () => {
    expect(pageNameHint()).toContain('tracker');
    expect(pageNameHint()).toContain('arranger');
  });

  it('is typed as the same list the language accepts', () => {
    // A compile-time check: `PageName` and `PAGE_NAMES` cannot drift, and the
    // dropdown's `PageId` is derived from `PAGE_NAMES` in `ui/PageMenu.ts`.
    const names: PageName[] = [...PAGE_NAMES];
    expect(names).toHaveLength(PAGE_NAMES.length);
    expect(isPageName('arranger')).toBe(true);
    expect(isPageName('  MIXER  ')).toBe(true);
    expect(isPageName('live')).toBe(true);
  });
});
