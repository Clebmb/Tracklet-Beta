/**
 * stems — the song, one channel at a time.
 *
 * `EXPORT AUDIO` writes the mix: every channel piled into one file, which is
 * what a listener wants and the wrong thing for anybody who intends to MIX. A
 * stem set is the same song with each channel on its own — a `.wav` per part, in
 * an archive — which is how a Tracklet song gets finished somewhere else: into a
 * DAW, a video editor, a collaborator's session, a mastering engineer's desk.
 *
 * ── What this module owns, and what it does not ─────────────────────────────
 * This is the NAMING and the SET — which channels become which files, in which
 * order, and under what name. The audio is `audio/render.ts` (one channel of the
 * same graph the mix is rendered through), the container is `audio/zip.ts`, and
 * the menu is `ui/FileMenu.ts`; this file is the part all three agree about, and
 * the part a test can check without a browser.
 *
 * ── Which channels become files ─────────────────────────────────────────────
 * The channels that CARRY something, in channel order: a channel with no note
 * anywhere in the song is not a stem, it is an empty file that makes an archive
 * look broken and a DAW import ask questions. A song with nothing in it at all
 * refuses in words rather than handing over an empty archive — the same rule the
 * MIDI writer follows, and the same reason: a download that cannot be used is
 * worse than a sentence that says why.
 *
 * Every file is numbered by its CHANNEL (1-based, like the language) and then
 * named, so `my-tune-03-clap.wav` is channel 3 whatever the file system does
 * with its sorting — and so a part can be found again from the sentence the
 * status line prints.
 */

import { fileSlug } from './songfile';
import { usedTracks, type Song } from './song';

/** What one stem is called on disk. */
export const STEM_FILE_EXTENSION = '.wav';
/** What the set of them travels in. One file per channel, zipped. */
export const STEM_ARCHIVE_EXTENSION = '.zip';
/** How long a channel's part of a file name may be; the number and stem are extra. */
export const STEM_NAME_LIMIT = 24;
/** The word a nameless channel falls back to, so no file is called `-03.wav`. */
export const STEM_FALLBACK_NAME = 'track';

/** One channel of the song, and the file it becomes. */
export interface StemEntry {
  /** The channel, 1-based — the same number the language uses. */
  track: number;
  /** The name, extension included: `my-tune-01-kick.wav`. */
  name: string;
}

/**
 * The file name for one channel: the song's stem, the channel's NUMBER, and what
 * the channel is called.
 *
 * The number is zero-padded so a directory listing sorts the way the song does
 * rather than the way an alphabet does — `01` before `10` — and it comes before
 * the name because that is the part a person reads to find a part again.
 */
export function stemFileName(stem: string, track: number, trackName: string): string {
  const number = String(Math.max(1, Math.round(track))).padStart(2, '0');
  const named = fileSlug(trackName, STEM_FALLBACK_NAME, STEM_NAME_LIMIT);
  return `${stem}-${number}-${named}${STEM_FILE_EXTENSION}`;
}

/** The archive one set of stems travels in: `my-tune-stems.zip`. */
export function stemArchiveName(stem: string): string {
  return `${stem}-stems${STEM_ARCHIVE_EXTENSION}`;
}

/**
 * Why this song cannot be stemmed, or null when it can.
 *
 * One refusal, and it is the same one the MIDI writer makes: a song with no
 * notes in it has no parts to isolate. It is checked before any rendering starts
 * because a browser that is about to render eight files is a browser that should
 * not be asked to render silence eight times.
 */
export function stemRefusal(song: Song): string | null {
  return usedTracks(song).some(Boolean)
    ? null
    : 'this song has no notes in it, so there are no stems to render.';
}

/**
 * The set: every channel that carries a note, in channel order, with its file
 * name.
 *
 * `stem` is the song's own file stem (`songFileStem`), passed in rather than
 * derived here so that the archive, the script and the JSON of one song are all
 * named alike — and so this stays a function of its arguments rather than of a
 * title somebody is midway through typing.
 */
export function stemPlan(song: Song, stem: string): StemEntry[] {
  const used = usedTracks(song);
  const entries: StemEntry[] = [];
  song.tracks.forEach((track, index) => {
    if (!used[index]) return;
    entries.push({ track: index + 1, name: stemFileName(stem, index + 1, track.name) });
  });
  return entries;
}

/** The channel numbers a plan carries, which is what the renderer is asked for. */
export function stemTracks(entries: readonly StemEntry[]): number[] {
  return entries.map((entry) => entry.track);
}
