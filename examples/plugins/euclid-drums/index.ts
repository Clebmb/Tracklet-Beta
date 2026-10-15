/**
 * euclid-drums — the first proof that a plugin can write music.
 *
 * A Euclidean rhythm (`E(pulses, steps)`) rendered as PURE data: numbers in,
 * hits out, no song mutation, no RNG. The script word (`generate euclid …`),
 * the API op (`generator.generate`) and this module share the one function in
 * `src/plugins/generator.ts` — which is why the three can never disagree.
 *
 * Structural types mirror `src/plugins/generator.ts` so this example stays
 * self-contained; the SDK turns this copy-paste into an import.
 */

export interface EuclidInput {
  pulses: number;
  steps: number;
  rotate?: number;
}

/** `pulses` hits spread as evenly as `steps` allows, rotated forward. */
export function expand(input: EuclidInput): boolean[] {
  const steps = Math.max(1, Math.min(64, Math.round(input.steps)));
  const pulses = Math.max(0, Math.min(steps, Math.round(input.pulses)));
  const rotate = ((Math.round(input.rotate ?? 0) % steps) + steps) % steps;
  const out = new Array<boolean>(steps).fill(false);
  for (let i = 0; i < steps; i++) {
    out[(i + rotate) % steps] = (i * pulses) % steps < pulses;
  }
  return out;
}

/** The same rhythm as the string a `pad` line writes: `9` hits, `.` rests. */
export function pattern(input: EuclidInput): string {
  return expand(input).map((hit) => (hit ? '9' : '.')).join('');
}
