/**
 * kit — the DRUM KIT: which four patches a `drum` hit plays.
 *
 * `drum.ts` answers "which drum is this step" — a kick, a snare, a hat or a wind,
 * each at its General MIDI pitch. This file answers the question one scope up:
 * WHAT THOSE FOUR SOUND LIKE. A kit is a named set of four patches, so `kit 808`
 * is one word for the whole set, and a song can be a drum machine or a jazz trio
 * without touching a single note.
 *
 * Three decisions are worth stating plainly, because everything else follows:
 *
 *   • A kit changes the SOUND and nothing else. Pitches stay where the kit puts
 *     them (`36/38/42/44`), so the grid, the file and an export cannot tell which
 *     kit a song is on — only the ear can. That is what makes a kit one line in a
 *     song rather than a second notation.
 *
 *   • `studio` is the identity, and it is the four presets from `VOICES`. So a
 *     song that names no kit plays exactly what the app has always played, and a
 *     song file that says nothing about kits is byte-for-byte the file it was.
 *     The other three are written out as numbers, because the numbers ARE the
 *     kit — there is nothing to derive them from.
 *
 *   • A kit is a song-level choice, like `groove` and `tuning`, because a band has
 *     one drummer. Two kits in one song would be two drummers, which is a
 *     different feature (and a channel is already where two instruments live).
 *
 * Pure and dependency-light, like the rest of the model, so every rule here is
 * unit tested (see __tests__/kit.test.ts).
 */

import { drumVoice, DRUM_IDS, type DrumId } from './drum';
import { patchWithVoice, type Patch } from './instrument';
import { clampParam, copyVoice, DEFAULT_VOICE, VOICE_PARAMS, waveFromName, type VoiceParams, type Wave } from './voice';

/**
 * The name of a built-in kit, as every door spells it: `studio`, `808`, `brush`,
 * `rock`, `metal`, `dusty`.
 *
 * Six, and the two on the end arrived the way the others would have: a genre
 * asked for them. `metal` is what `rock` is not — a clickier kick and a biting
 * snare that survives a wall of distortion — and `dusty` is the kit a lo-fi or
 * vaporwave record is actually made on, where the drums are DEAD rather than
 * quiet.
 */
export type KitId = 'studio' | '808' | 'brush' | 'rock' | 'metal' | 'dusty';

/**
 * A kit a SONG holds: a built-in id, or the name of one of your own.
 *
 * The vocabulary of kits is not closed any more, and that is the one thing a kit
 * file changes. `KitId` is still the four sets this app ships, while a song says
 * which kit it plays as a NAME — `808` or `MYHOUSE` — exactly the way a channel
 * names a recording (`track.sample`) rather than carrying the audio. The four
 * built-ins are always found; a name that is neither is one of YOUR kits, from
 * the library `kitLibrary.ts` keeps, and a song that names one this machine does
 * not have plays the presets (see `kitVoice`), the same bargain a missing sample
 * makes.
 */
export type KitName = string;

export interface Kit {
  /** The word in the language and in a file: `808`. */
  id: KitId;
  /** How a menu or a sentence writes it: `808`, `BRUSH`, `STUDIO`. */
  label: string;
  /** What it is, in one line, in the same voice as a voice's own blurb. */
  blurb: string;
  /** Which music reaches for it, in the same one-line voice as an effect's. */
  reach: string;
  /** The four patches, by drum. Every drum is present, or a hit would be silent. */
  voices: Readonly<Record<DrumId, VoiceParams>>;
}

/**
 * One drum's voice, built from the handful of knobs that actually shape a hit.
 *
 * A helper rather than nine lines of object literal four times over, because a
 * kit's whole character is in three numbers — how bright, how much hiss, how long
 * it rings — and burying those in ceremony would hide the only part a reader came
 * for. Everything left out is the neutral value, which is what a hit wants: a
 * drum has no attack, no decay and no release of its own.
 */
function hit(wave: Wave, bright: number, noise: number, ring: number, rest: Partial<VoiceParams> = {}): VoiceParams {
  return {
    wave, bright, sweep: 0, duty: 100, noise,
    attack: 0, decay: 0, ring, release: 0, thick: 0,
    ...rest,
  };
}

/** The four presets, copied — the kit a song plays when it names none. */
function studioVoices(): Record<DrumId, VoiceParams> {
  return Object.fromEntries(DRUM_IDS.map((drum) => [drum, drumVoice(drum)])) as Record<DrumId, VoiceParams>;
}

/**
 * The kits, in the order a menu lists them: the default first.
 *
 * Six, and the ceiling is still the design rather than a shortage — the same
 * reason the voice list is about a dozen long. Each one is a whole approach to a
 * kit rather than a variation on another: a dry studio set, a drum machine,
 * brushes, a rock kit, a metal kit and a dead, dusty one. Which six, and which
 * not, is a question about GENRES rather than about sounds: every kit here is the
 * drums of a family of records, and a seventh would have to be the drums of a
 * seventh rather than a nicer version of one of these.
 *
 * Appending is deliberate. The four that were here first keep their positions, so
 * a control that cycles kits walks the same order it always did and a saved song
 * on `rock` still finds `rock` where it was.
 */
export const KITS: readonly Kit[] = [
  {
    id: 'studio',
    label: 'STUDIO',
    blurb: 'the four presets: a dry, even kit that sits anywhere',
    reach: 'anything — it is what this app has always played, and the sound of a song that says nothing',
    voices: studioVoices(),
  },
  {
    id: '808',
    label: '808',
    blurb: 'the drum machine: a long deep kick, a tight crack, a crisp tick',
    reach: 'hip hop, trap, early house, and anything whose bass drum should be felt rather than heard',
    voices: {
      kick: hit('sine', 8, 0, 45),
      snare: hit('triangle', 30, 60, 12),
      hat: hit('square', 100, 80, 4),
      wind: hit('square', 100, 100, 35),
    },
  },
  {
    id: 'brush',
    label: 'BRUSH',
    blurb: 'soft brushes: a round kick, a swirling snare and a quiet tick',
    reach: 'jazz, soul, a ballad, or a breakdown where the drums step back',
    voices: {
      kick: hit('sine', 12, 3, 6),
      snare: hit('triangle', 25, 45, 32),
      hat: hit('square', 75, 65, 16),
      wind: hit('square', 100, 100, 42, { attack: 30 }),
    },
  },
  {
    id: 'rock',
    label: 'ROCK',
    blurb: 'a big live kit: a punchy kick, a loud snare and a cutting hat',
    reach: 'rock, punk and pop — a kit that has to be heard over guitars',
    voices: {
      kick: hit('sine', 30, 10, 12),
      snare: hit('triangle', 60, 88, 26),
      hat: hit('square', 100, 95, 8, { duty: 60 }),
      wind: hit('square', 100, 100, 20),
    },
  },
  {
    id: 'metal',
    label: 'METAL',
    blurb: 'a hard kit: a clicky kick, a biting snare that rings, and a thin metallic tick',
    reach: 'metal, hardcore and industrial — a kit that has to cut through a wall of distortion',
    voices: {
      // The click is `bright` (a kick you HEAR and a kick you FEEL are two
      // different numbers), the ring is what makes it sound like a room, and the
      // hat's narrow `duty` is the one knob that turns a tick metallic rather
      // than wooden.
      kick: hit('sine', 42, 16, 24),
      snare: hit('triangle', 70, 94, 38),
      hat: hit('square', 100, 100, 6, { duty: 35 }),
      wind: hit('square', 100, 100, 12),
    },
  },
  {
    id: 'dusty',
    label: 'DUSTY',
    blurb: 'a dead kit: a soft thud, a papery snare with no ring, and a dull quiet tick',
    reach: 'lo-fi, vaporwave and tape-saturated hip hop — drums heard through a wall and a worn record',
    voices: {
      // The opposite approach to `metal`: almost no bite, almost no ring, and a
      // little `thick` on the kick and snare, which is the one knob that makes a
      // hit sound like it was printed to tape and played back slightly wrong.
      kick: hit('sine', 12, 6, 5, { thick: 25 }),
      snare: hit('triangle', 30, 72, 8, { thick: 30 }),
      hat: hit('square', 45, 50, 3),
      wind: hit('square', 70, 100, 10, { attack: 40 }),
    },
  },
];

/** Every kit word, in list order: what a message offers and a menu shows. */
export const KIT_IDS: readonly KitId[] = KITS.map((kit) => kit.id);

/** The kits by id, for a lookup that cannot fail. */
export const KIT_BY_ID: Readonly<Record<KitId, Kit>> = Object.fromEntries(
  KITS.map((kit) => [kit.id, kit]),
) as Record<KitId, Kit>;

/**
 * No kit named: the four presets.
 *
 * The default is `studio` rather than `null` — unlike a part's `groove`, which is
 * `null` for "follow the song" — because a kit is not an opinion ABOUT something
 * else. There is one drummer, and this is the set of drums they came with.
 */
export const DEFAULT_KIT: KitId = 'studio';

/**
 * The kit a word names, or null when it names none.
 *
 * Case-insensitive, like every other closed list in the language, and exact
 * otherwise: a kit that was guessed at is a song that sounds like a different
 * record, and nothing in the notes would say so.
 */
export function kitFromName(name: string): KitId | null {
  const wanted = name.trim().toLowerCase();
  return KIT_IDS.find((id) => id === wanted) ?? null;
}

/** The kit words, for a refusal that lists them. */
export function kitNames(): string[] {
  return [...KIT_IDS];
}

/** The kit with this id, or null — the built-in lookup a file reader can check with. */
export function kitById(id: string): Kit | null {
  return KITS.find((kit) => sameKitName(kit.id, id)) ?? null;
}

/**
 * The value a song should hold for a kit word: a built-in id, a user kit's name,
 * or null when the word names neither.
 *
 * The one resolution every door goes through — the script parser, the menu and
 * the file reader — so "which kit is `808`" has one answer and cannot be a
 * built-in in one place and a user kit in another. Built-ins win a tie, because
 * they cannot be renamed and the four words were spoken for first.
 */
export function kitChoice(name: string, kits: readonly UserKit[] = []): KitName | null {
  const builtIn = KIT_IDS.find((id) => sameKitName(id, name));
  if (builtIn) return builtIn;
  const user = kits.find((kit) => sameKitName(kit.name, name));
  return user ? user.name : null;
}

/** A kit as a sentence writes it. A name nothing knows reads as the default. */
export function kitLabel(kit: KitName, kits: readonly UserKit[] = []): string {
  const builtIn = kitById(kit);
  if (builtIn) return builtIn.label;
  const user = kits.find((entry) => sameKitName(entry.name, kit));
  return user ? user.name : KIT_BY_ID[DEFAULT_KIT].label;
}

/** True for the kit a song with no `kit` line plays, so a UI can say "the default". */
export function isDefaultKit(kit: KitName): boolean {
  return sameKitName(kit, DEFAULT_KIT);
}

/**
 * The next kit in the cycle, wrapping at the end: the four built-ins, then the
 * kits of your own, so one `ENTER` reaches everything a song can play.
 */
export function nextKit(kit: KitName, kits: readonly UserKit[] = []): KitName {
  const all: KitName[] = [...KIT_IDS, ...kits.map((entry) => entry.name)];
  const at = all.findIndex((id) => sameKitName(id, kit));
  return all[(at + 1) % all.length] ?? DEFAULT_KIT;
}

/**
 * The kit named by a song, as the table `kitVoice` reads: a built-in, or one of
 * yours from the library.
 */
function kitTable(kit: KitName, kits: readonly UserKit[]): Readonly<Record<DrumId, VoiceParams>> {
  const builtIn = kitById(kit);
  if (builtIn) return builtIn.voices;
  const user = kits.find((entry) => sameKitName(entry.name, kit));
  return (user ?? KIT_BY_ID[DEFAULT_KIT]).voices;
}

/**
 * A kit's voice for one drum, copied.
 *
 * The one reader of the table for both audio paths and the renderer, so a hit
 * cannot sound different live than in an export — and a copy, because the kit is
 * the one thing in the app that must sound the same in every song.
 *
 * `kits` is the library, and it is OPTIONAL so that every call written before a
 * kit could be your own keeps working unchanged: a name that is not a built-in
 * and not in the library the caller passed is not an error here, it is the
 * documented fallback — the four presets, which is what a song that names a kit
 * this machine does not have hears.
 */
export function kitVoice(kit: KitName, drum: DrumId, kits: readonly UserKit[] = []): VoiceParams {
  return { ...kitTable(kit, kits)[drum] };
}

/**
 * The patch a drum hit plays ON a player's channel.
 *
 * The channel keeps everything it had — levels, effects, layers, filter — and the
 * kit replaces its VOICE, which is exactly what a player swapping a snare for a
 * kick does to one hit. The same mechanism an automation lane uses, which is why
 * the two cannot disagree about what a rebuilt layer keeps.
 */
export function kitPatch(patch: Patch, kit: KitName, drum: DrumId, kits: readonly UserKit[] = []): Patch {
  return patchWithVoice(patch, kitVoice(kit, drum, kits));
}

/** The four drums a kit plays, as data, for the catalog and a doc generator. */
export function kitVoices(kit: KitName, kits: readonly UserKit[] = []): { drum: DrumId; params: VoiceParams }[] {
  return DRUM_IDS.map((drum) => ({ drum, params: kitVoice(kit, drum, kits) }));
}

// ── A KIT OF YOUR OWN ────────────────────────────────────────────────────────

/**
 * A kit you made: four patches with a name, so `kit MYHOUSE` plays it.
 *
 * The library entry, the thing a `.kit.json` file holds, and the value the app
 * resolves a song's `kit` name against. Exactly the four BUILT-IN kits' own
 * shape (`Kit.voices`), minus the prose, because a kit of your own is a set of
 * sounds and the app has nothing to say about which music reaches for it.
 */
export interface UserKit {
  /** Upper-cased and one word, the way a channel or a saved voice is. */
  name: string;
  /** Every drum is present, or a hit would be silent. */
  voices: Readonly<Record<DrumId, VoiceParams>>;
}

/**
 * The longest name a kit of your own may have.
 *
 * A saved voice's name stops at twelve; a kit's gets four more, for a mundane
 * reason worth writing down: a kit's name is the only one this app suggests for
 * you (from the song's title, which is a phrase rather than a word — the stock
 * title `UNTITLED SONG` is already thirteen characters), so the ceiling has to be
 * high enough that the suggestion survives its own rule.
 */
export const MAX_KIT_NAME = 16;

/**
 * How many kits of your own a library may hold.
 *
 * A ceiling rather than a limit anyone will reach: it is here so a corrupt or
 * hostile `localStorage` value cannot grow without bound, and so the menu's list
 * stays a list rather than an archive — the same reason `MAX_USER_VOICES` exists.
 */
export const MAX_USER_KITS = 12;

/** A kit name, tidied for a script: one token, upper case, spaces to `-`. */
export function tidyKitName(text: string): string {
  return text.trim().replace(/\s+/g, '-').toUpperCase();
}

/** Two kit names mean the same kit when they say the same thing in any case. */
export function sameKitName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * What is wrong with a kit's name, in a sentence, or null when it is fine.
 *
 * A TWIN of `voiceNameProblem`, and the same rules on purpose: a kit is
 * addressed BY NAME from a script (`kit MYHOUSE`), so its name has to be one
 * token, and an uppercase word keeps it looking like the menu rows around it.
 * A digit may START one — `808` is a built-in, so `909` must be nameable — and
 * the four built-in words are spoken for, which is the one collision that would
 * make `kit 808` mean two different kits.
 */
export function kitNameProblem(name: string, library: readonly UserKit[], ignore?: string): string | null {
  const tidy = tidyKitName(name);
  if (tidy === '') return 'a kit needs a name.';
  if (tidy.length > MAX_KIT_NAME) {
    return `a kit name may be at most ${MAX_KIT_NAME} characters; "${tidy}" is ${tidy.length}.`;
  }
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(tidy)) {
    return 'a kit name is one word of letters, digits, - or _ (so a script can say it).';
  }
  if (KIT_IDS.some((id) => sameKitName(id, tidy))) {
    return `"${tidy}" is already one of the built-in kits. Pick another name.`;
  }
  if (library.some((kit) => sameKitName(kit.name, tidy) && !sameKitName(kit.name, ignore ?? ''))) {
    return `you already have a kit called "${tidy}". Pick another name, or save over it with the same name.`;
  }
  return null;
}

/** The kit of yours with this name, however it is spelled. */
export function userKitFromName(text: string, library: readonly UserKit[]): UserKit | null {
  const want = tidyKitName(text);
  return library.find((kit) => kit.name === want) ?? null;
}

/** The names of your kits, for a message that lists them. */
export function userKitNames(library: readonly UserKit[]): string {
  return library.map((kit) => kit.name).join(', ');
}

/**
 * Add a kit, or replace the one that already has that name.
 *
 * Replacing is deliberate, exactly as it is for a saved sound: saving a tweaked
 * `MYHOUSE` over `MYHOUSE` is the common case (you iterated), and the cap is on
 * NEW names only, so a full library can still be edited.
 */
export function withUserKit(library: readonly UserKit[], kit: UserKit): UserKit[] {
  const kept = library.filter((entry) => !sameKitName(entry.name, kit.name));
  if (kept.length >= MAX_USER_KITS) return library.slice();
  return [...kept, { name: tidyKitName(kit.name), voices: copyKitVoices(kit.voices) }];
}

/** The library without the named kit, for a DELETE. */
export function withoutUserKit(library: readonly UserKit[], name: string): UserKit[] {
  return library.filter((entry) => !sameKitName(entry.name, name));
}

/** A kit's four voices, copied: what a save and a load each hand over. */
export function copyKitVoices(voices: Readonly<Record<DrumId, VoiceParams>>): Record<DrumId, VoiceParams> {
  return Object.fromEntries(DRUM_IDS.map((drum) => [drum, copyVoice(voices[drum])])) as Record<DrumId, VoiceParams>;
}

/**
 * A kit of your own, built from whatever a song's drums play RIGHT NOW.
 *
 * The bridge between "the song's kit" — a name, resolved through the library —
 * and "a kit file", which holds four tables of numbers. Saving therefore captures
 * the sound as it is, whether it came from a built-in or from another kit of
 * yours, which is what makes a kit portable through any number of hands rather
 * than only from the app's four presets.
 */
export function captureKit(name: string, kit: KitName, kits: readonly UserKit[] = []): UserKit {
  const voices = Object.fromEntries(DRUM_IDS.map((drum) => [drum, kitVoice(kit, drum, kits)])) as Record<DrumId, VoiceParams>;
  return { name: tidyKitName(name), voices };
}

/**
 * Read a saved kit library out of untrusted storage, and drop anything wrong.
 *
 * The same LENIENT policy as `parseUserVoices`, and for the same reasons: a
 * `localStorage` value is shared, hand-editable and outlives the build that
 * wrote it, so a stale entry must not cost the user the other eleven. A kit
 * whose name is unreadable, or that collides with a built-in or a name already
 * kept, is dropped; a drum's voice with an unreadable WAVE is rebuilt from the
 * presets, because a missing drum is a silent hit, which is worse than a hit
 * that sounds like `studio`.
 */
export function parseUserKits(raw: unknown): UserKit[] {
  if (!Array.isArray(raw)) return [];
  const out: UserKit[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_USER_KITS) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const fields = entry as Record<string, unknown>;
    if (typeof fields.name !== 'string') continue;
    if (kitNameProblem(fields.name, out) !== null) continue;
    out.push({ name: tidyKitName(fields.name), voices: readStoredKitVoices(fields.voices) });
  }
  return out;
}

/**
 * Four stored drum voices, each clamped, the presets standing in for a drum that
 * cannot be read at all.
 *
 * Lenient on purpose (see `parseUserKits`): a missing knob takes the neutral
 * default, and anything unreadable is clamped rather than refused, because the
 * alternative is throwing away a kit the user dialed in by hand.
 */
function readStoredKitVoices(raw: unknown): Record<DrumId, VoiceParams> {
  const fields = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const voices: Partial<Record<DrumId, VoiceParams>> = {};
  for (const drum of DRUM_IDS) {
    const entry = fields[drum];
    const wave = isRecord(entry) && typeof entry.wave === 'string' ? waveFromName(entry.wave) : null;
    if (!isRecord(entry) || !wave) {
      voices[drum] = drumVoice(drum);
      continue;
    }
    const params: VoiceParams = { ...DEFAULT_VOICE, wave };
    for (const param of VOICE_PARAMS) {
      const value = entry[param.id];
      if (typeof value === 'number' && Number.isFinite(value)) params[param.id] = clampParam(value);
    }
    voices[drum] = params;
  }
  return voices as Record<DrumId, VoiceParams>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
