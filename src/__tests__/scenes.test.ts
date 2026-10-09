import { describe, expect, it } from 'vitest';

import {
  clampSceneClip,
  clampSceneClips,
  createSong,
  MAX_SCENES,
  MAX_SCENE_NAME,
  renameScene,
  sameScene,
  sameSceneName,
  sceneAt,
  sceneByName,
  sceneClipPattern,
  sceneLabel,
  sceneNameProblem,
  sceneNameSpelling,
  sceneNames,
  sceneScript,
  scenesToScript,
  SCENES_SONG_FILE_VERSION,
  SONG_FILE_VERSION,
  songFromJson,
  songToJson,
  tidyScene,
  tidySceneName,
  tidyScenes,
  withScene,
  withSceneClip,
  withoutScene,
  type Scene,
} from '../model';

/**
 * Scenes, tested as the promise they are: **a row of the launch grid is a
 * pattern per channel, so performing and writing are the same material** — and a
 * song with no scenes is byte-for-byte the song it always was.
 *
 * Two halves matter here. The MODEL half is that a scene stores pattern numbers
 * and never notes, so a clip cannot go stale when a pattern is edited. The FILE
 * half is the version rule: a song with scenes must declare 41, because a build
 * that predates Live would drop the key without a word and hand back a linear
 * song. The tests below check both, plus the padding rule that lets a scene
 * written for six channels open in a four-channel song.
 */

/** A scene, with the fields a test does not care about filled in. */
function scene(name = 'A', clips: (number | null)[] = [1, 1, null, 2]): Scene {
  return { name, clips };
}

describe('a clip is a pattern number, or silence', () => {
  it('reads a number at or below zero as silence, never as pattern 1', () => {
    // The one reading a person could not have meant: `patterns` is 1-based, so
    // `0` is not the first pattern, it is "nothing here".
    expect(clampSceneClip(0)).toBeNull();
    expect(clampSceneClip(-3)).toBeNull();
    expect(clampSceneClip(null)).toBeNull();
    expect(clampSceneClip(undefined)).toBeNull();
    expect(clampSceneClip(Number.NaN)).toBeNull();
  });

  it('clamps a real pattern number into the song\'s range', () => {
    expect(clampSceneClip(1)).toBe(1);
    expect(clampSceneClip(99)).toBe(64);
    expect(clampSceneClip(2.4)).toBe(2);
  });

  it('fits a clip list to the channels it is read against, padding and cutting', () => {
    // A scene is one entry per channel: a shorter list gains silence, a longer one
    // is cut, because the length is the SONG's and not the scene's.
    expect(clampSceneClips([1, 2], 4)).toEqual([1, 2, null, null]);
    expect(clampSceneClips([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3]);
    // With no channel count it keeps the length it was given rather than inventing
    // channels a caller never named.
    expect(clampSceneClips([1, 2])).toEqual([1, 2]);
  });
});

describe('a scene name is a label a script and an agent can address', () => {
  it('upper-cases and cuts to the budget', () => {
    expect(tidySceneName('  verse1 ')).toBe('VERSE1');
    expect(tidySceneName('x'.repeat(30))).toBe('x'.repeat(MAX_SCENE_NAME).toUpperCase());
  });

  it('refuses an empty name and one that is too long, and accepts the rest', () => {
    expect(sceneNameProblem('')).not.toBeNull();
    expect(sceneNameProblem('   ')).not.toBeNull();
    expect(sceneNameProblem('x'.repeat(MAX_SCENE_NAME + 1))).not.toBeNull();
    expect(sceneNameProblem('VERSE1')).toBeNull();
    // A space is allowed — a scene name is a label — the script just quotes it.
    expect(sceneNameProblem('MY BREAK')).toBeNull();
  });

  it('quotes a name only when it has to', () => {
    expect(sceneNameSpelling('verse1')).toBe('VERSE1');
    expect(sceneNameSpelling('my break')).toBe('"MY BREAK"');
  });

  it('compares names the way a reader reads them', () => {
    expect(sameSceneName('verse1', 'VERSE1')).toBe(true);
    expect(sameSceneName('A', 'B')).toBe(false);
  });
});

describe('the scene list keeps one row per name, in the order it was built', () => {
  it('adds a scene, then replaces it by name rather than appending', () => {
    const first = withScene([], scene('A', [1, 1, 1, 1]));
    const again = withScene(first, scene('a', [2, 2, 2, 2]));
    expect(again).toHaveLength(1);
    expect(again[0].name).toBe('A');
    expect(again[0].clips).toEqual([2, 2, 2, 2]);
  });

  it('drops a scene by name, however it was typed', () => {
    const list = withScene(withScene([], scene('A')), scene('B'));
    expect(sceneNames(withoutScene(list, 'a'))).toEqual(['B']);
  });

  it('looks one up by name or by index', () => {
    const list = withScene(withScene([], scene('A')), scene('B'));
    expect(sceneByName(list, 'b')?.name).toBe('B');
    expect(sceneByName(list, 'C')).toBeNull();
    expect(sceneAt(list, 1)?.name).toBe('B');
    expect(sceneAt(list, 9)).toBeNull();
  });

  it('renames in place, and a collision replaces rather than duplicating', () => {
    const list = withScene(withScene([], scene('A')), scene('B'));
    const renamed = renameScene(list, 'A', 'VERSE');
    expect(sceneNames(renamed)).toEqual(['VERSE', 'B']);
    // Renaming onto B's name leaves ONE B, because a name addresses a scene.
    const collide = renameScene(list, 'A', 'b');
    expect(sceneNames(collide)).toEqual(['B']);
  });

  it('caps the list at the budget', () => {
    let list: Scene[] = [];
    for (let i = 0; i < MAX_SCENES + 5; i++) list = withScene(list, scene(`S${i}`));
    expect(list).toHaveLength(MAX_SCENES);
  });

  it('tidies a whole list, dropping the nameless and collapsing duplicates', () => {
    const tidied = tidyScenes([scene('a', [1]), scene('', [2]), scene('A', [3])], 2);
    expect(tidied).toHaveLength(1);
    expect(tidied[0]).toEqual({ name: 'A', clips: [3, null], machine: null });
  });

  it('compares two scenes by value', () => {
    expect(sameScene(scene('A'), scene('A'))).toBe(true);
    expect(sameScene(scene('A'), scene('B'))).toBe(false);
    expect(sameScene(scene('A', [1]), scene('A', [1, null]))).toBe(false);
  });
});

describe('reading and writing one clip', () => {
  it('reads a channel\'s clip, 1-based like every column in this app', () => {
    const s = scene('A', [1, null, 3, 4]);
    expect(sceneClipPattern(s, 1)).toBe(1);
    expect(sceneClipPattern(s, 2)).toBeNull();
    expect(sceneClipPattern(s, 3)).toBe(3);
    expect(sceneClipPattern(s, 8)).toBeNull();
  });

  it('sets a channel\'s clip and keeps the row the same length', () => {
    const next = withSceneClip(scene('A', [1, 1, 1, 1]), 2, 5, 4);
    expect(next.clips).toEqual([1, 5, 1, 1]);
    // A channel past the end changes nothing, and a clip of zero becomes silence.
    expect(withSceneClip(next, 9, 3, 4).clips).toEqual([1, 5, 1, 1]);
    expect(withSceneClip(next, 1, 0, 4).clips).toEqual([null, 5, 1, 1]);
  });
});

describe('a scene writes back as the line a script wrote', () => {
  it('draws silence as a dash, so a row\'s shape is readable', () => {
    expect(sceneLabel(scene('A', [1, 1, null, 2]))).toBe('A  1 1 - 2');
    expect(sceneScript(scene('A', [1, 1, null, 2]))).toBe('scene A 1 1 - 2');
  });

  it('quotes a name with a space so the clips still read as a list', () => {
    expect(sceneScript(scene('my break', [1, 2]))).toBe('scene "MY BREAK" 1 2');
  });

  it('writes a whole set as one block of lines', () => {
    const block = scenesToScript([scene('A', [1, 1]), scene('B', [2, null])]);
    expect(block).toBe('scene A 1 1\nscene B 2 -');
  });
});

describe('a song with no scenes is the song it always was', () => {
  it('starts empty, and writes version 12 with no scenes key', () => {
    const song = createSong();
    expect(song.scenes).toEqual([]);
    const file = JSON.parse(songToJson(song)) as Record<string, unknown>;
    expect(file.version).toBe(SONG_FILE_VERSION);
    expect('scenes' in file).toBe(false);
  });
});

describe('the scenes key and its version', () => {
  it('writes version 41, and only then, when a song has scenes', () => {
    const song = createSong();
    song.scenes = withScene([], scene('A', [1, 1, null, 2]), song.tracks.length);
    const file = JSON.parse(songToJson(song)) as Record<string, unknown>;
    expect(file.version).toBe(SCENES_SONG_FILE_VERSION);
    expect(file.scenes).toEqual([{ name: 'A', clips: [1, 1, null, 2] }]);
  });

  it('reads the scenes back byte for byte', () => {
    const song = createSong();
    song.title = 'LIVE SET';
    song.scenes = withScene(
      withScene([], scene('A', [1, 2, null, 4]), song.tracks.length),
      scene('B', [4, 3, 2, 1]),
      song.tracks.length,
    );
    const parsed = songFromJson(songToJson(song));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.song.scenes).toEqual(song.scenes);
    // And writing the reopened song again is the same file.
    expect(songToJson(parsed.song)).toBe(songToJson(song));
  });

  it('pads and cuts the clips to the channels the file itself has', () => {
    const song = createSong();
    const file = JSON.parse(songToJson(song)) as Record<string, unknown>;
    file.version = SCENES_SONG_FILE_VERSION;
    file.scenes = [
      { name: 'SHORT', clips: [1, 2] },
      { name: 'LONG', clips: [1, 2, 3, 4, 5, 6] },
    ];
    const parsed = songFromJson(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.song.scenes).toEqual([
      { name: 'SHORT', clips: [1, 2, null, null], machine: null },
      { name: 'LONG', clips: [1, 2, 3, 4], machine: null },
    ]);
  });

  it('refuses a scene whose clips are not a list of numbers or null', () => {
    const song = createSong();
    const file = JSON.parse(songToJson(song)) as Record<string, unknown>;
    file.version = SCENES_SONG_FILE_VERSION;
    file.scenes = [{ name: 'A', clips: [1, 'x', 3, 4] }];
    const parsed = songFromJson(JSON.stringify(file));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join('\n')).toMatch(/scene 1 \("A"\) has a clip/);
  });

  it('refuses a scene with no name', () => {
    const song = createSong();
    const file = JSON.parse(songToJson(song)) as Record<string, unknown>;
    file.version = SCENES_SONG_FILE_VERSION;
    file.scenes = [{ clips: [1, 1, 1, 1] }];
    const parsed = songFromJson(JSON.stringify(file));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join('\n')).toMatch(/scene 1 needs a "name"/);
  });

  it('refuses a file that claims more scenes than a song may hold', () => {
    const song = createSong();
    const file = JSON.parse(songToJson(song)) as Record<string, unknown>;
    file.version = SCENES_SONG_FILE_VERSION;
    file.scenes = Array.from({ length: MAX_SCENES + 1 }, (_, i) => ({ name: `S${i}`, clips: [1, 1, 1, 1] }));
    const parsed = songFromJson(JSON.stringify(file));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join('\n')).toMatch(new RegExp(`at most ${MAX_SCENES} scenes`));
  });

  it('refuses a scene that is not an object at all', () => {
    const song = createSong();
    const file = JSON.parse(songToJson(song)) as Record<string, unknown>;
    file.version = SCENES_SONG_FILE_VERSION;
    file.scenes = [42];
    const parsed = songFromJson(JSON.stringify(file));
    expect(parsed.ok).toBe(false);
  });
});

describe('a scene is plain data', () => {
  it('tidies in place without inventing channels', () => {
    expect(tidyScene(scene('a', [1, 0, 9]))).toEqual({ name: 'A', clips: [1, null, 9], machine: null });
  });
});
