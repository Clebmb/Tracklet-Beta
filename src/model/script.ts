/**
 * script — Tracklet Script, a small language for writing music as text.
 *
 * The point of a text notation is that something OTHER than a human hand can
 * write it: a model, a shell script, a generator. So this file is written for
 * machine authors as much as human ones, and the rules that follow from that
 * are the whole design:
 *
 *   • ONE STATEMENT PER LINE, positionally addressed. No nesting, no brackets,
 *     no punctuation to balance — a line is either understood or it is not.
 *
 *   • IT PARSES TO COMMANDS, THEN APPLIES THEM. Parsing never touches the song.
 *     A script with a mistake on line 40 changes NOTHING, and the caller gets
 *     40 error objects with line numbers. Half-applied music is worse than no
 *     music, because it lies about what went wrong.
 *
 *   • ATOMIC, TOO. Even the apply step works on a clone, so an unexpected
 *     runtime error cannot leave the song malformed.
 *
 *   • EVERY ERROR NAMES ITS LINE AND ITS FIX. An author that cannot read the
 *     screen can still read `line 7: "H-4" is not a note. Use A-G, optional
 *     # or b, optional octave, e.g. C-4`.
 *
 * The language is deliberately small (twenty-three words) and deliberately dull.
 * Tracklet Script is not a programming language; it is a recipe for a song, and
 * everything expressive happens in the MUSIC, not the syntax.
 *
 * It is also COMPLETE: everything the app can change about a song, a script can
 * set — its length (`steps`), its resolution (`beat`), its channels, their
 * sounds and levels, mutes, patterns and notes. Nothing about a song is
 * reachable only by hand. (The one exception is SOLO, which is not part of a
 * song at all but a way of listening to one.)
 *
 * PHASER-FREE and dependency-free, so the whole language is unit tested.
 */import {
  BOUNCE_ALL_WORD,
  BOUNCE_BARS_WORD,
  BOUNCE_TO_WORD,
  bounceReaches,
  type BounceRange,
} from './bounce';
import {
  LOUDNESS_MAX,
  LOUDNESS_MIN,
  LOUDNESS_OFF_WORD,
  LOUDNESS_WORD,
} from './loudness';
import { baseMidiForOctave, clampMidi, MIDI_MAX, MIDI_MIN } from './notes';
import {
  DEFAULT_PROGRESSION_HOLD,
  FOLLOW_WORD,
  MAX_PROGRESSION_HOLD,
  MAX_PROGRESSION_STEPS,
  MIN_PROGRESSION_HOLD,
  PROGRESSION_HOLD_WORD,
  PROGRESSION_NONE_WORD,
  progressionStartRows,
  progressionStepAt,
  progressionStepLabel,
  progressionStepNotes,
  progressionStepRoot,
  progressionStepSize,
  withProgressionSteps,
  type Progression,
} from './progression';
import {
  GENRE_WORD,
  genreFromName,
  genreNames,
} from './genre';
import {
  DEFAULT_ROLL_HITS,
  MAX_OCTAVE_SHIFT,
  MAX_ROLL_HITS,
  MIN_OCTAVE_SHIFT,
  MIN_ROLL_HITS,
  MIN_ROW_REPEAT,
  REVERSE_WORD,
  ROLL_WORD,
  ROW_RANGE_WORD,
  ROW_TRANSFORM_WORDS,
  repeatProblem,
  repeatRange,
  reverseRange,
  rollRange,
  rowRangeProblem,
  shiftRangeOctaves,
  type RowRange,
  type RowTransformId,
} from './rows';
import {
  CHORD_SPELLINGS,
  chordPitches,
  chordShape,
  DEFAULT_CHORD_DEGREES,
  degreeChord,
  MAX_CHORD_DEGREES,
  parseChordName,
  parseDegree,
  ARP_DIRECTIONS,
  ARP_WORD,
  arpDirectionFromName,
  arpNotes,
  chordGestureReply,
  DEFAULT_ARP_DIRECTION,
  MAX_ARP_STEPS,
  MIN_ARP_STEPS,
  type Arp,
  type ArpDirection,
  type ChordQuality,
} from './chord';
import {
  ARP_MODES,
  DEFAULT_ARP,
  clampArp,
  generateArp,
  type ArpMode,
  type ArpSettings,
} from './arp';
import {
  copyKey,
  keyName,
  parseKey,
  SCALE_SPELLINGS,
  type SongKey,
} from './scale';
import {
  copyVoice,
  clampParam,
  MAX_PARAM,
  MIN_PARAM,
  VOICE_NAMES,
  VOICE_PARAM_BY_ID,
  VOICE_PARAMS,
  voiceById,
  voiceFromName,
  waveFromName,
  type VoiceParamId,
  type VoiceParams,
  type Wave,
} from './voice';
import {
  clampLayerField,
  clearTrackLayer,
  DEFAULT_LAYER_GAIN,
  layerCount,
  layerPitchAllowed,
  LAYER_FIELDS,
  MAX_LAYERS,
  setTrackLayer,
  userVoiceFromName,
  userVoiceNames,
  copySound,
  savedSound,
  type Layer,
  type UserVoice,
} from './instrument';
import {
  AUTOMATION_TARGET_BY_ID,
  AUTOMATION_TARGET_WORDS,
  MAX_AUTOMATION_LANES,
  clampAutomationTrack,
  isAutomationTarget,
  withAutomationLane,
  type AutomationTargetId,
} from './automation';
import {
  GRID_NAME_LIST,
  gridShape,
  METER_UNIT_LIST,
  meterShape,
  type BarShape,
} from './grid';
import {
  arrangementBars,
  formUnarranged,
  MAX_REPEAT,
  MAX_SECTIONS,
  MIN_REPEAT,
  REPEAT_WORD,
  sectionNameProblem,
  sectionsNeverPlayed,
  tidySection,
  tidySectionName,
  withSection,
  type Section,
} from './sections';
import {
  busNameProblem,
  busNames,
  channelBusLevels,
  MAX_BUSES,
  NO_BUS_WORD,
  sameBusName,
  tidyBus,
  tidyBusName,
  withBus,
  type Bus,
} from './bus';
import { channelGain } from './mix';
import {
  clampRobin,
  clampTouch,
  MAX_TOUCH_BRIGHT,
  ROBIN_MAX,
  ROBIN_MIN,
  TOUCH_MAX,
  TOUCH_MIN,
} from './variation';
import { DRIFT_MAX, DRIFT_MIN, clampDrift } from './drift';
import { SPEED_MAX, SPEED_MIN, clampSpeed } from './speed';
import {
  articulationProblem,
  clampBend,
  clampGrace,
  clampStutter,
  DEFAULT_STUTTER,
  NO_ARTICULATION,
  STUTTER_CHAR,
  parseArticulation,
  type Articulation,
} from './articulation';
import { isThemeName, themeNameHint } from './themeNames';
import { isPageName, pageNameHint } from './pages';
import {
  MAX_LIVE_QUANTIZE,
  MAX_SCENES,
  MIN_LIVE_QUANTIZE,
  sceneNameProblem,
  sceneNameSpelling,
  tidySceneName,
  withScene,
  type Scene,
} from './scenes';
import { chipById, chipFromName, chipNames, chipVoiceFor, type ChipId } from './chip';
import { grooveFromName, grooveNames, type GrooveId } from './song';
import { drumFromName, drumNames, drumPitch, type DrumId } from './drum';
import { kitFromName, kitNameProblem, kitNames, tidyKitName, type KitName } from './kit';
import {
  addMachineBar,
  clampMachineBeat,
  clampMachineSteps,
  clampTune,
  countMachineHits,
  createMachine,
  DEFAULT_MACHINE_STEPS,
  defaultPad,
  machineBarCount,
  machineBarRows,
  MAX_MACHINE_BARS,
  MAX_MACHINE_BEAT,
  MAX_MACHINE_STEPS,
  MAX_PAD_NAME,
  MAX_PADS,
  MIN_MACHINE_BEAT,
  MIN_MACHINE_STEPS,
  padAt,
  parsePadPattern,
  removeMachineBar,
  resizeMachine,
  resizeRow,
  setMachineOrder,
  withMachineBar,
  withPad,
  type DrumPad,
} from './machine';
import { NO_SAMPLE_WORD, sameSampleName, sampleNameProblem, tidySampleName } from './sample';
import { FILTER_SHAPES, shapeFromName, shapeNames, type FilterShape } from './shape';
import {
  MAX_TAKE_SECONDS,
  type TakeLoopEdit,
  type TakeTrimEdit,
} from './take';
import { tuningFromName, tuningNames, type TuningId } from './tuning';
import {
  BPM_MAX,
  BPM_MIN,
  CELL_NOTE_SEPARATOR,
  DEFAULT_POLY,
  clampBpm,
  clampGlide,
  clampHold,
  clampLevel,
  clampPan,
  clampDuck,
  clampHumanize,
  clampPoly,
  clampRoom,
  clampEffect,
  clampEffects,
  clampSend,
  clampStrum,
  clampVibrato,
  clampRowsPerBeat,
  clampSwing,
  clampVelocity,
  copyPattern,
  countNotes,
  countSongNotes,
  createSong,
  ensurePattern,
  DEFAULT_VELOCITY,
  isSongTitleLength,
  isTrackNameLength,
  MAX_EFFECT,
  MAX_DUCK,
  MAX_HUMANIZE,
  MAX_CELL_NOTES,
  MAX_POLY,
  MAX_GLIDE,
  MAX_HOLD,
  MAX_LEVEL,
  MAX_VELOCITY,
  MAX_VIBRATO,
  MAX_ORDER,
  MAX_PATTERNS,
  MAX_TEMPO_POINTS,
  MAX_ROWS,
  MAX_PAN,
  MAX_ROOM,
  MAX_ROWS_PER_BEAT,
  MAX_SEND,
  MAX_STRUM,
  MAX_SONG_TITLE,
  MAX_TRACK_NAME,
  MIN_EFFECT,
  MIN_DUCK,
  MIN_HUMANIZE,
  MIN_POLY,
  MIN_GLIDE,
  MIN_PAN,
  MIN_ROOM,
  MIN_SEND,
  MIN_STRUM,
  MIN_VELOCITY,
  MIN_VIBRATO,
  ROWS_PER_BEAT,
  MAX_TRACKS,
  MIN_HOLD,
  MIN_LEVEL,
  MIN_ROWS,
  MIN_ROWS_PER_BEAT,
  MAX_SWING,
  MIN_SWING,
  MIN_TRACKS,
  patternRows,
  setCellDrum,
  setCellNotes,
  setOrder,
  setPatternRows,
  setTrackCount,
  TRACK_EFFECT_BY_ID,
  TRACK_EFFECTS,
  withTempoPoint,
  usedTracks,
  type ChannelEffects,
  type Song,
  type TrackEffectId,
} from './song';

// --- the language surface ---------------------------------------------------

/** Every word the language understands. Anything else is an error. */
export const SCRIPT_KEYWORDS: readonly string[] = [
  'new',
  // The other way to BEGIN, and the only statement that writes a script for you:
  // `start house` is a whole working skeleton, spliced in at that line. It sits
  // beside `new` because that is the question it answers — "what do I do first?"
  // — and because it begins with `new` itself: a starter REPLACES the song rather
  // than merging into it, so a song's meaning still never depends on what was on
  // screen. See `model/genre.ts` for why the skeletons are scripts.
  'start',
  'song', 'key', 'tempo', 'octave', 'beat', 'steps',
  // The two SUGAR words over `steps`/`beat`: they resolve a note value into that
  // pair and write it, so everything below them keeps seeing two plain numbers.
  'grid', 'meter',
  'tuning', 'swing', 'groove', 'speed',
  // The DRUM KIT, which is the other half of what a song sounds like: `groove`
  // says how the notes are played, and `kit` says what the drums ARE. It sits
  // here because it is a property of the record rather than of one part.
  'kit',
  // The DRUM MACHINE — the other half of what a song's rhythm is. `kit` says what
  // the four drums SOUND like; `machine` configures the INSTRUMENT that plays
  // them, with its own pads, its own step grid and its own mix, beside the
  // tracker's channels. It sits here because it is a property of the record rather
  // than of one part, and `pad` is its one lane — the pair travels together.
  'machine', 'pad',
  'chip', 'volume', 'reverb', 'echo', 'master',
  // A lane is a song-shaping statement rather than a channel setting: it names
  // BARS, and a bar is the song's unit. It sits after `master` because both are
  // instructions about the record rather than about one part.
  'automate',
  // And FORM, which is the other half of the same question (a lane says WHERE a
  // value goes; a section names the bars it goes across): `section` defines a
  // name for a group of bars, `arrange` writes the order out of those names.
  'section', 'arrange',
  // The LIVE page's SCENES: a pattern per channel you launch by hand. It sits with
  // the FORM words because it is the same kind of thing — a way of saying which
  // patterns play — and because a scene is a definition the app reads, not a
  // setting: `scene A 1 1 2 2` is stored in the song and performed later.
  'scene',
  // The chord LOOP a song hangs on, beside the other FORM word because it is the
  // same kind of thing: a definition the lines below can follow — `section` names
  // bars for `arrange` to lay out, and `progression` names chords for a follower
  // to write. Its two followers are MODIFIERS rather than words of their own
  // (`chord 0 3 follow`, `note 0 4 follow`), which keeps the language's own
  // preference: one new verb, two values in slots that already existed.
  'progression',
  // GROUPS, and they sit here rather than with the song-shaping words above
  // because a bus is about the CHANNELS: it is declared before the channels that
  // join it, the same order `tracks N` and `section` follow.
  'bus',
  'theme', 'instrument', 'solo', 'chords', 'hear',
  // The EXPORT REGION — the loop region, `export bars 8 to 15` — sits with the
  // session settings rather than with the song's own lines, because that is what
  // it is: a region is what you are DOING with a song, not what a song is. It is
  // written by a script, read by the two audio exports, and never carried by a
  // file, like `theme` and `solo` beside it.
  'export',
  // WHICH SCREEN IS SHOWING — the one word a script needs to drive the tabs it
  // just wrote into. A view setting like `theme`, not song data: a file never
  // carries it, so opening someone's song cannot move your screen, and the
  // master script can leave the app on the page the person wanted.
  'page',
  // HOW A LAUNCH LANDS — `live quantize 4` waits for the next four-bar line before
  // the launched scene takes over. A session setting like `page` beside it, because
  // a quantize is a way of PERFORMING the song and not part of the song, so no file
  // carries one. It sits after `page` because the two are the LIVE page's own
  // settings and are read together.
  'live',
  'tracks', 'track',
  // Which recording of YOURS a channel plays — a setting on the channel, like
  // `voice` and `bus`, and the one whose value is the app's rather than the
  // song's. It sits beside `track` because that is the only line it appears on.
  'sample',
  // A recording you CAPTURE, and the window you shape it through — `record HOOK`
  // takes one from the microphone, `record trim`/`record loop` move a take's
  // points. It sits beside `sample` because it is the same bargain one step
  // earlier: a take is APP state, never a song field, so a file carries no take
  // and the channel's `sample NAME` is still the only thing that reaches a song.
  'record',
  'layer', 'mute', 'unmute',
  'pattern', 'order', 'clear', 'copy',
  // A RANGE OF STEPS — the one grammar the language was missing (see
  // `model/rows.ts`). It sits with the pattern words because it acts on the
  // pattern `pattern` selected, the way `note` and `erase` do.
  'rows',
  'note', 'chord',
  // The ARP page's DIALS and its one write, beside `chord` because it is the
  // same run: `chord 0 1 Am arp up 8` spells the walk on the line, and `arp …`
  // stores the dials and lets `arp write 0 1 Am` perform the same arithmetic from
  // them. Additive — a song that never says `arp` stores nothing and writes no
  // version, and the inline modifier is untouched.
  'arp',
  // A DRUM is a hit on a kit channel: `drum 0 4 kick`. It sits beside `note`
  // because it is the same act — write ONE cell at a time — with the cell's sound
  // named instead of its pitch.
  'drum', 'erase',
];

/**
 * The chord modes the `chords` statement accepts, as words -> how many notes one
 * key writes.
 *
 * The numbers are the model's `DEFAULT_CHORD_DEGREES` (a triad) and its ceiling
 * (a seventh), so the language cannot drift from what the `CHORDS` button
 * cycles. `off` is not a refusal: it is how a script says "write single notes".
 */
/** The effect ids, as one sentence reads them: `drive, crush, cab, tape, ...`. */
const EFFECT_WORD_LIST = TRACK_EFFECTS.map((effect) => effect.id).join(', ');

const CHORD_MODE_WORDS: Readonly<Record<string, number>> = {
  off: 0, none: 0, single: 0, 0: 0,
  triad: DEFAULT_CHORD_DEGREES, triads: DEFAULT_CHORD_DEGREES, on: DEFAULT_CHORD_DEGREES, 3: DEFAULT_CHORD_DEGREES,
  '7th': MAX_CHORD_DEGREES, seventh: MAX_CHORD_DEGREES, sevenths: MAX_CHORD_DEGREES, 7: MAX_CHORD_DEGREES, 4: MAX_CHORD_DEGREES,
};

/** The octave range a script may set as its default. */
export const SCRIPT_OCTAVE_MIN = 0;
export const SCRIPT_OCTAVE_MAX = 7;

/** Tokens that mean "leave this step empty" wherever a pitch is expected. */
const EMPTY_TOKENS = new Set(['.', '..', '...', '-', '--', '---', '_']);

/**
 * A pitch: a letter, an optional accidental, an optional octave.
 *
 * The `-?` between the name and the octave is a SEPARATOR, not a sign — a
 * tracker writes `C-4`, and reading that as minus four was the first bug this
 * file had. So the octave is digits only, and `C4` and `C-4` both mean middle C
 * of octave 4.
 */
const PITCH_RE = /^([A-Ga-g])(#|b)?-?(\d+)?$/;

/**
 * Each natural letter's semitone, so a pitch is read with one lookup. Hoisted
 * out of `parsePitch` because a script with a thousand grid lines calls it a
 * thousand times.
 *
 * Accidentals are applied ARITHMETICALLY (+1 / -1) rather than looked up as a
 * spelled name. A table of the twelve sharp spellings has no `Db` in it, so
 * `indexOf` returned -1 and every flat -- `Db4`, `Eb4`, `Ab4`, `Bb3` -- came
 * out as one note, a semitone under the octave's C. Arithmetic also gets the
 * wrap cases right for free: `Cb4` is B-3 and `B#3` is C-4.
 */
const LETTER_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

export interface ScriptDiagnostic {
  /** 1-based line number, as the author counts them. */
  line: number;
  /** What is wrong, and what to write instead. */
  message: string;
}

export interface ScriptSummary {
  title: string;
  /** The key after the script ran, as a label: `D MINOR`. */
  key: string;
  bpm: number;
  patterns: number;
  /** How many bars the song plays: the length of the order after the script ran. */
  slots: number;
  tracks: number;
  /** How many steps each pattern has after the script ran. */
  steps: number;
  /** How many steps make one beat after the script ran. */
  stepsPerBeat: number;
  notes: number;
  /**
   * How many LIVE scenes the song has after the script ran.
   *
   * Reported because a scene is a definition rather than a note: a script that
   * wrote four of them has added nothing you can hear, and the summary is where a
   * reader finds out that the set they wrote is actually there.
   */
  scenes: number;
  /** Non-fatal observations: a channel nothing uses, a pattern with no notes. */
  advisories: string[];
}

/**
 * The things a script can set that are NOT part of the song.
 *
 * A song is notes, channels, tempo and structure. The master volume is a
 * property of the ROOM, not of the music — so it travels beside the song rather
 * than inside it, and `null` means "the script said nothing, leave the mix
 * alone". Everything else the app exposes lives in `Song` itself.
 */
export interface ScriptSettings {
  /** Master level in 0..1, or null to leave the current one untouched. */
  volume: number | null;
  /**
   * The octave the app is on. Absent when the script said nothing about it.
   *
   * `octave N` has always set the octave a BARE note letter is written in
   * (`C` means `C-4` at `octave 4`). It now also moves the app's own octave
   * control, so a script and the screen it just produced agree about which
   * octave you are playing in — which is the whole point of being able to say it.
   */
  octave?: number;
  /**
   * The channels to solo, by 1-based number. Absent when the script said nothing
   * about solo.
   *
   * An EMPTY array is a real value: `solo off` means "solo nothing", which is a
   * different instruction from saying nothing at all. Soloing is not part of the
   * song — it says how you are LISTENING — so it travels beside the song like the
   * master volume, and a file never carries it.
   */
  solo?: number[];
  /**
   * How many notes one key writes: 0 plain, 3 a triad, 4 a seventh. Absent when
   * the script said nothing about it.
   */
  chordDegrees?: number;
  /** Whether the app auditions notes as the cursor moves. Absent when unmentioned. */
  hearNotes?: boolean;
  /**
   * Which imported instrument `wave font` should play: a name or a 1-based
   * number, exactly as written. Absent when the script said nothing about it.
   *
   * The TEXT, not a resolved id, because resolving it needs the instrument list,
   * and the list lives in the scene rather than in the song. That is the same
   * division that makes `theme` safe: a script can ask, and the app decides what
   * the ask means. An unknown name is reported by the caller, not here — the
   * language has no way to know what you have imported, and pretending otherwise
   * would mean a parser that fails on a name that is perfectly good.
   */
  instrumentUse?: string;
  /**
   * `instrument import` was asked for, so the app should open the file picker.
   *
   * A flag rather than a path: a browser cannot read a path, and the file the
   * user picks does not exist until they pick it. It mirrors how a script asks
   * for anything else that needs a human — it says WHAT, not FROM WHERE.
   */
  instrumentImport?: boolean;
  /**
   * `instrument load <path>`: where the app should fetch a soundfont from.
   *
   * The URL TEXT as written, unresolved, for the same reason `instrumentUse` is
   * text: resolving it means fetching, and only the app can do that. A relative
   * path is resolved against the page's own address by `fetch`, which is what
   * makes `storage/soundfonts/dkc/<font>.sf2` the right way to spell one — see
   * `10-instruments.md` for how the kit's dev servers serve that folder.
   */
  instrumentLoad?: string;
  /** `sample load <path>`: where the app should fetch a recording from. */
  sampleLoad?: string;
  /** `sample import` was asked for, so the app should open the file picker. */
  sampleImport?: boolean;
  /**
   * `record NAME`: capture a take with this name. Last one wins.
   *
   * A take is APP state beside the bank, so this travels out in `settings`
   * exactly as `sampleLoad` does and the scene owns the microphone. A build with
   * no microphone refuses it in words rather than silently doing nothing — the
   * `export.audio` precedent, on the way in.
   */
  recordCapture?: string;
  /**
   * `record trim NAME START END`, in the order written.
   *
   * A LIST rather than one value, unlike the other session settings, because a
   * script may shape SEVERAL takes and each edit is about its own name: the
   * "last one wins" rule the scalars follow would drop every take but the last.
   */
  recordTrims?: TakeTrimEdit[];
  /** `record loop NAME START END`, in the order written. */
  recordLoops?: TakeLoopEdit[];
  /**
   * `record select NAME`: which take the RECORDER page shows.
   *
   * A session setting like `page` — which take you are looking at, not what the
   * song is — so no file carries it and it costs no undo step. A name the takes
   * do not have is reported rather than thrown, the way a missing `sample` is.
   */
  recordSelect?: string;
  /**
   * `arp hear on`: whether the ARP page auditions the run as its dials move.
   *
   * A session setting like `page` and `live quantize` — how you are LISTENING to
   * the song rather than what the song is — so it travels beside the song and no
   * file carries it. Absent when the script said nothing, which leaves the setting
   * where it is.
   */
  arpAudition?: boolean;
  /**
   * The look of the whole app, by theme id: `theme forge`. Absent when the
   * script said nothing about it.
   *
   * A THEME IS READING STATE, NOT SONG DATA, so it is handed back here rather
   * than living in `Song` — which is also what makes it safe. It is the one
   * setting that repaints every pixel, and the reason it can be scriptable at
   * all is that a FILE never carries it: opening someone's song cannot change
   * how your app looks, and only a script you chose to paste can.
   */
  theme?: string;
  /**
   * Which full screen the app shows: `page arranger`. Absent when the script
   * said nothing about the page, which leaves the screen where it is.
   *
   * A VIEW IS READING STATE, NOT SONG DATA, so it travels beside the song like
   * `theme` rather than living in `Song` — and, exactly like a theme, a FILE
   * never carries it, so opening someone's song cannot move your screen. The
   * TEXT, not a resolved page id, keeps the model free of the UI's type; the
   * parser has already refused a name this build does not know (see
   * `model/pages.ts`), so the scene only ever gets a page it can show.
   */
  page?: string;
  /**
   * How many bars a launch waits for: `live quantize 4`. Absent when the script
   * said nothing about it, which leaves the setting where it is.
   *
   * A SESSION setting on the same footing as `page` — how you PERFORM the song
   * rather than what the song is — so it travels beside the song and no file
   * carries it. `0` launches immediately and is stored as a value rather than an
   * absence, the way an empty `solo` is, because "right now" is an instruction.
   */
  liveQuantize?: number;
  /**
   * The bars an export renders: `export bars 8 to 15`, or `export all` for the
   * whole song. Absent when the script said nothing about a region.
   *
   * `null` is a real value and not an absence, the way an empty `solo` is: "the
   * whole song" is an instruction a script can give, and it is what a song that
   * was bounced once needs in order to be bounced whole again. Stored as WRITTEN
   * and fitted to the order by whoever uses it — see `model/bounce.ts`, which is
   * also where the reason lives: a region may be named above the `arrange` line
   * that makes the order long enough to hold it.
   */
  bounce?: BounceRange | null;
  /**
   * The loudness an export normalises to: `export loud -14`, or `export loud off`
   * for none. Absent when the script said nothing about a target.
   *
   * In LUFS, and measured rather than assumed — `audio/lufs.ts` is the arithmetic
   * and the place the claim about what the number means is written down. The same
   * absent/`null`/value distinction the region makes: `export loud off` is an
   * instruction and `undefined` is silence.
   */
  loud?: number | null;
}

/**
 * Why `volume` is the odd one out, and not optional like the four above.
 *
 * It is the only one of the five that a FILE carries (a song is notes and
 * structure; the master level is a property of the room), so `songToScript` and
 * `songToJson` have to be told explicitly what to write — and `null` there is the
 * instruction "do not mention it", not an absence. The other four never travel in
 * a file at all, so for them an absent field IS the instruction.
 */

export type ScriptApplyResult =
  | { ok: true; song: Song; summary: ScriptSummary; settings: ScriptSettings }
  | { ok: false; errors: ScriptDiagnostic[] };

// --- commands ---------------------------------------------------------------

/**
 * How a `chord` statement named the chord it wants.
 *
 * By name is absolute — `Am` means A C E wherever the song sits. By degree is
 * relative — `6` means "the sixth chord of the song's key", which is F A C in A
 * minor and so cannot be resolved until the key is known. A degree is therefore
 * left unresolved in the command and settled at APPLY time, once every earlier
 * `key` line has run.
 */
type ChordSpec =
  | { kind: 'name'; root: number; quality: ChordQuality }
  | { kind: 'degree'; degree: number };

/**
 * What a FOLLOWER writes: the progression's chords, or its roots.
 *
 * One command with a word rather than two commands, because the two do the same
 * arithmetic on the same rows and differ in one line — which is what makes them
 * `follow` on `chord` and `follow` on `note` instead of a verb of their own.
 */
type FollowerKind = 'chords' | 'roots';

type ScriptCommand =
  | { kind: 'new'; line: number }
  | { kind: 'title'; line: number; title: string }
  | { kind: 'key'; line: number; key: SongKey }
  | { kind: 'tempo'; line: number; bpm: number }
  | { kind: 'steps'; line: number; rows: number }
  | { kind: 'beat'; line: number; stepsPerBeat: number }
  // The two sugar words carry the RESOLVED pair rather than their own arguments:
  // they are a way of saying `steps`/`beat`, so by the time a command exists the
  // note values are gone and this is the same two numbers the plain words produce.
  | { kind: 'grid'; line: number; shape: BarShape }
  | { kind: 'meter'; line: number; shape: BarShape }
  | { kind: 'swing'; line: number; swing: number }
  | { kind: 'speed'; line: number; speed: number }
  | { kind: 'groove'; line: number; groove: GrooveId }
  | { kind: 'kit'; line: number; kit: KitName }
  | { kind: 'tuning'; line: number; tuning: TuningId }
  | { kind: 'chip'; line: number; chip: ChipId }
  | { kind: 'tempoPoint'; line: number; slot: number; bpm: number; slide: boolean }
  | { kind: 'volume'; line: number; volume: number }
  | { kind: 'reverb'; line: number; reverb: number }
  | { kind: 'echo'; line: number; echo: number }
  /**
   * `master drive 20 tilt 15`: the same effects on the WHOLE MIX.
   *
   * The same six words a `track` line takes, at the other end of the same graph,
   * which is the whole reason it is a statement of its own rather than six more
   * settings on an existing one: one vocabulary, two scopes, and no second word
   * for `drive` that would have to be learned.
   */
  | { kind: 'master'; line: number; effects: Partial<ChannelEffects> }
  /**
   * `automate 2 bright 15 95 bars 8 to 15`: move one value over a range of bars.
   *
   * One statement rather than a new keyword per knob, because a lane is a SHAPE
   * — a target, two ends and a range — and every target has the same shape. The
   * bars are slots of the `order`, 1-based, the same numbers `order` and
   * `tempo … at BAR` use.
   */
  | {
      kind: 'automate'; line: number; track: number; target: AutomationTargetId;
      from: number; to: number; startBar: number; endBar: number;
    }
  /**
   * `section VERSE 1 1 2 1`: a NAME for a group of bars.
   *
   * A definition rather than a setting: it changes nothing about how the song
   * sounds until an `arrange` line uses it, which is what makes a form one line
   * to write and one line to change.
   */
  | { kind: 'section'; line: number; name: string; bars: number[]; machineBar?: number | null }
  /**
   * `arrange VERSE CHORUS VERSE`: the order, written with section names.
   *
   * It BUILDS the order — the song that plays is the song the same `order` line
   * would have played — so a form is a way of writing the arrangement rather than
   * a second one, and nothing below this statement has to know sections exist.
   */
  | { kind: 'arrange'; line: number; names: string[] }
  /**
   * `scene A 1 1 - 2`: one row of the LIVE page's launch grid.
   *
   * A pattern per channel — a 1-based pattern number, or `null` for a channel
   * that plays nothing — stored in the song, because a scene is something a song
   * HAS (it is performed later, and it round-trips through a file). The clips are
   * aligned to the channels as of the line that wrote them, the same order rule
   * `tracks N` and `section` follow.
   */
  | { kind: 'scene'; line: number; name: string; clips: (number | null)[]; machine: number | null }
  | { kind: 'octave'; line: number; octave: number }
  | { kind: 'theme'; line: number; theme: string }
  /**
   * `instrument use <name|number>`: which imported instrument `wave font` plays.
   *
   * A NAME is resolved by the CALLER, not here, and deliberately: the script
   * language is pure — it turns text into a song and reads nothing else — and the
   * instrument list is app state that lives in the scene. So a statement about it
   * travels out in `ScriptSettings` exactly as `theme` and `volume` do, and the
   * scene is what knows whether the name exists.
   */
  | { kind: 'instrumentUse'; line: number; query: string }
  /** `instrument import`: open the file picker for a `.instrument.json`. */
  | { kind: 'instrumentImport'; line: number }
  /**
   * `instrument load <path>`: fetch a soundfont and put it in the list.
   *
   * The one instrument statement that names a FILE rather than a fact about the
   * app, which is why it is the only one that can set a song up on its own: a
   * script that only knows the instrument's NAME is a script that needs somebody
   * to have loaded it already, and a script written to show off a particular font
   * should not need a human in the middle. The scene does the fetching — the
   * language still reads and writes nothing — so this travels out in
   * `ScriptSettings` like the other two.
   */
  | { kind: 'instrumentLoad'; line: number; source: string }
  | { kind: 'solo'; line: number; channels: number[] }
  /**
   * `export bars 8 to 15`, `export all`, `export loud -14` — or both at once.
   *
   * TWO SESSION SETTINGS in one statement, because they are the same decision
   * made twice: which bars an export renders, and how loud they arrive. Neither
   * is part of a song — the song is the whole song either way — so both travel
   * out in `ScriptSettings` and no file carries one, exactly as `theme` and
   * `solo` travel.
   *
   * Every field is OPTIONAL, and that is the whole reason this is not two
   * commands: a clause the script did not write means it said nothing about it,
   * so `export loud -14` leaves a region an earlier line marked alone. `null` is a
   * real value — `export all`, `export loud off` — the way an empty `solo` is:
   * "the whole song" and "no normalising" are instructions, and they are what a
   * song that was bounced or normalised once needs in order to be put back.
   */
  | { kind: 'export'; line: number; range?: BounceRange | null; loud?: number | null }
  /**
   * `page NAME`: which full screen the app is showing.
   *
   * A SESSION setting like `theme` — a view of the song, not the song — so it
   * travels out in `ScriptSettings` and is applied by the scene. The name is
   * validated HERE against the closed list of pages this build has, so a page a
   * build was never taught is refused in words (see `model/pages.ts`), and the
   * scene only ever receives a name it can resolve.
   */
  | { kind: 'page'; line: number; page: string }
  /**
   * `live quantize 4`: how many bars a launch waits for.
   *
   * A SESSION setting like `page` — a way of performing, not the song — so it
   * travels out in `ScriptSettings` and is applied by the scene. `0` launches
   * immediately, which is a real setting rather than "off".
   */
  | { kind: 'liveQuantize'; line: number; bars: number }
  | { kind: 'chords'; line: number; degrees: number }
  | { kind: 'hear'; line: number; on: boolean }
  | { kind: 'tracks'; line: number; count: number }
  /**
   * `bus NAME LEVEL`: one fader over the channels that name it.
   *
   * The GROUP half of the mix, one level up from a channel's own `level` — which
   * is why it is a statement rather than a track-line setting: it is about a set
   * of channels, and a script reads top to bottom, so a group is defined before
   * the channels that join it (`bus DRUMS 70`, then `track 1 bus DRUMS`).
   */
  | { kind: 'bus'; line: number; name: string; level: number }
  /**
   * `sample load PATH`: where the app should fetch a recording from.
   *
   * The URL TEXT as written, unresolved, exactly like `instrumentLoad` — the
   * fetch is the app's job, and `samples/break.wav` is the right way to spell a
   * path because a browser resolves it against the page's own address.
   */
  | { kind: 'sampleLoad'; line: number; source: string }
  /**
   * `sample import`: open the file picker for a `.wav`.
   *
   * A flag rather than a path, for `instrumentImport`'s reason: a browser cannot
   * read a path, and the file does not exist until somebody picks it.
   */
  | { kind: 'sampleImport'; line: number }
  /**
   * `record NAME`: capture a take from the microphone.
   *
   * A take is APP state, so this travels out in `ScriptSettings` and the scene
   * owns the capture; a browser with no input is refused in words, not silenced.
   */
  | { kind: 'recordCapture'; line: number; name: string }
  /** `record trim NAME START END`: move a take's used window, in seconds. */
  | { kind: 'recordTrim'; line: number; name: string; start: number; end: number }
  /** `record loop NAME START END`: move a take's loop points, in seconds. */
  | { kind: 'recordLoop'; line: number; name: string; start: number; end: number }
  /** `record select NAME`: which take the RECORDER page shows. A session setting. */
  | { kind: 'recordSelect'; line: number; name: string }
  /**
   * `arp hear on` / `arp hear off`: whether the ARP page auditions the run as its
   * dials move.
   *
   * A SESSION setting like `page` and `live quantize` — a way of LISTENING to the
   * song rather than the song itself — so it travels out in `ScriptSettings` and
   * is applied by the scene. It is what lets a script dial an arp, turn hearing
   * on and leave the page AUDITIONING, rather than written and silent.
   */
  | { kind: 'arpAudition'; line: number; on: boolean }
  | {
      kind: 'track'; line: number; index: number; name?: string;
      /** A named voice, applied BEFORE any explicit knob below. */
      voice?: string;
      /** The knobs written out on the line: `bright 60 ring 20`. */
      params?: Partial<VoiceParams>;
      wave?: Wave; muted?: boolean; hold?: number;
      /** The channel's level in the mix, 0..100. */
      level?: number;
      /** The channel's place between the speakers, -100 (left) to 100 (right). */
      pan?: number;
      /** How much the channel slides between notes, 0..100. */
      glide?: number;
      /** How much the channel's pitch wobbles, 0..100. */
      vibrato?: number;
      /** How far the channel's chord is rolled, in steps, 0..4. */
      strum?: number;
      /** How much successive hits of this channel differ, 0..100. */
      robin?: number;
      /** How much this channel's tone follows how hard a note is hit, 0..100. */
      touch?: number;
      /** How far this channel's pitch wanders, 0..100. */
      drift?: number;
      /** How far this channel pushes the other channels down, 0..100. */
      duck?: number;
      /** This channel's own feel, overriding the song's. */
      groove?: GrooveId;
      /** How much this channel is played rather than typed, 0..100. */
      humanize?: number;
      /** How many notes this channel may hold at once. 1 is monophonic. */
      poly?: number;
      /** Which part of the sound this channel's filter lets through. */
      shape?: FilterShape;
      /**
       * The mix group this channel joins, or `null` to leave the band it is on.
       *
       * A NAME, checked at parse time against the buses the lines above have
       * declared, exactly as `arrange` checks a section name: a channel that
       * names a group the song does not have is a line the parser can name
       * rather than a level that silently does nothing.
       */
      bus?: string | null;
      /**
       * The NAME of a recording of yours this channel plays, or `null` to leave
       * the one it is on.
       *
       * Checked for SPELLING and not against a list, which is the one place on a
       * track line that works this way — see the `sample` branch below for why.
       */
      sample?: string | null;
      /** How much of the channel goes into the master reverb, 0..100. */
      verb?: number;
      /** How much of the channel goes into the master echo, 0..100. */
      echo?: number;
      /**
       * The channel's eight EFFECTS, each 0..100 with 0 meaning OFF — only the
       * ones the line actually named, so an effect it left out keeps whatever
       * the channel already had (and a channel that had nothing keeps nothing).
       */
      effects?: Partial<ChannelEffects>;
    }
  | {
      kind: 'machine'; line: number;
      /** Play it or silence it. Absent leaves the machine as it was. */
      enabled?: boolean;
      /** How many steps one bar of the machine holds, 1..64. */
      steps?: number;
      /** How many of those steps are one beat, 1..16. */
      beat?: number;
      /** The machine's own lilt over the song's, 0..100. */
      swing?: number;
      level?: number;
      pan?: number;
      /** The group it joins, or `null` to leave the band it was on. */
      bus?: string | null;
      verb?: number;
      echo?: number;
      duck?: number;
      /** The effects it was given, only the ones the line named. */
      effects?: Partial<ChannelEffects>;
      /** `machine pattern N`: the bar the `pad` lines BELOW this one write into. */
      bar?: number;
      /** `machine order …`: which bar plays in each song bar. */
      order?: number[];
      /**
       * `machine pads N`: how many pads the machine HAS — the same number `+ ADD
       * PAD` and `DEL PAD` change. Growing fills in kit pads; shrinking drops from
       * the end and takes each pad's row off every bar with it.
       */
      pads?: number;
      /**
       * `machine bars N`: how many bars the machine has — what `+ BAR` and `- BAR`
       * change. Growing COPIES the last bar (a variation, not a blank); shrinking
       * drops from the end, and bar 1 is the machine and never goes.
       */
      bars?: number;
    }
  | {
      kind: 'pad'; line: number; index: number;
      /** Which machine BAR this pad's row belongs to. Absent means bar 1. */
      bar?: number;
      name?: string;
      /** A named voice for the pad, applied before any explicit knob below. */
      voice?: string;
      params?: Partial<VoiceParams>;
      wave?: Wave;
      level?: number;
      pan?: number;
      /** The recording the pad names, or null to leave the one it is on. */
      sample?: string | null;
      /** How far the pad's pitch is moved from its kit drum's, in semitones. */
      tune?: number;
      /** The pad's row, resolved at parse time against the machine's steps. */
      steps?: number[];
    }
  | { kind: 'pattern'; line: number; index: number; name?: string }
  | {
      kind: 'layer'; line: number; track: number; index: number;
      /**
       * What to write into the layer. Absent means "add a copy of the layer below
       * it and change nothing", which is how `layer 2 3` thickens a channel.
       */
      change?: Partial<Layer>;
      /** Take the layer out and shift the ones above it down. */
      clear?: boolean;
    }
  | { kind: 'order'; line: number; order: number[] }
  | { kind: 'clear'; line: number; pattern: number }
  | { kind: 'copy'; line: number; from: number; to: number }
  /**
   * `rows A to B …`: a RUN OF STEPS, and one of the two things a run can be told
   * to do — move its pitches by whole octaves, or play it more than once.
   *
   * The missing grammar rather than one more generator: a `note` names one row and
   * a `chord` names one row, so `fill`, a row-range `repeat`, `octave`,
   * `harmonize` and `variation` all had nowhere to say WHICH steps. The range is
   * written on the line that uses it (see `model/rows.ts`) and expanded while the
   * script is read, so nothing below this statement learns the word exists.
   */
  | {
      kind: 'rows'; line: number; pattern: number; from: number; to: number;
      /** `octave-up`/`octave-down` shift by `octaves`; `repeat` tiles `times`;
       * `roll` retriggers each hit by `roll`; `reverse` reads the range backwards
       * and takes no number at all. */
      transform: RowTransformId;
      /** Whole octaves, always positive — the direction is in `transform`. */
      octaves: number;
      /** How many times the range plays IN ALL, 2 or more, for `repeat`. */
      times: number;
      /** How many hits inside its step each hit becomes, for `roll`. */
      roll: number;
    }
  | {
      kind: 'note'; line: number; pattern: number; row: number; track: number; midi: number | null;
      /**
       * The OTHER notes in the same cell, when the cell is a chord.
       *
       * Absent for a note, which is what every line written before this had: one
       * pitch is one note, and several (`C-4,E-4,G-4`) are a chord that costs one
       * channel. The velocity and the articulation belong to the CELL, so they
       * apply to every note in it — one cell, one gesture.
       */
      extras?: number[];
      /**
       * The DRUM this step is, when the line was a `drum` line: one of the four
       * kit sounds. Absent for every note, which is every line written before
       * kits existed — and a drum hit holds no chord, so `extras` is never beside
       * it.
       */
      drum?: DrumId;
      /**
       * How the note is played, when the line says: a slide and/or a stutter.
       *
       * Absent on an `erase`, and absent on a note that said nothing — which is
       * what makes a script written before articulation mean exactly what it did.
       */
      slide?: boolean; stutter?: number; grace?: number; bend?: number;
      /** How hard the note is hit, 0..100. Absent means the model's default. */
      velocity?: number;
    }
  | { kind: 'chord'; line: number; pattern: number; row: number; track: number; octave: number; spec: ChordSpec; arp: Arp | null }
  /**
   * `arp direction updown`, `arp octaves 2 rate 2 gate 60`, `arp mode source`:
   * the ARP page's dials, merged into the song's own — one field per line, so a
   * saved script can write them in any order and land the settings it started
   * from. `settings: null` is `arp off`, which clears them.
   */
  | { kind: 'arp'; line: number; settings: Partial<ArpSettings> | null }
  /**
   * `arp write ROW TRACK CHORD`: commit a run using the song's stored dials.
   *
   * The same cells `chord ROW TRACK CHORD arp …` writes, read from `song.arp`
   * rather than spelled on the line — which is why the two can never disagree:
   * both call `generateArp`, which calls the modifier's own `arpNotes`.
   */
  | { kind: 'arpWrite'; line: number; pattern: number; row: number; track: number; octave: number; spec: ChordSpec }
  | { kind: 'progression'; line: number; progression: Progression | null }
  | {
    kind: 'follow';
    line: number;
    pattern: number;
    row: number;
    track: number;
    octave: number;
    what: FollowerKind;
    /** The loop as of THIS line, not the song's last word on it. */
    progression: Progression;
  };

// --- lexing -----------------------------------------------------------------

/**
 * Drop a trailing `#` or `//` comment, ignoring anything inside quotes.
 *
 * A `#` only counts when it BEGINS a token -- at the start of the line or after
 * whitespace. That is what lets the sharp spellings the reference documents be
 * written at all: treating every `#` as a comment silently turned `C#4` into a
 * bare `C` and `G#5` into a `G`, which is the worst kind of wrong -- a song that
 * still plays, in the wrong key. A comment therefore needs its space, exactly
 * as every example writes it.
 */
function stripComment(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (ch === '/' && line[i + 1] === '/') return line.slice(0, i);
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/**
 * One token, plus whether it came out of `"quotes"`.
 *
 * The text alone is not quite enough. A few words in the language are both a
 * setting and a perfectly good channel name — `off` is a mute flag, `wave`
 * opens a waveform — and `track 2 off` and `track 2 "off"` are the two
 * different things an author means by them. Quotes are how the author says
 * which; throwing that away in the tokenizer is what makes the difference
 * unspellable, so the flag is kept and the `track` statement reads it.
 */
interface ScriptToken {
  /** The token's text, quotes removed. */
  text: string;
  /** True when any part of it was written inside quotes. */
  quoted: boolean;
}

/**
 * Split a line into tokens, keeping `"quoted phrases"` together. Quotes are
 * removed from the text, so `song "MY TUNE"` and `song MY TUNE` yield the same
 * phrasing — but whether the quotes were there at all is remembered.
 */
function tokenize(line: string): ScriptToken[] {
  const out: ScriptToken[] = [];
  let current = '';
  let quoted = false;
  let sawQuotes = false;
  const flush = (): void => {
    if (current !== '') out.push({ text: current, quoted: sawQuotes });
    current = '';
    sawQuotes = false;
  };
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; sawQuotes = true; continue; }
    if (!quoted && /\s/.test(ch)) {
      flush();
      continue;
    }
    current += ch;
  }
  flush();
  return out;
}

/**
 * The words that mean something other than a name inside a `track` statement.
 * Bare, they are settings; quoted, they are a name.
 */
/**
 * Every word that means a setting on a `track` line rather than a name.
 *
 * Built from the voice table rather than written out, so a knob cannot be added
 * to the language without also being un-nameable-by-accident. The cost is that a
 * channel genuinely called `FADE` or `WIDTH` must be quoted — which is the rule
 * the language already had for `wave` and `off`, and the error says so.
 */
const SETTING_WORDS = new Set([
  'on', 'off', 'wave', 'hold', 'voice', 'level', 'pan', 'glide', 'vibrato', 'strum', 'duck',
  'verb', 'echo', 'poly',
  // The two that make a part sound PLAYED rather than typed: how much the hits
  // differ from each other, and how much a note's tone follows how hard it was
  // hit. Settings like the rest, so `track 2 robin` is a line missing its value
  // rather than a channel named ROBIN.
  'robin', 'touch', 'drift',
  // Which recording of yours the channel plays. A setting like the rest, and
  // therefore a word a channel cannot be called by accident: `track 2 sample` is
  // a line missing its value, not a channel named SAMPLE.
  'sample',
  // Which FILTER the channel's `bright` opens: `track 2 shape sharp` is a channel
  // somebody shaped, not a channel called SHAPE. The four shapes are listed too,
  // so `track 2 sharp` gets the "a word a track line does not take" explanation
  // rather than becoming a channel with a very odd name.
  'shape', ...FILTER_SHAPES.map((entry) => entry.id),
  // The part's own FEEL: `track 4 groove shuffle` is a channel somebody leaned
  // on, not a channel called GROOVE.
  'groove', 'humanize',
  // And which GROUP it is in: `track 1 bus DRUMS` is a channel somebody grouped,
  // not a channel called BUS.
  'bus',
  // The effects are settings too, and for the same reason: `track 1 drive`
  // is a channel somebody meant to drive, not a channel called DRIVE.
  ...TRACK_EFFECTS.map((effect) => effect.id),
  // The layer words are settings, but not of a TRACK — a voice has no octave,
  // no detune and no gain. Listing them here is what turns the plausible
  // mistake `track 1 detune -5` into an explanation instead of a silent rename
  // of the channel to "DETUNE -5".
  'layer', 'octave', 'detune', 'gain',
  ...VOICE_PARAMS.flatMap((param) => [param.id, ...param.aliases]),
]);

/**
 * Whether one clip token in a `scene` line means "this channel plays nothing".
 *
 * `-` is how the app WRITES silence and `0` is how the roadmap spells it, and the
 * two are the same instruction; the empty-cell tokens a grid row uses (`.`, `_`,
 * `..`) are accepted too, because a hand copying a pattern cell into a scene
 * writes one of them rather than looking up a third spelling.
 */
function isSceneSilenceWord(token: string): boolean {
  if (/^[.\-_]+$/.test(token)) return true;
  const n = Number(token);
  return Number.isFinite(n) && n === 0;
}

function isSettingWord(text: string): boolean {
  return SETTING_WORDS.has(text.toLowerCase());
}

/** The knob a word names, or null. `bright`, `tone` and `brightness` are one knob. */
function paramWord(text: string): VoiceParamId | null {
  const want = text.trim().toLowerCase();
  const param = VOICE_PARAMS.find((entry) => entry.id === want || entry.aliases.includes(want));
  return param ? param.id : null;
}

/**
 * A pan, in any of the four ways a person writes one, or null.
 *
 * `-40` and `40` are the mixer's own numbers and are what a script that was
 * generated should write. `L40` / `R40` are the same two values spelled the way
 * a mixer LABELS them, and `C` / `center` is dead centre — because the value a
 * person reaches for is a place, and "hard left" being `-100` is a fact about
 * the arithmetic rather than about the music.
 *
 * Returning null rather than clamping is deliberate: a pan outside the range is
 * a mistake about the SPELLING (`L400`) rather than a taste, and the error can
 * only say how to fix it if it knows the shape of what was written.
 */
function panAmount(text: string): number | null {
  const want = text.trim().toLowerCase();
  if (want === 'c' || want === 'center' || want === 'centre' || want === 'mid' || want === 'middle') return 0;
  const sided = /^([lr])(\d{1,3})$/.exec(want);
  if (sided) {
    const magnitude = Number(sided[2]);
    if (magnitude > MAX_PAN) return null;
    return sided[1] === 'l' ? -magnitude : magnitude;
  }
  const value = Number(want);
  if (!Number.isFinite(value) || value < MIN_PAN || value > MAX_PAN) return null;
  return Math.round(value);
}

/**
 * What a stray setting word is missing, said in terms of the word itself.
 *
 * A name is the one thing an author meant by accident here, so every one of
 * these ends with the same escape hatch: quote it and it becomes a name.
 */
function settingWordHint(word: string, index: number, voices: readonly UserVoice[] = []): string {
  if (word === 'wave') {
    return `wave needs a shape: "wave square", "wave triangle", "wave saw" or "wave sine". To name a channel WAVE, quote it: track ${index} "WAVE" wave sine.`;
  }
  if (word === 'hold') {
    return `hold needs a number of steps: "hold 4". To name a channel HOLD, quote it: track ${index} "HOLD" wave sine.`;
  }
  if (word === 'level') {
    return `level needs a percentage ${MIN_LEVEL}..${MAX_LEVEL}, e.g. "level 70" (100 is full, 0 is silent). To name a channel LEVEL, quote it: track ${index} "LEVEL" wave sine.`;
  }
  if (word === 'pan') {
    return `pan needs a place between the speakers, e.g. "pan L40", "pan R40", "pan -40", "pan 40" or "pan C" for centre. To name a channel PAN, quote it: track ${index} "PAN" wave sine.`;
  }
  if (word === 'glide') {
    return `glide needs a percentage ${MIN_GLIDE}..${MAX_GLIDE}, e.g. "glide 40" (0 is none, 100 slides for the whole note). To name a channel GLIDE, quote it: track ${index} "GLIDE" wave sine.`;
  }
  if (word === 'verb' || word === 'echo') {
    const effect = word === 'verb' ? 'reverb' : 'echo';
    return `${word} on a track line is a SEND: how much of this channel goes into the ${effect}, ${MIN_SEND}..${MAX_SEND}, e.g. "${word} 40". ${MAX_SEND} is everything and is the default, ${MIN_SEND} keeps the channel dry. The bare "${effect} 40" statement is a different number: the amount of the ${effect} that comes back. To name a channel ${word.toUpperCase()}, quote it: track ${index} "${word.toUpperCase()}" wave sine.`;
  }
  if (word === 'vibrato') {
    return `vibrato needs a percentage ${MIN_VIBRATO}..${MAX_VIBRATO}, e.g. "vibrato 30" (0 is steady). To name a channel VIBRATO, quote it: track ${index} "VIBRATO" wave sine.`;
  }
  if (word === 'strum') {
    return `strum needs a span in steps ${MIN_STRUM}..${MAX_STRUM}, e.g. "strum 1" (0 plays the chord as a block). To name a channel STRUM, quote it: track ${index} "STRUM" wave sine.`;
  }
  if (word === 'duck') {
    return `duck needs a percentage ${MIN_DUCK}..${MAX_DUCK}, e.g. "duck 60" (0 is off, 100 pushes the other channels all the way out while this one plays). To name a channel DUCK, quote it: track ${index} "DUCK" wave sine.`;
  }
  if (word === 'shape') {
    return `shape needs one filter shape, e.g. "shape sharp" (which part of the sound survives). The shapes are: ${shapeNames()}. To name a channel SHAPE, quote it: track ${index} "SHAPE" wave sine.`;
  }
  if (word === 'bus') {
    return `bus needs the name of a group, e.g. "bus DRUMS" (or "bus ${NO_BUS_WORD}" to leave the one it is on). A group is declared on its own line above the channels that join it: "bus DRUMS 70". To name a channel BUS, quote it: track ${index} "BUS" wave sine.`;
  }
  if (word === 'sample') {
    return `sample needs the name of a recording YOU have loaded, e.g. "sample BRK02" (or "sample ${NO_SAMPLE_WORD}" to leave the one this channel is on). Import a .wav under F2 first; a channel on "wave sample" plays it, and falls back to the built-in one-shot when the app does not have that name. The name is ONE word. To name a channel SAMPLE, quote it: track ${index} "SAMPLE" wave sine.`;
  }
  // The effects, said in the terms of the effect itself: what it is called
  // at 0 and at 100 is the whole of what an author needs to choose a number.
  const effect = TRACK_EFFECT_BY_ID[word as TrackEffectId];
  if (effect) {
    return `${word} needs a percentage ${MIN_EFFECT}..${MAX_EFFECT}, e.g. "${word} 40" (0 is off, 100 is as ${effect.high} as this app goes). To name a channel ${word.toUpperCase()}, quote it: track ${index} "${word.toUpperCase()}" wave sine.`;
  }
  if (word === 'voice') {
    const mine = voices.length > 0 ? ` Yours: ${userVoiceNames(voices)}.` : '';
    return `voice needs a voice name, e.g. "voice pad". Voices: ${VOICE_NAMES}.${mine} To name a channel VOICE, quote it: track ${index} "VOICE" wave sine.`;
  }
  if (word === 'layer') {
    return `layer is a statement of its own, on its own line: "layer ${index} 2 wave saw" is the second layer of channel ${index}. Write "tracks ${index}" first if the song has fewer channels.`;
  }
  if (word === 'octave' || word === 'detune') {
    return `${word} is not a track setting: a voice is always in tune, and where the TRACK plays is written in its notes. Stack a layer and move that instead, e.g. "layer ${index} 2 ${word} ${word === 'octave' ? '1' : '-8'}".`;
  }
  if (word === 'gain') {
    return `gain is a LAYER's level inside the instrument. For how loud the channel sits in the mix, write "level 60"; for a layer above the voice, "layer ${index} 2 gain 40".`;
  }
  const param = paramWord(word);
  if (param) {
    const spec = VOICE_PARAM_BY_ID[param];
    return `${param} needs a percentage 0..100, e.g. "${param} 40" (0 is ${spec.low}, 100 is ${spec.high}). To name a channel ${param.toUpperCase()}, quote it: track ${index} "${param.toUpperCase()}" wave sine.`;
  }
  return `"${word}" is a mute flag here, not a name. Write "mute ${index}" / "unmute ${index}", or quote it to name a channel: track ${index} "${word.toUpperCase()}".`;
}

/**
 * Split a cell into its pitch and its optional `~velocity` suffix.
 *
 * A grid cell is a pitch and, when the note is not played at full force, how
 * hard it is hit: `C-4`, `C-4~80`, `Eb5~40`. `~` rather than a second column
 * because it sits INSIDE the one token a cell already is — which is what keeps
 * a grid row reading as one step with one note per channel, rather than making
 * every row two rows.
 *
 * The split is deliberately loose about what follows the tilde: asking only for
 * the pitch here means `C-4~200` is still recognisably a cell, so it can be
 * reported as a velocity out of range rather than as an unknown command.
 */
function splitCellVelocity(token: string): { pitch: string; velocity: string | null } {
  const at = token.indexOf('~');
  if (at < 0) return { pitch: token, velocity: null };
  return { pitch: token.slice(0, at), velocity: token.slice(at + 1) };
}

/**
 * A velocity written out as text, or null when it is not one this language can
 * use.
 *
 * Returns null rather than clamping, because a velocity out of range is a
 * mistake about what was typed (`~500`, `~loud`) and the error can only say how
 * to fix it if it knows what was written.
 */
function velocityValue(text: string): number | null {
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < MIN_VELOCITY || parsed > MAX_VELOCITY) return null;
  return Math.round(parsed);
}

/**
 * Split a cell into its pitch, its ARTICULATION and its optional `~velocity`.
 *
 * The three parts of a cell: the pitch, what the note DOES (`>` slides, `*3` is
 * three hits, `^2`/`v2` bend its own pitch) and how hard it is hit (`~40`). `~`
 * stays the velocity's own character — it was there first and every file in the
 * world has one — and the articulation characters are found by shape rather than
 * by position, because a pitch is `A-G` and an optional accidental: it can contain
 * none of them, and a drum word (`kick`, `snare`, `hat`, `wind`) contains none of
 * them either.
 *
 * The gesture and the force may be written in either order (`C-4>*3~40` is
 * `C-4~40>*3`), so that a hand typing the force first is not corrected for it;
 * the writer always spells the gesture first, which is the order to read these
 * in. Everything from the first `>` or `*` to the end is one suffix, so `*3>*3`
 * arrives at the reader as the two gestures it claims to be and is refused there
 * rather than being cut into two cells that each look fine.
 */
function splitCell(token: string): { pitch: string; articulation: string; velocity: string | null } {
  const cut = token.search(/[>*!^v]/);
  if (cut < 0) {
    const { pitch, velocity } = splitCellVelocity(token);
    return { pitch, articulation: '', velocity };
  }
  // The suffix runs from the first gesture character to the end, and the force
  // may be written on EITHER side of it — `C-4>*3~40` and `C-4~40>*3` are the
  // same cell, the same rule the `note` line's extra values follow. Only one
  // `~` is read; a second one is left in the velocity text for the reader to
  // refuse by name (see `splitCellVelocity`).
  const head = token.slice(0, cut);
  let tail = token.slice(cut);
  // The force is on the tail side when it follows the gesture, and on the head
  // side when it comes before it; the head holds only a pitch once the suffix is
  // cut off, so the two cases cannot both be true.
  const tilde = tail.indexOf('~');
  const velocity = tilde >= 0
    ? tail.slice(tilde + 1)
    : splitCellVelocity(head).velocity;
  if (tilde >= 0) tail = tail.slice(0, tilde);
  return { pitch: splitCellVelocity(head).pitch, articulation: tail, velocity };
}

/**
 * Read an articulation, or report why it cannot be used.
 *
 * `where` is the name of the thing being read ("column 3", or `""` for a `note`
 * line), so the message lands on the part of the line it is about.
 */
function articulationFor(
  text: string,
  line: number,
  where: string,
  fail: (line: number, message: string) => void,
): Articulation | null {
  if (text.trim() === '') return { ...NO_ARTICULATION };
  const problem = articulationProblem(text);
  if (problem !== null) {
    fail(line, where === '' ? problem : `${where}: ${problem}`);
    return null;
  }
  return parseArticulation(text) ?? { ...NO_ARTICULATION };
}

/**
 * The pitches a cell holds, in the order they are written — or null when the
 * text is not a run of notes this language can use.
 *
 * One pitch is a note and several are a CHORD IN ONE CELL: `C-4`, or
 * `C-4,E-4,G-4` for a triad that costs one channel rather than three. It is the
 * same value in a grid row and on a `note` line, because a cell is a cell
 * wherever it is written.
 *
 * A comma rather than a space, deliberately: a space is what separates one
 * COLUMN from the next, so a chord that used one would be indistinguishable from
 * three channels of one note. A repeated pitch is dropped rather than sounded
 * twice, which is what `setCellNotes` guarantees for every other writer too.
 */
function parseCellPitches(text: string, octave: number): number[] | null {
  const out: number[] = [];
  for (const part of text.split(CELL_NOTE_SEPARATOR)) {
    const midi = parsePitch(part.trim(), octave);
    if (midi === null) return null;
    if (!out.includes(midi)) out.push(midi);
  }
  return out;
}

/**
 * True when a token is SPELLED like a cell: a run of pitches, with an
 * articulation and a force either way round.
 *
 * A spelling check and nothing more, so that a line of garbage is refused as an
 * unknown command while a line of notes is read as a grid row. How MANY notes a
 * cell may hold is deliberately not part of it: a cell of nine notes is a mistake
 * worth a sentence of its own ("a cell holds at most 8 notes"), and answering it
 * with "unknown command" would hide the very limit the message exists to teach.
 */
function isCellToken(token: string): boolean {
  if (EMPTY_TOKENS.has(token)) return true;
  const head = splitCell(token).pitch;
  // A DRUM word is a cell: `kick`, and `hat*3` with a gesture on it.
  if (drumFromName(head) !== null) return true;
  const parts = head.split(CELL_NOTE_SEPARATOR);
  return parts.length > 0 && parts.every((part) => PITCH_RE.test(part.trim()));
}

/**
 * Read a pitch. A bare letter (`C`) takes the script's current default octave,
 * which is what makes compact grid blocks readable.
 */
function parsePitch(token: string, octave: number): number | null {
  if (EMPTY_TOKENS.has(token)) return null;
  const match = PITCH_RE.exec(token);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const accidental = match[2] ?? '';
  const oct = match[3] !== undefined ? Number(match[3]) : octave;
  let semitone = LETTER_SEMITONES[letter];
  if (accidental === '#') semitone += 1;
  else if (accidental === 'b') semitone -= 1;
  const midi = (oct + 1) * 12 + semitone;
  if (midi < MIDI_MIN || midi > MIDI_MAX) return null;
  return midi;
}

// --- parsing ----------------------------------------------------------------

export interface ScriptContext {
  /** How many tracks the song has right now. */
  trackCount: number;
  /** How many steps each pattern has right now. */
  rows: number;
  /** How many steps make one beat right now. */
  rowsPerBeat: number;
  /**
   * The sounds the user has saved, so `voice MYPAD` resolves like `voice pad`.
   *
   * Passed IN rather than imported, because the library lives in the browser's
   * storage and this file must stay pure — the same rule the theme's own reader
   * follows. Absent (or empty) means only the built-in voices exist, which is
   * the honest reading of a script parsed on a machine with none saved.
   */
  voices?: readonly UserVoice[];
  /**
   * How many automation lanes the song already carries.
   *
   * A lane is one of the two things this language has a CEILING on, and a
   * ceiling is only kind if it can be reported with a line number while the
   * author is still typing — so the parser is told what the song already has
   * rather than counting for itself.
   */
  laneCount?: number;
  /**
   * The sections the song already defines, so `arrange` can check a name against
   * what the song knows as well as against the lines above it.
   *
   * Passed in for the same reason `laneCount` is: a script is pasted onto a song
   * that may already have a form, and `arrange VERSE` in a script that never
   * wrote a `section` should use the one the song has rather than refuse.
   */
  sections?: readonly Section[];
  /**
   * The LIVE scenes the song already defines, so a `scene` line REPLACES a row by
   * name rather than colliding with it, and so the `MAX_SCENES` ceiling is counted
   * against the set the song will actually have.
   *
   * Passed in for the same reason `sections` is: a script is pasted onto a song
   * that may already launch something, and the last line about a name has to be
   * the one that counts.
   */
  scenes?: readonly Scene[];
  /**
   * The buses the song already defines, so a track line can join one the song
   * has even when the script never declared it.
   *
   * Passed in for the same reason `sections` is: a script is applied to a song
   * that may already be grouped, and `track 2 bus DRUMS` in a script that never
   * wrote a `bus` line should use the group the song has rather than refuse.
   */
  buses?: readonly Bus[];
  /**
   * How many notes each channel already holds at once, widest first is not the
   * order — index `n` is channel `n + 1`.
   *
   * Passed in for the same reason the buses are: a chord in a cell is only
   * honest on a channel wide enough to sound it, and a script pasted onto a song
   * whose channel already says `poly 4` must not be refused for it.
   */
  polys?: readonly number[];
  /**
   * The chord loop the song already has, so a follower can follow it without the
   * script defining one.
   *
   * Passed in for the same reason `sections` is: `chord 0 1 follow` in a script
   * pasted onto a song that already has a progression should hang the channel on
   * the four chords the song is made of rather than refuse for want of a line.
   */
  progression?: Progression | null;
  /**
   * How many steps the song's drum machine has right now, so a `pad` pattern is
   * checked against the machine it will land on.
   *
   * Passed in for the same reason `rows` is: a pattern string may not be longer
   * than the machine, and the machine may already exist on the song the script is
   * pasted onto. Absent means the default, which is what a fresh song has.
   */
  machineSteps?: number;
}

interface ParseState {
  trackCount: number;
  rows: number;
  rowsPerBeat: number;
  octave: number;
  /** The 1-based pattern the grid rows and `note`/`clear` statements target. */
  pattern: number;
  /** The next row a grid line will write, reset by `pattern`. */
  rowCursor: number;
  /**
   * The bars a `tempo ... at/by` statement has already claimed.
   *
   * A parse-time set rather than a count, so the one ceiling this language has
   * (how many tempo changes a song may carry) can be reported with a LINE NUMBER
   * while the author is still typing. It is the only thing the parser counts at
   * all: every other limit in the language is a range on one value.
   */
  tempoSlots: Set<number>;
  /**
   * How many layers each channel has, the voice included, as the lines so far
   * have left them.
   *
   * The parser has to know this for the same reason it knows `trackCount`: a
   * layer is addressed by POSITION in a list with no holes, so `layer 1 3` on a
   * channel with one layer is a mistake the parser can name while the author is
   * still typing — rather than a line that parses and quietly does nothing.
   */
  layerCounts: number[];
  /**
   * How many notes each channel can hold at once, as the lines so far have left
   * them: one, unless a `track` line above said otherwise.
   *
   * The parser needs this for the same reason it needs `layerCounts`: a CELL may
   * now hold a chord (`C-4,E-4,G-4`), and a chord only means anything on a channel
   * wide enough to SOUND it. Asking the state rather than the song is what lets
   * the refusal carry a line number, and it follows the same order rule every
   * other channel fact does — `tracks N` and a `track` line are read as of where
   * they are written.
   */
  polys: number[];
  /**
   * How many automation lanes the script has asked for so far.
   *
   * A count rather than a set, because lanes are a list rather than a map: two
   * lanes on one channel are two things (a rise and a fall), so the ceiling is
   * about the size of the list. It starts at the lanes the song already carries,
   * so a script added to a full song hears about it on its first lane rather than
   * overflowing silently.
   */
  laneCount: number;
  /**
   * How many steps the machine has as of the lines read so far, so a `pad`
   * pattern written below a `machine steps N` line is checked against the size
   * the machine will actually have.
   */
  machineSteps: number;
  /**
   * Which machine BAR the `pad` lines below write into, set by `machine pattern N`.
   *
   * Starts at 1 — the bar every machine has — so a script that says nothing about
   * bars writes bar 1, exactly as it always did.
   */
  machineBar: number;
  /**
   * The sections a name may refer to, as the lines so far have left them.
   *
   * A section is defined for the lines BELOW it — `arrange` reads this list —
   * which is the same order rule `tracks N` follows, and for the same reason: a
   * script is read top to bottom, and a name that nothing above has defined is a
   * mistake the parser can name with a line number rather than a surprise later.
   */
  sections: Section[];
  /**
   * The buses a track line may join, as the lines so far have left them.
   *
   * Seeded from the song and added to by each `bus` line, so the list a channel
   * is checked against is exactly the list that will exist when the script is
   * applied — the same bargain `sections` makes one scope over.
   */
  buses: Bus[];
  /**
   * The chord loop the lines so far have defined, or null for a song that has
   * none.
   *
   * Seeded from the song and replaced by each `progression` line, for the same
   * reason `sections` and `buses` are: a follower can only follow something that
   * exists ABOVE it, so the parser can name "nothing to follow" with a line number
   * instead of leaving an empty channel behind. A follower carries a SNAPSHOT of
   * this, so a `progression` line written after it cannot reach back and change
   * what an earlier line wrote.
   */
  progression: Progression | null;
  /**
   * The LIVE scenes a `scene` line has defined so far.
   *
   * Seeded from the song like `sections` and `buses`, so a script added to a song
   * with a live set REPLACES a row by name rather than colliding with it — the
   * same "the last line about a name counts" rule the sections follow. The list is
   * also what enforces the `MAX_SCENES` ceiling with a line number.
   */
  scenes: Scene[];
}

/**
 * Turn source text into commands. Pure: it never touches a song, so the caller
 * can show diagnostics while the author is still typing.
 */
export function parseScript(
  source: string,
  context: ScriptContext,
): { commands: ScriptCommand[]; errors: ScriptDiagnostic[] } {
  const commands: ScriptCommand[] = [];
  const errors: ScriptDiagnostic[] = [];
  // The user's own sounds, which are addressed exactly like the built-in ones.
  const voices = context.voices ?? [];
  const state: ParseState = {
    trackCount: context.trackCount,
    rows: context.rows,
    rowsPerBeat: context.rowsPerBeat,
    octave: 4,
    pattern: 1,
    rowCursor: 0,
    tempoSlots: new Set<number>(),
    // Every channel starts as the one layer it has always been, and as the one
    // note at a time it has always sounded.
    layerCounts: Array.from({ length: context.trackCount }, () => 1),
    // Seeded from the song: a script appended to a song whose channels are
    // already wide sees them that way, exactly as `sections` and `buses` do.
    polys: (context.polys ?? Array.from({ length: context.trackCount }, () => DEFAULT_POLY))
      .slice(0, context.trackCount)
      .map((poly) => clampPoly(poly)),
    laneCount: context.laneCount ?? 0,
    sections: (context.sections ?? []).map(tidySection),
    scenes: (context.scenes ?? []).map((scene) => ({ ...scene, clips: scene.clips.slice() })),
    buses: (context.buses ?? []).map(tidyBus),
    progression: context.progression ?? null,
    machineSteps: clampMachineSteps(context.machineSteps ?? DEFAULT_MACHINE_STEPS),
    machineBar: 1,
  };

  const fail = (line: number, message: string): void => { errors.push({ line, message }); };

  /**
   * The command a FOLLOWER line makes, or the reason there is not one.
   *
   * `chord ROW TRACK follow` and `note ROW TRACK follow` do the same arithmetic
   * on the same rows and differ in one line, so the two branches share this
   * rather than each checking for itself — the row and track have already been
   * checked by the caller, which is why only the loop is asked about here.
   *
   * The command carries a SNAPSHOT of the loop, so a `progression` line written
   * below a follower cannot reach back and change what that line wrote. That is
   * the same order rule every other statement follows: a script reads top to
   * bottom, and what a line meant is what the lines above it said.
   */
  const followerCommand = (
    lineNumber: number,
    row: number,
    track: number,
    what: FollowerKind,
  ): Extract<ScriptCommand, { kind: 'follow' }> | null => {
    const progression = state.progression;
    if (progression === null) {
      fail(lineNumber, `there is nothing to follow: this song has no progression yet. Write one above this line — "progression Am F C G" — or hang the channel on a loop the song already has.`);
      return null;
    }
    if (what === 'chords') {
      const poly = state.polys[track - 1] ?? DEFAULT_POLY;
      for (const step of progression.steps) {
        const size = progressionStepSize(step);
        if (size > poly) {
          fail(lineNumber, `following the progression writes ${size} notes at a time (${progressionStepLabel(step)}), and channel ${track} sounds ${poly}. Widen it — "track ${track} poly ${size}" — or follow with the roots instead: note ROW ${track} ${FOLLOW_WORD}.`);
          return null;
        }
      }
    }
    return {
      kind: 'follow', line: lineNumber, pattern: state.pattern,
      row, track, octave: state.octave, what, progression,
    };
  };
  const lines = source.split(/\r?\n/);
  //
  // The AUTHOR's line number for each entry in `lines`, because the list can
  // GROW: a `start` line splices a whole starter's script in after itself, and
  // those lines belong to the `start` line — there is no other line in the
  // author's script they could be reported against. Everything else is its own
  // number, so a grid row written below `start house` still reports the line the
  // author typed it on, whatever the starter above it was worth.
  const lineNumbers: number[] = lines.map((_, index) => index + 1);

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = lineNumbers[i];
    const text = stripComment(lines[i]).trim();
    if (text === '') continue;

    const tokens = tokenize(text);
    if (tokens.length === 0) continue;
    const head = tokens[0].text.toLowerCase();

    // --- a grid row: no keyword, every token a cell -------------------------
    if (!SCRIPT_KEYWORDS.includes(head)) {
      if (!tokens.every((token) => isCellToken(token.text))) {
        fail(lineNumber, `unknown command "${tokens[0].text}". Commands are: ${SCRIPT_KEYWORDS.join(', ')}.`);
        continue;
      }
      if (state.rowCursor >= state.rows) {
        fail(lineNumber, `this pattern already has ${state.rows} steps, so there is no row ${state.rowCursor}.`);
        continue;
      }
      if (tokens.length > state.trackCount) {
        fail(lineNumber, `this grid row has ${tokens.length} notes but the song has ${state.trackCount} tracks. Add "tracks ${tokens.length}" or remove a column.`);
        continue;
      }
      tokens.forEach((token, column) => {
        if (EMPTY_TOKENS.has(token.text)) return;
        const { pitch, articulation: articulationText_, velocity: velocityText } = splitCell(token.text);
        // A grid word may be a DRUM rather than a pitch: `kick . hat .` is a beat
        // written the way a drummer reads it, and it is the same one-word-per-cell
        // grammar everything else here uses. `pitch` is the word; everything after
        // it — the force and the gesture — belongs to the hit.
        const asDrum = drumFromName(pitch);
        const midis = asDrum === null ? parseCellPitches(pitch, state.octave) : [drumPitch(asDrum)];
        if (midis === null) {
          fail(lineNumber, `column ${column + 1}: "${token.text}" is not a note in range. Use C0..B8, e.g. C-4.`);
          return;
        }
        if (midis.length > MAX_CELL_NOTES) {
          fail(lineNumber, `column ${column + 1}: a cell holds at most ${MAX_CELL_NOTES} notes; "${token.text}" has ${midis.length}. A chord that big wants more than one channel, or a second cell.`);
          return;
        }
        // A chord is only worth writing if the channel can SOUND it: a cell is
        // one event, so its notes are heard together or not at all, and a channel
        // that can hold one note would play the top of a triad and drop the rest
        // in silence. Refused rather than written, and the message says both ways
        // out — widen the channel, or spread the chord over the channels after it.
        const capacity = state.polys[column] ?? DEFAULT_POLY;
        if (midis.length > capacity) {
          fail(lineNumber, `column ${column + 1}: this cell holds ${midis.length} notes, but channel ${column + 1} sounds ${capacity} at a time. Write "track ${column + 1} poly ${midis.length}" above this line to widen it, or spread the chord across channels with "chord ${state.rowCursor} ${column + 1} …".`);
          return;
        }
        // What the note DOES, before how hard it is hit — the order the cell
        // writes them, and the order the message can name them in.
        const articulation = articulationFor(articulationText_, lineNumber, `column ${column + 1}`, fail);
        if (articulation === null) return;
        let velocity: number | undefined;
        if (velocityText !== null) {
          const parsed = velocityValue(velocityText);
          if (parsed === null) {
            fail(lineNumber, `column ${column + 1}: "${token.text}" has a velocity outside ${MIN_VELOCITY}..${MAX_VELOCITY}. Write the note, a ~, and how hard it is hit — e.g. C-4~80, or C-4~40 for a soft one.`);
            return;
          }
          velocity = parsed;
        }
        // How the note is played rides along ONLY when the line asked, so a cell
        // that says nothing produces the command (and therefore the song) this
        // app produced before articulation existed.
        commands.push({
          kind: 'note', line: lineNumber, pattern: state.pattern, row: state.rowCursor,
          track: column + 1, midi: midis[0],
          ...(asDrum !== null ? { drum: asDrum } : {}),
          ...(midis.length > 1 ? { extras: midis.slice(1) } : {}),
          velocity,
          ...(articulation.slide ? { slide: true } : {}),
          ...(articulation.stutter > DEFAULT_STUTTER ? { stutter: articulation.stutter } : {}),
          ...(articulation.grace > 0 ? { grace: articulation.grace } : {}),
          ...(articulation.bend !== 0 ? { bend: articulation.bend } : {}),
        });
      });
      state.rowCursor += 1;
      continue;
    }

    const args = tokens.slice(1).map((token) => token.text);
    switch (head) {
      case 'start': {
        // A GENRE STARTER — the one statement that writes a script for you. The
        // starter's own lines are SPLICED IN right here, and read on through the
        // same loop in the same state, so they are applied exactly as if the
        // author had typed them: the song shape they give (`tracks 6`, `steps 32`,
        // a loop, a form) is the shape the lines BELOW are then checked against,
        // and the `new` every starter begins with is what makes `start house` mean
        // "the song becomes this" rather than "this is merged into whatever is
        // there". Nothing at all is added to the command list here: a starter is
        // not a second kind of statement with its own semantics, it is the same
        // script the author would have written, and it is applied by the same
        // appliers as everything else.
        if (args.length !== 1) {
          fail(lineNumber, `${GENRE_WORD} needs the name of a starter, e.g. ${GENRE_WORD} house. The starters are: ${genreNames()}.`);
          break;
        }
        const starter = genreFromName(args[0]);
        if (starter === null) {
          fail(lineNumber, `"${args[0]}" is not a starter. The starters are: ${genreNames()} — e.g. ${GENRE_WORD} house.`);
          break;
        }
        const starterLines = starter.script.split(/\r?\n/);
        lines.splice(i + 1, 0, ...starterLines);
        lineNumbers.splice(i + 1, 0, ...new Array<number>(starterLines.length).fill(lineNumber));
        break;
      }
      case 'new': {
        if (args.length > 0) { fail(lineNumber, '"new" takes no arguments — it starts a blank song.'); break; }
        commands.push({ kind: 'new', line: lineNumber });
        // `new` resets the song shape, so the running state has to follow — and
        // that means EVERYTHING the state was seeded from the song with, not just
        // the shape. The apply side clears the sections, the groups, the chord
        // loop and the lanes (`resetInto`), so a name this script defines has to
        // be checked against an EMPTY list: a script beginning `new` that names
        // fifteen sections must not be refused because the song already on screen
        // had ten, which is exactly what happened while only the shape was reset.
        state.trackCount = 4;
        state.rows = 16;
        state.rowsPerBeat = ROWS_PER_BEAT;
        state.octave = 4;
        state.pattern = 1;
        state.rowCursor = 0;
        state.tempoSlots.clear();
        state.layerCounts = Array.from({ length: state.trackCount }, () => 1);
        state.polys = Array.from({ length: state.trackCount }, () => DEFAULT_POLY);
        state.laneCount = 0;
        state.sections = [];
        state.buses = [];
        state.progression = null;
        break;
      }
      case 'song': {
        if (args.length === 0) { fail(lineNumber, 'song needs a title, e.g. song "MY TUNE".'); break; }
        const title = args.join(' ');
        // The same ceiling the header's rename box enforces, so a title typed by
        // hand and a title written here can never come out different lengths.
        if (!isSongTitleLength(title)) {
          fail(lineNumber, `a song title may be at most ${MAX_SONG_TITLE} characters; "${title}" is ${title.length}. Shorten it, or use fewer words.`);
          break;
        }
        commands.push({ kind: 'title', line: lineNumber, title });
        break;
      }
      case 'key': {
        // Two spellings, one reader: `key D minor` and `key Dm` are the same
        // command, because a key is a note and a scale however it is written.
        if (args.length === 0) {
          fail(lineNumber, `key needs a note and a scale, e.g. key D minor. Scales: ${SCALE_SPELLINGS}.`);
          break;
        }
        const text = args.join(' ');
        const parsed = parseKey(text);
        if (!parsed) {
          // Say which HALF is wrong: a bad tonic and a bad scale want different
          // fixes, and "that is not a key" would send an author hunting in the
          // wrong place.
          fail(lineNumber, /^[A-G]/i.test(args[0])
            ? `"${text}" is not a scale Tracklet knows. Scales: ${SCALE_SPELLINGS}.`
            : `a key starts with a note letter: "${text}" does not. Try key D minor or key F# major.`);
          break;
        }
        commands.push({ kind: 'key', line: lineNumber, key: parsed });
        break;
      }
      case 'tempo': {
        // Three shapes, and the two odd ones are the TEMPO MAP: `tempo 140` is
        // the song's tempo, `tempo 140 at 5` is a new tempo from bar 5, and
        // `tempo 90 by 9` is a slide into it. `at` and `by` are one word apart on
        // purpose — they are the two ways a person says it out loud — and the
        // error below says which is which whenever the guess is wrong.
        if (args.length !== 1 && args.length !== 3) {
          fail(lineNumber, 'tempo needs one number, or a number and a bar: "tempo 128", "tempo 140 at 5" (a new tempo from bar 5) or "tempo 90 by 9" (sliding down to 90 by bar 9).');
          break;
        }
        const bpm = Number(args[0]);
        if (!Number.isFinite(bpm)) { fail(lineNumber, `tempo "${args[0]}" is not a number.`); break; }
        const clamped = clampBpm(bpm);
        if (clamped !== Math.round(bpm)) {
          fail(lineNumber, `tempo ${bpm} is outside ${BPM_MIN}..${BPM_MAX} BPM. Pick a value in that range.`);
          break;
        }
        if (args.length === 1) {
          commands.push({ kind: 'tempo', line: lineNumber, bpm: clamped });
          break;
        }
        const how = args[1].toLowerCase();
        if (how !== 'at' && how !== 'by') {
          fail(lineNumber, `tempo changes need "at" or "by": "tempo 140 at 5" changes on bar 5, "tempo 90 by 9" slides down to 90 over the bars before 9. Got "${args[1]}".`);
          break;
        }
        const slot = Number(args[2]);
        if (!Number.isInteger(slot) || slot < 1 || slot > MAX_ORDER) {
          fail(lineNumber, `a tempo change lands on a bar, 1..${MAX_ORDER}; got "${args[2]}". The bar is a slot of the order, the same number "order" uses.`);
          break;
        }
        // Counted by BAR rather than by statement, so writing the same bar twice
        // is a change of mind rather than a second point. The ceiling is checked
        // here so the author hears about it with a line number, rather than
        // having the last few changes quietly dropped at apply time.
        if (!state.tempoSlots.has(slot)) {
          if (state.tempoSlots.size >= MAX_TEMPO_POINTS) {
            fail(lineNumber, `a song can have at most ${MAX_TEMPO_POINTS} tempo changes; this one already has that many.`);
            break;
          }
          state.tempoSlots.add(slot);
        }
        commands.push({ kind: 'tempoPoint', line: lineNumber, slot, bpm: clamped, slide: how === 'by' });
        break;
      }
      case 'steps': {
        if (args.length !== 1) { fail(lineNumber, `steps needs one number, e.g. steps 32.`); break; }
        const rows = Number(args[0]);
        if (!Number.isInteger(rows) || rows < MIN_ROWS || rows > MAX_ROWS) {
          fail(lineNumber, `steps must be a whole number ${MIN_ROWS}..${MAX_ROWS}; got "${args[0]}".`);
          break;
        }
        // A shorter grid cannot hold the rows already written, so the cursor
        // comes back inside it. The apply step trims the extra rows off every
        // pattern the same way.
        if (state.rowCursor > rows) state.rowCursor = rows;
        state.rows = rows;
        commands.push({ kind: 'steps', line: lineNumber, rows });
        break;
      }
      case 'beat': {
        if (args.length !== 1) { fail(lineNumber, `beat needs one number, e.g. beat 4.`); break; }
        const stepsPerBeat = Number(args[0]);
        if (!Number.isInteger(stepsPerBeat) || stepsPerBeat < MIN_ROWS_PER_BEAT || stepsPerBeat > MAX_ROWS_PER_BEAT) {
          fail(lineNumber, `beat must be a whole number ${MIN_ROWS_PER_BEAT}..${MAX_ROWS_PER_BEAT} (steps per beat); got "${args[0]}".`);
          break;
        }
        state.rowsPerBeat = stepsPerBeat;
        commands.push({ kind: 'beat', line: lineNumber, stepsPerBeat });
        break;
      }
      case 'grid': {
        // Sugar for `steps` + `beat`, worked out from a note value. The bar may
        // SHRINK, so the row cursor comes back inside it, exactly as `steps` does.
        if (args.length !== 1) { fail(lineNumber, `grid needs one name, e.g. grid 16 or grid 8t (eighth-note triplets).`); break; }
        const shape = gridShape(args[0]);
        if (!shape) {
          fail(lineNumber, `grid takes a power of two or its triplet, and this song holds ${MIN_ROWS}..${MAX_ROWS} steps with ${MIN_ROWS_PER_BEAT}..${MAX_ROWS_PER_BEAT} to the beat. The grids are: ${GRID_NAME_LIST}.`);
          break;
        }
        if (state.rowCursor > shape.steps) state.rowCursor = shape.steps;
        state.rows = shape.steps;
        state.rowsPerBeat = shape.stepsPerBeat;
        commands.push({ kind: 'grid', line: lineNumber, shape });
        break;
      }
      case 'meter': {
        if (args.length !== 2) { fail(lineNumber, `meter needs two numbers, e.g. meter 7 8 — seven eighth notes to the bar.`); break; }
        const shape = meterShape(Number(args[0]), Number(args[1]));
        if (!shape) {
          fail(lineNumber, `meter is a whole number of beats and then the note one beat is (${METER_UNIT_LIST}), e.g. meter 7 8, and the bar must come to at most ${MAX_ROWS} steps; got "${args[0]} ${args[1]}".`);
          break;
        }
        if (state.rowCursor > shape.steps) state.rowCursor = shape.steps;
        state.rows = shape.steps;
        state.rowsPerBeat = shape.stepsPerBeat;
        commands.push({ kind: 'meter', line: lineNumber, shape });
        break;
      }
      case 'swing': {
        if (args.length !== 1) { fail(lineNumber, 'swing needs one number 0..100, e.g. swing 60 (0 is straight, 100 is a deep shuffle).'); break; }
        const amount = Number(args[0]);
        if (!Number.isFinite(amount) || amount < MIN_SWING || amount > MAX_SWING) {
          fail(lineNumber, `swing must be a percentage ${MIN_SWING}..${MAX_SWING}; got "${args[0]}". 0 is straight, 100 is a deep shuffle.`);
          break;
        }
        commands.push({ kind: 'swing', line: lineNumber, swing: amount });
        break;
      }
      case 'speed': {
        // The tape transport: one ratio that moves pitch and time together. A
        // percentage like `swing`, but read from a different range because a
        // speed is a RATIO: 100 is normal, 50 is half speed (an octave down).
        if (args.length !== 1) {
          fail(lineNumber, `speed needs one percentage ${SPEED_MIN}..${SPEED_MAX}, e.g. speed 80 for a slower record (100 is normal).`);
          break;
        }
        const amount = Number(args[0]);
        if (!Number.isFinite(amount) || amount < SPEED_MIN || amount > SPEED_MAX) {
          fail(lineNumber, `speed must be a percentage ${SPEED_MIN}..${SPEED_MAX}; got "${args[0]}". 100 plays the song as written, 50 is half speed (an octave down), 200 is double (an octave up).`);
          break;
        }
        commands.push({ kind: 'speed', line: lineNumber, speed: amount });
        break;
      }
      case 'tuning': {
        // How the song is TUNED. A named temperament rather than a table of
        // numbers: the whole point of a tuning is that it is an idea you can name
        // ("just", "meantone") and hear, not twelve frequencies to type.
        if (args.length !== 1) {
          fail(lineNumber, `tuning needs one name, e.g. tuning just. The tunings are: ${tuningNames()}.`);
          break;
        }
        const temperament = tuningFromName(args[0]);
        if (!temperament) {
          fail(lineNumber, `"${args[0]}" is not a tuning. The tunings are: ${tuningNames()}.`);
          break;
        }
        commands.push({ kind: 'tuning', line: lineNumber, tuning: temperament.id });
        break;
      }
      case 'groove': {
        // A named FEEL rather than an amount, because a feel is chosen and not
        // dialled — and because the half of a feel that IS a number is `swing`,
        // right above. `swing 60` and `groove backbeat` compose, and are meant
        // to: a lilted backbeat is a real thing to want.
        if (args.length !== 1) {
          fail(lineNumber, `groove needs one feel, e.g. groove backbeat. The feels are: ${grooveNames()}.`);
          break;
        }
        const feel = grooveFromName(args[0]);
        if (!feel) {
          fail(lineNumber, `"${args[0]}" is not a groove. The feels are: ${grooveNames()}.`);
          break;
        }
        commands.push({ kind: 'groove', line: lineNumber, groove: feel.id });
        break;
      }
      case 'kit': {
        // A whole DRUM KIT, by name: what the four drums sound like. The
        // counterpart of `groove`, one scope over — a feel is how the notes are
        // played and this is what the drums ARE. A word rather than a number, for
        // the reason every closed list here is one — but the list is no longer
        // closed: `808` is one of the four this app ships, and any other word is
        // a kit of YOUR OWN, resolved against the library at PLAY time.
        //
        // Accepted by SHAPE rather than against the library, exactly as a
        // `sample BRK02` is: the library lives in the browser's storage, this
        // file must stay pure, and a song names a kit the way it names a
        // recording — the name travels, the four voices are the app's. A name
        // this machine does not have plays the presets (`kitVoice`); a name that
        // is not a name at all is refused here, while the author is still typing.
        if (args.length !== 1) {
          fail(lineNumber, `kit needs one kit, e.g. kit 808. The built-in kits are: ${kitNames().join(', ')}, or the name of a kit of your own.`);
          break;
        }
        const builtIn = kitFromName(args[0]);
        if (builtIn) {
          commands.push({ kind: 'kit', line: lineNumber, kit: builtIn });
          break;
        }
        if (kitNameProblem(args[0], []) !== null) {
          fail(lineNumber, `"${args[0]}" is not a kit. The built-in kits are: ${kitNames().join(', ')}, and a kit of your own is one word of letters or digits, like MYHOUSE.`);
          break;
        }
        commands.push({ kind: 'kit', line: lineNumber, kit: tidyKitName(args[0]) });
        break;
      }
      case 'machine': {
        // The DRUM MACHINE's own settings: the instrument, not the beat. `pad`
        // below writes the pads and their hits, and this line is the little MIX
        // and clock the machine shares with nothing else. Written only when it
        // says something, so `machine` alone is a machine with its four kit pads
        // and no hits — a place to start rather than an error.
        const command: Extract<ScriptCommand, { kind: 'machine' }> = { kind: 'machine', line: lineNumber };
        const rest = args.slice();
        const tail = rest[rest.length - 1]?.toLowerCase();
        if (tail === 'on' || tail === 'off') {
          command.enabled = tail === 'on';
          rest.pop();
        }
        // `machine order 1 1 2 1` takes the WHOLE line: a list rather than a pair,
        // which is why it is handled before the pairing rule. It is the machine's
        // arrangement — which bar plays in each song bar — so it stands alone.
        if (rest[0]?.toLowerCase() === 'order') {
          const list = rest.slice(1).map((token) => Number(token));
          if (list.length === 0 || list.some((bar) => !Number.isInteger(bar) || bar < 1 || bar > MAX_MACHINE_BARS)) {
            fail(lineNumber, `machine order takes a list of bar numbers 1..${MAX_MACHINE_BARS}, e.g. "machine order 1 1 2 1" — which bar of the machine plays in each bar of the song.`);
            break;
          }
          command.order = list;
          commands.push(command);
          break;
        }
        if (rest.length % 2 !== 0) {
          fail(lineNumber, 'machine takes its settings in pairs — level 80, pan 20, swing 50, steps 16, beat 4, pads 6, bars 3, pattern 2, bus DRUMS, verb 40, echo 20, duck 30, an effect like drive 40, a bare "on"/"off", or "order 1 1 2 1".');
          break;
        }
        let bad = false;
        for (let i = 0; i < rest.length; i += 2) {
          const key = rest[i].toLowerCase();
          const value = rest[i + 1];
          if (key === 'pattern') {
            const which = Number(value);
            if (!Number.isInteger(which) || which < 1 || which > MAX_MACHINE_BARS) {
              fail(lineNumber, `machine pattern is a bar number 1..${MAX_MACHINE_BARS}; got "${value}". The pads BELOW it write into that bar.`);
              bad = true;
              break;
            }
            command.bar = which;
            // The `pad` lines BELOW this one write into that bar, so the parser
            // remembers which bar it is reading, the way `pattern N` steers the
            // grid rows under it.
            state.machineBar = which;
            continue;
          }
          if (key === 'steps') {
            const count = Number(value);
            if (!Number.isInteger(count) || count < MIN_MACHINE_STEPS || count > MAX_MACHINE_STEPS) {
              fail(lineNumber, `machine steps is a whole number ${MIN_MACHINE_STEPS}..${MAX_MACHINE_STEPS} of steps in one bar; got "${value}". 16 is one bar of sixteenths.`);
              bad = true;
              break;
            }
            command.steps = count;
            // The pads BELOW this line are checked against the size the machine
            // will have by the time they land, which is what lets a long pattern
            // be refused for the right reason.
            state.machineSteps = count;
            continue;
          }
          if (key === 'pads') {
            const count = Number(value);
            if (!Number.isInteger(count) || count < 1 || count > MAX_PADS) {
              fail(lineNumber, `machine pads is a whole number 1..${MAX_PADS} (a machine holds at most ${MAX_PADS} pads); got "${value}". Growing fills in kit pads, and shrinking drops the last ones.`);
              bad = true;
              break;
            }
            command.pads = count;
            continue;
          }
          if (key === 'bars') {
            const count = Number(value);
            if (!Number.isInteger(count) || count < 1 || count > MAX_MACHINE_BARS) {
              fail(lineNumber, `machine bars is a whole number 1..${MAX_MACHINE_BARS} (a machine holds at most ${MAX_MACHINE_BARS} bars); got "${value}". Growing copies the last bar, and shrinking drops the last ones.`);
              bad = true;
              break;
            }
            command.bars = count;
            continue;
          }
          if (key === 'beat') {
            const count = Number(value);
            if (!Number.isInteger(count) || count < MIN_MACHINE_BEAT || count > MAX_MACHINE_BEAT) {
              fail(lineNumber, `machine beat is a whole number ${MIN_MACHINE_BEAT}..${MAX_MACHINE_BEAT} of steps in one beat; got "${value}".`);
              bad = true;
              break;
            }
            command.beat = count;
            continue;
          }
          if (key === 'level' || key === 'swing' || key === 'duck') {
            const amount = Number(value);
            if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
              fail(lineNumber, `machine ${key} is a percentage 0..100; got "${value}".`);
              bad = true;
              break;
            }
            if (key === 'level') command.level = Math.round(amount);
            else if (key === 'swing') command.swing = Math.round(amount);
            else command.duck = Math.round(amount);
            continue;
          }
          if (key === 'pan') {
            const pan = panAmount(value);
            if (pan === null) {
              fail(lineNumber, `machine pan must be a place between the speakers ${MIN_PAN}..${MAX_PAN}: "pan -40", "pan L40" or "pan C". Got "${value}".`);
              bad = true;
              break;
            }
            command.pan = pan;
            continue;
          }
          if (key === 'verb' || key === 'echo') {
            const amount = Number(value);
            if (!Number.isFinite(amount) || amount < MIN_SEND || amount > MAX_SEND) {
              fail(lineNumber, `machine ${key} is a send, a percentage ${MIN_SEND}..${MAX_SEND}; got "${value}". ${MAX_SEND} sends all of the machine in, ${MIN_SEND} keeps it dry.`);
              bad = true;
              break;
            }
            if (key === 'verb') command.verb = Math.round(amount);
            else command.echo = Math.round(amount);
            continue;
          }
          if (key === 'bus') {
            if (tidyBusName(value) === '' || sameBusName(value, NO_BUS_WORD)) {
              command.bus = null;
              continue;
            }
            const joined = state.buses.find((one) => sameBusName(one.name, value));
            if (!joined) {
              const have = state.buses.length === 0 ? 'the song has no buses yet' : `the song has: ${busNames(state.buses).join(', ')}`;
              fail(lineNumber, `machine joins a bus the song does not have: "${value}" — ${have}. Declare it above: "bus DRUMS 70" then "machine bus DRUMS".`);
              bad = true;
              break;
            }
            command.bus = joined.name;
            continue;
          }
          const effect = TRACK_EFFECT_BY_ID[key as TrackEffectId];
          if (effect) {
            const amount = Number(value);
            if (!Number.isFinite(amount) || amount < MIN_EFFECT || amount > MAX_EFFECT) {
              fail(lineNumber, `machine ${key} is a percentage ${MIN_EFFECT}..${MAX_EFFECT}; got "${value}". ${MIN_EFFECT} is off, ${MAX_EFFECT} is as ${effect.high} as this app goes.`);
              bad = true;
              break;
            }
            command.effects = { ...command.effects, [effect.id]: Math.round(amount) };
            continue;
          }
          fail(lineNumber, `machine does not take "${rest[i]}". It takes level, pan, swing, steps, beat, pads, bars, pattern, bus, verb, echo, duck, an effect (drive, crush, cab, tape, radio, vinyl, chorus, punch, tilt, gate), a bare "on"/"off", or "order 1 1 2 1".`);
          bad = true;
          break;
        }
        if (!bad) commands.push(command);
        break;
      }
      case 'pad': {
        // One lane of the drum machine: a sound, a place in the mix, and a ROW of
        // hits. It reads like a `track` line, and for the same reason — a pad is a
        // channel one scope down — but its hits are a PATTERN STRING rather than
        // grid rows, because a machine reads top to bottom as pads.
        const padIndex = Number(args[0]);
        if (!Number.isInteger(padIndex) || padIndex < 1 || padIndex > MAX_PADS) {
          fail(lineNumber, `pad number must be 1..${MAX_PADS} (a machine has at most ${MAX_PADS} pads); got "${args[0] ?? ''}".`);
          break;
        }
        // The bar the parser is reading pads into — 1 unless a `machine pattern N`
        // line above changed it. The pad's SOUND is one instrument shared by every
        // bar; only its ROW belongs to a bar, which is why the bar rides on the line.
        const command: Extract<ScriptCommand, { kind: 'pad' }> = { kind: 'pad', line: lineNumber, index: padIndex, bar: state.machineBar };
        const rest = tokens.slice(2);
        let end = rest.length;
        let bad = false;
        for (;;) {
          const word = rest[end - 2];
          const value = rest[end - 1];
          if (!word || !value || word.quoted) break;
          const key = word.text.toLowerCase();
          if (key === 'pattern') {
            const parsed = parsePadPattern(value.text, state.machineSteps, String(padIndex));
            if (!parsed.ok) {
              fail(lineNumber, parsed.message);
              bad = true;
              break;
            }
            command.steps = parsed.row;
            end -= 2;
            continue;
          }
          if (key === 'voice') {
            const preset = voiceFromName(value.text);
            const saved = preset ? null : userVoiceFromName(value.text, voices);
            if (!preset && !saved) {
              const mine = voices.length > 0 ? ` Yours: ${userVoiceNames(voices)}.` : '';
              fail(lineNumber, `"${value.text}" is not a voice. Voices: ${VOICE_NAMES}.${mine}`);
              bad = true;
              break;
            }
            command.voice = preset ? preset.id : saved!.name;
            end -= 2;
            continue;
          }
          if (key === 'wave') {
            const wave = waveFromName(value.text);
            if (!wave) {
              fail(lineNumber, `wave must be square, triangle, saw, sine, noise, table, sample, fm, string, formant, organ, granular, font, reed, brass, bow, mallet, membrane or plate; got "${value.text}".`);
              bad = true;
              break;
            }
            command.wave = wave;
            end -= 2;
            continue;
          }
          if (key === 'level' || key === 'pan' || key === 'tune') {
            if (key === 'pan') {
              const pan = panAmount(value.text);
              if (pan === null) {
                fail(lineNumber, `pad pan must be a place between the speakers ${MIN_PAN}..${MAX_PAN}: "pan -40", "pan L40" or "pan C". Got "${value.text}".`);
                bad = true;
                break;
              }
              command.pan = pan;
              end -= 2;
              continue;
            }
            const amount = Number(value.text);
            const low = key === 'level' ? MIN_LEVEL : -24;
            const high = key === 'level' ? MAX_LEVEL : 24;
            if (!Number.isFinite(amount) || amount < low || amount > high) {
              fail(lineNumber, key === 'level'
                ? `pad level is a percentage ${MIN_LEVEL}..${MAX_LEVEL}; got "${value.text}".`
                : `pad tune is a whole number of semitones ${low}..${high}; got "${value.text}".`);
              bad = true;
              break;
            }
            if (key === 'level') command.level = Math.round(amount);
            else command.tune = Math.round(amount);
            end -= 2;
            continue;
          }
          if (key === 'sample') {
            // Which recording of YOURS this pad plays — the SAME reference a channel
            // carries, and the same promise: a name the app does not have is the
            // FALLBACK rather than an error, so a pad on a recording you lack plays
            // the built-in one-shot its `voice` selects, exactly as it would have if
            // the line had never been written. The bank is the APP's, so refusing an
            // unknown name would make a song that plays on your machine refuse to
            // load on somebody else's.
            const wanted = value.text;
            if (tidySampleName(wanted) === '' || sameSampleName(wanted, NO_SAMPLE_WORD)) {
              command.sample = null;
              end -= 2;
              continue;
            }
            const problem = sampleNameProblem(wanted);
            if (problem !== null) {
              fail(lineNumber, `pad sample needs a name: ${problem}. Or "sample ${NO_SAMPLE_WORD}" to leave the one this pad is on.`);
              bad = true;
              break;
            }
            command.sample = tidySampleName(wanted);
            end -= 2;
            continue;
          }
          const param = paramWord(key);
          if (param) {
            const amount = Number(value.text);
            if (!Number.isFinite(amount) || amount < MIN_PARAM || amount > MAX_PARAM) {
              fail(lineNumber, `${param} is a percentage ${MIN_PARAM}..${MAX_PARAM}; got "${value.text}". 0 is ${VOICE_PARAM_BY_ID[param].low}, 100 is ${VOICE_PARAM_BY_ID[param].high}.`);
              bad = true;
              break;
            }
            command.params = { ...command.params, [param]: Math.round(amount) };
            end -= 2;
            continue;
          }
          break;
        }
        if (bad) break;
        const nameTokens = rest.slice(0, end);
        if (nameTokens.length > 0) {
          const name = nameTokens.map((token) => token.text).join(' ').toUpperCase();
          if (name.length > MAX_PAD_NAME) {
            fail(lineNumber, `a pad name may be at most ${MAX_PAD_NAME} characters; "${name}" is ${name.length}.`);
            break;
          }
          command.name = name;
        }
        commands.push(command);
        break;
      }
      case 'chip': {
        // A whole console, by name. It sets every channel's SOUND from the
        // machine's line-up, so `chip nes` is how a song stops being a synth and
        // starts being hardware. An action rather than a property, for the reason
        // in `model/chip.ts`: the voices are the truth and a chip is a way to set
        // them, so nothing has to be remembered that a knob could contradict.
        if (args.length !== 1) {
          fail(lineNumber, `chip needs one console, e.g. chip nes. The consoles are: ${chipNames()}.`);
          break;
        }
        const console_ = chipFromName(args[0]);
        if (!console_) {
          fail(lineNumber, `"${args[0]}" is not a chip. The consoles are: ${chipNames()}.`);
          break;
        }
        // The console REPLACES every channel's sound when it runs, stacks
        // included, so the layer counts the parser carries reset with it — or a
        // `layer` line after a `chip` line would be checked against layers that
        // are about to be thrown away, and would apply to a stack that no longer
        // exists.
        state.layerCounts = state.layerCounts.map(() => 1);
        commands.push({ kind: 'chip', line: lineNumber, chip: console_.id });
        break;
      }
      case 'volume': {
        if (args.length !== 1) { fail(lineNumber, 'volume needs one number, e.g. volume 70.'); break; }
        const percent = Number(args[0]);
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
          fail(lineNumber, `volume must be a percentage 0..100; got "${args[0]}".`);
          break;
        }
        commands.push({ kind: 'volume', line: lineNumber, volume: percent / 100 });
        break;
      }
      case 'reverb':
      case 'echo': {
        if (args.length !== 1) {
          fail(lineNumber, `${head} needs one number ${MIN_ROOM}..${MAX_ROOM}, e.g. ${head} 40 (0 is dry, 100 is soaked).`);
          break;
        }
        const amount = Number(args[0]);
        if (!Number.isFinite(amount) || amount < MIN_ROOM || amount > MAX_ROOM) {
          fail(lineNumber, `${head} must be a percentage ${MIN_ROOM}..${MAX_ROOM}; got "${args[0]}". 0 is dry (off), 100 is as wet as this app goes.`);
          break;
        }
        commands.push(
          head === 'reverb'
            ? { kind: 'reverb', line: lineNumber, reverb: Math.round(amount) }
            : { kind: 'echo', line: lineNumber, echo: Math.round(amount) },
        );
        break;
      }
      case 'master': {
        // The MIX's effects. Read exactly the way a `track` line reads them —
        // words in pairs, clamped nowhere (an out-of-range number is refused with
        // the same sentence a track line uses, so there is one thing to learn) —
        // and written as one command because these six travel as one set.
        if (args.length === 0) {
          fail(lineNumber, `master needs at least one effect and a percentage ${MIN_EFFECT}..${MAX_EFFECT}, e.g. "master drive 20 tilt 15". The effects are: ${EFFECT_WORD_LIST}.`);
          break;
        }
        const effects: Partial<ChannelEffects> = {};
        let bad = false;
        for (let i = 0; i < args.length; i += 2) {
          const key = args[i].toLowerCase();
          const effect = TRACK_EFFECT_BY_ID[key as TrackEffectId];
          if (!effect) {
            fail(lineNumber, `master takes the effects in pairs: ${EFFECT_WORD_LIST}. Got "${args[i]}". Shape ONE channel on its track line; the room is "reverb 30".`);
            bad = true;
            break;
          }
          const value = args[i + 1];
          if (value === undefined) {
            fail(lineNumber, `master ${key} needs a percentage ${MIN_EFFECT}..${MAX_EFFECT}, e.g. "master ${key} 20".`);
            bad = true;
            break;
          }
          const amount = Number(value);
          if (!Number.isFinite(amount) || amount < MIN_EFFECT || amount > MAX_EFFECT) {
            fail(lineNumber, `${key} is a percentage ${MIN_EFFECT}..${MAX_EFFECT}; got "${value}". ${MIN_EFFECT} is off, ${MAX_EFFECT} is as ${effect.high} as this app goes.`);
            bad = true;
            break;
          }
          effects[effect.id] = Math.round(amount);
        }
        if (bad) break;
        commands.push({ kind: 'master', line: lineNumber, effects });
        break;
      }
      case 'automate': {
        // A lane: one channel, one thing to move, two ends, and the bars it
        // spans. Positional rather than paired words, because a range is not a
        // list of settings — it is one sentence, and it is written the way it is
        // read: "automate 2 bright 15 95 bars 8 to 15".
        const words = AUTOMATION_TARGET_WORDS.join(', ');
        if (args.length === 0) {
          fail(lineNumber, `automate needs a channel, a knob, two values and the bars it spans, e.g. "automate 2 bright 15 95 bars 8 to 15". A lane can move: ${words}.`);
          break;
        }
        const trackIndex = Number(args[0]);
        if (!Number.isInteger(trackIndex) || trackIndex < 1 || trackIndex > state.trackCount) {
          fail(lineNumber, `automate takes a channel NUMBER first, 1..${state.trackCount}, e.g. "automate 2 bright 15 95 bars 8 to 15"; got "${args[0]}". Use "tracks N" first to add channels.`);
          break;
        }
        const target = args[1]?.toLowerCase() ?? '';
        if (!isAutomationTarget(target)) {
          fail(lineNumber, `"${args[1] ?? ''}" is not something a lane can move. A lane can move: ${words}. The effects, pan and the sends are built only when they are above zero, so a curve cannot fade them in from nothing — set those on the track line instead.`);
          break;
        }
        const info = AUTOMATION_TARGET_BY_ID[target];
        const ends: number[] = [];
        let bad = false;
        for (const text of [args[2], args[3]]) {
          const value = Number(text);
          if (text === undefined || text === '' || !Number.isFinite(value) || value < info.min || value > info.max) {
            fail(lineNumber, `${target} runs ${info.min}..${info.max}, ${info.low} to ${info.high}; got "${text ?? ''}". A lane needs both ends: the value it leaves and the value it arrives at, e.g. "automate 2 ${target} ${info.min} ${info.max} bars 8 to 15".`);
            bad = true;
            break;
          }
          ends.push(Math.round(value));
        }
        if (bad) break;
        const range = args.slice(4).map((word) => word.toLowerCase());
        const wellFormed = range[0] === 'bars'
          && ((range.length === 2 && Number.isFinite(Number(range[1])))
            || (range.length === 4 && range[2] === 'to' && Number.isFinite(Number(range[1])) && Number.isFinite(Number(range[3]))));
        if (!wellFormed) {
          fail(lineNumber, `a lane needs the bars it spans, written "bars 8 to 15" (or "bars 8" for one bar), 1..${MAX_ORDER} — the same numbers "order" uses. Got "${args.slice(4).join(' ')}".`);
          break;
        }
        const startBar = Number(range[1]);
        const endBar = range.length === 4 ? Number(range[3]) : startBar;
        if (startBar < 1 || startBar > MAX_ORDER || endBar < 1 || endBar > MAX_ORDER) {
          fail(lineNumber, `bars are 1..${MAX_ORDER}, the same numbers the order uses; got "${range[1]}" to "${range.length === 4 ? range[3] : range[1]}".`);
          break;
        }
        if (startBar > endBar) {
          fail(lineNumber, `a lane runs from an earlier bar to a later one, e.g. "bars 8 to 15"; got "bars ${startBar} to ${endBar}". Swap them, or write two lanes if the value should rise and then fall.`);
          break;
        }
        if (state.laneCount >= MAX_AUTOMATION_LANES) {
          fail(lineNumber, `a song may have at most ${MAX_AUTOMATION_LANES} automation lanes, and this one already has ${MAX_AUTOMATION_LANES}. Take one out first.`);
          break;
        }
        state.laneCount += 1;
        commands.push({
          kind: 'automate', line: lineNumber, track: trackIndex, target,
          from: ends[0], to: ends[1], startBar, endBar,
        });
        break;
      }
      case 'section': {
        // A NAME for a group of bars: the pattern numbers it plays, in order.
        // Nothing about the sound changes until an `arrange` line uses it, which
        // is what makes the form of a song one line to write and one to change.
        if (args.length === 0) {
          fail(lineNumber, 'section needs a name and the bars it holds, e.g. "section VERSE 1 1 2 1" (the pattern numbers that section plays).');
          break;
        }
        const problem = sectionNameProblem(args[0]);
        if (problem !== null) {
          fail(lineNumber, problem);
          break;
        }
        const name = tidySectionName(args[0]);
        // The `machine N` key names the drum machine BAR this section plays, and
        // is plucked out before the bars are read — a bar is a pattern NUMBER, so
        // the word cannot be confused with one.
        const rest = args.slice(1);
        let machineBar: number | null = null;
        const machineAt = rest.findIndex((token) => token.toLowerCase() === 'machine');
        if (machineAt >= 0) {
          const value = rest[machineAt + 1];
          const n = value === undefined ? Number.NaN : Number(value);
          if (!Number.isInteger(n) || n < 1 || n > MAX_MACHINE_BARS) {
            fail(lineNumber, `section ${name} machine names which bar of the drum machine the section plays, 1..${MAX_MACHINE_BARS}, e.g. "section ${name} 1 1 machine 2".`);
            break;
          }
          machineBar = n;
          rest.splice(machineAt, 2);
        }
        if (rest.length === 0) {
          fail(lineNumber, `section ${name} needs at least one bar: the pattern numbers it plays, e.g. "section ${name} 1 1 2 1".`);
          break;
        }
        if (rest.length > MAX_ORDER) {
          fail(lineNumber, `a section holds at most ${MAX_ORDER} bars, the most a song plays; this one has ${rest.length}. Shorten it, or make two sections.`);
          break;
        }
        const bars: number[] = [];
        let badBar = false;
        for (const arg of rest) {
          const n = Number(arg);
          if (!Number.isInteger(n) || n < 1 || n > MAX_PATTERNS) {
            // A word here is almost always a second word of the NAME — the
            // tokenizer hands `section MY CHORUS 1 2` to this branch as the name
            // `MY` and the bar `CHORUS` — so the message says what a name is
            // before it says what a bar is.
            fail(lineNumber, `section ${name} takes pattern numbers 1..${MAX_PATTERNS}; got "${arg}". A section NAME is one word and its BARS are pattern numbers, e.g. "section ${name} 1 1 2 1".`);
            badBar = true;
            break;
          }
          bars.push(n);
        }
        if (badBar) break;
        // The parser's own list moves with the script, so a LATER line may name
        // this section — `arrange` below reads what the lines above defined.
        const known = state.sections.findIndex((one) => one.name === name);
        if (known < 0 && state.sections.length >= MAX_SECTIONS) {
          fail(lineNumber, `a song may have at most ${MAX_SECTIONS} named sections, and this one already has ${MAX_SECTIONS}. Use one of the names it has, or replace one.`);
          break;
        }
        if (known >= 0) state.sections[known] = { name, bars, machineBar };
        else state.sections.push({ name, bars, machineBar });
        commands.push({ kind: 'section', line: lineNumber, name, bars, machineBar });
        break;
      }
      case 'progression': {
        // The chord LOOP, written once. Nothing plays it: it is a definition the
        // followers below read, which is why this branch does no writing and why
        // the state it leaves behind is the thing that matters.
        if (args.length === 0) {
          fail(lineNumber, `progression needs at least one chord, e.g. progression Am F C G (or in the song\u2019s key: progression 1 6 3 7), optionally followed by "hold N" for how many steps each chord lasts.`);
          break;
        }
        if (args[0].toLowerCase() === PROGRESSION_NONE_WORD) {
          if (args.length > 1) {
            fail(lineNumber, `progression ${PROGRESSION_NONE_WORD} takes nothing else — it clears the loop, so the rest of this line (${args.slice(1).join(' ')}) would be lost.`);
            break;
          }
          state.progression = null;
          commands.push({ kind: 'progression', line: lineNumber, progression: null });
          break;
        }
        // The `hold` clause is found by SHAPE rather than by position — the same
        // way a cell finds its articulation — so a chord cannot be mistaken for
        // the clause's number.
        const holdAt = args.findIndex((arg) => arg.toLowerCase() === PROGRESSION_HOLD_WORD);
        const chordWords = holdAt < 0 ? args : args.slice(0, holdAt);
        let hold = DEFAULT_PROGRESSION_HOLD;
        if (holdAt >= 0) {
          const value = Number(args[holdAt + 1]);
          if (args.length < holdAt + 2 || !Number.isInteger(value) || value < MIN_PROGRESSION_HOLD || value > MAX_PROGRESSION_HOLD) {
            fail(lineNumber, `"${PROGRESSION_HOLD_WORD}" needs a number of steps ${MIN_PROGRESSION_HOLD}..${MAX_PROGRESSION_HOLD} — how long each chord lasts — e.g. progression Am F C G ${PROGRESSION_HOLD_WORD} 8. The default is ${DEFAULT_PROGRESSION_HOLD}, one beat.`);
            break;
          }
          if (args.length > holdAt + 2) {
            fail(lineNumber, `give the ${PROGRESSION_HOLD_WORD} once and last: "${args[holdAt + 2]}" comes after it.`);
            break;
          }
          hold = value;
        }
        if (chordWords.length > MAX_PROGRESSION_STEPS) {
          fail(lineNumber, `a progression holds at most ${MAX_PROGRESSION_STEPS} chords; this one has ${chordWords.length}.`);
          break;
        }
        const steps: Progression['steps'] = [];
        let badChord = false;
        for (let i = 0; i < chordWords.length; i += 1) {
          const word = chordWords[i];
          const asDegree = parseDegree(word);
          if (asDegree !== null) {
            steps.push({ kind: 'degree', degree: asDegree });
            continue;
          }
          const named = parseChordName(word);
          if (named === null) {
            // A chord name is ONE token here, so `C maj7` arrives as the chord C
            // and the word `maj7` — which is worth saying, because the answer is
            // to close the gap rather than to learn a different chord.
            // A two-word chord name is the mistake worth naming. It is the word
            // AFTER a valid chord that fails — `C maj7` reads as the chord C and
            // then a word that is nothing — so the join that matters is this word
            // onto the one before it, and when that is a chord the message spells
            // out the spelling the author meant instead of listing the shapes.
            const joined = i > 0 ? parseChordName(`${chordWords[i - 1]}${word}`) : null;
            fail(lineNumber, joined === null
              ? `"${word}" is not a chord. Each step is a chord name (Am, F#7, Bbdim, Cmaj7, ${CHORD_SPELLINGS}) or a scale degree 1..7 — e.g. progression Am F C G.`
              : `progression steps are single words: write "${chordWords[i - 1]}${word}" rather than "${chordWords[i - 1]} ${word}".`);
            badChord = true;
            break;
          }
          steps.push({ kind: 'name', root: named.root, quality: named.quality });
        }
        if (badChord) break;
        state.progression = withProgressionSteps(steps, hold);
        commands.push({ kind: 'progression', line: lineNumber, progression: state.progression });
        break;
      }
      case 'arrange': {
        // The order, written with names. It BUILDS the order rather than
        // describing it, so the song that plays is exactly the song the
        // equivalent `order` line would have played.
        if (args.length === 0) {
          fail(lineNumber, 'arrange needs one or more section names, e.g. "arrange VERSE CHORUS VERSE". A section is defined above it with "section NAME 1 1 2 1".');
          break;
        }
        // A name, or `repeat N` to play the name before it N times in all — a
        // MODIFIER on the statement rather than a second way to build an order,
        // which is the language's own preference. It expands HERE, so everything
        // downstream (the order, the file's arrangement claim, the form view)
        // sees the list of names a hand would have typed out.
        const names: string[] = [];
        let repeatSaid = false;
        let bad = false;
        for (let i = 0; i < args.length; i += 1) {
          if (args[i].toLowerCase() !== REPEAT_WORD) {
            names.push(tidySectionName(args[i]));
            repeatSaid = false;
            continue;
          }
          if (names.length === 0 || repeatSaid) {
            fail(lineNumber, repeatSaid
              ? `give one count: the section before this is already repeated — write "repeat 4" for four times rather than two repeats of two.`
              : `"repeat" repeats the section named just before it, so write the name first — e.g. "arrange VERSE CHORUS ${REPEAT_WORD} 2".`);
            bad = true;
            break;
          }
          const count = args[i + 1];
          const times = Number(count);
          if (count === undefined || !Number.isInteger(times) || times < MIN_REPEAT || times > MAX_REPEAT) {
            fail(lineNumber, count !== undefined && times === 1
              ? `"${REPEAT_WORD} 1" is just the name on its own: write it once, or "${REPEAT_WORD} 2" to play it twice.`
              : `"${REPEAT_WORD}" needs how many times the section plays in all, ${MIN_REPEAT}..${MAX_REPEAT}, e.g. "arrange CHORUS ${REPEAT_WORD} 4"; got "${count ?? ''}".`);
            bad = true;
            break;
          }
          const name = names[names.length - 1];
          for (let n = 1; n < times; n += 1) names.push(name);
          repeatSaid = true;
          i += 1;
        }
        if (bad) break;
        const { bars, missing } = arrangementBars(state.sections, names);
        if (missing !== null) {
          const have = state.sections.length === 0
            ? 'the song has none yet'
            : `the song has: ${state.sections.map((one) => one.name).join(', ')}`;
          fail(lineNumber, `arrange names a section the song does not have: "${missing}" — ${have}. A section is written ABOVE the line that arranges it, the way "tracks N" comes before the channels it adds.`);
          break;
        }
        if (bars.length > MAX_ORDER) {
          fail(lineNumber, `that arrangement is ${bars.length} bars long, and a song plays at most ${MAX_ORDER}. Use fewer sections, or shorter ones.`);
          break;
        }
        commands.push({ kind: 'arrange', line: lineNumber, names });
        break;
      }
      case 'scene': {
        // One row of the LIVE page's launch grid: a name and the pattern each
        // channel plays in it, `-` for a channel that plays nothing. A DEFINITION
        // rather than a setting — a scene is stored in the song and performed
        // later — so it follows the order rule `section` does: the list the parser
        // keeps is what a later line about the same name replaces.
        if (args.length === 0) {
          fail(lineNumber, 'scene needs a name and at least one clip, e.g. "scene A 1 1 - 2" (the pattern each channel plays, with "-" for a channel that is silent).');
          break;
        }
        const problem = sceneNameProblem(args[0]);
        if (problem !== null) {
          fail(lineNumber, problem);
          break;
        }
        const name = tidySceneName(args[0]);
        const words = args.slice(1);
        // The optional `kit N` clause: the drum-machine bar the scene performs,
        // or `kit off` for a scene that sits the machine out. It is pulled out
        // before the clips are read, so it can sit anywhere after the name.
        let machine: number | null = null;
        const kitAt = words.findIndex((word) => word.toLowerCase() === 'kit');
        if (kitAt >= 0) {
          const value = words[kitAt + 1];
          if (value === undefined) {
            fail(lineNumber, `scene ${sceneNameSpelling(name)} kit needs a bar number, e.g. "scene ${sceneNameSpelling(name)} 1 1 2 2 kit 2", or "kit off" for a scene that sits the machine out.`);
            break;
          }
          const off = ['off', 'none', 'no'].includes(value.toLowerCase());
          const bar = off ? 0 : Number(value);
          if (!off && (!Number.isInteger(bar) || bar < 1 || bar > MAX_MACHINE_BARS)) {
            fail(lineNumber, `scene ${sceneNameSpelling(name)} kit takes a drum-machine bar 1..${MAX_MACHINE_BARS}, or "off"; got "${value}".`);
            break;
          }
          machine = off ? null : bar;
          words.splice(kitAt, 2);
        }
        if (words.length === 0) {
          fail(lineNumber, `scene ${sceneNameSpelling(name)} needs at least one clip: the pattern each channel plays, e.g. "scene ${sceneNameSpelling(name)} 1 1 - 2", or "-" for a silent channel.`);
          break;
        }
        if (words.length > state.trackCount) {
          // A scene is ONE ENTRY PER CHANNEL, so naming more clips than the song
          // has channels is a line about the wrong song rather than a number to
          // clamp — and the fix is to leave the silent channels out.
          fail(lineNumber, `scene ${sceneNameSpelling(name)} names ${words.length} clips and the song has ${state.trackCount} channel${state.trackCount === 1 ? '' : 's'}. A scene is one clip per channel — leave a silent channel out rather than naming more, e.g. "scene ${sceneNameSpelling(name)} 1 - 2".`);
          break;
        }
        const clips: (number | null)[] = [];
        let badClip = false;
        for (const word of words) {
          if (isSceneSilenceWord(word)) {
            clips.push(null);
            continue;
          }
          const n = Number(word);
          if (!Number.isInteger(n) || n < 1 || n > MAX_PATTERNS) {
            // A second word of the NAME arrives as a clip — the tokenizer hands
            // `scene MY BREAK 1 2` to this branch as the name `MY` and the clip
            // `BREAK` — so the message says what a name is before it says what a
            // clip is, exactly as the section branch does.
            fail(lineNumber, `scene ${sceneNameSpelling(name)} takes pattern numbers 1..${MAX_PATTERNS} or "-" for silence; got "${word}". A scene NAME is one word (quote it if it has a space) and its clips are what each channel plays, e.g. "scene A 1 1 - 2".`);
            badClip = true;
            break;
          }
          clips.push(n);
        }
        if (badClip) break;
        const known = state.scenes.findIndex((one) => one.name === name);
        if (known < 0 && state.scenes.length >= MAX_SCENES) {
          fail(lineNumber, `a song may hold at most ${MAX_SCENES} scenes, and this one already has ${MAX_SCENES}. Use one of the names it has, or replace one.`);
          break;
        }
        const scene: Scene = { name, clips, machine };
        if (known >= 0) state.scenes[known] = scene;
        else state.scenes.push(scene);
        commands.push({ kind: 'scene', line: lineNumber, name, clips: clips.slice(), machine });
        break;
      }
      case 'solo': {
        // Which channels ALONE are heard. `solo off` is the way to un-solo
        // everything, and it is one word rather than a second keyword because a
        // script that solos something should be able to put the song back.
        const off = args.length === 1 && ['off', 'none', 'no'].includes(args[0].toLowerCase());
        if (args.length === 0) {
          fail(lineNumber, `solo needs one or more channel numbers 1..${state.trackCount} (or \"solo off\" to hear everything again), e.g. solo 2.`);
          break;
        }
        const channels: number[] = [];
        let bad = false;
        if (!off) {
          for (const arg of args) {
            const index = Number(arg);
            if (!Number.isInteger(index) || index < 1 || index > state.trackCount) {
              fail(lineNumber, `solo takes channel numbers 1..${state.trackCount}; got \"${arg}\". Write \"tracks ${state.trackCount}\" before this line if the song needs more channels.`);
              bad = true;
              break;
            }
            if (!channels.includes(index)) channels.push(index);
          }
        }
        if (bad) break;
        commands.push({ kind: 'solo', line: lineNumber, channels });
        break;
      }
      case 'chords': {
        // What one keypress WRITES from now on: the `CHORDS` button in THIS CELL.
        // It is editor state rather than song data — the notes a chord writes are
        // `chord`'s job — but a script that means its song to be continued by
        // hand can say how.
        if (args.length !== 1) {
          fail(lineNumber, 'chords needs one word: chords off, chords triad or chords 7th.');
          break;
        }
        const word = args[0].toLowerCase();
        const degrees = CHORD_MODE_WORDS[word];
        if (degrees === undefined) {
          fail(lineNumber, `\"${args[0]}\" is not a chord mode. Use \"chords off\", \"chords triad\" (3 notes) or \"chords 7th\" (4 notes).`);
          break;
        }
        commands.push({ kind: 'chords', line: lineNumber, degrees });
        break;
      }
      case 'hear': {
        if (args.length !== 1 || !['on', 'off'].includes(args[0].toLowerCase())) {
          fail(lineNumber, `hear needs on or off, e.g. \"hear on\" (play each note as the cursor reaches it). Got \"${args.join(' ')}\".`);
          break;
        }
        commands.push({ kind: 'hear', line: lineNumber, on: args[0].toLowerCase() === 'on' });
        break;
      }
      case 'export': {
        // TWO SESSION SETTINGS in one statement — the LOOP REGION (which bars an
        // export renders) and the LOUDNESS target (how loud they arrive) — and
        // both travel out in `settings` like `theme` rather than living in a song.
        //
        // `bars A to B` rather than a new grammar: `bars` is the word `automate`
        // already uses for a range of BARS, and `A to B` is the shape `rows` takes,
        // so the region is two words this language already had. `loud` is the one
        // new word, and it is a value on a statement rather than a statement —
        // see §5 of the roadmap, which asks for exactly that before a new verb.
        //
        // The two clauses are taken off the front of the line IN EITHER ORDER and
        // each at most once, so `export loud -14 bars 2 to 3` and `export bars 2 to
        // 3 loud -14` are the same instruction, and a leftover token is refused
        // once at the end rather than in the middle of a half-written sentence.
        const tokens = args.slice();
        const isWord = (at: number, word: string): boolean =>
          (tokens[at] ?? '').toLowerCase() === word;
        let range: BounceRange | null | undefined;
        let loud: number | null | undefined;

        while (tokens.length > 0) {
          if (range === undefined && isWord(0, BOUNCE_ALL_WORD)) {
            range = null;
            tokens.shift();
            continue;
          }
          if (range === undefined && isWord(0, BOUNCE_BARS_WORD)) {
            const from = Number(tokens[1]);
            const to = Number(tokens[3]);
            if (
              tokens.length < 4
              || !isWord(2, BOUNCE_TO_WORD)
              || !Number.isInteger(from)
              || !Number.isInteger(to)
            ) {
              fail(lineNumber, `export bars needs two whole bar numbers, e.g. export bars 8 to 15; got "${tokens.slice(1).join(' ')}".`);
              break;
            }
            if (from < 1 || to < 1) {
              fail(lineNumber, `bars are counted from 1, so export bars ${from} to ${to} starts before the song.`);
              break;
            }
            if (to < from) {
              fail(lineNumber, `export bars ${from} to ${to} counts backwards - write the first bar before the last.`);
              break;
            }
            range = { from, to };
            tokens.splice(0, 4);
            continue;
          }
          if (loud === undefined && isWord(0, LOUDNESS_WORD)) {
            const target = Number(tokens[1]);
            if ((tokens[1] ?? '').toLowerCase() === LOUDNESS_OFF_WORD) {
              loud = null;
              tokens.splice(0, 2);
              continue;
            }
            if (tokens.length < 2 || !Number.isFinite(target)) {
              fail(lineNumber, `export loud needs a target in dB, e.g. export loud -14 - or export loud off.`);
              break;
            }
            if (target < LOUDNESS_MIN || target > LOUDNESS_MAX) {
              fail(lineNumber, `export loud ${tokens[1]} is outside ${LOUDNESS_MIN} to ${LOUDNESS_MAX} LUFS.`);
              break;
            }
            loud = target;
            tokens.splice(0, 2);
            continue;
          }
          break;
        }
        // A token the two clauses did not take is a mistake, and the refusal is
        // written once so it reads the same whichever clause was half-finished.
        if (tokens.length > 0) {
          fail(lineNumber, `export takes nothing else after that; got "${tokens.join(' ')}".`);
          break;
        }
        if (range === undefined && loud === undefined) {
          fail(lineNumber, `export needs something to set, e.g. export bars 8 to 15, export all, or export loud -14.`);
          break;
        }
        const command: {
          kind: 'export';
          line: number;
          range?: BounceRange | null;
          loud?: number | null;
        } = { kind: 'export', line: lineNumber };
        if (range !== undefined) command.range = range;
        if (loud !== undefined) command.loud = loud;
        commands.push(command);
        break;
      }
      case 'octave': {
        if (args.length !== 1) { fail(lineNumber, 'octave needs one number, e.g. octave 4.'); break; }
        const value = Number(args[0]);
        if (!Number.isInteger(value) || value < SCRIPT_OCTAVE_MIN || value > SCRIPT_OCTAVE_MAX) {
          fail(lineNumber, `octave must be a whole number ${SCRIPT_OCTAVE_MIN}..${SCRIPT_OCTAVE_MAX}; got "${args[0]}".`);
          break;
        }
        state.octave = value;
        commands.push({ kind: 'octave', line: lineNumber, octave: value });
        break;
      }
      case 'theme': {
        // The look of the app. It is a SESSION setting rather than song data —
        // a preference of the person, remembered across songs and never written
        // to a file — so a script can set it and a song can never impose it.
        // The ids come from `themeNames`, a mirror of the framework's own list.
        if (args.length !== 1) {
          fail(lineNumber, `theme needs one name, e.g. theme forge. ${themeNameHint()}`);
          break;
        }
        const id = args[0].toLowerCase();
        if (!isThemeName(id)) {
          fail(lineNumber, `\"${args[0]}\" is not a theme. ${themeNameHint()}`);
          break;
        }
        commands.push({ kind: 'theme', line: lineNumber, theme: id });
        break;
      }
      case 'page': {
        // Which full screen is showing. A view setting like `theme`, never song
        // data, so a script can drive the tabs and a file can never move your
        // screen. The names come from `pages.ts`, a mirror of the dropdown's own
        // list, so a page this build does not have is refused HERE rather than
        // switching to a screen that does not exist.
        if (args.length !== 1) {
          fail(lineNumber, `page needs one name, e.g. page arranger. ${pageNameHint()}`);
          break;
        }
        const id = args[0].toLowerCase();
        if (!isPageName(id)) {
          fail(lineNumber, `"${args[0]}" is not a page. ${pageNameHint()}`);
          break;
        }
        commands.push({ kind: 'page', line: lineNumber, page: id });
        break;
      }
      case 'live': {
        // How a LAUNCH lands: `live quantize 4` waits for the next four-bar line
        // before the launched scene takes over, so a launch is a musical decision
        // rather than a race with the clock. A session setting like `page` — a way
        // of PERFORMING the song rather than the song — so it travels out in
        // `settings` and no file carries it.
        const word = (args[0] ?? '').toLowerCase();
        if (word !== 'quantize') {
          fail(lineNumber, 'live takes "quantize", e.g. "live quantize 4": how many bars a launched scene waits for. A quantize of 0 launches at the next step.');
          break;
        }
        if (args.length !== 2) {
          fail(lineNumber, `"live quantize" needs one number of bars, ${MIN_LIVE_QUANTIZE}..${MAX_LIVE_QUANTIZE}, e.g. "live quantize 4". 0 (or off) launches at the next step.`);
          break;
        }
        const off = ['off', 'none', 'no'].includes(args[1].toLowerCase());
        const bars = off ? 0 : Number(args[1]);
        if (!Number.isInteger(bars) || bars < MIN_LIVE_QUANTIZE || bars > MAX_LIVE_QUANTIZE) {
          fail(lineNumber, `"live quantize" takes how many bars a launch waits for, ${MIN_LIVE_QUANTIZE}..${MAX_LIVE_QUANTIZE} (0 is immediate), e.g. "live quantize 4"; got "${args[1]}".`);
          break;
        }
        commands.push({ kind: 'liveQuantize', line: lineNumber, bars });
        break;
      }
      case 'instrument': {
        // Three statements in one word, the way the F2 menu has three rows: USE
        // is which imported instrument a `wave font` channel plays, IMPORT opens
        // the file picker for a Noislet export, LOAD fetches a `.sf2` from a
        // path. None is song data — the song only ever says `wave font` — so all
        // three travel out in `settings`.
        const word = (args[0] ?? '').toLowerCase();
        if (word === 'use') {
          const query = args.slice(1).join(' ').trim();
          if (query === '') {
            fail(lineNumber, 'instrument use needs a name or a number, e.g. instrument use 2 or instrument use "GRAVEL KIT".');
            break;
          }
          commands.push({ kind: 'instrumentUse', line: lineNumber, query });
          break;
        }
        if (word === 'import') {
          commands.push({ kind: 'instrumentImport', line: lineNumber });
          break;
        }
        if (word === 'load') {
          // Quoted or not, and joined back into one string either way, because a
          // font's file name is full of spaces and brackets: `instrument load
          // "Donkey Kong Country Exp (Sam Miller).sf2"` is an ordinary thing to
          // want, and the tokenizer splits it on those spaces.
          const source = args.slice(1).join(' ').trim();
          if (source === '') {
            fail(lineNumber, 'instrument load needs a path, e.g. instrument load "storage/soundfonts/dkc/font.sf2".');
            break;
          }
          commands.push({ kind: 'instrumentLoad', line: lineNumber, source });
          break;
        }
        fail(lineNumber, `instrument needs "use", "import" or "load", e.g. instrument use 1. It got \"${args[0] ?? ''}\".`);
        break;
      }
      case 'sample': {
        // Two statements in one word, the way `instrument` has three: LOAD fetches
        // a `.wav` from a path, IMPORT opens the file picker for one. Neither is
        // song data — a song only ever NAMES a recording (`track 2 sample BRK`)
        // and never carries it — so both travel out in `settings` and the scene
        // does the fetching, keeping the language free of IO.
        const word = (args[0] ?? '').toLowerCase();
        if (word === 'load') {
          // Quoted or not, and joined back into one string either way: a path is
          // full of slashes and dots, and the tokenizer splits on spaces.
          const source = args.slice(1).join(' ').trim();
          if (source === '') {
            fail(lineNumber, 'sample load needs a path, e.g. sample load "samples/break.wav".');
            break;
          }
          commands.push({ kind: 'sampleLoad', line: lineNumber, source });
          break;
        }
        if (word === 'import') {
          commands.push({ kind: 'sampleImport', line: lineNumber });
          break;
        }
        fail(lineNumber, `sample needs "load" or "import", e.g. sample load "samples/break.wav". To give a CHANNEL one, write it on its track line: track 2 "HOOK" sample BRK. It got \"${args[0] ?? ''}\".`);
        break;
      }
      case 'record': {
        // The RECORDER's TAKE words: capture one from the microphone (`record
        // HOOK`), shape the window of one you have (`record trim`/`record
        // loop`), or pick which one the page shows (`record select`). A take is
        // APP state like the sample bank — never a song field — so none of it is
        // song data and all of it travels out in `settings`; the scene owns the
        // microphone and refuses a capture in words where there is none (the
        // `export.audio` precedent, in the other direction).
        const word = (args[0] ?? '').toLowerCase();
        if (args.length === 0) {
          fail(lineNumber, 'record needs a take name to capture, e.g. record HOOK. To shape a take you have, write record trim HOOK 0.1 2.0 or record loop HOOK 1.0 3.0. A take is app state and never part of the song.');
          break;
        }
        if (word === 'trim' || word === 'loop') {
          if (args.length !== 4) {
            fail(lineNumber, `record ${word} needs a take name and two times in seconds, e.g. record ${word} HOOK 0.2 4.8.`);
            break;
          }
          const name = tidySampleName(args[1]);
          const problem = sampleNameProblem(name);
          if (problem !== null) {
            fail(lineNumber, `record ${word} names a take: ${problem}`);
            break;
          }
          const start = Number(args[2]);
          const end = Number(args[3]);
          if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0 || start > MAX_TAKE_SECONDS || end > MAX_TAKE_SECONDS) {
            fail(lineNumber, `record ${word} takes two times in seconds from the take's own start, 0..${MAX_TAKE_SECONDS}, e.g. record ${word} HOOK 0.2 4.8; got "${args[2]}" and "${args[3]}".`);
            break;
          }
          if (word === 'trim') commands.push({ kind: 'recordTrim', line: lineNumber, name, start, end });
          else commands.push({ kind: 'recordLoop', line: lineNumber, name, start, end });
          break;
        }
        if (word === 'select') {
          if (args.length !== 2) {
            fail(lineNumber, 'record select needs a take name, e.g. record select HOOK \u2014 which take the RECORDER page shows.');
            break;
          }
          const name = tidySampleName(args[1]);
          const problem = sampleNameProblem(name);
          if (problem !== null) {
            fail(lineNumber, `record select names a take: ${problem}`);
            break;
          }
          commands.push({ kind: 'recordSelect', line: lineNumber, name });
          break;
        }
        // Anything else is `record NAME`: capture a take with that name.
        if (args.length !== 1) {
          fail(lineNumber, `record takes one take name to capture, e.g. record HOOK; got ${args.length}. To shape a take you have, write record trim NAME 0.1 2.0 or record loop NAME 1.0 3.0.`);
          break;
        }
        const name = tidySampleName(args[0]);
        const problem = sampleNameProblem(name);
        if (problem !== null) {
          fail(lineNumber, `record names a take: ${problem}`);
          break;
        }
        commands.push({ kind: 'recordCapture', line: lineNumber, name });
        break;
      }
      case 'bus': {
        // A GROUP fader: a name for a set of channels and how loud the set is.
        // Nothing about the sound changes until a track line joins it, which is
        // what makes one line worth writing ("the drums are at 70") and one line
        // worth changing.
        if (args.length === 0) {
          fail(lineNumber, 'bus needs a name and a level, e.g. "bus DRUMS 70" — one fader over the channels that join it with "track 1 bus DRUMS".');
          break;
        }
        const problem = busNameProblem(args[0]);
        if (problem !== null) {
          fail(lineNumber, problem);
          break;
        }
        const busName = tidyBusName(args[0]);
        if (args.length === 1) {
          fail(lineNumber, `bus ${busName} needs a level: a percentage ${MIN_LEVEL}..${MAX_LEVEL}, e.g. "bus ${busName} 70". ${MAX_LEVEL} leaves the channels as loud as their own faders say, ${MIN_LEVEL} silences the group.`);
          break;
        }
        const amount = Number(args[1]);
        if (!Number.isFinite(amount) || amount < MIN_LEVEL || amount > MAX_LEVEL) {
          // A word here is almost always a SECOND word of the name —
          // `bus MY DRUMS 70` reaches this branch as the name `MY` and the level
          // `DRUMS` — so the message says what a name is, and spells the repair
          // out with the two words the author actually wrote.
          fail(lineNumber, `bus ${busName} takes a level ${MIN_LEVEL}..${MAX_LEVEL}; got "${args[1]}". ${MAX_LEVEL} leaves the channels as loud as their own faders say, ${MIN_LEVEL} silences the group. A bus NAME is one word, so if "${args[0]}" and "${args[1]}" were meant as one, write "bus ${tidyBusName(`${args[0]}${args[1]}`)} 70".`);
          break;
        }
        // The parser's own list moves with the script, so a LATER track line may
        // join this bus — the same rule `tracks N` and `section` follow.
        const known = state.buses.findIndex((one) => one.name === busName);
        if (known < 0 && state.buses.length >= MAX_BUSES) {
          fail(lineNumber, `a song may have at most ${MAX_BUSES} buses, and this one already has ${MAX_BUSES}. Use one of the names it has${busNames(state.buses).length > 0 ? ` (${busNames(state.buses).join(', ')})` : ''}, or replace one.`);
          break;
        }
        const level = Math.round(amount);
        if (known >= 0) state.buses[known] = { name: busName, level };
        else state.buses.push({ name: busName, level });
        commands.push({ kind: 'bus', line: lineNumber, name: busName, level });
        break;
      }
      case 'tracks': {
        if (args.length !== 1) { fail(lineNumber, 'tracks needs one number, e.g. tracks 4.'); break; }
        const count = Number(args[0]);
        if (!Number.isInteger(count) || count < MIN_TRACKS || count > MAX_TRACKS) {
          fail(lineNumber, `tracks must be a whole number ${MIN_TRACKS}..${MAX_TRACKS}; got "${args[0]}".`);
          break;
        }
        state.trackCount = count;
        // Added channels start as one layer, like a brand-new song's do — and as
        // one note at a time, because that is what a fresh channel is.
        while (state.layerCounts.length < count) state.layerCounts.push(1);
        state.layerCounts.length = count;
        while (state.polys.length < count) state.polys.push(DEFAULT_POLY);
        state.polys.length = count;
        commands.push({ kind: 'tracks', line: lineNumber, count });
        break;
      }
      case 'track': {
        const index = Number(args[0]);
        if (!Number.isInteger(index) || index < 1 || index > state.trackCount) {
          fail(lineNumber, `track number must be 1..${state.trackCount} (the song has ${state.trackCount} tracks); got "${args[0] ?? ''}". Use "tracks N" first to add channels.`);
          break;
        }
        const command: Extract<ScriptCommand, { kind: 'track' }> = { kind: 'track', line: lineNumber, index };
        // Read the settings from the RIGHT and leave the name on the left: an
        // optional trailing `on`/`off`, then any of `wave <shape>` and
        // `hold <steps>`, in whatever order they were written.
        //
        // Order matters to a person (`track 1 "LEAD" wave square off` should
        // read like a sentence), but which tokens ARE settings is decided by
        // QUOTING, not by position. A bare `off` is the flag; a quoted `"OFF"`
        // is a channel named OFF, and `track 2 "OFF" wave square` has to mean
        // the name or a song cannot be saved and read back. A bare setting word
        // left among the name is a mistake, not a name, and says so.
        const rest = tokens.slice(2);
        let end = rest.length;
        const tail = rest[end - 1];
        const tailWord = tail?.text.toLowerCase();
        if (!tail?.quoted && (tailWord === 'on' || tailWord === 'off')) {
          command.muted = tailWord === 'off';
          end -= 1;
        }
        // Every setting is a PAIR of tokens — `wave square`, `hold 4`,
        // `voice pad`, `bright 60` — so they are peeled off two at a time until
        // the tail stops looking like a setting, whatever order they were
        // written in.
        let bad = false;
        for (;;) {
          const word = rest[end - 2];
          const value = rest[end - 1];
          if (!word || !value || word.quoted) break;
          const key = word.text.toLowerCase();
          if (key === 'wave') {
            const wave = waveFromName(value.text);
            if (!wave) {
              fail(lineNumber, `wave must be square, triangle, saw, sine, noise, table, sample, fm, string, formant, organ, granular, font, reed, brass, bow, mallet, membrane or plate; got "${value.text}".`);
              bad = true;
              break;
            }
            command.wave = wave;
            end -= 2;
            continue;
          }
          if (key === 'hold') {
            const steps = Number(value.text);
            if (!Number.isInteger(steps) || steps < MIN_HOLD || steps > MAX_HOLD) {
              fail(lineNumber, `hold must be a whole number of steps ${MIN_HOLD}..${MAX_HOLD}; got "${value.text}".`);
              bad = true;
              break;
            }
            command.hold = steps;
            end -= 2;
            continue;
          }
          if (key === 'level') {
            const amount = Number(value.text);
            if (!Number.isFinite(amount) || amount < MIN_LEVEL || amount > MAX_LEVEL) {
              fail(lineNumber, `level is a percentage ${MIN_LEVEL}..${MAX_LEVEL}; got "${value.text}". 100 is full volume, 0 is silent.`);
              bad = true;
              break;
            }
            command.level = Math.round(amount);
            end -= 2;
            continue;
          }
          if (key === 'pan') {
            const pan = panAmount(value.text);
            if (pan === null) {
              fail(lineNumber, `pan must be a place between the speakers ${MIN_PAN}..${MAX_PAN}: "pan -40", "pan 40", "pan L40", "pan R40" or "pan C". Got "${value.text}".`);
              bad = true;
              break;
            }
            command.pan = pan;
            end -= 2;
            continue;
          }
          if (key === 'verb' || key === 'echo') {
            // A SEND, and the sentence says so, because the same word is a
            // different number one scope up: `echo 40` alone sets how much echo
            // comes BACK, and `echo 40` on a track line sets how much of THIS
            // channel goes IN. A send is not an effect, so 100 is not unusual —
            // it is the default, and it is what every file already implies.
            const effect = key === 'verb' ? 'reverb' : 'echo';
            const amount = Number(value.text);
            if (!Number.isFinite(amount) || amount < MIN_SEND || amount > MAX_SEND) {
              fail(lineNumber, `${key} on a track line is a send, a percentage ${MIN_SEND}..${MAX_SEND}; got "${value.text}". ${MAX_SEND} sends all of this channel into the ${effect} (the default), ${MIN_SEND} keeps it dry.`);
              bad = true;
              break;
            }
            if (key === 'verb') command.verb = Math.round(amount);
            else command.echo = Math.round(amount);
            end -= 2;
            continue;
          }
          if (key === 'glide' || key === 'vibrato') {
            // Both are percentages 0..100, the same shape as `level`, so one
            // branch reads them and only the range and the sentence differ.
            const low = key === 'glide' ? MIN_GLIDE : MIN_VIBRATO;
            const high = key === 'glide' ? MAX_GLIDE : MAX_VIBRATO;
            const amount = Number(value.text);
            if (!Number.isFinite(amount) || amount < low || amount > high) {
              const what = key === 'glide'
                ? `${low} is none, ${high} slides for the whole note`
                : `${low} is steady, ${high} is as wide as this app goes`;
              fail(lineNumber, `${key} is a percentage ${low}..${high}; got "${value.text}". ${what}.`);
              bad = true;
              break;
            }
            if (key === 'glide') command.glide = Math.round(amount);
            else command.vibrato = Math.round(amount);
            end -= 2;
            continue;
          }
          if (key === 'robin' || key === 'touch') {
            // Two percentages with one sentence each: what the number DOES rather
            // than what range it takes, because "robin 60" and "touch 60" are the
            // two settings on this line whose meaning is not guessable from the
            // word alone. At 0 each is exactly the app before it existed.
            const low = key === 'robin' ? ROBIN_MIN : TOUCH_MIN;
            const high = key === 'robin' ? ROBIN_MAX : TOUCH_MAX;
            const amount = Number(value.text);
            if (!Number.isFinite(amount) || amount < low || amount > high) {
              const what = key === 'robin'
                ? `${low} is every hit identical (the default), ${high} gives each hit a few cents, a few percent of level and a little brightness of its own`
                : `${low} is velocity as a level and nothing else (the default), ${high} makes a note at velocity 0 up to ${MAX_TOUCH_BRIGHT} points darker`;
              fail(lineNumber, `${key} is a percentage ${low}..${high}; got "${value.text}". ${what}.`);
              bad = true;
              break;
            }
            if (key === 'robin') command.robin = Math.round(amount);
            else command.touch = Math.round(amount);
            end -= 2;
            continue;
          }
          if (key === 'drift') {
            // A percentage like the rest, and its own sentence because "drift 40"
            // is the one track setting whose meaning is a WOBBLE rather than a
            // level: it is the tape effect's wow and flutter, pulled out so a
            // lane can move it. At 0 the channel holds every pitch it is given.
            const amount = Number(value.text);
            if (!Number.isFinite(amount) || amount < DRIFT_MIN || amount > DRIFT_MAX) {
              fail(lineNumber, `drift is a percentage ${DRIFT_MIN}..${DRIFT_MAX}; got "${value.text}". ${DRIFT_MIN} is a steady pitch (the default), ${DRIFT_MAX} wanders about eighteen cents — the wow and flutter of a worn machine.`);
              bad = true;
              break;
            }
            command.drift = Math.round(amount);
            end -= 2;
            continue;
          }
          if (key === 'strum') {
            // How far this channel's CHORD rolls, in STEPS: the first note on the
            // step, the last `strum` steps later. Read beside the other counts,
            // and its own sentence because "strum 2" is a span rather than a
            // percentage of anything.
            const amount = Number(value.text);
            if (!Number.isFinite(amount) || amount < MIN_STRUM || amount > MAX_STRUM) {
              fail(lineNumber, `strum is a span of ${MIN_STRUM}..${MAX_STRUM} steps; got "${value.text}". ${MIN_STRUM} plays the chord as a block, ${MAX_STRUM} rolls it across ${MAX_STRUM} steps.`);
              bad = true;
              break;
            }
            command.strum = Math.round(amount);
            end -= 2;
            continue;
          }
          if (key === 'duck') {
            // The pump: how far this channel pushes the REST of the mix down
            // while it plays. Read with the other percentages, and the only
            // setting on a track line whose sentence has to say what it affects,
            // because "duck 60" on its own could mean almost anything.
            const amount = Number(value.text);
            if (!Number.isFinite(amount) || amount < MIN_DUCK || amount > MAX_DUCK) {
              fail(lineNumber, `duck is a percentage ${MIN_DUCK}..${MAX_DUCK}; got "${value.text}". ${MIN_DUCK} is off, ${MAX_DUCK} pushes the other channels all the way out for the length of the note.`);
              bad = true;
              break;
            }
            command.duck = Math.round(amount);
            end -= 2;
            continue;
          }
          if (key === 'groove') {
            // The PART's pocket. A feel belongs to the player, so a channel may
            // lean while the song does not — and the name is the song-level
            // table's, so a feel cannot mean one thing here and another there.
            const feel = grooveFromName(value.text);
            if (!feel) {
              fail(lineNumber, `"${value.text}" is not a feel. Feels: ${grooveNames()}.`);
              bad = true;
              break;
            }
            command.groove = feel.id;
            end -= 2;
            continue;
          }
          if (key === 'humanize') {
            // How much this part is PLAYED: the `human` wobble with an amount,
            // on one channel. Read with the other percentages.
            const amount = Number(value.text);
            if (!Number.isFinite(amount) || amount < MIN_HUMANIZE || amount > MAX_HUMANIZE) {
              fail(lineNumber, `humanize is a percentage ${MIN_HUMANIZE}..${MAX_HUMANIZE}; got "${value.text}". ${MIN_HUMANIZE} is a machine, ${MAX_HUMANIZE} is unmistakably played by hand.`);
              bad = true;
              break;
            }
            command.humanize = Math.round(amount);
            end -= 2;
            continue;
          }
          if (key === 'shape') {
            // WHICH part of the sound survives, rather than how much of it: the
            // one setting on a track line whose value is a word from the shape
            // table (`round`, `sharp`, `nasal`, `hollow`). An unknown one is
            // refused with the list, because guessing at a filter would play
            // something other than what the line asked for, silently.
            const kind = shapeFromName(value.text);
            if (!kind) {
              fail(lineNumber, `"${value.text}" is not a filter shape. The shapes are: ${shapeNames()}.`);
              bad = true;
              break;
            }
            command.shape = kind.id;
            end -= 2;
            continue;
          }
          if (key === 'bus') {
            // Which GROUP the channel is in — the one setting on a track line
            // whose value is a NAME this song has to already know, since a bus is
            // declared on its own line above. An unknown one is REFUSED with the
            // list rather than dropped, because falling back to "no group" would
            // play the channel louder than the line asked for, silently.
            const wanted = value.text;
            if (tidyBusName(wanted) === '' || sameBusName(wanted, NO_BUS_WORD)) {
              command.bus = null;
              end -= 2;
              continue;
            }
            const joined = state.buses.find((one) => sameBusName(one.name, wanted));
            if (!joined) {
              const have = state.buses.length === 0
                ? 'the song has no buses yet'
                : `the song has: ${busNames(state.buses).join(', ')}`;
              fail(lineNumber, `track ${index} joins a bus the song does not have: "${wanted}" — ${have}. A bus is declared ABOVE the channel that joins it, e.g. "bus DRUMS 70" then "track ${index} bus DRUMS". Write "bus ${NO_BUS_WORD}" to take a channel back off a group.`);
              bad = true;
              break;
            }
            command.bus = joined.name;
            end -= 2;
            continue;
          }
          if (key === 'sample') {
            // Which recording of YOURS this channel plays.
            //
            // The one track setting whose value is checked for SPELLING and not
            // against a list, and the difference is the whole design: a bus, a
            // voice, a section and a drum are the SONG's, so a name that is not
            // in the song is a mistake the parser can name. The bank is the
            // APP's — it holds whatever you have imported on this machine — so
            // the same song names a sample you may or may not have, and a name
            // the app does not know is the FALLBACK rather than an error: the
            // channel plays its built-in one-shot, exactly as it would have if
            // the line had never been written. Refusing it would make a song
            // that plays on your machine refuse to load on somebody else's.
            const wanted = value.text;
            if (tidySampleName(wanted) === '' || sameSampleName(wanted, NO_SAMPLE_WORD)) {
              command.sample = null;
              end -= 2;
              continue;
            }
            const problem = sampleNameProblem(wanted);
            if (problem !== null) {
              fail(lineNumber, `sample needs a name: ${problem}. Or "sample ${NO_SAMPLE_WORD}" to leave the one this channel is on.`);
              bad = true;
              break;
            }
            command.sample = tidySampleName(wanted);
            end -= 2;
            continue;
          }
          if (key === 'poly') {
            // How many notes the channel may hold at once. Read with the other
            // whole numbers, and the one setting on a track line that changes what
            // a CELL can mean: above 1, notes that overlap are all heard.
            const count = Number(value.text);
            if (!Number.isInteger(count) || count < MIN_POLY || count > MAX_POLY) {
              fail(lineNumber, `poly is a whole number ${MIN_POLY}..${MAX_POLY} of notes at once; got "${value.text}". ${MIN_POLY} is one note at a time, which is what every channel was before this.`);
              bad = true;
              break;
            }
            command.poly = count;
            // The lines BELOW this one see the new width, which is what lets a
            // chord written after it be checked against the channel it lands on.
            state.polys[index - 1] = count;
            end -= 2;
            continue;
          }
          if (key === 'voice') {
            // A saved sound is addressed exactly like a built-in one: the name is
            // looked up here, and the params are settled at APPLY time, so a
            // script and a click cannot disagree about what `voice MYPAD` means.
            const preset = voiceFromName(value.text);
            const saved = preset ? null : userVoiceFromName(value.text, voices);
            if (!preset && !saved) {
              const mine = voices.length > 0 ? ` Yours: ${userVoiceNames(voices)}.` : '';
              fail(lineNumber, `"${value.text}" is not a voice. Voices: ${VOICE_NAMES}.${mine}`);
              bad = true;
              break;
            }
            command.voice = preset ? preset.id : saved!.name;
            end -= 2;
            continue;
          }
          // The effects, before the voice knobs: `chorus` was an alias of the
          // `thick` knob until effects existed, and the effect is now what the
          // word means (see the reference's table of aliases). A line that wants
          // the knob writes `thick` or `width`.
          const effect = TRACK_EFFECT_BY_ID[key as TrackEffectId];
          if (effect) {
            const amount = Number(value.text);
            if (!Number.isFinite(amount) || amount < MIN_EFFECT || amount > MAX_EFFECT) {
              fail(lineNumber, `${key} is a percentage ${MIN_EFFECT}..${MAX_EFFECT}; got "${value.text}". ${MIN_EFFECT} is off, ${MAX_EFFECT} is as ${effect.high} as this app goes.`);
              bad = true;
              break;
            }
            command.effects = { ...command.effects, [effect.id]: Math.round(amount) };
            end -= 2;
            continue;
          }
          const param = paramWord(key);
          if (param) {
            const amount = Number(value.text);
            if (!Number.isFinite(amount) || amount < MIN_PARAM || amount > MAX_PARAM) {
              // `detune` is the wide/narrow knob's other name on a track line and
              // a layer's tuning on a layer line, so a negative number here is
              // almost always someone thinking in cents. The two meanings are
              // spelled the same on purpose (see the reference), and the error is
              // where the difference is worth saying out loud.
              const layerHint = key === 'detune'
                ? ` "detune" is THICK here, the width knob; a LAYER's tuning in cents is written on a layer line, e.g. "layer ${index} 2 detune ${value.text}".`
                : '';
              fail(lineNumber, `${param} is a percentage ${MIN_PARAM}..${MAX_PARAM}; got "${value.text}". 0 is ${VOICE_PARAM_BY_ID[param].low}, 100 is ${VOICE_PARAM_BY_ID[param].high}.${layerHint}`);
              bad = true;
              break;
            }
            command.params = { ...command.params, [param]: Math.round(amount) };
            end -= 2;
            continue;
          }
          break;
        }
        if (bad) break;
        const nameTokens = rest.slice(0, end);
        const stray = nameTokens.find((token) => !token.quoted && isSettingWord(token.text));
        if (stray) {
          fail(lineNumber, settingWordHint(stray.text.toLowerCase(), index, voices));
          break;
        }
        if (nameTokens.length > 0) {
          const name = nameTokens.map((token) => token.text).join(' ');
          if (!isTrackNameLength(name)) {
            fail(lineNumber, `a channel name may be at most ${MAX_TRACK_NAME} characters; "${name}" is ${name.length}. Shorten it, or use fewer words.`);
            break;
          }
          command.name = name.toUpperCase();
        }
        commands.push(command);
        break;
      }
      case 'layer': {
        // A channel's sound is its VOICE plus a STACK of layers above it, so a
        // layer is addressed by two numbers — which channel, and which layer of
        // it. That is the shape `note ROW TRACK` and `chord ROW TRACK` already
        // use for "an operation at a point", and unlike a stray "current layer"
        // it cannot be aimed at the wrong channel by accident.
        const trackIndex = Number(args[0]);
        if (!Number.isInteger(trackIndex) || trackIndex < 1 || trackIndex > state.trackCount) {
          fail(lineNumber, `layer takes a channel NUMBER first and a layer number second, e.g. "layer 2 3 wave saw" for the third layer of channel 2. Channels are 1..${state.trackCount}; got "${args[0] ?? ''}". Use "tracks N" first to add channels.`);
          break;
        }
        const layerIndex = Number(args[1]);
        if (!Number.isInteger(layerIndex) || layerIndex < 1) {
          fail(lineNumber, `the second number is the LAYER: 1 is the channel's VOICE, and a channel may have up to ${MAX_LAYERS} layers in all. Got "${args[1] ?? ''}".`);
          break;
        }
        // How many layers this channel has by the time this line runs: the voice
        // plus the layers the lines above it have added. A stack has no holes,
        // so this is the only thing that decides which layer exists.
        const have = state.layerCounts[trackIndex - 1] ?? 1;
        if (layerIndex > MAX_LAYERS) {
          // Two different situations print this, and the fix is different in each:
          // a channel that is already full needs something REMOVED, while one
          // with room needs the layer number to name a layer that exists.
          fail(lineNumber, have >= MAX_LAYERS
            ? `a channel may have at most ${MAX_LAYERS} layers, and channel ${trackIndex} already has ${have}. Remove one first, or layer another channel.`
            : `the second number is the LAYER: 1 is the channel's VOICE, and a channel may have up to ${MAX_LAYERS} layers in all. Got "${args[1]}".`);
          break;
        }
        // `clear` (or `remove`) takes the layer out and shifts the ones above it
        // down, the same way removing a bar or a channel does. It is the whole
        // line or nothing: "remove it AND set it" is two instructions.
        const word = args[2]?.toLowerCase();
        // Found ANYWHERE after the two numbers, not just at the front, so that
        // the mistake `layer 1 2 octave 1 clear` is answered with the rule
        // ("clear is the whole line") rather than with "clear needs a value".
        const removeWord = args.slice(2).find((arg) => arg.toLowerCase() === 'clear' || arg.toLowerCase() === 'remove');
        if (removeWord !== undefined && !(args.length === 3 && (word === 'clear' || word === 'remove'))) {
          fail(lineNumber, `"${removeWord}" takes nothing after it: write "layer ${trackIndex} ${layerIndex} ${removeWord.toLowerCase()}" on a line of its own.`);
          break;
        }
        if (word === 'clear' || word === 'remove') {
          if (args.length > 3) {
            fail(lineNumber, `"${args[2]}" takes nothing after it: write "layer ${trackIndex} ${layerIndex} clear" on a line of its own.`);
            break;
          }
          if (layerIndex === 1) {
            fail(lineNumber, `layer 1 is channel ${trackIndex}'s VOICE, and a channel always sounds like something. Pick another voice, mute the channel, or remove a layer above it.`);
            break;
          }
          if (layerIndex > have) {
            fail(lineNumber, `channel ${trackIndex} has ${have} layer${have === 1 ? '' : 's'}, so there is no layer ${layerIndex} to remove.`);
            break;
          }
          state.layerCounts[trackIndex - 1] = have - 1;
          commands.push({ kind: 'layer', line: lineNumber, track: trackIndex, index: layerIndex, clear: true });
          break;
        }
        if (layerIndex > have + 1) {
          fail(lineNumber, `channel ${trackIndex} has ${have} layer${have === 1 ? '' : 's'}, and a stack has no holes: write "layer ${trackIndex} ${have + 1}" to add the next one.`);
          break;
        }
        // `word value` pairs, left to right, in whatever order they were
        // written: `wave saw`, `octave -1`, `detune -8`, `gain 60`, `bright 40`.
        // A new layer is a copy of the one below it, so only what is written
        // here changes — which is what makes `layer 1 2 wave saw detune -8` a
        // second saw rather than a second instrument built from scratch.
        const change: Partial<Layer> = {};
        let bad = false;
        for (let i = 2; i < args.length; i += 2) {
          const key = args[i].toLowerCase();
          const value = args[i + 1];
          const field = LAYER_FIELDS.find((entry) => entry.id === key);
          if (value === undefined) {
            const example = field ? `${field.id} ${field.id === 'octave' ? '1' : field.id === 'detune' ? '-8' : '40'}`
              : key === 'wave' ? 'wave saw'
                : `${key} 40`;
            fail(lineNumber, `"${args[i]}" needs a value, e.g. "${example}".`);
            bad = true;
            break;
          }
          if (key === 'wave') {
            const wave = waveFromName(value);
            if (!wave) {
              fail(lineNumber, `wave must be square, triangle, saw, sine, noise, table, sample, fm, string, formant, organ, granular, font, reed, brass, bow, mallet, membrane or plate; got "${value}".`);
              bad = true;
              break;
            }
            change.wave = wave;
            continue;
          }
          if (field) {
            // A VOICE has no octave, no detune and no gain: it is in tune with
            // itself at full level by definition, which is exactly what keeps
            // every song written before layers existed sounding the same.
            if (!layerPitchAllowed(layerIndex)) {
              const fix = field.id === 'gain'
                ? `use "level N" for how loud the channel sits in the mix, or put the level on a layer above it: "layer ${trackIndex} 2 gain 40".`
                : `put the transposition on a layer above it: "layer ${trackIndex} 2 ${field.id} ${value}".`;
              fail(lineNumber, `layer ${trackIndex} 1 is the channel's VOICE, which is always in tune and at full level - ${fix}`);
              bad = true;
              break;
            }
            const amount = Number(value);
            if (!Number.isInteger(amount) || amount < field.min || amount > field.max) {
              fail(lineNumber, `${field.id} must be a whole number ${field.min}..${field.max}; got "${value}". ${field.min} is ${field.low}, ${field.max} is ${field.high}.`);
              bad = true;
              break;
            }
            change[field.id] = clampLayerField(field.id, amount);
            continue;
          }
          const param = paramWord(key);
          if (param) {
            const amount = Number(value);
            if (!Number.isFinite(amount) || amount < MIN_PARAM || amount > MAX_PARAM) {
              fail(lineNumber, `${param} is a percentage ${MIN_PARAM}..${MAX_PARAM}; got "${value}". 0 is ${VOICE_PARAM_BY_ID[param].low}, 100 is ${VOICE_PARAM_BY_ID[param].high}.`);
              bad = true;
              break;
            }
            change[param] = clampParam(Math.round(amount));
            continue;
          }
          if (key === 'voice') {
            fail(lineNumber, `voice names a whole CHANNEL's sound, which is its layer 1: write "track ${trackIndex} voice pad". A layer above it is written out: "layer ${trackIndex} ${layerIndex} wave saw bright 55".`);
            bad = true;
            break;
          }
          fail(lineNumber, `"${key}" is not a layer setting. A layer takes wave, ${LAYER_FIELDS.map((entry) => entry.id).join(', ')}, the nine sound knobs (${VOICE_PARAMS.map((entry) => entry.id).join(', ')}), or "layer ${trackIndex} ${layerIndex} clear" to remove it.`);
          bad = true;
          break;
        }
        if (bad) break;
        if (layerIndex > have) state.layerCounts[trackIndex - 1] = layerIndex;
        commands.push({ kind: 'layer', line: lineNumber, track: trackIndex, index: layerIndex, change });
        break;
      }
      case 'mute':
      case 'unmute': {
        const index = Number(args[0]);
        if (!Number.isInteger(index) || index < 1 || index > state.trackCount) {
          fail(lineNumber, `${head} needs a track number 1..${state.trackCount}; got "${args[0] ?? ''}".`);
          break;
        }
        commands.push({ kind: 'track', line: lineNumber, index, muted: head === 'mute' });
        break;
      }
      case 'pattern': {
        const index = Number(args[0]);
        if (!Number.isInteger(index) || index < 1 || index > MAX_PATTERNS) {
          fail(lineNumber, `pattern must be a whole number 1..${MAX_PATTERNS}; got "${args[0] ?? ''}".`);
          break;
        }
        const name = args.slice(1).join(' ');
        commands.push({ kind: 'pattern', line: lineNumber, index, ...(name ? { name: name.toUpperCase() } : {}) });
        state.pattern = index;
        state.rowCursor = 0;
        break;
      }
      case 'order': {
        // The arrangement, as the list of bars the song plays. `pattern` decides
        // where notes land while writing; `order` decides what the PLAYER hears,
        // which are two different questions and so two different statements.
        if (args.length === 0) {
          fail(lineNumber, 'order needs at least one pattern number, e.g. order 1 2 1 3 (the song plays those bars in that order).');
          break;
        }
        if (args.length > MAX_ORDER) {
          fail(lineNumber, `a song order may have at most ${MAX_ORDER} slots; this one has ${args.length}. Shorten it.`);
          break;
        }
        const list: number[] = [];
        let bad = false;
        for (const arg of args) {
          const n = Number(arg);
          if (!Number.isInteger(n) || n < 1 || n > MAX_PATTERNS) {
            fail(lineNumber, `order takes pattern numbers 1..${MAX_PATTERNS}; got "${arg}".`);
            bad = true;
            break;
          }
          list.push(n);
        }
        if (bad) break;
        commands.push({ kind: 'order', line: lineNumber, order: list });
        break;
      }
      case 'clear': {
        if (args.length > 1) { fail(lineNumber, 'clear takes at most one pattern number, e.g. clear or clear 2.'); break; }
        let target = state.pattern;
        if (args.length === 1) {
          const index = Number(args[0]);
          if (!Number.isInteger(index) || index < 1 || index > MAX_PATTERNS) {
            fail(lineNumber, `clear needs a pattern number 1..${MAX_PATTERNS}; got "${args[0]}".`);
            break;
          }
          target = index;
        }
        commands.push({ kind: 'clear', line: lineNumber, pattern: target });
        break;
      }
      case 'copy': {
        const from = Number(args[0]);
        const to = Number(args[1]);
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1 || from > MAX_PATTERNS || to > MAX_PATTERNS) {
          fail(lineNumber, 'copy needs two pattern numbers, e.g. copy 1 2 (copies pattern 1 into pattern 2).');
          break;
        }
        commands.push({ kind: 'copy', line: lineNumber, from, to });
        break;
      }
      case 'chord': {
        // `chord ROW TRACK NAME [arp [DIR] [STEPS]]`: the same addressing as
        // `note`, but the third value becomes a whole stack of notes — or, with
        // `arp`, one note after another.
        if (args.length < 3) {
          fail(lineNumber, 'chord takes three values: chord ROW TRACK CHORD — e.g. chord 0 1 Am, or chord 4 2 6 for the sixth chord of the song\u2019s key.');
          break;
        }
        const row = Number(args[0]);
        const track = Number(args[1]);
        if (!Number.isInteger(row) || row < 0 || row >= state.rows) {
          fail(lineNumber, `row must be 0..${state.rows - 1} (the grid shows rows 00..${state.rows - 1}); got "${args[0]}".`);
          break;
        }
        if (!Number.isInteger(track) || track < 1 || track > state.trackCount) {
          fail(lineNumber, `track must be 1..${state.trackCount}; got "${args[1]}".`);
          break;
        }
        // The modifier is found by SHAPE rather than by position, the same way a
        // cell finds its articulation: the word `arp` splits the rest of the line
        // into the chord (before it) and the gesture (after it), which is what
        // lets a two-token chord name — `C maj7 arp up 8` — still work.
        const at = args.findIndex((arg) => arg.toLowerCase() === ARP_WORD);
        // The name may be two tokens (`C maj7`, `F# 7`) because that is how a
        // person writes a chord, and `parseChordName` closes the gap again.
        const text = (at < 0 ? args.slice(2) : args.slice(2, at)).join(' ');
        // A FOLLOWER rather than a chord: `follow` stands exactly where the chord
        // name would, so the line reads as "from this row, play the song's loop"
        // — a modifier in a slot that already existed rather than a verb.
        if (text.toLowerCase() === FOLLOW_WORD) {
          if (at >= 0) {
            fail(lineNumber, `a follower has no ${ARP_WORD}: chord ${row} ${track} ${FOLLOW_WORD} already writes one chord per chord of the loop, each held for its own length.`);
            break;
          }
          const follow = followerCommand(lineNumber, row, track, 'chords');
          if (follow !== null) commands.push(follow);
          break;
        }
        const asDegree = parseDegree(text);
        let spec: ChordSpec;
        if (asDegree !== null) {
          spec = { kind: 'degree', degree: asDegree };
        } else {
          const named = parseChordName(text);
          if (named === null) {
            // A line reaching for a gesture the plan named but this build does
            // not take is answered with what the gesture actually IS, rather
            // than told its chord is misspelled — the words are in the roadmap,
            // so somebody will type one.
            const words = text.trim().split(/\s+/);
            const reply = chordGestureReply(words[words.length - 1] ?? '');
            fail(lineNumber, reply === null
              ? `"${text}" is not a chord. Name a root and a shape — Am, F#7, Bbdim, Cmaj7 — or a scale degree 1..7.`
              : `chord does not take "${words[words.length - 1]}": ${reply}`);
            break;
          }
          spec = { kind: 'name', root: named.root, quality: named.quality };
        }
        const size = spec.kind === 'name' ? chordShape(spec.quality).intervals.length : DEFAULT_CHORD_DEGREES;
        let arp: Arp | null = null;
        if (at >= 0) {
          const words = args.slice(at + 1);
          if (words.length > 2) {
            fail(lineNumber, `arp takes a direction and how many steps, e.g. chord 0 1 Am ${ARP_WORD} up 8 — got ${words.length} values after it.`);
            break;
          }
          let direction: ArpDirection = DEFAULT_ARP_DIRECTION;
          let steps: number | null = null;
          let directionSaid = false;
          let bad = false;
          for (const word of words) {
            const asDirection = arpDirectionFromName(word);
            if (asDirection !== null) {
              if (directionSaid) {
                fail(lineNumber, `give the direction once: "${word}" is the second one on this line. The directions are ${ARP_DIRECTIONS.join(', ')}.`);
                bad = true;
                break;
              }
              direction = asDirection;
              directionSaid = true;
              continue;
            }
            const count = Number(word);
            if (!Number.isInteger(count) || count < MIN_ARP_STEPS || count > MAX_ARP_STEPS) {
              fail(lineNumber, `"${word}" is neither a direction nor a step count. An arp takes a direction (${ARP_DIRECTIONS.join(', ')}) and how many steps it fills (${MIN_ARP_STEPS}..${MAX_ARP_STEPS}), in either order — e.g. chord 0 1 Am ${ARP_WORD} up 8.`);
              bad = true;
              break;
            }
            if (steps !== null) {
              fail(lineNumber, `give the step count once: "${word}" is the second one on this line — e.g. chord 0 1 Am ${ARP_WORD} up 8.`);
              bad = true;
              break;
            }
            steps = count;
          }
          if (bad) break;
          // No number given means one step per tone of the chord, which for a
          // triad is the run a hand plays when it names a chord: root, third,
          // fifth, one step apart.
          arp = { direction, steps: steps ?? size };
          if (row + arp.steps > state.rows) {
            fail(lineNumber, `an arp of ${arp.steps} steps from row ${row} needs rows ${row}..${row + arp.steps - 1}, and the pattern has ${state.rows}. Start it earlier, fill fewer steps, or give the pattern more rows with "steps N".`);
            break;
          }
        } else if ((state.polys[track - 1] ?? DEFAULT_POLY) < size && track + size - 1 > state.trackCount) {
          // An arp plays the chord ONE NOTE AT A TIME on the channel it names, so
          // it is the one form of `chord` that never needs the channels after it.
          // A plain chord goes in ONE CELL when the channel is wide enough to
          // sound it (see the applier) and otherwise spreads across the channels
          // that follow, which is how a tracker has always written one — so the
          // shortage only matters when neither is possible.
          fail(lineNumber, `chord "${text}" needs ${size} channels starting at track ${track}, but the song has ${state.trackCount}. Add tracks, start the chord on an earlier channel, or widen this one — "track ${track} poly ${size}" above this line keeps the whole chord in one cell.`);
          break;
        }
        commands.push({ kind: 'chord', line: lineNumber, pattern: state.pattern, row, track, octave: state.octave, spec, arp });
        break;
      }
      case 'arp': {
        // The ARP page's dials AND its one write. Two roles, one word:
        //   • `arp direction updown`, `arp octaves 2 rate 2 gate 60` and
        //     `arp mode source` store the settings a run is dialed with, and
        //     `arp off` clears them;
        //   • `arp write ROW TRACK CHORD` commits a run using those dials — the
        //     same cells `chord ROW TRACK CHORD arp …` writes, from the song
        //     rather than from the line.
        // Additive: a song that never says `arp` stores none and writes no
        // version, and the inline `chord … arp` modifier is untouched.
        if (args.length === 0) {
          fail(lineNumber, 'arp takes its dials or a write: "arp direction updown", "arp octaves 2 rate 2 gate 60", "arp mode source", "arp off", or "arp write ROW TRACK CHORD" (e.g. arp write 0 1 Am).');
          break;
        }
        const head = args[0].toLowerCase();
        if (head === 'off') {
          if (args.length !== 1) {
            fail(lineNumber, 'arp off takes nothing after it: it clears the stored dials, so a song with none writes the file it always did.');
            break;
          }
          commands.push({ kind: 'arp', line: lineNumber, settings: null });
          break;
        }
        if (head === 'write') {
          if (args.length < 4) {
            fail(lineNumber, 'arp write takes three values — ROW TRACK CHORD — e.g. arp write 0 1 Am. It writes a run from the dials above, the same notes "chord 0 1 Am arp up 8" writes.');
            break;
          }
          const row = Number(args[1]);
          const track = Number(args[2]);
          if (!Number.isInteger(row) || row < 0 || row >= state.rows) {
            fail(lineNumber, `row must be 0..${state.rows - 1} (the grid shows rows 00..${state.rows - 1}); got "${args[1]}".`);
            break;
          }
          if (!Number.isInteger(track) || track < 1 || track > state.trackCount) {
            fail(lineNumber, `track must be 1..${state.trackCount}; got "${args[2]}".`);
            break;
          }
          const text = args.slice(3).join(' ');
          const asDegree = parseDegree(text);
          let spec: ChordSpec;
          if (asDegree !== null) {
            spec = { kind: 'degree', degree: asDegree };
          } else {
            const named = parseChordName(text);
            if (named === null) {
              fail(lineNumber, `"${text}" is not a chord. arp write needs a chord name (Am, F#7, Bbdim, Cmaj7) or a scale degree 1..7, e.g. arp write 0 1 Am.`);
              break;
            }
            spec = { kind: 'name', root: named.root, quality: named.quality };
          }
          commands.push({ kind: 'arpWrite', line: lineNumber, pattern: state.pattern, row, track, octave: state.octave, spec });
          break;
        }
        if (head === 'direction') {
          if (args.length !== 2) {
            fail(lineNumber, `arp direction takes one word, e.g. arp direction updown. The directions are: ${ARP_DIRECTIONS.join(', ')}.`);
            break;
          }
          const direction = arpDirectionFromName(args[1]);
          if (direction === null) {
            fail(lineNumber, `"${args[1]}" is not an arp direction. The directions are: ${ARP_DIRECTIONS.join(', ')}.`);
            break;
          }
          commands.push({ kind: 'arp', line: lineNumber, settings: { direction } });
          break;
        }
        if (head === 'mode') {
          if (args.length !== 2) {
            fail(lineNumber, `arp mode takes one word, either ${ARP_MODES.join(' or ')}: chord walks the chord given on a write, source walks the song's loop.`);
            break;
          }
          const mode = args[1].toLowerCase();
          if (!ARP_MODES.includes(mode as ArpMode)) {
            fail(lineNumber, `"${args[1]}" is not an arp mode. The modes are: ${ARP_MODES.join(', ')}.`);
            break;
          }
          commands.push({ kind: 'arp', line: lineNumber, settings: { mode: mode as ArpMode } });
          break;
        }
        if (head === 'hear') {
          // A SESSION setting, not a dial: whether the page sounds the run as its
          // dials move. It travels out in `settings` like `page`, and no file
          // carries it, so a song opened from disk can never start making noise.
          if (args.length !== 2 || !['on', 'off'].includes(args[1].toLowerCase())) {
            fail(lineNumber, 'arp hear takes "on" or "off", e.g. "arp hear on": whether the ARP page auditions the run as its dials move.');
            break;
          }
          commands.push({ kind: 'arpAudition', line: lineNumber, on: args[1].toLowerCase() === 'on' });
          break;
        }
        // Everything else is the three NUMBERS, in pairs: `arp octaves 2 rate 2 gate 60`.
        if (args.length % 2 !== 0) {
          fail(lineNumber, 'arp takes its numbers in pairs — octaves N, rate N, gate N — e.g. arp octaves 2 rate 2 gate 60.');
          break;
        }
        const patch: Partial<ArpSettings> = {};
        let bad = false;
        for (let i = 0; i < args.length; i += 2) {
          const key = args[i].toLowerCase();
          if (key !== 'octaves' && key !== 'rate' && key !== 'gate') {
            fail(lineNumber, `"${args[i]}" is not an arp dial. The dials are: direction, octaves, rate, gate, mode.`);
            bad = true;
            break;
          }
          const value = Number(args[i + 1]);
          if (!Number.isInteger(value)) {
            fail(lineNumber, `arp ${key} is a whole number; got "${args[i + 1]}".`);
            bad = true;
            break;
          }
          if (key === 'octaves') patch.octaves = value;
          else if (key === 'rate') patch.rate = value;
          else patch.gate = value;
        }
        if (bad) break;
        commands.push({ kind: 'arp', line: lineNumber, settings: patch });
        break;
      }
      case 'rows': {
        // A RANGE OF STEPS — the grammar the language was missing. It names the
        // rows to act on and what to do with them, and it acts on the pattern
        // `pattern` selected, the way `note` and `erase` do.
        const transforms = ROW_TRANSFORM_WORDS.join(', ');
        if (args.length < 4) {
          fail(lineNumber, `rows needs a range of steps and what to do with them — e.g. "rows 0 to 3 octave up", "rows 0 to 3 octave down 2" or "rows 0 to 3 repeat 4". A range can do: ${transforms}.`);
          break;
        }
        const from = Number(args[0]);
        const to = Number(args[2]);
        if (args[1].toLowerCase() !== ROW_RANGE_WORD || !Number.isInteger(from) || !Number.isInteger(to)) {
          fail(lineNumber, `rows takes a range written "A to B" — the steps to act on, e.g. "rows 0 to 3 octave up". Rows count from 0, the same numbers the grid shows.`);
          break;
        }
        const range: RowRange = { from, to };
        const rangeProblem = rowRangeProblem(range, state.rows);
        if (rangeProblem !== null) {
          fail(lineNumber, rangeProblem);
          break;
        }
        const word = args[3].toLowerCase();
        if (word === 'octave') {
          const direction = (args[4] ?? '').toLowerCase();
          if (args.length > 6 || (direction !== 'up' && direction !== 'down')) {
            fail(lineNumber, `"octave" moves the range UP or DOWN, and how many octaves is optional — e.g. "rows 0 to 3 octave up" for one octave, or "rows 0 to 3 octave down 2" for two; got "${args.slice(3).join(' ')}".`);
            break;
          }
          let octaves = MIN_OCTAVE_SHIFT;
          if (args.length === 6) {
            octaves = Number(args[5]);
            if (!Number.isInteger(octaves) || octaves < MIN_OCTAVE_SHIFT || octaves > MAX_OCTAVE_SHIFT) {
              fail(lineNumber, `how many octaves must be a whole number ${MIN_OCTAVE_SHIFT}..${MAX_OCTAVE_SHIFT}; got "${args[5]}".`);
              break;
            }
          }
          commands.push({
            kind: 'rows', line: lineNumber, pattern: state.pattern, from, to,
            transform: direction === 'up' ? 'octave-up' : 'octave-down', octaves, times: 0, roll: 0,
          });
          break;
        }
        if (word === REPEAT_WORD) {
          if (args.length !== 5) {
            fail(lineNumber, `"${REPEAT_WORD}" needs how many times the range plays IN ALL — e.g. "rows 0 to 3 ${REPEAT_WORD} 4" for four copies of that four-row figure; got "${args.slice(3).join(' ')}".`);
            break;
          }
          const times = Number(args[4]);
          if (!Number.isInteger(times) || times < MIN_ROW_REPEAT) {
            fail(lineNumber, `"${REPEAT_WORD}" needs how many times the range plays IN ALL, ${MIN_ROW_REPEAT} or more — e.g. "rows 0 to 3 ${REPEAT_WORD} 4"; got "${args[4]}". "${REPEAT_WORD} 1" is just the range on its own, so write it once.`);
            break;
          }
          const fit = repeatProblem(range, times, state.rows);
          if (fit !== null) {
            fail(lineNumber, fit);
            break;
          }
          commands.push({
            kind: 'rows', line: lineNumber, pattern: state.pattern, from, to,
            transform: 'repeat', octaves: 0, times, roll: 0,
          });
          break;
        }
        if (word === ROLL_WORD) {
          if (args.length > 5) {
            fail(lineNumber, `"${ROLL_WORD}" takes how many hits each step becomes, and nothing else — e.g. "rows 0 to 3 ${ROLL_WORD} 4"; got "${args.slice(3).join(' ')}".`);
            break;
          }
          let hits = DEFAULT_ROLL_HITS;
          if (args.length === 5) {
            hits = Number(args[4]);
            if (!Number.isInteger(hits) || hits < MIN_ROLL_HITS || hits > MAX_ROLL_HITS) {
              fail(lineNumber, `a ${ROLL_WORD} retriggers each hit ${MIN_ROLL_HITS}..${MAX_ROLL_HITS} times inside its own step; got "${args[4]}". "${ROLL_WORD}" on its own is ${DEFAULT_ROLL_HITS}. More than ${MAX_ROLL_HITS} in one step is not a roll — write it across two cells, or use a faster grid.`);
              break;
            }
          }
          commands.push({
            kind: 'rows', line: lineNumber, pattern: state.pattern, from, to,
            transform: 'roll', octaves: 0, times: 0, roll: hits,
          });
          break;
        }
        if (word === REVERSE_WORD) {
          // The one transformation with no number: there is exactly one way to
          // read a run of steps the other way, so anything after the word is a
          // mistake about what it is rather than a missing argument.
          if (args.length !== 4) {
            fail(lineNumber, `"${REVERSE_WORD}" reads the range backwards and takes nothing else — e.g. "rows 0 to 3 ${REVERSE_WORD}"; got "${args.slice(3).join(' ')}".`);
            break;
          }
          commands.push({
            kind: 'rows', line: lineNumber, pattern: state.pattern, from, to,
            transform: 'reverse', octaves: 0, times: 0, roll: 0,
          });
          break;
        }
        fail(lineNumber, `"${args[3]}" is not something a range of steps can do. A range can do: ${transforms}.`);
        break;
      }
      case 'note':
      case 'drum':
      case 'erase': {
        const args_ = args;
        const isNote = head === 'note';
        const isDrum = head === 'drum';
        // Five values is the most a `note` or `drum` line takes, and the last two
        // may be either order: the force and the PLAYING (`>` slides, `*3`
        // stutters). Which is which is decided by what the value IS, the same way
        // the cell grammar finds an articulation by shape rather than by position
        // — a number is a velocity and a `>` is a `>`.
        const expected = isNote
          ? 'note ROW TRACK PITCH [VELOCITY] [ARTICULATION]'
          : isDrum
          ? `drum ROW TRACK DRUM [VELOCITY] [ARTICULATION]`
          : 'erase ROW TRACK';
        const wanted = isNote || isDrum ? [3, 4, 5] : [2];
        if (!wanted.includes(args_.length)) {
          const example = isNote
            ? 'note 4 2 C-5, note 4 2 C-5 40 for a soft hit, or note 4 2 C-5 40 \">\" for a slide'
            : isDrum
            ? `drum 0 4 kick, drum 0 4 kick~70 for a softer hit, or drum 8 4 hat ${STUTTER_CHAR}3 for a roll`
            : 'erase 4 2';
          fail(lineNumber, `${head} takes ${isNote || isDrum ? 'three to five' : 'two'} values: ${expected} — e.g. ${example}.`);
          break;
        }
        const row = Number(args_[0]);
        const track = Number(args_[1]);
        if (!Number.isInteger(row) || row < 0 || row >= state.rows) {
          fail(lineNumber, `row must be 0..${state.rows - 1} (the grid shows rows 00..${state.rows - 1}); got "${args_[0]}".`);
          break;
        }
        if (!Number.isInteger(track) || track < 1 || track > state.trackCount) {
          fail(lineNumber, `track must be 1..${state.trackCount}; got "${args_[1]}".`);
          break;
        }
        if (head === 'erase') {
          commands.push({ kind: 'note', line: lineNumber, pattern: state.pattern, row, track, midi: null });
          break;
        }
        // A FOLLOWER on a `note` line: the progression's ROOTS, one per chord,
        // which is the bass line under those four chords. The word stands in the
        // pitch's slot and takes nothing else — a follower has no velocity of its
        // own and no gesture, because the notes it writes are not one note.
        if (isNote && args_[2].toLowerCase() === FOLLOW_WORD) {
          if (args_.length > 3) {
            fail(lineNumber, `note ROW TRACK ${FOLLOW_WORD} takes nothing after it: the notes it writes are the progression's own roots.`);
            break;
          }
          const follow = followerCommand(lineNumber, row, track, 'roots');
          if (follow !== null) commands.push(follow);
          break;
        }
        // A DRUM names one of the four kit sounds instead of a pitch, and every
        // value after it is exactly the tail a note takes: how hard the hit is,
        // and how it is PLAYED. The pitch it writes is the drum's own, which is
        // what makes the rest of the app — the grid's text, the count, an export
        // — treat a kit with no special cases.
        const named = isDrum ? splitCellVelocity(args_[2]).pitch : '';
        if (isDrum && drumFromName(named) === null) {
          fail(lineNumber, `"${args_[2]}" is not a drum. The kit is ${drumNames().join(', ')} — e.g. drum ${row} ${track} kick.`);
          break;
        }
        // How hard the note is hit: written either on the pitch with the grid's
        // `~velocity` spelling, or as a fourth value. Whichever way, it is given
        // ONCE, and saying so is friendlier than silently picking one.
        const { pitch: pitchText, velocity: suffix } = splitCellVelocity(args_[2]);
        let velocity: number | undefined;
        if (suffix !== null) {
          const parsed = velocityValue(suffix);
          if (parsed === null) {
            fail(lineNumber, `"${args_[2]}" has a velocity outside ${MIN_VELOCITY}..${MAX_VELOCITY}. Write the note, a ~, and how hard it is hit — e.g. C-4~80.`);
            break;
          }
          velocity = parsed;
        }
        // The values after the pitch: a force and/or an articulation, in either
        // order and at most once each. A value that is neither is refused by
        // `articulationFor`, whose message lists the two things a note can do.
        let articulation = { ...NO_ARTICULATION };
        let said = false;
        let bad = false;
        for (const extra of args_.slice(3)) {
          // A NUMBER here is a velocity, whatever its size — so a wild one is a
          // range complaint rather than a complaint about the alphabet. A `>` is
          // not a number, which is what makes the order of these two values free.
          const isNumber = extra.trim() !== '' && Number.isFinite(Number(extra));
          if (isNumber) {
            if (velocity !== undefined) {
              fail(lineNumber, suffix !== null
                ? `give the velocity once: either on the note ("${args_[2]}") or as its own value ("${extra}"), not both.`
                : `give the velocity once: "${extra}" is the second one on this line.`);
              bad = true;
              break;
            }
            const force = velocityValue(extra);
            if (force === null) {
              fail(lineNumber, `velocity must be a percentage ${MIN_VELOCITY}..${MAX_VELOCITY}, e.g. 40 for a soft note or 100 for a full one; got "${extra}".`);
              bad = true;
              break;
            }
            velocity = force;
            continue;
          }
          const read = articulationFor(extra, lineNumber, '', fail);
          if (read === null) {
            bad = true;
            break;
          }
          if (said) {
            fail(lineNumber, `give the articulation once: "${extra}" is the second one on this line. Write a slide and a stutter together as ">*3".`);
            bad = true;
            break;
          }
          articulation = read;
          said = true;
        }
        if (bad) break;
        if (isDrum) {
          // The word already checked above; `drumFromName` is asked once more so
          // the command carries an id rather than a word the applier re-reads.
          const drum = drumFromName(pitchText)!;
          commands.push({
            kind: 'note', line: lineNumber, pattern: state.pattern, row, track,
            midi: drumPitch(drum), drum,
            velocity,
            ...(articulation.slide ? { slide: true } : {}),
            ...(articulation.stutter > DEFAULT_STUTTER ? { stutter: articulation.stutter } : {}),
            ...(articulation.grace > 0 ? { grace: articulation.grace } : {}),
            ...(articulation.bend !== 0 ? { bend: articulation.bend } : {}),
          });
          break;
        }
        const midis = EMPTY_TOKENS.has(pitchText) ? [] : parseCellPitches(pitchText, state.octave);
        if (midis === null) {
          fail(lineNumber, `"${args_[2]}" is not a note. Use C0..B8 with an optional # or b, e.g. C-4, C#4, Eb5 — or "." to erase.`);
          break;
        }
        if (midis.length > MAX_CELL_NOTES) {
          fail(lineNumber, `a cell holds at most ${MAX_CELL_NOTES} notes; "${args_[2]}" has ${midis.length}. A chord that big wants more than one channel, or a second cell.`);
          break;
        }
        // The same rule the grid row keeps, in the same words: a chord needs a
        // channel wide enough to sound it. See the note there.
        const capacity = state.polys[track - 1] ?? DEFAULT_POLY;
        if (midis.length > capacity) {
          fail(lineNumber, `this cell holds ${midis.length} notes, but channel ${track} sounds ${capacity} at a time. Write "track ${track} poly ${midis.length}" above this line to widen it, or spread the chord across channels with "chord ${row} ${track} …".`);
          break;
        }
        const midi = midis.length === 0 ? null : midis[0];
        commands.push({
          kind: 'note', line: lineNumber, pattern: state.pattern, row, track, midi,
          ...(midis.length > 1 ? { extras: midis.slice(1) } : {}),
          velocity: midi === null ? undefined : velocity,
          ...(midi !== null && articulation.slide ? { slide: true } : {}),
          ...(midi !== null && articulation.stutter > DEFAULT_STUTTER ? { stutter: articulation.stutter } : {}),
          ...(midi !== null && articulation.grace > 0 ? { grace: articulation.grace } : {}),
          ...(midi !== null && articulation.bend !== 0 ? { bend: articulation.bend } : {}),
        });
        break;
      }
      default:
        fail(lineNumber, `unknown command "${tokens[0]}". Commands are: ${SCRIPT_KEYWORDS.join(', ')}.`);
        break;
    }
  }

  return { commands, errors };
}

// --- applying ---------------------------------------------------------------

/** Reset a song IN PLACE to a blank one, keeping the caller's object identity. */
function resetInto(target: Song): void {
  const fresh = createSong();
  target.title = fresh.title;
  target.key = fresh.key;
  target.bpm = fresh.bpm;
  target.rowsPerBeat = fresh.rowsPerBeat;
  // The FEEL of the song is song data like any other, so `new` resets it: a
  // script that starts a fresh song and forgets about swing must not inherit the
  // lilt of whatever was on screen.
  target.swing = fresh.swing;
  // The TEMPO MAP is song data too: a script that says `new` and writes one bar
  // of a slow ballad must not inherit the ritardando of the last song.
  target.tempoMap = [];
  // And the groove with it: a fresh song is played straight, not played with
  // whatever feel the last one had. The two are reset together because they are
  // the two halves of one thing — how the song is performed.
  target.groove = fresh.groove;
  // The TUNING too: a script that says `new` and writes a piano piece must not
  // inherit the meantone of whatever was on screen before it.
  target.tuning = fresh.tuning;
  // The ROOM is song data too, and for the same reason: a script that says `new`
  // and nothing else must not leave the previous song's reverb standing under a
  // piece that was written dry.
  target.reverb = fresh.reverb;
  target.master = { ...fresh.master };
  target.echo = fresh.echo;
  target.tracks = fresh.tracks;
  target.patterns = fresh.patterns;
  // The order is song data like any other, so `new` resets it — otherwise a
  // script that starts with `new` would silently inherit the old arrangement.
  target.order = fresh.order;
  // And the LANES, which are the same kind of thing one level up: a script that
  // starts a fresh song must not inherit the last one's risers, and its own
  // `automate` lines would otherwise land ON TOP of them rather than replacing
  // them — the one way a lane could outlive the song that asked for it.
  target.automation = [];
  // The FORM too, for the same reason twice over: a fresh song has no named
  // sections, and the arrangement is reset with the order it describes — which
  // `setOrder` would have cleared anyway, but `new` resets the order by hand.
  target.sections = [];
  target.arrangement = [];
  // And the GROUPS: a fresh song has none, and the channels above are rebuilt
  // without one — so a script that says `new` and then joins `DRUMS` defines its
  // own group rather than landing in the last song's, at a level nobody can see.
  target.buses = [];
  // And the DRUM MACHINE: a fresh song has none, so a script that says `new` and
  // writes no `machine`/`pad` line must not inherit the last song's beat. This was
  // the one way a machine could outlive the song that asked for it — a script
  // beginning `new` left the previous machine's pads and hits in place, and
  // anything that then drew a beat added to them instead of starting from silence.
  target.machine = fresh.machine;
}

function applyCommand(song: Song, command: ScriptCommand, voices: readonly UserVoice[] = []): void {
  switch (command.kind) {
    case 'new':
      resetInto(song);
      return;
    case 'title':
      song.title = command.title;
      return;
    case 'key':
      song.key = copyKey(command.key);
      return;
    case 'tempo':
      song.bpm = clampBpm(command.bpm);
      return;
    case 'tempoPoint': {
      song.tempoMap = withTempoPoint(song.tempoMap, {
        slot: command.slot, bpm: command.bpm, slide: command.slide,
      });
      return;
    }
    case 'steps':
      setPatternRows(song, command.rows);
      return;
    case 'beat':
      song.rowsPerBeat = clampRowsPerBeat(command.stepsPerBeat);
      return;
    // Sugar lands as the pair it stands for, in the same order `steps` then `beat`
    // would have set them, so nothing downstream can tell which word was written.
    case 'grid':
    case 'meter':
      setPatternRows(song, command.shape.steps);
      song.rowsPerBeat = clampRowsPerBeat(command.shape.stepsPerBeat);
      return;
    case 'swing':
      song.swing = clampSwing(command.swing);
      return;
    case 'speed':
      song.speed = clampSpeed(command.speed);
      return;
    case 'groove':
      song.groove = command.groove;
      return;
    case 'kit':
      song.kit = command.kit;
      return;
    case 'tuning':
      song.tuning = command.tuning;
      return;
    case 'chip': {
      // Every channel, by index, from the console's line-up — cycling when the
      // song is wider than the machine. The name and the rest of the channel are
      // left alone: a chip is a sound, not a part.
      const profile = chipById(command.chip);
      if (!profile) return;
      song.tracks.forEach((track, i) => {
        track.voice = chipVoiceFor(profile, i);
        // A console lays a SOUND over the channel, so any layers stacked on it go
        // with it: leaving them behind would mean `chip nes` did not actually make
        // the channel a NES pulse, and the same profile would sound different on
        // a song that had been layered. The cost is that the stack is not
        // recoverable by a later line — which is why `chip` is a starting point
        // and belongs near the top of a script, as the docs already say.
        track.stack = [];
      });
      return;
    }
    case 'reverb':
      song.reverb = clampRoom(command.reverb);
      return;
    case 'echo':
      song.echo = clampRoom(command.echo);
      return;
    case 'master':
      // One effect at a time, so a line that names one of the seven leaves the
      // others where they were — the same rule a `track` line follows, and the
      // reason `master drive 20` on a shaped mix does not wipe its tilt.
      for (const effect of TRACK_EFFECTS) {
        const amount = command.effects[effect.id];
        if (amount !== undefined) song.master[effect.id] = clampEffect(amount);
      }
      return;
    case 'automate':
      // A lane joins the song's list in reading order. Later lanes take over where
      // they start, which is what makes a rise and a fall two lines rather than
      // one clever one, and what makes the LAST line about a bar the one that
      // counts — the same bargain the tempo map makes.
      song.automation = withAutomationLane(song.automation, {
        track: clampAutomationTrack(command.track, song.tracks.length),
        target: command.target,
        from: command.from,
        to: command.to,
        startBar: command.startBar,
        endBar: command.endBar,
      });
      return;
    case 'section':
      // A name joins the song's form. Replacing a name it already has is the same
      // bargain as everything else here: the last line about a thing counts.
      song.sections = withSection(song.sections, {
        name: command.name,
        bars: command.bars,
        machineBar: command.machineBar ?? null,
      });
      return;
    case 'arrange': {
      // The order, built from the names. `setOrder` also forgets any earlier
      // arrangement, so the claim is written AFTER it — which is the order these
      // two lines have to be in for the invariants to hold.
      const { bars } = arrangementBars(song.sections, command.names);
      setOrder(song, bars);
      song.arrangement = command.names.slice();
      return;
    }
    case 'scene':
      // A row joins the live set. Replacing a name the song already has is the
      // same bargain as everywhere else here: the last line about a thing counts,
      // and the clips are fitted to the channels as of the END of the script.
      song.scenes = withScene(song.scenes, { name: command.name, clips: command.clips, machine: command.machine }, song.tracks.length);
      return;
    case 'volume':
      // Handled by the caller: the master level is not part of the song.
      return;
    case 'export':
      // And neither is a loop region: the song is the whole song whether you
      // bounce four bars of it or all of it.
      return;
    case 'bus':
      // A group joins the mix. Replacing a name the song already has is the same
      // bargain as everywhere else here: the last line about a thing counts, so a
      // later `bus DRUMS 55` moves the group rather than defining a second one.
      song.buses = withBus(song.buses, { name: command.name, level: command.level });
      return;
    case 'tracks':
      // Channels that go away take their bus membership with them: the array is
      // rebuilt, and each fresh channel starts on no group at all.
      setTrackCount(song, command.count);
      return;
    case 'track': {
      const track = song.tracks[command.index - 1];
      if (!track) return;
      if (command.name !== undefined) track.name = command.name;
      // Order is deliberate and independent of how the line was written: a named
      // voice first, then any explicit knob, then a bare waveform last. So
      // `track 1 voice pad bright 90` is a brighter pad, and `voice pad wave sine`
      // is a pad whose shape is pinned — the more specific word wins, the same way
      // it does everywhere else in the language.
      if (command.voice !== undefined) {
        // A built-in preset first, then the user's own sounds: one namespace for
        // the author, two tables behind it, and `voiceNameProblem` keeps the two
        // from ever sharing a name.
        const preset = voiceById(command.voice);
        const saved = preset ? null : userVoiceFromName(command.voice, voices);
        if (preset) track.voice = copyVoice(preset.params);
        else if (saved) {
          // A saved sound is applied as its WHOLE self — its voice AND the layers
          // saved with it. A built-in preset is applied as its voice, because a
          // voice is all it is, so `track 1 voice pad` means exactly what it has
          // always meant, and so does a sound saved before layers could be saved.
          const sound = copySound(savedSound(saved));
          track.voice = sound.voice;
          if (sound.stack.length > 0) track.stack = sound.stack;
        }
      }
      if (command.params !== undefined) {
        for (const param of VOICE_PARAMS) {
          const value = command.params[param.id];
          if (typeof value === 'number') track.voice[param.id] = clampParam(value);
        }
      }
      if (command.wave !== undefined) track.voice.wave = command.wave;
      if (command.muted !== undefined) track.muted = command.muted;
      if (command.hold !== undefined) track.hold = clampHold(command.hold);
      if (command.level !== undefined) track.level = clampLevel(command.level);
      if (command.pan !== undefined) track.pan = clampPan(command.pan);
      if (command.glide !== undefined) track.glide = clampGlide(command.glide);
      if (command.vibrato !== undefined) track.vibrato = clampVibrato(command.vibrato);
      if (command.strum !== undefined) track.strum = clampStrum(command.strum);
      if (command.robin !== undefined) track.robin = clampRobin(command.robin);
      if (command.touch !== undefined) track.touch = clampTouch(command.touch);
      if (command.drift !== undefined) track.drift = clampDrift(command.drift);
      if (command.duck !== undefined) track.duck = clampDuck(command.duck);
      if (command.groove !== undefined) track.groove = command.groove;
      if (command.shape !== undefined) track.shape = command.shape;
      if (command.humanize !== undefined) track.humanize = clampHumanize(command.humanize);
      if (command.poly !== undefined) track.poly =  clampPoly(command.poly);
      // Which GROUP the channel is in, or `null` for none. Checked at parse time
      // against the buses the script knows, so this is only the assignment.
      if (command.bus !== undefined) track.bus = command.bus;
      // And which of your recordings it plays, or `null` for its own sound. A
      // name the app has no file for is left ALONE here — the reference is the
      // song's, and whether the audio is in this browser is the engine's
      // business, so resolving it against a bank would be the wrong layer to
      // check it in.
      if (command.sample !== undefined) track.sample = command.sample;
      if (command.verb !== undefined) track.verb = clampSend(command.verb);
      if (command.echo !== undefined) track.echo = clampSend(command.echo);
      // The effects, written through the model's own clamp: a line that names two
      // of them leaves the other four exactly as they were, which is what makes
      // `track 1 drive 40` a change to one knob rather than a reset of six.
      if (command.effects !== undefined) {
        const fx = clampEffects(command.effects);
        for (const effect of TRACK_EFFECTS) {
          if (command.effects[effect.id] !== undefined) track[effect.id] = fx[effect.id];
        }
      }
      return;
    }
    case 'layer': {
      const track = song.tracks[command.track - 1];
      if (!track) return;
      // The parser already refused a layer that would leave a hole, so this is
      // the write itself: layer 1 is the voice, a new layer is a copy of the one
      // below it, and `clear` takes one out and shifts the rest down.
      if (command.clear) {
        clearTrackLayer(track, command.index);
        return;
      }
      setTrackLayer(track, command.index, command.change ?? {});
      return;
    }
    case 'machine': {
      // The machine is created by the first line about it — a `machine` or a
      // `pad` — and every later line edits the one the song has. That is what
      // makes `machine level 80` alone a real instruction rather than a promise
      // about an instrument that does not exist yet.
      const machine = song.machine ?? (song.machine = createMachine(command.steps ?? DEFAULT_MACHINE_STEPS));
      if (command.enabled !== undefined) machine.enabled = command.enabled;
      if (command.beat !== undefined) machine.beat = clampMachineBeat(command.beat);
      if (command.swing !== undefined) machine.swing = clampSwing(command.swing);
      if (command.level !== undefined) machine.level = clampLevel(command.level);
      if (command.pan !== undefined) machine.pan = clampPan(command.pan);
      if (command.bus !== undefined) machine.bus = command.bus;
      if (command.verb !== undefined) machine.verb = clampSend(command.verb);
      if (command.echo !== undefined) machine.echo = clampSend(command.echo);
      if (command.duck !== undefined) machine.duck = clampDuck(command.duck);
      if (command.effects !== undefined) {
        const fx = clampEffects(command.effects);
        for (const effect of TRACK_EFFECTS) {
          if (command.effects[effect.id] !== undefined) machine.effects[effect.id] = fx[effect.id];
        }
      }
      // The step count LAST, so a growing machine grows every row with it — and
      // a line that only sets a level leaves the rows exactly as they were.
      if (command.steps !== undefined) {
        const resized = resizeMachine(machine, command.steps);
        machine.steps = resized.steps;
        machine.pads = resized.pads;
        machine.bars = resized.bars;
      }
      // How many PADS and BARS the machine has, before the bar lines below so
      // those land on the shape this line asked for. Growing a pad fills in a kit
      // pad; shrinking drops the last ones and takes their rows off every bar, as
      // `DEL PAD` does. Growing a bar COPIES the last, as `+ BAR` does.
      if (command.pads !== undefined) {
        const live = song.machine ?? machine;
        const had = live.pads.length;
        if (command.pads > had) {
          let grown = live;
          for (let index = had + 1; index <= command.pads; index += 1) {
            grown = withPad(grown, index, defaultPad(index, grown.steps));
          }
          song.machine = grown;
        } else if (command.pads < had) {
          song.machine = {
            ...live,
            pads: live.pads.slice(0, command.pads),
            bars: live.bars.map((bar) => bar.slice(0, command.pads)),
          };
        }
      }
      if (command.bars !== undefined) {
        let live = song.machine ?? machine;
        while (machineBarCount(live) < command.bars) live = addMachineBar(live);
        while (machineBarCount(live) > command.bars) live = removeMachineBar(live, machineBarCount(live));
        song.machine = live;
      }
      // The BAR lines LAST, after any settings the same line carried: `machine
      // pattern 3` grows the machine to three bars, filling the ones in between
      // with rests, and `machine order …` then clamps its list to the bars that
      // exist. Both replace the machine rather than mutate it, so they come after
      // every in-place write above.
      if (command.bar !== undefined || command.order !== undefined) {
        const current = song.machine ?? machine;
        const barred = command.bar === undefined
          ? current
          : withMachineBar(current, command.bar, machineBarRows(current, command.bar));
        song.machine = command.order === undefined ? barred : setMachineOrder(barred, command.order);
      }
      return;
    }
    case 'pad': {
      const machine = song.machine ?? (song.machine = createMachine());
      // The pad being edited is the one the song has, or a fresh one seeded from
      // the kit at that position — so `pad 5 TOM level 60` works on a machine
      // that never declared pads 1-4 and fills them with their defaults.
      const existing = padAt(machine, command.index) ?? defaultPad(command.index, machine.steps);
      const next: DrumPad = { ...existing, voice: { ...existing.voice }, steps: existing.steps.slice() };
      if (command.name !== undefined) next.name = command.name;
      if (command.voice !== undefined) {
        const preset = voiceById(command.voice);
        const saved = preset ? null : userVoiceFromName(command.voice, voices);
        if (preset) next.voice = copyVoice(preset.params);
        else if (saved) next.voice = copyVoice(savedSound(saved).voice);
      }
      if (command.params !== undefined) {
        for (const param of VOICE_PARAMS) {
          const value = command.params[param.id];
          if (typeof value === 'number') next.voice[param.id] = clampParam(value);
        }
      }
      if (command.wave !== undefined) next.voice.wave = command.wave;
      if (command.sample !== undefined) next.sample = command.sample;
      if (command.level !== undefined) next.level = clampLevel(command.level);
      if (command.pan !== undefined) next.pan = clampPan(command.pan);
      // Tuning is measured from the pad's KIT pitch, not from wherever it is now,
      // so `pad 5 tune 3` means the same thing however many times it is written.
      if (command.tune !== undefined) {
        next.pitch = clampMidi(defaultPad(command.index, machine.steps).pitch + clampTune(command.tune));
      }
      if (command.steps !== undefined) next.steps = resizeRow(command.steps, machine.steps);
      const bar = command.bar ?? 1;
      if (bar === 1) {
        // Bar 1 IS the pads' own rows, so the whole pad — sound and row — lands
        // there in one write, exactly as every machine line before bars did.
        song.machine = withPad(machine, command.index, next);
        return;
      }
      // Past bar 1 the SOUND still belongs to the pad; only the ROW belongs to the
      // bar. So the sound is written through `withPad` with the pad's existing
      // row, and the new row goes into the bar on its own.
      const grown = withPad(machine, command.index, { ...next, steps: existing.steps });
      song.machine = grown;
      if (command.steps !== undefined) {
        const rows = machineBarRows(grown, bar);
        rows[command.index - 1] = next.steps;
        song.machine = withMachineBar(grown, bar, rows);
      }
      return;
    }
    case 'pattern': {
      const pattern = ensurePattern(song, command.index);
      if (command.name !== undefined) pattern.name = command.name;
      return;
    }
    case 'order':
      // `setOrder` creates any pattern the order names, which is why `order 1 2`
      // is a working two-bar song on a fresh one-pattern file rather than an
      // error about a pattern that does not exist yet.
      setOrder(song, command.order);
      return;
    case 'clear': {
      const pattern = ensurePattern(song, command.pattern);
      for (const row of pattern.steps) for (const cell of row) setCellNotes(cell, []);
      return;
    }
    case 'copy':
      copyPattern(song, command.from, command.to);
      return;
    case 'rows': {
      const pattern = ensurePattern(song, command.pattern);
      const range: RowRange = { from: command.from, to: command.to };
      if (command.transform === 'repeat') {
        repeatRange(pattern, range, command.times);
      } else if (command.transform === 'roll') {
        rollRange(pattern, range, command.roll);
      } else if (command.transform === 'reverse') {
        reverseRange(pattern, range);
      } else {
        shiftRangeOctaves(pattern, range, command.transform === 'octave-up' ? command.octaves : -command.octaves);
      }
      return;
    }
    case 'note': {
      const pattern = ensurePattern(song, command.pattern);
      const cell = pattern.steps[command.row]?.[command.track - 1];
      if (cell) {
        // Writing a note writes the cell's whole self — the notes it holds, and
        // then its force and how it is played. A cell was already the unit of
        // that rule (re-typing a note over one that slid takes the slide off);
        // the notes are simply the first thing it says. Erasing clears the notes
        // and leaves the velocity alone, as it always has.
        if (command.drum !== undefined) {
          // A DRUM is a hit rather than a note: the cell becomes that kit sound,
          // at the drum's own pitch. The order matters — `setCellDrum` would
          // otherwise be undone by the note write below, and a cell is one thing.
          setCellDrum(cell, command.drum);
        } else {
          setCellNotes(cell, command.midi === null ? [] : [command.midi, ...(command.extras ?? [])]);
        }
        // A note's force is part of the note, so writing a note always writes
        // its velocity: an unspecified one is full, which is exactly what every
        // script written before velocity existed means. Erasing leaves the
        // velocity alone — there is no note left for it to belong to.
        if (command.midi !== null) {
          cell.velocity = clampVelocity(command.velocity ?? DEFAULT_VELOCITY);
          // (A drum hit's force and gesture are written here exactly like a
          // note's — one cell, one gesture, whichever kind of cell it is.)
          // And so is how it is PLAYED: writing a note writes its whole self, so
          // re-typing a note over one that slid takes the slide off. Optional
          // fields that were left out mean the default, exactly as with velocity.
          cell.slide = command.slide === true;
          cell.stutter = clampStutter(command.stutter ?? DEFAULT_STUTTER);
          cell.grace = clampGrace(command.grace ?? 0);
          cell.bend = clampBend(command.bend ?? 0);
        }
      }
      return;
    }
    case 'chord': {
      const pattern = ensurePattern(song, command.pattern);
      // A degree is relative to the key NOW, after every earlier `key` line has
      // run — which is why it was left unresolved at parse time.
      const notes = command.spec.kind === 'name'
        ? chordPitches(baseMidiForOctave(command.octave) + command.spec.root, command.spec.quality)
        : degreeChord(command.spec.degree, song.key, command.octave, DEFAULT_CHORD_DEGREES);
      if (command.arp !== null) {
        // The run, one note per step, all on the channel the line named: the same
        // chord data with a DIRECTION rather than a second way to write notes.
        // A note is written per step, so nothing here touches the file format —
        // an arpeggio is what the grid already holds, in an order.
        arpNotes(notes, command.arp).forEach((midi, i) => {
          const cell = pattern.steps[command.row + i]?.[command.track - 1];
          if (cell) setCellNotes(cell, [midi]);
        });
        return;
      }
      // A WIDE channel keeps the whole chord in ONE cell: that is what `poly`
      // bought, and it is the difference between a triad costing three channels
      // and costing one. A channel that can only hold one note — every channel
      // before this, and every channel nobody widened — spreads the notes across
      // the channels that follow, exactly as it always did.
      if (clampPoly(song.tracks[command.track - 1]?.poly ?? DEFAULT_POLY) >= notes.length) {
        const cell = pattern.steps[command.row]?.[command.track - 1];
        if (cell) setCellNotes(cell, notes);
        return;
      }
      notes.forEach((midi, i) => {
        const cell = pattern.steps[command.row]?.[command.track - 1 + i];
        if (cell) setCellNotes(cell, [midi]);
      });
      return;
    }
    case 'arp': {
      // The dials join the song, or leave it. A setting is a MERGE — each `arp`
      // line moves the fields it names and leaves the rest, which is exactly what
      // lets a saved script write `direction`, then the three numbers, then
      // `mode`, and land the settings it started from. `settings: null` is
      // `arp off`, which clears them so the song once again writes no key.
      if (command.settings === null) {
        song.arp = null;
        return;
      }
      song.arp = clampArp({ ...(song.arp ?? DEFAULT_ARP), ...command.settings });
      return;
    }
    case 'arpWrite': {
      // The run, one note per step, on the channel the line named — the same
      // arithmetic `chord … arp` performs, read from the song's stored dials
      // rather than spelled on the line. The walk stops when it runs out of
      // chord or out of room, so nothing here can run off the pattern; the ONE
      // function that decides the notes is `generateArp`, which calls the
      // modifier's own `arpNotes`, so a preview and a write cannot disagree.
      const pattern = ensurePattern(song, command.pattern);
      const notes = command.spec.kind === 'name'
        ? chordPitches(baseMidiForOctave(command.octave) + command.spec.root, command.spec.quality)
        : degreeChord(command.spec.degree, song.key, command.octave, DEFAULT_CHORD_DEGREES);
      const settings = song.arp ?? DEFAULT_ARP;
      const available = pattern.steps.length - command.row;
      for (const step of generateArp(notes, command.row, settings, available)) {
        const cell = pattern.steps[step.step]?.[command.track - 1];
        if (!cell) continue;
        setCellNotes(cell, [step.note]);
        // GATE is the one per-cell intensity a cell holds, so it is written
        // whether or not it differs from the default: the run SAYS each note's
        // velocity, and a cell left holding some other number would make the
        // written grid disagree with the run the page previewed and heard. At the
        // default this writes the value the cell already had (100), which is what
        // still keeps `arp write` at `gate 100` equal to `chord … arp`.
        cell.velocity = step.velocity;
      }
      return;
    }
    case 'progression': {
      // The loop joins the song, or leaves it. Copied on the way in, because the
      // command is a parse-time snapshot and the song owns what it plays: a later
      // line's `hold` must not reach back and lengthen a chord already written.
      song.progression = command.progression === null
        ? null
        : withProgressionSteps(command.progression.steps, command.progression.hold);
      return;
    }
    case 'follow': {
      // The follower, which is where the loop becomes notes: one cell per chord
      // on the rows the loop lands on, from the row the line named to the end of
      // the pattern — a progression is a loop, so it repeats rather than running
      // out. Only those rows are written; everything else on the channel is left
      // alone, the same bargain `chord ROW TRACK NAME` makes for one cell.
      const pattern = ensurePattern(song, command.pattern);
      const rows = pattern.steps.length;
      for (const row of progressionStartRows(command.progression, rows, command.row)) {
        const cell = pattern.steps[row]?.[command.track - 1];
        if (!cell) continue;
        const step = progressionStepAt(command.progression, row);
        setCellNotes(cell, command.what === 'chords'
          ? progressionStepNotes(step, song.key, command.octave)
          : [progressionStepRoot(step, song.key, command.octave)]);
      }
      return;
    }
    default:
      return;
  }
}

/**
 * One observation, and the line of script that answers it.
 *
 * `fix` is the rail half. The plan calls these "rails, not errors", and a rail
 * GUIDES: where an observation has one mechanical answer, the answer is a single
 * line of the language the app already has — `track 2 level 70`, `layer 2 3 gain
 * 40`, `arrange VERSE CHORUS` — which the app can offer and apply, and which
 * teaches the word to whoever presses it. Where there is no mechanical answer
 * ("this channel has no notes" is fixed by writing notes, and "this section is
 * never played" by deciding which bar it belongs in), `fix` is null: an app that
 * guessed at those would be editing the song on a hunch.
 */
export interface AdvisoryDetail {
  text: string;
  fix: string | null;
}

/**
 * Observations that are not mistakes but that an author usually wants to know.
 *
 * The strings are the published shape — `summarizeSong` hands them to the API and
 * the docs describe them — and the DETAIL is what the app's own notice channel
 * speaks, because a person can press a fix and an agent can read one.
 */
export function advisoriesFor(song: Song, bounce: BounceRange | null): string[] {
  return advisoriesDetailed(song, bounce).map((advisory) => advisory.text);
}

/** The observations WITH their one-line fix, where one exists. */
export function advisoriesDetailed(song: Song, bounce: BounceRange | null): AdvisoryDetail[] {
  const out: AdvisoryDetail[] = [];
  // A song is "empty" only when it has neither a note nor a machine hit, so a
  // machine-only song is a song rather than an empty grid with a beat on it.
  const hasNotes = countSongNotes(song) > 0;
  const hasMachine = song.machine !== null && countMachineHits(song.machine) > 0;
  if (!hasNotes && !hasMachine) {
    // No line writes notes. The fix for an empty song is the song.
    out.push({ text: 'the song has no notes yet.', fix: null });
    return out;
  }
  // The empty-pattern and unused-channel observations are about a song whose
  // PARTS are written and some are silent; a machine-only song has no parts yet,
  // so telling it every channel is empty would be noise rather than advice.
  if (hasNotes) {
    song.patterns.forEach((pattern, i) => {
      if (countNotes(pattern) === 0) out.push({ text: `pattern ${i + 1} is empty.`, fix: null });
    });
    usedTracks(song).forEach((used, i) => {
      if (!used) out.push({ text: `track ${i + 1} "${song.tracks[i].name}" has no notes.`, fix: null });
    });
  }
  // A stack is LEVEL as well as tone: the voice is at full gain, so a stack of
  // copies adds up rather than blending in. Four layers at 100 is a channel six
  // decibels louder than it was, which is a way to make a song louder than the
  // limiter wants — said as an observation, because it is a decision an author is
  // allowed to make and turning one layer down is one word away.
  song.tracks.forEach((track, i) => {
    if (layerCount(track) < 3) return;
    if (!track.stack.every((layer) => layer.gain === DEFAULT_LAYER_GAIN)) return;
    // The fix is the example the sentence already gives, made real: the top
    // layer comes down to 40, which is one press and one `Ctrl+Z` away.
    out.push({
      text: `track ${i + 1} "${track.name}" stacks ${layerCount(track)} layers all at full gain, so it is much louder than one - turn one down, e.g. "layer ${i + 1} 3 gain 40".`,
      fix: `layer ${i + 1} ${layerCount(track)} gain 40`,
    });
  });
  // A channel that will CLIP. The mix fader and the layers MULTIPLY, and each is a
  // percentage of full scale, so a fader over a stack whose gains add past 100 asks
  // for more amplitude than a channel has — the one observation here about how a
  // channel SITS rather than what it contains. The all-at-full-gain case above is
  // the same problem said more precisely, so this one deliberately steps over it and
  // catches the shapes that one cannot: two layers at full, three with one turned
  // down, or any of those under a group whose own fader is up.
  const levels = song.tracks.map((track) => track.level);
  const mutes = song.tracks.map((track) => track.muted);
  const busLevels = channelBusLevels(song.buses, song.tracks);
  song.tracks.forEach((track, i) => {
    if (mutes[i] === true) return;
    const layers = layerCount(track);
    if (layers >= 3 && track.stack.every((layer) => layer.gain === DEFAULT_LAYER_GAIN)) return;
    const fader = channelGain(i, levels, mutes, [], busLevels[i] ?? MAX_LEVEL);
    // The voice is layer 1 at full gain and is NOT in `track.stack`, so the sum
    // starts at one and adds only the layers above it.
    const stack = 1 + track.stack.reduce((sum, layer) => sum + layer.gain / DEFAULT_LAYER_GAIN, 0);
    if ((fader / MAX_LEVEL) * stack <= 1) return;
    // The fader that brings this channel exactly back to full scale: the same
    // multiplication the check above just did, read backwards. It is the RIGHT
    // answer rather than the example's round number, and it deliberately ignores
    // a group's own fader — dividing by the stack alone can only leave the
    // channel quieter than it needs to be, which is the safe direction to be
    // wrong in, where the other direction clips.
    const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(MAX_LEVEL / stack)));
    out.push({
      text: `track ${i + 1} "${track.name}" adds up past full scale at this level and stack - it may clip; turn the fader down, e.g. "track ${i + 1} level 70".`,
      fix: `track ${i + 1} level ${level}`,
    });
  });
  // The song's FORM, if it has one. Two observations rather than mistakes, and
  // both are states an author is allowed to be in: a part with no bar in the song
  // yet, and a song that names its bars and is not using the names. Each is one
  // line away from being finished, which is what makes it worth saying.
  if (formUnarranged(song.sections, song.arrangement)) {
    // Every section once, in the order they are defined: the plainest form that
    // is a form, and the one a person can then reorder by hand in `F3`.
    const names = song.sections.map((section) => section.name).join(' ');
    out.push({
      text: 'the song defines sections but its order is not an arrangement of them - one "arrange ..." line writes the form.',
      fix: `arrange ${names}`,
    });
  }
  sectionsNeverPlayed(song.sections, song.arrangement).forEach((name) => {
    // Which bar this section belongs in is a decision, not an observation.
    out.push({ text: `section "${name}" is defined but the arrangement never plays it.`, fix: null });
  });
  // A bounce range that reaches past the end of the order. Not a mistake — the
  // region is fitted when it is used, and a script may legitimately name one
  // above the `arrange` line that makes the order long enough — but an author who
  // asked for bars 8 to 15 of a four-bar song is about to export four bars, and
  // that is worth saying before they do.
  if (bounce !== null && bounceReaches(bounce, song.order.length)) {
    // The range is a session setting rather than a song field, so there is no
    // line here to offer — `export bars` is applied by the caller that owns it.
    out.push({
      text: `the export range reaches bar ${bounce.to}, but the song is only ${song.order.length} bars long, so the export covers the bars it has.`,
      fix: null,
    });
  }
  return out.slice(0, 6);
}

export function summarizeSong(song: Song, bounce: BounceRange | null = null): ScriptSummary {
  return {
    title: song.title,
    key: keyName(song.key),
    bpm: song.bpm,
    patterns: song.patterns.length,
    slots: song.order.length,
    tracks: song.tracks.length,
    steps: patternRows(song),
    stepsPerBeat: song.rowsPerBeat,
    notes: countSongNotes(song),
    scenes: song.scenes.length,
    advisories: advisoriesFor(song, bounce),
  };
}

/**
 * Parse a script and, only if it is clean, apply it to a COPY of the song.
 *
 * The copy is the whole safety story: an author can paste anything at all, and
 * the worst case is an error list. The caller swaps the returned song in (and
 * records one undo step), or shows the errors and changes nothing.
 */
export function applyScript(
  song: Song,
  source: string,
  voices: readonly UserVoice[] = [],
): ScriptApplyResult {
  const { commands, errors } = parseScript(source, {
    trackCount: song.tracks.length,
    rows: patternRows(song),
    rowsPerBeat: song.rowsPerBeat,
    voices,
    // The lanes the song already carries, so the one ceiling this language has on
    // them is enforced against the song rather than against the script alone.
    laneCount: song.automation.length,
    // And the sections it already names, so `arrange VERSE` works in a script that
    // never wrote `section VERSE` — the song already has one, and a form is
    // something a song HAS rather than something a script invents.
    sections: song.sections,
    // And the live set it already has, so a `scene A …` line REPLACES the row the
    // song already calls A rather than colliding with it — the last line about a
    // name counts — and so the scene ceiling is counted against the set the song
    // will really have.
    scenes: song.scenes,
    // And the groups it already has, so `track 2 bus DRUMS` works in a script that
    // never wrote `bus DRUMS` — a group is something a song HAS, and the script
    // may only be moving one of its faders.
    buses: song.buses,
    // And how wide its channels already are, so a chord in a cell is refused only
    // when the channel it lands on really is too narrow to sound it.
    polys: song.tracks.map((track) => track.poly),
    // And the chord loop it already has, so `chord 0 1 follow` works in a script
    // that never wrote a `progression` line — the loop is something a song HAS,
    // and the script may only be hanging another channel on it.
    progression: song.progression,
    // And how big its drum machine already is, so a `pad` pattern is checked
    // against the machine it will land on rather than against the default.
    machineSteps: song.machine?.steps ?? DEFAULT_MACHINE_STEPS,
  });
  if (errors.length > 0) return { ok: false, errors };

  const draft = structuredClone(song);
  const settings: ScriptSettings = { volume: null };
  for (const command of commands) {
    // The four statements about how the APP is set up, rather than about the
    // music: they are collected here and handed back in `settings`, exactly like
    // the master volume, because none of them is part of a song. The LAST one of
    // each wins, so a script can change its mind partway through.
    switch (command.kind) {
      case 'volume': settings.volume = command.volume; continue;
      case 'export': {
        // Each half is written only when the script MENTIONED it, so a `loud`
        // line does not silently wipe the region an earlier line marked — the
        // reason the command's two fields are optional rather than nullable.
        if (command.range !== undefined) settings.bounce = command.range;
        if (command.loud !== undefined) settings.loud = command.loud;
        continue;
      }
      case 'octave': settings.octave = command.octave; continue;
      case 'theme': settings.theme = command.theme; continue;
      case 'page': settings.page = command.page; continue;
      case 'liveQuantize': settings.liveQuantize = command.bars; continue;
      case 'solo': settings.solo = command.channels; continue;
      case 'chords': settings.chordDegrees = command.degrees; continue;
      case 'hear': settings.hearNotes = command.on; continue;
      case 'instrumentUse': settings.instrumentUse = command.query; continue;
      case 'instrumentImport': settings.instrumentImport = true; continue;
      case 'instrumentLoad': settings.instrumentLoad = command.source; continue;
      case 'sampleLoad': settings.sampleLoad = command.source; continue;
      case 'sampleImport': settings.sampleImport = true; continue;
      // The takes. A capture name is a scalar (the last one wins, as the rest
      // are); the trims and loops are LISTS, because a script may shape several
      // takes and "last one wins" would drop every take but the last.
      case 'recordCapture': settings.recordCapture = command.name; continue;
      case 'recordTrim': (settings.recordTrims ??= []).push({ name: command.name, start: command.start, end: command.end }); continue;
      case 'recordLoop': (settings.recordLoops ??= []).push({ name: command.name, start: command.start, end: command.end }); continue;
      case 'recordSelect': settings.recordSelect = command.name; continue;
      case 'arpAudition': settings.arpAudition = command.on; continue;
      default: break;
    }
    applyCommand(draft, command, voices);
  }
  // The region is handed to the summary because it is the one thing it can
  // observe that is not IN the song: a range that reaches past the order is worth
  // saying out loud before somebody exports four bars instead of eight.
  return { ok: true, song: draft, summary: summarizeSong(draft, settings.bounce ?? null), settings };
}

// --- the panel's quick reference --------------------------------------------

/**
 * A cheat sheet short enough to sit beside the paste box. Every word the parser
 * knows appears here at least once, so the two cannot drift — a new keyword that
 * nobody can find is a keyword nobody uses.
 */
export const SCRIPT_QUICK_REFERENCE: readonly string[] = [
  'new  song "MY TUNE"  tracks 4',
  'key D minor  octave 5  tempo 120',
  'beat 4  steps 32  grid 16',
  'meter 7 8  tuning just  swing 60',
  'groove shuffle  speed 80',
  'kit 808  chip nes  volume 70',
  'reverb 30  echo 20  master tilt',
  'theme forge  chords 7th  solo 2',
  'hear on  automate 1 gate 0',
  'machine level 85  pad 1 KICK',
  'section A 1  arrange A  scene A',
  'progression Am F C  bus DRUMS 70',
  'instrument use 1  export all',
  'start house  track 1 voice',
  'page mixer  live  record HOOK',
  'layer 1 2 wave saw octave 1',
  'sample 2 BRK  pattern 1 "A"',
  'mute 1 unmute 1  erase 0 1',
  'copy 1 2  clear 0  note 0 1 C-4',
  'chord 0 1 arp  drum 0 4 kick',
  'rows 0 to 3 repeat 2  order 1',
];

/** The one-line reminder printed under the reference. */
export const SCRIPT_RULE_OF_THUMB =
  'ROWS COUNT FROM 0, TRACKS FROM 1. ONE LINE PER STEP, "." FOR EMPTY.';

/**
 * A complete, known-good song: the panel's LOAD EXAMPLE button, and the
 * fixture a test applies to prove the language still parses. Keeping the
 * example HERE rather than in the docs means it cannot rot — if the parser
 * moves, this test fails.
 *
 * It is deliberately a real little tune (an Am - F - C - G bar) rather than a
 * syntax demo, because the fastest way to learn the notation is to hear what
 * it already says.
 */
export const SCRIPT_EXAMPLE = `# TRACKLET SCRIPT - paste this box and press APPLY.
# A line with no command word is a GRID ROW: one step per line,
# one column per track. "." leaves that column empty for that step.

new
song "FIRST SCRIPT"
key A minor
tempo 128
tracks 4

track 1 "LEAD" voice lead
track 2 "BASS" voice bass level 65
track 3 "PAD"  voice pad hold 4 level 45
track 4 "HAT"  voice hat

pattern 1 "VERSE"

A-4 A-2 E-4 C-6
C-5 .   .   .
E-5 .   .   C-6
C-5 .   .   .
F-4 F-2 C-5 C-6
A-4 .   .   .
C-5 .   .   C-6
A-4 .   .   .
C-5 C-3 G-4 C-6
E-5 .   .   .
G-5 .   .   C-6
E-5 .   .   .
G-4 G-2 D-5 C-6
B-4 .   .   .
D-5 .   .   C-6
B-4 .   .   .
`;

/** Where the full documentation lives, relative to the project root. */
export const SCRIPT_DOC_PATH = 'doc/03-script-reference.md';
