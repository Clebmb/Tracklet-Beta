/**
 * bitcrush-plus — the first proof that a plugin can be an effect.
 *
 * A bitcrusher rendered as PURE DSP: fewer bits plus a slower sample clock,
 * computed per note buffer with no memory of the note before it. Same
 * contract as the instruments (`../supersaw/index.ts`) — numbers in, samples
 * out, no AudioContext — so the live engine and the offline exporter share
 * this one function and cannot disagree.
 *
 * Params (all 0–100, the host clamps): `bits` (depth 16 down to 2: clean to
 * crushed) and `rate` (clock 1× down to 1/16×: full bandwidth to telephone
 * murk). The host owns wet/dry (`amount`, 0 = OFF) beside these.
 *
 * Structural types mirror `src/plugins/effect.ts` so this example stays
 * self-contained; the SDK turns this copy-paste into an import.
 */

export interface PluginParamValues {
  [id: string]: number;
}

function clampParam(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback;
}

/** Fewer bits on a slower clock: the whole of lo-fi in one pure function. */
export function processBlock(input: Float32Array, params: PluginParamValues, _sampleRate: number): Float32Array {
  const bits = Math.max(2, Math.round(16 - (clampParam(params.bits, 50) / 100) * 14));
  const hold = Math.max(1, Math.round(1 + (clampParam(params.rate, 35) / 100) * 15));
  const levels = Math.pow(2, bits);
  const out = new Float32Array(input.length);
  let held = 0;
  for (let i = 0; i < input.length; i++) {
    if (i % hold === 0) {
      const sample = Math.min(1, Math.max(-1, input[i]!));
      held = Math.round(((sample + 1) / 2) * (levels - 1)) / (levels - 1);
      held = held * 2 - 1;
    }
    out[i] = held;
  }
  return out;
}
