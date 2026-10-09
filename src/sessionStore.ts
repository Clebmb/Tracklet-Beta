/**
 * sessionStore — remembering the song you were just working on.
 *
 * The app has two ways to lose work and this is the answer to one of them: every
 * change is already one `Ctrl+Z` from undone, but closing the tab is not. So the
 * working song, and the handful of settings a `.json` file does not carry, are
 * written to one namespaced key as you work and read back on the next boot.
 *
 * The decisions are `kitLibrary.ts`'s and `themePrefs.ts`'s, one scope up:
 *
 *   • IT IS UNTRUSTED INPUT, AND IT IS NOT THE SONG. What comes back is run
 *     through the SAME reader a file is (`parseSongFile` in the scene), so a
 *     session written by an older build — or edited by hand, or half-written when
 *     the tab was killed — is refused by the file format's own rules rather than
 *     trusted because it is ours. A session that cannot be read is not a loss:
 *     the file the person saved is elsewhere, and this is a convenience.
 *
 *   • IT CARRIES A VERSION OF ITS OWN, separate from the song format's. The
 *     wrapper is this app's business and the song inside it is the format's, so
 *     the two numbers move for different reasons: a song can gain a field without
 *     the wrapper changing, and the wrapper can change shape without pretending
 *     the SONG did.
 *
 *   • FAILING TO REMEMBER IS NOT FAILING. A private window throws on write and a
 *     blocked store throws on read; both are swallowed, exactly as the theme and
 *     the two libraries do. A session that forgets still works for as long as the
 *     tab is open.
 */

import { webStore, type KeyValueStore } from './themePrefs';
import type { ScriptSettings } from './model/script';

/** Where the working session lives. Namespaced, because the origin is shared. */
export const SESSION_STORAGE_KEY = 'tracklet.session';

/**
 * The shape of what is stored, or the wrapper's own age.
 *
 * Bumped only when the WRAPPER changes shape (a field renamed, a value moved),
 * never when a song gains a field — that is the song format's `version`, and it
 * is inside `song` where the file reader already checks it.
 */
export const SESSION_VERSION = 1;

/** What a session holds: the song as a file, and the settings beside it. */
export interface StoredSession {
  version: number;
  /** The song, as the `.json` text `songToJson` writes and `parseSongFile` reads. */
  song: string;
  /**
   * The session settings a song file does not carry — the octave, the solo, the
   * chord mode, the audition toggle, the export region, the loudness target.
   *
   * Typed as `ScriptSettings` because that is exactly what `applyScriptSettings`
   * consumes: a restored session is applied through the same function a pasted
   * script is, so there is no second way for a setting to be set.
   */
  settings: ScriptSettings;
}

/** Wrap a song and its settings as the value to store. */
export function sessionValue(song: string, settings: ScriptSettings): StoredSession {
  return { version: SESSION_VERSION, song, settings };
}

/**
 * Read a stored value back, or null when there is nothing usable.
 *
 * A value from a future build (a higher version), a song that is not text, or
 * settings that are not an object all come back as null rather than as a
 * half-filled session — the same rule every reader here follows: refuse, do not
 * repair. The schema check is deliberately shallow; whether the song itself is a
 * song is the file reader's question, asked in the scene when it is used.
 */
export function parseSession(raw: unknown): StoredSession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record.version !== SESSION_VERSION) return null;
  if (typeof record.song !== 'string' || record.song.trim() === '') return null;
  if (typeof record.settings !== 'object' || record.settings === null) return null;
  return { version: SESSION_VERSION, song: record.song, settings: record.settings as ScriptSettings };
}

/** The remembered session, or null. Never throws and never returns rubbish. */
export function loadSession(store: KeyValueStore | null = webStore()): StoredSession | null {
  const raw = readItem(store, SESSION_STORAGE_KEY);
  if (raw === null || raw === '') return null;
  try {
    return parseSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Write the session. Returns whether it was written, so a caller could say so —
 * no caller does, because an autosave that announced itself twenty times an hour
 * would be a worse neighbour than one that quietly failed.
 */
export function saveSession(session: StoredSession, store: KeyValueStore | null = webStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

/** Forget the session, so the next boot starts from a blank song. */
export function clearSession(store: KeyValueStore | null = webStore()): void {
  try {
    (store as (KeyValueStore & { removeItem?(key: string): void }) | null)?.removeItem?.(SESSION_STORAGE_KEY);
  } catch {
    // Same as everywhere else here: an unreachable store is not worth a crash.
  }
}

function readItem(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
