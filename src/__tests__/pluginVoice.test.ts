import { describe, expect, it } from 'vitest';

import { AudioEngine } from '../audio/engine';
import {
  compensatedStartAt,
  pluginCpuStats,
  pluginEventFor,
  pluginForTrack,
  renderPluginBuffer,
  resetPluginCpu,
  resolveTrackPlugins,
} from '../audio/pluginVoice';
import { defaultPluginParams } from '../plugins/instrument';
import { BUILT_IN_INSTRUMENTS } from '../plugins/builtIn';
import { renderNote as renderSupersaw } from '../../examples/plugins/supersaw/index';

const SUPERSAW_ID = 'com.example.supersaw';

function supersaw() {
  const found = BUILT_IN_INSTRUMENTS.find((plugin) => plugin.manifest.id === SUPERSAW_ID);
  if (!found) throw new Error('the bundled supersaw is missing');
  return found;
}

describe('the bundled instruments', () => {
  it('ships the supersaw with a valid manifest and its example render', () => {
    const plugin = supersaw();
    expect(plugin.manifest.kind).toBe('instrument');
    expect(plugin.manifest.apiVersion).toBe(1);
    expect(plugin.renderNote).toBe(renderSupersaw);
    expect(defaultPluginParams(plugin.manifest)).toEqual({ detune: 40, decay: 60 });
  });
});

describe('resolving channels to plugins', () => {
  it('seats a named channel and leaves the rest on their built-in voices', () => {
    const plugins = [supersaw()];
    expect(pluginForTrack(SUPERSAW_ID, plugins)?.manifest.id).toBe(SUPERSAW_ID);
    expect(pluginForTrack(null, plugins)).toBeNull();
    expect(pluginForTrack('com.example.gone', plugins)).toBeNull();
    expect(resolveTrackPlugins([null, SUPERSAW_ID, 'com.example.gone'], plugins)).toEqual([
      null,
      plugins[0],
      null,
    ]);
  });

  it('builds the event a note is: pitch, force, step, hold, stable seed', () => {
    const first = pluginEventFor(0, 4, 69, 100, 2);
    expect(first).toEqual({ midi: 69, velocity: 100, startStep: 4, holdSteps: 2, seed: first.seed });
    expect(pluginEventFor(0, 4, 69, 100, 2).seed).toBe(first.seed);
    expect(pluginEventFor(1, 4, 69, 100, 2).seed).not.toBe(first.seed);
    expect(pluginEventFor(0, null, 69, 100, 2).startStep).toBe(0);
    expect(pluginEventFor(0, 4, 69, 140, 0).velocity).toBe(100);
    expect(pluginEventFor(0, 4, 69, 100, 0).holdSteps).toBe(1);
  });
});

describe('the cpu meter', () => {
  /** A context that holds samples and starts sources, and nothing else. */
  function stubCtx() {
    return {
      createBuffer: (_channels: number, length: number, _sampleRate: number) => ({
        getChannelData: () => new Float32Array(length),
      }),
      createBufferSource: () => ({
        connect() {},
        start() {},
      }),
    } as unknown as BaseAudioContext;
  }

  it('files every render against its plugin id', () => {
    resetPluginCpu();
    const plugin = supersaw();
    const out = renderPluginBuffer(
      stubCtx(),
      plugin,
      pluginEventFor(0, 0, 69, 100, 1),
      22050,
      0,
    );
    expect(out).not.toBeNull();
    const stats = pluginCpuStats();
    expect(stats.map((entry) => entry.id)).toEqual([plugin.manifest.id]);
    expect(stats[0]!.renders).toBe(1);
    expect(stats[0]!.avgMs).toBeGreaterThanOrEqual(0);
    resetPluginCpu();
    expect(pluginCpuStats()).toEqual([]);
  });

  it('files the cost even when the render throws', () => {
    resetPluginCpu();
    const plugin = {
      manifest: supersaw().manifest,
      renderNote: () => {
        throw new Error('broken dsp');
      },
    };
    expect(() =>
      renderPluginBuffer(stubCtx(), plugin, pluginEventFor(0, 0, 69, 100, 1), 22050, 0),
    ).toThrow('broken dsp');
    expect(pluginCpuStats().map((entry) => entry.id)).toEqual([plugin.manifest.id]);
    resetPluginCpu();
  });
});

describe('latency compensation', () => {
  it('starts a latent note early, so its transient lands on the grid', () => {
    expect(compensatedStartAt(2, {})).toBe(2);
    expect(compensatedStartAt(2, { latencyMs: 20 })).toBeCloseTo(1.98, 6);
    // A note earlier than its own latency starts at the downbeat, not before it.
    expect(compensatedStartAt(0.005, { latencyMs: 20 })).toBe(0);
    expect(compensatedStartAt(0, { latencyMs: 20 })).toBe(0);
  });

  it('compensates inside the shared buffer path, so both clocks honour it', () => {
    const started: number[] = [];
    const ctx = {
      createBuffer: (_channels: number, length: number, _sampleRate: number) => ({
        getChannelData: () => new Float32Array(length),
      }),
      createBufferSource: () => ({
        connect() {},
        start: (at: number) => started.push(at),
      }),
    } as unknown as BaseAudioContext;
    const base = supersaw();
    const latent = { manifest: { ...base.manifest, latencyMs: 20 }, renderNote: base.renderNote };
    renderPluginBuffer(ctx, latent, pluginEventFor(0, 0, 69, 100, 1), 22050, 2);
    expect(started).toHaveLength(1);
    expect(started[0]).toBeCloseTo(1.98, 6);
    // And a plugin with no claim still starts on the grid.
    renderPluginBuffer(ctx, base, pluginEventFor(0, 0, 69, 100, 1), 22050, 2);
    expect(started[1]).toBe(2);
  });
});

describe('multi-out buffers', () => {
  /** A context that records its buffers: channels, length, and every start. */
  function recordingCtx() {
    const buffers: { channels: number; length: number; data: Float32Array[] }[] = [];
    const started: number[] = [];
    const ctx = {
      createBuffer: (channels: number, length: number, _sampleRate: number) => {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        buffers.push({ channels, length, data });
        return { getChannelData: (index: number) => data[index]! };
      },
      createBufferSource: () => ({
        connect() {},
        start: (at: number) => started.push(at),
      }),
    } as unknown as BaseAudioContext;
    return { ctx, buffers, started };
  }

  it('holds one channel per bus and pads the short with silence', () => {
    const base = supersaw();
    const kit = {
      manifest: { ...base.manifest, outs: ['thump', 'click'] },
      renderNote: () => [new Float32Array([0.5, 0.5, 0.5, 0.5]), new Float32Array([0.25, 0.25])],
    };
    const { ctx, buffers, started } = recordingCtx();
    const out = renderPluginBuffer(ctx, kit, pluginEventFor(0, 0, 69, 100, 1), 22050, 1);
    expect(out).not.toBeNull();
    expect(buffers).toHaveLength(1);
    expect(buffers[0]!.channels).toBe(2);
    expect(buffers[0]!.length).toBe(4);
    expect(Array.from(buffers[0]!.data[0]!)).toEqual([0.5, 0.5, 0.5, 0.5]);
    // The short bus plays its two samples, then the zeroed tail.
    expect(Array.from(buffers[0]!.data[1]!)).toEqual([0.25, 0.25, 0, 0]);
    expect(started).toEqual([1]);
  });

  it('keeps a mono render on exactly the old single-channel path', () => {
    const { ctx, buffers, started } = recordingCtx();
    const out = renderPluginBuffer(ctx, supersaw(), pluginEventFor(0, 0, 69, 100, 1), 22050, 1);
    expect(out).not.toBeNull();
    expect(buffers[0]!.channels).toBe(1);
    expect(started).toEqual([1]);
  });

  it('falls back when the main bus is empty, however many buses follow', () => {
    const base = supersaw();
    const empty = { manifest: base.manifest, renderNote: () => [new Float32Array(0), new Float32Array([1])] };
    const { ctx, buffers } = recordingCtx();
    expect(renderPluginBuffer(ctx, empty, pluginEventFor(0, 0, 69, 100, 1), 22050, 0)).toBeNull();
    expect(buffers).toHaveLength(0);
  });

  it('isolates one bus as a mono buffer for a per-out stem', () => {
    const base = supersaw();
    const kit = {
      manifest: { ...base.manifest, outs: ['thump', 'click'] },
      renderNote: () => [new Float32Array([0.5, 0.5, 0.5]), new Float32Array([0.25, 0.25])],
    };
    const { ctx, buffers, started } = recordingCtx();
    const out = renderPluginBuffer(ctx, kit, pluginEventFor(0, 0, 69, 100, 1), 22050, 1, undefined, [], 1);
    expect(out).not.toBeNull();
    expect(buffers).toHaveLength(1);
    expect(buffers[0]!.channels).toBe(1);
    expect(Array.from(buffers[0]!.data[0]!)).toEqual([0.25, 0.25]);
    expect(started).toEqual([1]);
    // A bus the render does not have is silence (null), never fallback: the
    // caller renders a stem, and a missing bus is an empty file.
    expect(renderPluginBuffer(ctx, kit, pluginEventFor(0, 0, 69, 100, 1), 22050, 1, undefined, [], 4)).toBeNull();
    expect(buffers).toHaveLength(1);
    // A fractional or negative bus is no bus either, not a rounded one: bus
    // numbers are exact, and a guess here would file the wrong stem.
    expect(renderPluginBuffer(ctx, kit, pluginEventFor(0, 0, 69, 100, 1), 22050, 1, undefined, [], 0.5)).toBeNull();
    expect(renderPluginBuffer(ctx, kit, pluginEventFor(0, 0, 69, 100, 1), 22050, 1, undefined, [], -1)).toBeNull();
    expect(buffers).toHaveLength(1);
  });
});

describe('the engine seats plugin voices like the sample bank', () => {
  it('resolves ids against the library once, with null as the fallback', () => {
    const engine = new AudioEngine();
    engine.setPluginVoices([null, SUPERSAW_ID, 'com.example.gone'], [supersaw()]);
    expect(engine.pluginVoiceBank).toEqual([null, supersaw(), null]);
  });

  it('forgets its plugins when the song changes', () => {
    const engine = new AudioEngine();
    engine.setPluginVoices([SUPERSAW_ID], [supersaw()]);
    engine.setPluginVoices([null], [supersaw()]);
    expect(engine.pluginVoiceBank).toEqual([null]);
  });
});
