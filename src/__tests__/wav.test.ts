import { describe, expect, it } from 'vitest';

import { encodeWav, pcmSeconds, type PcmAudio } from '../audio/wav';

/**
 * The WAV encoder, tested against the format rather than against itself.
 *
 * A `.wav` that is subtly wrong still downloads without complaint, which is
 * exactly why the header is checked field by field here: the sizes, the channel
 * count, the interleave order and the way a hot sample is clamped are all things
 * a player notices and a browser does not. The bytes are read back with a
 * `DataView` so the test says what the FILE says, not what the writer intended.
 */

const ascii = (view: DataView, offset: number, length: number): string =>
  Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');

function stereo(left: number[], right: number[]): PcmAudio {
  return { channels: [Float32Array.from(left), Float32Array.from(right)], sampleRate: 44100 };
}

describe('the WAV header', () => {
  it('is the boring 44-byte PCM header a player expects', () => {
    const pcm = stereo([0, 0], [0, 0]);
    const view = new DataView(encodeWav(pcm));
    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 8); // two frames of two channels of 2 bytes
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // uncompressed PCM
    expect(view.getUint16(22, true)).toBe(2); // stereo
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(44100 * 4); // byte rate = rate * blockAlign
    expect(view.getUint16(32, true)).toBe(4); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(ascii(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(8);
  });

  it('declares one channel when there is one, rather than duplicating it', () => {
    const view = new DataView(encodeWav({ channels: [Float32Array.from([0, 0, 0])], sampleRate: 22050 }));
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint32(40, true)).toBe(6);
  });

  it('survives an empty clip instead of writing a broken header', () => {
    const view = new DataView(encodeWav({ channels: [], sampleRate: 44100 }));
    expect(view.byteLength).toBe(44);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(40, true)).toBe(0);
  });
});

describe('the samples', () => {
  it('interleaves the channels frame by frame, not channel by channel', () => {
    // L R L R: a stereo file written as two blocks plays at double speed with the
    // channels out of phase, which is the bug this test exists to catch.
    const view = new DataView(encodeWav(stereo([1, 0.5], [-1, -0.5])));
    expect(view.getInt16(44, true)).toBe(32767); // L[0]
    expect(view.getInt16(46, true)).toBe(-32768); // R[0]
    expect(view.getInt16(48, true)).toBe(Math.round(0.5 * 32767)); // L[1]
    expect(view.getInt16(50, true)).toBe(Math.round(-0.5 * 32768)); // R[1]
  });

  it('clamps a hot sample, so a loud mix distorts instead of wrapping around', () => {
    const view = new DataView(encodeWav({ channels: [Float32Array.from([2, -2, Number.NaN])], sampleRate: 44100 }));
    expect(view.getInt16(44, true)).toBe(32767); // +1.0, not a negative
    expect(view.getInt16(46, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(0); // NaN reads as silence, not garbage
  });

  it('puts +1.0 at the positive ceiling, not a value that reads back as -1', () => {
    // The classic off-by-one: 32768 for both signs sends +1.0 to a negative.
    const view = new DataView(encodeWav(stereo([1], [0])));
    expect(view.getInt16(44, true)).toBe(32767);
  });
});

describe('how long the audio is', () => {
  it('counts frames over the sample rate, not bytes', () => {
    expect(pcmSeconds(stereo([0, 0, 0, 0], [0, 0, 0, 0]))).toBeCloseTo(4 / 44100, 10);
    expect(pcmSeconds({ channels: [new Float32Array(22050)], sampleRate: 22050 })).toBeCloseTo(1, 10);
  });

  it('answers zero rather than dividing by a nonsense rate', () => {
    expect(pcmSeconds({ channels: [new Float32Array(0)], sampleRate: 0 })).toBe(0);
    expect(pcmSeconds({ channels: [], sampleRate: 44100 })).toBe(0);
  });
});
