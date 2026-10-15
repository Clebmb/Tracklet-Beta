/**
 * hello-panel — the smallest plugin that loads.
 *
 * M0 wiring only: it declares one param, logs one line through the host, and
 * unloads without breaking playback. It makes no sound (instruments arrive in
 * M1) and touches no DOM outside its own panel element (panels arrive in M4).
 * Copy this folder as the starting point for any kind — the manifest's `kind`
 * is the only line that changes.
 *
 * Structural types below mirror `src/plugins/host.ts` so this example stays
 * self-contained; the real import becomes available with the M2 SDK.
 */

interface PluginHost {
  apiVersion: number;
  random(): number;
  log(message: string): void;
}

export function activate(host: PluginHost): () => void {
  host.log(`hello-panel active on host API ${host.apiVersion}.`);
  return () => {
    host.log('hello-panel inactive. Playback is untouched.');
  };
}
