/**
 * meter-panel — the first proof that a plugin can be a page.
 *
 * The song as a meter: one bar per channel, sized by notes, plus the machine's
 * hits and where transport is. Rendered as PURE data — `meterHtml(song, theme,
 * transport)` is a string in, a string out — so the box it lands in is the
 * host's business and the text it shows is unit tested here rather than in a
 * browser. `mount` writes that string into its own element and nothing else:
 * no `document`, no selectors, no global CSS. `update` rewrites it on a song
 * replace, a theme change or a text-scale change, so the panel survives all
 * three without remounting; `unmount` empties the box and leaves siblings
 * alone, so uninstalling cannot break the seven built-in pages.
 *
 * Structural types mirror `src/plugins/panel.ts` so this example stays
 * self-contained; the SDK turns this copy-paste into an import.
 */

export interface PanelTrackView {
  name: string;
  notes: number;
}

export interface PanelSongView {
  title: string;
  tracks: PanelTrackView[];
  machineHits: number;
}

export interface PanelTheme {
  text: string;
  background: string;
  accent: string;
  textScale: number;
}

export interface PanelTransport {
  playing: boolean;
  bar: number;
}

export interface PanelApi {
  song: PanelSongView;
  theme: PanelTheme;
  transport: PanelTransport;
  notify(message: string): void;
  close(): void;
}

export interface PanelBox {
  innerHTML: string;
}

/** User text as text: titles and channel names cannot smuggle markup into the box. */
export function escapeMeterText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One row: the channel's name and its bar, sized against the fullest channel. */
export function meterRow(track: PanelTrackView, loudest: number, accent: string): string {
  const width = loudest <= 0 ? 0 : Math.round((Math.max(0, track.notes) / loudest) * 100);
  return `<div class="tpl-meter-row"><span>${escapeMeterText(track.name)}</span>` +
    `<span style="background:${accent};width:${width}%">${track.notes}</span></div>`;
}

/** The whole box: the title, one row per channel, the machine, transport. */
export function meterHtml(song: PanelSongView, theme: PanelTheme, transport: PanelTransport): string {
  const loudest = song.tracks.reduce((peak, track) => Math.max(peak, track.notes), 0);
  const size = Math.max(8, Math.round(8 * theme.textScale));
  const rows = song.tracks.map((track) => meterRow(track, loudest, theme.accent)).join('');
  const motion = transport.playing ? `playing bar ${transport.bar}` : 'stopped';
  return `<div class="tpl-meter" style="color:${theme.text};background:${theme.background};font-size:${size}px">` +
    `<div class="tpl-meter-title">${escapeMeterText(song.title)} — ${motion}</div>${rows}` +
    `<div class="tpl-meter-machine">machine ${song.machineHits} hits</div></div>`;
}

/** Fill the panel's own box with the meter, and repaint it on every update. */
export function mount(
  el: PanelBox,
  api: PanelApi,
): { unmount(): void; update(api: PanelApi): void } {
  const paint = (seen: PanelApi): void => {
    el.innerHTML = meterHtml(seen.song, seen.theme, seen.transport);
  };
  paint(api);
  return {
    update(next: PanelApi): void {
      paint(next);
    },
    unmount(): void {
      el.innerHTML = '';
    },
  };
}
