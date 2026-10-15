/**
 * ep-piano — the second proof that a plugin can be an instrument.
 *
 * A two-operator FM electric piano rendered as PURE DSP: a sine carrier bent
 * by a sine modulator an octave up, through a fast attack and an exponential
 * tail. Same contract as `../supersaw/index.ts` — numbers in, samples out, no
 * AudioContext — so the live engine and the offline exporter share this one
 * function and cannot disagree.
 *
 * Params (all 0–100, the host clamps): `brightness` (modulation index 0–8:
 * mellow tine to glassy bell) and `decay` (note length, 0.1–2 s). The note's
 * `seed` starts the phases through a seeded stream, so the same note renders
 * bit-identically everywhere.
 *
 * Structural types mirror `src/plugins/instrument.ts` so this example stays
 * self-contained; the M2 SDK turns this copy-paste into an import.
 */

export interface PluginParamValues {
  [id: string]: number;
}

export interface PluginNoteEvent {
  midi: number;
  velocity: number;
  startStep: number;
  holdSteps: number;
  seed: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed: number = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function clampParam(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback;
}

/** A carrier bent by its octave, decaying from tine to warmth. */
export function renderNote(params: PluginParamValues, note: PluginNoteEvent, sampleRate: number): Float32Array {
  const rate = Math.max(8000, Math.min(96000, Math.floor(sampleRate)));
  const index = (clampParam(params.brightness, 55) / 100) * 8;
  const duration = 0.1 + (clampParam(params.decay, 70) / 100) * 1.9;
  const count = Math.max(1, Math.floor(duration * rate));
  const out = new Float32Array(count);
  const freq = 440 * Math.pow(2, (note.midi - 69) / 12);
  const gain = (Math.min(100, Math.max(0, note.velocity)) / 100) * 0.7;
  const rng = mulberry32(note.seed);
  const carrierPhase = rng() * Math.PI * 2;
  const modulatorPhase = rng() * Math.PI * 2;
  const tau = duration / 3;
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const attack = 1 - Math.exp(-t / 0.004);
    const env = attack * Math.exp(-t / tau);
    // The bark fades faster than the body: index follows its own shorter tail.
    const live = index * Math.exp(-t / (tau / 2));
    const modulator = Math.sin(modulatorPhase + 2 * Math.PI * freq * 2 * t);
    out[i] = Math.sin(carrierPhase + 2 * Math.PI * freq * t + live * modulator) * env * gain;
  }
  return out;
}
