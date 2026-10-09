import { describe, expect, it } from 'vitest';

import { NO_ARM, stepRemoval } from '../ui/removalArm';

/**
 * Removing an instrument from the F2 list, as the property `removalArm.ts`
 * exists to guarantee: the second `DEL` takes out the row the FIRST one was
 * about, and nothing else can be talked into disappearing.
 *
 * Written against the decision rather than the menu because this is the one
 * irreversible action in any of the menus (there is no `Ctrl+Z` for app state),
 * so the guard has to be checked where it can be read, not by pressing keys in
 * the right order and hoping.
 */

/** The whole gesture, as a reader of the menu performs it. */
function press(arm: ReturnType<typeof stepRemoval>['arm'], highlighted: string | null) {
  const step = stepRemoval(arm, highlighted);
  return { kind: step.kind, id: 'id' in step ? step.id : null, arm: step.arm };
}

describe('a removal takes two presses', () => {
  it('arms on the first and removes on the second', () => {
    const first = press(NO_ARM, 'noislet:kick');
    expect(first.kind).toBe('arm');
    expect(first.id).toBe('noislet:kick');

    const second = press(first.arm, 'noislet:kick');
    expect(second.kind).toBe('remove');
    expect(second.id).toBe('noislet:kick');
  });

  it('is unarmed again after a removal, so a third press only arms', () => {
    const armed = press(NO_ARM, 'a').arm;
    const removed = press(armed, 'a');
    expect(removed.kind).toBe('remove');
    expect(removed.arm).toEqual(NO_ARM);
    expect(press(removed.arm, 'b').kind).toBe('arm');
  });
});

describe('the arm belongs to one row', () => {
  it('arms the row you are on rather than removing the one you armed before', () => {
    const armed = press(NO_ARM, 'a').arm;
    // Arrow down to b, then press DEL: b arms. It must NOT delete `a`, which is
    // the accident this whole module exists to make impossible.
    const moved = press(armed, 'b');
    expect(moved.kind).toBe('arm');
    expect(moved.id).toBe('b');
    expect(moved.arm).toEqual({ id: 'b' });
  });

  it('removes only once the press is on the armed row again', () => {
    const moved = press(press(NO_ARM, 'a').arm, 'b');
    expect(press(moved.arm, 'b').kind).toBe('remove');
  });
});

describe('a row that cannot be removed cannot be armed', () => {
  it('does nothing when the highlight is not an instrument', () => {
    // `null` is the chooser's own rows: "NO INSTRUMENTS YET", the way back.
    expect(press(NO_ARM, null).kind).toBe('none');
  });

  it('forgets an arm once the highlight leaves the list', () => {
    const armed = press(NO_ARM, 'a').arm;
    const missed = press(armed, null);
    expect(missed.kind).toBe('none');
    // Coming back to `a` arms again rather than removing: the arm was dropped
    // when the highlight left the list, not held behind it.
    expect(press(missed.arm, 'a').kind).toBe('arm');
  });
});
