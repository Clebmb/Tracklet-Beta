/**
 * engine — Tracklet's sound, with no dependencies beyond the Web Audio API.
 *
 * Two jobs live here:
 *
 *  1. A tiny SYNTH. Each track is an oscillator through a per-track gain — its
 *     level, its mute and the solo, resolved in ONE place (`gainFor`) — into a
 *     shared low-pass, so a pattern with square waves in it still sounds like
 *     music rather than a broken modem. A track is MONOPHONIC: a new note
 *     releases the one still ringing on that channel, which is what makes a long
 *     note possible without piling voices on top of each other.
 *
 *  2. A look-ahead SEQUENCER, which is the only non-obvious code in the app.
 *     JavaScript timers are far too jittery to trigger notes directly, so the
 *     engine wakes up every 25ms, schedules any rows falling inside the next
 *     120ms onto the audio clock, and lets the audio hardware keep the time.
 *     That is why playback stays rock-steady even when the page is busy.
 *
 * The engine is deliberately Phaser-free and knows nothing about patterns: a
 * caller hands it a STEP COUNT and a `getStepNotes(step)` callback, and reads
 * back `playStep` to draw a playhead. Both halves are therefore easy to test and
 * to swap (a sampler or a MIDI-out port is a new engine, not a new UI).
 *
 * It counts STEPS, not rows. A step is one row of one pattern, so a one-pattern
 * song is sixteen steps and a four-bar song of four patterns is sixty-four — and
 * the caller is the one that knows which pattern a step belongs to. The
 * sequencer only has to loop a number, which is why song arrangement needed no
 * new timing code at all.
 *
 * A step's LENGTH is not always the same, either: swing makes every second step
 * shorter and the one before it longer, which is the whole of a lilting rhythm
 * and one multiply in the scheduler. See `stepTimeFactor`.
 *
 * ── Where the sound itself lives ─────────────────────────────────────────────
 * NOT here. Turning a note into nodes is `synth.ts`, because the same arithmetic
 * has to serve two clocks: this one, live, and `render.ts`, which runs an
 * offline context as fast as the CPU allows so a song can be written to a file.
 * The master ROOM — reverb, a tempo-locked echo and a limiter — is `room.ts`, for
 * the same reason.
 *
 * This file is therefore about TIME and WIRING: which step is due, which channel
 * is heard, and where a channel sits between the speakers. A channel's PLACE
 * (`pan`, see `model/song.ts`) is applied here as two gains and a merger rather
 * than as an equal-power panner, so that a centred channel is a gain of exactly 1
 * on both sides — the same signal the app made when every channel was centred,
 * which is what lets pan be added to a language with a hundred songs in it.
 */

import { channelGain } from '../model/mix';
import {
  clampRobin,
  clampTouch,
  DEFAULT_ROBIN,
  DEFAULT_TOUCH,
  hitShift,
  NO_TONE_SHIFT,
  type ToneShift,
} from '../model/variation';
import { DEFAULT_DRIFT, clampDrift } from '../model/drift';
import { DEFAULT_SPEED, clampSpeed } from '../model/speed';
import {
  clampBpm,
  clampEffect,
  clampEffects,
  clampDuck,
  clampGlide,
  clampLevel,
  clampPan,
  clampPoly,
  clampSend,
  clampStrum,
  clampVelocity,
  clampVibrato,
  DEFAULT_GROOVE,
  DEFAULT_HUMANIZE,
  DEFAULT_LEVEL,
  DEFAULT_POLY,
  DEFAULT_ROWS,
  DEFAULT_TRACK_ECHO,
  DEFAULT_VELOCITY,
  DEFAULT_VERB,
  gateFactor,
  MAX_LEVEL,
  MIN_DUCK,
  NO_EFFECTS,
  secondsPerRow,
  stepTimeFactor,
  strumOffsets,
  trackFeel,
  TRACK_EFFECTS,
  voiceToSteal,
  type ChannelEffects,
  type GrooveId,
  type TrackEffectId,
} from '../model/song';
import {
  copyPatch,
  firstLayer,
  patchForTrack,
  patchFromVoice,
  patchWithVoice,
  voiceOfPlainLayer,
  type Patch,
  type StackedSound,
} from '../model/instrument';
import { automatedDrift, automatedGate, automatedLevel, automatedVoice, type AutomationLane } from '../model/automation';
import { busLevelFor, type Bus } from '../model/bus';
import { articulationHits, type Articulation } from '../model/articulation';
import { drumPitch, type DrumId } from '../model/drum';
import { DEFAULT_KIT, kitVoice, type KitName, type UserKit } from '../model/kit';
import { DEFAULT_TUNING, tuningFor, type Tuning } from '../model/tuning';
import { DEFAULT_VOICE, type VoiceParams } from '../model/voice';
import { buildChannelChain, buildMasterChain, type ChannelChain, type MasterChain } from './chain';
import { machineDucks, machineGain, machineHitsInRange, machineStepSeconds, padStripOptions } from './machine';
import type { DrumMachine, DrumPad } from '../model/machine';
import { buildNote, makeNoiseBuffer, noteLength, ownedSampleBuffer, releaseNote, type NoteGraph, type StepNotesFn } from './synth';
import type { SoundFont } from '../model/soundfont';
import { sampleByName, type Sample, type SampleWindow } from '../model/sample';
import { takeSampleWindow, type Take } from '../model/take';
import { buildRoom, type Room } from './room';

/** A note the sequencer should sound: which track, and which MIDI pitch. */
export type { ScheduledNote, StepNotesFn } from './synth';

export interface AudioEngineOptions {
  trackCount?: number;
  bpm?: number;
  rowsPerBeat?: number;
  /** Master level, 0..1. Defaults to a gentle 0.7. */
  volume?: number;
  /**
   * A context to play through, when the caller already has one.
   *
   * The kit's launcher does: its interface sounds and its song share a single
   * context, for the reasons `doodadarium/src/audio.ts` writes down — one clock,
   * one device, and one place where the rule about user gestures lives. An
   * engine handed a context never closes it, because it does not own it; see
   * `dispose`. Left out, the engine makes its own exactly as before.
   */
  context?: AudioContext;
}

/**
 * How long an audition rings, in seconds.
 *
 * Long enough to hear a stutter of eight hits as eight hits rather than as a
 * click, short enough that typing an arpeggio does not smear into a chord.
 */
const PREVIEW_LENGTH = 0.32;
/**
 * How far below its pitch an auditioned slide starts, in semitones.
 *
 * An audition has no previous note to slide from, and a whole tone is the
 * smallest interval that reads as an ARRIVAL rather than as a detuned note.
 */
const PREVIEW_SLIDE_FROM = 2;

/** Seconds of scheduling look-ahead — comfortably more than one slow frame. */
const LOOKAHEAD_S = 0.12;
/** How often the scheduler checks the clock. */
const TICK_MS = 25;
type AudioContextCtor = new () => AudioContext;

/** The eight effect ids, in the order the menus list them: what a channel carries. */
const EFFECT_IDS: readonly TrackEffectId[] = TRACK_EFFECTS.map((effect) => effect.id);

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: BiquadFilterNode | null = null;
  /**
   * Each channel's place in the graph, as the shared chain object.
   *
   * Built by `audio/chain.ts` rather than by hand here, because the offline
   * renderer builds its channels with the same function: a level, a pan and two
   * sends wired twice would be two chances to disagree about what a send means.
   */
  private chains: ChannelChain[] = [];
  private mutes: boolean[] = [];
  /**
   * The lanes that MOVE a value over bars, and the bar length they read.
   *
   * Handed over whole from the scene, exactly like the tempo map, and empty in a
   * song that moves nothing — which is what makes every read below a length check
   * rather than a branch in the audio path.
   */
  private automation: AutomationLane[] = [];
  /** How many steps one bar of the arrangement holds. See `setAutomation`. */
  private rowsPerBar = DEFAULT_ROWS;
  /**
   * Which DRUM KIT the song's hits play. See `setKit`.
   *
   * Handed over whole from the scene, exactly like the groove and the tempo map.
   * It is one word rather than a table of patches because the table lives in the
   * model — the audio path asks `kitVoice` for the sound of a hit, so a kit
   * cannot sound different live than in an export.
   */
  private kit: KitName = DEFAULT_KIT;
  /**
   * The kits of your own, so a song naming one the app's four do not cover plays
   * it. A copy of the library, handed in by `setKit`, because the engine schedules
   * hundreds of times a second and must not reach into `localStorage`.
   */
  private kits: readonly UserKit[] = [];
  /**
   * Each track's level, in the SONG's own unit (0..100), not in gain units.
   *
   * The engine keeps the app's number and divides only where it has to, so the
   * one thing that decides audibility (`channelGain`, in the model) can be asked
   * the question in the same units the user set — there is no place for a factor
   * of a hundred to go missing.
   */
  private levels: number[] = [];
  /**
   * Each track's BUS fader, resolved once from the song's groups, in channel order.
   *
   * A copy rather than the song's list of names, because the audio path asks this
   * per note and a name lookup has no place there — and because the resolved
   * number is the same one the renderer and the mix screen use, since all three
   * come through `busLevelFor`. A song with no buses has an empty array, and every
   * read below falls back to `DEFAULT_LEVEL`: the identity.
   */
  private busLevels: number[] = [];
  /**
   * The song's groups themselves, kept so the MACHINE's group can be resolved.
   *
   * `busLevels` answers per CHANNEL, which is every track; the machine is one
   * more part of the mix with a group of its own, so a name lookup needs the list
   * and not just the answers. Absent or empty resolves to full, the identity.
   */
  private buses: readonly Bus[] = [];
  /**
   * The song's DRUM MACHINE, if it has one, and its place in the graph.
   *
   * One more channel rather than a second kind of thing: its chain is built by
   * the same `buildChannelChain` every track uses, so its level, pan, sends, duck
   * and effects are the machinery that already existed. Null on a song with no
   * machine, which is what keeps every song before this sounding as it did.
   */
  private machine: DrumMachine | null = null;
  private machineChain: ChannelChain | null = null;
  /**
   * One strip per PAD, index-aligned with the machine's pads: a fader and a place
   * between the speakers, feeding the machine's chain. This is what makes the
   * machine a two-level instrument — pads into the machine, the machine into the
   * mix — and what puts a pad's own `level` and `pan` in the audio path.
   */
  private padChains: (ChannelChain | null)[] = [];
  /**
   * The machine BAR each song bar plays, once sections name one.
   *
   * Resolved in `setMachineBars` from the song's form (`machineBarsForSong`), and
   * handed to the placement so the beat follows the sections. Empty for a song
   * with no sections that name a bar, in which case the machine's own `order`
   * answers and nothing about how a beat plays changes.
   */
  private machineBars: (number | null)[] = [];
  /**
   * Solo, as a listening mode rather than a property of the song.
   *
   * The engine does not care WHY a channel is being heard — it only needs to
   * answer "which channels are audible right now", and this is the second half
   * of the answer. See `audible`.
   */
  private solos: boolean[] = [];
  /**
   * Where each track sits between the speakers, -100..100 (see `pan`).
   *
   * The song's own unit, like `levels`: the engine keeps the percentage and does
   * the arithmetic into two gains at the only place that needs it.
   */
  private pans: number[] = [];
  /** How much of each track is fed to the master reverb, 0..100 (see `verb`). */
  private verbs: number[] = [];
  /** How much of each track is fed to the master echo, 0..100 (see `echo`). */
  private echoes: number[] = [];
  /**
   * Each track's effects, each 0..100 (see `TRACK_EFFECTS`).
   *
   * Kept as one object per channel rather than six parallel arrays, because the
   * CHAIN is built from the set of them: which effects are ON decides what the
   * graph looks like (an effect at 0 is no node at all), so "the whole channel's
   * effects" is the thing that has to be settable in one go for an undo, a
   * script apply or an OPEN to re-point the engine exactly the way the level and
   * the pan do.
   */
  private effects: ChannelEffects[] = [];
  /**
   * How far each channel pushes the rest of the mix down while it plays, 0..100.
   *
   * The song's own numbers, kept here for the same reason the levels are: the
   * scheduler reads them at the moment a note is queued, so a knob turned while
   * the song runs takes effect on the next hit rather than reaching backwards.
   */
  private ducks: number[] = [];
  /**
   * How much each track slides from one note into the next, 0..100.
   *
   * Kept here rather than read off the song when a note plays, for the same
   * reason a level is: a note queued a moment ago must be played the way it was
   * queued, so turning the knob never reaches backwards into the pipeline.
   */
  private glides: number[] = [];
  /** How much each track's pitch wobbles, 0..100. See `vibrato` in `song.ts`. */
  private vibratos: number[] = [];
  /** How far each track rolls its chords, in steps, 0..4. See `strum` in `song.ts`. */
  private strums: number[] = [];
  /** How much each track's hits differ from each other, 0..100. See `robin`. */
  private robins: number[] = [];
  /** How much each track's tone follows velocity, 0..100. See `touch`. */
  private touches: number[] = [];
  /** How far each track's pitch wanders, 0..100. See `drift`. */
  private drifts: number[] = [];
  /**
   * How many NOTES each track has played since the transport last started, which
   * is what a round-robin cycles through.
   *
   * Counted per NOTE rather than per hit, so a stutter's four hits share one
   * variant — a roll is one gesture played quickly, not four separate strikes.
   * Reset when the transport stops, so a song always begins with variant 0 (the
   * note as written) and the app, an export and the file agree from bar one.
   */
  private hitCounts: number[] = [];
  /**
   * The pitch each track last played, so the NEXT note on it knows what to slide
   * from. Null until a channel has played anything, which is the honest answer:
   * the first note of a song has nothing behind it to glide out of.
   */
  private lastMidi: (number | null)[] = [];
  /**
   * What each track SOUNDS like: a waveform and seven knobs (see `voice.ts`).
   *
   * The engine keeps its own copy rather than reading the song, for the same
   * reason it keeps its own note lengths: a note queued a moment ago must sound
   * the way it was queued, so turning a knob never reaches backwards into notes
   * that are already in the audio pipeline.
   */
  private patches: Patch[] = [];
  /** A half-second of white noise, made once; every hissy note plays it looping. */
  private noiseBuffer: AudioBuffer | null = null;
  /**
   * How many steps each track's notes ring for; falls back to one.
   *
   * The engine keeps its own copy rather than reading the song, for the same
   * reason it keeps its own waves: a note queued a moment ago must finish the
   * way it was queued, so editing a channel's length never reaches backwards
   * into notes that are already in the audio pipeline.
   */
  private holds: number[] = [];
  /** The voice still sounding on each track, so a new note can release it. */
  /**
   * The notes each channel is holding, oldest first.
   *
   * A LIST rather than one voice, because a channel may be polyphonic: with
   * `poly 1` there is never more than one entry, so the monophonic path walks the
   * same structure it always did. Each entry carries the two things the stealing
   * rule needs — when it began and how hard it was played.
   */
  private trackVoices = new Map<number, { graph: NoteGraph; startedAt: number; velocity: number }[]>();
  private voices = new Set<NoteGraph>();
  /** The master reverb / echo / limiter. Built with the context, neutral at rest. */
  private room: Room | null = null;
  /**
   * The effects on the WHOLE MIX, each 0..100. See `Song.master`.
   *
   * Kept as the song keeps it, and rebuilt rather than adjusted when the set of
   * effects that are ON changes — the same bargain a channel makes, for the same
   * reason: an off effect is not a quiet node, it is no node.
   */
  private masterEffects: ChannelEffects = { ...NO_EFFECTS };
  /**
   * The whole mix's effects stage, or null when nothing is on.
   *
   * Null is not "not built yet": it is the state a song with a clean master is
   * in, and the bus is wired straight to the room in that state, which is the
   * graph this app had before a master could be shaped.
   */
  private mixChain: MasterChain | null = null;

  private bpm: number;
  private rowsPerBeat: number;
  /**
   * The master tape speed, in percent. See `model/speed.ts`.
   *
   * Read on every scheduled step, like `swing`: the row clock divides by the
   * factor and the synth multiplies the pitch by it, so the two halves of the
   * gesture stay locked to one number.
   */
  private speed = DEFAULT_SPEED;
  /**
   * How much every second step is pushed later, 0..100. See `stepTimeFactor`.
   *
   * Read fresh on every step rather than baked into a schedule, so dragging the
   * control while the song plays takes effect on the next step — which is the
   * only way a feel control is any use. A note already queued keeps the timing it
   * was queued with, for the same reason a queued note keeps its sound.
   */
  private swing = 0;
  /**
   * The song's feel, read fresh on every step like the swing above it.
   *
   * It is the closest thing here to a performance: the scheduler asks the model
   * where each step's notes sit and how hard they play, and the model answers in
   * one function. Nothing about it is baked into a schedule, so reaching for the
   * groove button mid-playback is audibly a change of feel rather than a change
   * of song.
   */
  private groove: GrooveId = DEFAULT_GROOVE;
  /**
   * Each channel's OWN feel and looseness, or nothing to say about either.
   *
   * Read per NOTE rather than per step, because a feel belongs to the part: a
   * straight song can carry a shuffled hat, and the two must be scheduled from
   * the same step without one answering for the other. Empty means every channel
   * follows the song, which is every song written before a part could have one.
   */
  private trackGrooves: (GrooveId | null)[] = [];
  private humanizes: number[] = [];
  /**
   * How many notes each channel may hold at once, from the song's `poly`.
   *
   * `1` for every channel of every song that never says otherwise, which is the
   * monophonic behaviour this engine has always had.
   */
  private polys: number[] = [];
  /**
   * The song's TEMPERAMENT and the tonic it is read against, kept here the way
   * the swing and the groove are: a queued note keeps the tuning it was queued
   * with, and a change mid-playback takes effect on the next step.
   *
   * Defaults to equal temperament, which is the frequency every note had before
   * tunings existed, so the default path is the one an old song walks.
   */
  private tuning: Tuning = tuningFor(DEFAULT_TUNING);
  private tonic = 0;
  /**
   * The soundfont loaded for `wave font`, or null when none is.
   *
   * The one sound here that is not part of the song. A font lives in the app
   * rather than in a file, so it is handed to the engine the way the volume is:
   * a channel that says `wave font` plays whatever font is open, and every other
   * channel is untouched by it.
   */
  private font: SoundFont | null = null;
  /**
   * The recording each channel plays, or null for its built-in sound.
   *
   * Resolved once, in `setSamples`, from the app's bank and the song's names —
   * see that method for why the pair is handed over together and why a name the
   * bank does not have resolves to null rather than to a refusal.
   */
  private samples: (Sample | null)[] = [];
  /**
   * The window each recording plays through, by name in any case — the takes.
   *
   * Resolved from `setTakes` rather than computed per note, because a chord asks
   * the same question several times in one instant and the answer is one lookup.
   */
  private takeWindows = new Map<string, SampleWindow>();
  /**
   * The recording each machine PAD plays, or null for its built-in sound.
   *
   * The same resolution the channels get, one scope down: a pad names a recording
   * and the app supplies what it has under that name, so a pad on a recording the
   * bank lacks plays the built-in one-shot its `voice` selects. Index-aligned with
   * `machine.pads`, like `padChains`.
   */
  private padSamples: (Sample | null)[] = [];
  /** One tempo per step of the order; empty when the song has one tempo. */
  private tempos: number[] = [];
  /** The tempo the echo is currently locked to, so it is re-synced only on a change. */
  private echoBpm = 0;
  private volume: number;

  /** A context the caller owns, if one was handed over. Never closed here. */
  private readonly borrowed: AudioContext | null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private steps = 0;
  private nextStep = 0;
  private nextStepTime = 0;
  private step = -1;
  /**
   * How many steps have been SCHEDULED since `start`, never wrapping.
   *
   * The step counter that loops the song is the one the grid counts with, so it
   * turns over every bar — but a LIVE launch has to be remembered for a bar line
   * that may be several loops away, and `step 64` cannot mean "the 64th step" and
   * "every 64th step" at once. This is the other reading: it only ever runs
   * forward, so a cue keyed to it happens exactly once.
   */
  private absStep = 0;
  /** The absolute step currently SOUNDING, for a playhead that asks in absolute terms. */
  private soundAbsStep = -1;
  private pending: { step: number; abs: number; time: number }[] = [];
  private getStepNotes: StepNotesFn = () => [];

  constructor(options: AudioEngineOptions = {}) {
    this.borrowed = options.context ?? null;
    this.bpm = options.bpm ?? 120;
    this.rowsPerBeat = options.rowsPerBeat ?? 4;
    this.volume = options.volume ?? 0.7;
    const count = options.trackCount ?? 4;
    for (let i = 0; i < count; i++) this.mutes.push(false);
  }

  // --- read-only state the UI watches ---------------------------------------

  /** True while the sequencer is running. */
  get playing(): boolean { return this.running; }

  /** The step currently SOUNDING, or -1 when stopped. Feeds the playhead. */
  get playStep(): number { return this.running ? this.step : -1; }

  /**
   * The absolute step currently sounding (never wraps), or -1 when stopped.
   *
   * `playStep` answers "which row of the song", which is what the grid draws; this
   * answers "which step of the performance", which is what a queued launch is
   * keyed to. Both are true of the same instant, and neither is derived from the
   * other, so a screen can light the right row while the cue list counts forward.
   */
  get absoluteStep(): number { return this.running ? this.soundAbsStep : -1; }

  /** True once an AudioContext exists (i.e. after the first user gesture). */
  get ready(): boolean { return this.ctx !== null; }

  // --- controls -------------------------------------------------------------

  /**
   * Create/resume the audio context. Browsers only allow this from a user
   * gesture, so the app calls it on the first key or click; every later call
   * is a cheap no-op.
   */
  resume(): void {
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(20, bpm);
    // The echo is locked to the beat, so a tempo change re-syncs it. Keeping the
    // delay in SECONDS while the song moves would be one drift nobody could see.
    // With a tempo map this is the fallback tempo rather than the whole story —
    // the map's own answer for each step is applied by the scheduler.
    this.echoBpm = 0;
    this.room?.setTempo(this.bpm);
  }

  setRowsPerBeat(rows: number): void {
    this.rowsPerBeat = Math.max(1, rows);
  }

  /** The master tape speed, in percent (100 is normal). Takes effect next step. */
  setSpeed(speed: number): void {
    this.speed = clampSpeed(speed);
  }

  /** How much the song swings, 0..100. Takes effect on the next scheduled step. */
  setSwing(swing: number): void {
    this.swing = Math.max(0, swing);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.masterLevel(), this.ctx.currentTime, 0.02);
    }
  }

  setTrackCount(count: number): void {
    while (this.mutes.length < count) this.mutes.push(false);
    if (this.mutes.length > count) this.mutes.length = count;
    while (this.levels.length < count) this.levels.push(1);
    if (this.levels.length > count) this.levels.length = count;
    while (this.pans.length < count) this.pans.push(0);
    if (this.pans.length > count) this.pans.length = count;
    while (this.verbs.length < count) this.verbs.push(DEFAULT_VERB);
    if (this.verbs.length > count) this.verbs.length = count;
    while (this.echoes.length < count) this.echoes.push(DEFAULT_TRACK_ECHO);
    if (this.echoes.length > count) this.echoes.length = count;
    while (this.glides.length < count) this.glides.push(0);
    if (this.glides.length > count) this.glides.length = count;
    while (this.vibratos.length < count) this.vibratos.push(0);
    if (this.vibratos.length > count) this.vibratos.length = count;
    while (this.strums.length < count) this.strums.push(0);
    if (this.strums.length > count) this.strums.length = count;
    while (this.robins.length < count) this.robins.push(DEFAULT_ROBIN);
    if (this.robins.length > count) this.robins.length = count;
    while (this.touches.length < count) this.touches.push(DEFAULT_TOUCH);
    if (this.touches.length > count) this.touches.length = count;
    while (this.drifts.length < count) this.drifts.push(DEFAULT_DRIFT);
    if (this.drifts.length > count) this.drifts.length = count;
    while (this.hitCounts.length < count) this.hitCounts.push(0);
    if (this.hitCounts.length > count) this.hitCounts.length = count;
    while (this.effects.length < count) this.effects.push({ ...NO_EFFECTS });
    if (this.effects.length > count) this.effects.length = count;
    if (this.lastMidi.length > count) this.lastMidi.length = count;
    if (this.solos.length > count) this.solos.length = count;
    if (this.ctx) this.buildTrackChains(count);
  }

  setMuted(index: number, muted: boolean): void {
    this.mutes[index] = muted;
    this.applyTrackGain(index);
  }

  /**
   * Give the engine the song's automation lanes, and the bar length they read.
   *
   * One call with the whole list, because a lane is not a property of a channel —
   * it is a property of the arrangement, and the same list answers every channel's
   * question. `stepsPerBar` is a pattern's length: a bar in an arrangement IS one
   * pattern, which is the same arithmetic `tempoMapBpm` does.
   */
  setAutomation(lanes: readonly AutomationLane[], stepsPerBar: number): void {
    this.automation = lanes.map((lane) => ({ ...lane }));
    this.rowsPerBar = Math.max(1, Math.round(stepsPerBar));
  }

  /** Give every track its level, 0..100 — the same percentage the song stores. */
  setLevels(levels: readonly number[]): void {
    this.levels = levels.map(clampLevel);
    this.applyAllGains();
  }

  /** Give every track its place between the speakers, -100..100. */
  setPans(pans: readonly number[]): void {
    this.pans = pans.map(clampPan);
    this.applyAllPans();
  }

  /** Change one track's pan, -100..100. */
  setPan(index: number, pan: number): void {
    this.pans[index] = clampPan(pan);
    this.applyPan(index);
  }

  /** Give every track its reverb send, 0..100 — the same percentage the song stores. */
  setVerbs(verbs: readonly number[]): void {
    this.verbs = verbs.map(clampSend);
    this.applyAllSends();
  }

  /** Change one track's reverb send, 0..100. */
  setVerb(index: number, amount: number): void {
    this.verbs[index] = clampSend(amount);
    this.chains[index]?.setVerb(this.verbs[index], this.now());
  }

  /** Give every track its echo send, 0..100. */
  setEchoes(echoes: readonly number[]): void {
    this.echoes = echoes.map(clampSend);
    this.applyAllSends();
  }

  /** Change one track's echo send, 0..100. */
  setTrackEcho(index: number, amount: number): void {
    this.echoes[index] = clampSend(amount);
    this.chains[index]?.setEcho(this.echoes[index], this.now());
  }

  /**
   * Give every track its effects — the same percentage the song stores.
   *
   * An effect crossing zero changes what the channel's GRAPH is, not just a
   * value inside it, so this rebuids the chains when the set of effects that are
   * on has changed and otherwise turns the knobs live. That is the whole reason
   * this takes the channel's effects in one piece: an undo has to be able to
   * turn a whole channel's effects back the way they were in one call.
   */
  setEffects(effects: readonly ChannelEffects[]): void {
    this.effects = effects.map((fx) => clampEffects(fx));
    if (!this.chainsMatchEffects()) this.buildTrackChains(this.chains.length);
    else this.applyAllEffects();
  }

  /** Change one track's effect, 0..100. */
  setEffect(index: number, id: TrackEffectId, amount: number): void {
    const current = this.effects[index] ?? NO_EFFECTS;
    const next = clampEffect(amount);
    if (current[id] === next) return;
    this.effects[index] = { ...current, [id]: next };
    const chain = this.chains[index];
    // Turning an effect ON or OFF is the one change a built chain cannot make —
    // the stage is either spliced into the graph or it is not — so a change that
    // crosses zero rebuilds the channels, and everything else is a knob.
    if (!chain || (next > 0) !== chain.effects.includes(id)) {
      this.buildTrackChains(this.chains.length);
      return;
    }
    chain.setEffect(id, next, this.now());
  }

  /** True when every channel's graph already carries exactly the effects it should. */
  private chainsMatchEffects(): boolean {
    return this.chains.every((chain, i) => {
      const wanted = EFFECT_IDS.filter((id) => (this.effects[i]?.[id] ?? 0) > 0);
      return wanted.length === chain.effects.length && wanted.every((id) => chain.effects.includes(id));
    });
  }

  /** Turn every channel's effects to where they should be now. */
  private applyAllEffects(): void {
    const at = this.now();
    for (let i = 0; i < this.chains.length; i++) {
      const chain = this.chains[i];
      const fx = this.effects[i] ?? NO_EFFECTS;
      for (const id of chain.effects) chain.setEffect(id, fx[id], at);
    }
  }

  /** Set the song's feel. A name, not a number — see `grooveFeel`. */
  setGroove(id: GrooveId): void {
    this.groove = id;
  }

  /**
   * Set the song's drum kit. A name, not a table — see `kitVoice` — and the kits
   * of your own to resolve that name against when it is not one of the four
   * built-ins. `kits` is optional so that everything written before a kit could be
   * your own keeps working: a name nothing knows plays the presets.
   */
  setKit(id: KitName, kits: readonly UserKit[] = []): void {
    this.kit = id;
    this.kits = kits.slice();
  }

  /**
   * Set each channel's own feel and looseness.
   *
   * Two parallel lists rather than a list of objects, because that is how every
   * other per-channel setting travels in here (holds, levels, pans) and the
   * scheduler reads them by index. A channel may say nothing about either: `null`
   * follows the song's groove, and a humanize of 0 adds exactly nothing, so the
   * default path is the arithmetic an old song always walked.
   */
  setFeels(grooves: readonly (GrooveId | null)[], humanizes: readonly number[]): void {
    this.trackGrooves = grooves.slice();
    this.humanizes = humanizes.slice();
  }

  /**
   * How many notes each channel may hold at once. See `poly` in `song.ts`.
   *
   * Read when a note is SCHEDULED rather than when it is built, so a note already
   * in the pipeline is not retroactively cut — the same rule the level and the
   * hold follow.
   */
  setPolys(counts: readonly number[]): void {
    this.polys = counts.slice();
  }

  /**
   * Set the song's temperament and the tonic it is read against.
   *
   * The tonic comes from the song's key, so `tuning just` is pure in whichever
   * key the song is written in. Takes effect on the next scheduled note, like
   * every other song-wide control here.
   */
  setTuning(tuning: Tuning, tonic: number): void {
    this.tuning = tuning;
    this.tonic = tonic;
  }

  /**
   * Set (or clear) the soundfont that `wave font` plays.
   *
   * Takes effect on the next note, like every other control here, so loading a
   * font mid-playback does not cut the note already ringing — which means an
   * A/B is heard as the next note rather than as a silence.
   */
  setFont(font: SoundFont | null): void {
    this.font = font;
  }

  /**
   * Which recording of YOURS each channel plays, resolved from the app's bank.
   *
   * The counterpart of `setFont`, and the same division of labour: the bank
   * belongs to the app and the names belong to the song, so the scene hands over
   * the pair in one call and the engine keeps what each channel is to play. A
   * name with no file behind it becomes `null` HERE — once, rather than once per
   * note — and `null` is the fallback rather than a failure: the channel plays the
   * built-in one-shot its `duty` selects, exactly as if the line were absent.
   *
   * Templates rather than the sample objects, because a step is queued ahead of
   * the sound: reloading a file under the same name must not reach backwards into
   * notes that are already in the audio pipeline. The `Sample` objects themselves
   * are immutable once loaded, so the references stay valid.
   */
  setSamples(
    bank: readonly Sample[],
    names: readonly (string | null)[],
    padNames: readonly (string | null)[] = [],
  ): void {
    this.samples = names.map((name) => sampleByName(bank, name));
    this.padSamples = padNames.map((name) => sampleByName(bank, name));
  }

  /** The recordings currently playing, one slot per channel, for a test. */
  get sampleBank(): readonly (Sample | null)[] {
    return this.samples;
  }

  /** The recordings each machine pad plays, one slot per pad, for a test. */
  get machineSampleBank(): readonly (Sample | null)[] {
    return this.padSamples;
  }

  /**
   * Hand the engine the takes that shape the bank — APP state, like the bank.
   *
   * A take is the recording DESCRIBED well enough to play: its trim window and
   * its loop. The engine keeps only the resolved windows, keyed by the recording's
   * name in any case (the bank's own rule), so a note can ask "how does this
   * recording play?" without the audio layer ever knowing what a take is. A trim
   * or a loop the page changes is pushed here and is audible on the next note.
   */
  setTakes(takes: readonly Take[]): void {
    this.takeWindows = new Map();
    for (const take of takes) {
      this.takeWindows.set(take.name.trim().toLowerCase(), takeSampleWindow(take));
    }
  }

  /** The window a recording plays through, or null to play the whole file. */
  private sampleWindowFor(sample: Sample | null): SampleWindow | null {
    if (!sample) return null;
    return this.takeWindows.get(sample.name.trim().toLowerCase()) ?? null;
  }

  /** The font currently loaded, for a status line or a test. */
  get soundFont(): SoundFont | null {
    return this.font;
  }

  /**
   * The tempo of every step of the arrangement, from `songTempos`.
   *
   * An array rather than the map itself, for the reason the engine takes arrays
   * of levels and pans: the model owns the arithmetic, and what a sequencer wants
   * is the answer per step rather than the question per bar. An empty array — or
   * a missing index — falls back to `bpm`, which is what a song without a tempo
   * map has always done.
   */
  setTempos(tempos: readonly number[]): void {
    this.tempos = tempos.map(clampBpm);
    // A new map is a new answer for the echo, so let the next step re-sync it
    // rather than trusting the tempo the last song happened to leave it at.
    this.echoBpm = 0;
  }

  /** The tempo at a step of the order: the map's answer, or the song's own. */
  private bpmAt(step: number): number {
    return this.tempos[step] ?? this.bpm;
  }

  /** Give every track its glide amount, 0..100. */
  setGlides(glides: readonly number[]): void {
    this.glides = glides.map(clampGlide);
  }

  /** Change one track's glide amount, 0..100. */
  setGlide(index: number, amount: number): void {
    this.glides[index] = clampGlide(amount);
  }

  /** Give every track its vibrato amount, 0..100. */
  setVibratos(vibratos: readonly number[]): void {
    this.vibratos = vibratos.map(clampVibrato);
  }

  /** Change one track's vibrato amount, 0..100. */
  setVibrato(index: number, amount: number): void {
    this.vibratos[index] = clampVibrato(amount);
  }

  /** Give every track its chord-strum span, in steps 0..4. */
  setStrums(strums: readonly number[]): void {
    this.strums = strums.map(clampStrum);
  }

  /** Change one track's chord-strum span, in steps 0..4. */
  setStrum(index: number, amount: number): void {
    this.strums[index] = clampStrum(amount);
  }

  /** Give every track its round-robin amount, 0..100. */
  setRobins(robins: readonly number[]): void {
    this.robins = robins.map(clampRobin);
  }

  /** Change one track's round-robin amount, 0..100. */
  setRobin(index: number, amount: number): void {
    this.robins[index] = clampRobin(amount);
  }

  /** Give every track its velocity-layer amount, 0..100. */
  setTouches(touches: readonly number[]): void {
    this.touches = touches.map(clampTouch);
  }

  /** Change one track's velocity-layer amount, 0..100. */
  setTouch(index: number, amount: number): void {
    this.touches[index] = clampTouch(amount);
  }

  /** Give every track its drift amount, 0..100. */
  setDrifts(drifts: readonly number[]): void {
    this.drifts = drifts.map(clampDrift);
  }

  /** Change one track's drift amount, 0..100. */
  setDrift(index: number, amount: number): void {
    this.drifts[index] = clampDrift(amount);
  }

  /**
   * The master reverb and echo, both 0..100. A property of the song, not of the
   * listener, so the engine treats them like levels: it is handed the number.
   */
  setReverb(amount: number): void {
    this.room?.setReverb(amount);
  }

  setEcho(amount: number): void {
    this.room?.setEcho(amount);
  }

  /**
   * Give every channel its duck amount.
   *
   * The amounts themselves need no graph work — they are read when a hit is
   * queued — but WHETHER anybody ducks at all decides whether the channels get a
   * gain for the dip to happen in, so that transition rebuilds the chains and
   * nothing else does.
   */
  setDucks(amounts: readonly number[]): void {
    const before = this.anyDucking();
    this.ducks = amounts.map((amount) => clampDuck(amount));
    if (this.anyDucking() !== before) {
      this.buildTrackChains(this.chains.length);
      this.buildMachineChain();
    }
  }

  /** True when anything ducks — a channel or the machine — i.e. when the dip nodes exist. */
  private anyDucking(): boolean {
    return this.ducks.some((amount) => amount > MIN_DUCK) || machineDucks(this.machine);
  }

  /**
   * Push every OTHER channel down, because `source` just played.
   *
   * Called once per note, at the moment the note is queued — which is what makes
   * this a sidechain rather than a guess: the dip is written onto the audio clock
   * at the hit's own time, to the sample, in both the live engine and an export.
   */
  private duckOthers(source: number, when: number, lengthSeconds: number): void {
    const amount = this.ducks[source] ?? MIN_DUCK;
    if (amount <= MIN_DUCK) return;
    this.chains.forEach((chain, index) => {
      if (index === source) return;
      chain.scheduleDuck(amount, when, lengthSeconds);
    });
    // The machine is one more part of the mix, so a kick that ducks the band
    // ducks the machine with it.
    this.machineChain?.scheduleDuck(amount, when, lengthSeconds);
  }

  /**
   * The effects on the whole mix — the song's, like `reverb` and `echo`.
   *
   * Handed over WHOLE, because which of them are on decides the shape of the
   * graph rather than a value inside it: a set that adds or drops an effect is
   * re-wired, and a set that only moves numbers is turned live. An empty set
   * leaves the bus connected straight to the room, which is a song that never
   * asked for any of this.
   */
  setMasterEffects(effects: Partial<ChannelEffects>): void {
    const next = clampEffects(effects);
    if (EFFECT_IDS.every((id) => this.masterEffects[id] === next[id])) return;
    this.masterEffects = next;
    if (!this.ctx || !this.room) return;
    this.wireMix();
  }

  /**
   * Give every channel its group's fader, and every group its level.
   *
   * Two arrays rather than one list of groups, because they answer two different
   * questions — which group is this CHANNEL on, and how loud is that group — and
   * the resolved answer is what the audio path wants: a number per channel, in
   * channel order. A channel whose bus does not exist (or which has none) resolves
   * to full, so a song with no buses carries an array of 100s and mixes exactly as
   * it did before buses existed.
   */
  setBuses(buses: readonly Bus[], assignments: readonly (string | null)[]): void {
    this.buses = buses;
    this.busLevels = assignments.map((name) => busLevelFor(buses, name));
    this.applyAllGains();
    // The machine's group is a name on the machine rather than one of the
    // per-channel assignments, so its fader is set from here.
    if (this.machine && this.machineChain) {
      this.machineChain.setLevel(machineGain(this.machine, this.machineBusLevel()), this.now());
    }
  }

  /** The machine's group level, resolved from the song's buses. Full when it has none. */
  private machineBusLevel(): number {
    return busLevelFor(this.buses, this.machine?.bus ?? null);
  }

  /**
   * Hand the engine the song's drum machine, or null when it has none.
   *
   * The counterpart of `setKit`: a whole instrument rather than a number, and one
   * that rebuilds the graph only when the SET of effects on it changes — a knob
   * turned while the beat runs is a knob, not a rewire.
   */
  /**
   * Hand the engine the machine bar each song bar plays, from the song's FORM.
   *
   * A separate call from `setMachine` because it is about the ARRANGEMENT rather
   * than the instrument: a section's `machine 2` changes which bar sounds, not
   * what the pads are, so it needs no rebuild — only the placement reads it.
   */
  setMachineBars(bars: readonly (number | null)[]): void {
    this.machineBars = bars.slice();
  }

  setMachine(machine: DrumMachine | null): void {
    // A machine that starts or stops ducking changes whether every TRACK needs a
    // dip node, so that transition rebuilds the tracks too — the same rule
    // `setDucks` follows, from the other end of the same question.
    const duckBefore = this.anyDucking();
    this.machine = machine;
    const duckChanged = this.anyDucking() !== duckBefore;
    if (duckChanged && this.ctx) this.buildTrackChains(this.chains.length);

    const chain = this.machineChain;
    const wanted = machine ? EFFECT_IDS.filter((id) => (machine.effects[id] ?? 0) > 0) : [];
    const sameSet = chain !== null && wanted.length === chain.effects.length
      && wanted.every((id) => chain.effects.includes(id));
    // A pad added or removed changes how many strips there are, so it is a rewire
    // rather than a knob — the same distinction the effect SET gets, one level down.
    const samePads = chain !== null && (machine?.pads.length ?? 0) === this.padChains.length;
    if (machine === null || !sameSet || !samePads || duckChanged) {
      this.buildMachineChain();
      return;
    }
    const at = this.now();
    for (const id of chain!.effects) chain!.setEffect(id, machine.effects[id] ?? 0, at);
    chain!.setLevel(machineGain(machine, this.machineBusLevel()), at);
    chain!.setPan(machine.pan, at);
    chain!.setVerb(machine.verb, at);
    chain!.setEcho(machine.echo, at);
    this.applyPadStrips(at);
  }

  /** Build (or rebuild) the machine's channel strip, wiring it into the mix bus. */
  private buildMachineChain(): void {
    const ctx = this.ctx;
    for (const node of this.machineChain?.nodes ?? []) {
      try { node.disconnect(); } catch { /* already detached */ }
    }
    for (const chain of this.padChains) {
      for (const node of chain?.nodes ?? []) {
        try { node.disconnect(); } catch { /* already detached */ }
      }
    }
    this.machineChain = null;
    this.padChains = [];
    const machine = this.machine;
    if (!ctx || !this.bus || !this.room || !machine) return;
    const sends = { reverb: this.room.reverbInput, echo: this.room.echoInput };
    this.machineChain = buildChannelChain(
      ctx,
      {
        level: machineGain(machine, this.machineBusLevel()),
        pan: machine.pan,
        verb: machine.verb,
        echo: machine.echo,
        effects: machine.effects,
        duck: this.anyDucking(),
        // Fed by the PADS, whose outputs are already panned stereo: hold both
        // channels so a pad's place between the speakers survives into the mix
        // instead of being folded to mono at this node. The offline renderer
        // passes the same option, so live and exported agree.
        inputChannels: 2,
      },
      this.bus,
      sends,
    );
    // Every pad gets its own little strip, feeding the machine's input — so the
    // price of the machine's own level, sends and effects being one set of nodes
    // is that the pads are summed BEFORE them, the way a drum machine's channels
    // sit in front of its main out.
    this.padChains = machine.pads.map((pad) => buildChannelChain(ctx, padStripOptions(pad), this.machineChain!.input, sends));
  }

  /**
   * Turn each pad's fader and place to whatever the song now says.
   *
   * The live half of per-pad strips: a pad's level or pan moved while the beat runs
   * is a knob, not a rewire, exactly as the machine's own fader is. It no-ops when
   * there is no machine to apply.
   */
  private applyPadStrips(at: number): void {
    const pads = this.machine?.pads ?? [];
    pads.forEach((pad, index) => {
      const chain = this.padChains[index];
      if (!chain) return;
      chain.setLevel(padStripOptions(pad).level, at);
      chain.setPan(pad.pan, at);
    });
  }

  /** Change one track's level, 0..100. */
  setLevel(index: number, level: number): void {
    this.levels[index] = clampLevel(level);
    this.applyTrackGain(index);
  }

  /**
   * Solo one track, or unsolo it — a change to what is being LISTENED to, not
   * to the song, which is why it never travels in a file.
   *
   * Solo OVERRIDES mute rather than composing with it: pressing solo on a muted
   * channel is a person asking to hear it, and a control that answers "I heard
   * you, and you still cannot hear it" teaches nothing but distrust. The mute
   * box stays as it was, so unsoloing puts the channel back exactly as it was.
   */
  setSolo(index: number, soloed: boolean): void {
    while (this.solos.length <= index) this.solos.push(false);
    this.solos[index] = soloed;
    this.applyAllGains();
  }

  /** Replace the whole solo set at once — what the scene does on a new song. */
  setSolos(solos: readonly boolean[]): void {
    this.solos = solos.slice();
    this.applyAllGains();
  }

  /** True when any channel is soloed, i.e. when the rest are held quiet. */
  get soloing(): boolean { return this.solos.some(Boolean); }

  /**
   * Give every track its sound, as the voices the song stores.
   *
   * A voice is a one-layer patch (see `model/instrument.ts`), so this is the
   * shortcut the app has always had; `setPatches` is the general form it now sits
   * on. An existing song therefore takes a path that is a stack of exactly one
   * layer, which is how the new model was added without changing any old sound.
   */
  setVoices(voices: readonly VoiceParams[]): void {
    this.setPatches(voices.map(patchFromVoice));
  }

  /**
   * Give every track its whole sound, voice plus stack, in one call.
   *
   * The scene's path on every undo, script apply and OPEN, because a stack is
   * part of the song like a level is: re-pointing the engine at the song has to
   * carry the layers or the screen and the sound would drift apart.
   */
  setTrackPatches(tracks: readonly StackedSound[]): void {
    this.setPatches(tracks.map(patchForTrack));
  }

  /**
   * Give every track its whole sound: one or more layers.
   *
   * The engine keeps its own copy, so a note scheduled a moment ago still sounds
   * the way it was queued — turning a knob never reaches backwards into notes
   * that are already in the audio pipeline.
   */
  setPatches(patches: readonly Patch[]): void {
    this.patches = patches.map(copyPatch);
  }

  /**
   * Change one track's sound, as the voice a channel is when it is not stacked.
   *
   * The FILTER SHAPE survives it, and that is the one subtle thing here: a shape
   * belongs to the channel rather than to the voice, so turning a knob in `F4` or
   * picking a different preset must not quietly put the filter back to the
   * low-pass. Only a whole patch (or a re-sync from the song) may change it.
   */
  setVoice(index: number, voice: VoiceParams): void {
    const kept = this.patches[index]?.shape;
    this.patches[index] = { ...patchFromVoice(voice), ...(kept === undefined ? {} : { shape: kept }) };
  }

  /**
   * Change one track's whole sound: its voice, plus any layers above it.
   *
   * The general form of `setVoice`, and the one a stacked channel needs — a
   * channel with a stack is one note played by several oscillators, so changing
   * one of its layers must hand over the WHOLE patch rather than the layer's
   * tone alone.
   */
  setPatch(index: number, patch: Patch): void {
    this.patches[index] = copyPatch(patch);
  }

  /** Give every track its note length, in steps. */
  setHolds(holds: readonly number[]): void {
    this.holds = holds.slice();
  }

  /** Change one track's note length, in steps. */
  setHold(index: number, steps: number): void {
    this.holds[index] = steps;
  }

  // --- transport ------------------------------------------------------------

  /** Start looping from step 0. `steps` is how long the whole song is. */
  start(steps: number, getStepNotes: StepNotesFn): void {
    if (this.running) return;
    this.resume();
    if (!this.ctx) return;
    this.steps = Math.max(1, steps);
    this.getStepNotes = getStepNotes;
    this.running = true;
    this.step = 0;
    this.nextStep = 0;
    this.absStep = 0;
    this.soundAbsStep = -1;
    this.pending = [];
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Stop and silence everything now (release tails are cut, not left hanging). */
  stop(): void {
    this.running = false;
    this.step = -1;
    this.soundAbsStep = -1;
    this.pending = [];
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.trackVoices.clear();
    // Nothing is "the previous note" once the transport has stopped, so a song
    // that starts again starts clean rather than sliding out of wherever it was.
    // The round-robin restarts with it: a performance that begins again begins at
    // variant 0, which is the note as written.
    this.lastMidi = [];
    this.hitCounts = [];
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const voice of this.voices) {
        try {
          voice.env.gain.cancelScheduledValues(now);
          voice.env.gain.setTargetAtTime(0, now, 0.012);
          for (const source of voice.sources) source.stop(now + 0.06);
        } catch {
          /* a source that already stopped throws on a second stop */
        }
      }
    }
  }

  /** Audition one note immediately — used when a note is typed into the grid. */
  previewNote(track: number, midi: number): void {
    this.resume();
    if (!this.ctx) return;
    // An audition is a note out of context, so it never glides from the last one
    // played and never becomes one — but it DOES wear the channel's vibrato, so
    // that typing a note on a wobbly channel sounds like what will be written.
    // An audition is a note out of context, so it is never a varied hit either:
    // there is no "which hit of the channel" for a note nobody played.
    this.playNote(track, midi, this.ctx.currentTime + 0.001, PREVIEW_LENGTH, DEFAULT_VELOCITY, null, 0, 0, NO_TONE_SHIFT, this.vibratos[track] ?? 0, this.drifts[track] ?? DEFAULT_DRIFT);
  }

  /**
   * Audition a TAKE — a recording's own window, through the channel's strip.
   *
   * `previewNote` plays a pitch through the channel's PATCH; this plays the
   * RECORDING, which is the only way `HEAR TAKE` can mean the thing the page is
   * looking at. It honours the take's TRIM (starts at the window's start and
   * ends at its end) and, when asked, its LOOP — the browser loops the buffer
   * between the two points, so the ear hears the loop the waveform shows.
   *
   * The audio goes through the channel's own `input`, so the level, the pan and
   * the effects the channel carries are the ones that shape it — an audition that
   * bypassed them would not sound like the note that gets written. The returned
   * handle stops it early; a caller keeps at most one alive.
   */
  previewTake(
    track: number,
    sample: Sample,
    window: { start: number; end: number; seconds: number },
    loop: boolean,
  ): { stop(): void } | null {
    this.resume();
    const ctx = this.ctx;
    if (!ctx) return null;
    const out = this.chains[track]?.input ?? this.master;
    if (!out) return null;
    const buffer = ownedSampleBuffer(ctx, sample);
    const duration = buffer.duration;
    const start = Math.max(0, Math.min(window.start, duration));
    const end = Math.max(start, Math.min(window.end, duration));
    if (end - start <= 0) return null;

    const at = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.9, at + 0.006);
    src.connect(gain).connect(out);
    const looping = loop && end - start > 0.02;
    if (looping) {
      src.loop = true;
      src.loopStart = start;
      src.loopEnd = end;
      // A cap, not the length: a loop rings until it is stopped, but nothing in
      // an audition should be able to ring for a minute if a caller forgets.
      src.start(at, start);
      src.stop(at + 30);
    } else {
      src.start(at, start, Math.max(0.02, end - start));
    }
    let stopped = false;
    return {
      stop: (): void => {
        if (stopped) return;
        stopped = true;
        const now = ctx.currentTime;
        try {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.02);
          src.stop(now + 0.03);
        } catch {
          /* a source that already ended throws on a second stop */
        }
      },
    };
  }

  /**
   * Audition one DRUM hit immediately — used when a lane is clicked in the `F8`
   * drum view.
   *
   * `previewNote`'s twin, with the one difference that matters: the voice is the
   * KIT's, not the channel's. A channel that plays a kit is not a channel with a
   * drum patch on it — the drum decides the sound (see `kitVoice`) — so an
   * audition through the channel's own patch would be a lie about the hit that
   * was just written. The hit's own pitch comes from the kit table, which is what
   * the file and the export use too.
   */
  previewDrum(track: number, drum: DrumId): void {
    this.resume();
    if (!this.ctx) return;
    // No automation lane is consulted: an audition has no STEP (the sequencer's
    // own is wherever it happens to be), and reading a lane at an arbitrary
    // position is a fact about the playhead, not about this hit.
    this.playNote(
      track, drumPitch(drum), this.ctx.currentTime + 0.001, PREVIEW_LENGTH,
      DEFAULT_VELOCITY, null, 0, 0, NO_TONE_SHIFT, this.vibratos[track] ?? 0, this.drifts[track] ?? DEFAULT_DRIFT, kitVoice(this.kit, drum, this.kits), drum,
    );
  }

  /**
   * Audition a note the way its CELL says it is played.
   *
   * `previewNote` is the sound of a pitch; this is the sound of a playing, which
   * is what the articulation keys change. A stutter plays the same hits the
   * sequencer would schedule, so pressing `*` at the cursor tells you where the
   * hits fall rather than how many there are.
   *
   * A slide is auditioned as an ARRIVAL from a whole tone below: an audition has
   * no previous note to come from (see `previewNote`), and "started low and got
   * here" is the gesture. The interval is the demonstration rather than the
   * music — a real slide comes from wherever the channel last played.
   */
  previewArticulation(track: number, midi: number, articulation: Articulation): void {
    this.resume();
    if (!this.ctx) return;
    const now = this.ctx.currentTime + 0.001;
    const vibrato = this.vibratos[track] ?? 0;
    for (const hit of articulationHits(articulation, this.glides[track] ?? 0)) {
      const sliding = hit.glide > 0;
      this.playNote(
        track, midi, now + hit.at * PREVIEW_LENGTH, PREVIEW_LENGTH * hit.length,
        DEFAULT_VELOCITY, sliding ? midi - PREVIEW_SLIDE_FROM : null, hit.glide, hit.bend, NO_TONE_SHIFT, vibrato, this.drifts[track] ?? DEFAULT_DRIFT,
      );
    }
  }

  /**
   * Audition a channel's glide: two notes, the second sliding into pitch.
   *
   * A slide is a relationship BETWEEN two notes, so one note can never show it.
   * This plays the note asked for and then one a fourth above, sliding — which is
   * what makes the GLIDE dial a thing you can hear rather than a number you set
   * and hope about. Like every audition it leaves the channel's own memory alone,
   * so the demo can never become a real "previous note" for playback to slide
   * out of.
   */
  previewGlide(track: number, midi: number): void {
    this.resume();
    if (!this.ctx) return;
    const now = this.ctx.currentTime + 0.001;
    const vibrato = this.vibratos[track] ?? 0;
    const glide = this.glides[track] ?? 0;
    this.playNote(track, midi, now, 0.3, DEFAULT_VELOCITY, null, 0, 0, NO_TONE_SHIFT, vibrato, this.drifts[track] ?? DEFAULT_DRIFT);
    this.playNote(track, midi + 5, now + 0.34, 0.7, DEFAULT_VELOCITY, midi, glide, 0, NO_TONE_SHIFT, vibrato, this.drifts[track] ?? DEFAULT_DRIFT);
  }

  dispose(): void {
    this.stop();
    this.trackVoices.clear();
    for (const voice of this.voices) {
      try {
        for (const source of voice.sources) source.disconnect();
        for (const node of voice.nodes) node.disconnect();
      } catch { /* already gone */ }
    }
    this.voices.clear();
    this.room?.dispose();
    this.room = null;
    // Only a context this engine made is one this engine may close: the borrowed
    // case belongs to the caller, who is still using it for something else.
    if (this.ctx && !this.borrowed) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.bus = null;
    this.mixChain = null;
    this.chains = [];
    this.machineChain = null;
    this.padChains = [];
    this.machineBars = [];
    this.padSamples = [];
    this.takeWindows = new Map();
    this.lastMidi = [];
    this.hitCounts = [];
  }

  // --- internals ------------------------------------------------------------

  private masterLevel(): number {
    return this.volume * 0.8;
  }

  private build(): void {
    // A borrowed context skips the constructor — and the gesture rule with it,
    // because whoever lent it has already satisfied that rule to get it.
    let ctx = this.borrowed;
    if (!ctx) {
      const Ctor = audioContextCtor();
      if (!Ctor) return;
      try {
        ctx = new Ctor();
      } catch {
        return;
      }
    }
    this.ctx = ctx;

    // The bus is a gentle ceiling, not the voice's brightness: each note gets
    // its own low-pass from the channel's BRIGHT knob, and this one only keeps
    // the very top end from turning to fizz when everything plays at once.
    const bus = ctx.createBiquadFilter();
    bus.type = 'lowpass';
    bus.frequency.value = 12000;
    // The room sits between the bus and the master fader: everything the
    // channels made goes through it, dry at rest, and the fader is the last
    // thing before the speakers — which is what a master fader is for.
    const room = buildRoom(ctx);
    const master = ctx.createGain();
    master.gain.value = this.masterLevel();
    this.bus = bus;
    this.room = room;
    this.master = master;
    // The mix's own effects, between the band and the room. Before the room
    // rather than after it, and that is a decision rather than an accident: the
    // room ends in the limiter, which is the last thing before the fader and the
    // only reason a loud song does not clip — a stage spliced in after it would
    // be the one stage nothing held under the ceiling.
    this.wireMix();
    room.output.connect(master).connect(ctx.destination);
    room.setTempo(this.bpm);
    this.noiseBuffer = makeNoiseBuffer(ctx);

    this.buildTrackChains(this.mutes.length);
    this.buildMachineChain();
  }

  /**
   * Point the mix at the effects it should have, building, adjusting or dropping
   * the stage as the set of them changes.
   *
   * The bus is unwired and rewired in one place, because the mix's effects are a
   * single node between the bus and the room and there is exactly one edge to
   * keep: which of them are on decides whether that node exists at all.
   */
  private wireMix(): void {
    const ctx = this.ctx;
    const bus = this.bus;
    const room = this.room;
    if (!ctx || !bus || !room) return;
    const wanted = EFFECT_IDS.filter((id) => (this.masterEffects[id] ?? 0) > 0);
    const built = this.mixChain?.effects ?? [];
    bus.disconnect();
    const sameSet = wanted.length === built.length && wanted.every((id) => built.includes(id));
    if (this.mixChain && sameSet) {
      // The same effects, different numbers: turn the knobs rather than rebuild
      // the graph, so a dragged dial does not click.
      const at = this.now();
      for (const id of built) this.mixChain.setEffect(id, this.masterEffects[id] ?? 0, at);
      bus.connect(this.mixChain.input);
      return;
    }
    // A set that changed is a different graph, so the old one goes entirely: a
    // node left connected is a node still in the path.
    for (const node of this.mixChain?.nodes ?? []) {
      try { node.disconnect(); } catch { /* already detached */ }
    }
    this.mixChain = buildMasterChain(ctx, this.masterEffects, room.input);
    bus.connect(this.mixChain ? this.mixChain.input : room.input);
  }

  /**
   * Rebuild every channel's place in the graph: gain, pan, sends, out to the bus.
   *
   * The wiring is `audio/chain.ts`'s, and deliberately so — the offline renderer
   * calls the same function. What matters here is the reason that file rejects an
   * equal-power panner: `pan 0` has to be a gain of exactly 1 on both sides, so
   * that every song written before pan existed sounds bit-for-bit the way it did.
   */
  private buildTrackChains(count: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus || !this.room) return;
    for (const chain of this.chains) {
      for (const node of chain.nodes) {
        try { node.disconnect(); } catch { /* already detached */ }
      }
    }
    this.chains = [];
    for (let i = 0; i < count; i++) {
      this.chains.push(buildChannelChain(
        ctx,
        {
          level: this.gainFor(i),
          pan: this.pans[i] ?? 0,
          verb: this.verbs[i] ?? DEFAULT_VERB,
          echo: this.echoes[i] ?? DEFAULT_TRACK_ECHO,
          // Every channel takes the dip node when ANY channel ducks — the one
          // that ducks does not need it, but it costs one gain and saves
          // rebuilding the graph the moment somebody starts ducking.
          duck: this.anyDucking(),
          effects: this.effects[i] ?? NO_EFFECTS,
        },
        this.bus,
        { reverb: this.room.reverbInput, echo: this.room.echoInput },
      ));
    }
    this.applyAllGains();
  }

  /**
   * The gain a channel should be at: THE rule, times the channel's own level.
   *
   * `channelGain` is the model's, not a local copy — the whole design note is at
   * the top of `model/mix.ts`. Here it is only the division: `channelGain`
   * answers in the song's 0..100 and a `GainNode` wants 0..1.
   */
  private gainFor(index: number): number {
    return channelGain(index, this.levels, this.mutes, this.solos, this.busLevels[index] ?? DEFAULT_LEVEL) / 100;
  }

  /**
   * Move one channel's gain to where it should be now.
   *
   * A short ramp rather than a jump, for the same reason the master fader has
   * one: a step change in gain is an audible click, and the whole point of the
   * level control is that turning it down does not sound like a fault.
   */
  private applyTrackGain(index: number): void {
    this.chains[index]?.setLevel(this.gainFor(index), this.now());
  }

  private applyAllGains(): void {
    for (let i = 0; i < this.chains.length; i++) this.applyTrackGain(i);
  }

  /** Move one channel's pan gains to where they should be now. */
  private applyPan(index: number): void {
    this.chains[index]?.setPan(this.pans[index] ?? 0, this.now());
  }

  private applyAllPans(): void {
    for (let i = 0; i < this.chains.length; i++) this.applyPan(i);
  }

  /** Move both of one channel's sends to where they should be now. */
  private applyAllSends(): void {
    for (let i = 0; i < this.chains.length; i++) {
      const at = this.now();
      this.chains[i].setVerb(this.verbs[i] ?? DEFAULT_VERB, at);
      this.chains[i].setEcho(this.echoes[i] ?? DEFAULT_TRACK_ECHO, at);
    }
  }

  /** The audio clock, or 0 before there is a context. */
  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** One scheduler turn: queue the near future, then advance the playhead. */
  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;

    const horizon = ctx.currentTime + LOOKAHEAD_S;
    let guard = 0;
    while (this.nextStepTime < horizon && guard++ < 512) {
      // How fast the song is going at THIS step. With no tempo map every step
      // answers the same number, so a song that never asked for one is scheduled
      // by exactly the arithmetic it always was; with a map, a bar that leans is
      // a bar whose steps are longer or shorter than the one before.
      const bpm = this.bpmAt(this.nextStep);
      const rowSeconds = secondsPerRow(bpm, this.rowsPerBeat, this.speed);
      // The echo is locked to the BEAT, so it has to follow the tempo rather than
      // be set once at the start: a delay that stayed at the tempo the song began
      // at would drift out of the groove through the first slow bar.
      if (bpm !== this.echoBpm) {
        this.echoBpm = bpm;
        this.room?.setTempo(bpm);
      }
      // A LEVEL lane is ramped once per STEP rather than once per note, because a
      // fade has to keep moving through bars where nothing is playing — the whole
      // point of a fade-out is the silence at the end of it. Scheduled at the
      // step's own time, a lookahead ahead of the ear like every other event here.
      if (this.automation.length > 0) this.applyLevelLanes(this.nextStep);
      // The step's notes, and how many of them each channel has: a channel's
      // notes in one step are ONE chord, so a chord of three answers 3. Counted
      // before the loop so a strum can spread the chord evenly, and counted here
      // rather than in `strumOffsets` so the same step is not walked twice.
      const stepNotes = this.getStepNotes(this.nextStep, this.absStep);
      const chordSize = new Map<number, number>();
      for (const note of stepNotes) chordSize.set(note.track, (chordSize.get(note.track) ?? 0) + 1);
      const chordAt = new Map<number, number>();
      for (const note of stepNotes) {
        // Where THIS channel's note sits and how hard it plays: its own feel laid
        // over the song's, plus its own looseness. Read per NOTE rather than per
        // step, because a feel belongs to the part — a straight song can carry a
        // shuffled hat — and read fresh every time, like the swing below it, so
        // changing a groove mid-playback is a change of feel rather than of song.
        // The same function the offline renderer calls, so an export lands where
        // the app played. A channel with no opinion and no looseness gets exactly
        // the delay and gain the song's groove alone would have given it.
        const feel = trackFeel(
          {
            groove: this.trackGrooves[note.track] ?? null,
            humanize: this.humanizes[note.track] ?? DEFAULT_HUMANIZE,
          },
          this.groove, this.nextStep, this.rowsPerBeat, note.track,
        );
        const feelTime = this.nextStepTime + feel.delay * rowSeconds;
        // A note rings for its channel's length. One step keeps the small gap
        // that makes a run of notes sound like separate events; a longer hold
        // fills its whole time, because the point of a long note is that it does
        // NOT stop between steps.
        const hold = Math.max(1, this.holds[note.track] ?? 1);
        // The pitch this channel last played is what a gliding note slides FROM,
        // and it is read before the note is stored, so a channel glides note to
        // note rather than note to itself.
        const from = this.lastMidi[note.track] ?? null;
        // `gate` shortens the note rather than shaping it: how much of its
        // written length this channel actually sounds. At 0 the factor is
        // exactly 1, so a channel nobody has gated is scheduled to the sample.
        // Two gates, because they are two decisions: the channel's and the
        // mix's. At 0 each factor is exactly 1, so a song that used neither
        // schedules the length it always did, to the sample.
        const ownGate = this.effects[note.track]?.gate ?? 0;
        const gate = gateFactor(this.automatedGateAt(note.track, ownGate))
          * gateFactor(this.masterEffects.gate ?? 0);
        const length = noteLength(rowSeconds, hold) * gate;
        // Where in its chord this note sits, and how far a strum pushes it. The
        // roll is measured in STEPS, so it multiplies by this step's own length —
        // which keeps the gesture the same at any tempo, the way the model says.
        const chordIndex = chordAt.get(note.track) ?? 0;
        chordAt.set(note.track, chordIndex + 1);
        const strumSteps = strumOffsets(chordSize.get(note.track) ?? 1, this.strums[note.track] ?? 0)[chordIndex] ?? 0;
        const strumSeconds = strumSteps * rowSeconds;
        // How this HIT varies from the note as written: which hit of the channel's
        // round-robin this is, and how much the channel's tone follows the force
        // it is struck with. Read per NOTE — so a stutter's hits share one variant,
        // because a roll is one gesture — and counted BEFORE the note sounds, so
        // the first hit of a channel is always variant 0, the note as written.
        const hitIndex = this.hitCounts[note.track] ?? 0;
        this.hitCounts[note.track] = hitIndex + 1;
        const strike = clampVelocity(note.velocity * feel.gain);
        const tone = hitShift(
          { robin: this.robins[note.track] ?? DEFAULT_ROBIN, touch: this.touches[note.track] ?? DEFAULT_TOUCH },
          hitIndex,
          strike,
        );
        // How far the channel's pitch WANDERS here: its own `drift`, or what a
        // lane moves it to. Read per NOTE like `gate`, because it is a value the
        // synth applies when it builds the note rather than a node in the chain.
        const drift = this.automatedDriftAt(note.track, this.drifts[note.track] ?? DEFAULT_DRIFT);
        // How this NOTE is played rather than what pitch it is: `>` slides into
        // it, `*3` hits it three times inside its own length. The model answers
        // with the hits as FRACTIONS of the note's length, so the same rule
        // serves the scheduler, the renderer and the MIDI writer — and a note
        // that says nothing answers with one hit at the start for the whole
        // length, at the channel's own glide, which is the note this line
        // scheduled before articulation existed. Exact, to the sample: `at: 0`
        // adds nothing and `length: 1` multiplies by one.
        for (const hit of articulationHits(note.articulation, this.glides[note.track] ?? 0)) {          this.playNote(
            note.track, note.midi, feelTime + strumSeconds + hit.at * length,
            length * hit.length,
            strike,
            // The hit's own variation, on top of the slides and gestures the model
            // already answered with: one record, applied in one place.
            from, hit.glide, hit.bend, tone, this.vibratos[note.track] ?? 0, drift,
            // The voice this hit plays: the channel's, or the KIT's when the cell
            // is a drum — with any lane's knob moves applied to whichever it is,
            // so a kit channel automates exactly like every other channel.
            note.drum === null
              ? this.automatedVoiceAt(note.track)
              : this.automatedDrumVoiceAt(note.track, note.drum),
            note.drum,
          );
        }
        // The pump: if this channel is a ducker, everybody else steps back for
        // exactly as long as this note rings. One dip per NOTE rather than per
        // hit, because a stutter's hits tile their step without a gap — the
        // sound never stops, so the duck never comes back up.
        this.duckOthers(note.track, feelTime, length);
        this.lastMidi[note.track] = note.midi;
      }
      // The MACHINE's hits for this step. Its grid is its own — a machine may
      // count a different beat from the song's rows — so the hits are asked for
      // by ROW, with the same function the offline renderer calls, and placed
      // inside this step by the fraction of it the row names. That is the whole
      // reason live and offline cannot disagree about a beat.
      if (this.machine !== null) {
        const machine = this.machine;
        const hits = machineHitsInRange(machine, this.rowsPerBeat, this.nextStep, this.nextStep + 1, this.machineBars);
        if (hits.length > 0) {
          const stepSpan = rowSeconds * stepTimeFactor(this.swing, this.nextStep);
          const length = noteLength(machineStepSeconds(machine, rowSeconds, this.rowsPerBeat), 1);
          for (const hit of hits) {
            const pad = machine.pads[hit.padIndex];
            if (!pad) continue;
            this.playMachineHit(pad, hit.velocity, this.nextStepTime + (hit.row - this.nextStep) * stepSpan, length);
          }
          // The machine's own pump, one dip per step it hits on.
          if (machineDucks(machine)) {
            const amount = machine.duck;
            this.chains.forEach((chain) => chain.scheduleDuck(amount, this.nextStepTime, length));
          }
        }
      }
      // The PLAYHEAD follows the grid, not the feel: a groove is where the notes
      // sit inside their steps, and a cursor that wandered a tenth of a step
      // late would be showing a performance rather than a position.
      this.pending.push({ step: this.nextStep, abs: this.absStep, time: this.nextStepTime });
      // How long THIS step lasts: a straight step is one row, a swung one is
      // longer if it is the first of a pair and shorter if it is the second. The
      // model owns the arithmetic so it can be tested; see `stepTimeFactor`.
      this.nextStepTime += rowSeconds * stepTimeFactor(this.swing, this.nextStep);
      this.nextStep = (this.nextStep + 1) % this.steps;
      // The absolute count runs on past the loop point: the song starts over, the
      // performance does not.
      this.absStep += 1;
    }

    while (this.pending.length > 0 && this.pending[0].time <= ctx.currentTime) {
      const reached = this.pending.shift()!;
      this.step = reached.step;
      this.soundAbsStep = reached.abs;
    }
  }

  /**
   * Turn one note's whole sound into nodes, at a scheduled time.
   *
   * A one-line delegation now: what a note is MADE of is `synth.ts`, which the
   * offline renderer uses too. What stays here is the part that is about live
   * playback — one voice per channel, and a bookkeeping entry so the note can be
   * released when the next one arrives.
   */
  /** Where a channel's level lane has it at the step being scheduled, if any. */
  private applyLevelLanes(step: number): void {
    for (let i = 0; i < this.chains.length; i++) {
      const level = automatedLevel(this.automation, i + 1, this.levels[i] ?? MAX_LEVEL, step, this.rowsPerBar);
      if (level === null) continue;
      // Mute and solo still win: a lane moves how LOUD a channel is, never
      // whether it is heard, so the same `channelGain` that reads the song's own
      // levels answers this — with the lane's value standing in for this step.
      const levels = this.levels.slice();
      levels[i] = level;
      this.chains[i]?.setLevel(
        channelGain(i, levels, this.mutes, this.solos, this.busLevels[i] ?? DEFAULT_LEVEL) / 100,
        this.nextStepTime,
      );
    }
  }

  /** A channel's voice at the step being scheduled, or null when nothing moves it. */
  private automatedVoiceAt(track: number): VoiceParams | null {
    if (this.automation.length === 0) return null;
    const patch = this.patches[track];
    if (!patch) return null;
    const voice = voiceOfPlainLayer(firstLayer(patch));
    if (!voice) return null;
    return automatedVoice(voice, this.automation, track + 1, this.nextStep, this.rowsPerBar);
  }

  /**
   * The voice a DRUM hit plays at the step being scheduled.
   *
   * The kit's own sound rather than the channel's, moved by whatever an
   * automation lane does to those knobs — so `automate 4 bright 40 100 bars 1 to
   * 8` opens the hi-hat's brightness on a kit channel, which is what the lane
   * means and what a person would expect it to move. Always answers a voice: a
   * drum has a sound whether or not anything is automated.
   */
  private automatedDrumVoiceAt(track: number, drum: DrumId): VoiceParams {
    const voice = kitVoice(this.kit, drum, this.kits);
    if (this.automation.length === 0) return voice;
    // `automatedVoice` answers null when nothing moved, which is the same "use
    // the drum as it is" this method would have said itself.
    return automatedVoice(voice, this.automation, track + 1, this.nextStep, this.rowsPerBar) ?? voice;
  }

  /** A channel's gate at the step being scheduled: the lane's, or its own. */
  private automatedGateAt(track: number, own: number): number {
    if (this.automation.length === 0) return own;
    return automatedGate(this.automation, track + 1, own, this.nextStep, this.rowsPerBar) ?? own;
  }

  /** A channel's drift at the step being scheduled: the lane's, or its own. */
  private automatedDriftAt(track: number, own: number): number {
    if (this.automation.length === 0) return own;
    return automatedDrift(this.automation, track + 1, own, this.nextStep, this.rowsPerBar) ?? own;
  }

  private playNote(
    track: number,
    midi: number,
    at: number,
    duration: number,
    velocity: number,
    fromMidi: number | null,
    glide: number,
    bend: number,
    tone: ToneShift,
    vibrato: number,
    drift: number,
    automated: VoiceParams | null = null,
    drum: DrumId | null = null,
  ): void {
    const ctx = this.ctx;
    const out = this.chains[track]?.input ?? this.chains[0]?.input;
    if (!ctx || !out) return;

    // How many notes this channel may hold. ONE is the app's own history: a new
    // note takes the one still ringing, the way a monophonic synth or a real wind
    // player does. More than one makes room by STEALING, on the rule in the model:
    // the oldest note goes first, and the quietest among notes that began together.
    const poly = clampPoly(this.polys[track] ?? DEFAULT_POLY);
    const held = this.trackVoices.get(track) ?? [];
    while (held.length >= poly) {
      const give = voiceToSteal(held);
      if (give < 0) break;
      releaseNote(held[give].graph, at);
      held.splice(give, 1);
    }

    // A lane that moves a voice knob rebuilds layer 1 for this note only, so the
    // layers stacked above it keep their own settings and the layer's own copy is
    // left alone — the next note asks the model again.
    const base = this.patches[track] ?? patchFromVoice(DEFAULT_VOICE);
    // A drum hit on a `wave font` channel plays the FONT'S OWN KIT, which no
    // `duty` can name (see `prepareFontVoice`). The channel's font voice is
    // therefore kept rather than replaced by the song kit's synthesized hit — and
    // the drum reaches the synth with the note, so the right zone is chosen. Any
    // other drum hit keeps the kit's voice exactly as it always has.
    const fontDrum = drum !== null && firstLayer(base).wave === 'font';
    const patch = automated && !fontDrum ? patchWithVoice(base, automated) : base;
    const voice = buildNote(ctx, patch, midi, at, duration, out, this.noiseBuffer, {
      velocity,
      glide,
      fromMidi,
      bend,
      tone,
      vibrato,
      drift,
      speed: this.speed,
      tuning: this.tuning,
      tonic: this.tonic,
      font: this.font,
      drum: fontDrum ? drum : null,
      sample: this.samples[track] ?? null,
      // The take's window, when the RECORDER page has shaped one for this
      // recording: the trim a note starts and ends at, and its loop. A bank
      // entry with no take behind it plays whole, which is what it always did.
      sampleWindow: this.sampleWindowFor(this.samples[track] ?? null),
    });
    this.voices.add(voice);
    held.push({ graph: voice, startedAt: at, velocity });
    this.trackVoices.set(track, held);
    const primary = voice.sources[0];
    if (primary) primary.onended = () => this.retire(voice, track);
  }

  /**
   * Turn one machine PAD hit into a note, at a scheduled time.
   *
   * A pad is the same `VoiceParams` a channel has, so a hit is built by the same
   * `buildNote` — into the machine's strip rather than a track's. Nothing is kept
   * to be stolen or released: a drum hit is a one-shot, and the pad's own envelope
   * is what ends it. The voice is still added to `voices` so a stop silences it
   * like everything else.
   *
   * The hit carries ONLY its velocity. The pad's level and pan are real nodes in
   * `padChains`, so a pad's fader no longer has to be folded into how hard the hit
   * is struck — which is the difference between a fader and a note.
   */
  private playMachineHit(pad: DrumPad, velocity: number, at: number, duration: number): void {
    const ctx = this.ctx;
    // Into the pad's own strip when this pad HAS one, so its `level` is a fader and
    // its `pan` is a place in the field; the machine's input is the honest fallback
    // (a preview of a pad the song does not hold, say), where the hit is still heard.
    const index = this.machine?.pads.indexOf(pad) ?? -1;
    const out = (index >= 0 ? this.padChains[index]?.input : null) ?? this.machineChain?.input;
    if (!ctx || !out) return;
    const voice = buildNote(ctx, patchFromVoice(pad.voice), pad.pitch, at, duration, out, this.noiseBuffer, {
      velocity: clampVelocity(velocity),
      speed: this.speed,
      tuning: this.tuning,
      tonic: this.tonic,
      font: this.font,
      // The recording this pad names, when the bank has it. It only reaches a pad
      // whose `voice` wave is `sample` (see `buildNote`); every other wave ignores
      // it, so a pad carries the reference and its own sound without a fight.
      sample: index >= 0 ? this.padSamples[index] ?? null : null,
      sampleWindow: this.sampleWindowFor(index >= 0 ? this.padSamples[index] ?? null : null),
    });
    this.voices.add(voice);
    const primary = voice.sources[0];
    if (primary) primary.onended = () => this.retire(voice, -1);
  }

  /**
   * Audition one machine pad immediately — what the tab plays when a pad is
   * clicked, the machine's answer to `previewDrum`.
   */
  previewPad(pad: DrumPad, velocity: number = DEFAULT_VELOCITY): void {
    this.resume();
    if (!this.ctx) return;
    this.playMachineHit(pad, velocity, this.ctx.currentTime + 0.001, PREVIEW_LENGTH);
  }

  /** Unplug a note once its first oscillator has ended, and forget it was held. */
  private retire(voice: NoteGraph, track: number): void {
    this.voices.delete(voice);
    const held = this.trackVoices.get(track);
    if (held) {
      const at = held.findIndex((one) => one.graph === voice);
      if (at >= 0) held.splice(at, 1);
      if (held.length === 0) this.trackVoices.delete(track);
    }
    try {
      for (const source of voice.sources) source.disconnect();
      for (const node of voice.nodes) node.disconnect();
    } catch { /* already detached */ }
  }
}

// What a PAN means — the two gains and their law — lives in `chain.ts`, shared
// with the offline renderer so a file pans the way a speaker does.
