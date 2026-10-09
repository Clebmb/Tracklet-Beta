/**
 * chain — one channel's place in the graph: what it sounds like, how loud, and
 * where.
 *
 * Both the live engine and the offline renderer need the same nodes per channel
 * (an effects stage, a level gain, two pan gains, two send gains and a merger),
 * and both need the same rules about what a pan MEANS, what a send MEANS and what
 * an effect DOES. Keeping it here means an exported file is driven, panned and
 * balanced by the same code that did it while you listened.
 *
 * ── Why not a built-in panner ────────────────────────────────────────────────
 * An equal-power panner (`StereoPannerNode`) makes dead centre a gain of 0.707
 * on each side, so adding one would quietly drop every existing song by 3 dB.
 * This is instead the old constant-gain law: from the centre you simply TURN DOWN
 * the side you are moving away from, so a centred channel is a gain of 1 in both
 * ears — byte for byte what this app played when every channel was centred — and
 * a channel at hard left is full on the left and silent on the right.
 *
 * The cost is that the middle is louder than the sides rather than equal-power
 * across the field. For a tracker, where pan is mostly "keep the bass and the
 * lead from fighting", that is the right trade: nothing gets quieter by existing.
 *
 * ── The effects stage, and why it is BUILT rather than bypassed ──────────────
 * A channel can carry eight effects (`TRACK_EFFECTS` in the model). The tempting
 * shape is to build all six nodes always and mix them in with a gain — and it is
 * wrong here, for the reason the pan law above exists: a node in the path is a
 * chance to change a song that never asked for the effect. A compressor with a
 * bypass gain still rounds transients; a filter at "0 dB" still turns the phase.
 *
 * So an effect at 0 is not a node at all. A chain with all six off is wired
 * EXACTLY as it was before effects existed — the level gain is the input, the
 * sends tap it, and there is nothing else between a note and the speakers — and
 * switching an effect on REBUILDS the channel with the stage spliced in. That
 * rebuild is what buys the rule: everything this app wrote before effects existed
 * is untouched, not merely close.
 */

import {
  clampEffect,
  clampEffects,
  duckGain,
  MAX_EFFECT,
  type ChannelEffects,
  type TrackEffectId,
} from '../model/song';

/** How long every gain here takes to reach a new value. A step change clicks. */
const RAMP_S = 0.01;

/**
 * The buses one channel fans out to: the dry sum, and the two effect sends.
 *
 * All three are plain nodes rather than something this file builds, because the
 * room owns its own buses (`audio/room.ts`) and the dry sum is the engine's.
 */
export interface ChannelSends {
  reverb: AudioNode;
  echo: AudioNode;
}

/** The settings one channel's chain carries, all of them 0..100 except `pan`. */
export interface ChannelChainOptions {
  /** How loud, before mute and solo. A gain, not a percentage. */
  level: number;
  /** -100 hard left to 100 hard right. */
  pan: number;
  /** How much of the channel goes to the reverb bus. */
  verb: number;
  /** How much goes to the echo bus. */
  echo: number;
  /**
   * The channel's effects. Absent means all of them off, which is the graph this
   * app built before effects existed — so a caller that knows nothing about them
   * (a test, an old caller) gets the old behaviour.
   */
  effects?: Partial<ChannelEffects>;
  /**
   * Whether this channel takes part in a duck — either end of one.
   *
   * One flag for both directions, because the node is the same node: a channel
   * that someone else's hit pushes down needs somewhere for the push to happen,
   * and a channel that DUCKS needs nothing but the scheduling. Absent means no
   * node, which is the graph every song had before anybody ducked anything.
   */
  duck?: boolean;
  /**
   * How many channels this chain's input holds, when it is fed something already
   * STEREO.
   *
   * A channel's own notes are mono, so the default — let the input follow its
   * source — is right for a track, and every track keeps the graph it always had.
   * The DRUM MACHINE is the one caller that needs this: its input is fed by a
   * PAD's panned output (already two channels), and a plain gain would down-mix
   * that stereo to mono, throwing the pad's place between the speakers away. The
   * machine chain is therefore built `inputChannels: 2`, so a pad's left and right
   * arrive as two channels and the machine's own pan spreads the pair rather than
   * collapsing it. Absent means the old behaviour, so nothing else moves.
   */
  inputChannels?: number;
}

/** One channel's chain, from the notes to the shared buses. */
export interface ChannelChain {
  /** Where this channel's notes connect. */
  input: GainNode;
  /** Everything the chain owns, so a caller can unplug the lot. */
  nodes: AudioNode[];
  /** Which effects are built into this graph, in the order they are wired. */
  effects: readonly TrackEffectId[];
  /** Set the channel's level as a plain gain, 0..1. */
  setLevel(level: number, at: number): void;
  /** Set the channel's place between the speakers, -100 left to 100 right. */
  setPan(pan: number, at: number): void;
  /** Set how much of the channel is fed to the reverb, 0..100. */
  setVerb(amount: number, at: number): void;
  /** Set how much of the channel is fed to the echo, 0..100. */
  setEcho(amount: number, at: number): void;
  /**
   * Turn one effect up or down, 0..100, without rebuilding anything.
   *
   * Answers false when this chain has no node for that effect (it was off when
   * the chain was built), which is the caller's signal to rebuild the channel —
   * the ONE case a chain cannot handle live, and the reason the answer is a
   * boolean rather than a throw.
   */
  setEffect(id: TrackEffectId, amount: number, at: number): boolean;
  /** True when this graph has a node for the other channels to push down. */
  readonly ducked: boolean;
  /**
   * Duck this channel at a time on the audio clock: down now, back over the
   * length of the hit that caused it.
   *
   * Scheduled rather than ramped live, and that is the whole reason ducking is
   * possible at all in this app: the sequencer already knows WHEN the next hit
   * lands, so the dip can be written into the audio clock with the same
   * precision as the note itself — the same trick the look-ahead scheduler is
   * built on. A no-op on a chain with no duck node, which is what keeps a song
   * that never ducked anything free of both the node and the arithmetic.
   */
  scheduleDuck(amount: number, when: number, lengthSeconds: number): void;
}

/**
 * Build a channel's chain. Without effects the dry path is exactly what it has
 * always been — `input (level) → left/right → merger → destination`, with two
 * taps off `input` feeding the reverb and echo buses — and with effects it is
 * `input → [stages] → fader (level) → left/right → merger`, the same sends off
 * the fader.
 *
 * `level` is the gain BEFORE mute and solo, which the live engine resolves out of
 * `channelGain` — this file has no opinion about which channels are heard, only
 * about how one is wired once that is settled.
 *
 * The sends are tapped POST-FADER AND PRE-PAN. Post-fader, because turning a
 * channel down should take its reverb with it — a send that ignored the fader
 * would leave the quietest instrument soaked in the loudest tail. Pre-pan,
 * because both effects are MONO buses: they have one input each, and feeding them
 * from the pair of pan gains would mean a hard-left channel arriving twice as
 * loud as a centred one. Tapping the single pre-pan signal gives every speaker
 * position the same amount of room, which is the behaviour of the hardware this
 * is modelled on.
 */
export function buildChannelChain(
  ctx: BaseAudioContext,
  options: ChannelChainOptions,
  destination: AudioNode,
  sends: ChannelSends,
): ChannelChain {
  const amounts = effectAmounts(options.effects);
  const wanted = EFFECT_ORDER.filter((id) => amounts[id] > 0);

  const input = ctx.createGain();
  // A chain fed an already-stereo source (the machine, fed by its pads) has to
  // hold both channels rather than fold them to one — see `inputChannels`. Absent
  // leaves the node exactly as it was, which is what keeps a track's graph and
  // every golden hash untouched.
  if (options.inputChannels !== undefined) {
    input.channelCount = options.inputChannels;
    input.channelCountMode = 'explicit';
  }
  const nodes: AudioNode[] = [input];

  /**
   * Where the other channels push this one down, when anybody ducks anything.
   *
   * BEFORE the fader and after the effects, which is the one place it can go: the
   * fader is what the sends tap, so a dip in front of it takes the reverb and the
   * echo with it (a ducked bass must not leave its tail in the hall through the
   * kick), and it is behind the effects, so a driven channel is not re-driven by
   * its own duck.
   */
  const duckNode = options.duck ? ctx.createGain() : null;
  if (duckNode) nodes.push(duckNode);

  // With no effects AND no duck node the input IS the fader, which is why this
  // is not a second node: an extra unity gain would be one more chance to not be
  // bit-identical.
  const fader = wanted.length === 0 && !duckNode ? input : ctx.createGain();
  if (fader !== input) nodes.push(fader);
  input.gain.value = fader === input ? options.level : 1;
  fader.gain.value = options.level;

  // Built ONCE each, in pedalboard order: shape the sound, balance it, control
  // it, then spread it. `stage.connect(from)` answers with the node the next
  // stage should read from, so a two-node effect (a shelf pair, a delay and its
  // LFO) looks the same as a one-node one from here.
  const stages = wanted.map((id) => ({ id, stage: buildStage(ctx, id, amounts[id]) }));

  let tail: AudioNode = input;
  for (const { stage } of stages) {
    tail = stage.connect(tail);
    nodes.push(...stage.nodes);
  }
  if (duckNode) {
    tail.connect(duckNode);
    tail = duckNode;
  }
  // Only when they are different nodes. With nothing on, the input IS the fader,
  // and `input.connect(input)` is not a no-op — it is a feedback loop around a
  // gain of 1, which is a node that never stops getting louder. The graph a
  // clean channel builds must also stay the exact one it built before effects
  // existed, so this line has to vanish rather than pass through.
  if (tail !== fader) tail.connect(fader);

  const left = ctx.createGain();
  const right = ctx.createGain();
  const verb = ctx.createGain();
  const echo = ctx.createGain();
  applyPanGains(left, right, options.pan, ctx.currentTime);
  verb.gain.value = sendGain(options.verb);
  echo.gain.value = sendGain(options.echo);
  const merger = ctx.createChannelMerger(2);
  if (options.inputChannels === 2) {
    // A STEREO source (the machine, fed by its already-panned pads): pan is a
    // BALANCE across the pair rather than a fold of one mono signal into two
    // sides. A splitter hands each side its own gain, so a pad's left stays left
    // and a pad's right stays right, and the machine's own pan leans the pair the
    // way a balance control does. (A merger input takes ONE channel, so routing a
    // stereo pair straight into it would read the LEFT channel twice — which is
    // exactly the bug this branch exists to avoid.) The mono branch below is
    // untouched, so every track keeps the graph and every golden hash it had.
    const splitter = ctx.createChannelSplitter(2);
    fader.connect(splitter);
    splitter.connect(left, 0);
    splitter.connect(right, 1);
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    nodes.push(splitter);
  } else {
    fader.connect(left).connect(merger, 0, 0);
    fader.connect(right).connect(merger, 0, 1);
  }
  merger.connect(destination);
  fader.connect(verb).connect(sends.reverb);
  fader.connect(echo).connect(sends.echo);
  nodes.push(left, right, verb, echo, merger);

  const live = new Map(stages.map(({ id, stage }) => [id, stage] as const));
  return {
    input,
    nodes,
    effects: stages.map(({ id }) => id),
    setLevel: (value, at) => fader.gain.setTargetAtTime(value, at, RAMP_S),
    setPan: (value, at) => applyPanGains(left, right, value, at),
    setVerb: (value, at) => verb.gain.setTargetAtTime(sendGain(value), at, RAMP_S),
    setEcho: (value, at) => echo.gain.setTargetAtTime(sendGain(value), at, RAMP_S),
    ducked: duckNode !== null,
    scheduleDuck: (amount, when, lengthSeconds) => {
      if (!duckNode) return;
      planDuck(duckNode.gain, amount, when, lengthSeconds);
    },
    setEffect: (id, amount, at) => {
      const stage = live.get(id);
      if (!stage) return false;
      stage.set(clampEffect(amount), at);
      return true;
    },
  };
}

/**
 * The same eight effects, on the WHOLE MIX rather than on one channel.
 *
 * A master chain is a channel chain with everything that makes a channel a
 * channel taken out: no fader, no pan, no sends, and no panner — just the stages,
 * spliced into the one place every channel's dry signal passes through on its way
 * to the room. That is why it is a function of its own instead of a flag on
 * `buildChannelChain`: what it shares with a channel is the EFFECTS, and everything
 * else it shares with nothing.
 *
 * **Absent is the point.** It answers `null` when no effect in the set has a
 * stage, so a caller wires its own input straight to the destination and a song
 * that never shaped its mix is bit-identical to one written before the master
 * existed. A unity gain node would already be one more chance to not be.
 *
 * `gate` is not here, because `gate` is not a node anywhere: it shortens a note,
 * and a note belongs to a channel. The master's own `gate` is applied where every
 * note's length is decided — see `gateFactor`.
 */
export function buildMasterChain(
  ctx: BaseAudioContext,
  effects: Partial<ChannelEffects> | undefined,
  destination: AudioNode,
): MasterChain | null {
  const amounts = effectAmounts(effects);
  const wanted = EFFECT_ORDER.filter((id) => amounts[id] > 0);
  if (wanted.length === 0) return null;

  const input = ctx.createGain();
  const nodes: AudioNode[] = [input];
  const stages = wanted.map((id) => ({ id, stage: buildStage(ctx, id, amounts[id]) }));

  let tail: AudioNode = input;
  for (const { stage } of stages) {
    tail = stage.connect(tail);
    nodes.push(...stage.nodes);
  }
  tail.connect(destination);

  const live = new Map(stages.map(({ id, stage }) => [id, stage] as const));
  return {
    input,
    nodes,
    effects: stages.map(({ id }) => id),
    setEffect: (id, amount, at) => {
      const stage = live.get(id);
      if (!stage) return false;
      stage.set(clampEffect(amount), at);
      return true;
    },
  };
}

/** One mix's worth of effects: where the whole band goes in, and what was built. */
export interface MasterChain {
  /** Where every channel's dry signal arrives. */
  input: GainNode;
  /** Everything this chain owns, so a caller can unplug and drop the lot. */
  nodes: AudioNode[];
  /** Which effects are wired in, in the order they are wired. */
  effects: readonly TrackEffectId[];
  /**
   * Turn one effect up or down, 0..100.
   *
   * Answers false when this chain has no node for that effect, which is the same
   * signal a channel chain gives its caller: the set of effects that are ON is
   * what decides the SHAPE of the graph, so a caller that crosses zero rebuilds.
   */
  setEffect(id: TrackEffectId, amount: number, at: number): boolean;
}

// --- the duck, as a curve on a gain -------------------------------------------

/** How long a duck takes to reach the bottom. Fast, or the hit escapes it. */
export const DUCK_ATTACK_S = 0.005;
/**
 * The shortest a duck takes to come back.
 *
 * The release is the length of the hit that caused the dip, so the mix breathes
 * in time with the music rather than with a stopwatch — but a one-step kick at a
 * fast tempo is a very short note, and a release of a few milliseconds is a click
 * rather than a pump. This is the floor under it.
 */
export const MIN_DUCK_RELEASE_S = 0.04;

/**
 * Write one duck into an `AudioParam`, in advance.
 *
 * Three events and no more: the value is where it belongs at the moment of the
 * hit, the dip is the hit, and the way back up takes as long as the hit does. At
 * `0` the depth is exactly 1 — the value the gain already has — and this returns
 * without touching the param at all, which is what makes an unducked song's graph
 * exactly the graph it always was.
 */
export function planDuck(param: AudioParam, amount: number, when: number, lengthSeconds: number): void {
  const depth = duckGain(amount);
  if (depth >= 1) return;
  const release = Math.max(MIN_DUCK_RELEASE_S, lengthSeconds);
  param.setValueAtTime(1, when);
  param.linearRampToValueAtTime(depth, when + DUCK_ATTACK_S);
  param.linearRampToValueAtTime(1, when + DUCK_ATTACK_S + release);
}

// --- the ten effects, as stages ---------------------------------------------

/**
 * The order the stages are wired in, which is NOT the order the menus list them.
 *
 * It is the order a pedalboard uses, and each step is there for a reason: shape
 * the sound first (`drive`, `crush`), then put it through the box it comes out of
 * (`cab`), onto the machine it was printed to (`tape`) and down the line it came
 * over (`radio`) and the record it was finally pressed on (`vinyl`) — all four the
 * same kind of decision one step further down the path, a speaker after an amp, a
 * tape after the console, a telephone at the far end of it and a record under the
 * whole thing, never before them — balance it next (`tilt`), control its dynamics
 * after that (`punch`, so the compressor hears the finished tone rather than a
 * gain it would have to re-learn), and spread it last (`chorus`, so the
 * modulation is never itself distorted). `gate` is deliberately absent — it is
 * arithmetic on a note's length (`gateFactor` in the model) rather than a node.
 */
export const EFFECT_ORDER: readonly TrackEffectId[] =
  ['drive', 'crush', 'cab', 'tape', 'radio', 'vinyl', 'tilt', 'punch', 'chorus'];

/**
 * One effect, ready to be spliced into a chain.
 *
 * `connect(from)` wires the stage's input to `from` and answers with the node the
 * next stage should read; `set(amount, at)` changes the amount live; `nodes` is
 * everything it created, so a caller can unplug and dispose of it.
 */
interface EffectStage {
  connect(from: AudioNode): AudioNode;
  set(amount: number, at: number): void;
  nodes: AudioNode[];
}

/**
 * Every amount filled in and clamped, so nothing downstream has to worry about a
 * missing or stray value — and so the one rule about what a set of effects IS
 * (`clampEffects`, in the model) is not written twice.
 */
function effectAmounts(effects: Partial<ChannelEffects> | undefined): ChannelEffects {
  return clampEffects(effects);
}

function buildStage(ctx: BaseAudioContext, id: TrackEffectId, amount: number): EffectStage {
  switch (id) {
    case 'drive': return driveStage(ctx, amount);
    case 'crush': return crushStage(ctx, amount);
    case 'cab': return cabStage(ctx, amount);
    case 'tape': return tapeStage(ctx, amount);
    case 'radio': return radioStage(ctx, amount);
    case 'vinyl': return vinylStage(ctx, amount);
    case 'tilt': return tiltStage(ctx, amount);
    case 'punch': return punchStage(ctx, amount);
    case 'chorus': return chorusStage(ctx, amount);
    default:
      // `gate` has no stage: it is arithmetic on a note's length. Reaching here
      // means `EFFECT_ORDER` and this switch disagree, so answer with a stage
      // that does nothing rather than a broken graph — and the test that walks
      // the list says so loudly.
      return { connect: (from) => from, set: () => {}, nodes: [] };
  }
}

/** How many samples are in a lookup-table curve. 2048 is what a shaper is usually given. */
const CURVE_SAMPLES = 2048;

/** A curve's input, -1..1, for the sample at `i`. */
function curveInput(i: number): number {
  return (i / (CURVE_SAMPLES - 1)) * 2 - 1;
}

/**
 * How hard the drive curve bends, at 100. Six is a strong fuzz without becoming
 * a square wave: past about here every input level saturates the same way, and
 * the knob stops changing anything.
 */
export const DRIVE_BEND = 6;

/**
 * How much of the drive's extra loudness is taken back out, at 100.
 *
 * Drive is the one effect that can only ADD level: a saturating curve bends quiet
 * signals up toward the ceiling, so a channel driven hard would simply be louder
 * unless something takes it back. This is that something, and it is why the knob
 * reads as a change of TONE rather than a change of level.
 */
export const DRIVE_TRIM = 0.9;

/**
 * The drive curve: a saturating bend whose ends stay at exactly ±1.
 *
 * `tanh` rather than a hard clip because every genre that says "drive" means the
 * rounded kind — a fuzz pedal, a valve amp, a 303 — and a hard clip is a
 * different sound that this app can reach by turning the knob up and back on a
 * louder channel.
 */
export function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  return saturationCurve(amount, DRIVE_BEND, DRIVE_TRIM);
}

/**
 * A saturating curve, for any knob that is "make it softer round the edges".
 *
 * One implementation with two callers rather than two nearly-identical functions,
 * because the ONLY things that differ between a fuzzbox and a tape machine are
 * how far the curve bends and how much of the level it hands back — and those two
 * numbers are the whole of the difference a listener hears. The shape and the
 * guards are shared: `tanh` rather than a hard clip, the ends stay inside ±1, and
 * at `0` the table IS the straight line −1..1, so a stage built at zero adds
 * nothing to a sample that passes through it.
 */
function saturationCurve(amount: number, bendMax: number, trimMax: number): Float32Array<ArrayBuffer> {
  const t = clampEffect(amount) / MAX_EFFECT;
  const bend = t * bendMax;
  const norm = Math.tanh(bend) || 1;
  const trim = 1 / (1 + trimMax * t);
  const curve = new Float32Array(CURVE_SAMPLES);
  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const x = curveInput(i);
    curve[i] = t <= 0 ? x : (Math.tanh(bend * x) / norm) * trim;
  }
  return curve;
}

function driveStage(ctx: BaseAudioContext, amount: number): EffectStage {
  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve(amount);
  // Two times oversampling, because a saturator's whole character is in the
  // harmonics it folds back down, and aliasing turns that character into noise.
  shaper.oversample = '2x';
  return {
    connect: (from) => { from.connect(shaper); return shaper; },
    set: (value) => { shaper.curve = driveCurve(value); },
    nodes: [shaper],
  };
}

/** The finest and coarsest steps `crush` squeezes a sample into, in bits. */
export const CRUSH_MAX_BITS = 12;
export const CRUSH_MIN_BITS = 3;

/**
 * The crush curve: a staircase, and how many steps it has.
 *
 * The honest part is what this does NOT do. A "bitcrush" in the wild usually
 * throws away sample RATE as well as precision, and the browser's graph cannot
 * resample a stream without a worklet — so this is the bit depth alone, which is
 * the half that sounds like grit rather than like a modem. What it is must stay
 * in the name: `pure`to`gritty`, not `bitcrush`.
 *
 * The staircase is also softened by the table's own interpolation, so the steps
 * are rounded rather than square. That is the difference between a broken
 * converter and a broken file, and the rounder one is the one people reach for.
 */
export function crushCurve(amount: number): Float32Array<ArrayBuffer> {
  const t = clampEffect(amount) / MAX_EFFECT;
  const bits = CRUSH_MAX_BITS - t * (CRUSH_MAX_BITS - CRUSH_MIN_BITS);
  const levels = Math.pow(2, Math.max(2, bits));
  const half = levels / 2;
  const curve = new Float32Array(CURVE_SAMPLES);
  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const x = curveInput(i);
    curve[i] = t <= 0 ? x : Math.round(x * half) / half;
  }
  return curve;
}

function crushStage(ctx: BaseAudioContext, amount: number): EffectStage {
  const shaper = ctx.createWaveShaper();
  shaper.curve = crushCurve(amount);
  return {
    connect: (from) => { from.connect(shaper); return shaper; },
    set: (value) => { shaper.curve = crushCurve(value); },
    nodes: [shaper],
  };
}

/**
 * Where the cabinet's top end sits at the two ends of the knob, in Hz.
 *
 * Twelve kilohertz is wide open — above the band the engine's own oscillators put
 * real energy in, which is why a cabinet at `0` is a door rather than a filter —
 * and 2.4 kHz is roughly the top of a small speaker, which is the whole
 * character: an amp's speaker stops well below where the ear does, and everything
 * above it is a cone being asked for something it cannot do.
 */
export const CAB_TOP_HZ = 12000;
export const CAB_TOP_MIN_HZ = 2400;
/**
 * How much the top's shoulder rings, as the low-pass's Q.
 *
 * Just under one, so the corner is a small lift rather than a whistle. A speaker
 * is a cone, not a filter with a resonance, and the mid push below is where its
 * character really lives — this is here so the closed top does not sound simply
 * muffled.
 */
export const CAB_Q = 0.9;
/** Where the cabinet pushes back, in Hz, and how far at the top of the knob. */
export const CAB_MID_HZ = 1600;
export const CAB_MID_DB = 5;
/**
 * Where a small box stops going down, in Hz, and how much of it is taken away.
 *
 * The bottom is the half of a cabinet a low-pass alone cannot reach: taking only
 * the top away makes a channel DULL, and taking a little of the very bottom away
 * as well is what makes it sound like something small. The shelf is where the
 * app already puts one (`TILT_LOW_HZ`), so the two effects cannot disagree about
 * what "the bottom" means.
 */
export const CAB_BOTTOM_HZ = 120;
export const CAB_BOTTOM_DB = 5;

/** Where the cabinet's top end is at this amount, in Hz. Linear, like the tilt's dB. */
export function cabTopHz(amount: number): number {
  const t = clampEffect(amount) / MAX_EFFECT;
  return CAB_TOP_HZ + t * (CAB_TOP_MIN_HZ - CAB_TOP_HZ);
}

/** How much the cabinet pushes the middle back at this amount, in dB. Never down. */
export function cabMidGain(amount: number): number {
  return (clampEffect(amount) / MAX_EFFECT) * CAB_MID_DB;
}

/** How much of the box's bottom is gone at this amount, in dB. Never up. */
export function cabBottomGain(amount: number): number {
  return -(clampEffect(amount) / MAX_EFFECT) * CAB_BOTTOM_DB;
}

/**
 * A cabinet: a small box in a signal path, as three shelves.
 *
 * This is the difference between a distorted sawtooth and an amp. Nothing here
 * adds distortion or level of its own — it is a filter trio, and its whole job is
 * to sit after `drive` and make what the drive produced sound like it is coming
 * out of a twelve-inch speaker in a wooden box: the top closes, the middle pushes
 * back, and a little of the very bottom goes.
 */
function cabStage(ctx: BaseAudioContext, amount: number): EffectStage {
  const bottom = ctx.createBiquadFilter();
  bottom.type = 'lowshelf';
  bottom.frequency.value = CAB_BOTTOM_HZ;
  bottom.gain.value = cabBottomGain(amount);
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = CAB_MID_HZ;
  mid.Q.value = CAB_Q;
  mid.gain.value = cabMidGain(amount);
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = cabTopHz(amount);
  top.Q.value = CAB_Q;
  return {
    connect: (from) => { from.connect(bottom).connect(mid).connect(top); return top; },
    set: (value, at) => {
      bottom.gain.setTargetAtTime(cabBottomGain(value), at, RAMP_S);
      mid.gain.setTargetAtTime(cabMidGain(value), at, RAMP_S);
      top.frequency.setTargetAtTime(cabTopHz(value), at, RAMP_S);
    },
    nodes: [bottom, mid, top],
  };
}

/**
 * A telephone line, as numbers.
 *
 * ── What is actually being imitated ─────────────────────────────────────────
 * A voice on a telephone is two artifacts and they are easy to confuse: the line
 * carries a NARROW band (roughly 300 Hz to 3.4 kHz, because that is all a voice
 * needs to be understood) and it carries it COARSELY (a handful of bits, because
 * that is all the line paid for). The first is why a telephone sounds thin and
 * the second is why it sounds like a telephone rather than like a low-pass. This
 * stage is both, from one number.
 *
 * ── The order the two go in, and why it is not arbitrary ─────────────────────
 * Band first, then the coarse step. The other way round, the staircase's own
 * harmonics would be thrown away by the filter that follows it and what came out
 * would be a polite low-pass; this way the grit lives INSIDE the band, which is
 * where a real codec puts it and what makes the effect recognisable. It is the
 * same reasoning as `tape`'s hiss-after-the-wander, one effect along.
 */
export const RADIO_BOTTOM_MIN_HZ = 20;
/** Where the bottom stops at 100: the bottom of a telephone's band. */
export const RADIO_BOTTOM_MAX_HZ = 500;
/** Where the top sits at 0 — above the band the engine plays in, so 0 is a door. */
export const RADIO_TOP_MAX_HZ = 20000;
/** Where the top stops at 100: the top of a telephone's band. */
export const RADIO_TOP_MIN_HZ = 3000;
/** Both edges' shoulder. Flat rather than resonant: a line is not a filter with a peak. */
export const RADIO_Q = 0.7;
/**
 * How coarse the line gets at 100, as an amount on `crush`'s OWN staircase.
 *
 * `crush` at 100 is three bits, which is a broken modem; a telephone is around
 * six, which is why this is not a second curve but a SCALE on the first one. The
 * staircase, its rounding and its inertness at `0` are `crush`'s, and the only
 * thing this effect decides is how far along that line it is willing to go.
 */
export const RADIO_CRUSH_MAX = 67;

/** The bottom of the band at this amount, in Hz. */
export function radioBottomHz(amount: number): number {
  const t = clampEffect(amount) / MAX_EFFECT;
  return RADIO_BOTTOM_MIN_HZ + t * (RADIO_BOTTOM_MAX_HZ - RADIO_BOTTOM_MIN_HZ);
}

/** The top of the band at this amount, in Hz. */
export function radioTopHz(amount: number): number {
  const t = clampEffect(amount) / MAX_EFFECT;
  return RADIO_TOP_MAX_HZ + t * (RADIO_TOP_MIN_HZ - RADIO_TOP_MAX_HZ);
}

/** The line's coarseness at this amount: `crush`'s staircase, held back. */
export function radioCrushCurve(amount: number): Float32Array<ArrayBuffer> {
  const t = clampEffect(amount) / MAX_EFFECT;
  return crushCurve(t * RADIO_CRUSH_MAX);
}

/**
 * A telephone: a band with a coarse signal inside it.
 *
 * Two biquads and a staircase, and deliberately NO make-up gain. Narrowing a part
 * to a telephone band takes energy out of it, and it would be easy to put a
 * compensating gain here so the knob read as a change of tone rather than of
 * level — but `cab` and `tilt` do not do that either, and an effect that quietly
 * changes how loud a part is would make the fader a liar. A telephone part that
 * has to sit at the same level is a `level` on its own line, which is where the
 * whole app says how loud something is.
 */
function radioStage(ctx: BaseAudioContext, amount: number): EffectStage {
  const band = ctx.createBiquadFilter();
  band.type = 'highpass';
  band.frequency.value = radioBottomHz(amount);
  band.Q.value = RADIO_Q;
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = radioTopHz(amount);
  top.Q.value = RADIO_Q;
  const shaper = ctx.createWaveShaper();
  shaper.curve = radioCrushCurve(amount);
  return {
    connect: (from) => { from.connect(band).connect(top).connect(shaper); return shaper; },
    set: (value, at) => {
      band.frequency.setTargetAtTime(radioBottomHz(value), at, RAMP_S);
      top.frequency.setTargetAtTime(radioTopHz(value), at, RAMP_S);
      shaper.curve = radioCrushCurve(value);
    },
    nodes: [band, top, shaper],
  };
}

/**
 * A record, as numbers.
 *
 * ── What is actually being imitated ─────────────────────────────────────────
 * A record is not dirty in one way, it is dirty in two, and they are the two
 * halves of what a listener calls "vinyl". There is a SURFACE: a low, even hiss
 * of the groove itself, always there once the needle is down. And there is
 * CRACKLE: dust and tiny scratches, each a short tick whose length and level are
 * different every time, which is what makes it read as a place rather than as a
 * filter. `tape`'s hiss is the first of those and nothing else; this stage is
 * both, from one number.
 *
 * ── One bed, one gain, and why the density is not another knob ───────────────
 * The two halves are baked into ONE seeded buffer and the percentage scales the
 * whole bed — the same shape `tape`'s hiss uses, and for the same reason. The
 * record is a fixed artifact: it either has dust on it or it does not, and the
 * number is how loud the record is under the part, not how many scratches it
 * picked up along the way. A second knob for density would be a thing to set and
 * forget, and this app already asks a lot of one track line.
 *
 * ── Why the bed is ADDED rather than run through ─────────────────────────────
 * A record's noise is not the signal being processed; it is a second voice, the
 * room the music was found in. So the part passes through untouched and the bed
 * is summed in beside it, exactly as the tape machine adds its hiss outside the
 * wander. It is why `vinyl` at 10 does not make the music duller — it makes the
 * record quieter under it — and why the effect is safe on a whole mix.
 */
/** How many seconds of bed one buffer holds, before it loops. */
export const VINYL_BED_SECONDS = 4;
/** The bed's level at 100, as a gain. Quiet on purpose: a bed, not a sound. */
export const VINYL_BED_MAX = 0.025;
/** How many crackles a second the bed carries, on average. */
export const VINYL_CRACKLE_RATE = 7;
/** The loudest a single crackle is allowed to be, as a sample value. */
export const VINYL_CRACKLE_MAX = 0.6;
/**
 * How long one crackle rings, in seconds.
 *
 * A tick is short — a millisecond is already at the long end — because what makes
 * crackle read as dust rather than as a low thump is that it is over before the ear
 * can name a pitch. The decay is derived from this, so the constant is expressed
 * in the unit a person would use.
 */
export const VINYL_CRACKLE_SECONDS = 0.0009;

/** How loud the whole bed is at this amount, 0..1. */
export function vinylBedGain(amount: number): number {
  return (clampEffect(amount) / MAX_EFFECT) * VINYL_BED_MAX;
}

/**
 * The bed: a few seconds of surface hiss with crackle on top, looped forever.
 *
 * Deterministic on purpose, exactly like `tapeHissBuffer` next door and the reverb
 * impulse in `room.ts`: a seeded xorshift rather than `Math.random`, so a rendered
 * file is the record you heard and one export compares to another. Longer than the
 * tape's two seconds because crackle is EVENTS rather than a wash — a repeating
 * tick is far easier to notice than a repeating hiss, so this bed pays for four
 * seconds to push the loop point out of earshot.
 */
export function vinylBuffer(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * VINYL_BED_SECONDS));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let seed = 0x7a1e5c1d;
  /** One step of the three-line xorshift32 `tapeHissBuffer` and `makeImpulse` use. */
  const next = (): number => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 0xffffffff;
  };
  // The chance of a crackle on any one sample, so the rate is in CLICKS A SECOND
  // rather than in a per-sample probability nobody could read.
  const crackleChance = VINYL_CRACKLE_RATE / rate;
  const crackleDecay = Math.exp(-1 / (rate * VINYL_CRACKLE_SECONDS));
  let crackle = 0;
  for (let i = 0; i < length; i++) {
    const noise = next();
    // The surface: a low, even hiss under everything.
    let sample = (noise * 2 - 1) * 0.35;
    // ...and the crackle: a sparse tick whose ring-out is what a short impulse
    // sounds like. A SECOND draw sets its height, so no two ticks are the same.
    if (noise < crackleChance) crackle = VINYL_CRACKLE_MAX * (0.4 + 0.6 * next());
    if (crackle > 1e-6) {
      sample += crackle;
      crackle *= crackleDecay;
    }
    data[i] = sample;
  }
  return buffer;
}

/**
 * A record under the part: a surface bed with crackle on top.
 *
 * One looping source and one gain, summed into the output. Nothing else, because
 * nothing else is the effect: the music is not filtered, narrowed or compressed,
 * it is merely heard over a record.
 */
function vinylStage(ctx: BaseAudioContext, amount: number): EffectStage {
  const out = ctx.createGain();
  const bed = ctx.createBufferSource();
  bed.buffer = vinylBuffer(ctx);
  bed.loop = true;
  const bedGain = ctx.createGain();
  bedGain.gain.value = vinylBedGain(amount);
  bed.connect(bedGain).connect(out);
  bed.start(ctx.currentTime);
  return {
    connect: (from) => { from.connect(out); return out; },
    set: (value, at) => { bedGain.gain.setTargetAtTime(vinylBedGain(value), at, RAMP_S); },
    // The looping source is in the list so a caller that unplugs the chain stops
    // the bed: a buffer still looping on a chain nobody can hear is a leak.
    nodes: [out, bed, bedGain],
  };
}

/**
 * The tape machine, as numbers.
 *
 * ── Why this is one effect and not three ────────────────────────────────────
 * A worn recording is three artifacts at once: the electronics round the peaks
 * off (saturation), the transport does not turn at a perfectly constant speed
 * (wow and flutter), and the medium itself makes noise (hiss). Each is a stage a
 * person could build out of things this app already has — `drive` is half of the
 * first, `chorus` is a cousin of the second, `noise` is the third — and none of
 * the three is what anybody means when they say "put this on tape". So the three
 * arrive together, behind one percentage, and the docs say plainly what is behind
 * it. That is also why `tape` was worth a phase of its own: no combination of the
 * knobs that existed could reach it, which is the bar this plan set.
 *
 * ── The pitch numbers, and why they are as small as they look ───────────────
 * A modulated delay shifts pitch by the RATE OF CHANGE of its delay time, so the
 * depth that matters is `depth × 2π × rate` — which is why the numbers below look
 * tiny and are not. A −0.3 % wobble is about five cents, a wobble you notice on a
 * held piano note and nowhere else; real tape wanders by roughly that much.
 *
 * The wow is TWO rates that do not divide evenly (0.55 and 0.83 Hz) rather than
 * one, because a single sine is a chorus, not a machine: what makes wow sound
 * worn is that the wander never arrives at the same place twice at the same
 * moment. Flutter is the fast one — a reel's eccentricity, the capstan's bite —
 * and it is deliberately almost inaudible on its own, because its job is to make
 * the WOW sound like a mechanism rather than an LFO.
 */
export const TAPE_DELAY_MS = 6;
/** The slow wander, and a second rate that shares no period with it. */
export const TAPE_WOW_HZ = 0.55;
export const TAPE_WOW_DRIFT_HZ = 0.83;
/** How much of the wow the second rate contributes, so the two sum to one wander. */
export const TAPE_WOW_DRIFT_WEIGHT = 0.6;
/** The deepest the transport drifts at 100, in milliseconds: about twenty cents. */
export const TAPE_WOW_MAX_MS = 1.1;
/** The fast wobble, and how far it swings at 100: a twentieth of the wow. */
export const TAPE_FLUTTER_HZ = 7.3;
export const TAPE_FLUTTER_MAX_MS = 0.05;
/**
 * The saturation's bend and trim at 100.
 *
 * `drive` bends six times as hard and takes nearly a fifth of the level back;
 * this bends 1.4 and takes a seventh of it back, so the curve stays close to the
 * straight line it started as — a peak loses about a decibel and the middle comes
 * up a little around it, which is compression rather than distortion. A tape at
 * 100 is still a recording of the instrument, not a fuzzbox, and the trim is
 * SMALL for that reason: the trim's job is to cancel the level the bend adds, and
 * a bend this gentle has almost nothing to cancel.
 */
export const TAPE_BEND = 1.4;
export const TAPE_TRIM = 0.15;
/** The hiss bed's level at 100, as a gain. Quiet on purpose: a bed, not a sound. */
export const TAPE_HISS_MAX = 0.02;
/** How much hiss is added at this amount, 0..1. */
export function tapeHissGain(amount: number): number {
  return (clampEffect(amount) / MAX_EFFECT) * TAPE_HISS_MAX;
}

/** How far ONE wow modulator swings at this amount, in seconds. */
export function tapeWowSeconds(amount: number): number {
  return (clampEffect(amount) / MAX_EFFECT) * (TAPE_WOW_MAX_MS / 1000);
}

/** How far the flutter modulator swings at this amount, in seconds. */
export function tapeFlutterSeconds(amount: number): number {
  return (clampEffect(amount) / MAX_EFFECT) * (TAPE_FLUTTER_MAX_MS / 1000);
}

/** The tape saturation at this amount. `drive`'s sibling, on a gentler bend. */
export function tapeCurve(amount: number): Float32Array<ArrayBuffer> {
  return saturationCurve(amount, TAPE_BEND, TAPE_TRIM);
}

/** How many seconds of hiss one buffer holds, before it loops. */
export const TAPE_HISS_SECONDS = 2;

/**
 * The hiss bed: a few seconds of seeded noise, looped forever.
 *
 * Deterministic on purpose, exactly like the reverb impulse next door in
 * `room.ts`: a seeded xorshift rather than `Math.random`, so a rendered file and
 * a live session hiss the same way and one export can be compared to another.
 *
 * Two seconds and then the loop point, which is a compromise worth naming: a
 * longer buffer is a longer wait before the noise repeats, and this is a bed at
 * −34 dB, so a repetition nobody can pick out at that level is a repetition not
 * worth a megabyte. Every channel on the master's tape shares this one bed, so
 * the hiss is coherent rather than eight uncorrelated machines — which is also
 * what makes it deterministic.
 */
export function tapeHissBuffer(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * TAPE_HISS_SECONDS));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let seed = 0x5eed1a7e;
  for (let i = 0; i < length; i++) {
    // The same three-line xorshift32 `makeImpulse` uses: not cryptography, just
    // the same hiss every time.
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

/**
 * A tape machine: saturation, a transport that wanders, and a hiss bed.
 *
 * The order is the order of the machine rather than of the artifacts. The peaks
 * are rounded FIRST, because that is the electronics and everything after it is
 * downstream of that; the wander comes next, because the transport moves the tape
 * past the head AFTER the signal has been recorded onto it and is therefore the
 * only one of the three that moves a PITCH; and the hiss is added last and outside
 * the wander, because the head's own noise was never modulated by the speed of
 * the tape it was reading. Getting the last one wrong is the difference between a
 * tape and a wobbly hiss, which is what a chain assembled out of `chorus` and
 * `noise` would give you.
 */
function tapeStage(ctx: BaseAudioContext, amount: number): EffectStage {
  const input = ctx.createGain();
  const out = ctx.createGain();

  const sat = ctx.createWaveShaper();
  sat.curve = tapeCurve(amount);
  // Two times oversampling, for the reason `drive` has it: a saturator's
  // character lives in the harmonics it folds back down.
  sat.oversample = '2x';

  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = TAPE_DELAY_MS / 1000;

  /** One sine modulator, wired into the delay time. Its depth is set live. */
  const modulator = (hz: number, seconds: number): { osc: OscillatorNode; depth: GainNode } => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const depth = ctx.createGain();
    depth.gain.value = seconds;
    osc.connect(depth).connect(delay.delayTime);
    osc.start(ctx.currentTime);
    return { osc, depth };
  };
  const wowSlow = modulator(TAPE_WOW_HZ, tapeWowSeconds(amount));
  const wowDrift = modulator(TAPE_WOW_DRIFT_HZ, tapeWowSeconds(amount) * TAPE_WOW_DRIFT_WEIGHT);
  const flutter = modulator(TAPE_FLUTTER_HZ, tapeFlutterSeconds(amount));

  input.connect(sat).connect(delay).connect(out);

  const hiss = ctx.createBufferSource();
  hiss.buffer = tapeHissBuffer(ctx);
  hiss.loop = true;
  const hissGain = ctx.createGain();
  hissGain.gain.value = tapeHissGain(amount);
  hiss.connect(hissGain).connect(out);
  hiss.start(ctx.currentTime);

  return {
    connect: (from) => { from.connect(input); return out; },
    set: (value, at) => {
      sat.curve = tapeCurve(value);
      wowSlow.depth.gain.setTargetAtTime(tapeWowSeconds(value), at, RAMP_S);
      wowDrift.depth.gain.setTargetAtTime(tapeWowSeconds(value) * TAPE_WOW_DRIFT_WEIGHT, at, RAMP_S);
      flutter.depth.gain.setTargetAtTime(tapeFlutterSeconds(value), at, RAMP_S);
      hissGain.gain.setTargetAtTime(tapeHissGain(value), at, RAMP_S);
    },
    // The oscillators and the noise source are in the list so that a caller which
    // unplugs the chain stops the whole machine: a running oscillator or a looping
    // buffer on a chain nobody can hear is a leak, not a sound.
    nodes: [
      input, sat, delay, out,
      wowSlow.osc, wowSlow.depth, wowDrift.osc, wowDrift.depth,
      flutter.osc, flutter.depth, hiss, hissGain,
    ],
  };
}

/** Where the tilt's two shelves turn over, in Hz. */
export const TILT_LOW_HZ = 300;
export const TILT_HIGH_HZ = 3000;
/**
 * How far each end of the tilt leans, in dB.
 *
 * Six, which is enough to make room for a lead under a pad without the channel
 * sounding like a different instrument. A tilt that could go further would be a
 * filter, and the app already has one of those per layer (`bright`).
 *
 * The low end is `flat` rather than the `dark` the plan proposed: a knob that
 * leans both ways has to have its neutral in the middle, and a neutral of 50
 * would mean `0` — the value every old file reads as — was a real filter on every
 * channel in the app. One direction, with off at the bottom, is the version that
 * keeps the rule.
 */
export const TILT_DB = 6;

/** The bass shelf's gain at this amount, in dB. Always 0 or down. */
export function tiltLowGain(amount: number): number {
  return -(clampEffect(amount) / MAX_EFFECT) * TILT_DB;
}

/** The treble shelf's gain at this amount, in dB. Always 0 or up. */
export function tiltHighGain(amount: number): number {
  return (clampEffect(amount) / MAX_EFFECT) * TILT_DB;
}

function tiltStage(ctx: BaseAudioContext, amount: number): EffectStage {
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = TILT_LOW_HZ;
  low.gain.value = tiltLowGain(amount);
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = TILT_HIGH_HZ;
  high.gain.value = tiltHighGain(amount);
  return {
    connect: (from) => { from.connect(low).connect(high); return high; },
    set: (value, at) => {
      low.gain.setTargetAtTime(tiltLowGain(value), at, RAMP_S);
      high.gain.setTargetAtTime(tiltHighGain(value), at, RAMP_S);
    },
    nodes: [low, high],
  };
}

/**
 * The compressor's settings, which do not move with the amount.
 *
 * A ratio of four with a fast attack and a medium release is the shape people
 * mean by "snappy": the front of a note is caught before it can jump out, and the
 * tail is let go again quickly enough that the channel does not pump. Only the
 * threshold slides, and sliding ONE control is what makes this a knob rather than
 * a compressor's front panel.
 */
export const PUNCH_RATIO = 4;
export const PUNCH_KNEE_DB = 6;
export const PUNCH_ATTACK_S = 0.003;
export const PUNCH_RELEASE_S = 0.12;

/**
 * How far down the threshold sits at this amount, in dB.
 *
 * From -2 dB (barely touching anything the engine produces) to -32 dB (holding
 * down most of what a channel plays), which is a useful sweep rather than a
 * theoretical one.
 */
export function punchThreshold(amount: number): number {
  return -(2 + (clampEffect(amount) / MAX_EFFECT) * 30);
}

function punchStage(ctx: BaseAudioContext, amount: number): EffectStage {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = punchThreshold(amount);
  comp.knee.value = PUNCH_KNEE_DB;
  comp.ratio.value = PUNCH_RATIO;
  comp.attack.value = PUNCH_ATTACK_S;
  comp.release.value = PUNCH_RELEASE_S;
  return {
    connect: (from) => { from.connect(comp); return comp; },
    set: (value, at) => { comp.threshold.setTargetAtTime(punchThreshold(value), at, RAMP_S); },
    nodes: [comp],
  };
}

/** The chorus's delay, in milliseconds, at the two ends of the knob. */
export const CHORUS_MIN_MS = 8;
export const CHORUS_MAX_MS = 22;
/** How fast the drifting copy moves, in Hz. Slow enough to hear as drift. */
export const CHORUS_RATE_HZ = 0.6;
/** How far the delay time swings, in milliseconds, at the top of the knob. */
export const CHORUS_DEPTH_MS = 4;
/** How much of the dry signal the wet one replaces, at the top. */
export const CHORUS_WET_MAX = 0.5;

/** The delay time at this amount, in seconds. */
export function chorusDelaySeconds(amount: number): number {
  const t = clampEffect(amount) / MAX_EFFECT;
  return (CHORUS_MIN_MS + t * (CHORUS_MAX_MS - CHORUS_MIN_MS)) / 1000;
}

/** How much of the channel is the drifting copy, at this amount, 0..1. */
export function chorusWet(amount: number): number {
  return (clampEffect(amount) / MAX_EFFECT) * CHORUS_WET_MAX;
}

/** How far the delay time swings, in seconds. */
export function chorusDepthSeconds(amount: number): number {
  return (clampEffect(amount) / MAX_EFFECT) * (CHORUS_DEPTH_MS / 1000);
}

/**
 * A chorus: one delay line, moving.
 *
 * A real chorus is a slightly detuned copy of the signal, and a delay whose
 * length drifts IS that copy — moving the delay time changes the pitch of what
 * comes out of it, which is why one oscillator and one delay is all this needs.
 * The dry signal stays in the mix, because a fully wet chorus is a vibrato, which
 * is a different effect this app already has (`vibrato` on the channel).
 */
function chorusStage(ctx: BaseAudioContext, amount: number): EffectStage {
  const inNode = ctx.createGain();
  const out = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const delay = ctx.createDelay(0.1);
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  dry.gain.value = 1 - chorusWet(amount);
  wet.gain.value = chorusWet(amount);
  delay.delayTime.value = chorusDelaySeconds(amount);
  lfo.type = 'sine';
  lfo.frequency.value = CHORUS_RATE_HZ;
  depth.gain.value = chorusDepthSeconds(amount);
  lfo.connect(depth).connect(delay.delayTime);
  lfo.start(ctx.currentTime);
  inNode.connect(dry).connect(out);
  inNode.connect(delay).connect(wet).connect(out);
  return {
    connect: (from) => { from.connect(inNode); return out; },
    set: (value, at) => {
      dry.gain.setTargetAtTime(1 - chorusWet(value), at, RAMP_S);
      wet.gain.setTargetAtTime(chorusWet(value), at, RAMP_S);
      delay.delayTime.setTargetAtTime(chorusDelaySeconds(value), at, RAMP_S);
      depth.gain.setTargetAtTime(chorusDepthSeconds(value), at, RAMP_S);
    },
    // The oscillator is in the list so that unplugging a chain stops it too: a
    // running LFO on a chain nobody can hear is a leak, not a sound.
    nodes: [inNode, dry, delay, wet, out, lfo, depth],
  };
}

/**
 * A send percentage as a gain, where 100 is exactly 1.
 *
 * The one value that matters here is the top: a channel sending `FULL` multiplies
 * its signal by 1, so it reaches the reverb bus carrying exactly what it carried
 * before sends existed and the tail is bit-for-bit the old one.
 */
function sendGain(amount: number): number {
  const percent = Number.isFinite(amount) ? amount : 100;
  return Math.max(0, Math.min(100, percent)) / 100;
}

/**
 * Place one channel between the speakers, as a pair of gains.
 *
 * The two gains are the near side (always full) and the far side (turned down in
 * proportion to how far away it is), which is why a centred channel comes out at
 * exactly 1 and 1.
 */
export function applyPanGains(left: GainNode, right: GainNode, pan: number, at: number): void {
  const at0 = Math.max(-100, Math.min(100, Number.isFinite(pan) ? pan : 0));
  const far = 1 - Math.abs(at0) / 100;
  left.gain.setTargetAtTime(at0 <= 0 ? 1 : far, at, RAMP_S);
  right.gain.setTargetAtTime(at0 >= 0 ? 1 : far, at, RAMP_S);
}
