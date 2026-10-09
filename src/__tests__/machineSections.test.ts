/**
 * A SECTION that names the drum machine BAR it plays — the beat following the form.
 *
 * The machine's `order` says which bar plays in each song bar, but keeping that
 * list in step with a `section`/`arrange` form by hand is a second copy of the
 * form. This lets a section name its bar once (`section CHORUS 3 4 machine 2`):
 *
 *   • the MODEL carries a section's `machineBar` and writes it back out;
 *   • the SCRIPT takes `machine N` on a `section` line and refuses a value that
 *     cannot be a bar;
 *   • the FILE writes version 40 when a section names one and every older version
 *     otherwise, and the name survives the round trip;
 *   • the PLACEMENT plays the section's bar in every song bar the section covers,
 *     falling back to the machine's own `order` where a section names nothing.
 */

import { describe, expect, it } from 'vitest';

import {
  MACHINE_PAD_SAMPLE_SONG_FILE_VERSION,
  MACHINE_SECTION_BAR_SONG_FILE_VERSION,
  SCENES_SONG_FILE_VERSION,
  ARP_SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  applyScript,
  createSong,
  sectionScript,
  songFromJson,
  songToJson,
  songToScript,
  tidySection,
  type Song,
} from '../model';
import { machineBarsForSong, machineHitsInRange } from '../audio/machine';

/** A song whose VERSE plays machine bar 1 and whose CHORUS plays bar 2. */
const SOURCE = [
  'new',
  'tracks 1',
  'machine',
  'pad 1 KICK pattern "9..............."',
  'machine pattern 2',
  'pad 1 KICK pattern "....9..........."',
  'section VERSE 1 1 machine 1',
  'section CHORUS 1 1 machine 2',
  'arrange VERSE CHORUS',
  '',
].join('\n');

function formed(): Song {
  const applied = applyScript(createSong(), SOURCE);
  if (!applied.ok) throw new Error(`the fixture must parse: ${JSON.stringify(applied.errors)}`);
  return applied.song;
}

describe('a section names the machine bar it plays', () => {
  it('parses `machine N` and applies it to the section', () => {
    const song = formed();
    const chorus = song.sections.find((section) => section.name === 'CHORUS');
    expect(chorus?.machineBar).toBe(2);
    const verse = song.sections.find((section) => section.name === 'VERSE');
    expect(verse?.machineBar).toBe(1);
  });

  it('writes it back out, and only when a section names one', () => {
    const song = formed();
    const chorus = song.sections.find((section) => section.name === 'CHORUS')!;
    expect(sectionScript(chorus)).toBe('section CHORUS 1 1 machine 2');
    // A section that names nothing writes the line this app always wrote.
    expect(sectionScript(tidySection({ name: 'VERSE', bars: [1, 1] }))).toBe('section VERSE 1 1');
  });

  it('clamps a bar past the machine ceiling', () => {
    expect(tidySection({ name: 'X', bars: [1], machineBar: 99 }).machineBar).toBe(16);
    expect(tidySection({ name: 'X', bars: [1], machineBar: -3 }).machineBar).toBe(1);
    expect(tidySection({ name: 'X', bars: [1] }).machineBar).toBeUndefined();
  });

  it('refuses a machine value that is not a bar number', () => {
    const bad = applyScript(createSong(), 'section VERSE 1 1 machine 99');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.map((error) => error.message).join(' ')).toContain('machine names which bar');
  });
});

describe('the file says a section names a machine bar', () => {
  it('writes version 40 and round-trips the bar', () => {
    const song = formed();
    const json = songToJson(song);
    expect(JSON.parse(json).version).toBe(MACHINE_SECTION_BAR_SONG_FILE_VERSION);
    // A section's machine bar is 40; the LIVE page's SCENES claimed 41 above it,
    // and the ARP page's DIALS claimed 42, so the scenes are one below the ceiling
    // now rather than at it.
    expect(ARP_SONG_FILE_VERSION).toBe(SONG_FILE_VERSION_MAX);
    expect(SCENES_SONG_FILE_VERSION).toBe(ARP_SONG_FILE_VERSION - 1);
    expect(MACHINE_SECTION_BAR_SONG_FILE_VERSION).toBe(SCENES_SONG_FILE_VERSION - 1);

    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.sections.find((section) => section.name === 'CHORUS')?.machineBar).toBe(2);
  });

  it('leaves an older version when no section names one', () => {
    const song = formed();
    // Take the machine bar back off the sections; a pad still names a recording
    // nowhere, so the song falls all the way to a bar-less machine's version.
    song.sections = song.sections.map((section) => ({ ...section, machineBar: null }));
    expect(JSON.parse(songToJson(song)).version).toBeLessThan(SONG_FILE_VERSION_MAX);
    expect(JSON.parse(songToJson(song)).version).toBe(MACHINE_PAD_SAMPLE_SONG_FILE_VERSION - 1);
  });

  it('survives SAVE AS SCRIPT', () => {
    const song = formed();
    expect(songToScript(song)).toContain('machine 2');
    const back = applyScript(createSong(), songToScript(song));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.sections.find((section) => section.name === 'CHORUS')?.machineBar).toBe(2);
  });
});

describe('the placement plays the bar the section names', () => {
  it('resolves one machine bar per song bar, from the form', () => {
    const song = formed();
    // VERSE (2 bars) then CHORUS (2 bars), so bar 1 twice then bar 2 twice.
    expect(song.order).toHaveLength(4);
    expect(machineBarsForSong(song)).toEqual([1, 1, 2, 2]);
  });

  it('falls back to the machine order where a section names nothing', () => {
    const song = formed();
    song.sections = song.sections.map((section) => ({ ...section, machineBar: null }));
    song.machine = { ...song.machine!, order: [1, 2] };
    // No section names a bar, so the machine's own order answers, cyclic.
    expect(machineBarsForSong(song)).toEqual([1, 2, 1, 2]);
  });

  it('places the named bar in every song bar the section covers', () => {
    const song = formed();
    const machine = song.machine!;
    const bars = machineBarsForSong(song);
    const hits = machineHitsInRange(machine, 4, 0, 64, bars);
    // Bar 1's kick on the downbeat (rows 0 and 16), bar 2's on row 4 of each of its
    // bars: rows 36 and 52. Without the bars, the order `[1]` would play bar 1
    // everywhere and rows 36/52 would be silent.
    expect(hits.map((hit) => hit.row)).toEqual([0, 16, 36, 52]);
  });
});
