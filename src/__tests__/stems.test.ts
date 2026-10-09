import { describe, expect, it } from 'vitest';

import { crc32, zipStore, type ZipFile } from '../audio/zip';
import { decodeWav, encodeWav, type PcmAudio } from '../audio/wav';
import {
  applyScript,
  createSong,
  SONG_FILE_VERSION,
  STEM_ARCHIVE_EXTENSION,
  STEM_FILE_EXTENSION,
  stemArchiveName,
  stemFileName,
  stemPlan,
  stemRefusal,
  stemTracks,
  songFileStem,
  songFromJson,
  songToJson,
  type Song,
} from '../model';

/**
 * Stems — the naming, the set and the archive.
 *
 * The audio itself cannot be checked here: rendering one channel needs an
 * `OfflineAudioContext`, which a headless runner does not have (the same wall
 * `golden.test.ts` hits, and the reason it hashes the render's INPUT rather than
 * its output). What CAN be checked without a browser is everything around the
 * samples: which channels become files and what they are called, the one
 * refusal, and the ZIP — where a wrong byte is a file that opens in nothing, so
 * the format is tested against its own field layout and one published checksum.
 */

/** A song from a script that must parse, and the source is written by the test. */
function song(source: string): Song {
  const result = applyScript(createSong(), source);
  if (!result.ok) {
    throw new Error(`the fixture does not parse: ${result.errors.map((e) => `${e.line}: ${e.message}`).join(' | ')}`);
  }
  return result.song;
}

/** Three channels, two of them used — the shape most of these tests need. */
const THREE = `new
song "NIGHT BUS"
tempo 120
tracks 3
track 1 "KICK DRUM" voice kick
track 2 "BASS" voice bass
track 3 "PAD" voice pad
pattern 1 "A"
C-1 A-2 .
.   .   .
C-1 .   .
.   .   .
`;

describe('what a stem is called', () => {
  it('numbers the channel, then names it', () => {
    expect(stemFileName('night-bus', 1, 'KICK DRUM')).toBe('night-bus-01-kick-drum.wav');
    expect(stemFileName('night-bus', 3, 'PAD')).toBe('night-bus-03-pad.wav');
  });

  it('pads the number so a listing sorts like the song', () => {
    // The reason the number is padded: `01` before `10` in every file browser,
    // which is the order the channels are in and not the order an alphabet is.
    const names = [1, 2, 3, 10].map((n) => stemFileName('s', n, 'P'));
    expect(names).toEqual(['s-01-p.wav', 's-02-p.wav', 's-03-p.wav', 's-10-p.wav']);
    expect([...names].sort()).toEqual(names);
  });

  it('falls back for a channel nobody named, and keeps the extension', () => {
    expect(stemFileName('s', 2, '')).toBe(`s-02-track${STEM_FILE_EXTENSION}`);
    expect(stemFileName('s', 2, '   ')).toBe('s-02-track.wav');
  });

  it('survives a name that is all punctuation, and does not grow a long one', () => {
    expect(stemFileName('s', 1, '★ ★ ★')).toBe('s-01-track.wav');
    const long = stemFileName('s', 1, 'A VERY LONG CHANNEL NAME THAT KEEPS GOING');
    expect(long.length).toBeLessThanOrEqual('s-01-'.length + 24 + '.wav'.length);
    expect(long).toMatch(/^s-01-a-very-long-channel/);
  });

  it('names the archive after the song, and says what is in it', () => {
    expect(stemArchiveName('night-bus')).toBe('night-bus-stems.zip');
    expect(STEM_ARCHIVE_EXTENSION).toBe('.zip');
    expect(STEM_FILE_EXTENSION).toBe('.wav');
  });
});

describe('which channels become files', () => {
  it('lists the channels that carry a note, in channel order', () => {
    expect(stemPlan(song(THREE), 'night-bus')).toEqual([
      { track: 1, name: 'night-bus-01-kick-drum.wav' },
      { track: 2, name: 'night-bus-02-bass.wav' },
    ]);
  });

  it('leaves a silent channel out, and hands the renderer its numbers', () => {
    const plan = stemPlan(song(THREE), 'night-bus');
    expect(plan.map((entry) => entry.track)).toEqual([1, 2]);
    expect(stemTracks(plan)).toEqual([1, 2]);
  });

  it('counts a channel whose only note is a chord, and one whose only note is a drum', () => {
    const chords = song(`new
tracks 2
track 1 "KEYS" poly 3
track 2 "DRUMS"
pattern 1 "A"
C-4,E-4,G-4 .
`);
    expect(stemTracks(stemPlan(chords, 'x'))).toEqual([1]);

    const drums = song(`new
kit 808
tracks 2
track 1 "HAT"
track 2 "DRUMS"
pattern 1 "A"
. kick
`);
    expect(stemTracks(stemPlan(drums, 'x'))).toEqual([2]);
  });

  it('uses the song file stem for both the archive and its members', () => {
    const plans = stemPlan(song(THREE), songFileStem('Night Bus'));
    expect(songFileStem('Night Bus')).toBe('night-bus');
    expect(plans[0]?.name.startsWith('night-bus-')).toBe(true);
    expect(stemArchiveName(songFileStem('Night Bus'))).toBe('night-bus-stems.zip');
  });

  it('is a plan of the WHOLE song, not of one pattern', () => {
    const pattern2 = song(`new
tracks 2
track 1 "A" voice kick
track 2 "B" voice bass
pattern 1 "ONE"
C-1 .
pattern 2 "TWO"
. A-2
order 1 2
`);
    expect(stemTracks(stemPlan(pattern2, 'x'))).toEqual([1, 2]);
  });
});

describe('when there is nothing to stem', () => {
  it('refuses a song with no notes in it, in words', () => {
    expect(stemRefusal(createSong())).toBe('this song has no notes in it, so there are no stems to render.');
    expect(stemPlan(createSong(), 'x')).toEqual([]);
  });

  it('allows a song with one note in one channel', () => {
    const one = song('new\ntracks 1\npattern 1 "A"\nC-4\n');
    expect(stemRefusal(one)).toBeNull();
    expect(stemTracks(stemPlan(one, 'x'))).toEqual([1]);
  });
});

describe('stems change nothing about the song', () => {
  it('leaves the file format alone', () => {
    const before = song(THREE);
    const written = songToJson(before);
    const version = (JSON.parse(written) as { version?: number }).version;
    // Planning a stem set is a READ. Nothing about the song, and nothing about
    // the file it saves as, is a function of exporting it.
    stemPlan(before, 'night-bus');
    stemArchiveName('night-bus');
    expect((JSON.parse(songToJson(before)) as { version?: number }).version).toBe(version);
    expect(version).toBe(SONG_FILE_VERSION);
    expect(songFromJson(written).ok).toBe(true);
  });

  it('is not a statement: the language has no word for it', () => {
    // A stem is an EXPORT, not a feature of a song — the planner reads a song
    // that parses, and there is nothing to write back. If a word ever appears it
    // should be because a song can say something about stems, which it cannot.
    const result = applyScript(createSong(), 'new\nstems\n');
    expect(result.ok).toBe(false);
  });
});

// --- the archive ------------------------------------------------------------

/** The pieces of a ZIP this test needs to see: the names, and where each file is. */
function readLocalHeaders(bytes: Uint8Array): { name: string; size: number; crc: number; method: number; at: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: { name: string; size: number; crc: number; method: number; at: number }[] = [];
  let at = 0;
  while (at + 4 <= bytes.length && view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true);
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.slice(at + 30, at + 30 + nameLength));
    out.push({ name, size, crc, method, at });
    at += 30 + nameLength + view.getUint16(at + 28, true) + size;
  }
  return out;
}

/** Where the end-of-archive record is, found the way a real reader finds it. */
function readEnd(bytes: Uint8Array): { entries: number; directorySize: number; directoryOffset: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = bytes.length - 22; at >= 0; at--) {
    if (view.getUint32(at, true) === 0x06054b50) {
      return {
        entries: view.getUint16(at + 10, true),
        directorySize: view.getUint32(at + 12, true),
        directoryOffset: view.getUint32(at + 16, true),
      };
    }
  }
  throw new Error('the archive has no end-of-central-directory record.');
}

const bytesOf = (...values: number[]): Uint8Array => new Uint8Array(values);

describe('the checksum', () => {
  it('matches the published values', () => {
    expect(crc32(bytesOf())).toBe(0);
    // The two everybody quotes: the empty string, and `hello` = 0x3610a686.
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
  });

  it('is unsigned, even when the top bit is set', () => {
    for (const text of ['hello', 'the quick brown fox', 'a', 'z'.repeat(100)]) {
      const value = crc32(new TextEncoder().encode(text));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });
});

describe('the archive', () => {
  const files: ZipFile[] = [
    { name: 'night-bus-01-kick.wav', bytes: bytesOf(1, 2, 3, 4) },
    { name: 'night-bus-02-bass.wav', bytes: bytesOf(9, 8, 7) },
  ];

  it('writes one stored entry per file, with the right sizes and checksums', () => {
    const zip = zipStore(files);
    const headers = readLocalHeaders(zip);
    expect(headers.map((h) => h.name)).toEqual(['night-bus-01-kick.wav', 'night-bus-02-bass.wav']);
    expect(headers.map((h) => h.method)).toEqual([0, 0]);
    expect(headers.map((h) => h.size)).toEqual([4, 3]);
    expect(headers[0]?.crc).toBe(crc32(bytesOf(1, 2, 3, 4)));
  });

  it('stamps every entry with the same fixed 1980-01-01, and no time', () => {
    // The one field a person can SEE in `unzip -l`, and the one that was wrong
    // first: DOS packs the month and the day one-based, so a date that reads
    // `1980-01-00` is a day of zero. Reading the app's own archive with somebody
    // else's tool is what caught it, which is why this assertion exists.
    const view = new DataView(zipStore(files).buffer);
    expect(view.getUint16(10, true)).toBe(0); // time
    expect(view.getUint16(12, true)).toBe(0x0021); // 1980-01-01
  });

  it('says where the directory is, and how many entries it holds', () => {
    const zip = zipStore(files);
    const end = readEnd(zip);
    expect(end.entries).toBe(2);
    expect(end.directoryOffset + end.directorySize).toBe(zip.length - 22);
    // The directory itself starts with a central header and carries both names.
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(end.directoryOffset, true)).toBe(0x02014b50);
    const directory = new TextDecoder().decode(zip.slice(end.directoryOffset));
    for (const file of files) expect(directory).toContain(file.name);
  });

  it('is byte-for-byte the same every time, because nothing in it is a clock', () => {
    expect([...zipStore(files)]).toEqual([...zipStore(files)]);
    expect([...zipStore([files[0]!])]).not.toEqual([...zipStore(files)]);
  });

  it('carries an empty archive rather than refusing one', () => {
    const zip = zipStore([]);
    expect(zip.length).toBe(22);
    expect(readEnd(zip).entries).toBe(0);
    expect(readLocalHeaders(zip)).toEqual([]);
  });

  it('round-trips a WAV: what comes out of the archive is what went in', () => {
    // The property that matters to the person opening the zip: a stored entry is
    // the file's own bytes, so the app's own reader reads the stem back.
    // Samples a 16-bit file holds EXACTLY, so the round trip can be compared
    // sample for sample rather than approximately.
    const pcm: PcmAudio = { channels: [new Float32Array([0, 0.5, -0.5, 0.25])], sampleRate: 44100 };
    const wav = new Uint8Array(encodeWav(pcm));
    const zip = zipStore([{ name: 'one-stem.wav', bytes: wav }]);

    const header = readLocalHeaders(zip)[0]!;
    const start = header.at + 30 + new TextEncoder().encode(header.name).length;
    const stored = zip.slice(start, start + header.size);

    expect([...stored]).toEqual([...wav]);
    const read = decodeWav(stored.buffer.slice(0) as ArrayBuffer);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.pcm.sampleRate).toBe(44100);
      expect(Array.from(read.pcm.channels[0]!)).toEqual(Array.from(pcm.channels[0]!));
    }
  });
});
