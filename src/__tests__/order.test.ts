import { describe, expect, it } from 'vitest';

import {
  appendOrder,
  applyScript,
  countNotes,
  createSong,
  ensurePattern,
  isOrderEmpty,
  MAX_ORDER,
  normalizeOrder,
  orderLabel,
  patternRows,
  removeOrder,
  setOrder,
  setOrderPattern,
  songSteps,
  stepToSlot,
  type Song,
} from '../model';

/**
 * The song order — the list of bars a song plays, which is what turns a loop
 * into an arrangement.
 *
 * The arithmetic here is the part worth pinning down: `stepToSlot` is the one
 * conversion between "the sequencer's step 23" and "bar 2, row 7", and a silent
 * off-by-one in it would put the playhead in the wrong bar rather than throw.
 * The rest of the file is about the boundaries a modal can walk into: the last
 * bar cannot be removed, the ceiling cannot be passed, and a slot can never
 * point at a pattern that does not exist.
 */

/** A song with `slots` bars, each pointing at the pattern with that index. */
function songWithOrder(order: number[]): Song {
  const song = createSong();
  for (const n of order) ensurePattern(song, n);
  song.order = order.slice();
  return song;
}

describe('a brand-new song', () => {
  it('plays its one pattern, which is exactly what it always did', () => {
    const song = createSong();
    expect(song.order).toEqual([1]);
    expect(orderLabel(song)).toBe('1');
    expect(songSteps(song)).toBe(patternRows(song));
  });
});

describe('counting steps across the order', () => {
  it('is every bar, end to end', () => {
    const song = songWithOrder([1, 2, 1, 3]);
    // Four bars of sixteen steps.
    expect(songSteps(song)).toBe(4 * 16);
  });

  it('follows the grid length, so a longer pattern is a longer song', () => {
    const song = songWithOrder([1, 1]);
    const applied = applyScript(song, 'steps 32');
    if (!applied.ok) throw new Error('steps 32 should apply');
    expect(songSteps(applied.song)).toBe(2 * 32);
  });

  it('names the bar, the pattern and the row for a step', () => {
    const song = songWithOrder([3, 1]);
    expect(stepToSlot(song, 0)).toEqual({ slot: 0, pattern: 2, row: 0 });
    expect(stepToSlot(song, 15)).toEqual({ slot: 0, pattern: 2, row: 15 });
    expect(stepToSlot(song, 16)).toEqual({ slot: 1, pattern: 0, row: 0 });
    expect(stepToSlot(song, 31)).toEqual({ slot: 1, pattern: 0, row: 15 });
    // The loop wraps rather than running off the end, because the engine counts
    // steps forever and asks this what each one means.
    expect(stepToSlot(song, 32)).toEqual({ slot: 0, pattern: 2, row: 0 });
    expect(stepToSlot(song, -1)).toEqual({ slot: 1, pattern: 0, row: 15 });
  });
});

describe('adding, removing and repointing bars', () => {
  it('appends a bar and says which one it was', () => {
    const song = createSong();
    ensurePattern(song, 2);
    expect(appendOrder(song, 2)).toBe(1);
    expect(song.order).toEqual([1, 2]);
  });

  it('refuses the last bar, because a song always plays something', () => {
    const song = createSong();
    expect(removeOrder(song, 0)).toBe(false);
    expect(song.order).toEqual([1]);

    const longer = songWithOrder([1, 2]);
    expect(removeOrder(longer, 0)).toBe(true);
    expect(longer.order).toEqual([2]);
  });

  it('creates the pattern a slot is pointed at, so a slot is never a hole', () => {
    const song = createSong();
    expect(setOrderPattern(song, 0, 4)).toBe(true);
    expect(song.order).toEqual([4]);
    expect(song.patterns.length).toBe(4);
    expect(countNotes(song.patterns[3])).toBe(0);
  });

  it('clamps a slot past the pattern ceiling rather than refusing it', () => {
    const song = songWithOrder([1, 1]);
    setOrderPattern(song, 0, 9999);
    expect(song.order[0]).toBe(64);
  });

  it('holds a ceiling, so a generated song cannot grow without end', () => {
    const song = createSong();
    for (let i = 0; i < MAX_ORDER + 10; i++) appendOrder(song, 1);
    expect(song.order).toHaveLength(MAX_ORDER);
    expect(appendOrder(song, 1)).toBe(-1);
  });
});

describe('a whole order at once, which is what a script writes', () => {
  it('replaces the arrangement and makes every pattern it names', () => {
    const song = createSong();
    setOrder(song, [1, 3, 1]);
    expect(song.order).toEqual([1, 3, 1]);
    expect(song.patterns).toHaveLength(3);
  });

  it('treats an empty order as one bar, because a song has to play something', () => {
    const song = songWithOrder([1, 2]);
    setOrder(song, []);
    expect(song.order).toEqual([1]);
  });

  it('drops entries that are not numbers', () => {
    const song = createSong();
    setOrder(song, [1, Number.NaN, 2]);
    expect(song.order).toEqual([1, 2]);
  });
});

describe('repairing an order', () => {
  it('pulls a slot back inside the patterns that exist', () => {
    // Deleting a pattern is not something the app can do yet, but a song file
    // from somewhere else can arrive with more slots than patterns.
    const song = songWithOrder([1, 2]);
    song.patterns.length = 1;
    normalizeOrder(song);
    expect(song.order).toEqual([1, 1]);
  });

  it('gives a song with no bars one, rather than none', () => {
    const song = createSong();
    song.order = [];
    normalizeOrder(song);
    expect(song.order).toEqual([1]);
  });
});

describe('the silence check before playing', () => {
  it('is true when nothing in the order has a note', () => {
    expect(isOrderEmpty(createSong())).toBe(true);
  });

  it('is false as soon as one bar of the song has music', () => {
    const song = songWithOrder([1, 2]);
    const applied = applyScript(song, 'pattern 2\nC-4 D-4 E-4 F-4');
    if (!applied.ok) throw new Error('the fixture should apply');
    // The first bar is still empty; the song is playable anyway, because the
    // order reaches a bar that is not.
    expect(isOrderEmpty(applied.song)).toBe(false);
  });

  it('ignores bars that play a pattern the order does not reach', () => {
    const song = songWithOrder([1]);
    const applied = applyScript(song, 'pattern 2\nC-4 D-4 E-4 F-4');
    if (!applied.ok) throw new Error('the fixture should apply');
    expect(isOrderEmpty(applied.song)).toBe(true);
  });
});
