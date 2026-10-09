/**
 * capabilities — what THIS build of Tracklet Script speaks, as data.
 *
 * The docs are the language's contract, and they are good, but a document is a
 * claim about a build rather than the build itself. This module is the other
 * half: one function, `scriptCapabilities()`, that answers the questions a tool
 * — or a language model — has to ask before it writes a line, without reading a
 * single file or guessing a version:
 *
 * - **Which words exist?** `keywords`, and `commands` with one example each.
 * - **How deep is this word?** `tiers`: `core` is what a beginner needs (tempo,
 *   channels, patterns, notes); `deep` is sound design and the session settings.
 * - **What are the numbers?** `limits`: every range the language clamps to, from
 *   the same constants the parser reads, so a published limit cannot drift from
 *   the limit that is enforced.
 * - **What are the closed word lists?** `vocabulary`: the waves, voices, knobs,
 *   layer fields, tunings, grooves, consoles and scales a script may name.
 * - **What can I write, exactly?** `commands[].example` — one line per command,
 *   each applied by a test, so a published example cannot rot.
 *
 * It is published as `window.__tracklet.capabilities` in development (see
 * `main.ts`), which is the cheapest useful thing a running app can tell an
 * agent: ask the build in front of you what it speaks instead of assuming the
 * reference you memorized is current.
 *
 * ── Why a version number here and not in the file format ─────────────────────
 * A song file says which version wrote it (`SONG_FILE_VERSION`), which is a
 * question about BYTES. `SCRIPT_VERSION` is a question about WORDS: a tool that
 * wants a `layer` statement can ask for version 2 and be told no by a build that
 * only knows 1, instead of writing a line that fails to parse. The file format
 * stays additive; the language gets a version.
 */

import { AUTOMATION_TARGETS, MAX_AUTOMATION_LANES } from './automation';
import { PAGE_NAMES } from './pages';
import { GENRES } from './genre';
import { GRID_NAMES, METER_UNITS } from './grid';
import { MAX_SECTION_NAME, MAX_SECTIONS } from './sections';
import {
  DEFAULT_LIVE_QUANTIZE,
  MAX_LIVE_QUANTIZE,
  MAX_SCENES,
  MAX_SCENE_NAME,
  MIN_LIVE_QUANTIZE,
} from './scenes';
import { CHIPS } from './chip';
import { CHORD_SPELLINGS, DEFAULT_CHORD_DEGREES, MAX_CHORD_DEGREES } from './chord';
import {
  DEFAULT_PROGRESSION_HOLD,
  FOLLOW_WORD,
  MAX_PROGRESSION_HOLD,
  MAX_PROGRESSION_STEPS,
  MIN_PROGRESSION_HOLD,
  PROGRESSION_HOLD_WORD,
  PROGRESSION_NONE_WORD,
} from './progression';
import { FILTER_SHAPES } from './shape';
import { MAX_BUSES, MAX_BUS_NAME } from './bus';
import {
  FALL_CHAR,
  GRACE_CHAR,
  MAX_BEND,
  MAX_GRACE,
  MAX_STUTTER,
  MIN_BEND,
  MIN_STUTTER,
  SCOOP_CHAR,
  SLIDE_CHAR,
  STUTTER_CHAR,
} from './articulation';
import { ROBIN_MAX, ROBIN_MIN, TOUCH_MAX, TOUCH_MIN } from './variation';
import { DRIFT_MAX, DRIFT_MIN } from './drift';
import { SPEED_MAX, SPEED_MIN } from './speed';
import { DRUMS } from './drum';
import { DEFAULT_KIT, KITS } from './kit';
import {
  DEFAULT_MACHINE_STEPS,
  MAX_MACHINE_BARS,
  MAX_MACHINE_BEAT,
  MAX_MACHINE_STEPS,
  MAX_PADS,
  MIN_MACHINE_BEAT,
  MIN_MACHINE_STEPS,
} from './machine';
import {
  MAX_SAMPLE_NAME,
  MAX_SAMPLE_SECONDS,
  MAX_SAMPLES,
  MIN_SAMPLE_SECONDS,
  SAMPLE_ROOT_HZ,
} from './sample';
import { ARP_ALIASES, ARP_DIRECTIONS, MAX_ARP_STEPS, MIN_ARP_STEPS } from './chord';
import {
  ARP_MODES,
  MAX_ARP_GATE,
  MAX_ARP_OCTAVES,
  MAX_ARP_RATE,
  MIN_ARP_GATE,
  MIN_ARP_OCTAVES,
  MIN_ARP_RATE,
  type ArpMode,
} from './arp';
import { MAX_REPEAT, MIN_REPEAT } from './sections';
import {
  MAX_OCTAVE_SHIFT,
  MAX_ROLL_HITS,
  MIN_OCTAVE_SHIFT,
  MIN_ROLL_HITS,
  MIN_ROW_REPEAT,
  ROW_TRANSFORMS,
} from './rows';
import { LAYER_FIELDS, MAX_EXTRA_LAYERS, MAX_LAYERS, MAX_USER_VOICES } from './instrument';
import { MIDI_MAX, MIDI_MIN } from './notes';
import { SCALES } from './scale';
import {
  BPM_MAX,
  BPM_MIN,
  DEFAULT_TRACKS,
  GROOVES,
  MAX_EFFECT,
  MIN_EFFECT,
  TRACK_EFFECTS,
  MAX_HOLD,
  MAX_LEVEL,
  MAX_ORDER,
  MAX_PAN,
  MAX_PATTERNS,
  MAX_ROOM,
  MAX_ROWS,
  MAX_ROWS_PER_BEAT,
  MAX_SEND,
  MAX_SONG_TITLE,
  MAX_SWING,
  MAX_TEMPO_POINTS,
  MAX_TRACK_NAME,
  MAX_TRACKS,
  MAX_VELOCITY,
  MAX_DUCK,
  MAX_HUMANIZE,
  MAX_POLY,
  MIN_DUCK,
  MIN_HUMANIZE,
  MIN_POLY,
  MIN_HOLD,
  MIN_LEVEL,
  MIN_PAN,
  MIN_ROOM,
  MIN_ROWS,
  MIN_ROWS_PER_BEAT,
  MIN_SEND,
  MIN_SWING,
  MIN_TRACKS,
  MIN_VELOCITY,
  CELL_NOTE_SEPARATOR,
  MAX_CELL_NOTES,
} from './song';
import { SCRIPT_DOC_PATH, SCRIPT_KEYWORDS, SCRIPT_OCTAVE_MAX, SCRIPT_OCTAVE_MIN } from './script';
import { SONG_FILE_VERSION, SONG_FILE_VERSION_MAX, STACK_SONG_FILE_VERSION } from './songfile';
import { TUNINGS } from './tuning';
import { MAX_PARAM, MAX_VOICE_NAME, MIN_PARAM, VOICE_PARAMS, VOICES, WAVES } from './voice';

/**
 * Which language this build speaks.
 *
 * `1` is the language before a channel could be more than its voice: no `layer`
 * statement, no stacks in a saved sound, no `+2` anywhere. `2` added
 * `layer TRACK LAYER …`, the `F7` design screen, and a song file at version 13
 * when a channel is stacked. `3` added six EFFECT words on a channel
 * (`drive`, `chorus`, `crush`, `punch`, `tilt`, `gate`), and a song file at
 * version 14 when a channel has one on; a SEVENTH, an EIGHTH and a NINTH arrived
 * at `23`, `24` and `25` (`cab`, `tape`, `radio`) — see the notes there.
 *
 * `3` also took one spelling AWAY, which is the first time a version has done
 * that: `chorus` used to be an alias of the `thick` knob, and it is now the
 * effect. A script that meant the knob writes `thick` or `width`; a saved song
 * never noticed, because a file writes the knob's own name.
 *
 * `4` added `master drive 20 tilt 15` — the same effect words on
 * the WHOLE MIX rather than on one channel — and a song file at version 15 when
 * the mix has one on.
 *
 * `5` added `duck`, a percentage on a TRACK line for how far that channel pushes
 * the rest of the mix down while it plays (`track 1 duck 60` is the pump under a
 * four-on-the-floor kick). A setting rather than a verb, so nothing else moved,
 * and a song file declares version 16 only when a channel actually ducks.
 *
 * `6` added `automate`: `automate 2 bright 15 95 bars 8 to 15` — a lane, which is
 * a value that MOVES over bars rather than a value — and a song file at version 17
 * when a song has one. The first statement in this language about WHEN rather
 * than about what, and one word for eleven targets rather than eleven words,
 * because a lane is a shape: a target, two ends and a range.
 * `7` is this build: `section VERSE 1 1 2 1` and `arrange VERSE CHORUS VERSE` —
 * the song's FORM, written with names for groups of bars, and a song file at
 * version 18 when a song has any. `arrange` BUILDS the `order`, so nothing below
 * this line changed: a section is a way of writing an arrangement, not a second
 * one, and a song with no sections is byte for byte the song it was.
 *
 * `8` added `grid 16` and `meter 7 8` — the same `steps`/`beat` pair the
 * language already had, spelled in note values. Pure sugar, so nothing else moved:
 * a grid is resolved to two numbers while the script is read, and the engine, the
 * renderer and the file never learn the words exist. No new file version, because
 * a song still stores a bar as `steps` and `beat`.
 *
 * `9` added two words about the mix rather than about a note. `bus DRUMS 70` is
 * one fader over the channels that join it, and a channel joins it with `bus` on
 * its own track line — so a kit is moved by one line instead of four. A song whose
 * channels are grouped declares file version 22, because an older build would play
 * it at every channel's own fader and then save the groups away.
 * (`shape` on a track line — the filter `bright` opens — landed between the two
 * and was folded into this version number rather than left unannounced, since a
 * consumer learning the language from this list has to be told about it once.)
 *
 * `10` added an ARTICULATION on a note. `C-4>` slides into its pitch,
 * `C-4*3` hits it three times inside its own step, and `C-4>*3~80` is both at
 * velocity 80 — a suffix on the note rather than a new word, which is why the
 * version note is the only place a consumer is told the VALUE changed shape. It
 * belongs to the cell rather than to the channel (the channel has `glide`; this
 * is one note), and a song with an articulated note declares file version 23,
 * because an older build would refuse the file outright: a three-element cell is
 * not a shape it knows.
 *
 * `11` added two GENERATORS, as modifiers rather than words. `chord 0 1
 * Am arp up 8` writes the chord's tones one per step, climbing, on the channel it
 * names — the arpeggio — and `arrange VERSE CHORUS repeat 3` plays a section three
 * times in all. Neither changes a file: an arp is notes in an order and a repeat
 * is an arrangement, both of which the song already stores, so no song's bytes
 * move and `SONG_FILE_VERSION_MAX` stands.
 *
 * `12` is this build: `rows A to B …`, a RANGE OF STEPS — the one grammar the
 * language was missing, because every other statement names ONE place. Two
 * transformations ride on it: `rows 0 to 3 octave up` moves the pitches in that
 * run of steps by whole octaves, and `rows 0 to 3 repeat 4` plays the run four
 * times in all. This is the first version to grow a KEYWORD since `bus`, and it
 * is the same kind of change as `arp`: it changes the CELLS a song holds rather
 * than the fields it stores, so no file version moves either. A tool that knows
 * version 11 but not 12 would read `rows` as an unknown command.
 */
/**
 * 13 added the CHORD IN ONE CELL: a cell may hold several notes, written with a
 * comma — `C-4,E-4,G-4` — which is the notation half of polyphonic channels. Until
 * now a cell held one note per channel, so a triad cost three channels; a channel
 * that is WIDE enough (`track 2 poly 3`) now keeps the whole chord at one step. A
 * chord only sounds on a channel wide enough to hold it, and a script that writes
 * one on a narrow channel is refused rather than thinned out in silence — which is
 * the one way a version-13 script can FAIL where a version-12 one did not, and the
 * reason this is a version rather than a spelling. A tool that knows version 12 but
 * not 13 would read `C-4,E-4,G-4` as a note it cannot spell, and would apply
 * `chord 0 1 Am` across three channels where this build puts it in one cell.
 */
/**
 * 14 added the DRUM: `drum ROW TRACK DRUM`, and a grid word that names one
 * (`kick . hat .`), so one channel can be a whole kit — a kick, a snare and a hat
 * at their own steps instead of three channels that happen to play at once. It is
 * this language's second new WORD in a row (after `rows`) and the first since
 * `bus`, and it is a word rather than a setting because a drum hit is not a note
 * with something attached: it is a cell whose SOUND the line names. A tool that
 * knows version 13 would read `kick` as an unknown command and `drum 0 4 kick` as
 * an unknown word, which is why this is a version rather than a spelling.
 */
/**
 * 15 added the KIT: `kit 808` (or `brush`, or `rock`) chooses which four patches
 * a drum hit plays, so one word is a whole drum machine and a song can be a kit
 * rather than a note. `studio` — the four presets — is the default, so a song
 * that names no kit sounds exactly as it did and a file that says nothing about
 * one is byte-for-byte the file it was. A version rather than a spelling because
 * a tool that knows version 14 would read `kit` as an unknown command, and a
 * version-15 script applied by such a tool would be a beat on the wrong drums
 * with nothing to say so.
 */
/**
 * 16 added the SAMPLE: `sample BRK02` on a track line names a recording of
 * yours, which a channel on `wave sample` plays instead of the built-in one-shot
 * — and `sample load "path"` / `sample import` are how that recording gets into
 * the app, since a browser cannot read a path and the file does not exist until
 * somebody picks it. The recording itself is never in the song: the file holds a
 * name, the APP holds the audio, and a name the app does not have falls back to
 * the one-shot the channel's `duty` picks, which is why a song written on one
 * machine still plays on another. A version rather than a spelling because a tool
 * that knows version 15 would read `sample` as an unknown command and drop the
 * line, and a channel it meant to dress would come back as its plain sound.
 */
/**
 * 17 added the PROGRESSION: `progression Am F C G` is one chord loop the whole
 * song hangs on, written as chord names or as scale degrees (`1 6 3 7`), with a
 * `hold` clause saying how many steps each chord lasts. It is a DEFINITION rather
 * than a performance, like `section`, and what uses it are two followers written
 * as modifiers on statements that already exist — `chord 0 3 follow` fills a
 * keyboard channel with the chords, `note 0 4 follow` fills a bass channel with
 * their roots. Both WRITE the notes into cells, so the grid, the file, `Ctrl+Z`
 * and an export all see the same thing. A version rather than a spelling because
 * a tool that knows version 16 would refuse `follow` in the chord's slot — so a
 * song it meant to hang on four chords would come back as an empty channel.
 */
/**
 * 18 added the GENRE STARTER: `start house` (or `lofi`, or `ballad`) writes a
 * whole working skeleton — key, tempo, feel, kit, named channels with their
 * sounds, a drum figure, a chord loop and a form — which the author then edits
 * rather than invents. It is the one word here that writes a SCRIPT rather than
 * a song: the starter is ordinary notation (see `model/genre.ts`), spliced in at
 * the `start` line and applied by the appliers everything else uses, so it can
 * describe nothing the language cannot say and `SAVE AS SCRIPT` prints the whole
 * skeleton back out as lines to read. A version rather than a spelling because a
 * tool that knows version 17 would read `start` as an unknown command and refuse
 * the first line of a script whose whole point was to begin.
 */
/**
 * 19 added the EXPORT REGION: `export bars 8 to 15` renders only those bars of
 * the order — the loop region — and `export all` puts the whole song back. It is
 * a SESSION setting rather than song data, like `theme` and `solo`: the song is
 * the whole song either way, a file never carries one, and what uses it is the two
 * audio exports (`EXPORT AUDIO` and `EXPORT STEMS`). `bars A to B` is not new
 * grammar — `bars` is the word `automate` already uses for a range of bars and
 * `A to B` is the shape `rows` takes — so what a version-18 tool would get wrong
 * is the STATEMENT, not a line it cannot read: it would treat `export` as unknown
 * and refuse a script that bounces a chorus.
 */
/**
 * 20 added the LOUDNESS TARGET: `export loud -14` normalises an audio export to
 * that many LUFS, and `export loud off` puts the master fader back in charge. It
 * attaches to the statement version 19 introduced — one line sets a region, a
 * target, or both — so a `loud` clause is a new VALUE rather than a new verb. The
 * measurement is ITU-R BS.1770, which is what makes the number mean the same
 * thing to somebody else's program; like the region it is a session setting, so
 * no file carries one, and what uses it is `EXPORT AUDIO` and `EXPORT STEMS`.
 */
/**
 * 21 widened the KIT: `kit` no longer takes only the four words this app ships
 * (`studio`, `808`, `brush`, `rock`) — any other word names a kit of YOUR OWN,
 * saved as a `.kit.json` (`F2 → KITS…`) and resolved against a library the app
 * keeps. No word was added and no line changed shape, so a version-20 tool reads
 * every script it read before; what it cannot know is that a kit NAME it does not
 * recognise is now legal, and that a song naming one it does not have plays the
 * four PRESETS (the same bargain a missing sample makes). The four built-in words
 * are still a closed list and still win a tie, which is why a tool may go on
 * treating them as the whole vocabulary and only miss the portability.
 */
/**
 * 22 widened the closed lists a statement already drew from, which is the same
 * shape of change as `21`'s kit and needs saying for the same reason. A SCALE
 * gained three words (`key D mixolydian`, `key E phrygian`, `key A blues`), a
 * CHORD gained six shapes (`A5`, `Dsus4`, `G6`, `Cadd9`, `C9`, and `sus2`), a
 * FEEL gained three (`groove boom-bap`, `groove swing-16`, `groove d-beat`), and
 * two KITS joined the built-ins (`metal`, `dusty`). No word was added and no line
 * changed shape — a version-21 tool reads every script it read before — but it
 * would REFUSE a scale, a shape or a feel it was never taught, and it would get
 * the two kits WRONG in silence: since 21 any unrecognised `kit` word is a kit of
 * the user's OWN, so a version-21 build reads `kit metal` as somebody's name,
 * finds none in the library, and plays the four presets. That is the documented
 * fallback rather than a bug in either build, and it is the reason a kit word is
 * the one widening here worth upgrading for. The whole set is why the phase plan
 * called this section "idiom vocabulary" rather than "grammar": the sentences do
 * not move, the words in them do.
 */
/**
 * 23 added a SEVENTH EFFECT: `cab`, a speaker box — a low-pass with a mid push
 * and a little of the very bottom taken away — written on a `track` line beside
 * the other six (`track 1 drive 40 cab 60`) and on `master` the same way.
 *
 * An effect is a KEY a statement already takes rather than a new verb, which is
 * how `3` and `4` added the first six, so a version-22 tool reads every line it
 * read before and refuses the one word it was never taught — it is not a value
 * any of the six it knows can take. A song with a cabinet on it writes file
 * version 30.
 */
/**
 * 24 added an EIGHTH EFFECT: `tape`, a whole tape machine behind one number — a
 * soft saturation, a transport that wanders (wow at two rates, flutter at a
 * third) and a hiss bed — written on a `track` line beside the other seven
 * (`track 1 tape 40`) and on `master` the same way.
 *
 * The same shape of change as `3`, `4` and `23`: a KEY a statement already takes
 * rather than a new verb, so a version-23 tool reads every line it read before and
 * refuses the one word it was never taught. A song with tape on it writes file
 * version 31.
 */
/**
 * 25 added a NINTH EFFECT: `radio`, a telephone line behind one number — the
 * band narrows to roughly 300 Hz..3.4 kHz and the signal inside it gets coarse
 * — written on a `track` line beside the other eight (`track 1 radio 70`) and on
 * `master` the same way.
 *
 * The same shape of change as `3`, `4`, `23` and `24`: a KEY a statement already
 * takes rather than a new verb. A song with a telephone on it writes file version
 * 32.
 */
/**
 * 26 added a TENTH EFFECT: `vinyl`, a record under the part behind one number — a
 * quiet surface hiss with the crackle of dust and scratches on top — written on a
 * `track` line beside the other nine (`track 1 vinyl 30`) and on `master` the same
 * way.
 *
 * The same shape of change as `3`, `4`, `23`, `24` and `25`: a KEY a statement
 * already takes rather than a new verb. A song with a record on it writes file
 * version 33.
 */
/**
 * 27 added a fourteenth WAVE: `reed`, a buzzing exciter driving a resonant tube,
 * written exactly where every shape is — `track 1 wave reed`, or `wave reed duty
 * 60` to pick which reed — and whose character `duty` chooses from a bank of six.
 *
 * A new VALUE for the `wave` statement rather than a new statement, so a
 * version-26 tool reads every line it read before and refuses the one word it was
 * never taught. This was the first wave added since the language was numbered,
 * which is why it is the first that carries a note; the earlier shapes arrived
 * before `SCRIPT_VERSION` existed to record them.
 */
/**
 * 28 added a fifteenth WAVE: `brass`, a lip buzzing into a flared metal bore,
 * written like every shape — `track 1 wave brass`, or `wave brass duty 60` to pick
 * which instrument — and whose character `duty` chooses from a bank of six
 * (`trumpet`, `trombone`, `horn`, `tuba`, `flugel`, `muted`).
 *
 * A second new VALUE for the `wave` statement, one turn after `reed`: the same
 * machinery with the numbers a lip has rather than a reed's. A version-27 tool
 * refuses the word rather than guessing it.
 */
/**
 * 29 added a sixteenth WAVE: `bow`, a stick-slip exciter (a bow dragging a string)
 * driving a hollow body, written like every shape — `track 1 wave bow`, or `wave
 * bow duty 60` to pick which instrument — and whose character `duty` chooses from
 * a bank of six (`violin`, `viola`, `cello`, `bass`, `erhu`, `strings`).
 *
 * The third new VALUE for the `wave` statement in three turns, and the third bank
 * on the same excited-tube machinery: a wind instrument's peaks sit high and
 * pointed, a bowed body's sit low and broad. A version-28 tool refuses the word.
 */
/**
 * 30 added a seventeenth WAVE: `mallet`, a struck bar whose overtones are
 * INHARMONIC — `track 1 wave mallet`, or `wave mallet duty 60` to pick which bar —
 * and whose character `duty` chooses from a bank of six (`marimba`, `xylophone`,
 * `vibraphone`, `glockenspiel`, `music box`, `kalimba`).
 *
 * The first wave of the struck family, and the first that is not a harmonic
 * spectrum at all: a bar's overtones are not whole multiples of the note, so this
 * is a rendered one-shot rather than a `PeriodicWave` — like `string` and `sample`,
 * it sounds once and rings down. A version-29 tool refuses the word.
 */
/**
 * 31 added an eighteenth WAVE: `membrane`, a struck SKIN — `track 1 wave membrane`,
 * or `wave membrane duty 60` to pick which drum — and whose character `duty`
 * chooses from a bank of six (`tom`, `timpani`, `conga`, `tabla`, `djembe`,
 * `frame`).
 *
 * The second wave of the struck family, and the same rendered one-shot as `mallet`
 * with the numbers a skin has instead of a bar's: its overtones are the dense,
 * close Bessel ratios of a circle rather than a bar's sparse ones, so it thuds
 * rather than chimes, and its pitch DROOPS as the skin relaxes. A version-30 tool
 * refuses the word.
 */
/**
 * 32 added a nineteenth WAVE: `plate`, a struck PLATE — `track 1 wave plate`, or
 * `wave plate duty 60` to pick which one — and whose character `duty` chooses from
 * a bank of six (`bell`, `chime`, `gong`, `tam-tam`, `anvil`, `crash`).
 *
 * The last wave of the struck family, and the same rendered one-shot as `mallet`
 * and `membrane` with the numbers a metal plate has: its partials are SPARSE and
 * spread far apart — a bell's hum an octave below the strike tone, a nominal up
 * top — and they ring for seconds, far longer than a bar or a skin. A version-31
 * tool refuses the word.
 */
/**
 * 33 added a track-line setting: `strum`, how far a channel's CHORD is rolled —
 * `track 1 strum 1` rolls a chord inside one step, `strum 2` spreads it across
 * two, and `strum 0` (the default) plays it as the block every earlier song did.
 *
 * A new KEY a `track` line already takes rather than a new verb, the same shape as
 * the effects: a version-32 tool reads every line it read before and refuses the
 * one word it was never taught, so a chord it is not told to roll stays a block.
 */
/**
 * 34 added two note SUFFIXES: `!` (a FLAM — one grace hit leaning into the beat)
 * and `!!` (a DRAG — two). Written on a cell (`kick!`) or as a `note`/`drum`
 * line's value (`drum 0 4 kick flam`).
 *
 * New characters where an articulation is already written, the same shape as `>`
 * and `*3`: they are a property of ONE note, so they live in the suffix rather
 * than in a statement. A version-33 tool reads every cell it read before and
 * refuses the one character it was never taught.
 */
/**
 * 35 added a fourth `rows` transformation: `ROLL`. `rows 0 to 3 roll` retriggers
 * every hit in those steps inside its own step — a roll, a snare fill, a trap hat
 * — and `rows 0 to 3 roll 6` says how many hits each step becomes.
 *
 * A new VALUE on an existing statement, which is §5's own order of preference and
 * the shape `repeat` and `octave` already have: a version-34 tool reads every
 * `rows` line it read before and refuses the one word it was never taught. It
 * writes the same cell field the `*N` suffix writes, so no file version moves.
 */
/**
 * 36 added two note SUFFIXES: `^` (a SCOOP — the note starts N semitones BELOW
 * its pitch and rises onto it) and `v` (a FALL — the note holds its pitch and
 * drops N semitones away over its tail). `C-4^2` and `C-4v2`; the count is 1..12
 * semitones and two by default, so `C-4^` is `C-4^2`.
 *
 * New characters where an articulation is already written, the same shape as `>`
 * and `!`: the one pitch gesture that belongs to a SINGLE note rather than to a
 * channel or a pair of notes, so it lives in the suffix. A version-35 tool reads
 * every cell it read before and refuses the one character it was never taught.
 */
/**
 * 37 added two `track`-line settings that stop a part sounding typed: `robin`
 * (round-robin — `track 2 robin 60` makes the Nth hit of the channel a slightly
 * different hit, walking a fixed four-step cycle) and `touch` (velocity layers —
 * `track 3 touch 70` makes a softer hit DARKER as well as quieter).
 *
 * Two new KEYS a `track` line already takes rather than new verbs, the same shape
 * as `strum` and the effects: a version-36 tool reads every track line it read
 * before and refuses the one word it was never taught. Both are additive and
 * deterministic — the first hit of a channel is always the note as written, and
 * `robin 0`/`touch 0` are what every song written before this means — so the two
 * settings add a file version (34) but move no note on their own.
 */
export const SCRIPT_VERSION = 51;

/** What each language version added, oldest first. Printed by tooling, not a user. */
export const SCRIPT_VERSION_NOTES: readonly { version: number; note: string }[] = [
  { version: 51, note: 'the ARP page\u2019s SESSION switch: `arp hear on` makes the ARP page audition the run as its dials move, and `arp hear off` silences it. A session setting like `page` — how you are LISTENING to the song rather than the song itself — so it travels out in `ScriptSettings` and no file carries it, which is what lets a script dial an arp, turn hearing on and leave the page auditioning rather than written and silent' },
  { version: 50, note: 'the ARP page: `arp direction updown`, `arp octaves 2 rate 2 gate 60` and `arp mode source` store the dials a run is dialed with, `arp off` clears them, and `arp write ROW TRACK CHORD` commits the run those dials describe — the same cells `chord ROW TRACK CHORD arp …` writes, from the SONG rather than the line, because both call one generator (`generateArp`, over the modifier\u2019s own `arpNotes`). The dials are SONG data, so a song that stores any writes an `arp` key and file version 42; a song that names none is byte for byte the song it was, and the inline `chord … arp` modifier is untouched' },
  { version: 49, note: 'the RECORDER\'s TAKE words: `record HOOK` captures a recording from the microphone, `record trim HOOK 0.1 2.0` and `record loop HOOK 1.0 3.0` shape a take\'s window (in seconds from its own start), and `record select HOOK` picks which take the page shows. A take is APP state beside the sample bank — never a song field — so no file carries one and a trim is a WINDOW rather than a cut to your `.wav`; a browser with no microphone refuses a capture in words, the `export.audio` precedent on the way in' },
  { version: 48, note: 'the DRUM MACHINE column of the LIVE grid: a `scene` line takes an optional `kit N` (`scene CHORUS 5 6 7 8 kit 2`), naming which bar of the drum machine that scene performs — `kit off` for a scene that sits the machine out, and a scene without the clause has no machine bar. It rides the `scenes` file key at version 41 rather than adding a rung, so a linear song is byte for byte the song it was, and it is placed by the same `machineHitsInRange` the order uses so live and export cannot disagree' },
  { version: 47, note: 'the LIVE page: `scene A 1 1 - 2` defines a row of the launch grid — the pattern each channel plays in it, with `-` for a channel that is silent — and `live quantize 4` says how many bars a launch waits for (0 is immediate). A scene is SONG data, so it is stored and round-trips through a file; the quantize is a SESSION setting like `theme`, so no file carries it. This is the statement that makes a song PERFORMABLE rather than only playable, and it is what the master script uses to write a live set and leave the LIVE page open' },
  { version: 46, note: 'the PAGE statement: `page arranger` switches which full screen the app shows — `tracker`, `machine`, `mixer` or `arranger` — so ONE script can drive every tab it just wrote into, which is what makes a master script possible without a macro system. It is a SESSION setting like `theme`, so a FILE never carries a page and opening someone\'s song cannot move your screen; the name is checked against the pages THIS build has, so a page a build was never taught is refused in words. The list is published in `vocabulary.pages`' },
  { version: 45, note: 'MACHINE COUNTS: a `machine` line takes `pads N` and `bars N` — how many pads and how many bars the machine HAS, the two things the drum machine page changes with ADD PAD / DEL PAD and + BAR / - BAR. Growing pads fills in kit pads and shrinking drops the last ones; growing bars COPIES the last bar and shrinking drops from the end, with bar 1 the machine and never going' },
  { version: 44, note: 'PER-SECTION MACHINE BAR: a `section` line takes `machine N` (`section CHORUS 3 4 machine 2`), naming which bar of the drum machine that section plays — so the beat follows the FORM rather than a hand-kept `machine order` list, and a verse and a chorus can share one instrument and still have different beats' },
  { version: 43, note: 'SAMPLE PADS: a `pad` line takes the same `sample NAME` a channel line does (`pad 2 BRK wave sample sample BRK`), so a drum pad can play a recording of your own instead of a generator — and a name the app does not have is the FALLBACK rather than an error, so a pad on a recording you lack plays the built-in one-shot its `voice` selects' },
  { version: 42, note: 'MACHINE BARS: `machine pattern N` picks which bar of the drum machine the `pad` lines BELOW it write into, and `machine order 1 1 2 1` says which bar plays in each bar of the song — so a beat can change across the form while staying one instrument with one fader' },
  { version: 41, note: 'the DRUM MACHINE: `machine` sets up a song-level instrument with pads and a step grid, and `pad N NAME voice V pattern "9...9..."` writes one of its lanes — a drum machine played BESIDE the tracker channels rather than inside one of them, mixed on its own fader and saved in the same song' },
  { version: 1, note: 'the base language: header, channels, patterns, grid rows, order' },
  { version: 2, note: 'layer TRACK LAYER: a channel is its voice plus a stack of layers' },
  { version: 3, note: 'six channel effects on the track line: drive, chorus, crush, punch, tilt, gate' },
  { version: 4, note: 'master: the same six effects on the whole mix, e.g. master drive 20 tilt 15' },
  { version: 23, note: 'a seventh effect, CAB: a speaker box on a track line or on the mix (`track 1 drive 40 cab 60`) — the top closes, the middle pushes back, and a little of the very bottom goes, which is what makes a driven part sound like an amp instead of a fuzzbox' },
  { version: 25, note: 'a ninth effect, RADIO: a telephone line behind one number (`track 1 radio 70`, or `master radio 60` for a whole record arriving through a speaker) — the band narrows to about 300 Hz..3.4 kHz and the signal inside it gets coarse, which is a phone voice, an AM mix, or a sampled hook' },
  { version: 24, note: 'an eighth effect, TAPE: a whole tape machine behind one number (`track 1 tape 40`, or `master tape 25` for the record) — the peaks are rounded off, the transport wanders a little in pitch, and a quiet hiss bed is added last, which is what makes lo-fi, chillhop and vaporwave sound old rather than merely filtered' },
  { version: 26, note: 'a tenth effect, VINYL: a record behind one number (`track 1 vinyl 30`, or `master tape 25 vinyl 12` for a lo-fi record) — a quiet surface hiss with the crackle of dust and scratches on top, which is the sound of a part heard off a record rather than merely processed' },
  { version: 27, note: 'a fourteenth WAVE, REED: `track 1 wave reed` (or `wave reed duty 60`) is a reed instrument — a buzzing exciter blown through a resonant tube — whose character `duty` picks from a bank of six (`clarinet`, `oboe`, `bassoon`, `sax`, `harmonica`, `bagpipe`), which is the sound of a wind or folk melody that repeats and holds' },
  { version: 28, note: 'a fifteenth WAVE, BRASS: `track 1 wave brass` (or `wave brass duty 60`) is a brass instrument — a lip buzzing into a flared metal bore — whose character `duty` picks from a bank of six (`trumpet`, `trombone`, `horn`, `tuba`, `flugel`, `muted`), which is the sound of a horn section, a ska stab or a fanfare' },
  { version: 29, note: 'a sixteenth WAVE, BOW: `track 1 wave bow` (or `wave bow duty 60`) is a bowed string — a bow dragging a string into a hollow body — whose character `duty` picks from a bank of six (`violin`, `viola`, `cello`, `bass`, `erhu`, `strings`), which is the sound of a played string line that swells and holds rather than being plucked' },
  { version: 30, note: 'a seventeenth WAVE, MALLET: `track 1 wave mallet` (or `wave mallet duty 60`) is a struck bar — a hit whose overtones are INHARMONIC, so it is a rendered one-shot rather than a spectrum — whose character `duty` picks from a bank of six (`marimba`, `xylophone`, `vibraphone`, `glockenspiel`, `music box`, `kalimba`), which is the sound of a marimba, a bell-like key or a music box' },
  { version: 31, note: 'an eighteenth WAVE, MEMBRANE: `track 1 wave membrane` (or `wave membrane duty 60`) is a struck skin — a drum hit whose dense overtones thud and whose pitch DROOPS as the skin relaxes, so it is a rendered one-shot like `mallet` — whose character `duty` picks from a bank of six (`tom`, `timpani`, `conga`, `tabla`, `djembe`, `frame`), which is the sound of a drum, a kettledrum roll or a hand-drum groove' },
  { version: 32, note: 'a nineteenth WAVE, PLATE: `track 1 wave plate` (or `wave plate duty 60`) is a struck plate — a bell or a gong whose few overtones are spread far apart and ring for seconds, the longest of the struck family, so it is a rendered one-shot like `mallet` and `membrane` — whose character `duty` picks from a bank of six (`bell`, `chime`, `gong`, `tam-tam`, `anvil`, `crash`), which is the sound of a bell toll, a gong strike or a cymbal' },
  { version: 33, note: 'a track-line setting, STRUM: `track 1 strum 1` rolls a chord across a step, `strum 2` spreads it across two, and `strum 0` (the default) is the block every earlier song plays — the notes of a chord land one after another instead of all at once, which is a rock rhythm strum, an emo tap or a folk roll' },
  { version: 34, note: 'two note suffixes, FLAM and DRAG: `kick!` leans one grace hit into the beat (or `drum 0 4 kick flam`), and `kick!!` adds two (or `drum 0 4 kick drag`) — the two hits almost together that make a rock snare or a brush snare, with the main hit still exactly on the beat' },
  { version: 35, note: 'a fourth range transformation, ROLL: `rows 0 to 3 roll` retriggers every hit in those steps inside its own step (four hits each unless you say otherwise, e.g. `rows 0 to 3 roll 6`) — a drum roll, a snare fill or a trap hat, written once for a whole run of steps instead of a `*4` on every cell' },
  { version: 36, note: 'two note suffixes, SCOOP and FALL: `C-4^2` starts the note a whole tone BELOW its pitch and rises onto it (an emo bend, a horn leaning into a note), and `C-4v2` holds the pitch and drops a whole tone away over its tail (a whammy dive, a tape stopping). The count is 1..12 semitones and two by default, so `C-4^` is `C-4^2`; a scoop and a slide cannot both be written, because a note arrives one way' },
  { version: 40, note: 'a fifth `rows` transformation, REVERSE: `rows 0 to 3 reverse` reads those steps BACKWARDS — the last step first — keeping every note, force and gesture and changing only the ORDER. It is the one range transformation with no number, because there is exactly one way to read a run the other way: a swell played backwards, a figure that answers itself, or the tail of a break reversed' },
  { version: 39, note: 'a song statement, SPEED: `speed 80` plays the whole record back at 80% — the tape-speed gesture, ONE number that moves pitch and time TOGETHER, so the song is a fifth (\"a fifth\" is musical) longer and a little lower and stays in step because both halves read the same ratio. `100` is normal (the default and every song before this), `50` is half speed (an octave down), `200` is double (an octave up), and the range is 25..400 so the pitch never leaves the register a voice or a kit is recognisable in' },
  { version: 38, note: 'a track-line setting, DRIFT, and the automation destination it becomes: `track 3 "PAD" drift 40` makes the channel\'s pitch WANDER like a worn transport — a slow wow at two rates that share no period, plus a fast flutter under them, about eighteen cents at 100 — and because `drift` is a plain value rather than an effect node, a lane can move it: `automate 3 drift 10 90 bars 8 to 15` is a tape that TIRES. At 0 every note holds the pitch it was written at' },
  { version: 37, note: 'two track-line settings, ROUND-ROBIN and TOUCH: `track 2 robin 60` makes each hit of the channel a slightly different one (a few cents flat, a touch quieter or brighter) as it walks a fixed four-step cycle, so a repeated part stops sounding typed; `track 3 touch 70` makes a softer hit DARKER as well as quieter, the way a real instrument answers a lighter touch. Both are percentages 0..100, both are OFF at 0 — the note exactly as written, which is every song written before this — and the FIRST hit of a channel is always the unmodified one' },
  { version: 5, note: 'duck on a track line: how far a channel pushes the rest of the mix down, e.g. track 1 duck 60' },
  { version: 6, note: 'automate: a value that moves over bars, e.g. automate 2 bright 15 95 bars 8 to 15' },
  { version: 7, note: 'section and arrange: the form of a song as names, e.g. section VERSE 1 1 2 1 then arrange VERSE CHORUS VERSE' },
  { version: 8, note: 'grid and meter: the bar as note values, e.g. grid 8t for eighth-note triplets or meter 7 8 for seven eighths' },
  { version: 9, note: 'shape on a track line (which kind of filter bright opens, e.g. track 2 shape sharp) and bus: one fader over several channels, e.g. bus DRUMS 70 then track 3 bus DRUMS' },
  { version: 10, note: 'a note can say how it is PLAYED: C-4> slides into its pitch, C-4*3 is three hits inside one step, C-4>*3~80 is both at velocity 80' },
  { version: 11, note: 'two generators, as modifiers: chord 0 1 Am arp up 8 writes the chord one note per step, and arrange VERSE CHORUS repeat 4 plays a section four times in all' },
  { version: 12, note: 'rows A to B: a range of steps, moved or repeated — rows 0 to 3 octave up, or rows 0 to 3 repeat 4 to play that figure four times in all' },
  { version: 13, note: 'a cell can hold a CHORD: C-4,E-4,G-4 is one cell of three notes, which needs a channel wide enough to sound it (track 2 poly 3), and `chord 0 1 Am` now lands in one cell on such a channel' },
  { version: 14, note: 'the DRUM: `drum 0 4 kick` writes one hit of a kit, and a grid word may name one too (`kick . hat .`), so one channel plays the whole set — kick, snare, hat and wind' },
  { version: 15, note: 'the KIT: `kit 808` (or `brush`, or `rock`) says which four patches those hits play, so one word is a whole drum machine — `studio` is the four presets and the default' },
  { version: 16, note: 'the SAMPLE: `track 2 "HOOK" wave sample sample BRK02` plays YOUR recording of that name, loaded with `sample load "samples/break.wav"` or `sample import` — a song names it, the app holds it, and a channel whose name the app does not have plays its built-in one-shot' },
  { version: 17, note: 'the PROGRESSION: `progression Am F C G hold 8` is the chord loop the song hangs on, and a channel FOLLOWS it — `chord 0 3 follow` writes its chords, `note 0 4 follow` its roots, both into cells you can see and edit' },
  { version: 18, note: 'the GENRE STARTER: `start house` (or `lofi`, or `ballad`) writes a whole working skeleton — a key, a tempo, a feel, a kit, named channels, a drum figure, a chord loop and a form — as ordinary notation you then edit; `start house` followed by `SAVE AS SCRIPT` prints the skeleton back out as lines' },
  { version: 19, note: 'the EXPORT REGION: `export bars 8 to 15` renders only those bars when audio is exported — the loop region — and `export all` puts the whole song back; it is a session setting, so no file carries one' },
  { version: 20, note: 'the LOUDNESS TARGET: `export loud -14` normalises an audio export to -14 LUFS (the two may be combined — `export bars 8 to 15 loud -14`), and `export loud off` leaves the level alone; measured to ITU-R BS.1770, a session setting, so no file carries one' },
  { version: 21, note: 'a KIT of your own: `kit MYHOUSE` (any word that is not one of the four built-ins) names a kit saved as a `.kit.json` — four drum voices you can carry between songs; a song names it, the app holds it, and a song naming a kit this machine does not have plays the four presets' },
  { version: 22, note: 'three closed lists got longer — SCALES (`mixolydian`, `phrygian`, `blues`), CHORD SHAPES (`5` power, `sus2`, `sus4`, `6`, `add9`, `9`) and FEELS (`boom-bap`, `swing-16`, `d-beat`) — so `key D blues`, `progression Am F Cadd9 G` and `groove boom-bap` all parse here and are refused in words by a build that says 21; and two more KITS joined the built-ins (`metal`, `dusty`), which is the one widening here that a version-21 build gets WRONG rather than refusing, because since 21 any unrecognised `kit` word is a kit of your OWN — it reads `kit metal` as a name, finds none in the library, and plays the four presets' },
];

/** A command word with what it is for, how deep it sits, and one working line. */
export interface CapabilityCommand {
  /** The word, exactly as it appears in `SCRIPT_KEYWORDS`. */
  word: string;
  /**
   * `core` is what a beginner needs to write a song. `deep` is sound design and
   * the four session settings — useful, never necessary, and safe to ignore
   * entirely when writing a first draft.
   */
  tier: 'core' | 'deep';
  /** What it is for, in one line: the same voice the catalog's blurbs use. */
  what: string;
  /** One line that parses and applies. Every one of these is applied by a test. */
  example: string;
}

/**
 * Every command word, in the parser's own order, with an example.
 *
 * The list is not a copy of `SCRIPT_KEYWORDS` — it is checked against it, in
 * order, word for word, by `src/__tests__/capabilities.test.ts`. A new keyword
 * therefore cannot be added to the parser without an example and a one-line
 * purpose landing here on the same day.
 */
export const SCRIPT_COMMANDS: readonly CapabilityCommand[] = [
  { word: 'new', tier: 'core', what: 'start a blank song', example: 'new' },
  { word: 'start', tier: 'core', what: 'start from a whole worked skeleton of a genre — house, lofi, ballad, rock, emo, vaporwave, synthwave, shoegaze or dnb', example: 'start house' },
  { word: 'song', tier: 'core', what: 'the song\u2019s title, which shows in the top bar', example: 'song "MY TUNE"' },
  { word: 'key', tier: 'core', what: 'the key and scale the chord tools and the piano follow', example: 'key D minor' },
  { word: 'tempo', tier: 'core', what: 'how fast it goes, and tempo changes by bar', example: 'tempo 140' },
  { word: 'octave', tier: 'core', what: 'which octave a bare note letter means', example: 'octave 5' },
  { word: 'beat', tier: 'core', what: 'how many steps are one beat', example: 'beat 4' },
  { word: 'steps', tier: 'core', what: 'how many steps a pattern holds', example: 'steps 16' },
  { word: 'grid', tier: 'core', what: 'the bar as note values: 16 is sixteenths, 8t is eighth-note triplets', example: 'grid 16' },
  { word: 'meter', tier: 'core', what: 'how many beats are in a bar, and the note each beat is', example: 'meter 7 8' },
  { word: 'tuning', tier: 'deep', what: 'the temperament everything is played in', example: 'tuning just' },
  { word: 'swing', tier: 'core', what: 'the feel: how far every second step is pushed later', example: 'swing 60' },
  { word: 'groove', tier: 'deep', what: 'a named feel that lands notes before or after the beat', example: 'groove shuffle' },
  { word: 'speed', tier: 'deep', what: 'play the whole record back at a different tape speed — one number that moves pitch and time together (100 is normal)', example: 'speed 80' },
  { word: 'kit', tier: 'deep', what: 'which four patches the drum hits play: the four built-in kits (studio, 808, brush, rock) or the name of a kit of your own saved as a .kit.json', example: 'kit 808' },
  { word: 'machine', tier: 'deep', what: 'set up the DRUM MACHINE — a whole instrument of pads and a step grid beside the channels, with its own level, pan, swing, sends, duck and effects; `pads N` and `bars N` say how many pads and bars it has', example: 'machine level 85 swing 50 pads 6 bars 2' },
  { word: 'pad', tier: 'core', what: 'one lane of the drum machine: a name, a sound, a level and pan, the recording it names (with `sample NAME`, on a `wave sample` pad), and a row of hits written as a pattern string (`.` a rest, `1`-`9` how hard)', example: 'pad 1 KICK voice kick pattern "9...9...9...9..."' },
  { word: 'chip', tier: 'deep', what: 'dress every channel as one games console', example: 'chip nes' },
  { word: 'volume', tier: 'core', what: 'the master level, which is a setting rather than song data', example: 'volume 70' },
  { word: 'reverb', tier: 'deep', what: 'the room the whole song plays in', example: 'reverb 30' },
  { word: 'echo', tier: 'deep', what: 'how much of the room bounces back as repeats', example: 'echo 20' },
  { word: 'master', tier: 'deep', what: 'the same effects on the whole mix: the tape the band was printed to', example: 'master drive 20 tilt 15' },
  { word: 'automate', tier: 'deep', what: 'move one value over a range of bars: the riser, the fade, the filter opening', example: 'automate 2 bright 15 95 bars 1 to 2' },
  { word: 'section', tier: 'core', what: 'name a group of bars, so the form can be written with words', example: 'section VERSE 1 2' },
  { word: 'arrange', tier: 'core', what: 'build the order out of section names: the song\u2019s form in one line', example: 'section VERSE 1 2\narrange VERSE VERSE' },
  { word: 'scene', tier: 'core', what: 'one row of the LIVE launch grid: the pattern each channel plays in it, with `-` for a channel that is silent — a scene is launched by hand and loops until the next one is', example: 'scene A 1 2 - 4' },
  { word: 'progression', tier: 'core', what: 'the chord loop the song hangs on — one chord per beat unless a hold clause says otherwise — which a channel can follow', example: 'progression Am F C G hold 8' },
  { word: 'bus', tier: 'core', what: 'one fader over several channels: the kit, the pads, the backing', example: 'bus DRUMS 70' },
  { word: 'theme', tier: 'deep', what: 'the look of the app itself, never saved in a song', example: 'theme forge' },
  { word: 'instrument', tier: 'deep', what: 'which imported instrument a `wave font` channel plays, and the picker for a Noislet sound pack', example: 'instrument use 1' },
  { word: 'solo', tier: 'deep', what: 'listen to some channels only, without changing the song', example: 'solo 1' },
  { word: 'chords', tier: 'deep', what: 'what one key writes: single notes, a triad or a seventh', example: 'chords triad' },
  { word: 'hear', tier: 'deep', what: 'whether notes are auditioned as the cursor reaches them', example: 'hear on' },
  { word: 'export', tier: 'deep', what: 'what an audio export covers: which bars it renders — `export bars 8 to 15`, the loop region — and how loud it arrives, normalised to a LUFS target (`export loud -14`). Both are session settings rather than song data, and `export all` and `export loud off` put each back', example: 'export bars 1 to 2 loud -14' },
  { word: 'page', tier: 'deep', what: 'which full screen the app is showing — tracker, machine, mixer, arranger, live or recorder — so one script can drive the tabs it just wrote into; a session setting, so no file carries it', example: 'page arranger' },
  { word: 'live', tier: 'deep', what: 'how a launch lands: `live quantize N` waits for the next N bars before a launched scene takes over (0 is immediate); a session setting, so no file carries it', example: 'live quantize 4' },
  { word: 'tracks', tier: 'core', what: 'how many channels the song has', example: 'tracks 5' },
  { word: 'track', tier: 'core', what: 'one channel: its name, voice, sound, level, pan, hold, glide, vibrato, sends, duck, nine effects — and `sample NAME` for a recording of yours', example: 'track 3 level 60' },
  { word: 'sample', tier: 'deep', what: 'bring a recording of your own into the app (`sample load "path"`, or `sample import` for the file dialog) and name it on a track line, where a `wave sample` channel plays it instead of the built-in one-shot', example: 'sample load "samples/break.wav"' },
  { word: 'record', tier: 'deep', what: 'a TAKE: capture one from the microphone (`record HOOK`), shape its window with `record trim NAME START END` and `record loop NAME START END` (seconds from the take\u2019s own start), or pick the one the RECORDER page shows with `record select NAME` — all app state, never part of the song', example: 'record trim HOOK 0.1 2.0' },
  { word: 'layer', tier: 'deep', what: 'stack a layer above a channel\u2019s voice: the supersaw, the organ, the bell', example: 'layer 3 2 wave saw octave 1' },
  { word: 'mute', tier: 'core', what: 'silence a channel without deleting it', example: 'mute 4' },
  { word: 'unmute', tier: 'core', what: 'let a muted channel be heard again', example: 'unmute 4' },
  { word: 'pattern', tier: 'core', what: 'start writing a pattern, and name it', example: 'pattern 2 "B"' },
  { word: 'order', tier: 'core', what: 'which patterns play, in what order: the song\u2019s form', example: 'order 1 1 2' },
  { word: 'clear', tier: 'core', what: 'empty a pattern and start it again', example: 'clear 2' },
  { word: 'copy', tier: 'core', what: 'copy one pattern into another, to vary it', example: 'copy 1 2' },
  { word: 'rows', tier: 'deep', what: 'a range of steps: move its pitches by octaves, or play it again', example: 'rows 0 to 3 octave up' },
  { word: 'note', tier: 'core', what: 'write one note at an exact row and channel', example: 'note 0 2 C-4' },
  { word: 'chord', tier: 'core', what: 'write a whole chord across the channels from a row', example: 'chord 0 1 Am' },
  { word: 'arp', tier: 'core', what: 'the ARP page\u2019s dials — direction, octaves, rate, gate and mode, stored in the song and merged one line at a time — plus `arp write ROW TRACK CHORD` to commit the run they describe, `arp off` to clear them, and `arp hear on` to audition the run as you dial (a session setting)', example: 'arp direction updown' },
  { word: 'drum', tier: 'core', what: 'write one drum hit on a kit channel: kick, snare, hat or wind', example: 'drum 0 4 kick' },
  { word: 'erase', tier: 'core', what: 'take one note back out', example: 'erase 0 1' },
];

/** The numbers the language clamps to, named the way an author says them. */
export interface CapabilityLimits {
  tracks: { min: number; max: number; atNew: number };
  steps: { min: number; max: number };
  stepsPerBeat: { min: number; max: number };
  bpm: { min: number; max: number };
  swing: { min: number; max: number };
  hold: { min: number; max: number };
  velocity: { min: number; max: number };
  level: { min: number; max: number };
  pan: { min: number; max: number };
  knob: { min: number; max: number };
  /** Every channel effect's range. 0 is OFF, which is the whole app's default. */
  effect: { min: number; max: number };
  send: { min: number; max: number };
  /** How far one channel may push the REST of the mix down while it plays. */
  duck: { min: number; max: number };
  /** How much one channel may be humanised: how far it is "played". */
  humanize: { min: number; max: number };
  /** How many notes one channel may hold at once. 1 is monophonic. */
  poly: { min: number; max: number };
  /** How many steps one `arp` may fill. */
  arpSteps: { min: number; max: number };
  /**
   * The ARP page's three NUMBER dials — how many octaves a run climbs, how many
   * steps each note occupies, and how hard each note lands. The two WORDS it also
   * stores (direction, mode) are closed lists, published in `vocabulary`.
   */
  arp: { octaves: { min: number; max: number }; rate: { min: number; max: number }; gate: { min: number; max: number } };
  /**
   * How many times one note may be hit inside its own step. `1` is a plain note
   * rather than a stutter of one, so this is the range of the SUFFIX (2..8) and
   * not the range of the cell.
   */
  stutter: { min: number; max: number };
  /**
   * How many GRACE hits may lead into one note: `1` is a flam and `2` a drag, so
   * this is the range of the `!` suffix. `0` — no grace — is a plain note.
   */
  grace: { min: number; max: number };
  /**
   * How far a note may BEND its own pitch, in semitones — the range of the `^`
   * and `v` suffixes. One-sided: the SIGN is the direction, and `0` — no bend —
   * is a plain note, which is why the floor is 1 rather than 0.
   */
  bend: { min: number; max: number };
  /**
   * The master tape speed: the range of the `speed` statement, in percent of the
   * written speed. `100` is normal, which is the default and what every song
   * before version 39 means. See `model/speed.ts`.
   */
  speed: { min: number; max: number };
  /**
   * How far one channel's pitch may WANDER — the range of the `drift` setting,
   * and of the `automate` destination that moves it. `0` is dead steady, which is
   * the default and what every song before version 38 means.
   */
  drift: { min: number; max: number };
  /**
   * How far one channel may vary from hit to hit — a ROUND-ROBIN percentage. `0`
   * is every hit the note as written, which is the default and what every song
   * before version 37 means; the strings stay within a few cents and a few
   * percent, so this is a performance rather than a second instrument.
   */
  robin: { min: number; max: number };
  /**
   * How far a hit's TIMBRE follows how hard it was — a velocity-layer percentage.
   * `0` is velocity a level and nothing else (the default); the setting only
   * ever DARKENS a soft hit, because a harder hit is the note as written.
   */
  touch: { min: number; max: number };
  /**
   * A `rows` statement: how many whole octaves it may move a range, how few
   * times a repeat may play one, and how many hits a roll may put in a step. A
   * repeat's CEILING is not here because it is not a number — a repeat has to FIT
   * in the pattern, so the arithmetic decides it.
   */
  rows: { octaves: { min: number; max: number }; repeat: { min: number }; roll: { min: number; max: number } };
  /**
   * How many notes ONE CELL may hold: the ceiling on a chord written with commas.
   *
   * The same number as `poly.max`, and for the reason the model gives: a cell that
   * held more notes than a channel can sound would be a chord that steals from
   * itself. A given channel's own ceiling is lower — `poly` — and a cell wider than
   * the channel it lands on is refused rather than thinned.
   */
  cellNotes: { max: number };
  /** How many lanes a song may carry, and the bars a lane may name. */
  automationLanes: { max: number };
  /**
   * How many named sections a song may have, how long one name may be, and how
   * many times one `repeat` may play the name before it in an `arrange`.
   */
  sections: { max: number; nameChars: { max: number }; repeat: { min: number; max: number } };
  /**
   * The LIVE set: how many scenes a song may hold, and how long one name may be.
   *
   * Published because a tool writing `scene` has to know both, the same way it
   * needs the section and bus limits beside them — and because the ceiling is what
   * makes a launch grid a grid rather than a list of everything a song could play.
   */
  scenes: { max: number; nameChars: { max: number }; machineBars: { max: number } };
  /**
   * How many bars a `live quantize` may wait for, and the value a line without a
   * number gets. `0` is immediate, which is a setting rather than an absence.
   */
  liveQuantize: { min: number; max: number; atDefault: number };
  /** How many mix groups a song may have, and how long one name may be. */
  buses: { max: number; nameChars: { max: number } };
  /**
   * The chord loop a song hangs on: how many chords it may hold, and how many
   * steps each one may last.
   *
   * Published because both are the language's own choices rather than the song's:
   * a tool writing `progression` has to know how long a `hold` it may ask for, and
   * `atDefault` is the length a line without the clause gets — one beat, which is
   * what makes a four-chord loop fit one 16-step bar.
   */
  progressions: {
    steps: { max: number };
    hold: { min: number; max: number; atDefault: number };
  };
  /**
   * The sample BANK: how many recordings the app holds, how long a name may be,
   * and how long a recording may last. Published because all three are the app's
   * limits rather than the song's — a tool writing `sample load` needs them, and
   * the cap on seconds is what keeps the bank a few seconds of audio rather than
   * a folder of tracks held decoded in memory.
   */
  samples: {
    max: number;
    nameChars: { max: number };
    seconds: { min: number; max: number };
  };
  /**
   * The DRUM MACHINE: how many pads it may have, how long one bar of it may be,
   * and how many of those steps are one beat. Published because a tool writing
   * `machine`/`pad` has to know them, the same way it needs the sample bank's.
   */
  machine: {
    pads: { max: number };
    steps: { min: number; max: number; atDefault: number };
    beat: { min: number; max: number };
    bars: { min: number; max: number };
  };
  bars: { min: number; max: number };
  room: { min: number; max: number };
  octave: { min: number; max: number };
  patterns: { max: number };
  order: { max: number };
  tempoChanges: { max: number };
  titleChars: { max: number };
  trackNameChars: { max: number };
  voiceNameChars: { max: number };
  savedSounds: { max: number };
  layers: { max: number; extra: number };
  midi: { min: number; max: number };
  chordNotes: { atDefault: number; max: number };
}

/** The closed lists a script may name a word from. */
export interface CapabilityVocabulary {
  waves: readonly string[];
  voices: readonly string[];
  knobs: readonly { id: string; low: string; high: string }[];
  layerFields: readonly { id: string; min: number; max: number; low: string; high: string }[];
  tunings: readonly string[];
  grooves: readonly { id: string; aliases: readonly string[] }[];
  /**
   * The BUILT-IN KITS: the four sets of drum patches this build ships, each with
   * what it sounds like and which music reaches for it.
   *
   * The four are a closed list and published for the reason the feels are: a kit
   * is a word rather than a table, so a tool writing `kit 808` needs to know the
   * word exists — and a menu needs the sentence that says what it is FOR. Since
   * version 21 a `kit` line may also name a kit of the USER's own (any other
   * word), which no manifest can publish because it lives in the app's library:
   * the four here are the words that are always understood.
   */
  kits: readonly { id: string; label: string; blurb: string; reach: string; atDefault: boolean }[];
  chips: readonly string[];
  /**
   * The scales, spelled the way a SCRIPT spells them (`harmonic minor`, with a
   * space) rather than the way the model ids them (`harmonic-minor`, with a
   * hyphen). Every list here is words to type, not internal ids, and a scale is
   * the one place the two differ.
   */
  scales: readonly string[];
  chordModes: readonly string[];
  /**
   * The nine channel effects, which are written on a `track` line as
   * `track 2 drive 40`. Each is 0..100 with 0 meaning OFF — see `limits.effect`.
   */
  effects: readonly string[];
  /**
   * What an `automate` lane can move, with both ends of each range.
   *
   * Published with its ranges rather than as a bare word list, because a lane is
   * a value with a range and a tool writing one needs both; `scope` says where the
   * number lands, which is the difference between a knob of the channel's sound
   * and the channel itself.
   */
  automationTargets: readonly {
    id: string; scope: string; min: number; max: number; low: string; high: string;
  }[];
  /**
   * The filter shapes a `track` line takes (`track 2 shape sharp`), with the
   * technical spellings that mean the same thing. A closed list rather than a
   * number with a range, because a shape is a word from a table — the same rule
   * the feels above follow.
   */
  filterShapes: readonly { id: string; aliases: readonly string[] }[];
  /**
   * The suffixes a NOTE may carry — how it is played rather than what pitch it
   * is — each with the character that spells it: `C-4>`, `C-4*3`, `C-4>*3~80`.
   *
   * Characters rather than words, because this is the one value in the language
   * written against the note it belongs to rather than after a keyword. A tool
   * that writes cells needs the two characters and the count range (see
   * `limits.stutter`); a tool that only reads notes can ignore both.
   */
  articulations: readonly { id: string; char: string }[];
  /**
   * What separates the notes of a chord written into ONE cell — today a comma, as
   * in `C-4,E-4,G-4`.
   *
   * Published as a character rather than described in prose because a tool that
   * writes a chord has to spell it exactly, and the ceiling on how many notes one
   * cell may hold is `limits.cellNotes`. A channel must be at least that wide
   * (`poly`) for the chord to be accepted at all.
   */
  cellNoteSeparator: string;
  /**
   * The pitch a loaded recording plays at when its rate is 1 — middle C.
   *
   * A WAV says nothing about what note it is, so the app assumes one, and a tool
   * that writes `sample` lines has to know which note plays a file as recorded:
   * every built-in one-shot uses the same convention, so a loaded file behaves
   * like the bank it joins.
   */
  sampleRootHz: number;
  /**
   * The KIT: the four drums one channel can play a hit at a time, each with the
   * word that names it (`kick`), what a menu shows (`Kick`), the General MIDI
   * pitch a cell holding it carries (36) and the three characters the grid prints
   * (`KCK`).
   *
   * A closed list rather than a range, like the feels and the effects, and the
   * only vocabulary here that is also a PITCH: a tool writing a drum needs the
   * word for the script and the pitch for the file, and this is the one place
   * both are written down.
   */
  drums: readonly { id: string; label: string; pitch: number; short: string; blurb: string }[];
  /**
   * The directions an `arp` walks a chord in: `up`, `down` or `updown`, with the
   * aliases a person types (`asc`, `descending`, `both`). A chord MODIFIER rather
   * than a command, published because a tool writing one has to know the words.
   */
  arpDirections: readonly { id: string; aliases: readonly string[] }[];
  /**
   * The two MODES an `arp` statement stores: `chord` walks the chord given on a
   * write, `source` walks the song's loop. A closed list, published because a
   * tool setting the dials has to spell one.
   */
  arpModes: readonly ArpMode[];
  /**
   * The words one `progression` line and its followers are spelled with: how to
   * clear a loop (`none`), the word that makes a channel FOLLOW it (`follow`), the
   * clause that says how long each chord lasts (`hold`), and the chord spellings a
   * step may use.
   *
   * A definition plus a modifier rather than one command, which is why it is a
   * small record instead of a list: a tool writing `progression Am F C G hold 8`
   * has to spell three words and a grammar, and guessing any of them is guessing a
   * syntax.
   */
  progression: {
    none: string;
    follow: string;
    hold: string;
    chordSpellings: string;
  };
  /**
   * The starters a `start` line accepts: `house`, `lofi` and `ballad`, each with
   * the label a menu shows and the one line saying what it is for.
   *
   * A closed list of WORDS, like `kits` and `chips`, because `start` takes a name
   * rather than a number — and published because the scripts themselves are the
   * answer to "what does this one contain?": `start house` followed by
   * `SAVE AS SCRIPT` prints the whole skeleton out, which is a better answer than
   * any summary a manifest could carry.
   */
  genres: readonly { id: string; label: string; blurb: string }[];
  /**
   * What a `rows A to B …` statement can do to the range it names — `octave up`,
   * `octave down` or `repeat N` — with the words a person types.
   *
   * A transformation of a RUN of steps rather than of a channel or a note, which
   * is the grammar this list is the vocabulary for; a tool writing one needs the
   * words and the two ranges in `limits.rows`.
   */
  rowTransforms: readonly { id: string; words: string; what: string }[];
  /**
   * The grids `grid` accepts, as the names to type (`16`, `8t`). A closed list,
   * because a grid is a word from a table rather than a number with a range.
   */
  grids: readonly string[];
  /**
   * The note values a `meter` beat may be — the bottom number of a time
   * signature, so `8` is an eighth note.
   */
  meterUnits: readonly number[];
  /**
   * The full screens a `page` line can switch to, as a script spells them
   * (`tracker`, `machine`, `mixer`, `arranger`).
   *
   * A closed list of WORDS this build has, published for the same reason the
   * kits and the grids are: an agent driving the tabs has to know which screens
   * exist here, and a build that predates a page must not be asked for it in a
   * line that would be refused rather than answered.
   */
  pages: readonly string[];
}

export interface ScriptCapabilities {
  app: 'tracklet';
  language: 'tracklet-script';
  scriptVersion: number;
  versionNotes: readonly { version: number; note: string }[];
  /** The reference a person should read, relative to the project root. */
  doc: string;
  fileVersions: { plain: number; stacked: number; max: number };
  keywords: readonly string[];
  commands: readonly CapabilityCommand[];
  tiers: { core: readonly string[]; deep: readonly string[] };
  limits: CapabilityLimits;
  vocabulary: CapabilityVocabulary;
}

/**
 * The whole manifest, built fresh from the model's own tables.
 *
 * Fresh copies for the same reason `instrumentCatalog()` makes them: a consumer
 * that edits what it reads (a tool trimming a list, a test poking a value) must
 * not be able to reach back and change the language the app speaks.
 */
export function scriptCapabilities(): ScriptCapabilities {
  return {
    app: 'tracklet',
    language: 'tracklet-script',
    scriptVersion: SCRIPT_VERSION,
    versionNotes: SCRIPT_VERSION_NOTES.map((entry) => ({ ...entry })),
    doc: SCRIPT_DOC_PATH,
    fileVersions: {
      plain: SONG_FILE_VERSION,
      stacked: STACK_SONG_FILE_VERSION,
      max: SONG_FILE_VERSION_MAX,
    },
    keywords: [...SCRIPT_KEYWORDS],
    commands: SCRIPT_COMMANDS.map((command) => ({ ...command })),
    tiers: {
      core: SCRIPT_COMMANDS.filter((command) => command.tier === 'core').map((command) => command.word),
      deep: SCRIPT_COMMANDS.filter((command) => command.tier === 'deep').map((command) => command.word),
    },
    limits: {
      tracks: { min: MIN_TRACKS, max: MAX_TRACKS, atNew: DEFAULT_TRACKS },
      steps: { min: MIN_ROWS, max: MAX_ROWS },
      stepsPerBeat: { min: MIN_ROWS_PER_BEAT, max: MAX_ROWS_PER_BEAT },
      bpm: { min: BPM_MIN, max: BPM_MAX },
      swing: { min: MIN_SWING, max: MAX_SWING },
      hold: { min: MIN_HOLD, max: MAX_HOLD },
      velocity: { min: MIN_VELOCITY, max: MAX_VELOCITY },
      level: { min: MIN_LEVEL, max: MAX_LEVEL },
      pan: { min: MIN_PAN, max: MAX_PAN },
      knob: { min: MIN_PARAM, max: MAX_PARAM },
      effect: { min: MIN_EFFECT, max: MAX_EFFECT },
      send: { min: MIN_SEND, max: MAX_SEND },
      duck: { min: MIN_DUCK, max: MAX_DUCK },
      humanize: { min: MIN_HUMANIZE, max: MAX_HUMANIZE },
      poly: { min: MIN_POLY, max: MAX_POLY },
      cellNotes: { max: MAX_CELL_NOTES },
      arpSteps: { min: MIN_ARP_STEPS, max: MAX_ARP_STEPS },
      arp: {
        octaves: { min: MIN_ARP_OCTAVES, max: MAX_ARP_OCTAVES },
        rate: { min: MIN_ARP_RATE, max: MAX_ARP_RATE },
        gate: { min: MIN_ARP_GATE, max: MAX_ARP_GATE },
      },
      stutter: { min: MIN_STUTTER, max: MAX_STUTTER },
      grace: { min: 1, max: MAX_GRACE },
      bend: { min: MIN_BEND, max: MAX_BEND },
      speed: { min: SPEED_MIN, max: SPEED_MAX },
      robin: { min: ROBIN_MIN, max: ROBIN_MAX },
      touch: { min: TOUCH_MIN, max: TOUCH_MAX },
      drift: { min: DRIFT_MIN, max: DRIFT_MAX },
      rows: {
        octaves: { min: MIN_OCTAVE_SHIFT, max: MAX_OCTAVE_SHIFT },
        repeat: { min: MIN_ROW_REPEAT },
        roll: { min: MIN_ROLL_HITS, max: MAX_ROLL_HITS },
      },
      automationLanes: { max: MAX_AUTOMATION_LANES },
      sections: {
        max: MAX_SECTIONS,
        nameChars: { max: MAX_SECTION_NAME },
        repeat: { min: MIN_REPEAT, max: MAX_REPEAT },
      },
      buses: { max: MAX_BUSES, nameChars: { max: MAX_BUS_NAME } },
      scenes: { max: MAX_SCENES, nameChars: { max: MAX_SCENE_NAME }, machineBars: { max: MAX_MACHINE_BARS } },
      liveQuantize: { min: MIN_LIVE_QUANTIZE, max: MAX_LIVE_QUANTIZE, atDefault: DEFAULT_LIVE_QUANTIZE },
      progressions: {
        steps: { max: MAX_PROGRESSION_STEPS },
        hold: {
          min: MIN_PROGRESSION_HOLD,
          max: MAX_PROGRESSION_HOLD,
          atDefault: DEFAULT_PROGRESSION_HOLD,
        },
      },
      samples: {
        max: MAX_SAMPLES,
        nameChars: { max: MAX_SAMPLE_NAME },
        seconds: { min: MIN_SAMPLE_SECONDS, max: MAX_SAMPLE_SECONDS },
      },
      machine: {
        pads: { max: MAX_PADS },
        steps: { min: MIN_MACHINE_STEPS, max: MAX_MACHINE_STEPS, atDefault: DEFAULT_MACHINE_STEPS },
        beat: { min: MIN_MACHINE_BEAT, max: MAX_MACHINE_BEAT },
        bars: { min: 1, max: MAX_MACHINE_BARS },
      },
      bars: { min: 1, max: MAX_ORDER },
      room: { min: MIN_ROOM, max: MAX_ROOM },
      octave: { min: SCRIPT_OCTAVE_MIN, max: SCRIPT_OCTAVE_MAX },
      patterns: { max: MAX_PATTERNS },
      order: { max: MAX_ORDER },
      tempoChanges: { max: MAX_TEMPO_POINTS },
      titleChars: { max: MAX_SONG_TITLE },
      trackNameChars: { max: MAX_TRACK_NAME },
      voiceNameChars: { max: MAX_VOICE_NAME },
      savedSounds: { max: MAX_USER_VOICES },
      layers: { max: MAX_LAYERS, extra: MAX_EXTRA_LAYERS },
      midi: { min: MIDI_MIN, max: MIDI_MAX },
      chordNotes: { atDefault: DEFAULT_CHORD_DEGREES, max: MAX_CHORD_DEGREES },
    },
    vocabulary: {
      waves: [...WAVES],
      voices: VOICES.map((voice) => voice.id),
      knobs: VOICE_PARAMS.map((param) => ({ id: param.id, low: param.low, high: param.high })),
      layerFields: LAYER_FIELDS.map((field) => ({
        id: field.id,
        min: field.min,
        max: field.max,
        low: field.low,
        high: field.high,
      })),
      tunings: TUNINGS.map((tuning) => tuning.id),
      grooves: GROOVES.map((groove) => ({ id: groove.id, aliases: [...groove.aliases] })),
      // The kits, on the same rule: a closed list of words, with the one a song
      // already plays marked so a tool can skip a line that changes nothing.
      kits: KITS.map((kit) => ({
        id: kit.id, label: kit.label, blurb: kit.blurb, reach: kit.reach, atDefault: kit.id === DEFAULT_KIT,
      })),
      // The filter shapes, on the same rule as the feels above: a closed list of
      // words a `track` line takes, published so a tool never has to guess which
      // filter shapes this build knows.
      filterShapes: FILTER_SHAPES.map((shape) => ({ id: shape.id, aliases: [...shape.aliases] })),
      articulations: [
        { id: 'slide', char: SLIDE_CHAR },
        { id: 'stutter', char: STUTTER_CHAR },
        { id: 'flam', char: GRACE_CHAR },
        { id: 'drag', char: `${GRACE_CHAR}${GRACE_CHAR}` },
        { id: 'scoop', char: SCOOP_CHAR },
        { id: 'fall', char: FALL_CHAR },
      ],
      // What separates the notes of one cell's chord, published for the same
      // reason the two articulation characters are: a tool writing a song has to
      // spell a chord, and guessing the separator means guessing a syntax.
      cellNoteSeparator: CELL_NOTE_SEPARATOR,
      // The pitch a loaded recording sounds at when it is played at rate 1, and
      // the reason it is published: a WAV says nothing about its own pitch, so a
      // tool that writes `sample` lines has to know which note plays the file as
      // recorded — middle C, the same convention every built-in one-shot uses.
      sampleRootHz: SAMPLE_ROOT_HZ,
      // The kit, as data: what each drum is called, what pitch it is, and the
      // three characters a grid cell shows. A closed list of four, published for
      // the same reason the effects and the feels are — a tool writing a beat
      // needs the words, and a menu needs the labels.
      drums: DRUMS.map((drum) => ({
        id: drum.id, label: drum.label, pitch: drum.pitch, short: drum.short, blurb: drum.blurb,
      })),
      // Each direction with the words that also read as it, worked out by asking
      // the reader rather than by listing them twice — the same table the parser
      // consults, so the two cannot drift.
      arpDirections: ARP_DIRECTIONS.map((id) => ({
        id,
        aliases: ARP_ALIASES[id].filter((alias) => alias !== id),
      })),
      // The two modes a stored arp can walk in, straight from the model so the
      // list a tool reads and the list the parser accepts are one list.
      arpModes: [...ARP_MODES],
      // The words a progression line is spelled with, published for the same
      // reason `cellNoteSeparator` and the two articulation characters are: a tool
      // writing `progression Am F C G hold 8` has to spell the clause and the word
      // that makes a channel follow it, and guessing a syntax is guessing. The
      // chord spellings come from the chord table itself, so the list a tool reads
      // and the list a refusal prints cannot drift.
      progression: {
        none: PROGRESSION_NONE_WORD,
        follow: FOLLOW_WORD,
        hold: PROGRESSION_HOLD_WORD,
        chordSpellings: CHORD_SPELLINGS,
      },
      // The starters `start` accepts, each with its blurb: published because a
      // tool that wants to point somebody at a skeleton has to know which ones
      // this build has, and because the list is DATA — a new starter is a word a
      // menu and a script both learn from this table rather than from a second
      // list that could drift away from it.
      genres: GENRES.map((genre) => ({ id: genre.id, label: genre.label, blurb: genre.blurb })),
      chips: CHIPS.map((chip) => chip.id),
      scales: SCALES.map((scale) => scale.id.replace(/-/g, ' ')),
      chordModes: ['off', 'triad', '7th'],
      effects: TRACK_EFFECTS.map((effect) => effect.id),
      rowTransforms: ROW_TRANSFORMS.map((one) => ({ id: one.id, words: one.words, what: one.what })),
      grids: [...GRID_NAMES],
      meterUnits: [...METER_UNITS],
      pages: [...PAGE_NAMES],
      automationTargets: AUTOMATION_TARGETS.map((target) => ({
        id: target.id,
        scope: target.scope,
        min: target.min,
        max: target.max,
        low: target.low,
        high: target.high,
      })),
    },
  };
}

/** The manifest as JSON, for a caller that wants to hand it to something else. */
export function capabilitiesJson(space?: number): string {
  return JSON.stringify(scriptCapabilities(), null, space);
}
