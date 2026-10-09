import { describe, expect, it } from 'vitest';

import { DEFAULT_KIT, drumVoice, type UserKit } from '../model';
import { loadKitLibrary, saveKitLibrary, KIT_LIBRARY_STORAGE_KEY } from '../kitLibrary';
import type { KeyValueStore } from '../themePrefs';

/**
 * Remembering the drum kits you saved.
 *
 * `voiceLibrary.test.ts` is this file one scope in, and the rules are the same
 * because the problem is: `localStorage` is shared with the origin, editable by
 * hand, and outlives the build that wrote it, so what comes back is untrusted
 * input — and failing to remember must never be failing to work.
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

const MYHOUSE: UserKit = {
  name: 'MYHOUSE',
  voices: {
    kick: drumVoice('kick'),
    snare: drumVoice('snare'),
    hat: drumVoice('hat'),
    wind: drumVoice('wind'),
  },
};

describe('loading the saved kits', () => {
  it('has none when there is nothing stored', () => {
    expect(loadKitLibrary(fakeStore())).toEqual([]);
    expect(loadKitLibrary(fakeStore({ [KIT_LIBRARY_STORAGE_KEY]: '' }))).toEqual([]);
    expect(loadKitLibrary(fakeStore({ [KIT_LIBRARY_STORAGE_KEY]: 'not json at all' }))).toEqual([]);
  });

  it('is nothing, not an error, when storage cannot be read', () => {
    // Private browsing throws on ACCESS, not just on write.
    expect(loadKitLibrary(fakeStore({}, { throws: true }))).toEqual([]);
    expect(loadKitLibrary(null)).toEqual([]);
  });

  it('reads back what a previous session saved', () => {
    const store = fakeStore();
    expect(saveKitLibrary([MYHOUSE], store)).toBe(true);
    expect(loadKitLibrary(store)).toEqual([MYHOUSE]);
  });

  it('keeps the kits it can read out of a value that has been edited by hand', () => {
    // The stored JSON is only as trustworthy as the tab that wrote it: a kit with
    // no name is dropped, and a drum whose wave is unreadable falls back to the
    // presets rather than taking the whole kit down with it.
    const stored = JSON.stringify([
      { name: 'GOOD', voices: MYHOUSE.voices },
      { voices: MYHOUSE.voices },
      { name: DEFAULT_KIT.toUpperCase(), voices: MYHOUSE.voices },
    ]);
    expect(loadKitLibrary(fakeStore({ [KIT_LIBRARY_STORAGE_KEY]: stored })).map((k) => k.name))
      .toEqual(['GOOD']);
  });

  it('round-trips an empty library, so a session that forgets really does', () => {
    const store = fakeStore();
    saveKitLibrary([MYHOUSE], store);
    saveKitLibrary([], store);
    expect(loadKitLibrary(store)).toEqual([]);
  });
});

describe('writing the saved kits', () => {
  it('reports failure instead of throwing when storage refuses', () => {
    // A session that cannot persist still works; the menu still shows the kit.
    expect(saveKitLibrary([MYHOUSE], fakeStore({}, { throws: true }))).toBe(false);
    expect(saveKitLibrary([MYHOUSE], null)).toBe(false);
  });
});
