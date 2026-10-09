import { describe, expect, it } from 'vitest';

import {
  EMPTY_LIBRARY, INSTRUMENT_FILE_EXTENSION, INSTRUMENT_FORMAT, INSTRUMENT_VERSION, MAX_IMPORT_MS,
  activeInstrument, addInstrument, decodeBase64, decodeInstrumentText, describeInstrument,
  findInstrument, importedName, instrumentEntryFor, instrumentFileKind, instrumentId, instrumentRows,
  readNoisletInstrument, removeInstrument, selectInstrument,
} from '../model/instrumentLibrary';
import type { InstrumentLibrary } from '../model/instrumentLibrary';
import { presetFor, zoneForNote } from '../model/soundfont';
import type { SoundFont } from '../model/soundfont';

/**
 * The reader, tested against the FORMAT rather than against a writer.
 *
 * Noislet's encoder is in another package, so a test that built its file with a
 * shared helper would prove nothing about the file Noislet actually writes. This
 * suite instead writes the JSON and the samples HERE, by hand, from the bytes the
 * format documents — and encodes the base64 with Node's `Buffer`, so the
 * hand-rolled decoder in the model is checked against an implementation that
 * knows nothing about it. That is the whole point: `doc/instrument-format.md` is
 * the contract, and this file is a second, independent reading of it.
 */

interface FakeSound {
  name: string;
  samples: number[];
  channels?: 1 | 2;
  rootKey?: number;
  loop?: boolean;
  category?: string;
  /** Overrides for deliberately-broken files. */
  pcm?: string | null;
  omitName?: boolean;
}

/**
 * Little-endian 16-bit PCM, base64, exactly as the format pins it down.
 *
 * Takes the interleaved values as the file holds them — the frame structure is
 * the READER's business, so this only has to get the bytes and the padding right.
 */
function pcmBase64(samples: readonly number[]): string {
  const bytes = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => bytes.writeInt16LE(value, i * 2));
  return bytes.toString('base64');
}

/** A whole instrument file, as text, built from the documented fields. */
function instrumentText(
  sounds: readonly FakeSound[],
  opts: { instrument?: string; sampleRate?: number; version?: number; format?: string } = {},
): string {
  return JSON.stringify({
    format: opts.format ?? INSTRUMENT_FORMAT,
    version: opts.version ?? INSTRUMENT_VERSION,
    instrument: opts.instrument ?? 'TEST KIT',
    source: 'Noislet (see noislet/doc/instrument-format.md)',
    sampleRate: opts.sampleRate ?? 44100,
    sounds: sounds.map((sound) => {
      const channels = sound.channels ?? 2;
      const samples = sound.samples;
      const frames = samples.length / channels;
      return {
        ...(sound.omitName ? {} : { name: sound.name }),
        category: sound.category ?? 'SYNTH',
        rootKey: sound.rootKey ?? 60,
        loop: sound.loop ?? false,
        channels,
        frames,
        pcm: sound.pcm === null ? '' : (sound.pcm ?? pcmBase64(samples)),
      };
    }),
  });
}

/** A sound whose samples are a recognisable ramp, so order is checkable. */
function ramp(frames: number, channels: 1 | 2): number[] {
  const out: number[] = [];
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) out.push((f + 1) * (c === 0 ? 1 : -1) * 100);
  }
  return out;
}

function readOrThrow(text: string): SoundFont {
  const read = readNoisletInstrument(text);
  if (!read.ok) throw new Error(`expected a readable instrument, got: ${read.errors.join(' / ')}`);
  return read.font;
}

describe('base64 decoding', () => {
  it('agrees with a real base64 encoder on every byte', () => {
    // 0..255 covers every character of the encoding alphabet's input space, and
    // the tail lengths cover both padding cases.
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(Array.from(decodeBase64(Buffer.from(bytes).toString('base64'))!)).toEqual(Array.from(bytes));

    for (const length of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const slice = bytes.slice(0, length);
      expect(Array.from(decodeBase64(Buffer.from(slice).toString('base64'))!)).toEqual(Array.from(slice));
    }
  });

  it('tolerates the whitespace an editor adds, and refuses what is not base64', () => {
    expect(Array.from(decodeBase64('TWFu\n')!)).toEqual([0x4d, 0x61, 0x6e]);
    expect(Array.from(decodeBase64('TWE')!)).toEqual([0x4d, 0x61]);
    expect(decodeBase64('not base64!')).toBeNull();
  });
});

/**
 * Telling a fetched file apart, which is what `instrument load` leans on.
 *
 * The statement names a PATH, so the file has to say what it is: one URL can end
 * in a soundfont and another in a Noislet pack, and neither the extension nor the
 * reader can be trusted to guess. This is the rule the song formats already use —
 * by the first character, not the extension — and it is testable without a
 * network, which is the whole reason it lives in `model/` rather than in the
 * scene's fetch.
 */
describe('which kind of file arrived', () => {
  it('reads a Noislet pack as the JSON it opens with', () => {
    const text = instrumentText([{ name: 'RIBBIT', samples: ramp(4, 2) }]);
    expect(instrumentFileKind(new TextEncoder().encode(text))).toBe('noislet');
  });

  it('sends everything that is not JSON to the soundfont reader', () => {
    // RIFF is how a real .sf2 starts. The point is the OTHER half: the soundfont
    // reader is the one that knows how to refuse a file that is neither, in
    // words, so only the JSON case has to be recognised here.
    expect(instrumentFileKind(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe('soundfont');
    expect(instrumentFileKind(new Uint8Array(0))).toBe('soundfont');
    expect(instrumentFileKind(new TextEncoder().encode('<html>404</html>'))).toBe('soundfont');
  });

  it('steps over a byte-order mark and leading whitespace', () => {
    // The two things a text file arrives wearing that are not the file.
    const json = new TextEncoder().encode('{"format":"noislet.instrument"}');
    expect(instrumentFileKind(new Uint8Array([0xef, 0xbb, 0xbf, ...json]))).toBe('noislet');
    expect(instrumentFileKind(new TextEncoder().encode('\n\r\t  {"a":1}'))).toBe('noislet');
  });

  it('decodes the fetched bytes back to the text the reader wants', () => {
    // Only for the JSON half: a soundfont is read from its bytes and never
    // becomes text at all.
    const text = instrumentText([{ name: 'CROAK', samples: ramp(2, 1) }]);
    expect(decodeInstrumentText(new TextEncoder().encode(text))).toBe(text);
  });
});

describe('reading a Noislet instrument', () => {
  it('turns each sound into a preset whose sample covers the whole keyboard', () => {
    const font = readOrThrow(instrumentText([
      { name: 'COIN', samples: ramp(8, 2) },
      { name: 'LASER', samples: ramp(4, 2) },
    ]));

    expect(font.name).toBe('TEST KIT');
    expect(font.presets.map((preset) => preset.name)).toEqual(['COIN', 'LASER']);
    expect(font.samples.map((sample) => sample.name)).toEqual(['COIN', 'LASER']);

    for (const preset of font.presets) {
      expect(preset.zones).toHaveLength(1);
      // The whole range, so a note can never land outside a pack.
      expect(preset.zones[0].keyLow).toBe(0);
      expect(preset.zones[0].keyHigh).toBe(127);
    }
  });

  it('appends each sound to the font PCM and gives it its own frame range', () => {
    const font = readOrThrow(instrumentText([
      { name: 'A', samples: [10, -10, 20, -20, 30, -30] },
      { name: 'B', samples: [40, -40, 50, -50] },
    ]));

    expect(font.pcm).toHaveLength(10);
    expect(font.samples[0].start).toBe(0);
    expect(font.samples[0].end).toBe(3);
    // The second sound starts where the first ended, in FRAMES — not at index 6,
    // which is the interleaving bug that would make stereo play at half speed.
    expect(font.samples[1].start).toBe(3);
    expect(font.samples[1].end).toBe(5);
    // Left channel first, right second, values intact and signed.
    expect(Array.from(font.pcm)).toEqual([10, -10, 20, -20, 30, -30, 40, -40, 50, -50]);
  });

  it('lays every sound out at the font\u2019s own width, widening a mono one', () => {
    // The property that makes the flat PCM array indexable at all: ONE width for
    // the whole font. A file that mixes the two gets the widest, so nothing has
    // to guess what a frame offset means.
    const mixed = readOrThrow(instrumentText([
      { name: 'MONO FIRST', samples: ramp(4, 1), channels: 1 },
      { name: 'STEREO SECOND', samples: ramp(4, 2) },
    ]));

    expect(mixed.channels).toBe(2);
    expect(mixed.samples[0].end - mixed.samples[0].start).toBe(4);
    // Frame ORIGINS, so the stereo sound starts where the mono one ended — not at
    // 8, which is what dividing the value count by the wrong width gives.
    expect(mixed.samples[1].start).toBe(4);
    // The mono sound was widened by copying: the same value on both sides.
    expect(Array.from(mixed.pcm.slice(0, 4))).toEqual([100, 100, 200, 200]);
  });

  it('keeps a wholly mono file mono', () => {
    const mono = readOrThrow(instrumentText([
      { name: 'A', samples: ramp(3, 1), channels: 1 },
      { name: 'B', samples: ramp(3, 1), channels: 1 },
    ]));
    expect(mono.channels).toBe(1);
    expect(mono.pcm).toHaveLength(6);
    expect(mono.samples[1].start).toBe(3);
  });

  it('keeps a wholly stereo file stereo', () => {
    const font = readOrThrow(instrumentText([
      { name: 'A', samples: ramp(4, 2) },
      { name: 'B', samples: ramp(4, 2) },
    ]));
    expect(font.channels).toBe(2);
    expect(font.pcm).toHaveLength(16);
    expect(font.samples[1].start).toBe(4);
  });

  it('carries the root key, so a pack transposes from the key the file names', () => {
    const font = readOrThrow(instrumentText([{ name: 'BASS', samples: ramp(4, 2), rootKey: 36 }]));
    expect(font.samples[0].rootKey).toBe(36);
    expect(font.presets[0].zones[0].rootKey).toBe(36);
  });

  it('makes a looped sound loop over all of itself, and a one-shot not at all', () => {
    const font = readOrThrow(instrumentText([
      { name: 'DRONE', samples: ramp(6, 2), loop: true },
      { name: 'HIT', samples: ramp(6, 2) },
    ]));

    expect(font.samples[0].loop).toBe(true);
    expect(font.samples[0].loopStart).toBe(0);
    expect(font.samples[0].loopEnd).toBe(6);
    expect(font.samples[1].loop).toBe(false);
    expect(font.samples[1].loopEnd).toBe(0);
  });

  it('plays the right sound for the duty knob and the right pitch for the note', () => {
    // The two knobs an imported pack is played with, through the SAME functions
    // a soundfont uses — which is the point of converting rather than inventing.
    const font = readOrThrow(instrumentText([
      { name: 'ONE', samples: ramp(4, 2) },
      { name: 'TWO', samples: ramp(4, 2) },
      { name: 'THREE', samples: ramp(4, 2) },
      { name: 'FOUR', samples: ramp(4, 2) },
    ]));

    expect(presetFor(font, 0)?.name).toBe('ONE');
    expect(presetFor(font, 99)?.name).toBe('FOUR');

    const zones = font.presets[1].zones;
    expect(zoneForNote(zones, 60)?.keyLow).toBe(0);
    // A note outside every range still resolves — the range is the guarantee.
    expect(zoneForNote(zones, 5)).not.toBeNull();
  });

  it('reads a one-sound file, because a leg is a legal kit', () => {
    const font = readOrThrow(instrumentText([{ name: 'SOLO', samples: ramp(10, 2) }]));
    expect(font.presets).toHaveLength(1);
  });

  it('drops a broken sound with a sentence and keeps the rest', () => {
    const read = readNoisletInstrument(instrumentText([
      { name: 'GOOD', samples: ramp(4, 2) },
      { name: 'BAD', samples: [], pcm: 'not base64!!' },
      { name: 'EMPTY', samples: [], pcm: null },
      { name: 'NAMELESS', samples: ramp(4, 2), omitName: true },
    ]));

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.font.presets.map((preset) => preset.name)).toEqual(['GOOD']);
    expect(read.warnings).toHaveLength(3);
    expect(read.warnings.join(' ')).toContain('BAD');
    // A sound with no name has no name to quote, so it is reported by position.
    expect(read.warnings.join(' ')).toContain('sound 4 has no name');
  });

  it('refuses a file that is not an instrument, in words, without importing anything', () => {
    const notJson = readNoisletInstrument('this is not json');
    expect(notJson.ok).toBe(false);
    if (!notJson.ok) expect(notJson.errors[0]).toContain('not JSON');

    const wrongFormat = readNoisletInstrument(instrumentText([{ name: 'A', samples: ramp(2, 2) }], { format: 'tracklet.song' }));
    expect(wrongFormat.ok).toBe(false);
    if (!wrongFormat.ok) expect(wrongFormat.errors[0]).toContain('not a Noislet instrument');

    const wrongVersion = readNoisletInstrument(instrumentText([{ name: 'A', samples: ramp(2, 2) }], { version: 7 }));
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok) expect(wrongVersion.errors[0]).toContain('version 7');

    // A file with nothing playable in it is refused rather than imported empty:
    // an instrument with no presets is a channel that can never make a sound.
    const nothing = readNoisletInstrument(instrumentText([{ name: 'X', samples: [], pcm: '####' }]));
    expect(nothing.ok).toBe(false);
    if (!nothing.ok) expect(nothing.errors.join(' ')).toContain('no playable sounds');
  });

  it('clamps a nonsense root key into the MIDI range', () => {
    const font = readOrThrow(instrumentText([{ name: 'A', samples: ramp(4, 2), rootKey: 900 }]));
    expect(font.samples[0].rootKey).toBe(127);
  });

  it('cuts an absurdly long sound short rather than hanging the browser', () => {
    // A file somebody edited by hand: past the guard, so it is trimmed with a
    // warning instead of being swallowed byte for byte.
    const frames = Math.ceil((MAX_IMPORT_MS / 1000) * 8000) + 50;
    const samples = new Array(frames * 2).fill(1000);
    const read = readNoisletInstrument(instrumentText(
      [{ name: 'MARATHON', samples }],
      { sampleRate: 8000 },
    ));

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.font.samples[0].end - read.font.samples[0].start).toBe((MAX_IMPORT_MS / 1000) * 8000);
    expect(read.warnings.join(' ')).toContain('cut it short');
  });

  it('widens a MONO sound into a stereo pack at a real length', () => {
    // The mixed-width case the format documents at length, and the one no small
    // fixture exercises: a centred sound followed by a panned one has to re-lay
    // everything read so far at the wider frame. Six seconds of mono is 265k
    // frames, and the copy of them is what a spread argument list cannot do —
    // this is the size a pack of game effects actually is, and reading one used
    // to fail with "Maximum call stack size exceeded".
    const frames = 44100 * 6;
    // A sawtooth that stays inside 16-bit over a quarter of a million frames
    // (`ramp` above is for the small fixtures, and would overflow here).
    const mono = Array.from({ length: frames }, (_, f) => ((f % 300) + 1) * 100);
    const font = readOrThrow(instrumentText([
      { name: 'CENTRED', samples: mono, channels: 1 },
      { name: 'PANNED', samples: ramp(64, 2), channels: 2 },
    ]));
    expect(font.channels).toBe(2);
    expect(font.samples[0].end - font.samples[0].start).toBe(frames);
    // Every frame of the mono sound is now two identical values, in order.
    for (const frame of [0, 1, 1000, frames - 1]) {
      const at = font.samples[0].start + frame * font.channels;
      expect(font.pcm[at]).toBe(((frame % 300) + 1) * 100);
      expect(font.pcm[at + 1]).toBe(font.pcm[at]);
    }
    // And the panned sound after it is still on its own two sides. (`start` is a
    // FRAME index into a flat array of values, so the width multiplies in — the
    // one arithmetic mistake this format invites, so it is spelled out here.)
    const second = font.samples[1].start * font.channels;
    expect(font.pcm[second]).toBe(100);
    expect(font.pcm[second + 1]).toBe(-100);
  });

  it('pins the magic string and the extension the menu shows', () => {
    expect(INSTRUMENT_FILE_EXTENSION).toBe('.instrument.json');
    expect(INSTRUMENT_FORMAT).toBe('noislet.instrument');
    // The reader refuses a file whose `format` is anything else, which is the
    // one field that keeps a .noislet.json from being mistaken for this.
    const other = instrumentText([{ name: 'A', samples: ramp(2, 2) }], { format: 'noislet.project' });
    expect(readNoisletInstrument(other).ok).toBe(false);
  });
});

describe('the instrument library', () => {
  const entry = (name: string) => instrumentEntryFor(
    name,
    readOrThrow(instrumentText([{ name: 'S', samples: ramp(4, 2) }])),
    '1 SOUND  -  44100 HZ',
  );

  const add = (library: InstrumentLibrary, name: string): InstrumentLibrary =>
    addInstrument(library, entry(name)).library;

  it('starts empty, with nothing active', () => {
    expect(EMPTY_LIBRARY.entries).toHaveLength(0);
    expect(EMPTY_LIBRARY.active).toBe(-1);
    expect(activeInstrument(EMPTY_LIBRARY)).toBeNull();
  });

  it('adds instruments and makes the newest one active', () => {
    const library = add(add(EMPTY_LIBRARY, 'FIRST'), 'SECOND');
    expect(library.entries.map((item) => item.name)).toEqual(['FIRST', 'SECOND']);
    expect(activeInstrument(library)?.name).toBe('SECOND');
  });

  it('REPLACES an import of the same name instead of piling up copies', () => {
    // The round trip this feature exists for: tweak in Noislet, export, import
    // again — and the instrument a channel is pointing at is the new one.
    const first = addInstrument(EMPTY_LIBRARY, entry('FOOTSTEPS'));
    const again = addInstrument(first.library, entry('FOOTSTEPS'));

    expect(again.library.entries).toHaveLength(1);
    expect(again.replaced).toBe(true);
    expect(again.library.active).toBe(0);
  });

  it('selects by number or by name, and ignores what is not there', () => {
    const library = add(add(add(EMPTY_LIBRARY, 'ALPHA'), 'BETA'), 'GAMMA');

    expect(findInstrument(library, '2')?.name).toBe('BETA');
    expect(findInstrument(library, 'beta')?.name).toBe('BETA');
    expect(findInstrument(library, '  BETA  ')?.name).toBe('BETA');
    // 1-based, because the list is: `instrument use 1` is the first one.
    expect(findInstrument(library, '1')?.name).toBe('ALPHA');
    expect(findInstrument(library, '4')).toBeNull();
    expect(findInstrument(library, 'nope')).toBeNull();
    expect(findInstrument(library, '')).toBeNull();

    const selected = selectInstrument(library, instrumentId('noislet', 'ALPHA'));
    expect(activeInstrument(selected)?.name).toBe('ALPHA');
    // An unknown id changes nothing rather than clearing the selection.
    expect(selectInstrument(library, 'noislet:nope').active).toBe(library.active);
  });

  it('keeps the selection on something real when an instrument is removed', () => {
    const library = add(add(add(EMPTY_LIBRARY, 'A'), 'B'), 'C');

    // Removing the active one falls back to its neighbour, not to nothing.
    const activeB = selectInstrument(library, instrumentId('noislet', 'B'));
    const afterRemovingB = removeInstrument(activeB, instrumentId('noislet', 'B'));
    expect(afterRemovingB.entries.map((item) => item.name)).toEqual(['A', 'C']);
    expect(activeInstrument(afterRemovingB)?.name).toBe('C');

    // Removing one BELOW the selection keeps the same instrument selected.
    const stillC = removeInstrument(activeB, instrumentId('noislet', 'A'));
    expect(activeInstrument(stillC)?.name).toBe('B');

    // Removing the last one leaves the library empty rather than dangling.
    const empty = removeInstrument(add(EMPTY_LIBRARY, 'ONLY'), instrumentId('noislet', 'ONLY'));
    expect(empty).toEqual(EMPTY_LIBRARY);
    expect(activeInstrument(empty)).toBeNull();
  });

  it('lists itself as rows a menu can draw, with the active one marked', () => {
    const library = selectInstrument(add(add(EMPTY_LIBRARY, 'A'), 'B'), instrumentId('noislet', 'A'));
    const rows = instrumentRows(library);

    expect(rows.map((row) => row.name)).toEqual(['A', 'B']);
    expect(rows.map((row) => row.active)).toEqual([true, false]);
    expect(rows[0].meta).toContain('NOISLET');
    expect(rows[0].meta).toContain('1 SOUND');
  });

  it('keeps two kinds apart, so a soundfont and a pack cannot collide', () => {
    expect(instrumentId('noislet', 'FIRE BED')).toBe('noislet:fire-bed');
    expect(instrumentId('soundfont', 'Fire Bed')).toBe('soundfont:fire-bed');
  });

  it('describes itself the same way Noislet does', () => {
    const described = describeInstrument(entry('KIT'));
    expect(described).toContain('1 PRESET');
    expect(described).toContain('1 SAMPLE');
    expect(described).toContain('S');
  });

  it('tidies a name into one a script can say', () => {
    expect(importedName('  fire   bed ')).toBe('FIRE BED');
    expect(importedName('')).toBe('IMPORTED');
  });
});
