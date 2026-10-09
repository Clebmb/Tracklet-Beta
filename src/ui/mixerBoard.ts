/**
 * mixerBoard — the MIXER page's decisions, as arithmetic.
 *
 * The page itself is a Phaser view (`MixerView`) and a view cannot be unit
 * tested here for the same reason the audio engine cannot: a canvas is not part
 * of a headless runner. But a mixer is mostly DECISIONS — which strips exist,
 * where the selection can go, which group a channel may join, how the effects
 * are paged — and those are the questions worth pinning down. So they live
 * here, Phaser-free, the way `drumGrid` holds the drum machine's grid
 * arithmetic beside its view.
 *
 * The rules, one each:
 *
 *   • WHICH CHANNELS there are — one strip per channel, plus the drum machine's
 *     when the song has one. A song with four channels draws four strips and
 *     nothing else: a mixer that padded itself out with placeholder channels
 *     would be drawing a mix the song does not have.
 *   • WHERE the selection can be, and where a key moves it from there. The
 *     machine is a column of the mix without being one of the song's tracks,
 *     which is exactly how the reference draws it — so it is `-1`, the one
 *     index that cannot collide with a channel number.
 *   • WHICH GROUP a channel may join: the song's own groups, in order, with
 *     `NONE` first — and never a group the song does not have, because the
 *     model refuses that line and the file refuses it too, so a control
 *     offering one would be offering a mistake.
 *   • HOW the effects are paged: the effects the model supports, in the model's
 *     own table, a fixed number to a page. The page count is DERIVED from
 *     `TRACK_EFFECTS`, so an eleventh effect grows a page rather than going
 *     unsupported.
 *
 * Nothing here reads a song, touches the engine or draws anything: it takes the
 * numbers and names it needs and answers with the next one.
 */

import { MAX_BUSES, NO_BUS_WORD, busNames, type Bus } from '../model/bus';
import type { DrumMachine } from '../model/machine';
import {
  clampEffect,
  clampLevel,
  clampPan,
  clampDuck,
  clampSend,
  TRACK_EFFECTS,
  type ChannelEffects,
  type Track,
  type TrackEffectId,
} from '../model/song';

/**
 * The drum machine's own column, as the selection names it.
 *
 * `-1` rather than a track index at the end, because it means the same thing in
 * every state: a song whose machine is added later must not renumber the
 * channels, and a selection that pointed at "the last channel" must not become
 * the machine by accident. It is not a channel — a machine has no mute, no solo
 * and no name a `track` line can write — but it IS a column of the mix.
 */
export const MACHINE_CHANNEL = -1;

/**
 * The five rows of a channel that are a NUMBER, in the panel's own order.
 *
 * The list is here rather than in the view because it is not presentation: it is
 * which controls a channel HAS, and two things read it — the panel that draws
 * them and the clipboard that copies them. A row added to this list is drawn and
 * copied without either file being touched again.
 */
export const MIX_NUMBER_FIELDS = ['level', 'pan', 'verb', 'echo', 'duck'] as const;

/** One of those five, as a name. */
export type MixNumberField = (typeof MIX_NUMBER_FIELDS)[number];

/**
 * A row of the channel panel: the five numbers, then the group.
 *
 * `bus` is the odd one — a control of the same rank that holds a NAME rather
 * than a range — so it is listed with them and handled differently.
 */
export type MixRowId = MixNumberField | 'bus';

/** Every row the channel panel draws, in the order it draws them. */
export const MIX_ROWS: readonly MixRowId[] = [...MIX_NUMBER_FIELDS, 'bus'];

/**
 * One column's whole mix, as a value.
 *
 * What COPY puts down and PASTE picks up. It is a plain object rather than a
 * reference to the source, deliberately: a mix copied from one channel and
 * pasted onto another must not change when the first one is edited afterwards,
 * and a copy of a song that is then replaced must not still point into it.
 */
export interface MixSnapshot {
  level: number;
  pan: number;
  verb: number;
  echo: number;
  duck: number;
  /** The group to join, or `null` for none — a NAME, validated on the way in. */
  bus: string | null;
  /** The ten channel effects, in the model's own order. */
  effects: ChannelEffects;
}

/**
 * Read the ten effects through one walker, so a copy can never miss one.
 *
 * Derived from `TRACK_EFFECTS`, which is the same list the page PAGES and the
 * patch file WALKS: an eleventh effect would be copied by this function without
 * being added to it.
 */
function readEffects(read: (id: TrackEffectId) => number): ChannelEffects {
  const out = {} as ChannelEffects;
  for (const effect of TRACK_EFFECTS) out[effect.id] = clampEffect(read(effect.id));
  return out;
}

/**
 * Snapshot what a channel's mix IS, clamped to the ranges the model allows.
 *
 * Clamped on the way out as well as the way in, because a snapshot is what the
 * clipboard holds and the clipboard outlives the song it came from: a value that
 * was legal when it was copied must not become a way to write an illegal one
 * after the ranges change under it.
 */
export function snapshotTrackMix(track: Track): MixSnapshot {
  return {
    level: clampLevel(track.level),
    pan: clampPan(track.pan),
    verb: clampSend(track.verb),
    echo: clampSend(track.echo),
    duck: clampDuck(track.duck),
    bus: track.bus,
    // A channel carries its ten effects as its own fields; the machine keeps
    // them in a bag — the two readers below are the only difference between the
    // two kinds of column, which is why pasting across them is one code path.
    effects: readEffects((id) => track[id]),
  };
}

/** Snapshot the machine's own strip, in the same shape a channel answers in. */
export function snapshotMachineMix(machine: DrumMachine): MixSnapshot {
  return {
    level: clampLevel(machine.level),
    pan: clampPan(machine.pan),
    verb: clampSend(machine.verb),
    echo: clampSend(machine.echo),
    duck: clampDuck(machine.duck),
    bus: machine.bus,
    effects: readEffects((id) => machine.effects[id]),
  };
}

/**
 * A WHOLE song's mix, as one value: what A/B compares.
 *
 * Everything the mixer page can move lives in here, INCLUDING the parts that are
 * not per-column — the groups' faders, the shared room and the effects on
 * everything at once. A balance is all of it or none of it: comparing two mixes
 * that shared a room would be comparing two different rooms.
 */
export interface MixScene {
  /** One snapshot per CHANNEL, in the song's own order. */
  tracks: MixSnapshot[];
  /** The machine's own strip, when the song it came from had one. */
  machine: MixSnapshot | null;
  /** The song's groups, with their faders. */
  buses: Bus[];
  /** The shared room: the reverb and echo both sends end in. */
  room: { reverb: number; echo: number };
  /** The effects on the whole mix at once. */
  master: ChannelEffects;
}

/** What part of a scene a song can actually take. */
export interface SceneTargets {
  /** The columns to write, each with the song index it lands on. */
  tracks: { index: number; mix: MixSnapshot }[];
  /** The machine's mix, when THIS song has a machine to put it on. */
  machine: MixSnapshot | null;
  /** Columns the scene has and this song does not. Reported, never invented. */
  droppedTracks: number;
  /** True when the scene has a machine's mix and this song has no machine. */
  droppedMachine: boolean;
}

/**
 * Work out where a scene's numbers land in a song of a given size.
 *
 * The one thing A/B must not do is invent: a balance taken from an eight-channel
 * song, switched into a four-channel one, moves four channels and REPORTS the
 * other four — and a machine's mix into a song with no machine lands nowhere and
 * is reported too. Anything else would be a mixer quietly writing a song that is
 * not the one in front of it.
 */
export function sceneTargets(scene: MixScene, trackCount: number, hasMachine: boolean): SceneTargets {
  const count = Math.max(0, Math.round(trackCount));
  const tracks: { index: number; mix: MixSnapshot }[] = [];
  for (let index = 0; index < Math.min(count, scene.tracks.length); index++) {
    const mix = scene.tracks[index];
    if (mix) tracks.push({ index, mix });
  }
  return {
    tracks,
    machine: hasMachine ? scene.machine : null,
    droppedTracks: Math.max(0, scene.tracks.length - count),
    droppedMachine: scene.machine !== null && !hasMachine,
  };
}

/** Whether two scenes hold the same numbers, so the page can say which is which. */
export function sameScene(a: MixScene, b: MixScene): boolean {
  return sameSnapshots(a.tracks, b.tracks)
    && sameMachine(a.machine, b.machine)
    && a.buses.length === b.buses.length
    && a.buses.every((bus, i) => bus.name === b.buses[i]?.name && bus.level === b.buses[i]?.level)
    && a.room.reverb === b.room.reverb && a.room.echo === b.room.echo
    && TRACK_EFFECTS.every((effect) => a.master[effect.id] === b.master[effect.id]);
}

function sameMachine(a: MixSnapshot | null, b: MixSnapshot | null): boolean {
  if (a === null || b === null) return a === b;
  return sameSnapshot(a, b);
}

function sameSnapshots(a: readonly MixSnapshot[], b: readonly MixSnapshot[]): boolean {
  return a.length === b.length && a.every((mix, i) => { const other = b[i]; return other !== undefined && sameSnapshot(mix, other); });
}

function sameSnapshot(a: MixSnapshot, b: MixSnapshot): boolean {
  return MIX_NUMBER_FIELDS.every((field) => a[field] === b[field])
    && a.bus === b.bus
    && TRACK_EFFECTS.every((effect) => a.effects[effect.id] === b.effects[effect.id]);
}

/**
 * The group a snapshot may actually join, given the groups a song has.
 *
 * A mix copied from a song with `KEYS` and pasted into one without it cannot
 * join it — the model would refuse the name — so the answer is `null` (no group)
 * and the caller says so, rather than a control that quietly does nothing.
 */
export function busIn(snapshot: MixSnapshot, buses: readonly Bus[]): string | null {
  if (snapshot.bus === null) return null;
  return buses.some((bus) => bus.name === snapshot.bus) ? snapshot.bus : null;
}

/** How many strips the page draws: the channels, plus the machine when there is one. */
export function channelCount(trackCount: number, hasMachine: boolean): number {
  return Math.max(0, Math.round(trackCount)) + (hasMachine ? 1 : 0);
}

/** True when the selection is the drum machine's own strip. */
export function isMachineChannel(index: number): boolean {
  return index === MACHINE_CHANNEL;
}

/**
 * Clamp a selection into the columns that actually exist.
 *
 * A selection past the end lands on the machine when there is one (the machine
 * is the last column) and on the last channel when there is not. That is the
 * reading that keeps a selection honest when the song changes under it: fewer
 * channels must not leave the page pointing at a strip nobody can see.
 */
export function clampChannel(index: number, trackCount: number, hasMachine: boolean): number {
  const count = channelCount(trackCount, hasMachine);
  if (count === 0) return 0;
  if (isMachineChannel(index)) return hasMachine ? MACHINE_CHANNEL : Math.max(0, trackCount - 1);
  const flat = Math.max(0, Math.min(count - 1, Math.round(index)));
  if (hasMachine && flat === count - 1) return MACHINE_CHANNEL;
  return flat;
}

/**
 * Move the selection by `delta` columns, clamping at the ends.
 *
 * Clamped rather than wrapping, deliberately, and the opposite way the F5 MENU
 * this page replaced chose for its list: the page draws its columns side by side,
 * so the end of the row is a WALL a person can see. (The old menu wrapped because
 * a one-column list has no wall to see.)
 */
export function moveChannel(index: number, delta: number, trackCount: number, hasMachine: boolean): number {
  const count = channelCount(trackCount, hasMachine);
  if (count === 0) return 0;
  // Flatten first, so the machine is just the last of the row and the arithmetic
  // is one rule rather than two.
  const flat = isMachineChannel(index) ? count - 1 : Math.max(0, Math.min(count - 1, index));
  const next = Math.max(0, Math.min(count - 1, flat + Math.round(delta)));
  return hasMachine && next === count - 1 ? MACHINE_CHANNEL : next;
}

/**
 * Flatten a selection into a column number, machine included: `0..count-1`.
 *
 * What the page draws with, and what `moveChannel` works in. `MACHINE_CHANNEL`
 * is the last column whenever there is a machine, because that is where the
 * reference puts it and where a person looks for it.
 */
export function channelColumn(index: number, trackCount: number, hasMachine: boolean): number {
  const count = channelCount(trackCount, hasMachine);
  if (count === 0) return 0;
  if (isMachineChannel(index)) return count - 1;
  return Math.max(0, Math.min(count - 1, Math.round(index)));
}

/**
 * Every column the selection can be walked through, in screen order.
 *
 * The one list both the drawing and the keyboard read, so a key can never reach
 * a strip the paint did not draw.
 */
export function channelColumns(trackCount: number, hasMachine: boolean): number[] {
  const count = channelCount(trackCount, hasMachine);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    if (hasMachine && i === count - 1) out.push(MACHINE_CHANNEL);
    else out.push(i);
  }
  return out;
}

/** The label for a column: the channel's name, or `MACHINE`. */
export function channelLabel(index: number, trackName: string): string {
  return isMachineChannel(index) ? 'MACHINE' : trackName;
}

/** One choice the BUS control offers: what it says, and what it means. */
export interface BusChoice {
  /** How the control writes it — a group's name, or `NONE`. */
  label: string;
  /** The name a channel joins, or `null` for the band itself. */
  name: string | null;
}

/**
 * The choices the BUS control offers, in the order it cycles them.
 *
 * `NONE` first, then the song's own groups in the order they were declared,
 * which is the order the script writes them and the order the GROUPS panel
 * draws them. Nothing else is offered: a group is a name a track line joins and
 * the model checks the name against the song, so a choice invented here would
 * be a refusal waiting to happen.
 */
export function busChoices(buses: readonly Bus[]): BusChoice[] {
  return [
    { label: NO_BUS_WORD.toUpperCase(), name: null },
    ...busNames(buses).map((name) => ({ label: name, name })),
  ];
}

/**
 * Where the BUS control lands after one press, from wherever it is now.
 *
 * A cycle rather than a stop at each end, because the two ends are both places
 * a person wants (off the group, or on the last one) and the control has no
 * second key for "back the other way". A channel pointing at a group the song
 * no longer has lands on `NONE`, which is the honest repair: the model plays
 * that channel at full, so the page should say that it is on no group.
 */
export function nextBusChoice(buses: readonly Bus[], current: string | null, direction = 1): BusChoice {
  const choices = busChoices(buses);
  const wanted = current === null ? null : current.toUpperCase();
  const at = choices.findIndex((choice) => choice.name === wanted);
  const from = at < 0 ? 0 : at;
  const step = direction < 0 ? -1 : 1;
  return choices[(from + step + choices.length) % choices.length];
}

/** How many effects one page of the effect lists shows. */
export const EFFECTS_PER_PAGE = 5;

/**
 * The effect ids, chunked into pages in the model's own order.
 *
 * Derived from `TRACK_EFFECTS` rather than listed again, so the page can never
 * show a set the model does not have — and a new effect lands on the last page
 * (or opens one) without this file being touched.
 */
export function effectPages(): TrackEffectId[][] {
  const ids = TRACK_EFFECTS.map((effect) => effect.id);
  const pages: TrackEffectId[][] = [];
  for (let i = 0; i < ids.length; i += EFFECTS_PER_PAGE) {
    pages.push(ids.slice(i, i + EFFECTS_PER_PAGE));
  }
  return pages.length > 0 ? pages : [[]];
}

/** Clamp a page number into the pages that exist. */
export function clampPage(page: number, pageCount: number): number {
  return Math.max(0, Math.min(Math.max(0, pageCount - 1), Math.round(page)));
}

/** The page a `Tab` press lands on: the next one, round again. */
export function nextPage(page: number, pageCount: number): number {
  if (pageCount <= 1) return 0;
  return (clampPage(page, pageCount) + 1) % pageCount;
}

/**
 * One run of changes to the mixer: what a gesture IS, as arithmetic.
 *
 * The page's undo bargain is "one Ctrl+Z per gesture", and the gesture is the
 * whole of the subtlety: a press or a click opens one, the changes that follow
 * ride inside it, and the next press opens another. The scene used to hold that
 * in two fields of its own, which made the rule unreachable from a test — a
 * scene is a canvas and a canvas is not part of a headless runner. It is a
 * decision, so it belongs here beside the other ones.
 */
export interface MixGesture {
  /** True once this gesture has banked its undo step. */
  readonly recorded: boolean;
  /** When the gesture last moved, in the caller's own clock. */
  readonly at: number;
}

/**
 * How long a run of changes stays ONE undo step.
 *
 * Long enough that a held arrow key (about thirty repeats a second) is plainly
 * one gesture, short enough that nobody balancing a mix by hand can move two
 * controls inside it on purpose — and in any case a fresh press closes the run
 * outright, so this is the safety net rather than the rule.
 */
export const MIX_GESTURE_MS = 1200;

/** No gesture is running: the next change banks its own step. */
export const NO_GESTURE: MixGesture = { recorded: false, at: 0 };

/** What a change does to the undo history, and what it leaves behind. */
export interface MixStep {
  /** Whether the caller must bank a snapshot before making the change. */
  readonly record: boolean;
  /** The gesture as it stands after the change. */
  readonly gesture: MixGesture;
}

/**
 * Start a gesture — a key press, or a click into a control.
 *
 * Deliberately closes any run in progress: two presses of `-` are two steps
 * even when they land within the window, because a person pressed twice.
 */
export function beginGesture(): MixGesture {
  return NO_GESTURE;
}

/**
 * The undo step, if any, for one change.
 *
 * `perGesture` is the difference between the two screens that share this code:
 * the mixer page folds a run into one step, while the drum machine page keeps the
 * per-change step it has always had. A run only ever belongs to the page that
 * opened it, so a page that does not fold never touches the gesture at all —
 * which is what stops the two screens spending each other's.
 */
export function mixStep(gesture: MixGesture, perGesture: boolean, now: number): MixStep {
  if (!perGesture) return { record: true, gesture: NO_GESTURE };
  if (gesture.recorded && now - gesture.at < MIX_GESTURE_MS) {
    return { record: false, gesture: { recorded: true, at: now } };
  }
  return { record: true, gesture: { recorded: true, at: now } };
}

/**
 * The name a `+ GROUP` press should give a new bus, or `null` when there is no
 * room left.
 *
 * Generated rather than asked for, because the mixer is a by-ear screen and a
 * text box in the middle of it would stop the music. The name is checked the
 * way the model checks one — one word, letters and digits — so every generated
 * name is legal, and it skips names the song already uses so a press can never
 * silently redefine an existing group's fader.
 */
export function newBusName(buses: readonly Bus[]): string | null {
  if (buses.length >= MAX_BUSES) return null;
  const taken = new Set(busNames(buses));
  for (let n = 1; n <= MAX_BUSES + 1; n++) {
    const name = `GROUP${n}`;
    if (!taken.has(name)) return name;
  }
  return null;
}
