import { describe, expect, it } from 'vitest';

import { applyScript, createSong, SCRIPT_KEYWORDS, SCRIPT_QUICK_REFERENCE } from '../model';
import { SCRIPT_COMMANDS, SCRIPT_VERSION, scriptCapabilities } from '../model/capabilities';

/**
 * `pack save` — the song that arrives whole.
 *
 * The word is a side effect rather than a value, so what is worth testing is that
 * it is ASKED FOR: a flag that defaulted on would make every apply download a
 * file, and a word that reached the song would make the same script produce two
 * different songs on two machines.
 */

function applied(source: string) {
  return applyScript(createSong(), source);
}

describe('the word', () => {
  it('is one flag in the settings, and nothing in the song', () => {
    const result = applied('pack save\nnote 0 1 C-4');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.packSave).toBe(true);
    expect((result.song as unknown as Record<string, unknown>).packSave).toBeUndefined();
  });

  it('says nothing when it was never said, so an apply writes no file', () => {
    const result = applied('note 0 1 C-4');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.packSave).toBeUndefined();
  });

  it('refuses anything but `save`, including a load it cannot do', () => {
    for (const source of ['pack', 'pack load bundle.zip', 'pack save now']) {
      const result = applied(source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].message).toContain('pack needs save');
    }
  });

  it('is a word beside `export`, published, and on the panel’s sheet', () => {
    expect(SCRIPT_KEYWORDS.indexOf('pack')).toBe(SCRIPT_KEYWORDS.indexOf('export') + 1);
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(61);
    const caps = scriptCapabilities();
    expect(caps.versionNotes.map((entry) => entry.version)).toEqual(
      expect.arrayContaining([61]),
    );
    expect(caps.versionNotes.find((entry) => entry.version === 61)?.note).toContain('PACK');
    expect(SCRIPT_COMMANDS.map((one) => one.word)).toContain('pack');
    expect(SCRIPT_QUICK_REFERENCE.join(' ')).toContain('pack');
  });
});
