/**
 * plugins/loader — trusting code, in one audited place.
 *
 * Installing a plugin means executing somebody's module, so the trust decision
 * lives HERE and nowhere else: `seatInstrumentModule` takes a manifest plus an
 * already-imported module namespace, validates both halves, and either seats
 * the instrument or refuses it with one named error. Fetching the bytes —
 * from a local folder, a `.tracklet-plugin` zip, or a user-approved URL — is
 * the caller's business (a file picker, an explicit install button); this
 * module never touches the network, the DOM, or storage, so it is unit tested
 * with plain objects.
 *
 * The v1 trust rules, stated plainly:
 *
 *   • BUNDLED plugins (`builtIn.ts`) are the app's own code: validated loudly
 *     at import, throwing on programmer error.
 *   • INSTALLED plugins pass through here: manifest validated, module shape
 *     checked, kind must be `instrument` (other kinds are refused with the
 *     milestone that seats them, not with a crash).
 *   • A seated plugin gets capabilities, not globals: the host passes a
 *     `PluginHost` (seeded RNG, scoped log), and audio-path code must stay
 *     pure — enforced by types, review, and the golden harness, not by VM
 *     isolation. v1 is honest about that boundary rather than pretending a
 *     sandbox exists.
 *
 * No silent auto-update: a song pins `id@major.minor`, and seating a newer
 * minor is an upgrade the registry records, never a background swap.
 */

import { checkEffectModule, checkGeneratorModule, checkInstrumentModule, checkPanelModule, defineEffect, defineGenerator, defineInstrument, definePanel } from './sdk';
import type { EffectPlugin } from './effect';
import type { GeneratorPlugin } from './generator';
import type { InstrumentPlugin } from './instrument';
import type { PanelPlugin } from './panel';

/** A seated third-party instrument, ready for `setPluginVoices` and the exporter. */
export interface SeatedPlugin {
  plugin: InstrumentPlugin;
  /** Whether the module needed no warnings to seat. v1 always true; kept for the permission grants M5 adds. */
  trusted: boolean;
}

/** A seated third-party effect, ready for `setPluginFx` and the exporter. */
export interface SeatedEffect {
  plugin: EffectPlugin;
  /** Whether the module needed no warnings to seat. v1 always true; kept for the permission grants M5 adds. */
  trusted: boolean;
}

/**
 * Seat an instrument module beside its manifest: validate, check, seat — or
 * refuse with the one named reason. The module is already imported by the
 * caller (dynamic `import()` of a user-approved path); this function decides
 * whether the app trusts what arrived.
 */
export function seatInstrumentModule(
  manifestJson: unknown,
  module: Record<string, unknown>,
): { ok: true; seated: SeatedPlugin } | { ok: false; error: string } {
  const defined = defineInstrument({ manifest: manifestJson, renderNote: module.renderNote });
  if (!defined.ok) return { ok: false, error: defined.error };
  const problem = checkInstrumentModule(defined.plugin.manifest, module);
  if (problem !== null) return { ok: false, error: problem };
  return { ok: true, seated: { plugin: defined.plugin, trusted: true } };
}

/** A seated third-party generator, ready for `generator.generate` and the script word. */
export interface SeatedGenerator {
  plugin: GeneratorPlugin;
  /** Whether the module needed no warnings to seat. v1 always true; kept for the permission grants M5 adds. */
  trusted: boolean;
}

/**
 * Seat a generator module beside its manifest: validate, check, seat — or
 * refuse with the one named reason. The module is already imported by the
 * caller (dynamic `import()` of a user-approved path); this function decides
 * whether the app trusts what arrived.
 */
export function seatGeneratorModule(
  manifestJson: unknown,
  module: Record<string, unknown>,
): { ok: true; seated: SeatedGenerator } | { ok: false; error: string } {
  const defined = defineGenerator({ manifest: manifestJson, expand: module.expand, mode: module.mode });
  if (!defined.ok) return { ok: false, error: defined.error };
  const problem = checkGeneratorModule(defined.plugin.manifest, module);
  if (problem !== null) return { ok: false, error: problem };
  return { ok: true, seated: { plugin: defined.plugin, trusted: true } };
}

/** A seated third-party panel, ready for `page plugin:<id>`. */
export interface SeatedPanel {
  plugin: PanelPlugin;
  /** Whether the module needed no warnings to seat. v1 always true; kept for the permission grants M5 adds. */
  trusted: boolean;
}

/**
 * Seat a panel module beside its manifest: validate, check, seat — or refuse
 * with the one named reason. The module is already imported by the caller
 * (dynamic `import()` of a user-approved path); this function decides whether
 * the app trusts what arrived.
 */
export function seatPanelModule(
  manifestJson: unknown,
  module: Record<string, unknown>,
): { ok: true; seated: SeatedPanel } | { ok: false; error: string } {
  const defined = definePanel({ manifest: manifestJson, mount: module.mount });
  if (!defined.ok) return { ok: false, error: defined.error };
  const problem = checkPanelModule(defined.plugin.manifest, module);
  if (problem !== null) return { ok: false, error: problem };
  return { ok: true, seated: { plugin: defined.plugin, trusted: true } };
}

/**
 * Seat an effect module beside its manifest: validate, check, seat — or
 * refuse with the one named reason. The module is already imported by the
 * caller (dynamic `import()` of a user-approved path); this function decides
 * whether the app trusts what arrived.
 */
export function seatEffectModule(
  manifestJson: unknown,
  module: Record<string, unknown>,
): { ok: true; seated: SeatedEffect } | { ok: false; error: string } {
  const defined = defineEffect({ manifest: manifestJson, processBlock: module.processBlock });
  if (!defined.ok) return { ok: false, error: defined.error };
  const problem = checkEffectModule(defined.plugin.manifest, module);
  if (problem !== null) return { ok: false, error: problem };
  return { ok: true, seated: { plugin: defined.plugin, trusted: true } };
}
