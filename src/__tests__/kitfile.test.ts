import { describe, expect, it } from 'vitest';

import {
  captureKit,
  copyKitVoices,
  createSong,
  DEFAULT_KIT,
  drumVoice,
  DRUM_IDS,
  KIT_FILE_EXTENSION,
  KIT_FILE_FORMAT,
  KIT_FILE_VERSION,
  KIT_IDS,
  kitAbout,
  kitFileName,
  kitFromJson,
  kitNameFromFile,
  kitNameFromTitle,
  kitNameProblem,
  kitRowLabel,
  kitToJson,
  KIT_NAME_SONG_FILE_VERSION,
  MAX_KIT_NAME,
  MAX_USER_KITS,
  parseUserKits,
  sameKitName,
  tidyKitName,
  userKitFromName,
  userKitNames,
  withUserKit,
  withoutUserKit,
  type UserKit,
} from '../model';

/**
 * The kit file: the song's four drums, made portable.
 *
 * `patchfile.test.ts` is this file's argument one scope in, and it applies again
 * with one addition. **Does the sound survive the trip?** — four voices, each a
 * wave and nine knobs, written by the same function a `.json` song writes one
 * with. **Does it stay out of the mix?** — a kit is not even a channel, so the
 * only thing it could leak into would be a level, and it carries none. And **does
 * a NAME keep working?** — the one thing a kit has that a patch does not, because
 * a kit is addressed by name from a script and a patch is only ever read on a row.
 */

/** A kit with something to say on every drum, so nothing defaults by accident. */
function richKit(name = 'MYHOUSE'): UserKit {
  return {
    name,
    voices: {
      kick: { ...drumVoice('kick'), wave: 'sine', bright: 5, ring: 60 },
      snare: { ...drumVoice('snare'), wave: 'triangle', bright: 44, noise: 70, ring: 9 },
      hat: { ...drumVoice('hat'), wave: 'square', bright: 91, noise: 88, ring: 3 },
      wind: { ...drumVoice('wind'), wave: 'square', bright: 100, noise: 100, ring: 30, attack: 20 },
    },
  };
}

/** A kit through the file and back, exactly as the app does it. */
function roundTrip(kit: UserKit): UserKit {
  const text = kitToJson(kit);
  const read = kitFromJson(text);
  if (!read.ok) throw new Error(read.errors.join('\n'));
  return read.kit;
}

/** The sentence(s) a kit file is refused with. */
function refused(text: string): string {
  const read = kitFromJson(text);
  expect(read.ok).toBe(false);
  if (read.ok) throw new Error('expected a refusal');
  return read.errors.join(' ');
}

describe('the kit file: a round trip', () => {
  it('writes and reads a kit with something on every drum', () => {
    const kit = richKit();
    expect(roundTrip(kit)).toEqual(kit);
  });

  it('keeps every drum, or a hit would be silent', () => {
    const back = roundTrip(richKit());
    for (const drum of DRUM_IDS) expect(back.voices[drum]).toBeTruthy();
    expect(Object.keys(back.voices).sort()).toEqual([...DRUM_IDS].sort());
  });

  it('writes the smallest possible file for a kit of the presets', () => {
    const kit = captureKit('PLAIN', DEFAULT_KIT);
    const file = JSON.parse(kitToJson(kit)) as Record<string, unknown>;
    // The four keys a kit cannot do without, and nothing else: a header, a name
    // and the four voices. No mix, because a kit is not a channel.
    expect(Object.keys(file).sort()).toEqual(['format', 'name', 'version', 'voices']);
    expect(file.format).toBe(KIT_FILE_FORMAT);
    expect(file.version).toBe(KIT_FILE_VERSION);
    expect(JSON.stringify(file)).not.toContain('level');
    expect(JSON.stringify(file)).not.toContain('pan');
  });

  it('is a kit document and says so in its first key', () => {
    const file = JSON.parse(kitToJson(richKit())) as Record<string, unknown>;
    expect(file.format).toBe(KIT_FILE_FORMAT);
    // The version is its OWN, at 1, not the song's: three formats share a
    // vocabulary and a song-only field must not make every kit look stale.
    expect(file.version).toBe(1);
    expect(KIT_FILE_FORMAT).not.toBe('tracklet-song');
    expect(KIT_FILE_FORMAT).not.toBe('tracklet-patch');
  });

  it('gives each drum its own copy, so a load cannot share one voice', () => {
    const kit = richKit();
    const voices = copyKitVoices(kit.voices);
    voices.kick.bright = 3;
    expect(kit.voices.kick.bright).not.toBe(3);
    // And `kitFromJson` hands back its own objects rather than the parse's.
    const back = roundTrip(kit);
    back.voices.hat.ring = 99;
    expect(kit.voices.hat.ring).not.toBe(99);
  });
});

describe('the kit file: what it refuses', () => {
  it('refuses text that is not JSON, and JSON that is not an object', () => {
    expect(refused('not json at all')).toContain('not JSON');
    expect(refused('[]')).toContain('must be a JSON object');
    expect(refused('42')).toContain('must be a JSON object');
  });

  it('refuses a SONG or a PATCH by name rather than reading it as a kit', () => {
    expect(refused(JSON.stringify({ format: 'tracklet-song', version: 29 }))).toContain('Tracklet song');
    expect(refused(JSON.stringify({ format: 'tracklet-patch', version: 1 }))).toContain('a patch');
    expect(refused(JSON.stringify({ format: 'tracklet-song', version: 29 }))).toContain(KIT_FILE_FORMAT);
    expect(refused(JSON.stringify({ version: 1 }))).toContain('no "format" key');
    expect(refused(JSON.stringify({ format: 'tracklet-kit', version: 1.5 }))).toContain('whole number');
  });

  it('refuses a file from a newer build rather than guessing at it', () => {
    const future = JSON.parse(kitToJson(richKit())) as Record<string, unknown>;
    future.version = KIT_FILE_VERSION + 1;
    expect(refused(JSON.stringify(future))).toContain('newer version');
  });

  it('refuses a name that could not be addressed from a script', () => {
    const file = JSON.parse(kitToJson(richKit())) as Record<string, unknown>;
    file.name = 'NOT A NAME AT ALL';
    expect(refused(JSON.stringify(file))).toContain('not usable');
    // A name that is one of the four BUILT-IN words is refused too: `kit 808`
    // cannot mean two different kits.
    const builtin = JSON.parse(kitToJson(richKit())) as Record<string, unknown>;
    builtin.name = '808';
    expect(refused(JSON.stringify(builtin))).toContain('already one of the built-in kits');
  });

  it('refuses a kit with a drum missing, because that hit would be silent', () => {
    const file = JSON.parse(kitToJson(richKit())) as Record<string, unknown>;
    delete (file.voices as Record<string, unknown>).snare;
    const message = refused(JSON.stringify(file));
    expect(message).toContain('no "snare" voice');
    expect(message).toContain('kick, snare, hat, wind');
  });

  it('refuses a drum whose wave is one this build does not know', () => {
    const file = JSON.parse(kitToJson(richKit())) as Record<string, unknown>;
    (file.voices as Record<string, Record<string, unknown>>).hat.wave = 'ghost';
    expect(refused(JSON.stringify(file))).toContain('wave must be');
  });

  it('refuses a voices key that is not an object', () => {
    const file = JSON.parse(kitToJson(richKit())) as Record<string, unknown>;
    file.voices = ['kick'];
    expect(refused(JSON.stringify(file))).toContain('"voices" must be an object');
  });
});

describe('a kit of your own: its name', () => {
  it('tidies a name to one token, upper case', () => {
    expect(tidyKitName('  my house ')).toBe('MY-HOUSE');
    expect(tidyKitName('myhouse')).toBe('MYHOUSE');
  });

  it('compares names in any case, so the script door is forgiving', () => {
    expect(sameKitName('MYHOUSE', 'myhouse')).toBe(true);
  });

  it('accepts a digit at the front, because `808` is taken so `909` must be nameable', () => {
    expect(kitNameProblem('909', [])).toBeNull();
    expect(kitNameProblem('MY_HOUSE-2', [])).toBeNull();
  });

  it('refuses an empty name, a long one, a word with the wrong characters and a built-in', () => {
    expect(kitNameProblem('', [])).toContain('needs a name');
    expect(kitNameProblem('A'.repeat(MAX_KIT_NAME + 1), [])).toContain('at most');
    expect(kitNameProblem('MY!HOUSE', [])).toContain('one word');
    // A space is not a character that cannot be repaired — it is the one a name
    // uses for `-`, exactly as a saved voice's does.
    expect(kitNameProblem('MY HOUSE', [])).toBeNull();
    for (const id of KIT_IDS) expect(kitNameProblem(id.toUpperCase(), [])).toContain('built-in');
  });

  it('refuses a name you already have, unless you are saving OVER it', () => {
    const library = [richKit('MYHOUSE')];
    expect(kitNameProblem('MYHOUSE', library)).toContain('already have a kit');
    // The name passed as its own `ignore` is what makes SAVE AS… able to replace.
    expect(kitNameProblem('MYHOUSE', library, 'MYHOUSE')).toBeNull();
  });

  it('names a kit from the song title, and makes it usable when it is not', () => {
    // The title gives a token, so a two-word title still names.
    expect(kitNameFromTitle('My Song', [])).toBe('MY-SONG');
    // A title with nothing in it still names.
    expect(kitNameFromTitle('   ', [])).toBe('KIT');
    // A title that is a BUILT-IN's word has to borrow another: a song literally
    // called `808` cannot own that name.
    expect(kitNameFromTitle('808', [])).toBe('808-2');
    // A title you already have a kit for borrows another.
    expect(kitNameFromTitle('MY-SONG', [richKit('MY-SONG')])).toBe('MY-SONG-2');
    // And a very long title is trimmed before a number is appended.
    expect(kitNameFromTitle('A'.repeat(40), []).length).toBeLessThanOrEqual(MAX_KIT_NAME);
    expect(kitNameProblem(kitNameFromTitle('A'.repeat(40), []), [])).toBeNull();
  });
});

describe('the library of your kits', () => {
  it('adds a kit, replaces the one with that name, and forgets one', () => {
    const one = withUserKit([], richKit('MYHOUSE'));
    expect(one.map((kit) => kit.name)).toEqual(['MYHOUSE']);
    const two = withUserKit(one, richKit('909'));
    expect(two.map((kit) => kit.name)).toEqual(['MYHOUSE', '909']);
    // Saving over a name you already have is the common case — you iterated.
    const replaced = withUserKit(two, { ...richKit('MYHOUSE'), name: 'myhouse' });
    expect(replaced).toHaveLength(2);
    expect(userKitFromName('myhouse', replaced)).toBeTruthy();
    expect(withoutUserKit(replaced, 'myhouse').map((kit) => kit.name)).toEqual(['909']);
  });

  it('caps NEW names, and refuses by leaving the library alone', () => {
    let library: UserKit[] = [];
    for (let n = 0; n < MAX_USER_KITS; n++) library = withUserKit(library, richKit(`KIT${n}`));
    expect(library).toHaveLength(MAX_USER_KITS);
    // One past the cap is not added at all — the caller can see that by the
    // length, which is what the LOAD KIT row checks before it changes the song.
    const over = withUserKit(library, richKit('ONEMORE'));
    expect(over).toHaveLength(MAX_USER_KITS);
    // ...but an EXISTING name can still be edited, so a full library is not frozen.
    const edited = withUserKit(library, { ...richKit('KIT0'), voices: richKit('X').voices });
    expect(edited).toHaveLength(MAX_USER_KITS);
    expect(edited.find((kit) => kit.name === 'KIT0')?.voices.kick.bright).toBe(5);
  });

  it('lists its names for a message, and finds one in any case', () => {
    const library = [richKit('MYHOUSE'), richKit('909')];
    expect(userKitNames(library)).toBe('MYHOUSE, 909');
    expect(userKitFromName('myhouse', library)?.name).toBe('MYHOUSE');
    expect(userKitFromName('NOTHING', library)).toBeNull();
  });

  it('reads a stored library leniently, dropping what cannot be read', () => {
    const raw = [
      { name: 'MYHOUSE', voices: richKit().voices },
      { name: '808', voices: richKit().voices },          // a built-in's word: dropped
      { name: 'MYHOUSE', voices: richKit().voices },      // a duplicate: dropped
      { voices: richKit().voices },                       // no name: dropped
      'nonsense',
      // A drum whose wave is unreadable is rebuilt from the presets rather than
      // taking the whole kit with it — a silent hit is worse than a stock one.
      { name: 'PARTIAL', voices: { kick: { wave: 'ghost' }, snare: richKit().voices.snare } },
    ];
    const parsed = parseUserKits(raw);
    expect(parsed.map((kit) => kit.name)).toEqual(['MYHOUSE', 'PARTIAL']);
    const partial = parsed.find((kit) => kit.name === 'PARTIAL')!;
    expect(partial.voices.kick).toEqual(drumVoice('kick'));
    expect(partial.voices.snare.wave).toBe('triangle');
    expect(partial.voices.hat).toEqual(drumVoice('hat'));
  });

  it('reads nothing out of rubbish', () => {
    expect(parseUserKits(null)).toEqual([]);
    expect(parseUserKits('nope')).toEqual([]);
    expect(parseUserKits(42)).toEqual([]);
  });
});

describe('a kit captured from a song', () => {
  it('captures the voices the drums ACTUALLY play, not a pointer to them', () => {
    const song = createSong();
    song.kit = DEFAULT_KIT;
    const captured = captureKit('STOLEN', song.kit);
    for (const drum of DRUM_IDS) expect(captured.voices[drum]).toEqual(drumVoice(drum));
    // Editing the captured kit cannot reach back into the presets.
    captured.voices.kick.bright = 1;
    expect(drumVoice('kick').bright).not.toBe(1);
  });

  it('captures a named kit through the library it was resolved against', () => {
    const mine = richKit('MYHOUSE');
    const captured = captureKit('COPY', 'MYHOUSE', [mine]);
    expect(captured.voices).toEqual(mine.voices);
    expect(captured.name).toBe('COPY');
  });
});

describe('the kit file: names and lines', () => {
  it('names the file from the kit name', () => {
    expect(kitFileName('MYHOUSE')).toBe(`myhouse${KIT_FILE_EXTENSION}`);
    expect(kitFileName('My House')).toBe(`my-house${KIT_FILE_EXTENSION}`);
  });

  it('reads a name back off a filename, for a file that does not say', () => {
    expect(kitNameFromFile(`myhouse${KIT_FILE_EXTENSION}`)).toBe('MYHOUSE');
    expect(kitNameFromFile('My House.json')).toBe('MY-HOUSE');
  });

  it('describes a kit by the wave each drum is made of, in drumming order', () => {
    expect(kitAbout(richKit())).toBe('sine kick, triangle snare, square hat, square wind');
    expect(kitRowLabel(richKit())).toBe('MYHOUSE  -  sine kick, triangle snare, square hat, square wind');
  });

  it('is a version of the SONG that an older build would refuse, not misplay', () => {
    // The name is the song's and the four voices are the app's: an older build
    // reading `"kit": "MYHOUSE"` would refuse it as an unknown kit, and (before
    // the version check) would play the presets and save the song onto them — so
    // the file says so in its version.
    expect(KIT_NAME_SONG_FILE_VERSION).toBeGreaterThan(KIT_FILE_VERSION);
  });
});
