/**
 * instrument — what a channel sounds like when one wave is not enough.
 *
 * `voice.ts` answers "which instrument is this?" with one word and nine knobs,
 * and that is still the answer for almost every channel in the app. This file
 * adds the layer UNDER that answer: a channel's sound is really a PATCH — a
 * stack of one or more LAYERS — and a voice is simply the shortest possible
 * patch.
 *
 * ── Why a stack, and why now ─────────────────────────────────────────────────
 * Every sound this app could ever make out of one oscillator is a variation on
 * a buzzer. Two layers is already an organ (an octave-apart pair), a bell (a
 * beating pair a few cents apart), a plucked string (a bright attack over a
 * dull body), or a choir (a wide pad under a thin solo). The entire next tier of
 * sound — FM, wavetables, samples, drawbars — is "more layers, with more knobs
 * on each", so the stack is the one structural change everything else stands on.
 *
 * ── Why the old sound is untouched ──────────────────────────────────────────
 * `patchFromVoice` turns any `VoiceParams` into a patch of exactly ONE layer
 * whose numbers ARE the voice's, with no octave shift, no detune and full layer
 * gain. So every song written before this file existed renders through the same
 * arithmetic it always did, and a test proves the round trip is exact — the
 * point of doing this behind the existing API rather than beside it.
 *
 * The extra fields a layer carries are deliberately the three that change
 * PITCH rather than tone: `octave`, `detune` in cents, and `gain` relative to
 * the rest of the stack. That is the smallest set that makes the common stacks
 * (unison, octave doubling, beating, a quiet sub under a lead) expressible
 * without inventing a second vocabulary for tone.
 *
 * Phaser-free and audio-free like the rest of `model/`: the script, the file
 * formats and the engine all read this one table.
 */

import { DEFAULT_SHAPE, type FilterShape } from './shape';
import {
  clampParam,
  copyVoice,
  DEFAULT_VOICE,
  MAX_PARAM,
  MIN_PARAM,
  PARAM_STEP,
  tidyVoiceName,
  voiceNameFor,
  voiceNameProblem,
  VOICE_PARAMS,
  WAVE_LABELS,
  waveFromName,
  type VoiceParams,
  type Wave,
} from './voice';

/**
 * One oscillator-worth of a channel's sound.
 *
 * Its nine knobs are the SAME nine a voice has, with the same meanings and the
 * same 0..100 ranges — deliberately, because a layer that needed a second set of
 * words would be a second thing to learn for no gain. What a layer adds is where
 * it sits: an octave, a few cents, and how loud it is against its neighbours.
 */
export interface Layer {
  wave: Wave;
  /** How many octaves this layer is transposed, -4..4. Doubling is `1`. */
  octave: number;
  /** Fine detune in cents, -100..100. A few cents is warmth; more is a chorus. */
  detune: number;
  /** This layer's level within the instrument, 0..100. */
  gain: number;
  bright: number;
  /** How far the filter moves over a note, 0..100. 0 is a steady tone. */
  sweep: number;
  /** How narrow a pulse is, 0..100. Only heard on a square wave. */
  duty: number;
  noise: number;
  attack: number;
  /** How long the fall from the attack peak to the held level takes, 0..100. */
  decay: number;
  ring: number;
  /** How long the note rings on after it ends, 0..100. */
  release: number;
  thick: number;
}

/** A channel's whole sound: its layers, in the order the engine plays them. */
export interface Patch {
  layers: Layer[];
  /**
   * Which part of the sound survives the channel's filter — see `shape.ts`.
   *
   * ABSENT means `round`, the low-pass every song here has always had, and a
   * patch built from a voice alone therefore never carries it. That is what keeps
   * a song that says nothing about a shape rendering through the same arithmetic
   * it always did, and it is why the golden hash of such a song does not move.
   *
   * It is on the PATCH rather than on a layer because `bright` is: a channel has
   * one filter, every layer of a stack is filtered by that one answer.
   */
  shape?: FilterShape;
}

/**
 * How many layers one channel may stack.
 *
 * Four is a real ceiling and not an arbitrary one: a channel in this app is
 * monophonic, so every layer is another oscillator per note, and eight channels
 * of four layers is already thirty-two voices per row of a pattern. Beyond that
 * a song stops being a song and becomes a mixing problem — and the sounds that
 * want more (an organ's drawbars, a supersaw) are the ones a future engine will
 * build as one layer with a richer source rather than as eight thin ones.
 */
export const MAX_LAYERS = 4;

export const MIN_LAYER_OCTAVE = -4;
export const MAX_LAYER_OCTAVE = 4;
export const MIN_DETUNE = -100;
export const MAX_DETUNE = 100;
/** A layer at rest sits at full level within its instrument, like a channel does. */
export const DEFAULT_LAYER_GAIN = 100;
/** A layer at rest is in tune with the rest of the stack. */
export const DEFAULT_LAYER_OCTAVE = 0;
export const DEFAULT_LAYER_DETUNE = 0;

export function clampOctave(octave: number): number {
  if (!Number.isFinite(octave)) return DEFAULT_LAYER_OCTAVE;
  return Math.max(MIN_LAYER_OCTAVE, Math.min(MAX_LAYER_OCTAVE, Math.round(octave)));
}

export function clampDetune(cents: number): number {
  if (!Number.isFinite(cents)) return DEFAULT_LAYER_DETUNE;
  return Math.max(MIN_DETUNE, Math.min(MAX_DETUNE, Math.round(cents)));
}

export function clampLayerGain(gain: number): number {
  return clampParam(gain);
}

/** Fold anything a file or a script could hold into a layer that is safe to play. */
export function clampLayer(layer: Layer): Layer {
  return {
    wave: layer.wave,
    octave: clampOctave(layer.octave),
    detune: clampDetune(layer.detune),
    gain: clampLayerGain(layer.gain),
    bright: clampParam(layer.bright),
    sweep: clampParam(layer.sweep),
    duty: clampParam(layer.duty),
    noise: clampParam(layer.noise),
    attack: clampParam(layer.attack),
    decay: clampParam(layer.decay),
    ring: clampParam(layer.ring),
    release: clampParam(layer.release),
    thick: clampParam(layer.thick),
  };
}

/**
 * The layer that IS a voice: the six fields, in tune, at full level.
 *
 * The identity this whole file rests on — a voice is a one-layer patch and
 * nothing about it changes on the way through.
 */
export function layerFromVoice(voice: VoiceParams): Layer {
  return {
    wave: voice.wave,
    octave: DEFAULT_LAYER_OCTAVE,
    detune: DEFAULT_LAYER_DETUNE,
    gain: DEFAULT_LAYER_GAIN,
    bright: voice.bright,
    sweep: voice.sweep,
    duty: voice.duty,
    noise: voice.noise,
    attack: voice.attack,
    decay: voice.decay,
    ring: voice.ring,
    release: voice.release,
    thick: voice.thick,
  };
}

/** The nine fields a layer's tone is made of, without its pitch or its level. */
export function voiceOfLayer(layer: Layer): VoiceParams {
  return {
    wave: layer.wave,
    bright: layer.bright,
    sweep: layer.sweep,
    duty: layer.duty,
    noise: layer.noise,
    attack: layer.attack,
    decay: layer.decay,
    ring: layer.ring,
    release: layer.release,
    thick: layer.thick,
  };
}

/** Any voice as a patch: one layer, in tune, at full level. */
export function patchFromVoice(voice: VoiceParams): Patch {
  return { layers: [layerFromVoice(voice)] };
}

/** A patch's first layer, which is the only one a legacy voice ever has. */
export function firstLayer(patch: Patch): Layer {
  return patch.layers[0] ?? layerFromVoice(DEFAULT_VOICE);
}

/**
 * The same patch with a different VOICE, and its stack untouched.
 *
 * Layer 1 IS the channel's voice, so replacing the voice means replacing the
 * first layer — and doing it here rather than in the engine is what keeps
 * "automation moves the voice" a statement about the model instead of about the
 * audio graph. The stack above it is copied by reference: a patch handed to a
 * note is never edited, only read.
 */
export function patchWithVoice(patch: Patch, voice: VoiceParams): Patch {
  return {
    layers: [layerFromVoice(voice), ...patch.layers.slice(1)],
    // The SHAPE comes with it, and that is not a detail: a lane that moves a knob
    // rebuilds layer 1 for one note, and a rebuild that dropped the shape would
    // make an automated note come back as a plain low-pass.
    ...(patch.shape === undefined ? {} : { shape: patch.shape }),
  };
}

/**
 * A layer's own sound, as a voice — or null when the layer is more than a voice.
 *
 * The inverse of `layerFromVoice`, and honest about when it cannot answer: a
 * layer that is transposed, detuned or turned down is NOT any single voice, so
 * this returns null rather than a voice that would silently lose those three.
 */
export function voiceOfPlainLayer(layer: Layer): VoiceParams | null {
  if (layer.octave !== DEFAULT_LAYER_OCTAVE) return null;
  if (layer.detune !== DEFAULT_LAYER_DETUNE) return null;
  if (layer.gain !== DEFAULT_LAYER_GAIN) return null;
  return voiceOfLayer(layer);
}

/**
 * The voice a whole patch reduces to, or null when it cannot be reduced.
 *
 * This is what keeps the SONG FILE FORMAT from having to change: as long as a
 * channel's sound is one plain layer — which is every channel a voice or the F4
 * menu has ever produced — it still travels as a `voice` object, so an old build
 * can read a song saved by this one. A stacked patch has no such spelling yet,
 * and saying so is better than writing a file that means something different.
 */
export function plainVoiceOfPatch(patch: Patch): VoiceParams | null {
  if (patch.layers.length !== 1) return null;
  return voiceOfPlainLayer(patch.layers[0]);
}

/**
 * Build a patch from layers, clamped and capped.
 *
 * An empty list becomes one neutral layer rather than an empty patch, because a
 * channel with NO layers is a channel that cannot make a sound, and silence is
 * never the answer to a malformed sound — the whole vocabulary is built so that
 * the worst case is a boring instrument rather than no instrument.
 */
export function makePatch(layers: readonly Layer[], shape: FilterShape = DEFAULT_SHAPE): Patch {
  const kept = layers.slice(0, MAX_LAYERS).map(clampLayer);
  return {
    layers: kept.length > 0 ? kept : [layerFromVoice(DEFAULT_VOICE)],
    // Omitted rather than written when it is the default, on the same rule the
    // fields of a song file follow: absent and `round` mean the same thing, and
    // only one of them changes the bytes of a patch nobody shaped.
    ...(shape === DEFAULT_SHAPE ? {} : { shape }),
  };
}

/** The same patch, copied — shape included, so a copy filters the same way. */
export function copyPatch(patch: Patch): Patch {
  return {
    layers: patch.layers.map((layer) => ({ ...layer })),
    ...(patch.shape === undefined ? {} : { shape: patch.shape }),
  };
}

export function sameLayer(a: Layer, b: Layer): boolean {
  return a.wave === b.wave
    && a.octave === b.octave && a.detune === b.detune && a.gain === b.gain
    && a.bright === b.bright && a.sweep === b.sweep && a.duty === b.duty && a.noise === b.noise
    && a.attack === b.attack && a.decay === b.decay && a.ring === b.ring && a.release === b.release
    && a.thick === b.thick;
}

export function samePatch(a: Patch, b: Patch): boolean {
  return (a.shape ?? DEFAULT_SHAPE) === (b.shape ?? DEFAULT_SHAPE)
    && a.layers.length === b.layers.length
    && a.layers.every((layer, i) => sameLayer(layer, b.layers[i]));
}

/**
 * True when a patch is exactly the patch a voice makes.
 *
 * The engine and the tests both want this question asked in one place: it is the
 * claim "this channel sounds the way the old engine would have made it sound",
 * and every existing song has to answer yes.
 */
export function isPlainVoicePatch(patch: Patch, voice: VoiceParams): boolean {
  const plain = plainVoiceOfPatch(patch);
  if (plain === null) return false;
  return plain.wave === voice.wave
    && plain.bright === voice.bright && plain.sweep === voice.sweep
    && plain.duty === voice.duty && plain.noise === voice.noise
    && plain.attack === voice.attack && plain.decay === voice.decay
    && plain.ring === voice.ring && plain.release === voice.release
    && plain.thick === voice.thick;
}

/** How a patch reads on screen: `1 LAYER`, `3 LAYERS`. */
export function patchLabel(patch: Patch): string {
  return `${patch.layers.length} LAYER${patch.layers.length === 1 ? '' : 'S'}`;
}

/**
 * How a layer's own pitch offset reads: `OCT +1`, `DET -12c`, or `IN TUNE`.
 *
 * Short on purpose — it is drawn in a menu row beside a waveform chip — and it
 * says `IN TUNE` rather than nothing so that a layer with no offset still has a
 * visible answer to "where is this one?".
 */
export function layerPitchLabel(layer: Layer): string {
  const parts: string[] = [];
  if (layer.octave !== DEFAULT_LAYER_OCTAVE) parts.push(`OCT ${layer.octave > 0 ? '+' : ''}${layer.octave}`);
  if (layer.detune !== DEFAULT_LAYER_DETUNE) parts.push(`DET ${layer.detune > 0 ? '+' : ''}${layer.detune}c`);
  return parts.length > 0 ? parts.join(' ') : 'IN TUNE';
}

/** A layer's tone as a voice, for a caller that only wants the knobs. */
export function layerVoice(layer: Layer): VoiceParams {
  return voiceOfLayer(layer);
}

/** The voice a patch is, when it is one, else the neutral default. */
export function voiceOrDefault(patch: Patch): VoiceParams {
  return plainVoiceOfPatch(patch) ?? copyVoice(DEFAULT_VOICE);
}

// --- a channel's stack: the voice, plus the layers above it -----------------

/**
 * How many layers a channel may have ABOVE its voice.
 *
 * A channel's sound is its VOICE plus its STACK, so the total is still
 * `MAX_LAYERS`: `voice` is layer 1, and the stack is layers 2, 3 and 4. Writing
 * it this way is what keeps the arithmetic of the whole app unchanged — every
 * channel that has never been stacked is a voice, and a voice is a one-layer
 * patch, exactly as `patchFromVoice` has always said.
 */
export const MAX_EXTRA_LAYERS = MAX_LAYERS - 1;

/**
 * The two fields of a channel that make a sound: its voice, and the layers above
 * it.
 *
 * A structural type rather than an import of `Track`, so this file stays free of
 * `song.ts` — the same reason it takes a `Patch` instead of a scene. Anything with
 * a `voice` and a `stack` can be asked to build a patch, which is what lets the
 * model, the engine and the file formats share one answer.
 */
export interface StackedSound {
  /**
   * Layer 1: what a channel sounds like when nobody has stacked anything, and
   * the layer the F4 nine knobs edit.
   */
  voice: VoiceParams;
  /**
   * Layers 2..4, in the order the engine plays them. EMPTY on every channel of
   * every song written before stacks existed, which is what makes a stack inert.
   */
  stack: Layer[];
  /**
   * Which part of the sound survives the channel's filter. Optional because a
   * `Track` is only one of the things that satisfy this shape, and because absent
   * IS the answer `round` — see `Patch.shape`.
   */
  shape?: FilterShape;
}

/**
 * Whether layer `index` (1-based) may carry a pitch or a level.
 *
 * Layer 1 is the voice, and a voice has no octave, no detune and no gain: it is in
 * tune with itself, at full level, by definition — which is precisely what
 * `patchFromVoice` promises and what keeps every old sound byte-identical. A
 * transposed copy belongs ABOVE the voice (`layer 1 2 octave 1`), where it is
 * plainly a second layer rather than a re-tuned original.
 *
 * The caller builds the message, because only the parser knows the line number
 * and the channel number it should name.
 */
export function layerPitchAllowed(index: number): boolean {
  return index > 1;
}

/** The sound a layer starts from: a neutral tone, in tune, at full level. */
export function neutralLayer(wave: Wave = DEFAULT_VOICE.wave): Layer {
  return { ...layerFromVoice(DEFAULT_VOICE), wave };
}

/**
 * A channel's whole sound, as the engine and the renderer want it.
 *
 * The one place the two halves meet: layer 1 IS the voice, so a channel with no
 * stack comes out as `patchFromVoice(voice)` and every song written before this
 * function existed renders through the same arithmetic it always did. A test
 * proves that identity rather than trusting it.
 */
export function patchForTrack(track: StackedSound): Patch {
  const layers = [layerFromVoice(track.voice), ...track.stack.slice(0, MAX_EXTRA_LAYERS)];
  return makePatch(layers, track.shape ?? DEFAULT_SHAPE);
}

/** How many layers a channel has, counting the voice: 1..`MAX_LAYERS`. */
export function layerCount(track: StackedSound): number {
  return 1 + track.stack.length;
}

/**
 * One layer of a channel, 1-based, or null when there is no such layer.
 *
 * Layer 1 is the voice, handed back as a layer — which is what makes the UI able
 * to draw a stack as one list of rows without knowing that the first row is
 * stored somewhere else.
 */
export function layerAt(track: StackedSound, index: number): Layer | null {
  if (index === 1) return layerFromVoice(track.voice);
  return track.stack[index - 2] ?? null;
}

/**
 * Write into one of a channel's layers, growing the stack by one if needed.
 *
 * The rules, which are the whole reason a stack is a list and not four slots:
 *
 *   • Layer 1 is the voice, so a change here lands on the voice's tone. The
 *     parser refuses a pitch or a level for layer 1 before this is ever called
 *     (`layerPitchAllowed`), because only the parser can name the line.
 *   • Layer `count + 1` is ADDED, as a copy of the layer below it — so `+ LAYER`
 *     in a menu and `layer 1 2` in a script both start from the sound you were
 *     already listening to, and the first move is to move it (detune it, drop it
 *     an octave, turn it down) rather than to build the same tone twice.
 *   • A layer that does not exist yet and is not the next one is REFUSED: a stack
 *     has no holes. `false` is the answer, and the caller — which validated the
 *     index against the same rule at parse time, where it can name the line —
 *     treats it as "nothing to do".
 */
export function setTrackLayer(track: StackedSound, index: number, change: Partial<Layer>): boolean {
  const tone = (): Partial<Layer> => {
    const out: Partial<Layer> = { ...change };
    delete out.octave;
    delete out.detune;
    delete out.gain;
    return out;
  };
  if (index === 1) {
    const next: VoiceParams = { ...track.voice, ...tone() } as VoiceParams;
    track.voice = clampLayerVoice(next);
    return true;
  }
  if (!Number.isInteger(index) || index < 2 || index > MAX_LAYERS) return false;
  if (index > track.stack.length + 2) return false;
  if (index === track.stack.length + 2) {
    if (track.stack.length >= MAX_EXTRA_LAYERS) return false;
    // A copy of the layer below it, so the new layer is audible at once and is
    // something to shape rather than something to build.
    const below = layerAt(track, index - 1) ?? neutralLayer();
    track.stack.push({ ...below });
  }
  const current = track.stack[index - 2];
  if (!current) return false;
  track.stack[index - 2] = clampLayer({ ...current, ...change });
  return true;
}

/**
 * Remove one of a channel's layers, shifting the ones above it down.
 *
 * A stack is a list, so removing layer 2 of 3 leaves two layers with the old
 * third where the second was — the same way removing a bar from the order or a
 * channel from the song behaves. Layer 1 cannot be removed: it is the voice, and a
 * channel with no layers is a channel that makes no sound, which is a thing to
 * say with `mute` rather than by emptying an instrument.
 */
export function clearTrackLayer(track: StackedSound, index: number): boolean {
  if (!Number.isInteger(index) || index < 2 || index > track.stack.length + 1) return false;
  track.stack.splice(index - 2, 1);
  return true;
}

/** How a channel's sound reads where there is room for two words: `3 LAYERS`. */
export function stackLabel(track: StackedSound): string {
  return patchLabel(patchForTrack(track));
}

/**
 * The mark a channel row wears when it is stacked: `+2`, or nothing at all.
 *
 * Three characters of channel row are already spent on the sound chip, so this
 * says only what a chip cannot: that there is more to this channel than the one
 * layer the chip is naming.
 */
export function stackChip(track: StackedSound): string {
  return track.stack.length === 0 ? '' : `+${track.stack.length}`;
}

/** Clamp a voice read back through the layer machinery. */
function clampLayerVoice(voice: VoiceParams): VoiceParams {
  const out = copyVoice(voice);
  for (const param of VOICE_PARAMS) out[param.id] = clampParam(out[param.id]);
  return out;
}

/**
 * One field of a layer that is NOT one of the nine knobs, as data.
 *
 * The catalog, the F7 screen and the docs all need the same three answers about
 * `octave`, `detune` and `gain` — what to call it, what it ranges over, and what
 * it does to what you HEAR — so they are written once, here, beside the code
 * that clamps them.
 */
export interface LayerFieldInfo {
  id: LayerField;
  /** What the menu and the reference call it. */
  label: string;
  min: number;
  max: number;
  /** How far one arrow press moves it. */
  step: number;
  /** What it reads as when nobody has said otherwise. */
  ofDefault: number;
  /** The word at the low end, and at the high end — a control you can read. */
  low: string;
  high: string;
  blurb: string;
}

/** The three layer fields that are not tone knobs. */
export type LayerField = 'octave' | 'detune' | 'gain';

/** The layer fields, in the order a layer row shows them. */
export const LAYER_FIELDS: readonly LayerFieldInfo[] = [
  {
    id: 'octave', label: 'OCTAVE', min: MIN_LAYER_OCTAVE, max: MAX_LAYER_OCTAVE, step: 1, ofDefault: DEFAULT_LAYER_OCTAVE,
    low: 'octave down', high: 'octave up',
    blurb: 'how far this layer is transposed, in whole octaves: 1 is the same note an octave up, -1 an octave down, 0 is in unison',
  },
  {
    id: 'detune', label: 'DETUNE', min: MIN_DETUNE, max: MAX_DETUNE, step: 1, ofDefault: DEFAULT_LAYER_DETUNE,
    low: 'flat', high: 'sharp',
    blurb: 'how far out of tune this layer sits, in cents: a few cents is warmth against another layer, a lot is a chorus or a beating pair',
  },
  {
    id: 'gain', label: 'GAIN', min: MIN_PARAM, max: MAX_PARAM, step: PARAM_STEP, ofDefault: DEFAULT_LAYER_GAIN,
    low: 'quiet', high: 'full',
    blurb: 'how loud this layer is inside the instrument, 0..100: 100 is full, so a layer stacked under others is the one to turn down',
  },
];

/** What a layer field is called and does, by id. */
export const LAYER_FIELD_BY_ID: Readonly<Record<LayerField, LayerFieldInfo>> =
  Object.fromEntries(LAYER_FIELDS.map((field) => [field.id, field])) as Record<LayerField, LayerFieldInfo>;

/** Clamp one layer field, the same way `clampParam` clamps a knob. */
export function clampLayerField(id: LayerField, value: number): number {
  if (id === 'octave') return clampOctave(value);
  if (id === 'detune') return clampDetune(value);
  return clampLayerGain(value);
}

// --- the sounds you saved ---------------------------------------------------

/**
 * A sound the user saved and named: `MYPAD`, `WARM STRINGS`.
 *
 * The presets in `voice.ts` cover the jobs a first song has; this is the escape
 * hatch for the sound that is not quite any of them. It is deliberately the SAME
 * shape as a channel's sound — a voice, and the layers above it — so everything
 * that already deals with a sound (applying one, copying it, comparing two for
 * equality) deals with these too, and "use my saved pad" is the same act as "use
 * pad".
 *
 * It lives HERE rather than in `voice.ts` because a saved sound is a PATCH: it is
 * the one place in the app that has both halves, and it is the file that already
 * owns the layer tables. `voice.ts` stays the narrower thing it says it is — one
 * layer's worth of sound — and can therefore say nothing about a stack.
 *
 * A name is ONE WORD of letters, digits, `-` and `_`, because a script addresses
 * a sound as a single token: `track 1 voice MYPAD`. A name with a space in it
 * would be a sound a script could never reach, which is the sort of quiet
 * asymmetry this app tries not to have.
 */
export interface UserVoice {
  /** Upper-cased and one word, the way a channel name is. */
  name: string;
  /** Layer 1: what the sound was when nobody had stacked anything. */
  params: VoiceParams;
  /**
   * Layers 2..4, exactly as a `Track` carries them. EMPTY on every sound saved
   * before this field existed, which is what keeps one a plain voice.
   */
  stack: Layer[];
}

/**
 * How many saved voices a library may hold.
 *
 * A ceiling rather than a limit anyone will reach: it is here so a corrupt or
 * hostile `localStorage` value cannot grow without bound, and so the menu's list
 * stays a list rather than an archive.
 */
export const MAX_USER_VOICES = 24;

/** A saved sound as the sound it is, so one rule can compare or label either. */
export function savedSound(voice: UserVoice): StackedSound {
  return { voice: voice.params, stack: voice.stack };
}

/**
 * True when two whole sounds are the same: their voices, and every layer above.
 *
 * The question the F4 menu asks to find the row a channel is on, and the one the
 * channel list asks to name a chip. Asked of PATCHES rather than of the fields,
 * so there is one definition of "the same sound" in the app and a stack cannot
 * be equal to another one by a comparison that forgot to look at its layers.
 */
export function sameSound(a: StackedSound, b: StackedSound): boolean {
  return samePatch(patchForTrack(a), patchForTrack(b));
}

/**
 * True when a saved sound's own sound is exactly this one.
 *
 * The reverse direction of `savedSound`, for the callers that hold a sound and
 * want to know whether the library already has it.
 */
export function soundMatchesSaved(sound: StackedSound, saved: UserVoice): boolean {
  return sameSound(sound, savedSound(saved));
}

/** The saved voice with this name, however it is spelled. */
export function userVoiceFromName(text: string, library: readonly UserVoice[]): UserVoice | null {
  const want = tidyVoiceName(text);
  return library.find((voice) => voice.name === want) ?? null;
}

/** The saved voices' names, for an error message that lists them. */
export function userVoiceNames(library: readonly UserVoice[]): string {
  return library.map((voice) => voice.name).join(', ');
}

/**
 * Add a sound, or replace the one that already has that name.
 *
 * Replacing is deliberate: saving a tweaked `MYPAD` over `MYPAD` is the common
 * case (you iterated), and asking "overwrite?" for a sound you are still dialing
 * in is the kind of dialog this app does without. The cap is on NEW names only,
 * so a full library can still be edited.
 */
export function withUserVoice(library: readonly UserVoice[], voice: UserVoice): UserVoice[] {
  const kept = library.filter((entry) => entry.name !== voice.name);
  if (kept.length >= MAX_USER_VOICES) return library.slice();
  return [
    ...kept,
    { name: voice.name, params: copyVoice(voice.params), stack: voice.stack.map(copyLayer) },
  ];
}

/** The library without the named voice, for a DELETE. */
export function withoutUserVoice(library: readonly UserVoice[], name: string): UserVoice[] {
  return library.filter((entry) => entry.name !== tidyVoiceName(name));
}

/** A layer with its own numbers, so no two holders of one share a nested object. */
export function copyLayer(layer: Layer): Layer {
  return { ...layer };
}

/** A channel's whole sound, copied — what applying a saved sound hands over. */
export function copySound(sound: StackedSound): StackedSound {
  return { voice: copyVoice(sound.voice), stack: sound.stack.map(copyLayer) };
}

/**
 * Read a saved library out of untrusted storage, and drop anything wrong with it.
 *
 * Deliberately the opposite policy from a SONG FILE, which reports every
 * problem and refuses the lot: `localStorage` is shared with the origin, edited
 * by hand, and outlives the build that wrote it, and a stale entry must not cost
 * the user the other eleven. So an entry that cannot be read is dropped, a knob
 * out of range is clamped, and a duplicate name keeps the first. A sound whose
 * LAYERS are unreadable keeps the layers that could be read, because a stack is
 * an addition to a sound rather than a thing that can invalidate it.
 */
export function parseUserVoices(raw: unknown): UserVoice[] {
  if (!Array.isArray(raw)) return [];
  const out: UserVoice[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_USER_VOICES) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const fields = entry as Record<string, unknown>;
    if (typeof fields.name !== 'string') continue;
    const name = tidyVoiceName(fields.name);
    if (name === '' || voiceNameProblem(name, out) !== null) continue;
    const params = readStoredParams(fields.params);
    if (!params) continue;
    out.push({ name, params, stack: readStoredStack(fields.stack) });
  }
  return out;
}

/**
 * One stored voice: a waveform and nine clamped knobs, or null.
 *
 * Lenient on purpose (see `parseUserVoices`): a missing knob takes the neutral
 * default, and anything unreadable is clamped rather than refused, because the
 * alternative is throwing away a sound the user dialed in by hand.
 */
function readStoredParams(raw: unknown): VoiceParams | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const fields = raw as Record<string, unknown>;
  const wave = typeof fields.wave === 'string' ? waveFromName(fields.wave) : null;
  if (!wave) return null;
  const params: VoiceParams = { ...DEFAULT_VOICE, wave };
  for (const param of VOICE_PARAMS) {
    const value = fields[param.id];
    if (typeof value === 'number' && Number.isFinite(value)) params[param.id] = clampParam(value);
  }
  return params;
}

/**
 * A stored sound's layers, or none.
 *
 * A layer whose WAVE cannot be read is dropped — a layer with no shape has no
 * sound to make — while a missing or unreadable value takes the neutral default,
 * exactly as a stored voice's does. The stack is capped at what a channel can
 * play, so a hand-edited storage value cannot produce a sound the engine has no
 * room for.
 */
function readStoredStack(raw: unknown): Layer[] {
  if (!Array.isArray(raw)) return [];
  const out: Layer[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_EXTRA_LAYERS) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const fields = entry as Record<string, unknown>;
    const wave = typeof fields.wave === 'string' ? waveFromName(fields.wave) : null;
    if (!wave) continue;
    const layer = neutralLayer(wave);
    for (const param of VOICE_PARAMS) {
      const value = fields[param.id];
      if (typeof value === 'number' && Number.isFinite(value)) layer[param.id] = clampParam(value);
    }
    if (typeof fields.octave === 'number') layer.octave = clampOctave(fields.octave);
    if (typeof fields.detune === 'number') layer.detune = clampDetune(fields.detune);
    if (typeof fields.gain === 'number') layer.gain = clampLayerGain(fields.gain);
    out.push(layer);
  }
  return out;
}

/**
 * Three characters for a channel row's sound chip.
 *
 * The chip is about 24px wide, which fits three capital letters — the same
 * budget the waveform chip has always had. A named preset shows its own first
 * three letters (`PAD`, `STR`, `SNA`), a SAVED sound shows its own (`WAR` for
 * `WARM-KEYS`), and a sound with no name at all falls back to its WAVEFORM
 * (`SQR`) — which is then the only honest shorthand there is.
 *
 * The whole SOUND is what is looked up, not just its voice: a channel playing a
 * saved supersaw must wear that sound's name and not the name of whichever plain
 * voice happens to share its first layer. The library is passed in rather than
 * imported, because it lives in the browser: the model stays pure, and a caller
 * with no library gets the preset names and the waveforms, which is exactly what
 * it can know.
 */
export function soundShortLabel(sound: StackedSound, library: readonly UserVoice[] = []): string {
  if (sound.stack.length === 0) {
    const name = voiceNameFor(sound.voice);
    if (name !== 'custom') return name.slice(0, 3).toUpperCase();
  }
  const saved = library.find((entry) => soundMatchesSaved(sound, entry));
  return (saved ? saved.name : WAVE_LABELS[sound.voice.wave]).slice(0, 3);
}

/** Whether a saved sound is more than its voice, for the list's own mark. */
export function savedStackChip(voice: UserVoice): string {
  return stackChip(savedSound(voice));
}

