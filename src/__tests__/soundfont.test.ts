import { describe, expect, it } from 'vitest';

import {
  buildNote,
  FONT_GUARD_STAGES,
  fontSampleBuffer,
  prepareFontVoice,
  sampleFor,
  sampleRateFor,
} from '../audio/synth';
import {
  createSong,
  DEFAULT_VOICE,
  describeFont,
  isPercussionPreset,
  kitFor,
  MAX_FONT_PRESETS,
  patchFromVoice,
  PERCUSSION_BANK,
  presetFor,
  presetIndexFor,
  readSoundFont,
  SOUNDFONT_FILE_EXTENSIONS,
  slotCountFor,
  WAVE_LABELS,
  waveForTrack,
  waveFromName,
  zoneForNote,
  type VoiceParams,
} from '../model';
import { midiToFreq } from '../model/notes';
import { applyScript } from '../model/script';
import { songFromJson, songToJson, songToScript } from '../model/songfile';

/**
 * Soundfonts: somebody else's recordings, read out of an SF2 file.
 *
 * The bytes here are BUILT BY HAND in this file rather than checked in as a
 * fixture, so the reader is tested against the FORMAT rather than against itself.
 * That matters more than usual for this one: an SF2 is a `RIFF` container with a
 * database of `bag`/`gen` tables inside it, and a reader with a wrong offset would
 * still parse a fixture it had produced.
 *
 * The font below is deliberately small but complete — two presets, three samples,
 * a key range at each level, a loop — because those are the five things the
 * reader claims to understand (see `model/soundfont.ts`).
 */

// --- building an SF2 by hand ------------------------------------------------

function tag(text: string): Uint8Array {
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) out[i] = text.charCodeAt(i);
  return out;
}

/** Plain ASCII, for the text a soundfont carries (names, mostly). */
function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

/** A bag table's byte body, from the generator index each of its rows points at. */
function bags(...generatorIndexes: number[]): Uint8Array {
  return concat(...generatorIndexes.map((index) => new Row().u16(index).u16(0).bytes()));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/** A `RIFF` chunk. The declared length excludes the pad the format adds. */
function chunk(id: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length + (body.length % 2));
  out.set(tag(id), 0);
  new DataView(out.buffer).setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}

function list(kind: string, ...chunks: Uint8Array[]): Uint8Array {
  return chunk('LIST', concat(tag(kind), ...chunks));
}

/** A little-endian row writer, so a `phdr` row reads as the fields it has. */
class Row {
  private readonly out: number[] = [];

  u8(value: number): this { this.out.push(value & 0xff); return this; }
  u16(value: number): this { this.out.push(value & 0xff, (value >> 8) & 0xff); return this; }
  u32(value: number): this { this.out.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff); return this; }
  i8(value: number): this { return this.u8(value); }
  i16(value: number): this { return this.u16(value); }

  /** A fixed 20-byte name field, NUL-padded. */
  name(text: string): this {
    for (let i = 0; i < 20; i++) this.out.push(i < text.length ? text.charCodeAt(i) : 0);
    return this;
  }

  zeros(count: number): this {
    for (let i = 0; i < count; i++) this.out.push(0);
    return this;
  }

  bytes(): Uint8Array { return Uint8Array.from(this.out); }
}

/** A 4-byte generator record: an opcode and its amount. */
function gen(opcode: number, amount: number): Uint8Array {
  return new Row().u16(opcode).i16(amount).bytes();
}

/** A key range generator, which carries two bytes rather than a word. */
function keyRange(low: number, high: number): Uint8Array {
  return new Row().u16(43).u8(low).u8(high).bytes();
}

const GEN_INSTRUMENT = 41;
const GEN_SAMPLE_ID = 53;
const GEN_SAMPLE_MODES = 54;
const GEN_FINE_TUNE = 52;
const SAMPLE_RATE = 44100;

/** One recorded frame run, as 16-bit PCM. */
function sine(frames: number, hz: number): Int16Array {
  const out = new Int16Array(frames);
  for (let i = 0; i < frames; i++) out[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE) * 20000);
  return out;
}

/**
 * The test font: PIANO (two samples split at middle C) and LOOPY (one looped
 * sample), with a preset-level key range narrowing PIANO, so the intersection of
 * the two levels is exercised rather than assumed.
 */
function testFont(): Uint8Array {
  const pianoLow = sine(100, 440);   // root 69 (A4), answers keys 0..59
  const pianoHigh = sine(100, 220);  // root 57 (A3), answers keys 60..70
  const looped = sine(200, 110);     // root 45 (A2), loops, answers every key
  const pcm = concat(new Uint8Array(pianoLow.buffer), new Uint8Array(pianoHigh.buffer), new Uint8Array(looped.buffer));

  const info = list('INFO', chunk('INAM', concat(ascii('Test Font'), new Uint8Array(1))));
  const sdta = list('sdta', chunk('smpl', pcm));

  // Presets: PIANO's zone answers keys 0..70 and plays instrument 0; LOOPY's
  // answers everywhere and plays instrument 1.
  const pgen = concat(
    keyRange(0, 70), gen(GEN_INSTRUMENT, 0),
    gen(GEN_INSTRUMENT, 1),
  );
  const pbag = bags(0, 2, 3);
  const phdr = concat(
    new Row().name('PIANO').u16(0).u16(0).u16(0).zeros(12).bytes(),
    new Row().name('LOOPY').u16(1).u16(0).u16(1).zeros(12).bytes(),
    new Row().name('EOP').u16(0).u16(0).u16(2).zeros(12).bytes(),
  );

  // Instruments: 0 is two zones over samples 0 and 1, 1 is one looped zone.
  const igen = concat(
    keyRange(0, 59), gen(GEN_SAMPLE_ID, 0),
    keyRange(60, 127), gen(GEN_SAMPLE_ID, 1), gen(GEN_FINE_TUNE, 10),
    keyRange(0, 127), gen(GEN_SAMPLE_ID, 2), gen(GEN_SAMPLE_MODES, 1),
  );
  // A bag row per ZONE: PIANO owns zones 0 and 1, LOOPY owns zone 2.
  const ibag = bags(0, 2, 5, 8);
  const inst = concat(
    new Row().name('PIANO').u16(0).bytes(),
    new Row().name('LOOPY').u16(2).bytes(),
    new Row().name('EOI').u16(3).bytes(),
  );

  const shdr = concat(
    // A recording with no loop points (start equals end) plays ONCE.
    new Row().name('piano-low').u32(0).u32(100).u32(0).u32(0).u32(SAMPLE_RATE).u8(69).i8(0).zeros(4).bytes(),
    new Row().name('piano-high').u32(100).u32(200).u32(0).u32(0).u32(SAMPLE_RATE).u8(57).i8(0).zeros(4).bytes(),
    new Row().name('looped').u32(200).u32(400).u32(220).u32(380).u32(SAMPLE_RATE).u8(45).i8(0).zeros(4).bytes(),
    new Row().name('EOS').u32(0).u32(0).u32(0).u32(0).u32(0).u8(0).i8(0).zeros(4).bytes(),
  );

  const pdta = list('pdta',
    chunk('phdr', phdr),
    chunk('pbag', pbag),
    chunk('pmod', new Uint8Array(10)),
    chunk('pgen', pgen),
    chunk('inst', inst),
    chunk('ibag', ibag),
    chunk('imod', new Uint8Array(10)),
    chunk('igen', igen),
    chunk('shdr', shdr),
  );

  return chunk('RIFF', concat(tag('sfbk'), info, sdta, pdta));
}

function read() {
  const result = readSoundFont(testFont());
  if (!result.ok) throw new Error(`expected a readable font, got: ${result.errors.join(' / ')}`);
  return result.font;
}

// --- reading the file -------------------------------------------------------

describe('reading an SF2', () => {
  it('reads the name, the presets and the samples', () => {
    const font = read();
    expect(font.name).toBe('Test Font');
    expect(font.presets.map((preset) => preset.name)).toEqual(['PIANO', 'LOOPY']);
    expect(font.presets.map((preset) => preset.program)).toEqual([0, 1]);
    expect(font.samples.map((sample) => sample.name)).toEqual(['piano-low', 'piano-high', 'looped']);
    expect(font.samples.map((sample) => sample.rootKey)).toEqual([69, 57, 45]);
    expect(font.pcm).toHaveLength(400);
  });

  it('keeps the raw PCM the font holds, un-normalized', () => {
    const font = read();
    // The first frames of the first recording, exactly as they were written.
    const first = sine(100, 440);
    expect(font.pcm[0]).toBe(first[0]);
    expect(font.pcm[25]).toBe(first[25]);
    // A font sounds like ITSELF: nothing is stretched or scaled to a target.
    expect(Math.max(...Array.from(font.pcm, Math.abs))).toBeGreaterThan(15000);
  });

  it('gives each preset the zones its key ranges describe', () => {
    const font = read();
    const [piano, loopy] = font.presets;
    expect(piano.zones).toHaveLength(2);
    expect(piano.zones.map((zone) => [zone.keyLow, zone.keyHigh, zone.sample])).toEqual([[0, 59, 0], [60, 70, 1]]);
    expect(piano.zones.map((zone) => zone.rootKey)).toEqual([69, 57]);
    // A zone's fine tuning is added to the recording's own correction.
    expect(piano.zones[1].tuneCents).toBe(10);
    expect(loopy.zones).toHaveLength(1);
    expect(loopy.zones[0]).toMatchObject({ keyLow: 0, keyHigh: 127, sample: 2, rootKey: 45, loop: true });
  });

  it('narrows a zone where the PRESET and the instrument disagree', () => {
    const font = read();
    // The instrument says 60..127, the preset says 0..70: the zone answers for the
    // keys both allow, which is what the double indirection in the format means.
    expect(font.presets[0].zones[1].keyHigh).toBe(70);
  });

  it('refuses a file that is not a soundfont, in words', () => {
    const notRiff = readSoundFont(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    expect(notRiff.ok).toBe(false);
    if (!notRiff.ok) expect(notRiff.errors[0]).toContain('RIFF');

    const wrongForm = readSoundFont(chunk('RIFF', concat(tag('WAVE'), new Uint8Array(8))));
    expect(wrongForm.ok).toBe(false);
    if (!wrongForm.ok) expect(wrongForm.errors[0]).toContain('SoundFont');

    expect(readSoundFont(new Uint8Array(4)).ok).toBe(false);
  });

  it('refuses a font with no sample data or no tables', () => {
    const noSamples = chunk('RIFF', concat(tag('sfbk'), list('pdta', chunk('phdr', new Uint8Array(38)), chunk('shdr', new Uint8Array(46)))));
    const result = readSoundFont(noSamples);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/sample data|no preset or sample table/);
  });

  it('never throws on a truncated file', () => {
    const full = testFont();
    for (const cut of [20, 60, 120, full.length - 4]) {
      const result = readSoundFont(full.slice(0, cut));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('describes itself in one line', () => {
    expect(describeFont(read())).toBe('2 PRESETS  -  3 SAMPLES');
  });
});

// --- picking a preset and a zone -------------------------------------------

describe('choosing what a note plays', () => {
  it('spreads duty across the font\u2019s presets, clamped at both ends', () => {
    expect(presetIndexFor(0, 2)).toBe(0);
    expect(presetIndexFor(49, 2)).toBe(0);
    expect(presetIndexFor(50, 2)).toBe(1);
    expect(presetIndexFor(100, 2)).toBe(1);
    expect(presetIndexFor(-5, 2)).toBe(0);
    expect(presetIndexFor(500, 2)).toBe(1);
    expect(presetIndexFor(0, 0)).toBe(0);
    expect(presetIndexFor(80, MAX_FONT_PRESETS)).toBeLessThan(MAX_FONT_PRESETS);
  });

  it('picks the preset by duty, and null when the font has none', () => {
    const font = read();
    expect(presetFor(font, 10)?.name).toBe('PIANO');
    expect(presetFor(font, 90)?.name).toBe('LOOPY');
    expect(presetFor({ ...font, presets: [] }, 50)).toBeNull();
  });

  it('finds the drum kit by BANK and counts the slot window separately', () => {
    const font = read();
    // The kit the reader has to be able to find: a percussion preset PAST the
    // presets a `duty` can name — which is exactly Arachno's shape (128 melodic
    // presets first, ten kits after them).
    const kit = { name: 'KIT', bank: PERCUSSION_BANK, program: 0, zones: font.presets[0].zones };
    const melodic = Array.from({ length: MAX_FONT_PRESETS + 2 }, (_, i) => (
      { ...font.presets[0], name: `P${i}`, bank: 0, program: i }
    ));
    const long = { ...font, presets: [...melodic, kit] };
    expect(long.presets.length).toBe(MAX_FONT_PRESETS + 3);
    // The knob names the first 128 and the table holds three more — the shape of
    // a real long font, and the reason `duty` cannot reach the kit.
    expect(slotCountFor(long)).toBe(MAX_FONT_PRESETS);
    expect(presetIndexFor(100, slotCountFor(long))).toBeLessThan(MAX_FONT_PRESETS);
    expect(font.presets.length).toBe(2);
    expect(slotCountFor(font)).toBe(2);
    expect(isPercussionPreset(kit)).toBe(true);
    expect(isPercussionPreset(font.presets[0])).toBe(false);
    expect(kitFor(long)?.name).toBe('KIT');
    expect(kitFor(font)).toBeNull();
  });

  it('plays the font’s own kit for a drum hit, and the duty preset otherwise', () => {
    const font = read();
    const kit = { name: 'KIT', bank: PERCUSSION_BANK, program: 0, zones: font.presets[0].zones };
    const withKit = { ...font, presets: [...font.presets, kit] };
    expect(prepareFontVoice(withKit, 10)?.preset.name).toBe('PIANO');
    expect(prepareFontVoice(withKit, 10, 'kick')?.preset.name).toBe('KIT');
    // A font with no kit falls back to the knob, so a drum channel still sounds
    // rather than going silent — the range guarantee, one scope up.
    expect(prepareFontVoice(font, 10, 'kick')?.preset.name).toBe('PIANO');
  });

  it('plays the zone a key lands in, and the nearest one outside them', () => {
    const zones = read().presets[0].zones;
    expect(zoneForNote(zones, 30)?.sample).toBe(0);
    expect(zoneForNote(zones, 59)?.sample).toBe(0);
    expect(zoneForNote(zones, 60)?.sample).toBe(1);
    expect(zoneForNote(zones, 70)?.sample).toBe(1);
    // Above every range the closest sample is the high one; the range IS the
    // guarantee, so a note outside the map still has to come out as a sound.
    expect(zoneForNote(zones, 110)?.sample).toBe(1);
    expect(zoneForNote([], 60)).toBeNull();
  });

  it('prepares a preset for playback without rendering anything yet', () => {
    const font = read();
    const voice = prepareFontVoice(font, 10);
    expect(voice?.preset.name).toBe('PIANO');
    expect(voice?.zones).toHaveLength(2);
    // The loop points travel with the recording, measured IN the recording: the
    // font's own loop points are indexes into the whole `smpl` run (`200`..`400`
    // here), while the buffer holds only this sample's frames — so 220 is the
    // twentieth frame of a recording 200 frames long, not a second and a half
    // into a fifty-millisecond one.
    const loopy = prepareFontVoice(font, 90);
    expect(loopy?.zones[0].loopStartSeconds).toBeCloseTo(20 / SAMPLE_RATE, 6);
    expect(loopy?.zones[0].loopEndSeconds).toBeCloseTo(180 / SAMPLE_RATE, 6);
    // The invariant that keeps a looped note audible: the loop is inside the
    // recording it is played from. Handed over in absolute frames it lands past
    // the end of the buffer, and Web Audio clamps that to no sound at all.
    const loopyBuffer = fontSampleBuffer(fakeContext(SAMPLE_RATE).ctx as unknown as BaseAudioContext, font, 2);
    expect(loopy!.zones[0].loopStartSeconds).toBeLessThan(loopy!.zones[0].loopEndSeconds);
    expect(loopy!.zones[0].loopEndSeconds).toBeLessThanOrEqual(loopyBuffer.length / SAMPLE_RATE);
    expect(voice?.zones[0].loopEndSeconds).toBe(0);
    expect(prepareFontVoice({ ...font, presets: [] }, 50)).toBeNull();
  });
});

// --- the synthesis ----------------------------------------------------------

interface FakeParam {
  value: number;
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
  setTargetAtTime(v: number, t: number, c: number): void;
}

function param(): FakeParam {
  return {
    value: 0,
    setValueAtTime(v: number) { this.value = v; },
    linearRampToValueAtTime(v: number) { this.value = v; },
    setTargetAtTime() {},
  };
}

function fakeContext(sampleRate = 44100) {
  const sources: { loop: boolean; loopStart: number; loopEnd: number; buffer: { data: Float32Array } | null; playbackRate: FakeParam; detune: FakeParam }[] = [];
  const buffers: { length: number; data: Float32Array }[] = [];
  const filters: { type: string; frequency: FakeParam; Q: FakeParam }[] = [];
  const ctx = {
    sampleRate,
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      const buffer = { length, data, getChannelData: () => data };
      buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      const src = {
        loop: false as boolean,
        loopStart: 0,
        loopEnd: 0,
        buffer: null as { data: Float32Array } | null,
        playbackRate: param(),
        detune: param(),
        connect() { return this; },
        start() {},
        stop() {},
      };
      sources.push(src);
      return src;
    },
    createOscillator() { return { type: 'sine', frequency: param(), detune: param(), setPeriodicWave() {}, connect() { return this; }, start() {}, stop() {} }; },
    createGain() { return { gain: param(), connect() { return this; }, disconnect() {} }; },
    createBiquadFilter() {
      const filter = { type: 'lowpass', frequency: param(), Q: param(), connect() { return this; } };
      filters.push(filter);
      return filter;
    },
    createPeriodicWave() { return {}; },
  };
  return { ctx, sources, buffers, filters };
}

const DESTINATION = { connect() { return this; }, disconnect() {} } as unknown as AudioNode;

function build(voice: VoiceParams, midi = 60, font: ReturnType<typeof read> | null = read()) {
  const fake = fakeContext();
  buildNote(fake.ctx as unknown as BaseAudioContext, patchFromVoice(voice), midi, 0, 1, DESTINATION, null, { font });
  return fake;
}

const fontVoice = (duty: number): VoiceParams => ({ ...DEFAULT_VOICE, wave: 'font', duty });

describe('the engine plays somebody else\u2019s recording', () => {
  it('renders a sample at the context\u2019s rate, interpolating where they differ', () => {
    const font = read();
    const at44 = fakeContext(44100);
    const buffer = fontSampleBuffer(at44.ctx as unknown as BaseAudioContext, font, 0);
    expect(buffer.length).toBe(100);
    // The same recording into a 22.05 kHz context is half as long, so a font saved
    // at one rate still plays in tune in a context at another.
    const at22 = fakeContext(22050);
    expect(fontSampleBuffer(at22.ctx as unknown as BaseAudioContext, font, 0).length).toBe(50);
  });

  it('uses a buffer source pitched by the zone\u2019s root key', () => {
    // Key 50 is in PIANO's lower zone, whose recording sounds at key 69.
    const { sources } = build(fontVoice(10), 50);
    expect(sources).toHaveLength(1);
    expect(sources[0].buffer).not.toBeNull();
    expect(sources[0].playbackRate.value).toBeCloseTo(midiToFreq(50) / midiToFreq(69), 4);
    // An octave up is exactly twice the rate, the way a sampler works. LOOPY has
    // one zone, so the two notes are guaranteed to be the same recording.
    const low = build(fontVoice(90), 60);
    const high = build(fontVoice(90), 72);
    expect(high.sources[0].playbackRate.value / low.sources[0].playbackRate.value).toBeCloseTo(2, 4);
  });

  it('guards a recording played faster than it was made, and only then', () => {
    // LOOPY's one recording sounds at key 45, so a note AT that key is played at
    // the rate it was recorded at: nothing is decimated, so nothing can fold, and
    // the graph is exactly the one this app built before the guard existed.
    const atRoot = build(fontVoice(90), 45);
    // An octave up is played twice as fast, and the top of the recording no longer
    // fits in the output band — Web Audio's playback rate does not filter what it
    // cannot represent, so without a guard that top comes back down as aliasing.
    const octaveUp = build(fontVoice(90), 57);
    expect(octaveUp.filters.length - atRoot.filters.length).toBe(FONT_GUARD_STAGES);
    // The corner is the frequency that WOULD have folded: half the output's
    // Nyquist per unit of rate, so an octave up keeps half as much of the
    // recording's top, and the stages share the one corner rather than staggering.
    for (const guard of octaveUp.filters.slice(-FONT_GUARD_STAGES)) {
      expect(guard.frequency.value).toBeCloseTo(0.5 * SAMPLE_RATE / 2, 5);
    }
    // Four octaves up the guard closes down with the rate: what sixteen times the
    // pitch can carry is a sixteenth of what it could at the root.
    const wayUp = build(fontVoice(90), 45 + 48);
    expect(wayUp.filters[wayUp.filters.length - 1].frequency.value).toBeCloseTo(0.5 * SAMPLE_RATE / 16, 4);
    // BELOW the root it is played slower: interpolated rather than decimated, which
    // has nothing to fold and so pays for no filter at all.
    expect(build(fontVoice(90), 33).filters.length).toBe(atRoot.filters.length);
  });

  it('plays the zone the note lands in, not always the first one', () => {
    const low = build(fontVoice(10), 40);
    const high = build(fontVoice(10), 65);
    expect(low.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(40) / midiToFreq(69), 4);
    // The upper zone is the second recording, whose own tuning is ten cents SHARP,
    // so reaching the same pitch takes a slightly slower playback rate.
    expect(high.sources[0].playbackRate.value).toBeCloseTo(midiToFreq(65) / (midiToFreq(57) * Math.pow(2, 10 / 1200)), 4);
    expect(high.sources[0].playbackRate.value).toBeLessThan(midiToFreq(65) / midiToFreq(57));
  });

  it('loops a looping recording and lets a one-shot ring out', () => {
    // LOOPY's only sample loops; PIANO's do not.
    const looped = build(fontVoice(90), 60);
    expect(looped.sources[0].loop).toBe(true);
    expect(build(fontVoice(10), 60).sources[0].loop).toBe(false);
    // And the loop it is given is INSIDE the buffer it plays: the points in the
    // file are frame indexes into the whole font, so a loop copied over as-is
    // sits past the end of this one recording — which is not a wrong-sounding
    // note but NO note, the failure a song of font channels is hardest to
    // diagnose because the graph above it looks perfectly healthy.
    const buffer = looped.sources[0].buffer;
    expect(buffer).not.toBeNull();
    expect(looped.sources[0].loopStart).toBeGreaterThanOrEqual(0);
    expect(looped.sources[0].loopStart).toBeLessThan(looped.sources[0].loopEnd);
    expect(looped.sources[0].loopEnd).toBeLessThanOrEqual(buffer!.data.length / SAMPLE_RATE);
  });

  it('picks a different recording for a different preset, and caches each', () => {
    const piano = build(fontVoice(10), 60);
    const loopy = build(fontVoice(90), 60);
    expect(Array.from(loopy.buffers[0].data)).not.toEqual(Array.from(piano.buffers[0].data));
    const { ctx } = fakeContext();
    const real = ctx as unknown as BaseAudioContext;
    const font = read();
    // One recording rendered once per context and kept, so a chord on a font does
    // not resample the same piano note eight times.
    expect(fontSampleBuffer(real, font, 1)).toBe(fontSampleBuffer(real, font, 1));
    expect(fontSampleBuffer(real, font, 1)).not.toBe(fontSampleBuffer(real, font, 0));
    // A second context renders its own: a buffer belongs to the context it was
    // made for, so two contexts must not share one.
  });

  it('falls back to the built-in samples when no font is loaded', () => {
    // The range IS the guarantee: a `wave font` channel with no font open still
    // has to sound, and the app's own one-shots are the closest thing to a
    // sampler that always exists.
    const { sources } = build(fontVoice(0), 60, null);
    expect(sources).toHaveLength(1);
    expect(sources[0].buffer).not.toBeNull();
    expect(sources[0].playbackRate.value).toBeCloseTo(sampleRateFor(midiToFreq(60), sampleFor(0).rootHz), 4);
  });

  it('leaves every other wave alone', () => {
    const font = read();
    const { sources } = build({ ...DEFAULT_VOICE, wave: 'triangle' }, 60, font);
    expect(sources).toHaveLength(0);
  });
});

// --- the wave, the language and the files ----------------------------------

describe('font is a wave, but not one a new channel walks', () => {
  it('names it, with the soundfont spellings', () => {
    expect(waveFromName('font')).toBe('font');
    expect(waveFromName('soundfont')).toBe('font');
    expect(waveFromName('sf2')).toBe('font');
    expect(waveFromName('sfz')).toBe('font');
    expect(WAVE_LABELS.font).toBe('FNT');
    // Still the four tonal shapes on a new song: no existing channel changes.
    expect(waveForTrack(4)).toBe('square');
    expect(SOUNDFONT_FILE_EXTENSIONS).toEqual(['.sf2']);
  });

  it('sets the wave from a script, by either spelling', () => {
    const applied = applyScript(createSong(), 'tracks 1\ntrack 1 "PIANO" wave font duty 30');
    if (!applied.ok) throw new Error(applied.errors.map((e) => e.message).join(' / '));
    expect(applied.song.tracks[0].voice.wave).toBe('font');
    expect(applied.song.tracks[0].voice.duty).toBe(30);
    const alias = applyScript(createSong(), 'tracks 1\ntrack 1 "PIANO" wave soundfont');
    if (!alias.ok) throw new Error(alias.errors.map((e) => e.message).join(' / '));
    expect(alias.song.tracks[0].voice.wave).toBe('font');
  });

  it('refuses an unknown wave, listing font among the choices', () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "PIANO" wave wobble');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('font');
  });

  it('round-trips through both formats without carrying the font itself', () => {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'font', duty: 40 };

    const json = songToJson(song);
    expect(json).toContain('"font"');
    // A song says WHICH WAVE, not which font: the megabytes of somebody's
    // recordings stay out of the file, so a song that uses a font is still
    // shareable and still small.
    expect(json).not.toContain('pcm');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.wave).toBe('font');
    expect(parsed.song.tracks[0].voice.duty).toBe(40);

    expect(songToScript(song)).toContain('wave font');
  });
});
