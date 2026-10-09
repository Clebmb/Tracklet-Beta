import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  applyScript,
  countNotes,
  createSong,
  MAX_ROWS,
  MAX_SONG_TITLE,
  DEFAULT_VOICE,
  nextWave,
  parseScript,
  type UserVoice,
  patternRows,
  SCRIPT_EXAMPLE,
  SCRIPT_KEYWORDS,
  SCRIPT_QUICK_REFERENCE,
  summarizeSong,
  VOICES,
  voiceById,
  voiceForTrack,
  voiceNameFor,
  waveFromName,
  type ScriptContext,
} from '../model';

const CONTEXT: ScriptContext = { trackCount: 4, rows: 16, rowsPerBeat: 4 };

function parse(source: string, context: ScriptContext = CONTEXT) {
  return parseScript(source, context);
}

/** Apply and narrow to the success branch, failing loudly otherwise. */
function applied(source: string, song = createSong()) {
  const result = applyScript(song, source);
  if (!result.ok) {
    throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  }
  return result;
}

/** Apply and expect the failure branch, so a refusal can be inspected. */
function refused(source: string, song = createSong()) {
  const result = applyScript(song, source);
  if (result.ok) throw new Error('expected the script to be refused, but it applied');
  return result;
}

describe('parsing a script', () => {
  it('reads a grid row as consecutive steps, one column per track', () => {
    const { commands, errors } = parse('C-4 D-4 E-4 F-4\nG-4 . . .');
    expect(errors).toEqual([]);
    expect(commands).toEqual([
      { kind: 'note', line: 1, pattern: 1, row: 0, track: 1, midi: 60 },
      { kind: 'note', line: 1, pattern: 1, row: 0, track: 2, midi: 62 },
      { kind: 'note', line: 1, pattern: 1, row: 0, track: 3, midi: 64 },
      { kind: 'note', line: 1, pattern: 1, row: 0, track: 4, midi: 65 },
      { kind: 'note', line: 2, pattern: 1, row: 1, track: 1, midi: 67 },
    ]);
  });

  it('lets an all-empty line hold its place as a rest', () => {
    const { commands } = parse('C-4 . . .\n. . . .\nC-4 . . .');
    // The middle line writes nothing but still consumes row 1.
    expect(commands.map((c) => (c.kind === 'note' ? c.row : -1))).toEqual([0, 2]);
  });

  it('takes a bare letter from the current octave, and an explicit one over it', () => {
    const { commands } = parse('octave 6\nC . \nC-3 . . .');
    const first = commands.find((c) => c.kind === 'note');
    expect(first).toMatchObject({ row: 0, track: 1, midi: 84 });
    const later = commands.filter((c) => c.kind === 'note')[1];
    expect(later).toMatchObject({ row: 1, track: 1, midi: 48 });
  });

  it('strips # and // comments but keeps a # inside quotes', () => {
    const { commands, errors } = parse('song "ROCK # ROLL" # a comment\nC-4 // trailing');
    expect(errors).toEqual([]);
    expect(commands[0]).toMatchObject({ kind: 'title', title: 'ROCK # ROLL' });
    expect(commands[1]).toMatchObject({ kind: 'note', row: 0, midi: 60 });
  });

  it('groups a quoted name into one argument', () => {
    const { commands } = parse('track 1 "MY LEAD"');
    expect(commands[0]).toMatchObject({ kind: 'track', index: 1, name: 'MY LEAD' });
  });

  it('resets the write cursor when the pattern changes', () => {
    const { commands } = parse('C-4 . . .\npattern 2\nC-4 . . .');
    const notes = commands.filter((c) => c.kind === 'note');
    expect(notes[0]).toMatchObject({ pattern: 1, row: 0 });
    expect(notes[1]).toMatchObject({ pattern: 2, row: 0 });
  });
});

describe('pitch spelling', () => {
  /** The single note a one-line script writes, or a loud failure. */
  function noteOf(source: string, context: ScriptContext = CONTEXT) {
    const { commands, errors } = parse(source, context);
    expect(errors).toEqual([]);
    return commands.filter((c) => c.kind === 'note')[0];
  }

  it('reads a flat as the note below its letter', () => {
    // The bug this pins: accidentals used to be looked up in a table of the
    // twelve SHARP spellings, so `Db` was absent, `indexOf` answered -1 and
    // every flat came out as one pitch -- a semitone under the octave's C.
    expect(noteOf('note 0 1 Db4')).toMatchObject({ midi: 61 });
    expect(noteOf('note 0 1 Eb4')).toMatchObject({ midi: 63 });
    expect(noteOf('note 0 1 Gb4')).toMatchObject({ midi: 66 });
    expect(noteOf('note 0 1 Ab4')).toMatchObject({ midi: 68 });
    expect(noteOf('note 0 1 Bb3')).toMatchObject({ midi: 58 });
  });

  it('gives a sharp and its flat spelling the same note', () => {
    for (const [sharp, flat] of [['C#4', 'Db4'], ['D#4', 'Eb4'], ['F#4', 'Gb4'], ['G#4', 'Ab4'], ['A#3', 'Bb3']] as const) {
      const spelled = noteOf(`note 0 1 ${sharp}`);
      expect(noteOf(`note 0 1 ${flat}`)).toMatchObject({ midi: (spelled as { midi: number }).midi });
    }
  });

  it('wraps at the octave edges, where an accidental changes the octave', () => {
    expect(noteOf('note 0 1 Cb4')).toMatchObject({ midi: 59 }); // the same key as B-3
    expect(noteOf('note 0 1 B#3')).toMatchObject({ midi: 60 }); // the same key as C-4
  });

  it('gives a bare flat letter the script default octave', () => {
    expect(noteOf('octave 3\nnote 0 1 Bb')).toMatchObject({ midi: 58 });
    expect(noteOf('octave 3\nnote 0 1 Cb')).toMatchObject({ midi: 47 });
  });

  it('does not mistake a sharp for the start of a comment', () => {
    // `#` begins a comment, but only at the start of a token -- otherwise the
    // sharp spellings (`C#4`, `G#5`) lose their accidental and become a bare
    // note an octave or so away, which still plays and still sounds wrong.
    const { commands, errors } = parse('# a real comment\nC#4 D#4 G#5 B#3\n.   .   .   C#5 # trailing');
    expect(errors).toEqual([]);
    const notes = commands.filter((c) => c.kind === 'note');
    expect(notes[0]).toMatchObject({ row: 0, midi: 61 });
    expect(notes[1]).toMatchObject({ row: 0, midi: 63 });
    expect(notes[2]).toMatchObject({ row: 0, midi: 80 });
    expect(notes[3]).toMatchObject({ row: 0, midi: 60 });
    expect(notes[4]).toMatchObject({ row: 1, track: 4, midi: 73 });
  });

  it('still reads a comment that follows a token with no space', () => {
    const { commands, errors } = parse('C-4// trailing');
    expect(errors).toEqual([]);
    expect(commands.filter((c) => c.kind === 'note')).toHaveLength(1);
  });

  it('accepts a flat in a grid row too', () => {
    const { commands, errors } = parse('Bb3 Db4 .   .');
    expect(errors).toEqual([]);
    expect(commands.filter((c) => c.kind === 'note')).toEqual([
      { kind: 'note', line: 1, pattern: 1, row: 0, track: 1, midi: 58 },
      { kind: 'note', line: 1, pattern: 1, row: 0, track: 2, midi: 61 },
    ]);
  });
});

describe('script diagnostics', () => {
  it('names the line and offers a fix for an unknown command', () => {
    const { errors } = parse('C-4 . . .\nachord Am\n');
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
    expect(errors[0].message).toContain('unknown command');
  });

  it('rejects a note out of range', () => {
    const { errors } = parse('H-9 . . .');
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(1);
  });

  it('rejects a grid row wider than the song', () => {
    const { errors } = parse('C-4 D-4 E-4 F-4 G-4', { trackCount: 4, rows: 16, rowsPerBeat: 4 });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('tracks 5');
  });

  it('rejects a row past the end of the pattern', () => {
    const rows = Array.from({ length: 16 }, () => 'C-4 . . .').join('\n');
    const { errors } = parse(`${rows}\nC-4 . . .`);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(17);
    expect(errors[0].message).toContain('no row 16');
  });

  it('rejects a tempo that is not a number or out of range', () => {
    expect(parse('tempo fast').errors[0].message).toContain('not a number');
    expect(parse('tempo 900').errors[0].message).toContain('outside 40..300');
  });

  it('rejects a waveform it does not know', () => {
    const { errors } = parse('track 1 wave sine-ish');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('wave must be');
  });

  it('rejects a channel name longer than the limit', () => {
    const long = 'X'.repeat(17);
    const { errors } = parse(`track 1 "${long}"`);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('at most 16 characters');
    expect(parse(`track 1 "${'X'.repeat(16)}"`).errors).toEqual([]);
  });

  it('reads a key in either spelling, and says which half is wrong', () => {
    expect(applied('key D minor').song.key).toEqual({ tonic: 2, scale: 'minor' });
    expect(applied('key Dm').song.key).toEqual({ tonic: 2, scale: 'minor' });
    expect(applied('key F# major').song.key).toEqual({ tonic: 6, scale: 'major' });
    expect(applied('key A harmonic minor').song.key).toEqual({ tonic: 9, scale: 'harmonic-minor' });
    // The summary reports it too, so the panel can say what it just did.
    expect(applied('key Eb dorian').summary.key).toBe('D# DORIAN');
    expect(applied('key D mixolydian').song.key).toEqual({ tonic: 2, scale: 'mixolydian' });
    expect(applied('key E phrygian').summary.key).toBe('E PHRYGIAN');
    expect(applied('key A blues').song.key).toEqual({ tonic: 9, scale: 'blues' });

    // A bad SCALE and a bad TONIC want different fixes, so they say different
    // things; a bare `key` has nothing to work with at all.
    expect(parse('key D lydian').errors[0].message).toContain('not a scale Tracklet knows');
    expect(parse('key up').errors[0].message).toContain('starts with a note letter');
    expect(parse('key').errors[0].message).toContain('needs a note and a scale');
  });

  it('rejects a song title longer than the header can show', () => {
    const long = 'X'.repeat(MAX_SONG_TITLE + 1);
    const { errors } = parse(`song "${long}"`);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(`at most ${MAX_SONG_TITLE} characters`);
    expect(errors[0].message).toContain(`${MAX_SONG_TITLE + 1}`);
    // Exactly at the limit is fine: the box and the script agree on the number.
    expect(parse(`song "${'X'.repeat(MAX_SONG_TITLE)}"`).errors).toEqual([]);
  });

  it('rejects a track number past the song and suggests growing it', () => {
    const { errors } = parse('track 6 "LEAD"');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('tracks N');
  });

  it('rejects note/erase with the wrong number of values', () => {
    expect(parse('note 0 1').errors[0].message).toContain('three to five values');
    expect(parse('erase 0 1 C-4').errors[0].message).toContain('two values');
    // A fifth value is read as an articulation, so the complaint is about the word
    // rather than the count; a sixth breaks the count again.
    expect(parse('note 0 1 C-4 80 extra').errors[0].message).toContain('is not something a note can do');
    expect(parse('note 0 1 C-4 80 > a sixth').errors[0].message).toContain('three to five values');
  });

  it('rejects a pattern length outside 1..512', () => {
    expect(parse('steps 0').errors[0].message).toContain('must be a whole number 1..512');
    expect(parse(`steps ${MAX_ROWS + 1}`).errors[0].message).toContain('1..512');
    expect(parse('steps many').errors[0].message).toContain('1..512');
  });

  it('rejects a beat that is not a whole number of steps', () => {
    expect(parse('beat 0').errors[0].message).toContain('1..16');
    expect(parse('beat 32').errors[0].message).toContain('1..16');
  });

  it('rejects a volume that is not a percentage', () => {
    expect(parse('volume -1').errors[0].message).toContain('0..100');
    expect(parse('volume 101').errors[0].message).toContain('0..100');
    expect(parse('volume loud').errors[0].message).toContain('0..100');
  });
});

describe('pattern length, resolution and level', () => {
  it('grows the grid, and lets notes reach the new last row', () => {
    const { song, summary } = applied('steps 512\nnote 511 1 C-4\nnote 0 2 G-2');
    expect(patternRows(song)).toBe(512);
    expect(summary.steps).toBe(512);
    expect(song.patterns[0].steps[511][0].note).toBe(60);
    expect(song.patterns[0].steps[0][1].note).toBe(43);
  });

  it('accepts a grid row only as far as the declared length', () => {
    // Row 20 does not exist in a 16-step pattern, but does once the grid is 32.
    const rows = Array.from({ length: 21 }, () => 'C-4 . . .').join('\n');
    // Five rows (17..21) fall off the end of the default sixteen-step grid.
    expect(parse(rows).errors).toHaveLength(5);
    expect(parse(rows).errors[0].line).toBe(17);
    expect(parse(`steps 32\n${rows}`).errors).toEqual([]);
  });

  it('resizes every pattern, not just the current one', () => {
    const { song } = applied('steps 32\npattern 1\nC-4 . . .\ncopy 1 2\nsteps 8');
    expect(song.patterns).toHaveLength(2);
    for (const pattern of song.patterns) expect(pattern.steps).toHaveLength(8);
    // The quarter of the song that survived is still there, and the rest is gone.
    expect(song.patterns[0].steps[0][0].note).toBe(60);
    expect(song.patterns[1].steps).toHaveLength(8);
  });

  it('sets how many steps make a beat', () => {
    const { song, summary } = applied('beat 8\nsteps 32');
    expect(song.rowsPerBeat).toBe(8);
    expect(summary.stepsPerBeat).toBe(8);
  });

  it('sets the master level from a percentage, and only when asked', () => {
    expect(applied('volume 70').settings.volume).toBeCloseTo(0.7, 6);
    expect(applied('volume 0').settings.volume).toBe(0);
    expect(applied('tempo 120').settings.volume).toBeNull();
  });

  it('reads the current shape from its context, not from a constant', () => {
    // A song already 32 steps long parses a 32-row grid without a `steps` line.
    const long = applied('steps 32').song;
    const again = applyScript(long, 'copy 1 2\npattern 2\nnote 31 1 C-4');
    expect(again.ok).toBe(true);
    if (again.ok) expect(patternRows(again.song)).toBe(32);
  });
});

describe('applying a script', () => {
  it('writes a whole song and leaves the input untouched', () => {
    const original = createSong();
    const { song, summary } = applied(`
      song "TEST TUNE"
      tempo 96
      tracks 2
      track 1 "LEAD" wave saw
      track 2 "BASS" wave sine
      C-4 .
      . .
    `);

    expect(original.bpm).toBe(120);
    expect(original.tracks).toHaveLength(4);
    expect(song.title).toBe('TEST TUNE');
    expect(song.bpm).toBe(96);
    expect(song.tracks).toHaveLength(2);
    expect(song.tracks[0]).toMatchObject({ name: 'LEAD', voice: expect.objectContaining({ wave: 'sawtooth' }) });
    expect(song.tracks[1]).toMatchObject({ name: 'BASS', voice: expect.objectContaining({ wave: 'sine' }) });
    expect(countNotes(song.patterns[0])).toBe(1);
    expect(summary.notes).toBe(1);
    expect(summary.tracks).toBe(2);
  });

  it('is atomic: one mistake means NOTHING changes', () => {
    const song = createSong();
    const result = applyScript(song, 'tempo 90\nC-4 . . .\nnot-a-command');
    expect(result.ok).toBe(false);
    expect(song.bpm).toBe(120);
    expect(countNotes(song.patterns[0])).toBe(0);
  });

  it('starts a blank song with new, whatever the song already held', () => {
    const song = createSong();
    song.title = 'OLD';
    song.bpm = 200;
    const { song: fresh } = applied('new\ntempo 100', song);
    expect(fresh.title).toBe('UNTITLED SONG');
    expect(fresh.bpm).toBe(100);
    expect(fresh.tracks).toHaveLength(4);
    expect(fresh.patterns).toHaveLength(1);
  });

  it('sets, erases and overwrites single cells', () => {
    const { song } = applied('note 3 2 C-5\nnote 3 2 D-5\nerase 3 2');
    expect(song.patterns[0].steps[3][1].note).toBeNull();
    const { song: kept } = applied('note 3 2 C-5');
    expect(kept.patterns[0].steps[3][1].note).toBe(72);
  });

  it('writes a chord across the channels after its root', () => {
    // Am at octave 4 is A C E, one note per channel from track 1.
    const { song } = applied('chord 0 1 Am');
    const row = song.patterns[0].steps[0];
    expect([row[0].note, row[1].note, row[2].note]).toEqual([69, 72, 76]);
    expect(row[3].note).toBeNull();
    expect(countNotes(song.patterns[0])).toBe(3);
  });

  it('takes a two-token name, because that is how a person writes one', () => {
    const { song } = applied('chord 0 1 C maj7');
    expect([song.patterns[0].steps[0][0].note, song.patterns[0].steps[0][1].note,
      song.patterns[0].steps[0][2].note, song.patterns[0].steps[0][3].note]).toEqual([60, 64, 67, 71]);
  });

  it('reads a degree against the key, so the chord fits the song', () => {
    const { song } = applied('key D minor\nchord 0 1 6');
    // The sixth chord of D minor is Bb major: Bb D F.
    expect(song.key).toEqual({ tonic: 2, scale: 'minor' });
    expect([song.patterns[0].steps[0][0].note, song.patterns[0].steps[0][1].note,
      song.patterns[0].steps[0][2].note]).toEqual([70, 74, 77]);
  });

  it('rejects a chord that does not fit the track count, and says what to change', () => {
    const { errors } = refused('tracks 2\nchord 0 1 Am');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/3 channels starting at track 1/);
  });

  it('refuses a chord it cannot be sure of', () => {
    const { errors } = refused('chord 0 1 Hm');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/not a chord/);
  });

  it('renames a channel, which is the same edit the rename box makes', () => {
    const { song } = applied('track 1 "BASS GUITAR" wave triangle');
    expect(song.tracks[0].name).toBe('BASS GUITAR');
    expect(song.tracks[0].voice.wave).toBe('triangle');
    // Case does not matter; the model stores the name the way the UI shows it.
    const { song: lower } = applied('track 2 bass');
    expect(lower.tracks[1].name).toBe('BASS');
  });

  it('mutes and unmutes a channel', () => {
    const { song } = applied('mute 2');
    expect(song.tracks[1].muted).toBe(true);
    const { song: back } = applied('mute 2\nunmute 2');
    expect(back.tracks[1].muted).toBe(false);
  });

  it('sets a channel\'s note length with hold, in either order', () => {
    expect(applied('track 2 "PAD" hold 8').song.tracks[1].hold).toBe(8);
    expect(applied('track 3 "PAD" hold 8 wave sine').song.tracks[2].hold).toBe(8);
    expect(applied('track 3 "PAD" wave sine hold 8').song.tracks[2].hold).toBe(8);
    // A channel without a hold is the default, so a plain `track` line stays two
    // words long and every older script keeps its meaning.
    expect(applied('track 1 "LEAD" wave square').song.tracks[0].hold).toBe(1);
  });

  it('refuses a hold it cannot read, and says how to name a channel HOLD', () => {
    expect(refused('track 1 "PAD" hold 0').errors[0].message).toMatch(/hold must be a whole number of steps 1\.\.16; got "0"/);
    expect(refused('track 1 "PAD" hold many').errors[0].message).toMatch(/got "many"/);
    expect(refused('track 1 HOLD wave sine').errors[0].message).toMatch(/hold needs a number of steps/);
  });

  it('sets the song\'s swing, and `new` forgets the one that was there', () => {
    expect(applied('swing 60').song.swing).toBe(60);
    expect(applied('swing 0').song.swing).toBe(0);
    expect(applied('swing 100').song.swing).toBe(100);
    // A script that starts a fresh song must not inherit the feel of whatever
    // was on screen — swing is song data, so `new` resets it like the tempo.
    const swinging = createSong();
    swinging.swing = 70;
    const fresh = applyScript(swinging, 'new\ntracks 2\nnote 0 1 C4');
    if (!fresh.ok) throw new Error(fresh.errors.map((e) => e.message).join(' / '));
    expect(fresh.song.swing).toBe(0);
  });

  it('refuses a swing it cannot read, and says what the two ends mean', () => {
    expect(refused('swing 140').errors[0].message).toMatch(/swing must be a percentage 0\.\.100; got "140"/);
    expect(refused('swing 140').errors[0].message).toContain('straight');
    expect(refused('swing -5').errors[0].message).toMatch(/got "-5"/);
    expect(refused('swing shuffle').errors[0].message).toMatch(/got "shuffle"/);
    expect(refused('swing').errors[0].message).toContain('swing needs one number 0..100');
  });

  it('solos channels, and unsolos everything with `solo off`', () => {
    expect(applied('tracks 4\nsolo 2').settings.solo).toEqual([2]);
    expect(applied('tracks 4\nsolo 1 3').settings.solo).toEqual([1, 3]);
    // Repeats are one instruction, not two.
    expect(applied('tracks 4\nsolo 2 2').settings.solo).toEqual([2]);
    // `off` is a REAL value — an empty list — which is how a script says "hear
    // everything again" and is different from saying nothing about solo at all.
    expect(applied('tracks 4\nsolo 2\nsolo off').settings.solo).toEqual([]);
    expect(applied('tracks 4\nnote 0 1 C4').settings.solo).toBeUndefined();
  });

  it('refuses a solo it cannot read, and says what the channel range is', () => {
    expect(refused('tracks 2\nsolo 3').errors[0].message).toMatch(/solo takes channel numbers 1\.\.2; got "3"/);
    expect(refused('solo 0').errors[0].message).toMatch(/solo takes channel numbers/);
    expect(refused('solo').errors[0].message).toMatch(/solo needs one or more channel numbers/);
    // Solo is listening state, so a script that mentions nothing about it leaves
    // the player's own soloing alone.
    expect(refused('solo two').errors[0].message).toMatch(/got "two"/);
  });

  it('sets what one key writes, as the CHORDS button cycles it', () => {
    expect(applied('chords off').settings.chordDegrees).toBe(0);
    expect(applied('chords triad').settings.chordDegrees).toBe(3);
    expect(applied('chords 7th').settings.chordDegrees).toBe(4);
    expect(applied('chords 3').settings.chordDegrees).toBe(3);
    expect(applied('new\ntracks 2\nnote 0 1 C4').settings.chordDegrees).toBeUndefined();
  });

  it('refuses a chord mode it does not know, and lists the three it does', () => {
    const { errors } = refused('chords quartal');
    expect(errors[0].message).toContain('is not a chord mode');
    expect(errors[0].message).toContain('chords off');
    expect(errors[0].message).toContain('chords triad');
    expect(errors[0].message).toContain('chords 7th');
    expect(refused('chords').errors[0].message).toContain('chords needs one word');
  });

  it('turns the audition toggle on and off, and tells silence apart from a no-op', () => {
    expect(applied('hear on').settings.hearNotes).toBe(true);
    expect(applied('hear off').settings.hearNotes).toBe(false);
    expect(applied('tempo 90').settings.hearNotes).toBeUndefined();
    expect(refused('hear maybe').errors[0].message).toContain('hear needs on or off');
    expect(refused('hear').errors[0].message).toContain('hear needs on or off');
  });

  it('moves the app\'s own octave, not just the one bare letters are written in', () => {
    expect(applied('octave 5').settings.octave).toBe(5);
    // The LAST one wins, so a script can walk the octave as it writes.
    expect(applied('octave 5\noctave 3').settings.octave).toBe(3);
    expect(applied('tempo 90').settings.octave).toBeUndefined();
  });

  it('sets a channel\'s level in the mix, in any order with the rest of the line', () => {
    expect(applied('track 2 "BASS" level 65').song.tracks[1].level).toBe(65);
    expect(applied('track 2 "BASS" voice bass level 65 hold 8').song.tracks[1])
      .toMatchObject({ level: 65, hold: 8 });
    expect(applied('track 2 "BASS" level 65 voice bass').song.tracks[1].level).toBe(65);
    expect(applied('track 2 "BASS" level 0').song.tracks[1].level).toBe(0);
    // Silence is NOT a mute: the flag is untouched, so the mix menu can go on
    // saying which of the two a quiet channel is, and a script can raise it.
    expect(applied('track 2 "BASS" level 0').song.tracks[1].muted).toBe(false);
    // A channel nobody sets is at full volume, so older scripts are unchanged.
    expect(applied('track 1 "LEAD" wave square').song.tracks[0].level).toBe(100);
  });

  it('refuses a level outside 0..100, and says how to name a channel LEVEL', () => {
    expect(refused('track 1 "PAD" level 140').errors[0].message).toMatch(/level is a percentage 0\.\.100; got "140"/);
    expect(refused('track 1 "PAD" level -5').errors[0].message).toMatch(/got "-5"/);
    expect(refused('track 1 "PAD" level loud').errors[0].message).toMatch(/got "loud"/);
    expect(parse('track 1 LEVEL wave sine').errors[0].message).toMatch(/level needs a percentage/);
    expect(parse('track 1 LEVEL wave sine').errors[0].message).toContain('quote it');
  });

  it('places a channel in the stereo field, taking a sign, a letter or the word centre', () => {
    expect(applied('track 2 "BASS" pan -40').song.tracks[1].pan).toBe(-40);
    expect(applied('track 2 "BASS" pan 40').song.tracks[1].pan).toBe(40);
    expect(applied('track 2 "BASS" pan L40').song.tracks[1].pan).toBe(-40);
    expect(applied('track 2 "BASS" pan R40').song.tracks[1].pan).toBe(40);
    expect(applied('track 2 "BASS" pan C').song.tracks[1].pan).toBe(0);
    expect(applied('track 2 "BASS" pan center').song.tracks[1].pan).toBe(0);
    // A centred channel is what a song is made of, so older scripts are unchanged.
    expect(applied('track 1 "LEAD" wave square').song.tracks[0].pan).toBe(0);
    // Any order with the rest of the line.
    expect(applied('track 2 "BASS" pan L40 level 60 voice bass').song.tracks[1])
      .toMatchObject({ pan: -40, level: 60 });
  });

  it('refuses a pan past the edge, and says how to name a channel PAN', () => {
    expect(refused('track 1 "PAD" pan -140').errors[0].message).toMatch(/pan must be a place between the speakers -100\.\.100/);
    expect(refused('track 1 "PAD" pan 140').errors[0].message).toMatch(/[Gg]ot "140"/);
    expect(refused('track 1 "PAD" pan sideways').errors[0].message).toMatch(/[Gg]ot "sideways"/);
    expect(parse('track 1 PAN wave sine').errors[0].message).toMatch(/pan needs a place/);
    expect(parse('track 1 PAN wave sine').errors[0].message).toContain('quote it');
  });

  it('sends a channel into the room, or keeps it out of it', () => {
    // The bare statements set how big the room is...
    const room = applied('reverb 40\necho 20').song;
    expect(room.reverb).toBe(40);
    expect(room.echo).toBe(20);
    // ...and the same words on a track line set how much of THIS channel is in
    // it. Two different numbers, one word each, decided by where it is written.
    const dry = applied('reverb 40\ntrack 2 "BASS" verb 0 echo 0').song;
    expect(dry.tracks[1]).toMatchObject({ verb: 0, echo: 0 });
    expect(dry.tracks[0]).toMatchObject({ verb: 100, echo: 100 });
    // Any order with the rest of the line, like every other setting.
    expect(applied('track 3 "PAD" verb 30 level 60 voice pad echo 70').song.tracks[2])
      .toMatchObject({ verb: 30, echo: 70, level: 60 });
  });

  it('refuses a send outside the range, and says how to name a channel VERB', () => {
    expect(refused('track 1 "PAD" verb 140').errors[0].message)
      .toMatch(/verb on a track line is a send, a percentage 0\.\.100/);
    expect(refused('track 1 "PAD" echo -10').errors[0].message).toMatch(/[Gg]ot "-10"/);
    // A send is not a room: `verb 100` is meaningful here, which is why the
    // sentence has to explain what the number means rather than just its range.
    expect(refused('track 1 "PAD" verb 140').errors[0].message).toContain('keeps it dry');
    expect(parse('track 1 VERB wave sine').errors[0].message).toMatch(/verb on a track line is a SEND/);
    expect(parse('track 1 VERB wave sine').errors[0].message).toContain('quote it');
  });

  it('hits a note as hard as it says, in a grid row or in a note line', () => {
    // The grid spelling: the note, a `~`, and how hard it is hit.
    // A plain note is a plain note: no slide, one hit, which is what every cell
    // in every song this app has ever played is.
    const plain = { extra: [], drum: null, slide: false, stutter: 1, grace: 0, bend: 0 };
    expect(applied('tracks 2\nC-4~40 .').song.patterns[0].steps[0][0]).toEqual({ note: 60, velocity: 40, ...plain });
    // The command spelling, with the velocity as a fourth value...
    expect(applied('tracks 2\nnote 0 1 C-4 40').song.patterns[0].steps[0][0]).toEqual({ note: 60, velocity: 40, ...plain });
    // ...or on the note, exactly as the grid writes it.
    expect(applied('tracks 2\nnote 0 1 C-4~40').song.patterns[0].steps[0][0]).toEqual({ note: 60, velocity: 40, ...plain });
    // A note nobody accents is at full force, so every older script is unchanged.
    expect(applied('tracks 2\nC-4 .').song.patterns[0].steps[0][0]).toEqual({ note: 60, velocity: 100, ...plain });
    expect(applied('tracks 2\nnote 0 1 C-4').song.patterns[0].steps[0][0].velocity).toBe(100);
  });

  it('refuses a velocity outside 0..100, and one written twice', () => {
    expect(parse('tracks 2\nC-4~500 .').errors[0].message).toMatch(/velocity outside 0\.\.100/);
    // A number where a fourth value belongs is a velocity whatever its size, so a
    // wild one is a range complaint rather than a complaint about the alphabet.
    expect(parse('tracks 2\nnote 0 1 C-4 200').errors[0].message).toMatch(/velocity must be a percentage 0\.\.100/);
    expect(parse('tracks 2\nC-4~loud .').errors[0].message).toMatch(/velocity outside 0\.\.100/);
    expect(parse('tracks 2\nnote 0 1 C-4 200').errors[0].message).toMatch(/velocity must be a percentage 0\.\.100/);
    expect(parse('tracks 2\nnote 0 1 C-4~40 60').errors[0].message).toMatch(/give the velocity once/);
  });

  it('slides and wobbles a channel, in any order with the rest of the line', () => {
    expect(applied('track 2 "LEAD" glide 40').song.tracks[1].glide).toBe(40);
    expect(applied('track 2 "PAD" vibrato 30').song.tracks[1].vibrato).toBe(30);
    expect(applied('track 2 "LEAD" glide 40 vibrato 25 voice lead').song.tracks[1])
      .toMatchObject({ glide: 40, vibrato: 25 });
    // A channel nobody sets is steady and does not slide, so older scripts are
    // unchanged and every song plays the way it always did.
    expect(applied('track 1 "LEAD" wave square').song.tracks[0]).toMatchObject({ glide: 0, vibrato: 0 });
  });

  it('refuses a glide or vibrato outside 0..100, and says how to name the channel after one', () => {
    expect(refused('track 1 "A" glide 140').errors[0].message).toMatch(/glide is a percentage 0\.\.100; got "140"/);
    expect(refused('track 1 "A" vibrato -5').errors[0].message).toMatch(/vibrato is a percentage 0\.\.100/);
    expect(refused('track 1 "A" glide lots').errors[0].message).toMatch(/got "lots"/);
    expect(parse('track 1 GLIDE wave sine').errors[0].message).toMatch(/glide needs a percentage/);
    expect(parse('track 1 GLIDE wave sine').errors[0].message).toContain('quote it');
    expect(parse('track 1 VIBRATO wave sine').errors[0].message).toMatch(/vibrato needs a percentage/);
  });

  it('sets the room amounts for the whole song, and dries them again with new', () => {
    expect(applied('reverb 40').song.reverb).toBe(40);
    expect(applied('echo 25').song.echo).toBe(25);
    // Off is a value, not a no-op.
    expect(applied('reverb 0').song.reverb).toBe(0);
    expect(applied('reverb 40\necho 25').song).toMatchObject({ reverb: 40, echo: 25 });
    // `new` starts a dry song, so a previous song's room never lingers.
    expect(applied('reverb 40\nnew').song.reverb).toBe(0);
    expect(applied('echo 40\nnew').song.echo).toBe(0);
  });

  it('refuses a room amount outside 0..100, and says what it would have done', () => {
    expect(refused('reverb 140').errors[0].message).toMatch(/reverb must be a percentage 0\.\.100; got "140"/);
    expect(refused('echo -5').errors[0].message).toMatch(/echo must be a percentage 0\.\.100/);
    expect(refused('reverb loud').errors[0].message).toMatch(/got "loud"/);
    expect(parse('reverb').errors[0].message).toMatch(/reverb needs one number 0\.\.100/);
    expect(parse('echo').errors[0].message).toMatch(/echo needs one number 0\.\.100/);
  });

  it('reads a quoted name as a name and a bare one as a setting', () => {
    // `off` is a mute flag, and also a perfectly good channel name. The quotes
    // are how the author says which one is meant, which is what lets a song be
    // written out and read back with its channel names intact.
    expect(applied('track 1 off').song.tracks[0].muted).toBe(true);
    expect(applied('track 1 "OFF"').song.tracks[0]).toMatchObject({ name: 'OFF', muted: false });
    expect(applied('track 1 wave sine').song.tracks[0].voice.wave).toBe('sine');
    expect(applied('track 1 "WAVE" wave sine').song.tracks[0])
      .toMatchObject({ name: 'WAVE', voice: expect.objectContaining({ wave: 'sine' }) });
    // A name, then its waveform, then the mute flag: a sentence, in that order.
    expect(applied('track 2 BASS wave saw off').song.tracks[1])
      .toMatchObject({ name: 'BASS', voice: expect.objectContaining({ wave: 'sawtooth' }), muted: true });
  });

  it('refuses a bare setting word where a name should be, and says the fix', () => {
    expect(parse('track 1 wave').errors[0].message).toContain('needs a shape');
    expect(parse('track 1 "LEAD" wave').errors[0].message).toContain('needs a shape');
    expect(parse('track 1 off BASS').errors[0].message).toContain('mute flag');
    // Quoting is the fix in every one of those cases.
    expect(applied('track 1 "off BASS"').song.tracks[0].name).toBe('OFF BASS');
  });

  it('arranges the song with order, and makes the bars it asks for', () => {
    const { song } = applied('order 1 2 1 2 1');
    expect(song.order).toEqual([1, 2, 1, 2, 1]);
    // `order 1 2` on a fresh song is a working two-bar song, not an error about
    // a pattern that does not exist yet: the slot creates it, like `pattern 2`.
    expect(song.patterns).toHaveLength(2);
  });

  it('counts the bars in the summary, and resets them with new', () => {
    const { summary } = applied('order 1 2 3');
    expect(summary.slots).toBe(3);
    // `new` starts a blank song, and a blank song is one bar.
    const { song } = applied('order 1 2\nnew');
    expect(song.order).toEqual([1]);
  });

  it('refuses an order it cannot read, and says which value was wrong', () => {
    expect(refused('order 0').errors[0].message).toMatch(/pattern numbers 1\.\.64; got "0"/);
    expect(refused('order 1 foo').errors[0].message).toMatch(/got "foo"/);
    expect(refused('order').errors[0].message).toMatch(/at least one pattern number/);
  });

  it('copies a pattern into place and then edits them independently', () => {
    const { song } = applied(`
      C-4 . . .
      D-4 . . .
      copy 1 2
      pattern 2 "LIFT"
      note 0 1 E-5
    `);
    expect(song.patterns).toHaveLength(2);
    expect(song.patterns[1].name).toBe('LIFT');
    expect(song.patterns[0].steps[0][0].note).toBe(60);
    expect(song.patterns[1].steps[0][0].note).toBe(76);
    expect(song.patterns[0].steps[1][0].note).toBe(62);
  });

  it('creates patterns on demand and clears them', () => {
    const { song } = applied('pattern 3 "THIRD"\nC-4 . . .\nclear 1');
    expect(song.patterns).toHaveLength(3);
    expect(countNotes(song.patterns[0])).toBe(0);
    expect(countNotes(song.patterns[2])).toBe(1);
  });

  it('clamps a channel count into the range the model allows', () => {
    // `tracks 1` is legal; the model keeps at least one.
    const { song } = applied('tracks 1');
    expect(song.tracks).toHaveLength(1);
  });
});

describe('the summary', () => {
  it('describes the song and warns about unused channels and empty patterns', () => {
    const { song, summary } = applied('tracks 3\npattern 2\nC-4 . .');
    expect(summary.patterns).toBe(2);
    expect(summary.tracks).toBe(3);
    expect(summary.notes).toBe(1);
    expect(summary.advisories.some((a) => a.includes('pattern 1 is empty'))).toBe(true);
    expect(summary.advisories.some((a) => a.includes('no notes'))).toBe(true);
    expect(summarizeSong(song).notes).toBe(1);
  });

  it('says so when there is no music at all', () => {
    const summary = summarizeSong(createSong());
    expect(summary.advisories).toEqual(['the song has no notes yet.']);
  });
});

describe('the shipped example', () => {
  it('parses and applies cleanly, and is a real little tune', () => {
    const { song, summary } = applied(SCRIPT_EXAMPLE);
    expect(song.title).toBe('FIRST SCRIPT');
    expect(song.bpm).toBe(128);
    expect(song.tracks).toHaveLength(4);
    expect(song.patterns).toHaveLength(1);
    expect(patternRows(song)).toBe(16);
    expect(summary.notes).toBe(32);
    expect(summary.advisories).toEqual([]);
    // Every channel is used, and each one sounds like the instrument the example
    // asks for — the example teaches voices, so it is checked as voices.
    expect(countNotes(song.patterns[0])).toBe(32);
    expect(song.tracks.map((t) => voiceNameFor(t.voice))).toEqual(['lead', 'bass', 'pad', 'hat']);
    expect(song.tracks[2].hold).toBe(4);
    // It names its key, because the example is also the first lesson: the piano
    // lights up seven keys before the reader has heard of a scale.
    expect(song.key).toEqual({ tonic: 9, scale: 'minor' });
  });

  it('is the same text the docs show, so neither can rot alone', () => {
    // The docs ship in this package's own `doc/`, but a workspace that keeps
    // every widget's docs one level up must be able to run this too — which is
    // why the folder is RESOLVED rather than assumed. A hard-coded path that does
    // not exist turns this into a test that always fails, and a test that always
    // fails is a test nobody reads.
    const here = dirname(fileURLToPath(import.meta.url));
    const dir = [join(here, '../../../doc'), join(here, '../../doc')].find((candidate) => existsSync(candidate));
    if (!dir) throw new Error('the doc folder was not found beside this package or one level above it.');
    const doc = readFileSync(join(dir, '06-examples.md'), 'utf8');
    expect(doc.replace(/\r\n/g, '\n')).toContain(SCRIPT_EXAMPLE.trim());
  });
});

describe('the quick reference beside the paste box', () => {
  it('names every word the language knows, so a new one cannot hide', () => {
    const shown = SCRIPT_QUICK_REFERENCE.join('\n').toLowerCase();
    const missing = SCRIPT_KEYWORDS.filter((word) => !new RegExp(`\\b${word}\\b`).test(shown));
    expect(missing).toEqual([]);
  });

  it('stays short enough to read without scrolling', () => {
    // Twenty lines is what the panel's left column holds with its "REMEMBER"
    // block still fitting under it: the card starts at y=46 and steps 11px, so
    // line 20 ends at 266 and the footer's last label sits at 360 with the modal
    // ending at 391. The bound is here to make growth a decision rather than an
    // accident, which is why raising it is a deliberate edit — the `level` line
    // and the `solo`/`chords`/`hear` line each earned their place, `layer` paid
    // for its line by folding two together, `automate` raised the ceiling by one
    // after the fold was tried and did not fit, and the form (`section VERSE 1 2
    // arrange VERSE`, one line for two words) took it to twenty. The words a
    // keyword test requires would not pack into nineteen lines with an example a
    // person could read, and the panel has the room: the next command should fold
    // again, or the panel should grow on purpose. `grid`/`meter` did exactly that
    // — one line for two words — and paid for it by folding the fifth `track`
    // line into the fourth, so the block is still twenty. `bus` (a group fader,
    // and the `bus` setting that joins a channel to it) then took it to
    // twenty-one, which is where the room runs out: at 11px a line the block now
    // ends at 277 and the last doc label at 371, with the modal ending at 391. The
    // next command should fold two words onto one line, or the panel should grow
    // on purpose rather than by a line at a time.
    expect(SCRIPT_QUICK_REFERENCE.length).toBeLessThanOrEqual(21);
  });

  it('fits every line inside the panel column, so none is hidden by the paste box', () => {
    // The column is 172 canvas pixels wide and the panel's paste box starts at
    // its right edge, so a line longer than this does not wrap — it disappears
    // BEHIND the box, which is the worst kind of cheat sheet. Measured in the
    // running app at 8px: 33 characters is 171 pixels, 36 is 186 and clips.
    // The bound is in characters because that is what an author edits.
    const tooLong = SCRIPT_QUICK_REFERENCE.filter((line) => line.length > 32);
    expect(tooLong).toEqual([]);
  });
});

describe('the wave vocabulary', () => {
  it('accepts the short spellings a person actually writes', () => {
    expect(waveFromName('saw')).toBe('sawtooth');
    expect(waveFromName('SQR')).toBe('square');
    expect(waveFromName('pulse')).toBe('square');
    expect(waveFromName('sin')).toBe('sine');
    expect(waveFromName('noise')).toBe('noise');
    expect(waveFromName('wobble')).toBeNull();
  });

  it('cycles through the shapes', () => {
    expect(nextWave('square')).toBe('triangle');
    expect(nextWave('sine')).toBe('noise');
    expect(nextWave('noise')).toBe('table');
    expect(nextWave('table')).toBe('sample');
    expect(nextWave('sample')).toBe('fm');
    expect(nextWave('fm')).toBe('string');
    expect(nextWave('string')).toBe('formant');
    expect(nextWave('formant')).toBe('organ');
    expect(nextWave('organ')).toBe('granular');
    expect(nextWave('granular')).toBe('font');
    expect(nextWave('font')).toBe('reed');
    expect(nextWave('reed')).toBe('brass');
    expect(nextWave('brass')).toBe('bow');
    expect(nextWave('bow')).toBe('mallet');
    expect(nextWave('mallet')).toBe('membrane');
    expect(nextWave('membrane')).toBe('plate');
    expect(nextWave('plate')).toBe('square');
  });
});

describe('the voice vocabulary in a track line', () => {
  it('applies a named voice to a channel', () => {
    const { song } = applied('track 2 "PAD" voice pad');
    expect(song.tracks[1].voice).toEqual(voiceById('pad')!.params);
    // The name is the row's, not the sound's: a named channel keeps its name.
    expect(song.tracks[1].name).toBe('PAD');
  });

  it('lets an explicit knob win over the named voice, in either order on the line', () => {
    const pad = voiceById('pad')!.params;
    const named = applied('track 1 voice pad bright 90').song.tracks[0].voice;
    const after = applied('track 1 bright 90 voice pad').song.tracks[0].voice;
    expect(named).toEqual({ ...pad, bright: 90 });
    expect(after).toEqual({ ...pad, bright: 90 });
  });

  it('sets knobs with no voice named, leaving the rest at the neutral default', () => {
    const voice = applied('track 3 noise 40 ring 10').song.tracks[2].voice;
    expect(voice.noise).toBe(40);
    expect(voice.ring).toBe(10);
    expect(voice.wave).toBe(voiceForTrack(2).wave);
    expect(voice.bright).toBe(DEFAULT_VOICE.bright);
    expect(voice.thick).toBe(DEFAULT_VOICE.thick);
  });

  it('accepts the alias spellings of a knob', () => {
    expect(applied('track 1 tone 80').song.tracks[0].voice.bright).toBe(80);
    expect(applied('track 1 width 30').song.tracks[0].voice.thick).toBe(30);
    expect(applied('track 1 hiss 25').song.tracks[0].voice.noise).toBe(25);
  });

  it('refuses a voice it does not know, and lists every one it does', () => {
    const { errors } = refused('track 1 voice pads');
    expect(errors[0].message).toContain('is not a voice');
    for (const voice of VOICES) expect(errors[0].message).toContain(voice.label);
  });

  it('refuses an out-of-range knob and names the two ends of its range', () => {
    const { errors } = refused('track 1 bright 140');
    expect(errors[0].message).toMatch(/bright is a percentage 0\.\.100/);
    expect(errors[0].message).toContain('dark');
    expect(errors[0].message).toContain('bright');
  });

  it('refuses a bare voice or knob word, and says how to name a channel after it', () => {
    expect(parse('track 1 voice').errors[0].message).toContain('needs a voice name');
    expect(parse('track 1 bright').errors[0].message).toContain('needs a percentage');
    expect(parse('track 1 BRIGHT wave sine').errors[0].message).toContain('quote it');
  });

  it('quotes a channel genuinely named after a knob', () => {
    const { song } = applied('track 1 "BRIGHT" wave sine');
    expect(song.tracks[0].name).toBe('BRIGHT');
    expect(song.tracks[0].voice.wave).toBe('sine');
  });
});

describe('the sounds the user saved', () => {
  const MYPAD: UserVoice = {
    name: 'MYPAD',
    params: { ...DEFAULT_VOICE, wave: 'sawtooth', bright: 40, noise: 5, attack: 10, ring: 90, thick: 55 },
    stack: [],
  };
  const library = [MYPAD];

  /** Apply with a saved-sounds library in scope. */
  function withLibrary(source: string) {
    const result = applyScript(createSong(), source, library);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' / '));
    return result;
  }

  it('addresses a saved sound exactly like a built-in one', () => {
    expect(withLibrary('track 2 "PAD" voice mypad').song.tracks[1].voice).toEqual(MYPAD.params);
    expect(withLibrary('track 2 voice MYPAD').song.tracks[1].voice).toEqual(MYPAD.params);
  });

  it('lets an explicit knob win over the saved sound, in either order', () => {
    expect(withLibrary('track 1 voice mypad bright 99').song.tracks[0].voice.bright).toBe(99);
    expect(withLibrary('track 1 bright 99 voice mypad').song.tracks[0].voice.bright).toBe(99);
  });

  it('keeps the built-in voices meaning what they always meant', () => {
    // A saved sound cannot shadow `pad`, but even if one did, the preset is
    // resolved first — the language's own words are never up for grabs.
    expect(withLibrary('track 1 voice pad').song.tracks[0].voice).toEqual(voiceById('pad')!.params);
  });

  it('refuses a name it does not know, and lists the saved ones too', () => {
    const { errors } = refused('track 1 voice mypad');
    expect(errors[0].message).toContain('is not a voice');
    // With no library in scope, a saved sound is simply not a voice here — the
    // honest reading of a script parsed where nothing was saved.
    expect(errors[0].message).toContain('wind');
    expect(errors[0].message).not.toContain('MYPAD');

    const withNames = applyScript(createSong(), 'track 1 voice nope', library);
    expect(withNames.ok).toBe(false);
    if (!withNames.ok) {
      expect(withNames.errors[0].message).toContain('MYPAD');
      expect(withNames.errors[0].message).toContain('pad');
    }
  });

  it('names the saved sounds when a bare `voice` needs one', () => {
    const result = applyScript(createSong(), 'track 1 voice', library);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain('MYPAD');
  });
});

describe('the parser is a pure function', () => {
  it('produces the same commands for the same input', () => {
    const a = parse('tempo 120\nC-4 . . .');
    const b = parse('tempo 120\nC-4 . . .');
    expect(a).toEqual(b);
  });

  it('does not read or write a song at all', () => {
    const song = createSong();
    const before = JSON.stringify(song);
    parse('tempo 90\nC-4 . . .\nclear 1\ncopy 1 2\ntrack 1 "X" wave saw');
    expect(JSON.stringify(song)).toBe(before);
  });
});
