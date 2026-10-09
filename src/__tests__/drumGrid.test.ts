import { describe, expect, it } from 'vitest';

import {
  columnOfStep,
  DEFAULT_HIT_VELOCITY,
  drumGridWindow,
  HIT_VELOCITIES,
  hitShade,
  nextHitVelocity,
  previousHitVelocity,
  stepAtColumn,
  toggleHitVelocity,
  visibleSteps,
} from '../ui/drumGrid';

/**
 * The drum machine grid's arithmetic — the half of the tab a headless runner can
 * check. The view is pixels; this is the window, the columns and the velocity
 * ladder, and all three are easy to get subtly wrong in a way a screenshot would
 * not show (a window one step short, a click landing on the wrong cell, a ladder
 * that skips a level).
 */

describe('how many steps the grid shows', () => {
  it('never shows more steps than the machine has', () => {
    expect(visibleSteps(16, 55)).toBe(16);
    expect(visibleSteps(64, 55)).toBe(55);
    expect(visibleSteps(1, 55)).toBe(1);
  });

  it('shows at least one, whatever it is asked for', () => {
    expect(visibleSteps(0, 0)).toBe(1);
    expect(visibleSteps(16, 0)).toBe(1);
  });
});

describe('the window the cursor is in', () => {
  it('shows the whole machine when it fits', () => {
    expect(drumGridWindow(16, 0, 55)).toEqual({ first: 0, visible: 16 });
    expect(drumGridWindow(16, 15, 55)).toEqual({ first: 0, visible: 16 });
  });

  it('pins to the left while the cursor is near the start', () => {
    expect(drumGridWindow(64, 0, 55)).toEqual({ first: 0, visible: 55 });
    expect(drumGridWindow(64, 20, 55)).toEqual({ first: 0, visible: 55 });
  });

  it('pins to the right at the end, so the grid never drifts past the wall', () => {
    expect(drumGridWindow(64, 63, 55)).toEqual({ first: 9, visible: 55 });
  });

  it('scrolls so the cursor is always inside the window', () => {
    const win = drumGridWindow(64, 40, 55);
    expect(win.first).toBeGreaterThan(0);
    expect(win.first).toBeLessThanOrEqual(40);
    expect(win.first + win.visible).toBeGreaterThan(40);
  });

  it('treats a cursor past the end as the last step', () => {
    expect(drumGridWindow(16, 999, 55)).toEqual({ first: 0, visible: 16 });
  });
});

describe('columns and steps', () => {
  const win = { first: 9, visible: 55 };

  it('names the step a column plays', () => {
    expect(stepAtColumn(win, 0)).toBe(9);
    expect(stepAtColumn(win, 54)).toBe(63);
  });

  it('answers null for a column outside the window', () => {
    expect(stepAtColumn(win, -1)).toBeNull();
    expect(stepAtColumn(win, 55)).toBeNull();
  });

  it('names the column a step sits in, or -1 when it is scrolled off', () => {
    expect(columnOfStep(win, 9)).toBe(0);
    expect(columnOfStep(win, 63)).toBe(54);
    expect(columnOfStep(win, 8)).toBe(-1);
    expect(columnOfStep(win, 64)).toBe(-1);
  });
});

describe('the velocity a click makes', () => {
  it('toggles an empty cell to a full hit and a lit one to a rest', () => {
    expect(toggleHitVelocity(0)).toBe(DEFAULT_HIT_VELOCITY);
    expect(toggleHitVelocity(40)).toBe(0);
    expect(toggleHitVelocity(100)).toBe(0);
  });

  it('walks the four levels upward and back round to a rest', () => {
    expect(HIT_VELOCITIES).toEqual([0, 40, 70, 100]);
    expect(nextHitVelocity(0)).toBe(40);
    expect(nextHitVelocity(40)).toBe(70);
    expect(nextHitVelocity(70)).toBe(100);
    expect(nextHitVelocity(100)).toBe(0);
  });

  it('walks them the other way, off the bottom and round to the top', () => {
    expect(previousHitVelocity(0)).toBe(100);
    expect(previousHitVelocity(100)).toBe(70);
    expect(previousHitVelocity(40)).toBe(0);
  });

  it('reads a hit as a brightness, and a rest as nothing', () => {
    expect(hitShade(0)).toBe(0);
    expect(hitShade(100)).toBe(1);
    expect(hitShade(50)).toBeCloseTo(0.675, 6);
  });
});
