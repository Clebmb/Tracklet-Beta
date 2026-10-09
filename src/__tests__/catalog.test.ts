import { describe, expect, it } from 'vitest';

import {
  CATALOG_FORMAT,
  CATALOG_VERSION,
  catalogJson,
  CHIPS,
  instrumentCatalog,
  VOICES,
  VOICE_FAMILIES,
  VOICE_PARAMS,
  WAVES,
  WAVE_BLURBS,
  WAVE_LABELS,
} from '../model';

/**
 * The instrument catalog, tested as the promise `model/catalog.ts` makes: it is
 * built FROM the model's own tables, so it cannot drift from them — add a voice
 * or a wave and the catalog grows by itself, with nowhere else to remember it.
 *
 * So most of these tests are not "does it work" but "does it still AGREE": that
 * every table the app plays from has one entry here, with the same id and the
 * same words, and that handing it out cannot reach back and change the sound.
 */

describe('the catalog shape', () => {
  it('names itself and its version, so a consumer can check what it is reading', () => {
    const catalog = instrumentCatalog();
    expect(catalog.format).toBe(CATALOG_FORMAT);
    expect(catalog.version).toBe(CATALOG_VERSION);
  });

  it('is stable and JSON-safe: two reads are equal and round-trip through JSON', () => {
    const a = instrumentCatalog();
    const b = instrumentCatalog();
    expect(a).toEqual(b);
    expect(JSON.parse(catalogJson())).toEqual(a);
    // The compact form is the one line an agent reads.
    expect(catalogJson()).not.toContain('\n');
  });
});

describe('every table has one entry', () => {
  it('names every waveform, in order, with its label and its blurb', () => {
    const waves = instrumentCatalog().waves;
    expect(waves.map((w) => w.id)).toEqual([...WAVES]);
    for (const wave of waves) {
      expect(wave.label).toBe(WAVE_LABELS[wave.id]);
      expect(wave.blurb).toBe(WAVE_BLURBS[wave.id]);
      expect(wave.blurb.length).toBeGreaterThan(20);
    }
  });

  it('lists every knob in menu order, with both ends and every spelling', () => {
    const knobs = instrumentCatalog().knobs;
    expect(knobs.map((k) => k.id)).toEqual(VOICE_PARAMS.map((p) => p.id));
    for (const knob of knobs) {
      const source = VOICE_PARAMS.find((p) => p.id === knob.id)!;
      expect(knob.label).toBe(source.label);
      expect(knob.low).toBe(source.low);
      expect(knob.high).toBe(source.high);
      expect(knob.aliases).toEqual(source.aliases);
    }
  });

  it('lists every family, in order, with a heading and a reason', () => {
    const families = instrumentCatalog().families;
    expect(families.map((f) => f.id)).toEqual(VOICE_FAMILIES.map((f) => f.id));
    for (const family of families) expect(family.blurb.length).toBeGreaterThan(10);
  });

  it('holds every voice, with the same sound the engine plays', () => {
    const voices = instrumentCatalog().voices;
    expect(voices.map((v) => v.id)).toEqual(VOICES.map((v) => v.id));
    const familyIds = new Set(VOICE_FAMILIES.map((f) => f.id));
    for (const voice of voices) {
      const source = VOICES.find((v) => v.id === voice.id)!;
      expect(voice.label).toBe(source.label);
      expect(voice.blurb).toBe(source.blurb);
      expect(voice.params).toEqual(source.params);
      // A voice in no family would be a voice the menu cannot place.
      expect(familyIds.has(voice.family)).toBe(true);
    }
  });

  it('holds every console profile, with every role a wave the engine knows', () => {
    const chips = instrumentCatalog().chips;
    expect(chips.map((c) => c.id)).toEqual(CHIPS.map((c) => c.id));
    const known = new Set<string>(WAVES);
    for (const chip of chips) {
      const source = CHIPS.find((c) => c.id === chip.id)!;
      expect(chip.roles).toEqual(source.roles);
      expect(chip.roles.length).toBeGreaterThan(0);
      for (const role of chip.roles) expect(known.has(role.wave)).toBe(true);
    }
  });
});

describe('it is data, not the tables themselves', () => {
  it('hands out copies, so a consumer cannot edit the app through the catalog', () => {
    const catalog = instrumentCatalog();
    catalog.waves[0].label = 'XXXX';
    catalog.voices[0].params.bright = 0;
    catalog.chips[0].roles[0].bright = 0;

    const fresh = instrumentCatalog();
    expect(fresh.waves[0].label).toBe(WAVE_LABELS[fresh.waves[0].id]);
    expect(fresh.voices[0].params.bright).toBe(VOICES[0].params.bright);
    expect(fresh.chips[0].roles[0].bright).toBe(CHIPS[0].roles[0].bright);
  });
});
