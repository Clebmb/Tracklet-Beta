/**
 * kitLibrary — remembering the drum kits you saved.
 *
 * `voiceLibrary.ts` is this file one scope in, and it reads the same way: a kit
 * of your own is a name plus four small tables of numbers, so the whole problem
 * is where to keep the list between sessions. Tracklet's answer is again one
 * namespaced key in `localStorage`, read and written through the tiny store
 * interface in `themePrefs.ts`, and treated as untrusted input.
 *
 * The decisions are `voiceLibrary`'s, and they are worth repeating because a kit
 * is a slightly bigger thing to lose:
 *
 *   • IT IS NOT SONG DATA. A song already carries the NAME of the kit it plays,
 *     and its notes hold no pitches — the four drums are the same four pitches
 *     whatever they are made of. So a kit is a shortcut for WRITING, exactly as a
 *     saved sound is: dial a kit once, name it, and say `kit MYHOUSE` in the next
 *     song. A saved song does not depend on this list — what it depends on is
 *     that its kit still exists, and a song whose kit is missing plays the
 *     PRESETS, the one fallback `kitVoice` documents.
 *
 *   • A SAVED KIT IS ALWAYS ITS NUMBERS. A kit built from the built-in `808` is
 *     written out as the four voices `808` happens to be made of, not as a
 *     reference to it, so a preset that changes shape in a future build cannot
 *     silently reshape a kit someone saved. `MYHOUSE` is the four voices it was
 *     saved with, forever.
 *
 *   • FAILING TO REMEMBER IS NOT FAILING. A private window throws on write and a
 *     blocked store throws on read; both are swallowed, exactly as they are for
 *     the theme and the saved voices. Saving a kit in a window that forgets is
 *     still saving it for the session.
 *
 * The validating reader lives in the model (`parseUserKits`) so the rules — what
 * a name may be, how many there may be — are unit tested without a DOM.
 */

import { parseUserKits, type UserKit } from './model/kit';
import { webStore, type KeyValueStore } from './themePrefs';

/** Where the saved kits live. Namespaced, because the origin is shared. */
export const KIT_LIBRARY_STORAGE_KEY = 'tracklet.kits';

/**
 * The saved kits, or none.
 *
 * Never throws and never returns rubbish: a malformed value, a blocked store, or
 * a half-written list all come back as the kits that COULD be read, which may be
 * none. There is no error to report here, because there is nothing the user could
 * do about it and nothing was lost — the songs are elsewhere.
 */
export function loadKitLibrary(store: KeyValueStore | null = webStore()): UserKit[] {
  const raw = readItem(store, KIT_LIBRARY_STORAGE_KEY);
  if (raw === null || raw === '') return [];
  try {
    return parseUserKits(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Write the whole library. Returns whether it was written, so the caller can say
 * 'saved' honestly — a session that cannot persist still works, and the menu
 * still shows the new kit.
 */
export function saveKitLibrary(library: readonly UserKit[], store: KeyValueStore | null = webStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(KIT_LIBRARY_STORAGE_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

function readItem(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
