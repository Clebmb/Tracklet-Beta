/**
 * bus — the mix's GROUPS: one fader over several channels.
 *
 * A fader per channel is the right control until a song has eight of them, at
 * which point balancing a drum kit means moving four faders and remembering where
 * they all were. A **bus** is a name for a group — `bus DRUMS 70` — and a channel
 * joins one by saying so: `track 1 bus DRUMS`. From then on the group has ONE
 * fader, and the kit moves together.
 *
 * ── What a bus is: a multiplier, not a node ─────────────────────────────────
 *
 * The whole feature lives in `channelGain` (see `model/mix.ts`) as one extra
 * multiplication: a channel's gain is its own level times its bus's level. That is
 * not laziness, it is the arithmetic being exact — channels sum linearly into the
 * band, so fading a group by 70% IS scaling each of its members by 0.7, sample for
 * sample. Two consequences worth stating because they are the reasons to do it
 * this way rather than with a summing bus in the graph:
 *
 *   • **It is inert.** A song with no buses multiplies every channel by 100%,
 *     which is the identity, so the graph is byte-for-byte the graph this app
 *     built before buses existed, and every golden hash agrees.
 *   • **The sends move with it.** A channel's reverb and echo are taps on its own
 *     signal, so a group fader that multiplied a summing node downstream of those
 *     taps would turn the kit down and leave its tails ringing in the hall. Here
 *     the group fader is part of each channel's gain, which is upstream of every
 *     tap — pull DRUMS down and the drums, and only the drums, get quieter
 *     everywhere, including in the room.
 *
 * ── What a bus is not ───────────────────────────────────────────────────────
 *
 * It has one knob. Not a mute (a channel's own mute is still the way to silence a
 * channel, and soloing is still about auditioning), not an effect chain, not a
 * send — those are a DAW's group, and the roadmap says so out loud. A bus is a
 * FADER, which is what "one fader for a kit" asks for.
 *
 * A name is ONE WORD, upper-cased, the same rule a section name follows, because a
 * track line reads as a sentence (`track 3 bus DRUMS`) and a name with a space in
 * it would need quoting inside one. `NONE` is reserved: it is how a channel is
 * taken back off a bus, so it cannot also be the name of one.
 *
 * Phaser-free and audio-free like the rest of `model/`.
 */

import { DEFAULT_LEVEL, MAX_TRACKS, clampLevel } from './song';

/**
 * How many buses a song may define.
 *
 * Four, and the number is derived rather than chosen: this app has at most
 * `MAX_TRACKS` channels, and a group of ONE channel is just that channel's fader —
 * so the most groups that can each hold at least two channels is half of them.
 * Eight faders and four group faders is a mixing desk; eight of each is a
 * spreadsheet, which is the thing buses exist to prevent.
 */
export const MAX_BUSES = MAX_TRACKS / 2;

/** How long a bus name may be, in characters: the same budget a section gets. */
export const MAX_BUS_NAME = 12;

/**
 * The word that takes a channel back off a bus: `track 3 bus none`.
 *
 * A word rather than an empty value, because a track line is a list of `setting
 * value` pairs and a missing value would swallow the next setting. Reserved at
 * declaration time, so a bus can never be called this and a line that says it
 * always means exactly one thing.
 */
export const NO_BUS_WORD = 'none';

/** The characters a name may be made of: one word, no spaces. */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * One named group fader.
 *
 * Plain data, like every other part of a song: the file writes it, the undo stack
 * clones it, and none of that needs a class.
 */
export interface Bus {
  /** The name, as written and as a track line joins it: upper case, one word. */
  name: string;
  /** The group's fader, 0..100: what every channel on it is multiplied by. */
  level: number;
}

/** Upper-case a name and cut it to the budget: how a reader repairs one. */
export function tidyBusName(text: string): string {
  return text.trim().toUpperCase().slice(0, MAX_BUS_NAME);
}

/**
 * Why a name cannot be used, in the words the parser prints, or `null`.
 *
 * A REFUSAL rather than a repair, like a section's name and for the same reason
 * one scope down: the name is how a channel refers to its group, so silently
 * rewriting `MY DRUMS` into `MYDRUMS` would leave the line that joined it
 * pointing at nothing.
 */
export function busNameProblem(text: string): string | null {
  const name = text.trim();
  if (name === '') return 'a bus needs a name, e.g. "bus DRUMS 70".';
  if (name.toUpperCase() === NO_BUS_WORD.toUpperCase()) {
    return `"${NO_BUS_WORD}" is the word that takes a channel OFF a bus, so it cannot be a bus's name; call it something else, e.g. "bus DRUMS 70".`;
  }
  if (!NAME_PATTERN.test(name)) {
    return `a bus name is one word of letters, digits, "-" or "_" — no spaces — so a track line can name it; got "${name}". Try "bus ${tidyBusName(name.replace(/[^A-Za-z0-9_-]+/g, '')) || 'DRUMS'} 70".`;
  }
  if (name.length > MAX_BUS_NAME) {
    return `a bus name may be at most ${MAX_BUS_NAME} characters; "${name}" is ${name.length}. Shorten it.`;
  }
  return null;
}

/** True when two names are the same bus, however each was typed. */
export function sameBusName(a: string, b: string): boolean {
  return tidyBusName(a) === tidyBusName(b);
}

/** The fader a bus may have, cleaned: a whole percentage of full level. */
export function clampBusLevel(level: number): number {
  return clampLevel(level);
}

/** One bus with every field inside the range its own table allows. */
export function tidyBus(bus: Bus): Bus {
  return { name: tidyBusName(bus.name), level: clampBusLevel(bus.level) };
}

/** A copy of the whole list, tidied — what the file reader runs a song through. */
export function tidyBuses(buses: readonly Bus[]): Bus[] {
  const out: Bus[] = [];
  for (const bus of buses) {
    const tidied = tidyBus(bus);
    if (tidied.name === '') continue;
    const at = out.findIndex((one) => one.name === tidied.name);
    if (at >= 0) out[at] = tidied;
    else out.push(tidied);
  }
  return out.slice(0, MAX_BUSES);
}

/**
 * Add or REPLACE a bus by name, keeping the list in the order it was built.
 *
 * The same bargain the sections and the lanes make: a script is read top to
 * bottom, so the last line about a name is the one that counts — which is what
 * makes `bus DRUMS 70` then `bus DRUMS 55` mean "the drums are at 55 now".
 */
export function withBus(buses: readonly Bus[], bus: Bus): Bus[] {
  const tidied = tidyBus(bus);
  const at = buses.findIndex((one) => one.name === tidied.name);
  if (at >= 0) {
    const next = buses.slice();
    next[at] = tidied;
    return next;
  }
  return [...buses, tidied].slice(0, MAX_BUSES);
}

/** Drop a bus by name. The channels that named it fall back to the band. */
export function withoutBus(buses: readonly Bus[], name: string): Bus[] {
  return buses.filter((one) => !sameBusName(one.name, name));
}

/** Look one up by name, however it was typed. `null` when the song has none. */
export function busByName(buses: readonly Bus[], name: string): Bus | null {
  const wanted = tidyBusName(name);
  return buses.find((one) => one.name === wanted) ?? null;
}

/** Every bus name, in the order they were declared. */
export function busNames(buses: readonly Bus[]): string[] {
  return buses.map((bus) => bus.name);
}

/**
 * The level a channel plays at because of its bus: its group's fader, or full.
 *
 * The ONE reading of "which bus is this channel on" — the engine, the renderer and
 * anything that shows a channel's gain all come through here, so a name cannot
 * mean one thing when the sound is made and another when a screen draws it. A
 * channel with no bus, or one naming a bus the song does not have, plays at
 * `DEFAULT_LEVEL`: as loud as its own fader says, which is what every channel did
 * before buses existed.
 */
export function busLevelFor(buses: readonly Bus[], name: string | null | undefined): number {
  if (name === null || name === undefined) return DEFAULT_LEVEL;
  const bus = busByName(buses, name);
  return bus ? bus.level : DEFAULT_LEVEL;
}

/**
 * Every channel's bus level, resolved once, in channel order.
 *
 * What the engine and the renderer both ask for, because both need the same thing
 * per channel and neither should be looking a name up inside a render loop.
 */
export function channelBusLevels(
  buses: readonly Bus[],
  tracks: readonly { bus: string | null }[],
): number[] {
  return tracks.map((track) => busLevelFor(buses, track.bus));
}

/** Whether two buses say the same thing, for a menu or a test. */
export function sameBus(a: Bus, b: Bus): boolean {
  return a.name === b.name && a.level === b.level;
}

/** How a menu shows one: `DRUMS 70`. */
export function busLabel(bus: Bus): string {
  return `${tidyBusName(bus.name)} ${clampBusLevel(bus.level)}`;
}

/** The line that writes it, so a consumer can show one without composing it. */
export function busScript(bus: Bus): string {
  return `bus ${tidyBusName(bus.name)} ${clampBusLevel(bus.level)}`;
}

/** Every bus as the script writer writes them: one line each, in order. */
export function busesToScript(buses: readonly Bus[]): string {
  return tidyBuses(buses).map(busScript).join('\n');
}

/**
 * The channels ON a bus, as 1-based channel numbers, in channel order.
 *
 * Derived rather than stored: a channel naming its group is the only place the
 * membership is written, so a list kept beside it could only ever disagree.
 */
export function channelsOfBus(
  tracks: readonly { bus: string | null }[],
  name: string,
): number[] {
  const wanted = tidyBusName(name);
  const out: number[] = [];
  tracks.forEach((track, i) => {
    if (track.bus !== null && sameBusName(track.bus, wanted)) out.push(i + 1);
  });
  return out;
}
