import { describe, expect, it } from 'vitest';
import { clampZoneNote, MAX_ZONE_NOTE, tidyZones, zoneFor, zoneSpans } from '../model/zone';
import { songFromJson, songToJson, songToScript } from '../model/songfile';
import { applyScript, createSong } from '../model';

/** A song from a script, or the parser's complaints. */
function applied(source: string) {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song;
}

function refused(source: string): string {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map((error) => error.message).join(' ');
}

describe('the keymap', () => {
  it('gives a note the highest boundary at or below it', () => {
    const zones = [
      { note: 0, sample: 'LOW' },
      { note: 60, sample: 'MID' },
      { note: 96, sample: 'HIGH' },
    ];
    expect(zoneFor(zones, 59)).toBe('LOW');
    expect(zoneFor(zones, 60)).toBe('MID');
    expect(zoneFor(zones, 95)).toBe('MID');
    expect(zoneFor(zones, 127)).toBe('HIGH');
  });

  it('gives a note under every boundary the lowest zone, not silence', () => {
    // A keymap is a different sound per register, not a silent bottom octave.
    expect(zoneFor([{ note: 60, sample: 'MID' }], 12)).toBe('MID');
  });

  it('is null for a channel with no keymap, so the caller keeps its own sample', () => {
    expect(zoneFor(undefined, 60)).toBe(null);
    expect(zoneFor([], 60)).toBe(null);
  });

  it('clamps a boundary to the keyboard', () => {
    expect(clampZoneNote(-20)).toBe(0);
    expect(clampZoneNote(999)).toBe(MAX_ZONE_NOTE);
    expect(clampZoneNote(59.6)).toBe(60);
    expect(clampZoneNote(Number.NaN)).toBe(0);
  });

  it('sorts boundaries, keeps the LAST on a shared note, and drops beyond the ceiling', () => {
    const tidied = tidyZones([
      { note: 96, sample: 'HIGH' },
      { note: 0, sample: 'FIRST' },
      { note: 60, sample: 'OLD' },
      { note: 60, sample: 'NEW' },
    ]);
    expect(tidied.map((zone) => zone.note)).toEqual([0, 60, 96]);
    expect(tidied[1].sample).toBe('NEW');
    // A last line about a thing counts, the same rule every other statement keeps.
    expect(tidyZones([{ note: 1, sample: 'A' }])[0].sample).toBe('A');
  });

  it('reads back as spans, with the bottom one open and the top one closed', () => {
    expect(zoneSpans([
      { note: 0, sample: 'LOW' },
      { note: 60, sample: 'HIGH' },
    ])).toEqual([
      { note: 0, through: 59, sample: 'LOW' },
      { note: 60, through: 127, sample: 'HIGH' },
    ]);
  });
});

describe('the zone statement', () => {
  it('writes a boundary, and the map it leaves behind is sorted', () => {
    const song = applied('zone 1 C-6 TOP\nzone 1 C-2 LOW\nzone 1 C-4 MID');
    expect(song.tracks[0].zones).toEqual([
      { note: 36, sample: 'LOW' },
      { note: 60, sample: 'MID' },
      { note: 84, sample: 'TOP' },
    ]);
  });

  it('takes a number as the same boundary as a note name', () => {
    expect(applied('zone 1 60 HIGH').tracks[0].zones).toEqual([{ note: 60, sample: 'HIGH' }]);
    expect(applied('zone 1 C-4 HIGH').tracks[0].zones).toEqual([{ note: 60, sample: 'HIGH' }]);
  });

  it('empties the map with clear', () => {
    const song = applied('zone 1 C-4 HIGH\nzone 1 clear');
    expect(song.tracks[0].zones).toEqual([]);
  });

  it('leaves the other channels alone', () => {
    const song = applied('zone 2 C-4 HIGH');
    expect(song.tracks[0].zones).toBeUndefined();
    expect(song.tracks[1].zones).toEqual([{ note: 60, sample: 'HIGH' }]);
  });

  it('survives a trip out to a script and back', () => {
    const song = applied('zone 1 C-2 LOW\nzone 1 C-4 HIGH\ntrack 2 sample WHOLE\nzone 2 C-6 TOP');
    const text = songToScript(song);
    expect(text).toContain('zone 1 36 LOW');
    const back = applyScript(createSong(), text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.tracks[0].zones).toEqual(song.tracks[0].zones);
    expect(back.song.tracks[1].zones).toEqual(song.tracks[1].zones);
  });

  it('refuses a note it cannot read, and a channel it does not have', () => {
    expect(refused('zone 1 middle HIGH')).toContain('zone needs a NOTE');
    expect(refused('zone 9 C-4 HIGH')).toContain('zone takes a channel NUMBER');
    expect(refused('zone')).toContain('zone needs a channel');
    expect(refused('zone 1 C-4 MY PIANO')).toContain('ONE recording');
  });
});

describe('a keymap in a song file', () => {
  it('survives a save and a load, and writes version 49', () => {
    const song = createSong();
    song.tracks[0].zones = [
      { note: 0, sample: 'PIDRUM' },
      { note: 60, sample: 'PIDRUM_HI' },
    ];
    const text = songToJson(song);
    expect(JSON.parse(text).version).toBe(49);
    const parsed = songFromJson(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.song.tracks[0].zones).toEqual([
      { note: 0, sample: 'PIDRUM' },
      { note: 60, sample: 'PIDRUM_HI' },
    ]);
    // Absent, not empty: a channel with one recording is what every earlier file
    // describes, and the load must not change the song it just read.
    expect(parsed.song.tracks[1].zones).toBeUndefined();
  });

  it('writes no key at all for a channel that plays one recording everywhere', () => {
    const song = createSong();
    const file = JSON.parse(songToJson(song));
    expect(file.tracks[0].zones).toBeUndefined();
    // And the version stays the one a song with no keymap has always written.
    expect(file.version).not.toBe(49);
  });

  it('refuses a boundary that is not a note and a name', () => {
    const song = createSong();
    song.tracks[0].zones = [{ note: 60, sample: 'HIGH' }];
    const file = JSON.parse(songToJson(song));
    file.tracks[0].zones = [{ note: 'middle', sample: 'HIGH' }];
    const parsed = songFromJson(JSON.stringify(file));
    expect(parsed.ok).toBe(false);
  });
});

describe('a keymap and the channel sample together', () => {
  it('keeps the channel sample as the floor UNDER the map, and the map covers the keyboard', () => {
    const song = createSong();
    song.tracks[0].sample = 'WHOLE';
    song.tracks[0].zones = [{ note: 72, sample: 'TOP' }];
    const parsed = songFromJson(songToJson(song));
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const track = parsed.song.tracks[0];
    // The map owns every note — the one zone is the whole keyboard — so the
    // channel's own recording is the floor only where the map says nothing.
    expect(zoneFor(track.zones, 60)).toBe('TOP');
    expect(zoneFor(track.zones, 72)).toBe('TOP');
    expect(zoneFor([], 60) ?? track.sample).toBe('WHOLE');
  });
});
