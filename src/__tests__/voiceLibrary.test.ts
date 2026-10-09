import { describe, expect, it } from 'vitest';

import { DEFAULT_VOICE, type UserVoice } from '../model';
import { loadVoiceLibrary, saveVoiceLibrary, VOICE_LIBRARY_STORAGE_KEY } from '../voiceLibrary';
import type { KeyValueStore } from '../themePrefs';

/**
 * Remembering the sounds you saved.
 *
 * The same rules the theme's storage lives by, and for the same reasons:
 * `localStorage` is shared with the origin, editable by hand, and outlives the
 * build that wrote it, so what comes back is untrusted input — and failing to
 * remember must never be failing to work.
 */

function fakeStore(initial: Record<string, string> = {}, opts: { throws?: boolean } = {}) {
  const map = new Map(Object.entries(initial));
  const guard = (): void => {
    if (opts.throws) throw new Error('storage is blocked');
  };
  const store: KeyValueStore & { peek(key: string): string | null } = {
    getItem(key) { guard(); return map.get(key) ?? null; },
    setItem(key, value) { guard(); map.set(key, value); },
    peek(key) { return map.get(key) ?? null; },
  };
  return store;
}

const MYPAD: UserVoice = { name: 'MYPAD', params: { ...DEFAULT_VOICE, wave: 'sawtooth', bright: 40 }, stack: [] };

describe('loading the saved sounds', () => {
  it('has none when there is nothing stored', () => {
    expect(loadVoiceLibrary(fakeStore())).toEqual([]);
    expect(loadVoiceLibrary(fakeStore({ [VOICE_LIBRARY_STORAGE_KEY]: '' }))).toEqual([]);
    expect(loadVoiceLibrary(fakeStore({ [VOICE_LIBRARY_STORAGE_KEY]: 'not json at all' }))).toEqual([]);
  });

  it('is nothing, not an error, when storage cannot be read', () => {
    // Private browsing throws on ACCESS, not just on write.
    expect(loadVoiceLibrary(fakeStore({}, { throws: true }))).toEqual([]);
    expect(loadVoiceLibrary(null)).toEqual([]);
  });

  it('reads back what a previous session saved', () => {
    const store = fakeStore();
    expect(saveVoiceLibrary([MYPAD], store)).toBe(true);
    expect(loadVoiceLibrary(store)).toEqual([MYPAD]);
  });

  it('keeps the sounds it can read out of a value that has been edited by hand', () => {
    // The stored JSON is only as trustworthy as the tab that wrote it.
    const stored = JSON.stringify([
      { name: 'GOOD', params: { wave: 'sine' } },
      { name: 'BROKEN', params: { wave: 'not-a-wave' } },
    ]);
    expect(loadVoiceLibrary(fakeStore({ [VOICE_LIBRARY_STORAGE_KEY]: stored })).map((v) => v.name))
      .toEqual(['GOOD']);
  });

  it('round-trips an empty library, so DELETE really does forget', () => {
    const store = fakeStore();
    saveVoiceLibrary([MYPAD], store);
    saveVoiceLibrary([], store);
    expect(loadVoiceLibrary(store)).toEqual([]);
  });
});

describe('writing the saved sounds', () => {
  it('reports failure instead of throwing when storage refuses', () => {
    // A session that cannot persist still works; the menu still shows the voice.
    expect(saveVoiceLibrary([MYPAD], fakeStore({}, { throws: true }))).toBe(false);
    expect(saveVoiceLibrary([MYPAD], null)).toBe(false);
  });
});
