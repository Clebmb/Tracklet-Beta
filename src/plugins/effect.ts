/**
 * plugins/effect — what an effect plugin IS, before it touches a note.
 *
 * The deep design decision first, because it shapes everything below: a
 * Tracklet effect processes NOTE BUFFERS, not streams. The live engine cannot
 * call JavaScript per sample-block without an AudioWorklet (a second module,
 * a second clock, a second chance to disagree with the export), so effects run
 * where instruments already do — at schedule time, on the note's own samples:
 * render (or synthesize) the note, process the buffer, play the result through
 * a source. Both clocks share the one function, so live and export cannot
 * disagree, and the 120 ms lookahead is the only latency there is.
 *
 * The contract is therefore one pure function:
 *
 *   processBlock(input, params, sampleRate) -> Float32Array
 *
 * Stateless per note, by rule rather than by hope: no delay memory may cross
 * from one note into the next (a dub feedback tail lives INSIDE the returned
 * buffer, which may be longer than the input), so previews, steals, and stems
 * all process the same bytes. `amount` is the host's wet/dry, 0–100 with 0
 * meaning OFF — the same convention as the ten built-in effects, and the
 * channel's own input is the dry path the host mixes back.
 *
 * Seating an effect onto a channel — the `fx` script word, the song-file rung,
 * the chain insertion on both clocks — is the NEXT generation. What lands here
 * is the reference a channel will hold, the contract, and the first proof.
 */

import type { PluginParamValues } from './instrument';
import type { TrackletPluginManifest } from './manifest';

/**
 * An effect plugin: its manifest plus the one pure block processor.
 *
 * `processBlock` takes the note's mono samples and returns the WET signal
 * (same length, or longer when the effect has a tail — never shorter, never
 * empty-in-means-empty-out). Deterministic, finite-valued, roughly ±1: the
 * same three promises an instrument makes, because the same two clocks keep
 * them.
 */
export interface EffectPlugin {
  manifest: TrackletPluginManifest;
  processBlock(input: Float32Array, params: PluginParamValues, sampleRate: number): Float32Array;
}

/**
 * Wet over dry: the host's mix for every effect, in the song's own 0–100.
 * 0 is OFF (the channel plays dry, and the effect costs nothing), 100 is fully
 * wet — the same bargain the built-in effects make, so `fx <id> 45` reads like
 * `drive 45` to anyone who learned the mixer first.
 */
export function effectMix(amount: number, dry: Float32Array, wet: Float32Array): Float32Array {
  const mix = Math.min(100, Math.max(0, amount)) / 100;
  const length = Math.max(dry.length, wet.length);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const drySample = i < dry.length ? dry[i]! : 0;
    const wetSample = i < wet.length ? wet[i]! : 0;
    out[i] = drySample * (1 - mix) + wetSample * mix;
  }
  return out;
}
