import { describe, expect, it } from 'vitest';
import {
  CHORD_SHAPES,
  chordName,
  chordPitches,
  chordQualityFromName,
  chordQualityOf,
  chordShape,
  chordShortName,
  CHORD_SPELLINGS,
  DEFAULT_CHORD_DEGREES,
  degreeChord,
  describeChord,
  diatonicChord,
  keyLadder,
  parseChordName,
  parseDegree,
  TRIAD_SIZE,
  type ChordQuality,
} from '../model';
import type { SongKey } from '../model';

const C_MAJOR: SongKey = { tonic: 0, scale: 'major' };
const D_MINOR: SongKey = { tonic: 2, scale: 'minor' };
const A_MINOR: SongKey = { tonic: 9, scale: 'minor' };

describe('the chord shapes', () => {
  it('has a unique id per shape and starts every one on its root', () => {
    const ids = CHORD_SHAPES.map((shape) => shape.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const shape of CHORD_SHAPES) expect(shape.intervals[0]).toBe(0);
  });

  it('spells the four triads and the five sevenths', () => {
    expect(chordPitches(60, 'major')).toEqual([60, 64, 67]);
    expect(chordPitches(60, 'minor')).toEqual([60, 63, 67]);
    expect(chordPitches(60, 'diminished')).toEqual([60, 63, 66]);
    expect(chordPitches(60, 'augmented')).toEqual([60, 64, 68]);
    expect(chordPitches(60, 'dominant-7')).toEqual([60, 64, 67, 70]);
    expect(chordPitches(60, 'major-7')).toEqual([60, 64, 67, 71]);
    expect(chordPitches(60, 'minor-7')).toEqual([60, 63, 67, 70]);
    expect(chordPitches(60, 'diminished-7')).toEqual([60, 63, 66, 69]);
    expect(chordPitches(60, 'half-diminished-7')).toEqual([60, 63, 66, 70]);
  });

  it('spells the six COLOR shapes the genres reach for', () => {
    // A power chord is a root and a fifth and nothing else — the shape that makes
    // distortion read as a band rather than a fuzzbox.
    expect(chordPitches(60, 'power')).toEqual([60, 67]);
    expect(chordPitches(60, 'sus2')).toEqual([60, 62, 67]);
    expect(chordPitches(60, 'sus4')).toEqual([60, 65, 67]);
    expect(chordPitches(60, 'sixth')).toEqual([60, 64, 67, 69]);
    // The two that reach ABOVE the octave: a ninth is an interval, not a degree.
    expect(chordPitches(60, 'add9')).toEqual([60, 64, 67, 74]);
    expect(chordPitches(60, 'ninth')).toEqual([60, 64, 67, 70, 74]);
  });

  it('clamps notes to the range the grid can print', () => {
    // A seventh on B-8 would run past the top of the keyboard; a clamped chord
    // is a chord that still plays rather than a note that does not exist.
    const notes = chordPitches(119, 'dominant-7');
    expect(notes.every((note) => note <= 119)).toBe(true);
  });

  it('falls back to the first shape for an unknown id', () => {
    expect(chordShape('nope' as ChordQuality).id).toBe('major');
  });
});

describe('reading a quality back off the notes', () => {
  it('round-trips every shape', () => {
    for (const shape of CHORD_SHAPES) {
      expect(chordQualityOf(chordPitches(60, shape.id))).toBe(shape.id);
    }
  });

  it('does not depend on the notes being in order', () => {
    expect(chordQualityOf([67, 60, 64])).toBe('major');
    expect(chordQualityOf([63, 67, 60])).toBe('minor');
  });

  it('refuses a single note or something that is not a chord', () => {
    expect(chordQualityOf([60])).toBeNull();
    expect(chordQualityOf([])).toBeNull();
    expect(chordQualityOf([60, 62, 64])).toBeNull();
  });

  it('abbreviates every shape, and every abbreviation parses back', () => {
    // The piano prints these, so each one has to be a chord symbol a script
    // accepts: that round trip is the whole reason the shorthand is safe.
    for (const shape of CHORD_SHAPES) {
      expect(chordQualityFromName(shape.suffix)).toBe(shape.id);
    }
  });

  it('writes the short name the way a chord chart does', () => {
    expect(chordShortName([62, 65, 69])).toBe('Dm');
    expect(chordShortName([60, 64, 67])).toBe('C');
    expect(chordShortName([59, 62, 65])).toBe('Bo');
    expect(chordShortName([60, 64, 68])).toBe('C+');
    expect(chordShortName([60, 64, 67, 70])).toBe('C7');
    // A capital M is major and a small m is minor — the one case-sensitive tail,
    // and the distinction the piano is teaching.
    expect(chordShortName([60, 64, 67, 71])).toBe('CM7');
    expect(chordShortName([60, 63, 67, 70])).toBe('Cm7');
    expect(chordShortName([60, 63, 66, 69])).toBe('Co7');
    expect(chordShortName([59, 62, 65, 69])).toBe('Bm7b5');
    // The color shapes print the symbol a chart uses, so a guitarist can type
    // back what the piano showed them.
    expect(chordShortName([57, 64])).toBe('A5');
    expect(chordShortName([60, 65, 67])).toBe('Csus4');
    expect(chordShortName([60, 64, 67, 69])).toBe('C6');
    expect(chordShortName([60, 64, 67, 74])).toBe('Cadd9');
    expect(chordShortName([60, 64, 67, 70, 74])).toBe('C9');
  });

  it('has no short name for something that is not a chord', () => {
    expect(chordShortName([60])).toBe('');
    expect(chordShortName([60, 62, 64])).toBe('');
  });

  it('names a chord from its notes, root and all', () => {
    expect(chordName([62, 65, 69])).toBe('D MINOR');
    expect(chordName([60, 64, 67])).toBe('C MAJOR');
    expect(describeChord([62, 65, 69])).toBe('D-4 F-4 A-4  \u00b7  D MINOR');
  });
});

describe('the key ladder', () => {
  it('lists seven notes per octave, starting on the tonic', () => {
    const ladder = keyLadder(C_MAJOR, 14);
    expect(ladder.slice(0, 7)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(ladder[7]).toBe(12);
    expect(ladder[13]).toBe(23);
  });

  it('knows the five-note pentatonic is five notes tall under the octave', () => {
    const ladder = keyLadder({ tonic: 0, scale: 'pentatonic' }, 10);
    expect(ladder.slice(0, 5)).toEqual([0, 3, 5, 7, 10]);
    expect(ladder[5]).toBe(12);
  });
});

describe('a chord from the key', () => {
  it('stacks scale degrees, so the third is a minor third or a major one on its own', () => {
    // D F A: the third is three semitones, a TRIAD built from C major's D.
    expect(diatonicChord(62, C_MAJOR)).toEqual([62, 65, 69]);
    // G B D: the same rule, four semitones this time.
    expect(diatonicChord(67, C_MAJOR)).toEqual([67, 71, 74]);
    // B D F: diminished, again from the same rule.
    expect(diatonicChord(71, C_MAJOR)).toEqual([71, 74, 77]);
  });

  it('names every seventh a major scale produces, including the vii', () => {
    // The one chord a set of eight shapes would have missed: in C major the
    // seventh note gives B D F A, a half-diminished seventh — and a 7TH-mode
    // keyboard that could not name it would have a hole in it.
    const seventh = (root: number) => chordQualityOf(diatonicChord(root, C_MAJOR, 4));
    expect(seventh(60)).toBe('major-7');
    expect(seventh(62)).toBe('minor-7');
    expect(seventh(64)).toBe('minor-7');
    expect(seventh(65)).toBe('major-7');
    expect(seventh(67)).toBe('dominant-7');
    expect(seventh(69)).toBe('minor-7');
    expect(seventh(71)).toBe('half-diminished-7');
  });

  it('works in every scale, not just the major one', () => {
    // D minor's first chord is D F A, its fourth is G Bb D.
    expect(diatonicChord(62, D_MINOR)).toEqual([62, 65, 69]);
    expect(diatonicChord(67, D_MINOR)).toEqual([67, 70, 74]);
    // A minor: F A C is the sixth chord, and it comes back MAJOR.
    expect(chordQualityOf(diatonicChord(65, A_MINOR))).toBe('major');
    expect(chordQualityOf(diatonicChord(69, A_MINOR))).toBe('minor');
  });

  it('writes a triad by default and a seventh on request', () => {
    expect(diatonicChord(60, C_MAJOR)).toHaveLength(DEFAULT_CHORD_DEGREES);
    expect(diatonicChord(60, C_MAJOR, 4)).toEqual([60, 64, 67, 71]);
    expect(TRIAD_SIZE).toBe(3);
  });

  it('never refuses an out-of-key root, and keeps the shape predictable', () => {
    // C#4 in D minor is not in the key; it borrows the C chord's shape and is
    // transposed onto C#, giving a chromatic chord rather than nothing.
    const notes = diatonicChord(61, D_MINOR);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toBe(61);
    expect(notes[1] - notes[0]).toBe(4);
    expect(notes[2] - notes[0]).toBe(7);
  });

  it('builds the chord on a 1-based degree', () => {
    // Degree 1 in C major, octave 4, is the tonic triad.
    expect(degreeChord(1, C_MAJOR, 4)).toEqual([60, 64, 67]);
    // Degree 6 in D minor is Bb major: Bb D F.
    expect(degreeChord(6, D_MINOR, 4)).toEqual([70, 74, 77]);
  });

  it('lets a degree run past the seventh without falling off', () => {
    // Degree 8 is the tonic again, one octave up.
    expect(degreeChord(8, C_MAJOR, 4)).toEqual(degreeChord(1, C_MAJOR, 4).map((n) => n + 12));
    // Every degree a script can name (1..7) writes a full triad.
    for (let degree = 1; degree <= 7; degree += 1) {
      expect(degreeChord(degree, C_MAJOR, 4)).toHaveLength(TRIAD_SIZE);
    }
  });
});

describe('reading a chord name', () => {
  it('accepts the spellings people write', () => {
    expect(parseChordName('Dm')).toEqual({ root: 2, quality: 'minor' });
    expect(parseChordName('F#7')).toEqual({ root: 6, quality: 'dominant-7' });
    expect(parseChordName('Bbdim')).toEqual({ root: 10, quality: 'diminished' });
    expect(parseChordName('C maj7')).toEqual({ root: 0, quality: 'major-7' });
    expect(parseChordName('E')).toEqual({ root: 4, quality: 'major' });
  });

  it('refuses a name it cannot be sure of', () => {
    expect(parseChordName('Hm')).toBeNull();
    expect(parseChordName('Dmaj9')).toBeNull();
    expect(parseChordName('')).toBeNull();
    expect(parseChordName('7')).toBeNull();
  });

  it('reads the color shapes a chord chart writes', () => {
    expect(parseChordName('A5')).toEqual({ root: 9, quality: 'power' });
    expect(parseChordName('Csus4')).toEqual({ root: 0, quality: 'sus4' });
    expect(parseChordName('Csus')).toEqual({ root: 0, quality: 'sus4' });
    expect(parseChordName('Gsus2')).toEqual({ root: 7, quality: 'sus2' });
    expect(parseChordName('C6')).toEqual({ root: 0, quality: 'sixth' });
    expect(parseChordName('Cadd9')).toEqual({ root: 0, quality: 'add9' });
    expect(parseChordName('C9')).toEqual({ root: 0, quality: 'ninth' });
    // A bare number is still a DEGREE, not a chord: the two never collide
    // because a chord name always starts with a letter.
    expect(parseChordName('6')).toBeNull();
    expect(parseDegree('6')).toBe(6);
    expect(parseDegree('5')).toBe(5);
  });

  it('reads a quality tail leniently but strictly about the shape', () => {
    expect(chordQualityFromName('min')).toBe('minor');
    expect(chordQualityFromName('MINOR')).toBe('minor');
    expect(chordQualityFromName('maj7')).toBe('major-7');
    expect(chordQualityFromName('o7')).toBe('diminished-7');
    expect(chordQualityFromName('m7b5')).toBe('half-diminished-7');
    expect(chordQualityFromName('sus4')).toBe('sus4');
    expect(chordQualityFromName('sus9')).toBeNull();
    // The one tail where case means something: M7 is major, m7 is minor.
    expect(chordQualityFromName('M7')).toBe('major-7');
    expect(chordQualityFromName('m7')).toBe('minor-7');
    // Every spelling the error message advertises must actually work.
    expect(CHORD_SPELLINGS).toContain('m ');
    for (const suffix of ['5', 'sus2', 'sus4', '6', 'add9', '9']) {
      expect(CHORD_SPELLINGS, suffix).toContain(suffix);
      expect(chordQualityFromName(suffix), suffix).not.toBeNull();
    }
    expect(chordQualityFromName('m')).toBe('minor');
    expect(chordQualityFromName('dim')).toBe('diminished');
    expect(chordQualityFromName('aug')).toBe('augmented');
    expect(chordQualityFromName('7')).toBe('dominant-7');
    expect(chordQualityFromName('m7')).toBe('minor-7');
  });

  it('reads a bare scale degree 1..7', () => {
    expect(parseDegree('6')).toBe(6);
    expect(parseDegree(' 4 ')).toBe(4);
    expect(parseDegree('0')).toBeNull();
    expect(parseDegree('8')).toBeNull();
    expect(parseDegree('Am')).toBeNull();
  });
});
