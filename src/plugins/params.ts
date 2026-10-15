/**
 * plugins/params — the VALUES behind a plugin's knobs.
 *
 * The manifest declares knobs (`params.ts` in the other direction: ids, ranges,
 * defaults); this module holds what they are set to RIGHT NOW. Values arrive
 * from storage, presets, and (from M6) automation lanes — all untrusted, all
 * clamped: `coerceParamValues` turns any raw object into exactly the declared
 * knobs, every number inside its range, unknown ids dropped, missing knobs at
 * their defaults. It never throws, so a corrupt preset costs the tweak, never
 * the song.
 *
 * Phaser-free and DOM-free, unit tested on its own. The audio path reads these
 * values per note (handed over whole, like everything else the engine takes),
 * and the browser will draw one slider per row from the same declarations.
 */

import type { TrackletPluginManifest } from './manifest';
import { defaultPluginParams, type PluginParamValues } from './instrument';

/** One knob's live value, for rows the browser draws. */
export interface ParamValue {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
}

/**
 * The live values for a manifest: every declared knob, clamped, no strangers.
 *
 * Lenient on purpose (the stored-library policy): a value that is not a number
 * takes its default, a number outside range clamps to it, and an id the
 * manifest never declared is dropped — a preset from a newer minor that added
 * a knob still loads, minus the knob this build never had.
 */
export function coerceParamValues(manifest: TrackletPluginManifest, raw: unknown): PluginParamValues {
  const values = defaultPluginParams(manifest);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return values;
  const fields = raw as Record<string, unknown>;
  for (const param of manifest.params) {
    const value = fields[param.id];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    values[param.id] = Math.min(param.max, Math.max(param.min, value));
  }
  return values;
}

/** One row per knob: the declaration plus its live value, for the browser. */
export function paramRows(manifest: TrackletPluginManifest, values: PluginParamValues): ParamValue[] {
  const coerced = coerceParamValues(manifest, values);
  return manifest.params.map((param) => ({
    id: param.id,
    label: param.label,
    min: param.min,
    max: param.max,
    value: coerced[param.id] ?? param.default,
  }));
}

/** One row as the browser draws it: label, value, and range. */
export function paramRowLabel(row: ParamValue): string {
  return `${row.label} ${row.value} (${row.min}-${row.max})`;
}

/**
 * A preset: the plugin it belongs to plus its values, as a file holds them.
 * Only the values travel — the manifest stays the plugin's, so a preset never
 * disagrees with the code about which knobs exist.
 */
export interface PluginPreset {
  plugin: string;
  values: PluginParamValues;
}

/** Read a preset out of untrusted JSON: ids checked, values coerced. */
export function parsePreset(manifest: TrackletPluginManifest, raw: unknown): PluginPreset | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const fields = raw as Record<string, unknown>;
  if (fields.plugin !== manifest.id) return null;
  return { plugin: manifest.id, values: coerceParamValues(manifest, fields.values) };
}

/**
 * The values a preset file's map turns into on a channel: SPARSE, not filled.
 *
 * Only the knobs the file actually turned travel — a knob at its default is
 * the channel's own business, and filling defaults here would write a `params`
 * line for every knob of every preset ever loaded. Each kept value is clamped
 * into ITS OWN range (not the 0..100 envelope the file was shape-checked
 * against), and a knob the manifest never declared is dropped: a preset from a
 * newer minor that added a knob still loads, minus the knob this build never
 * had. With no manifest — code this machine does not have — the map passes
 * through untouched, so the values wait for the code the way a song's do.
 */
export function applyPresetValues(
  manifest: TrackletPluginManifest | null,
  raw: PluginParamValues,
): PluginParamValues {
  if (manifest === null) return { ...raw };
  const values: PluginParamValues = {};
  for (const param of manifest.params) {
    const value = raw[param.id];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    values[param.id] = Math.min(param.max, Math.max(param.min, value));
  }
  return values;
}
