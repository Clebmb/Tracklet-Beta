import { describe, expect, it } from 'vitest';

import { applyScript, createSong } from '../model';
import { SCRIPT_VERSION } from '../model/capabilities';
import { PLUGIN_LOCK_SONG_FILE_VERSION, songFromJson, songToJson } from '../model/songfile';
import { encodeWav } from '../audio/wav';
import { zipStore } from '../audio/zip';
import { fetchPluginBundle, pluginMigrationNotices, songPluginIds } from '../plugins/install';
import {
  buildSongBundle,
  bundleFileKind,
  parseSongBundle,
  songBundleFileName,
} from '../plugins/bundle';
import meterManifest from '../../examples/plugins/meter-panel/manifest.json';
import supersawManifest from '../../examples/plugins/supersaw/manifest.json';

const SUPERSAW = 'com.example.supersaw';
const METER = 'com.example.meter-panel';
const BITCRUSH = 'com.example.bitcrush-plus';

/** A song naming an instrument, an effect and a panel's id. */
function pluginedSong() {
  const song = createSong();
  song.tracks[0]!.plugin = SUPERSAW;
  song.tracks[1]!.fx = [{ id: BITCRUSH, amount: 40 }];
  return song;
}

describe('the plugin word installs from a URL you approve', () => {
  it('carries the URL out in settings, fetching nothing itself', () => {
    const result = applyScript(createSong(), 'new\nplugin install "https://example.com/reverb.tracklet-plugin"');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.pluginInstall).toBe('https://example.com/reverb.tracklet-plugin');
  });

  it('refuses a bare plugin, a missing URL, and anything but the four subcommands', () => {
    for (const line of ['new\nplugin', 'new\nplugin install', 'new\nplugin remove https://example.com/x']) {
      const result = applyScript(createSong(), line);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]?.message).toContain('plugin');
    }
  });

  it('is a version-55 word', () => {
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(55);
  });
});

describe('the plugin word forgets by id', () => {
  it('carries one uninstall id out in settings, forgetting nothing itself', () => {
    const result = applyScript(createSong(), 'new\nplugin uninstall com.example.reverb');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.pluginUninstall).toBe('com.example.reverb');
  });

  it('refuses an uninstall with no id, or more than one word', () => {
    for (const line of ['new\nplugin uninstall', 'new\nplugin uninstall com.example.a com.example.b']) {
      const result = applyScript(createSong(), line);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]?.message).toContain('plugin uninstall needs one id');
    }
  });

  it('is the same version-55 word as install', () => {
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(55);
  });
});

describe('the plugin word answers permissions', () => {
  it('carries one allow and one deny out in settings, deciding nothing itself', () => {
    const allow = applyScript(createSong(), 'new\nplugin allow com.example.reverb storage');
    expect(allow.ok).toBe(true);
    if (allow.ok) expect(allow.settings.pluginGrant).toEqual({ id: 'com.example.reverb', permission: 'storage', allow: true });
    const deny = applyScript(createSong(), 'new\nplugin deny com.example.reverb storage');
    expect(deny.ok).toBe(true);
    if (deny.ok) expect(deny.settings.pluginGrant).toEqual({ id: 'com.example.reverb', permission: 'storage', allow: false });
  });

  it('keeps the last answer when a script argues with itself', () => {
    const result = applyScript(createSong(), 'new\nplugin allow com.example.reverb storage\nplugin deny com.example.reverb storage');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.pluginGrant).toEqual({ id: 'com.example.reverb', permission: 'storage', allow: false });
  });

  it('refuses a missing id, missing or extra words, and a word no host grants', () => {
    for (const line of [
      'new\nplugin allow',
      'new\nplugin allow com.example.reverb',
      'new\nplugin allow com.example.reverb storage extra',
      'new\nplugin allow com.example.reverb location',
      'new\nplugin deny com.example.reverb',
    ]) {
      const result = applyScript(createSong(), line);
      expect(result.ok).toBe(false);
    }
  });

  it('names the shape for a bad shape and the closed list for a bad word', () => {
    const shape = applyScript(createSong(), 'new\nplugin deny com.example.reverb');
    expect(shape.ok).toBe(false);
    if (!shape.ok) expect(shape.errors[0]?.message).toContain('needs one id and one permission');
    const word = applyScript(createSong(), 'new\nplugin allow com.example.reverb location');
    expect(word.ok).toBe(false);
    if (!word.ok) expect(word.errors[0]?.message).toContain('not a permission the host grants');
  });

  it('leaves an unknown id to the scene: parse keeps it, refusal is not parse', () => {
    const result = applyScript(createSong(), 'new\nplugin allow com.example.nobody storage');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.pluginGrant?.id).toBe('com.example.nobody');
  });

  it('is the same version-55 word as install', () => {
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(55);
  });
});

describe('fetchPluginBundle fetches only what you approved', () => {
  const bytes = new Uint8Array([80, 75, 3, 4]);

  it('hands over the bytes of an http(s) answer', async () => {
    for (const url of ['https://example.com/r.tracklet-plugin', 'http://example.com/r.tracklet-plugin']) {
      const result = await fetchPluginBundle(url, async () => ({ ok: true, status: 200, bytes: async () => bytes }));
      expect(result).toEqual({ ok: true, bytes });
    }
  });

  it('refuses other schemes before a packet forms', async () => {
    let called = 0;
    for (const url of ['file:///tmp/evil.tracklet-plugin', 'javascript:alert(1)', 'not a url']) {
      const result = await fetchPluginBundle(url, async () => {
        called += 1;
        return { ok: true, status: 200, bytes: async () => bytes };
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('http(s)');
    }
    expect(called).toBe(0);
  });

  it('names HTTP failures and dead servers', async () => {
    const missing = await fetchPluginBundle('https://example.com/gone', async () => ({
      ok: false,
      status: 404,
      bytes: async () => bytes,
    }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('404');
    const dead = await fetchPluginBundle('https://example.com/x', async () => {
      throw new Error('down');
    });
    expect(dead.ok).toBe(false);
    if (!dead.ok) expect(dead.error).toContain('did not answer');
  });
});

describe('songPluginIds names every plugin the song pins', () => {
  it('dedups instruments and inserts in first-mention order', () => {
    expect(songPluginIds(createSong())).toEqual([]);
    expect(songPluginIds(pluginedSong())).toEqual([SUPERSAW, BITCRUSH]);
  });
});

describe('pluginMigrationNotices holds the lock against this machine', () => {
  const known = [
    { id: SUPERSAW, version: '1.1.0', enabled: true },
    { id: BITCRUSH, version: '1.0.0', enabled: true },
    { id: METER, version: '2.0.0', enabled: false },
  ];

  it('is silent on a match', () => {
    expect(pluginMigrationNotices({ [BITCRUSH]: '1.0.0' }, known)).toEqual([]);
  });

  it('names the missing, the disabled, and the moved', () => {
    const notices = pluginMigrationNotices(
      {
        'com.example.gone': '1.0.0',
        [METER]: '2.0.0',
        [SUPERSAW]: '1.0.0',
        [BITCRUSH]: '1.2.0',
      },
      known,
    );
    expect(notices).toHaveLength(4);
    expect(notices[0]).toContain('not installed');
    expect(notices[1]).toContain('disabled');
    expect(notices[2]).toContain('1.0.0 to 1.1.0');
    expect(notices[3]).toContain('older');
  });

  it('warns loudly across a major, and forgives a mangled pin', () => {
    const major = pluginMigrationNotices({ [SUPERSAW]: '1.1.0' }, [{ id: SUPERSAW, version: '2.0.0', enabled: true }]);
    expect(major).toHaveLength(1);
    expect(major[0]).toContain('major');
    const mangled = pluginMigrationNotices({ [SUPERSAW]: 'someday' }, known);
    expect(mangled).toHaveLength(1);
    expect(mangled[0]).toContain('not a version');
  });
});

describe('the lockfile pins what the song was saved against', () => {
  it('writes versions and rung 45 only when something is pinned', () => {
    const plain = JSON.parse(songToJson(createSong()));
    expect(plain.pluginVersions).toBeUndefined();
    expect(plain.version).not.toBe(PLUGIN_LOCK_SONG_FILE_VERSION);
    const locked = JSON.parse(songToJson(pluginedSong(), { volume: null }, { [SUPERSAW]: '1.0.0', [BITCRUSH]: '2.3.1' }));
    expect(locked.version).toBe(PLUGIN_LOCK_SONG_FILE_VERSION);
    expect(locked.pluginVersions).toEqual({ [SUPERSAW]: '1.0.0', [BITCRUSH]: '2.3.1' });
  });

  it('round-trips through the reader, mangling forgiven', () => {
    const text = songToJson(pluginedSong(), { volume: null }, { [SUPERSAW]: '1.0.0' });
    const back = songFromJson(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.pluginVersions).toEqual({ [SUPERSAW]: '1.0.0' });
    const mangled = JSON.parse(text) as Record<string, unknown>;
    mangled.pluginVersions = { [SUPERSAW]: 42, [BITCRUSH]: '2.0.0', stray: '' };
    const read = songFromJson(JSON.stringify(mangled));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.pluginVersions).toEqual({ [BITCRUSH]: '2.0.0' });
  });
});

describe('a song bundle carries the song plus what it names', () => {
  const songJson = songToJson(pluginedSong());
  const wavBytes = new Uint8Array(encodeWav({ channels: [Float32Array.from([0, 0.5, -0.5])], sampleRate: 22050 }));

  function exampleBundle() {
    return buildSongBundle({
      songJson,
      plugins: [{ id: METER, manifestJson: meterManifest, moduleText: 'export const mount = () => {};', entry: './index.ts' }],
      samples: [{ name: 'BRK', wavBytes }],
    });
  }

  it('round-trips song, plugins and samples', () => {
    const parsed = parseSongBundle(exampleBundle());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.songJson).toBe(songJson);
    expect(parsed.bundle.plugins).toHaveLength(1);
    expect(parsed.bundle.plugins[0]?.id).toBe(METER);
    expect(parsed.bundle.plugins[0]?.moduleText).toContain('mount');
    expect(parsed.bundle.samples).toHaveLength(1);
    expect(parsed.bundle.samples[0]?.name).toBe('BRK');
    expect(parsed.bundle.samples[0]?.wavBytes).toEqual(wavBytes);
  });

  it('packs a song that names nothing and still opens', () => {
    const parsed = parseSongBundle(buildSongBundle({ songJson, plugins: [], samples: [] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.plugins).toEqual([]);
    expect(parsed.bundle.samples).toEqual([]);
    expect(parsed.bundle.kits).toEqual([]);
  });

  it('carries the KIT the song names, so the drums arrive', () => {
    // Without this a bundle arrived with the right kit NAME and the wrong drums:
    // the fallback preset, and nothing said so.
    const kit = { name: 'MYHOUSE', voices: { kick: { wave: 'sine' } } };
    const bytes = buildSongBundle({ songJson, plugins: [], samples: [], kits: [{ name: 'MYHOUSE', json: kit }] });
    const parsed = parseSongBundle(bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.kits).toEqual([{ name: 'MYHOUSE', json: kit }]);
  });

  it('refuses a kit inside a bundle that is not JSON, naming it', () => {
    const broken = zipStore([
      { name: 'song.json', bytes: new TextEncoder().encode(songJson) },
      { name: 'kits/MYHOUSE.json', bytes: new TextEncoder().encode('{nope') },
    ]);
    const parsed = parseSongBundle(broken);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('MYHOUSE');
  });

  it('refuses what is not a bundle, naming the break', () => {
    expect(parseSongBundle(new Uint8Array([1, 2, 3, 4])).ok).toBe(false);
    const noSong = parseSongBundle(zipStore([{ name: 'plugins/x/manifest.json', bytes: new Uint8Array([123, 125]) }]));
    expect(noSong.ok).toBe(false);
    if (!noSong.ok) expect(noSong.error).toContain('song.json');
    const wrongFormat = buildSongBundle({ songJson: '{"format":"tracklet-patch"}', plugins: [], samples: [] });
    const refused = parseSongBundle(wrongFormat);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain('tracklet-song');
  });

  it('tells bundles, plugins and other zips apart, and names its file', () => {
    expect(bundleFileKind(exampleBundle())).toBe('song-bundle');
    const pluginZip = zipStore([
      { name: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(supersawManifest)) },
      { name: 'index.ts', bytes: new TextEncoder().encode('x') },
    ]);
    expect(bundleFileKind(pluginZip)).toBe('plugin-bundle');
    expect(bundleFileKind(zipStore([{ name: 'notes.txt', bytes: new Uint8Array([1]) }]))).toBe('other');
    expect(songBundleFileName('my-tune')).toBe('my-tune.tracklet-bundle.zip');
  });
});
