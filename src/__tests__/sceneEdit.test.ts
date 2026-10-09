import { describe, expect, it } from 'vitest';

import {
  addScene,
  createSong,
  deleteSceneAt,
  duplicateScene,
  MAX_SCENES,
  nextSceneName,
  renameSceneAt,
  setPatternRows,
  type Scene,
  type Song,
} from '../model';

/**
 * The grid's editing helpers: **a scene can be created, copied, renamed and
 * deleted, and every one of those keeps the list in the order it was built** — so
 * `+ SCENE`, DUPLICATE, DELETE and a typed name are four pure functions a test can
 * check without a canvas.
 */

/** A song with `channels` channels and a few patterns. */
function song(scenes: Scene[] = [], channels = 4): Song {
  const s = createSong();
  setPatternRows(s, 16);
  while (s.tracks.length < channels) s.tracks.push(s.tracks[0]);
  while (s.patterns.length < 4) s.patterns.push(s.patterns[0]);
  s.scenes = scenes;
  return s;
}

describe('a created scene gets a name nobody is using', () => {
  it('numbers from one, skipping names already taken', () => {
    expect(nextSceneName([])).toBe('SCENE 1');
    expect(nextSceneName([{ name: 'SCENE 1', clips: [] }])).toBe('SCENE 2');
    expect(nextSceneName([{ name: 'SCENE 2', clips: [] }])).toBe('SCENE 1');
  });

  it('appends an empty scene with one silent clip per channel', () => {
    const s = song([{ name: 'VERSE', clips: [1, null, 2, null] }]);
    const next = addScene(s.scenes, s.tracks.length);
    expect(next).toHaveLength(2);
    expect(next[1].name).toBe('SCENE 1');
    expect(next[1].clips).toEqual([null, null, null, null]);
  });

  it('refuses past the ceiling rather than growing without bound', () => {
    const full = Array.from({ length: MAX_SCENES }, (_one, i) => ({ name: `S${i}`, clips: [] as (number | null)[] }));
    expect(addScene(full, 4)).toHaveLength(MAX_SCENES);
  });
});

describe('duplicating a scene copies it under a fresh name, right after it', () => {
  it('keeps the position and the clips, and picks a new name', () => {
    const s = song([
      { name: 'INTRO', clips: [1, null, null, null] },
      { name: 'VERSE', clips: [3, 1, 2, 4] },
      { name: 'CHORUS', clips: [2, 1, null, 1] },
    ]);
    const next = duplicateScene(s.scenes, 1, s.tracks.length);
    expect(next.map((one) => one.name)).toEqual(['INTRO', 'VERSE', 'SCENE 1', 'CHORUS']);
    expect(next[2].clips).toEqual([3, 1, 2, 4]);
  });

  it('does nothing for a scene that is not there', () => {
    const s = song([{ name: 'A', clips: [1] }]);
    expect(duplicateScene(s.scenes, 9).map((one) => one.name)).toEqual(['A']);
  });
});

describe('deleting and renaming address a scene by its place', () => {
  it('removes exactly the row asked for, keeping the rest in order', () => {
    const s = song([
      { name: 'A', clips: [1] },
      { name: 'B', clips: [2] },
      { name: 'C', clips: [3] },
    ]);
    expect(deleteSceneAt(s.scenes, 1).map((one) => one.name)).toEqual(['A', 'C']);
    expect(deleteSceneAt(s.scenes, 9).map((one) => one.name)).toEqual(['A', 'B', 'C']);
  });

  it('renames in place, and a collision collapses rather than twinning', () => {
    const s = song([
      { name: 'A', clips: [1] },
      { name: 'B', clips: [2] },
      { name: 'C', clips: [3] },
    ]);
    const renamed = renameSceneAt(s.scenes, 0, 'VERSE');
    expect(renamed.map((one) => one.name)).toEqual(['VERSE', 'B', 'C']);
    const collided = renameSceneAt(s.scenes, 0, 'C');
    expect(collided.map((one) => one.name)).toEqual(['C', 'B']);
    expect(collided[0].clips).toEqual([1]);
  });
});
