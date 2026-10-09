/**
 * scenes — the song's patterns as CLIPS you can launch by hand.
 *
 * Everything Tracklet plays is LINEAR: an `order` says which pattern plays in
 * each bar, and the song walks it from the top. That is the right shape for a
 * finished record and the wrong one for playing: there is no way to bring a part
 * in on the next bar, drop one out, or try the chorus's beat under the verse.
 *
 * A **scene** is one row of a launch grid — the pattern each CHANNEL plays in it,
 * or nothing:
 *
 * ```text
 *               ch1      ch2      ch3      ch4
 * scene A       1        1        -        2
 * scene B       -        3        3        4
 * ```
 *
 * Pressing a scene plays it LOOPED until the next one is launched, which is the
 * other kind of music-making a tracker has never had. Nothing here is a new
 * sound: a clip is a pattern the song already has, and a scene is a VIEW that
 * says which pattern each channel is on — so performing and writing are the same
 * material, and an export or a script cannot tell them apart.
 *
 * ── What a scene is, and is not ──────────────────────────────────────────────
 *
 * A scene stores NO notes. Its `clips` are pattern NUMBERS (1-based, the same
 * numbers `order` uses), one per channel, with `null` for "this channel is
 * silent in this scene". That is deliberate: a clip that held a copy of a pattern
 * would be a second arrangement, and editing the pattern would leave the scene
 * playing the old one.
 *
 * A scene's LENGTH is the song's channel count, the same way a pattern's rows are
 * the song's `steps`: clips is read and clamped against the channels the song has
 * at the moment it is read, so a scene saved with four channels opened in a
 * two-channel song plays its first two and ignores the rest.
 *
 * Phaser-free and audio-free like the rest of `model/`.
 */

import { MAX_MACHINE_BARS } from './machine';
import { MAX_TRACKS, clampPatternNumber } from './song';

/**
 * How many scenes a song may define.
 *
 * Thirty-two, and the number is a performance rather than a file size: a live set
 * of a few dozen rows is a whole gig, and the LIVE page has to draw them all at
 * once. It is also small enough that `live.describe` and a screen can list them
 * without paging.
 */
export const MAX_SCENES = 32;

/**
 * How long a scene name may be, in characters.
 *
 * Sixteen, the same budget a channel's name gets, because both are labels a
 * person reads in a grid rather than prose. The difference is that a scene name
 * is what a script and an agent LAUNCH by, so it is one a script can spell.
 */
export const MAX_SCENE_NAME = 16;

/**
 * The token a scene's clip list uses for "this channel plays nothing".
 *
 * `null` in the model, `-` in a script line and `null` in the file — the same
 * three spellings a clip has everywhere. It is `null` rather than `0` because `0`
 * is not a pattern and never will be (`patterns` is 1-based), so the two can
 * never be confused.
 */
export const SCENE_SILENCE = null;

/**
 * How soon a launch lands, in BARS: the live page's `QUANTIZE` setting.
 *
 * `live quantize 4` waits for the next four-bar line before the launched scene
 * takes over, so a launch is always a musical decision rather than a race with the
 * clock. `0` is the one value that is not a wait — it launches IMMEDIATELY, at the
 * next step — and it is a real setting rather than "off": a person looping one
 * bar and chopping it by hand wants exactly that.
 *
 * Sixteen is the ceiling because a quantize longer than a whole section is not a
 * quantize at all: you would launch and then wait through the part you were
 * trying to change. It is a SESSION setting, like `theme`, and no file carries it.
 */
export const MIN_LIVE_QUANTIZE = 0;
export const MAX_LIVE_QUANTIZE = 16;
export const DEFAULT_LIVE_QUANTIZE = 1;

/** A quantize amount, cleaned: whole bars `MIN_LIVE_QUANTIZE`..`MAX_LIVE_QUANTIZE`. */
export function clampLiveQuantize(bars: number): number {
  if (!Number.isFinite(bars)) return DEFAULT_LIVE_QUANTIZE;
  return Math.max(MIN_LIVE_QUANTIZE, Math.min(MAX_LIVE_QUANTIZE, Math.round(bars)));
}

/** The characters a bare scene name may be made of, for a script line. */
const BARE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * One row of the launch grid.
 *
 * Plain data, like every other part of a song: it is written to a file, cloned by
 * the undo stack and compared by a test, and none of that needs a class.
 */
export interface Scene {
  /** The name, as written: upper case, up to `MAX_SCENE_NAME` characters. */
  name: string;
  /**
   * The pattern each channel plays, one entry per channel, 1-based — or `null`
   * for a channel that is silent in this scene.
   *
   * Entry `i` is channel `i + 1`, the same column order a pattern's rows use.
   */
  clips: (number | null)[];
  /**
   * The drum machine's BAR this scene performs, 1-based — or `null` for a scene
   * that sits the machine out.
   *
   * The machine is a column of the launch grid exactly as it is on the mixer:
   * its clip is a bar rather than a pattern, because that is what a machine has.
   * A song with no machine ignores this, the same way a scene ignores channels it
   * does not reach.
   *
   * Optional in the TYPE so a scene written before the machine column existed (or
   * a test literal) need not carry it; every helper normalises it to `null`.
   */
  machine?: number | null;
}

/** A clip cleaned: a whole pattern number 1..`MAX_PATTERNS`, or `null` for silence. */
export function clampSceneClip(clip: number | null | undefined): number | null {
  if (clip === null || clip === undefined) return null;
  if (!Number.isFinite(clip)) return null;
  // A number at or below zero is not a pattern — `patterns` is 1-based — so it
  // reads as silence rather than as pattern 1, which is the one reading a person
  // could not have meant.
  if (clip <= 0) return null;
  return clampPatternNumber(clip);
}

/** Upper-case a name and cut it to the budget: how a reader repairs one. */
export function tidySceneName(text: string): string {
  return text.trim().toUpperCase().slice(0, MAX_SCENE_NAME);
}

/**
 * The machine bar a scene performs, cleaned: a whole bar 1..`MAX_MACHINE_BARS`, or
 * `null` for a scene that sits the machine out.
 *
 * The same bargain `clampSceneClip` makes: a number at or below zero is not a bar
 * (`bars` are 1-based), so it reads as silence rather than as bar 1.
 */
export function clampSceneBar(bar: number | null | undefined): number | null {
  if (bar === null || bar === undefined) return null;
  if (!Number.isFinite(bar)) return null;
  if (bar <= 0) return null;
  return Math.max(1, Math.min(MAX_MACHINE_BARS, Math.round(bar)));
}

/** True when a name fits the limit — what the script parser checks. */
export function isSceneNameLength(name: string): boolean {
  return name.trim().length <= MAX_SCENE_NAME;
}

/**
 * Why a name cannot be used, in the words the parser prints, or `null`.
 *
 * A REFUSAL rather than a repair, for the reason a section's name is one: a
 * scene name is how a script and an agent refer to a scene, so silently trimming
 * `A VERY LONG SCENE NAME` would rename the row a launch was aimed at. A space is
 * NOT refused — a scene name is a label and a label may have one — but the script
 * then has to quote it, which is what `sceneNameSpelling` is for.
 */
export function sceneNameProblem(text: string): string | null {
  const name = text.trim();
  if (name === '') return 'a scene needs a name, e.g. "scene A 1 1 2 2".';
  if (name.length > MAX_SCENE_NAME) {
    return `a scene name may be at most ${MAX_SCENE_NAME} characters; "${name}" is ${name.length}. Shorten it.`;
  }
  return null;
}

/** True when two names are the same scene, however each was typed. */
export function sameSceneName(a: string, b: string): boolean {
  return tidySceneName(a) === tidySceneName(b);
}

/**
 * How a scene's name is written in a script line, quoted only when it has to be.
 *
 * A bare word is what most scenes want (`scene VERSE1 …`); a name with a space is
 * quoted (`scene "MY BREAK" …`) so the clip numbers after it still read as a list.
 */
export function sceneNameSpelling(name: string): string {
  const tidy = tidySceneName(name);
  return BARE_NAME.test(tidy) ? tidy : `"${tidy}"`;
}

/**
 * The clips as a list of exactly `channels` entries, each inside its range.
 *
 * Shorter lists are PADDED with silence and longer ones CUT, because a scene's
 * length is the song's channel count and a file written when the song had six
 * channels is not a broken file when it is opened in one that has four. Values
 * are clamped rather than refused, the same bargain a lane's amount makes.
 */
export function clampSceneClips(
  clips: readonly (number | null)[],
  channels = clips.length,
): (number | null)[] {
  const count = Math.max(1, Math.min(MAX_TRACKS, Math.round(channels)));
  const out: (number | null)[] = [];
  for (let i = 0; i < count; i++) out.push(clampSceneClip(clips[i]));
  return out;
}

/**
 * One scene with every field inside the range its own tables allow.
 *
 * `channels` is the song's channel count when a caller knows it — the file reader
 * and the page both do — and is otherwise the length the scene already has, so a
 * helper never invents channels a scene does not have.
 */
export function tidyScene(scene: Scene, channels = scene.clips.length): Scene {
  return {
    name: tidySceneName(scene.name),
    clips: clampSceneClips(scene.clips, channels),
    machine: clampSceneBar(scene.machine),
  };
}

/** A copy of the whole list, tidied — what the file reader runs a song through. */
export function tidyScenes(scenes: readonly Scene[], channels?: number): Scene[] {
  const out: Scene[] = [];
  for (const scene of scenes) {
    const tidied = tidyScene(scene, channels ?? scene.clips.length);
    if (tidied.name === '') continue;
    const at = out.findIndex((one) => one.name === tidied.name);
    if (at >= 0) out[at] = tidied;
    else out.push(tidied);
  }
  return out.slice(0, MAX_SCENES);
}

/**
 * Add or REPLACE a scene by name, keeping the list in the order it was built.
 *
 * Replacing rather than appending is what makes `scene A 1 1 2` twice mean "scene
 * A is this now": a script is read top to bottom and the last line about a name is
 * the one that counts, the same rule the sections, the tempo map and the lanes
 * follow.
 */
export function withScene(scenes: readonly Scene[], scene: Scene, channels = scene.clips.length): Scene[] {
  const tidied = tidyScene(scene, channels);
  const at = scenes.findIndex((one) => one.name === tidied.name);
  if (at >= 0) {
    const next = scenes.slice();
    next[at] = tidied;
    return next;
  }
  return [...scenes, tidied].slice(0, MAX_SCENES);
}

/** Drop a scene by name, for a menu that offers a delete. */
export function withoutScene(scenes: readonly Scene[], name: string): Scene[] {
  return scenes.filter((one) => !sameSceneName(one.name, name));
}

/** The scene at an index, or `null` when there is none. */
export function sceneAt(scenes: readonly Scene[], index: number): Scene | null {
  if (!Number.isFinite(index)) return null;
  return scenes[Math.round(index)] ?? null;
}

/** Look one up by name, however it was typed. `null` when the song has none. */
export function sceneByName(scenes: readonly Scene[], name: string): Scene | null {
  const wanted = tidySceneName(name);
  return scenes.find((one) => one.name === wanted) ?? null;
}

/**
 * Rename a scene in place, keeping its position.
 *
 * A rename that collides with another scene REPLACES it rather than making two
 * rows with one name, for the same reason `withScene` does: a name addresses a
 * scene, so two scenes could never be launched apart.
 */
export function renameScene(scenes: readonly Scene[], from: string, to: string): Scene[] {
  const at = scenes.findIndex((one) => sameSceneName(one.name, from));
  if (at < 0) return scenes.slice();
  const name = tidySceneName(to);
  return scenes
    .map((one, i) => (i === at ? { name, clips: one.clips.slice(), machine: one.machine ?? null } : { name: one.name, clips: one.clips.slice(), machine: one.machine ?? null }))
    // The renamed row keeps its place; any OTHER row already wearing the new name
    // goes, because a name addresses one scene and two rows could never launch apart.
    .filter((one, i) => i === at || one.name !== name);
}

/**
 * A name no scene is using yet: `SCENE 1`, `SCENE 2`, … .
 *
 * Addresses the one thing a created scene needs before it can be launched — a
 * unique name — so `+ SCENE` is a single press rather than a rename first.
 */
export function nextSceneName(scenes: readonly Scene[]): string {
  for (let n = 1; n <= MAX_SCENES; n++) {
    const candidate = `SCENE ${n}`;
    if (!scenes.some((one) => sameSceneName(one.name, candidate))) return candidate;
  }
  return `SCENE ${scenes.length + 1}`;
}

/** Append a fresh, EMPTY scene (every channel silent) with a unique name. */
export function addScene(scenes: readonly Scene[], channels: number): Scene[] {
  if (scenes.length >= MAX_SCENES) return scenes.slice();
  return [...scenes, { name: nextSceneName(scenes), clips: clampSceneClips([], channels), machine: null }];
}

/** Copy a scene under a fresh name, right after it, so a row can be varied. */
export function duplicateScene(scenes: readonly Scene[], index: number, channels?: number): Scene[] {
  const at = Math.round(index);
  const source = scenes[at];
  if (!source || scenes.length >= MAX_SCENES) return scenes.slice();
  const copy: Scene = { name: nextSceneName(scenes), clips: clampSceneClips(source.clips, channels ?? source.clips.length), machine: clampSceneBar(source.machine) };
  return [...scenes.slice(0, at + 1), copy, ...scenes.slice(at + 1)];
}

/** Remove the scene at an index, keeping the rest in order. */
export function deleteSceneAt(scenes: readonly Scene[], index: number): Scene[] {
  const at = Math.round(index);
  if (at < 0 || at >= scenes.length) return scenes.slice();
  return scenes.filter((_one, i) => i !== at);
}

/** Rename the scene at an index, collapsing a collision the way `renameScene` does. */
export function renameSceneAt(scenes: readonly Scene[], index: number, name: string): Scene[] {
  const at = Math.round(index);
  if (at < 0 || at >= scenes.length) return scenes.slice();
  return renameScene(scenes, scenes[at].name, name);
}

/** Every scene name, in the order they were defined. */
export function sceneNames(scenes: readonly Scene[]): string[] {
  return scenes.map((scene) => scene.name);
}

/** Whether two scenes say the same thing, for a menu or a test. */
export function sameScene(a: Scene, b: Scene): boolean {
  return a.name === b.name
    && (a.machine ?? null) === (b.machine ?? null)
    && a.clips.length === b.clips.length
    && a.clips.every((clip, i) => clip === b.clips[i]);
}

/** What one channel plays in a scene: a 1-based pattern number, or `null`. */
export function sceneClipPattern(scene: Scene, channel: number): number | null {
  if (!Number.isFinite(channel)) return null;
  return scene.clips[Math.round(channel) - 1] ?? null;
}

/** One scene with a channel's clip set, for a cell that cycles a pattern. */
export function withSceneClip(scene: Scene, channel: number, clip: number | null, channels = scene.clips.length): Scene {
  const clips = scene.clips.slice();
  const at = Math.round(channel) - 1;
  if (at >= 0 && at < clips.length) clips[at] = clampSceneClip(clip);
  return { name: scene.name, clips: clampSceneClips(clips, channels), machine: clampSceneBar(scene.machine) };
}

/** One scene with its machine bar set, for the drum-machine column's cells. */
export function withSceneMachine(scene: Scene, bar: number | null): Scene {
  return { name: scene.name, clips: scene.clips.slice(), machine: clampSceneBar(bar) };
}

/**
 * How a launch grid writes one scene: `A  1 1 - 2`.
 *
 * A dash where a channel is silent, so the row's shape is readable at a glance —
 * a blank would leave a gap that could be a missing channel or a missing number.
 */
export function sceneLabel(scene: Scene): string {
  const clips = scene.clips.map((clip) => (clip === null ? '-' : String(clip)));
  return `${scene.name}  ${clips.join(' ')}`;
}

/** How the app writes one scene as a script line, so a song can save and reopen. */
export function sceneScript(scene: Scene): string {
  const clips = scene.clips.map((clip) => (clip === null ? '-' : String(clip)));
  const kit = scene.machine == null ? '' : ` kit ${scene.machine}`;
  return `scene ${sceneNameSpelling(scene.name)} ${clips.join(' ')}${kit}`;
}

/** The scenes as one block of lines, or an empty string when there are none. */
export function scenesToScript(scenes: readonly Scene[]): string {
  return scenes.map(sceneScript).join('\n');
}
