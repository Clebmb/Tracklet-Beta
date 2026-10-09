/**
 * ops/live — the LIVE page as data, and a launch as an instruction.
 *
 * The LIVE page is a launch grid: `Song.scenes` holds one row per scene, each a
 * pattern number per channel (or silence) plus the drum-machine bar the scene
 * performs. `script.apply` writes those rows, `song.edit`'s `scene.*` edits change
 * them one at a time, and this is the read half — without it an agent could build a
 * live set but not look at the one it built.
 *
 * ── What a launch is, and what it is not ─────────────────────────────────────
 *
 * `live.launch` does NOT change the song, and it cannot: which scene is playing is
 * a PERFORMANCE, session state like `solo`, and the API is a separate process that
 * has never seen the window you are looking at (see the MCP panel's own caveat). So
 * a launch is answered the honest way — the scene is resolved by name, and the
 * answer says what would be queued and where, with `queued: false` and a sentence
 * saying the queue lives in the app's session. That is the same split
 * `workspace.describe` makes for the current page: the API reports the instruction
 * a running app would follow rather than pretending to be the running app.
 */

import {
  MAX_SCENES,
  clampLiveQuantize,
  createSong,
  MAX_LIVE_QUANTIZE,
  patternRows,
  sceneByName,
  sceneNameSpelling,
  scenesToScript,
  type Scene,
  type Song,
} from '../../../src/model';
import { maybeNumber, maybeStr } from '../input';
import { field, schema, type ApiOperation } from '../operation';
import { refuse, ok } from '../result';
import { songFromInput } from '../songAccess';

/** One scene as data: its name, its per-channel clips and its machine bar. */
function sceneDigest(song: Song, scene: Scene): unknown {
  const machine = scene.machine ?? null;
  return {
    name: scene.name,
    // The name spelled the way a `scene` line spells it, so a caller can paste it.
    script: sceneNameSpelling(scene.name),
    clips: scene.clips.map((clip, index) => {
      const pattern = clip === null ? null : song.patterns[clip - 1];
      return {
        channel: index + 1,
        channelName: song.tracks[index]?.name ?? `CH ${index + 1}`,
        pattern: clip,
        patternName: pattern?.name ?? null,
        // The notes a channel sounds in the scene's bar, for a screen or a test:
        // the clip's own pattern, read at THIS channel's column.
        notes: clip === null || !song.patterns[clip - 1]
          ? 0
          : song.patterns[clip - 1].steps.reduce(
              (count, row) => count + (row[index]?.note !== null && row[index] !== undefined ? 1 : 0),
              0,
            ),
      };
    }),
    machine,
    machineLabel: machine === null ? null : `B${machine}`,
  };
}

export const liveOperations: ApiOperation[] = [
  {
    name: 'live.describe',
    title: 'Read the live launch grid',
    summary:
      'The LIVE page as data: every scene, its per-channel clips with the pattern names they play, and the drum-machine bar it performs — plus which scene is performing (always null here, because the API cannot see the running app).',
    category: 'live',
    example: {},
    input: schema({
      song: field('object', 'The song whose scenes to read. Omit to read a blank song, which has none.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
    }),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      return ok({
        scenes: song.scenes.map((scene) => sceneDigest(song, scene)),
        count: song.scenes.length,
        maxScenes: MAX_SCENES,
        channels: song.tracks.length,
        bars: patternRows(song),
        hasMachine: song.machine !== null,
        // The rows as the script block, so a caller can put the set in a script.
        script: scenesToScript(song.scenes),
        // The one thing the API cannot see: which row is playing is session state.
        performing: null,
        note: 'which scene is performing is session state and is not in this read; a launch is a performance, not a file change.',
      });
    },
  },
  {
    name: 'live.launch',
    title: 'Resolve a scene launch',
    summary:
      'Look a scene up by name and answer with what a running app would queue at the next quantize boundary — the row, its clips and its machine bar — without changing the song. A launch is session state, so nothing is written.',
    category: 'live',
    example: { name: 'VERSE' },
    input: schema(
      {
        song: field('object', 'The song to launch from. Omit to launch from a blank song, which has no scenes.'),
        songJson: field('string', 'The same, as the text of a .json song file.'),
        name: field('string', 'Which scene to launch, by name, e.g. "VERSE".'),
        quantize: field('number', `How many bars the launch waits for, 0..${MAX_LIVE_QUANTIZE} (0 is immediate). Defaults to 1, the app's own setting.`),
      },
      ['name'],
    ),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const name = maybeStr(input, 'name');
      if (name === null) refuse('invalid_input', '"name" is required — which scene to launch, e.g. "VERSE".');
      const scene = sceneByName(song.scenes, name as string);
      if (!scene) {
        const have = song.scenes.length === 0
          ? 'this song has none yet — write one with a scene.set edit or a `scene` line'
          : `this song has: ${song.scenes.map((one) => one.name).join(', ')}`;
        refuse('not_found', `there is no scene called "${String(name).toUpperCase()}" — ${have}.`);
      }
      const index = song.scenes.indexOf(scene as Scene);
      const quantize = clampLiveQuantize(maybeNumber(input, 'quantize') ?? 1);
      return ok({
        name: (scene as Scene).name,
        index,
        scene: sceneDigest(song, scene as Scene),
        quantize,
        // The instruction, in the words the page uses: `quantize` bars, or the next
        // step when it is 0. The step it lands on is the running app's clock to
        // resolve, so the API names the wait rather than a step it cannot know.
        wait: quantize === 0 ? 'the next step' : quantize === 1 ? 'the next bar' : `the next ${quantize} bars`,
        queued: false,
        note: 'this API does not drive the running app, so nothing was queued; a running app queues this scene at its next quantize boundary, and the launch is never saved to the song.',
      });
    },
  },
];
