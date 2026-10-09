/**
 * arrangerBoard — the ARRANGER page's decisions, as arithmetic.
 *
 * The page itself is a Phaser view (`ArrangerView`, a later phase) and a view
 * cannot be unit tested here for the same reason the mixer's cannot: a canvas is
 * not part of a headless runner. But an arranger is mostly DECISIONS — where a bar
 * sits in a viewport, how far the ruler can scroll, which bar a click lands on,
 * what value a lane's handle is at a given height, and what a drag does to a lane
 * — and those are the questions worth pinning down. So they live here, Phaser-free,
 * the way `mixerBoard` holds the mixer's and `drumGrid` holds the drum machine's.
 *
 * The arranger draws two things over the same axis, and this module owns both:
 *
 *   • THE TIMELINE — the song's bars left to right. `timelineView` fixes how wide a
 *     bar is and what is visible; `timelineBarAt` and `timelineXAt` are the one
 *     mapping between a pixel and a bar, shared by the ruler, the channel rows and
 *     the playhead so a click, a mark and the music can never disagree.
 *   • THE LANES — a value that moves over bars. A lane is a line from `(startBar,
 *     from)` to `(endBar, to)`, so `laneYAtValue`/`laneValueAtY` put a value on a
 *     lane row's height (top is the target's maximum, bottom its minimum, the way a
 *     fader reads), and `resizeLane`/`moveLane` turn a drag into the lane the
 *     language already understands.
 *
 * Nothing here reads a song, touches the engine or draws anything: it takes the
 * numbers it needs and answers with the next one. The lane edits clamp and tidy
 * through `model/automation.ts`, so a drawn lane is exactly a written one.
 */

import {
  AUTOMATION_TARGETS,
  AUTOMATION_TARGET_BY_ID,
  clampAutomationBar,
  clampAutomationValue,
  tidyLane,
  type AutomationLane,
  type AutomationTargetId,
} from '../model/automation';
import { MAX_ORDER } from '../model/song';

/**
 * The narrowest a bar may be drawn.
 *
 * A bar is the unit a lane is read against, so it has to stay wide enough to hit
 * with a pointer even on a long song; when more bars than this fit, the ruler
 * scrolls rather than shrinking them to nothing. The width is also the grid a
 * value snaps to while dragging, so it is a decision about the feel of the page and
 * not only its pixels.
 */
export const MIN_ARRANGER_BAR_WIDTH = 6;

/** The widest a bar may be drawn, so a three-bar song does not become three slabs. */
export const MAX_ARRANGER_BAR_WIDTH = 48;

/** A lane row's height, and the value space a handle is dragged through. */
export const LANE_ROW_HEIGHT = 22;

/**
 * How the timeline is drawn right now.
 *
 * `bars` is the song's bar count, `scrollBar` the first visible bar (0-based) and
 * `visible` how many whole-or-partial bars fit — derived, never set by hand, so the
 * four numbers can never contradict one another.
 */
export interface TimelineView {
  /** How many bars the song has, at least 1. */
  bars: number;
  /** The pixel width of the ruler. */
  width: number;
  /** The pixel width of one bar. */
  barWidth: number;
  /** How many bars fit in `width` at `barWidth`. */
  visible: number;
  /** The first visible bar, 0-based. */
  scrollBar: number;
}

/** How many bars an `order` of `orderLength` rows has, clamped to the model's range. */
export function timelineBarCount(orderLength: number): number {
  if (!Number.isFinite(orderLength)) return 1;
  return Math.max(1, Math.min(MAX_ORDER, Math.round(orderLength)));
}

/** The furthest the ruler may scroll: no further than showing the last bar. */
export function maxScrollBar(bars: number, visible: number): number {
  return Math.max(0, timelineBarCount(bars) - Math.max(1, Math.floor(visible)));
}

/**
 * A scroll position inside the range the song allows.
 *
 * A click, a keypress or a restored session can all ask for a bar the song no longer
 * has, so the answer is CLAMPED rather than refused — the same bargain every hit
 * test here makes.
 */
export function clampScrollBar(scrollBar: number, bars: number, visible: number): number {
  if (!Number.isFinite(scrollBar)) return 0;
  return Math.max(0, Math.min(maxScrollBar(bars, visible), Math.floor(scrollBar)));
}

/**
 * The timeline as it is drawn, from the song and the viewport.
 *
 * A bar WIDENS to fill the ruler when the song has few bars (up to `MAX_ARRANGER_BAR_WIDTH`),
 * and stays at least `minBarWidth` wide when it has many, so the ruler either fits
 * the whole song or scrolls through it — never both half-way. `visible` is at least
 * one bar even in a zero-width viewport, because a screen that can show nothing is
 * not a state any hit test should have to special-case.
 */
export function timelineView(
  bars: number,
  width: number,
  scrollBar = 0,
  minBarWidth = MIN_ARRANGER_BAR_WIDTH,
): TimelineView {
  const count = timelineBarCount(bars);
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const floorWidth = Math.max(1, Math.round(minBarWidth));
  const ceilingWidth = Math.max(floorWidth, Math.round(MAX_ARRANGER_BAR_WIDTH));
  const barWidth = Math.max(floorWidth, Math.min(ceilingWidth, Math.floor(w / count)));
  const visible = Math.max(1, Math.min(count, Math.floor(w / barWidth) || 1));
  return { bars: count, width: w, barWidth, visible, scrollBar: clampScrollBar(scrollBar, count, visible) };
}

/**
 * The bar (0-based) under a pixel x, measured from the ruler's left edge.
 *
 * Clamped to the song: a click to the left of the first visible bar is that bar, and
 * a click past the end is the last bar, so a pointer dragged off the edge still
 * lands somewhere a lane can be read against.
 */
export function timelineBarAt(x: number, view: TimelineView): number {
  const column = Math.floor((Number.isFinite(x) ? x : 0) / view.barWidth);
  return Math.max(0, Math.min(view.bars - 1, view.scrollBar + Math.max(0, column)));
}

/** The pixel x of a bar's left edge, measured from the ruler's left edge. */
export function timelineXAt(bar: number, view: TimelineView): number {
  const clamped = Math.max(0, Math.min(view.bars - 1, Math.floor(Number.isFinite(bar) ? bar : 0)));
  return (clamped - view.scrollBar) * view.barWidth;
}

/**
 * The value a lane's handle has at a given height.
 *
 * A lane row reads like a fader: the TOP of the row is the target's maximum and the
 * bottom its minimum, so a rise climbs and a fall descends on screen. The answer is
 * clamped and rounded through `clampAutomationValue`, so a drag can never set a lane
 * to a value the model (or the file) would refuse.
 */
export function laneValueAtY(target: AutomationTargetId, y: number, top: number, height: number): number {
  const info = AUTOMATION_TARGET_BY_ID[target];
  if (!info) return 0;
  if (!(height > 0)) return clampAutomationValue(target, info.max);
  const fraction = 1 - ((Number.isFinite(y) ? y : top) - top) / height;
  const value = info.min + (info.max - info.min) * Math.max(0, Math.min(1, fraction));
  return clampAutomationValue(target, value);
}

/** The height a value sits at, the inverse of `laneValueAtY`. */
export function laneYAtValue(target: AutomationTargetId, value: number, top: number, height: number): number {
  const info = AUTOMATION_TARGET_BY_ID[target];
  if (!info) return top;
  const v = clampAutomationValue(target, value);
  const span = info.max - info.min;
  const fraction = span === 0 ? 1 : (v - info.min) / span;
  return top + (1 - Math.max(0, Math.min(1, fraction))) * height;
}

/** Which end of a lane a drag is holding. */
export type LaneEnd = 'start' | 'end';

/**
 * One lane, with an end moved to a bar and a value.
 *
 * The start handle moves `startBar` and `from`; the end handle moves `endBar` and
 * `to`. A handle dragged PAST the other one collapses the lane to a single bar
 * rather than swapping its ends, because a swap would silently reverse the music and
 * a one-bar lane is what the model already means by "a set, not a walk". `bars` is
 * the song's bar count, so the handle cannot be dragged off the arrangement.
 */
export function resizeLane(
  lane: AutomationLane,
  end: LaneEnd,
  bar: number,
  value: number,
  bars: number = MAX_ORDER,
): AutomationLane {
  const count = timelineBarCount(bars);
  const bounded = Math.max(1, Math.min(count, clampAutomationBar(bar)));
  if (end === 'start') {
    const startBar = Math.min(bounded, lane.endBar);
    return tidyLane({ ...lane, startBar, from: value });
  }
  const endBar = Math.max(bounded, lane.startBar);
  return tidyLane({ ...lane, endBar, to: value });
}

/**
 * One lane, slid along the arrangement by whole bars.
 *
 * The lane keeps its WIDTH and is clamped as a whole: dragging past either end stops
 * it at that end rather than squashing it, so a grab in the middle moves a lane the
 * way a person expects.
 */
export function moveLane(lane: AutomationLane, deltaBars: number, bars: number = MAX_ORDER): AutomationLane {
  const count = timelineBarCount(bars);
  const span = lane.endBar - lane.startBar;
  const shift = Number.isFinite(deltaBars) ? Math.round(deltaBars) : 0;
  const start = Math.max(1, Math.min(count - span, lane.startBar + shift));
  return tidyLane({ ...lane, startBar: start, endBar: start + span });
}

/**
 * Which lane a click on a bar selects: the LAST lane in reading order whose span
 * contains that bar.
 *
 * This is the same rule `automatedValue` plays by — the later lane wins where two
 * overlap — so the lane the mouse grabs and the lane the ear hears at that bar are
 * the same one.
 */
export function laneIndexAt(
  lanes: readonly AutomationLane[],
  bar: number,
  track: number,
  target: AutomationTargetId,
): number {
  let found = -1;
  lanes.forEach((lane, index) => {
    if (lane.track !== track || lane.target !== target) return;
    if (bar >= lane.startBar && bar <= lane.endBar) found = index;
  });
  return found;
}

/**
 * The targets a channel actually has lanes for, in the model's own order.
 *
 * The page draws one sub-row per target the song uses rather than one per target the
 * model knows, so an arranger for a song with a single `bright` lane is a single
 * line and not eleven empty ones. The order comes from `AUTOMATION_TARGETS`, so the
 * rows match the vocabulary list an author (or the docs) already reads.
 */
export function laneTargetsUsed(
  lanes: readonly AutomationLane[],
  track: number,
): AutomationTargetId[] {
  const used = new Set<AutomationTargetId>();
  for (const lane of lanes) {
    if (lane.track === track) used.add(lane.target);
  }
  return AUTOMATION_TARGETS.map((target) => target.id).filter((id) => used.has(id));
}
