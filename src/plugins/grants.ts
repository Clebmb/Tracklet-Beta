/**
 * plugins/grants — what this machine allowed each plugin, remembered.
 *
 * G24 declared the ask (`permissions` on the manifest, named by the browser);
 * this is the answer. A grant is a per-plugin, per-permission decision by the
 * person in front of the machine: `network` and `storage` start denied and
 * stay that way until granted, one word at a time, and a denial takes one
 * word back. The map is sparse — an id with nothing granted is absent, not
 * empty — and uninstalling forgets the id beside the manifest and the source.
 *
 * Two halves, the registry's bargain: this file is the IN-MEMORY decisions
 * (grant, deny, forget, read), and `src/pluginLibrary.ts` is the persistence
 * bridge to one `localStorage` key. Nothing here touches storage, the engine
 * or the DOM, so it is unit tested with plain objects.
 *
 * Enforcement is the host's future, not this file's present: these are the
 * decisions the grant screen keeps and the host will check. Recording an
 * answer the host does not yet check is still worth doing — the alternative
 * is asking the person twice.
 */

import { isPluginPermission, type PluginPermission, type TrackletPluginManifest } from './manifest';

/**
 * What this machine granted, by plugin id. Sparse: only ids with at least
 * one granted word appear. Never hand-edited by callers — read through
 * `parsePluginGrants`, written through the library bridge.
 */
export type PluginGrants = Record<string, PluginPermission[]>;

/** No decisions yet: every ask pending, nothing granted. */
export function createGrants(): PluginGrants {
  return {};
}

/**
 * What this machine granted one plugin: the stored words, or none.
 *
 * Defensive past the types, because grants also arrive hand-built in code:
 * a misshapen row reads as none, never as a grant. Granting nothing by
 * default is the whole trust model — a read must never invent permission.
 */
export function grantedPermissions(grants: PluginGrants, id: string): PluginPermission[] {
  const kept: unknown = (grants as Record<string, unknown>)[id];
  if (!Array.isArray(kept)) return [];
  return kept.filter(isPluginPermission);
}

/**
 * Allow one permission: a copy with the word granted.
 *
 * A word no host grants changes nothing — the closed list is the whole set,
 * so a typo grants silence rather than something unasked-for. Granting twice
 * is a no-op copy: the decision stands, said once.
 */
export function grantPermission(grants: PluginGrants, id: string, permission: string): PluginGrants {
  if (!isPluginPermission(permission)) return { ...grants };
  const kept = grantedPermissions(grants, id);
  if (kept.includes(permission)) return { ...grants };
  return { ...grants, [id]: [...kept, permission] };
}

/**
 * Take one permission back: a copy without the word.
 *
 * The last denial forgets the id, keeping the map sparse — absent and empty
 * mean the same thing (nothing granted), and absent is cheaper to read.
 * Denying what was never granted, or for an unknown id, is a no-op copy.
 */
export function denyPermission(grants: PluginGrants, id: string, permission: string): PluginGrants {
  if (!(id in grants)) return { ...grants };
  const kept = grantedPermissions(grants, id).filter((name) => name !== permission);
  const next = { ...grants };
  if (kept.length === 0) {
    delete next[id];
  } else {
    next[id] = kept;
  }
  return next;
}

/**
 * Forget one plugin, e.g. beside an uninstall: its decisions leave with its
 * manifest and its source, so a reinstall asks again. Unknown ids are a no-op.
 */
export function forgetPluginGrants(grants: PluginGrants, id: string): PluginGrants {
  if (!(id in grants)) return { ...grants };
  const next = { ...grants };
  delete next[id];
  return next;
}

/**
 * What one plugin asked that this machine has not granted: the manifest's
 * declaration minus the stored decisions, in manifest order.
 *
 * Empty is "nothing to decide" — either it asked for nothing, or everything
 * it asked stands granted. The grant screen lists exactly this: pending is
 * the screen's to-do list, not a refusal.
 */
export function pendingPermissions(manifest: TrackletPluginManifest, grants: PluginGrants): PluginPermission[] {
  const granted = grantedPermissions(grants, manifest.id);
  return (manifest.permissions ?? []).filter((name) => !granted.includes(name));
}

/**
 * Read stored grants out of untrusted storage, and drop anything wrong.
 *
 * Lenient on purpose (the `parsePluginManifests` pattern): storage is
 * shared, hand-editable, and outlives the build that wrote it, so a stale
 * word, a doubled word, or a misshapen row costs itself — never the
 * decisions beside it. An id left with nothing keepable is absent, keeping
 * the sparse promise the writers make.
 */
export function parsePluginGrants(raw: unknown): PluginGrants {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const grants: PluginGrants = {};
  for (const [id, names] of Object.entries(raw)) {
    if (id === '' || !Array.isArray(names)) continue;
    const kept = [...new Set(names.filter(isPluginPermission))];
    if (kept.length > 0) grants[id] = kept;
  }
  return grants;
}
