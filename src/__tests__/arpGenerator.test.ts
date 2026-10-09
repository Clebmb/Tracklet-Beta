import { describe, expect, it } from 'vitest';

import {
  applyScript,
  arpLabel,
  arpNoteCount,
  arpNotes,
  baseMidiForOctave,
  chordPitches,
  clampArp,
  createSong,
  DEFAULT_ARP,
  DEFAULT_VELOCITY,
  generateArp,
  MAX_ARP_OCTAVES,
  MAX_ARP_RATE,
  type ArpSettings,
} from '../model';

/**
 * The ARP page's generator — the one walk the page's preview and the script's
 * `chord … arp` both use.
 *
 * The claim this file holds to is the roadmap's: `generateArp` is not a second
 * arpeggiator. For the same chord and direction it must produce exactly the cells
 * `chord 0 1 Am arp up 8` writes, so a preview cannot promise a run a write does
 * not produce.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(result.errors.map((e) => `line ${e.line}: ${e.message}`).join(' / '));
  return result.song;
}

/** The note each row wrote on channel 1, row by row, for `rows` steps. */
function runNotes(source: string, rows: number): (number | null)[] {
  const song = applied(source);
  return Array.from({ length: rows }, (_one, row) => song.patterns[0].steps[row]?.[0]?.note ?? null);
}

/** An A minor triad at octave 4 — what `chord 0 1 Am` resolves to. */
const AM = chordPitches(baseMidiForOctave(4) + 9, 'minor');

function settings(over: Partial<ArpSettings> = {}): ArpSettings {
  // Three octaves and a full gate, so the ONLY thing that varies is the direction.
  return clampArp({ ...DEFAULT_ARP, octaves: 3, rate: 1, gate: 100, ...over });
}

const SCRIPT = (direction: string) =>
  `steps 16\noctave 4\ntracks 1\ntrack 1 "ARP" voice pluck\npattern 1 "A"\nchord 0 1 Am arp ${direction} 8\n`;

describe('generateArp is the run `chord … arp` writes', () => {
  for (const direction of ['up', 'down', 'updown'] as const) {
    it(`matches the modifier for arp ${direction} 8`, () => {
      const script = runNotes(SCRIPT(direction), 8);
      const mine = generateArp(AM, 0, settings({ direction }), 8).map((step) => step.note);
      expect(mine).toEqual(script);
      // And the run is the modifier's own `arpNotes`, by construction.
      expect(mine).toEqual(arpNotes(AM, { direction, steps: 8 }));
    });
  }

  it('places every note on the row the modifier wrote it', () => {
    const notes = generateArp(AM, 0, settings({ direction: 'up' }), 8);
    expect(notes.map((step) => step.step)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('starts at the row it is given, not at zero', () => {
    const notes = generateArp(AM, 4, settings({ direction: 'up' }), 8);
    expect(notes.map((step) => step.step)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(notes[0]?.note).toBe(AM[0]);
  });
});

describe('the three dials beyond the modifier', () => {
  it('climbs only as many octaves as it is told', () => {
    // A triad over one octave is three notes; over three it is nine, capped by
    // whatever room it has.
    expect(arpNoteCount(AM, clampArp({ octaves: 1 }), 32)).toBe(3);
    expect(arpNoteCount(AM, clampArp({ octaves: 3 }), 32)).toBe(9);
    expect(generateArp(AM, 0, settings({ octaves: 1 }), 32)).toHaveLength(3);
  });

  it('places one note every `rate` steps', () => {
    const notes = generateArp(AM, 0, settings({ rate: 2 }), 8);
    expect(notes.map((step) => step.step)).toEqual([0, 2, 4, 6]);
    // Four notes fit in eight steps at rate 2 (rows 0,2,4,6), and the octaves cap
    // does not bite first.
    expect(arpNoteCount(AM, clampArp({ rate: 2 }), 8)).toBe(4);
  });

  it('writes the gate as the cell\'s velocity, full at 100', () => {
    expect(generateArp(AM, 0, settings(), 8)[0]?.velocity).toBe(DEFAULT_VELOCITY);
    const soft = generateArp(AM, 0, settings({ gate: 40 }), 8);
    expect(soft.every((step) => step.velocity === 40)).toBe(true);
    // At the default gate the cells are exactly what a plain run writes.
    expect(generateArp(AM, 0, settings(), 8).map((step) => step.note))
      .toEqual(runNotes(SCRIPT('up'), 8));
  });

  it('returns nothing when there is no chord or no room', () => {
    expect(generateArp([], 0, settings(), 8)).toEqual([]);
    expect(generateArp(AM, 0, settings(), 0)).toEqual([]);
    expect(arpNoteCount([], settings(), 8)).toBe(0);
  });
});

describe('clampArp', () => {
  it('clamps the numbers into their ranges and defaults the rest', () => {
    const clamped = clampArp({ octaves: 9, rate: 0, gate: 400 });
    expect(clamped.octaves).toBe(MAX_ARP_OCTAVES);
    expect(clamped.rate).toBe(1);
    expect(clamped.gate).toBe(100);
    expect(clampArp({ rate: 99 }).rate).toBe(MAX_ARP_RATE);
    expect(clampArp({ octaves: -3 }).octaves).toBe(1);
    expect(clampArp({ gate: -5 }).gate).toBe(0);
  });

  it('defaults a word it was never taught rather than throwing', () => {
    const clamped = clampArp({ direction: 'sideways' as never, mode: 'nonsense' as never });
    expect(clamped.direction).toBe(DEFAULT_ARP.direction);
    expect(clamped.mode).toBe(DEFAULT_ARP.mode);
  });

  it('keeps the values it is given when they are in range', () => {
    const chosen = clampArp({ direction: 'updown', octaves: 4, rate: 3, gate: 55, mode: 'source' });
    expect(chosen).toEqual({ direction: 'updown', octaves: 4, rate: 3, gate: 55, mode: 'source' });
  });
});

describe('the dials as a line', () => {
  it('names every dial, so a status strip and a test read the same string', () => {
    const label = arpLabel(clampArp({ direction: 'updown', octaves: 2, rate: 2, gate: 60, mode: 'source' }));
    expect(label).toBe('UPDOWN  \u00b7  2 OCT  \u00b7  RATE 2  \u00b7  GATE 60  \u00b7  SOURCE');
  });
});
