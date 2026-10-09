import { describe, expect, it } from 'vitest';

import { decodeWav, encodeWav, monoPcm, type PcmAudio } from '../audio/wav';
import { buildNote, sampleFor } from '../audio/synth';
import { patchFromVoice } from '../model/instrument';
import {
  addSample,
  isSampleName,
  makeSample,
  MAX_SAMPLE_NAME,
  MAX_SAMPLES,
  NO_SAMPLES,
  removeSample,
  sampleByName,
  sampleLabel,
  sampleNameProblem,
  sampleRows,
  sampleSeconds,
  SAMPLE_FILE_EXTENSIONS,
  SAMPLE_ROOT_HZ,
  tidySampleName,
  type Sample,
} from '../model/sample';
import { applyScript } from '../model/script';
import {
  DRUM_SONG_FILE_VERSION,
  SAMPLE_SONG_FILE_VERSION,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  parseSongFile,
  songFromJson,
  songToJson,
  songToScript,
} from '../model/songfile';
import { createSong } from '../model/song';
import { DEFAULT_VOICE } from '../model/voice';

/**
 * The sample bank, the WAV reader behind it, and the name a song writes.
 *
 * Three questions, tested where they can be asked separately: does the reader
 * read the FORMAT (checked against bytes rather than against the encoder), does
 * the bank keep the invariant a song depends on (a name is a word, the bank is
 * capped, and a name it does not have resolves to nothing rather than to an
 * error), and does the reference survive a save and a load.
 *
 * The last one is the one worth being loud about: a song holds a NAME, never the
 * audio. So the test that a channel naming a recording this machine does not have
 * still plays — through the built-in one-shot, exactly as before the line existed
 * — is the whole reason the design is a reference in the first place.
 */

// --- a tiny WAV, by hand -----------------------------------------------------

/** A WAV built byte by byte, so the reader is tested against the FORMAT. */
function wavBytes(options: {
  format?: number;
  bits?: number;
  channels?: number;
  rate?: number;
  frames: number[];
  dataOf?: (view: DataView, offset: number, value: number) => void;
  extraChunk?: boolean;
  container?: string;
}): ArrayBuffer {
  const {
    format = 1, bits = 16, channels = 1, rate = 44100, frames,
    dataOf = (view, offset, value) => view.setInt16(offset, value, true),
    extraChunk = false,
    container = 'RIFF',
  } = options;
  const bytesPerSample = bits / 8;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames.length * bytesPerSample;
  // A `LIST` chunk with an ODD payload, so the padding rule is exercised: a
  // reader that steps by the chunk size alone lands one byte into the audio.
  const pads = extraChunk ? 8 + 3 + 1 : 0;
  const buffer = new ArrayBuffer(44 + pads + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, container);
  view.setUint32(4, 36 + pads + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true);
  let at = 36;
  if (extraChunk) {
    ascii(36, 'LIST');
    view.setUint32(40, 3, true);
    ascii(44, 'abc');
    at = 44 + 3 + 1; // an odd chunk carries a pad byte
  }
  ascii(at, 'data');
  view.setUint32(at + 4, dataBytes, true);
  let offset = at + 8;
  for (const value of frames) {
    dataOf(view, offset, value);
    offset += bytesPerSample;
  }
  return buffer;
}

describe('reading a WAV', () => {
  it('reads back what the encoder wrote, rate and all', () => {
    const pcm: PcmAudio = {
      channels: [Float32Array.from([0, 0.5, -0.5, 1])],
      sampleRate: 22050,
    };
    const read = decodeWav(encodeWav(pcm));
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error(read.error);
    expect(read.pcm.sampleRate).toBe(22050);
    expect(read.pcm.channels).toHaveLength(1);
    // Close to, not equal: 16-bit is a quantisation, and +1 has one step less
    // headroom than -1 (see `toInt16` in `audio/wav.ts`), so full scale reads
    // back as 32767/32768. A test that insisted on 1.0 would be a test of the
    // encoder's rounding rather than of the reader.
    const mono = read.pcm.channels[0];
    expect(mono[0]).toBe(0);
    expect(mono[1]).toBeCloseTo(0.5, 4);
    expect(mono[2]).toBeCloseTo(-0.5, 4);
    expect(mono[3]).toBeCloseTo(1, 4);
  });

  it('de-interleaves the sides of a stereo file', () => {
    const pcm: PcmAudio = {
      channels: [Float32Array.from([1, 1, 0, 0]), Float32Array.from([0, 0, 1, 1])],
      sampleRate: 44100,
    };
    const read = decodeWav(encodeWav(pcm));
    if (!read.ok) throw new Error(read.error);
    expect(read.pcm.channels[0].length).toBe(4);
    // Left is loud for two frames then silent, right the other way round: a
    // reader that forgot the interleave order would give two identical sides.
    expect(Array.from(read.pcm.channels[0]).map((value) => Math.round(value))).toEqual([1, 1, 0, 0]);
    expect(Array.from(read.pcm.channels[1]).map((value) => Math.round(value))).toEqual([0, 0, 1, 1]);
  });

  it('reads 8-bit PCM as UNSIGNED, which is what 8-bit PCM is', () => {
    const bytes = wavBytes({
      bits: 8,
      frames: [0, 128, 255],
      dataOf: (view, offset, value) => view.setUint8(offset, value),
    });
    const read = decodeWav(bytes);
    if (!read.ok) throw new Error(read.error);
    const mono = read.pcm.channels[0];
    expect(mono[0]).toBe(-1);
    expect(mono[1]).toBe(0);
    expect(mono[2]).toBeCloseTo(1, 1);
  });

  it('reads 24-bit and 32-bit float files too', () => {
    // 24-bit needs three bytes a sample, which the helper's 16-bit writer cannot
    // produce, so one frame is written by hand into a normal two-frame file: a
    // half of full scale, little end first.
    const twentyFour = wavBytes({ bits: 24, frames: [0, 0] });
    const view = new DataView(twentyFour);
    view.setUint8(44, 0x00); view.setUint8(45, 0x00); view.setUint8(46, 0x40);
    const read24 = decodeWav(twentyFour);
    if (!read24.ok) throw new Error(read24.error);
    expect(read24.pcm.channels[0][0]).toBeCloseTo(0.5, 6);
    expect(read24.pcm.channels[0][1]).toBe(0);

    const float = wavBytes({
      format: 3,
      bits: 32,
      frames: [0, 0],
      dataOf: (v, offset, value) => v.setFloat32(offset, value, true),
    });
    new DataView(float).setFloat32(44, -0.25, true);
    const readFloat = decodeWav(float);
    if (!readFloat.ok) throw new Error(readFloat.error);
    expect(readFloat.pcm.channels[0][0]).toBeCloseTo(-0.25, 6);
  });

  it('walks the chunks rather than assuming the audio starts at byte 44', () => {
    const bytes = wavBytes({ frames: [1000, 2000], extraChunk: true });
    const read = decodeWav(bytes);
    if (!read.ok) throw new Error(read.error);
    expect(read.pcm.channels[0][0]).toBeCloseTo(1000 / 32768, 6);
    expect(read.pcm.channels[0][1]).toBeCloseTo(2000 / 32768, 6);
  });

  it('refuses what it cannot read, and says which thing is wrong', () => {
    const text = new TextEncoder().encode('this is not a wav at all, sorry').buffer;
    expect(decodeWav(text).ok).toBe(false);
    expect(decodeWav(wavBytes({ frames: [1], container: 'RIFX' }))).toMatchObject({
      ok: false, error: expect.stringContaining('big endian'),
    });
    expect(decodeWav(wavBytes({ format: 2, frames: [1] }))).toMatchObject({
      ok: false, error: expect.stringContaining('ADPCM'),
    });
    // 12-bit is a real format and not a real byte layout, so the field is patched
    // rather than written: what is being tested is the READER's refusal.
    const twelve = wavBytes({ frames: [1] });
    new DataView(twelve).setUint16(34, 12, true);
    expect(decodeWav(twelve)).toMatchObject({
      ok: false, error: expect.stringContaining('12-bit'),
    });
    // A `data` chunk with nothing in it, and then no `data` chunk at all: two
    // different sentences, because they are two different files to fix.
    expect(decodeWav(wavBytes({ frames: [] }))).toMatchObject({
      ok: false, error: expect.stringContaining('data chunk is empty'),
    });
    const headerOnly = wavBytes({ frames: [1] });
    const rename = new DataView(headerOnly);
    for (const [i, ch] of Array.from('note').entries()) rename.setUint8(36 + i, ch.charCodeAt(0));
    expect(decodeWav(headerOnly)).toMatchObject({
      ok: false, error: expect.stringContaining('no "data" chunk'),
    });
  });

  it('folds a stereo file to one channel without losing either side', () => {
    const pcm: PcmAudio = {
      channels: [Float32Array.from([1, 0]), Float32Array.from([0, 1])],
      sampleRate: 44100,
    };
    expect(Array.from(monoPcm(pcm))).toEqual([0.5, 0.5]);
    // Mono comes back as the same array: the common case costs nothing.
    const mono: PcmAudio = { channels: [Float32Array.from([0.5])], sampleRate: 44100 };
    expect(monoPcm(mono)).toBe(mono.channels[0]);
  });
});

// --- the bank ----------------------------------------------------------------

/** A sample of the given length, all one easy value. */
function tone(name: string, frames = 4410, rate = 44100): Sample {
  const made = makeSample(name, rate, new Float32Array(frames).fill(0.25));
  if (!made.ok) throw new Error(made.error);
  return made.sample;
}

describe('the sample bank', () => {
  it('is a list of names, each one a word', () => {
    expect(isSampleName('BRK02')).toBe(true);
    expect(isSampleName('my_break-01')).toBe(true);
    expect(isSampleName('')).toBe(false);
    expect(isSampleName('02brk')).toBe(false);
    expect(isSampleName('my break')).toBe(false);
    expect(isSampleName('a'.repeat(MAX_SAMPLE_NAME + 1))).toBe(false);
    expect(sampleNameProblem('02brk')).toContain('a letter, then letters');
    expect(sampleNameProblem('my break')).toContain('A space ends the name');
    // Tidying is what a picked FILE name goes through: `My Break 01.wav` has to
    // become something a track line can write.
    expect(tidySampleName('  My Break 01  ')).toBe('My-Break-01');
  });

  it('refuses a recording that is empty, a click, or a whole track', () => {
    expect(makeSample('X', 44100, new Float32Array(0))).toMatchObject({ ok: false });
    expect(makeSample('X', 0, new Float32Array(1000))).toMatchObject({
      ok: false, error: expect.stringContaining('what rate'),
    });
    expect(makeSample('X', 44100, new Float32Array(10))).toMatchObject({
      ok: false, error: expect.stringContaining('at least 20ms'),
    });
    expect(makeSample('X', 44100, new Float32Array(44100 * 31))).toMatchObject({
      ok: false, error: expect.stringContaining('up to 30s'),
    });
    expect(makeSample('02brk', 44100, new Float32Array(1000))).toMatchObject({ ok: false });
  });

  it('finds a name in any case, and holds one recording per name', () => {
    const bank = [tone('BRK02'), tone('HOOK')];
    expect(sampleByName(bank, 'brk02')?.name).toBe('BRK02');
    expect(sampleByName(bank, 'nope')).toBeNull();
    expect(sampleByName(bank, null)).toBeNull();
    const replaced = addSample(bank, tone('brk02', 8820));
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) throw new Error(replaced.error);
    expect(replaced.replaced).toBe(true);
    expect(replaced.bank).toHaveLength(2);
    expect(sampleSeconds(replaced.bank[0])).toBeCloseTo(0.2, 6);
    // And a name that is not there loads as a NEW one.
    const added = addSample(bank, tone('SNARE'));
    if (!added.ok) throw new Error(added.error);
    expect(added.replaced).toBe(false);
    expect(added.bank).toHaveLength(3);
  });

  it('is capped, and says so rather than dropping the oldest', () => {
    let bank: Sample[] = [];
    for (let i = 0; i < MAX_SAMPLES; i++) {
      const out = addSample(bank, tone(`S${i}`));
      if (!out.ok) throw new Error(out.error);
      bank = out.bank;
    }
    expect(addSample(bank, tone('ONE-TOO-MANY'))).toMatchObject({
      ok: false, error: expect.stringContaining('the sample bank is full'),
    });
    // Loading over one of them still works, which is the way out.
    expect(addSample(bank, tone('S0')).ok).toBe(true);
    expect(removeSample(bank, 's1')).toHaveLength(MAX_SAMPLES - 1);
    // The label a status line prints, and the rows the menu draws: one place
    // builds both, so the menu cannot describe a recording differently from the
    // sentence that just loaded it.
    expect(sampleLabel(tone('BRK02'))).toBe('BRK02  \u00b7  0.10s  \u00b7  44.1kHz  \u00b7  mono');
    const rows = sampleRows([tone('BRK02'), tone('hooK')], 'brk02');
    expect(rows.map((row) => [row.name, row.active])).toEqual([['BRK02', true], ['HOOK', false]]);
    expect(rows[1].meta).toBe('0.10s  \u00b7  44.1kHz  \u00b7  mono');
    expect(sampleRows(NO_SAMPLES, 'BRK02')).toEqual([]);
    expect(SAMPLE_FILE_EXTENSIONS).toContain('.wav');
    expect(SAMPLE_ROOT_HZ).toBeGreaterThan(0);
    expect(NO_SAMPLES).toHaveLength(0);
  });
});

// --- the language and the file ----------------------------------------------

/** Apply a script, insisting it worked. */
function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join(' / '));
  return result;
}

describe('a channel names a recording', () => {
  it('is a setting on the track line, and the song has none by default', () => {
    const song = createSong();
    expect(song.tracks.every((track) => track.sample === null)).toBe(true);
    const on = applied('tracks 2\ntrack 2 "HOOK" wave sample sample BRK02\n').song;
    expect(on.tracks[1].sample).toBe('BRK02');
    expect(on.tracks[0].sample).toBeNull();
    // `sample none` takes it back off, exactly like `bus none` — applied to the
    // song that has one, because a second `sample` on the same line is read
    // right-to-left like every other setting and the leftmost one wins.
    const off = applyScript(on, 'track 2 sample none\n');
    expect(off.ok).toBe(true);
    if (!off.ok) throw new Error(off.errors.map((error) => error.message).join(' / '));
    expect(off.song.tracks[1].sample).toBeNull();
  });

  it('refuses a name that is not a word, and leaves the song alone', () => {
    const song = createSong();
    const result = applyScript(song, 'tracks 2\ntrack 2 "HOOK" sample 02brk\n');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.errors[0].message).toContain('sample needs a name');
    expect(song.tracks[1].sample).toBeNull();
    // The bare setting word gets its own hint, which is the one that teaches the
    // shape of the line rather than the shape of a name.
    const bare = applyScript(song, 'tracks 2\ntrack 2 "HOOK" sample\n');
    expect(bare.ok).toBe(false);
    if (bare.ok) throw new Error('expected a refusal');
    expect(bare.errors[0].message).toContain('sample needs the name of a recording YOU have loaded');
  });

  it('checks the NAME and never the bank, because the bank is the app\u2019s', () => {
    // BRK02 is in no bank this test has: the line still applies. That is what
    // makes a song portable — a name this machine cannot supply is a missing
    // FLAVOUR rather than a broken file — so it is worth a test of its own.
    const song = applied('tracks 2\ntrack 2 "HOOK" wave sample sample BRK02\n').song;
    expect(song.tracks[1].sample).toBe('BRK02');
    expect(sampleByName(NO_SAMPLES, song.tracks[1].sample)).toBeNull();
  });

  it('brings a recording in with `sample load` or `sample import`', () => {
    const loaded = applied('sample load "samples/break.wav"\n');
    expect(loaded.settings.sampleLoad).toBe('samples/break.wav');
    const picked = applied('sample import\n');
    expect(picked.settings.sampleImport).toBe(true);
    // And the two are statements, not channel settings: the wrong word says which
    // two it wanted and where a channel's own name goes.
    const bad = applyScript(createSong(), 'sample BRK02\n');
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error('expected a refusal');
    expect(bad.errors[0].message).toContain('To give a CHANNEL one');
  });

  it('keeps the reference through the file, in both formats', () => {
    const song = applied('tracks 2\ntrack 2 "HOOK" wave sample sample BRK02\n').song;
    const plain = JSON.parse(songToJson(song)) as Record<string, unknown>;
    expect(plain.version).toBe(SAMPLE_SONG_FILE_VERSION);
    expect(SAMPLE_SONG_FILE_VERSION).toBeGreaterThan(DRUM_SONG_FILE_VERSION);
    // The newest version this build reads is whatever the latest feature made it,
    // so this asserts the ORDER rather than one number that keeps moving.
    expect(SONG_FILE_VERSION_MAX).toBeGreaterThanOrEqual(SAMPLE_SONG_FILE_VERSION);
    // A song that names no sample still writes the version it always wrote, and
    // says nothing about samples at all.
    const bare = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    expect(bare.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(bare)).not.toContain('sample');

    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error(back.errors.join(' / '));
    expect(back.song.tracks[1].sample).toBe('BRK02');
    // And the script writes the name on the channel's own line.
    const script = songToScript(song);
    expect(script).toContain('sample BRK02');
    const reparsed = parseSongFile(script);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) throw new Error(reparsed.errors.join(' / '));
    expect(reparsed.song.tracks[1].sample).toBe('BRK02');
  });

  it('refuses a file whose name could never be written on a line', () => {
    const file = JSON.parse(songToJson(createSong())) as { tracks: Record<string, unknown>[] };
    file.tracks[0].sample = '02 brk';
    const broken = songFromJson(JSON.stringify(file));
    expect(broken.ok).toBe(false);
    if (broken.ok) throw new Error('expected a refusal');
    expect(broken.errors.join(' ')).toContain('must be the name of a recording');
    // A name the FILE cannot check is not refused at all: only the spelling is.
    // Whether this machine has `SOMEBODY-ELSES` is the app's business, and a song
    // written elsewhere has to open here.
    const stranger = JSON.parse(songToJson(createSong())) as { tracks: Record<string, unknown>[] };
    stranger.tracks[0].sample = 'SOMEBODY-ELSES';
    const read = songFromJson(JSON.stringify(stranger));
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error(read.errors.join(' / '));
    expect(read.song.tracks[0].sample).toBe('SOMEBODY-ELSES');
  });
});

// --- the audio side ----------------------------------------------------------

const DESTINATION = { connect: () => DESTINATION } as unknown as AudioNode;

/** A context that records what was asked of it, and the buffers it made. */
const fake = (() => {
  const sources: {
    loop: boolean;
    buffer: { data: Float32Array } | null;
    playbackRate: { value: number };
  }[] = [];
  const buffers: { rate: number; data: Float32Array }[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime(v: number) { this.value = v; return this; },
    linearRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
    cancelScheduledValues() { return this; },
  });
  const ctx = {
    sampleRate: 44100,
    createBuffer(_channels: number, length: number, rate = 44100) {
      const data = new Float32Array(length);
      const buffer = { length, rate, data, getChannelData: () => data };
      buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      const src = {
        loop: false,
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
    createGain() { return { gain: param(), connect() { return this; }, disconnect() {} }; },
    createBiquadFilter() { return { type: 'lowpass', frequency: param(), Q: param(), connect() { return this; } }; },
    createOscillator() { return { type: 'sine', frequency: param(), detune: param(), connect() { return this; }, start() {}, stop() {} }; },
    createPeriodicWave() { return {}; },
  };
  return { ctx, sources, buffers };
})();

describe('the engine plays your recording', () => {
  it('plays it from the file\u2019s own frames, at the rate the note asks for', () => {
    const mine = tone('BRK02', 2205, 22050);
    const patch = patchFromVoice({ ...DEFAULT_VOICE, wave: 'sample', duty: 0 });
    fake.sources.length = 0;
    // A C-4 is the root the app assumes, so the file plays as recorded; an octave
    // up plays it twice as fast, which is what "play it pitched" means. The
    // BUFFER stays at the file's own rate, so the browser resamples rather than
    // the app pretending a 22.05 kHz recording was made at 44.1.
    for (const [midi, rate] of [[60, 1], [72, 2]] as const) {
      buildNote(
        fake.ctx as unknown as BaseAudioContext,
        patch, midi, 0, 0.5, DESTINATION, null,
        { sample: mine },
      );
      const buffer = fake.sources.at(-1)!.buffer as unknown as { rate: number; data: Float32Array };
      expect(buffer.rate).toBe(22050);
      expect(buffer.data[0]).toBeCloseTo(0.25, 6);
      expect(fake.sources.at(-1)!.playbackRate.value).toBeCloseTo(rate, 2);
    }
  });

  it('falls back to the built-in one-shot when the bank has no such name', () => {
    fake.sources.length = 0;
    buildNote(
      fake.ctx as unknown as BaseAudioContext,
      patchFromVoice({ ...DEFAULT_VOICE, wave: 'sample', duty: 50 }),
      60, 0, 0.5, DESTINATION, null,
      { sample: null },
    );
    const buffer = fake.sources[0]!.buffer as unknown as { data: Float32Array };
    const banked = sampleFor(50).render(44100).slice(0, buffer.data.length);
    expect(Array.from(buffer.data.slice(0, 16))).toEqual(Array.from(banked.slice(0, 16)));
  });
});


