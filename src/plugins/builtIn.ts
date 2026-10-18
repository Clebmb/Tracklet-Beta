/**
 * plugins/builtIn — the instruments that ship WITH Tracklet.
 *
 * Third-party plugins arrive through the loader (M2) from the user's own
 * library; these arrive through a static import, which is what puts their code
 * in the bundle — a dynamically imported path outside `src/` would work in
 * development and go missing in the built app. The sources of truth stay in
 * `examples/plugins/` (one folder per plugin, manifest plus module, ready to
 * copy), and this file is the thin seating: validated manifests plus their
 * render functions, as the engine and the exporter both take them.
 *
 * A manifest that fails validation here is a programmer error, so it throws
 * loudly rather than falling back: silent fallbacks are for songs written on
 * other machines, not for this build disagreeing with its own examples.
 */

import supersawManifestJson from '../../examples/plugins/supersaw/manifest.json';
import { renderNote as renderSupersaw } from '../../examples/plugins/supersaw/index';
import epPianoManifestJson from '../../examples/plugins/ep-piano/manifest.json';
import { renderNote as renderEpPiano } from '../../examples/plugins/ep-piano/index';
import acidBassManifestJson from '../../examples/plugins/acid-bass/manifest.json';
import { renderNote as renderAcidBass } from '../../examples/plugins/acid-bass/index';
import bitcrushManifestJson from '../../examples/plugins/bitcrush-plus/manifest.json';
import { processBlock as processBitcrush } from '../../examples/plugins/bitcrush-plus/index';
import euclidManifestJson from '../../examples/plugins/euclid-drums/manifest.json';
import { expand as expandEuclid } from '../../examples/plugins/euclid-drums/index';
import bassManifestJson from '../../examples/plugins/bass-follow/manifest.json';
import { expand as expandBass } from '../../examples/plugins/bass-follow/index';
import meterManifestJson from '../../examples/plugins/meter-panel/manifest.json';
import { mount as mountMeter } from '../../examples/plugins/meter-panel/index';
import { validatePluginManifest } from './manifest';
import type { EffectPlugin } from './effect';
import type { GeneratorPlugin } from './generator';
import type { InstrumentPlugin } from './instrument';
import type { PanelPlugin } from './panel';

function seated(manifestJson: unknown, renderNote: InstrumentPlugin['renderNote']): InstrumentPlugin {
  const checked = validatePluginManifest(manifestJson);
  if (!checked.ok) throw new Error(`built-in plugin is not a plugin: ${checked.error}`);
  return { manifest: checked.manifest, renderNote };
}

function seatedEffect(manifestJson: unknown, processBlock: EffectPlugin['processBlock']): EffectPlugin {
  const checked = validatePluginManifest(manifestJson);
  if (!checked.ok) throw new Error(`built-in plugin is not a plugin: ${checked.error}`);
  return { manifest: checked.manifest, processBlock };
}

/** Every instrument the app carries: what a channel's `plugin:<id>` can mean today. */
export const BUILT_IN_INSTRUMENTS: readonly InstrumentPlugin[] = [
  seated(supersawManifestJson, renderSupersaw),
  seated(epPianoManifestJson, renderEpPiano),
  seated(acidBassManifestJson, renderAcidBass),
];

/** The ids the app carries, for messages that list them. */
export function builtInPluginIds(): string {
  return BUILT_IN_INSTRUMENTS.map((plugin) => plugin.manifest.id).join(', ');
}

/** Every effect the app carries: what a channel's `fx` chain can name today. */
export const BUILT_IN_EFFECTS: readonly EffectPlugin[] = [
  seatedEffect(bitcrushManifestJson, processBitcrush),
];

/** The effect ids the app carries, for messages that list them. */
export function builtInEffectIds(): string {
  return BUILT_IN_EFFECTS.map((plugin) => plugin.manifest.id).join(', ');
}

function seatedGenerator(manifestJson: unknown, expand: GeneratorPlugin['expand']): GeneratorPlugin {
  const checked = validatePluginManifest(manifestJson);
  if (!checked.ok) throw new Error(`built-in plugin is not a plugin: ${checked.error}`);
  return { manifest: checked.manifest, mode: 'constructive', expand };
}

/** Every generator the app carries: what the `generate` word can name today. */
export const BUILT_IN_GENERATORS: readonly GeneratorPlugin[] = [
  seatedGenerator(euclidManifestJson, expandEuclid as unknown as GeneratorPlugin['expand']),
  seatedGenerator(bassManifestJson, expandBass as unknown as GeneratorPlugin['expand']),
];

/** The generator ids the app carries, for messages that list them. */
export function builtInGeneratorIds(): string {
  return BUILT_IN_GENERATORS.map((plugin) => plugin.manifest.id).join(', ');
}

function seatedPanel(manifestJson: unknown, mount: PanelPlugin['mount']): PanelPlugin {
  const checked = validatePluginManifest(manifestJson);
  if (!checked.ok) throw new Error(`built-in plugin is not a plugin: ${checked.error}`);
  return { manifest: checked.manifest, mount };
}

/** Every panel the app carries: what a `page plugin:<id>` line can mean today. */
export const BUILT_IN_PANELS: readonly PanelPlugin[] = [
  seatedPanel(meterManifestJson, mountMeter as unknown as PanelPlugin['mount']),
];

/** The panel ids the app carries, for messages that list them. */
export function builtInPanelIds(): string {
  return BUILT_IN_PANELS.map((plugin) => plugin.manifest.id).join(', ');
}
