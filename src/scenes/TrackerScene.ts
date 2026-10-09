import Phaser from 'phaser';
import {
  activeColors,
  activeTheme,
  Button,
  onThemeChanged,
  MenuInputController,
  Panel,
  setActiveTheme,
  THEME_IDS,
  Toast,
  Toggle,
  uiText,
  type NavEdge,
  type Rect,
} from 'phaser-ui-canvas';
import { HostExitPrompt, readLaunch } from 'phaser-ui-canvas/host';

import { AudioEngine } from '../audio/engine';
import { canRender, renderSongToPcm, renderStemsToPcm } from '../audio/render';
import { machineBarsForSong, machineStepAtRow } from '../audio/machine';
import { gainDecibels, gainPcm, matchLoudness, type LoudnessMatch } from '../audio/lufs';
import { decodeWav, encodeWav, monoPcm, pcmSeconds, type PcmAudio } from '../audio/wav';
import { zipStore } from '../audio/zip';
import { MixerView } from '../ui/MixerView';
import {
  beginGesture,
  MACHINE_CHANNEL,
  mixStep,
  newBusName,
  NO_GESTURE,
  type MixGesture,
} from '../ui/mixerBoard';
import { DrumMachineView, type MachineMixId, type PadMixId } from '../ui/DrumMachineView';
import {
  AUTOMATION_TARGET_BY_ID,
  MAX_AUTOMATION_LANES,
  tidyLane,
  type AutomationLane,
  type AutomationTargetId,
} from '../model/automation';
import { ArrangerView } from '../ui/ArrangerView';
import { LiveView, type LiveMode } from '../ui/LiveView';
import { RecorderView } from '../ui/RecorderView';
import { ArpView } from '../ui/ArpView';
import { cycleDial, setDialValue, type ArpDial } from '../ui/arpBoard';
import { launchCountdown } from '../ui/liveGrid';
import { PageMenu, PAGE_MENU_WIDTH, PAGE_ROWS, type PageId, type PageRow } from '../ui/PageMenu';
import { PatchMenu } from '../ui/PatchMenu';
import {
  addSample,
  makeSample,
  NO_SAMPLES,
  removeSample,
  sameSampleName,
  sampleByName,
  sampleLabel,
  sampleRows,
  sampleSeconds,
  tidySampleName,
  type SampleBank,
} from '../model/sample';
import {
  isTakeName,
  loopTakeByName,
  makeTake,
  peakOf,
  sameTakeName,
  takeFromSample,
  takeLoop,
  takeWindow,
  trimTakeByName,
  waveformBars,
  type Take,
} from '../model/take';
import {
  captureRefusal,
  listInputDevices,
  meterRefusal,
  startCapture,
  startMeter,
  type CaptureSession,
  type MeterSession,
  type MicDevice,
} from '../audio/recorder';
import { MIDI_EXPORT_FILE_EXTENSION } from '../model/midiExport';
import { stemArchiveName } from '../model/stems';
import { downloadBytes } from '../ui/download';
import {
  addTrack,
  appendOrder,
  applyScript,
  withUserVoice,
  withoutUserVoice,
  baseMidiForOctave,
  cellAt,
  clampBpm,
  busByName,
  clampBusLevel,
  clampCursor,
  clampEffect,
  clampEffects,
  clampGlide,
  clampLevel,
  clampPan,
  clampDuck,
  clampSend,
  clampParam,
  clampLayerField,
  clampRoom,
  levelLabel,
  clampSwing,
  genreFromName,
  genreScript,
  clampVibrato,
  stepVelocity,
  velocityLabel,
  articulationLabel,
  tidyArticulation,
  MAX_STUTTER,
  DEFAULT_STUTTER,
  clearCell,
  clearPattern,
  countNotes,
  createSong,
  describeSong,
  emptyPattern,
  History,
  isPatternEmpty,
  isSongEmpty,
  layerAt,
  layerCount,
  clearTrackLayer,
  setTrackLayer,
  copyLayer,
  copySound,
  savedSound,
  LAYER_FIELD_BY_ID,
  MAX_BUSES,
  MAX_LAYERS,
  parseSongFile,
  songFileStem,
  songToJson,
  songToMidi,
  songToScript,
  bounceLabel,
  bounceMarkFor,
  bounceMarkStatus,
  fitBounce,
  markBounce,
  markedBounce,
  NO_BOUNCE,
  type BounceMark,
  type BounceRange,
  cycleLoudness,
  LOUDNESS_MAX,
  LOUDNESS_MIN,
  loudLabel,
  loudnessMeaning,
  loudnessReport,
  applySoundToTrack,
  PATCH_NAME_FALLBACK,
  patchAbout,
  patchFileName,
  patchFromJson,
  patchNameFromFile,
  patchToJson,
  soundFromTrack,
  tidyPatchName,
  withBus,
  captureKit,
  kitAbout,
  kitFileName,
  kitFromJson,
  kitLabel,
  kitNameFromTitle,
  kitRowLabel,
  kitToJson,
  midiModeLabel,
  midiRowLabel,
  midiStatusAbout,
  nextMidiMode,
  placeLiveNote,
  tempoFromPulses,
  MIDI_TEMPO_WINDOW,
  type MidiInMessage,
  type MidiMode,
  type MidiStatus,
  userKitFromName,
  withUserKit,
  MAX_USER_KITS,
  type UserKit,
  stemPlan,
  stemRefusal,
  stemTracks,
  cellNotes,
  setCellNotes,
  DEFAULT_ARP,
  sameArp,
  clampArp,
  arpRun,
  arpAuditionSpacingMs,
  arpLabel,
  type ArpDirection,
  type ArpMode,
  type ArpRunResult,
  type ArpSettings,
  secondsPerRow,
  clampMidi,
  clampPoly,
  DEFAULT_POLY,
  keyForSemitone,
  MAX_TRACKS,
  midiToNoteName,
  MIN_TRACKS,
  moveCursor,
  nextWave,
  panLabel,
  patternRows,
  activeScene,
  addScene,
  canPerform,
  clampLiveQuantize,
  DEFAULT_LIVE_QUANTIZE,
  deleteSceneAt,
  duplicateScene,
  liveRowAt,
  MAX_SCENES,
  nextBoundary,
  pendingCue,
  renameSceneAt,
  sameSceneName,
  sceneClip,
  sceneNameProblem,
  sceneStepNotes,
  stepNotes,
  tidySceneName,
  withCue,
  withSceneClip,
  withSceneMachine,
  type LiveCue,
  PIANO_KEY_SEMITONES,
  removeOrder,
  removeTrack,
  chordName,
  copyKey,
  copyVoice,
  createMachine,
  clampHitVelocity,
  clampMachineBeat,
  clampMachineSteps,
  clampPadIndex,
  machineActive,
  defaultPad,
  padAt,
  resizeMachine,
  sameVoice,
  VOICES,
  withPad,
  MAX_PADS,
  DEFAULT_MACHINE_STEPS,
  type DrumMachine,
  type DrumPad,
  cycleScale,
  cycleTonic,
  DEFAULT_VOICE,
  describeChord,
  diatonicChord,
  grooveById,
  isInKey,
  isOrderEmpty,
  keyName,
  MAX_CHORD_DEGREES,
  nextGroove,
  nextHold,
  nextTuning,
  songFromMidi,
  readSoundFont,
  describeFont,
  readNoisletInstrument,
  instrumentFileKind,
  decodeInstrumentText,
  instrumentEntryFor,
  instrumentRows,
  describeInstrument,
  addInstrument,
  selectInstrument,
  removeInstrument,
  activeInstrument,
  findInstrument,
  EMPTY_LIBRARY,
  MAX_ORDER,
  machineBarCount,
  machineBarRows,
  addMachineBar,
  removeMachineBar,
  withMachineBar,
  setMachineOrder,
  clampMachineBar,
  MAX_MACHINE_BARS,
  orderSectionLabels,
  sectionByName,
  withSection,
  rowNotes,
  sameKey,
  scaleById,
  type Notice,
  noticesFor,
  noticesAdded,
  noticeAt,
  noticePosition,
  noticeTag,
  noticeToast,
  setOrderPattern,
  type ScriptSettings,
  songSteps,
  songTempos,
  stepToSlot,
  tidySongTitle,
  TRIAD_SIZE,
  tuningById,
  tuningFor,
  tidyTrackName,
  tidyVoiceName,
  userVoiceFromName,
  voiceById,
  voiceNameFor,
  voiceNameProblem,
  writeChord,
  writeDrum,
  writeNote,
  type Cursor,
  MIN_EFFECT,
  TRACK_EFFECT_BY_ID,
  type Layer,
  type LayerField,
  type TrackEffectId,
  type Pattern,
  type Song,
  type SongKey,
  type SoundFont,
  type InstrumentEntry,
  type InstrumentLibrary,
  type Track,
  type UserVoice,
  type VoiceParamId,
  type VoiceParams,
  type Wave,
} from '../model';
import { loadVoiceLibrary, saveVoiceLibrary } from '../voiceLibrary';
import { loadKitLibrary, saveKitLibrary } from '../kitLibrary';
import { loadSession, saveSession, sessionValue } from '../sessionStore';
import { startMidiInput, type MidiListener } from '../midiIn';
import { PatternGrid } from '../ui/PatternGrid';
import { PianoRoll } from '../ui/PianoRollView';
import { TrackList } from '../ui/TrackList';
import { KeyboardStrip } from '../ui/KeyboardStrip';
import { TransportBar } from '../ui/TransportBar';
import { ScriptPanel } from '../ui/ScriptPanel';
import { HelpOverlay } from '../ui/HelpOverlay';
import { HistoryMenu } from '../ui/HistoryMenu';
import { McpPanel } from '../ui/McpPanel';
import { InstrumentBrowser } from '../ui/InstrumentBrowser';
import { HeaderLine } from '../ui/HeaderLine';
import { PatternTitle } from '../ui/PatternTitle';
import { FileMenu, type FileActionResult } from '../ui/FileMenu';
import { AppearanceMenu } from '../ui/AppearanceMenu';
import { SongMenu } from '../ui/SongMenu';
import { VoiceMenu } from '../ui/VoiceMenu';
import { rememberTheme } from '../themePrefs';
import { pickStoredTextScale, rememberTextScale } from '../textScalePrefs';
import {
  activeTextScale,
  nextTextScale,
  setTextScale,
  textScaleAbout,
  textScaleLabel,
  type TextScale,
} from '../ui/textScale';
import { trackColor } from '../ui/trackColor';
import { laneDrum } from '../ui/stepView';

/**
 * TrackerScene — Tracklet's single screen.
 *
 * It owns the song, the cursor and the undo history (the only mutable app
 * state), and pushes that state into four views: the pattern grid, the channel
 * list, the piano keyboard and the cell inspector. Every input — keyboard,
 * mouse, gamepad — funnels into the same small set of intent methods
 * (`enterNote`, `setSelection`, `togglePlay`, ...), so the mouse and the
 * keyboard can never mean two different things.
 *
 * Navigation reuses the framework's `MenuInputController`, which turns keys and
 * a gamepad into edge events with proper held-repeat. Its WASD bindings are
 * deliberately dropped, because W/A/S/D are piano keys here.
 */

const WIDTH = 720;

/**
 * The Doodadarium's name, as it signs a launch URL. The contract is the
 * launcher's, so the launcher's name is what this app checks for: a URL that
 * says some *other* app opened this tab is not an invitation to leave.
 */
const KIT_LAUNCHER = 'doodadarium';

const LAYOUT = {
  header: { x: 8, y: 8, width: 704, height: 26 },
  tracks: { x: 8, y: 39, width: 150, height: 240 },
  pattern: { x: 166, y: 39, width: 340, height: 240 },
  inspector: { x: 514, y: 39, width: 198, height: 240 },
  piano: { x: 8, y: 284, width: 704, height: 56 },
  transport: { x: 8, y: 345, width: 704, height: 52 },
} satisfies Record<string, Rect>;

const OCTAVE_MIN = 0;
/**
 * The chord control's width, so the note-length control can sit beside it.
 *
 * The two share one row, and the split is unequal because the chord label has
 * more to say (`CHORDS: TRIAD`) than the length one (`HOLD: 4`).
 */
const CHORD_BTN_W = 106;
const OCTAVE_MAX = 7;
const EMPTY_CELL = '...';

/**
 * The CSS family stack for the header wordmark: 'Daydream' (the app's own face,
 * declared in index.html and awaited in main.ts) with the framework's Alagard as
 * a graceful fallback if that file ever fails to load.
 */
const WORDMARK_FONT = "'Daydream', 'Alagard', serif";

/**
 * How much of a notice a toast may hold, in characters.
 *
 * A toast is a badge that grows leftward from the right edge of the screen, so
 * this is a width and not a taste: at the 8px face about 5.7px per character,
 * 74 characters is ~420px, comfortably inside the 720px canvas with the app
 * still visible behind it. Past that the notice is cut to its first sentence,
 * which is the observation without the example it carries.
 */
const NOTICE_TOAST_CHARS = 74;

/**
 * How much of a notice the readout under the header may hold, in characters.
 *
 * Wider than the toast's budget because this line has the whole screen width to
 * grow into — it is right-aligned at the readout's edge and the strip beneath is
 * empty — and narrower than the full sentence because a notice's example is
 * written for a page, not for a strip. The full text is what a click asks for.
 */
const NOTICE_TAG_CHARS = 46;

/**
 * How much of a notice may be SAID when a person asks for it.
 *
 * A asked-for notice gets the whole sentence — its example is the half that says
 * what to do — up to the width of a toast badge that still fits the screen: at
 * about 5.7px per character in the 8px face, 110 characters is ~630px, which
 * grows leftward from the right edge to x≈78 of the 720px canvas.
 */
const NOTICE_ASK_CHARS = 110;

/** Where the notice line sits: the empty strip between the readout and the page band. */
const NOTICE_Y = 29;

/** The header readout's right edge, shared so the notice line lines up with it. */
const HEADER_RIGHT = WIDTH - 12 - PAGE_MENU_WIDTH - 8;

/**
 * The `FIX` button's slot: just right of the readout's own edge, in the same empty
 * strip.
 *
 * It sits to the RIGHT of the words on purpose. The notice line is right-aligned
 * at `HEADER_RIGHT` and grows LEFTWARD, so a button at that edge can never cover
 * the notice, the readout above it, or the tab dropdown in the corner.
 */
const NOTICE_FIX_X = HEADER_RIGHT + 4;
const NOTICE_FIX_W = 46;

/**
 * The inspector's key legend — what the piano keys cannot teach by example.
 *
 * FIVE rows, and that is a measurement rather than a preference: the legend starts
 * at `y + 124` on a 10px pitch and the two buttons at the foot of the panel begin
 * at `y + 174`, so a sixth row is drawn UNDER `SCRIPT` and read by nobody — which
 * is exactly what had happened to the last two rows here until a live look at the
 * panel found them missing. The five that fit are the five a person cannot guess:
 * the arrows move the cursor they are already looking at (and `F3` shows the
 * pattern's order, which is what paging does), so those two rows gave way to
 * `F7 / F8` — the drum lanes are a whole view behind a key nothing else mentions.
 * The menu KEYS themselves are named by `HELP_HINT` on this list's own title row,
 * which is what that hint is for.
 */
const SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ['SPACE', 'PLAY / STOP'],
  ['BKSP / RCLICK', 'CLEAR CELL'],
  ['SHIFT+CLICK', 'RENAME TRACK'],
  ['F4 / F5', 'SOUND / MIX'],
  ['F7 / F8', 'DESIGN / DRUMS'],
];

/**
 * The one line that opens the whole vocabulary.
 *
 * It names the four MENU KEYS rather than what each one does, because the
 * inspector's hint shares its row with the SHORTCUTS title and naming four menu
 * titles does not fit. What each key opens is the first thing F1 lists, and F1
 * is the menu a stuck beginner presses.
 */
const HELP_HINT = 'MENUS  F1-F7 F9-F10';

/**
 * How long a clock may go quiet before the app stops claiming to be in sync.
 *
 * A 40 BPM clock pulses about every 62 ms, so a third of a second is four pulses
 * at the slowest tempo the app allows: a stopped clock, a pulled cable and a
 * sleeping tab all read as "not syncing" well before they could mislead.
 */
const MIDI_SYNC_TIMEOUT_MS = 300;

/**
 * How long the app idles after a change before it autosaves the session.
 *
 * Long enough that holding a key or dragging a fader writes once rather than
 * sixty times, and short enough that the window between a change and a crash is
 * about a second. The write itself is a few kilobytes into `localStorage`.
 */
const SESSION_SAVE_DELAY_MS = 1200;


/**
 * The menu keys, as data, so the seven of them behave identically.
 *
 * `F5` is deliberately NOT here any more, and the reason is structural rather
 * than a preference: every other key in this table opens a WINDOW over the
 * screen, while `F5` now opens a SCREEN. It is read in `handleKey` beside the
 * page switch, so there is one Mixer interface rather than a page and a menu
 * that could disagree about what the mix is.
 */
const MENU_KEYS: Readonly<Record<string, MenuId>> = {
  F1: 'help', F2: 'file', F3: 'song', F4: 'voice', F6: 'instruments', F7: 'patch', F9: 'look',
};

/** The menus that own the keyboard and the screen while they are up. */
type MenuId = 'help' | 'file' | 'song' | 'voice' | 'instruments' | 'patch' | 'look';

/** Everything a single undo step has to restore. */
interface Snapshot {
  song: Song;
  patternIndex: number;
  cursor: Cursor;
}

/**
 * One field of a layer, as the partial change `setTrackLayer` takes.
 *
 * Written this way rather than as `{ [id]: value }` so the compiler keeps
 * proving the value belongs to the field: a knob can only ever be handed a knob's
 * range, and the `wave` a `Wave`. It is three lines instead of one for the same
 * reason every other boundary in this app is careful — the model should not have
 * to re-check what the caller could have got wrong.
 */
function layerChange<K extends keyof Layer>(id: K, value: Layer[K]): Partial<Layer> {
  const change: Partial<Layer> = {};
  change[id] = value;
  return change;
}

export class TrackerScene extends Phaser.Scene {
  private song: Song = createSong();
  private patternIndex = 0;
  private cursor: Cursor = { row: 0, track: 0 };
  private octave = 4;
  private volume = 0.7;
  /** Whether the working session has changed since it was last written out. */
  private sessionDirty = false;
  /** The game time of the last autosave, so a burst of edits writes once. */
  private sessionSavedAt = 0;
  /**
   * The instruments you have imported, and which of them `wave font` plays.
   *
   * Held by the SCENE rather than by the song, on purpose: an instrument is
   * megabytes of somebody else's recordings and a song file is a few kilobytes of
   * text, so writing one into a song would make every song that used it
   * unshareable. A song says `wave font`; which instrument that is depends on
   * what you have imported, exactly as which samples a sampler plays depends on
   * what you loaded into it. Two kinds live here side by side — soundfonts and
   * Noislet exports — because they are the same thing arriving by two roads (see
   * `model/instrumentLibrary.ts`).
   */
  private instruments: InstrumentLibrary = EMPTY_LIBRARY;
  /**
   * The recordings you have loaded, and which of them each channel plays.
   *
   * Held by the SCENE rather than by the song for the reason the instruments are:
   * a sample is megabytes of audio and a song file is a few kilobytes of text, so
   * a song names one (`sample BRK02`) and the app supplies the sound — exactly the
   * division `wave font` already makes. The bank is a few SECONDS of decoded audio
   * per slot (see `model/sample.ts` for the cap), which is what makes keeping it
   * in memory for the session honest rather than hopeful.
   *
   * It is APP STATE, so it is never undone and never saved: a Ctrl+Z that took a
   * recording out of the bank would be a Ctrl+Z that threw away a file the user
   * imported, and the file is still on disk to load again.
   */
  private samples: SampleBank = NO_SAMPLES;
  /**
   * The takes the RECORDER page shows — APP state, beside the bank.
   *
   * A take is the recording DESCRIBED well enough to draw (its length, its peak,
   * and its trim and loop points). Like the bank it never reaches a song file, so
   * there is no field here a Ctrl+Z needs to know about.
   */
  private takes: Take[] = [];
  /** Which take the recorder page is showing. */
  private recordSelected = 0;
  /** True while the take-name box owns the keyboard. */
  private recordRenaming = false;
  /** The capture in progress, if any. */
  private captureSession: CaptureSession | null = null;
  /** The name the running capture will take when it stops. */
  private captureName = '';
  /**
   * The microphones the browser offers, and which one the meter is on.
   *
   * Listed WITHOUT asking for permission — a device list is not a stream — and
   * refreshed after the first granted `getUserMedia`, because the browser withholds
   * the human names until then. APP state, like the takes it serves.
   */
  private micDevices: MicDevice[] = [];
  private micDeviceIndex = 0;
  /**
   * The live input meter, open only between an explicit arm and its release.
   *
   * The page NEVER opens the microphone on its own: the meter is armed by the
   * user clicking it (or by `RECORD`, which needs the input anyway), and released
   * when the page closes, so the red recording light is never on for a screen
   * nobody is looking at.
   */
  private meterSession: MeterSession | null = null;
  /** True when a capture suspended an open meter, so it is re-armed on stop. */
  private meterResume = false;
  /** What the last microphone attempt said (permission refused), or null. */
  private micError: string | null = null;
  /** A throttle so the meter repaints at a readable rate, not every frame. */
  private meterClock = 0;
  /**
   * Whether `HEAR TAKE` loops the take's loop points, or plays it through once.
   * A session switch beside `arpHear`, never song data and never an undo step.
   */
  private loopAudition = true;
  /** The take audition currently sounding, so a new one stops it. */
  private takeAudition: { stop(): void } | null = null;
  private previewOnMove = false;
  /**
   * How many notes one key writes: 0 is normal single-note entry, 3 a triad and
   * 4 a seventh.
   *
   * A number rather than a boolean because the chord SIZE is the only other
   * thing a player needs to say, and folding it into the same control keeps the
   * inspector at one row for chords instead of two. Off by default: a single
   * note is what a tracker does and what a melody needs.
   */
  private chordDegrees = 0;

  private readonly history = new History<Snapshot>();

  private engine!: AudioEngine;
  private grid!: PatternGrid;
  private trackList!: TrackList;
  private keyboard!: KeyboardStrip;
  private transport!: TransportBar;
  private menuInput!: MenuInputController;
  private toast!: Toast;

  /** The notice line under the header readout, and the words you click to walk it. */
  private noticeText!: Phaser.GameObjects.Text;
  private noticeZone!: Phaser.GameObjects.Zone;
  /** The rail: writes the line the notice on screen names. */
  private noticeFixButton!: Button;

  private panels: Panel[] = [];
  private patternPanel!: Panel;
  /** The pattern panel's heading, which names the channel the grid belongs to. */
  private patternTitleView!: PatternTitle;
  /** The rows of the pattern the grid is showing, so the title can be rebuilt. */
  private patternWindow = { first: 0, last: 0 };
  /**
   * Which reading of the pattern the panel is showing (`F8` cycles them). A way of
   * LOOKING at the song, never part of it: no undo step, nothing saved, and a new
   * file opens in the note grid.
   *
   *   notes   the tracker's grid: rows are time, a cell spells its pitch
   *   drums   one row per drum of the cursor's channel (the kit, at a glance)
   *   piano   a PIANO ROLL: time across, pitch up the side
   */
  private patternView: PatternView = 'notes';
  /** The piano roll, drawn in the same panel body as the grid. */
  private rollView: PianoRoll | null = null;
  private headerWordmark!: Phaser.GameObjects.Text;
  private headerLine!: HeaderLine;

  private inspectorTitle!: Phaser.GameObjects.Text;
  private inspectorNote!: Phaser.GameObjects.Text;
  /** How hard the note under the cursor is hit, beside it on the same row. */
  private inspectorVelocity!: Phaser.GameObjects.Text;
  private inspectorArticulation!: Phaser.GameObjects.Text;
  private inspectorSub!: Phaser.GameObjects.Text;
  private inspectorKeyHint!: Phaser.GameObjects.Text;
  private inspectorKeysTitle!: Phaser.GameObjects.Text;
  private inspectorKeys: Phaser.GameObjects.Text[] = [];
  private inspectorDividers: Phaser.GameObjects.Graphics | null = null;
  private hearToggle!: Toggle;
  private chordButton!: Button;
  private holdButton!: Button;
  private undoButton!: Button;
  private redoButton!: Button;
  private scriptButton!: Button;
  private machineButton!: Button;
  private clearButton!: Button;
  private addButton!: Button;
  private delButton!: Button;
  private scriptPanel!: ScriptPanel;
  private mcpPanel!: McpPanel;
  private helpOverlay!: HelpOverlay;
  private instrumentBrowser!: InstrumentBrowser;
  private historyMenu!: HistoryMenu;
  private fileMenu!: FileMenu;
  private songMenu!: SongMenu;
  private voiceMenu!: VoiceMenu;
  private mixerView!: MixerView;
  private drumView!: DrumMachineView;
  private arrangerView!: ArrangerView;
  private liveView!: LiveView;
  private recorderView!: RecorderView;
  private arpView!: ArpView;
  /**
   * Whether the ARP page auditions the run as its dials move — `arp hear on`.
   * A SESSION switch beside `page` and `liveQuantize`, not song data, so it is
   * never banked as an undo step and no file carries it; off by default, so a
   * song opened from disk can never start making noise.
   */
  private arpHear = false;
  /**
   * The timers of the ARP page's running audition, if one is playing.
   *
   * Held rather than fired and forgotten, because a run is played one note at a
   * time and every note after the first is a LIE once the thing it describes has
   * changed: nudge a dial, move the cursor or leave the page and the echo of the
   * old run must stop, not play on over a grid that no longer says that.
   */
  private arpEcho: Phaser.Time.TimerEvent[] = [];
  private pageMenu!: PageMenu;
  /**
   * Which full screen the app is showing — the tracker, or the drum machine.
   *
   * Kept in step with the drum machine view's own `isOpen`: switching the page is
   * how the view is shown and hidden, so there is one answer to "what is on
   * screen" and the tab dropdown and the view cannot disagree.
   */
  private page: PageId = 'tracker';
  private patchMenu!: PatchMenu;
  private appearanceMenu!: AppearanceMenu;
  /**
   * True once a F4 visit has banked its undo step.
   *
   * A sound is something you FIDDLE with — a dozen nudges, then "no, the first
   * one" — so a whole visit to the voice menu is ONE undo step rather than one
   * per nudge. The flag is cleared when the menu opens, so the next visit banks
   * its own.
   */
  private voiceEditRecorded = false;
  /**
   * True once an F7 visit has banked its undo step. See `editPatch`.
   *
   * A stack is something you FIDDLE with for the same reason a sound is — detune
   * it, drop it an octave, turn it down, then "no, not that" — so a whole visit
   * to the design menu is one undo step rather than one per arrow key. The flag
   * is cleared when the menu opens, so the next visit banks its own.
   */
  private patchEditRecorded = false;
  /**
   * The channels being SOLOED, which is listening state and not song data.
   *
   * It lives here rather than on a `Track` for the reason the field above is
   * not a preset: a solo is a question you are asking about the music, not a
   * fact about it. Nothing writes it to a file, Ctrl+Z does not restore it, and
   * it is cleared whenever the song is replaced — a new song that arrived
   * mysteriously silent would read as a broken app however correct the state is.
   */
  private solos: boolean[] = [];
  /**
   * The bars an export renders, as the F3 mark that stands for them.
   *
   * Listening state in the same sense `solos` is state: a loop region is what
   * you are DOING with a song, so it is not in `Song`, nothing writes it to a
   * file, `Ctrl+Z` does not restore it, and it is cleared when the song is
   * replaced. The MARK rather than the region because the `L` key in F3 needs
   * the half-made state too; `bounceRange()` is what everything else asks.
   */
  private bounceMark: BounceMark = NO_BOUNCE;

  /**
   * What has been noticed about the song and already said out loud.
   *
   * The channel's memory: `refreshNotices` compares this with what is true now,
   * so the toast announces a CHANGE rather than the standing state of a song. It
   * also feeds the header's `N NOTICED` readout, which is why it is kept even
   * when nothing is being said.
   */
  private noticed: Notice[] = [];

  /**
   * Which notice the readout is showing, so clicking it walks the list instead
   * of replacing it: a rail you can only read once is a rail nobody reads.
   */
  private noticeCursor = 0;
  /**
   * The loudness an audio export normalises to, in LUFS, or null for none.
   *
   * Listening state in the same sense `bounceMark` is — not part of a song, never
   * written to a file, not touched by `Ctrl+Z` — and the one place it differs from
   * the region, deliberately: a region names BARS of this song and is dropped when
   * the song is replaced, while a target is a LEVEL, which is the thing a person
   * prefers about everywhere their music goes. So a new song keeps it, exactly as
   * it keeps the master `volume`, and `export loud off` is how it is unset. The
   * measurement behind it lives in `audio/lufs.ts`.
   */
  private loudness: number | null = null;
  /**
   * The mixer gesture in progress.
   *
   * The rule itself lives in `mixerBoard`, where it can be tested: a press opens
   * a gesture, the changes inside it share one undo step, and the next press
   * opens another. All this holds is which gesture is running.
   */
  private mixGesture: MixGesture = NO_GESTURE;
  /**
   * The sounds the user has saved, and the reason the F4 menu has a SAVE AS.
   *
   * Loaded once at boot from `localStorage` and written back on every change.
   * It is deliberately NOT part of the song: a song already carries the exact
   * sound of every channel, so a song sounds right whether or not this list
   * exists — this is a shortcut for making the NEXT song, not data a song owns.
   */
  private savedVoices: UserVoice[] = [];
  /**
   * The kits of your own, one scope out from `savedVoices` and for the same
   * reason: a kit is a shortcut for making the NEXT song, not data a song owns.
   * A song names its kit (`song.kit`), the four voices live here, and a name the
   * app does not have plays the four presets — the bargain a missing sample makes
   * and the same one `kitVoice` documents.
   */
  private savedKits: UserKit[] = [];
  /**
   * What MIDI is doing, if anything — the whole of the app's MIDI input state.
   *
   * `off` until somebody asks, because the browser's permission prompt is not
   * something a page should trigger on load, and because this app has to be a
   * perfectly good tracker with no hardware at all. See `model/midiIn.ts` for the
   * three stops and what each one means.
   */
  private midiMode: MidiMode = 'off';
  private midiListener: MidiListener | null = null;
  /** Why there is no input, when the browser or the machine said no. */
  private midiProblem: string | null = null;
  /** The gaps between the last pulses of an external clock, for the tempo. */
  private midiPulseMs: number[] = [];
  private midiLastPulseAt = 0;
  /** The tempo the clock is playing at, or null when nothing is measuring one. */
  private midiClockBpm: number | null = null;
  /** One undo step per TAKE, not per note — see `playMidiNote`. */
  private midiTakeRecorded = false;
  /** The last MIDI word the transport showed, so it is only redrawn on a change. */
  private lastMidiLabel = '';
  private midiStatusAt = 0;
  private inspectorHelpHint!: Phaser.GameObjects.Text;

  /** The last step the playhead drew, so a redraw happens only on a change. */
  private lastPlayStep = -1;
  /** The song bar the drum machine's page last followed, so it follows per bar. */
  private lastFollowSlot = -1;
  /**
   * The pattern the editor was on when playback started.
   *
   * Playback walks the ORDER, which means the pattern view follows the sounding
   * bar — so the editor's own place has to be remembered, or pressing play would
   * silently move the bar you were writing into somewhere else.
   */
  private playHomePattern = 0;
  /**
   * How long a LIVE launch waits, in bars — a SESSION setting, never the song.
   *
   * A scene is song data (`Song.scenes`); how long a launch waits is how somebody
   * is performing, so it lives with the transport rather than in a file, exactly
   * as `solo` and the export region do.
   */
  private liveQuantize: number = DEFAULT_LIVE_QUANTIZE;
  /** PERFORM (the default) refuses song edits; EDIT is entered deliberately. */
  private liveMode: LiveMode = 'perform';
  /** True while the page's scene-name box owns the keyboard. */
  private liveRenaming = false;
  /** The scene whose machine bar the engine is currently placing, or null. */
  private machineScene: number | null = null;
  /**
   * Launches asked for but not yet happened, oldest first.
   *
   * Replaced rather than mutated whenever it changes, so the scheduler's callback
   * — a closure started with the transport — always reads the CURRENT list. That
   * is what lets a launch land on a bar line rather than a race with the clock.
   */
  private liveCues: LiveCue[] = [];
  private themeUnsub: (() => void) | null = null;
  private readonly onKeyDown = (e: KeyboardEvent): void => this.handleKey(e);

  /**
   * The way back to the kit, when the kit is what opened this tab — null when
   * somebody opened Tracklet directly, which is when Escape keeps meaning
   * exactly what it always did: stop the song.
   */
  private kitExit: HostExitPrompt | null = null;
  /**
   * True for the one press the way-out prompt answered itself.
   *
   * Escape and the arrows arrive TWICE in this app by design — once on the
   * keydown, where the menus are routed, and once as an edge from the input
   * controller, which is what moves the cursor. A press the prompt has already
   * answered must not also step the song's cursor or stop playback underneath
   * it, so the prompt reports the press and the edge is dropped.
   */
  private kitExitAteKey = false;

  constructor() {
    super('tracker');
  }

  // --- lifecycle ------------------------------------------------------------

  create(): void {
    // First, because three later steps read it: the SCRIPT panel's live check,
    // the F4 menu's first paint, and a script applied from either.
    this.savedVoices = loadVoiceLibrary();
    // The kits of your own, beside the saved voices and for the same reason: both
    // are the app's, not the song's, so both are read here at boot rather than
    // carried in a file.
    this.savedKits = loadKitLibrary();
    // The text size is the same kind of thing as the theme: this browser's
    // business rather than the song's, read at boot so the first DOM box opened
    // is already the size you asked for.
    setTextScale(pickStoredTextScale());
    this.engine = new AudioEngine({
      trackCount: this.song.tracks.length,
      bpm: this.song.bpm,
      rowsPerBeat: this.song.rowsPerBeat,
      volume: this.volume,
    });

    this.buildChrome();
    this.buildPageMenu();
    this.buildTrackList();
    this.buildGrid();
    this.buildInspector();
    this.buildKeyboard();
    this.buildTransport();
    this.buildScriptPanel();
    this.buildMcpPanel();
    this.buildHelpOverlay();
    this.buildHistoryMenu();
    this.buildInstrumentBrowser();
    this.buildFileMenu();
    this.buildSongMenu();
    this.buildVoiceMenu();
    this.buildMixerView();
    this.buildArranger();
    this.buildLive();
    this.buildRecorder();
    this.buildArp();
    this.buildPatchMenu();
    this.buildAppearanceMenu();
    this.buildDrumMachine();
    this.buildInput();

    this.toast = new Toast(this, { x: WIDTH - 12, y: 281, depth: 950 });
    this.themeUnsub = onThemeChanged(() => this.repaintChrome());

    // Put back what was on screen last time, before the first `syncAll` pushes
    // anything into a view. A session that cannot be read changes nothing.
    this.restoreSession();

    // The way out of the editor, when the kit is what opened this tab. Read
    // from the URL rather than assumed: a Tracklet opened on its own never
    // grows a door it cannot use.
    const launch = readLaunch(window.location.search, KIT_LAUNCHER);
    this.kitExit = launch ? new HostExitPrompt(this, launch) : null;

    this.syncAll();
    this.updateHistoryButtons();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  private teardown(): void {
    this.themeUnsub?.();
    this.input.keyboard?.off('keydown', this.onKeyDown);
    this.kitExit?.destroy();
    this.kitExit = null;
    this.menuInput.destroy();
    this.engine.dispose();
    this.toast.destroy();
    this.helpOverlay.destroy();
    this.historyMenu.destroy();
    this.instrumentBrowser.destroy();
    this.fileMenu.destroy();
    this.songMenu.destroy();
    this.voiceMenu.destroy();
    this.mixerView.destroy();
    this.drumView.destroy();
    this.arrangerView.destroy();
    this.liveView.destroy();
    this.recorderView.destroy();
    this.arpView.destroy();
    this.pageMenu.destroy();
    this.patchMenu.destroy();
    this.appearanceMenu.destroy();
    this.scriptPanel.destroy();
    this.mcpPanel.destroy();
    this.grid.destroy();
    this.rollView?.destroy();
    this.rollView = null;
    this.trackList.destroy();
    this.headerLine.destroy();
    this.patternTitleView.destroy();
    this.keyboard.destroy();
    this.transport.destroy();
    for (const button of [this.scriptButton, this.machineButton, this.clearButton, this.addButton, this.delButton, this.undoButton, this.redoButton]) {
      button.destroy();
    }
    this.hearToggle.destroy();
    this.chordButton.destroy();
    this.holdButton.destroy();
    for (const panel of this.panels) panel.destroy();
    for (const text of this.inspectorKeys) text.destroy();
    this.inspectorKeyHint.destroy();
    this.noticeText.destroy();
    this.noticeZone.destroy();
    this.noticeFixButton.destroy();
  }

  // --- build ----------------------------------------------------------------

  private buildChrome(): void {
    this.cameras.main.setBackgroundColor(cssOf(activeColors().ink));
    this.panels.push(new Panel(this, LAYOUT.header, {}));
    this.panels.push(new Panel(this, LAYOUT.tracks, { title: 'TRACKS' }));
    // The panel's own title is left blank: the heading is drawn by `PatternTitle`
    // instead, because it has to be a control (shift-click renames the channel)
    // and a `Panel` title is a static Text. The panel still draws its header rule.
    this.patternPanel = new Panel(this, LAYOUT.pattern, { title: '' });
    this.panels.push(this.patternPanel);
    this.panels.push(new Panel(this, LAYOUT.inspector, { title: 'THIS CELL' }));
    this.panels.push(new Panel(this, LAYOUT.piano, { title: 'PIANO - CLICK A KEY OR TYPE' }));
    this.panels.push(new Panel(this, LAYOUT.transport, {}));

    this.headerWordmark = uiText(this, 16, 10, 'TRACKLET', {
      size: 13, font: 'alagard', color: activeTheme().colors.wordmark,
    });
    // uiText's `font` option is the framework's two faces only, so the wordmark
    // swaps in Tracklet's own family after the fact (see WORDMARK_FONT).
    this.headerWordmark.setFontFamily(WORDMARK_FONT);
    // The song title replaces the tagline, just past the measured wordmark.
    // The readout keeps its right edge beside the page dropdown.
    const songTitleX = Math.round(this.headerWordmark.x + this.headerWordmark.width + 10);
    this.patternTitleView = new PatternTitle(this, {
      x: LAYOUT.pattern.x + 4,
      y: LAYOUT.pattern.y + 2,
      width: LAYOUT.pattern.width - 10,
      handlers: {
        onRename: (name) => this.renameTrack(this.cursor.track, name),
        onEditingChange: () => this.syncInputMode(),
        onHint: () => this.toast.show('SHIFT+CLICK TO RENAME THE CHANNEL', activeColors().textDim),
      },
    });
    // ── The notice line ────────────────────────────────────────────────────
    // What has been noticed about this song, on the strip under the readout.
    // That strip is the one band of the screen with nothing in it in any state:
    // the wordmark and the readout sit above it and the page band starts below,
    // so this costs the layout nothing and needs no room taken from anything.
    //
    // It is right-aligned at the readout's own edge, so it reads as the last line
    // of the summary rather than as a second thing up there, and it is drawn ONLY
    // when there is something to say — which is what makes its presence mean
    // "somebody noticed something" rather than "this is a label".
    this.noticeText = uiText(this, HEADER_RIGHT, NOTICE_Y, '', {
      size: 8, color: activeColors().ward, origin: { x: 1, y: 0 },
    });
    this.noticeZone = this.add.zone(HEADER_RIGHT, NOTICE_Y, 10, 10).setOrigin(1, 0).setInteractive();
    this.noticeZone.on('pointerdown', () => this.nextNotice());
    this.noticeZone.disableInteractive();
    // The rail, to the right of the words so it can never cover them: press it
    // and the line the notice names is written, as one undo step.
    this.noticeFixButton = new Button(this, {
      x: NOTICE_FIX_X, y: NOTICE_Y - 4, width: NOTICE_FIX_W, height: 14,
    }, 'FIX', { size: 8 });
    this.noticeFixButton.onPress = () => this.applyNoticeFix();
    this.noticeFixButton.container.setVisible(false);

    this.headerLine = new HeaderLine(this, {
      right: HEADER_RIGHT,
      y: 14,
      minX: songTitleX,
      handlers: {
        onRename: (title) => this.renameSong(title),
        onEditingChange: () => this.syncInputMode(),
        onHint: () => this.toast.show('SHIFT+CLICK TO RENAME THE SONG', activeColors().textDim),
      },
    });
  }

  private buildTrackList(): void {
    const body = this.panels[1].body;
    this.trackList = new TrackList(
      this,
      { x: body.x, y: body.y, width: body.width, height: body.height - 30 },
      this.song.tracks,
      {
        onSelect: (i) => this.selectTrack(i),
        onToggleMute: (i) => this.toggleMute(i),
        onCycleWave: (i) => this.cycleWave(i),
        onRename: (i, name) => this.renameTrack(i, name),
        onEditingChange: () => this.syncInputMode(),
      },
    );

    const btnY = body.y + body.height - 22;
    const half = Math.floor((body.width - 6) / 2);
    this.addButton = new Button(this, { x: body.x, y: btnY, width: half, height: 20 }, '+ ADD', { size: 8 });
    this.addButton.onPress = () => this.addChannel();
    this.delButton = new Button(this, { x: body.x + half + 6, y: btnY, width: body.width - half - 6, height: 20 }, '- DEL', { size: 8 });
    this.delButton.onPress = () => this.removeChannel();
  }

  private buildGrid(): void {
    this.grid = new PatternGrid(
      this,
      this.patternPanel.body,
      this.currentPattern,
      {
        onPick: (row, track) => this.setSelection({ row, track }),
        onSecondaryPick: (row, track) => this.clearCellAt({ row, track }),
        onLane: (row, lane) => this.writeLane(row, lane),
        onSecondaryLane: (row, lane) => this.clearLane(row, lane),
        onOverview: (row) => this.setSelection({ row, track: this.cursor.track }),
        onWindow: (first, last) => this.updatePatternTitle(first, last),
      },
      {
        trackNames: this.song.tracks.map((t) => t.name),
        rowsPerBeat: this.song.rowsPerBeat,
      },
    );

    // The PIANO ROLL, drawn in the same panel body and hidden until `F8` cycles
    // to it. A separate view rather than a mode of the grid because its geometry
    // is transposed: the grid's row a step and column a channel become a row a
    // pitch and a column a step, which is a different painter, not a setting.
    this.rollView = new PianoRoll(this, this.patternPanel.body, this.currentPattern, this.song.key, {
      onPick: (step, midi) => this.writeRollNote(step, midi),
      onSecondaryPick: (step, midi) => this.clearRollNote(step, midi),
    });
  }

  /**
   * Say which slice of a long pattern is on screen, and — the heading's real job
   * now — WHICH CHANNEL the grid belongs to. A 512-step pattern is 32 screens
   * tall, so "where am I" needs the range; the channel is the name the heading
   * shows and, in every reading, the channel whose rows or kit or roll is drawn.
   *
   * The two views that show one channel already named it (`KIT  LEAD`), because a
   * lane of `KCK/SNR/HAT/WND` cannot say whose kit it is. The note view said the
   * literal word `PATTERN` until the heading became the channel's own name, so
   * all three now answer the same question the same way — and the name is the
   * thing a shift-click renames.
   */
  private updatePatternTitle(first: number, last: number): void {
    this.patternWindow = { first, last };
    const total = this.currentPattern.steps.length;
    const range = last - first + 1 >= total ? '' : `ROWS ${first}-${last} OF ${total}`;
    const channel = this.song.tracks[this.cursor.track]?.name ?? `CH ${this.cursor.track + 1}`;
    const title = this.patternView === 'drums'
      ? withRange(`KIT  ${channel}`, range)
      : this.patternView === 'piano'
        ? withRange(`PIANO  ${channel}`, range)
        : withRange(channel, range);
    this.patternTitleView.setText(title);
  }

  private buildInspector(): void {
    const body = this.panels[3].body;
    const c = activeColors();
    const x = body.x;
    const y = body.y;
    const w = body.width;

    this.inspectorTitle = uiText(this, x, y + 2, 'NOW WRITING', { size: 8, color: c.textDim });
    // The note read-out uses the UI face rather than the blackletter display
    // face: a blackletter C and E are near-identical at a glance, and this is
    // the one label in the app where misreading a glyph changes what you play.
    this.inspectorNote = uiText(this, x, y + 13, EMPTY_CELL, {
      size: 14, color: c.textDim,
    });
    // The velocity rides beside the note rather than under it: the note's own row
    // is the only one with width to spare, and "how hard is this one hit" is a
    // question about the note itself rather than about the channel.
    this.inspectorVelocity = uiText(this, x + w, y + 17, '', {
      size: 8, color: c.textDim, origin: { x: 1, y: 0 },
    });
    // How the note is PLAYED rides the CAPTION row, right-aligned, at the far end
    // from the word `NOW WRITING`. The two characters in front are the KEYS and
    // the spelling at once — press `>` and the cell says `>` — which is the same
    // trick the velocity's `[ ]` plays.
    //
    // It sat beside the velocity's own row until a live look at the panel found
    // the two drawn on top of each other: four pixels apart, both right-aligned
    // at the same edge, so `> * ART --` and `[ ] VEL 40%` interleaved into a
    // smear nobody could read. The note's row is 17 pixels tall at size 14 and
    // the sub-line below it is 4 pixels further down, so exactly ONE of the two
    // read-outs can live there; the caption row above was empty all along, and
    // the two settings now read as two lines rather than one collision.
    this.inspectorArticulation = uiText(this, x + w, y + 4, '', {
      size: 8, color: c.textDim, origin: { x: 1, y: 0 },
    });
    this.inspectorSub = uiText(this, x, y + 31, '', { size: 8, color: c.textDim });
    this.inspectorKeyHint = uiText(this, x, y + 42, '', { size: 8, color: activeTheme().colors.ooze });


    this.inspectorDividers = this.add.graphics();

    this.hearToggle = new Toggle(this, { x, y: y + 60, width: w, height: 11 }, {
      label: 'HEAR NOTES AS I MOVE', value: this.previewOnMove,
    });
    this.hearToggle.onChange = (on) => { this.previewOnMove = on; };

    // The chord control sits right under the hear toggle because the two answer
    // the same question — "what happens when I press a key" — and a beginner who
    // finds one should find the other. It is a BUTTON rather than a checkbox
    // because it has three states and a mode needs an off switch: press it to
    // cycle OFF -> TRIAD -> 7TH -> OFF, and the label always says where you are.
    this.chordButton = new Button(this, { x, y: y + 72, width: CHORD_BTN_W, height: 12 }, this.chordLabel(), { size: 8 });
    this.chordButton.onPress = () => this.cycleChordDegrees();
    // How long notes ring on the SELECTED channel. It shares the chord control's
    // row because the two answer the same kind of question — "what comes out
    // when I write here" — and one row of two press-to-cycle buttons costs the
    // inspector no space at all.
    this.holdButton = new Button(this, { x: x + CHORD_BTN_W + 4, y: y + 72, width: w - CHORD_BTN_W - 4, height: 12 }, this.holdLabel(), { size: 8 });
    this.holdButton.onPress = () => this.cycleHold();

    const half = Math.floor((w - 6) / 2);
    this.undoButton = new Button(this, { x, y: y + 90, width: half, height: 18 }, 'UNDO', { size: 8 });
    this.undoButton.onPress = () => this.undo();
    this.redoButton = new Button(this, { x: x + half + 6, y: y + 90, width: w - half - 6, height: 18 }, 'REDO', { size: 8 });
    this.redoButton.onPress = () => this.redo();

    // The legend grows a row at a time with `SHORTCUTS`; 10px apart is still
    // legible at this size and leaves a margin rather than an overlap.
    this.inspectorKeysTitle = uiText(this, x, y + 114, 'SHORTCUTS', { size: 8, color: c.textDim });
    // The legend is deliberately short, so the section header points at the page
    // that lists every control. It rides the title's own line, which is the one
    // row with width going spare.
    this.inspectorHelpHint = uiText(this, x + w, y + 114, HELP_HINT, {
      size: 8, color: activeTheme().colors.ooze, origin: { x: 1, y: 0 },
    });
    let rowY = y + 124;
    for (const [keys, action] of SHORTCUTS) {
      this.inspectorKeys.push(uiText(this, x, rowY, keys, { size: 8, color: activeTheme().colors.ooze }));
      this.inspectorKeys.push(uiText(this, x + 76, rowY, action, { size: 8, color: c.textPrimary }));
      rowY += 10;
    }

    const btnY = body.y + body.height - 46;
    // SCRIPT and MACHINE share the row: they are the two ways to say something
    // the grid cannot, and putting them side by side means the drum machine is
    // found by anyone who found the script box.
    const halfBtn = Math.floor((w - 6) / 2);
    this.scriptButton = new Button(this, { x, y: btnY, width: halfBtn, height: 20 }, 'SCRIPT', { size: 8 });
    this.scriptButton.onPress = () => this.openScript();
    this.machineButton = new Button(this, { x: x + halfBtn + 6, y: btnY, width: w - halfBtn - 6, height: 20 }, 'MACHINE', { size: 8 });
    this.machineButton.onPress = () => this.openDrumMachine();
    this.clearButton = new Button(this, { x, y: btnY + 24, width: w, height: 20 }, 'CLEAR PATTERN', { size: 8 });
    this.clearButton.onPress = () => this.clearPatternAction();

    this.drawInspectorDividers();
  }

  private drawInspectorDividers(): void {
    const body = this.panels[3].body;
    const g = this.inspectorDividers;
    if (!g) return;
    const c = activeColors();
    g.clear();
    for (const dy of [58, 87, 112]) {
      g.fillStyle(c.stone, 0.5);
      g.fillRect(body.x, body.y + dy, body.width, 1);
      g.fillStyle(c.ink, 0.6);
      g.fillRect(body.x, body.y + dy + 1, body.width, 1);
    }
  }

  private buildKeyboard(): void {
    this.keyboard = new KeyboardStrip(this, this.panels[4].body, {
      onKeyPress: (midi) => (this.chordDegrees > 0 ? this.enterChord(midi) : this.enterNote(midi)),
      onOctaveDown: () => this.setOctave(this.octave - 1),
      onOctaveUp: () => this.setOctave(this.octave + 1),
    }, { octave: this.octave, key: this.song.key });
  }

  private buildTransport(): void {
    this.transport = new TransportBar(this, this.panels[5].body, {
      onPlay: () => this.startPlayback(),
      onStop: () => this.stopPlayback(),
      onTempo: (bpm) => this.setTempo(bpm),
      onVolume: (v) => this.setVolume(v),
      onSwing: (s) => this.setSwing(s),
      onPatternPrev: () => this.shiftPattern(-1),
      onPatternNext: () => this.shiftPattern(1),
      onTonicStep: (delta) => this.stepTonic(delta),
      onScaleCycle: () => this.cycleScale(),
      onGrooveCycle: () => this.cycleGroove(),
    }, {
      bpm: this.song.bpm,
      volume: this.volume,
      swing: this.song.swing,
      groove: this.song.groove,
      patternLabel: this.patternLabel(),
      key: this.song.key,
    });
  }

  /**
   * The SCRIPT modal. Built once and kept hidden: it floats a DOM textarea over
   * the canvas, so tearing it down and rebuilding it per open would leak the
   * element and re-measure the canvas every time.
   */
  private buildScriptPanel(): void {
    this.scriptPanel = new ScriptPanel(
      this,
      {
        onApply: (source) => this.applyScriptAction(source),
        onOpenChange: () => this.syncInputMode(),
        onMcp: () => this.openMcp(),
      },
      {
        trackCount: this.trackCount,
        rows: patternRows(this.song),
        rowsPerBeat: this.song.rowsPerBeat,
        voices: this.savedVoices,
        // The song's own names, so the live check accepts `arrange VERSE` in a
        // script that never wrote `section VERSE` — the box checks against the
        // same context APPLY does, which is the whole point of one type.
        sections: this.song.sections,
        // And its own groups, so `track 2 bus DRUMS` is accepted against a bus the
        // song already has rather than only one the script just wrote.
        buses: this.song.buses,
        // And its chord loop, so a follower is accepted against the loop the song
        // already has — the box checks against the same context APPLY does.
        progression: this.song.progression,
      },
    );
  }

  /**
   * The MCP page: what the SCRIPT box's MCP button opens.
   *
   * Read-only apart from its two buttons, so it needs no callbacks beyond the
   * input-mode one — the panel asks the agent server for its own status, and the
   * scene never has to know whether one is running.
   */
  private buildMcpPanel(): void {
    this.mcpPanel = new McpPanel(this, {
      onOpenChange: () => this.syncInputMode(),
    });
  }

  /**
   * The F1 menu. Built once and kept hidden, like the script modal: it is a
   * fixed page of copy, so it is laid out at boot rather than on the keystroke
   * someone reaches for when they are already stuck.
   */
  private buildHelpOverlay(): void {
    this.helpOverlay = new HelpOverlay(this, {
      onOpenChange: () => this.syncInputMode(),
    });
  }

  /**
   * The F10 menu: the undo timeline, as a list you can jump back to.
   *
   * It reads the history stack through getters rather than holding a copy, the
   * way the order menu reads the song: a list that cached its rows could show a
   * step the app has since undone away. Jumping runs the SAME `undo` the `Ctrl+Z`
   * key runs, once per step, so the two cannot disagree about what the past is.
   */
  private buildHistoryMenu(): void {
    this.historyMenu = new HistoryMenu(this, {
      onOpenChange: () => this.syncInputMode(),
      steps: () => this.history.states(),
      current: () => this.snapshot(),
      goTo: (back) => this.jumpHistory(back),
    });
  }

  /**
   * The F6 menu: the instrument vocabulary as a browsable page.
   *
   * Read-only, so it needs no callbacks beyond the input-mode one — every word
   * on it comes from the catalog, which the model's own tables build. It is a
   * look at what the app HAS, which is the one question F4 cannot answer.
   */
  private buildInstrumentBrowser(): void {
    this.instrumentBrowser = new InstrumentBrowser(this, {
      onOpenChange: () => this.syncInputMode(),
    });
  }

  /**
   * The F2 menu. It owns the DOM half of file handling — the picker and the
   * download — and calls back here for the part that needs the song: making a
   * blank one, installing a parsed one, and serialising the current one.
   *
   * The two save formats and the master volume cross that boundary as TEXT, so
   * the menu never learns what a `Song` is and the model never learns what a
   * browser is.
   */
  private buildFileMenu(): void {
    this.fileMenu = new FileMenu(this, {
      onOpenChange: () => this.syncInputMode(),
      newSong: () => this.newSongAction(),
      drumMachine: () => this.drumMachineAction(),
      startGenre: (id) => this.startGenreAction(id),
      openFile: (name, text) => this.openFileAction(name, text),
      openMidi: (name, bytes) => this.openMidiAction(name, bytes),
      openSoundFont: (name, bytes) => this.openSoundFontAction(name, bytes),
      openInstrument: (name, text) => this.openInstrumentAction(name, text),
      openSample: (name, bytes) => this.openSampleAction(name, bytes),
      samples: () => sampleRows(this.samples, this.song.tracks[this.cursor.track]?.sample ?? null),
      useSample: (id) => this.useSampleAction(id),
      removeSample: (id) => this.removeSampleAction(id),
      instruments: () => instrumentRows(this.instruments),
      useInstrument: (id) => this.useInstrumentAction(id),
      removeInstrument: (id) => this.removeInstrumentAction(id),
      scriptText: () => songToScript(this.song, { volume: this.volume }),
      jsonText: () => songToJson(this.song, { volume: this.volume }),
      fileStem: () => songFileStem(this.song.title),
      bounceLabel: () => bounceLabel(this.bounceRange(), this.song.order.length),
      clearBounce: () => this.clearBounceAction(),
      loudLabel: () => loudLabel(this.loudnessTarget()),
      cycleLoudness: () => this.cycleLoudnessAction(),
      patchTarget: () => this.song.tracks[this.cursor.track]?.name ?? 'NO CHANNEL',
      patchFile: () => this.patchFile(),
      openPatch: (name, text) => this.openPatchAction(name, text),
      kitName: () => this.kitSaveName(),
      kitFile: () => this.kitFile(),
      openKit: (name, text) => this.openKitAction(name, text),
      midiLabel: () => this.midiLabel(),
      cycleMidi: () => this.cycleMidiAction(),
      audioFile: () => this.renderAudioFile(),
      stemsFile: () => this.stemsFile(),
      midiFile: () => this.midiFile(),
    });
  }

  /**
   * The F9 menu: which of the framework's themes the app wears.
   *
   * The framework applies a theme itself (`applyThemeRow`), and every view here
   * already listens for that and repaints, so the only thing left for the scene
   * to do is REMEMBER it — and that is deliberately the scene's job rather than
   * the menu's, because where a preference lives is app policy, not a view's.
   */
  private buildAppearanceMenu(): void {
    this.appearanceMenu = new AppearanceMenu(this, {
      onOpenChange: () => this.syncInputMode(),
      onThemeApplied: (id) => { rememberTheme(id, THEME_IDS); },
      onCycleTextScale: () => this.cycleTextScale(),
    });
  }

  /**
   * Advance the app's text size, and remember it.
   *
   * The scene is the writer because remembering a preference is the app's
   * business rather than a view's — the same split the theme uses. It answers
   * with the size it landed on, because the F9 menu's own button is the only
   * read-out visible above that modal's curtain (a toast would be behind it).
   * The LIVE value is module state in `ui/textScale.ts`, and the boxes that read
   * it measure themselves from it, so the next box opened is the new size.
   */
  private cycleTextScale(): TextScale {
    const next = nextTextScale(activeTextScale());
    setTextScale(next);
    rememberTextScale(next);
    this.toast.show(`TEXT ${textScaleLabel(next)}  \u00b7  ${textScaleAbout(next)}`, activeColors().ward);
    return next;
  }

  /**
   * The F3 menu: the song's order, as bars you can add, remove and repoint.
   *
   * Every edit comes back here, because the scene owns the song and the undo
   * history: the menu asks, the scene records one step and refreshes every view,
   * and the menu reads the result back. A refusal (removing the only bar, say)
   * comes back as the words to show under the list.
   */
  private buildSongMenu(): void {
    this.songMenu = new SongMenu(this, {
      onOpenChange: () => this.syncInputMode(),
      song: () => this.song,
      bounce: () => this.bounceMark,
      markBounce: (bar) => this.markBounceAction(bar),
      addBar: () => this.addBarAction(),
      removeBar: (index) => this.removeBarAction(index),
      setBarPattern: (index, pattern) => this.setBarPatternAction(index, pattern),
      goToBar: (index) => this.goToBarAction(index),
      cycleTuning: () => this.cycleTuning(),
      cycleSectionMachine: (index) => this.cycleSectionMachineAction(index),
    });
  }

  /**
   * The F4 menu: what a channel SOUNDS like — a named voice, or the seven knobs
   * that turn one into another instrument.
   *
   * Every edit comes back here for the same reason the order menu's do: the
   * scene owns the song, the undo history and the audio graph, so the menu asks
   * and the scene changes one thing in one place. The menu also reads the
   * channel back through a getter, so it can never show a sound the song does
   * not have.
   */
  private buildVoiceMenu(): void {
    this.voiceMenu = new VoiceMenu(this, {
      onOpenChange: (open) => {
        // A new visit, a new undo step: the flag is what keeps the WHOLE visit
        // to one, and it has to be cleared before the first nudge, not after.
        if (open) this.voiceEditRecorded = false;
        this.syncInputMode();
      },
      channels: () => this.trackCount,
      voice: () => {
        const track = this.song.tracks[this.cursor.track];
        return {
          index: this.cursor.track,
          name: track?.name ?? 'TRACK',
          params: track?.voice ?? DEFAULT_VOICE,
        };
      },
      onEditingChange: () => this.syncInputMode(),
      selectChannel: (index) => this.selectTrack(index),
      applyVoice: (name) => this.applyVoiceAction(name),
      setKnob: (id, value) => this.setKnobAction(id, value),
      setWave: (wave) => this.setWaveAction(wave),
      sound: () => this.song.tracks[this.cursor.track] ?? { voice: DEFAULT_VOICE, stack: [] },
      // Through `toggleMenu` rather than `patchMenu.show()`, so the swap the user
      // just asked for goes the same way every other menu swap does: all of them
      // closed, the input mode recomputed once, and the design screen opened on
      // the channel the cursor is already in.
      openDesign: () => this.toggleMenu('patch'),
      glide: () => this.song.tracks[this.cursor.track]?.glide ?? 0,
      setGlide: (value) => this.setExpressionAction('glide', value),
      vibrato: () => this.song.tracks[this.cursor.track]?.vibrato ?? 0,
      setVibrato: (value) => this.setExpressionAction('vibrato', value),
      audition: () => this.auditionVoice(),
      savedVoices: () => this.savedVoices,
      saveVoice: (name) => this.saveVoiceAction(name),
      removeVoice: (name) => this.removeVoiceAction(name),
    });
  }

  /**
   * The MIXER page: the mix, as a screen rather than a menu.
   *
   * Every control comes back here for the same reason F4's and F7's do — the
   * scene owns the song, the undo history and the audio graph, so the view asks
   * and the scene changes one thing in one place. What distinguishes this page
   * from the menus is the undo bargain: a menu visit is ONE step because a menu
   * is visited briefly, while a mixer is used for an evening — so it is one step
   * per GESTURE (`beginEdit`), which makes a fader drag one Ctrl+Z and a session
   * of balancing many. Solo is the exception, as everywhere: it is listening
   * state, so it costs nothing at all.
   */
  private buildMixerView(): void {
    this.mixerView = new MixerView(this, {
      onOpenChange: (open) => {
        // A new visit starts a new gesture, so the first change banks its step.
        this.mixGesture = beginGesture();
        this.page = open ? 'mixer' : 'tracker';
        this.pageMenu?.render();
        this.syncInputMode();
      },
      trackCount: () => this.trackCount,
      track: (index) => this.song.tracks[index],
      selectedChannel: () => this.cursor.track,
      select: (index) => this.selectMixerChannel(index),
      solos: () => this.solos,
      beginEdit: () => this.beginMixEdit(),
      setLevel: (index, level) => this.setLevelAction(index, level),
      setPan: (index, pan) => this.setPanAction(index, pan),
      setSend: (index, which, amount) => this.setSendAction(index, which, amount),
      setDuck: (index, amount) => this.setDuckAction(index, amount),
      setEffect: (index, id, amount) => this.setTrackEffectAction(index, id, amount),
      setBus: (index, name) => this.setBusAction(index, name),
      toggleMute: (index) => this.toggleMute(index),
      toggleSolo: (index) => this.toggleSolo(index),
      audition: (index) => this.auditionTrack(index),
      buses: () => this.song.buses,
      setBusLevel: (name, level) => this.setBusLevelAction(name, level),
      addBus: () => this.addBusAction(),
      room: () => ({ reverb: this.song.reverb, echo: this.song.echo }),
      setRoom: (reverb, echo) => this.setRoomAction(reverb, echo),
      // The mix's own effects: song data like the room, so they go through the
      // same door and cost the same gesture's step.
      master: () => clampEffects(this.song.master),
      setMasterEffect: (id, amount) => this.setMasterEffectAction(id, amount),
      machine: () => this.song.machine,
      // Every machine control goes through the per-gesture variant, so dragging
      // the machine's fader is one Ctrl+Z exactly as a channel's is.
      setMachineMix: (id, value) => this.setMachineMixAction(id, value, true),
      setMachineEnabled: (on) => this.setMachineEnabledAction(on, true),
      setMachineBus: (name) => this.setMachineBusAction(name, true),
      setMachineEffect: (id, amount) => this.setMachineEffectAction(id, amount, true),
      auditionMachine: () => this.auditionMachinePad(1),
      playing: () => this.engine.playing,
      togglePlay: () => this.togglePlayAction(),
      close: () => this.setPage('tracker'),
    });
  }

  /**
   * Select a channel FROM the mixer.
   *
   * A track moves the tracker's own cursor, so the two screens agree about
   * which channel is selected — there is one selection in the app, not one per
   * page. The drum machine is not a track, so selecting its column changes
   * nothing but the mixer's own highlight.
   */
  private selectMixerChannel(index: number): void {
    if (index === MACHINE_CHANNEL) return;
    this.selectTrack(index);
  }

  /**
   * The DRUM MACHINE tab: a pad grid you draw a beat on.
   *
   * Every edit comes back here, the way F4's and F5's do — the scene owns the
   * song, the undo history and the audio graph, so the view asks and the scene
   * changes one thing in one place. Unlike those menus, whose whole visit is one
   * undo step, the machine takes one step PER CLICK: drawing a beat is a series of
   * separate decisions rather than one thing fiddled with, and a person who puts a
   * hit in the wrong cell wants that hit back, not the drum figure.
   */
  private buildDrumMachine(): void {
    this.drumView = new DrumMachineView(this, {
      onOpenChange: (open) => {
        // The view opening and closing IS the page changing: one answer to "what
        // is on screen", so the tab dropdown and the view cannot disagree.
        this.page = open ? 'machine' : 'tracker';
        this.pageMenu?.render();
        this.syncInputMode();
      },
      machine: () => this.song.machine,
      setHit: (pad, step, velocity, bar) => this.setMachineHitAction(pad, step, velocity, bar),
      addBar: () => this.addMachineBarAction(),
      removeBar: () => this.removeMachineBarAction(),
      setOrder: (order) => this.setMachineOrderAction(order),
      songBeat: () => this.resolvedMachineBeat(),
      setMix: (id, value) => this.setMachineMixAction(id, value),
      setEnabled: (on) => this.setMachineEnabledAction(on),
      setSteps: (steps) => this.setMachineStepsAction(steps),
      setBeat: (beat) => this.setMachineBeatAction(beat),
      addPad: () => this.addMachinePadAction(),
      removePad: () => this.removeMachinePadAction(),
      setPadMix: (pad, id, value) => this.setMachinePadMixAction(pad, id, value),
      stepPadPitch: (pad, delta) => this.stepMachinePadPitchAction(pad, delta),
      setPadPitch: (pad, value) => this.setMachinePadPitchAction(pad, value),
      setPadVoice: (pad, id, value) => this.setMachinePadVoiceAction(pad, id, value),
      cyclePadVoice: (pad, direction) => this.cycleMachinePadVoiceAction(pad, direction),
      audition: (pad) => this.auditionMachinePad(pad),
      playing: () => this.engine.playing,
      togglePlay: () => this.togglePlayAction(),
    });
  }

  /**
   * The tab dropdown: which full screen the app is showing.
   *
   * The screens are named here rather than in the view, because which pages the
   * app HAS is the app's business — `PageMenu` only draws the list it is handed.
   * Adding a page later is one more line here and one more scene that answers the
   * same callbacks, which is the whole reason the switcher is a list and not a
   * fixed row of keys.
   */
  private buildPageMenu(): void {
    this.pageMenu = new PageMenu(this, {
      rows: (): PageRow[] => [...PAGE_ROWS],
      current: () => this.page,
      select: (id) => this.setPage(id),
    });
  }

  /** Show one of the app's full screens, or stay where we are if it is already up. */
  private setPage(id: PageId): void {
    if (id === this.page) return;
    // Any text box is committed first, so a name typed but not confirmed is kept
    // when the screen changes rather than silently dropped.
    this.trackList.commitRename();
    this.headerLine.commit();
    this.patternTitleView.commit();
    // Both pages are hidden first, so a switch is never two screens at once;
    // the one being opened then sets the page through its own `onOpenChange`,
    // which is what keeps the dropdown and the visible page from disagreeing.
    this.drumView.hide();
    this.mixerView.hide();
    this.arrangerView.hide();
    this.liveView.hide();
    this.recorderView.hide();
    this.arpView.hide();
    if (id === 'machine') this.openDrumMachine();
    else if (id === 'mixer') this.openMixer();
    else if (id === 'arranger') this.openArranger();
    else if (id === 'live') this.openLive();
    else if (id === 'recorder') this.openRecorder();
    else if (id === 'arp') this.openArp();
    this.pageMenu.render();
  }

  /**
   * Open the MIXER page.
   *
   * Nothing is created on the way in, deliberately: every song already HAS a mix
   * (a level, a place, a room), so this page has something to show the moment a
   * song exists — unlike the drum machine page, which has to grow a machine for a
   * song that has none before it has anything to draw.
   */
  private openMixer(): void {
    this.trackList.commitRename();
    this.headerLine.commit();
    this.patternTitleView.commit();
    this.scriptPanel.close();
    this.voiceMenu.hide();
    this.fileMenu.hide();
    this.songMenu.hide();
    this.patchMenu.hide();
    this.appearanceMenu.hide();
    this.helpOverlay.hide();
    this.instrumentBrowser.hide();
    this.mixerView.show();
  }

  /** F5: the mix, as a page. The same key leaves it again. */
  private toggleMixerPage(): void {
    this.setPage(this.mixerView.isOpen ? 'tracker' : 'mixer');
  }

  /**
   * The ARRANGER page: the song's bars, its form, its movement.
   *
   * Built once in `create` and shown on demand, like the mixer — nothing is
   * created on the way in, because every song already HAS bars, a form and a mix
   * of movement, so the page has something to draw the moment it opens.
   */
  private buildArranger(): void {
    this.arrangerView = new ArrangerView(this, {
      onOpenChange: (open) => {
        // The view opening and closing IS the page changing: one answer to "what
        // is on screen", so the dropdown and the view cannot disagree.
        this.page = open ? 'arranger' : 'tracker';
        this.pageMenu?.render();
        this.syncInputMode();
      },
      song: () => this.song,
      trackCount: () => this.trackCount,
      selectedChannel: () => this.cursor.track,
      select: (index) => this.selectTrackAt(index),
      exportRegion: () => this.bounceRange(),
      playing: () => this.engine.playing,
      togglePlay: () => this.togglePlayAction(),
      close: () => this.setPage('tracker'),
      lanes: () => this.song.automation,
      // The page banks one undo step at the start of a gesture (a key press, or a
      // drag's pointer-down); the moves inside it land in that step.
      beginLaneEdit: () => this.record(),
      setLane: (index, lane) => this.setLaneAction(index, lane),
      addLane: (track, target) => this.addLaneAction(track, target),
      removeLane: (index) => this.removeLaneAction(index),
    });
  }

  /**
   * Replace one automation lane, or append it when the index is past the end.
   *
   * No undo step of its own: the arranger banks one at the start of a gesture, so
   * a whole drag is a single Ctrl+Z. The list order is kept as written — it is
   * what decides which of two overlapping lanes wins — so the selection does not
   * jump while a lane is dragged past another.
   */
  private setLaneAction(index: number, lane: AutomationLane): void {
    const next = tidyLane(lane);
    const lanes = this.song.automation.slice();
    if (index >= 0 && index < lanes.length) lanes[index] = next;
    else lanes.push(next);
    this.song.automation = lanes;
    this.commitLanes();
  }

  /** Add a lane for a channel and target, spanning the whole song; one undo step. */
  private addLaneAction(track: number, target: AutomationTargetId): string {
    if (this.song.automation.length >= MAX_AUTOMATION_LANES) {
      return `A SONG HOLDS AT MOST ${MAX_AUTOMATION_LANES} LANES.`;
    }
    const info = AUTOMATION_TARGET_BY_ID[target];
    this.record();
    const bars = Math.max(1, this.song.order.length);
    const lane = tidyLane({ track, target, from: info.min, to: info.max, startBar: 1, endBar: bars });
    this.song.automation = [...this.song.automation, lane];
    this.commitLanes();
    return `${info.label}  ${lane.from} -> ${lane.to}  \u00b7  BARS 1-${bars}`;
  }

  /** Remove one lane; one undo step. */
  private removeLaneAction(index: number): string {
    const lane = this.song.automation[index];
    if (!lane) return 'NO LANE TO REMOVE.';
    this.record();
    this.song.automation = this.song.automation.filter((_one, at) => at !== index);
    this.commitLanes();
    return `REMOVED ${AUTOMATION_TARGET_BY_ID[lane.target]?.label ?? lane.target} LANE`;
  }

  /** Re-point the engine's lanes and repaint the arranger. */
  private commitLanes(): void {
    this.engine.setAutomation(this.song.automation, patternRows(this.song));
    this.sessionDirty = true;
    this.updateHistoryButtons();
    if (this.arrangerView?.isOpen) this.arrangerView.render();
  }

  /**
   * Select a channel FROM the arranger.
   *
   * The row highlight moves the tracker's own cursor, so the two screens agree
   * about which channel is selected — there is one selection in the app, not one
   * per page. The page is repainted so its highlight follows the click.
   */
  private selectTrackAt(index: number): void {
    this.selectTrack(index);
    if (this.arrangerView?.isOpen) this.arrangerView.render();
  }

  /**
   * The LIVE page: the song's scenes as a launch grid.
   *
   * Built once like the other pages — a scene is song data the tracker can already
   * write, so the page has something to show (or a line telling you how to write
   * one) the moment it opens. Nothing is created on the way in.
   */
  private buildLive(): void {
    this.liveView = new LiveView(this, {
      onOpenChange: (open) => {
        // The view opening and closing IS the page changing: one answer to "what
        // is on screen", so the dropdown and the view cannot disagree.
        this.page = open ? 'live' : 'tracker';
        this.pageMenu?.render();
        this.syncInputMode();
      },
      song: () => this.song,
      activeScene: () => this.liveScene,
      pendingScene: () => this.livePendingScene,
      progress: () => this.liveProgress,
      countdown: () => this.liveCountdown,
      quantize: () => this.liveQuantizeValue,
      mode: () => this.liveMode,
      setMode: (mode: LiveMode) => { this.liveMode = mode; },
      selectedChannel: () => this.cursor.track,
      select: (index) => this.selectTrackAt(index),
      launch: (index) => this.launchScene(index),
      stopAll: () => this.stopAllScenes(),
      setQuantize: (bars) => this.setLiveQuantize(bars),
      // One undo step at the start of a key press or click, so a whole cell cycle
      // is a single Ctrl+Z — the same bargain the arranger's lane edits make.
      beginEdit: () => this.record(),
      setClip: (scene, channel, clip) => this.setSceneClipAction(scene, channel, clip),
      addScene: () => this.addSceneAction(),
      renameScene: (index, name) => this.renameSceneAction(index, name),
      duplicateScene: (index) => this.duplicateSceneAction(index),
      deleteScene: (index) => this.deleteSceneAction(index),
      audition: (scene, channel) => this.auditionSceneCell(scene, channel),
      setTextEditing: (editing) => { this.liveRenaming = editing; },
      openScript: () => this.openScript(),
      close: () => this.setPage('tracker'),
    });
  }

  /**
   * The RECORDER page: the recordings the app holds, as a waveform you can trim.
   *
   * Built once like the other pages. A take is APP state beside the sample bank —
   * never a song field — so this page can capture, trim and name a recording
   * without touching the song; only `GIVE TO CHANNEL` writes a song reference, and
   * that is one undo step.
   */
  private buildRecorder(): void {
    this.recorderView = new RecorderView(this, {
      onOpenChange: (open) => {
        // The view opening and closing IS the page changing, as the others do.
        this.page = open ? 'recorder' : 'tracker';
        this.pageMenu?.render();
        this.syncInputMode();
        // Leaving the page releases the microphone, and silences any take being
        // auditioned: an open input behind a screen nobody is looking at is the
        // red light with no reason, and a loop that keeps playing one is worse.
        if (!open) {
          this.releaseMeter();
          this.stopTakeAudition();
        }
      },
      // --- the take library ---
      takes: () => this.takes,
      selected: () => this.recordSelected,
      select: (index) => { this.recordSelected = this.clampTake(index); },
      waveform: (take, columns) => this.waveformFor(take, columns),
      rate: (take) => sampleByName(this.samples, take.name)?.rate ?? 0,
      setTake: (index, take) => this.setTakeAction(index, take),
      rename: (index, name) => this.renameTakeAction(index, name),
      remove: (index) => this.removeTakeAction(index),
      importAudio: () => this.fileMenu.openSamplePicker(),
      // --- the input ---
      devices: () => this.micDevices,
      deviceIndex: () => this.micDeviceIndex,
      selectDevice: (index) => { this.selectMicDeviceAction(index); },
      metering: () => this.meterSession !== null,
      toggleMeter: () => { this.toggleMeterAction(); },
      refusal: () => captureRefusal(),
      micError: () => this.micError,
      nextTakeName: () => this.captureName || this.nextTakeName(),
      recording: () => this.captureSession !== null,
      capture: () => { void this.captureTakeAction(); },
      // --- the song side ---
      song: () => this.song,
      selectedChannel: () => this.cursor.track,
      selectChannel: (index) => { this.selectChannelAction(index); },
      give: (index) => this.giveTakeAction(index),
      audition: (index) => this.auditionTakeAction(index),
      loopAudition: () => this.loopAudition,
      toggleLoopAudition: () => { this.toggleLoopAuditionAction(); },
      addChannel: () => { this.addChannel(); this.recorderView.render(); },
      // --- the export ---
      bounce: () => this.bounceRange(),
      setWholeSong: () => { this.clearBounce(); this.recorderView.render(); },
      setBarRange: () => { this.setBarRangeAction(); },
      nudgeBar: (end, step) => { this.nudgeBarAction(end, step); },
      loudness: () => this.loudnessTarget(),
      setLoudness: (value) => { this.setLoudnessAction(value); },
      export: (id) => { this.exportFromPage(id); },
      setTextEditing: (editing) => { this.recordRenaming = editing; },
      close: () => this.setPage('tracker'),
    });
  }

  /** Open the RECORDER page — nothing is created on the way in. */
  private openRecorder(): void {
    this.trackList.commitRename();
    this.headerLine.commit();
    this.patternTitleView.commit();
    this.scriptPanel.close();
    this.voiceMenu.hide();
    this.fileMenu.hide();
    this.songMenu.hide();
    this.patchMenu.hide();
    this.appearanceMenu.hide();
    this.helpOverlay.hide();
    this.instrumentBrowser.hide();
    this.recordSelected = this.clampTake(this.recordSelected);
    this.recorderView.show();
    // A fresh, permission-free list of inputs: the names fill in once the user
    // arms the meter, which is the first moment the browser will tell us them.
    void this.refreshMicDevices();
  }

  // --- microphone, metering and the take library ----------------------------

  /**
   * List the microphones this machine offers, without asking for one.
   *
   * `enumerateDevices` is not a prompt, so this is safe to call whenever the page
   * opens; the labels are blank until a stream has been granted, which is why it
   * is called AGAIN after the meter is armed.
   */
  private async refreshMicDevices(): Promise<void> {
    this.micDevices = await listInputDevices();
    if (this.micDeviceIndex >= this.micDevices.length) this.micDeviceIndex = 0;
    this.recorderView?.render();
  }

  /** The device id the meter and a capture should use, or undefined for default. */
  private micDeviceId(): string | undefined {
    return this.micDevices[this.micDeviceIndex]?.id || undefined;
  }

  /**
   * Open the input meter, or report why it will not open.
   *
   * The ONE place the page holds the microphone open without recording, so it is
   * only reached from an explicit gesture (the meter's own click, or `RECORD`).
   * The permission refusal the browser gives is shown in words, kept on the page
   * until the next attempt, because "the meter stayed at zero" explains nothing.
   */
  private async armMeterAction(): Promise<void> {
    const refusal = meterRefusal();
    if (refusal) {
      this.micError = refusal;
      this.recorderView?.render();
      return;
    }
    if (this.meterSession) return;
    try {
      this.meterSession = await startMeter(this.micDeviceId());
      this.micError = null;
      this.toast.show('INPUT OPEN  \u00b7  LEVELS LIVE', activeColors().ooze);
      // Permission granted, so the browser will now hand over the device names.
      await this.refreshMicDevices();
    } catch (error) {
      this.meterSession = null;
      this.micError = error instanceof Error ? error.message : 'the microphone is unavailable';
      this.toast.show(`NO INPUT  ${this.micError.toUpperCase()}`, activeColors().danger);
    }
    this.recorderView?.render();
  }

  /** Let the microphone go. Idempotent, and called whenever the page closes. */
  private releaseMeter(): void {
    this.meterSession?.stop();
    this.meterSession = null;
    this.meterClock = 0;
    this.recorderView?.setLevel({ rms: 0, peak: 0 });
  }

  /** The meter's click: open the input, or close it. */
  private toggleMeterAction(): void {
    if (this.meterSession) {
      this.releaseMeter();
      this.recorderView.render();
      return;
    }
    void this.armMeterAction();
  }

  /**
   * Choose a microphone from the page's list, re-arming the meter if it is open.
   *
   * The whole point of choosing is to LISTEN to the one you picked, so an open
   * meter is re-opened on the new device rather than left on the old one — a
   * silent swap would read as a device that does not work.
   */
  private selectMicDeviceAction(index: number): void {
    if (this.micDevices.length === 0) {
      void this.refreshMicDevices();
      return;
    }
    const count = this.micDevices.length;
    this.micDeviceIndex = ((Math.round(index) % count) + count) % count;
    if (this.meterSession) {
      this.releaseMeter();
      void this.armMeterAction();
    } else {
      this.recorderView?.render();
    }
  }

  /**
   * Set the export's loudness target outright — the dropdown's pick.
   *
   * The same value `cycleLoudness` lands on and the same one `export loud -14`
   * sets, so a menu pick, a key and a line cannot name different targets.
   */
  private setLoudnessAction(value: number | null): void {
    this.loudness = value === null ? null : Math.max(LOUDNESS_MIN, Math.min(LOUDNESS_MAX, Math.round(value)));
    this.recorderView?.render();
  }

  /** Move the recorder's selected channel, and repaint the page's highlight. */
  private selectChannelAction(index: number): void {
    const count = this.song.tracks.length;
    if (count === 0) return;
    const at = ((Math.round(index) % count) + count) % count;
    this.selectTrack(at);
    this.recorderView?.render();
  }

  /** Press `BAR RANGE`: keep the region if one is set, else open a sensible one. */
  private setBarRangeAction(): void {
    if (this.bounceRange() === null) {
      const bars = Math.max(1, this.song.order.length);
      this.bounceMark = bounceMarkFor({ from: 1, to: Math.min(8, bars) });
    }
    this.recorderView?.render();
  }

  /** Move one end of the export region by a number of bars, clamped to the order. */
  private nudgeBarAction(end: 'from' | 'to', step: number): void {
    const bars = Math.max(1, this.song.order.length);
    const current = this.bounceRange() ?? { from: 1, to: Math.min(8, bars) };
    const moved: BounceRange = { ...current, [end]: current[end] + step };
    this.bounceMark = bounceMarkFor(fitBounce(moved, bars));
    this.recorderView?.render();
  }

  /** Run the writer the EXPORT SONG panel's button names. */
  private exportFromPage(id: 'wav' | 'stems' | 'midi'): void {
    if (id === 'wav') void this.exportWavFromPage();
    else if (id === 'stems') void this.exportStemsFromPage();
    else this.exportMidiFromPage();
  }

  /**
   * The ARP page: the dials a run is dialed with, and the run they describe.
   *
   * Built once like the other pages. The DIALS are song data, so a nudge is an
   * undoable edit (one step per gesture, like a mixer drag); `WRITE RUN` is ONE
   * undo step for the whole run. The page is handed ONE thing to draw with —
   * `run()` — and the same `arpRun` call answers the preview, the audition and the
   * write, so what the page shows, what it sounds and what it commits cannot
   * disagree about a pitch, a row, a velocity or the pattern's edge.
   */
  private buildArp(): void {
    this.arpView = new ArpView(this, {
      onOpenChange: (open) => {
        // The view opening and closing IS the page changing, as the others do.
        this.page = open ? 'arp' : 'tracker';
        this.pageMenu?.render();
        this.syncInputMode();
        // Leaving the page stops the echo: an audition that outlived its page
        // would be notes nobody asked for, over a screen that cannot stop them.
        if (!open) this.stopArpEcho();
      },
      settings: () => this.song.arp ?? DEFAULT_ARP,
      setDial: (dial, step, perGesture) => { this.setArpDialAction(dial, step, perGesture); },
      setDialValue: (dial, value, perGesture) => { this.setArpDialValueAction(dial, value, perGesture); },
      choose: (dial, word) => { this.chooseArpWordAction(dial, word); },
      // The ONE run: the preview, the audition and the write all read this.
      run: () => this.arpRunResult(),
      destination: () => ({ pattern: this.patternIndex, track: this.cursor.track, startRow: Math.max(0, Math.min(this.cursor.row, Math.max(0, this.currentPattern.steps.length - 1))) }),
      select: (part, step) => { this.selectArpDestinationAction(part, step); },
      patternCount: () => this.song.patterns.length,
      channelNames: () => this.song.tracks.map((track) => track.name),
      rows: () => this.currentPattern.steps.length,
      write: () => { this.toast.show(this.writeArpAction(), activeColors().ward); },
      audition: () => { this.auditionArpAction(); },
      stopAudition: () => { this.stopArpEcho(); },
      auditioning: () => this.arpEcho.length > 0,
      hearChord: () => { this.hearArpChordAction(); },
      hearNote: (midi) => { this.hearArpNoteAction(midi); },
      hear: () => this.arpHear,
      toggleHear: () => { this.toggleArpHearAction(); this.arpView.render(); },
      reset: () => { this.toast.show(this.resetArpAction(), activeColors().ward); },
      close: () => this.setPage('tracker'),
    });
  }

  /** Open the ARP page — nothing is created on the way in. */
  private openArp(): void {
    this.trackList.commitRename();
    this.headerLine.commit();
    this.patternTitleView.commit();
    this.scriptPanel.close();
    this.voiceMenu.hide();
    this.fileMenu.hide();
    this.songMenu.hide();
    this.patchMenu.hide();
    this.appearanceMenu.hide();
    this.helpOverlay.hide();
    this.instrumentBrowser.hide();
    this.arpView.show();
  }

  /**
   * The run the ARP page is describing, for the destination its selectors point at.
   *
   * THE ONE COMPUTATION. `arpRun` resolves the source (the destination cell's
   * chord in CHORD mode, the song's progression at this row in SONG SOURCE mode),
   * walks it with the dials, stops at the pattern's OWN edge and reports the cells
   * it would land on. The page's preview, `HEAR RUN` and `WRITE RUN` are three
   * readers of this one answer, which is what makes them unable to disagree about
   * a pitch, a row, a velocity or where the run stops.
   */
  private arpRunResult(): ArpRunResult {
    const pattern = this.currentPattern;
    const rows = pattern.steps.length;
    const row = Math.max(0, Math.min(this.cursor.row, Math.max(0, rows - 1)));
    const track = this.cursor.track;
    return arpRun({
      settings: this.song.arp ?? DEFAULT_ARP,
      cell: this.arpCellTones(row, track),
      progression: this.song.progression,
      key: this.song.key,
      pattern: this.patternIndex,
      track,
      row,
      rows,
      occupied: this.arpOccupiedRows(row, track),
    });
  }

  /** The notes of one cell — CHORD mode's whole source. */
  private arpCellTones(row: number, track: number): number[] {
    const cell = this.currentPattern.steps[row]?.[track];
    return cell ? cellNotes(cell) : [];
  }

  /**
   * The destination channel's rows that already hold a note.
   *
   * What the page counts to say "4 notes at those rows are replaced" before a
   * write happens. A DRUM hit counts: it is a note in the cell, and a run landing
   * on it overwrites it exactly as it overwrites a pitch.
   */
  private arpOccupiedRows(row: number, track: number): number[] {
    const pattern = this.currentPattern;
    const out: number[] = [];
    for (let at = Math.max(0, row); at < pattern.steps.length; at += 1) {
      const cell = pattern.steps[at]?.[track];
      if (cell && (cell.note !== null || cell.drum !== null)) out.push(at);
    }
    return out;
  }

  /**
   * Nudge one ARP dial. The dials are SONG data, so this banks an undo step —
   * coalesced across a gesture (a held key) exactly as a mixer fader is, through
   * the same `beginStep`.
   */
  private setArpDialAction(dial: ArpDial, step: number, perGesture = false): string {
    const current = this.song.arp ?? DEFAULT_ARP;
    return this.commitArpDial(current, cycleDial(current, dial, step), perGesture, 'AT THE END');
  }

  /**
   * Set one NUMBER dial to an absolute value — the slider dragged, or an OCTAVES
   * button pressed. A button and a drag differ in how the value is chosen, not in
   * what it means, so both land through the model's own `clampArp`.
   */
  private setArpDialValueAction(dial: ArpDial, value: number, perGesture = false): string {
    const current = this.song.arp ?? DEFAULT_ARP;
    return this.commitArpDial(current, setDialValue(current, dial, value), perGesture, '');
  }

  /** Choose one WORD dial outright: a DIRECTION or a SOURCE MODE button. */
  private chooseArpWordAction(dial: 'direction' | 'mode', word: ArpDirection | ArpMode): string {
    const current = this.song.arp ?? DEFAULT_ARP;
    const next = dial === 'direction'
      ? clampArp({ ...current, direction: word as ArpDirection })
      : clampArp({ ...current, mode: word as ArpMode });
    return this.commitArpDial(current, next, false, '');
  }

  /**
   * Bank one dial change, and silence whatever was echoing the old dials.
   *
   * The echo goes FIRST: a run is played one note at a time, so every note after
   * the first belongs to the setting that was on screen when it started. Letting
   * it finish would have the page sound a run it no longer describes — the one
   * way a preview can lie about a write.
   */
  private commitArpDial(current: ArpSettings, next: ArpSettings, perGesture: boolean, atEnd: string): string {
    if (sameArp(current, next)) return atEnd === '' ? arpLabel(next) : `${arpLabel(next)}  \u00b7  ${atEnd}`;
    this.stopArpEcho();
    this.beginStep(perGesture);
    this.song.arp = next;
    this.commitArp();
    return arpLabel(next);
  }

  /**
   * Commit the run the dials describe into its destination. ONE undo step.
   *
   * ONLY the generated cells are touched — not the rest of the channel, not the
   * rows the run skipped — and each one is written with the pitch AND the velocity
   * the run reports, so the grid afterwards holds exactly the cells the page drew.
   * `this.record()` is the one step: a dial change writes no notes at all, which is
   * why only this function calls it.
   */
  private writeArpAction(): string {
    const result = this.arpRunResult();
    if (!result.ok) return result.reason.toUpperCase();
    const run = result.run;
    if (run.steps.length === 0) return 'NOTHING TO WRITE  \u00b7  NO ROOM PAST THIS ROW';
    // The echo describes the run as it was BEFORE the write, so it stops here.
    this.stopArpEcho();
    const pattern = this.currentPattern;
    const track = run.destination.track;
    this.record();
    for (const step of run.steps) {
      const cell = pattern.steps[step.step]?.[track];
      if (!cell) continue;
      setCellNotes(cell, [step.note]);
      cell.velocity = step.velocity;
    }
    for (const step of run.steps) this.grid.refreshCell(step.step, track);
    this.rollView?.refresh();
    this.afterEdit();
    this.sessionDirty = true;
    if (this.arpView?.isOpen) this.arpView.render();
    return `WROTE ${run.steps.length} NOTES  \u00b7  PAT ${run.destination.pattern + 1} TRACK ${track + 1}  \u00b7  ${arpLabel(this.song.arp ?? DEFAULT_ARP)}`;
  }

  /** Refresh the ARP view after a dial edit. */
  private commitArp(): void {
    this.updateHistoryButtons();
    this.sessionDirty = true;
    if (this.arpView?.isOpen) this.arpView.render();
  }

  /**
   * Hear the run through the destination channel, one note after another.
   *
   * The notes are the WRITTEN run's — the same `arpRun` output `WRITE RUN`
   * commits — and they are spaced by `rate` rows rather than by one, so a run that
   * writes a note every two steps is HEARD every two steps. At `rate 1` the
   * spacing is a row, which is what it always was; the old fixed one-row spacing
   * played every other setting at the wrong tempo, which is exactly the sort of
   * thing only an ear can catch.
   */
  private auditionArpAction(): void {
    this.stopArpEcho();
    const result = this.arpRunResult();
    if (!result.ok) {
      this.toast.show(result.reason.toUpperCase(), activeColors().textDim);
      return;
    }
    const run = result.run;
    if (run.steps.length === 0) {
      this.toast.show('NOTHING TO HEAR  \u00b7  NO ROOM PAST THIS ROW', activeColors().textDim);
      return;
    }
    const channel = run.destination.track;
    const settings = this.song.arp ?? DEFAULT_ARP;
    const ms = arpAuditionSpacingMs(settings, secondsPerRow(this.song.bpm, this.song.rowsPerBeat, this.song.speed));
    run.steps.forEach((step, index) => {
      this.arpEcho.push(this.time.delayedCall(index * ms, () => this.engine.previewNote(channel, step.note)));
    });
    // One timer past the last note, so the echo ENDS rather than only being
    // stopped: without it the page would keep saying STOP long after the sound
    // had finished, and `auditioning` would be answering a question about the
    // past. This is the same list the cancel path empties, so a change mid-echo
    // takes it with everything else.
    this.arpEcho.push(this.time.delayedCall(run.steps.length * ms, () => {
      this.arpEcho = [];
      if (this.arpView?.isOpen) this.arpView.render();
    }));
    this.toast.show(`HEAR  ${run.steps.length} NOTES  \u00b7  CH ${channel + 1}  \u00b7  ${run.source.chord || 'THE CELL'}`, activeColors().ward);
  }

  /**
   * Hear the SOURCE chord, every tone at once.
   *
   * The complement of `HEAR RUN`: the run is the chord in an order, and this is
   * the chord. Both come from the same `arpRunResult`, so a chord heard here is the
   * chord the run below is walking — in SONG SOURCE mode that means the
   * progression's chord at this row.
   *
   * It is NOT an echo: no timers, nothing to cancel, and pressing it never turns
   * `HEAR RUN` into `STOP`.
   */
  private hearArpChordAction(): void {
    const result = this.arpRunResult();
    if (!result.ok) {
      this.toast.show(result.reason.toUpperCase(), activeColors().textDim);
      return;
    }
    const { tones, chord } = result.run.source;
    const track = result.run.destination.track;
    for (const midi of tones) this.engine.previewNote(track, midi);
    this.toast.show(`HEAR  ${chord || 'THE CELL'}  \u00b7  ${tones.length} NOTES  \u00b7  CH ${track + 1}`, activeColors().ward);
  }

  /** Hear one tone of the source chord, from its own chip on the page. */
  private hearArpNoteAction(midi: number): void {
    const result = this.arpRunResult();
    if (!result.ok) return;
    this.engine.previewNote(result.run.destination.track, midi);
  }

  /**
   * Stop the running audition, wherever it is.
   *
   * Every change that would make the echo stale calls this first: a dial nudge, a
   * selector move, a write, leaving the page, and turning AUTO HEAR off. The notes
   * already played cannot be recalled, but no note after the change is allowed to
   * sound as if the change had not happened.
   */
  private stopArpEcho(): void {
    for (const timer of this.arpEcho) timer.remove(false);
    this.arpEcho = [];
  }

  /** Turn the page's AUTO HEAR switch over. A session setting, never song data. */
  private toggleArpHearAction(): void {
    this.arpHear = !this.arpHear;
    if (!this.arpHear) this.stopArpEcho();
    this.toast.show(`AUTO HEAR ${this.arpHear ? 'ON' : 'OFF'}`, this.arpHear ? activeColors().ward : activeColors().textDim);
  }

  /** Put every dial back to a fresh page's, as ONE undo step. Writes no notes. */
  private resetArpAction(): string {
    const current = this.song.arp ?? DEFAULT_ARP;
    if (sameArp(current, DEFAULT_ARP)) return 'THE DIALS ARE ALREADY AT THEIR DEFAULTS.';
    this.stopArpEcho();
    this.record();
    this.song.arp = { ...DEFAULT_ARP };
    this.commitArp();
    return `RESET  \u00b7  ${arpLabel(DEFAULT_ARP)}`;
  }

  /**
   * Move the ARP page's destination: which pattern, which channel, which row.
   *
   * The selectors move the app's own cursor rather than keeping a second one, and
   * that is deliberate: the run's channel is the channel a `WRITE` will land on and
   * the chart the page draws is the pattern you are looking at, so "where the page
   * points" and "where the app is" are the same question — the same bargain the
   * tracker's own cursor keeps with every other panel.
   */
  private selectArpDestinationAction(part: 'pattern' | 'track' | 'row', step: number): void {
    this.stopArpEcho();
    if (part === 'pattern') {
      const last = this.song.patterns.length - 1;
      const next = Math.max(0, Math.min(this.patternIndex + step, last));
      if (next === this.patternIndex) {
        this.toast.show(step < 0 ? 'FIRST PATTERN' : 'LAST PATTERN', activeColors().textDim);
        return;
      }
      // Plain navigation is never recorded, exactly as the pattern arrows are not.
      this.patternIndex = next;
      this.cursor = { row: Math.min(this.cursor.row, Math.max(0, this.currentPattern.steps.length - 1)), track: this.cursor.track };
      this.syncAll();
      this.arpView?.render();
      return;
    }
    if (part === 'track') {
      const next = Math.max(0, Math.min(this.cursor.track + step, Math.max(0, this.trackCount - 1)));
      // No preview note: nudging a SELECTOR should not sound a note from the cell
      // that happens to sit under the cursor.
      this.setSelection({ row: this.cursor.row, track: next }, false);
      this.arpView?.render();
      return;
    }
    const rows = this.currentPattern.steps.length;
    const next = Math.max(0, Math.min(this.cursor.row + step, Math.max(0, rows - 1)));
    this.setSelection({ row: next, track: this.cursor.track }, false);
    this.arpView?.render();
  }

  /** Keep the selected take inside the list. */
  private clampTake(index: number): number {
    if (this.takes.length === 0) return 0;
    return Math.max(0, Math.min(Math.round(index) || 0, this.takes.length - 1));
  }

  /**
   * Hand the engine BOTH halves of a recording's sound: the bank, and the takes.
   *
   * The bank says which file a channel plays; the takes say WHICH PART of it — a
   * trim window and a loop, set on the RECORDER page. They are pushed together
   * everywhere the bank was already pushed, so a channel can never be given the
   * bytes without the shape, and the ONE place that restates which channel names
   * what is this one call. A trim edit pushes only `setTakes`, because the files
   * did not change.
   */
  private pushBankToEngine(): void {
    this.engine.setSamples(
      this.samples,
      this.song.tracks.map((track) => track.sample),
      this.song.machine?.pads.map((pad) => pad.sample) ?? [],
    );
    this.engine.setTakes(this.takes);
  }

  /** Waveform columns for a take, reduced from its decoded frames in the bank. */
  private waveformFor(take: Take, columns: number): number[] {
    const sample = sampleByName(this.samples, take.name);
    return waveformBars(sample ? sample.pcm : new Float32Array([]), columns);
  }

  /** A fresh name for the next capture, unique in the bank and the take list. */
  private nextTakeName(): string {
    for (let n = 1; n <= 64; n++) {
      const candidate = `TAKE ${n}`;
      const taken = this.samples.some((sample) => sameSampleName(sample.name, candidate))
        || this.takes.some((take) => sameTakeName(take.name, candidate));
      if (!taken) return candidate;
    }
    return `TAKE ${this.takes.length + 1}`;
  }

  /**
   * Start or stop a capture, and on stop put the recording in the bank.
   *
   * APP state throughout, like `sample load`: the take joins the bank and the list
   * of takes, and NO undo step is banked — a Ctrl+Z that threw away a recording
   * you just made would be a Ctrl+Z that lost your own performance. Reached from
   * the page's RECORD button and the `R` key.
   */
  private async captureTakeAction(): Promise<void> {
    if (this.captureSession) {
      const session = this.captureSession;
      this.captureSession = null;
      try {
        const audio = await session.stop();
        const name = this.captureName || this.nextTakeName();
        this.captureName = '';
        const made = makeSample(name, audio.rate, audio.pcm);
        if (!made.ok) {
          this.toast.show(made.error.toUpperCase(), activeColors().danger);
        } else {
          const added = addSample(this.samples, made.sample);
          if (!added.ok) {
            this.toast.show(added.error.toUpperCase(), activeColors().danger);
          } else {
            this.samples = added.bank;
            const take = makeTake(made.sample.name, sampleSeconds(made.sample), peakOf(made.sample.pcm));
            this.takes = [...this.takes.filter((one) => !sameTakeName(one.name, take.name)), take];
            this.recordSelected = this.takes.length - 1;
            this.pushBankToEngine();
            this.toast.show(`CAPTURED  ${sampleLabel(made.sample)}`, activeColors().ooze);
          }
        }
      } catch (error) {
        this.toast.show(`CAPTURE FAILED  ${error instanceof Error ? error.message.toUpperCase() : 'UNKNOWN'}`, activeColors().danger);
      }
      // A capture suspended the meter to free the device; hand it back.
      if (this.meterResume) {
        this.meterResume = false;
        void this.armMeterAction();
      }
      this.recorderView.render();
      return;
    }

    const refusal = captureRefusal();
    if (refusal) {
      this.toast.show(refusal.toUpperCase(), activeColors().danger);
      return;
    }
    // A script that said `record NAME` has already armed the name; otherwise a
    // fresh one is picked. Either way the take lands under the name it was told.
    const name = this.captureName || this.nextTakeName();
    this.captureName = name;
    // Two streams to one microphone is a fight the browser need not referee: the
    // meter steps aside for the capture and is re-armed when it stops.
    this.meterResume = this.meterSession !== null;
    if (this.meterResume) this.releaseMeter();
    try {
      this.captureSession = await startCapture(this.micDeviceId());
      this.toast.show(`RECORDING AS ${name}`, activeColors().danger);
    } catch (error) {
      this.captureSession = null;
      this.micError = error instanceof Error ? error.message : 'the microphone is unavailable';
      this.toast.show(`NO INPUT  ${this.micError.toUpperCase()}`, activeColors().danger);
      if (this.meterResume) { this.meterResume = false; void this.armMeterAction(); }
    }
    this.recorderView.render();
  }

  /** Replace one take (a drag). No undo step: a trim is a window, not the song. */
  private setTakeAction(index: number, take: Take): void {
    if (index < 0 || index >= this.takes.length) return;
    this.takes[index] = take;
    // The window just moved, so the engine's next note plays the new shape — the
    // trim stops being a picture the moment it is dragged.
    this.engine.setTakes(this.takes);
    this.recorderView.render();
  }

  /** Give a take's recording to the channel under the cursor; ONE undo step. */
  private giveTakeAction(index: number): void {
    const take = this.takes[index];
    if (!take) return;
    const sample = sampleByName(this.samples, take.name);
    if (!sample) {
      this.toast.show('THAT RECORDING IS NO LONGER IN THE BANK', activeColors().danger);
      return;
    }
    const track = this.song.tracks[this.cursor.track];
    if (!track) {
      this.toast.show('NO CHANNEL IS SELECTED', activeColors().danger);
      return;
    }
    if (track.voice.wave !== 'sample') {
      this.toast.show(`CHANNEL ${this.cursor.track + 1} IS ON WAVE ${track.voice.wave.toUpperCase()} \u2014 SET IT (F4) FIRST`, activeColors().danger);
      return;
    }
    this.record();
    track.sample = sample.name;
    this.syncAll();
    this.updateHistoryButtons();
    this.toast.show(`CHANNEL ${this.cursor.track + 1} PLAYS ${sample.name.toUpperCase()}`, activeColors().ooze);
  }

  /**
   * `HEAR TAKE`: play the recording's window through the channel's own strip.
   *
   * The take's TRIM is honoured (it starts and ends at the window), and its LOOP
   * too when the page's LOOP switch is on and the take has one — so the button
   * hears exactly the shape the waveform shows, not a pitch from the channel's
   * patch. A recording the bank no longer holds says so rather than playing
   * silence. Only one audition sounds at a time.
   */
  private auditionTakeAction(index: number): void {
    this.stopTakeAudition();
    const take = this.takes[index];
    if (!take) return;
    const sample = sampleByName(this.samples, take.name);
    if (!sample) {
      this.toast.show('THAT RECORDING IS NO LONGER IN THE BANK', activeColors().danger);
      return;
    }
    const loop = this.loopAudition && takeLoop(take) !== null;
    this.takeAudition = this.engine.previewTake(this.cursor.track, sample, takeWindow(take), loop);
    this.toast.show(`HEAR  ${take.name.toUpperCase()}${loop ? '  \u00b7  LOOPED' : ''}`, activeColors().ward);
  }

  /** Silence a take audition that is still sounding. */
  private stopTakeAudition(): void {
    this.takeAudition?.stop();
    this.takeAudition = null;
  }

  /**
   * Flip the LOOP switch under the waveform.
   *
   * If a take is sounding, it is re-auditioned with the new setting straight
   * away, so the switch is heard rather than merely remembered for next time.
   */
  private toggleLoopAuditionAction(): void {
    this.loopAudition = !this.loopAudition;
    const wasPlaying = this.takeAudition !== null;
    if (wasPlaying) this.auditionTakeAction(this.recordSelected);
    else this.toast.show(this.loopAudition ? 'HEAR TAKE LOOPS' : 'HEAR TAKE PLAYS THROUGH', activeColors().textDim);
    this.recorderView.render();
  }

  /** Rename a take and the bank recording with it, re-pointing anything that named it. */
  private renameTakeAction(index: number, raw: string): void {
    const take = this.takes[index];
    if (!take) return;
    const name = tidySampleName(raw);
    if (!isTakeName(name)) {
      this.toast.show(`BAD NAME  ${name.toUpperCase()}`, activeColors().danger);
      return;
    }
    const old = take.name;
    if (sameSampleName(old, name)) return;
    const clash = this.samples.some((sample) => sameSampleName(sample.name, name) && !sameSampleName(sample.name, old));
    if (clash) {
      this.toast.show(`${name.toUpperCase()} IS ALREADY IN THE BANK`, activeColors().danger);
      return;
    }
    this.samples = this.samples.map((sample) => (sameSampleName(sample.name, old) ? { ...sample, name } : sample));
    this.takes[index] = { ...take, name };
    // Re-point any channel or pad that named the old name, so nothing breaks.
    let repointed = 0;
    for (const track of this.song.tracks) {
      if (track.sample !== null && sameSampleName(track.sample, old)) {
        track.sample = name;
        repointed += 1;
      }
    }
    for (const pad of this.song.machine?.pads ?? []) {
      if (pad.sample && sameSampleName(pad.sample, old)) {
        pad.sample = name;
        repointed += 1;
      }
    }
    this.pushBankToEngine();
    if (repointed > 0) this.syncAll();
    this.toast.show(`RENAMED  ${old.toUpperCase()} \u2192 ${name.toUpperCase()}`, activeColors().ward);
  }

  /** Take a recording out of the bank, with its take. */
  private removeTakeAction(index: number): void {
    const take = this.takes[index];
    if (!take) return;
    // A recorded loop that outlived the recording it came from would be a ghost.
    this.stopTakeAudition();
    this.takes = this.takes.filter((_one, at) => at !== index);
    this.samples = removeSample(this.samples, take.name);
    this.recordSelected = this.clampTake(this.recordSelected);
    this.pushBankToEngine();
    this.toast.show(`REMOVED  ${take.name.toUpperCase()}`, activeColors().textDim);
    this.recorderView.render();
  }

  /** Show an OUT-row action's result and repaint the recorder page. */
  /**
   * The recorder page's three writers.
   *
   * Each is the SAME producer `F2 -> EXPORT...` runs — `renderAudioFile`,
   * `stemsFile`, `midiFile` — so the file that lands on the disk is identical
   * whichever screen asked for it: the same region, the same loudness, the same
   * bank and kits. Only the reporting differs, and only in WHERE: the menu writes
   * its status well, which this page covers, so the page toasts instead.
   */
  private async exportWavFromPage(): Promise<void> {
    this.toast.show('EXPORTING WAV...', activeColors().textDim);
    const out = await this.renderAudioFile();
    if ('error' in out) {
      this.toast.show(`COULD NOT RENDER  ${out.error.toUpperCase()}`, activeColors().danger);
      return;
    }
    const name = `${songFileStem(this.song.title)}.wav`;
    downloadBytes(name, 'audio/wav', out.bytes);
    this.toast.show(`SAVED  ${name}  ${out.seconds.toFixed(1)}S  ${bounceLabel(this.bounceRange(), this.song.order.length)}`, activeColors().ward);
  }

  private async exportStemsFromPage(): Promise<void> {
    this.toast.show('RENDERING STEMS...', activeColors().textDim);
    const out = await this.stemsFile();
    if ('error' in out) {
      this.toast.show(`COULD NOT RENDER  ${out.error.toUpperCase()}`, activeColors().danger);
      return;
    }
    const name = stemArchiveName(songFileStem(this.song.title));
    downloadBytes(name, 'application/zip', out.bytes);
    this.toast.show(`SAVED  ${name}  ${out.names.length} PARTS`, activeColors().ward);
  }

  private exportMidiFromPage(): void {
    const out = this.midiFile();
    if ('error' in out) {
      this.toast.show(`THERE IS NOTHING TO EXPORT  ${out.error.toUpperCase()}`, activeColors().danger);
      return;
    }
    const name = `${songFileStem(this.song.title)}${MIDI_EXPORT_FILE_EXTENSION}`;
    downloadBytes(name, 'audio/midi', out.bytes);
    this.toast.show(`SAVED  ${name}  ${out.notes} NOTES`, activeColors().ward);
  }

  /**
   * Write a new scene list and repaint the page.
   *
   * The ONE place the grid's edits land, so every scene action below is a call to
   * a pure model helper plus this — the song's session is dirtied, the undo count
   * refreshed and the page redrawn, exactly once.
   */
  private commitScenes(scenes: Song['scenes']): void {
    this.song.scenes = scenes;
    this.sessionDirty = true;
    this.updateHistoryButtons();
    if (this.liveView?.isOpen) this.liveView.render();
  }

  /**
   * Replace one cell's clip; NO undo step of its own — the page banks one at the
   * start of the key press or click, so a cycle is exactly one Ctrl+Z.
   */
  private setSceneClipAction(sceneIndex: number, channel: number, clip: number | null): void {
    const scene = this.song.scenes[sceneIndex];
    if (!scene) return;
    const scenes = this.song.scenes.slice();
    if (this.song.machine && channel >= this.song.tracks.length) {
      // The DRUM MACHINE column: its clip is a BAR, not a pattern.
      scenes[sceneIndex] = withSceneMachine(scene, clip);
    } else {
      // The page's columns are 0-based; `withSceneClip` takes a 1-based channel.
      scenes[sceneIndex] = withSceneClip(scene, channel + 1, clip, this.song.tracks.length);
    }
    this.commitScenes(scenes);
  }

  /** `+ SCENE`: append an empty scene; one undo step. */
  private addSceneAction(): void {
    if (this.song.scenes.length >= MAX_SCENES) return;
    this.record();
    this.commitScenes(addScene(this.song.scenes, this.song.tracks.length));
  }

  /** Rename a scene; one undo step, and only when the name really changed. */
  private renameSceneAction(index: number, name: string): void {
    const before = this.song.scenes[index]?.name;
    const wanted = tidySceneName(name);
    if (before === undefined || wanted === '' || sceneNameProblem(wanted) !== null) return;
    if (sameSceneName(before, wanted)) return;
    this.record();
    this.commitScenes(renameSceneAt(this.song.scenes, index, wanted));
  }

  /** Copy a scene under a fresh name; one undo step. */
  private duplicateSceneAction(index: number): void {
    if (!this.song.scenes[index]) return;
    if (this.song.scenes.length >= MAX_SCENES) return;
    this.record();
    this.commitScenes(duplicateScene(this.song.scenes, index, this.song.tracks.length));
  }

  /** Delete a scene; one undo step. */
  private deleteSceneAction(index: number): void {
    if (!this.song.scenes[index]) return;
    this.record();
    this.commitScenes(deleteSceneAt(this.song.scenes, index));
  }

  /**
   * Audition a cell: sound the clip's own first row on that channel, so a cell can
   * be heard before it is launched. A silent cell is nothing to hear.
   */
  private auditionSceneCell(sceneIndex: number, channel: number): void {
    const song = this.song;
    // The machine column hears the bar's first hit; the machine is not a channel,
    // so its clip is a bar rather than a pattern.
    if (song.machine && channel >= song.tracks.length) {
      const bar = song.scenes[sceneIndex]?.machine ?? null;
      if (bar === null) return;
      const rows = machineBarRows(song.machine, bar);
      for (let pad = 0; pad < rows.length; pad++) {
        if (rows[pad].some((velocity) => velocity > 0)) {
          const drumPad = song.machine.pads[pad];
          if (drumPad) this.engine.previewPad(drumPad);
          return;
        }
      }
      return;
    }
    const clip = sceneClip(song, sceneIndex, channel);
    if (clip === null) return;
    const pattern = song.patterns[clip - 1];
    if (!pattern) return;
    for (const note of rowNotes(pattern, 0)) {
      if (note.track !== channel) continue;
      if (note.drum !== null) this.engine.previewDrum(channel, note.drum);
      else this.engine.previewNote(channel, note.midi);
      return;
    }
  }

  /** The scene queued to launch at the next boundary, or null when none is. */
  get livePendingScene(): number | null {
    const cue = pendingCue(this.liveCues, this.engine.absoluteStep);
    return cue ? cue.scene : null;
  }

  /** Open the LIVE page, hiding every menu the way the arranger's open does. */
  private openLive(): void {
    this.trackList.commitRename();
    this.headerLine.commit();
    this.patternTitleView.commit();
    this.scriptPanel.close();
    this.voiceMenu.hide();
    this.fileMenu.hide();
    this.songMenu.hide();
    this.patchMenu.hide();
    this.appearanceMenu.hide();
    this.helpOverlay.hide();
    this.instrumentBrowser.hide();
    this.liveView.show();
  }

  /** Open the ARRANGER page, hiding every menu the way the mixer's open does. */
  private openArranger(): void {
    this.trackList.commitRename();
    this.headerLine.commit();
    this.patternTitleView.commit();
    this.scriptPanel.close();
    this.voiceMenu.hide();
    this.fileMenu.hide();
    this.songMenu.hide();
    this.patchMenu.hide();
    this.appearanceMenu.hide();
    this.helpOverlay.hide();
    this.instrumentBrowser.hide();
    this.arrangerView.show();
  }

  // --- the drum machine (the tab's edits) -----------------------------------

  /** A pad by its 1-based number, clamped, or null when there is no machine. */
  private machinePad(pad: number): DrumPad | null {
    const machine = this.song.machine;
    return machine ? padAt(machine, clampPadIndex(pad)) : null;
  }

  /** Refresh the audio graph and the view after a machine edit. */
  private commitMachine(): void {
    this.engine.setMachine(this.song.machine);
    // The bars a section names are clamped to how many bars the machine has, so a
    // machine edit can change which bar plays — recomputed with the instrument.
    this.engine.setMachineBars(machineBarsForSong(this.song));
    this.updateHistoryButtons();
    if (this.drumView?.isOpen) this.drumView.render();
  }

  /**
   * Put a hit in one step of one pad, or take it out. One undo step per click.
   *
   * `bar` names WHICH bar of the machine (1-based; bar 1 is the pads' own rows),
   * so one action draws every bar the machine has: bar 1 through the pads, the
   * rest through `withMachineBar` — the one place a bar's hits live. The pad's
   * SOUND is shared by every bar, so only the row moves.
   */
  private setMachineHitAction(pad: number, step: number, velocity: number, bar = 1): string {
    const machine = this.song.machine;
    const row = this.machinePad(pad);
    if (!machine || !row) return 'NO MACHINE.';
    const index = clampPadIndex(pad) - 1;
    const at = Math.max(0, Math.min(machine.steps - 1, Math.round(step)));
    const barAt = clampMachineBar(machine, bar);
    const next = clampHitVelocity(velocity);
    const rows = machineBarRows(machine, barAt);
    if ((rows[index]?.[at] ?? 0) === next) return `${row.name} STEP ${at + 1} UNCHANGED`;
    this.record();
    (rows[index] as number[])[at] = next;
    this.song.machine = withMachineBar(machine, barAt, rows);
    this.commitMachine();
    const where = barAt === 1 ? '' : ` BAR ${barAt}`;
    return next === 0 ? `${row.name}${where} STEP ${at + 1} OFF` : `${row.name}${where} STEP ${at + 1}  \u00b7  ${next}%`;
  }

  /**
   * Add one bar to the machine: a COPY of the last, so a variation starts as the
   * beat rather than as silence. The counterpart of the script's second
   * `machine bar` block.
   */
  private addMachineBarAction(): string {
    const machine = this.song.machine;
    if (!machine) return 'NO MACHINE.';
    if (machineBarCount(machine) >= MAX_MACHINE_BARS) return `A MACHINE HOLDS AT MOST ${MAX_MACHINE_BARS} BARS.`;
    this.record();
    this.song.machine = addMachineBar(machine);
    const count = machineBarCount(this.song.machine);
    this.commitMachine();
    return `BAR ${count} ADDED  \u00b7  A COPY OF BAR ${count - 1}`;
  }

  /** Drop the machine's LAST bar. Bar 1 is the machine and never goes. */
  private removeMachineBarAction(): string {
    const machine = this.song.machine;
    if (!machine) return 'NO MACHINE.';
    const count = machineBarCount(machine);
    if (count <= 1) return 'BAR 1 IS THE MACHINE.';
    this.record();
    this.song.machine = removeMachineBar(machine, count);
    this.commitMachine();
    return `BAR ${count} REMOVED  \u00b7  ${machineBarCount(this.song.machine)} LEFT`;
  }

  /**
   * The machine's ORDER: which bar plays in each song bar, looping.
   *
   * It only says anything once the machine has more than one bar, so an empty
   * list ("bar 1 everywhere") is the normal state of a one-bar beat and writes no
   * key at all. Each entry is clamped to a bar the machine HAS, because unlike the
   * script — which may name a bar before it exists — a hand is choosing from the
   * bars it can see.
   */
  private setMachineOrderAction(list: number[]): string {
    const machine = this.song.machine;
    if (!machine) return 'NO MACHINE.';
    const count = machineBarCount(machine);
    const clamped = list.map((entry) => Math.max(1, Math.min(count, Math.round(entry))));
    if (clamped.join(' ') === machine.order.join(' ')) return 'ORDER UNCHANGED';
    this.record();
    this.song.machine = setMachineOrder(machine, clamped);
    this.commitMachine();
    return clamped.length === 0 ? 'ORDER CLEARED  \u00b7  BAR 1 EVERYWHERE' : `ORDER ${clamped.join(' ')}`;
  }

  /**
   * What each SONG bar actually plays, and whether a SECTION named it.
   *
   * The machine's own `order` is what plays when nothing else says; a section may
   * name the drum-machine bar it plays (`section CHORUS 3 4 machine 2`), and then
   * the form GOVERNs those song bars. This is `machineBarsForSong` — the one place
   * the two meet, and the same list the engine and the renderer play — read back
   * with the provenance the page wants: `fromForm` is true where a section's own
   * choice (not the machine's order) decided the bar, so the row can say which
   * beats came from the form.
   */
  private resolvedMachineBeat(): { bar: number; fromForm: boolean }[] {
    const machine = this.song.machine;
    if (!machine) return [];
    const bars = machineBarsForSong(this.song);
    const labels = orderSectionLabels(this.song.order, this.song.sections, this.song.arrangement);
    return bars.map((bar, index) => {
      const label = labels[index] ?? null;
      const section = label === null ? null : sectionByName(this.song.sections, label);
      return { bar, fromForm: section?.machineBar != null };
    });
  }

  /**
   * Move one of the machine's own mix controls.
   *
   * `perGesture` is how the MIXER page asks for its own undo bargain: a drag
   * across the machine's fader is ONE step, like a track's. The drum machine page
   * leaves it off, so it keeps the per-change step it has always had — the flag
   * that remembers a gesture belongs to the page that started it, so the two
   * pages cannot spend each other's.
   */
  private setMachineMixAction(id: MachineMixId, value: number, perGesture = false): string {
    const machine = this.song.machine;
    if (!machine) return 'NO MACHINE.';
    const next = id === 'pan' ? clampPan(value) : clampLevel(value);
    if (machine[id] === next) return `${id.toUpperCase()} UNCHANGED`;
    this.beginStep(perGesture);
    machine[id] = next;
    this.commitMachine();
    return `${id.toUpperCase()} ${id === 'pan' ? panLabel(next) : levelLabel(next)}`;
  }

  /**
   * Take the undo snapshot for one change — or, when a gesture is running, for
   * the first change of it and no more.
   *
   * One place rather than a copy per action, so every control on the mixer page
   * makes exactly the same bargain: the first nudge banks `record()`, the rest of
   * the drag ride along with it, and the next press of a key starts fresh. The
   * decision is `mixStep`'s, which is why it is a decision at all.
   */
  private beginStep(perGesture: boolean): void {
    const step = mixStep(this.mixGesture, perGesture, Date.now());
    if (step.record) this.record();
    this.mixGesture = step.gesture;
  }

  /**
   * Begin one mixer gesture: the next change banks its own undo step.
   *
   * Called by a key PRESS or a click, never by the repeats of a held key, so
   * pressing `-` twice is two steps and holding it is one — which is the same
   * bargain a level drag makes, and the reason the flag is cleared here rather
   * than after each change.
   */
  private beginMixEdit(): void {
    this.mixGesture = beginGesture();
  }

  /** Turn the machine on or off, keeping its pads. */
  private setMachineEnabledAction(on: boolean, perGesture = false): string {
    const machine = this.song.machine;
    if (!machine) return 'NO MACHINE.';
    if (machine.enabled === on) return on ? 'MACHINE ALREADY ON' : 'MACHINE ALREADY OFF';
    this.beginStep(perGesture);
    machine.enabled = on;
    this.commitMachine();
    return on ? 'MACHINE ON' : 'MACHINE OFF  \u00b7  THE PADS ARE KEPT';
  }

  /**
   * Put the machine on a group, or take it off every one.
   *
   * The machine's routing is the song's, not the engine's: the mixer's GROUPS
   * panel must move the machine's level with the channels it sits beside, so this
   * is the same `setBuses` door every channel's bus assignment goes through.
   */
  private setMachineBusAction(name: string | null, perGesture = false): string {
    const machine = this.song.machine;
    if (!machine) return 'NO MACHINE.';
    const next = name === null ? null : busByName(this.song.buses, name)?.name ?? null;
    if (machine.bus === next) return `MACHINE BUS ALREADY ${next ?? 'NONE'}`;
    this.beginStep(perGesture);
    machine.bus = next;
    this.engine.setBuses(this.song.buses, this.song.tracks.map((one) => one.bus));
    this.commitMachine();
    return next === null ? 'MACHINE OFF EVERY GROUP' : `MACHINE JOINS ${next}`;
  }

  /** One of the machine's ten effects. One undo step per gesture, like a channel's. */
  private setMachineEffectAction(id: TrackEffectId, amount: number, perGesture = false): void {
    const machine = this.song.machine;
    if (!machine) return;
    const next = clampEffect(amount);
    if (machine.effects[id] === next) return;
    this.beginStep(perGesture);
    machine.effects[id] = next;
    this.commitMachine();
  }

  /** Widen or narrow the machine, resizing every pad's row in step. */
  private setMachineStepsAction(steps: number): string {
    const machine = this.song.machine;
    if (!machine) return 'NO MACHINE.';
    const next = clampMachineSteps(steps);
    if (next === machine.steps) return `STEPS ${next} UNCHANGED`;
    this.record();
    this.song.machine = resizeMachine(machine, next);
    this.commitMachine();
    return `MACHINE ${next} STEPS`;
  }

  /** Change how many of the machine's steps make one beat. */
  private setMachineBeatAction(beat: number): string {
    const machine = this.song.machine;
    if (!machine) return 'NO MACHINE.';
    const next = clampMachineBeat(beat);
    if (next === machine.beat) return `BEAT ${next} UNCHANGED`;
    this.record();
    machine.beat = next;
    this.commitMachine();
    return `MACHINE ${next} STEPS TO THE BEAT`;
  }

  /** Grow the machine by one pad, seeded with the next sound in the kit's run. */
  private addMachinePadAction(): string {
    const machine = this.song.machine;
    if (!machine) return 'NO MACHINE.';
    if (machine.pads.length >= MAX_PADS) return `A MACHINE HOLDS AT MOST ${MAX_PADS} PADS`;
    const index = machine.pads.length + 1;
    this.record();
    this.song.machine = withPad(machine, index, defaultPad(index, machine.steps));
    this.commitMachine();
    return `PAD ${index} ADDED`;
  }

  /**
   * Drop the machine's last pad.
   *
   * The first pad never goes, because a machine with no pads has no sound and
   * the model has no other way to say "silent". Every bar carries a row per pad,
   * so the row goes with the pad rather than being left behind as a ghost row.
   */
  private removeMachinePadAction(): string {
    const machine = this.song.machine;
    if (!machine) return 'NO MACHINE.';
    if (machine.pads.length <= 1) return 'THE FIRST PAD STAYS.';
    const index = machine.pads.length;
    const kept = machine.pads.length - 1;
    this.record();
    machine.pads = machine.pads.slice(0, kept);
    if (machine.bars.length > 0) {
      machine.bars = machine.bars.map((bar) => bar.slice(0, kept));
    }
    this.commitMachine();
    return `PAD ${index} REMOVED`;
  }

  /**
   * Move one of a pad's voice knobs.
   *
   * The same nine knobs a channel carries, on the pad's own instrument: this is
   * what the drum machine page's PAD PARAMETERS panel edits, and it is one undo
   * step like every other knob in the app.
   */
  private setMachinePadVoiceAction(pad: number, id: VoiceParamId, value: number): string {
    const row = this.machinePad(pad);
    if (!row) return 'NO MACHINE.';
    const next = clampParam(value);
    if (row.voice[id] === next) return `${row.name} ${id.toUpperCase()} UNCHANGED`;
    this.record();
    row.voice = { ...row.voice, [id]: next };
    this.commitMachine();
    return `${row.name} ${id.toUpperCase()} ${next}`;
  }

  /** Start or stop the transport from the drum machine page's own PLAY/STOP. */
  /**
   * The transport, as one line of words — the mixer page's own PLAY report.
   *
   * Two of the three answers are plain, but not-playing after a start is not one
   * of them: `startPlayback` refuses an empty song, and the page that asked would
   * otherwise say "STOPPED" about a song it never started. The refusal's own words
   * are still the toast's business (the rule lives in `startPlayback` and stays
   * there); what is said HERE is only that the start did not take, which is the
   * one thing this door knows that the toast cannot tell a page.
   */
  private togglePlayAction(): string {
    const wasPlaying = this.engine.playing;
    this.togglePlay();
    if (wasPlaying) return 'STOPPED';
    return this.engine.playing ? 'PLAYING' : 'NOTHING TO PLAY YET - ADD A NOTE FIRST';
  }

  /** Move one of the selected pad's mix controls. */
  private setMachinePadMixAction(pad: number, id: PadMixId, value: number): string {
    const row = this.machinePad(pad);
    if (!row) return 'NO MACHINE.';
    const next = id === 'pan' ? clampPan(value) : clampLevel(value);
    if (row[id] === next) return `${row.name} ${id.toUpperCase()} UNCHANGED`;
    this.record();
    row[id] = next;
    this.commitMachine();
    return `${row.name} ${id.toUpperCase()} ${id === 'pan' ? panLabel(next) : next}`;
  }

  /** Tune one pad by semitones — the pad's own pitch, up and down. */
  /** Set a pad's tune outright — what the tune groove beside the waveform writes. */
  private setMachinePadPitchAction(pad: number, value: number): string {
    const row = this.machinePad(pad);
    if (!row) return 'NO MACHINE.';
    const next = clampMidi(value);
    if (next === row.pitch) return `${row.name} TUNE UNCHANGED`;
    this.record();
    row.pitch = next;
    this.commitMachine();
    return `${row.name}  \u00b7  TUNE ${midiToNoteName(next)}`;
  }

  private stepMachinePadPitchAction(pad: number, delta: number): string {
    const row = this.machinePad(pad);
    if (!row) return 'NO MACHINE.';
    const next = clampMidi(row.pitch + Math.round(delta));
    if (next === row.pitch) return `${row.name} IS AT THE END OF THE KEYBOARD`;
    this.record();
    row.pitch = next;
    this.commitMachine();
    return `${row.name}  \u00b7  ${midiToNoteName(next)}`;
  }

  /** Walk one pad's voice through the named presets. */
  private cycleMachinePadVoiceAction(pad: number, direction: number): string {
    const row = this.machinePad(pad);
    if (!row) return 'NO MACHINE.';
    const at = VOICES.findIndex((preset) => sameVoice(preset.params, row.voice));
    const from = at < 0 ? (direction > 0 ? -1 : VOICES.length) : at;
    const next = VOICES[(from + direction + VOICES.length) % VOICES.length];
    if (!next) return 'NO VOICES.';
    this.record();
    row.voice = copyVoice(next.params);
    this.commitMachine();
    return `${row.name} VOICE ${next.label.toUpperCase()}`;
  }

  /** Sound one pad now, so a beat can be built by ear. */
  private auditionMachinePad(pad: number): void {
    const row = this.machinePad(pad);
    if (row) this.engine.previewPad(row);
  }

  /**
   * Open the drum machine tab, giving the song a machine if it has none.
   *
   * Creating one on the way in is deliberate: the tab is the only place a machine
   * can be AUTHORED by mouse, and a tab that opened onto an empty page with no way
   * to fill it would be a dead end. A machine that arrives this way is four silent
   * kit drums, and its creation is one undo step like any other edit.
   */
  private openDrumMachine(): void {
    this.trackList.commitRename();
    this.headerLine.commit();
    this.patternTitleView.commit();
    this.scriptPanel.close();
    this.voiceMenu.hide();
    this.fileMenu.hide();
    this.songMenu.hide();
    this.mixerView.hide();
    this.patchMenu.hide();
    this.appearanceMenu.hide();
    this.helpOverlay.hide();
    this.instrumentBrowser.hide();
    if (this.song.machine === null) this.addMachine();
    this.drumView.show();
  }

  /** Create a machine for a song that has none, and bank the step. */
  private addMachine(): DrumMachine {
    this.record();
    const machine = createMachine(DEFAULT_MACHINE_STEPS);
    this.song.machine = machine;
    this.syncAudioGraph();
    this.updateHistoryButtons();
    return machine;
  }

  /**
   * The F7 menu: what a channel is MADE of — the layers under its voice.
   *
   * Every edit comes back here for the same reason F4's and F5's do: the scene
   * owns the song, the undo history and the audio graph, so the menu asks and the
   * scene changes one thing in one place. The menu reads the channel back through
   * a getter and walks it with the model's own `layerAt` / `layerCount`, so it can
   * never show a stack the song does not have.
   */
  private buildPatchMenu(): void {
    this.patchMenu = new PatchMenu(this, {
      onOpenChange: (open) => {
        // A new visit, a new undo step: the flag is what keeps the WHOLE visit to
        // one, and it has to be cleared before the first change, not after.
        if (open) this.patchEditRecorded = false;
        this.syncInputMode();
      },
      channels: () => this.trackCount,
      track: () => {
        const track = this.song.tracks[this.cursor.track];
        return {
          index: this.cursor.track,
          name: track?.name ?? 'CHANNEL',
          sound: track ?? { voice: DEFAULT_VOICE, stack: [] },
          // The effects belong to the CHANNEL, so they are read off the same
          // channel the sound came from — and through the model's own clamp, so
          // the dial can never show a number the script would refuse.
          effects: clampEffects(track),
        };
      },
      selectChannel: (index) => this.selectTrack(index),
      addLayer: () => this.addLayerAction(),
      removeLayer: (index) => this.removeLayerAction(index),
      setLayerWave: (index, wave) => this.setLayerWaveAction(index, wave),
      setLayerField: (index, id, value) => this.setLayerFieldAction(index, id, value),
      setLayerKnob: (index, id, value) => this.setLayerKnobAction(index, id, value),
      setEffect: (id, value) => this.setEffectAction(id, value),
      audition: () => this.auditionVoice(),
    });
  }

  // --- the menus ------------------------------------------------------------

  private menuIsOpen(id: MenuId): boolean {
    if (id === 'help') return this.helpOverlay.isOpen;
    if (id === 'file') return this.fileMenu.isOpen;
    if (id === 'song') return this.songMenu.isOpen;
    if (id === 'voice') return this.voiceMenu.isOpen;
    if (id === 'patch') return this.patchMenu.isOpen;
    if (id === 'instruments') return this.instrumentBrowser.isOpen;
    return this.appearanceMenu.isOpen;
  }

  /**
   * Open one menu, or close it when it is already up. The three SWAP rather
   * than stack: pressing a menu key asks for THAT menu, so a file dialog behind
   * a help screen — which is what stacking would give — cannot happen.
   *
   * Closing them all first is safe because `setOpen` only reports a change, so
   * the ones that were already closed stay quiet and the input mode is left
   * recomputed exactly once at the end.
   */
  private toggleMenu(id: MenuId): void {
    const wasOpen = this.menuIsOpen(id);
    this.helpOverlay.hide();
    this.fileMenu.hide();
    this.songMenu.hide();
    this.voiceMenu.hide();
    this.patchMenu.hide();
    this.instrumentBrowser.hide();
    this.appearanceMenu.hide();
    this.drumView.hide();
    if (wasOpen) return;
    if (id === 'help') this.helpOverlay.show();
    else if (id === 'file') this.fileMenu.show();
    else if (id === 'song') this.songMenu.show();
    else if (id === 'voice') this.voiceMenu.show();
    else if (id === 'patch') this.patchMenu.show();
    else if (id === 'instruments') this.instrumentBrowser.show();
    else this.appearanceMenu.show();
  }

  /** True while a DOM text box owns the keyboard: the script modal or a rename. */
  private get textEditing(): boolean {
    return this.scriptPanel?.isOpen === true
      || this.trackList?.isRenaming === true
      || this.headerLine?.isRenaming === true
      || this.patternTitleView?.isRenaming === true
      || this.voiceMenu?.isNaming === true
      || this.liveRenaming
      || this.recordRenaming;
  }

  /** True while ANY modal owns the input: a text box, or one of the three menus. */
  private get inputPaused(): boolean {
    return this.textEditing
      || this.mcpPanel?.isOpen === true
      || this.helpOverlay?.isOpen === true
      || this.historyMenu?.isOpen === true
      || this.instrumentBrowser?.isOpen === true
      || this.fileMenu?.isOpen === true
      || this.songMenu?.isOpen === true
      || this.voiceMenu?.isOpen === true
      || this.mixerView?.isOpen === true
      || this.patchMenu?.isOpen === true
      || this.appearanceMenu?.isOpen === true
      || this.drumView?.isOpen === true;
  }

  /**
   * While a modal is up, the app must go quiet: a letter typed into the paste
   * box or a channel name must not also write a note, the menu's arrow keys
   * must not move the cursor behind it, and a key the box wants must not be
   * swallowed by the browser as a scroll. `disableGlobalCapture` is Phaser's own
   * answer to the text-box half ("switching out to a DOM based element").
   *
   * Every modal funnels through here and it recomputes from all of them, so
   * closing one while another is open cannot hand the keyboard back early.
   */
  private syncInputMode(): void {
    if (this.inputPaused) {
      this.menuInput?.detach();
      this.input.keyboard?.disableGlobalCapture();
    } else {
      this.input.keyboard?.enableGlobalCapture();
      this.menuInput?.attach();
    }
  }

  private buildInput(): void {
    const K = Phaser.Input.Keyboard.KeyCodes;
    // Keep arrows and the gamepad for navigation, but NOT WASD — W/A/S/D are
    // piano keys in this app.
    this.menuInput = new MenuInputController(this, {
      tabPages: false,
      dirs: {
        up: { keyboard: [K.UP], padButton: 12, axis: 1, negative: true },
        down: { keyboard: [K.DOWN], padButton: 13, axis: 1, negative: false },
        left: { keyboard: [K.LEFT], padButton: 14, axis: 0, negative: true },
        right: { keyboard: [K.RIGHT], padButton: 15, axis: 0, negative: false },
      },
      keys: { pagePrev: [K.PAGE_UP], pageNext: [K.PAGE_DOWN] },
    });
    this.menuInput.attach();
    this.input.keyboard?.on('keydown', this.onKeyDown);
    this.input.on('pointerdown', () => this.engine.resume());
    // Right-click clears a cell, so the browser menu must not appear over it.
    (this.input as unknown as { mouse?: { disableContextMenu: () => void } }).mouse?.disableContextMenu();
  }

  // --- state helpers --------------------------------------------------------

  private get currentPattern(): Pattern {
    return this.song.patterns[this.patternIndex];
  }

  private get trackCount(): number {
    return this.song.tracks.length;
  }

  private patternLabel(): string {
    return `PAT ${this.patternIndex + 1}/${this.song.patterns.length}`;
  }

  // --- the pattern panel's readings ------------------------------------------

  /**
   * Move the edit cursor in EVERY reading of the panel.
   *
   * The two views are separate objects with separate painters, and one of them is
   * hidden at any moment — but the cursor is the song's, not the view's, so it is
   * pushed to both rather than to "whichever is showing". That is what makes `F8`
   * a flip rather than a move: whatever you were looking at, you are still looking
   * at it when you come back.
   */
  private setViewCursor(row: number, track: number): void {
    this.grid.setCursor(row, track);
    this.rollView?.setCursor(row, track);
  }

  /** Move the playback band in every reading of the panel. */
  private setViewPlayhead(row: number): void {
    this.grid.setPlayhead(row);
    this.rollView?.setPlayhead(row);
  }

  /**
   * Repaint one step after an edit, in every reading of the panel.
   *
   * The grid pools its cells and can rewrite a single one; the roll is small
   * enough to redraw when an edit lands, and redrawing only when the roll is on
   * screen keeps it free the rest of the time.
   */
  private refreshStep(row: number, track: number): void {
    this.grid.refreshCell(row, track);
    this.rollView?.refresh();
  }

  /**
   * Push the whole song into every view AND the audio graph. Used after any
   * structural change, so the sound and the screen are updated in one place and
   * cannot drift apart.
   */
  private syncAll(): void {
    this.sessionDirty = true;
    this.syncAudioGraph();
    this.cursor = clampCursor(this.cursor, this.currentPattern, this.trackCount);
    this.grid.setRowsPerBeat(this.song.rowsPerBeat);
    this.grid.setPattern(this.currentPattern);
    this.grid.setTrackNames(this.song.tracks.map((t) => t.name));
    this.rollView?.setPattern(this.currentPattern);
    this.rollView?.setKey(this.song.key);
    this.setViewCursor(this.cursor.row, this.cursor.track);
    // The heading names the channel, so anything that can change which channel is
    // selected (a new song, an undo, a script) has to re-label it here.
    this.updatePatternTitle(this.patternWindow.first, this.patternWindow.last);
    this.grid.setEmptyState(isPatternEmpty(this.currentPattern));
    this.trackList.setSavedVoices(this.savedVoices);
    this.trackList.setTracks(this.song.tracks);
    this.trackList.setSolos(this.solos);
    this.trackList.setSelected(this.cursor.track);
    this.keyboard.setOctave(this.octave);
    this.keyboard.setKey(this.song.key);
    this.keyboard.setChord(this.chordDegrees);
    this.transport.setPatternLabel(this.patternLabel());
    this.transport.setKey(this.song.key);
    this.updateInspector();
    // The order menu draws the song, so anything that reshapes the song has to
    // redraw it — including an undo, which can change the order under the menu.
    // (`render` is a no-op when the menu is closed: nothing is visible anyway.)
    if (this.songMenu?.isOpen) this.songMenu.render();
    // The drum machine draws the song too, so an undo under it has to repaint it.
    if (this.drumView?.isOpen) this.drumView.render();
    // And the mixer draws the whole mix, so anything that changes the song — an
    // undo, a script, another page's edit — has to repaint it as well.
    if (this.mixerView?.isOpen) this.mixerView.render();
    // And the arranger draws the song's bars and form, so the same changes must
    // repaint it — a pedal point or an edited order moves what it shows.
    if (this.arrangerView?.isOpen) this.arrangerView.render();
    // Everything that can change the song has now been seen by every view, so
    // this is also the moment to notice what the change did. It runs BEFORE the
    // header is asked for anything else, because the readout it feeds includes
    // the notice count.
    this.refreshNotices();
    this.updateHeader();
  }

  /**
   * Move the song's key by a semitone. One undo step per press, because a key
   * is song data — a stray click on `<` should be as recoverable as a stray
   * note, and it is not navigation.
   */
  private stepTonic(delta: number): void {
    const tonic = cycleTonic(this.song.key.tonic, delta);
    this.setKey({ tonic, scale: this.song.key.scale });
  }

  /** The mouse's answer to a script's `key`, and the hint's to a lost beginner. */
  private cycleScale(): void {
    const scale = cycleScale(this.song.key.scale, 1);
    this.setKey({ tonic: this.song.key.tonic, scale });
  }

  /**
   * Move the song on to the next FEEL — the mouse's answer to a script's
   * `groove`, and the reason the button can teach: every press lands on a named
   * pocket and says what it is.
   *
   * No undo step, deliberately, and for the reason `setSwing` above has none:
   * this sits in the transport with tempo and swing, and those three are the
   * by-ear controls you try while the song runs. Cycling is the undo — six
   * presses at most get back to STRAIGHT — and a Ctrl+Z that reached back past
   * an edit made while you were listening would be worse than no undo at all.
   */
  private cycleGroove(): void {
    const groove = nextGroove(this.song.groove);
    this.song.groove = groove;
    this.engine.setGroove(groove);
    this.transport.setGroove(groove);
    const feel = grooveById(groove);
    if (feel) this.toast.show(`${feel.label}  \u00b7  ${feel.blurb}`, activeColors().ooze);
  }

  /**
   * Move the song on to the next TEMPERAMENT — the mouse's answer to a script's
   * `tuning`, and an audible A/B: the engine is re-tuned at once, so the next
   * note played is heard under the new temperament and the status line names it.
   *
   * No undo step, deliberately, and for the reason `cycleGroove` has none: this
   * is a by-ear control you try while the song runs, and cycling is the undo.
   */
  private cycleTuning(): string {
    const tuning = nextTuning(this.song.tuning);
    this.song.tuning = tuning;
    this.engine.setTuning(tuningFor(tuning), this.song.key.tonic);
    const temperament = tuningById(tuning);
    if (temperament) this.toast.show(`${temperament.label}  \u00b7  ${temperament.blurb}`, activeColors().ooze);
    return temperament ? `${temperament.label}` : '';
  }

  /**
   * Set the song's key: one field, three paths (the KEY control, a click on the
   * scale button, and a script's `key` line), so they cannot disagree.
   */
  private setKey(key: SongKey): void {
    if (sameKey(key, this.song.key)) return;
    this.record();
    this.song.key = copyKey(key);
    this.syncKey();
    this.updateInspector();
    this.updateHistoryButtons();
    const scale = scaleById(key.scale);
    this.toast.show(`${keyName(key)}  \u00b7  ${scale.blurb}`, activeColors().ward);
  }

  /**
   * Push the key into the two views that draw it: the control that sets it and
   * the piano that shows it.
   *
   * The GRID is deliberately not one of them. Dimming out-of-key notes in the
   * pattern was the first thing this feature did, and it was wrong: the shipped
   * example songs — written carefully, by ear — are 5-18% out-of-key notes,
   * because that is what seventh chords, borrowed chords and passing tones ARE.
   * A grid that tints a fifth of a good song is an app with opinions about music
   * it cannot hear. The piano is where a note is CHOSEN, so guidance there is
   * help; the grid is where a song is read, so judgement there is noise.
   */
  private syncKey(): void {
    this.transport.setKey(this.song.key);
    this.keyboard.setKey(this.song.key);
    // The TUNING is read against the key, so a key change re-points it too — a
    // song tuned `just` in C and moved to D is now pure in D, which is the whole
    // reason the temperament is anchored to the tonic.
    this.engine.setTuning(tuningFor(this.song.tuning), this.song.key.tonic);
  }

  private updateHeader(): void {
    const pattern = this.currentPattern;
    this.headerLine.setTitle(this.song.title);
    // The bar count joins the readout only when the song HAS an arrangement, so
    // a one-pattern song reads exactly as it always did.
    const bars = this.song.order.length > 1 ? `  \u00b7  ${this.song.order.length} BARS` : '';
    this.headerLine.setMeta(
      `PAT ${this.patternIndex + 1}  \u00b7  ${pattern.steps.length} STEPS  \u00b7  ${this.trackCount} TRACKS  \u00b7  ${countNotes(pattern)} NOTES${bars}`,
    );
  }

  /**
   * Say what has just been noticed, and remember what has been said.
   *
   * This is the app's end of the "noticed something" channel the model has
   * always computed and no person could see: `advisoriesFor` returns empty
   * patterns, silent channels, stacks that add up past full scale, a form nobody
   * arranged — all of them one line away from finished, none of them mistakes.
   * It hung off `script.summarize`, so an author working the grid with a mouse
   * never heard a word of it.
   *
   * Two rules keep it from becoming noise. It speaks ONCE per notice: the diff
   * against what was true last time is the model's (`noticesAdded`), so a notice
   * that is still true is not re-announced on the next keystroke, while one that
   * goes away and comes back speaks again. And it speaks in the TOAST, which is
   * the app's existing rail for a remark that is not an error — never a dialog,
   * which is the plan's own rule for this channel.
   *
   * Called from `syncAll`, which is the one place every change to the song passes
   * through, so an undo, a script, a paste and a keystroke are all noticed alike.
   */
  private refreshNotices(): void {
    const current = noticesFor(this.song, this.bounceRange());
    for (const notice of noticesAdded(this.noticed.map((n) => n.text), current)) {
      // The long form when it fits (the example is the actionable half) and the
      // first sentence when it does not, because a toast that runs off the
      // screen is worse than a short one.
      this.toast?.show(noticeToast(notice.text, NOTICE_TOAST_CHARS).toUpperCase(), activeColors().ward);
    }
    this.noticed = current;
    if (this.noticeCursor >= current.length) this.noticeCursor = 0;
    this.renderNotices();
  }

  /**
   * Draw the notice line, or take it away.
   *
   * An empty readout is not a readout that says nothing — it is one that is not
   * there, which is why this hides the line and disables its click target rather
   * than leaving `NOTICED 0` on the screen: a count of nothing is the kind of
   * permanent label the eye stops seeing, and then the number that matters goes
   * unseen with it.
   */
  private renderNotices(): void {
    const count = this.noticed.length;
    if (count === 0) {
      this.noticeText.setText('').setVisible(false);
      this.noticeZone.disableInteractive();
      return;
    }
    const notice = noticeAt(this.noticed, this.noticeCursor);
    if (notice === undefined) return;
    this.noticeText
      .setText(`NOTICED ${noticePosition(this.noticeCursor, count)}  \u00b7  ${noticeTag(notice.text, NOTICE_TAG_CHARS).toUpperCase()}`)
      .setVisible(true);
    // The click target is exactly the words, so the strip stays empty where it
    // looks empty.
    this.noticeZone.setSize(this.noticeText.width, 10).setInteractive();
    // And the rail, when this one has a line that answers it: `FIX` is drawn only
    // where pressing it would DO something, because a button that does nothing on
    // some notices teaches a person to stop looking at it.
    this.noticeFixButton.container.setVisible(notice.fix !== null);
  }

  /**
   * Ask for the notices: show this one in full, then move to the next.
   *
   * The line under the header is a SUMMARY and its own text is cut to fit, so the
   * example a notice carries — "turn one down, e.g. `layer 3 3 gain 40`" — is not
   * on it. Asking is what gets the whole sentence, which is why this is a click
   * and not a hover: it is the difference between knowing something is off and
   * knowing what to do about it.
   */
  private nextNotice(): void {
    const notice = noticeAt(this.noticed, this.noticeCursor);
    if (notice === undefined) return;
    this.toast.show(noticeToast(notice.text, NOTICE_ASK_CHARS).toUpperCase(), activeColors().ward);
    this.noticeCursor += 1;
    this.renderNotices();
  }

  /**
   * Apply the line a notice carries: the rail half of "rails, not errors".
   *
   * It goes through the LANGUAGE — the same parser and applier a script uses —
   * rather than a bespoke mutation per observation. That matters twice: a fix
   * cannot drift from what the docs say the line does, because it IS the line,
   * and the toast names the line it wrote, so pressing the button teaches the
   * word rather than hiding it. One `record()` per press, so it is one `Ctrl+Z`
   * like every other edit.
   *
   * Unlike a pasted script this keeps the session's PLACE: the cursor, the
   * pattern on screen, the solos and the loop region belong to the author, and a
   * fix is not a reason to move them.
   */
  private applyNoticeFix(): void {
    const notice = noticeAt(this.noticed, this.noticeCursor);
    if (notice === undefined || notice.fix === null) return;
    const result = applyScript(this.song, notice.fix, this.savedVoices);
    if (!result.ok) {
      // A fix the language refuses is a bug in the fix rather than in the song,
      // and saying so where the person can see it beats a button that does
      // nothing at all.
      const why = result.errors[0]?.message.toUpperCase() ?? 'THAT FIX DID NOT APPLY';
      this.toast.show(`FIX REFUSED  \u00b7  ${why}`, activeColors().danger);
      return;
    }
    this.record();
    this.song = result.song;
    this.syncAll();
    this.updateHistoryButtons();
    this.toast.show(`FIXED  \u00b7  ${notice.fix.toUpperCase()}`, activeColors().ward);
  }

  /**
   * Rename the song from the shift-click box in the header. This is the exact
   * counterpart of a script's `song "MY TUNE"`: same model field, same undo
   * step, so a title typed by hand and a title written in a script are one thing.
   */
  private renameSong(title: string): void {
    const clean = tidySongTitle(title);
    if (clean === '' || clean === this.song.title) return;
    this.record();
    this.song.title = clean;
    this.syncAll();
    this.updateHistoryButtons();
    this.toast.show(`SONG  ${clean}`, activeColors().textGreen);
  }

  /** The cell inspector: what the cursor is on, and how to change it. */
  private updateInspector(): void {
    const c = activeColors();
    const cell = cellAt(this.currentPattern, this.cursor.row, this.cursor.track);
    const note = cell?.note ?? null;
    // A DRUM reads as its own name rather than as the pitch it is played at: the
    // read-out answers "what does this step play", and `KICK` is that answer where
    // `C-2` is only the number the kit happens to use for it.
    this.inspectorNote.setText(
      cell?.drum != null ? cell.drum.toUpperCase() : note === null ? EMPTY_CELL : midiToNoteName(note),
    );
    this.inspectorNote.setColor(cssOf(note === null ? c.textDim : trackColor(this.cursor.track, c)));
    // The velocity, which is a property of the NOTE and so reads beside it — with
    // the keys that change it, because this is the one control in the app with no
    // button of its own to advertise it, and the read-out is where the eye already
    // is. An empty step says `--` rather than `0%`: there is no note to be soft,
    // and a percentage there would look like something a keypress could change.
    const velocity = cell && cell.note !== null ? velocityLabel(cell.velocity) : '--';
    this.inspectorVelocity.setText(`[ ] VEL ${velocity}`);
    this.inspectorVelocity.setColor(cssOf(cell && cell.note !== null ? c.textPrimary : c.textDim));
    // The articulation, in the same shape: the keys, then what they do to THIS
    // note. A cell with no note reads `--` for the same reason the velocity does;
    // a note that says nothing reads `--` too, because `1` hit is not a stutter.
    const art = cell && cell.note !== null ? articulationLabel(tidyArticulation(cell)) : '';
    this.inspectorArticulation.setText(`> * ART ${art === '' ? '--' : art}`);
    this.inspectorArticulation.setColor(cssOf(art === '' ? c.textDim : c.textPrimary));
    const track = this.song.tracks[this.cursor.track];
    // A CHORD is the one thing about a cell the grid cannot show: three characters
    // hold one pitch, so a chord wears `+N` there and the notes it stands for are
    // spelled out here, where there is width for them.
    const held = cell ? cellNotes(cell) : [];
    const chord = held.length > 1 ? `  \u00b7  ${held.map((midi) => midiToNoteName(midi)).join(' ')}` : '';
    this.inspectorSub.setText(
      `${track?.name ?? 'TRACK'}  \u00b7  STEP ${String(this.cursor.row).padStart(2, '0')}${chord}`,
    );
    this.inspectorKeyHint.setText(this.keyHintFor(note));
    // The hold control reads the SELECTED channel, so it is refreshed wherever
    // the cursor's readouts are — moving to another channel changes what it acts
    // on, and a label that lagged would be a control that lies.
    this.holdButton?.setText(this.holdLabel());
    this.keyboard.setCursorNote(note);
  }

  /**
   * "KEY C" when the note under the cursor is one of the keys on screen. This
   * closes the loop the whole app is built on: press a key, get a note, and see
   * which key made which note.
   */
  private keyHintFor(note: number | null): string {
    const base = this.noteHintFor(note);
    // In chord mode the hint gains the payoff: the name of the chord that this
    // very key would write. It is the fastest way to learn that F under A minor
    // is a major chord and A is a minor one, without either word being taught.
    if (this.chordDegrees <= 0 || note === null) return base;
    const stack = diatonicChord(note, this.song.key, this.chordDegrees);
    const name = chordName(stack);
    // A stack with no standard name — which is what the pentatonic scale mostly
    // gives, because "every other note" of five notes is not a triad — keeps the
    // plain hint rather than trailing a dangling "+ ".
    return name === '' ? base : `${base}  \u00b7  + ${name}`;
  }

  /**
   * Soften or accent the note under the cursor, 10% a press.
   *
   * The one per-NOTE control in the app, so it is the one edit that does not
   * touch the channel: `hold` and `level` are the channel's, and this is the
   * force of this single hit. It costs one undo step a press, like typing a note
   * and like the HOLD control, and it re-auditions the note so the change is
   * heard at the moment it is made rather than the next time the song plays.
   *
   * An empty step refuses rather than remembering a velocity for a note that does
   * not exist yet — the same reason a bar with no note reads `--`.
   */
  private nudgeVelocity(steps: number): void {
    const cell = cellAt(this.currentPattern, this.cursor.row, this.cursor.track);
    if (!cell || cell.note === null) {
      this.toast.show('NO NOTE HERE TO SOFTEN OR ACCENT', activeColors().textDim);
      return;
    }
    const next = stepVelocity(cell.velocity, steps);
    if (next === cell.velocity) return;
    this.record();
    cell.velocity = next;
    this.refreshStep(this.cursor.row, this.cursor.track);
    this.engine.previewNote(this.cursor.track, cell.note);
    this.updateInspector();
    this.updateHistoryButtons();
  }

  /**
   * Toggle whether the note under the cursor slides into its pitch.
   *
   * The `>` key, which is the character the language writes for this — a note
   * that arrives at its pitch rather than starting on it. Only the note is
   * touched (the channel's `glide` is a different question and stays where it
   * is), so this is the same one-undo-step-per-press edit that the velocity keys
   * make, and the note is re-auditioned as an arrival so the gesture is heard at
   * the moment it is written.
   */
  private toggleSlide(): void {
    const cell = cellAt(this.currentPattern, this.cursor.row, this.cursor.track);
    if (!cell || cell.note === null) {
      this.toast.show('NO NOTE HERE TO SLIDE INTO', activeColors().textDim);
      return;
    }
    this.record();
    cell.slide = !cell.slide;
    this.refreshStep(this.cursor.row, this.cursor.track);
    this.engine.previewArticulation(this.cursor.track, cell.note, tidyArticulation(cell));
    this.updateInspector();
    this.updateHistoryButtons();
  }

  /**
   * Step the note under the cursor's stutter count: 1, 2, ... 8, back to 1.
   *
   * Up rather than down because the count is a number, and a number you press to
   * raise wraps to "hit it plainly" the way the chord and length buttons wrap to
   * their own off state. `1` is a plain note rather than a stutter of one, so the
   * read-out says `--` when the key has come all the way round.
   */
  private cycleStutter(): void {
    const cell = cellAt(this.currentPattern, this.cursor.row, this.cursor.track);
    if (!cell || cell.note === null) {
      this.toast.show('NO NOTE HERE TO STUTTER', activeColors().textDim);
      return;
    }
    const next = cell.stutter >= MAX_STUTTER ? DEFAULT_STUTTER : cell.stutter + 1;
    if (next === cell.stutter) return;
    this.record();
    cell.stutter = next;
    this.refreshStep(this.cursor.row, this.cursor.track);
    this.engine.previewArticulation(this.cursor.track, cell.note, tidyArticulation(cell));
    this.updateInspector();
    this.updateHistoryButtons();
  }

  private noteHintFor(note: number | null): string {
    if (note === null) return 'TYPE OR CLICK A KEY';
    const offset = note - baseMidiForOctave(this.octave);
    const inKey = isInKey(note, this.song.key);
    // An out-of-key note keeps every hint it had, and gains the one fact the
    // grid can only whisper: this note is outside the song's key. Saying it here
    // — at the cell you just wrote — is the moment it is worth knowing.
    const aside = inKey ? '' : `  \u00b7  NOT IN ${keyName(this.song.key)}`;
    if (offset < 0 || offset >= 24) return `OUTSIDE OCT ${this.octave}-${this.octave + 1}${aside}`;
    const key = keyForSemitone(offset);
    return key ? `PRESS  ${key}${aside}` : aside.trim();
  }

  private updateHistoryButtons(): void {
    this.undoButton.setEnabled(this.history.canUndo);
    this.redoButton.setEnabled(this.history.canRedo);
  }

  private afterEdit(): void {
    this.grid.setEmptyState(isPatternEmpty(this.currentPattern));
    this.updateHeader();
    this.updateInspector();
    this.updateHistoryButtons();
  }

  // --- history --------------------------------------------------------------

  private snapshot(): Snapshot {
    return {
      song: structuredClone(this.song),
      patternIndex: this.patternIndex,
      cursor: { ...this.cursor },
    };
  }

  /** Remember the state BEFORE an edit, so it can be stepped back to. */
  private record(): void {
    this.history.record(this.snapshot());
    // An edit is the thing worth not losing, and a grid edit may not go through
    // `syncAll` at all — so the flag is set here too rather than only there.
    this.sessionDirty = true;
  }

  private applySnapshot(state: Snapshot): void {
    // An undo can change the DIALS as well as the grid, so it is a settings change
    // like any other: a run still echoing from before the step back would be the
    // page sounding a song that is no longer on screen.
    this.stopArpEcho();
    this.song = state.song;
    this.patternIndex = Math.min(state.patternIndex, this.song.patterns.length - 1);
    this.cursor = state.cursor;
    this.syncAll();
  }

  // --- the working session ---------------------------------------------------

  /**
   * What a saved session carries beside the song text.
   *
   * The settings a `.json` file does NOT hold: the octave, the solo, the chord
   * mode, the audition toggle, and the two session-only export choices. The
   * master level is NOT here — `songToJson` already writes it into the song text
   * and the file reader brings it back — and neither is the theme, which has its
   * own key and its own memory. The shape is `ScriptSettings` because that is
   * exactly what `applyScriptSettings` consumes, so a restored session and a
   * pasted script set a setting through the same code path.
   *
   * The export choices are included ONLY when they say something: a region that
   * is the whole song and a loudness target of null are the defaults, and stating
   * them would make every restore announce an export nobody asked for.
   */
  private sessionSettings(): ScriptSettings {
    const settings: ScriptSettings = {
      volume: this.volume,
      octave: this.octave,
      solo: this.solos.flatMap((on, i) => (on ? [i + 1] : [])),
      chordDegrees: this.chordDegrees,
      hearNotes: this.previewOnMove,
    };
    const bounce = this.bounceRange();
    if (bounce !== null) settings.bounce = bounce;
    if (this.loudness !== null) settings.loud = this.loudness;
    return settings;
  }

  /** Write the working session out. Best-effort: a store that refuses is silent. */
  private saveSessionNow(): void {
    saveSession(sessionValue(songToJson(this.song, { volume: this.volume }), this.sessionSettings()));
  }

  /**
   * Put back the song and settings from the last session, if there is a usable
   * one. Returns whether anything was restored.
   *
   * The song goes through the SAME reader a file does (`parseSongFile`), so a
   * session a future build wrote, or a half-written one, is refused by the file
   * format's own rules rather than trusted for being ours — and a refusal changes
   * nothing, exactly as an OPEN does. No undo step is recorded: there is nothing
   * on screen to step back TO on a fresh boot, and a `Ctrl+Z` that reverted to a
   * blank song would be the app losing work under the guise of restoring it.
   */
  private restoreSession(): boolean {
    const session = loadSession();
    if (session === null) return false;
    const parsed = parseSongFile(session.song);
    if (!parsed.ok) return false;
    this.song = parsed.song;
    this.patternIndex = 0;
    this.cursor = { row: 0, track: 0 };
    this.solos = this.song.tracks.map(() => false);
    // The file's own settings first (a JSON carries the master level), then the
    // session's on top — the same order `openFileAction` applies them in.
    this.applyScriptSettings(parsed.settings);
    this.applyScriptSettings(session.settings);
    this.toast.show(`WELCOME BACK  \u00b7  ${this.song.title}`, activeColors().ward);
    return true;
  }

  /**
   * Re-point the audio graph at the song: channel count, sounds, levels, mutes
   * and tempo. Kept in one place because undo, a script apply and the +ADD/-DEL
   * buttons all change the song the same way, and the engine has to follow all
   * of them or the sound and the screen drift apart.
   */
  private syncAudioGraph(): void {
    this.engine.setTrackCount(this.trackCount);
    // Whole SOUNDS rather than voices: a channel's patch is its voice plus any
    // layers stacked above it, and undo, a script apply and OPEN all have to
    // re-point the engine at exactly what the song says.
    this.engine.setTrackPatches(this.song.tracks);
    this.engine.setHolds(this.song.tracks.map((t) => t.hold));
    this.engine.setLevels(this.song.tracks.map((t) => t.level));
    // The GROUPS, handed over as the song's own buses plus which one each channel
    // is on: the engine resolves the two into one number per channel, so a group
    // fader is a normal level as far as the whole audio path is concerned.
    this.engine.setBuses(this.song.buses, this.song.tracks.map((t) => t.bus));
    this.engine.setPans(this.song.tracks.map((t) => t.pan));
    // How much of each channel stands in the room. Travelling with the song
    // matters more here than anywhere: the room itself is two numbers, and a
    // send left behind on an undo would put a channel in a room that the song
    // no longer has.
    this.engine.setVerbs(this.song.tracks.map((t) => t.verb));
    this.engine.setEchoes(this.song.tracks.map((t) => t.echo));
    // A channel's expression travels with it, like its level and its sound, so a
    // script apply, an undo or an OPEN re-points all of them together.
    this.engine.setGlides(this.song.tracks.map((t) => t.glide));
    this.engine.setVibratos(this.song.tracks.map((t) => t.vibrato));
    this.engine.setStrums(this.song.tracks.map((t) => t.strum));
    // And the two that make a part sound played rather than typed: how much the
    // hits differ from each other, and how much a note's tone follows the force.
    // They travel with the song for exactly the same reason glide does.
    this.engine.setRobins(this.song.tracks.map((t) => t.robin));
    this.engine.setTouches(this.song.tracks.map((t) => t.touch));
    // And how far each channel's pitch wanders — the worn-machine wobble, which a
    // lane can move and which the synth reads when it builds each note.
    this.engine.setDrifts(this.song.tracks.map((t) => t.drift));
    // The effects, handed over whole and per channel (a `Track` IS the set
    // the engine wants). Whole, because which effects are ON decides the shape
    // of each channel's graph: an undo that turned one effect off has to be able
    // to take the node back out, not merely turn it down.
    this.engine.setEffects(this.song.tracks);
    // Which channels push the rest of the mix down when they hit. Handed over as
    // one array because it is one question about the whole song — "is anybody
    // ducking?" decides the shape of every channel's graph — and read per hit.
    this.engine.setDucks(this.song.tracks.map((track) => track.duck));
    // The MIX's effects travel with the song for the same reason the
    // channels' do, and with the same consequence: an undo that took the drive
    // off the master has to take the node back out of the graph, not merely turn
    // it down.
    this.engine.setMasterEffects(this.song.master);
    // The room travels with the song, so an undo, a script apply or an OPEN all
    // re-point the reverb and echo the same way they re-point the mix.
    this.engine.setReverb(this.song.reverb);
    this.engine.setEcho(this.song.echo);
    // After the count, because a shorter song must not leave a solo pointing at
    // a channel that no longer exists.
    this.solos.length = Math.min(this.solos.length, this.trackCount);
    this.engine.setSolos(this.solos);
    this.song.tracks.forEach((track, i) => this.engine.setMuted(i, track.muted));
    this.engine.setBpm(this.song.bpm);
    // The tempo MAP, resolved once into a tempo per step. Set after the base
    // bpm, which is what the map leans away FROM, so a song with no map gets an
    // array of that one number and schedules exactly as it always did.
    this.engine.setTempos(songTempos(this.song));
    // The LANES travel with the song like everything else here, and they are
    // handed over with a bar's length because a lane counts in bars: one bar of
    // the arrangement is one pattern, the same arithmetic the tempo map does.
    this.engine.setAutomation(this.song.automation, patternRows(this.song));
    this.engine.setRowsPerBeat(this.song.rowsPerBeat);
    this.engine.setSwing(this.song.swing);
    // The tape transport travels with the song too: one number that the row clock
    // divides by and the synth multiplies the pitch by, so a saved `speed 80`
    // plays back as the slower, lower record it was written as.
    this.engine.setSpeed(this.song.speed);
    // The FEEL travels with the song like the swing amount does, so an undo, a
    // script apply or an OPEN re-points what the song is played with rather than
    // leaving the last song's pocket under the new one. Each CHANNEL's own feel
    // and looseness ride along with it, for the same reason and in one call.
    this.engine.setGroove(this.song.groove);
    // The KIT travels with the song for the same reason the feel does: a script
    // apply, an OPEN or an undo re-points what the drums SOUND like rather than
    // leaving the last song's kit under the new one.
    this.engine.setKit(this.song.kit, this.savedKits);
    // The DRUM MACHINE travels with the song too: one more part of the mix, with
    // its own pads, fader, sends, duck and effects. Null is a song with none,
    // which is every song written before this and plays exactly as it did.
    this.engine.setMachine(this.song.machine);
    // And which BAR of the machine each song bar plays, with the sections' own
    // choices folded in — so `section CHORUS 3 4 machine 2` reaches the audio the
    // same way it reaches the file. Empty when no section names one.
    this.engine.setMachineBars(machineBarsForSong(this.song));
    // And which recording of YOURS each channel plays. Handed over as the bank
    // plus the song's names, because the two live in different places and only
    // the app knows which of them it has: the engine resolves the pair into one
    // recording per channel, and a name with no file behind it becomes "play the
    // built-in one-shot", which is the fallback the whole design leans on.
    this.pushBankToEngine();
    this.engine.setFeels(
      this.song.tracks.map((track) => track.groove),
      this.song.tracks.map((track) => track.humanize),
    );
    // How many notes each channel may hold at once, so `track 3 poly 6` is heard
    // from the next note scheduled rather than from the next song. Read when a
    // note is queued, so it takes effect without disturbing what is already in
    // the pipeline.
    this.engine.setPolys(this.song.tracks.map((track) => track.poly));
    // The TEMPERAMENT travels with the song like the feel does — and it is read
    // against the song's own key, so a tuning and a key can never disagree.
    this.engine.setTuning(tuningFor(this.song.tuning), this.song.key.tonic);
    this.transport.setTempo(this.song.bpm);
    this.transport.setSwing(this.song.swing);
    this.transport.setGroove(this.song.groove);
  }

  private undo(): void {
    const restored = this.history.undo(this.snapshot());
    if (!restored) {
      this.toast.show('NOTHING TO UNDO', activeColors().textDim);
      return;
    }
    this.applySnapshot(restored);
    this.updateHistoryButtons();
    this.forgetVisitSteps();
  }

  private redo(): void {
    const restored = this.history.redo(this.snapshot());
    if (!restored) {
      this.toast.show('NOTHING TO REDO', activeColors().textDim);
      return;
    }
    this.applySnapshot(restored);
    this.updateHistoryButtons();
    this.forgetVisitSteps();
  }

  /**
   * Step `back` states into the past at once — what the F10 list's Enter does.
   *
   * It is `undo`, run `back` times: each call parks the state it was handed on the
   * redo stack and returns the one before it, so feeding the result back in walks
   * the timeline while leaving the redo branch exactly where that many single
   * presses would have. There is no shortcut path and no second notion of "the
   * past" — which is the whole reason a jump cannot surprise anyone who knows
   * what `Ctrl+Z` does.
   */
  private jumpHistory(back: number): void {
    let state: Snapshot | null = null;
    for (let i = 0; i < back; i += 1) state = this.history.undo(state ?? this.snapshot());
    if (!state) return;
    this.applySnapshot(state);
    this.updateHistoryButtons();
    this.forgetVisitSteps();
  }

  /**
   * Forget that an open menu has already banked its one undo step.
   *
   * `F4` and `F7` keep a whole visit to a single step, which is the right bargain
   * for something you fiddle with — but it is only right while the song under the
   * menu is the song the visit started from. A step taken back (or forward) makes
   * that snapshot stale, so the next nudge in an open menu banks a fresh one
   * rather than burying the redo the user just asked for.
   */
  private forgetVisitSteps(): void {
    this.voiceEditRecorded = false;
    this.patchEditRecorded = false;
  }

  // --- intents --------------------------------------------------------------

  private setSelection(next: Cursor, allowPreview = true): void {
    this.cursor = clampCursor(next, this.currentPattern, this.trackCount);
    this.setViewCursor(this.cursor.row, this.cursor.track);
    this.trackList.setSelected(this.cursor.track);
    // The heading names the channel, so moving into another one re-labels it.
    this.updatePatternTitle(this.patternWindow.first, this.patternWindow.last);
    this.updateInspector();
    if (allowPreview && this.previewOnMove) this.previewCursorNote();
  }

  private previewCursorNote(): void {
    const note = cellAt(this.currentPattern, this.cursor.row, this.cursor.track)?.note ?? null;
    if (note !== null) this.engine.previewNote(this.cursor.track, note);
  }

  private selectTrack(index: number): void {
    this.setSelection({ row: this.cursor.row, track: index });
  }

  private moveSelection(dRow: number, dTrack: number): void {
    this.setSelection(moveCursor(this.cursor, dRow, dTrack, this.currentPattern, this.trackCount));
  }

  private enterNote(midi: number): void {
    const pattern = this.currentPattern;
    const { row, track } = this.cursor;
    const note = clampMidi(midi);
    const before = cellAt(pattern, row, track)?.note ?? null;
    if (before !== note) this.record();
    writeNote(pattern, row, track, note);
    this.refreshStep(row, track);
    this.engine.previewNote(track, note);
    // Trackers advance after a note — typing a melody is one key per note.
    this.setSelection({ row: Math.min(row + 1, pattern.steps.length - 1), track }, false);
    this.afterEdit();
  }

  /** What the chord control says: off, or the size of chord one key writes. */
  private chordLabel(): string {
    if (this.chordDegrees <= 0) return 'CHORDS: OFF';
    return this.chordDegrees >= MAX_CHORD_DEGREES ? 'CHORDS: 7TH' : 'CHORDS: TRIAD';
  }

  /** What the note-length control says: how long notes ring on this channel. */
  private holdLabel(): string {
    return `HOLD: ${this.song.tracks[this.cursor.track]?.hold ?? 1}`;
  }

  /**
   * Cycle the SELECTED channel's note length: 1 → 2 → 4 → 8 → 16 steps, and
   * round again.
   *
   * It lives in the inspector because that panel already describes the channel
   * you are writing into, and because a per-channel setting needs exactly one
   * place to read it and one place to change it. One undo step per press, like
   * the key and the chord size.
   */
  private cycleHold(): void {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return;
    const next = nextHold(track.hold);
    if (next === track.hold) return;
    this.record();
    track.hold = next;
    this.engine.setHold(this.cursor.track, next);
    this.updateInspector();
    this.updateHistoryButtons();
    this.toast.show(
      `${track.name} HOLDS NOTES FOR ${next} STEP${next === 1 ? '' : 'S'}`,
      activeColors().ward,
    );
  }

  /**
   * OFF -> TRIAD -> 7TH -> OFF.
   *
   * Triads first because that is what "a chord" means to a beginner, and back to
   * off at the end because a mode you cannot leave is a trap — the same key that
   * turned it on turns it off.
   */
  private cycleChordDegrees(): void {
    const next = this.chordDegrees <= 0 ? TRIAD_SIZE
      : this.chordDegrees < MAX_CHORD_DEGREES ? MAX_CHORD_DEGREES : 0;
    this.setChordDegrees(next);
  }

  /**
   * Set the chord size and tell everyone who draws it: the control's own label,
   * the piano (which relabels each key with the chord it would write), and the
   * inspector hint (which spells out the chord under the cursor).
   */
  private setChordDegrees(degrees: number): void {
    this.chordDegrees = degrees;
    this.chordButton.setText(this.chordLabel());
    this.keyboard.setChord(degrees);
    this.updateInspector();
    this.toast.show(
      degrees <= 0 ? 'CHORDS OFF' : `CHORDS ON  \u00b7  1 KEY = ${degrees} NOTES`,
      degrees <= 0 ? activeColors().textDim : activeColors().ward,
    );
  }

  /**
   * Write a whole chord at the cursor, one note per channel.
   *
   * This is the same act as `enterNote` done several times over, and it is
   * deliberately the same shape: one undo step, the cursor advances one row, and
   * the cell inspector refreshes. The chord itself comes from the song's KEY, so
   * the notes are always the ones that belong together there — the player chose
   * a root, and the app supplied the harmony.
   *
   * The notes spread ACROSS the channels rather than piling into one cell,
   * because a tracker cell holds a single note; three channels playing at one
   * step is what a chord has always been in this kind of music.
   */
  private enterChord(midi: number): void {
    const pattern = this.currentPattern;
    const { row, track } = this.cursor;
    const notes = diatonicChord(clampMidi(midi), this.song.key, this.chordDegrees);
    // A WIDE channel keeps the whole chord in ONE cell: that is what widening a
    // channel is FOR, and it is the difference between a triad costing three
    // channels and costing one. A channel that holds one note at a time — every
    // channel before `poly` existed — spreads the notes, below.
    const capacity = clampPoly(this.song.tracks[track]?.poly ?? DEFAULT_POLY);
    if (capacity >= notes.length) {
      const cell = cellAt(pattern, row, track);
      const held = cell ? cellNotes(cell) : [];
      const changed = held.length !== notes.length || notes.some((note, i) => held[i] !== note);
      if (changed) this.record();
      writeChord(pattern, row, track, notes, capacity);
      this.refreshStep(row, track);
      // Every note is auditioned, because the point of the gesture is hearing the
      // chord the channel can now hold.
      for (const note of notes) this.engine.previewNote(track, note);
      // One key per step, exactly as a single note: the cursor still advances one
      // row and stays on the channel the chord was rooted on.
      this.setSelection({ row: Math.min(row + 1, pattern.steps.length - 1), track }, false);
      this.afterEdit();
      const label = chordName(notes);
      this.toast.show(`${label === '' ? describeChord(notes) : label}  \u00b7  ONE CELL`, activeColors().ward);
      return;
    }
    if (track + notes.length > this.trackCount) {
      this.toast.show(
        `CHORDS NEED ${notes.length} TRACKS FROM HERE  \u00b7  ADD TRACKS`,
        activeColors().danger,
      );
      return;
    }
    const changed = notes.some((note, i) => (cellAt(pattern, row, track + i)?.note ?? null) !== note);
    if (changed) this.record();
    notes.forEach((note, i) => {
      writeNote(pattern, row, track + i, note);
      this.refreshStep(row, track + i);
      this.engine.previewNote(track + i, note);
    });
    // Like a single note, a chord advances the row and stays on its root channel,
    // so playing chords is one key per step and the next one lands under it.
    this.setSelection({ row: Math.min(row + 1, pattern.steps.length - 1), track }, false);
    this.afterEdit();
    // Name the chord when it has a name; otherwise list what was written, so the
    // toast never comes up empty.
    const name = chordName(notes);
    this.toast.show(name === '' ? describeChord(notes) : name, activeColors().ward);
  }

  private clearCellAt(cell: Cursor): void {
    if (cellAt(this.currentPattern, cell.row, cell.track)?.note == null) return;
    this.record();
    clearCell(this.currentPattern, cell.row, cell.track);
    this.refreshStep(cell.row, cell.track);
    this.afterEdit();
  }

  // --- the piano roll -------------------------------------------------------

  /**
   * A note was clicked on the ROLL: write that pitch on that step, and stay put.
   *
   * The cursor moves there first, so the click is the same act as clicking a grid
   * cell followed by a key — but the cursor does NOT step forward afterwards the
   * way `enterNote` makes it. A roll is a picture of a line in TIME, and a cursor
   * that jumped one step right on every click would make drawing a chord a chase.
   *
   * One undo step per note, exactly as typing one is, and the audition is the
   * channel's own voice, so a line can be played in by ear.
   */
  private writeRollNote(step: number, midi: number): void {
    const pattern = this.currentPattern;
    if (step < 0 || step >= pattern.steps.length) return;
    this.setSelection({ row: step, track: this.cursor.track }, false);
    const track = this.cursor.track;
    const note = clampMidi(midi);
    if ((cellAt(pattern, step, track)?.note ?? null) !== note) this.record();
    writeNote(pattern, step, track, note);
    this.engine.previewNote(track, note);
    this.refreshStep(step, track);
    this.afterEdit();
  }

  /**
   * A roll note was right-clicked: take it out, but only when that step really
   * holds that pitch — the roll's `clearLane`, one dimension over.
   */
  private clearRollNote(step: number, midi: number): void {
    const track = this.cursor.track;
    const cell = cellAt(this.currentPattern, step, track);
    if (!cell || !cellNotes(cell).includes(midi)) return;
    this.setSelection({ row: step, track }, false);
    this.clearCellAt({ row: step, track });
  }

  // --- the drum view (F8) ---------------------------------------------------

  /**
   * Cycle the pattern panel's readings: the note grid, the drum lanes, the piano
   * roll, and back.
   *
   * A VIEW, not an edit: no undo step, nothing about the song changes, and the
   * cursor, the playhead and the undo history all carry straight on across the
   * switch. That is why it is a key rather than a menu — you flip to it, write a
   * beat or a line, and flip back, the way you glance at a kit or at sheet music.
   */
  private cyclePatternView(): void {
    const order: PatternView[] = ['notes', 'drums', 'piano'];
    const next = order[(order.indexOf(this.patternView) + 1) % order.length] ?? 'notes';
    this.patternView = next;
    this.grid.setDrumView(next === 'drums');
    this.grid.container.setVisible(next !== 'piano');
    this.rollView?.setVisible(next === 'piano');
    // The title says WHICH reading this is and, for the two that show one channel,
    // which channel — the thing neither a lane nor a roll can say for itself.
    this.updatePatternTitle(this.patternWindow.first, this.patternWindow.last);
    this.toast.show(this.viewMessage(), this.patternView === 'notes' ? activeColors().textDim : activeColors().ward);
  }

  /** What the toast says after `F8`, one line per reading. */
  private viewMessage(): string {
    const name = this.song.tracks[this.cursor.track]?.name ?? `TRACK ${this.cursor.track + 1}`;
    switch (this.patternView) {
      case 'drums': return `DRUM VIEW  \u00b7  ${name}  \u00b7  CLICK A LANE TO HIT IT`;
      case 'piano': return `PIANO ROLL  \u00b7  ${name}  \u00b7  CLICK TO WRITE A NOTE`;
      default: return 'NOTE VIEW';
    }
  }

  /**
   * A lane was clicked: hit that drum on that step of the cursor's channel.
   *
   * The mouse's `drum ROW TRACK DRUM`, and the only way a drum gets into a song
   * without a script. The cursor follows the click so the next one continues from
   * where this one landed — the same bargain a click on the note grid makes — and
   * a click on the hit that is already there is a no-op that still moves the
   * cursor, so clicking a beat to hear it never rewrites it.
   */
  private writeLane(row: number, lane: number): void {
    const drum = laneDrum(lane);
    if (drum === null) return;
    const pattern = this.currentPattern;
    const track = this.cursor.track;
    const before = cellAt(pattern, row, track)?.drum ?? null;
    if (before !== drum) {
      this.record();
      writeDrum(pattern, row, track, drum);
      this.refreshStep(row, track);
      this.afterEdit();
    }
    this.setSelection({ row, track }, false);
    this.engine.previewDrum(track, drum);
  }

  /**
   * A lane was right-clicked in the drum view: take that hit out.
   *
   * Only if the step IS that drum — right-clicking the empty lane beside a kick is
   * not a request to delete the kick, and a beat is read by clicking around it. A
   * melodic note on a kit channel is not a hit either, so it is left for the note
   * grid's own Backspace, where it is visible.
   */
  private clearLane(row: number, lane: number): void {
    const drum = laneDrum(lane);
    if (drum === null) return;
    const cell = cellAt(this.currentPattern, row, this.cursor.track);
    if (cell?.drum !== drum) return;
    this.setSelection({ row, track: this.cursor.track }, false);
    this.clearCellAt({ row, track: this.cursor.track });
  }

  private toggleMute(index: number): void {
    const track = this.song.tracks[index];
    if (!track) return;
    this.record();
    track.muted = !track.muted;
    this.engine.setMuted(index, track.muted);
    this.trackList.setTracks(this.song.tracks);
    // A mute is one of the things the mixer draws, and it can be toggled from the
    // channel list while the page is up (the curtain makes that unlikely, but the
    // two views must never disagree about what is playing).
    if (this.mixerView?.isOpen) this.mixerView.render();
  }

  // --- the mix (the MIXER page's edits, and F5's) ---------------------------

  /**
   * Move one channel's level. One undo step per gesture.
   *
   * The same bargain as `editVoice`, sharpened for a page that is used for hours
   * rather than visited: a level is found by ear, which means a handful of nudges
   * and then "the one before this", so one Ctrl+Z undoes the balancing PASS and
   * not each press of an arrow. Clicking the bar twice is one step for the same
   * reason, not two — the gesture is what is recorded, not the change.
   */
  private setLevelAction(index: number, level: number): void {
    const track = this.song.tracks[index];
    if (!track) return;
    const next = clampLevel(level);
    if (next === track.level) return;
    this.beginStep(true);
    track.level = next;
    this.engine.setLevel(index, next);
    this.trackList.setTracks(this.song.tracks);
    this.updateHistoryButtons();
  }

  /**
   * Move one channel across the stereo field. One undo step per gesture, for the
   * same reason a level is: a pan is found by ear, and Ctrl+Z should undo the
   * balancing pass rather than each arrow press of it.
   */
  private setPanAction(index: number, pan: number): void {
    const track = this.song.tracks[index];
    if (!track) return;
    const next = clampPan(pan);
    if (next === track.pan) return;
    this.beginStep(true);
    track.pan = next;
    this.engine.setPan(index, next);
    this.trackList.setTracks(this.song.tracks);
    this.updateHistoryButtons();
  }

  /**
   * Set one channel's reverb or echo SEND. One undo step per gesture, like the mix.
   *
   * The twin of `setPanAction`, and deliberately shaped the same way: a send is
   * found by ear against the whole mix, and Ctrl+Z should undo the balancing pass
   * rather than the last arrow press of it.
   */
  private setSendAction(index: number, which: 'verb' | 'echo', amount: number): void {
    const track = this.song.tracks[index];
    if (!track) return;
    const next = clampSend(amount);
    if (next === track[which]) return;
    this.beginStep(true);
    track[which] = next;
    if (which === 'verb') this.engine.setVerb(index, next);
    else this.engine.setTrackEcho(index, next);
    this.updateHistoryButtons();
  }

  /**
   * Set one channel's duck. One undo step per gesture, like the mix.
   *
   * Two things happen rather than one, because a duck is the only setting here
   * that is about the OTHER channels: the song's own number moves, and the engine
   * is told the whole column — which channel is ducking decides whether any
   * channel carries a dip node at all, so the graph is rebuilt when the first
   * duck appears or the last one goes away and left alone otherwise.
   */
  private setDuckAction(index: number, amount: number): void {
    const track = this.song.tracks[index];
    if (!track) return;
    const next = clampDuck(amount);
    if (next === track.duck) return;
    this.beginStep(true);
    track.duck = next;
    this.engine.setDucks(this.song.tracks.map((one) => one.duck));
    this.updateHistoryButtons();
  }

  /**
   * Set the shared reverb and echo amounts — the ROOM panel, and the F5 menu's
   * first page before it.
   *
   * Both at once because they are two halves of one decision — how big the room
   * is — so a room control hands back the pair it is showing, and the two of them
   * cost one undo step together rather than one each.
   */
  private setRoomAction(reverb: number, echo: number): void {
    const nextReverb = clampRoom(reverb);
    const nextEcho = clampRoom(echo);
    if (nextReverb === this.song.reverb && nextEcho === this.song.echo) return;
    this.beginStep(true);
    this.song.reverb = nextReverb;
    this.song.echo = nextEcho;
    this.engine.setReverb(nextReverb);
    this.engine.setEcho(nextEcho);
    this.updateHistoryButtons();
  }

  /**
   * Set one of the effects on the whole mix — the `F5` menu's second page.
   *
   * The same one-undo-step-per-visit bargain the room makes, and the same
   * reason: the mix's effects are part of the song, so they are recorded — but
   * fiddling with the glue is a dozen nudges and then "no, the first one", which
   * is one decision rather than a dozen.
   */
  private setMasterEffectAction(id: TrackEffectId, amount: number): void {
    const next = clampEffect(amount);
    if (this.song.master[id] === next) return;
    this.beginStep(true);
    this.song.master[id] = next;
    this.engine.setMasterEffects(this.song.master);
    this.updateHistoryButtons();
  }

  /**
   * Set one of a channel's ten effects. One undo step per gesture.
   *
   * The last of the three per-gesture mix actions and the last of the shape the
   * OTHER two menus take: the value is the song's, the snapshot is taken once per
   * gesture, and the engine is told through the same `setEffect` path the tracker's
   * patch menu uses, so a fader moved here and one moved there are the same audio.
   */
  private setTrackEffectAction(index: number, id: TrackEffectId, amount: number): void {
    const track = this.song.tracks[index];
    if (!track) return;
    const next = clampEffect(amount);
    if (track[id] === next) return;
    this.beginStep(true);
    track[id] = next;
    this.engine.setEffect(index, id, next);
    this.updateHistoryButtons();
  }

  /**
   * Move one group's fader. One undo step per gesture, like a channel's level.
   *
   * A group's level is its members' gain, so this is the one control here whose
   * change is felt on channels the user did not touch — and it goes through the
   * same `withBus` and the same `setBuses` the script's `group` line uses, so the
   * fader and the script can never mean two different things.
   */
  private setBusLevelAction(name: string, level: number): void {
    const bus = busByName(this.song.buses, name);
    if (!bus) return;
    const next = clampBusLevel(level);
    if (bus.level === next) return;
    this.beginStep(true);
    this.song.buses = withBus(this.song.buses, { name: bus.name, level: next });
    this.engine.setBuses(this.song.buses, this.song.tracks.map((one) => one.bus));
    this.updateHistoryButtons();
  }

  /**
   * Add one group, named by the model rather than by a text box.
   *
   * A mixer is a by-ear screen and a name typed in the middle of it would stop the
   * music, so the name is generated (`GROUP1`, `GROUP2`, ...) and skipping any the
   * song already uses — which is the only property a group's name really needs,
   * because it is how a track line says which group it joins. Renaming is the
   * script's business, and the model's `tidyBus`/`busNameProblem` still guard it.
   */
  private addBusAction(): string {
    const name = newBusName(this.song.buses);
    if (name === null) return `A SONG HOLDS AT MOST ${MAX_BUSES} GROUPS`;
    this.record();
    this.song.buses = withBus(this.song.buses, { name, level: 100 });
    this.engine.setBuses(this.song.buses, this.song.tracks.map((one) => one.bus));
    this.updateHistoryButtons();
    return `${name} ADDED  \u00b7  JOIN IT FROM A CHANNEL'S BUS CONTROL`;
  }

  /**
   * Put one channel on a group, or take it off every one.
   *
   * The name is matched against the song's own groups rather than trusted, so a
   * stale control cannot attach a channel to a group that is not there — the same
   * repair `tidySong` makes for a track line naming a group that has gone.
   */
  private setBusAction(index: number, name: string | null): void {
    const track = this.song.tracks[index];
    if (!track) return;
    const next = name === null ? null : busByName(this.song.buses, name)?.name ?? null;
    if (track.bus === next) return;
    this.beginStep(true);
    track.bus = next;
    this.engine.setBuses(this.song.buses, this.song.tracks.map((one) => one.bus));
    this.updateHistoryButtons();
  }

  /**
   * Render the song to a `.wav`, for the F1 menu's EXPORT AUDIO.
   *
   * Renders ONE pass of the order plus a tail, using the same synth, chains and
   * room as playback, so what lands in the file is what the app sounds like. The
   * master fader is the one thing that is NOT the song — it belongs to whoever is
   * listening — so the export takes the level that is set right now, which is the
   * level being heard.
   */
  private async renderAudioFile(): Promise<
    { bytes: ArrayBuffer; seconds: number; details: string[] } | { error: string }
  > {
    if (!canRender()) return { error: 'this browser cannot render audio offline.' };
    try {
      const pcm = await renderSongToPcm(this.song, {
        volume: this.volume,
        font: this.activeFont(),
        // The bank, so a channel that names a recording of yours exports THAT
        // rather than the fallback the built-in one-shot would be: what you heard
        // is what you get, which is the only defensible rule for an export.
        samples: this.samples,
        // And the TAKES that shape those recordings, so an export plays the trim
        // and loop set on the RECORDER page rather than the whole file — the same
        // window the live engine was given. A bounce that ignored a trim would be
        // a file that does not sound like the app.
        takes: this.takes,
        // And the kits of your own, for the same reason the bank is here: a song
        // NAMES its drums and the four voices are the app's, so an export has to
        // be told what is loaded. A kit this machine does not have exports on the
        // four presets, which is what the app would have played.
        kits: this.savedKits,
        // The loop region, if one is marked or a script set one: bars 8 to 15
        // render as bars 8 to 15, and the whole song is the silence about it.
        bounce: this.bounceRange(),
      });
      // The loudness target last, because it is a measurement OF the finished
      // render: normalising before the tail would be normalising a different
      // file, and the seconds below are the same either way — a gain moves no
      // sample in time, which is the whole reason it is a gain.
      const { pcm: matched, match } = this.normalise(pcm);
      return {
        bytes: encodeWav(matched),
        seconds: pcmSeconds(matched),
        details: this.loudnessDetails(match),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * The song as one `.wav` per channel, in a `.zip`, for EXPORT STEMS.
   *
   * A mix is a decision this app made; a stem set is the song before anybody
   * made it, which is what somebody mixing elsewhere needs. Each channel is
   * rendered alone through the SAME graph the mix came out of — see
   * `renderStemsToPcm` — so a stem sounds like the part that was played rather
   * than like a second opinion about it, and the archive is written by
   * `zipStore` because a browser can only put one file on the disk at a time.
   *
   * Two things can say no, and both say it in words before anything is rendered:
   * a browser with no offline audio, and a song with no notes in it. Rendering
   * then proceeds channel by channel, so a long song takes proportionally longer
   * than an audio export — which is why the menu's status well has a word for it.
   */
  private async stemsFile(): Promise<
    { bytes: Uint8Array; names: string[]; seconds: number; details: string[] } | { error: string }
  > {
    if (!canRender()) return { error: 'this browser cannot render audio offline.' };
    const refusal = stemRefusal(this.song);
    if (refusal) return { error: refusal };
    try {
      const plan = stemPlan(this.song, songFileStem(this.song.title));
      const options = {
        volume: this.volume,
        font: this.activeFont(),
        // The bank, for the same reason the mix export passes it: a channel that
        // NAMES a recording of yours exports THAT recording.
        samples: this.samples,
        // And the takes that shape them, so each stem carries the same trim and
        // loop the mix would have — a stem is the part, not an approximation.
        takes: this.takes,
        // And the kits of your own, so a stem set of a kit channel is the drums
        // that were heard and not the four presets underneath them.
        kits: this.savedKits,
        // A stem set of a region is a stem set of that region: the three writers
        // of audio agree about which bars "these bars" means.
        bounce: this.bounceRange(),
      };
      // ONE measurement decides the gain for every stem, taken on the MIX — and
      // that is the reason a normalised stem export renders one extra time. Each
      // part normalised on its own would each land on the target, which would
      // leave the parts no longer summing to the mix, and summing to the mix is
      // the whole point of a stem set. The gain is linear, so applying it to the
      // mix and to each stem by the same factor keeps the sum where it was.
      const target = this.loudnessTarget();
      const mix = target === null ? null : await renderSongToPcm(this.song, options);
      const match =
        mix === null || target === null ? null : matchLoudness(mix.channels, mix.sampleRate, target);
      const gain = match?.gain ?? 1;
      const rendered = await renderStemsToPcm(this.song, stemTracks(plan), options);
      const files = plan.map((entry, index) => ({
        name: entry.name,
        bytes: new Uint8Array(encodeWav(gainPcm(rendered[index]!.pcm, gain))),
      }));
      return {
        bytes: zipStore(files),
        names: files.map((file) => file.name),
        seconds: rendered[0] ? pcmSeconds(rendered[0].pcm) : 0,
        details: this.loudnessDetails(match),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * The song as a `.mid`, for the F1 menu's EXPORT MIDI.
   *
   * The inverse of `openMidiAction` below, and deliberately the same shape: the
   * model refuses a song with no notes in it (its own reader would not open such a
   * file), and the refusal arrives here as one sentence rather than as an empty
   * download. There is no `canRender()` gate and no master fader to pass, because
   * a MIDI file holds notes rather than sound — nothing about it depends on the
   * browser or on how loud this person has the app.
   */
  private midiFile(): { bytes: Uint8Array; notes: number; bars: number } | { error: string } {
    const result = songToMidi(this.song, this.bounceRange());
    if (!result.ok) return { error: result.errors[0] ?? 'the song could not be written as MIDI.' };
    return { bytes: result.bytes, notes: result.summary.notes, bars: result.summary.bars };
  }

  /**
   * The sound of the channel under the cursor, as a patch file.
   *
   * Named after the CHANNEL, because the channel is where the sound has been
   * living and its name is the one its author already gave it: inventing a second
   * name at save time is a question this app asks as rarely as it can. The bytes
   * come back as TEXT, because a patch is a document rather than audio — and the
   * one place that knows how to put a file on a disk is the menu, the same
   * division every other writer here makes.
   *
   * What goes in it and what stays behind is `patchfile.ts`'s business, not this
   * method's: all this does is hand over the channel and let the model decide what
   * a sound is.
   */
  private patchFile(): { fileName: string; text: string; detail: string } | { error: string } {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return { error: 'no channel is selected, so there is no sound to save.' };
    const sound = soundFromTrack(track);
    const name = tidyPatchName(track.name);
    return {
      fileName: patchFileName(name),
      text: patchToJson(sound, name),
      detail: patchAbout(sound),
    };
  }

  /**
   * The name a SAVE KIT would use: the song's title, tidied to a kit name.
   *
   * A kit has no channel to borrow a name from the way a patch does, so it
   * borrows the song's TITLE — the one name a person gave this music — and
   * `kitNameFromTitle` makes it a usable one (a token, not a built-in's word, not
   * already one of yours). The menu shows this in the row, so what it says is
   * what the file will be called.
   */
  private kitSaveName(): string {
    return kitNameFromTitle(this.song.title, this.savedKits);
  }

  /**
   * The song's four drum voices as a kit document, for SAVE KIT.
   *
   * `captureKit` reads the voices the song's drums ACTUALLY play, so a kit
   * captured from the built-in `808` is the four voices `808` happens to be made
   * of rather than a pointer to it — which is what makes a captured kit a thing
   * you can edit and carry, not one that changes under you when a preset does.
   */
  private kitFile(): { fileName: string; text: string; detail: string } | { error: string } {
    const name = this.kitSaveName();
    const kit = captureKit(name, this.song.kit, this.savedKits);
    const from = kitLabel(this.song.kit, this.savedKits);
    return {
      fileName: kitFileName(name),
      text: kitToJson(kit),
      detail: `${kitAbout(kit)} \u2014 from your ${from} drums`,
    };
  }

  // --- MIDI in, and the clock -------------------------------------------------

  /** Everything the MIDI row and the transport's status line need, in one place. */
  private midiStatus(): MidiStatus {
    const fresh = this.midiLastPulseAt > 0 && performance.now() - this.midiLastPulseAt < MIDI_SYNC_TIMEOUT_MS;
    return {
      mode: this.midiMode,
      inputs: this.midiListener?.deviceNames.length ?? 0,
      device: this.midiListener?.deviceNames[0] ?? null,
      synced: fresh && this.midiClockBpm !== null,
      clockBpm: this.midiClockBpm,
      problem: this.midiProblem,
    };
  }

  /**
   * What the transport says about MIDI — `RECORDING`, `SYNC 128`, `NO MIDI` — or
   * `''` when there is nothing worth a word.
   *
   * It REPLACES `PLAYING`/`STOPPED` rather than joining it: the status line fits
   * one word beside the GROOVE button (see `TransportBar.setMidi`), so the word
   * shown is the more urgent fact. Listening with a keyboard and no clock is not
   * urgent — the menu row says so, and the toast announced it — so that case says
   * nothing here rather than crowding out a word that is always true.
   */
  private midiSyncLabel(): string {
    if (this.midiMode === 'off') return '';
    const status = this.midiStatus();
    // A mode with nothing behind it says so rather than reading as armed: the
    // difference between "listening" and "waiting for a cable" is the whole
    // reason this word is on screen at all.
    if (status.problem !== null || status.inputs === 0) return 'NO MIDI';
    if (status.synced && status.clockBpm !== null) return `SYNC ${status.clockBpm}`;
    if (status.mode === 'record' && this.engine.playing) return 'RECORDING';
    return '';
  }

  /** The row label, for the F2 menu's MIDI IN row. */
  private midiLabel(): string {
    return midiRowLabel(this.midiStatus());
  }

  /**
   * One press of the MIDI row: off → listen → record → off.
   *
   * Turning it ON asks the browser for access, which is ASYNCHRONOUS: the row
   * reports the decision now and the scene speaks up again when the permission is
   * answered, because a permission dialog cannot be raised from inside a menu's
   * key handler without leaving this panel hanging over the app.
   */
  private cycleMidiAction(): FileActionResult {
    const next = nextMidiMode(this.midiMode);
    if (next === 'off') {
      this.midiMode = 'off';
      this.stopMidiListening();
      this.applyMidiStatus();
      this.toast.show('MIDI OFF', activeColors().textDim);
      return {
        status: 'MIDI OFF',
        details: ['The app asks the browser for nothing, and lets go of any keyboard it had.'],
        tone: 'ok',
      };
    }
    const first = this.midiMode === 'off';
    this.midiMode = next;
    if (first) void this.requestMidi();
    this.applyMidiStatus();
    this.toast.show(`MIDI ${midiModeLabel(next)}`, activeColors().ward);
    return {
      status: `MIDI ${midiModeLabel(next)}`,
      details: midiStatusAbout(this.midiStatus()),
      tone: 'ok',
    };
  }

  /** Ask the browser once, and keep whatever it says. */
  private async requestMidi(): Promise<void> {
    const started = await startMidiInput({
      onMessage: (message) => this.handleMidiMessage(message),
      // A keyboard plugged in later simply appears, and the row says so.
      onDevices: () => { this.applyMidiStatus(); },
    });
    // Turned off while the permission prompt was up: honour the last thing the
    // user said rather than turning the keyboards back on underneath them.
    if (this.midiMode === 'off') {
      if (started.ok) started.listener.stop();
      return;
    }
    if (!started.ok) {
      this.midiProblem = started.error;
      this.midiListener = null;
      this.toast.show('MIDI UNAVAILABLE', activeColors().danger);
    } else {
      this.midiProblem = null;
      this.midiListener = started.listener;
      const names = started.listener.deviceNames;
      this.toast.show(
        names.length === 0 ? 'MIDI ON  \u00b7  NO KEYBOARD YET' : `MIDI IN  \u00b7  ${names[0]}  \u00b7  PLAY`,
        activeColors().ward,
      );
    }
    this.applyMidiStatus();
  }

  /** Let go of every port, and forget the clock: what OFF means. */
  private stopMidiListening(): void {
    this.midiListener?.stop();
    this.midiListener = null;
    this.midiProblem = null;
    this.midiPulseMs = [];
    this.midiLastPulseAt = 0;
    this.midiClockBpm = null;
    this.midiTakeRecorded = false;
  }

  /**
   * Push the MIDI state into the two places that show it.
   *
   * The menu page is rebuilt only while it is the page on screen, and the
   * transport's status line is redrawn only when the word it would show changes —
   * a clock that pulses twenty times a second must not repaint a canvas.
   */
  private applyMidiStatus(): void {
    const label = this.midiSyncLabel();
    if (label !== this.lastMidiLabel) {
      this.lastMidiLabel = label;
      this.transport.setMidi(label);
    }
    if (this.fileMenu.showing === 'export') this.fileMenu.refreshPage();
  }

  /**
   * Act on one decoded MIDI message.
   *
   * The transport cases are the clock's other half: START and CONTINUE begin the
   * song and STOP ends it, so two machines run together rather than merely at the
   * same tempo. Everything with nowhere in this model to land — a control change,
   * a bend, a program change — is dropped rather than half-honoured.
   */
  private handleMidiMessage(message: MidiInMessage): void {
    switch (message.kind) {
      case 'noteOn': this.playMidiNote(message.note, message.velocity); break;
      case 'clock': this.followMidiClock(); break;
      case 'start':
      case 'continue':
        if (!this.engine.playing) this.startPlayback();
        break;
      case 'stop':
        if (this.engine.playing) this.stopPlayback();
        break;
      default: break;
    }
  }

  /**
   * A played note: always heard, and written when RECORDING and the song is running.
   *
   * Heard FIRST and written second, because the sound is the point of plugging a
   * keyboard in — even a person who armed recording wants to hear the note they
   * just played. The write is one undo step for the whole take (the flag is
   * cleared when the transport stops), for the reason a dragged sound knob is one
   * step: a performance is one gesture, and Ctrl+Z once per note is not undo.
   *
   * Writing needs the playhead to be MOVING, which is the tracker's own rule: a
   * live take is played to a running song, and a note written at a stopped
   * playhead would land on top of the last one, every time.
   */
  private playMidiNote(note: number, velocity: number): void {
    const track = this.cursor.track;
    this.engine.previewNote(track, note);
    if (this.midiMode !== 'record') return;
    const step = this.engine.playStep;
    if (step < 0) return;
    if (!this.midiTakeRecorded) {
      this.record();
      this.midiTakeRecorded = true;
    }
    if (!placeLiveNote(this.song, step, track, note, velocity)) return;
    // The grid follows the song while it plays, so the cell to repaint is the one
    // the playhead is on — unless the view is still a frame behind the bar, in
    // which case the repaint would land on a different bar's step.
    const slot = stepToSlot(this.song, step);
    if (slot.pattern === this.patternIndex) this.refreshStep(slot.row, track);
    this.updateHistoryButtons();
  }

  /**
   * Follow an external clock: measure it, and set the song's tempo to it.
   *
   * The MEDIAN of the last beat's worth of pulse gaps (`tempoFromPulses`), so one
   * late pulse cannot move the tempo, and only written when it CHANGES — a
   * measured tempo wobbles by a BPM here and there, and a song whose tempo is
   * rewritten twenty times a second would fight every tempo map it has.
   *
   * What this deliberately is not: a sample-locked slave. Playing is scheduled
   * against the audio clock, which is the thing that keeps two sounds together, so
   * the app follows the clock's TEMPO and its transport rather than stepping on
   * the pulses themselves. `doc/09` says so in the same words.
   */
  private followMidiClock(): void {
    const now = performance.now();
    if (this.midiLastPulseAt > 0) {
      this.midiPulseMs.push(now - this.midiLastPulseAt);
      if (this.midiPulseMs.length > MIDI_TEMPO_WINDOW) this.midiPulseMs.shift();
      const bpm = tempoFromPulses(this.midiPulseMs);
      if (bpm !== null && bpm !== this.midiClockBpm) {
        this.midiClockBpm = bpm;
        this.setTempo(bpm);
        this.applyMidiStatus();
      }
    }
    this.midiLastPulseAt = now;
  }

  /**
   * Keep the transport's MIDI word honest about a clock that has STOPPED.
   *
   * The one piece of MIDI state with no event to hang off: nothing is sent when a
   * clock goes quiet, so silence itself has to be noticed. Four times a second is
   * enough to notice and far too cheap to matter, and the label is only redrawn
   * when it actually changes.
   */
  private refreshMidiStatus(nowMs: number): void {
    if (this.midiMode === 'off') return;
    if (nowMs - this.midiStatusAt < 250) return;
    this.midiStatusAt = nowMs;
    const label = this.midiSyncLabel();
    if (label === this.lastMidiLabel) return;
    this.lastMidiLabel = label;
    this.transport.setMidi(label);
  }

  /**
   * Solo one channel, or unsolo it. NOT an undo step, because nothing about the
   * song changed — see `solos`.
   */
  private toggleSolo(index: number): void {
    if (!this.song.tracks[index]) return;
    while (this.solos.length < this.trackCount) this.solos.push(false);
    this.solos[index] = !this.solos[index];
    this.engine.setSolo(index, this.solos[index]);
    this.trackList.setSolos(this.solos);
    const on = this.solos.filter(Boolean).length;
    this.toast.show(
      on === 0
        ? 'SOLO OFF  \u00b7  EVERY CHANNEL PLAYS'
        : `SOLO  ${this.song.tracks.filter((_, i) => this.solos[i]).map((t) => t.name).join(' + ')}`,
      on === 0 ? activeColors().textDim : activeColors().ward,
    );
  }

  /** Sound one note on a channel, so a level can be set by ear. */
  private auditionTrack(index: number): void {
    const track = this.song.tracks[index];
    if (!track) return;
    // A note the channel already plays, if it plays one, so a bass is auditioned
    // in its own register; otherwise a middle C, which is a note about anything.
    const midi = firstNoteOn(this.song.patterns, index) ?? 60;
    this.engine.previewNote(index, midi);
  }

  /** Drop every solo. Called whenever the song is REPLACED, never when edited. */
  private clearSolos(): void {
    if (!this.solos.some(Boolean)) return;
    this.solos = this.solos.map(() => false);
    this.engine.setSolos(this.solos);
  }

  /**
   * The region an export would render, or null for the whole song.
   *
   * A REGION rather than the mark itself, because that is what the two audio
   * exports and the MIDI writer want, and because a half-made mark (a beginning
   * with no end) is not a region: it renders the whole song, which is what the
   * song did before anybody pressed `L`.
   */
  private bounceRange(): BounceRange | null {
    return markedBounce(this.bounceMark);
  }

  /** `L` in `F3`: mark the bar under the cursor, and say what happened. */
  private markBounceAction(bar: number): string {
    this.bounceMark = markBounce(this.bounceMark, bar);
    return bounceMarkStatus(this.bounceMark, this.song.order.length);
  }

  /**
   * Clear the region from the EXPORT page, which is also where it is shown.
   *
   * The mouse's half of the feature: `L` in `F3` is where a region is MADE, and
   * this is where it is taken off — and where a person about to export can see
   * that only some of the song is going to render, which matters more than the
   * click does.
   */
  private clearBounceAction(): FileActionResult {
    if (markedBounce(this.bounceMark) === null) {
      return { status: 'THE WHOLE SONG ALREADY EXPORTS', tone: 'ok' };
    }
    this.clearBounce();
    return {
      status: 'THE WHOLE SONG EXPORTS AGAIN',
      details: ['F3 marks a loop region again, with L.'],
      tone: 'ok',
    };
  }

  /**
   * Drop the region. Called wherever the song is REPLACED, beside `clearSolos`.
   *
   * Both are session state about the song that WAS on screen: a region marked in
   * a sixty-bar song means nothing in a four-bar one, and leaving it set would
   * export two bars of the new song for a reason nothing on screen explains.
   */
  private clearBounce(): void {
    this.bounceMark = NO_BOUNCE;
  }

  /**
   * The loudness an export would normalise to, or null for none.
   *
   * A method rather than the field alone so that the four call sites in the two
   * writers read as asking a question, and so the one place that would ever need
   * to derive a default has somewhere to do it.
   */
  private loudnessTarget(): number | null {
    return this.loudness;
  }

  /**
   * Walk the ladder on the EXPORT page: OFF, then the four published targets.
   *
   * The mouse's half of the feature, and the reason the ladder is a closed list
   * rather than a text field: the numbers a person actually wants are the ones a
   * service publishes, and asking someone to remember that Spotify is -14 is how
   * a knob goes unused. A script can still name any value in the range, and the
   * row then shows that value and climbs from it (see `cycleLoudness`).
   */
  private cycleLoudnessAction(): FileActionResult {
    this.loudness = cycleLoudness(this.loudness);
    const target = this.loudness;
    if (target === null) {
      return {
        status: 'LOUDNESS OFF  -  THE MASTER LEVEL GOVERNS',
        details: ['Both audio exports write the level you hear, as they always did.'],
        tone: 'ok',
      };
    }
    // The hint has to say where the NEXT press goes, and off the top of the ladder
    // that is not "up": the loudest stop is the one whose next press takes the
    // normalising off, which is worth a sentence of its own.
    const next = cycleLoudness(target);
    return {
      status: `EXPORTING AT ${loudLabel(target)}`,
      details: [
        next === null
          ? `${loudnessMeaning(target)}  -  press ENTER again to stop normalising.`
          : `${loudnessMeaning(target)}  -  press ENTER again for the next stop up.`,
        'Measured after the render, to ITU-R BS.1770. MIDI carries no level, so EXPORT MIDI ignores it.',
      ],
      tone: 'ok',
    };
  }

  /**
   * Normalise a finished render, if a target is set — the gain and the sentence.
   *
   * The gain is decided by MEASURING this audio and is linear, so it moves the
   * file's loudness and nothing else about it. Null for the match means no target
   * was set, which is the answer every export gave before a target existed, and a
   * null `measured` inside a match means the render had no loudness to match —
   * which the caller turns into a sentence rather than a division by nothing.
   */
  private normalise(pcm: PcmAudio): { pcm: PcmAudio; match: LoudnessMatch | null } {
    const target = this.loudnessTarget();
    if (target === null) return { pcm, match: null };
    const match = matchLoudness(pcm.channels, pcm.sampleRate, target);
    return { pcm: gainPcm(pcm, match.gain), match };
  }

  /** What the status line says about a normalise, if there was one. */
  private loudnessDetails(match: LoudnessMatch | null): string[] {
    const target = this.loudnessTarget();
    if (match === null || target === null) return [];
    if (match.measured === null) {
      return ['THIS RENDER IS SILENT, SO THERE WAS NOTHING TO NORMALISE.'];
    }
    return [loudnessReport(match.measured, target, gainDecibels(match.gain), match.limited)];
  }

  private setTempo(bpm: number): void {
    this.song.bpm = clampBpm(bpm);
    this.engine.setBpm(this.song.bpm);
    // The map is written as changes AWAY from the base tempo, so a new base is a
    // new answer for every step that leans on it; an empty map answers the base
    // for every step, which is what it did before.
    this.engine.setTempos(songTempos(this.song));
  }

  private setVolume(volume: number): void {
    this.volume = volume;
    this.engine.setVolume(volume);
  }

  /**
   * Set how much the song swings. ONE undo step per drag, not per slider tick,
   * for the same reason tempo has none: a slider is a by-ear control, and
   * Ctrl+Z thirteen times to undo one gesture is not what undo is for.
   */
  private setSwing(swing: number): void {
    const next = clampSwing(swing);
    if (next === this.song.swing) return;
    this.song.swing = next;
    this.engine.setSwing(next);
  }

  private setOctave(octave: number): void {
    const next = Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, octave));
    if (next === this.octave) return;
    this.octave = next;
    this.keyboard.setOctave(next);
    // The "PRESS <key>" hint is relative to the octave, so it moved with it.
    this.updateInspector();
    this.toast.show(`OCTAVE ${next}`, activeColors().ward);
  }

  private addChannel(): void {
    if (this.trackCount >= MAX_TRACKS) {
      this.toast.show(`MAX ${MAX_TRACKS} TRACKS`, activeColors().danger);
      return;
    }
    this.record();
    const index = addTrack(this.song);
    this.cursor = { row: this.cursor.row, track: index };
    this.syncAll();
    this.updateHistoryButtons();
    this.toast.show(`TRACK ${index + 1} ADDED`, activeColors().textGreen);
  }

  private removeChannel(): void {
    if (this.trackCount <= MIN_TRACKS) {
      this.toast.show('ONE TRACK IS THE MINIMUM', activeColors().danger);
      return;
    }
    this.record();
    const index = this.cursor.track;
    removeTrack(this.song, index);
    this.cursor = { row: this.cursor.row, track: Math.max(0, index - 1) };
    this.syncAll();
    this.updateHistoryButtons();
    this.toast.show('TRACK REMOVED', activeColors().danger);
  }

  private shiftPattern(delta: number): void {
    const index = this.patternIndex + delta;
    if (index < 0) {
      this.toast.show('FIRST PATTERN', activeColors().textDim);
      return;
    }
    if (index >= this.song.patterns.length) {
      // Moving forward past the last pattern makes the next one, so the arrows
      // are always a way to grow a song rather than a dead end.
      this.record();
      // A new pattern inherits the song's grid: same length, same channels.
      this.song.patterns.push(
        emptyPattern(`PATTERN ${this.song.patterns.length + 1}`, this.currentPattern.steps.length, this.trackCount),
      );
    }
    // Plain navigation is NOT recorded: Ctrl+Z should always step back through
    // edits, never through the places you happened to look at.
    this.patternIndex = index;
    this.syncAll();
    this.updateHistoryButtons();
    this.toast.show(`PATTERN ${index + 1}`, activeColors().ward);
  }

  /**
   * ADD BAR: the pattern you are editing joins the end of the song.
   *
   * The order is built from the pattern the editor is on rather than from a
   * number, because the bar you are looking at is the bar you mean — and the
   * usual way to grow a song is to write the next one and say "and then that".
   */
  private addBarAction(): string {
    if (this.song.order.length >= MAX_ORDER) {
      return `A SONG HOLDS AT MOST ${MAX_ORDER} BARS.`;
    }
    this.record();
    const slot = appendOrder(this.song, this.patternIndex + 1);
    this.syncAll();
    this.updateHistoryButtons();
    return `BAR ${slot + 1} = PAT ${this.patternIndex + 1}   (${this.song.order.length} BARS)`;
  }

  /** REMOVE BAR. Refuses the last one, because a song always plays something. */
  private removeBarAction(index: number): string {
    if (this.song.order.length <= 1) return 'A SONG NEEDS AT LEAST ONE BAR.';
    const removed = this.song.order[index];
    this.record();
    removeOrder(this.song, index);
    this.syncAll();
    this.updateHistoryButtons();
    return `REMOVED BAR ${index + 1} (PAT ${removed})   ${this.song.order.length} BARS LEFT`;
  }

  /** Point one bar at another pattern — the same pattern twice is how a chorus repeats. */
  private setBarPatternAction(index: number, pattern: number): string {
    const before = this.song.order[index];
    if (before === pattern) return `BAR ${index + 1} ALREADY PLAYS PAT ${pattern}.`;
    this.record();
    setOrderPattern(this.song, index, pattern);
    this.syncAll();
    this.updateHistoryButtons();
    return `BAR ${index + 1} NOW PLAYS PAT ${pattern}`;
  }

  /**
   * `M` in the F3 form view: move the drum machine BAR the bar's SECTION plays.
   *
   * The cycle is `off`, then the bars the machine actually HAS, then `off` —
   * bounded by the machine rather than by the ceiling, because naming bar 9 of a
   * two-bar machine is a press nobody means. The bar belongs to the SECTION, so
   * every bar of that section moves together, which is the whole point of putting
   * the choice on the form rather than on a per-bar `machine order` list.
   */
  private cycleSectionMachineAction(index: number): string {
    // Which section this bar came from — nothing to move when the order has been
    // edited by hand and no name describes a bar any more.
    const labels = orderSectionLabels(this.song.order, this.song.sections, this.song.arrangement);
    const name = labels[index] ?? null;
    if (name === null) return 'THIS BAR HAS NO SECTION NAME. NAME ONE WITH `section`, THEN `arrange`.';
    const section = sectionByName(this.song.sections, name);
    if (!section) return 'THIS BAR HAS NO SECTION NAME.';
    const machine = this.song.machine;
    if (!machine) return 'NO DRUM MACHINE. MAKE ONE (F2, OR A `machine` LINE).';
    const count = machineBarCount(machine);
    const current = section.machineBar ?? null;
    const next = current === null ? 1 : current >= count ? null : current + 1;
    this.record();
    this.song.sections = withSection(this.song.sections, { ...section, machineBar: next });
    // The bars a section names reach the audio here; `syncAll` would do it too, but
    // this edit changes nothing the screen draws outside the form view, so only the
    // machine's own placement is re-pointed.
    this.engine.setMachineBars(machineBarsForSong(this.song));
    this.updateHistoryButtons();
    return next === null
      ? `${name} PLAYS THE MACHINE'S ORDER`
      : `${name} PLAYS MACHINE BAR ${next} OF ${count}`;
  }

  /** Jump the editor to whatever a bar plays, so "that one" is one click away. */
  private goToBarAction(index: number): string {
    const pattern = this.song.order[index];
    if (pattern === undefined) return 'THAT BAR IS GONE.';
    this.jumpToPattern(pattern - 1);
    return `EDITING PAT ${pattern}   (BAR ${index + 1})`;
  }

  /** Put the editor on a pattern by index, without touching the order. */
  private jumpToPattern(index: number): void {
    const clamped = Math.max(0, Math.min(this.song.patterns.length - 1, index));
    if (clamped === this.patternIndex) return;
    this.patternIndex = clamped;
    this.syncAll();
  }

  /**
   * Open the SCRIPT modal. Nothing is written until APPLY, and the context is
   * refreshed here so a script written against a 4-track song still gets an
   * accurate "track 5 does not exist" if the song has since grown or shrunk.
   */
  private openScript(): void {
    // Never two text boxes at once: any rename in progress is committed first.
    this.trackList.commitRename();
    this.headerLine.commit();
    this.patternTitleView.commit();
    this.voiceMenu.hide();
    // Refreshed on every open rather than passed once, because the saved voices
    // can have grown since the last time — and the live check in the box should
    // accept `voice MYPAD` the moment MYPAD exists.
    this.scriptPanel.setContext({
      trackCount: this.trackCount,
      rows: patternRows(this.song),
      rowsPerBeat: this.song.rowsPerBeat,
      voices: this.savedVoices,
      // And the sections the song already names, for the same reason: a form is
      // something the SONG has, and a script pasted onto it may arrange one it
      // never wrote.
      sections: this.song.sections,
      // And the groups it has: a script that only moves a fader still has to name
      // the group the song is already mixed with.
      buses: this.song.buses,
      // And its chord loop, for the same reason: `chord 0 1 follow` in a script
      // pasted onto a song with four chords should hang the channel on THOSE four
      // rather than refuse for want of a line the song already has.
      progression: this.song.progression,
    });
    this.scriptPanel.open();
  }

  /**
   * Open the MCP page: how to connect an AI agent to this app's model.
   *
   * The SCRIPT box closes on the way, because the two are one question asked in
   * two halves — write it yourself, or have something else write it — and the
   * page's own last step is pasting into the box it was opened from. Only one
   * modal owns the keyboard at a time, so the swap is a swap rather than a stack.
   */
  private openMcp(): void {
    this.scriptPanel.close();
    this.mcpPanel.show();
  }

  /**
   * Apply everything a script said that is NOT part of the song.
   *
   * Five settings, and they are the whole list of things the app can be told that
   * a song does not own: the master volume, the octave, which channels are soloed,
   * whether one key writes a chord, and whether notes are auditioned as the cursor
   * moves. All five are pushed into whichever view shows them, so what the script
   * said and what the screen says cannot disagree — and none of it costs an undo
   * step, because none of it is the song.
   *
   * An absent field means the script said nothing about it, which is why each
   * check is `!== undefined` rather than a truthiness test: `hear off` and `hear`
   * never mentioned are different instructions.
   */
  private applyScriptSettings(settings: ScriptSettings): void {
    if (settings.volume !== null) {
      this.volume = settings.volume;
      this.engine.setVolume(this.volume);
      this.transport.setVolume(this.volume);
    }
    if (settings.octave !== undefined) {
      this.octave = Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, settings.octave));
      this.keyboard.setOctave(this.octave);
      this.updateInspector();
    }
    if (settings.solo !== undefined) {
      const soloed = settings.solo;
      this.solos = this.song.tracks.map((_, i) => soloed.includes(i + 1));
      this.engine.setSolos(this.solos);
      this.trackList.setSolos(this.solos);
    }
    if (settings.chordDegrees !== undefined) {
      this.chordDegrees = settings.chordDegrees;
      this.chordButton.setText(this.chordLabel());
      this.keyboard.setChord(this.chordDegrees);
    }
    if (settings.hearNotes !== undefined) {
      this.previewOnMove = settings.hearNotes;
      this.hearToggle.setValue(this.previewOnMove, true);
    }
    if (settings.bounce !== undefined || settings.loud !== undefined) {
      // What an export will DO, as session state: the region as a mark, so the F3
      // list draws its markers without knowing how the region got there, and the
      // loudness target as the number the EXPORT page shows. The two are announced
      // TOGETHER, because neither is visible on the main screen — an export that
      // silently rendered two bars of a song at a level nobody chose would be the
      // worst kind of surprise — and because two toasts in a row would leave only
      // the second one on screen.
      if (settings.bounce !== undefined) this.bounceMark = bounceMarkFor(settings.bounce);
      if (settings.loud !== undefined) this.loudness = settings.loud;
      const said = [`EXPORTING  ${bounceLabel(this.bounceRange(), this.song.order.length)}`];
      const target = this.loudnessTarget();
      if (target !== null) said.push(`AT  ${loudLabel(target)}`);
      this.toast.show(said.join('   '), activeColors().ward);
    }
    if (settings.theme !== undefined) {
      // The framework switches; every view in the app hears the change through
      // `onThemeChanged`, so there is nothing to redraw here — only to remember,
      // which is the same one thing the F9 menu does when a hand picks one.
      setActiveTheme(settings.theme);
      rememberTheme(settings.theme, THEME_IDS);
    }
    if (settings.page !== undefined) {
      // Which full screen to show. The parser has already checked the name
      // against `PAGE_NAMES`, so the cast is the language's promise and not a
      // guess; `setPage` is what the dropdown itself calls, so a script and a
      // click move the app the same way. A view setting, so no undo step.
      this.setPage(settings.page as PageId);
    }
    if (settings.liveQuantize !== undefined) {
      // How long a LIVE launch waits — a SESSION setting beside `page`, not song
      // data: it is how somebody is performing rather than anything written down,
      // so no undo step, and the page repaints so its strip shows what the script
      // set the moment it opens.
      this.setLiveQuantize(settings.liveQuantize);
      if (this.liveView?.isOpen) this.liveView.render();
    }
    // An instrument a script asks for arrives over the NETWORK, so the
    // `instrument use` that usually follows it in the same script cannot be
    // answered yet: the instrument is not in the list until the bytes land. A
    // script that says both therefore has them settled in order by the loader,
    // which comes back through here with the use alone once the file is in — and a
    // script that says only `use` keeps doing exactly what it always did,
    // synchronously, because it has nothing to wait for.
    if (settings.instrumentLoad !== undefined) {
      void this.loadInstrumentFromUrl(settings.instrumentLoad, settings.instrumentUse ?? null);
    } else if (settings.instrumentUse !== undefined) {
      // The instrument list is the one setting a script can get wrong, because
      // only the app knows what has been imported. So a name that is not there is
      // REPORTED rather than thrown: the song the script just built is good, and
      // failing the whole apply because a channel points at an instrument you did
      // not import yet would throw away the part that worked.
      const entry = findInstrument(this.instruments, settings.instrumentUse);
      if (entry) {
        this.instruments = selectInstrument(this.instruments, entry.id);
        this.applyInstruments();
        this.toast.show(`USING  ${entry.name}`, activeColors().ward);
      } else {
        const known = this.instruments.entries.map((item) => item.name).join(', ');
        this.toast.show(
          known === '' ? 'NO INSTRUMENTS IMPORTED YET — F2 \u2192 IMPORT FROM NOISLET' : `NO INSTRUMENT CALLED "${settings.instrumentUse}" — HAVE: ${known}`,
          activeColors().danger,
        );
      }
    }
    if (settings.instrumentImport) {
      // A script cannot read a path, so it asks for the picker and the person
      // picks; the import itself then reports exactly as a click would.
      this.fileMenu.openInstrumentPicker();
    }
    // And the recordings. `sample load` arrives over the network exactly as
    // `instrument load` does, so it is fired and forgotten: the song is already
    // applied and the channel will simply start playing the file when it lands,
    // which is the same thing that happens when either of them is missing.
    if (settings.sampleLoad !== undefined) {
      void this.loadSampleFromUrl(settings.sampleLoad);
    }
    if (settings.sampleImport) {
      this.fileMenu.openSamplePicker();
    }
    // And the TAKES — the other half of the same bargain. A take is APP state
    // beside the bank, so a script that trims or loops one changes nothing about
    // the song and banks no undo step. A name the takes do not have is REPORTED
    // rather than thrown, because the song the script built is good and a take
    // is a reference this machine may simply not have made yet.
    if (settings.recordTrims !== undefined || settings.recordLoops !== undefined) {
      const missing: string[] = [];
      for (const edit of settings.recordTrims ?? []) {
        const shaped = trimTakeByName(this.takes, edit.name, edit.start, edit.end);
        if (shaped.found) this.takes = shaped.takes;
        else missing.push(edit.name);
      }
      for (const edit of settings.recordLoops ?? []) {
        const shaped = loopTakeByName(this.takes, edit.name, edit.start, edit.end);
        if (shaped.found) this.takes = shaped.takes;
        else missing.push(edit.name);
      }
      if (missing.length > 0) {
        this.toast.show(`NO TAKE CALLED ${missing.join(', ').toUpperCase()}`, activeColors().danger);
      } else {
        this.toast.show('SHAPED THE TAKES', activeColors().ward);
      }
      if (this.recorderView?.isOpen) this.recorderView.render();
    }
    if (settings.recordSelect !== undefined) {
      // Which take the page shows — a session setting like `page`, so no undo
      // step and no file. A name the takes do not have is reported, the way a
      // missing sample is.
      const at = this.takes.findIndex((take) => sameTakeName(take.name, settings.recordSelect as string));
      if (at >= 0) this.recordSelected = at;
      else this.toast.show(`NO TAKE CALLED ${settings.recordSelect.toUpperCase()}`, activeColors().danger);
      if (this.recorderView?.isOpen) this.recorderView.render();
    }
    if (settings.arpAudition !== undefined) {
      // Whether the ARP page sounds the run as its dials move — a SESSION switch
      // beside `page` and `liveQuantize`, so no undo step and no file. It is
      // remembered even when the page is shut, so a script can turn hearing on
      // and then `page arp` and the dials sound from the first nudge.
      this.arpHear = settings.arpAudition;
      if (this.arpView?.isOpen) this.arpView.render();
    }
    if (settings.recordCapture !== undefined) {
      // A capture needs a browser and a microphone. A script asking for one is
      // REFUSED in words where there is no input rather than silently ignored,
      // exactly as `export.audio` is refused in a build that cannot decode.
      const refusal = captureRefusal();
      if (refusal) this.toast.show(refusal.toUpperCase(), activeColors().danger);
      else {
        this.captureName = settings.recordCapture;
        void this.captureTakeAction();
      }
    }
  }

  /**
   * Fetch a `.wav` from a path a script wrote, and add it to the bank.
   *
   * The twin of `loadInstrumentFromUrl`: the language holds no IO, so it says
   * WHAT to load and this does the loading. A failure is a toast rather than a
   * refusal of the script, because the song the script built is good and a
   * missing file is a missing FLAVOUR — every channel naming this recording plays
   * its built-in one-shot until the file arrives, which is the guarantee that
   * makes a sample a reference in the first place.
   */
  private async loadSampleFromUrl(source: string): Promise<void> {
    const name = this.sourceFileName(source);
    this.toast.show(`READING  ${name}...`, activeColors().textDim);
    let bytes: ArrayBuffer;
    try {
      const response = await fetch(source);
      if (!response.ok) {
        this.toast.show(`COULD NOT LOAD  ${name}  (HTTP ${response.status})`, activeColors().danger);
        return;
      }
      bytes = await response.arrayBuffer();
    } catch {
      this.toast.show(`COULD NOT READ  ${source}`, activeColors().danger);
      return;
    }
    const result = this.openSampleAction(name, bytes);
    this.toast.show(result.status, result.tone === 'error' ? activeColors().danger : activeColors().ward);
    const why = result.tone === 'error' ? result.details?.[0] : undefined;
    if (why !== undefined) this.toast.show(why, activeColors().danger);
  }

  /**
   * Apply a pasted script to the WHOLE song, atomically.
   *
   * `applyScript` parses first and edits a clone, so a script with a mistake on
   * any line changes nothing and comes back as an error list the modal shows
   * inline. Only on success do we take the song, as ONE undo step, so a bad
   * script is one Ctrl+Z from gone.
   */
  private applyScriptAction(source: string): void {
    // The saved voices go in, so a script can say `voice MYPAD` in a window that
    // has one saved, and gets the honest "is not a voice" listing when it does
    // not. A script never DEPENDS on the library: a sound it uses is copied into
    // the channel, and `songToScript` writes the numbers back out.
    const result = applyScript(this.song, source, this.savedVoices);
    if (!result.ok) {
      this.scriptPanel.showErrors(result.errors);
      return;
    }
    this.record();
    this.stopPlayback();
    // A script replaces the whole song, so a solo would point at a channel of a
    // song that no longer exists — and a run still echoing belongs to the song
    // that just went away.
    this.stopArpEcho();
    this.clearSolos();
    // And the same for a loop region — dropped HERE, before the script's own
    // settings land below, so a script that says `export bars 8 to 15` keeps it
    // and one that says nothing exports the whole song rather than the region the
    // last script left behind.
    this.clearBounce();
    this.song = result.song;
    this.patternIndex = 0;
    this.cursor = { row: 0, track: 0 };
    // The five settings that are not part of the song are applied here rather
    // than carried around in the data — and AFTER the song is in place, because
    // solo is expressed against the channels this script just made.
    this.applyScriptSettings(result.settings);
    this.syncAll();
    this.updateHistoryButtons();
    this.scriptPanel.close();
    const { summary } = result;
    this.toast.show(
      `SCRIPT APPLIED  ${summary.key}  \u00b7  ${summary.tracks} TRACKS  ${summary.steps} STEPS  ${summary.notes} NOTES`,
      activeColors().textGreen,
    );
  }

  /**
   * Start from a GENRE STARTER, as ONE undo step.
   *
   * The skeleton is a script (`model/genre.ts`), and the menu's row is the same
   * line a person would type: `start house`. So this goes through `applyScript`
   * rather than through a second applier, which is what makes the feature small —
   * the starter is applied by exactly the code that applies a pasted script, is
   * one `Ctrl+Z` from gone, and cannot describe anything the language cannot say.
   *
   * The script is built HERE rather than in the model so the scene is not the
   * place that knows the word `start` either: it asks the model to write the line
   * (`genreScript`) and hands it back to the model to apply.
   */
  private startGenreAction(id: string): FileActionResult {
    const genre = genreFromName(id);
    if (genre === null) return { status: `THERE IS NO STARTER CALLED "${id.toUpperCase()}"`, tone: 'error' };
    const result = applyScript(this.song, genreScript(id), this.savedVoices);
    if (!result.ok) {
      // Not reachable while the starters are valid \u2014 the test suite applies all
      // of them \u2014 but a menu that silently did nothing would be the worst way to
      // find out that one of them drifted, so the diagnostics come back as words.
      return {
        status: `${genre.label} COULD NOT BE APPLIED`,
        details: result.errors.map((error) => `line ${error.line}: ${error.message}`),
        tone: 'error',
      };
    }
    this.record();
    this.stopPlayback();
    this.clearSolos();
    this.clearBounce();
    this.song = result.song;
    this.patternIndex = 0;
    this.cursor = { row: 0, track: 0 };
    this.applyScriptSettings(result.settings);
    this.syncAll();
    this.updateHistoryButtons();
    const { summary } = result;
    return {
      status: `STARTED FROM ${genre.label}  -  ${summary.key}  \u00b7  ${summary.tracks} TRACKS  \u00b7  ${summary.notes} NOTES  \u00b7  PRESS SPACE`,
      details: [genre.blurb, 'One Ctrl+Z brings the song you had back.'],
      tone: 'ok',
    };
  }

  /**
   * Start over: a brand-new empty song, as ONE undo step.
   *
   * That is the whole reason the menu needs no "are you sure?" and can offer
   * NEW as the first item — Ctrl+Z is the confirmation, and it is a better one,
   * because it also un-does the times you were sure.
   */
  private newSongAction(): FileActionResult {
    if (isSongEmpty(this.song) && this.song.patterns.length === 1) {
      return { status: 'ALREADY A BLANK SONG', tone: 'ok' };
    }
    this.record();
    this.stopPlayback();
    this.clearSolos();
    this.clearBounce();
    this.song = createSong();
    this.patternIndex = 0;
    this.cursor = { row: 0, track: 0 };
    this.syncAll();
    this.updateHistoryButtons();
    return { status: 'NEW SONG  -  ONE BLANK PATTERN', tone: 'ok' };
  }

  /**
   * The F2 menu's way into the drum machine tab.
   *
   * It returns a status line like every other file-menu action, but the line is
   * never read: opening the tab closes the menu it was opened from, because only
   * one modal owns the keyboard at a time. The status is there so the handler has
   * the shape the menu expects rather than a special case.
   */
  private drumMachineAction(): FileActionResult {
    this.openDrumMachine();
    return { status: this.song.machine ? 'DRUM MACHINE OPEN' : 'MACHINE CREATED', tone: 'ok' };
  }

  /**
   * Open a file the user picked: either format, decided by what is in it.
   *
   * A file is never merged into what is on screen. `parseSongFile` reads a
   * script against a BLANK song, so opening a file always gives exactly the
   * song that file describes — the alternative is a song whose sound depends on
   * what happened to be open, which is not something a beginner can debug. It
   * is still one undo step, so OPEN can never lose anything.
   */
  private openFileAction(name: string, text: string): FileActionResult {
    const result = parseSongFile(text);
    if (!result.ok) {
      return { status: `COULD NOT OPEN  ${name}`, details: result.errors, tone: 'error' };
    }
    this.record();
    this.stopPlayback();
    // A solo is about the song that WAS on screen. Keeping it across an open
    // would leave the new song half-silent for a reason nothing on screen shows.
    this.clearSolos();
    this.clearBounce();
    this.song = result.song;
    this.patternIndex = 0;
    this.cursor = { row: 0, track: 0 };
    // A file that came from a SCRIPT can carry the app settings a script can set
    // (`solo 2`, `chords triad`, …); a JSON file carries only the master level.
    // Either way they are applied, so a script opened as a file behaves like the
    // same script pasted into the panel.
    this.applyScriptSettings(result.settings);
    this.syncAll();
    this.updateHistoryButtons();
    return {
      status: `OPENED  ${name}`,
      details: [`${result.kind.toUpperCase()}  ·  ${describeSong(this.song)}`, 'CTRL+Z PUTS THE PREVIOUS SONG BACK.'],
      tone: 'ok',
    };
  }

  /**
   * Import a `.mid` file: read it, turn it into a song, and make it the song.
   *
   * The same guarantees OPEN makes — one undo step, the file REPLACES what is
   * on screen, and a refusal changes nothing — because an import is an open that
   * happens to need a translator. The reader's own errors are shown verbatim, so
   * a file that is not really a MIDI file says so instead of arriving as a
   * silent song.
   */
  private openMidiAction(name: string, bytes: ArrayBuffer): FileActionResult {
    const result = songFromMidi(bytes, name);
    if (!result.ok) {
      return { status: `COULD NOT OPEN  ${name}`, details: result.errors, tone: 'error' };
    }
    this.record();
    this.stopPlayback();
    // A solo is about the song that WAS on screen, the same as an open.
    this.clearSolos();
    this.clearBounce();
    this.song = result.song;
    this.patternIndex = 0;
    this.cursor = { row: 0, track: 0 };
    this.syncAll();
    this.updateHistoryButtons();

    const { summary } = result;
    const details = [
      `MIDI  -  ${summary.tracks} TRACK${summary.tracks === 1 ? '' : 'S'}  -  ${summary.patterns} BAR${summary.patterns === 1 ? '' : 'S'}  -  ${summary.notes} NOTES  -  ${summary.bpm} BPM`,
    ];
    if (summary.dropped > 0) {
      details.push(`${summary.dropped} NOTE${summary.dropped === 1 ? '' : 'S'} DID NOT FIT IN ${summary.patterns} BARS AND WERE DROPPED.`);
    }
    details.push('CTRL+Z PUTS THE PREVIOUS SONG BACK.');
    return { status: `OPENED  ${name}`, details, tone: 'ok' };
  }

  /**
   * Load an instrument a SCRIPT named — a soundfont or a Noislet pack — then do
   * what the script asked next.
   *
   * The one instrument statement that needs nobody: `instrument use` needs
   * somebody to have imported the font already and `instrument import` opens the
   * picker so that somebody can choose one, while this fetches the file itself.
   * It is what lets a song script be a complete setup rather than half of one —
   * the same bargain `OPEN` makes by reading a whole song instead of the parts of
   * it you remember to put back.
   *
   * The path is a URL, resolved against the page by `fetch`, so a script names the
   * instrument the way the KIT holds it rather than the way one particular disk
   * does. Loading leaves the song alone and is not an undo step, exactly like the
   * menu's own imports: an instrument was loaded, not a piece of music.
   *
   * WHICH READER OPENS IT is decided by the bytes rather than by the extension —
   * `instrumentFileKind` — because a `.instrument.json` is the other half of this
   * feature and a song that names one should not need somebody's import list. So
   * one statement carries both kinds, and the file says which it is.
   *
   * Every failure is said out loud. A song whose channels are on `wave font` with
   * nothing behind them plays the built-in samples, which is a plausible sound and
   * therefore the worst kind of wrong: a font that did not arrive has to be
   * visible, or it sounds like the script worked.
   */
  private async loadInstrumentFromUrl(source: string, use: string | null): Promise<void> {
    const name = this.sourceFileName(source);
    this.toast.show(`READING  ${name}...`, activeColors().textDim);
    let bytes: ArrayBuffer;
    try {
      const response = await fetch(source);
      if (!response.ok) {
        this.toast.show(`COULD NOT LOAD  ${name}  (HTTP ${response.status})`, activeColors().danger);
        return;
      }
      bytes = await response.arrayBuffer();
    } catch {
      // A missing file, a folder the dev server does not serve and no network at
      // all are one answer from here — and the path the script wrote is the
      // useful half of it.
      this.toast.show(`COULD NOT READ  ${source}`, activeColors().danger);
      return;
    }
    const result = instrumentFileKind(new Uint8Array(bytes)) === 'noislet'
      ? this.openInstrumentAction(name, decodeInstrumentText(new Uint8Array(bytes)))
      : this.openSoundFontAction(name, bytes);
    if (result.tone === 'error') {
      this.toast.show(result.status, activeColors().danger);
      const why = result.details?.[0];
      if (why !== undefined) this.toast.show(why, activeColors().danger);
      return;
    }
    this.toast.show(result.status, activeColors().ward);
    if (use !== null) {
      // The instrument is in the list now, so the `instrument use` beside it
      // means exactly what it means on its own — reported by that same code,
      // rather than by a second copy of it here that could drift.
      this.applyScriptSettings({ volume: null, instrumentUse: use });
    }
  }

  /** The file name an instrument source ends in: what to call it while it loads. */
  private sourceFileName(source: string): string {
    const path = source.split(/[?#]/)[0];
    const last = path.split('/').pop() ?? '';
    return last === '' ? source : last;
  }

  /**
   * Load a soundfont: read it, add it to the instrument list, leave the song be.
   *
   * NOT an open, and deliberately NOT an undo step. A font is not part of a song
   * — it is an instrument the app is holding — so nothing about the song changed
   * and there is nothing for Ctrl+Z to take back. Loading one mid-playback takes
   * effect on the next note rather than cutting the one that is ringing.
   *
   * A font that cannot be read leaves the list exactly as it was, so a failed
   * import never costs you the instrument you already had open.
   */
  private openSoundFontAction(name: string, bytes: ArrayBuffer): FileActionResult {
    const result = readSoundFont(bytes);
    if (!result.ok) {
      return { status: `COULD NOT LOAD  ${name}`, details: result.errors, tone: 'error' };
    }
    const label = result.font.name || name.replace(/\.sf2$/i, '');
    return this.keepInstrument(instrumentEntryFor(
      label,
      result.font,
      describeFont(result.font),
      'soundfont',
    ), `LOADED  ${label}`);
  }

  /**
   * Load a recording: read the WAV, add it to the bank, leave the song be.
   *
   * Reached two ways — the F2 picker (`sample import`, which opens it) and
   * `sample load` naming a path — and both do the same thing, which is why there
   * is one of these rather than one per road in.
   *
   * NOT an open and NOT an undo step, for the instrument's reason and one more: a
   * sample is app state, and a Ctrl+Z that removed a file you just chose would be
   * a Ctrl+Z that threw away your own recording.
   *
   * The channel name comes from the FILE, and the file name is tidied into a
   * sample name (spaces become `-`): `My Break 01.wav` arrives as `My-Break-01`,
   * which is what the track line must then say. That is the one place the app
   * decides a name for you, and it is the name printed in the status line, so the
   * line to write next is always on screen. Nothing ELSE about the song changes:
   * a channel only starts playing this when `sample <name>` is on its line.
   */
  private openSampleAction(name: string, bytes: ArrayBuffer): FileActionResult {
    const read = decodeWav(bytes);
    if (!read.ok) {
      return { status: `COULD NOT LOAD  ${name}`, details: [read.error], tone: 'error' };
    }
    // Folded to one channel on the way in: a slot is mono because the channel it
    // plays on already has a `pan`, and two pans is one control with two names.
    const made = makeSample(this.sampleNameForFile(name), read.pcm.sampleRate, monoPcm(read.pcm));
    if (!made.ok) {
      return { status: `COULD NOT LOAD  ${name}`, details: [made.error], tone: 'error' };
    }
    const added = addSample(this.samples, made.sample);
    if (!added.ok) {
      return { status: `COULD NOT LOAD  ${name}`, details: [added.error], tone: 'error' };
    }
    this.samples = added.bank;
    // A loaded recording joins the TAKE LIBRARY too, marked IMPORTED, so the
    // RECORDER page shows every recording the app holds — captured or dropped in —
    // in one list. Replacing a name replaces its take as well, for the same reason
    // the bank replaces the bytes.
    const take = takeFromSample(made.sample);
    this.takes = [...this.takes.filter((one) => !sameTakeName(one.name, take.name)), take];
    // The engine hears it at once, so a channel already naming this recording
    // (loaded before, replaced now) starts playing the new file on the next note.
    this.pushBankToEngine();
    if (this.recorderView?.isOpen) this.recorderView.render();
    const label = sampleLabel(made.sample);
    const next = `WRITE \`sample ${made.sample.name}\` ON A CHANNEL ON \`wave sample\`.`;
    return added.replaced
      ? { status: `REPLACED  ${label}`, details: [next, 'The file it had is gone: load it again to get that one back.'], tone: 'ok' }
      : { status: `LOADED  ${label}`, details: [next], tone: 'ok' };
  }

  /**
   * Point the channel under the cursor at a recording, as one undo step.
   *
   * The row that makes the SAMPLES page a PICKER rather than a report. Two
   * refusals guard it, and both are about the same fact — a recording plays on a
   * `sample` LAYER, so a channel has to be one before the reference means
   * anything: the wave has to be `sample`, and the name has to be in the bank.
   * Neither is silent, because "I pressed ENTER and nothing happened" is the
   * worst answer a menu can give.
   */
  private useSampleAction(name: string): FileActionResult {
    const track = this.song.tracks[this.cursor.track];
    const sample = sampleByName(this.samples, name);
    if (!track) return { status: 'NO CHANNEL IS SELECTED', tone: 'error' };
    if (!sample) return { status: `NO RECORDING CALLED "${name.toUpperCase()}" IN THE BANK`, tone: 'error' };
    if (track.voice.wave !== 'sample') {
      return {
        status: `CHANNEL ${this.cursor.track + 1} IS ON "WAVE ${track.voice.wave.toUpperCase()}"`,
        details: [
          `Nothing would be heard: a recording plays on a "sample" layer. Set it (F4), then press ENTER here.`,
          'A `sine` channel naming a recording is a line waiting for its wave.',
        ],
        tone: 'error',
      };
    }
    if (track.sample !== null && sameSampleName(track.sample, sample.name)) {
      return { status: `CHANNEL ${this.cursor.track + 1} ALREADY PLAYS ${sample.name.toUpperCase()}`, tone: 'ok' };
    }
    // One undo step, like any other song edit: a channel naming a recording is
    // part of the song, even though the audio it names is not. That asymmetry is
    // the design — `Ctrl+Z` takes the reference back and the file stays loaded.
    this.record();
    track.sample = sample.name;
    this.syncAll();
    this.updateHistoryButtons();
    return {
      status: `CHANNEL ${this.cursor.track + 1} PLAYS ${sample.name.toUpperCase()}`,
      details: ['One Ctrl+Z takes the reference back. The recording stays in the bank.'],
      tone: 'ok',
    };
  }

  /**
   * Take a recording back out of the bank.
   *
   * App state, like an imported instrument: no undo step, and the song is
   * untouched. A channel that named it keeps the NAME and falls back to the
   * built-in one-shot — which is what a missing recording has meant since the
   * day this existed, so removing one is never a way to break a song.
   */
  private removeSampleAction(name: string): FileActionResult {
    const sample = sampleByName(this.samples, name);
    if (!sample) return { status: `NO RECORDING CALLED "${name}" IS LOADED`, tone: 'error' };
    this.samples = removeSample(this.samples, sample.name);
    // The engine is re-pointed at the bank it now has, so a channel naming this
    // one starts playing its fallback with the next note rather than at the next
    // script apply.
    this.pushBankToEngine();
    const left = this.samples.length;
    return {
      status: `REMOVED  ${sample.name.toUpperCase()}`,
      details: [
        left === 0
          ? 'The bank is empty: a channel naming a recording plays its built-in one-shot.'
          : `${left} LEFT IN THE BANK.`,
        'APP STATE, NOT THE SONG: THERE IS NOTHING FOR CTRL+Z TO TAKE BACK.',
      ],
      tone: 'ok',
    };
  }

  /**
   * The name a picked file gets: its stem, tidied into a sample name.
   *
   * `My Break 01.wav` becomes `My-Break-01` — the extension dropped because the
   * app knows what it is, and the spaces turned into `-` because a space would
   * END the name on a track line. A stem that cannot be a name at all (empty, or
   * starting with a digit) is left as written and refused by `makeSample`, which
   * says what is wrong with it in full rather than having a second, shorter
   * opinion here.
   */
  private sampleNameForFile(fileName: string): string {
    return tidySampleName(fileName.replace(/\.(wav|wave)$/i, ''));
  }

  /**
   * A Noislet pack: read it, add it to the list, leave the song be.
   *
   * Reached two ways — the F2 picker (`IMPORT FROM NOISLET`) and `instrument load`
   * naming a `.instrument.json` — and both do the same thing, which is why there
   * is one of these rather than one per road in.
   *
   * The other end of `noislet/doc/instrument-format.md`. A `.instrument.json`
   * holding several sounds becomes one instrument with one preset per sound, so a
   * channel's `duty` knob chooses between them — the same knob that chooses a
   * soundfont's preset, which is why this needed no new playback code at all.
   *
   * Warnings travel into the status lines rather than being swallowed: a pack with
   * one damaged sound is worth having, and the sentence saying which one is the
   * difference between an instrument that is missing a sound and one that is
   * mysteriously short of one.
   */
  /**
   * A patch file, applied to the channel under the cursor.
   *
   * ONE undo step, like any other sound edit: a patch is part of the song the
   * moment it is on a channel, even though the file it came from is not. The read
   * can refuse in several ways and every one of them arrives as sentences — a
   * patch that half-applied would be a sound nobody chose.
   *
   * A file with no name of its own is named after the FILE, which is the only
   * other thing that knows what to call it. Everything about the mix is left
   * where it was, and the status line says so, because the surprise a patch is
   * most likely to cause is the one it is designed not to: a level moving.
   */
  /**
   * Read a kit document, keep it, and make it the song's drums.
   *
   * TWO acts with one report, and the asymmetry is the design: the KIT joins the
   * library, which is the APP's and outlives the session (so no undo step, the
   * same as saving a voice), while the SONG's kit changes, which is song data (so
   * one undo step, the same as `useSampleAction`). `Ctrl+Z` therefore takes the
   * drums back to what they were and leaves the kit saved — which is what a person
   * means by "no, not this one" without meaning "forget it".
   *
   * The one refusal is a full library, and it is honest rather than silent: a kit
   * that joined nothing would leave the song naming drums the engine cannot find,
   * which falls back to the presets with nothing on screen to say why.
   */
  private openKitAction(fileName: string, text: string): FileActionResult {
    const read = kitFromJson(text);
    if (!read.ok) {
      return { status: `COULD NOT READ  ${fileName}`, details: read.errors, tone: 'error' };
    }
    const name = read.kit.name;
    const had = userKitFromName(name, this.savedKits) !== null;
    const next = withUserKit(this.savedKits, read.kit);
    if (!had && next.length === this.savedKits.length) {
      return {
        status: `YOUR KITS ARE FULL  (${MAX_USER_KITS})`,
        details: [
          `Nothing was changed: a kit has to be IN your library for a song to play it.`,
          'Save one of your kits as a file, then read this one back AFTER you have room.',
        ],
        tone: 'error',
      };
    }
    this.savedKits = next;
    const remembered = saveKitLibrary(this.savedKits);
    this.record();
    this.song.kit = name;
    this.syncAll();
    this.toast.show(`KIT  ${name}`, activeColors().ward);
    return {
      status: `LOADED  ${kitRowLabel(read.kit)}`,
      details: [
        had ? `REPLACED THE \"${name}\" YOU ALREADY HAD.` : `NOW ONE OF YOUR KITS. WRITE \`kit ${name}\` IN A SCRIPT TO PLAY IT IN ANY SONG.`,
        'The song now plays it \u2014 Ctrl+Z takes that back; the kit stays saved.',
        remembered ? '' : 'FOR THIS SESSION ONLY: STORAGE IS UNAVAILABLE.',
      ].filter((line) => line !== ''),
      tone: 'ok',
    };
  }

  private openPatchAction(fileName: string, text: string): FileActionResult {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return { status: 'NO CHANNEL IS SELECTED', tone: 'error' };
    const read = patchFromJson(text);
    if (!read.ok) {
      return { status: `COULD NOT READ  ${fileName}`, details: read.errors, tone: 'error' };
    }
    const name = read.name === PATCH_NAME_FALLBACK ? patchNameFromFile(fileName) : read.name;
    const channel = `${this.cursor.track + 1}  ${track.name}`;
    this.editSound((next) => applySoundToTrack(next, read.sound));
    this.toast.show(`PATCH  ${name}  \u2192  ${track.name}`, activeColors().ward);
    return {
      status: `LOADED  ${name}  ONTO CHANNEL ${channel}`,
      details: [
        patchAbout(read.sound),
        'The level, the pan, the group and the pocket are yours and did not move.',
      ],
      tone: 'ok',
    };
  }

  private openInstrumentAction(name: string, text: string): FileActionResult {
    const result = readNoisletInstrument(text);
    if (!result.ok) {
      return { status: `COULD NOT IMPORT  ${name}`, details: result.errors, tone: 'error' };
    }
    return this.keepInstrument(
      instrumentEntryFor(result.name, result.font, result.detail),
      `IMPORTED  ${result.name}`,
      result.warnings,
    );
  }

  /**
   * Put a freshly read instrument in the list, select it, and say what happened.
   *
   * Shared by both importers because the two of them differ in exactly one thing
   * — how the bytes became a `SoundFont` — and nothing after that. The name is
   * what says which: an import that lands on a name already in the list REPLACES
   * that one, which is the round trip this exists for (tweak in Noislet, export,
   * import again, and the instrument a channel points at is the new one).
   */
  private keepInstrument(entry: InstrumentEntry, status: string, warnings: string[] = []): FileActionResult {
    const { library, replaced } = addInstrument(this.instruments, entry);
    this.instruments = library;
    this.applyInstruments();

    // A channel that says `wave font` is worth saying out loud, because the
    // instrument is the only sound here that comes from outside the app — and the
    // status line is where a player finds out that they have just changed it.
    const users = this.song.tracks.filter((track) => track.voice.wave === 'font').length;
    const details = [
      describeInstrument(entry),
      ...warnings,
      replaced ? `REPLACED THE PREVIOUS "${entry.name}".` : `NOW IN THE INSTRUMENT LIST (F2 \u2192 INSTRUMENTS).`,
      users > 0
        ? `${users} CHANNEL${users === 1 ? '' : 'S'} ON THIS SONG PLAY \`wave font\`. THE SONG IS UNCHANGED.`
        : 'THE SONG IS UNCHANGED. USE IT WITH A CHANNEL ON `wave font`.',
    ];
    return { status, details, tone: 'ok' };
  }

  /**
   * Make one of the imported instruments the one `wave font` plays.
   *
   * App state, not a song edit: no undo step, and the change takes effect on the
   * next note rather than cutting the one ringing now.
   */
  private useInstrumentAction(id: string): FileActionResult {
    const entry = this.instruments.entries.find((item) => item.id === id);
    if (!entry) return { status: 'THAT INSTRUMENT IS NO LONGER IN THE LIST', tone: 'error' };
    this.instruments = selectInstrument(this.instruments, id);
    this.applyInstruments();
    return {
      status: `USING  ${entry.name}`,
      details: [describeInstrument(entry), 'A CHANNEL ON `wave font` PLAYS THIS NOW. THE SONG IS UNCHANGED.'],
      tone: 'ok',
    };
  }

  /**
   * Take an instrument back out of the list.
   *
   * The counterpart of an import, and app state for the same reason: no undo
   * step, and the song is not changed by it. A channel on `wave font` keeps
   * saying so and goes back to the built-in samples until something else is
   * loaded — which is the documented behaviour with an empty list, not a
   * special case for having removed the one you were using.
   */
  private removeInstrumentAction(id: string): FileActionResult {
    const entry = this.instruments.entries.find((item) => item.id === id);
    if (!entry) return { status: 'THAT INSTRUMENT IS NO LONGER IN THE LIST', tone: 'error' };
    this.instruments = removeInstrument(this.instruments, id);
    this.applyInstruments();

    const users = this.song.tracks.filter((track) => track.voice.wave === 'font').length;
    const left = this.instruments.entries.length;
    return {
      status: `REMOVED  ${entry.name}`,
      details: [
        describeInstrument(entry),
        left > 0
          ? `${left} LEFT IN THE LIST, AND \`wave font\` NOW PLAYS ${this.instruments.entries[this.instruments.active]?.name ?? 'NOTHING'}. IMPORT THE FILE AGAIN TO GET THIS ONE BACK.`
          : 'THE LIST IS EMPTY \u2014 A CHANNEL ON `wave font` PLAYS THE BUILT-IN SAMPLES NOW.',
        users > 0 ? `${users} CHANNEL${users === 1 ? '' : 'S'} ON THIS SONG PLAY \`wave font\`. THE SONG IS UNCHANGED.` : 'THE SONG IS UNCHANGED.',
      ],
      tone: 'ok',
    };
  }

  /**
   * Hand the engine the instrument the list has selected.
   *
   * The single line where "which instrument is loaded" reaches the audio graph,
   * which is what makes `instrument use` and a click in the F2 list the same
   * action with the same consequences.
   */
  private applyInstruments(): void {
    this.engine.setFont(this.activeFont());
  }

  /** The `SoundFont` the engine should play, or null when the list is empty. */
  private activeFont(): SoundFont | null {
    return activeInstrument(this.instruments)?.font ?? null;
  }

  /**
   * Rename a channel from the click-to-edit box on its row. This is the exact
   * counterpart of a script's `track 2 "BASS"`: same model field, same undo
   * step, so a name typed by hand and a name written in a script are one thing.
   */
  private renameTrack(index: number, name: string): void {
    const track = this.song.tracks[index];
    if (!track) return;
    const clean = tidyTrackName(name);
    if (clean === '' || clean === track.name) return;
    this.record();
    track.name = clean;
    this.syncAll();
    this.updateHistoryButtons();
    this.toast.show(`TRACK ${index + 1}  ${clean}`, activeColors().textGreen);
  }

  /**
   * Cycle a channel's waveform, the mouse's answer to a script's `wave`.
   *
   * The chip on a channel row is a shortcut for the one knob that is also a
   * shape; everything else about a channel's sound lives in the F4 menu.
   */
  private cycleWave(index: number): void {
    const track = this.song.tracks[index];
    if (!track) return;
    this.record();
    track.voice.wave = nextWave(track.voice.wave);
    this.engine.setVoice(index, track.voice);
    this.trackList.setTracks(this.song.tracks);
    this.updateHistoryButtons();
    this.toast.show(`${track.name}  ${voiceNameFor(track.voice)}`, activeColors().ward);
  }

  // --- voices (the F4 menu's edits) -----------------------------------------

  /**
   * Bank one undo step for the whole F4 visit, then make the change.
   *
   * A sound is fiddled with, so the snapshot is taken before the FIRST nudge of
   * a visit and none after it — one Ctrl+Z puts the whole instrument back. The
   * lighter refresh (rather than `syncAll`) keeps a dragged bar responsive: the
   * grid did not change, so it is not rebuilt.
   */
  private editSound(run: (track: Track) => void): void {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return;
    if (!this.voiceEditRecorded) {
      this.record();
      this.voiceEditRecorded = true;
    }
    run(track);
    this.syncAudioGraph();
    this.trackList.setTracks(this.song.tracks);
    this.updateInspector();
    this.updateHistoryButtons();
  }

  /**
   * A change to the channel's VOICE alone: the waveform and the nine knobs, which
   * is everything `F4` edited before a channel could have layers.
   *
   * The narrower half of `editSound`, and the reason every F4 knob still costs
   * one undo step per visit rather than gaining a second, layer-aware meaning.
   */
  private editVoice(run: (voice: VoiceParams) => void): void {
    this.editSound((track) => run(track.voice));
  }

  /**
   * Apply a named instrument to the selected channel.
   *
   * One name space for the author, two tables behind it: a built-in voice first,
   * then the user's own saved sounds. That is what makes "use my pad" the same
   * act as "use pad", in the menu and in a script alike — the only difference is
   * what there is to say about it afterwards.
   */
  private applyVoiceAction(name: string): string {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return 'NO CHANNEL';
    const preset = voiceById(name);
    const saved = preset ? null : userVoiceFromName(name, this.savedVoices);
    if (!preset && !saved) return 'NO SUCH VOICE';

    if (saved) {
      // A saved sound arrives as its WHOLE self. A plain saved sound is one
      // voice, so clicking it does exactly what it did before layers existed;
      // one that was saved with a stack brings its layers, because that is what
      // the user named. A preset is one voice, so it never turns up here and
      // `track 1 voice pad` keeps meaning what it always meant.
      const sound = copySound(savedSound(saved));
      this.editSound((next) => {
        next.voice = sound.voice;
        if (sound.stack.length > 0) next.stack = sound.stack;
      });
      const layers = layerCount(track);
      return layers > 1
        ? `${track.name}  \u00b7  YOUR SOUND ${saved.name}  \u00b7  ${layers} LAYERS`
        : `${track.name}  \u00b7  YOUR SOUND ${saved.name}`;
    }

    this.editVoice((voice) => { Object.assign(voice, copyVoice(preset!.params)); });
    return `${track.name}  \u00b7  ${preset!.label.toUpperCase()}  \u00b7  ${preset!.blurb}`;
  }

  /**
   * Save the selected channel's sound under a name, for the next song too.
   *
   * NOT an undo step and not part of the song: the library is the app's, not the
   * music's, so Ctrl+Z must not be able to remove a sound the user saved (and it
   * cannot, because nothing here records one). Saving over a name you already
   * have is the common case — you iterated — so it silently replaces.
   */
  private saveVoiceAction(name: string): string {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return 'NO CHANNEL';
    const tidy = tidyVoiceName(name);
    // Passing the name as its own `ignore` is what makes SAVE AS… able to save
    // OVER a sound: replacing one you already have is the common case (you
    // iterated), so only the name's shape can refuse it here.
    const problem = voiceNameProblem(tidy, this.savedVoices, tidy);
    if (problem !== null) return problem.toUpperCase();
    // What is saved is the channel's WHOLE sound — its voice and the layers above
    // it. Saving a voice and leaving the stack behind would make `SAVE AS…` a lie
    // on exactly the channels worth saving.
    const layers = layerCount(track);
    this.savedVoices = withUserVoice(this.savedVoices, {
      name: tidy,
      params: copyVoice(track.voice),
      stack: track.stack.map(copyLayer),
    });
    const remembered = saveVoiceLibrary(this.savedVoices);
    // The channel rows label themselves from the library, so they hear about it
    // the moment it changes — saving a sound renames the chip you were looking at.
    this.trackList.setSavedVoices(this.savedVoices);
    const named = layers > 1 ? `SAVED "${tidy}" (${layers} LAYERS)` : `SAVED "${tidy}"`;
    return remembered
      ? `${named} - IT IS AT THE TOP OF THE LIST`
      : `${named} FOR THIS SESSION (STORAGE IS UNAVAILABLE)`;
  }

  /**
   * Forget a saved sound.
   *
   * Channels already using it keep the sound, because a channel carries its own
   * numbers and only ever looked the instrument up once — which is the same
   * reason a saved song never depends on this list.
   */
  private removeVoiceAction(name: string): string {
    const before = this.savedVoices.length;
    this.savedVoices = withoutUserVoice(this.savedVoices, name);
    if (this.savedVoices.length === before) return `NO SOUND CALLED "${name}"`;
    saveVoiceLibrary(this.savedVoices);
    this.trackList.setSavedVoices(this.savedVoices);
    return `FORGOT "${name}". ANY CHANNEL USING IT KEEPS THE SOUND.`;
  }

  /** Set one knob, the menu's answer to a script's `bright 60`. */
  private setKnobAction(id: VoiceParamId, value: number): string {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return 'NO CHANNEL';
    const next = clampParam(value);
    if (track.voice[id] === next) return '';
    this.editVoice((params) => { params[id] = next; });
    return `${track.name}  ${id.toUpperCase()} ${next}`;
  }

  /** Set the channel's waveform. */
  private setWaveAction(wave: Wave): string {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return 'NO CHANNEL';
    if (track.voice.wave === wave) return '';
    this.editVoice((params) => { params.wave = wave; });
    return `${track.name}  WAVE ${wave.toUpperCase()}`;
  }

  /**
   * Set how the selected channel slides or wobbles.
   *
   * The two live on the TRACK rather than in its voice, so this is not
   * `editVoice` — but it is the same bargain: one undo step for the whole visit,
   * and the audio graph re-pointed from the one place that knows how.
   */
  private setExpressionAction(which: 'glide' | 'vibrato', value: number): string {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return 'NO CHANNEL';
    const next = which === 'glide' ? clampGlide(value) : clampVibrato(value);
    if (track[which] === next) return '';
    if (!this.voiceEditRecorded) {
      this.record();
      this.voiceEditRecorded = true;
    }
    track[which] = next;
    this.syncAudioGraph();
    this.updateInspector();
    this.updateHistoryButtons();
    return next === 0
      ? `${track.name}  ${which.toUpperCase()} OFF`
      : `${track.name}  ${which.toUpperCase()} ${next}%`;
  }

  /**
   * A change to a channel's LAYERS, through the one door every sound edit uses.
   *
   * The same bargain `editVoice` strikes, and for the same reason: a stack is
   * something you fiddle with, so the snapshot is taken before the first change of
   * a visit and never again until the next one — one Ctrl+Z for the whole
   * instrument rather than one for the detune. The lighter refresh rather than
   * `syncAll` keeps a dragged bar responsive: the grid did not change, so it is
   * not rebuilt.
   */
  private editPatch(run: (track: Track) => void): void {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return;
    if (!this.patchEditRecorded) {
      this.record();
      this.patchEditRecorded = true;
    }
    run(track);
    this.syncAudioGraph();
    this.trackList.setTracks(this.song.tracks);
    this.updateInspector();
    this.updateHistoryButtons();
  }

  /**
   * Stack a layer above the top one, as a copy of the layer below it.
   *
   * A COPY rather than a blank layer, because a new layer that made no sound
   * would read as a bug and a silent one is nothing to shape — and because the
   * first move after stacking is to MOVE what you stacked: detune it, drop it an
   * octave, turn it down. That is what the status line asks for.
   */
  private addLayerAction(): string {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return 'NO CHANNEL';
    if (layerCount(track) >= MAX_LAYERS) {
      return `THAT IS ALL ${MAX_LAYERS} LAYERS. TURN ONE DOWN, OR TAKE ONE OUT.`;
    }
    this.editPatch((next) => { setTrackLayer(next, layerCount(next) + 1, {}); });
    return `LAYER ${layerCount(track)} ADDED - A COPY OF THE ONE BELOW. NOW MOVE IT, OR TURN IT DOWN.`;
  }

  /**
   * Take one layer out of the stack, closing the gap.
   *
   * Layer 1 is the voice and is not a layer you can take out: a channel with no
   * sound at all is what `mute` is for, and saying so is friendlier than a key
   * that does nothing.
   */
  private removeLayerAction(index: number): string {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return 'NO CHANNEL';
    if (index < 2 || index > layerCount(track)) return 'THERE IS NO SUCH LAYER.';
    this.editPatch((next) => { clearTrackLayer(next, index); });
    return `LAYER ${index} REMOVED - THE ONES ABOVE IT MOVED DOWN.`;
  }

  /** Set one layer's waveform, leaving its tone and its place in the stack alone. */
  private setLayerWaveAction(index: number, wave: Wave): string {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return 'NO CHANNEL';
    const layer = layerAt(track, index);
    if (!layer) return 'THERE IS NO SUCH LAYER.';
    if (layer.wave === wave) return '';
    this.editPatch((next) => { setTrackLayer(next, index, layerChange('wave', wave)); });
    return `LAYER ${index} IS NOW ${wave.toUpperCase()}`;
  }

  /**
   * Set one layer's `octave`, `detune` or `gain` — the three things a voice has not.
   *
   * Layer 1 is refused HERE as well as in the menu, because this is the door the
   * script and the file format come through too: a re-tuned voice would be a
   * different sound wearing the first layer's name, which is exactly the thing
   * the one-layer identity must not allow.
   */
  private setLayerFieldAction(index: number, id: LayerField, value: number): string {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return 'NO CHANNEL';
    if (index === 1) {
      return 'LAYER 1 IS THE VOICE: ITS PITCH AND LEVEL COME FROM THE CHANNEL. PRESS INS TO STACK ONE ABOVE IT.';
    }
    const layer = layerAt(track, index);
    if (!layer) return 'THERE IS NO SUCH LAYER.';
    const next = clampLayerField(id, value);
    if (layer[id] === next) return '';
    this.editPatch((sound) => { setTrackLayer(sound, index, layerChange(id, next)); });
    const field = LAYER_FIELD_BY_ID[id];
    return `LAYER ${index}  ${field.label} ${id === 'detune' ? `${next} CENTS` : next}`;
  }

  /** Set one of a layer's nine knobs — the same knob F4 shows for the voice. */
  private setLayerKnobAction(index: number, id: VoiceParamId, value: number): string {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return 'NO CHANNEL';
    const layer = layerAt(track, index);
    if (!layer) return 'THERE IS NO SUCH LAYER.';
    const next = clampParam(value);
    if (layer[id] === next) return '';
    this.editPatch((sound) => { setTrackLayer(sound, index, layerChange(id, next)); });
    return index === 1
      ? `${track.name}  ${id.toUpperCase()} ${next}`
      : `LAYER ${index}  ${id.toUpperCase()} ${next}`;
  }

  /**
   * Set one of the channel's effects — the second page of `F7`.
   *
   * The effect belongs to the CHANNEL rather than to the sound, which is why
   * this writes `track[id]` and not a layer: the same pad wants no drive under a
   * singer and a lot of it under a solo, and a layer is the wrong place for a
   * fact about the mix. The line it hands back says which way the dial went, and
   * says OFF plainly rather than showing a zero — `0 is off` is the whole promise
   * those six knobs make, so the screen says it in words.
   */
  private setEffectAction(id: TrackEffectId, value: number): string {
    const track = this.song.tracks[this.cursor.track];
    if (!track) return 'NO CHANNEL';
    const next = clampEffect(value);
    if (track[id] === next) return '';
    this.editPatch((sound) => { sound[id] = next; });
    const effect = TRACK_EFFECT_BY_ID[id];
    return next === MIN_EFFECT
      ? `${effect.label} OFF - THIS CHANNEL IS BACK TO ITS PLAIN SOUND.`
      : `TRACK ${this.cursor.track + 1}  ${effect.label} ${next} - ${effect.high.toUpperCase()}`;
  }

  /**
   * Sound a note on the selected channel, so a change can be heard.
   *
   * It plays the note under the cursor when there is one — the sound in its real
   * place — and falls back to a mid note on the channel's own octave when the
   * cell is empty, so choosing a voice on an empty bar still makes a sound.
   *
   * A channel that GLIDES gets TWO notes instead of one, because a slide is a
   * relationship between two notes and a single note can never show it. Without
   * that the dial would be a number you set and hope about.
   */
  private auditionVoice(): void {
    const track = this.song.tracks[this.cursor.track];
    const note = cellAt(this.currentPattern, this.cursor.row, this.cursor.track)?.note ?? null;
    const midi = note ?? baseMidiForOctave(this.octave) + 4;
    if (track && track.glide > 0) this.engine.previewGlide(this.cursor.track, midi);
    else this.engine.previewNote(this.cursor.track, midi);
  }

  private clearPatternAction(): void {
    if (isPatternEmpty(this.currentPattern)) {
      this.toast.show('ALREADY EMPTY', activeColors().textDim);
      return;
    }
    this.record();
    clearPattern(this.currentPattern);
    this.syncAll();
    this.updateHistoryButtons();
    this.toast.show('PATTERN CLEARED', activeColors().danger);
  }

  /**
   * Play the SONG, which is the order played end to end and then looped.
   *
   * The engine counts steps and knows nothing about patterns, so the callback
   * resolves each step to a bar of the order and a row inside it — which is what
   * lets a two-pattern, four-bar song play as one thing, and what makes the
   * playhead line up in the right bar as the view follows along.
   */
  private startPlayback(): void {
    if (this.engine.playing) return;
    // A song is playable when the TRACKER has a note in the order OR the drum
    // machine has a hit to fire. The machine is a song-level instrument that can
    // carry a whole song on its own, so asking only the patterns would refuse to
    // start a beat that lives entirely in the machine — which is exactly what the
    // drum machine page writes. The engine already schedules machine hits per row
    // whatever the patterns hold; this guard is the only thing that was keeping it
    // from ever being reached.
    if (isOrderEmpty(this.song) && !machineActive(this.song.machine) && !canPerform(this.song)) {
      this.toast.show('ADD A NOTE FIRST', activeColors().danger);
      return;
    }
    this.syncAudioGraph();
    this.playHomePattern = this.patternIndex;
    // The whole live decision is `stepNotes`'s: a performing scene, or the song's
    // own order when nothing is performing. It is handed the forward-reading step
    // the engine keeps as well as the wrapping one, so a launch keyed to a bar
    // line several loops away still lands exactly once.
    this.engine.start(songSteps(this.song), (step, abs) =>
      stepNotes(this.song, this.liveCues, step, abs ?? step),
    );
    // No toast here: the transport's own status line, the moving playhead and
    // the piano lighting up already say it.
    this.transport.setPlaying(true);
  }

  private stopPlayback(): void {
    if (!this.engine.playing) return;
    this.engine.stop();
    this.transport.setPlaying(false);
    // A performance ends with the transport: the next play starts from the song's
    // own order rather than resuming a scene nobody is watching. The QUANTIZE
    // setting stays, because it is how the performer launches, not what is playing.
    this.liveCues = [];
    // The performance is over, so the machine returns to the song's own form.
    this.machineScene = null;
    this.engine.setMachineBars(machineBarsForSong(this.song));
    // A live take ends with the transport, so the NEXT one is its own Ctrl+Z.
    this.midiTakeRecorded = false;
    this.lastPlayStep = -1;
    this.setViewPlayhead(-1);
    this.keyboard.setSounding([]);
    // Put the editor back where it was before the song walked off with the view.
    if (this.patternIndex !== this.playHomePattern) {
      this.patternIndex = this.playHomePattern;
      this.syncAll();
    }
  }

  private togglePlay(): void {
    if (this.engine.playing) this.stopPlayback();
    else this.startPlayback();
  }

  // --- live performance -----------------------------------------------------

  /**
   * The scene performing right now, or null when the song's own `order` is playing.
   *
   * The ONE reading of the cue list on this side of the engine: the page's lit row
   * and (later) the API both come through here, so a launch cannot sound one scene
   * while a screen says another.
   */
  get liveScene(): number | null {
    return activeScene(this.liveCues, this.engine.absoluteStep);
  }

  /** How many bars a launch waits for. Read by the page and the API. */
  get liveQuantizeValue(): number { return this.liveQuantize; }

  /**
   * How far through the performing bar we are, 0..1 — the page's loop-progress
   * fill. Read from the same clock the scheduler sounds, so the fill cannot lag
   * or lead the notes.
   */
  get liveProgress(): number {
    const rows = Math.max(1, patternRows(this.song));
    const abs = this.engine.absoluteStep;
    if (abs < 0) return 0;
    return (abs % rows) / rows;
  }

  /**
   * The countdown to the next launch, in beats — the status line's `n BEATS` and
   * its pips. The same span the launch itself lands on, so the count never
   * disagrees with the boundary.
   */
  get liveCountdown(): { elapsed: number; total: number } | null {
    const abs = this.engine.absoluteStep;
    if (abs < 0) return null;
    return launchCountdown(abs, this.liveQuantize, patternRows(this.song), this.song.rowsPerBeat);
  }

  /**
   * Point the engine's drum machine at the scene performing, or back at the order.
   *
   * A scene's machine CLIP is a bar, so while it performs the machine plays THAT
   * bar every bar (a one-entry list); a scene that sits the machine out answers
   * with `null`, which the placement reads as "no hits this bar". This is the one
   * thing the machine column changes in the sound, and it is the same
   * `machineHitsInRange` the offline renderer calls, so live and export agree.
   */
  private syncLiveMachine(scene: number | null): void {
    if (scene === null) {
      this.engine.setMachineBars(machineBarsForSong(this.song));
      return;
    }
    this.engine.setMachineBars([this.song.scenes[scene]?.machine ?? null]);
  }

  /** Set how long a launch waits. Clamped to the model's range. */
  setLiveQuantize(bars: number): void {
    this.liveQuantize = clampLiveQuantize(bars);
  }

  /**
   * Queue a scene to take over at the next quantize boundary.
   *
   * Starts the transport if it is stopped, because a scene is a PERFORMANCE and a
   * performance needs a clock; returns false for a scene the song does not have.
   */
  launchScene(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.song.scenes.length) return false;
    const playing = this.engine.playing;
    const at = playing
      ? nextBoundary(this.engine.absoluteStep, this.liveQuantize, patternRows(this.song))
      : 0;
    this.liveCues = withCue(this.liveCues, { atStep: at, scene: index });
    if (!playing) this.startPlayback();
    return true;
  }

  /**
   * Queue STOP ALL: return to the song's own `order` at the next boundary, still
   * playing — the transport keeps its place, only the performance ends.
   */
  stopAllScenes(): void {
    if (!this.engine.playing) return;
    const at = nextBoundary(this.engine.absoluteStep, this.liveQuantize, patternRows(this.song));
    this.liveCues = withCue(this.liveCues, { atStep: at, scene: null });
  }

  // --- input ----------------------------------------------------------------

  /** Piano keys, octave, clear, undo and the three menus. Navigation is the controller's. */
  private handleKey(e: KeyboardEvent): void {
    // A text box owns the keyboard while it is up: every key belongs to the
    // paste box or the rename box, and Ctrl+Z there must undo TYPING, not the
    // song. The menu counts as one too — it must not open over a box you are
    // halfway through typing into.
    if (this.textEditing) return;

    // While the way out is being asked about, the question owns the keyboard.
    // Escape is the one key left to the input controller — it owns "no" there,
    // which keeps one press from being answered twice.
    if (this.kitExit?.isOpen) {
      if (e.code !== 'Escape' && this.kitExit.handleKey(e)) {
        e.preventDefault();
        this.kitExitAteKey = true;
      }
      return;
    }

    // The tab dropdown owns the keyboard while its list is down — Escape closes
    // it and every other key is held back rather than acting on the screen under
    // it, the same rule a menu follows.
    if (this.pageMenu?.isOpen && this.pageMenu.handleKey(e)) return;

    // F5 is the MIXER, and it is a SCREEN: the same key shows it and takes it
    // away, exactly as `F8` cycles the pattern's reading. It is read here, in
    // front of the menu table, because it is the one F-key that changes page
    // rather than opening a window over one.
    if (e.code === 'F5') {
      e.preventDefault();
      this.toggleMixerPage();
      return;
    }

    const menuKey = MENU_KEYS[e.code];
    if (menuKey) {
      e.preventDefault();
      this.toggleMenu(menuKey);
      return;
    }
    // F10 is the undo TIMELINE. It is not one of the eight entries in
    // `MENU_KEYS` because there is no page to remember being on — it is a list
    // rebuilt from the history stack on every open — so it opens and closes here
    // rather than through the menu bookkeeping.
    if (e.code === 'F10') {
      e.preventDefault();
      this.historyMenu.toggle();
      return;
    }
    // Undo and redo belong to the APP rather than to any menu, so they are read
    // before the menu gets the key. No menu claims a Ctrl chord, and every menu
    // owns every other key while it is up — so without this line, Ctrl+Z with
    // `F4` or `F7` open would be a dead key, and "one undo takes back the whole
    // visit" would be true only after closing the menu that made the change.
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) {
      e.preventDefault();
      if (e.code === 'KeyY' || e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    // While a menu is up it is the ONLY thing listening: ESC closes it, the
    // arrows move through it, and no key may act on the song underneath it.
    if (this.appearanceMenu.isOpen) {
      this.appearanceMenu.handleKey(e);
      return;
    }
    if (this.drumView.isOpen) {
      this.drumView.handleKey(e);
      return;
    }
    if (this.mixerView.isOpen) {
      this.mixerView.handleKey(e);
      return;
    }
    if (this.arrangerView.isOpen) {
      this.arrangerView.handleKey(e);
      return;
    }
    if (this.liveView.isOpen) {
      this.liveView.handleKey(e);
      return;
    }
    if (this.recorderView.isOpen) {
      this.recorderView.handleKey(e);
      return;
    }
    if (this.arpView.isOpen) {
      this.arpView.handleKey(e);
      return;
    }
    if (this.historyMenu.isOpen) {
      this.historyMenu.handleKey(e);
      return;
    }
    if (this.fileMenu.isOpen) {
      this.fileMenu.handleKey(e);
      return;
    }
    if (this.songMenu.isOpen) {
      this.songMenu.handleKey(e);
      return;
    }
    if (this.voiceMenu.isOpen) {
      this.voiceMenu.handleKey(e);
      return;
    }
    if (this.patchMenu.isOpen) {
      this.patchMenu.handleKey(e);
      return;
    }
    if (this.instrumentBrowser.isOpen) {
      this.instrumentBrowser.handleKey(e);
      return;
    }
    if (this.mcpPanel.isOpen) {
      // Read-only except for the two buttons, which a click reaches: the only key
      // it wants is the one that closes it.
      this.mcpPanel.handleKey(e);
      return;
    }
    if (this.helpOverlay.isOpen) {
      // The help screen is read-only, so it has almost nothing to route: the
      // scroll keys move its own copy (it is a page longer than its frame), ESC
      // closes it, and every other key is ignored rather than acted on
      // underneath it.
      this.helpOverlay.handleKey(e);
      if (e.code === 'Escape') {
        e.preventDefault();
        this.helpOverlay.hide();
      }
      return;
    }

    this.engine.resume();

    // Undo/redo first: Ctrl+Z must never also write a C, even though Z is a
    // piano key.
    if (e.ctrlKey || e.metaKey) {
      if (e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (e.code === 'KeyY') {
        e.preventDefault();
        this.redo();
        return;
      }
      return;
    }
    if (e.repeat) return;

    const semitone = PIANO_KEY_SEMITONES[e.code];
    if (semitone !== undefined) {
      e.preventDefault();
      const midi = baseMidiForOctave(this.octave) + semitone;
      if (this.chordDegrees > 0) this.enterChord(midi);
      else this.enterNote(midi);
      return;
    }
    // The drum view. It is not a menu — nothing opens over the grid — so it is
    // read here with the other keys that change what you are LOOKING at, rather
    // than with `MENU_KEYS`.
    if (e.code === 'F8') {
      e.preventDefault();
      this.cyclePatternView();
      return;
    }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      this.setOctave(this.octave - 1);
      return;
    }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') {
      e.preventDefault();
      this.setOctave(this.octave + 1);
      return;
    }
    // How hard the note under the cursor is hit. The same pair of keys nudges a
    // knob in the F4 menu, so `[`/`]` means "the amount here" everywhere in the
    // app — and neither key is a piano note, an octave or a cursor move.
    if (e.code === 'BracketLeft') {
      e.preventDefault();
      this.nudgeVelocity(-1);
      return;
    }
    if (e.code === 'BracketRight') {
      e.preventDefault();
      this.nudgeVelocity(1);
      return;
    }
    // How the note under the cursor is PLAYED. The key IS the character the
    // language writes: `>` (shift+period) slides into the note, `*` (shift+8)
    // hits it more than once inside its own step. Neither is a piano note — the
    // two rows of keys stop at 7 — and neither collides with a menu, so the
    // gesture and its spelling stay one thing to learn.
    if (e.code === 'Period') {
      e.preventDefault();
      this.toggleSlide();
      return;
    }
    if (e.code === 'Digit8' || e.code === 'NumpadMultiply') {
      e.preventDefault();
      this.cycleStutter();
      return;
    }
    if (e.code === 'Backspace' || e.code === 'Delete') {
      e.preventDefault();
      this.clearCellAt({ ...this.cursor });
    }
  }

  private handleEdge(edge: NavEdge): void {
    // A press the way-out prompt already answered must not also act on the song.
    if (this.kitExitAteKey) {
      this.kitExitAteKey = false;
      return;
    }
    switch (edge.action) {
      case 'cancel':
        // Escape means "close what is open" — and the prompt itself is a thing
        // that is open, so it answers first. Only when nothing at all is open,
        // and only when the kit is what opened this tab, does the same key
        // offer the way out; otherwise it stops the song, as it always has.
        if (this.kitExit?.isOpen) {
          this.kitExit.close();
          return;
        }
        if (this.kitExit && !this.anyOverlayOpen()) {
          this.kitExit.open();
          return;
        }
        this.stopPlayback();
        return;
      case 'confirm':
        this.togglePlay();
        return;
      case 'page':
        this.shiftPattern(edge.pageDir === 'prev' ? -1 : 1);
        return;
      case 'dir':
        if (edge.dir === 'up') this.moveSelection(-1, 0);
        else if (edge.dir === 'down') this.moveSelection(1, 0);
        else if (edge.dir === 'left') this.moveSelection(0, -1);
        else if (edge.dir === 'right') this.moveSelection(0, 1);
        return;
      default:
        return;
    }
  }

  /**
   * Whether anything of the app is open in front of the grid.
   *
   * The one thing the way-out prompt has to be sure of before it appears: an
   * Escape that closed a menu and an Escape that left the studio are different
   * sentences, and offering to leave while somebody is reading the F4 menu would
   * be answering a question nobody asked.
   */
  private anyOverlayOpen(): boolean {
    return this.textEditing
      || this.liveRenaming
      || this.recordRenaming
      || this.mcpPanel.isOpen
      || this.appearanceMenu.isOpen
      || this.fileMenu.isOpen
      || this.songMenu.isOpen
      || this.voiceMenu.isOpen
      || this.patchMenu.isOpen
      || this.instrumentBrowser.isOpen
      || this.historyMenu.isOpen
      || this.helpOverlay.isOpen;
  }

  private repaintChrome(): void {
    const c = activeColors();
    this.cameras.main.setBackgroundColor(cssOf(c.ink));
    this.headerWordmark.setColor(cssOf(activeTheme().colors.wordmark));
    this.inspectorTitle.setColor(cssOf(c.textDim));
    this.inspectorSub.setColor(cssOf(c.textDim));
    this.inspectorKeysTitle.setColor(cssOf(c.textDim));
    this.inspectorKeyHint.setColor(cssOf(activeTheme().colors.ooze));
    this.inspectorHelpHint.setColor(cssOf(activeTheme().colors.ooze));
    for (let i = 0; i < SHORTCUTS.length; i++) {
      this.inspectorKeys[i * 2]?.setColor(cssOf(activeTheme().colors.ooze));
      this.inspectorKeys[i * 2 + 1]?.setColor(cssOf(c.textPrimary));
    }
    this.drawInspectorDividers();
    this.updateInspector();
  }

  // --- frame ----------------------------------------------------------------

  override update(_time: number, dt: number): void {
    this.toast.update(dt / 1000);
    // The input meter is the one control that changes between frames, so it is
    // read on a throttle and pushed to its own layer — never a whole-page render.
    if (this.meterSession && this.recorderView?.isOpen) {
      this.meterClock += dt;
      if (this.meterClock >= 70) {
        this.meterClock = 0;
        this.recorderView.setLevel(this.meterSession.level());
      }
    }
    // Autosave, debounced: the session is written once the edits stop rather
    // than on every one of them (see `saveSessionNow`).
    if (this.sessionDirty && _time - this.sessionSavedAt >= SESSION_SAVE_DELAY_MS) {
      this.sessionSavedAt = _time;
      this.sessionDirty = false;
      this.saveSessionNow();
    }
    // A clock that has stopped sends nothing, so silence is noticed here rather
    // than waited for: the transport's MIDI word is the one thing with no event
    // to hang off (see `refreshMidiStatus`).
    this.refreshMidiStatus(_time);
    const edge = this.menuInput.update(dt);
    if (edge) this.handleEdge(edge);

    const step = this.engine.playStep;
    // A LIVE performance walks the scene's own bar rather than the order, so the
    // playhead is asked for the row of the scene and the notes are asked of the
    // same function the scheduler sounds. Read once here, like `step`.
    const abs = this.engine.absoluteStep;
    const live = activeScene(this.liveCues, abs);
    // The drum machine's page lights the column the beat is passing through,
    // whether or not the transport is the thing that moved the row. It asks
    // the same `machineStepAtRow` the scheduler places hits by, so the lit
    // column and the sounding step cannot disagree. Stopped means no column.
    const machine = this.song.machine;
    if (this.drumView.isOpen) {
      this.drumView.setPlayhead(
        step < 0 || !machine ? -1 : machineStepAtRow(machine, this.song.rowsPerBeat, step),
      );
      // AUTO-FOLLOW: while the transport runs, the grid shows the bar the song
      // bar it is on actually plays — the same `machineBarsForSong` the engine
      // schedules, so the grid can never show a bar the song is not sounding.
      // Read once per song BAR rather than per step, since that is how often it
      // can change. A hand that picked a bar stops the follow (see `followBar`).
      if (step < 0) {
        this.lastFollowSlot = -1;
      } else if (machine) {
        const slot = stepToSlot(this.song, step).slot;
        if (slot !== this.lastFollowSlot) {
          this.lastFollowSlot = slot;
          const bars = machineBarsForSong(this.song);
          if (bars.length > 0) this.drumView.followBar(bars[slot % bars.length] ?? 1);
        }
      }
    }
    // The ARRANGER's ruler follows the song's BAR — mapped by the same
    // `stepToSlot` the machine's follow uses, so the lit bar and the sounding bar
    // cannot disagree. Stopped means no bar, exactly as the machine shows none.
    if (this.arrangerView.isOpen) {
      this.arrangerView.setPlayhead(step < 0 ? -1 : stepToSlot(this.song, step).slot);
    }
    // The LIVE page follows the performance: the playing and queued rows, the loop
    // progress and the launch countdown, all read from the same clock the scheduler
    // sounds. Read once per step here, like `step`, so the picture cannot disagree.
    // The machine follows the performance: a scene's clip is a BAR, so while one
    // performs the machine plays that bar (or nothing). Only when the performing
    // scene CHANGES, so the scheduler is not re-pointed every frame.
    if (live !== this.machineScene) {
      this.machineScene = live;
      this.syncLiveMachine(live);
    }
    if (this.liveView.isOpen) {
      this.liveView.setLiveState({
        playing: live,
        queued: this.livePendingScene,
        progress: this.liveProgress,
        countdown: this.liveCountdown,
      });
    }
    if (step !== this.lastPlayStep) {
      this.lastPlayStep = step;
      if (step < 0) {
        this.setViewPlayhead(-1);
        this.keyboard.setSounding([]);
      } else if (live !== null) {
        // Performing a scene: one bar, looped. The cursor walks the scene's own
        // row and the editor stays where the performer left it — a performance is
        // not a place in the song, so it must not drag the pattern view around.
        const row = liveRowAt(abs, patternRows(this.song));
        this.setViewPlayhead(row);
        this.keyboard.setSounding(sceneStepNotes(this.song, live, abs));
      } else {
        // The view follows the song: a playhead in a bar you cannot see would be
        // a playhead that lies. `stopPlayback` puts the editor back afterwards.
        const { pattern, row } = stepToSlot(this.song, step);
        if (pattern !== this.patternIndex) {
          this.patternIndex = pattern;
          this.grid.setPattern(this.currentPattern);
          this.grid.setEmptyState(isPatternEmpty(this.currentPattern));
          this.transport.setPatternLabel(this.patternLabel());
          this.updateHeader();
          this.updateInspector();
        }
        this.setViewPlayhead(row);
        this.keyboard.setSounding(rowNotes(this.currentPattern, row));
      }
    }
  }
}

/** The readings of the pattern panel, cycled by `F8`. */
type PatternView = 'notes' | 'drums' | 'piano';

/** A panel heading with the scrolled row range appended when there is one. */
function withRange(base: string, range: string): string {
  return range === '' ? base : `${base}  \u00b7  ${range}`;
}

function cssOf(color: number): string {
  return '#' + (color >>> 0 & 0xffffff).toString(16).padStart(6, '0');
}

/**
 * The first note a channel plays anywhere in the song, or null.
 *
 * Used to AUDITION a channel at its own pitch: a bass player pressing "hear this"
 * and getting a middle C learns nothing about the bass. Searching the song rather
 * than asking the user to place the cursor is the deliberate part — the one
 * gesture the mix menu offers has to work from wherever the song happens to be.
 */
function firstNoteOn(patterns: readonly Pattern[], track: number): number | null {
  for (const pattern of patterns) {
    for (const row of pattern.steps) {
      const note = row[track]?.note;
      if (note !== null && note !== undefined) return note;
    }
  }
  return null;
}
