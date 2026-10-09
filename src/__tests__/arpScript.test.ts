/**
 * The `arp` statement: the ARP page's dials, and the run they write.
 *
 * `chord ROW TRACK CHORD arp …` already spells a walk on the line. `arp …` STORES
 * the same walk in the song — the dials the page draws — and `arp write ROW
 * TRACK CHORD` performs it from those dials. The promises that matter:
 *
 *   • a run a write produces is cell-for-cell the run the modifier produces for
 *     the matching direction and octaves (one generator, so they cannot drift);
 *   • the dials round-trip through `SAVE AS SCRIPT`, because they are song data;
 *   • `arp off` leaves a song that writes no key and no version, exactly as it did
 *     before the page existed.
 */

import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  DEFAULT_ARP,
  DEFAULT_VELOCITY,
  MAX_ARP_OCTAVES,
  SCRIPT_KEYWORDS,
  SCRIPT_QUICK_REFERENCE,
  SCRIPT_VERSION,
  songToScript,
  type ArpSettings,
  type Song,
} from '../model';
import { SCRIPT_COMMANDS, scriptCapabilities } from '../model/capabilities';

/** A parsed-and-applied script, insisting it succeeded. */
function applied(source: string, song: Song = createSong()): Song {
  const result = applyScript(song, source);
  if (!result.ok) throw new Error(result.errors.map((error) => `${error.line}: ${error.message}`).join(' / '));
  return result.song;
}

/** The errors a script produced, as one string. */
function errorsOf(source: string): string {
  const result = applyScript(createSong(), source);
  if (result.ok) return '';
  return result.errors.map((error) => error.message).join('\n');
}

/** One channel's notes in row order. */
function column(song: Song, track = 0, rows = 16): (number | null)[] {
  return song.patterns[0].steps.slice(0, rows).map((row) => row[track]?.note ?? null);
}

describe('the arp dials, stored in the song', () => {
  it('starts with none, and a dial line stores just that field', () => {
    expect(createSong().arp).toBeNull();
    expect(applied('arp direction updown').arp)
      .toEqual({ ...DEFAULT_ARP, direction: 'updown' });
  });

  it('MERGES one line at a time, so a saved script can write them in any order', () => {
    // This is exactly what `songToScript` emits, in this order, so the round trip
    // depends on each line moving only the fields it names.
    const song = applied('arp direction updown\narp octaves 3 rate 2 gate 60\narp mode source');
    expect(song.arp).toEqual({ direction: 'updown', octaves: 3, rate: 2, gate: 60, mode: 'source' });
  });

  it('clamps an out-of-range dial rather than refusing the taste', () => {
    expect(applied('arp octaves 99').arp?.octaves).toBe(MAX_ARP_OCTAVES);
    expect(applied('arp gate -20').arp?.gate).toBe(0);
  });

  it('clears them with `arp off`, so the song writes no key again', () => {
    const song = applied('arp direction down\narp off');
    expect(song.arp).toBeNull();
  });

  it('round-trips through SAVE AS SCRIPT', () => {
    const dials: ArpSettings = { direction: 'updown', octaves: 3, rate: 2, gate: 60, mode: 'source' };
    const song = applied('arp direction updown\narp octaves 3 rate 2 gate 60\narp mode source');
    const text = songToScript(song);
    expect(applied(text).arp).toEqual(dials);
  });
});

describe('arp write commits the run the dials describe', () => {
  it('is the same cells `chord … arp` writes for the matching dials', () => {
    // Default dials: up, two octaves, one note per step. A triad then fills six
    // steps — the run `chord 0 1 Am arp up 6` writes.
    const written = applied('tracks 1\nkey A minor\narp write 0 1 Am');
    const modifier = applied('tracks 1\nkey A minor\nchord 0 1 Am arp up 6');
    expect(column(written).slice(0, 6)).toEqual([69, 72, 76, 81, 84, 88]);
    expect(column(written)).toEqual(column(modifier));
  });

  it('spaces the notes out with `rate`, and writes every other step empty', () => {
    const song = applied('tracks 1\nkey A minor\narp octaves 2 rate 2\narp write 0 1 Am');
    expect(column(song).slice(0, 12)).toEqual([69, null, 72, null, 76, null, 81, null, 84, null, 88, null]);
  });

  it('turns the run around with `direction`', () => {
    const song = applied('tracks 1\nkey A minor\narp direction down\narp write 0 1 Am');
    expect(column(song).slice(0, 6)).toEqual([88, 84, 81, 76, 72, 69]);
  });

  it('writes GATE as the cell velocity, and nothing extra at the default', () => {
    const plain = applied('tracks 1\narp write 0 1 Am');
    expect(plain.patterns[0].steps[0][0].velocity).toBe(DEFAULT_VELOCITY);
    const loud = applied('tracks 1\narp gate 60\narp write 0 1 Am');
    expect(loud.patterns[0].steps[0][0].velocity).toBe(60);
    expect(loud.patterns[0].steps[1][0].velocity).toBe(60);
  });

  it('stops at the end of the pattern rather than running off it', () => {
    // From row 14 in a 16-step pattern there is room for two notes, so a run that
    // would climb three octaves stops at two — the monotonic cap `arpNoteCount`
    // makes, so a write never needs a "it does not fit" error.
    const song = applied('tracks 1\nkey A minor\narp octaves 4\narp write 14 1 Am');
    expect(column(song).slice(14)).toEqual([69, 72]);
  });

  it('takes a degree, resolved against the key', () => {
    const song = applied('tracks 1\nkey A minor\narp octaves 1\narp write 0 1 1');
    expect(column(song).slice(0, 3)).toEqual([69, 72, 76]);
  });
});

describe('the arp statement refuses what it cannot mean', () => {
  it('wants a dial or a write, not a bare word', () => {
    expect(errorsOf('arp')).toContain('arp takes its dials or a write');
  });

  it('refuses an unknown direction and mode by name', () => {
    expect(errorsOf('arp direction sideways')).toContain('is not an arp direction');
    expect(errorsOf('arp mode arpeggio')).toContain('is not an arp mode');
  });

  it('refuses an unknown dial and a non-whole number', () => {
    expect(errorsOf('arp speed 2')).toContain('is not an arp dial');
    expect(errorsOf('arp octaves two')).toContain('is a whole number');
    expect(errorsOf('arp octaves 2 rate')).toContain('in pairs');
  });

  it('refuses a write that is missing its chord, and a bad chord', () => {
    expect(errorsOf('arp write 0 1')).toContain('arp write takes three values');
    expect(errorsOf('arp write 0 1 Hm')).toContain('is not a chord. arp write needs');
  });

  it('checks the row and track a write names', () => {
    expect(errorsOf('arp write 99 1 Am')).toContain('row must be 0..');
    expect(errorsOf('arp write 0 9 Am')).toContain('track must be 1..');
  });
});

describe('arp hear is a session switch, never song data', () => {
  it('travels out in settings, with no song field and no version', () => {
    const result = applyScript(createSong(), 'arp hear on');
    if (!result.ok) throw new Error('arp hear on refused');
    expect(result.settings.arpAudition).toBe(true);
    expect(result.song.arp).toBeNull();
  });

  it('reads off, and stays absent when a script never says it', () => {
    const off = applyScript(createSong(), 'arp hear off');
    if (!off.ok) throw new Error('arp hear off refused');
    expect(off.settings.arpAudition).toBe(false);
    const silent = applyScript(createSong(), 'arp direction up');
    if (!silent.ok) throw new Error('arp direction up refused');
    expect(silent.settings.arpAudition).toBeUndefined();
  });

  it('refuses anything but on or off', () => {
    const message = 'arp hear takes "on" or "off"';
    expect(errorsOf('arp hear')).toContain(message);
    expect(errorsOf('arp hear loud')).toContain(message);
    expect(errorsOf('arp hear on extra')).toContain(message);
  });

  it('does not disturb the dials it sits beside', () => {
    const song = applied('arp direction updown\narp hear on');
    expect(song.arp).toEqual({ ...DEFAULT_ARP, direction: 'updown' });
  });
});

describe('the manifest publishes the arp page', () => {
  it('names the word in the language, the cheat sheet and the manifest', () => {
    expect(SCRIPT_KEYWORDS).toContain('arp');
    expect(SCRIPT_QUICK_REFERENCE.join(' ').toLowerCase()).toContain('arp');
    expect(SCRIPT_COMMANDS.find((command) => command.word === 'arp')?.example).toBe('arp direction updown');
    expect(SCRIPT_VERSION).toBe(51);
  });

  it('publishes the three number dials and the two modes from the model', () => {
    const { limits, vocabulary } = scriptCapabilities();
    expect(limits.arp.octaves.max).toBe(MAX_ARP_OCTAVES);
    expect(limits.arp.rate.min).toBe(1);
    expect(limits.arp.gate.max).toBe(100);
    expect(vocabulary.arpModes).toEqual(['chord', 'source']);
  });
});
