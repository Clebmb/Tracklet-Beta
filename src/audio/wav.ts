/**
 * wav — rendered audio as bytes, with no browser involved.
 *
 * The renderer in `render.ts` needs an `OfflineAudioContext`, which only exists in
 * a browser; this does not. Turning samples into a `.wav` is arithmetic on arrays,
 * so it lives on its own where it can be tested on its own — and a WAV that is
 * subtly wrong (an off-by-four header, channels not interleaved, a half-written
 * last sample) is a file that opens in nothing, which is exactly the kind of bug
 * that hides behind "it downloaded, so it worked".
 *
 * The format is the boring, universally-readable one: 16-bit signed PCM, little
 * endian, one `fmt ` chunk and one `data` chunk. No metadata, no extensible
 * header, nothing a player has to be clever to read.
 */

/** Samples, already mixed down to the channels that will be written. */
export interface PcmAudio {
  /** One array per channel, all the same length, each sample in -1..1. */
  channels: Float32Array[];
  sampleRate: number;
}

/** A 16-bit sample, clamped so a hot mix distorts instead of wrapping around. */
function toInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0));
  // 32767 rather than 32768 on the positive side: the negative side has one more
  // step than the positive one, and using 32768 for both sends +1.0 to a value
  // that reads back as -1.0 — the classic way a loud export sounds broken.
  return Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767);
}

/**
 * A `.wav` file, as an `ArrayBuffer`.
 *
 * Channels are INTERLEAVED — `L R L R` — because that is what the format means by
 * a frame, and a stereo file written as two blocks of one channel each is a file
 * that plays at double speed with the channels out of phase. Mono is written as
 * mono rather than duplicated, so a file says what it is.
 */
export function encodeWav(pcm: PcmAudio): ArrayBuffer {
  const channels = pcm.channels.length > 0 ? pcm.channels : [new Float32Array(0)];
  const channelCount = channels.length;
  const frames = channels[0].length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataBytes = frames * blockAlign;

  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  // --- RIFF header ----------------------------------------------------------
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true); // everything after this field
  writeAscii(8, 'WAVE');

  // --- fmt chunk ------------------------------------------------------------
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunks are 16 bytes
  view.setUint16(20, 1, true); // 1 = uncompressed PCM
  view.setUint16(22, channelCount, true);
  view.setUint32(24, Math.round(pcm.sampleRate), true);
  view.setUint32(28, Math.round(pcm.sampleRate) * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample

  // --- data chunk -----------------------------------------------------------
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      view.setInt16(offset, toInt16(channels[channel][frame]), true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

/** How long the audio is, which is also `dataBytes / (rate * blockAlign)`. */
export function pcmSeconds(pcm: PcmAudio): number {
  const frames = pcm.channels[0]?.length ?? 0;
  return pcm.sampleRate > 0 ? frames / pcm.sampleRate : 0;
}

// --- the way back: somebody else's file -------------------------------------

/**
 * A `.wav` read back as samples, or the sentence saying why it will not be.
 *
 * Refusals rather than repairs, and they NAME the thing that is wrong: the one
 * failure a person can act on is knowing that their file is compressed, or
 * 12-bit, or not a WAV at all. Silently importing a mangled guess would be
 * worse than importing nothing, because it would sound almost right.
 */
export type WavRead = { ok: true; pcm: PcmAudio } | { ok: false; error: string };

/** The four ASCII bytes at `offset`, which is how a chunk id reads. */
function chunkId(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/** One sample of one format, scaled into -1..1. */
function readFrame(
  view: DataView,
  offset: number,
  format: 1 | 3,
  bits: number,
): number {
  if (format === 3) return bits === 64 ? view.getFloat64(offset, true) : view.getFloat32(offset, true);
  if (bits === 8) {
    // 8-bit PCM is UNSIGNED, with 128 as its zero. Reading it as signed is the
    // classic half-loud, crunchy import.
    return (view.getUint8(offset) - 128) / 128;
  }
  if (bits === 16) return view.getInt16(offset, true) / 32768;
  if (bits === 24) {
    const lo = view.getUint8(offset);
    const mid = view.getUint8(offset + 1);
    const hi = view.getInt8(offset + 2);
    return (((hi << 16) | (mid << 8) | lo) / 8388608);
  }
  return view.getInt32(offset, true) / 2147483648;
}

/**
 * Read a `.wav` into flat, de-interleaved channels.
 *
 * The format accepted is the boring one the encoder writes, plus the near
 * neighbours a real file is likely to be: uncompressed PCM at 8, 16, 24 or 32
 * bits, or IEEE float at 32 or 64, any channel count from one up. Chunks are
 * walked rather than assumed, because a file written by anything but this app
 * carries `LIST`, `fact`, `smpl` or a `cube` between the header and the audio,
 * and a reader that expects the data at byte 44 reads somebody's metadata as
 * music.
 */
export function decodeWav(bytes: ArrayBuffer): WavRead {
  if (bytes.byteLength < 44) {
    return { ok: false, error: 'the file is too small to be a WAV.' };
  }
  const view = new DataView(bytes);
  const riff = chunkId(view, 0);
  if (riff !== 'RIFF') {
    return {
      ok: false,
      error: riff === 'RIFX'
        ? 'this WAV is big endian (RIFX), which this app does not read.'
        : 'the file is not a WAV: it does not start with RIFF.',
    };
  }
  if (chunkId(view, 8) !== 'WAVE') {
    return { ok: false, error: 'the file says RIFF but not WAVE \u2014 it is not a WAV.' };
  }

  let format: 1 | 3 | null = null;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let blockAlign = 0;
  let dataOffset = -1;
  let dataBytes = 0;

  let at = 12;
  while (at + 8 <= bytes.byteLength) {
    const id = chunkId(view, at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    const available = bytes.byteLength - body;
    const length = Math.min(size, Math.max(0, available));
    if (id === 'fmt ') {
      if (length < 16) return { ok: false, error: 'this WAV\u2019s "fmt " chunk is too short to say anything.' };
      let code = view.getUint16(body, true);
      // WAVE_FORMAT_EXTENSIBLE hides the real format in a sub-format field at
      // the end of the chunk; the first two bytes of it are the old code.
      if (code === 0xfffe) {
        if (length < 26) return { ok: false, error: 'this WAV is extensible but its sub-format is missing.' };
        code = view.getUint16(body + 24, true);
      }
      if (code !== 1 && code !== 3) {
        const what = code === 2 ? 'ADPCM-compressed' : code === 6 ? 'A-law' : code === 7 ? '\u00b5-law' : `compressed (format ${code})`;
        return {
          ok: false,
          error: `this WAV is ${what}. Import an uncompressed PCM one \u2014 8, 16, 24 or 32 bits, or 32-bit float.`,
        };
      }
      format = code;
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      blockAlign = view.getUint16(body + 12, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === 'data' && dataOffset < 0) {
      dataOffset = body;
      dataBytes = length;
    }
    // Chunks are word-aligned: an odd-sized one carries a pad byte that is not
    // part of it, and stepping by the size alone walks off into the padding.
    at = body + length + (length % 2);
    if (size === 0) break;
  }

  if (format === null) return { ok: false, error: 'this WAV has no "fmt " chunk, so it does not say what it holds.' };
  if (dataOffset < 0) return { ok: false, error: 'this WAV has no "data" chunk: there is no audio in it.' };
  if (channels === 0) return { ok: false, error: 'this WAV says it has no channels.' };
  if (sampleRate === 0) return { ok: false, error: 'this WAV says its sample rate is zero.' };
  const bytesPerSample = bits / 8;
  const okBits = format === 1 ? bits === 8 || bits === 16 || bits === 24 || bits === 32 : bits === 32 || bits === 64;
  if (!okBits || !Number.isInteger(bytesPerSample)) {
    return {
      ok: false,
      error: format === 1
        ? `this WAV is ${bits}-bit PCM. This app reads 8, 16, 24 and 32 bit PCM, or 32-bit float.`
        : `this WAV is ${bits}-bit float, and float samples are 32 or 64 bits.`,
    };
  }
  const aligned = blockAlign > 0 ? blockAlign : channels * bytesPerSample;
  const frames = Math.floor(dataBytes / aligned);
  if (frames === 0) return { ok: false, error: 'this WAV\u2019s data chunk is empty \u2014 there is a header and no audio.' };

  const out: Float32Array[] = [];
  for (let channel = 0; channel < channels; channel++) out.push(new Float32Array(frames));
  for (let frame = 0; frame < frames; frame++) {
    const base = dataOffset + frame * aligned;
    for (let channel = 0; channel < channels; channel++) {
      out[channel][frame] = readFrame(view, base + channel * bytesPerSample, format, bits);
    }
  }
  return { ok: true, pcm: { channels: out, sampleRate } };
}

/**
 * Fold a multi-channel read down to one channel of frames.
 *
 * Averaged rather than picked, so a stereo file that is really two sides of one
 * performance does not lose half of itself — and mono comes back untouched, so
 * the common case costs nothing.
 */
export function monoPcm(pcm: PcmAudio): Float32Array {
  const first = pcm.channels[0];
  if (!first) return new Float32Array(0);
  if (pcm.channels.length === 1) return first;
  const out = new Float32Array(first.length);
  for (const channel of pcm.channels) {
    for (let i = 0; i < out.length; i++) out[i] += channel[i] ?? 0;
  }
  for (let i = 0; i < out.length; i++) out[i] /= pcm.channels.length;
  return out;
}
