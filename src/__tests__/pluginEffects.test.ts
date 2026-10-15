import { describe, expect, it } from 'vitest';

import { effectMix } from '../plugins/effect';
import { defineInstrument } from '../plugins/sdk';
import bitcrushManifest from '../../examples/plugins/bitcrush-plus/manifest.json';
import { processBlock as bitcrush } from '../../examples/plugins/bitcrush-plus/index';
import { renderNote as renderSupersaw } from '../../examples/plugins/supersaw/index';

/** A short A4 supersaw note to crush: the instrument proof feeds the effect proof. */
function note(): Float32Array {
  return renderSupersaw(
    { detune: 40, decay: 60 },
    { midi: 69, velocity: 100, startStep: 0, holdSteps: 1, seed: 1 },
    22050,
  );
}

describe('effectMix', () => {
  it('mixes wet over dry with 0 as off and 100 as fully wet', () => {
    const dry = new Float32Array([0.5, -0.5, 0]);
    const wet = new Float32Array([1, 1, 1]);
    expect(Array.from(effectMix(0, dry, wet))).toEqual([0.5, -0.5, 0]);
    expect(Array.from(effectMix(100, dry, wet))).toEqual([1, 1, 1]);
    expect(Array.from(effectMix(50, dry, wet))).toEqual([0.75, 0.25, 0.5]);
    // A wet tail outlives the dry note rather than being cut with it.
    expect(effectMix(100, dry, new Float32Array([1, 1, 1, 1, 1]))).toHaveLength(5);
  });
});

describe('bitcrush-plus proof effect', () => {
  const params = { bits: 50, rate: 35 };

  it('is a valid effect manifest with an honest example shape', () => {
    expect(bitcrushManifest.kind).toBe('effect');
    expect(bitcrushManifest.params.map((param) => param.id)).toEqual(['bits', 'rate']);
    // And it is NOT an instrument: the SDK seats it nowhere yet.
    expect(defineInstrument({ manifest: bitcrushManifest, renderNote: undefined }).ok).toBe(false);
  });

  it('crushes deterministically: same bytes in, same bytes out', () => {
    const input = note();
    const first = bitcrush(input, params, 22050);
    expect(first.length).toBe(input.length);
    expect(Array.from(first).every((sample) => Number.isFinite(sample))).toBe(true);
    expect(bitcrush(input, params, 22050)).toEqual(first);
    const peak = Math.max(...Array.from(first).map((sample) => Math.abs(sample)));
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('degrades with the knobs: fewer bits and slower clocks change more', () => {
    const input = note();
    const clean = bitcrush(input, { bits: 0, rate: 0 }, 22050);
    const crushed = bitcrush(input, { bits: 100, rate: 100 }, 22050);
    const distance = (buffer: Float32Array): number =>
      buffer.reduce((sum, sample, i) => sum + Math.abs(sample - input[i]!), 0) / buffer.length;
    expect(distance(crushed)).toBeGreaterThan(distance(clean));
    expect(distance(clean)).toBeLessThan(0.05);
  });

  it('survives missing params and never changes length', () => {
    const input = note();
    const fallback = bitcrush(input, {}, 22050);
    expect(fallback.length).toBe(input.length);
    expect(Array.from(fallback).every((sample) => Number.isFinite(sample))).toBe(true);
  });
});
