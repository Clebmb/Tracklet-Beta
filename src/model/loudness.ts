/**
 * loudness — the loudness target an export normalises to: `export loud -14`.
 *
 * The second half of the same sentence `bounce.ts` is the first half of. A region
 * answers WHICH BARS leave the app; a target answers HOW LOUD they arrive. Both
 * are the same kind of thing — what you are doing with the song rather than what
 * the song is — so both travel beside it: nothing here is in `Song`, no file
 * carries one, `Ctrl+Z` does not restore it, and saving a normalised song does
 * not save the normalisation.
 *
 * ── A number, and a ladder ───────────────────────────────────────────────────
 * The statement takes any target in a range, because a person who knows they want
 * -12 should be able to say -12. But most people do not know, and the numbers that
 * matter are a closed list every service publishes, so the menu offers those as a
 * ladder of four stops — broadcast, podcast, streaming, loud — with OFF at the
 * bottom. `cycleLoudness` is that ladder, and it is a pure function here rather
 * than a switch inside a menu because a rule about which stop comes next is a
 * thing to test.
 *
 * The measurement itself is not here: `audio/lufs.ts` owns the arithmetic, because
 * that is signal, not language. This file owns only what the app SAYS about it.
 *
 * Phaser-free, like the rest of `model/`.
 */

/** The clause that names a target: `export loud -14`. */
export const LOUDNESS_WORD = 'loud';
/** The word the statement itself begins with — `export`, shared with the region. */
const BOUNCE_WORD = 'export';
/** `export loud off`: no normalisation, which is what saying nothing means. */
export const LOUDNESS_OFF_WORD = 'off';

/**
 * The range a target may be written in, in LUFS.
 *
 * The floor is far below anything anybody masters to, and is there so that a
 * forgotten zero cannot ask for a gain of -40 dB. The ceiling is the honest end of
 * the scale rather than 0: a target of -3 LUFS is not a loud master, it is a
 * mistake, and only a limiter nobody asked for would reach it.
 */
export const LOUDNESS_MIN = -40;
export const LOUDNESS_MAX = -5;

/**
 * The stops the menu walks, quietest first, each with the thing it is FOR.
 *
 * These are the published targets of the four places a song usually ends up, in
 * the order a person escalates through them: -23 is European broadcast, -16 a
 * podcast, -14 what the streaming services normalise to, -9 a deliberately loud
 * master. They are the menu's vocabulary, not the language's — a script may name
 * any value in the range, including one of these.
 */
export const LOUDNESS_PRESETS: readonly { value: number; what: string }[] = [
  { value: -23, what: 'broadcast' },
  { value: -16, what: 'podcast' },
  { value: -14, what: 'streaming' },
  { value: -9, what: 'loud' },
];

/**
 * The next stop up the ladder, or off the top of it.
 *
 * One press moves the target LOUDER, and off the loudest stop lands on OFF —
 * which is why this takes and returns `null`: "off" is a stop, and the value a
 * person ends up back at. A target that is not one of the presets (a script said
 * `loud -12`) climbs to the next stop above it, so the ladder behaves the same
 * whether the number came from a menu or from a script.
 */
export function cycleLoudness(current: number | null): number | null {
  if (current === null) return LOUDNESS_PRESETS[0]?.value ?? null;
  return LOUDNESS_PRESETS.find((preset) => preset.value > current)?.value ?? null;
}

/** `OFF`, or `-14 LUFS` — what a screen and a status line print. */
export function loudLabel(target: number | null | undefined): string {
  if (target === null || target === undefined) return 'OFF';
  return `${target} LUFS`;
}

/**
 * What a target is for, in one word — `streaming` for -14, and a plain
 * description for any value that is not one of the four stops.
 */
export function loudnessMeaning(target: number): string {
  return LOUDNESS_PRESETS.find((preset) => preset.value === target)?.what ?? 'a target of your own';
}

/**
 * The statement that sets a target: `export loud -14`.
 *
 * The WHOLE line rather than the clause, the way `bounceScript` prints the whole
 * region statement: what a caller wants back is something it can paste, and the
 * two halves of an export are pasted into the same box.
 */
export function loudnessScript(target: number): string {
  return `${BOUNCE_WORD} ${LOUDNESS_WORD} ${target}`;
}

/** The sentence the line after a normalised export prints. */
export function loudnessReport(measured: number, target: number, gainDb: number, limited: boolean): string {
  const from = measured.toFixed(1);
  const to = target.toFixed(1);
  const moved = `${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(1)} dB`;
  return limited
    ? `NORMALISED TO THE CEILING  ${from} LUFS  ->  ${to} wanted  (${moved}, stopped before clipping)`
    : `NORMALISED  ${from} LUFS  ->  ${to} LUFS  (${moved})`;
}
