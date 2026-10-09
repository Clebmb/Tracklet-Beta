/**
 * instrumentRows — the instrument browser's CONTENT, as data.
 *
 * `InstrumentBrowser.ts` owns the frame, the scrolling and the colours; this
 * file owns what the reader actually reads. Splitting them keeps the browser
 * Phaser-free in its content and, more usefully, TESTABLE: the promise that the
 * screen shows every wave, knob, voice and console the app has is a property of
 * the catalog, and it can be checked without a canvas or a browser.
 *
 * Every row is derived from `model/catalog.ts`, which is itself derived from the
 * engine's tables — so a new voice appears here with no edit, and this screen
 * cannot advertise a sound the app cannot make.
 */

import { DRUM_BY_ID, WAVE_LABELS, type InstrumentCatalog, type VoiceParams } from '../model';

/**
 * How many word-wrapped lines a detail pane may hold.
 *
 * Shared with the browser so a blurb that grows past the pane is caught by a
 * test rather than clipped on screen.
 */
export const MAX_DETAIL_LINES = 17;

/** What the reader is looking at: a section title, or something selectable. */
export type Row =
  | { kind: 'heading'; text: string }
  | { kind: 'item'; title: string; detail: readonly string[] };

/**
 * Greedy word wrap, by character count.
 *
 * A character count rather than a pixel measure because the copy is 8px UI type
 * and a rough bound is enough to keep a blurb inside its pane; measuring every
 * string would be a `Text` object per word.
 */
export function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter((word) => word !== '');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/**
 * A voice's knobs, split into lines a reader can scan.
 *
 * Chunked rather than one long string because nine knobs is wider than the
 * browser's detail pane: laying them out a few to a line keeps the readout
 * inside the frame, and puts a break at a knob boundary rather than wherever the
 * text happened to run out of room. `wave` is left out — it is shown on its own
 * line above, and a waveform is not a percentage.
 */
export function knobLines(params: VoiceParams, perLine = 5): string[] {
  const parts = (Object.keys(params) as (keyof VoiceParams)[])
    .filter((key) => key !== 'wave')
    .map((key) => `${key} ${params[key]}`);
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += perLine) lines.push(parts.slice(i, i + perLine).join('  '));
  return lines;
}

/**
 * The whole catalog as a flat list of rows, with a heading before each section.
 *
 * `width` is where the prose wraps, so the caller's layout decides the column
 * and this function stays ignorant of pixels. The list is built once per call
 * and the vocabulary cannot change while the app runs, so there is nothing to
 * recompute on every open.
 */
export function browserRows(catalog: InstrumentCatalog, width = 64): Row[] {
  const rows: Row[] = [];

  rows.push({ kind: 'heading', text: 'WAVES' });
  for (const wave of catalog.waves) {
    rows.push({
      kind: 'item',
      title: `${wave.label}   ${wave.id}`,
      detail: [`WAVE — ${wave.id.toUpperCase()}`, '', ...wrap(wave.blurb, width), '', `script:  track 1 wave ${wave.id}`],
    });
  }

  rows.push({ kind: 'heading', text: 'THE KNOBS' });
  for (const knob of catalog.knobs) {
    rows.push({
      kind: 'item',
      title: knob.label,
      detail: [
        `${knob.label}  (${knob.id})`,
        `${knob.low.toUpperCase()}  ...  ${knob.high.toUpperCase()}`,
        '',
        ...wrap(knob.blurb, width),
        '',
        ...wrap(`also written: ${knob.aliases.join(', ')}`, width),
      ],
    });
  }

  rows.push({ kind: 'heading', text: 'VOICES' });
  for (const family of catalog.families) {
    const voices = catalog.voices.filter((voice) => voice.family === family.id);
    if (voices.length === 0) continue;
    // The count, so a family heading cannot be mistaken for a voice of the same
    // name — the `lead` family and the `lead` voice are two different rows.
    rows.push({ kind: 'heading', text: `  ${family.heading}   ${voices.length}` });
    for (const voice of voices) {
      rows.push({
        kind: 'item',
        title: voice.label.toUpperCase(),
        detail: [
          `${voice.label.toUpperCase()}   (${family.heading})`,
          '',
          ...wrap(voice.blurb, width),
          '',
          `wave: ${voice.params.wave}`,
          ...knobLines(voice.params),
          '',
          `script:  track 1 voice ${voice.id}`,
        ],
      });
    }
  }

  rows.push({ kind: 'heading', text: 'EFFECTS' });
  for (const effect of catalog.effects) {
    rows.push({
      kind: 'item',
      title: effect.label,
      detail: [
        `${effect.label}  (on a track or master line)`,
        `${effect.low.toUpperCase()}  ...  ${effect.high.toUpperCase()}`,
        '',
        ...wrap(effect.blurb, width),
        '',
        ...wrap(`reach for it: ${effect.reach}`, width),
        '',
        `script:  track 1 ${effect.id} 40`,
      ],
    });
  }

  // The pump, listed with the effects rather than after them: it is the other
  // half of the same question ("how do I make this part sit right?"), and it is
  // the only control in this browser whose effect lands on the channels it is NOT
  // on — which its own first line says.
  rows.push({
    kind: 'item',
    title: catalog.duck.label,
    detail: [
      `${catalog.duck.label}  (on a track line)`,
      `${catalog.duck.low.toUpperCase()}  ...  ${catalog.duck.high.toUpperCase()}`,
      '',
      ...wrap(catalog.duck.blurb, width),
      '',
      ...wrap(`reach for it: ${catalog.duck.reach}`, width),
      '',
      `script:  ${catalog.duck.script}`,
    ],
  });

  // The filter SHAPES, beside the effects for the same reason: a `track` setting
  // with no menu of its own, where "which part of the sound survives" is a choice
  // a person makes once and then forgets the name of. Listed from the model's own
  // table, so the four here are the four the parser accepts.
  rows.push({ kind: 'heading', text: 'FILTER SHAPES' });
  for (const shape of catalog.shapes) {
    rows.push({
      kind: 'item',
      title: shape.label,
      detail: [
        `${shape.label}  (on a track line${shape.atDefault ? ', and the default' : ''})`,
        '',
        ...wrap(shape.blurb, width),
        '',
        ...wrap(`reach for it: ${shape.reach}`, width),
        '',
        `script:  ${shape.script}`,
      ],
    });
  }

  // The KITS, beside the shapes for the same reason and one scope over: a
  // song-wide word with no menu of its own, where "which kit" is a question about
  // a SOUND rather than a setting — so each row shows the four drum patches it
  // swaps. Listed from the model's own table, so the four here are the four the
  // parser accepts.
  rows.push({ kind: 'heading', text: 'DRUM KITS' });
  for (const kit of catalog.kits) {
    rows.push({
      kind: 'item',
      title: kit.label,
      detail: [
        `${kit.label}  (kit ${kit.id}${kit.atDefault ? ', and the default' : ''})`,
        '',
        ...wrap(kit.blurb, width),
        '',
        ...wrap(`reach for it: ${kit.reach}`, width),
        '',
        'its drums:',
        ...kit.voices.map((voice) =>
          `${DRUM_BY_ID[voice.drum].short}  ${voice.params.wave}   bright ${voice.params.bright}  noise ${voice.params.noise}  ring ${voice.params.ring}`),
        '',
        `script:  ${kit.script}`,
      ],
    });
  }

  rows.push({ kind: 'heading', text: 'CONSOLES' });
  for (const chip of catalog.chips) {
    rows.push({
      kind: 'item',
      title: chip.label,
      detail: [
        `${chip.label}  (chip ${chip.id})`,
        '',
        ...wrap(chip.blurb, width),
        '',
        'its channels:',
        ...chip.roles.map((role, i) => `${i + 1}  ${WAVE_LABELS[role.wave]}   bright ${role.bright}  ring ${role.ring}`),
        '',
        `script:  tracks ${chip.roles.length}   chip ${chip.id}`,
      ],
    });
  }

  return rows;
}

/** The selectable rows, in order, as indices into the flat list. */
export function selectableRows(rows: readonly Row[]): number[] {
  return rows.map((row, i) => (row.kind === 'item' ? i : -1)).filter((i) => i >= 0);
}

/**
 * The rows a search leaves: every ITEM whose title or detail contains the query,
 * each under the nearest heading above it.
 *
 * Item-only on purpose. A heading is a label rather than a result, so a query
 * that happens to appear in one (`VOICES`) does not drag a whole section in; what
 * a person is looking for is an entry — a wave, a knob, a voice, a kit — and the
 * heading is there to say where it lives. One heading covers a whole RUN of
 * matches, so a result list reads the way the full list does.
 *
 * A blank query returns the list untouched, which is what makes clearing the
 * search free and exact: the browser's own list is never rebuilt or lost.
 */
export function searchRows(rows: readonly Row[], query: string): Row[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...rows];
  const out: Row[] = [];
  let heading: Row | null = null;
  let headingShown: Row | null = null;
  for (const row of rows) {
    if (row.kind === 'heading') { heading = row; continue; }
    const haystack = `${row.title} ${row.detail.join(' ')}`.toLowerCase();
    if (!haystack.includes(needle)) continue;
    if (heading !== null && heading !== headingShown) {
      out.push(heading);
      headingShown = heading;
    }
    out.push(row);
  }
  return out;
}
