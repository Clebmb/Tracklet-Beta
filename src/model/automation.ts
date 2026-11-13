/**
 * automation — a knob that moves over bars.
 *
 * Everything else in this app is a VALUE: a channel's `bright` is 40 until
 * somebody changes it, and a song written at one setting plays at that setting
 * from beginning to end. A **lane** is the other kind of statement — "from bar 8
 * to bar 15 this channel walks from 15 to 95" — and it is the difference between
 * a loop and a record: the riser before a drop, the filter opening across a
 * build, the fade at the end, the pad that gets thicker as the chorus arrives.
 * None of those are notes, which is why no amount of pattern editing can write
 * them.
 *
 * ── The shape: a target, two ends, and a bar range ───────────────────────────
 *
 * ```
 * automate 2 bright 15 95 bars 8 to 15
 * ```
 *
 * A lane names a CHANNEL, one thing to move, where the value starts, where it
 * ends, and which bars it spans. Bars are slots of the `order`, 1-based, the
 * same number `order` and `tempo … at BAR` use — so a lane can be read against
 * the song's own form rather than against a step number nobody counts in.
 *
 * ── How a lane is read ───────────────────────────────────────────────────────
 *
 * • The lane's first step plays `from` and its last step plays `to` — a straight
 *   line between them, in the value, evenly across the lane's steps. A one-step
 *   lane is a SET rather than a walk (there is nowhere to walk).
 * • After its last step the lane HOLDS `to`. This is the rule that makes a lane
 *   useful rather than a detour: `bright 15 95 bars 8 to 15` means the drop at
 *   bar 16 is the bright one, not a snap back to whatever the channel was set
 *   to. A fade to `level 0` stays faded.
 * • Before the first step of the first lane, and on every channel that has no
 *   lane, the value is the channel's own — which is what makes a song with no
 *   lanes play exactly as it always did.
 * • Two lanes on one channel and one target compose: the later lane takes over
 *   where it starts, so a rise and then a fall are two lanes, and the last one
 *   written wins where they overlap.
 *
 * ── What a lane may move, and what it may not ────────────────────────────────
 *
 * The nine voice knobs (so a lane shapes the channel's VOICE — layer 1 — and
 * leaves the layers stacked above it alone), the channel's `level`, its `gate`
 * (note length), and its `drift` (how far the pitch wanders). Those four kinds
 * cover every rise, fall, sweep, thinning and tiring that music asks for by
 * name, and each is one line of arithmetic in the two consumers.
 *
 * And a plugin instrument's knobs, spelled `param.<knob>` — `automate 2
 * param.cutoff 20 90 bars 8 to 15` turns `cutoff` on channel 2 across those
 * bars. The knobs are the plugin's, so no fixed table lists them: any lowercase
 * word the manifest would accept as a param id is a target, walked 0..100 and
 * coerced against the real range when the note plays. A lane moves only the
 * knob it names over the channel's own values, which stay the song's.
 *
 * `drift` is why this list is not only knobs and levels: it is a channel VALUE
 * that a note reads when it is built (`model/drift.ts`), not an effect node, so a
 * curve can move it exactly the way it moves `gate`. The wobble it names is the
 * same one the `tape` effect carries, pulled out where a lane can reach it.
 *
 * It deliberately does NOT move the effects, `pan`, the two sends or a
 * layer's own fields. Not because they are uninteresting — automating `punch`
 * over a verse is a real trick — but because each of them is a NODE, and a node
 * that is built only when its amount is above zero cannot be faded in from
 * nothing by a curve that starts at nothing: the graph would have to be rebuilt
 * mid-bar. That is a later, larger piece of work than a value that already
 * exists everywhere. The refusal says so, so nobody has to discover it.
 *
 * Phaser-free and audio-free like the rest of `model/`.
 */

import {
  MAX_EFFECT,
  MAX_LEVEL,
  MAX_ORDER,
  MAX_PLUGIN_PARAM_VALUE,
  MIN_EFFECT,
  MIN_LEVEL,
  MIN_PLUGIN_PARAM_VALUE,
  clampLevel,
  clampTempoSlot,
} from './song';
import { MIN_PARAM, MAX_PARAM, VOICE_PARAMS, clampParam, type VoiceParamId, type VoiceParams } from './voice';
import { DRIFT_MAX, DRIFT_MIN, clampDrift } from './drift';
import { MAX_PLUGIN_PARAM_ID } from '../plugins/manifest';
import type { PluginParamValues } from '../plugins/instrument';

/**
 * Which part of a channel a lane's value lands on.
 *
 * The distinction is not cosmetic: it is exactly the list of places the two
 * consumers have to apply the number, and it is why the refusal for anything
 * else can be specific.
 */
export type AutomationScope = 'voice' | 'channel' | 'note';

/** One thing a lane can move: its range, both named ends, and what it is for. */
export interface AutomationTargetInfo {
  id: AutomationTargetId;
  /** How a menu or a message writes it. Upper case, like every menu label here. */
  label: string;
  /** Where the value lands. See `AutomationScope`. */
  scope: AutomationScope;
  min: number;
  max: number;
  /** What the bottom of the range means, in one word. */
  low: string;
  /** What the top means. */
  high: string;
  /** One line, in the same voice as a voice's or an effect's blurb. */
  blurb: string;
  /**
   * What a composer reaches for this lane FOR.
   *
   * The other half of the same answer, and in the model rather than in a chapter
   * of the docs for the reason the effects' `reach` is: "what would I automate
   * this FOR" is the question someone who has never drawn a curve is asking, and
   * a named piece of a song is the shortest honest answer.
   */
  reach: string;
}

/** The things a lane can move. See `AUTOMATION_TARGETS`. */
export type AutomationTargetId = VoiceParamId | 'level' | 'gate' | 'drift' | `param.${string}`;

/** The prefix a lane puts on a plugin knob: `param.cutoff` moves `cutoff`. */
export const PLUGIN_PARAM_TARGET_PREFIX = 'param.';

/**
 * The knob a lane target moves, or `null` when it moves no knob.
 *
 * The same shape the manifest demands of a param id — a lowercase word
 * starting with a letter — so a lane cannot spell a knob no manifest could
 * declare. The manifest itself is NOT consulted: which code a knob belongs to
 * is the app's business, and a lane for a knob this machine's manifest lacks
 * still loads (and still saves back), moving nothing until the code arrives.
 */
export function pluginParamTargetKnob(target: string): string | null {
  if (!target.startsWith(PLUGIN_PARAM_TARGET_PREFIX)) return null;
  const knob = target.slice(PLUGIN_PARAM_TARGET_PREFIX.length);
  if (knob.length === 0 || knob.length > MAX_PLUGIN_PARAM_ID) return null;
  return /^[a-z][a-z0-9_]*$/.test(knob) ? knob : null;
}

/**
 * What each of the nine VOICE knobs is worth a lane for.
 *
 * The label, the two named ends and the blurb come from `VOICE_PARAMS` — the same
 * table `F4`, the catalog and the script's own messages read — so a lane cannot
 * describe a knob differently from the menu that shows it. Only the musical
 * purpose is authored here, because nothing else in the app has an opinion about
 * *when* in a song a knob is worth moving.
 */
const VOICE_REACH: Readonly<Record<VoiceParamId, string>> = {
  bright: 'the filter opening across a build: eight bars of rising brightness into the drop',
  sweep: 'a riser that sweeps the filter open, or an ambient pad that breathes over a section',
  duty: 'a pulse width walking under a lead line, which is the sound of a classic chip arpeggio',
  noise: 'a drum sound gathering hiss as a section gets more frantic, or a texture dissolving into it',
  attack: 'a pad arriving from nothing, or a pluck becoming a swell as the chorus comes',
  decay: 'a hit tightening through a drum fill, or a bell ringing longer as a section opens up',
  ring: 'a sustaining part drifting from staccato to held without rewriting a single note',
  release: 'a note that tails away further as a section empties out',
  thick: 'a pad fattening as a chorus approaches, which is the cheapest build there is',
};

/** The two targets that are not one of the nine knobs. */
const EXTRA_TARGETS: readonly AutomationTargetInfo[] = [
  {
    id: 'level',
    label: 'LEVEL',
    scope: 'channel',
    min: MIN_LEVEL,
    max: MAX_LEVEL,
    low: 'silent',
    high: 'full',
    blurb: 'how loud the channel sits in the mix, moved over bars',
    reach: 'a fade-in, a fade-out, a verse that lifts into a chorus, or a part that steps back under a lead',
  },
  {
    id: 'gate',
    label: 'GATE',
    scope: 'note',
    min: MIN_EFFECT,
    max: MAX_EFFECT,
    low: 'open',
    high: 'tight',
    blurb: 'how much of each note on the channel is heard, moved over bars',
    reach: 'a section that tightens: staccato strings into a stab, a bass that shortens as the drums double up',
  },
  {
    id: 'drift',
    label: 'DRIFT',
    scope: 'channel',
    min: DRIFT_MIN,
    max: DRIFT_MAX,
    low: 'steady',
    high: 'wandering',
    blurb: 'how far the channel\'s transport wobbles — a slow wow and a fast flutter on every note, moved over bars',
    reach: 'a tape that tires: a wobble that deepens across a section, or a worn intro that tightens into the chorus',
  },
];

/**
 * Every target a lane may move, in the order a person would look for them.
 *
 * Built from the model's own tables rather than written out, so a tenth voice
 * knob would be automatable, listed and documented the day it lands — the refusal
 * for an unknown word reads this list, and so does the capability manifest.
 */
export const AUTOMATION_TARGETS: readonly AutomationTargetInfo[] = [
  ...VOICE_PARAMS.map((param) => ({
    id: param.id as AutomationTargetId,
    label: param.label,
    scope: 'voice' as const,
    min: MIN_PARAM,
    max: MAX_PARAM,
    low: param.low,
    high: param.high,
    blurb: param.blurb,
    reach: VOICE_REACH[param.id],
  })),
  ...EXTRA_TARGETS,
];

/** Look one up by id, for the parser, the menus and a file reader. */
export const AUTOMATION_TARGET_BY_ID: Readonly<Record<AutomationTargetId, AutomationTargetInfo>> =
  Object.fromEntries(AUTOMATION_TARGETS.map((target) => [target.id, target])) as
    Record<AutomationTargetId, AutomationTargetInfo>;

/** The target words, as one sentence reads them: `bright, sweep, duty, ...`. */
export const AUTOMATION_TARGET_WORDS: readonly string[] = AUTOMATION_TARGETS.map((target) => target.id);

/** Whether a word names something a lane can move. */
export function isAutomationTarget(word: string): word is AutomationTargetId {
  if (Object.prototype.hasOwnProperty.call(AUTOMATION_TARGET_BY_ID, word)) return true;
  // And a plugin knob, spelled `param.<knob>`: the knobs are the plugin's, so
  // no fixed table can list them, and the shape check above is the whole gate.
  return pluginParamTargetKnob(word) !== null;
}

/**
 * As many lanes as a song may have.
 *
 * The same reason as `MAX_TEMPO_POINTS`: a limit is what stops a runaway
 * generator from writing a file that takes a second to open, and it is small
 * enough that reading a lane per note is free.
 *
 * It doubled with `MAX_ORDER`: thirty-two lanes was two per channel on a short
 * song, and a song long enough to need 256 bars is long enough for a riser, a
 * fade and a filter move on every part at once. The ARRANGER's lane list
 * already scrolls, so the extra lanes cost it nothing.
 */
export const MAX_AUTOMATION_LANES = 64;

/**
 * What a lane counts its range in.
 *
 * `bars` is the clock every lane had first: a slot of the `order`, so a riser
 * spans bars 8 to 15 of the SONG. `note` is the other one, and it is the smaller
 * and older clock in music: steps since each HIT on the channel — so the same
 * lane is an envelope every note on that channel plays, whatever bar it lands in.
 * A sixteen-note bassline gets one sweep per note instead of one per section.
 */
export type AutomationClock = 'bars' | 'note';

/**
 * One value moving over a range — of bars, or of steps since a hit.
 *
 * Plain data, like every other part of a song: it is written to a file, cloned by
 * the undo stack and compared by a test, and none of that needs a class.
 */
export interface AutomationLane {
  /** The channel, 1-based, the way every statement and every menu counts them. */
  track: number;
  target: AutomationTargetId;
  /** The value on the lane's first step. */
  from: number;
  /** The value on its last step, held afterwards. */
  to: number;
  /**
   * Where the lane starts: a bar of the `order` on the bars clock (1-based), or a
   * STEP SINCE THE HIT on the note clock (0 being the hit itself).
   *
   * One field for two clocks rather than two pairs of numbers, because it is one
   * idea — where the walk begins — and a second pair would have to be kept empty
   * on every lane of the other clock. Which one a lane means is `clock`.
   */
  startBar: number;
  /** Where it ends, inclusive, in the same unit as `startBar`. */
  endBar: number;
  /**
   * Which clock the two numbers above are counted in. Absent means `bars`, so a
   * lane written before this existed — in a test, in a fixture, in a file from
   * last week — reads exactly as it always did.
   */
  clock?: AutomationClock;
}

/** How many steps after a hit a note-clock lane may reach. */
export const MAX_NOTE_CLOCK_STEPS = 64;

/** The clock a lane reads on, with the old default filled in. */
export function laneClock(lane: AutomationLane): AutomationClock {
  return lane.clock === 'note' ? 'note' : 'bars';
}

/**
 * Whether a target can ride the note clock.
 *
 * Only `level`, and that is a fact about the two consumers rather than a
 * preference: the app re-writes a channel's level on EVERY step (that is how a
 * fade keeps moving through bars where nothing plays), so a lane counted from the
 * hit has somewhere to land on every step of the note. A knob is read when the
 * note is BUILT — one value, at the moment of the hit — so a per-note sweep of
 * `bright` needs the scheduler to ramp a parameter inside a note, which is the
 * next piece of work and not something to pretend to.
 */
export function supportsNoteClock(target: AutomationTargetId): boolean {
  // `bright` is the second, and it is the same fact in a different place: the two
  // consumers hand the note builder a curve of the lane's points, and the builder
  // schedules them across the note's own filter — a cutoff is one number a filter
  // node will take at any moment, which is the whole requirement. A knob that
  // changes the SHAPE of the sound (its wave, its noise mix) cannot be faded that
  // way, and a gate cannot either: it is how long the note is, decided once.
  return target === 'level' || target === 'bright';
}

/**
 * The points a note-clock lane puts on a target, or null when none moves it.
 *
 * Read as "where the value is N steps after the hit", for the note builder to
 * schedule across the note. The range is the lane's own: it walks to `to` on its
 * last step and holds it, which is exactly the walk `laneValueAt` describes step
 * by step — so a curve and a per-step read of the same lane cannot disagree.
 */
export function noteClockCurve(
  lanes: readonly AutomationLane[],
  track: number,
  target: AutomationTargetId,
): { step: number; value: number }[] | null {
  const noteLanes = lanes.filter((lane) =>
    lane.track === track && lane.target === target && laneClock(lane) === 'note');
  if (noteLanes.length === 0) return null;
  let last = 0;
  for (const lane of noteLanes) last = Math.max(last, clampNoteClockStep(lane.endBar));
  const points: { step: number; value: number }[] = [];
  for (let step = 0; step <= last; step++) {
    const value = automatedValue(noteLanes, track, target, 0, 1, step);
    if (value !== null) points.push({ step, value });
  }
  return points.length > 0 ? points : null;
}

/** A step since a hit, clamped into what a note-clock lane can address. */
export function clampNoteClockStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(MAX_NOTE_CLOCK_STEPS, Math.round(step)));
}

/** Clamp a bar into the range an arrangement can have. Same range as `order`. */
export function clampAutomationBar(bar: number): number {
  return clampTempoSlot(bar);
}

/**
 * What a target offers: its table row, or the synthetic row for a plugin knob.
 *
 * A knob's range is the envelope every manifest range sits inside — 0..100 —
 * because the lane cannot see the manifest the knob belongs to. The engine
 * coerces the walked value against the real range when the note plays, so a
 * lane that overshoots a knob's own max still lands on something musical.
 */
export function automationTargetInfo(target: string): AutomationTargetInfo | null {
  const known = (AUTOMATION_TARGET_BY_ID as Readonly<Record<string, AutomationTargetInfo>>)[target];
  if (known) return known;
  const knob = pluginParamTargetKnob(target);
  if (knob === null) return null;
  return {
    id: target as AutomationTargetId,
    label: `PARAM ${knob.toUpperCase()}`,
    scope: 'note',
    min: MIN_PLUGIN_PARAM_VALUE,
    max: MAX_PLUGIN_PARAM_VALUE,
    low: 'minimum',
    high: 'maximum',
    blurb: `how far the plugin's ${knob} knob turns, moved over bars`,
    reach: 'a filter opening under a build, a detune widening into a chorus, or any knob the song should turn by itself',
  };
}

/** Clamp a value into the range its target offers. */
export function clampAutomationValue(target: AutomationTargetId, value: number): number {
  const info = automationTargetInfo(target);
  if (!info) return MIN_PARAM;
  // A number it cannot read goes to the safe end of ITS OWN range, before any
  // arithmetic: `Math.round(NaN)` is `NaN`, and a `NaN` that reached a gain would
  // silence a channel for the rest of the song rather than leaving it alone.
  if (!Number.isFinite(value)) return info.min;
  if (info.scope === 'voice') return clampParam(value);
  if (info.scope === 'channel') return clampLevel(value);
  return Math.round(Math.max(info.min, Math.min(info.max, value)));
}

/** Clamp a channel number into the range a song can have. */
export function clampAutomationTrack(track: number, channels: number): number {
  if (!Number.isFinite(track)) return 1;
  const most = Math.max(1, Math.round(channels));
  return Math.max(1, Math.min(most, Math.round(track)));
}

/** One lane, with every field inside the range its own tables allow. */
export function tidyLane(lane: AutomationLane): AutomationLane {
  const target = isAutomationTarget(lane.target) ? lane.target : 'bright';
  // A clock the target cannot ride falls back to bars rather than being kept and
  // quietly ignored: a lane that claims a clock nothing reads is a lane that lies
  // about itself in a file.
  const note = laneClock(lane) === 'note' && supportsNoteClock(target);
  const startBar = note ? clampNoteClockStep(lane.startBar) : clampAutomationBar(lane.startBar);
  const endBar = note
    ? Math.max(startBar, clampNoteClockStep(lane.endBar))
    : Math.max(startBar, clampAutomationBar(lane.endBar));
  const tidied: AutomationLane = {
    track: clampAutomationTrack(lane.track, MAX_ORDER),
    target,
    from: clampAutomationValue(target, lane.from),
    to: clampAutomationValue(target, lane.to),
    startBar,
    endBar,
  };
  if (note) tidied.clock = 'note';
  return tidied;
}

/**
 * The lanes in reading order: by the bar they start on, then as written.
 *
 * A stable sort, because list order is what decides which lane wins where two
 * overlap — a `rise then fall` pair is exactly two lanes crossing in the middle
 * of a song, and reordering them would silently reverse the music.
 */
export function sortAutomationLanes(lanes: readonly AutomationLane[]): AutomationLane[] {
  return lanes
    .map((lane) => tidyLane(lane))
    .map((lane, index) => ({ lane, index }))
    .sort((a, b) => a.lane.startBar - b.lane.startBar || a.index - b.index)
    .map((entry) => entry.lane);
}

/** Add a lane, keeping the list in reading order. */
export function withAutomationLane(
  lanes: readonly AutomationLane[],
  lane: AutomationLane,
): AutomationLane[] {
  return sortAutomationLanes([...lanes.slice(0, MAX_AUTOMATION_LANES - 1), lane]);
}

/** Drop the lane at an index, for a menu that offers a delete. */
export function withoutAutomationLane(lanes: readonly AutomationLane[], index: number): AutomationLane[] {
  return lanes.filter((_lane, at) => at !== index);
}

/** The lanes that move one channel and one target, in reading order. */
export function lanesFor(
  lanes: readonly AutomationLane[],
  track: number,
  target: AutomationTargetId,
): AutomationLane[] {
  return lanes.filter((lane) => lane.track === track && lane.target === target);
}

/**
 * What one lane says at a step of the order, or `null` when it is not in force.
 *
 * The rule in full is in this module's header; the short version is that a lane
 * owns every step from its first to the end of the song, walking to `to` and then
 * holding it. The bar arithmetic is the same one `tempoMapBpm` does: a bar is one
 * pattern, so a step's position inside the arrangement is `step / stepsPerBar`.
 */
export function laneValueAt(
  lane: AutomationLane,
  step: number,
  stepsPerBar: number,
  sinceHit: number | null = null,
): number | null {
  const target = lane.target;
  // The note clock: `step` is steps SINCE THE HIT and the bar length is irrelevant,
  // because a note's own length has nothing to do with the song's meter. A caller
  // that has no hit to count from (a lane read for a knob, an audition) gets null,
  // which is "nothing to say" rather than "zero".
  if (laneClock(lane) === 'note') {
    if (sinceHit === null || !Number.isFinite(sinceHit)) return null;
    const first = clampNoteClockStep(lane.startBar);
    if (sinceHit < first) return null;
    const span = Math.max(1, clampNoteClockStep(lane.endBar) - first + 1);
    const from = clampAutomationValue(target, lane.from);
    const to = clampAutomationValue(target, lane.to);
    if (span <= 1) return to;
    const t = Math.min(1, (sinceHit - first) / (span - 1));
    return clampAutomationValue(target, from + (to - from) * t);
  }
  const perBar = Math.max(1, Math.round(stepsPerBar));
  const first = (clampAutomationBar(lane.startBar) - 1) * perBar;
  if (step < first) return null;
  const lastBar = Math.max(clampAutomationBar(lane.startBar), clampAutomationBar(lane.endBar));
  // How many steps the lane WALKS: the bars it spans. The value on its last step
  // is `to` and stays there, so a one-step lane — a lane inside a one-step bar —
  // is a set rather than a walk.
  const span = (lastBar - clampAutomationBar(lane.startBar) + 1) * perBar;
  const from = clampAutomationValue(target, lane.from);
  const to = clampAutomationValue(target, lane.to);
  if (span <= 1) return to;
  const t = Math.min(1, (step - first) / (span - 1));
  return clampAutomationValue(target, from + (to - from) * t);
}

/**
 * What a channel's `target` is at a step, or `null` when no lane moves it there.
 *
 * `null` is not "zero": it means *nothing to say*, and every consumer falls back
 * to the channel's own setting — which is what keeps a song with no lanes, and
 * the bars before the first one, exactly as they were. The last lane in force
 * wins, which is how two lanes on one channel compose.
 */
export function automatedValue(
  lanes: readonly AutomationLane[],
  track: number,
  target: AutomationTargetId,
  step: number,
  stepsPerBar: number,
  /** Steps since the channel's last hit, for a note-clock lane. Null when it has
   * played nothing yet, which leaves such a lane silent until the first note. */
  sinceHit: number | null = null,
): number | null {
  if (lanes.length === 0) return null;
  let value: number | null = null;
  for (const lane of lanes) {
    if (lane.track !== track || lane.target !== target) continue;
    const at = laneValueAt(lane, step, stepsPerBar, sinceHit);
    if (at !== null) value = at;
  }
  return value;
}

/**
 * A channel's whole voice at a step, with every voice lane applied.
 *
 * The voice rather than the patch, because a lane moves the channel's VOICE —
 * which is layer 1 — and the layers stacked above it keep their own settings.
 * Handed back as a fresh object only when something actually moved, so the two
 * consumers can compare against `undefined` and leave the common case alone.
 */
export function automatedVoice(
  voice: VoiceParams,
  lanes: readonly AutomationLane[],
  track: number,
  step: number,
  stepsPerBar: number,
): VoiceParams | null {
  if (lanes.length === 0) return null;
  let out: VoiceParams | null = null;
  for (const target of AUTOMATION_TARGETS) {
    if (target.scope !== 'voice') continue;
    const value = automatedValue(lanes, track, target.id, step, stepsPerBar);
    if (value === null || value === voice[target.id as VoiceParamId]) continue;
    out = out ?? { ...voice };
    out[target.id as VoiceParamId] = value;
  }
  return out;
}

/**
 * A channel's level at a step, in the song's own unit, or `null`.
 *
 * A one-line wrapper, and it exists so the two consumers read the same sentence:
 * "the level is the channel's unless a lane says otherwise".
 */
export function automatedLevel(
  lanes: readonly AutomationLane[],
  track: number,
  level: number,
  step: number,
  stepsPerBar: number,
  sinceHit: number | null = null,
): number | null {
  const value = automatedValue(lanes, track, 'level', step, stepsPerBar, sinceHit);
  return value === null || value === clampLevel(level) ? null : value;
}

/** A channel's gate at a step, or `null` when no lane moves it. */
export function automatedGate(
  lanes: readonly AutomationLane[],
  track: number,
  gate: number,
  step: number,
  stepsPerBar: number,
): number | null {
  const value = automatedValue(lanes, track, 'gate', step, stepsPerBar);
  if (value === null) return null;
  return value === Math.max(MIN_EFFECT, Math.min(MAX_EFFECT, Math.round(gate))) ? null : value;
}

/** A channel's drift at a step, or `null` when no lane moves it. */
export function automatedDrift(
  lanes: readonly AutomationLane[],
  track: number,
  drift: number,
  step: number,
  stepsPerBar: number,
): number | null {
  const value = automatedValue(lanes, track, 'drift', step, stepsPerBar);
  if (value === null) return null;
  return value === clampDrift(drift) ? null : value;
}

/** True when at least one lane moves a channel's VOICE, i.e. when a patch varies. */
export function automatesVoice(lanes: readonly AutomationLane[]): boolean {
  return lanes.some((lane) => AUTOMATION_TARGET_BY_ID[lane.target]?.scope === 'voice');
}

/** Whether two lanes say the same thing, for a menu or a test comparing lists. */
export function sameLane(a: AutomationLane, b: AutomationLane): boolean {
  return a.track === b.track
    && a.target === b.target
    && a.from === b.from
    && a.to === b.to
    && laneClock(a) === laneClock(b)
    && a.startBar === b.startBar
    && a.endBar === b.endBar;
}

/**
 * How a menu writes one lane: `CH 2 BRIGHT 15 -> 95 · BARS 8-15`.
 *
 * Upper case and short, like every other label in this app, and it names the
 * channel because a list of lanes is read against a song rather than against the
 * channel you happen to have selected.
 */
export function laneLabel(lane: AutomationLane): string {
  const info = automationTargetInfo(lane.target);
  // The range says which clock it is: STEPS for a lane counted from each hit,
  // BARS for one counted across the song. A label that always said BARS would be
  // a menu lying about a lane it is showing.
  const note = laneClock(lane) === 'note';
  const span = lane.startBar === lane.endBar
    ? `${note ? 'STEP' : 'BAR'} ${lane.startBar}`
    : `${note ? 'STEPS' : 'BARS'} ${lane.startBar}-${lane.endBar}`;
  return `CH ${lane.track} ${info?.label ?? lane.target} ${lane.from} -> ${lane.to} · ${span}`;
}

/**
 * How the app writes one lane as a script line, so a song can save and reopen.
 *
 * The clock word is part of the sentence: a note-clock lane written as `bars`
 * would reopen as a bar lane, which is the one thing a save must never do —
 * quietly changing what a lane means.
 */
export function laneScript(lane: AutomationLane): string {
  const clock = laneClock(lane) === 'note' ? 'note' : 'bars';
  return `automate ${lane.track} ${lane.target} ${lane.from} ${lane.to} ${clock} ${lane.startBar} to ${lane.endBar}`;
}

/**
 * The lanes as one script block, or an empty string when there are none.
 *
 * The same shape as the track lines the writer builds: nothing at all when there
 * is nothing to say, which is what keeps a song with no lanes byte-identical to
 * the script it has always saved.
 */
export function lanesToScript(lanes: readonly AutomationLane[]): string {
  return sortAutomationLanes(lanes).map((lane) => laneScript(lane)).join('\n');
}

/**
 * A channel's plugin knob values at a step, with every `param.<knob>` lane applied.
 *
 * The base plus the lanes' Overrides: a lane moves only the knob it names, so
 * two lanes on two knobs compose and a lane on one knob leaves every other at
 * the channel's own setting. Handed back as a fresh object only when something
 * actually moved, so the two consumers can compare against `null` and leave
 * the common case — no lanes, or no lane on a knob — exactly alone.
 *
 * `null` base is read as "no overrides": the lanes still walk, from nothing,
 * and the engine coerces the result against the manifest when the note plays.
 * A knob no manifest declares survives the walk untouched, the way an unknown
 * id survives the file — the values are the song's, and whether the code is
 * in this browser is the engine's business.
 */
export function automatedPluginParams(
  base: PluginParamValues | null,
  lanes: readonly AutomationLane[],
  track: number,
  step: number,
  stepsPerBar: number,
): PluginParamValues | null {
  if (lanes.length === 0) return null;
  let out: PluginParamValues | null = null;
  for (const lane of lanes) {
    if (lane.track !== track) continue;
    const knob = pluginParamTargetKnob(lane.target);
    if (knob === null) continue;
    const at = laneValueAt(lane, step, stepsPerBar);
    if (at === null) continue;
    out ??= { ...(base ?? {}) };
    out[knob] = at;
  }
  return out;
}
