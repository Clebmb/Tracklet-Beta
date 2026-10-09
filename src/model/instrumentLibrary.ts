/**
 * instrument — someone else's instruments, held in a list.
 *
 * Tracklet's recorded instruments used to be exactly one thing: a SoundFont, read
 * out of a `.sf2` and held in a single slot, so importing a second font meant
 * losing the first. This module is the upgrade — a LIBRARY of instruments, each
 * one either a soundfont or a whole Noislet sound pack, with one of them
 * currently loaded into the `font` wave.
 *
 * ── Why the two kinds are one kind ──────────────────────────────────────────
 * A Noislet `.instrument.json` is not a different species of instrument to play;
 * it is the same species arriving by a different road. Both are "somebody else's
 * recordings, grouped into presets, played back by key range", which is the
 * definition of `SoundFont` one file over. So the reader here does not invent a
 * second playback path — it CONVERTS a Noislet pack into a `SoundFont` and hands
 * it to the engine untouched. That has three consequences worth stating:
 *
 *   • there is no new audio code, so a Noislet sound in a song sounds like the
 *     same sound in Noislet, because it IS it;
 *   • every existing thing that works on a font — `duty` picking a preset, the
 *     note picking a zone, looping, per-sample rates, the sample buffer cache —
 *     works on an imported pack for free;
 *   • the format on the other side is not re-described here. `noislet/doc/
 *     instrument-format.md` is the contract; this file is its Tracklet end.
 *
 * ── What an imported sound becomes ──────────────────────────────────────────
 * One sound = one PRESET = one sample covering the whole keyboard at `rootKey`
 * (middle C unless the file says otherwise). So a pack of eight footsteps is a
 * font with eight presets, and a channel's `duty` knob picks which footstep:
 * the same knob that chooses a soundfont's preset, doing the same job. A channel
 * plays it as a PITCHED ONE-SHOT — the note C-4 plays the recording at the rate
 * you heard it, anything else transposes it, and the note's length does not
 * stretch it (unless the file asks for a loop, which is what a drone wants and
 * what a hit does not).
 *
 * ── Which instrument is loaded ──────────────────────────────────────────────
 * The library holds many; the `font` wave plays the SELECTED one. That selection
 * is app state, not song data — a song file says `wave font` and never
 * `wave font "FIRE BED"` — which is deliberate and matches what the single font
 * slot always did: a song is a few kilobytes of text and stays that way, and an
 * instrument stays where you put it while you open songs. The docs say it out
 * loud in more than one place because it is the one thing about this feature
 * that can surprise somebody.
 *
 * Phaser-free and audio-free, like the rest of `model/`: this reads text into
 * data, and `audio/synth.ts` turns data into sound.
 */

import type { FontPreset, FontSample, FontZone, SoundFont } from './soundfont';
import { MAX_FONT_PRESETS } from './soundfont';

/**
 * The file extension a Noislet instrument arrives with, both halves.
 *
 * Two parts for the same reason `.noislet.json` has two: the first says whose
 * file it is, the last says how to open it. Shared with Noislet's own constant
 * by hand rather than by import, because the two applications do not depend on
 * each other — the FORMAT is the interface, and it is documented on both sides.
 */
export const INSTRUMENT_FILE_EXTENSION = '.instrument.json';

/** The magic string a Noislet instrument file starts with. */
export const INSTRUMENT_FORMAT = 'noislet.instrument';

/** The format version this reader understands. An unknown one is refused. */
export const INSTRUMENT_VERSION = 1;

/**
 * How long one imported sound may be, in milliseconds.
 *
 * A guard, not a preference: the samples arrive as base64 inside a JSON file the
 * user picked, and a two-hour blob would be a browser tab that stops responding
 * with no explanation. Generous next to the 30 seconds Noislet will write, so a
 * hand-made file is not refused for being long, and a file that is absurd is
 * trimmed with a warning rather than taking the app down.
 */
export const MAX_IMPORT_MS = 60_000;

/** The kinds of instrument the library can hold. */
export type InstrumentKind = 'soundfont' | 'noislet';

/**
 * Which kind of instrument a FETCHED file is, from its first meaningful byte.
 *
 * `instrument load` names a path, and a path does not have to say what is at the
 * end of it — a Noislet pack is served from wherever somebody put it, and the
 * file name is whatever they chose. So the FILE decides, which is the rule the
 * song formats already use (`09-song-files.md`: "by the first character, not the
 * extension") and for the same reason: a file that lies about its extension must
 * still open.
 *
 * A Noislet instrument is JSON text and opens with `{`. A soundfont is a binary
 * RIFF and opens with `R`. Only the first case is detected here, because the
 * other answer needs no help: anything that is not JSON goes to the soundfont
 * reader, whose refusal — "this is not a soundfont: it does not start with
 * \"RIFF\"" — is already the right sentence for a file that is neither.
 *
 * A byte-order mark and leading whitespace are stepped over on the way. A JSON
 * file saved by an editor that likes a BOM is a Noislet instrument, and nobody
 * should have to know that to load one.
 */
export function instrumentFileKind(bytes: Uint8Array): InstrumentKind {
  let at = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) at = 3;
  while (at < bytes.length) {
    const byte = bytes[at];
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) break;
    at += 1;
  }
  return bytes[at] === 0x7b ? 'noislet' : 'soundfont';
}

/**
 * The text of a fetched instrument file, for the reader that wants JSON rather
 * than bytes. UTF-8, because that is what the format is written in.
 */
export function decodeInstrumentText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** How a kind reads in the F2 list and in a status line. */
export const KIND_LABELS: Readonly<Record<InstrumentKind, string>> = {
  soundfont: 'SOUNDFONT',
  noislet: 'NOISLET',
};

/** One instrument in the library: a name, where it came from, and the font. */
export interface InstrumentEntry {
  /** Stable key, kind-prefixed so two kinds cannot collide on a name. */
  id: string;
  /**
   * What the list shows and a script says. Upper-cased on the way in, because a
   * name that a script has to match is a name that should not depend on how
   * somebody's finger felt when they typed it.
   */
  name: string;
  kind: InstrumentKind;
  /** One line about where it came from: the file name, or the pack's sounds. */
  detail: string;
  /** The playable instrument. What the `font` wave actually plays. */
  font: SoundFont;
}

/** A whole library: the instruments, and which one the `font` wave plays. */
export interface InstrumentLibrary {
  entries: readonly InstrumentEntry[];
  /** Index into `entries`, or -1 when the library is empty. */
  active: number;
}

/** An empty library — what a fresh session starts with (as it always did). */
export const EMPTY_LIBRARY: InstrumentLibrary = { entries: [], active: -1 };

/** What a library read produced, including what it had to leave out. */
export type InstrumentImport =
  | { ok: true; name: string; font: SoundFont; detail: string; warnings: string[] }
  | { ok: false; errors: string[] };

/** The instrument the `font` wave plays, or null when the library is empty. */
export function activeInstrument(library: InstrumentLibrary): InstrumentEntry | null {
  return library.entries[library.active] ?? null;
}

/** Where an instrument sits in the library, by id, or -1. */
export function instrumentIndex(library: InstrumentLibrary, id: string): number {
  return library.entries.findIndex((entry) => entry.id === id);
}

/**
 * The library entry a script or a list is pointing at, by NAME or by NUMBER.
 *
 * Both, because both are how people talk about a list: `instrument use 2` is
 * what you say when you are looking at it, and `instrument use "FOOTSTEPS"` is
 * what you say when you are writing a script that should keep working after you
 * add an instrument above it. A name matches case-insensitively and ignores
 * surrounding spaces; a number is 1-based, because the list is.
 */
export function findInstrument(library: InstrumentLibrary, query: string): InstrumentEntry | null {
  const text = query.trim();
  if (text === '') return null;
  if (/^\d+$/.test(text)) {
    const index = Number(text) - 1;
    return library.entries[index] ?? null;
  }
  const want = text.toUpperCase();
  return library.entries.find((entry) => entry.name.toUpperCase() === want) ?? null;
}

/**
 * What an instrument's name will be, given the library it is joining.
 *
 * A second import of the same NAME REPLACES the first rather than piling up a
 * ` (2)`. That is the round trip this whole feature exists for: tweak a sound in
 * Noislet, export, import again, and the instrument in Tracklet is the new one —
 * not a third copy with a suffix, and not a stale one the channel is still
 * pointing at. The status line says REPLACED when that happens, so it is never a
 * silent surprise.
 */
export function importedName(name: string): string {
  const tidy = name.trim().replace(/\s+/g, ' ').toUpperCase();
  return tidy === '' ? 'IMPORTED' : tidy;
}

/**
 * Add an instrument to the library, replacing one of the same name.
 *
 * Returns the new library and whether it replaced — the caller's status line
 * needs to know which, and deriving it by counting entries afterwards would be
 * the same test written twice.
 */
export function addInstrument(
  library: InstrumentLibrary,
  entry: InstrumentEntry,
): { library: InstrumentLibrary; replaced: boolean } {
  const at = library.entries.findIndex((existing) => existing.id === entry.id);
  if (at >= 0) {
    const entries = library.entries.map((existing, i) => (i === at ? entry : existing));
    return { library: { entries, active: at }, replaced: true };
  }
  const entries = [...library.entries, entry];
  return { library: { entries, active: entries.length - 1 }, replaced: false };
}

/** Take an instrument out, keeping the selection on something that exists. */
export function removeInstrument(library: InstrumentLibrary, id: string): InstrumentLibrary {
  const at = instrumentIndex(library, id);
  if (at < 0) return library;
  const entries = library.entries.filter((entry) => entry.id !== id);
  if (entries.length === 0) return EMPTY_LIBRARY;
  // Removing the active one falls back to its neighbour rather than to nothing:
  // the list is a shelf, and taking a file off it should not empty your hands.
  const active = Math.max(0, Math.min(entries.length - 1, at < library.active ? library.active - 1 : library.active));
  return { entries, active };
}

/** Select the instrument the `font` wave plays. Unknown ids change nothing. */
export function selectInstrument(library: InstrumentLibrary, id: string): InstrumentLibrary {
  const at = instrumentIndex(library, id);
  return at < 0 ? library : { ...library, active: at };
}

/**
 * A one-line inventory of an instrument, for the status line after an import.
 *
 * The same shape as Noislet's `describeInstrument`, deliberately: whichever end
 * of the hand-off you are standing at, the sentence about what just arrived
 * looks the same — presets, samples, and how it is played.
 */
export function describeInstrument(entry: InstrumentEntry): string {
  const presets = entry.font.presets.length;
  const samples = entry.font.samples.length;
  const seconds = entry.font.samples.reduce((total, sample) => {
    const rate = sample.sampleRate > 0 ? sample.sampleRate : 44100;
    return total + (sample.end - sample.start) / rate;
  }, 0);
  return `${presets} PRESET${presets === 1 ? '' : 'S'}  -  ${samples} SAMPLE${samples === 1 ? '' : 'S'}`
    + `  -  ${seconds.toFixed(1)} S`;
}

/** One row of the F2 instrument list, as data. */
export interface InstrumentRow {
  id: string;
  name: string;
  /** `NOISLET - 5 PRESETS`, for the row's second column. */
  meta: string;
  /** True for the one the `font` wave is playing. */
  active: boolean;
}

/**
 * The library as list rows.
 *
 * Built here rather than in the menu for the same reason the voice tables are in
 * `model/`: a script printing `instrument` and a menu drawing the list are asking
 * the same question about the same objects, and one function answering both is
 * what keeps them from drifting apart.
 */
export function instrumentRows(library: InstrumentLibrary): InstrumentRow[] {
  return library.entries.map((entry, index) => ({
    id: entry.id,
    name: entry.name,
    meta: `${KIND_LABELS[entry.kind]}  -  ${instrumentSizeLabel(entry)}`,
    active: index === library.active,
  }));
}

/** `5 SOUNDS - 1.2 S`, for a list row's second column. */
function instrumentSizeLabel(entry: InstrumentEntry): string {
  const count = entry.kind === 'noislet' ? entry.font.presets.length : entry.font.samples.length;
  const noun = entry.kind === 'noislet' ? 'SOUND' : 'SAMPLE';
  const seconds = entry.font.samples.reduce((total, sample) => {
    const rate = sample.sampleRate > 0 ? sample.sampleRate : 44100;
    return total + (sample.end - sample.start) / rate;
  }, 0);
  return `${count} ${noun}${count === 1 ? '' : 'S'}  -  ${seconds.toFixed(1)} S`;
}

/** The id a library entry gets: kind-prefixed, name-normalised. */
export function instrumentId(kind: InstrumentKind, name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${kind}:${slug === '' ? 'untitled' : slug}`;
}

// --- reading a Noislet instrument -------------------------------------------

/**
 * Base64, decoded by hand for the same reason Noislet encodes it by hand: this
 * runs in a browser and in a test runner, `atob` is a global that wants a
 * byte-per-character string (and throws on exactly the bytes sample data is made
 * of), and `Buffer` is Node's. Sixteen lines of table lookup, no platform check.
 */
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Character code → 6-bit value, or -1 for anything base64 cannot hold. */
const B64_LOOKUP: Int8Array = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) table[B64_ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/** Decode base64 into bytes, ignoring whitespace; null when it is not base64. */
export function decodeBase64(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, '').replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let out = 0;
  let bits = 0;
  let value = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const digit = code < 128 ? B64_LOOKUP[code] : -1;
    if (digit < 0) return null;
    value = (value << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (value >> bits) & 0xff;
    }
  }
  return out === bytes.length ? bytes : bytes.slice(0, out);
}

/**
 * Read a `.instrument.json`, as text, into a playable font.
 *
 * The rules mirror the writer's, and they are strict in a way the song loader
 * deliberately is not. A damaged SONG must load anyway — it is somebody's work
 * in progress. A damaged INSTRUMENT must not: a pack of samples that came back
 * subtly wrong is an instrument that plays the wrong thing forever, and there is
 * no way to look at a song and see it. So the header is checked, a sound that
 * makes no sense is DROPPED with a sentence, and a file with nothing playable
 * left is refused rather than imported empty.
 *
 * A dropped sound is a warning, not an error, when others survive: five good
 * footsteps and one broken one is an instrument worth having.
 */
export function readNoisletInstrument(text: string): InstrumentImport {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['this file is not JSON, so it is not a Noislet instrument.'] };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: ['a Noislet instrument is a JSON object, and this is not one.'] };
  }
  const raw = value as Record<string, unknown>;
  if (raw.format !== INSTRUMENT_FORMAT) {
    return {
      ok: false,
      errors: [`this is not a Noislet instrument: it does not say "format": "${INSTRUMENT_FORMAT}".`],
    };
  }
  if (raw.version !== INSTRUMENT_VERSION) {
    return {
      ok: false,
      errors: [`this instrument is version ${String(raw.version)}, and this build reads version ${INSTRUMENT_VERSION}.`],
    };
  }
  const rate = Number(raw.sampleRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, errors: ['this instrument does not say what rate its samples are at.'] };
  }

  const name = importedName(typeof raw.instrument === 'string' ? raw.instrument : '');
  const list = Array.isArray(raw.sounds) ? raw.sounds : [];
  const warnings: string[] = [];
  const samples: FontSample[] = [];
  const presets: FontPreset[] = [];
  const pcm: number[] = [];
  const maxFrames = Math.max(1, Math.floor((MAX_IMPORT_MS / 1000) * rate));
  /**
   * The width the whole font is laid out at, decided as the file is read.
   *
   * It STARTS at whatever the first playable sound is and only ever widens to
   * stereo, because a font's PCM is one flat array: every sample has to agree on
   * how many values a frame costs, or a frame index means two different offsets.
   * Noislet writes stereo throughout, so in practice this never changes; it
   * exists for a hand-written file that mixes the two, where widening a mono
   * sound by copying its channel is both lossless and obviously right.
   */
  let width: 1 | 2 = 1;
  /** Frames already written to `pcm` — the frame origin of the next sample. */
  let framesSoFar = 0;

  list.forEach((entry, i) => {
    const at = `sound ${i + 1}`;
    if (typeof entry !== 'object' || entry === null) {
      warnings.push(`${at} is not an object \u2014 skipped it.`);
      return;
    }
    const sound = entry as Record<string, unknown>;
    const soundName = typeof sound.name === 'string' && sound.name.trim() !== ''
      ? sound.name.trim().toUpperCase()
      : '';
    if (soundName === '') {
      warnings.push(`${at} has no name \u2014 skipped it.`);
      return;
    }
    if (typeof sound.pcm !== 'string' || sound.pcm === '') {
      warnings.push(`"${soundName}" has no samples in it \u2014 skipped it.`);
      return;
    }
    const bytes = decodeBase64(sound.pcm);
    if (bytes === null) {
      warnings.push(`"${soundName}" has sample data that is not base64 \u2014 skipped it.`);
      return;
    }
    const channels: 1 | 2 = sound.channels === 1 ? 1 : 2;
    const perFrame = channels * 2;
    const inFile = Math.floor(bytes.length / perFrame);
    if (inFile === 0) {
      warnings.push(`"${soundName}" has no complete frames of audio \u2014 skipped it.`);
      return;
    }
    const frames = Math.min(inFile, maxFrames);
    if (frames < inFile) {
      warnings.push(`"${soundName}" is longer than ${MAX_IMPORT_MS / 1000} s \u2014 cut it short.`);
    }

    // The font's width is the widest sound in it. Anything read BEFORE a widening
    // sound is re-laid at the new width, which is why the values are collected
    // first and only then appended to the shared array.
    if (channels > width) {
      widen(pcm, width, channels);
      width = channels;
    }
    const start = framesSoFar;
    for (let f = 0; f < frames; f++) {
      for (let c = 0; c < width; c++) {
        // A mono sound in a stereo font sends the same value to both sides,
        // which is how a mono recording is meant to sit in a stereo instrument.
        const channel = channels === 1 ? 0 : c;
        const lo = bytes[(f * channels + channel) * 2];
        const hi = bytes[(f * channels + channel) * 2 + 1];
        // Little-endian, sign-extended: the byte order the format pins down.
        pcm.push(((lo | (hi << 8)) << 16) >> 16);
      }
    }
    const end = start + frames;
    framesSoFar = end;
    const loop = sound.loop === true;
    const rootKey = Number.isFinite(Number(sound.rootKey))
      ? Math.max(0, Math.min(127, Math.round(Number(sound.rootKey))))
      : 60;

    const sample: FontSample = {
      name: soundName,
      start,
      end,
      // A looped sound loops over all of itself: a pack's sound has no loop
      // points of its own (that is a property of somebody's recorded instrument,
      // not of a synthesized effect), so "loop" means "hold the whole thing".
      loopStart: loop ? start : 0,
      loopEnd: loop ? end : 0,
      sampleRate: rate,
      rootKey,
      correction: 0,
      loop,
    };
    const zone: FontZone = {
      // The whole keyboard, so a note never lands outside the pack. Transposing
      // is the instrument's job here, not the zone map's.
      keyLow: 0,
      keyHigh: 127,
      sample: samples.length,
      rootKey,
      tuneCents: 0,
      loop,
    };
    samples.push(sample);
    presets.push({ name: soundName, bank: 0, program: presets.length, zones: [zone] });
  });

  if (presets.length === 0) {
    return {
      ok: false,
      errors: [...warnings, 'this instrument holds no playable sounds.'],
    };
  }
  let dropped = 0;
  if (presets.length > MAX_FONT_PRESETS) {
    dropped = presets.length - MAX_FONT_PRESETS;
    // A font's preset slot is one knob's worth of values, so the tail of a
    // hundred-sound pack is unreachable. Saying so beats a knob that stops.
    warnings.push(`only the first ${MAX_FONT_PRESETS} sounds are playable, so ${dropped} were dropped.`);
  }

  const font: SoundFont = {
    name,
    presets: presets.slice(0, MAX_FONT_PRESETS),
    samples,
    pcm: Int16Array.from(pcm),
    channels: width,
  };
  const detail = `${presets.length - dropped} SOUND${presets.length - dropped === 1 ? '' : 'S'}  -  ${rate} HZ`;
  return { ok: true, name, font, detail, warnings };
}

/**
 * Re-lay flat PCM from one frame width to another, in place.
 *
 * Only ever called to WIDEN (mono → stereo), because that is the only direction a
 * font is ever converted: narrowing would throw a channel away, and a file's own
 * widths are known before anything is played. Values are copied, not averaged —
 * a mono sound in a stereo font is the same sound on both sides, which is what a
 * mono recording in a stereo session is supposed to be.
 *
 * The copy is a LOOP rather than `pcm.push(...widened)`, which is what this was
 * and is a trap worth naming: a spread is one function call argument per value,
 * so it dies on the argument-count limit — about a hundred thousand — and this
 * runs on the whole instrument so far, not on one sound. A pack of centred
 * effects with a panned one anywhere after them is exactly that shape, at exactly
 * the size this format is for (`instrument-format.md`: a few hundred kilobytes),
 * so the spread made the mixed-width case — the one the format documents at
 * length — import as "Maximum call stack size exceeded" for every realistic pack.
 * The unit test beside this file uses a file big enough to have caught it.
 */
function widen(pcm: number[], from: 1 | 2, to: 1 | 2): void {
  if (from === to) return;
  const widened: number[] = [];
  for (let i = 0; i < pcm.length; i += from) {
    for (let c = 0; c < to; c++) widened.push(pcm[i + (from === 1 ? 0 : c)] ?? pcm[i]);
  }
  pcm.length = 0;
  for (const value of widened) pcm.push(value);
}

/**
 * A library entry for a freshly imported Noislet pack.
 *
 * The one place the conversion decision lives — name, id, kind and detail — so
 * the scene's import handler and any test build the same entry from the same
 * parts.
 */
export function instrumentEntryFor(
  name: string,
  font: SoundFont,
  detail: string,
  kind: InstrumentKind = 'noislet',
): InstrumentEntry {
  const tidy = importedName(name);
  return { id: instrumentId(kind, tidy), name: tidy, kind, detail, font };
}
