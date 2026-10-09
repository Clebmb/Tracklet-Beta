import { describe, expect, it } from 'vitest';

import {
  SESSION_STORAGE_KEY,
  SESSION_VERSION,
  clearSession,
  loadSession,
  parseSession,
  saveSession,
  sessionValue,
} from '../sessionStore';
import type { ScriptSettings } from '../model';
import type { KeyValueStore } from '../themePrefs';

/**
 * Remembering the working session.
 *
 * The same rules as the two libraries and the theme preference — the store is
 * shared with the origin, edited by hand in devtools, and outlives the build that
 * wrote it — plus one of its own: the session carries a VERSION, because the
 * wrapper is this app's business while the song inside it belongs to the file
 * format, and the two numbers move for different reasons.
 */

function fakeStore(initial: Record<string, string> = {}, opts: { throws?: boolean } = {}) {
  const map = new Map(Object.entries(initial));
  const guard = (): void => {
    if (opts.throws) throw new Error('storage is blocked');
  };
  const store: KeyValueStore & { peek(key: string): string | null; removeItem(key: string): void } = {
    getItem(key) { guard(); return map.get(key) ?? null; },
    setItem(key, value) { guard(); map.set(key, value); },
    peek(key) { return map.get(key) ?? null; },
    removeItem(key) { guard(); map.delete(key); },
  };
  return store;
}

const SETTINGS: ScriptSettings = {
  volume: 0.7,
  octave: 4,
  solo: [2],
  chordDegrees: 3,
  hearNotes: true,
};

describe('the session value', () => {
  it('wraps a song and its settings under the current wrapper version', () => {
    const value = sessionValue('{"format":"tracklet-song"}', SETTINGS);
    expect(value).toEqual({ version: SESSION_VERSION, song: '{"format":"tracklet-song"}', settings: SETTINGS });
  });
});

describe('reading a session', () => {
  it('accepts a well-formed value, whatever the song actually says', () => {
    // The wrapper checks its own shape only; whether the text is a real song is
    // the file reader's question, asked later.
    expect(parseSession({ version: 1, song: 'x', settings: {} }))
      .toEqual({ version: SESSION_VERSION, song: 'x', settings: {} });
  });

  it('refuses a wrapper it does not understand rather than guessing', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession('a string')).toBeNull();
    expect(parseSession(42)).toBeNull();
    expect(parseSession({})).toBeNull();
    expect(parseSession({ version: 0, song: 'x', settings: {} })).toBeNull();
    expect(parseSession({ version: 2, song: 'x', settings: {} })).toBeNull();
    expect(parseSession({ version: '1', song: 'x', settings: {} })).toBeNull();
    expect(parseSession({ version: 1, song: '', settings: {} })).toBeNull();
    expect(parseSession({ version: 1, song: '   ', settings: {} })).toBeNull();
    expect(parseSession({ version: 1, song: 7, settings: {} })).toBeNull();
    expect(parseSession({ version: 1, song: 'x' })).toBeNull();
    expect(parseSession({ version: 1, song: 'x', settings: null })).toBeNull();
  });

  it('is nothing, not an error, when there is no session or storage is unreachable', () => {
    expect(loadSession(fakeStore())).toBeNull();
    expect(loadSession(fakeStore({ [SESSION_STORAGE_KEY]: '' }))).toBeNull();
    expect(loadSession(fakeStore({ [SESSION_STORAGE_KEY]: 'not json at all' }))).toBeNull();
    // Private browsing throws on ACCESS, not just on write.
    expect(loadSession(fakeStore({}, { throws: true }))).toBeNull();
    expect(loadSession(null)).toBeNull();
  });

  it('reads back what a previous session saved', () => {
    const store = fakeStore();
    expect(saveSession(sessionValue('{"format":"tracklet-song"}', SETTINGS), store)).toBe(true);
    expect(loadSession(store)).toEqual(sessionValue('{"format":"tracklet-song"}', SETTINGS));
  });
});

describe('writing and forgetting a session', () => {
  it('reports failure instead of throwing when storage refuses', () => {
    expect(saveSession(sessionValue('x', SETTINGS), fakeStore({}, { throws: true }))).toBe(false);
    expect(saveSession(sessionValue('x', SETTINGS), null)).toBe(false);
  });

  it('forgets on request, and forgetting a blocked store is not an error', () => {
    const store = fakeStore({ [SESSION_STORAGE_KEY]: JSON.stringify(sessionValue('x', SETTINGS)) });
    clearSession(store);
    expect(loadSession(store)).toBeNull();
    expect(() => clearSession(fakeStore({}, { throws: true }))).not.toThrow();
    expect(() => clearSession(null)).not.toThrow();
  });
});
