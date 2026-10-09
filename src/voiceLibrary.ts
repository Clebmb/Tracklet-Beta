/**
 * voiceLibrary — remembering the sounds you saved.
 *
 * A user instrument is a name plus six numbers, so the whole problem is where to
 * keep the list between sessions. Tracklet's answer is the same one it uses for
 * the theme: one namespaced key in `localStorage`, read and written through the
 * tiny store interface in `themePrefs.ts`, and treated as untrusted input.
 *
 * The decisions are worth stating, because this is the one place in the app that
 * keeps something of the user's that is NOT in a song:
 *
 *   • THE LIBRARY IS NOT SONG DATA. A song already carries the exact sound of
 *     every channel, so a song saved and opened somewhere else sounds right
 *     whether or not this list exists. The library is a shortcut for WRITING —
 *     dial a sound once, name it, and use it in the next song — which is why a
 *     saved song never depends on it.
 *
 *   • A SAVED SOUND IS ALWAYS ITS NUMBERS. Nothing here stores a reference to a
 *     built-in preset, so a preset that changes shape in a future build cannot
 *     silently reshape a sound someone saved. `MYPAD` is the six values it was
 *     saved with, forever.
 *
 *   • FAILING TO REMEMBER IS NOT FAILING. A private window throws on write and a
 *     blocked store throws on read; both are swallowed, exactly as they are for
 *     the theme. Saving a voice in a window that forgets is still saving it for
 *     the session.
 *
 * The validating reader lives in the model (`parseUserVoices`) so the rules —
 * what a name may be, how many there may be — are unit tested without a DOM.
 */

import { parseUserVoices, type UserVoice } from './model/instrument';
import { webStore, type KeyValueStore } from './themePrefs';

/** Where the saved voices live. Namespaced, because the origin is shared. */
export const VOICE_LIBRARY_STORAGE_KEY = 'tracklet.voices';

/**
 * The saved voices, or none.
 *
 * Never throws and never returns rubbish: a malformed value, a blocked store,
 * or a half-written list all come back as the voices that COULD be read, which
 * may be none. There is no error to report here, because there is nothing the
 * user could do about it and nothing was lost — the songs are elsewhere.
 */
export function loadVoiceLibrary(store: KeyValueStore | null = webStore()): UserVoice[] {
  const raw = readItem(store, VOICE_LIBRARY_STORAGE_KEY);
  if (raw === null || raw === '') return [];
  try {
    return parseUserVoices(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Write the whole library. Returns whether it was written, so the caller can say
 * 'saved' honestly — a session that cannot persist still works, and the menu
 * still shows the new voice.
 */
export function saveVoiceLibrary(library: readonly UserVoice[], store: KeyValueStore | null = webStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(VOICE_LIBRARY_STORAGE_KEY, JSON.stringify(library));
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
