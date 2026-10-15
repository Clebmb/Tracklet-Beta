/**
 * plugins/uninstall — forgetting a plugin everywhere, through one door.
 *
 * An installed plugin leaves traces on five shelves: the registry entry
 * (what songs pin), the remembered code (what re-seats), the recorded
 * origin (where it came from), the grant answers (what was allowed), and
 * the weighed fingerprint (what it weighed). The handbook promises they
 * are forgotten together — and five separate forget calls at five call
 * sites is how one shelf gets left behind. So there is one function that
 * drops the id from all five, and the future uninstall screen calls it
 * instead of remembering the list.
 *
 * Pure decisions, the registry's bargain: this file takes the stored state
 * as plain values and answers with the next ones. Persisting them (one
 * `localStorage` key per shelf in `src/pluginLibrary.ts`) stays the
 * caller's business, so it is unit tested with plain objects and no DOM.
 */

import { forgetPluginGrants, type PluginGrants } from './grants';
import { unregisterPlugin, type RegistryEntry } from './registry';

/** Everything one install remembers, as plain values off the shelves. */
export interface PluginStoredState {
  /** What songs pin and the dropdown lists. */
  registry: readonly RegistryEntry[];
  /** What the boot re-seat runs. */
  code: Record<string, string>;
  /** Where each install came from. */
  sources: Record<string, string>;
  /** What this machine allowed. */
  grants: PluginGrants;
  /** What each installed module weighed. */
  fingerprints: Record<string, string>;
}

/** Nothing remembered anywhere: the uninstall of an empty machine. */
export function createPluginStoredState(): PluginStoredState {
  return { registry: [], code: {}, sources: {}, grants: {}, fingerprints: {} };
}

/**
 * Forget one plugin everywhere: the registry entry, the code, the origin,
 * the answers, and the weight — copies throughout, so the input still
 * describes the machine that was.
 *
 * Forgetting is total on purpose: a reinstall asks everything again (origin,
 * grants) and weighs everything again, so a decision made for one copy of
 * a plugin never silently covers its replacement. An unknown id returns
 * copies unchanged — forgetting what was never installed is not an error,
 * it is nothing to do.
 */
export function uninstallPluginEverywhere(state: PluginStoredState, id: string): PluginStoredState {
  const code = { ...state.code };
  delete code[id];
  const sources = { ...state.sources };
  delete sources[id];
  const fingerprints = { ...state.fingerprints };
  delete fingerprints[id];
  return {
    registry: unregisterPlugin(state.registry, id),
    code,
    sources,
    grants: forgetPluginGrants(state.grants, id),
    fingerprints,
  };
}
