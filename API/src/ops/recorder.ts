/**
 * ops/recorder — audio IN: the RECORDER page as data, a plan, and two honest
 * refusals.
 *
 * The RECORDER page is where audio comes in and goes out. The OUT half — the
 * render region and the loudness target — is SONG data and is already read by
 * `export.plan`; this file is the IN half. A recording and its take are **app
 * state**: the bytes live in the browser session's sample bank, a song holds only
 * a name, and this API is a different process that has none. So the whole surface
 * is split the honest way, the same way `workspace.describe` splits the current
 * page and `live.launch` splits a launch:
 *
 *   • `recorder.describe` reads the takes a caller HANDS IT — the window and loop
 *     the model's own arithmetic resolves — plus the recordings a song references
 *     and the bank's limits. It cannot fetch your takes; it resolves the ones you
 *     already have.
 *   • `recorder.plan` says what a capture WOULD do: the input, the length, the
 *     name it would land under and where. It never records.
 *   • `recorder.capture` and `sample.load` REFUSE, with a reason, exactly as
 *     `export.audio` does on the way out — because a microphone and a live bank
 *     are a browser's, and inventing a second one that is not the app's would be
 *     worse than saying so.
 *
 * The arithmetic is the model's: `makeTake`/`setTakeTrim`/`setTakeLoop` and the
 * `takeWindow`/`takeLoop` readers are the same ones the page draws from, so an
 * agent and the screen cannot disagree about what a take's window says.
 */

import {
  MAX_SAMPLES,
  MAX_SAMPLE_NAME,
  MAX_SAMPLE_SECONDS,
  MIN_SAMPLE_SECONDS,
  SAMPLE_ROOT_HZ,
  makeTake,
  sameTakeName,
  sampleNameProblem,
  setTakeLoop,
  setTakeTrim,
  takeIsLooped,
  takeIsTrimmed,
  takeLabel,
  takeLoop,
  takeMeta,
  takeWindow,
  tidySampleName,
  type Take,
} from '../../../src/model';
import { captureRefusal } from '../../../src/audio/recorder';
import { maybeNumber, maybeObjectList, maybeStr } from '../input';
import { field, schema, type ApiOperation } from '../operation';
import { ok, refuse } from '../result';
import { songFromInput } from '../songAccess';

/** A number read out of a take object, accepting the `"1.2"` a form will send. */
function numberIn(raw: Record<string, unknown>, key: string, fallback: number): number {
  const value = raw[key];
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  refuse('invalid_input', `a take's "${key}" must be a number.`);
}

/** A string read out of a take object. */
function stringIn(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') refuse('invalid_input', `a take's "${key}" must be a string.`);
  return value as string;
}

/**
 * One take, built through the model's own writers.
 *
 * `makeTake` sets the window to the whole recording and the loop to the whole
 * window; a `trim` and a `loop` clause then move them, so the clamping, ordering
 * and loop-refit are the same ones a drag on the page runs. A name that could
 * never be written is refused here, because a take IS a recording the song names
 * with `sample NAME`, and the two share one rule.
 */
function takeFromRaw(raw: Record<string, unknown>): Take {
  const name = tidySampleName(stringIn(raw, 'name'));
  const problem = sampleNameProblem(name);
  if (problem !== null) refuse('invalid_input', `a take needs a name: ${problem}`);
  const peak = Math.min(Math.max(numberIn(raw, 'peak', 0), 0), 1);
  let take = makeTake(name, numberIn(raw, 'seconds', 0), peak);
  if (raw.trimStart !== undefined || raw.trimEnd !== undefined) {
    take = setTakeTrim(take, numberIn(raw, 'trimStart', take.trimStart), numberIn(raw, 'trimEnd', take.trimEnd));
  }
  if (raw.loopStart !== undefined || raw.loopEnd !== undefined) {
    take = setTakeLoop(take, numberIn(raw, 'loopStart', take.loopStart), numberIn(raw, 'loopEnd', take.loopEnd));
  }
  return take;
}

/** A time written the way a `record` line writes it: seconds, no trailing zeros. */
function secs(value: number): string {
  return String(Number(value.toFixed(3)));
}

/** The `record` lines that would rebuild a take's window and loop, if any. */
function takeScript(take: Take): string[] {
  const lines: string[] = [];
  const window = takeWindow(take);
  if (takeIsTrimmed(take)) lines.push(`record trim ${take.name} ${secs(window.start)} ${secs(window.end)}`);
  const loop = takeLoop(take);
  if (loop) lines.push(`record loop ${take.name} ${secs(loop.start)} ${secs(loop.end)}`);
  return lines;
}

/** One take as data: its size, its resolved window, and its loop if it has one. */
function takeDigest(take: Take): unknown {
  const window = takeWindow(take);
  const loop = takeLoop(take);
  return {
    name: take.name,
    seconds: take.seconds,
    peak: take.peak,
    window: { start: window.start, end: window.end, seconds: window.seconds },
    loop: loop === null ? null : { start: loop.start, end: loop.end, seconds: loop.seconds },
    trimmed: takeIsTrimmed(take),
    looped: takeIsLooped(take),
    label: takeLabel(take),
    meta: takeMeta(take),
    script: takeScript(take),
  };
}

/** Every recording a song NAMES, with where it is named — the app supplies the audio. */
function referencesOf(song: NonNullable<ReturnType<typeof songFromInput>>): { name: string; where: string }[] {
  const found: { name: string; where: string }[] = [];
  song.tracks.forEach((track, index) => {
    if (track.sample) found.push({ name: track.sample, where: `channel ${index + 1}` });
  });
  (song.machine?.pads ?? []).forEach((pad, index) => {
    if (pad.sample) found.push({ name: pad.sample, where: `pad ${index + 1}` });
  });
  return found;
}

/**
 * The name a capture would take, avoiding the takes already held.
 *
 * A name is ONE word (a space would end it in a script), so the suggestion is
 * `TAKE-1`, spelled the way the sample bank stores a picked file's name — the
 * same tidy the app runs when it turns `TAKE 1` into a bank name.
 */
function freshTakeName(takes: readonly Take[]): string {
  for (let n = 1; n <= 64; n++) {
    const candidate = `TAKE-${n}`;
    if (!takes.some((take) => sameTakeName(take.name, candidate))) return candidate;
  }
  return `TAKE-${takes.length + 1}`;
}

/** The bank's limits, from the model's own constants. */
const BANK_LIMITS = {
  samples: MAX_SAMPLES,
  nameChars: MAX_SAMPLE_NAME,
  seconds: { min: MIN_SAMPLE_SECONDS, max: MAX_SAMPLE_SECONDS },
  rootHz: SAMPLE_ROOT_HZ,
} as const;

export const recorderOperations: ApiOperation[] = [
  {
    name: 'recorder.describe',
    title: 'Read the recorder takes as data',
    summary:
      'The RECORDER page IN half as data: each take you hand it resolved to the window and loop the app plays (trimmed, looped, its label and the `record` lines that rebuild it), plus every recording a song references and the sample bank\'s limits. A take is app state, so it reads what you pass; the capture itself is the browser\'s.',
    category: 'recorder',
    example: { takes: [{ name: 'HOOK', seconds: 2.4, peak: 0.9, trimStart: 0.1, trimEnd: 2.0 }] },
    input: schema({
      song: field('object', 'The song whose recordings to list. Omit to list none.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
      takes: field('array', 'The takes to resolve: objects with a name (required) and optional seconds, peak, trimStart, trimEnd, loopStart, loopEnd.'),
    }),
    run: (input) => {
      const song = songFromInput(input);
      const rawTakes = maybeObjectList(input, 'takes') ?? [];
      const takes = rawTakes.map(takeFromRaw);
      return ok({
        // A take is app state; the capture needs a browser. The read is honest
        // about both rather than pretending the API holds your recordings.
        available: false,
        reason: captureRefusal(),
        limits: BANK_LIMITS,
        takes: takes.map(takeDigest),
        count: takes.length,
        references: song ? referencesOf(song) : [],
        note: 'a take and its recording live in the app, so this read resolves the takes you pass it; the region and the loudness an export uses are song data and are read by export.plan.',
      });
    },
  },
  {
    name: 'recorder.plan',
    title: 'Plan a capture',
    summary:
      'What a capture WOULD do: the input it would use (a microphone, unavailable here), the length it would take, the name it would land under and whether that replaces one you hold — so an agent can stage a session even though recording needs a browser.',
    category: 'recorder',
    example: { name: 'HOOK', seconds: 4 },
    input: schema({
      takes: field('array', 'The takes and bank names already held, so the plan can say whether a capture replaces one. Each is an object with a name.'),
      name: field('string', 'The name the capture would take, e.g. "HOOK". Omit and the plan suggests the next free TAKE n.'),
      seconds: field('number', `How long the capture would run, in seconds, clamped to ${MIN_SAMPLE_SECONDS}..${MAX_SAMPLE_SECONDS}.`),
    }),
    run: (input) => {
      const takes = (maybeObjectList(input, 'takes') ?? []).map(takeFromRaw);
      const asked = maybeStr(input, 'name');
      const name = asked === null ? freshTakeName(takes) : tidySampleName(asked);
      if (asked !== null) {
        const problem = sampleNameProblem(name);
        if (problem !== null) refuse('invalid_input', `"name" must be a take name: ${problem}`);
      }
      const requested = maybeNumber(input, 'seconds');
      const seconds = requested === null ? null : Math.min(Math.max(requested, MIN_SAMPLE_SECONDS), MAX_SAMPLE_SECONDS);
      const replaces = takes.some((take) => sameTakeName(take.name, name));
      const bankFull = !replaces && takes.length >= MAX_SAMPLES;
      const refusal = captureRefusal();
      return ok({
        available: false,
        reason: refusal,
        device: { input: 'microphone', available: false, reason: refusal },
        name,
        seconds,
        replaces,
        bankFull,
        landsIn: 'the sample bank and the RECORDER page\'s take list',
        script: `record ${name}`,
        steps: [
          refusal ?? 'this build cannot capture audio.',
          `a capture would record for up to ${MAX_SAMPLE_SECONDS}s and land in the bank under the name ${name}${replaces ? ', replacing the recording already held' : ''}.`,
          bankFull
            ? `the bank holds ${MAX_SAMPLES} recordings and is full, so a new name would be refused until one is removed.`
            : `the bank holds up to ${MAX_SAMPLES} recordings and this one would fit.`,
          'name it on a channel with `sample NAME` (a track.set edit, or a `sample NAME` clause on a track line), then the channel plays it.',
        ],
        note: 'a capture is session state the app performs; this plan changes nothing and records nothing.',
      });
    },
  },
  {
    name: 'recorder.capture',
    title: 'Capture audio (not available here)',
    summary: 'Would record a take from the microphone — but a capture needs a browser\'s MediaRecorder and a live AudioContext, so this API refuses and says so.',
    category: 'recorder',
    example: {},
    input: schema({
      name: field('string', 'The name the capture would take, e.g. "HOOK".'),
    }),
    run: () => {
      refuse(
        'unsupported',
        captureRefusal() ?? 'this build cannot capture audio.',
        [
          'capture needs a browser with a microphone: the app records through MediaRecorder and decodes through an AudioContext, neither of which exists in Node.',
          'use recorder.plan to stage the take, then record it in the app (page recorder) and name it on a channel with `sample NAME`.',
        ],
      );
    },
  },
  {
    name: 'sample.load',
    title: 'Load a recording (not available here)',
    summary: 'Would fetch or import a .wav into the app\'s sample bank — but the bank is the browser session\'s app state, so this API refuses and says so.',
    category: 'recorder',
    example: { path: 'samples/break.wav' },
    input: schema({
      path: field('string', 'The .wav a `sample load` line would fetch and put in the bank.'),
    }),
    run: () => {
      refuse(
        'unsupported',
        'loading a recording is app state: a .wav lives in the browser session\'s sample bank, and this API is a separate process that holds none.',
        [
          'in the app, use F2 → SAMPLES… or `sample load "path"` to bring a recording into the bank; the song only ever NAMES it with `sample NAME`.',
          'this API can still write the REFERENCE: give a channel `sample BRK02` with a track.set edit, or a `track 2 "HOOK" wave sample sample BRK02` line.',
        ],
      );
    },
  },
];
