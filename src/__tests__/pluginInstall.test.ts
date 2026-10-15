import { describe, expect, it } from 'vitest';

import { zipStore } from '../audio/zip';
import { createRegistry } from '../plugins/registry';
import {
  bundleFromZipBytes,
  fingerprintPluginCode,
  installPluginBundle,
  normalizePluginSource,
  parsePluginBundle,
  readZipStore,
  seatModuleForKind,
} from '../plugins/install';
import {
  forgetInstalledPluginCode,
  forgetPluginFingerprint,
  forgetPluginSource,
  loadInstalledPluginCode,
  loadPluginFingerprints,
  loadPluginSources,
  pluginCodeMatchesFingerprint,
  saveInstalledPluginCode,
  savePluginFingerprint,
  savePluginSource,
} from '../pluginLibrary';
import type { KeyValueStore } from '../themePrefs';
import supersawManifest from '../../examples/plugins/supersaw/manifest.json';
import { renderNote as renderSupersaw } from '../../examples/plugins/supersaw/index';
import bitcrushManifest from '../../examples/plugins/bitcrush-plus/manifest.json';
import { processBlock as processBitcrush } from '../../examples/plugins/bitcrush-plus/index';
import euclidManifest from '../../examples/plugins/euclid-drums/manifest.json';
import { expand as expandEuclid } from '../../examples/plugins/euclid-drums/index';
import meterManifest from '../../examples/plugins/meter-panel/manifest.json';
import { mount as mountMeter } from '../../examples/plugins/meter-panel/index';

const encoder = new TextEncoder();

/** A bundle zip: manifest.json plus the entry module it names. */
function bundleZip(manifest: unknown, entryName: string, entryText: string): Uint8Array {
  return zipStore([
    { name: 'manifest.json', bytes: encoder.encode(JSON.stringify(manifest)) },
    { name: entryName, bytes: encoder.encode(entryText) },
  ]);
}

/** An in-memory store, the way the library tests fake the browser. */
function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('readZipStore reads what the writer writes', () => {
  it('round-trips files in archive order, including an empty one', () => {
    const bytes = zipStore([
      { name: 'manifest.json', bytes: encoder.encode('{"id":"x"}') },
      { name: 'index.js', bytes: encoder.encode('export const mount = () => {};') },
      { name: 'empty.txt', bytes: new Uint8Array(0) },
    ]);
    const read = readZipStore(bytes);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.files.map((file) => file.name)).toEqual(['manifest.json', 'index.js', 'empty.txt']);
    expect(new TextDecoder().decode(read.files[0]?.bytes)).toBe('{"id":"x"}');
    expect(read.files[2]?.bytes).toHaveLength(0);
  });

  it('reads an empty archive as no files', () => {
    const read = readZipStore(zipStore([]));
    expect(read).toEqual({ ok: true, files: [] });
  });

  it('refuses what is not a zip, a truncation, and a broken signature', () => {
    expect(readZipStore(new Uint8Array([1, 2, 3])).ok).toBe(false);
    const whole = zipStore([{ name: 'a.txt', bytes: encoder.encode('hello') }]);
    expect(readZipStore(whole.slice(0, 20)).ok).toBe(false);
    const broken = Uint8Array.from(whole);
    broken[0] = 0x00;
    const result = readZipStore(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not a plugin bundle');
  });

  it('refuses a compressed entry, naming the file and the fix', () => {
    const whole = zipStore([{ name: './index.ts', bytes: encoder.encode('code') }]);
    const patched = Uint8Array.from(whole);
    new DataView(patched.buffer).setUint16(8, 8, true); // method 8: deflate
    const result = readZipStore(patched);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('index.ts');
      expect(result.error).toContain('no compression');
    }
  });

  it('refuses an encrypted entry and a checksum mismatch', () => {
    const whole = zipStore([{ name: 'a.txt', bytes: encoder.encode('hello') }]);
    const locked = Uint8Array.from(whole);
    new DataView(locked.buffer).setUint16(6, 1, true); // bit 0: encrypted
    const refused = readZipStore(locked);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain('encrypted');
    // 'a.txt' is 5 letters: the data starts at 30 + 5.
    const damaged = Uint8Array.from(whole);
    damaged[35] = (damaged[35] ?? 0) ^ 0xff;
    const mismatch = readZipStore(damaged);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error).toContain('checksum');
  });

  it('refuses a name that climbs out of the archive', () => {
    const evil = zipStore([{ name: '../evil.js', bytes: encoder.encode('code') }]);
    const result = readZipStore(evil);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('climbs out');
  });
});

describe('parsePluginBundle opens a manifest plus its entry', () => {
  it('finds the entry the manifest names', () => {
    const read = readZipStore(bundleZip(meterManifest, './index.ts', 'export const mount = () => {};'));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const parsed = parsePluginBundle(read.files);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.entry).toBe((meterManifest as { entry: string }).entry);
    expect(parsed.bundle.moduleText).toContain('mount');
  });

  it('refuses a missing manifest, bad JSON, and a missing entry file', () => {
    const noManifest = readZipStore(zipStore([{ name: './index.ts', bytes: encoder.encode('x') }]));
    if (noManifest.ok) expect(parsePluginBundle(noManifest.files).ok).toBe(false);
    const badJson = readZipStore(zipStore([{ name: 'manifest.json', bytes: encoder.encode('{nope') }]));
    if (badJson.ok) {
      const parsed = parsePluginBundle(badJson.files);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error).toContain('not JSON');
    }
    const noEntry = readZipStore(bundleZip({ ...meterManifest, entry: './missing.js' }, 'index.js', 'x'));
    if (noEntry.ok) {
      const parsed = parsePluginBundle(noEntry.files);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error).toContain('missing.js');
    }
  });

  it('reads a bundle straight from zip bytes', () => {
    const result = bundleFromZipBytes(bundleZip(meterManifest, './index.ts', 'export const mount = () => {};'));
    expect(result.ok).toBe(true);
    const corrupt = bundleFromZipBytes(new Uint8Array([9, 9, 9, 9]));
    expect(corrupt.ok).toBe(false);
  });
});

describe('seatModuleForKind seats every kind behind one door', () => {
  it('seats instruments, effects, generators and panels', () => {
    expect(seatModuleForKind(supersawManifest, { renderNote: renderSupersaw }).ok).toBe(true);
    const effect = seatModuleForKind(bitcrushManifest, { processBlock: processBitcrush });
    expect(effect.ok).toBe(true);
    if (effect.ok) expect(effect.seated.kind).toBe('effect');
    const generator = seatModuleForKind(euclidManifest, { expand: expandEuclid });
    expect(generator.ok).toBe(true);
    if (generator.ok) expect(generator.seated.kind).toBe('generator');
    const panel = seatModuleForKind(meterManifest, { mount: mountMeter });
    expect(panel.ok).toBe(true);
    if (panel.ok) expect(panel.seated.kind).toBe('panel');
  });

  it('refuses a module with no entry function, and a kind with no milestone', () => {
    const empty = seatModuleForKind(meterManifest, {});
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain('mount');
    const io = seatModuleForKind({ ...meterManifest, kind: 'io' }, { mount: mountMeter });
    expect(io.ok).toBe(false);
    if (!io.ok) expect(io.error).toContain('io');
  });
});

describe('installPluginBundle registers, then seats', () => {
  it('installs an instrument: registry entry, seated code, source to persist', async () => {
    const zip = bundleZip(supersawManifest, './index.ts', 'export const renderNote = () => {};');
    const result = await installPluginBundle(zip, createRegistry(), {
      importModule: async () => ({ renderNote: renderSupersaw }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.install.entry.manifest.id).toBe('com.example.supersaw');
    expect(result.install.seated?.kind).toBe('instrument');
    expect(result.install.unseatedReason).toBeNull();
    expect(result.install.moduleText).toContain('renderNote');
    expect(result.install.registry).toHaveLength(1);
  });

  it('leaves the registry unchanged on a corrupt archive or a bad manifest', async () => {
    const registry = createRegistry();
    const corrupt = await installPluginBundle(new Uint8Array([7, 7, 7, 7]), registry);
    expect(corrupt.ok).toBe(false);
    if (!corrupt.ok) expect(corrupt.registry).toEqual(registry);
    const badManifest = await installPluginBundle(bundleZip({ nope: true }, 'index.js', 'x'), registry, {
      importModule: async () => ({}),
    });
    expect(badManifest.ok).toBe(false);
    if (!badManifest.ok) expect(badManifest.registry).toEqual(registry);
  });

  it('registers but does not seat when the module will not arrive or pass', async () => {
    const zip = bundleZip(meterManifest, './index.ts', 'export const mount = () => {};');
    const unseated = await installPluginBundle(zip, createRegistry(), { importModule: async () => ({}) });
    expect(unseated.ok).toBe(true);
    if (!unseated.ok) return;
    expect(unseated.install.seated).toBeNull();
    expect(unseated.install.unseatedReason).toContain('mount');
    expect(unseated.install.registry).toHaveLength(1);
    const thrown = await installPluginBundle(zip, createRegistry(), {
      importModule: async () => {
        throw new Error('no such file');
      },
    });
    expect(thrown.ok).toBe(true);
    if (!thrown.ok) return;
    expect(thrown.install.seated).toBeNull();
    expect(thrown.install.registry).toHaveLength(1);
  });
});

describe('installs remember where they came from', () => {
  it('carries a named source through the install, or null when unnamed', async () => {
    const zip = bundleZip(supersawManifest, './index.ts', 'export const renderNote = () => {};');
    const named = await installPluginBundle(zip, createRegistry(), {
      importModule: async () => ({ renderNote: renderSupersaw }),
      source: 'https://example.com/supersaw.tracklet-plugin',
    });
    expect(named.ok).toBe(true);
    if (!named.ok) return;
    expect(named.install.source).toBe('https://example.com/supersaw.tracklet-plugin');
    const unnamed = await installPluginBundle(zip, createRegistry(), {
      importModule: async () => ({ renderNote: renderSupersaw }),
    });
    expect(unnamed.ok).toBe(true);
    if (!unnamed.ok) return;
    expect(unnamed.install.source).toBeNull();
    // A failed install records nothing, because nothing installed.
    const corrupt = await installPluginBundle(new Uint8Array([7, 7, 7, 7]), createRegistry(), {
      source: 'https://example.com/broken.tracklet-plugin',
    });
    expect(corrupt.ok).toBe(false);
  });

  it('cleans a source for remembering: trims, drops blanks, caps length', () => {
    expect(normalizePluginSource('https://example.com/x.tracklet-plugin')).toBe(
      'https://example.com/x.tracklet-plugin',
    );
    expect(normalizePluginSource('  file.tracklet-plugin  ')).toBe('file.tracklet-plugin');
    expect(normalizePluginSource('')).toBeNull();
    expect(normalizePluginSource('   ')).toBeNull();
    expect(normalizePluginSource(undefined)).toBeNull();
    expect(normalizePluginSource(42)).toBeNull();
    const long = normalizePluginSource(`https://example.com/${'p'.repeat(600)}`);
    expect(long?.length).toBe(512);
    expect(long?.startsWith('https://example.com/')).toBe(true);
  });
});

describe('installed code carries a fingerprint', () => {
  it('hashes deterministically: eight hex digits, empty is the basis', () => {
    expect(fingerprintPluginCode('')).toBe('811c9dc5');
    expect(fingerprintPluginCode('export const renderNote = () => {};')).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprintPluginCode('a')).toBe(fingerprintPluginCode('a'));
    expect(fingerprintPluginCode('a')).not.toBe(fingerprintPluginCode('b'));
    // Unicode is bytes, not code points: no throw, still eight hex.
    expect(fingerprintPluginCode('säge 🎹')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('weighs what was installed, on every path that installs', async () => {
    const zip = bundleZip(supersawManifest, './index.ts', 'export const renderNote = () => {};');
    const seated = await installPluginBundle(zip, createRegistry(), {
      importModule: async () => ({ renderNote: renderSupersaw }),
    });
    expect(seated.ok).toBe(true);
    if (!seated.ok) return;
    expect(seated.install.fingerprint).toBe(fingerprintPluginCode(seated.install.moduleText));
    const unseated = await installPluginBundle(zip, createRegistry(), { importModule: async () => ({}) });
    expect(unseated.ok).toBe(true);
    if (!unseated.ok) return;
    expect(unseated.install.fingerprint).toBe(fingerprintPluginCode(unseated.install.moduleText));
  });

  it('seats matching code, grandfathers unweighed code, refuses changed code', () => {
    const text = 'export const renderNote = () => {};';
    const weighed = { 'com.example.supersaw': fingerprintPluginCode(text) };
    expect(pluginCodeMatchesFingerprint('com.example.supersaw', text, weighed)).toBe(true);
    expect(pluginCodeMatchesFingerprint('com.example.supersaw', `${text} `, weighed)).toBe(false);
    // Installed before fingerprints existed: seats as before, never bricked.
    expect(pluginCodeMatchesFingerprint('com.example.old', text, weighed)).toBe(true);
    expect(pluginCodeMatchesFingerprint('com.example.old', text, {})).toBe(true);
  });

  it('remembers weights under their own key, and forgets them', () => {
    const store = memoryStore();
    expect(loadPluginFingerprints(store)).toEqual({});
    const print = fingerprintPluginCode('code-a');
    expect(savePluginFingerprint('com.example.supersaw', print, store)).toBe(true);
    expect(savePluginFingerprint('com.example.x', 'not-hex', store)).toBe(false);
    expect(loadPluginFingerprints(store)).toEqual({ 'com.example.supersaw': print });
    forgetPluginFingerprint('com.example.supersaw', store);
    expect(loadPluginFingerprints(store)).toEqual({});
    forgetPluginFingerprint('nobody', store);
    expect(loadPluginFingerprints(null)).toEqual({});
  });

  it('drops a malformed weights shelf rather than the weights', () => {
    const store = memoryStore();
    store.data.set('tracklet.pluginFingerprints', 'not json{');
    expect(loadPluginFingerprints(store)).toEqual({});
    store.data.set(
      'tracklet.pluginFingerprints',
      JSON.stringify({ ok: '811c9dc5', bad: 'zzz', short: 'abc', empty: '' }),
    );
    expect(loadPluginFingerprints(store)).toEqual({ ok: '811c9dc5' });
  });
});

describe('installed sources survive a reload', () => {
  it('saves, loads and forgets one plugin at a time', () => {
    const store = memoryStore();
    expect(loadInstalledPluginCode(store)).toEqual({});
    expect(saveInstalledPluginCode('com.example.meter-panel', 'code-a', store)).toBe(true);
    expect(saveInstalledPluginCode('com.example.supersaw', 'code-b', store)).toBe(true);
    expect(loadInstalledPluginCode(store)).toEqual({
      'com.example.meter-panel': 'code-a',
      'com.example.supersaw': 'code-b',
    });
    forgetInstalledPluginCode('com.example.meter-panel', store);
    expect(loadInstalledPluginCode(store)).toEqual({ 'com.example.supersaw': 'code-b' });
    forgetInstalledPluginCode('nobody', store);
    expect(loadInstalledPluginCode(null)).toEqual({});
  });

  it('drops a malformed shelf rather than the plugins', () => {
    const store = memoryStore();
    store.data.set('tracklet.pluginCode', 'not json{');
    expect(loadInstalledPluginCode(store)).toEqual({});
    store.data.set('tracklet.pluginCode', JSON.stringify({ ok: 'yes', bad: 42, empty: '' }));
    expect(loadInstalledPluginCode(store)).toEqual({ ok: 'yes' });
  });
});

describe('install origins survive a reload', () => {
  it('saves, loads and forgets one origin at a time', () => {
    const store = memoryStore();
    expect(loadPluginSources(store)).toEqual({});
    expect(savePluginSource('com.example.supersaw', 'https://example.com/supersaw.tracklet-plugin', store)).toBe(
      true,
    );
    expect(savePluginSource('com.example.meter-panel', 'bundle:demo.tracklet-bundle.zip', store)).toBe(true);
    expect(loadPluginSources(store)).toEqual({
      'com.example.supersaw': 'https://example.com/supersaw.tracklet-plugin',
      'com.example.meter-panel': 'bundle:demo.tracklet-bundle.zip',
    });
    forgetPluginSource('com.example.supersaw', store);
    expect(loadPluginSources(store)).toEqual({ 'com.example.meter-panel': 'bundle:demo.tracklet-bundle.zip' });
    forgetPluginSource('nobody', store);
    expect(loadPluginSources(null)).toEqual({});
  });

  it('writes no blank row, and drops a malformed shelf', () => {
    const store = memoryStore();
    expect(savePluginSource('com.example.x', '   ', store)).toBe(true);
    expect(loadPluginSources(store)).toEqual({});
    store.data.set('tracklet.pluginSources', 'not json{');
    expect(loadPluginSources(store)).toEqual({});
    store.data.set('tracklet.pluginSources', JSON.stringify({ ok: 'yes', bad: 42, empty: '' }));
    expect(loadPluginSources(store)).toEqual({ ok: 'yes' });
  });
});
