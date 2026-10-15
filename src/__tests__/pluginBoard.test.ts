import { describe, expect, it } from 'vitest';

import { grantPermission } from '../plugins/grants';
import { pluginExample } from '../plugins/manifest';
import type { PluginGrants } from '../plugins/grants';
import { createRegistry, pluginFromId, registerPlugin } from '../plugins/registry';
import {
  clampPluginSelection,
  emptyPluginText,
  movePluginSelection,
  nextDenyAt,
  nextGrantAt,
  pendingGrantNote,
  pluginDetail,
  pluginRowLabel,
  pluginRows,
  toggleGrantAt,
  togglePluginAt,
} from '../ui/pluginBoard';

function helloRaw(): Record<string, unknown> {
  return {
    id: 'com.example.hello-panel',
    name: 'Hello Panel',
    version: '1.0.0',
    kind: 'panel',
    entry: './index.ts',
    apiVersion: 1,
    params: [{ id: 'amount', label: 'Amount', min: 0, max: 100, default: 50 }],
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

describe('plugin browser rows', () => {
  it('lists one row per plugin in registration order, and names the empty state', () => {
    expect(pluginRows(createRegistry())).toEqual([]);
    expect(emptyPluginText()).toMatch(/NO PLUGINS INSTALLED/);

    let registry = createRegistry();
    const first = registerPlugin(registry, helloRaw());
    if (!('entry' in first)) return;
    const second = registerPlugin(first.registry, sawRaw());
    if (!('entry' in second)) return;
    const rows = pluginRows(second.registry);
    expect(rows.map((row) => row.id)).toEqual(['com.example.hello-panel', 'com.example.supersaw']);
    expect(pluginRowLabel(rows[0])).toMatch(/ON.*Hello Panel.*panel.*1\.0\.0/);
    // Nothing rendered yet, so the row says nothing about cost.
    expect(rows[0]).toMatchObject({ avgMs: null, overBudget: false });
    expect(pluginRowLabel(rows[0])).not.toMatch(/ms/);
  });

  it('says what a plugin costs once it rendered, and OVER past the budget', () => {
    let registry = createRegistry();
    const added = registerPlugin(registry, sawRaw());
    if (!('entry' in added)) return;
    registry = added.registry;
    const rows = pluginRows(registry, [
      { id: 'com.example.supersaw', renders: 10, avgMs: 0.4, maxMs: 1, overBudget: false },
    ]);
    expect(pluginRowLabel(rows[0])).toMatch(/0\.4ms/);
    expect(pluginRowLabel(rows[0])).not.toMatch(/OVER/);
    const over = pluginRows(registry, [
      { id: 'com.example.supersaw', renders: 10, avgMs: 40, maxMs: 60, overBudget: true },
    ]);
    expect(pluginRowLabel(over[0])).toMatch(/40\.0ms OVER/);
    // Stats for an id the registry never held change no row.
    const strange = pluginRows(registry, [
      { id: 'com.example.gone', renders: 1, avgMs: 99, maxMs: 99, overBudget: true },
    ]);
    expect(strange[0]).toMatchObject({ avgMs: null, overBudget: false });
  });
});

describe('plugin browser selection', () => {
  it('clamps into the rows and stops at the walls', () => {
    expect(clampPluginSelection(0, 0)).toBe(0);
    expect(clampPluginSelection(9, 2)).toBe(1);
    expect(clampPluginSelection(-3, 2)).toBe(0);
    expect(movePluginSelection(0, 2, -1)).toBe(0);
    expect(movePluginSelection(1, 2, 1)).toBe(1);
    expect(movePluginSelection(0, 2, 1)).toBe(1);
  });
});

describe('plugin browser toggle', () => {
  it('flips the selected row through the registry, and ignores a stale index', () => {
    let registry = createRegistry();
    const added = registerPlugin(registry, helloRaw());
    if (!('entry' in added)) return;
    registry = added.registry;

    registry = togglePluginAt(registry, 0);
    expect(pluginFromId(registry, 'com.example.hello-panel')?.enabled).toBe(false);
    expect(pluginRowLabel(pluginRows(registry)[0])).toMatch(/^OFF/);

    registry = togglePluginAt(registry, 0);
    expect(pluginFromId(registry, 'com.example.hello-panel')?.enabled).toBe(true);

    const before = registry;
    expect(togglePluginAt(registry, 7)).toEqual(before);
  });

  it('describes the selection with id, version, params and example', () => {
    let registry = createRegistry();
    const added = registerPlugin(registry, helloRaw());
    if (!('entry' in added)) return;
    const entry = pluginFromId(added.registry, 'com.example.hello-panel');
    expect(entry).not.toBeNull();
    if (!entry) return;
    expect(pluginDetail(entry, pluginExample(entry.manifest))).toMatch(
      /com\.example\.hello-panel@1\.0\.0 amount - e\.g\. page plugin:com\.example\.hello-panel/,
    );
  });

  it('says the latency only when there is one', () => {
    let registry = createRegistry();
    const plain = registerPlugin(registry, helloRaw());
    if (!('entry' in plain)) return;
    const plainEntry = pluginFromId(plain.registry, 'com.example.hello-panel');
    if (!plainEntry) return;
    expect(pluginDetail(plainEntry, pluginExample(plainEntry.manifest))).not.toContain('lat');

    const latent = registerPlugin(plain.registry, { ...helloRaw(), latencyMs: 12 });
    if (!('entry' in latent)) return;
    const latentEntry = pluginFromId(latent.registry, 'com.example.hello-panel');
    if (!latentEntry) return;
    expect(pluginDetail(latentEntry, pluginExample(latentEntry.manifest))).toMatch(/amount lat 12ms - e\.g\./);
  });

  it('names declared outs the way it names params', () => {
    let registry = createRegistry();
    const added = registerPlugin(registry, { ...helloRaw(), outs: ['thump', 'click'] });
    if (!('entry' in added)) return;
    const entry = pluginFromId(added.registry, 'com.example.hello-panel');
    if (!entry) return;
    expect(pluginDetail(entry, pluginExample(entry.manifest))).toMatch(/amount outs thump click - e\.g\./);
  });

  it('names requested permissions, and stays quiet when none are asked', () => {
    let registry = createRegistry();
    const plain = registerPlugin(registry, helloRaw());
    if (!('entry' in plain)) return;
    const plainEntry = pluginFromId(plain.registry, 'com.example.hello-panel');
    if (!plainEntry) return;
    expect(pluginDetail(plainEntry, pluginExample(plainEntry.manifest))).not.toContain('needs');

    const asking = registerPlugin(plain.registry, { ...helloRaw(), permissions: ['storage'] });
    if (!('entry' in asking)) return;
    const askingEntry = pluginFromId(asking.registry, 'com.example.hello-panel');
    if (!askingEntry) return;
    expect(pluginDetail(askingEntry, pluginExample(askingEntry.manifest))).toMatch(/amount needs storage - e\.g\./);
  });

  it('carries what each row still needs deciding', () => {
    let registry = createRegistry();
    const added = registerPlugin(registry, { ...helloRaw(), permissions: ['network', 'storage'] });
    if (!('entry' in added)) return;
    registry = added.registry;
    expect(pluginRows(registry)[0]?.pending).toEqual(['network', 'storage']);
    const granted = toggleGrantAt(registry, {}, 0, 'storage');
    expect(pluginRows(registry, [], granted)[0]?.pending).toEqual(['network']);
    // A plugin that asked for nothing has nothing pending.
    expect(pluginRows(createRegistry())[0]?.pending).toBeUndefined();
  });

  it('reads needs as the pending half and allows as the granted half', () => {
    let registry = createRegistry();
    const added = registerPlugin(registry, { ...helloRaw(), permissions: ['network', 'storage'] });
    if (!('entry' in added)) return;
    registry = added.registry;
    const entry = pluginFromId(registry, 'com.example.hello-panel');
    if (!entry) return;
    const example = pluginExample(entry.manifest);
    expect(pluginDetail(entry, example)).toMatch(/needs network storage/);
    expect(pluginDetail(entry, example)).not.toContain('allows');
    const partial = toggleGrantAt(registry, {}, 0, 'storage');
    expect(pluginDetail(entry, example, partial)).toMatch(/needs network allows storage/);
    const full = toggleGrantAt(registry, partial, 0, 'network');
    expect(pluginDetail(entry, example, full)).not.toContain('needs');
    expect(pluginDetail(entry, example, full)).toMatch(/allows network storage/);
  });

  it('flips exactly one word per toggle, and nothing for nonsense', () => {
    let registry = createRegistry();
    const added = registerPlugin(registry, { ...helloRaw(), permissions: ['network', 'storage'] });
    if (!('entry' in added)) return;
    registry = added.registry;
    const granted = toggleGrantAt(registry, {}, 0, 'storage');
    expect(granted).toEqual({ 'com.example.hello-panel': ['storage'] });
    // Toggling again takes it back, leaving no empty row.
    expect(toggleGrantAt(registry, granted, 0, 'storage')).toEqual({});
    // A word no host grants, or a selection with no row, changes nothing.
    expect(toggleGrantAt(registry, {}, 0, 'root')).toEqual({});
    expect(toggleGrantAt(registry, {}, 7, 'storage')).toEqual({});
    expect(toggleGrantAt(createRegistry(), {}, 0, 'storage')).toEqual({});
  });

  it('says the pending ask as an install sentence, or nothing when decided', () => {
    let registry = createRegistry();
    const added = registerPlugin(registry, { ...helloRaw(), permissions: ['storage'] });
    if (!('entry' in added)) return;
    const entry = pluginFromId(added.registry, 'com.example.hello-panel');
    if (!entry) return;
    expect(pendingGrantNote(entry.manifest, {})).toBe(' It asks for storage - nothing granted yet.');
    const granted = toggleGrantAt(added.registry, {}, 0, 'storage');
    expect(pendingGrantNote(entry.manifest, granted)).toBe('');
    const plain = registerPlugin(createRegistry(), helloRaw());
    if (!('entry' in plain)) return;
    const plainEntry = pluginFromId(plain.registry, 'com.example.hello-panel');
    if (!plainEntry) return;
    expect(pendingGrantNote(plainEntry.manifest, {})).toBe('');
  });
});

describe('plugin browser grant keys', () => {
  function askingRaw(): Record<string, unknown> {
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

  function askingRegistry() {
    const added = registerPlugin(createRegistry(), askingRaw());
    if (!('entry' in added)) throw new Error('asking-panel did not register');
    return added.registry;
  }

  it('answers one pending word per press, in manifest order', () => {
    const registry = askingRegistry();
    expect(nextGrantAt(registry, {}, 0)).toEqual({ id: 'com.example.asking-panel', permission: 'network' });
    const one: PluginGrants = grantPermission({}, 'com.example.asking-panel', 'network');
    expect(nextGrantAt(registry, one, 0)).toEqual({ id: 'com.example.asking-panel', permission: 'storage' });
    const both = grantPermission(one, 'com.example.asking-panel', 'storage');
    expect(nextGrantAt(registry, both, 0)).toBeNull();
  });

  it('takes back in manifest order even when granted out of order', () => {
    const registry = askingRegistry();
    expect(nextDenyAt(registry, {}, 0)).toBeNull();
    const flipped = grantPermission({}, 'com.example.asking-panel', 'storage');
    expect(nextDenyAt(registry, flipped, 0)).toEqual({ id: 'com.example.asking-panel', permission: 'storage' });
    const both = grantPermission(flipped, 'com.example.asking-panel', 'network');
    expect(nextDenyAt(registry, both, 0)).toEqual({ id: 'com.example.asking-panel', permission: 'network' });
  });

  it('does nothing on a stale selection or an empty registry', () => {
    const registry = askingRegistry();
    for (const selection of [-1, 1, 99]) {
      expect(nextGrantAt(registry, {}, selection)).toBeNull();
      expect(nextDenyAt(registry, {}, selection)).toBeNull();
    }
    expect(nextGrantAt(createRegistry(), {}, 0)).toBeNull();
    expect(nextDenyAt(createRegistry(), {}, 0)).toBeNull();
  });
});
