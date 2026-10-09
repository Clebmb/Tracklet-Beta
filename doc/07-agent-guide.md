# 07 — Guide for an AI agent

You are writing music for Tracklet by emitting **Tracklet Script** text. This file
is the working procedure: what to decide first, how to lay the text out, what the
API returns, and the mistakes that are worth checking for before you hand the
script over.

Read [`03-script-reference.md`](03-script-reference.md) for the grammar. Read
[`02-music-primer.md`](02-music-primer.md) for the musical vocabulary. This file
assumes both.

If you want the **whole language on one page** — every command word, every closed
list, every limit — [`../SKILL.md`](../SKILL.md) is that page, and this one is the
reasoning behind it. Read the skill page when you have a song to write; read this
one when something refused and you want to understand why.

If you are being handed a *brief* by a person rather than working on your own,
[`08-agent-prompt.md`](08-agent-prompt.md) is the other side of this: it is what
they were told to send you.

---

## 0. Ask the build what it speaks

Before writing a line, ask the app in front of you. Do not trust a reference you
memorized and do not guess a version:

```text
window.__tracklet.capabilities
```

In a development build that object is the whole language as data:

| Field | What it answers |
| --- | --- |
| `scriptVersion` | Which words this build speaks. `2` is the version that adds the `layer` statement and stacked sounds, `6` adds `automate`, `7` adds `section`/`arrange`, `8` adds `grid`/`meter`, `9` adds `shape` on a track line and `bus`, `10` adds an articulation SUFFIX on a note (`C-4>`, `C-4*3`), `11` adds the two generators as chord/arrange modifiers (`chord 0 1 Am arp up 8`, `arrange VERSE CHORUS repeat 4`), `12` adds `rows` — a RANGE of steps, moved or repeated (`rows 0 to 3 octave up`, `rows 0 to 3 repeat 4`) — `13` adds the CHORD IN ONE CELL (`C-4,E-4,G-4`, which needs a channel wide enough to sound it), `14` adds the **DRUM** (`drum 0 1 kick`, or a drum word in a grid cell: `kick . hat .`), and `15` adds the **KIT** (`kit 808` — which four patches those drums play), `16` adds the **SAMPLE** (`sample load "samples/break.wav"` brings a `.wav` of your own into the app, and `sample BRK02` on a track line names it for a `wave sample` channel, falling back to the built-in one-shot when the app has no file under that name), `17` adds the **PROGRESSION** — the chord LOOP the song hangs on (`progression Am F C G`, or `progression 1 6 3 7` in the song's key) and its two followers, `chord 0 1 follow` (the loop's chords on a keyboard channel) and `note 0 4 follow` (its roots on a bass channel) — and `18` adds the **GENRE STARTER** (`start house`, `start lofi`, `start ballad`: a whole worked skeleton, expanded into the starter's own lines and applied like any script), `19` adds the **EXPORT REGION** (`export bars 8 to 15`: the bars the exports render), `20` adds the **LOUDNESS TARGET** (`export loud -14`: how loud they arrive, in LUFS), `21` widens the **KIT** — any word that is not one of the four built-ins names a kit of the user's own (`kit MYHOUSE`, saved as a `.kit.json`) — `22` widens three closed lists a statement already drew from: the **SCALES** (`key D mixolydian`, `key E phrygian`, `key A blues`), the **CHORD SHAPES** (`A5`, `Dsus4`, `G6`, `Cadd9`) and the **FEELS** (`groove boom-bap`, `groove swing-16`, `groove d-beat`), `23`, `24`, `25` and `26` add the seventh, eighth, ninth and tenth **EFFECTS** (`cab`, `tape`, `radio`, `vinyl` — each on a `track` line or on `master`) — `27` adds a fourteenth **WAVE**, `reed` (a reed instrument: a buzzing exciter blown through a resonant tube, whose character `duty` picks from the bank `clarinet`, `oboe`, `bassoon`, `sax`, `harmonica`, `bagpipe`) and `28` adds a fifteenth, `brass` (a lip buzzing into a flared metal bore, whose character `duty` picks from `trumpet`, `trombone`, `horn`, `tuba`, `flugel`, `muted`) and `29` adds a sixteenth, `bow` (a bow dragging a string into a hollow body, whose character `duty` picks from `violin`, `viola`, `cello`, `bass`, `erhu`, `strings`) `30` adds a seventeenth, `mallet` (a struck bar whose overtones are inharmonic, whose character `duty` picks from `marimba`, `xylophone`, `vibraphone`, `glockenspiel`, `music box`, `kalimba`) and `31` adds an eighteenth, `membrane` (a struck skin whose dense overtones thud and whose pitch droops, whose character `duty` picks from `tom`, `timpani`, `conga`, `tabla`, `djembe`, `frame`) and `32` adds a nineteenth, `plate` (a struck plate whose few spread partials ring longest of all, whose character `duty` picks from `bell`, `chime`, `gong`, `tam-tam`, `anvil`, `crash`) and `33` adds a track-line setting, `strum` (how far a channel's chord is rolled: `strum 1` rolls a chord inside one step, `strum 0` is the block every earlier song played) and `34` adds two note suffixes, `flam` and `drag` (`kick!` leans one grace hit into the beat, `kick!!` adds two, or `drum 0 4 kick flam`) and `35` adds a fourth `rows` transformation, `roll` (`rows 12 to 15 roll` retriggers every hit in those steps inside its own step, four hits each unless you say otherwise) and `36` adds two more note suffixes, a SCOOP (`C-4^2` starts the note a whole tone BELOW its pitch and rises onto it — an emo bend, a horn leaning into a note) and a FALL (`C-4v2` holds the pitch and drops a whole tone away over its tail — a whammy dive, a tape stopping), 1–12 semitones and two by default, and `37` adds two track-line settings that make a part sound PLAYED rather than typed, `robin` (`track 2 "SNARE" robin 60` — the nth hit of that channel is not the hit before it) and `touch` (`track 3 "BASS" touch 70` — a soft note is darker as well as quieter) and `38` adds a track-line setting, `drift` (`track 3 "PAD" drift 40` — the channel's pitch wanders like a worn transport: a slow wow at two rates that share no period, plus a fast flutter under them, about eighteen cents at 100), which is also an `automate` DESTINATION (`automate 3 drift 10 90 bars 8 to 15` — the same wobble moved over bars, the difference between a static wobble and a tape that tires) and `39` adds a song statement, `speed` (`speed 80` plays the whole record back at 80 percent — the tape-speed gesture, ONE number that moves pitch and time together, so the beat stretches and the pitch drops by the same ratio; 100 is normal, 50 is half speed and an octave down, 200 is double and an octave up, and the range is 25..400) and `40` adds a fifth `rows` transformation, `reverse` (`rows 0 to 3 reverse` reads those steps BACKWARDS — the last step first, every note and gesture kept, only the order changed: a shoegaze swell the other way, or a figure that answers itself); a build that says `1` will refuse a `layer` line, one that says `12` will refuse a comma in a cell, one that says `13` will refuse a `drum` line, one that says `14` will refuse a `kit` line, one that says `15` will refuse a `sample` line, one that says `16` will refuse a `progression` line, one that says `17` will refuse a `start` line, one that says `18` will refuse an `export` line, one that says `20` will refuse a `kit` name that is not one of the four built-ins, and one that says `21` will refuse a scale, a chord shape or a feel it was never taught, one that says `22` will refuse `cab` — the seventh effect, added at `23`, which is a speaker box (a closed top with a pushed middle) that belongs AFTER `drive` on anything that should sound like an amp rather than a fuzzbox — one that says `23` will refuse `tape` (added at `24`), a whole tape machine behind one number: a soft saturation, a transport that wanders in pitch and a hiss bed, which is the sound of lo-fi, chillhop and vaporwave, and one that says `24` will refuse `radio` (added at `25`) — a telephone line behind one number, the band narrowing to a voice with a coarse signal inside it, which is a phone voice, an AM intro or a sampled hook — one that says `25` will refuse `vinyl` (added at `26`) — a record under the part, a quiet surface hiss with the crackle of dust and scratches on top, which is the sound of a part heard off a record rather than merely processed — and one that says `26` will refuse `reed` (added at `27`) — a reed instrument, a buzzing exciter blown through a resonant tube whose character `duty` picks, which is the sound of a clarinet, an oboe or a folk pipe — and one that says `27` will refuse `brass` (added at `28`) — a lip buzzing into a flared metal bore, whose character `duty` picks, which is the sound of a horn section, a ska stab or a fanfare — and one that says `28` will refuse `bow` (added at `29`) — a bow dragging a string into a hollow body, whose character `duty` picks, which is the sound of a played string line that swells and holds — and one that says `29` will refuse `mallet` (added at `30`) — a struck bar whose overtones are INHARMONIC, so it is a one-shot rather than a spectrum, which is the sound of a marimba, a bell-like key or a music box — and one that says `30` will refuse `membrane` (added at `31`) — a struck skin whose dense overtones thud and whose pitch droops as it relaxes, so it too is a one-shot, which is the sound of a drum, a kettledrum roll or a hand-drum groove — and one that says `31` will refuse `plate` (added at `32`) — a struck plate whose few overtones are spread far apart and ring for seconds, the longest of the struck family, which is the sound of a bell toll, a gong strike or a cymbal — and one that says `32` will refuse `strum` (added at `33`) — how far a channel rolls a chord, from a block at `0` to a rolled chord across a step or more, which is a rock rhythm strum, an emo tap or a folk roll — and one that says `33` will refuse a `flam` or `drag` suffix (added at `34`) — a grace hit leaning into the beat, which is most of what a rock snare and a brush snare are — and one that says `34` will refuse a `rows … roll` (added at `35`) — every hit in a range retriggered inside its own step, which is a drum roll, a snare fill or a trap hat written once for a run of steps instead of a `*4` on every single cell — and one that says `35` will refuse a `^` scoop or a `v` fall (added at `36`) — a note bending its OWN pitch by a semitone count, which is the one pitch gesture a single note can make on its own: an emo bend arriving from below, or a whammy dive leaving downward — and one that says `36` will refuse `robin` or `touch` (added at `37`) — the two settings that stop a part sounding typed: successive hits that differ from each other, and a tone that follows how hard a note was struck — and one that says `37` will refuse `drift` (added at `38`) — the channel's pitch wandering like a worn transport, which is a plain VALUE rather than an effect node and therefore the first effect-like thing an `automate` lane can move — and one that says `38` will refuse `speed` (added at `39`) — the whole record played back faster or slower, which moves pitch and time TOGETHER, a gesture none of the other words can make — and one that says `39` will refuse a `rows … reverse` (added at `40`) and one that says `47` will refuse a `kit` clause on a `scene` line (added at `48`) — the drum-machine bar a scene performs — a range of steps read the other way, the one range transformation with no number, and `41` adds the **DRUM MACHINE** (`machine level 85 swing 50` sets up a song-level instrument of pads and a step grid that plays beside the channels, and `pad 1 KICK voice kick pattern "9...9...9...9..."` writes one lane of it — the pattern string is `.` for a rest and `1`–`9` for how hard the hit lands) and `42` adds **MACHINE BARS** (`machine pattern 2` picks which bar of the machine the `pad` lines BELOW it write into, and `machine order 1 1 2 1` says which bar plays in each bar of the song — a beat that changes across the form while staying one instrument) and `43` adds **SAMPLE PADS** (`pad 2 "BRK" wave sample sample BRK` — a pad names a recording of your own the way a channel does, and a name the app has not loaded is the fallback rather than an error, so the pad plays the built-in one-shot its `voice` selects) and `44` adds **PER-SECTION MACHINE BARS** (`section CHORUS 3 4 machine 2` names which bar of the drum machine that section plays, so a verse and a chorus can share one instrument and still have different beats — where no section names one, the machine's own `order` decides) and `45` adds **MACHINE COUNTS** (a `machine` line's own `pads N` and `bars N` say how many pads and how many bars the machine HAS — what the drum machine page changes with `ADD PAD` / `DEL PAD` and `+ BAR` / `- BAR`; growing bars copies the last one, and bar 1 the machine never goes) and `46` adds the **PAGE** statement (`page arranger` switches which full screen the app shows — `tracker`, `machine`, `mixer` or `arranger` — so ONE script can drive every tab it just wrote into; a session setting like `theme`, so no file carries a page and opening someone's song cannot move your screen, and the name is checked against the pages this build has) and `47` adds the **LIVE** page's own two words — the **SCENE** (`scene A 1 1 - 2` defines one row of the launch grid: the pattern each channel plays, with `-` for a channel that is silent; a scene is SONG data, so it is stored and round-trips at file version `41`) and **LIVE QUANTIZE** (`live quantize 4` says how many bars a launch waits for before a queued scene takes over — `0` is immediate — which is a SESSION setting like `page`, so no file carries it) and `48` adds the **MACHINE COLUMN** — an optional `kit N` clause on a `scene` line (`scene A 1 1 2 2 kit 2`) names the bar of the drum machine that scene performs, or `kit off` for a scene that sits the machine out, so one grid carries both the channels and the machine. It rides the same file version `41`, because the machine column extends the `scenes` key rather than adding a rung, and `49` adds the **RECORDER** TAKE words — `record HOOK` captures a take from the microphone, `record trim HOOK 0.1 2.0` and `record loop HOOK 1.0 3.0` shape its window (seconds from the take's own start), and `record select HOOK` picks the take the page shows, all APP state beside the sample bank, so no file carries one and a capture is refused in words where there is no microphone, and `50` adds the **ARP page** — `arp direction updown`, `arp octaves 2 rate 2 gate 60` and `arp mode source` store the dials a run is dialed with, `arp write ROW TRACK CHORD` commits the run they describe (the same cells `chord ROW TRACK CHORD arp …` writes, taken from the song rather than the line, because both call one generator), and `arp off` clears them; the dials are SONG data, so a song that stores any writes an `arp` key at file version `42`, and a song that names none is byte for byte the song it was; and `51` adds the ARP page's SESSION switch, `arp hear on` (or `off`) — whether the page auditions the run as its dials move, a setting like `page`, so it travels out in `settings` and no file carries it, which is what lets a script dial an arp, turn hearing on and leave the page LISTENING rather than written and silent. |
| `keywords` | Every command word, in the parser's order — the same list the unknown-command error prints. |
| `commands` | One row per word: its `tier`, what it is for in one line, and an `example` that parses. |
| `tiers` | `core` (what you need to write a song) and `deep` (sound design and the session settings). Write a core song first. |
| `limits` | Every range the language clamps to: tempo, channels, steps, layers, velocity, and the rest. |
| `vocabulary` | The closed lists a word may come from: waves, voices, the nine knobs, layer fields, tunings, feels, the drum KITS (`studio`, `808`, `brush`, `rock`, `metal`, `dusty`) and the four DRUMS (`kick`, `snare`, `hat`, `wind`), consoles, scales, chord modes, filter shapes, the two articulation characters, the transformations a `rows` range takes, grids and meter note values, and the words a `progression` and its two followers take (`none`, `hold`, `follow`, and the chord spellings), and the starters `start` accepts (`house`, `lofi`, `ballad`, `rock`, `emo`, `vaporwave`, `synthwave`, `shoegaze`, `dnb`, each with its blurb). |
| `fileVersions` | What a plain song is written as (12), what a song with a stack is (13), and `max` — the newest version this build can read (42: a song storing the ARP page's DIALS — the five settings a run is dialed with, written as `arp direction updown`, `arp octaves 2 rate 2 gate 60` and `arp mode chord`; 41 is a song with SCENES — the Live page's launch rows, `scene A 1 1 - 2`, where a dash is a channel that plays nothing; 40 is a song one of whose SECTIONS names a DRUM MACHINE BAR — `section CHORUS 3 4 machine 2`, so the beat follows the form; 39 is a song whose drum machine has a PAD naming a RECORDING — `sample BRK` on a `pad` line, the same reference a channel carries; 38 is a song whose drum machine has MORE THAN ONE BAR — `machine pattern N` and `machine order 1 1 2 1`, so a beat can change across the form; `37` is a song with a one-bar drum machine — the instrument played beside the channels, with pads and a step grid; `36` is a song played at a master `speed` other than normal — the statement added with language version 39; `35` is a song whose channels WANDER, which is `drift` — the setting added with language version 38; `34` is a song whose CHANNELS vary their hits, which is `robin` or `touch` — the two settings added with language version 37; a song using `vinyl`, the record effect added with language version 26, is `33`, one with only `radio` is `32`, one with only `tape` is `31` and one with only `cab` is `30`). |

`window.__tracklet.catalog` is the other half of the same idea, one level down:
what every wave, voice, knob and console *is*, with the one-line blurb that says
which one to reach for.

None of this is written twice by hand. The manifest is built from the same tables
the parser and the engine read, and a test fails if a command word appears in one
and not the other — so if the build says a word exists, it exists, and if it lists
a limit, that is the limit you will be held to.

---

## 1. What "correct" means

A Tracklet script is correct when it is a **complete description of a song** that
parses. Three properties hold, and they are guarantees rather than conventions:

| Property | Consequence for you |
| --- | --- |
| **Parse before apply** | You can validate a script without touching anyone's song. Do this. |
| **Atomic** | One mistake means zero effect, and you get every mistake at once with line numbers. There is no partially written song to clean up. |
| **Replaces the whole song** | A script is not a patch. To change an existing song you must describe the whole thing again. Start with `new`. |

A script with **no mistakes at all** is the only script that has an effect. So the
loop is always: emit → parse → fix → parse → (hand over).

---

## 2. Decide these seven things before writing a line

Answer all seven, then write the text. Agents that start emitting grid rows first
produce loops with no key, no register plan and no rest.

1. **Tempo** — a number. 70–90 ballad, 100–120 pop, 125–135 house, 140+ fast.
2. **Key and scale** — e.g. `A natural minor` (= `A B C D E F G`), or
   `A minor pentatonic` (= `A C D E G`, the safest choice). **Write it down**:
   `key A minor` is a statement in the language, and it is what lights up the
   piano for the person who opens your song. The eight scales are `major`,
   `minor`, `harmonic minor`, `dorian`, `mixolydian`, `phrygian`, `blues` and
   `pentatonic`. Reach for `mixolydian` when the ask is rock, funk or a blues
   feel, `phrygian` when it is metal or flamenco, and `blues` on a solo — those
   three are the reason a rock riff used to look out of key.
3. **Grid length** — `steps`, and therefore how many grid rows each pattern has.
   **Leave it out unless you need more than one bar**: the default, 16, is one
   bar of 4/4. Use 32 for a two-bar phrase, 64 for a four-bar one, up to 512.
   Keep `beat` at 4 unless you have a reason.
4. **Form** — how many patterns: 1 (a loop), 2 (A/B), 3–4 (A/B/C, A/A'/B).
   Patterns are independent loops of the same length; a longer grid is how a
   section gets more than a bar without adding a pattern.
5. **Channel plan** — which channel does what, **in which octave**, with which
   VOICE and at which LEVEL: bass 1–3 (`voice bass` or `sub`, `level 60`–`70`),
   harmony/arpeggio 3–5 (`pad`, `strings`, `organ`, `level 40`–`55`), lead 5–6
   (`lead`, `pluck`, `bell`, `level 100`), percussion 6 (`kick`, `snare`, `hat`,
   `level 25`–`40`). Choosing the voice by the channel's JOB is what makes a
   generated song sound arranged rather than typed; choosing the LEVEL is what
   makes it sound MIXED. See [section 3](#3-the-template) for both tables.
6. **The one phrase** — the chords per beat (4 beats × 1 chord each, or one held
   chord), repeated or developed over however many bars the grid holds, and
   where the rests are. A `chord ROW TRACK 5` line writes a whole in-key chord —
   the fifth of the song's key — across the channels after `TRACK`, one note
   each; use it when you want harmony that cannot leave the key. Add `arp` when
   the harmony should MOVE instead of hold: `chord 0 1 5 arp up 8` writes the
   same chord's notes one per step on channel 1 alone, which is one line for a
   whole bar of arpeggio or strum (see [section 3](#3-the-template)).
7. **The one moving line** — exactly one part changes from section to section;
   everything else holds still.
8. **Where the silence is** — at least one silent step in every channel.
9. **Feel** — `swing 0`–`100`, straight by default. `swing 45`–`60` on anything
   with a repeated short note (hats, a bassline, a plucked lead) is the single
   cheapest way to make a generated beat sound played rather than typed. Leave it
   at 0 for a pad, a held chord, or anything meant to sound machine-precise.
   `swing` belongs to the SONG, but a part can have its own feel: `track 4 "HAT"
   groove shuffle` leans one channel over a straight song, and `humanize 20`–`40`
   on that same line makes that one part sound played rather than typed. Reach for
   a per-channel `groove`/`humanize` instead of a song-wide `swing` when only one
   part should move — and never for the whole song at once, which is what `swing`
   is for.
10. **Session settings** (optional, and NOT part of the song) — `volume 70` sets
   the master level, `octave 5` where the piano sits, `hear on` auditions notes as
   the cursor moves, `chords triad` makes each keywrite a chord, `solo 2` hears
   one channel alone, and `theme forge` picks the app's look. Use them to set the
   app up for the person who will work on the song next — never `solo` in a song
   you hand over, and leave `theme` out unless you have a reason, since the look
   is the reader's preference and not yours to choose. See
   [section 3.1](#31-the-six-settings-that-are-not-the-song).

Then write, in this order: `new`, `song`, `key`, `tuning`, `tempo`, `steps`,
`beat`, `swing`, `order`, `volume`, `tracks`, the `track` lines, then the
patterns, and any session settings (`hear`, `chords`, `solo`, `theme`) at the very
end. Leave `tuning` out unless the song is music that wants a specific
early-music or blues intonation — equal temperament is the default and the right
answer for almost everything.

Write the `order` line whenever the song has more than one pattern, because
without one it will only ever play pattern 1 — the app loops the first pattern of
a song that says nothing about the order. `order 1 2 1` is three bars; the order
loops, so a four-bar phrase written as two patterns is `order 1 2 1 2`.

The key is a GUIDE, not a constraint: it never blocks or corrects a note, so a
melody that leaves it deliberately — a seventh on the last chord, a leading tone
before the tonic — is welcome. Do not avoid the interesting note to keep the
count clean; a song with nine notes out of key is usually a better song than one
with none.

---

## 3. The template

Fill this in. It is the shape that works, and it is the shape the `SCRIPT`
panel's LOAD EXAMPLE produces.

```text
new
song "<TITLE>"
key <e.g. A minor>
tuning <equal|just|pythagorean|meantone|septimal, omit for equal>
tempo <40-300>
steps <1-512, omit for 16>
beat <1-16, omit for 4>
swing <0-100, omit for straight>
volume <0-100, omit to leave the mix alone>
reverb <0-100, omit for a dry room>
echo <0-100, omit for no repeats>
tracks <1-8>

track 1 "<NAME>" voice <lead|pluck|bell|glass>            level 100
track 2 "<NAME>" voice <bass|sub>                          level 65
track 3 "<NAME>" voice <pad|strings|organ|flute> [hold 4] level 45
track 4 "<NAME>" voice <kick|snare|hat|wind>               level 30

<optional, only when one channel must sound bigger than one sound:
layer <track> 2 [wave <shape>] [octave -4..4] [detune -100..100] [gain 0..100]>

<optional, only when a kick and a bass fight for the same low end:
track 1 "KICK" voice kick duck 70>

<optional, only when several channels should move together:
bus DRUMS 70                                  BEFORE the channels that join it
track 4 "HAT" voice hat level 30 bus DRUMS>

pattern 1 "<NAME>"
<`steps` grid rows, one step each, at most `tracks` columns>

<optional session settings: hear on, chords triad, solo 2>
```

### Choosing each channel's sound

A `track` line can name a whole **voice** (`voice pad`) — a waveform plus the nine
knobs, in one word — and the voice is chosen by what the channel is FOR:

| Channel's job | Voice | Why |
| --- | --- | --- |
| Lead / melody | `lead`, `pluck`, `bell`, `glass` | cuts through, or rings |
| Bass / low root | `bass`, `sub` | round and low, keeps the bottom clean |
| Chords / pad | `pad`, `strings`, `organ`, `flute` | slow and wide, or steady |
| Kick / snare / hat | `kick`, `snare`, `hat` | a drum is a `noise` knob on a short note |
| A riser or texture | `wind` | pure hiss |

Do **not** reach for `wave font` in a song unless you were asked to. It plays a
soundfont LOADED INTO THE APP rather than a sound this app makes, so the same
song sounds different — or falls back to the built-in one-shots — on somebody
else's machine. A voice is a promise; a font is whichever file the player happens
to have open.

### When the whole song is one console: `chip CONSOLE`

One word dresses EVERY channel with the sound a games console is remembered for,
which is the difference between writing a chiptune and writing sixteen knob values
by hand. It is the shortest answer to "make it 8-bit", and it is a closed list of
seven, with the ask that should make you reach for each one:

| Write | What it is | Reach for it when the ask is |
| --- | --- | --- |
| `chip nes` | two pulses, a triangle bass and a noise drum — the 2A03 exactly | NES, Famicom, 8-bit |
| `chip gb` | two pulses, a wavetable and a short metallic noise — pulse for pulse | Game Boy |
| `chip pce` | six channels of pulse, wavetable and noise — the PC Engine | TurboGrafx, TG16 |
| `chip snes` | smooth sustained voices and a sampled tom — the Super NES by ear | SNES, 16-bit, RPG |
| `chip gba` | bright, snappy voices and a sampled clap — the Advance by ear | GBA, handheld |
| `chip genesis` | six FM channels and a noise drum — the Mega Drive | Genesis, Mega Drive, FM |
| `chip opl` | warm two-operator FM — AdLib and Sound Blaster, softer than a Genesis | AdLib, Sound Blaster, DOS |

The longer spellings work too (`famicom`, `gameboy`, `tg16`, `super-nes`,
`advance`, `megadrive`, `adlib`, `soundblaster`). Four rules, and the first two are
the ones that bite:

1. **`tracks N` goes ABOVE it.** A chip sets the channels that EXIST at that
   point, so a `chip` line on a song with no `tracks` line dresses one channel and
   the rest arrive afterwards with no sound of their own.
2. **It lays the line-up over your channels by index**, cycling when the song is
   wider than the machine — so `chip nes` on four channels is pulse, pulse,
   triangle bass, noise in that order, and on eight channels those four play
   twice. Write `chip` ABOVE the `track` lines, so the console sets the SOUND and
   your lines set the names and the balance.
3. **It is a starting point, not a mode.** It only ever sets a channel's sound —
   never its name, notes, level or mute — so `chip nes` then `track 1 bright 95`
   is a NES pulse tuned away from the profile. And a chipped song stores no `chip`
   field: it saves as exactly those voices, so nothing can go stale.
4. **It clears any stack**, because it sets the channel's whole sound. Write it
   ABOVE your `layer` lines.

It is honest about what it is, too: `nes` and `gb` are pulse-and-noise machines
built from the waves this engine has, while the Super NES, the Advance and the
TurboGrafx are `sample`/`table` voices and the Genesis and the AdLib are the `fm`
wave at different depths. None is cycle-accurate — each is the right SHAPE, which
is the promise a profile makes. And `chip` needs no file and no import, so unlike
`wave font` it is safe to write into a script somebody else will open.

```script
new
song "CHIPTUNE"
tracks 4
chip nes

track 1 "LEAD" level 100
track 2 "HARM" level 60
track 3 "BASS" level 70
track 4 "DRUM" level 35

pattern 1 "A"
C-4 E-4 C-2 C-6
.   .   .   .
G-4 C-5 G-2 .
.   .   .   .
```

### When one sound is not enough: layers

A channel's sound is its voice — which **is** layer 1 — plus up to three layers
stacked above it, all played together on every note of that channel:

```text
layer <track> <layer> [wave <square|triangle|saw|sine|noise|table|sample|fm|string|formant|organ|granular|font|reed|brass|bow|mallet|membrane|plate>] [octave -4..4] [detune -100..100] [gain 0..100] [the nine knobs]
```

**A new layer starts as a copy of the one below it.** So a layer line says only
what DIFFERS, and five words are usually enough:

```text
track 1 "LEAD" wave sawtooth bright 80
layer 1 2 detune -11 gain 55      # the same saw, 11 cents flat, a little quieter
layer 1 3 detune 12  gain 55      # ...and 12 cents sharp: one note, three players
```

Reach for a layer only when the song genuinely needs one, and reach for these
three shapes first — they are the ones that read as an arrangement rather than as
volume:

| Goal | Write |
| --- | --- |
| A wide lead, a supersaw | two more copies of the same wave at `detune -12` / `detune 12`, `gain 50`–`60` |
| A bass an octave deep | `layer <t> 2 octave -1 gain 45` under the existing bass |
| A bell, a struck or plucked attack | a bright layer at `gain 40` over a dull voice, or the reverse |
| A choir | two pads, the second `detune 8`–`15` and `gain 45` |

A hand does the same thing in the **`F7`** design menu: `INS` adds a copy of the
selected layer, `DEL` takes one out, and the arrows walk the chips, the waveform,
`octave`, `detune`, `gain` and the nine knobs, with `←`/`→` changing the value you
are on. `F4` reports a stack as well — a strip of chips beside its `SOUND`
heading, the first one lit — but `F4`'s nine knobs edit layer 1 and nothing else,
so point a person at `F7` the moment they want to change another layer. When they
ask how to thicken a part, name `F7`; when they ask for it in words, write the
`layer` line. The two are doors onto one model, and neither can express a stack
the other cannot.

Effects are the other half of the same screen: `Tab` (or the `FX` button) turns
`F7` over to the selected channel's nine effects — `drive`, `crush`, `cab`,
`tape`, `radio`, `vinyl`, `chorus`, `punch`, `tilt`, `gate` — as dials, each already a
percentage where `0` is off.
They are the answer to "make the guitar bite", "make this lo-fi", "why does the
kick not cut through", and the `track` line is the answer in words: `track 1
drive 45`. Point a hand at `F7`+`Tab` for one effect on one channel, and write the
`track` line when the same shaping must happen in a script you are handing over —
the numbers, the range and the wording are shared, so neither can drift from the
other.

Reach for **`master`** when the ask is about the RECORD rather than a part — "make
it sound like a tape", "why does this feel thin", "make it hit" — and write it as
one line near `tempo`: `master drive 20 tilt 12` is the whole of console glue. Two
rules keep it from doing harm: keep it under about `25` unless the brief is
explicitly lo-fi (a channel that already has `drive 45` needs a mix that has none),
and remember `gate` on the master is a NOTE LENGTH, so it compounds with every
channel's own. `0` is off, so a mix you did not shape writes no `master` line and
no `master` key, and a song that names one is written as file version `15`.

Reach for **`duck`** when the ask is about the GROOVE of a busy low end — "the
bass and the kick fight", "make it pump", "it sounds muddy at volume" — and put
it on the channel that HITS: `track 1 "KICK" duck 70`. It is one number, on the
channel doing the pushing; the rest of the mix is what steps back, and it comes
back over the length of the note, so nothing has to be timed. `0` is off and is
what every channel starts at, so a song that never mentions the word is unchanged
and a song that names one is written as file version `16`. Two things to know:
its effect is on the OTHER channels (never describe it as "the kick is louder" —
it is not), and it is before the channel's level and after its effects, so a
ducked channel takes its reverb tail down with it.

Reach for **`automate`** when the ask is about TIME rather than about a part —
"build it up", "fade it in", "open the filter across the eight bars before the
drop", "have it thin out at the end" — and write one lane per movement:
`automate 3 bright 10 95 bars 1 to 8`. It is the single biggest genre unlock in
the language: risers, sweeps, fade-outs and build-ups stop needing a channel each,
and no amount of pattern editing can produce them, because they are not notes.

Four things to know before writing one. The lane moves ONE of twelve targets: the
nine sound knobs, the channel's `level`, its `gate`, or its `drift` — the effects,
`pan` and the sends are refused, because each is an audio node that only exists
above zero and a curve cannot fade one in from nothing (set those on the `track`
line). `drift` is the exception that proves that rule: it is the tape's wow and
flutter pulled out as a plain channel VALUE, so a lane CAN move it — `automate 3
drift 10 90 bars 8 to 15` is a worn wobble that deepens as the song goes.
The bars are the 1-based slots of the `order`, NOT rows: `bars 1 to 8` is the
first eight bars of the arrangement, so write the `order` you mean first. A lane's
value is **held after it ends**, which is what makes a build land on the drop
instead of snapping back — and it is why a rise followed by a fall is two lanes,
not one clever line. And a song that writes no lane is byte-identical to one
written before lanes existed (no key, no line, format version `12`), while a song
with one is version `17`.

For a build that lands, pair a tone and a level on the way up and reverse both
after the drop:

```text
automate 3 bright 10 100 bars 1 to 8
automate 3 level  55 85  bars 1 to 8
automate 3 bright 100 35 bars 9 to 16
```

Reach for **`section` and `arrange`** when the ask is about FORM — "make it a real
song", "add a chorus", "same thing again but bigger" — and write the arrangement as
names rather than a hundred numbers:

```text
section VERSE 1 1 2 1
section CHORUS 3 3 4 4
section OUTRO 5
arrange VERSE VERSE CHORUS VERSE CHORUS OUTRO
```

Four things to know. A section is a list of PATTERN numbers (`3 3 4 4` is a chorus
that repeats two bars), not a range of bars, so a repeated bar is a repeated
number. A name is ONE word — letters, digits, `-`, `_`, up to 12 characters —
because an arrangement is read as a list of them. `arrange` BUILDS the `order`, so
the song that plays is exactly the song the same `order` line would have played,
and the two statements are interchangeable: the last one written wins. And a name
must be defined ABOVE the line that arranges it (the same order rule as
`tracks N`), though a section the SONG already has may be arranged by a script
that never wrote it.

For a song with more than a handful of bars, write the form FIRST and the patterns
second: the arrangement is the plan, and a form written after the fact is a form
nobody checked. A song whose bars have no names writes no `section` line, no
`arrangement` key and stays at file version `12`; a song with one is version `18`,
and `F3` shows each bar wearing the section it came from.

The rules that keep a stacked song from going wrong:

1. **Layer 1 is the voice.** It has no `octave`, no `detune` and no `gain` — a
   voice is in tune with itself at full level, by definition. Writing one of the
   three on layer 1 is refused with a message naming the layer to use instead.
   `layer <t> 1 wave saw bright 60` is legal and means `track <t> wave saw bright 60`.
2. **A stack has no holes.** Add one layer at a time: `layer 1 2` before
   `layer 1 3`. The parser counts as it reads, so writing past the next free layer
   is an error rather than a line that quietly does nothing.
3. **A stack ADDS level.** The voice is already at full gain, so three layers at
   `gain 100` is a channel about ten decibels louder than one. Keep the copies at
   `gain 40`–`60`, and leave the channel's own `level` for its place in the mix.
   The app says so after APPLY ("stacks 3 layers all at full gain") rather than
   refusing it — take the hint.
4. **Only when asked for.** A single-layer channel is the house style: a stack is
   what you add to the ONE part that is supposed to be big, not a default across
   every channel. Four stacked channels is four supersaws and no arrangement.
5. **`thick` first.** If all you want is a wider sound, the `thick` knob already
   detunes a second copy of the wave, in one number, on the `track` line. A layer
   is for when you want to choose the copy's waveform, move it an octave, or set
   its level yourself.

### Choosing each channel's level

A voice says what a channel sounds like; `level` (0–100, default 100) says how
FAR FORWARD it sits. A song where every channel is at 100 sounds like four people
shouting at once, and this is the one line that fixes it:

| Channel's job | `level` | Why |
| --- | --- | --- |
| Lead / melody | `100` | the thing the listener is meant to notice |
| Bass | `60`–`70` | present, not thumping over everything |
| Chords / pad | `40`–`55` | the bed; it should be felt more than heard |
| Kick / snare | `70`–`85` | a beat has to be felt |
| Hi-hat / shaker / wind | `25`–`40` | texture, quiet on purpose |

Three things a machine author gets wrong here. `level 0` is **silent but not
muted** — the channel is still in the song, and a person can turn it back up, so
use `mute 2` (`track 2 off`) if you mean "this channel does not play", and
`unmute 2` (`track 2 on`) to put it back. A mute is *state*, not a note count: it
survives every edit and it is saved in the file, so a stray `mute` in a script you
hand over is a channel the person will find silent for no reason they can see.
And `level` is per CHANNEL, not per note: if one note needs to be quieter, write
it on its own channel, or leave it out.

### The room: `reverb`, `echo`, and what each channel sends it

Two header statements put the whole song in a space. Like `swing`, they belong to
the SONG rather than to a channel — there is one room, and every channel plays in
it:

```text
reverb 30     # a hall behind the band; 0 is bone dry, which is the default
echo 25       # one repeat, timed to ONE beat so it stays in time
```

A little goes a long way: `20`–`40` of `reverb` is what glues a band together, and
past `60` it is a deliberate effect rather than a room. `echo` is defined in BEATS
rather than in seconds, so it follows `tempo` instead of drifting out of the
groove. A song that names neither is byte-for-byte the song this app wrote before
the room existed, so never write one "just in case" — write it when the ask is a
space (a cathedral, a cavern, a dub delay) and leave it out otherwise.

**How much of each CHANNEL goes in is a different number**, written on that
channel with the short words `verb` and `echo`:

| Write | Means |
| --- | --- |
| `reverb 30` on its own line | how much of the hall comes BACK: the song's room |
| `track 3 verb 0` | how much of THIS channel goes in — the bass staying dry under a wet pad |
| `track 1 echo 40` | how much of this channel is fed to the echo |

Reach for the pair when one part has to sit in FRONT of the room the others are
playing in — a dry bass and a dry kick under a drowned pad is the arrangement you
want about as often as a wet one.

### When a chord should move: `arp`

A chord holds still. `chord 0 1 Am arp up 8` is the SAME chord with a direction:
the tones are written one per step, climbing an octave each time they run out, on
the single channel the line names — one line for a bar of arpeggio. It needs no
second word for a strum, because the difference between an arpeggio and a strum is
not the notes but what the CHANNEL does with them: `hold 1` gives way to the next
note (an arpeggio), and `hold 4` lets the notes ring over each other (a strum).
Use it when a part should be obviously MOVING without a second melody: the note
count of a bar of arpeggio is 8, it fits any key by construction, and it costs one
channel. `arp down 6` reads the same run backwards and `arp updown 8` walks up and
back (`A C E C A C E C`) — the three shapes an arpeggiator has. A roll is not a
word: `A-1*8` on a channel with `hold 4` is eight hits across four steps, and a
soft note on the step before a hit is a flam.

### When a note should bend: `^` and `v`

A bend is the one pitch gesture that belongs to a SINGLE note, so it is a suffix
rather than a channel setting, and it is the only way to write an emo bend or a
whammy dive in a grid.

```text
A-4^2      # a SCOOP: start a whole tone below the pitch and rise onto it
A-4v3      # a FALL: hold the pitch, then drop three semitones away
A-4^       # the count is optional: two semitones is what a bend means
A-4^2*3    # a scoop, then three hits inside the step
```

Three rules. `^` points up and `v` down, and each is the gesture its arrow
suggests — a scoop ARRIVES from below, a fall DEPARTS downward; bending up away
from a note and down into one are the same shape backwards, so there are two
characters rather than four. The count is **1–12** semitones and **two** by
default. And a bend is NOT a `>` slide: a slide comes from the pitch the channel
played before it, a relationship between two notes, so a scoop and a slide cannot
both be written (a note arrives one way) — a FALL can ride along with either,
because leaving is a different decision from arriving. Use it on the note that
MEANS something: the one note of a phrase that bends, never every note, which is
the same rule a stutter and a flam follow.

### When a figure should be a range: `rows`

`rows` is the only statement that names a RUN of steps rather than one place, and
it is the cheapest way to write three things a tracker author keeps wanting: a
part moved by octaves, a short figure spread across a longer bar, and a run of
hits rolled.

```text
rows 0 to 3 octave down     # the first four steps, one octave lower
rows 0 to 3 repeat 4        # ...and then three more copies, filling sixteen
rows 12 to 15 roll          # ...and the last four steps as a fill, four hits each
```

Three rules. The range is written with `to` (`0 to 3`), rows count from **0**, and
it has to stay inside the grid — `steps 32` above it if the bar is longer. `repeat
N` is how many times the figure plays **in all** (so `repeat 4` of a four-row
figure is a sixteen-row bar, and the copies must fit: the refusal names the rows
it would need). `octave` moves only the PITCH: the velocities and any articulation
travel with each note, and a note that would leave `C-0..B-8` is clamped into it.
`roll [N]` writes a `*N` on every hit in the range at once — a drum roll, a snare
fill, a trap hat — retriggering each one 2–8 times inside its step (**4** if you
say no more), and it LEAVES AN EMPTY STEP EMPTY and takes a flam off a cell it
rolls, because a grace and a stutter fill the same instant two ways.
Two things it is not: it is not `arrange … repeat`, which repeats a SECTION in the
song's form rather than rows in a pattern, and it is not a loop — the range is
written on the line that uses it, so there is no state to keep track of.

Use it when a fill, a build or a bass figure should be one line instead of four,
and when a chord progression wants the same lick an octave up in the second half.

### When a chord belongs in one channel: a cell with commas

A tracker cell has always held one note per channel, so a triad cost three
channels and the chord tool spread its notes across them. A cell may now hold a
LIST — `C-4,E-4,G-4` — which is several notes at the SAME step on ONE channel, and
that is what `poly` on a track line is for.

```text
track 1 "KEYS" voice pluck hold 4
track 1 poly 4                      # written ABOVE the rows that use it
C-4,E-4,G-4 . . .
```

Three rules. The comma is the separator because a SPACE separates columns
(`C-4 E-4 G-4` is three channels, `C-4,E-4,G-4` is one). The channel must be at
least as wide as the widest cell on it — a cell holding more notes than its channel
sounds is REFUSED, because a cell is one event and a narrow channel would play the
top note and drop the rest in silence. And one cell is one gesture: the force
(`~40`) and the articulation (`>*3`) belong to the cell and apply to every note in
it.

`chord 0 1 Am` writes the same thing when the channel is wide enough, and spreads
its notes across the channels after the root when it is not — so a script that
never mentions `poly` behaves exactly as it always did. Up to 8 notes per cell,
and the range statements move a chord whole (`rows 0 to 3 octave up` transposes
every note of every chord in those rows).

### When one channel is a whole kit: a `drum` word

Percussion used to cost a channel per drum, so a kick, a snare and a hat were
three channels that happened to be played together. A cell can now NAME its sound
instead of its pitch, so **one** channel is the kit:

```text
tracks 1
track 1 "DRUMS" level 80
kick . snare .
kick . snare .
kick kick snare hat*3
```

The four words are `kick`, `snare`, `hat` and `wind` — a closed list, case
-insensitive, and anything else is refused by name. Each carries the hit's own
force and gesture, written exactly as a pitch cell does: `snare~70` is a soft hit,
`hat*3` is a trap roll, `wind~40` is a quiet build-up. The grid prints `KCK`,
`SNR`, `HAT` and `WND`, so a beat reads as words.

Use whichever door fits the line you are writing: a drum word in a **grid row**
when you are writing the pattern as text (`kick . hat .`), and the `drum ROW
TRACK DRUM` statement when you are patching one cell of a pattern you already have
(`drum 8 1 hat *3`). A gesture on a `drum` LINE is its own value — the attached
spelling belongs to the grid. Two rules worth knowing: a hit is one thing, so it
holds no chord and a note written over it takes the drum off; and a hit has no
pitch to move, so `rows … octave up` leaves the drums where they are (transposing
a section should not turn a kick into a melodic note).

**Reading a beat as lanes.** Words are for a file; the app has a second view for
a person. `F8` turns the pattern panel into four LANES — one per drum of the kit
on the channel under the cursor — with a hit as a mark in its lane and an empty
step as `...` everywhere else. A **left-click in a lane** is `drum ROW TRACK DRUM`
on that step of that channel (one undo step, and the cursor follows the click); a
**right-click** takes that hit out, but only when the step IS that drum. Two
things to know before scripting around it: `F8` is a VIEW and never an edit — no
undo step, nothing saved, a file opens in the note grid — and in the drum view a
column is a LANE, not a channel, so nothing that indexes channels should read a
click there. The arithmetic is `src/ui/stepView.ts` (what a cell says in each
view) and the frame is `PatternGrid`, which pools its texts by ROW: one edit in
the drum view repaints the whole row, because a hit written over another drum is
a mark that moved.

**Which drums they are.** `kit 808` (or `brush`, or `rock`) says what those four
hits SOUND like, in one word, for the whole song — the same beat on a drum machine,
on wire brushes or on a big live kit. Omit it and you get `studio`, the four
presets, which is what every song this app has ever played used. A kit changes the
sound and never the pitch, so it is safe to add to a finished pattern; and it
belongs on a line above the channels, next to `groove` and `tuning`, because a band
has one drummer. A word that is not one of those six names a kit of the USER's own
(`kit MYHOUSE`), saved as a `.kit.json` — legal to write, because a kit travels as
a name the app resolves, and a machine without that kit plays the four presets
rather than refusing the song. Write a built-in unless you are asked for a
particular kit by name: `studio` for anything, `808` for a machine, `brush` for
jazz and ballads, `rock` for guitars, `metal` when it has to cut through them, and
`dusty` for lo-fi and vaporwave.

### When the beat is a MACHINE, not a channel

A `drum` word puts the kit INSIDE a channel. A **drum machine** is the other
choice: pads and a step grid that play BESIDE the channels, as one instrument with
one fader, one swing and one set of effects. Reach for it when the beat is a thing
in itself — a house or trap groove you want to tune as a unit — and reach for a kit
CHANNEL when each drum wants its own room or its own effect, or when the beat is
really a player at a live kit.

```text
machine steps 16 beat 4 level 85 pan 10 swing 25 duck 30
machine drive 30

pad 1 "KICK"  voice kick  level 100 pattern "9...9...9...9..."
pad 2 "SNARE" voice snare level 90  pattern "....9.......9..."
pad 3 "HAT"   voice hat   level 55  pattern "9.9.9.9.9.9.9.9."
pad 5 "TOM"   wave membrane tune -4 pattern "..........9..9.."
```

**Write `machine steps N` above the pads.** A pad's pattern is checked against
the machine's size at the line it is read, so a `machine steps 32` goes ABOVE the
`pad` lines that fill it. A pattern may be SHORTER than the machine (the tail is
rests) but never longer — a beat that quietly loses its last hits is worse than a
line that is refused.

**The pattern string is the row.** `.` is a rest and `1`–`9` is how hard the hit
lands, so `9...9...9...9...` is four-on-the-floor and a `5` in a hat row is a
lighter tick. Write the function first and the flourish second: kick on the beats,
snare on 2 and 4, a hat on the eighths, then one or two edits.

**A pad is a sound, not a drum.** It has the same voice, wave and nine knobs a
channel has, so it can be a crash, a clap, a rim or a tuned tom. `tune` is
measured from that pad's KIT pitch, so the pad keeps its own note whatever you do
to it. Pads 1–4 seed the kit (`KICK`, `SNARE`, `HAT`, `WIND`) and pads 5–8 seed
`TOM`, `CLAP`, `CRASH`, `RIDE`; writing `pad 5` grows the machine and fills the
pads underneath with their kit defaults.

**The machine is music, not a setting.** It is saved in the song (file version 37,
or 38 with more than one bar, or 39 when a pad names a recording), undone with
everything else, and rendered as a part of the mix — so it is in a `.wav`, under
`EXPORT STEMS`, and in `EXPORT MIDI` as a track of its own on the drum channel:
`EXPORT MIDI` writes NOTES, and each machine hit becomes a short note at its pad's
own pitch, so a machine-only song exports as a beat rather than as silence.

### When a channel plays a `.wav` of your own: `sample`

The app's own one-shots are six sounds it makes from arithmetic. A **sample** is
a recording YOU have — a break, a stab, a one-shot — and it is two lines in two
scopes:

```text
sample load "samples/break.wav"

tracks 3
track 1 "BREAK" wave sample duty 10 sample break
track 2 "BASS"  voice bass
```

`sample load PATH` (or `sample import`, which opens the browser's file dialog)
brings the file into the APP; `sample NAME` on a `track` line names it for the
SONG. The two halves are deliberately apart, because **a song never carries
audio**: the file is app state and the song holds the name, which is the same
division `wave font` makes with a soundfont.

Three rules that decide how you write it:

- **A name the app does not have is the FALLBACK, not an error.** The channel
  plays the built-in one-shot its `duty` selects — exactly what it would have
  played if the line were absent — so a song written here still plays on a
  machine that has never seen the file. Never assume a load succeeded; write the
  notes so they work either way.
- **Only a `wave sample` layer plays it.** Name one on a `voice pad` channel and
  nothing changes, which is what lets a stack keep its own sound.
- **A sample has no root note.** A WAV says nothing about what note it is, so
  the app assumes middle C: `C-4` plays the file as recorded and everything else
  is transposed from there, exactly like the built-in one-shots. Do not write a
  melody against a sample expecting a different root.

The name is ONE word — a letter, then letters, digits, `-`, `_`, up to 16
characters — and the app derives it from the file name when you load one (spaces
become `-`), printing it in the status line. `sample none` takes the reference
back off; a non-word (a leading digit, a space) is refused with a sentence that
says which rule it broke. The bank holds 8 recordings of at most 30 seconds each,
and it is app state: `Ctrl+Z` never empties it.

The same two acts are on the `F2 → SAMPLES…` page — `LOAD A RECORDING (.wav)…`,
then one row per recording, where `Enter` gives the highlighted one to the channel
the cursor is on (one undo step) and `Del` twice takes it out of the bank. A
script and a hand therefore reach the same bank the same way, exactly as
`instrument load` and the instrument rows do. Write `sample load` when you are
generating a script; mention the `F2` page when you are writing for a person.

### When several channels are one instrument: `bus`

A drum kit in the old style is three or four channels that belong together, and so is a stack of
backing pads. `bus DRUMS 70` is ONE fader over the channels that join it with
`bus DRUMS` on their own `track` lines, and it is what keeps a mix from being eight
numbers a reader has to hold in their head at once. Two rules matter for writing
one: a bus is **a multiplier**, so `level 85` on a channel at `70` is `59.5` rather
than `85` — leave the channels at the levels that balance them against EACH OTHER
and put the group's job in the group; and a bus must be declared **above** the
lines that join it. It hides nothing and changes no notes, so a group is safe to
add to a working song, and `track 3 bus none` removes one channel from it. Four
groups is the ceiling, and a group made of one channel is just that channel's
`level`.

Nine **knobs** shape the sound underneath, each a percentage 0–100, each named
after what you HEAR. Every one is optional and they compose, so reach for one only
when a preset is close but not right. The two words around the arrow are the
model's own and the `F4` menu shows the same pair under the dial:

| Knob | 0 → 100 | Reach for it when |
| --- | --- | --- |
| `bright` | dark → bright | the channel is dull, or too piercing. This is the filter cutoff |
| `sweep` | flat → wah | the tone should MOVE over the note: a wah, a pluck, a zap |
| `duty` | thin → hollow | a square is too hollow and you want a narrow metallic buzz (a `square` wave is the only wave that hears it) |
| `noise` | pure → noisy | a tone should be a drum, a breath or wind |
| `attack` | instant → slow | you want bowed or dreamy instead of plucked |
| `decay` | snappy → slow | the fall from the attack peak down to the held level should take longer |
| `ring` | pluck → pad | the note dies too fast, or never lets go. It is the level a note HOLDS |
| `release` | tight → long | the tail after the note ends should ring on |
| `thick` | thin → wide | one channel should sound like several: a second copy, slightly detuned |

Each knob also answers to a longer spelling (`tone` for `bright`, `width` for
`thick`, and so on) — the manifest's `vocabulary.knobs` lists every alias — but
write the nine short words unless the person used a long one.

A voice and a knob compose, and the more specific word wins whatever the order:
`track 3 voice pad bright 90 ring 100` is a bright pad that holds. Knobs alone are
also legal (`track 1 bright 30 noise 20`) and make a channel with no preset name,
which is fine — the numbers ARE the sound.

**`bright` is a filter, and `shape` says which kind.** Its default is the
low-pass (`round`) — dull at 0, buzzing at 100. `sharp` makes it a high-pass (the
bottom goes: a telephone, a thin stab, a part with no weight), `nasal` a band-pass
(a vowel, an old radio) and `hollow` a notch (a scooped mid that leaves room for
a voice). One line changes the instrument more than any knob does, and it is the
cheapest way to make a part sit in its own space. Two cautions: `bright` still
moves the CUTOFF on every shape, so on `sharp` a HIGH `bright` is the thin one;
and a shape name the app does not know is refused with the list, so write one of
`round`, `sharp`, `nasal`, `hollow` (or `lp`/`hp`/`bp`/`notch`).

Two cautions for a machine author:
**do not invent a voice name** (`voice piano` is an error that lists the real
ones), and **keep every knob in 0–100** — the parser refuses anything outside.

The app may also have the user's own **saved sounds**, listed in the error message
after the built-ins. Writing `voice MYPAD` is a good way to use a sound the person
you are writing for already made — but it depends on their library, so it parses
only in an app that has it. For a script that has to work anywhere, write the
voice plus knobs, or the knobs alone.

**A saved sound may be a whole stack.** `SAVE AS…` keeps the channel's voice AND
its layers, so `voice SUPERSAW` can lay down a voice plus two detuned copies in
one word — prefer it when the person has already made the sound you were about to
build. Two things stay true: a built-in voice is only ever a voice (`voice pad`
never disturbs a stack), and a saved sound kept from before layers existed
carries none, so naming it changes nothing about a stack you wrote.

Then, only if the song needs sections:

```text
copy 1 2
pattern 2 "<NAME>"
note <row> <track> <pitch>
…

copy 1 3
pattern 3 "<NAME>"
clear 3
<`steps` sparse grid rows>

erase <row> <track>          # take ONE note back out of a pattern
```

`erase <row> <track>` is the door out of a single wrong cell, where `clear <n>`
empties a whole pattern: reach for it when a note you wrote last round should not
be there at all, rather than rewriting the row around it.

**Line-count discipline:** grid rows are written consecutively from step 0, so a
pattern needs exactly `steps` of them to be full — 16 by default. Write fewer and
the remaining steps are silent (legal, sometimes what you want). Write more and
you get `this pattern already has 16 steps, so there is no row 16.`

---

### When the ask is a GENRE: `start house`

If the person asks for "a house track", "some lofi", "a ballad", "something
rock", "midwest emo", "vaporwave", "synthwave", "shoegaze" or "drum and bass" —
or just for something to begin from — write one line instead of forty:

```script
start house
```

That is a whole working skeleton: key, tempo, feel, kit, six named channels with
their sounds and levels, a drum figure, a `progression` loop, and an arrangement
that repeats it into a track. The other eight are `start lofi`, `start ballad`,
`start rock`, `start emo`, `start vaporwave`, `start synthwave`, `start shoegaze`
and `start dnb`; `vocabulary.genres` in the manifest lists what this build has,
with each one's blurb, and `start house` then `SAVE AS SCRIPT` prints the whole
skeleton back out as lines to read.

**The shelf is a shelf, not a preset list.** Each starter is a different record
at a different tempo with its own loop, its own kit and its own feel, so `start
rock` is a power-chord band and `start dnb` is a broken beat at 174 — reading the
one nearest the ask is faster than assembling a genre from knobs.

Four rules, and then start editing:

- **A starter begins with `new`.** It REPLACES the song rather than adding to it,
  so never write one inside a script whose earlier lines matter — and never put a
  `start` line under your own header hoping to keep it.
- **Everything after it is read against its shape.** `start house` makes six
  channels and a one-bar grid, so the lines BELOW it may name channel 6 and write
  six-column rows. That is the one difference from pasting the skeleton by hand.
- **Every line it wrote can be overridden** by a later line, the way any pair of
  statements works: `start lofi` then `tempo 90` is a slower lofi loop.
- **Change at least one thing.** A starter is a starting point, not an answer: the
  request was for a song, and a skeleton nobody touched is the same song everybody
  else gets. The three places a change tells most are the `progression`, the drum
  figure, and the arrangement's `repeat` counts.

### When a whole song hangs on one loop: `progression` and the two followers

```script
new
song "LOOP"
tempo 100
tracks 4
track 1 "CHORD" voice pad  poly 3
track 4 "BASS"  voice bass
progression Am F C G
chord 0 1 follow
note  0 4 follow
```

A **progression** is the chord loop the whole song hangs on, written ONCE: a list
of chords and how long each one lasts. It is a definition like a `section`, not a
change — nothing plays it on its own — and what uses it are two FOLLOWER lines that
write its notes into cells:

| Line | Writes |
| --- | --- |
| `chord ROW TRACK follow` | the loop's CHORDS from `ROW` on, one chord per chord of the loop, each held for its own length — the keyboard part |
| `note ROW TRACK follow` | the loop's ROOTS from `ROW` on, one per chord — the bass line under it |

Reasons to reach for it: a four-chord song, an 8-bar practice loop, a bass line
that must not drift away from the keyboard above it, or any song where you would
otherwise retype the same four stacks three times. `progression Am F C G` plus
those two lines is 16 bars of harmony in three lines.

The rules that matter when you write one:

- **A chord is named the two ways `chord` names one** — a name (`Am`, `F#7`,
  `Bbmaj7`) or a scale DEGREE (`1`–`7`). Prefer degrees when the song's key does
the work (`progression 1 6 3 7`), names when the chord is borrowed.
- **A step is ONE word**: `Cmaj7`, never `C maj7`.
- **`hold N` is how many STEPS each chord lasts**, `1`–`64`, one number, LAST on
  the line. It defaults to **4** (one beat at the default grid), which fits four
  chords in a 16-step bar. `hold 8` is two chords to the bar, `hold 16` one — use
  those for a slow ballad; `hold 2` is a fast turnaround.
- **A `chord … follow` channel needs `poly` at least as wide as the widest chord**
  (`poly 3` for triads, `poly 4` for any seventh or a `Cmaj7`), written ABOVE the
  line. Without it the line is refused with the count in it, so if you write
  sevenths, write `poly 4`.
- **A follower starts at its own `ROW`** and writes to the end of the pattern,
  one chord every `hold` steps: `chord 8 1 follow` is the second half of the loop.
- **Put the `progression` line above the followers.** A follower SNAPSHOTS the
  loop at that point in the script, exactly as `tracks N` has to come before the
`note` lines that use channel 5.
- **`progression none` clears it.** A song with no loop is unchanged, byte for
  byte — so a script that does not need one should not write one.

### When movement should be DRAWN: the ARRANGER

A lane is content, and content is what you write — but the person you hand the
song to may want to SEE the build rather than read `automate 1 bright 15 95 bars 3
to 6`. The **ARRANGER** page draws exactly that, and it is the same data, so you do
not write anything special for it: write the lanes as `automate` lines, then add
`page arranger` so the timeline is the screen the script lands on.

- **The form is bands.** Each run of bars wears the SECTION it came from (from the
  `arrange`/`section` lines) with the bars it covers, over a `BAR` row and a
  `PATTERN` row — so an agent that writes a clear form is understood at a glance.
- **A row per channel** wears its colour, name and voice, and each bar shows its
  pattern number and a note preview (a dash per note, by step and pitch), with
  `REST` where the channel is silent. Do not fill every bar: the rests are the
  picture.
- **The lane editor and its inspector** draw the selected channel + target's lanes
  on a value axis and let a hand read or type `START BAR` / `END BAR` / `FROM` /
  `TO`. Every gesture is one `Ctrl+Z`.
- **It adds no data and no file version.** A lane drawn on the page is the lane an
  `automate` line writes, so `F2 → SAVE AS SCRIPT` prints it back as `automate …`
  and round-trips.

### 3.1 The settings that are not the song

These are in `settings` in the apply result, not in the `Song`. Use them to
set the app up for whoever works on the song next; they are all optional, and each
one you leave out is left alone.

| Statement | What it does | When to write it |
| --- | --- | --- |
| `volume 70` | the master level, 0–100 % | only if the song wants a specific room level |
| `octave 5` | moves the app's `OCT` control AND the default octave for bare letters | when the melody lives in one register and you want the keyboard to match |
| `theme forge` | the look of the whole app (the `F9` menu) | **almost never** — the look belongs to the reader, not the song. Only when the person asked for one |
| `hear on` / `hear off` | audition each note as the cursor reaches it | `hear on` for a learner, `hear off` (the default) for a dense song |
| `chords off \| triad \| 7th` | what ONE KEY writes from now on | `chords triad` if the person should keep writing chords by hand |
| `solo 1 3` / `solo off` | hear only those channels | **while you iterate**, never in a finished script — a soloed handover sounds broken |
| `page arranger` | which full screen the app shows: `tracker`, `machine`, `mixer`, `arranger`, `live`, `recorder` or `arp` | when the person should land on a particular tab — the arranger to SEE a build, the mixer to balance one, the recorder to render one, the arp to dial a run |
| `live quantize 4` | how many bars a LIVE launch waits for (0 is immediate) | when the person should perform the set at the next bar line |
| `export bars 8 to 15 loud -14` | the region an audio export renders, and the LUFS it normalises to | when you are handing over a chorus to be bounced |
| `record trim HOOK 0.1 2.0` / `record loop HOOK 1.0 3.0` / `record select HOOK` | a take's window and loop, and which take the RECORDER shows | when the take already exists in the app; a capture (`record HOOK`) needs a microphone and is refused where there is none |
| `instrument use 1` | which imported instrument a `wave font` channel plays | only when a soundfont is already loaded; `instrument load "path"` fetches one |

None of these can break a song: they are not stored in it, they cost no undo step,
and no file written by the app carries them (except `volume`). A `record` line is
the same bargain one step earlier: a take is APP state, so a script can shape one
you have but never puts it in the song — only the channel's `sample NAME` reaches
a file.

---

## 4. The pre-flight checklist

Run this against your own output. It catches nearly everything.

- [ ] Line 1 is `new` (unless you deliberately want to build on the current song).
- [ ] `tempo` is between 40 and 300.
- [ ] `steps`, if present, is 1–512, and **every pattern has at most that many
      grid rows**.
- [ ] `beat`, if present, is 1–16.
- [ ] `volume`, if present, is a **percentage** 0–100 (`volume 70`, not `0.7`).
- [ ] `export`, if present, is `export bars A to B` with `1 ≤ A ≤ B`, or
      `export all`. A range that reaches past the last bar is not an error — the
      export is fitted to the order and an advisory says which bars it became —
      but on a song you have just written it is usually a typo about which end is
      which. It sets what the EXPORTERS write, not what the song is: no file
      carries one, and it changes nothing on the grid.
- [ ] `steps` appears **before** the grid rows that need the extra length, and
      before any `note` whose row is past 15.
- [ ] `tracks N` appears **before** any `track N …`, any 5th/6th/… column, and
      any `note … N …` naming that channel.
- [ ] Every `track N` uses `1 ≤ N ≤ tracks`, and every name is at most 16
      characters. A name and its settings can share a line:
      `track 2 "BASS" voice bass off`. The settings are read from the RIGHT —
      the name, then `voice V`, `wave W`, any of the nine knobs, `hold H` and
      `level L`, in any order, then `on`/`off` — so `track 1 BASS voice bass off`
      names the channel `BASS`, gives it the bass sound and mutes it. A bare
      `voice`, `wave`, knob word, `level`, `on` or `off` anywhere else is an
      error; quote it to make it a name (`track 1 "OFF" voice bass`).
- [ ] Every `sample NAME` is one word (`sample BRK02`) on a channel whose voice
      is `wave sample`, and every `sample load` path is a file that exists. A
      name the app does not have is not an error — the channel falls back to the
      built-in one-shot — but a misspelled name is a channel quietly playing the
      wrong sound, so it is worth checking against the status line that loading
      printed.
- [ ] Every `voice V` is one of the fourteen real voices, spelled exactly
      (`voice piano` and `voice pads` are both errors). Prefer a voice over a bare
      `wave` — the voice is what the channel is for.
- [ ] Every knob (`bright`, `sweep`, `duty`, `noise`, `attack`, `decay`, `ring`,
      `release`, `thick`) is a number
      0–100. Prefer leaving a knob out entirely over guessing a value.
- [ ] Every `level L` is a percentage **0–100** (`level 65`, not `0.65`), and at
      least one channel is at 100 — a mix where nothing leads is a mix nobody
      listens to. `level` leaves the channel PLAYING, so a channel you do not
      want heard at all wants `mute N` instead.
- [ ] `swing N` is a whole percentage **0–100**, on its own line (never
      `track 2 swing 60` — that RENAMES the channel to `SWING 60`; `swing` is the
      song's, while the per-channel settings are `groove` and `humanize`). Values
      above 80 are a very deep shuffle; `40`–`60` is what most songs want.
- [ ] `solo` names channels the song HAS (`tracks N` first), and no `solo` line is
      left in a script you are handing over. `solo off` is how you clear one.
- [ ] `chords` is one of `off`, `triad`, `7th`; `hear` is `on` or `off`.
- [ ] a channel that should RING or HOLD A CHORD uses `poly`: a whole number
      **1–8** on a `track` line, `1` by default. It is what lets notes overlap in
      time — a channel with `hold` above 1 is a pad rather than a series of stabs
      — and it is also what a chord in one cell needs: `C-4,E-4,G-4` is refused on
      a channel that sounds one note at a time, and accepted on `poly 3`.
- [ ] a chord in one cell is written with **commas** (`C-4,E-4,G-4`, up to 8
      notes, no pitch twice) and every such channel says `poly` at least as wide
      as its widest cell, written **above** the rows that use it. The force and
      the articulation belong to the CELL: `C-4,E-4,G-4>*3~40` is one quiet
      arrival, three hits, three notes.
- [ ] an `arp` run FITS: `chord ROW TRACK CHORD arp [DIR] [STEPS]` needs
      `ROW + STEPS` rows, one channel, and a direction of `up`, `down` or
      `updown` (aliases: `asc`/`ascending`, `desc`/`descending`, `both`). The
      count and the direction may be in either order, and leaving the count out
      is one step per note of the chord.
- [ ] an `arrange` uses `repeat N` rather than naming a section four times, and
      `N` is **2 or more** (how many times the section plays IN ALL):
      `arrange VERSE CHORUS repeat 4 VERSE`.
- [ ] every `rows` range is **inside the grid** (`0` to `steps - 1`) and written
      with `to` in order (`rows 0 to 3`, never `rows 3 to 0`), and the statement
      lands on the pattern `pattern` selected — put the `pattern N` line above it.
- [ ] a `rows … repeat N` FITS: `N` is how many times the figure plays **in
      all**, 2 or more, and `N` × the rows in the range must not pass the last
      row of the pattern. Four rows played four times is a sixteen-row bar; the
      same line on a `steps 8` pattern is an error, and the message says why.
- [ ] a `rows … octave up|down [N]` shift is **1–8** octaves, and it CLAMPS at
      `C-0`/`B-8` rather than refusing — so do not use it to make a part "loud"
      by pushing it off the top; the notes that arrive at `B-8` stay there.
- [ ] a `rows … roll [N]` puts **2–8** hits in a step, **4** if `N` is left out,
      leaves a step with no hit in it empty, and takes a flam off a cell it rolls.
      It is the `*N` suffix written across a run of steps, not a new sound.
- [ ] a `^N`/`vN` bend is **1–12** semitones, **2** if the count is left out, and
      a SCOOP (`^`) never rides with a `>` slide — a note arrives one way. A `v`
      fall may ride with either, and both may ride with a stutter or a flam.
- [ ] `volume` is a percentage 0–100 (`70`, not `0.7`), and `octave` is 0–7.
- [ ] `pattern N` appears **before** the grid rows that belong to pattern `N`.
- [ ] Every grid row has **at most `tracks` tokens**.
- [ ] Every token is either an empty token (`.`, `..`, `...`, `-`, `--`, `---`,
      `_`), a pitch matching `^[A-Ga-g](#|b)?-?\d+$` with octave 0–8, or one of the
      four DRUM words (`kick`, `snare`, `hat`, `wind`, optionally with a `~force`
      and a `*N`/`>`/`!`/`^`/`v` gesture: `snare~70`, `hat*3`, `kick!`).
- [ ] Every pitch is inside `C-0` … `B-8`.
- [ ] Every `note` line has three to five arguments, with row in
      `0 … steps-1` and track in `1 … tracks`.
- [ ] Every `drum ROW TRACK DRUM` names one of `kick`, `snare`, `hat`, `wind`,
      with its row and track in range — and any gesture on it is its OWN value
      (`drum 8 1 hat *3`, not `hat*3`; the attached spelling is the grid's).
- [ ] `kit`, if present, is one of `studio`, `808`, `brush`, `rock`, `metal`,
      `dusty` — or one word up to sixteen characters that is one of the user's own
      kits — on its own line. Omit it unless the song's genre wants a particular
      kit.
- [ ] A `start NAME` line is the FIRST meaningful line (it begins with `new`, so
      everything above it is thrown away), names one of `house`, `lofi`, `ballad`,
      `rock`, `emo`, `vaporwave`, `synthwave`, `shoegaze`, `dnb` — one word,
      nothing after it — and its skeleton has been CHANGED somewhere, because a
      starter nobody edited is not a song anybody asked for.
- [ ] A `progression` line comes **above** the `chord … follow` / `note … follow`
      lines that read it, has 1–16 chords, and puts `hold N` (`1`–`64`) LAST. A
      `chord … follow` channel says `poly` at least as wide as the loop's widest
      chord (`poly 4` if you wrote a seventh), and a `follow` line takes nothing
      after it (`note 0 4 follow 40` and `chord 0 1 follow arp` are both errors).
      A follower that would start past the last row writes nothing rather than
      failing — check the row when the loop should not start at step 0.
- [ ] A beat written for a PERSON reads well as lanes: on a kit channel, hits that
      belong together sit on the same step of the bar, and `F8` shows it that way.
- [ ] Every `copy` has `1 ≤ from ≤ 64` and `1 ≤ to ≤ 64`.
- [ ] `track N …` comes **before** the rows it describes the sound of (it does not
      have to, but it reads better and avoids surprises).
- [ ] Names do not contain `wave`, `on` or `off` unless quoted.
- [ ] No channel shares an octave with another channel unless that is deliberate.

Two of these are worth a second pass because they are the failures that *parse
cleanly* and still sound wrong:

- **the octave check** — a bass written in octave 5 is not an error to the parser;
- **the `wave`/`on`/`off` name check** — those three words are SETTINGS when they
  are bare, and only in the right place (`track 1 "MY" wave saw off`). Quoting is
  what makes one a name (`track 1 "OFF"`), and a bare one in the wrong place is
  an error rather than a silently different channel name.

---

## 5. Common failure modes, and the message each one produces

| What you wrote | What happens | Message |
| --- | --- | --- |
| A 5-column row on a 4-channel song | Nothing applies | `this grid row has 5 notes but the song has 4 tracks…` |
| `track 5` before `tracks 5` | Nothing applies | `track number must be 1..4 (the song has 4 tracks)…` |
| `note 0 0 C-4` (0-based channel) | Nothing applies | `track must be 1..4; got "0".` |
| `note 16 1 C-4` | Nothing applies | `row must be 0..15 … got "16"` |
| 17 grid rows with `steps` unset | Nothing applies | `this pattern already has 16 steps, so there is no row 16.` |
| `steps 32` written *after* the rows | The extra rows are rejected | same message, on the first row past 15 |
| `volume 0.7` meaning "70%" | The mix drops to almost nothing | (no error — 0.7 means 0.7%) |
| A channel name longer than 16 characters | Nothing applies | `a channel name may be at most 16 characters; "…" is 20. Shorten it…` |
| `track 2 BASS GUITAR` (no quotes) | Names it `BASS GUITAR` — which is fine | (no error; unquoted words are joined) |
| `beat` changed without changing `steps` | The bar length changes silently | (no error — the grid still has the same steps) |
| `octave 9` | Nothing applies | `octave must be a whole number 0..7; got "9".` |
| `C#9` or `H-4` | Nothing applies | `column n: "…" is not a note in range…` |
| `track 2 BASS wave triangle off` | Channel 2 muted for the WHOLE song | (no error — mutes are per channel, not per pattern) |
| `track 1 wave` | Nothing applies | `wave needs a shape: "wave square"…` |
| `track 1 voice piano` | Nothing applies | `"piano" is not a voice. Voices: lead, pluck, …` |
| `track 2 "BASS" level 140` | Nothing applies | `level is a percentage 0..100; got "140". 100 is full volume…` |
| `track 2 "BASS" level 0.65` (meaning 65%) | Nothing applies | `level is a percentage 0..100; got "0.65"…` |
| `track 2 "BASS" level` | Nothing applies | `level needs a percentage 0..100, e.g. "level 70"…` |
| `swing 140` | Nothing applies | `swing must be a percentage 0..100; got "140". 0 is straight…` |
| `track 2 swing 60` | It RENAMES the channel to `SWING 60` and nothing swings | (no error — a bare word that is not a channel setting is part of the name) |
| `swing` (no number) | Nothing applies | `swing needs one number 0..100, e.g. swing 60…` |
| `solo 5` on a 4-channel song | Nothing applies | `solo takes channel numbers 1..4; got "5"…` |
| `solo` (no channels) | Nothing applies | `solo needs one or more channel numbers 1..4…` |
| `chords quartal` | Nothing applies | `"quartal" is not a chord mode. Use "chords off", "chords triad"…` |
| `hear yes` | Nothing applies | `hear needs on or off, e.g. "hear on"…` |
| `theme neon` | Nothing applies | `"neon" is not a theme. Themes: reliquary, moorland, …` |
| `theme THE DEEP` (a space, not the id) | Nothing applies | `theme needs one name, e.g. theme forge. …` (write `theme the-deep`) |
| `solo 2` left in a finished script | It applies — and the person hears one channel | (no error; that is why it is a handover mistake) |
| `level 65` on its own line | Nothing applies | `unknown command "level". Commands are: …` |
| `track 1 voice` | Nothing applies | `voice needs a voice name, e.g. "voice pad"…` |
| `track 1 bright 140` | Nothing applies | `bright is a percentage 0..100; got "140". 0 is dark, 100 is bright.` |
| `track 1 tone` | Nothing applies | `tone needs a percentage 0..100, e.g. "bright 40"…` |
| `track 1 shape warm` | Nothing applies | `"warm" is not a filter shape. The shapes are: round, sharp, nasal, hollow.` |
| `track 1 shape` | Nothing applies | `shape needs one filter shape, e.g. "shape sharp" (which part of the sound survives)…` |
| `track 1 off BASS` | Nothing applies | `"off" is a mute flag here, not a name…` |
| `pattern 2` after the rows for pattern 2 | Rows land in pattern 1 | (no error — order matters and nothing complains) |
| `copy 1 2` before writing pattern 1 | Pattern 2 is an empty copy | (no error) |
| `chord 0 4 Am` on a 4-channel song | Nothing applies | `chord "Am" needs 3 channels starting at track 4, but the song has 4. …` |
| `chord 0 1 Dsus` | Nothing applies | `"Dsus" is not a chord. Name a root and a shape …` |
| `automate 2 bright 15 95` (no bars) | Nothing applies | `a lane needs the bars it spans, written "bars 8 to 15" (or "bars 8" for one bar)…` |
| `automate 2 drive 0 80 bars 1 to 4` | Nothing applies | `"drive" is not something a lane can move. A lane can move: bright, …` |
| `automate 2 bright 95 15 bars 8 to 4` | Nothing applies | `a lane runs from an earlier bar to a later one … write two lanes if the value should rise and then fall.` |
| `automate 5 bright 0 100 bars 1 to 4` written ABOVE `tracks 5` | Nothing applies | `automate takes a channel NUMBER first, 1..4 … Use "tracks N" first to add channels.` |
| `arrange VERSE CHORUS` written ABOVE its `section` lines | Nothing applies | `arrange names a section the song does not have: "VERSE" …` |
| `track 1 bus DRUMS` written ABOVE `bus DRUMS 70` | Nothing applies | `track 1 joins a bus the song does not have: "DRUMS" …` |
| `bus MY DRUMS 70` (two words for one name) | Nothing applies | `bus MY takes a level 0..100; got "DRUMS" … A bus NAME is one word …` |
| `bus DRUMS 70` with the channels left at full volume | It applies — and the kit is 30% quieter than you wrote | (no error: the group MULTIPLIES each channel's own `level`) |
| `section MY CHORUS 1 2` (two words for one name) | Nothing applies | `section MY takes pattern numbers 1..64; got "CHORUS". A section NAME is one word …` |
| `order 1 0 2` | Nothing applies | `order takes pattern numbers 1..64; got "0".` |
| Two patterns, no `order` line | Only the first pattern ever plays | (no error — the order defaults to one bar) |

The last three are the dangerous ones: they are silent. Read the script in order
and confirm each statement precedes the lines that depend on it.

---

## 6. Verifying your own output

### If you can run code

The language is a pure function in the repo, and both halves are exported.

```ts
import { applyScript, createSong } from './tracklet/src/model';

const result = applyScript(createSong(), source);

if (!result.ok) {
  for (const d of result.errors) console.error(`line ${d.line}: ${d.message}`);
} else {
  console.log(result.summary);
  // { title, bpm, patterns, tracks, notes, advisories: string[] }
}
```

`advisories` is the useful half: it reports an empty pattern, any channel with no
notes, a stack of loud layers, and an unused FORM — a section the arrangement never
plays, or a song that defines sections and plays a plain order. That last pair is
how you catch a form you wrote and then forgot to arrange. `summarizeSong(song)`
gives the same shape for a song you already have.

The person at the keyboard reads the SAME list: the app says each observation once,
as it becomes true, and keeps the ones that are still true on a notice line under
the header readout. So an advisory is not only a report back to you — it is what
the author is being told while they work, and a song you hand over with an advisory
still standing is one they have already been warned about.

To check a script without applying anything, use the parser alone:

```ts
import { parseScript } from './tracklet/src/model';

const { commands, errors } = parseScript(source, { trackCount: 4, rows: 16 });
```

`parseScript` never touches a song, so it is safe to call as often as you like —
it is what the SCRIPT panel runs on every keystroke.

**Handing a song to another program** is the same pure function, the other way:
`songToMidi(song)` returns `{ ok, bytes, summary }` or a refusal. It is worth
knowing what leaves, because it is not the whole song: a `.mid` carries notes,
their lengths, their velocity, the tempo and one instrument per channel — and
nothing about the SOUND (layers, the six effects, pan, the sends, the room), the
FEEL (`swing`, a channel's `groove` and `humanize`), automation lanes or named
sections. So a riser that an `automate` lane builds, or a groove that `swing`
gives, comes back as a plain run of notes; if the point of the export is the
sound rather than the notes, `SAVE AS JSON` is the format to hand over, and
`EXPORT AUDIO` is the one for the sound itself. If the point is that somebody
ELSE mixes it, the third answer is `EXPORT STEMS`: `stemPlan(song, stem)` says
which channels carry a note and what each one's file is called — the set is a
pure function of the song, and the rendering and the archive are
`renderStemsToPcm` and `zipStore`. A song with no notes is refused there in the
same words and the same shape as MIDI.

All three writers also take a **loop region**, so "the chorus only" is one answer
rather than three: `export bars 8 to 15` in the script (or `L` in `F3`), which
arrives as `settings.bounce` and is passed on as the `bounce` option to
`songToMidi`, `renderSongToPcm` and `renderStemsToPcm`. `bounceSteps(song, range)`
is the one place bars become steps, `fitBounce` the one place a range is fitted to
the order, and `bounceLabel(range, bars)` the one place it is spelled — so a file
the app writes and a sentence it prints cannot disagree about which bars went.

The two AUDIO writers also take a **loudness target**, `export loud -14`, which
arrives as `settings.loud`. The arithmetic is three pure functions in
`src/audio/lufs.ts` — `integratedLoudness(channels, sampleRate)` (ITU-R BS.1770,
null for a render with no loudness rather than `-Infinity`),
`matchLoudness(channels, sampleRate, target)` (the gain, what it measured, and
whether the -1 dBFS ceiling decided instead), and `gainChannels(channels, gain)`
(a copy — measuring and scaling never touch the render you passed in). None of
them needs a browser, which is why the calibration is CHECKED rather than
asserted: `kWeighting(48000)` is compared against the coefficients the standard
publishes, and a 1 kHz tone at -20 dBFS is measured and compared against the -23.0
LUFS it is defined to be. An agent that reasons about level should quote that
pair of tests rather than trust a number it remembers, because a wrong filter
degree still produces a plausible reading. The refusal is the same shape
everywhere here: a song with no notes in the file gets `{ ok: false, errors }`
rather than an empty download, because a build of this app will not write a MIDI
file it would refuse to open.

The other direction in, **a real keyboard**, is the one part of interop that is
not a function of the song. The rules are pure and live in `src/model/midiIn.ts`,
so they can be reasoned about without a browser: `decodeMidiIn(data)` turns the
raw three-byte Web MIDI message into a `MidiInMessage` (a note-on at velocity 0
becomes the note-off it means, and a control change, bend or program change is
reported as itself so a caller can see it was read); `velocityFromMidi` is the
inverse of `midiExport`'s `midiVelocity` (1–127 → 1–100, never 0);
`tempoFromPulses(intervalsMs)` is the MEDIAN of the last beat's worth of pulse
gaps, dropped outside 2–250 ms and clamped to the song's tempo range, so a jittery
USB clock cannot decide the tempo; and `placeLiveNote(song, step, track, midi,
velocity)` writes one cell where the playhead is and returns whether the song
changed, so the caller decides whether the take needs an undo step. The one
control has three stops — `MIDI_MODES` is `['off', 'listen', 'record']` — and
`midiRowLabel(status)` / `midiStatusAbout(status)` spell the row. The browser half
is `startMidiInput`, which asks for permission only when a mode is turned on. What
the app deliberately does NOT do is slave its audio scheduler to the pulses: it
follows the clock's tempo and its start and stop, and `doc/09` says so in the same
words. Do not promise sample-locked sync.

### If your client speaks MCP

The whole API is also an **MCP server**, which is the shortest path from "write a
song" to "check the song": instead of re-implementing the parser you call it.

A client that dials a URL: `npm run api:server` in the project folder prints
`http://127.0.0.1:4590/mcp`.

```json
{ "mcpServers": { "tracklet": { "type": "http", "url": "http://127.0.0.1:4590/mcp" } } }
```

A client that would rather spawn the process itself — most desktop clients, and
nothing has to be started first:

```json
{ "mcpServers": { "tracklet": { "command": "npm", "args": ["run", "mcp"] } } }
```

Either way it is the same tools over the same messages, and the app's `SCRIPT`
box has an `MCP` button that shows both configs with a copy button each.

You get one tool per operation, named exactly as the manifest names it. The four
worth knowing first:

- `language.capabilities` — the version, the limits and every word this build
  speaks. Call it before writing a line, for the reason section 0 gives.
- `script.validate` — parse a script and change nothing. The refusal is a resolved
  tool call with `isError: true` and one line per problem, each with its line
  number, so you can read `line 7: …` and repair that line.
- `script.apply` — replace a whole song. All-or-nothing, and it hands back the
  summary (`title`, `tracks`, `patterns`, `notes`, `advisories`) you would have
  printed yourself.
- `song.edit` — change ONE thing about a song you already have, without writing
  it again: a cell, one channel's level, the tempo, the order. It takes a list of
  edits and hands back the changed song plus a change log (what moved, and what it
  was), so "I changed row 4" is a fact you can check. The whole call is refused if
  any one edit does not fit, so you never hold half a change. It edits the
  ARRANGER's lanes too, as `automation.set` (a whole lane — `track`, `target`,
  `from`, `to`, `startBar`, `endBar`, with an optional 1-based `index` that moves
  a lane or appends) and `automation.clear` (one lane by `index`, or all). It also
  edits the LIVE launch grid: `scene.set` (define or replace a scene by `name`,
  with its per-channel `clips` and an optional `machine` bar), `scene.add` (an
  empty row), `scene.rename` (`name` → `to`), `scene.duplicate` (copy a scene right
  after itself, optionally to a `to` name) and `scene.clear` (one scene by `name`,
  or every scene with no name).
- `song.diff` — two versions of a song in, the edits between them out, in the very
  same shape `song.edit` and `library.update` take. Use it to state what you changed
  as edits rather than as prose; it also says (in `notes`) when something moved
  that the edit vocabulary cannot express, so a partial answer never looks complete.
- `song.grid` — a pattern as text, which is the closest thing to seeing the
  screen when you cannot listen.
- `arranger.describe` — the ARRANGER page as data: the bars with their section
  names, one row per channel, and every lane grouped by channel and target with its
  range and its resolved value bar by bar. The read half of the page, so a screen
  and an agent cannot disagree.
- `live.describe` — the LIVE page as data: every scene, its per-channel clips with
  the pattern names they play and the notes each channel sounds, and the
  drum-machine bar it performs, plus the rows as a `script` block you can paste
  back. It says plainly that WHICH scene is performing is session state it cannot
  see. `live.launch` resolves one scene by name and answers what a running app
  would queue at the next quantize boundary — without changing the song, because a
  launch is a performance, not a file change.
- `workspace.describe` — the whole workspace in one call: the pages
  (`tracker`, `machine`, `mixer`, `arranger`, `live`, `recorder`) with a one-line
  model summary of each, and which one the caller named.
- `library.write` — SAVE the song, as a `.txt` script or a `.json` file, into
  `storage/songs/agent/`; the person then opens it in the app rather than pasting
  your text. Ask `library.folders` for the rules first: it is one folder, the
  extension picks the format, and an existing file is never replaced unless you
  pass `"overwrite": true`.
- `library.update` — change a draft you already SAVED, sending only the edits you
  meant (the same list `song.edit` takes) instead of the whole song. Use this for
  "make the bass quieter" second passes; a call with one bad edit leaves the file
  exactly as it was, and it keeps the draft's own format.

`tools/list` is the full set (forty-four of them), and `api.describe` is the same
list with every input schema and a runnable example. A script block from this
repository is accepted as-is: `script.apply` speaks exactly the language
`03-script-reference.md` documents. The server binds to `127.0.0.1` and is
stateless — no session, no handshake to keep — so one call per step is normal and
nothing has to be remembered between them. It can read the songs already under
`scripts/` and `storage/songs/`, and it cannot see the song open in somebody's
editor: that one is not on disk, so the person is the one who pastes your work in.

### What Node cannot do: audio in and out

Two things need a browser, and the API refuses them with the reason rather than
pretending — the honesty `export.audio` keeps, told on both sides:

- **Audio OUT.** `export.audio` refuses: rendering uses the app's
  `OfflineAudioContext`, which does not exist in Node. Use `export.midi` for the
  notes and `export.plan` for the region and the loudness target.
- **Audio IN.** A recording and its take are APP state — the bytes live in the
  browser session's sample bank, and the API is a different process that has none.
  `recorder.capture` and `sample.load` refuse; `recorder.describe` resolves the
  takes you HAND IT (their trim and loop as data) rather than fetching your bank,
  and `recorder.plan` says what a capture WOULD do. `script.apply` still reports a
  script's `record`/`sample load`/`page` settings — the app performs them, not you.

So from Node you may WRITE a song that references a recording (`sample BRK02` on a
`track` line, or via `track.set`/`pad.set`), and you may not bring the audio
itself. That is the same line as everything else here: describe and plan freely,
perform in the app.

### If you can drive a browser

In the running app, `window.__tracklet.scene.getScene('tracker')` exposes the
scene: `scene.song`, `scene.scriptPanel.open(source)` and
`scene.scriptPanel.applyButton.enabled` let you paste a script and read back
whether it parses before applying it.

The same hook carries the whole **instrument catalog** as data:

```js
window.__tracklet.catalog
// { format, version, waves[], knobs[], families[], voices[], chips[] }
```

Every waveform (with its label and a line on what it is for), every knob (both
named ends, its aliases and its blurb), every family, every built-in voice (with
its full params) and every console profile (with its per-channel roles) is in
there — so "what voices are there, and which are leads?" is a question you ask
the running app rather than guess at from a file. It is generated from the
engine's own tables, so it cannot list a voice that does not exist.

### If you can only reason

You cannot hear the result, so lean on structure instead of taste:

1. **Parse it by hand** against the checklist in section 4.
2. **Count** `tracks`, `patterns` and notes; confirm each channel appears at least
   once.
3. **Check the registers** — read every pitch's octave column and confirm bass is
   below harmony is below lead.
4. **Check the form** — every pattern you reference exists and is non-empty.
5. **Say what you are unsure about.** "The bass is in octave 2 as intended; the
   lead's final note is an octave above the rest and may be piercing" is more
   useful than silence.

---

## 7. Musical defaults that reliably work

These are not rules, they are the settings that produce something listenable on
the first try.

| Decision | Safe default |
| --- | --- |
| Tempo | `120` |
| Key | A natural minor (`A B C D E F G`) |
| Melody scale | A minor pentatonic (`A C D E G`) |
| Channels | `tracks 4` |
| Voices | `1 lead`, `2 bass`, `3 pad` (with `hold 4` if you want the chord to ring), `4 hat` — chosen by the channel's job |
| Swing | `45`–`60` for anything with repeated short notes (hats, bass, a plucked lead); `0` for pads and held chords |
| Channel levels | Lead `100`, bass `60`–`70`, chords `40`–`55`, kick/snare `70`–`85`, hats `25`–`40` |
| Waveforms | Only if you want a specific colour of a voice you already picked; the defaults are `1 square`, `2 triangle`, `3 sawtooth`, `4 sine` |
| Knobs | Leave them off unless a voice is close but not right; then move ONE of `bright`, `sweep`, `duty`, `noise`, `attack`, `decay`, `ring`, `release`, `thick` by 20–30, not all of them |
| Bass octave | `2`, root notes, one note per beat (steps 0, 4, 8, 12) |
| Harmony octave | `3`–`4`, one chord tone per beat |
| Lead octave | `5`, at most 8 notes in 16 steps (one per two steps) |
| Percussion | one channel per drum (`voice kick` / `snare` / `hat`), octave `6`, short high notes on offbeats (steps 2, 6, 10, 14) — or ONE kit channel with `drum` words (`kick . hat .`) when the part is a beat rather than a line |
| A drum kit on one channel | `kick . snare .` in a grid row, or `drum 0 1 kick` per cell; the four words are `kick`, `snare`, `hat`, `wind`. A roll is `hat*3`, a soft hit `snare~70` |
| Which drums those hits are | omit it (`studio`, the presets) unless the genre wants a set: `kit 808` for hip hop and trap, `kit brush` for jazz and soul, `kit rock` for anything loud. A USER's kit is named the same way (`kit MYHOUSE`) and plays the presets on a machine that does not have it |
| Density | never every channel on every step |
| Grid length | omit `steps` (16 = one bar); `steps 32` when a phrase needs two |
| Resolution | omit `beat` (4 steps per beat) |
| Session settings | omit them all; add `hear on` for a learner, never `solo` in a handover |
| Arpeggio / strum | `chord ROW TRACK CHORD arp up 8` on a channel with `hold 1` (a run) or `hold 4` (a strum), when a part needs to MOVE; one direction per song, not two |
| A figure across a bar, or a part moved an octave | `rows 0 to 3 repeat 4` when a four-row figure should fill the bar, and `rows 0 to 3 octave up` when the second half of a phrase should answer the first an octave higher — one statement, not four rows retyped |
| A drum roll, or any hit that should buzz | `rows 12 to 15 roll` rolls every hit in those four steps (a `*4` on each at once), `rows 12 to 15 roll 6` for a tighter buzz — the fill, not the beat; write the hits first, then roll the range |
| A chord on one channel | `track N poly 3` (or `poly 4` for a seventh) `hold 4` above the rows, then one cell per chord: `C-4,E-4,G-4`. Prefer this over three channels whenever the chords are one instrument — it keeps the voicings together and the mix three faders lighter |
| Something to begin from at all | `start house` / `start lofi` / `start ballad` / `start rock` / `start emo` / `start vaporwave` / `start synthwave` / `start shoegaze` / `start dnb` — a whole skeleton in one line, then change the loop, the drum figure and the arrangement's repeats. Never hand-write forty lines of setup when the genre is one of these. |
| A chord loop under the whole song | `progression` + two followers: `progression 1 6 3 7` (in the song's key, four steps each), `chord 0 1 follow` on a `poly 3` keyboard channel, `note 0 4 follow` on a `voice bass` channel — one line per part instead of sixteen bars of stacks |
| How long each chord of that loop lasts | omit `hold` (4 steps: four chords to a 16-step bar); `hold 8` for a slow song, `hold 2` for a fast turnaround |
| A note that bends | `A-4^2` when a note should arrive from below (an emo bend, a horn leaning in) and `A-4v2` when it should leave downward (a dive, a tape stopping) — 1–12 semitones, two by default. One note in the phrase, never every note |
| Articulation | omit it until a part needs it, then ONE gesture where it tells: `A-1>` on the bass note that changes chord (the 808 arrival), `A-1*3` on a hat that should buzz through a bar. Never both on every note — a gesture everywhere is a texture, and the grid already has waves for that. |

A concrete four-chord bar in A minor that satisfies all of the above is Example 1
in [`06-examples.md`](06-examples.md). Start from it.

---

## 8. Generating rather than typing

For anything with a loop in it — a scale run, a repeating figure, twelve bars of
the same shape — write the *program*, not the text, and print the grid rows. The
language has no loops precisely because the caller has them.

```ts
// A bass line alternating root and fifth: the pattern, not one line per step.
const chords = ['A-2', 'A-2', 'F-2', 'F-2', 'C-3', 'C-3', 'G-2', 'G-2'];
const STEPS = 16;                          // must match the `steps` below
const rows: string[] = [];
for (let step = 0; step < STEPS; step++) {
  const beat = Math.floor(step / 2);       // two steps per chord
  const bass = step % 2 === 0 ? chords[beat] : '.';
  rows.push(`${bass} . . .`);              // 4 channels, one line per step
}
const source = [
  'new', 'song "GENERATED"', 'tempo 120', 'steps 16', 'tracks 4',
  'track 1 "LEAD" voice lead', 'track 2 "BASS" voice bass',
  'track 3 "PAD" voice pad hold 4', 'track 4 "HAT" voice hat',
  'pattern 1 "A"', ...rows,
].join('\n');
```

**Generating a longer phrase is the same loop with a bigger `STEPS`** — the
`chords` table is what has to grow, not the code. That is the whole reason the
language has no loops: writing the loop outside is clearer than writing it
inside.

Two habits that keep generated music from sounding generated:

1. **Break the loop on purpose.** After generating, replace two or three cells by
   hand — a rest in the lead, a note an octave up in the bass. Regularity plus one
   irregularity is what "composed" sounds like.
2. **Generate the grid, choose the harmony.** Chords, register and density are
   decisions worth making deliberately; the identical lines underneath them are
   not.
