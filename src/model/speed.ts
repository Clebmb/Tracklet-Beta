/**
 * speed — tape speed: the one number that moves PITCH and TIME together.
 *
 * ```text
 * speed 80        # the whole record a fifth slower and a little lower: slowed + reverb
 * speed 200       # double time, an octave up
 * ```
 *
 * A tape machine has one transport, and its speed is not two decisions. Turn a
 * reel slower and everything about the recording follows at once: the beat gets
 * longer and the pitch gets lower, by the SAME ratio, because the signal is being
 * read off the medium more slowly. That coupling is the whole gesture — it is
 * what "slowed + reverb", chop-and-screw and a tape-stop are made of — and no
 * combination of the knobs this app already has can produce it: `tempo` moves
 * time without pitch, `octave` (and a bend) moves pitch without time, and changing
 * both by hand is two edits that never stay in step.
 *
 * ── One ratio, applied in two places ────────────────────────────────────────
 *
 * `speed` is a percentage: `100` plays the song as written (the default, and what
 * every song before this means), `50` is half speed — twice as long and an octave
 * down — and `200` is twice as fast and an octave up. The two consumers read it
 * from this module and nowhere else:
 *
 *   • **Time** — `secondsPerRow` divides by the factor, so every row, note length,
 *     strum, swing and tempo-map point stretches together.
 *   • **Pitch** — the synth multiplies every source's frequency by the factor
 *     (`speedFactor`), so an oscillator, a recorded key and a one-shot all move by
 *     the same interval.
 *
 * Doing it per note rather than by resampling the mix is a deliberate simplification
 * and worth naming: a real tape also drags the FILTERS and every envelope tail down
 * with it, and a per-note transform cannot (a filter is a property of the channel's
 * sound, not of the note). What this reaches is the interval and the duration,
 * which is the part a person hears as "played back at a different speed".
 *
 * ── The range ───────────────────────────────────────────────────────────────
 *
 * 25–400 %, two octaves down and two up. Wide enough for the slowest chop-and-screw
 * crawl and the fastest sped-up edit, and narrow enough that the pitch never leaves
 * the range a voice or a kit is recognisable in. Phaser-free and audio-free, like
 * the rest of `model/`: these are numbers until `audio/synth.ts` makes them a
 * frequency.
 */

/** The range the control offers, in percent of the written speed. */
export const SPEED_MIN = 25;
export const SPEED_MAX = 400;
/** Normal speed: the song exactly as it was written, and the default. */
export const DEFAULT_SPEED = 100;
/** How far one press moves the knob, in percent. Twenty stops across the range. */
export const SPEED_STEP = 5;

/** `100` is normal, `50` half speed (an octave down), `200` double (an octave up). */
export const SPEED_NORMAL = 100;

/** A speed inside the range the control offers. */
export function clampSpeed(amount: number): number {
  if (!Number.isFinite(amount)) return DEFAULT_SPEED;
  return Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(amount)));
}

/**
 * The ratio a speed means: `0.5` at half speed, `2` at double, `1` at normal.
 *
 * The single number both consumers multiply by — pitch up, time down — so the
 * coupling cannot come apart in one path and not the other.
 */
export function speedFactor(speed: number): number {
  return clampSpeed(speed) / SPEED_NORMAL;
}

/** The number of semitones a speed moves the pitch by, for a menu or a message. */
export function speedSemitones(speed: number): number {
  return 12 * Math.log2(speedFactor(speed));
}

/** A speed as the app writes it: the percentage, with normal named. */
export function speedLabel(speed: number): string {
  const value = clampSpeed(speed);
  return value === DEFAULT_SPEED ? '100% (normal)' : `${value}%`;
}
