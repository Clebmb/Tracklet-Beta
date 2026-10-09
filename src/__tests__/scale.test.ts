import { describe, expect, it } from 'vitest';

import {
  cycleScale,
  cycleTonic,
  DEFAULT_KEY,
  isInKey,
  keyName,
  keyPitches,
  parseKey,
  sameKey,
  scaleById,
  scaleFromName,
  SCALES,
  tonicName,
  type SongKey,
} from '../model';

/**
 * Keys and scales, tested as the two things they are: a set of notes, and a
 * piece of text somebody typed.
 *
 * The set half is where a wrong entry hides. A scale is seven numbers, and a
 * scale with one number wrong still produces a plausible-looking keyboard — so
 * every scale is checked against the intervals a musician would write down, not
 * against a snapshot of what this file happens to do today.
 *
 * The text half is where the app is generous, which is exactly why it needs
 * pinning down: `Dm`, `D minor` and `d MINOR` must all land on the same key, and
 * a scale Tracklet has never heard of must be refused rather than guessed, since
 * a wrong scale would paint confident wrong advice on the piano.
 */

const D_MINOR: SongKey = { tonic: 2, scale: 'minor' };

describe('the scales', () => {
  it('spells the intervals a musician would write', () => {
    expect(scaleById('major').steps).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(scaleById('minor').steps).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(scaleById('harmonic-minor').steps).toEqual([0, 2, 3, 5, 7, 8, 11]);
    expect(scaleById('dorian').steps).toEqual([0, 2, 3, 5, 7, 9, 10]);
    expect(scaleById('mixolydian').steps).toEqual([0, 2, 4, 5, 7, 9, 10]);
    expect(scaleById('phrygian').steps).toEqual([0, 1, 3, 5, 7, 8, 10]);
    expect(scaleById('blues').steps).toEqual([0, 3, 5, 6, 7, 10]);
    expect(scaleById('pentatonic').steps).toEqual([0, 3, 5, 7, 10]);
  });

  it('gives every scale a name the UI can print and a line a beginner can use', () => {
    for (const scale of SCALES) {
      expect(scale.label.length).toBeGreaterThan(2);
      expect(scale.blurb.length).toBeGreaterThan(20);
      // Every scale starts on its tonic and stays inside the octave.
      expect(scale.steps[0]).toBe(0);
      expect(Math.max(...scale.steps)).toBeLessThan(12);
    }
  });

  it('has a distinct id for each one', () => {
    expect(new Set(SCALES.map((s) => s.id)).size).toBe(SCALES.length);
  });

  it('reads a natural minor as the seven notes everyone knows it by', () => {
    expect([...keyPitches(D_MINOR)].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 10]);
  });
});

describe('being in a key', () => {
  it('counts by pitch class, so an octave does not matter', () => {
    for (const midi of [50, 62, 74, 86]) expect(isInKey(midi, D_MINOR)).toBe(true);
    // B is not in D minor at any octave; Bb is, at every octave.
    for (const midi of [59, 71, 83]) expect(isInKey(midi, D_MINOR)).toBe(false);
    for (const midi of [58, 70, 82]) expect(isInKey(midi, D_MINOR)).toBe(true);
  });

  it('holds exactly seven notes for the seven-note scales', () => {
    expect(keyPitches({ tonic: 0, scale: 'major' }).size).toBe(7);
    expect(keyPitches({ tonic: 3, scale: 'harmonic-minor' }).size).toBe(7);
    expect(keyPitches({ tonic: 10, scale: 'dorian' }).size).toBe(7);
  });

  it('holds five for the pentatonic, which is the whole point of it', () => {
    const pentatonic = keyPitches({ tonic: 9, scale: 'pentatonic' });
    expect(pentatonic.size).toBe(5);
    // A minor pentatonic is the five notes a rock solo lives on.
    expect([...pentatonic].sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9]);
  });

  it('holds six for the blues, which is the pentatonic plus one passing note', () => {
    // The flat fifth a solo leans on: A blues is A minor pentatonic plus Eb, and
    // the point of the scale is that the extra note is IN the key rather than
    // painted as a mistake.
    const blues = keyPitches({ tonic: 9, scale: 'blues' });
    expect(blues.size).toBe(6);
    expect([...blues].sort((a, b) => a - b)).toEqual([0, 2, 3, 4, 7, 9]);
  });

  it('makes a flat second and a flat seventh real notes in the key', () => {
    // The two alterations the genres hang on: E phrygian HAS F natural, and G
    // mixolydian HAS F natural where G major would have F#.
    expect(isInKey(53, { tonic: 4, scale: 'phrygian' })).toBe(true);  // F in E phrygian
    expect(isInKey(54, { tonic: 4, scale: 'phrygian' })).toBe(false); // F# is not
    expect(isInKey(53, { tonic: 7, scale: 'mixolydian' })).toBe(true);  // F in G mixolydian
    expect(isInKey(54, { tonic: 7, scale: 'mixolydian' })).toBe(false); // F# is not
  });

  it('names the notes of a sharp key by their pitch class, not their spelling', () => {
    // F# major contains the same pitches as Gb major; the app prints sharps.
    expect(isInKey(66, { tonic: 6, scale: 'major' })).toBe(true); // F#
    expect(isInKey(67, { tonic: 6, scale: 'major' })).toBe(false); // G
  });
});

describe('naming a key', () => {
  it('prints the title case a musician says out loud', () => {
    expect(keyName(D_MINOR)).toBe('D MINOR');
    expect(keyName({ tonic: 6, scale: 'major' })).toBe('F# MAJOR');
    expect(keyName({ tonic: 3, scale: 'harmonic-minor' })).toBe('D# HARMONIC MINOR');
    expect(keyName(DEFAULT_KEY)).toBe('C MAJOR');
  });

  it('prints a tonic for every one of the twelve', () => {
    const names = Array.from({ length: 12 }, (_, pc) => tonicName(pc));
    expect(new Set(names).size).toBe(12);
    expect(names[0]).toBe('C');
    expect(tonicName(12)).toBe('C');
    expect(tonicName(-1)).toBe('B');
  });
});

describe('reading a key out of text', () => {
  it('takes the two spellings of every scale', () => {
    const expected: [string, SongKey][] = [
      ['D minor', D_MINOR],
      ['Dm', D_MINOR],
      ['DMIN', D_MINOR],
      ['d minor', D_MINOR],
      ['D', { tonic: 2, scale: 'major' }],
      ['D major', { tonic: 2, scale: 'major' }],
      ['Dmaj', { tonic: 2, scale: 'major' }],
      ['F# major', { tonic: 6, scale: 'major' }],
      ['C# minor', { tonic: 1, scale: 'minor' }],
      ['Bb dorian', { tonic: 10, scale: 'dorian' }],
      ['Eb harmonic minor', { tonic: 3, scale: 'harmonic-minor' }],
      ['A harmonicminor', { tonic: 9, scale: 'harmonic-minor' }],
      ['D mixolydian', { tonic: 2, scale: 'mixolydian' }],
      ['g mixo', { tonic: 7, scale: 'mixolydian' }],
      ['E phrygian', { tonic: 4, scale: 'phrygian' }],
      ['A blues', { tonic: 9, scale: 'blues' }],
      ['C pentatonic', { tonic: 0, scale: 'pentatonic' }],
      ['g penta', { tonic: 7, scale: 'pentatonic' }],
    ];
    for (const [text, key] of expected) {
      expect(parseKey(text), text).toEqual(key);
    }
  });

  it('reads a flat by its position, not by a table of spellings', () => {
    // `BB` is B-flat: the second B is an accidental, never a note name.
    expect(parseKey('Bb')?.tonic).toBe(10);
    expect(parseKey('B')?.tonic).toBe(11);
    expect(parseKey('Cb')?.tonic).toBe(11);
    expect(parseKey('B#')?.tonic).toBe(0);
    expect(parseKey('Bb')?.scale).toBe('major');
  });

  it('refuses anything it cannot name, rather than guessing', () => {
    for (const bad of ['', '   ', 'lydian', 'D lydian', 'D locrian', 'minor', 'H major', 'D4', 'D-4', '1 minor', 'D minor major']) {
      expect(parseKey(bad), bad).toBeNull();
    }
  });

  it('reads a bare note with no octave as a key, and refuses one with', () => {
    expect(parseKey('D')).toEqual({ tonic: 2, scale: 'major' });
    expect(parseKey('D4')).toBeNull();
  });

  it('reads a scale on its own for the error messages', () => {
    expect(scaleFromName('Harmonic Minor')).toBe('harmonic-minor');
    expect(scaleFromName('harmonic-minor')).toBe('harmonic-minor');
    expect(scaleFromName(' m ')).toBe('minor');
    expect(scaleFromName('lydian')).toBeNull();
  });
});

describe('moving through the options', () => {
  it('steps the tonic around the twelve, wrapping both ways', () => {
    expect(cycleTonic(0, 1)).toBe(1);
    expect(cycleTonic(11, 1)).toBe(0);
    expect(cycleTonic(0, -1)).toBe(11);
    expect(cycleTonic(2, 12)).toBe(2);
  });

  it('cycles the scales in their listed order, wrapping both ways', () => {
    expect(cycleScale('major', 1)).toBe('minor');
    expect(cycleScale('pentatonic', 1)).toBe('major');
    expect(cycleScale('major', -1)).toBe('pentatonic');
  });

  it('knows when two keys are the same one', () => {
    expect(sameKey(D_MINOR, { tonic: 2, scale: 'minor' })).toBe(true);
    expect(sameKey(D_MINOR, { tonic: 2, scale: 'major' })).toBe(false);
    expect(sameKey(D_MINOR, { tonic: 14, scale: 'minor' })).toBe(false);
  });
});
