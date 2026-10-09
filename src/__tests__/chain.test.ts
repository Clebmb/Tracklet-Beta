import { describe, expect, it } from 'vitest';

import { applyPanGains } from '../audio/chain';

/**
 * The pan law, tested as the promise it is: nothing gets quieter by existing.
 *
 * The whole reason this file exists instead of a built-in `StereoPannerNode` is
 * that an equal-power panner makes dead centre 0.707 a side, so adding panning
 * would have quietly dropped every existing song by 3 dB. Here a centred channel
 * must come out at exactly 1 and 1 — the same gain this app played when every
 * channel was centred — and moving away from the middle must TURN DOWN the far
 * side rather than turn up the near one.
 *
 * `applyPanGains` only ever talks to `gain.setTargetAtTime`, so a tiny recording
 * stub is enough to see what it asked a channel to do.
 */

/** A fake gain that remembers the last value it was told to slide toward. */
function fakeGain(): { gain: { setTargetAtTime(v: number): void }; last(): number } {
  let value = 0;
  return {
    gain: { setTargetAtTime(v: number) { value = v; } },
    last: () => value,
  };
}

function pans(pan: number): { left: number; right: number } {
  const left = fakeGain();
  const right = fakeGain();
  // The function only needs the one method it calls; the cast says so.
  applyPanGains(left as unknown as GainNode, right as unknown as GainNode, pan, 0);
  return { left: left.last(), right: right.last() };
}

describe('the constant-gain pan law', () => {
  it('leaves a centred channel at full on both sides, so old songs do not lose 3 dB', () => {
    expect(pans(0)).toEqual({ left: 1, right: 1 });
  });

  it('turns the far side down and never the near side up', () => {
    expect(pans(-100)).toEqual({ left: 1, right: 0 }); // hard left: silent right
    expect(pans(100)).toEqual({ left: 0, right: 1 }); // hard right: silent left
    // 40% off-centre leaves the far side at 60%: the same rate, both directions.
    expect(pans(-40)).toEqual({ left: 1, right: 0.6 });
    expect(pans(40)).toEqual({ left: 0.6, right: 1 });
  });

  it('treats a value it cannot use as centre rather than as silence', () => {
    expect(pans(Number.NaN)).toEqual({ left: 1, right: 1 });
    expect(pans(Number.POSITIVE_INFINITY)).toEqual({ left: 1, right: 1 });
  });

  it('keeps the near side exactly full even past the edge', () => {
    // A file could still hold -160 before it is clamped; the law must not
    // overshoot into a gain above 1, which would be a free boost.
    expect(pans(-160)).toEqual({ left: 1, right: 0 });
    expect(pans(160)).toEqual({ left: 0, right: 1 });
  });
});
