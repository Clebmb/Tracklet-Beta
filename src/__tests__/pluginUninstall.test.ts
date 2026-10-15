import { describe, expect, it } from 'vitest';

import { grantPermission } from '../plugins/grants';
import {
  forgetInstalledPluginCode,
  forgetPluginFingerprint,
  forgetPluginSource,
  loadInstalledPluginCode,
  loadPluginFingerprints,
  loadPluginGrants,
  loadPluginLibrary,
  loadPluginSources,
  PLUGIN_CODE_STORAGE_KEY,
  PLUGIN_FINGERPRINTS_STORAGE_KEY,
  PLUGIN_GRANTS_STORAGE_KEY,
  PLUGIN_LIBRARY_STORAGE_KEY,
  PLUGIN_SOURCES_STORAGE_KEY,
  saveInstalledPluginCode,
  savePluginFingerprint,
  savePluginGrants,
  savePluginLibrary,
  savePluginSource,
} from '../pluginLibrary';
import { createRegistry, registerPlugin } from '../plugins/registry';
import type { KeyValueStore } from '../themePrefs';
import {
  createPluginStoredState,
  uninstallPluginEverywhere,
  type PluginStoredState,
} from '../plugins/uninstall';

function helloRaw(): Record<string, unknown> {
  return {
    id: 'com.example.hello-panel',
    name: 'Hello Panel',
    version: '1.0.0',
    kind: 'panel',
    entry: './index.ts',
    apiVersion: 1,
    permissions: ['storage'],
  };
}

function sawRaw(): Record<string, unknown> {
  return {
    id: 'com.example.supersaw',
    name: 'Supersaw',
    version: '0.9.0',
    kind: 'instrument',
    entry: './index.ts',
    apiVersion: 1,
  };
}

/** A machine with two plugins remembered on all five shelves. */
function twoPluginState(): PluginStoredState {
  let registry = createRegistry();
  const first = registerPlugin(registry, helloRaw());
  if (!('entry' in first)) throw new Error('hello-panel did not register');
  const second = registerPlugin(first.registry, sawRaw());
  if (!('entry' in second)) throw new Error('supersaw did not register');
  return {
    registry: second.registry,
    code: { 'com.example.hello-panel': 'code-a', 'com.example.supersaw': 'code-b' },
    sources: {
      'com.example.hello-panel': 'https://example.com/hello.tracklet-plugin',
      'com.example.supersaw': 'bundle:demo.tracklet-bundle.zip',
    },
    grants: grantPermission({}, 'com.example.hello-panel', 'storage'),
    fingerprints: { 'com.example.hello-panel': '811c9dc5', 'com.example.supersaw': '01000193' },
  };
}

describe('plugin uninstall', () => {
  it('starts with nothing remembered anywhere', () => {
    expect(createPluginStoredState()).toEqual({ registry: [], code: {}, sources: {}, grants: {}, fingerprints: {} });
  });

  it('forgets one plugin on all five shelves, and keeps its neighbour', () => {
    const before = twoPluginState();
    const after = uninstallPluginEverywhere(before, 'com.example.hello-panel');
    expect(after.registry.map((entry) => entry.manifest.id)).toEqual(['com.example.supersaw']);
    expect(after.code).toEqual({ 'com.example.supersaw': 'code-b' });
    expect(after.sources).toEqual({ 'com.example.supersaw': 'bundle:demo.tracklet-bundle.zip' });
    expect(after.grants).toEqual({});
    expect(after.fingerprints).toEqual({ 'com.example.supersaw': '01000193' });
    // The input still describes the machine that was: copies throughout.
    expect(before.registry).toHaveLength(2);
    expect(before.code).toEqual({ 'com.example.hello-panel': 'code-a', 'com.example.supersaw': 'code-b' });
    expect(before.grants).toEqual({ 'com.example.hello-panel': ['storage'] });
  });

  it('forgets nothing for an unknown id, on any shelf', () => {
    const before = twoPluginState();
    expect(uninstallPluginEverywhere(before, 'com.example.nobody')).toEqual(before);
    expect(uninstallPluginEverywhere(createPluginStoredState(), 'com.example.nobody')).toEqual(
      createPluginStoredState(),
    );
  });

  it('leaves a half-remembered plugin with no trace behind', () => {
    // Registered but never granted, sourced, weighed or coded: still one call.
    let registry = createRegistry();
    const added = registerPlugin(registry, sawRaw());
    if (!('entry' in added)) return;
    const after = uninstallPluginEverywhere({ ...createPluginStoredState(), registry: added.registry }, 'com.example.supersaw');
    expect(after).toEqual(createPluginStoredState());
  });
});

/**
 * The scene's half of the bargain: load the five shelves, forget through the
 * one door, persist the five next-states. These tests run the scene's exact
 * sequence against a memory store — the scene itself is a canvas no headless
 * runner can hold — so a shelf the sequence skipped would stay behind here.
 */
describe('uninstall persistence: the scene writes what the door answers', () => {
  function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
    const data = { ...initial };
    return {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => {
        data[key] = value;
      },
    };
  }

  /** All five shelves seeded, the way the install flows leave them. */
  function seededStore(): KeyValueStore {
    const seeded = twoPluginState();
    const store = memoryStore();
    savePluginLibrary(
      seeded.registry.map((entry) => entry.manifest),
      store,
    );
    for (const [id, code] of Object.entries(seeded.code)) saveInstalledPluginCode(id, code, store);
    for (const [id, source] of Object.entries(seeded.sources)) savePluginSource(id, source, store);
    savePluginGrants(seeded.grants, store);
    for (const [id, print] of Object.entries(seeded.fingerprints)) savePluginFingerprint(id, print, store);
    return store;
  }

  /** The scene coordinator's sequence, minus the canvas: load, forget, persist. */
  function uninstallAndPersist(store: KeyValueStore, id: string): void {
    const before: PluginStoredState = {
      registry: loadPluginLibrary(store).map((manifest) => ({ manifest, enabled: true })),
      code: loadInstalledPluginCode(store),
      sources: loadPluginSources(store),
      grants: loadPluginGrants(store),
      fingerprints: loadPluginFingerprints(store),
    };
    const after = uninstallPluginEverywhere(before, id);
    savePluginLibrary(
      after.registry.map((entry) => entry.manifest),
      store,
    );
    forgetInstalledPluginCode(id, store);
    forgetPluginSource(id, store);
    forgetPluginFingerprint(id, store);
    savePluginGrants(after.grants, store);
  }

  it('forgets the id on every shelf and keeps the neighbour', () => {
    const store = seededStore();
    uninstallAndPersist(store, 'com.example.hello-panel');
    expect(loadPluginLibrary(store).map((manifest) => manifest.id)).toEqual(['com.example.supersaw']);
    expect(loadInstalledPluginCode(store)).toEqual({ 'com.example.supersaw': 'code-b' });
    expect(loadPluginSources(store)).toEqual({ 'com.example.supersaw': 'bundle:demo.tracklet-bundle.zip' });
    expect(loadPluginGrants(store)).toEqual({});
    expect(loadPluginFingerprints(store)).toEqual({ 'com.example.supersaw': '01000193' });
  });

  it('writes nothing new for an unknown id, on any shelf', () => {
    const store = seededStore();
    const keys = [
      PLUGIN_LIBRARY_STORAGE_KEY,
      PLUGIN_CODE_STORAGE_KEY,
      PLUGIN_SOURCES_STORAGE_KEY,
      PLUGIN_GRANTS_STORAGE_KEY,
      PLUGIN_FINGERPRINTS_STORAGE_KEY,
    ];
    const before = keys.map((key) => store.getItem(key));
    expect(before.every((value) => value !== null)).toBe(true);
    uninstallAndPersist(store, 'com.example.nobody');
    expect(keys.map((key) => store.getItem(key))).toEqual(before);
  });
});
