/**
 * catalog — the whole instrument vocabulary as READABLE DATA.
 *
 * Everything a channel can sound like is already in this folder: the shapes in
 * `voice.ts`, the seven knobs, the voices by family, and the console profiles in
 * `chip.ts`. What this file adds is a SINGLE structured description of all of it,
 * in one shape, with stable ids — for a browser to render, for a doc to be
 * generated from, and for an agent to read instead of guessing.
 *
 * ── Why a catalog, and why not just the tables ───────────────────────────────
 * The tables are written for the ENGINE: `VOICES` holds a family as a bare word,
 * `VOICE_PARAMS` holds a label and a blurb but no sentence joining them, and the
 * chip roles are spread across seven profile objects. That is the right shape for
 * code and the wrong shape for a consumer that wants to list, filter or display
 * "every lead voice" without knowing how the code is arranged. So this file does
 * the one thing a catalog should: it says what exists, once, in plain terms.
 *
 * ── The promise: it cannot drift ─────────────────────────────────────────────
 * A catalog that is maintained by hand is a catalog that lies within a week. So
 * nothing here is authored twice: every entry is BUILT from the model's own
 * tables, and the tests assert the two agree (a wave with no label, a voice whose
 * family is not a family, a chip role the engine could not play — all fail). Add
 * a voice to `VOICES` and it appears here; there is nowhere else to remember it.
 *
 * ── What it deliberately does NOT cover ──────────────────────────────────────
 * The chip SOURCES' inner banks — the wavetables a `table` wave selects and the
 * one-shots a `sample` wave plays — live in the audio engine, not the model, and
 * the model must stay audio-free. So a `table` or `sample` entry here names the
 * wave and the knob that picks a bank; the bank's own contents are the engine's
 * business, which is the same split the rest of `model/` keeps.
 *
 * Phaser-free and audio-free like the rest of `model/`.
 */

import { CHIPS } from './chip';
import { KITS, kitVoices, isDefaultKit } from './kit';
import type { DrumId } from './drum';
import { DEFAULT_SHAPE, FILTER_SHAPES } from './shape';
import { LAYER_FIELDS, MAX_EXTRA_LAYERS, MAX_LAYERS, type LayerField } from './instrument';
import {
  DEFAULT_DUCK,
  DUCK_STEP,
  MAX_DUCK,
  MIN_DUCK,
  TRACK_DUCK,
  TRACK_EFFECTS,
  type TrackEffectId,
} from './song';
import {
  VOICES,
  VOICE_FAMILIES,
  VOICE_PARAMS,
  WAVES,
  WAVE_BLURBS,
  WAVE_LABELS,
  copyVoice,
  type VoiceFamily,
  type VoiceParamId,
  type VoiceParams,
  type Wave,
} from './voice';

/** What the catalog calls itself, so a consumer can check it is reading this. */
export const CATALOG_FORMAT = 'tracklet-instruments';

/**
 * The catalog's own version, bumped when its SHAPE changes.
 *
 * Separate from the song file format on purpose: a song file is read by this app,
 * a catalog is read by anything, and the two evolve for different reasons. A
 * consumer that does not recognise a version can still read the entries it knows,
 * which is why the version is a number here rather than a promise.
 */
export const CATALOG_VERSION = 5;

/** One waveform, with the label a row shows and the line that says what it is for. */
export interface CatalogWave {
  id: Wave;
  label: string;
  blurb: string;
}

/** One knob, with both named ends and the aliases a script will accept for it. */
export interface CatalogKnob {
  id: VoiceParamId;
  label: string;
  low: string;
  high: string;
  blurb: string;
  aliases: readonly string[];
}

/** One family of voices: the heading it is listed under, and what it is for. */
export interface CatalogFamily {
  id: VoiceFamily;
  heading: string;
  blurb: string;
}

/** One built-in voice: a named, ready-to-play set of the knobs. */
export interface CatalogVoice {
  id: string;
  label: string;
  family: VoiceFamily;
  blurb: string;
  params: VoiceParams;
}

/**
 * One DRUM KIT: the four patches a drum hit plays, chosen with one word.
 *
 * Beside the effects and the shapes because it answers the same question — "what
 * can this sound like, and which one do I want?" — one scope up from a voice: a
 * voice is a channel's sound and a kit is the DRUMS' sound, wherever they are.
 * `voices` is the part worth reading: a kit is a whole approach to a drum set, so
 * a list of four patches says more than any blurb could.
 */
export interface CatalogKit {
  id: string;
  label: string;
  blurb: string;
  /** Which music reaches for it, so the browser can answer "what is this FOR". */
  reach: string;
  /** True for the four presets, so a browser can say "the default". */
  atDefault: boolean;
  /** The four drum voices this kit plays, in kit order (kick, snare, hat, wind). */
  voices: readonly { drum: DrumId; params: VoiceParams }[];
  /** The line that chooses it, so a consumer can show one without composing it. */
  script: string;
}

/** One console profile: the voices it lays, channel by channel, in order. */
export interface CatalogChip {
  id: string;
  label: string;
  blurb: string;
  roles: VoiceParams[];
}

/**
 * One of the one-knob channel EFFECTS: both named ends and what it is for.
 *
 * Listed in the same catalog as the waves and voices because it answers the same
 * question — "what can this channel sound like, and which one do I want?" — and
 * because a sentence saying which genres reach for `drive` is the whole decision
 * procedure for an author choosing a number they cannot hear.
 */
export interface CatalogEffect {
  id: TrackEffectId;
  label: string;
  /** What 0 means: off, in one word. */
  low: string;
  /** What 100 means. */
  high: string;
  blurb: string;
  /** Which music reaches for it, so the browser can answer "what is this for". */
  reach: string;
}

/**
 * The PUMP: one channel telling the rest of the mix to step back.
 *
 * In the catalog with the effects because it answers the same question — "how do
 * I make this part sit right?" — even though it is the only control here whose
 * effect is on the channels it is NOT on. It is one number rather than a routing
 * diagram, which is the whole point: the hit is the event and everything else is
 * the answer.
 */
export interface CatalogDuck {
  id: 'duck';
  label: string;
  min: number;
  max: number;
  step: number;
  atDefault: number;
  low: string;
  high: string;
  blurb: string;
  reach: string;
  /** The line that writes it, so a consumer can show one without composing it. */
  script: string;
}

/**
 * One filter shape: which part of the sound a channel's filter lets through.
 *
 * No `min`/`max`, because a shape is a WORD rather than a number — the one kind
 * of entry beside the effects and the pump that is chosen rather than dialled.
 */
export interface CatalogShape {
  id: string;
  label: string;
  /** True for the one a channel already is, so a browser can say "the default". */
  atDefault: boolean;
  blurb: string;
  reach: string;
  aliases: readonly string[];
  /** The line that sets it, so a consumer can show one without composing it. */
  script: string;
}

/** One field of a layer that is not one of the nine knobs: octave, detune, gain. */
export interface CatalogLayerField {
  id: LayerField;
  label: string;
  min: number;
  max: number;
  step: number;
  ofDefault: number;
  low: string;
  high: string;
  blurb: string;
}

/**
 * How a channel's sound can be more than one layer.
 *
 * A channel's sound is its VOICE — layer 1 — plus a STACK of layers above it, all
 * summed by the engine. This is the block that makes that sayable to a consumer,
 * because "can I stack, how many, and what does a layer have that a voice does
 * not" is the first question a sound designer or an agent asks about this app.
 * The nine knobs in `knobs` are a layer's tone; these three are a layer's PITCH,
 * TUNING and LEVEL.
 */
export interface CatalogLayers {
  /** The most layers one channel may have, its voice included. */
  max: number;
  /** How many layers can sit ABOVE the voice: what a `layer` line can add. */
  maxExtra: number;
  blurb: string;
  fields: readonly CatalogLayerField[];
}

/** Everything a consumer needs to present or choose an instrument. */
export interface InstrumentCatalog {
  format: string;
  version: number;
  /** Every waveform, in the model's order. */
  waves: readonly CatalogWave[];
  /** Every knob, in the order the F4 menu shows them. */
  knobs: readonly CatalogKnob[];
  /** Every voice family, in the order the menu lists them. */
  families: readonly CatalogFamily[];
  /** Every built-in voice, in the family order the menu lists them. */
  voices: readonly CatalogVoice[];
  /** Every console profile, strongest first. */
  chips: readonly CatalogChip[];
  /** Every one-knob channel effect, in the order the menus show them. */
  effects: readonly CatalogEffect[];
  /** How far a channel may push the rest of the mix down while it plays. */
  duck: CatalogDuck;
  /** Every FILTER SHAPE a channel's `bright` knob can open, in the model's order. */
  shapes: readonly CatalogShape[];
  /** Every DRUM KIT a song may play, the default first. */
  kits: readonly CatalogKit[];
  /** How a channel stacks layers, and what each layer has beyond the knobs. */
  layers: CatalogLayers;
}

/**
 * The catalog, built fresh from the model's tables.
 *
 * Fresh copies rather than the tables themselves, so a consumer that edits what
 * it reads — a menu trimming a label for width, a test poking at a value — can
 * never reach back and change the sound of the app. Cheap, because the tables are
 * tiny, and the only safe way to hand out shared vocabulary.
 */
export function instrumentCatalog(): InstrumentCatalog {
  return {
    format: CATALOG_FORMAT,
    version: CATALOG_VERSION,
    waves: WAVES.map((id) => ({ id, label: WAVE_LABELS[id], blurb: WAVE_BLURBS[id] })),
    knobs: VOICE_PARAMS.map((param) => ({
      id: param.id,
      label: param.label,
      low: param.low,
      high: param.high,
      blurb: param.blurb,
      aliases: [...param.aliases],
    })),
    families: VOICE_FAMILIES.map((family) => ({ id: family.id, heading: family.heading, blurb: family.blurb })),
    voices: VOICES.map((voice) => ({
      id: voice.id,
      label: voice.label,
      family: voice.family,
      blurb: voice.blurb,
      params: copyVoice(voice.params),
    })),
    chips: CHIPS.map((chip) => ({
      id: chip.id,
      label: chip.label,
      blurb: chip.blurb,
      roles: chip.roles.map((role) => copyVoice(role)),
    })),
    effects: TRACK_EFFECTS.map((effect) => ({
      id: effect.id,
      label: effect.label,
      low: effect.low,
      high: effect.high,
      blurb: effect.blurb,
      reach: effect.reach,
    })),
    duck: {
      id: TRACK_DUCK.id,
      label: TRACK_DUCK.label,
      min: MIN_DUCK,
      max: MAX_DUCK,
      step: DUCK_STEP,
      atDefault: DEFAULT_DUCK,
      low: TRACK_DUCK.low,
      high: TRACK_DUCK.high,
      blurb: TRACK_DUCK.blurb,
      reach: TRACK_DUCK.reach,
      script: `track 1 ${TRACK_DUCK.id} 60`,
    },
    shapes: FILTER_SHAPES.map((shape) => ({
      id: shape.id,
      label: shape.label,
      atDefault: shape.id === DEFAULT_SHAPE,
      blurb: shape.blurb,
      reach: shape.reach,
      aliases: [...shape.aliases],
      script: shape.id === DEFAULT_SHAPE ? 'track 1 shape round' : `track 1 shape ${shape.id}`,
    })),
    kits: KITS.map((kit) => ({
      id: kit.id,
      label: kit.label,
      blurb: kit.blurb,
      reach: kit.reach,
      atDefault: isDefaultKit(kit.id),
      // Fresh copies, like every other table here: a consumer that edits what it
      // reads cannot reach back into the kit the engine plays.
      voices: kitVoices(kit.id),
      script: `kit ${kit.id}`,
    })),
    layers: {
      max: MAX_LAYERS,
      maxExtra: MAX_EXTRA_LAYERS,
      blurb: 'a channel\u2019s sound is its voice, which IS layer 1, plus up to three layers above it: two layers is an organ or a choir, three saws a few cents apart is a supersaw, and a bright layer over a dull one is a plucked string',
      fields: LAYER_FIELDS.map((field) => ({
        id: field.id,
        label: field.label,
        min: field.min,
        max: field.max,
        step: field.step,
        ofDefault: field.ofDefault,
        low: field.low,
        high: field.high,
        blurb: field.blurb,
      })),
    },
  };
}

/**
 * The catalog as JSON, for a caller that wants to hand it to something else.
 *
 * `space` is passed straight to `JSON.stringify`, so the default is the compact
 * form an agent reads in one line and `2` is the form a person reads.
 */
export function catalogJson(space?: number): string {
  return JSON.stringify(instrumentCatalog(), null, space);
}
