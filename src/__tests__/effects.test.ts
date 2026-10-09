import { describe, expect, it, vi } from 'vitest';

import {
  buildChannelChain,
  cabBottomGain,
  cabMidGain,
  cabTopHz,
  chorusDelaySeconds,
  chorusWet,
  crushCurve,
  driveCurve,
  EFFECT_ORDER,
  punchThreshold,
  RADIO_CRUSH_MAX,
  radioBottomHz,
  radioCrushCurve,
  radioTopHz,
  TAPE_HISS_MAX,
  TAPE_HISS_SECONDS,
  tapeCurve,
  tapeFlutterSeconds,
  tapeHissBuffer,
  tapeHissGain,
  tapeWowSeconds,
  tiltHighGain,
  tiltLowGain,
  VINYL_BED_MAX,
  VINYL_BED_SECONDS,
  vinylBedGain,
  vinylBuffer,
} from '../audio/chain';
import { buildMasterChain } from '../audio/chain';
import {
  applyScript,
  clampEffect,
  clampEffects,
  createSong,
  DEFAULT_EFFECT,
  EFFECT_STEP,
  effectLabel,
  emptyTrack,
  gateFactor,
  MAX_EFFECT,
  MIN_EFFECT,
  MIN_GATE_FRACTION,
  MASTER_SONG_FILE_VERSION,
  NO_EFFECTS,
  VINYL_SONG_FILE_VERSION,
  VARIATION_SONG_FILE_VERSION,
  DRIFT_SONG_FILE_VERSION,
  SPEED_SONG_FILE_VERSION,
  MACHINE_BARS_SONG_FILE_VERSION,
  MACHINE_PAD_SAMPLE_SONG_FILE_VERSION,
  MACHINE_SECTION_BAR_SONG_FILE_VERSION,
  MACHINE_SONG_FILE_VERSION,
  SCENES_SONG_FILE_VERSION,
  ARP_SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  scriptCapabilities,
  songFromJson,
  songToJson,
  songToScript,
  stepEffect,
  TRACK_EFFECTS,
  type ChannelEffects,
} from '../model';

/**
 * The nine channel effects, tested at every layer they touch.
 *
 * The promise Phase 2 makes is narrow and checkable: **an effect at 0 is not
 * there.** Not quiet, not neutral — absent. These tests are that promise made
 * mechanical: the default is off, off builds no node, off writes no key and no
 * word, off renders the sample it always rendered, and off is what an old song
 * already says. The other half is that each effect MEANS something at the top,
 * which is checked by arithmetic rather than by ear (the ear belongs to whoever
 * turns the knob in the running app).
 */

describe('the ten effects, as a channel setting', () => {
  it('starts every channel with all of them off', () => {
    const track = emptyTrack(0);
    expect(TRACK_EFFECTS.map((effect) => effect.id))
      .toEqual(['drive', 'crush', 'cab', 'tape', 'radio', 'vinyl', 'chorus', 'punch', 'tilt', 'gate']);
    expect(NO_EFFECTS).toEqual({
      drive: 0, crush: 0, cab: 0, tape: 0, radio: 0, vinyl: 0, chorus: 0, punch: 0, tilt: 0, gate: 0,
    });
    for (const effect of TRACK_EFFECTS) expect(track[effect.id]).toBe(DEFAULT_EFFECT);
    expect(DEFAULT_EFFECT).toBe(MIN_EFFECT);
  });

  it('clamps into the shared range, and reads an unusable value as off', () => {
    expect(clampEffect(-40)).toBe(MIN_EFFECT);
    expect(clampEffect(140)).toBe(MAX_EFFECT);
    expect(clampEffect(40.6)).toBe(41);
    // A broken number means OFF rather than full: off is the sound every song in
    // the app already has, so a stray value cannot make one channel different.
    expect(clampEffect(Number.NaN)).toBe(MIN_EFFECT);
    expect(clampEffect(Number.POSITIVE_INFINITY)).toBe(MAX_EFFECT);
  });

  it('labels an effect the way a send is labelled: OFF, or a percentage', () => {
    expect(effectLabel(0)).toBe('OFF');
    expect(effectLabel(40)).toBe('40%');
    expect(effectLabel(MAX_EFFECT)).toBe('100%');
  });

  it('nudges by ten, landing on a stop in the direction pressed', () => {
    expect(stepEffect(0, 1)).toBe(EFFECT_STEP);
    expect(stepEffect(100, -1)).toBe(90);
    expect(stepEffect(45, 1)).toBe(50);
    expect(stepEffect(45, -1)).toBe(40);
    expect(stepEffect(0, -1)).toBe(MIN_EFFECT);
  });

  it('fills in a whole set, clamped, from whatever it is given', () => {
    expect(clampEffects(undefined))
      .toEqual({ drive: 0, crush: 0, cab: 0, tape: 0, radio: 0, vinyl: 0, chorus: 0, punch: 0, tilt: 0, gate: 0 });
    expect(clampEffects({ drive: 400, tilt: -2 }))
      .toEqual({ drive: 100, crush: 0, cab: 0, tape: 0, radio: 0, vinyl: 0, chorus: 0, punch: 0, tilt: 0, gate: 0 });
  });

  it('gives every effect two named ends, and a line saying what it is for', () => {
    for (const effect of TRACK_EFFECTS) {
      expect(effect.low.length).toBeGreaterThan(2);
      expect(effect.high.length).toBeGreaterThan(2);
      expect(effect.low).not.toBe(effect.high);
      expect(effect.blurb.length).toBeGreaterThan(30);
      // The low end is OFF, so it must not read as a mild setting: `drive`'s ends
      // are clean...crushed, which is the one word pair that says so.
      expect(effect.label).toBe(effect.id.toUpperCase());
    }
  });
});

describe('the gate, which is arithmetic rather than a node', () => {
  it('sounds the whole note at 0, and a quarter of it at 100', () => {
    expect(gateFactor(0)).toBe(1);
    expect(gateFactor(MAX_EFFECT)).toBe(MIN_GATE_FRACTION);
  });

  it('shortens a note as the knob turns, and never past the floor', () => {
    let previous = 1;
    for (let amount = 0; amount <= MAX_EFFECT; amount += 10) {
      const factor = gateFactor(amount);
      expect(factor).toBeLessThanOrEqual(previous);
      expect(factor).toBeGreaterThanOrEqual(MIN_GATE_FRACTION);
      previous = factor;
    }
    expect(gateFactor(500)).toBe(MIN_GATE_FRACTION);
  });
});

/** A `BaseAudioContext` stub: enough of every node the effects stage builds. */
function stubContext(): { ctx: BaseAudioContext; made: { kind: string; node: Record<string, unknown> }[] } {
  const made: { kind: string; node: Record<string, unknown> }[] = [];
  const param = (): Record<string, unknown> => ({ value: 0, setTargetAtTime: vi.fn() });
  const make = (kind: string): Record<string, unknown> => {
    const node: Record<string, unknown> = {
      kind,
      gain: param(),
      frequency: param(),
      Q: param(),
      delayTime: param(),
      buffer: null,
      loop: false,
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      curve: null,
      oversample: 'none',
      type: '',
      start: vi.fn(),
      disconnect: vi.fn(),
    };
    node.connect = vi.fn(() => node);
    made.push({ kind, node });
    return node;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => make('gain'),
    createChannelMerger: () => make('merger'),
    createWaveShaper: () => make('shaper'),
    createBiquadFilter: () => make('biquad'),
    createDynamicsCompressor: () => make('compressor'),
    createDelay: () => make('delay'),
    createOscillator: () => make('oscillator'),
    createBufferSource: () => make('bufferSource'),
    // A real-enough buffer for the tape machine's hiss bed: ONE array per buffer,
    // handed out every time it is asked for (which is what a real one does), so a
    // test that fills it and reads it back sees its own samples.
    createBuffer: (channels: number, length: number, rate: number) => {
      const data = new Float32Array(length);
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        getChannelData: () => data,
      };
    },
  } as unknown as BaseAudioContext;
  return { ctx, made };
}

function build(effects?: Partial<ChannelEffects>) {
  const { ctx, made } = stubContext();
  const chain = buildChannelChain(
    ctx,
    { level: 0.5, pan: 0, verb: 100, echo: 100, ...(effects ? { effects } : {}) },
    {} as AudioNode,
    { reverb: {} as AudioNode, echo: {} as AudioNode },
  );
  return { chain, made, kinds: made.map((entry) => entry.kind) };
}

describe('an effect at 0 is not in the graph', () => {
  it('builds exactly the six nodes a channel has always had', () => {
    // Five gains and a merger: the level gain, two pan gains, two send gains and
    // the merger. Anything else here is a change to every song in the app.
    const { chain, kinds, made } = build();
    expect(kinds).toEqual(['gain', 'gain', 'gain', 'gain', 'gain', 'merger']);
    expect(chain.effects).toEqual([]);
    expect(chain.nodes).toHaveLength(6);
    // ...and the level is still on the input, which is what makes the notes and
    // the sends behave exactly as they did before effects existed.
    expect((made[0].node.gain as { value: number }).value).toBe(0.5);
  });

  it('is the same graph when the caller says nothing about effects at all', () => {
    const withNothing = build();
    const withZeroes = build({ drive: 0, chorus: 0, crush: 0, punch: 0, tilt: 0, gate: 0, cab: 0, tape: 0, radio: 0, vinyl: 0 });
    expect(withZeroes.kinds).toEqual(withNothing.kinds);
    expect(withZeroes.chain.effects).toEqual([]);
  });

  it('puts the level on a fader AFTER the stages once anything is on', () => {
    const { chain, kinds, made } = build({ drive: 40 });
    expect(chain.effects).toEqual(['drive']);
    // The fader is the second node, and the input is a plain pass-through.
    expect((made[0].node.gain as { value: number }).value).toBe(1);
    expect((made[1].node.gain as { value: number }).value).toBe(0.5);
    expect(kinds).toEqual(['gain', 'gain', 'shaper', 'gain', 'gain', 'gain', 'gain', 'merger']);
  });

  it('wires the stages in pedalboard order, whatever order they were switched on in', () => {
    const { kinds, chain } = build({ chorus: 40, drive: 40, punch: 40, crush: 40, tilt: 40, cab: 40, tape: 40, radio: 40, vinyl: 40 });
    expect(chain.effects).toEqual([...EFFECT_ORDER]);
    const at = (kind: string) => kinds.indexOf(kind);
    const last = (kind: string) => kinds.lastIndexOf(kind);
    // Shape, then balance, then control, then spread — and the LFO is last, so
    // the modulation is never itself distorted.
    expect(at('shaper')).toBeGreaterThan(0);
    expect(at('biquad')).toBeGreaterThan(at('shaper'));
    expect(at('compressor')).toBeGreaterThan(at('biquad'));
    expect(last('delay')).toBeGreaterThan(at('compressor'));
    expect(last('oscillator')).toBeGreaterThan(last('delay'));
    // `tape` is why the two above ask for the LAST delay and the last oscillator:
    // a tape machine is after the amp and before the mixing desk, so it owns the
    // FIRST delay in the graph and the first oscillator too, and both have to be
    // in the right half of the chain — after the drive stage, before the desk.
    expect(at('delay')).toBeGreaterThan(at('shaper'));
    expect(at('delay')).toBeLessThan(at('compressor'));
    expect(at('oscillator')).toBeLessThan(at('compressor'));
    // ...and the hiss is added after the wander, which is what makes it a TAPE
    // rather than a wobbly hiss (see `tapeStage`).
    expect(kinds.indexOf('bufferSource')).toBeGreaterThan(at('delay'));
    // Two looping sources now: the tape machine's hiss and the record's bed, which
    // is the second and therefore sits under the telephone as the last medium.
    expect(kinds.filter((kind) => kind === 'bufferSource')).toHaveLength(2);
  });

  it('turns an effect that is in the graph, and refuses one that is not', () => {
    const { chain } = build({ drive: 40 });
    expect(chain.setEffect('drive', 80, 0)).toBe(true);
    // The chain has no crush node, so the caller's next move is a rebuild — and a
    // false answer is how it knows, rather than a silently ignored knob.
    expect(chain.setEffect('crush', 40, 0)).toBe(false);
  });
});

describe('what each effect does to the ends of its range', () => {
  it('leaves the drive curve alone at 0 and bends it at 100', () => {
    const identity = driveCurve(0);
    // At 0 the curve IS the straight line -1..1: the identity function, so the
    // table adds nothing to a sample that passes through it.
    identity.forEach((value, i) => {
      // Six digits rather than ten: the table is Float32, which is what the
      // browser reads a curve as, and that is the whole of the difference here.
      expect(value).toBeCloseTo((i / (identity.length - 1)) * 2 - 1, 6);
    });
    const crushed = driveCurve(MAX_EFFECT);
    // Quiet signals are pushed up (that is the point of drive) and the ends stay
    // inside ±1, so an effect can never be a way to clip the master.
    const mid = crushed[Math.round(0.75 * (crushed.length - 1))];
    expect(mid).toBeGreaterThan(0.25);
    expect(crushed[crushed.length - 1]).toBeLessThanOrEqual(1);
    expect(crushed[0]).toBe(-crushed[crushed.length - 1]);
  });

  it('quantizes with crush, into fewer steps the higher the knob', () => {
    expect(crushCurve(0)).toEqual(driveCurve(0));
    const steps = (curve: Float32Array): number => new Set(Array.from(curve)).size;
    expect(steps(crushCurve(MAX_EFFECT))).toBeLessThan(steps(crushCurve(20)));
  });

  it('slides the compressor threshold down and never past the top of the range', () => {
    expect(punchThreshold(0)).toBeGreaterThan(punchThreshold(MAX_EFFECT));
    expect(punchThreshold(0)).toBeLessThan(0);
  });

  it('leans the tilt one way only, so off is flat', () => {
    expect(Math.abs(tiltLowGain(0))).toBe(0);
    expect(Math.abs(tiltHighGain(0))).toBe(0);
    expect(tiltHighGain(MAX_EFFECT)).toBeGreaterThan(0);
    expect(tiltLowGain(MAX_EFFECT)).toBeLessThan(0);
  });

  it('makes the chorus wider and slower-drifted as it turns up', () => {
    expect(chorusWet(0)).toBe(0);
    expect(chorusWet(MAX_EFFECT)).toBeGreaterThan(0.2);
    expect(chorusDelaySeconds(MAX_EFFECT)).toBeGreaterThan(chorusDelaySeconds(0));
  });

  it('closes the cabinet top as it turns up, pushing the middle as it goes', () => {
    // At the bottom the low-pass is above the band the engine plays in, so a
    // cabinet at 0 is a door rather than a filter — and it is never built anyway.
    expect(cabTopHz(0)).toBeGreaterThan(10000);
    expect(cabTopHz(MAX_EFFECT)).toBeLessThan(cabTopHz(0));
    expect(cabTopHz(MAX_EFFECT)).toBeGreaterThan(1000);
    // The middle only ever comes UP and the bottom only ever goes DOWN, which is
    // what makes `0` flat rather than a mid-scoop.
    expect(cabMidGain(0)).toBe(0);
    expect(cabMidGain(MAX_EFFECT)).toBeGreaterThan(0);
    // `Math.abs` because a negative zero is still a zero: the shelf is flat, and
    // the sign of the nothing it takes away is an artifact of the subtraction.
    expect(Math.abs(cabBottomGain(0))).toBe(0);
    expect(cabBottomGain(MAX_EFFECT)).toBeLessThan(0);
    // And it MOVES with the knob all the way, so no part of the range is dead.
    let previous = cabTopHz(0);
    for (let amount = 10; amount <= MAX_EFFECT; amount += 10) {
      expect(cabTopHz(amount)).toBeLessThan(previous);
      previous = cabTopHz(amount);
    }
  });

  it('prints a whole tape machine: a gentler bend than drive, a wander, and a quiet bed', () => {
    // Three artifacts behind one number, each checked at its own end — which is
    // the only thing arithmetic can do with a sound this side of listening.
    //
    // 1. The saturation is the SOFT one. `drive` bends six times as hard and that
    //    is the point of it; tape has to round a peak off without ever sounding
    //    like a fuzzbox. Two curves differ in TWO ways — how hard they bend and how
    //    much level they hand back — so measuring "softer" means looking at the
    //    SHAPE with the level taken out, by dividing each curve by its own top.
    //    After that, distance from the straight line is curvature and nothing else.
    const identity = driveCurve(0);
    // A curve is indexed by SAMPLE, and the table spans −1..+1, so the index for an
    // input of `x` is not `x × length` but this.
    const at = (curve: Float32Array, x: number): number =>
      curve[Math.round(((x + 1) / 2) * (curve.length - 1))]!;
    /**
     * How far a curve bends the positive half, with its level taken out.
     *
     * Dividing by the curve's own top removes how much level it hands back — the
     * other way two curves differ — which leaves pure curvature: 0 is a straight
     * line, and up is how far the middle is lifted above it.
     */
    const bend = (curve: Float32Array): number => {
      const top = at(curve, 1);
      let worst = 0;
      for (let x = 0; x <= 1; x += 0.01) worst = Math.max(worst, Math.abs(at(curve, x) / top - x));
      return worst;
    };
    expect(tapeCurve(0)).toEqual(identity);
    expect(bend(identity)).toBeLessThan(0.001);
    expect(bend(tapeCurve(MAX_EFFECT))).toBeLessThan(bend(driveCurve(MAX_EFFECT)));
    // ...and it is still a bend, in the one direction a tape's is: a quiet sample
    // comes UP (that is the compression) and the loudest one goes DOWN (that is
    // the saturation), so the top of the knob is not a dead zone.
    expect(at(tapeCurve(MAX_EFFECT), 0.25)).toBeGreaterThan(0.25);
    expect(at(tapeCurve(MAX_EFFECT), 1)).toBeLessThan(1);
    expect(at(tapeCurve(MAX_EFFECT), 1)).toBeGreaterThan(0);

    // 2. The wander. A modulated delay shifts pitch by the RATE OF CHANGE of its
    //    delay time, so the depths are tiny and the ratios are what matter: the
    //    flutter has to be an order of magnitude under the wow, because its job is
    //    to make the wow sound like a mechanism rather than like an LFO.
    expect(tapeWowSeconds(0)).toBe(0);
    expect(tapeFlutterSeconds(0)).toBe(0);
    expect(tapeWowSeconds(MAX_EFFECT)).toBeGreaterThan(tapeFlutterSeconds(MAX_EFFECT) * 10);
    expect(tapeWowSeconds(MAX_EFFECT)).toBeLessThan(0.01);

    // 3. The bed: quiet enough to be a bed, and proportional to the knob.
    expect(tapeHissGain(0)).toBe(0);
    expect(tapeHissGain(MAX_EFFECT)).toBe(TAPE_HISS_MAX);
    expect(TAPE_HISS_MAX).toBeLessThan(0.05);
  });

  it('narrows to a telephone and holds the crush back, which is what a line is', () => {
    // Both edges close, and neither ever crosses the other: at 0 the band is wider
    // than anything the engine plays, and at 100 it is the band a voice survives on.
    expect(radioBottomHz(0)).toBeLessThan(100);
    expect(radioTopHz(0)).toBeGreaterThan(15000);
    expect(radioBottomHz(MAX_EFFECT)).toBe(500);
    expect(radioTopHz(MAX_EFFECT)).toBe(3000);
    expect(radioBottomHz(MAX_EFFECT)).toBeLessThan(radioTopHz(MAX_EFFECT));
    // Monotonic all the way, so no part of the knob is a dead zone.
    let bottom = radioBottomHz(0);
    let top = radioTopHz(0);
    for (let amount = 10; amount <= MAX_EFFECT; amount += 10) {
      expect(radioBottomHz(amount)).toBeGreaterThan(bottom);
      expect(radioTopHz(amount)).toBeLessThan(top);
      bottom = radioBottomHz(amount);
      top = radioTopHz(amount);
    }

    // The coarse half is `crush`'s own staircase stopped short — which is the claim
    // that makes this one effect rather than a second implementation of another:
    // a telephone is about six bits, and `crush` at 100 is three.
    expect(radioCrushCurve(0)).toEqual(driveCurve(0));
    expect(radioCrushCurve(MAX_EFFECT)).toEqual(crushCurve(RADIO_CRUSH_MAX));
    const steps = (curve: Float32Array): number => new Set(Array.from(curve)).size;
    expect(steps(radioCrushCurve(MAX_EFFECT))).toBeGreaterThan(steps(crushCurve(MAX_EFFECT)));
    expect(RADIO_CRUSH_MAX).toBeLessThan(MAX_EFFECT);
  });

  it('lays a record under the part: a bed that scales, and a fixed surface', () => {
    // One number, like the tape machine — but this bed is ADDITIVE rather than a
    // path the signal takes, so what can be checked is its level and its content.
    expect(vinylBedGain(0)).toBe(0);
    expect(vinylBedGain(MAX_EFFECT)).toBe(VINYL_BED_MAX);
    expect(VINYL_BED_MAX).toBeLessThan(0.05);
    // ...and it MOVES all the way, so no part of the knob is a dead zone.
    let previous = vinylBedGain(0);
    for (let amount = 10; amount <= MAX_EFFECT; amount += 10) {
      expect(vinylBedGain(amount)).toBeGreaterThan(previous);
      previous = vinylBedGain(amount);
    }

    // The bed is a RECORD rather than a wash of noise: alongside its surface there
    // are crackles, which is what makes its peak tower over its typical sample.
    const { ctx } = stubContext();
    const bed = vinylBuffer(ctx);
    expect(bed.length).toBe(Math.floor(44100 * VINYL_BED_SECONDS));
    const data = bed.getChannelData(0);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
      sum += Math.abs(data[i]);
    }
    expect(peak).toBeGreaterThan(0.4);
    expect(sum / data.length).toBeLessThan(peak / 4);
  });

  it('crackles the same crackle every time, so an export is the record you heard', () => {
    // Determinism, exactly as the tape hiss promises it: a seeded generator rather
    // than `Math.random`, so a rendered file is the file that was heard.
    const { ctx } = stubContext();
    const first = vinylBuffer(ctx);
    const second = vinylBuffer(ctx);
    const a = first.getChannelData(0);
    const b = second.getChannelData(0);
    let differs = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differs++;
    expect(differs).toBe(0);
    // ...and it is a BED rather than a tone: its samples have to keep moving.
    expect(new Set(Array.from(a.slice(0, 500))).size).toBeGreaterThan(400);
  });

  it('hisses the same hiss every time, so an export is the file you heard', () => {
    // The determinism the whole app promises, applied to noise: a seeded generator
    // rather than `Math.random`, exactly like the reverb impulse.
    const { ctx } = stubContext();
    const first = tapeHissBuffer(ctx);
    const second = tapeHissBuffer(ctx);
    expect(first.length).toBe(Math.floor(44100 * TAPE_HISS_SECONDS));
    const a = first.getChannelData(0);
    const b = second.getChannelData(0);
    let differs = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differs++;
    expect(differs).toBe(0);
    // ...and it is NOISE rather than a tone: the bed under everything must not be
    // something a listener can name, so its samples have to keep moving.
    expect(new Set(Array.from(a.slice(0, 500))).size).toBeGreaterThan(400);
  });
});

describe('the script writes an effect on the track line', () => {
  it('sets one effect and leaves the others alone', () => {
    const result = applyScript(createSong(), 'track 2 drive 40');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[1].drive).toBe(40);
    for (const effect of TRACK_EFFECTS) {
      if (effect.id === 'drive') continue;
      expect(result.song.tracks[1][effect.id]).toBe(DEFAULT_EFFECT);
    }
  });

  it('reads `chorus` as the effect, not as the knob it used to be an alias of', () => {
    // Language version 3 took this spelling away from `thick`, and the two mean
    // different things: the knob is width inside the instrument, the effect is a
    // drifting copy of the whole channel. A file is unaffected — it writes `thick`.
    const result = applyScript(createSong(), 'track 1 chorus 60');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].chorus).toBe(60);
    expect(result.song.tracks[0].voice.thick).toBe(createSong().tracks[0].voice.thick);
  });

  it('refuses an amount outside the range, and says which end is which', () => {
    const result = applyScript(createSong(), 'track 1 crush 140');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('0..100');
    expect(result.errors[0].message).toContain('gritty');

    const bare = applyScript(createSong(), 'track 1 gate');
    expect(bare.ok).toBe(false);
    if (bare.ok) return;
    // A bare word is a setting somebody meant, not a channel named GATE.
    expect(bare.errors[0].message).toContain('gate needs a percentage');
  });

  it('writes the effects a song has, and none of the ones it does not', () => {
    const result = applyScript(createSong(), 'track 3 "PAD" voice pad tilt 30\nmute 3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const line = songToScript(result.song).split('\n').find((row) => row.startsWith('track 3'))!;
    expect(line).toContain(' tilt 30');
    expect(line).not.toContain('drive');
    for (const effect of TRACK_EFFECTS) {
      if (effect.id === 'tilt') continue;
      expect(line).not.toContain(` ${effect.id} `);
    }
  });
});

describe('the file carries an effect only when one is on', () => {
  it('writes version 12 and no effect keys for a song with none', () => {
    const file = songToJson(createSong());
    expect(file).toContain('"version": 12');
    for (const effect of TRACK_EFFECTS) expect(file).not.toContain(`"${effect.id}"`);
  });

  it('writes version 14 and only the effects that are on', () => {
    const result = applyScript(createSong(), 'track 1 drive 40\nlayer 1 2 wave saw');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const file = songToJson(result.song);
    expect(file).toContain('"version": 14');
    expect(file).toContain('"drive": 40');
    expect(file).not.toContain('"crush"');
  });

  it('round-trips an effect through the JSON without changing it', () => {
    const result = applyScript(createSong(), 'track 2 crush 70\nlayer 2 2 wave sine\nlayer 2 3 wave sine detune 12');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = songFromJson(songToJson(result.song));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.song.tracks[1].crush).toBe(70);
    expect(parsed.song.tracks[1].stack).toHaveLength(2);
  });

  it('round-trips an effect through the script, since a save is a script', () => {
    const result = applyScript(createSong(), 'track 4 punch 30');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const again = applyScript(createSong(), songToScript(result.song));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.song.tracks[3].punch).toBe(30);
  });

  it('reads a file that clamps an effect rather than one that refuses it', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    (raw.tracks as Record<string, unknown>[])[0].drive = 400;
    const parsed = songFromJson(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.song.tracks[0].drive).toBe(MAX_EFFECT);
  });

  it('refuses a value that is not a number at all, and names the channel', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    (raw.tracks as Record<string, unknown>[])[1].chorus = 'wide';
    const parsed = songFromJson(JSON.stringify(raw));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join(' ')).toContain('channel 2');
  });
});

describe('the manifest publishes the effects', () => {
  it('lists every one, and the range they share', () => {
    const { vocabulary, limits } = scriptCapabilities();
    expect(vocabulary.effects).toEqual(TRACK_EFFECTS.map((effect) => effect.id));
    expect(limits.effect).toEqual({ min: MIN_EFFECT, max: MAX_EFFECT });
    expect(scriptCapabilities().scriptVersion).toBeGreaterThanOrEqual(3);
  });
});

/**
 * The same six effects, one scope out: the whole mix rather than one channel.
 *
 * The promise is the same promise and is checked the same way — **an effect at 0
 * is not there** — with one thing added: the MIX is not a channel, so the tests
 * that matter most are the ones about what the master does NOT touch. A `master`
 * line may not reach into a channel, and a song that never wrote one may not
 * change by a single byte.
 */
describe('the nine effects, on the whole mix', () => {
  it('starts every song with all of them off', () => {
    const song = createSong();
    for (const effect of TRACK_EFFECTS) expect(song.master[effect.id]).toBe(DEFAULT_EFFECT);
  });

  it('reads the same nine words a track line takes', () => {
    const result = applyScript(createSong(), 'master drive 20 tilt 15');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.master).toEqual({ ...NO_EFFECTS, drive: 20, tilt: 15 });
    // ...and reaches no channel: the mix and the band are two places.
    expect(result.song.tracks.map((track) => track.drive)).toEqual([0, 0, 0, 0]);
  });

  it('leaves the effects a line does not name alone', () => {
    const first = applyScript(createSong(), 'master drive 20\nmaster crush 30');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.song.master.drive).toBe(20);
    expect(first.song.master.crush).toBe(30);
  });

  it('builds no node at all for a mix with nothing on', () => {
    const { ctx, made } = stubContext();
    expect(buildMasterChain(ctx, undefined, {} as AudioNode)).toBeNull();
    expect(buildMasterChain(ctx, NO_EFFECTS, {} as AudioNode)).toBeNull();
    // Not one node: a bypassed stage would still be a stage in the path.
    expect(made).toHaveLength(0);
  });

  it('builds the on effects, in the order a pedalboard wires them', () => {
    const { ctx, made } = stubContext();
    const chain = buildMasterChain(ctx, { drive: 40, cab: 20, tape: 20, radio: 20, vinyl: 20, chorus: 10, crush: 10 }, {} as AudioNode);
    expect(chain?.effects).toEqual(EFFECT_ORDER.filter((id) => id !== 'punch' && id !== 'tilt'));
    // The input, then the stages, and nothing a CHANNEL has: no fader, no panner,
    // no sends, and no merger — a bus is one signal in and one signal out.
    const kinds = made.map((entry) => entry.kind);
    expect(kinds[0]).toBe('gain');
    // A shaper each for `drive`, `crush`, the tape machine's gentler saturation
    // and the telephone's staircase.
    expect(kinds.filter((kind) => kind === 'shaper')).toHaveLength(4);
    expect(kinds).not.toContain('merger');
    // `punch` and `tilt` are off, so the nodes they would have added are not here
    // at all — the cabinet's three shelves and the telephone's two edges are every
    // biquad in this graph.
    expect(kinds).not.toContain('compressor');
    expect(kinds.filter((kind) => kind === 'biquad')).toHaveLength(5);
    // ...and two looping beds on the mix: the tape machine's hiss and the
    // record's, both added rather than run through.
    expect(kinds.filter((kind) => kind === 'bufferSource')).toHaveLength(2);
  });

  it('turns an effect that is in the graph, and refuses one that is not', () => {
    const { ctx } = stubContext();
    const chain = buildMasterChain(ctx, { drive: 40 }, {} as AudioNode);
    expect(chain?.setEffect('drive', 80, 0)).toBe(true);
    expect(chain?.setEffect('tilt', 40, 0)).toBe(false);
  });

  it('refuses a word that is not one of the effects, and says which statements are', () => {
    const result = applyScript(createSong(), 'master verb 40');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('master takes the effects in pairs');
    expect(result.errors[0].message).toContain('reverb 30');
  });

  it('refuses a bare master, and an effect with no amount', () => {
    const bare = applyScript(createSong(), 'master');
    const amountless = applyScript(createSong(), 'master drive');
    expect(bare.ok).toBe(false);
    expect(amountless.ok).toBe(false);
    if (bare.ok || amountless.ok) return;
    expect(bare.errors[0].message).toContain('master needs at least one effect');
    expect(amountless.errors[0].message).toContain('master drive needs a percentage');
  });

  it('refuses an amount outside the range, in the same words a track line uses', () => {
    const result = applyScript(createSong(), 'master gate 140');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toBe('gate is a percentage 0..100; got "140". 0 is off, 100 is as tight as this app goes.');
  });

  it('writes a master line only when the mix has been shaped', () => {
    const clean = songToScript(createSong());
    expect(clean).not.toContain('master');
    const shaped = applyScript(createSong(), 'master crush 30 punch 15');
    expect(shaped.ok).toBe(true);
    if (!shaped.ok) return;
    const script = songToScript(shaped.song);
    expect(script).toContain('master crush 30 punch 15');
    const again = applyScript(createSong(), script);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.song.master.crush).toBe(30);
    expect(again.song.master.punch).toBe(15);
  });

  it('writes a file at version 15 only for a song whose mix is shaped', () => {
    const clean = songToJson(createSong());
    expect(clean).toContain('"version": 12');
    expect(clean).not.toContain('"master"');

    const shaped = applyScript(createSong(), 'master tilt 25');
    expect(shaped.ok).toBe(true);
    if (!shaped.ok) return;
    const file = songToJson(shaped.song);
    expect(file).toContain('"version": 15');
    expect(file).toContain('"master": {\n    "tilt": 25\n  },');

    const parsed = songFromJson(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.song.master.tilt).toBe(25);
    expect(songToJson(parsed.song)).toBe(file);
  });

  it('writes version 30 for a cabinet, and round-trips it either way round', () => {
    // The newest effect is the one case where the version is not `14`/`15`: a
    // build that stops at 29 reads the effects it KNOWS by name, so it would drop
    // a `"cab"` key without a word and save the channel with the box missing.
    const plain = songToJson(createSong());
    expect(plain).toContain('"version": 12');

    const onTrack = applyScript(createSong(), 'track 2 drive 40 cab 60');
    const onMix = applyScript(createSong(), 'master cab 30');
    expect(onTrack.ok && onMix.ok).toBe(true);
    if (!onTrack.ok || !onMix.ok) return;

    for (const song of [onTrack.song, onMix.song]) {
      expect(songToJson(song)).toContain('"version": 30');
      expect(songToJson(song)).toContain('cab');
      // The script spells it on the line, in the model's own order, and reads it
      // back as the same song — a save is a script, so this is the round trip
      // that matters most.
      const script = songToScript(song);
      expect(script).toContain('cab');
      const again = applyScript(createSong(), script);
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.song.tracks.map((track) => track.cab)).toEqual(song.tracks.map((track) => track.cab));
      expect(again.song.master.cab).toBe(song.master.cab);
    }
    expect(songToScript(onTrack.song)).toContain('cab 60');

    // ...and a version-29 build's file is still opened exactly as it says: the
    // older versions do not move because something newer arrived.
    const older = songFromJson(plain);
    expect(older.ok).toBe(true);
    if (!older.ok) return;
    expect(older.song.master).toEqual(NO_EFFECTS);
  });

  it('writes version 31 for the tape machine, and keeps 30 for a cabinet', () => {
    // One version per feature rather than one for "the newest effect": a song that
    // only ever asked for `cab` still says 30, which is the number that means
    // exactly what it needs to mean.
    const cabOnly = applyScript(createSong(), 'track 1 cab 40');
    const taped = [
      applyScript(createSong(), 'track 1 tape 40'),
      applyScript(createSong(), 'master tape 20'),
    ];
    expect(cabOnly.ok && taped.every((r) => r.ok)).toBe(true);
    if (!cabOnly.ok) return;
    expect(songToJson(cabOnly.song)).toContain('"version": 30');

    for (const result of taped) {
      if (!result.ok) return;
      expect(songToJson(result.song)).toContain('"version": 31');
      // ...and the script round trip carries the machine's number, both ways.
      const script = songToScript(result.song);
      expect(script).toContain('tape');
      const again = applyScript(createSong(), script);
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.song.tracks.map((track) => track.tape)).toEqual(result.song.tracks.map((track) => track.tape));
      expect(again.song.master.tape).toBe(result.song.master.tape);
    }
  });

  it('writes version 32 for a telephone, and leaves 31 to the tape', () => {
    const taped = applyScript(createSong(), 'track 1 tape 40');
    const radioed = [
      applyScript(createSong(), 'track 2 radio 70'),
      applyScript(createSong(), 'master radio 60'),
    ];
    expect(taped.ok && radioed.every((result) => result.ok)).toBe(true);
    if (!taped.ok) return;
    expect(songToJson(taped.song)).toContain('"version": 31');

    for (const result of radioed) {
      if (!result.ok) return;
      expect(songToJson(result.song)).toContain('"version": 32');
      const script = songToScript(result.song);
      expect(script).toContain('radio');
      const again = applyScript(createSong(), script);
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.song.tracks.map((track) => track.radio))
        .toEqual(result.song.tracks.map((track) => track.radio));
      expect(again.song.master.radio).toBe(result.song.master.radio);
    }
  });

  it('writes version 33 for a record, and leaves 32 to the telephone', () => {
    const radioed = applyScript(createSong(), 'track 1 radio 40');
    const pressed = [
      applyScript(createSong(), 'track 2 vinyl 30'),
      applyScript(createSong(), 'master tape 25 vinyl 12'),
    ];
    expect(radioed.ok && pressed.every((result) => result.ok)).toBe(true);
    if (!radioed.ok) return;
    expect(songToJson(radioed.song)).toContain('"version": 32');

    for (const result of pressed) {
      if (!result.ok) return;
      expect(songToJson(result.song)).toContain('"version": 33');
      const script = songToScript(result.song);
      expect(script).toContain('vinyl');
      const again = applyScript(createSong(), script);
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.song.tracks.map((track) => track.vinyl))
        .toEqual(result.song.tracks.map((track) => track.vinyl));
      expect(again.song.master.vinyl).toBe(result.song.master.vinyl);
    }
    // `vinyl` is the newest EFFECT, which is a few versions below the newest a
    // build writes: the versions two track settings earned (`robin`/`touch`, then
    // `drift`) come after it, exactly as `strum` would have if it had claimed one.
    expect(VINYL_SONG_FILE_VERSION).toBe(VARIATION_SONG_FILE_VERSION - 1);
    expect(VARIATION_SONG_FILE_VERSION).toBe(DRIFT_SONG_FILE_VERSION - 1);
    expect(DRIFT_SONG_FILE_VERSION).toBe(SPEED_SONG_FILE_VERSION - 1);
    // The DRUM MACHINE claimed the newest slot after `speed`, and a machine with
    // MORE THAN ONE BAR claimed one more, so the tape speed is two below the
    // ceiling now rather than at it.
    expect(SPEED_SONG_FILE_VERSION).toBe(MACHINE_SONG_FILE_VERSION - 1);
    expect(MACHINE_SONG_FILE_VERSION).toBe(MACHINE_BARS_SONG_FILE_VERSION - 1);
    expect(MACHINE_BARS_SONG_FILE_VERSION).toBe(MACHINE_PAD_SAMPLE_SONG_FILE_VERSION - 1);
    expect(MACHINE_PAD_SAMPLE_SONG_FILE_VERSION).toBe(MACHINE_SECTION_BAR_SONG_FILE_VERSION - 1);
    // The LIVE page's SCENES claimed the newest slot after the section machine
    // bar, so `machine section bar` is one below the ceiling now rather than at it.
    expect(MACHINE_SECTION_BAR_SONG_FILE_VERSION).toBe(SCENES_SONG_FILE_VERSION - 1);
    // And the ARP page's DIALS claimed the newest slot after the scenes, so the
    // live set is one below the ceiling now rather than at it.
    expect(SCENES_SONG_FILE_VERSION).toBe(ARP_SONG_FILE_VERSION - 1);
    expect(ARP_SONG_FILE_VERSION).toBe(SONG_FILE_VERSION_MAX);
  });

  it('opens an older file with a clean mix, and refuses a newer one', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const older = songFromJson(JSON.stringify(raw));
    expect(older.ok).toBe(true);
    if (!older.ok) return;
    expect(older.song.master).toEqual(NO_EFFECTS);

    // One past the newest version THIS build understands, which is not the same
    // number as the one a master needs: the format moves for other reasons too.
    const newer = songFromJson(JSON.stringify({ ...raw, version: SONG_FILE_VERSION_MAX + 1 }));
    expect(newer.ok).toBe(false);
  });

  it('clamps a mix amount rather than refusing it, and refuses a value that is not a number', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const loud = songFromJson(JSON.stringify({ ...raw, version: MASTER_SONG_FILE_VERSION, master: { drive: 400 } }));
    expect(loud.ok).toBe(true);
    if (!loud.ok) return;
    expect(loud.song.master.drive).toBe(MAX_EFFECT);

    const nonsense = songFromJson(JSON.stringify({ ...raw, version: MASTER_SONG_FILE_VERSION, master: { drive: 'warm' } }));
    expect(nonsense.ok).toBe(false);
    if (nonsense.ok) return;
    expect(nonsense.errors.join(' ')).toContain('"master"');

    const wrongShape = songFromJson(JSON.stringify({ ...raw, version: MASTER_SONG_FILE_VERSION, master: 40 }));
    expect(wrongShape.ok).toBe(false);
  });

  it('is part of the language the build publishes', () => {
    // The version this build speaks moves as the language grows, so the promise
    // here is about `master` and not about the number: a build that speaks at
    // least 4 knows the word, publishes an example for it, and says what 4 added.
    const { commands, scriptVersion, versionNotes } = scriptCapabilities();
    expect(scriptVersion).toBeGreaterThanOrEqual(4);
    expect(commands.find((command) => command.word === 'master')?.example).toBe('master drive 20 tilt 15');
    expect(versionNotes.some((note) => note.version === 4)).toBe(true);
  });
});
