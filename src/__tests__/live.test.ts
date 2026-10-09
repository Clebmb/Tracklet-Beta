import { describe, expect, it } from 'vitest';

import {
  activeCue,
  activeScene,
  canPerform,
  createSong,
  ensurePattern,
  isBoundary,
  liveRowAt,
  nextBoundary,
  patternRows,
  pendingCue,
  pruneCues,
  quantizeSpan,
  sceneClip,
  sceneIsSilent,
  sceneRow,
  sceneStepNotes,
  setCellNotes,
  setPatternRows,
  stepNotes,
  withCue,
  type LiveCue,
  type Song,
} from '../model';

/**
 * The arithmetic behind the LIVE page: **a launch lands on a bar line, and a
 * scene is one bar of the song's own patterns looped** — tested here without the
 * engine and without Phaser, because both the scheduler and the screen ask these
 * functions and must get the same answer.
 *
 * The two halves are the clock (a cue waits for a boundary; a launch never
 * lands early) and the material (a scene reads each channel's clip through the
 * same `rowNotes` the linear scheduler uses, but only that channel's column).
 */

/** An empty song with `rows` steps in its grid, ready for notes. */
function blank(rows = 16): Song {
  const song = createSong();
  setPatternRows(song, rows);
  ensurePattern(song, 1);
  return song;
}

/** Put one note on a channel/row of a 1-based pattern. */
function note(song: Song, oneBased: number, row: number, track: number, midi: number): void {
  const pattern = ensurePattern(song, oneBased);
  setCellNotes(pattern.steps[row][track], [midi]);
}

/** A song whose pattern 1 has a note on channels 0 and 1, and pattern 2 on channel 0. */
function stacked(): Song {
  const song = blank(16);
  note(song, 1, 0, 0, 60);
  note(song, 1, 0, 1, 72);
  note(song, 1, 4, 0, 62);
  note(song, 2, 0, 0, 67);
  song.scenes = [
    { name: 'A', clips: [1, null, null, null] },
    { name: 'B', clips: [2, 1, null, null] },
    { name: 'QUIET', clips: [null, null, null, null] },
  ];
  return song;
}

describe('a quantize span is bars of the song, and 0 is "now"', () => {
  it('counts one bar as the song grid, so 1 bar of 16 rows is 16 steps', () => {
    expect(quantizeSpan(1, 16)).toBe(16);
    expect(quantizeSpan(4, 16)).toBe(64);
    expect(quantizeSpan(4, 8)).toBe(32);
  });

  it('reads 0 as a single step rather than never, which is the opposite of now', () => {
    // The one setting that is not a wait: `live quantize 0` must take over at
    // the very next step, and a span of zero would mean "never".
    expect(quantizeSpan(0, 16)).toBe(1);
    expect(quantizeSpan(-5, 16)).toBe(1);
  });

  it('never divides by a zero-height bar', () => {
    expect(quantizeSpan(1, 0)).toBe(1);
  });
});

describe('a launch waits for the NEXT line, never the one it is inside', () => {
  it('lands on the next bar multiple for a quantize of N bars', () => {
    expect(nextBoundary(0, 4, 16)).toBe(64);
    expect(nextBoundary(10, 4, 16)).toBe(64);
    expect(nextBoundary(64, 4, 16)).toBe(128);
    expect(nextBoundary(65, 4, 16)).toBe(128);
    expect(nextBoundary(1, 1, 16)).toBe(16);
    expect(nextBoundary(15, 1, 16)).toBe(16);
    expect(nextBoundary(16, 1, 16)).toBe(32);
  });

  it('is strictly after the step asked about, so a bar-line launch is not early', () => {
    // Already exactly on the line: the next line, not this one.
    expect(nextBoundary(16, 1, 16)).toBe(32);
  });

  it('takes over immediately when quantize is 0', () => {
    expect(nextBoundary(5, 0, 16)).toBe(6);
    expect(nextBoundary(0, 0, 16)).toBe(1);
  });

  it('names the lines a screen can draw', () => {
    expect(isBoundary(0, 4, 16)).toBe(true);
    expect(isBoundary(63, 4, 16)).toBe(false);
    expect(isBoundary(64, 4, 16)).toBe(true);
    // Quantize 0 makes every step a line, because every step is a landing.
    expect(isBoundary(7, 0, 16)).toBe(true);
    expect(isBoundary(-1, 4, 16)).toBe(false);
  });
});

describe('the cue list is a queue of launches, oldest first', () => {
  it('replaces a cue that lands at the same step, so the second press wins', () => {
    const first = withCue([], { atStep: 64, scene: 0 });
    const second = withCue(first, { atStep: 64, scene: 1 });
    expect(second).toEqual([{ atStep: 64, scene: 1 }]);
  });

  it('keeps the list ordered by the step a launch lands on', () => {
    let cues: LiveCue[] = [];
    cues = withCue(cues, { atStep: 128, scene: 1 });
    cues = withCue(cues, { atStep: 64, scene: 0 });
    expect(cues.map((one) => one.atStep)).toEqual([64, 128]);
  });

  it('reads the cue IN FORCE as the last launch that has happened by then', () => {
    const cues: LiveCue[] = [
      { atStep: 0, scene: 0 },
      { atStep: 64, scene: 1 },
      { atStep: 128, scene: null },
    ];
    expect(activeCue(cues, 0)?.scene).toBe(0);
    expect(activeCue(cues, 10)?.scene).toBe(0);
    expect(activeCue(cues, 64)?.scene).toBe(1);
    expect(activeCue(cues, 127)?.scene).toBe(1);
    // A STOP ALL is a real cue, not the absence of one.
    expect(activeScene(cues, 128)).toBeNull();
    expect(activeCue(cues, 128)).toEqual({ atStep: 128, scene: null });
  });

  it('has no cue in force before the first one', () => {
    const cues: LiveCue[] = [{ atStep: 64, scene: 0 }];
    expect(activeCue(cues, 0)).toBeNull();
    expect(activeScene(cues, 0)).toBeNull();
  });

  it('shows the launch still to happen as pending', () => {
    const cues: LiveCue[] = [
      { atStep: 0, scene: 0 },
      { atStep: 64, scene: 1 },
    ];
    expect(pendingCue(cues, 0)?.scene).toBe(1);
    expect(pendingCue(cues, 64)).toBeNull();
    expect(pendingCue([{ atStep: 0, scene: 0 }], 5)).toBeNull();
  });

  it('prunes spent cues but keeps the one in force, so performing does not stop', () => {
    const cues: LiveCue[] = [
      { atStep: 0, scene: 0 },
      { atStep: 64, scene: 1 },
      { atStep: 128, scene: null },
    ];
    const kept = pruneCues(cues, 70);
    // The active cue (64) stays: it is the answer for every step until 128.
    expect(kept).toEqual([
      { atStep: 64, scene: 1 },
      { atStep: 128, scene: null },
    ]);
    expect(activeScene(kept, 70)).toBe(1);
  });
});

describe('a scene is one bar of the song, looped', () => {
  it('maps a step onto the scene bar row, the same row the grid uses', () => {
    expect(liveRowAt(0, 16)).toBe(0);
    expect(liveRowAt(15, 16)).toBe(15);
    expect(liveRowAt(16, 16)).toBe(0);
    expect(liveRowAt(33, 16)).toBe(1);
  });
});

describe('a clip is a reference into the song, not a copy', () => {
  it('reads a channel’s pattern by its 1-based number', () => {
    const song = stacked();
    expect(sceneClip(song, 0, 0)).toBe(1);
    expect(sceneClip(song, 0, 1)).toBeNull();
    expect(sceneClip(song, 1, 1)).toBe(1);
    // A scene that does not exist is silence, never a crash.
    expect(sceneClip(song, 99, 0)).toBeNull();
  });

  it('knows a song can perform only when it has a scene', () => {
    expect(canPerform(createSong())).toBe(false);
    expect(canPerform(stacked())).toBe(true);
  });

  it('reports a scene whose every clip is silent as silent', () => {
    const song = stacked();
    expect(sceneIsSilent(song, 2)).toBe(true);
    expect(sceneIsSilent(song, 0)).toBe(false);
    expect(sceneIsSilent(song, 99)).toBe(true);
  });

  it('renders a scene as the pattern each channel would play', () => {
    const song = stacked();
    expect(sceneRow(song, 1)).toEqual([2, 1, null, null]);
    expect(sceneRow(song, 99)).toEqual([]);
  });
});

describe('a scene sounds its own channels and nobody else’s', () => {
  it('reads one pattern per channel, only that channel’s column', () => {
    const song = stacked();
    // Scene A: channel 0 plays pattern 1. Pattern 1 also holds a note on channel
    // 1, but a scene says what EACH channel plays — that other note is not
    // scene A's, which is the difference between a scene and the order.
    const notes = sceneStepNotes(song, 0, 0);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ track: 0, midi: 60 });
  });

  it('mixes channels from different patterns in one step', () => {
    const song = stacked();
    // Scene B: channel 0 plays pattern 2, channel 1 plays pattern 1.
    const notes = sceneStepNotes(song, 1, 0);
    expect(notes.map((one) => [one.track, one.midi])).toEqual([
      [0, 67],
      [1, 72],
    ]);
  });

  it('loops the scene bar: the same row comes round each bar', () => {
    const song = stacked();
    const rows = patternRows(song);
    // Row 4 of scene A is channel 0's 62, and it comes back one bar later.
    const atBar1 = sceneStepNotes(song, 0, 4).map((one) => one.midi);
    const atBar2 = sceneStepNotes(song, 0, 4 + rows).map((one) => one.midi);
    expect(atBar1).toEqual([62]);
    expect(atBar2).toEqual([62]);
  });

  it('is silent for a silent scene, a missing scene and a missing pattern', () => {
    const song = stacked();
    expect(sceneStepNotes(song, 2, 0)).toEqual([]);
    expect(sceneStepNotes(song, 99, 0)).toEqual([]);
    // A clip that names a pattern the song no longer has is silence, not a crash.
    song.scenes[0].clips[0] = 60;
    expect(sceneStepNotes(song, 0, 0)).toEqual([]);
  });

  it('carries the playing of a note, not just its pitch', () => {
    const song = stacked();
    const notes = sceneStepNotes(song, 0, 0);
    // The articulation and drum travel with the note, so live and export cannot
    // disagree about how a step is played.
    expect(notes[0]).toHaveProperty('articulation');
    expect(notes[0]).toHaveProperty('drum');
    expect(notes[0]).toHaveProperty('velocity');
  });
});

describe('one step of the performance is a scene, or the order', () => {
  it('plays the song’s own order when nothing is performing', () => {
    const song = stacked();
    // The order is `[1]`, so step 0 is row 0 of pattern 1: channel 0's 60. The
    // order sounds BOTH channels of the pattern, unlike a scene.
    const notes = stepNotes(song, [], 0, 0);
    expect(notes.map((one) => one.track)).toEqual([0, 1]);
  });

  it('sounds the active scene from its own bar once a launch has happened', () => {
    const song = stacked();
    const cues = [{ atStep: 0, scene: 0 }];
    // Scene A is channel 0 only, so the order's channel-1 note is gone.
    expect(stepNotes(song, cues, 0, 0).map((one) => one.track)).toEqual([0]);
  });

  it('keeps the order until the launch’s boundary, then switches exactly once', () => {
    const song = stacked();
    const cues = [{ atStep: 16, scene: 1 }];
    // Before the line: still the order.
    expect(stepNotes(song, cues, 0, 0).map((one) => one.track)).toEqual([0, 1]);
    // At the line, and every step after it, the scene.
    expect(stepNotes(song, cues, 0, 16).map((one) => one.track)).toEqual([0, 1]);
    expect(stepNotes(song, cues, 16, 32)[0]).toMatchObject({ track: 0, midi: 67 });
  });

  it('returns to the order on a STOP ALL cue', () => {
    const song = stacked();
    const cues = [
      { atStep: 0, scene: 0 },
      { atStep: 32, scene: null },
    ];
    expect(stepNotes(song, cues, 0, 0).map((one) => one.track)).toEqual([0]);
    // STOP ALL is a real launch, not the absence of one: the order comes back.
    expect(stepNotes(song, cues, 0, 32).map((one) => one.track)).toEqual([0, 1]);
  });
});
