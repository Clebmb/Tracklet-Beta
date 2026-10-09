/**
 * contrast — how far apart two theme colours are, in the one number that has a
 * standard behind it.
 *
 * A theme here is thirty colours and the app draws its whole surface from them,
 * so \"is this look readable?\" is a question about the palette rather than about
 * any one screen. The answer everybody has agreed on is the WCAG contrast
 * ratio: the relative luminance of the lighter colour over the darker, 1:1 for
 * two identical colours and 21:1 for black on white. It is worth having in code
 * rather than in a reviewer's eye because a palette is DATA — a future theme can
 * be added by someone who never opens a menu, and the only guard that survives
 * that is arithmetic.
 *
 * Three things shape it.
 *
 * 1. IT IS ABOUT THE GAP, NOT ABOUT WHICH COLOUR IS BRIGHTER.
 *
 *    One shipped theme (PARCHMENT) is dark text on a light panel, on purpose —
 *    it exists for working over a bright map. So nothing here assumes white text
 *    or a dark panel; the ratio is symmetric and the grade is about the distance
 *    between the two, which is the only thing that makes PARCHMENT and the
 *    moorland the same kind of legible.
 *
 * 2. THE THRESHOLDS ARE THE PUBLISHED ONES, NAMED.
 *
 *    WCAG AA asks 4.5:1 for body text and 3:1 for large text (18pt, or 14pt
 *    bold); AAA asks 7:1 for body text. Those are the three numbers below, and
 *    the grade names the highest bar a pair clears rather than inventing a
 *    score — a reader who knows the standard knows what `AA` means here.
 *
 * 3. `LOW` IS A FACT, NOT A VERDICT.
 *
 *    A pair below 3:1 gets `LOW` and the app says so without refusing it. Every
 *    one of these themes shipped as somebody's look, and the palette a person
 *    can read is partly about the room they are in; the honest thing is to put
 *    the number where the choice is made, not to lock a theme out.
 *
 * Pure and Phaser-free, like `stepView.ts`, `overview.ts` and `pianoRoll.ts`:
 * it takes packed `0xRRGGBB` numbers and answers numbers and words.
 */

/** WCAG AAA for body text. */
export const CONTRAST_AAA = 7;
/** WCAG AA for body text. */
export const CONTRAST_AA = 4.5;
/** WCAG AA for large text (18pt, or 14pt bold): the loosest bar worth naming. */
export const CONTRAST_AA_LARGE = 3;

/** The highest bar a pair clears, or `LOW` when it clears none of them. */
export type ContrastGrade = 'AAA' | 'AA' | 'AA-LARGE' | 'LOW';

/** One line per grade, for the menu that shows it. */
export const CONTRAST_GRADE_BLURB: Record<ContrastGrade, string> = {
  AAA: 'PLENTY OF ROOM',
  AA: 'COMFORTABLE AT ANY SIZE',
  'AA-LARGE': 'FINE LARGE, TIGHT SMALL',
  LOW: 'HARD TO READ',
};

/**
 * One sRGB channel of a packed colour, linearised for luminance.
 *
 * The 0.03928 break and the 2.4 power are the standard's, not a taste: below the
 * break the channel is treated as linear (the dark end, where a plain gamma
 * curve would be wrong) and above it the curve is undone.
 */
function linearChannel(channel: number): number {
  const c = Math.max(0, Math.min(255, channel)) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** The WCAG relative luminance of a packed `0xRRGGBB`, in 0..1. */
export function relativeLuminance(color: number): number {
  const r = linearChannel((color >> 16) & 0xff);
  const g = linearChannel((color >> 8) & 0xff);
  const b = linearChannel(color & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The WCAG contrast ratio between two packed colours: 1 for identical colours,
 * 21 for black on white, and symmetric in its two arguments.
 */
export function contrastRatio(a: number, b: number): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The highest published bar a ratio clears, `LOW` when it clears none. */
export function contrastGrade(ratio: number): ContrastGrade {
  if (ratio >= CONTRAST_AAA) return 'AAA';
  if (ratio >= CONTRAST_AA) return 'AA';
  if (ratio >= CONTRAST_AA_LARGE) return 'AA-LARGE';
  return 'LOW';
}

/**
 * A ratio as a person reads it: one decimal, then `:1` — the form the standard
 * itself is quoted in, so `4.5:1` in the menu is the same `4.5` in the rule.
 */
export function formatContrast(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}

export interface ContrastReading {
  ratio: number;
  grade: ContrastGrade;
  /** `11.7:1  AAA` — the number and the bar, as the menu prints them. */
  label: string;
  /** One line of prose about the grade, for a status line. */
  blurb: string;
}

/** A colour pair read out in full: the ratio, the grade, and the words. */
export function contrastReading(foreground: number, background: number): ContrastReading {
  const ratio = contrastRatio(foreground, background);
  const grade = contrastGrade(ratio);
  return { ratio, grade, label: `${formatContrast(ratio)}  ${grade}`, blurb: CONTRAST_GRADE_BLURB[grade] };
}

/**
 * Is a ratio good enough for body text? The one question a guard can ask about
 * a whole palette, kept here so the threshold is named in exactly one place.
 */
export function isBodyTextLegible(ratio: number): boolean {
  return ratio >= CONTRAST_AA;
}
