/**
 * pluginBoard — the plugin browser's decisions, as arithmetic.
 *
 * The browser itself will be a Phaser view (beside the F6 instrument browser),
 * and a view cannot be unit tested here — a canvas is not part of a headless
 * runner. But a browser is mostly DECISIONS — which rows exist, where the
 * selection can go, what toggling the selected row does, what each row says —
 * and those are worth pinning down. So they live here, Phaser-free, the way
 * `mixerBoard.ts` holds the mixer's decisions beside `MixerView`.
 *
 * The rules, one each:
 *
 *   • WHICH ROWS there are — one per registered plugin, in registration order.
 *     An empty registry draws no rows and says `NO PLUGINS INSTALLED`, with
 *     the one line that installs the hello-panel starter. A browser that
 *     padded itself with built-ins would be listing sounds the song cannot
 *     pin — built-ins are not plugins and are browsed in F6.
 *
 *   • WHERE the selection can be — an index into the rows, clamped, with
 *     up/down moves that stop at the walls rather than wrapping. A selection
 *     that wrapped would land on a plugin the hand did not mean.
 *
 *   • WHAT toggling does — flipping the selected row's enabled flag through
 *     the registry's own `enablePlugin`/`disablePlugin`, so the view never
 *     reimplements the switch. Disabling keeps the song references (the
 *     registry's bargain); the row says so.
 *
 *   • WHAT the row still needs — each row carries its pending permissions
 *     (the manifest's ask minus this machine's answers), the detail line
 *     reads `needs` for the pending half and `allows` for the granted half,
 *     and toggling a word flips exactly that word's grant through the
 *     grants module. Grants start denied and persist beside the library,
 *     never in the song.
 *
 * Nothing here reads storage, touches the engine or draws anything: it takes
 * the registry it needs and answers with the next one.
 */

import {
  denyPermission,
  grantedPermissions,
  grantPermission,
  pendingPermissions,
  type PluginGrants,
} from '../plugins/grants';
import { isPluginPermission, type PluginKind, type PluginPermission, type TrackletPluginManifest } from '../plugins/manifest';
import type { PluginCpuStats } from '../plugins/meter';
import {
  disablePlugin,
  enablePlugin,
  pluginFromId,
  type RegistryEntry,
} from '../plugins/registry';

/** One browser row: what the view draws, nothing it draws with. */
export interface PluginRow {
  id: string;
  name: string;
  kind: PluginKind;
  version: string;
  enabled: boolean;
  /** What the plugin asked that this machine has not granted: the row's own to-do. */
  pending: PluginPermission[];
  /** Mean milliseconds per render, or null where nothing rendered yet. */
  avgMs: number | null;
  /** Whether the average is past the CPU budget. */
  overBudget: boolean;
}

/**
 * The rows of the browser, in registration order.
 *
 * The meter is a second argument rather than a registry field because the two
 * live in different places: the registry is what is installed, the meter is
 * what has RENDERED. A plugin with no stats has rendered nothing, so its row
 * carries null — the same "no entry plays defaults" rule the engine reads by.
 */
export function pluginRows(
  registry: readonly RegistryEntry[],
  stats: readonly PluginCpuStats[] = [],
  grants: PluginGrants = {},
): PluginRow[] {
  const byId = new Map(stats.map((entry) => [entry.id, entry]));
  return registry.map((entry) => {
    const measured = byId.get(entry.manifest.id);
    return {
      id: entry.manifest.id,
      name: entry.manifest.name,
      kind: entry.manifest.kind,
      version: entry.manifest.version,
      enabled: entry.enabled,
      pending: pendingPermissions(entry.manifest, grants),
      avgMs: measured?.avgMs ?? null,
      overBudget: measured?.overBudget ?? false,
    };
  });
}

/** What the browser says when there is nothing to list. */
export function emptyPluginText(): string {
  return 'NO PLUGINS INSTALLED - copy examples/plugins/hello-panel/ to begin.';
}

/**
 * Where the selection may point: clamped into the rows, or 0 when there are
 * none (a view with no rows draws the empty text and moves nowhere).
 */
export function clampPluginSelection(selection: number, rowCount: number): number {
  if (rowCount <= 0) return 0;
  if (!Number.isInteger(selection)) return 0;
  return Math.min(Math.max(selection, 0), rowCount - 1);
}

/** One step up (−1) or down (+1), stopping at the walls. */
export function movePluginSelection(selection: number, rowCount: number, direction: -1 | 1): number {
  return clampPluginSelection(selection + direction, rowCount);
}

/**
 * The registry with the selected row's switch flipped.
 *
 * Out-of-range selections leave the registry unchanged — a key pressed with
 * no rows (or a stale index after an uninstall) is not an error, it is
 * nothing to do.
 */
export function togglePluginAt(registry: readonly RegistryEntry[], selection: number): RegistryEntry[] {
  const rows = pluginRows(registry);
  if (selection < 0 || selection >= rows.length) return [...registry];
  const row = rows[selection];
  return row.enabled ? disablePlugin(registry, row.id) : enablePlugin(registry, row.id);
}

/**
 * Flip one permission word for the selected row: grant what is pending, take
 * back what stands granted.
 *
 * Out-of-range selections and words no host grants leave the grants
 * unchanged — a key pressed with no rows (or a stale index after an
 * uninstall) is not an error, it is nothing to do. The caller persists what
 * comes back; a grants map the store forgot still decides for the session.
 */
export function toggleGrantAt(
  registry: readonly RegistryEntry[],
  grants: PluginGrants,
  selection: number,
  permission: string,
): PluginGrants {
  if (!isPluginPermission(permission)) return { ...grants };
  const rows = pluginRows(registry, [], grants);
  if (selection < 0 || selection >= rows.length) return { ...grants };
  const row = rows[selection];
  if (row === undefined) return { ...grants };
  if (row.pending.includes(permission)) return grantPermission(grants, row.id, permission);
  if (grantedPermissions(grants, row.id).includes(permission)) return denyPermission(grants, row.id, permission);
  return { ...grants };
}

/**
 * What one allow-key press answers: the selected row's first pending word.
 *
 * One word per press in manifest order, so a plugin asking for two is two
 * presses with the detail line saying what each one did. A stale selection
 * or a row with nothing pending is null — the key does nothing, loudly
 * nowhere. Applying stays the caller's job (answer, persist, repaint).
 */
export function nextGrantAt(
  registry: readonly RegistryEntry[],
  grants: PluginGrants,
  selection: number,
): { id: string; permission: PluginPermission } | null {
  const rows = pluginRows(registry, [], grants);
  const row = rows[selection];
  if (row === undefined) return null;
  const first = row.pending[0];
  return first === undefined ? null : { id: row.id, permission: first };
}

/**
 * What one deny-key press takes back: the selected row's first granted word
 * in manifest order.
 *
 * Manifest order, not grant order, so taking back walks the declaration from
 * the top the same way allowing does — the detail line's `allows` half reads
 * in that order too. A stale selection or a row with nothing granted is null.
 */
export function nextDenyAt(
  registry: readonly RegistryEntry[],
  grants: PluginGrants,
  selection: number,
): { id: string; permission: PluginPermission } | null {
  const rows = pluginRows(registry, [], grants);
  const row = rows[selection];
  if (row === undefined) return null;
  const declared = pluginFromId(registry, row.id)?.manifest.permissions ?? [];
  const granted = grantedPermissions(grants, row.id)
    .slice()
    .sort((a, b) => declared.indexOf(a) - declared.indexOf(b));
  const first = granted[0];
  return first === undefined ? null : { id: row.id, permission: first };
}

/**
 * What an install says about the ask: nothing when the plugin asked for
 * nothing (or this machine already granted it all), otherwise the pending
 * words as one sentence shaped to follow the install's own news — a leading
 * space, a capital, a trailing stop, so the toast reads as one paragraph.
 */
export function pendingGrantNote(manifest: TrackletPluginManifest, grants: PluginGrants): string {
  const pending = pendingPermissions(manifest, grants);
  if (pending.length === 0) return '';
  return ` It asks for ${pending.join(' ')} - nothing granted yet.`;
}

/**
 * One row as the browser draws it: name, kind, version, its switch, and what
 * it costs.
 *
 * The cost is the row's own honesty policy: a plugin that rendered nothing
 * says nothing (no `0.0ms` anywhere), one that did says its average, and one past
 * the budget says OVER — so the person reading the browser can decide whether
 * the sound is worth it. Nothing here mutes or bypasses: the switch stays the
 * person's, and the meter only reports.
 */
export function pluginRowLabel(row: PluginRow): string {
  const base = `${row.enabled ? 'ON ' : 'OFF'} ${row.name} ${row.kind} ${row.version}`;
  if (row.avgMs === null) return base;
  return `${base} ${row.avgMs.toFixed(1)}ms${row.overBudget ? ' OVER' : ''}`;
}

/**
 * The detail line under the selection: id, params, latency, outs, ask, example.
 *
 * The latency only speaks when there is one: most plugins start at their
 * attack, and a detail line that cried `lat 0ms` on every row would teach the
 * reader to skip the line entirely. A latent plugin says `lat 12ms` — the
 * claim the host compensates, on both clocks. Declared outs are named the
 * same way params are, so a kit reads `outs thump click` — the buses
 * per-out stems will carry when they land. Permissions are named as two
 * halves: `needs` is what still needs deciding (the ask minus the answers,
 * so a granted word goes quiet), and `allows` is what this machine granted.
 * A fresh install reads `needs storage`; a fully trusted one reads
 * `allows storage` with no `needs` at all.
 */
export function pluginDetail(entry: RegistryEntry, example: string, grants: PluginGrants = {}): string {
  const params = entry.manifest.params.map((param) => param.id).join(' ');
  const latency = (entry.manifest.latencyMs ?? 0) > 0 ? ` lat ${entry.manifest.latencyMs}ms` : '';
  const outs = entry.manifest.outs?.length ? ` outs ${entry.manifest.outs.join(' ')}` : '';
  const pending = pendingPermissions(entry.manifest, grants);
  const needs = pending.length > 0 ? ` needs ${pending.join(' ')}` : '';
  const declared = entry.manifest.permissions ?? [];
  const granted = grantedPermissions(grants, entry.manifest.id)
    .slice()
    .sort((a, b) => declared.indexOf(a) - declared.indexOf(b));
  const allows = granted.length > 0 ? ` allows ${granted.join(' ')}` : '';
  return `${entry.manifest.id}@${entry.manifest.version}${params === '' ? '' : ` ${params}`}${latency}${outs}${needs}${allows} - e.g. ${example}`;
}
