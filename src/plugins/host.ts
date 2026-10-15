/**
 * plugins/host — what a plugin is ALLOWED to touch, and nothing else.
 *
 * A plugin never reaches for globals directly: no `fetch`, no
 * `localStorage`, no DOM outside its own panel element. The host passes a
 * `PluginHost` instead, which is capabilities, not access — a seeded RNG for
 * the deterministic audio path, a namespaced logger, and whatever permissions
 * the manifest declared and the user granted. Audio-path code stays pure:
 * `(params, note, time) => sound`, with no async, no I/O, no randomness
 * except through the seed the host provides. That purity is what keeps the
 * live engine and the offline renderer identical (the `synth.ts` bargain:
 * one code path, two clocks).
 *
 * Phaser-free and DOM-free, so it is unit tested on its own.
 */

import { HOST_API_VERSION, type TrackletPluginManifest } from './manifest';

/** A loaded plugin: its validated manifest plus its runtime state. */
export interface LoadedPlugin {
  manifest: TrackletPluginManifest;
  enabled: boolean;
}

/**
 * The host surface a plugin receives. Small on purpose: every capability here
 * is auditable, and anything not here is not available.
 */
export interface PluginHost {
  /** This build's host API version (today: 1). */
  apiVersion: number;
  /** Deterministic float in [0, 1): same seed, same sequence, every machine. */
  random(): number;
  /** Scoped log line, prefixed with the plugin id by the host. */
  log(message: string): void;
}

/**
 * Negotiate the API version: a plugin targeting an older host keeps working,
 * one asking for a newer host than this build is refused in words.
 */
export function negotiateApiVersion(wanted: number): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(wanted) || wanted < 1) {
    return { ok: false, error: `apiVersion ${String(wanted)} is not a positive whole number. Target 1-${HOST_API_VERSION}.` };
  }
  if (wanted > HOST_API_VERSION) {
    return {
      ok: false,
      error: `this plugin wants host API ${wanted}, but Tracklet speaks 1-${HOST_API_VERSION}. Update Tracklet.`,
    };
  }
  return { ok: true };
}

/**
 * A tiny seeded RNG (mulberry32): the ONLY randomness the audio path may use.
 *
 * `Math.random()` in DSP is a broken render waiting to happen — the export
 * would differ from the performance. A host-seeded generator makes the same
 * song + same plugin versions sound identical everywhere, which is the
 * determinism principle from the roadmap.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed: number = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the host surface for one plugin instance: seeded RNG plus a log
 * collector the host can route to its notice channel.
 */
export function makePluginHost(pluginId: string, seed: number, onLog?: (line: string) => void): PluginHost {
  const random = seededRandom(seed);
  return {
    apiVersion: HOST_API_VERSION,
    random,
    log(message: string): void {
      onLog?.(`[${pluginId}] ${message}`);
    },
  };
}
