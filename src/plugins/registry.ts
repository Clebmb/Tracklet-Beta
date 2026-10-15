/**
 * plugins/registry — the list of plugins this session knows, and whether
 * each one may run.
 *
 * Two halves, kept separate the way the voice/kit libraries keep them: this
 * file is the IN-MEMORY list (register, unregister, enable, disable, lookup),
 * and `src/pluginLibrary.ts` is the persistence bridge to one `localStorage`
 * key. The registry never touches storage itself, so it is unit tested with
 * plain objects and no DOM.
 *
 * Registration VALIDATES first (the manifest module's strict check) and only
 * then stores — parse before apply, so a corrupt manifest means zero effect
 * plus one named error. A crashing or misbehaving plugin is disabled, never
 * removed: disabling keeps its song references intact so re-enabling restores
 * the song as written.
 */

import { validatePluginManifest, type TrackletPluginManifest } from './manifest';

/** One entry: the validated manifest plus whether it may run. */
export interface RegistryEntry {
  manifest: TrackletPluginManifest;
  enabled: boolean;
}

/** The empty registry. Registries are plain arrays; functions below copy. */
export function createRegistry(): RegistryEntry[] {
  return [];
}

/**
 * Register a plugin from an untrusted manifest object.
 *
 * Returns the new registry plus the entry on success, or the UNCHANGED
 * registry plus the manifest's named error on failure. Registering an id
 * that is already known replaces its manifest (an upgrade) but keeps its
 * enabled flag.
 */
export function registerPlugin(
  registry: readonly RegistryEntry[],
  raw: unknown,
): { registry: RegistryEntry[]; entry: RegistryEntry } | { registry: readonly RegistryEntry[]; error: string } {
  const checked = validatePluginManifest(raw);
  if (!checked.ok) return { registry, error: checked.error };
  const kept = registry.filter((entry) => entry.manifest.id !== checked.manifest.id);
  const previous = registry.find((entry) => entry.manifest.id === checked.manifest.id);
  const entry: RegistryEntry = { manifest: checked.manifest, enabled: previous?.enabled ?? true };
  return { registry: [...kept, entry], entry };
}

/** Forget a plugin. Unknown ids are a no-op returning a copy. */
export function unregisterPlugin(registry: readonly RegistryEntry[], id: string): RegistryEntry[] {
  return registry.filter((entry) => entry.manifest.id !== id);
}

/** Let a plugin run. Unknown ids leave the registry unchanged. */
export function enablePlugin(registry: readonly RegistryEntry[], id: string): RegistryEntry[] {
  return registry.map((entry) => (entry.manifest.id === id ? { ...entry, enabled: true } : entry));
}

/** Stop a plugin running without forgetting it (song references survive). */
export function disablePlugin(registry: readonly RegistryEntry[], id: string): RegistryEntry[] {
  return registry.map((entry) => (entry.manifest.id === id ? { ...entry, enabled: false } : entry));
}

/** The entry for this id, or null. */
export function pluginFromId(registry: readonly RegistryEntry[], id: string): RegistryEntry | null {
  return registry.find((entry) => entry.manifest.id === id) ?? null;
}

/** The manifests of plugins that may run right now. */
export function enabledPlugins(registry: readonly RegistryEntry[]): TrackletPluginManifest[] {
  return registry.filter((entry) => entry.enabled).map((entry) => entry.manifest);
}

/** The ids in registration order, for messages that list them. */
export function pluginIds(registry: readonly RegistryEntry[]): string {
  return registry.map((entry) => entry.manifest.id).join(', ');
}
