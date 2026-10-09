import { describe, expect, it } from 'vitest';

import { AUTOMATION_TARGETS, type AutomationLane } from '../model/automation';
import { MAX_ORDER } from '../model/song';
import {
  clampScrollBar,
  LANE_ROW_HEIGHT,
  laneIndexAt,
  laneTargetsUsed,
  laneValueAtY,
  laneYAtValue,
  maxScrollBar,
  MIN_ARRANGER_BAR_WIDTH,
  moveLane,
  resizeLane,
  timelineBarAt,
  timelineBarCount,
  timelineView,
  timelineXAt,
} from '../ui/arrangerBoard';

const lane = (over: Partial<AutomationLane> = {}): AutomationLane => ({
  track: 1,
  target: 'bright',
  from: 20,
  to: 90,
  startBar: 3,
  endBar: 8,
  ...over,
});

describe('the timeline bar count', () => {
  it('is at least one bar, so a song always has a ruler', () => {
    expect(timelineBarCount(0)).toBe(1);
    expect(timelineBarCount(-4)).toBe(1);
    expect(timelineBarCount(Number.NaN)).toBe(1);
  });

  it('rounds and clamps to the arrangement range', () => {
    expect(timelineBarCount(4)).toBe(4);
    expect(timelineBarCount(4.4)).toBe(4);
    expect(timelineBarCount(999)).toBe(MAX_ORDER);
  });
});

describe('the timeline view', () => {
  it('widens a bar to fill a narrow song, up to the cap', () => {
    // Three bars in 300px: each would be 100px, capped at 48.
    const view = timelineView(3, 300);
    expect(view.barWidth).toBeGreaterThanOrEqual(MIN_ARRANGER_BAR_WIDTH);
    expect(view.barWidth).toBeLessThanOrEqual(48);
    // The cap means the extra space is not drawn as more bars than exist.
    expect(view.visible).toBeLessThanOrEqual(view.bars);
  });

  it('keeps a bar at its minimum width when the song does not fit, and scrolls', () => {
    const view = timelineView(64, 128);
    expect(view.barWidth).toBeGreaterThanOrEqual(MIN_ARRANGER_BAR_WIDTH);
    expect(view.visible).toBeLessThan(view.bars);
    expect(view.scrollBar).toBe(0);
  });

  it('never reports fewer than one visible bar, even in a zero-width viewport', () => {
    for (const width of [0, -10, Number.NaN]) {
      expect(timelineView(8, width).visible).toBeGreaterThanOrEqual(1);
    }
  });

  it('clamps a scroll position that the song can no longer reach', () => {
    const view = timelineView(8, 48, 99);
    expect(view.scrollBar).toBeLessThanOrEqual(maxScrollBar(view.bars, view.visible));
    expect(clampScrollBar(99, 8, 4)).toBe(4);
    expect(clampScrollBar(Number.NaN, 8, 4)).toBe(0);
  });

  it('forces the scroll back to zero when every bar fits', () => {
    const view = timelineView(4, 400, 3);
    expect(view.visible).toBeGreaterThanOrEqual(4);
    expect(view.scrollBar).toBe(0);
  });
});

describe('the timeline mapping', () => {
  const view = timelineView(16, 160, 0); // barWidth 10, all 16 fit

  it('maps a pixel to the bar under it', () => {
    expect(timelineBarAt(0, view)).toBe(0);
    expect(timelineBarAt(9, view)).toBe(0);
    expect(timelineBarAt(10, view)).toBe(1);
    expect(timelineBarAt(155, view)).toBe(15);
  });

  it('clamps a click past either end to a real bar', () => {
    expect(timelineBarAt(-50, view)).toBe(0);
    expect(timelineBarAt(100000, view)).toBe(15);
  });

  it('accounts for the scroll position', () => {
    const scrolled = timelineView(64, 80, 5); // scrollBar 5
    expect(scrolled.scrollBar).toBe(5);
    expect(timelineBarAt(0, scrolled)).toBe(5);
    expect(timelineXAt(5, scrolled)).toBe(0);
    expect(timelineXAt(6, scrolled)).toBe(scrolled.barWidth);
  });

  it('round-trips a bar through its own left edge', () => {
    for (const bar of [0, 1, 7, 15]) {
      expect(timelineBarAt(timelineXAt(bar, view), view)).toBe(bar);
    }
  });
});

describe('a lane row reads like a fader', () => {
  const top = 0;
  const height = LANE_ROW_HEIGHT;

  it('puts the target maximum at the top and its minimum at the bottom', () => {
    expect(laneYAtValue('bright', 100, top, height)).toBe(top);
    expect(laneYAtValue('bright', 0, top, height)).toBe(top + height);
  });

  it('round-trips a value through its height', () => {
    for (const value of [0, 25, 50, 75, 100]) {
      const y = laneYAtValue('bright', value, top, 100);
      expect(laneValueAtY('bright', y, top, 100)).toBe(value);
    }
  });

  it('clamps a drag outside the row to the target’s own range', () => {
    expect(laneValueAtY('bright', -1000, top, height)).toBe(100);
    expect(laneValueAtY('bright', 1000, top, height)).toBe(0);
    expect(laneValueAtY('bright', top + height / 2, top, height)).toBe(50);
  });

  it('answers a safe value for a target it does not know', () => {
    const bogus = 'not-a-target' as unknown as Parameters<typeof laneValueAtY>[0];
    expect(laneValueAtY(bogus, 0, top, height)).toBe(0);
    expect(laneYAtValue(bogus, 40, top, height)).toBe(top);
  });
});

describe('resizing a lane', () => {
  it('moves the start handle’s bar and its `from` value', () => {
    const moved = resizeLane(lane(), 'start', 1, 5, 16);
    expect(moved.startBar).toBe(1);
    expect(moved.from).toBe(5);
    expect(moved.endBar).toBe(8);
    expect(moved.to).toBe(90);
  });

  it('moves the end handle’s bar and its `to` value', () => {
    const moved = resizeLane(lane(), 'end', 12, 100, 16);
    expect(moved.endBar).toBe(12);
    expect(moved.to).toBe(100);
    expect(moved.startBar).toBe(3);
    expect(moved.from).toBe(20);
  });

  it('collapses to a one-bar lane rather than swapping ends', () => {
    const collapsed = resizeLane(lane(), 'start', 11, 40, 16);
    expect(collapsed.startBar).toBe(collapsed.endBar);
    expect(collapsed.startBar).toBe(8);
  });

  it('cannot be dragged off the arrangement', () => {
    expect(resizeLane(lane(), 'end', 99, 90, 16).endBar).toBe(16);
    expect(resizeLane(lane(), 'start', -5, 20, 16).startBar).toBe(1);
  });

  it('tidies a value into its target’s range', () => {
    expect(resizeLane(lane(), 'end', 8, 999, 16).to).toBe(100);
    expect(resizeLane(lane(), 'end', 8, -999, 16).to).toBe(0);
  });
});

describe('moving a lane', () => {
  it('slides it by whole bars, keeping its width', () => {
    const moved = moveLane(lane(), 2, 16);
    expect(moved.startBar).toBe(5);
    expect(moved.endBar).toBe(10);
    expect(moved.endBar - moved.startBar).toBe(5);
  });

  it('stops at either end rather than squashing', () => {
    const right = moveLane(lane(), 99, 16);
    expect(right.endBar).toBe(16);
    expect(right.endBar - right.startBar).toBe(5);
    const left = moveLane(lane(), -99, 16);
    expect(left.startBar).toBe(1);
    expect(left.endBar).toBe(6);
  });

  it('rounds a fractional shift and ignores a broken one', () => {
    expect(moveLane(lane(), 1.6, 16).startBar).toBe(5);
    expect(moveLane(lane(), Number.NaN, 16).startBar).toBe(3);
  });
});

describe('picking the lane a click selects', () => {
  const lanes: AutomationLane[] = [
    lane({ startBar: 1, endBar: 5 }),
    lane({ startBar: 4, endBar: 8, from: 5, to: 10 }),
  ];

  it('takes the LAST lane in force at the bar, matching playback', () => {
    expect(laneIndexAt(lanes, 2, 1, 'bright')).toBe(0);
    expect(laneIndexAt(lanes, 4, 1, 'bright')).toBe(1);
    expect(laneIndexAt(lanes, 8, 1, 'bright')).toBe(1);
  });

  it('answers -1 when no lane covers the bar', () => {
    expect(laneIndexAt(lanes, 9, 1, 'bright')).toBe(-1);
  });

  it('ignores lanes on another channel or target', () => {
    expect(laneIndexAt(lanes, 2, 2, 'bright')).toBe(-1);
    expect(laneIndexAt(lanes, 2, 1, 'level')).toBe(-1);
  });
});

describe('which lane rows a channel draws', () => {
  it('lists only the targets the song uses, in the model’s own order', () => {
    const lanes: AutomationLane[] = [
      lane({ track: 1, target: 'level' }),
      lane({ track: 1, target: 'bright' }),
      lane({ track: 2, target: 'gate' }),
    ];
    const track1 = laneTargetsUsed(lanes, 1);
    expect(track1).toEqual(['bright', 'level']);
    // And the order really is the model's, not alphabetical or insertion order.
    const model = AUTOMATION_TARGETS.map((target) => target.id);
    expect(model.indexOf('bright')).toBeLessThan(model.indexOf('level'));
    expect(laneTargetsUsed(lanes, 2)).toEqual(['gate']);
    expect(laneTargetsUsed(lanes, 3)).toEqual([]);
  });
});
