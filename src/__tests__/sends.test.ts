import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildChannelChain } from '../audio/chain';
import {
  clampSend,
  DEFAULT_TRACK_ECHO,
  DEFAULT_VERB,
  emptyTrack,
  MAX_SEND,
  MIN_SEND,
  SEND_STEP,
  sendLabel,
  stepSend,
} from '../model/song';

/**
 * Sends, tested as the promise they are: a channel's send defaults to ALL of it.
 *
 * The room shipped before sends did, so `reverb 40` used to feed every channel
 * straight into the convolver. A send of 100 has to multiply that signal by
 * exactly 1 or every song written in that window gains or loses a room it did not
 * ask for — and a send of 0 has to be silence, because "keep the bass out of the
 * hall" is the entire reason someone reaches for this.
 */

describe('a send is a percentage, and both ends are named', () => {
  it('clamps into the range the control offers', () => {
    expect(clampSend(-20)).toBe(MIN_SEND);
    expect(clampSend(140)).toBe(MAX_SEND);
    expect(clampSend(40.6)).toBe(41);
  });

  it('treats a value it cannot use as the default rather than as silence', () => {
    // The default is the safe direction: a broken number should not make a
    // channel dry, because "my lead lost its reverb" is harder to explain than
    // "it is still in there".
    expect(clampSend(Number.NaN)).toBe(DEFAULT_VERB);
    expect(clampSend(Number.POSITIVE_INFINITY)).toBe(MAX_SEND);
  });

  it('says FULL and OFF rather than 100% and 0%', () => {
    expect(sendLabel(MAX_SEND)).toBe('FULL');
    expect(sendLabel(MIN_SEND)).toBe('OFF');
    expect(sendLabel(40)).toBe('40%');
  });

  it('nudges by the same step a level does, without skipping the top', () => {
    expect(stepSend(100, 1)).toBe(MAX_SEND);
    expect(stepSend(100, -1)).toBe(MAX_SEND - SEND_STEP);
    expect(stepSend(0, -1)).toBe(MIN_SEND);
    expect(stepSend(0, 1)).toBe(SEND_STEP);
    // Off a stop, it lands on the next one rather than drifting by one.
    expect(stepSend(45, 1)).toBe(50);
    expect(stepSend(45, -1)).toBe(40);
  });

  it('gives a new channel a full send to both effects', () => {
    // The one default in the model that is not zero, and the reason is in the
    // module: the room is what is switched off, not the channels' way into it.
    const track = emptyTrack(0);
    expect(track.verb).toBe(DEFAULT_VERB);
    expect(track.echo).toBe(DEFAULT_TRACK_ECHO);
    expect(DEFAULT_VERB).toBe(MAX_SEND);
  });
});

/** A BaseAudioContext stub: just enough to build a chain and read its gains. */
function stubContext(): {
  ctx: BaseAudioContext;
  gains: { value: number }[];
} {
  const gains: { value: number }[] = [];
  const node = (): unknown => {
    const gain = { value: 0, setTargetAtTime: vi.fn() };
    gains.push(gain);
    return {
      gain,
      connect: vi.fn(() => node()),
      disconnect: vi.fn(),
    };
  };
  const ctx = {
    currentTime: 0,
    createGain: () => node(),
    createChannelMerger: () => node(),
  } as unknown as BaseAudioContext;
  return { ctx, gains };
}

describe('the send gain', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('multiplies a full send by exactly one, so the old room is unchanged', () => {
    // `buildChannelChain` creates five gains in order: level, left, right, verb,
    // echo. A send of 100 must leave the tap at 1 — not 0.999 or 1.001 — because
    // that is what makes `reverb 40` produce the tail it produced before sends
    // existed, sample for sample.
    const { ctx, gains } = stubContext();
    buildChannelChain(ctx, { level: 1, pan: 0, verb: 100, echo: 100 }, {} as AudioNode, {
      reverb: {} as AudioNode,
      echo: {} as AudioNode,
    });
    expect(gains[3].value).toBe(1);
    expect(gains[4].value).toBe(1);
  });

  it('makes a send of zero silence, and a send of 40 four tenths', () => {
    const { ctx, gains } = stubContext();
    buildChannelChain(ctx, { level: 1, pan: 0, verb: 0, echo: 40 }, {} as AudioNode, {
      reverb: {} as AudioNode,
      echo: {} as AudioNode,
    });
    expect(gains[3].value).toBe(0);
    expect(gains[4].value).toBeCloseTo(0.4, 10);
  });

  it('clamps a send it cannot use rather than passing it through', () => {
    const { ctx, gains } = stubContext();
    buildChannelChain(ctx, { level: 1, pan: 0, verb: 500, echo: Number.NaN }, {} as AudioNode, {
      reverb: {} as AudioNode,
      echo: {} as AudioNode,
    });
    expect(gains[3].value).toBe(1);
    // A NaN reaches a GainNode as a NaN gain, which in Chrome makes the whole
    // node silent — so the fallback is the full send, not zero.
    expect(gains[4].value).toBe(1);
  });
});
