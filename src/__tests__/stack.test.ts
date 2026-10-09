import { describe, expect, it } from 'vitest';

import {
  applyScript,
  clearTrackLayer,
  createSong,
  DEFAULT_VOICE,
  layerAt,
  layerCount,
  MAX_EXTRA_LAYERS,
  MAX_LAYERS,
  patchForTrack,
  patchFromVoice,
  setTrackLayer,
  songFromJson,
  songToJson,
  songToScript,
  parseUserVoices,
  sameSound,
  savedSound,
  savedStackChip,
  soundMatchesSaved,
  soundShortLabel,
  stackChip,
  stackLabel,
  withUserVoice,
  SONG_FILE_VERSION,
  STACK_SONG_FILE_VERSION,
  summarizeSong,
  voiceById,
  type Layer,
  type Song,
  type Track,
  type UserVoice,
} from '../model';

/**
 * A channel's stack: the layers above its voice.
 *
 * This file exists for one reason first and everything else second. A stack is
 * the first feature that changes what a channel IS rather than what one of its
 * numbers means, so the promise that has to hold — and that every song written
 * before it depends on — is that a channel with no stack is EXACTLY the channel
 * it always was. That is asserted here as an identity (`patchForTrack` on an
 * empty stack equals `patchFromVoice`) rather than as an opinion, and then again
 * at both file formats, where it is asserted as bytes.
 *
 * The rest is the arithmetic of a list with no holes: a new layer is a copy of
 * the one below it, layer 1 is the voice and cannot be moved or removed, and a
 * layer that would leave a gap is refused with a line number rather than
 * quietly doing nothing.
 */

/** A channel with a voice and no stack — what every channel has ever been. */
function plainTrack(voiceName?: string): Track {
  const track = createSong().tracks[0];
  const preset = voiceName ? voiceById(voiceName) : null;
  if (preset) track.voice = { ...preset.params };
  return track;
}

/** Apply a script and narrow to the success branch, failing loudly otherwise. */
function applied(source: string, song: Song = createSong()): Song {
  const result = applyScript(song, source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result.song;
}

/** The first message a script is refused with, or null when it applies. */
function refusal(source: string): string | null {
  const result = applyScript(createSong(), source);
  if (result.ok) return null;
  return result.errors.map((error) => `line ${error.line}: ${error.message}`).join('\n');
}

describe('a channel with no stack is the channel it always was', () => {
  it('builds exactly the one-layer patch a voice builds', () => {
    for (const name of ['lead', 'pad', 'sub', 'hat', 'bell', 'pluck']) {
      const track = plainTrack(name);
      expect(patchForTrack(track)).toEqual(patchFromVoice(track.voice));
    }
  });

  it('survives a layer copy with the same numbers it was made of', () => {
    const track = plainTrack('glass');
    const patch = patchForTrack(track);
    expect(patch.layers).toHaveLength(1);
    // Every field, not just the ones a test happens to name: the engine reads
    // this object, so "the same patch" has to mean all thirteen numbers.
    expect(patch.layers[0]).toEqual({
      wave: track.voice.wave,
      octave: 0, detune: 0, gain: 100,
      bright: track.voice.bright, sweep: track.voice.sweep, duty: track.voice.duty,
      noise: track.voice.noise, attack: track.voice.attack, decay: track.voice.decay,
      ring: track.voice.ring, release: track.voice.release, thick: track.voice.thick,
    });
  });

  it('reads as one layer, with no chip', () => {
    const track = plainTrack();
    expect(layerCount(track)).toBe(1);
    expect(stackLabel(track)).toBe('1 LAYER');
    expect(stackChip(track)).toBe('');
  });

  it('writes the song file this app always wrote: the same version, no stack', () => {
    const song = applied('new\nsong "PLAIN"\ntracks 2\n\nC-4 .\n');
    const json = songToJson(song, { volume: 70 });
    expect(JSON.parse(json).version).toBe(SONG_FILE_VERSION);
    expect(json).not.toContain('"stack"');
    // And the script format says nothing about layers either, so a file written
    // by this build opens in the last one.
    expect(songToScript(song, { volume: 70 })).not.toContain('layer ');
  });
});

describe('the stack itself', () => {
  it('starts a new layer as a copy of the one below it', () => {
    const track = plainTrack('lead');
    expect(setTrackLayer(track, 2, { detune: -9 })).toBe(true);
    expect(track.stack).toHaveLength(1);
    // The copy is what makes `layer 1 2` audible at once: everything the voice
    // had, with the one thing that was asked for changed.
    expect(track.stack[0].ring).toBe(track.voice.ring);
    expect(track.stack[0].wave).toBe(track.voice.wave);
    expect(track.stack[0].detune).toBe(-9);
    expect(track.stack[0].gain).toBe(100);
  });

  it('writes layer 1 into the voice, and gives it no pitch of its own', () => {
    const track = plainTrack();
    setTrackLayer(track, 1, { bright: 12, wave: 'sine' });
    expect(track.voice.bright).toBe(12);
    expect(track.voice.wave).toBe('sine');
    expect(track.stack).toHaveLength(0);
    // A voice is in tune with itself at full level by definition, so an octave
    // asked of layer 1 is dropped here and refused in the script, where it can
    // name the line.
    setTrackLayer(track, 1, { octave: 2, detune: -50, gain: 10 });
    expect(track.voice).toEqual({ ...track.voice, wave: 'sine', bright: 12 });
  });

  it('refuses a layer that would leave a hole', () => {
    const track = plainTrack();
    expect(setTrackLayer(track, 3, {})).toBe(false);
    expect(layerCount(track)).toBe(1);
  });

  it('stops at the format cap', () => {
    const track = plainTrack();
    for (let i = 0; i < MAX_EXTRA_LAYERS; i++) expect(setTrackLayer(track, i + 2, {})).toBe(true);
    expect(layerCount(track)).toBe(MAX_LAYERS);
    // A stack is capped rather than truncated: saying no is the honest answer to
    // a fifth layer, and the caller reports it.
    expect(setTrackLayer(track, MAX_LAYERS + 1, {})).toBe(false);
    expect(layerCount(track)).toBe(MAX_LAYERS);
  });

  it('removes a middle layer by shifting the ones above it down', () => {
    const track = plainTrack();
    setTrackLayer(track, 2, { octave: -1 });
    setTrackLayer(track, 3, { octave: 2 });
    expect(layerAt(track, 3)?.octave).toBe(2);
    expect(clearTrackLayer(track, 2)).toBe(true);
    expect(layerCount(track)).toBe(2);
    // The old third layer is now the second, the same way removing a bar from
    // the order or a channel from the song behaves.
    expect(layerAt(track, 2)?.octave).toBe(2);
    expect(layerAt(track, 3)).toBeNull();
  });

  it('cannot remove the voice', () => {
    const track = plainTrack();
    expect(clearTrackLayer(track, 1)).toBe(false);
    expect(layerAt(track, 1)).not.toBeNull();
  });

  it('passes every layer to the engine, in order, clamped', () => {
    const track = plainTrack();
    setTrackLayer(track, 2, { octave: 1 });
    setTrackLayer(track, 3, { octave: -2 });
    const patch = patchForTrack(track);
    expect(patch.layers.map((layer: Layer) => layer.octave)).toEqual([0, 1, -2]);
    expect(stackLabel(track)).toBe('3 LAYERS');
    expect(stackChip(track)).toBe('+2');
  });
});

describe('the layer statement', () => {
  it('adds a layer to a channel by number', () => {
    const song = applied('tracks 2\ntrack 1 "LEAD" voice lead\nlayer 1 2 wave saw octave 1 detune -9 gain 60\n');
    const track = song.tracks[0];
    expect(track.stack).toHaveLength(1);
    expect(track.stack[0].wave).toBe('sawtooth');
    expect(track.stack[0].octave).toBe(1);
    expect(track.stack[0].detune).toBe(-9);
    expect(track.stack[0].gain).toBe(60);
    // Untouched knobs come from the copy, which is what makes a stack read as
    // "the sound I had, again, moved".
    expect(track.stack[0].ring).toBe(track.voice.ring);
    // And the other channel is left alone: a layer belongs to one channel.
    expect(song.tracks[1].stack).toHaveLength(0);
  });

  it('writes the voice when the layer is 1', () => {
    const song = applied('tracks 1\nlayer 1 1 wave triangle bright 20\n');
    expect(song.tracks[0].voice.wave).toBe('triangle');
    expect(song.tracks[0].voice.bright).toBe(20);
    expect(song.tracks[0].stack).toHaveLength(0);
  });

  it('grows one layer at a time, in the order written', () => {
    const song = applied('tracks 1\nlayer 1 2 detune -9\nlayer 1 3 detune 9\n');
    expect(song.tracks[0].stack.map((layer) => layer.detune)).toEqual([-9, 9]);
  });

  it('removes a layer with clear, and shifts the rest down', () => {
    const song = applied('tracks 1\nlayer 1 2 octave -1\nlayer 1 3 octave 2\nlayer 1 2 clear\n');
    expect(song.tracks[0].stack.map((layer) => layer.octave)).toEqual([2]);
  });

  it('takes `remove` as the same word', () => {
    const song = applied('tracks 1\nlayer 1 2 octave 1\nlayer 1 2 remove\n');
    expect(song.tracks[0].stack).toHaveLength(0);
  });

  it('counts the layers as commands run, so a stack cannot be written with a hole', () => {
    expect(refusal('tracks 1\nlayer 1 3 wave saw\n')).toContain('no holes');
    expect(refusal('tracks 1\nlayer 1 4 wave saw\n')).toContain('layer 1 2');
    // A channel may grow one layer at a time, so the line that ADDS layer 2 is
    // what makes layer 3 exist on the next line — and the other order is refused
    // on the line where it is still a hole.
    expect(refusal('tracks 1\nlayer 1 2 wave saw\nlayer 1 3 wave saw\n')).toBeNull();
    expect(refusal('tracks 1\nlayer 1 3 wave saw\nlayer 1 2 wave saw\n')).toContain('no holes');
    // A layer that already exists can be written to as often as the author likes.
    expect(refusal('tracks 1\nlayer 1 2 bright 20\nlayer 1 2 bright 80\n')).toBeNull();
  });

  it('refuses a layer 1 that has a pitch or a level of its own', () => {
    expect(refusal('tracks 1\nlayer 1 1 octave 1\n')).toContain('VOICE');
    expect(refusal('tracks 1\nlayer 1 1 detune -20\n')).toContain('VOICE');
    expect(refusal('tracks 1\nlayer 1 1 gain 40\n')).toContain('level');
  });

  it('will not remove the voice, and will not remove what is not there', () => {
    expect(refusal('tracks 1\nlayer 1 1 clear\n')).toContain('VOICE');
    expect(refusal('tracks 1\nlayer 1 2 clear\n')).toContain('there is no layer 2');
  });

  it('refuses a channel the song does not have', () => {
    expect(refusal('tracks 2\nlayer 3 2 wave saw\n')).toContain('Channels are 1..2');
    expect(refusal('tracks 1\nlayer 0 2 wave saw\n')).toContain('tracks N');
  });

  it('refuses a layer number that is not a layer', () => {
    expect(refusal('tracks 1\nlayer 1 0 wave saw\n')).toContain('second number is the LAYER');
    expect(refusal(`tracks 1\nlayer 1 ${MAX_LAYERS + 1} wave saw\n`)).toContain(`up to ${MAX_LAYERS} layers`);
    expect(refusal('tracks 1\nlayer 1 x wave saw\n')).toContain('second number is the LAYER');
    // A channel already at the cap is a different mistake with a different fix:
    // nothing more fits, so something has to come OFF rather than be numbered
    // right.
    const full = 'tracks 1\nlayer 1 2\nlayer 1 3\nlayer 1 4\n';
    expect(refusal(`${full}layer 1 5 wave saw\n`)).toContain('Remove one first');
    expect(refusal(`${full}layer 1 4 gain 40\n`)).toBeNull();
  });

  it('names the fix for a value it cannot use', () => {
    expect(refusal('tracks 1\nlayer 1 2 gain 200\n')).toContain('whole number 0..100');
    expect(refusal('tracks 1\nlayer 1 2 octave 9\n')).toContain('-4..4');
    expect(refusal('tracks 1\nlayer 1 2 wave wobble\n')).toContain('wave must be');
    expect(refusal('tracks 1\nlayer 1 2 bright 400\n')).toContain('percentage 0..100');
    expect(refusal('tracks 1\nlayer 1 2 detune\n')).toContain('"detune" needs a value');
    expect(refusal('tracks 1\nlayer 1 2 wobble 3\n')).toContain('is not a layer setting');
    expect(refusal('tracks 1\nlayer 1 2 octave 1 clear\n')).toContain('takes nothing after it');
  });

  it('is spelled like a channel setting, so a plausible mistake is explained', () => {
    // These would otherwise become a channel NAMED "GAIN 40" — the kind of quiet
    // rename a person discovers much later — so the stray-word check answers
    // them instead.
    expect(refusal('tracks 1\ntrack 1 gain 40\n')).toContain("a LAYER's level");
    expect(refusal('tracks 1\ntrack 1 layer 2 wave saw\n')).toContain('a statement of its own');
    expect(refusal('tracks 1\ntrack 1 octave 2\n')).toContain('not a track setting');
    // `detune` is a knob alias on a track line (the wide/narrow one) and a
    // layer's tuning in cents on a layer line. Thinking in cents on a track line
    // is the mistake worth a sentence, so the error carries one.
    expect(refusal('tracks 1\ntrack 1 detune -5\n')).toContain('THICK');
    expect(refusal('tracks 1\ntrack 1 detune -5\n')).toContain('layer 1 2 detune -5');
  });

  it('leaves the grid alone: a layer line is not a step', () => {
    const song = applied('tracks 1\nlayer 1 2 detune -8\nC-4\nE-4\n');
    expect(song.patterns[0].steps[0][0].note).not.toBeNull();
    expect(song.patterns[0].steps[1][0].note).not.toBeNull();
  });

  it('is replaced along with the sound when a console lays its own sound down', () => {
    // `chip nes` says "this channel IS a NES pulse", so a stack left behind would
    // mean the profile had not actually been applied.
    const song = applied('tracks 1\nlayer 1 2 detune -9\nchip nes\nC-4\n');
    expect(song.tracks[0].stack).toEqual([]);
    // And the parser counts the reset too, so a layer line after the chip line is
    // checked against the channel the chip left behind rather than a stale one.
    expect(refusal('tracks 1\nlayer 1 2 detune -9\nchip nes\nlayer 1 3 octave 1\n')).toContain('layer 1 2');
  });

  it('warns when a stack is loud rather than refusing it', () => {
    const loud = summarizeSong(applied('tracks 1\nlayer 1 2\nlayer 1 3\nC-4\n'));
    expect(loud.advisories.join('\n')).toContain('all at full gain');
    const shaped = summarizeSong(applied('tracks 1\nlayer 1 2 gain 45\nlayer 1 3 gain 40\nC-4\n'));
    expect(shaped.advisories.join('\n')).not.toContain('full gain');
  });

  it('warns when a fader and a stack add up past full scale', () => {
    // The observation above covers three-or-more layers all at full gain; this one
    // catches the shapes it cannot — two layers at full, or a stack with one layer
    // turned down — because the fader and the layer gains MULTIPLY.
    const two = summarizeSong(applied('tracks 1\nlayer 1 2\nC-4\n'));
    expect(two.advisories.join('\n')).toContain('past full scale');
    // One layer at the default fader is exactly full scale, not past it, so a
    // plain channel says nothing — the two observations never both fire, either.
    const plain = summarizeSong(applied('tracks 1\nC-4\n'));
    expect(plain.advisories.join('\n')).not.toContain('past full scale');
    const loud = summarizeSong(applied('tracks 1\nlayer 1 2\nlayer 1 3\nC-4\n'));
    expect(loud.advisories.join('\n')).not.toContain('past full scale');
    // A group fader is part of the same multiplication, so it can rescue a stack.
    const grouped = summarizeSong(applied('bus DRUMS 40\ntracks 1\ntrack 1 bus DRUMS\nlayer 1 2\nC-4\n'));
    expect(grouped.advisories.join('\n')).not.toContain('past full scale');
  });
});

describe('a stack travels', () => {
  const STACKED = 'new\nsong "STACKED"\ntracks 2\ntrack 1 "LEAD" voice lead\nlayer 1 2 wave saw detune -9 gain 60\nlayer 1 3 wave saw detune 9 gain 55\n\nC-4 .\nE-4 .\n';

  it('round-trips through the script format', () => {
    const before = applied(STACKED);
    const script = songToScript(before, { volume: null });
    // Written as one short line per layer, each saying only what differs.
    expect(script).toContain('layer 1 2');
    expect(script).toContain('wave sawtooth');
    expect(script).toContain('detune -9');
    const after = applied(script);
    expect(after.tracks[0].stack).toEqual(before.tracks[0].stack);
    expect(after.tracks[0].voice).toEqual(before.tracks[0].voice);
  });

  it('writes a bare line for a layer that is a plain copy', () => {
    const song = applied('tracks 1\nlayer 1 2\nC-4\n');
    expect(songToScript(song, { volume: null })).toContain('layer 1 2\n');
    // ...and reading it back is the same instruction: make another copy.
    const again = applied(songToScript(song, { volume: null }));
    expect(again.tracks[0].stack).toEqual(song.tracks[0].stack);
  });

  it('round-trips through the song file, at the stack version', () => {
    const before = applied(STACKED);
    const json = songToJson(before, { volume: null });
    expect(JSON.parse(json).version).toBe(STACK_SONG_FILE_VERSION);
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(`expected the file to read back: ${parsed.errors.join(' / ')}`);
    expect(parsed.song.tracks[0].stack).toEqual(before.tracks[0].stack);
    expect(parsed.song.tracks[1].stack).toEqual([]);
  });

  it('refuses a stack it cannot hold rather than opening a thinner song', () => {
    const file = JSON.parse(songToJson(applied(STACKED), { volume: null }));
    const tooMany = Array.from({ length: MAX_EXTRA_LAYERS + 1 }, () => ({ wave: 'sawtooth' }));
    file.tracks[0].stack = tooMany;
    const parsed = songFromJson(JSON.stringify(file));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join('\n')).toContain(`layer`);

    const notALayer = JSON.parse(songToJson(applied(STACKED), { volume: null }));
    notALayer.tracks[0].stack = [42];
    expect(songFromJson(JSON.stringify(notALayer)).ok).toBe(false);

    const noWave = JSON.parse(songToJson(applied(STACKED), { volume: null }));
    noWave.tracks[0].stack = [{ octave: 1 }];
    expect(songFromJson(JSON.stringify(noWave)).ok).toBe(false);
  });

  it('clamps a layer knob rather than refusing the whole file', () => {
    const file = JSON.parse(songToJson(applied(STACKED), { volume: null }));
    file.tracks[0].stack[0].bright = 140;
    file.tracks[0].stack[0].octave = 99;
    const parsed = songFromJson(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].stack[0].bright).toBe(100);
    expect(parsed.song.tracks[0].stack[0].octave).toBe(4);
  });
});

describe('the vocabulary a consumer reads', () => {
  it('publishes the stack and its fields', async () => {
    const { instrumentCatalog } = await import('../model/catalog');
    const catalog = instrumentCatalog();
    expect(catalog.layers.max).toBe(MAX_LAYERS);
    expect(catalog.layers.maxExtra).toBe(MAX_EXTRA_LAYERS);
    expect(catalog.layers.blurb.length).toBeGreaterThan(20);
    expect(catalog.layers.fields.map((field) => field.id)).toEqual(['octave', 'detune', 'gain']);
    for (const field of catalog.layers.fields) {
      expect(field.blurb.length).toBeGreaterThan(20);
      expect(field.min).toBeLessThan(field.max);
    }
  });

  it('keeps the default voice out of the way of the new fields', () => {
    // `gain` and `detune` mean a LAYER's level and tuning; the voice has neither,
    // so a plain voice must not have picked up a field it does not own.
    expect(Object.keys(DEFAULT_VOICE)).not.toContain('gain');
    expect(Object.keys(DEFAULT_VOICE)).not.toContain('detune');
  });
});

describe('a saved sound that is more than a voice', () => {
  /** A layer with the numbers a supersaw needs, on top of a plain voice's shape. */
  const saw = (detune: number): Layer => ({
    ...layerAt(plainTrack('pad'), 1)!,
    wave: 'sawtooth',
    detune,
    gain: 55,
  });

  /** A sound the user saved under a name: a voice, and whatever came with it. */
  const mine = (name: string, stack: Layer[] = []): UserVoice => ({
    name,
    params: { ...voiceById('pad')!.params },
    stack,
  });

  /** A channel wearing that sound, for the comparisons and the chip label. */
  const wearing = (library: UserVoice[]): Track => {
    const track = createSong().tracks[0];
    track.voice = { ...voiceById('pad')!.params };
    track.stack = library[0].stack.map((layer) => ({ ...layer }));
    return track;
  };

  it('round-trips its layers through the library', () => {
    const library = withUserVoice([], mine('SUPERSAW', [saw(-11), saw(12)]));
    expect(library[0].stack).toHaveLength(2);
    expect(library[0].stack.map((layer) => layer.detune)).toEqual([-11, 12]);
    expect(library[0].stack[0].gain).toBe(55);
  });

  it('copies the layers, so editing the song cannot reach back into the library', () => {
    const layers = [saw(-11)];
    const library = withUserVoice([], mine('MINE', layers));
    layers[0].detune = 40;
    expect(library[0].stack[0].detune).toBe(-11);
  });

  it('reads its own layers back out of storage, and clamps them', () => {
    const read = parseUserVoices([{
      name: 'MINE',
      params: voiceById('pad')!.params,
      stack: [{ wave: 'sawtooth', detune: -999, gain: 400, octave: 12 }],
    }]);
    expect(read[0].stack[0].detune).toBe(-100);
    expect(read[0].stack[0].gain).toBe(100);
    expect(read[0].stack[0].octave).toBe(4);
  });

  it('keeps a sound whose layers are unreadable, minus the layers', () => {
    // A stack is an addition to a sound rather than a thing that can invalidate
    // it, so the lenient reader drops what it cannot read and keeps the voice.
    const read = parseUserVoices([{ name: 'MINE', params: voiceById('pad')!.params, stack: 'not a list' }]);
    expect(read).toHaveLength(1);
    expect(read[0].stack).toEqual([]);
  });

  it('cannot hold more layers than a channel can play', () => {
    const read = parseUserVoices([{
      name: 'MINE',
      params: voiceById('pad')!.params,
      stack: Array.from({ length: 9 }, () => ({ wave: 'sawtooth' })),
    }]);
    expect(read[0].stack).toHaveLength(MAX_EXTRA_LAYERS);
  });

  it('is found by its whole sound, not by whichever voice shares its first layer', () => {
    const library = [mine('SUPERSAW', [saw(-11)])];
    const stacked = wearing(library);
    expect(sameSound(stacked, savedSound(library[0]))).toBe(true);
    expect(soundMatchesSaved(stacked, library[0])).toBe(true);
    // ...and the same voice with no layers is NOT that sound.
    const bare = createSong().tracks[0];
    bare.voice = { ...voiceById('pad')!.params };
    expect(soundMatchesSaved(bare, library[0])).toBe(false);
  });

  it('names the channel row after the sound, and marks how thick it is', () => {
    const library = [mine('SUPERSAW', [saw(-11)])];
    const stacked = wearing(library);
    expect(soundShortLabel(stacked, library)).toBe('SUP');
    expect(savedStackChip(library[0])).toBe('+1');
    // With no library in scope it falls back to its VOICE's waveform — the same
    // shorthand the chip has always shown — and the layer count is said by the
    // `+1` beside it rather than squeezed into the same three characters.
    expect(soundShortLabel(stacked, [])).toBe('SIN');
    // A plain saved sound is unmarked: there is nothing more than its voice.
    expect(savedStackChip(mine('PLAIN'))).toBe('');
  });

  it('is applied by a script as its whole self, layers and all', () => {
    const library = [mine('SUPERSAW', [saw(-11), saw(12)])];
    const result = applyScript(createSong(), 'track 1 "LEAD" voice SUPERSAW', library);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' / '));
    expect(result.song.tracks[0].stack.map((layer) => layer.detune)).toEqual([-11, 12]);
    expect(result.song.tracks[0].voice.wave).toBe(voiceById('pad')!.params.wave);
  });

  it('leaves a stack alone when a BUILT-IN voice is named, as it always did', () => {
    // The inert half of the rule: a preset is one voice, so `voice pad` is the
    // line it has always been and cannot reach a stack that is already there.
    const song = applied('layer 1 2 detune -11\ntrack 1 voice pad');
    expect(song.tracks[0].stack).toHaveLength(1);
    expect(song.tracks[0].voice.bright).toBe(voiceById('pad')!.params.bright);
  });

  it('leaves a stack alone when a PLAIN saved sound is named, and replaces it with a stack', () => {
    const plain = [mine('MYPLAIN')];
    const result = applyScript(createSong(), 'layer 1 2 detune -11\ntrack 1 voice MYPLAIN', plain);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' / '));
    // Saved before layers could be saved, so it has none to hand over.
    expect(result.song.tracks[0].stack).toHaveLength(1);
  });
});
