import { describe, expect, it } from 'vitest';

import { buildNote, DECAY_SPAN, RELEASE_SPAN, RELEASE_TAIL } from '../audio/synth';
import {
  createSong,
  DEFAULT_VOICE,
  patchFromVoice,
  sameVoice,
  VOICE_PARAM_BY_ID,
  VOICE_PARAMS,
  VOICES,
  type VoiceParams,
} from '../model';
import { applyScript } from '../model/script';
import { songFromJson, songToJson, songToScript } from '../model/songfile';

/**
 * The AMP ENVELOPE: `attack`, `decay`, `ring` (the held level) and `release` —
 * the four stages a synth asks for, named after what you HEAR instead of A, D, S
 * and R.
 *
 * The tests pin the bargain the two new knobs make to every song written before
 * them: at `decay 0` and `release 0` the engine schedules the EXACT envelope and
 * stop time it always did. Everything above zero only ever lengthens, so a value
 * can never make an existing note sound wrong — it can only make it breathe.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the ADSR knobs', () => {
  it('adds DECAY and RELEASE beside ATTACK and RING', () => {
    const ids = VOICE_PARAMS.map((p) => p.id);
    expect(ids).toEqual(['bright', 'sweep', 'duty', 'noise', 'attack', 'decay', 'ring', 'release', 'thick']);
    expect(VOICE_PARAM_BY_ID.decay.label).toBe('DECAY');
    expect(VOICE_PARAM_BY_ID.decay.low).toBe('snappy');
    expect(VOICE_PARAM_BY_ID.release.label).toBe('RELEASE');
    expect(VOICE_PARAM_BY_ID.release.high).toBe('long');
  });

  it('takes the `decay` word away from RING, so it means the new knob and nothing else', () => {
    expect(VOICE_PARAM_BY_ID.ring.aliases).not.toContain('decay');
    expect(VOICE_PARAM_BY_ID.decay.aliases).toContain('fall');
    expect(VOICE_PARAM_BY_ID.release.aliases).toContain('tail');
    // `ring` keeps its honest synonym.
    expect(VOICE_PARAM_BY_ID.ring.aliases).toContain('sustain');
  });

  it('defaults both to zero, so every preset and every old song is unchanged', () => {
    expect(DEFAULT_VOICE.decay).toBe(0);
    expect(DEFAULT_VOICE.release).toBe(0);
    for (const voice of VOICES) {
      expect(voice.params.decay).toBe(0);
      expect(voice.params.release).toBe(0);
    }
  });

  it('counts as part of a sound, so two envelopes are two sounds', () => {
    expect(sameVoice({ ...DEFAULT_VOICE, decay: 40 }, DEFAULT_VOICE)).toBe(false);
    expect(sameVoice({ ...DEFAULT_VOICE, release: 40 }, DEFAULT_VOICE)).toBe(false);
  });
});

// --- the synthesis ----------------------------------------------------------

function param() {
  const p = {
    value: 0,
    sets: [] as { v: number; t: number }[],
    ramps: [] as { v: number; t: number }[],
    targets: [] as { v: number; t: number; c: number }[],
    setValueAtTime(v: number, t: number) { this.value = v; this.sets.push({ v, t }); },
    linearRampToValueAtTime(v: number, t: number) { this.value = v; this.ramps.push({ v, t }); },
    exponentialRampToValueAtTime(v: number, t: number) { this.value = v; this.ramps.push({ v, t }); },
    setTargetAtTime(v: number, t: number, c: number) { this.value = v; this.targets.push({ v, t, c }); },
  };
  return p;
}

function fakeContext() {
  const gains: { gain: ReturnType<typeof param> }[] = [];
  const stops: number[] = [];
  const base = () => ({ connect(target: unknown) { return target; }, disconnect() {} });
  const ctx = {
    sampleRate: 44100,
    createOscillator() {
      return {
        ...base(), type: 'square', frequency: param(), detune: param(), setPeriodicWave() {},
        start() {}, stop(t: number) { stops.push(t); },
      };
    },
    createGain() { const g = { ...base(), gain: param() }; gains.push(g); return g; },
    createBiquadFilter() { return { ...base(), type: 'lowpass', frequency: param(), Q: { value: 0 } }; },
    createBufferSource() {
      return { ...base(), buffer: null, loop: false, playbackRate: param(), detune: param(), start() {}, stop(t: number) { stops.push(t); } };
    },
  };
  return { ctx, gains, stops };
}

const DESTINATION = { connect() { return this; }, disconnect() {} } as unknown as AudioNode;

function build(voice: VoiceParams, options: Record<string, unknown> = { duration: 1 }) {
  const fake = fakeContext();
  const duration = (options.duration as number) ?? 1;
  buildNote(fake.ctx as unknown as BaseAudioContext, patchFromVoice(voice), 60, 0, duration, DESTINATION, null, {});
  // The envelope is the only gain whose level is SCHEDULED rather than set once.
  const env = fake.gains.find((g) => g.gain.targets.length > 0)!;
  return { ...fake, env, duration };
}

const voice = (over: Partial<VoiceParams>): VoiceParams => ({ ...DEFAULT_VOICE, ...over });

/** The decay ramp's end time, and the release's start time and constant. */
function envelopeOf(v: VoiceParams, duration = 1) {
  const { env } = build(v, { duration });
  const decayEnd = env.gain.ramps.at(-1)!.t;
  const release = env.gain.targets.at(-1)!;
  return { decayEnd, releaseStart: release.t, releaseTc: release.c };
}

describe('the engine schedules the amp envelope', () => {
  const base = (duration: number, ring: number) => ({
    // The envelope the app has always made, spelled out, so the tests can say
    // "at the defaults it is exactly this" rather than "it is approximately".
    decayTime: Math.min(0.2, Math.max(0.02, duration * 0.5)),
    tc: 0.02 + (1 - ring / 100) * 0.05,
    attack: 0,
  });

  it('is exactly the old envelope at decay 0 — same ramp, same release', () => {
    const ref = base(1, 70);
    const { decayEnd, releaseStart, releaseTc } = envelopeOf(voice({ attack: 0, decay: 0, ring: 70, release: 0 }));
    const top = 0.004;
    expect(decayEnd).toBeCloseTo(top + ref.decayTime);
    expect(releaseStart).toBeCloseTo(Math.max(1 * 0.82, top - 0));
    expect(releaseTc).toBeCloseTo(ref.tc);
    expect(build(voice({ release: 0 })).stops).toContain(1 + 0.1);
  });

  it('makes DECAY lengthen the fall, and only the fall', () => {
    const plain = envelopeOf(voice({ decay: 0 }));
    const slow = envelopeOf(voice({ decay: 100 }));
    expect(slow.decayEnd - plain.decayEnd).toBeCloseTo(DECAY_SPAN);
    // The release is untouched by decay: the two knobs are separate stages.
    expect(slow.releaseTc).toBeCloseTo(plain.releaseTc);
  });

  it('makes RELEASE lengthen the tail, and lets the source keep ringing for it', () => {
    const plain = envelopeOf(voice({ release: 0 }));
    const long = envelopeOf(voice({ release: 100 }));
    expect(long.releaseTc - plain.releaseTc).toBeCloseTo(RELEASE_SPAN);
    // The oscillator would otherwise be stopped mid-fade, so the stop moves out.
    expect(build(voice({ release: 100 })).stops).toContain(1 + 0.1 + RELEASE_TAIL);
  });

  it('scales with the knob, so half is half the extra', () => {
    const none = envelopeOf(voice({ release: 0 })).releaseTc;
    const half = envelopeOf(voice({ release: 50 })).releaseTc;
    const full = envelopeOf(voice({ release: 100 })).releaseTc;
    expect(half - none).toBeCloseTo((full - none) / 2);
  });
});

// --- the language and the files --------------------------------------------

describe('an ADSR channel in a script and a file', () => {
  it('sets both knobs by name and by alias', () => {
    expect(applied('tracks 1\ntrack 1 "X" decay 55').song.tracks[0].voice.decay).toBe(55);
    expect(applied('tracks 1\ntrack 1 "X" fall 25').song.tracks[0].voice.decay).toBe(25);
    expect(applied('tracks 1\ntrack 1 "X" release 80').song.tracks[0].voice.release).toBe(80);
    expect(applied('tracks 1\ntrack 1 "X" tail 15').song.tracks[0].voice.release).toBe(15);
  });

  it('keeps `decay` off RING now that it is its own knob', () => {
    const { song } = applied('tracks 1\ntrack 1 "X" decay 55');
    expect(song.tracks[0].voice.ring).toBe(DEFAULT_VOICE.ring);
  });

  it('leaves both out of a file at their defaults, and writes them when they move', () => {
    const plain = JSON.parse(songToJson(createSong())) as { version: number; tracks: { voice: Record<string, unknown> }[] };
    expect(plain.version).toBe(12);
    for (const track of plain.tracks) {
      expect('decay' in track.voice).toBe(false);
      expect('release' in track.voice).toBe(false);
    }

    const song = createSong();
    song.tracks[0].voice = { ...DEFAULT_VOICE, decay: 30, release: 65 };
    const json = songToJson(song);
    expect(JSON.parse(json).tracks[0].voice).toMatchObject({ decay: 30, release: 65 });
    expect(songToScript(song)).toContain('decay 30');
    expect(songToScript(song)).toContain('release 65');

    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.decay).toBe(30);
    expect(parsed.song.tracks[0].voice.release).toBe(65);
  });

  it('reads a file written before the amp knobs existed as the old envelope', () => {
    const file = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    file.version = 10;
    const parsed = songFromJson(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0].voice.decay).toBe(0);
    expect(parsed.song.tracks[0].voice.release).toBe(0);
  });
});
