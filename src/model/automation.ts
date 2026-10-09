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
  MIN_EFFECT,
  MIN_LEVEL,
  clampLevel,
  clampTempoSlot,
} from './song';
import { MIN_PARAM, MAX_PARAM, VOICE_PARAMS, clampParam, type VoiceParamId, type VoiceParams } from './voice';
import { DRIFT_MAX, DRIFT_MIN, clampDrift } from './drift';

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
export type AutomationTargetId = VoiceParamId | 'level' | 'gate' | 'drift';

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
  return Object.prototype.hasOwnProperty.call(AUTOMATION_TARGET_BY_ID, word);
}

/**
 * As many lanes as a song may have.
 *
 * The same ceiling and the same reason as `MAX_TEMPO_POINTS`: an arrangement is a
 * list of bars, thirty-two moving values is more movement than any song has, and
 * a limit is what stops a runaway generator from writing a file that takes a
 * second to open. It is also small enough that reading a lane per note is free.
 */
export const MAX_AUTOMATION_LANES = 32;

/**
 * One value moving over a range of bars.
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
  /** The bar it starts on, 1-based: a slot of the `order`. */
  startBar: number;
  /** The bar it ends on, inclusive. */
  endBar: number;
}

/** Clamp a bar into the range an arrangement can have. Same range as `order`. */
export function clampAutomationBar(bar: number): number {
  return clampTempoSlot(bar);
}

/** Clamp a value into the range its target offers. */
export function clampAutomationValue(target: AutomationTargetId, value: number): number {
  const info = AUTOMATION_TARGET_BY_ID[target];
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
  const startBar = clampAutomationBar(lane.startBar);
  const endBar = Math.max(startBar, clampAutomationBar(lane.endBar));
  const target = isAutomationTarget(lane.target) ? lane.target : 'bright';
  return {
    track: clampAutomationTrack(lane.track, MAX_ORDER),
    target,
    from: clampAutomationValue(target, lane.from),
    to: clampAutomationValue(target, lane.to),
    startBar,
    endBar,
  };
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
export function laneValueAt(lane: AutomationLane, step: number, stepsPerBar: number): number | null {
  const target = lane.target;
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
): number | null {
  if (lanes.length === 0) return null;
  let value: number | null = null;
  for (const lane of lanes) {
    if (lane.track !== track || lane.target !== target) continue;
    const at = laneValueAt(lane, step, stepsPerBar);
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
): number | null {
  const value = automatedValue(lanes, track, 'level', step, stepsPerBar);
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
  const info = AUTOMATION_TARGET_BY_ID[lane.target];
  const bars = lane.startBar === lane.endBar ? `BAR ${lane.startBar}` : `BARS ${lane.startBar}-${lane.endBar}`;
  return `CH ${lane.track} ${info?.label ?? lane.target} ${lane.from} -> ${lane.to} · ${bars}`;
}

/** How the app writes one lane as a script line, so a song can save and reopen. */
export function laneScript(lane: AutomationLane): string {
  return `automate ${lane.track} ${lane.target} ${lane.from} ${lane.to} bars ${lane.startBar} to ${lane.endBar}`;
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
