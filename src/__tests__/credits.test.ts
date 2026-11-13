import { describe, expect, it } from 'vitest';

import { applyScript } from '../model/script';
import { createSong, MAX_CREDITS, tidyCredits } from '../model/song';
import {
  CREDITS_SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  songFromJson,
  songToJson,
  songToScript,
} from '../model/songfile';

/** Apply one script, insisting it parsed, and hand back the song. */
function play(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`${source} should parse: ${JSON.stringify(result.errors)}`);
  return result.song;
}

/** The diagnostics of a script that must be refused, as one searchable string. */
function refusal(source: string): string {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(false);
  return result.ok ? '' : JSON.stringify(result.errors);
}

describe('credits: who made the song, and what it borrows', () => {
  it('is written by one line of free text', () => {
    const song = play('song "TOWER"\ncredits "MADE BY ME — break from a 1972 record"');
    expect(song.credits).toBe('MADE BY ME — break from a 1972 record');
  });

  it('survives the script round trip, so SAVE and APPLY stay inverses', () => {
    const song = play('song "TOWER"\ncredits "MADE BY ME — break from a 1972 record"');
    const back = play(songToScript(song));
    expect(back.credits).toBe(song.credits);
  });

  it('comes off with `credits clear`, leaving no field rather than an empty one', () => {
    const song = play('credits "MADE BY ME"\ncredits clear');
    expect(song.credits).toBeUndefined();
    // Not an empty string: an uncredited song has to be the song it was, which is
    // what keeps it at the file version every earlier song writes.
    expect('credits' in song).toBe(false);
  });

  it('round-trips a credit at the full 200-character ceiling', () => {
    const long = 'MADE BY ME '.repeat(10).trim().padEnd(MAX_CREDITS, '.');
    const song = play(`credits "${long}"`);
    expect(song.credits).toHaveLength(MAX_CREDITS);
    expect(play(songToScript(song)).credits).toBe(long);
  });

  it('carries no quote characters through the line, as a title does not', () => {
    // A `credits` line is quoted text: the tokeniser hands back the words WITHOUT
    // their quotes, so a quote cannot end the line early and cannot survive it
    // either. Recorded here rather than called correct — it is the title's rule.
    const song = play('credits "THE "GLUE" BREAK"');
    expect(song.credits).toBe('THE GLUE BREAK');
    expect(play(songToScript(song)).credits).toBe('THE GLUE BREAK');
  });

  it('refuses a bare `credits`, because there is nothing to guess at', () => {
    expect(refusal('credits')).toContain('credits clear');
  });

  it('refuses a line past the ceiling rather than cutting a name in half', () => {
    const long = `credits "${'A'.repeat(MAX_CREDITS + 1)}"`;
    expect(refusal(long)).toContain(String(MAX_CREDITS));
  });

  it('folds whitespace, so a wrapped line and a spaced one are the same credit', () => {
    expect(tidyCredits('  MADE   BY\nME  ')).toBe('MADE BY ME');
    expect(tidyCredits('   ')).toBeUndefined();
  });

  it('travels in the file, which moves to version 56 only when it says something', () => {
    const plain = play('song "TOWER"');
    expect(songToJson(plain).includes('"credits"')).toBe(false);
    expect(JSON.parse(songToJson(plain)).version).toBeLessThan(SONG_FILE_VERSION_MAX);

    const credited = play('credits "MADE BY ME"');
    const json = songToJson(credited);
    expect(JSON.parse(json).version).toBe(CREDITS_SONG_FILE_VERSION);
    const read = songFromJson(json);
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(read.song.credits).toBe('MADE BY ME');
  });

  it('refuses a credits field that is not text, by name', () => {
    const json = JSON.parse(songToJson(play('song "TOWER"')));
    json.credits = 42;
    const read = songFromJson(JSON.stringify(json));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.errors.join(' ')).toContain('credits');
  });
});
