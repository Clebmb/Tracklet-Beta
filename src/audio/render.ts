/**
 * render — a song, finished, without anybody listening.
 *
 * Everything else in `audio/` exists to make a sound at the moment it is needed.
 * This exists to make the WHOLE sound as fast as the CPU allows, so a song can be
 * written to a file (EXPORT AUDIO, in the F1 menu) and so a tool — or an agent —
 * can check that a script it just wrote actually makes music rather than silence.
 *
 * ── The rule this file obeys ─────────────────────────────────────────────────
 * An exported file must sound like the app. Not "similar": the same. So it uses
 * the same note builder (`synth.ts`), the same channel chain (`chain.ts`) and the
 * same room (`room.ts`) as live playback, and it walks the song with the same two
 * pieces of arithmetic the sequencer uses — `stepToSlot` for which pattern a step
 * belongs to, `stepTimeFactor` for how long a step lasts under swing, and
 * `grooveFeel` for where inside that step the notes actually land.
 *
 * The one thing it does NOT share is the scheduler: live playback has to decide,
 * 25 ms at a time, what is about to happen, because it is racing a real clock.
 * An offline context has no such problem — it can be handed the entire song up
 * front — so this walks the order once, schedules every note, and lets the
 * browser run the math.
 *
 * ── One channel at a time ────────────────────────────────────────────────────
 * `onlyTrack` renders a STEM: the same song, the same graph and the same ducks,
 * with one channel's signal allowed to reach the output. It is the mix with the
 * other faders down and nothing else changed, which is the only definition under
 * which a set of stems is the song rather than a set of approximations of it —
 * and the honest footnote is that the two things at the end of the chain are not
 * linear: a `master` effect shapes one channel here rather than the sum of them,
 * and the ceiling in `room.ts` is a compressor, so each stem gets its own gain
 * smoothing where the mix got one pass over the sum of them.
 *
 * How much that is worth knowing, measured rather than assumed: on a two-channel
 * song peaking at -18 dBFS the summed stems differ from the mix render by at most
 * 5.6e-4 of full scale — about -65 dBFS, roughly 0.4 percent of the peak — and the
 * difference grows only as the mix approaches full scale. Inaudible, and written
 * down here rather than glossed over, because "stems sum to the master" is a claim
 * this file makes and it should be the true version of it.
 *
 * ── Repeats and tails ────────────────────────────────────────────────────────
 * A song is a LOOP: `order` is a list of bars that plays round and round. A file
 * has to stop somewhere, so `repeats` says how many times the order plays (one,
 * by default: the song as written, once through). After that there is a TAIL, so
 * a reverb or an echo is not cut off mid-decay — a second and a half when the
 * song is dry, longer when it is not, because a wet song's last bar is not its
 * last sound.
 */

import { automatedDrift, automatedGate, automatedLevel, automatedVoice } from '../model/automation';
import { firstLayer, patchForTrack, patchFromVoice, patchWithVoice, voiceOfPlainLayer } from '../model/instrument';
import { channelGain } from '../model/mix';
import { busLevelFor, channelBusLevels } from '../model/bus';
import {
  clampPoly,
  clampVelocity,
  gateFactor,
  grooveFeel,
  trackFeel,
  voiceToSteal,
  DEFAULT_LEVEL,
  MAX_LEVEL,
  MIN_DUCK,
  patternRows,
  rowNotes,
  strumOffsets,
  secondsPerRow,
  songSteps,
  songTempos,
  stepTimeFactor,
  stepToSlot,
  type Song,
} from '../model/song';
import { bounceSteps, type BounceRange } from '../model/bounce';
import { tuningFor } from '../model/tuning';
import { articulationHits } from '../model/articulation';
import { hitShift } from '../model/variation';
import { kitVoice, type UserKit } from '../model/kit';
import type { SoundFont } from '../model/soundfont';
import { NO_SAMPLES, sampleByName, type SampleBank, type SampleWindow } from '../model/sample';
import { takeSampleWindow, type Take } from '../model/take';
import { buildChannelChain, buildMasterChain, type ChannelChain } from './chain';
import { machineActive } from '../model/machine';
import { machineBarsForSong, machineDucks, machineGain, machineHitsInRange, machineStepSeconds, padStripOptions } from './machine';
import { buildRoom, type Room } from './room';
import { buildNote, makeNoiseBuffer, noteLength, releaseNote, type NoteGraph } from './synth';
import type { PcmAudio } from './wav';

/** What a render needs to know that the song does not say. */
export interface RenderOptions {
  /** Output sample rate. 44100 unless a caller has a reason. */
  sampleRate?: number;
  /** Master level, 0..1. Defaults to the app's own gentle 0.8. */
  volume?: number;
  /** How many times the song's order plays. One, by default. */
  repeats?: number;
  /** Seconds of silence after the last note, for tails. Chosen from the room. */
  tailSeconds?: number;
  /**
   * The soundfont a `wave font` channel should play, or null when none is open.
   *
   * Passed in for the same reason it is passed to the live engine: a font is not
   * part of the song, so an export has to be told which one is loaded. Without it
   * a song with a font channel exports its fallback rather than its font.
   */
  font?: SoundFont | null;
  /**
   * Render ONE channel — the stem option — or every one when it is left out.
   *
   * 1-based, like every channel number in the language and the menus, and
   * clamped rather than refused: a caller asking for channel 9 of a six-channel
   * song gets channel 6, which is what a list built from the song itself would
   * have asked for. See the file header for what a stem is and where it stops
   * being exactly the mix.
   */
  onlyTrack?: number;
  /**
   * Render only these BARS of the order — the loop region — or the whole song
   * when it is absent or null.
   *
   * One range for both exports, and the same one the language sets with
   * `export bars 8 to 15`, so a bounce named in a script and a bounce marked with
   * `L` in `F3` are the same thing by the time either gets here. The region is
   * fitted to the order by `bounceSteps` rather than refused, which is what lets
   * a script name a region above the `arrange` line that makes it reachable.
   */
  bounce?: BounceRange | null;
  /**
   * The recordings the app has loaded, so an exported channel that NAMES one
   * plays it instead of its fallback.
   *
   * The bank, not the `Sample` — every channel resolves its own name from the
   * song, and a name the bank does not hold falls back to the built-in one-shot,
   * which is exactly what the live engine does. An export made on a machine
   * without the file is therefore the same performance the app would have played
   * there, rather than a silent part.
   */
  samples?: SampleBank;
  /**
   * The TAKES that shape those recordings, so an export plays the same window.
   *
   * A take is app state — the trim and loop the RECORDER page put on a recording
   * — so it travels with the render for the bank's reason and one more: a bounce
   * that ignored a trim would be a file that does not sound like the app, which
   * is the one thing this module promises not to be. A recording with no take
   * behind it exports whole.
   */
  takes?: readonly Take[];
  /**
   * The kits of your own, so an export plays the drums the app played.
   *
   * The kit's OWN bargain, one scope over the sample one above: a song names its
   * kit and the four voices live in the app, so an export has to be told which
   * kits are loaded. A name this library does not hold falls back to the four
   * presets, exactly as the live engine does, so an export made on a machine
   * without the file is the performance that machine would have played.
   */
  kits?: readonly UserKit[];
}

/** A context that can render offline, or null where the browser has none. */
type OfflineCtor = new (channels: number, frames: number, sampleRate: number) => OfflineAudioContext;

function offlineCtor(): OfflineCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    OfflineAudioContext?: OfflineCtor;
    webkitOfflineAudioContext?: OfflineCtor;
  };
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}

/** True when this environment can render at all. The UI asks before offering it. */
export function canRender(): boolean {
  return offlineCtor() !== null;
}

/**
 * A song as samples, ready to encode.
 *
 * Two channels always, because the app has pan and a file should be able to hold
 * it. A song with nothing panned still comes out stereo — identical in both ears
 * — rather than as a mono file that plays differently in a player that upmixes.
 */
/**
 * When a step's notes land in the file's own clock, with the song's feel applied.
 *
 * Floored at zero, and that floor is the whole reason this is a function rather
 * than an expression in the loop: a `pushed` groove lands every note a hair
 * BEFORE its slot and a `human` one wobbles either way, while a file's clock
 * begins at zero — so the first slots of the order have nowhere to put an early
 * note. Web Audio does not read a negative time as "as soon as possible"; it
 * throws, which fails the entire export at once. A note that cannot be early
 * lands on the file's first moment instead, which is what live playback does
 * with the same feel, because a context's clock is never negative either.
 */
export function stepWhen(base: number, slotStart: number, feelDelay: number, rowSeconds: number): number {
  return Math.max(0, base + slotStart + feelDelay * rowSeconds);
}

export async function renderSongToPcm(song: Song, options: RenderOptions = {}): Promise<PcmAudio> {
  const Ctor = offlineCtor();
  if (!Ctor) throw new Error('this browser cannot render offline audio.');

  const sampleRate = options.sampleRate ?? 44100;
  const volume = options.volume ?? 0.8;
  const repeats = Math.max(1, Math.round(options.repeats ?? 1));

  // The takes that shape the bank, resolved once into a name-keyed lookup so
  // every note asks the same question the live engine does. A name the takes do
  // not have plays whole, which is what a bare `sample` line always meant.
  const windows = new Map<string, SampleWindow>();
  for (const take of options.takes ?? []) windows.set(take.name.trim().toLowerCase(), takeSampleWindow(take));
  const windowFor = (sample: { name: string } | null): SampleWindow | null =>
    sample ? windows.get(sample.name.trim().toLowerCase()) ?? null : null;

  const steps = songSteps(song);
  // The tempo of every step, from the model — one number per step whether the
  // song has a tempo map or one tempo, which is what lets the loop below be the
  // same either way. `tempos[step]` is the song's own tempo for a song with no
  // map, so nothing about a plain song changes here.
  const tempos = songTempos(song);
  const rowSecondsAt = (step: number): number => secondsPerRow(tempos[step] ?? song.bpm, song.rowsPerBeat, song.speed);

  // Where each step of the order begins, with swing applied — the same factor the
  // scheduler multiplies by, so a swung song exports swung — and with each
  // step's own length, so a song that slows down exports slower.
  const offsets: number[] = [];
  let at = 0;
  for (let step = 0; step < steps; step++) {
    offsets.push(at);
    at += rowSecondsAt(step) * stepTimeFactor(song.swing, step);
  }
  const orderSeconds = at;

  // The LOOP REGION, as a span of the song's own steps. The times below are all
  // measured from the region's first step, so an export of bars 8 to 15 is the
  // same file as those bars of the whole song would be — and the tempo, the swing
  // and every step's own length still come from the song's clock, because a bar's
  // length depends on the bars before it when a tempo map is sliding.
  const span = bounceSteps(song, options.bounce ?? null);
  const firstStep = span.first;
  const sliceStart = offsets[firstStep] ?? 0;
  const sliceEnd = span.last >= steps ? orderSeconds : (offsets[span.last] ?? orderSeconds);
  const sliceSeconds = Math.max(0, sliceEnd - sliceStart);

  // A wet song rings past its last note; a dry one only needs the note lengths.
  const wet = song.reverb > 0 || song.echo > 0;
  const tail = options.tailSeconds ?? (wet ? 3 : 1.5);
  const total = sliceSeconds * repeats + tail;

  const ctx = new Ctor(2, Math.max(1, Math.ceil(total * sampleRate)), sampleRate);

  const room: Room = buildRoom(ctx);
  room.setRoom(song.reverb, song.echo, true);
  room.setTempo(tempos[firstStep] ?? song.bpm, true);

  const master = ctx.createGain();
  master.gain.value = volume * 0.8;
  room.output.connect(master).connect(ctx.destination);

  // The mix's own effects, in the one place every channel's dry signal passes —
  // the same place the live engine puts them, and built by the same function, so
  // a mastered export is mastered by the code that mastered it while you
  // listened. Null when nothing is on, in which case the channels are wired
  // straight to the room exactly as they were before a mix could be shaped.
  const mix = buildMasterChain(ctx, song.master, room.input);

  const noiseBuffer = makeNoiseBuffer(ctx);
  const mutes = song.tracks.map((track) => track.muted);
  const levels = song.tracks.map((track) => track.level);
  // The LANES, and one bar's length to read them against — the same `patternRows`
  // the tempo map uses, because a bar in an arrangement is one pattern. Empty in a
  // song that moves nothing, which is what keeps every read below a length check
  // rather than a branch in the render loop.
  const lanes = song.automation;
  // And the GROUP faders, resolved once per channel — the same `busLevelFor` the
  // engine reads, so a group moved in the app is a group moved in the file. A song
  // with no buses resolves to full, which is the identity: the same samples this
  // renderer produced before buses existed.
  const busLevels = channelBusLevels(song.buses, song.tracks);
  const perBar = Math.max(1, patternRows(song));
  // Each channel's sends are the song's, read here rather than defaulted, so an
  // exported file puts exactly as much of each instrument in the room as the app
  // did — including the case where it puts none of it there.
  // Whether anybody ducks at all, read once: it decides the shape of every
  // channel's graph, exactly as it does live.
  const anyDucking = song.tracks.some((track) => track.duck > MIN_DUCK) || machineDucks(song.machine);
  // The stem option, as an index. `null` is the mix, which is what every caller
  // got before stems existed. When it is a channel, the other channels are still
  // BUILT and still scheduled exactly as they were — their ducks land on the
  // soloed channel, which is what makes a stem the part as it is heard rather
  // than the part in isolation — but their signal goes to a node nothing reads.
  const soloed = options.onlyTrack === undefined
    ? null
    : Math.max(0, Math.min(song.tracks.length - 1, Math.round(options.onlyTrack) - 1));
  // Only built when there is a stem to make, and never connected onward: a node
  // whose output reaches no destination is not rendered at all.
  const offstage = soloed === null
    ? null
    : { dry: ctx.createGain(), reverb: ctx.createGain(), echo: ctx.createGain() };
  const chains: ChannelChain[] = song.tracks.map((track, i) => buildChannelChain(
    ctx,
    {
      level: channelGain(i, levels, mutes, [], busLevels[i] ?? DEFAULT_LEVEL) / 100,
      pan: track.pan,
      verb: track.verb,
      echo: track.echo,
      // The channel's own effects, handed over whole: a `Track` IS the shape
      // the chain takes, so an exported file is driven and shaped by exactly the
      // graph the app played. An effect at 0 adds no node at all, which is what
      // keeps an old song's export the same file it always was.
      effects: track,
      // The same rule for the duck: a node exists only when somebody ducks, so an
      // export of a song that never ducked anything has no card in it at all.
      duck: anyDucking,
    },
    // The one place a stem differs from the mix: where this channel's output
    // goes, and which room its sends feed. Everything above is the same graph
    // either way, so a stem's own sound is the sound the app played.
    soloed === null || soloed === i ? (mix?.input ?? room.input) : offstage!.dry,
    soloed === null || soloed === i
      ? { reverb: room.reverbInput, echo: room.echoInput }
      : { reverb: offstage!.reverb, echo: offstage!.echo },
  ));

  // The DRUM MACHINE, when it is playing: one more channel strip summed into the
  // same mix before the master bus, built by the same function as every track —
  // so the machine's level, pan, sends, duck and effects are the machinery a
  // channel already had rather than a second audio path. A stem render puts it
  // offstage with everything else it does not name, because a machine is not one
  // of the song's numbered channels.
  const machine = machineActive(song.machine) ? song.machine : null;
  // The machine bar each song bar plays, from the song's form — the same
  // resolution the live engine is handed, so a section's `machine 2` renders the
  // bar the app plays rather than the one the plain `order` would name.
  const machineBars = machine ? machineBarsForSong(song) : [];
  const machineChain = machine === null
    ? null
    : buildChannelChain(
      ctx,
      {
        level: machineGain(machine, busLevelFor(song.buses, machine.bus)),
        pan: machine.pan,
        verb: machine.verb,
        echo: machine.echo,
        effects: machine.effects,
        duck: anyDucking,
        // Fed by the PADS, whose outputs are already panned stereo: hold both
        // channels so a pad's place between the speakers survives into the mix
        // instead of being folded to mono at this node.
        inputChannels: 2,
      },
      soloed === null ? (mix?.input ?? room.input) : offstage!.dry,
      soloed === null
        ? { reverb: room.reverbInput, echo: room.echoInput }
        : { reverb: offstage!.reverb, echo: offstage!.echo },
    );

  // Each PAD, on its own little strip — a fader and a place between the speakers —
  // feeding the machine's chain. So the machine is a two-level instrument: pads
  // into the machine, the machine into the mix, which is what a drum machine is. A
  // pad's level and pan are real nodes here rather than a number in the file, and
  // the machine's own level, pan, sends and effects still apply once, to the sum.
  const padChains: (ChannelChain | null)[] = machine === null || machineChain === null
    ? []
    : machine.pads.map((pad) => buildChannelChain(
      ctx,
      padStripOptions(pad),
      machineChain.input,
      soloed === null
        ? { reverb: room.reverbInput, echo: room.echoInput }
        : { reverb: offstage!.reverb, echo: offstage!.echo },
    ));

  // Where a song ROW falls in the file's own clock. `offsets` holds the start of
  // each step and the machine's hits land on rows the song's grid does not name —
  // half a row, sometimes, when the machine counts a different beat — so the two
  // boundaries around a row are interpolated rather than rounded. The result is
  // the same clock the tempo map and the swing already built.
  const timeAtRow = (row: number): number => {
    const step = Math.floor(row);
    const frac = row - step;
    const start = offsets[step] ?? orderSeconds;
    const end = step + 1 < steps ? (offsets[step + 1] ?? orderSeconds) : orderSeconds;
    return start + frac * (end - start);
  };

  // The pitch each channel last played, so a gliding note in the file slides out
  // of the same note it would slide out of live. One pass over the order, so the
  // state is walked in exactly the order a listener would hear it.
  const lastMidi: (number | null)[] = song.tracks.map(() => null);
  // How many notes each channel has played so far, which is what a round-robin
  // cycles through. Counted over the whole file — not restarted at each repeat of
  // the order — so an export varies continuously, the way a performance does, and
  // starts at variant 0 (the note as written) exactly like a live run.
  const hitCounts: number[] = song.tracks.map(() => 0);
  // The notes each channel is holding, oldest first, so a polyphonic channel
  // steals its voices in a file exactly as it does live. A monophonic channel
  // never touches this: its path is the one an export has always taken, which is
  // what keeps an old song's WAV byte-for-byte what it was.
  const heldByTrack: { graph: NoteGraph; startedAt: number; velocity: number }[][] =
    song.tracks.map(() => []);

  for (let repeat = 0; repeat < repeats; repeat++) {
    // Where this repeat of the region begins. Named apart from the per-note
    // `base` patch below, which is a different thing entirely.
    const repeatStart = repeat * sliceSeconds;
    for (let step = firstStep; step < span.last; step++) {
      const { pattern, row } = stepToSlot(song, step);
      const target = song.patterns[pattern];
      if (!target) continue;
      // The song's feel, exactly as the scheduler reads it: `offsets` is the GRID
      // (swing has already moved the slot boundaries) and the feel is how far
      // inside that slot the note actually lands. Two separate things on purpose
      // — swing changes where the slots ARE, a groove changes where the note is
      // INSIDE its slot, and keeping them apart is what lets both be tested.
      // The STEP's own moment, from the SONG's feel: what the tempo change and the
      // level lane below are scheduled against, because those belong to the bar
      // rather than to a part. Each NOTE then lands on its own channel's feel.
      const stepFeel = grooveFeel(song.groove, step, song.rowsPerBeat);
      const rowSeconds = rowSecondsAt(step);
      // `offsets[step]` is where this step begins in the SONG; the file begins at
      // the region's first step, so the two are subtracted once, here.
      const when = stepWhen(repeatStart, (offsets[step] ?? sliceStart) - sliceStart, stepFeel.delay, rowSeconds);
      // The echo follows the tempo map through the file, so a song that slows
      // down does not keep echoing at the speed it started at. Scheduled rather
      // than set, because an offline render is written before it is played.
      room.setTempoAt(tempos[step] ?? song.bpm, when);
      // A LEVEL lane is written once per STEP rather than once per note, because a
      // fade has to keep moving through the bars where nothing is playing — the
      // whole point of a fade-out is the silence at the end of it. Scheduled at the
      // step's own time, and through the same `channelGain` the app mixes with, so
      // mute and solo still win: a lane moves how LOUD a channel is, never whether
      // it is heard.
      if (lanes.length > 0) {
        for (let i = 0; i < chains.length; i++) {
          const moved = automatedLevel(lanes, i + 1, levels[i] ?? MAX_LEVEL, step, perBar);
          if (moved === null) continue;
          const withLane = levels.slice();
          withLane[i] = moved;
          chains[i]!.setLevel(
            channelGain(i, withLane, mutes, [], busLevels[i] ?? DEFAULT_LEVEL) / 100,
            when,
          );
        }
      }
      // The row's notes, and how many of them each channel has: a strum spreads
      // a chord evenly, so it needs the chord's size before it writes the first
      // note — the same count the live scheduler takes, so an export rolls the
      // same way the app did.
      const rowNoteList = rowNotes(target, row);
      const chordSize = new Map<number, number>();
      for (const note of rowNoteList) chordSize.set(note.track, (chordSize.get(note.track) ?? 0) + 1);
      const chordAt = new Map<number, number>();
      for (const note of rowNoteList) {
        const chain = chains[note.track];
        const track = song.tracks[note.track];
        if (!chain || !track) continue;
        // Where in its chord this note sits, and how far the channel's strum
        // pushes it — in STEPS, so it scales with this row's own length.
        const chordIndex = chordAt.get(note.track) ?? 0;
        chordAt.set(note.track, chordIndex + 1);
        const strumSeconds = (strumOffsets(chordSize.get(note.track) ?? 1, track.strum)[chordIndex] ?? 0) * rowSeconds;
        // This CHANNEL's feel, not just the song's: its own groove laid over the
        // song's, plus its own looseness. The scheduler asks the same function the
        // same way, which is what makes an export the song you heard.
        const noteFeel = trackFeel(track, song.groove, step, song.rowsPerBeat, note.track);
        const noteWhen = stepWhen(repeatStart, (offsets[step] ?? sliceStart) - sliceStart, noteFeel.delay, rowSeconds) + strumSeconds;
        const hold = Math.max(1, track.hold);
        // Read before the note is stored, so a repeated pitch does not "glide"
        // from itself and a channel changes note to note rather than to itself.
        const fromMidi = lastMidi[note.track] ?? null;
        // The WHOLE sound, voice plus stack: an export of a stacked channel has
        // to be the sound the app played, which is why this is the track's patch
        // rather than its first layer — and a lane that moves a knob rewrites ONLY
        // layer 1, so the layers stacked above it keep their own settings.
        const base = patchForTrack(track);
        // The voice this note plays is the CHANNEL's — or, on a drum hit, the
        // SONG's KIT, whatever the channel's own voice is. A lane moves whichever
        // one it is (`bright` on the kick's own brightness), which is what keeps a
        // kit channel and a melodic channel the same kind of thing to automate.
        //
        // One exception: a drum hit on a `wave font` channel plays the FONT'S
        // OWN KIT (see `prepareFontVoice`), which no `duty` can name — so the
        // channel's font voice is kept and the drum travels with the note, exactly
        // as the live engine does it.
        const fontDrum = note.drum !== null && firstLayer(base).wave === 'font';
        const voice = note.drum === null || fontDrum
          ? voiceOfPlainLayer(firstLayer(base))
          : kitVoice(song.kit, note.drum, options.kits ?? []);
        const moved = voice ? automatedVoice(voice, lanes, note.track + 1, step, perBar) : null;
        // `gate` shortens the note rather than shaping it, and at 0 the factor is
        // exactly 1 — so a channel nobody has gated exports at the length it
        // always had, to the sample. Two of them, because the channel and the mix
        // are two decisions about the same note, and one of them being off is a
        // factor of exactly one. A gate LANE stands in for the channel's own gate.
        const ownGate = automatedGate(lanes, note.track + 1, track.gate, step, perBar) ?? track.gate;
        // How far the channel's pitch wanders here: its own `drift`, or what a
        // lane moves it to — the same value the scheduler reads for this step, so
        // an export wobbles exactly where the app did.
        const drift = automatedDrift(lanes, note.track + 1, track.drift, step, perBar) ?? track.drift;
        const length = noteLength(rowSeconds, hold) * gateFactor(ownGate) * gateFactor(song.master.gate);
        const sounding = clampVelocity(note.velocity * noteFeel.gain);
        // How this HIT varies from the note as written — which hit of the channel's
        // round-robin, and how much its tone follows the force. The SAME rule the
        // scheduler asks, counted per NOTE in the same order, so an export varies
        // exactly where the app did; the counter walks the whole render rather than
        // a bar, because a performance does not start over at the chorus.
        const hitIndex = hitCounts[note.track] ?? 0;
        hitCounts[note.track] = hitIndex + 1;
        const tone = hitShift(track, hitIndex, sounding);
        const poly = clampPoly(track.poly);
        const held = heldByTrack[note.track]!;
        // One graph per HIT, from the same `articulationHits` the scheduler uses:
        // a `>` note slides instead of taking the channel's glide, and a `*3` note
        // is three notes tiling its own length. A note that says nothing produces
        // one hit at the start for the whole length at the channel's glide, which
        // is the single `buildNote` this loop used to be — `0` adds nothing and
        // `*1` multiplies by one.
        const hits = articulationHits(note.articulation, track.glide);
        hits.forEach((hit, index) => {
          const hitWhen = noteWhen + hit.at * length;
          const hitLength = length * hit.length;
          // A POLYPHONIC channel runs out of voices the same way it does live, on
          // the same rule, so an export contains the notes the app played. A
          // monophonic channel skips this entirely and keeps the offline behaviour
          // it has always had. Each HIT is a voice, which is what it is in the
          // graph: a stutter on a two-voice channel really does steal its own
          // first hit, exactly as it would live.
          if (poly > 1) {
            while (held.length >= poly) {
              const give = voiceToSteal(held);
              if (give < 0) break;
              releaseNote(held[give]!.graph, hitWhen);
              held.splice(give, 1);
            }
          }
          const graph = buildNote(
            ctx,
            // The lane moved the voice this note plays — the drum's or the
            // channel's — and either way it is LAYER 1 that is rebuilt, so a
            // stacked channel keeps its layers and a kit keeps its fader.
            moved ? patchWithVoice(base, moved) : base,
            note.midi,
            hitWhen,
            hitLength,
            chain.input,
            noiseBuffer,
            {
              velocity: sounding,
              glide: hit.glide,
              // Only the first hit is an arrival: a repeat is already at the
              // pitch, which is why the model answers glide 0 for it. The BEND
              // travels as the model hands it over — a scoop on the hit ON the
              // beat and a fall on the last one — so an export bends exactly where
              // the app does.
              fromMidi: index === 0 ? fromMidi : null,
              bend: hit.bend,
              tone,
              vibrato: track.vibrato,
              drift,
              // The master tape speed, the PITCH half: the clock above already
              // scales the TIME half, so an export at `speed 80` is the slower,
              // lower record the app played.
              speed: song.speed,
              // The file is rendered through the same tuning the app plays, so an
              // export is the song you heard rather than an equal-tempered one.
              tuning: tuningFor(song.tuning),
              tonic: song.key.tonic,
              font: options.font ?? null,
              // The font's own kit answers a drum hit; null leaves every other
              // note — and every drum on a synthesized channel — unchanged.
              drum: fontDrum ? note.drum : null,
              // The channel's own recording, resolved from the bank the export was
              // handed — the same lookup the engine made, so what you heard is
              // what you get.
              sample: sampleByName(options.samples ?? NO_SAMPLES, track.sample),
              sampleWindow: windowFor(sampleByName(options.samples ?? NO_SAMPLES, track.sample)),
            },
          );
          held.push({ graph, startedAt: hitWhen, velocity: sounding });
        });
        // The pump, written into the export at the note's own time: the same
        // arithmetic the live engine schedules, from the same function — and one
        // dip per note, because a stutter's hits tile their step without a gap.
        if (track.duck > MIN_DUCK) {
          chains.forEach((other, index) => {
            if (index !== note.track) other.scheduleDuck(track.duck, noteWhen, length);
          });
          // ...and the machine, which is one more part of the same mix.
          machineChain?.scheduleDuck(track.duck, noteWhen, length);
        }
        lastMidi[note.track] = note.midi;
      }

      // The machine's hits for this step, placed on the song's own clock. One
      // hit per pad per step, each a one-shot — a pad is a drum, not a held note,
      // so nothing here is kept to be released; the voice's own envelope ends it.
      if (machine !== null && machineChain !== null) {
        const machineHits = machineHitsInRange(machine, song.rowsPerBeat, step, step + 1, machineBars);
        if (machineHits.length > 0) {
          const stepSeconds = machineStepSeconds(machine, rowSeconds, song.rowsPerBeat);
          const machineLength = noteLength(stepSeconds, 1);
          for (const hit of machineHits) {
            const pad = machine.pads[hit.padIndex];
            if (!pad) continue;
            const hitWhen = Math.max(0, repeatStart + timeAtRow(hit.row) - sliceStart);
            // Into the pad's own strip, which applies its `level` as a fader and its
            // `pan` as a place in the field — so a hit carries only its velocity.
            const padOut = padChains[hit.padIndex]?.input ?? machineChain.input;
            buildNote(ctx, patchFromVoice(pad.voice), pad.pitch, hitWhen, machineLength, padOut, noiseBuffer, {
              velocity: clampVelocity(hit.velocity),
              speed: song.speed,
              tuning: tuningFor(song.tuning),
              tonic: song.key.tonic,
              font: options.font ?? null,
              // The pad's own recording, resolved from the same bank the channels
              // were, so a pad on a sample exports as the pad you heard — and a
              // name the bank lacks falls back to the built-in one-shot, exactly
              // as the live engine does.
              sample: sampleByName(options.samples ?? NO_SAMPLES, pad.sample),
              sampleWindow: windowFor(sampleByName(options.samples ?? NO_SAMPLES, pad.sample)),
            });
          }
          // The machine's own pump: one dip per step it hits, for the length of
          // that step, on every channel but the machine itself.
          if (machine.duck > MIN_DUCK) {
            const dipAt = Math.max(0, repeatStart + timeAtRow(step) - sliceStart);
            chains.forEach((other) => other.scheduleDuck(machine.duck, dipAt, machineLength));
          }
        }
      }
    }
  }

  const rendered = await ctx.startRendering();
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
    channels.push(rendered.getChannelData(channel).slice());
  }
  return { channels, sampleRate: rendered.sampleRate };
}

/**
 * Every channel of a song, rendered one at a time — a stem set.
 *
 * Sequential rather than parallel on purpose: an `OfflineAudioContext` each is
 * one whole song's worth of graph, and a stem set is the rare export that can
 * afford to take a moment. The caller decides WHICH channels (`stemPlan`) and
 * what the files are called; this hand-back is in the same order the numbers came
 * in, each with the channel it belongs to so the two can never drift apart.
 */
export async function renderStemsToPcm(
  song: Song,
  tracks: readonly number[],
  options: RenderOptions = {},
): Promise<{ track: number; pcm: PcmAudio }[]> {
  const stems: { track: number; pcm: PcmAudio }[] = [];
  for (const track of tracks) {
    stems.push({ track, pcm: await renderSongToPcm(song, { ...options, onlyTrack: track }) });
  }
  return stems;
}

/** How long a render of this song will be, in seconds. The UI shows it. */
export function renderSeconds(song: Song, options: RenderOptions = {}): number {
  const repeats = Math.max(1, Math.round(options.repeats ?? 1));
  const steps = songSteps(song);
  const tempos = songTempos(song);
  // Every step's own length, kept rather than summed, because a region's length
  // is where its last step ENDS minus where its first step BEGINS — and under a
  // tempo map those two are not `bars × seconds`, which is the whole reason the
  // region is measured on the song's clock instead of by multiplication.
  const offsets: number[] = [];
  let at = 0;
  for (let step = 0; step < steps; step++) {
    offsets.push(at);
    at += secondsPerRow(tempos[step] ?? song.bpm, song.rowsPerBeat, song.speed) * stepTimeFactor(song.swing, step);
  }
  const span = bounceSteps(song, options.bounce ?? null);
  const from = offsets[span.first] ?? 0;
  const to = span.last >= steps ? at : (offsets[span.last] ?? at);
  const wet = song.reverb > 0 || song.echo > 0;
  return (to - from) * repeats + (options.tailSeconds ?? (wet ? 3 : 1.5));
}
