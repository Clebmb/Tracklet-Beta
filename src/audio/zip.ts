/**
 * zip — several files, one download.
 *
 * A browser can put exactly one file on the user's disk per gesture, which is
 * fine for a song and wrong for a set of STEMS: one `.wav` per channel is the
 * point of a stem export, and twenty downloads would be twenty file dialogs.
 * So this writes a ZIP — the container that every operating system, DAW and
 * unzipper already opens.
 *
 * ── Why STORE and not DEFLATE ────────────────────────────────────────────────
 * Nothing here is compressed, on purpose. A 16-bit PCM `.wav` is already a
 * dense file: deflating one buys a few percent for a compressor that then has
 * to be written, tested and got right, and an archive whose whole job is to be
 * opened by somebody else's program is the wrong place to be clever. Method 0
 * is part of the format, not a shortcut through it — a `store` ZIP is a ZIP.
 *
 * ── Why it is deterministic ─────────────────────────────────────────────────
 * Every stamp in the archive is the same fixed moment (1980-01-01, the epoch of
 * the DOS date this format carries). Zip the same song twice and the bytes are
 * identical, which is what lets a test compare the whole archive rather than
 * poking at it, and what keeps an export from recording the time somebody's
 * machine happened to be at. Nothing else in an export has a timestamp either.
 *
 * The format, for the reader who has never had to write one:
 *
 *   [local header + name][file bytes]      one per file
 *   [central header + name]                one per file, then
 *   [end of central directory]             where the archive stops
 *
 * The weird-looking duplicate of every name is the format's own design: the
 * local header is what a DECOMPRESSOR streaming the file needs, and the central
 * directory is what a program listing the archive reads first. Both have to
 * carry the name, and the directory has to say where the local copy begins.
 */

/** One file in the archive. */
export interface ZipFile {
  /** The name inside the archive, with its extension. ASCII, no path. */
  name: string;
  /** The file itself, already encoded — a `.wav` by the time it gets here. */
  bytes: Uint8Array;
}

/** `PK\3\4` — the start of every file's own header. */
const LOCAL_SIGNATURE = 0x04034b50;
/** `PK\1\2` — the start of a central directory entry. */
const CENTRAL_SIGNATURE = 0x02014b50;
/** `PK\5\6` — the end of the archive. */
const END_SIGNATURE = 0x06054b50;
/** The version that introduced `store`… which is every version. 2.0 reads plainly. */
const VERSION = 20;
/** `store`: no compression, the bytes are the file. */
const METHOD_STORE = 0;
/** No flags: no encryption, no data descriptor, every field above is final. */
const FLAGS = 0;
/**
 * The DOS timestamp every entry wears: 1980-01-01 00:00, the earliest a DOS
 * date can say and the neutral value every deterministic writer uses.
 *
 * The date is packed as `((year - 1980) << 9) | (month << 5) | day`, and both
 * fields are ONE-based: the first day of the first representable month is
 * `(1 << 5) | 1` = 0x21. (A day of 0 is what `unzip -l` prints as `1980-01-00`
 * \u2014 which is how this constant was caught, by reading an archive this file
 * wrote with somebody else's tool.)
 */
const DOS_DATE = (1 << 5) | 1;
const DOS_TIME = 0;
/** A local header is 30 bytes before the name; a central one is 46. */
const LOCAL_FIXED = 30;
const CENTRAL_FIXED = 46;
const END_FIXED = 22;

/**
 * The CRC-32 table, built once.
 *
 * The polynomial is the one every ZIP uses, reflected: `0xEDB88320`. A table
 * rather than bit-by-bit arithmetic because a stem set is tens of megabytes of
 * samples and this is run once per file.
 */
const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

/**
 * The checksum a ZIP entry carries, over the file's bytes.
 *
 * Exported because it is the one part of the format that can be checked against
 * a published value — see `stems.test.ts` — and because a caller that wants to
 * verify an archive it wrote should not have to reimplement the table.
 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A ZIP holding every file, uncompressed, with no timestamps.
 *
 * Refuses nothing: an empty list is a valid empty archive, because a caller
 * that has nothing to export should have been stopped one level up (the menu
 * says so in words) rather than given a malformed file here.
 */
export function zipStore(files: readonly ZipFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const entries = files.map((file) => ({ ...file, name: encoder.encode(file.name) }));

  let size = END_FIXED;
  for (const entry of entries) {
    size += LOCAL_FIXED + entry.name.length + entry.bytes.length;
    size += CENTRAL_FIXED + entry.name.length;
  }

  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  let at = 0;

  /** Where each file's local header began, which the directory has to point at. */
  const starts: number[] = [];
  for (const entry of entries) {
    starts.push(at);
    const crc = crc32(entry.bytes);
    view.setUint32(at, LOCAL_SIGNATURE, true);
    view.setUint16(at + 4, VERSION, true);
    view.setUint16(at + 6, FLAGS, true);
    view.setUint16(at + 8, METHOD_STORE, true);
    view.setUint16(at + 10, DOS_TIME, true);
    view.setUint16(at + 12, DOS_DATE, true);
    view.setUint32(at + 14, crc, true);
    // Both sizes, because a stored entry's compressed size IS its size — and
    // because the flags say there is no data descriptor to hold the real values.
    view.setUint32(at + 18, entry.bytes.length, true);
    view.setUint32(at + 22, entry.bytes.length, true);
    view.setUint16(at + 26, entry.name.length, true);
    view.setUint16(at + 28, 0, true); // no extra field
    at += LOCAL_FIXED;
    bytes.set(entry.name, at);
    at += entry.name.length;
    bytes.set(entry.bytes, at);
    at += entry.bytes.length;
  }

  const directoryStart = at;
  entries.forEach((entry, i) => {
    const crc = crc32(entry.bytes);
    view.setUint32(at, CENTRAL_SIGNATURE, true);
    view.setUint16(at + 4, VERSION, true); // version that made it
    view.setUint16(at + 6, VERSION, true); // version needed to read it
    view.setUint16(at + 8, FLAGS, true);
    view.setUint16(at + 10, METHOD_STORE, true);
    view.setUint16(at + 12, DOS_TIME, true);
    view.setUint16(at + 14, DOS_DATE, true);
    view.setUint32(at + 16, crc, true);
    view.setUint32(at + 20, entry.bytes.length, true);
    view.setUint32(at + 24, entry.bytes.length, true);
    view.setUint16(at + 28, entry.name.length, true);
    view.setUint16(at + 30, 0, true); // extra
    view.setUint16(at + 32, 0, true); // comment
    view.setUint16(at + 34, 0, true); // disk this file starts on: always the first
    view.setUint16(at + 36, 0, true); // internal attributes: none
    view.setUint32(at + 38, 0, true); // external attributes: nothing POSIX to say
    view.setUint32(at + 42, starts[i] ?? 0, true);
    at += CENTRAL_FIXED;
    bytes.set(entry.name, at);
    at += entry.name.length;
  });

  const directorySize = at - directoryStart;
  view.setUint32(at, END_SIGNATURE, true);
  view.setUint16(at + 4, 0, true); // this disk
  view.setUint16(at + 6, 0, true); // the disk the directory is on
  view.setUint16(at + 8, entries.length, true); // entries on this disk
  view.setUint16(at + 10, entries.length, true); // entries in all
  view.setUint32(at + 12, directorySize, true);
  view.setUint32(at + 16, directoryStart, true);
  view.setUint16(at + 20, 0, true); // no archive comment
  at += END_FIXED;

  return bytes;
}
