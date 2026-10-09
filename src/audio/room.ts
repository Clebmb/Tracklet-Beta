/**
 * room — the three things that happen to the WHOLE band at once.
 *
 * Per-note synthesis lives in `synth.ts`; this is the other end of the graph:
 * the channels come in on three buses (dry, reverb, echo) and one signal goes out
 * (what goes to the master fader). Between them sit the three effects that a song
 * asks for as single numbers:
 *
 *   REVERB   a real convolution tail, off by default
 *   ECHO     a delay locked to the song's BEAT, not to a number of milliseconds
 *   LIMITER  a ceiling that only exists because the first two can add level
 *
 * Each of the first two has an input of its own, because both are SENDS: every
 * channel decides how much of itself it puts into the room (`Track.verb`) and
 * how much into the echo (`Track.echo`), and this file owns the buses they feed.
 *
 * ── The one thing that must not change ───────────────────────────────────────
 * Every song written before this file existed has `reverb 0` and `echo 0`, and a
 * room at zero is a room that is not there: the dry path is a gain of 1 and the
 * two send gains are 0, so what comes out is what went in. That is what makes
 * `reverb` and `echo` safe to add to a language whose files are already written.
 *
 * The limiter is the honest exception, and it is worth being precise about: a
 * song that used to CLIP (more than eight loud channels at once, or a wet room
 * on top of them) is now held at -1 dBFS instead. Below that ceiling nothing is
 * touched at all — the compressor's knee is zero, so it is bit-transparent until
 * the signal would have clipped, which is a change to a bug rather than to the
 * music. Chrome's limiter also adds about 6 ms of lookahead, invisible next to
 * the sequencer's 120 ms of scheduling headroom.
 *
 * ── Why the echo is measured in beats ────────────────────────────────────────
 * A delay in milliseconds stops agreeing with the song the moment the tempo
 * moves, and half of what this app does is move the tempo. So the echo's time is
 * `60 / bpm` — one beat — and `setTempo` re-syncs it, which is why the engine
 * forwards its tempo here rather than keeping two clocks.
 */

/** How long the reverb tail lasts, in seconds. A stone hall, not a cathedral. */
const REVERB_SECONDS = 2.6;
/** The most the reverb send can add, as a gain. `reverb 100` is fully soaked. */
const REVERB_WET_MAX = 0.55;
/** The most the echo send can add. */
const ECHO_WET_MAX = 0.45;
/**
 * How much of each echo repeat comes back around.
 *
 * A fixed amount rather than a knob: the number of repeats a person wants is a
 * property of the room they are imagining, and one more percentage on a screen
 * would buy a decision nobody wants to make. It is deep enough to hear three
 * repeats and shallow enough that they never build up.
 */
const ECHO_FEEDBACK = 0.34;
/** The ceiling the limiter holds, in dBFS. Just under full scale. */
const LIMITER_THRESHOLD_DB = -1;

export interface Room {
  /** Where the channels' dry signal goes in. */
  input: GainNode;
  /**
   * The reverb's own input, which each channel feeds through its `verb` send.
   *
   * A separate bus rather than a tap off `input`, because a send is per CHANNEL:
   * if the two shared one node, a channel could only be in the room to the extent
   * every other channel was. Everything that arrives here has already been
   * multiplied by that channel's send, so this node itself is a plain pass-through
   * — and a channel sending 100 through a gain of 1 is the signal that used to
   * arrive here directly, which is what keeps `reverb 40` sounding the same.
   */
  reverbInput: GainNode;
  /** The echo's own input, fed by each channel's `echo` send. */
  echoInput: GainNode;
  /** Where the finished signal comes out, ready for the master fader. */
  output: AudioNode;
  /**
   * Set both sends at once, 0..100 each.
   *
   * `immediate` is for an OFFLINE render, where there is no "later": a ramp that
   * takes 30 ms to arrive would spend the first part of an exported file fading
   * the room in, and an export should sound like the song, not like the song
   * being switched on. Live playback ramps, because there it is a person turning
   * a knob and a step change clicks.
   */
  setRoom(reverb: number, echo: number, immediate?: boolean): void;
  /** Set the reverb send, 0..100. */
  setReverb(amount: number): void;
  /** Set the echo send, 0..100. */
  setEcho(amount: number): void;
  /** Re-sync the echo to a new tempo. Immediate for the same reason as `setRoom`. */
  setTempo(bpm: number, immediate?: boolean): void;
  /**
   * Re-sync the echo to a new tempo at a time on the audio clock.
   *
   * What a tempo MAP needs: a song that slows down over four bars changes tempo
   * a step at a time, and live the engine can call `setTempo` as it reaches each
   * one. An offline render cannot — it schedules the whole song up front, when
   * `currentTime` is still zero — so it needs to say WHEN each change happens.
   */
  setTempoAt(bpm: number, when: number): void;
  dispose(): void;
}

/**
 * Build the master room on a context.
 *
 * Takes a `BaseAudioContext` rather than an `AudioContext` so that the offline
 * renderer gets the identical room — an exported file should sound like the app,
 * and the surest way is for it to be literally the same code.
 */
export function buildRoom(ctx: BaseAudioContext): Room {
  const input = ctx.createGain();
  input.gain.value = 1;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMITER_THRESHOLD_DB;
  limiter.knee.value = 0;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;

  // The dry path: always open. A room that is not being used is not a room.
  const dry = ctx.createGain();
  dry.gain.value = 1;
  input.connect(dry).connect(limiter);

  // Reverb: a real tail, made once from noise. The impulse is generated rather
  // than fetched so the app stays a single file with no assets, and so an
  // offline render can make its own identical tail.
  const reverbInput = ctx.createGain();
  reverbInput.gain.value = 1;
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, REVERB_SECONDS);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0;
  reverbInput.connect(convolver).connect(reverbGain).connect(limiter);

  // Echo: one repeat a beat, fed back on itself, with its own input.
  const echoInput = ctx.createGain();
  echoInput.gain.value = 1;
  const delay = ctx.createDelay(4);
  delay.delayTime.value = 0.5;
  const feedback = ctx.createGain();
  feedback.gain.value = ECHO_FEEDBACK;
  const echoGain = ctx.createGain();
  echoGain.gain.value = 0;
  echoInput.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(echoGain).connect(limiter);

  const setWet = (node: GainNode, amount: number, max: number, immediate: boolean): void => {
    const want = Math.max(0, Math.min(100, amount)) / 100;
    // A short ramp rather than a jump: a step change in gain is a click, and
    // these are the two controls most likely to be dragged while a song plays.
    if (immediate) node.gain.setValueAtTime(want * max, ctx.currentTime);
    else node.gain.setTargetAtTime(want * max, ctx.currentTime, 0.03);
  };
  const setEchoTime = (bpm: number, immediate: boolean): void => {
    const beat = beatSeconds(bpm);
    if (immediate) delay.delayTime.setValueAtTime(beat, ctx.currentTime);
    else delay.delayTime.setTargetAtTime(beat, ctx.currentTime, 0.05);
  };

  return {
    input,
    reverbInput,
    echoInput,
    output: limiter,
    setRoom: (reverb, echo, immediate = false) => {
      setWet(reverbGain, reverb, REVERB_WET_MAX, immediate);
      setWet(echoGain, echo, ECHO_WET_MAX, immediate);
    },
    setReverb: (amount) => setWet(reverbGain, amount, REVERB_WET_MAX, false),
    setEcho: (amount) => setWet(echoGain, amount, ECHO_WET_MAX, false),
    setTempo: (bpm, immediate = false) => setEchoTime(bpm, immediate),
    // A ramp, never a jump: the delay line is full of sound, and stepping its
    // length is a click where leaning it is the tape-speed bend a slowing song
    // wants. Same 50 ms the live one takes.
    setTempoAt: (bpm, when) => delay.delayTime.setTargetAtTime(beatSeconds(bpm), when, 0.05),
    dispose: () => {
      for (const node of [input, dry, reverbInput, convolver, reverbGain, echoInput, delay, feedback, echoGain, limiter]) {
        try { node.disconnect(); } catch { /* already detached */ }
      }
    },
  };
}

/**
 * One beat in seconds at a tempo, clamped to the delay line the room has.
 *
 * The echo is defined in BEATS so it stays in the groove at any tempo, which is
 * exactly why it has to be re-synced when the tempo moves — see `setTempo`.
 */
function beatSeconds(bpm: number): number {
  return Math.min(4, 60 / Math.max(1, bpm));
}

/**
 * A reverb impulse: noise with an exponential decay, one buffer per side.
 *
 * Two slightly different channels, because a tail that is identical in both ears
 * is a tail that sounds like it is inside your head. The decay is a power curve
 * rather than a straight line — real rooms lose their top end first, and the
 * high frequencies are exactly what a straight line keeps.
 *
 * Deterministic on purpose: a seeded generator rather than `Math.random`, so a
 * rendered file and a live session get the same room. It costs three lines and
 * it means an export can be compared to another export.
 */
function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  let seed = 0x9e3779b9;
  const next = (): number => {
    // A tiny xorshift32: not cryptography, just the same tail every time.
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return (seed / 0xffffffff) * 2 - 1;
  };
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = next() * Math.pow(1 - t, 3.2);
    }
  }
  return buffer;
}
