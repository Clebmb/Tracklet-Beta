import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canCapture,
  canMeter,
  captureRefusal,
  listInputDevices,
  meterRefusal,
  startCapture,
  startMeter,
} from '../audio/recorder';

/**
 * The RECORDER page's IN half, at the boundary the browser draws.
 *
 * Capturing is the one thing in the app that needs a microphone and a decoder,
 * so `audio/recorder.ts` is quarantined to say WHAT a build is missing in words
 * rather than silently doing nothing — the same honesty `export.audio` keeps on
 * the way out. That is exactly the part a test can pin here, where there is no
 * browser at all: this build CANNOT capture, and it must say so.
 *
 * The refusal is a LADDER — a microphone, then a recorder, then a decoder — and
 * these tests walk it one rung at a time, so a build that gains one capability
 * still names the next one missing rather than claiming it can record.
 */

describe('the recorder refuses honestly where it cannot capture', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses on a build with no browser input, in words', () => {
    // No navigator/MediaRecorder here: the answer must be a sentence, not blank.
    const refusal = captureRefusal();
    expect(typeof refusal).toBe('string');
    expect((refusal ?? '').length).toBeGreaterThan(10);
    expect(canCapture()).toBe(false);
  });

  it('rejects a capture attempt rather than returning an unusable session', async () => {
    await expect(startCapture()).rejects.toThrow(captureRefusal() ?? '');
  });

  it('names each missing capability in turn, and clears when none is missing', () => {
    const noRecorder = captureRefusal();
    // A microphone, but no recorder.
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => {} } });
    const recorder = captureRefusal();
    expect(recorder).toBe('this browser cannot record from the microphone.');
    // A recorder, but no decoder.
    vi.stubGlobal('MediaRecorder', function MediaRecorder() {});
    const decoder = captureRefusal();
    expect(decoder).toBe('this browser cannot decode recorded audio.');
    // Everything present: no refusal, and the page may offer the button.
    vi.stubGlobal('AudioContext', function AudioContext() {});
    expect(captureRefusal()).toBeNull();
    expect(canCapture()).toBe(true);

    // The three sentences are distinct, so the ladder never collapses to one.
    expect(new Set([noRecorder, recorder, decoder]).size).toBe(3);
  });
});

describe('the input meter is a shorter, separate ladder', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses where there is no microphone, in words', () => {
    expect(meterRefusal()).toBe('this browser cannot reach a microphone.');
    expect(canMeter()).toBe(false);
  });

  it('needs an analyser but not a recorder', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => {} } });
    expect(meterRefusal()).toBe('this browser cannot measure the microphone.');
    vi.stubGlobal('AudioContext', function AudioContext() {});
    expect(meterRefusal()).toBeNull();
    expect(canMeter()).toBe(true);
  });

  it('rejects opening a meter rather than returning an unusable session', async () => {
    await expect(startMeter()).rejects.toThrow(meterRefusal() ?? '');
  });
});

describe('the page can list the microphones without asking for one', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers nothing when the browser cannot enumerate', async () => {
    expect(await listInputDevices()).toEqual([]);
  });

  it('keeps only inputs, and numbers the unnamed ones', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: () => {},
        enumerateDevices: async () => [
          { kind: 'audioinput', deviceId: 'a', label: 'Built-in microphone' },
          { kind: 'videoinput', deviceId: 'cam', label: 'FaceTime HD' },
          { kind: 'audioinput', deviceId: 'b', label: '' },
        ],
      },
    });
    const devices = await listInputDevices();
    expect(devices).toEqual([
      { id: 'a', label: 'Built-in microphone' },
      { id: 'b', label: 'Input 2' },
    ]);
  });
});
