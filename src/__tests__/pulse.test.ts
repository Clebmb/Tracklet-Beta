import { describe, expect, it } from 'vitest';

import { buildNote, MAX_PULSE_WIDTH, MIN_PULSE_WIDTH, pulsePeriodicWave, pulseWidthFor } from '../audio/synth';
import {
  clampParam,
  createSong,
  DEFAULT_VOICE,
  layerFromVoice,
  patchFromVoice,
  sameVoice,
  VOICE_PARAM_BY_ID,
  VOICE_PARAMS,
  VOICES,
  type VoiceParams,
} from '../model';
import { applyScript } from '../model/script';
import { SONG_FILE_VERSION, songFromJson, songToJson, songToScript } from '../model/songfile';

/**
 * Pulse duty, tested as the thing that makes the chiptune shelf more than a
 * preset pack: the sixth voice knob, and the one sound it actually changes.
 *
 * The load-bearing promise is that a channel which never mentions duty is built
 * from EXACTLY the oscillator it always was — the browser's own square, not a
 * Fourier table that merely resembles it — so every existing song stays
 * byte-identical. The rest pins down the mapping at both ends and that the knob
 * is inert on the three waveforms that have no duty to set.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

function dutyVoice(duty: number): VoiceParams {
  return { ...DEFAULT_VOICE, wave: 'square', duty };
}

describe('duty is a shape knob with the square wave at one end', () => {
  it('is the sixth knob and defaults to the full square', () => {
    expect(VOICE_PARAMS.map((p) => p.id)).toContain('duty');
    expect(DEFAULT_VOICE.duty).toBe(100);
    expect(voiceParamExists('duty')).toBe(true);
  });

  it('maps the skinny end to a 12.5% pulse and the fat end to a 50% square', () => {
    expect(pulseWidthFor(0)).toBeCloseTo(MIN_PULSE_WIDTH, 9);
    expect(pulseWidthFor(100)).toBeCloseTo(MAX_PULSE_WIDTH, 9);
    expect(pulseWidthFor(50)).toBeCloseTo((MIN_PULSE_WIDTH + MAX_PULSE_WIDTH) / 2, 9);
    // Clamped like every other knob, so a bad file cannot make an impossible wave.
    expect(pulseWidthFor(-40)).toBeCloseTo(MIN_PULSE_WIDTH, 9);
    expect(pulseWidthFor(400)).toBeCloseTo(MAX_PULSE_WIDTH, 9);
  });

  it('tells two sounds apart when only their duty differs', () => {
    expect(sameVoice(dutyVoice(100), dutyVoice(100))).toBe(true);
    expect(sameVoice(dutyVoice(100), dutyVoice(25))).toBe(false);
  });

  it('leaves every built-in voice at the full square, so none of them changed', () => {
    for (const voice of VOICES) expect(voice.params.duty).toBe(100);
  });

  it('travels with a voice into a layer, and is clamped there', () => {
    const layer = layerFromVoice(dutyVoice(25));
    expect(layer.duty).toBe(25);
    expect(clampParam(999)).toBe(100);
  });
});

function voiceParamExists(id: string): boolean {
  return VOICE_PARAM_BY_ID[id as keyof typeof VOICE_PARAM_BY_ID] !== undefined;
}

// --- the synthesis ----------------------------------------------------------

interface FakeParam {
  value: number;
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
  setTargetAtTime(v: number, t: number, c: number): void;
}

function param(): FakeParam {
  const p: FakeParam = {
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    setTargetAtTime() {},
  };
  return p;
}

interface FakeOsc {
  type: string;
  table: unknown;
  frequency: FakeParam;
  detune: FakeParam;
  setPeriodicWave(w: unknown): void;
  connect(..._args: unknown[]): unknown;
  start(): void;
  stop(): void;
}

function fakeContext() {
  const oscillators: FakeOsc[] = [];
  const ctx = {
    createOscillator(): FakeOsc {
      const osc: FakeOsc = {
        type: 'sine',
        table: null,
        frequency: param(),
        detune: param(),
        setPeriodicWave(w) { this.table = w; },
        connect() { return this; },
        start() {},
        stop() {},
      };
      oscillators.push(osc);
      return osc;
    },
    createGain() {
      return { gain: param(), connect(..._a: unknown[]) { return this; }, disconnect() {} };
    },
    createBiquadFilter() {
      return { type: 'lowpass', frequency: param(), Q: param(), connect(..._a: unknown[]) { return this; } };
    },
    createPeriodicWave(real: Float32Array, imag: Float32Array) {
      return { kind: 'periodic', real, imag };
    },
  };
  return { ctx, oscillators };
}

const DESTINATION = { connect() { return this; }, disconnect() {} } as unknown as AudioNode;

function build(voice: VoiceParams) {
  const { ctx, oscillators } = fakeContext();
  buildNote(ctx as unknown as BaseAudioContext, patchFromVoice(voice), 60, 0, 1, DESTINATION, null, {});
  return oscillators;
}

describe('the pulse wave the engine builds', () => {
  it('keeps the browser square for a full duty, so an old square is untouched', () => {
    const [osc] = build(dutyVoice(100));
    expect(osc.type).toBe('square');
    expect(osc.table).toBeNull();
  });

  it('wears a Fourier pulse table only when the duty is narrowed', () => {
    const [osc] = build(dutyVoice(25));
    expect(osc.table).not.toBeNull();
  });

  it('ignores duty on a waveform that has none to set', () => {
    const [tri] = build({ ...DEFAULT_VOICE, wave: 'triangle', duty: 0 });
    expect(tri.type).toBe('triangle');
    expect(tri.table).toBeNull();
  });

  it('caches one table per width, so a run of notes does not rebuild it', () => {
    const { ctx } = fakeContext();
    const a = pulsePeriodicWave(ctx as unknown as BaseAudioContext, 25);
    const b = pulsePeriodicWave(ctx as unknown as BaseAudioContext, 25);
    expect(a).toBe(b);
    const c = pulsePeriodicWave(ctx as unknown as BaseAudioContext, 80);
    expect(c).not.toBe(a);
  });
});

// --- the language and the files --------------------------------------------

describe('duty in the script language', () => {
  it('reads the knob and its alias', () => {
    const { song } = applied('tracks 1\ntrack 1 "LEAD" wave square duty 25');
    expect(song.tracks[0].voice.duty).toBe(25);
    const { song: aliased } = applied('tracks 1\ntrack 1 "LEAD" wave square pulse-width 12');
    expect(aliased.tracks[0].voice.duty).toBe(12);
  });

  it("refuses a value out of range with the knob's own words", () => {
    const bad = applyScript(createSong(), 'tracks 1\ntrack 1 "LEAD" duty 500');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toMatch(/0\.\.100/);
  });
});

describe('duty in a song file', () => {
  function narrowed() {
    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, wave: 'square', duty: 25 };
    return song;
  }

  it('writes at the current version and leaves duty OUT of a default voice', () => {
    const plain = createSong();
    const file = JSON.parse(songToJson(plain)) as { version: number; tracks: { voice: Record<string, unknown> }[] };
    expect(file.version).toBe(SONG_FILE_VERSION);
    expect(file.version).toBe(12);
    for (const track of file.tracks) expect('duty' in track.voice).toBe(false);
  });

  // `sweep` is the version-10 knob and is dropped at its default the same way —
  // see `sweep.test.ts` for the filter envelope itself.

  it('writes duty when it is narrowed, and reads it back', () => {
    const json = songToJson(narrowed());
    const file = JSON.parse(json) as { tracks: { voice: Record<string, unknown> }[] };
    expect(file.tracks[0].voice.duty).toBe(25);
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.duty).toBe(25);
  });

  it('reads an older file with no duty as the full square', () => {
    const file = JSON.parse(songToJson(narrowed())) as Record<string, unknown>;
    file.version = 8;
    delete (file.tracks as { voice: Record<string, unknown> }[])[0].voice.duty;
    const parsed = songFromJson(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.duty).toBe(100);
  });

  it('writes duty in a SCRIPT only when it is off the default', () => {
    const plain = songToScript(createSong());
    expect(plain).not.toContain('duty');
    const script = songToScript(narrowed());
    expect(script).toContain('duty 25');
  });
});
