import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { applyScript, createSong, isThemeName, THEME_NAMES, themeNameHint } from '../model';

/**
 * themeNames — the mirror of the framework's theme list.
 *
 * The point of these tests is DRIFT, and it is why they read the framework's
 * source off disk rather than importing it: the one way this list can go wrong
 * is by falling behind `THEMES`, and importing would need Phaser in a unit test
 * to prove the arithmetic. A regex over the file is enough to notice an added
 * or renamed theme, which is exactly the event that would otherwise make
 * `theme mycelium` start lying.
 */

const THEMES_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../vendor/phaser-ui-canvas/src/theme/themes.ts');

/** Every `id: '...'` in the framework's theme table, in order. */
function frameworkThemeIds(): string[] {
  const source = readFileSync(THEMES_FILE, 'utf8');
  return [...source.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
}

describe('the theme list', () => {
  it('mirrors the framework exactly, so a theme cannot be missing or invented', () => {
    expect([...THEME_NAMES]).toEqual(frameworkThemeIds());
  });

  it('has no duplicates', () => {
    expect(new Set(THEME_NAMES).size).toBe(THEME_NAMES.length);
  });

  it('accepts a real theme, whatever its case or surrounding space', () => {
    expect(isThemeName('forge')).toBe(true);
    expect(isThemeName('FORGE')).toBe(true);
    expect(isThemeName('  The-Deep  ')).toBe(true);
  });

  it('refuses a theme that does not exist, and every refusable thing is not a crash', () => {
    expect(isThemeName('neon')).toBe(false);
    expect(isThemeName('')).toBe(false);
    // The display name is not the id: `THE DEEP` reads nicely in the menu but is
    // not what `setActiveTheme` wants, so a script spells it `the-deep`.
    expect(isThemeName('the deep')).toBe(false);
  });

  it('names every theme in the hint, so the error message teaches the whole list', () => {
    const hint = themeNameHint();
    for (const id of THEME_NAMES) expect(hint).toContain(id);
  });

  it('is a settled setting a script can apply without touching the song', () => {
    const result = applyScript(createSong(), 'new\ntheme mycelium\ntracks 1\nnote 0 1 C4');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.theme).toBe('mycelium');
  });

  it('refuses an unknown theme with the list and the line number', () => {
    const result = applyScript(createSong(), 'theme neon');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].line).toBe(1);
    expect(result.errors[0].message).toContain('neon');
    expect(result.errors[0].message).toContain('forge');
  });

  it('takes the LAST theme when a script changes its mind', () => {
    const result = applyScript(createSong(), 'theme forge\ntheme nest');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.theme).toBe('nest');
  });

  it('says nothing about the theme when the script does not', () => {
    const result = applyScript(createSong(), 'tempo 120');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.theme).toBeUndefined();
  });
});
