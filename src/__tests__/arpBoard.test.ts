/**
 * The ARP page's pure arithmetic: the five dials, how one moves, and the run the
 * preview draws.
 *
 * The page cannot make a setting the script or the file would refuse — every
 * nudge goes through the model's own `clampArp` — and the preview is not this
 * page's own idea of an arpeggio: `arpPreview` calls `generateArp`, so the run
 * drawn is the run `arp write` commits and `chord … arp` writes.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_ARP, generateArp, type ArpSettings } from '../model';
import {
  ARP_DIALS,
  ARP_DIAL_LABELS,
  ARP_HINT,
  arpPreview,
  cycleDial,
  dialIsNumber,
  dialRange,
  dialText,
  moveDial,
} from '../ui/arpBoard';

const SAMPLE: ArpSettings = { direction: 'updown', octaves: 3, rate: 2, gate: 60, mode: 'source' };

describe('the five dials', () => {
  it('are listed in one order, with a label each', () => {
    expect([...ARP_DIALS]).toEqual(['direction', 'octaves', 'rate', 'gate', 'mode']);
    // Two of the five name their UNIT, because both words are ambiguous in this
    // app: rate is steps PER NOTE, and the gate is the cell's VELOCITY.
    expect(ARP_DIALS.map((dial) => ARP_DIAL_LABELS[dial])).toEqual([
      'DIRECTION',
      'OCTAVES',
      'RATE (STEPS PER NOTE)',
      'INTENSITY (GATE)',
      'SOURCE MODE',
    ]);
    expect(ARP_DIAL_LABELS.rate).toContain('STEPS PER NOTE');
    expect(ARP_DIAL_LABELS.gate).toContain('INTENSITY');
  });

  it('print as words, numbers and a percentage', () => {
    expect(dialText(SAMPLE, 'direction')).toBe('UPDOWN');
    expect(dialText(SAMPLE, 'mode')).toBe('SOURCE');
    expect(dialText(SAMPLE, 'octaves')).toBe('3');
    expect(dialText(SAMPLE, 'rate')).toBe('2');
    expect(dialText(SAMPLE, 'gate')).toBe('60%');
  });

  it('know which are numbers', () => {
    expect(ARP_DIALS.filter(dialIsNumber)).toEqual(['octaves', 'rate', 'gate']);
  });

  it('publish their ranges', () => {
    expect(dialRange('octaves')).toBe('1..4');
    expect(dialRange('rate')).toBe('1..4');
    expect(dialRange('gate')).toBe('0..100');
    expect(dialRange('direction')).toBe('');
  });
});

describe('moving and nudging a dial', () => {
  it('walks the dial column and wraps at both ends', () => {
    expect(moveDial('direction', 1)).toBe('octaves');
    expect(moveDial('direction', -1)).toBe('mode');
    expect(moveDial('mode', 1)).toBe('direction');
  });

  it('cycles the two word dials through their own lists', () => {
    expect(cycleDial(DEFAULT_ARP, 'direction', 1).direction).toBe('down');
    expect(cycleDial({ ...DEFAULT_ARP, direction: 'updown' }, 'direction', 1).direction).toBe('up');
    expect(cycleDial(DEFAULT_ARP, 'mode', 1).mode).toBe('source');
    expect(cycleDial({ ...DEFAULT_ARP, mode: 'source' }, 'mode', 1).mode).toBe('chord');
  });

  it('clamps the three number dials through the model, so a page cannot lie', () => {
    expect(cycleDial({ ...DEFAULT_ARP, octaves: 4 }, 'octaves', 1).octaves).toBe(4);
    expect(cycleDial({ ...DEFAULT_ARP, octaves: 1 }, 'octaves', -1).octaves).toBe(1);
    expect(cycleDial({ ...DEFAULT_ARP, rate: 4 }, 'rate', 1).rate).toBe(4);
    expect(cycleDial({ ...DEFAULT_ARP, gate: 100 }, 'gate', 1).gate).toBe(100);
    expect(cycleDial({ ...DEFAULT_ARP, gate: 0 }, 'gate', -1).gate).toBe(0);
    // A gate nudges by five, so two presses of `]` take 90 to 100.
    expect(cycleDial({ ...DEFAULT_ARP, gate: 90 }, 'gate', 1).gate).toBe(95);
    expect(cycleDial({ ...DEFAULT_ARP, gate: 95 }, 'gate', 1).gate).toBe(100);
  });

  it('nudges up and back to the same place', () => {
    expect(cycleDial(cycleDial(SAMPLE, 'octaves', 1), 'octaves', -1)).toEqual(SAMPLE);
  });
});

describe('the preview is the run a write would commit', () => {
  const AM = [69, 72, 76];

  it('is exactly `generateArp` with the room the pattern has', () => {
    expect(arpPreview(AM, DEFAULT_ARP, 0, 16))
      .toEqual(generateArp(AM, 0, DEFAULT_ARP, 16));
  });

  it('stops at the pattern edge, so the page cannot promise more than a write does', () => {
    // Two steps of room from row 14 in a 16-step pattern.
    const steps = arpPreview(AM, DEFAULT_ARP, 14, 2);
    expect(steps.map((step) => step.step)).toEqual([14, 15]);
    expect(steps.map((step) => step.note)).toEqual([69, 72]);
  });

  it('spaces notes out by `rate` and carries `gate` as velocity', () => {
    const steps = arpPreview(AM, { ...DEFAULT_ARP, rate: 2, gate: 40 }, 0, 12);
    expect(steps.map((step) => step.step)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(steps.every((step) => step.velocity === 40)).toBe(true);
  });

  it('is empty without a chord, so an empty cell previews nothing', () => {
    expect(arpPreview([], DEFAULT_ARP, 0, 16)).toEqual([]);
  });
});

describe('the page hint names every key it uses', () => {
  it('spells the four keys the page answers to', () => {
    for (const word of ['ARROWS', 'ENTER', 'W WRITE', 'ESC']) {
      expect(ARP_HINT).toContain(word);
    }
  });
});
