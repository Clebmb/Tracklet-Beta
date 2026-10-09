/**
 * mix — the one rule that decides which channels are HEARD.
 *
 * A channel's loudness is three flags fighting: its level, its mute, and whether
 * something else is soloed. Getting that wrong is not a cosmetic bug — it is the
 * difference between a song that plays and a song that is mysteriously quiet, so
 * the rule lives in exactly one function and everyone asks it:
 *
 *   • the audio engine, when it sets a channel's gain,
 *   • the channel list, when it dims a row,
 *   • the F5 mix menu, when it decides which boxes look "on".
 *
 * It is deliberately NOT a method on the engine. The engine is the one place
 * that cannot be unit tested here (there is no AudioContext in the test
 * environment), and a rule that only the engine knows is a rule that only the
 * engine's users can be wrong about. Phaser-free, dependency-light, and it
 * imports nothing but the level range from `song.ts`.
 */

import { clampLevel, MAX_LEVEL } from './song';

/**
 * True when anything at all is soloed, i.e. when the un-soloed channels are
 * being held quiet.
 *
 * A function rather than a stored flag because the answer must never be able to
 * disagree with the list it is about — a `soloing` boolean kept beside an array
 * of solos is one more thing to forget to update.
 */
export function soloing(solos: readonly boolean[]): boolean {
  return solos.some(Boolean);
}

/**
 * Whether a channel is heard at all.
 *
 * Two rules, in this order:
 *
 *  1. If ANYTHING is soloed, only the soloed channels are heard — and solo
 *     OVERRIDES that channel's own mute, because pressing solo on a muted
 *     channel is a person asking to hear it. A control that answers "I heard
 *     you, and you still cannot hear it" teaches nothing but distrust; the mute
 *     flag is left alone, so un-soloing puts the channel back exactly as it was.
 *
 *  2. With nothing soloed, a channel is heard unless it is muted.
 */
export function audible(
  index: number,
  mutes: readonly boolean[],
  solos: readonly boolean[],
): boolean {
  if (soloing(solos)) return solos[index] === true;
  return mutes[index] !== true;
}

/**
 * A channel's gain, 0..100, with mute, solo and its BUS already applied.
 *
 * `0` here means "silent", which is also what a level of 0 means, so a view that
 * only wants to know whether a channel makes a sound can ask this and not care
 * which of the four reasons it was.
 *
 * The bus arrives as a NUMBER rather than as a name, and as an optional argument,
 * both on purpose:
 *
 *   • a number, because the lookup from "which group is this channel on" to "how
 *     loud is that group" happens once, in `busLevelFor`, and a render loop should
 *     not be searching a list of names per note;
 *   • optional and FULL at rest, because a song with no buses then multiplies by
 *     100% — the identity — so every caller that has nothing to say about groups
 *     keeps the exact graph, and the exact bytes, it produced before buses existed.
 */
export function channelGain(
  index: number,
  levels: readonly number[],
  mutes: readonly boolean[],
  solos: readonly boolean[],
  busLevel: number = MAX_LEVEL,
): number {
  if (!audible(index, mutes, solos)) return 0;
  const own = clampLevel(levels[index] ?? MAX_LEVEL);
  // A group level that is not a number means "no group": falling back to FULL is
  // the one reading that cannot silence a channel by arithmetic accident, which is
  // the same reason `clampAutomationValue` refuses to answer with `NaN`.
  const group = Number.isFinite(busLevel) ? clampLevel(busLevel) : MAX_LEVEL;
  return clampLevel((own * group) / 100);
}

/**
 * The one-line summary a menu or a toast shows: which channels are soloed, by
 * name. Returns an empty string when nothing is, which is what makes it usable
 * as the "…and here is why it is quiet" suffix on any message.
 */
export function soloList(names: readonly string[], solos: readonly boolean[]): string {
  return names.filter((_, i) => solos[i] === true).join(' + ');
}
