/**
 * drum — the kit: one channel playing a whole drum set, a hit at a time.
 *
 * Percussion in this app started as a SIDE EFFECT of a channel's voice: a channel
 * with `voice kick` played kicks, a channel with `voice hat` played hats, and a
 * beat was therefore three or four channels that happened to be a drum kit. This
 * module is the other half of that: a DRUM is a percussion voice with a name, a
 * General MIDI pitch and a three-character label, and a CELL may name one —
 * `drum 0 4 kick` — so a kick, a snare and a hat can live on the SAME channel,
 * each hit carrying its own sound.
 *
 * Three decisions are worth stating plainly, because everything else follows:
 *
 *   • A drum is not a second copy of a sound. The four presets come straight from
 *     `VOICES` (the percussion family), so `drum 0 1 snare` and `voice snare` are
 *     the same sound and there is exactly one place a snare is described.
 *
 *   • A drum has a PITCH, and it is the one the cell holds. 36 is MIDI's kick and
 *     42 its closed hat, so a drum cell's note IS the General MIDI pitch of the
 *     drum: the grid shows the drum's own note, an export needs no translation,
 *     and the app's own MIDI reader — which already turns a channel-9 pitch back
 *     into a part — reads a kit's hits back as the drums they are.
 *
 *   • The label is three characters because a grid column is three characters
 *     wide. `KCK SNR HAT WND` is the percussion STEP VIEW in miniature: a beat
 *     reads as words rather than as pitches nobody can hear.
 *
 * Pure and dependency-light, like the rest of the model, so every rule here is
 * unit tested (see __tests__/drum.test.ts).
 */

import { patchWithVoice, type Patch } from './instrument';
import { VOICES, type VoiceParams } from './voice';

/** The name of a drum, as every door spells it: `kick`, `snare`, `hat`, `wind`. */
export type DrumId = 'kick' | 'snare' | 'hat' | 'wind';

export interface Drum {
  /** The word in the language and in a file: `kick`. */
  id: DrumId;
  /** The word with its first letter raised, for a sentence or a menu row. */
  label: string;
  /** What it is, in the same voice as a voice's own blurb. */
  blurb: string;
  /**
   * The General MIDI pitch this drum IS — 36, 38, 42, 44 — which is also the
   * pitch a cell holding this drum carries. Named rather than derived, because
   * the number is a fact about the drum kit the world shares, not about us.
   */
  pitch: number;
  /** Three characters for the grid, where a cell has room for three. */
  short: string;
}

/**
 * The kit, in the order a grid reads it: the bottom first.
 *
 * Four, and that ceiling is the design — the same reason the voice list is about
 * a dozen long: these are the four a beat is made of, and each one is a different
 * kind of hit rather than a variation on another. More would be a sample browser,
 * which is a different item; see the ROADMAP.
 */
export const DRUMS: readonly Drum[] = [
  {
    id: 'kick', label: 'Kick', blurb: 'the thump: the beat you feel rather than hear',
    pitch: 36, short: 'KCK',
  },
  {
    id: 'snare', label: 'Snare', blurb: 'the backbeat: a snap with a body under it',
    pitch: 38, short: 'SNR',
  },
  {
    id: 'hat', label: 'Hat', blurb: 'the tick: short, high, and the whole groove',
    pitch: 42, short: 'HAT',
  },
  {
    id: 'wind', label: 'Wind', blurb: 'pure hiss — a build-up, a breakdown or weather',
    pitch: 44, short: 'WND',
  },
];

/** Every drum word, in kit order: what a menu lists and a message offers. */
export const DRUM_IDS: readonly DrumId[] = DRUMS.map((drum) => drum.id);

/** The drums by id, for a lookup that cannot fail. */
export const DRUM_BY_ID: Readonly<Record<DrumId, Drum>> = Object.fromEntries(
  DRUMS.map((drum) => [drum.id, drum]),
) as Record<DrumId, Drum>;

/**
 * The drum a word names, or null when it names none.
 *
 * One reader for one table, so the language, the file and the catalog cannot
 * drift about which words exist — and the comparison is case-insensitive because
 * every other closed list in the language is (`SHARP`, `Pad`, `up`).
 */
export function drumFromName(name: string): DrumId | null {
  const wanted = name.trim().toLowerCase();
  return DRUM_IDS.find((id) => id === wanted) ?? null;
}

/** True when a word names a drum, without asking which one. */
export function isDrumName(name: string): boolean {
  return drumFromName(name) !== null;
}

/** The drum words, for a refusal that lists them. */
export function drumNames(): string[] {
  return [...DRUM_IDS];
}

/** A drum's pitch — the note a cell holding it carries. */
export function drumPitch(drum: DrumId): number {
  return DRUM_BY_ID[drum].pitch;
}

/**
 * The drum a pitch IS, or null when the pitch is not one.
 *
 * The inverse of `drumPitch`, and deliberately strict: this answers "which of my
 * four drums is written at this note", NOT "which drum is this pitch CLOSE to".
 * The app's MIDI reader makes the loose version of that judgement (every low pitch
 * is a kick there) because a file from elsewhere has to land somewhere; a song
 * written here says which drum it means, so nothing has to be guessed.
 */
export function drumForPitch(pitch: number): DrumId | null {
  return DRUMS.find((drum) => drum.pitch === pitch)?.id ?? null;
}

/** The three characters a grid cell shows for a drum. */
export function drumLabel(drum: DrumId): string {
  return DRUM_BY_ID[drum].short;
}

/**
 * A drum's voice: the preset's parameters, copied.
 *
 * A copy rather than the table's own object, because a caller may hand this to
 * something that edits it, and the kit is the one thing in the app that must
 * sound the same in every song.
 */
export function drumVoice(drum: DrumId): VoiceParams {
  const preset = VOICES.find((voice) => voice.id === drum);
  // The table above and the voice list are the same four ids by construction, and
  // a test proves it; the fallback is the kick because a hit with no sound is the
  // one failure a song cannot recover from.
  const fallback = VOICES.find((voice) => voice.family === 'percussion');
  return { ...(preset ?? fallback)!.params };
}

/**
 * The patch a drum hit plays on a channel.
 *
 * The channel keeps EVERYTHING it had — its levels, its effects, its layers, its
 * filter shape — and the drum replaces its VOICE, which is exactly what a player
 * swapping a snare for a kick does to one hit. This is the same mechanism an
 * automation lane uses to move a knob for one note (see `patchWithVoice`), which
 * is why the two cannot disagree about what a rebuilt layer keeps.
 */
export function drumPatch(patch: Patch, drum: DrumId): Patch {
  return patchWithVoice(patch, drumVoice(drum));
}
