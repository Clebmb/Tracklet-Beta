/**
 * acid-bass — a squelchy resonant bassline voice, as PURE DSP.
 *
 * Saw/square through a resonant lowpass whose cutoff an accent-driven
 * envelope chews on: velocity opens the filter (how much is the `accent`
 * knob), the `envmod` knob decides how far it falls, `reso` how much it
 * screams on the way. `drive` is a tanh squeeze after the filter, `wave`
 * blends saw into square, `decay` sets both the note length and the fall.
 *
 * The honesty notes, because a bass that lies is useless:
 *
 *   • No legato slide. A render sees ONE note (`PluginNoteEvent`), never its
 *     neighbours, so there is nothing to glide FROM. Overlapping holds each
 *     render their own attack — write the slide as overlapping notes and let
 *     the engine sum them. A `slide` knob that faked it would be a knob that
 *     lies, and knobs that lie get turned once.
 *   • Naive oscillators (no polyBLEP). A bass lives at 40–200 Hz, where the
 *     first alias sits an octave and a half above the top harmonic that
 *     matters — the supersaw precedent, good enough for a bass, documented
 *     rather than hidden.
 *   • Numbers in, samples out: no AudioContext, no nodes, no `Math.random()`.
 *     Phase starts come from the note's `seed`, so the same note renders
 *     bit-identically on the live clock and the export clock.
 *
 * Structural types mirror `src/plugins/instrument.ts` so this folder stays
 * self-contained: manifest, module, docs, presets, tests — the whole
 * instrument lives here and nowhere else.
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

function midiHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * One acidic note: oscillator blend, accent envelope, resonant lowpass,
 * tanh drive. Roughly ±0.8 at full velocity, finite by construction.
 */
export function renderNote(params: PluginParamValues, note: PluginNoteEvent, sampleRate: number): Float32Array {
  const rate = Math.max(8000, Math.min(96000, Math.floor(sampleRate)));
  const cutoffKnob = clampParam(params.cutoff, 65) / 100;
  const resoKnob = clampParam(params.reso, 55) / 100;
  const envKnob = clampParam(params.envmod, 70) / 100;
  const accentKnob = clampParam(params.accent, 60) / 100;
  const driveKnob = clampParam(params.drive, 25) / 100;
  const waveKnob = clampParam(params.wave, 0) / 100;
  const decayKnob = clampParam(params.decay, 45) / 100;

  const duration = 0.05 + decayKnob * 1.15;
  const count = Math.max(1, Math.floor(duration * rate));
  const out = new Float32Array(count);

  const freq = midiHz(note.midi);
  const velocity = Math.min(100, Math.max(0, note.velocity)) / 100;
  // Accent is velocity times willingness: a hard hit with the knob down
  // still thumps, it just does not open the filter.
  const accent = 0.25 + 0.75 * velocity * (0.3 + 0.7 * accentKnob);
  const gain = (0.3 + 0.7 * velocity) * 0.8;

  // Cutoff sweeps exponentially: base plus three octaves of envelope that
  // the knob scales, so 0 parks the filter and 100 lets it scream.
  const baseHz = 90 * Math.pow(2, cutoffKnob * 6);
  const peakHz = baseHz * (1 + 7 * envKnob * accent);
  const q = 0.5 + resoKnob * 11.5;

  const rng = mulberry32(note.seed);
  const phase = rng();
  const attackTau = 0.003;
  const decayTau = 0.04 + decayKnob * 0.5;

  // RBJ lowpass state, coefficients recomputed per sample because the cutoff
  // moves under the envelope — a static filter would be a wah pedal nailed
  // to the floor.
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let a1 = 0;
  let a2 = 0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let lastCutoff = -1;

  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const attack = 1 - Math.exp(-t / attackTau);
    const env = attack * Math.exp(-t / decayTau);
    // Pinned under Nyquist: a cutoff past half the rate is not a filter, it
    // is an oscillator, and the low sample rates this host allows (down to
    // 8 kHz) would get there on a dimed knob without this.
    const cutoff = Math.min(rate * 0.45, baseHz + (peakHz - baseHz) * env);
    if (Math.abs(cutoff - lastCutoff) > 0.5) {
      const w = (2 * Math.PI * cutoff) / rate;
      const cosw = Math.cos(w);
      const alpha = Math.sin(w) / (2 * q);
      const norm = 1 / (1 + alpha);
      b0 = ((1 - cosw) / 2) * norm;
      b1 = (1 - cosw) * norm;
      b2 = ((1 - cosw) / 2) * norm;
      a1 = (-2 * cosw) * norm;
      a2 = (1 - alpha) * norm;
      lastCutoff = cutoff;
    }
    const p = (phase + (i * freq) / rate) % 1;
    const saw = 2 * p - 1;
    const square = p < 0.5 ? 1 : -1;
    const osc = saw * (1 - waveKnob) + square * waveKnob;
    const y = b0 * osc + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = osc;
    y2 = y1;
    y1 = y;
    // Tanh squeeze: gentle at noon, a snarl dimed — always bounded, so the
    // drive knob cannot clip the mix no matter what the resonance does.
    const driven = Math.tanh(y * (1 + driveKnob * 4));
    out[i] = driven * env * gain;
  }
  return out;
}
