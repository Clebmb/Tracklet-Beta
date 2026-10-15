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
  /**
   * The output bus this file isolates, when the channel's plugin separates
   * its outs: the bus index plus its manifest name. Absent is the whole
   * channel — every mono channel and every undeclared render reads this way.
   */
  out?: { index: number; name: string };
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
 * The file name for one output bus: the channel's own file, plus the bus.
 *
 * `my-tune-03-drums-kick.wav` sits beside `my-tune-03-drums.wav` the way the
 * channel number sits before the channel name: the part, then the part of
 * the part, so a directory listing keeps one channel's outs together and a
 * file can still be found again from the status line's sentence.
 */
export function stemOutFileName(stem: string, track: number, trackName: string, outName: string): string {
  const channel = stemFileName(stem, track, trackName).slice(0, -STEM_FILE_EXTENSION.length);
  const named = fileSlug(outName, STEM_FALLBACK_NAME, STEM_NAME_LIMIT);
  return `${channel}-${named}${STEM_FILE_EXTENSION}`;
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
 *
 * `trackOuts` is the declared outs per channel (index-aligned, like the
 * engine's banks): a used channel with two or more declared outs becomes one
 * file per bus, in bus order; anything else — mono, one out, undeclared,
 * silent — reads exactly as it always has. Only DECLARED outs split, because
 * only declared names can be file names a DAW import keeps.
 */
export function stemPlan(
  song: Song,
  stem: string,
  trackOuts: readonly (readonly string[] | null | undefined)[] = [],
): StemEntry[] {
  const used = usedTracks(song);
  const entries: StemEntry[] = [];
  song.tracks.forEach((track, index) => {
    if (!used[index]) return;
    // A stranger in the caller's list is no outs, not a throw: the plan is
    // built from app state nobody typed, and a download must never fail on
    // its shape.
    const claimed = trackOuts[index];
    const outs = (Array.isArray(claimed) ? claimed : []).filter((name) => typeof name === 'string' && name !== '');
    if (outs.length > 1) {
      outs.forEach((name, outIndex) => {
        entries.push({
          track: index + 1,
          name: stemOutFileName(stem, index + 1, track.name, name),
          out: { index: outIndex, name },
        });
      });
      return;
    }
    entries.push({ track: index + 1, name: stemFileName(stem, index + 1, track.name) });
  });
  return entries;
}

/** The channel numbers a plan carries, which is what the renderer is asked for. */
export function stemTracks(entries: readonly StemEntry[]): number[] {
  return entries.map((entry) => entry.track);
}

/** One render the stem set needs: the channel, plus the bus it isolates. */
export interface StemRequest {
  track: number;
  /** The bus index, or null for the whole channel. */
  out: number | null;
}

/**
 * What the renderer is asked for, entry by entry in plan order — so the
 * rendered audio and the file names can never drift apart: `rendered[i]` is
 * always `entries[i]`'s sound.
 */
export function stemRequests(entries: readonly StemEntry[]): StemRequest[] {
  return entries.map((entry) => ({ track: entry.track, out: entry.out?.index ?? null }));
}
