---
name: tracklet-script
description: Write, repair and extend Tracklet songs as Tracklet Script — the plain-text music language of the Tracklet tracker in this repository. Use when someone asks for a song, loop, beat, bassline, melody, chord progression, chiptune or arrangement; when editing a .txt Tracklet script or example song; when reading a saved song file; or when the app's SCRIPT panel refused a script and the mistakes have to be fixed.
---

# Tracklet Script

Tracklet is a music tracker (`tracklet/` in this repository). **Tracklet Script** is
how you write music for it: plain text, one statement per line, describing a WHOLE
song. You hand back a fenced `script` block; a person pastes it into the app's
SCRIPT panel; the panel parses it *before* anything changes and either says
`READY TO APPLY` or prints every mistake with a line number.

Four properties decide how you work, and they are guarantees rather than
conventions:

| Property | What it means for you |
| --- | --- |
| **A script is the whole song** | It is not a patch. To change an existing song, describe the whole thing again, starting with `new`. |
| **Atomic** | One mistake means zero effect, and you are told about *every* mistake at once, with line numbers. There is no half-applied song to clean up. |
| **Deterministic** | Nothing is randomised. The same script always produces the same song, on every machine. |
| **Parse before apply** | A script can be checked without touching anybody's work. Do this, and fix your own output first. |

This page is the working reference and is meant to be enough on its own. The
exhaustive grammar is [`doc/03-script-reference.md`](doc/03-script-reference.md),
the long-form procedure is [`doc/07-agent-guide.md`](doc/07-agent-guide.md), and the
handoff prompts for a person are [`doc/08-agent-prompt.md`](doc/08-agent-prompt.md).

## 0. If you can, ask the build

Never guess a version and never trust a reference you memorised. Ask the app in
front of you:

```text
window.__tracklet.capabilities
```

| Field | What it answers |
| --- | --- |
| `scriptVersion` | Which words this build speaks, and what each version added (`versionNotes`). |
| `keywords` | Every command word, in the parser's order. |
| `commands` | One row per word: `tier`, what it is for, and an `example` that parses. |
| `tiers` | `core` (what you need to write a song) and `deep` (sound design, session settings). Write a core song first. |
| `limits` | Every range the language clamps to. |
| `vocabulary` | Every closed list a word may be chosen from. |
| `fileVersions` | What a plain song is written as, what a stacked one is, and the newest this build can read. |

`window.__tracklet.catalog` is the other half, one level down: what every wave,
voice, knob, console and kit *is*, with the one-line blurb that says which one to
reach for. Nothing in either object is written twice by hand — both are built from
the same tables the parser and the engine read, and a test fails if they drift.

## 1. The shape of a song

This is the order that works. Fill it in rather than inventing a layout.

```text
new                                        # always first: this REPLACES the song
song "<TITLE>"                             # at most 32 characters
key <A minor>                              # major | minor | harmonic minor | dorian | pentatonic
tuning <equal>                             # omit unless the music wants early-music intonation
tempo <40-300>
steps <1-512, omit for 16>                 # how many steps one pattern holds
beat <1-16, omit for 4>                    # how many steps are one beat
swing <0-100, omit for straight>
speed <25-400, omit for 100%>              # tape speed: pitch AND time together
volume <0-100, omit to leave the mix alone>   # a SESSION setting, not song data
reverb <0-100, omit for a dry room>
echo <0-100, omit for no repeats>
master <effect P>…                         # the ten effects on the whole mix, e.g. master drive 20
kit <studio|808|brush|rock|metal|dusty|NAME>  # which four patches the drum hits play
chip <CONSOLE>                             # dress every channel as one games console
grid <16|8t|…> / meter <7 8>               # the bar as note values, instead of steps/beat
section <NAME> <pattern numbers…>          # name a group of bars
arrange <NAME…>                            # build the order out of section names
progression <chords…> [hold N]             # the chord loop the song hangs on
bus <NAME> <0-100>                         # one fader over several channels
tracks <1-8>                               # BEFORE any track line or 5th+ column
track <N> …                                # one channel: name, sound, level, sends, effects
pattern <N> "<NAME>"                       # start writing a pattern
<one grid row per step, at most `tracks` columns>
order <pattern numbers…>                   # which patterns play, and in what order
```

The last four are session settings rather than song data — they set the app up for
whoever works on the song next, and none of them is stored in the file except
`volume`: `hear on`, `chords triad`, `solo 1 3`, `theme forge`, `page arranger`,
`live quantize 4`, `instrument use 1`, `export bars 8 to 15 loud -14`, `record select HOOK`. Never leave a `solo` behind in a script you hand
over.

## 2. The 53 command words

| Word | Tier | What it does |
| --- | --- | --- |
| `new` | core | Start a blank song. Discards everything above it. |
| `start` | core | Whole worked skeleton: `start house`, `start lofi`, `start ballad`. Begins with `new`. |
| `song` | core | The title, shown in the top bar. |
| `key` | core | The key and scale the chord tools and the piano follow. A GUIDE, never a constraint. |
| `tempo` | core | How fast it goes; also admits tempo changes by bar. |
| `octave` | core | Which octave a bare note letter means (0–7). |
| `beat` | core | How many steps are one beat (1–16). |
| `steps` | core | How many steps a pattern holds (1–512). |
| `grid` | core | The bar as note values: `grid 16` is sixteenths, `grid 8t` eighth-note triplets. |
| `meter` | core | Beats per bar and the note each beat is: `meter 7 8`. |
| `tuning` | deep | The temperament everything is played in. |
| `swing` | core | The feel: how far every second step is pushed later (0–100). |
| `speed` | deep | Tape speed: one number that moves pitch and time TOGETHER (100 is normal, 50 is half speed an octave down, 200 is double an octave up). |
| `groove` | deep | A named feel: `straight`, `backbeat`, `offbeat`, `shuffle`, `laid-back`, `pushed`, `boom-bap`, `swing-16`, `d-beat`, `human`. |
| `kit` | deep | Which four patches the drum hits play — `studio`, `808`, `brush`, `rock`, `metal`, `dusty`, or a kit of the user's own. |
| `machine` | deep | Set up the DRUM MACHINE — an instrument of pads and a step grid beside the channels, with its own level, pan, swing, sends and effects. |
| `pad` | core | One lane of the drum machine: `pad 1 KICK voice kick pattern "9...9...9...9..."` (`.` a rest, `1`–`9` how hard). A pad may name a recording with `sample NAME` (on a `wave sample` pad). |
| `chip` | deep | Dress every channel as one games console: `chip nes`, `chip genesis`. |
| `volume` | core | The master level (0–100). A session setting, and the one that IS saved. |
| `reverb` | deep | How much of the hall comes back (0–100). The room the song plays in. |
| `echo` | deep | How much of a single beat-synced repeat comes back (0–100). |
| `master` | deep | The ten effects on the whole mix: `master drive 20 tilt 15`. |
| `automate` | deep | One value moving over bars — the riser, the fade, the filter opening. |
| `section` | core | Name a group of bars: `section VERSE 1 1 2 1`. A section may also name the drum machine bar it plays: `section CHORUS 3 4 machine 2` (the beat follows the form). |
| `arrange` | core | Build the order out of section names — the form in one line. |
| `scene` | core | One row of the LIVE launch grid: the pattern each channel plays in it, `-` for a channel that is silent — `scene A 1 1 - 2`. A scene may name the drum-machine bar it performs with `kit N` (`scene A 1 1 - 2 kit 2`), or `kit off` to sit the machine out. Song data, stored and round-tripped. |
| `progression` | core | The chord loop the song hangs on; a channel can follow it. |
| `bus` | core | One fader over the channels that join it with `bus NAME`. |
| `theme` | deep | The look of the app. Almost never: the look belongs to the reader. |
| `instrument` | deep | Which imported instrument a `wave font` channel plays. Needs a file; avoid it. |
| `solo` | deep | Hear only some channels. While iterating; never in a handover. |
| `chords` | deep | What one key writes from now on: `off`, `triad`, `7th`. |
| `hear` | deep | Whether notes are auditioned as the cursor reaches them. |
| `export` | deep | What an audio export covers and how loud: `export bars 8 to 15 loud -14`. |
| `page` | deep | Which full screen is showing: `page arranger`, `page mixer`, `page live`, `page recorder`, `page arp`. A session setting, so one script can drive every tab. |
| `live` | deep | How a launch lands: `live quantize 4` waits for the next four bars before a queued scene takes over; `0` (or `off`) is immediate. A session setting, so no file carries it. |
| `tracks` | core | How many channels the song has (1–8). Before any `track` line. |
| `track` | core | One channel: name, sound, level, pan, sends, effects, mute. |
| `sample` | deep | Bring a `.wav` into the app (`sample load "path"`, `sample import`) and name it on a track line. |
| `record` | deep | A TAKE: capture one from the microphone (`record HOOK`), shape its window (`record trim HOOK 0.1 2.0`, `record loop HOOK 1.0 3.0`) or pick the one the page shows (`record select HOOK`). App state, never in the song. |
| `layer` | deep | Stack a layer above a channel's voice: the supersaw, the organ, the bell. |
| `mute` | core | Silence a channel without deleting it: `mute 4` (same as `track 4 off`). |
| `unmute` | core | Let a muted channel be heard again: `unmute 4`. |
| `pattern` | core | Start writing a pattern, and name it. |
| `order` | core | Which patterns play, in what order. Without one, only pattern 1 plays, forever. |
| `clear` | core | Empty a pattern and start it again. |
| `copy` | core | Copy one pattern into another, to vary it. |
| `rows` | deep | A range of steps: move its pitches by octaves, play it again, roll it, or read it backwards (`rows 0 to 3 reverse`). |
| `note` | core | Write one note at an exact row and channel: `note 0 2 C-4`. |
| `chord` | core | Write a whole chord from a row, across channels or into one cell. |
| `arp` | core | The ARP page's dials — `arp direction updown`, `arp octaves 2 rate 2 gate 60`, `arp mode source` — stored in the song, plus `arp write 0 1 Am` to commit the run they describe, `arp off` to clear them, and `arp hear on` to audition the run as the dials move (a session setting, like `page`). |
| `drum` | core | Write one drum hit: `drum 0 4 kick`. |
| `erase` | core | Take one note back out: `erase 0 1`. |

## 3. The `track` line, in full

```text
track N [NAME…] [voice V] [wave W] [knob P] [hold H] [level L] [pan P]
        [glide G] [vibrato B] [strum S] [robin R] [touch T] [drift D] [verb S] [echo S] [duck P] [groove F] [humanize P]
        [poly M] [shape S] [effect P] [sample NAME] [bus NAME] [on|off]
```

| Setting | Range | What it does |
| --- | --- | --- |
| `NAME` | ≤16 chars | The channel's name. Quoting is optional but it is how the language tells a NAME from a SETTING: `track 1 off` mutes, `track 1 "OFF"` names it OFF. |
| `voice V` | closed list | A waveform plus the nine knobs, in one word. |
| `wave W` | closed list | The oscillator shape, if you would rather not name a voice. |
| the nine knobs | 0–100 | `bright`, `sweep`, `duty`, `noise`, `attack`, `decay`, `ring`, `release`, `thick`. |
| `hold H` | 1–16 | How many steps a note of this channel lasts. `hold 1` gives way (an arpeggio), `hold 4` lets notes ring over each other (a strum). |
| `level L` | 0–100 | How far forward the channel sits. Default 100. |
| `pan P` | −100–100 | `pan L30`, `pan R40`, `pan 0`. |
| `glide G` | 0–100 | Portamento: how much each note slides from the last. |
| `vibrato B` | 0–100 | How much the pitch wobbles. |
| `strum S` | 0–4 steps | How far a chord rolls: `0` is a block, `1` rolls it inside a step, more spreads it across that many steps. |
| `robin R` | 0–100 | Round-robin: how much successive hits differ (a few cents, a little level and brightness), walking a fixed four-hit cycle. `60` is a snare that never repeats. `0` is off. |
| `touch T` | 0–100 | Velocity layers: how much a hit's tone follows how hard it was struck. A soft note is darker as well as quieter; full velocity is unchanged. `0` is off. |
| `drift D` | 0–100 | How far the channel's pitch wanders: the wow and flutter of a worn transport, on its own (no saturation). `0` is dead steady. Also an `automate` destination. |
| `verb S` / `echo S` | 0–100 | How much of THIS channel is fed to the song's room / echo. |
| `duck P` | 0–100 | How far this channel pushes the REST of the mix down while it plays. |
| `groove F` | closed list | A feel for this channel alone. |
| `humanize P` | 0–100 | How far this channel is "played" rather than typed. |
| `poly M` | 1–8 | How many notes this channel can hold at once. A cell holding more is REFUSED. |
| `shape S` | closed list | Which kind of filter `bright` opens. |
| `effect P` | 0–100 | Any of the ten channel effects, as `track 2 drive 45`. 0 is off. |
| `sample NAME` | ≤16 chars | The recording this channel plays, on a `wave sample` channel. |
| `bus NAME` | ≤12 chars | Join a group declared above. |
| `on` / `off` | — | Play, or mute. A mute is saved in the file. |

## 3b. The drum machine, in full

A song may carry ONE **drum machine**: an instrument of PADS and a step grid that
plays BESIDE the channels rather than inside one of them. `machine …` sets its mix
and clock; `pad N …` writes one lane. Writing EITHER line is what creates the
machine — a song that says nothing about it has none, and is unchanged.

```text
machine [on|off] [level L] [pan P] [swing S] [steps N] [beat N] [pads N] [bars N] [bus NAME]
        [verb S] [echo S] [duck P] [effect P]…
pad N [NAME…] [voice V] [wave W] [knob P] [level L] [pan P] [tune S] [sample NAME] [pattern "…"]
```

| Setting | Range | What it does |
| --- | --- | --- |
| `machine steps N` | 1–64 (16) | How many steps one bar of the machine holds. Write it ABOVE the `pad` lines — a pattern is checked against the machine's size at the line it is read. |
| `machine beat N` | 1–16 (4) | How many of those steps are one beat, so the tab can draw a ruler. |
| `machine pads N` | 1–8 | How many pads the machine HAS — what `+ ADD PAD` and `DEL PAD` change. Growing fills in kit pads; shrinking drops the last ones and takes their rows off every bar. |
| `machine bars N` | 1–16 | How many bars it has — what `+ BAR` and `- BAR` change. Growing COPIES the last bar (a variation, not a blank); shrinking drops from the end, and bar 1 never goes. |
| `machine level` / `pan` / `swing` / `verb` / `echo` / `duck` / `bus` | as a track | The machine's own place in the mix: its fader, its lilt, its sends, how far it pushes the rest down, the group it joins. |
| `machine on` / `off` | — | Play it, or silence it while keeping the pads. |
| `machine <effect> P` | 0–100 | Any of the ten effects, on the whole machine: `machine drive 30`. |
| `pad N` | 1–8 | Which pad to write. Pads 1–4 are the kit drums (`KICK`, `SNARE`, `HAT`, `WIND`); pads 5–8 seed `TOM`, `CLAP`, `CRASH`, `RIDE`. |
| `pad NAME…` | ≤16 chars | The pad's name (quote it, as a track's). |
| `pad voice V` / `wave W` / knob | closed lists | The pad's sound — the SAME voice, wave and nine knobs a channel has, so a pad is a generator by default. |
| `pad tune S` | −24–24 | Semitones from that pad's KIT pitch. `pad 5 tune -4` moves the tom down a major third. |
| `pad sample NAME` | one word | A recording of your own, exactly as on a `track` line: it plays when the pad's wave is `sample` (`pad 2 BRK wave sample sample BRK`). A name the app has not loaded is the FALLBACK — the pad plays its built-in one-shot — never an error. `sample none` clears it. |
| `pad pattern "…"` | ≤ `steps` chars | The row: `.` is a rest, `1`–`9` how hard the hit lands (9 is full). `"9...9...9...9..."` is four-on-the-floor. |

One `pad` line sets only what it mentions, so `pad 3 level 60` changes the hat's
fader and leaves its row alone. `pad 5` grows the machine to five pads and fills
1–4 with the kit, so a machine never has to declare its drums before playing them.

## 4. Every closed list

A word not on one of these lists is refused by name. Write these spellings.

**Waves** (19) — `square`, `triangle`, `sawtooth`, `sine`, `noise`, `table`,
`sample`, `fm`, `string`, `formant`, `organ`, `granular`, `font`, `reed`, `brass`,
`bow`, `mallet`, `membrane`, `plate`.

**Voices** (14), by the job they are for:

| Voice | What it is |
| --- | --- |
| `lead` | a square lead that cuts through and holds its note |
| `pluck` | a short bright string that dies away the moment it starts |
| `bell` | glassy and ringing, like a music box or a vibraphone |
| `glass` | a fragile, shimmering triangle with a breath of hiss |
| `bass` | round and low — a triangle keeps the bottom clean |
| `sub` | almost pure low end, for the floor under everything else |
| `pad` | slow, soft and wide: three notes that breathe together |
| `strings` | bowed and wide — a sawtooth that eases in rather than starting |
| `organ` | steady and churchy: it switches on and stays exactly there |
| `flute` | breathy: a sine with a little hiss and a soft start |
| `kick`, `snare`, `hat`, `wind` | the four drum presets, for a percussion channel |

**The nine knobs**, with the two words each end is called in the `F4` menu:

| Knob | 0 → 100 | Reach for it when |
| --- | --- | --- |
| `bright` | dark → bright | the channel is dull, or too piercing (the filter cutoff) |
| `sweep` | flat → wah | the tone should MOVE over the note |
| `duty` | thin → hollow | a square should buzz thinly, or a `table`/`sample` should pick a bank |
| `noise` | pure → noisy | a tone should be a drum, a breath or wind |
| `attack` | instant → slow | you want bowed or dreamy instead of plucked |
| `decay` | snappy → slow | the fall from the attack peak should take longer |
| `ring` | pluck → pad | the note should HOLD, or die away |
| `release` | tight → long | the tail after the note should ring on |
| `thick` | thin → wide | one channel should sound like several |

Each knob also answers to a longer spelling (`tone` = `bright`, `width` = `thick`,
`sustain` = `ring`); the manifest's `vocabulary.knobs` lists every alias.

**Filter shapes** (4) — `round` (the default low-pass), `sharp` (high-pass: the
bottom goes), `nasal` (band-pass: a vowel), `hollow` (notch: a scooped mid). The
technical spellings `lp`, `hp`, `bp` and `notch` are accepted.

**The ten channel effects** — `drive`, `crush`, `cab`, `tape`, `radio`, `vinyl`, `chorus`, `punch`, `tilt`, `gate`. `cab` is a speaker box (closed top, pushed middle) and belongs a step after `drive`, on anything that should sound like an amp rather than a fuzzbox; `tape` is a whole tape machine behind one number (soft saturation, a transport that wanders in pitch, a hiss bed) and is the sound of lo-fi, chillhop and vaporwave; `radio` narrows a part to a telephone band and coarsens what is left, for a phone voice, a sampled hook or an AM intro; `vinyl` lays a record under the part — a quiet surface hiss with the crackle of dust and scratches, added rather than run through, for anything that should sound like it came off a record.
Each is 0–100 and 0 is OFF, which is what every channel already is, so only write
the ones the ask is about. `master drive 20 tilt 12` is the same ten on the mix.

**Drums** (4) — `kick` (grid `KCK`, MIDI 36), `snare` (`SNR`, 38), `hat` (`HAT`,
42), `wind` (`WND`, 44).

**Kits** (6) — `studio` (the four presets and the default), `808`, `brush`, `rock`,
`metal` (a hard, cutting kit) and `dusty` (a dead, smeared one).
Any other word names a kit of the user's own, and a machine that does not have it
plays the four presets rather than refusing the song.

**The font's own kit.** A drum channel that also says `wave font` — e.g.
`track 1 "KICK" voice kick wave font duty 100` — plays the SOUNDFONT'S percussion
kit instead of the song kit. No `duty` can name a kit: it lives on bank 128, past
the 128 presets `duty` spreads over, so the hit names the drum and the font answers
it. `duty` is ignored on such a channel; a font with no kit falls back to the `duty`
preset, so the channel still sounds. `kick`/`snare`/`hat`/`wind` map to MIDI
36/38/42/44, which is what a General MIDI kit is keyed to.

**Consoles** (7) for `chip` — `nes`, `gb`, `pce`, `snes`, `gba`, `genesis`, `opl`.
The longer spellings work too (`famicom`, `gameboy`, `tg16`, `super-nes`,
`advance`, `megadrive`, `adlib`, `soundblaster`).

**Feels** — `straight` (default; `none` and `off` also mean this), `backbeat`,
`offbeat`, `shuffle`, `laid-back` (`lazy`, `late`), `pushed` (`eager`, `early`),
`human` (`loose`).

**Tunings** (5) — `equal` (the default and almost always the answer), `just`,
`pythagorean`, `meantone`, `septimal`.

**Scales** (5) — `major`, `minor`, `harmonic minor` (a SPACE, unlike the model's
own id), `dorian`, `pentatonic`.

**Automation targets** (12) for `automate` — the nine knobs, plus `level` (the
channel's own fader), `gate` (how much of each note is heard) and `drift` (how far
the pitch wanders). Each 0–100. The effects, `pan` and the sends are NOT lane
targets: they are built only when they are above zero, so a curve could not fade
them in from nothing — set those on the track line instead. `drift` is the one
value that behaves like an effect and is still a lane target, because it is a
plain channel value the synth reads per note rather than a node in the chain.

**Layer fields** (3) — `octave` (−4…4), `detune` (−100…100 cents), `gain` (0–100).

**Row transforms** — `octave up`, `octave down`, `repeat N`, `roll [N]` (retrigger
every hit in the range inside its step: `rows 12 to 15 roll`, four hits each
unless you say otherwise), and `reverse` (`rows 0 to 3 reverse`: read the range
backwards, the last step first — no number, because there is only one way).

**Articulation suffixes on a note** — `>` slides into the pitch, `*N` hits it N
times inside one step (2–8), `!` flams one grace hit into the beat and `!!` drags
two, `^N` scoops up onto the note from N semitones below and `vN` falls N
semitones away over its tail (1–12, two by default: `C-4^` is `C-4^2`), and they
may be combined with a velocity: `C-4>*3~80`. On a `note`/`drum` line the words
`flam` and `drag` mean the same as `!` and `!!`. A scoop cannot ride with a `>`
slide — a note arrives one way — and a `v` fall may ride with either.

**Progression words** — `hold N` (1–64, default 4), and the followers `chord ROW
TRACK follow` and `note ROW TRACK follow`. `progression none` clears the loop.

**Chord modes** — `off`, `triad`, `7th`. **Grids** — `4`, `8`, `16`, `32`, `64`,
`8t`, `16t`, `32t`. **Meter units** — `1`, `2`, `4`, `8`, `16`.

**Starters** (3) — `house`, `lofi`, `ballad`.

## 5. Every number that is a limit

| Thing | Range | Default |
| --- | --- | --- |
| `tracks` | 1–8 | 4 |
| `steps` | 1–512 | 16 |
| `beat` | 1–16 | 4 |
| `tempo` | 40–300 | 120 |
| `swing` | 0–100 | 0 |
| `speed` | 25–400 | 100 |
| `hold` | 1–16 | 1 |
| velocity (`~N`) | 0–100 | 100 |
| `level` | 0–100 | 100 |
| `pan` | −100–100 | 0 |
| any knob | 0–100 | the voice's own value |
| an effect, a send, `duck`, `humanize` | 0–100 | 0 (off, which is what every channel already is) |
| `poly` / notes in one cell | 1–8 / up to 8 | 1 |
| `arp` steps | 1–512 | — |
| stutter (`*N`) | 2–8 | — |
| flam (`!`) / drag (`!!`) | 1 / 2 grace hits | — |
| scoop (`^`) / fall (`v`) | ±1–12 semitones | 2 |
| `rows … octave` | 1–8 octaves | — |
| `rows … repeat` | 2+ (must fit the pattern) | — |
| `rows … reverse` | — (no number) | — |
| automation lanes | 32 | — |
| sections | 24, name ≤12 chars | — |
| `arrange … repeat` | 2–64 | — |
| buses | 4, name ≤12 chars | — |
| progression | 16 chords, `hold` 1–64 | hold 4 |
| samples | 8, name ≤16 chars, ≤30 s each | — |
| `export bars A to B` | 1–64 | the whole song |
| `reverb`, `echo` | 0–100 | 0 |
| `octave` | 0–7 | 4 |
| patterns | 64 | — |
| `order` length | 64 | — |
| tempo changes | 32 | — |
| title / channel name / saved sound name | 32 / 16 / 12 chars | — |
| layers per channel | 4 (the voice is layer 1) | 1 |
| notes | `C-0`–`B-8`, MIDI 12–119 | — |
| notes one `chord` statement writes | up to 4 | 3 (a triad) |

## 6. Grid rows: the cell grammar

A pattern is a grid: **one line per step, one token per channel**, with at most
`tracks` tokens on a line and `.` for an empty cell. Rows count from **0**, channels
count from 1 — that asymmetry is the mistake every new author makes once.

| Cell | Means |
| --- | --- |
| `C-4` | the note C in octave 4 (MIDI 60). `C#4` or `Db4` is the black key above it. |
| `.` | an empty cell: silence on that step. |
| `C-4~40` | the same note at velocity 40 (0–100, default 100). |
| `C-4>` | slide into the pitch. `C-4*3` is three hits inside one step. `C-4!` is a flam, `C-4!!` a drag. `C-4^2` scoops up onto the note, `C-4v2` falls away from it. |
| `kick` | a drum hit: one of `kick`, `snare`, `hat`, `wind`, and it takes the same `~` and `*`. |
| `C-4,E-4,G-4` | several notes in ONE cell, on a channel wide enough (`poly`) to sound them. |

## 7. The rules that cause nearly every refusal

1. **Line 1 is `new`** unless you deliberately meant to build on the current song.
2. **`tracks N` goes above `track N`, the 5th column, and `note … N …`.** So does
   `section NAME` above `arrange`, and `progression` above its followers.
3. **A grid row must have at most `tracks` tokens.** This is the single most common
   refusal: `this grid row has 5 notes but the song has 4 tracks.`
4. **Exactly `steps` rows makes a full pattern.** Fewer is legal and the rest are
   silent; more is `this pattern already has 16 steps, so there is no row 16.`
5. **One note per channel per step**, unless the channel is `poly` wide enough.
6. **A chord in one cell needs `poly`** at least as wide as the cell. Without it the
   refusal names the count.
7. **Never invent a word.** A voice, wave, knob, shape, kit, console or feel that is
   not on its list is refused *with the list*, so the first mistake teaches you
   every legal value.
8. **Every value is a percentage 0–100**, never a fraction: `volume 70`, not `0.7`.
9. **A bare word is a setting, not a name.** Quote a name that collides: `track 1
   "OFF" voice bass`. A bare `voice`, knob word, `level`, `on` or `off` among name
   words is an error.
10. **`swing` is the song's; `groove` and `humanize` are a channel's.** `track 2
    swing 60` RENAMES the channel to `SWING 60`.
11. **`level 0` is silent, not muted** — the channel is still in the song. Use
    `mute N` when you mean "this channel does not play".
12. **A note outside `C-0`–`B-8` is clamped, not refused.** Write in range anyway: a
    bass belongs in octaves 1–3, a lead in 4–6, hats up at 6.

## 8. Recipes: the ask, and the lines

| Ask | Reach for |
| --- | --- |
| "a house track", "some lofi", "a ballad" | `start house` / `start lofi` / `start ballad` — one line, then EDIT something in it. |
| "8-bit", "NES", "Game Boy", "Mega Drive" | `tracks N` then `chip nes` / `chip gb` / `chip genesis`. |
| "a beat", "four on the floor" | one drum channel with drum words: `kick . snare . hat .` |
| "a beat on a drum machine", "a house beat", "a pumping kick" | `machine steps 16 beat 4 duck 30` then `pad 1 KICK pattern "9...9...9...9..."`, `pad 2 SNARE pattern "....9.......9..."`. |
| "a trap hat", "a fast hi-hat" | `pad 3 HAT pattern "9.9.9.9.9.9.9.9."` on a 16-step machine — or `machine steps 32` for a run of sixteenths over two beats. |
| "a chord progression", "Am F C G" | `progression Am F C G hold 8` then `chord 0 1 follow` on a `poly 4` channel. |
| "an arpeggio", "a strum" | `chord 0 1 Am arp up 8`, with `hold 1` for the arp and `hold 4` for the strum. |
| "dial an arpeggio", "hear it before writing it", "an arp I can tune" | store the dials — `arp direction updown`, `arp octaves 3 rate 2 gate 60` — and `arp write 0 1 Am` to commit the run; `arp hear on` auditions it as the dials move, and `page arp` opens the screen. |
| "it needs a chorus", "make it a song" | `section VERSE 1 1 2 1` / `section CHORUS 3 3 4 4` / `arrange VERSE CHORUS VERSE`. |
| "a build-up", "a fade", "open the filter" | `automate 3 bright 10 95 bars 1 to 8` — and write the `order` first, because the bars are order slots. |
| "draw a build", "see the automation", "show the timeline", "leave the arranger open" | write the `order`/`arrange` first, then one `automate …` per lane, and end the script with `page arranger` so the timeline is the screen it applies to. |
| "the bass and kick fight" | `track 1 "KICK" duck 70`. It is the OTHER channels that step back. |
| "a bigger lead", "a supersaw", "a choir" | `layer 1 2 detune -11 gain 55` — a new layer starts as a copy of the one below. |
| "one fader for the drums" | `bus DRUMS 70` above the channels, then `track 4 bus DRUMS`. |
| "a cathedral", "it needs space" | `reverb 40` and `echo 20` on their own lines; `track 2 verb 0` keeps one part dry. |
| "make it hit", "lo-fi", "like a tape" | `master drive 20 tilt 12` — keep it under about 25 unless the brief IS lo-fi. |
| "the same lick an octave up" | `rows 0 to 3 octave up`, or `rows 0 to 3 repeat 4` to spread it. |
| "record a hook and render a chorus", "bounce a section" | `record HOOK` captures a take, `record trim HOOK 0.1 2.0` / `record loop HOOK 1.0 3.0` shape it, name it on a `wave sample` channel, and set the bounce with `export bars 8 to 15 loud -14`; end with `page recorder`. |

Rhythmic vocabulary that is already arithmetic: `C-4*3` is a stutter roll, `hold 4`
turns it into a flam or a strum, and a soft note on the step before a hit is a
natural flam. A roll is not a word.

The **ARRANGER** is the screen those lanes are DRAWN on: the form as section bands,
a row per channel with a pattern block and a note preview (a dash per note, placed
by step and pitch) each bar — `REST` where the channel is silent — and the selected
lane as a line on a value axis over the same bar grid, with a handle at each end
that holds `to` out to the last bar. It edits the very lanes `automate` writes, so
`page arranger` at the end of a script is how you leave the timeline showing for
whoever reads it.

## 9. Musical defaults that reliably work

- **Tempo** — 70–90 ballad, 100–120 pop, 125–135 house, 140+ fast.
- **Key** — write `key A minor` or `key A pentatonic`; the app lights the piano with
  it and never blocks a note for leaving it. A melody that deliberately leaves the
  key is usually a better song than one that never does.
- **`steps`** — leave it at 16 unless the phrase needs more. 32 is two bars, 64 four.
- **Channels and levels** — lead 100, bass 60–70, chords/pad 40–55, kick and snare
  70–85, hats 25–40. A song where every channel is at 100 is four people shouting.
- **At least one silent step in every channel.** The commonest failure of generated
  music is filling every step of every channel.
- **`swing 45`–`60`** on anything with repeated short notes is the cheapest way to
  make a beat sound played rather than typed. Leave it at 0 for pads and held chords.
- **One phrase, then develop it.** Write one bar, then `copy 1 2` and change one
  thing, rather than writing sixteen bars of unrelated material.

## 10. Verify before you hand it over

- [ ] Line 1 is `new`; `song`, `key`, `tempo`, `steps`, `tracks` are above the rows.
- [ ] Every pattern has at most `steps` rows, and every row has at most `tracks` tokens.
- [ ] Every `track N` has `1 ≤ N ≤ tracks`, and every name is ≤16 characters.
- [ ] Every word is on a closed list, spelled as the list spells it.
- [ ] Every number is inside its range, and every percentage is 0–100.
- [ ] At least one channel is at `level 100`; the others are placed by job.
- [ ] There is a silent step in each channel, and no `solo` line.
- [ ] `order` exists if there is more than one pattern.
- [ ] Nothing was written "just in case": no `reverb 0`, no `master drive 0`, no
      knob at its default. An absent line and a line at the default mean the same
      thing, and the absent one is shorter.

## 11. When the app refuses

Every mistake names a LINE NUMBER and comes back all at once. The messages are
written to be actionable, and they usually contain the fix — a closed list, the
count it expected, or the word it saw. Paste them back verbatim if you are working
with a person: `doc/05-error-catalogue.md` is the full catalogue of every message
the parser can print, and no message exists that is not in it.

Two habits worth keeping: parse before apply (a person can check your script
without losing their work), and fix one thing at a time — a script is replaced
whole, so a second edit cannot build on a first.

## 12. Files, and what a song is not

- A **script** is `.txt` and is what you write. `F2 → SAVE AS SCRIPT` prints the
  current song back out in exactly this notation, which is the fastest way to learn
  a feature: `start house`, then read what it wrote.
- A **song file** is `.json` and is versioned (12 for a plain song, up to 41 for
  the newest features). You do not need to write one — you write scripts — but
  `capabilities.fileVersions` says which versions the build reads.
- A song carries **no audio and no instrument**: `wave font`, `sample BRK02` and
  `instrument use 1` name app state that lives outside the file. A song written
  against a soundfont or a recording someone else does not have still plays — it
  falls back to the built-in sounds — so never assume one is loaded, and say in a
  comment which performance you meant.
- A **take** is app state too: `record HOOK` captures one and `record trim`/`record
  loop`/`record select` shape it, but no file carries the audio and none of them
  writes the take into the song — the channel's `sample NAME` is the only part that
  reaches a file. A capture needs a microphone and is refused in words without one.
- Session settings (`volume` excepted) are not saved: `theme`, `page`, `live`,
  `solo`, `chords`, `hear`, `export`, `instrument` and `record` set up the app and
  leave the song alone.

## 13. Where the depth is

| Page | Read it for |
| --- | --- |
| [`doc/03-script-reference.md`](doc/03-script-reference.md) | The exhaustive grammar: every statement, every value, every alias. |
| [`doc/07-agent-guide.md`](doc/07-agent-guide.md) | The same procedure at length: worked reasoning, failure modes, self-verification, musical defaults. |
| [`doc/08-agent-prompt.md`](doc/08-agent-prompt.md) | The handoff: what to give an agent, and what a person should ask for. |
| [`doc/05-error-catalogue.md`](doc/05-error-catalogue.md) | Every message the parser can print, and what to do about it. |
| [`doc/04-cookbook.md`](doc/04-cookbook.md) | Worked recipes for common requests. |
| [`doc/02-music-primer.md`](doc/02-music-primer.md) | Scales, chords and octave choices, for the musical side. |
| [`doc/09-song-files.md`](doc/09-song-files.md) | What a song file holds, and what it deliberately does not. |
| [`doc/10-instruments.md`](doc/10-instruments.md) | Sampled instruments, soundfonts and the instrument list. |
| `window.__tracklet.capabilities` | The build in front of you: words, limits, closed lists, examples. |

## A worked song, end to end

```script
new
song "FIRST LOOP"
key A minor
tempo 112
steps 16
tracks 4

track 1 "LEAD" voice lead level 100
track 2 "BASS" voice bass level 65
track 3 "PAD"  voice pad  level 45 hold 4
track 4 "HAT"  voice hat  level 30

pattern 1 "A"
A-4 .   A-2 C-6
.   .   .   .
C-5 A-1 E-2 C-6
.   .   .   .
E-5 .   A-2 C-6
.   .   .   .
D-5 E-1 F-2 C-6
.   .   .   .
```

And the same idea with a drum kit in one channel, which is what you want the
moment the ask is a beat rather than a melody:

```script
new
song "POCKET"
key A minor
tempo 96
tracks 3

track 1 "DRUMS" voice hat  level 35
track 2 "BASS"  voice bass level 62
track 3 "KEYS"  voice pad  level 45 hold 4 poly 3

pattern 1 "A"
kick  .   A-2,E-3
hat   .   .
snare .   .
hat   C-3 .
```

And the same beat with a **drum machine** — pads and a step grid that play beside
the channels, one fader for the whole beat:

```script
new
song "MACHINE POCKET"
key A minor
tempo 124
tracks 2

track 1 "BASS" voice bass  level 68
track 2 "KEYS" voice pad   level 45 hold 4 poly 3

machine steps 16 beat 4 duck 30
pad 1 "KICK"  voice kick  pattern "9...9...9...9..."
pad 2 "SNARE" voice snare pattern "....9.......9..."
pad 3 "HAT"   voice hat level 55 pattern "9.9.9.9.9.9.9.9."

pattern 1 "A"
A-2 .
.   A-3,C-4
A-2 .
.   E-3,G-3
```

`start house` is the third way in: one line, a whole working skeleton, and every
line of it can be overridden by whatever you write below.
