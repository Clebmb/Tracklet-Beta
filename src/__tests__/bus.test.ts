import { describe, expect, it } from 'vitest';

import {
  applyScript,
  BUS_SONG_FILE_VERSION,
  busByName,
  busLabel,
  busLevelFor,
  busNameProblem,
  busNames,
  busScript,
  busesToScript,
  channelBusLevels,
  channelsOfBus,
  clampBusLevel,
  createSong,
  DEFAULT_LEVEL,
  MAX_BUSES,
  MAX_BUS_NAME,
  NO_BUS_WORD,
  parseScript,
  sameBus,
  sameBusName,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  songFromJson,
  songToJson,
  songToScript,
  tidyBus,
  tidyBuses,
  tidyBusName,
  withBus,
  withoutBus,
  type Song,
} from '../model';
import { channelGain } from '../model/mix';
import { SCRIPT_KEYWORDS, SCRIPT_QUICK_REFERENCE } from '../model/script';
import { scriptCapabilities } from '../model/capabilities';

/**
 * Buses: `bus DRUMS 70` plus `track 1 bus DRUMS` — one fader over a kit.
 *
 * The promise has three halves, and the first is the one a mistake would ruin
 * silently. A song with no groups must be UNCHANGED: the same gain on every
 * channel, the same graph, the same bytes, which is why the group's level is an
 * optional argument to `channelGain` that defaults to the identity. The second is
 * that a group is a MULTIPLIER and not a node of its own, so the sends move with
 * it — pull the drums down and the drums are quieter in the room too. The third is
 * that the name is checked where it is written: a track line joining a group the
 * song does not have is refused with the list, never quietly left on its own
 * fader, because that would play the channel louder than the line asked for.
 */

/** A song built from a script, which is how every test here sets one up. */
function applied(source: string, from: Song = createSong()): Song {
  const result = applyScript(from, source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('\n'));
  return result.song;
}

/** The message a script is refused with, for the refusals below. */
function refusal(source: string, from: Song = createSong()): string {
  const result = applyScript(from, source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map((error) => error.message).join('\n');
}

// --- the table ---------------------------------------------------------------

describe('the bus table', () => {
  it('caps a song at four groups, which is half its channels', () => {
    // Derived rather than chosen: a song has at most 8 channels and a group of ONE
    // is just that channel's fader, so four is the most a song can use without one
    // of them being pointless.
    expect(MAX_BUSES).toBe(4);
    expect(MAX_BUS_NAME).toBe(12);
    expect(NO_BUS_WORD).toBe('none');
  });

  it('tidies a name the way a reader repairs one: trimmed, upper-cased, cut', () => {
    expect(tidyBusName('  drums ')).toBe('DRUMS');
    expect(tidyBusName('my-kit')).toBe('MY-KIT');
    expect(tidyBusName('a'.repeat(20))).toBe('a'.repeat(MAX_BUS_NAME).toUpperCase());
  });

  it('refuses a name that is not one word, and says what to write instead', () => {
    expect(busNameProblem('')).toContain('needs a name');
    expect(busNameProblem('MY DRUMS')).toContain('one word');
    expect(busNameProblem('MY DRUMS')).toContain('bus MYDRUMS 70');
    expect(busNameProblem('KIT!')).toContain('one word');
    expect(busNameProblem('KIT!')).toContain('bus KIT 70');
    expect(busNameProblem('a'.repeat(MAX_BUS_NAME + 1))).toContain(`at most ${MAX_BUS_NAME} characters`);
  });

  it('reserves `none`, because it is how a channel leaves a group', () => {
    const problem = busNameProblem('none');
    expect(problem).toContain('takes a channel OFF a bus');
    expect(busNameProblem('NONE')).toBe(problem);
    // Every other word is fine, including one that merely contains it.
    expect(busNameProblem('NONET')).toBeNull();
  });

  it('accepts the names a mixer would use', () => {
    for (const name of ['DRUMS', 'drums', 'BACKING', 'MY-KIT', 'KIT_2', 'K3']) {
      expect(busNameProblem(name)).toBeNull();
    }
  });

  it('compares names however they were typed', () => {
    expect(sameBusName('drums', 'DRUMS')).toBe(true);
    expect(sameBusName('drums', 'drum')).toBe(false);
  });

  it('clamps a level to the range a fader has', () => {
    expect(clampBusLevel(-20)).toBe(0);
    expect(clampBusLevel(140)).toBe(100);
    expect(clampBusLevel(69.6)).toBe(70);
    expect(tidyBus({ name: 'drums', level: 400 })).toEqual({ name: 'DRUMS', level: 100 });
  });

  it('drops a nameless group, keeps the later of two names, and stops at four', () => {
    expect(tidyBuses([{ name: '', level: 50 }, { name: 'DRUMS', level: 70 }]))
      .toEqual([{ name: 'DRUMS', level: 70 }]);
    expect(tidyBuses([{ name: 'drums', level: 70 }, { name: 'DRUMS', level: 40 }]))
      .toEqual([{ name: 'DRUMS', level: 40 }]);
    const many = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name, level: 50 }));
    expect(tidyBuses(many).map((bus) => bus.name)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('adds and replaces by name, keeping the order it was built in', () => {
    const one = withBus([], { name: 'drums', level: 70 });
    expect(one).toEqual([{ name: 'DRUMS', level: 70 }]);
    const two = withBus(one, { name: 'BASS', level: 90 });
    const moved = withBus(two, { name: 'drums', level: 40 });
    expect(moved).toEqual([{ name: 'DRUMS', level: 40 }, { name: 'BASS', level: 90 }]);
    expect(withoutBus(two, 'drums')).toEqual([{ name: 'BASS', level: 90 }]);
    expect(busByName(two, 'drums')).toEqual({ name: 'DRUMS', level: 70 });
    expect(busByName(two, 'LEAD')).toBeNull();
    expect(busNames(two)).toEqual(['DRUMS', 'BASS']);
  });

  it('shows and writes a group in the language’s own words', () => {
    expect(busLabel({ name: 'drums', level: 70 })).toBe('DRUMS 70');
    expect(busScript({ name: 'drums', level: 70 })).toBe('bus DRUMS 70');
    expect(busesToScript([{ name: 'drums', level: 70 }, { name: 'bass', level: 90 }]))
      .toBe('bus DRUMS 70\nbus BASS 90');
    expect(sameBus({ name: 'DRUMS', level: 70 }, { name: 'DRUMS', level: 70 })).toBe(true);
    expect(sameBus({ name: 'DRUMS', level: 70 }, { name: 'DRUMS', level: 60 })).toBe(false);
  });

  it('resolves a channel’s group level, and leaves a channel with none at full', () => {
    const buses = [{ name: 'DRUMS', level: 70 }];
    expect(busLevelFor(buses, 'DRUMS')).toBe(70);
    expect(busLevelFor(buses, 'drums')).toBe(70);
    expect(busLevelFor(buses, null)).toBe(DEFAULT_LEVEL);
    expect(busLevelFor(buses, undefined)).toBe(DEFAULT_LEVEL);
    expect(busLevelFor(buses, 'LEAD')).toBe(DEFAULT_LEVEL);
    expect(busLevelFor([], 'DRUMS')).toBe(DEFAULT_LEVEL);
    expect(channelBusLevels(buses, [{ bus: 'DRUMS' }, { bus: null }, { bus: 'LEAD' }]))
      .toEqual([70, DEFAULT_LEVEL, DEFAULT_LEVEL]);
  });

  it('derives the channels on a group, in channel order', () => {
    const tracks = [{ bus: 'DRUMS' }, { bus: 'drums' }, { bus: null }, { bus: 'BASS' }];
    expect(channelsOfBus(tracks, 'drums')).toEqual([1, 2]);
    expect(channelsOfBus(tracks, 'BASS')).toEqual([4]);
    expect(channelsOfBus(tracks, 'LEAD')).toEqual([]);
  });
});

// --- the arithmetic ----------------------------------------------------------

describe('the group fader', () => {
  it('multiplies a channel’s own level, and rounds to a whole percentage', () => {
    expect(channelGain(0, [50], [], [], 70)).toBe(35);
    expect(channelGain(0, [100], [], [], 70)).toBe(70);
    expect(channelGain(0, [50], [], [], 100)).toBe(50);
    expect(channelGain(0, [55], [], [], 70)).toBe(39);
    expect(channelGain(0, [100], [], [], 0)).toBe(0);
  });

  it('IS the identity when a channel has no group, which is every older song', () => {
    // The whole reason the argument is optional and full at rest: every caller
    // that knows nothing about groups — the engine, the renderer, the mix menu —
    // asks the same question it always asked, and gets the same answer bit for
    // bit.
    for (const level of [0, 1, 37, 50, 99, 100]) {
      expect(channelGain(0, [level], [false], [false])).toBe(level);
      expect(channelGain(0, [level], [false], [false], DEFAULT_LEVEL)).toBe(level);
    }
  });

  it('lets mute and solo win over a group', () => {
    // A group moves how LOUD a channel is, never whether it is heard.
    expect(channelGain(0, [100], [true], [], 70)).toBe(0);
    expect(channelGain(0, [100], [false], [true, false], 70)).toBe(70);
    expect(channelGain(1, [100], [false], [true, false], 70)).toBe(0);
    expect(channelGain(0, [100], [false], [false], 70)).toBe(70);
  });

  it('clamps a group level that arrives out of range, like every other level', () => {
    expect(channelGain(0, [100], [], [], 400)).toBe(100);
    expect(channelGain(0, [100], [], [], -5)).toBe(0);
    // A level that is not a number means "no group" rather than silence: full is
    // the reading that cannot mute a channel by arithmetic accident.
    expect(channelGain(0, [100], [], [], Number.NaN)).toBe(100);
  });
});

// --- the script --------------------------------------------------------------

describe('the bus statement', () => {
  it('defines a group and lets a channel join it', () => {
    const song = applied('tracks 4\nbus DRUMS 70\ntrack 1 "KICK" bus DRUMS\ntrack 2 "SNARE" bus DRUMS\ntrack 3 "HAT" level 45');
    expect(song.buses).toEqual([{ name: 'DRUMS', level: 70 }]);
    expect(song.tracks.map((track) => track.bus)).toEqual(['DRUMS', 'DRUMS', null, null]);
    expect(song.tracks[2].level).toBe(45);
  });

  it('reads a name however it was typed, in either place', () => {
    const song = applied('bus drums 70\ntrack 1 bus DRUMS\ntrack 2 bus drums');
    expect(song.buses[0].name).toBe('DRUMS');
    expect(song.tracks[0].bus).toBe('DRUMS');
    expect(song.tracks[1].bus).toBe('DRUMS');
  });

  it('moves a group when the same name is defined again', () => {
    const song = applied('tracks 2\nbus DRUMS 70\ntrack 1 bus DRUMS\nbus DRUMS 45\ntrack 2 bus DRUMS');
    expect(song.buses).toEqual([{ name: 'DRUMS', level: 45 }]);
    // Both channels read the one group, so a later line moves the channel that
    // joined before it too — the group is a name, not a value copied at join time.
    expect(song.tracks.map((track) => track.bus)).toEqual(['DRUMS', 'DRUMS']);
    expect(channelBusLevels(song.buses, song.tracks)).toEqual([45, 45]);
  });

  it('takes a channel back off a group with `bus none`', () => {
    const song = applied('tracks 2\nbus DRUMS 70\ntrack 1 bus DRUMS\ntrack 2 bus DRUMS\ntrack 1 bus none');
    expect(song.tracks[0].bus).toBeNull();
    expect(song.tracks[1].bus).toBe('DRUMS');
    expect(song.buses).toHaveLength(1);
  });

  it('may be joined by a channel the SONG already has a group for', () => {
    // The context rule: a script pasted onto a grouped song can move it without
    // redefining it, because a group is something a song HAS.
    const first = applied('tracks 3\nbus DRUMS 70\ntrack 1 bus DRUMS');
    const second = applied('track 2 bus DRUMS level 60', first);
    expect(second.tracks[1].bus).toBe('DRUMS');
    expect(second.buses).toEqual([{ name: 'DRUMS', level: 70 }]);
  });

  it('refuses a channel that joins a group nothing has defined', () => {
    const message = refusal('tracks 2\ntrack 1 bus DRUMS');
    expect(message).toContain('joins a bus the song does not have: "DRUMS"');
    expect(message).toContain('the song has no buses yet');
    expect(message).toContain('"bus DRUMS 70" then "track 1 bus DRUMS"');
    // And with a group already there, the message names what the song HAS.
    const other = refusal('tracks 2\nbus BASS 80\ntrack 1 bus DRUMS');
    expect(other).toContain('the song has: BASS');
  });

  it('refuses a group named with two words, or none at all', () => {
    expect(refusal('bus')).toContain('bus needs a name and a level');
    expect(refusal('bus DRUMS')).toContain('bus DRUMS needs a level');
    // Two words read as a name and a level, and the message spells out the repair.
    expect(refusal('bus MY DRUMS 70')).toContain('A bus NAME is one word');
    expect(refusal('bus MY DRUMS 70')).toContain('write "bus MYDRUMS 70"');
    expect(refusal('bus NONE 70')).toContain('takes a channel OFF a bus');
    expect(refusal(`bus ${'A'.repeat(13)} 70`)).toContain('at most 12 characters');
  });

  it('refuses a level that is not a percentage, rather than clamping it', () => {
    expect(refusal('bus DRUMS 140')).toContain('bus DRUMS takes a level 0..100; got "140"');
    expect(refusal('bus DRUMS loud')).toContain('bus DRUMS takes a level 0..100; got "loud"');
    expect(refusal('bus DRUMS -10')).toContain('bus DRUMS takes a level 0..100; got "-10"');
    // Closer to the edge than the eye: `100` is not "loud", it is "as loud as the
    // channels already are".
    expect(applied('bus DRUMS 100').buses[0].level).toBe(100);
    expect(applied('bus DRUMS 0').buses[0].level).toBe(0);
  });

  it('refuses a fifth group, naming the way out', () => {
    const message = refusal('bus A 50\nbus B 50\nbus C 50\nbus D 50\nbus E 50');
    expect(message).toContain('at most 4 buses, and this one already has 4');
    expect(message).toContain('Use one of the names it has');
    // Redefining one of the four is the fix, and it is not a refusal.
    const song = applied('bus A 50\nbus B 50\nbus C 50\nbus D 50\nbus D 40');
    expect(song.buses.map((bus) => bus.level)).toEqual([50, 50, 50, 40]);
  });

  it('treats a bare `bus` on a track line as the setting it is, not a name', () => {
    const message = refusal('tracks 2\nbus DRUMS 70\ntrack 1 "KICK" bus');
    expect(message).toContain('bus needs the name of a group');
    expect(message).toContain('"BUS"');
  });

  it('clears every group when a script starts with `new`', () => {
    // The bug the lanes had once, pinned here before it can happen: a script that
    // says `new` must not inherit the last song's groups, nor land its own on top
    // of them.
    const first = applied('tracks 3\nbus DRUMS 70\ntrack 1 bus DRUMS\ntrack 2 bus DRUMS');
    const second = applied('new\ntracks 2\nbus BASS 60\ntrack 1 bus BASS', first);
    expect(second.buses).toEqual([{ name: 'BASS', level: 60 }]);
    expect(second.tracks.map((track) => track.bus)).toEqual(['BASS', null]);
  });

  it('is announced to tools, in the parser’s own order', () => {
    const manifest = scriptCapabilities();
    expect(manifest.keywords).toContain('bus');
    expect(manifest.limits.buses).toEqual({ max: MAX_BUSES, nameChars: { max: MAX_BUS_NAME } });
    expect(manifest.versionNotes.some((note) => note.note.includes('bus DRUMS 70'))).toBe(true);
    const row = manifest.commands.find((command) => command.word === 'bus');
    expect(row).toBeDefined();
    // The published example has to be a line that works.
    expect(applied(row!.example).buses).toEqual([{ name: 'DRUMS', level: 70 }]);
    // And the cheat sheet has to mention it, or a keyword test would fail anyway.
    expect(SCRIPT_QUICK_REFERENCE.join(' ')).toContain('bus DRUMS 70');
  });

  it('sits in the keyword list before the channels that join it can be addressed', () => {
    // The order is not cosmetic: the parser's list is what an `unknown command`
    // message prints, and a group is declared above the track lines that join it.
    expect(SCRIPT_KEYWORDS.indexOf('bus')).toBeGreaterThan(SCRIPT_KEYWORDS.indexOf('arrange'));
    expect(SCRIPT_KEYWORDS.indexOf('bus')).toBeLessThan(SCRIPT_KEYWORDS.indexOf('theme'));
  });
});

// --- the file ----------------------------------------------------------------

describe('groups in a song file', () => {
  it('writes no keys at all, and version 12, for a song with no groups', () => {
    const song = applied('tracks 3\ntrack 1 "KICK" level 80');
    const raw = JSON.parse(songToJson(song)) as {
      version: number;
      buses?: unknown;
      tracks: Record<string, unknown>[];
    };
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(raw.buses).toBeUndefined();
    for (const track of raw.tracks) expect(track.bus).toBeUndefined();
    // And the script writer says nothing about groups either.
    expect(songToScript(song)).not.toContain('bus');
  });

  it('writes version 22 when a channel is in a group', () => {
    const song = applied('tracks 3\nbus DRUMS 70\ntrack 1 "KICK" bus DRUMS\ntrack 2 "SNARE" bus DRUMS');
    const raw = JSON.parse(songToJson(song)) as {
      version: number;
      buses: { name: string; level: number }[];
      tracks: { bus?: string }[];
    };
    expect(raw.version).toBe(BUS_SONG_FILE_VERSION);
    expect(BUS_SONG_FILE_VERSION).toBeLessThanOrEqual(SONG_FILE_VERSION_MAX);
    expect(raw.buses).toEqual([{ name: 'DRUMS', level: 70 }]);
    expect(raw.tracks[0].bus).toBe('DRUMS');
    expect(raw.tracks[2].bus).toBeUndefined();
  });

  it('writes version 22 for a group with no channels on it yet, too', () => {
    // The group is part of the mix whether or not a channel has joined it, and an
    // older build would drop it on the way through.
    const raw = JSON.parse(songToJson(applied('tracks 2\nbus DRUMS 70'))) as { version: number };
    expect(raw.version).toBe(BUS_SONG_FILE_VERSION);
  });

  it('round-trips through JSON', () => {
    const song = applied('tracks 4\nbus DRUMS 70\ntrack 1 bus DRUMS\ntrack 2 bus DRUMS\ntrack 3 level 45 bus DRUMS');
    const again = songFromJson(songToJson(song));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.song.buses).toEqual(song.buses);
    expect(again.song.tracks.map((track) => track.bus)).toEqual(song.tracks.map((track) => track.bus));
    expect(again.song.tracks.map((track) => track.level)).toEqual(song.tracks.map((track) => track.level));
  });

  it('round-trips through the script, above the channels that join them', () => {
    const song = applied('tracks 3\nbus DRUMS 70\ntrack 1 "KICK" bus DRUMS\ntrack 2 "SNARE" bus DRUMS');
    const text = songToScript(song);
    const lines = text.split('\n');
    expect(lines).toContain('bus DRUMS 70');
    // Above the channels, because a script is read top to bottom.
    expect(lines.findIndex((line) => line.startsWith('bus DRUMS'))).toBeLessThan(
      lines.findIndex((line) => line.includes('bus DRUMS') && line.startsWith('track ')),
    );
    expect(lines.some((line) => line.startsWith('track 1 ') && line.includes(' bus DRUMS'))).toBe(true);
    const again = applied(text);
    expect(again.buses).toEqual(song.buses);
    expect(again.tracks.map((track) => track.bus)).toEqual(song.tracks.map((track) => track.bus));
  });

  it('clamps a level written past the range, and reads an absent one as full', () => {
    const raw = JSON.stringify({
      format: 'tracklet-song',
      version: 22,
      title: 'T',
      key: { root: 'C', scale: 'major' },
      bpm: 120,
      stepsPerBeat: 4,
      steps: 16,
      order: [1],
      buses: [{ name: 'drums', level: 400 }, { name: 'PAD' }],
      tracks: [
        { name: 'ONE', voice: { wave: 'square' }, muted: false, bus: 'drums' },
        { name: 'TWO', voice: { wave: 'square' }, muted: false, bus: 'pad' },
      ],
      patterns: [{ name: 'A', steps: [] }],
    });
    const parsed = songFromJson(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.song.buses).toEqual([{ name: 'DRUMS', level: 100 }, { name: 'PAD', level: DEFAULT_LEVEL }]);
    expect(parsed.song.tracks[0].bus).toBe('DRUMS');
    expect(parsed.song.tracks[1].bus).toBe('PAD');
  });

  it('refuses a channel that joins a group the file does not have', () => {
    const raw = JSON.stringify({
      format: 'tracklet-song',
      version: 22,
      title: 'T',
      key: { root: 'C', scale: 'major' },
      bpm: 120,
      stepsPerBeat: 4,
      steps: 16,
      order: [1],
      tracks: [{ name: 'ONE', voice: { wave: 'square' }, muted: false, bus: 'DRUMS' }],
      patterns: [{ name: 'A', steps: [] }],
    });
    const parsed = songFromJson(raw);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join('\n')).toContain('channel 1 joins a bus this file does not have: "DRUMS"');
    expect(parsed.errors.join('\n')).toContain('this file has no "buses" at all');
  });

  it('refuses a malformed group, rather than guessing at the mix', () => {
    const base = {
      format: 'tracklet-song',
      version: 22,
      title: 'T',
      key: { root: 'C', scale: 'major' },
      bpm: 120,
      stepsPerBeat: 4,
      steps: 16,
      order: [1],
      tracks: [{ name: 'ONE', voice: { wave: 'square' }, muted: false }],
      patterns: [{ name: 'A', steps: [] }],
    };
    const cases: [unknown, string][] = [
      ['DRUMS', '"buses" must be an array of groups'],
      [[{ name: 'A B', level: 70 }], 'needs a "name"'],
      [[{ name: 'NONE', level: 70 }], 'needs a "name"'],
      [[{ name: 'DRUMS', level: 'loud' }], 'needs a "level" 0..100'],
      [[{ name: 'A', level: 50 }, { name: 'B', level: 50 }, { name: 'C', level: 50 }, { name: 'D', level: 50 }, { name: 'E', level: 50 }], 'at most 4 buses'],
      [[70], 'must be an object like'],
    ];
    for (const [buses, expected] of cases) {
      const parsed = songFromJson(JSON.stringify({ ...base, buses }));
      expect(parsed.ok).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.errors.join('\n')).toContain(expected);
    }
  });

  it('keeps the group, and the channels that remain, when the channel count shrinks', () => {
    // Fewer channels does not mean fewer groups: the channels that stay keep what
    // they were mixed with, exactly as they keep their levels, pans and effects.
    const first = applied('tracks 4\nbus DRUMS 70\ntrack 1 bus DRUMS\ntrack 4 bus DRUMS');
    const second = applied('tracks 2', first);
    expect(second.tracks.map((track) => track.bus)).toEqual(['DRUMS', null]);
    expect(second.buses).toEqual([{ name: 'DRUMS', level: 70 }]);
  });

  it('parses against the song’s own groups, so a live check agrees with APPLY', () => {
    const song = applied('tracks 3\nbus DRUMS 70\ntrack 1 bus DRUMS');
    const context = { trackCount: song.tracks.length, rows: 16, rowsPerBeat: 4, buses: song.buses };
    expect(parseScript('track 2 bus DRUMS', context).errors).toEqual([]);
    expect(parseScript('track 2 bus BASS', context).errors[0].message)
      .toContain('joins a bus the song does not have: "BASS"');
  });
});
