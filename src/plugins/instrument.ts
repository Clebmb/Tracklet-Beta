/**
 * plugins/instrument — what a virtual instrument IS, before it makes a sound.
 *
 * An instrument plugin renders notes. Its whole contract is one pure function:
 *
 *   renderNote(params, note, sampleRate) -> Float32Array | Float32Array[]
 *   (mono samples, or one bus per output — bus 0 is the main)
 *
 * Pure means no AudioContext, no nodes, no async, no `Math.random()` — the
 * note's variation comes from `note.seed` through the host's seeded RNG. That
 * purity is the entire live == export bargain: the live engine will wrap these
 * samples in a buffer source on the audio clock, and the offline renderer will
 * call the same function on the export clock, so a song cannot sound different
 * on export. A plugin that needs the context (convolver, custom worklet) is a
 * later milestone, not this one.
 *
 * This module is Phaser-free and DOM-free (like everything it sits beside), so
 * the contract is unit tested with real renders: the proof instruments render
 * short buffers here and the tests pin their shape and determinism.
 *
 * Seating a plugin onto a channel — the `track … voice plugin:<id>` spelling,
 * the song-file rung, the engine wiring — is the NEXT generation. What lands
 * here is the reference a track will hold (`plugin:<id>`), how it parses, and
 * how a missing or disabled plugin resolves to a built-in voice with a notice
 * (the soundfont/sample bargain: fallback with words, never silence).
 */

import { seededRandom } from './host';
import type { TrackletPluginManifest } from './manifest';

/** What a channel sounds like when it names a plugin: `plugin:<id>`. */
export const PLUGIN_VOICE_PREFIX = 'plugin:';

/** The param values a render receives: every number 0–100, clamped by the host. */
export type PluginParamValues = Record<string, number>;

/**
 * One note to render: MIDI pitch (12–119, the Tracklet range), velocity
 * 0–100 (NOT 0–1), the starting step (rows count from 0), how many steps it
 * rings for, and a seed — the ONLY randomness the render may use.
 */
export interface PluginNoteEvent {
  midi: number;
  velocity: number;
  startStep: number;
  holdSteps: number;
  seed: number;
}

/**
 * What one `renderNote` call hands back: one mono bus, or one array per
 * output bus (a drum kit's kick, snare and hat as separate stems-to-be).
 *
 * Bus 0 is the MAIN — the mix a mono host would have heard — and every bus
 * is row-major samples at `sampleRate` from the note's attack. Buses may be
 * shorter than the main (a hat rings less than a kick); the host pads the
 * short with silence, so a plugin never interleaves or length-matches by
 * hand. A single `Float32Array` is one bus, the shape every proof already
 * returns.
 */
export type PluginRenderOut = Float32Array | Float32Array[];

/**
 * The buses of a render, longest-first: bus 0 is the main, the rest are the
 * separated outs in manifest `outs` order (or `out1..N` when undeclared).
 *
 * Lenient on purpose, the stored-library policy one scope over: a bare
 * `Float32Array` is one bus, an empty array is no buses (the host falls back
 * to the built-in voice, the way it does for an empty mono render), and a
 * non-array stranger is one bad bus rather than a throw — the note still
 * falls back, and the song still plays.
 */
export function renderOutBuses(rendered: unknown): Float32Array[] {
  if (rendered instanceof Float32Array) return [rendered];
  if (!Array.isArray(rendered)) return [];
  return rendered.filter((bus): bus is Float32Array => bus instanceof Float32Array);
}

/**
 * A virtual instrument: its manifest plus the one pure render.
 *
 * `renderNote` returns row-major samples at `sampleRate`, starting at the
 * note's attack — mono, or one bus per output. It must be deterministic
 * (same inputs, same samples), finite-valued, and roughly bounded to ±1 —
 * the host applies level, pan, sends and effects downstream, exactly where a
 * built-in voice would sit.
 */
export interface InstrumentPlugin {
  manifest: TrackletPluginManifest;
  renderNote(params: PluginParamValues, note: PluginNoteEvent, sampleRate: number): PluginRenderOut;
}

/** The reference a track holds for a plugin voice, e.g. `plugin:com.example.supersaw`. */
export function pluginVoiceRef(id: string): string {
  return `${PLUGIN_VOICE_PREFIX}${id}`;
}

/** Whether this voice word names a plugin rather than a built-in. */
export function isPluginVoiceRef(value: string): boolean {
  return value.startsWith(PLUGIN_VOICE_PREFIX);
}

/**
 * The plugin id inside a `plugin:<id>` reference, or null when the word is
 * not a well-formed reference (missing id, whitespace, a second prefix).
 * Null is not an error here — it means "not a plugin word", and the caller
 * keeps reading the word as a built-in voice.
 */
export function parsePluginVoiceRef(value: string): string | null {
  if (!value.startsWith(PLUGIN_VOICE_PREFIX)) return null;
  const id = value.slice(PLUGIN_VOICE_PREFIX.length).trim();
  if (id === '' || /\s/.test(id) || id.includes(PLUGIN_VOICE_PREFIX)) return null;
  return id;
}

/**
 * Who plays a plugin reference right now: the plugin when it is registered
 * AND enabled, otherwise the built-in fallback — with the notice line the app
 * shows so the substitution is said in words, never silent.
 */
export function resolvePluginVoice(
  ref: string,
  known: readonly { id: string; enabled: boolean }[],
): { kind: 'plugin'; id: string } | { kind: 'builtin-fallback'; id: string; notice: string } {
  const id = parsePluginVoiceRef(ref) ?? ref;
  const entry = known.find((plugin) => plugin.id === id);
  if (entry !== undefined && entry.enabled) return { kind: 'plugin', id };
  if (entry !== undefined) {
    return { kind: 'builtin-fallback', id, notice: `plugin "${id}" is disabled - this channel plays the built-in voice until it is enabled.` };
  }
  return { kind: 'builtin-fallback', id, notice: `plugin "${id}" is not installed - this channel plays the built-in voice until it is.` };
}

/**
 * The param values a plugin plays at before anyone presets or automates it:
 * every declared knob at its own default. The host owns live values from M6;
 * until then, defaults are the sound — which is why a default is a musical
 * choice rather than a midpoint.
 */
export function defaultPluginParams(manifest: TrackletPluginManifest): PluginParamValues {
  const values: PluginParamValues = {};
  for (const param of manifest.params) values[param.id] = param.default;
  return values;
}

/**
 * The seed for one note occurrence: track, step and pitch folded into one
 * stable number, so the same song renders the same stream everywhere — and a
 * preview (no step) still varies by pitch rather than repeating one phase.
 */
export function pluginNoteSeed(track: number, step: number | null, midi: number): number {
  const at = step === null ? 0 : step;
  return ((track * 31 + at * 7 + midi * 13) >>> 0) || 1;
}

/** The frequency of a MIDI pitch, so proof instruments share one tuning. */
export function pluginMidiHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * A deterministic per-note RNG: the seeded stream a render may draw from for
 * round-robin-style variation. Same seed, same stream — the `hitShift`
 * bargain from `model/variation.ts`, handed to plugins.
 */
export function pluginNoteRandom(seed: number): () => number {
  return seededRandom(seed);
}
