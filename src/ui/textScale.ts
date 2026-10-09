/**
 * textScale — how big the app's text boxes are, as one word.
 *
 * The app draws its chrome in a canvas at a fixed 720x405 and lets the framework
 * FIT that to the window, so most of the app already gets bigger when the window
 * does. What does NOT is the one surface where a person reads and writes a lot
 * of text at once: the SCRIPT box (and the little name box beside it). Those are
 * real DOM elements — a `<textarea>` and an `<input>` — and they size their own
 * glyphs from the canvas's on-screen scale, so on a small window they bottom out
 * at their smallest and there is nothing left to do about it.
 *
 * So this is a knob for exactly that: a closed list of three words, and a factor
 * the text surfaces multiply their own size by. It is deliberately NOT a canvas
 * scale. Growing the canvas chrome means re-laying-out every panel in the app,
 * and an honest `TEXT BIGGER` that quietly overflows its boxes would be worse
 * than no knob at all — the limit is written down in `doc/01` rather than faked.
 *
 * Two more decisions:
 *
 *   • THE WORDS ARE DATA, and the list is closed. `normal` is the default and is
 *     the identity, so a session that never touches this renders exactly as it
 *     always did — the same bargain the framework's own `setUiScale` makes.
 *
 *   • THE LIVE VALUE IS MODULE STATE, like the framework's active theme and UI
 *     scale, because the surface that reads it (a DOM box, at the moment it is
 *     placed) has no interest in which object asked. `setTextScale` is the only
 *     writer and the preference storage is a different module's business.
 *
 * Pure and Phaser-free, like `stepView.ts`, `overview.ts`, `pianoRoll.ts` and
 * `contrast.ts`: it is words and arithmetic, so it is unit tested as such.
 */

/** The three sizes, smallest first: a closed list, and the order to cycle in. */
export const TEXT_SCALES = ['normal', 'large', 'huge'] as const;

export type TextScale = (typeof TEXT_SCALES)[number];

/** The size the app has always shipped at, and the identity for the factor. */
export const DEFAULT_TEXT_SCALE: TextScale = 'normal';

/** How much bigger each word makes the text boxes. `normal` is exactly 1. */
const FACTORS: Record<TextScale, number> = {
  normal: 1,
  large: 1.25,
  huge: 1.5,
};

/** Is this string one of the three words? The storage reader's whole question. */
export function isTextScale(value: string): value is TextScale {
  return (TEXT_SCALES as readonly string[]).includes(value);
}

/** The multiplier a text surface applies to its own font size. */
export function textScaleFactor(name: TextScale): number {
  return FACTORS[name];
}

/** The next size in the cycle, wrapping back to `normal` after `huge`. */
export function nextTextScale(name: TextScale): TextScale {
  const index = TEXT_SCALES.indexOf(name);
  return TEXT_SCALES[(index + 1) % TEXT_SCALES.length] ?? DEFAULT_TEXT_SCALE;
}

/** The word as the menu prints it: the list's own name, uppercased. */
export function textScaleLabel(name: TextScale): string {
  return name.toUpperCase();
}

/** One line per size, for the button's status line. */
const ABOUT: Record<TextScale, string> = {
  normal: 'THE SIZE IT HAS ALWAYS SHIPPED AT, FOR THE TEXT BOXES',
  large: 'A QUARTER LARGER, FOR THE TEXT BOXES',
  huge: 'HALF AGAIN AS LARGE, FOR THE TEXT BOXES',
};

/** What a toast says about a size. */
export function textScaleAbout(name: TextScale): string {
  return ABOUT[name];
}

/**
 * The size the app is drawing at. Module-level, like the framework's UI scale,
 * because the thing that reads it — a DOM box sizing itself — has no owner to
 * ask. Every caller that sets it should say so through the preference too.
 */
let active: TextScale = DEFAULT_TEXT_SCALE;

/** Set the live size. Only a word over `TEXT_SCALES` is accepted. */
export function setTextScale(name: TextScale): void {
  if (isTextScale(name)) active = name;
}

/** The live size. */
export function activeTextScale(): TextScale {
  return active;
}

/** The live multiplier, which is what a text surface actually wants. */
export function activeTextScaleFactor(): number {
  return FACTORS[active];
}
