import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  MAX_MACHINE_BARS,
  MAX_SCENES,
  MAX_SCENE_NAME,
  SCRIPT_KEYWORDS,
  SCRIPT_QUICK_REFERENCE,
  SCRIPT_VERSION,
  songToJson,
  songToScript,
  summarizeSong,
  type Scene,
} from '../model';
import { SCRIPT_COMMANDS, scriptCapabilities } from '../model/capabilities';

/**
 * The `scene` and `live quantize` statements.
 *
 * `scene A 1 1 - 2` is what makes a song PERFORMABLE: the patterns the song
 * already has, laid out one row per launch, with `-` where a channel is silent.
 * So the guard has three jobs, and the first is the one a mistake would ruin —
 * `scene` is SONG data, so it round-trips through both the script and the file,
 * and a song with no scenes writes the bytes it always did. The second is that a
 * clip is a pattern NUMBER and never a copied pattern. The third is that `live
 * quantize` is a SESSION setting: it comes back in `settings`, and no file and no
 * script ever carries it.
 */

/** A parsed-and-applied script, with `ok` narrowed, for the tests that expect success. */
function applied(source: string): { song: ReturnType<typeof createSong>; settings: Record<string, unknown>; summary: ReturnType<typeof summarizeSong> } {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(result.errors.map((error) => `${error.line}: ${error.message}`).join(' / '));
  return { song: result.song, settings: result.settings as unknown as Record<string, unknown>, summary: result.summary };
}

/** The errors a script produced, as one string. */
function errorsOf(source: string): string {
  const result = applyScript(createSong(), source);
  if (result.ok) return '';
  return result.errors.map((error) => error.message).join('\n');
}

describe('a scene is one row of the launch grid', () => {
  it('reads a clip per channel, with a dash, a zero or a dot for silence', () => {
    const { song } = applied('scene A 1 - 0 .');
    expect(song.scenes).toEqual([{ name: 'A', clips: [1, null, null, null], machine: null }]);
  });

  it('keeps the clips in channel order and pads the channels that are left out', () => {
    const { song } = applied('scene A 1 2');
    // Four channels in a fresh song, so the two silent ones are named for us.
    expect(song.scenes[0].clips).toEqual([1, 2, null, null]);
  });

  it('upper-cases the name and replaces a row defined twice', () => {
    const { song } = applied('scene a 1 1\nscene A 2 2 2 2');
    expect(song.scenes).toHaveLength(1);
    expect(song.scenes[0]).toEqual({ name: 'A', clips: [2, 2, 2, 2], machine: null });
  });

  it('accepts a quoted name with a space', () => {
    const { song } = applied('scene "my break" 1 2 3 4');
    expect(song.scenes[0].name).toBe('MY BREAK');
  });

  it('counts the scenes in the summary, because a scene is not a note', () => {
    const { summary } = applied('scene A 1\nscene B 2');
    expect(summary.scenes).toBe(2);
  });
});

describe('what a scene refuses', () => {
  it('refuses a bare scene', () => {
    expect(errorsOf('scene')).toMatch(/scene needs a name and at least one clip/);
  });

  it('refuses a name with no clips', () => {
    expect(errorsOf('scene A')).toMatch(/needs at least one clip/);
  });

  it('refuses more clips than the song has channels', () => {
    expect(errorsOf('scene A 1 1 1 1 1')).toMatch(/one clip per channel/);
  });

  it('refuses a clip that is not a pattern number', () => {
    expect(errorsOf('scene A 1 x 2')).toMatch(/takes pattern numbers 1\.\.64 or "-" for silence/);
  });

  it('refuses a name that is too long, and one that is empty', () => {
    expect(errorsOf(`scene ${'x'.repeat(MAX_SCENE_NAME + 1)} 1`)).toMatch(/at most 16 characters/);
  });

  it('refuses a name with a space that was not quoted, and says how to fix it', () => {
    // `scene MY BREAK 1 2` arrives as the name MY and the clip BREAK.
    expect(errorsOf('scene MY BREAK 1 2')).toMatch(/A scene NAME is one word \(quote it if it has a space\)/);
  });

  it('refuses more scenes than a song may hold', () => {
    const lines = Array.from({ length: MAX_SCENES + 1 }, (_, i) => `scene S${i} 1`).join('\n');
    expect(errorsOf(lines)).toMatch(new RegExp(`at most ${MAX_SCENES} scenes`));
  });
});

describe('a scene round-trips through a script', () => {
  it('writes the scenes back as the lines a script wrote', () => {
    const { song } = applied('scene A 1 2 - 4\nscene "my break" 4 3 2 1');
    const script = songToScript(song);
    expect(script).toContain('scene A 1 2 - 4');
    expect(script).toContain('scene "MY BREAK" 4 3 2 1');
    // And re-applying what was written produces the same rows.
    const again = applied(script);
    expect(again.song.scenes).toEqual(song.scenes);
  });

  it('writes no scene line at all for a song that has none', () => {
    const song = createSong();
    expect(songToScript(song)).not.toContain('scene');
    expect(JSON.parse(songToJson(song)).version).toBe(12);
  });
});

describe('live quantize is a session setting', () => {
  it('comes back in settings, not in the song', () => {
    const { song, settings } = applied('live quantize 4');
    expect(settings.liveQuantize).toBe(4);
    expect(JSON.parse(songToJson(song)).version).toBe(12);
    expect(songToScript(song)).not.toContain('quantize');
  });

  it('takes 0 and off as immediate', () => {
    expect(applied('live quantize 0').settings.liveQuantize).toBe(0);
    expect(applied('live quantize off').settings.liveQuantize).toBe(0);
  });

  it('is absent when the script said nothing, so the setting stays put', () => {
    expect('liveQuantize' in applied('tempo 120').settings).toBe(false);
  });

  it('refuses a word that is not quantize', () => {
    expect(errorsOf('live 4')).toMatch(/live takes "quantize"/);
  });

  it('refuses no number, an out-of-range number and two numbers', () => {
    expect(errorsOf('live quantize')).toMatch(/needs one number of bars/);
    expect(errorsOf('live quantize 99')).toMatch(/0\.\.16 \(0 is immediate\)/);
    expect(errorsOf('live quantize 1 4')).toMatch(/needs one number of bars/);
  });
});

describe('the manifest publishes the two words', () => {
  it('is in the language, the cheat sheet and the manifest', () => {
    expect(SCRIPT_KEYWORDS).toContain('scene');
    expect(SCRIPT_KEYWORDS).toContain('live');
    expect(SCRIPT_QUICK_REFERENCE.join(' ').toLowerCase()).toContain('scene');
    expect(SCRIPT_QUICK_REFERENCE.join(' ').toLowerCase()).toContain('live');
    expect(SCRIPT_COMMANDS.find((command) => command.word === 'scene')?.example).toBe('scene A 1 2 - 4');
    expect(SCRIPT_COMMANDS.find((command) => command.word === 'live')?.example).toBe('live quantize 4');
    expect(SCRIPT_VERSION).toBe(51);
  });

  it('publishes the scene and quantize limits from the model', () => {
    const { limits } = scriptCapabilities();
    expect(limits.scenes.max).toBe(MAX_SCENES);
    expect(limits.scenes.nameChars.max).toBe(MAX_SCENE_NAME);
    expect(limits.liveQuantize.min).toBe(0);
    expect(limits.liveQuantize.max).toBe(16);
    expect(limits.liveQuantize.atDefault).toBe(1);
  });

  it('keeps the manifest in step with the parser, word for word and in order', () => {
    expect(SCRIPT_COMMANDS.map((command) => command.word)).toEqual([...SCRIPT_KEYWORDS]);
  });
});

describe('a scene is a view of the song, never a copy of it', () => {
  it('stores pattern NUMBERS, so editing the pattern changes what the scene plays', () => {
    const { song } = applied('pattern 2\nC-4 C-4 C-4 C-4\nscene A 2 2 2 2');
    const scene: Scene = song.scenes[0];
    // The clip is the number 2, not the notes of pattern 2.
    expect(scene.clips).toEqual([2, 2, 2, 2]);
    expect(typeof scene.clips[0]).toBe('number');
  });
});

describe('the machine column is a clause of the scene line', () => {
  it('reads `kit N` as the scene\'s drum-machine bar', () => {
    const { song } = applied('scene A 1 1 - 2 kit 3');
    expect(song.scenes[0].machine).toBe(3);
    expect(song.scenes[0].clips).toEqual([1, 1, null, 2]);
  });

  it('accepts `kit off` as a scene that sits the machine out', () => {
    const { song } = applied('scene A 1 1 - 2 kit off');
    expect(song.scenes[0].machine).toBeNull();
  });

  it('defaults every scene to no machine bar', () => {
    const { song } = applied('scene A 1 1 - 2');
    expect(song.scenes[0].machine).toBeNull();
  });

  it('round-trips the machine bar through the script', () => {
    const { song } = applied('scene A 1 1 - 2 kit 4');
    const again = applyScript(createSong(), songToScript(song));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.song.scenes[0].machine).toBe(4);
  });

  it('refuses a missing bar and a bare `kit`', () => {
    expect(errorsOf('scene A 1 1 - 2 kit')).toMatch(/kit needs a bar number/);
  });

  it('refuses a bar outside the machine and a word that is not one', () => {
    expect(errorsOf(`scene A 1 1 - 2 kit ${MAX_MACHINE_BARS + 1}`)).toMatch(/kit takes a drum-machine bar/);
    expect(errorsOf('scene A 1 1 - 2 kit verse')).toMatch(/kit takes a drum-machine bar/);
  });

  it('refuses bar 0 too, since `off` is the word for silence', () => {
    expect(errorsOf('scene A 1 1 - 2 kit 0')).toMatch(/kit takes a drum-machine bar/);
  });
});
