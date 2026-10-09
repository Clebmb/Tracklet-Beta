/**
 * textScalePrefs — remembering how big you like the text.
 *
 * The same shape as `themePrefs.ts`, for the same reason: the choice is not song
 * data, it belongs to this browser and this person, and the storage is untrusted
 * input that is allowed to fail. It reads and writes one namespaced key and
 * every touch is guarded, so a private window or a blocked store costs the
 * remembering rather than the setting.
 *
 * The difference from the theme is what "not remembered" means. A theme that
 * cannot be remembered still switches for this session, because the framework's
 * live value is the truth. Here the live value is the truth too — the caller
 * sets it and the boxes follow — so the storage is only the answer to "what was
 * it last time", and its two possible answers are a word or the default.
 *
 * The store plumbing is `themePrefs.ts`'s, imported rather than copied: one
 * guarded way to touch `localStorage` is enough for the whole app, and the voice
 * library already reaches for it the same way.
 */

import { webStore, type KeyValueStore } from './themePrefs';
import { DEFAULT_TEXT_SCALE, isTextScale, type TextScale } from './ui/textScale';

/** Where the chosen text size lives. Namespaced, because the origin is shared. */
export const TEXT_SCALE_STORAGE_KEY = 'tracklet.textScale';

/**
 * The remembered text size, or the default: nothing stored, storage
 * unreachable, or a word that is no longer one of the three.
 */
export function pickStoredTextScale(store: KeyValueStore | null = webStore()): TextScale {
  try {
    const stored = store?.getItem(TEXT_SCALE_STORAGE_KEY) ?? null;
    return stored !== null && isTextScale(stored) ? stored : DEFAULT_TEXT_SCALE;
  } catch {
    return DEFAULT_TEXT_SCALE;
  }
}

/**
 * Remember a text size. Returns whether it was written, so a caller can tell
 * "remembered" from "applied but forgotten". A word that is not one of the three
 * is refused rather than stored — never write what could not be read back.
 */
export function rememberTextScale(name: TextScale, store: KeyValueStore | null = webStore()): boolean {
  if (!isTextScale(name)) return false;
  try {
    if (!store) return false;
    store.setItem(TEXT_SCALE_STORAGE_KEY, name);
    return true;
  } catch {
    return false;
  }
}
