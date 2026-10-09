/**
 * themePrefs — remembering which look you chose.
 *
 * The framework owns the themes and the switch; it deliberately does not own
 * PERSISTENCE, because where an app keeps its preferences is the app's business.
 * Tracklet's answer is one key in `localStorage`, and this file is the whole of
 * it. Two decisions are in here, and both are about treating that key the way
 * the rest of the app treats a file:
 *
 *   • IT IS UNTRUSTED INPUT. `localStorage` is shared with every other script on
 *     the origin, editable by hand in devtools, and it survives an upgrade that
 *     REMOVES a theme. So a stored value is only used when the caller says it
 *     still names something real; otherwise it is ignored and the framework's
 *     default stands. Handing an unknown id to `setActiveTheme` would "work" —
 *     it falls back — and leave the app disagreeing with itself about which
 *     theme is on.
 *
 *   • IT IS ALLOWED TO FAIL. Browsing in a private window, or with site data
 *     blocked, makes `localStorage` throw on ACCESS, not just on write. Every
 *     touch is guarded, and failing to remember is never failing to switch.
 *
 * The list of valid ids is passed IN rather than imported. That keeps this file
 * — and its tests — free of the framework (and of Phaser), and it is the honest
 * shape: this module knows about storage, not about which looks exist.
 */

/** Where the chosen theme id lives. Namespaced, because the origin is shared. */
export const THEME_STORAGE_KEY = 'tracklet.theme';

/** The half of `Storage` this needs, so a test can pass in a plain object. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The remembered theme id, or null when there is nothing usable: nothing
 * stored, storage unreachable, or an id that is no longer a theme.
 */
export function pickStoredTheme(known: readonly string[], store: KeyValueStore | null = webStore()): string | null {
  const stored = readItem(store, THEME_STORAGE_KEY);
  return stored !== null && known.includes(stored) ? stored : null;
}

/**
 * Remember a theme. Returns whether it was written, so a caller can tell
 * "remembered" from "switched but forgotten". An id that is not a real theme is
 * refused rather than stored — never write what could not be read back.
 */
export function rememberTheme(id: string, known: readonly string[], store: KeyValueStore | null = webStore()): boolean {
  if (!known.includes(id)) return false;
  try {
    if (!store) return false;
    store.setItem(THEME_STORAGE_KEY, id);
    return true;
  } catch {
    // Private browsing, a full quota, a locked-down webview. The app still
    // switches; it just forgets on reload. Nothing here is worth a crash.
    return false;
  }
}

/** Forget the preference, so the next boot takes the framework's default. */
export function clearStoredTheme(store: KeyValueStore | null = webStore()): void {
  try {
    (store as (KeyValueStore & { removeItem?(key: string): void }) | null)?.removeItem?.(THEME_STORAGE_KEY);
  } catch {
    // Same as above: an unreachable store is not an error worth surfacing.
  }
}

/** `localStorage`, or null where there is none (tests, SSR, blocked storage). */
export function webStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readItem(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
