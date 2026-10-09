/**
 * The "noticed something" channel.
 *
 * The script summary has always been able to OBSERVE things about a song —
 * `advisoriesDetailed` returns up to six of them, and `advisoriesFor` projects
 * them to the plain strings the API publishes: an empty pattern, a channel with no
 * notes, a stack of layers all at full gain, a channel whose fader and layers add
 * up past full scale, a song that names its bars and does not arrange them, a
 * section the arrangement never plays, an export range past the end of the order.
 * None of them is a mistake. Each is one line away from being finished, which is
 * what makes it worth saying, and they were never refusals: the plan's rule is
 * that they speak up "in the same channel as the existing ones and never as a
 * dialog".
 *
 * What was missing is the CHANNEL rather than the arithmetic. Those observations
 * reached a person through `script.summarize` and nothing else, so somebody
 * editing with the mouse — which is how a song is usually written — never learned
 * that pattern 3 was empty or that a channel was silent. This module is the part
 * of the channel that is arithmetic, and it is deliberately Phaser-free: what is
 * noticed, what is NEW since the last look, and what to say when there is room for
 * one line rather than a sentence.
 *
 * The two rules that shape it:
 *
 * - **Say it once.** A notice that is still true must not be announced again on
 *   every keystroke, or the channel becomes noise and gets ignored — the failure
 *   mode that makes advisory systems worthless. `noticesAdded` compares what is
 *   true now with what was true at the last look, so only a CHANGE speaks. A
 *   notice that stops being true and comes back speaks again, because that is a
 *   change too.
 * - **A headline has to fit.** A notice is written for a page and carries its own
 *   example ("... - turn one down, e.g. \"layer 3 3 gain 40\""), which is the half
 *   that makes it actionable and far too long for a toast that crosses the
 *   screen. `noticeHeadline` is the first sentence, which is the observation
 *   without the lesson; the lesson stays in the full text the toast shows when the
 *   notice is asked for by name.
 */
import type { Song } from './song';
import type { BounceRange } from './bounce';
import { advisoriesDetailed } from './script';

/**
 * Something noticed, and the one line of script that would answer it.
 *
 * `fix` is null for the observations with no mechanical answer — writing notes,
 * deciding which bar a section belongs in — because an app that guessed at those
 * would be editing the song on a hunch. Where it is a line, it is a line of the
 * SAME language the docs teach, which is what makes pressing it a lesson rather
 * than a magic button.
 */
export interface Notice {
  text: string;
  fix: string | null;
}

/**
 * Everything noticed about a song right now, newest-and-most-urgent first.
 *
 * The order is the model's own (`advisoriesFor` puts the loud ones before the
 * tidy ones) and it is kept rather than re-sorted, because the app shows the
 * first N of it: two things noticed must never show the tidier one.
 */
export function noticesFor(song: Song, bounce: BounceRange | null = null): Notice[] {
  return advisoriesDetailed(song, bounce);
}

/**
 * The notices that were not true at the last look.
 *
 * Both sides are plain text, so identity is the sentence itself: a notice whose
 * wording changes is a different notice, which is right — it is a different thing
 * being said — and a notice that stops being true leaves the current list and
 * will be new again if it returns.
 */
export function noticesAdded<T extends { text: string }>(seen: readonly string[], current: readonly T[]): T[] {
  return current.filter((notice) => !seen.includes(notice.text));
}

/**
 * The one-line form of a notice: the observation, without its example.
 *
 * The example is separated by `" - "` by every writer in `advisoriesFor`, and it
 * is dropped rather than truncated, because half an example ("turn one down, e.g.
 * \"layer 3") is worse than none. A notice with no example is returned whole.
 */
export function noticeHeadline(notice: string): string {
  const cut = notice.indexOf(' - ');
  const headline = cut === -1 ? notice : notice.slice(0, cut);
  return headline.trim();
}

/**
 * The form to SAY a notice in, given how many characters there are room for.
 *
 * The whole sentence when it fits — its example is the half that says what to DO
 * about it — and the headline when it does not, because a remark that runs off
 * the screen is worse than a short one.
 */
export function noticeToast(notice: string, chars: number): string {
  return notice.length <= chars ? notice : noticeHeadline(notice);
}

/**
 * The shortest distinctive part of a notice, for a line that has to be small.
 *
 * A headline can still be a sentence ("the song defines sections but its order is
 * not an arrangement of them"), which does not fit the inspector's column, so a
 * caller with 30 characters to spend asks for this instead: the leading noun
 * phrase, capped, with an ellipsis when it was cut. Cutting at a word boundary
 * matters here in a way it does not for a text box — "arrangement of the" reads
 * as a different sentence rather than as a short one.
 */
export function noticeTag(notice: string, width: number): string {
  const headline = noticeHeadline(notice);
  if (headline.length <= width) return headline;
  const cut = headline.slice(0, width - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}\u2026`;
}

/**
 * The notice to show at `index` of `count`, wrapping — the inspector's own
 * readout, so that clicking it walks the list rather than replacing it.
 *
 * The index is clamped rather than trusted: a click handler that counts up while
 * the list shrinks under it (an edit that removes a notice) would otherwise index
 * past the end, and a readout that says `NOTICED 4/3` is worse than one that
 * stays where it was.
 */
export function noticeAt<T>(notices: readonly T[], index: number): T | undefined {
  if (notices.length === 0) return undefined;
  const at = index % notices.length;
  return notices[at < 0 ? at + notices.length : at];
}

/** `2 / 3`, the position in the list, for the readout beside a notice. */
export function noticePosition(index: number, count: number): string {
  if (count <= 0) return '';
  const at = index % count;
  return `${(at < 0 ? at + count : at) + 1} / ${count}`;
}
