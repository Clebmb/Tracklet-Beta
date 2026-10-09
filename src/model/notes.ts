/**
 * notes — note names, MIDI numbers and the computer-keyboard piano map.
 *
 * Phaser-free and dependency-free on purpose: the editor, the sequencer and the
 * tests all speak the same language, and the language is small.
 *
 * Tracklet names a note the way a tracker does — a two-character name plus an
 * octave digit, e.g. `C-4`, `C#4`, `A#3`. That is always three characters, so a
 * whole column of notes lines up under the framework's 8px pixel font.
 *
 * Octaves use scientific pitch, where MIDI 60 is middle C = `C-4`.
 */

/** Pitch-class names; index === semitone within an octave. */
export const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

/** The lowest and highest notes the editor will let you write. */
export const MIDI_MIN = 12; // C-0
export const MIDI_MAX = 119; // B-8

const OCTAVE_MIN = Math.floor(MIDI_MIN / 12) - 1; // 0
const OCTAVE_MAX = Math.floor(MIDI_MAX / 12) - 1; // 8

/** Clamp a MIDI number into the range Tracklet can name and play. */
export function clampMidi(midi: number): number {
  return Math.max(MIDI_MIN, Math.min(MIDI_MAX, Math.round(midi)));
}

/** `60` -> `C-4`, `61` -> `C#4`. */
export function midiToNoteName(midi: number): string {
  const m = clampMidi(midi);
  const name = NOTE_NAMES[m % 12];
  const octave = Math.floor(m / 12) - 1;
  return (name.length === 1 ? `${name}-` : name) + octave;
}

/**
 * `C-4` / `C#4` -> MIDI number, or null when the text is not a note. Two- and
 * three-character spellings (`C4`, `C-4`, `c#5`) are accepted so a hand-written
 * demo pattern can be readable.
 */
export function noteNameToMidi(text: string): number | null {
  const match = /^([A-Ga-g])(#|b)?-?(\d+)$/.exec(text.trim());
  if (!match) return null;
  const letters: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semitone = letters[match[1].toUpperCase()];
  if (match[2] === '#') semitone += 1;
  if (match[2] === 'b') semitone -= 1;
  const octave = Number(match[3]);
  if (!Number.isFinite(octave) || octave < OCTAVE_MIN - 1 || octave > OCTAVE_MAX + 1) return null;
  const midi = (octave + 1) * 12 + semitone;
  return midi >= MIDI_MIN && midi <= MIDI_MAX ? midi : null;
}

/** Equal-tempered frequency of a MIDI note (A-4 = 440 Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * The computer-keyboard piano: the FL / Ableton layout everyone already knows.
 * `KeyboardEvent.code` -> semitones above the current octave's C. The bottom
 * two rows are the lower octave, `Q`-row the one above it.
 */
export const PIANO_KEY_SEMITONES: Readonly<Record<string, number>> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6,
  KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18,
  KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
};

/** The printed label for a key code (`KeyZ` -> `Z`, `Digit2` -> `2`). */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** How many semitones the two keyboard rows cover: two full octaves. */
export const KEYBOARD_SEMITONES = 24;

/**
 * Semitone -> the key that plays it, inverted from the map above once. The
 * on-screen keyboard labels every key with this, so the drawn piano and the
 * hand on the computer keyboard can never fall out of step.
 */
const SEMITONE_TO_KEY: readonly (string | null)[] = (() => {
  const out: (string | null)[] = Array.from({ length: KEYBOARD_SEMITONES }, () => null);
  for (const [code, semitone] of Object.entries(PIANO_KEY_SEMITONES)) {
    if (semitone >= 0 && semitone < KEYBOARD_SEMITONES) out[semitone] = keyLabel(code);
  }
  return out;
})();

/** The key that writes this semitone (`0` -> `Z`), or null past the two rows. */
export function keyForSemitone(semitone: number): string | null {
  return SEMITONE_TO_KEY[semitone] ?? null;
}

/** True when a semitone is a black key — i.e. its name carries a sharp. */
export function isSharpSemitone(semitone: number): boolean {
  const pc = ((semitone % 12) + 12) % 12;
  return NOTE_NAMES[pc].length === 2;
}

/** The octave a MIDI note sits in (`60` -> `4`). */
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** The MIDI note of C in an octave — the base the keyboard rows start from. */
export function baseMidiForOctave(octave: number): number {
  return (octave + 1) * 12;
}
