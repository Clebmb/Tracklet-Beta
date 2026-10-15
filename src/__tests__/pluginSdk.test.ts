import { describe, expect, it } from 'vitest';

import { seatInstrumentModule } from '../plugins/loader';
import { checkInstrumentModule, defineInstrument, goldenRender } from '../plugins/sdk';
import { renderOutBuses } from '../plugins/instrument';
import { BUILT_IN_INSTRUMENTS } from '../plugins/builtIn';
import supersawManifest from '../../examples/plugins/supersaw/manifest.json';
import { renderNote as renderSupersaw } from '../../examples/plugins/supersaw/index';
import epPianoManifest from '../../examples/plugins/ep-piano/manifest.json';
import { renderNote as renderEpPiano } from '../../examples/plugins/ep-piano/index';

describe('defineInstrument', () => {
  it('seats a well-formed instrument module', () => {
    const defined = defineInstrument({ manifest: supersawManifest, renderNote: renderSupersaw });
    expect(defined.ok).toBe(true);
    if (!defined.ok) return;
    expect(defined.plugin.manifest.id).toBe('com.example.supersaw');
  });

  it('refuses a corrupt manifest, a wrong kind, and a missing render in words', () => {
    expect(defineInstrument({ manifest: { id: 'broken' }, renderNote: renderSupersaw }).ok).toBe(false);
    const panel = defineInstrument({
      manifest: { ...supersawManifest, kind: 'panel' },
      renderNote: renderSupersaw,
    });
    expect(panel.ok).toBe(false);
    if (!panel.ok) expect(panel.error).toMatch(/not an instrument/);
    const silent = defineInstrument({ manifest: supersawManifest, renderNote: undefined });
    expect(silent.ok).toBe(false);
    if (!silent.ok) expect(silent.error).toMatch(/renderNote/);
  });
});

describe('seatInstrumentModule', () => {
  it('seats the examples through the trust gate', () => {
    for (const [manifest, renderNote] of [
      [supersawManifest, renderSupersaw],
      [epPianoManifest, renderEpPiano],
    ] as const) {
      const seated = seatInstrumentModule(manifest, { renderNote });
      expect(seated.ok).toBe(true);
      if (!seated.ok) continue;
      expect(seated.seated.trusted).toBe(true);
    }
  });

  it('refuses a module whose render went missing after import', () => {
    const defined = defineInstrument({ manifest: supersawManifest, renderNote: renderSupersaw });
    expect(defined.ok).toBe(true);
    if (!defined.ok) return;
    expect(checkInstrumentModule(defined.plugin.manifest, {})).toMatch(/renderNote/);
    expect(checkInstrumentModule(defined.plugin.manifest, { renderNote: renderSupersaw })).toBeNull();
  });
});

describe('goldenRender', () => {
  it('hashes deterministically per plugin and differs across plugins', () => {
    const [saw, ep] = BUILT_IN_INSTRUMENTS;
    if (!saw || !ep) throw new Error('built-ins missing');
    const first = goldenRender(saw);
    expect(goldenRender(saw).hash).toBe(first.hash);
    expect(goldenRender(ep).hash).not.toBe(first.hash);
    expect(first.hash).toMatch(/^golden:\d+:[0-9a-f]+$/);
    expect(Array.from(first.samples).every((sample) => Number.isFinite(sample))).toBe(true);
  });

  it('hashes every bus of a multi-out render, lengths included', () => {
    const [saw] = BUILT_IN_INSTRUMENTS;
    if (!saw) throw new Error('built-ins missing');
    const multi = {
      manifest: saw.manifest,
      renderNote: () => [new Float32Array([0.5, -0.5]), new Float32Array([0.25])],
    };
    const hashed = goldenRender(multi);
    expect(hashed.hash).toMatch(/^golden:2bus:[0-9a-f]+$/);
    // The hand-back stays the main: bus 0, the mix a mono host heard.
    expect(hashed.samples).toEqual(new Float32Array([0.5, -0.5]));
    // A swapped bus is a different render, not the same samples reordered.
    const swapped = {
      manifest: saw.manifest,
      renderNote: () => [new Float32Array([0.25]), new Float32Array([0.5, -0.5])],
    };
    expect(goldenRender(swapped).hash).not.toBe(hashed.hash);
  });

  it('hashes a render with no buses as silence, without falling over', () => {
    const [saw] = BUILT_IN_INSTRUMENTS;
    if (!saw) throw new Error('built-ins missing');
    const empty = { manifest: saw.manifest, renderNote: () => [] as Float32Array[] };
    const hashed = goldenRender(empty);
    expect(hashed.samples).toEqual(new Float32Array(0));
    expect(hashed.hash).toMatch(/^golden:0:[0-9a-f]+$/);
  });
});

describe('the bundled instruments', () => {
  it('ships both proofs, and the EP renders a finite bounded note', () => {
    expect(BUILT_IN_INSTRUMENTS.map((plugin) => plugin.manifest.id)).toEqual([
      'com.example.supersaw',
      'com.example.ep-piano',
    ]);
    const ep = BUILT_IN_INSTRUMENTS[1]!;
    // The contract now returns one bus or many: the EP is mono, so unwrap it.
    const buses = renderOutBuses(
      ep.renderNote({ brightness: 55, decay: 70 }, { midi: 69, velocity: 100, startStep: 0, holdSteps: 1, seed: 1 }, 22050),
    );
    expect(buses).toHaveLength(1);
    const out = buses[0]!;
    expect(Array.from(out).every((sample) => Number.isFinite(sample))).toBe(true);
    const peak = Math.max(...Array.from(out).map((sample) => Math.abs(sample)));
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(1);
  });
});
