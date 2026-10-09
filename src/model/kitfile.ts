/**
 * kitfile — a DRUM KIT as a small JSON document of its own.
 *
 * `patchfile.ts` made a channel's sound portable; this is the same promise one
 * scope out. A kit is four patches, and it was as stuck as a sound was: the four
 * built-in sets travel inside the app and a kit you dialed in lived nowhere but
 * the song that happened to be playing it. So `MYHOUSE` could be described in a
 * message and not handed over. A `.kit.json` fixes that — *a sound is portable
 * the way a song already is*, now including the four of them a drummer plays.
 *
 * ── What a kit file IS ───────────────────────────────────────────────────────
 * Exactly the four sounds, and nothing else: `kick`, `snare`, `hat` and `wind`,
 * each a voice — a wave and nine knobs, the same fields `.json` writes for a
 * channel's voice, written by the same function. There is no mix here, for the
 * reason a patch has none, only more so: a kit is not even a channel. Pitches are
 * not in the file either, because a kit never moves them (`36/38/42/44`) — a kit
 * changes the SOUND, and a file that carried pitches could disagree with the grid
 * that reads them.
 *
 * ── The one difference from a patch: the name has to be ADDRESSABLE ──────────
 * A patch's name is only ever read on a row, so it may have spaces. A kit's name
 * is how a SCRIPT says it — `kit MYHOUSE` — so it is one token, upper case, and
 * it may not be one of the four built-in words (`studio`, `808`, `brush`, `rock`)
 * or `kit 808` would mean two different kits. `kitNameProblem` is the rule and it
 * is the same shape as a saved voice's, because the two are the same kind of
 * thing: a word in the language.
 *
 * ── A file, so it follows a file's rules ────────────────────────────────────
 * `format` and `version` come first, so a reader knows what it has before it
 * reads a value: a `.kit.json` dropped on a song reader, or on a patch reader, is
 * refused in words rather than read as a thing with no drums. Reading follows
 * `songfile.ts`'s policy, which is what a hand-edited file meets: a value merely
 * out of range is CLAMPED, while anything that would have to be DROPPED to be
 * accepted is REFUSED with a sentence — a kit that came back missing its snare
 * would be a lie about the drums, not a repair of them. A MISSING drum is refused
 * for exactly that reason: every drum is present in a kit, or a hit is silent.
 *
 * A kit file has its OWN version, at 1, for the reason a patch has one: these are
 * three formats that share a vocabulary, and a future song-only field must not
 * make every kit file in the world look stale.
 *
 * Phaser-free and audio-free like the rest of `model/`.
 */

import { DRUM_IDS, drumNames, type DrumId } from './drum';
import { kitNameProblem, MAX_KIT_NAME, tidyKitName, type KitName, type UserKit } from './kit';
import { fileSlug, readVoice, voiceForFile } from './songfile';
import type { VoiceParams } from './voice';

/** The word in `format`, so a reader knows a kit from a song before it looks. */
export const KIT_FILE_FORMAT = 'tracklet-kit';

/** The version of the kit document itself. See the note above. */
export const KIT_FILE_VERSION = 1;

/** What the file is CALLED: `.kit.json`, so the `.json` habit still works. */
export const KIT_FILE_EXTENSION = '.kit.json';

/** What a kit with no readable name of its own is called, and what its file is. */
export const KIT_NAME_FALLBACK = 'KIT';

/** What reading a kit file came to: the kit, or what is wrong with it. */
export type KitFileParse =
  | { ok: true; kit: UserKit }
  | { ok: false; errors: string[] };

/**
 * The document, as the text a file holds.
 *
 * The four drums in the model's own order (`kick`, `snare`, `hat`, `wind`), each
 * written by `voiceForFile` — the same function a `.json` song writes a channel's
 * voice with — so a reader that knows what a voice looks like in a Tracklet file
 * already knows what a kit looks like, and a knob renamed in one place is renamed
 * in both.
 */
export function kitToJson(kit: UserKit): string {
  const voices: Record<string, unknown> = {};
  for (const drum of DRUM_IDS) voices[drum] = voiceForFile(kit.voices[drum]);
  const file: Record<string, unknown> = {
    format: KIT_FILE_FORMAT,
    version: KIT_FILE_VERSION,
    name: tidyKitName(kit.name),
    voices,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Read a kit document. Never throws, and returns what is wrong rather than
 * repairing it into a kit that would sound different from the file.
 *
 * The refusals worth calling out are the first, the name and the missing drum.
 * The first because it is the one a reader will actually meet — a `.json` song or
 * a patch dropped here is refused by NAME — the other two because they are the
 * ones the format is strict about on purpose (see the note above).
 */
export function kitFromJson(text: string): KitFileParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`this file is not JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['a kit file must be a JSON object like { "format": "tracklet-kit", ... }.'] };
  }
  const entry = raw as Record<string, unknown>;
  // What IS this file — asked before anything is read out of it, and answered
  // with the other format's name when it is the other format's file. Three
  // formats begin with `{` here, so each deserves to say which one it is.
  if (entry.format !== KIT_FILE_FORMAT) {
    const other = entry.format === 'tracklet-song'
      ? 'a Tracklet song'
      : entry.format === 'tracklet-patch'
        ? 'a patch'
        : null;
    return {
      ok: false,
      errors: [other
        ? `this is a kit file: its "format" says "${KIT_FILE_FORMAT}". This one is ${other} — open it where a song or a patch goes.`
        : typeof entry.format === 'string'
          ? `this is not a kit file: its "format" is "${entry.format}".`
          : 'this is not a kit file: it has no "format" key.'],
    };
  }
  const version = typeof entry.version === 'number' ? entry.version : 0;
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, errors: [`this kit file's "version" must be a whole number 1 or more; got ${JSON.stringify(entry.version)}.`] };
  }
  if (version > KIT_FILE_VERSION) {
    return {
      ok: false,
      errors: [`this kit was written by a newer version of Tracklet (kit file ${version}; this build reads ${KIT_FILE_VERSION}). Update the app, or ask for the kit again from a build you have.`],
    };
  }

  // The NAME, before the sounds: it is how the kit is addressed, so a file whose
  // name is a built-in's or is not one word has nothing to load AS, and the
  // refusal is the same sentence the save would give. Checked against an EMPTY
  // library, because whether you already have this name is a question about your
  // library and not about the file — `openKitAction` asks it where the library is.
  const rawName = typeof entry.name === 'string' ? entry.name : '';
  const problem = kitNameProblem(rawName, []);
  if (problem !== null) {
    return { ok: false, errors: [`this kit file's "name" is not usable: ${problem}`] };
  }

  const where = 'this kit';
  const voices = entry.voices;
  if (typeof voices !== 'object' || voices === null || Array.isArray(voices)) {
    return { ok: false, errors: [`${where}'s "voices" must be an object with a voice for each drum (${drumNames().join(', ')}), e.g. { "kick": { "wave": "sine" } }.`] };
  }
  const table = voices as Record<string, unknown>;
  const drums: Partial<Record<DrumId, VoiceParams>> = {};
  for (const drum of DRUM_IDS) {
    if (table[drum] === undefined || table[drum] === null) {
      return { ok: false, errors: [`${where} has no "${drum}" voice. A kit is all four drums (${drumNames().join(', ')}) - a missing one would be a silent hit.`] };
    }
    const errors: string[] = [];
    const voice = readVoice({ voice: table[drum] }, `${where}'s ${drum}`, errors);
    if (!voice) return { ok: false, errors };
    drums[drum] = voice;
  }

  return {
    ok: true,
    kit: { name: tidyKitName(rawName), voices: drums as Record<DrumId, VoiceParams> },
  };
}

/** The file a kit of this name is written to: `myhouse.kit.json`. */
export function kitFileName(name: KitName): string {
  return `${fileSlug(tidyKitName(name), KIT_NAME_FALLBACK)}${KIT_FILE_EXTENSION}`;
}

/**
 * The name to give a kit read from a file, when the file does not say.
 *
 * The stem of the filename with the extension off, tidied to a kit name — so a
 * kit written by this app and one written by hand both arrive with something a
 * script could say. Only a fallback: a file that names itself keeps its own name.
 * (Kept for the caller's error path and a hand-written file with no `name`.)
 */
export function kitNameFromFile(fileName: string): string {
  const lower = fileName.toLowerCase();
  const stem = lower.endsWith(KIT_FILE_EXTENSION)
    ? fileName.slice(0, -KIT_FILE_EXTENSION.length)
    : lower.replace(/\.json$/i, '').replace(/\.kit$/i, '');
  return tidyKitName(stem.replace(/[-_]+/g, ' '));
}

/**
 * The name a SAVE would give a kit captured from a song: the song's TITLE, tidied
 * to a kit name and made usable.
 *
 * A kit has no channel to borrow a name from, the way a patch borrows its own, so
 * it borrows the song's TITLE — the one name a person gave this music. The title
 * is tidied to a token (`MY SONG` becomes `MY-SONG`) and, when that is not usable
 * — empty, too long, or already one of the four built-in words — a number is
 * appended until it is. A number rather than a refusal because the ROW has to
 * show the name it is about to save under: a menu that showed a name it would
 * then refuse is worse than one that shows the name it will use, and a song
 * literally called `808` is a song whose kit has to be called something else.
 */
export function kitNameFromTitle(title: string, library: readonly UserKit[]): string {
  const base = tidyKitName(title) || KIT_NAME_FALLBACK;
  const trimmed = fitKitName(base);
  if (kitNameProblem(trimmed, library) === null) return trimmed;
  for (let n = 2; n <= 99; n++) {
    const suffix = `-${n}`;
    const candidate = `${trimmed.slice(0, MAX_KIT_NAME - suffix.length)}${suffix}`;
    if (kitNameProblem(candidate, library) === null) return candidate;
  }
  return trimmed;
}

/**
 * A long name cut to a kit name's length, at a word boundary when there is one.
 *
 * Cutting mid-word is what a plain slice does, and it is how `UNTITLED SONG`
 * becomes `UNTITLED-SON` — a name that looks like a bug. So when the cut lands
 * inside a word, the last `-` or `_` before it is the better place to stop.
 */
function fitKitName(text: string): string {
  if (text.length <= MAX_KIT_NAME) return text;
  const cut = text.slice(0, MAX_KIT_NAME);
  const at = Math.max(cut.lastIndexOf('-'), cut.lastIndexOf('_'));
  return at > 0 ? cut.slice(0, at) : cut;
}

/**
 * One line about a kit, for the status well after a save or a load.
 *
 * Each drum by the wave it is made of, in the order a drummer sits down: what a
 * person saving or loading a kit actually wants to know is "what are these four
 * things", and a wave is the fastest honest answer — the numbers are in the file.
 */
export function kitAbout(kit: UserKit): string {
  return DRUM_IDS.map((drum) => `${kit.voices[drum].wave} ${drum}`).join(', ');
}

/** A kit as a one-line heading, for a menu row: `MYHOUSE  -  sine kick, ...`. */
export function kitRowLabel(kit: UserKit): string {
  return `${kit.name}  -  ${kitAbout(kit)}`;
}
