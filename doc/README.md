# Tracklet documentation

Tracklet is a small music tracker: a grid of 16 steps (up to 512), four to eight
channels, and a synthesizer you can hear in one click. This folder is the
**complete guide to writing music on it** — written for two readers at once:

1. **a person** learning what a tracker is, and
2. **a language model or script** that has to author music by emitting text.

Both readers want the same thing: unambiguous rules, exact syntax, worked
examples, and an error list that says what to type instead. That is what is here.

If your goal is *"an AI writes songs and I listen to them"*, read
[`08-agent-prompt.md`](08-agent-prompt.md) and skip the rest until something goes
wrong.

If you are an **agent** rather than a person, the shortest complete thing is
[`../SKILL.md`](../SKILL.md): every command word, every closed list, every limit
and every rule that causes a refusal, on one page. This folder is the long form of
the same contract, and the two are checked against each other by the test suite —
the skill page is held to naming every command word and every word of the
instrument vocabulary, and every ```script example in it is applied to a fresh
song like the ones below.

## Read in this order

| File | What it answers |
| --- | --- |
| [`../SKILL.md`](../SKILL.md) | **One page, for an agent:** the words, the closed lists, the limits, the rules, the recipes and the checklist. Start here. |
| [`01-getting-started.md`](01-getting-started.md) | What is on the screen, what the words mean, how to hear something in 30 seconds. |
| [`02-music-primer.md`](02-music-primer.md) | The minimum music theory needed to write something that sounds deliberate: notes, octaves, scales, chords, rhythm, and what each channel normally does. |
| [`03-script-reference.md`](03-script-reference.md) | **The language.** Every keyword, every argument, the exact grammar, and the rules that decide whether a script applies — including `machine` and `pad`, the song-level **drum machine** that plays a beat beside the channels. |
| [`04-cookbook.md`](04-cookbook.md) | Short recipes: a beat, a bassline, a chord progression, an arpeggio, a fill in one line, a two-bar song — and the three genre SKELETONS (`start house`, `start lofi`, `start ballad`) taken apart line by line. Copy, paste, tweak. |
| [`05-error-catalogue.md`](05-error-catalogue.md) | Every diagnostic Tracklet can print, what causes it, and the exact fix. |
| [`06-examples.md`](06-examples.md) | Complete songs, start to finish, with notes on why each one works. |
| [`07-agent-guide.md`](07-agent-guide.md) | Working procedure for an AI agent: the checklist, the common failure modes, and how to verify your own output. |
| [`08-agent-prompt.md`](08-agent-prompt.md) | **If you want an AI to write the music:** handoff prompts to paste, how to write a brief, and the loop to iterate in. |
| [`09-song-files.md`](09-song-files.md) | Saving and opening: the `F2` file menu, and both formats a song travels in — the `.txt` script and the `.json` song file. |
| [`10-instruments.md`](10-instruments.md) | **Recorded instruments:** importing a Noislet sound pack or a SoundFont, the instrument list, and playing them with `wave font`. |

## The one-paragraph version

A tracklet song is a **grid**. One axis is **steps** (time); the other is
**tracks** (channels), and each channel sounds one note at a time with its own
SOUND — a named voice, or a waveform plus nine knobs. A step that holds a note
sounds it; the sequencer walks the steps at
`bpm × steps-per-beat` steps per minute and loops, with a FEEL you set in one
number (`swing 60` pushes every second step later, which is a lilt, and never
changes the tempo). Tracklet Script is that grid
written as text: header lines set the tempo, the grid's length and its channels,
then **one line per step**, with one note per column. `.` means "nothing on this
step".

A song may also carry a **drum machine** — an instrument that is not a channel: a
small grid of PADS you design, a step grid you draw one hit at a time, and its own
mix. It is written with `machine …` for that mix and `pad N …` for each lane
(`pad 1 KICK pattern "9...9...9...9..."` — `.` a rest, `1`–`9` how hard the hit
lands), it is saved in the song, and it plays beside the tracks rather than
inside one of them. Its module is
[`src/model/machine.ts`](../src/model/machine.ts), held to by
[`src/__tests__/machine.test.ts`](../src/__tests__/machine.test.ts).

```script
tempo 128
tracks 4

A-4 A-2 E-4 C-6
C-5 .   .   .
E-5 .   .   C-6
```

Paste that into the app's **SCRIPT** panel and press APPLY; it becomes a song
you can see in the grid and hear with SPACE. The panel parses it as you type and
will not apply anything with a mistake in it.

Channels can also be renamed by hand: **shift+click** a channel's **name** in the
TRACKS panel and type (a plain click only selects the channel). Scripts do the
same thing with `track 2 "BASS"`, and both land on the same field, so the two are
always interchangeable. The same holds one level up — **shift+click the song's
title** in the top bar renames the song, which is what `song "..."` does.

Press **`F1`** at any time for a menu of every control in the app, **`F8`** to
turn the pattern panel into drum lanes (one row per drum of the channel under the
cursor) and back, **`F2`** for the file menu (new, open, save), **`F3`** for the
song's order, **`F4`** for the
sound menu — pick a named instrument (`pad`, `pluck`, `hat`) and turn nine
percentage knobs — **`F5`** for the mixer page, where every channel has its own
strip (level, pan, the two sends, a group, a `MUTE` and a `SOLO` box) beside the
drum machine, the groups, the shared room and the whole mix, **`F6`** for the
instrument browser, which lists every wave, knob, voice and console the app can
sound like, **`F7`** for sound design, which shows a channel as the stack ofup to four layers it really is (`INS` stacks one, `DEL` takes one out; `Tab` swaps
that page for the six channel effects), and **`F9`**
for the appearance menu, which
chooses the theme every pixel of the app is drawn from. Inside a menu the
arrows (or `W A S D`) walk the list, `Enter` or `Space` takes the highlighted
item, and `Esc` leaves. A song leaves the app
either as the same Tracklet Script you paste in, or as a `.json` file for a
program to read — see [`09-song-files.md`](09-song-files.md).

## Where the code lives

```
tracklet/src/model/script.ts   the language: tokenizer, parser, applier, diagnostics
tracklet/src/model/songfile.ts the file formats: write a script, read/write JSON
tracklet/src/model/patchfile.ts a PATCH file: one channel's sound as a small JSON document, and the line between the sound and the mix
tracklet/src/model/song.ts     the song data: Song / Pattern / Track / Cell
tracklet/src/model/voice.ts    how a channel sounds: waves, the nine knobs, the named voices
tracklet/src/model/instrument.ts a channel's PATCH: the voice (layer 1), the layers above it, and the sounds you saved
tracklet/src/model/instrumentLibrary.ts the imported instruments: a Noislet pack or a soundfont, and the list they live in
tracklet/src/model/capabilities.ts the language as DATA: its version, every command, the limits, the closed lists
tracklet/src/model/automation.ts a value that MOVES over bars: the lanes, how one is read, and what it may move
tracklet/src/model/sections.ts  the song's FORM: names for groups of bars, and the arrangement they expand into
tracklet/src/model/grid.ts     the bar as NOTE VALUES: `grid 8t` and `meter 7 8`, resolved to a steps/beat pair
tracklet/src/model/shape.ts    what KIND of filter `bright` opens: low-pass, high-pass, a vowel or a notch
tracklet/src/model/articulation.ts how a note is PLAYED: `>` slides into it, `*N` hits it N times, and the hits either gesture produces
tracklet/src/model/variation.ts how a part stops sounding TYPED: `robin` walks successive hits through a fixed four-hit cycle and `touch` darkens a soft hit, both answering with one small tone shift the synth applies in one place
tracklet/src/model/drift.ts the transport wobble as a knob a lane can move: `drift` is the tape's wow and flutter pulled out as a plain channel value, the rates and widths the synth builds its modulators from
tracklet/src/model/speed.ts the master TAPE SPEED: one ratio that moves pitch and time together, the range, the factor the clock divides by and the synth multiplies every frequency by, and the interval it means
tracklet/src/model/chord.ts     chords: the nine shapes, a chord by name or by degree, and the ARPEGGIO that spreads one over time
tracklet/src/model/genre.ts     the STARTING POINTS: `start house`, `start lofi`, `start ballad` — each a whole working skeleton, stored as the notation it is made of
tracklet/src/model/drum.ts      the DRUMS: the four hits one channel can play at a time, their General MIDI pitches and their three-character grid labels
tracklet/src/model/kit.ts       the DRUM KIT: which four patches those drums play — `studio`, `808`, `brush`, `rock`, `metal` or `dusty`, one word for a whole set
tracklet/src/model/sample.ts    the SAMPLE BANK: the recordings YOU load, their name rules, and the reference a song holds instead of the audio (the bytes live in the app — see `audio/wav.ts` for the reader)
tracklet/src/model/bus.ts      the mix's GROUPS: one fader over several channels, and the level it multiplies them by
tracklet/src/model/rows.ts     a RANGE OF STEPS: `rows A to B`, the octave shift, the repeat, the roll and the reverse a range takes, and the arithmetic that says whether it fits
tracklet/src/model/progression.ts the chord LOOP a song hangs on: the steps (named or by degree), how long each lasts, and the rows a follower writes them on
tracklet/src/model/bounce.ts     the LOOP REGION: which bars an export renders, the `L` mark that makes one by hand, and the one place bars become steps
tracklet/src/model/stems.ts    the EXPORT SET: which channels become a `.wav` each, what those files are called, and the one refusal
tracklet/src/model/loudness.ts the LOUDNESS TARGET: the `loud` clause, the range a target may be in, and the ladder of published stops the `LOUDNESS:` row walks
tracklet/src/model/kitfile.ts a KIT file: the song's four drum voices as a small JSON document, the name rules a script can address, and the one refusal (a missing drum)
tracklet/src/audio/lufs.ts     how loud a render IS: ITU-R BS.1770 K-weighting and gated integration, the gain that lands it on a target, and the ceiling that keeps that gain from clipping
tracklet/src/audio/zip.ts      the container a stem set travels in: a store-only, timestamp-free ZIP writer, so one download can carry a file per channel
tracklet/src/model/mix.ts      who is heard: the level/mute/solo rule, in one place
tracklet/src/voiceLibrary.ts   the sounds you saved: one localStorage key, treated as input
tracklet/src/kitLibrary.ts     the DRUM KITS you saved: the same one-key bargain as the voices, one scope out
tracklet/src/sessionStore.ts   the WORKING SESSION: the song you were just editing and the settings beside it, autosaved to one key and put back on the next boot, with its own wrapper version
tracklet/src/model/notes.ts    note names <-> MIDI numbers
tracklet/src/model/midi.ts     reading a Standard MIDI File into a song
tracklet/src/model/midiExport.ts writing a song out as a Standard MIDI File
tracklet/src/model/midiIn.ts   MIDI arriving live: decoding a keyboard's messages, the tempo arithmetic a clock is measured with, and the one control (off, listen, record)
tracklet/src/midiIn.ts         the browser half of a real keyboard: Web MIDI access, the permission asked for on purpose, and the list of inputs, with every rule about what a message MEANS left in the model
tracklet/src/model/scale.ts    keys and scales: the intervals, and reading `key D minor`
tracklet/src/ui/VoiceMenu.ts   the F4 sound menu: a voice list, five live knobs, the stack report
tracklet/src/ui/PatchMenu.ts   the F7 design menu: the layer stack and the six channel effects, one row per control
tracklet/src/ui/MixerView.ts   the MIXER page: a strip per channel (level, pan, sends, group), the drum machine's own strip, the groups, the room and the whole mix, with a `THIS CHANNEL` panel beside them
tracklet/src/ui/mixerBoard.ts  the mixer's decisions, with no Phaser in them: which strips exist, where the selection can go, which group a channel may join, how the effects are paged
tracklet/src/ui/KeyboardStrip.ts the piano, including which notes are in the key
tracklet/src/ui/ScriptPanel.ts the SCRIPT modal (paste box + live check + cheat sheet)
tracklet/src/ui/FileMenu.ts    the F2 file menu (new, open, import, save, export)
tracklet/src/ui/stepView.ts    what a step SAYS in both views of the pattern — the note grid's cell and the F8 drum lane's mark
tracklet/src/ui/overview.ts     the mini-map down the grid's right edge: how many notes each step holds, and which step a click on the strip lands on
tracklet/src/ui/historyRows.ts  the undo TIMELINE as words: what one edit changed (read by diffing two snapshots, so it cannot drift), and the whole stack as a list newest-first
tracklet/src/ui/HistoryMenu.ts  the F10 menu: that timeline as rows you can jump back through, each jump running the same `undo` the Ctrl+Z key runs
tracklet/src/ui/contrast.ts     the WCAG arithmetic: relative luminance, the ratio, the three published bars, and a pair read out as a number and a grade
tracklet/src/ui/textScale.ts    the three text sizes as a closed list, their factors, the cycle, and the one that is live
tracklet/src/textScalePrefs.ts  how big you like the text, remembered in one namespaced key and validated on the way back in
tracklet/src/ui/pianoRoll.ts    the roll's arithmetic (Phaser-free): the pitch range a channel is drawn over, the step-to-x and y-to-pitch maps, sideways scrolling, and which rows the key tints
tracklet/src/ui/PianoRollView.ts the F8 piano roll: one channel, time across and pitch up, a labelled keyboard gutter, the notes of the pattern drawn as marks, and the click that writes one
tracklet/src/ui/TrackList.ts   the channel list, with the shift-click rename box
tracklet/src/ui/HelpOverlay.ts the F1 controls menu: the frame, the scroll, the bar, and the rows it draws from the board below
tracklet/src/ui/helpBoard.ts   the F1 menu's content and the arithmetic that fits it in its frame (Phaser-free): every row in both columns, how tall a column is, and how far it may scroll
tracklet/src/__tests__/script.test.ts   the language's own test suite
tracklet/src/__tests__/automation.test.ts the lanes: the arithmetic, the word, the file, and that nothing moves when nothing does
tracklet/src/__tests__/sections.test.ts the form: the names, the arrangement, the order it builds, and that it is forgotten when the order is edited
tracklet/src/__tests__/grid.test.ts      the sugar: every grid and meter it accepts, the refusals, and that a bar is still two numbers underneath
tracklet/src/__tests__/shape.test.ts     the four filters: the node each one builds, the word, the file version, and that a patch nobody shaped is unchanged
tracklet/src/__tests__/articulation.test.ts how a note is played: the two gestures and every refusal, the hits a plain note and a stutter produce, the cell grammar, the file version, and that a plain note is undisturbed
tracklet/src/__tests__/variation.test.ts how a part stops sounding typed: variant 0 is the note as written, the four-hit cycle and its determinism, the tone a soft hit loses, both settings through a script and a file, the file version, and that `robin 0`/`touch 0` are bit-for-bit unchanged
tracklet/src/__tests__/drift.test.ts the transport wobble: the range and the identity at 0, the wow and flutter widths, `drift` on a track line and as an `automate` destination, the file version, and that a steady channel is bit-for-bit unchanged
tracklet/src/__tests__/speed.test.ts tape speed: the ratio and its interval, the row clock stretched and the pitch moved by the SAME factor, `speed` as a statement and a file field, the refusals, and that normal speed is bit-for-bit unchanged
tracklet/src/__tests__/generators.test.ts the idioms: the arpeggio's arithmetic and words, the section repeat, the gestures that are already arithmetic (roll, strum, flam), and that neither generator moves a byte of the file format
tracklet/src/__tests__/bus.test.ts       the group fader: the multiplication, the naming, the word, the file version, and that a song with no groups is bit-for-bit unchanged
tracklet/src/__tests__/rows.test.ts      a range of steps: the bounds, the octave clamp, a repeat that cannot race its own source, both words through a script, and that a range moves no byte of the file format
tracklet/src/__tests__/feel.test.ts      a part's own pocket: the per-channel groove and humanize, that an opinionated part and a silent one differ, and that a silent one is unchanged
tracklet/src/__tests__/poly.test.ts      a channel holding many notes: the stealing rule, the word, the file version, and that `poly 1` is undisturbed
tracklet/src/__tests__/cellChord.test.ts a chord in one cell: the two-field invariant, both spellings, the chord tool landing in one cell or spreading, the file version, and the refusal that keeps a chord from being thinned
tracklet/src/__tests__/drum.test.ts      the drums: the table and its two lookups, the cell invariant, both spellings, the file version, the MIDI export of a kit channel, and the refusal that names the four drums
tracklet/src/__tests__/kit.test.ts       the drum kit: the four sets, the identity (`studio` is the presets), the word, the file version, the catalog, and that naming a kit is never a no-op
tracklet/src/__tests__/sample.test.ts    the recordings you own: the WAV reader against the FORMAT (8/16/24-bit, float, chunk walking, the refusals), the bank's name rules and cap, both spellings through a script, the file version, and the fallback that plays the built-in one-shot when the app has no such file
tracklet/src/__tests__/stepView.test.ts  the drum lanes: which lane a hit lands on, what a melodic note says in all four, the weights, and the click that writes a hit
tracklet/src/__tests__/mixerBoard.test.ts the mixer's decisions: which strips exist, the machine as a column, where the selection can go and its walls, which group a channel may join, how the effects are paged, and the name a new group gets
tracklet/src/__tests__/machinePan.test.ts a pad's place between the speakers: the machine's chain splits an already-stereo pad input and balances the sides (the fix for a pad's pan being folded to mono), and a track's mono graph is left with no splitter
tracklet/src/__tests__/historyRows.test.ts the undo timeline: what one edit changed and the order the diff looks for it, the oldest row as the start of the session, and EDITED when nothing it can name moved
tracklet/src/__tests__/overview.test.ts  the mini-map: the density per step (a chord counts as every note), the linear point-to-step map and its clamps, and that a mark stays inside the strip
tracklet/src/__tests__/pianoRoll.test.ts the roll: one channel's own pitches, a range that grows to an octave and stops at three, the centring on the cursor and its clamps at both ends, the row and column inverse maps, and which rows the key tints
tracklet/src/__tests__/contrast.test.ts  the arithmetic (21:1, symmetry, monotonicity, the three bars) and a guard over the framework's own palettes: every shipped theme must keep body text at AA and its dim and accent text at AA-large
tracklet/src/__tests__/textScale.test.ts the sizes: the closed list and the identity at `normal`, the wrap-around cycle, the labels, the one live value refusing a word that is not a size, and the storage reading back only a real word through a store that may throw in either direction
tracklet/src/__tests__/progression.test.ts the chord loop: the two spellings, the hold, the rows a follower writes, both followers through a script, the refusals, and that a song with no loop is byte-for-byte unchanged
tracklet/src/__tests__/bounce.test.ts the loop region: the statement and its refusals, the `L` mark's three presses, the fit to a shorter order, the end at a shorter order, and that a region moves no byte of a song
tracklet/src/__tests__/genre.test.ts the starters: every skeleton applied and read back, the splice (a line below one is checked against the shape it made), the refusals, and that a started song carries no file format of its own
tracklet/src/__tests__/stems.test.ts the export set: the naming, which channels become files, the refusal, the checksum against its published values, the archive's own layout, and a WAV read back OUT of one
tracklet/src/__tests__/loudness.test.ts the loudness target: the filter against the coefficients the standard publishes, a tone whose loudness is known by definition, the gates, the ceiling, the statement's two clauses and every refusal
tracklet/src/__tests__/kitfile.test.ts a kit file: the round trip of a rich one and of the presets, the name rules, the library of your kits, the refusals, and the version a song naming one writes
tracklet/src/__tests__/sessionStore.test.ts the working session: the wrapper and its version, the round trip, a value from a future build refused, a blocked store that fails silently, and forgetting on request
tracklet/src/__tests__/midiExport.test.ts the writer and the reader, checked against each other by round-tripping a song
tracklet/src/__tests__/midiIn.test.ts the messages a keyboard sends: decoding (a velocity-0 note-on as a note-off, channels, the transport, the refusals), the velocity scale, the median tempo rule and its dropouts, a played note landing at the playhead (and following the order), and the three modes and their words
tracklet/src/__tests__/patchfile.test.ts a patch file: the round trip of a rich sound and a default one, that dry stays dry, that the mix is untouched, and every refusal
tracklet/src/__tests__/songfile.test.ts the formats, round-tripped
tracklet/src/__tests__/docs.test.ts      applies every script example in this folder, checks the coverage guards, spells the catalog's own vocabulary, and holds the agent briefs to the versions this build speaks
tracklet/src/__tests__/golden.test.ts    hashes two fixture songs, so an old one cannot start sounding different
tracklet/src/__tests__/capabilities.test.ts checks the published manifest against the language itself
```

**The whole language, as data.** `scriptCapabilities()` answers what a tool has
to ask before it writes a line: `scriptVersion` (21 is the current one; 2 added the `layer` statement, 5 the
`duck` setting, 6 the `automate` lane, 7 `section`/`arrange`, 8 the
`grid`/`meter` sugar, 9 `shape` and the `bus` group, 10 the articulation
suffix — `C-4>`, `C-4*3` — 11 the two generators, `arp` on a chord and
`repeat` on an `arrange`, 12 the `rows` statement — a RANGE of steps,
`rows 0 to 3 octave up` or `rows 0 to 3 repeat 4` — 13 the CHORD IN ONE
CELL, `C-4,E-4,G-4`, 14 the DRUM, `drum 0 4 kick` and a grid word that
names one, `kick . hat .`, 15 the KIT, `kit 808` — which four patches those
drums play — 16 the SAMPLE, `sample BRK02` on a track line after
`sample load "samples/break.wav"` — and 17 the PROGRESSION, the chord loop a song
hangs on: `progression 1 6 4 5`, played by `chord 0 1 follow` and `note 0 4
follow` — 18 the GENRE STARTER, `start house`, a whole worked skeleton in one
word — 19 the EXPORT REGION, `export bars 8 to 15`: the bars the three
exports render — and 20 the LOUDNESS TARGET, `export loud -14`: how loud the two
audio exports arrive, measured to ITU-R BS.1770. Both are session state, so no
file carries either — 21 the KIT OF YOUR OWN, `kit MYHOUSE`: any word that is
not one of the built-ins names a kit saved as a `.kit.json`, resolved against
the app's library, with a song naming a kit this machine does not have playing the
four presets — and 22 the WIDER CLOSED LISTS: three more scales (`mixolydian`,
`phrygian`, `blues`), six more chord shapes (`5`, `sus2`, `sus4`, `6`, `add9`,
`9`), three more feels (`boom-bap`, `swing-16`, `d-beat`) and two more kits
(`metal`, `dusty`)),
`keywords`, `commands` (one row per word, each with a `tier`, a one-line purpose
and an example the test suite applies), `tiers`, `limits` (every range, from the
constants the parser reads), `vocabulary` (the closed word lists: waves, voices,
the nine knobs, layer fields, tunings, feels, the KITS (studio, 808, brush, rock, metal, dusty), consoles, scales (major, minor, harmonic minor, dorian, mixolydian, phrygian, blues, pentatonic), chord modes, the ten effects, the four DRUMS, the grids and meter note values, the articulation characters,
the arpeggio's three directions with their aliases, the transformations a `rows`
range takes, the pitch a loaded recording plays at (`sampleRootHz`), and
the twelve things an `automate`
lane may move with both ends of each) and `fileVersions`. A development build publishes it as
`window.__tracklet.capabilities`, so a tool can ask the app in front of it rather
than trusting a page — see
[the agent guide](07-agent-guide.md#0-ask-the-build-what-it-speaks).

The published constants that a tool should read instead of hard-coding:
`SCRIPT_VERSION` (which words this build speaks), `SCRIPT_COMMANDS` (the per-word
table that manifest is built from),
`SCRIPT_KEYWORDS`, `SCRIPT_QUICK_REFERENCE`, `SCRIPT_EXAMPLE`, `SCRIPT_DOC_PATH`,
`SONG_FILE_FORMAT`, `SONG_FILE_VERSION` (what a plain song is written as),
`STACK_SONG_FILE_VERSION` and `SONG_FILE_VERSION_MAX` (what a song with a layer
stack is written as, and the newest version OPEN reads), `MIN_DUCK`/`MAX_DUCK`
and `DUCK_STEP`/`DEFAULT_DUCK` with `TRACK_DUCK` (the pump: its range, its step
and the one description of what it is for), `MIN_HUMANIZE`/`MAX_HUMANIZE` with
`DEFAULT_HUMANIZE`/`HUMANIZE_STEP` and `trackFeel` (a part's pocket: how far a
channel may be humanised, and the one place its feel is worked out), `AUTOMATION_TARGETS` (every word an
`automate` lane may name, with the range, both named ends, where the value lands
and what a composer reaches for it for), `MAX_AUTOMATION_LANES`,
`MAX_BUSES`/`MAX_BUS_NAME` and `NO_BUS_WORD` with `busLevelFor`/
`channelBusLevels` (the mix's groups: how many, how long a name may be, the word
that takes a channel back off one, and the one place a channel's group is turned
into the number the audio path multiplies by), `BUS_SONG_FILE_VERSION` (what a
song whose channels are grouped is written as),
`AUTOMATION_SONG_FILE_VERSION` (what a song that moves something is written as),
`MAX_SECTIONS`/`MAX_SECTION_NAME` and `SECTIONS_SONG_FILE_VERSION` (the form: its
size, its name budget and what a song with one is written as),
`FEEL_SONG_FILE_VERSION` and `POLY_SONG_FILE_VERSION` (what a song where a PART
has a feel, or a channel holds many notes, is written as),
`MIN_POLY`/`MAX_POLY` with `DEFAULT_POLY`/`clampPoly` and `voiceToSteal` (how wide
a channel may be, and the one place the note that gives way is chosen),
`GRID_NAMES`/`STEPS_PER_WHOLE` and `METER_UNITS` (the bar as note values: the
grids `grid` accepts, what a whole note is worth in steps, and the note values a
`meter` beat may be), `FILTER_SHAPES`/`DEFAULT_SHAPE` with `shapeFromName`,
`shapeNames`/`shapeLabel` and `isFilterShape` (the four filters `bright` can be,
with their aliases: the table the parser, the file reader, the menus and the
audio graph all read),
`ROW_RANGE_WORD`, `ROLL_WORD`, `REVERSE_WORD`, `ROW_TRANSFORMS`/`ROW_TRANSFORM_WORDS` and
`MIN_OCTAVE_SHIFT`/`MAX_OCTAVE_SHIFT`/`MIN_ROW_REPEAT` with
`MIN_ROLL_HITS`/`MAX_ROLL_HITS`/`DEFAULT_ROLL_HITS` and
`rowRangeProblem`/`rowRangeLength`/`rowRangeLabel` and
`repeatProblem`/`repeatEnd`/`shiftRangeOctaves`/`repeatRange`/`rollRange`/`reverseRange` (a RANGE
OF STEPS: how the language writes a run of rows, the five transformations it takes
and their ranges, and the one place a range is validated and the one place it is
applied),
`ARP_DIRECTIONS`/`ARP_ALIASES` and `MIN_ARP_STEPS`/`MAX_ARP_STEPS` with
`arpNotes`/`arpDirectionFromName` (the arpeggio: the three ways to walk a chord,
the words that also name them, how far a run may reach, and the one place a chord
becomes a run of notes), `REPEAT_WORD` and `MIN_REPEAT`/`MAX_REPEAT` (how many
times an `arrange` may play a section),
`SLIDE_CHAR`/`STUTTER_CHAR`/`GRACE_CHAR`/`SCOOP_CHAR`/`FALL_CHAR` with
`MIN_STUTTER`/`MAX_STUTTER`/`MAX_GRACE`/`MIN_BEND`/`MAX_BEND`/`DEFAULT_BEND`,
`SLIDE_GLIDE`, `SCOOP_SPAN`/`FALL_SPAN`/`BEND_MAX_SECONDS` with `bendSeconds`,
`clampBend` and
`parseArticulation`/`articulationProblem`/`articulationText`/`bendText`/
`articulationLabel` and `articulationHits` (how a note is PLAYED: the characters a
cell writes, the ranges they take, the glide a slide uses and how long a bend
lasts, the reader and the one place a note is turned into the hits that sound),
with `ARTICULATION_SONG_FILE_VERSION` (what a song with an articulated note is
written as),
`ROBIN_MIN`/`ROBIN_MAX`/`DEFAULT_ROBIN`/`ROBIN_STEP`/`MAX_ROBIN_CENTS`/
`MAX_ROBIN_GAIN`/`MAX_ROBIN_BRIGHT` and `TOUCH_MIN`/`TOUCH_MAX`/`DEFAULT_TOUCH`/
`TOUCH_STEP`/`MAX_TOUCH_BRIGHT`/`ROUND_ROBIN_CYCLE` with `ToneShift`/`NO_TONE_SHIFT`,
`clampRobin`/`clampTouch`/`robinLabel`/`touchLabel`,
`roundRobinShift`/`touchShift`/`hitShift`/`isToneShift` (the two settings that
stop a part sounding typed: a round-robin that walks a fixed four-hit cycle, a
velocity layer that darkens a soft hit, the one small tone shift both answer with,
and the identity — the note as written — that `robin 0`/`touch 0` and every FIRST
hit keep exact), with `VARIATION_SONG_FILE_VERSION` (what a song whose channels
vary is written as),
`DRIFT_MIN`/`DRIFT_MAX`/`DEFAULT_DRIFT`/`DRIFT_STEP`/`DRIFT_MAX_CENTS`/
`DRIFT_FLUTTER_CENTS`/`DRIFT_WOW_HZ`/`DRIFT_WOW_DRIFT_HZ`/`DRIFT_WOW_DRIFT_WEIGHT`/
`DRIFT_FLUTTER_HZ` with `clampDrift`/`driftLabel` (the transport wobble as a value
a lane can move: the range and the label, and the three rates and two widths the
synth turns into oscillators — the same wow and flutter the tape effect carries,
here on a channel that is not on tape), with `DRIFT_SONG_FILE_VERSION` (what a song
whose channels wander is written as),
`SPEED_MIN`/`SPEED_MAX`/`DEFAULT_SPEED`/`SPEED_STEP`/`SPEED_NORMAL` with
`clampSpeed`/`speedFactor`/`speedSemitones`/`speedLabel` (the master tape speed:
the range and the label, and the ONE ratio both consumers read — `secondsPerRow`
divides by it and the synth multiplies every frequency by it, so pitch and time
cannot come apart), with `SPEED_SONG_FILE_VERSION` (what a song played at a speed
other than normal is written as),
`MIDI_EXPORT_PPQ` and `MIDI_EXPORT_FORMAT`/`MIDI_EXPORT_FILE_EXTENSION` (the
resolution, the SMF format and the extension the writer writes),
`VOICE_PROGRAMS`/`DRUM_PITCHES` with `gmProgramForVoice`/`drumPitchForVoice`
(how a channel's voice and a percussion part are written for another program),
`DRUMS`/`DRUM_IDS`/`DRUM_BY_ID` with `drumFromName`/`isDrumName`/`drumNames`,
`drumPitch`/`drumForPitch`/`drumLabel` and `drumVoice`/`drumPatch` (the KIT: the
four drums and their General MIDI pitches, the one reader of their words, the
lookup each way, the three characters a grid cell shows, and the one place a drum
becomes a sound), with `DRUM_SONG_FILE_VERSION` (what a song with a drum hit is
written as),
`KITS`/`KIT_IDS`/`KIT_BY_ID` with `kitFromName`/`kitNames`/`kitById`/`kitLabel`,
`DEFAULT_KIT`/`isDefaultKit`/`nextKit` and `kitVoice`/`kitPatch`/`kitVoices` (the
drum KIT: the four named sets of four patches, the default `studio` that IS the
presets, the reader of their words, and the one place a kit becomes a sound),
with `KIT_SONG_FILE_VERSION` (what a song on a named kit is written as),
`Sample`/`SampleBank` with `makeSample`/`addSample`/`removeSample`/`sampleByName`/
`sampleNames`/`sampleLabel`/`sampleSeconds`/`isSampleName`/`sampleNameProblem` (the
SAMPLE BANK: one recording of yours, the bank the app holds, the name rules a song
and a file are both checked against, and the lookups that resolve a name to a file
— the AUDIO is not here: the bytes and the reader are `audio/wav.ts`, which is
where `decodeWav` turns a `.wav` into channels and `monoPcm` folds them to one),
`MAX_SAMPLES`/`MAX_SAMPLE_NAME`/`MIN_SAMPLE_SECONDS`/`MAX_SAMPLE_SECONDS` and
`NO_SAMPLE_WORD`/`SAMPLE_FILE_EXTENSIONS` with `SAMPLE_ROOT_HZ` (the bank's cap,
the name budget, how short and how long a recording may be, the word that takes
one off a channel, the picker's extensions, and the one pitch convention that
MUST be published: a loaded file sounds at the C-4 the app assumes),
with `SAMPLE_SONG_FILE_VERSION` (what a song naming a recording is written as),
`PROGRESSION_WORD`/`PROGRESSION_NONE_WORD`/`FOLLOW_WORD` with
`PROGRESSION_HOLD_WORD` and `DEFAULT_PROGRESSION_HOLD`/
`MIN_PROGRESSION_HOLD`/`MAX_PROGRESSION_HOLD`/`MAX_PROGRESSION_STEPS` (the chord
LOOP: the words the statement and its two followers are written with, how long a
chord lasts by default and at its ends, and how many fit), with
`progressionHold`/`progressionStepSize`/`progressionStepNotes`/
`progressionStepRoot`/`progressionStepAt`/`progressionStartsAt`/
`progressionStartRows`/`progressionStepLabel`/`progressionLabel`/
`progressionScript` and `PROGRESSION_SONG_FILE_VERSION` (the one place a loop is
resolved into notes, the label a screen and a file both print, the line a saved
script writes, and what a song with a loop is written as),
`GENRE_WORD`/`GENRES`/`GENRE_IDS` with `genreFromName`/`isGenreName`/`genreNames`/
`genreLabel`/`genreScript` (the STARTERS: the skeletons themselves as notation,
what to call them, and the one place the line `start house` is written), `MAX_LAYERS` and
`MAX_EXTRA_LAYERS` (a channel's layers, and how many of them are above the
voice), `LAYER_FIELDS` (the `octave`/`detune`/`gain` field metadata the catalog
and the docs share), and the limits `BPM_MIN`/`BPM_MAX`,
`MIN_TRACKS`/`MAX_TRACKS`, `MAX_PATTERNS`, `MAX_SONG_TITLE`, `MIDI_MIN`/`MIDI_MAX`,
`MAX_USER_VOICES` and `MAX_VOICE_NAME` (the saved-sound library's two limits),
re-exported from `tracklet/src/model`. The scales are published the same way:
`SCALES` (ids, labels, intervals, one-line blurbs) and `DEFAULT_KEY` come out of
`tracklet/src/model/scale.ts`, and the sounds come out of `voice.ts`: `VOICES`
(labels, families, blurbs, params), `VOICE_PARAMS` (the nine knobs with their two
named ends), `MIN_PARAM`/`MAX_PARAM`, and `waveFromName`/`isWaveName`.

## Ground rules that never change

- **A script describes the WHOLE song.** Applying one replaces the song rather
  than merging into it. That is why `new` exists, and why every example starts
  from a blank slate.- **A script can control everything the app can.** The title, the key, length
  (`steps`), resolution (`beat`), tempo, FEEL (`swing`), channels, their SOUND
  (voice, waveform and the nine knobs), their LEVEL in the mix, their place
  (`pan`), what the room gets of them (the two sends), how far they push the rest
  of the mix down while they play (`duck`), how a value MOVES over bars
  (`automate`), what the song's bars are NAMED (`section`/`arrange`), the chord
  LOOP it hangs on (`progression`, with `chord 0 1 follow` and `note 0 4 follow`
  writing its notes out), what KIND of
  filter a channel's `bright` opens (`shape`), holds,
  mutes, patterns, the order,
  notes and the master volume are all reachable from text —
  nothing about a song is hand-editable only. A script can also set the nine
  SESSION settings that travel beside the song: the master `volume`, the
  `octave`, the `theme` the app wears, which channels are `solo`ed, what one key
  writes (`chords`), whether notes are auditioned (`hear`), which imported
  instrument `wave font` plays (`instrument use`), the bars an export renders
  (`export bars 8 to 15`, the loop region), and how loud an audio export arrives
  (`export loud -14`, a LUFS target the finished render is measured against).
  [Section 9 of the
  reference](03-script-reference.md#9-what-a-script-can-control) is the complete
  table, including the four things a script deliberately leaves to the hand
  (playback, the sound library, the file menu, and the cursor) and why.
- **Nothing is half-applied.** The script is parsed first; if any line is wrong,
  no line takes effect and every mistake is reported with its line number.
- **One undo step.** A bad applied script is a single `Ctrl+Z` from gone, and so
  are `NEW SONG` and `OPEN FILE…`. A whole visit to the `F4` sound menu is one
  step too, however many knobs you turned.
- **A song carries its own mix.** A channel stores its level, so a balanced song
  stays balanced in another app session or on another machine. `SOLO` is the one
  mix control that is NOT stored, because it says how you are LISTENING rather
  than what the song is.
- **A song carries its own sounds.** A channel stores its waveform and nine knobs,
  so a song sounds the same anywhere whether or not it names a voice. The sounds
  you SAVE (`F4` → `SAVE AS…`) are a shortcut for writing the next song, not data
  a song depends on — which is why a file never needs to carry them.
- **A song does NOT carry its recorded instruments.** A channel can say
  `wave font`, and which instrument that is depends on what you have imported —
  imported instruments live in a list in the app, not in a song, for the same
  reason a song is a few kilobytes and a sample pack is not. See
  [`10-instruments.md`](10-instruments.md).
- **A file is the WHOLE song, and opening one replaces rather than merges.** A
  saved script is written to be opened on its own, and it reads back as exactly
  the song it came from — see [`09-song-files.md`](09-song-files.md).
- **Rows count from 0. Tracks count from 1.** This is the only asymmetry in the
  language, and it is the mistake every new author makes once.
- **Every example in this folder is executed by the test suite.** `npm test`
extracts each ` ```script ` block from `doc/` and applies it to a fresh song, so an
example that stops parsing fails the build rather than misleading an agent.
- **The docs are checked against the code, not just by a reader.** Five guards
run with that one: every message the parser can print must have a section here in
[`05`](05-error-catalogue.md), every command word must appear in
[`03`](03-script-reference.md) and in the cheat sheet beside the paste box, every
word the instrument catalog publishes must be spelled out somewhere in this
folder — as a word, in `code` rather than in a sentence — the two agent briefs
([`07`](07-agent-guide.md), [`08`](08-agent-prompt.md)) must quote the versions
and the vocabulary this build really has, and two fixture songs are hashed — the
file they write, how long they render, and every channel's patch — so a change
that would make an old song sound different fails the build rather than the
record.
