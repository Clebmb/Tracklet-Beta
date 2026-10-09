import { describe, expect, it } from 'vitest';

import {
  applySoundToTrack,
  createSong,
  DEFAULT_HOLD,
  HOLD_STEPS,
  DEFAULT_SHAPE,
  DEFAULT_TRACK_ECHO,
  DEFAULT_VERB,
  PATCH_FILE_VERSION,
  patchAbout,
  patchFileName,
  patchFromJson,
  patchNameFromFile,
  patchRowLabel,
  patchToJson,
  setTrackLayer,
  soundFromTrack,
  songToJson,
  tidyPatchName,
  TRACK_EFFECTS,
  type PatchSound,
  type Song,
  type Track,
} from '../model';

/**
 * The patch file: a channel's sound, made portable.
 *
 * Two questions decide whether this feature is real, and most of this file is
 * about them. **Does the sound SURVIVE the trip?** — a patch is only worth
 * anything if what comes back out is byte-for-byte what went in, including the
 * settings that are easy to get backwards, like a send whose default is OPEN
 * rather than off. And **does it stay out of the mix?** — loading somebody's
 * sound must not touch a level, a pan, a group or a pocket, because a patch that
 * carried those would silently re-mix the song it was dropped into.
 */

/** A channel with something to say on every field a patch carries. */
function richTrack(song: Song): Track {
  const track = song.tracks[0]!;
  track.name = 'LEAD';
  track.voice = { ...track.voice, wave: 'sawtooth', bright: 62, sweep: 35, attack: 12, ring: 40, thick: 25 };
  track.stack = [
    { ...track.voice, wave: 'sawtooth', octave: 1, detune: 7, gain: 70, bright: 50, sweep: 0, duty: 100, noise: 0, attack: 5, decay: 0, ring: 30, release: 0, thick: 10 },
    { ...track.voice, wave: 'sine', octave: -1, detune: -4, gain: 100, bright: 20, sweep: 0, duty: 100, noise: 0, attack: 0, decay: 0, ring: 0, release: 0, thick: 0 },
  ];
  track.shape = 'nasal';
  track.drive = 35;
  track.cab = 15;
  track.tape = 12;
  track.radio = 18;
  track.vinyl = 22;
  track.tilt = 20;
  track.gate = 60;
  track.hold = 8;
  track.glide = 40;
  track.vibrato = 30;
  // Held BACK from the room and the echo rather than pushed into them: the
  // interesting direction, because full is the default.
  track.verb = 25;
  track.echo = 0;
  track.sample = 'BRK02';
  return track;
}

/** A patch through the file and back, exactly as the app does it. */
function roundTrip(sound: PatchSound, name = 'TEST PATCH'): PatchSound {
  const text = patchToJson(sound, name);
  const read = patchFromJson(text);
  if (!read.ok) throw new Error(read.errors.join('\n'));
  return read.sound;
}

const refuse = (text: string): string => {
  const read = patchFromJson(text);
  if (read.ok) throw new Error('this patch reads, so it is not a refusal.');
  return read.errors.join('\n');
};

describe('a sound survives the round trip', () => {
  it('carries every field a patch is for', () => {
    const song = createSong();
    const sound = soundFromTrack(richTrack(song));
    expect(roundTrip(sound)).toEqual(sound);
  });

  it('carries a channel nobody has touched, unchanged', () => {
    // The identity test. A song's own default channel must save and load with no
    // difference at all — which is where a wrong default shows up, since the
    // sends default to OPEN and glide, vibrato and the effects to zero.
    const song = createSong();
    const sound = soundFromTrack(song.tracks[1]!);
    expect(roundTrip(sound)).toEqual(sound);
    expect(sound.verb).toBe(DEFAULT_VERB);
    expect(sound.echo).toBe(DEFAULT_TRACK_ECHO);
    expect(sound.hold).toBe(DEFAULT_HOLD);
    expect(sound.shape).toBe(DEFAULT_SHAPE);
  });

  it('keeps a channel that is deliberately DRY dry', () => {
    // The bug this test exists for: a send's default is 100, so treating 0 as
    // "the default, leave it out" would turn every dry channel wet on load.
    const song = createSong();
    const track = song.tracks[0]!;
    track.verb = 0;
    track.echo = 0;
    const sound = roundTrip(soundFromTrack(track));
    expect(sound.verb).toBe(0);
    expect(sound.echo).toBe(0);
    // And a fully-open channel writes no send keys at all, which is what keeps
    // the common case a file worth reading.
    const text = patchToJson(soundFromTrack(song.tracks[1]!), 'PLAIN');
    expect(JSON.parse(text)).not.toHaveProperty('verb');
    expect(JSON.parse(text)).not.toHaveProperty('echo');
  });

  it('keeps a knob that is at its neutral value but SET', () => {
    // `hold 1` and `bright 0` are the defaults, and they are also things a person
    // can mean. A patch that dropped them would be smaller and wrong.
    const song = createSong();
    const track = song.tracks[0]!;
    track.hold = DEFAULT_HOLD;
    track.glide = 0;
    const sound = roundTrip(soundFromTrack(track));
    expect(sound.hold).toBe(DEFAULT_HOLD);
    expect(sound.glide).toBe(0);
  });

  it('is the smallest file it can be for a plain sound', () => {
    const song = createSong();
    const file = JSON.parse(patchToJson(soundFromTrack(song.tracks[0]!), 'PLAIN')) as Record<string, unknown>;
    expect(Object.keys(file).sort()).toEqual(['format', 'name', 'version', 'voice']);
    expect(file.format).toBe('tracklet-patch');
    expect(file.version).toBe(PATCH_FILE_VERSION);
    expect(songToJson(createSong()).length).toBeGreaterThan(patchToJson(soundFromTrack(song.tracks[0]!), 'PLAIN').length);
  });

  it('reads the ten effects from where a TRACK keeps them', () => {
    // A patch's own shape has them in an object; a channel's are flat fields on
    // the track. The projection is the bridge, and this is the bridge's test.
    const song = createSong();
    const track = richTrack(song);
    const sound = soundFromTrack(track);
    expect(sound.effects).toEqual({
      drive: 35, crush: 0, cab: 15, tape: 12, radio: 18, vinyl: 22,
      chorus: 0, punch: 0, tilt: 20, gate: 60,
    });
    for (const effect of TRACK_EFFECTS) expect(sound.effects[effect.id]).toBe(track[effect.id]);
  });
});

describe('a patch stays out of the mix', () => {
  it('leaves every field that is not a sound alone', () => {
    const song = createSong();
    const target = song.tracks[0]!;
    // A channel somebody has already mixed: loud, off to one side, muted, in a
    // group, with a pocket of its own and a role in the arrangement.
    target.name = 'MY BASS';
    target.level = 42;
    target.pan = -60;
    target.muted = true;
    target.bus = 'DRUMS';
    target.groove = 'shuffle';
    target.humanize = 30;
    target.poly = 4;
    target.duck = 50;

    const other = createSong();
    const sound = soundFromTrack(richTrack(other));
    applySoundToTrack(target, sound);

    // The sound arrived...
    expect(soundFromTrack(target)).toEqual(sound);
    // ...and nothing about where the channel SITS moved.
    expect(target.name).toBe('MY BASS');
    expect(target.level).toBe(42);
    expect(target.pan).toBe(-60);
    expect(target.muted).toBe(true);
    expect(target.bus).toBe('DRUMS');
    expect(target.groove).toBe('shuffle');
    expect(target.humanize).toBe(30);
    expect(target.poly).toBe(4);
    expect(target.duck).toBe(50);
  });

  it('hands each channel its own layers rather than one shared stack', () => {
    // Applying the same patch to two channels must not make them one channel:
    // editing one layer would otherwise change three others.
    const song = createSong();
    const sound = soundFromTrack(richTrack(song));
    const a = song.tracks[0]!;
    const b = song.tracks[1]!;
    applySoundToTrack(a, sound);
    applySoundToTrack(b, sound);
    expect(a.stack[0]).not.toBe(b.stack[0]);
    expect(a.stack[0]).not.toBe(sound.stack[0]);
    a.stack[0]!.detune = 99;
    expect(b.stack[0]!.detune).not.toBe(99);
    expect(sound.stack[0]!.detune).not.toBe(99);
  });
});

describe('what a patch file refuses', () => {
  it('says so when it is handed something that is not JSON', () => {
    expect(refuse('not json at all')).toContain('this file is not JSON');
    expect(refuse('[1, 2, 3]')).toContain('must be a JSON object');
  });

  it('says which format it IS when it is handed a song', () => {
    // The refusal a person actually meets: both formats are `.json` and both
    // start with a brace, so the sentence has to name the other one.
    expect(refuse(songToJson(createSong()))).toContain('this is not a patch file');
    expect(refuse(songToJson(createSong()))).toContain('tracklet-song');
    expect(refuse('{"hello": 1}')).toContain('it has no "format" key');
  });

  it('refuses a file from a newer build rather than guessing at it', () => {
    const ahead = JSON.stringify({ format: 'tracklet-patch', version: PATCH_FILE_VERSION + 1, voice: { wave: 'sine' } });
    const message = refuse(ahead);
    expect(message).toContain('written by a newer version of Tracklet');
    expect(message).toContain(String(PATCH_FILE_VERSION + 1));
  });

  it('refuses a version that is not a version', () => {
    expect(refuse('{"format":"tracklet-patch","version":"one","voice":{"wave":"sine"}}')).toContain('"version" must be a whole number');
    expect(refuse('{"format":"tracklet-patch","version":0,"voice":{"wave":"sine"}}')).toContain('"version" must be a whole number');
  });

  it('refuses a wave it does not know', () => {
    expect(refuse('{"format":"tracklet-patch","version":1,"voice":{"wave":"celesta"}}')).toContain('must be square, triangle');
  });

  it('refuses a filter shape it does not know, rather than dropping it', () => {
    // Dropping it would play a low-pass where the file asked for a band-pass,
    // which is a different instrument with nothing in the sound to say so.
    const text = '{"format":"tracklet-patch","version":1,"voice":{"wave":"sine"},"shape":"squiggly"}';
    expect(refuse(text)).toContain('must be a filter shape this app knows');
  });

  it('refuses a stack longer than a channel can hold', () => {
    const layer = { wave: 'sawtooth' };
    const text = JSON.stringify({
      format: 'tracklet-patch', version: 1, voice: { wave: 'sine' },
      stack: [layer, layer, layer, layer],
    });
    expect(refuse(text)).toContain('a channel may have 3 layers above its voice');
  });

  it('refuses a number that is not a number, and clamps one that is out of range', () => {
    // Each field's message quotes its OWN range, because they are not all the
    // same kind of number: `hold` is a ring length in steps, not a percentage.
    expect(refuse('{"format":"tracklet-patch","version":1,"voice":{"wave":"sine"},"hold":"soon"}')).toContain('"hold" must be a number 1..16');
    expect(refuse('{"format":"tracklet-patch","version":1,"voice":{"wave":"sine"},"glide":false}')).toContain('"glide" must be a number 0..100');
    expect(refuse('{"format":"tracklet-patch","version":1,"voice":{"wave":"sine"},"verb":"lots"}')).toContain('"verb" must be a number 0..100');
    // Out of range is a taste with bad arithmetic, so it is clamped and the
    // patch loads — the same policy a song file follows for the same fields.
    const read = patchFromJson('{"format":"tracklet-patch","version":1,"voice":{"wave":"sine"},"hold":900,"drive":400,"verb":-40}');
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(HOLD_STEPS).toContain(read.sound.hold);
    expect(read.sound.effects.drive).toBe(100);
    expect(read.sound.verb).toBe(0);
  });

  it('refuses a sample name that is not a name', () => {
    const text = '{"format":"tracklet-patch","version":1,"voice":{"wave":"sine"},"sample":"THIS IS NOT A NAME!!"}';
    expect(refuse(text)).toContain('must be the name of a recording');
  });

  it('clamps a hand-written patch into the model\u2019s own ranges', () => {
    // The case this whole policy exists for: a file somebody edited by hand.
    const read = patchFromJson('{"format":"tracklet-patch","version":1,"voice":{"wave":"sine","bright":999}}');
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(read.sound.voice.bright).toBe(100);
  });
});

describe('the name, and the file it becomes', () => {
  it('never leaves a patch unnamed', () => {
    expect(tidyPatchName('')).toBe('PATCH');
    expect(tidyPatchName('   ')).toBe('PATCH');
    expect(tidyPatchName('  WARM   PAD  ')).toBe('WARM PAD');
    expect(tidyPatchName('x'.repeat(80))).toHaveLength(40);
  });

  it('names the file after the patch', () => {
    expect(patchFileName('WARM PAD')).toBe('warm-pad.patch.json');
    expect(patchFileName('')).toBe('patch.patch.json');
  });

  it('offers the filename as a name when the file has none', () => {
    expect(patchNameFromFile('warm-pad.patch.json')).toBe('WARM PAD');
    expect(patchNameFromFile('Odd_Name.json')).toBe('ODD NAME');
    expect(patchNameFromFile('')).toBe('PATCH');
  });

  it('keeps the file\u2019s own name when it has one', () => {
    const read = patchFromJson(patchToJson(soundFromTrack(createSong().tracks[0]!), 'FROM THE FILE'));
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(read.name).toBe('FROM THE FILE');
    expect(patchNameFromFile('ignored.patch.json')).toBe('IGNORED');
  });
});

describe('how a patch describes itself', () => {
  it('counts the layers and names what is switched on', () => {
    const song = createSong();
    const sound = soundFromTrack(richTrack(song));
    const about = patchAbout(sound);
    expect(about).toContain('3 layers');
    expect(about).toContain('drive + cab + tape + radio + vinyl + tilt + gate on');
    expect(about).toContain('a nasal filter');
    expect(about).toContain('plays BRK02');
    expect(about).toContain('25 room');
    // A send that is held back is worth saying; one that is open is not.
    expect(about).not.toContain('0 echo');
  });

  it('says so when there is nothing to say', () => {
    const song = createSong();
    expect(patchAbout(soundFromTrack(song.tracks[0]!))).toBe('1 layer, no effects');
    expect(patchRowLabel('WARM PAD', soundFromTrack(song.tracks[0]!))).toBe('WARM PAD  -  1 layer');
  });
});

describe('a patch of a stacked channel is the stack', () => {
  it('survives the layer machinery it was built with', () => {
    // Built through the editor's own path — a new layer is a copy of the one
    // below it — so the patch has to carry what that path produces and not just
    // what a test can write by hand.
    const song = createSong();
    const track = song.tracks[0]!;
    expect(setTrackLayer(track, 2, { detune: -8 })).toBe(true);
    expect(setTrackLayer(track, 3, { octave: 1, gain: 50 })).toBe(true);
    const sound = roundTrip(soundFromTrack(track));
    expect(sound.stack).toHaveLength(2);
    expect(sound.stack[0]!.detune).toBe(-8);
    expect(sound.stack[1]!.octave).toBe(1);
    expect(sound.stack[1]!.gain).toBe(50);
    expect(soundFromTrack(track)).toEqual(sound);
  });
});
