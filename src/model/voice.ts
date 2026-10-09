/**
 * voice — what a channel SOUNDS like: the shape, and nine knobs that turn a
 * wave into an instrument.
 *
 * This is the half of music software that usually loses beginners. A synth tells
 * you to set an oscillator, an ADSR, a filter cutoff, a detune and a noise
 * amount, in units you have never heard of, and then plays a note. Tracklet's
 * answer is two layers, and they are the same layer twice:
 *
 *   • A VOICE, named after what it is FOR — `pad`, `pluck`, `bell`, `hat`. One
 *     word in a script, one row in the F4 menu, and a channel stops sounding
 *     like a buzzer and starts sounding like an instrument. Each one carries a
 *     one-line blurb, the way a scale does, because the point is to learn by
 *     choosing.
 *   • Nine PERCENTAGES, named after what you HEAR rather than what the machine
 *     does: `bright`, `sweep`, `duty`, `noise`, `attack`, `decay`, `ring`,
 *     `release`, `thick`. 0 to 100, so the worst case is that you slide one to
 *     the wrong end and slide it back. Nothing here can make a sound that is
 *     silent, painful or invalid: the range IS the guarantee.
 *
 * ── Why percentages ──────────────────────────────────────────────────────────
 * `bright 70` can be mapped onto a filter, re-mapped onto a different filter,
 * or dropped entirely by a future engine, and the SONG does not change. A file
 * that says "1460 Hz" is a file that knows how the synth is built; one that says
 * "bright" is a file that knows how the music sounds. It also gives every knob a
 * human scale with two named ends — dark…bright, pluck…pad — which is what makes
 * one dialable by ear alone.
 *
 * ── Which knob to reach for ──────────────────────────────────────────────────
 * `bright` is the low-pass: low is a muffled, closed sound, high is a buzzing,
 * open one. `sweep` is how far that low-pass MOVES over a note — flat is a
 * steady tone, high opens wide and closes down, which is the difference between
 * a plain tone and a pluck, a wah or a bowed swell. `duty` narrows the square
 * wave into a pulse, which is the whole spectrum of chip lead sounds in one knob
 * (see below). `attack`, `decay`, `ring` and
 * `release` are the note's LIFE: how fast it rises to full level (`attack`), how
 * long it takes to fall from there to the level it holds (`decay`), how much it
 * holds (`ring` — READ IT WITH `hold`, which is how LONG the note is: `hold` is
 * the note, `ring` is the instrument), and how long it keeps ringing after it
 * ends (`release`). Together those four are the whole ADSR a synth asks for,
 * named after what you hear rather than four letters. `noise` mixes in hiss,
 * which is how drums, breath and wind are made out of a tone. `thick` detunes a
 * second copy of the wave, which is the cheapest way to sound like more than one
 * player and is the reason a `pad` is wide and a `sub` is not.
 *
 * ── Pulse duty, and why it is the shape knob for the chiptune shelf ──────────
 * A square wave is a pulse that is 50% on and 50% off, and that is only one of
 * the shapes a pulse can take: at 25% it is nasal and reedy, at 12.5% it is the
 * thin metallic buzz of a NES or Game Boy lead. `duty` is the amount from the
 * thin end (0 = a 12.5% pulse) to the square (100 = the familiar hollow 50%),
 * and it is the ONE control that separates a chip lead from a normal synth
 * lead. It is only heard on a `square` wave — the other three shapes have no
 * duty to set — so a channel with `wave triangle` simply ignores it, exactly as
 * a `bright` of 0 is nearly inaudible on a sine.
 *
 * Phaser-free on purpose, like the rest of `model/`: the script, the file
 * formats, the F4 menu and the audio engine all read this one table, so a knob
 * cannot exist in the UI and not in the language.
 */

/**
 * The shapes a channel can sound with.
 *
 * The first four are the tonal waves. The rest are the chip SOURCES: `noise` is
 * the noise channel, a shift register whose pitch sets how coarsely it grits;
 * `table` is a wavetable, a periodic waveform whose shape `duty` selects;
 * `sample` is a ONE-SHOT — a short built-in sample, played once, whose pitch
 * follows the note; `fm` is FREQUENCY MODULATION, a second oscillator bending
 * the first one's pitch, whose depth `duty` sets; `string` is a PLUCKED STRING,
 * a Karplus-Strong model whose damping `duty` sets; `formant` is a VOWEL, a
 * glottal tone shaped by three resonant peaks, which vowel `duty` picks; and
 * `organ` is a DRAWBAR ORGAN, additive tonewheels whose registration `duty`
 * picks; `granular` is a GRAIN CLOUD, the note broken into short grains whose
 * character `duty` picks; `font` is a SOUNDFONT, somebody else's recordings
 * played back by key range, whose preset `duty` picks; `reed` is a REED, an
 * exciter buzzing through a resonant tube, whose character `duty` picks; and
 * `brass` is a LIP, the same exciter blown as a brass instrument, whose character
 * `duty` picks; `bow` is a BOWED STRING, a stick-slip exciter driving a hollow
 * body, whose character `duty` picks; `mallet` is a STRUCK BAR, a hit whose
 * overtones are inharmonic, whose character `duty` picks; and `membrane` is a
 * STRUCK SKIN, a drum hit whose dense inharmonic overtones and drooping pitch
 * `duty` picks; and `plate` is a STRUCK PLATE, a bell or a gong whose few spread
 * partials ring longest of all, whose character `duty` picks. All are last so the
 * four melodic shapes keep the order and the meaning they always had.
 */
export type Wave =
  | 'square' | 'triangle' | 'sawtooth' | 'sine'
  | 'noise' | 'table' | 'sample' | 'fm' | 'string' | 'formant' | 'organ' | 'granular' | 'font'
  | 'reed' | 'brass' | 'bow' | 'mallet' | 'membrane' | 'plate';

export const WAVES: readonly Wave[] = ['square', 'triangle', 'sawtooth', 'sine', 'noise', 'table', 'sample', 'fm', 'string', 'formant', 'organ', 'granular', 'font', 'reed', 'brass', 'bow', 'mallet', 'membrane', 'plate'];

/**
 * The TONAL shapes, and the cycle a brand-new channel walks.
 *
 * Deliberately without `noise`: a new song's channels 1–8 must sound exactly as
 * they did before chip noise existed, so the default cycle stays the four
 * melodic waves and noise is reached on purpose (a click through the waveform
 * chip, or `wave noise`).
 */
const DEFAULT_WAVE_CYCLE: readonly Wave[] = ['square', 'triangle', 'sawtooth', 'sine'];

/** Three-letter labels, for a channel row that is only ~140px wide. */
export const WAVE_LABELS: Readonly<Record<Wave, string>> = {
  square: 'SQR', triangle: 'TRI', sawtooth: 'SAW', sine: 'SIN',
  noise: 'NOI', table: 'TAB', sample: 'SMP', fm: 'FM', string: 'STR', formant: 'FRM', organ: 'ORG',
  granular: 'GRN', font: 'FNT', reed: 'RED', brass: 'BRS', bow: 'BOW', mallet: 'MLT', membrane: 'MEM', plate: 'PLT',
};

/**
 * One line per shape, in the same voice a voice's blurb uses.
 *
 * Kept beside the label and the spelling table so the F4 menu, the catalog and
 * the docs all read the same sentence about a shape rather than three that
 * drift apart. The blurbs are what an agent reads to decide a wave, so they say
 * what the shape is FOR, not what it is made of.
 */
export const WAVE_BLURBS: Readonly<Record<Wave, string>> = {
  square: 'a hollow pulse; the default chip lead, and a full 50% square at duty 100',
  triangle: 'soft and hollow — the cleanest bass and the mellowest pad',
  sawtooth: 'bright and reedy — aggressive leads, chords and strings',
  sine: 'pure and round — sub bass, soft pads and clean tones',
  noise: 'the chip noise channel: a shift register that grits rather than rings (drums, breath, wind)',
  table: 'a chip wavetable: a periodic wave whose shape duty picks from a fixed bank',
  sample: 'a one-shot: a short built-in sound the note triggers, pitched by the note',
  fm: 'two-operator FM: a sine carrier bent by a second oscillator, depth set by duty',
  string: 'a plucked string: a noise burst ringing through a delay line (Karplus-Strong), damping set by duty',
  formant: 'a vowel: a glottal tone shaped by three resonant peaks (formants), the vowel picked by duty',
  organ: 'a drawbar organ: additive tonewheels summed from the footages, the registration picked by duty',
  granular: 'a grain cloud: the note chopped into short windowed grains, the character picked by duty',
  font: 'a soundfont: somebody else\u2019s recordings, played back by key range, the preset picked by duty',
  reed: 'a reed: a buzzing exciter driving a resonant tube — a clarinet, an oboe, a sax and their cousins, the character picked by duty',
  brass: 'a brass instrument: a lip buzzing into a flared metal bore — a trumpet, a trombone, a horn and their cousins, the character picked by duty',
  bow: 'a bowed string: a bow dragging a string into a hollow body — a violin, a viola, a cello and their cousins, the character picked by duty',
  mallet: 'a struck bar: a hit whose overtones are inharmonic — a marimba, a xylophone, a vibraphone, a glockenspiel and their cousins, the character picked by duty',
  membrane: 'a struck skin: a drum hit whose dense overtones thud and whose pitch droops — a tom, a timpani, a conga, a tabla and their cousins, the character picked by duty',
  plate: 'a struck plate: a bell or a gong whose few overtones ring longest of all — a bell, a chime, a gong, a tam-tam and their cousins, the character picked by duty',
};

/** The shape a channel starts with, cycling so four channels differ. */
export function waveForTrack(index: number): Wave {
  return DEFAULT_WAVE_CYCLE[((index % DEFAULT_WAVE_CYCLE.length) + DEFAULT_WAVE_CYCLE.length) % DEFAULT_WAVE_CYCLE.length];
}

/** The next shape in the cycle, for a click-to-cycle chip. */
export function nextWave(wave: Wave): Wave {
  return WAVES[(WAVES.indexOf(wave) + 1) % WAVES.length];
}

/** True when text names a wave — the script parser's spelling check. */
export function isWaveName(text: string): boolean {
  return waveFromName(text) !== null;
}

/**
 * Accept the spellings a person (or a model) actually writes, and nothing more:
 * `saw` is far more likely than `sawtooth`, and both mean the same thing.
 * `noise` (and `lfsr`, its machine name) reads as the noise channel, `table`
 * (and `wavetable`) as the wavetable, `sample` (and `smpl`) as a one-shot, `fm`
 * as frequency modulation, `string` (and `karplus`) as a plucked string,
 * `formant` (and `vowel`) as a vowel, `organ` (and `drawbar`) as a drawbar organ,
 * `granular` (and `grain`) as a grain cloud, `font` (and `soundfont`) as a
 * soundfont, `reed` (and `reeds`) as a reed, `brass` (and `brasses`) as a brass
 * instrument, `bow` (and `bowed`) as a bowed string, `mallet` (and `struck`) as a
 * struck bar, `membrane` (and `skin`) as a struck skin and `plate` as a struck
 * plate — which is why a channel named after any of them must have its wave
 * written deliberately.
 */
export function waveFromName(text: string): Wave | null {
  switch (text.trim().toLowerCase()) {
    case 'square': case 'sqr': case 'pulse': return 'square';
    case 'triangle': case 'tri': return 'triangle';
    case 'sawtooth': case 'saw': return 'sawtooth';
    case 'sine': case 'sin': return 'sine';
    case 'noise': case 'lfsr': return 'noise';
    case 'table': case 'wavetable': case 'wave': return 'table';
    case 'sample': case 'smpl': case 'oneshot': case 'one-shot': return 'sample';
    case 'fm': case 'fmsynth': case 'freqmod': return 'fm';
    case 'string': case 'str': case 'karplus': case 'karplus-strong': return 'string';
    case 'formant': case 'vowel': case 'vowels': case 'vox': return 'formant';
    case 'organ': case 'drawbar': case 'drawbars': case 'tonewheel': case 'hammond': return 'organ';
    case 'granular': case 'grain': case 'grains': case 'cloud': return 'granular';
    case 'font': case 'soundfont': case 'sf2': case 'sfz': return 'font';
    case 'reed': case 'reeds': return 'reed';
    case 'brass': case 'brasses': return 'brass';
    case 'bow': case 'bowed': case 'bowed-string': return 'bow';
    case 'mallet': case 'mallets': case 'struck': return 'mallet';
    case 'membrane': case 'membranes': case 'skin': return 'membrane';
    case 'plate': case 'plates': return 'plate';
    default: return null;
  }
}

// --- the nine knobs ---------------------------------------------------------

/** The knobs, as the ids the model, the script and the menu all use. */
export type VoiceParamId =
  | 'bright' | 'sweep' | 'duty' | 'noise'
  | 'attack' | 'decay' | 'ring' | 'release'
  | 'thick';

export interface VoiceParam {
  id: VoiceParamId;
  /** What the menu and the docs call it. */
  label: string;
  /** The word at 0, and the word at 100 — a knob you can read. */
  low: string;
  high: string;
  /** One line, for the menu's help text and for an agent deciding a value. */
  blurb: string;
  /** Extra spellings a script may use for the same knob. */
  aliases: readonly string[];
}

/**
 * The nine knobs, in the order the menu shows them: the four that change a
 * note's SHAPE, then the four that shape its LIFE (the ADSR), then width.
 *
 * `hold` is deliberately not one of them. A note's LENGTH is part of the music
 * (it belongs to the channel's part, and a script writes it next to the notes);
 * a note's TONE is part of the instrument. Keeping them apart is what lets a
 * `pad` voice play a long chord without every voice having to invent a length.
 */
export const VOICE_PARAMS: readonly VoiceParam[] = [
  {
    id: 'bright', label: 'BRIGHT', low: 'dark', high: 'bright', aliases: ['tone', 'brightness', 'filter'],
    blurb: 'how open the sound is: low is muffled and warm, high is buzzing and cutting',
  },
  {
    id: 'sweep', label: 'SWEEP', low: 'flat', high: 'wah', aliases: ['filter-env', 'filterenv', 'env'],
    blurb: 'how far the brightness MOVES over a note: flat is a steady tone, high opens wide then closes down for a wah or a pluck',
  },
  {
    id: 'duty', label: 'DUTY', low: 'thin', high: 'hollow', aliases: ['pulse-width', 'pulsewidth'],
    blurb: 'how narrow a pulse wave is: a thin metallic buzz at 0, the full hollow square at 100 (only a square wave hears it)',
  },
  {
    id: 'noise', label: 'NOISE', low: 'pure', high: 'noisy', aliases: ['hiss', 'air'],
    blurb: 'how much hiss is mixed in: this is what turns a tone into a drum, a breath or wind',
  },
  {
    id: 'attack', label: 'ATTACK', low: 'instant', high: 'slow', aliases: ['fade', 'swell'],
    blurb: 'how fast a note reaches full volume: instant is a pluck or a hit, slow is a bow or a pad',
  },
  {
    id: 'decay', label: 'DECAY', low: 'snappy', high: 'slow', aliases: ['fall', 'fade-out'],
    blurb: 'how long a note takes to fall from its attack peak to the level it holds (see ring)',
  },
  {
    id: 'ring', label: 'RING', low: 'pluck', high: 'pad', aliases: ['sustain', 'hold-level'],
    blurb: 'the level a note HOLDS while it sounds: low is a pluck that dies away, high a pad that stays',
  },
  {
    id: 'release', label: 'RELEASE', low: 'tight', high: 'long', aliases: ['tail', 'ring-out'],
    blurb: 'how long a note keeps ringing once it ends: tight stops it dead, long lets it tail away',
  },
  {
    id: 'thick', label: 'THICK', low: 'thin', high: 'wide', aliases: ['width', 'detune'],
    blurb: 'a slightly out-of-tune second copy of the wave: a little is warmth, a lot is a wide pad',
  },
];

/** What every knob means, by id, for a caller that only has the id. */
export const VOICE_PARAM_BY_ID: Readonly<Record<VoiceParamId, VoiceParam>> =
  Object.fromEntries(VOICE_PARAMS.map((param) => [param.id, param])) as Record<VoiceParamId, VoiceParam>;

/** The lowest and highest a knob goes. Both ends are always a real sound. */
export const MIN_PARAM = 0;
export const MAX_PARAM = 100;
/** The step a click, an arrow or a script nudge moves a knob by. */
export const PARAM_STEP = 10;

/** One channel's whole sound. */
export interface VoiceParams {
  wave: Wave;
  bright: number;
  /** How far the filter MOVES over a note, 0..100: 0 is a steady tone, 100 a big sweep. */
  sweep: number;
  /** How narrow a pulse is, 0..100: 0 is a thin 12.5% pulse, 100 the full 50% square. */
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

/**
 * The sound a channel has when nobody has chosen one.
 *
 * Deliberately close to what the app sounded like before voices existed: a
 * mostly-bright wave with a gentle decay. Every shipped example song sets only a
 * waveform, so this is what keeps them sounding the way they were written while
 * `voice pad` and friends become the upgrade.
 */
/**
 * `duty` defaults to the FULL square, which is the shape the square wave has
 * always been: a voice that says nothing about its duty is an un-narrowed pulse,
 * so every song written before this knob existed sounds exactly as it did.
 */
export const DEFAULT_VOICE: VoiceParams = {
  wave: 'square', bright: 70, sweep: 0, duty: 100, noise: 0,
  attack: 0, decay: 0, ring: 70, release: 0, thick: 0,
};

/** The sound a brand-new channel gets: the neutral one, shaped by its position. */
export function voiceForTrack(index: number): VoiceParams {
  return { ...DEFAULT_VOICE, wave: waveForTrack(index) };
}

export function copyVoice(voice: VoiceParams): VoiceParams {
  return { ...voice };
}

/** True when two sounds are the same — what the menu uses to name a channel. */
export function sameVoice(a: VoiceParams, b: VoiceParams): boolean {
  return a.wave === b.wave
    && a.bright === b.bright && a.sweep === b.sweep && a.duty === b.duty && a.noise === b.noise
    && a.attack === b.attack && a.decay === b.decay && a.ring === b.ring && a.release === b.release
    && a.thick === b.thick;
}

/** Clamp a knob into 0..100. The range is the safety guarantee, so it never throws. */
export function clampParam(value: number): number {
  if (!Number.isFinite(value)) return MIN_PARAM;
  return Math.max(MIN_PARAM, Math.min(MAX_PARAM, Math.round(value)));
}

// --- the voices -------------------------------------------------------------

/**
 * The families a voice belongs to, in the order the menu lists them.
 *
 * A family is not a setting; it is a HINT, for a person scanning the list and
 * for an agent deciding which channels to point at what. "Put a `bass` voice on
 * the channel playing low root notes" is the kind of sentence this table exists
 * to make sayable.
 */
export type VoiceFamily = 'lead' | 'bass' | 'harmony' | 'percussion';

/**
 * One family of voices, with the heading the F4 list shows over it and a line
 * saying what the family is FOR.
 *
 * Centralized here rather than in the menu because the family is a fact about
 * the instrument vocabulary, and an agent reading the catalog and a person
 * reading the list are asking the same question — so one table answers both.
 */
export interface VoiceFamilyInfo {
  id: VoiceFamily;
  /** The heading, short enough to fit a menu row. */
  heading: string;
  /** One line, for the catalog and an agent choosing a channel's job. */
  blurb: string;
}

/** The families in the order the menu lists them. */
export const VOICE_FAMILIES: readonly VoiceFamilyInfo[] = [
  { id: 'lead', heading: 'LEAD', blurb: 'melodies and hooks: the part you hum' },
  { id: 'bass', heading: 'LOW', blurb: 'the bottom: root notes that lock with the drums' },
  { id: 'harmony', heading: 'HARMONY', blurb: 'chords, pads and sustained background' },
  { id: 'percussion', heading: 'DRUMS', blurb: 'rhythm: hits, ticks and weather' },
];

/** What a family reads as, by id, for a caller that only has the id. */
export const VOICE_FAMILY_BY_ID: Readonly<Record<VoiceFamily, VoiceFamilyInfo>> =
  Object.fromEntries(VOICE_FAMILIES.map((family) => [family.id, family])) as Record<VoiceFamily, VoiceFamilyInfo>;

export interface Voice {
  id: string;
  /** What the menu and a script call it: `pad`. */
  label: string;
  family: VoiceFamily;
  /** One line, in the same voice as a scale's blurb. */
  blurb: string;
  params: VoiceParams;
}

/**
 * The voices, grouped by what they are for.
 *
 * About a dozen, and that ceiling is the design. A preset list that runs to
 * hundreds is a list nobody reads and everybody scrolls; these cover the four
 * jobs a first song has — a lead, a bass, harmony, and drums — with enough
 * variety inside each job to be worth hearing. Every one is reachable in a
 * script by its label, and every label is a word a musician already knows.
 */
export const VOICES: readonly Voice[] = [
  {
    id: 'lead', label: 'lead', family: 'lead',
    blurb: 'a square lead that cuts through and holds its note',
    params: { wave: 'square', bright: 70,  duty: 100, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 65, release: 0, thick: 20 },
  },
  {
    id: 'pluck', label: 'pluck', family: 'lead',
    blurb: 'a short bright string that dies away the moment it starts',
    params: { wave: 'sawtooth', bright: 80,  duty: 100, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 12, release: 0, thick: 10 },
  },
  {
    id: 'bell', label: 'bell', family: 'lead',
    blurb: 'glassy and ringing, like a music box or a vibraphone',
    params: { wave: 'sine', bright: 95,  duty: 100, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 60, release: 0, thick: 55 },
  },
  {
    id: 'glass', label: 'glass', family: 'lead',
    blurb: 'a fragile, shimmering triangle with a breath of hiss',
    params: { wave: 'triangle', bright: 90,  duty: 100, sweep: 0, noise: 12, attack: 8, decay: 0, ring: 85, release: 0, thick: 60 },
  },
  {
    id: 'bass', label: 'bass', family: 'bass',
    blurb: 'round and low — a triangle keeps the bottom clean',
    params: { wave: 'triangle', bright: 30,  duty: 100, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 85, release: 0, thick: 0 },
  },
  {
    id: 'sub', label: 'sub', family: 'bass',
    blurb: 'almost pure low end, for the floor under everything else',
    params: { wave: 'sine', bright: 12,  duty: 100, sweep: 0, noise: 0, attack: 5, decay: 0, ring: 95, release: 0, thick: 0 },
  },
  {
    id: 'pad', label: 'pad', family: 'harmony',
    blurb: 'slow, soft and wide: three notes that breathe together',
    params: { wave: 'sine', bright: 45,  duty: 100, sweep: 0, noise: 0, attack: 30, decay: 0, ring: 100, release: 0, thick: 35 },
  },
  {
    id: 'strings', label: 'strings', family: 'harmony',
    blurb: 'bowed and wide — a sawtooth that eases in rather than starting',
    params: { wave: 'sawtooth', bright: 55,  duty: 100, sweep: 0, noise: 0, attack: 25, decay: 0, ring: 95, release: 0, thick: 45 },
  },
  {
    id: 'organ', label: 'organ', family: 'harmony',
    blurb: 'steady and churchy: it switches on and stays exactly there',
    params: { wave: 'square', bright: 55,  duty: 100, sweep: 0, noise: 0, attack: 0, decay: 0, ring: 100, release: 0, thick: 0 },
  },
  {
    id: 'flute', label: 'flute', family: 'harmony',
    blurb: 'breathy: a sine with a little hiss and a soft start',
    params: { wave: 'sine', bright: 60,  duty: 100, sweep: 0, noise: 25, attack: 20, decay: 0, ring: 95, release: 0, thick: 0 },
  },
  {
    id: 'kick', label: 'kick', family: 'percussion',
    blurb: 'a low thump that gets out of the way immediately',
    params: { wave: 'sine', bright: 18,  duty: 100, sweep: 0, noise: 6, attack: 0, decay: 0, ring: 8, release: 0, thick: 0 },
  },
  {
    id: 'snare', label: 'snare', family: 'percussion',
    blurb: 'a noisy snap with a thump under it',
    params: { wave: 'triangle', bright: 45,  duty: 100, sweep: 0, noise: 75, attack: 0, decay: 0, ring: 22, release: 0, thick: 0 },
  },
  {
    id: 'hat', label: 'hat', family: 'percussion',
    blurb: 'a tick: almost all hiss, gone as soon as it arrives',
    params: { wave: 'square', bright: 100,  duty: 100, sweep: 0, noise: 90, attack: 0, decay: 0, ring: 6, release: 0, thick: 0 },
  },
  {
    id: 'wind', label: 'wind', family: 'percussion',
    blurb: 'pure hiss, for a build-up, a breakdown or weather',
    params: { wave: 'square', bright: 100,  duty: 100, sweep: 0, noise: 100, attack: 15, decay: 0, ring: 25, release: 0, thick: 0 },
  },
];

/** The voice with this id, or null. */
export function voiceById(id: string): Voice | null {
  return VOICES.find((voice) => voice.id === id) ?? null;
}

/**
 * Read a voice's name the way the script reads a waveform: forgiving about
 * spelling, strict about meaning.
 *
 * A voice that is guessed wrongly is worse than one that is refused, because a
 * wrong voice still plays — it just plays the wrong instrument, which is
 * invisible in a file and obvious only to an ear that is not listening for it.
 * So `pad` matches, `pads` and `strings section` do not.
 */
export function voiceFromName(text: string): Voice | null {
  const want = text.trim().toLowerCase();
  return VOICES.find((voice) => voice.label === want) ?? null;
}

/** The voices a script may name, for an error message that lists them. */
export const VOICE_NAMES = VOICES.map((voice) => voice.label).join(', ');

/**
 * The name of the voice a channel is set to, or `custom` when its knobs have
 * been moved off every preset.
 *
 * Derived rather than stored, which is why a tweaked `pad` cannot go on calling
 * itself a pad: the name is a fact about the numbers, not a label someone left
 * behind. It is also what lets the F4 menu show which preset a channel started
 * from without keeping a second copy of the truth.
 */
export function voiceNameFor(params: VoiceParams): string {
  return VOICES.find((voice) => sameVoice(voice.params, params))?.label ?? 'custom';
}

// --- naming your own instruments --------------------------------------------

/**
 * The names a saved SOUND may wear.
 *
 * Only the naming rules live here, because a name is about what a person types
 * into a one-line box and what a script can say in one token — none of which
 * depends on what the sound is made of. The saved sounds themselves are patches,
 * so they live in `instrument.ts` with the layers they are built from; this file
 * is the one layer's worth of sound that a name is attached TO.
 *
 * A name is ONE WORD of letters, digits, `-` and `_`, because a script addresses
 * a sound as a single token: `track 1 voice MYPAD`. A name with a space in it
 * would be a sound a script could never reach, which is the sort of quiet
 * asymmetry this app tries not to have.
 */
export const MAX_VOICE_NAME = 12;

/**
 * Anything carrying a name, which is all the naming rules below ever need.
 *
 * Structural rather than an import of the saved-sound TYPE, because a saved
 * sound is a patch and lives in `instrument.ts`: a name is about what a person
 * types into a box and what a script can say in one token, and neither depends
 * on what the sound is made of. A `UserVoice` satisfies this by being what it is.
 */
export interface NamedSound {
  readonly name: string;
}

/**
 * Trim and upper-case a typed name, and close up the spaces.
 *
 * `my warm pad` becomes `MY-WARM-PAD` rather than being refused. A person who
 * types two words into a box labelled "name" meant one name, and turning the
 * would-be separator into a hyphen is what they would have done themselves — the
 * same reasoning as upper-casing a channel name for them. The limit is checked
 * AFTER this, so an over-long name is still reported rather than silently cut.
 */
export function tidyVoiceName(text: string): string {
  return text.trim().replace(/\s+/g, '-').toUpperCase();
}

/**
 * Why a name cannot be used as it stands, or null when it can.
 *
 * Every message says the fix, because the caller puts it straight on screen:
 * the name is typed into a one-line box with no room for a second chance at
 * explaining itself. `ignore` is the name being edited, so keeping it as it is
 * does not count as a collision with itself.
 */
export function voiceNameProblem(
  name: string,
  library: readonly NamedSound[],
  ignore?: string,
): string | null {
  const tidy = tidyVoiceName(name);
  if (tidy === '') return 'a voice needs a name.';
  if (tidy.length > MAX_VOICE_NAME) {
    return `a voice name may be at most ${MAX_VOICE_NAME} characters; "${tidy}" is ${tidy.length}.`;
  }
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(tidy)) {
    return 'a voice name is one word of letters, digits, - or _ (so a script can say it).';
  }
  if (VOICES.some((voice) => voice.label.toUpperCase() === tidy)) {
    return `"${tidy}" is already one of the built-in voices. Pick another name.`;
  }
  if (library.some((voice) => voice.name === tidy && voice.name !== ignore)) {
    return `you already have a voice called "${tidy}". Pick another name, or save over it with the same name.`;
  }
  return null;
}

