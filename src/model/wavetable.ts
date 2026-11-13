/**
 * WAVETABLES — a table of your own, by name.
 *
 * ── The problem this solves ────────────────────────────────────────────────
 * The chip wavetable (`wave table`) is a shapes-from-a-fixed-bank instrument: a
 * `duty` picks one of the spectra in `model/catalog.ts`, which is exactly what a
 * Game Boy does and exactly why a song can only ever sound like a Game Boy there.
 * Every other voice in this app is a SET of numbers; the table was the one shape
 * you could not have your own of.
 *
 * A custom table is the smallest honest form of "wavetable synthesis": a spectrum,
 * written as a list of harmonic amplitudes, that a `wave table` channel wears
 * instead of the bank. Sine, square, a hollow odd-only wave, a nasal buzz with one
 * strong partial — every one of them is a short list of numbers, and the synth
 * already knows how to turn that list into a `PeriodicWave` (that is what
 * `wavetablePeriodicWave` does per bank entry).
 *
 * ── Why harmonics and not 256 samples ───────────────────────────────────────
 * Because a spectrum is what a person can hear and reason about: `1 0 0.5 0 -0.3`
 * is "fundamental, no second, half a third, no fourth, a third of a fifth
 * inverted", and you can predict how that sounds before you hear it. A drawn
 * 256-sample graph would be a Furnace-sized editor and would make a song file
 * unreadable. The doc's own rule: the wavetable is a library object with a name,
 * not a 256-by-256 graph editor.
 *
 * ── The name ───────────────────────────────────────────────────────────────
 * One word, short, and kept with the channel rather than in a song-wide list: a
 * table IS the channel's sound, the way its voice's knobs are, so two channels
 * that want the same spectrum write the same line. That also means a table travels
 * with the channel through every path that already carries a voice.
 */

/** One custom table: a name, and the harmonic amplitudes it is built from. */
export interface WaveTable {
  /** The name the channel and its script write, one word. */
  name: string;
  /**
   * The spectrum, from the fundamental upward. `harmonics[0]` is the fundamental,
   * `harmonics[1]` the second harmonic, and so on. Negative is phase-inverted, 0
   * is absent, and the whole list is normalised when it becomes a wave.
   */
  harmonics: number[];
}

/** How many harmonics a custom table may name. Past this it is a sampler. */
export const MAX_HARMONICS = 16;

/** The longest name a table may have, matching a sample's ceiling. */
export const MAX_TABLE_NAME = 12;

/** The largest amplitude a single harmonic may carry, in the list's own units. */
export const MAX_HARMONIC = 1;

/**
 * Why a name cannot be a table's, or null when it can.
 *
 * One word because a script line has no quotes for it and a song file a person
 * reads should not need them; letters, digits, `_` and `-` beyond that, which is
 * the same bargain a sample's name makes.
 */
export function tableNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'it is empty';
  if (trimmed.length > MAX_TABLE_NAME) return `it is longer than ${MAX_TABLE_NAME} characters`;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return 'it has a space or a symbol in it — the name is ONE word of letters, digits, "_" and "-"';
  return null;
}

/** A name as the song stores it: trimmed, and nothing else changed. */
export function tidyTableName(name: string): string {
  return name.trim().slice(0, MAX_TABLE_NAME);
}

/** A harmonic clamped to what a table can hold. */
export function clampHarmonic(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_HARMONIC, Math.min(MAX_HARMONIC, value));
}

/**
 * A table the model can hold, or null when the spectrum says nothing.
 *
 * A list that is all zeroes has no fundamental and therefore no pitch to hear — it
 * is silence wearing a name — so it is refused rather than stored, and the caller
 * says so. Trailing zeroes are dropped: they change no wave, and they would make a
 * file longer for nothing.
 */
export function tidyTable(name: string, harmonics: readonly number[]): WaveTable | null {
  const problem = tableNameProblem(name);
  if (problem !== null) return null;
  const clamped = harmonics.map(clampHarmonic).slice(0, MAX_HARMONICS);
  while (clamped.length > 0 && clamped[clamped.length - 1] === 0) clamped.pop();
  if (clamped.length === 0) return null;
  if (clamped.every((value) => value === 0)) return null;
  return { name: tidyTableName(name), harmonics: clamped };
}
