# 03 — Tracklet Script reference

Tracklet Script is a text notation for a whole song. It exists so that music can
be **written by something other than a hand** — a generator, a shell script, a
language model — and so that a human can see exactly what that thing intended.

The language has **fifty-one command words** and one concept (the grid row). It
is deliberately not a programming language: there are no variables, loops,
expressions or nesting. A script is a recipe, and the expressive part is the
music, not the syntax.

It is also **complete**: every property of a song that the app can change, a
script can set — its length, its resolution, its tempo, its feel, its channels,
their SOUND (a named voice, a waveform and nine knobs), their level in the mix,
their place between the speakers and their mutes, the song's room, its patterns,
and its notes. And because a script usually gets
handed to a person who then keeps working, it can also set the settings that
travel BESIDE the song: the master volume, the octave, which channels are soloed,
whether one key writes a chord, whether notes are auditioned as you move, and
which theme the app wears.
[Section 9](#9-what-a-script-can-control) is the complete table, including the
handful of things a script deliberately leaves alone.

---

## 1. The shape of a file

A script is a sequence of **lines**. Each line is one of:

1. **blank** — ignored;
2. a **comment** — `/^\s*[#/]/`;
3. **a grid row** — a line whose first word is not a command word; and
4. **a statement** — a line beginning with one of the fifty-one command words.

Whitespace between tokens does not matter; line breaks do. **There is one
statement per line** and no way to continue a line.

### Comments

`#` and `//` start a comment that runs to the end of the line, outside a quoted
string. `//` may follow a token directly; a `#` must **begin** a token — at the
start of the line or after a space:

```
tempo 128          # a comment
tracks 4           // another comment
song "A # 1 HIT"   # the # inside the quotes is part of the title
C#4 D#4            # sharps: a # inside a token is an accidental, not a comment
```

That last rule matters. `C#4` is the note a semitone above `C-4`, so a `#` glued
to a letter is an accidental and nothing else. Write the space before a comment
and both readings are always what you meant.

### Quoted strings

Double quotes hold a phrase together as one argument and are removed in the
process. Inside quotes, spaces and `#` are literal and `//` is literal (because
the quote state is tracked when comments are stripped):

```
song MY TUNE            -> title: "MY TUNE"      (two words joined)
song "MY TUNE"          -> title: "MY TUNE"      (the same)
track 1 "LEAD GUITAR"   -> name:  "LEAD GUITAR"
```

A quote character cannot appear inside a quoted string.

### Case

**All command words are case-insensitive.** Note names are case-insensitive.
Track and pattern names are upper-cased for you (`track 1 lead` names the
channel `LEAD`).

---

## 2. Grid rows

A line whose first word is **not** a command word is a **grid row**: one step of
music, one token per channel, left to right.

```
A-4 A-2 E-4 C-6
C-5 .   .   .
.   .   .   .
```

**How it works:**

- The row written is the **row cursor**: 0 for the first grid row after a
  `pattern` statement, then 1, 2, 3… Each grid row advances it by one, whether
  or not it contains any notes. **That is how rests are written** — the line
  `. . . .` consumes a step.
- Column order is channel order: the first token is channel 1, the fourth is
  channel 4.
- A line may have **fewer** tokens than there are channels; the missing columns
  are simply left empty. It may not have **more**.
- **How many grid rows may follow** is the pattern's length: `steps` steps,
  which is 16 unless the script says otherwise and at most 512. The 17th grid row
  of a sixteen-step pattern is an error, not a silent wrap-around.

**Empty tokens.** Any of these means "leave this cell alone for this step":

```
.    ..    ...    -    --    ---    _
```

`...` is what the in-app grid prints for an empty cell, so it is the friendliest
choice; `.` is what the examples use. They are interchangeable.

**Pitch tokens.** A letter `A`–`G`, an optional `#` or `b`, an optional `-`
separator, and an optional octave digit:

| Written | Means |
| --- | --- |
| `C-4` | C in octave 4 (MIDI 60, middle C) |
| `C4` | the same note |
| `C#4` / `Db4` | the black key above it (MIDI 61) |
| `A-4` | MIDI 69, concert A |
| `C` | middle C of whatever `octave` is currently set to |
| `C-8` / `C-0` | the edges of the playable range |

A bare letter with no octave takes the **current default octave** — set by the
`octave` statement, 4 at the start of a script. Explicit octaves always win, and
mixing the two in one file is normal and encouraged: write explicit octaves in
grid rows (a grid row can contain notes in several octaves) and use `octave`
only when you want a run of bare letters.

**How hard a note is hit.** A pitch may be followed by `~` and a **velocity**,
0–100 — the force that one note is played at:

| Written | Means |
| --- | --- |
| `C-4` | full force (100) — what every note was before velocity existed |
| `C-4~40` | a soft, held-back note |
| `C-4~90` | a slightly accented one |

Velocity is the one property that can differ from **note** to note. `hold`,
`level` and `pan` all belong to a CHANNEL, so every note on a channel is played
the same way; velocity is what turns a flat run of hats into a groove:

```script
tempo 120
pattern 1 "ACCENTS"
C-4~100 . . .
C-4~40  . . .
C-4~70  . . .
C-4~40  . . .
```

`~0` is allowed and makes the note silent: the step still holds the pitch and the
grid still shows it, the same bargain `level 0` makes for a channel. A note
nobody accents is at 100, so every script written before velocity existed plays
exactly as it always did.

**How a note is PLAYED.** After the pitch, before or after the `~velocity`, one
or two **articulation** characters say what the note *does* rather than what
pitch it is:

| Written | Means |
| --- | --- |
| `C-4>` | slide INTO this note, from whatever this channel played last |
| `C-4*3` | hit it three times inside its own step |
| `C-4!` | FLAM it: one grace hit leaning into the beat |
| `C-4!!` | DRAG it: two grace hits |
| `C-4^2` | SCOOP: start a whole tone below the pitch and rise onto it |
| `C-4v3` | FALL: hold the pitch, then drop three semitones away over its tail |
| `C-4>*3` | both: arrive at the pitch, then stutter |
| `C-4^2*3~40` | a scoop, three hits, at velocity 40 (`C-4~40*3^2` is identical) |

A `>` is the channel's own `glide` turned up to the whole note, aimed at one
note: it is the 808's low note bending up into the next one, a pedal steel, a
singer arriving at a pitch rather than hitting it. A `*N` is N hits inside the
step, `2`–`8`, evenly spaced and at the same force, and the hits tile the note
exactly — the last one still ends where the note would have ended, which is what
makes a stutter a roll rather than a tempo change.

A `!` is a FLAM and `!!` a DRAG: one or two GRACE hits just before the beat, with
the main hit still exactly on it — the soft front of a rock snare or a brush
snare, and most of what makes a drum sound hand-played. They are written with a
character rather than a word because a letter would collide with a note name;
where an articulation is its own value (a `note` or `drum` line) the words `flam`
and `drag` are also accepted. A grace and a stutter fill the same instant two
different ways, so a note takes one or the other, never both.

A `^N` is a **SCOOP** and a `vN` a **FALL**: the note bends its OWN pitch by `N`
semitones, 1–12, and **two** if the count is left out (`C-4^` is `C-4^2`). A scoop
starts the note `N` semitones BELOW its written pitch and rises onto it — an emo
bend, a pedal steel, a horn leaning into a note — and a fall holds the pitch and
then leaves it, over the note's tail, which is a whammy dive or a tape stopping.
The `^` points up and the `v` down, and each is the gesture its arrow suggests;
bending UP away from a note or DOWN into one is the same shape heard backwards,
which is why there are two characters rather than four. A bend is not a `>`
slide: a slide comes from the pitch the channel played BEFORE, which is a
relationship between two notes, and a bend moves the one note's own pitch — so a
scoop and a slide cannot both be written (a note arrives one way), while a fall
rides along with either, because leaving is a different decision from arriving.

```script
track 1 "BASS"  voice bass hold 1
track 2 "HATS"  voice hat hold 1
A-1>   A-1*3
A-1    A-1*3
A-1>   A-1*3
A-1    A-1*3~40
```

There is one order and no halfway: a note slides or it does not, and a stutter is
2 to 8 hits or it is a plain note. `*1` and `*9` are refused with the reason
rather than rounded to something playable, because a note that asked to be played
a certain way and was played plainly is a difference the author cannot hear. `>`
and `*` may be given in either order and at most once each, so `>*3` is also
`*3>`; two of either is an error.

**A chord in ONE cell.** Pitches separated by **commas** are one cell holding
several notes — a chord that costs one channel rather than one channel per note:

| Written | Means |
| --- | --- |
| `C-4,E-4,G-4` | a C major triad, all at the same step, on ONE channel |
| `C-4,E-4,G-4~40` | the same, played softly — the force belongs to the CELL |
| `C-4,E-4,G-4>*3` | the same, arriving and then hit three times — one cell, one gesture |
| `C-4,C-4` | one note: a pitch named twice is named once |

A comma rather than a space, because a space is what separates one **column**
from the next: `C-4 E-4 G-4` is three channels each holding a note, and
`C-4,E-4,G-4` is one channel holding three. Up to **8** notes fit in a cell, which
is the same ceiling a channel has.

```script
track 1 "KEYS" poly 4
C-4,E-4,G-4 . . .
F-4,A-4,C-5 . . .
```

**A chord needs a channel wide enough to sound it.** A cell is one *event*, so its
notes are heard together or not at all — a channel that holds one note at a time
would play the top of that triad and drop the other two in silence. Writing a
chord on a channel narrower than the chord is therefore **refused**, with both
ways out in the message:

```
tracks 1
C-4,E-4,G-4          # -> this cell holds 3 notes, but channel 1 sounds 1 at a time.
                     #    Write "track 1 poly 3" above this line to widen it, or
                     #    spread the chord across channels with "chord 0 1 …".
track 1 poly 3
C-4,E-4,G-4          # the same line, now a triad
```

The `track … poly` line is read as of **where it is written**, like `tracks`:
above the chord it widens the channel, below it, it is too late. See `poly` under
`track` for the channel side of the same setting.

**The `chord` tool, and the cell.** `chord 0 1 Am` puts a chord on a row, and
where it puts it depends on the channel's width: on a channel that holds the whole
chord (`poly 3` for a triad, `poly 4` for a seventh) the notes land in **one
cell**, and otherwise they **spread across the channels after the root** — one
note each, which is how a tracker has always written a chord and what every script
written before `poly` meant. Neither is a surprise in a file: the width is written
in the same script.

```
tracks 3
chord 0 1 Am            # 69, 72 and 76 land on channels 1, 2 and 3
track 1 poly 3
chord 0 1 Am            # the same three notes, in cell 1 of row 0
```

**A drum hit.** A cell can also NAME a drum instead of a pitch — the sound is the
word, and the note beside it is the kit's own:

| Written | Means |
| --- | --- |
| `kick` | a kick drum (MIDI 36) |
| `snare~70` | a snare, played softly — the force belongs to the HIT |
| `hat*3` | three hat ticks inside one step — a trap roll |
| `wind` | a hiss, for a build-up or a breakdown |

The four words are `kick`, `snare`, `hat` and `wind`, and they are a **closed
list**: any other word is refused by name. Because a hit NAMES its sound, a whole
kit can live on **one channel**, written as words rather than as pitches nobody
can hear:

```script
tracks 1
track 1 "DRUMS" voice hat hold 1
kick
.
snare
.
kick
kick
snare
hat*3
```

The grid prints `KCK`, `SNR`, `HAT` or `WND` in a cell, so a beat reads as words.
A hit is one thing: it holds no chord, a note written over it takes it off, and
it has no pitch to move — `rows 0 to 3 octave up` leaves the drums where they are.
WHICH four patches those hits play is a choice of the whole song, made once with
[`kit`](#kit-name--which-four-patches-the-drums-play) — the same beat, a different
set of drums.

Words are a way to READ a beat. To SEE one, put the cursor on the kit channel and
press **`F8`**: the pattern panel turns into four LANES, one per drum, with a hit
a mark in its own lane and the same `...` an empty step always shows in the other
three. A click in a lane writes that hit on that step — the mouse's `drum` line,
one undo step — and a right-click takes that hit back out. It is a view and
never an edit to the song itself: no undo step of its own, nothing saved, and `F8`
again is the note grid.

---

## 3. Statements

### `new` — start from nothing

```
new
```

Resets the song being built to a blank one: one empty 16-step pattern, four
channels, four steps per beat, 120 BPM, title `UNTITLED SONG`, key `C major`.
Everything before
it is discarded;
everything after it is written onto the blank song. Nothing is written until
APPLY, so `new` cannot destroy anything you have not asked to lose.

`new` takes no arguments. The default octave returns to 4 and the current
pattern to 1.

### `start NAME` — begin from a whole worked skeleton

```script
new
start house
```

Begins from a **genre starter**: a whole working skeleton — key, tempo, feel,
kit, named channels with the right sounds on them, a drum figure, a chord loop and
a form — which you edit instead of inventing. The nine are:

| Starter | What it is |
| --- | --- |
| `start house` | 124 BPM, four on the floor, an 808 kit, a one-bar `Am F C G` loop, a drums-only break, and a form that repeats the loop into a 52-bar track. |
| `start lofi` | 78 BPM, laid back and swung, brushed drums, seventh chords on a wide channel wearing `tape 40` under `master tape 25`, and an `Am7 Dm7 Fmaj7 Cmaj7` loop that repeats rather than moves. |
| `start ballad` | 72 BPM, a piano and strings over `Am F C G` held a bar each, a hand-written bass under them and a melody above. |
| `start rock` | 140 BPM, a live kit, and a rhythm guitar that is one WALL rather than a part: driven, cabbed power chords written by the loop, an eighth-note root bass, and a chorus that opens up. |
| `start emo` | 96 BPM, brushed drums swung a hair, and a tapped arpeggio on a channel that holds, so the notes ring over each other — the midwest-emo twinkle, with a bass walking the loop. |
| `start vaporwave` | 62 BPM and half time, so the bar breathes twice as slowly: major-seventh chords on a wide pad (`tape 30`, under `master tape 25`), a sub bass under them and a bell melody drowning in reverb. |
| `start synthwave` | 108 BPM, four on the floor, a chorus-wide string pad under the loop and a pluck arpeggio climbing over it — the night-drive, and the channel setup most of it comes from. |
| `start shoegaze` | 88 BPM and a wall rather than a part: driven, cabbed, chorused strings holding major-seventh chords, a slow kit, and a glass melody sitting inside the noise. |
| `start dnb` | 174 BPM and a broken beat — a kick that is never on 1 twice the same way, a snare on the back, a gated stab and a sub bass under a long reverb trail. |

**A starter is a script, not a preset.** `start house` expands into the starter's
own lines, right where the line is, so everything after it — and the summary, and
the file — describes a song written in this language and nothing else. Two
consequences worth knowing:

- **It begins with `new`**, so `start house` REPLACES the song rather than adding
to it. The lines above it are discarded, exactly as a `new` line discards them,
and a file's meaning never depends on what happened to be on screen.
- **The lines BELOW it are read against the shape it wrote.** `start house` makes
six channels and a one-bar pattern, so a grid row of six tokens and a line naming
channel 6 are checked against THAT — which is why a starter is a beginning rather
than a block of settings.

**One starter writes a session setting**, and it is worth knowing which: `start
ballad` says `octave 3` before its followers, so the strings and the piano land in
the register a ballad wants — and the octave you type in moves with them. It is
there because the octave a FOLLOWERS writes at comes from the script rather than
from the line, which is the same rule `chord 0 1 Am` has always followed. The
other eight starters write nothing but song.

**What to do with one:** change something. `tempo`, a voice, a drum hit, the
loop, the arrangement — every line a starter carries is an ordinary statement, so
it can be overridden by a later line, edited in the grid, or un-done. The whole
skeleton can also be READ: press `start house`, then `F2 → SAVE AS SCRIPT`, and
the skeleton prints out as the lines it is made of. That is the fastest way to
learn what this notation does in a genre you have in mind.

**`F2 → STARTERS…`** does the same thing by hand, one row per starter, and a
starter brings no file format with it: a song that began from one saves as the
version its own features need.

### `song "TITLE"` — name the song

```
song "MIDNIGHT TOWER"
song MIDNIGHT TOWER
```

Everything after the word becomes the title, upper-cased. Shown in the header
bar, where **shift-clicking the title** does the same edit by hand — same field,
same undo step, same 32-character ceiling, which is all the room the bar has
before the title would run into the app's tagline.

### `key D minor` — say what key the song is in

```
key D minor
key Dm                 # the same thing, without the space
key C                  # a bare note name is a major key
key F# major
key A harmonic minor
key Eb dorian
key D mixolydian
key E phrygian
key A blues
key G pentatonic
```

A tonic — any note name, with `#` or `b`, and no octave — then one of eight
scales. They are shown on screen as `MAJOR`, `MINOR`, `HARMONIC MINOR`,
`DORIAN`, `MIXOLYDIAN`, `PHRYGIAN`, `BLUES` and `PENTATONIC`, and the KEY
control in the transport cycles the same eight, so the notation and the mouse
cannot drift apart. The three in the middle are the ones a GENRE needs:
`mixolydian` is major with a flat 7th (blues-rock, funk, shoegaze),
`phrygian` is minor with a flat 2nd (flamenco, metal, the dark end of emo), and
`blues` is the minor pentatonic plus the flat 5th — the passing note every rock
solo leans on.

**Nothing is locked, snapped or refused.** The key changes no note you write and
the audio engine never asks about it. What it changes is what the app SHOWS:

- The **piano** draws the notes that belong to the key normally and pulls the
  rest toward the background, with the tonic marked — seven keys standing out of
  twelve is the whole answer to "which notes go together".
- The **cell inspector** adds `NOT IN D MINOR` when the note under the cursor is
  outside the key.
- The **KEY control** displays it, and two steppers and a button set it by hand.

Why the grid does *not* dim out-of-key notes: because most real music has some.
The example songs in `scripts/` — written by ear — run between 5% and 18%
out-of-key notes, from sevenths, borrowed chords and passing tones. An app that
painted those as mistakes would be wrong about `A7`, and about most music you
have ever heard.

### `tempo N` — set the speed

```
tempo 128
```

One number, 40–300, rounded to a whole BPM. A step lasts
`60 / (bpm × beat)` seconds. Anything outside the range is an **error**, not a
clamp, because a silently wrong tempo is worse than a refusal.

### `tempo N at BAR` / `tempo N by BAR` — change speed mid-song

```
tempo 160 at 5      # from bar 5 on, the tempo IS 160 — a step
tempo 90 by 9       # lean down to 90 as bar 9 arrives — a slide
```

A tempo change, said two ways. **`at`** changes on the bar: bar 5 is the first
bar at the new speed, and everything before it keeps the old one. **`by`** leans
*into* the bar: the tempo walks evenly from the previous change to this one, so a
slide to 90 by bar 9 is halfway to 90 at bar 5. That is the difference between
the two things people actually ask for — "the chorus is at 140" and "slow down
into the ending" — in one word.

`BAR` is a slot of the order, 1–64, **the same number `order` uses**, not a step
number. So a song `order 1 2 1 2` has four bars, and `tempo 90 by 4` leans into
its last one. Before the first change the song runs at its plain `tempo`, which
is why a single `by` is a lean from bar 1 rather than a jump.

Worth knowing:

- **One change per bar.** Saying the same bar twice is a change of mind — the
  later line wins — not two changes.
- **A ceiling of 32 changes.** More than that is refused with a line number,
  because a runaway generator should hear about it rather than have its last
  changes quietly dropped.
- **The change travels in both files.** A tempo map is part of the song: it is
  written into a saved script as `tempo N at/by BAR` lines and into a song file
  as a `tempoMap`, and it exports into a WAV at the speed it plays.

```script
new
song "FASTER IN, SLOWER OUT"
key A minor
tempo 120
steps 16
beat 4
order 1 1 1 1
tracks 2
track 1 "LEAD" voice lead
track 2 "BASS" voice bass level 60

tempo 160 at 2      # the chorus arrives at bar 2
tempo 90 by 4       # and the song leans down into bar 4

A-4 A-2
C-5 .
E-5 E-3
A-4 .
A-4 A-2
C-5 .
F-5 F-3
C-5 .
```

### `steps N` — how many steps a pattern has

```
steps 16      # the default: one bar of 4/4 at four steps to the beat
steps 32      # two bars
steps 64      # four bars — a whole melody fits
steps 512     # the maximum
```

One whole number, 1–512. **The default is 16**, so a script that never mentions
`steps` behaves exactly as it always did.

Every pattern in the song shares one grid, so this resizes **all** of them:
growing pads patterns with empty steps, shrinking trims the tail off every
pattern. Notes that no longer fit are lost, so decide the length before writing
the music when you can.

Where it goes: near the top, with `tempo` and `tracks`. It may also be changed
between sections — `steps 64` before a long verse, `steps 16` before a short
chorus — but remember that it is one number for the whole song, so the later
value wins.

### `beat N` — how many steps make one beat

```
beat 4        # the default: 4 steps per beat, so a 4/4 bar is 16 steps
beat 8        # 8 steps per beat: a bar is 32 steps, so 16 steps is half a bar
beat 2        # 2 steps per beat: a bar is 8 steps, so 16 steps is two bars
```

One whole number, 1–16. It is **steps per beat**, so it sets both how many steps
a bar is and how long a step lasts (`60 / (bpm × beat)` seconds — a beat is
always `60 / bpm`). It changes two visible things and one audible one: the grid's
beat-emphasis lines, how many steps a bar is, and the speed of the grid. It does
**not** change which step a note is on.

| `beat` | A 4/4 bar is | A 16-step pattern is | A step at 128 BPM |
| --- | --- | --- | --- |
| `2` | 8 steps | two bars | 0.234 s |
| `4` (default) | 16 steps | one bar | 0.117 s |
| `8` | 32 steps | half a bar | 0.059 s |
| `16` | 64 steps | a quarter bar | 0.029 s |

So `beat` is a resolution control, not a length control: raising it packs more
steps into the same time, which is how you get thirty-second-note detail or a
four-bar phrase inside one 64-step pattern. If all you want is a longer bar, use
`steps` and leave `beat` alone.

### `grid NAME` and `meter B U` — the bar, said in note values

`steps` and `beat` are exact and unreadable. These two words are **sugar over the
same pair**: each works out a `steps`/`beat` pair and writes it, so everything
below the language — the engine, the renderer, the file — keeps seeing two plain
numbers.

```
grid 16       # sixteenth notes: 16 steps, 4 to the beat — the default
grid 8t       # eighth-note triplets: 12 steps, 3 to the beat (a shuffle)
grid 32       # thirty-second notes: 32 steps, 8 to the beat
meter 4 4     # the same as the default: 16 steps, 4 to the beat
meter 3 4     # a waltz: 12 steps, 4 to the beat
meter 7 8     # seven eighths to the bar: 14 steps, 2 to the beat
meter 6 8     # a jig: 12 steps, 2 to the beat
```

A bar is a whole note, and the app's own default grid is sixteenth notes — that
is the anchor both words measure against. `grid` names a subdivision of the bar:
the powers of two `4`, `8`, `16`, `32`, `64` and their triplets `8t`, `16t`,
`32t`, where a trailing `t` puts three where two sat. `meter` reads like a time
signature: a whole number of beats, then the note one beat is (`1`, `2`, `4`, `8`
or `16`).

- **A grid or meter is not a new kind of bar.** It sets the same two numbers
  `steps` and `beat` set, in one word, so a song shaped by `meter 7 8` saves as
  `steps 14` and `beat 2` and reads back identical. There is no `meter` in a file.
- **The last line about the bar wins.** `steps`, `beat`, `grid` and `meter` all
  write the same two fields, so `steps 32` then `grid 16` is a sixteen-step bar.
  Neither sugar word reads the other: `meter` is how you say a bar that is not
  four quarters, and `grid` subdivides one that is.
- **A grid is a bar length too.** `grid 4` makes every pattern four steps long,
  exactly as `steps 4` does, so notes past the fourth row are trimmed.
- **Not every grid exists.** `grid 6` is refused, not rounded: a grid has to come
  out as a whole number of steps with a whole number to the beat, and the message
  lists the ones that do. `meter 7 3` is refused for the same reason.

Where it goes: near the top, with `tempo`, `steps` and `tracks`.

### `swing N` — the feel of the song

```
swing 0        # the default: straight, every step exactly as long as every other
swing 40       # a gentle lift
swing 60       # the shuffle most drum machines call "swing"
swing 100      # as deep as this app goes: a triplet feel
```

A **percentage**, 0–100. Swing pushes every SECOND step of each pair a little
later, by making the step before it longer and the step itself shorter:

```text
straight    |....|....|....|....|
swung       |......|..|......|..|
             step 0  step 1
```

At `swing 100` the first step of a pair lasts a third longer than a step should
and the second a third shorter — which is `long-short`, the feel of a swung
16th, and the same ratio a triplet has. That is the whole idea: **the notes move,
the song does not slow down.** A pair of steps always lasts exactly the same
total time, so the tempo, the bar length and the loop are untouched, and a song
at `swing 100` is still the same length as the same song straight.

What to swing: hats and shakers (the classic), a bassline, a plucked lead. What
not to swing: a pad or anything that holds for a bar — a long note cannot lilt.
Swing is a property of the **song**, like `tempo`, and it applies to every
channel at once: a band that swung only its hats would simply be a band with a
problem.

Swing pairs up steps by their POSITION, so a 16-step bar is eight `long-short`
pairs. Two consequences worth knowing:

- At `beat 4` the pairs are pairs of 16th notes, which is the usual way to
  shuffle a beat. At `beat 8` they are pairs of 32nds, which is a very fine
  shuffle — and probably not what you wanted.
- All patterns share one grid and one feel, and the order plays them back to
  back, so a pattern of an ODD length flips the phase of every later bar. Keep
  `steps` even and the lilt lands in the same place every bar.

### `speed N` — play the whole record faster or slower

```
speed 100      # the default: the song exactly as it was written
speed 80       # a fifth slower and a little lower: the slowed-and-reverbed sound
speed 50       # half speed: twice as long, and an octave down
speed 200      # double speed: half as long, and an octave up
```

A **percentage of the written speed**, 25–400. `speed` is the tape transport:
ONE number that moves pitch and TIME together, because that is what a transport
does — read a reel more slowly and the beat stretches AND the pitch falls, by the
same ratio, since the signal is coming off the medium slower. It is the gesture
behind slowed + reverb, chop-and-screw and a tape-stop, and no combination of the
other words can make it: `tempo` moves time without pitch, `octave` and a bend
move pitch without time, and setting both by hand is two edits that never stay in
step.

The coupling is exact. At `speed 50` every row takes twice as long, so the song is
twice its length and its tempo map, holds, strums and swing all stretch with it,
and every source plays an octave lower — oscillator, recorded key and one-shot
alike. At `speed 100` both halves multiply by exactly one, which is the song every
file written before this plays.

One thing it is NOT: a full resample. A real tape drags the FILTERS and every
tail down with the pitch, and a per-note transform cannot, because a filter is a
property of the channel's sound rather than of the note. What `speed` reaches is
the interval and the duration, which is the part a person hears as "played back at
a different speed".

Like `tempo` and `swing`, `speed` is a property of the **song**: one transport for
the whole record, not one per channel.

### `groove FEEL` — how the song is played

```
groove straight     # the default: every note exactly on its step
groove backbeat     # beats 2 and 4 firm, the rest softer
groove offbeat      # the notes between the beats are the loud ones
groove shuffle      # the offbeat eighths land a third of the way late
groove laid-back    # everything a hair behind the beat
groove pushed       # everything a hair ahead of the beat
groove human        # a tiny, unchanging wobble in every note
```

A **named feel**, where `swing` is a numbered lilt. The two are the halves of one
idea and they COMPOSE: `swing 40` and `groove backbeat` together is a lilted
backbeat, which is a real thing to want.

| Feel | What it does | Reach for it when |
| --- | --- | --- |
| `straight` | nothing at all — the default | almost always; it is where every file starts |
| `backbeat` | beats 2 and 4 at full, the others at 80% | rock, pop, soul: the band leans on 2 and 4 |
| `offbeat` | the notes between the beats at full, the beats at 80% | reggae, ska, house: the upstroke is the point |
| `shuffle` | the offbeat eighth lands two thirds of the way through the beat, and softer | blues, boogie, 60s rock |
| `laid-back` | every note 14% of a step late | soul, neo-soul, anything that should not rush |
| `pushed` | every note 14% of a step early | punk, new wave: urgency without more tempo |
| `boom-bap` | the offbeat eighths later than even a shuffle, AND beats 2 and 4 at full | hip hop, lo-fi: the pocket a sampled break has |
| `swing-16` | the offbeat sixteenths a third of a step late; no weight changes | trap hats, funk, modern R&B |
| `d-beat` | the offbeat eighths a hair EARLY, so the beat leans forward | punk and hardcore: drive without more tempo |
| `human` | each note a hair early or late, and a hair softer, on its own | a part that sounds played rather than typed |

Two things are worth knowing about all of them:

- **A feel is chosen, not dialled.** There is no `groove 60`. The number-shaped
  part of a performance is `swing`; a groove is a decision with a name, the same
  way a voice or a key is. How hard to lean is what per-note `~velocity` is for.
- **A groove can never rewrite the part.** No feel moves a note past the note
after it, and none makes a note louder than it was written — every accent is the
  notes that KEEP their velocity, and the others give way. So a feel can be tried
  on anything without a licence in music theory, and `groove straight` is exactly
  the silence it is on a song that never mentions it.

`human` is **deterministic**: the wobble is computed from the step's position, not
rolled at random, so the same bar comes out the same way in every render and an
exported file is the file you heard. It deliberately does NOT repeat bar to bar —
the same mistake in the same place every time round stops sounding like a player
and starts sounding like a machine with a fault.

```
new
song "TWO IN THE MORNING"
tempo 76
swing 30
groove laid-back
tracks 4
track 1 "KEYS"  voice glass level 80
```

A feel lands the same way in every bar, and by BEAT rather than by step: a
backbeat knows where beat 2 is at `beat 4` and at `beat 8` alike. The bar is
assumed to be four beats, because this app has no meter and four beats to a
pattern is what nearly every song in it is.

### `tuning NAME` — how the twelve notes are spaced

```
tuning equal         # the default: the piano, twelve equal steps
tuning just          # pure thirds and fifths in the song's key
tuning pythagorean   # pure fifths and wide thirds: the medieval sound
tuning meantone      # quarter-comma: pure thirds from narrowed fifths
tuning septimal      # 7-limit: a flat seventh, the blue note
```

Every note here has always been tuned to EQUAL TEMPERAMENT - twelve equal steps
to the octave, the compromise a piano makes so that every key is usable. A
**temperament** is a different answer to that compromise, and it is the one
setting on this shelf that changes no timbre at all: the same instruments, tuned
differently.

| Tuning | What it does | Reach for it when |
| --- | --- | --- |
| `equal` | twelve equal steps - the default | almost always; it is where every file starts |
| `just` | pure thirds and fifths in the home key | sustained chords and pads that should ring |
| `pythagorean` | pure fifths and wide thirds | drones, open fifths, a medieval or folk colour |
| `meantone` | fifths narrowed a quarter-comma so the thirds are pure | Renaissance and early keyboard music |
| `septimal` | 7-limit just: a flat seventh and a harmonic colour | blues, and anything that wants a blue note |

Three things are worth knowing about all of them:

- **It is read against the KEY.** Just intonation is only pure relative to a
  tonic, so `tuning just` in C is pure in C and the same song moved to D is pure
  in D — which is why `tuning` sits beside `key` and not with the voices.
- **The tonic never moves.** Degree 0 of every temperament is exactly where equal
  temperament put it, so a tuning changes the INTERVALS and never the pitch of
  the key note, and every note stays within a quarter tone of where it was.
- **A song that never mentions it is equal-tempered**, which is how every song
  written before tunings existed plays, note for note.

```
new
song "HYMN FOR A COLD ROOM"
key D minor
tuning just
tracks 3
track 1 "ORGAN" voice organ hold 8
```

### `kit NAME` — which four patches the drums play

```
kit studio          # the default: the four presets, dry and even
kit 808             # a long deep kick, a tight crack, a crisp tick
kit brush           # soft brushes: a round kick and a swirling snare
kit rock            # a big live kit that cuts through guitars
kit MYHOUSE         # a kit of YOUR own, saved as a `.kit.json`
```

`drum 0 4 kick` says WHICH drum a step is — a kick, a snare, a hat or a wind — and
`kit` says what those four SOUND like. It is one word for a whole drum set, so a
song can be a drum machine or a jazz trio without a note changing.

Six kits ship with the app:

| Kit | What it sounds like | Reach for it when |
| --- | --- | --- |
| `studio` | the four presets: dry, even, sits anywhere | anything — it is what this app has always played |
| `808` | a long deep kick, a tight snare, a crisp short hat | hip hop, trap, early house, anything whose bass drum should be felt |
| `brush` | a round soft kick, a swirling snare, a quiet long tick | jazz, soul, a ballad, a breakdown where the drums step back |
| `rock` | a punchy kick, a loud snare, a cutting hat | rock, punk, pop: a kit that has to be heard over guitars |
| `metal` | a clicky kick, a biting snare that rings, a thin metallic tick | metal, hardcore, industrial — drums that must cut through distortion |
| `dusty` | a soft thud, a papery snare with no ring, a dull quiet tick | lo-fi, vaporwave and tape-saturated hip hop: drums heard through a wall |

`metal` and `dusty` are opposites on purpose rather than a loud one and a quiet
one: every drum in `metal` has MORE bite and ring than its `rock` counterpart, and
every drum in `dusty` has less, so the pair is a genre choice and not a volume
control.

Any OTHER word names a **kit of your own** — one you saved with `F2 → SOUND
FILES… → SAVE KIT`, or read back with `LOAD KIT…`. A kit of your own is one word
of letters, digits, `-` and `_`, at most sixteen characters, and it may not be one
of the six built-in words. `kit MYHOUSE` in a song whose machine does not have
that kit plays the four PRESETS rather than refusing to open, which is the same
bargain a missing sample makes — see [`09-song-files.md`](09-song-files.md).

Three things are worth knowing:

- **A kit changes the SOUND and nothing else.** Pitches, steps, velocities and
  everything the grid prints stay exactly where they were, so the same beat on two
  kits is the same beat — only the ear can tell which kit a song is on. That is
  what makes it one line rather than a second notation.
- **`studio` is the four presets, and it is the default**, so a song that never
  mentions a kit sounds exactly as it always did, and `kit studio` is the same
  value as saying nothing at all. A song that names another BUILT-IN one is file
  version `26`: an older build would play the right hits through the wrong drums
  and then save them that way. A song that names a kit of your OWN is version
  `29`, because an older build would refuse the name — and would otherwise play
  the presets and save the song onto them.
- **A kit belongs to the SONG**, like `groove` and `tuning`, because a band has one
  drummer. A drum hit's sound is the kit's wherever the hit is — the channel it
  sits on keeps its own level, effects and filter, so a kit channel still mixes
  like the part it is.

### `machine …` — the drum machine

```
machine                                        # turn it on with its default pads
machine level 85 swing 50                       # its own fader and lilt
machine steps 32 beat 4                         # a two-bar machine
machine pads 6 bars 3                           # six pads, three bars
machine bus DRUMS verb 30 duck 40               # group it, soak it, pump with it
machine drive 40 tape 20 off                    # shape it, then silence it
```

`machine` sets up the **drum machine**: a whole instrument of PADS and a step
grid that plays BESIDE the tracker's channels rather than inside one of them. It
is the other half of percussion in this app — `drum 0 4 kick` writes one hit on a
channel, and the machine is where a beat is usually built. A song has at most one,
like a band has one drummer.

`machine pads N` and `machine bars N` say how many pads and how many bars it has,
the two things the machine's own page changes with `+ ADD PAD` / `DEL PAD` and
`+ BAR` / `- BAR`. Growing pads fills in the kit pads a `pad N` line would create;
shrinking drops the last ones and takes their rows off every bar. Growing bars
COPIES the last bar, so a variation starts as the beat; shrinking drops from the
end, and bar 1 is the machine and never goes.

Every setting is optional, and the pairs may be written in any order:

| Setting | Range | Default | What it does |
| --- | --- | --- | --- |
| `level` | 0–100 | 100 | how far forward the machine sits in the mix |
| `pan` | −100–100 | 0 | where it sits left to right |
| `swing` | 0–100 | 0 | the machine's own lilt, over the song's |
| `steps` | 1–64 | 16 | how many steps one bar of the machine holds |
| `beat` | 1–16 | 4 | how many of those steps are one beat |
| `bus NAME` | a group above | none | join a group declared with `bus` |
| `verb` / `echo` | 0–100 | 0 | how much of the machine goes to the room / echo |
| `duck` | 0–100 | 0 | how far it pushes the rest of the mix down |
| an effect | 0–100 | 0 | any of the ten, as `machine drive 40 cab 30` |
| `on` / `off` | — | `on` | play it, or keep it but silence it |

Writing **any** `machine` or `pad` line creates the machine, so `machine` alone is
a machine with its four kit pads and no hits — a place to start. A song with no
machine writes no `machine` key and stays the file it always was; a song WITH one
is file version `37` (or `38` when its machine has more than one bar, or `39` when
one of its pads names a recording).

### `pad N …` — one lane of the drum machine

```
pad 1 KICK  voice kick  pattern "9...9...9...9..."
pad 2 SNARE voice snare pattern "....9.......9..."
pad 3 HAT   voice hat level 35 pattern "5.5.5.5.5.5.5.5."
pad 5 TOM   wave membrane tune -2 pattern "........9......."
```

A pad is one lane: a name, a sound, a place in the mix, and a ROW of hits. The
sound uses the same vocabulary a `track` line does (`voice V`, `wave W`, the nine
knobs), so a pad can be a tom, a clap or a crash and not only the four kit drums.
The first four pads default to the song's kit, so `kit 808` still colours a
machine.

| Setting | Range | Default | What it does |
| --- | --- | --- | --- |
| `N` | 1–8 | — | which pad, addressed the way a channel is |
| `NAME` | ≤16 chars | the kit drum | what the pad is called on the tab |
| `voice` / `wave` / knobs | closed lists / 0–100 | the kit drum | the pad's sound |
| `level` | 0–100 | 100 | this pad's own fader inside the machine |
| `pan` | −100–100 | 0 | this pad's position |
| `tune` | −24…24 semitones | 0 | move the pad's pitch, for a tuned tom |
| `sample NAME` | one word | none | a recording of your own to play, on a `wave sample` pad; `sample none` clears it |
| `pattern "…"` | ≤ `steps` characters | empty | the pad's row of hits |

**The pattern string** is the one new literal in the language, and its alphabet is
its whole grammar:

| Character | Means |
| --- | --- |
| `.` | a rest |
| `1`–`9` | a hit, at that many ninths of full velocity (`9` = 100, `5` ≈ 56, `1` ≈ 11) |

The string may be shorter than `steps` (the tail is rests) but never longer, and a
character that is neither `.` nor `1`–`9` is refused by name. This is deliberately
*not* a second grid: a machine reads top to bottom as pads, and one short line is
one lane.

**A pad can play a recording.** `sample BRK` on a pad names a `.wav` you have
loaded, exactly as it does on a `track` line, and takes effect when the pad's wave
is `sample` — so `pad 2 BRK wave sample sample BRK` is a pad that drops your break
in. A name the app has not loaded is the **fallback**, never an error: the pad
plays the built-in one-shot its `voice` selects, so the song still plays on a
machine that does not have the file.

### `chip CONSOLE` — make the song a console

```
chip nes      # two pulses, a triangle bass and a noise drum — the 2A03
chip gb       # the Game Boy: two pulses, a wave and a metallic noise
chip pce      # the TurboGrafx-16: six channels of pulse, wave and noise
chip snes     # smooth, sustained, sample-flavoured voices
chip gba      # brighter, snappier sample-flavoured voices
chip genesis  # six FM operators, a bright hollower lead — the Mega Drive
chip opl      # six FM operators, a softer brassier colour — AdLib / Sound Blaster
```

One word, and every channel gets the sound that machine is remembered for — the
friendly spellings work too (`famicom`, `gameboy`, `tg16`, `super-nes`,
`advance`, `megadrive`, `adlib`, `soundblaster`). It lays the console's channel line-up over your channels **by
index**, cycling when the song is wider than the machine, so a NES profile on a
four-channel song gives you pulse, pulse, triangle bass, noise in that order.

It sets the channels that EXIST at that point, so write `tracks N` before `chip`
(and before the `track` lines), the same order the language already asks for:

```script
new
song "A CHIP TUNE"
tracks 4
chip nes

A-4 A-3 A-2 C-6
.   .   .   .
```

A chip is a **starting point, not a mode**. It only ever sets each channel's
SOUND — never its name, notes, level or mute — so the very next line can tune one
channel away from the profile (`chip nes` then `track 1 "LEAD" bright 95`). And
because it sets the voices rather than remembering a label, a chipped song saves
and reopens as exactly those voices, with no `chip` field to go stale.

The SOUND it sets is the whole channel, so any **layers** stacked on it go too: a
console says "this channel IS a NES pulse", and a stack left behind would mean the
profile had not actually been applied. Write `chip` above your `layer` lines, as
you would write it above the tuning of those channels.

How faithful each one is, honestly: `nes` and `gb` are pulse-plus-noise machines
and this profile is what the hardware made. The Super NES, the Advance and the
TurboGrafx's wave channel are **sample or wavetable** voices, built from this
engine's `sample` and `table` waves. The Genesis and the AdLib are **FM**
machines, built from the `fm` wave (see below) — six operators each, told apart
by the depth dialled into them rather than by a different wave. None of these
is cycle-accurate; each is the right shape from the tools this engine has, which
is the promise of a profile, and the docs say so rather than pretending a sine
is a Snes sample.

### `reverb N` / `echo N` — the room the song is played in

```
reverb 40     # a hall behind the band
reverb 0      # the default: bone dry
echo 25       # one beat-synced repeat, trailing off
```

Two **percentages**, 0–100. They are the only two EFFECTS in the app, and they
are properties of the **song**, not of a channel: there is one room, every
channel plays in it, and so they sit in the header beside `swing` and `tempo`
rather than on a `track` line.

- `reverb N` — how much of the mix is fed to a short hall. `0` is completely dry
  (which is what every song written before the room existed means), and `100` is
  as soaked as this app goes. A little goes a long way: `20`–`40` is the useful
  range for gluing a band together.
- `echo N` — how much of the mix is fed to a single repeating echo timed to ONE
  beat, so it stays in time when the tempo changes. `0` is off. A delay that did
  not follow the tempo would drift out of the groove, so the echo is defined in
  beats rather than in seconds.

```
new
song "CATHEDRAL"
tempo 92
reverb 55    # a big empty space
echo 15      # and one soft repeat
tracks 3
track 1 "LEAD"  voice bell   pan L20
track 2 "PAD"   voice strings pan R25
track 3 "BASS"  voice bass    verb 0   # the bass stays out of the hall
```

These two set how big the room is and how much of it comes back. **How much of
each CHANNEL goes into it is a different number**, set per channel with `verb`
and `echo` on a `track` line — so one hall serves eight instruments, each of them
in it by a different amount. The bare statement and the track setting are two
scopes of one idea, and the words on the track line are the short ones:

| Write | Means |
| --- | --- |
| `reverb 40` (on its own line) | how much of the hall comes BACK: the song's room |
| `verb 40` (on a `track` line) | how much of THIS channel goes IN |
| `echo 25` (on its own line) | how much of the echo comes back |
| `echo 25` (on a `track` line) | how much of this channel is fed to it |

A dry room is what a song is made of, so a song that never asks for one says
nothing about it and stays byte-for-byte identical to the file this app wrote
before the room existed. `reverb` and `echo` are clamped into 0–100, and a value
outside it is refused with the range and the value it saw.

### `master [EFFECT P]…` — the effects on the whole mix

```
master drive 20             # the tape the band was printed to
master drive 20 tilt 15     # ...a little more top on the way out
master punch 30             # the whole record jumps a bit
master drive 0 crush 0      # back to a clean mix (0 is off)
```

The **same effect words a `track` line takes** — `drive`, `crush`, `cab`,
`tape`, `radio`, `vinyl`, `chorus`, `punch`, `tilt`, `gate` — with the same range `0`–`100`,
at the other end of the same graph. One word, two scopes, and nothing new to learn: a
channel's drive is a guitar amp, the master's is the tape everything was printed
to.

- It is a statement of its own, like `reverb`, because it belongs to the SONG
  rather than to a channel. A value outside 0–100 is refused with the same
  sentence a `track` line uses, and a word that is not one of the effects is refused
  with a message that names the two statements people usually meant (`track 1
  "PAD" verb 40` for a send, `reverb 30` for the room).
- **A line naming one effect leaves the others alone**, exactly like a `track`
  line: `master drive 20` on a mix that already has `tilt 15` keeps its tilt.
- **`0` is off, and a clean mix is invisible.** A song that never writes a
  `master` line is built through exactly the graph it was built through before
  this line existed, writes no `master` key and stays at format version 12 — so
  every song already in the app sounds, and saves, as itself.
- **`gate` is the one that is not a node.** Like a channel's, it is arithmetic on
  a note's length, so the mix's gate and each channel's own COMPOUND: every stage
  shortens the note by its own amount, and `100` on both is a sixteenth of a note.
- **Where it sits:** the mix's effects are the last thing the band goes through
  before the room, so the room and its limiter are still the end of the chain — a
  driven mix is held under the same ceiling every other song is. Each channel's
  `verb`/`echo` send is that channel's own decision, so the room is fed as it
  always was.

```
new
song "GLUE"
tempo 118
tracks 2
master drive 18 tilt 12

track 1 "LEAD" voice lead drive 35

track 2 "BASS" voice bass

pattern 1 "A"
D-5 .   .   .
.   .   .   .
F-5 .   .   .
.   .   .   .
A-5 .   .   .
.   .   .   .
F-5 .   .   .
.   .   .   .
D-5 D-3 .   .
.   .   .   .
C-5 C-3 .   .
.   .   .   .
D-5 D-3 .   .
.   .   .   .
A-4 A-2 .   .
.   .   .   .
```

### `automate TRACK TARGET FROM TO bars A to B` — move a value over bars

```
automate 2 bright 15 95 bars 8 to 15   # a build: 8 bars of filter opening
automate 5 level 0 100 bars 1 to 4    # a fade-in over the first four bars
automate 3 gate 0 90 bars 9 to 16     # the last section tightens
automate 1 thick 20 80 bars 1 to 1    # one bar: a set, not a walk
automate 3 drift 10 90 bars 8 to 15   # a worn tape that tires as the song goes
```

A **lane**: one value that MOVES, instead of a value that simply is. Everything
else in this language says what a channel sounds like; this says WHEN it changes,
which is the difference between a loop and a record — the riser before a drop,
the filter opening across a build, the fade at the end, the pad that thickens as
the chorus arrives. None of those are notes, so no amount of pattern editing can
write them.

`TARGET` is one of twelve words:

| Target | What moves | Range | Bottom → top |
| --- | --- | --- | --- |
| `bright` | the channel's tone | 0–100 | dull → bright |
| `sweep` | its filter movement | 0–100 | still → sweeping |
| `duty` | its pulse width | 0–100 | thin → hollow |
| `noise` | how much hiss is mixed in | 0–100 | tone → noise |
| `attack` | how a note starts | 0–100 | instant → soft |
| `decay` | how it falls to its sustain | 0–100 | flat → plucked |
| `ring` | how much of the note sustains | 0–100 | short → held |
| `release` | how it tails away | 0–100 | clipped → ringing |
| `thick` | how many copies of it sound | 0–100 | one → many |
| `level` | the channel's place in the mix | 0–100 | silent → full |
| `gate` | how much of each note is heard | 0–100 | open → tight |
| `drift` | how far the channel's pitch wanders | 0–100 | steady → wandering |

The first nine move the channel's **voice** — layer 1 — so any layers stacked
above it keep their own settings and the channel keeps its stack. `level`, `gate`
and `drift` move the channel itself, which is why they are in the same list: a
lane's job is to move ONE number you could otherwise only set. `drift` is the
wow and flutter of a worn transport (see the `track` line below), and it is in
this list only because it is a plain VALUE rather than an effect node — the
effects, `pan` and the sends are still refused, because a curve cannot fade in a
node that does not exist at zero.

**The bars are slots of the `order`**, 1-based, the same numbers `order` and
`tempo … at BAR` use — so a lane is written against the song's own form rather
than against a step number nobody counts in. `bars 8 to 15` is eight bars;
`bars 8` is one.

**How a lane is read:**

- Its first step plays `FROM` and its last step plays `TO`, in a straight line,
  evenly across the lane's steps. A one-step lane is a **set** rather than a walk.
- **After its last step it holds `TO`.** This is the rule that makes a lane
  useful: `bright 15 95 bars 8 to 15` means the drop at bar 16 is the bright one
  rather than a snap back to whatever the channel was set to, and a fade to
  `level 0` stays faded. A lane's job is to LEAVE the value somewhere.
- Before the first lane, and on every channel with none, the value is the
  channel's own — which is what keeps a song with no lanes, and the bars before
  the first one, exactly as they were.
- **Two lanes on one channel compose**: the later one takes over where it starts,
  so a rise and then a fall are two lines, and the last line written wins where
  they overlap.

```script
new
song "RISING"
tempo 124
tracks 3

track 1 "KICK" voice kick
track 2 "BASS" voice bass hold 4
track 3 "PAD"  voice pad  hold 4

automate 3 bright 10 95 bars 1 to 4
automate 3 level 20 70 bars 1 to 4
automate 3 bright 95 30 bars 5 to 8

pattern 1
C-3 C-2 C-4
.   .   .
C-3 C-2 .
.   .   C-4
C-3 C-2 C-4
.   .   .
C-3 C-2 .
.   .   .

order 1 1 1 1 1 1 1 1
```

**What cannot be moved, and why.** The effects, `pan` and the two sends are
NOT on the list — a lane that names one is refused with the list above. Each of
them is a NODE in the audio graph, and a node is built only when its amount is
above zero, so a curve starting at nothing would need the graph rebuilt
mid-bar. A value that already exists everywhere (a knob, a level, a note length)
is a different job, and it is the job this does.

**`0` is not a lane.** A song with no lane builds exactly the graph it always
built, writes no `automation` key and no `automate` line, and stays at format
version 12. A song that moves something is written as version `17`, so a build
that predates lanes refuses it in words rather than playing it flat — see
[`09-song-files.md`](09-song-files.md).

### `section NAME BARS…` and `arrange NAME…` — the song's form

```
section VERSE 1 1 2 1
section CHORUS 3 4 3 5
section BRIDGE 6 6
arrange VERSE VERSE CHORUS VERSE CHORUS BRIDGE CHORUS
```

A **section** is a name for a group of bars, and an **arrangement** is the song's
`order` written with those names instead of numbers. That is the whole idea, and
it changes nothing about how the song sounds: `arrange` BUILDS the order, so the
bars that play are exactly the bars an `order` line would have played — sections
are a way of WRITING an arrangement, not a second one.

They exist because a form in numbers is unreadable. Sixteen bars of verse, chorus
and verse again is this:

```
order 1 1 2 1 1 1 2 1 3 4 1 1 2 1 3 4
```

…and with names it is one line a person can check against what they meant. A
section is a LIST OF PATTERN NUMBERS rather than a range of bars, because a
chorus is `3 4 3 5` — three patterns in four bars, with one of them returning —
and a range cannot say that.

**A section may name which BEAT it plays.** `section CHORUS 3 4 machine 2` says
the chorus uses the drum machine's bar 2 — so a verse and a chorus can share one
instrument and still have different beats, without keeping a `machine order`
list in step with the form by hand:

```
machine
pad 1 KICK pattern "9...9...9...9..."
machine pattern 2
pad 1 KICK pattern "9.9.9.9.9.9.9.9."
section VERSE 1 1 2 1 machine 1
section CHORUS 3 4 3 5 machine 2
arrange VERSE VERSE CHORUS VERSE CHORUS
```

The `machine N` key is optional, and a section that omits it leaves the machine's
own `order` to decide that bar. It only bites while the arrangement still
DESCRIBES the order — the same condition the `F3` form view labels bars under —
and a bar past the end of the machine is clamped at play time, so a section may
name a bar 2 before the machine has one and simply play bar 1 until it does.

**A name is one word**, letters, digits, `-` and `_`, up to 12 characters,
case-insensitive on the way in and upper-case on the way out (`section verse` and
`arrange VERSE` are the same section). It has to be one word because an
arrangement is read as a list of them.

**Names are defined for the lines BELOW them.** `arrange` may use any section the
song already has OR any section a `section` line above it has defined — the same
order rule `tracks N` follows, for the same reason: a script is read top to
bottom, and a name nothing has defined yet is an error with a line number rather
than a surprise later.

```
section VERSE 1 1 2 1
section CHORUS 3 4 3 5
arrange VERSE VERSE CHORUS VERSE CHORUS

pattern 1 "V"
C-4 C-2 E-3
.   .   .
C-4 C-2 .
.   .   E-3
```

The bars a section names are PATTERNS, so a section that plays four bars of verse
is four PATTERN numbers — and a pattern that does not exist yet is created, exactly
as `order 2` creates one. `section VERSE 2 2 4` on a fresh song is therefore legal
and points at patterns waiting to be written.

**Rules worth knowing:**

- **A section is a definition, not a change.** `section CHORUS 3 4` on its own
alters nothing you can hear. It is not until an `arrange` line uses it that the
order changes.
- **`arrange` and `order` are two ways to say one thing**, so the last one written
wins. `arrange` also REMEMBERS the form (which section each bar came from), and
that memory is cleared by any later change to the order — by a hand edit in `F3`,
or by an `order` line — because a form is a claim about the order and an edit makes
it a stale one.
- **Writing a name twice redefines it**, the way the last `tempo … at BAR` about a
bar wins: `section CHORUS 3 4` followed by `section CHORUS 3 4 3 5` leaves the
longer chorus, and an arrangement below it gets the new one.
- **`repeat N` plays the section before it N times IN ALL.**
  `arrange VERSE CHORUS repeat 3 VERSE` is VERSE, CHORUS ×3, VERSE — one word for
the shape every song has, rather than a name typed four times:

  ```
  section VERSE 1 1 2 1
  section CHORUS 3 4 3 5
  arrange VERSE CHORUS repeat 4 VERSE
  ```

  The count is how many times the section plays altogether, so `repeat 2` is
  "twice" and not "twice more". `repeat 1` is refused — it is the name on its own
  — and a second `repeat` straight after the first is refused too, because "the
  section before it" stops being obvious when the count is the product of two
  numbers: write `repeat 4` rather than `repeat 2 repeat 2`. It is a MODIFIER on
  an existing statement, not a word of its own, so the language grew no command
  for it and a file stores the arrangement it expands into.
- **A song may name at most 24 sections**, and an arrangement may total at most 64
bars, which is the most a song plays.
- **`F3` shows the form**: each bar of the order wears the section it came from,
as long as the order is still the arrangement that put it there. Press `F3` and the
chorus bars say `CHORUS` — and a section that names a machine bar shows it beside
the name (`CHORUS m2`). In `F3`, `M` (or the `DRUM BAR` button) walks the selected
bar's SECTION through `off` and each bar the machine has, writing the same
`machine N` the script key writes.
- **A song with no sections is unchanged**, in the file and in the app: no key, no
line, no `section`/`arrange` word anywhere, and the same bytes on disk.
- **The summary notices an unused form**, as an observation rather than a mistake:
  a section the arrangement never plays is named, and a song that defines sections
  and then plays a plain order (or whose order was edited by hand) is told that one
  `arrange` line writes the form back.

### `scene NAME CLIPS…` and `live quantize N` — the live set, and how a launch lands

```
scene A 1 1 - 2         # channel 1->pattern 1, 2->1, 3 silent, 4->pattern 2
scene DROP 2 2 2 2 kit 3    # ...and this row also performs drum-machine bar 3
scene BREAK - 3 3 4 kit off # ...while BREAK sits the machine out
live quantize 4         # a launch waits for the next four bars (0 = immediate)
```

A **scene** is one row of the LIVE page's launch grid: the pattern each channel
plays in it, in channel order, or `-` (or `0`) for a channel that is silent. A
scene is a VIEW of the song's own patterns rather than a second arrangement — a
clip is a pattern the song already has — so editing a pattern changes what the
scene plays and nothing is copied.

- **A scene is SONG data.** It is stored, it round-trips through a file (the
  `scenes` array, at file version `41`), and a song with no scenes writes no key
  and no new version. Which scene is PLAYING is not: that is a performance, like
  `solo`, and it never travels.
- **The clips are aligned to the CHANNELS**, one entry per channel. Naming more
  clips than the song has channels is refused; naming fewer leaves the rest
  silent. A `tracks N` line and the `scene` lines read in the order they are
  written.
- **A name is one word** (quote it if it has a space). Defining a name twice
  REPLACES it, the way `section` does, and a song may hold 32 scenes.
- **A scene may carry the drum machine** as an optional `kit N` clause: `kit 2`
  names the bar of the drum machine that scene performs, so one grid carries both
  the channels and the beat. `kit off` (or `none`) is a scene that sits the
  machine out. A scene with no clause leaves the machine to the song's own
  `machine order`, exactly as it did before the column existed. The machine column
  is SONG data and rides the same `scenes` key and file version `41` as the clips.

`live quantize N` says how a launch LANDS: a scene is queued and takes over on
the next N-bar boundary, so a launch lands on the beat rather than mid-bar. `0`
(or `off`) launches at the next step. It is a SESSION setting like `page`, so a
file never carries it — see `page NAME` below.

### `progression CHORD… [hold N]` — the chord loop the song hangs on

```
progression Am F C G          # four chords, one beat each
progression C G Am F hold 8   # the same loop, two chords to the bar
progression 1 6 3 7           # ...and the same shape said in the song's key
progression none              # forget the loop
```

Every other piece of harmony here is written one place at a time: `chord` puts a
stack of notes in a cell. That is the right way to write a BAR and the wrong way
to write a SONG — a three-minute piece is the same four chords under eighty bars,
and eighty hand-written stacks is how a chart drifts a semitone in the second
verse. A **progression** is that loop as an OBJECT on the song: a list of chords,
and how long each one lasts, written once and then played by a channel that
FOLLOWS it.

**Nothing plays it by itself.** Like a `section`, a `progression` line is a
definition, not a change: on its own it alters nothing you can hear. What uses it
are the two followers below, and both of them WRITE notes into cells — so the grid
is still the song, and a channel hanging on a loop is a channel you can edit, count
and export like any other.

```script
new
song "LOOP"
tempo 100
tracks 4
track 1 "CHORD" voice pad poly 3   # one cell holds the whole triad
track 4 "BASS"  voice bass
progression Am F C G

chord 0 1 follow              # channel 1: the loop's chords, in one cell each
note  0 4 follow              # channel 4: the loop's roots, a bass line
```

- **A step is named the two ways `chord` names a chord** — by NAME (`Am`, `F#7`,
  `Bbdim`, `Cmaj7`, `Edim7`) or by scale DEGREE (`1`–`7`, the chord on that step of
  the song's key). A name is absolute; a degree is relative, which is what lets
  `1 6 3 7` mean the same shape in every key. A step IS a `chord`'s third value, so
  the two can never disagree about what `Am` means.
- **A step is ONE word.** `C maj7` is the chord `C` and then a word that is
  nothing, so it is refused — and the refusal spells the joined word back at you
  (`write "Cmaj7" rather than "C maj7"`) rather than listing the shapes.
- **`hold N` says how many STEPS each chord lasts** — the same word and the same
  unit a channel uses for how long its notes ring, so there is one thing to learn.
  It is `1`–`64`, and the default is **one beat** (four steps at the default grid),
  which is the length that fits four chords in one 16-step bar. `hold 8` is two
  chords to the bar; `hold 16` is one chord to the bar.
- **The loop REPEATS**, so a pattern twice as long as the loop plays it twice — no
  `repeat`, and no second `progression` line.
- **A progression is one loop for the whole song.** It is not per-section: a song
  with two changes writes the second one as a `chord` run, or as one longer loop.
- **`progression none` clears it.** A `new` takes it away like everything else,
  and `progression none` takes nothing after it — the rest of such a line would be
  lost, so it is refused rather than ignored.
- **A song may hold at most 16 chords**, which is four bars of one chord per beat.
  Past that, what somebody wants is two sections with two loops, which is what
  sections are for.
- **A song with no progression is unchanged**, in the file and in the app: no key,
  no line, no `progression` word anywhere, and the same bytes on disk.

#### The two followers: `chord ROW TRACK follow` and `note ROW TRACK follow`

```
tracks 4
progression Am F C G
chord 0 1 follow       # channels 1-3: every chord of the loop, in order
note  0 4 follow       # channel 4:  the loop's ROOTS, a bass line under it
```

`follow` stands exactly where the chord name or the pitch would, so the line reads
as "from this row, play the song's loop":

- **`chord ROW TRACK follow` writes the loop's CHORDS**, one chord per chord of the
  loop, each held for its own length — the keyboard part. The channel has to be
  wide enough for the WIDEST chord in the loop (`poly 3` for triads, `poly 4` for
  sevenths), or the line is refused with the count in it; the refusal names the
  other follower, so the fix is one word away.
- **`note ROW TRACK follow` writes the loop's ROOTS**, one note per chord — the bass
  line under the chords above it. The root is the chord's own lowest note, so the
  bass cannot drift away from the keyboard sitting on top of it. It takes nothing
  after it: a follower has no velocity and no gesture, because what it writes is
  not one note.
- **A follower writes from `ROW` forward, one chord every `hold` steps**, to the end
  of the pattern: a chord that would start past the last step is not written, and
  nothing is refused for running out.
- **A follower SNAPSHOTS the loop.** A `progression` line written BELOW a follower
  cannot reach back and change what that line wrote — a script reads top to bottom,
  and what a line meant is what the lines above it said.
- **A follower with no loop is an error**, with the line number in it and the two
  ways to fix it: write a `progression` above the line, or hang the channel on a
  loop the song already has.
- **A follower has no `arp`**: `chord 0 1 follow arp` is refused, because the loop
  already says how long each chord lasts, and an arpeggio would be a second answer
  to the same question.

`follow` is a MODIFIER in a slot that already existed, which is the language's own
rule working: no new verb, and a file never learns a `follow` word — a song full of
followers is a grid with notes in it.

### `bus NAME LEVEL` — one fader over several channels

```
tracks 4
bus DRUMS 70
track 1 "KICK"  bus DRUMS
track 2 "SNARE" bus DRUMS
track 3 "HAT"   level 45 bus DRUMS

# A second group, over the channels that are not the kit.
bus BACKING 60
track 4 "PAD" voice pad bus BACKING
```

A **bus** is a name for a set of channels and ONE fader over all of them, and a
channel joins one with `bus NAME` on its own `track` line. It is what stops the
mix from becoming eight faders you have to remember: move `DRUMS` and the kit
moves together.

```
bus BEAT 60
track 1 bus BEAT
track 2 bus BEAT
track 3 bus BEAT
bus BEAT 45        # and now the whole kit is quieter
```

**How loud it actually is:** a channel's gain is its own `level` times its bus's
`level`, so a group at `70` and a channel at `50` is `35` — and a group at `100`,
which is the default for a channel with no group, is the identity. Everything the
channel feeds into moves with it, including its reverb and echo sends, because the
multiply happens at the channel rather than after the band: pull the drums down
and the drums get quieter *everywhere*, rather than leaving their tails ringing in
the hall.

**Rules worth knowing:**

- **A bus is defined before the channels that join it.** `bus DRUMS 70` has to
  come above `track 1 bus DRUMS`, exactly as `tracks 4` has to come above the
  `track` lines that address channels 3 and 4 — a script is read top to bottom, so
  a name is checked against what the lines above have defined. A group the SONG
  already has also counts, so a script that only moves a fader can name it.
- **Writing a name twice moves the group**: `bus DRUMS 70` then `bus DRUMS 45`
  leaves one group at `45`, the same way a second `tempo … at BAR` wins.
- **`bus none` leaves a group:** `track 3 bus none` puts the channel back on its
  own fader. `none` is reserved for this, so a group cannot be called `NONE`.
- **A name is one word**, letters, digits, `-` and `_`, up to 12 characters,
  upper-cased on the way in — the same rule a section name follows, and for the
  same reason: it is named inside a `track` line, which is a sentence of `setting
  value` pairs.
- **A song may have at most 4 groups.** A group of one channel is just that
  channel's fader, and a song here has at most eight channels, so four is the most
  a song can use without one of them being pointless.
- **A bus has one knob: a level.** There is no mute and no solo on a group — a
  channel's own mute and the app's solo work on channels — and no effects or
  sends, because a group here is a FADER rather than a second mixer.
- **`Ctrl+Z` undoes a group** like any other line, and a `new` clears every group
  and takes every channel off one.
- **A song with no groups is unchanged**, in the file and in the app: no key, no
  line, no `bus` word anywhere, and the same bytes on disk.

### `sample load PATH` / `sample import` — bring one of YOUR recordings in

```
sample load "samples/break.wav"     # fetch a file the app can reach
sample import                       # or open the browser's file dialog

tracks 4
track 2 "HOOK" wave sample duty 10 sample BRK02
```

A **sample** is a `.wav` of your own — a break, a stab, a one-shot — that a
channel plays in place of the built-in one. Two halves, and the order matters:
first bring the file into the app (`sample load` or `sample import`), then name it
on a channel (`sample BRK02` on its `track` line).

**The song never holds the audio.** The file lives in the app; the song holds the
NAME. That is the same division `wave font` makes with a soundfont, and it is what
keeps a song a few kilobytes of text you can diff, paste and hand to somebody
else.

**A name the app does not have is not an error — it is the fallback.** A channel
whose recording is missing plays the built-in one-shot its `duty` picks, which is
exactly what the channel would have played if the line had never been written. So
a song written on your machine opens and SOUNDS on somebody else's; a missing
sample is a missing flavour, never a missing note.

```
sample load "samples/break.wav"     # -> LOADED  break · 1.20s · 44.1kHz
track 3 "BREAK" wave sample sample break
```

The name comes from the FILE (`My Break 01.wav` arrives as `My-Break-01`, spaces
turned into `-` because a space would end the name), and the status line prints it
so you always know what to write. Loading the same name again REPLACES what was
there — the newest file is the one you just picked.

**Rules worth knowing:**

- **A name is one word**: a letter, then letters, digits, `-` and `_`, up to 16
  characters — the same shape a section or bus name has, and for the same reason.
  A space ends the value, so `sample my break` is `sample my` as far as the
  parser is concerned: name the file `my-break` instead (the app does that for you
  when you load it).
- **`sample none` takes the reference off** a channel, the way `bus none` takes
  it off a group.
- **Only a `wave sample` layer plays it.** Name a recording on a channel whose
  voice is a `sine` and nothing changes — the line is a reference waiting for the
  wave, which is what lets a stack keep its own sound.
- **Your file plays at its own pitch on a C-4** and is transposed from there,
  exactly like the built-in one-shots: a WAV says nothing about what note it is,
  so the app assumes middle C. Play `C-4` and you hear the file as recorded.
- **Mono, and one channel.** A stereo file is folded to one channel on the way
  in, because the channel it plays on already has a `pan` — two pans is one
  control answering to two names.
- **The bank holds 8 recordings, each at most 30 seconds**, and it is APP STATE:
  `Ctrl+Z` never empties it and a saved file never carries it. A song names the
  sound; which file that is depends on what you have loaded, exactly as which
  font `wave font` means depends on what you imported.
- **The menu is the other door.** `F2 → SAMPLES…` lists the bank, its first row
  loads a recording (the same picker `sample import` opens), `Enter` on a
  recording gives it to the selected channel as ONE UNDO STEP (which does change
  the song, so unlike a load it is undoable), and `Del` twice takes it out of the
  bank.
- **`sample load` needs no leading slash.** A path is resolved against the page,
  so `samples/break.wav` means the file beside the app.

### `record NAME` / `record trim` / `record loop` — capture a take, and shape it

```
record HOOK                     # capture from the microphone (browser only)
record trim HOOK 0.1 2.0        # use 0.1s..2.0s of the take
record loop HOOK 1.0 3.0        # loop 1.0s..3.0s inside that window
record select HOOK              # which take the RECORDER page shows
```

A **take** is a recording you captured, described well enough to draw: how long it
is, how loud its peak was, and where its TRIM and LOOP points sit. It is the other
half of the `sample` bargain — the file lives in the app and a song holds only a
NAME — so a take is **app state**, never song data: no file carries one, `Ctrl+Z`
never banks one, and `SAVE AS SCRIPT` does not write one. The channel's own
`sample NAME` is still the only thing that reaches a song.

**`record HOOK` captures.** It takes one recording at a time from the microphone,
and only a browser can: a build with no microphone refuses the line **in words**
rather than silently doing nothing — the `export.audio` precedent, on the way in.
The take lands in the bank under `HOOK`, exactly as if you had pressed RECORD on
the RECORDER page (`page recorder`).

**`record trim NAME START END` is a WINDOW, never a cut.** The two times are
seconds from the take's own start, and they say which part is USED — the `.wav`
you loaded is untouched, and the window is applied whenever the take plays. The
two ends may be written in either order. `record loop NAME START END` sets the
loop points the same way, inside that window; a loop that spans the whole window
is "no loop".

**`record select NAME` is a session setting** like `page`: which take the page
shows, not what the song is. So it costs no undo step and no file carries it.

**Rules worth knowing:**

- **A name follows the sample rule**: one word, starting with a letter, up to 16
  characters of letters, digits, `-` and `_`.
- **A name the takes do not have is reported, not refused.** `record trim HOOK …`
  on a machine that never made a take called `HOOK` changes nothing and says so —
  the same fallback a `sample NAME` channel makes. This is what makes a script
  that shapes a take you have to make first safe to share.
- **The last `record select` wins**, like the other scalar session settings; the
  trims and loops are applied in the order written, so a script may shape several
  takes.
- **The RECORDER page is the other door.** `page recorder` shows the waveform the
  same numbers describe, with handles to drag instead of seconds to type.

### `volume N` — the master level

```
volume 70     # 70%, the app's default
volume 0      # silence
volume 100    # full
```

A **percentage**, 0–100 (decimals allowed), not a 0–1 gain: `volume 0.7` means
0.7%, which is very nearly silent. The app's own slider is a percentage too, so
this is the same number you would see on screen.

This is one of the settings a script can change that are **not part of the
song** — a song is notes and structure, so the level travels beside it (in the
apply result's `settings`) rather than inside it. A script that says nothing about
volume leaves your current level alone. Undo does not restore it, because undo
restores the song. The other six are [`octave`](#octave-n--the-octave-you-are-playing-in),
[`theme`](#theme-name--the-look-of-the-app), [`page`](#page-name--which-screen-is-showing),
[`solo`](#solo-n--hear-only-these-channels),
[`chords`](#chords-off--triad--7th--what-one-key-writes)
and [`hear`](#hear-on--off--audition-as-the-cursor-moves).

### `octave N` — the octave you are playing in

```
octave 5
C D E F G        # these are C-5 D-5 E-5 F-5 G-5
octave 3
C                # and this is C-3
```

One whole number, 0–7. (A note written with an explicit octave can still use
`8`, e.g. `C-8`, as long as it is inside MIDI 12–119.)

Two jobs, and it is worth knowing both. It is the octave a **bare letter** is
written in, which is what makes a compact grid block readable; and it is the octave
the APP is left on, so the piano's `OCT` control and the script agree about where
you are playing. The last `octave` line in a script wins — a script may walk the
whole keyboard as it writes, and the app ends up where the writing ended.

### `solo N N…` — hear only these channels

```
solo 2          # hear channel 2 alone (and any other channel you solo by hand)
solo 1 3        # hear channels 1 and 3, nothing else
solo off        # un-solo everything: the whole song again
```

1-based channel numbers, one or more, or the word `off`. This is the `SOLO` box in
the `F5` mixer, and it is a setting that is **not part of the song**:
soloing says how you are LISTENING, not what the music is. So it never reaches a
file, it costs no undo step, and `solo off` — an empty list — is a different
instruction from a script that never mentions solo (which leaves your own soloing
alone).

**Use it while you work, not in a song you hand over.** `solo 2` at the end of a
script means the person who opens it hears one channel and wonders where the rest
went. It is the right tool for the loop "write it, solo the bass, check it, unsolo
it", and the wrong thing to leave behind.

### `chords off | triad | 7th` — what one key writes

```
chords off      # a key writes one note (the default)
chords triad    # a key writes a three-note chord of the song's key
chords 7th      # a key writes a four-note chord
```

This is the `CHORDS` button in `THIS CELL`, another setting that is not part of
the song: it decides what the NEXT keypress writes, not what is in the music
already. (Writing a chord into the song is [`chord`](#chord-row-track-chord--write-a-whole-chord-at-once),
which is a different statement.) `3` and `4` are accepted as spellings of the two
sizes, and `triads`, `seventh` and `sevenths` also work.

### `hear on | off` — audition as the cursor moves

```
hear on         # every note sounds as you move to it
hear off        # only the notes you type sound (the default)
```

The `HEAR NOTES AS I MOVE` toggle in `THIS CELL`, and another setting that is not
part of the song. An agent cannot hear anything, so this is a line for the
person it is writing FOR: `hear on` makes the grid playable by ear immediately.

### `export` — the bars an export renders, and how loud it arrives

```
export bars 8 to 15      # EXPORT AUDIO / STEMS / MIDI write these bars only
export all               # and this puts the whole song back (the default)
export loud -14          # normalise audio exports to -14 LUFS (what streaming uses)
export loud off          # and this hands the level back to the master fader (the default)
```

ONE statement, TWO session settings, because they are the same decision made
twice: *which bars* leave the app, and *how loud* they arrive. Either clause may
be left out, they may be written in either order, and each may appear once —
`export bars 8 to 15 loud -14` sets both, and `export loud -14` on its own moves
the target and leaves the region exactly as an earlier line left it.

The **loop region** is two numbers counted from 1 — the same bars the `F3` list
numbers — and `bars A to B` is the clause an `automate` line already uses, so a
range in this language reads the same wherever it appears.

The **loudness target** is a number in **LUFS**, the unit every streaming service
publishes, or the word `off`. See its own section below.

```
new
song "CHORUS BOUNCE"
tempo 124
tracks 2

track 1 "KICK" voice kick
track 2 "BASS" voice bass

section VERSE 1 1 2 2
section CHORUS 3 3 4 4
arrange VERSE VERSE CHORUS CHORUS VERSE VERSE

export bars 5 to 8        # the two chorus bars and the two bars after them

automate 2 bright 20 100 bars 1 to 8
pattern 1 "V"
C-1 C-2
.   .
.   .
.   .
pattern 2 "V2"
C-1 A-1
.   .
.   .
.   .
pattern 3 "C"
C-1 F-1
.   .
.   .
.   .
pattern 4 "C2"
C-1 G-1
.   .
.   .
.   .
```

**It is a session setting, not song data.** The song is the whole song whether
you bounce four bars of it or all of it, so a region travels in `settings` beside
the volume and the solo, **no file carries one**, and saving a song you bounced
once does not save the bounce. `Ctrl+Z` does not restore it either — it is what
you are DOING with the song, not something the song is.

**Nothing in the song changes.** The region does not move a bar, mute a channel or
shorten a pattern: it says which part of the order the exporters walk, so a song
bounced for eight bars is still a fifteen-bar song in every other respect.

**It is fitted to the order, and said out loud when that matters.** A range may be
written ABOVE the `arrange` line that makes the order long enough to hold it —
which is why it is not refused while parsing — so the bars are clamped to the ones
that exist when an export runs, and `export bars 8 to 15` in a four-bar song
applies with an advisory saying which bars it became.

**By hand:** press **`F3`** and `L` on the bar the region starts at, then `L` on
the bar it ends at. The list brackets the bars it covers, a third press on the end
bar takes the region off, and the status line says what it is after every press.
`F2 → EXPORT…` shows the region on its `RENDER` row — which is also how it is
cleared with the mouse — because a region that only lived in a script would be a
way to export two bars of a song by accident.

### `export loud LUFS` — how loud an audio export arrives

```
export loud -14          # -14 LUFS (Spotify, YouTube, most streaming)
export loud -16          # -16 LUFS (a podcast)
export loud -23          # -23 LUFS (European broadcast, EBU R128)
export loud off          # the master fader governs again (the default)
```

`EXPORT AUDIO` and `EXPORT STEMS` MEASURE the finished render and apply the one
gain that lands it on the target. The measurement is **ITU-R BS.1770** — the
standard the services publish their numbers in — so `-14` here means the same
thing it means in anybody else's meter:

- the audio is weighted the way an ear weights frequency (a high shelf and a
  38 Hz high-pass), averaged over 400 ms blocks, and the quiet blocks are gated
  out, because how loud a song is should not depend on how long it stays silent
  at the end;
- a 1 kHz tone at -20 dBFS is the calibration signal, and reads exactly
  **-23.0 LUFS**;
- the gain is applied AFTER the render, so it is a linear gain: it moves the
  file's loudness and nothing else about it. The same song normalised twice comes
  out the same both times;
- a target the peak cannot reach is **not** reached. A quiet mix turned up to
  -14 may want a gain whose peak passes full scale, and the app stops at -1 dBFS
  rather than writing a clipped file, then says so in the status line —
  `NORMALISED TO THE CEILING`. An export that silently clips would be worse than
  one that lands a decibel low;
- **the standard's numbers are tested against the standard**, not against
  themselves: the filter is compared with the coefficients BS.1770 publishes for
  48 kHz, and the calibration tone above is asserted to read -23.0.

```script
new
song "AT STREAMING LEVEL"
tempo 96
tracks 2

track 1 "LEAD" voice kick
track 2 "BASS" voice bass

pattern 1 "A"
C-4  C-2
E-4  C-2
G-4  G-2
.    .

export bars 1 to 2 loud -14
```

**It is a session setting, not song data** — the same bargain the region makes,
with one deliberate difference: a region names BARS of one song, so it is dropped
when the song is replaced, while a target is a LEVEL, which is what a person
prefers about everywhere their music goes. So a new song keeps the target, exactly
as it keeps the master volume.

**MIDI carries no level**, so `EXPORT MIDI` ignores the target entirely; the notes
and their velocities go out as they always did.

**A stems export uses ONE gain, decided by the mix.** Normalising each stem on its
own would leave the parts no longer summing to the mix, and summing to the mix is
the whole point of a stem set — so a normalised stem export renders the mix first,
measures that once, and applies the single gain to every part. It is the one extra
render this feature costs.

**By hand:** `F2 → EXPORT…` has a `LOUDNESS` row. `ENTER` walks the ladder the
services publish — `OFF`, `-23` broadcast, `-16` podcast, `-14` streaming, `-9`
loud, and back to `OFF` — so the common targets need no numbers remembered. A
value a script chose that is not one of the stops is shown as it is, and the next
`ENTER` climbs to the stop above it.

### `theme NAME` — the look of the app

```
theme forge         # a dark, hot palette
theme parchment     # a light, paper one
theme reliquary     # the default
```

One name, the id the `F9` appearance menu shows. The ten are `reliquary` (the
default), `moorland`, `the-deep`, `ossuary`, `underglow`, `forge`, `mycelium`,
`boghollow`, `nest` and `parchment`. The id is lower-case with a hyphen where the
menu has a space, so `THE DEEP` on screen is `theme the-deep` in a script.

This is another setting that is not part of the song, and it is the one that
matters most to be a *session* setting rather than song data. A theme is not just
a tint here — it repaints every pixel of the app — so if a file carried it, then
opening someone else's song could change how YOUR app looks, which is a hostile
surprise. Keeping it in `settings`, beside the volume and the solo, is what makes
it safe to script at all: a **file never carries a theme**, so the only way it
can change is a script you chose to paste.

Like the other session settings, a script that never mentions a theme leaves the
one you picked alone, and the last `theme` line wins if a script says it twice.

### `page NAME` — which screen is showing

```
page arranger       # the song timeline, with the drawn automation lanes
page mixer          # the F5 mixer
page live           # the launch grid, for playing the song's scenes
page recorder       # capture in, and bounce the song out
page tracker        # ...and any line for the screen you want last
```

The full screens the header dropdown switches between: `tracker` (the default),
`machine` (the drum machine), `mixer`, `arranger`, `live` (the launch grid) and
`recorder` (capture in, bounce out).
One name, one line, and the
app moves to that screen when the script is applied.

This is the one word that makes a **master script** possible: because a script is
already a single flat list that writes the song AND the session, a script that
also says `page` can set up every part of the app and leave a person looking at
the screen they asked for. It is a session setting like `theme` — a view of the
song, not the song — so a **file never carries a page**, opening someone's song
cannot move your screen, and it costs no undo step. A script that never mentions
a page leaves the screen where it is, and the last `page` line wins.

The name is checked against the pages THIS build has, so `page live` is refused in
words by a build that predates the LIVE page rather than switching to a screen
that does not exist.

### `instrument use NAME` — which imported instrument `wave font` plays

```
instrument use 2                 # the second instrument in the F2 list
instrument use "GRAVEL KIT"      # by name (quote it if it has spaces)
```

One name or one 1-based number, matching the `F2 → INSTRUMENTS` list. A channel
has to be on `wave font` for it to matter, and inside that instrument the
channel's `duty` knob picks WHICH SOUND of it — the same way `duty` picks a
soundfont's preset — **except for a drum hit**: a `wave font` channel playing
`kick`/`snare`/`hat`/`wind` uses the instrument's own percussion kit, which sits on
bank 128 past the presets `duty` can name, so the drum word is what picks the sound
rather than the knob:

```script
instrument use "GRAVEL KIT"
track 1 WALK wave font duty 0        # the pack's first sound
track 2 RUN  wave font duty 60       # an even spread across the pack
pattern 1 STEPS
C-4 .
C-4 .
D-4 .
E-4 .
```

This is a SESSION setting, not song data — a song file says `wave font` and never
names an instrument, for the same reason a real sampler does not ship with its
samples: a song stays a few kilobytes of text, and opening somebody else's song
cannot reach into your imported instruments. What it means in practice:

- the same song through a different instrument is a different performance, which
  is the point, not a bug;
- a name that is not in the list is not a script error. The song still applies
  and the app says `NO INSTRUMENT CALLED "X"` afterwards — the alternative would
  throw away the song the script just built over a name you have not imported
  yet;
- nothing here is undoable with `Ctrl+Z`, because nothing about the song changed.
  Importing and switching are not song edits.

### `instrument import` — ask for a Noislet instrument file

```
instrument import
```

Opens the same file picker as `F2 → IMPORT FROM NOISLET`. A script cannot read a
path — a browser has no filesystem to read and the file does not exist until
somebody chooses it — so this is the one line where a script asks a PERSON for
something, exactly like `OPEN FILE…` does. The import then reports in the status
line the same way a click does.

### `instrument load PATH` — fetch an instrument

```
instrument load "storage/soundfonts/dkc/Donkey Kong Country 2012.sf2"
instrument load "storage/instruments/frog/frog-pond.instrument.json"
```

The same thing `F2 → LOAD SOUNDFONT (.sf2)` or `F2 → IMPORT FROM NOISLET
(.instrument.json)` does, with the file named instead of chosen: the path is
fetched, read, put in the instrument list and selected, so the next note on a
`wave font` channel comes out of it. Quote a path with spaces in it.

**Which reader opens it is decided by the file, not by the extension.** A Noislet
instrument is JSON and opens with `{`; a soundfont is a RIFF binary and opens with
`RIFF`; and a path is whatever somebody put there, so the bytes are the only thing
worth asking — the same rule the song formats use (`09-song-files.md`). One
statement therefore loads either kind, and a song built around a pack you designed
in Noislet stands on its own exactly as one built around a soundfont does.

This is the statement that makes a song script a COMPLETE setup. `instrument use`
needs somebody to have loaded the font already and `instrument import` needs
somebody at a file dialog, so a script that relies on either is really a script
plus an instruction to a person. A DKC-flavoured tune written for a particular
soundfont can therefore say so and be right on any machine that has the kit's
`storage/` folder — which is the whole reason a song is worth writing down.

```script
# a font, the sound it plays and the notes, in one script
instrument load "storage/soundfonts/dkc/Donkey Kong Country Exp (Sam Miller).sf2"

track 1 BASS  wave font duty 8  level 70     # Acoustic Bass
pattern 1 "A"
C-2 .
C-2 .
G-1 .
A#1 .
```

A load SELECTS what it loaded, so the example above needs no `instrument use`
line: naming a font is asking for it to be played. Write `instrument use "…"`
after a load when you want to be explicit about it, or when the same script has
to work with a font somebody imported by hand.

The path is a URL, resolved against the page the app is served from — so in this
kit it reads `storage/…`, the folder beside the editors, which the Tracklet dev
server serves at `/storage/…` (see `vite.config.ts`). An `http(s)://` URL works
too: the statement fetches a file, and a file can live anywhere.

Two things worth knowing:

- **A load is ASYNCHRONOUS, and nothing else in the script waits for it.** The
  font arrives when it arrives; the song is written in the meantime, and an
  `instrument use` beside a `load` is applied when the bytes land rather than
  before them. That ordering is arranged for you — a load followed by a use does
  the right thing, in that order, without you having to think about it.
- **A load that fails is not a script error.** The script still applies and the
  song still changes; the app says `COULD NOT LOAD …` (or `COULD NOT READ …`, with
  the path) on the status line, because a font that did not arrive leaves a
  `wave font` channel playing the built-in samples, which sounds plausible — and a
  plausible wrong answer is the one worth saying out loud. Check the path, and
  look at `F2 → INSTRUMENTS`.

Like the other two instrument statements this is a SESSION setting: the song
records only `wave font`, loading is not undoable with `Ctrl+Z`, and the load
takes effect on the next note rather than cutting the one that is ringing.

### `tracks N` — how many channels the song has

```
tracks 6
```

One whole number, 1–8. Growing the song adds channels with the default names
(`TRACK 5`, `TRACK 6`) and default waveforms; shrinking it drops the last ones.

**Put this before any line that depends on it.** A `track 5` statement, or a
grid row with five columns, is an error while the song still has four channels.

### `track N [NAME…] [voice V] [wave W] [knob P] [hold H] [level L] [pan P] [glide G] [vibrato B] [strum S] [robin R] [touch T] [drift D] [verb S] [echo S] [duck P] [groove F] [humanize P] [poly M] [shape S] [effect P] [on|off]` — configure one channel

```
track 1 "LEAD" voice lead glide 30
track 2 BASS voice bass level 65 pan L30 verb 0
track 3 voice pad bright 40 hold 4 level 45 vibrato 25 echo 50
track 4 "STRINGS" pan R40
track 5 "HAT" voice hat pan R20
```

- `N` — the channel number, **1-based**, 1 to the current channel count.
- `NAME…` — the channel's name: joined with spaces and upper-cased, at most
  **16 characters** after upper-casing; anything longer is an error. Quoting is
  optional, but it is also how the language tells a NAME from a SETTING: `wave`,
  `on` and `off` are settings when they are bare and a name when they are
  quoted. `track 1 off` mutes channel 1; `track 1 "OFF"` names it OFF. A bare
  setting word left among the name words is an error, not a name — quote it.
  The app's own rename box (shift+click a channel's name in the TRACKS panel)
  writes this same field, so a name typed by hand and a name written here are the
  same thing — and either can be undone with one `Ctrl+Z`.
- `wave W` — the oscillator shape. Accepted spellings:

  | Write | Wave |
  | --- | --- |
  | `square`, `sqr`, `pulse` | `square` |
  | `triangle`, `tri` | `triangle` |
  | `sawtooth`, `saw` | `sawtooth` |
  | `sine`, `sin` | `sine` |
  | `noise`, `lfsr` | `noise` |
  | `table`, `wavetable`, `wave` | `table` |
  | `sample`, `smpl` | `sample` |
  | `fm`, `fmsynth`, `freqmod` | `fm` |
  | `string`, `str`, `karplus`, `karplus-strong` | `string` |
  | `formant`, `vowel`, `vowels`, `vox` | `formant` |
  | `organ`, `drawbar`, `drawbars`, `tonewheel`, `hammond` | `organ` |
  | `granular`, `grain`, `grains`, `cloud` | `granular` |
  | `font`, `soundfont`, `sf2`, `sfz` | `font` |
  | `reed`, `reeds` | `reed` |
  | `brass`, `brasses` | `brass` |
  | `bow`, `bowed` | `bow` |
  | `mallet`, `mallets`, `struck` | `mallet` |
  | `membrane`, `membranes`, `skin` | `membrane` |
  | `plate`, `plates` | `plate` |

  The `square` wave is a **pulse** at 50% — see `duty` below for narrowing it
  into the thin, reedy lead a NES or Game Boy is famous for. `pulse` is accepted
  as a spelling of `square` for exactly that reason.

  `noise` is not a tone at all but the **chip noise channel**: a shift register
  that grits instead of ringing, and the note you write sets how coarsely — a low
  note is a rumble and a high one a fine hiss. On a `noise` wave `duty` picks the
  register's LENGTH rather than a width: `100` (the default) is the long 15-bit
  register, a full hiss, and anything below `50` is the short 6-bit one, which
  rings distinctly metallic. It is how a chip makes drums and wind, and it is the
  second piece of the chiptune palette after `duty`.

  `table` is the **chip wavetable** — the wave channel a Game Boy and a PC Engine
  use for everything that is not a square. It is a periodic wave built from a
  fixed BANK of named tables, and `duty` PICKS one rather than dialling a number,
  because a chip selects a table:

  | `duty` | Table | Sound |
  | --- | --- | --- |
  | `0`–`19` | `HOLLOW` | a soft, hooting square-without-buzz |
  | `20`–`39` | `GLASS` | sparse high harmonics: thin and glassy |
  | `40`–`59` | `REED` | a formant on the third and fifth: reedy and nasal |
  | `60`–`79` | `BUZZ` | every harmonic with little damping: bright and saw-like |
  | `80`–`100` | `ORGAN` | a drawbar stack of octaves and fifths |

  `sample` is a **one-shot**: a short built-in sound the note TRIGGERS rather
  than a source that runs for the note's length. That is what a sample is on a
  Super NES or an Advance — a short recording played back, pitched by the note —
  and Tracklet has no files to load, so the bank is synthesized instead. Six of
  them, and `duty` picks which:

  | `duty` | Sample | Sound |
  | --- | --- | --- |
  | `0`–`16` | `BLIP` | a bright 8-bit blip: short, square and gone |
  | `17`–`33` | `PLUCK` | a struck string: bright at first, then only its low notes |
  | `34`–`50` | `WOOD` | a woodblock: a click of noise over a fast, dead tone |
  | `51`–`66` | `CLAP` | a hand clap: three noise bursts and a short tail |
  | `67`–`83` | `TOM` | a tom drum: one low note that falls as it dies |
  | `84`–`100` | `BELL` | a struck bell: inharmonic partials ringing out |

  A sample plays ONCE, so `hold` cannot stretch it: writing the same note on two
  steps is two hits, not one long one. Its pitch follows the note, so a low `TOM`
  is a bigger drum and a high `BELL` a smaller one. `PLUCK` and `BELL` sit below
  their root; the bank is written at middle C.

  `fm` is **two-operator FM**, the way a Genesis or an AdLib makes its voices. A
  SINE carrier sounds the note, and a second oscillator an octave above bends its
  pitch — the timbre is the relationship between the two pitches, not the shape of
  either. On an `fm` wave `duty` is the **modulation index**: how hard the
  modulator pushes the carrier.

  | `duty` | Sound |
  | --- | --- |
  | `0` | `sine` — no modulation at all: the carrier alone |
  | `30`–`60` | a warm hollower tone, the sweet spot for basses and leads |
  | `100` | `metal` — bright, clangorous and almost broken up |

  The modulation scales with the note, so a voice keeps its colour up and down
  the keyboard rather than going dull low and screaming high, exactly as an FM
  chip does. It is how the `genesis` and `opl` console profiles are built.

  `string` is a **plucked string**, from first principles: Karplus-Strong. A
  burst of noise one period long is fed back through an averaging filter and left
  to ring — the filter eats the high harmonics first, so what survives is the slow
  wobble of a real string. No oscillator can make that sound, which is why it is a
  wave of its own rather than a setting on one. Like a `sample` it plays ONCE, so
  `hold` cannot stretch a pluck into a pad, and its pitch follows the note. `duty`
  picks from a bank of five strings:

  | `duty` | String | Sound |
  | --- | --- | --- |
  | `0`–`19` | `PLUCK` | a bright plectrum: a sharp attack and a quick decay |
  | `20`–`39` | `STEEL` | a steel guitar string: bright, ringing and even |
  | `40`–`59` | `NYLON` | a soft nylon string: round, quick and without edge |
  | `60`–`79` | `HARP` | a harp: mellow and long, the pluck almost gone |
  | `80`–`100` | `KOTO` | a plucked zither: bright and short, with a hard metallic edge |

  The string is rendered from a fixed seed, so the same note draws the same
  string in the app, in an export and in the tests — a render is the file you
  heard, never a different roll of the dice.

  `formant` is a **vowel**, from first principles: formant synthesis. A vowel is
  not a shape but a fixed set of resonant peaks — FORMANTS — that the throat and
  mouth put on top of the buzz of the vocal folds. The harmonics of the note never
  move; what changes between vowels is which of them the peaks let through. So a
  `formant` wave is a steady glottal tone shaped by three peaks, and `duty` picks
  the vowel:

  | `duty` | Vowel | Sound |
  | --- | --- | --- |
  | `0`–`19` | `AH` | the open "ah": a low first formant, the second well above it |
  | `20`–`39` | `EH` | the bright "eh": the second formant lifted toward the middle |
  | `40`–`59` | `EE` | the narrow "ee": a very low first formant and a high second |
  | `60`–`79` | `OH` | the rounded "oh": both low formants drawn close together |
  | `80`–`100` | `OO` | the deep "oo": formants low and dark, the opposite of "ee" |

  Unlike a `sample` or a `string` it **sustains** — it is an ordinary oscillator
  wearing the vowel's spectrum — so `hold` stretches it and `glide` slides from
  one vowel to the next. The one place it is not a real voice: the formants follow
  the note's pitch instead of staying put across the keyboard. In exchange it
  loops perfectly, which is what makes it a playable vowel rather than a syllable.

  `organ` is a **drawbar organ**, from first principles: additive tonewheels. A
  tonewheel organ makes its sound the simplest way there is — it ADDS together
  pure sines, nine of them, one per DRAWBAR, each at a fixed interval from the
  note. `duty` picks the REGISTRATION — which of the nine bars are pulled out and
  how far — the same choice a player makes by sliding nine little bars:

  | `duty` | Registration | Sound |
  | --- | --- | --- |
  | `0`–`19` | `FLUTE` | one 8-foot stop alone: plain, hollow and quiet |
  | `20`–`39` | `MELLOW` | the 8-foot stop with its 4-foot octave: soft and rounded |
  | `40`–`59` | `JAZZ` | the classic jazz setting — 16, 5⅓ and 8 feet: warm and full |
  | `60`–`79` | `CHURCH` | the low stops with the 4-foot octave: broad and hymn-like |
  | `80`–`100` | `FULL` | every stop pulled out: the biggest, brightest sound the organ has |

  The two lowest stops, 16 feet and 5⅓ feet, sit an octave and a twelfth BELOW
  the note — which is why the organ is the one wave rendered into a looping tone
  rather than a `PeriodicWave`: a spectrum of whole-number harmonics has no way to
  sound a sub-octave. It SUSTAINS, so `hold` rings and `glide` slides. Written at
  middle C.

  `granular` is a **grain cloud**, from first principles: granular synthesis. A
  sound is treated not as a wave but as a CLOUD of tiny grains a few milliseconds
  long, sprayed out in time and left to overlap — each grain a windowed burst of
  a sine at (or near) the note. Change how long a grain is and how often one
  fires and the same note becomes a crackle, a rough buzz or a smooth breathing
  pad. `duty` picks the character:

  | `duty` | Character | Sound |
  | --- | --- | --- |
  | `0`–`19` | `CRACKLE` | tiny sparse grains: a dry crackle, almost a drum |
  | `20`–`39` | `RAIN` | short grains at a patter: an unstable, rainy texture |
  | `40`–`59` | `BUZZ` | short grains crowded together: a rough, buzzy tone |
  | `60`–`79` | `CLOUD` | long overlapping grains: a soft, breathing cloud |
  | `80`–`100` | `SMEAR` | grains so long they merge: a near-continuous shimmer |

  Like the `organ` it SUSTAINS, so `hold` rings the texture and `glide` slides
  it; its grains are sprayed from a fixed seed, so a render is the file you heard
  rather than a different roll of the dice. Written at middle C, so pitch and
  grain rate move together with the note.

  `font` plays **recorded sound**: somebody else's samples, rather than a sound
  this app synthesizes. Two imports put an instrument in the app —
  `LOAD SOUNDFONT (.sf2)` in the `F2` menu, or `IMPORT FROM NOISLET
  (.instrument.json)` for a pack you designed in Noislet (see
  [10-instruments.md](10-instruments.md)) — and neither is part of the song,
  because an instrument is megabytes of sample data while a song file has to stay
  shareable. A channel on `wave font` plays the instrument you have selected,
  `duty` picking which of its PRESETS (spread evenly across the knob, so `0` is
  the first and `100` is the last), and the KEY you write picking which of that
  preset's recordings answers — a piano is a handful of samples split across the
  keyboard, not one stretched sound.

  ```script
  tracks 2
  track 1 "PIANO" wave font duty 0
  track 2 "STRINGS" wave font duty 60 hold 2
  pattern 1 "VERSE"
  C-4 C-3
  . .
  E-4 .
  . .
  G-4 .
  ```

  A font channel takes `bright`, the envelope and the room like every other one,
  so a sampled piano still sits in the song's mix rather than on top of it. With
  NO font loaded, `wave font` plays the built-in one-shots instead — a song that
  names a font you do not have still makes a sound rather than a silence.

  `reed` is a **reed instrument**, from first principles: an exciter driving a
  resonant tube. A reed is not a shape any more than a vowel is — it is a BUZZ, a
  reed snapping the airstream into a rich pulse train, blown through a TUBE whose
  resonances decide which harmonics survive. `duty` PICKS which reed from a bank,
  the same way it picks a vowel or a registration:

  | `duty` | Reed | Sound |
  | --- | --- | --- |
  | `0`–`16` | `CLARINET` | a hollow wooden tube: odd harmonics only, one clear formant |
  | `17`–`33` | `OBOE` | a bright, nasal conical bore: both harmonic families, a high formant |
  | `34`–`50` | `BASSOON` | a deep, reedy bore: a low formant under a woody buzz |
  | `51`–`66` | `SAX` | a warm, breathy brass bore: a broad low formant and a soft buzz |
  | `67`–`83` | `HARMONICA` | a small free reed: a piercing, buzzy mid formant |
  | `84`–`100` | `BAGPIPE` | a chanter over a drone: a locked, buzzing, sustained tone |

  Like the `formant` it is a `PeriodicWave`, so it SUSTAINS — `hold` rings and
  `glide` slides — and its peaks are multiples of the note, so they follow the
  pitch across the keyboard. The clarinet is the one to reach for when the ask is
  "woody" and the bagpipe when it is "drone", and the difference between them is
  as much the odd-harmonic bore as the peaks. Written at middle C.

  ```script
  track 1 "REED"  wave reed duty 45 hold 8
  track 2 "PIPE"  wave reed duty 95 hold 16
  ```

  `brass` is the SAME machine driven by a different exciter: a player's LIP
  buzzing into a flared metal bore rather than a reed. Nothing about the model
  changes — an exciter shaped by the tube's resonant peaks, a `PeriodicWave` so it
  sustains — and the numbers say what brass is: a conical bore keeps BOTH harmonic
  families (so nothing here is hollow the way a clarinet is) and the bell flares,
  which keeps the spectrum bright as the note climbs. `duty` picks the instrument:

  | `duty` | Brass | Sound |
  | --- | --- | --- |
  | `0`–`16` | `TRUMPET` | a brilliant conical bore: a high mouthpiece peak and the whole ladder |
  | `17`–`33` | `TROMBONE` | a bold, round bore: a lower peak and a wide, full spectrum |
  | `34`–`50` | `HORN` | a mellow french horn: a low, soft peak and a dark, covered tone |
  | `51`–`66` | `TUBA` | a deep, huge bore: the lowest peak and a weighty low end |
  | `67`–`83` | `FLUGEL` | a soft, warm flugelhorn: a broad mid peak and a gentle bite |
  | `84`–`100` | `MUTED` | a harmon-muted trumpet: a narrow high formant and a thin, nasal buzz |

  ```script
  track 1 "HORN"  wave brass duty 40 hold 8
  track 2 "STAB"  wave brass duty 0  hold 2
  ```

  The muted voicing is the one that proves the family is real rather than one
  spectrum moved around: a harmon mute puts a narrow high formant in front of the
  bell and swallows the lows, which is why it is thin and nasal while the tube
  behind it is unchanged.

  `bow` is the third exciter on the same machine: a BOW dragging and releasing a
  string (stick-slip) into a hollow BODY. A body is not the tube a wind instrument
  has — it is a box with a low air resonance and a broad "bridge hill" up top — so
  the peaks here sit low and wide, and the second of them is a hump rather than a
  point. The bow keeps both harmonic families, so nothing here is hollow; what
  makes a violin a violin is where the box rings. `duty` picks the instrument:

  | `duty` | Bowed string | Sound |
  | --- | --- | --- |
  | `0`–`16` | `VIOLIN` | a bright, singing box: a low air resonance and a bridge hill up high |
  | `17`–`33` | `VIOLA` | a warm, darker box: the air resonance lifted, the hill brought down |
  | `34`–`50` | `CELLO` | a rich, woody box: a low body resonance under a full mid |
  | `51`–`66` | `BASS` | a double bass: a very low resonance and a thick, dark body |
  | `67`–`83` | `ERHU` | a small two-string fiddle: a nasal mid resonance and a taut, singing bite |
  | `84`–`100` | `STRINGS` | a whole section: broad, overlapping resonances and no single voice poking out |

  ```script
  track 1 "CELLO"  wave bow duty 40 hold 8
  track 2 "ENS"    wave bow duty 100 hold 16
  ```

  Like the other two it SUSTAINS, so `hold` rings and `glide` slides — which is
  the whole reason to reach for `bow` over `string`, whose pluck is over as soon
  as it starts. Written at middle C.

  `mallet` is the first wave of the other family — a STRUCK bar — and the first
  wave whose overtones are **inharmonic**: hit a rosewood key or a metal bar and
  the overtones land at roughly 1 : 2.76 : 5.4 : 8.9 rather than 1 : 2 : 3 : 4,
  which is the sound of a glockenspiel rather than a flute. A `PeriodicWave` cannot
  say a ratio that is not an integer, so this is a rendered ONE-SHOT like `string`
  and `sample`: it sounds once when the note lands and rings down, and `hold`
  cannot stretch it. `duty` picks the bar:

  | `duty` | Bar | Sound |
  | --- | --- | --- |
  | `0`–`16` | `MARIMBA` | a soft rosewood key: warm and woody, first overtone a fourth up |
  | `17`–`33` | `XYLOPHONE` | a hard wooden key: bright and short, first overtone a twelfth up |
  | `34`–`50` | `VIBRAPHONE` | a metal bar that rings: long, soft partials fading one by one |
  | `51`–`66` | `GLOCKENSPIEL` | a bright metal bar: its natural inharmonic 2.76 partial shining |
  | `67`–`83` | `MUSIC BOX` | a small plucked comb: a high, glassy shimmer |
  | `84`–`100` | `KALIMBA` | a thumb piano: a small, soft metal tine with a quick ring |

  ```script
  track 1 "MAR"  wave mallet duty 0  hold 4
  track 2 "BOX"  wave mallet duty 75 hold 2
  ```

  Each partial decays at its own rate, which is what an ear reads as wood versus
  metal: a wood bar's overtones die together and a metal one's fade one by one,
  leaving the fundamental ringing alone.

  `membrane` is the other half of the struck family — a struck SKIN rather than a
  bar — and its overtones are denser and closer still: a circular head rings near
  1 : 1.59 : 2.14 : 2.30 : 2.65 …, packed tightly enough that the ear hears a
  single thud with a pitch rather than a chord. And a skin RELAXES as it sounds,
  so its pitch DROOPS from a little above the note down to it, which is what makes
  a tom sound like a drum. Like `mallet` it is a rendered ONE-SHOT: it sounds once
  when the note lands and rings down, and `hold` cannot stretch it. `duty` picks
  the drum:

  | `duty` | Drum | Sound |
  | --- | --- | --- |
  | `0`–`16` | `TOM` | a mid tom: a round thud with a short, singing pitch |
  | `17`–`33` | `TIMPANI` | a kettledrum: deep and long, the pitch rolling down as it rings |
  | `34`–`50` | `CONGA` | a hand drum: a hard slap over a bright, open tone |
  | `51`–`66` | `TABLA` | a tuned hand drum: a tight, pitched ring with a ringing overtone |
  | `67`–`83` | `DJEMBE` | a goblet drum: a sharp, dry crack with a quick low thump |
  | `84`–`100` | `FRAME` | a frame drum: a broad, breathy skin with a soft, rolling tone |

  ```script
  track 1 "TOM"   wave membrane duty 0  hold 2
  track 2 "TIMPS" wave membrane duty 25 hold 4
  track 3 "HAND"  wave membrane duty 90 hold 2
  ```

  A heavier strike than any bar's is laid over the first few milliseconds, because
  a drum hit is mostly the beater touching the skin, and it falls off from the
  deepest to the tightest, so a line of them works as a kit.

  `plate` is the third struck body — a struck PLATE rather than a bar or a skin —
  and the most METALLIC. Its overtones are SPARSE and spread far apart, and they
  ring for seconds: a bell's hum sits an octave BELOW its strike tone, a tierce a
  minor third above it and a nominal an octave up, and that wide, uneven spread is
  what an ear hears as cast metal rather than wood. Like `mallet` and `membrane`
  it is a rendered ONE-SHOT: it sounds once when the note lands and rings down, and
  `hold` cannot stretch it. `duty` picks the plate:

  | `duty` | Plate | Sound |
  | --- | --- | --- |
  | `0`–`16` | `BELL` | a tower bell: a deep hum under a bright strike tone, ringing for seconds |
  | `17`–`33` | `CHIME` | a long tubular chime: pure, sparse partials that hang in the air |
  | `34`–`50` | `GONG` | a bronze gong: a struck wash whose low partials swell and hang |
  | `51`–`66` | `TAM-TAM` | a huge flat gong: the lowest and longest ring of all, a slow roar |
  | `67`–`83` | `ANVIL` | a struck metal block: a hard, high clang that stops almost at once |
  | `84`–`100` | `CRASH` | a cymbal: a bright, spread clang with a long shimmering tail |

  ```script
  track 1 "BELL" wave plate duty 0  hold 8
  track 2 "GONG" wave plate duty 40 hold 8
  track 3 "CYMB" wave plate duty 100 hold 2
  ```

  A light tap sets it ringing, because a bell or a gong takes a small mallet, and
  the length rises to the biggest gong and falls to the hardest, shortest hit, so a
  line of them works as a bell tower or a kit.

  So `duty` is the pulse's WIDTH on a `square`, the register's LENGTH on a
  `noise`, the table's PLACE on a `table`, the sample's SLOT in the bank on a
  `sample`, the modulation DEPTH on an `fm`, the string's SLOT in the bank on a
  `string`, the VOWEL on a `formant`, the REGISTRATION on an `organ`, the GRAINS
  on a `granular`, the PRESET on a `font`, the REED on a `reed`, the BRASS on a
  `brass`, the BOWED STRING on a `bow`, the BAR on a `mallet`, the SKIN on a
  `membrane` and the PLATE on a `plate` — one knob, and the wave says what it
  means. The `F4` menu names the two ends accordingly.

- `voice V` — a whole **instrument** by name, which is the friendliest way to
  change a channel's sound: `voice pad`, `voice pluck`, `voice hat`. A voice sets
  the waveform AND all nine knobs at once, so one word turns a buzzer into a
  bowed string or a drum. The voices, by what they are for:

  | Family | Voices |
  | --- | --- |
  | Lead | `lead`, `pluck`, `bell`, `glass` |
  | Low | `bass`, `sub` |
  | Harmony | `pad`, `strings`, `organ`, `flute` |
  | Drums & fx | `kick`, `snare`, `hat`, `wind` |

  A name you do not recognise is an error that lists every voice, because a
  guessed voice still plays — as the wrong instrument.

  `V` may also be one of the SOUNDS YOU SAVED: `SAVE AS…` in the `F4` menu names
  whatever the channel is on right now and keeps it under `MY SOUNDS`, and from
  there it is addressed exactly like a built-in one (`voice MYPAD`, `track 2
  "PAD" voice MY-PAD`). A saved sound lives in the BROWSER, not in the song, so a
  script that names one parses only in an app that has it saved. That is fine for
  your own music and a trap for a script you hand to someone else: if a script
  has to travel, write the knobs, and it will sound the same anywhere.

  A saved sound is applied as its **whole self**. `SAVE AS…` saves the channel's
  voice AND the layers above it, so if `SUPERSAW` was saved from a stacked
  channel, `track 1 voice SUPERSAW` lays those layers down too — one word for a
  sound that took four layers to build. A **built-in** voice is only ever a voice,
  so `voice pad` still sets exactly what it has always set and leaves any stack
  you wrote yourself alone; the same is true of a saved sound that was saved
  before layers could be saved, which is why no existing library or script
  behaves differently.
- `bright P`, `sweep P`, `duty P`, `noise P`, `attack P`, `decay P`, `ring P`,
  `release P`, `thick P` — the nine **knobs** that shape the sound underneath a
  voice. Each is a percentage `0`–`100`, and each has a second spelling in
  brackets:

  | Knob | 0 means | 100 means | Also spelled |
  | --- | --- | --- | --- |
  | `bright` | dark and muffled | open and buzzing | `tone`, `brightness`, `filter` |
  | `sweep` | a flat, steady tone | a wide wah, opening then closing | `filter-env`, `filterenv`, `env` |
  | `duty` | a thin 12.5% pulse | the full hollow square | `pulse-width`, `pulsewidth` |
  | `noise` | a pure tone | all hiss (drums, breath, wind) | `hiss`, `air` |
  | `attack` | an instant hit or pluck | a slow swell or bow | `fade`, `swell` |
  | `decay` | a snappy drop to the held level | a slow, gradual fall | `fall`, `fade-out` |
  | `ring` | a pluck that dies at once | a pad that holds | `sustain`, `hold-level` |
  | `release` | stops dead when it ends | keeps ringing on | `tail`, `ring-out` |
  | `thick` | one thin voice | a wide, detuned one | `width`, `detune` |

  `duty` is the **pulse width**, and it is the one knob that turns a plain
  square into a chip lead: at `100` (the default) the square is full and hollow,
  and as it drops toward `0` the wave narrows to the thin, metallic buzz a NES
  or Game Boy lead is made of. It is heard only on a `square` wave — the other
  three shapes have no width to set — so `wave triangle duty 20` simply sounds
  like a triangle, exactly as `bright 0` is nearly inaudible on a sine.

  `attack`, `decay`, `ring` and `release` are the **ADSR** — the note's life,
  named after what you hear rather than four letters. `attack` is how fast it
  reaches full level, `decay` how long the fall to the level it holds takes,
  `ring` the level it holds, and `release` how long it keeps ringing after the
  note ends. All four default to the envelope every song written before them was
  already playing, so `decay 0` and `release 0` are exactly the old sound.

  `sweep` is the **filter envelope**: where `bright` is how open the tone is,
  `sweep` is how far that openness MOVES over a note. At `0` (the default) the
  tone is steady, which is what every song written before the knob existed was;
  turned up, the note opens wide and closes down to its `bright` as it decays —
  a pluck's bite, a bowed swell, or the `wah` a filter sweep is named for. It is
  timed by the same attack and decay the volume uses, so a short hit is a short
  sweep and a held note sweeps slowly.

  A voice and a knob can share a line, and the more specific word wins whatever
  the order: `track 3 voice pad bright 90` is a pad that is brighter than usual.
  Knobs alone work too — `track 1 bright 30 noise 20` is a channel of its own with
  no preset name. A knob is clamped into range by the app's controls and refused
  by the parser if it is written outside 0–100, because a wrongly dialled sound is
  invisible in a file.
- `hold N` — how many **steps** a note on this channel rings for: `1` (the
  default), `2`, `4`, `8` or `16`, and anything in between. One step is a note
  per step — a click, or a melody — and sixteen is a whole bar of the default
  grid. This is the channel's note length, and it is why a chord can be written
  once per bar instead of on every step:

  ```
  track 3 "PAD" wave sine hold 8
  ```

  A track plays ONE note at a time, so a new note on a channel releases the one
  still ringing there. Two channels that hold different lengths is the usual way
  to get a pad and a lead out of the same four tracks.
- `level L` — how LOUD this channel sits in the mix, `0`–`100` (`100` is the
  default, `0` is silent). This is the third and last thing a channel IS: `voice`
  says what it sounds like, `hold` says how long its notes are, and `level` says
  how far forward it sits. It is what makes a bass support a melody instead of
  fighting it:

  ```
  track 1 "LEAD"  voice lead   level 100
  track 2 "BASS"  voice bass   level 65
  track 3 "PAD"   voice pad    hold 4 level 45
  track 4 "HAT"   voice hat    level 30
  ```

  Two things this is NOT:

  - **`level 0` is not a mute.** A level of 0 is silent but still ON, and a
    script, a file or the mixer can raise it. A mute is a *decision not to
    play this channel at all*; a level is *where it sits when it plays*. The
    difference is visible in the app: a muted channel is struck through, a
    channel at `0%` shows an empty bar in the warning colour.
  - **A level is not the master volume.** `volume 70` sets the whole app's
    output level and is deliberately NOT part of the song (see the table at the
    end of this page): it belongs to the room, not the music. `level` is per
    channel and IS part of the song, so a balanced song stays balanced when it
    is opened somewhere else.

  `SOLO`, the `O` box on a mixer strip, has no script equivalent on
  purpose. It is a way of LISTENING - "let me hear just the drums" - so it is
  never saved, never written to a file and never costs an undo step. A script
  describes a song, and a solo is not part of one.
- `pan P` — where this channel sits **between the speakers**, `-100` (hard left)
  to `100` (hard right), with `0` dead centre. It is where the channel is, the
  way `level` is how loud and `voice` is what it sounds like:

  ```
  track 1 "LEAD"  voice lead  pan C       # centre, the default
  track 2 "BASS"  voice bass  pan L20     # a little left
  track 3 "HAT"   voice hat   pan R35     # a little right
  ```

  Four spellings, because all four are how a person writes it, and they mean the
  same two numbers:

  | Write | Means |
  | --- | --- |
  | `pan -40`, `pan 40` | a signed amount: minus is left, plus is right |
  | `pan L40`, `pan R40` | the same, spelled with the ear it favours |
  | `pan C` | centre — also `center`, `centre`, `mid`, `middle` |

  A value outside `-100`..`100` is an error, not a clamp, like `level`.

  **A centred channel is exactly as loud as it was before pan existed.** The pan
  law is constant-gain, not equal-power: moving off centre turns DOWN the ear you
  are moving away from rather than turning up both, so `pan C` is a gain of 1 in
  each ear and adding a `pan` to nothing changes nothing. The trade is that the
  middle is a touch louder than the sides; for keeping a bass and a lead from
  fighting, that is the right one.

  What to pan: spread a pad and a lead apart, nudge the hats off-centre, and
  leave the kick and the bass centred — low frequencies carry no direction, and
  pulling a bass to one side just makes the mix lean.
- `glide G` — how much this channel **slides** from one note into the next,
  `0` (the default: every note starts at its own pitch) to `100` (the slide takes
  the whole of the note). A percentage of the NOTE rather than a time, so a slide
  means the same thing at any tempo:

  ```
  track 1 "LEAD"  voice lead  glide 30   # a quick scoop into each note
  track 2 "BASS"  voice bass  glide 15   # a fretless slide between roots
  ```

  The slide starts at the pitch this channel **last played** and ramps to the new
  one, which is the scoop of a singer or a fretless bass — the thing that makes a
  lead line read as played rather than typed. A channel is monophonic, so "the
  note before" is always unambiguous, and the first note of a song has nothing
  behind it to glide out of, so it simply starts in tune.
- `vibrato B` — how much this channel's pitch **wobbles**, `0` (the default:
  steady) to `100` (as wide as this app goes). The wobble is at one fixed rate —
  it is an ornament, not a note — and it fades IN over the first fraction of a
  note, so a long held note starts clean and ends alive:

  ```
  track 3 "PAD"    voice strings  vibrato 25
  track 1 "LEAD"   voice flute    vibrato 40
  ```

  What it is for: a sustained note that is perfectly steady sounds synthetic, and
  a little vibrato is what a wind player or a singer does without thinking about
  it. What it is not for: drums, or anything short enough that the wobble never
  gets going.
- `strum S` — how far this channel **rolls a chord**, in STEPS: `0` (the
  default: every note of the chord lands on the step, a block) to `4` (the chord
  spread across four steps). A span rather than a time, so it means the same
  gesture at any tempo:

  ```
  track 1 "GTR"  voice pluck  strum 1   # a quick strum inside one step
  track 2 "HARP" voice glass  strum 2   # a lazy roll across two steps
  ```

  The first note starts on the step and the last arrives `S` steps later, so a
  chord of three rolled with `strum 1` lands a third of a step apart. A channel
  that plays one note per step, or says nothing, is unaffected — `strum` is what
  takes a chord written in ONE cell (`C-4,E-4,G-4`) and rolls it.
- `robin R` — how much this channel's successive hits **differ from one another**,
  `0` (the default: every hit is the hit as written) to `100` (as far apart as the
  app goes). It is a **round-robin**, not a random number: the channel walks a
  fixed four-hit cycle, so the same song plays the same way every time, in the app
  and in an export.

  ```
  track 2 "SNARE" voice snare robin 60   # hit it again and it is not the same hit
  track 5 "SHKR"  voice hat   robin 40   # a shaker that never sits quite still
  ```

  The difference is small on purpose — a couple of cents flat or sharp, a few
  percent of level, a little brightness — because this is a performance rather
  than a second instrument. The FIRST hit of a channel is always the note exactly
  as written, so the downbeat is where the channel asked for it and only the hits
  after it drift; `robin 0` is what every song written before this means, and a
  channel that plays a single note per bar barely notices it.
- `drift D` — how far this channel's pitch **wanders**, `0` (the default: every
  note holds the pitch it was written at) to `100` (about eighteen cents either
  way). A worn transport does not turn at a constant speed, so the pitch drifts
  slowly (wow) with a faster tremor on top (flutter) — the same wobble the `tape`
  effect carries, but on its own, on a channel that is not on tape at all:

  ```
  track 3 "PAD"  drift 40   # a worn tape under a pad, no saturation asked for
  track 1 "PIANO" drift 20  # a piano heard off a record that has been played a lot
  ```

  What it is for: a lo-fi or vaporwave part that should sound like a machine
  that is tired rather than merely filtered. What it is not for: anything that has
  to hold a clean pitch, because a wobble you notice is a wobble that went too
  far. Because `drift` is a plain value rather than an effect, an `automate` lane
  can MOVE it — see `automate` below — which is the difference between a static
  wobble and a tape that tires.
- `touch T` — how much a hit's **tone follows how hard it was struck**, `0` (the
  default: velocity is a level and nothing else) to `100` (a note at velocity 0 is
  up to 30 points darker). A soft hit on a real instrument excites fewer overtones,
  so it is not merely a quieter copy of a loud one:

  ```
  track 3 "BASS" voice bass  touch 70   # a soft note is darker as well as quieter
  track 1 "PNO"  voice pluck touch 50   # a played keyboard, not a switched one
  ```

  It only ever **darkens**: at full velocity the note is exactly as written,
  whatever the setting — which is why it can be added to a part that was already
  fine. What it is for: a keyboard, a bass or a drum part whose soft notes should
  sit back IN TONE rather than only lower in level. What it is not for: a synth
  whose character is a flat spectrum, where there is nothing for a soft hit to
  lose.
- `verb S` — how much of this channel is fed to the song's **reverb**, `0`
  (none: the channel is dry) to `100` (all of it, **the default**). It is a
  SEND, not an effect: the hall itself is the song's `reverb`, and this says how
  much of this one instrument is standing in it.

  ```
  track 1 "LEAD"   voice bell    verb 80    # out in the hall
  track 2 "BASS"   voice bass    verb 0     # right at the front, dry
  track 3 "SNARE"  voice snare   verb 40
  ```

- `echo S` — how much of this channel is fed to the song's **echo**, `0` to
  `100`, the same shape. The default is `100` for both, which is why a song that
  never mentions them still puts every channel in whatever room it asked for.

  ```
  track 4 "SNARE"  voice snare   echo 60    # the snare answers itself
  track 2 "BASS"   voice bass    echo 0     # no repeats on the low end
  ```

  What the two are for: a room is ONE place, and a send is what lets one
  instrument sit further back than another. The rules that work: keep the bass
  and the kick dry (`verb 0`, `echo 0`) so the low end stays tight, and send the
  things you want to hear ring — a snare, a bell, a lead in a big hall. A send is
  read after the channel's LEVEL, so turning a channel down takes its reverb with
  it, and it is applied before the channel is placed between the speakers, so a
  hard-left channel is in the room just as much as a centred one.

  Both are the same arithmetic as everything else: `verb 100` multiplies the
  channel by exactly 1, which is why songs written before sends existed sound
  exactly as they did, and `verb 0` multiplies it by nothing at all.
- `duck P` — how far this channel pushes the **rest of the mix** down while it
  plays, `0` (the default: nothing moves) to `100` (the other channels are gone
  for the length of the note). It is the pump: the kick that makes the bass step
  back on every hit, the lead that clears a hole for itself.

  ```
  track 1 "KICK"  voice kick   duck 70
  track 2 "BASS"  voice bass   duck 0     # no need to say it: 0 is what it already is
  ```

  What it is for: a four-on-the-floor kick and a bass line that occupy the same
  low end. Without it the two fight and the mix sounds muddy; with it the bass
  breathes in time with the drums, which is the sound of house, of most pop since
  the eighties, and of any record where the low end stays clean at volume. What it
  is **not** for: everything. One channel ducks — the drums, or the lead vocal —
  and the rest of the mix is what steps back.

  Two rules that make it behave:

  - **It ends with the note.** The others come back over the length of the hit
    that pushed them down (with a floor of a few milliseconds, so a very short
    hit is a pump rather than a click). A ducked channel does not need a second
    setting to release: the note's own length is the release.
  - **It is arithmetic, not routing.** There is no "the kick ducks the bass" in
    this language — there is one number on the channel that hits, and everything
    else is what it pushes. That is one value to write, one to save and one bar
    to drag, and a surgical duck (the kick, but only the bass) is an automation
    job for a later phase.

  It sits **before** the channel's level and behind its effects, which is the
  only place it can go: the sends tap the level, so a dip in front of it takes
  the reverb and the echo down with the channel (a ducked bass must not leave its
  tail in the hall through the kick), and being behind the effects means a driven
  channel is not re-driven by its own duck.

  **`0` is not a small duck — it is no duck at all.** At `0` no channel builds a
  dip node, no file writes a key and no script writes a word, which is what makes
  it safe to add to every song already written.
- `groove F` — this **part's own feel**, overriding the song's `groove` for this
  channel only. `F` is one of the same names the song-level word takes
  (`straight`, `backbeat`, `offbeat`, `shuffle`, `laid-back`, `pushed`,
  `boom-bap`, `swing-16`, `d-beat`, `human`, and their aliases).

  ```
  track 4 "HAT"   groove shuffle    # a shuffled hat under a straight song
  track 2 "BASS"  groove laid-back  # the bass leans, the lead does not
  ```

  What it is for: a pocket. A feel belongs to a PLAYER — one leans and another
  does not — so a straight song with a shuffled hat, or a laid-back bass under a
  pushed lead, is one word per part rather than a whole song's compromise. A
  channel that says nothing follows the song, which is every channel of every
  song written before this existed.
- `humanize P` — how much this channel is **played rather than typed**, `0` (the
  default: a machine) to `100` (unmistakably by hand). It is the `human` feel's
  wobble with an amount, on one part: a little late, a little early, and a
  little quieter, differently on every step.

  ```
  track 2 "GUITAR"  humanize 35
  track 5 "PAD"     humanize 15
  ```

  What it is for: the difference between a part and a performance, which is  the whole sound of lo-fi, live jazz and most singer-songwriter records. Two rules
  make it safe: it is **deterministic** (a seeded hash of the step and the
  channel, so the same bar wobbles the same way every time and an exported file
  is the file you heard), and it **never makes a note louder** than it was
  written, nor pushes it past the next note. At `0` it adds exactly nothing.
- `poly M` — how many notes this channel may hold **at once**, `1` (the default:
  one note at a time) to `8`. It is about notes that overlap IN TIME: below it an
  overlap is cut short the moment the next note starts, above it the overlap is
  heard.

  ```
  track 5 "PAD"    hold 16 poly 4    # four held notes ring through each other
  track 3 "BASS"   poly 2            # a pedal under a moving line
  ```

  Why it matters: "one channel is one voice" is the line the whole notation was
  built on, and it is why a long `hold` used to mean a channel could only ever
  sound one note, no matter how long that note was. With `poly`, a held note rings
  under the next one instead of being cut by it, and a pedal tone is one pitch
  rather than a channel spent on it.

  **It is also what a chord in a cell needs.** `poly` is about notes that overlap
  in time, and a chord written with commas (`C-4,E-4,G-4`) is several notes at the
  SAME time — so the setting decides whether that chord can be written at all: a
  cell wider than its channel is refused rather than thinned out (see **§2**).
  On a channel that is wide enough, `chord 0 1 Am` lands in one cell instead of
  spending three channels.

  **When it runs out, it steals.** The oldest note goes first — it has been heard
  longest, so its loss is least noticed — and the QUIETEST among notes that began
  together. The rule lives in one function that playback and export both call, so
  a file cannot lose a different note than the app did.

  `poly 1` is the app's own history: a new note takes the one still ringing, so a
  channel nobody widens is played — and exported — exactly as it was.

  **By hand:** the `DUCK` column on `F5` — one bar per channel, `P` (the pump) to
  walk the selected channel's value, click where you want it. The row that is pumping is
  drawn in the warning colour, because it is the one number on that screen that
  moves the OTHER rows.
- `shape S` — which PART of the sound survives this channel's filter: `round`
  (the default — the low-pass a note has always been), `sharp` (a high-pass: the
  bottom goes, so the note turns thin and pointed), `nasal` (a band-pass: only
  what sits near the cutoff survives, so the note takes on a vowel) or `hollow`
  (a notch: the middle is scooped out and the top and bottom both stay).

  ```
  track 2 "STAB"  shape sharp             # a telephone vocal, a filtered breakdown
  track 4 "BASS"  bright 45 shape nasal   # acid: the vowel sits at the cutoff
  track 3 "CHORD" shape hollow          # a scooped mid that leaves room for a voice
  ```

  **`bright` keeps its meaning, and here is what that means.** The knob still
  moves the CUTOFF — the corner of a low-pass or high-pass, the centre of a band
  or a notch — so with `sharp` a HIGH `bright` removes MORE (the thinnest sound is
  at the top of the knob), and with `nasal` `bright` chooses which vowel you get.
  Flipping the knob for three of the four would mean a number whose direction
  depended on a word written elsewhere on the line, which is the kind of hidden
  state this language refuses.

  The spellings a handbook would use work too, since they are aliases:
  `lowpass`/`lp`, `highpass`/`hp`, `bandpass`/`bp`, `notch`. An unknown shape is
  refused with the list rather than rounded to a low-pass — a filter is the whole
  point of the line. `round` needs no line at all, and a channel that never names
  one builds the exact note it always built.

  **By hand:** `F6` lists the four with what each is for; there is no menu row for
  it yet, the same deferral the automation lanes and a part's own feel have.
- `drive P`, `crush P`, `cab P`, `tape P`, `radio P`, `vinyl P`, `chorus P`,
  `punch P`, `tilt P`, `gate P` — the channel's ten **effects**, each a percentage
  `0`–`100` with `0` meaning **off**:

  | Effect | 0 means | 100 means | What it is for |
  | --- | --- | --- | --- |
  | `drive` | clean | crushed | pushing the channel until it bites: a fuzzed guitar, a squelching 303 |
  | `crush` | pure | gritty | throwing away the fine detail: chip grit, lo-fi dust |
  | `cab` | open | boxed | a speaker box round the channel: rock and metal guitars, a shoegaze wall, a lo-fi drum bus |
  | `tape` | clean | worn | a whole tape machine in one number: soft saturation, a wandering transport, a hiss bed |
  | `radio` | full | tinny | a telephone line: the band narrows to a voice and the signal inside it gets coarse |
  | `vinyl` | silent | crackling | a record under the part: a quiet surface hiss with the crackle of dust and scratches |
  | `chorus` | dry | wide | a drifting copy beside itself: one synth that sounds like two |
  | `punch` | flat | snappy | holding the peaks down so the hits jump out |
  | `tilt` | flat | bright | leaning the channel toward the top, to make room for something else |
  | `gate` | open | tight | shortening every note: staccato strings, a bass that stops dead |

  ```
  track 1 "LEAD"  voice lead   drive 45 cab 55 tilt 30
  track 2 "BASS"  voice bass   drive 25 crush 20
  track 3 "PAD"   voice pad    chorus 60 tilt 20 gate 40
  track 4 "KICK"  voice kick   punch 70
  track 5 "KEYS"  voice organ  hold 8 tape 40 vinyl 15
  track 6 "VOX"   voice formant radio 65 level 62
  ```

  **`0` is not a small amount of the effect — it is not the effect at all.** A
  channel whose effects are all `0` is built through exactly the graph it was
  built through before effects existed, which is what makes it safe to add ten
  knobs to every song already written. All ten default to `0`, so a line that
  names none of them says nothing about them.

  **Things worth knowing before choosing a number.** Each of these is a sentence
  about one effect that no amount of turning the knob will teach you:

  - **`tilt` only leans one way.** It is `flat` at `0` and `bright` at `100`,
    because a knob that leans both ways needs its middle to be OFF, and OFF has
    to be `0` — the value every old file reads as. For DARKER, turn the channel's
    `bright` knob down (or a layer's), which is the same tone control one scope in.
  - **`gate` is a note length, not a filter.** It shortens what is written on the
    channel (`100` sounds a quarter of the note); it is not a noise gate that
    opens on loud notes. It exists because "stops dead" is a sound people reach
    for, and it is honest about being that sound.
  - **`radio` narrows a part; it is not a mix effect.** A telephone band takes the
    bottom out of everything at once, which on a whole record reads as a broken
    radio rather than as a mix — so reach for it on a vocal, a hook or a stab, and
    give the part a `level` of its own if narrowing it made it quiet. There is no
    make-up gain here on purpose: how loud something is, is a fader's job.
  - **`tape` is three things at once, and that is deliberate.** The peaks are
    rounded off, the transport wanders slightly in pitch (wow at two rates plus a
    fast flutter), and a quiet hiss is added under everything. Each of the three
    is a thing this app can also do alone — `drive`, `chorus`, the `noise` knob —
    and none of them is what anybody means by "put this on tape", so the three
    arrive together behind one number. It is the lightest-touch effect here: `20`
    on a whole mix is audible as AGE rather than as a sound.
  - **`vinyl` is a record, and it is added rather than run through.** The part is
    not filtered or narrowed at all — a quiet surface hiss with the odd crackle is
    summed in beside it, which is why `vinyl` at `10` dulls nothing and is safe on a
    whole mix. It pairs with `tape` the way a found record pairs with a tape: `tape`
    is the medium the music was put ON, `vinyl` is the medium it was found OFF, and
    a part that is both is a sample of a record somebody taped.

  **The same effects on the whole mix** are written on a `master` line of their own
  (`master drive 20 tilt 15`), which is the tape the band was printed to rather
  than a guitar amp on one part. By hand they are the mixer's `WHOLE MIX` panel
  (`F5`, bottom right, paged by `Tab` or its own pager); see the `master`
  statement above.

  **By hand:** `F7`'s `FX` page (`Tab`, or the `FX` button) draws these ten as
  dials on the selected channel — the same range, the same `10`-step, the same
  words, because both go through `clampEffect`. An effect belongs to the channel
  rather than to the sound, so it is a row on the `track` line and not a `layer`
  one, and two channels may share a saved sound with two different sets of
  effects.

  One spelling moved when these arrived: **`chorus` used to be an alias of the
  `thick` knob** and is now the effect. A script that meant the knob writes
  `thick` (or `width`); a saved song never noticed, because a file writes the
  knob's own name.
- `on` / `off` — unmuted / muted.

The settings are read from the RIGHT — the name, then any of `voice V`,
`wave W`, `hold N`, `level L`, `pan P`, `glide G`, `vibrato B`, `strum S`,
`robin R`, `touch T`, `drift D`, `verb S`,
`echo S`, `duck P`, `groove F`, `humanize P`, `poly M`, `shape S`, the nine effects
and the nine knobs, in any order, then `on`/`off` — so
`track 2 BASS
voice bass hold 4 level 65 pan L30 verb 0 off` reads as a sentence. Only the

trailing `on` or `off` is a flag;
anywhere else it has to be quoted to be a name, and a bare setting word left
among the name words is an error rather than a name. Because `voice`, `bright`,
`sweep`, `duty`, `noise`, `attack`, `decay`, `ring`, `release`, `thick`, `level`, `pan`, `glide`,
`vibrato`, `strum`, `robin`, `touch`, `drift`, `verb`,
`echo`, `duck`,
`groove`, `humanize`, `poly` and `shape` are
settings (as are the four shapes themselves, `round`, `sharp`, `nasal` and
`hollow`), a channel genuinely called one of those must be quoted: `track 1
"PAN" voice pad` — or `track 1 "DUCK" voice kick`.

Defaults per channel index, cycling: `1 square`, `2 triangle`, `3 sawtooth`,
`4 sine`, then the cycle repeats for channels 5–8, each with the neutral knobs
(`bright 70`, `duty 100`, no noise, no attack, `ring 70`, no thickness) — the sound every
song had before voices existed. Leave `voice`, `wave` and the knobs off a line
and a channel keeps that neutral sound.

### `layer TRACK LAYER …` — stack more sound on one channel

A channel's sound is its **voice** plus a **stack** of layers above it. The voice
*is* layer 1 — so `layer 2 1 wave saw` and `track 2 wave saw` are the same edit —
and a channel may have up to **4 layers in all**: the voice and three more. Each
layer is a waveform, the same nine knobs a voice has, and three things a voice
does not have: how far it is **transposed**, how far it is **detuned**, and how
loud it is **within the instrument**.

```script
new
song "STACKED LEAD"
tempo 140
tracks 3

track 1 "LEAD" voice lead
layer 1 2 wave saw detune -9 gain 60
layer 1 3 wave saw detune 9  gain 55

track 2 "BASS" voice sub
layer 2 2 octave -1 gain 45

track 3 "HAT" voice hat

C-4 C-2 C-6
.   .   .
E-4 .   C-6
.   .   .
G-4 .   .
.   .   C-6
```

```
layer 1 2 wave saw octave 1 detune -9 gain 60 bright 80
layer 1 2 clear
layer 3 2 bright 40
```

The first number is the **channel**, the second is the **layer** of it — the same
two-coordinate shape `note ROW TRACK` uses. Everything after them is a setting:
`wave W`, `octave O`, `detune C`, `gain G`, and the nine knobs, in any order.

- **Layer 1 is the voice, so it has no octave, no detune and no gain.** A voice is
  in tune with itself at full level by definition, which is exactly what keeps
  every song written before layers existed sounding the same. Writing one of the
  three on layer 1 is an error that names the fix: put the transposition on a
  layer above it, or use `level` for how loud the channel sits in the mix.
- **A new layer is a copy of the one below it.** So `layer 1 2 wave saw detune -9`
  is a second saw with the voice's brightness, envelope and width, moved nine
  cents — which is why a stack is described in a few words rather than rebuilt
  from nothing. A bare `layer 1 2` is therefore a real instruction: *another
  copy, unchanged*.
- **A stack has no holes.** Layer 2 can be added to a one-layer channel, layer 3
  only once layer 2 exists, and so on. Writing past the next free layer is an
  error naming the line to write instead.
- **`clear`** (or `remove`) takes a layer out and shifts the ones above it down,
  the same way removing a bar from the order does. It is the whole line or
  nothing — "remove it and set it" is two instructions.
- The three fields, and what their ends are:

  | Field | Range | Meaning |
  | --- | --- | --- |
  | `octave O` | -4 … 4 | whole octaves: `1` doubles it an octave up, `-1` an octave down, `0` is in unison |
  | `detune C` | -100 … 100 | cents out of tune: a few is warmth against another layer, a lot is a chorus |
  | `gain G` | 0 … 100 % | how loud the layer is *inside* the instrument, `100` full |

- **A stack adds level.** The voice is at `gain 100`, so three layers at `100` is
  a channel around ten decibels louder than one. Three or more layers all left at
  full gain come back as an advisory after APPLY — an observation, not a refusal,
  because it is a decision you are allowed to make and `gain 45` is one word away.

What a stack is for, in the app's own vocabulary: **two saws a few cents apart**
is a supersaw, **a layer an octave down at `gain 45`** is an octave bass, **a
bright layer over a dull one** is a plucked or struck attack, **an octave-apart
pair** is an organ, **a sine under a triangle** is a bell, and **two pads with a
little `detune` between them** is a choir.

A layer belongs to a CHANNEL, the way the voice does, so a layer line names the
channel it applies to and a script may write as many layers as the song has.
SAVE AS SCRIPT writes each layer as the DIFFERENCE from the one below it, so a
stack survives a save and a re-open with the same numbers — and a supersaw reads
as three short lines a few cents apart rather than three walls of knobs.

`voice` is not a layer setting: it names a whole CHANNEL's sound, which is layer
1 (`track 2 voice pad`). For a layer above it, write the waveform and the knobs
out.

### `mute N` / `unmute N` — mute a channel

```
mute 4
unmute 4
```

Exactly the `on`/`off` flag of `track`, for when that is all you want to say —
and the unambiguous way to say it, since a bare `off` at the end of a `track`
line is a flag but a lone `off` where a name should be is a mistake.
A muted channel still holds its notes; they just do not sound (and you can hear
the difference the instant you unmute it in the app).

### `pattern N [NAME…]` — choose the pattern being written

```
pattern 1 "VERSE"
pattern 2 "CHORUS"
pattern 9
```

One whole number, 1–64. Patterns that do not exist yet are **created** (along
with any skipped over, which come out empty and named `PATTERN n`).

This statement does two things: it sets which pattern grid rows and `note` /
`erase` / `clear` statements target, and it **resets the row cursor to 0**,
because a new pattern starts from its first step.

A name is optional and upper-cased.

### `order N N N…` — the bars the song plays, in order

```
order 1 2 1 3        # verse, chorus, verse, bridge
order 1 1            # one bar twice
order 2              # just the second pattern, played alone
```

Patterns are the bars; the order is the SONG. A song with no `order` line plays
its first pattern on a loop, which is what every song did before there was an
order — so leaving it out is never wrong, and adding it is how a loop becomes an
arrangement.

- Each number is a pattern, **1-based**, exactly as `pattern N` addresses them.
- A pattern the song does not have yet is **created**, so `order 1 2 1` on a fresh
  song is a working three-bar song with bar two waiting to be written.
- Up to 64 bars. The order then **loops**: after the last bar the song starts
  again.
- An unusable value is an error — a wrong order plays the wrong music, and a
  played-wrong song is exactly the mistake a text notation exists to prevent.

`pattern N` and `order N N` answer two different questions, and it is worth
keeping them apart: **`pattern` is where your notes go** while you are writing,
and **`order` is what the listener hears**.

### `clear [N]` — empty a pattern

```
clear          # the pattern named by the last `pattern` statement
clear 3        # pattern 3
```

The number is optional; with none, the pattern named by the last `pattern`
statement is cleared. More than one argument is an error. Clearing a pattern
does not remove it from the song.

### `copy A B` — duplicate a pattern

```
copy 1 2
```

Copies pattern `A`'s steps **and name** into pattern `B`, creating `B` if it does
not exist (and any patterns in between). After the copy, `B` is an independent
copy: editing it will not change `A`. The most useful statement in the language —
it is how you turn one bar into a song.

### `note ROW TRACK PITCH [VELOCITY] [ARTICULATION]` — write one cell exactly

```
note 0 1 C-4      # step 0, channel 1
note 0 2 C-4 40   # the same step, channel 2, played softly
note 4 3 D-5~90   # the velocity may ride on the pitch instead
note 4 2 C-4 >*3  # step 4, channel 2: slide in, three hits
note 6 1 C-4,E-4,G-4  # step 6, channel 1: a triad in ONE cell (needs `poly 3`)
note 8 2 .        # step 8, channel 2 -> erase it
```

- `ROW` — **0-based**, 0 to 15.
- `TRACK` — **1-based**, 1 to the channel count.
- `PITCH` — any pitch token **or a comma run of them** (a chord in one cell, see
  **§2**), or an empty token to erase the cell — an empty token empties every note
  the cell held.
- `VELOCITY` — optional, 0–100: how hard the note is hit. Give it **once** —
  either as a value of its own or on the pitch as `D-5~90`, the same spelling a
  grid row uses. Omit it and the note is played at full force.
- `ARTICULATION` — optional: how the note is PLAYED. `>` slides into it, `*3` is
  three hits inside its own step, `!` flams it and `!!` drags it, `^2` scoops up
  onto it and `v2` falls away from it, `>*3` is both — see **§2**. Written as its
  own value (`note 0 1 C-4 >*3`, or the word `flam` on a `drum` line) or on the
  pitch, exactly as a grid row writes it.
  The two optional values may be given in either order and at most once each,
  which is what makes the tail of a `note` line a SET rather than a sequence.

Use it to patch individual cells of a copied pattern. Grid rows are for writing
music; `note` is for editing it.

**`follow` in the pitch's slot** makes the line a FOLLOWER: `note 0 4 follow`
writes the song's progression's ROOTS from that row on, one note per chord — the
bass line under a loop. It takes nothing after it, and there has to be a
`progression` above it. See **`progression`** above.

### `chord ROW TRACK CHORD` — write a whole chord at once

```
chord 0 1 Am        # step 0, channels 1-3: A C E
chord 4 1 Dm        # step 4, channels 1-3: D F A
chord 8 2 C maj7    # step 8, channels 2-5: C E G B
chord 0 1 6         # the sixth chord of the song's key
```

Like `note`, it is addressed by `ROW` and `TRACK` — but the third value is a
whole chord, and its notes are written to that channel **and the ones after it**,
one note each, at the same step. That is what a chord is in a tracker: several
channels sounding together.

The chord is named in one of two ways:

- **By name** — a root and a shape: `Am`, `F#7`, `Bbdim`, `Caug`, `Cmaj7`,
  `Dm7`, `Edim7`, or a bare root (`C`) for a major chord. Spaces are allowed
  (`C maj7`) and case does not matter — with one exception: a capital `M7` is a
  major seventh (`CM7`) and a small `m7` is a minor one (`Cm7`). The chords are
  also spelled the short way a chord chart spells them, and these are exactly the
  symbols the piano prints in chord mode, so a reader can type back what they
  saw: `o` for diminished, `+` for augmented, `o7` for a diminished seventh, and
  `m7b5` for a half-diminished one. The root is a pitch class, so it takes the
  octave the script is currently using — `octave 4` puts `Am` at A-4, C-4, E-4.

The **color shapes** beyond the triads and sevenths are the ones most records are
actually made of, and each is spelled the way a chord chart spells it:

| Shape | Symbol | Notes above C | Reach for it when |
| --- | --- | --- | --- |
| power | `5` | `C G` | a rock rhythm guitar: no third, so distortion stays a band rather than a fuzzbox |
| suspended 2nd | `sus2` | `C D G` | emo and indie: a chord that never resolves |
| suspended 4th | `sus4` (or a bare `sus`) | `C F G` | the one that RESOLVES down to the third |
| sixth | `6` | `C E G A` | vaporwave, lounge, doo-wop: sweet where a seventh is sad |
| added 9th | `add9` | `C E G D` (the 9th an octave up) | sparkle over a plain triad, without a seventh's weight |
| ninth | `9` | `C E G Bb D` | funk, R&B and vaporwave: the dominant chord, dressed |

A ninth is an INTERVAL rather than a scale degree, so `add9` and `9` reach past
the octave — the pitch arithmetic handles that, and `clampMidi` keeps the result
inside the range the grid can print. A `5` is two notes, so it is the one shape
that fits a single cell without widening the channel past `poly 2`.
- **By degree** — a number `1`–`7` meaning "the Nth chord of the song's key". The
  app builds it by stacking every other note of the scale, so it is always in
  key and always the right quality. In `key D minor`, `chord 0 1 6` writes
  **Bb D F**; in `key C major`, the same line writes **A C E**. This is the form
  that teaches: whether a chord is major or minor is a consequence of the key,
  not a word you have to choose.

A chord needs somewhere to go: on a channel wide enough to hold the whole thing
(`poly 3` for a triad, `poly 4` for a seventh) the notes land in **ONE cell** of
that channel; on a channel that holds one note at a time the notes **spread
across the channels after `TRACK`** — `Am` uses 3 and `Cmaj7` uses 4 — which is
how a tracker has always written one. Asking for more channels than the song has
when the channel is narrow too is an **error**, with the count in it, rather than
a silent partial chord.

**`follow` in the chord's slot** makes the line a FOLLOWER: `chord 0 1 follow`
writes the song's progression's CHORDS from that row on, one chord per chord of
the loop, each held for its own length — the keyboard part under everything else.
The channel needs `poly` at least the width of the widest chord in the loop, and
there has to be a `progression` above the line. See **`progression`** above.

### `chord ROW TRACK CHORD arp [DIR] [STEPS]` — play the chord one note at a time

```
chord 0 1 Am arp               # A C E, one per step
chord 0 1 Am arp up 8          # eight steps, climbing an octave as it runs out
chord 0 1 Am arp down 6        # the same run read backwards
chord 0 1 Am arp updown 8      # up and back, A C E C A C E C
chord 4 1 C maj7 arp asc 12    # `asc` is `up`; the name may still be two words
```

`arp` spreads the SAME chord over TIME instead of across channels: the notes go
one per step, on the channel the line names, in the chord's order. Nothing else
about the statement changes — the chord is still named the same two ways, and a
degree still follows the key — which is why this is a modifier rather than a word
of its own (the language's own rule prefers it, and the file never learns that
the notes were written by a generator: an arpeggio is a grid with notes in it).

- **`DIR`** is `up` (the default), `down`, or `updown`, with the aliases a hand
  reaches for: `asc`/`ascending`, `desc`/`descending`, and `both`.
- **`STEPS`** is how many steps the run fills, `1`–`512`. Left out, it is one step
  per note of the chord — the run a hand plays when it names one.
- **How it climbs.** The chord's tones in order, then the same tones an octave
  up, then two: an eight-step run of a triad is the chord twice and a bit, on its
  way up. `down` is that run read backwards, so a descent starts on the note the
  climb would have arrived at, and `updown` walks up and back without playing the
  turning note twice (`A C E C`). How many octaves a run climbs is not a second
  number to get wrong — it is what happens when the tones run out. A note that
  would leave `C-0..B-8` is clamped into it.
- **`arp` needs ONE channel**, not one per note: it is a single instrument
  playing the chord. So `tracks 1` is enough for `chord 0 1 Am arp`, where a plain
  chord would need three. A run that would pass the end of the pattern is an
  error naming the rows it needs.

**Three gestures that are NOT chord words, and what they are.** The roadmap named
`strum`, `roll` and `flam` alongside `arp`, and each one is arithmetic the app
already has — so the language refuses the word and says which line does it:

| Gesture | What it actually is |
| --- | --- |
| `strum` | `arp` on a channel that HOLDS: `track 1 hold 4` makes the run's notes ring over each other, which is what a hand does and what milliseconds apart cannot be written on a grid of steps. |
| `roll` | a note's `*N` with the channel's `hold`: `A-1*8` on a channel with `hold 4` is eight hits across four steps, evenly spaced. |
| `flam` | a soft hit on the step before (`A-1~40` then `A-1`), or `*2` inside one step. Its grace note is a fraction of a step, which a grid of steps has no room for. |
| `bend` | `^N`/`vN` on the cell — the note moving its OWN pitch, which is the only way a grid can write it. A `>` slides in from the note before, which is not the same gesture. |

A fourth, `fill`, is hits spread over a RANGE of steps rather than inside one —
which the language now has a way to say (`rows`, below), so a fill is a short
figure written once and tiled with `rows 0 to 3 repeat 4`.

### `arp …` — the ARP page's dials, and the run they write

```text
arp direction updown
arp octaves 2 rate 2 gate 60
arp mode source
arp write 0 1 Am
arp off
arp hear on
```

`chord ROW TRACK CHORD arp …` spells a walk ON the line. `arp …` STORES the same
walk in the song — the dials the ARP page draws — and `arp write ROW TRACK CHORD`
performs it from those dials instead. It is the one statement that exists because
a page needs state: a run somebody dialed should reopen the way they left it,
rather than have to be re-derived from a line they have to keep.

- **`arp direction up` | `down` | `updown`** — which way the walk goes, with the
  modifier's own aliases (`asc`, `desc`, `both`).
- **`arp octaves N rate N gate N`** — the three numbers, in pairs and in any
  order: how many octaves the run climbs (`1`–`4`), how many steps each note
  occupies (`1`–`4`, so `rate 2` plays every other step), and how hard each note
  lands (`0`–`100`). `gate` writes each note's VELOCITY, and at the default
  `gate 100` a written run is byte for byte the run the modifier writes.
- **`arp mode chord` | `source`** — which chord a run walks: `chord` the one named
  on a `write`, `source` the song's own loop. A stored setting, so it round-trips.
- **`arp write ROW TRACK CHORD`** — commit the run those dials describe, into the
  pattern `pattern` selected, exactly as `chord ROW TRACK CHORD arp …` would for
  the matching direction and octaves. **The cells are the same cells**: one
  function decides both — `generateArp`, over the modifier's own walk — so a
  preview and a write cannot disagree. The run stops when it runs out of chord or
  out of room, so it never runs off the pattern.
- **`arp off`** — clear the stored dials, so the song once again writes no `arp`
  key and no new file version, exactly as it did before the page existed.
- **`arp hear on` | `off`** — whether the ARP page AUDITIONS the run as its dials
  move. A SESSION switch beside `page` and `live quantize`, not song data: it
  travels out in `settings`, banks no undo step and no file carries it, so a song
  opened from disk can never start making noise on its own. It is remembered even
  while the page is shut, so a script can turn hearing on and then `page arp` and
  the dials sound from the first nudge.

The dials are SONG data: a song that stores any writes an `arp` key and file
version `42`, and round-trips through `SAVE AS SCRIPT` and back. The NOTES a write
produced are ordinary cells — printed as grid rows, never as `arp` lines — because
an arp is notes in an order once written.

### `drum ROW TRACK DRUM [VELOCITY] [ARTICULATION]` — write one drum hit

```
drum 0 1 kick           # step 0, channel 1: a kick
drum 2 1 snare          # step 2: a snare
drum 4 1 hat~70         # step 4: a soft hat (the velocity may ride on the word)
drum 6 1 hat *3         # step 6: three hits — a gesture is its own value here
drum 8 1 wind 40 >      # step 8: a soft wind that slides in
```

The same line as `note`, with the PITCH replaced by the NAME of a drum:

- `DRUM` — `kick`, `snare`, `hat` or `wind`, case-insensitive. Anything else is
  refused with the list of the four, because a hit whose sound was guessed at is a
  beat with a hole in it.
- `VELOCITY` and `ARTICULATION` are exactly a `note` line's: how hard the hit is
  (`~70` on the word, or `40` as its own value) and how it is played (`>` slides,
  `*3` is three hits inside the step, `>*3` both), in either order and at most
  once each. On a `drum` LINE a gesture is its own value — `drum 0 1 hat *3`, the
  way it is on a `note` line; the attached spelling (`hat*3`) belongs to a grid
  row.

A drum hit writes the kit's own note — a kick is MIDI 36, a snare 38, a hat 42, a
wind 44 — so the grid, the note count, the file and an export need no special
case for it. See **§2** for what a drum cell is, and the export table in
[`09-song-files.md`](09-song-files.md) for what a kit channel becomes in MIDI.

### `rows A to B …` — a run of steps, and the four things a run can do

```text
rows 0 to 3 octave up       # rows 0-3, an octave higher
rows 4 to 7 octave down 2   # the next four rows, two octaves lower
rows 0 to 3 repeat 4        # that four-row figure, four times in all
rows 0 to 7 roll            # every hit in rows 0-7, four hits inside its step
rows 0 to 3 reverse         # those four steps, read backwards
```

The one statement in this language that names a RUN of steps rather than one
place: a `note` names a row, a `chord` names a row, a `track` names a channel,
and this names a stretch of time. It acts on the pattern `pattern` selected, the
way `note` and `erase` do, and there are exactly four things to do with a range —
move it, play it again, roll it, or read it backwards.

- **`A to B`** — the range, both ends included, written the way an `automate` lane
  writes its bars (`bars 8 to 15`). **Rows count from 0**, so `0 to 3` is the first
  four steps of the pattern, and a range has to stay inside the grid (`steps N`
  makes it longer). The two ends are given in order: `rows 4 to 1` is an error.
- **`octave up` / `octave down [N]`** — moves every note in the range by whole
  octaves, and nothing else: how hard a note is hit, whether it slides and whether
  it stutters all travel with the pitch. `N` is optional and means how many
  octaves (`rows 0 to 3 octave down 2`), 1–8. A note that would leave `C-0..B-8`
  is **clamped** into it rather than refused, the same rule the chord tool follows
  — the range is the guarantee, and an octave too many is a run that arrived at
  the edge. Empty steps are left exactly as they are.
- **`repeat N`** — plays the range again **from where it starts**, `N` times **in
  all**: `rows 0 to 3 repeat 4` writes rows 0–3 and then three more copies of them,
  filling rows 0–15. The count must be 2 or more (`repeat 1` is the range on its
  own, and is refused for the reason `arrange` refuses it and a cell refuses
  `*1`), and the copies must **fit**: four rows played four times needs sixteen
  rows, and a longer count is an error that names the rows it would need. The
  source rows are read before anything is written, so a figure that overlaps the
  rows it grows into still repeats what you wrote.
- **`roll [N]`** — retriggers every hit in the range **inside its own step**: `N`
  hits where there was one, evenly spaced and all at the same force, so the last
  one still ends where the note would have ended. `N` is optional and is the same
  range a cell's own suffix takes (`*2`..`*8`), 2–8 hits; `rows 0 to 7 roll` on its
  own means **4**. It is the same field `*N` writes, so a roll sounds through the
  engine, an export and a `.mid` exactly as a stuttered cell does — this is the
  way to say it once for a whole run of steps instead of a `*4` on every cell, and
  it is what a drum roll, a snare fill or a trap hat is. A step with **no note**
  is left empty (a roll ornaments a figure, it does not invent one); a DRUM is
  rolled like a note; and a cell carrying a **flam** loses its grace, because a
  grace and a stutter fill the same instant two ways and the line that says `roll`
  is the line about that instant.
- **`reverse`** — reads the range **backwards**, the last step first: the notes,
  their forces and their gestures all stay exactly as written and only the ORDER
  changes. It is the one transformation with no number, because there is exactly
  one way to read a run the other way — so anything after the word is refused. A
  swell played the other way is a shoegaze riser; a figure followed by its reverse
  is a call and its answer; an empty step reverses like any other, which is what
  makes a figure with rests sound like itself backwards rather than like a figure
  with its rests dropped.

**One statement per decision.** A transposed figure that is also a repeated one is
not one line: `rows 0 to 3 octave up` then `rows 0 to 3 repeat 4` — because moving
a run and playing it again are two decisions. Lines take effect in order, so they
compose for free, and none of them is a word the language has to teach: the
transformations are VALUES on the statement, which is the same preference that
made `arp` a modifier on `chord`.

```script
# A four-row kick figure, an octave down, played across the bar, with a snare
# fill rolled over its last four steps.
new
tracks 2
track 1 "KICK" voice kick
track 2 "SNARE" voice snare
steps 16
C-1 .
.   .
C-1 .
.   .
rows 0 to 3 octave down
rows 0 to 3 repeat 4
drum 12 2 snare
drum 13 2 snare
drum 14 2 snare
drum 15 2 snare
rows 12 to 15 roll
```

### `erase ROW TRACK` — empty one cell

```
erase 4 2
```

Exactly `note ROW TRACK .`.

---

## 4. Order of evaluation

Statements take effect **in the order they appear**. Three consequences matter:

1. `tempo`, `tracks` and `track …` want to come before the grid rows they
   describe. A grid row's maximum width is the channel count *at that line*.
2. `pattern N` resets the row cursor, so every grid row after it belongs to
   pattern `N` until the next `pattern` statement.
3. `copy A B` copies the state of `A` **at that moment** — so fill pattern 1
   first, then copy it.

A complete script in the conventional order:

```
new
song "TEMPLATE"
key D minor
tempo 128
tracks 4
track 1 "LEAD" wave square
track 2 "BASS" wave triangle
track 3 "CHORD" wave saw
track 4 "HAT" wave square

pattern 1 "VERSE"
A-4 A-2 E-4 C-6
C-5 .   .   .
…
```

---

## 5. What applies, and what does not

**Parse first, then apply.** The whole script is turned into commands before a
single cell is touched.

- **If any line has a mistake, nothing at all is applied.** No half-written
  songs, and no guessing which half made it.
- Every mistake comes back with its **1-based line number** and a sentence
  naming the fix. See [`05-error-catalogue.md`](05-error-catalogue.md).
- **Apply works on a copy**, so even a bug in the app cannot corrupt the song you
  had. On success the new song replaces the old one in a single **undo step**:
  one `Ctrl+Z` puts everything back.

**Applying replaces the whole song.** A script is a complete description, not a
patch. To change a song you already have, either edit it in the app, or write a
script that describes the whole thing again (start with `new`).

---

## 6. Limits

| Thing | Range | Default | Statement |
| --- | --- | --- | --- |
| Tempo | 40–300 BPM | 120 | `tempo` |
| Channels | 1–8 | 4 | `tracks` |
| Patterns | 1–64 | 1 | `pattern`, `copy` |
| Steps per pattern | 1–512 | **16** | `steps` |
| Steps per beat (grid resolution) | 1–16 | 4 | `beat`, or the same bar in note values with `grid`/`meter` |
| Swing (the song's lilt) | 0–100 % | **0** (straight) | `swing` |
| Speed (the tape transport: pitch and time together) | 25–400 % | **100** (as written) | `speed` |
| Groove (the song's feel) | one of seven feels | **`straight`** | `groove` |
| Room reverb | 0–100 % | **0** (dry) | `reverb` |
| Room echo | 0–100 % | **0** (off) | `echo` |
| Note range | `C-0` – `B-8` (MIDI 12–119) | — | — |
| Octave for bare letters | 0–7 | 4 | `octave` |
| Master volume | 0–100 % | the current level | `volume` |
| Channel level (the mix) | 0–100 % | **100** | `level` on a `track` line |
| Channel pan | -100–100 | **0** (centre) | `pan` on a `track` line |
| Channel glide | 0–100 % of the note | **0** (no slide) | `glide` on a `track` line |
| Channel vibrato | 0–100 % | **0** (steady) | `vibrato` on a `track` line |
| Channel strum (how a chord rolls) | 0–4 steps | **0** (a block) | `strum` on a `track` line |
| Channel round-robin (how much successive hits differ) | 0–100 % | **0** (every hit as written) | `robin` on a `track` line |
| Channel touch (how much a hit's tone follows its velocity) | 0–100 % | **0** (velocity is level alone) | `touch` on a `track` line |
| Channel drift (how far the pitch wanders) | 0–100 % | **0** (a steady pitch) | `drift` on a `track` line, or `drift` on an `automate` line |
| Channel reverb send | 0–100 % | **100** (all of it) | `verb` on a `track` line |
| Channel echo send | 0–100 % | **100** (all of it) | `echo` on a `track` line |
| Which part of the sound survives a channel's filter | one of four shapes | **`round`** (the low-pass) | `shape` on a `track` line |
| Channel duck (the pump) | 0–100 % | **0** (nothing moves) | `duck` on a `track` line |
| A mix group's level (one fader over several channels) | 0–100 % | **100** (the channels' own faders) | `bus` |
| Groups a song may have | 4 | **0** (every channel on its own fader) | `bus`, joined by `bus NAME` on a `track` line |
| Chords in the song's progression | 1–16 | **0** (no loop) | `progression` |
| Steps each chord of the progression lasts | 1–64 | **4** (one beat at the default grid) | `hold N` on a `progression` line |
| A channel's own feel | one of seven feels | follows the song's | `groove` on a `track` line |
| How much a channel is played | 0–100 % | **0** (a machine) | `humanize` on a `track` line |
| Notes one channel holds at once | 1–8 | **1** (monophonic) | `poly` on a `track` line |
| Notes one CELL holds at most | 1–8, and never more than its channel's `poly` | **1** (a plain note) | `,` between pitches in a cell, or on a `note` line |
| The drums a kit has | 4 — `kick`, `snare`, `hat`, `wind` | — | `drum`, or a drum word in a grid cell |
| Which patches those drums play (the kit) | one of the six built-in sets, or the name of a kit of your own (a word up to 16 characters) | **`studio`** (the four presets) | `kit` |
| Recordings the app may hold at once | 8 | **0** (the built-in one-shots) | `sample load`, `sample import` |
| A sample's name | a word up to 16 characters | — | `sample NAME` on a `track` line |
| How long a sample may be | 20 ms – 30 s | — | — |
| The pitch a sample plays at, rate 1 | fixed: middle C (261.63 Hz) | — | — |
| Note velocity | 0–100 % | **100** (full) | `~` on a cell, or a value of its own on a `note` line |
| How a note is played | slide off/on; a stutter of 2–8 hits; a flam (1) or drag (2) of grace hits; a bend of ±1–12 semitones | **no gesture** (hit once, at the pitch) | `>`, `*N`, `!`/`!!`, `^N`/`vN` on a cell, or a value of its own on a `note` line |
| The nine sound knobs | 0–100 % | the neutral sound | `bright`, `sweep`, `duty`, `noise`, `attack`, `decay`, `ring`, `release`, `thick` |
| Layers per channel | 4 (the voice + 3) | **1** (just the voice) | `layer` |
| A layer's octave | -4 – 4 | **0** (in unison) | `octave` on a `layer` line |
| A layer's detune | -100 – 100 cents | **0** (in tune) | `detune` on a `layer` line |
| A layer's gain | 0–100 % | **100** (full) | `gain` on a `layer` line |
| A range of steps (`rows`) | any run inside the grid, both ends included | — | `rows` |
| Octaves one `rows … octave` may move a range | 1–8 | **1** | `rows` |
| Times one `rows … repeat` may play a figure | 2 or more, as many as FIT in the pattern | — | `rows` |
| Hits a `rows … roll` puts in one step | 2–8 | **4** | `rows` |
| Rows per line | one statement; one grid step | — | — |

## 7. What the language does not have

| Not present | Workaround |
| --- | --- |
| Variables, loops, arithmetic | Generate the text with a program, then paste it. |
| Note length / sustain | `track 3 "PAD" hold 8`, per channel. One step is the shortest. |
| Volume per note | `C-4~40` in a grid row (or `note 0 1 C-4 40`) makes ONE note softer or harder. `level N` still sets the whole channel. |
| Bends, per-note pitch and slides between arbitrary points | Not modelled. `glide` slides a whole CHANNEL from its last note, and `vibrato` wobbles it; neither can be aimed at one note. |
| Per-note timing (a humanised hit, a flam) | Not one note at a time. `swing N` moves every second step of the whole song, and `groove human` wobbles every note a little; a flam or a deliberate drag on a single hit wants its own channel. |
| A second note on the same channel | One channel is one voice; use another channel. |
| Percussion instruments | A kit lives on ONE channel now: `drum 0 1 kick`, or a drum word in a grid cell (`kick . snare .`). The `kick`, `snare`, `hat` and `wind` voices still give a whole channel one drum sound. |
| Chords on one channel | `track 2 poly 3` widens a channel, and `C-4,E-4,G-4` puts a triad in ONE cell — or `chord 0 1 Am`, which lands in one cell on a wide channel and spreads on a narrow one. |
| Transpose | Whole octaves, over a run of steps: `rows 0 to 3 octave up`. A shift by a fifth or a semitone still means writing the notes. |
| A different sound per pattern | A voice belongs to a CHANNEL, not a pattern; a channel sounds the same in every bar. |
| A different sound per NOTE | The same. A stack is part of the channel's instrument, so every note on the channel is played by every layer; a note that needs its own sound needs its own channel. |
| A different length per pattern | All patterns share one grid; `steps` sets it for the song. |
| A different feel per pattern | `swing` is one number for the song, like `tempo`. |
| Un-soloing one channel by itself | `solo` states the whole set, so leave 2 out: `solo 1 3`. `solo off` clears them all. |

---

## 8. A minimal, complete script

```script
new
song "FOUR ON THE FLOOR"
tempo 128
tracks 4

track 1 "KICK"  voice kick
track 2 "BASS"  voice bass
track 3 "CHORD" voice strings hold 4
track 4 "HAT"   voice hat

pattern 1 "GROOVE"
C-1  C-2 C-4 C-6
.    .   .   .
.    .   .   C-6
.    .   .   .
C-1  C-2 E-4 C-6
.    .   .   .
.    .   .   C-6
.    .   .   .
C-1  C-2 G-4 C-6
.    .   .   .
.    .   .   C-6
.    .   .   .
C-1  C-2 C-4 C-6
.    .   .   .
.    .   .   C-6
.    .   .   .
```

Sixteen grid rows, four columns, four channels. Paste it, press APPLY, then
SPACE. Everything else in these docs is variations on this shape.

---

## 9. What a script can control

Every setting the app has that belongs to a SONG, plus the six settings that
belong to the SESSION it is written in. There is nothing about a song that is
reachable only by clicking, and nothing on the F1 controls menu that is reachable
only by hand except the handful of things at the end of this section, each with
its reason.

### Everything that is part of the song

| On screen | In a script |
| --- | --- |
| The song title in the header | `song "TITLE"` |
| `F2`'s `STARTERS…` page — a whole worked skeleton to begin from | `start house`, `start lofi`, `start ballad`, `start rock`, `start emo`, `start vaporwave`, `start synthwave`, `start shoegaze`, `start dnb` |
| The `KEY` control (tonic steppers and the scale button) | `key D minor` |
| The `TEMPO` slider | `tempo 128` |
| The `SWING` slider (the song's feel) | `swing 60` |
| The `F5` room row — `REVERB` and `ECHO` | `reverb 40` / `echo 25` |
| The `GROOVE` button in the transport (click to cycle the feels) | `groove shuffle` |
| One channel's own pocket — a feel that belongs to the PART rather than the song | `track 4 "HAT" groove shuffle humanize 40` |
| Which four patches the drums play — one word for a whole drum set | `kit 808` |
| How many notes a channel holds at once — held notes ring through each other | `track 5 "PAD" hold 16 poly 4` |
| What kind of filter the `BRIGHT` knob opens — a low-pass, a high-pass, a vowel or a scoop | `track 2 "STAB" shape sharp` |
| A group fader over several channels — the kit, the pads, the backing (no screen yet: the script and the file are where a group lives) | `bus DRUMS 70`, joined by `track 1 bus DRUMS` |
| The pattern's length (and how many rows fit) | `steps 32` |
| Which steps fall on a beat (the brightened rows) | `beat 4` |
| The same bar length and beat, said in note values instead of arithmetic | `grid 8t` (eighth-note triplets) or `meter 7 8` (seven eighths) |
| The pattern stepper, and the pattern's name | `pattern 3 "CHORUS"` |
| The song's order (`F3`) — the bars it plays, and how often | `order 1 2 1 3` |
| The same order written as a FORM — names for groups of bars, shown beside each bar in `F3` | `section VERSE 1 1 2 1` then `arrange VERSE CHORUS VERSE` |
| `+ ADD` / `- DEL` | `tracks 6` |
| A channel's name (shift+click it to rename it by hand) | `track 2 "BASS"` |
| The `F4` voice menu — a named instrument | `track 2 voice bass` |
| The `F4` menu's `SAVE AS…` — the whole sound, layers and all | `track 2 voice MYPAD` (the saved sound applied by name) |
| The `F4` menu's `GLIDE` and `VIBRATO` dials | `track 2 glide 40 vibrato 25` |
| The waveform chip on a channel row (click it to cycle) | `track 2 wave triangle` |
| The nine sound knobs in the `F4` menu | `track 2 bright 40 sweep 30 duty 25 attack 10 release 40` |
| The `F7` design menu — a channel's layer stack, and each layer's waveform, `OCTAVE`, `DETUNE`, `GAIN` and nine knobs | `layer 2 3 wave saw detune -9 gain 60`, and `layer 2 3 clear` |
| The `HOLD` control (how long the selected channel's notes ring) | `track 3 "PAD" hold 8` |
| A channel's ten effects — `drive`, `crush`, `cab`, `tape`, `radio`, `vinyl`, `chorus`, `punch`, `tilt`, `gate` (described in the `F6` browser's `EFFECTS` section, and dialled by hand on `F7`'s `FX` page) | `track 2 drive 40 cab 60 tape 25` |
| The same effects on the WHOLE MIX — the tape the band was printed to (also dialled by hand in the mixer's `WHOLE MIX` panel) | `master drive 20 tilt 15` |
| The mixer's strips — a channel's level | `track 3 "PAD" level 45` |
| The mixer's strips — a channel's pan | `track 3 "PAD" pan L30` |
| The mixer's `VERB` and `ECHO` send bars | `track 3 "PAD" verb 20 echo 0` |
| The mixer's `DUCK` bar (and `P`, the pump) | `track 1 "KICK" duck 70` |
| Playing one note softer or harder (an accent) | `C-4~40` in a grid row, or `note 0 1 C-4 40` |
| Sliding a channel from note to note (portamento) | `track 1 "LEAD" glide 30` |
| Vibrato on a channel | `track 1 "LEAD" vibrato 25` |
| A channel's mute box, and the `F5` `MUTE` box | `mute 2` / `unmute 2`, or `track 2 off` |
| Clicking cells, and the piano and the typing keys | grid rows, `note`, `erase` |
| A drum named in a cell — a whole kit on ONE channel | `kick` in a grid row (`kick . hat .`), or `drum 0 1 kick` |
| The recording a channel plays — a `.wav` of your own (the FILE is app state; the reference is the song's) | `sample BRK02` on a `track` line, after `sample load` |
| The `PRESS A KEY FOR A CHORD` toggle's `chord` output | `chord 0 1 Am`, or `chord 0 1 6` for a degree |
| A chord played one note at a time, on ONE channel — the arpeggio, and the strum (`hold` makes it one) | `chord 0 1 Am arp up 8` |
| The same section played several times in a row, in the form | `arrange VERSE CHORUS repeat 4 VERSE` |
| The chord loop the song hangs on, and a channel playing it (no screen yet: the script and the file are where a loop lives) | `progression Am F C G`, then `chord 0 1 follow` / `note 0 4 follow` |
| `CLEAR PATTERN` | `clear 3` |
| Making a new pattern by walking off the end | `pattern 4`, or `copy 1 4` |
| `NEW SONG` | `new` |
| `SAVE AS SCRIPT`, and the file itself | `songToScript(song)` in the model — a saved song IS a script |
| `UNDO` | `Ctrl+Z` in the app — one applied script is one undo step |

### The thirteen settings that travel beside the song

A `Song` is notes, channels, tempo and structure. Thirteen things the app can be
told are not part of that, so they are handed back to the caller in the apply
result's `settings` rather than living in the song data — and one of them, the
master level, is the only one a FILE carries:

| Setting | Statement | In a file? |
| --- | --- | --- |
| Master volume | `volume 70` | yes — it belongs to the room |
| The octave you are playing in | `octave 5` | no |
| The look of the app (the `F9` menu) | `theme forge` | no — a file that repaints your app is a hostile surprise |
| Which channels are soloed | `solo 2` / `solo 1 3` / `solo off` | no — it says how you are LISTENING |
| What one key writes (the `CHORDS` button) | `chords off` / `chords triad` / `chords 7th` | no — it shapes the next keypress |
| Audition notes as the cursor moves | `hear on` / `hear off` | no |
| Which instrument `wave font` plays | `instrument use 2` | no — an instrument is megabytes of somebody's recordings |
| A request for the instrument picker | `instrument import` | no — it needs a person at a file dialog |
| An instrument to fetch and load — a soundfont or a Noislet pack | `instrument load "storage/soundfonts/dkc/font.sf2"` | no — an instrument is not a song, however it arrives |
| A request for the sample picker | `sample import` | no — it needs a person at a file dialog |
| A recording to fetch and load — a `.wav` of yours | `sample load "samples/break.wav"` | no — the audio is the app's, and the song holds only its name |
| The bars an export renders (the loop region) | `export bars 8 to 15` / `export all` | no — a region is what you are DOING with a song, not what the song is |
| The loudness audio exports normalise to | `export loud -14` / `export loud off` | no — a level is what you are doing with the song, not what it is |

Each is optional and independent: a script that never mentions one leaves the
current setting alone. `undefined` means "said nothing"; `hear off` and `solo off`
are real values, not absences.

### What a script deliberately leaves alone

Four things, and the reason for each is a rule rather than an oversight:

| Not scriptable | Why |
| --- | --- |
| `PLAY` / `STOP`, and where the playhead is | A script describes a song; when it PLAYS is the next decision the player makes. Automating it would also mean a pasted file starting noise at whatever volume the room is in. |
| `SAVE AS…` / `DELETE` in the `F4` menu (the sound library) | The library lives in the browser, not in a song. A script USES a saved sound by name (`voice MYPAD`); it never edits the library. |
| `OPEN FILE…` / `SAVE AS JSON` (`F2`) | A script IS the file. Reading one from inside one, or writing one while the app is applying it, is a loop with no purpose. (`instrument import` is the exception that proves it: an instrument is not a song, so asking for one does not replace the thing being defined.) |
| The cursor, the selection, and which step is on screen | Where the caret sits is the state of the person using the app. A script that moved your cursor out from under you would be a bug, not a feature. |

That is the whole boundary: everything else in the app is reachable from text.
`settings` in the apply result is where those session settings are handed over,
which is how the app applies them without storing them in the song.

### A longer grid, in practice

```script
new
song "TWO BARS"
tempo 120
steps 32
beat 4
tracks 3

track 1 "BASS"  voice bass
track 2 "CHORD" voice pad hold 8
track 3 "LEAD"  voice pluck bright 85

pattern 1 "A"
C-2 C-4 C-5
.   .   .
.   .   .
.   .   .
A-2 A-3 A-4
.   .   .
.   .   .
.   .   .
F-2 F-3 F-4
.   .   .
.   .   .
.   .   .
G-2 G-3 G-4
.   .   .
.   .   .
.   .   .
C-2 C-4 C-5
.   .   .
.   .   .
.   .   .
A-2 A-3 E-4
.   .   .
.   .   .
.   .   .
F-2 F-3 D-5
.   .   .
.   .   .
.   .   .
G-2 G-3 B-4
.   .   .
.   .   .
.   .   .
```

Thirty-two steps: the first half is the loop, the second half is the same loop
with the top line re-voiced. In the app the grid pages through the two screens
and the `PATTERN` panel title says which rows you are looking at.

→ Next: [`04-cookbook.md`](04-cookbook.md) for recipes, and
[`06-examples.md`](06-examples.md) for whole songs.
