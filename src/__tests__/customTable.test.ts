import { describe, expect, it } from 'vitest';
import {
  clampHarmonic,
  MAX_HARMONICS,
  tableNameProblem,
  tidyTable,
} from '../model/wavetable';
import { songFromJson, songToJson, songToScript } from '../model/songfile';
import { applyScript, createSong, SCRIPT_VERSION, SONG_FILE_VERSION_MAX } from '../model';
import { channelShortLabel, soundShortLabel } from '../model/instrument';

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

describe('a table of your own', () => {
  it('is a name and a spectrum, kept as written', () => {
    expect(tidyTable('ODD', [1, 0, 0.5])).toEqual({ name: 'ODD', harmonics: [1, 0, 0.5] });
  });

  it('drops trailing zeroes, because they change no wave', () => {
    expect(tidyTable('ODD', [1, 0.5, 0, 0])?.harmonics).toEqual([1, 0.5]);
  });

  it('refuses a spectrum of zeroes — silence with a name', () => {
    expect(tidyTable('SILENT', [0, 0, 0])).toBe(null);
    expect(tidyTable('EMPTY', [])).toBe(null);
  });

  it('refuses a name a script cannot read back', () => {
    expect(tableNameProblem('')).toContain('empty');
    expect(tableNameProblem('MY TABLE')).toContain('ONE word');
    expect(tableNameProblem('A'.repeat(20))).toContain('longer');
    expect(tableNameProblem('ODD_1-x')).toBe(null);
  });

  it('clamps a harmonic to the range and holds at most sixteen', () => {
    expect(clampHarmonic(5)).toBe(1);
    expect(clampHarmonic(-5)).toBe(-1);
    expect(clampHarmonic(Number.NaN)).toBe(0);
    const many = tidyTable('LONG', Array.from({ length: MAX_HARMONICS + 8 }, () => 0.5));
    expect(many?.harmonics).toHaveLength(MAX_HARMONICS);
  });
});

describe('a table on the channel row', () => {
  it('names the shape instead of naming the bank', () => {
    const plain = applied('track 1 wave table');
    expect(channelShortLabel(plain.tracks[0])).toBe('TAB');
    // A table of its own says WHICH shape it wears, in the same three characters.
    const odd = applied('track 1 wave table\ntable 1 WOBBLE 1 0 0.5');
    expect(channelShortLabel(odd.tracks[0])).toBe('WOB');
  });

  it('leaves every other channel\u2019s label alone', () => {
    const song = applied('track 1 wave table\n table 1 ODD 1 0.5');
    expect(channelShortLabel(song.tracks[1])).toBe(soundShortLabel(song.tracks[1]));
  });
});

describe('the table statement', () => {
  it('gives a channel a spectrum', () => {
    const song = applied('track 1 wave table\ntable 1 ODD 1 0 0.5');
    expect(song.tracks[0].table).toEqual({ name: 'ODD', harmonics: [1, 0, 0.5] });
  });

  it('replaces the spectrum a later line about the same channel wrote', () => {
    const song = applied('table 1 FIRST 1 0.5\ntable 1 SECOND 1 0 0.25');
    expect(song.tracks[0].table?.name).toBe('SECOND');
  });

  it('wears the chip bank again with clear', () => {
    expect(applied('table 1 ODD 1 0.5\ntable 1 clear').tracks[0].table).toBeUndefined();
  });

  it('leaves the other channels alone', () => {
    const song = applied('table 2 ODD 1 0.5');
    expect(song.tracks[0].table).toBeUndefined();
    expect(song.tracks[1].table?.name).toBe('ODD');
  });

  it('refuses a silent spectrum, a word that is not a number, and a missing channel', () => {
    expect(refused('table 1 SILENT 0 0 0')).toContain('non-zero harmonic');
    expect(refused('table 1 ODD 1 loud')).toContain('numbers from -1 to 1');
    expect(refused('table 9 ODD 1 0.5')).toContain('table takes a channel NUMBER');
    expect(refused('table 1 ODD')).toContain('NAME and the harmonics');
  });
});

describe('a table in a song file', () => {
  it('survives a save and a load, at version 51', () => {
    const song = applied('table 1 ODD 1 0 0.5');
    const text = songToJson(song);
    expect(JSON.parse(text).version).toBe(51);
    expect(SONG_FILE_VERSION_MAX).toBe(59);
    const back = songFromJson(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.tracks[0].table).toEqual({ name: 'ODD', harmonics: [1, 0, 0.5] });
    expect(back.song.tracks[1].table).toBeUndefined();
  });

  it('survives a trip out to a script and back', () => {
    const song = applied('table 1 ODD 1 0 0.5');
    const text = songToScript(song);
    expect(text).toContain('table 1 ODD 1 0 0.5');
    const back = applyScript(createSong(), text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.tracks[0].table).toEqual(song.tracks[0].table);
  });

  it('is refused rather than dropped when the spectrum is not numbers', () => {
    const song = applied('table 1 ODD 1 0 0.5');
    const file = JSON.parse(songToJson(song));
    file.tracks[0].table = { name: 'ODD', harmonics: ['loud'] };
    expect(songFromJson(JSON.stringify(file)).ok).toBe(false);
  });

  it('claims language version 66', () => {
    expect(SCRIPT_VERSION).toBe(76);
  });
});
