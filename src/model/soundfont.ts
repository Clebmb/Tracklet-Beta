/**
 * soundfont — reading an SF2 file: recorded instruments, as plain data.
 *
 * Everything else on this shelf is SYNTHESIZED: a wave, a knob and a promise that
 * the same numbers make the same sound everywhere. A SoundFont is the opposite —
 * somebody's actual recordings of an actual piano, wrapped in a container format
 * (`RIFF`, the same shape a `.wav` uses) with a small database describing which
 * recording to play for which key. It is the last piece of the far end because it
 * is the only one that brings the OUTSIDE world's sound INTO the app: not a
 * timbre this synth can make, but a sample somebody already made.
 *
 * ── What an SF2 is ──────────────────────────────────────────────────────────
 * A `RIFF` file whose body is three lists:
 *
 *   • `INFO`  — who made it and what it is called;
 *   • `sdta`  — the raw 16-bit PCM sample data, one long run of frames;
 *   • `pdta`  — the DATABASE: `phdr` (presets), `inst` (instruments), `shdr`
 *     (samples), and the `bag`/`gen` pairs that connect them. A "bag" is a list of
 *     zones; a "zone" is a bag entry's run of generators. A generator is one
 *     `<opcode, amount>` pair saying something like "this zone covers keys 36–48"
 *     or "this zone plays sample 7". Preset zones point at instruments; instrument
 *     zones point at samples. That double indirection is the whole format.
 *
 * ── What this reader does, and deliberately does not ────────────────────────
 * It reads the five things a playable instrument needs: which sample a key range
 * plays, the root key the recording is at, its loop points, its tuning, and the
 * sample rate it was recorded at. It ignores the rest — LFOs, envelopes, filters
 * and the whole modulation matrix — because Tracklet already HAS a filter and an
 * envelope, and a second set written by somebody's 1994 editor would be a second
 * truth about what a channel sounds like.
 *
 * `SFZ` — the text format that references loose `.wav` files — is deliberately
 * NOT read: it has no samples inside it, so supporting it would mean asking for a
 * folder of files as well as a file, which is a different app.
 *
 * Phaser-free and audio-free on purpose: this is a READER, and turning its sample
 * data into `AudioBuffer`s is `audio/synth.ts`'s job.
 */

/** One recording, as the `shdr` table describes it. */
export interface FontSample {
  name: string;
  /** First frame in the sample data (inclusive). */
  start: number;
  /** One past the last frame (exclusive). */
  end: number;
  loopStart: number;
  loopEnd: number;
  /** The rate the recording was made at, in Hz. */
  sampleRate: number;
  /** The key the recording sounds at (60 = middle C). */
  rootKey: number;
  /** Fine tuning of the recording, in cents. */
  correction: number;
  /** True when the sample loops rather than playing once. */
  loop: boolean;
}

/**
 * One playable ZONE: a key range, the sample it plays, and how it is pitched.
 *
 * The unit a sampler is really made of. Everything the `pdta` database says
 * collapses to this — a preset is a list of zones, and a note is played by the
 * zone whose key range contains it.
 */
export interface FontZone {
  /** Lowest key this zone answers to, 0..127. */
  keyLow: number;
  /** Highest key this zone answers to, inclusive. */
  keyHigh: number;
  /** Index into `SoundFont.samples`. */
  sample: number;
  /** The key the sample sounds at, after any overriding root key. */
  rootKey: number;
  /** Tuning on top of the root key, in cents. */
  tuneCents: number;
  /** True when the sample loops. */
  loop: boolean;
}

/** One instrument the font offers. */
export interface FontPreset {
  name: string;
  /** Bank number. */
  bank: number;
  /** Program number within the bank, 0..127. */
  program: number;
  /** Its playable zones, in key order where the file lists them so. */
  zones: FontZone[];
}

/** A whole soundfont, reduced to what a channel can play. */
export interface SoundFont {
  /** The font's name from its `INFO` list, or an empty string. */
  name: string;
  presets: FontPreset[];
  samples: FontSample[];
  /** The raw 16-bit PCM the sample table indexes into. */
  pcm: Int16Array;
  /**
   * How many values one FRAME of `pcm` costs: 1 for mono, 2 for interleaved
   * stereo. Every sample in the font is laid out at this width.
   *
   * A property of the FONT rather than of a sample, which is the only shape that
   * works: `pcm` is one flat array and `start`/`end`/`loopStart`/`loopEnd` are
   * frame indexes into it, so a font whose samples disagreed about their width
   * could not be indexed at all — frame 4 would mean two different offsets.
   * A SoundFont is always 1 (its `smpl` chunk has no channel count to disagree
   * with); an imported Noislet `.instrument.json` is 2 when any of its sounds is
   * stereo, and its mono sounds are widened to match (see
   * `model/instrumentLibrary.ts`).
   */
  channels: 1 | 2;
}

export type SoundFontRead =
  | { ok: true; font: SoundFont }
  | { ok: false; errors: string[] };

/** The extensions a soundfont is saved with. */
export const SOUNDFONT_FILE_EXTENSIONS: readonly string[] = ['.sf2'];

/**
 * How many presets the SLOT KNOB can reach.
 *
 * `duty` is one percentage, so it can only ever name a hundred and one
 * positions: it spreads evenly across the font's presets, and past about a
 * hundred neighbouring presets share a step and some are unreachable whatever you
 * write. This is the window the knob reaches — the first `MAX_FONT_PRESETS`
 * presets the file lists — and it is what every `duty` in every song already
 * means, so changing the number would silently repoint music that plays fine.
 *
 * It is NOT how many presets a font may hold. That is `MAX_FONT_TABLE`, and the
 * reader keeps every one of them: dropping the tail is what made a font like
 * Arachno look as though it had no drum kit at all, when what it had was a drum
 * kit the knob could not name.
 */
export const MAX_FONT_PRESETS = 128;

/**
 * The most preset records a font may contribute before the reader gives up.
 *
 * A guard against a malformed file rather than a feature: the largest real GM/GS
 * bank is a few hundred presets, and this is an order of magnitude past that.
 */
export const MAX_FONT_TABLE = 4096;

/**
 * The bank a General MIDI drum kit lives on.
 *
 * The one convention that makes a kit findable without being named: every preset
 * on bank 128 is percussion and is keyed the General MIDI way, so `kick` is 36
 * whatever the font calls the kit. See `kitFor`.
 */
export const PERCUSSION_BANK = 128;

/** True for a preset that is a drum kit rather than an instrument. */
export function isPercussionPreset(preset: FontPreset): boolean {
  return preset.bank === PERCUSSION_BANK;
}

/**
 * The font's own DRUM KIT, or null when it has none.
 *
 * The first percussion preset the file lists, which is the kit a General MIDI
 * player reaches for by default. It is found by BANK and not by `duty` on
 * purpose: a kit is listed past the melodic bank in most files, so on a font
 * whose table is longer than the slot window (Arachno is exactly that font — 128
 * melodic presets first and its kits after them) there is no number the knob
 * could be set to that would name one.
 */
export function kitFor(font: SoundFont): FontPreset | null {
  return font.presets.find((preset) => isPercussionPreset(preset) && preset.zones.length > 0) ?? null;
}

/**
 * How many presets the slot knob reaches on THIS font.
 *
 * The one place the window is decided, so the knob, the reader, the file and the
 * tests can never disagree about which preset a `duty` means.
 */
export function slotCountFor(font: SoundFont): number {
  return Math.min(font.presets.length, MAX_FONT_PRESETS);
}

/** The SF2 generator opcodes this reader understands. */
const GEN_KEY_RANGE = 43;
const GEN_VEL_RANGE = 44;
const GEN_INSTRUMENT = 41;
const GEN_SAMPLE_ID = 53;
const GEN_SAMPLE_MODES = 54;
const GEN_OVERRIDING_ROOT = 58;
const GEN_COARSE_TUNE = 51;
const GEN_FINE_TUNE = 52;

class FontError extends Error {}

/** A little-endian cursor over a `RIFF` body that refuses to read past the end. */
class Bytes {
  private pos: number;

  constructor(private readonly view: DataView, start = 0, private readonly end = view.byteLength) {
    this.pos = start;
  }

  get remaining(): number { return this.end - this.pos; }
  get offset(): number { return this.pos; }

  private need(count: number): void {
    if (this.pos + count > this.end) throw new FontError('the soundfont ends in the middle of a table.');
  }

  tag(): string {
    this.need(4);
    let text = '';
    for (let i = 0; i < 4; i++) text += String.fromCharCode(this.view.getUint8(this.pos + i));
    this.pos += 4;
    return text;
  }

  u16(): number { this.need(2); const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  i16(): number { this.need(2); const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  u32(): number { this.need(4); const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  i8(): number { this.need(1); const v = this.view.getInt8(this.pos); this.pos += 1; return v; }
  u8(): number { this.need(1); const v = this.view.getUint8(this.pos); this.pos += 1; return v; }

  /** A 20-byte fixed-name field, trimmed at the first NUL. */
  name20(): string {
    this.need(20);
    let text = '';
    for (let i = 0; i < 20; i++) {
      const byte = this.view.getUint8(this.pos + i);
      if (byte === 0) break;
      text += String.fromCharCode(byte);
    }
    this.pos += 20;
    return text.trim();
  }

  skip(count: number): void {
    if (count < 0) throw new FontError('a chunk declared a negative length.');
    this.need(count);
    this.pos += count;
  }

  /** A cursor over an ABSOLUTE byte range of the same view, for a table window. */
  sub(start: number, end: number): Bytes {
    return new Bytes(this.view, Math.max(0, Math.min(this.view.byteLength, start)), Math.min(this.view.byteLength, end));
  }

  /** A sub-cursor over the next `length` bytes, for one chunk's body. */
  slice(length: number): Bytes {
    if (length < 0) throw new FontError('a chunk declared a negative length.');
    this.need(length);
    const view = new Bytes(this.view, this.pos, this.pos + length);
    this.pos += length;
    return view;
  }

  /** Walk one `RIFF`/`LIST` body: the sub-chunks a `LIST` holds. */
  chunks(): { id: string; body: Bytes }[] {
    const out: { id: string; body: Bytes }[] = [];
    while (this.remaining >= 8) {
      const id = this.tag();
      const length = this.u32();
      out.push({ id, body: this.slice(length) });
      if (length % 2 === 1) this.skip(Math.min(1, this.remaining)); // RIFF pads to even
    }
    return out;
  }
}

/** A `phdr` row, before it is resolved into zones. */
interface PresetRow { name: string; bank: number; program: number; bag: number; }

/** Generators of one zone, as the raw `pgen`/`igen` run. */
interface ZoneGens {
  keyLow: number;
  keyHigh: number;
  sampleId: number | null;
  instrument: number | null;
  rootKey: number | null;
  coarse: number;
  fine: number;
  loop: boolean;
}

/**
 * Read one zone's generator run.
 *
 * `keyRange` and `velRange` carry TWO bytes rather than a word, which is the one
 * place the format is not uniform; everything else is a signed word on the
 * little end.
 */
function readZone(gens: Bytes): ZoneGens {
  const zone: ZoneGens = { keyLow: 0, keyHigh: 127, sampleId: null, instrument: null, rootKey: null, coarse: 0, fine: 0, loop: false };
  while (gens.remaining >= 4) {
    const op = gens.u16();
    if (op === GEN_KEY_RANGE) { zone.keyLow = gens.u8(); zone.keyHigh = gens.u8(); continue; }
    if (op === GEN_VEL_RANGE) { gens.skip(2); continue; }
    const amount = gens.i16();
    switch (op) {
      case GEN_INSTRUMENT: zone.instrument = amount; break;
      case GEN_SAMPLE_ID: zone.sampleId = amount; break;
      case GEN_OVERRIDING_ROOT: zone.rootKey = amount; break;
      case GEN_COARSE_TUNE: zone.coarse = amount; break;
      case GEN_FINE_TUNE: zone.fine = amount; break;
      case GEN_SAMPLE_MODES: zone.loop = (amount & 0x3) === 1 || (amount & 0x3) === 3; break;
      default: break;
    }
  }
  return zone;
}

/**
 * Read the bytes of a `.sf2` file.
 *
 * One pass over the `RIFF` body, collecting the three lists, then a resolution
 * pass that turns the `pdta` database into presets of playable zones. Every table
 * is bounds-checked and every index is clamped, because a soundfont is a file
 * somebody else compiled: a truncated download must come back as a sentence, not
 * as an out-of-range read.
 */
export function readSoundFont(bytes: ArrayBuffer | Uint8Array): SoundFontRead {
  try {
    const buffer = bytes instanceof Uint8Array
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : bytes;
    if (buffer.byteLength < 12) return { ok: false, errors: ['this file is too small to be a soundfont.'] };
    const view = new DataView(buffer);
    const riff = new Bytes(view);
    if (riff.tag() !== 'RIFF') return { ok: false, errors: ['this is not a soundfont: it does not start with "RIFF".'] };
    riff.u32();
    if (riff.tag() !== 'sfbk') return { ok: false, errors: ['this is a RIFF file, but not a SoundFont ("sfbk").'] };

    let name = '';
    let pcm = new Int16Array(0);
    const tables = new Map<string, Bytes>();

    for (const { id, body } of riff.chunks()) {
      if (id !== 'LIST') continue;
      const kind = body.tag();
      for (const sub of body.chunks()) {
        if (kind === 'INFO' && sub.id === 'INAM') {
          let text = '';
          while (sub.body.remaining > 0) text += String.fromCharCode(sub.body.u8());
          name = text.replace(/\u0000+$/, '').trim();
        } else if (kind === 'sdta' && sub.id === 'smpl') {
          const count = Math.floor(sub.body.remaining / 2);
          const start = sub.body.offset;
          pcm = new Int16Array(count);
          for (let i = 0; i < count; i++) pcm[i] = view.getInt16(start + i * 2, true);
        } else if (kind === 'pdta') {
          tables.set(sub.id, sub.body);
        }
      }
    }
    if (!tables.has('phdr') || !tables.has('shdr')) {
      return { ok: false, errors: ['this soundfont has no preset or sample table in it.'] };
    }
    if (pcm.length === 0) return { ok: false, errors: ['this soundfont has no sample data in it.'] };

    // --- the sample table ---
    const samples: FontSample[] = [];
    {
      const table = tables.get('shdr')!;
      while (table.remaining >= 46) {
        const entry: FontSample = {
          name: table.name20(),
          start: table.u32(),
          end: table.u32(),
          loopStart: table.u32(),
          loopEnd: table.u32(),
          sampleRate: table.u32(),
          rootKey: table.u8(),
          correction: table.i8(),
          loop: false,
        };
        table.skip(4); // sampleLink, sampleType
        // The last record is a terminator whose name is the ASCII "EOS".
        if (entry.name === 'EOS') break;
        const start = Math.max(0, Math.min(pcm.length, entry.start));
        const end = Math.max(start, Math.min(pcm.length, entry.end));
        const loopStart = Math.max(start, Math.min(end, entry.loopStart));
        const loopEnd = Math.max(loopStart, Math.min(end, entry.loopEnd));
        samples.push({
          ...entry,
          start, end, loopStart, loopEnd,
          sampleRate: entry.sampleRate > 0 ? entry.sampleRate : 44100,
          correction: entry.correction,
          loop: loopEnd > loopStart,
        });
      }
    }
    if (samples.length === 0) return { ok: false, errors: ['this soundfont has no samples in it.'] };

    // --- the instrument table, as zones of the sample table ---
    const instruments: ZoneGens[][] = [];
    {
      const rows: { bag: number }[] = [];
      const table = tables.get('inst');
      if (table) {
        while (table.remaining >= 22) {
          const entryName = table.name20();
          const bag = table.u16();
          if (entryName === 'EOI') break;
          rows.push({ bag });
        }
      }
      const bags = readBags(tables.get('ibag'));
      const gens = tables.get('igen');
      for (let i = 0; i < rows.length; i++) {
        // An instrument owns the zones from its own `ibag` entry up to the next
        // instrument's, so the bag indexes ARE the zone boundaries.
        instruments.push(readZones(gens, bags, rows[i].bag, rows[i + 1]?.bag ?? bags.length - 1));
      }
    }

    // --- the preset table, as zones of the instrument table ---
    const presets: FontPreset[] = [];
    {
      const rows: PresetRow[] = [];
      const phdr = tables.get('phdr')!;
      while (phdr.remaining >= 38) {
        const entryName = phdr.name20();
        const preset = phdr.u16();
        const bank = phdr.u16();
        const bag = phdr.u16();
        phdr.skip(12); // library, genre, morphology
        if (entryName === 'EOP') break;
        rows.push({ name: entryName, bank, program: preset, bag });
      }
      const bags = readBags(tables.get('pbag'));
      const gens = tables.get('pgen');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const presetZones = readZones(gens, bags, row.bag, rows[i + 1]?.bag ?? bags.length - 1);
        const zones: FontZone[] = [];
        for (const presetZone of presetZones) {
          if (presetZone.instrument === null) continue;
          const instrument = instruments[presetZone.instrument];
          if (!instrument) continue;
          for (const instrumentZone of instrument) {
            if (instrumentZone.sampleId === null) continue;
            const sample = samples[instrumentZone.sampleId];
            if (!sample) continue;
            // A zone plays where BOTH ranges agree: the preset's says which keys
            // the instrument answers for, the instrument's which sample does.
            const keyLow = Math.max(presetZone.keyLow, instrumentZone.keyLow);
            const keyHigh = Math.min(presetZone.keyHigh, instrumentZone.keyHigh);
            if (keyHigh < keyLow) continue;
            const rootKey = instrumentZone.rootKey ?? sample.rootKey;
            zones.push({
              keyLow, keyHigh,
              sample: instrumentZone.sampleId,
              rootKey,
              tuneCents: instrumentZone.coarse * 100 + instrumentZone.fine + sample.correction,
              loop: instrumentZone.loop || sample.loop,
            });
          }
        }
        zones.sort((a, b) => a.keyLow - b.keyLow);
        presets.push({ name: row.name || `PRESET ${presets.length + 1}`, bank: row.bank, program: row.program, zones });
      }
    }
    const playable = presets.filter((preset) => preset.zones.length > 0);
    if (playable.length === 0) {
      return { ok: false, errors: ['this soundfont\u2019s presets do not point at any playable samples.'] };
    }

    return {
      ok: true,
      font: {
        name,
        // Every playable preset, not just the ones the knob can name: the kits
        // and the tail are reachable by `kitFor` and reported by `describeFont`,
        // and a reader that throws data away cannot be asked about it later.
        presets: playable.slice(0, MAX_FONT_TABLE),
        samples,
        pcm,
        // `smpl` is one run of frame values and the format never says otherwise.
        channels: 1,
      },
    };
  } catch (error) {
    const message = error instanceof FontError ? error.message : 'the soundfont could not be read.';
    return { ok: false, errors: [message] };
  }
}

/** The `bag` tables: each row is where a zone's generators start. */
function readBags(table: Bytes | undefined): number[] {
  const out: number[] = [];
  if (!table) return out;
  while (table.remaining >= 4) {
    const genNdx = table.u16();
    table.skip(2); // modNdx
    out.push(genNdx);
  }
  return out;
}

/**
 * The zones between two entries of a bag table, as parsed zones.
 *
 * The generator tables are flat runs of 4-byte records with no separators in
 * them, so the ONLY thing that says where one zone ends and the next begins is
 * the bag table: entry `k` is the generator index a zone starts at, and entry
 * `k + 1` is where it stops. Reading the run as one zone instead would quietly
 * merge a piano's samples into whichever one happened to be listed last.
 *
 * `first` and `last` are bag INDEXES, and `last` is exclusive — an instrument
 * owns the zones from its own bag entry up to the next instrument's.
 */
function readZones(gens: Bytes | undefined, bags: readonly number[], first: number, last: number): ZoneGens[] {
  const out: ZoneGens[] = [];
  if (!gens) return out;
  for (let zone = Math.max(0, first); zone < last; zone++) {
    const from = bags[zone];
    const to = bags[zone + 1];
    if (from === undefined || to === undefined || to <= from) continue;
    out.push(readZone(gens.sub(gens.offset + from * 4, gens.offset + to * 4)));
  }
  return out;
}

// --- picking a preset, and a zone ------------------------------------------

/** Which preset a `duty` picks: the font's presets spread evenly across 0..100. */
export function presetIndexFor(duty: number, count: number): number {
  if (count <= 0) return 0;
  const d = Math.max(0, Math.min(100, duty));
  return Math.min(count - 1, Math.floor((d / 100) * count));
}

/** The preset a `duty` picks from a font, or null when the font has none. */
export function presetFor(font: SoundFont, duty: number): FontPreset | null {
  if (font.presets.length === 0) return null;
  return font.presets[presetIndexFor(duty, slotCountFor(font))];
}

/**
 * The zone that plays a note, or the nearest one.
 *
 * Nearest rather than null, deliberately: a note outside every range still has to
 * come out as a sound — the range IS the guarantee — and the closest sample,
 * played at the wrong pitch, is a far better answer than silence.
 */
export function zoneForNote<T extends FontZone>(zones: readonly T[], midi: number): T | null {
  if (zones.length === 0) return null;
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const zone of zones) {
    if (midi >= zone.keyLow && midi <= zone.keyHigh) return zone;
    const distance = midi < zone.keyLow ? zone.keyLow - midi : midi - zone.keyHigh;
    if (distance < bestDistance) { bestDistance = distance; best = zone; }
  }
  return best;
}

/**
 * A one-line inventory of a font, for the status line after an import.
 *
 * It says "128 OF 136 PRESETS" when the file holds more than the knob can name,
 * because that number is the difference between a font that is missing a
 * instrument and a font whose instrument cannot be asked for — and the second one
 * has a fix (a kit is still reachable; see `kitFor`) while the first does not.
 */
export function describeFont(font: SoundFont): string {
  const slots = slotCountFor(font);
  const presets = font.presets.length > slots
    ? `${slots} OF ${font.presets.length} PRESETS`
    : `${font.presets.length} PRESET${font.presets.length === 1 ? '' : 'S'}`;
  return `${presets}  -  ${font.samples.length} SAMPLE${font.samples.length === 1 ? '' : 'S'}`;
}
