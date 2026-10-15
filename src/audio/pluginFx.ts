/**
 * pluginFx — seating a plugin effect into the two clocks.
 *
 * Instruments render notes; effects process those renders. The live engine
 * (`engine.ts`) and the offline renderer (`render.ts`) both play plugin
 * notes, and both must answer the same two questions about a channel that
 * seats inserts: WHICH code processes them (resolved once, like the sample
 * bank — a name with no module behind it plays dry, never a failure), and HOW
 * its wet meets the dry (the host's `effectMix`, 0 = OFF).
 *
 * Everything here is pure: `applyTrackFx` is numbers in, samples out, called
 * identically on both clocks, which is the whole of the live == export
 * bargain. A slot that throws — or answers with something that is not
 * finite samples — is skipped and the dry survives: the fallback, never
 * silence.
 *
 * v1 scope, stated plainly: inserts process PLUGIN renders (the sample
 * buffers `renderPluginBuffer` holds). A built-in voice is a node graph, not
 * samples, so a seated chain on a channel with no plugin instrument is kept
 * in the song and the file but is inert until synth-to-buffer lands.
 */

import { defaultPluginParams, type PluginParamValues } from '../plugins/instrument';
import { effectMix, type EffectPlugin } from '../plugins/effect';
import type { TrackFx } from '../model/song';

/** One resolved insert: the code plus how wet it plays. */
export interface ResolvedTrackFx {
  plugin: EffectPlugin;
  amount: number;
}

/**
 * The effect behind one seated reference, or null (dry).
 *
 * A name the library does not hold — or holds disabled — resolves to null
 * rather than to a refusal, and the slot plays dry: the instrument fallback's
 * bargain one scope over.
 */
export function fxForSlot(
  id: string,
  plugins: readonly EffectPlugin[],
): EffectPlugin | null {
  const found = plugins.find((plugin) => plugin.manifest.id === id);
  return found ?? null;
}

/**
 * One chain per channel, index-aligned with the song's tracks — resolved once
 * per song rather than once per note, the way `resolveTrackPlugins` resolves
 * the instruments. A channel that seats none, or seats only names the library
 * does not hold, is an empty chain: dry, never a failure.
 */
export function resolveTrackFx(
  chains: readonly (readonly TrackFx[] | null | undefined)[],
  plugins: readonly EffectPlugin[],
): ResolvedTrackFx[][] {
  return chains.map((chain) => {
    if (!chain) return [];
    const out: ResolvedTrackFx[] = [];
    for (const slot of chain) {
      const plugin = fxForSlot(slot.id, plugins);
      if (plugin === null) continue;
      out.push({ plugin, amount: slot.amount });
    }
    return out;
  });
}

/** Whether the samples are finite numbers the host can play. */
function isPlayable(samples: Float32Array): boolean {
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i]!)) return false;
  }
  return true;
}

/**
 * Process a plugin render through a channel's inserts, in chain order.
 *
 * Each slot with an amount above 0 renders its wet through the effect's pure
 * `processBlock` (at manifest defaults — live knob values for effect params
 * are a later milestone) and mixes it over the dry with the host's
 * `effectMix`. A slot at 0 costs nothing; a slot that throws or answers with
 * non-finite samples is skipped and the dry survives.
 */
export function applyTrackFx(
  samples: Float32Array,
  chain: readonly ResolvedTrackFx[],
  sampleRate: number,
  values?: PluginParamValues,
): Float32Array {
  let dry = samples;
  for (const slot of chain) {
    if (slot.amount <= 0) continue;
    let wet: Float32Array;
    try {
      wet = slot.plugin.processBlock(dry, values ?? defaultPluginParams(slot.plugin.manifest), sampleRate);
    } catch {
      continue;
    }
    if (!(wet instanceof Float32Array) || wet.length === 0 || !isPlayable(wet)) continue;
    dry = effectMix(slot.amount, dry, wet);
  }
  return dry;
}
