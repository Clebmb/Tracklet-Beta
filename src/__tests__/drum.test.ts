import { describe, expect, it } from 'vitest';

import {
  applyScript,
  cellNotes,
  cellText,
  CHORD_SONG_FILE_VERSION,
  copyCell,
  copyPattern,
  countNotes,
  createSong,
  DRUM_BY_ID,
  DRUM_IDS,
  DRUMS,
  DRUM_SONG_FILE_VERSION,
  drumForPitch,
  drumFromName,
  drumLabel,
  drumNames,
  drumPatch,
  drumPitch,
  drumVoice,
  emptyCell,
  emptyPattern,
  isDrumName,
  layerFromVoice,
  patchForTrack,
  rowNotes,
  SCRIPT_KEYWORDS,
  setCellDrum,
  setCellNotes,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  voiceById,
  voiceOfPlainLayer,
  type Song,
} from '../model';
import { SCRIPT_COMMANDS, SCRIPT_VERSION, scriptCapabilities } from '../model/capabilities';
import { DRUM_CHANNEL, readMidi, songFromMidi } from '../model/midi';
import { DRUM_PITCHES, songToMidi } from '../model/midiExport';

/**
 * A DRUM KIT: one channel playing a whole set, a hit at a time.
 *
 * Percussion used to be a side effect of a channel's voice — a kick channel, a
 * snare channel, a hat channel, three faders that happened to be one kit. A cell
 * now NAMES the drum it is, so a beat lives on one channel and each hit carries
 * its own sound. This file holds the four facts that make that safe: the kit
 * table and its two lookups, the cell invariant (a drum is a hit, so it holds no
 * chord), the language's two spellings, the file's version, the export, and the
 * published manifest.
 */

/** The song a script made, insisting it parsed. */
function applied(source: string, song: Song = createSong()): Song {
  const result = applyScript(song, source);
  expect(result.ok, result.ok ? '' : result.errors.map((error) => error.message).join(' | ')).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song;
}

/** What a script says, insisting it is refused. */
function refused(source: string, song: Song = createSong()): string {
  const result = applyScript(song, source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map((error) => error.message).join(' ');
}

/** A beat on one kit channel: a kick, a snare and a hat, each on its own step. */
function beat(): Song {
  return applied('tracks 1\ndrum 0 1 kick\ndrum 2 1 snare\ndrum 4 1 hat');
}

/** A cell of the first pattern. */
function cellAt(song: Song, row: number, track = 0) {
  return song.patterns[0].steps[row][track]!;
}

describe('the kit', () => {
  it('is four hits of four different kinds, with the pitches the world shares', () => {
    expect(DRUM_IDS).toEqual(['kick', 'snare', 'hat', 'wind']);
    // 36 is MIDI's kick and 42 its closed hat: the pitch a cell holds IS the drum,
    // which is what lets an export and a reader treat a kit with no translation.
    expect(DRUMS.map((drum) => drum.pitch)).toEqual([36, 38, 42, 44]);
    // Three characters, because that is all a grid column has.
    expect(DRUMS.map((drum) => drum.short)).toEqual(['KCK', 'SNR', 'HAT', 'WND']);
    expect(DRUMS.map((drum) => drum.label)).toEqual(['Kick', 'Snare', 'Hat', 'Wind']);
    for (const drum of DRUMS) {
      expect(drum.short).toHaveLength(3);
      expect(drum.blurb.length).toBeGreaterThan(0);
    }
  });

  it('reads its own words from anywhere, and refuses every other word', () => {
    expect(drumFromName('kick')).toBe('kick');
    // Case-insensitive, like every other closed list in the language ('SHARP', 'Pad').
    expect(drumFromName('KICK')).toBe('kick');
    expect(drumFromName('  Snare ')).toBe('snare');
    expect(drumFromName('bongo')).toBeNull();
    expect(drumFromName('')).toBeNull();
    expect(isDrumName('Hat')).toBe(true);
    expect(isDrumName('cymbal')).toBe(false);
    expect(drumNames()).toEqual(['kick', 'snare', 'hat', 'wind']);
  });

  it('round-trips pitch to drum and back, and is strict about a pitch that is not one', () => {
    for (const drum of DRUM_IDS) expect(drumForPitch(drumPitch(drum))).toBe(drum);
    // 37 is a low tom, not a kick: this answers "which of MY four drums is this",
    // never "which drum is this close to" — the MIDI reader is the loose one.
    expect(drumForPitch(37)).toBeNull();
    expect(drumForPitch(60)).toBeNull();
    expect(drumPitch('kick')).toBe(DRUM_PITCHES.kick);
    expect(DRUM_BY_ID.hat.short).toBe('HAT');
    expect(drumLabel('wind')).toBe('WND');
  });

  it('sounds the percussion preset it is named after, and hands out a copy', () => {
    for (const drum of DRUM_IDS) expect(drumVoice(drum)).toEqual(voiceById(drum)!.params);
    // A copy rather than the table's own object: a caller may edit what it is
    // given, and the kit is the one thing that must sound the same in every song.
    const one = drumVoice('kick');
    one.bright = 3;
    expect(drumVoice('kick')).toEqual(voiceById('kick')!.params);
  });

  it('replaces only the VOICE in a patch, keeping the stack above it and the shape', () => {
    const track = createSong().tracks[0];
    track.shape = 'sharp';
    track.stack = [layerFromVoice(voiceById('strings')!.params)];
    const patch = patchForTrack(track);
    const swapped = drumPatch(patch, 'hat');
    // The channel keeps everything it had; the drum is a player swapping a snare
    // for a kick on one hit, not a channel being rebuilt.
    expect(swapped.layers).toHaveLength(2);
    expect(swapped.shape).toBe('sharp');
    expect(voiceOfPlainLayer(swapped.layers[0])).toEqual(drumVoice('hat'));
    expect(swapped.layers[1]).toEqual(patch.layers[1]);
  });
});

describe('a cell that is a drum hit', () => {
  it("is a hit and nothing else: it takes the chord off and wears the drum's pitch", () => {
    const cell = emptyCell();
    setCellNotes(cell, [60, 64, 67]);
    setCellDrum(cell, 'snare');
    expect(cell.drum).toBe('snare');
    expect(cell.extra).toEqual([]);
    // The pitch is the kit's, not whatever note was there: a drum is a HIT.
    expect(cell.note).toBe(drumPitch('snare'));
    expect(cellNotes(cell)).toEqual([38]);
  });

  it('comes off when a note is written over it, because writing a cell writes its whole self', () => {
    const cell = emptyCell();
    setCellDrum(cell, 'kick');
    setCellNotes(cell, [60]);
    expect(cell.drum).toBeNull();
    expect(cell.note).toBe(60);
    // ...and null puts the step back to an empty step.
    setCellDrum(cell, null);
    expect(cell.note).toBeNull();
    expect(cell.drum).toBeNull();
  });

  it('says its three characters in the grid, where nobody can hear a C-2', () => {
    const cell = emptyCell();
    expect(cellText(cell)).toBe('...');
    setCellDrum(cell, 'kick');
    expect(cellText(cell)).toBe('KCK');
    setCellDrum(cell, 'wind');
    expect(cellText(cell)).toBe('WND');
  });

  it('counts as one note, so the header and the summary stay honest', () => {
    const pattern = emptyPattern('P', 1, 1);
    setCellDrum(pattern.steps[0][0]!, 'hat');
    expect(countNotes(pattern)).toBe(1);
  });

  it("travels with the row, wearing its cell's force and gesture", () => {
    const pattern = emptyPattern('P', 1, 2);
    setCellDrum(pattern.steps[0][0]!, 'kick');
    pattern.steps[0][0]!.velocity = 70;
    pattern.steps[0][0]!.stutter = 3;
    setCellDrum(pattern.steps[0][1]!, 'snare');
    expect(rowNotes(pattern, 0)).toEqual([
      { track: 0, midi: 36, velocity: 70, articulation: { slide: false, stutter: 3, grace: 0, bend: 0 }, drum: 'kick' },
      { track: 1, midi: 38, velocity: 100, articulation: { slide: false, stutter: 1, grace: 0, bend: 0 }, drum: 'snare' },
    ]);
  });

  it('travels with the cell, so a copy is a copy and not a second reference', () => {
    const cell = emptyCell();
    setCellDrum(cell, 'hat');
    cell.velocity = 40;
    const copy = copyCell(cell);
    expect(copy).toEqual(cell);
    expect(copy).not.toBe(cell);
    // A whole pattern copies it too: a copied bar plays the beat it was copied from.
    const song = createSong();
    setCellDrum(song.patterns[0].steps[0][0]!, 'kick');
    copyPattern(song, 1, 2);
    expect(song.patterns[1].steps[0][0]!.drum).toBe('kick');
  });
});

describe('writing a drum, in the language', () => {
  it('writes a hit on any step of a channel, at any force or gesture', () => {
    const song = beat();
    expect(cellAt(song, 0).drum).toBe('kick');
    expect(cellAt(song, 2).drum).toBe('snare');
    expect(cellAt(song, 4).drum).toBe('hat');
    expect(cellAt(song, 1).note).toBeNull();
    // The tail is a note's tail exactly: a force, and how the hit is played.
    const soft = applied('tracks 1\ndrum 0 1 kick~70');
    expect(cellAt(soft, 0).velocity).toBe(70);
    // A gesture is its own value on a `drum` line, exactly as it is on a `note`
    // line: `drum 8 1 hat *3`, not `hat*3` — the attached spelling is the GRID's.
    const roll = applied('tracks 1\nsteps 16\ndrum 8 1 hat *3');
    expect(cellAt(roll, 8).stutter).toBe(3);
    const slide = applied('tracks 1\ndrum 4 1 snare >');
    expect(cellAt(slide, 4).slide).toBe(true);
    // The values after the drum go either way, the way a note's do.
    expect(cellAt(applied('tracks 1\ndrum 0 1 kick 40 >'), 0).velocity).toBe(40);
  });

  it('reads a grid word as a drum, so a beat can be written the way a drummer reads it', () => {
    const song = applied('tracks 4\nsteps 4\nkick . hat .');
    expect(cellAt(song, 0, 0).drum).toBe('kick');
    expect(cellAt(song, 0, 2).drum).toBe('hat');
    // With a force and a roll, exactly like a pitch cell.
    const dressed = applied('tracks 4\nsteps 4\nsnare~70 . hat*3 .');
    expect(cellAt(dressed, 0, 0).velocity).toBe(70);
    expect(cellAt(dressed, 0, 2).stutter).toBe(3);
  });

  it('refuses a word that is not a drum, and names the kit it does know', () => {
    const message = refused('tracks 1\ndrum 0 1 bongo');
    expect(message).toContain('"bongo" is not a drum');
    expect(message).toContain('kick, snare, hat, wind');
    expect(message).toContain('drum 0 1 kick');
    // The refusal leaves the song untouched: a beat with a hole in it is worse
    // than a beat that was not written.
    const song = applied('tracks 1\ndrum 0 1 kick');
    const result = applyScript(song, 'drum 1 1 cymbal');
    expect(result.ok).toBe(false);
    expect(song.patterns[0].steps[1][0]!.note).toBeNull();
  });

  it('repeats a beat whole, and an octave move leaves the kit alone', () => {
    // A repeat is a repeat: every field of the cell travels, so a beat is copied
    // whole.
    const tiled = applied('tracks 1\ndrum 0 1 snare\n.\nrows 0 to 0 repeat 2');
    expect(cellAt(tiled, 0).drum).toBe('snare');
    expect(cellAt(tiled, 1).drum).toBe('snare');
    // An OCTAVE move is the one thing that does not touch a drum: a hit has no
    // pitch to move, so a range that rises keeps its beat where it is — and the
    // plain note beside it still moves, so the range is doing its job.
    const mixed = applied('tracks 2\ndrum 0 1 kick\nnote 0 2 C-4\nrows 0 to 0 octave up');
    expect(cellAt(mixed, 0, 0).drum).toBe('kick');
    expect(cellAt(mixed, 0, 0).note).toBe(36);
    expect(cellAt(mixed, 0, 1).note).toBe(72);
  });
});

describe('the file, and the tool that writes one', () => {
  it('is a version of its own, because a cell holds a WORD where a note was', () => {
    // A plain song keeps writing the version it always wrote.
    const plain = createSong();
    plain.patterns[0].steps[0][0]!.note = 60;
    const plainFile = JSON.parse(songToJson(plain)) as Record<string, unknown>;
    expect(plainFile.version).toBe(SONG_FILE_VERSION);
    // A drum is newer than a chord, which is newer than the base format, and the
    // newest this build can read is the drum's.
    expect(DRUM_SONG_FILE_VERSION).toBeGreaterThan(CHORD_SONG_FILE_VERSION);
    expect(DRUM_SONG_FILE_VERSION).toBeGreaterThan(SONG_FILE_VERSION);
    // The newest version OPEN reads is at least the drum's; a later feature (the
    // kit) raises it further, which is why this is a floor and not an equality.
    expect(SONG_FILE_VERSION_MAX).toBeGreaterThanOrEqual(DRUM_SONG_FILE_VERSION);
    const drummed = JSON.parse(songToJson(beat())) as { version: number; patterns: { steps: unknown[][] }[] };
    expect(drummed.version).toBe(DRUM_SONG_FILE_VERSION);
    // The WORD is what is stored; the pitch is a fact about the kit, not the song.
    expect(drummed.patterns[0].steps[0][0]).toBe('kick');
    // A soft hit grows to `[word, velocity]`, and a gesture adds the third slot.
    const soft = JSON.parse(songToJson(applied('tracks 1\ndrum 0 1 kick~70'))) as { patterns: { steps: unknown[][] }[] };
    expect(soft.patterns[0].steps[0][0]).toEqual(['kick', 70]);
    const roll = JSON.parse(songToJson(applied('tracks 1\ndrum 0 1 hat *3'))) as { patterns: { steps: unknown[][] }[] };
    expect(roll.patterns[0].steps[0][0]).toEqual(['hat', 100, '*3']);
  });

  it('round-trips a kit through the JSON format', () => {
    const song = beat();
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error(back.errors.join(' / '));
    for (const row of [0, 2, 4]) expect(cellAt(back.song, row).drum).toBe(cellAt(song, row).drum);
    expect(cellAt(back.song, 0).note).toBe(36);
    // A soft hit keeps its force and its gesture too.
    const dressed = applied('tracks 1\ndrum 0 1 hat 70 *3');
    const dressedBack = songFromJson(songToJson(dressed));
    expect(dressedBack.ok).toBe(true);
    if (!dressedBack.ok) throw new Error(dressedBack.errors.join(' / '));
    expect(cellAt(dressedBack.song, 0).velocity).toBe(70);
    expect(cellAt(dressedBack.song, 0).stutter).toBe(3);
  });

  it('writes the drum word into a script and reads it back hit for hit', () => {
    const text = songToScript(beat());
    expect(text).toContain('kick');
    expect(text).toContain('snare');
    expect(text).toContain('hat');
    expect(applied(text).patterns[0].steps.map((row) => row[0]!.drum))
      .toEqual(beat().patterns[0].steps.map((row) => row[0]!.drum));
    // The pitches the drums happen to be are never spelled into the file.
    expect(text).not.toContain('C-2');
  });

  it('refuses a file that names a drum the kit does not have', () => {
    const file = JSON.parse(songToJson(beat())) as { patterns: { steps: unknown[][] }[] };
    file.patterns[0].steps[0][0] = 'cowbell';
    const read = songFromJson(JSON.stringify(file));
    expect(read.ok).toBe(false);
    if (read.ok) throw new Error('expected a refusal');
    expect(read.errors.join(' ')).toContain('"cowbell" is not a drum');
    expect(read.errors.join(' ')).toContain('kick, snare, hat, wind');
  });
});

describe('exporting a kit to MIDI', () => {
  it("writes every hit to the drum channel, at the drum's own pitch", () => {
    const exported = songToMidi(beat());
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.errors.join(' / '));
    expect(exported.summary.notes).toBe(3);
    const read = readMidi(exported.bytes);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error(read.errors.join(' / '));
    // A kit channel is percussion whether or not its VOICE is a drum, and MIDI
    // puts percussion on channel 9 at the General MIDI pitches.
    expect(new Set(read.midi.notes.map((note) => note.channel))).toEqual(new Set([DRUM_CHANNEL]));
    expect(read.midi.notes.map((note) => note.note).sort()).toEqual([36, 38, 42]);
  });

  it('comes back as drums, one part per drum, at the same pitches', () => {
    const exported = songToMidi(beat());
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.errors.join(' / '));
    const back = songFromMidi(exported.bytes);
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error(back.errors.join(' / '));
    expect(back.summary.notes).toBe(3);
    expect(back.song.tracks.map((track) => track.name)).toEqual(['KICK', 'SNARE', 'HAT']);
  });
});

describe('the language surface', () => {
  it('adds a WORD, because a drum hit is a sound the line names rather than a setting', () => {
    expect(SCRIPT_KEYWORDS).toContain('drum');
    // The kit did not add a cell SPELLING, so the separator and the ceiling are
    // untouched — a drum is one note in one cell, whatever it sounds like.
    expect(SCRIPT_COMMANDS.map((command) => command.word)).toEqual([...SCRIPT_KEYWORDS]);
    const row = SCRIPT_COMMANDS.find((command) => command.word === 'drum')!;
    expect(row.tier).toBe('core');
    expect(row.example).toContain('kick');
  });

  it('publishes the kit, so a tool writing a beat needs to know only what the manifest says', () => {
    const caps = scriptCapabilities();
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(14);
    expect(caps.versionNotes.find((entry) => entry.version === 14)?.note).toContain('DRUM');
    expect(caps.vocabulary.drums.map((drum) => drum.id)).toEqual([...DRUM_IDS]);
    expect(caps.vocabulary.drums.map((drum) => drum.pitch)).toEqual([36, 38, 42, 44]);
    // Every published word really parses, in both doors: the script and the file
    // reader are the same closed list, which is the promise the manifest makes.
    for (const drum of caps.vocabulary.drums) {
      expect(drumFromName(drum.id)).toBe(drum.id);
      const one = applied(`tracks 1\ndrum 0 1 ${drum.id}`);
      expect(cellAt(one, 0).drum).toBe(drum.id);
    }
  });

  it('keeps the kit one note per cell, exactly like a plain note', () => {
    // A drum never widens a cell, so it needs no `poly` and no separator: the
    // narrowest channel in the app plays a whole kit.
    const song = applied('tracks 1\ndrum 0 1 kick\ndrum 1 1 snare');
    expect(song.tracks[0].poly).toBe(1);
    expect(cellNotes(cellAt(song, 0))).toEqual([36]);
  });
});
