/**
 * stereo-kit — the proof a plugin can be multi-out.
 *
 * One drum in two buses: bus 0 (`thump`, the MAIN) is a low sine body, bus 1
 * (`click`) is the short bright beater. The buses are deliberately different
 * lengths — the click rings a tenth of the body — so the host's padding is
 * exercised, not just its channel count. Pure DSP like the supersaw: numbers
 * in, samples out, the note's `seed` starting phases through a seeded stream.
 *
 * Structural types mirror `src/plugins/instrument.ts` so this example stays
 * self-contained.
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

/** One drum, two buses: the body (main) and the beater (short and bright). */
export function renderNote(params: PluginParamValues, note: PluginNoteEvent, sampleRate: number): Float32Array[] {
  const rate = Math.max(8000, Math.min(96000, Math.floor(sampleRate)));
  const punch = clampParam(params.punch, 70) / 100;
  const gain = (Math.min(100, Math.max(0, note.velocity)) / 100) * 0.9;
  const freq = 55 * Math.pow(2, (note.midi - 36) / 12);
  const rng = mulberry32(note.seed);
  const phase = rng();
  const bodySeconds = 0.3 + punch * 0.3;
  const bodyCount = Math.max(1, Math.floor(bodySeconds * rate));
  const thump = new Float32Array(bodyCount);
  for (let i = 0; i < bodyCount; i++) {
    const t = i / rate;
    const drop = freq * (1 - 0.6 * Math.exp(-t / 0.03));
    thump[i] = Math.sin(2 * Math.PI * drop * t + phase) * Math.exp(-t / 0.12) * gain;
  }
  const clickCount = Math.max(1, Math.floor(0.03 * rate));
  const click = new Float32Array(clickCount);
  for (let i = 0; i < clickCount; i++) {
    const t = i / rate;
    click[i] = (rng() * 2 - 1) * Math.exp(-t / 0.008) * gain * (0.4 + punch * 0.6);
  }
  return [thump, click];
}
