/**
 * plugins/meter — what each plugin costs, as numbers.
 *
 * A plugin that sounds different on export is broken (the ground rule), and a
 * plugin that eats the scheduler is broken in a quieter way: notes that render
 * slower than the look-ahead arrive late, and nothing in the sound says which
 * code was slow. So every `renderNote` — and every effect `processBlock` run
 * through it — is timed where it runs (`audio/pluginVoice.ts`), and the totals
 * land here: renders, average milliseconds per render, and the worst one.
 *
 * The record is cumulative since the app started (or the last reset), because
 * an average over one note is noise and an average over a song is a measurement.
 * Nothing here touches audio, the DOM or a clock: the caller times with its own
 * (`performance.now()` in the app) and hands over milliseconds, so this module
 * is pure arithmetic a test can drive with made-up numbers.
 *
 * The budget is a DISPLAY threshold, not a glitch guarantee: past it, the
 * browser row says OVER, and the person reading it decides whether the sound
 * is worth the cost. Automatic bypass would change the music without asking,
 * which is exactly the kind of decision this app leaves to a person.
 */

/** The per-plugin totals: how many renders, how long they took, the worst one. */
export interface PluginCpuTotals {
  renders: number;
  totalMs: number;
  maxMs: number;
}

/** A fresh record: no renders, no cost, nothing over budget. */
export function createCpuRecord(): Record<string, PluginCpuTotals> {
  return {};
}

/** Forget every total, for a test — and for the dev hook's reset. */
export function resetCpu(record: Record<string, PluginCpuTotals>): void {
  for (const id of Object.keys(record)) delete record[id];
}

/**
 * File one render's cost against its plugin id.
 *
 * A cost that is not a finite number is not a measurement, so it is dropped
 * rather than recorded; a negative one (a clock that went backwards) is filed
 * as zero. Never throws, so timing can never break a render.
 */
export function recordCpu(record: Record<string, PluginCpuTotals>, id: string, ms: number): void {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return;
  const cost = Math.max(0, ms);
  const totals = record[id] ?? (record[id] = { renders: 0, totalMs: 0, maxMs: 0 });
  totals.renders += 1;
  totals.totalMs += cost;
  totals.maxMs = Math.max(totals.maxMs, cost);
}

/**
 * The average cost of one note render past which a row says OVER.
 *
 * Sixteen milliseconds: about one frame of DSP per note on average. The live
 * engine schedules 120ms ahead, so one slow note is absorbed — but a plugin
 * that averages a frame per note starts eating that look-ahead on dense parts,
 * chords of them faster still. A heuristic for a person to read, not a line
 * the engine enforces: nothing here mutes, bypasses or refuses.
 */
export const PLUGIN_CPU_BUDGET_AVG_MS = 16;

/** One plugin's cost as a browser row reads it. */
export interface PluginCpuStats {
  id: string;
  renders: number;
  /** Mean milliseconds per render, to one decimal. Zero renders is zero. */
  avgMs: number;
  /** The worst single render, to one decimal. */
  maxMs: number;
  /** Whether the average is past the budget. */
  overBudget: boolean;
}

/** Round to one decimal, so a row says `0.4ms` rather than `0.42312ms`. */
export function roundCpuMs(ms: number): number {
  return Math.round(ms * 10) / 10;
}

/** Every measured plugin, busiest first — the browser reads this, not the record. */
export function cpuStats(record: Record<string, PluginCpuTotals>): PluginCpuStats[] {
  return Object.entries(record)
    .filter((entry): entry is [string, PluginCpuTotals] => entry[1] !== undefined && entry[1].renders > 0)
    .sort(([, a], [, b]) => b.totalMs - a.totalMs)
    .map(([id, totals]) => {
      const avgMs = roundCpuMs(totals.totalMs / totals.renders);
      return {
        id,
        renders: totals.renders,
        avgMs,
        maxMs: roundCpuMs(totals.maxMs),
        overBudget: avgMs > PLUGIN_CPU_BUDGET_AVG_MS,
      };
    });
}
