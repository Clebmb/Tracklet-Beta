import { describe, expect, it } from 'vitest';

import {
  isPluginVoiceRef,
  parsePluginVoiceRef,
  PLUGIN_VOICE_PREFIX,
  pluginMidiHz,
  pluginNoteRandom,
  pluginVoiceRef,
  renderOutBuses,
  resolvePluginVoice,
} from '../plugins/instrument';
import { renderNote } from '../../examples/plugins/supersaw/index';
import { renderNote as renderStereoKit } from '../../examples/plugins/stereo-kit/index';

function note(seed: number): { midi: number; velocity: number; startStep: number; holdSteps: number; seed: number } {
  return { midi: 69, velocity: 100, startStep: 0, holdSteps: 1, seed };
}

describe('plugin voice references', () => {
  it('writes, spots, and parses plugin: references', () => {
    expect(pluginVoiceRef('com.example.supersaw')).toBe(`${PLUGIN_VOICE_PREFIX}com.example.supersaw`);
    expect(isPluginVoiceRef('plugin:com.example.supersaw')).toBe(true);
    expect(isPluginVoiceRef('lead')).toBe(false);
    expect(parsePluginVoiceRef('plugin:com.example.supersaw')).toBe('com.example.supersaw');
    expect(parsePluginVoiceRef('lead')).toBeNull();
    expect(parsePluginVoiceRef('plugin:')).toBeNull();
    expect(parsePluginVoiceRef('plugin:a b')).toBeNull();
  });

  it('resolves to the plugin when known and enabled, else falls back with words', () => {
    const known = [
      { id: 'com.example.supersaw', enabled: true },
      { id: 'com.example.sleepy', enabled: false },
    ];
    expect(resolvePluginVoice('plugin:com.example.supersaw', known)).toEqual({
      kind: 'plugin',
      id: 'com.example.supersaw',
    });
    const disabled = resolvePluginVoice('plugin:com.example.sleepy', known);
    expect(disabled.kind).toBe('builtin-fallback');
    if (disabled.kind === 'builtin-fallback') expect(disabled.notice).toMatch(/disabled/);
    const missing = resolvePluginVoice('plugin:com.example.gone', known);
    expect(missing.kind).toBe('builtin-fallback');
    if (missing.kind === 'builtin-fallback') expect(missing.notice).toMatch(/not installed/);
  });
});

describe('plugin note arithmetic', () => {
  it('tunes MIDI 69 to 440 and octaves by doubling', () => {
    expect(pluginMidiHz(69)).toBeCloseTo(440, 6);
    expect(pluginMidiHz(81)).toBeCloseTo(880, 6);
    expect(pluginMidiHz(57)).toBeCloseTo(220, 6);
  });

  it('deals the same stream per seed, a different one per note', () => {
    const a = pluginNoteRandom(42);
    const b = pluginNoteRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(pluginNoteRandom(7)()).not.toBe(pluginNoteRandom(8)());
  });
});

describe('output buses', () => {
  it('reads one bus from mono, every bus from multi, none from garbage', () => {
    const mono = new Float32Array([0.1, 0.2]);
    expect(renderOutBuses(mono)).toEqual([mono]);
    const pair = [new Float32Array([1]), new Float32Array([2, 3])];
    expect(renderOutBuses(pair)).toEqual(pair);
    expect(renderOutBuses([])).toEqual([]);
    expect(renderOutBuses(null)).toEqual([]);
    expect(renderOutBuses('loud')).toEqual([]);
    // A stranger in the list is dropped, not thrown over.
    expect(renderOutBuses([mono, 'loud'])).toEqual([mono]);
  });
});

describe('stereo-kit proof instrument', () => {
  const params = { punch: 70 };

  it('renders two finite buses, the beater shorter than the body', () => {
    const buses = renderOutBuses(renderStereoKit(params, note(1), 22050));
    expect(buses).toHaveLength(2);
    for (const bus of buses) {
      expect(bus.length).toBeGreaterThan(0);
      expect(Array.from(bus).every((sample) => Number.isFinite(sample))).toBe(true);
    }
    expect(buses[1].length).toBeLessThan(buses[0].length);
    const peak = Math.max(...Array.from(buses[0]).map((sample) => Math.abs(sample)));
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('is deterministic per seed and varies across seeds', () => {
    const first = renderStereoKit(params, note(7), 22050);
    expect(renderStereoKit(params, note(7), 22050)).toEqual(first);
    expect(renderStereoKit(params, note(8), 22050)).not.toEqual(first);
  });
});

describe('supersaw proof instrument', () => {
  const params = { detune: 40, decay: 60 };

  it('renders a finite, bounded note that starts near silence and peaks audibly', () => {
    const out = renderNote(params, note(1), 22050);
    // decay 60 maps to 0.05 + 0.6 * 1.45 = 0.92 s of audio.
    expect(out.length).toBe(Math.floor(0.92 * 22050));
    expect(Array.from(out).every((sample) => Number.isFinite(sample))).toBe(true);
    const peak = Math.max(...Array.from(out).map((sample) => Math.abs(sample)));
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(1);
    expect(Math.abs(out[0])).toBeLessThan(0.01);
    expect(Math.abs(out[out.length - 1])).toBeLessThan(0.01);
  });

  it('is deterministic per seed and varies across seeds', () => {
    const first = renderNote(params, note(7), 22050);
    const second = renderNote(params, note(7), 22050);
    expect(first).toEqual(second);
    const other = renderNote(params, note(8), 22050);
    expect(other).not.toEqual(first);
  });

  it('scales with velocity and survives missing params', () => {
    const loud = renderNote(params, note(1), 22050);
    const soft = renderNote(params, { ...note(1), velocity: 25 }, 22050);
    const peakOf = (buffer: Float32Array): number =>
      Math.max(...Array.from(buffer).map((sample) => Math.abs(sample)));
    expect(peakOf(soft)).toBeLessThan(peakOf(loud));
    expect(peakOf(soft)).toBeGreaterThan(0);
    const fallback = renderNote({}, note(1), 22050);
    expect(fallback.length).toBeGreaterThan(0);
    expect(Array.from(fallback).every((sample) => Number.isFinite(sample))).toBe(true);
  });
});
