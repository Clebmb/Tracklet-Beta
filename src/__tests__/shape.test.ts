import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  DEFAULT_SHAPE,
  FILTER_SHAPES,
  isFilterShape,
  parseScript,
  patchForTrack,
  shapeById,
  shapeFromName,
  shapeLabel,
  shapeNames,
  SHAPE_SONG_FILE_VERSION,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  type Song,
} from '../model';
import { scriptCapabilities } from '../model/capabilities';
import { instrumentCatalog } from '../model/catalog';
import {
  copyPatch,
  makePatch,
  patchWithVoice,
  samePatch,
} from '../model/instrument';
import { filterQFor, filterTypeFor } from '../audio/synth';
import { voiceById } from '../model/voice';

/**
 * Filter shapes: `track 2 shape sharp` — which part of the sound survives.
 *
 * Three promises, in the order they matter. A song that names no shape must be
 * UNCHANGED in sound and in bytes, which is why `round` is the default and why a
 * patch omits the field rather than writing it. The four names must be the only
 * ones the language and a file accept, with the list in the message when one is
 * wrong. And the shape must survive everything that rebuilds a patch — a knob
 * turned in `F4`, a lane moving a knob, a save and an open — because a filter
 * that quietly reverted to the low-pass would sound like a different instrument
 * and say nothing about it.
 */

/**
 * A song whose first channel is shaped, for the file and engine tests.
 *
 * `applyScript` works on a COPY and hands the new song back, which is what makes
 * a failed apply leave the song on screen alone — so every test here reads
 * `result.song` rather than the song it started from.
 */
function shaped(shape: string): Song {
  const applied = applyScript(createSong(), `tracks 2\ntrack 1 "LEAD" shape ${shape}`);
  expect(applied.ok).toBe(true);
  if (!applied.ok) throw new Error(applied.errors[0].message);
  return applied.song;
}

/** The song a script made, insisting it parsed. */
function applied(song: Song, source: string): Song {
  const result = applyScript(song, source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song;
}

describe('the four shapes', () => {
  it('names each one, with what it does and who reaches for it', () => {
    expect(FILTER_SHAPES.map((entry) => entry.id)).toEqual(['round', 'sharp', 'nasal', 'hollow']);
    for (const entry of FILTER_SHAPES) {
      expect(entry.label).toBe(entry.id.toUpperCase());
      expect(entry.blurb.length).toBeGreaterThan(20);
      expect(entry.reach.length).toBeGreaterThan(10);
      expect(shapeById(entry.id)).toBe(entry);
      expect(shapeLabel(entry.id)).toBe(entry.label);
    }
    expect(shapeNames()).toBe('round, sharp, nasal, hollow');
  });

  it('starts at the low-pass, which is what every note here has always been', () => {
    expect(DEFAULT_SHAPE).toBe('round');
    // The names a person is most likely to type, including the ones a manual
    // would use, all land on the six-letter words the app writes.
    expect(shapeFromName('low pass')?.id).toBe('round');
    expect(shapeFromName('LOWPASS')?.id).toBe('round');
    expect(shapeFromName('lp')?.id).toBe('round');
    expect(shapeFromName('high-pass')?.id).toBe('sharp');
    expect(shapeFromName('HP')?.id).toBe('sharp');
    expect(shapeFromName(' thin ')?.id).toBe('sharp');
    expect(shapeFromName('band_pass')?.id).toBe('nasal');
    expect(shapeFromName('vowel')?.id).toBe('nasal');
    expect(shapeFromName('notch')?.id).toBe('hollow');
    expect(shapeFromName('scoop')?.id).toBe('hollow');
  });

  it('refuses a name it does not know rather than guessing at a filter', () => {
    for (const bad of ['warm', 'lowpass-x', '', 'roundish']) {
      expect(shapeFromName(bad)).toBeNull();
    }
    expect(isFilterShape('sharp')).toBe(true);
    expect(isFilterShape('Sharp')).toBe(false);
    expect(isFilterShape(3)).toBe(false);
    expect(isFilterShape(undefined)).toBe(false);
  });
});

describe('what a shape is to the audio graph', () => {
  it('is the node type a synth would call it, and the low-pass is still the low-pass', () => {
    expect(filterTypeFor('round')).toBe('lowpass');
    expect(filterTypeFor('sharp')).toBe('highpass');
    expect(filterTypeFor('nasal')).toBe('bandpass');
    expect(filterTypeFor('hollow')).toBe('notch');
    // 0.7 is the Q every note in this app had before a shape existed, so a song
    // that names no shape builds exactly the filter it always built.
    expect(filterQFor('round')).toBe(0.7);
    // A band at 0.7 is so wide it is not a shape at all, so the two that pass a
    // BAND are the two that narrow.
    expect(filterQFor('nasal')).toBeGreaterThan(filterQFor('round'));
    expect(filterQFor('hollow')).toBeGreaterThan(filterQFor('round'));
    expect(filterQFor('sharp')).toBe(0.7);
  });

  it('falls back to the low-pass on a shape nothing knows', () => {
    // A hand-edited file cannot reach here (the reader refuses an unknown shape),
    // but the audio graph must never build `undefined` for a filter type.
    expect(filterTypeFor('nonsense' as never)).toBe('lowpass');
    expect(filterQFor('nonsense' as never)).toBe(0.7);
  });
});

describe('the shape travels with the patch', () => {
  it('is absent from a patch nobody shaped, so the golden hash cannot move', () => {
    const plain = createSong();
    for (const track of plain.tracks) {
      expect(patchForTrack(track)).not.toHaveProperty('shape');
      expect(Object.keys(patchForTrack(track)).sort()).toEqual(['layers']);
    }
  });

  it('is on the patch when a channel asks for one', () => {
    const song = shaped('sharp');
    expect(patchForTrack(song.tracks[0]).shape).toBe('sharp');
    expect(patchForTrack(song.tracks[1])).not.toHaveProperty('shape');
  });

  it('survives every copy of a patch, including one an automation lane makes', () => {
    const song = shaped('nasal');
    const patch = patchForTrack(song.tracks[0]);
    expect(copyPatch(patch).shape).toBe('nasal');
    // The lane path: a moved voice knob rebuilds layer 1 for one note.
    const moved = patchWithVoice(patch, { ...voiceById('bass')!.params });
    expect(moved.shape).toBe('nasal');
    expect(moved.layers[0].wave).toBe(voiceById('bass')!.params.wave);
    // And a patch built by hand carries whatever it is given.
    expect(makePatch(patch.layers, 'hollow').shape).toBe('hollow');
    expect(makePatch(patch.layers)).not.toHaveProperty('shape');
  });

  it('is part of what makes two patches the same patch', () => {
    const base = makePatch([...patchForTrack(createSong().tracks[0]).layers]);
    expect(samePatch(base, makePatch([...base.layers], 'sharp'))).toBe(false);
    expect(samePatch(base, makePatch([...base.layers], 'round'))).toBe(true);
  });
});

describe('the word', () => {
  it('sets it on a channel, by any of its names', () => {
    for (const [written, id] of [['sharp', 'sharp'], ['hp', 'sharp'], ['nasal', 'nasal'], ['notch', 'hollow']] as const) {
      const song = applied(createSong(), `track 2 "LEAD" shape ${written}`);
      expect(song.tracks[1].shape).toBe(id);
      expect(song.tracks[0].shape).toBe(DEFAULT_SHAPE);
    }
  });

  it('is a setting word, so a channel is not accidentally named SHAPE', () => {
    const { commands } = parseScript('track 1 SHAPE wave sine', { trackCount: 1, rows: 16, rowsPerBeat: 4 });
    expect(commands).toHaveLength(0);
    const bad = applyScript(createSong(), 'track 1 SHAPE wave sine');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors[0].message).toContain('shape needs one filter shape');
  });

  it('refuses a shape it does not know, with the list, and changes nothing', () => {
    const song = shaped('sharp');
    for (const line of ['track 1 "LEAD" shape warm', 'track 1 "LEAD" shape lp hp']) {
      const result = applyScript(song, line);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors[0].message).toContain('filter shape');
      expect(result.errors[0].message).toContain('round, sharp, nasal, hollow');
    }
    // Nothing was half-applied, and the song it was applied to is untouched: a
    // script works on a copy, which is why a refusal cannot leave a channel
    // half-shaped.
    expect(song.tracks[0].shape).toBe('sharp');
    expect(applied(createSong(), 'song "X"\ntracks 1\ntrack 1 "LEAD" shape sharp').tracks[0].shape).toBe('sharp');
  });

  it('goes back to the low-pass when a script starts a new song', () => {
    const song = shaped('hollow');
    expect(song.tracks[0].shape).toBe('hollow');
    const fresh = applied(song, 'new\ntracks 1\nsong "FRESH"');
    expect(fresh.tracks[0].shape).toBe(DEFAULT_SHAPE);
    expect(fresh.tracks[0].name).toBe('TRACK 1');
  });

  it('is not a word of its own, so the command count does not move', () => {
    const caps = scriptCapabilities();
    // `shape` is a value on a `track` line, the way `poly` and `groove` are.
    expect(caps.commands.some((row) => row.word === 'shape')).toBe(false);
    expect(caps.vocabulary.filterShapes.map((entry) => entry.id))
      .toEqual(['round', 'sharp', 'nasal', 'hollow']);
    expect(caps.vocabulary.filterShapes.find((entry) => entry.id === 'sharp')?.aliases)
      .toContain('hp');
  });
});

describe('the file', () => {
  it('writes version 12 for a song that names no shape, with no key anywhere', () => {
    const plain = createSong();
    const raw = JSON.parse(songToJson(plain)) as Record<string, unknown>;
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(raw)).not.toContain('shape');
    expect(songToScript(plain)).not.toContain('shape');
  });

  it('writes version 21 when a channel asks for one', () => {
    const song = shaped('sharp');
    const raw = JSON.parse(songToJson(song)) as { version: number; tracks: { shape?: string }[] };
    expect(raw.version).toBe(SHAPE_SONG_FILE_VERSION);
    // A version, not the newest one forever: later features declare their own.
    expect(SHAPE_SONG_FILE_VERSION).toBeLessThanOrEqual(SONG_FILE_VERSION_MAX);
    // Only the channel that asked, which is what makes it additive on a file.
    expect(raw.tracks[0].shape).toBe('sharp');
    expect(raw.tracks[1]).not.toHaveProperty('shape');
    expect(songToScript(song)).toContain('track 1 "LEAD"');
    expect(songToScript(song)).toContain(' shape sharp');
  });

  it('round-trips through the JSON', () => {
    const song = shaped('nasal');
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.tracks[0].shape).toBe('nasal');
    expect(back.song.tracks[1].shape).toBe(DEFAULT_SHAPE);
    expect(songToJson(back.song)).toBe(songToJson(song));
  });

  it('round-trips through the SCRIPT, which is the format a hand reads', () => {
    const song = shaped('hollow');
    const text = songToScript(song);
    const back = applied(createSong(), text);
    expect(back.tracks[0].shape).toBe('hollow');
    expect(songToScript(back)).toBe(text);
  });

  it('refuses a shape name a file has that this build does not know', () => {
    const raw = JSON.parse(songToJson(shaped('sharp'))) as { tracks: Record<string, unknown>[] };
    raw.tracks[0].shape = 'warm';
    const back = songFromJson(JSON.stringify(raw));
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.errors.join(' ')).toContain('filter shape');
    expect(back.errors.join(' ')).toContain('channel 1');

    raw.tracks[0].shape = 7;
    const typed = songFromJson(JSON.stringify(raw));
    expect(typed.ok).toBe(false);
  });
});

describe('the catalog and the browser', () => {
  it('publishes all four, with the default marked', () => {
    const shapes = instrumentCatalog().shapes;
    expect(shapes.map((entry) => entry.id)).toEqual(['round', 'sharp', 'nasal', 'hollow']);
    expect(shapes.find((entry) => entry.id === 'round')?.atDefault).toBe(true);
    expect(shapes.filter((entry) => entry.atDefault)).toHaveLength(1);
    for (const entry of shapes) {
      expect(entry.script).toBe(`track 1 shape ${entry.id}`);
      expect(entry.aliases.length).toBeGreaterThan(0);
      expect(entry.reach.length).toBeGreaterThan(10);
    }
    expect(shapes.find((entry) => entry.id === 'sharp')?.aliases).toContain('hp');
  });
});
