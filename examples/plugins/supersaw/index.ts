/**
 * supersaw — the first proof that a plugin can be an instrument.
 *
 * A stacked-detuned-saw lead rendered as PURE DSP: numbers in, samples out,
 * no AudioContext, no nodes. The live engine (M1, next) will wrap these
 * samples in a buffer source; the offline exporter will call this same
 * function — which is why the two can never disagree.
 *
 * Params (all 0–100, the host clamps): `detune` (how far the outer saws
 * spread, 0–30 cents) and `decay` (note length, 0.05–1.5 s). The note's `seed`
 * starts the oscillator phases through a seeded stream, so the same note
 * renders bit-identically everywhere and different notes do not phase-cancel
 * in lockstep.
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

/** Three detuned saws through a fast attack and an exponential tail. */
export function renderNote(params: PluginParamValues, note: PluginNoteEvent, sampleRate: number): Float32Array {
  const rate = Math.max(8000, Math.min(96000, Math.floor(sampleRate)));
  const detuneCents = (clampParam(params.detune, 40) / 100) * 30;
  const duration = 0.05 + (clampParam(params.decay, 60) / 100) * 1.45;
  const count = Math.max(1, Math.floor(duration * rate));
  const out = new Float32Array(count);
  const freq = 440 * Math.pow(2, (note.midi - 69) / 12);
  const gain = (Math.min(100, Math.max(0, note.velocity)) / 100) * 0.8;
  const spread = Math.pow(2, detuneCents / 1200);
  const rng = mulberry32(note.seed);
  const phases = [rng(), rng(), rng()];
  const ratios = [1 / spread, 1, spread];
  const tau = duration / 4;
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const attack = 1 - Math.exp(-t / 0.005);
    const env = attack * Math.exp(-t / tau);
    let sample = 0;
    for (let osc = 0; osc < 3; osc++) {
      const phase = (phases[osc] + (i * freq * ratios[osc]) / rate) % 1;
      sample += 2 * phase - 1;
    }
    out[i] = (sample / 3) * env * gain;
  }
  return out;
}
