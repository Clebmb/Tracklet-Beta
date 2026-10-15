/**
 * pluginVoice — seating a plugin instrument into the two clocks.
 *
 * The live engine (`engine.ts`) and the offline renderer (`render.ts`) both
 * play songs, and both must answer the same three questions about a channel
 * that names a plugin: WHICH code plays it (resolved once, like the sample
 * bank — a name with no module behind it is the fallback, never a failure),
 * WHAT event the note is (pitch, force, step, hold, seed), and HOW its samples
 * reach the graph (a buffer source into the channel's own input, so level,
 * pan, sends, effects and duck all treat it exactly like a built-in voice).
 *
 * Everything here is pure except `renderPluginBuffer`, which needs a context
 * to hold the samples — and even that function does no DSP of its own: the
 * plugin's `renderNote` is the only arithmetic, called identically on both
 * clocks, which is the whole of the live == export bargain.
 */

import {
  defaultPluginParams,
  pluginNoteSeed,
  renderOutBuses,
  resolvePluginVoice,
  type InstrumentPlugin,
  type PluginNoteEvent,
  type PluginParamValues,
} from '../plugins/instrument';
import {
  cpuStats,
  createCpuRecord,
  recordCpu,
  resetCpu,
  type PluginCpuStats,
} from '../plugins/meter';
import { applyTrackFx, type ResolvedTrackFx } from './pluginFx';
import { pluginLatencySec, type TrackletPluginManifest } from '../plugins/manifest';

/**
 * Every instrument render's cost, filed by plugin id.
 *
 * One record for both clocks, because both clocks render the same notes: live
 * and export file into the same totals, and the browser reads the sum. It is
 * cumulative since the app started — an average over one note is noise and an
 * average over a song is a measurement — so a test resets it around itself.
 */
const cpuRecord = createCpuRecord();

/** Now in milliseconds, wherever a clock exists. */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/** The measured cost of every plugin so far, busiest first — what the browser reads. */
export function pluginCpuStats(): PluginCpuStats[] {
  return cpuStats(cpuRecord);
}

/** Forget every measured cost, for a test. */
export function resetPluginCpu(): void {
  resetCpu(cpuRecord);
}

/** The plugin behind one channel's reference, or null (fallback). */
export function pluginForTrack(
  id: string | null,
  plugins: readonly InstrumentPlugin[],
): InstrumentPlugin | null {
  if (id === null) return null;
  const resolved = resolvePluginVoice(`plugin:${id}`, plugins.map((plugin) => ({ id: plugin.manifest.id, enabled: true })));
  if (resolved.kind !== 'plugin') return null;
  return plugins.find((plugin) => plugin.manifest.id === resolved.id) ?? null;
}

/**
 * One plugin per channel, index-aligned with the song's tracks — resolved once
 * per song rather than once per note, the way `setSamples` resolves the sample
 * bank. A channel that names none, or names one the library does not hold, is
 * null: the fallback, never a failure.
 */
export function resolveTrackPlugins(
  ids: readonly (string | null)[],
  plugins: readonly InstrumentPlugin[],
): (InstrumentPlugin | null)[] {
  return ids.map((id) => pluginForTrack(id, plugins));
}

/**
 * The event a note is, for the plugin: pitch and force from the hit, step and
 * hold from the scheduler, seed folded from all three so the stream is stable
 * per occurrence and never repeated across a part.
 */
export function pluginEventFor(
  track: number,
  step: number | null,
  midi: number,
  velocity: number,
  holdSteps: number,
): PluginNoteEvent {
  return {
    midi,
    velocity: Math.min(100, Math.max(0, Math.round(velocity))),
    startStep: step ?? 0,
    holdSteps: Math.max(1, Math.round(holdSteps)),
    seed: pluginNoteSeed(track, step, midi),
  };
}

/**
 * When a note's source must start so its transient lands on `at`.
 *
 * A latent plugin's samples start with silence-or-smear the host did not
 * write, so the source starts early by the manifest's claim — pure, so both
 * clocks and the tests share it. Clamped at 0: a note earlier than its own
 * latency (the downbeat of a latent plugin) starts at the downbeat rather
 * than before the song, a few milliseconds early and documented.
 */
export function compensatedStartAt(at: number, manifest: Pick<TrackletPluginManifest, 'latencyMs'>): number {
  return Math.max(0, at - pluginLatencySec(manifest));
}

/**
 * A plugin's samples as a buffer source starting at `at`, NOT yet connected:
 * the caller wires source → envelope → destination, so the channel's stealing
 * and release machinery fades a plugin note exactly like a built-in one. Both
 * clocks share these lines, so live and export cannot disagree about how a
 * render reaches the graph. An empty render is null rather than a silent node
 * — there is nothing to steal or release.
 */
export function renderPluginBuffer(
  ctx: BaseAudioContext,
  plugin: InstrumentPlugin,
  note: PluginNoteEvent,
  sampleRate: number,
  at: number,
  values?: PluginParamValues,
  fx: readonly ResolvedTrackFx[] = [],
  onlyBus?: number,
): AudioBufferSourceNode | null {
  // Timed in a `finally`, so a render that throws still files what it cost:
  // a throwing plugin is still a plugin the song paid for. The cost filed is
  // the instrument's own `renderNote` plus delivery — the insert chain's
  // `processBlock` time is not split out, so an effected channel reads as its
  // instrument, chain included.
  const start = nowMs();
  try {
    const rendered = plugin.renderNote(values ?? defaultPluginParams(plugin.manifest), note, sampleRate);
    // One buffer per out bus, bus 0 the main: a mono render is one bus, so
    // the old single-channel path falls out unchanged. Each bus runs the
    // insert chain on its own — an effected multi-out channel reads as one
    // instrument per bus, the G7 bargain per bus rather than per channel.
    // Short buses pad with silence (channel data starts zeroed); an empty
    // MAIN is an empty render, the fallback the host has always honoured.
    const buses = renderOutBuses(rendered);
    if (buses.length === 0 || buses[0]!.length === 0) return null;
    const effected = fx.length === 0 ? buses : buses.map((bus) => applyTrackFx(bus, fx, sampleRate));
    if (effected[0]!.length === 0) return null;
    // Isolating one bus for a per-out stem: the single bus as a mono buffer,
    // or null when the render has no such bus. Null here is SILENCE, never
    // fallback — the caller renders a stem, and a missing bus is an empty
    // file, not a channel that quietly becomes its built-in voice.
    if (onlyBus !== undefined) {
      const bus = effected[onlyBus];
      if (bus === undefined || bus.length === 0) return null;
      const single = ctx.createBuffer(1, bus.length, sampleRate);
      single.getChannelData(0).set(bus);
      const isolated = ctx.createBufferSource();
      isolated.buffer = single;
      isolated.start(compensatedStartAt(at, plugin.manifest));
      return isolated;
    }
    const length = Math.max(...effected.map((bus) => bus.length));
    const buffer = ctx.createBuffer(effected.length, length, sampleRate);
    effected.forEach((bus, index) => {
      buffer.getChannelData(index).set(bus);
    });
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // Latency-compensated inside, so both clocks honour the claim without
    // knowing it: the transient lands on the grid the note was written on.
    source.start(compensatedStartAt(at, plugin.manifest));
    return source;
  } finally {
    recordCpu(cpuRecord, plugin.manifest.id, nowMs() - start);
  }
}
