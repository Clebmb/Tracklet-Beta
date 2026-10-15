/**
 * presetfile — one plugin instrument's knob values as a document.
 *
 * The patch's bargain one scope over: a `.pluginpatch.json` carries the VALUES
 * a channel turned — `{ "cutoff": 70, "decay": 45 }` — and not the knobs, which
 * stay the manifest's. A preset names its plugin (`"plugin":
 * "com.example.supersaw"`), so loading one onto a channel that plays another
 * instrument is a refusal rather than a retune: knobs are not interchangeable
 * across code the way a filter shape is.
 *
 * Values are validated for SHAPE here (an object of finite numbers, clamped
 * into 0..100) and coerced against the manifest where they are APPLIED — by
 * `parsePreset` in `plugins/params`, which knows the knobs. A preset from a
 * newer minor that added a knob still loads, minus the knob this build never
 * had; a value past the envelope only ever meant \"as far as it goes\".
 *
 * Phaser-free and DOM-free, like the patch file beside it.
 */

import { clampPluginParamValue } from './song';
import { fileSlug, numberOf } from './songfile';
import type { PluginParamValues } from '../plugins/instrument';

/** Whether a value is a plain object, for a file reader that refuses anything else. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The word in `format`, so a reader knows a preset from a song before it looks. */
export const PRESET_FILE_FORMAT = 'tracklet-plugin-preset';

/**
 * The version of the preset document itself.
 *
 * A number of its OWN, not `SONG_FILE_VERSION`: these are two formats that
 * happen to share a vocabulary, and a future song-only field must not make every
 * preset file in the world look stale. A preset is at version 1 because this is
 * the first.
 */
export const PRESET_FILE_VERSION = 1;

/** What the file is CALLED: `.pluginpatch.json`, so the `.json` habit still works. */
export const PRESET_FILE_EXTENSION = '.pluginpatch.json';

/** What a preset with no name of its own is called, and what its file is named. */
export const PRESET_NAME_FALLBACK = 'PRESET';

/**
 * The longest name a preset will keep.
 *
 * A name is not a filename — the filename is derived from it — so this is only
 * about a menu row and a status line, the patch's reason exactly.
 */
export const PRESET_NAME_LIMIT = 40;

/** A preset document, read and shape-checked but not yet coerced to a manifest. */
export interface PluginPresetFile {
  /** What a row and a status line call it. */
  name: string;
  /** The plugin whose knobs these values turn. */
  plugin: string;
  /** The values, each 0..100 — unknown knobs kept, for the manifest to drop. */
  values: PluginParamValues;
}

export type PresetFileParse =
  | { ok: true; name: string; plugin: string; values: PluginParamValues }
  | { ok: false; errors: string[] };

/**
 * The document, as the text a file holds.
 *
 * Only knobs the channel actually turned travel — a channel at manifest
 * defaults writes `{}` for values rather than no file at all, because an empty
 * map still says which plugin it belongs to. The manifest is never in the file
 * (the app holds it, like code); what travels is the reference plus the values.
 */
export function presetToJson(preset: PluginPresetFile): string {
  const file: Record<string, unknown> = {
    format: PRESET_FILE_FORMAT,
    version: PRESET_FILE_VERSION,
    name: tidyPresetName(preset.name),
    plugin: preset.plugin,
    values: { ...preset.values },
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Read a preset document. Never throws, and returns what is wrong rather than
 * repairing it into something that would sound different from the file.
 *
 * The FIRST refusal is the format's own, because two formats that both start
 * with `{` deserve to say which they are: a `.json` song dropped here is
 * refused by name rather than read as a preset with no knobs.
 */
export function presetFromJson(text: string): PresetFileParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`this file is not JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['a preset file must be a JSON object like { "format": "tracklet-plugin-preset", ... }.'] };
  }
  const entry = raw as Record<string, unknown>;
  // What IS this file — asked before anything is read out of it, and answered
  // with the other format's name when it is the other format's file.
  if (entry.format !== PRESET_FILE_FORMAT) {
    return {
      ok: false,
      errors: [typeof entry.format === 'string'
        ? `this is not a preset file: its "format" is "${entry.format}".`
        : 'this is not a preset file: it has no "format" key.'],
    };
  }
  const version = typeof entry.version === 'number' ? entry.version : 0;
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, errors: [`this preset file's "version" must be a whole number 1 or more; got ${JSON.stringify(entry.version)}.`] };
  }
  if (version > PRESET_FILE_VERSION) {
    return {
      ok: false,
      errors: [`this preset was written by a newer version of Tracklet (preset file ${version}; this build reads ${PRESET_FILE_VERSION}). Update the app, or ask for the preset again from a build you have.`],
    };
  }
  // Which plugin these knobs belong to. Checked for SPELLING (one token) and
  // not against a list, because the library is the APP's rather than the
  // file's — a preset for code this machine does not have still loads, and the
  // song keeps the values against the code arriving, the `pluginParams` bargain
  // exactly.
  if (typeof entry.plugin !== 'string' || entry.plugin.trim() === '' || /\s/.test(entry.plugin)) {
    return { ok: false, errors: [`this preset's "plugin" must be a plugin id like "com.example.supersaw"; got ${JSON.stringify(entry.plugin)}.`] };
  }
  // The values. An object of numbers, clamped into the envelope every
  // manifest range sits inside — a value past it only ever meant \"as far as
  // it goes\". Unknown knob ids are KEPT here and dropped where they are
  // applied, so a preset from a newer minor survives a save on this one.
  if (entry.values !== undefined && !isRecord(entry.values)) {
    return { ok: false, errors: [`this preset's "values" must be an object like {"cutoff": 70}; got ${JSON.stringify(entry.values)}.`] };
  }
  const values: PluginParamValues = {};
  for (const [id, value] of Object.entries(entry.values ?? {})) {
    const at = numberOf(value);
    if (at === null) {
      return { ok: false, errors: [`this preset's "${id}" value must be a number 0..100, e.g. 70; got ${JSON.stringify(value)}.`] };
    }
    values[id] = clampPluginParamValue(at);
  }
  return {
    ok: true,
    name: tidyPresetName(typeof entry.name === 'string' ? entry.name : ''),
    plugin: entry.plugin,
    values,
  };
}

/**
 * A name tidied for a preset: trimmed, collapsed, shortened, and never empty.
 *
 * The patch's rule exactly — a preset's name is only ever read by a person on
 * a row and a status line, so it may have spaces, and it is upper-cased because
 * everything this app prints is.
 */
export function tidyPresetName(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim().slice(0, PRESET_NAME_LIMIT).trim().toUpperCase();
  return flat === '' ? PRESET_NAME_FALLBACK : flat;
}

/** The file a preset of this name is written to: `warm-pad.pluginpatch.json`. */
export function presetFileName(name: string): string {
  return `${fileSlug(tidyPresetName(name), PRESET_NAME_FALLBACK)}${PRESET_FILE_EXTENSION}`;
}

/**
 * The name to give a preset read from a file, when the file does not say.
 *
 * The stem of the filename with the extension off and the dashes turned back
 * into spaces. Only a fallback: a file that names itself keeps its own name.
 */
export function presetNameFromFile(fileName: string): string {
  const lower = fileName.toLowerCase();
  const stem = lower.endsWith(PRESET_FILE_EXTENSION)
    ? fileName.slice(0, -PRESET_FILE_EXTENSION.length)
    : fileName.replace(/\.json$/i, '');
  return tidyPresetName(stem.replace(/[-_]+/g, ' '));
}

/**
 * One line about a preset, for the status well after a save or a load.
 *
 * Written as a sentence about what is IN the preset — how many knobs it turns
 * and on which plugin — because the useful question after loading somebody's
 * values is \"what did I just get\".
 */
export function presetAbout(preset: Pick<PluginPresetFile, 'plugin' | 'values'>): string {
  const knobs = Object.keys(preset.values).length;
  return `${knobs} knob${knobs === 1 ? '' : 's'} for ${preset.plugin}`;
}
