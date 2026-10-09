import { describe, expect, it } from 'vitest';

import { clearStoredTheme, pickStoredTheme, rememberTheme, THEME_STORAGE_KEY, type KeyValueStore } from '../themePrefs';

/**
 * What a remembered preference has to get right.
 *
 * `localStorage` is shared with every other script on the origin, editable by
 * hand in devtools, and it survives an upgrade that removes a theme. So what is
 * in it is untrusted input: the app may use it BECAUSE it names a current theme,
 * or ignore it and take the default — never half of one.
 *
 * The framework's real theme list is not imported here on purpose; this file owns
 * storage, and it is handed the ids it should accept.
 */

const KNOWN = ['reliquary', 'forge', 'parchment'];

/** A `Storage` stand-in that can also pretend to be blocked or full. */
function fakeStore(initial: Record<string, string> = {}, opts: { throws?: boolean } = {}) {
  const map = new Map(Object.entries(initial));
  const guard = (): void => {
    if (opts.throws) throw new Error('storage is blocked');
  };
  const store: KeyValueStore & { removeItem(key: string): void; peek(key: string): string | null } = {
    getItem(key) { guard(); return map.get(key) ?? null; },
    setItem(key, value) { guard(); map.set(key, value); },
    removeItem(key) { guard(); map.delete(key); },
    peek(key) { return map.get(key) ?? null; },
  };
  return store;
}

describe('what the app boots into', () => {
  it('is the remembered theme when it still names one', () => {
    for (const id of KNOWN) {
      expect(pickStoredTheme(KNOWN, fakeStore({ [THEME_STORAGE_KEY]: id }))).toBe(id);
    }
  });

  it('is nothing (so the framework default stands) when none was remembered', () => {
    expect(pickStoredTheme(KNOWN, fakeStore())).toBeNull();
    expect(pickStoredTheme(KNOWN, fakeStore({ [THEME_STORAGE_KEY]: '' }))).toBeNull();
  });

  it('is nothing when the remembered theme has been removed or renamed', () => {
    // Exactly what a stored value looks like after the theme list drops an entry.
    expect(pickStoredTheme(KNOWN, fakeStore({ [THEME_STORAGE_KEY]: 'a-theme-from-2019' }))).toBeNull();
    expect(pickStoredTheme(KNOWN, fakeStore({ [THEME_STORAGE_KEY]: 'Forge' }))).toBeNull();
  });

  it('is nothing when storage cannot be read at all', () => {
    expect(pickStoredTheme(KNOWN, fakeStore({ [THEME_STORAGE_KEY]: 'forge' }, { throws: true }))).toBeNull();
    expect(pickStoredTheme(KNOWN, null)).toBeNull();
  });
});

describe('remembering a theme', () => {
  it('writes a real theme under the app’s own key, and reads back', () => {
    const store = fakeStore();
    expect(rememberTheme('parchment', KNOWN, store)).toBe(true);
    expect(store.peek(THEME_STORAGE_KEY)).toBe('parchment');
    expect(pickStoredTheme(KNOWN, store)).toBe('parchment');
  });

  it('refuses to write an id that could never be read back', () => {
    const store = fakeStore();
    expect(rememberTheme('not-a-theme', KNOWN, store)).toBe(false);
    expect(store.peek(THEME_STORAGE_KEY)).toBeNull();
    expect(rememberTheme('', KNOWN, store)).toBe(false);
  });

  it('reports failure instead of throwing when storage refuses', () => {
    // Private browsing throws on write; switching a theme must still work.
    expect(rememberTheme('forge', KNOWN, fakeStore({}, { throws: true }))).toBe(false);
    expect(rememberTheme('forge', KNOWN, null)).toBe(false);
  });

  it('forgets on request, so a caller can go back to the shipped look', () => {
    const store = fakeStore({ [THEME_STORAGE_KEY]: 'forge' });
    clearStoredTheme(store);
    expect(pickStoredTheme(KNOWN, store)).toBeNull();
    // And forgetting when there is nothing to forget is not an error.
    expect(() => clearStoredTheme(null)).not.toThrow();
    expect(() => clearStoredTheme(fakeStore({}, { throws: true }))).not.toThrow();
  });
});
