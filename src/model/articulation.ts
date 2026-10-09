/**
 * articulation — how a note is PLAYED rather than what pitch it is.
 *
 * Everything on a `track` line belongs to the channel: `glide` slides a whole
 * part, `hold` decides how long its notes ring, `level` how loud all of them are.
 * A cell could differ from its neighbours in exactly ONE way — `C-4~40`, how hard
 * it is hit — and the things that make a line sound played rather than typed are
 * mostly about the note itself. Two of them are here.
 *
 * ```text
 * C-4>        slide into this note from the pitch the channel played before it
 * C-4*3       hit it three times inside its own length
 * C-4!        FLAM it — one grace hit leaning into the beat
 * C-4!!       DRAG it — two grace hits
 * C-4^2       SCOOP: start a whole tone below and rise onto the pitch
 * C-4v2       FALL: hold the pitch, then drop a whole tone away over its tail
 * C-4>*3~80   a slide and a stutter, at velocity 80
 * ```
 *
 * ── Why these two, and not the other three ───────────────────────────────────
 *
 * The plan named five: a slide into the note, a pitch bend, a stutter, a flam and
 * a deliberate drag. Two are here because the model already expresses them
 * EXACTLY, and the other three would each need a concept a cell does not have:
 *
 *   • **A slide** is the channel's own `glide`, aimed at one note. The engine and
 *     the renderer already ask for a glide amount and a `fromMidi` per note; a
 *     slide just answers 100 (the whole note) for that note instead of the
 *     channel's number — which is where the trap 808 lives, and the reason the
 *     plan put per-note glide in this item.
 *   • **A stutter** is the voice-building code run N times inside one step, and a
 *     step is already divisible (`hold`, and the length arithmetic both paths
 *     share).
 *   • **A bend** is a pitch ENVELOPE over a note — the same kind of thing as
 *     `sweep`, which is a knob on the sound rather than a property of one note.
 *     It is here after all (see BEND, below), because the plan kept asking for
 *     the one gesture a tracker cannot get anywhere else: an emo bend and a
 *     whammy dive are both a note moving its OWN pitch, and a tracker had no way
 *     to write either — `>` arrives from the note before it, which is a
 *     relationship between two notes, not one note bending.
 *   • **A flam and a drag** need a hit that is not ON the step: a flam is two hits
 *     with a hole between them, a drag adds a third. They are here as GRACE hits —
 *     `at` is allowed to be negative, so the graces sit just before the beat and
 *     the main hit stays on it — because that is exactly the primitive this file
 *     already hands the scheduler, the renderer and the writer, and a generator
 *     that can only write cells could never place a hit between two of them.
 *
 * ── The one rule that makes this safe ────────────────────────────────────────
 *
 * `NO_ARTICULATION` is the default, and `articulationHits` answers with exactly
 * ONE hit covering the whole note for it — `at: 0`, `length: 1`, and the
 * channel's own glide passed straight through. So a note that says nothing is
 * built with the same numbers at the same time it was built with before this
 * existed, in both the live engine and the renderer, and every old song keeps its
 * samples and its bytes.
 *
 * Phaser-free and audio-free like the rest of `model/`.
 */

/**
 * The glide a slide uses: the whole note, 0..100.
 *
 * Written here rather than imported from `song.ts` so this file keeps the one-way
 * dependency the other small model tables have (`sections.ts`, `shape.ts` read
 * `song.ts`; it does not read them back). A test pins this to `MAX_GLIDE`, so the
 * two cannot drift apart in silence.
 */
export const SLIDE_GLIDE = 100;

/**
 * How many hits a stutter may have inside one step.
 *
 * Two is a roll's smallest unit and a trap hat's whole trick; eight is a fast
 * buzz. Above that it stops being a repeated note and becomes a different sound —
 * a granular texture is the `granular` wave's business, not a cell's — and one
 * step is short enough that the question matters.
 */
export const MIN_STUTTER = 2;
export const MAX_STUTTER = 8;

/** A plain note is hit ONCE. Not a `MIN_STUTTER` of 1: this is "no stutter". */
export const DEFAULT_STUTTER = 1;

/**
 * The characters a suffix is made of: `>` slides, `*N` stutters.
 *
 * Exported because the wording of two messages is about the CHARACTER rather than
 * about the gesture — a file reader telling somebody to write `">*3"`, and this
 * file's own problem messages — and a second copy of a `>` is how a language ends
 * up with two spellings for one thing.
 */
export const SLIDE_CHAR = '>';
export const STUTTER_CHAR = '*';
/**
 * The character a FLAM or a DRAG is written with: `!` for one grace hit, `!!`
 * for two.
 *
 * A `!` rather than a letter, because every letter that reads as \"flam\" or
 * \"drag\" is a note name or a word a drum already uses, and a cell has no room
 * for a separator to tell them apart. The WORDS `flam` and `drag` are accepted
 * where an articulation is a value of its own (a `note` or `drum` line); in a
 * CELL the shape is the `!`.
 */
export const GRACE_CHAR = '!';
export const FLAM_WORD = 'flam';
export const DRAG_WORD = 'drag';

/** How many grace hits a note may lead in with: 1 (flam) or 2 (drag). */
export const MAX_GRACE = 2;

/**
 * The two characters a BEND is written with, and how far it may reach.
 *
 * `^` points up and `v` points down, and each is the gesture its arrow suggests:
 * a SCOOP (`C-4^2`) starts the note two semitones BELOW its pitch and rises onto
 * it, which is an emo bend, a pedal-steel arrival and a horn leaning into a note;
 * a FALL (`C-4v2`) starts ON the pitch and drops away from it over the note's
 * tail, which is a whammy dive, a tape stopping and the end of a vaporwave line.
 *
 * Two gestures rather than four, deliberately: bending UP away from a note and
 * DOWN into one are the same shapes heard backwards, and this language writes a
 * note for what it DOES — a scoop arrives, a fall departs. The `>` slide is the
 * third kind of arrival and is a different thing: it comes from the pitch the
 * channel played BEFORE, which is a relationship between two notes, where a bend
 * moves the one note's own pitch.
 */
export const SCOOP_CHAR = '^';
export const FALL_CHAR = 'v';

/**
 * How far a bend may reach, in semitones: 1..12, and two by default.
 *
 * A whole tone is what a person means by "a bend" — the emo bend and the dive
 * are both a tone — and an octave is where a bend stops being a bend and starts
 * being a different note. The count is optional in a cell (`C-4^` is `C-4^2`),
 * for the reason `octave up` is one octave: the gesture has a natural size.
 */
export const MIN_BEND = 1;
export const MAX_BEND = 12;
export const DEFAULT_BEND = 2;

/**
 * How long a bend takes, as a fraction of the note — and the cap on that.
 *
 * A bend is a SPEED as much as a proportion: a scoop is a few tens of
 * milliseconds on any instrument, so a two-second pad must not take eight hundred
 * of them to arrive. These are the same numbers the audio paths use (`synth.ts`
 * calls `bendSeconds`), which is why they live here with the rule rather than
 * beside the oscillator code — the file, the docs and a test can all cite them.
 */
export const SCOOP_SPAN = 0.35;
export const FALL_SPAN = 0.4;
export const BEND_MAX_SECONDS = 0.25;
export const BEND_MIN_SECONDS = 0.005;

/** How long one bend takes over a note of `noteSeconds`, in seconds. */
export function bendSeconds(noteSeconds: number, span: number): number {
  if (!Number.isFinite(noteSeconds) || noteSeconds <= 0) return BEND_MIN_SECONDS;
  return Math.min(BEND_MAX_SECONDS, Math.max(BEND_MIN_SECONDS, noteSeconds * span));
}

/**
 * How far before the main hit a grace sits, and how short each one is, as
 * fractions of the note.
 *
 * A flam is a few TENS OF MILLISECONDS — the two sticks almost together — and a
 * fraction of the note keeps that true at any tempo for the same reason `glide`
 * is a percentage: a gesture, not a time. The main hit stays exactly on the beat,
 * which is the whole point: a flam leans into the beat, it does not leave it.
 */
export const GRACE_GAP = 0.08;
export const GRACE_LENGTH = 0.08;

/**
 * How a note is played, apart from its pitch and its force.
 *
 * Plain data on purpose: it lives on the CELL (see `song.ts`), it is written to a
 * file, and the undo stack clones it.
 */
export interface Articulation {
  /**
   * Whether this note slides into its pitch from the pitch the channel played
   * before it, over the whole note.
   *
   * The channel's own `glide` is what a note does when it says nothing; a slide
   * is the note that wants the full gesture — the 808's low note bending up into
   * the next one, a pedal steel, a singer arriving at a pitch rather than hitting
   * it. It applies to the FIRST hit of a stutter and not to the repeats, because
   * a repeat is a repeat.
   */
  slide: boolean;
  /**
   * How many times this note is hit inside its own length: `1` for a plain note,
   * `2`..`8` for a roll.
   *
   * Evenly spaced and all at the same force, which is what makes it a STUTTER
   * rather than a performance: the hits divide the note's length exactly, so the
   * last one still ends where the note would have ended. (What a human hand does
   * instead — a flam, a drag — is uneven on purpose, and that is the generators'
   * arithmetic, not a suffix's.)
   */
  stutter: number;
  /**
   * How far this note BENDS its own pitch, in semitones, signed: `+N` scoops up
   * INTO the note from N semitones below (`^`), `-N` falls OUT of it by N
   * semitones over its tail (`v`), and `0` — the default — is a note that holds
   * the pitch it was written at.
   *
   * A bend is the one pitch gesture that belongs to a SINGLE note, which is why
   * it is a suffix and not a channel setting: the channel's `glide` says how much
   * of a slide to make, and `>` says this note takes the whole of it, but neither
   * can say "this note arrives from below" or "this note leaves downward". The
   * audio paths write it as an automation on the oscillator's own `detune` — the
   * same parameter the vibrato rides — so a bend and a wobble add rather than one
   * replacing the other.
   */
  bend: number;
  /**
   * How many GRACE hits lead into this one: `0` for a plain note, `1` for a
   * FLAM, `2` for a DRAG.
   *
   * The gesture a rock snare and a brush snare are almost entirely made of: two
   * (or three) hits so close together that the ear hears one hit with a soft
   * front. Written `kick!` in a cell, `kick!!` for a drag, or `flam`/`drag` as a
   * `note`/`drum` line's value. The graces sit BEFORE the beat and the main hit
   * stays ON it, which is what a flam is — it leans into the beat, it does not
   * leave it. Like a stutter this is a property of ONE note, so it lives here.
   */
  grace: number;
}

/**
 * The articulation of a note that says nothing: no slide, one hit, no grace, and
 * a pitch that holds where it was written.
 */
export const NO_ARTICULATION: Articulation = { slide: false, stutter: DEFAULT_STUTTER, grace: 0, bend: 0 };

/** True when this is the default — the articulation a cell has by saying nothing. */
export function isArticulation(value: Articulation): boolean {
  return value.slide === false && value.stutter === DEFAULT_STUTTER && value.grace === 0 && value.bend === 0;
}

/** Whether two notes are played the same way, for a test or a comparison. */
export function sameArticulation(a: Articulation, b: Articulation): boolean {
  return a.slide === b.slide && a.stutter === b.stutter && a.grace === b.grace && a.bend === b.bend;
}

/** A stutter count inside the range a cell may ask for. */
export function clampStutter(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_STUTTER;
  const whole = Math.round(count);
  if (whole < MIN_STUTTER) return DEFAULT_STUTTER;
  return Math.min(MAX_STUTTER, whole);
}

/** A grace count inside the range a cell may ask for: 0, 1 or 2. */
export function clampGrace(count: number): number {
  if (!Number.isFinite(count)) return 0;
  const whole = Math.round(count);
  if (whole < 1) return 0;
  return Math.min(MAX_GRACE, whole);
}

/**
 * A bend inside the range a cell may ask for: `-12..-1` or `1..12`, and `0` for
 * no bend.
 *
 * A rounded whole number of semitones, because a bend is a GESTURE and its size
 * is the interval it covers — a hundredth of a semitone is a wobble, which is
 * what `vibrato` is for.
 */
export function clampBend(semitones: number): number {
  if (!Number.isFinite(semitones)) return 0;
  const whole = Math.round(semitones);
  if (whole === 0) return 0;
  const reach = Math.min(MAX_BEND, Math.abs(whole));
  return whole > 0 ? reach : -reach;
}

/** Every field inside the range its own table allows. */
export function tidyArticulation(value: Partial<Articulation>): Articulation {
  return {
    slide: value.slide === true,
    stutter: clampStutter(value.stutter ?? DEFAULT_STUTTER),
    grace: clampGrace(value.grace ?? 0),
    bend: clampBend(value.bend ?? 0),
  };
}

/**
 * Parse a suffix — what follows the pitch in a cell, or the value on a `note`
 * line — or `null` when it is not something a note can do.
 *
 * The two tokens may be written in either order and at most once each, and the
 * empty string is the default. `null` rather than a repair, because the caller
 * has a line number and the message can only name what was wrong if it knows what
 * was written: see `articulationProblem`.
 */
export function parseArticulation(text: string): Articulation | null {
  const source = text.trim();
  if (source === '') return { ...NO_ARTICULATION };
  // The WORDS are accepted where an articulation is a value of its own (a `note`
  // or `drum` line): `flam` and `drag` read better there than `!` does. In a CELL
  // the shape is the `!`, because a letter would collide with a note name.
  const word = source.toLowerCase();
  if (word === FLAM_WORD) return { slide: false, stutter: DEFAULT_STUTTER, grace: 1, bend: 0 };
  if (word === DRAG_WORD) return { slide: false, stutter: DEFAULT_STUTTER, grace: 2, bend: 0 };
  let slide = false;
  let stutter = DEFAULT_STUTTER;
  let grace = 0;
  let bend = 0;
  let at = 0;
  while (at < source.length) {
    const ch = source[at];
    if (ch === SLIDE_CHAR) {
      if (slide) return null;
      slide = true;
      at += 1;
      continue;
    }
    if (ch === STUTTER_CHAR) {
      if (stutter !== DEFAULT_STUTTER) return null;
      let digits = '';
      at += 1;
      while (at < source.length && source[at] >= '0' && source[at] <= '9') {
        digits += source[at];
        at += 1;
      }
      if (digits === '') return null;
      const count = Number(digits);
      if (!Number.isInteger(count) || count < MIN_STUTTER || count > MAX_STUTTER) return null;
      stutter = count;
      continue;
    }
    if (ch === GRACE_CHAR) {
      if (grace !== 0) return null;
      let count = 1;
      at += 1;
      while (at < source.length && source[at] === GRACE_CHAR) {
        count += 1;
        at += 1;
      }
      if (count > MAX_GRACE) return null;
      grace = count;
      continue;
    }
    if (ch === SCOOP_CHAR || ch === FALL_CHAR) {
      // One bend per note, and the count is optional: `C-4^` is `C-4^2`.
      if (bend !== 0) return null;
      const sign = ch === SCOOP_CHAR ? 1 : -1;
      at += 1;
      let digits = '';
      while (at < source.length && source[at] >= '0' && source[at] <= '9') {
        digits += source[at];
        at += 1;
      }
      const amount = digits === '' ? DEFAULT_BEND : Number(digits);
      if (!Number.isInteger(amount) || amount < MIN_BEND || amount > MAX_BEND) return null;
      bend = sign * amount;
      continue;
    }
    return null;
  }
  // A STUTTER and a GRACE are two different fills of the same instant — one tiles
  // the step with even hits, the other leans a hit into the beat — so a note that
  // asks for both is refused rather than played as one of them.
  if (grace > 0 && stutter !== DEFAULT_STUTTER) return null;
  // And a SCOOP and a SLIDE are two different arrivals: one comes from the pitch
  // the channel played before, the other from a fixed interval below this note,
  // and a note can only start in one place. A FALL is a DEPARTURE, so it rides
  // along with either — that is a note that arrives one way and leaves another.
  if (bend > 0 && slide) return null;
  return { slide, stutter, grace, bend };
}

/**
 * Why a suffix cannot be used, in the words the parser prints, or `null`.
 *
 * A REFUSAL rather than a repair, like a shape and a bus name: a note that asked
 * to be played a certain way and was quietly played plainly is a note the author
 * cannot hear the difference in. Each message says what the character means and
 * what the range is, because `*1` and `*9` are the two mistakes that look like
 * correct lines.
 */
export function articulationProblem(text: string): string | null {
  const source = text.trim();
  if (source === '') return null;
  if (source === `${SLIDE_CHAR}${SLIDE_CHAR}` || />>/.test(source)) {
    return `a note slides once: "${source}" has two "${SLIDE_CHAR}"s. Write "${SLIDE_CHAR}" for a slide into the note, "${STUTTER_CHAR}3" for three hits, and both as "${SLIDE_CHAR}${STUTTER_CHAR}3".`;
  }
  if (source.includes(`${STUTTER_CHAR}${STUTTER_CHAR}`)) {
    return `a note stutters once: "${source}" has two "${STUTTER_CHAR}"s. Write "${STUTTER_CHAR}3" for three hits in one step.`;
  }
  if (source.includes(`${GRACE_CHAR}${GRACE_CHAR}${GRACE_CHAR}`)) {
    return `a note drags at most twice: "${source}" has too many "${GRACE_CHAR}"s. Write "${GRACE_CHAR}" for a flam (one grace hit) or "${GRACE_CHAR}${GRACE_CHAR}" for a drag (two).`;
  }
  if (source.includes(SCOOP_CHAR) && source.includes(FALL_CHAR)) {
    return `a note bends one way: "${source}" has both a "${SCOOP_CHAR}" and a "${FALL_CHAR}". Write "${SCOOP_CHAR}2" to scoop UP onto the note from a whole tone below, or "${FALL_CHAR}2" to fall away from it by a whole tone.`;
  }
  if (source.includes(SCOOP_CHAR) && source.includes(SLIDE_CHAR)) {
    return `a note arrives one way: "${source}" both slides and scoops. A "${SLIDE_CHAR}" slides in from the pitch the channel played before it and a "${SCOOP_CHAR}" scoops up from a fixed interval below the note; write one of them, or slide in and FALL away with "${SLIDE_CHAR}${FALL_CHAR}2".`;
  }
  if ((source.match(new RegExp(`\\${SCOOP_CHAR}|${FALL_CHAR}`, 'g')) ?? []).length > 1) {
    return `a note bends once: "${source}". Write "${SCOOP_CHAR}2" for a scoop up, "${FALL_CHAR}3" for a fall of three semitones — ${MIN_BEND}..${MAX_BEND} semitones, and "${SCOOP_CHAR}" alone is ${DEFAULT_BEND}.`;
  }
  const bendAt = source.search(/[\^v]/);
  if (bendAt >= 0) {
    const digits = /^(\d*)/.exec(source.slice(bendAt + 1))?.[1] ?? '';
    const amount = digits === '' ? DEFAULT_BEND : Number(digits);
    if (digits !== '' && (amount < MIN_BEND || amount > MAX_BEND)) {
      return `a bend is ${MIN_BEND}..${MAX_BEND} semitones; got "${source.slice(bendAt)}". "${SCOOP_CHAR}" alone is ${DEFAULT_BEND} — a whole tone — and "${FALL_CHAR}${MAX_BEND}" is an octave, which is as far as a bend goes.`;
    }
  }
  if (source.includes(GRACE_CHAR) && source.includes(STUTTER_CHAR)) {
    return `a note cannot both roll and flam: "${source}". A stutter ("${STUTTER_CHAR}3") tiles the step with even hits and a flam ("${GRACE_CHAR}") leans a hit into the beat. Write one of them.`;
  }
  const open = source.indexOf(STUTTER_CHAR);
  if (open >= 0 && open + 1 >= source.length) {
    return `a stutter needs a count: "${STUTTER_CHAR}3" is three hits and "${STUTTER_CHAR}2" is a flam, ${MIN_STUTTER}..${MAX_STUTTER} hits inside one step.`;
  }
  const digits = open >= 0 ? /^(\d+)/.exec(source.slice(open + 1))?.[1] : undefined;
  if (open >= 0 && digits !== undefined) {
    const count = Number(digits);
    if (count === 1) {
      return `"${STUTTER_CHAR}1" is just a note: one hit is what a cell is without a stutter. Write the note on its own, or "${STUTTER_CHAR}${MIN_STUTTER}" for two hits.`;
    }
    if (count < MIN_STUTTER || count > MAX_STUTTER) {
      return `a stutter is ${MIN_STUTTER}..${MAX_STUTTER} hits inside one step; got "${STUTTER_CHAR}${count}". More than ${MAX_STUTTER} in a step is not a roll — write it across two cells, or use a faster grid.`;
    }
  }
  // Nothing specific to complain about, so ask the READER. Deriving the last
  // answer from `parseArticulation` rather than repeating its rules is what makes
  // the two agree by construction: a suffix this function allows is a suffix that
  // parses, and one it refuses is one that does not — which is the property the
  // callers depend on, since they ask this one first.
  if (parseArticulation(source) !== null) return null;
  return `"${source}" is not something a note can do. A note may SLIDE into its pitch ("${SLIDE_CHAR}"), STUTTER ("${STUTTER_CHAR}3" is three hits in one step, ${MIN_STUTTER}..${MAX_STUTTER}), FLAM ("${GRACE_CHAR}") or DRAG ("${GRACE_CHAR}${GRACE_CHAR}") into the beat, SCOOP up onto it ("${SCOOP_CHAR}2", ${MIN_BEND}..${MAX_BEND} semitones) or FALL away from it ("${FALL_CHAR}2"), or combine a stutter or a flam with a slide.`;
}

/**
 * The suffix the language writes for this articulation: ``, `>`, `*3`, `^2` or
 * `>v2*3`.
 *
 * The order is gesture, then pitch bend, then how the hits are dealt out — `>`,
 * then `^`/`v`, then `*N`, then `!` — which is the order to read a cell in even
 * though the reader takes them in any order. The bend's count is left out when it
 * is the default, so the common `C-4^` stays as short as the gesture is common.
 */
export function articulationText(value: Articulation): string {
  const slide = value.slide ? SLIDE_CHAR : '';
  const bend = bendText(value.bend);
  const stutter = value.stutter > DEFAULT_STUTTER ? `${STUTTER_CHAR}${clampStutter(value.stutter)}` : '';
  const grace = value.grace > 0 ? GRACE_CHAR.repeat(clampGrace(value.grace)) : '';
  return `${slide}${bend}${stutter}${grace}`;
}

/** One bend's own spelling: `^`, `^7`, `v`, `v3`, or nothing at all. */
export function bendText(semitones: number): string {
  const bend = clampBend(semitones);
  if (bend === 0) return '';
  const char = bend > 0 ? SCOOP_CHAR : FALL_CHAR;
  const reach = Math.abs(bend);
  return reach === DEFAULT_BEND ? char : `${char}${reach}`;
}

/** The same thing in words, for a panel or a menu: `SLIDE`, `STUTTER x3`, `SCOOP 2`. */
export function articulationLabel(value: Articulation): string {
  const words: string[] = [];
  if (value.slide) words.push('SLIDE');
  const bend = clampBend(value.bend);
  if (bend !== 0) words.push(`${bend > 0 ? 'SCOOP' : 'FALL'} ${Math.abs(bend)}`);
  if (value.stutter > DEFAULT_STUTTER) words.push(`STUTTER x${clampStutter(value.stutter)}`);
  if (value.grace > 0) words.push(clampGrace(value.grace) >= 2 ? 'DRAG' : 'FLAM');
  return words.join(' + ');
}

/**
 * One hit of a note, as FRACTIONS of the note's whole length.
 *
 * Fractions rather than seconds or ticks, because the callers measure in
 * different units: the scheduler and the renderer have seconds, the MIDI writer
 * has ticks, and a `hold` of eight steps is eight times one step. Whoever has the
 * length multiplies — which is what keeps one rule for "where does the third hit
 * of a stutter fall" instead of three that can drift apart.
 */
export interface ArticulatedHit {
  /** Where this hit begins, 0..1 of the note's length. */
  at: number;
  /** How much of the note's length it sounds for. */
  length: number;
  /** How much of ITS OWN length this hit spends sliding into its pitch, 0..100. */
  glide: number;
  /**
   * The pitch bend THIS hit makes, signed: `+N` scoops up onto it, `-N` falls
   * away from it, `0` holds the pitch. Only one hit of a note carries one — the
   * first hit for a scoop, the last for a fall — because a bend is one gesture
   * over the note, and a note hit four times does not scoop four times.
   */
  bend: number;
}

/**
 * How a note is actually struck, in order.
 *
 * The identity for a note that says nothing: one hit, at the start, for the whole
 * length, at the channel's own glide. That identity is the promise of the whole
 * file — a note with no articulation produces the same numbers as it did before
 * articulation existed — and it is asserted rather than assumed.
 *
 * For a stutter the hits tile the note exactly: hit `i` begins at `i/N` and lasts
 * `length/N`, so the last one still ends where the note would have ended, and a
 * monophonic channel cutting each hit off at the next one's start sounds the same
 * as a polyphonic one letting each run its own course.
 */
export function articulationHits(value: Articulation, glide: number): ArticulatedHit[] {
  const count = clampStutter(value.stutter);
  const graces = clampGrace(value.grace);
  const bend = clampBend(value.bend);
  // The channel's glide is what a note does when it says nothing; a slide is this
  // note asking for the whole arrival instead. Computed once, so a slide and a
  // plain note cannot disagree about which hit is the one that arrives.
  const arriving = value.slide ? SLIDE_GLIDE : glide;
  const hits: ArticulatedHit[] = [];
  // The GRACE hits come first and sit BEFORE the beat, oldest first, so a drag's
  // two graces land in the order a hand would play them; the main hit stays ON
  // the beat. They do not slide or bend — a grace is already at the pitch it
  // ornaments, and the note's own pitch gesture belongs to the note.
  for (let i = graces; i >= 1; i -= 1) {
    hits.push({ at: -i * GRACE_GAP, length: GRACE_LENGTH, glide: 0, bend: 0 });
  }
  if (count <= 1) {
    hits.push({ at: 0, length: 1, glide: arriving, bend });
    return hits;
  }
  for (let i = 0; i < count; i++) {
    hits.push({
      at: i / count,
      length: 1 / count,
      // The slide is the note's gesture, not the repeat's: the first hit arrives
      // at the pitch, and the rest are already there. GRACE hits are already in
      // this list, so `graces` is the index of the first hit ON the beat — the
      // one a scoop belongs to. A fall belongs to the last hit, whichever it is.
      glide: i === 0 ? arriving : 0,
      bend: bend > 0 ? (i === 0 ? bend : 0) : bend < 0 ? (i === count - 1 ? bend : 0) : 0,
    });
  }
  return hits;
}
