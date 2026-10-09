/**
 * scale — the key a song is in, as plain data.
 *
 * Tracklet's promise is that someone who has never used a tracker can make
 * something that sounds good, AND that someone who knows music theory is not
 * patronised. A key is the one piece of theory that serves both at once:
 *
 *   • A beginner gets a map. The piano lights the notes that fit the key, the
 *     grid dims the notes that do not, and nothing has to be explained.
 *   • A theorist gets to say what they mean. `key D harmonic minor` is the same
 *     idea as a DAW's scale setting, and the app stops guessing.
 *
 * ── What a key is NOT here ───────────────────────────────────────────────────
 * It is not a constraint. Nothing is locked, snapped or refused: every note is
 * still writable, and the scale only changes how the app PAINTS what you wrote.
 * A tracker that refuses a chromatic passing tone is a tracker that cannot
 * express half of the music people love — and the ten notes that sound wrong out
 * of context are exactly the ones a chorus turns over.
 *
 * It is not part of playback either. The audio engine never asks; a key only
 * answers "which notes go together", which is a question about the writing, not
 * the sound.
 *
 * Phaser-free on purpose, like the rest of `model/`.
 */

import { NOTE_NAMES } from './notes';

/** The twelve tonics, as pitch classes: 0 = C, 1 = C#/Db, ... 11 = B. */
export const TONIC_NAMES = NOTE_NAMES;

export type ScaleId = 'major' | 'minor' | 'harmonic-minor' | 'dorian' | 'mixolydian' | 'phrygian' | 'blues' | 'pentatonic';

export interface Scale {
  id: ScaleId;
  /** What the app prints, e.g. `HARMONIC MINOR`. */
  label: string;
  /** Semitones above the tonic, ascending, all below 12. */
  steps: readonly number[];
  /** One line for a beginner, shown when the scale is chosen. */
  blurb: string;
}

/**
 * The eight scales, in the order the KEY control cycles them: most common first,
 * so the two a beginner needs are one press away from each other.
 *
 * Eight is a deliberate ceiling, and the three in the middle of the list are
 * there for a reason that is not theory — they are the scales a GENRE needs and
 * the app could not name:
 *
 *   • `mixolydian` is major with a flat seventh. It is the sound of a dominant
 *     chord that never resolves, which is most of blues-rock, funk, jam bands
 *     and the Mixolydian end of shoegaze.
 *   • `phrygian` is minor with a flat SECOND, and that one semitone is the whole
 *     of flamenco, metal and the darker end of emo — a scale this app simply
 *     could not write a riff in.
 *   • `blues` is the minor pentatonic plus the flat fifth. It is the passing
 *     note every blues and rock solo leans on, and its absence is why a
 *     `pentatonic` key used to make every attempt at a rock lead look wrong.
 *
 * The four that were here first keep their positions and their meanings, and
 * `pentatonic` stays last so the cycle a player has learned still ends where it
 * did.
 */
export const SCALES: readonly Scale[] = [
  {
    id: 'major',
    label: 'MAJOR',
    steps: [0, 2, 4, 5, 7, 9, 11],
    blurb: 'the do-re-mi scale: bright, and the sound of most pop',
  },
  {
    id: 'minor',
    label: 'MINOR',
    steps: [0, 2, 3, 5, 7, 8, 10],
    blurb: 'the sad one, and the safest default for rock, lo-fi and emo',
  },
  {
    id: 'harmonic-minor',
    label: 'HARMONIC MINOR',
    steps: [0, 2, 3, 5, 7, 8, 11],
    blurb: 'minor with a raised 7th: dramatic, and the Castlevania sound',
  },
  {
    id: 'dorian',
    label: 'DORIAN',
    steps: [0, 2, 3, 5, 7, 9, 10],
    blurb: 'minor with a bright 6th: hopeful-sad, jazzy, Dorian Gray',
  },
  {
    id: 'mixolydian',
    label: 'MIXOLYDIAN',
    steps: [0, 2, 4, 5, 7, 9, 10],
    blurb: 'major with a flat 7th: the dominant chord that never resolves — blues-rock, funk, jam bands',
  },
  {
    id: 'phrygian',
    label: 'PHRYGIAN',
    steps: [0, 1, 3, 5, 7, 8, 10],
    blurb: 'minor with a flat 2nd: one semitone of menace — flamenco, metal, the dark end of emo',
  },
  {
    id: 'blues',
    label: 'BLUES',
    steps: [0, 3, 5, 6, 7, 10],
    blurb: 'the minor pentatonic plus the flat 5th: the passing note a rock or blues solo leans on',
  },
  {
    id: 'pentatonic',
    label: 'PENTATONIC',
    steps: [0, 3, 5, 7, 10],
    blurb: 'five notes that agree with each other: hard to play a wrong one',
  },
];

/** The key a song is in: a tonic pitch class and a scale. */
export interface SongKey {
  /** Pitch class, 0..11 (0 = C). An octave is not part of a key. */
  tonic: number;
  scale: ScaleId;
}

/** C major: the key with no black notes, so it is the one that explains itself. */
export const DEFAULT_KEY: SongKey = { tonic: 0, scale: 'major' };

/** Wrap any integer into 0..11. */
function pitchClass(n: number): number {
  return ((Math.round(n) % 12) + 12) % 12;
}

export function scaleById(id: ScaleId): Scale {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

export function sameKey(a: SongKey, b: SongKey): boolean {
  return a.tonic === b.tonic && a.scale === b.scale;
}

export function copyKey(key: SongKey): SongKey {
  return { tonic: pitchClass(key.tonic), scale: key.scale };
}

/** The tonic as it is printed on its own, e.g. `C#`. */
export function tonicName(tonic: number): string {
  return TONIC_NAMES[pitchClass(tonic)];
}

/**
 * The whole key as one label, e.g. `D MINOR`.
 *
 * Named `keyName` rather than `keyLabel` on purpose: `notes.ts` already has a
 * `keyLabel` and it means the computer key that plays a note (`Z`, `Q`, ...).
 * Two different keys in one app is enough; two functions with the same name
 * would not be.
 */
export function keyName(key: SongKey): string {
  return `${tonicName(key.tonic)} ${scaleById(key.scale).label}`;
}

/** The pitch classes a key contains, as a set for fast membership tests. */
export function keyPitches(key: SongKey): ReadonlySet<number> {
  const scale = scaleById(key.scale);
  return new Set(scale.steps.map((step) => pitchClass(key.tonic + step)));
}

/**
 * True when a MIDI note belongs to the key.
 *
 * Octave is irrelevant — a key is a set of pitch classes, so C-2 and C-7 are the
 * same scale degree. That is the whole reason this is a pitch-class test and not
 * an interval test.
 */
export function isInKey(midi: number, key: SongKey): boolean {
  return keyPitches(key).has(pitchClass(midi));
}

/** The next tonic a press of `<` or `>` gives: always 0..11, always sensible. */
export function cycleTonic(tonic: number, delta: number): number {
  return pitchClass(tonic + delta);
}

/** The next scale in the list, wrapping at both ends. */
export function cycleScale(id: ScaleId, delta: number): ScaleId {
  const index = Math.max(0, SCALES.findIndex((s) => s.id === id));
  const next = ((index + delta) % SCALES.length + SCALES.length) % SCALES.length;
  return SCALES[next].id;
}

/**
 * Read a scale from the words a person (or a model) writes.
 *
 * Deliberately forgiving about spelling and strict about meaning: `min`, `minor`
 * and a bare `m` all mean the same thing, but a scale this build has never heard
 * of is refused rather than guessed at, because a wrong scale is invisible — the
 * app would paint confident, wrong advice on the piano.
 */
export function scaleFromName(raw: string): ScaleId | null {
  const text = raw.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  switch (text) {
    case 'major': case 'maj': return 'major';
    case 'minor': case 'min': case 'm': return 'minor';
    case 'harmonic minor': case 'harmonicminor': case 'harmonic min': case 'harmonic': return 'harmonic-minor';
    case 'dorian': case 'dor': return 'dorian';
    case 'mixolydian': case 'mixo': case 'mixolydian major': return 'mixolydian';
    case 'phrygian': case 'phryg': return 'phrygian';
    case 'blues': case 'blues scale': case 'blues minor': return 'blues';
    case 'pentatonic': case 'pentatonic minor': case 'penta': case 'pent': return 'pentatonic';
    default: return null;
  }
}

/** The scales a script may name, for an error message that lists the options. */
export const SCALE_SPELLINGS = 'major, minor, harmonic minor, dorian, mixolydian, phrygian, blues or pentatonic';

const LETTER_PITCH: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Read a whole key from one line of text: `D minor`, `Dm`, `F# major`,
 * `E flat dorian`, `A harmonic minor`, or just `C` for C major.
 *
 * Two jobs in one function because the two spellings share one rule: the first
 * letter is the tonic, and whatever is left names the scale. `Dm` is `D` + `m`,
 * and `D minor` is `D` + `minor`, so both are read by the same code and neither
 * can drift from the other.
 *
 * Returns null when either half is unrecognisable — the caller decides how to
 * say so, because a script and a file want different error wording.
 */
export function parseKey(raw: string): SongKey | null {
  const text = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (text === '') return null;
  const match = /^([A-G])(#|B)?/.exec(text);
  if (!match) return null;
  const [, letter, accidental] = match;
  // `B` after a letter is a flat here, never a note: `EB` is E-flat, and the
  // only place a B is a B is the first character of the line.
  const shift = accidental === '#' ? 1 : accidental === 'B' ? -1 : 0;
  const tonic = pitchClass(LETTER_PITCH[letter] + shift);
  const rest = text.slice(match[0].length).trim();
  const scale = rest === '' ? 'major' : scaleFromName(rest);
  if (scale === null) return null;
  return { tonic, scale };
}
