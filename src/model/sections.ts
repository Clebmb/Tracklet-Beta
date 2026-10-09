/**
 * sections — the song's FORM, as names for groups of bars.
 *
 * Everything else in a song is a bar: a pattern holds one, and the `order` is the
 * list of them, so `1 1 2 1` is two bars of verse, a chorus bar and the verse
 * again. That works exactly as long as a song is short, and stops working the
 * moment it is not — a three-minute song is a hundred numbers that mean nothing
 * to a reader, and the same four bars get retyped every time the chorus comes
 * round:
 *
 * ```text
 * order 1 1 2 1 1 1 2 1 3 2 1 1 1 2 1 3
 * ```
 *
 * A **section** names that group of bars once, and an **arrangement** is the
 * order written with those names instead of numbers:
 *
 * ```text
 * section VERSE 1 1 2 1
 * section CHORUS 3 4 3 5
 * arrange VERSE VERSE CHORUS VERSE CHORUS
 * ```
 *
 * The same sixteen bars, and the form is now readable off the page. `arrange`
 * BUILDS the order, so the song that plays is exactly the song `order` would have
 * played — sections are a way of writing the arrangement, not a second one. A
 * song with no sections is untouched, and a song WITH them still stores a plain
 * `order`, which is why every reader, the engine, the renderer, the tempo map and
 * every lane below this line neither know nor care that sections exist.
 *
 * ── What a section is, and is not ────────────────────────────────────────────
 *
 * A section is a LIST OF PATTERN NUMBERS, not a range of bars, and the difference
 * is the point: a chorus is `3 4 3 5` — three patterns in four bars, with one
 * returning — and a range could not say that. It also means a section needs no
 * second copy of a pattern: varying the last chorus means pointing one of its
 * bars at a different pattern in the order, which is a thing the app already
 * does.
 *
 * A name is ONE WORD, upper-cased, because an arrangement is read as a list of
 * words (`arrange INTRO VERSE CHORUS`) and a name with a space in it would need
 * quoting every time it is used. Two sections cannot share a name; the later
 * definition wins, which is the same bargain the tempo map and the lanes make
 * ("the last line about a thing is the one that counts").
 *
 * Phaser-free and audio-free like the rest of `model/`.
 */

import { MAX_ORDER, clampPatternNumber } from './song';
import { MAX_MACHINE_BARS } from './machine';

/**
 * How many sections a song may define.
 *
 * Twenty-four, and the number is a form rather than a file size: pop songs use
 * five (intro, verse, chorus, bridge, outro) and a long-form piece with movements
 * uses ten to twenty, while a song with more than twenty-four named parts is a
 * structure whose names are not helping anyone. It is also small enough that the
 * `F3` form view can list them all.
 *
 * Sixteen until a 36-pattern orchestral piece needed fifteen named movements plus
 * room to grow; the cap is a guard against a form nobody can read, not a budget.
 */
export const MAX_SECTIONS = 24;

/**
 * How long a section name may be, in characters.
 *
 * Twelve, the same budget a saved sound's name gets, because both are words a
 * person reads in a list rather than prose. `VERSE`, `CHORUS`, `MIDDLE 8`,
 * `OUTRO`-length names all fit; anything longer is a sentence being used as a
 * label.
 */
export const MAX_SECTION_NAME = 12;

/**
 * The word that repeats the section named before it: `arrange VERSE CHORUS
 * repeat 2`.
 *
 * Exported so the parser, the writer of a refusal and a tool that reads the
 * language all spell it once. It is a MODIFIER and not a command word — the
 * language's own rule prefers one — so `SCRIPT_KEYWORDS` does not move.
 */
export const REPEAT_WORD = 'repeat';

/**
 * How many times one `repeat` may play the section before it: 2..`MAX_ORDER`.
 *
 * Two is the floor rather than one because `repeat 1` is the name on its own —
 * the same refusal `*1` gets from a stutter, and for the same reason: a value
 * that means "nothing happened" looks like a value that did.
 */
export const MIN_REPEAT = 2;
export const MAX_REPEAT = MAX_ORDER;

/** The characters a name may be made of: one word, no spaces. */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * One named group of bars.
 *
 * Plain data, like every other part of a song: it is written to a file, cloned by
 * the undo stack and compared by a test, and none of that needs a class.
 */
export interface Section {
  /** The name, as written and as `arrange` uses it: upper case, one word. */
  name: string;
  /** The bars it holds, 1-based pattern numbers, in playing order. */
  bars: number[];
  /**
   * The drum machine BAR this section plays, 1-based, or `null`/absent for
   * "whatever the machine's own `order` says".
   *
   * This is the one part of a section that is about the SOUND rather than the
   * form: a section names a group of bars, and naming a machine bar here says
   * "the beat of this part is bar 2" — the VERSE keeps the four-on-the-floor, the
   * CHORUS switches to the busier bar, and no `machine order` list has to be kept
   * in step with the form by hand. It only bites while an ARRANGEMENT still
   * describes the order (see `machineBarsForSong`), which is the same condition
   * the `F3` form view labels bars under.
   */
  machineBar?: number | null;
}

/** A section's machine bar, cleaned: a whole bar number 1..`MAX_MACHINE_BARS`, or null. */
export function clampSectionMachineBar(machineBar: number | null | undefined): number | null {
  if (machineBar === null || machineBar === undefined) return null;
  if (!Number.isFinite(machineBar)) return null;
  return Math.max(1, Math.min(MAX_MACHINE_BARS, Math.round(machineBar)));
}

/** Upper-case a name and cut it to the budget: how a reader repairs one. */
export function tidySectionName(text: string): string {
  return text.trim().toUpperCase().slice(0, MAX_SECTION_NAME);
}

/**
 * Why a name cannot be used, in the words the parser prints, or `null`.
 *
 * A REFUSAL rather than a repair, and the one place this module draws that line:
 * a name is how `arrange` refers to a section, so silently changing `MY CHORUS`
 * into `MYCHORUS` would rewrite the arrangement that used it. The message says
 * what a name is, because "why can I not call it MY CHORUS" is the question
 * anybody who types one is about to ask.
 */
export function sectionNameProblem(text: string): string | null {
  const name = text.trim();
  if (name === '') return 'a section needs a name, e.g. "section VERSE 1 1 2 1".';
  if (!NAME_PATTERN.test(name)) {
    return `a section name is one word of letters, digits, "-" or "_" — no spaces — so an arrangement can read as a list of them; got "${name}". Try "section ${tidySectionName(name.replace(/[^A-Za-z0-9_-]+/g, '')) || 'VERSE'} 1 1 2 1".`;
  }
  if (name.length > MAX_SECTION_NAME) {
    return `a section name may be at most ${MAX_SECTION_NAME} characters; "${name}" is ${name.length}. Shorten it.`;
  }
  return null;
}

/** True when two names are the same section, however each was typed. */
export function sameSectionName(a: string, b: string): boolean {
  return tidySectionName(a) === tidySectionName(b);
}

/** The bars a section may hold, cleaned: whole pattern numbers, at most `MAX_ORDER`. */
export function clampSectionBars(bars: readonly number[]): number[] {
  return bars
    .filter((n) => Number.isFinite(n))
    .map(clampPatternNumber)
    .slice(0, MAX_ORDER);
}

/** One section with every field inside the range its own tables allow. */
export function tidySection(section: Section): Section {
  const out: Section = {
    name: tidySectionName(section.name),
    bars: clampSectionBars(section.bars),
  };
  // The machine bar is written only when the section NAMES one, so a section that
  // says nothing about the beat is the same plain object it always was — absent
  // and null both mean "the machine's own order decides".
  const machineBar = clampSectionMachineBar(section.machineBar);
  if (machineBar !== null) out.machineBar = machineBar;
  return out;
}

/** A copy of the whole list, tidied — what the file reader runs a song through. */
export function tidySections(sections: readonly Section[]): Section[] {
  const out: Section[] = [];
  for (const section of sections) {
    const tidied = tidySection(section);
    if (tidied.name === '' || tidied.bars.length === 0) continue;
    const at = out.findIndex((one) => one.name === tidied.name);
    if (at >= 0) out[at] = tidied;
    else out.push(tidied);
  }
  return out.slice(0, MAX_SECTIONS);
}

/**
 * Add or REPLACE a section by name, keeping the list in the order it was built.
 *
 * Replacing rather than appending is what makes `section VERSE …` twice mean "the
 * verse is this now": a script is read top to bottom and the last line about a
 * name is the one that counts, the same rule the tempo map and the lanes follow.
 */
export function withSection(sections: readonly Section[], section: Section): Section[] {
  const tidied = tidySection(section);
  const at = sections.findIndex((one) => one.name === tidied.name);
  if (at >= 0) {
    const next = sections.slice();
    next[at] = tidied;
    return next;
  }
  return [...sections, tidied].slice(0, MAX_SECTIONS);
}

/** Drop a section by name, for a menu that offers a delete. */
export function withoutSection(sections: readonly Section[], name: string): Section[] {
  return sections.filter((one) => !sameSectionName(one.name, name));
}

/** Look one up by name, however it was typed. `null` when the song has none. */
export function sectionByName(sections: readonly Section[], name: string): Section | null {
  const wanted = tidySectionName(name);
  return sections.find((one) => one.name === wanted) ?? null;
}

/** Every section name, as an arrangement would write them. */
export function sectionNames(sections: readonly Section[]): string[] {
  return sections.map((section) => section.name);
}

/** Whether two sections say the same thing, for a menu or a test. */
export function sameSection(a: Section, b: Section): boolean {
  return a.name === b.name && a.bars.length === b.bars.length && a.bars.every((bar, i) => bar === b.bars[i]);
}

/**
 * What a list of section names expands to, as the bars the song would play.
 *
 * The ONE reading of an arrangement — the parser, the `F3` form view and the file
 * reader all come through here, so a name cannot mean one thing while `arrange`
 * checks it and another when the screen draws it. Stops at the first name the
 * song does not define and reports it, because a form with a hole in it is not a
 * form: `missing` is the sentence the caller needs, and an arrangement that
 * uses a section twice is perfectly fine.
 */
export function arrangementBars(
  sections: readonly Section[],
  names: readonly string[],
): { bars: number[]; missing: string | null } {
  const bars: number[] = [];
  for (const name of names) {
    const section = sectionByName(sections, name);
    if (!section) return { bars, missing: name };
    bars.push(...section.bars);
  }
  return { bars, missing: null };
}

/** An arrangement as one line of words: `VERSE VERSE CHORUS`. */
export function arrangementLabel(arrangement: readonly string[]): string {
  return arrangement.join(' ');
}

/** An arrangement as the statement that writes it. */
export function arrangementScript(arrangement: readonly string[]): string {
  return arrangement.length === 0 ? '' : `arrange ${arrangementLabel(arrangement)}`;
}

/** How a menu writes one section: `VERSE  1 1 2 1`. */
export function sectionLabel(section: Section): string {
  return `${section.name}  ${section.bars.join(' ')}`;
}

/** How the app writes one section as a script line, so a song can save and reopen. */
export function sectionScript(section: Section): string {
  // The machine bar rides at the END of the line, only when the section names
  // one — so a section that says nothing about the beat writes the exact line
  // this app has always written for it.
  const machine = section.machineBar == null ? '' : ` machine ${section.machineBar}`;
  return `section ${section.name} ${section.bars.join(' ')}${machine}`;
}

/** The sections as one block of lines, or an empty string when there are none. */
export function sectionsToScript(sections: readonly Section[]): string {
  return sections.map(sectionScript).join('\n');
}

/**
 * Which section each bar of the order came from, or `null` where nothing says.
 *
 * Read for the `F3` form view, and the reason the arrangement is stored in the
 * song rather than recomputed: the answer is `VERSE` for bars 1–4 only because
 * somebody ARRANGED it that way, and the moment the order is edited by hand the
 * arrangement is no longer a description of it. So the answer is checked rather
 * than assumed — if the names do not expand to exactly this order, the whole list
 * is `null` and the screen says nothing rather than something almost right.
 */
export function orderSectionLabels(
  order: readonly number[],
  sections: readonly Section[],
  arrangement: readonly string[],
): (string | null)[] {
  if (!arrangementDescribes(order, sections, arrangement)) return order.map(() => null);
  const labels: (string | null)[] = [];
  for (const name of arrangement) {
    const section = sectionByName(sections, name)!;
    // One label per bar of the order, in the order the arrangement lays them out.
    for (let i = 0; i < section.bars.length; i++) labels.push(section.name);
  }
  return labels;
}

/**
 * The sections an arrangement never plays, in the order they were defined.
 *
 * Read for an ADVISORY rather than an error: naming a part and then not putting
 * it in the song is a decision an author is allowed to make — a bridge saved for
 * a longer edit, a chorus written twice — so this is the app noticing something
 * rather than refusing it. Only answerable while an arrangement is live: once the
 * order has been edited by hand no name describes a bar, so every section would
 * look unplayed and the answer would be noise.
 */
export function sectionsNeverPlayed(sections: readonly Section[], arrangement: readonly string[]): string[] {
  if (arrangement.length === 0) return [];
  return sections
    .filter((section) => !arrangement.some((name) => sameSectionName(name, section.name)))
    .map((section) => section.name);
}

/**
 * Whether a song has sections and plays a plain order anyway.
 *
 * True for two different situations that look the same from here, and both are
 * worth one gentle line: a script that wrote `section` lines and never reached
 * `arrange`, and a song whose order has been edited by hand in `F3` (which
 * forgets the arrangement on purpose). Either way the song has names for its bars
 * and is not using them.
 */
export function formUnarranged(sections: readonly Section[], arrangement: readonly string[]): boolean {
  return sections.length > 0 && arrangement.length === 0;
}

/**
 * Whether an arrangement still expands to exactly this order, bar for bar.
 *
 * The one question the whole feature turns on, asked in three places: the `F3`
 * form view (label the bars only when it is true), the script writer (write
 * `arrange` rather than `order` only when it is true) and the file reader (drop an
 * arrangement that is not, because a file written by something else may claim a
 * form the order does not have). Kept as one function so those three cannot
 * answer it differently.
 */
export function arrangementDescribes(
  order: readonly number[],
  sections: readonly Section[],
  arrangement: readonly string[],
): boolean {
  if (arrangement.length === 0 || sections.length === 0) return false;
  const { bars, missing } = arrangementBars(sections, arrangement);
  return missing === null && bars.length === order.length && bars.every((bar, i) => bar === order[i]);
}

