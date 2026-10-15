/**
 * plugins/sdk — what a third party imports to build an instrument.
 *
 * One helper to define one (`defineInstrument`), one check that a loaded
 * module is what its manifest claims (`checkInstrumentModule`), and one
 * harness that proves a render is deterministic (`goldenRender`). The example
 * plugins are written against this shape (structural types, so the examples
 * stay self-contained), and the M2 SDK package will re-export exactly these
 * three — no new API to learn when it lands.
 *
 * Phaser-free and DOM-free, so the whole SDK is unit tested on its own.
 */

import { validatePluginManifest, type TrackletPluginManifest } from './manifest';
import { renderOutBuses, type InstrumentPlugin, type PluginNoteEvent, type PluginParamValues } from './instrument';
import type { EffectPlugin } from './effect';
import type { GeneratorMode, GeneratorPlugin } from './generator';
import type { PanelPlugin } from './panel';

/** The module shape an instrument entry point must export. */
export interface InstrumentModule {
  manifest: unknown;
  renderNote: unknown;
}

/**
 * Define an instrument: validate the manifest, check the render function, and
 * seat the pair. A manifest problem or a missing render is a named error —
 * parse before apply, the same rule as the script language.
 */
export function defineInstrument(module: InstrumentModule): { ok: true; plugin: InstrumentPlugin } | { ok: false; error: string } {
  const checked = validatePluginManifest(module.manifest);
  if (!checked.ok) return { ok: false, error: checked.error };
  if (checked.manifest.kind !== 'instrument') {
    return { ok: false, error: `plugin "${checked.manifest.id}" is a ${checked.manifest.kind}, not an instrument. defineInstrument seats instruments; effects, generators, panels and io arrive in later milestones.` };
  }
  if (typeof module.renderNote !== 'function') {
    return { ok: false, error: `plugin "${checked.manifest.id}" exports no renderNote function. Export renderNote(params, note, sampleRate) returning a Float32Array (or one per output bus).` };
  }
  return { ok: true, plugin: { manifest: checked.manifest, renderNote: module.renderNote as InstrumentPlugin['renderNote'] } };
}

/**
 * Check that an already-imported module matches its manifest, without seating
 * it: the install-time gate the loader calls before trusting code. Returns the
 * reason it cannot be trusted, or null when it can.
 */
export function checkInstrumentModule(manifest: TrackletPluginManifest, module: Record<string, unknown>): string | null {
  if (typeof module.renderNote !== 'function') {
    return `plugin "${manifest.id}" loaded but exports no renderNote function. The entry module must export renderNote(params, note, sampleRate).`;
  }
  return null;
}

/** The module shape an effect entry point must export. */
export interface EffectModule {
  manifest: unknown;
  processBlock: unknown;
}

/**
 * Define an effect: validate the manifest, check the block processor, and seat
 * the pair. A manifest problem or a missing processor is a named error —
 * parse before apply, the same rule as the script language.
 */
export function defineEffect(module: EffectModule): { ok: true; plugin: EffectPlugin } | { ok: false; error: string } {
  const checked = validatePluginManifest(module.manifest);
  if (!checked.ok) return { ok: false, error: checked.error };
  if (checked.manifest.kind !== 'effect') {
    return { ok: false, error: `plugin "${checked.manifest.id}" is a ${checked.manifest.kind}, not an effect. defineEffect seats effects; instruments, generators, panels and io arrive in their own milestones.` };
  }
  if (typeof module.processBlock !== 'function') {
    return { ok: false, error: `plugin "${checked.manifest.id}" exports no processBlock function. Export processBlock(input, params, sampleRate) returning a Float32Array.` };
  }
  return { ok: true, plugin: { manifest: checked.manifest, processBlock: module.processBlock as EffectPlugin['processBlock'] } };
}

/**
 * Check that an already-imported module matches its manifest, without seating
 * it: the install-time gate the loader calls before trusting code. Returns the
 * reason it cannot be trusted, or null when it can.
 */
export function checkEffectModule(manifest: TrackletPluginManifest, module: Record<string, unknown>): string | null {
  if (typeof module.processBlock !== 'function') {
    return `plugin "${manifest.id}" loaded but exports no processBlock function. The entry module must export processBlock(input, params, sampleRate).`;
  }
  return null;
}

/** The module shape a generator entry point must export. */
export interface GeneratorModule {
  manifest: unknown;
  expand: unknown;
  mode?: unknown;
}

/**
 * Define a generator: validate the manifest, check the expansion, and seat
 * the trio. A manifest problem, a missing expansion, or an interpretive mode
 * is a named error — parse before apply, the same rule as the script language.
 */
export function defineGenerator(module: GeneratorModule): { ok: true; plugin: GeneratorPlugin } | { ok: false; error: string } {
  const checked = validatePluginManifest(module.manifest);
  if (!checked.ok) return { ok: false, error: checked.error };
  if (checked.manifest.kind !== 'generator') {
    return { ok: false, error: `plugin "${checked.manifest.id}" is a ${checked.manifest.kind}, not a generator. defineGenerator seats generators; instruments, effects, panels and io arrive in their own milestones.` };
  }
  if (typeof module.expand !== 'function') {
    return { ok: false, error: `plugin "${checked.manifest.id}" exports no expand function. Export expand(input, params, seed) returning edits.` };
  }
  const mode = module.mode ?? 'constructive';
  if (mode !== 'constructive') {
    return { ok: false, error: `plugin "${checked.manifest.id}" is interpretive, which this build does not seat yet. Ship a constructive generator — one that writes cells — instead.` };
  }
  const pluginMode: GeneratorMode = 'constructive';
  return { ok: true, plugin: { manifest: checked.manifest, mode: pluginMode, expand: module.expand as GeneratorPlugin['expand'] } };
}

/**
 * Check that an already-imported module matches its manifest, without seating
 * it: the install-time gate the loader calls before trusting code. Returns the
 * reason it cannot be trusted, or null when it can.
 */
export function checkGeneratorModule(manifest: TrackletPluginManifest, module: Record<string, unknown>): string | null {
  if (typeof module.expand !== 'function') {
    return `plugin "${manifest.id}" loaded but exports no expand function. The entry module must export expand(input, params, seed).`;
  }
  return null;
}

/** The module shape a panel entry point must export. */
export interface PanelModule {
  manifest: unknown;
  mount: unknown;
}

/**
 * Define a panel: validate the manifest, check the mount, and seat the pair.
 * A manifest problem or a missing mount is a named error — parse before
 * apply, the same rule as the script language.
 */
export function definePanel(module: PanelModule): { ok: true; plugin: PanelPlugin } | { ok: false; error: string } {
  const checked = validatePluginManifest(module.manifest);
  if (!checked.ok) return { ok: false, error: checked.error };
  if (checked.manifest.kind !== 'panel') {
    return { ok: false, error: `plugin "${checked.manifest.id}" is a ${checked.manifest.kind}, not a panel. definePanel seats panels; instruments, effects, generators and io arrive in their own milestones.` };
  }
  if (typeof module.mount !== 'function') {
    return { ok: false, error: `plugin "${checked.manifest.id}" exports no mount function. Export mount(el, api) returning { unmount, update? }.` };
  }
  return { ok: true, plugin: { manifest: checked.manifest, mount: module.mount as PanelPlugin['mount'] } };
}

/**
 * Check that an already-imported module matches its manifest, without seating
 * it: the install-time gate the loader calls before trusting code. Returns the
 * reason it cannot be trusted, or null when it can.
 */
export function checkPanelModule(manifest: TrackletPluginManifest, module: Record<string, unknown>): string | null {
  if (typeof module.mount !== 'function') {
    return `panel "${manifest.id}" loaded but exports no mount function. The entry module must export mount(el, api).`;
  }
  return null;
}

/** One fixed note the golden harness renders: A4, full force, first step. */
export const GOLDEN_NOTE: PluginNoteEvent = { midi: 69, velocity: 100, startStep: 0, holdSteps: 1, seed: 1 };

/**
 * Render the golden note and hash the samples: the `golden.test.ts` pattern
 * for third parties. The SAME plugin must produce the SAME hash on every
 * machine — a hash that moves is a broken render (unseeded randomness, clock
 * reads, allocation-order dependence), caught here rather than in a mix.
 *
 * Mono renders hash exactly as they always have (`golden:<len>:<hex>` — the
 * shape pinned goldens keep); multi-out renders hash bus by bus, lengths
 * included, so a bus that moves or swaps cannot hide behind its neighbour.
 */
export function goldenRender(
  plugin: InstrumentPlugin,
  params: PluginParamValues = {},
  sampleRate = 22050,
): { samples: Float32Array; hash: string } {
  const rendered = plugin.renderNote({ ...params }, { ...GOLDEN_NOTE }, sampleRate);
  const buses = renderOutBuses(rendered);
  const samples = buses[0] ?? new Float32Array(0);
  let hash = 0;
  const mixBus = (bus: Float32Array): void => {
    hash = (Math.imul(hash, 31) + bus.length) | 0;
    for (let i = 0; i < bus.length; i++) {
      hash = (Math.imul(hash, 31) + (Math.floor(bus[i]! * 1e6) | 0)) | 0;
    }
  };
  if (buses.length <= 1) {
    for (let i = 0; i < samples.length; i++) {
      hash = (Math.imul(hash, 31) + (Math.floor(samples[i]! * 1e6) | 0)) | 0;
    }
    return { samples, hash: `golden:${samples.length}:${(hash >>> 0).toString(16)}` };
  }
  for (const bus of buses) mixBus(bus);
  return { samples, hash: `golden:${buses.length}bus:${(hash >>> 0).toString(16)}` };
}
