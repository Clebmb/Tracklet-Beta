/**
 * songfile — the two file formats a Tracklet song travels in.
 *
 * A song can leave the app as either of two files, and both of them come back
 * in with the same OPEN, because the app has to be able to say "your song is
 * safe" without asking the user to understand a format menu:
 *
 *   • A TRACKLET SCRIPT (`.txt`). The app's own text notation, written out the
 *     same way a person would write it by hand: a header, then `track` lines,
 *     then one grid row per step. It is the readable one — you can open it in
 *     any editor, edit a note by hand, paste it back into the SCRIPT panel, or
 *     hand it to a model and ask for a variation. `songToScript` is the exact
 *     inverse of `applyScript`, and a test proves it by round-tripping.
 *
 *   • A TRACKLET SONG FILE (`.json`). The same song as plain data: numbers in,
 *     numbers out, no parser in between. It is the lossless one — nothing here
 *     depends on a notation being expressive enough to spell something, so it
 *     is what a tool should read and write.
 *
 * Neither is a "project" format with hidden state. The master volume is the one
 * thing that is not part of the song (a `Song` is notes and structure; the
 * level is a property of the room), so it travels BESIDE the song in both
 * formats and is `null` when nobody set it. That is `ScriptSettings`, shared
 * with the script language rather than invented twice.
 *
 * OPEN is deliberately not a merge. A file replaces the whole song, so a script
 * without a `new` line is applied to a BLANK song rather than to whatever was
 * on screen — the alternative is a file whose meaning depends on what you
 * happened to have open, which is the sort of surprise a beginner cannot debug.
 *
 * Phaser-free and dependency-free, like the rest of the model, so every rule
 * here is unit tested (see __tests__/songfile.test.ts).
 */

import {
  AUTOMATION_TARGET_WORDS,
  MAX_AUTOMATION_LANES,
  clampAutomationBar,
  clampAutomationTrack,
  isAutomationTarget,
  lanesToScript,
  sortAutomationLanes,
  tidyLane,
  type AutomationLane,
  type AutomationTargetId,
} from './automation';
import {
  arrangementDescribes,
  arrangementScript,
  clampSectionMachineBar,
  MAX_SECTIONS,
  sectionByName,
  sectionScript,
  tidySection,
  tidySectionName,
  tidySections,
  type Section,
} from './sections';
import {
  clampSceneBar,
  clampSceneClip,
  MAX_SCENES,
  sceneScript,
  tidyScene,
  tidyScenes,
  type Scene,
} from './scenes';
import { ARP_DIRECTIONS, CHORD_SPELLINGS, arpDirectionFromName, parseChordName, parseDegree } from './chord';
import {
  MAX_ARP_GATE,
  MAX_ARP_OCTAVES,
  MAX_ARP_RATE,
  MIN_ARP_OCTAVES,
  ARP_MODES,
  arpScript,
  clampArp,
  type ArpMode,
  type ArpSettings,
} from './arp';
import {
  DEFAULT_PROGRESSION_HOLD,
  MAX_PROGRESSION_HOLD,
  MAX_PROGRESSION_STEPS,
  MIN_PROGRESSION_HOLD,
  progressionHold,
  progressionScript,
  progressionStepLabel,
  withProgressionSteps,
  type Progression,
  type ProgressionStep,
} from './progression';
import {
  clampRobin,
  clampTouch,
  DEFAULT_ROBIN,
  DEFAULT_TOUCH,
  ROBIN_MAX,
  ROBIN_MIN,
  TOUCH_MAX,
  TOUCH_MIN,
} from './variation';
import { DEFAULT_DRIFT, DRIFT_MAX, DRIFT_MIN, clampDrift } from './drift';
import { DEFAULT_SPEED, SPEED_MAX, SPEED_MIN, clampSpeed } from './speed';
import {
  articulationText,
  clampBend,
  clampGrace,
  clampStutter,
  FALL_CHAR,
  GRACE_CHAR,
  isArticulation,
  MAX_BEND,
  MIN_BEND,
  NO_ARTICULATION,
  parseArticulation,
  SCOOP_CHAR,
  SLIDE_CHAR,
  STUTTER_CHAR,
  tidyArticulation,
} from './articulation';
import {
  busByName,
  busNameProblem,
  busNames,
  busScript,
  MAX_BUSES,
  tidyBus,
  tidyBusName,
  tidyBuses,
  type Bus,
} from './bus';
import { clampMidi, MIDI_MAX, MIDI_MIN, midiToNoteName } from './notes';
import { applyScript, type ScriptSettings } from './script';
import {
  clampParam,
  copyVoice,
  DEFAULT_VOICE,
  MAX_PARAM,
  MIN_PARAM,
  VOICE_PARAMS,
  voiceNameFor,
  waveFromName,
  type VoiceParams,
} from './voice';
import {
  copyKey,
  DEFAULT_KEY,
  parseKey,
  SCALE_SPELLINGS,
  tonicName,
  type SongKey,
} from './scale';
import { DEFAULT_TUNING, tuningFromName, tuningNames, type TuningId } from './tuning';
import {
  clampLayer,
  clampLayerField,
  layerFromVoice,
  LAYER_FIELDS,
  MAX_EXTRA_LAYERS,
  neutralLayer,
  type Layer,
} from './instrument';
import {
  clampBpm,
  clampEffects,
  clampGlide,
  clampStrum,
  clampHold,
  clampLevel,
  clampPan,
  clampPatternNumber,
  clampRoom,
  clampSend,
  clampTempoSlot,
  clampVibrato,
  clampRows,
  clampRowsPerBeat,
  clampSwing,
  countSongNotes,
  createSong,
  DEFAULT_ECHO,
  DEFAULT_EFFECT,
  DEFAULT_GLIDE,
  DEFAULT_STRUM,
  DEFAULT_HOLD,
  DEFAULT_LEVEL,
  DEFAULT_PAN,
  DEFAULT_REVERB,
  DEFAULT_SWING,
  DEFAULT_VELOCITY,
  DEFAULT_GROOVE,
  DEFAULT_TRACK_ECHO,
  DEFAULT_VIBRATO,
  DEFAULT_VERB,
  ensurePattern,
  grooveFromName,
  grooveNames,
  isSongTitleLength,
  isTrackNameLength,
  MAX_ORDER,
  MAX_TEMPO_POINTS,
  MAX_PAN,
  MAX_PATTERNS,
  MAX_EFFECT,
  MAX_GLIDE,
  MAX_LEVEL,
  MAX_ROOM,
  MAX_SONG_TITLE,
  MAX_SWING,
  MAX_VELOCITY,
  MAX_SEND,
  MAX_STRUM,
  MAX_VIBRATO,
  DEFAULT_DUCK,
  MAX_DUCK,
  MAX_HUMANIZE,
  MAX_POLY,
  MIN_DUCK,
  MIN_HUMANIZE,
  MIN_POLY,
  DEFAULT_HUMANIZE,
  DEFAULT_POLY,
  clampDuck,
  clampHumanize,
  clampPoly,
  MIN_EFFECT,
  NO_EFFECTS,
  MIN_GLIDE,
  MIN_PAN,
  MIN_ROOM,
  MIN_SWING,
  MIN_SEND,
  MIN_STRUM,
  MIN_VIBRATO,
  CELL_NOTE_SEPARATOR,
  MAX_CELL_NOTES,
  MAX_TRACK_NAME,
  MAX_TRACKS,
  cellNotes,
  clampVelocity,
  MIN_LEVEL,
  MIN_TRACKS,
  MIN_VELOCITY,
  patternRows,
  setCellDrum,
  setCellNotes,
  setPatternRows,
  setTrackCount,
  sortTempoMap,
  tidyTrackName,
  TRACK_EFFECTS,
  type ChannelEffects,
  type GrooveId,
  type Song,
  type TempoPoint,
} from './song';
import { DEFAULT_SHAPE, isFilterShape, shapeFromName, shapeNames, type FilterShape } from './shape';
import { drumFromName, drumNames, drumPitch, type DrumId } from './drum';
import { DEFAULT_KIT, kitFromName, kitNameProblem, kitNames, KIT_IDS, sameKitName, tidyKitName, type KitName } from './kit';
import { sampleNameProblem, tidySampleName } from './sample';
import {
  clampHitVelocity,
  clampMachineBeat,
  clampMachineSteps,
  clampTune,
  DEFAULT_MACHINE_BEAT,
  DEFAULT_MACHINE_STEPS,
  defaultPad,
  emptyRow,
  MAX_MACHINE_BARS,
  MAX_MACHINE_BEAT,
  MAX_MACHINE_STEPS,
  MAX_PADS,
  MIN_MACHINE_BEAT,
  MIN_MACHINE_STEPS,
  padPatternString,
  padPatternVelocity,
  resizeRow,
  tidyPadName,
  type DrumMachine,
  type DrumPad,
} from './machine';

// --- the format surface -----------------------------------------------------

/** The `format` tag that marks a JSON file as a Tracklet song. */
export const SONG_FILE_FORMAT = 'tracklet-song';
/**
 * The version this build writes, and the newest it can read.
 *
 * 3 added the room (`reverb`, `echo`) and a channel's place in it (`pan`).
 * 4 added a note's VELOCITY: a step is still a bare MIDI number when it plays at
 * full force, and becomes a `[note, velocity]` pair only when it does not, so a
 * song that never accents anything writes exactly the file version 3 wrote.
 * 5 added a channel's per-channel EXPRESSION (`glide`, `vibrato`), both omitted
 * when they are off, which is how they were set in every earlier file.
 * 6 added the SEND amounts (`verb`, `echo`): how much of a channel is fed to the
 * master reverb and echo. Both are omitted at their default of 100, so a file
 * with no sends in it is byte-for-byte the version-5 file.
 * 7 added the song's GROOVE — the named feel it is played with — omitted when it
 * is `straight`, so a file that never chose a feel is the version-6 file.
 * 8 added the TEMPO MAP — where and how the tempo CHANGES — omitted when the
 * song holds one tempo, which is what every file written before it did: absent
 * and empty mean the same thing, and both mean `bpm` from the first bar to the
 * last.
 * 9 added the PULSE DUTY (`duty`, the sixth voice knob) — omitted at its default
 * of 100, which is the full square wave every earlier file's square channels were
 * already playing, so a file that never narrowed a pulse writes the version-8
 * file.
 * 10 added the FILTER SWEEP (`sweep`, the seventh voice knob) — omitted at its
 * default of 0, which is the steady filter every earlier file was already
 * playing, so a file that never swept one writes the version-9 file.
 * 11 added the AMP ENVELOPE's DECAY and RELEASE (`decay` and `release`, the
 * eighth and ninth voice knobs) — both omitted at their default of 0, which is
 * the envelope every earlier file was already playing, so a file that never
 * touched them writes the version-10 file.
 * 12 added the TUNING (`tuning`) — omitted when it is equal temperament, which is
 * the spacing every earlier file played, so a file written in the piano's own
 * temperament writes the version-11 file.
 * 13 added a channel's STACK: the layers above its voice, written only by a song
 * that HAS one. This is the first version that is not simply "more optional
 * fields", and the difference is deliberate: an older build reading a `stack` it
 * has never heard of would ignore it and play the channel's voice alone — half
 * the sound, with no complaint at all. So a stacked song declares version 13,
 * which every build that predates stacks refuses in words ("written by a newer
 * Tracklet") rather than opening it wrong. A song that stacks nothing still
 * writes version 12, and still opens everywhere.
 * 14 added a channel's EFFECTS (`drive`, `chorus`, `crush`, `punch`, `tilt`,
 * `gate`), each written only when it is ON, and for exactly the reason 13 was a
 * version: an older build would ignore the six fields and play the channel dry
 * and flat, which is half of what the song is. A song with every effect off
 * writes the version-12 file it always did.
 * 15 added the MIX's effects (`master`): the same effects, on the whole band at once,
 * written as one object and only when at least one is on. A version and not just
 * six more optional fields, for the reason 14 was: a build that predates them
 * would play the song with a clean master — a record that sounds like a demo, and
 * nothing in the file to say so. A song with a clean master still writes the
 * version-12 file it always did.
 * 16 added the DUCK (`duck`): how far a channel pushes the rest of the mix down
 * while it plays, written only when it does. A version rather than six more
 * optional fields, for the reason 13, 14 and 15 were: an older build would play
 * the song with a still mix — the pump is the arrangement, and a record without
 * it is a different record. A song nobody ducks in still writes version 12.
 * 17 added AUTOMATION (`automation`): the lanes that move a value over bars,
 * written only when a song has one. Same reason once more — a build that predates
 * lanes would play the song at every setting it was written at, which is a flat
 * record where a rise was asked for, and nothing in the file to say so. A song
 * that moves nothing still writes version 12.
 * 18 added SECTIONS (`sections` and `arrangement`): the NAMES a song's bars were
 * written from, and the arrangement those names were laid out in. A version rather
 * than two more optional fields, and this time for a reason no earlier version had:
 * an older build would play the `order` and be RIGHT about the music — but it would
 * also open the file, edit it, and save the names away, losing the form with
 * nothing in the file to say it had ever been there. A song whose bars have no
 * names still writes version 12, byte for byte.
 *
 * Everything each version added is optional on the way in, so a version-1, -2, -3
 * or -4 file still opens — dry, dead centre, at full velocity, with no slide or
 * wobble, with every channel fully in the room, at one tempo throughout and with
 * a full square pulse — which is exactly how it used to play.
 */
export const SONG_FILE_VERSION = 12;
/**
 * The version a song with a LAYER STACK is written as, and the newest this build
 * can read. See `SONG_FILE_VERSION` for why a stack is a version and not just
 * another optional field.
 */
export const STACK_SONG_FILE_VERSION = 13;
/**
 * The version a song with a channel EFFECT on is written as, and the newest this
 * build can read. See `SONG_FILE_VERSION` for why an effect is a version rather
 * than one more optional field — the reason is the same one a stack has.
 */
export const EFFECTS_SONG_FILE_VERSION = 14;
/**
 * The version a song with a SHAPED MIX is written as, and the newest this build
 * can read. See `SONG_FILE_VERSION` for why a mix effect is a version rather than
 * another optional field.
 */
export const MASTER_SONG_FILE_VERSION = 15;
/**
 * The version a song that DUCKS is written as, and the newest this build can
 * read. See `SONG_FILE_VERSION` for why a duck is a version and not another
 * optional field.
 */
export const DUCK_SONG_FILE_VERSION = 16;
/**
 * The version a song with an AUTOMATION LANE is written as, and the newest this
 * build can read. See `SONG_FILE_VERSION` for why a lane is a version and not
 * another optional field.
 */
export const AUTOMATION_SONG_FILE_VERSION = 17;
/**
 * The version a song whose form is NAMED is written as, and the newest this
 * build can read. See `SONG_FILE_VERSION` for why a section is a version and not
 * another optional field.
 */
export const SECTIONS_SONG_FILE_VERSION = 18;
/**
 * The version a song with a per-channel FEEL is written as, and the newest this
 * build can read. See `SONG_FILE_VERSION` for why a feel is a version and not
 * another optional field.
 */
export const FEEL_SONG_FILE_VERSION = 19;
/**
 * The version a song with a POLYPHONIC channel is written as, and the newest this
 * build can read. See `SONG_FILE_VERSION` for why polyphony is a version and not
 * another optional field.
 */
export const POLY_SONG_FILE_VERSION = 20;
/**
 * The version a song with a FILTER SHAPE on a channel is written as, and the
 * newest this build can read. See `SONG_FILE_VERSION` for why a shape is a version
 * and not another optional field: a build that predates it would play that channel
 * as a plain low-pass and be wrong about the sound while looking perfectly fine.
 */
export const SHAPE_SONG_FILE_VERSION = 21;
/**
 * The version a song whose channels are GROUPED is written as, and the newest this
 * build can read. See `SONG_FILE_VERSION` for why a bus is a version and not
 * another optional field: a build that predates buses would open the file, mix
 * every channel at its own fader, and SAVE IT BACK with the groups gone — the mix
 * silently changing shape, with nothing in the file to say it had ever been
 * grouped.
 */
export const BUS_SONG_FILE_VERSION = 22;
/**
 * The version a song with an ARTICULATED note is written as, and the newest this
 * build can read. A version rather than one more cell shape, and this one for a
 * reason none of the others had: an older build reading `[60, 100, ">*3"]` would
 * REFUSE the whole file, because a three-element cell is not a shape it knows.
 * Refusing is the right answer — the alternative would be playing a stutter as a
 * plain note — but "a step must be null, a note, or [note, velocity]" is a
 * sentence about the wrong thing, where "written by a newer Tracklet" says what
 * happened. A song whose notes are all plain still writes version 12.
 */
export const ARTICULATION_SONG_FILE_VERSION = 23;
/**
 * The version a song with a CHORD IN ONE CELL is written as, and the newest this
 * build can read. A version rather than one more optional field, for the reason
 * articulation gave one scope along: a cell's first slot is normally a note
 * NUMBER, and a chord makes it an ARRAY of numbers, so an older build reading
 * `[[60, 64, 67], 100]` would find a list where it expected a pitch and refuse the
 * whole file. Refusing is right — the alternative would be playing a triad as one
 * note and sounding perfectly fine — and the version is what makes the refusal
 * say "written by a newer Tracklet" rather than describe the wrong thing. A song
 * whose cells each hold one note still writes version 12.
 */
export const CHORD_SONG_FILE_VERSION = 24;
/**
 * The version a song with a DRUM HIT is written as, and the newest this build can
 * read. A version rather than one more optional field, for the reason the chord
 * gave one scope along: a cell's first slot holds the NAME of the drum ("kick")
 * where every earlier build found a number, so an older build would refuse the
 * file with the wrong story — or, worse, read the word as a pitch. A song whose
 * cells are notes and chords still writes version 12 or 24.
 */
export const DRUM_SONG_FILE_VERSION = 25;
/**
 * The version a song whose drums play a NAMED KIT is written as, and the newest
 * this build can read. A version rather than one more optional field, for the
 * reason a groove got one: an older build would play the same hits through the
 * PRESETS, which is right about the notes and wrong about the record — and would
 * then save the kit away, so a song would come back sounding like a different one.
 * A song that names no kit (or names `studio`, the presets) still writes 12.
 */
export const KIT_SONG_FILE_VERSION = 26;
/**
 * The version a song naming a RECORDING OF YOURS is written as, and the newest
 * this build can read. A version rather than one more optional field, for the
 * drum's reason: an older build reading `"sample": "BRK02"` would either refuse
 * the file or, worse, drop the key and save the channel as the built-in one-shot
 * — so the reference to a sound somebody chose would quietly stop being there.
 * The reference is small and the AUDIO is never in the file: what a song records
 * is the name, so this version says "this song names a sample", not "this song
 * carries one". A song whose channels are all built-in still writes 12.
 */
export const SAMPLE_SONG_FILE_VERSION = 27;
/**
 * 28 added the PROGRESSION: the chord loop the song hangs on.
 *
 * Written as the chord NAMES a person wrote (`["Am", "F", "C", "G"]`) rather
 * than as resolved notes, because a loop is a decision about harmony and not a
 * claim about a register — which chord the bass plays is the follower's line, and
 * a file that stored A2 C3 E3 would have made that decision for it. A version
 * rather than one more optional field, for the drum's and the sample's reason: an
 * older build would drop the key, keep the cells the followers wrote, and save a
 * song with no loop in it — so a song somebody could keep working on would come
 * back as one they could not. A song with no progression still writes 12.
 */
export const PROGRESSION_SONG_FILE_VERSION = 28;
/**
 * 29 added the KIT OF YOUR OWN: a song may name a kit that is not one of the
 * four this app ships, and the four voices live in a library the app keeps.
 *
 * A version rather than one more optional field, for the SAMPLE's reason exactly:
 * the name is the song's and the four voices are the app's, so an older build
 * reading `"kit": "MYHOUSE"` would refuse it as an unknown kit — or, before the
 * version check, play the four presets and save the song onto them, so a kit
 * somebody dialed in would come back as `studio` with nothing saying why. A song
 * whose drums are one of the four built-ins still writes 26 or less.
 */
export const KIT_NAME_SONG_FILE_VERSION = 29;
/**
 * 30 added the CABINET: a seventh effect, on a channel and on the mix at once.
 *
 * A version for the reason every effect got one (`14` for a channel's, `15` for
 * the mix's): `readEffects` reads the effects it KNOWS, by name, so a build that
 * stops at 29 drops a `"cab": 40` key without a word and saves the channel with
 * the box missing. The part would come back merely dull, and nothing in the file
 * would say what had been lost.
 *
 * It is the newest version rather than an edit to 14 and 15 because the NUMBERS
 * are a history: a build at 29 already treats any effect it knows as "14" and any
 * mix effect as "15", and those files are still exactly what they say. A song
 * with no cabinet still writes whichever of the older versions its other features
 * earned.
 */
export const CAB_SONG_FILE_VERSION = 30;
/**
 * 31 added the TAPE MACHINE: a soft saturation, a transport that wanders and a
 * hiss bed, as one percentage on a channel or on the mix.
 *
 * A version for `cab`'s reason exactly — `readEffects` reads the effects it knows
 * BY NAME, so a build that stops at 30 drops a `"tape"` key in silence and saves
 * the part clean. This is the second version in a row earned by the same rule,
 * which is the rule working rather than a sign that something is wrong with it:
 * the alternative is a file that plays differently the second time it is opened.
 * A song with no tape still writes whichever older version its features earned.
 */
export const TAPE_SONG_FILE_VERSION = 31;
/**
 * 32 added the TELEPHONE: a narrow band with a coarse signal inside it, as one
 * percentage on a channel or on the mix.
 *
 * The third version in a row earned by the same rule, and the rule is worth
 * stating plainly now that it has fired three times: **a new effect is a new file
 * version**, because `readEffects` reads the effects it knows by name and a build
 * that stops at 31 would drop a `"radio"` key without a word. The alternative —
 * refusing any unrecognised key under `effects` — would turn every future effect
 * into a file that older builds cannot open at all, which is a worse bargain than
 * a version number nobody has to read.
 */
export const RADIO_SONG_FILE_VERSION = 32;
/**
 * 33 added the RECORD: a surface bed with crackle on top, as one percentage on a
 * channel or on the mix.
 *
 * The fourth version in a row earned by the same rule, and by now the rule needs
 * no restating except to say it has held four times: **a new effect is a new file
 * version**, because `readEffects` reads the effects it knows by name and a build
 * that stops at 32 would drop a `"vinyl"` key without a word. A song with no
 * record on it still writes whichever older version its features earned.
 */
export const VINYL_SONG_FILE_VERSION = 33;

/**
 * A song where a CHANNEL VARIES its hits — round-robin and velocity layers, the
 * two settings `model/variation.ts` holds the arithmetic for. The newest version
 * this build can read.
 *
 * A version rather than a tolerant key, for the reason the effects got one: an
 * older build would read the notes correctly and play every hit the same way,
 * which is exactly the difference the setting exists to make — a part that comes
 * back sounding typed when it was played.
 */
export const VARIATION_SONG_FILE_VERSION = 34;

/**
 * A song where a CHANNEL's pitch WANDERS — the `drift` knob, and any lane that
 * moves it. The newest version this build can read.
 *
 * A version rather than a tolerant key, for the reason the effects got one: an
 * older build would read the notes correctly and play them dead steady, which is
 * exactly the wobble the setting was written to add — a part that comes back
 * sounding clean when it was meant to be worn.
 */
export const DRIFT_SONG_FILE_VERSION = 35;

/**
 * A song played back at a master `speed` other than normal. The newest version
 * this build can read.
 *
 * A version rather than a tolerant key, for the reason every setting that changes
 * the sound got one: an older build would read the notes, the tempo and the
 * arrangement correctly and play them at the WRITTEN speed — a different piece of
 * music, with nothing in it to say the transport was meant to run slow.
 */
export const SPEED_SONG_FILE_VERSION = 36;

/**
 * 37 added the DRUM MACHINE: a song-level instrument with pads, a step grid and
 * its own mix, played BESIDE the channels rather than inside one of them.
 *
 * A version rather than one more optional field, for the reason the KIT got one:
 * an older build would drop the `machine` key without a word and save the song
 * without it, so a beat somebody dialed in would come back silent with nothing in
 * the file to say it had ever been there. It is the newest version because it is
 * the newest feature; a song with no machine still writes whichever older version
 * its other features earned.
 */
export const MACHINE_SONG_FILE_VERSION = 37;
/**
 * A song whose machine has MORE THAN ONE BAR writes version 38, the newest.
 *
 * The same reason the machine itself got a version: an older build would read the
 * pads, ignore `bars` and `order`, and save the song back with one bar — so a beat
 * that changed across the form would come back looping one bar, and the file would
 * say nothing about what was lost. A machine with one bar still writes 37.
 */
export const MACHINE_BARS_SONG_FILE_VERSION = 38;
/**
 * A song whose machine has a PAD naming a recording writes version 39, the newest.
 *
 * The sample's reason one scope down: an older build would read the pad, drop
 * `sample` without a word, and save the pad back as the generator it would have
 * been — so a pad somebody pointed at their own break would come back playing the
 * built-in one-shot, and the file would not say what had been lost. A machine
 * whose pads name no recording still writes whichever older version its other
 * features earned.
 */
export const MACHINE_PAD_SAMPLE_SONG_FILE_VERSION = 39;
/**
 * A song one of whose SECTIONS names a drum machine bar writes version 40, the newest.
 *
 * The sections' reason, one field out: an older build would read the section,
 * ignore its `machine`, and save the song back with the beat following the plain
 * `order` — so a chorus that switched beats would come back sounding like the
 * verse, and the file would say nothing about it. A song whose sections name no
 * machine bar still writes whichever older version its other features earned.
 */
export const MACHINE_SECTION_BAR_SONG_FILE_VERSION = 40;
/**
 * A song with SCENES writes version 41, the newest.
 *
 * The live page's rows are song data, and the reason they are a version rather
 * than one more optional field is the sharpest the feature has had: an older
 * build would DROP the `scenes` key without a word, so a set somebody could
 * perform would come back as a linear song with nothing in the file to say the
 * rows had ever been there. A song with no scenes still writes whichever older
 * version its other features earned.
 */
export const SCENES_SONG_FILE_VERSION = 41;
/**
 * A song with ARP SETTINGS writes version 42, the newest.
 *
 * The page's dials are song data, and the reason they are a version rather than
 * one more optional field is the same one scenes gave: an older build would DROP
 * the `arp` key without a word, so a run somebody dialed and meant to tune later
 * would come back shaped by nothing, with the file saying nothing about it. A song
 * with no dials still writes whichever older version its other features earned.
 */
export const ARP_SONG_FILE_VERSION = 42;
/** The newest file version this build understands: what OPEN reads up to. */
export const SONG_FILE_VERSION_MAX = ARP_SONG_FILE_VERSION;
/** The extension a saved script gets. */
export const SCRIPT_FILE_EXTENSION = '.txt';
/** The extension a saved song gets. */
export const SONG_FILE_EXTENSION = '.json';

/** Which of the two formats a file turned out to be. */
export type SongFileKind = 'script' | 'json';

export type SongFileParse =
  | { ok: true; kind: SongFileKind; song: Song; settings: ScriptSettings }
  | { ok: false; errors: string[] };

/** How many problems a rejected file reports before it stops listing them. */
const MAX_ERRORS = 12;

// --- writing: the song as a script ------------------------------------------

/**
 * The song as a Tracklet Script that reproduces it EXACTLY.
 *
 * Exactness is the whole contract, and two details carry it:
 *
 *   • Every step is written, empty cells included, up to the last step that
 *     holds a note. Trailing silence is left off because `steps` already
 *     declares the pattern's length, so a sparse song stays a short file and a
 *     dense one stays literal.
 *
 *   • The channel's name is QUOTED, always. A quoted name is one token, so a
 *     name that happens to contain a word the language also uses as a modifier
 *     — "DEEP WAVE", "SHUT OFF" — still reads back as the name and not as a
 *     flag. (A name that is EXACTLY `wave` is the one case the notation cannot
 *     spell; the parser prefers the name, so even that survives.)
 */
export function songToScript(song: Song, settings: ScriptSettings = { volume: null }): string {
  const rows = patternRows(song);
  const lines: string[] = [];

  lines.push('# ===========================================================================');
  lines.push(`#  ${song.title}   --   saved from Tracklet`);
  lines.push('# ===========================================================================');
  lines.push('#');
  lines.push(`#  ${song.patterns.length} PATTERN${song.patterns.length === 1 ? '' : 'S'}  ·  ${song.tracks.length} TRACKS  ·  ${rows} STEPS  ·  ${countSongNotes(song)} NOTES  ·  ${song.bpm} BPM`);
  lines.push('#');
  lines.push('#  This is a Tracklet Script: paste it into the SCRIPT panel and press APPLY,');
  lines.push('#  or press F2 for OPEN and pick this file. Rows count from 0, tracks from 1,');
  lines.push('#  and "." leaves a step empty.');
  lines.push('# ===========================================================================');
  lines.push('');
  lines.push('new');
  lines.push(`song "${scriptTitle(song.title)}"`);
  lines.push(`key ${keyScript(song.key)}`);
  lines.push(`tempo ${song.bpm}`);
  // One line per tempo change, in bar order, written exactly as the parser reads
  // it: the map is a handful of numbers and the script is where they belong.
  for (const point of sortTempoMap(song.tempoMap)) {
    lines.push(`tempo ${clampBpm(point.bpm)} ${point.slide ? 'by' : 'at'} ${point.slot}`);
  }
  lines.push(`beat ${song.rowsPerBeat}`);
  lines.push(`steps ${rows}`);
  // Straight is what a song is made of, so a straight song says nothing about
  // its feel and every file written before swing existed stays identical.
  if (song.swing !== DEFAULT_SWING) lines.push(`swing ${song.swing}`);
  // And a song read at normal speed says nothing, which is every file written
  // before the transport could be moved: 100% is what they all meant.
  if (song.speed !== DEFAULT_SPEED) lines.push(`speed ${song.speed}`);
  // And a straight song says nothing about its GROOVE, which is the same bargain
  // once more: the feel a file does not mention is the one it always had.
  if (song.groove !== DEFAULT_GROOVE) lines.push(`groove ${song.groove}`);
  // The KIT travels the way every other song-wide choice does: written only when
  // it is not the default, so a song that names no kit saves the script it always
  // did — and `kit studio` is the same value as saying nothing.
  if (song.kit !== DEFAULT_KIT) lines.push(`kit ${song.kit}`);
  // And a song in equal temperament says nothing about its tuning, which is the
  // same bargain `swing` and `groove` make: a tuning is a choice, and its absence
  // is the language's silence about it.
  if (song.tuning !== DEFAULT_TUNING) lines.push(`tuning ${song.tuning}`);
  // A dry room says nothing either, for the same reason and with the same
  // result: a song that never asked for reverb writes a file identical to the
  // one this app wrote before reverb existed.
  if (song.reverb !== DEFAULT_REVERB) lines.push(`reverb ${song.reverb}`);
  if (song.echo !== DEFAULT_ECHO) lines.push(`echo ${song.echo}`);
  // And a clean master says nothing: one line, the effects that are on, in the
  // model's own order — so the script, the file and the screen agree about which
  // effect comes first, and a song that never shaped its mix says nothing at all.
  const masterWords = TRACK_EFFECTS
    .filter((effect) => song.master[effect.id] !== DEFAULT_EFFECT)
    .map((effect) => `${effect.id} ${song.master[effect.id]}`)
    .join(' ');
  if (masterWords !== '') lines.push(`master ${masterWords}`);
  // The DRUM MACHINE: one `machine` line for its mix and clock, then one `pad`
  // line per pad carrying its row as the pattern string a script writes. A song
  // with no machine writes neither line, which is what keeps every script saved
  // before the machine existed byte for byte the script it was.
  if (song.machine !== null) {
    for (const line of machineScript(song.machine)) lines.push(line);
  }
  // The ARP page's dials, written only when the song stores any: three lines that
  // set the five settings back. A song that never dialed an arp writes no line,
  // which keeps every script saved before the page byte for byte the script it was
  // — the same bargain `groove` and `swing` make. The NOTES a write produced are
  // ordinary grid rows below, not arp lines, because an arp is notes in an order
  // once written.
  if (song.arp !== null) {
    for (const line of arpScript(song.arp)) lines.push(line);
  }
  // The song's FORM: one line per named section, then the arrangement rather than
  // the plain order when the song was arranged from those names — the two say the
  // same thing, and the one a person can read is the one to write. A song with no
  // sections writes neither line, and no song says `order 1` about a single bar:
  // that would be noise in the one format meant to be read by hand.
  // The LOOP, above the form: a progression is a definition the pattern rows below
  // were written FROM, so it reads where it was written — and a song with no loop
  // writes no line, which is the language's own silence about it.
  if (song.progression !== null) lines.push(progressionScript(song.progression));
  for (const section of song.sections) lines.push(sectionScript(section));
  if (song.arrangement.length > 0) lines.push(arrangementScript(song.arrangement));
  else if (song.order.length > 1) lines.push(`order ${song.order.join(' ')}`);
  // The LIVE set, written after the form it performs: a song with no scenes writes
  // no line, which keeps every script saved before Live byte for byte the script
  // it was. A scene is song data, so it round-trips here where it belongs — the
  // quantize is a session setting and is deliberately NOT written, exactly as
  // `theme` and `page` are not.
  for (const scene of song.scenes) lines.push(sceneScript(scene));
  if (settings.volume !== null) lines.push(`volume ${Math.round(settings.volume * 100)}`);
  lines.push('');
  lines.push(`tracks ${song.tracks.length}`);
  // And the GROUPS, above the channels that join them, because that is the order
  // a script reads in: a bus is defined before anything is put on it. One line
  // each and only when the song has them, so a song with no groups writes the
  // header it always wrote.
  for (const bus of song.buses) lines.push(busScript(bus));
  song.tracks.forEach((track, i) => {
    // A channel that rings for one step is the default and says nothing, so only
    // a channel that HOLDS carries the extra setting. That keeps a plain song's
    // header readable and still round-trips exactly.
    const hold = track.hold === DEFAULT_HOLD ? '' : ` hold ${track.hold}`;
    // Same rule for the level: a full-volume channel is what a song is made of,
    // so only the channels that were turned down say so. A balanced song
    // therefore reads as a header with three short numbers in it rather than a
    // wall of `level 100`.
    const level = track.level === DEFAULT_LEVEL ? '' : ` level ${track.level}`;
    // And a centred channel says nothing, which is what keeps an old file's
    // every line byte-for-byte the line it always was.
    const pan = track.pan === DEFAULT_PAN ? '' : ` pan ${track.pan}`;
    // And a channel that neither slides nor wobbles says nothing either, for the
    // same reason: expression is a choice, and its absence is the language's
    // silence about it.
    const glide = track.glide === DEFAULT_GLIDE ? '' : ` glide ${track.glide}`;
    const vibrato = track.vibrato === DEFAULT_VIBRATO ? '' : ` vibrato ${track.vibrato}`;
    const strum = track.strum === DEFAULT_STRUM ? '' : ` strum ${track.strum}`;
    // The two settings a part is PLAYED with rather than written with, beside
    // `strum` and for the same reason: they say how the channel's instrument
    // behaves, so they belong on the line that names the instrument.
    const robin = track.robin === DEFAULT_ROBIN ? '' : ` robin ${track.robin}`;
    const touch = track.touch === DEFAULT_TOUCH ? '' : ` touch ${track.touch}`;
    // And the wobble a worn machine has, which a channel that is not on tape says
    // nothing about: at 0 it holds every pitch it is given.
    const drift = track.drift === DEFAULT_DRIFT ? '' : ` drift ${track.drift}`;
    // And a channel that sends all of itself, which is most of them, says
    // nothing: the room is the song's, and standing in it is where a channel
    // already was before sends existed.
    const verb = track.verb === DEFAULT_VERB ? '' : ` verb ${track.verb}`;
    const echo = track.echo === DEFAULT_TRACK_ECHO ? '' : ` echo ${track.echo}`;
    // And a channel that ducks nothing says nothing, which is every channel in
    // every song written before the pump existed.
    const duck = track.duck === DEFAULT_DUCK ? '' : ` duck ${track.duck}`;
    // And a channel with no feel of its own says nothing, which is every channel
    // in every song written before a part could have one.
    const groove = track.groove === null ? '' : ` groove ${track.groove}`;
    const humanize = track.humanize === DEFAULT_HUMANIZE ? '' : ` humanize ${track.humanize}`;
    // Nor does a channel that holds one note at a time, which is every one of them
    // in every song written before polyphony.
    const poly = track.poly === DEFAULT_POLY ? '' : ` poly ${track.poly}`;
    // Nor does a channel that is still the low-pass, which is every channel in
    // every song written before a filter had a shape.
    const shape = track.shape === DEFAULT_SHAPE ? '' : ` shape ${track.shape}`;
    // Which GROUP the channel is mixed with. A channel on its own fader says
    // nothing, which is every channel in every song written before buses existed.
    const bus = track.bus === null ? '' : ` bus ${track.bus}`;
    // And which of YOUR recordings it plays, written as the name and nothing
    // else: the file holds a reference to a sound the APP has, never the sound
    // itself, which is what keeps a song a few kilobytes of readable text.
    const sample = track.sample === null ? '' : ` sample ${track.sample}`;
    // And the effects, only the ones that are ON — an effect at 0 is what
    // every channel in every song written before effects existed is, and writing
    // `drive 0` would be six words of promise about nothing.
    const effects = effectsScript(track);
    lines.push(`track ${i + 1} "${scriptTitle(track.name)}"${voiceScript(track.voice)}${hold}${level}${pan}${glide}${vibrato}${strum}${robin}${touch}${drift}${verb}${echo}${duck}${groove}${humanize}${poly}${shape}${bus}${sample}${effects}`);
  });
  // A stack is written under its channel, one `layer` line per layer, and each
  // line carries only what DIFFERS from the layer below it — which is exactly
  // what the parser starts from (a copy of the layer below), so a stack survives
  // SAVE and APPLY with the same numbers. It also keeps the readable thing
  // readable: a supersaw reads as three short lines a few cents apart rather than
  // three walls of knobs.
  song.tracks.forEach((track, i) => {
    track.stack.forEach((layer, j) => {
      const below = j === 0 ? layerFromVoice(track.voice) : track.stack[j - 1];
      lines.push(`layer ${i + 1} ${j + 2}${layerScript(layer, below)}`);
    });
  });
  // Mute is its own statement rather than the `off` suffix, so a channel named
  // "OFF" (or "ON") reads back as a name. Only muted channels need a line.
  song.tracks.forEach((track, i) => {
    if (track.muted) lines.push(`mute ${i + 1}`);
  });
  // And the lanes, one line each, in bar order — written with the arrangement
  // rather than beside the channels, because a lane is about BARS. A song that
  // moves nothing says nothing, which is the same bargain every other optional
  // line in this writer makes.
  const lanes = lanesToScript(song.automation);
  if (lanes !== '') {
    for (const line of lanes.split('\n')) lines.push(line);
  }

  song.patterns.forEach((pattern, i) => {
    lines.push('');
    lines.push(`pattern ${i + 1} "${scriptTitle(pattern.name)}"`);
    const body = gridLines(pattern.steps.map((row) => row.map(cellText)), song.tracks.length);
    for (const line of body) lines.push(line);
  });

  return `${lines.join('\n')}\n`;
}

/**
 * A channel's effects as the script spells them, and nothing at all when every
 * one of them is off.
 *
 * Every effect is written by the name the language uses, so a saved script and a
 * hand-written one are the same language — and a channel that was never shaped
 * adds no words to its `track` line, which is what keeps an old song's header
 * byte-for-byte the header it always was.
 */
/**
 * A drum machine as the script writes it: one `machine` line and one `pad` line
 * per pad.
 *
 * Written with only what DIFFERS from a fresh machine, the same bargain every
 * other optional line in this writer makes — so a plain machine is one short
 * line and a pad that only plays a beat is `pad 1 "KICK" voice kick pattern
 * "9..."`. The pattern string is the SCRIPT's notation rather than the file's, so
 * a velocity here rounds to ninths, exactly as it does when a person types one.
 */
function machineScript(machine: DrumMachine): string[] {
  const parts: string[] = ['machine'];
  if (machine.steps !== DEFAULT_MACHINE_STEPS) parts.push(`steps ${machine.steps}`);
  if (machine.beat !== DEFAULT_MACHINE_BEAT) parts.push(`beat ${machine.beat}`);
  if (machine.swing !== 0) parts.push(`swing ${machine.swing}`);
  if (machine.level !== DEFAULT_LEVEL) parts.push(`level ${machine.level}`);
  if (machine.pan !== DEFAULT_PAN) parts.push(`pan ${machine.pan}`);
  if (machine.bus !== null) parts.push(`bus ${machine.bus}`);
  if (machine.verb !== DEFAULT_VERB) parts.push(`verb ${machine.verb}`);
  if (machine.echo !== DEFAULT_TRACK_ECHO) parts.push(`echo ${machine.echo}`);
  if (machine.duck !== DEFAULT_DUCK) parts.push(`duck ${machine.duck}`);
  for (const effect of TRACK_EFFECTS) {
    if (machine.effects[effect.id] !== DEFAULT_EFFECT) parts.push(`${effect.id} ${machine.effects[effect.id]}`);
  }
  if (!machine.enabled) parts.push('off');
  const lines = [parts.join(' ')];
  // The order, on its own line, only when the machine varies — so a one-bar
  // machine prints the exact script this app has always printed for one.
  if (machine.order.length > 0) lines.push(`machine order ${machine.order.join(' ')}`);
  machine.pads.forEach((pad, i) => {
    const seeded = defaultPad(i + 1, machine.steps);
    const pieces: string[] = [`pad ${i + 1}`, `"${scriptTitle(pad.name)}"`, voiceScript(pad.voice).trim()];
    if (pad.level !== DEFAULT_LEVEL) pieces.push(`level ${pad.level}`);
    if (pad.pan !== DEFAULT_PAN) pieces.push(`pan ${pad.pan}`);
    const tune = pad.pitch - seeded.pitch;
    if (tune !== 0) pieces.push(`tune ${tune}`);
    // A pad on a recording names it the way a channel does, so a machine saved as
    // a script comes back on the same recordings — or on the same silence, when
    // the app does not have the name.
    if (pad.sample !== null) pieces.push(`sample ${pad.sample}`);
    pieces.push(`pattern "${padPatternString(pad.steps, machine.steps)}"`);
    lines.push(pieces.join(' '));
  });
  // The bars past the first: `machine pattern N` names the bar, then one line per
  // pad carrying ONLY that bar's row — the sound belongs to the pad, above.
  machine.bars.forEach((bar, index) => {
    lines.push(`machine pattern ${index + 2}`);
    machine.pads.forEach((_pad, i) => {
      lines.push(`pad ${i + 1} pattern "${padPatternString(bar[i] ?? [], machine.steps)}"`);
    });
  });
  return lines;
}

function effectsScript(track: ChannelEffects): string {
  return TRACK_EFFECTS
    .filter((effect) => track[effect.id] !== DEFAULT_EFFECT)
    .map((effect) => ` ${effect.id} ${track[effect.id]}`)
    .join('');
}

/**
 * One cell as the script spells it: the note, or the three-dot rest.
 *
 * A note played at full force is just the note, so a song that never touches
 * velocity writes exactly the script this app has always written. A softer or
 * harder one carries `~velocity`, the same spelling the grid parser reads, which
 * is what makes SAVE and APPLY exact inverses down to the accent.
 *
 * And what the note DOES goes before the `~`, in the order the cell grammar
 * writes it: the pitch, the articulation, then the force — `C-4>*3~40`. A cell
 * that says nothing about how the note is played writes exactly the cell this app
 * has always written.
 */
function cellText(cell: {
  note: number | null;
  extra?: number[];
  drum?: DrumId | null;
  velocity: number;
  slide?: boolean;
  stutter?: number;
  grace?: number;
  bend?: number;
}): string {
  if (cell.note === null) return '...';
  // A DRUM is written as the word the grid reads back — `kick`, or `hat*3` — so a
  // kit written out is a script that APPLIES to the same kit, and the pitches the
  // drums happen to be are not spelled into the file at all.
  if (cell.drum !== undefined && cell.drum !== null) {
    const articulation_ = articulationText(tidyArticulation({ slide: cell.slide, stutter: cell.stutter, grace: cell.grace, bend: cell.bend }));
    const force = clampVelocity(cell.velocity) === MAX_VELOCITY ? '' : `~${clampVelocity(cell.velocity)}`;
    return `${cell.drum}${articulation_}${force}`;
  }
  // A chord is spelled the way the grid parser reads one back: the notes, in the
  // cell's order, separated by commas. The width is measured across the grid (see
  // `gridLines`), so a longer cell only widens the columns it needs to.
  const note = [cell.note, ...(cell.extra ?? [])].map((midi) => midiToNoteName(midi)).join(CELL_NOTE_SEPARATOR);
  const articulation = articulationText(tidyArticulation({ slide: cell.slide, stutter: cell.stutter, grace: cell.grace, bend: cell.bend }));
  const velocity = clampVelocity(cell.velocity);
  const force = velocity === MAX_VELOCITY ? '' : `~${velocity}`;
  return `${note}${articulation}${force}`;
}

/**
 * One grid row per step up to the last step that holds a note. Cells are padded
 * to a uniform four columns so the numbers line up under each other the way the
 * hand-written examples do — a file a person has to read is worth the spaces.
 */
function gridLines(rows: string[][], trackCount: number): string[] {
  let last = -1;
  // Four columns is the width a bare three-character note needs — three for the
  // note and one to separate it from the next. A `~velocity` suffix makes a cell
  // longer, so the width is measured across the grid instead of assumed, and the
  // extra column is kept so two adjacent cells can never run together into one
  // token. A song with no velocities still measures exactly four, which is what
  // keeps its file byte-for-byte the file this app always wrote.
  let longest = 0;
  rows.forEach((row, i) => {
    row.forEach((text) => { if (text.length > longest) longest = text.length; });
    if (row.some((text) => text !== '...')) last = i;
  });
  const width = Math.max(4, longest + 1);
  const out: string[] = [];
  for (let r = 0; r <= last; r++) {
    const row = rows[r];
    const cells: string[] = [];
    for (let c = 0; c < trackCount; c++) cells.push((row[c] ?? '...').padEnd(width));
    out.push(cells.join('').trimEnd());
  }
  return out;
}

/**
 * A channel's SOUND, as the script spells it.
 *
 * A sound that IS one of the named voices is written as that name — `voice pad`
 * — because a file a person reads should say `pad`, not five numbers that add
 * up to one. Anything else is written out knob by knob, as a waveform plus only
 * the knobs that differ from the neutral default, so a hand-tweaked channel is
 * still a short, exact, editable line.
 */
function voiceScript(voice: VoiceParams): string {
  const preset = voiceNameFor(voice);
  if (preset !== 'custom') return ` voice ${preset}`;
  const knobs = VOICE_PARAMS
    .filter((param) => voice[param.id] !== DEFAULT_VOICE[param.id])
    .map((param) => ` ${param.id} ${voice[param.id]}`)
    .join('');
  return ` wave ${voice.wave}${knobs}`;
}

/**
 * One layer, as a script writes it: what differs from the layer BELOW it.
 *
 * `below` is the previous layer, or the voice for the first one, because that is
 * what a new layer IS — a copy of the one under it with a few things changed
 * (`setTrackLayer`). Writing the differences is therefore both the shortest
 * honest line and the exact inverse of the parser, and a layer that changes
 * nothing writes as a bare `layer 2 3`, which reads back as "make another copy"
 * — the same instruction, in the same words.
 */
function layerScript(layer: Layer, below: Layer): string {
  const parts: string[] = [];
  if (layer.wave !== below.wave) parts.push(` wave ${layer.wave}`);
  for (const param of VOICE_PARAMS) {
    if (layer[param.id] !== below[param.id]) parts.push(` ${param.id} ${layer[param.id]}`);
  }
  for (const field of LAYER_FIELDS) {
    if (layer[field.id] !== below[field.id]) parts.push(` ${field.id} ${layer[field.id]}`);
  }
  return parts.join('');
}

/**
 * Make text safe inside a `"quoted"` script token. Only the quote itself and a
 * line break could break the notation, and neither can reach a song today (both
 * titles and names are only ever set from a script line, which cannot carry
 * them) — but a file on disk is not a place to find out otherwise.
 */
function scriptTitle(text: string): string {
  return text.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * A key as the script writes it: `D minor`, `A harmonic minor`, `F# major`.
 *
 * The scale ids carry a dash (`harmonic-minor`) because that is a good name for
 * a value; the notation wants two words, because that is how a musician says it.
 */
function keyScript(key: SongKey): string {
  return `${tonicName(key.tonic)} ${key.scale.replace(/-/g, ' ')}`;
}

/**
 * The `key` field of a song file: optional as a whole, unforgiving inside.
 *
 * Optional because every file written before keys existed is still a real song,
 * and C major is the honest reading of one that says nothing. Inside, the two
 * halves go through the SAME `parseKey` the script parser uses, so a file and a
 * script cannot end up disagreeing about what `D harmonic minor` means — and a
 * key Tracklet cannot name is refused rather than guessed at, because a wrong
 * scale would paint confident, wrong advice on every view.
 */
function readKey(raw: unknown, errors: string[]): SongKey | null {
  if (raw === undefined || raw === null) return copyKey(DEFAULT_KEY);
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('"key" must be an object like { "root": "D", "scale": "minor" }.');
    return null;
  }
  const fields = raw as Record<string, unknown>;
  const root = typeof fields.root === 'string' ? fields.root.trim() : '';
  // A missing scale is a major key, which is what a bare note name means
  // everywhere else in music.
  const scale = fields.scale === undefined ? 'major' : typeof fields.scale === 'string' ? fields.scale : '';
  const key = parseKey(`${root} ${scale}`);
  if (!key) {
    errors.push(`"key" needs a root note and a scale, e.g. { "root": "D", "scale": "minor" }. Scales: ${SCALE_SPELLINGS}.`);
    return null;
  }
  return key;
}

// --- writing: the song as JSON ----------------------------------------------

/**
 * The song as a Tracklet song file: pretty-printed JSON, indented two spaces so
 * it diffs and reads like a file rather than a wire format.
 *
 * The shape mirrors the model on purpose. `stepsPerBeat` is `rowsPerBeat`,
 * `patterns[].steps` is the grid, and a cell is just its note number — or
 * `null`, which is exactly what the model's `Cell.note` holds. Two names differ
 * (`steps` and `stepsPerBeat` rather than `rows` and `rowsPerBeat`) because a
 * file is read by people as much as by tools, and "steps" is the word the app
 * puts on screen.
 */
export function songToJson(song: Song, settings: ScriptSettings = { volume: null }): string {
  // A song that stacks layers declares the newer version, and one that does not
  // keeps writing the version it always did — so the difference between them is
  // readable off the file, and an older build refuses the stacked one outright
  // rather than opening it with half its sound.
  const stacked = song.tracks.some((track) => track.stack.length > 0);
  const effected = song.tracks.some((track) => TRACK_EFFECTS.some((effect) => track[effect.id] !== DEFAULT_EFFECT));
  // The MIX's own shaping, on the same rule as a channel's: a song with a clean
  // master writes the bytes it always wrote.
  const mastered = TRACK_EFFECTS.some((effect) => song.master[effect.id] !== DEFAULT_EFFECT);
  // And a song using the CABINET writes version 30, whichever end of the chain it
  // is on — this is the one effect whose version is newer than the `effected`
  // pair above, because it was added after they were fixed.
  const cabbed = song.tracks.some((track) => track.cab !== DEFAULT_EFFECT) || song.master.cab !== DEFAULT_EFFECT;
  // ...and a song put through the TAPE machine writes version 31, on the same rule
  // as the cabinet one line up.
  const taped = song.tracks.some((track) => track.tape !== DEFAULT_EFFECT) || song.master.tape !== DEFAULT_EFFECT;
  // And a song sent down a TELEPHONE writes version 32, on the same rule again.
  const radioed = song.tracks.some((track) => track.radio !== DEFAULT_EFFECT) || song.master.radio !== DEFAULT_EFFECT;
  // And a song laid over a RECORD writes version 33, on the same rule once more.
  const pressed = song.tracks.some((track) => track.vinyl !== DEFAULT_EFFECT) || song.master.vinyl !== DEFAULT_EFFECT;
  // And a song nobody ducks in writes the bytes it always wrote: the version a
  // file declares is about what the file SAYS, not about what this build knows.
  const ducking = song.tracks.some((track) => track.duck !== DEFAULT_DUCK);
  // A song that MOVES a value writes version 17, which every build that predates
  // lanes refuses in words rather than opening as a flat record.
  const moving = song.automation.length > 0;
  // And a song whose FORM is named writes version 18: a build that predates
  // sections would play the `order` and be right about the music, but it would
  // also OPEN the file, edit it, and SAVE the sections away — losing the names
  // with nothing in the file to say they had ever been there.
  const named = song.sections.length > 0;
  // And a song where a PART has a feel of its own — a shuffled hat in a straight
  // song, a humanised lead — writes version 19, on the same rule: a build that
  // predates it would DROP the channel's groove and humanize, since a script is a
  // whole song and a file is read as one. It would still play the right notes, so
  // it is the names and the pocket that would be lost silently.
  const felt = song.tracks.some((track) => track.groove !== null || track.humanize !== DEFAULT_HUMANIZE);
  // And a song with a POLYPHONIC channel writes version 20. The reason is the
  // sharpest of the lot: an older build reading a channel with `poly 4` would cut
  // every overlap back to one note — it would not merely ignore a decoration, it
  // would play a quarter of the chord, and sound perfectly fine doing it.
  const polyphonic = song.tracks.some((track) => track.poly !== DEFAULT_POLY);
  // And a song where a channel's filter is not a low-pass writes version 21. A
  // build that predates shapes would open it, play every note through the filter
  // it has always had, and sound like a different instrument — the same silent
  // kind of wrongness as `poly`, one knob along.
  const shaped = song.tracks.some((track) => track.shape !== DEFAULT_SHAPE);
  // And a song whose channels are MIXED IN GROUPS writes version 22. The reason is
  // the one sections got, one scope down: an older build would play the file at
  // every channel's own fader — right about the notes, wrong about the balance —
  // and would then save the groups away, so the mix would come back different from
  // the one the file was written from. Either key alone is enough: a group with no
  // channels on it, or a channel naming one that is not there, is still a file this
  // build and no older one wrote.
  const grouped = song.buses.length > 0 || song.tracks.some((track) => track.bus !== null);
  // And a song with a note that SLIDES or STUTTERS writes version 23.
  const articulated = song.patterns.some((pattern) => pattern.steps.some((row) => row.some(
    (cell) => !isArticulation(tidyArticulation({ slide: cell.slide, stutter: cell.stutter, grace: cell.grace, bend: cell.bend })),
  )));
  // And a song with a CHORD IN ONE CELL writes version 24 — the cell's shape
  // itself changes, which is the one thing a reader cannot be tolerant about.
  const chordal = song.patterns.some((pattern) => pattern.steps.some(
    (row) => row.some((cell) => cell.extra.length > 0),
  ));
  // And a song with a DRUM HIT writes version 25, for the same reason and one
  // slot along: a cell's first slot holds a WORD where every earlier build found
  // a number.
  const drummed = song.patterns.some((pattern) => pattern.steps.some(
    (row) => row.some((cell) => cell.drum !== null),
  ));
  // And a song whose drums play a NAMED KIT writes version 26 — a groove's own
  // reason one scope over: an older build plays the right hits through the wrong
  // drums and then saves them that way.
  const kitted = song.kit !== DEFAULT_KIT;
  // And a song naming a KIT OF YOUR OWN writes version 29 — the sample's reason
  // exactly: the four voices are the APP's and the name is the song's, so an
  // older build would refuse the name (or, worse, play the presets and save the
  // song onto them). Decided WITHOUT the library, which a pure writer has no
  // access to: a name that is not one of the four built-ins is one of yours,
  // because the built-in words are spoken for and a user kit may not take them.
  const userKitted = kitted && !KIT_IDS.some((id) => sameKitName(id, song.kit));
  // And a song naming a RECORDING OF YOURS writes version 27 — the same reason a
  // bus got one: an older build would drop the reference and save the channel as
  // the built-in sound, so the part would come back with the wrong instrument on
  // it and no sign that anything had been lost.
  const sampled = song.tracks.some((track) => track.sample !== null);
  // And a song whose channels VARY their hits writes version 34: an older build
  // would play every hit identically, which is precisely the difference these two
  // settings exist to make — the reason `shape` got version 21 and the effects got
  // 23..26 one scope over. (A channel at 0 on both writes no key at all, so a song
  // that never varies is byte-identical to the one this build always wrote.)
  const varied = song.tracks.some(
    (track) => track.robin !== DEFAULT_ROBIN || track.touch !== DEFAULT_TOUCH,
  );
  // And a song whose channels WANDER writes version 35, one past the round-robin,
  // for the same reason: an older build would play every note dead steady, which
  // is the difference `drift` exists to make.
  const drifting = song.tracks.some((track) => track.drift !== DEFAULT_DRIFT);
  // And a song played at a master SPEED other than normal writes version 36, the
  // newest: an older build would play it at the written tempo and pitch, which is
  // a different record from the one that was written.
  const sped = song.speed !== DEFAULT_SPEED;
  // And a song with a DRUM MACHINE writes version 37, the newest: an older build
  // would drop the `machine` key without a word and save the beats away, so a
  // beat somebody dialed in would come back silent — the kit's reason one scope
  // out, where what is lost is a whole instrument rather than one word.
  const machined = song.machine !== null;
  // And a machine with MORE THAN ONE BAR writes version 38, the newest: an older
  // build would play bar 1 forever and save the beat that way, so a machine that
  // varies across the form has to say so in the version.
  const barred = song.machine !== null && (song.machine.bars.length > 0 || song.machine.order.length > 0);
  // And a song whose machine has a PAD on a recording writes version 39: an older
  // build would read the pad, drop `sample` without a word, and save the pad back
  // as its built-in one-shot — the sample's reason, one scope down.
  const padSampled = song.machine !== null && song.machine.pads.some((pad) => pad.sample !== null);
  // And a song one of whose SECTIONS names a machine bar writes version 40: an
  // older build would drop the field and play the verse's beat through the chorus.
  const sectioned = song.sections.some((section) => section.machineBar != null);
  // And a song with SCENES writes version 41, the newest: an older build would
  // drop the `scenes` key without a word, so a set somebody can perform would come
  // back linear — the machine's reason, for a whole performance surface instead of
  // one instrument.
  const scened = song.scenes.length > 0;
  // And a song with stored ARP SETTINGS writes version 42, the newest: an older
  // build would drop the `arp` key without a word, so dials somebody meant to
  // reopen and tune would come back as a song shaped by nothing — the scenes'
  // reason, for a page's settings.
  const arped = song.arp !== null;
  // And a song with a CHORD LOOP writes version 28: an older build would drop it
  // and keep the cells the followers wrote, so the song that came back would have
  // the right notes and no way to write the next bar of them.
  const looped = song.progression !== null;
  const file: Record<string, unknown> = {
    format: SONG_FILE_FORMAT,
    version: arped
      ? ARP_SONG_FILE_VERSION
      : scened
      ? SCENES_SONG_FILE_VERSION
      : sectioned
      ? MACHINE_SECTION_BAR_SONG_FILE_VERSION
      : padSampled
      ? MACHINE_PAD_SAMPLE_SONG_FILE_VERSION
      : barred
      ? MACHINE_BARS_SONG_FILE_VERSION
      : machined
      ? MACHINE_SONG_FILE_VERSION
      : sped
      ? SPEED_SONG_FILE_VERSION
      : drifting
      ? DRIFT_SONG_FILE_VERSION
      : varied
      ? VARIATION_SONG_FILE_VERSION
      : pressed
      ? VINYL_SONG_FILE_VERSION
      : radioed
      ? RADIO_SONG_FILE_VERSION
      : taped
      ? TAPE_SONG_FILE_VERSION
      : cabbed
      ? CAB_SONG_FILE_VERSION
      : userKitted
      ? KIT_NAME_SONG_FILE_VERSION
      : looped
      ? PROGRESSION_SONG_FILE_VERSION
      : sampled
      ? SAMPLE_SONG_FILE_VERSION
      : kitted
      ? KIT_SONG_FILE_VERSION
      : drummed
      ? DRUM_SONG_FILE_VERSION
      : chordal
      ? CHORD_SONG_FILE_VERSION
      : articulated
      ? ARTICULATION_SONG_FILE_VERSION
      : grouped
      ? BUS_SONG_FILE_VERSION
      : shaped
      ? SHAPE_SONG_FILE_VERSION
      : polyphonic
      ? POLY_SONG_FILE_VERSION
      : felt
      ? FEEL_SONG_FILE_VERSION
      : named
      ? SECTIONS_SONG_FILE_VERSION
      : moving
      ? AUTOMATION_SONG_FILE_VERSION
      : ducking
        ? DUCK_SONG_FILE_VERSION
        : mastered
          ? MASTER_SONG_FILE_VERSION
          : effected ? EFFECTS_SONG_FILE_VERSION : stacked ? STACK_SONG_FILE_VERSION : SONG_FILE_VERSION,
  };
  if (settings.volume !== null) file.volume = Math.round(settings.volume * 100);
  file.title = song.title;
  file.key = { root: tonicName(song.key.tonic), scale: song.key.scale };
  file.bpm = song.bpm;
  file.stepsPerBeat = song.rowsPerBeat;
  file.steps = patternRows(song);
  file.swing = song.swing;
  // Only when the transport is moved, so a song at normal speed writes the file
  // it always did — the same bargain `swing` makes, and why `speed 100` is not a
  // key at all.
  if (song.speed !== DEFAULT_SPEED) file.speed = song.speed;
  // Only when there is one, so a song at a single tempo writes the file it always
  // did: absent and empty mean the same thing, and both mean `bpm` throughout.
  if (song.tempoMap.length > 0) {
    file.tempoMap = sortTempoMap(song.tempoMap).map((point) => ({
      slot: point.slot, bpm: point.bpm, slide: point.slide,
    }));
  }
  // And the LANES, one object each and only when a song moves something: the bar
  // range is the pair `["start", "end"]` because it is one thing — where the
  // value leaves and where it arrives — the same way a tempo point is one thing.
  if (song.automation.length > 0) {
    file.automation = sortAutomationLanes(song.automation).map((lane) => ({
      track: lane.track,
      target: lane.target,
      from: lane.from,
      to: lane.to,
      bars: [lane.startBar, lane.endBar],
    }));
  }
  // The FORM, and only when the song has one: the named sections it is written
  // from, and the arrangement those names were laid out in. Both together, since
  // one is a definition and the other is what was DONE with it, and a song with no
  // sections writes neither key — which is what keeps every file written before
  // form existed byte for byte the file it was.
  if (song.sections.length > 0) {
    file.sections = song.sections.map((section) => ({
      name: section.name,
      bars: section.bars.slice(),
      // The machine bar, only when the section names one — so a form that says
      // nothing about the beat writes exactly the `sections` block it always did.
      ...(section.machineBar == null ? {} : { machine: section.machineBar }),
    }));
  }
  // The LOOP, and only when the song has one: the chords as the WORDS a person
  // wrote them (`["Am", "F", "C", "G"]`, or `["1", "6", "3", "7"]` for a loop
  // written in the song's own key) and how many steps each lasts. Names rather
  // than notes because a loop is a decision about harmony, and the register is the
  // follower's business — see `model/progression.ts`. A song with no loop writes
  // no `progression` key at all, which is what keeps every file written before
  // progressions existed byte for byte the file it was.
  if (song.progression !== null) {
    file.progression = {
      chords: song.progression.steps.map(progressionStepLabel),
      hold: progressionHold(song.progression),
    };
  }
  if (song.arrangement.length > 0) file.arrangement = song.arrangement.slice();
  // The SCENES, and only when a song has a live set: one object each, a name and
  // a `clips` list aligned to the channels (a number, or null for silence). A song
  // with no scenes writes no key and no new version, which is what keeps every
  // file written before Live byte for byte the file it was.
  if (song.scenes.length > 0) {
    file.scenes = song.scenes.map((scene) => ({
      name: scene.name,
      clips: scene.clips.slice(),
      // The machine bar only when the scene has one: the absent-means-absent rule,
      // so a scene that sits the machine out writes nothing extra.
      ...(scene.machine === null ? {} : { machine: scene.machine }),
    }));
  }
  // The ARP page's dials, and only when the song stores any: one object with the
  // five settings, in the model's own order. A song that never dialed an arp
  // writes no key and no new version, which is what keeps every file written
  // before the page byte for byte the file it was. The written CELLS are Pattern
  // rows below; these are the dials the page reopens with.
  if (song.arp !== null) {
    file.arp = {
      direction: song.arp.direction,
      octaves: song.arp.octaves,
      rate: song.arp.rate,
      gate: song.arp.gate,
      mode: song.arp.mode,
    };
  }
  // The GROUPS, and only when the song has any: one object each, in the order they
  // were declared (which is the order a screen would list them in), and a `bus` key
  // on the channels that joined one. A song with no groups writes neither, which is
  // what keeps every file written before buses existed byte for byte the file it
  // was.
  if (song.buses.length > 0) {
    file.buses = song.buses.map((bus) => ({ name: bus.name, level: bus.level }));
  }
  // Only when it is not straight, so a file that never chose a feel is the file
  // this app wrote before feels existed — the same rule `swing` above follows,
  // and the same rule the script writer follows for the same field.
  if (song.groove !== DEFAULT_GROOVE) file.groove = song.groove;
  // The KIT, only when it is not the presets — the same bargain `groove` and
  // `swing` make, so a song with no kit writes no `kit` key at all.
  if (song.kit !== DEFAULT_KIT) file.kit = song.kit;
  // Only when it is not equal, so a song in the default temperament writes the
  // file this app wrote before tunings existed.
  if (song.tuning !== DEFAULT_TUNING) file.tuning = song.tuning;
  file.reverb = song.reverb;
  file.echo = song.echo;
  // The mix's effects, in one object and only when at least one is on — the same
  // bargain a channel's six make, one scope out.
  if (mastered) file.master = effectFields(song.master);
  // The DRUM MACHINE, and only when the song has one: the mix as plain numbers,
  // and every pad's row as the same pattern string a script writes. A song with
  // no machine writes no key at all, which is what keeps every file written
  // before the machine existed byte for byte the file it was.
  if (song.machine !== null) file.machine = machineForFile(song.machine);
  file.order = song.order.slice();
  file.tracks = song.tracks.map((track) => ({
    name: track.name,
    // The whole sound in one field: the shape and the seven knobs. Keeping them
    // together is what makes "a channel's sound" one thing to read and write.
    voice: voiceForFile(track.voice),
    muted: track.muted,
    hold: track.hold,
    level: track.level,
    pan: track.pan,
    glide: track.glide,
    vibrato: track.vibrato,
    // The roll, and no key at all when this channel plays its chords as blocks.
    ...(track.strum === DEFAULT_STRUM ? {} : { strum: track.strum }),
    ...(track.robin === DEFAULT_ROBIN ? {} : { robin: track.robin }),
    ...(track.touch === DEFAULT_TOUCH ? {} : { touch: track.touch }),
    ...(track.drift === DEFAULT_DRIFT ? {} : { drift: track.drift }),
    verb: track.verb,
    echo: track.echo,
    // The duck, and no key at all when this channel ducks nothing.
    ...(track.duck === DEFAULT_DUCK ? {} : { duck: track.duck }),
    // The part's own feel, and no keys at all when it has none: absent means
    // "follow the song's groove, played straight", which is every older file.
    ...(track.groove === null ? {} : { groove: track.groove }),
    ...(track.humanize === DEFAULT_HUMANIZE ? {} : { humanize: track.humanize }),
    // Polyphony, and no key at all on a channel that holds one note at a time.
    ...(track.poly === DEFAULT_POLY ? {} : { poly: track.poly }),
    // The filter's shape, and no key at all on a channel that is still the
    // low-pass: absent means `round`, which is every file written before one.
    ...(track.shape === DEFAULT_SHAPE ? {} : { shape: track.shape }),
    // And the group it is mixed with, and no key at all on a channel that is on
    // its own fader: absent means "the band", which is every file written before
    // buses existed.
    ...(track.bus === null ? {} : { bus: track.bus }),
    // A channel that plays its own built-in sound names no sample, which is every
    // channel in every song written before a sample could be named.
    ...(track.sample === null ? {} : { sample: track.sample }),
    // The effects that are ON, and no keys at all when none of them are: a
    // channel that was never shaped writes the file it always wrote.
    ...effectFields(track),
    // The layers above the voice, and nothing at all when there are none: a
    // channel that was never stacked writes the file it always wrote.
    ...(track.stack.length > 0 ? { stack: track.stack.map(layerForFile) } : {}),
  }));
  file.patterns = song.patterns.map((pattern) => ({
    name: pattern.name,
    // A step at full force writes as the bare note it always was, and only an
    // accent or a soft note grows into a `[note, velocity]` pair — so a song
    // that never touches velocity produces the exact file version 3 produced.
    //
    // A note that is PLAYED a certain way needs the third slot, because the
    // articulation has to be readable in a file a person edits by hand: the same
    // suffix the script writes, as a string beside the two numbers. When it is
    // there the velocity is written out even at full force, so the slot positions
    // stay honest — a reader never has to guess whether `[60, ">"]` meant a
    // velocity or a slide.
    //
    // A cell that holds a CHORD puts its notes in that first slot as a list —
    // `[[60, 64, 67]]`, or `[[60, 64, 67], 100]` when it is not at full force.
    // The array is what says "several notes", so a cell that holds one note is
    // still the bare number it has always been, and a song of single notes is
    // byte-for-byte the file this app wrote before a cell could hold a chord.
    steps: pattern.steps.map((row) => row.map((cell) => {
      if (cell.note === null) return null;
      const velocity = clampVelocity(cell.velocity);
      const articulation = articulationText(tidyArticulation({ slide: cell.slide, stutter: cell.stutter, grace: cell.grace, bend: cell.bend }));
      // A DRUM puts its WORD in the first slot — `["kick"]`, or `["kick", 80]`
      // when it is not at full force. A string where a number (or a list of them)
      // belongs says "this hit is a named drum", which is the same trick the list
      // plays for a chord one field along — and the pitch the app plays it at does
      // NOT have to be stored, because a drum's pitch is a fact about the kit
      // (`drum.ts`), not about this song. A bare `"kick"` is written when the hit
      // is plain, so the shape stays as small as the note it stands in for.
      if (cell.drum !== null) {
        if (articulation !== '') return [cell.drum, velocity, articulation];
        return velocity === MAX_VELOCITY ? cell.drum : [cell.drum, velocity];
      }
      const pitches = cell.extra.length === 0 ? cell.note : cellNotes(cell);
      // A CHORD always carries its force, because its first slot is a LIST rather
      // than a pitch: `[[60, 64, 67], 100]`. A bare list would be a cell whose
      // length says something (the reader would see three values, not three
      // notes), which is exactly the ambiguity the version-24 shape exists to
      // avoid. A single note keeps the bare form it always had, so a song whose
      // cells each hold one note still writes the bytes it always wrote.
      if (Array.isArray(pitches)) {
        return articulation !== '' ? [pitches, velocity, articulation] : [pitches, velocity];
      }
      if (articulation !== '') return [pitches, velocity, articulation];
      return velocity === MAX_VELOCITY ? pitches : [pitches, velocity];
    })),
  }));
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * A channel's sound as a file writes it: the whole object, minus any field that
 * is still at its default.
 *
 * `duty`, `sweep`, `decay` and `release` are dropped at their defaults, because
 * they were added after the other knobs had already been written unconditionally.
 * Leaving the late knobs out at their defaults is what keeps a song that never
 * touched them byte-for-byte the file this app wrote before they existed — the
 * same bargain `groove`, `swing` and `tempoMap` each make.
 */
/**
 * ── The SOUND half of this file is shared, and that is the point ─────────────
 * `effectFields`, `voiceForFile`, `layerForFile`, `numberOf` and the three
 * readers below are exported because `patchfile.ts` writes the same pieces: a
 * patch is a channel's SOUND with a different header, so the fields it carries
 * and the rules for reading them have to be the song file's own. A second
 * spelling of "a voice in JSON" is exactly the kind of drift this app spends its
 * tests on, so there is one, and exporting it is how that stays true.
 */

/**
 * A channel's effects as a file writes them: only the ones that are ON.
 *
 * The same rule the script writer follows, and for the same reason — an effect
 * at 0 is what every channel in every older song is, so writing six zeroes would
 * be a promise about nothing and would move every existing file's bytes.
 */
export function effectFields(track: ChannelEffects): Record<string, number> {
  const fields: Record<string, number> = {};
  for (const effect of TRACK_EFFECTS) {
    if (track[effect.id] !== DEFAULT_EFFECT) fields[effect.id] = track[effect.id];
  }
  return fields;
}

/**
 * The drum machine as a file writes it: the mix as numbers, and every pad's row
 * as the same pattern string a script writes.
 *
 * Written only when a song HAS one (see `songToJson`), so the whole object can be
 * complete rather than minimal: the key's presence is already the signal, and a
 * reader wants the numbers spelled out rather than inferred from a missing
 * default. The effects are the exception, and follow the rule they follow
 * everywhere — only the ones that are on, so an untouched machine writes no
 * effect keys at all.
 */
function machineForFile(machine: DrumMachine): Record<string, unknown> {
  const effects = effectFields(machine.effects);
  return {
    enabled: machine.enabled,
    steps: machine.steps,
    beat: machine.beat,
    swing: machine.swing,
    level: machine.level,
    pan: machine.pan,
    ...(machine.bus === null ? {} : { bus: machine.bus }),
    verb: machine.verb,
    echo: machine.echo,
    ...(machine.duck === DEFAULT_DUCK ? {} : { duck: machine.duck }),
    ...(Object.keys(effects).length === 0 ? {} : { effects }),
    // A pad's row is written as NUMBERS, because the file is the lossless one:
    // the `pattern` STRING a script writes rounds a velocity to ninths, which is
    // right for a beat written by hand and wrong for one saved and reloaded. A
    // reader accepts either shape (see `readPad`), so an older or hand-written
    // file may still carry `pattern`.
    pads: machine.pads.map((pad) => ({
      name: pad.name,
      voice: voiceForFile(pad.voice),
      level: pad.level,
      pan: pad.pan,
      pitch: pad.pitch,
      // A pad that names no recording writes no key, like a channel on its own
      // built-in sound — so a machine of generators writes the exact file it did.
      ...(pad.sample === null ? {} : { sample: pad.sample }),
      steps: pad.steps.slice(),
    })),
    // The machine's OTHER bars, only when it has more than one — bar 1 is the
    // pads above, so a one-bar machine writes the exact file it always wrote. Each
    // bar is one row per pad, in the same numbers the pads use.
    ...(machine.bars.length === 0
      ? {}
      : { bars: machine.bars.map((bar) => machine.pads.map((_pad, index) => resizeRow(bar[index] ?? [], machine.steps))) }),
    // And which bar plays in each song bar, only when it is not "bar 1 forever".
    ...(machine.order.length === 0 ? {} : { order: machine.order.slice() }),
  };
}

/**
 * A channel's effects, read from a file.
 *
 * Lenient in the way `level` is lenient and for the same reason: an amount
 * outside the range was written by something that knew what it wanted and got
 * the arithmetic wrong, so it is CLAMPED rather than refused — while a value that
 * is not a number at all is a mistake about the format, and that is refused with
 * the channel's name on it.
 */
export function readEffects(entry: Record<string, unknown>, where: string, errors: string[]): ChannelEffects | null {
  const wanted: Partial<ChannelEffects> = {};
  for (const effect of TRACK_EFFECTS) {
    const raw = entry[effect.id];
    if (raw === undefined || raw === null) continue;
    const amount = numberOf(raw);
    if (amount === null) {
      errors.push(`${where}'s "${effect.id}" must be a percentage ${MIN_EFFECT}..${MAX_EFFECT}, e.g. ${DEFAULT_EFFECT} for off or 40 for a little.`);
      return null;
    }
    wanted[effect.id] = amount;
  }
  return clampEffects(wanted);
}

export function voiceForFile(voice: VoiceParams): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...voice };
  for (const id of ['duty', 'sweep', 'decay', 'release'] as const) {
    if (voice[id] === DEFAULT_VOICE[id]) delete fields[id];
  }
  return fields;
}

/**
 * One layer of a stack, as a file writes it.
 *
 * Unlike a voice, a layer is written with all nine of its knobs: a voice is a
 * NAMED sound, so a file can say `voice pad` and let the neutral defaults fill in
 * everything unmentioned, while a layer is only ever a set of numbers and has no
 * name to lean on. The three pitch fields are still dropped at their defaults —
 * in tune, in unison, at full level — because those defaults are unambiguous on
 * the way back in.
 */
export function layerForFile(layer: Layer): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...layer };
  for (const field of LAYER_FIELDS) {
    if (layer[field.id] === field.ofDefault) delete fields[field.id];
  }
  return fields;
}

// --- reading: a JSON song file ----------------------------------------------

/**
 * Read a Tracklet song file. Never throws and never touches a song: it either
 * returns a song built by the model's own factories — so every limit and every
 * invariant holds by construction — or a list of what is wrong with the file.
 *
 * Validation is strict where strictness is clear. A note outside C-0..B-8, a
 * channel name past the limit, nine channels: those are signs of a file that
 * has been edited by something that does not know the format, and repairing
 * them silently would be a lie about what the file said. Ranges that a person
 * would reasonably nudge (a tempo of 400) are clamped, exactly as the script
 * language clamps them.
 */
export function songFromJson(text: string): SongFileParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`this file is not valid JSON: ${messageOf(error)}`] };
  }
  if (!isRecord(raw)) {
    return { ok: false, errors: ['a Tracklet song file must be a JSON object.'] };
  }
  if (raw.format !== SONG_FILE_FORMAT) {
    return {
      ok: false,
      errors: [`this is not a Tracklet song file: it should say "format": "${SONG_FILE_FORMAT}".`],
    };
  }
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return { ok: false, errors: ['"version" must be a number.'] };
  }
  if (version > SONG_FILE_VERSION_MAX) {
    return {
      ok: false,
      errors: [`this file was written by a newer Tracklet (version ${version}); this build reads up to ${SONG_FILE_VERSION_MAX}.`],
    };
  }

  const errors: string[] = [];
  const key = readKey(raw.key, errors);
  const title = typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title.trim() : null;
  if (title === null) errors.push('"title" must be a non-empty string.');
  // Refused rather than shortened, for the same reason a channel name longer
  // than 16 characters is: silently trimming the title would rename the song on
  // the way in, and a title is the one thing here a person would notice.
  else if (!isSongTitleLength(title)) {
    errors.push(`"title" may be at most ${MAX_SONG_TITLE} characters; this one is ${title.length}. Shorten it and load again.`);
  }
  const bpm = numberOf(raw.bpm);
  if (bpm === null) errors.push('"bpm" must be a number.');
  const stepsPerBeat = numberOf(raw.stepsPerBeat);
  if (stepsPerBeat === null) errors.push('"stepsPerBeat" must be a number.');
  const steps = numberOf(raw.steps);
  if (steps === null) errors.push('"steps" must be a number.');
  // The mix groups first, because a channel JOINS one by name and the name has
  // to have been read before it can be checked — the same order the script
  // language insists on, for the same reason.
  const buses = readBuses(raw.buses, errors);
  const tracks = readTracks(raw.tracks, errors, buses);
  const patterns = readPatterns(raw.patterns, errors);
  const order = readOrder(raw.order, patterns?.length ?? 0, errors);
  // How much the song swings. Optional, because every file written before swing
  // existed is still a real song, and straight is the honest reading of one that
  // says nothing. Clamped rather than refused, like the tempo.
  let swing = DEFAULT_SWING;
  if (raw.swing !== undefined && raw.swing !== null) {
    const amount = numberOf(raw.swing);
    if (amount === null) errors.push(`"swing" must be a percentage ${MIN_SWING}..${MAX_SWING}, e.g. 0 or 60; got ${JSON.stringify(raw.swing)}.`);
    else swing = clampSwing(amount);
  }
  // The master tape speed, the same bargain as swing: absent means normal, which
  // is what every file written before a transport could be moved means. Clamped
  // rather than refused, and read from its own wider range because a speed is a
  // ratio rather than an amount.
  let speed = DEFAULT_SPEED;
  if (raw.speed !== undefined && raw.speed !== null) {
    const amount = numberOf(raw.speed);
    if (amount === null) errors.push(`"speed" must be a percentage ${SPEED_MIN}..${SPEED_MAX}, e.g. 100 (normal), 80 (slower and lower) or 200 (double); got ${JSON.stringify(raw.speed)}.`);
    else speed = clampSpeed(amount);
  }
  // Where the tempo CHANGES. Absent means one tempo all the way through, which
  // is what every file written before the map existed means; a malformed point is
  // refused rather than dropped, because a tempo that silently disappears is a
  // song at the wrong speed.
  const tempoMap = readTempoMap(raw.tempoMap, errors);
  // Where a knob MOVES over bars. Absent means nothing moves, which is what every
  // file written before lanes existed means — and a malformed lane is refused
  // rather than dropped, because a rise that silently disappears is a flat record
  // where the file asked for a build.
  const automation = readAutomation(raw.automation, tracks?.length ?? 0, errors);
  // The song's FORM. Absent means the song has no names for its bars, which is
  // what every file written before sections existed means — and a malformed
  // section is refused rather than dropped, for the reason an `automate` line is:
  // a form that silently disappears is a song whose names no longer mean anything.
  const sections = readSections(raw.sections, errors);
  // The live set. Absent means the song is linear, which is what every file
  // written before Live means — and a malformed scene is refused rather than
  // dropped, for the reason a section is: a row that silently disappears is a
  // performance that no longer launches what it says it does.
  const scenes = readScenes(raw.scenes, tracks?.length ?? 0, errors);
  // The LOOP, read beside the form: both are definitions rather than notes, so
  // both are read before the assignment at the end of this function.
  const progression = readProgression(raw.progression, errors);
  // The ARP page's dials, read beside the loop: a setting rather than notes, so
  // it is read before the assignment at the end of this function. Absent means
  // the song stores no arp, which is what every file written before the page
  // means — and the two WORDS are refused by name while the three NUMBERS clamp,
  // the same bargain a groove and a tempo each make.
  const arp = readArp(raw.arp, errors);
  // Which of those names the order was arranged from, kept only when it still
  // describes the order the file carries. An arrangement that has drifted is not
  // refused — the music is all there, and `order` is what plays — it is DROPPED,
  // because the alternative is a screen labelling bars with a form that is no
  // longer true.
  const arrangement = readArrangement(raw.arrangement, order, sections, errors);
  // Which FEEL the song is played with. A name rather than a number, so an
  // unknown one is REFUSED with the list rather than clamped: a groove nothing
  // knows is not a taste with bad arithmetic, it is a file written by something
  // that meant something else. Absent means straight, which is how every file
  // written before grooves existed plays.
  let groove: GrooveId = DEFAULT_GROOVE;
  if (raw.groove !== undefined && raw.groove !== null) {
    if (typeof raw.groove !== 'string') {
      errors.push(`"groove" must be one of: ${grooveNames()}. Got ${JSON.stringify(raw.groove)}.`);
    } else {
      const feel = grooveFromName(raw.groove);
      if (!feel) errors.push(`"${raw.groove}" is not a groove. The feels are: ${grooveNames()}.`);
      else groove = feel.id;
    }
  }
  // The TUNING, the same bargain as the groove above: absent means equal, which
  // is how every file written before tunings existed played, and an unknown name
  // is refused with the list rather than guessed — a tuning nobody knows is not a
  // taste with bad arithmetic but a file that meant something else.
  let tuning: TuningId = DEFAULT_TUNING;
  if (raw.tuning !== undefined && raw.tuning !== null) {
    if (typeof raw.tuning !== 'string') {
      errors.push(`"tuning" must be one of: ${tuningNames()}. Got ${JSON.stringify(raw.tuning)}.`);
    } else {
      const temperament = tuningFromName(raw.tuning);
      if (!temperament) errors.push(`"${raw.tuning}" is not a tuning. The tunings are: ${tuningNames()}.`);
      else tuning = temperament.id;
    }
  }
  // The DRUM KIT, the same bargain as the groove and the tuning: absent means the
  // four presets, which is how every file written before kits existed plays.
  //
  // One of the four built-ins is taken as spelled. ANY OTHER WORD is a kit of
  // your own, and it is accepted by SHAPE and not against a library — the
  // SAMPLE's bargain, exactly: the four voices are the APP's, the name is the
  // song's, and a reader has no library to check against (it must stay pure). A
  // name this machine does not have plays the four PRESETS rather than refusing
  // the song, and a word that is not a name at all is a file written by something
  // that does not know the format, so it is refused while the rest is reported.
  let kit: KitName = DEFAULT_KIT;
  if (raw.kit !== undefined && raw.kit !== null) {
    if (typeof raw.kit !== 'string') {
      errors.push(`"kit" must be one of: ${kitNames().join(', ')}, or the name of a kit of your own. Got ${JSON.stringify(raw.kit)}.`);
    } else {
      const chosen = kitFromName(raw.kit);
      if (chosen) kit = chosen;
      else if (kitNameProblem(raw.kit, []) !== null) {
        errors.push(`"${raw.kit}" is not a kit. The built-in kits are: ${kitNames().join(', ')}, and a kit of your own is one word of letters or digits, like MYHOUSE.`);
      } else kit = tidyKitName(raw.kit);
    }
  }
  // The room, the same bargain as swing: absent means dry, which is how every
  // file written before it existed played, and an amount out of range is
  // clamped rather than refused because it is a taste written with bad arithmetic.
  let reverb = DEFAULT_REVERB;
  if (raw.reverb !== undefined && raw.reverb !== null) {
    const amount = numberOf(raw.reverb);
    if (amount === null) errors.push(`"reverb" must be a percentage ${MIN_ROOM}..${MAX_ROOM}, e.g. 0 or 40; got ${JSON.stringify(raw.reverb)}.`);
    else reverb = clampRoom(amount);
  }
  let echo = DEFAULT_ECHO;
  if (raw.echo !== undefined && raw.echo !== null) {
    const amount = numberOf(raw.echo);
    if (amount === null) errors.push(`"echo" must be a percentage ${MIN_ROOM}..${MAX_ROOM}, e.g. 0 or 40; got ${JSON.stringify(raw.echo)}.`);
    else echo = clampRoom(amount);
  }
  // The MIX's effects, in one object. Absent on every file written before a
  // mix could be shaped — which is what makes them additive — and read with the
  // same leniency a channel's are: a number out of range is clamped, a value that
  // is not a number is refused with the name of the field it was in.
  let master: ChannelEffects = { ...NO_EFFECTS };
  if (raw.master !== undefined && raw.master !== null) {
    if (typeof raw.master !== 'object' || Array.isArray(raw.master)) {
      errors.push(`"master" must be an object of effect amounts, e.g. {"drive": 20}; got ${JSON.stringify(raw.master)}.`);
    } else {
      const read = readEffects(raw.master as Record<string, unknown>, '"master"', errors);
      if (!read) return { ok: false, errors: capped(errors) };
      master = read;
    }
  }
  // The DRUM MACHINE, read beside the mix. Absent means no machine, which is
  // what every file written before one existed says by saying nothing.
  const machine = readMachine(raw.machine, errors);

  if (errors.length > 0 || key === null || title === null || bpm === null || stepsPerBeat === null || steps === null || !tracks || !patterns || !order) {
    return { ok: false, errors: capped(errors) };
  }

  const song = createSong();
  song.title = title;
  song.key = key;
  song.bpm = clampBpm(bpm);
  song.rowsPerBeat = clampRowsPerBeat(stepsPerBeat);
  song.swing = swing;
  song.speed = speed;
  song.tempoMap = tempoMap;
  song.automation = automation;
  song.sections = sections;
  song.progression = progression;
  song.arrangement = arrangement;
  song.scenes = scenes;
  song.arp = arp;
  // The groups, each one a copy so a later edit to the song cannot reach back
  // into what the file parsed — the same rule the layers below follow.
  song.buses = buses.map((bus) => ({ ...bus }));
  song.groove = groove;
  song.kit = kit;
  song.tuning = tuning;
  song.reverb = reverb;
  song.echo = echo;
  song.machine = machine;
  for (const effect of TRACK_EFFECTS) song.master[effect.id] = master[effect.id];
  setTrackCount(song, tracks.length);
  tracks.forEach((source, i) => {
    const track = song.tracks[i];
    for (const effect of TRACK_EFFECTS) track[effect.id] = source.effects[effect.id];
    track.name = tidyTrackName(source.name);
    track.voice = copyVoice(source.voice);
    track.muted = source.muted;
    track.hold = source.hold;
    track.level = source.level;
    track.pan = source.pan;
    track.glide = source.glide;
    track.vibrato = source.vibrato;
    track.strum = source.strum;
    track.robin = source.robin;
    track.touch = source.touch;
    track.drift = source.drift;
    track.verb = source.verb;
    track.echo = source.echo;
    track.duck = source.duck;
    track.groove = source.groove;
    track.humanize = source.humanize;
    track.poly = source.poly;
    track.shape = source.shape;
    track.bus = source.bus;
    // The recording it named, if it named one. Nothing is resolved here: which
    // file that name means is the app's business, and the engine falls back to
    // the built-in one-shot when there is no such file.
    track.sample = source.sample;
    // A copy rather than the reader's own array, so a later edit to the song can
    // never reach back into what the file parsed.
    track.stack = source.stack.map((layer) => ({ ...layer }));
  });
  setPatternRows(song, clampRows(steps));
  patterns.forEach((source, i) => {
    const pattern = ensurePattern(song, i + 1);
    pattern.name = source.name;
    source.cells.forEach((row, r) => {
      row.forEach((source_, c) => {
        const cell = pattern.steps[r]?.[c];
        if (!cell) return;
        // The notes go in through the one writer that keeps a cell's two fields
        // consistent: a chord is a list, a single note is a list of one, and an
        // absent step is an empty list. A DRUM goes through its own writer, which
        // is what puts the kit's pitch on the cell and takes any chord off it.
        if (source_ && source_.drum !== null) setCellDrum(cell, source_.drum);
        else setCellNotes(cell, source_ ? [source_.note, ...source_.extra] : []);
        // The velocity travels on the note, so a step with no note keeps the
        // default rather than a stray value from a file that meant nothing by it.
        // How it is played travels with it, for the same reason.
        if (source_) {
          cell.velocity = clampVelocity(source_.velocity);
          cell.slide = source_.slide;
          cell.stutter = clampStutter(source_.stutter);
          cell.grace = clampGrace(source_.grace);
          cell.bend = clampBend(source_.bend);
        }
      });
    });
  });
  // A CHORD needs a channel wide enough to SOUND it, and that is a rule about a
  // step and a channel at once — so it can only be checked once both are in the
  // song. A file that broke it would play as a chord with notes missing, which is
  // a difference nobody could hear as an error: refused, like every other
  // inconsistency this reader finds, rather than repaired in silence.
  song.patterns.forEach((pattern, p) => {
    pattern.steps.forEach((row, r) => {
      row.forEach((cell, c) => {
        const poly = song.tracks[c]?.poly ?? DEFAULT_POLY;
        const held = cellNotes(cell).length;
        if (held > poly) {
          errors.push(`pattern ${p + 1}, step ${r}, channel ${c + 1}: this step holds ${held} notes, but the channel sounds ${poly} at a time. Raise the channel's poly, or write the chord across channels.`);
        }
      });
    });
  });
  if (errors.length > 0) return { ok: false, errors: capped(errors) };

  song.order = order;

  const volume = numberOf(raw.volume);
  return {
    ok: true,
    kind: 'json',
    song,
    settings: { volume: volume === null ? null : Math.max(0, Math.min(1, volume / 100)) },
  };
}

/**
 * A number from a file, clamped into range, or the fallback when the field is
 * absent or is not a number at all.
 *
 * The LENIENT policy the machine is read with throughout — the same one
 * `parseUserKits` and `readStoredKitVoices` use, and for the same reason: the
 * machine is a nested, optional structure a person may hand-edit, so a stray
 * value should cost a knob rather than the whole song. Structure is still
 * strict: a `machine` that is not an object, or `pads` that is not an array, is
 * refused in words.
 */
function readAmount(raw: unknown, fallback: number, clamp: (value: number) => number): number {
  if (raw === undefined || raw === null) return fallback;
  const value = numberOf(raw);
  return value === null ? fallback : clamp(value);
}

/**
 * The DRUM MACHINE from a file, or null for a song that has none.
 *
 * A missing key means no machine, which is every file written before one existed
 * — and the reason a song with no machine writes no key at all. Everything else
 * is read the lenient way the kit is: numbers are clamped, an unreadable pad's
 * name falls back to the kit drum it sits at, and a pattern string is padded with
 * rests and truncated rather than refused. Only the SHAPE is strict, because a
 * machine that is not an object is a file written by something that does not know
 * the format.
 */
function readMachine(value: unknown, errors: string[]): DrumMachine | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    errors.push('"machine" must be an object describing the drum machine.');
    return null;
  }
  const raw = value;

  let steps = DEFAULT_MACHINE_STEPS;
  if (raw.steps !== undefined && raw.steps !== null) {
    const amount = numberOf(raw.steps);
    if (amount === null) {
      errors.push(`"machine"'s "steps" must be a number ${MIN_MACHINE_STEPS}..${MAX_MACHINE_STEPS}; got ${JSON.stringify(raw.steps)}.`);
      return null;
    }
    steps = clampMachineSteps(amount);
  }
  let beat = DEFAULT_MACHINE_BEAT;
  if (raw.beat !== undefined && raw.beat !== null) {
    const amount = numberOf(raw.beat);
    if (amount === null) {
      errors.push(`"machine"'s "beat" must be a number ${MIN_MACHINE_BEAT}..${MAX_MACHINE_BEAT}; got ${JSON.stringify(raw.beat)}.`);
      return null;
    }
    beat = clampMachineBeat(amount);
  }

  let effects: ChannelEffects = { ...NO_EFFECTS };
  if (raw.effects !== undefined && raw.effects !== null) {
    if (!isRecord(raw.effects)) {
      errors.push('"machine"\'s "effects" must be an object of effect amounts, e.g. {"drive": 20}.');
      return null;
    }
    const read = readEffects(raw.effects, '"machine"', errors);
    if (!read) return null;
    effects = read;
  }

  const pads: DrumPad[] = [];
  if (raw.pads !== undefined && raw.pads !== null) {
    if (!Array.isArray(raw.pads)) {
      errors.push('"machine"\'s "pads" must be an array of pads.');
      return null;
    }
    if (raw.pads.length > MAX_PADS) {
      errors.push(`this machine has ${raw.pads.length} pads, but a machine may have ${MAX_PADS}. Remove some and load again.`);
      return null;
    }
    raw.pads.forEach((entry, index) => pads.push(readPad(entry, index + 1, steps)));
  }

  // The machine's OTHER bars, bar 2 onward — bar 1 is the pads' own rows, so a
  // one-bar machine writes (and reads) no key at all. A missing or malformed bar
  // is read as rests rather than costing the song, the same leniency the pads get.
  const bars: number[][][] = [];
  if (raw.bars !== undefined && raw.bars !== null) {
    if (!Array.isArray(raw.bars)) {
      errors.push('"machine"\'s "bars" must be an array of bars, each a row per pad.');
      return null;
    }
    if (raw.bars.length > MAX_MACHINE_BARS - 1) {
      errors.push(`this machine has ${raw.bars.length + 1} bars, but a machine may have ${MAX_MACHINE_BARS}. Remove some and load again.`);
      return null;
    }
    for (const entry of raw.bars) {
      const stored = Array.isArray(entry) ? entry : [];
      bars.push(pads.map((_pad, index) => readBarRow(stored[index], steps)));
    }
  }

  // Which bar plays in each song bar, clamped to a bar that exists. A number that
  // is not a number is skipped rather than refused, like every other amount here.
  const order: number[] = [];
  if (Array.isArray(raw.order)) {
    const count = 1 + bars.length;
    for (const entry of raw.order) {
      const amount = numberOf(entry);
      if (amount !== null) order.push(Math.max(1, Math.min(count, Math.round(amount))));
    }
  }

  const bus = typeof raw.bus === 'string' && raw.bus.trim() !== '' ? tidyBusName(raw.bus) : null;
  return {
    enabled: raw.enabled === undefined || raw.enabled === null ? true : raw.enabled === true,
    steps,
    beat,
    swing: readAmount(raw.swing, DEFAULT_SWING, clampSwing),
    level: readAmount(raw.level, DEFAULT_LEVEL, clampLevel),
    pan: readAmount(raw.pan, DEFAULT_PAN, clampPan),
    bus,
    verb: readAmount(raw.verb, DEFAULT_VERB, clampSend),
    echo: readAmount(raw.echo, DEFAULT_TRACK_ECHO, clampSend),
    duck: readAmount(raw.duck, DEFAULT_DUCK, clampDuck),
    effects,
    pads,
    bars,
    order,
  };
}

/**
 * One row of a machine BAR from a file: a list of velocities, or the pattern
 * string a script writes. The same leniency `readPad` gives a pad's own row, and
 * for the same reason — a hand-edited file may hold either shape.
 */
function readBarRow(value: unknown, steps: number): number[] {
  const row = emptyRow(steps);
  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, steps); i++) row[i] = clampHitVelocity(Number(value[i]));
  } else if (typeof value === 'string') {
    for (let i = 0; i < Math.min(value.length, steps); i++) {
      const velocity = padPatternVelocity(value[i] as string);
      row[i] = velocity === null ? 0 : velocity;
    }
  }
  return row;
}

/**
 * One pad from a file, or the default pad for that position when it is not an
 * object at all. The row is read from the `pattern` string char by char: a
 * character that is not `.` or `1`..`9` is a rest, which is the lenient reading
 * of a hand-edited file.
 */
function readPad(value: unknown, index: number, steps: number): DrumPad {
  const fallback = defaultPad(index, steps);
  if (!isRecord(value)) return fallback;
  const raw = value;
  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? tidyPadName(raw.name) : fallback.name;
  let voice = fallback.voice;
  if (raw.voice !== undefined || raw.wave !== undefined) {
    const entry = isRecord(raw.voice) ? { voice: raw.voice } : { wave: raw.wave };
    // The pad's voice is read by the song file's own reader with a THROWAWAY
    // error list: a pad with a broken sound falls back to its kit drum rather
    // than costing the song, the same leniency the rest of the machine gets.
    const read = readVoice(entry, `machine pad ${index}`, []);
    if (read) voice = read;
  }
  const tune = readAmount(raw.tune, 0, clampTune);
  // The file writes a pad's ABSOLUTE pitch; a hand-written or older file may
  // instead write the `tune` a script uses, measured from the kit drum. The
  // absolute value wins when it is there, because it is the one the writer wrote
  // — and reading `tune` alone would silently reset every tuned pad to its kit.
  const pitch = readAmount(raw.pitch, fallback.pitch + tune, clampMidi);
  const row = emptyRow(steps);
  if (Array.isArray(raw.steps)) {
    for (let i = 0; i < Math.min(raw.steps.length, steps); i++) {
      row[i] = clampHitVelocity(Number(raw.steps[i]));
    }
  } else if (typeof raw.pattern === 'string') {
    for (let i = 0; i < Math.min(raw.pattern.length, steps); i++) {
      const velocity = padPatternVelocity((raw.pattern as string)[i]);
      row[i] = velocity === null ? 0 : velocity;
    }
  }
  // The pad's recording, read the lenient way the rest of the machine is: a name
  // that is not a name leaves the pad on its built-in sound rather than costing
  // the song, the same guarantee a channel on a sample the app lacks already makes.
  let sample: string | null = null;
  if (typeof raw.sample === 'string' && sampleNameProblem(raw.sample) === null) {
    sample = tidySampleName(raw.sample);
  }
  return {
    name,
    voice,
    level: readAmount(raw.level, fallback.level, clampLevel),
    pan: readAmount(raw.pan, fallback.pan, clampPan),
    pitch,
    sample,
    steps: row,
  };
}

interface JsonTrack {
  name: string;
  voice: VoiceParams;
  /** The layers above the voice, already checked. Empty when the file has none. */
  stack: Layer[];
  muted: boolean;
  hold: number;
  level: number;
  pan: number;
  glide: number;
  vibrato: number;
  /** How far this channel's chord rolls, in steps, 0..4. */
  strum: number;
  /** How much a channel's successive hits differ, 0..100. See `Track.robin`. */
  robin: number;
  /** How much a channel's tone follows velocity, 0..100. See `Track.touch`. */
  touch: number;
  /** How far a channel's pitch wanders, 0..100. See `Track.drift`. */
  drift: number;
  verb: number;
  echo: number;
  /** How far this channel pushes the rest of the mix down, 0..100. */
  duck: number;
  /** This channel's own feel, already looked up: `null` follows the song's. */
  groove: GrooveId | null;
  /** How much this channel is played rather than typed, 0..100. */
  humanize: number;
  /** How many notes this channel may hold at once. 1 is monophonic. */
  poly: number;
  /** Which part of the sound the channel's filter passes, already looked up. */
  shape: FilterShape;
  /** The group this channel is mixed with, already looked up: `null` is none. */
  bus: string | null;
  /**
   * The recording this channel names, or `null` for its own built-in sound.
   *
   * A REFERENCE, and deliberately NOT looked up against anything: the bank of
   * loaded samples belongs to the app, not to the file, so a name this machine
   * has no audio for is not a broken file — it is a song written on another
   * machine, which is exactly the case the fallback exists for.
   */
  sample: string | null;
  /** The channel's effects, already range-checked: off when the file is silent. */
  effects: ChannelEffects;
}

/** One step of a JSON grid, already range-checked and velocity-resolved. */
interface JsonCell {
  note: number;
  /** The rest of a chord written into one cell, or `[]`. See `Cell.extra`. */
  extra: number[];
  /** The drum this hit is, or null. The pitch above is the drum's own. */
  drum: DrumId | null;
  velocity: number;
  /**
   * How the note is played: a slide into it, how many hits it gets, a flam, and
   * how far it bends its own pitch.
   */
  slide: boolean;
  stutter: number;
  grace: number;
  bend: number;
}

interface JsonPattern {
  name: string;
  /** The pattern's grid, already range-checked: a note and its force, or null. */
  cells: (JsonCell | null)[][];
}

function readTracks(value: unknown, errors: string[], buses: readonly Bus[]): JsonTrack[] | null {
  if (!Array.isArray(value)) {
    errors.push('"tracks" must be an array of channels.');
    return null;
  }
  const raw = value;
  if (raw.length < MIN_TRACKS || raw.length > MAX_TRACKS) {
    errors.push(`a song has ${MIN_TRACKS} to ${MAX_TRACKS} channels, but this file has ${raw.length}.`);
    return null;
  }
  const out: JsonTrack[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    const where = `channel ${i + 1}`;
    if (!isRecord(entry)) {
      errors.push(`${where} must be an object with a name, a wave and a mute flag.`);
      return null;
    }
    if (typeof entry.name !== 'string' || entry.name.trim() === '') {
      errors.push(`${where} needs a "name".`);
      return null;
    }
    if (!isTrackNameLength(entry.name)) {
      errors.push(`${where}'s name "${entry.name}" is longer than the ${MAX_TRACK_NAME}-character limit.`);
      return null;
    }
    const voice = readVoice(entry, where, errors);
    if (!voice) return null;
    if (typeof entry.muted !== 'boolean') {
      errors.push(`${where} needs a "muted" true or false.`);
      return null;
    }
    // How long the channel's notes ring. Optional, because every file written
    // before note lengths existed is still a real song, and one step is the
    // honest reading of one that says nothing.
    const hold = entry.hold === undefined ? DEFAULT_HOLD : numberOf(entry.hold);
    if (hold === null) {
      errors.push(`${where}'s "hold" must be a number of steps, e.g. ${DEFAULT_HOLD} or 8.`);
      return null;
    }
    // How loud the channel is in the mix. Optional for the same reason `hold`
    // is, and CLAMPED rather than refused for the same reason the voice knobs
    // are: a file that says `"level": 140` was written by something that had the
    // right idea and the wrong arithmetic, and "as loud as it goes" is what it
    // meant.
    const level = entry.level === undefined ? DEFAULT_LEVEL : numberOf(entry.level);
    if (level === null) {
      errors.push(`${where}'s "level" must be a percentage ${MIN_LEVEL}..${MAX_LEVEL}, e.g. ${DEFAULT_LEVEL} or 60.`);
      return null;
    }
    // Where the channel sits between the speakers. Optional like `hold`/`level`
    // and clamped like them, so a version-2 file opens dead centre and a file
    // that says `"pan": -140` means "hard left" rather than failing to load.
    const pan = entry.pan === undefined ? DEFAULT_PAN : numberOf(entry.pan);
    if (pan === null) {
      errors.push(`${where}'s "pan" must be a place ${MIN_PAN}..${MAX_PAN}, e.g. ${DEFAULT_PAN} for centre, -40 for left or 40 for right.`);
      return null;
    }
    // How the channel slides between notes and how far its pitch wobbles. Both
    // optional like `pan`, and both clamped like it, so a version-4 file opens
    // with no slide and no wobble — which is how it used to play.
    const glide = entry.glide === undefined ? DEFAULT_GLIDE : numberOf(entry.glide);
    if (glide === null) {
      errors.push(`${where}'s "glide" must be a percentage ${MIN_GLIDE}..${MAX_GLIDE}, e.g. ${DEFAULT_GLIDE} for none or 40 for a slide.`);
      return null;
    }
    const vibrato = entry.vibrato === undefined ? DEFAULT_VIBRATO : numberOf(entry.vibrato);
    if (vibrato === null) {
      errors.push(`${where}'s "vibrato" must be a percentage ${MIN_VIBRATO}..${MAX_VIBRATO}, e.g. ${DEFAULT_VIBRATO} for steady or 30 for a wobble.`);
      return null;
    }
    // How far this channel's CHORD rolls, in steps. Optional like the rest, and
    // absent on every file written before it — which is additive, and plays the
    // chord as the block it always was.
    const robin = entry.robin === undefined ? DEFAULT_ROBIN : numberOf(entry.robin);
    if (robin === null) {
      errors.push(`${where}'s "robin" must be a percentage ${ROBIN_MIN}..${ROBIN_MAX}, e.g. ${DEFAULT_ROBIN} so every hit is identical or 60 to give each hit a little of its own.`);
    }
    const touch = entry.touch === undefined ? DEFAULT_TOUCH : numberOf(entry.touch);
    if (touch === null) {
      errors.push(`${where}'s "touch" must be a percentage ${TOUCH_MIN}..${TOUCH_MAX}, e.g. ${DEFAULT_TOUCH} so velocity is only a level or 70 to make a soft hit darker than a loud one.`);
    }
    // How far this channel's pitch wanders, 0..100. Optional and absent on every
    // file written before it — which is additive, and holds every pitch.
    const drift = entry.drift === undefined ? DEFAULT_DRIFT : numberOf(entry.drift);
    if (drift === null) {
      errors.push(`${where}'s "drift" must be a percentage ${DRIFT_MIN}..${DRIFT_MAX}, e.g. ${DEFAULT_DRIFT} to hold every pitch steady or 40 for the wobble of a worn machine.`);
    }
    const strum = entry.strum === undefined ? DEFAULT_STRUM : numberOf(entry.strum);
    if (strum === null) {
      errors.push(`${where}'s "strum" must be a span in steps ${MIN_STRUM}..${MAX_STRUM}, e.g. ${DEFAULT_STRUM} to play the chord as a block or 1 to roll it across a step.`);
      return null;
    }
    // How much of the channel is fed to the master reverb and echo — SENDS, not
    // effects. Optional like the rest, defaulting to the top rather than to zero,
    // so a version-5 file opens with every channel fully in a room that is itself
    // still switched off: the sound it always made.
    const verb = entry.verb === undefined ? DEFAULT_VERB : numberOf(entry.verb);
    if (verb === null) {
      errors.push(`${where}'s "verb" must be a send ${MIN_SEND}..${MAX_SEND}, e.g. ${DEFAULT_VERB} to put the whole channel in the reverb or ${MIN_SEND} to keep it dry.`);
      return null;
    }
    const echo = entry.echo === undefined ? DEFAULT_TRACK_ECHO : numberOf(entry.echo);
    if (echo === null) {
      errors.push(`${where}'s "echo" must be a send ${MIN_SEND}..${MAX_SEND}, e.g. ${DEFAULT_TRACK_ECHO} to let the whole channel repeat or ${MIN_SEND} to keep it out of the echo.`);
      return null;
    }
    // The duck: how far this channel pushes the rest of the mix down. Optional
    // like everything else, and absent on every file written before it — which is
    // what makes it additive — and clamped rather than refused when it is out of
    // range, because a file that says `"duck": 400` was written by something
    // that knew what it wanted and got the arithmetic wrong.
    const duck = entry.duck === undefined ? DEFAULT_DUCK : numberOf(entry.duck);
    if (duck === null) {
      errors.push(`${where}'s "duck" must be a percentage ${MIN_DUCK}..${MAX_DUCK}, e.g. ${DEFAULT_DUCK} for none or 60 to push the rest of the mix down.`);
      return null;
    }
    // The part's own feel. Optional, and absent on every file written before it,
    // which is what makes it additive. A name the app does not know is REFUSED
    // rather than dropped: silently falling back to the song's groove would play
    // something other than what the file asked for, with nothing to say so.
    let groove: GrooveId | null = null;
    if (entry.groove !== undefined) {
      const feel = typeof entry.groove === 'string' ? grooveFromName(entry.groove) : null;
      if (!feel) {
        errors.push(`${where}'s "groove" must be a feel this app knows (${grooveNames()}); got ${JSON.stringify(entry.groove)}.`);
        return null;
      }
      groove = feel.id;
    }
    const humanize = entry.humanize === undefined ? DEFAULT_HUMANIZE : numberOf(entry.humanize);
    if (humanize === null) {
      errors.push(`${where}'s "humanize" must be a percentage ${MIN_HUMANIZE}..${MAX_HUMANIZE}, e.g. ${DEFAULT_HUMANIZE} for a machine or 40 for a part played by hand.`);
      return null;
    }
    // Polyphony. Optional, and absent on every file written before it. A value
    // that is not a number is refused; one that is merely out of range is clamped,
    // like every other number here.
    const poly = entry.poly === undefined ? DEFAULT_POLY : numberOf(entry.poly);
    if (poly === null) {
      errors.push(`${where}'s "poly" must be a whole number of notes ${MIN_POLY}..${MAX_POLY}, e.g. ${DEFAULT_POLY} for one note at a time or 4 for a chord.`);
      return null;
    }
    // Which GROUP this channel is mixed with. Optional, absent on every file
    // written before buses existed. A name this file has no bus for is REFUSED
    // rather than dropped, for the reason `shape` is one knob over: falling back
    // to "no group" would play the channel LOUDER than the file asked for, and
    // nothing in the sound would say why.
    let bus: string | null = null;
    if (entry.bus !== undefined && entry.bus !== null) {
      if (typeof entry.bus !== 'string' || busNameProblem(entry.bus) !== null) {
        errors.push(`${where}'s "bus" must be the name of a group this file defines, e.g. "DRUMS"; got ${JSON.stringify(entry.bus)}.`);
        return null;
      }
      const joined = busByName(buses, entry.bus);
      if (!joined) {
        const have = buses.length === 0
          ? 'this file has no "buses" at all'
          : `this file has: ${busNames(buses).join(', ')}`;
        errors.push(`${where} joins a bus this file does not have: "${entry.bus}" — ${have}. Add it to "buses", or drop the key.`);
        return null;
      }
      bus = joined.name;
    }
    // Which recording of the author's this channel plays. Optional, absent on
    // every file written before samples could be named, and the ONE key here
    // that is checked for SPELLING and not against a list: a bus, a voice and a
    // shape are the SONG's, so a name the file cannot match is a mistake, while
    // the sample bank is the APP's — a song naming audio this machine does not
    // have still plays (its built-in one-shot), which is what makes a song
    // portable. Refusing it would mean a file that opens on the machine that
    // wrote it and nowhere else.
    let sample: string | null = null;
    if (entry.sample !== undefined && entry.sample !== null) {
      const problem = typeof entry.sample === 'string' ? sampleNameProblem(entry.sample) : 'it is not a name';
      if (problem !== null) {
        errors.push(`${where}'s "sample" must be the name of a recording, e.g. "BRK02": ${problem}.`);
        return null;
      }
      sample = tidySampleName(entry.sample as string);
    }
    // The filter's shape. Optional, absent on every file written before it, and
    // REFUSED rather than dropped when it names something this build does not
    // know: falling back to the low-pass would play a different instrument from
    // the one the file asked for, with nothing in the sound to say so.
    let shape: FilterShape = DEFAULT_SHAPE;
    if (entry.shape !== undefined) {
      const kind = typeof entry.shape === 'string' ? shapeFromName(entry.shape) : null;
      if (!kind) {
        errors.push(`${where}'s "shape" must be a filter shape this app knows (${shapeNames()}); got ${JSON.stringify(entry.shape)}.`);
        return null;
      }
      shape = kind.id;
    }

    // The effects. Optional like everything else, and absent on every file
    // written before them — which is what makes them additive. A missing one is
    // OFF, which is what a channel that has never been shaped plays.
    const effects = readEffects(entry, where, errors);
    if (!effects) return null;
    // The layers above the voice. Optional, and absent on every file written
    // before stacks existed — which is what makes a stack additive rather than a
    // format change.
    const stack = readStack(entry, where, errors);
    if (!stack) return null;
    out.push({
      name: entry.name, voice, stack, muted: entry.muted, hold: clampHold(hold),
      level: clampLevel(level), pan: clampPan(pan), glide: clampGlide(glide), vibrato: clampVibrato(vibrato),
      strum: clampStrum(strum),
      robin: clampRobin(robin ?? DEFAULT_ROBIN),
      touch: clampTouch(touch ?? DEFAULT_TOUCH),
      drift: clampDrift(drift ?? DEFAULT_DRIFT),
      verb: clampSend(verb), echo: clampSend(echo), duck: clampDuck(duck), effects,
      groove, humanize: clampHumanize(humanize), poly: clampPoly(poly), sample,
      shape: isFilterShape(shape) ? shape : DEFAULT_SHAPE,
      bus,
    });
  }
  return out;
}

/**
 * A channel's sound, from a file.
 *
 * The current shape is a `voice` object — a waveform and the seven knobs. The
 * shape every file written before voices existed used, a bare `wave` string, is
 * still read, and means the neutral knobs with that shape: exactly the sound
 * those files used to play, so an old song opens sounding like itself. Knobs are
 * clamped rather than refused, because a file that says `bright 140` was written
 * by something confidently wrong, and clamping keeps the one thing the author
 * meant — "as bright as possible" — instead of rejecting the whole song.
 */
export function readVoice(entry: Record<string, unknown>, where: string, errors: string[]): VoiceParams | null {
  if (entry.voice !== undefined) {
    if (!isRecord(entry.voice)) {
      errors.push(`${where}'s "voice" must be an object like { "wave": "sine", "bright": 55 }, not ${JSON.stringify(entry.voice)}.`);
      return null;
    }
    const raw = entry.voice;
    const wave = typeof raw.wave === 'string' ? waveFromName(raw.wave) : null;
    if (!wave) {
      errors.push(`${where}'s wave must be square, triangle, sawtooth, sine, noise, table, sample, fm, string, formant, organ, granular, font, reed, brass, bow, mallet, membrane or plate; got "${String(raw.wave)}".`);
      return null;
    }
    const voice: VoiceParams = { ...DEFAULT_VOICE, wave };
    for (const param of VOICE_PARAMS) {
      const value = raw[param.id];
      if (value === undefined) continue;
      const amount = numberOf(value);
      if (amount === null) {
        errors.push(`${where}'s "${param.id}" must be a number ${MIN_PARAM}..${MAX_PARAM}; got ${JSON.stringify(value)}.`);
        return null;
      }
      voice[param.id] = clampParam(amount);
    }
    return voice;
  }
  const wave = typeof entry.wave === 'string' ? waveFromName(entry.wave) : null;
  if (!wave) {
    errors.push(`${where}'s wave must be square, triangle, sawtooth, sine, noise, table, sample, fm, string, formant, organ, granular, font, reed, brass, bow, mallet, membrane or plate; got "${String(entry.wave)}".`);
    return null;
  }
  return { ...DEFAULT_VOICE, wave };
}

/**
 * A channel's STACK, from a file: the layers ABOVE its voice, in playing order.
 *
 * Absent means no stack, which is what every file written before layers existed
 * says by saying nothing — and a channel with no stack is the one-layer channel
 * this app has always played.
 *
 * A malformed stack is REFUSED rather than repaired, unlike a knob that is
 * merely out of range. The distinction is the one this file makes everywhere: a
 * number that is too big is a taste written with bad arithmetic, while a layer
 * that is not an object, or a stack longer than a channel can hold, is a file
 * written by something that does not know the format — and dropping a layer
 * quietly would open a song that sounds THINNER than the file says, which is a
 * lie about the music rather than a repair of it. The knobs INSIDE a layer are
 * clamped like the voice's, for the same reason they are there.
 */
export function readStack(entry: Record<string, unknown>, where: string, errors: string[]): Layer[] | null {
  const raw = entry.stack;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push(`${where}'s "stack" must be an array of layers, e.g. [{ "wave": "saw", "octave": 1 }].`);
    return null;
  }
  if (raw.length > MAX_EXTRA_LAYERS) {
    errors.push(`${where} stacks ${raw.length} layers, but a channel may have ${MAX_EXTRA_LAYERS} layers above its voice. Remove some and load again.`);
    return null;
  }
  const out: Layer[] = [];
  for (let i = 0; i < raw.length; i++) {
    // Layer 1 is the voice, so a file's stack starts at layer 2 — numbering the
    // message the way the script and the menu do.
    const layerWhere = `${where}'s layer ${i + 2}`;
    if (!isRecord(raw[i])) {
      errors.push(`${layerWhere} must be an object like { "wave": "saw", "octave": 1 }.`);
      return null;
    }
    const fields = raw[i] as Record<string, unknown>;
    const wave = typeof fields.wave === 'string' ? waveFromName(fields.wave) : null;
    if (!wave) {
      errors.push(`${layerWhere} needs a "wave": square, triangle, sawtooth, sine, noise, table, sample, fm, string, formant, organ, granular, font, reed, brass, bow, mallet, membrane or plate; got ${JSON.stringify(fields.wave)}.`);
      return null;
    }
    const layer: Layer = neutralLayer(wave);
    for (const param of VOICE_PARAMS) {
      const value = fields[param.id];
      if (value === undefined) continue;
      const amount = numberOf(value);
      if (amount === null) {
        errors.push(`${layerWhere}'s "${param.id}" must be a number ${MIN_PARAM}..${MAX_PARAM}; got ${JSON.stringify(value)}.`);
        return null;
      }
      layer[param.id] = clampParam(amount);
    }
    for (const field of LAYER_FIELDS) {
      const value = fields[field.id];
      if (value === undefined) continue;
      const amount = numberOf(value);
      if (amount === null) {
        errors.push(`${layerWhere}'s "${field.id}" must be a number ${field.min}..${field.max}, e.g. ${field.ofDefault}; got ${JSON.stringify(value)}.`);
        return null;
      }
      layer[field.id] = clampLayerField(field.id, amount);
    }
    out.push(clampLayer(layer));
  }
  return out;
}

function readOrder(value: unknown, patternCount: number, errors: string[]): number[] | null {
  // Absent means "just play the first pattern", which is what every file written
  // before songs had an order means, and what a one-pattern song means still.
  if (value === undefined || value === null) return [1];
  if (!Array.isArray(value)) {
    errors.push('"order" must be an array of pattern numbers, e.g. [1, 2, 1].');
    return null;
  }
  if (value.length < 1 || value.length > MAX_ORDER) {
    errors.push(`a song plays 1 to ${MAX_ORDER} slots, but this file's "order" has ${value.length}.`);
    return null;
  }
  const out: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const slot = value[i];
    // A slot past the last pattern is a bar of silence nobody asked for, and a
    // file that says it was written by something that does not know the format.
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > patternCount) {
      errors.push(`"order" slot ${i + 1} must be a whole pattern number 1..${patternCount}; got ${JSON.stringify(slot)}.`);
      return null;
    }
    out.push(slot);
  }
  return out;
}

/**
 * Where the tempo changes, from a file.
 *
 * Absent means one tempo all the way through, which is what every file written
 * before the map existed means, so a missing (or null) field reads as an empty
 * map and plays exactly as it always did. A point's SHAPE is strict — a bar that
 * is not a whole bar, or a tempo that is not a number, is a file written by
 * something that does not know the format — while the tempo VALUE is clamped,
 * the same bargain the song's own `bpm` makes: `"bpm": 400` meant "as fast as
 * it goes" and clamping keeps that rather than refusing the whole song.
 *
 * `slide` is optional and reads as a step when it says nothing, so a bar that is
 * written `{ "slot": 5, "bpm": 140 }` means "the tempo is 140 from bar 5", the
 * common case and the one with the shorter spelling. Two points on one bar are
 * not refused: `sortTempoMap` has always said the later reading wins, and this is
 * that reading.
 */
/**
 * Where a value MOVES over bars, from a file.
 *
 * Absent means nothing moves, which is what every file written before lanes
 * existed means, so a missing (or null) field reads as an empty list and the
 * song plays exactly as it always did. The SHAPE is strict — a channel, a target
 * and a pair of bars, because anything else was written by something that does
 * not know the format — while the values are CLAMPED, the same bargain the
 * tempo map and the channel levels make: `"from": 400` meant "as much as it
 * goes", and refusing the whole song over it would lose the music.
 *
 * A lane that names a channel the song does not have is REFUSED rather than
 * dropped: unlike a clamped number, there is no nearest sensible reading of "move
 * the fourth channel's brightness" in a three-channel song, and silently losing
 * a rise is the kind of thing a listener notices and a file reader cannot.
 */
function readAutomation(value: unknown, channels: number, errors: string[]): AutomationLane[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push('"automation" must be an array of lanes, e.g. [{ "track": 2, "target": "bright", "from": 15, "to": 95, "bars": [8, 15] }].');
    return [];
  }
  if (value.length > MAX_AUTOMATION_LANES) {
    errors.push(`a song has at most ${MAX_AUTOMATION_LANES} automation lanes, but this file has ${value.length}.`);
    return [];
  }
  const out: AutomationLane[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    const where = `automation lane ${i + 1}`;
    if (!isRecord(entry)) {
      errors.push(`${where} must be an object like { "track": 2, "target": "bright", "from": 15, "to": 95, "bars": [8, 15] }.`);
      return [];
    }
    const track = entry.track;
    if (typeof track !== 'number' || !Number.isInteger(track) || track < 1 || track > Math.max(1, channels)) {
      errors.push(`${where} needs a "track" that is a channel number 1..${Math.max(1, channels)}; got ${JSON.stringify(track)}.`);
      return [];
    }
    const target = entry.target;
    if (typeof target !== 'string' || !isAutomationTarget(target)) {
      errors.push(`${where} needs a "target" a lane can move: ${AUTOMATION_TARGET_WORDS.join(', ')}. Got ${JSON.stringify(target)}.`);
      return [];
    }
    const bars = entry.bars;
    if (!Array.isArray(bars) || bars.length !== 2 || typeof bars[0] !== 'number' || typeof bars[1] !== 'number') {
      errors.push(`${where} needs "bars": [first, last], e.g. "bars": [8, 15].`);
      return [];
    }
    const startBar = clampAutomationBar(bars[0]);
    const endBar = clampAutomationBar(bars[1]);
    if (endBar < startBar) {
      errors.push(`${where} runs backwards: "bars": [${startBar}, ${endBar}] ends before it starts.`);
      return [];
    }
    const from = numberOf(entry.from);
    const to = numberOf(entry.to);
    if (from === null || to === null) {
      errors.push(`${where} needs a "from" and a "to" that are numbers, e.g. { "from": 15, "to": 95 }.`);
      return [];
    }
    out.push(tidyLane({
      track: clampAutomationTrack(track, Math.max(1, channels)),
      target: target as AutomationTargetId,
      from,
      to,
      startBar,
      endBar,
    }));
  }
  return sortAutomationLanes(out);
}

/**
 * The song's named sections, from a file.
 *
 * Absent means the song has no names for its bars, which is what every file
 * written before sections existed means, so a missing (or null) field reads as an
 * empty list and the song plays exactly as it always did. The SHAPE is strict — a
 * name and a list of pattern numbers — while the numbers are CLAMPED, the same
 * bargain the tempo map and the lanes make. The name is TIDIED rather than
 * refused when it is untidy (upper-cased and cut to the budget), because a name
 * is a label and a label that is too long is not a song that plays wrong.
 */
/**
 * The song's mix GROUPS, from a file.
 *
 * Absent means the song is mixed one fader per channel, which is what every file
 * written before buses existed means, so a missing (or null) field reads as an
 * empty list and the song plays exactly as it always did. The SHAPE is strict — a
 * name and a level — while the level is CLAMPED rather than refused, the same
 * bargain a channel's own `level` makes: a file that says `"level": 140` was
 * written by something confidently wrong, and "as loud as it goes" is what it
 * meant. The name is TIDIED rather than refused when it is untidy, because a name
 * is a label; a name that is not a word at all is refused, because a track line
 * could not join it.
 */
function readBuses(value: unknown, errors: string[]): Bus[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push('"buses" must be an array of groups, e.g. [{ "name": "DRUMS", "level": 70 }].');
    return [];
  }
  if (value.length > MAX_BUSES) {
    errors.push(`a song may have at most ${MAX_BUSES} buses, but this file has ${value.length}.`);
    return [];
  }
  const out: Bus[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    const where = `bus ${i + 1}`;
    if (!isRecord(entry)) {
      errors.push(`${where} must be an object like { "name": "DRUMS", "level": 70 }.`);
      return [];
    }
    const name = entry.name;
    if (typeof name !== 'string' || name.trim() === '' || busNameProblem(name) !== null) {
      errors.push(`${where} needs a "name" — one word, e.g. "DRUMS" — got ${JSON.stringify(name)}.`);
      return [];
    }
    const level = entry.level === undefined ? DEFAULT_LEVEL : numberOf(entry.level);
    if (level === null) {
      errors.push(`${where} ("${name}") needs a "level" ${MIN_LEVEL}..${MAX_LEVEL}, e.g. 70; got ${JSON.stringify(entry.level)}.`);
      return [];
    }
    out.push(tidyBus({ name, level }));
  }
  return tidyBuses(out);
}

/**
 * The song's chord LOOP, from a file.
 *
 * Absent (or null) means the song has no loop, which is what every file written
 * before progressions existed means — and a song with no loop answers exactly as
 * it always did, because nothing reads the field unless something asked to follow
 * it. The SHAPE is strict, because a loop is a decision: each chord must be a
 * chord NAME (`Am`, `F#7`, `Cmaj7`) or a scale degree (`1`..`7`), which is the
 * same two spellings the language takes, parsed by the same two parsers — so a
 * file and a script can never disagree about what `Dm7` means. An unknown chord is
 * REFUSED by name rather than guessed at, the same bargain the language makes: a
 * chord with the wrong quality still sounds like a chord, so nothing downstream
 * would ever reveal the mistake.
 */
function readProgression(value: unknown, errors: string[]): Progression | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    errors.push('"progression" must be an object like { "chords": ["Am", "F", "C", "G"], "hold": 8 }.');
    return null;
  }
  const chords = value.chords;
  if (!Array.isArray(chords) || chords.length === 0) {
    errors.push('"progression" needs a "chords" list with at least one chord, e.g. ["Am", "F", "C", "G"].');
    return null;
  }
  if (chords.length > MAX_PROGRESSION_STEPS) {
    errors.push(`a progression holds at most ${MAX_PROGRESSION_STEPS} chords, but this one has ${chords.length}.`);
    return null;
  }
  const hold = value.hold === undefined ? DEFAULT_PROGRESSION_HOLD : numberOf(value.hold);
  if (hold === null || hold < MIN_PROGRESSION_HOLD || hold > MAX_PROGRESSION_HOLD) {
    errors.push(`"progression" holds each chord ${MIN_PROGRESSION_HOLD}..${MAX_PROGRESSION_HOLD} steps, e.g. 8; got ${JSON.stringify(value.hold)}.`);
    return null;
  }
  const steps: ProgressionStep[] = [];
  for (const raw of chords) {
    if (typeof raw !== 'string') {
      errors.push(`every chord of a progression is written as a name, e.g. "Am"; got ${JSON.stringify(raw)}.`);
      return null;
    }
    const word = raw.trim();
    const asDegree = parseDegree(word);
    if (asDegree !== null) {
      steps.push({ kind: 'degree', degree: asDegree });
      continue;
    }
    const named = parseChordName(word);
    if (named === null) {
      errors.push(`"${raw}" is not a chord. A progression step is a chord name (Am, F#7, Bbdim, Cmaj7 — ${CHORD_SPELLINGS}) or a scale degree 1..7.`);
      return null;
    }
    steps.push({ kind: 'name', root: named.root, quality: named.quality });
  }
  return withProgressionSteps(steps, hold);
}

/**
 * The ARP page's dials, from a file.
 *
 * Absent (or null) means the song stores no arp, which is what every file written
 * before the page means — and a song with no dials answers exactly as it always
 * did, because nothing reads the field unless the page is open. The two WORDS
 * (direction and mode) are strict, the same bargain a groove and a tuning make: a
 * direction this build does not have is not a taste with bad arithmetic, it is a
 * file written by something that meant something else, so it is refused by name
 * with the list. The three NUMBERS are clamped, the same bargain a tempo makes:
 * an octave or a gate out of range is a taste written with bad arithmetic. Every
 * field is optional, so a file that sets one dial reads as the others' defaults.
 */
function readArp(value: unknown, errors: string[]): ArpSettings | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    errors.push('"arp" must be an object like { "direction": "updown", "octaves": 2, "rate": 1, "gate": 100, "mode": "chord" }.');
    return null;
  }
  const partial: Partial<ArpSettings> = {};
  if (value.direction !== undefined && value.direction !== null) {
    if (typeof value.direction !== 'string') {
      errors.push(`"arp" direction must be one of: ${ARP_DIRECTIONS.join(', ')}. Got ${JSON.stringify(value.direction)}.`);
    } else {
      const read = arpDirectionFromName(value.direction);
      if (read === null) errors.push(`"${value.direction}" is not an arp direction. The directions are: ${ARP_DIRECTIONS.join(', ')}.`);
      else partial.direction = read;
    }
  }
  if (value.mode !== undefined && value.mode !== null) {
    if (typeof value.mode !== 'string' || !ARP_MODES.includes(value.mode as ArpMode)) {
      errors.push(`"arp" mode must be one of: ${ARP_MODES.join(', ')}. Got ${JSON.stringify(value.mode)}.`);
    } else partial.mode = value.mode as ArpMode;
  }
  const octaves = numberOf(value.octaves);
  const rate = numberOf(value.rate);
  const gate = numberOf(value.gate);
  if (value.octaves != null && octaves === null) errors.push(`"arp" octaves must be a number ${MIN_ARP_OCTAVES}..${MAX_ARP_OCTAVES}; got ${JSON.stringify(value.octaves)}.`);
  if (value.rate != null && rate === null) errors.push(`"arp" rate must be a number 1..${MAX_ARP_RATE}; got ${JSON.stringify(value.rate)}.`);
  if (value.gate != null && gate === null) errors.push(`"arp" gate must be a number 0..${MAX_ARP_GATE}; got ${JSON.stringify(value.gate)}.`);
  if (octaves !== null) partial.octaves = octaves;
  if (rate !== null) partial.rate = rate;
  if (gate !== null) partial.gate = gate;
  return clampArp(partial);
}

function readSections(value: unknown, errors: string[]): Section[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push('"sections" must be an array of sections, e.g. [{ "name": "VERSE", "bars": [1, 1, 2, 1] }].');
    return [];
  }
  if (value.length > MAX_SECTIONS) {
    errors.push(`a song may name at most ${MAX_SECTIONS} sections, but this file has ${value.length}.`);
    return [];
  }
  const out: Section[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    const where = `section ${i + 1}`;
    if (!isRecord(entry)) {
      errors.push(`${where} must be an object like { "name": "VERSE", "bars": [1, 1, 2, 1] }.`);
      return [];
    }
    const name = entry.name;
    if (typeof name !== 'string' || name.trim() === '') {
      errors.push(`${where} needs a "name" — one word, e.g. "VERSE" — got ${JSON.stringify(name)}.`);
      return [];
    }
    const bars = entry.bars;
    if (!Array.isArray(bars) || bars.length === 0) {
      errors.push(`${where} ("${name}") needs "bars": the pattern numbers it plays, e.g. [1, 1, 2, 1].`);
      return [];
    }
    const cleaned: number[] = [];
    for (const bar of bars) {
      if (typeof bar !== 'number' || !Number.isFinite(bar)) {
        errors.push(`${where} ("${name}") has a bar that is not a number: ${JSON.stringify(bar)}. Bars are pattern numbers, e.g. [1, 1, 2, 1].`);
        return [];
      }
      cleaned.push(clampPatternNumber(bar));
    }
    // The machine bar is lenient like every other amount here: a bar outside the
    // range is clamped, and a value that is not a number reads as "no machine bar"
    // rather than costing the song.
    const machine = numberOf(entry.machine);
    out.push(tidySection({ name, bars: cleaned, machineBar: machine === null ? null : clampSectionMachineBar(machine) }));
  }
  return tidySections(out);
}

/**
 * The song's LIVE scenes, from a file.
 *
 * Absent means the song is linear, which is what every file written before Live
 * means, so a missing (or null) field reads as an empty list and the song plays
 * exactly as it always did. The SHAPE is strict — a name and a `clips` list —
 * while the clips are CLAMPED, the same bargain a lane's amount makes: a number
 * at or below zero, or a non-number, reads as SILENCE rather than as pattern 1,
 * which is the one reading a person could not have meant. The list is fitted to
 * the channels the file itself has, so a scene written when the song had six
 * channels opens in a four-channel song as its first four. The name is TIDIED
 * rather than refused when it is untidy (upper-cased and cut to the budget),
 * because a name is a label; a name that is not a string at all is refused while
 * the rest is reported.
 */
function readScenes(value: unknown, channels: number, errors: string[]): Scene[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push('"scenes" must be an array of scenes, e.g. [{ "name": "A", "clips": [1, 1, null, 2] }].');
    return [];
  }
  if (value.length > MAX_SCENES) {
    errors.push(`a song may hold at most ${MAX_SCENES} scenes, but this file has ${value.length}.`);
    return [];
  }
  const out: Scene[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    const where = `scene ${i + 1}`;
    if (!isRecord(entry)) {
      errors.push(`${where} must be an object like { "name": "A", "clips": [1, 1, null, 2] }.`);
      return [];
    }
    const name = entry.name;
    if (typeof name !== 'string' || name.trim() === '') {
      errors.push(`${where} needs a "name" — one word, e.g. "A" — got ${JSON.stringify(name)}.`);
      return [];
    }
    const clips = entry.clips;
    if (!Array.isArray(clips)) {
      errors.push(`${where} ("${name}") needs "clips": one entry per channel, a pattern number or null, e.g. [1, 1, null, 2].`);
      return [];
    }
    const cleaned: (number | null)[] = [];
    for (const clip of clips) {
      if (clip !== null && (typeof clip !== 'number' || !Number.isFinite(clip))) {
        errors.push(`${where} ("${name}") has a clip that is not a pattern number or null: ${JSON.stringify(clip)}. A clip is a pattern number, or null for a channel that is silent.`);
        return [];
      }
      cleaned.push(clampSceneClip(clip as number | null));
    }
    const machine = entry.machine;
    if (machine !== undefined && machine !== null && (typeof machine !== 'number' || !Number.isFinite(machine))) {
      errors.push(`${where} ("${name}") has a "machine" that is not a bar number or null: ${JSON.stringify(machine)}. It is a 1-based drum-machine bar, or null for a scene that sits it out.`);
      return [];
    }
    out.push(tidyScene({ name, clips: cleaned, machine: clampSceneBar(machine as number | null) }, channels));
  }
  return tidyScenes(out, channels);
}

/**
 * The arrangement, as the names an order was laid out from.
 *
 * Kept only when it expands to EXACTLY the order the file carries, bar for bar —
 * see `arrangementDescribes`. A name the song does not define is refused, because
 * that is a file that meant something this build cannot read, while an arrangement
 * that merely drifted from the order is dropped in silence, because the order is
 * what plays and a label is not music.
 */
function readArrangement(
  value: unknown,
  order: number[] | null,
  sections: readonly Section[],
  errors: string[],
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((name) => typeof name !== 'string' || name.trim() === '')) {
    errors.push('"arrangement" must be an array of section names, e.g. ["VERSE", "CHORUS", "VERSE"].');
    return [];
  }
  const names = (value as string[]).map(tidySectionName);
  const missing = names.find((name) => !sectionByName(sections, name));
  if (missing !== undefined) {
    const have = sections.length === 0 ? 'the file names none' : `the file names: ${sections.map((one) => one.name).join(', ')}`;
    errors.push(`"arrangement" uses the section "${missing}", and ${have}. A form is the sections the file itself defines.`);
    return [];
  }
  if (order === null || !arrangementDescribes(order, sections, names)) return [];
  return names;
}

function readTempoMap(value: unknown, errors: string[]): TempoPoint[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push('"tempoMap" must be an array of { slot, bpm } changes, e.g. [{ "slot": 9, "bpm": 90, "slide": true }].');
    return [];
  }
  if (value.length > MAX_TEMPO_POINTS) {
    errors.push(`a song has at most ${MAX_TEMPO_POINTS} tempo changes, but this file has ${value.length}.`);
    return [];
  }
  const out: TempoPoint[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    const where = `tempo change ${i + 1}`;
    if (!isRecord(entry)) {
      errors.push(`${where} must be an object like { "slot": 9, "bpm": 90, "slide": true }.`);
      return [];
    }
    // A bar the arrangement cannot reach is a change nobody could ever hear, and
    // a file that says one was written by something that does not know `order`.
    const at = entry.slot;
    if (typeof at !== 'number' || !Number.isInteger(at) || at < 1 || at > MAX_ORDER) {
      errors.push(`${where} needs a "slot" that is a whole bar number 1..${MAX_ORDER}; got ${JSON.stringify(at)}.`);
      return [];
    }
    const amount = numberOf(entry.bpm);
    if (amount === null) {
      errors.push(`${where} needs a "bpm" number; got ${JSON.stringify(entry.bpm)}.`);
      return [];
    }
    if (entry.slide !== undefined && typeof entry.slide !== 'boolean') {
      errors.push(`${where}'s "slide" must be true or false; got ${JSON.stringify(entry.slide)}.`);
      return [];
    }
    out.push({ slot: clampTempoSlot(at), bpm: clampBpm(amount), slide: entry.slide === true });
  }
  return sortTempoMap(out);
}

function readPatterns(value: unknown, errors: string[]): JsonPattern[] | null {
  if (!Array.isArray(value)) {
    errors.push('"patterns" must be an array of patterns.');
    return null;
  }
  const raw = value;
  if (raw.length < 1 || raw.length > MAX_PATTERNS) {
    errors.push(`a song has 1 to ${MAX_PATTERNS} patterns, but this file has ${raw.length}.`);
    return null;
  }
  const out: JsonPattern[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    const where = `pattern ${i + 1}`;
    if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.trim() === '') {
      errors.push(`${where} must be an object with a "name".`);
      return null;
    }
    if (!Array.isArray(entry.steps)) {
      errors.push(`${where} needs a "steps" grid.`);
      return null;
    }
    const cells: (JsonCell | null)[][] = [];
    const rows = entry.steps;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) {
        errors.push(`${where}, step ${r} must be an array of notes, one per channel.`);
        return null;
      }
      const line: (JsonCell | null)[] = [];
      for (let c = 0; c < row.length; c++) {
        const raw = row[c];
        if (raw === null || raw === undefined) {
          line.push(null);
          continue;
        }
        // A step is a bare note number, a `[note, velocity]` pair when the note is
        // not played at full force, or a `[note, velocity, articulation]` triple
        // when it is PLAYED a certain way — a slide, a stutter. Still arrays
        // rather than objects: a grid is ninety percent bare notes, and an object
        // per cell would be heavier than the shape it holds.
        let note: unknown = raw;
        let velocity = DEFAULT_VELOCITY;
        let articulation = { ...NO_ARTICULATION };
        let extra: number[] = [];
        if (Array.isArray(raw)) {
          if (raw.length !== 2 && raw.length !== 3) {
            errors.push(`${where}, step ${r}, channel ${c + 1}: a note is written as a number, [note, velocity] or [note, velocity, articulation]; got ${JSON.stringify(raw)}.`);
            if (errors.length >= MAX_ERRORS) return null;
            line.push(null);
            continue;
          }
          note = raw[0];
          const amount = numberOf(raw[1]);
          if (amount === null) {
            errors.push(`${where}, step ${r}, channel ${c + 1}: velocity must be a number ${MIN_VELOCITY}..${MAX_VELOCITY}; got ${JSON.stringify(raw[1])}.`);
            if (errors.length >= MAX_ERRORS) return null;
            line.push(null);
            continue;
          }
          velocity = clampVelocity(amount);
          if (raw.length === 3) {
            // The articulation is a NAME rather than a number or a flag, for the
            // reason `groove` and `shape` are: an unknown one is REFUSED with the
            // list rather than dropped, because a note that asked to slide and
            // was quietly played plainly is a note nobody can hear was wrong.
            const parsed = typeof raw[2] === 'string' ? parseArticulation(raw[2]) : null;
            if (!(typeof raw[2] === 'string' && parsed !== null)) {
              errors.push(`${where}, step ${r}, channel ${c + 1}: "${JSON.stringify(raw[2])}" is not something a note can do. Write "${SLIDE_CHAR}" to slide, "${STUTTER_CHAR}3" for three hits in one step, "${GRACE_CHAR}" for a flam or "${GRACE_CHAR}${GRACE_CHAR}" for a drag, "${SCOOP_CHAR}2" to scoop up onto a note or "${FALL_CHAR}2" to fall away from one (${MIN_BEND}..${MAX_BEND} semitones), or a slide with any of them as "${SLIDE_CHAR}${STUTTER_CHAR}3".`);
              if (errors.length >= MAX_ERRORS) return null;
              line.push(null);
              continue;
            }
            articulation = parsed;
          }
        }
        // A DRUM puts its WORD in the first slot — `"kick"`, or `["kick", 80]`
        // — which is the one thing a string there can mean: a hit whose sound the
        // file names rather than plays at a pitch. The pitch it is played at comes
        // from the kit, so a hand-edited file cannot disagree with the app about
        // what a kick is, and an unknown word is refused by name (a silently
        // dropped drum is a beat with a hole in it).
        let drum: DrumId | null = null;
        if (typeof note === 'string') {
          const id = drumFromName(note);
          if (id === null) {
            errors.push(`${where}, step ${r}, channel ${c + 1}: "${note}" is not a drum. The kit is ${drumNames().join(', ')}.`);
            if (errors.length >= MAX_ERRORS) return null;
            line.push(null);
            continue;
          }
          drum = id;
          note = drumPitch(id);
        }
        // A CHORD puts its notes in the first slot as a LIST: `[[60, 64, 67]]`, or
        // `[[60, 64, 67], 100]` when it is not at full force. An array there is
        // what says "several notes", which is why a bare number keeps meaning the
        // one note it always did.
        if (Array.isArray(note)) {
          const list = note;
          const usable = list.length > 0 && list.length <= MAX_CELL_NOTES
            && list.every((one) => typeof one === 'number' && Number.isInteger(one) && one >= MIDI_MIN && one <= MIDI_MAX);
          if (!usable) {
            errors.push(`${where}, step ${r}, channel ${c + 1}: a chord is a list of up to ${MAX_CELL_NOTES} whole numbers ${MIDI_MIN}..${MIDI_MAX}; got ${JSON.stringify(list)}.`);
            if (errors.length >= MAX_ERRORS) return null;
            line.push(null);
            continue;
          }
          extra = list.slice(1) as number[];
          note = list[0];
        }
        if (typeof note !== 'number' || !Number.isInteger(note) || note < MIDI_MIN || note > MIDI_MAX) {
          errors.push(`${where}, step ${r}, channel ${c + 1}: expected a whole number ${MIDI_MIN}..${MIDI_MAX} or null; got ${JSON.stringify(note)}.`);
          if (errors.length >= MAX_ERRORS) return null;
          line.push(null);
          continue;
        }
        line.push({ note, extra, drum, velocity, slide: articulation.slide, stutter: articulation.stutter, grace: articulation.grace, bend: articulation.bend });
      }
      cells.push(line);
    }
    out.push({ name: entry.name, cells });
  }
  return out;
}

// --- reading: whichever format the file is ----------------------------------

/**
 * Read a file that could be either format, and say which one it was.
 *
 * The FIRST character decides: a JSON object starts with `{`, and no Tracklet
 * Script can (a `{` is not a command word and not a note). That is cheaper and
 * far more forgiving than trusting the extension, so a song saved as `.txt` on
 * one machine and renamed on another still opens.
 */
export function parseSongFile(text: string): SongFileParse {
  // A byte-order mark is invisible, common in files other editors wrote, and
  // fatal to `JSON.parse`; it is dropped once here rather than in both readers.
  const body = text.replace(/^\uFEFF/, '');
  if (body.trimStart().startsWith('{')) return songFromJson(body);
  const result = applyScript(createSong(), body);
  if (!result.ok) {
    return { ok: false, errors: result.errors.map((error) => `line ${error.line}: ${error.message}`) };
  }
  return { ok: true, kind: 'script', song: result.song, settings: result.settings };
}

// --- names ------------------------------------------------------------------

/**
 * A file name for a song, without an extension: `MY TUNE` -> `my-tune`. Only
 * lower-case letters, digits and single hyphens survive, because a song title
 * is free text and every operating system disagrees about what else a file name
 * may contain.
 */
export function songFileStem(title: string): string {
  return fileSlug(title, 'tracklet-song');
}

/**
 * Free text as one file-name segment: `MY TUNE` -> `my-tune`.
 *
 * The rule behind every name this app writes — a song's file, a channel's stem —
 * in one place, so a name a channel suggests and the name the archive gives it
 * can never disagree. Lower case, digits and single hyphens survive and nothing
 * else does, because a song title, a pattern title and a channel name are all
 * free text and every operating system disagrees about the rest. Letters that are
 * not ASCII fold to `-` with everything else: a transliteration table is a
 * bigger promise than a file name deserves.
 */
export function fileSlug(text: string, fallback: string, limit = 40): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, limit)
    .replace(/-+$/, '');
  return slug === '' ? fallback : slug;
}

// --- small helpers ----------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Cap a wall of complaints, and say how many were left out. */
function capped(errors: string[]): string[] {
  if (errors.length <= MAX_ERRORS) return errors;
  return [...errors.slice(0, MAX_ERRORS), `...and ${errors.length - MAX_ERRORS} more.`];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
