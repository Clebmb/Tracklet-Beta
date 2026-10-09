/**
 * variation — the two things that stop a part sounding TYPED.
 *
 * ```text
 * track 2 "SNARE" robin 60    # hit it again and it is not the same hit
 * track 3 "BASS"  touch 70    # hit it softly and it is darker as well as quieter
 * ```
 *
 * A person never does the same thing twice. The second snare hit is a different
 * hit from the first — a touch harder, a touch flat, a touch duller, because a
 * stick is not a machine — and a note played gently is not merely a note played
 * loudly times a fraction: it is DARKER, because a soft hit excites fewer
 * overtones. Both of those are visible in a single grid (a velocity nibble, a
 * repeated cell) and both were missing from it, which is why this is the last
 * item Phase G5 has.
 *
 * ── One arithmetic, two knobs ────────────────────────────────────────────────
 *
 * The two ideas answer with the SAME small record — a TONE SHIFT: how many cents
 * off the pitch, how much of the level, how many points of the `bright` knob —
 * and that is deliberate. The audio paths are handed one thing to apply, in one
 * place (`synth.ts` sums it into the layer it is building), so the live engine,
 * the offline renderer and every future path cannot disagree about how a varied
 * note sounds, and a knob added here later costs one number rather than a second
 * mechanism.
 *
 * ── Why it is DETERMINISTIC, and why that is the point ───────────────────────
 *
 * A round-robin here is not a random number: it is the Nth hit of the channel
 * walking a fixed four-step cycle, so the same song plays the same way every time
 * — in the app, in an export, and in the two compared side by side. Randomness
 * would sound no better and would make an export of a song differ from the song,
 * which is the one thing this app has never done.
 *
 * The FIRST hit of a channel is always the unmodified one: variant 0 of the cycle
 * is exactly zero on every axis, so a channel's first note is the note it always
 * was, and `robin 0` makes every hit variant 0 — which is what every song written
 * before this existed means.
 *
 * Phaser-free and audio-free like the rest of `model/`, so a test can ask the
 * same questions the engine does.
 */

/**
 * How many hit variants a round-robin walks through, and why four.
 *
 * Two is the oldest trick in samplers — alternate and the ear stops noticing —
 * and four is where a repeated figure stops sounding like a cycle: a snare roll
 * at four hits to the beat needs more than two variants before the pattern in it
 * is audible, and a longer cycle stops being a performance and starts being a
 * bank of samples, which is what this is not (there is nothing to record).
 */
export const ROUND_ROBIN_CYCLE = 4;

/** How much a hit may vary: the ROBIN range is a percentage, like every knob. */
export const ROBIN_MIN = 0;
export const ROBIN_MAX = 100;
export const DEFAULT_ROBIN = ROBIN_MIN;
/** How far one press moves a round-robin. Five, so the control has twenty stops. */
export const ROBIN_STEP = 5;

/**
 * How far the LAST variant of a full round-robin reaches from the first.
 *
 * All three are small on purpose: variation is a few CENTS and a few percent, not
 * a second performance. A drum detuned by nine cents and eight percent quieter is
 * the second hit of the same drum; the same numbers an octave apart would be a
 * mistake rather than a performance.
 */
export const MAX_ROBIN_CENTS = 9;
export const MAX_ROBIN_GAIN = 8;
export const MAX_ROBIN_BRIGHT = 9;

/**
 * The four variants, each as fractions of the three maxima above.
 *
 * Hand-chosen rather than generated, because the shape of the difference is the
 * sound: variant 0 is EXACTLY zero (the promise above), and the other three
 * disagree with each other on every axis — one bright and flat and quiet, one
 * dark and loud, one in between — so that no two hits in a row differ the same
 * way twice. A test pins all four, since these numbers ARE the feature.
 */
const ROBIN_VARIANTS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [1, -0.5, 0.6],
  [-0.7, 0.4, -0.5],
  [0.5, -0.2, 0.9],
];

/** How much a note's TIMBRE follows how hard it was hit. */
export const TOUCH_MIN = 0;
export const TOUCH_MAX = 100;
export const DEFAULT_TOUCH = TOUCH_MIN;
export const TOUCH_STEP = 5;

/**
 * How many points of the `bright` knob a hit at velocity 0 loses at `touch 100`.
 *
 * A soft hit is DARKER — fewer overtones excited, less of the instrument
 * speaking — and that is the whole of the velocity layer this app has: the level
 * already follows the velocity (it always has), and this makes the TONE follow it
 * too. Thirty points is a piano's own soft-to-loud, which is the widest this
 * needs to go before a soft note stops sounding soft and starts sounding muffled.
 */
export const MAX_TOUCH_BRIGHT = 30;

/**
 * A note's variation from the way its channel was written, in the units the
 * synth already speaks: cents of detune, a percentage of level, and points of
 * `bright`.
 *
 * Zero on all three is the identity, and one MODULE-level constant holds it so
 * that "this note varies in no way at all" is one object rather than three zeros
 * spelled at every call site.
 */
export interface ToneShift {
  /** How far off the written pitch the note sits, in cents. */
  cents: number;
  /** How much of the layer's level it keeps, as a percentage deviation. */
  gain: number;
  /** How many points brighter (or darker, when negative) the note is. */
  bright: number;
}

/** The shift a note that varies in no way at all makes: the note as written. */
export const NO_TONE_SHIFT: ToneShift = { cents: 0, gain: 0, bright: 0 };

/** A round-robin inside the range the control offers, 0..100. */
export function clampRobin(amount: number): number {
  if (!Number.isFinite(amount)) return DEFAULT_ROBIN;
  return Math.max(ROBIN_MIN, Math.min(ROBIN_MAX, Math.round(amount)));
}

/** A touch inside the range the control offers, 0..100. */
export function clampTouch(amount: number): number {
  if (!Number.isFinite(amount)) return DEFAULT_TOUCH;
  return Math.max(TOUCH_MIN, Math.min(TOUCH_MAX, Math.round(amount)));
}

/** A knob as the app writes it: `OFF` at zero, otherwise the percentage. */
function amountLabel(amount: number, clamp: (value: number) => number): string {
  const value = clamp(amount);
  return value === 0 ? 'OFF' : `${value}%`;
}

/** A round-robin as the app writes it: `OFF`, or the percentage. */
export function robinLabel(amount: number): string {
  return amountLabel(amount, clampRobin);
}

/** A touch as the app writes it: `OFF`, or the percentage. */
export function touchLabel(amount: number): string {
  return amountLabel(amount, clampTouch);
}

/**
 * How the `index`th hit of a channel differs from the note as written.
 *
 * `index` is which hit this is, counting from the FIRST note of the channel (see
 * the scheduler's own counter). Variant 0 is all zeros, so the first hit — and
 * every hit of a channel at `robin 0` — is exactly the note that was written.
 */
export function roundRobinShift(robin: number, index: number): ToneShift {
  const amount = clampRobin(robin);
  if (amount === 0) return NO_TONE_SHIFT;
  const step = ((Math.round(index) % ROUND_ROBIN_CYCLE) + ROUND_ROBIN_CYCLE) % ROUND_ROBIN_CYCLE;
  const variant = ROBIN_VARIANTS[step];
  const scale = amount / ROBIN_MAX;
  const shift: ToneShift = {
    cents: variant[0] * MAX_ROBIN_CENTS * scale,
    gain: variant[1] * MAX_ROBIN_GAIN * scale,
    bright: variant[2] * MAX_ROBIN_BRIGHT * scale,
  };
  // The first variant is all zeros; hand back the shared identity so every path
  // that asks "is this the note as written?" gets one answer and one object.
  return isToneShift(shift) ? NO_TONE_SHIFT : shift;
}

/**
 * How a note being hit at `velocity` differs in TONE, at this channel's `touch`.
 *
 * A level is not a timbre, so this answers with brightness alone: at velocity 100
 * it is zero (the note as written, whatever the setting), and it falls away as
 * the hit gets softer. `touch 0` is therefore exactly the app before this existed
 * — velocity a level and nothing else.
 */
export function touchShift(touch: number, velocity: number): ToneShift {
  const amount = clampTouch(touch);
  if (amount === 0) return NO_TONE_SHIFT;
  const scale = Math.min(1, Math.max(0, velocity / 100));
  const shift: ToneShift = { cents: 0, gain: 0, bright: -(1 - scale) * MAX_TOUCH_BRIGHT * (amount / TOUCH_MAX) };
  // A full-velocity hit is the note as written; hand back the shared identity.
  return isToneShift(shift) ? NO_TONE_SHIFT : shift;
}

/** Both shifts at once, summed: what one hit of a varied channel actually is. */
export function hitShift(
  settings: { robin: number; touch: number },
  index: number,
  velocity: number,
): ToneShift {
  const robin = roundRobinShift(settings.robin, index);
  const touch = touchShift(settings.touch, velocity);
  if (robin === NO_TONE_SHIFT) return touch;
  if (touch === NO_TONE_SHIFT) return robin;
  return {
    cents: robin.cents + touch.cents,
    gain: robin.gain + touch.gain,
    bright: robin.bright + touch.bright,
  };
}

/** True when a shift asks for nothing, which is the case every path must keep exact. */
export function isToneShift(shift: ToneShift): boolean {
  return shift.cents === 0 && shift.gain === 0 && shift.bright === 0;
}
