import { describe, expect, it } from 'vitest';

import {
  clampDetune,
  clampLayer,
  clampLayerGain,
  clampOctave,
  copyPatch,
  DEFAULT_LAYER_DETUNE,
  DEFAULT_LAYER_GAIN,
  DEFAULT_LAYER_OCTAVE,
  DEFAULT_VOICE,
  firstLayer,
  isPlainVoicePatch,
  layerFromVoice,
  layerPitchLabel,
  layerVoice,
  makePatch,
  MAX_LAYERS,
  MAX_LAYER_OCTAVE,
  MIN_DETUNE,
  patchFromVoice,
  patchLabel,
  plainVoiceOfPatch,
  sameLayer,
  samePatch,
  voiceOfLayer,
  voiceOfPlainLayer,
  voiceOrDefault,
  VOICES,
  type Layer,
} from '../model';

/**
 * The layered instrument model, tested as the identity it exists to protect.
 *
 * Two promises run through everything here. The first is EXACTNESS: a voice is a
 * one-layer patch and passing one through the stack changes no number, which is
 * what lets the whole app keep working through the old API while the engine
 * underneath learns a new trick. The second is SAFETY: whatever a file or a
 * script hands in, a patch comes out playable — a boring instrument, never
 * silence and never a crash.
 */

function layer(over: Partial<Layer> = {}): Layer {
  return { ...layerFromVoice(DEFAULT_VOICE), ...over };
}

describe('a voice is a one-layer patch, exactly', () => {
  it('passes every shipped voice through the stack without moving a number', () => {
    for (const voice of VOICES) {
      const patch = patchFromVoice(voice.params);
      expect(patch.layers).toHaveLength(1);
      // The six tone knobs survive verbatim, and the three the layer adds are
      // at rest, so the engine plays the same arithmetic it always did.
      expect(voiceOfLayer(patch.layers[0])).toEqual(voice.params);
      expect(patch.layers[0].octave).toBe(DEFAULT_LAYER_OCTAVE);
      expect(patch.layers[0].detune).toBe(DEFAULT_LAYER_DETUNE);
      expect(patch.layers[0].gain).toBe(DEFAULT_LAYER_GAIN);
      // ... and the round trip comes back to the very same voice.
      expect(plainVoiceOfPatch(patch)).toEqual(voice.params);
      expect(isPlainVoicePatch(patch, voice.params)).toBe(true);
    }
  });

  it('is honest about a layer that is more than a voice', () => {
    // Transposed, detuned or turned down: each of the three makes a layer NOT
    // any single voice, and saying so beats a voice that silently drops it.
    expect(voiceOfPlainLayer(layer({ octave: 1 }))).toBeNull();
    expect(voiceOfPlainLayer(layer({ detune: 7 }))).toBeNull();
    expect(voiceOfPlainLayer(layer({ gain: 60 }))).toBeNull();
    expect(voiceOfPlainLayer(layer())).not.toBeNull();
    expect(plainVoiceOfPatch({ layers: [layer(), layer({ octave: 1 })] })).toBeNull();
    expect(isPlainVoicePatch({ layers: [layer({ gain: 50 })] }, DEFAULT_VOICE)).toBe(false);
  });

  it('reduces a patch it cannot spell to the neutral default rather than a lie', () => {
    const stacked = { layers: [layer(), layer({ octave: 1 })] };
    expect(voiceOrDefault(stacked)).toEqual(DEFAULT_VOICE);
    expect(voiceOrDefault(patchFromVoice(DEFAULT_VOICE))).toEqual(DEFAULT_VOICE);
  });
});

describe('a layer at rest is only clamped, never rejected', () => {
  it('folds an impossible layer into one that plays', () => {
    const wild = clampLayer(layer({ octave: 99, detune: -999, gain: 500, bright: -20, noise: 250 }));
    expect(wild.octave).toBe(MAX_LAYER_OCTAVE);
    expect(wild.detune).toBe(MIN_DETUNE);
    expect(wild.gain).toBe(100);
    expect(wild.bright).toBe(0);
    expect(wild.noise).toBe(100);
  });

  it('rounds the two pitch offsets, because half a cent is not a knob', () => {
    expect(clampOctave(1.6)).toBe(2);
    expect(clampOctave(-1.6)).toBe(-2);
    expect(clampDetune(12.4)).toBe(12);
    expect(clampDetune(-12.6)).toBe(-13);
  });

  it('reads a value it cannot use as the rest position, not as NaN', () => {
    expect(clampOctave(Number.NaN)).toBe(DEFAULT_LAYER_OCTAVE);
    expect(clampDetune(Number.POSITIVE_INFINITY)).toBe(DEFAULT_LAYER_DETUNE);
    expect(clampLayerGain(Number.NaN)).toBe(0);
  });
});

describe('a patch is built, copied and compared through one door', () => {
  it('caps the stack at four layers, so a channel stays a channel', () => {
    const many = Array.from({ length: MAX_LAYERS + 3 }, (_, i) => layer({ octave: i - 2 }));
    expect(makePatch(many).layers).toHaveLength(MAX_LAYERS);
  });

  it('never hands back an empty patch, because silence is not an instrument', () => {
    expect(makePatch([]).layers).toHaveLength(1);
    expect(makePatch([]).layers[0]).toEqual(layerFromVoice(DEFAULT_VOICE));
  });

  it('clamps every layer it keeps', () => {
    const patch = makePatch([layer({ octave: 99 }), layer({ gain: -50 })]);
    expect(patch.layers[0].octave).toBe(MAX_LAYER_OCTAVE);
    expect(patch.layers[1].gain).toBe(0);
  });

  it('copies by value, so editing one does not edit the other', () => {
    const patch = makePatch([layer(), layer({ octave: 1 })]);
    const copy = copyPatch(patch);
    copy.layers[0].bright = 5;
    copy.layers.push(layer());
    expect(patch.layers[0].bright).not.toBe(5);
    expect(patch.layers).toHaveLength(2);
    expect(samePatch(patch, copyPatch(patch))).toBe(true);
  });

  it('compares layer by layer, and a difference anywhere is a difference', () => {
    const base = layer();
    expect(sameLayer(base, { ...base })).toBe(true);
    expect(sameLayer(base, { ...base, detune: 1 })).toBe(false);
    expect(samePatch({ layers: [base] }, { layers: [base, base] })).toBe(false);
    expect(samePatch({ layers: [base] }, { layers: [{ ...base, wave: 'sine' }] })).toBe(false);
  });
});

describe('the labels a menu draws', () => {
  it('says how many layers a patch has', () => {
    expect(patchLabel(patchFromVoice(DEFAULT_VOICE))).toBe('1 LAYER');
    expect(patchLabel(makePatch([layer(), layer(), layer()]))).toBe('3 LAYERS');
  });

  it('always answers where a layer sits, even when it is in tune', () => {
    expect(layerPitchLabel(layer())).toBe('IN TUNE');
    expect(layerPitchLabel(layer({ octave: 1 }))).toBe('OCT +1');
    expect(layerPitchLabel(layer({ octave: -2 }))).toBe('OCT -2');
    expect(layerPitchLabel(layer({ detune: -12 }))).toBe('DET -12c');
    expect(layerPitchLabel(layer({ octave: 1, detune: 7 }))).toBe('OCT +1 DET +7c');
  });

  it('exposes a layer\'s tone as a voice for a caller that only wants the knobs', () => {
    const l = layer({ bright: 42, octave: 2 });
    expect(layerVoice(l)).toEqual(voiceOfLayer(l));
    expect(layerVoice(l).bright).toBe(42);
  });
});

describe('the first layer is the fallback the engine leans on', () => {
  it('returns the only layer of a legacy patch', () => {
    expect(firstLayer(patchFromVoice(DEFAULT_VOICE))).toEqual(layerFromVoice(DEFAULT_VOICE));
  });

  it('returns a neutral layer when a patch somehow has none', () => {
    expect(firstLayer({ layers: [] })).toEqual(layerFromVoice(DEFAULT_VOICE));
  });
});
