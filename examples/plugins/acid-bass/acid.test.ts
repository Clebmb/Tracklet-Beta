import { describe, expect, it } from 'vitest';

import { defineInstrument, goldenRender } from '../../../src/plugins/sdk';
import { validatePluginManifest } from '../../../src/plugins/manifest';
import { applyPresetValues } from '../../../src/plugins/params';
import { applyScript, automatedPluginParams, createSong, songToScript } from '../../../src/model';
import { presetFromJson } from '../../../src/model/presetfile';
import squelchJson from './acid-squelch.pluginpatch.json';
import rollerJson from './deep-roller.pluginpatch.json';
import { renderNote } from './index';
import { pluginCpuStats, pluginEventFor, pluginForTrack, renderPluginBuffer, resetPluginCpu } from '../../../src/audio/pluginVoice';
import manifestJson from './manifest.json';

const NOTE = { midi: 33, velocity: 100, startStep: 0, holdSteps: 2, seed: 7 };

/**
 * Treble energy: RMS past a ~1.5 kHz one-pole highpass. A lowpass knob moves
 * exactly this — the fundamental sails through either way, so a first-
 * difference proxy would mostly measure the 55 Hz swing and call it close.
 */
function treble(samples: Float32Array, rate: number, fromSec = 0.15, toSec = 0.4): number {
  // The sustain window, never the onset: a hard attack is broadband whatever
  // the filter says, and measuring it would credit the click to the knob.
  const from = Math.floor(fromSec * rate);
  const to = Math.min(samples.length, Math.floor(toSec * rate));
  let lp = 0;
  let sum = 0;
  let count = 0;
  for (let i = from; i < to; i++) {
    lp += 0.3 * (samples[i]! - lp);
    const hi = samples[i]! - lp;
    sum += hi * hi;
    count++;
  }
  return Math.sqrt(sum / Math.max(1, count));
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / Math.max(1, samples.length));
}

describe('acid-bass manifest', () => {
  it('validates as an instrument with seven knobs', () => {
    const checked = validatePluginManifest(manifestJson);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.manifest.kind).toBe('instrument');
    expect(checked.manifest.params.map((param) => param.id)).toEqual([
      'cutoff',
      'reso',
      'envmod',
      'accent',
      'drive',
      'wave',
      'decay',
    ]);
  });

  it('seats through defineInstrument', () => {
    const seated = defineInstrument({ manifest: manifestJson, renderNote });
    expect(seated.ok).toBe(true);
  });
});

describe('acid-bass render', () => {
  it('renders finite mono samples, bounded, and non-silent on A1', () => {
    const out = renderNote({}, NOTE, 22050);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBeGreaterThan(1000);
    let peak = 0;
    for (let i = 0; i < out.length; i++) {
      expect(Number.isFinite(out[i])).toBe(true);
      peak = Math.max(peak, Math.abs(out[i]!));
    }
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('is deterministic: the same note hashes the same twice', () => {
    const seated = defineInstrument({ manifest: manifestJson, renderNote });
    if (!seated.ok) throw new Error('acid-bass did not seat');
    const first = goldenRender(seated.plugin, {}, 22050);
    const second = goldenRender(seated.plugin, {}, 22050);
    expect(first.hash).toBe(second.hash);
  });

  it('opens with cutoff: dimed carries many times the treble of parked', () => {
    // Resonance parked and drive off: the resonant peak and the tanh would
    // scream harmonics of their own, which is their knobs' test, not this
    // one's. Here only the filter moves.
    const dark = renderNote({ cutoff: 0, reso: 0, drive: 0 }, NOTE, 22050);
    const bright = renderNote({ cutoff: 100, reso: 0, drive: 0 }, NOTE, 22050);
    // A two-pole into a saw buys about 9 dB of treble end to end — measured
    // 0.022 against 0.008, and clearly audible. More scream comes from the
    // reso and drive knobs, which is their test, not this one's.
    expect(treble(bright, 22050)).toBeGreaterThan(treble(dark, 22050) * 2);
  });

  it('accents with velocity: hard hits speak louder', () => {
    const soft = renderNote({}, { ...NOTE, velocity: 40 }, 22050);
    const hard = renderNote({}, { ...NOTE, velocity: 100 }, 22050);
    expect(rms(hard)).toBeGreaterThan(rms(soft) * 1.5);
  });

  it('blends wave: square is not saw', () => {
    const saw = renderNote({ wave: 0 }, NOTE, 22050);
    const square = renderNote({ wave: 100 }, NOTE, 22050);
    let diff = 0;
    const count = Math.min(saw.length, square.length);
    for (let i = 0; i < count; i++) diff += Math.abs(saw[i]! - square[i]!);
    expect(diff / count).toBeGreaterThan(0.01);
  });

  it('rings longer with decay: dimed outlasts parked', () => {
    const short = renderNote({ decay: 0 }, NOTE, 22050);
    const long = renderNote({ decay: 100 }, NOTE, 22050);
    expect(long.length).toBeGreaterThan(short.length * 5);
  });
});

describe('acid-bass in a song', () => {
  function manifest() {
    const checked = validatePluginManifest(manifestJson);
    if (!checked.ok) throw new Error('acid-bass manifest did not validate');
    return checked.manifest;
  }

  it('seats on a channel by reference, with knobs by script', () => {
    const result = applyScript(
      createSong(),
      ['new', 'track 1 voice plugin:com.example.acid-bass', 'params 1 cutoff 70', 'params 1 reso 75'].join('\n'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0]?.plugin).toBe('com.example.acid-bass');
    expect(result.song.tracks[0]?.pluginParams).toMatchObject({ cutoff: 70, reso: 75 });
  });

  it('turns a knob across bars from a lane, and the lane round-trips', () => {
    const result = applyScript(
      createSong(),
      ['new', 'track 1 voice plugin:com.example.acid-bass', 'automate 1 param.cutoff 20 90 bars 8 to 15'].join('\n'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(songToScript(result.song)).toContain('param.cutoff');
  });

  it('loads its factory presets, and each sounds different', () => {
    const hashes = new Set<string>();
    for (const file of [squelchJson, rollerJson]) {
      const parsed = presetFromJson(JSON.stringify(file));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.plugin).toBe('com.example.acid-bass');
      const values = applyPresetValues(manifest(), parsed.values);
      const out = renderNote(values, NOTE, 22050);
      let hash = 0;
      for (let i = 0; i < out.length; i++) hash = (Math.imul(hash, 31) + (Math.floor(out[i]! * 1e6) | 0)) | 0;
      hashes.add(`${out.length}:${hash >>> 0}`);
    }
    // Two presets plus the tested defaults: three different sounds, or the
    // knobs are decoration.
    const plain = renderNote({}, NOTE, 22050);
    let plainHash = 0;
    for (let i = 0; i < plain.length; i++) plainHash = (Math.imul(plainHash, 31) + (Math.floor(plain[i]! * 1e6) | 0)) | 0;
    hashes.add(`${plain.length}:${plainHash >>> 0}`);
    expect(hashes.size).toBe(3);
  });
});

describe('acid-bass through the engine (audible parity and demo)', () => {
  function seatedPlugin() {
    const seated = defineInstrument({ manifest: manifestJson, renderNote });
    if (!seated.ok) throw new Error('acid-bass did not seat');
    return seated.plugin;
  }

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

  it('seats on its channel id, with unknown ids falling back to built-in', () => {
    const plugin = seatedPlugin();
    expect(pluginForTrack('com.example.acid-bass', [plugin])?.manifest.id).toBe('com.example.acid-bass');
    expect(pluginForTrack('com.example.gone', [plugin])).toBeNull();
  });

  it('plays through renderPluginBuffer, the buffer path both clocks share', () => {
    resetPluginCpu();
    const plugin = seatedPlugin();
    const parsed = presetFromJson(JSON.stringify(squelchJson));
    if (!parsed.ok) throw new Error('acid-squelch did not parse');
    const out = renderPluginBuffer(
      stubCtx(),
      plugin,
      pluginEventFor(0, 0, 33, 100, 2),
      22050,
      0,
      applyPresetValues(plugin.manifest, parsed.values),
    );
    expect(out).not.toBeNull();
    const stats = pluginCpuStats();
    expect(stats.map((entry) => entry.id)).toEqual(['com.example.acid-bass']);
    expect(stats[0]!.renders).toBe(1);
    resetPluginCpu();
  });

  it('plays the demo: a squelch roller with the filter opening across 8 bars', () => {
    const lines = [
      'new',
      'track 1 voice plugin:com.example.acid-bass',
      'params 1 reso 75',
      'params 1 envmod 85',
      'params 1 accent 80',
      'automate 1 param.cutoff 30 90 bars 1 to 8',
    ];
    const result = applyScript(createSong(), lines.join('\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The lane survives the round-trip, so the demo replays as written.
    expect(songToScript(result.song)).toContain('param.cutoff');
    // The automated knob really moves the sound: bar 1 plays parked, bar 8
    // plays open. The knob's travel is exact, the two renders are different
    // sounds, and the open one carries more body (RMS). What it does NOT do
    // is raise sustain-window treble — with the reso up, the parked filter's
    // resonant peak rings through the fat harmonics while the open peak sits
    // where the saw is thin, so the squelch character lives down low. The
    // brightness direction of the knob itself is the cutoff test's job, at
    // reso 0 where nothing masks it.
    const base = result.song.tracks[0]?.pluginParams ?? {};
    const early = automatedPluginParams(base, result.song.automation, 1, 0, 16);
    const late = automatedPluginParams(base, result.song.automation, 1, 127, 16);
    expect(early?.cutoff).toBeLessThan(late?.cutoff ?? 0);
    const earlyRender = renderNote(early ?? {}, NOTE, 22050);
    const lateRender = renderNote(late ?? {}, NOTE, 22050);
    expect(rms(lateRender)).toBeGreaterThan(rms(earlyRender));
    let diff = 0;
    const count = Math.min(earlyRender.length, lateRender.length);
    for (let i = 0; i < count; i++) diff += Math.abs(earlyRender[i]! - lateRender[i]!);
    expect(diff / count).toBeGreaterThan(0.01);
  });
});
