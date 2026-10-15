import { describe, expect, it } from 'vitest';

import {
  HOST_API_VERSION,
  isPluginKind,
  MAX_PLUGIN_LATENCY_MS,
  MAX_PLUGIN_OUTS,
  parsePluginManifests,
  PLUGIN_KINDS,
  pluginExample,
  pluginLatencyProblem,
  pluginLatencySec,
  pluginManifestProblem,
  pluginOutName,
  pluginOutsProblem,
  pluginPermissionsProblem,
  validatePluginManifest,
} from '../plugins/manifest';
import {
  createRegistry,
  disablePlugin,
  enablePlugin,
  enabledPlugins,
  pluginFromId,
  pluginIds,
  registerPlugin,
  unregisterPlugin,
} from '../plugins/registry';
import { makePluginHost, negotiateApiVersion, seededRandom } from '../plugins/host';
import { loadPluginLibrary, PLUGIN_LIBRARY_STORAGE_KEY, savePluginLibrary } from '../pluginLibrary';
import type { KeyValueStore } from '../themePrefs';

function helloManifest(): Record<string, unknown> {
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

function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe('plugin manifest', () => {
  it('accepts a well-formed manifest and trims it into a fresh object', () => {
    const checked = validatePluginManifest(helloManifest());
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.manifest.id).toBe('com.example.hello-panel');
    expect(checked.manifest.params).toHaveLength(1);
  });

  it('refuses each broken field with a named fix', () => {
    expect(pluginManifestProblem(null)).toMatch(/object/);
    expect(pluginManifestProblem({ ...helloManifest(), id: 'HELLO' })).toMatch(/reverse-DNS/);
    expect(pluginManifestProblem({ ...helloManifest(), name: '' })).toMatch(/name/);
    expect(pluginManifestProblem({ ...helloManifest(), version: 'one' })).toMatch(/1\.2\.3/);
    expect(pluginManifestProblem({ ...helloManifest(), kind: 'vst' })).toMatch(/instrument, effect, generator, panel, io/);
    expect(pluginManifestProblem({ ...helloManifest(), entry: '' })).toMatch(/entry/);
    expect(pluginManifestProblem({ ...helloManifest(), apiVersion: HOST_API_VERSION + 1 })).toMatch(/speaks/);
    expect(
      pluginManifestProblem({
        ...helloManifest(),
        params: [{ id: 'amount', label: 'Amount', min: 0, max: 100, default: 120 }],
      }),
    ).toMatch(/default/);
  });

  it('knows its kinds and writes one example per kind', () => {
    expect(PLUGIN_KINDS).toContain('instrument');
    expect(isPluginKind('panel')).toBe(true);
    expect(isPluginKind('vst')).toBe(false);
    for (const kind of PLUGIN_KINDS) {
      const checked = validatePluginManifest({ ...helloManifest(), kind });
      expect(checked.ok).toBe(true);
      if (checked.ok) expect(pluginExample(checked.manifest).length).toBeGreaterThan(0);
    }
  });

  it('reads a stored library leniently: drops bad rows, keeps good ones', () => {
    const parsed = parsePluginManifests([helloManifest(), { id: 'broken' }, 'nope', helloManifest()]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('com.example.hello-panel');
    expect(parsePluginManifests('nope')).toEqual([]);
  });

  it('takes no latency claim as zero, and carries an honest one through', () => {
    expect(MAX_PLUGIN_LATENCY_MS).toBe(100);
    const plain = validatePluginManifest(helloManifest());
    expect(plain.ok).toBe(true);
    if (!plain.ok) return;
    expect(plain.manifest.latencyMs).toBeUndefined();
    expect(pluginLatencySec(plain.manifest)).toBe(0);

    const latent = validatePluginManifest({ ...helloManifest(), latencyMs: 12 });
    expect(latent.ok).toBe(true);
    if (!latent.ok) return;
    expect(latent.manifest.latencyMs).toBe(12);
    expect(pluginLatencySec(latent.manifest)).toBeCloseTo(0.012, 6);
    // A stored latent plugin reads back with its claim.
    expect(parsePluginManifests([JSON.parse(JSON.stringify(latent.manifest))])[0]?.latencyMs).toBe(12);
  });

  it('refuses a latency no schedule could honour, with the range', () => {
    expect(pluginLatencyProblem('com.example.x', -1)).toMatch(/0-100/);
    expect(pluginLatencyProblem('com.example.x', MAX_PLUGIN_LATENCY_MS + 1)).toMatch(/0-100/);
    expect(pluginLatencyProblem('com.example.x', 1.5)).toMatch(/whole/);
    expect(pluginLatencyProblem('com.example.x', '12')).toMatch(/whole/);
    expect(pluginLatencyProblem('com.example.x', undefined)).toBeNull();
    expect(pluginLatencyProblem('com.example.x', 0)).toBeNull();
    expect(pluginLatencyProblem('com.example.x', MAX_PLUGIN_LATENCY_MS)).toBeNull();
    expect(pluginManifestProblem({ ...helloManifest(), latencyMs: -4 })).toMatch(/latency/);
    // A stale stored entry with a wild claim is dropped, not half-read.
    expect(parsePluginManifests([{ ...helloManifest(), latencyMs: 500 }])).toEqual([]);
  });

  it('clamps a hand-built claim rather than trusting it', () => {
    expect(pluginLatencySec({ latencyMs: -20 })).toBe(0);
    expect(pluginLatencySec({ latencyMs: 5000 })).toBeCloseTo(MAX_PLUGIN_LATENCY_MS / 1000, 6);
    expect(pluginLatencySec({ latencyMs: Number.NaN })).toBe(0);
  });

  it('takes no outs as undeclared, and carries declared names through', () => {
    expect(MAX_PLUGIN_OUTS).toBe(8);
    const plain = validatePluginManifest(helloManifest());
    expect(plain.ok).toBe(true);
    if (!plain.ok) return;
    expect(plain.manifest.outs).toBeUndefined();
    expect(pluginOutName(plain.manifest, 0)).toBe('out1');
    expect(pluginOutName(plain.manifest, 2)).toBe('out3');
    // A wild index still names something file-safe.
    expect(pluginOutName(plain.manifest, -4)).toBe('out1');
    expect(pluginOutName(plain.manifest, 1.9)).toBe('out2');

    const kit = validatePluginManifest({ ...helloManifest(), outs: ['thump', 'click'] });
    expect(kit.ok).toBe(true);
    if (!kit.ok) return;
    expect(kit.manifest.outs).toEqual(['thump', 'click']);
    expect(pluginOutName(kit.manifest, 1)).toBe('click');
    expect(parsePluginManifests([JSON.parse(JSON.stringify(kit.manifest))])[0]?.outs).toEqual(['thump', 'click']);
  });

  it('refuses outs no stem file could carry, with the fix', () => {
    expect(pluginOutsProblem('com.example.x', [])).toMatch(/1-8/);
    expect(pluginOutsProblem('com.example.x', new Array(9).fill('pad'))).toMatch(/1-8/);
    expect(pluginOutsProblem('com.example.x', ['kick', 'kick'])).toMatch(/twice/);
    expect(pluginOutsProblem('com.example.x', [''])).toMatch(/file-safe/);
    expect(pluginOutsProblem('com.example.x', ['a'.repeat(25)])).toMatch(/file-safe/);
    expect(pluginOutsProblem('com.example.x', 'kick')).toMatch(/1-8/);
    expect(pluginOutsProblem('com.example.x', undefined)).toBeNull();
    expect(pluginManifestProblem({ ...helloManifest(), outs: ['kick', 'kick'] })).toMatch(/twice/);
    expect(parsePluginManifests([{ ...helloManifest(), outs: [] }])).toEqual([]);
  });

  it('takes no permissions as none, and carries declared ones through', () => {
    const plain = validatePluginManifest(helloManifest());
    expect(plain.ok).toBe(true);
    if (!plain.ok) return;
    expect(plain.manifest.permissions).toBeUndefined();

    const asking = validatePluginManifest({ ...helloManifest(), permissions: ['network', 'storage'] });
    expect(asking.ok).toBe(true);
    if (!asking.ok) return;
    expect(asking.manifest.permissions).toEqual(['network', 'storage']);
    // A stored asking plugin reads back with its claim.
    expect(parsePluginManifests([JSON.parse(JSON.stringify(asking.manifest))])[0]?.permissions).toEqual([
      'network',
      'storage',
    ]);
  });

  it('refuses permissions no host grants, with the fix', () => {
    expect(pluginPermissionsProblem('com.example.x', 'storage')).toMatch(/list like/);
    expect(pluginPermissionsProblem('com.example.x', ['carrier-pigeon'])).toMatch(/grants: network, storage/);
    expect(pluginPermissionsProblem('com.example.x', ['network', 'network'])).toMatch(/twice/);
    expect(pluginPermissionsProblem('com.example.x', [''])).toMatch(/grants/);
    expect(pluginPermissionsProblem('com.example.x', undefined)).toBeNull();
    expect(pluginPermissionsProblem('com.example.x', [])).toBeNull();
    expect(pluginManifestProblem({ ...helloManifest(), permissions: ['root'] })).toMatch(/grants/);
    // A stale stored entry with a wild claim is dropped, not half-read.
    expect(parsePluginManifests([{ ...helloManifest(), permissions: ['root'] }])).toEqual([]);
  });
});

describe('plugin registry', () => {
  it('registers, validates-before-storing, upgrades, and lists', () => {
    let registry = createRegistry();
    const bad = registerPlugin(registry, { id: 'broken' });
    expect('error' in bad).toBe(true);
    expect(registry).toHaveLength(0);

    const first = registerPlugin(registry, helloManifest());
    expect('entry' in first).toBe(true);
    if (!('entry' in first)) return;
    registry = first.registry;
    expect(pluginFromId(registry, 'com.example.hello-panel')?.enabled).toBe(true);

    const upgrade = registerPlugin(registry, { ...helloManifest(), version: '1.1.0' });
    if (!('entry' in upgrade)) return;
    registry = upgrade.registry;
    expect(registry).toHaveLength(1);
    expect(pluginFromId(registry, 'com.example.hello-panel')?.manifest.version).toBe('1.1.0');
    expect(pluginIds(registry)).toMatch(/hello-panel/);
  });

  it('disables without forgetting, enables again, unregisters cleanly', () => {
    let registry = createRegistry();
    const added = registerPlugin(registry, helloManifest());
    if (!('entry' in added)) return;
    registry = added.registry;

    registry = disablePlugin(registry, 'com.example.hello-panel');
    expect(enabledPlugins(registry)).toHaveLength(0);
    expect(pluginFromId(registry, 'com.example.hello-panel')).not.toBeNull();

    registry = enablePlugin(registry, 'com.example.hello-panel');
    expect(enabledPlugins(registry)).toHaveLength(1);

    registry = unregisterPlugin(registry, 'com.example.hello-panel');
    expect(registry).toHaveLength(0);
    expect(unregisterPlugin(registry, 'nobody')).toHaveLength(0);
  });
});

describe('plugin host', () => {
  it('negotiates versions: older works, newer is refused in words', () => {
    expect(negotiateApiVersion(1).ok).toBe(true);
    const newer = negotiateApiVersion(HOST_API_VERSION + 1);
    expect(newer.ok).toBe(false);
    if (!newer.ok) expect(newer.error).toMatch(/Update Tracklet/);
    expect(negotiateApiVersion(0).ok).toBe(false);
  });

  it('seeds determinism: same seed, same sequence, every time', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
    expect(seededRandom(7)()).not.toBe(seededRandom(8)());
  });

  it('scopes logs with the plugin id', () => {
    const lines: string[] = [];
    const host = makePluginHost('com.example.hello-panel', 1, (line) => lines.push(line));
    expect(host.apiVersion).toBe(HOST_API_VERSION);
    host.log('ready');
    expect(lines).toEqual(['[com.example.hello-panel] ready']);
  });
});

describe('plugin library storage', () => {
  it('round-trips through a store and survives a corrupt value', () => {
    const store = memoryStore();
    const checked = validatePluginManifest(helloManifest());
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(savePluginLibrary([checked.manifest], store)).toBe(true);
    expect(loadPluginLibrary(store)).toHaveLength(1);

    const corrupt = memoryStore({ [PLUGIN_LIBRARY_STORAGE_KEY]: 'not json{{' });
    expect(loadPluginLibrary(corrupt)).toEqual([]);
    expect(loadPluginLibrary(null)).toEqual([]);
  });
});
