import { describe, expect, it } from 'vitest';

import {
  createGrants,
  denyPermission,
  forgetPluginGrants,
  grantedPermissions,
  grantPermission,
  parsePluginGrants,
  pendingPermissions,
} from '../plugins/grants';
import { isPluginPermission, validatePluginManifest } from '../plugins/manifest';
import { loadPluginGrants, PLUGIN_GRANTS_STORAGE_KEY, savePluginGrants } from '../pluginLibrary';
import type { KeyValueStore } from '../themePrefs';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

function askingManifest(): Record<string, unknown> {
  return {
    id: 'com.example.asking-panel',
    name: 'Asking Panel',
    version: '1.0.0',
    kind: 'panel',
    entry: './index.ts',
    apiVersion: 1,
    permissions: ['network', 'storage'],
  };
}

describe('plugin permission words', () => {
  it('knows the two words the host grants, and nothing else', () => {
    expect(isPluginPermission('network')).toBe(true);
    expect(isPluginPermission('storage')).toBe(true);
    expect(isPluginPermission('root')).toBe(false);
    expect(isPluginPermission('')).toBe(false);
    expect(isPluginPermission(undefined)).toBe(false);
  });
});

describe('plugin grants', () => {
  it('starts denied: nothing granted until granted', () => {
    expect(grantedPermissions(createGrants(), 'com.example.asking-panel')).toEqual([]);
  });

  it('grants one word at a time, without touching the original', () => {
    const before = createGrants();
    const granted = grantPermission(before, 'com.example.asking-panel', 'storage');
    expect(grantedPermissions(granted, 'com.example.asking-panel')).toEqual(['storage']);
    // The input is untouched: decisions copy, like the registry.
    expect(grantedPermissions(before, 'com.example.asking-panel')).toEqual([]);
    const twice = grantPermission(granted, 'com.example.asking-panel', 'network');
    expect(grantedPermissions(twice, 'com.example.asking-panel')).toEqual(['storage', 'network']);
  });

  it('grants no word the host does not know, however it is spelled', () => {
    const grants = grantPermission(createGrants(), 'com.example.asking-panel', 'carrier-pigeon');
    expect(grants).toEqual({});
    expect(grantedPermissions(grants, 'com.example.asking-panel')).toEqual([]);
    // Granting twice says it once.
    const once = grantPermission(createGrants(), 'com.example.asking-panel', 'storage');
    expect(grantPermission(once, 'com.example.asking-panel', 'storage')).toEqual(once);
  });

  it('takes one word back, and forgets the id with the last one', () => {
    let grants = grantPermission(createGrants(), 'com.example.asking-panel', 'storage');
    grants = grantPermission(grants, 'com.example.asking-panel', 'network');
    grants = denyPermission(grants, 'com.example.asking-panel', 'storage');
    expect(grantedPermissions(grants, 'com.example.asking-panel')).toEqual(['network']);
    // Denying what was never granted changes nothing.
    expect(denyPermission(grants, 'com.example.asking-panel', 'root')).toEqual(grants);
    expect(denyPermission(grants, 'com.example.unknown', 'network')).toEqual(grants);
    // The last denial leaves no empty row behind.
    expect(denyPermission(grants, 'com.example.asking-panel', 'network')).toEqual({});
  });

  it('forgets one plugin beside an uninstall, and nothing else', () => {
    let grants = grantPermission(createGrants(), 'com.example.asking-panel', 'storage');
    grants = grantPermission(grants, 'com.example.other', 'network');
    expect(forgetPluginGrants(grants, 'com.example.asking-panel')).toEqual({
      'com.example.other': ['network'],
    });
    expect(forgetPluginGrants(grants, 'com.example.unknown')).toEqual(grants);
  });

  it('reads a hand-built row as none, never as permission', () => {
    expect(grantedPermissions({ 'com.example.x': 'storage' } as never, 'com.example.x')).toEqual([]);
    expect(grantedPermissions({ 'com.example.x': ['storage', 'root'] } as never, 'com.example.x')).toEqual([
      'storage',
    ]);
  });

  it('lists what one plugin still needs deciding, in manifest order', () => {
    const checked = validatePluginManifest(askingManifest());
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(pendingPermissions(checked.manifest, createGrants())).toEqual(['network', 'storage']);
    const partial = grantPermission(createGrants(), checked.manifest.id, 'network');
    expect(pendingPermissions(checked.manifest, partial)).toEqual(['storage']);
    const full = grantPermission(partial, checked.manifest.id, 'storage');
    expect(pendingPermissions(checked.manifest, full)).toEqual([]);
    // A plugin that asked for nothing has nothing pending.
    const quiet = validatePluginManifest({ ...askingManifest(), permissions: undefined });
    expect(quiet.ok).toBe(true);
    if (!quiet.ok) return;
    expect(pendingPermissions(quiet.manifest, createGrants())).toEqual([]);
  });

  it('reads stored grants leniently: drops bad rows and words, keeps the rest', () => {
    expect(
      parsePluginGrants({
        'com.example.good': ['storage'],
        'com.example.wild': ['root'],
        'com.example.doubled': ['network', 'network'],
        'com.example.shapeless': 'storage',
        '': ['storage'],
      }),
    ).toEqual({
      'com.example.good': ['storage'],
      'com.example.doubled': ['network'],
    });
    expect(parsePluginGrants('nope')).toEqual({});
    expect(parsePluginGrants(null)).toEqual({});
    expect(parsePluginGrants([])).toEqual({});
  });
});

describe('plugin grants storage', () => {
  it('remembers decisions under their own key, and forgets nothing else', () => {
    const store = memoryStore();
    const grants = grantPermission(createGrants(), 'com.example.asking-panel', 'storage');
    expect(savePluginGrants(grants, store)).toBe(true);
    expect(loadPluginGrants(store)).toEqual({ 'com.example.asking-panel': ['storage'] });
    expect(store.getItem(PLUGIN_GRANTS_STORAGE_KEY)).toContain('asking-panel');
  });

  it('reads a blocked or corrupt store as denied, never as granted', () => {
    expect(loadPluginGrants(memoryStore({ [PLUGIN_GRANTS_STORAGE_KEY]: 'not json' }))).toEqual({});
    expect(loadPluginGrants(memoryStore({ [PLUGIN_GRANTS_STORAGE_KEY]: '{"a": 1}' }))).toEqual({});
    expect(loadPluginGrants(null)).toEqual({});
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadPluginGrants(throwing)).toEqual({});
    expect(savePluginGrants(createGrants(), throwing)).toBe(false);
    expect(savePluginGrants(createGrants(), null)).toBe(false);
  });
});

describe('grant answers: the scene writes what the words decide', () => {
  /** The scene coordinator's persist half, minus the canvas and the toast. */
  function applyAnswer(store: KeyValueStore, id: string, permission: string, allow: boolean): void {
    const grants = loadPluginGrants(store);
    savePluginGrants(allow ? grantPermission(grants, id, permission) : denyPermission(grants, id, permission), store);
  }

  it('keeps an allow and takes back a deny, forgetting the emptied row', () => {
    const store = memoryStore();
    applyAnswer(store, 'com.example.asking-panel', 'storage', true);
    expect(loadPluginGrants(store)).toEqual({ 'com.example.asking-panel': ['storage'] });
    applyAnswer(store, 'com.example.asking-panel', 'network', true);
    expect(grantedPermissions(loadPluginGrants(store), 'com.example.asking-panel')).toEqual(['storage', 'network']);
    applyAnswer(store, 'com.example.asking-panel', 'storage', false);
    expect(loadPluginGrants(store)).toEqual({ 'com.example.asking-panel': ['network'] });
    applyAnswer(store, 'com.example.asking-panel', 'network', false);
    expect(loadPluginGrants(store)).toEqual({});
  });

  it('writes the same bytes back for a repeated or empty answer', () => {
    const store = memoryStore();
    applyAnswer(store, 'com.example.asking-panel', 'storage', true);
    const kept = store.getItem(PLUGIN_GRANTS_STORAGE_KEY);
    applyAnswer(store, 'com.example.asking-panel', 'storage', true);
    expect(store.getItem(PLUGIN_GRANTS_STORAGE_KEY)).toBe(kept);
    applyAnswer(store, 'com.example.nobody', 'storage', false);
    expect(store.getItem(PLUGIN_GRANTS_STORAGE_KEY)).toBe(kept);
  });
});
