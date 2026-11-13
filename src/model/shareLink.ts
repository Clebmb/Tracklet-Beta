/**
 * shareLink — a song as a URL you can paste into a message.
 *
 * The roadmap asks for a "web-native link" and leaves the shape open, so this
 * file records the choice and why:
 *
 *   • NO SERVER, NO THIRD PARTY. Tracklet is a static page, and every hosted
 *     alternative — an upload service, a paste bin — means somebody else holding
 *     the music and somebody paying for the storage. A link that carries the song
 *     in its own fragment works offline, from a file:// copy, and uploads nothing:
 *     the part after `#` is never sent to a web server at all.
 *
 *   • THE SCRIPT, NOT THE JSON. A song's `.json` is a tabulated file with one row
 *     per step per channel; its script is the same music written the way a person
 *     writes it — `tracks 6`, `note 0 1 C-4`, and a grid — so it is several times
 *     smaller, and a person who reads the URL's contents sees a song rather than
 *     a wall of arrays.
 *
 *   • THERE IS A CEILING, AND IT IS SAID OUT LOUD. A long song simply does not fit
 *     in a URL comfortably: browsers differ, chat clients truncate, and a link
 *     that silently loses its last four hundred characters is worse than no link.
 *     So an oversized song is REFUSED with the size and the way out (`pack save`),
 *     rather than shortened.
 *
 * The fragment is base64url of the UTF-8 script, so it survives any client that
 * re-encodes or re-wraps a message.
 */

import type { Song } from './song';
import { songToScript } from './songfile';

/** The fragment a shared song lives in: `#s=<base64url>`. */
export const SHARE_HASH_PREFIX = '#s=';

/**
 * The longest URL this will hand back.
 *
 * Eight thousand characters is comfortably inside what every browser and chat
 * client carries, and far enough above an ordinary song (a six-channel,
 * sixteen-step pattern is a few hundred characters of script) that the ceiling is
 * only reached by something long enough that a pack was the right answer anyway.
 */
export const MAX_SHARE_URL = 8000;

/** Text → base64url, without the padding a URL does not need. */
function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → text, or null when it is not base64url of valid UTF-8. */
function decodeBase64Url(text: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** What `shareLink` answers: the URL, or why the song does not fit in one. */
export type ShareLinkResult =
  | { ok: true; url: string; characters: number }
  | { ok: false; reason: string };

/**
 * A URL for this song, based on `base` — the PAGE the song opens on, not the
 * song: the fragment carries the music, so the same link works on any copy of
 * the app at that address.
 */
export function shareLink(song: Song, base: string): ShareLinkResult {
  const script = songToScript(song);
  const fragment = `${SHARE_HASH_PREFIX}${encodeBase64Url(script)}`;
  // The page's own query and fragment are dropped: two fragments in one URL is
  // not a URL, and the song is the one that matters.
  const page = base.split('#')[0] ?? base;
  const url = page.split('?')[0] ? `${page.split('?')[0]}${fragment}` : `${page}${fragment}`;
  if (url.length > MAX_SHARE_URL) {
    return {
      ok: false,
      reason: `this song is ${url.length} characters as a link, and a link is only honest up to ${MAX_SHARE_URL}: past that a chat client or a browser starts cutting it, and the person at the other end gets half a song. Use \`pack save\` instead — a bundle holds the song, its samples and its plugins, and it is a file rather than a link.`,
    };
  }
  return { ok: true, url, characters: url.length };
}

/** A shared song's script, read back out of a URL or a bare fragment. */
export type ShareSongResult =
  | { ok: true; script: string }
  | { ok: false; reason: string };

export function shareSongFromUrl(url: string): ShareSongResult {
  const at = url.indexOf(SHARE_HASH_PREFIX);
  if (at < 0) {
    return { ok: false, reason: `that link carries no song: a shared Tracklet song is the part after \`${SHARE_HASH_PREFIX}\`.` };
  }
  const encoded = url.slice(at + SHARE_HASH_PREFIX.length).split('&')[0] ?? '';
  if (encoded === '') {
    return { ok: false, reason: 'that link\'s song is empty: there is nothing after `#s=`.' };
  }
  const script = decodeBase64Url(encoded);
  if (script === null) {
    return { ok: false, reason: 'that link\'s song is not readable: the text after `#s=` is not base64url of a script. It was probably cut short when it was copied.' };
  }
  return { ok: true, script };
}
