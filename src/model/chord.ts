/**
 * chord — several notes that belong together, as one thing to write.
 *
 * A tracker cell holds ONE note, so a three-note chord has always cost three
 * columns and three lines. That is fine for someone who knows a triad is
 * `root, third, fifth` and knows which of the two kinds of third to use. For
 * everybody else it is the wall: the single biggest reason a beginner's first
 * loop is a melody with no harmony under it.
 *
 * So a chord here is a BUNDLE of notes to write at one step, and it can be
 * asked for in the two ways people actually think:
 *
 *   • BY DEGREE, relative to the song's key — "the sixth chord", and the app
 *     works out that in A minor that is F A C. This is the beginner path, and
 *     the one the piano uses: press F, get F A C.
 *   • BY NAME, absolute — `Dm`, `F#7`, `Bbdim` — where the spelling decides the
 *     intervals. This is the path for a borrowed chord: in D minor you can ask
 *     for `A7` and get the C# that makes it bite.
 *
 * ── Why degrees stack SCALE steps, not semitones ─────────────────────────────
 * A chord is every other note of a scale, so `1 3 5` means degrees 1, 3 and 5 —
 * skip one, take one. Building it in semitones instead (root, +3, +7) would give
 * the right answer for a major key and the wrong one for every other scale,
 * because the third of a chord in D minor is not a fixed distance away: F to A
 * is four semitones and D to F is three. Counting degrees is what makes one rule
 * work in all five scales, and it is why the key has to come first.
 *
 * Phaser-free on purpose, like the rest of `model/`.
 */

import { clampMidi, midiToNoteName, NOTE_NAMES } from './notes';
import { scaleById, type SongKey } from './scale';
import { MAX_ROWS } from './song';

export type ChordQuality =
  | 'major' | 'minor' | 'diminished' | 'augmented'
  | 'dominant-7' | 'major-7' | 'minor-7' | 'diminished-7' | 'half-diminished-7'
  | 'power' | 'sus2' | 'sus4' | 'sixth' | 'add9' | 'ninth';

export interface ChordShape {
  id: ChordQuality;
  /** Semitones above the root, ascending. */
  intervals: readonly number[];
  /** Printed after a root name in a label: `D` + ` MINOR`. */
  label: string;
  /**
   * The shortest way to write this shape after a root: `D` + `m` = `Dm`.
   *
   * It is doing two jobs, and they want the same string. A script reads it
   * (`chord 0 1 Dm`), and the piano prints it when chord mode is on, where a
   * white key is 45px wide and `G#dim7` would not fit. So the shapes that a
   * chord symbol abbreviates are abbreviated here — `o` for diminished, `+` for
   * augmented, `o7` for a diminished seventh — and the round trip through
   * `chordQualityFromName` is asserted in the tests, so the shorthand the piano
   * shows is always something a script accepts back.
   */
  suffix: string;
}

/**
 * Fifteen shapes, in three groups: the four triads, the five sevenths that fall
 * out of the scales, and the six COLOR shapes the genres reach for.
 *
 * ── The third group, and why it exists ──────────────────────────────────────
 * The first nine are every shape a scale DEGREE produces, which is why chord
 * mode never has to shrug. They are not, however, what most records are made of:
 * a rock rhythm guitar plays `5` (a power chord, and the shape that makes
 * distortion sound like a band rather than a fuzzbox), emo borrows `sus2` and
 * `sus4` instead of resolving, and vaporwave lives on `6`, `add9` and `9`. All
 * six are transcribed from a chord symbol rather than stacked from a scale, so
 * they sit at the end where no degree rule has to know about them.
 *
 * Nothing here is a new mechanism: a shape is its intervals, its label and the
 * suffix a script writes, and `chordQualityOf` derives the name from the notes,
 * so all fifteen round-trip through the tests the same way.
 *
 * The ninth is the odd one out and it is here for a reason. Stacking a major
 * scale's seventh note — B in C major — gives B D F A, a half-diminished
 * seventh: three semitones, three more, then four. Without it, chord mode's 7TH
 * setting would have a hole exactly where the vii chord of a major key sits (and
 * the ii of a minor one), and would fall back to printing a note name. Every other
 * shape a scale degree produces is one of these nine, so 7TH mode never has to
 * shrug.
 *
 * Every shape is listed in the order a chord is built, so `intervals` doubles as
 * the definition and as the name-reading table.
 */
export const CHORD_SHAPES: readonly ChordShape[] = [
  { id: 'major', intervals: [0, 4, 7], label: 'MAJOR', suffix: '' },
  { id: 'minor', intervals: [0, 3, 7], label: 'MINOR', suffix: 'm' },
  { id: 'diminished', intervals: [0, 3, 6], label: 'DIMINISHED', suffix: 'o' },
  { id: 'augmented', intervals: [0, 4, 8], label: 'AUGMENTED', suffix: '+' },
  { id: 'dominant-7', intervals: [0, 4, 7, 10], label: '7', suffix: '7' },
  { id: 'major-7', intervals: [0, 4, 7, 11], label: 'MAJOR 7', suffix: 'M7' },
  { id: 'minor-7', intervals: [0, 3, 7, 10], label: 'MINOR 7', suffix: 'm7' },
  { id: 'diminished-7', intervals: [0, 3, 6, 9], label: 'DIMINISHED 7', suffix: 'o7' },
  { id: 'half-diminished-7', intervals: [0, 3, 6, 10], label: 'HALF-DIM 7', suffix: 'm7b5' },
  // The COLOR shapes: no third, or a third plus a note from the next octave.
  // `power` is two notes, so it is the one shape a monophonic-looking cell can
  // hold whole; `add9` and `ninth` reach ABOVE the octave, which the pitch
  // arithmetic already allows (an interval is semitones above the root, and
  // `clampMidi` is what keeps the result playable).
  { id: 'power', intervals: [0, 7], label: 'POWER', suffix: '5' },
  { id: 'sus2', intervals: [0, 2, 7], label: 'SUS2', suffix: 'sus2' },
  { id: 'sus4', intervals: [0, 5, 7], label: 'SUS4', suffix: 'sus4' },
  { id: 'sixth', intervals: [0, 4, 7, 9], label: '6', suffix: '6' },
  { id: 'add9', intervals: [0, 4, 7, 14], label: 'ADD9', suffix: 'add9' },
  { id: 'ninth', intervals: [0, 4, 7, 10, 14], label: '9', suffix: '9' },
];

/** The smallest chord. Two notes is an interval, and four is a seventh. */
export const TRIAD_SIZE = 3;
/** Degrees apart: root, then skip one, skip one. */
const DEGREE_STEP = 2;
/**
 * The chord the app writes when nobody said how big: a triad. Three notes is the
 * one a beginner means by "a chord", and it leaves room for the next two on a
 * four-track song, which is the default song.
 */
export const DEFAULT_CHORD_DEGREES = TRIAD_SIZE;
/** Degrees in the longest chord Tracklet writes: a seventh. */
export const MAX_CHORD_DEGREES = 4;

function pitchClass(n: number): number {
  return ((Math.round(n) % 12) + 12) % 12;
}

export function chordShape(id: ChordQuality): ChordShape {
  return CHORD_SHAPES.find((shape) => shape.id === id) ?? CHORD_SHAPES[0];
}

/**
 * The notes of a named chord, in semitones above whatever root you give it.
 *
 * Every note is clamped to the range Tracklet can name, for the same reason
 * `writeNote` clamps: a seventh on B-7 would otherwise produce a note the grid
 * cannot print and the engine cannot play.
 */
export function chordPitches(rootMidi: number, quality: ChordQuality): number[] {
  return chordShape(quality).intervals.map((interval) => clampMidi(rootMidi + interval));
}

/**
 * Read a chord's quality from the notes themselves.
 *
 * The app needs this the other way round from everyone else: it BUILDS a chord
 * from a key, then says what it built. Working it out from the intervals means
 * the label cannot disagree with the notes — it is derived from them.
 */
export function chordQualityOf(notes: readonly number[]): ChordQuality | null {
  if (notes.length < 2) return null;
  const root = Math.min(...notes);
  const intervals = [...notes].sort((a, b) => a - b).map((note) => note - root);
  return CHORD_SHAPES.find((shape) =>
    shape.intervals.length === intervals.length
    && shape.intervals.every((interval, i) => interval === intervals[i]))?.id ?? null;
}

/**
 * The notes of the key, ascending, starting on the tonic — the ladder a chord
 * is measured on. Seven entries per octave, so index `7` is the tonic again.
 */
export function keyLadder(key: SongKey, count = 14): number[] {
  const steps = scaleById(key.scale).steps;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(key.tonic + steps[i % steps.length] + 12 * Math.floor(i / steps.length));
  }
  return out;
}

/** The scale degree (0-based) of a pitch class in the key, or -1. */
function degreeOf(midi: number, key: SongKey): number {
  const ladder = keyLadder(key, scaleById(key.scale).steps.length);
  return ladder.findIndex((note) => pitchClass(note) === pitchClass(midi));
}

/** Semitones from the tonic up to degree `d`, so a stack is a subtraction. */
function upToDegree(d: number, key: SongKey): number {
  const ladder = keyLadder(key, 14);
  const index = ((d % ladder.length) + ladder.length) % ladder.length;
  return ladder[index] + 12 * Math.floor(d / ladder.length);
}

/**
 * A chord built from the song's key: the root you asked for, then every other
 * note of the scale above it.
 *
 * This is what makes chord mode teach while it writes. Press D in C major and
 * the stack comes back D F A — a MINOR chord — not because the app knows the
 * word, but because F and A are simply the next scale notes after D. Press G and
 * you get G B D, a major chord, from the same rule. The quality is a CONSEQUENCE
 * of the key, so a beginner writes functional harmony without ever choosing
 * "major or minor", which is the choice they do not yet know how to make.
 *
 * An out-of-key root still gets a chord rather than an error: it borrows the
 * SHAPE of the key note below it and transposes that shape onto the pressed key.
 * So a C# in D minor comes back C# E# G# — a chromatic chord with the same
 * footprint as the C chord beside it, which is exactly what a borrowed chord is.
 * Nothing the player asked for is ever refused, and the result is predictable.
 */
export function diatonicChord(rootMidi: number, key: SongKey, degrees = DEFAULT_CHORD_DEGREES): number[] {
  if (degrees < 2) return [clampMidi(rootMidi)];
  let degree = degreeOf(rootMidi, key);
  let anchor = rootMidi;
  // An out-of-key root borrows the shape of the key note below it.
  for (let guard = 0; degree < 0 && guard < 12; guard += 1) {
    anchor -= 1;
    degree = degreeOf(anchor, key);
  }
  if (degree < 0) return [clampMidi(rootMidi)];
  const base = upToDegree(degree, key);
  const notes: number[] = [];
  for (let i = 0; i < degrees; i += 1) {
    const offset = upToDegree(degree + i * DEGREE_STEP, key) - base;
    notes.push(clampMidi(i === 0 ? rootMidi : rootMidi + offset));
  }
  return notes;
}

/** The chord on a scale degree, 1-based: degree 1 is the tonic chord. */
export function degreeChord(degree: number, key: SongKey, octave: number, degrees = DEFAULT_CHORD_DEGREES): number[] {
  const ladder = keyLadder(key, 14);
  const index = ((degree - 1) % ladder.length + ladder.length) % ladder.length;
  const rootMidi = (octave + 1) * 12 + ladder[index];
  return diatonicChord(rootMidi, key, degrees);
}

/**
 * The shortest name for a chord, for a label 45px wide: `Dm`, `C`, `G#o7`.
 *
 * Returns '' for anything that is not a chord, so a caller has one thing to
 * test rather than two.
 */
export function chordShortName(notes: readonly number[]): string {
  const quality = chordQualityOf(notes);
  if (quality === null) return '';
  const root = NOTE_NAMES[pitchClass(Math.min(...notes))];
  return `${root}${chordShape(quality).suffix}`;
}

/** A chord as notes and a name: `D F A  ·  D MINOR`. */
export function describeChord(notes: readonly number[]): string {
  const shown = [...notes].sort((a, b) => a - b);
  const notesText = shown.map(midiToNoteName).join(' ');
  const quality = chordQualityOf(shown);
  if (quality === null) return notesText;
  const root = NOTE_NAMES[pitchClass(shown[0])];
  return `${notesText}  \u00b7  ${root} ${chordShape(quality).label}`;
}

/** The name of a chord, without the notes: `D MINOR`, `F# 7`. */
export function chordName(notes: readonly number[]): string {
  const shown = [...notes].sort((a, b) => a - b);
  const quality = chordQualityOf(shown);
  if (quality === null) return '';
  return `${NOTE_NAMES[pitchClass(shown[0])]} ${chordShape(quality).label}`;
}

/**
 * Read a chord QUALITY from the words after a root: `m`, `min`, `minor`, `maj7`,
 * `7`, `dim`, `aug`, `dim7`, `m7`. Deliberately forgiving about case and the
 * separator, strict about which shape it means.
 */
export function chordQualityFromName(raw: string): ChordQuality | null {
  const text = raw.trim().replace(/[\s_-]+/g, '');
  // The one place case carries meaning, and it is checked BEFORE the switch
  // because a capital `M7` is the standard symbol for a MAJOR seventh (`CM7`)
  // while `m7` is the minor one (`Cm7`) — and the piano prints exactly this
  // symbol, so a reader can type back what they saw. Everywhere else the tail
  // stays case-insensitive, which is why lowercasing is still safe below.
  if (text === 'M7') return 'major-7';
  switch (text.toLowerCase()) {
    case '': case 'maj': case 'major': return 'major';
    case 'm': case 'min': case 'minor': return 'minor';
    case 'dim': case 'o': return 'diminished';
    case 'aug': case '+': return 'augmented';
    case '7': case 'dom7': case 'dominant7': return 'dominant-7';
    case 'maj7': case 'major7': case 'ma7': return 'major-7';
    case 'm7': case 'min7': case 'minor7': return 'minor-7';
    case 'dim7': case 'o7': return 'diminished-7';
    case 'm7b5': case 'min7b5': case 'halfdim7': case 'halfdim': case 'hdim7': return 'half-diminished-7';
    // The color shapes, spelled the way a chord chart spells them: `A5`, `Csus4`
    // (or a bare `sus`), `C6`, `Cadd9`, `C9`. A bare `sus` is the fourth — it is
    // the one that resolves down to the third, which is what makes it the
    // default reading of the word on its own.
    case '5': return 'power';
    case 'sus2': case 's2': return 'sus2';
    case 'sus4': case 'sus': case 's4': return 'sus4';
    case '6': case 'maj6': case 'add6': return 'sixth';
    case 'add9': case 'add2': return 'add9';
    case '9': case 'dom9': return 'ninth';
    default: return null;
  }
}

/** The spellings a chord quality may take, for an error message that lists them. */
export const CHORD_SPELLINGS = 'm (minor), dim, aug, 7, maj7, m7, dim7, m7b5, 5 (power), sus2, sus4, 6, add9 or 9';

export interface NamedChord {
  /** Pitch class of the root. */
  root: number;
  quality: ChordQuality;
}

/**
 * Read a chord name: `Dm`, `F#7`, `Bbdim`, `C maj7`.
 *
 * The root is read the way `parseKey` reads a tonic — a letter and an optional
 * accidental — because the two are the same act: naming a note. What follows is
 * the quality, and an unrecognised tail is a refusal, not a guess: a chord with
 * the wrong quality still SOUNDS like a chord, so nothing downstream would ever
 * reveal the mistake.
 */
export function parseChordName(raw: string): NamedChord | null {
  const text = raw.trim().replace(/\s+/g, '');
  if (text === '') return null;
  const match = /^([A-Ga-g])(#|b)?/.exec(text);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const accidental = match[2]?.toLowerCase() ?? '';
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  const root = pitchClass(NOTE_NAMES.indexOf(letter as (typeof NOTE_NAMES)[number]) + shift);
  const quality = chordQualityFromName(text.slice(match[0].length));
  if (quality === null) return null;
  return { root, quality };
}

/** True when text reads as a scale degree 1..7 — the other way to name a chord. */
export function parseDegree(text: string): number | null {
  if (!/^[1-7]$/.test(text.trim())) return null;
  return Number(text.trim());
}

// --- the arpeggio: a chord spread over time ---------------------------------

/**
 * The word that turns a chord into a run: `chord 0 1 Am arp up 8`.
 *
 * Exported so the parser and the error messages spell it once.
 */
export const ARP_WORD = 'arp';

/** Which way an arpeggio walks the chord's tones. */
export type ArpDirection = 'up' | 'down' | 'updown';

/** The three, in the order a menu would list them. */
export const ARP_DIRECTIONS: readonly ArpDirection[] = ['up', 'down', 'updown'];

/** What an `arp` asks for: a way to walk and how many steps to fill. */
export interface Arp {
  direction: ArpDirection;
  /** How many steps the run covers, 1..`MAX_ARP_STEPS`. */
  steps: number;
}

/**
 * The direction an arpeggio takes when the line does not say — the plain
 * `chord 0 1 Am arp` a beginner writes.
 */
export const DEFAULT_ARP_DIRECTION: ArpDirection = 'up';

/** How many steps one arpeggio may fill: the longest pattern the app has. */
export const MIN_ARP_STEPS = 1;
export const MAX_ARP_STEPS = MAX_ROWS;

/**
 * Every word that names a direction, the canonical one first.
 *
 * The aliases are here for the reason every other list in this app has them: a
 * person typing an arpeggio has typed `ascending` in a DAW before, and the words
 * a musician would reach for are the words this takes — so `arp ascending 8` is
 * the same line as `arp up 8`. A TABLE rather than a chain of comparisons, so the
 * capability manifest publishes exactly the words the parser accepts instead of
 * a second copy that can drift.
 */
export const ARP_ALIASES: Readonly<Record<ArpDirection, readonly string[]>> = {
  up: ['up', 'asc', 'ascending', 'upward'],
  down: ['down', 'desc', 'descending', 'downward'],
  updown: ['updown', 'upanddown', 'updownup', 'both'],
};

/**
 * Read a direction, or `null` when the word is not one.
 *
 * Spaces, hyphens, underscores and case are the parser's business rather than the
 * author's, the same bargain `parseChordName` makes with `C maj7`.
 */
export function arpDirectionFromName(raw: string): ArpDirection | null {
  const text = raw.trim().toLowerCase().replace(/[-_\s]/g, '');
  for (const direction of ARP_DIRECTIONS) {
    if (ARP_ALIASES[direction].includes(text)) return direction;
  }
  return null;
}

/**
 * The notes one arpeggio plays, in the order it plays them.
 *
 * The rule is the one every arpeggiator uses and the one an author can predict:
 * the chord's tones in order, then the same tones an octave up, then two — so an
 * eight-step run of a three-note chord is the chord twice and a bit, climbing.
 * A note that would leave the range `C0..B8` is clamped rather than dropped, for
 * the reason `writeNote` clamps: a note the grid cannot print is not a note.
 *
 * This is why the number of STEPS is the only number an `arp` takes: how many
 * octaves a run climbs is not a second decision, it is what happens when the
 * tones run out — and inventing an "octaves" knob would let an author write a
 * run that stops halfway up an octave and cannot say why.
 */
export function arpNotes(tones: readonly number[], arp: Arp): number[] {
  const count = Math.max(MIN_ARP_STEPS, Math.min(MAX_ARP_STEPS, Math.round(arp.steps)));
  const size = tones.length;
  if (size === 0) return [];
  const up: number[] = [];
  for (let i = 0; i < count; i += 1) {
    up.push(clampMidi(tones[i % size] + 12 * Math.floor(i / size)));
  }
  if (arp.direction === 'up') return up;
  // Down is the SAME run read backwards, which is what makes `arp down 6` start
  // on the note the up-run would have arrived at — a descent from the top rather
  // than a run that climbs and then pretends it did not.
  if (arp.direction === 'down') return [...up].reverse();
  // Up and down walks the tones up and back WITHOUT playing the turning point
  // twice (a three-note chord turns on `A C E C`, the shape every arpeggiator
  // draws), and the whole walk climbs an octave each time it comes round.
  const period = size > 1 ? 2 * size - 2 : 1;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = i % period;
    const index = at < size ? at : period - at;
    out.push(clampMidi(tones[index] + 12 * Math.floor(i / period)));
  }
  return out;
}

/**
 * The gestures the roadmap named that are NOT chord modifiers, each with what it
 * actually is.
 *
 * An author (or a model reading the plan) WILL write `chord 0 1 Am strum`, and
 * "...is not a chord" would be a true sentence about the wrong thing. Each reply
 * names the arithmetic the app already has, because three of these four are the
 * articulation primitive with a channel setting, and the fourth is waiting on a
 * range of steps the language has no clause for.
 */
export const CHORD_GESTURE_REPLIES: readonly { word: string; reply: string }[] = [
  {
    word: 'strum',
    reply: `a strum is "${ARP_WORD}" on a channel that HOLDS: give the channel "hold 4" and the run\u2019s notes ring over each other, which is what a hand does and milliseconds apart is what a grid cannot hold.`,
  },
  {
    word: 'roll',
    reply: 'a roll is a note\u2019s "*N" with the channel\u2019s "hold": "A-1*8" on a channel with "hold 4" is eight hits across four steps, evenly spaced.',
  },
  {
    word: 'flam',
    reply: 'a flam is a soft hit on the step before — "A-1~40" then "A-1" — or "*2" inside one step. Its grace note is a fraction of a step, which a grid of steps has no room for.',
  },
  {
    word: 'fill',
    reply: 'a fill needs a RANGE of steps to fill, and the language has no clause for one yet; write the hits with "*N" and "hold", or write the run out with "note".',
  },
];

/** The reply to a gesture word, or `null` when the word is something else. */
export function chordGestureReply(raw: string): string | null {
  const word = raw.trim().toLowerCase();
  return CHORD_GESTURE_REPLIES.find((entry) => entry.word === word)?.reply ?? null;
}
