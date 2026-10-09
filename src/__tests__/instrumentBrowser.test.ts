import { describe, expect, it } from 'vitest';

import { DRUM_BY_ID, instrumentCatalog, VOICE_PARAMS, VOICES } from '../model';
import { browserRows, knobLines, MAX_DETAIL_LINES, searchRows, selectableRows, wrap } from '../ui/instrumentRows';

/**
 * The instrument browser's CONTENT, tested as the promise `instrumentRows.ts`
 * makes: it shows everything the app can sound like, read from the catalog, and
 * it cannot show anything that does not exist.
 *
 * The browser is a canvas screen, so these tests do not draw it — they check the
 * rows it will draw, which is where a missing voice or an over-long blurb would
 * actually go wrong.
 */

const catalog = instrumentCatalog();
const rows = browserRows(catalog, 64);
const items = rows.filter((row) => row.kind === 'item');

describe('every part of the vocabulary appears', () => {
  it('lists every waveform', () => {
    for (const wave of catalog.waves) {
      expect(items.some((row) => row.title === `${wave.label}   ${wave.id}`)).toBe(true);
    }
  });

  it('lists every knob', () => {
    for (const knob of catalog.knobs) {
      expect(items.some((row) => row.title === knob.label && row.detail[0].includes(knob.id))).toBe(true);
    }
    expect(items.filter((row) => row.title === 'BRIGHT')).toHaveLength(1);
  });

  it('lists every voice, under its family', () => {
    for (const voice of VOICES) {
      expect(items.some((row) => row.title === voice.label.toUpperCase())).toBe(true);
    }
    for (const family of catalog.families) {
      expect(rows.some((row) => row.kind === 'heading' && row.text.trim().startsWith(family.heading))).toBe(true);
    }
  });

  it('lists every console, with its whole channel line-up', () => {
    for (const chip of catalog.chips) {
      const row = items.find((r) => r.title === chip.label);
      expect(row).toBeTruthy();
      // One detail line per channel, plus the heading, blurb and script line.
      expect(row!.detail.some((line) => line.startsWith('1  '))).toBe(true);
      expect(row!.detail).toContain(`script:  tracks ${chip.roles.length}   chip ${chip.id}`);
    }
  });

  it('lists every channel effect', () => {
    for (const effect of catalog.effects) {
      const row = items.find((r) => r.title === effect.label);
      expect(row).toBeTruthy();
      expect(row!.detail).toContain(`script:  track 1 ${effect.id} 40`);
    }
  });

  it('lists the pump, which is the one control here that moves the OTHER channels', () => {
    const row = items.find((r) => r.title === catalog.duck.label);
    expect(row).toBeTruthy();
    expect(row!.detail).toContain(`script:  ${catalog.duck.script}`);
    expect(row!.detail[0]).toContain('track line');
  });

  it('lists every drum kit, with the four patches it swaps', () => {
    for (const kit of catalog.kits) {
      const row = items.find((r) => r.title === kit.label);
      expect(row).toBeTruthy();
      expect(row!.detail).toContain(`script:  ${kit.script}`);
      // One detail line per drum, in kit order, so a reader can see what changes.
      expect(row!.detail).toContain('its drums:');
      for (const voice of kit.voices) {
        expect(row!.detail.some((line) => line.startsWith(`${DRUM_BY_ID[voice.drum].short}  `))).toBe(true);
      }
    }
    expect(items.find((r) => r.title === 'STUDIO')!.detail[0]).toContain('the default');
  });

  it('lists every filter shape, and calls the default one what it is', () => {
    expect(catalog.shapes.map((shape) => shape.id)).toEqual(['round', 'sharp', 'nasal', 'hollow']);
    for (const shape of catalog.shapes) {
      const row = items.find((r) => r.title === shape.label);
      expect(row).toBeTruthy();
      expect(row!.detail).toContain(`script:  ${shape.script}`);
      expect(row!.detail[0]).toContain('track line');
    }
    const fallback = items.find((r) => r.title === 'ROUND')!;
    expect(fallback.detail[0]).toContain('the default');
  });

  it('opens with the section headings, in reading order', () => {
    const headings = rows.filter((row) => row.kind === 'heading').map((row) => row.text.trim());
    expect(headings).toEqual(expect.arrayContaining(['WAVES', 'THE KNOBS', 'VOICES', 'EFFECTS', 'FILTER SHAPES', 'DRUM KITS', 'CONSOLES']));
    const firstOf = (name: string) => rows.findIndex((row) => row.kind === 'heading' && row.text === name);
    expect(firstOf('WAVES')).toBeLessThan(firstOf('THE KNOBS'));
    expect(firstOf('THE KNOBS')).toBeLessThan(firstOf('VOICES'));
    expect(firstOf('VOICES')).toBeLessThan(firstOf('EFFECTS'));
    expect(firstOf('EFFECTS')).toBeLessThan(firstOf('CONSOLES'));
  });
});

describe('the rows are navigable and fit', () => {
  it('offers exactly one selectable row per entry, and skips the headings', () => {
    const selectable = selectableRows(rows);
    expect(selectable).toHaveLength(
      catalog.waves.length + catalog.knobs.length + catalog.voices.length
      + catalog.effects.length + 1 + catalog.shapes.length + catalog.kits.length
      + catalog.chips.length,
    );
    for (const index of selectable) expect(rows[index].kind).toBe('item');
  });

  it('keeps every detail block inside the pane', () => {
    for (const row of items) {
      expect(row.detail.length).toBeLessThanOrEqual(MAX_DETAIL_LINES);
      expect(row.detail[0].length).toBeGreaterThan(0);
    }
  });

  it('gives every row a non-empty title', () => {
    for (const row of rows) {
      expect(row.kind === 'heading' ? row.text.length : row.title.length).toBeGreaterThan(0);
    }
  });
});

describe('the helpers', () => {
  it('wraps prose to the width, and loses none of its words', () => {
    const text = 'a wavetable is a periodic wave whose shape duty picks from a fixed bank';
    const lines = wrap(text, 20);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(20);
    expect(lines.join(' ')).toBe(text);
  });

  it('leaves a short line alone', () => {
    expect(wrap('bright', 20)).toEqual(['bright']);
    // Collapsing runs of whitespace, so a stray double space cannot make a
    // blank line in the middle of a blurb.
    expect(wrap('  a   b  ', 20)).toEqual(['a b']);
  });

  it('spells out every knob of a voice, without the waveform', () => {
    const lines = knobLines(VOICES[0].params);
    const all = lines.join('  ');
    for (const param of VOICE_PARAMS) expect(all).toContain(`${param.id} ${VOICES[0].params[param.id]}`);
    expect(all).not.toContain('wave');
    // A few knobs to a line, so the readout stays inside the detail pane.
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(56);
  });
});

describe('searching the browser', () => {
  const found = (query: string) => searchRows(rows, query);
  const titles = (query: string) => found(query).filter((row) => row.kind === 'item').map((row) => row.title);

  it('returns the whole list for a blank query, so clearing is exact', () => {
    expect(searchRows(rows, '')).toEqual(rows);
    expect(searchRows(rows, '   ')).toEqual(rows);
  });

  it('finds an entry by its title, case-insensitively', () => {
    expect(titles('bright')).toContain('BRIGHT');
    expect(titles('BRIGHT')).toContain('BRIGHT');
    expect(titles('BrIgHt')).toContain('BRIGHT');
  });

  it('finds an entry by what its detail says, not only its name', () => {
    // The point of a searchable browser: "which knob makes the note ring?" is
    // answered by the prose, and the prose is what the query matches.
    const hits = titles('attack');
    expect(hits.length).toBeGreaterThan(0);
    for (const title of hits) {
      const row = items.find((item) => item.title === title);
      expect(row?.detail.join(' ').toLowerCase()).toContain('attack');
    }
  });

  it('keeps each result under the heading it lives beneath', () => {
    const result = found('wavetable');
    // Every item is preceded by a heading, and no heading is repeated back to back.
    expect(result[0].kind).toBe('heading');
    let lastHeading = '';
    for (const row of result) {
      if (row.kind === 'heading') {
        expect(row.text).not.toBe(lastHeading);
        lastHeading = row.text;
      }
    }
  });

  it('leaves every returned row either a heading or a real match', () => {
    const result = searchRows(rows, 'lead');
    expect(result.length).toBeGreaterThan(0);
    for (const row of result) {
      if (row.kind === 'heading') continue;
      expect(`${row.title} ${row.detail.join(' ')}`.toLowerCase()).toContain('lead');
    }
  });

  it('says nothing at all when nothing matches, rather than everything', () => {
    expect(searchRows(rows, 'zzzznotathing')).toEqual([]);
  });
});
