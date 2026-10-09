/**
 * recorder — capturing audio in a browser, and the honest answer when it cannot.
 *
 * ── The boundary ────────────────────────────────────────────────────────────
 * Everything else in the app is arithmetic over data the app already holds. Audio
 * IN is the one thing that needs a browser: a microphone, permission, and a
 * decoder. So the whole capability lives here, small and quarantined, and the
 * model and page never touch it — the same boundary `export.audio` draws on the
 * way out.
 *
 * ── What it does ────────────────────────────────────────────────────────────
 * `startCapture()` asks for the microphone, records to an in-memory blob, and on
 * `stop()` decodes it to ONE channel of frames at the context's own rate — the
 * shape a `Sample` wants (`src/model/sample.ts`). Nothing is written to disk and
 * the user's file is never touched.
 *
 * ── What it refuses, and why ────────────────────────────────────────────────
 * A build with no `getUserMedia`, no `MediaRecorder`, or no `AudioContext` cannot
 * capture, and says so in words (`captureRefusal`) rather than silently doing
 * nothing — the `export.audio` precedent, on the way in.
 */

/** One microphone the page can offer, as the browser describes it. */
export interface MicDevice {
  /** The opaque id `getUserMedia` takes; `''` is the browser's own default. */
  id: string;
  /** What a person reads, e.g. `Built-in microphone`. May be blank pre-permission. */
  label: string;
}

/** An input level reading, taken between frames while the meter is open. */
export interface MicLevel {
  /** Root-mean-square of the frames just read, 0..1 — the bar's body. */
  rms: number;
  /** The loudest frame just read, 0..1 — what the CLIP lamp watches. */
  peak: number;
}

/** A live input meter, to be polled for its level and closed when done. */
export interface MeterSession {
  /** The level over the most recent frames. Cheap; safe to call every frame. */
  level(): MicLevel;
  /** Let the microphone go. Safe to call more than once. */
  stop(): void;
}

/** Decoded capture audio: one channel of frames, ready to become a `Sample`. */
export interface CaptureAudio {
  /** The context's sample rate, in Hz. */
  rate: number;
  /** One channel of frames, -1..1. */
  pcm: Float32Array;
}

/** A capture in progress, to be stopped for its audio or thrown away. */
export interface CaptureSession {
  stop(): Promise<CaptureAudio>;
  cancel(): void;
}

/** The reason this build cannot record, or null when it can. */
export function captureRefusal(): string | null {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'this browser cannot reach a microphone.';
  }
  if (typeof MediaRecorder === 'undefined') {
    return 'this browser cannot record from the microphone.';
  }
  const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (typeof Ctx !== 'function') {
    return 'this browser cannot decode recorded audio.';
  }
  return null;
}

/** True when a capture is possible here. */
export function canCapture(): boolean {
  return captureRefusal() === null;
}

/**
 * The reason this build cannot MEASURE the microphone, or null when it can.
 *
 * A shorter ladder than `captureRefusal`, because a meter needs only a stream
 * and an analyser — it never records, so it does not need `MediaRecorder`, and
 * the two capabilities are reported separately rather than making the page say a
 * build cannot listen because it cannot also keep what it hears.
 */
export function meterRefusal(): string | null {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'this browser cannot reach a microphone.';
  }
  const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (typeof Ctx !== 'function') {
    return 'this browser cannot measure the microphone.';
  }
  return null;
}

/** True when a live input meter can be opened here. */
export function canMeter(): boolean {
  return meterRefusal() === null;
}

/**
 * The microphones this machine offers, or an empty list when it cannot say.
 *
 * `enumerateDevices` reports a device before permission is granted too, but with
 * an EMPTY label — which is why the ids are offered even when the names are not:
 * a page can list its inputs, and the names fill in once the user has allowed the
 * microphone (see `listInputDevices` again after the first `getUserMedia`).
 * Nothing here asks for permission by itself, so calling it is not a prompt.
 */
export async function listInputDevices(): Promise<MicDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === 'audioinput');
    return inputs.map((device, index) => ({
      id: device.deviceId,
      // A blank label is the pre-permission case; number it so two unnamed
      // inputs are still two choices rather than one repeated row.
      label: device.label || `Input ${index + 1}`,
    }));
  } catch {
    return [];
  }
}

/** The audio constraints for a chosen device, or a plain request when none. */
function audioConstraints(deviceId?: string): MediaStreamConstraints {
  return deviceId ? { audio: { deviceId: { exact: deviceId } } } : { audio: true };
}

/**
 * Open a live input meter: a stream and an analyser, read between frames.
 *
 * This is the ONLY thing on the page that holds the microphone open WITHOUT
 * recording, so it is deliberately a separate, explicit call the user makes (or
 * `RECORD` makes on their behalf) — never something that happens on a page load.
 * Rejects with the permission error the browser gives, which the caller shows.
 */
export async function startMeter(deviceId?: string): Promise<MeterSession> {
  const refusal = meterRefusal();
  if (refusal) throw new Error(refusal);

  const stream = await navigator.mediaDevices.getUserMedia(audioConstraints(deviceId));
  const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext as typeof AudioContext;
  const context = new Ctx();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);

  let stopped = false;
  const release = (): void => {
    if (stopped) return;
    stopped = true;
    try { source.disconnect(); } catch { /* already gone */ }
    for (const track of stream.getTracks()) track.stop();
    void context.close();
  };

  return {
    level: (): MicLevel => {
      if (stopped) return { rms: 0, peak: 0 };
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < buffer.length; i++) {
        const value = buffer[i];
        sum += value * value;
        const magnitude = Math.abs(value);
        if (magnitude > peak) peak = magnitude;
      }
      return { rms: Math.sqrt(sum / buffer.length), peak: Math.min(peak, 1) };
    },
    stop: release,
  };
}

/**
 * Fold decoded channels to one, the way `monoPcm` folds a file.
 *
 * A capture is a mono take for the same reason a loaded sample is: the channel it
 * plays on already has a `pan`, and two pans is one control with two names.
 */
function fold(buffer: AudioBuffer): Float32Array {
  const channels = Math.max(1, buffer.numberOfChannels);
  if (channels === 1) return buffer.getChannelData(0).slice();
  const length = buffer.length;
  const out = new Float32Array(length);
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) out[i] += data[i];
  }
  for (let i = 0; i < length; i++) out[i] /= channels;
  return out;
}

/**
 * Begin a capture. Rejects when the microphone is refused or unavailable, with a
 * sentence the caller can show.
 */
export async function startCapture(deviceId?: string): Promise<CaptureSession> {
  const refusal = captureRefusal();
  if (refusal) throw new Error(refusal);

  const stream = await navigator.mediaDevices.getUserMedia(audioConstraints(deviceId));
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
  recorder.start();

  let done = false;
  const release = (): void => {
    if (done) return;
    done = true;
    for (const track of stream.getTracks()) track.stop();
  };

  return {
    stop: async (): Promise<CaptureAudio> => {
      const blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks));
        recorder.stop();
      });
      release();
      const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext as typeof AudioContext;
      const context = new Ctx();
      try {
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        return { rate: decoded.sampleRate, pcm: fold(decoded) };
      } finally {
        void context.close();
      }
    },
    cancel: (): void => {
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
      release();
    },
  };
}
