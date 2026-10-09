/**
 * song — the data a song IS, plus the factories that build one.
 *
 * Phaser-free on purpose. The editor, the audio engine and the UI all read and
 * write these shapes, so there is exactly one definition of "a pattern" in the
 * app.
 *
 * The shape is deliberately a little wider than the MVP uses: a song has many
 * PATTERNS and many TRACKS, and a cell is an object rather than a bare number,
 * so an effect column, an instrument or a volume nibble can join a cell later
 * without rewriting every consumer.
 */

import { clampMidi, midiToNoteName } from './notes';
// A TYPE-only import, so the dependency runs one way at runtime: `automation.ts`
// reads this file's ranges and its bar clamping, and this file needs nothing
// from it but the shape of a lane. A cycle through `import type` is erased by
// the compiler and never reaches the module graph.
import type { AutomationLane } from './automation';
// The same one-way, type-only arrangement as the lanes above: `sections.ts`
// reads this file's pattern-range arithmetic, and this file needs only the shape
// of a section.
import type { Section } from './sections';
// And the same for the loop of chords the song hangs on: `progression.ts` reads
// this file's grid constants, so the dependency runs one way.
import type { Progression } from './progression';
// And once more for the LIVE page's scenes: `scenes.ts` reads this file's channel
// and pattern ranges, and this file needs only the shape of a scene.
import type { Scene } from './scenes';
import type { Bus } from './bus';
// And the same arrangement once more for the DRUM MACHINE: `machine.ts` reads
// this file's effect clamps, and this file needs only the shape of the machine —
// so the dependency runs one way and a type-only import is erased at build time.
import type { DrumMachine } from './machine';
// And the same one-way arrangement once more for the ARP page's dials: `arp.ts`
// reads this file's velocity default, and this file needs only the shape of the
// settings — so the dependency runs one way and a type-only import is erased at
// build time.
import type { ArpSettings } from './arp';
import { DEFAULT_STUTTER, tidyArticulation, type Articulation } from './articulation';
// The two ways a part stops sounding typed (see `variation.ts`): a hit that is
// not the last one, and a soft note that is darker as well as quieter. The
// arithmetic lives there and this file only stores the two settings.
import { DEFAULT_ROBIN, DEFAULT_TOUCH } from './variation';
import { DEFAULT_DRIFT } from './drift';
import { DEFAULT_SPEED, speedFactor } from './speed';
import type { Layer } from './instrument';
import { copyKey, DEFAULT_KEY, type SongKey } from './scale';
import { DEFAULT_SHAPE, type FilterShape } from './shape';
import { DEFAULT_TUNING, type TuningId } from './tuning';
import { voiceForTrack, type VoiceParams } from './voice';
// The kit table, one way: `drum.ts` knows the four drums and their pitches, and
// this file stores which one a step is. Nothing here re-lists them.
import { drumLabel, drumPitch, type DrumId } from './drum';
// The KIT: which four patches a `drum` hit plays. `kit.ts` names them; this file
// only stores which one the song chose, so nothing here re-lists the tables.
import { DEFAULT_KIT, type KitName } from './kit';

/** One step of one track. `note === null` means the step is empty. */
export interface Cell {
  /** MIDI note, or null for an empty step. */
  note: number | null;
  /**
   * The OTHER notes sounding in the same step — the rest of a chord written into
   * one channel. Empty for a cell that holds one note, which is every cell a song
   * written before this had.
   *
   * ── Why a chord is two fields and not one list ─────────────────────────────
   * A cell holding several notes could be `notes: number[]`, and that is what the
   * shape would be if this were being designed from nothing. It is written as the
   * FIRST note plus the rest instead, for one reason that outweighs the tidiness:
   * every reader in the app, the file and the tests already means "the note" by
   * `note` — the grid prints it, the export writes it, a saved file is read with
   * it — and leaving it as the first note is what makes a single-note cell EXACTLY
   * the cell it has always been, byte for byte and pixel for pixel. A chord is
   * then additive: the cell says the notes it always said, and gains the ones
   * above them.
   *
   * The two fields are one value, so they are written through `setCellNotes` and
   * read through `cellNotes` and nowhere else. The invariants those two keep are:
   * `extra` is empty when `note` is null (an empty step holds nothing), no note
   * appears twice, and every note is inside `MIDI_MIN..MIDI_MAX`.
   *
   * ── What it is for ─────────────────────────────────────────────────────────
   * "One channel is one voice" stopped being a law over TIME when `poly` landed:
   * a channel with `poly 4` rings four notes through each other. This is the same
   * law lifted over the NOTATION — a triad no longer costs three channels — and
   * the two halves only make sense together: a cell full of notes on a channel
   * that can only hold one is a chord the engine has to steal from itself.
   */
  extra: number[];
  /**
   * The DRUM this step is, when the cell is a hit rather than a note: `kick`,
   * `snare`, `hat` or `wind`, or null for a melodic step.
   *
   * This is the third thing a cell can be, after a note and a chord, and it is
   * what makes a drum kit ONE channel: `drum 0 4 kick` writes a kick on step 0 of
   * channel 4, `drum 2 4 snare` a snare on step 2, and the channel is the kit.
   * Before this, percussion was a property of the CHANNEL's voice, so a kick, a
   * snare and a hat were three channels that happened to be played at once.
   *
   * It is a NAME rather than a patch, because a drum is one of the four presets
   * in `drum.ts` and a cell that carried its own copy of a snare would be a snare
   * nobody could fix. `note` still holds the drum's own General MIDI pitch (36, 38,
   * 42, 44), so every reader that only knows about notes — the grid's own text,
   * the export, the file when it has no drum information — sees the drum's pitch
   * and is right about it. See `setCellDrum` for the invariant: a cell has either
   * a drum or a chord, never both.
   */
  drum: DrumId | null;
  /**
   * How hard this note is hit, 0..100 — its VELOCITY. See `DEFAULT_VELOCITY`.
   *
   * The first piece of per-NOTE expression: `hold`, `level` and `pan` all belong
   * to a channel, so every note on a channel is played the same way, and the only
   * way to accent one hit used to be to give it a channel of its own. Velocity is
   * the one number that can differ from note to note, which is what turns a
   * machine-gun hat into a groove and a flat melody into a phrase.
   *
   * It lives on the CELL because that is what it is a property of — one note, at
   * one step, on one channel — and because the cell was already an object for
   * exactly this reason (see the note at the top of this file). An empty step
   * keeps the default, so a song written before velocity existed loads unchanged
   * and plays identically.
   */
  velocity: number;
  /**
   * Whether this note SLIDES into its pitch from the previous one on its channel.
   *
   * `false` is the default and means the channel's own `glide` is the answer, so a
   * cell that says nothing is played exactly as it was before this existed.
   * `model/articulation.ts` holds the rule; this is the bit of it that lives on a
   * cell. Written `C-4>` in a cell, or `>` as a `note` line's extra value.
   */
  slide: boolean;
  /**
   * How many times this note is hit inside its own length: `1` for a plain note.
   *
   * Written `C-4*3` in a cell — a trap hat roll, a drum fill's last step, a
   * stutter chop — and it divides the note's length evenly, so the last hit still
   * ends where the note would have. `1` is the default, which is what keeps every
   * song written before articulation byte-identical.
   */
  stutter: number;
  /**
   * How many GRACE hits lead into this one: `0` for a plain note, `1` for a flam,
   * `2` for a drag.
   *
   * Written `kick!` or `kick!!` in a cell, or `flam`/`drag` on a `note`/`drum`
   * line. The graces sit just before the beat and the main hit stays on it, so a
   * rock snare reads as one hit with a soft front — which is most of what a flam
   * and a drag are. `0` is the default, which keeps every song written before this
   * byte-identical.
   */
  grace: number;
  /**
   * How far this note BENDS its own pitch, in semitones, signed: `+N` scoops up
   * into the note (`C-4^2`), `-N` falls away from it (`C-4v2`), and `0` — the
   * default — holds the pitch it was written at.
   *
   * The one pitch gesture that belongs to a single note rather than to a channel
   * or to a pair of notes, which is why it is a cell field: `glide` says how much
   * of a slide to make and `>` says this note takes the whole of it, but neither
   * can say "arrive from below" or "leave downward". `model/articulation.ts` holds
   * the rule and the audio paths write it as an automation on the oscillator's own
   * tuning, which is what the vibrato rides too.
   */
  bend: number;
}

/** A channel: a name, a SOUND, a note length and whether it is muted. */
export interface Track {
  name: string;
  muted: boolean;
  /**
   * What this channel sounds like: a waveform and seven knobs. See `voice.ts`
   * for the voices and the vocabulary — this field is where all of it lives, so
   * a channel's sound is one thing to set, save and undo rather than six.
   */
  voice: VoiceParams;
  /**
   * How many steps a note on this channel rings for. See `HOLD_STEPS`.
   *
   * This is the channel's NOTE LENGTH, and it lives on the channel rather than
   * on each cell because a channel is an instrument here: the pad holds and the
   * hat clicks, and that is a property of the pad, not of one of its notes. It
   * is also the cheapest way to make a written chord breathe — three channels
   * that hold a bar turn one keypress into a bar-long chord instead of a stab
   * that has to be re-stated on every step.
   */
  hold: number;
  /**
   * How loud this channel is in the mix, 0..100. See `LEVEL_STEP`.
   *
   * The counterpart of `hold`: where that says how LONG a channel's notes are,
   * this says how LOUD they are — and both belong to the channel, because in
   * this app a channel IS an instrument. It is the one control that makes a
   * bass sit under a melody rather than fight it, and it is a percentage rather
   * than decibels because a beginner can hear what `40%` means and cannot hear
   * what `-8dB` means.
   */
  level: number;
  /**
   * Where this channel sits between the speakers, -100 (hard left) to 100 (hard
   * right). See `PAN_STEP`.
   *
   * The third and last property of a channel, after what it sounds like and how
   * loud it is: where it IS. A song is mono until somebody says otherwise, which
   * is why the default is dead centre and why every file written before pan
   * existed keeps the mix it had.
   *
   * It is a PLACE and not a width — the number answers "which side", not "how
   * far apart" — because a place is one number a person can point at, and width
   * is a property of the sound rather than of the speaker it comes out of.
   */
  pan: number;
  /**
   * How much this channel SLIDES from one note into the next, 0..100. See
   * `DEFAULT_GLIDE`.
   *
   * The first of the two expression properties a channel owns: where velocity is
   * the force of ONE note, glide is how connected a channel's notes are. At 0
   * every note starts at its own pitch, which is what every song in the app did
   * before glide existed; raised, a new note begins at the pitch of the note
   * before it and RISES or FALLS into place — the scoop of a singer or a fretless
   * bass, and the reason a lead line can sound played rather than typed.
   *
   * It lives on the channel because it is about the JOIN between two notes, and a
   * channel is the only place two notes are ever related: a channel is
   * monophonic, so "the previous note" is always well defined.
   */
  glide: number;
  /**
   * How much this channel's pitch wobbles, 0..100. See `DEFAULT_VIBRATO`.
   *
   * The second expression property, and the counterpart of glide: glide is a
   * slide that ENDS, vibrato is a wobble that lasts. A little of it is what makes
   * a sustained note sound alive rather than held, which is why it is worth a
   * knob even though it changes no pitch you can write down — it is an ornament,
   * not a note, and the app treats it as a property of the instrument playing.
   */
  vibrato: number;
  /**
   * How far this channel's CHORD is rolled, in STEPS. See `DEFAULT_STRUM`.
   *
   * The third expression property, and the one about a chord rather than a note:
   * glide connects two notes, vibrato ornaments one, and strum decides whether the
   * notes of a chord land TOGETHER or roll — a rock rhythm strum, an emo tap, a
   * folk roll. At 0 every note of a chord lands on its step, which is what every
   * song in the app did before strum existed; raised, the notes are staggered so
   * the first starts on the step and the last arrives `strum` steps later.
   *
   * It lives on the channel for the same reason glide does: a channel is where a
   * chord is written (`C-4,E-4,G-4` in one cell), so how that chord is played is
   * a property of the channel's instrument, not of one cell.
   */
  strum: number;
  /**
   * How much successive HITS of this channel differ from each other, 0..100. See
   * `DEFAULT_ROBIN`.
   *
   * A person never hits twice the same way. At 0 every hit is the note that was
   * written — what every song in this app does today, and the default for exactly
   * that reason — and raised, the Nth hit walks a fixed four-step cycle of
   * variants that differ in pitch (a few cents), level (a few percent) and
   * brightness. It is the difference between a drum roll and a drum MACHINE: the
   * cheapest single "played, not typed" change in the plan, and the one that
   * makes a repeated figure sound like a part rather than a loop.
   *
   * It lives on the channel because it is about the INSTRUMENT: a snare hit twice
   * is a snare hit twice, whichever cells the two hits were written in — and it is
   * `model/variation.ts`'s arithmetic, shared by the live engine and the renderer,
   * so the same song varies the same way everywhere.
   */
  robin: number;
  /**
   * How much this channel's TIMBRE follows how hard a note is hit, 0..100. See
   * `DEFAULT_TOUCH`.
   *
   * Velocity has always been a level here, and a soft note played quietly is not
   * the whole truth: a soft hit is DARKER as well, because it excites fewer
   * overtones. At 0 velocity stays a level and nothing else; raised, a soft note
   * loses up to `MAX_TOUCH_BRIGHT` points of `bright`, and a note at full force is
   * exactly the note it always was, whatever the setting.
   */
  touch: number;
  /**
   * How much this channel's pitch WANDERS, 0..100. See `DEFAULT_DRIFT`.
   *
   * A worn transport does not turn at a constant speed, so a held note drifts
   * slowly (wow) with a faster tremor on top (flutter). The `tape` effect has
   * that too, but it arrives welded to saturation and hiss; this is the same
   * wobble on its own, on a channel that is not on tape at all. It is a plain
   * value rather than an effect node, which is what makes it a legal `automate`
   * destination — `automate 3 drift 10 90 bars 8 to 15` is a tape that TIRES.
   *
   * At 0 (the default) every note holds the pitch it was written at, exactly as
   * before this existed.
   */
  drift: number;
  /**
   * How much of this channel is fed to the master REVERB, 0..100. See
   * `DEFAULT_VERB`.
   *
   * A SEND, not a level: the reverb itself is the song's (`Song.reverb` says how
   * big the room is) and this says how much of THIS channel is standing in it. It
   * is the reason a room can be one place rather than eight — the kick stays dry
   * and close while the lead sits back in the hall — and it is the whole point of
   * a send bus, which is why it is a `Track` field rather than eight copies of
   * the reverb.
   */
  verb: number;
  /**
   * How much of this channel is fed to the master ECHO, 0..100. See
   * `DEFAULT_VERB`.
   *
   * The same idea on the delay: a snare that repeats while the bass does not is
   * one number per channel, and it is the difference between an echo effect on a
   * song and an echo that a couple of instruments are using.
   */
  echo: number;
  /**
   * The layers ABOVE this channel's voice: its STACK. Empty on every channel
   * that has never been layered, which is every channel of every song written
   * before stacks existed.
   *
   * ── Why the voice is not in here ────────────────────────────────────────────
   * `voice` IS layer 1 — see `patchForTrack` in `instrument.ts`. A stack is
   * therefore the layers 2..4, and a channel's whole sound is
   * `[voice, ...stack]`, capped at `MAX_LAYERS` (four). Keeping the voice exactly
   * where it always was is what makes this additive: every existing reader of
   * `track.voice` — the F4 menu, a saved sound, the file format, the engine's
   * one-layer shortcut — keeps working untouched, and a channel with an empty
   * stack renders through the same arithmetic it always did.
   *
   * ── Why a list and not four slots ───────────────────────────────────────────
   * A stack has no holes: `layer 2` and `layer 3` are the first and second
   * layers above the voice, and removing the first shifts the second down. That
   * is the same shape as the song's ORDER and its channel list, so "remove one"
   * already means one thing in this app.
   *
   * A NEW layer starts as a copy of the one below it, so `+ LAYER` (or
   * `layer 1 2`) hands you something you can hear immediately and shape — the
   * supersaw is three of the same saw a few cents apart, not three sounds built
   * from nothing.
   */
  stack: Layer[];
  /**
   * The channel's nine EFFECTS, each 0..100 with 0 meaning OFF. See
   * `TRACK_EFFECTS` for what each one does to what you hear.
   *
   * Nine plain numbers rather than one nested object, because they are nine more
   * properties of a channel exactly like `level` and `pan` are: the script writes
   * them on the `track` line, a saved song carries them under its channel, and
   * the menus show them as rows. At 0 — the default, and what every file written
   * before this reads as — the graph is the graph it always was.
   */
  drive: number;
  cab: number;
  tape: number;
  radio: number;
  vinyl: number;
  chorus: number;
  crush: number;
  punch: number;
  /** Leans the channel toward the top: see `TRACK_EFFECTS`. Off is flat. */
  tilt: number;
  /** Shortens every note on the channel: see `gateFactor`. Off is the whole note. */
  gate: number;
  /**
   * How far this channel pushes the REST of the mix down while it plays, 0..100.
   *
   * The pump: a kick that makes the bass and the pads step back every time it
   * hits, so the low end never fights and the record breathes in time. `0` is
   * none — the default, and what every file written before this reads as — and
   * `100` takes the other channels all the way out for the length of the note.
   *
   * A plain number on the channel that DUCKS rather than a reference from the
   * channel being ducked, which is the shape the arithmetic actually has: the
   * hit is the event, everyone else is the answer, and "what does this duck?"
   * has exactly one honest answer — everything else. That also makes it one
   * number to write, one key to save, one bar to drag, and no graph at all until
   * somebody asks for it. A surgical duck ("the kick, but only the bass") is an
   * automation job, and automation is a later phase than this knob.
   */
  duck: number;
  /**
   * This channel's own FEEL, or `null` to follow the song's (`Song.groove`).
   *
   * `groove` is one number for the whole song, which is right until it is not: a
   * straight song with one shuffled hat, or a laid-back bass under a pushed lead,
   * is a pocket rather than a mistake. A feel belongs to the PART because that is
   * how it is played — one player leans and another does not — so the channel is
   * where it is written, exactly the way glide and vibrato are.
   *
   * `null` rather than `'straight'` for "no opinion", because the two are not the
   * same thing: `'straight'` says this part is straight whatever the song does,
   * and `null` says it does whatever the song does. A channel with no override is
   * every channel of every song written before this existed.
   */
  groove: GrooveId | null;
  /**
   * How much this channel is PLAYED rather than typed, 0..100.
   *
   * The named `human` feel already exists for the whole song, at a fixed depth;
   * this is the same wobble with an amount, on one channel — the difference
   * between a machine part and a part somebody played, which is the whole sound of
   * lo-fi, live jazz and most singer-songwriter records.
   *
   * The wobble is a seeded hash of the step AND the channel, so it is the SAME
   * wobble every time the bar comes round and an exported file is the file you
   * heard, and two humanised parts do not wobble in lockstep. At 0 it adds
   * exactly nothing, which is why a song that never mentions it is unchanged.
   */
  humanize: number;
  /**
   * How many notes this channel may hold AT ONCE. `1` is monophonic.
   *
   * ── Why this is the biggest ergonomic tax the notation had ──────────────────
   * "One channel is one voice" is the line the whole language was built on, and it
   * is why a triad costs three channels and a piano piece costs eight. A channel is
   * an INSTRUMENT here, and an instrument that can only play one note is not a
   * piano, an organ, or a pad — it is a melody line. `track 3 poly 6` lets the
   * chord tool write into one channel, lets a cell hold a real chord, and turns a
   * pedal tone into one long note under moving lines instead of a channel spent on
   * one held pitch.
   *
   * ── What happens when it runs out ───────────────────────────────────────────
   * Voices are STOLEN, and the rule is the one a real synth uses: the oldest note
   * goes first, and among notes that began together the QUIETEST, because the note
   * least missed is the one that has already been heard longest and is hardest to
   * pick out of the mix. `voiceToSteal` is that rule, written once and tested, so
   * playback and an export cannot disagree about which note gave way.
   *
   * `1` is the default and the old behaviour exactly: a new note takes the one
   * still ringing, so a channel nobody has widened is played precisely as it was.
   */
  poly: number;
  /**
   * Which part of the sound this channel's filter lets through.
   *
   * `round` — a low-pass — is what every note in every song here has always
   * sounded like, so it is the default and the field is INERT: a channel nobody
   * shapes builds the same filter it built before this existed. `sharp` is a
   * high-pass (the bottom goes), `nasal` a band-pass (only what is near the
   * cutoff survives) and `hollow` a notch (the middle is scooped out).
   *
   * It belongs to the CHANNEL rather than to a layer or to one note because
   * `bright` does: a piano's filter is a footnote to the piano, not to the chord
   * being played on it. `shape.ts` holds the four and what each is for.
   */
  shape: FilterShape;
  /**
   * The mix GROUP this channel belongs to, or `null` for the band itself.
   *
   * A bus is one fader over several channels (`bus DRUMS 70`, then `track 1 bus
   * DRUMS`), and it is stored as a NAME rather than an index for the reason a
   * section is: a name survives a channel being added in the middle, and the line
   * that joins a group is readable in a file. `model/bus.ts` holds the rule.
   *
   * `null` is the default, and it means exactly what every song meant before
   * buses existed: the channel's own fader is the only thing over it.
   */
  bus: string | null;
  /**
   * The NAME of a recording of yours this channel plays, or `null` for none.
   *
   * A REFERENCE, never the audio: a song file is text, and a sample is
   * megabytes, so `sample CLOPSH` names a file the APP holds and the song stays a
   * few kilobytes. See `model/sample.ts` for the bank and `audio/wav.ts` for the
   * reader.
   *
   * `null` is the default, and the fallback is the point of the design: a song
   * naming a sample you do not have plays the built-in one-shot its `duty`
   * selects, in every one of its `sample` layers. A missing recording is a
   * missing flavour and never a missing note.
   */
  sample: string | null;
}

// --- per-channel expression: glide and vibrato ------------------------------

/**
 * How far a channel may slide between notes, as a percentage of a note's length.
 *
 * A percentage of the NOTE rather than a time in milliseconds, for the same
 * reason swing and echo are: a slide `30` should keep meaning the same thing at
 * 90 BPM and at 160, and a slide measured in seconds stops agreeing with the
 * music the moment somebody changes the tempo.
 */
export const MIN_GLIDE = 0;
/** The longest slide the control offers: the whole of a note. */
export const MAX_GLIDE = 100;
/**
 * No slide, and the default.
 *
 * Zero, and not "a tasteful 10", for the reason every other default here is
 * zero: the app has several hundred songs in it, all of which play every note at
 * its own pitch, and a default slide would quietly re-voice every one of them.
 */
export const DEFAULT_GLIDE = MIN_GLIDE;
/** How far one nudge moves a glide or vibrato amount. Same size as a level. */
export const EXPRESSION_STEP = 10;

/** Clamp a glide amount into the range the control offers. */
export function clampGlide(amount: number): number {
  if (!Number.isFinite(amount)) return DEFAULT_GLIDE;
  return Math.max(MIN_GLIDE, Math.min(MAX_GLIDE, Math.round(amount)));
}

/** A glide as the app writes it: `40%`, or `OFF` at zero. */
export function glideLabel(amount: number): string {
  return clampGlide(amount) === MIN_GLIDE ? 'OFF' : `${clampGlide(amount)}%`;
}

/**
 * How much a channel's pitch wobbles, 0..100.
 *
 * A percentage rather than a depth in cents because a percentage is what a person
 * can hear and judge by ear, and because it keeps the whole app speaking one
 * arithmetic — every expression control from a channel's level to a note's
 * velocity is a number out of a hundred. The depth it maps to, and the rate, are
 * the engine's business (`VIBRATO_CENTS` / `VIBRATO_HZ` in `audio/synth.ts`).
 */
export const MIN_VIBRATO = 0;
/** The widest wobble the control offers. */
export const MAX_VIBRATO = 100;
/** No wobble, and the default — again so no existing song is re-voiced. */
export const DEFAULT_VIBRATO = MIN_VIBRATO;

/** Clamp a vibrato amount into the range the control offers. */
export function clampVibrato(amount: number): number {
  if (!Number.isFinite(amount)) return DEFAULT_VIBRATO;
  return Math.max(MIN_VIBRATO, Math.min(MAX_VIBRATO, Math.round(amount)));
}

/** A vibrato as the app writes it: `30%`, or `OFF` at zero. */
export function vibratoLabel(amount: number): string {
  return clampVibrato(amount) === MIN_VIBRATO ? 'OFF' : `${clampVibrato(amount)}%`;
}

/**
 * How far a channel's chord is rolled, in STEPS.
 *
 * A count of STEPS rather than a time in milliseconds, for the same reason glide
 * and swing are percentages: `strum 1` must keep meaning the same gesture at 90
 * BPM and at 160. The ceiling is small on purpose — the span a chord is rolled
 * across is a flourish inside a beat or two, not an arpeggio, which the language
 * already writes as notes on separate rows.
 */
export const MIN_STRUM = 0;
/** The widest roll the control offers: the chord spread across this many steps. */
export const MAX_STRUM = 4;
/**
 * Notes land together, and the default.
 *
 * Zero, not "a tasteful roll", for the rule every default here follows: the app
 * has hundreds of songs whose chords are blocks, and a default strum would
 * re-voice every one of them.
 */
export const DEFAULT_STRUM = MIN_STRUM;
/** How far one nudge moves a strum. One step, so the control reads like a count. */
export const STRUM_STEP = 1;

/** Clamp a strum span into the range the control offers. */
export function clampStrum(amount: number): number {
  if (!Number.isFinite(amount)) return DEFAULT_STRUM;
  return Math.max(MIN_STRUM, Math.min(MAX_STRUM, Math.round(amount)));
}

/** A strum as the app writes it: `2 steps`, or `OFF` at zero. */
export function strumLabel(amount: number): string {
  const value = clampStrum(amount);
  if (value === MIN_STRUM) return 'OFF';
  return `${value} step${value === 1 ? '' : 's'}`;
}

/**
 * Where each note of a chord FALLS when a channel strums, in the order the notes
 * are written, as fractions of one STEP.
 *
 * The one rule the scheduler, the renderer and the MIDI writer all share, so a
 * strum sounds the same live, in an export and in a `.mid`. The first note is on
 * the step and the last arrives `strum` steps later, so a chord of `count` notes
 * is spread evenly across the span; a single note, or a channel at 0, answers with
 * zeros — the block it always was, in every path.
 */
export function strumOffsets(count: number, strum: number): number[] {
  const span = clampStrum(strum);
  if (span <= MIN_STRUM || count <= 1) return new Array<number>(Math.max(0, count)).fill(0);
  const gaps = count - 1;
  return Array.from({ length: count }, (_, index) => (index / gaps) * span);
}

// --- channel effects: nine knobs on the channel, not on the sound ----------------

/**
 * The nine one-knob effects a CHANNEL carries, by id.
 *
 * ── Why they live on the channel ─────────────────────────────────────────────
 * Every one of these is about a channel's PLACE in a mix rather than about the
 * instrument itself: the same pad wants no drive under a singer and a lot of it
 * under a guitar solo, and the voice that plays it is the same voice. Putting
 * them on the track is also what makes them cheap to use — five channels of the
 * same sound can each be shaped without saving five sounds — and it is the
 * shape the language already had for `level`, `pan`, `glide`, `vibrato` and the
 * two sends.
 *
 * ── The rule they all obey ──────────────────────────────────────────────────
 * Each is 0..100 with **two named ends, and 0 means OFF** — not "a little",
 * not "neutral": off. The engine and the offline renderer build NO node at all
 * for an effect at 0, so a channel nobody has touched goes through exactly the
 * graph it went through before this existed, sample for sample. That is what
 * makes seven new knobs safe to add to a few hundred existing songs.
 */
export type TrackEffectId =
  | 'drive' | 'chorus' | 'crush' | 'punch' | 'tilt' | 'gate' | 'cab' | 'tape' | 'radio' | 'vinyl';

export interface TrackEffectInfo {
  id: TrackEffectId;
  /** How the menus write it. Upper case, because every menu label here is. */
  label: string;
  /** What 0 means: the off end, in one word. */
  low: string;
  /** What 100 means. */
  high: string;
  /** One line, in the same voice as a voice's or a layer field's blurb. */
  blurb: string;
  /**
   * Which music reaches for it, in the same one-line voice as a blurb.
   *
   * The other half of the same answer, and the reason it is in the MODEL rather
   * than in a chapter of the docs: a beginner who has never heard the word
   * "drive" is asking "what is this FOR", and a genre is the shortest honest
   * answer there is. It travels from here into the catalog (`F6`), the `F7`
   * screen and the published capability manifest, so all three say it once.
   */
  reach: string;
}

/**
 * The effects, in the order the menus show them: the four that shape a SOUND
 * first (what it is made of — for `cab` the box it comes out of, for `tape` the
 * machine it was printed on, for `radio` the line it came down), then the two that
 * shape a MIX (where it sits), then the one that shapes a PART (how long its notes
 * are).
 *
 * `cab`, `tape`, `radio` and `vinyl` are fourth through seventh rather than last
 * because they belong to the sound family: the same kind of decision as `drive`,
 * further down the signal path, and both menus draw them in the column that holds
 * the sound-shaping effects — which is why that column is six wide and this list
 * splits there, and why the split is a FAMILY rather than a number.
 *
 * `tape` is the FIRST effect here that is not a filter, a shaper or a compressor.
 * It is a machine: a soft saturation, a transport that wanders, and a hiss bed,
 * all behind one number, because that is how a person says it — "put this on tape".
 * The three parts are one knob rather than three for the same reason `master` is
 * one line: a tape you have to assemble is not the artifact anybody is imitating.
 */
export const TRACK_EFFECTS: readonly TrackEffectInfo[] = [
  {
    id: 'drive',
    label: 'DRIVE',
    low: 'clean',
    high: 'crushed',
    blurb: 'push the channel until it bites: a fuzzed guitar, a squelching 303, a rock bass',
    reach: 'rock and metal guitars, an acid bass, a lo-fi drum bus, anything that must cut',
  },
  {
    id: 'crush',
    label: 'CRUSH',
    low: 'pure',
    high: 'gritty',
    blurb: 'throw away the fine detail of the sound: chip grit, lo-fi dust, a telephone vocal',
    reach: 'lo-fi, chiptune revival, industrial, a phone-voice intro, any deliberate dirt',
  },
  {
    id: 'cab',
    label: 'CAB',
    low: 'open',
    high: 'boxed',
    blurb: 'put a speaker box round the channel: the top closes and the middle pushes back',
    reach: 'rock and metal guitars, a shoegaze wall, a lo-fi drum bus, any part that should sound like an amp',
  },
  {
    id: 'tape',
    label: 'TAPE',
    low: 'clean',
    high: 'worn',
    blurb: 'print the channel onto tape: soft saturation, a transport that wanders, and a hiss bed',
    reach: 'lo-fi and chillhop, vaporwave, a tape-saturated rock mix, any part that should sound old',
  },
  {
    id: 'radio',
    label: 'RADIO',
    low: 'full',
    high: 'tinny',
    blurb: 'narrow the channel down to a telephone: the bottom and the top go, and the rest is coarse',
    reach: 'a telephone or AM voice, a lo-fi intro, a sampled hook, any part that should arrive through a speaker',
  },
  {
    id: 'vinyl',
    label: 'VINYL',
    low: 'silent',
    high: 'crackling',
    blurb: 'lay a record under the channel: a quiet surface hiss and the crackle of dust and scratches',
    reach: 'lo-fi and chillhop, vaporwave, a sampled hook, any part that should sound like it came off a record',
  },
  {
    id: 'chorus',
    label: 'CHORUS',
    low: 'dry',
    high: 'wide',
    blurb: 'a drifting copy of the channel beside itself: one synth that sounds like two, an 80s pad',
    reach: 'synthwave, dream pop, funk guitar, a ballad pad, any lead that should sound wide',
  },
  {
    id: 'punch',
    label: 'PUNCH',
    low: 'flat',
    high: 'snappy',
    blurb: 'hold the peaks down so the hits jump out: a house kick, a funk bass, anything that must cut through',
    reach: 'house and techno drums, funk bass, pop vocals, a rock kick, anything that must punch',
  },
  {
    id: 'tilt',
    label: 'TILT',
    low: 'flat',
    high: 'bright',
    blurb: 'lean the channel toward the top: thin a pad to make room, or lift a hat without changing its sound',
    reach: 'pop and EDM mixes, a hat that must sit above the drums, a pad that must step back',
  },
  {
    id: 'gate',
    label: 'GATE',
    low: 'open',
    high: 'tight',
    blurb: 'shorten every note on the channel: staccato strings, a choppy pad, a bass that stops dead',
    reach: 'funk and disco rhythm, staccato strings, a house stab, a tight electronic bass',
  },
];

/** Look one up by id, for the menus, the catalog and a file reader. */
export const TRACK_EFFECT_BY_ID: Readonly<Record<TrackEffectId, TrackEffectInfo>> = Object.fromEntries(
  TRACK_EFFECTS.map((effect) => [effect.id, effect]),
) as Record<TrackEffectId, TrackEffectInfo>;

/**
 * One channel's eight effect amounts, by id.
 *
 * The same shape a `Track` already has for these six names, so the engine, the
 * chain and a file reader can be handed the song's own channels — or one
 * channel — without a copy, and so "the effects of a channel" is a thing with a
 * name rather than six arguments.
 */
export type ChannelEffects = Record<TrackEffectId, number>;

/**
 * Every effect off: what a channel that has never been shaped carries.
 *
 * The keys are in `TRACK_EFFECTS` order rather than the order the six original
 * ones happened to be added in, because the ORDER of this object is observable:
 * a patch's one-line description names the effects that are on by walking it, so
 * `drive + cab + tilt + gate on` reads in the order the menus draw them.
 */
export const NO_EFFECTS: ChannelEffects = {
  drive: 0, crush: 0, cab: 0, tape: 0, radio: 0, vinyl: 0, chorus: 0, punch: 0, tilt: 0, gate: 0,
};

/** Every effect in a set, clamped — the one place a whole set is fixed up. */
export function clampEffects(effects: Partial<ChannelEffects> | undefined): ChannelEffects {
  return {
    drive: clampEffect(effects?.drive ?? DEFAULT_EFFECT),
    crush: clampEffect(effects?.crush ?? DEFAULT_EFFECT),
    cab: clampEffect(effects?.cab ?? DEFAULT_EFFECT),
    tape: clampEffect(effects?.tape ?? DEFAULT_EFFECT),
    radio: clampEffect(effects?.radio ?? DEFAULT_EFFECT),
    vinyl: clampEffect(effects?.vinyl ?? DEFAULT_EFFECT),
    chorus: clampEffect(effects?.chorus ?? DEFAULT_EFFECT),
    punch: clampEffect(effects?.punch ?? DEFAULT_EFFECT),
    tilt: clampEffect(effects?.tilt ?? DEFAULT_EFFECT),
    gate: clampEffect(effects?.gate ?? DEFAULT_EFFECT),
  };
}

/** True when nothing is on: the check that guards the inert path everywhere. */
export function isEffectOff(amount: number): boolean {
  return clampEffect(amount) === MIN_EFFECT;
}

/** Off. The bottom of every effect's range. */
export const MIN_EFFECT = 0;
/** As much of it as the app will do. */
export const MAX_EFFECT = 100;
/** What a channel plays with when nobody says otherwise: everything off. */
export const DEFAULT_EFFECT = MIN_EFFECT;
/** How far one nudge moves an effect. Same size as a level, and for the same reason. */
export const EFFECT_STEP = 10;

/**
 * Clamp an effect amount into the range every effect shares.
 *
 * A NaN is the only value with no direction to clamp in, and it becomes OFF —
 * not full — because off is what every song in the app already is, so a stray
 * number cannot mark one channel as different. An infinity does have a
 * direction, and clamps to the end it points at.
 */
export function clampEffect(amount: number): number {
  if (Number.isNaN(amount)) return DEFAULT_EFFECT;
  return Math.max(MIN_EFFECT, Math.min(MAX_EFFECT, Math.round(amount)));
}

/** An effect as the app writes it: `40%`, or `OFF` at zero. */
export function effectLabel(amount: number): string {
  const at = clampEffect(amount);
  return at === MIN_EFFECT ? 'OFF' : `${at}%`;
}

/**
 * Move an effect by `steps` nudges, snapping onto the grid first.
 *
 * The same rule as `stepLevel` and `stepSend`: the snap is toward the direction
 * of travel, and a value already on a stop steps off it, so pressing a key after
 * a click is one audible move rather than two.
 */
export function stepEffect(amount: number, steps: number): number {
  const at = clampEffect(amount);
  const up = steps > 0;
  let stop = up
    ? Math.ceil(at / EFFECT_STEP) * EFFECT_STEP
    : Math.floor(at / EFFECT_STEP) * EFFECT_STEP;
  if (stop === at) stop = up ? at + EFFECT_STEP : at - EFFECT_STEP;
  const rest = (Math.abs(Math.round(steps)) - 1) * EFFECT_STEP;
  return clampEffect(up ? stop + rest : stop - rest);
}

/**
 * The shortest a gated note can be, as a fraction of what was written.
 *
 * A quarter, and not a sliver: past this a note stops being short and starts
 * being a click, which is a different sound from the one the knob promises.
 */
export const MIN_GATE_FRACTION = 0.25;

/**
 * How much of its written length a note on this channel actually sounds.
 *
 * `GATE` is the one effect that is arithmetic rather than a node: a gate in the
 * usual sense (an envelope follower that closes on anything quiet) is not
 * something the browser's audio graph can express, so this is the honest version
 * of "stops dead" — the note is still there, and it is shorter. A FRACTION of
 * the note and not a duration, so a gated channel keeps its shape when the tempo
 * changes, exactly like `hold` does.
 *
 * `0` returns exactly 1, which is what makes it inert: the engine and the
 * renderer multiply the same length they always used by it, and one is one.
 */
export function gateFactor(gate: number): number {
  return 1 - (clampEffect(gate) / MAX_EFFECT) * (1 - MIN_GATE_FRACTION);
}

// --- the duck: one channel pushing the rest of the mix down ------------------

/**
 * How far a channel may push the rest of the mix down, 0..100. See `Track.duck`.
 *
 * A percentage of the OTHERS rather than a ratio in decibels, for the reason
 * every other number here is a percentage: `60` is a thing a person can picture
 * without knowing what a compressor is, and `1 - duck / 100` is a gain the
 * arithmetic and the screen can both agree on.
 */
export const MIN_DUCK = 0;
/** Everything else out: the full pump. */
export const MAX_DUCK = 100;
/**
 * Nobody ducks anybody, and the default.
 *
 * Zero for the reason every other default is: a song written before this knob
 * existed must play, and save, exactly as it did.
 */
export const DEFAULT_DUCK = MIN_DUCK;
/** How far one nudge moves a duck amount. Same size as a level, same reason. */
export const DUCK_STEP = 10;

/**
 * Clamp a duck amount into the range the control offers.
 *
 * A value that is not a number at all reads as OFF, the way every other broken
 * number in this app does; an infinity clamps to the end it points at, the way
 * the effects' `clampEffect` does. The distinction matters because a duck of
 * "as much as possible" is a thing a person can mean, and off is a thing a
 * corrupt field can mean. Neither reaches the graph as anything but a number.
 */
export function clampDuck(amount: number): number {
  if (Number.isNaN(amount)) return DEFAULT_DUCK;
  return Math.max(MIN_DUCK, Math.min(MAX_DUCK, Math.round(amount)));
}

/** A duck as the app writes it: `40%`, or `OFF` at zero. */
export function duckLabel(amount: number): string {
  const at = clampDuck(amount);
  return at === MIN_DUCK ? 'OFF' : `${at}%`;
}

/**
 * How quiet the rest of the mix goes under one hit, as a gain.
 *
 * `0` returns exactly 1, which is what makes it inert: the engine and the
 * renderer schedule the same dip they always did — none — and one is one.
 */
export function duckGain(amount: number): number {
  return 1 - clampDuck(amount) / MAX_DUCK;
}

/**
 * Move a duck amount one or more nudges, without skipping a stop.
 *
 * The same shape as `stepLevel` and `stepSend`, down to the "already on a stop"
 * case: a value between two stops lands on the next one rather than drifting by
 * one, so a duck set by a click and then nudged behaves like one set by a key.
 * It stops at the ends; a control that wants to cycle says so itself.
 */
export function stepDuck(amount: number, steps: number): number {
  const at = clampDuck(amount);
  const up = steps > 0;
  let stop = up
    ? Math.ceil(at / DUCK_STEP) * DUCK_STEP
    : Math.floor(at / DUCK_STEP) * DUCK_STEP;
  if (stop === at) stop = up ? at + DUCK_STEP : at - DUCK_STEP;
  const rest = (Math.abs(Math.round(steps)) - 1) * DUCK_STEP;
  return clampDuck(up ? stop + rest : stop - rest);
}

/**
 * The duck, described once, the way an effect is.
 *
 * One control rather than a table, because there is one of it — but the same
 * five facts, and for the same reason: a label, both ends of the range, what it
 * is for, and which music reaches for it. `F5`'s heading, the catalog's `duck`
 * block and its entry in the browser all read these, so the sentence a person
 * sees when they hover the control is written here or nowhere.
 */
export interface TrackDuckInfo {
  id: 'duck';
  /** How the menus write it. Upper case, because every menu label here is. */
  label: string;
  /** What 0 means: the off end, in one word. */
  low: string;
  /** What 100 means. */
  high: string;
  /** One line, in the same voice as a voice's or an effect's blurb. */
  blurb: string;
  /** Which music reaches for it, in the same one-line voice as an effect's. */
  reach: string;
}

export const TRACK_DUCK: TrackDuckInfo = {
  id: 'duck',
  label: 'DUCK',
  low: 'off',
  high: 'full pump',
  blurb: 'this channel tells the REST of the mix to step back while it plays: the pump under a four-on-the-floor kick',
  reach: 'house and techno (a kick against the bass), pop and R&B (a lead vocal over the bed), hip hop (a voice over everything)',
};

/**
 * The note lengths a channel can hold, in steps, as the control cycles them.
 *
 * All powers of two because they are the lengths music is counted in: one step
 * is a click, four is a beat at the default grid, sixteen is a whole bar. A
 * channel on `2` doubles the length of everything written on it, which is the
 * one knob a beginner reaches for first.
 */
export const HOLD_STEPS: readonly number[] = [1, 2, 4, 8, 16];
/** The shortest a note can be: one step. */
export const MIN_HOLD = 1;
/** The longest: a bar of the default grid. */
export const MAX_HOLD = 16;
/** What a channel does when nobody says otherwise: one note per step. */
export const DEFAULT_HOLD = 1;

/** Clamp a note length into the range the control offers. */
export function clampHold(steps: number): number {
  return Math.max(MIN_HOLD, Math.min(MAX_HOLD, Math.round(steps)));
}

/**
 * How loud a channel may be, as a percentage of full level.
 *
 * Full scale is the ceiling on purpose. The engine already keeps every voice
 * well under clipping on its own (`VOICE_PEAK`) and the master fader is a plain
 * multiplier over that, so a channel at 100% is loud but never the thing that
 * makes a song crackle — which means the control can offer its whole useful
 * range instead of hiding a headroom margin the user would have to know about.
 */
export const MIN_LEVEL = 0;
/** The loudest a channel goes. */
export const MAX_LEVEL = 100;
/** What a channel plays at when nobody says otherwise: full. */
export const DEFAULT_LEVEL = 100;
/**
 * How far one nudge moves a channel's level.
 *
 * Ten percent, the same size as the voice knobs' step, and for the same reason:
 * a nudge has to be big enough to HEAR, or balancing five channels becomes a
 * hundred keypresses. Because it is ten, the eleven stops it can reach are the
 * ones a person already counts in, and 0 and 100 are always one press away.
 */
export const LEVEL_STEP = 10;

/** Clamp a level into the range the control offers. */
export function clampLevel(level: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level)));
}

/**
 * Move a level by `steps` nudges, snapping a stray value onto the grid first.
 *
 * Snapping matters because a level can arrive from anywhere — a file, a script,
 * a click that landed a pixel off a stop — and a nudge that must be computed
 * from `37` should land on a stop rather than wandering off in odd numbers.
 *
 * The snap is TOWARD the direction of travel, which is the part worth being
 * careful about: up from 37 is 40, not 50. A click can leave the level between
 * stops, and a nudge from there should be the smallest audible move in the
 * direction pressed — otherwise pressing up after clicking near a stop jumps
 * twice, which reads as a stuck key.
 */
export function stepLevel(level: number, steps: number): number {
  const at = clampLevel(level);
  const up = steps > 0;
  let stop = up
    ? Math.ceil(at / LEVEL_STEP) * LEVEL_STEP
    : Math.floor(at / LEVEL_STEP) * LEVEL_STEP;
  // Already on a stop: step off it, or `up` from 40 would stay at 40 forever.
  if (stop === at) stop = up ? at + LEVEL_STEP : at - LEVEL_STEP;
  const rest = (Math.abs(Math.round(steps)) - 1) * LEVEL_STEP;
  return clampLevel(up ? stop + rest : stop - rest);
}

/** A level as the app writes it: `70%`. */
export function levelLabel(level: number): string {
  return `${clampLevel(level)}%`;
}

// --- velocity ---------------------------------------------------------------

/**
 * How hard a note may be hit, as a percentage of the synthesiser's full voice.
 *
 * Full scale is the ceiling for the same reason a channel's level tops out at
 * 100: the engine already keeps a single voice well under clipping, so a note at
 * 100 is loud but never the thing that makes a song crackle — which means the
 * control can offer its whole useful range instead of hiding headroom.
 *
 * Zero is a real value and means a SILENT note: the step still holds the pitch,
 * the grid still shows it, and it simply does not sound. That is the same bargain
 * `level 0` makes, and it is why velocity is a percentage and not "loud / soft".
 */
export const MIN_VELOCITY = 0;
/** The hardest a note goes. */
export const MAX_VELOCITY = 100;
/**
 * How hard a note is hit when nobody says otherwise: full.
 *
 * Full, and not a tasteful 70, because it is the level every song in the app was
 * already written at — the synthesiser has always played every note at its peak —
 * so a default of anything less would quietly resound the entire back catalogue.
 */
export const DEFAULT_VELOCITY = MAX_VELOCITY;
/**
 * How far one nudge moves a note's velocity.
 *
 * Ten percent, the same step as a level and a pan, so every loudness control in
 * the app speaks one arithmetic and `0` and `100` are always a few presses away.
 */
export const VELOCITY_STEP = 10;

/** Clamp a velocity into the range the control offers. */
export function clampVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return DEFAULT_VELOCITY;
  return Math.max(MIN_VELOCITY, Math.min(MAX_VELOCITY, Math.round(velocity)));
}

/** A velocity as the app writes it: `80%`. */
export function velocityLabel(velocity: number): string {
  return `${clampVelocity(velocity)}%`;
}

/**
 * Move a velocity by `steps` nudges, snapping onto the grid first.
 *
 * `stepLevel`'s rule exactly — unsigned, snap toward the direction of travel, and
 * a value already on a stop steps off it — because a velocity is a level in every
 * way that matters.
 */
export function stepVelocity(velocity: number, steps: number): number {
  const at = clampVelocity(velocity);
  const up = steps > 0;
  let stop = up
    ? Math.ceil(at / VELOCITY_STEP) * VELOCITY_STEP
    : Math.floor(at / VELOCITY_STEP) * VELOCITY_STEP;
  if (stop === at) stop = up ? at + VELOCITY_STEP : at - VELOCITY_STEP;
  const rest = (Math.abs(Math.round(steps)) - 1) * VELOCITY_STEP;
  return clampVelocity(up ? stop + rest : stop - rest);
}

/** Hard left. */
export const MIN_PAN = -100;
/** Hard right. */
export const MAX_PAN = 100;
/** Dead centre, and the default: a song is mono until it says otherwise. */
export const DEFAULT_PAN = 0;
/**
 * How far one nudge moves a channel across the stereo field.
 *
 * The same ten percent as a level, for the same reason: a nudge has to be
 * audible, and ten is a size a person can hear on one press without the control
 * becoming a trip. It also means both controls speak one arithmetic — eleven
 * stops from end to end — so a mix menu with two bars in a row reads as one idea.
 */
export const PAN_STEP = 10;

/** Clamp a pan into the range the control offers. */
export function clampPan(pan: number): number {
  if (!Number.isFinite(pan)) return DEFAULT_PAN;
  return Math.max(MIN_PAN, Math.min(MAX_PAN, Math.round(pan)));
}

/**
 * A pan as the app writes it: `C`, `L30`, `R70`.
 *
 * A single letter and a distance, because that is how a mixer is labelled and how
 * a person says it out loud: "thirty left". Centre is `C` rather than `L0` or a
 * bare `0`, so the middle of the field reads as a place of its own instead of as
 * a very small amount of left.
 */
export function panLabel(pan: number): string {
  const at = clampPan(pan);
  if (at === DEFAULT_PAN) return 'C';
  return `${at < 0 ? 'L' : 'R'}${Math.abs(at)}`;
}

/**
 * Move a pan by `steps` nudges, snapping a stray value onto the grid first.
 *
 * The same rule as `stepLevel`, and for the same reason — a pan can arrive from a
 * file, a script or a click a pixel off a stop, and a nudge out of that must be
 * the smallest audible move in the direction pressed rather than a jump of two.
 * The snap is `Math.round` rather than `Math.trunc` because pan, unlike a level,
 * is signed: rounding toward zero would make `-3` and `3` snap differently, and
 * an asymmetric control is one whose leftmost stop moves when you approach it
 * from the other side.
 */
export function stepPan(pan: number, steps: number): number {
  const at = clampPan(pan);
  const up = steps > 0;
  let stop = Math.round(at / PAN_STEP) * PAN_STEP;
  // Already on a stop: step off it, or `up` from 0 would stay at 0 forever.
  if (stop === at) stop = up ? at + PAN_STEP : at - PAN_STEP;
  const rest = (Math.abs(Math.round(steps)) - 1) * PAN_STEP;
  return clampPan(up ? stop + rest : stop - rest);
}

// --- the room ---------------------------------------------------------------

/**
 * How much of the master reverb (or echo) is mixed in, 0..100.
 *
 * The room is a property of the SONG, like a channel's level, and not of the
 * listener the way the master fader is: where a piece of music was recorded is
 * part of how it sounds, and a menu theme that was written for a stone hall
 * should still sound like a stone hall when somebody else opens the file. It is
 * the reason this is a `Song` field and the master volume is not.
 */
export const MIN_ROOM = 0;
/** The wettest this app goes. */
export const MAX_ROOM = 100;
/**
 * Dry, and the default.
 *
 * Zero on purpose, and not "a tasteful 20": a room is a decision, and a default
 * room would be this app deciding the size of the building for every song ever
 * written in it — including the several hundred that already exist, every one of
 * which must keep sounding exactly the way it did.
 */
export const DEFAULT_REVERB = MIN_ROOM;
/** No echo until somebody asks for one, for the same reason there is no reverb. */
export const DEFAULT_ECHO = MIN_ROOM;
/** How far one nudge moves a room amount. Same size as a level, same reason. */
export const ROOM_STEP = 10;

/** Clamp a reverb or echo amount into the range the control offers. */
export function clampRoom(amount: number): number {
  if (!Number.isFinite(amount)) return MIN_ROOM;
  return Math.max(MIN_ROOM, Math.min(MAX_ROOM, Math.round(amount)));
}

/** A room amount as the app writes it: `40%`, or `OFF` at zero. */
export function roomLabel(amount: number): string {
  const at = clampRoom(amount);
  return at === MIN_ROOM ? 'OFF' : `${at}%`;
}

/**
 * Move a room amount by `steps` nudges, snapping onto the grid first.
 *
 * Unsigned, so this is `stepLevel`'s rule exactly: the snap is toward the
 * direction of travel, and a value that is already on a stop steps off it.
 */
export function stepRoom(amount: number, steps: number): number {
  const at = clampRoom(amount);
  const up = steps > 0;
  let stop = up
    ? Math.ceil(at / ROOM_STEP) * ROOM_STEP
    : Math.floor(at / ROOM_STEP) * ROOM_STEP;
  if (stop === at) stop = up ? at + ROOM_STEP : at - ROOM_STEP;
  const rest = (Math.abs(Math.round(steps)) - 1) * ROOM_STEP;
  return clampRoom(up ? stop + rest : stop - rest);
}

// --- per-channel sends ------------------------------------------------------

/**
 * How much of a channel is fed to one of the master effects, 0..100.
 *
 * A send is not a level. A level is how LOUD a channel is in the mix; a send is
 * how much of it is standing in the room, and the two are independent — which is
 * exactly why a real desk has a separate knob for each rather than one fader.
 * The effect it sends TO is the song's, so one reverb serves every channel.
 */
export const MIN_SEND = 0;
/** All of it: the channel is fully in the room that the song's amount describes. */
export const MAX_SEND = 100;
/**
 * Full send, and the default — the one default in this file that is not zero.
 *
 * A level defaults to silent-ish because a channel that is too loud is worse than
 * one that is too quiet, but a send defaults to OPEN, because a send is not an
 * effect: the song's `reverb` is off until somebody turns it on, and once they
 * do, every channel should be standing in it. Full is also the only value that
 * keeps the promise made when `reverb` shipped — a channel that sends 100 is
 * multiplied by 1, so `reverb 40` produces exactly the tail it produced before
 * any of this existed.
 */
export const DEFAULT_VERB = MAX_SEND;
/**
 * Full send to the echo, for the same reason. Not named `DEFAULT_ECHO` because
 * that name is taken by the song's own echo amount, which is a different number.
 */
export const DEFAULT_TRACK_ECHO = MAX_SEND;
/** How far one nudge moves a send. Same size as a level, same reason. */
export const SEND_STEP = 10;

/** Clamp a send amount into the range the control offers. */
export function clampSend(amount: number): number {
  if (!Number.isFinite(amount)) return DEFAULT_VERB;
  return Math.max(MIN_SEND, Math.min(MAX_SEND, Math.round(amount)));
}

/**
 * A send as the app writes it: `FULL` at the top, `OFF` at the bottom, `40%`
 * between.
 *
 * Both ends are named because both ends mean something a percentage cannot say:
 * `FULL` is "all of this instrument is in the room" and `OFF` is "none of it is",
 * and those are the two answers people actually give.
 */
export function sendLabel(amount: number): string {
  const at = clampSend(amount);
  if (at === MAX_SEND) return 'FULL';
  if (at === MIN_SEND) return 'OFF';
  return `${at}%`;
}

/**
 * Move a send by `steps` nudges, snapping onto the grid first.
 *
 * The same rule as `stepRoom`, and signed the same way: the snap is toward the
 * direction of travel, and a value already on a stop steps off it.
 */
export function stepSend(amount: number, steps: number): number {
  const at = clampSend(amount);
  const up = steps > 0;
  let stop = up
    ? Math.ceil(at / SEND_STEP) * SEND_STEP
    : Math.floor(at / SEND_STEP) * SEND_STEP;
  if (stop === at) stop = up ? at + SEND_STEP : at - SEND_STEP;
  const rest = (Math.abs(Math.round(steps)) - 1) * SEND_STEP;
  return clampSend(up ? stop + rest : stop - rest);
}

/** The next length in the cycle, wrapping at the end and snapping a stray value. */
export function nextHold(steps: number): number {
  // A hold that is not one of the offered lengths (a hand-edited file, a value
  // from an older build) starts at the first length that is at least as long.
  const exact = HOLD_STEPS.indexOf(clampHold(steps));
  if (exact >= 0) return HOLD_STEPS[(exact + 1) % HOLD_STEPS.length];
  return HOLD_STEPS.find((value) => value > steps) ?? HOLD_STEPS[0];
}

/** A pattern is a grid of cells: `steps[row][track]`. */
export interface Pattern {
  name: string;
  steps: Cell[][];
}

/** The whole song. Patterns and tracks are the two dimensions of the grid. */
export interface Song {
  title: string;
  /**
   * The key the song is written in — a map for the piano and the grid, never a
   * cage. See `scale.ts`: nothing snaps, locks or refuses, so a song with a
   * chromatic chorus is still a song this app will play happily.
   */
  key: SongKey;
  bpm: number;
  /** Grid resolution: how many rows make one beat. Trackers default to 4. */
  rowsPerBeat: number;
  tracks: Track[];
  patterns: Pattern[];
  /**
   * How much the song SWINGS, 0..100. See `stepTimeFactor`.
   *
   * Hundreds of dance records are straight; the rest have a lilt, and the lilt
   * is usually this one number. It is a property of the song like `bpm`, not of
   * a channel: swing is what a PLAYER does with a bar, and a band that swung
   * only its hats would simply be a band with a problem.
   */
  swing: number;
  /**
   * How fast the whole record is READ off the medium, in percent of the written
   * speed. See `model/speed.ts` and `DEFAULT_SPEED`.
   *
   * The tape-speed gesture: one number that moves pitch and time TOGETHER. At
   * `100` the song plays exactly as written — what every song before this means —
   * and at `50` it is twice as long and an octave down. It is a property of the
   * RECORD rather than of a channel or a note, which is why it sits beside `bpm`
   * and `swing`: a tape machine has one transport.
   */
  speed: number;
  /**
   * Where the tempo CHANGES, as bars and tempos. Empty means one tempo all the
   * way through, which is what `bpm` alone has always meant.
   *
   * See `tempoMapBpm` for how a point is read. It is a list rather than a second
   * number because the thing worth having is an ARRANGEMENT that can lean: a
   * chorus that picks up, a breakdown that halves, a ending that slows down over
   * four bars — and all three are the same two ideas, a bar and a tempo.
   */
  tempoMap: TempoPoint[];
  /**
   * Where a knob MOVES over bars, as lanes. Empty means nothing moves, which is
   * what every value in this app meant before lanes existed.
   *
   * See `model/automation.ts` for how a lane is read. It lives on the song rather
   * than on the channel for the same reason `tempoMap` does: a lane is about
   * BARS, and a bar is the song's unit — a channel knows what it sounds like, not
   * where it is in the arrangement.
   */
  automation: AutomationLane[];
  /**
   * The FEEL the song is played with, as a named groove. See `grooveFeel`.
   *
   * The counterpart of `swing`, and the reason both exist: swing is the one
   * part of a feel that a single number can express, and a groove is the rest of
   * it — where the weight is, and whether the notes sit on the beat or lean out
   * of it. A name rather than a number because a feel is chosen, not dialled:
   * "backbeat" is a decision a person makes, and how hard to lean is what the
   * per-note velocities are for.
   *
   * It is a property of the SONG, like `swing` and `bpm`: a band that swung only
   * its hats would simply be a band with a problem.
   */
  groove: GrooveId;
  /**
   * The DRUM KIT this song's hits play: `studio`, `808`, `brush` or `rock`. See
   * `kitVoice`.
   *
   * The counterpart of `Track.voice` one scope up. A voice says what a CHANNEL
   * sounds like; a kit says what the four drums sound like, wherever they are, so
   * `kit 808` is one word for a whole drum machine. It is a property of the SONG
   * for the same reason `groove` is: a band has one drummer, and two kits would be
   * two.
   *
   * `studio` — the four percussion presets — is the default, so a song that names
   * no kit plays exactly what this app has always played, and a file that says
   * nothing about kits is byte-for-byte the file it was. A kit changes the SOUND
   * and never the pitch, which is why the grid, the file and an export cannot tell
   * which one a song is on.
   *
   * And it is a NAME rather than one of the four, for the reason a channel's
   * `sample` is a name: a kit you dialed in yourself travels as the word that
   * addresses it, and the four voices live in the library (`kitLibrary.ts`) — with
   * the same bargain a missing sample makes, that a name this machine does not
   * know plays the PRESETS rather than refusing the song. See `kitVoice`.
   */
  kit: KitName;
  /**
   * Which pattern plays at each slot of the song, 1-based, in order.
   *
   * This is the difference between a LOOP and a SONG. A pattern is a bar of
   * music; the order is the list of bars, so `[1, 1, 2, 1]` is two bars of verse,
   * a chorus bar and the verse again. A song that has only ever had one pattern
   * has `[1]`, which plays exactly the way it always did — so nothing about a
   * one-pattern song changes, and every existing song file stays valid.
   */
  order: number[];
  /**
   * The named groups of bars the song is written from, as its FORM.
   *
   * A section is a name for a list of pattern numbers, and nothing else: it is
   * not a second arrangement and nothing below this line reads it. `arrange`
   * expands them INTO `order`, which is what plays, so a song with sections is a
   * song whose order was written with names — see `model/sections.ts`.
   *
   * Empty means the song has no names for its bars, which is what every song had
   * before sections existed and what a one-pattern song still means.
   */
  sections: Section[];
  /**
   * The mix's GROUPS: one fader over the channels that name it.
   *
   * A channel joins one by name (`track 1 bus DRUMS`) and is multiplied by its
   * group's fader on the way to the band, so `bus DRUMS 70` is one control for a
   * whole kit. Nothing below this line reads the list: the LEVEL folds into
   * `channelGain`, which is why the engine, the renderer and the mix screen all
   * agree about how loud a channel is without any of them knowing what a bus is.
   *
   * Empty means no groups, which is every song written before buses existed, and
   * which multiplies every channel by 100% — the identity.
   */
  buses: Bus[];
  /**
   * The chord LOOP the song hangs on, or null for a song that has none.
   *
   * A definition rather than a performance, like `sections`: nothing here plays
   * it, and the two followers in the language (`chord 0 3 follow`, `note 0 4
   * follow`) WRITE the chords into cells where the grid, the file and an export
   * can all see them. See `model/progression.ts`.
   *
   * Null means no loop, which is what every song written before progressions
   * existed means — and a song with no progression answers in exactly the way it
   * always did, because nothing reads this field unless something asked to
   * follow it.
   */
  progression: Progression | null;
  /**
   * The section names the order was ARRANGED from, in playing order.
   *
   * Kept, rather than recomputed from `sections` and `order`, because the form of
   * a song is a decision and not a derivation: `VERSE VERSE CHORUS` is what
   * somebody meant, and the same bars could have been reached a dozen ways. It is
   * also what lets `F3` label a bar as part of the chorus — and it is verified
   * before it is believed, so an order edited by hand afterwards is drawn with no
   * labels rather than with wrong ones. Every edit to the order CLEARS it, which
   * is the invariant that keeps that from being a lie.
   */
  arrangement: string[];
  /**
   * The LIVE page's SCENES: a pattern per channel you launch by hand.
   *
   * A scene is a ROW of a launch grid — the pattern each channel plays in it, or
   * nothing — so performing and writing are the same material: a clip is a
   * pattern the song already has, never a second copy of one. Nothing below this
   * line reads the list, because a scene is not what a song plays by itself; it is
   * what a PERSON plays it as, and `order` is still the song. See
   * `model/scenes.ts`.
   *
   * Empty means the song has no scenes, which is what every song before Live had
   * and what a linear song still means — and a song with no scenes writes no key
   * and no new file version.
   */
  scenes: Scene[];
  /**
   * How much of the master REVERB is mixed in, 0..100. See `DEFAULT_REVERB`.
   *
   * One amount for the whole song rather than a send per channel: a per-channel
   * send is the better mixer and the wrong first step, because two numbers on a
   * screen both labelled "reverb" is exactly the sort of thing this app exists to
   * avoid. The whole band is in the same room, which is also how a band works.
   */
  reverb: number;
  /**
   * How much of the master ECHO is mixed in, 0..100. See `DEFAULT_ECHO`.
   *
   * A tempo-synced delay rather than a fixed one, so a `echo 40` means the same
   * thing at 90 BPM and at 160: the point of an echo in this kind of music is
   * that it lands ON the beat, and a delay in milliseconds is a delay that stops
   * agreeing with the song the moment somebody changes the tempo.
   */
  echo: number;
  /**
   * The EFFECTS on the whole MIX — the same seven a channel can have, applied
   * to everything at once. See `TRACK_EFFECTS`.
   *
   * A channel's drive is a guitar amp; the master's drive is the tape the whole
   * band was printed to, which is the difference between "this part bites" and
   * "this record sounds like a record". Radio, tape and console glue are all one
   * or two numbers here (`master drive 20 tilt 15`), and every one of them is off
   * at 0, which is what keeps a song that never asked for any of it playing
   * through exactly the graph it played through before this existed.
   *
   * An OBJECT rather than six flat fields, unlike a channel's, for one reason:
   * these travel together everywhere — one line in the script, one key in a file,
   * one bus in the graph, one page in the mix menu — and there is no per-effect
   * code path anywhere that wants one of them without the others. The members are
   * the same names, the same range and the same `clampEffects`, so a channel's set
   * and the song's set can be handed to the same code.
   *
   * `gate` behaves like a channel's: it is arithmetic on a note's length and not
   * a node, so the master's gate and each channel's own compound — every stage
   * shortens the note by its own amount.
   */
  master: ChannelEffects;
  /**
   * How the song is TUNED — which temperament its twelve notes are spaced by.
   * See `tuning.ts`.
   *
   * A property of the SONG and not of a channel, for the same reason `bpm` and
   * `key` are: a temperament is read against the key's tonic, and a band tuned
   * to one temperament is one band. It is the one setting on this shelf that
   * changes no timbre at all — the same instruments, tuned differently — which
   * is why it lives beside `key` rather than with the voices.
   *
   * The default is equal temperament, so every note in every file written before
   * tunings existed is exactly the frequency it always was.
   */
  tuning: TuningId;
  /**
   * The DRUM MACHINE, or null for a song that has none.
   *
   * The other half of percussion in this app: a channel can play a kit one cell at
   * a time (`drum 0 4 kick`), and this is the instrument a beat is usually made
   * on — pads you design, a step grid you draw, and its own fader, sends and
   * effects, playing BESIDE the channels rather than inside one of them. See
   * `model/machine.ts`.
   *
   * Null means no machine, which is every song written before one existed; a song
   * with a machine writes a `machine` key and declares the newest file version,
   * because an older build would drop the field and save the beats away. One
   * machine per song, like `kit`: a band has one drummer.
   */
  machine: DrumMachine | null;
  /**
   * The ARP page's dials, or null for a song that stores none.
   *
   * The one thing the page adds to the song: the five settings a run is DIALED
   * with — direction, octaves, rate, gate and which chord to walk. They are
   * stored rather than recomputed so a run can be reopened and tuned, which is
   * the whole point of the page; the NOTES a write produced are ordinary cells
   * and need nothing new. See `model/arp.ts`.
   *
   * Null means no arp, which is every song written before the page existed — and
   * a song with no dials writes no key and no new file version, because the
   * `chord … arp` language modifier needs none either.
   */
  arp: ArpSettings | null;
}

// --- the numbers the app agrees on ------------------------------------------

export const DEFAULT_BPM = 120;
export const BPM_MIN = 40;
export const BPM_MAX = 300;
/**
 * How far a step can be pushed, as a fraction of its length, at `swing 100`.
 *
 * A third, because that is the deepest lilt music actually uses: it is the
 * difference between a straight 16th pair and a triplet — `long-short` landing
 * on 2/3 and 1/3 of the pair's time, which is the classic shuffle. Deeper than
 * that stops sounding like a player and starts sounding like a broken clock.
 */
export const SWING_SHIFT_MAX = 1 / 3;
/** Straight: every step exactly as long as every other. */
export const MIN_SWING = 0;
/** The deepest lilt the control offers. */
export const MAX_SWING = 100;
export const DEFAULT_SWING = MIN_SWING;
/**
 * How many steps a pattern has when nobody says otherwise, and the ceiling a
 * script may raise it to.
 *
 * Sixteen is one bar of 4/4 at four steps to the beat, which is the size a
 * beginner can see at once. 512 is eight times a 64-row pattern: long enough for
 * a full melody, short enough that the sequencer's row arithmetic stays exact
 * and the grid can page through it a screenful at a time.
 */
export const DEFAULT_ROWS = 16;
export const MIN_ROWS = 1;
export const MAX_ROWS = 512;
export const DEFAULT_TRACKS = 4;
export const ROWS_PER_BEAT = 4;
export const MIN_ROWS_PER_BEAT = 1;
export const MAX_ROWS_PER_BEAT = 16;
export const MAX_TRACKS = 8;
export const MIN_TRACKS = 1;
/**
 * How long a channel name may be.
 *
 * A name is shown in three cramped places — the channel row, the pattern grid's
 * column heading and the cell inspector — and the narrowest of them fits about
 * fourteen characters. Sixteen is the limit because it is a round number that a
 * person can hold in their head, not because it is the widest that fits: the
 * views shorten anything longer with an ellipsis rather than refusing it.
 */
export const MAX_TRACK_NAME = 16;
/**
 * How long a song title may be.
 *
 * The title shares the header bar with the pattern readout and the app's
 * tagline, which leaves about 200 canvas pixels — around thirty-five characters
 * in the header's face. Thirty-two leaves a margin for the widest letters, and
 * it is the same kind of round number as `MAX_TRACK_NAME`, which came from the
 * same kind of measurement.
 *
 * Three places enforce it and they must agree: the header's rename box (which
 * caps the typing), the script's `song` line, and the song file's reader. A
 * title at the limit is still shortened ON SCREEN when its own letters are wide,
 * because display room depends on the glyphs and this limit cannot.
 */
export const MAX_SONG_TITLE = 32;
/** What a brand-new song is called, until you say otherwise. */
export const UNTITLED_TITLE = 'UNTITLED SONG';
/** A ceiling on patterns, so a typo like `pattern 9999` cannot eat the heap. */
export const MAX_PATTERNS = 64;
/**
 * How many slots a song may have.
 *
 * Longer than `MAX_PATTERNS` on purpose: a song repeats bars, so a four-bar
 * chorus is four slots of two patterns. Sixty-four slots is sixteen bars four
 * times over — more than anyone writes in one sitting — and it keeps the order
 * short enough to read on one screen and to print in a header.
 */
export const MAX_ORDER = 64;

/** One beat in seconds at a tempo. */
export function secondsPerBeat(bpm: number): number {
  return 60 / Math.max(1, bpm);
}

/** One ROW in seconds at a tempo — the tracker's real clock. */
export function secondsPerRow(bpm: number, rowsPerBeat = ROWS_PER_BEAT, speed = DEFAULT_SPEED): number {
  // The master SPEED divides the clock: half speed is twice as long a row, and
  // the pitch moves by the same ratio in the synth rather than here. A song at
  // `100` multiplies by exactly one, which is the row every earlier song had.
  return (secondsPerBeat(bpm) / Math.max(1, rowsPerBeat)) / speedFactor(speed);
}

/** Clamp a tempo into the range the UI offers. */
export function clampBpm(bpm: number): number {
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(bpm)));
}

/** Clamp a pattern length into the supported range. */
export function clampRows(rows: number): number {
  return Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.round(rows)));
}

/** Clamp the grid resolution (how many steps make one beat). */
export function clampRowsPerBeat(steps: number): number {
  return Math.max(MIN_ROWS_PER_BEAT, Math.min(MAX_ROWS_PER_BEAT, Math.round(steps)));
}

/** Clamp a swing amount into the range the control offers. */
export function clampSwing(swing: number): number {
  return Math.max(MIN_SWING, Math.min(MAX_SWING, Math.round(swing)));
}

/**
 * How far a step is pushed, as a fraction of its length, at this swing.
 *
 * The knob is a percentage because a percentage is what a person can hear:
 * `60` is a noticeable lift, `100` is as deep as this app goes. Zero is the
 * straight grid every other feature assumes.
 */
export function swingDepth(swing: number): number {
  return (clampSwing(swing) / MAX_SWING) * SWING_SHIFT_MAX;
}

/**
 * How long one step lasts as a fraction of its straight length.
 *
 * Swing moves every SECOND step of each pair later, by making the one before it
 * longer and the one itself shorter:
 *
 * ```
 * straight    |....|....|....|....|
 * swung       |......|..|......|..|
 *              step 0  step 1
 * ```
 *
 * Two properties are the whole reason this is a function and not an inline
 * expression in the scheduler, and both are tested:
 *
 *   • a PAIR of steps always lasts exactly twice one step, so the tempo, the bar
 *     length and the playhead are untouched. Swing moves notes; it does not slow
 *     the song down. (That is also why the two factors are `1 + d` and `1 - d`
 *     rather than `1 + d` and `1`.)
 *
 *   • no step ever gets shorter than two thirds of itself, because a step is a
 *     slot for music and a slot of zero length would be a note the app cannot
 *     schedule.
 */
export function stepTimeFactor(swing: number, step: number): number {
  const depth = swingDepth(swing);
  return step % 2 === 0 ? 1 + depth : 1 - depth;
}

// --- groove: the named feel ------------------------------------------------

/**
 * A groove is a FEEL with a name, the way a voice is a sound with a name.
 *
 * Swing already covers the one thing a single number can express — "lilt every
 * second step" — and a groove is the rest of what a player does with a bar that
 * a dial cannot say:
 *
 *   • where the WEIGHT is   (which beats are firm and which give way)
 *   • where the note SITS   (a hair behind, a hair ahead, on the triplet)
 *   • both at once, which is what a pocket is.
 *
 * Two properties make this safe to add to a language with hundreds of songs in
 * it, and both are tested:
 *
 *   • `straight` is the identity — no delay and a gain of exactly 1 — which is
 *     why every file written before grooves existed still sounds unchanged, and
 *     why the default is the safe one to add.
 *
 *   • no feel can move a note PAST its neighbour, and none can make one LOUDER
 *     than it was written. A groove is a performance, and a performance is what
 *     a player does within the beat rather than a rewording of the part.
 */
export type GrooveId =
  | 'straight'
  | 'backbeat'
  | 'offbeat'
  | 'shuffle'
  | 'laid-back'
  | 'pushed'
  | 'boom-bap'
  | 'swing-16'
  | 'd-beat'
  | 'human';

/** One entry of the groove table: the id, and how it is named and described. */
export interface Groove {
  id: GrooveId;
  /** How the menu spells it. Upper case, because every menu label here is. */
  label: string;
  /** Other spellings a script may use. */
  aliases: readonly string[];
  /** What it is, in one line, for the menu and the docs. */
  blurb: string;
}

/**
 * Every feel this app knows, in the order the menu cycles them.
 *
 * `straight` is first because it is the default and the floor: the list reads as
 * "none, then the feels that place the BEAT, then the ones that place the NOTES,
 * then the one that places nothing on purpose".
 *
 * ── What a feel can and cannot say ──────────────────────────────────────────
 * A feel here is two facts about a step: how far it LEANS and how much of its
 * written level it keeps. That is the whole vocabulary, and it is worth being
 * honest about the limit, because it decides which genres a feel can carry:
 *
 *   • **half-time is not a feel.** It is a tempo and a PATTERN — a kick on 1 and
 *     a snare on 3 at 62 BPM — which is why `start vaporwave` says `tempo 62`
 *     and writes the bar out. A feel that only moves and weighs notes cannot
 *     halve a bar, and pretending otherwise would produce a row in a menu that
 *     did nothing.
 *   • **trap hats are not a feel either**, for the same reason spelled the other
 *     way: a 32nd-note roll is a PATTERN. What a feel CAN say is that the notes
 *     between the beats land late, which is `swing-16` below and is the half of
 *     that sound which is a performance rather than a rhythm.
 */
export const GROOVES: readonly Groove[] = [
  { id: 'straight', label: 'STRAIGHT', aliases: ['none', 'off'], blurb: 'every note exactly on its step' },
  { id: 'backbeat', label: 'BACKBEAT', aliases: ['back-beat', 'two-and-four'], blurb: 'beats 2 and 4 firm, the rest softer' },
  { id: 'offbeat', label: 'OFFBEAT', aliases: ['off-beat', 'skank'], blurb: 'the notes between the beats are the loud ones' },
  { id: 'shuffle', label: 'SHUFFLE', aliases: ['swing-8ths', 'triplet'], blurb: 'the offbeat eighths land a third of the way late' },
  { id: 'laid-back', label: 'LAID BACK', aliases: ['lazy', 'late', 'behind'], blurb: 'everything a hair behind the beat' },
  { id: 'pushed', label: 'PUSHED', aliases: ['eager', 'early', 'ahead'], blurb: 'everything a hair ahead of the beat' },
  { id: 'boom-bap', label: 'BOOM BAP', aliases: ['boombap', 'hip-hop', 'hiphop'], blurb: 'the offbeat eighths late AND two and four firm: the hip-hop pocket' },
  { id: 'swing-16', label: 'SWING 16', aliases: ['swing16', 'sixteenths', 'funk'], blurb: 'the offbeat sixteenths late: trap hats, funk and modern R&B' },
  { id: 'd-beat', label: 'D-BEAT', aliases: ['dbeat', 'punk', 'driving'], blurb: 'the offbeat eighths a hair EARLY, so the beat leans forward instead of dragging' },
  { id: 'human', label: 'HUMAN', aliases: ['loose', 'humanize'], blurb: 'a tiny, unchanging wobble in every note' },
];

/** How many beats a feel assumes to the bar. See `grooveFeel`. */
export const GROOVE_BEATS_PER_BAR = 4;
/** No feel at all, and the default — so no existing song is re-performed. */
export const DEFAULT_GROOVE: GrooveId = 'straight';
/** How much of its written velocity an unaccented step keeps. */
const GROOVE_SOFT = 0.8;
/** The same, for a shuffle's offbeat — a shuffle is a lean, not a limp. */
const GROOVE_SHUFFLE_SOFT = 0.85;
/**
 * How late `laid-back` plays, in steps.
 *
 * Fourteen percent of a step is about 35 ms at 120 BPM in sixteenths: under the
 * "can you hear it" line on its own, and unmistakable over a whole bar. Further
 * than this and the part stops sounding relaxed and starts sounding wrong.
 */
const GROOVE_LAZY = 0.14;
/** How early `pushed` plays. The same distance, the other side of the beat. */
const GROOVE_EAGER = 0.14;
/**
 * How far a `d-beat` offbeat leans FORWARD, in steps.
 *
 * The same order as `GROOVE_LAZY` and deliberately no more: a punk drummer
 * pushes the offbeat eighths, and past about a fifth of a step the push stops
 * reading as drive and starts reading as a mistake.
 */
const GROOVE_DRIVE = 0.2;
/** The most `human` moves any one note, in steps. */
const GROOVE_HUMAN_TIME = 0.09;
/** The most `human` takes off any one note's velocity. */
const GROOVE_HUMAN_GAIN = 0.14;
/**
 * The furthest any feel may place a note from its step.
 *
 * Under one step, and that is the whole guarantee: a note may lean out of its
 * slot but never far enough to arrive after the note in the next one, so a
 * groove changes how a bar is played and never what order it is played in.
 * `shuffle` is the feel that needs the bound — a third of a beat is 2.67 steps
 * on a 16-steps-to-the-beat grid, which would land it among the notes after it.
 */
const GROOVE_DELAY_MAX = 0.75;

/** Where a note sits and how hard it plays, as the difference a feel makes. */
export interface GrooveFeel {
  /** How far past its step the note lands, as a fraction of a step. Signed. */
  delay: number;
  /** What the note's written velocity is multiplied by. Never above 1. */
  gain: number;
}

/** The feel that changes nothing, and the one every lookup falls back to. */
const STRAIGHT_FEEL: GrooveFeel = { delay: 0, gain: 1 };

/** The groove a name refers to, or null. Looks at ids and aliases, folded. */
export function grooveFromName(text: string): Groove | null {
  const want = text.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return GROOVES.find((entry) =>
    entry.id === want || entry.label.toLowerCase().replace(/\s+/g, '-') === want || entry.aliases.includes(want),
  ) ?? null;
}

/** The groove with this id, or null if no such feel exists. */
export function grooveById(id: string): Groove | null {
  return GROOVES.find((entry) => entry.id === id) ?? null;
}

/** A feel as the menus write it. An id nothing knows reads as STRAIGHT. */
export function grooveLabel(id: GrooveId): string {
  return grooveById(id)?.label ?? 'STRAIGHT';
}

/** Every feel's name, for an error message that has to list them. */
export function grooveNames(): string {
  return GROOVES.map((entry) => entry.id).join(', ');
}

/**
 * The feel a step is played with: where it sits, and how hard it plays.
 *
 * `step` is the step's index in the ORDER (not in its pattern), which is the
 * same counter the scheduler already ticks — so a feel lands the same way in bar
 * three as in bar one, and a song that loops feels the same every time round.
 *
 * `rowsPerBeat` is what makes the feel land on BEATS rather than on steps: a
 * backbeat has to know where beat 2 is, and a shuffle has to know what an eighth
 * is, and both are that one number. The bar is assumed to be four beats, because
 * this app has no meter — a pattern is a bar and `beat 4` is the default, so
 * that is the shape of nearly every song in it.
 */
export function grooveFeel(id: GrooveId, step: number, rowsPerBeat: number): GrooveFeel {
  if (id === DEFAULT_GROOVE) return STRAIGHT_FEEL;
  const perBeat = Math.max(1, Math.round(clampRowsPerBeat(rowsPerBeat)));
  const sub = ((step % perBeat) + perBeat) % perBeat;
  const beat = Math.floor(step / perBeat) % GROOVE_BEATS_PER_BAR;
  switch (id) {
    case 'backbeat':
      // Beats 2 and 4 (1 and 3 from zero) are the firm half of the bar; the
      // others give way. Read per BEAT rather than per step, because "lean on
      // two and four" is a statement about the bar, not about one sixteenth.
      return { delay: 0, gain: beat % 2 === 1 ? 1 : GROOVE_SOFT };
    case 'offbeat':
      // The other way round: the notes BETWEEN the beats are the loud ones. At
      // one step per beat there IS no between, and the feel has to do NOTHING
      // rather than turn every note down together — a uniform gain is not a
      // feel, it is the level control wearing a hat.
      if (perBeat < 2) return STRAIGHT_FEEL;
      return { delay: 0, gain: sub === 0 ? GROOVE_SOFT : 1 };
    case 'shuffle': {
      // The offbeat eighth moves from half way through the beat to two thirds:
      // the triplet the whole of blues and boogie is built on. `perBeat / 6` is
      // that distance in steps at any grid size, bounded so that a very fine
      // grid cannot push a note into the next slot (and nothing at all happens
      // when there is no eighth to move).
      const offbeat = Math.floor(perBeat / 2);
      const late = offbeat > 0 && sub === offbeat;
      if (perBeat < 2 || !late) return { delay: 0, gain: 1 };
      return { delay: Math.min(perBeat / 6, GROOVE_DELAY_MAX), gain: GROOVE_SHUFFLE_SOFT };
    }
    case 'laid-back':
      return { delay: GROOVE_LAZY, gain: 1 };
    case 'pushed':
      return { delay: -GROOVE_EAGER, gain: 1 };
    case 'boom-bap': {
      // Two feels at once, which is why it is its own entry rather than `shuffle`
      // written over a `backbeat`: the offbeat eighth lands late (a shuffle, but
      // lazier) AND beats 2 and 4 keep their full weight, which is the pocket
      // every hip-hop record since 1988 has been built on.
      const offbeat = Math.floor(perBeat / 2);
      const late = offbeat > 0 && sub === offbeat;
      return {
        delay: late ? Math.min(perBeat / 5, GROOVE_DELAY_MAX) : 0,
        gain: beat % 2 === 1 ? 1 : GROOVE_SOFT,
      };
    }
    case 'swing-16': {
      // The offbeat SIXTEENTHS, a third of a step late: the hats under trap and
      // modern R&B, and the reason those records breathe while still being
      // written dead straight. Nothing changes weight — a 16th swing is a
      // placement, not an accent.
      if (perBeat < 2) return STRAIGHT_FEEL;
      const late = sub % 2 === 1;
      return { delay: late ? Math.min(perBeat / 12, GROOVE_DELAY_MAX) : 0, gain: 1 };
    }
    case 'd-beat': {
      // The other direction: the offbeat eighths arrive EARLY, which is what a
      // punk or hardcore drummer does to make a fast beat drive rather than
      // plod. Only the offbeats move and nothing changes level, so a part
      // written even comes back leaning forward.
      if (perBeat < 2) return STRAIGHT_FEEL;
      const offbeat = Math.floor(perBeat / 2);
      const early = sub === offbeat;
      return { delay: early ? -Math.min(perBeat / 20, GROOVE_DRIVE) : 0, gain: 1 };
    }
    case 'human': {
      // Deterministic on purpose: a seeded hash of the step rather than
      // `Math.random`, so a wobble is the SAME wobble every time the bar comes
      // round and an exported file is the file the app played.
      return {
        delay: (grooveNoise(step) * 2 - 1) * GROOVE_HUMAN_TIME,
        gain: 1 - grooveNoise(step + 0x9e37) * GROOVE_HUMAN_GAIN,
      };
    }
    default:
      return STRAIGHT_FEEL;
  }
}

/**
 * A stable pseudo-random number in 0..1 for a step, used by `human`.
 *
 * A multiply-xorshift hash rather than a generator, because what a wobble needs
 * is not a sequence but a VALUE PER STEP: the same step has to wobble the same
 * way in every bar and in every render, and asking for the numbers in a different
 * order must not change any of them.
 */
function grooveNoise(step: number): number {
  let x = (Math.imul(step + 1, 0x9e3779b1) + 0x85ebca6b) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0;
  x ^= x >>> 12; x = Math.imul(x, 0x297a2d39) >>> 0;
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/** The feel after this one in the menu's cycle, wrapping at the end. */
export function nextGroove(id: GrooveId): GrooveId {
  const at = GROOVES.findIndex((entry) => entry.id === id);
  return GROOVES[(at + 1) % GROOVES.length].id;
}

// --- polyphony: how many notes one channel may hold --------------------------

/** The narrowest a channel can be: one note at a time, which is the default. */
export const MIN_POLY = 1;
/**
 * The widest a channel can be: eight notes at once.
 *
 * Eight is a chord with both hands on it — a seventh plus an octave, or a full
 * triad over a pedal — and it is also the point where a channel stops being a
 * part and starts being a section of the arrangement. With eight channels that is
 * at most sixty-four voices, which is a number a browser can schedule.
 */
export const MAX_POLY = 8;
/** One note at a time, and what every file written before this means. */
export const DEFAULT_POLY = MIN_POLY;

/** Clamp a channel's polyphony into the range the language offers. */
export function clampPoly(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_POLY;
  return Math.max(MIN_POLY, Math.min(MAX_POLY, Math.round(count)));
}

/**
 * One note a channel is currently holding, as the stealing rule sees it.
 *
 * Only the two things the decision needs: WHEN it began, and how hard it was
 * played. Nothing about pitch, because a stolen voice is chosen for being missed
 * least, not for being closest to the new note.
 */
export interface HeldVoice {
  /** When it began, in the audio clock (seconds). Later is newer. */
  startedAt: number;
  /** The velocity it was written with, 0..100. */
  velocity: number;
}

/**
 * Which held note gives way when a polyphonic channel is full.
 *
 * The rule, in the order it is applied:
 *
 *   1. **the oldest** — the note that has already been heard longest is the one
 *      whose loss is least noticed. This is what every polysynth does, and it is
 *      what keeps a bass line moving under a pad: the pad's held notes go before
 *      the bass's new one does not even compete, because they are on another
 *      channel.
 *   2. **the quietest** among notes that began at the SAME moment (one step can
 *      hold a chord written by the `chord` tool, and those notes share a start).
 *      Turning down the inner voice of a chord is a smaller change than dropping
 *      the melody note that sits on top of it.
 *   3. **the lowest index** if even that ties, so the answer is deterministic and
 *      a test can assert it.
 *
 * Returns an index into `held`, or `-1` when nothing is held.
 */
export function voiceToSteal(held: readonly HeldVoice[]): number {
  let best = -1;
  for (let i = 0; i < held.length; i++) {
    if (best < 0) { best = i; continue; }
    const a = held[i];
    const b = held[best];
    // Oldest first: an earlier start wins. `startedAt` counts UP in seconds, so
    // the oldest is the SMALLEST.
    if (a.startedAt < b.startedAt - 1e-9) { best = i; continue; }
    if (a.startedAt > b.startedAt + 1e-9) continue;
    if (a.velocity < b.velocity) best = i;
  }
  return best;
}

// --- per-channel feel: a PART's pocket --------------------------------------

/** How much a channel may be humanised, as a percentage. */
export const MIN_HUMANIZE = 0;
/** The most `humanize` offers: a distinctly loose performance. */
export const MAX_HUMANIZE = 100;
/**
 * No extra looseness, and the default.
 *
 * Zero for the reason every other default here is: the app has hundreds of songs
 * in it, all of them played exactly on the grid, and a default wobble would
 * quietly re-perform every one. The song-level `human` FEEL is unaffected — this
 * is an amount ON TOP of whatever feel is in effect.
 */
export const DEFAULT_HUMANIZE = MIN_HUMANIZE;
/** How far one nudge moves a humanize amount. The same size as the other knobs. */
export const HUMANIZE_STEP = 10;

/** Clamp a humanize amount into the range the control offers. */
export function clampHumanize(amount: number): number {
  if (!Number.isFinite(amount)) return DEFAULT_HUMANIZE;
  return Math.max(MIN_HUMANIZE, Math.min(MAX_HUMANIZE, Math.round(amount)));
}

/**
 * The extra looseness `humanize` adds to one step of one channel.
 *
 * Seeded by the step AND the channel index, because two humanised parts that
 * wobbled identically would not sound human — they would sound like one part with
 * a chorus. The seed is arithmetic rather than a sequence for the same reason
 * `human` is: the same step must wobble the same way in every bar and every
 * render, and asking for the numbers in a different order must change none of
 * them.
 */
function humanizeFeel(amount: number, step: number, trackIndex: number): GrooveFeel {
  const depth = clampHumanize(amount) / MAX_HUMANIZE;
  const seed = step * 8 + trackIndex;
  return {
    delay: (grooveNoise(seed) * 2 - 1) * GROOVE_HUMAN_TIME * depth,
    gain: 1 - grooveNoise(seed + 0x9e37) * GROOVE_HUMAN_GAIN * depth,
  };
}

/**
 * The feel ONE channel is played with, which is what the engine and the renderer
 * both ask for.
 *
 * One function rather than two copies, and that is the point: a part whose feel
 * differed between what you heard and what you exported would be the worst kind
 * of bug in a music app. It composes the channel's named feel (or the song's) with
 * the channel's own looseness, and the total delay is held inside the same bound
 * a named feel already obeys — a note may lean out of its slot but never far
 * enough to arrive after the note in the next one.
 */
export function trackFeel(
  track: Pick<Track, 'groove' | 'humanize'>,
  songGroove: GrooveId,
  step: number,
  rowsPerBeat: number,
  trackIndex: number,
): GrooveFeel {
  const base = grooveFeel(track.groove ?? songGroove, step, rowsPerBeat);
  if (track.humanize === DEFAULT_HUMANIZE) return base;
  const human = humanizeFeel(track.humanize, step, trackIndex);
  return {
    delay: Math.max(-GROOVE_DELAY_MAX, Math.min(GROOVE_DELAY_MAX, base.delay + human.delay)),
    gain: base.gain * human.gain,
  };
}

// --- the tempo map: a song that does not stay at one speed ------------------

/**
 * One place the tempo changes: which BAR, what tempo, and whether it SLIDES.
 *
 * A song with no points is a song at one tempo, which is every song that has
 * ever been written in this app — so the map is empty by default and the map
 * being empty is exactly the old behaviour, note for note.
 */
export interface TempoPoint {
  /** The bar it arrives at, 1-based, the same way `order` counts its slots. */
  slot: number;
  /** The tempo it arrives at. */
  bpm: number;
  /**
   * How it gets there: `true` slides in from the previous tempo, `false` steps.
   *
   * This is the difference between the two things a person actually asks for —
   * "the chorus is at 140" (a step, the tempo changes on the bar line) and
   * "slow down into the ending" (a slide, the tempo leans over several bars) —
   * and it is a flag rather than two kinds of statement because everything else
   * about a point is the same.
   */
  slide: boolean;
}

/**
 * As many tempo changes as a song may have.
 *
 * A ceiling rather than a rule: an arrangement is a list of bars, and a tempo
 * point per bar with room to spare is more tempo changes than any music has.
 * It exists so that a runaway generator cannot write a file that takes a second
 * to open.
 */
export const MAX_TEMPO_POINTS = 32;

/** Clamp a bar number into the range an arrangement can have. */
export function clampTempoSlot(slot: number): number {
  if (!Number.isFinite(slot)) return 1;
  return Math.max(1, Math.min(MAX_ORDER, Math.round(slot)));
}

/**
 * The points in bar order, with one point per bar.
 *
 * Sorting and de-duplicating here rather than at every read is the same bargain
 * the rest of this file makes: the ONE place that can produce a bad list is the
 * place that fixes it, so no consumer has to defend itself. A later point at the
 * same bar wins, because a file is read top to bottom and the last thing said
 * about a bar is what it means.
 */
export function sortTempoMap(points: readonly TempoPoint[]): TempoPoint[] {
  const byBar = new Map<number, TempoPoint>();
  for (const point of points) {
    const slot = clampTempoSlot(point.slot);
    byBar.set(slot, { slot, bpm: clampBpm(point.bpm), slide: point.slide === true });
  }
  return [...byBar.values()].sort((a, b) => a.slot - b.slot);
}

/** Add a tempo point, replacing whatever was said about that bar before. */
export function withTempoPoint(points: readonly TempoPoint[], point: TempoPoint): TempoPoint[] {
  return sortTempoMap([...points.filter((entry) => entry.slot !== clampTempoSlot(point.slot)), point]);
}

/** Drop the point at a bar, if there is one. Used when a bar is removed. */
export function withoutTempoPoint(points: readonly TempoPoint[], slot: number): TempoPoint[] {
  const at = clampTempoSlot(slot);
  return points.filter((point) => point.slot !== at);
}

/**
 * The tempo at a step of the order, with the map applied.
 *
 * `step` counts from the start of the arrangement, which is the counter the
 * sequencer already ticks; `stepsPerBar` is one pattern's length, because a bar
 * in an arrangement IS one pattern. The map is read as a piecewise line:
 *
 *   • a STEP point holds the previous tempo until its bar and then changes;
 *   • a SLIDE point leans evenly from the previous point's bar to its own;
 *   • before the first point, the tempo is the song's own `bpm`, which is why a
 *     slide as the only point is a slow-down from bar 1 rather than a jump.
 *
 * The slide is even in TEMPO rather than in time — the halfway bar is halfway
 * between the two numbers — which is what a DAW's tempo track does and what the
 * word "evenly" means to a person reading the numbers.
 */
export function tempoMapBpm(
  base: number,
  points: readonly TempoPoint[],
  stepsPerBar: number,
  step: number,
): number {
  const start = clampBpm(base);
  const sorted = sortTempoMap(points);
  if (sorted.length === 0) return start;
  const perBar = Math.max(1, Math.round(stepsPerBar));
  // The fractional bar this step falls in, from 0. A step in the middle of the
  // fourth bar is 3.5, which is what makes a slide land evenly rather than in
  // steps of a whole bar.
  const at = Math.max(0, step) / perBar;
  let previous = { at: 0, bpm: start };
  for (const point of sorted) {
    const arrival = point.slot - 1;
    if (at < arrival) {
      if (!point.slide) return previous.bpm;
      const span = arrival - previous.at;
      if (span <= 0) return clampBpm(point.bpm);
      const t = (at - previous.at) / span;
      return clampBpm(previous.bpm + (clampBpm(point.bpm) - previous.bpm) * t);
    }
    previous = { at: arrival, bpm: clampBpm(point.bpm) };
  }
  return previous.bpm;
}

/**
 * The tempo of every step of the arrangement, as one array.
 *
 * The engine and the offline renderer both walk a song step by step, so both
 * want the map resolved once into the shape they already store their other
 * per-step data in — a level, a pan and now a tempo are all "a number per
 * channel or per step", read by index. It also means the model keeps the
 * arithmetic: neither consumer knows what a slide is.
 */
export function songTempos(song: Song): number[] {
  const steps = songSteps(song);
  const perBar = Math.max(1, patternRows(song));
  const out: number[] = [];
  for (let step = 0; step < steps; step++) {
    out.push(tempoMapBpm(song.bpm, song.tempoMap, perBar, step));
  }
  return out;
}

/** The tempo a bar starts at, for a menu that shows one number per bar. */
export function songTempoAtSlot(song: Song, slot: number): number {
  const perBar = Math.max(1, patternRows(song));
  return tempoMapBpm(song.bpm, song.tempoMap, perBar, (clampTempoSlot(slot) - 1) * perBar);
}

/** How the app writes a tempo point: `90 BY 5`, or `140 AT 9`. */
export function tempoPointLabel(point: TempoPoint): string {
  return `${clampBpm(point.bpm)} ${point.slide ? 'BY' : 'AT'} ${clampTempoSlot(point.slot)}`;
}

// --- factories --------------------------------------------------------------

export function emptyCell(): Cell {
  // An empty step is at the DEFAULT velocity rather than at zero: the velocity
  // only means anything on a note, and a fresh grid that has to be "raised" to
  // full before it can be heard would be a trap.
  return {
    note: null, extra: [], drum: null,
    velocity: DEFAULT_VELOCITY, slide: false, stutter: DEFAULT_STUTTER, grace: 0, bend: 0,
  };
}

/**
 * How many notes one cell may hold.
 *
 * The same ceiling a channel can SOUND (`MAX_POLY`), which is the only number
 * that makes sense here: a cell with more notes than its channel can hold is a
 * chord that steals from itself, and a notation that can write something the
 * engine cannot play is a notation that lies.
 */
export const MAX_CELL_NOTES = MAX_POLY;

/**
 * What separates the notes of a chord inside one cell: `C-4,E-4,G-4`.
 *
 * A COMMA rather than a space, deliberately: a space is what separates one COLUMN
 * from the next, so a chord written with one would be indistinguishable from
 * several channels each holding a single note. Named here rather than spelled out
 * at each reader, so the grid, the file and the language can never disagree about
 * it — and so a tool that writes a song can ask which character a chord uses.
 */
export const CELL_NOTE_SEPARATOR = ',';

/**
 * Every note a cell sounds, lowest field first — `[]` for an empty step.
 *
 * The one reader for the two fields a cell keeps its notes in, so nothing outside
 * this file has to know there are two.
 */
export function cellNotes(cell: Cell): number[] {
  if (cell.note === null) return [];
  return [cell.note, ...cell.extra];
}

/**
 * Make a cell a DRUM HIT: one of the four kit sounds, at its own pitch.
 *
 * The third writer of a cell, and it keeps the same kind of invariant the other
 * two do: a drum is a HIT, so it holds no chord (`extra` is emptied) and its note
 * is the drum's own General MIDI pitch rather than whatever was there — which is
 * what makes the grid, the count and an export right without knowing what a drum
 * is. Passing `null` puts the cell back to an empty step.
 *
 * A cell is either a note, a chord or a drum, never two of them: writing a note
 * over a drum takes the drum off (see `setCellNotes`), and this takes the chord
 * off. That is the same "writing a cell writes its whole self" rule velocity and
 * articulation already follow, one field along.
 */
export function setCellDrum(cell: Cell, drum: DrumId | null): void {
  cell.extra = [];
  cell.drum = drum;
  cell.note = drum === null ? null : drumPitch(drum);
}

/**
 * Write a cell's notes, in this order, and keep the two fields consistent.
 *
 * The one WRITER, for the same reason: an empty list empties the step (which is
 * what makes `erase` and a `.` in a grid row mean the whole cell rather than the
 * first of its notes), a note outside the range is clamped, and a repeat of a
 * note already in the cell is dropped rather than sounded twice — which is what
 * `chord 0 1 Am` on a channel that already held its root used to be unable to say.
 * Order is kept as given, because the first note is the one the grid prints and a
 * voicing is a decision rather than an accident.
 */
export function setCellNotes(cell: Cell, notes: readonly number[]): void {
  // Writing notes takes the DRUM off: a step is one thing, and every writer here
  // says so in the same breath. A drum hit is written by `setCellDrum` instead.
  cell.drum = null;
  const kept: number[] = [];
  for (const note of notes) {
    const midi = clampMidi(note);
    if (kept.includes(midi)) continue;
    kept.push(midi);
    if (kept.length >= MAX_CELL_NOTES) break;
  }
  cell.note = kept.length === 0 ? null : kept[0];
  cell.extra = kept.slice(1);
}

/**
 * A cell's own copy, field for field.
 *
 * The one place the shape of a cell is written down twice, so a new column (an
 * instrument, a nibble) is added HERE and every copier — `copyPattern`, a range
 * repeat — picks it up rather than dropping it in silence. A dropped column is
 * the worst kind of bug this app can have: a copied bar that plays differently
 * from the bar it was copied from.
 */
export function copyCell(cell: Cell): Cell {
  return {
    note: cell.note,
    // A fresh array, because a copy that shared its notes with the cell it came
    // from would be a copy in name only.
    extra: [...cell.extra],
    // A drum's id is a string and no copy can alias it, so it travels plainly.
    drum: cell.drum,
    velocity: cell.velocity,
    // How the note is played travels with it, like its force: a copied bar keeps
    // its slides and its rolls, which is what makes a copy the way to build a
    // second section out of the first.
    slide: cell.slide,
    stutter: cell.stutter,
    grace: cell.grace,
    bend: cell.bend,
  };
}

export function emptyTrack(index: number): Track {
  return {
    name: `TRACK ${index + 1}`,
    muted: false,
    voice: voiceForTrack(index),
    hold: DEFAULT_HOLD,
    level: DEFAULT_LEVEL,
    pan: DEFAULT_PAN,
    glide: DEFAULT_GLIDE,
    vibrato: DEFAULT_VIBRATO,
    strum: DEFAULT_STRUM,
    robin: DEFAULT_ROBIN,
    touch: DEFAULT_TOUCH,
    drift: DEFAULT_DRIFT,
    verb: DEFAULT_VERB,
    echo: DEFAULT_TRACK_ECHO,
    // No stack: a channel starts as the one layer it has always been, so a new
    // song sounds exactly like it did before `layer` existed.
    stack: [],
    // Every effect off, which is not a taste but the rule: a channel nobody has
    // shaped is the channel this app has always played.
    drive: DEFAULT_EFFECT,
    cab: DEFAULT_EFFECT,
    tape: DEFAULT_EFFECT,
    radio: DEFAULT_EFFECT,
    vinyl: DEFAULT_EFFECT,
    chorus: DEFAULT_EFFECT,
    crush: DEFAULT_EFFECT,
    punch: DEFAULT_EFFECT,
    tilt: DEFAULT_EFFECT,
    gate: DEFAULT_EFFECT,
    // Nobody ducks anything: the mix this app has always made.
    duck: DEFAULT_DUCK,
    // And no channel has a feel of its own: the song's, exactly as before.
    groove: null,
    humanize: DEFAULT_HUMANIZE,
    // One note at a time, which is what every song in this app has ever been.
    poly: DEFAULT_POLY,
    // And the filter it has always had: the low-pass. A channel with no opinion
    // is filtered exactly as it was before a shape existed.
    shape: DEFAULT_SHAPE,
    // And on no group at all: a channel nobody has grouped is mixed exactly as it
    // was before buses existed, which is what every channel in every song is.
    bus: null,
    // And plays its own built-in sound: a channel that names no recording is the
    // channel this app has always played.
    sample: null,
  };
}


/**
 * Tidy a name the way both the script parser and the click-to-rename box do:
 * upper-cased (the UI is written in capitals) and trimmed, so "  lead " becomes
 * `LEAD` and a name can never be all spaces.
 */
export function tidyTrackName(name: string): string {
  return name.trim().toUpperCase().slice(0, MAX_TRACK_NAME);
}

/** True when a name fits the limit — what the script parser checks. */
export function isTrackNameLength(name: string): boolean {
  return name.trim().length <= MAX_TRACK_NAME;
}

/**
 * The song title's counterpart of `tidyTrackName`: same rule, so a title typed
 * into the header and a title written in a script come out identical.
 */
export function tidySongTitle(title: string): string {
  return title.trim().toUpperCase().slice(0, MAX_SONG_TITLE);
}

/** True when a title fits the limit — what the script parser checks. */
export function isSongTitleLength(title: string): boolean {
  return title.trim().length <= MAX_SONG_TITLE;
}

/** A pattern of `rows` empty steps across `trackCount` tracks. */
export function emptyPattern(name: string, rows = DEFAULT_ROWS, trackCount = DEFAULT_TRACKS): Pattern {
  return {
    name,
    steps: Array.from({ length: rows }, () =>
      Array.from({ length: trackCount }, emptyCell),
    ),
  };
}

/** A brand-new, empty song: one empty pattern, four named tracks. */
export function createSong(): Song {
  return {
    title: UNTITLED_TITLE,
    key: copyKey(DEFAULT_KEY),
    bpm: DEFAULT_BPM,
    rowsPerBeat: ROWS_PER_BEAT,
    tracks: Array.from({ length: DEFAULT_TRACKS }, (_, i) => emptyTrack(i)),
    patterns: [emptyPattern('PATTERN 1')],
    order: [1],
    sections: [],
    arrangement: [],
    // No scenes: a new song plays its order, which is what every song before
    // Live did — a scene is a way of PERFORMING the song, not the song itself.
    scenes: [],
    // No progression: a new song's harmony is whatever is written in its cells,
    // which is what every song before this existed meant.
    progression: null,
    // No groups: a new song's faders are one per channel, which is how every song
    // was mixed before buses existed.
    buses: [],
    swing: DEFAULT_SWING,
    speed: DEFAULT_SPEED,
    tempoMap: [],
    automation: [],
    groove: DEFAULT_GROOVE,
    kit: DEFAULT_KIT,
    reverb: DEFAULT_REVERB,
    echo: DEFAULT_ECHO,
    master: { ...NO_EFFECTS },
    tuning: DEFAULT_TUNING,
    // No machine: a new song's percussion is whatever its cells say, which is what
    // every song before the machine existed meant.
    machine: null,
    // No arp: a new song's runs are whatever its cells say, which is what every
    // song before the ARP page meant.
    arp: null,
  };
}

/**
 * Make every pattern match the current track count. Kept as one function so
 * every edit path (add a track, remove a track, apply a script) reshapes the
 * song the same way.
 */
export function reshape(song: Song): void {
  const tracks = song.tracks.length;
  for (const pattern of song.patterns) {
    for (const row of pattern.steps) {
      while (row.length < tracks) row.push(emptyCell());
      if (row.length > tracks) row.length = tracks;
    }
  }
}

export function addTrack(song: Song): number {
  if (song.tracks.length >= MAX_TRACKS) return song.tracks.length - 1;
  song.tracks.push(emptyTrack(song.tracks.length));
  reshape(song);
  return song.tracks.length - 1;
}

/** Remove a track. Always keeps at least one, so the grid is never zero-wide. */
export function removeTrack(song: Song, index: number): void {
  if (song.tracks.length <= MIN_TRACKS) return;
  song.tracks.splice(index, 1);
  reshape(song);
}

/**
 * Set the channel count outright, growing with fresh named tracks or trimming
 * from the end. This is the one place a count changes, so a script, the +ADD
 * button and a future instrument panel all land in the same shape.
 */
export function setTrackCount(song: Song, count: number): void {
  const target = Math.max(MIN_TRACKS, Math.min(MAX_TRACKS, Math.round(count)));
  while (song.tracks.length < target) song.tracks.push(emptyTrack(song.tracks.length));
  if (song.tracks.length > target) song.tracks.length = target;
  reshape(song);
}

/** How many steps every pattern in a song has (they share one grid). */
export function patternRows(song: Song): number {
  return song.patterns[0]?.steps.length ?? DEFAULT_ROWS;
}

/**
 * Resize every pattern to `rows` steps.
 *
 * The patterns of a song share one grid, so a length is a property of the
 * SONG and not of one pattern: growing pads every pattern with empty steps,
 * shrinking trims the tail off all of them. That is why this is one function
 * used by the script's `steps` statement, and by anything else that will want
 * to change the grid later.
 */
export function setPatternRows(song: Song, rows: number): void {
  const target = clampRows(rows);
  for (const pattern of song.patterns) {
    while (pattern.steps.length < target) {
      pattern.steps.push(Array.from({ length: song.tracks.length }, emptyCell));
    }
    if (pattern.steps.length > target) pattern.steps.length = target;
  }
  reshape(song);
}

/**
 * The pattern at a 1-BASED index, creating it (and any it skipped past) on
 * demand. Scripts address patterns the way the UI labels them — `PATTERN 2` —
 * so every index that reaches the model comes through here.
 */
export function ensurePattern(song: Song, oneBased: number): Pattern {
  const index = Math.max(0, Math.min(MAX_PATTERNS - 1, Math.round(oneBased) - 1));
  const rows = patternRows(song);
  while (song.patterns.length <= index) {
    song.patterns.push(emptyPattern(`PATTERN ${song.patterns.length + 1}`, rows, song.tracks.length));
  }
  return song.patterns[index];
}

/** Copy one pattern's steps into another, staying within the song's shape. */
export function copyPattern(song: Song, fromOneBased: number, toOneBased: number): void {
  const from = ensurePattern(song, fromOneBased);
  const to = ensurePattern(song, toOneBased);
  to.name = from.name;
  to.steps = from.steps.map((row) => row.map((cell) => copyCell(cell)));
  reshape(song);
}

// --- the song order ---------------------------------------------------------

/** Clamp a 1-based pattern number into the range patterns can occupy. */
export function clampPatternNumber(n: number): number {
  return Math.max(1, Math.min(MAX_PATTERNS, Math.round(n)));
}

/**
 * The lines in the song: how many steps the order plays before it loops.
 *
 * Every pattern shares the song's grid length, so the song is simply
 * `slots × rows` steps long — which is the number the sequencer loops over, and
 * why a longer order needs no new arithmetic anywhere.
 */
export function songSteps(song: Song): number {
  return Math.max(1, song.order.length) * Math.max(1, patternRows(song));
}

/**
 * Where a step of the SONG lands: which slot, which pattern, and which row.
 *
 * The sequencer counts steps from the start of the order, but the grid, the
 * piano and the pattern view all think in one pattern at a time, so this is the
 * one conversion between the two: one call site for the playhead, and one for
 * the notes.
 */
export function stepToSlot(song: Song, step: number): { slot: number; pattern: number; row: number } {
  const rows = Math.max(1, patternRows(song));
  const total = songSteps(song);
  const at = ((Math.round(step) % total) + total) % total;
  const slot = Math.floor(at / rows);
  // `pattern` is a 0-BASED index, because every caller indexes `song.patterns`.
  return { slot, pattern: (song.order[slot] ?? 1) - 1, row: at % rows };
}

/** The order as one label, e.g. `1-2-1`. */
export function orderLabel(song: Song): string {
  return song.order.join('-');
}

/** True when every pattern the order plays is empty — the check before playing. */
export function isOrderEmpty(song: Song): boolean {
  return song.order.every((oneBased) => {
    const pattern = song.patterns[oneBased - 1];
    return pattern === undefined || isPatternEmpty(pattern);
  });
}

/**
 * Forget which sections the order was arranged from.
 *
 * Called by every edit to the order, because `arrangement` is a CLAIM about the
 * order — "these four bars are the chorus" — and an edit makes it a stale one.
 * Nothing is lost by forgetting: the sections themselves stay, so the form is one
 * `arrange …` line away from being restored, and a screen that drew the old
 * labels over a new order would be the one thing this app does not do.
 */
export function forgetArrangement(song: Song): void {
  song.arrangement = [];
}

/** Add a slot to the end of the song. Returns its index, or -1 when full. */
export function appendOrder(song: Song, oneBased: number): number {
  if (song.order.length >= MAX_ORDER) return -1;
  const n = clampPatternNumber(oneBased);
  ensurePattern(song, n);
  forgetArrangement(song);
  song.order.push(n);
  return song.order.length - 1;
}

/** Remove one slot. Refuses the last one: a song always plays something. */
export function removeOrder(song: Song, index: number): boolean {
  if (song.order.length <= 1 || index < 0 || index >= song.order.length) return false;
  forgetArrangement(song);
  song.order.splice(index, 1);
  return true;
}

/** Point one slot at a different pattern, creating it if the song has not. */
export function setOrderPattern(song: Song, index: number, oneBased: number): boolean {
  if (index < 0 || index >= song.order.length) return false;
  const n = clampPatternNumber(oneBased);
  ensurePattern(song, n);
  forgetArrangement(song);
  song.order[index] = n;
  return true;
}

/**
 * Replace the whole order — what a script's `order` line does.
 *
 * Every pattern the order names is created on demand, exactly as `pattern 3`
 * would create it, so `order 1 2 1` on a fresh song gives a three-bar song whose
 * second bar is waiting to be written rather than an error.
 */
export function setOrder(song: Song, list: readonly number[]): void {
  const cleaned = list
    .filter((n) => Number.isFinite(n))
    .map(clampPatternNumber)
    .slice(0, MAX_ORDER);
  // An empty order would be a song with no bars, so it means "just the first".
  forgetArrangement(song);
  song.order = cleaned.length > 0 ? cleaned : [1];
  for (const n of song.order) ensurePattern(song, n);
}

/**
 * The order, repaired: never empty, every slot a pattern that exists.
 *
 * Called after anything that can reshape the song, because a slot pointing past
 * the last pattern would be a bar of silence the player never asked for.
 */
export function normalizeOrder(song: Song): void {
  const last = Math.max(1, song.patterns.length);
  const cleaned = song.order
    .filter((n) => Number.isInteger(n) && n >= 1)
    .map((n) => Math.min(last, n))
    .slice(0, MAX_ORDER);
  song.order = cleaned.length > 0 ? cleaned : [1];
}

// --- queries ----------------------------------------------------------------

/** How many steps in a pattern hold a note. */
export function countNotes(pattern: Pattern): number {
  let n = 0;
  for (const row of pattern.steps) {
    for (const cell of row) if (cell.note !== null) n += 1 + cell.extra.length;
  }
  return n;
}

/** A pattern with no notes yet. Drives the editor's empty state. */
export function isPatternEmpty(pattern: Pattern): boolean {
  return countNotes(pattern) === 0;
}

/**
/**
 * Every note sounding on a row, for the sequencer.
 *
 * A cell that holds a chord answers with one note per pitch it holds, in the
 * order the cell keeps them, all on the same channel — which is what a chord IS
 * in a tracker that lets one channel sound several notes. A single-note cell
 * answers with exactly the one entry it always did.
 *
 * The velocity is clamped on the way out, so a hand-edited file or a bug
 * elsewhere can leave a wild number on a cell without it ever reaching the audio
 * graph: the range is the guarantee, and the guarantee is kept at the door.
 */
export function rowNotes(
  pattern: Pattern,
  row: number,
): { track: number; midi: number; velocity: number; articulation: Articulation; drum: DrumId | null }[] {
  const cells = pattern.steps[row];
  if (!cells) return [];
  type RowNote = { track: number; midi: number; velocity: number; articulation: Articulation; drum: DrumId | null };
  const out: RowNote[] = [];
  cells.forEach((cell, track) => {
    // The articulation travels WITH the note rather than being looked up later,
    // because both audio paths and the MIDI writer need it beside the pitch they
    // are already reading — and because it is one thing: how this note is played.
    // A chord shares it, the way it shares its force: one cell is one gesture.
    const articulation = tidyArticulation({ slide: cell.slide, stutter: cell.stutter, grace: cell.grace, bend: cell.bend });
    const velocity = clampVelocity(cell.velocity);
    // The DRUM travels with the note for the same reason, and it is only ever on
    // the cell's FIRST note: a drum hit holds no chord, so a row answers with one
    // drum note per drum cell and the pitch beside it is the drum's own.
    for (const midi of cellNotes(cell)) {
      out.push({ track, midi, velocity, articulation, drum: cell.drum });
    }
  });
  return out;
}

// --- note text --------------------------------------------------------------

/**
 * The label for a cell: the note, or an empty `...` gutter.
 *
 * A cell that holds a chord wears `+N` after its first note — `C-4+2` for a triad
 * — because the grid column is three characters wide and a chord cannot be
 * spelled in three characters. The first note still starts at the same place in
 * the column, so nothing moves; `+2` is the same shorthand the channel list uses
 * for a stack. Which notes the other two ARE is the inspector's job, and the
 * file's: the grid is a glance, not a read-out.
 */
export function cellText(cell: Cell): string {
  if (cell.note === null) return '...';
  // A drum wears its NAME rather than its pitch, because nobody can hear a kick
  // in `C-2`: `KCK` is the percussion step view in the three characters a column
  // has, and the whole point of a kit is that a beat reads as words.
  if (cell.drum !== null) return drumLabel(cell.drum);
  const label = midiToNoteName(cell.note);
  return cell.extra.length === 0 ? label : `${label}+${cell.extra.length}`;
}

// --- whole-song queries -----------------------------------------------------

/** Every note in the song, across every pattern. */
export function countSongNotes(song: Song): number {
  return song.patterns.reduce((total, pattern) => total + countNotes(pattern), 0);
}

/** True when nothing in the song has a note yet. */
export function isSongEmpty(song: Song): boolean {
  return countSongNotes(song) === 0;
}

/** The channels that carry at least one note somewhere in the song. */
export function usedTracks(song: Song): boolean[] {
  const used = song.tracks.map(() => false);
  for (const pattern of song.patterns) {
    for (const row of pattern.steps) {
      row.forEach((cell, track) => {
        if (cell.note !== null && track < used.length) used[track] = true;
      });
    }
  }
  return used;
}

/** A one-line description of the song, for a status bar or a toast. */
export function describeSong(song: Song): string {
  return `${song.patterns.length} PATTERN${song.patterns.length === 1 ? '' : 'S'}  ·  ${song.tracks.length} TRACKS  ·  ${patternRows(song)} STEPS  ·  ${countSongNotes(song)} NOTES  ·  ${song.bpm} BPM`;
}
