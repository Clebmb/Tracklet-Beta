import { describe, expect, it } from 'vitest';

import { THEMES } from '../../vendor/phaser-ui-canvas/src/theme/themes';
import {
  CONTRAST_AA_LARGE,
  contrastRatio,
  formatContrast,
  isBodyTextLegible,
} from '../ui/contrast';
import { textScaleFactor } from '../ui/textScale';
import { applyScript, createSong } from '../model';
import {
  createPanelCodeBank,
  describePanel,
  findPanelCode,
  isPanelPageRef,
  panelClass,
  panelCodeIds,
  panelPageRef,
  panelTransport,
  parsePanelRef,
  resolvePanelRef,
  scopePanelElement,
  seatPanelCode,
  unseatPanelCode,
  type PanelApi,
  type PanelPlugin,
  type PanelSongView,
  type PanelTheme,
} from '../plugins/panel';
import { BUILT_IN_PANELS } from '../plugins/builtIn';
import { definePanel } from '../plugins/sdk';
import { seatPanelModule } from '../plugins/loader';
import type { TrackletPluginManifest } from '../plugins/manifest';
import {
  loadInstalledPanelCode,
  panelDropdownRows,
  PluginPanelSession,
  panelCodeMissingNotice,
  panelThemeDigest,
  routePageSelection,
} from '../ui/pluginPanel';
import meterManifest from '../../examples/plugins/meter-panel/manifest.json';
import { escapeMeterText, meterHtml, mount as mountMeter } from '../../examples/plugins/meter-panel/index';

/** A fresh song with something in it, as a panel would read it. */
const SONG: PanelSongView = {
  title: 'METER SONG',
  tracks: [
    { name: 'LEAD', notes: 8 },
    { name: 'BASS', notes: 4 },
  ],
  machineHits: 16,
};

const THEME: PanelTheme = { text: '#ffffff', background: '#000000', accent: '#00ff00', textScale: 1 };

function api(song: PanelSongView = SONG): PanelApi {
  const notices: string[] = [];
  let closed = 0;
  return {
    song,
    theme: THEME,
    params: {},
    transport: { playing: false, bar: 1 },
    notify: (message: string) => notices.push(message),
    close: () => {
      closed += 1;
    },
  };
}

/** Apply a fragment, throwing the refusal's own message on failure. */
function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' / '));
  return result;
}

describe('panel references ride the page word', () => {
  it('writes, spots and reads plugin:<id>', () => {
    expect(panelPageRef('com.example.meter-panel')).toBe('plugin:com.example.meter-panel');
    expect(isPanelPageRef('plugin:com.example.meter-panel')).toBe(true);
    expect(isPanelPageRef('mixer')).toBe(false);
    expect(parsePanelRef('plugin:com.example.meter-panel')).toBe('com.example.meter-panel');
    expect(parsePanelRef('plugin:')).toBeNull();
    expect(parsePanelRef('plugin:a b')).toBeNull();
    expect(parsePanelRef('mixer')).toBeNull();
  });

  it('resolves a known panel and falls back to the tracker with words', () => {
    const known = [{ id: 'com.example.meter-panel', enabled: true }];
    expect(resolvePanelRef('plugin:com.example.meter-panel', known)).toEqual({
      kind: 'panel',
      id: 'com.example.meter-panel',
    });
    const missing = resolvePanelRef('plugin:com.example.gone', known);
    expect(missing.kind).toBe('tracker-fallback');
    if (missing.kind === 'tracker-fallback') expect(missing.notice).toContain('not installed');
    const disabled = resolvePanelRef('plugin:com.example.meter-panel', [
      { id: 'com.example.meter-panel', enabled: false },
    ]);
    expect(disabled.kind).toBe('tracker-fallback');
    if (disabled.kind === 'tracker-fallback') expect(disabled.notice).toContain('disabled');
  });

  it('scopes a box to one plugin', () => {
    const added: string[] = [];
    const attrs: Record<string, string> = {};
    const el = {
      classList: { add: (name: string) => added.push(name) },
      setAttribute: (key: string, value: string) => {
        attrs[key] = value;
      },
    } as unknown as HTMLElement;
    scopePanelElement(el, 'com.example.meter-panel');
    expect(added).toEqual(['tpl-p-com-example-meter-panel']);
    expect(attrs['data-tracklet-panel']).toBe('com.example.meter-panel');
    expect(panelClass('com.example.meter-panel')).not.toContain('.');
  });

  it('labels a panel with its id, version and knobs', () => {
    const plugin = BUILT_IN_PANELS[0];
    expect(describePanel(plugin)).toBe('com.example.meter-panel@0.9.0 0 params');
  });
});

describe('the panel trust gate', () => {
  it('seats a panel module with a mount function', () => {
    const defined = definePanel({ manifest: meterManifest, mount: mountMeter });
    expect(defined.ok).toBe(true);
  });

  it('refuses a kind it does not seat, naming the milestone', () => {
    const defined = definePanel({
      manifest: { ...(meterManifest as Record<string, unknown>), kind: 'instrument' },
      mount: mountMeter,
    });
    expect(defined.ok).toBe(false);
    if (!defined.ok) expect(defined.error).toContain('not a panel');
  });

  it('refuses a module with no mount in words', () => {
    const defined = definePanel({ manifest: meterManifest, mount: undefined });
    expect(defined.ok).toBe(false);
    if (!defined.ok) expect(defined.error).toContain('no mount function');
  });

  it('seats the proof through the loader and carries it as a built-in', () => {
    const seated = seatPanelModule(meterManifest, { mount: mountMeter });
    expect(seated.ok).toBe(true);
    expect(BUILT_IN_PANELS.map((plugin) => plugin.manifest.id)).toEqual(['com.example.meter-panel']);
  });
});

describe('the meter proof stays inside its box', () => {
  it('renders one bar per channel, sized by notes', () => {
    const html = meterHtml(SONG, THEME, { playing: false, bar: 1 });
    expect(html).toContain('METER SONG');
    expect(html).toContain('width:100%');
    expect(html).toContain('width:50%');
    expect(html).toContain('machine 16 hits');
    expect(html).toContain('stopped');
  });

  it('says where transport is and honors the theme', () => {
    const html = meterHtml(SONG, THEME, { playing: true, bar: 3 });
    expect(html).toContain('playing bar 3');
    expect(html).toContain('#ffffff');
    expect(html).toContain('#00ff00');
  });

  it('escapes user text rather than printing it', () => {
    expect(escapeMeterText('<b>LOUD</b>')).toBe('&lt;b&gt;LOUD&lt;/b&gt;');
    const html = meterHtml(
      { title: '<i>X</i>', tracks: [{ name: 'A&B', notes: 1 }], machineHits: 0 },
      THEME,
      { playing: false, bar: 1 },
    );
    expect(html).not.toContain('<i>');
    expect(html).toContain('A&amp;B');
  });

  it('mounts, repaints and unmounts without touching a sibling', () => {
    const box = { innerHTML: 'sibling' };
    const mounted = mountMeter(box, api());
    expect(box.innerHTML).toContain('METER SONG');
    mounted.update(api({ ...SONG, title: 'SECOND SONG' }));
    expect(box.innerHTML).toContain('SECOND SONG');
    mounted.unmount();
    expect(box.innerHTML).toBe('');
  });
});

describe('the overlay session', () => {
  const known = [{ id: 'com.example.meter-panel', enabled: true }];

  it('opens a known panel and remembers it', () => {
    const session = new PluginPanelSession();
    expect(session.current).toBeNull();
    expect(session.open('plugin:com.example.meter-panel', known)).toEqual({
      ok: true,
      id: 'com.example.meter-panel',
    });
    expect(session.current).toBe('plugin:com.example.meter-panel');
    expect(session.close()).toBe('plugin:com.example.meter-panel');
    expect(session.current).toBeNull();
    expect(session.close()).toBeNull();
  });

  it('refuses an unknown panel without disturbing what is showing', () => {
    const session = new PluginPanelSession();
    session.open('plugin:com.example.meter-panel', known);
    const refused = session.open('plugin:com.example.gone', known);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.notice).toContain('not installed');
    expect(session.current).toBe('plugin:com.example.meter-panel');
  });

  it('names installed-but-unloaded code in words', () => {
    expect(panelCodeMissingNotice('com.example.meter-panel')).toContain('not loaded');
  });
});

describe('page plugin:<id> in script', () => {
  it('opens a well-formed reference as a session setting', () => {
    const result = applied('new\npage plugin:com.example.meter-panel');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.page).toBe('plugin:com.example.meter-panel');
  });

  it('keeps an unknown id: the fallback is the opener\u2019s business', () => {
    const result = applied('new\npage plugin:com.example.never-existed');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.page).toBe('plugin:com.example.never-existed');
  });

  it('refuses a malformed reference with its own message', () => {
    const result = applyScript(createSong(), 'new\npage plugin:');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain('not a panel reference');
  });

  it('still refuses a page this build does not have', () => {
    const result = applyScript(createSong(), 'new\npage sampler');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain('is not a page');
  });
});

describe('installed panel code: the bank behind the bundle', () => {
  function seatedMeter(): PanelPlugin {
    const seated = seatPanelModule(meterManifest, { mount: mountMeter });
    if (!seated.ok) throw new Error(seated.error);
    return seated.seated.plugin;
  }

  it('finds installed code the bundle does not carry', () => {
    const bank = createPanelCodeBank();
    expect(findPanelCode(bank, BUILT_IN_PANELS, 'com.example.third-panel')).toBeNull();
    const impostor: PanelPlugin = { ...seatedMeter(), manifest: { ...seatedMeter().manifest, id: 'com.example.third-panel' } };
    seatPanelCode(bank, impostor);
    expect(findPanelCode(bank, BUILT_IN_PANELS, 'com.example.third-panel')).toBe(impostor);
  });

  it('lets the bundle win an id clash, and reseating replaces', () => {
    const bank = createPanelCodeBank();
    const impostor: PanelPlugin = { ...seatedMeter(), mount: (() => { throw new Error('impostor'); }) as PanelPlugin['mount'] };
    seatPanelCode(bank, impostor);
    expect(findPanelCode(bank, BUILT_IN_PANELS, 'com.example.meter-panel')).toBe(BUILT_IN_PANELS[0]);
    const replacement: PanelPlugin = { ...impostor, mount: mountMeter as PanelPlugin['mount'] };
    seatPanelCode(bank, replacement);
    expect(bank.plugins).toHaveLength(1);
    expect(bank.plugins[0]).toBe(replacement);
  });

  it('unseats one id and falls back to the bundle; unknown ids change nothing', () => {
    const bank = createPanelCodeBank();
    seatPanelCode(bank, seatedMeter());
    const impostor: PanelPlugin = { ...seatedMeter(), manifest: { ...seatedMeter().manifest, id: 'com.example.third-panel' } };
    seatPanelCode(bank, impostor);
    unseatPanelCode(bank, 'com.example.third-panel');
    expect(findPanelCode(bank, [], 'com.example.third-panel')).toBeNull();
    expect(panelCodeIds(bank, BUILT_IN_PANELS)).toEqual(['com.example.meter-panel']);
    unseatPanelCode(bank, 'com.example.meter-panel');
    expect(findPanelCode(bank, BUILT_IN_PANELS, 'com.example.meter-panel')).toBe(BUILT_IN_PANELS[0]);
    unseatPanelCode(bank, 'com.example.nobody');
    expect(bank.plugins).toHaveLength(0);
  });

  it('lists bundle ids first, then installed extras', () => {
    const bank = createPanelCodeBank();
    seatPanelCode(bank, seatedMeter());
    const impostor: PanelPlugin = { ...seatedMeter(), manifest: { ...seatedMeter().manifest, id: 'com.example.third-panel' } };
    seatPanelCode(bank, impostor);
    expect(panelCodeIds(bank, BUILT_IN_PANELS)).toEqual(['com.example.meter-panel', 'com.example.third-panel']);
  });
});

describe('panel transport: one reading for the box and the frame', () => {
  it('is bar 1 stopped, and walks bars while playing', () => {
    expect(panelTransport(false, -1, 64)).toEqual({ playing: false, bar: 1 });
    expect(panelTransport(true, 0, 64)).toEqual({ playing: true, bar: 1 });
    expect(panelTransport(true, 63, 64)).toEqual({ playing: true, bar: 1 });
    expect(panelTransport(true, 64, 64)).toEqual({ playing: true, bar: 2 });
  });

  it('never divides by a song with no rows', () => {
    expect(panelTransport(true, 128, 0)).toEqual({ playing: true, bar: 1 });
  });
});

describe('the page dropdown lists seated panels', () => {
  it('names one row per known panel, after the seven screens', () => {
    expect(panelDropdownRows([])).toEqual([]);
    expect(panelDropdownRows([{ id: 'com.example.meter-panel', name: 'Meter' }])).toEqual([
      { ref: 'plugin:com.example.meter-panel', label: 'METER' },
    ]);
  });

  it('falls back to the id when the manifest has no name', () => {
    expect(panelDropdownRows([{ id: 'com.example.nameless', name: '  ' }])).toEqual([
      { ref: 'plugin:com.example.nameless', label: 'com.example.nameless' },
    ]);
  });

  it('routes a reference to the overlay and any other id to the screens', () => {
    expect(routePageSelection('plugin:com.example.meter-panel')).toEqual({
      kind: 'panel',
      ref: 'plugin:com.example.meter-panel',
    });
    expect(routePageSelection('mixer')).toEqual({ kind: 'page' });
    expect(routePageSelection('plugin:')).toEqual({ kind: 'page' });
    expect(routePageSelection('plugin:has space')).toEqual({ kind: 'page' });
  });
});

describe('loadInstalledPanelCode seats what passes and nothing else', () => {
  const manifests = [meterManifest as unknown as TrackletPluginManifest];

  it('seats an arriving module so the bank answers it', async () => {
    const bank = createPanelCodeBank();
    const load = await loadInstalledPanelCode(manifests, bank, async () => ({ mount: mountMeter }));
    expect(load).toEqual({ seated: ['com.example.meter-panel'], refused: [], missing: [] });
    expect(findPanelCode(bank, [], 'com.example.meter-panel')?.manifest.id).toBe('com.example.meter-panel');
  });

  it('refuses a module with no mount, seating nothing', async () => {
    const bank = createPanelCodeBank();
    const load = await loadInstalledPanelCode(manifests, bank, async () => ({}));
    expect(load.seated).toEqual([]);
    expect(load.missing).toEqual([]);
    expect(load.refused).toHaveLength(1);
    expect(load.refused[0]?.error).toContain('mount');
    expect(bank.plugins).toEqual([]);
  });

  it('calls a throwing import missing rather than failing the batch', async () => {
    const bank = createPanelCodeBank();
    const load = await loadInstalledPanelCode(manifests, bank, async () => {
      throw new Error('no such file');
    });
    expect(load).toEqual({ seated: [], refused: [], missing: ['com.example.meter-panel'] });
  });

  it('loads nothing without an importer, and skips kinds that are not panels', async () => {
    const bank = createPanelCodeBank();
    const silent = await loadInstalledPanelCode(manifests, bank);
    expect(silent.missing).toEqual(['com.example.meter-panel']);
    const nonPanel = [{ ...meterManifest, kind: 'instrument' } as unknown as TrackletPluginManifest];
    let called = 0;
    const skipped = await loadInstalledPanelCode(nonPanel, bank, async () => {
      called += 1;
      return {};
    });
    expect(called).toBe(0);
    expect(skipped).toEqual({ seated: [], refused: [], missing: [] });
  });
});

describe('the panel theme digest', () => {
  it('digests app colors to CSS and carries the scale untouched', () => {
    expect(panelThemeDigest({ textPrimary: 0xd9d3c3, panelFill: 0x06060d, ooze: 0x7ec850 }, 1.25)).toEqual({
      text: '#d9d3c3',
      background: '#06060d',
      accent: '#7ec850',
      textScale: 1.25,
    });
  });

  it('keeps every shipped theme legible through the panel tokens: body at AA, accent at AA-large', () => {
    // The panel's ACTUAL tokens — textPrimary, panelFill, ooze — rather than
    // the app rows' textGreen: a theme could pass the shipped guard and still
    // hand a panel an unreadable accent, and this is the test that would say.
    const failures: string[] = [];
    const num = (css: string): number => Number.parseInt(css.slice(1), 16);
    for (const theme of THEMES) {
      const digest = panelThemeDigest(theme.colors, 1);
      const body = contrastRatio(num(digest.text), num(digest.background));
      const accent = contrastRatio(num(digest.accent), num(digest.background));
      if (!isBodyTextLegible(body)) failures.push(`${theme.id}: body ${formatContrast(body)}`);
      if (accent < CONTRAST_AA_LARGE) failures.push(`${theme.id}: accent ${formatContrast(accent)}`);
    }
    expect(failures).toEqual([]);
  });

  it('grows the proof panel with the scale, from a readable floor', () => {
    const html = (scale: number): string =>
      meterHtml(SONG, { text: '#ffffff', background: '#000000', accent: '#00ff00', textScale: scale }, {
        playing: false,
        bar: 1,
      });
    expect(html(1)).toContain('font-size:8px');
    expect(html(1.5)).toContain('font-size:12px');
    // The digest carries the factor; the panel decides the pixels.
    expect(panelThemeDigest({ textPrimary: 0, panelFill: 0, ooze: 0 }, textScaleFactor('huge')).textScale).toBe(1.5);
  });
});
