import { describe, expect, it } from 'vitest';

import {
  createSong,
  DEFAULT_GROOVE,
  GROOVES,
  grooveById,
  grooveFeel,
  grooveFromName,
  grooveLabel,
  grooveNames,
  nextGroove,
  type GrooveId,
} from '../model/song';
import { stepWhen } from '../audio/render';
import { applyScript } from '../model/script';

/**
 * Grooves, tested as the two promises that make them safe to add to a language
 * with hundreds of songs in it.
 *
 * A groove is a PERFORMANCE — where the weight is and where the notes sit — and
 * the danger of a performance is that it rewrites the part. So the first promise
 * is that skipping it is the identity, which is why every existing song is
 * untouched; the second is that no feel can move a note past the note after it
 * or make one louder than it was written, which is why a groove can be tried by
 * anyone without a licence in music theory.
 *
 * The feels themselves are tested by what they DO — the backbeat leans on beats
 * two and four, the shuffle lands the offbeat eighth two thirds of the way
 * through the beat — rather than by their numbers, so a tweak to a constant does
 * not silently change what a feel means.
 */

/** Every step of four bars, which is what a song's steps actually look like. */
const STEPS = Array.from({ length: 64 }, (_, i) => i);

describe('grooves: the two promises', () => {
  it('is the identity when the song is straight, which is the default', () => {
    expect(createSong().groove).toBe(DEFAULT_GROOVE);
    for (const step of STEPS) {
      expect(grooveFeel('straight', step, 4)).toEqual({ delay: 0, gain: 1 });
    }
    // And at every grid size, because a straight song is straight whatever its
    // resolution — this is the property that keeps old files byte-identical.
    for (const perBeat of [1, 2, 3, 4, 6, 8, 16]) {
      for (const step of STEPS) expect(grooveFeel('straight', step, perBeat)).toEqual({ delay: 0, gain: 1 });
    }
  });

  it('never moves a note past its neighbour, at any grid size', () => {
    // The order a bar is played in is not a feel's business. Consecutive notes
    // keep their order exactly when each one's delay is less than one step more
    // than the next one's, so that is the assertion.
    for (const feel of GROOVES) {
      for (const perBeat of [1, 2, 3, 4, 5, 8, 16]) {
        for (let step = 0; step < 64; step++) {
          const here = grooveFeel(feel.id, step, perBeat).delay;
          const next = grooveFeel(feel.id, step + 1, perBeat).delay;
          expect(here - next, `${feel.id} @ ${perBeat}/beat, step ${step}`).toBeLessThan(1);
          // And it may lean out of its slot, but only out of it.
          expect(Math.abs(here)).toBeLessThan(1);
        }
      }
    }
  });

  it('never makes a note louder than it was written', () => {
    // Multiplying a velocity by more than 1 would clip it at the top, so every
    // feel only ever takes level AWAY: an accent is the notes that keep theirs.
    for (const feel of GROOVES) {
      for (const perBeat of [1, 2, 3, 4, 8, 16]) {
        for (const step of STEPS) {
          const { gain } = grooveFeel(feel.id, step, perBeat);
          expect(gain, `${feel.id} @ ${perBeat}/beat, step ${step}`).toBeGreaterThan(0);
          expect(gain).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('gives every feel a name, a label and a blurb the menus can show', () => {
    for (const feel of GROOVES) {
      expect(feel.label).toBe(feel.label.toUpperCase());
      expect(feel.blurb.length).toBeGreaterThan(10);
      expect(grooveLabel(feel.id)).toBe(feel.label);
      expect(grooveById(feel.id)?.id).toBe(feel.id);
      // Every feel is reachable by its own id, which is what a script writes.
      expect(grooveFromName(feel.id)?.id).toBe(feel.id);
    }
    expect(grooveById('boogaloo')).toBeNull();
    // An id nothing knows still says something rather than crashing a menu.
    expect(grooveLabel('boogaloo' as GrooveId)).toBe('STRAIGHT');
  });
});

describe('grooves: what each feel does', () => {
  const feel = (id: GrooveId, step: number, perBeat = 4) => grooveFeel(id, step, perBeat);

  it('leans on beats two and four', () => {
    // Sixteen steps to the bar, four to the beat: the firm half is steps 4..7
    // and 12..15, and the other eight steps all give way by the same amount.
    const soft = feel('backbeat', 0).gain;
    for (const step of [4, 5, 6, 7, 12, 13, 14, 15]) expect(feel('backbeat', step).gain).toBe(1);
    for (const step of [0, 1, 2, 3, 8, 9, 10, 11]) expect(feel('backbeat', step).gain).toBe(soft);
    expect(soft).toBeLessThan(1);
    // It is a weight, not a placement: nothing moves.
    expect(feel('backbeat', 6).delay).toBe(0);
  });

  it('makes the notes BETWEEN the beats the loud ones', () => {
    for (let beat = 0; beat < 4; beat++) {
      expect(feel('offbeat', beat * 4).gain).toBeLessThan(1); // on the beat: gives way
      for (const sub of [1, 2, 3]) expect(feel('offbeat', beat * 4 + sub).gain).toBe(1);
    }
    // Where every note is already on a beat there is nothing to lean on, so the
    // feel is honest enough to do nothing rather than something arbitrary.
    for (const step of STEPS) expect(feel('offbeat', step, 1)).toEqual({ delay: 0, gain: 1 });
  });

  it('lands the offbeat eighth two thirds of the way through the beat', () => {
    // A beat is four steps, so the offbeat eighth is step 2 and the triplet it
    // should join is between steps 2 and 3. Nothing else moves at all.
    expect(feel('shuffle', 2).delay).toBeCloseTo(2 / 3, 10);
    expect(feel('shuffle', 6).delay).toBeCloseTo(2 / 3, 10);
    for (const sub of [0, 1, 3]) expect(feel('shuffle', sub).delay).toBe(0);
    // Its offbeat is lighter as well as later: that is what makes the pair read
    // as a shuffle even when every note was written at the same velocity.
    expect(feel('shuffle', 2).gain).toBeLessThan(1);
    expect(feel('shuffle', 0).gain).toBe(1);
    // On a beat that IS one step there is no eighth to move.
    expect(feel('shuffle', 0, 1)).toEqual({ delay: 0, gain: 1 });
    // On a finer grid the note is still placed two thirds of the way through the
    // beat rather than pushed into the following steps.
    expect(feel('shuffle', 8, 16).delay).toBeLessThan(1);
  });

  it('gives hip-hop a lazier eighth that still leans on two and four', () => {
    // Both halves of the pocket at once, which is why it is its own feel: the
    // offbeat eighth lands LATER than a shuffle's, and the accented half of the
    // bar is the same half a backbeat accents.
    expect(feel('boom-bap', 2).delay).toBeGreaterThan(feel('shuffle', 2).delay);
    // The weight half is exactly a backbeat's, so the two cannot drift apart.
    for (const step of STEPS) expect(feel('boom-bap', step).gain).toBe(feel('backbeat', step).gain);
    expect(feel('boom-bap', 6).gain).toBe(1);
    expect(feel('boom-bap', 0).gain).toBeLessThan(1);
    for (const step of [4, 5, 6, 7, 12, 13, 14, 15]) expect(feel('boom-bap', step).gain).toBe(1);
    // ...and it is a lean, not a landing: nothing moves off the beat itself.
    expect(feel('boom-bap', 0).delay).toBe(0);
    // On a grid with no offbeat eighth there is nothing to swing, so the feel
    // keeps only the half it CAN say — the same bargain `offbeat` makes.
    expect(feel('boom-bap', 4, 1).delay).toBe(0);
    expect(feel('boom-bap', 4, 1).gain).toBe(feel('backbeat', 4, 1).gain);
  });

  it('swings the sixteenths, and pushes the eighths the other way', () => {
    // `swing-16` is placement only: every offbeat 16th is late and no weight
    // changes at all, which is what a trap hat and a funk 16th have in common.
    expect(feel('swing-16', 1).delay).toBeGreaterThan(0);
    expect(feel('swing-16', 3).delay).toBeGreaterThan(0);
    expect(feel('swing-16', 0).delay).toBe(0);
    expect(feel('swing-16', 2).delay).toBe(0);
    for (const step of STEPS) expect(feel('swing-16', step).gain).toBe(1);
    // `d-beat` is the other direction and the other half of the bar: the offbeat
    // eighths arrive EARLY, so a fast part drives rather than plods.
    expect(feel('d-beat', 2).delay).toBeLessThan(0);
    expect(feel('d-beat', 0).delay).toBe(0);
    for (const step of STEPS) expect(feel('d-beat', step).gain).toBe(1);
    // Both are honest at a grid with no offbeat to move.
    expect(feel('swing-16', 0, 1)).toEqual({ delay: 0, gain: 1 });
    expect(feel('d-beat', 0, 1)).toEqual({ delay: 0, gain: 1 });
  });

  it('places everything a hair late, or a hair early, without changing a note', () => {
    for (const step of STEPS) {
      expect(feel('laid-back', step).delay).toBeGreaterThan(0);
      expect(feel('pushed', step).delay).toBeLessThan(0);
      expect(feel('laid-back', step).gain).toBe(1);
      expect(feel('pushed', step).gain).toBe(1);
    }
    // The two are the same distance either side of the beat, which is what makes
    // them a pair rather than two unrelated feels.
    expect(feel('laid-back', 0).delay).toBe(-feel('pushed', 0).delay);
  });

  it('wobbles the same way every time, so a render is the render you heard', () => {
    for (const step of STEPS) {
      const first = feel('human', step);
      expect(feel('human', step)).toEqual(first);
      // It has to actually wobble, and in both directions.
      expect(Math.abs(first.delay)).toBeLessThan(0.15);
      expect(first.gain).toBeLessThanOrEqual(1);
      expect(first.gain).toBeGreaterThan(0.8);
    }
    // Different steps wobble differently, or it would just be `pushed`.
    expect(new Set(STEPS.map((s) => feel('human', s).delay)).size).toBeGreaterThan(8);
    // And it does NOT repeat bar to bar: the same mistake in the same place
    // every time round stops sounding like a player and starts sounding like a
    // machine with a fault. Determinism is what a render needs; repetition is
    // what it must not have.
    const firstBar = STEPS.slice(0, 16).map((s) => feel('human', s).delay);
    const secondBar = STEPS.slice(16, 32).map((s) => feel('human', s).delay);
    const same = firstBar.filter((delay, i) => delay === secondBar[i]).length;
    expect(same).toBeLessThan(4);
  });

  it('never asks a player for a moment before the file begins', () => {
    // An early feel moves notes BEFORE their slot, and a file's clock starts at
    // zero — so the first slots of the order have nowhere to put one. Web Audio
    // reads a negative time as an error rather than as "as soon as possible",
    // which is the difference between an export sounding eager and an export
    // failing: a `pushed` song used to take the whole render down with it.
    const perBeat = 4;
    const rowSeconds = 0.125;
    const pushed = grooveFeel('pushed', 0, perBeat);
    expect(pushed.delay).toBeLessThan(0);
    expect(stepWhen(0, 0, pushed.delay, rowSeconds)).toBe(0);
    // Past the first slot the feel is heard exactly as written — the floor is a
    // floor on the file, not a flattening of the performance.
    for (const slot of [0.5, 1, 2.25]) {
      expect(stepWhen(0, slot, pushed.delay, rowSeconds)).toBeCloseTo(slot + pushed.delay * rowSeconds, 9);
    }
    expect(stepWhen(9, 0, pushed.delay, rowSeconds)).toBeCloseTo(9 + pushed.delay * rowSeconds, 9);
    // And a wobble that happens to lean early is bounded by the same floor.
    for (const step of STEPS) {
      expect(stepWhen(0, 0, grooveFeel('human', step, perBeat).delay, rowSeconds)).toBeGreaterThanOrEqual(0);
    }
  });

  it('takes a beat as a beat, whatever the grid resolution is', () => {
    // A backbeat is beats two and four, so its firm half is the same FRACTION of
    // the bar at eight steps to the beat as at four.
    const at4 = STEPS.map((s) => feel('backbeat', s, 4).gain);
    const at8 = STEPS.map((s) => feel('backbeat', s, 8).gain);
    expect(at4.slice(0, 16)).toEqual(at8.slice(0, 32).filter((_, i) => i % 2 === 0));
  });
});

describe('grooves: the names', () => {
  it('accepts the spelling a person reaches for, and refuses the rest', () => {
    expect(grooveFromName('backbeat')?.id).toBe('backbeat');
    expect(grooveFromName('BACKBEAT')?.id).toBe('backbeat');
    expect(grooveFromName('  Laid Back  ')?.id).toBe('laid-back');
    expect(grooveFromName('laid back')?.id).toBe('laid-back');
    expect(grooveFromName('laid_back')?.id).toBe('laid-back');
    expect(grooveFromName('late')?.id).toBe('laid-back');
    expect(grooveFromName('none')?.id).toBe('straight');
    expect(grooveFromName('swung')).toBeNull();
    expect(grooveNames()).toContain('backbeat');
  });

  it('cycles through every feel and comes back to the start', () => {
    const seen: GrooveId[] = [];
    let id = DEFAULT_GROOVE;
    for (let i = 0; i < GROOVES.length; i++) {
      seen.push(id);
      id = nextGroove(id);
    }
    expect(id).toBe(DEFAULT_GROOVE);
    expect(new Set(seen).size).toBe(GROOVES.length);
    // A button that wasted a press on the value already showing would read as
    // broken, so no step of the cycle is a no-op.
    for (const groove of GROOVES) expect(nextGroove(groove.id)).not.toBe(groove.id);
  });
});

describe('grooves: the script', () => {
  it('sets the feel, by id or by alias', () => {
    const result = applyScript(createSong(), 'groove backbeat');
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' / '));
    expect(result.song.groove).toBe('backbeat');
    const alias = applyScript(createSong(), 'groove triplet');
    if (!alias.ok) throw new Error(alias.errors.map((e) => e.message).join(' / '));
    expect(alias.song.groove).toBe('shuffle');
  });

  it('refuses a name nothing knows, and lists the ones it does', () => {
    const bad = applyScript(createSong(), 'groove funky');
    expect(bad.ok).toBe(false);
    const message = bad.ok ? '' : bad.errors[0].message;
    expect(message).toContain('"funky" is not a groove');
    expect(message).toContain('backbeat');
    expect(message).toContain('shuffle');
    expect(applyScript(createSong(), 'groove').ok).toBe(false);
    expect(applyScript(createSong(), 'groove backbeat shuffle').ok).toBe(false);
  });

  it('is reset by `new`, because a fresh song is played straight', () => {
    // A feel is song data like swing, so a script that starts a new song must not
    // inherit the pocket of whatever was on screen.
    const result = applyScript(createSong(), 'groove human\nnew\nsong "SECOND"');
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' / '));
    expect(result.song.groove).toBe(DEFAULT_GROOVE);
    // ...and stated AFTER the `new` it does apply.
    const after = applyScript(createSong(), 'new\ngroove human');
    if (!after.ok) throw new Error(after.errors.map((e) => e.message).join(' / '));
    expect(after.song.groove).toBe('human');
    // A script that never mentions a feel leaves a loaded song's feel alone,
    // which is what makes it safe to add one line to a file.
    const kept = applyScript(createSong(), 'song "X"');
    if (!kept.ok) throw new Error(kept.errors.map((e) => e.message).join(' / '));
    expect(kept.song.groove).toBe(DEFAULT_GROOVE);
  });
});
