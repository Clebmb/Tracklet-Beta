import { describe, expect, it } from 'vitest';

import { History } from '../model';

describe('the undo history', () => {
  it('starts empty and refuses to step anywhere', () => {
    const history = new History<string>();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo('now')).toBeNull();
    expect(history.redo('now')).toBeNull();
  });

  it('hands states back in reverse order', () => {
    const history = new History<string>();
    history.record('a');
    history.record('b');
    // The stack holds the state BEFORE each step, so "now" walks backwards.
    expect(history.undo('c')).toBe('b');
    expect(history.undo('b')).toBe('a');
    expect(history.undo('a')).toBeNull();
  });

  it('walks forward again with redo', () => {
    const history = new History<string>();
    history.record('a');
    history.record('b');
    // ...a and b were applied, so the live state is "c".
    expect(history.undo('c')).toBe('b');
    expect(history.undo('b')).toBe('a');
    expect(history.redo('a')).toBe('b');
    expect(history.redo('b')).toBe('c');
    expect(history.redo('c')).toBeNull();
  });

  it('discards the redo branch once something new is recorded', () => {
    const history = new History<string>();
    history.record('a');
    history.record('b');
    expect(history.undo('c')).toBe('b');
    expect(history.canRedo).toBe(true);
    // A new edit makes the abandoned future unreachable, as every editor does.
    history.record('b2');
    expect(history.canRedo).toBe(false);
    expect(history.redo('b2')).toBeNull();
    expect(history.undo('x')).toBe('b2');
  });

  it('never grows past its limit', () => {
    const history = new History<number>(3);
    for (let i = 0; i < 10; i++) history.record(i);
    expect(history.depth).toBe(3);
    // Only the three most recent states survive; the oldest fall off the back.
    expect(history.undo(9)).toBe(9);
    expect(history.undo(9)).toBe(8);
    expect(history.undo(9)).toBe(7);
    expect(history.undo(9)).toBeNull();
  });

  it('hands the whole past back oldest-first, as a copy', () => {
    const history = new History<string>();
    history.record('a');
    history.record('b');
    expect(history.states()).toEqual(['a', 'b']);
    // A copy: a caller sorting or shifting the list it was given cannot reach in
    // and reorder the timeline.
    const given = history.states();
    given.reverse();
    expect(history.states()).toEqual(['a', 'b']);
    // A state that has been undone away is no longer in the stack to be listed.
    history.undo('c');
    expect(history.states()).toEqual(['a']);
  });

  it('forgets everything on clear', () => {
    const history = new History<string>();
    history.record('a');
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
