import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  DEFAULT_GROOVE,
  DEFAULT_VOICE,
  parseSongFile,
  patternRows,
  songFileStem,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_FORMAT,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  STACK_SONG_FILE_VERSION,
  voiceById,
  DEFAULT_KEY,
  MAX_SONG_TITLE,
  type Song,
} from '../model';

/**
 * The file formats, tested as inverses.
 *
 * The promise the F2 menu makes is "your song can leave and come back", and the
 * only way to believe that promise is to take it literally: build a song with
 * every awkward corner in it — several patterns, a shifted grid, a mute, four
 * different waveforms, a channel named after a setting word — write it out, read
 * it back, and compare the WHOLE song. Anything the writer forgets to say, or
 * the reader forgets to hear, shows up here as a difference.
 */

/** A song with the corners a round trip is likely to cut. */
function richSong(): Song {
  const result = applyScript(createSong(), [
    'new',
    'song "ROUND TRIP"',
    'tempo 143',
    'beat 8',
    'steps 24',
    // A LILT, so the feel has to survive both formats. The songs in `scripts/`
    // are all straight, which is why the round trip needs one that is not.
    'swing 55',
    // A room with both wet effects turned up, so neither one can be dropped by a
    // writer that only remembers the first.
    'reverb 40',
    'echo 25',
    // An arrangement with a repeat, so the order has to survive the round trip
    // and not just the patterns it names.
    'order 1 2 1 2 1',
    'tracks 4',
    'track 1 "LEAD" wave square',
    'track 2 "DEEP WAVE" wave triangle level 45',
    // A channel pushed off-centre AND made to slide and wobble, so the round
    // trip has to carry the whole of a channel's expression, not just re-centre
    // everything and leave it steady.
    'track 3 "OFF" wave saw pan L40 glide 35 vibrato 25 verb 0 echo 60',
    // A channel that HOLDS its notes, so the note length has to survive both
    // formats; the others stay on the default and must not grow a `hold` line.
    'track 4 "HAT" wave sine hold 8',
    'mute 3',
    'pattern 1 "VERSE"',
    'C-4 D#4 .   C-6',
    '... A-2 ... ...',
    'copy 1 2',
    'pattern 2 "CHORUS"',
    // One accented note, so the round trip has to carry a velocity through both
    // formats and not just the default the rest of the song sits at.
    'note 3 1 E-5 40',
    'note 23 4 B-5',
  ].join('\n'));
  if (!result.ok) {
    throw new Error(`the fixture script should be clean: ${result.errors.map((e) => e.message).join(' / ')}`);
  }
  return result.song;
}

describe('writing a song as a script', () => {
  it('reads back as exactly the same song', () => {
    const song = richSong();
    const result = applyScript(createSong(), songToScript(song));
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' / '));
    expect(result.song).toEqual(song);
  });

  it('starts with a blank song, so opening a file can never merge into one', () => {
    const written = songToScript(richSong());
    const commands = written
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
    expect(commands[0]).toBe('new');
  });

  it('writes the note length only for a channel that holds', () => {
    const song = richSong();
    const text = songToScript(song);
    expect(text).toContain('track 4 "HAT" wave sine hold 8\n');
    expect(text).toContain('track 1 "LEAD" wave square\n');
    expect(text).not.toContain('track 1 "LEAD" wave square hold');
  });

  it('writes the level only for a channel that was turned down', () => {
    const text = songToScript(richSong());
    expect(text).toContain('track 2 "DEEP WAVE" wave triangle level 45\n');
    // A channel at full volume is what a song is made of, so it says nothing —
    // an untouched song must not grow four `level 100` clauses.
    expect(text).not.toContain('level 100');
    expect(text).not.toContain('track 1 "LEAD" wave square level');
  });

  it('refuses a level past its range in a SCRIPT, and names the range and the fix', () => {
    // A script is written by a person or a model and read back immediately, so an
    // impossible number is a mistake worth reporting. A FILE is clamped instead
    // (see the JSON tests) because its author has already gone home.
    const result = applyScript(createSong(), 'new\ntracks 2\ntrack 1 "A" level 140\nnote 0 1 C4');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.errors[0].message).toContain('level is a percentage 0..100');
    expect(result.ok ? '' : result.errors[0].message).toContain('got "140"');
  });

  it('writes a named voice as its name, and reads it back as the same instrument', () => {
    const song = createSong();
    song.tracks[0].voice = { ...voiceById('pad')!.params };
    const text = songToScript(song);
    expect(text).toContain('track 1 "TRACK 1" voice pad');
    const back = applyScript(createSong(), text);
    if (!back.ok) throw new Error(back.errors.map((e) => e.message).join(' / '));
    expect(back.song.tracks[0].voice).toEqual(song.tracks[0].voice);
  });

  it('writes a hand-tweaked sound as a waveform plus only the knobs that moved', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'sawtooth', bright: 90, noise: 30 };
    const text = songToScript(song);
    // The untouched knobs are left out, so a tweaked channel is still one
    // readable, hand-editable line rather than six numbers.
    expect(text).toContain('track 1 "TRACK 1" wave sawtooth bright 90 noise 30\n');
    const back = applyScript(createSong(), text);
    if (!back.ok) throw new Error(back.errors.map((e) => e.message).join(' / '));
    expect(back.song.tracks[0].voice).toEqual(song.tracks[0].voice);
  });

  it('keeps a channel named after a setting word apart from the setting', () => {
    const song = richSong();
    expect(song.tracks[2].name).toBe('OFF');
    expect(song.tracks[2].muted).toBe(true);
    expect(song.tracks[1].name).toBe('DEEP WAVE');
    const text = songToScript(song);
    expect(text).toContain('track 3 "OFF" wave sawtooth');
    expect(text).toContain('mute 3');
  });

  it('writes the room only when the song is in one, and leaves a dry song silent', () => {
    const text = songToScript(richSong());
    expect(text).toContain('reverb 40\n');
    expect(text).toContain('echo 25\n');
    // A dry room is what a song is made of, so it says nothing — and every file
    // written before reverb existed stays byte-for-byte identical.
    const dry = songToScript(createSong());
    expect(dry).not.toContain('reverb');
    expect(dry).not.toContain('echo');
  });

  it('writes a pan only for a channel that moved, and reads it back where it sat', () => {
    const song = richSong();
    const text = songToScript(song);
    expect(text).toContain('track 3 "OFF" wave sawtooth pan -40 glide 35 vibrato 25 verb 0 echo 60\n');
    // A centred channel is what a song is made of, so it says nothing.
    expect(text).not.toContain('pan 0');
    const back = applyScript(createSong(), text);
    if (!back.ok) throw new Error(back.errors.map((e) => e.message).join(' / '));
    expect(back.song.tracks[2].pan).toBe(-40);
  });

  it('carries the room and the pan through the JSON format, and reads missing ones as neutral', () => {
    const file = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    expect(file.reverb).toBe(40);
    expect(file.echo).toBe(25);
    expect((file.tracks as Record<string, unknown>[])[2].pan).toBe(-40);

    delete file.reverb;
    delete file.echo;
    delete (file.tracks as Record<string, unknown>[])[2].pan;
    const older = songFromJson(JSON.stringify(file));
    if (!older.ok) throw new Error(older.errors.join(' / '));
    expect(older.song.reverb).toBe(0);
    expect(older.song.echo).toBe(0);
    expect(older.song.tracks[2].pan).toBe(0);
  });

  it('clamps a room and a pan a person would nudge, and refuses one that is not a number', () => {
    const file = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    file.reverb = 140;
    (file.tracks as Record<string, unknown>[])[2].pan = -160;
    const clamped = songFromJson(JSON.stringify(file));
    if (!clamped.ok) throw new Error(clamped.errors.join(' / '));
    expect(clamped.song.reverb).toBe(100);
    expect(clamped.song.tracks[2].pan).toBe(-100);

    const broken = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    broken.echo = 'a lot';
    const refused = songFromJson(JSON.stringify(broken));
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.errors.join(' / ')).toContain('"echo" must be a percentage 0..100');
  });

  it('writes a note at full force as the bare note, and an accent as a `~velocity`', () => {
    const text = songToScript(richSong());
    expect(text).toContain('E-5~40');
    // A note nobody accented is just the note, so an unaccented song writes
    // exactly the script this app always wrote.
    expect(text).not.toContain('~100');
    expect(songToScript(createSong())).not.toContain('~');
  });

  it('carries the velocity through the JSON format as a [note, velocity] pair', () => {
    const file = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    const chorus = (file.patterns as { steps: unknown[][] }[])[1];
    expect(chorus.steps[3][0]).toEqual([76, 40]);
    // ...while a full-force note stays the bare number it always was.
    expect(chorus.steps[23][3]).toBe(83);
  });

  it('reads a bare note as full force, and a pair as the accent it names', () => {
    const file = JSON.parse(songToJson(richSong())) as { patterns: { steps: unknown[][] }[] };
    // A version-3 file (or any file) may write the bare number; that is a note at
    // full velocity, which is what every file written before velocity meant.
    file.patterns[1].steps[3][0] = 76;
    const older = songFromJson(JSON.stringify(file));
    if (!older.ok) throw new Error(older.errors.join(' / '));
    expect(older.song.patterns[1].steps[3][0]).toEqual({ note: 76, extra: [], drum: null, velocity: 100, slide: false, stutter: 1, grace: 0, bend: 0 });
  });

  it('clamps a wild velocity in a file, and refuses one that is not a number', () => {
    const file = JSON.parse(songToJson(richSong())) as { patterns: { steps: unknown[][] }[] };
    file.patterns[1].steps[3][0] = [76, 500];
    const clamped = songFromJson(JSON.stringify(file));
    if (!clamped.ok) throw new Error(clamped.errors.join(' / '));
    expect(clamped.song.patterns[1].steps[3][0].velocity).toBe(100);

    const broken = JSON.parse(songToJson(richSong())) as { patterns: { steps: unknown[][] }[] };
    broken.patterns[1].steps[3][0] = [76, 'loud'];
    const refused = songFromJson(JSON.stringify(broken));
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.errors.join(' / ')).toContain('velocity must be a number 0..100');
  });

  it('writes glide and vibrato only for a channel that has them', () => {
    const text = songToScript(richSong());
    expect(text).toContain('glide 35 vibrato 25');
    // A steady channel that does not slide is what a song is made of, so it says
    // nothing — and every file written before expression existed stays identical.
    const plain = songToScript(createSong());
    expect(plain).not.toContain('glide');
    expect(plain).not.toContain('vibrato');
  });

  it('carries a channel\'s expression through the JSON format, and reads a missing one as steady', () => {
    const file = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    expect((file.tracks as Record<string, unknown>[])[2]).toMatchObject({ glide: 35, vibrato: 25 });

    // A version-4 file has neither field, and "absent" has to mean no slide and
    // no wobble — which is exactly how those files used to play.
    delete (file.tracks as Record<string, unknown>[])[2].glide;
    delete (file.tracks as Record<string, unknown>[])[2].vibrato;
    const older = songFromJson(JSON.stringify(file));
    if (!older.ok) throw new Error(older.errors.join(' / '));
    expect(older.song.tracks[2]).toMatchObject({ glide: 0, vibrato: 0 });
  });

  it('clamps a glide or vibrato a person would nudge, and refuses one that is not a number', () => {
    const file = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    (file.tracks as Record<string, unknown>[])[2].glide = 500;
    const clamped = songFromJson(JSON.stringify(file));
    if (!clamped.ok) throw new Error(clamped.errors.join(' / '));
    expect(clamped.song.tracks[2].glide).toBe(100);

    const broken = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    (broken.tracks as Record<string, unknown>[])[2].vibrato = 'a lot';
    const refused = songFromJson(JSON.stringify(broken));
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.errors.join(' / ')).toContain('"vibrato" must be a percentage 0..100');
  });

  it('writes a send only for a channel that changed one', () => {
    // A channel dry to the reverb and half into the echo, so the round trip has
    // to carry a send in each direction rather than one of them.
    const text = songToScript(richSong());
    expect(text).toContain('verb 0 echo 60');
    // A full send is where every channel already was before sends existed, so it
    // says nothing — and an old file's channel lines stay byte-for-byte identical.
    const full = songToScript(createSong());
    expect(full).not.toContain('verb');
    expect(full).not.toContain('echo');
    // The other end: a channel explicitly ON, which must survive as a number
    // rather than being confused with the default that is also written as one.
    const on = applyScript(createSong(), 'tracks 2\ntrack 1 "A" verb 100 echo 100\ntrack 2 "B" verb 40 echo 0');
    if (!on.ok) throw new Error(on.errors.map((e) => e.message).join(' / '));
    expect(songToScript(on.song)).toContain('track 1 "A" wave square');
    expect(songToScript(on.song)).toContain('track 2 "B" wave triangle verb 40 echo 0');
  });

  it('carries the sends through the JSON format, and reads a missing one as FULL', () => {
    const file = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    expect((file.tracks as Record<string, unknown>[])[2]).toMatchObject({ verb: 0, echo: 60 });
    // A version-5 file has neither field. "Absent" has to mean a full send, not a
    // dry channel: those files were written when the room reached every channel,
    // and reading it as zero would silence a reverb the song asked for.
    delete (file.tracks as Record<string, unknown>[])[2].verb;
    delete (file.tracks as Record<string, unknown>[])[2].echo;
    const older = songFromJson(JSON.stringify(file));
    if (!older.ok) throw new Error(older.errors.join(' / '));
    expect(older.song.tracks[2]).toMatchObject({ verb: 100, echo: 100 });
  });

  it('clamps a send a person would nudge, and refuses one that is not a number', () => {
    const file = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    (file.tracks as Record<string, unknown>[])[2].verb = 500;
    const clamped = songFromJson(JSON.stringify(file));
    if (!clamped.ok) throw new Error(clamped.errors.join(' / '));
    expect(clamped.song.tracks[2].verb).toBe(100);

    const broken = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    (broken.tracks as Record<string, unknown>[])[2].echo = 'a lot';
    const refused = songFromJson(JSON.stringify(broken));
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.errors.join(' / ')).toContain('"echo" must be a send 0..100');
  });

  it('writes the groove only when the song has a feel', () => {
    const plain = songToScript(createSong());
    expect(plain).not.toContain('groove');
    // A feel travels like the swing amount beside it, in both formats.
    const felt = applyScript(createSong(), 'groove shuffle\nsong "FELT"');
    if (!felt.ok) throw new Error(felt.errors.map((e) => e.message).join(' / '));
    const text = songToScript(felt.song);
    expect(text).toContain('groove shuffle');
    // And the line is written where it can be read back: after `new`, before the
    // tracks, so applying the file again lands on the same feel.
    const back = applyScript(createSong(), text);
    if (!back.ok) throw new Error(back.errors.map((e) => e.message).join(' / '));
    expect(back.song.groove).toBe('shuffle');
    expect(songToScript(back.song)).toBe(text);
  });

  it('carries the groove through the JSON format, and reads a missing one as straight', () => {
    const felt = applyScript(createSong(), 'groove backbeat\nsong "FELT"');
    if (!felt.ok) throw new Error(felt.errors.map((e) => e.message).join(' / '));
    const file = JSON.parse(songToJson(felt.song)) as Record<string, unknown>;
    expect(file.groove).toBe('backbeat');
    const back = songFromJson(JSON.stringify(file));
    if (!back.ok) throw new Error(back.errors.join(' / '));
    expect(back.song.groove).toBe('backbeat');

    // A straight song omits the field entirely, so a file that never chose a
    // feel is the exact file version 6 wrote.
    expect(songToJson(createSong())).not.toContain('groove');
    // A version-6 file has no field at all, and absent has to mean straight —
    // which is how every one of those files played.
    const older = songFromJson(songToJson(createSong()));
    if (!older.ok) throw new Error(older.errors.join(' / '));
    expect(older.song.groove).toBe(DEFAULT_GROOVE);
  });

  it('refuses a groove it cannot name, and repairs one that is not a string', () => {
    // A name is not a range: `groove 60` is not a taste with bad arithmetic, it
    // is a file that meant something else, so it is refused rather than clamped.
    const wrongName = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    wrongName.groove = 'funky';
    const refused = songFromJson(JSON.stringify(wrongName));
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.errors.join(' / ')).toContain('"funky" is not a groove');
    expect(refused.ok ? '' : refused.errors.join(' / ')).toContain('shuffle');

    const wrongType = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    wrongType.groove = 3;
    const typed = songFromJson(JSON.stringify(wrongType));
    expect(typed.ok).toBe(false);
    expect(typed.ok ? '' : typed.errors.join(' / ')).toContain('"groove" must be one of');
  });

  it('accepts a groove spelled any of the ways a person writes it', () => {
    const file = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    file.groove = 'Laid Back';
    const loose = songFromJson(JSON.stringify(file));
    if (!loose.ok) throw new Error(loose.errors.join(' / '));
    expect(loose.song.groove).toBe('laid-back');
  });

  it('writes the swing only when the song has one', () => {
    const text = songToScript(richSong());
    expect(text).toContain('swing 55\n');
    // A straight song is what a song is made of, so it says nothing — and every
    // file written before swing existed stays byte-for-byte identical.
    const straight = songToScript(createSong());
    expect(straight).not.toContain('swing');
  });

  it('carries the swing through the JSON format, and reads a missing one as straight', () => {
    const text = songToJson(richSong());
    expect(JSON.parse(text).swing).toBe(55);
    const parsed = songFromJson(text);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.swing).toBe(55);

    const file = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    delete file.swing;
    const older = songFromJson(JSON.stringify(file));
    if (!older.ok) throw new Error(older.errors.join(' / '));
    expect(older.song.swing).toBe(0);
  });

  it('clamps a swing a person would nudge, and refuses one that is not a number', () => {
    const file = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    file.swing = 140;
    const clamped = songFromJson(JSON.stringify(file));
    expect(clamped.ok && clamped.song.swing).toBe(100);

    const broken = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    broken.swing = 'a lot';
    const refused = songFromJson(JSON.stringify(broken));
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.errors.join(' / ')).toContain('"swing" must be a percentage 0..100');
  });

  it('writes the arrangement only when the song has one', () => {
    expect(songToScript(createSong())).not.toContain('order ');
    expect(songToScript(richSong())).toContain('order 1 2 1 2 1\n');
  });

  it('leaves trailing silence out but still declares the pattern length', () => {
    const text = songToScript(createSong());
    expect(text).toContain('steps 16');
    expect(text).toContain('pattern 1 "PATTERN 1"');
    // Nothing to say, so no grid rows at all — the length carries the rest.
    expect(text.split('\n').filter((line) => line.startsWith('...'))).toEqual([]);
    const result = applyScript(createSong(), text);
    if (!result.ok) throw new Error('a blank song should write a clean script');
    expect(result.song).toEqual(createSong());
    expect(patternRows(result.song)).toBe(16);
  });

  it('carries the master volume beside the song, and mentions it only when asked', () => {
    const song = richSong();
    const withVolume = applyScript(createSong(), songToScript(song, { volume: 0.42 }));
    expect(withVolume.ok && withVolume.settings.volume).toBeCloseTo(0.42, 5);
    const without = applyScript(createSong(), songToScript(song));
    expect(without.ok && without.settings.volume).toBeNull();
  });
});

describe('writing a song as a file', () => {
  it('reads back as exactly the same song', () => {
    const parsed = songFromJson(songToJson(richSong()));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song).toEqual(richSong());
    expect(parsed.kind).toBe('json');
  });

  it('prints JSON a person can read: two-space indent, one step per line', () => {
    const text = songToJson(createSong());
    expect(text).toContain(`"format": "${SONG_FILE_FORMAT}"`);
    expect(text).toContain(`"version": ${SONG_FILE_VERSION}`);
    // Two-space indent, so the file diffs and reads like a document.
    expect(text.split('\n')[1]).toBe(`  "format": "${SONG_FILE_FORMAT}",`);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('declares the stack version only for a song that has one', () => {
    const plain = createSong();
    expect(JSON.parse(songToJson(plain)).version).toBe(SONG_FILE_VERSION);
    expect(songToJson(plain)).not.toContain('"stack"');

    const stacked = applyScript(createSong(), 'tracks 1\nlayer 1 2 detune -9\nC-4\n');
    if (!stacked.ok) throw new Error('a stacked script must apply');
    expect(JSON.parse(songToJson(stacked.song)).version).toBe(STACK_SONG_FILE_VERSION);
    // A stack is the one thing an older build must not open quietly, because it
    // would play the channel's voice alone and sound like a different song.
    expect(STACK_SONG_FILE_VERSION).toBeGreaterThan(SONG_FILE_VERSION);
  });

  it('carries the song\'s key in both formats', () => {
    const song = richSong();
    song.key = { tonic: 9, scale: 'harmonic-minor' };
    const fromScript = parseSongFile(songToScript(song));
    const fromJson = parseSongFile(songToJson(song));
    if (!fromScript.ok || !fromJson.ok) throw new Error('a song in A harmonic minor must survive both formats');
    expect(fromScript.song.key).toEqual({ tonic: 9, scale: 'harmonic-minor' });
    expect(fromJson.song.key).toEqual({ tonic: 9, scale: 'harmonic-minor' });
    // Written the way a musician says it, not the way the type is spelled.
    expect(songToScript(song)).toContain('key A harmonic minor\n');
  });

  it('carries a whole sound through the JSON format, named or tweaked', () => {
    const song = createSong();
    song.tracks[0].voice = { ...voiceById('strings')!.params };
    song.tracks[1].voice = { ...DEFAULT_VOICE, wave: 'square', attack: 40, thick: 70 };
    const text = songToJson(song);
    expect(text).toContain('"voice"');
    const parsed = songFromJson(text);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice).toEqual(song.tracks[0].voice);
    expect(parsed.song.tracks[1].voice).toEqual(song.tracks[1].voice);
  });

  it('reads a file from before voices existed, as the neutral sound of its wave', () => {
    const file = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    file.version = 1;
    for (const track of file.tracks as Record<string, unknown>[]) {
      track.wave = 'triangle';
      delete track.voice;
    }
    const parsed = songFromJson(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice).toEqual({ ...DEFAULT_VOICE, wave: 'triangle' });
  });

  it('clamps a knob written past its range rather than refusing the whole file', () => {
    const file = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    (file.tracks as Record<string, Record<string, unknown>>[])[0].voice.bright = 140;
    const parsed = songFromJson(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.song.tracks[0].voice.bright).toBe(100);
  });

  it('carries each channel\'s level through the JSON format', () => {
    const text = songToJson(richSong());
    expect(JSON.parse(text).tracks[1].level).toBe(45);
    const parsed = songFromJson(text);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks.map((t) => t.level)).toEqual(richSong().tracks.map((t) => t.level));
  });

  it('reads a file from before levels existed as every channel at full volume', () => {
    const file = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    for (const track of file.tracks as Record<string, unknown>[]) delete track.level;
    const parsed = songFromJson(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    for (const track of parsed.song.tracks) expect(track.level).toBe(100);
  });

  it('clamps a level written past its range in a file, and names a level that is not a number', () => {
    const file = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const tracks = file.tracks as Record<string, unknown>[];
    tracks[0].level = 140;
    const clamped = songFromJson(JSON.stringify(file));
    expect(clamped.ok && clamped.song.tracks[0].level).toBe(100);

    const broken = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    (broken.tracks as Record<string, unknown>[])[0].level = 'loud';
    const refused = songFromJson(JSON.stringify(broken));
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.errors.join(' / ')).toContain('\'s "level" must be a percentage');
  });

  it('carries the master volume, and leaves it out when nobody set one', () => {
    const withVolume = songFromJson(songToJson(richSong(), { volume: 0.42 }));
    expect(withVolume.ok && withVolume.settings.volume).toBeCloseTo(0.42, 5);
    const without = songFromJson(songToJson(richSong()));
    expect(without.ok && without.settings.volume).toBeNull();
  });
});

describe('reading a file that is wrong', () => {
  it('refuses a voice it cannot read, and says which field is wrong', () => {
    const base = () => JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    expect(refusal({ ...base(), tracks: [{ name: 'X', voice: { wave: 'wobble' }, muted: false }] })).toContain('wave must be');
    expect(refusal({ ...base(), tracks: [{ name: 'X', voice: { wave: 'sine', bright: 'loud' }, muted: false }] })).toContain('"bright" must be a number');
    expect(refusal({ ...base(), tracks: [{ name: 'X', voice: 'pad', muted: false }] })).toContain('must be an object');
  });

  /** A known-good file, as a mutable object, so a test can break one field. */
  function file(): Record<string, unknown> {
    return JSON.parse(songToJson(richSong())) as Record<string, unknown>;
  }

  function refusal(source: unknown): string {
    const result = songFromJson(JSON.stringify(source));
    expect(result.ok).toBe(false);
    return result.ok ? '' : result.errors.join(' / ');
  }

  it('says so when the bytes are not JSON at all', () => {
    const result = songFromJson('tempo 128');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.errors[0]).toContain('not valid JSON');
  });

  it('refuses a JSON file that is not a Tracklet song', () => {
    expect(refusal({ hello: 'world' })).toContain(SONG_FILE_FORMAT);
    expect(refusal([1, 2, 3])).toContain('must be a JSON object');
  });

  it('refuses a file written by a newer Tracklet rather than guessing', () => {
    expect(refusal({ ...file(), version: SONG_FILE_VERSION_MAX + 1 })).toContain('newer Tracklet');
    expect(refusal({ ...file(), version: 'one' })).toContain('"version" must be a number');
  });

  it('refuses a note it cannot name, and says where it is', () => {
    const broken = file();
    const patterns = broken.patterns as { steps: (number | null)[][] }[];
    patterns[0].steps[0][0] = 999;
    const message = refusal(broken);
    expect(message).toContain('999');
    expect(message).toContain('pattern 1, step 0, channel 1');
    expect(message).toContain('12..119');
  });

  it('refuses a waveform, a name or a mute flag it does not understand', () => {
    expect(refusal({ ...file(), tracks: [{ name: 'X', wave: 'wobble', muted: false }] })).toContain('wave must be');
    expect(refusal({ ...file(), tracks: [{ name: '', wave: 'sine', muted: false }] })).toContain('needs a "name"');
    expect(refusal({ ...file(), tracks: [{ name: 'X', wave: 'sine' }] })).toContain('"muted"');
    expect(refusal({ ...file(), tracks: [{ name: 'X'.repeat(17), wave: 'sine', muted: false }] })).toContain('16-character limit');
  });

  it('refuses a title too long for the header, rather than renaming the song on the way in', () => {
    expect(refusal({ ...file(), title: 'X'.repeat(MAX_SONG_TITLE + 1) })).toContain(`${MAX_SONG_TITLE} characters`);
    // A title exactly at the limit is a title, not a mistake.
    const atLimit = songFromJson(JSON.stringify({ ...file(), title: 'X'.repeat(MAX_SONG_TITLE) }));
    expect(atLimit.ok).toBe(true);
    if (atLimit.ok) expect(atLimit.song.title).toHaveLength(MAX_SONG_TITLE);
  });

  it('refuses a key it cannot name, and defaults one it was never told', () => {
    expect(refusal({ ...file(), key: { root: 'D', scale: 'lydian' } })).toContain('harmonic minor');
    expect(refusal({ ...file(), key: { root: 'H', scale: 'minor' } })).toContain('root note and a scale');
    expect(refusal({ ...file(), key: 'D minor' })).toContain('must be an object');

    // A file that says nothing about a key is not a broken file: it opens in C
    // major, which is the honest reading of a song that never mentioned one.
    const silent = file();
    delete silent.key;
    const result = songFromJson(JSON.stringify(silent));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.song.key).toEqual(DEFAULT_KEY);

    // And a bare root is a major key, the way a bare note name is everywhere.
    const bare = songFromJson(JSON.stringify({ ...file(), key: { root: 'F#' } }));
    expect(bare.ok).toBe(true);
    if (bare.ok) expect(bare.song.key).toEqual({ tonic: 6, scale: 'major' });
  });

  it('refuses an order slot that points at a pattern the file does not have', () => {
    const file = JSON.parse(songToJson(richSong())) as Record<string, unknown>;
    file.order = [1, 3];
    const result = songFromJson(JSON.stringify(file));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/slot 2 must be a whole pattern number 1\.\.2/);
  });

  it('refuses more channels or patterns than a song can hold', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ name: `T${i}`, wave: 'sine', muted: false }));
    expect(refusal({ ...file(), tracks: nine })).toContain('1 to 8 channels');
    expect(refusal({ ...file(), patterns: [] })).toContain('1 to 64 patterns');
  });

  it('refuses a missing grid or a step that is not a row', () => {
    expect(refusal({ ...file(), patterns: [{ name: 'X' }] })).toContain('needs a "steps" grid');
    expect(refusal({ ...file(), patterns: [{ name: 'X', steps: [3] }] })).toContain('must be an array');
  });

  it('clamps a tempo a person would nudge instead of refusing the file', () => {
    const result = songFromJson(JSON.stringify({ ...file(), bpm: 400 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.song.bpm).toBe(300);
  });
});

describe('reading a file of either format', () => {
  it('tells the two apart by what is in them, not by what they are called', () => {
    const song = richSong();
    const fromScript = parseSongFile(songToScript(song));
    const fromJson = parseSongFile(songToJson(song));
    expect(fromScript.ok && fromScript.kind).toBe('script');
    expect(fromJson.ok && fromJson.kind).toBe('json');
    if (!fromScript.ok || !fromJson.ok) throw new Error('both formats should read back');
    expect(fromScript.song).toEqual(song);
    expect(fromJson.song).toEqual(song);
  });

  it('carries a title that sits exactly at the limit, in both formats', () => {
    // The narrowest gap between the writer, the reader and the limit: a title
    // that fills the header must not be the one that gets refused on the way
    // back in.
    const song = createSong();
    song.title = 'X'.repeat(MAX_SONG_TITLE);
    const fromScript = parseSongFile(songToScript(song));
    const fromJson = parseSongFile(songToJson(song));
    if (!fromScript.ok || !fromJson.ok) throw new Error('a title at the limit must survive both formats');
    expect(fromScript.song.title).toBe(song.title);
    expect(fromJson.song.title).toBe(song.title);
  });

  it('reads a script against a blank song, so a file never merges into one', () => {
    const parsed = parseSongFile('tempo 90\nC-4 D-4');
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.patterns[0].steps[0][0].note).toBe(60);
    expect(parsed.song.tracks).toHaveLength(4);
    expect(parsed.song.bpm).toBe(90);
  });

  it('reports a script mistake with the line it is on', () => {
    const parsed = parseSongFile('tempo 120\ntempo fast');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors[0]).toMatch(/^line 2:/);
  });

  it('ignores a byte-order mark, which other editors like to add', () => {
    const parsed = parseSongFile(`\uFEFF${songToJson(richSong())}`);
    expect(parsed.ok && parsed.kind).toBe('json');
  });
});

describe('file names', () => {
  it('turns a title into something every filesystem accepts', () => {
    expect(songFileStem('RAINY WINDOW LOOP')).toBe('rainy-window-loop');
    expect(songFileStem("I'LL DRIVE YOU HOME")).toBe('i-ll-drive-you-home');
    expect(songFileStem('A/B\\C:D*E')).toBe('a-b-c-d-e');
    expect(songFileStem('   ')).toBe('tracklet-song');
    expect(songFileStem('...')).toBe('tracklet-song');
  });
});
