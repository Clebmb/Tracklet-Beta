import { describe, expect, it } from 'vitest';

import {
  audible,
  channelGain,
  clampLevel,
  createSong,
  DEFAULT_LEVEL,
  emptyTrack,
  LEVEL_STEP,
  levelLabel,
  MAX_LEVEL,
  MIN_LEVEL,
  soloing,
  soloList,
  stepLevel,
} from '../model';

/**
 * The mix: how loud a channel is, and which channels are heard at all.
 *
 * This is the one rule in the app that can make a song sound BROKEN rather than
 * wrong — a channel that is silent when it should not be, or one that plays
 * through a mute — so it is tested as a truth table rather than by example. The
 * three inputs are level, mute and solo; solo beats mute is the only line that
 * is genuinely a decision, and it is here so that decision cannot drift away
 * from the engine that obeys it.
 */

describe('the level of a channel', () => {
  it('starts every channel at full volume', () => {
    for (let i = 0; i < 8; i++) {
      expect(emptyTrack(i).level).toBe(DEFAULT_LEVEL);
      expect(DEFAULT_LEVEL).toBe(MAX_LEVEL);
    }
    const song = createSong();
    expect(song.tracks.map((t) => t.level)).toEqual([100, 100, 100, 100]);
  });

  it('clamps a level into the range the control offers', () => {
    expect(clampLevel(-40)).toBe(MIN_LEVEL);
    expect(clampLevel(140)).toBe(MAX_LEVEL);
    expect(clampLevel(63.4)).toBe(63);
    expect(clampLevel(63.6)).toBe(64);
    expect(clampLevel(Number.NaN)).toBeNaN();
  });

  it('nudges in steps of ten, snapping a stray value onto the stops first', () => {
    expect(LEVEL_STEP).toBe(10);
    expect(stepLevel(100, -1)).toBe(90);
    expect(stepLevel(100, 1)).toBe(100);
    expect(stepLevel(0, -1)).toBe(0);
    expect(stepLevel(0, 1)).toBe(10);
    // A level a click left at 37 is not a stop, so a nudge lands on 40 rather
    // than wandering off in odd numbers for the rest of the song.
    expect(stepLevel(37, 1)).toBe(40);
    expect(stepLevel(37, -1)).toBe(30);
    expect(stepLevel(35, -1)).toBe(30);
    expect(stepLevel(35, 1)).toBe(40);
    // Two nudges at once, which is what a held key amounts to.
    expect(stepLevel(50, 2)).toBe(70);
    expect(stepLevel(50, -2)).toBe(30);
  });

  it('reads back as a percentage, which is what the screens show', () => {
    expect(levelLabel(70)).toBe('70%');
    expect(levelLabel(0)).toBe('0%');
    expect(levelLabel(140)).toBe('100%');
  });
});

describe('which channels are heard', () => {
  it('plays everything when nothing is muted or soloed', () => {
    const mutes = [false, false, false, false];
    const solos = [false, false, false, false];
    expect(soloing(solos)).toBe(false);
    for (let i = 0; i < 4; i++) expect(audible(i, mutes, solos)).toBe(true);
  });

  it('silences exactly the muted channels when nothing is soloed', () => {
    const mutes = [false, true, false, true];
    const solos = [false, false, false, false];
    expect([0, 1, 2, 3].map((i) => audible(i, mutes, solos))).toEqual([true, false, true, false]);
  });

  it('silences everything but the soloed channels once anything is soloed', () => {
    const mutes = [false, false, false, false];
    const solos = [false, true, false, true];
    expect(soloing(solos)).toBe(true);
    expect([0, 1, 2, 3].map((i) => audible(i, mutes, solos))).toEqual([false, true, false, true]);
  });

  it('lets solo override the mute on the channel it solos', () => {
    const mutes = [true, false, false, false];
    const solos = [true, false, false, false];
    expect(audible(0, mutes, solos)).toBe(true);
    // ...and the OTHER muted channel is still quiet, for two reasons at once.
    expect(audible(1, mutes, solos)).toBe(false);
  });

  it('treats a short or missing array as "no special case", not as a crash', () => {
    expect(audible(3, [], [])).toBe(true);
  });
});

describe('the gain a channel ends up at', () => {
  it('is the level of a channel that is heard', () => {
    expect(channelGain(0, [40, 100], [false, false], [false, false])).toBe(40);
  });

  it('is silence for a muted channel, whatever its level says', () => {
    expect(channelGain(0, [100, 100], [true, false], [false, false])).toBe(0);
  });

  it('is silence for a channel held quiet by another channel soloing', () => {
    expect(channelGain(0, [100, 100], [false, false], [false, true])).toBe(0);
    expect(channelGain(1, [100, 100], [false, false], [false, true])).toBe(100);
  });

  it('is silent for a channel turned all the way down, though it is not muted', () => {
    expect(channelGain(0, [0], [false], [false])).toBe(0);
    // The distinction matters: this channel is silent and NOT muted, so the mix
    // menu must be able to say which of the two it is. That is why the mute flag
    // is never derived from the gain.
    expect(channelGain(0, [70], [false], [])).toBe(70);
    // A channel with no level on record is at full volume, not at zero: silence
    // must only ever come from a decision.
    expect(channelGain(3, [70], [false], [])).toBe(100);
  });
});

describe('saying which channels are soloed', () => {
  it('names them, in order, and says nothing when none are', () => {
    expect(soloList(['LEAD', 'BASS', 'PAD'], [false, true, false])).toBe('BASS');
    expect(soloList(['LEAD', 'BASS', 'PAD'], [true, false, true])).toBe('LEAD + PAD');
    expect(soloList(['LEAD', 'BASS'], [false, false])).toBe('');
    expect(soloList(['LEAD'], [])).toBe('');
  });
});
