/**
 * chip — a whole console's character, in one word.
 *
 * `duty` and the `noise` wave are the PARTS of a chiptune sound; this is the
 * PACKAGE. A chip profile is the channel LINE-UP a console is remembered for —
 * two pulses and a triangle bass and a noise drum, or six wavetable voices — and
 * `chip nes` lays that line-up over the song's channels by index, setting each
 * one's voice. It is the same bargain `voice` makes one channel at a time, made
 * for a whole machine at once.
 *
 * ── Flavor, not emulation ────────────────────────────────────────────────────
 * These are PROFILES, not an emulator, and the blurbs say so. The NES and Game
 * Boy are pulse-plus-noise machines with a wavetable for their wave channel, so
 * those voices are faithful to what the hardware can make. The Super NES and the
 * Advance are SAMPLE machines: their PERCUSSION is a real one-shot sample, and
 * their sustained voices are the right SHAPE — smooth, soft-attacked — built
 * from sines, saws and tables rather than from recorded instruments. The Genesis
 * and the AdLib/Sound Blaster are FM machines, which is the third synthesis this
 * engine now has, so their profiles are among the truest here: a sine carrier
 * bent by a second oscillator is exactly how they made a sound. Saying all of
 * this plainly is the point: a beginner should learn what a console SOUNDS like,
 * not be told a sine is a Snes sample.
 *
 * ── Why there is no `chip` field on a Song ───────────────────────────────────
 * A chip is a way to SET the voices, and the voices are the truth: once `chip
 * nes` has run, the song carries six channels of real sound, and a saved file
 * carries those. So `chip` is an ACTION, like `clear` or `chord`, not a property
 * the file has to remember — which also means a tweak to one channel cannot make
 * a stale label lie about what the song is. `chipNameFor` DERIVES the label back
 * from the voices for a menu that wants to show it, the same way `voiceNameFor`
 * derives a channel's name from its numbers.
 *
 * Phaser-free and audio-free like the rest of `model/`.
 */

import { copyVoice, sameVoice, type VoiceParams } from './voice';

/** The consoles a script can name. */
export type ChipId = 'nes' | 'gb' | 'pce' | 'snes' | 'gba' | 'genesis' | 'opl';

export interface ChipProfile {
  id: ChipId;
  /** How the machine is written on screen. */
  label: string;
  /** One line, honest about how close this profile can get. */
  blurb: string;
  /**
   * The voice for each channel, in order. A song with more channels than roles
   * cycles them, so four tracks are a NES's four and eight are two passes of it.
   */
  roles: readonly VoiceParams[];
}

/**
 * The profiles, strongest first: the two pulse machines are the most faithful,
 * then the TurboGrafx's mixed line-up, then the two sample machines, which are
 * approximations until the engine can hold a sample.
 */
export const CHIPS: readonly ChipProfile[] = [
  {
    id: 'nes', label: 'NES',
    blurb: 'two pulses, a triangle bass and a noise drum — the 2A03 exactly, which is all it could make',
    roles: [
      { wave: 'square', bright: 75, duty: 25, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 78, release: 0, thick: 0 },
      { wave: 'square', bright: 68, duty: 12, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 78, release: 0, thick: 0 },
      { wave: 'triangle', bright: 32, duty: 100, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 92, release: 0, thick: 0 },
      { wave: 'noise', bright: 100, duty: 100, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 22, release: 0, thick: 0 },
    ],
  },
  {
    id: 'gb', label: 'GAME BOY',
    blurb: 'two pulses, a wavetable and a short metallic noise — the Game Boy, pulse-for-pulse',
    roles: [
      { wave: 'square', bright: 82, duty: 12, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 70, release: 0, thick: 0 },
      { wave: 'square', bright: 74, duty: 25, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 70, release: 0, thick: 0 },
      { wave: 'table', bright: 60, duty: 10, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 88, release: 0, thick: 0 },
      { wave: 'noise', bright: 100, duty: 20, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 28, release: 0, thick: 0 },
    ],
  },
  {
    id: 'pce', label: 'TURBOGRAFX',
    blurb: 'six channels of pulse, wavetable and noise — the PC Engine, wave channels and all',
    roles: [
      { wave: 'square', bright: 78, duty: 50, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 84, release: 0, thick: 0 },
      { wave: 'square', bright: 72, duty: 25, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 84, release: 0, thick: 0 },
      { wave: 'table', bright: 58, duty: 50, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 88, release: 0, thick: 0 },
      { wave: 'table', bright: 62, duty: 70, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 88, release: 0, thick: 0 },
      { wave: 'sine', bright: 70, duty: 100, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 90, release: 0, thick: 0 },
      { wave: 'noise', bright: 100, duty: 100, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 22, release: 0, thick: 0 },
    ],
  },
  {
    id: 'snes', label: 'SNES',
    blurb: 'smooth sustained voices and a sampled tom — the Super NES by ear, not by hardware',
    roles: [
      { wave: 'sine', bright: 58, duty: 100, sweep: 0, noise: 0, attack: 18, decay: 0, ring: 96, release: 0, thick: 18 },
      { wave: 'sine', bright: 64, duty: 100, sweep: 0, noise: 0, attack: 18, decay: 0, ring: 96, release: 0, thick: 20 },
      { wave: 'sawtooth', bright: 52, duty: 100, sweep: 0, noise: 0, attack: 14, decay: 0, ring: 96, release: 0, thick: 26 },
      { wave: 'table', bright: 46, duty: 10, sweep: 0, noise: 0, attack: 24, decay: 0, ring: 100, release: 0, thick: 14 },
      { wave: 'sine', bright: 34, duty: 100, sweep: 0, noise: 0, attack: 8, decay: 0, ring: 92, release: 0, thick: 0 },
      { wave: 'sample', bright: 90, duty: 75, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 100, release: 0, thick: 0 },
    ],
  },
  {
    id: 'gba', label: 'GBA',
    blurb: 'bright, snappy voices and a sampled clap — the Game Boy Advance by ear',
    roles: [
      { wave: 'sine', bright: 74, duty: 100, sweep: 0, noise: 0, attack: 6, decay: 0, ring: 88, release: 0, thick: 10 },
      { wave: 'sine', bright: 68, duty: 100, sweep: 0, noise: 0, attack: 10, decay: 0, ring: 90, release: 0, thick: 14 },
      { wave: 'sawtooth', bright: 66, duty: 100, sweep: 0, noise: 0, attack: 6, decay: 0, ring: 88, release: 0, thick: 18 },
      { wave: 'table', bright: 60, duty: 90, sweep: 0, noise: 0, attack: 12, decay: 0, ring: 94, release: 0, thick: 12 },
      { wave: 'sine', bright: 40, duty: 100, sweep: 0, noise: 0, attack: 4, decay: 0, ring: 86, release: 0, thick: 0 },
      { wave: 'sample', bright: 90, duty: 55, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 100, release: 0, thick: 0 },
    ],
  },
  {
    id: 'genesis', label: 'GENESIS',
    blurb: 'six FM channels and a noise drum — the Mega Drive, phase-modulated and proud',
    roles: [
      { wave: 'fm', bright: 82, duty: 45, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 85, release: 0, thick: 12 },
      { wave: 'fm', bright: 42, duty: 22, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 92, release: 0, thick: 0 },
      { wave: 'fm', bright: 60, duty: 35, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 90, release: 0, thick: 18 },
      { wave: 'fm', bright: 88, duty: 62, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 45, release: 0, thick: 0 },
      { wave: 'fm', bright: 78, duty: 55, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 18, release: 0, thick: 0 },
      { wave: 'noise', bright: 100, duty: 20, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 24, release: 0, thick: 0 },
    ],
  },
  {
    id: 'opl', label: 'ADLIB',
    blurb: 'warm two-operator FM — AdLib and Sound Blaster, softer than a Genesis',
    roles: [
      { wave: 'fm', bright: 58, duty: 28, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 96, release: 0, thick: 8 },
      { wave: 'fm', bright: 40, duty: 18, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 92, release: 0, thick: 0 },
      { wave: 'fm', bright: 68, duty: 38, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 80, release: 0, thick: 10 },
      { wave: 'fm', bright: 80, duty: 50, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 50, release: 0, thick: 0 },
      { wave: 'fm', bright: 52, duty: 30, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 95, release: 0, thick: 20 },
      { wave: 'noise', bright: 100, duty: 100, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 24, release: 0, thick: 0 },
    ],
  },
];

/** The profile with this id, or null. */
export function chipById(id: string): ChipProfile | null {
  return CHIPS.find((chip) => chip.id === id) ?? null;
}

/**
 * The machine a word names, forgiving about the spellings a person writes:
 * `gameboy`, `famicom`, `tg16` all land on the console they mean, because those
 * are what the machines are called, and a refusal there would teach nothing.
 */
export function chipFromName(text: string): ChipProfile | null {
  switch (text.trim().toLowerCase()) {
    case 'nes': case 'famicom': case '2a03': return chipById('nes');
    case 'gb': case 'gameboy': case 'game-boy': case 'dmg': return chipById('gb');
    case 'pce': case 'pcengine': case 'pc-engine': case 'tg16': case 'turbografx': case 'turbografx16': return chipById('pce');
    case 'snes': case 'supernes': case 'super-nes': case 'superfamicom': return chipById('snes');
    case 'gba': case 'advance': return chipById('gba');
    case 'genesis': case 'megadrive': case 'mega-drive': case 'md': return chipById('genesis');
    case 'opl': case 'opl2': case 'adlib': case 'soundblaster': case 'sound-blaster': case 'sb': return chipById('opl');
    default: return null;
  }
}

/** The machines a script may name, for an error message that lists them. */
export function chipNames(): string {
  return CHIPS.map((chip) => chip.id).join(', ');
}

/**
 * The voice the profile gives a channel: the role for its index, cycling when the
 * song is wider than the console. A NES profile on a six-channel song gives the
 * fifth and sixth the two pulses it started with, which is what a person would
 * reach for.
 */
export function chipVoiceFor(chip: ChipProfile, index: number): VoiceParams {
  const roles = chip.roles;
  const at = ((index % roles.length) + roles.length) % roles.length;
  return copyVoice(roles[at]);
}

/**
 * Which profile a song's channels ARE, or null when they are not one.
 *
 * Derived from the voices, never stored, so a song that started as a NES and was
 * then hand-tuned stops calling itself one the moment a knob moves — the label is
 * a fact about the numbers, which is the same rule `voiceNameFor` follows. The
 * first profile that matches every channel wins, and each profile's first role is
 * distinct so the answer is not a coin toss.
 */
export function chipNameFor(voices: readonly VoiceParams[]): ChipId | null {
  if (voices.length === 0) return null;
  for (const chip of CHIPS) {
    if (voices.every((voice, i) => sameVoice(voice, chip.roles[i % chip.roles.length]))) return chip.id;
  }
  return null;
}
