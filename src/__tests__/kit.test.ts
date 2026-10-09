import { describe, expect, it } from 'vitest';

import {
  applyScript,
  cellText,
  createSong,
  DEFAULT_KIT,
  drumPatch,
  drumVoice,
  DRUM_IDS,
  DRUM_SONG_FILE_VERSION,
  instrumentCatalog,
  isDefaultKit,
  KIT_BY_ID,
  KIT_IDS,
  KIT_NAME_SONG_FILE_VERSION,
  KIT_SONG_FILE_VERSION,
  KITS,
  kitById,
  kitFromName,
  kitLabel,
  kitNames,
  kitPatch,
  kitVoice,
  kitVoices,
  layerFromVoice,
  nextKit,
  patchForTrack,
  SCRIPT_KEYWORDS,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  voiceById,
  voiceOfPlainLayer,
  type KitId,
  type Song,
} from '../model';
import { SCRIPT_COMMANDS, SCRIPT_VERSION, scriptCapabilities } from '../model/capabilities';

/**
 * DRUM KITS — which four patches a `drum` hit plays.
 *
 * The drums themselves (a kick, a snare, a hat, a wind, each at its General MIDI
 * pitch) are `drum.test.ts`'s subject. This file is the layer above: a kit is a
 * NAMED SET of four patches, so `kit 808` is a whole drum machine in one word.
 * The promise that makes it safe to add is the identity — `studio` is the four
 * presets, so a song that names no kit sounds exactly as it did and its file is
 * byte-for-byte the file it was — and most of these tests are that promise plus
 * the two doors a kit can come through.
 */

/** The song a script made, insisting it parsed. */
function applied(source: string, song: Song = createSong()): Song {
  const result = applyScript(song, source);
  expect(result.ok, result.ok ? '' : result.errors.map((error) => error.message).join(' | ')).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song;
}

/** What a script says, insisting it is refused. */
function refused(source: string): string {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map((error) => error.message).join(' ');
}

/** A song on a named kit, with a hit on it — the shape both doors are tested on. */
function onKit(id: string): Song {
  return applied(`tracks 1\nkit ${id}\ndrum 0 1 kick\ndrum 2 1 snare\ndrum 4 1 hat`);
}

describe('the kit table', () => {
  it('lists six kits, the presets first and every one complete', () => {
    expect(KIT_IDS).toEqual(['studio', '808', 'brush', 'rock', 'metal', 'dusty']);
    expect(DEFAULT_KIT).toBe('studio');
    for (const kit of KITS) {
      expect(kit.label.length).toBeGreaterThan(0);
      expect(kit.blurb.length).toBeGreaterThan(10);
      expect(kit.reach.length).toBeGreaterThan(10);
      // Every kit plays every drum: a missing one would be a hit with no sound,
      // which is the one failure a song cannot recover from.
      for (const drum of DRUM_IDS) expect(kit.voices[drum]).toBeTruthy();
    }
  });

  it('reads its own words from anywhere, and refuses every other word', () => {
    expect(kitFromName('808')).toBe('808');
    expect(kitFromName('  808 ')).toBe('808');
    expect(kitFromName('BRUSH')).toBe('brush');
    expect(kitFromName('Rock')).toBe('rock');
    expect(kitFromName('studio')).toBe('studio');
    expect(kitFromName('METAL')).toBe('metal');
    expect(kitFromName('Dusty')).toBe('dusty');
    expect(kitFromName('909')).toBeNull();
    expect(kitFromName('')).toBeNull();
    expect(kitNames()).toEqual(['studio', '808', 'brush', 'rock', 'metal', 'dusty']);
  });

  it('looks one up by id, and says what an id nothing knows reads as', () => {
    expect(kitById('brush')?.label).toBe('BRUSH');
    expect(kitById('909')).toBeNull();
    expect(kitLabel('808')).toBe('808');
    expect(isDefaultKit('studio')).toBe(true);
    expect(isDefaultKit('rock')).toBe(false);
    // A stray id (a hand-edited file, an older build) reads as the default rather
    // than as a missing kit, because a kit that cannot be found must still play.
    expect(kitLabel('909' as never)).toBe('STUDIO');
    expect(KIT_BY_ID.rock.id).toBe('rock');
  });

  it('cycles through the kits and wraps, so a control can point at one', () => {
    expect(nextKit('studio')).toBe('808');
    expect(nextKit('rock')).toBe('metal');
    expect(nextKit('dusty')).toBe('studio');
    // The cycle reaches every built-in exactly once, and never stands still.
    const seen: string[] = [];
    let id: string = DEFAULT_KIT;
    for (let i = 0; i < KITS.length; i++) { seen.push(id); id = nextKit(id); }
    expect(id).toBe(DEFAULT_KIT);
    expect(new Set(seen).size).toBe(KITS.length);
  });

  it('is the four presets when nothing is chosen — the whole reason it is safe', () => {
    // The identity that keeps every existing song's bytes, samples and grid
    // exactly where they were.
    expect(kitVoice('studio', 'kick')).toEqual(drumVoice('kick'));
    for (const drum of DRUM_IDS) {
      expect(kitVoice('studio', drum)).toEqual(drumVoice(drum));
      expect(kitVoice('studio', drum)).toEqual(voiceById(drum)!.params);
    }
    // An id nothing knows falls back to the same place.
    expect(kitVoice('909' as never, 'hat')).toEqual(drumVoice('hat'));
  });

  it('hands out copies, so a caller cannot edit the kit through what it is given', () => {
    const one = kitVoice('808', 'kick');
    one.bright = 99;
    expect(kitVoice('808', 'kick')).toEqual(KIT_BY_ID['808'].voices.kick);
    const list = kitVoices('rock');
    list[0].params.bright = 3;
    expect(kitVoices('rock')[0].params).toEqual(KIT_BY_ID.rock.voices.kick);
  });

  it('actually differs from the presets, so naming a kit is never a no-op', () => {
    for (const kit of KITS) {
      if (isDefaultKit(kit.id)) continue;
      const changed = DRUM_IDS.filter(
        (drum) => JSON.stringify(kitVoice(kit.id, drum)) !== JSON.stringify(drumVoice(drum)),
      );
      expect(changed.length, `${kit.id} changes nothing`).toBeGreaterThan(0);
    }
    // ...and the five named kits are five different kits.
    const named = KIT_IDS.filter((id) => !isDefaultKit(id));
    const shapes = new Set(named.map((id) => JSON.stringify(kitVoices(id as never))));
    expect(shapes.size).toBe(named.length);
  });

  it('gives the two genre kits opposite characters, which is the point of both', () => {
    // A metal kit and a dusty one are not a loud and a quiet studio kit: one has
    // MORE bite and ring on every drum, the other LESS. Checked on the four
    // numbers a hit's character actually lives in.
    const bite = (kit: KitId, drum: 'kick' | 'snare' | 'hat') => {
      const voice = kitVoice(kit, drum);
      return voice.bright + voice.noise;
    };
    for (const drum of ['kick', 'snare', 'hat'] as const) {
      expect(bite('metal', drum), drum).toBeGreaterThan(bite('rock', drum));
      expect(bite('dusty', drum), drum).toBeLessThan(bite('rock', drum));
    }
    // ...and the dusty one is the one that is SMARED rather than clean.
    expect(kitVoice('dusty', 'kick').thick).toBeGreaterThan(0);
    expect(kitVoice('rock', 'kick').thick).toBe(0);
  });

  it('swaps only the VOICE in a patch, keeping the stack above it and the shape', () => {
    const track = createSong().tracks[0];
    track.shape = 'sharp';
    track.stack = [layerFromVoice(voiceById('strings')!.params)];
    const patch = patchForTrack(track);
    const swapped = kitPatch(patch, '808', 'kick');
    expect(swapped.layers).toHaveLength(2);
    expect(swapped.shape).toBe('sharp');
    expect(voiceOfPlainLayer(swapped.layers[0])).toEqual(kitVoice('808', 'kick'));
    expect(swapped.layers[1]).toEqual(patch.layers[1]);
    // The studio kit IS `drumPatch`, so the two helpers cannot disagree.
    expect(kitPatch(patch, 'studio', 'snare')).toEqual(drumPatch(patch, 'snare'));
  });

  it('publishes the four drums a kit plays, in kit order', () => {
    const voices = kitVoices('brush');
    expect(voices.map((voice) => voice.drum)).toEqual(['kick', 'snare', 'hat', 'wind']);
    expect(voices.map((voice) => voice.params)).toEqual(DRUM_IDS.map((drum) => KIT_BY_ID.brush.voices[drum]));
  });
});

describe('choosing a kit, in the language', () => {
  it('sets the song kit, whichever way the word is spelled', () => {
    expect(applied('kit 808').kit).toBe('808');
    expect(applied('kit BRUSH').kit).toBe('brush');
    expect(applied('kit Rock').kit).toBe('rock');
    // `studio` is the same value as saying nothing, and a bare song is on it.
    expect(createSong().kit).toBe(DEFAULT_KIT);
    expect(applied('kit studio').kit).toBe('studio');
  });

  it('takes any well-formed word as a kit of your own, and refuses one that is not a name', () => {
    // A kit is no longer a closed list: a word that is not one of the four is a
    // kit of YOUR OWN (`kit MYHOUSE`), accepted by SHAPE exactly as a
    // `sample BRK02` is — the library it resolves against lives in the app, and
    // this file must stay pure. A WORD that could not be a name is still refused
    // while the author is still typing.
    const mine = applied('tracks 1\nkit MYHOUSE\ndrum 0 1 kick');
    expect(mine.kit).toBe('MYHOUSE');
    // With no library behind it the drums are the four PRESETS — the one fallback
    // the design leans on, the same bargain a missing sample makes.
    expect(kitVoice(mine.kit, 'kick')).toEqual(kitVoice('studio', 'kick'));
    // A name that is too long to be a name is refused, and the four built-ins are
    // the words the message names.
    const message = refused('kit AVERYLONGKITNAMES');
    expect(message).toContain('is not a kit');
    expect(message).toContain('studio, 808, brush, rock, metal, dusty');
    expect(refused('kit')).toContain('kit needs one kit');
    // A digit may START one — `808` is taken, so `909` has to be nameable — and
    // the built-in words still win a tie, because `kit 808` cannot mean two
    // different kits. A NEW built-in is the same rule arriving from the other
    // side: `metal` is now the app's, so a kit of yours may not be called it.
    expect(applied('tracks 1\nkit 909').kit).toBe('909');
    expect(applied('tracks 1\nkit ROCK').kit).toBe('rock');
  });

  it('changes nothing else about the song — a kit is not a note', () => {
    const drummed = onKit('studio');
    const machine = applied('tracks 1\nkit 808\ndrum 0 1 kick\ndrum 2 1 snare\ndrum 4 1 hat');
    // The same cells, the same pitches, the same grid text: only the SOUND moved.
    expect(machine.patterns[0].steps.map((row) => row[0]!.note))
      .toEqual(drummed.patterns[0].steps.map((row) => row[0]!.note));
    expect(cellText(machine.patterns[0].steps[0][0]!)).toBe('KCK');
  });

  it('is one command word, in the same order as everywhere else', () => {
    expect(SCRIPT_KEYWORDS).toContain('kit');
    expect(SCRIPT_COMMANDS.map((command) => command.word)).toEqual([...SCRIPT_KEYWORDS]);
    const row = SCRIPT_COMMANDS.find((command) => command.word === 'kit')!;
    expect(row.tier).toBe('deep');
    expect(row.example).toBe('kit 808');
    // A kit is chosen, not dialled: no new limit, and no cell spelling changed.
    expect(SCRIPT_KEYWORDS.filter((word) => word === 'kit')).toHaveLength(1);
  });
});

describe('the file, and the tool that writes one', () => {
  it('is a version of its own, because the same hits sound different', () => {
    // A song that names no kit — and one that names `studio` — write the version
    // they always wrote, with no `kit` key anywhere.
    const plain = JSON.parse(songToJson(onKit('studio'))) as Record<string, unknown>;
    expect(plain.version).toBe(DRUM_SONG_FILE_VERSION);
    expect(JSON.stringify(plain)).not.toContain('"kit"');
    const quiet = JSON.parse(songToJson(onKit('studio'))) as Record<string, unknown>;
    expect(JSON.stringify(quiet)).not.toContain('kit');
    // A named kit is newer than the drum, which is newer than the chord.
    expect(KIT_SONG_FILE_VERSION).toBeGreaterThan(DRUM_SONG_FILE_VERSION);
    // The newest version this build reads is whatever the latest feature made it
    // — a sample was added after the kit, so the ceiling moved and the kit's own
    // number did not.
    expect(SONG_FILE_VERSION_MAX).toBeGreaterThanOrEqual(KIT_SONG_FILE_VERSION);
    expect(SONG_FILE_VERSION).toBeLessThan(DRUM_SONG_FILE_VERSION);
    const machine = JSON.parse(songToJson(onKit('808'))) as { version: number; kit: string };
    expect(machine.version).toBe(KIT_SONG_FILE_VERSION);
    expect(machine.kit).toBe('808');
  });

  it('round-trips a kit through the JSON format', () => {
    for (const id of ['808', 'brush', 'rock']) {
      const back = songFromJson(songToJson(onKit(id)));
      expect(back.ok).toBe(true);
      if (!back.ok) throw new Error(back.errors.join(' / '));
      expect(back.song.kit).toBe(id);
      // The hits are untouched: a kit is a sound, not a note.
      expect(back.song.patterns[0].steps[0][0]!.note).toBe(36);
    }
  });

  it('writes the kit into a script and reads it back word for word', () => {
    const text = songToScript(onKit('rock'));
    expect(text).toContain('kit rock');
    expect(applied(text).kit).toBe('rock');
    const again = applied(songToScript(applied(text)));
    expect(again.kit).toBe('rock');
    // The default kit writes no line at all, so a presets song's script is the
    // script this app always wrote.
    expect(songToScript(onKit('studio'))).not.toContain('kit ');
  });

  it('writes a song on the default kit byte-for-byte the same as one that never named it', () => {
    const named = applied('tracks 1\nkit studio\ndrum 0 1 kick');
    const bare = applied('tracks 1\ndrum 0 1 kick');
    expect(songToJson(named)).toBe(songToJson(bare));
    expect(songToScript(named)).toBe(songToScript(bare));
  });

  it('takes a kit of your own in a file by name, and refuses a word that is not a name', () => {
    // A name this machine does not have still OPENS: the four voices are the
    // app's and the name is the song's, so a song can travel without its library
    // — the sample's bargain, one scope over. The name is tidied to a token.
    const file = JSON.parse(songToJson(onKit('808'))) as Record<string, unknown>;
    file.kit = 'myhouse';
    const read = songFromJson(JSON.stringify(file));
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error(read.errors.join(' | '));
    expect(read.song.kit).toBe('MYHOUSE');
    // ...and writing it back names the version that says "this song names a kit
    // of your own", so an older build refuses the file rather than playing it on
    // the presets and saving it that way.
    expect(JSON.parse(songToJson(read.song)).version).toBe(KIT_NAME_SONG_FILE_VERSION);
    // A word that could not be a name is refused, with the built-ins named.
    const bad = JSON.parse(songToJson(onKit('808'))) as Record<string, unknown>;
    bad.kit = 'NOT A NAME AT ALL';
    const refusedRead = songFromJson(JSON.stringify(bad));
    expect(refusedRead.ok).toBe(false);
    if (refusedRead.ok) throw new Error('expected a refusal');
    expect(refusedRead.errors.join(' ')).toContain('is not a kit');
    expect(refusedRead.errors.join(' ')).toContain('studio, 808, brush, rock, metal, dusty');
    // ...and refuses a key that is not even a word.
    const typed = JSON.parse(songToJson(onKit('808'))) as Record<string, unknown>;
    typed.kit = 808;
    const numeric = songFromJson(JSON.stringify(typed));
    expect(numeric.ok).toBe(false);
    if (numeric.ok) throw new Error('expected a refusal');
    expect(numeric.errors.join(' ')).toContain('"kit" must be one of');
  });
});

describe('the vocabulary a tool reads', () => {
  it('publishes the kit list, with the default marked', () => {
    const caps = scriptCapabilities();
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(15);
    expect(caps.versionNotes.find((entry) => entry.version === 15)?.note).toContain('KIT');
    expect(caps.vocabulary.kits.map((kit) => kit.id)).toEqual([...KIT_IDS]);
    expect(caps.vocabulary.kits.filter((kit) => kit.atDefault).map((kit) => kit.id)).toEqual(['studio']);
    for (const kit of caps.vocabulary.kits) {
      expect(kit.blurb.length).toBeGreaterThan(10);
      expect(kit.reach.length).toBeGreaterThan(10);
      // Every published word really parses: the manifest is the same closed list.
      expect(applied(`kit ${kit.id}`).kit).toBe(kit.id);
    }
  });

  it('lists the kits in the instrument catalog, with their four patches', () => {
    const catalog = instrumentCatalog();
    expect(catalog.kits.map((kit) => kit.id)).toEqual([...KIT_IDS]);
    expect(catalog.kits[0].atDefault).toBe(true);
    for (const kit of catalog.kits) {
      expect(kit.script).toBe(`kit ${kit.id}`);
      expect(kit.voices.map((voice) => voice.drum)).toEqual([...DRUM_IDS]);
    }
    // Data, not the table: editing what the catalog hands out cannot change the
    // sound the engine plays.
    catalog.kits[1].voices[0].params.bright = 3;
    expect(instrumentCatalog().kits[1].voices[0].params.bright).toBe(KIT_BY_ID['808'].voices.kick.bright);
  });
});
