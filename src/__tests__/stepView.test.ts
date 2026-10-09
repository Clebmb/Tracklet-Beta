import { describe, expect, it } from 'vitest';

import {
  cellText,
  clampVelocity,
  DRUMS,
  emptyCell,
  emptyPattern,
  MAX_VELOCITY,
  setCellDrum,
  setCellNotes,
  writeDrum,
  writeNote,
  type Cell,
  type DrumId,
} from '../model';
import {
  DRUM_LANES,
  EMPTY_ALPHA,
  EMPTY_STEP_TEXT,
  HIT_CHAR,
  cellAlpha,
  drumCellAlpha,
  drumCellLit,
  drumCellText,
  hitText,
  laneDrum,
  laneIndex,
  laneLabels,
} from '../ui/stepView';
import { SLIDE_CHAR, STUTTER_CHAR } from '../model/articulation';

/**
 * THE DRUM VIEW — the second way of looking at the same steps.
 *
 * `F8` turns the pattern panel into a LANE per drum of the kit on the cursor's
 * channel. Nothing about the song changes when it does, which is the whole reason
 * this file can exist as arithmetic rather than as a screenshot: what a lane cell
 * says is a pure function of the cell, the lane, and the model's own rules. What
 * is checked here is that those three agree — that a hit lands on exactly one
 * lane, that the other three say what an empty step says, that a melodic note on
 * a kit channel is spelled the same everywhere rather than being filed under a
 * drum it has nothing to do with, and that the gesture that writes a hit
 * (`writeDrum`, what a click on a lane does) obeys the same one-thing-per-cell
 * invariant the rest of the model keeps.
 */

/** A step that is a drum hit, at full force unless told otherwise. */
function hit(drum: DrumId, velocity = MAX_VELOCITY): Cell {
  const cell = emptyCell();
  setCellDrum(cell, drum);
  cell.velocity = velocity;
  return cell;
}

/** A step that is a plain note, at full force unless told otherwise. */
function note(midi: number, velocity = MAX_VELOCITY): Cell {
  const cell = emptyCell();
  setCellNotes(cell, [midi]);
  cell.velocity = velocity;
  return cell;
}

describe('the drum lanes', () => {
  it('is the kit itself, in its own order, so the two cannot drift apart', () => {
    expect(DRUM_LANES).toEqual(DRUMS);
    expect(laneLabels()).toEqual(DRUMS.map((drum) => drum.short));
    expect(laneLabels()).toEqual(['KCK', 'SNR', 'HAT', 'WND']);
  });

  it('round trips a lane and a drum, in both directions', () => {
    for (const drum of DRUMS) {
      expect(laneDrum(laneIndex(drum.id))).toBe(drum.id);
      expect(laneIndex(laneDrum(laneIndex(drum.id)))).toBe(laneIndex(drum.id));
    }
  });

  it('answers -1 and null for a step with no drum, and for a lane that does not exist', () => {
    expect(laneIndex(null)).toBe(-1);
    expect(laneDrum(-1)).toBeNull();
    expect(laneDrum(DRUM_LANES.length)).toBeNull();
  });
});

describe('what a hit says in its lane', () => {
  it('is the mark every drum machine uses, and nothing else at full force', () => {
    expect(HIT_CHAR).toBe('x');
    expect(hitText(hit('kick'))).toBe('x');
  });

  it('spells its gesture and its force in the order a note spells them', () => {
    const cell = hit('hat', 40);
    expect(hitText(cell)).toBe('x~40');
    cell.slide = true;
    expect(hitText(cell)).toBe(`x${SLIDE_CHAR}~40`);
    cell.stutter = 3;
    expect(hitText(cell)).toBe(`x${SLIDE_CHAR}${STUTTER_CHAR}3~40`);
    // The same order a note uses, character for character, so a person who has
    // read one cell has read both: `C-4>*3~40` is spelled by these two rules.
    expect(SLIDE_CHAR + STUTTER_CHAR).toBe('>*');
  });

  it('says nothing about force at full, so a plain beat stays three characters', () => {
    for (const drum of DRUMS) expect(hitText(hit(drum.id))).toBe('x');
  });

  it('reads a velocity the way the model would clamp it', () => {
    const cell = hit('snare', 999);
    expect(hitText(cell)).toBe('x');
    cell.velocity = -5;
    expect(hitText(cell)).toBe(`x~${clampVelocity(-5)}`);
  });
});

describe('one row of the drum view', () => {
  it('puts a hit on its OWN lane and an empty step on the other three', () => {
    for (const drum of DRUMS) {
      const cell = hit(drum.id);
      const mine = laneIndex(drum.id);
      for (let lane = 0; lane < DRUM_LANES.length; lane += 1) {
        expect(drumCellText(cell, lane)).toBe(lane === mine ? 'x' : EMPTY_STEP_TEXT);
        expect(drumCellLit(cell, lane)).toBe(lane === mine);
      }
    }
  });

  it('spells a melodic note the same in every lane, because it belongs to none', () => {
    const cell = note(64);
    const spelled = cellText(cell);
    for (let lane = 0; lane < DRUM_LANES.length; lane += 1) {
      expect(drumCellText(cell, lane)).toBe(spelled);
      expect(drumCellLit(cell, lane)).toBe(false);
    }
  });

  it('shows an empty step as the same three dots the note grid shows', () => {
    const cell = emptyCell();
    expect(cellText(cell)).toBe(EMPTY_STEP_TEXT);
    for (let lane = 0; lane < DRUM_LANES.length; lane += 1) {
      expect(drumCellText(cell, lane)).toBe(EMPTY_STEP_TEXT);
    }
  });

  it('names a drum in the note grid and marks it in the lanes', () => {
    const cell = hit('kick');
    expect(cellText(cell)).toBe('KCK');
    expect(drumCellText(cell, laneIndex('kick'))).toBe('x');
  });
});

describe('how solid a lane reads', () => {
  it('weighs the hit exactly as the note grid weighs it', () => {
    for (const velocity of [40, 70, 100]) {
      const cell = hit('kick', velocity);
      expect(drumCellAlpha(cell, laneIndex('kick'))).toBe(cellAlpha(cell));
      expect(cellAlpha(cell)).toBeCloseTo(0.45 + 0.55 * (velocity / MAX_VELOCITY), 6);
    }
  });

  it('gives the lanes a hit is NOT on the weight of an empty step', () => {
    const cell = hit('snare', 100);
    for (let lane = 0; lane < DRUM_LANES.length; lane += 1) {
      if (lane === laneIndex('snare')) continue;
      expect(drumCellAlpha(cell, lane)).toBe(EMPTY_ALPHA);
    }
  });

  it('draws a note between the two: dimmer than a hit, brighter than nothing', () => {
    const cell = note(64, MAX_VELOCITY);
    for (let lane = 0; lane < DRUM_LANES.length; lane += 1) {
      const alpha = drumCellAlpha(cell, lane);
      expect(alpha).toBeGreaterThan(EMPTY_ALPHA);
      expect(alpha).toBeLessThan(cellAlpha(cell));
    }
    expect(drumCellAlpha(emptyCell(), 0)).toBe(EMPTY_ALPHA);
  });
});

describe('writing a hit through a lane', () => {
  it('writes one drum into one step, and says so by returning true', () => {
    const pattern = emptyPattern('A');
    expect(writeDrum(pattern, 0, 0, 'kick')).toBe(true);
    expect(pattern.steps[0][0].drum).toBe('kick');
    // The pitch every reader that only knows notes will see: the kit's own.
    expect(pattern.steps[0][0].note).toBe(36);
    expect(cellText(pattern.steps[0][0])).toBe('KCK');
  });

  it('is a no-op the second time, so clicking a beat to hear it is safe', () => {
    const pattern = emptyPattern('A');
    writeDrum(pattern, 4, 0, 'hat');
    expect(writeDrum(pattern, 4, 0, 'hat')).toBe(false);
    expect(cellText(pattern.steps[4][0])).toBe('HAT');
  });

  it('replaces the hit that was there, because a step is one hit', () => {
    const pattern = emptyPattern('A');
    writeDrum(pattern, 2, 1, 'kick');
    expect(writeDrum(pattern, 2, 1, 'snare')).toBe(true);
    expect(pattern.steps[2][1].drum).toBe('snare');
    expect(pattern.steps[2][1].note).toBe(38);
  });

  it('writes the cell whole, so a chord does not survive a hit', () => {
    const pattern = emptyPattern('A');
    setCellNotes(pattern.steps[0][0], [60, 64, 67]);
    expect(writeDrum(pattern, 0, 0, 'wind')).toBe(true);
    expect(pattern.steps[0][0].extra).toEqual([]);
    expect(cellText(pattern.steps[0][0])).toBe('WND');
  });

  it('and a note takes the hit back off, so the lane goes dark again', () => {
    const pattern = emptyPattern('A');
    writeDrum(pattern, 0, 0, 'kick');
    expect(writeNote(pattern, 0, 0, 60)).toBe(true);
    const cell = pattern.steps[0][0];
    expect(cell.drum).toBeNull();
    for (let lane = 0; lane < DRUM_LANES.length; lane += 1) {
      expect(drumCellLit(cell, lane)).toBe(false);
    }
  });

  it('refuses a position off the grid rather than growing one', () => {
    const pattern = emptyPattern('A');
    expect(writeDrum(pattern, 99, 0, 'kick')).toBe(false);
    expect(writeDrum(pattern, 0, 99, 'kick')).toBe(false);
  });
});
