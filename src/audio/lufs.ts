/**
 * lufs — how loud a render IS, and the one number that makes it how loud you
 * asked for.
 *
 * `EXPORT AUDIO` is a decision about level: the song goes out at whatever the
 * master fader happened to be, and the person who receives it turns it up or
 * down until it sits next to everything else from everywhere else. A loudness
 * TARGET replaces that guess with an answer: `export loud -14` measures the
 * render the way a streaming service does and applies the one gain that puts the
 * file where it was asked to be.
 *
 * ── Why this is the standard's arithmetic and not a peak meter ───────────────
 * A peak meter answers "how close to clipping is this". It says nothing about how
 * loud the file sounds to a person, and two songs with the same peak can be 10 dB
 * apart. The number a service publishes (-14 LUFS, -16, -23) comes from ITU-R
 * BS.1770: filter the audio the way an ear weights frequency, average the energy
 * over 400 ms blocks, throw away the quiet blocks, and take the mean of what is
 * left. That is what this file computes, because matching a target nobody else
 * means would be a number with no meaning.
 *
 * ── The chain, and the one thing that could drift ────────────────────────────
 * The K-weighting filter is a high shelf (+4 dB above about 2 kHz) followed by a
 * high-pass at 38 Hz, and the standard publishes its coefficients for ONE sample
 * rate — 48000. A render here is usually 44100, and reusing 48 kHz coefficients
 * at 44.1 kHz would put both corners in the wrong place, so the two biquads are
 * DERIVED from the filter's own parameters at whatever rate the render is in.
 * That derivation is checked against the published table at 48 kHz, which is the
 * only way to know it is right: a test asserts the coefficients this file
 * produces at 48 kHz are the ones in the standard, to within rounding.
 *
 * ── What "normalise" does and does not promise ───────────────────────────────
 * The gain is decided by MEASURING the finished render and scaling it — the same
 * thing a DAW's normalise does, and a linear gain, so it cannot change what the
 * file sounds like; it changes only how loud it is. Two honest limits come with
 * that:
 *   - A target is not reachable by every file. Turning a quiet mix up to -14 may
 *     want a gain whose peak would go past full scale, and this file will not
 *     write a clipped render. It stops at the ceiling (`LUFS_CEILING_DB`) and
 *     REPORTS that it stopped (`limited`) rather than pretending: an export that
 *     silently clips is worse than one that lands a decibel low.
 *   - The gain is applied AFTER the render, so the master bus's own effects see
 *     the level they saw when the song was written, not the normalised one. That
 *     is what a normalise is, and it is the only reading under which the same
 *     song normalised twice gives the same file.
 *
 * Phaser-free and browser-free: this works on plain `Float32Array`s, so the
 * arithmetic can be checked without a canvas or an audio context.
 */

import type { PcmAudio } from './wav';

/** One second-order section, in the form `y = b0x + b1x' + b2x'' - a1y' - a2y''`. */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * The offset in the standard's own equation, and the value that makes the number
 * an absolute one rather than a level: `LUFS = OFFSET + 10·log10(mean square)`.
 *
 * It is not a fudge. The weighting below has a gain of about +0.70 dB at 1 kHz,
 * and this offset very nearly cancels it, which is the whole calibration: a 1 kHz
 * tone therefore reads its own RMS in dBFS. A full-scale sine (RMS -3.01 dBFS)
 * reads -3.00 LUFS, and the broadcast calibration tone — a 1 kHz sine at -20
 * dBFS — reads -23.00 LUFS. Both are asserted by a test, so the number here is
 * checked rather than quoted.
 */
export const LUFS_OFFSET = -0.691;

/** Blocks quieter than this are not programme, they are the gap between it. */
export const LUFS_ABSOLUTE_GATE = -70;
/** A block this far under the mean is not what the listener hears as the song. */
export const LUFS_RELATIVE_GATE = 10;

/**
 * The measurement window, in seconds, and how much of it is shared with the
 * block before it. Both are the standard's (400 ms, 75 % overlap); changing
 * either changes the number, which is the whole reason they are named here.
 */
export const LUFS_BLOCK_SECONDS = 0.4;
export const LUFS_BLOCK_OVERLAP = 0.75;

/**
 * How close to full scale a normalised render may peak, in dBFS.
 *
 * The measurement above is a SAMPLE peak, and a sample peak is a lower bound on
 * what a converter will actually do: a reconstructed signal can overshoot the
 * highest sample by a fraction of a decibel. Reserving one whole decibel is the
 * conservative reading of that, and it is the ceiling every real service asks for
 * anyway — so a file this app normalises has the headroom it claims to have.
 */
export const LUFS_CEILING_DB = -1;

/**
 * The standard's stage 1: a high shelf, given as the parameters the standard
 * states rather than as coefficients, so it can be built for any sample rate.
 *
 * The gain, the corner and the Q are the published values; `SHELF_BAND` is the
 * mid-band reference the standard defines the shelf against, and it is what makes
 * the shelf's plateau +4 dB in the treble while its gain at 1 kHz is only +0.67
 * dB. The cascade's gain at 1 kHz is +0.70 dB, and the offset above is what takes
 * it back off — see `LUFS_OFFSET`.
 */
const SHELF_F0 = 1681.974450955533;
const SHELF_GAIN_DB = 3.999843853973347;
const SHELF_Q = 0.7071752369554196;
const SHELF_BAND_EXPONENT = 0.4996667741545416;

/** The standard's stage 2: a high-pass, which is what takes the rumble out. */
const HIGHPASS_F0 = 38.13547087602444;
const HIGHPASS_Q = 0.5003270373238773;

/** The two sections of the K-weighting filter, built for one sample rate. */
export function kWeighting(sampleRate: number): { shelf: Biquad; highpass: Biquad } {
  return { shelf: shelfAt(sampleRate), highpass: highPassAt(sampleRate) };
}

/** The high shelf, by the bilinear transform the standard describes. */
function shelfAt(sampleRate: number): Biquad {
  const k = Math.tan((Math.PI * SHELF_F0) / sampleRate);
  const vh = 10 ** (SHELF_GAIN_DB / 20);
  const vb = vh ** SHELF_BAND_EXPONENT;
  const a0 = 1 + k / SHELF_Q + k * k;
  return {
    b0: (vh + (vb * k) / SHELF_Q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / SHELF_Q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / SHELF_Q + k * k) / a0,
  };
}

/** The high-pass. Its numerator is fixed at `(1 - z⁻¹)²`, which is the whole filter. */
function highPassAt(sampleRate: number): Biquad {
  const k = Math.tan((Math.PI * HIGHPASS_F0) / sampleRate);
  const a0 = 1 + k / HIGHPASS_Q + k * k;
  return {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / HIGHPASS_Q + k * k) / a0,
  };
}

/**
 * One section's gain at one frequency — its magnitude response, as a factor.
 *
 * Used to CHECK the filter rather than to run it: the standard's shelf is
 * calibrated so that this is exactly 1 at 1 kHz, and a test says so. Exported
 * because a claim about what the weighting does to a tone should be a number
 * something can check, not a sentence in a comment.
 */
export function biquadGain(section: Biquad, hz: number, sampleRate: number): number {
  const w = (2 * Math.PI * hz) / sampleRate;
  const cos1 = Math.cos(-w);
  const sin1 = Math.sin(-w);
  const cos2 = Math.cos(-2 * w);
  const sin2 = Math.sin(-2 * w);
  const numRe = section.b0 + section.b1 * cos1 + section.b2 * cos2;
  const numIm = section.b1 * sin1 + section.b2 * sin2;
  const denRe = 1 + section.a1 * cos1 + section.a2 * cos2;
  const denIm = section.a1 * sin1 + section.a2 * sin2;
  return Math.hypot(numRe, numIm) / Math.hypot(denRe, denIm);
}

/** Run one section over a buffer, in place. Direct form 1, like the standard's. */
function runBiquad(samples: Float32Array, { b0, b1, b2, a1, a2 }: Biquad): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] ?? 0;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    samples[i] = y;
  }
}

/** The mean square of a slice of one channel — a block's energy. */
function meanSquare(samples: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) {
    const value = samples[i] ?? 0;
    sum += value * value;
  }
  return to > from ? sum / (to - from) : 0;
}

/** `-0.691 + 10·log10(mean square)`: one block's loudness, from its energy. */
function loudnessOf(energy: number): number {
  return LUFS_OFFSET + 10 * Math.log10(energy);
}

/**
 * The integrated loudness of a render, in LUFS — or null when there is nothing
 * loud enough to measure.
 *
 * Null rather than a very negative number, because the honest answer to "how loud
 * is silence" is "it has no loudness": a caller that has to write a gain needs to
 * be able to tell that case apart from a quiet song, and `-Infinity` in a status
 * line would read as a bug.
 *
 * The gating is the standard's two passes and both matter. The ABSOLUTE gate
 * drops the digital black between movements; the RELATIVE gate then drops
 * anything 10 LU under the loud part, which is what stops a long quiet ending
 * from dragging a loud song's number down. A render shorter than one 400 ms block
 * is measured as a single block over all of it — the standard wants whole blocks,
 * and a file that short has no choice.
 */
export function integratedLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
): number | null {
  const frames = channels.reduce((longest, channel) => Math.max(longest, channel.length), 0);
  if (frames === 0 || channels.length === 0) return null;

  // The weighting first, on a copy: a measurement must not change the file.
  const weighted = channels.map((channel) => {
    const copy = channel.slice();
    const { shelf, highpass } = kWeighting(sampleRate);
    runBiquad(copy, shelf);
    runBiquad(copy, highpass);
    return copy;
  });

  const blockFrames = Math.round(LUFS_BLOCK_SECONDS * sampleRate);
  const hop = Math.max(1, Math.round(blockFrames * (1 - LUFS_BLOCK_OVERLAP)));
  const blockEnergy = (from: number, to: number): number => {
    let sum = 0;
    for (const channel of weighted) sum += meanSquare(channel, from, to);
    return sum;
  };

  // One entry per whole block, and — for a render too short to hold one — a
  // single entry over everything there is, which is the only measurement its
  // length admits.
  const energies: number[] = [];
  if (frames < blockFrames) {
    energies.push(blockEnergy(0, frames));
  } else {
    for (let from = 0; from + blockFrames <= frames; from += hop) {
      energies.push(blockEnergy(from, from + blockFrames));
    }
  }

  // Pass one: the blocks that are programme at all. A silent block is -Infinity
  // here, which is why nothing below needs a special case for it.
  const above = energies.filter((energy) => loudnessOf(energy) > LUFS_ABSOLUTE_GATE);
  if (above.length === 0) return null;

  // Pass two: the blocks that are the song rather than a tail or a gap.
  const meanAbove = above.reduce((sum, energy) => sum + energy, 0) / above.length;
  const relativeGate = loudnessOf(meanAbove) - LUFS_RELATIVE_GATE;
  const kept = above.filter((energy) => loudnessOf(energy) > relativeGate);
  if (kept.length === 0) return null;

  const mean = kept.reduce((sum, energy) => sum + energy, 0) / kept.length;
  return loudnessOf(mean);
}

/** The highest sample in a render, as a positive fraction of full scale. */
export function samplePeak(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      const value = Math.abs(channel[i] ?? 0);
      if (value > peak) peak = value;
    }
  }
  return peak;
}

/**
 * What a normalise decided: the gain, what the render measured, and whether the
 * ceiling got in the way.
 *
 * `measured` is null when there was nothing to measure, and then the gain is
 * exactly 1 — an unmeasurable render is left alone rather than scaled by a
 * division by infinity. The caller makes that case a sentence, because only it
 * knows what the export was for.
 */
export interface LoudnessMatch {
  /** The linear gain to apply. Exactly 1 when there is nothing to match. */
  gain: number;
  /** The render's own loudness in LUFS, or null when it has none. */
  measured: number | null;
  /** True when the ceiling, rather than the target, decided the gain. */
  limited: boolean;
}

/**
 * The gain that moves a render to a loudness target, without clipping.
 *
 * Linear in the log domain, which is what makes this exact rather than iterative:
 * multiplying every sample by `g` multiplies every block's mean square by `g²`, so
 * the measured loudness moves by `20·log10(g)` and one subtraction of decibels
 * lands it on the target. No loop, and nothing to converge.
 */
export function matchLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
  target: number,
  ceilingDb = LUFS_CEILING_DB,
): LoudnessMatch {
  const measured = integratedLoudness(channels, sampleRate);
  if (measured === null) return { gain: 1, measured: null, limited: false };

  let gain = 10 ** ((target - measured) / 20);
  const peak = samplePeak(channels);
  const ceiling = 10 ** (ceilingDb / 20);
  let limited = false;
  if (peak > 0 && peak * gain > ceiling) {
    gain = ceiling / peak;
    limited = true;
  }
  return { gain, measured, limited };
}

/**
 * A scaled copy of a render — a new set of buffers, never the ones handed in.
 *
 * A copy rather than an in-place scale so that a caller can still show the
 * measurement it made, and so that a test can hold the same buffer on both sides
 * of the change. At a gain of exactly 1 the copy is still made, which is the
 * price of not having one code path that sometimes mutates its argument.
 */
export function gainChannels(channels: readonly Float32Array[], gain: number): Float32Array[] {
  return channels.map((channel) => {
    const out = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) out[i] = (channel[i] ?? 0) * gain;
    return out;
  });
}

/** `gainChannels` in the form the renderer and the encoder speak. */
export function gainPcm(pcm: PcmAudio, gain: number): PcmAudio {
  return { channels: gainChannels(pcm.channels, gain), sampleRate: pcm.sampleRate };
}

/** A gain as the decibels a status line prints. `0` at unity, which is a fact. */
export function gainDecibels(gain: number): number {
  return 20 * Math.log10(gain);
}

/** `-14.0 LUFS`, at the one decimal a service publishes. */
export function formatLufs(value: number): string {
  return `${value.toFixed(1)} LUFS`;
}
