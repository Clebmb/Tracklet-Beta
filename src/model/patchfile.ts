/**
 * patchfile — a channel's SOUND as a small JSON document of its own.
 *
 * A song here is portable: `.txt` or `.json`, and either one opens on somebody
 * else's machine and plays. The sound inside it was not. A channel's sound lived
 * in the song that used it and in the local library `F4` saves to, and neither
 * travels — so the supersaw you spent an evening on could be described in a
 * message and not handed over. This file fixes that, and the item it lands for
 * asks for exactly that: *a sound is portable the way a song already is*.
 *
 * ── What a patch IS: the sound, and nothing about the mix ────────────────────
 * The line is drawn once, and everything follows from it: **a patch carries
 * everything that shapes a NOTE, and nothing about where the channel sits.**
 *
 *   in     the voice (layer 1) and the stack above it, the filter's `shape`,
 *          the channel effects, `hold` (how long a note rings), the two
 *          expression knobs `glide` and `vibrato`, the two SENDS `verb` and
 *          `echo` (how much of this sound stands in the room — the room itself
 *          stays the song's), and the NAME of a sample it plays.
 *
 *   out    `name`, `muted`, `level`, `pan`, `bus` — the mix: how loud, which
 *          side, which group. A patch that carried a level would silently re-mix
 *          a song the moment somebody tried the sound in it.
 *          `duck`, because one channel ducking the others is a RELATIONSHIP, and
 *          a patch has no idea what else is playing.
 *          `groove` and `humanize`, the feel: how a part is played against the
 *          beat rather than what it sounds like — and loading a sound must never
 *          move a note in time.
 *          `poly`, which is a part's ROLE in the arrangement (how many notes it
 *          may hold at once) and not a property of the noise it makes.
 *          Everything of the SONG's — its kit, its tuning, its room, its form —
 *          because a patch has no song to be a part of.
 *
 * ── Why it is NOT the sound `F4` saves ───────────────────────────────────────
 * The saved voices in `F4`'s library are the INSTRUMENT: a voice and a stack.
 * They are a palette for the song you are writing, and they deliberately stop
 * there. A patch file carries the whole sound including its shaping, because the
 * alternative is a lie: a sound that came back with its `drive`, its filter and
 * its room stripped off would not be the sound you saved, and nothing in a file
 * would say which parts had been dropped. So the two are different sizes on
 * purpose, and each says so where it is defined.
 *
 * ── A file, so it follows a file's rules ────────────────────────────────────
 * `format` and `version` are the first two keys, so a reader knows what it has
 * before it reads a value, and a `.patch.json` dropped on a song reader is
 * refused in words rather than read as a song with no channels. Reading follows
 * the same policy as `songfile.ts`, which is worth stating because it is the
 * thing a hand-edited file will meet: a value that is merely out of range is
 * CLAMPED (the author meant "as bright as possible"), while anything that would
 * have to be DROPPED to be accepted is REFUSED with a sentence — opening a patch
 * that sounds thinner than the file says is a lie about the sound, not a repair
 * of it.
 *
 * Phaser-free and audio-free like the rest of `model/`.
 */

import {
  clampEffects,
  clampGlide,
  clampHold,
  clampSend,
  clampVibrato,
  DEFAULT_HOLD,
  DEFAULT_TRACK_ECHO,
  DEFAULT_VERB,
  HOLD_STEPS,
  MAX_SEND,
  MIN_SEND,
  TRACK_EFFECTS,
  type ChannelEffects,
} from './song';
import { sampleNameProblem, tidySampleName } from './sample';
import { DEFAULT_SHAPE, shapeFromName, shapeNames, type FilterShape } from './shape';
import type { Layer, StackedSound } from './instrument';
import type { VoiceParams } from './voice';
import {
  effectFields,
  fileSlug,
  layerForFile,
  numberOf,
  readEffects,
  readStack,
  readVoice,
  voiceForFile,
} from './songfile';

/** The word in `format`, so a reader knows a patch from a song before it looks. */
export const PATCH_FILE_FORMAT = 'tracklet-patch';

/**
 * The version of the patch document itself.
 *
 * A number of its OWN, not `SONG_FILE_VERSION`: these are two formats that
 * happen to share a vocabulary, and a future song-only field must not make every
 * patch file in the world look stale — or worse, make a patch look newer than
 * the build that wrote it. A patch is at version 1 because this is the first.
 */
export const PATCH_FILE_VERSION = 1;

/** What the file is CALLED: `.patch.json`, so the `.json` habit still works. */
export const PATCH_FILE_EXTENSION = '.patch.json';

/** What a patch with no name of its own is called, and what its file is named. */
export const PATCH_NAME_FALLBACK = 'PATCH';

/**
 * The longest name a patch will keep.
 *
 * A name is not a filename — the filename is derived from it — so this is only
 * about a menu row and a status line: long enough for `WARM STRINGS FROM THE
 * SECOND SESSION`, short enough not to run off either.
 */
export const PATCH_NAME_LIMIT = 40;

/**
 * Everything that shapes a note, and nothing about the mix.
 *
 * The type exists so the boundary above is a THING rather than a paragraph:
 * `patchToJson` takes one of these, `soundFromTrack` makes one, and a field that
 * is not in it is a field a patch cannot carry — so a change to the line has to
 * be made in the type before it can be made anywhere else.
 */
export interface PatchSound {
  /** Layer 1: the channel's voice. */
  voice: VoiceParams;
  /** Layers 2..4, in playing order. Empty on a channel that was never stacked. */
  stack: Layer[];
  /** Which part of the sound survives the channel's filter. */
  shape: FilterShape;
  /** How many steps a note on this sound rings for — the sound's own tail. */
  hold: number;
  /** How far it slides into each note, and how far its pitch wobbles. */
  glide: number;
  vibrato: number;
  /** How much of this sound stands in the song's reverb, and in its echo. */
  verb: number;
  echo: number;
  /** The channel's effects, each 0..100 with 0 meaning off. */
  effects: ChannelEffects;
  /**
   * A `Track` carries those six as flat fields rather than as an object, so this
   * type carries them BOTH ways: `PatchSound.effects` for a patch's own shape,
   * and `extends ChannelEffects` for the shape a channel already has. See
   * `soundFromTrack`.
   */
  /** The name of a recording this sound plays, or null for the built-in one. */
  sample: string | null;
}

/**
 * A channel's sound, as a patch would carry it.
 *
 * The projection the whole feature rests on, in one direction. It reads the
 * sound fields and NOTHING else, which is what makes `applySoundToTrack` below
 * safe to run on a channel somebody has already mixed: there is no field in a
 * patch for it to overwrite a level with.
 */
export function soundFromTrack(track: StackedSound & PatchMixFields): PatchSound {
  const effects: Partial<ChannelEffects> = {};
  for (const effect of TRACK_EFFECTS) effects[effect.id] = track[effect.id];
  return {
    voice: track.voice,
    stack: track.stack,
    shape: track.shape ?? DEFAULT_SHAPE,
    hold: track.hold,
    glide: track.glide,
    vibrato: track.vibrato,
    verb: track.verb,
    echo: track.echo,
    effects: clampEffects(effects),
    sample: track.sample,
  };
}

/**
 * The sound fields a `Track` has, named structurally.
 *
 * `StackedSound` already covers the voice, the stack and the shape; these are
 * the rest of what a patch carries. A structural type rather than an import of
 * `Track` for the same reason `StackedSound` gives: anything with these fields
 * can be asked for its sound, and a test can build one without a whole song.
 * The EFFECTS are read through `effects` rather than as one field each, because
 * that is the shape a `Track` already has them in (`ChannelEffects`).
 */
export interface PatchMixFields extends ChannelEffects {
  hold: number;
  glide: number;
  vibrato: number;
  verb: number;
  echo: number;
  sample: string | null;
}

/**
 * Write a sound onto a channel, leaving everything about the mix alone.
 *
 * The other direction, and the one that has to be careful: it writes exactly the
 * fields `soundFromTrack` reads and touches nothing else — not the name, not the
 * level, not the pan, not the group, not the part's role, not its pocket. A
 * channel that was muted stays muted, and a channel sitting at 40% is not turned
 * up by a sound that happened to be saved at full.
 *
 * A LAYER COPY, not the patch's own objects: the same patch applied to four
 * channels must not leave four channels reading one array, or editing one
 * channel's layer would change three others.
 */
export function applySoundToTrack(track: StackedSound & PatchMixFields, sound: PatchSound): void {
  track.voice = { ...sound.voice };
  track.stack = sound.stack.map((layer) => ({ ...layer }));
  track.shape = sound.shape;
  track.hold = clampHold(sound.hold);
  track.glide = clampGlide(sound.glide);
  track.vibrato = clampVibrato(sound.vibrato);
  track.verb = clampSend(sound.verb);
  track.echo = clampSend(sound.echo);
  for (const effect of TRACK_EFFECTS) track[effect.id] = sound.effects[effect.id];
  track.sample = sound.sample;
}

/**
 * The document, as the text a file holds.
 *
 * The shape is a SONG FILE'S CHANNEL, plus a header — the same keys, spelled the
 * same way, written by the same functions. That is deliberate and it is the
 * whole reason the sound half of `songfile.ts` is exported: a reader that knows
 * what a channel looks like in a Tracklet file already knows what a patch looks
 * like, and there is one place to change if a knob is ever renamed.
 *
 * Everything at its neutral value is LEFT OUT, exactly as a song file leaves it,
 * so the smallest patch is four keys and a big one is still a screenful at most.
 */
export function patchToJson(sound: PatchSound, name: string): string {
  const file: Record<string, unknown> = {
    format: PATCH_FILE_FORMAT,
    version: PATCH_FILE_VERSION,
    name: tidyPatchName(name),
    voice: voiceForFile(sound.voice),
  };
  if (sound.stack.length > 0) file.stack = sound.stack.map(layerForFile);
  if (sound.shape !== DEFAULT_SHAPE) file.shape = sound.shape;
  if (sound.hold !== DEFAULT_HOLD) file.hold = sound.hold;
  if (sound.glide !== 0) file.glide = sound.glide;
  if (sound.vibrato !== 0) file.vibrato = sound.vibrato;
  // A SEND IS OPEN BY DEFAULT — the one default in the model that is not zero —
  // so a channel standing fully in the room writes no key at all, and a channel
  // deliberately held BACK is the one that has to be written. Getting this
  // backwards would round-trip every dry channel into a wet one.
  if (sound.verb !== DEFAULT_VERB) file.verb = sound.verb;
  if (sound.echo !== DEFAULT_TRACK_ECHO) file.echo = sound.echo;
  // The effects come out inline, exactly as a channel's do, and only when
  // they are on.
  Object.assign(file, effectFields(sound.effects));
  if (sound.sample !== null) file.sample = sound.sample;
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * The five numbers a patch carries, each with the range its OWN control has.
 *
 * A table rather than five copies of the same six lines, and the ranges come from
 * the model: `hold` is a ring LENGTH (one of `HOLD_STEPS`, so its ceiling is 16
 * steps and not a percentage), while the other four are the 0..100 knobs and
 * sends they mirror. A refusal that quoted the wrong range would send an author
 * looking for a bug in a value that was fine, so there is one place to be right.
 */
const NUMBER_FIELDS: readonly { key: 'hold' | 'glide' | 'vibrato' | 'verb' | 'echo'; low: number; high: number }[] = [
  { key: 'hold', low: HOLD_STEPS[0] ?? 1, high: HOLD_STEPS[HOLD_STEPS.length - 1] ?? 16 },
  { key: 'glide', low: 0, high: 100 },
  { key: 'vibrato', low: 0, high: 100 },
  { key: 'verb', low: MIN_SEND, high: MAX_SEND },
  { key: 'echo', low: MIN_SEND, high: MAX_SEND },
];

/** What reading a patch came to: the sound, its name, or what is wrong with it. */
export type PatchFileParse =
  | { ok: true; sound: PatchSound; name: string }
  | { ok: false; errors: string[] };

/**
 * Read a patch document. Never throws, and returns what is wrong rather than
 * repairing it into something that would sound different from the file.
 *
 * The one refusal worth calling out is the FIRST one, because it is the one a
 * reader will actually meet: a `.json` song dropped here is refused by name
 * ("this is a Tracklet song, not a patch") rather than read as a patch with no
 * sound, and a patch dropped on `OPEN FILE` is refused the same way in the other
 * direction. Two formats that both start with `{` deserve to say which they are.
 */
export function patchFromJson(text: string): PatchFileParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`this file is not JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['a patch file must be a JSON object like { "format": "tracklet-patch", ... }.'] };
  }
  const entry = raw as Record<string, unknown>;
  // What IS this file — asked before anything is read out of it, and answered
  // with the other format's name when it is the other format's file.
  if (entry.format !== PATCH_FILE_FORMAT) {
    return {
      ok: false,
      errors: [typeof entry.format === 'string'
        ? `this is not a patch file: its "format" is "${entry.format}".`
        : 'this is not a patch file: it has no "format" key.'],
    };
  }
  const version = typeof entry.version === 'number' ? entry.version : 0;
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, errors: [`this patch file's "version" must be a whole number 1 or more; got ${JSON.stringify(entry.version)}.`] };
  }
  if (version > PATCH_FILE_VERSION) {
    return {
      ok: false,
      errors: [`this patch was written by a newer version of Tracklet (patch file ${version}; this build reads ${PATCH_FILE_VERSION}). Update the app, or ask for the patch again from a build you have.`],
    };
  }

  const errors: string[] = [];
  const where = 'this patch';
  const voice = readVoice(entry, where, errors);
  if (!voice) return { ok: false, errors };
  const stack = readStack(entry, where, errors);
  if (!stack) return { ok: false, errors };
  const effects = readEffects(entry, where, errors);
  if (!effects) return { ok: false, errors };

  // The filter's shape. REFUSED rather than dropped when it is not one this
  // build knows, for the reason a song file refuses it: falling back to the
  // low-pass would play a different instrument from the one the file asked for.
  let shape: FilterShape = DEFAULT_SHAPE;
  if (entry.shape !== undefined) {
    const kind = typeof entry.shape === 'string' ? shapeFromName(entry.shape) : null;
    if (!kind) {
      return { ok: false, errors: [`${where}'s "shape" must be a filter shape this app knows (${shapeNames()}); got ${JSON.stringify(entry.shape)}.`] };
    }
    shape = kind.id;
  }

  // The numbers. Each is clampable EXCEPT for one that is not a number at all,
  // which is a mistake about the format rather than a taste written twice.
  const amounts: Partial<Record<'hold' | 'glide' | 'vibrato' | 'verb' | 'echo', number>> = {};
  for (const field of NUMBER_FIELDS) {
    const value = entry[field.key];
    if (value === undefined) continue;
    const amount = numberOf(value);
    if (amount === null) {
      errors.push(`${where}'s "${field.key}" must be a number ${field.low}..${field.high}; got ${JSON.stringify(value)}.`);
      return { ok: false, errors };
    }
    amounts[field.key] = amount;
  }

  // The sample. Checked for SPELLING and not against a list, because the bank is
  // the APP's rather than the file's — a patch naming a recording this machine
  // does not have still loads (its built-in one-shot plays), which is what makes
  // a patch portable. See `model/sample.ts`.
  let sample: string | null = null;
  if (entry.sample !== undefined && entry.sample !== null) {
    const problem = typeof entry.sample === 'string' ? sampleNameProblem(entry.sample) : 'it is not a name';
    if (problem !== null) {
      return { ok: false, errors: [`${where}'s "sample" must be the name of a recording, e.g. "BRK02": ${problem}.`] };
    }
    sample = tidySampleName(entry.sample as string);
  }

  return {
    ok: true,
    name: tidyPatchName(typeof entry.name === 'string' ? entry.name : ''),
    sound: {
      voice,
      stack,
      shape,
      hold: clampHold(amounts.hold ?? DEFAULT_HOLD),
      glide: clampGlide(amounts.glide ?? 0),
      vibrato: clampVibrato(amounts.vibrato ?? 0),
      verb: clampSend(amounts.verb ?? DEFAULT_VERB),
      echo: clampSend(amounts.echo ?? DEFAULT_TRACK_ECHO),
      effects,
      sample,
    },
  };
}

/**
 * A name tidied for a patch: trimmed, collapsed, shortened, and never empty.
 *
 * Deliberately NOT the rule for a saved voice's name (one word of letters), and
 * the difference is the point: a saved voice is addressed BY NAME from a script
 * (`track 1 voice MYPAD`), while a patch's name is only ever read by a person on
 * a row and a status line. So this one may have spaces, which is what a title
 * wants, and it never has to be a token.
 */
export function tidyPatchName(text: string): string {
  // Upper case, because everything this app prints is: a channel name, a voice
  // name and a menu row alike. A name is only ever read on a row and in a status
  // line, and a patch called `warm pad` beside a channel called `BASS` would look
  // like it came from somewhere else.
  const flat = text.replace(/\s+/g, ' ').trim().slice(0, PATCH_NAME_LIMIT).trim().toUpperCase();
  return flat === '' ? PATCH_NAME_FALLBACK : flat;
}

/** The file a patch of this name is written to: `warm-pad.patch.json`. */
export function patchFileName(name: string): string {
  return `${fileSlug(tidyPatchName(name), PATCH_NAME_FALLBACK)}${PATCH_FILE_EXTENSION}`;
}

/**
 * The name to give a patch read from a file, when the file does not say.
 *
 * The stem of the filename with the extension off and the dashes turned back
 * into spaces, so a patch written by this app and one written by hand both
 * arrive with something sensible on the row. Only a fallback: a file that names
 * itself keeps its own name.
 */
export function patchNameFromFile(fileName: string): string {
  const lower = fileName.toLowerCase();
  const stem = lower.endsWith(PATCH_FILE_EXTENSION)
    ? fileName.slice(0, -PATCH_FILE_EXTENSION.length)
    : fileName.replace(/\.json$/i, '');
  return tidyPatchName(stem.replace(/[-_]+/g, ' '));
}

/**
 * One line about a sound, for the status well after a save or a load.
 *
 * Written as a sentence about what is IN the patch rather than a list of fields,
 * because the useful question after loading somebody's sound is \"what did I
 * just get\" — three layers is a different instrument from one, and whether it
 * is shaped tells you whether it will sit the same way in your own mix.
 */
export function patchAbout(sound: PatchSound): string {
  const layers = sound.stack.length + 1;
  const parts: string[] = [`${layers} layer${layers === 1 ? '' : 's'}`];
  const on = Object.entries(sound.effects)
    .filter(([, amount]) => typeof amount === 'number' && amount > 0)
    .map(([id]) => id);
  parts.push(on.length === 0 ? 'no effects' : `${on.join(' + ')} on`);
  if (sound.shape !== DEFAULT_SHAPE) parts.push(`a ${sound.shape} filter`);
  if (sound.sample !== null) parts.push(`plays ${sound.sample}`);
  // The sends, and only when they are not what they are by default. A send is
  // OPEN unless somebody closed it, so saying `100 room` about every patch ever
  // saved would be one true sentence too many — and `no room` is the interesting
  // case, which is exactly the one a default-omitting rule would hide.
  if (sound.verb !== DEFAULT_VERB) parts.push(sound.verb === 0 ? 'no room' : `${sound.verb} room`);
  if (sound.echo !== DEFAULT_TRACK_ECHO) parts.push(sound.echo === 0 ? 'no echo' : `${sound.echo} echo`);
  return parts.join(', ');
}

/** A patch's sound as a one-line heading, for a menu row: `WARM PAD - 3 layers`. */
export function patchRowLabel(name: string, sound: PatchSound): string {
  const layers = sound.stack.length + 1;
  return `${name}  -  ${layers} layer${layers === 1 ? '' : 's'}`;
}
