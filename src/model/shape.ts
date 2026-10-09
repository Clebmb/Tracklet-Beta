/**
 * shape — what KIND of filter a channel's `bright` knob opens, not how far.
 *
 * `bright` has always been one thing: a low-pass. Everything above the cutoff goes,
 * and the knob says where the cutoff is, which is why a low `bright` is a muffled
 * sound and a high one is a buzzing, open sound. That single shape is right for
 * almost everything, and it is also the reason two whole families of sound were
 * out of reach: the THIN ones (a stab with no bottom, a telephone vocal, a
 * breakdown that suddenly narrows) and the HOLLOW ones (a scooped mid, a vowel,
 * an old radio). Both are the same filter with a different answer to "which part
 * of the sound survives", and that is one word, not a new engine.
 *
 * ── Why this is a word rather than a knob ───────────────────────────────────
 * The language's rule is a percentage OR a word from a closed list, and a filter
 * TYPE is not on a scale: there is no way to be halfway between a low-pass and a
 * high-pass, and a percentage that meant "how much like a band-pass" would be a
 * number nobody could dial by ear. So `shape` names one of four, the way `wave`
 * names an oscillator and `groove` names a feel, and an unknown one is refused
 * with the list rather than rounded to something the author did not ask for.
 *
 * ── `bright` keeps its meaning, and here is what that means ─────────────────
 * The knob still moves the CUTOFF, and the cutoff is now the corner, center or
 * notch of whatever shape is in force. That is the honest reading of one number:
 * with `sharp` (a high-pass) a high `bright` removes more, so the thinnest sound
 * is at the top of the knob — the knob is no longer a brightness control on that
 * shape, it is the filter's own frequency, and the doc for each shape says which
 * way round it reads. The alternative (flipping the knob for three of the four
 * shapes) would mean a number whose direction depended on a word written
 * somewhere else on the line, which is exactly the kind of hidden state this
 * language refuses.
 *
 * The MODEL is audio-free, like the rest of `model/`: a `FilterShape` is a name,
 * and the Web Audio node it becomes lives in `audio/synth.ts` beside the note it
 * filters.
 *
 * Phaser-free and audio-free on purpose.
 */

/** Which part of the sound survives a channel's filter. */
export type FilterShape = 'round' | 'sharp' | 'nasal' | 'hollow';

/** One entry of the shape table: the id, and how it is named and described. */
export interface ShapeKind {
  id: FilterShape;
  /** How a menu spells it. Upper case, because every menu label here is. */
  label: string;
  /** Other spellings a script may use, including the technical ones. */
  aliases: readonly string[];
  /** What it does to the sound, in one line, for the menu and the docs. */
  blurb: string;
  /**
   * Which music reaches for it, in the same one-line voice as a blurb.
   *
   * The effects have one of these too, for the same reason: a knob with a named
   * end and a sentence is a knob somebody can choose without hearing it, which is
   * what an agent has to do and what a beginner wants to.
   */
  reach: string;
}

/**
 * Every filter shape this app knows, in the order a menu would cycle them.
 *
 * `round` is first because it is the default and the floor: it is what every
 * note in every song written before this existed already sounded like, so the
 * list reads "the one we had, then the three that were out of reach".
 */
export const FILTER_SHAPES: readonly ShapeKind[] = [
  {
    id: 'round',
    label: 'ROUND',
    aliases: ['lowpass', 'low-pass', 'low pass', 'lp'],
    blurb: 'the low-pass a note has always had: everything above the cutoff goes',
    reach: 'everything \u2014 this is the shape a tone control is, and the default',
  },
  {
    id: 'sharp',
    label: 'SHARP',
    aliases: ['highpass', 'high-pass', 'high pass', 'hp', 'thin'],
    blurb: 'a high-pass: the bottom goes instead, so the note turns thin and pointed',
    reach: 'thin stabs, a filtered breakdown, telephone vocals, no-bass acid',
  },
  {
    id: 'nasal',
    label: 'NASAL',
    aliases: ['bandpass', 'band-pass', 'band pass', 'bp', 'vowel'],
    blurb: 'a band-pass: only what sits near the cutoff survives, so the note takes on a vowel',
    reach: 'acid bass, talkbox vowels, an old radio, a formant lead',
  },
  {
    id: 'hollow',
    label: 'HOLLOW',
    aliases: ['notch', 'bandstop', 'band-stop', 'scoop'],
    blurb: 'a notch: the middle is scooped out and the top and the bottom both stay',
    reach: 'scooped funk chords, a swirling pad, a part that leaves room for a vocal',
  },
];

/** The shape a channel has when nothing says otherwise — the low-pass. */
export const DEFAULT_SHAPE: FilterShape = 'round';

/** The shape a name refers to, or null. Looks at ids, labels and aliases, folded. */
export function shapeFromName(text: string): ShapeKind | null {
  const want = text.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return FILTER_SHAPES.find((entry) =>
    entry.id === want || entry.label.toLowerCase().replace(/\s+/g, '-') === want
    || entry.aliases.includes(want) || entry.aliases.includes(want.replace(/-/g, '')),
  ) ?? null;
}

/** The shape with this id, or null if there is no such shape. */
export function shapeById(id: string): ShapeKind | null {
  return FILTER_SHAPES.find((entry) => entry.id === id) ?? null;
}

/** True when this is a shape id this build knows — what a file reader checks. */
export function isFilterShape(id: unknown): id is FilterShape {
  return typeof id === 'string' && FILTER_SHAPES.some((entry) => entry.id === id);
}

/** A shape as the menus write it. An id nothing knows reads as ROUND. */
export function shapeLabel(id: FilterShape): string {
  return shapeById(id)?.label ?? 'ROUND';
}

/** Every shape's name, for an error message that has to list them. */
export function shapeNames(): string {
  return FILTER_SHAPES.map((entry) => entry.id).join(', ');
}

/** What a shape does, in one line — the blurb a menu or a doc shows. */
export function shapeBlurb(id: FilterShape): string {
  return shapeById(id)?.blurb ?? '';
}
