/**
 * drift — the transport wobble, as a knob a lane can move.
 *
 * ```text
 * track 3 "PAD" drift 40                    # a worn tape under the channel
 * automate 3 drift 10 90 bars 8 to 15       # ... and it tires as the song goes
 * ```
 *
 * A recording played back on a machine is never quite in tune twice: the
 * transport does not turn at a constant speed, so the pitch wanders SLOWLY (wow)
 * with a faster tremor on top (flutter). The `tape` effect already has exactly
 * that — see `TAPE_WOW_HZ` and its neighbours in `audio/chain.ts` — but it arrives
 * welded to saturation and hiss, and it cannot be moved over bars, because an
 * EFFECT is a node that only exists above zero and a curve cannot fade a node in
 * from nothing.
 *
 * `drift` is the same wobble pulled OUT as a plain CHANNEL value: a number 0..100
 * that every channel has whether or not it is on tape, applied where a note is
 * built rather than where the chain is wired. That is what makes it a legal
 * `automate` destination — a value read per note, like `gate` — and it is the
 * whole point of this item: the difference between a static wobble and a tape
 * that is TIRING is whether the number can move.
 *
 * ── The numbers, and why they are small ─────────────────────────────────────
 *
 * Wow is about eighteen cents at 100 and flutter about two, at the two rates the
 * tape effect already uses (slow wow at 0.55 Hz, a second at 0.83 Hz that shares
 * no period with it, flutter at 7.3 Hz). Eighteen cents is audible on a held note
 * and nowhere near enough to read as out of tune; the flutter is deliberately
 * almost inaudible alone, because its job is to make the wow sound like a
 * MECHANISM rather than an LFO. The phase is derived from the note's own start
 * time, so an export wobbles exactly the way the session did — nothing here is
 * random.
 *
 * Phaser-free and audio-free like the rest of `model/`: the rates and depths are
 * numbers, and `audio/synth.ts` is the one place they become oscillators.
 */

/** The range the control offers, and the value that means "no wobble at all". */
export const DRIFT_MIN = 0;
export const DRIFT_MAX = 100;
export const DEFAULT_DRIFT = DRIFT_MIN;
/** How far one press moves the knob. Five, so the control has twenty stops. */
export const DRIFT_STEP = 5;

/**
 * How wide the slow wow swings at 100, in cents.
 *
 * Eighteen: a third of the vibrato's width, which is the difference between an
 * ornament a player makes and a machine that will not hold still. Audible on a
 * held pad or piano note and almost invisible on anything short.
 */
export const DRIFT_MAX_CENTS = 18;

/**
 * How wide the fast flutter swings at 100, in cents.
 *
 * Two, an order of magnitude under the wow, on purpose: flutter alone is a
 * defect nobody would add. It is here to make the wow sound mechanical — the
 * grain of a capstan rather than a clean sine.
 */
export const DRIFT_FLUTTER_CENTS = 2;

/**
 * The three rates, in cycles per second, matching the tape effect's own.
 *
 * Two wow rates that do not divide evenly, so the wander never arrives at the
 * same place twice at the same moment — which is what makes it sound worn rather
 * than like a chorus — and one fast flutter above them.
 */
export const DRIFT_WOW_HZ = 0.55;
export const DRIFT_WOW_DRIFT_HZ = 0.83;
/** How much of the wow the second rate contributes, so the two sum to one wander. */
export const DRIFT_WOW_DRIFT_WEIGHT = 0.6;
export const DRIFT_FLUTTER_HZ = 7.3;

/** A drift inside the range the control offers, 0..100. */
export function clampDrift(amount: number): number {
  if (!Number.isFinite(amount)) return DEFAULT_DRIFT;
  return Math.max(DRIFT_MIN, Math.min(DRIFT_MAX, Math.round(amount)));
}

/** A drift as the app writes it: `OFF` at zero, otherwise the percentage. */
export function driftLabel(amount: number): string {
  const value = clampDrift(amount);
  return value === 0 ? 'OFF' : `${value}%`;
}
