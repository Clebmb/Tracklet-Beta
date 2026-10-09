# 05 — Error catalogue

Tracklet never applies a script that has a mistake. Instead it reports **every**
mistake it found, each with its **1-based line number** and a sentence naming the
fix. In the SCRIPT panel they appear under `FIX THESE (n)`; through the model API
they arrive as `ScriptDiagnostic[]` (`{ line, message }`).

This file lists every message the parser can produce, what causes it, and the
exact fix. Messages are quoted as they are printed, with `<…>` standing in for a
value.

---

## The diagnostics

### `unknown command "<word>". Commands are: new, start, song, key, tempo, octave, beat, steps, grid, meter, tuning, swing, groove, kit, chip, volume, reverb, echo, master, automate, section, arrange, progression, bus, theme, instrument, solo, chords, hear, tracks, track, sample, layer, mute, unmute, pattern, order, clear, copy, rows, note, chord, drum, erase.`

A line's first word is not a command word, so the line was read as a **grid row**
— and then rejected because one of its tokens is not a valid cell either.

Two different mistakes print this:

```
harmony Am           # a word that is not a command at all
H-9 . . .            # H is not a note letter
C-4 D-4 E-4 F-4 G-4  # ...no: this one is the "too wide" error instead
```

**Fix:** use one of the command words listed above (either the fifty-one this build
knows, or the shorter list the message printed), or write the line as a real grid
row (every token a pitch, a drum word (`kick`, `snare`, `hat`, `wind`) or an empty
token). Notes are `A`–`G` only — there is no
`H`, and sharps are written `#`, flats `b`.

### `"<x>" is not a drum. The kit is kick, snare, hat, wind — e.g. drum <r> <t> kick.`

A `drum` line names one of the four kit sounds, and this word is not one of them.
The example in the message spells out the line's own row and channel, so it reads
as a correction rather than a template.

```
drum 0 4 boom      # -> "boom" is not a drum. The kit is kick, snare, hat, wind — e.g. drum 0 4 kick.
```

**Fix:** one of `kick`, `snare`, `hat` or `wind` — the four sounds a kit channel
plays, each with its own General MIDI pitch. A whole set is spelled one word per
cell in a grid row (`kick . hat .`), which is the same thing written shorter.

`OPEN` refuses the same word in a file, in a message that names the **pattern,
step and channel** it was at (`pattern 1, step 0, channel 1: "boom" is not a
drum…`) rather than a line number, because a file has no lines to count.

### `this pattern already has <rows> steps, so there is no row <n>.`

More grid rows were written than the pattern has steps. A pattern holds `steps`
of them — **16 by default**, up to 512 — and **an all-empty line still uses a
step**, so a long block of rests can run off the end.

```
C-4 . . .
… 15 more lines …
C-4 . . .            # line 17 -> there is no row 16
```

**Fix:** keep grid rows to the pattern's length, put `steps 32` (or whatever you
need) before them, or start a new pattern with `pattern N`.

### `this grid row has <k> notes but the song has <t> tracks. Add "tracks <k>" or remove a column.`

A grid row has more tokens than the song has channels. Note that the count is the
song's channel count **at that line**, so this also fires when a `tracks`
statement comes *after* the rows that needed it.

```
tracks 4
C-4 E-4 G-4 B-4 C-5   # five columns, four channels
```

**Fix:** write `tracks 5` before the row, or drop a column.

### `column <c>: "<token>" is not a note in range. Use C0..B8, e.g. C-4.`

A grid token is not a pitch and is not an empty token. `C0..B8` is the playable
range (`C-0` is MIDI 12, `B-8` is MIDI 119). The article `column 1` is the
column number, which is also the channel number.

```
C-4 H-4 . .          # -> column 2: "H-4" is not a note in range…
C-9 . . .            # -> column 1: "C-9" is not a note in range… (too high)
```

**Fix:** spell the note `A`–`G`, optional `#` or `b`, optional `-`, octave 0–8.

### `column <c>: "<token>" has a velocity outside 0..100. Write the note, a ~, and how hard it is hit — e.g. C-4~80, or C-4~40 for a soft one.`

A grid cell's `~` suffix is how hard the note is played, as a percentage, and this
one is outside `0`–`100`. The token and the column are reported exactly as in the
note-range message above.

```
C-4~200 . . .        # -> column 1: "C-4~200" has a velocity outside 0..100…
C-4~-5 . . .
```

**Fix:** `C-4~80` (firm) or `C-4~40` (soft). A note with no `~` is at full force —
`C-4` means `C-4~100` — and `.` is an empty step.

### `column <c>: "<x>" is not something a note can do. A note may SLIDE into its pitch (">"), STUTTER ("*3" is three hits in one step, 2..8), FLAM ("!") or DRAG ("!!") into the beat, SCOOP up onto it ("^2", 1..12 semitones) or FALL away from it ("v2"), or combine a stutter or a flam with a slide.`

A cell's gesture suffix is not one this language writes. `>` slides into the
pitch, `*N` hits it N times inside the step, `!`/`!!` leans one or two grace hits
into the beat, and `^N`/`vN` bends the note's own pitch up onto it or down away
from it; anything else is refused rather than played as a plain note, because a
note that asked to be played a certain way and was played plainly is a difference
the author cannot hear. The same message appears without the `column N:` prefix
when it is a `note` line's extra value.

```
C-4x . . .           # -> column 1: "x" is not something a note can do…
C-4*x . . .
C-4*9 . . .          # 9 is outside 2..8
```

**Fix:** `C-4>`, `C-4*3`, `C-4!`, `C-4!!`, `C-4^2`, `C-4v2`, `C-4>*3`, or the
note on its own.

### `a note bends one way: "<x>" has both a "^" and a "v". Write "^2" to scoop UP onto the note from a whole tone below, or "v2" to fall away from it by a whole tone.`

A bend moves the note's own pitch in one direction, so a cell cannot ask for a
scoop and a fall at once. Bending up away from a note and down into one are the
same shape heard backwards — which is why there are two characters rather than
four, and why a cell writes one of them.

**Fix:** `C-4^2` (arrive from below) or `C-4v2` (leave downward).

### `a note arrives one way: "<x>" both slides and scoops. A ">" slides in from the pitch the channel played before it and a "^" scoops up from a fixed interval below the note; write one of them, or slide in and FALL away with ">v2".`

A `>` and a `^` are two different ARRIVALS, and a note starts in one place: a
slide comes from whatever the channel played last, a scoop from a fixed interval
below the written pitch. A FALL is a departure rather than an arrival, so it rides
with either.

```
C-4>^2 . . .
```

**Fix:** `C-4>`, `C-4^2`, or `C-4>v2` for a slide in that falls away.

### `a note bends once: "<x>". Write "^2" for a scoop up, "v3" for a fall of three semitones — 1..12 semitones, and "^" alone is 2.`

Two bends in one suffix — the second is almost always a typo, and a note can only
bend one way.

**Fix:** `C-4^2`, or `C-4v3`.

### `a bend is 1..12 semitones; got "<x>". "^" alone is 2 — a whole tone — and "v12" is an octave, which is as far as a bend goes.`

A bend of zero semitones is the note on its own, and more than an octave is not a
bend but a different note — write that note instead.

```
C-4^0 . . .
C-4v13 . . .
```

**Fix:** `C-4^`, `C-4^2`, `C-4v7` — 1 to 12 semitones, or the note on its own.

### `a note drags at most twice: "<x>" has too many "!"s. Write "!" for a flam (one grace hit) or "!!" for a drag (two).`

A flam is one grace hit and a drag is two, so three or more `!` characters have no
meaning. A drag is already the densest lead-in a cell has room for.

**Fix:** `C-4!` or `C-4!!`.

### `a note cannot both roll and flam: "<x>". A stutter ("*3") tiles the step with even hits and a flam ("!") leans a hit into the beat. Write one of them.`

A `*N` stutter and a `!` grace are two different ways to fill the same instant —
even hits across the step, or a short hit before the beat — so a note takes one,
not both. (A slide, `>`, combines with either.)

**Fix:** `C-4*3`, or `C-4!`, or `C-4>!` — not `C-4*3!`.

### `a note slides once: "<x>" has two ">"s. Write ">" for a slide into the note, "*3" for three hits, and both as ">*3".`

A slide is one gesture, so two `>` characters are refused rather than read as
one — the second is almost always a typo that would otherwise play as though it
were not there.

### `a note stutters once: "<x>" has two "*"s. Write "*3" for three hits in one step.`

Two stutter counts cannot both be true.

### `a stutter needs a count: "*3" is three hits and "*2" is a flam, 2..8 hits inside one step.`

A bare `*` with no number after it.

### `"*1" is just a note: one hit is what a cell is without a stutter. Write the note on its own, or "*2" for two hits.`

`*1` is the one count that is not a stutter: it is the note. The message says so
rather than rounding it silently to a plain note.

### `a stutter is 2..8 hits inside one step; got "*<n>". More than 8 in a step is not a roll — write it across two cells, or use a faster grid.`

A count outside `2`–`8`. Above eight, one step is not long enough for the hits to
be hits rather than a texture.

**Fix:** a count between `2` and `8`, or the hits spread across two steps.

### `column <c>: this cell holds <n> notes, but channel <c> sounds <n> at a time. Write "track <c> poly <n>" above this line to widen it, or spread the chord across channels with "chord <r> <c> …".`

A cell may hold a CHORD — `C-4,E-4,G-4` — and a cell is ONE event: its notes are
heard together, or the chord is a chord with notes missing. A channel sounds as
many notes at once as its `poly`, and this one is narrower than the cell is wide,
so the language refuses rather than writing a chord the channel would thin out.
The same message appears without the `column N:` prefix on a `note` line, which
names its own channel instead of taking one from the column.

```
tracks 1
C-4,E-4,G-4 . . .    # -> column 1: this cell holds 3 notes, but channel 1 sounds 1
note 0 1 C-4,E-4,G-4
```

**Fix:** widen the channel above the line (`track 1 poly 3`), or spread the chord
with the tool that has always done it — `chord 0 1 Am` — which puts one note on
each of the channels after the root. A script is read top to bottom, so the
`track … poly` line is read as of where it is written: below the chord it is too
late.

### `column <c>: a cell holds at most <n> notes; "<x>" has <n>. A chord that big wants more than one channel, or a second cell.`

A cell can hold a CHORD — pitches separated by commas, e.g. `C-4,E-4,G-4` — and
this one names more notes than the ceiling. The ceiling is `4`, the same ceiling a
channel's polyphony uses, because a cell that outran it would have to be played by
more voices than the song has promised the channel.

```
C-4,E-4,G-4,B-4,D-5 . . .    # -> column 1: a cell holds at most 4 notes…
note 0 1 C-4,E-4,G-4,B-4,D-5
```

**Fix:** four notes or fewer, a second cell for the rest, or the chord spread over
more channels. The `column N:` prefix appears in a grid row (N is the column, and
the channel it plays on) and is absent on a `note` line, which names its own
channel.

### `"new" takes no arguments — it starts a blank song.`

```
new song "X"         # `new` is a whole statement on its own
```

**Fix:** `new` on one line, then `song "X"` on the next.

### `start needs the name of a starter, e.g. start house. The starters are: house, lofi, ballad, rock, emo, vaporwave, synthwave, shoegaze, dnb.`

A bare `start` line. It has no default skeleton — a starter is a whole song, so
there is nothing sensible to guess.

**Fix:** name one of the nine, or use `new` for a blank song.

### `"<x>" is not a starter. The starters are: house, lofi, ballad, rock, emo, vaporwave, synthwave, shoegaze, dnb — e.g. start house.`

The word after `start` is not one of the nine skeletons this build ships. The
message lists them, because the list is what tells you which ones exist.

```
start techno         # -> "techno" is not a starter. The starters are: house, lofi, ballad, rock, emo, vaporwave, synthwave, shoegaze, dnb — e.g. start house.
start house extra    # -> start needs the name of a starter, e.g. start house. … (one word, and that is all)
```

**Fix:** one of the names above. A starter begins with `new`, so it REPLACES the
song: if that was not what you meant, `Ctrl+Z` is the way back, or write the
tempo and the channels you wanted instead of starting from a genre's.

### `song needs a title, e.g. song "MY TUNE".`

A bare `song` line.

**Fix:** put the title after it, quoted if you like: `song "MY TUNE"`.

### `"<x>" is not a scale Tracklet knows. Scales: major, minor, harmonic minor, dorian, mixolydian, phrygian, blues or pentatonic.`

The tonic was readable but the scale after it was not. This is the common one:
a real scale name that Tracklet does not ship.

```
key D lydian
key D locrian
```

**Fix:** use one of the eight, or write the key you meant in a scale you have.
If you want the sound of a mode, the built-ins cover the four that carry most
music — `mixolydian` for a major-ish one, `dorian` and `phrygian` for the minor
ones, `blues` for a solo — and remember the key is only a GUIDE, so choosing the
nearest scale costs you nothing: no note is blocked by it.

### `a key starts with a note letter: "<x>" does not. Try key D minor or key F# major.`

The word after `key` is not a note at all.

```
key up
key mixolydian
```

**Fix:** start with `A`–`G`, with an optional `#` or `b`: `key A minor`,
`key F# major`, `key Eb dorian`. No octave — a key is not a pitch — so `key D4`
is an error too.

### `key needs a note and a scale, e.g. key D minor. Scales: ...`

A bare `key` line.

**Fix:** put a note and a scale after it. A bare note alone is fine and means
major: `key C`.

### `a song title may be at most 32 characters; "<x>" is <n>. Shorten it, or use fewer words.`

A `song` title longer than the header bar can show. The title shares the top bar
with the pattern readout and the app's tagline, which leaves room for about
thirty-two characters — the same ceiling the header's rename box (shift-click the
title) puts on your typing.

```
song "A VERY LONG SONG TITLE THAT WILL NOT FIT IN THE BAR"   # 51 characters
```

**Fix:** shorten it (`song "THE LONG WAY HOME"`). The app never trims a title
silently, because a title is the one thing here you would notice missing.

### `tempo needs one number, or a number and a bar: "tempo 128", "tempo 140 at 5" (a new tempo from bar 5) or "tempo 90 by 9" (sliding down to 90 by bar 9).`

`tempo` with nothing after it, or with a number and a word that is neither `at`
nor `by`. A song has one tempo, or a tempo MAP: `at` puts a new tempo on a bar,
and `by` slides into one over the bars before it.

```
tempo
tempo 140 from 5
```

**Fix:** `tempo 128` for the song's one tempo, `tempo 140 at 5` to change on bar
5, or `tempo 90 by 9` to arrive at 90 by bar 9.

### `tempo "<x>" is not a number.`

```
tempo fast
tempo 1e3x
```

**Fix:** digits only, e.g. `tempo 128`.

### `tempo <bpm> is outside 40..300 BPM. Pick a value in that range.`

The tempo is a valid number but out of range. Tracklet refuses rather than
clamping, because a silently halved tempo is worse than a refusal.

**Fix:** pick a value between 40 and 300.

### `tempo changes need "at" or "by": "tempo 140 at 5" changes on bar 5, "tempo 90 by 9" slides down to 90 over the bars before 9. Got "<x>".`

A three-word `tempo` line whose middle word is neither `at` nor `by`.

```
tempo 140 on 5
tempo 90 until 9
```

**Fix:** `at` for a change that happens ON a bar, `by` for a slide that ARRIVES
there: `tempo 140 at 5`, `tempo 90 by 9`.

### `a tempo change lands on a bar, 1..64; got "<x>". The bar is a slot of the order, the same number "order" uses.`

The bar of a tempo change is a slot of the SONG's order — the numbers
`order 1 2 1 3` lists — not a pattern number, and not a row.

```
tempo 140 at 0        # the first bar is 1
tempo 140 at 2.5
tempo 140 at 65       # an order holds at most 64 bars
```

**Fix:** name a slot from `1` to the length of the order.

### `a song can have at most 32 tempo changes; this one already has that many.`

More `at`/`by` lines than a song may carry. The ceiling is here because every
change is a point the sequencer and the exporter both have to walk.

**Fix:** keep the changes that carry the music — a build and its drop rarely need
more than a handful — or write the second half as its own song.

### `steps needs one number, e.g. steps 32.`

`steps` with zero or two-plus arguments.

**Fix:** `steps 32`. One number only.

### `steps must be a whole number 1..512; got "<x>".`

A pattern length outside the supported range, or not a whole number.

```
steps 0
steps 513
steps 16.5
```

**Fix:** `steps 1` … `steps 512`. Leave the statement out entirely for the
sixteen-step default.

### `beat needs one number, e.g. beat 4.`

`beat` with zero or two-plus arguments.

**Fix:** `beat 4`. One number only.

### `beat must be a whole number 1..16 (steps per beat); got "<x>".`

A grid resolution outside the supported range, or not a whole number. Remember
that `beat` counts **steps per beat**, not beats per bar: the default is 4, so a
4/4 bar is sixteen steps. `beat 2` makes a bar eight steps, so the same 16-step
pattern becomes two bars; `beat 8` makes a bar 32 steps, so 16 steps is half a
bar.

```
beat 0
beat 32
beat 4.5
```

**Fix:** `beat 1` … `beat 16`.

### `grid needs one name, e.g. grid 16 or grid 8t (eighth-note triplets).`

`grid` with no argument, or with more than one. A grid is a single word, because
it names a subdivision of the bar rather than a pair of numbers.

**Fix:** `grid 16`. One name only.

### `grid takes a power of two or its triplet, and this song holds <…>..<…> steps with <…>..<…> to the beat. The grids are: <…>.`

The name is not a grid this app can make a bar out of. Two ways to get here: a
name that is not a subdivision at all (`grid 6`, `grid 128`), and a name that is
real but too fine or too coarse for the `beat` range — a bar never holds more than
512 steps or fewer than 1 step to the beat.

```
grid 6
grid 128
grid 2
```

**Fix:** use one of the grids the message lists — `4`, `8`, `16`, `32`, `64`, or
their triplets `8t`, `16t`, `32t`. `16` is the default; `8t` is eighth-note
triplets (a shuffle). Or say the pair yourself with `steps` and `beat`.

### `meter needs two numbers, e.g. meter 7 8 — seven eighth notes to the bar.`

`meter` without exactly two arguments. It reads like a time signature: the number
of beats, then the note one beat is.

**Fix:** `meter 7 8`. Two numbers only.

### `meter is a whole number of beats and then the note one beat is (<…>), e.g. meter 7 8, and the bar must come to at most <…> steps; got "<…>".`

The meter does not describe a bar this app can hold: the beat count is not a whole
number of at least one, the note value is not one of the accepted ones, or the
resulting bar is longer than 512 steps.

```
meter 7 3
meter 1.5 4
meter 300 8
```

**Fix:** a whole number of beats, then a note value of 1, 2, 4, 8 or 16. `meter 7
8` is seven eighths, `meter 3 4` is a waltz, `meter 6 8` is a jig.

### `volume needs one number, e.g. volume 70.`

`volume` with zero or two-plus arguments.

**Fix:** `volume 70`. One number only.

### `volume must be a percentage 0..100; got "<x>".`

The master level is a **percentage**, so `0.7` is not 70% — it is 0.7%, which is
very nearly silent. This is a common mix-up; the message is deliberately blunt
about it.

```
volume 120
volume -5
volume loud
volume 0.7        # valid, but means 0.7%, not 70%
```

**Fix:** `volume 0` … `volume 100`.

### `octave needs one number, e.g. octave 4.`

`octave` with zero or two-plus arguments.

**Fix:** `octave 4`.

### `octave must be a whole number 0..7; got "<x>".`

The **default** octave for bare letters must be 0–7. (An explicitly written note
may still use octave 8, as in `C-8`, as long as it is inside the playable range.)

```
octave 9
octave 4.5
```

**Fix:** `octave 0` … `octave 7`. Note that `octave` moves the app's own `OCT`
control as well as the octave bare letters are written in, so a script can hand
over a song already set up for the register it was written in.

### `solo needs one or more channel numbers 1..<t> (or "solo off" to hear everything again), e.g. solo 2.`

`solo` was written with nothing after it.

```
solo
```

**Fix:** `solo 2` (one channel), `solo 1 3` (two), or `solo off` (none — every
channel plays again). Soloing is not part of the song: it is how you LISTEN, so it
never reaches a file, and a script that says nothing about solo leaves your own
soloing alone.

### `solo takes channel numbers 1..<t>; got "<x>". Write "tracks <t>" before this line if the song needs more channels.`

A `solo` argument is not a channel number the song has yet — or is not a number at
all.

```
tracks 2
solo 3
solo two
solo 0
```

**Fix:** number the channels the song has (1-based), and put `tracks N` **before**
any line that names channel `N`. Channel 0 does not exist: the first channel is 1.

### `chords needs one word: chords off, chords triad or chords 7th.`

`chords` with no argument, or with more than one.

```
chords
chords triad 7th
```

**Fix:** `chords off`, `chords triad` or `chords 7th`.

### `"<x>" is not a chord mode. Use "chords off", "chords triad" (3 notes) or "chords 7th" (4 notes).`

The word after `chords` is not one of the three modes.

```
chords quartal
chords pad
chords 7th triad
```

**Fix:** `off`, `triad` or `7th` (also accepted: `single`, `none`, `0`;
`triads`, `on`, `3`; `seventh`, `sevenths`, `7`, `4`). This sets what one KEY writes
from now on — writing a chord into the song is `chord 0 1 Am`, a different
statement. A channel named `CHORDS` is not possible and not needed: this is a
statement about the app, not about a channel.

### `hear needs on or off, e.g. "hear on" (play each note as the cursor reaches it). Got "<x>".`

`hear` with no argument, or with something other than `on`/`off`.

```
hear
hear yes
hear on off
```

**Fix:** `hear on` (audition every note the cursor reaches) or `hear off` (the
default: only the notes you type sound).

### `"<x>" is not a theme. Themes: reliquary, moorland, the-deep, ossuary, underglow, forge, mycelium, boghollow, nest, parchment.`

The word after `theme` is not the id of one of the app's looks.

```
theme dark
theme THE DEEP
theme neon
```

**Fix:** use an id from the list the message prints — lower-case, with a hyphen
where the `F9` menu shows a space, so `THE DEEP` on screen is `theme the-deep`.
This is a preference of the PERSON rather than of the song: it is a session
setting, so it is never written to a file and opening a song can never change how
your app looks.

### `instrument needs "use", "import" or "load", e.g. instrument use 1. It got "<x>".`

`instrument` followed by a word that is none of `use`, `import` and `load` —
including no word at all.

```
instrument
instrument play 2
instrument list
```

The three statements are `instrument use <name|number>` (which imported
instrument the `font` wave plays), `instrument import` (open the picker for a
Noislet `.instrument.json`) and `instrument load <path>` (fetch a `.sf2` from a
path and put it in the list — see [`10-instruments.md`](10-instruments.md)).
`list` is not a statement: a script cannot read the instrument list, the same
way it cannot read the theme list — the language WRITES settings and never reads
app state.

**Fix:** name what you want.

```
instrument use 2
instrument use "GRAVEL KIT"
instrument import
instrument load "storage/soundfonts/dkc/font.sf2"
```

### `instrument load needs a path, e.g. instrument load "storage/soundfonts/dkc/font.sf2".`

`instrument load` with nothing after it.

```
instrument load
```

**Fix:** the path of a soundfont, in quotes if it has spaces — relative to the
page the app is served from, so `storage/soundfonts/dkc/<font>.sf2` is the way to
spell one in the kit (the Tracklet dev server serves that folder). A load that
does not work is not a script error: the script still applies and the app says
what went wrong on the status line, because a song is music and a font is an
instrument — see [`10-instruments.md`](10-instruments.md).

```
instrument load "storage/soundfonts/dkc/Donkey Kong Country Exp (Sam Miller).sf2"
```

### `instrument use needs a name or a number, e.g. instrument use 2 or instrument use "GRAVEL KIT".`

`instrument use` with nothing after it.

```
instrument use
```

**Fix:** a 1-based number from the F2 instrument list, or the instrument's name.
Quote a name with a space in it.

```
instrument use 1
instrument use "FIRE BED"
```

A name that is not in the list is **not** an error here: the script still
applies and the song still changes. The app reports it afterwards
(`NO INSTRUMENT CALLED "X"`) because only the app knows what you have imported,
and throwing away a whole script because one name was not imported yet would cost
you the song the script did build.

### `theme needs one name, e.g. theme forge. Themes: …`

`theme` with no argument, or with more than one word.

```
theme
theme the deep
```

**Fix:** one id, e.g. `theme the-deep` (the second line above is two words; write
the hyphen instead of a space).

### `"<x>" is not a page. Pages: tracker, machine, mixer, arranger, live, recorder.`

The word after `page` is not the name of one of the app's full screens.

```
page timeline
page arp
```

**Fix:** use a name from the list the message prints — `tracker`, `machine`,
`mixer`, `arranger`, `live` or `recorder`. A page this build does not have is
refused here rather than switching to a screen that is not there, which is why
`page arp` fails until that screen lands. A page is a view of the song, not the
song itself: a session setting, so it is never written to a file.

### `page needs one name, e.g. page arranger. Pages: …`

`page` with no argument, or with more than one word.

```
page
page arranger mixer
```

**Fix:** exactly one name, e.g. `page arranger`.

### `scene needs a name and at least one clip, e.g. "scene A 1 1 - 2" (the pattern each channel plays, with "-" for a channel that is silent).`

A bare `scene` with nothing after it.

```
scene
```

**Fix:** a name and at least one clip, e.g. `scene A 1 1 - 2`. A scene is one
clip per channel; `-` (or `0`) is a channel that plays nothing.

### `scene <name> needs at least one clip: the pattern each channel plays, e.g. "scene <name> 1 1 - 2", or "-" for a silent channel.`

A `scene` line with a name but no clips at all.

```
scene A
```

**Fix:** name at least one channel's pattern, e.g. `scene A 1 - 2`.

### `scene <name> names <count> clips and the song has <channels> channel(s). A scene is one clip per channel - leave a silent channel out rather than naming more, e.g. "scene <name> 1 - 2".`

More clips than the song has channels — usually the wrong song, or a `tracks N`
line written BELOW the scene that needed it.

```
scene A 1 1 1 1 1
```

**Fix:** one clip per channel — name the silent channels out rather than past the
end, e.g. `scene A 1 - 2`, and write `tracks N` above the scenes that need it.

### `scene <name> takes pattern numbers 1..<max> or "-" for silence; got "<word>". A scene NAME is one word (quote it if it has a space) and its clips are what each channel plays, e.g. "scene A 1 1 - 2".`

A clip that is not a pattern number, often a second word of the name.

```
scene MY BREAK 1 2
scene A 1 x 2
```

**Fix:** quote the name if it has a space (`scene "MY BREAK" 1 2`) and give each
channel a pattern number `1..64` or `-` for silence.

### `a song may hold at most <max> scenes, and this one already has <max>. Use one of the names it has, or replace one.`

More than the ceiling of scenes.

**Fix:** reuse a name the song already has — defining it again replaces that row
— or take a scene out first.

### `live takes "quantize", e.g. "live quantize 4": how many bars a launched scene waits for. A quantize of 0 launches at the next step.`

`live` with no word after it, or with one that is not `quantize`.

```
live
live 4
```

**Fix:** `live quantize 4`.

### `"live quantize" needs one number of bars, <min>..<max>, e.g. "live quantize 4". 0 (or off) launches at the next step.`

`live quantize` with no number, or with more than one value.

```
live quantize
live quantize 1 4
```

**Fix:** exactly one number of bars, e.g. `live quantize 4`, or `off` / `0` to
launch immediately.

### `"live quantize" takes how many bars a launch waits for, <min>..<max> (0 is immediate), e.g. "live quantize 4"; got "<x>".`

A quantize outside the range, or not a whole number of bars.

```
live quantize 99
live quantize half
```

**Fix:** a whole number of bars `0`..`16`, where `0` (or `off`) is immediate.

### `scene <name> kit needs a bar number, e.g. "scene <name> 1 1 2 2 kit 2", or "kit off" for a scene that sits the machine out.`

The `kit` clause of a `scene` line with nothing after it.

```
scene A 1 1 2 2 kit
```

**Fix:** the drum-machine bar the scene performs, e.g. `scene A 1 1 2 2 kit 2`,
or `kit off` for a scene that sits the machine out.

### `scene <name> kit takes a drum-machine bar 1..<max>, or "off"; got "<x>".`

A `kit` clause whose value is not a machine bar.

```
scene A 1 1 2 2 kit 99
scene A 1 1 2 2 kit verse
```

**Fix:** a whole bar `1`..`16`, or `off` for a scene that sits the machine out.
When the song has no machine, no scene can name one — write the `machine` lines
first, or drop the `kit` clause.

### `chip needs one console, e.g. chip nes. The consoles are: nes, gb, pce, snes, gba, genesis, opl.`

A bare `chip` with nothing after it. It prints the list rather than changing
anything, which is what a missing argument does everywhere else in the language
too.

**Fix:** `chip nes`, or any of the other six — `gb`, `pce`, `snes`, `gba`,
`genesis`, `opl`. To take a console back off one channel, name the sound you want
instead: `track 1 voice lead`.

### `"<x>" is not a chip. The consoles are: nes, gb, pce, snes, gba, genesis, opl.`

`chip` with a machine word the language does not know.

```
chip dreamcast
chip game boy
```

**Fix:** name one of the consoles. The friendly spellings are accepted too
(`famicom`, `gameboy`, `tg16`, `super-nes`, `advance`, `megadrive`, `adlib`);
the second line above is two words, so write `chip gameboy`. `chip` with no
argument prints the same list.

### `tracks needs one number, e.g. tracks 4.`

`tracks` with zero or two-plus arguments.

**Fix:** `tracks 4`.

### `tracks must be a whole number 1..8; got "<x>".`

The channel count must be a whole number between 1 and 8.

```
tracks 0
tracks 12
tracks 4.5
```

**Fix:** `tracks 1` … `tracks 8`.

### `track number must be 1..<t> (the song has <t> tracks); got "<x>". Use "tracks N" first to add channels.`

A `track N` (or `mute N` / `unmute N`) naming a channel that does not exist yet.
Channels are numbered **from 1**.

```
tracks 4
track 5 "EXTRA"      # -> track number must be 1..4…
```

**Fix:** put `tracks 5` earlier in the script, and remember the first argument is a
number.

### `a channel name may be at most 16 characters; "<x>" is <n>. Shorten it, or use fewer words.`

A `track N` name longer than the limit. Names have to fit a channel row, the
pattern grid's column heading and the cell inspector, and sixteen characters is
the agreed ceiling — the same one the rename box enforces.

```
track 1 "LEAD SYNTH PAD ONE"     # 20 characters
```

**Fix:** shorten it (`track 1 "LEAD PAD"`) — or accept the app's own limit and
rename it by shift-clicking the channel name, which caps the typing for you.

### `wave must be square, triangle, saw, sine, noise, table, sample, fm, string, formant, organ, granular, font, reed, brass, bow, mallet, membrane or plate; got "<x>".`

`track … wave X` where `X` is not one of the thirteen shapes. Accepted spellings:
`square`/`sqr`/`pulse`, `triangle`/`tri`, `sawtooth`/`saw`, `sine`/`sin`,
`noise`/`lfsr`, `table`/`wavetable`, `sample`/`smpl`, `fm`/`fmsynth`/`freqmod`,
`string`/`str`/`karplus`, `formant`/`vowel`/`vox`, `organ`/`drawbar`/`hammond`,
`granular`/`grain`/`cloud`, `font`/`soundfont`/`sf2`.

```
track 1 wave sine-ish
track 1 "LEAD" wave noisemaker
```

**Fix:** name one of the shapes. The four TONAL ones (`square`, `triangle`,
`sawtooth`, `sine`) are the ones a new channel walks; the rest are reached on
purpose, and `wave font` only sounds like a soundfont when one is loaded (see
[`09-song-files.md`](09-song-files.md)).

### `wave needs a shape: "wave square", "wave triangle", "wave saw" or "wave sine". To name a channel WAVE, quote it: track <N> "WAVE" wave sine.`

A bare `wave` with nothing after it, or a bare `wave` sitting where the name
should be. A bare `wave` is a setting, never a name.

```
track 1 wave
track 1 LEAD wave          # the shape never arrived
```

**Fix:** give it a shape (`track 1 wave sine`), or, if `WAVE` was meant to be the
channel's name, quote it and put the settings after it:
`track 1 "WAVE" wave sine`.

### `hold must be a whole number of steps 1..16; got "<x>".`

The `hold` setting of a `track` line is not a number of steps. This is a
REFUSAL rather than a clamp, because a channel that rings for the wrong length is
a channel whose whole part of the song sounds wrong, and nothing downstream would
notice.

```
track 3 "PAD" hold 0
track 3 "PAD" hold many
track 3 "PAD" hold 1.5
```

**Fix:** `track 3 "PAD" wave sine hold 8`. The lengths the control cycles are
`1`, `2`, `4`, `8` and `16`, so any whole number in that range is fine.

### `hold needs a number of steps: "hold 4". To name a channel HOLD, quote it: track <N> "HOLD" wave sine.`

A bare `hold` was left in the middle of a channel's NAME. `hold` is a setting
word, exactly like `wave`, so a channel that is actually called HOLD has to be
quoted.

```
track 1 HOLD wave sine
```

**Fix:** `track 1 "HOLD" wave sine` (a name), or `track 1 wave sine hold 4` (a
setting).

### `reverb needs one number 0..100, e.g. reverb 40 (0 is dry, 100 is soaked).`

A bare `reverb` with nothing after it. This `reverb` is the SONG's room — how much
of the whole song is played in it. A channel's own send is `verb` on its `track`
line, which is a different number.

**Fix:** `reverb 40`, or `reverb 0` for a dry song.

### `reverb must be a percentage 0..100; got "<x>". 0 is dry (off), 100 is as wet as this app goes.`

The room is outside `0`–`100`, or is not a number at all. Refused rather than
clamped, like every other percentage in a script: how much room a song plays in
is the whole point of the line.

**Fix:** `reverb 40`. `0` is off, and past `60` is a large hall for most material.
`echo` takes the same range and prints the same two messages.

### `swing must be a percentage 0..100; got "<x>". 0 is straight, 100 is a deep shuffle.`

The `swing` setting is outside `0`–`100`, or is not a number at all. Swing is a
REFUSAL rather than a clamp for the same reason the tempo is: a feel is the whole
point of the line, and a silently different one is not a feel.

```
swing 140
swing -5
swing shuffle
swing 0.6      # 0.6% is very nearly straight; the number is a percentage
```

**Fix:** `swing 60`. Percentages are the whole range - `0` is straight and `100`
is the deepest lilt, and the usual useful values are `30`-`70`. `swing` is a
property of the SONG, so it goes with `tempo` and `beat`, not on a `track` line.

### `swing needs one number 0..100, e.g. swing 60 (0 is straight, 100 is a deep shuffle).`

A bare `swing` with nothing after it.

```
swing
track 1 swing 60
```

**Fix:** `swing 60` on its own line. It is not a channel setting: to make one
channel lilt, use `hold` and notes on the offbeats, or accept that a song has one
feel.

### `groove needs one feel, e.g. groove backbeat. The feels are: straight, backbeat, offbeat, shuffle, laid-back, pushed, boom-bap, swing-16, d-beat, human.`

A bare `groove` with nothing after it.

**Fix:** `groove backbeat`, or any of the ten feels. `groove straight` is how a
script says "no feel" on a song that had one.

### `"<x>" is not a groove. The feels are: straight, backbeat, offbeat, shuffle, laid-back, pushed, boom-bap, swing-16, d-beat, human.`

`groove NAME` where `NAME` is not one of the feels. A REFUSAL rather than a snap to
the nearest one, because a groove is the timing of a whole part: the wrong one is
audible but never says its name, which is the hardest kind of mistake to find.

```
groove funky
groove swing 16ths
```

**Fix:** name one of the ten (`straight`, `backbeat`, `offbeat`, `shuffle`,
`laid-back`, `pushed`, `boom-bap`, `swing-16`, `d-beat`, `human`), or one of the
friendly spellings an alias accepts (`none`, `off`, `skank`, `triplet`, `lazy`,
`eager`, `boombap`, `hip-hop`, `swing16`, `funk`, `dbeat`, `punk`, `humanize`).

### `kit needs one kit, e.g. kit 808. The built-in kits are: studio, 808, brush, rock, metal, dusty, or the name of a kit of your own.`

A bare `kit` with nothing after it.

**Fix:** `kit 808`, or any of the six built-in kits — `kit studio` is how a script
says "the presets", the same value as saying nothing at all. Any OTHER word is a
kit of your own (`kit MYHOUSE`), one you saved as a `.kit.json` — see
[`09-song-files.md`](09-song-files.md).

### `"<x>" is not a kit. The built-in kits are: studio, 808, brush, rock, metal, dusty, and a kit of your own is one word of letters or digits, like MYHOUSE.`

`kit NAME` where `NAME` could not be a kit's name at all — a space run long, an
empty word, or a word longer than sixteen characters. The built-in words are
refused here too when they are MISSPELLED, but a word that is merely unknown is
not an error any more: a kit of your own is a name that resolves against the kits
you have saved, and a song naming one this machine does not have plays the four
presets rather than refusing to open.

```
kit AVERYLONGKITNAME
```

**Fix:** one of `studio` (the four presets, and the default), `808`, `brush`,
`rock`, `metal` or `dusty` — or one word of letters, digits, `-` and `_`, at most
sixteen characters, which is a kit of your own. `OPEN` takes the same names in a file's `kit` key: a
built-in as spelled, anything else as a kit of your own, tidied to a token.

### `"<x>" is not a tuning. The tunings are: equal, just, pythagorean, meantone, septimal.`

`tuning NAME` where `NAME` is not one of the temperaments. This is a REFUSAL, not
a snap to the nearest name, the same way a voice or a groove is: a guessed tuning
still plays — slightly out of tune in a way that is invisible in a file and
obvious to an ear that is not listening for it.

```
tuning equal-ish
tuning baroque
tuning piano
```

**Fix:** `tuning just` (pure thirds and fifths in the home key), `tuning meantone`
(the quarter-comma compromise), `tuning pythagorean`, `tuning septimal` or
`tuning equal` (the default).

### `tuning needs one name, e.g. tuning just. The tunings are: equal, just, pythagorean, meantone, septimal.`

A bare `tuning` with nothing after it.

```
tuning
track 1 tuning just
```

**Fix:** `tuning just` on its own line. It is a property of the whole SONG, read
against its key, not a per-channel setting.

### `pan must be a place between the speakers -100..100: "pan -40", "pan 40", "pan L40", "pan R40" or "pan C". Got "<x>".`

A `track` line's `pan` outside `-100`–`100`, or not a number at all. Pan is where
the channel sits between the speakers.

```
track 1 pan 140
track 1 pan left
```

**Fix:** `pan -40` (left), `pan 40` (right), `pan L40`, `pan R40` or `pan C`
(centre). `-100` is hard left and `100` is hard right.

### `master needs at least one effect and a percentage 0..100, e.g. "master drive 20 tilt 15". The effects are: <the effect names>.`

A bare `master` with nothing after it. The `master` line is the effects on the
whole mix, so it needs at least one of them and the amount to use — a line with
nothing on it says nothing, and the message lists them rather than making you
guess which words it takes. (The message names the LIST rather than a COUNT: a
number in a sentence a table decides goes wrong the day the table grows.)

```
master
master drive        # a word with no number is the same mistake
```

**Fix:** `master drive 20 tilt 15`. They are the same effects a `track` line
takes, and `0` is off — a mix nobody has shaped writes no `master` line at all.

### `automate takes a channel NUMBER first, 1..<N>, e.g. "automate 2 bright 15 95 bars 8 to 15"; got "<x>". Use "tracks N" first to add channels.`

An `automate` line whose first word is not a channel the song has. A lane is
written against the song's own channels, and the message names the channel count
because the usual cause is a lane added before `tracks N`.

```
automate 9 bright 15 95 bars 1 to 4    # the song has four channels
automate pad bright 15 95 bars 1 to 4  # the channel number comes first
```

**Fix:** `tracks 5` above the line, or aim the lane at a channel that exists.

### `"<x>" is not something a lane can move. A lane can move: <the targets>. The effects, pan and the sends are built only when they are above zero, so a curve cannot fade them in from nothing — set those on the track line instead.`

An `automate` line naming something that is not a lane target — most often one of
the effects, `pan`, `verb` or `echo`. Those are NODES in the audio graph and a
node exists only when its amount is above zero, so a lane that walked one up from
nothing would need the graph rebuilt in the middle of a bar. The message names the
list it does take and says why the rest is not on it.

```
automate 2 drive 0 80 bars 1 to 4      # an effect: track 2 drive 80
automate 2 pan -50 50 bars 1 to 4      # a place, not a value a lane can walk
automate 2 bright 15 95 bars 1 to 4    # ...this is what a lane looks like
```

**Fix:** the eleven targets — the nine voice knobs, `level` and `gate`. Everything
else is set on the `track` line.

### `<target> runs <min>..<max>, <low> to <high>; got "<x>". A lane needs both ends: the value it leaves and the value it arrives at, e.g. "automate 2 <target> <min> <max> bars 8 to 15".`

Either end of a lane outside its target's range, or missing, or not a number. A
lane is a walk from one value to another, so both ends are required — the message
spells the shape out with the target's own numbers rather than making you guess
them.

```
automate 2 bright 15 140 bars 1 to 4    # 100 is as bright as this app goes
automate 2 bright 15 bars 1 to 4       # the second value is missing
automate 2 bright low high bars 1 to 4
```

**Fix:** `automate 2 bright 15 95 bars 1 to 4`. A value that is a lane's `from` and
its `to` is a set rather than a walk, and is legal.

### `a lane needs the bars it spans, written "bars 8 to 15" (or "bars 8" for one bar), 1..<N> — the same numbers "order" uses. Got "<x>".`

An `automate` line whose bar range is missing or misspelled — a lane with no bars
is a change with no WHEN, which is the one thing it cannot be. The bars are slots
of the `order`, 1-based and at most 64, exactly the numbers `order` and
`tempo … at BAR` use.

```
automate 2 bright 15 95              # where?
automate 2 bright 15 95 bars         # where?
automate 2 bright 15 95 bar 8 to 15  # the word is `bars`
automate 2 bright 15 95 bars 8       # one bar: 8 to 8
```

**Fix:** `automate 2 bright 15 95 bars 8 to 15`, or `bars 8` for a single bar.

### `bars are 1..<N>, the same numbers the order uses; got "<x>" to "<y>".`

A bar number outside `1`–`64`. Bars are slots of the arrangement, so a lane
cannot start before the song does or end after `MAX_ORDER`: a range beyond the end
of the order is a change nobody could hear.

```
automate 2 bright 15 95 bars 0 to 4
automate 2 bright 15 95 bars 1 to 99
```

**Fix:** keep both numbers inside `1`–`64`, and inside the bars the `order`
actually plays.

### `a lane runs from an earlier bar to a later one, e.g. "bars 8 to 15"; got "bars <a> to <b>". Swap them, or write two lanes if the value should rise and then fall.`

An `automate` line whose end bar comes before its start bar. This is a REFUSAL
rather than a swap, because a backwards lane has two plausible readings — walk the
same way and swap the ends, or walk down between those bars — and guessing wrong
moves a value the wrong way for a whole section.

```
automate 2 bright 95 15 bars 8 to 4    # ends before it starts
```

**Fix:** `automate 2 bright 15 95 bars 4 to 8`. For a value that rises and then
falls, write two lanes: `bars 1 to 8` and `bars 9 to 16`.

### `a song may have at most <N> automation lanes, and this one already has <N>. Take one out first.`

More than 32 lanes. The ceiling exists for the same reason the tempo map's does:
a runaway generator should hear about it rather than have its last lines quietly
dropped, and thirty-two moving values is more movement than any song has.

**Fix:** take a lane out, or write one lane where two were describing the same
stretch of bars.

### `automate needs a channel, a knob, two values and the bars it spans, e.g. "automate 2 bright 15 95 bars 8 to 15". A lane can move: <the targets>.`

A bare `automate` with nothing after it. The message lists the targets, because
the word a first-time author is missing is usually the second one.

**Fix:** `automate 2 bright 15 95 bars 8 to 15`.

### `section needs a name and the bars it holds, e.g. "section VERSE 1 1 2 1" (the pattern numbers that section plays).`

A bare `section` with nothing after it. A section is a NAME for a group of bars,
so both halves are required — the name it will be referred to by, and the pattern
numbers it plays. The message shows the whole shape rather than half of it.

```
section
section 1 1 2 1        # the name comes first
```

**Fix:** `section VERSE 1 1 2 1`, then `arrange VERSE CHORUS VERSE`.

### `a section needs a name, e.g. "section VERSE 1 1 2 1".`

A `section` line whose name is nothing but spaces or a quoted empty string. A name
is how `arrange` refers to the section, so there is no sensible reading of a
nameless one.

**Fix:** `section VERSE 1 1 2 1`.

### `a section name is one word of letters, digits, "-" or "_" — no spaces — so an arrangement can read as a list of them; got "<x>". Try "section <x> 1 1 2 1".`

A section name with a space, a punctuation mark or a leading digit. An arrangement
is read as a list of bare words (`arrange INTRO VERSE CHORUS`), so a name with a
space in it would have to be quoted at every use — the message shows the tidied
name it would use instead.

```
section MY CHORUS 1 2 3   # two words
section "THE DROP" 1 2   # quoted is still two
section VERSE-1 1 2 3    # letters, digits and a dash: fine
```

**Fix:** one word — `section CHORUS 1 2 3`, or `section DROP 1 2`.

### `a section name may be at most <N> characters; "<x>" is <N>. Shorten it.`

A section name longer than twelve characters. Names are read in lists — on the
`F3` form view and in an `arrange` line — so the budget is the same one a saved
sound's name gets.

**Fix:** a shorter name, e.g. `section VERSE`.

### `section <NAME> needs at least one bar: the pattern numbers it plays, e.g. "section <NAME> 1 1 2 1".`

A `section` line with a name and nothing else. A section with no bars is a name
for nothing, and an `arrange` that used it would silently contribute no music.

**Fix:** `section VERSE 1 1 2 1`.

### `section <NAME> machine names which bar of the drum machine the section plays, 1..<16>, e.g. "section <NAME> 1 1 machine 2".`

The `machine` setting on a `section` line has a value that is not a bar number:
the bar of the drum machine the section should play, 1..`MAX_MACHINE_BARS` (16).
A section may name a bar the machine does not have YET — the bar is clamped at
play time — but the number still has to be one a machine could hold.

**Fix:** `section CHORUS 3 4 machine 2`, or leave `machine` off to let the
machine's own `order` decide.

### `a section holds at most <N> bars, the most a song plays; this one has <N>. Shorten it, or make two sections.`

More than 64 bars listed on one `section` line. The ceiling is the song's own: an
arrangement may play at most 64 bars, so a single section longer than that could
never be used whole.

**Fix:** two sections, or a shorter one.

### `section <NAME> takes pattern numbers 1..<N>; got "<x>". A section NAME is one word and its BARS are pattern numbers, e.g. "section <NAME> 1 1 2 1".`

A bar in a `section` line that is not a whole pattern number in range — a note
name, `0`, or a number past the last pattern this language allows. This is also
what an unquoted two-word NAME turns into, which is why the message says what a
name is before it says what a bar is: the line arrives here as the name `MY` and
the bar `CHORUS`. Patterns are numbered from 1, and the numbers are the ones
already on the grid.

```
section VERSE 0 1 2 1     # patterns count from 1
section VERSE A-4 C-5     # these are pattern numbers, not notes
section MY CHORUS 1 2     # a name is ONE word: section CHORUS 1 2
```

**Fix:** `section VERSE 1 1 2 1` — one word for the name, pattern numbers for the
bars.

### `a song may have at most <N> named sections, and this one already has <N>. Use one of the names it has, or replace one.`

The one-past-the-cap distinct section name (the 25th today). Twenty-four is a form
rather than a file size — pop songs use five — and a section that shared a name
with another would REPLACE it rather than be refused, so the fix is usually to
reuse a name.

**Fix:** `section VERSE 1 1 2 1` again to redefine one, or write fewer names.

### `arrange needs one or more section names, e.g. "arrange VERSE CHORUS VERSE". A section is defined above it with "section NAME 1 1 2 1".`

A bare `arrange` with nothing after it. The message names the statement that
defines what it takes, because an arrangement is the one line in the language that
refers to something written earlier in the same script.

**Fix:** `section VERSE 1 1 2 1` above it, then `arrange VERSE VERSE`.

### `arrange names a section the song does not have: "<x>" — <the names it has>. A section is written ABOVE the line that arranges it, the way "tracks N" comes before the channels it adds.`

An `arrange` line naming a section that neither the song nor the lines above it
defines — a typo, or an arrangement written before its sections. A script is read
top to bottom, so `section` lines have to come first; the message lists the names
that DO exist, because the usual cause is a spelling that almost matches one.

```
arrange VERSE CHORUS      # nothing has defined VERSE yet
section VERSE 1 1 2 1
arrange VERS 1            # VERS is not a section
```

**Fix:** `section VERSE 1 1 2 1` above the `arrange`, or the right spelling.

### `"repeat" repeats the section named just before it, so write the name first — e.g. "arrange VERSE CHORUS repeat 2".`

`arrange` takes section names, and `repeat N` plays the name before it N times
in all — so a `repeat` with no name in front of it has nothing to repeat.

```
arrange repeat 2          # repeat what?
```

**Fix:** `arrange VERSE repeat 2` (VERSE twice), `arrange VERSE CHORUS repeat 3`.

### `give one count: the section before this is already repeated — write "repeat 4" for four times rather than two repeats of two.`

Two `repeat`s in a row. Chaining them is well defined (they multiply) and refused
anyway, because "the name before it" stops being obvious the second time and a
count that means the product of two numbers is a count nobody can check.

```
arrange VERSE repeat 2 repeat 2    # four times, but written as a puzzle
```

**Fix:** `arrange VERSE repeat 4`.

### `"repeat 1" is just the name on its own: write it once, or "repeat 2" to play it twice.`

`repeat 1` names the section exactly once, which is what writing the name alone
does. Refused rather than allowed for the same reason a cell refuses `*1`: a value
that means "nothing happened" should not look like a value that did.

```
arrange VERSE repeat 1
```

**Fix:** `arrange VERSE`, or `arrange VERSE repeat 2` for twice.

### `"repeat" needs how many times the section plays in all, 2..64, e.g. "arrange CHORUS repeat 4"; got "<x>".`

The count after `repeat` is missing, not a number, or outside the range — a
section may play at most as many times as a song has bars.

```
arrange VERSE repeat        # no count
arrange VERSE repeat twice  # not a number
arrange VERSE repeat 99     # more bars than a song has
```

**Fix:** `arrange VERSE repeat 2` through `repeat 64`.

### `that arrangement is <N> bars long, and a song plays at most <N>. Use fewer sections, or shorter ones.`

An arrangement whose sections add up to more bars than a song can play. `arrange`
BUILDS the order, so the total has to fit: the message says how long it came out,
because the sections each look reasonable individually.

```
section LONG 1 1 2 1 3 4        # 6 bars
arrange LONG LONG LONG LONG ... # 64 bars is the most the order holds
```

**Fix:** fewer sections in the arrangement, or shorter sections.

### `bus needs a name and a level, e.g. "bus DRUMS 70" — one fader over the channels that join it with "track 1 bus DRUMS".`

A bare `bus` with nothing after it. A group is a NAME and a LEVEL — one fader
over several channels — and the message names both halves, because either one on
its own does nothing: a name with no level is not a fader, and a level with no
name is what `track 1 level 70` already is.

```
bus
```

**Fix:** `bus DRUMS 70`, then `track 1 bus DRUMS` on each drum channel.

### `a bus needs a name, e.g. "bus DRUMS 70".`

A `bus` line whose name is empty or nothing but spaces (or a quoted empty
string). A group is referred to by its name from a track line, so a nameless one
could never be joined.

**Fix:** `bus DRUMS 70`.

### `"none" is the word that takes a channel OFF a bus, so it cannot be a bus's name; call it something else, e.g. "bus DRUMS 70".`

A group called `NONE`. `none` is reserved on a track line (`track 3 bus none`
takes the channel back off its group), and a name that means "no group" is a line
that means two things.

**Fix:** any other word — `bus DRUMS 70`.

### `a bus name is one word of letters, digits, "-" or "_" — no spaces — so a track line can name it; got "<x>". Try "bus <x> 70".`

A group name with a space in it (quoted, or reached through some other route),
punctuation, or a leading character that is not a letter or a digit. A track line
joins a group inside a sentence of `setting value` pairs, so the name has to be one
token: a name with a space in it could never be written there.

```
bus "THE KIT" 70     # quoted is one token, but a name with a space is not a name
bus KIT! 70          # punctuation
bus DRUMS-1 70       # letters, digits and a dash: fine
bus 1KIT 70          # a leading digit is fine too, as long as the name is one word
```

An UNQUOTED two-word name does not land here at all — `bus MY DRUMS 70` is read as
the name `MY` and the level `DRUMS`, and the message for that says how to join the
words.

**Fix:** one word — `bus DRUMS 70`, or `bus KIT 70`.

### `a bus name may be at most <N> characters; "<x>" is <N>. Shorten it.`

A group name longer than twelve characters, the same budget a section name and a
saved sound get.

**Fix:** a shorter name, e.g. `bus DRUMS 70`.

### `bus <NAME> needs a level: a percentage <min>..<max>, e.g. "bus <NAME> 70". <max> leaves the channels as loud as their own faders say, <min> silences the group.`

A `bus` line with a name and nothing else. The level is what makes it a FADER
rather than a label, so it is required — and the two ends of the range are worth
saying plainly, because `100` here is not "loud": it is "exactly as loud as the
channels on it already are".

```
bus DRUMS
```

**Fix:** `bus DRUMS 70`.

### `bus <NAME> takes a level <min>..<max>; got "<x>". <max> leaves the channels as loud as their own faders say, <min> silences the group. A bus NAME is one word, so if "<x>" and "<x>" were meant as one, write "bus <x> 70".`

A `bus` level outside `0`–`100`, or not a number. Refused rather than clamped,
like a channel's own `level`, because it changes the balance of the whole song the
moment it is applied and nothing downstream would notice.

```
bus DRUMS 140
bus DRUMS loud
bus DRUMS -10
bus MY DRUMS 70      # reads MY as the name and DRUMS as the level
```

That last one is why the message says what a name is: a two-word group name is the
one mistake here that looks like a correct line.

**Fix:** `bus DRUMS 70` — or `bus MYDRUMS 70` if the two words were the name.

### `a song may have at most <N> buses, and this one already has <N>. Use one of the names it has, or replace one.`

The fifth distinct group. A song here has at most eight channels, and a group of
one channel is just that channel's fader — so four groups is the most a song can
use without one of them being pointless. Redefining a name that already exists
REPLACES it rather than being refused, so the fix is usually to reuse a name.

**Fix:** `bus DRUMS 60` again to move the group, or squeeze more into the four.

### `track <N> joins a bus the song does not have: "<x>" — <what the song has>. A bus is declared ABOVE the channel that joins it, e.g. "bus DRUMS 70" then "track <N> bus DRUMS". Write "bus <none>" to take a channel back off a group.`

A track line naming a group that neither the song nor the lines above it defines.
A script is read top to bottom, so `bus` lines come first — the same rule `tracks
N` and `arrange` follow — and the message lists the groups that DO exist, because
the usual cause is a spelling that almost matches one.

```
track 1 bus DRUMS      # nothing has defined DRUMS yet
bus DRUMS 70
```

**Fix:** `bus DRUMS 70` above the track lines, or the right spelling.

### `bus needs the name of a group, e.g. "bus DRUMS" (or "bus <none>" to leave the one it is on). A group is declared on its own line above the channels that join it: "bus DRUMS 70". To name a channel BUS, quote it: track <N> "BUS" wave sine.`

The word `bus` left bare on a track line — `track 1 "KICK" bus`, with the name
missing. The setting takes a value like every other one, and the message says so
rather than renaming the channel to "BUS".

**Fix:** `track 1 "KICK" bus DRUMS`.

### `master takes the effects in pairs: <the effect names>. Got "<word>". Shape ONE channel on its track line; the room is "reverb 30".`

A word on a `master` line that is not one of the effects — most often `verb`
or `echo` (which are a channel's SENDS), `level` or `pan` (which belong to a
channel), or `reverb` (which is the room and a statement of its own). The two
neighbouring statements are the ones people reach for, so the message names them.

```
master verb 40       # a send belongs to a channel: track 1 "PAD" verb 40
master level 80      # a level belongs to a channel
```

**Fix:** `master drive 20 crush 15`, or `reverb 30` for the room.

### `master <effect> needs a percentage 0..100, e.g. "master <effect> 20".`

An effect named on a `master` line with no amount after it. Every one of the six
needs a number: `master drive` says which effect and not how much of it.

**Fix:** `master drive 20`.

### `<drive|chorus|crush|punch|tilt|gate> is a percentage 0..100; got "<x>". 0 is off, 100 is as <high> as this app goes.`

One of the channel's effects (`track 1 drive 40`) or the mix's (`master drive
20`) written outside `0`–`100`, or not a number. Refused rather than clamped, like every other percentage in a
script — and the message names the far end of the effect you asked for, because
that is the number worth choosing.

```
track 1 drive 140        # too much
track 1 crush hard       # a percentage, not a taste
track 1 chorus 40        # the effect; the `thick` knob is `thick` or `width`
```

**Fix:** a number from `0` (off, and what every channel in every old song is) to
`100` (as much as the app does). `40` is a normal amount of any of them.

### `<verb|echo> on a track line is a send, a percentage 0..100; got "<x>". 100 sends all of this channel into the reverb (the default), 0 keeps it dry.`

A `track` line's `verb`/`echo` outside `0`–`100`, or not a number. A send is how
much of THIS channel goes into the song's room, which is why `100` is the default:
a song with no reverb sounds exactly the same whatever its sends say.

**Fix:** `verb 40` (about half of this channel in the room), or `verb 0` (dry).

### `level is a percentage 0..100; got "<x>". 100 is full volume, 0 is silent.`

The `level` setting of a `track` line is outside `0`–`100`, or is not a number at
all. This is a REFUSAL rather than a clamp, like `hold` and the nine sound knobs,
because a script is read back the moment it is written: a channel at the wrong
level changes the balance of the whole song, and nothing downstream would notice.

```
track 2 "BASS" level 140
track 2 "BASS" level -5
track 2 "BASS" level loud
```

**Fix:** `track 2 "BASS" level 65`. Percentages are the whole range — `0` is
silent, `100` is full volume, and a file (rather than a script) with a level past
the range is clamped, because its author has already gone home.

### `duck is a percentage 0..100; got "<x>". 0 is off, 100 pushes the other channels all the way out for the length of the note.`

The `duck` setting of a `track` line is outside `0`–`100`, or is not a number.
A duck is how far THIS channel pushes the others down while it plays — the pump
under a four-on-the-floor kick, or the hole a lead vocal leaves for itself.

```
track 1 "KICK" duck 140
track 1 "KICK" duck hard
track 1 "KICK" duck 200
```

**Fix:** `track 1 "KICK" duck 60`. Percentages are the whole range — `0` is off
(and what every song written before ducks existed has), `100` is the others gone
for the length of the note. `40`–`70` is where most of it lives; the dip always
comes back before the next note of the channel that was pushed down.

### `strum is a span of 0..4 steps; got "<x>". 0 plays the chord as a block, 4 rolls it across 4 steps.`

The `strum` setting of a `track` line is outside `0`–`4`, or is not a number. A
strum is how far this channel rolls a CHORD: `0` lands every note of the chord on
the step (a block), and a larger span staggers the notes so the first is on the
step and the last arrives that many steps later.

```
track 3 "GTR" strum 5
track 3 "GTR" strum fast
track 3 "GTR" strum -1
```

**Fix:** `track 3 "GTR" strum 1`. Whole steps, `0`–`4`: `0` is the block every
song written before strums existed plays, `1` rolls a chord inside a single step,
and `2`–`4` spread it across that many steps — a lazy, arpeggiated strum.

### `"<x>" is not a feel. Feels: ….`

The `groove` setting of a `track` line names something the app does not know as a
feel. A feel belongs to the PART — a shuffled hat under a straight song, a
laid-back bass behind a pushed lead — and the names are the same ones the
song-level `groove` uses.

```
track 4 "HAT" groove funky
track 4 "HAT" groove shuffle-8
```

**Fix:** one of the feels the message lists: `straight`, `backbeat`, `offbeat`,
`shuffle`, `laid-back`, `pushed`, `human` (plus their aliases, e.g. `lazy` or
`triplet`). Spelling is exact here because a misspelling is the commonest way to
get this message, and it is the same reason an unknown `voice` name is refused.

### `humanize is a percentage <…>..<…>; got "<x>". <…> is a machine, <…> is unmistakably played by hand.`

The `humanize` setting of a `track` line is outside the range, or is not a number.
It is how much that one channel is PLAYED rather than typed — the named `human`
feel's wobble, with an amount, on one part.

```
track 2 "LEAD" humanize 150
track 2 "LEAD" humanize loose
```

**Fix:** `track 2 "LEAD" humanize 30`. `0` is a machine (and the default), and
`100` is unmistakably by hand; `20`–`40` is the lo-fi and live-jazz end, and past
about `60` the part stops sounding relaxed and starts sounding wrong.

### `robin is a percentage 0..100; got "<x>". 0 is every hit identical (the default), 100 gives each hit a few cents, a few percent of level and a little brightness of its own.`

The `robin` setting of a `track` line is outside the range, or is not a number.
It is how much that one channel's successive hits differ from one another — a
round-robin walking a fixed four-hit cycle, so the same song always plays the
same way.

```
track 2 "SNARE" robin 150
track 2 "SNARE" robin lots
```

**Fix:** `track 2 "SNARE" robin 60`. `0` is every hit as written (and the
default), and `100` is as far apart as this app goes; the difference is small by
design, so `30`–`60` is the useful range for a snare, a shaker or a repeated
chord.

### `touch is a percentage 0..100; got "<x>". 0 is velocity as a level and nothing else (the default), 100 makes a note at velocity 0 up to 30 points darker.`

The `touch` setting of a `track` line is outside the range, or is not a number.
It is how much a hit's tone follows how hard it was struck — a soft note darker
as well as quieter.

```
track 3 "BASS" touch 150
track 3 "BASS" touch soft
```

**Fix:** `track 3 "BASS" touch 70`. `0` is velocity as a level and nothing else
(and the default); the setting only ever darkens, so it is safe on a part that
was already fine.

### `drift is a percentage 0..100; got "<x>". 0 is a steady pitch (the default), 100 wanders about eighteen cents — the wow and flutter of a worn machine.`

The `drift` setting of a `track` line is outside the range, or is not a number.
It is how far that one channel's pitch WANDERS — a slow wow plus a fast flutter,
the same wobble the `tape` effect has, on its own and movable over bars by an
`automate` lane.

```
track 3 "PAD" drift 150
track 3 "PAD" drift wobbly
```

**Fix:** `track 3 "PAD" drift 40`. `0` is a steady pitch (and the default), and
`100` wanders about eighteen cents — audible on a held note, never enough to read
as out of tune.

### `speed must be a percentage 25..400; got "<x>". 100 plays the song as written, 50 is half speed (an octave down), 200 is double (an octave up).`

The `speed` statement of a song is outside the range, or is not a number. It is
the tape transport: one ratio that moves pitch and TIME together, so the whole
record plays back slower/faster and lower/higher at once.

```
speed 10
speed fast
```

**Fix:** `speed 80` (slower and a little lower — the slowed-and-reverbed sound),
or `speed 50` for half speed an octave down, or `speed 100` to play as written.
The range is 25–400 %: two octaves down and two up.

### `"reverse" reads the range backwards and takes nothing else — e.g. "rows 0 to 3 reverse"; got "<x>".`

The `reverse` transformation of a `rows` statement was given something after the
word. There is exactly one way to read a run of steps the other way, so it takes
no number and no further word.

```
rows 0 to 3 reverse 2
```

**Fix:** `rows 0 to 3 reverse`, and write the range you mean.

### `speed needs one percentage 25..400, e.g. speed 80 for a slower record (100 is normal).`

The `speed` statement was written with no value, so there is nothing to set. It
is a property of the whole song, like `tempo`, and takes one number.

```
speed
```

**Fix:** `speed 80`, or `speed 100` to play the song as written.

### `poly is a whole number <…>..<…> of notes at once; got "<x>". <…> is one note at a time, which is what every channel was before this.`

The `poly` setting of a `track` line is not a whole number, or is outside `1`–`8`.
It is how many notes one channel may hold AT ONCE, and it is the setting that
changes what a cell can mean.

```
track 3 poly 0
track 3 poly 2.5
track 3 poly 12
track 3 poly many
```

**Fix:** `track 3 poly 6`. `1` (the default) is monophonic — a new note takes the
one still ringing, which is what every channel was before this. `3`–`4` covers a
triad or a seventh; `6`–`8` is a two-handed piano part or a pad with a moving
inner line. A channel that runs out of notes steals the OLDEST first, and the
quietest among notes that began together, so a chord written by the `chord` tool
gives up its inner voice rather than its top line.

### `"<x>" is not a filter shape. The shapes are: round, sharp, nasal, hollow.`

The `shape` setting of a `track` line names something the app does not know as a
filter shape. It says which PART of the sound survives the channel's filter —
`bright` is still where the cutoff sits, the shape is what kind of filter it is.

```
track 2 "LEAD" shape warm
track 2 "LEAD" shape lowpass-x
```

**Fix:** one of the four the message lists — `round` (the low-pass, and the
default), `sharp` (a high-pass: the bottom goes), `nasal` (a band-pass: a vowel)
or `hollow` (a notch: the middle is scooped out). The technical spellings work
too, since they are aliases: `lowpass`/`lp`, `highpass`/`hp`, `bandpass`/`bp`,
`notch`. `round` needs no line at all, because that is what every channel is
before one says otherwise.

### `shape needs one filter shape, e.g. "shape sharp" (which part of the sound survives). The shapes are: round, sharp, nasal, hollow. To name a channel SHAPE, quote it: track <N> "SHAPE" wave sine.`

`shape` was left with nothing after it, or with more than one word. It is a
setting word, exactly like `wave` and `poly`, and it takes exactly one value.

```
track 2 "LEAD" shape
track 2 "LEAD" shape sharp hollow
```

**Fix:** `track 2 "LEAD" shape sharp`.

### `duck needs a percentage 0..100, e.g. "duck 60" (0 is off, 100 pushes the other channels all the way out while this one plays). To name a channel DUCK, quote it: track <N> "DUCK" wave sine.`

A bare `duck` was left with nothing after it, or was sitting where the channel's
NAME should be. `duck` is a setting word, exactly like `level` and `glide`.

```
track 1 duck
track 1 DUCK wave sine
```

**Fix:** `track 1 duck 60` (a setting), or `track 1 "DUCK" wave sine` (a name).

### `level needs a percentage 0..100, e.g. "level 70" (100 is full, 0 is silent). To name a channel LEVEL, quote it: track <N> "LEVEL" wave sine.`

A bare `level` was left with nothing after it, or was sitting where the channel's
NAME should be. `level` is a setting word, exactly like `wave` and `hold`.

```
track 1 level
track 1 LEVEL wave sine
```

**Fix:** `track 1 level 70` (a setting), or `track 1 "LEVEL" wave sine` (a name).

### `"<x>" is not a voice. Voices: lead, pluck, bell, glass, bass, sub, pad, strings, organ, flute, kick, snare, hat, wind.`

`track … voice V` where `V` is not one of the named voices. This is a REFUSAL,
not a snap to the nearest name, because a guessed voice still plays — as the
wrong instrument, which is invisible in a file and obvious only to an ear that is
not listening for it.

When the app has sounds the user SAVED (the `F4` menu's `SAVE AS…`), they are
listed too, in a second sentence: `Yours: MYPAD, BRASS.` They are addressed
exactly like the built-ins (`voice mypad`), so a name in that list is not an
error — but note that the list is the LIBRARY'S, and a saved sound exists only in
that browser: the same script refuses the same line on a machine where it was
never saved.

```
track 1 voice piano       # not a Tracklet voice
track 1 voice pads        # close, but a near miss is still a miss
track 1 voice square      # that is a WAVEFORM, not a voice — use `wave square`
```

**Fix:** name one of the fourteen voices (`voice pad`), or, if a waveform is what
you meant, use `wave`. For a sound of your own, set the nine knobs instead:
`track 1 bright 30 noise 20`.

### `voice needs a voice name, e.g. "voice pad". Voices: …. To name a channel VOICE, quote it: track <N> "VOICE" wave sine.`

A bare `voice` with nothing after it, or a bare `voice` sitting among the name
words. Like `wave` and `hold`, a bare `voice` is a setting, never a name.

```
track 1 voice
track 1 PAD voice            # the voice name never arrived
```

**Fix:** give it a voice (`track 1 voice pad`), or quote it if VOICE is really the
channel's name (`track 1 "VOICE" wave sine`).

### `<knob> is a percentage 0..100; got "<x>". 0 is <low>, 100 is <high>.`

One of the nine sound knobs — `bright`, `sweep`, `duty`, `noise`, `attack`,
`decay`, `ring`, `release`, `thick` (or an alias such as `tone`, `wah`,
`pulse-width`, `hiss`, `fall`, `sustain`, `tail`, `width`) — was given a value
outside its range. It is refused rather than clamped, because a wrongly dialled sound is
invisible in a file: it still plays, just not the way the author pictured.

```
track 1 bright 140
track 1 noise -10
track 1 ring loud
```

**Fix:** a number from 0 to 100. The message names the two ends of the knob, so
`bright` reports `0 is dark, 100 is bright` and `sweep` reports `0 is flat, 100 is
wah`.

### `<knob> needs a percentage 0..100, e.g. "bright 40" (0 is dark, 100 is bright). To name a channel BRIGHT, quote it: track <N> "BRIGHT" wave sine.`

A bare knob word was left on a `track` line as if it were a name. Every knob is a
SETTING word, so a channel that is genuinely called `BRIGHT`, `NOISE`, `RING`,
`ATTACK` or `THICK` has to be quoted.

```
track 1 bright wave sine     # BRIGHT read as a setting, its value missing
track 1 LEAD tone            # the value never arrived
```

**Fix:** give the knob a value (`track 1 bright 70`), or quote it to make it a
name (`track 1 "BRIGHT" wave sine`).

### `"<on|off>" is a mute flag here, not a name. Write "mute <N>" / "unmute <N>", or quote it to name a channel: track <N> "<ON|OFF>".`

A bare `on`/`off` anywhere but the end of the line, where it is read as the mute
flag. Only the trailing one is a flag; the rest of the words are the name, and a
name cannot be a bare setting word.

```
track 1 off BASS           # the flag ended up before the name
```

**Fix:** put the flag last (`track 1 BASS off`), use `mute 1`, or quote it if it
really is part of the name (`track 1 "off BASS"`).

### `<mute|unmute> needs a track number 1..<t>; got "<x>".`

`mute`/`unmute` with a missing, non-integer, or out-of-range channel number.

**Fix:** `mute 2` (channels count from 1).

### `layer takes a channel NUMBER first and a layer number second, e.g. "layer 2 3 wave saw" for the third layer of channel 2. Channels are 1..<t>; got "<x>". Use "tracks N" first to add channels.`

A `layer` line is addressed by two numbers — which channel, then which layer of
it — and the first one is not a channel the song has at that line. Like `track`,
the count is the one the script has reached so far.

```
tracks 2
layer 4 2 wave saw       # the song has two channels
```

**Fix:** use a channel number `1`..`<t>`, or write `tracks N` above the line.

### `the second number is the LAYER: 1 is the channel's VOICE, and a channel may have up to 4 layers in all. Got "<x>".`

The second number of a `layer` line is missing, is not a whole number, or is past
the layer cap. Layer 1 is the channel's voice; 2, 3 and 4 are the layers stacked
above it.

```
layer 1 wave saw         # no layer number
layer 1 5 wave saw       # a fifth layer does not fit
```

**Fix:** write `1`–`4`, remembering that layer 1 IS the voice — `layer 1 1 wave
saw` and `track 1 wave saw` are the same edit.

### `channel <t> has <n> layers, and a stack has no holes: write "layer <t> <n+1>" to add the next one.`

Layers are a LIST, so a channel grows one at a time: layer 3 can only be written
once layer 2 exists.

```
tracks 1
layer 1 3 wave saw       # the channel has one layer: its voice
layer 1 2 wave saw       # add the second first
layer 1 3 wave saw       # ...then the third
```

**Fix:** add the next free layer (`layer <t> 2`, then `3`, then `4`), or write the
layer that already exists.

### `a channel may have at most 4 layers, and channel <t> already has <n>. Remove one first, or layer another channel.`

The channel is full: a voice plus three layers.

**Fix:** shape the layers you have, remove one with `layer <t> <l> clear`, or put
the extra sound on another channel.

### `"<clear|remove>" takes nothing after it: write "layer <t> <l> clear" on a line of its own.`

`clear` (or its alias `remove`) was written with something after it, or mixed in
among settings. It is the whole line or nothing: "remove this layer AND set it"
is two instructions in one, and the second would have nothing left to apply to.

```
layer 1 2 clear octave 1     # clear is the whole line
layer 1 2 clear              # ...this is the line
layer 1 2 remove             # `remove` is the same statement
layer 1 2 octave 1 clear     # found anywhere after the two numbers
```

**Fix:** write `clear` (or `remove`) alone, after the channel and layer numbers.

### `channel <t> has <n> layers, so there is no layer <l> to remove.`

`layer <t> <l> clear` named a layer the channel does not have. The parser counts
the layers as the lines run, so this also fires when the `clear` comes before the
line that would have added the layer.

**Fix:** clear a layer that exists (`layer 1 2 clear`), or drop the line.

### `layer 1 is channel <t>'s VOICE, and a channel always sounds like something. Pick another voice, mute the channel, or remove a layer above it.`

`clear` (or `remove`) on layer 1. A channel with no layers is a channel that
cannot make a sound, which is not a thing to say by emptying an instrument.

**Fix:** to silence the channel, write `mute <t>`; to change what it sounds like,
name a voice or set a waveform. To take a layer off, clear one numbered 2 or
higher.

### `layer <t> 1 is the channel's VOICE, which is always in tune and at full level - <fix>`

`octave`, `detune` or `gain` was written for layer 1. A voice is in tune with
itself at full level by definition — which is exactly what keeps every song
written before layers existed sounding the same — so it has no pitch to move and
no level of its own.

```
layer 1 1 octave 1       # a voice cannot be transposed
layer 1 2 octave 1       # ...but a layer above it can
layer 1 1 gain 40        # the voice has no level either
track 1 level 40         # this is how loud the channel sits in the mix
```

**Fix:** the message names it — put the transposition on a layer above
(`layer <t> 2 octave 1`), or use `level N` on the `track` line for the channel's
place in the mix.

### `<octave|detune|gain> must be a whole number <min>..<max>; got "<x>". <min> is <low>, <max> is <high>.`

A layer field outside its range. `octave` is `-4`..`4`, `detune` is `-100`..`100`
cents, and `gain` is `0`..`100` percent.

**Fix:** pick a value in the range. Both ends are always a real sound: `octave 4`
is four octaves up, `detune -100` is a semitone flat, `gain 0` is a silent layer.

### `"<word>" is not a layer setting. A layer takes wave, octave, detune, gain, the nine sound knobs (bright, sweep, duty, noise, attack, decay, ring, release, thick), or "layer <t> <l> clear" to remove it.`

An unrecognised word after the two numbers — often a track setting that belongs
on the `track` line instead (`hold`, `level`, `pan`, `glide`, `vibrato`, `strum`, `verb`,
`echo`), or a misspelling of one of the twelve names above.

```
layer 1 2 hold 4         # hold belongs to the channel
track 1 hold 4
layer 1 2 noise 40       # ...this one IS a layer setting
```

**Fix:** use one of the listed names, or move the setting to the `track` line.

### `voice names a whole CHANNEL's sound, which is its layer 1: write "track <t> voice pad". A layer above it is written out: "layer <t> <l> wave saw bright 55".`

`voice` on a `layer` line. A preset names the sound of a whole channel, and a
channel's sound is its layer 1.

**Fix:** `track <t> voice pad` for the channel's instrument, or write the layer's
waveform and knobs out by hand.

### `"<word>" needs a value, e.g. "<setting> <value>".`

A `layer` (or `track`) setting word with nothing after it, or with another
setting word where its value should be.

```
layer 1 2 detune         # detune what?
layer 1 2 detune -9
```

**Fix:** give it a value. On a `layer` line the words take `wave <shape>`,
`octave <-4..4>`, `detune <-100..100>` and `gain <0..100>`.

### A word a `track` line does not take

`pan`, `glide`, `vibrato`, `verb`, `echo`, `gain`, `octave`, `detune` and `layer`
are all real words to the language, so one of them left among a `track` line's
words is caught rather than read as a channel NAME,
which is what would otherwise happen — `track 1 gain 40` would quietly rename the
channel to `GAIN 40`.

```
track 1 gain 40          # gain is a layer's level
track 1 level 40         # ...this is the channel's
track 1 octave 2         # a channel has no octave
track 1 layer 2 wave saw # a layer is its own line
```

**Fix:** each message names the line to write instead. `level` for the channel's
loudness, `layer <t> <l> <setting>` for a layer's, and `octave`/`detune` on the
layer you meant to move.

**What each one prints**, word by word:

```text
<octave|detune> is not a track setting: a voice is always in tune, and where the TRACK plays is written in its notes. Stack a layer and move that instead, e.g. "layer <t> 2 octave 1".
gain is a LAYER's level inside the instrument. For how loud the channel sits in the mix, write "level 60"; for a layer above the voice, "layer <t> 2 gain 40".
layer is a statement of its own, on its own line: "layer <t> 2 wave saw" is the second layer of channel <t>. Write "tracks <t>" first if the song has fewer channels.
pan needs a place between the speakers, e.g. "pan L40", "pan R40", "pan -40", "pan 40" or "pan C" for centre. To name a channel PAN, quote it: track <t> "PAN" wave sine.
glide needs a percentage 0..100, e.g. "glide 40" (0 is none, 100 slides for the whole note). To name a channel GLIDE, quote it: track <t> "GLIDE" wave sine.
vibrato needs a percentage 0..100, e.g. "vibrato 30" (0 is steady). To name a channel VIBRATO, quote it: track <t> "VIBRATO" wave sine.
duck needs a percentage 0..100, e.g. "duck 60" (0 is off, 100 pushes the other channels all the way out while this one plays). To name a channel DUCK, quote it: track <t> "DUCK" wave sine.
strum needs a span in steps 0..4, e.g. "strum 1" (0 plays the chord as a block). To name a channel STRUM, quote it: track <t> "STRUM" wave sine.
<drive|chorus|crush|punch|tilt|gate> needs a percentage 0..100, e.g. "<effect> 40" (0 is off, 100 is as <high> as this app goes). To name a channel <EFFECT>, quote it: track <t> "<EFFECT>" wave sine.
<verb|echo> on a track line is a SEND: how much of this channel goes into the <reverb|echo>, 0..100, e.g. "<verb|echo> 40". 100 is everything and is the default, 0 keeps the channel dry. The bare "reverb 40" statement is a different number: the amount of the reverb that comes back. To name a channel VERB, quote it: track <t> "VERB" wave sine.
```

The words that have a section of their own above (`wave`, `hold`, `level`, the
nine knobs, `voice`, the mute flag) print the same shape with their own advice.

### `pattern must be a whole number 1..64; got "<x>".`

`pattern` with a missing, non-integer, or out-of-range pattern number. Patterns
are numbered **from 1** and there are at most 64.

```
pattern 0
pattern 2.5
pattern 999
```

**Fix:** `pattern 1` … `pattern 64`.

### `order takes pattern numbers 1..64; got "<x>".`

An `order` line names bars by pattern number, and one of the numbers is not one.

```
order 1 0 2       # patterns are numbered from 1
order 1 two 3     # a pattern number, not a word
```

**Fix:** `order 1 2 1 3`. Rows count from 0, but PATTERNS count from 1.

### `order needs at least one pattern number, e.g. order 1 2 1 3 (the song plays those bars in that order).`

`order` with nothing after it. An empty order would be a song with no bars, so
it is refused rather than read as "play nothing".

**Fix:** `order 1`, or a longer list.

### `a song order may have at most 64 slots; this one has <n>. Shorten it.`

An `order` line longer than a song may be. The ceiling is here because the order
is the form of the whole piece, and a thousand bars is a file rather than a song.

```
order 1 2 3 4 5 6 7 8 … 65 bars
```

**Fix:** shorten the order, or write the long form as more than one song. Bars can
repeat cheaply — `order 1 2 1 2 1 2 3 3` is eight bars in eight numbers.

### `clear takes at most one pattern number, e.g. clear or clear 2.`

```
clear 2 3
```

**Fix:** `clear` (the current pattern) or `clear 2` (one specific one).

### `clear needs a pattern number 1..64; got "<x>".`

`clear X` where `X` is not a valid pattern number.

**Fix:** `clear`, or `clear 1` … `clear 64`.

### `copy needs two pattern numbers, e.g. copy 1 2 (copies pattern 1 into pattern 2).`

`copy` with a missing, non-integer, or out-of-range argument.

```
copy 1
copy 1 99
copy a b
```

**Fix:** `copy <from> <to>`, both 1–64.

### `rows needs a range of steps and what to do with them — e.g. "rows 0 to 3 octave up", "rows 0 to 3 octave down 2" or "rows 0 to 3 repeat 4". A range can do: octave up, octave down, repeat, roll.`

`rows` with too few values to say what to do. The statement is a RANGE and a
transformation: which steps, then what happens to them.

```
rows
rows 0 to 3
rows 0 to 3 octave
```

**Fix:** `rows <from> to <to> octave up|down [N]`, `rows <from> to <to> repeat N`,
or `rows <from> to <to> roll [N]`. It acts on the pattern `pattern` selected, the
way `note` and `erase` do.

### `rows takes a range written "A to B" — the steps to act on, e.g. "rows 0 to 3 octave up". Rows count from 0, the same numbers the grid shows.`

A range that is not two numbers with `to` between them.

```
rows 0 3 octave up        # no `to`
rows 0 til 3 octave up
```

**Fix:** `rows 0 to 3 …`. Rows count from 0, exactly as the number column in the
grid shows them.

### `"octave" moves the range UP or DOWN, and how many octaves is optional — e.g. "rows 0 to 3 octave up" for one octave, or "rows 0 to 3 octave down 2" for two; got "<x>".`

An `octave` transformation with no direction (or one that is not a direction),
or with too many values after it.

```
rows 0 to 3 octave
rows 0 to 3 octave sideways
rows 0 to 3 octave up 1 1
```

**Fix:** `octave up` or `octave down`, and optionally how many octaves —
`rows 0 to 3 octave down 2`. One octave is the default.

### `how many octaves must be a whole number 1..8; got "<x>".`

A count of octaves outside the range, or not a whole number.

**Fix:** `1`–`8`. A run that would leave `B-8` is clamped rather than refused, so
a larger count is not needed — it would only pile notes up at the top.

### `"repeat" needs how many times the range plays IN ALL — e.g. "rows 0 to 3 repeat 4" for four copies of that four-row figure; got "<x>".`

A `repeat` that says nothing, or says more than a count.

```
rows 0 to 3 repeat
rows 0 to 3 repeat 2 2
```

**Fix:** `rows 0 to 3 repeat 4`, and nothing after the count.

### `"roll" takes how many hits each step becomes, and nothing else — e.g. "rows 0 to 3 roll 4"; got "<x>".`

A `roll` with values after it that are not a count.

```
rows 0 to 3 roll 4 4
rows 0 to 3 roll 4 faster
```

**Fix:** `rows 0 to 3 roll 4`, and nothing after the count — `N` is how many
hits each step holds, not how long the range is.

### `a roll retriggers each hit 2..8 times inside its own step; got "<x>". "roll" on its own is 4. More than 8 in one step is not a roll — write it across two cells, or use a faster grid.`

A roll count outside the range, or not a whole number.

```
rows 0 to 3 roll 1
rows 0 to 3 roll 9
rows 0 to 3 roll twice
```

**Fix:** `2`–`8`, or leave it out for `4`. `roll 1` is refused for the reason a
cell refuses `*1`: a count that means nothing should not look like a count that
did. The same range is the one a cell's own `*N` suffix takes.

### `"repeat" needs how many times the range plays IN ALL, 2 or more — e.g. "rows 0 to 3 repeat 4"; got "<x>". "repeat 1" is just the range on its own, so write it once.`

A count that is missing, not a whole number, one, or zero. A count of 1 is
refused for the same reason a cell refuses `*1` and `arrange` refuses
`repeat 1`: a count that means nothing should not look like a count that did.

```
rows 0 to 3 repeat 1
rows 0 to 3 repeat 0
rows 0 to 3 repeat twice
```

**Fix:** `repeat 2` or more. Remember the count is how many times the figure
plays **in all**, not how many extra copies it gets.

### `"<x>" is not something a range of steps can do. A range can do: octave up, octave down, repeat, roll.`

An unknown transformation after the range.

```
rows 0 to 3 sideways
rows 0 to 3 transpose 2
```

**Fix:** one of `octave up`, `octave down`, `repeat N` or `roll [N]`. `fill`,
`harmonize` and `variation` are not words yet — a range of steps is the grammar
they will be written with, not one of them.

### `a range of steps runs from an earlier row to a later one, e.g. "rows 0 to 3"; got "rows 4 to 1". Swap the two ends, or write two statements if the rows are not one run.`

A range written backwards.

```
rows 4 to 1 octave up
```

**Fix:** `rows 1 to 4 octave up`, or two statements if the two ends were two
different runs.

### `a range of steps has to stay inside the pattern, rows 0..15 (the grid shows rows 00..15); got "rows 0 to 16". "steps N" makes the grid longer.`

A range that runs past the last row of the pattern. The message prints the rows
the pattern really has.

**Fix:** use a row the grid shows, or make the grid longer with `steps 32`
*before* the `rows` line. A `steps` line that comes after cannot retroactively
make an earlier range valid — lines take effect in order.

### `that is 4 rows played 8 times in all, which needs 32 rows; the pattern holds 16. Start the range earlier, repeat it fewer times, or make the grid longer with "steps N".`

A repeat whose copies do not fit. The three numbers in the message are the
arithmetic: the length of the figure, how many times it plays, and the rows that
needs.

```
rows 0 to 3 repeat 8     # four rows × eight = thirty-two
```

**Fix:** repeat it fewer times (`repeat 4` fills a sixteen-row pattern exactly),
start the range earlier, or give the pattern more rows with `steps 32`.

### `note takes three to five values: note ROW TRACK PITCH [VELOCITY] [ARTICULATION] — e.g. note 4 2 C-5, note 4 2 C-5 40 for a soft hit, or note 4 2 C-5 40 ">" for a slide.`

`note` with the wrong number of arguments. It takes a pitch, and then up to two
more values: how hard the note is hit and what it *does*. **Row is 0-based, track
is 1-based.**

```
note 0 1                        # missing the pitch
note 0 1 C-4 80 > a sixth       # one value too many
```

**Fix:** `note <row> <track> <pitch>` — e.g. `note 0 1 C-4`, `note 0 1 C-4 40`,
or `note 0 1 C-4 40 ">"`. The two extras may be written in either order, and a
value that is neither a percentage nor an articulation gets its own complaint
(see below) rather than this one.

### `erase takes two values: erase ROW TRACK — e.g. erase 4 2.`

`erase` with the wrong number of arguments.

**Fix:** `erase <row> <track>` — e.g. `erase 4 2`. (`note 4 2 .` is the same
thing.)

### `row must be 0..<rows-1> (the grid shows rows 00..<n>); got "<x>".`

A `note` / `erase` row outside the pattern. **Rows count from 0**, so a 16-step
pattern (the default) has rows `0`–`15`, and a `steps 512` pattern has `0`–`511`.
One past the end is the first invalid value.

```
note 16 1 C-4        # off the end
note -1 1 C-4
```

**Fix:** use a row from `0` to `15`.

### `track must be 1..<t>; got "<x>".`

A `note` / `erase` channel outside the channel list. **Channels count from 1.**

```
note 0 0 C-4         # channel 0 does not exist
note 0 9 C-4         # nine channels do not exist
```

**Fix:** use a channel from `1` to the song's channel count.

### `"<x>" is not a note. Use C0..B8 with an optional # or b, e.g. C-4, C#4, Eb5 — or "." to erase.`

The pitch argument of a `note` statement is not a pitch and is not an empty
token.

```
note 0 1 H-4
note 0 1 C-99
```

**Fix:** `note 0 1 C-4`, or `note 0 1 .` to erase the cell.

### `"<x>" has a velocity outside 0..100. Write the note, a ~, and how hard it is hit — e.g. C-4~80.`

The force suffix of a `note` statement is outside `0`–`100`.

```
note 0 1 C-4~200
```

**Fix:** `note 0 1 C-4~80`, or `note 0 1 C-4` for full force.

### `give the velocity once: either on the note ("<x>") or as its own value ("<x>"), not both.`

Both ways of saying how hard a note is hit were written at once.

```
note 0 1 C-4~80 40      # the ~80 and the 40 say the same thing
```

**Fix:** keep one of them: `note 0 1 C-4~80` or `note 0 1 C-4 80`.

### `give the velocity once: "<x>" is the second one on this line.`

Two bare numbers where one would do.

```
note 0 1 C-4 80 40      # 40 says what 80 already said
```

**Fix:** `note 0 1 C-4 80`. The other value on the line is where the articulation
goes.

### `give the articulation once: "<x>" is the second one on this line. Write a slide and a stutter together as ">*3".`

A note can slide and it can stutter, but it has one articulation, written as one
value.

```
note 0 1 C-4 > >*3      # two articulations
note 0 1 C-4 > 40 *3    # a slide and a stutter apart
```

**Fix:** `note 0 1 C-4 >*3` for both at once, `note 0 1 C-4 >` for the slide
alone.

### `velocity must be a percentage 0..100, e.g. 40 for a soft note or 100 for a full one; got "<x>".`

A value where a force belongs is a number but not a percentage.

```
note 0 1 C-4 400
```

**Fix:** `note 0 1 C-4 80`. A note with no force written at all is played at full:
100.

### `chord takes three values: chord ROW TRACK CHORD — e.g. chord 0 1 Am, or chord 4 2 6 for the sixth chord of the song’s key.`

The `chord` statement is addressed like `note` but insists on the chord itself.

```
chord 0 1
```

**Fix:** `chord 0 1 Am` (by name) or `chord 0 1 6` (the sixth chord of the key).

### `"<x>" is not a chord. Name a root and a shape — Am, F#7, Bbdim, Cmaj7 — or a scale degree 1..7.`

The third value of a `chord` is neither a chord name nor a bare degree. This is
deliberate: a chord with the wrong quality still *sounds* like a chord, so the
wrong choice would never announce itself — the parser refuses rather than guesses.

```
chord 0 1 Hm        # H is not a root
chord 0 1 Dsus      # sus is not one of the eight shapes
chord 0 1 9         # a degree must be 1..7
```

**Fix:** name it (`Am`, `Bbdim`, `Cmaj7`) or give a degree `1`–`7`.

### `chord does not take "<x>": <what the gesture actually is>.`

A `chord` line ended with one of the gestures the roadmap names but this build
does not take as a chord modifier — `strum`, `roll`, `flam` or `fill`. The message
is deliberately not "is not a chord": the word IS the mistake, and each reply says
what the gesture actually is in the language that exists (a strum is `arp` on a
channel that holds, a roll is `*N` with `hold`, a flam is a soft hit on the step
before, a fill needs a range of steps the language has no clause for yet).

```
chord 0 1 Am strum
chord 0 1 Am flam
```

**Fix:** `chord 0 1 Am arp` (the one gesture a chord takes), or the line the reply
names.

### `arp takes a direction and how many steps, e.g. chord 0 1 Am arp up 8 — got <n> values after it.`

More than two values after `arp`. One of each is the whole grammar: a direction
(`up`, `down`, `updown`) and a step count, in either order.

```
chord 0 1 Am arp up 8 down
```

**Fix:** `chord 0 1 Am arp up 8`.

### `give the direction once: "<x>" is the second one on this line. The directions are up, down, updown.`

Two directions on one `arp`. `updown` is the word that means both, which is why
it exists.

```
chord 0 1 Am arp up down 4
```

**Fix:** `chord 0 1 Am arp updown 8`.

### `"<x>" is neither a direction nor a step count. An arp takes a direction (up, down, updown) and how many steps it fills (1..512), in either order — e.g. chord 0 1 Am arp up 8.`

A value after `arp` that is neither. The two are told apart by SHAPE rather than
by position — a word is a direction, a number is a count — which is what makes the
order free and what makes an unknown word land here instead of being read as an
empty direction.

```
chord 0 1 Am arp sideways 4
chord 0 1 Am arp up 900     # more steps than the longest pattern
```

**Fix:** `chord 0 1 Am arp up 8` — either order, e.g. `arp 8 up`.

### `give the step count once: "<x>" is the second one on this line — e.g. chord 0 1 Am arp up 8.`

Two step counts on one `arp`.

### `an arp of <n> steps from row <r> needs rows <r>..<last>, and the pattern has <rows>. Start it earlier, fill fewer steps, or give the pattern more rows with "steps N".`

An arpeggio that runs off the end of the pattern. Unlike a plain chord, which
occupies one step, an arp occupies as many steps as it fills — so the row it
starts on is a starting point rather than the whole extent.

```
steps 16
chord 12 1 Am arp up 8     # needs rows 12..19
```

**Fix:** start it at row 8 or earlier, ask for fewer steps (`arp up 4`), or give
the pattern more rows (`steps 32`).

### `chord "<x>" needs <n> channels starting at track <t>, but the song has <c>. Add tracks, start the chord on an earlier channel, or widen this one — "track <t> poly <n>" above this line keeps the whole chord in one cell.`

A chord spreads across the channels after its root — `Am` uses three and `Cmaj7`
uses four — and there were not enough left. It only spreads when the channel it
names is too narrow to SOUND the chord: `track 1 poly 3` puts the whole triad in
one cell instead, which is the other way out this message names.

```
tracks 2
chord 0 1 Am       # needs channels 1-3, the song has 2
```

**Fix:** add channels (`tracks 4`), start earlier (`chord 0 1 …`), widen the
channel (`track 1 poly 3`), or write a single `note`.

---

## The ARP page's dials

The `arp` statement stores the dials the ARP page draws, and commits the run they
describe. These are its own mistakes.

### `arp takes its dials or a write: "arp direction updown", "arp octaves 2 rate 2 gate 60", "arp mode source", "arp off", or "arp write ROW TRACK CHORD" (e.g. arp write 0 1 Am).`

A bare `arp` with nothing after it. The word has two roles — set a dial, or write a
run — and it needs to know which one you meant.

```
arp
```

**Fix:** `arp direction updown`, `arp octaves 2 rate 2 gate 60`, `arp mode chord`,
`arp write 0 1 Am`, or `arp off`.

### `arp off takes nothing after it: it clears the stored dials, so a song with none writes the file it always did.`

`arp off` clears the song's stored dials; trailing values have nothing to clear.

```
arp off chord
```

**Fix:** `arp off` alone.

### `arp write takes three values — ROW TRACK CHORD — e.g. arp write 0 1 Am. It writes a run from the dials above, the same notes "chord 0 1 Am arp up 8" writes.`

A `write` without a place and a chord to walk. `arp write` is addressed exactly
like `chord` — a row, a track, then the chord — but takes its walk from the stored
dials instead of the line.

```
arp write 0 1
```

**Fix:** `arp write 0 1 Am` (or `arp write 0 1 6` for the key's sixth chord).

### `"<x>" is not a chord. arp write needs a chord name (Am, F#7, Bbdim, Cmaj7) or a scale degree 1..7, e.g. arp write 0 1 Am.`

A `write` whose third value is neither a chord name nor a bare degree. A chord
with the wrong quality still sounds like a chord, so the parser refuses rather
than guesses — the same rule `chord` follows.

```
arp write 0 1 Hm
```

**Fix:** `arp write 0 1 Am`, or a degree `arp write 0 1 6`.

### `arp direction takes one word, e.g. arp direction updown. The directions are: up, down, updown.`

More than one word after `direction`.

```
arp direction up down
```

**Fix:** `arp direction updown`.

### `"<x>" is not an arp direction. The directions are: up, down, updown.`

A `direction` this build does not have. The word is refused rather than defaulted,
the same bargain `groove` and `tuning` make: a direction nobody knows is not a
taste with bad arithmetic.

```
arp direction sideways
```

**Fix:** `arp direction up` (or `down`, or `updown`; `asc`, `desc` and `both`
also read).

### `arp mode takes one word, either chord or source: chord walks the chord given on a write, source walks the song's loop.`

A `mode` with the wrong number of words.

```
arp mode
```

**Fix:** `arp mode chord` or `arp mode source`.

### `"<x>" is not an arp mode. The modes are: chord, source.`

A `mode` this build does not have — a closed list, refused by name.

```
arp mode arpeggio
```

**Fix:** `arp mode chord` or `arp mode source`.

### `arp hear takes "on" or "off", e.g. "arp hear on": whether the ARP page auditions the run as its dials move.`

An `arp hear` clause that is not `on` or `off`, or that carries extra words. The
switch is a SESSION setting — how you are listening to the song rather than the
song itself — so it is refused by name rather than defaulted.

```
arp hear loud
arp hear
```

**Fix:** `arp hear on` or `arp hear off`.

### `arp takes its numbers in pairs — octaves N, rate N, gate N — e.g. arp octaves 2 rate 2 gate 60.`

An odd number of tokens where dial/value pairs belong.

```
arp octaves 2 rate
```

**Fix:** `arp octaves 2 rate 2 gate 60`, or any subset in pairs.

### `"<x>" is not an arp dial. The dials are: direction, octaves, rate, gate, mode.`

A pair whose first word is not one of the three number dials. The two WORD dials
have their own clauses (`arp direction …`, `arp mode …`).

```
arp speed 2
```

**Fix:** `arp rate 2`.

### `arp <dial> is a whole number; got "<x>".`

A dial given something that is not a whole number.

```
arp octaves two
arp rate 1.5
```

**Fix:** `arp octaves 2 rate 2`.

## The loop, and the lines that follow it

A `progression` is the chord loop a song hangs on, and the two follower lines play
it. All of the messages below are about those three words, because they are the
only part of the language where one line defines something another line LATER
depends on: a definition is refused for being empty, and a follower for having
nothing above it to read.

### `there is nothing to follow: this song has no progression yet. Write one above this line — "progression Am F C G" — or hang the channel on a loop the song already has.`

A follower line — `chord 0 1 follow` or `note 4 3 follow` — plays the song's
PROGRESSION, and this song has none: no `progression` line above it, and none in
the song the script is being appended to.

**Fix:** write the loop above the line, or hang the channel on one the song already
has. A progression is a definition, so it has to come first.

### `following the progression writes <n> notes at a time (<chord>), and channel <t> sounds <poly>. Widen it — "track <t> poly <n>" — or follow with the roots instead: note ROW <t> follow.`

`chord ROW TRACK follow` writes each chord of the loop into ONE cell, so the
channel has to hold the WIDEST chord in the loop: three notes for a triad, four for
a seventh. This channel is narrower, and the message names the chord that did not
fit.

```
tracks 2
progression Am F C G
chord 0 2 follow     # Am needs 3 notes, channel 2 sounds 1
```

**Fix:** widen the channel with `poly` above the line (`track 2 poly 3`), or use
the other follower — `note ROW TRACK follow` writes one root at a time and needs
one note per cell.

### `progression needs at least one chord, e.g. progression Am F C G (or in the song's key: progression 1 6 3 7), optionally followed by "hold N" for how many steps each chord lasts.`

A `progression` line with nothing after the word. There is no default loop: an
empty progression is not a loop that plays nothing, it is a line that forgot to say
anything.

**Fix:** name at least one chord, by name (`progression Am`) or by degree
(`progression 1 6 3 7`).

### `progression none takes nothing else — it clears the loop, so the rest of this line (<words>) would be lost.`

`progression none` forgets the loop. Anything after `none` would be thrown away
with it, so the line is refused rather than silently truncated.

**Fix:** `progression none` on its own — and a separate `progression Am F C G`
line, if a new loop was meant too.

### `"hold" needs a number of steps 1..64 — how long each chord lasts — e.g. progression Am F C G hold 8. The default is 4, one beat.`

The `hold` clause was written without a usable number: `hold`, `hold eight`, or a
number outside the range. A chord lasts 1–64 STEPS, and the default is one beat
(four steps at the default grid).

```
progression Am F C G hold
progression Am F C G hold 900
```

**Fix:** `hold 4`, `hold 8`, `hold 16` — or leave the clause off for one beat a
chord.

### `give the hold once and last: "<word>" comes after it.`

`progression Am hold 8 F` — the clause takes one number and ENDS the line, so a
chord written after it would be a chord with nowhere to go.

**Fix:** write every chord BEFORE `hold`, or split the line in two.

### `a progression holds at most <n> chords; this one has <k>.`

Sixteen chords is four bars of one chord per beat at the default grid, and it is
the point where what is really wanted is two sections with two loops.

**Fix:** keep the sixteen that matter, or write the extra changes as `chord` lines.

### `"<x>" is not a chord. Each step is a chord name (Am, F#7, Bbdim, Cmaj7, m (minor), dim, aug, 7, maj7, m7, dim7, m7b5, 5 (power), sus2, sus4, 6, add9 or 9) or a scale degree 1..7 — e.g. progression Am F C G.`

A step names a chord exactly the way `chord` names one — a root and a shape — or a
scale degree `1`–`7`, and this word is neither. The list of shapes in the message
is the parser's own chord vocabulary, so the two can never disagree.

```
progression Am H7 C G     # H is not a root
```

**Fix:** one of the names above, or the number of the chord in the song's key.

### `progression steps are single words: write "<joined>" rather than "<a> <b>".`

The one misspelling worth naming: `C maj7` — a chord the parser knows, followed by
a word that is nothing. The message joins the two words and shows the spelling that
would have worked, which is friendlier than listing the shapes again.

**Fix:** close the gap — `Cmaj7`. A progression step is ONE token, because the loop
is read as a list of chords.

### `a follower has no arp: chord <r> <t> follow already writes one chord per chord of the loop, each held for its own length.`

`chord 0 1 follow arp` — two gestures in one slot. The loop already says how long
each chord lasts, so an arpeggio would be a second answer to the same question.

**Fix:** `chord 0 1 follow` for the loop's chords, or a by-hand arpeggio on its own
line: `chord 0 1 Am arp up 8`.

### `note ROW TRACK follow takes nothing after it: the notes it writes are the progression's own roots.`

`note 0 4 follow 40` — a follower writes the loop's own roots, one per chord, so
there is no pitch, no velocity and no gesture for it to take.

**Fix:** `note 0 4 follow` on its own.

---

## What an export covers

One statement sets TWO session settings, because they are the same decision made
twice. **The loop region** — `export bars 8 to 15` renders those bars, `export all`
puts the whole song back — answers *which bars* leave the app. **The loudness
target** — `export loud -14` normalises the audio to that many LUFS, `export loud
off` hands the level back to the master fader — answers *how loud* they arrive.
Neither is song data, so nothing here changes the song; what changes is what the
next `EXPORT AUDIO`, `EXPORT STEMS` or `EXPORT MIDI` writes. The two clauses may
be given in either order and at most once each, and a clause a line does not
mention is left exactly as it was.

### `export needs something to set, e.g. export bars 8 to 15, export all, or export loud -14.`

A line that says only `export`. The statement exists to set one of the two
settings above, and a bare `export` names neither.

**Fix:** a region, a target, or both — `export bars 8 to 15`, `export loud -14`,
`export bars 8 to 15 loud -14`.

### `export takes nothing else after that; got "<x>".`

A token the two clauses did not take: `export all house`, `export 8 to 15`,
`export bars 8 to 15 extra`, `export bars 1 to 2 bars 3 to 4` (a region twice),
`export loud -14 loud -9`. The words are fixed — `all`; or `bars`, the first bar,
`to`, the last bar; or `loud` and a number. `bars A to B` is the same clause an
`automate` line uses, so there is one way to say a range in this language and not
two.

**Fix:** one region and one target at most — `export bars 8 to 15 loud -14`.

### `export bars needs two whole bar numbers, e.g. export bars 8 to 15; got "<x>".`

The `bars` clause is incomplete, out of order, or not made of numbers:
`export bars 8`, `export bars 8 from 15`, `export bars eight to 15`,
`export bars 1 to 2.5`. Bars are whole numbers 1..512.

**Fix:** two numbers with the word between them — `export bars 8 to 15`.

### `export loud needs a target in dB, e.g. export loud -14 - or export loud off.`

The `loud` clause has nothing to read after it, or something that is not a
number: `export loud`, `export loud louder`.

**Fix:** a number in LUFS — `export loud -14` — or the one word the clause takes
besides a number, `export loud off`.

### `export loud <n> is outside <a> to <b> LUFS.`

A target off the end of the scale: `export loud 14` (a positive target is not a
loudness — it is a mistake), `export loud -60` (a gain that would need a limiter
nobody asked for). The range is -40 to -5 LUFS, and -14 — what the streaming
services normalise to — sits inside it.

**Fix:** a target in the range. Turning normalising OFF is `export loud off`,
not `export loud 0`.

### `bars are counted from 1, so export bars <a> to <b> starts before the song.`

Bar 0 does not exist: the song's first bar is bar 1, exactly as the `F3` list
numbers it. A range that begins at 0 begins before anything is playing.

**Fix:** count from 1. The first bar of the song is `export bars 1 to 8`.

### `export bars <a> to <b> counts backwards - write the first bar before the last.`

`export bars 15 to 8` — the two ends are the right way round in the message so the
fix is the same line with its numbers swapped, which is friendlier than silently
reordering it: a range that reads backwards is usually a typo about which end is
which, and a silent repair would bounce bars 8 to 15 for somebody who meant
something else entirely.

**Fix:** write the earlier bar first: `export bars 8 to 15`.

### `the export range reaches bar <n>, but the song is only <k> bars long, so the export covers the bars it has.`

An **advisory**, printed under the summary rather than refused: `export bars 8 to
15` in a song whose order is four bars long. It cannot be an error at the point it
is written — a script may name its region ABOVE the `arrange` line that makes the
order long enough to hold it — so the region is fitted to the order when it is
used, and this says which bars that turned out to be. Nothing is wrong; the export
is simply smaller than the line asked for.

**Fix:** nothing, if four bars is what you wanted. Otherwise make the order
longer (`arrange`, `order`, or `ADD BAR` in `F3`), or name the bars that exist.

---

## The advisories

Not mistakes, and never a refusal: these are printed **under the summary after a
script applies**. They are the app noticing something an author usually wants to
know — checked in this order, and at most six are shown — and nothing has to be
fixed. Each one is a word away from being untrue.

### `the song has no notes yet.`

The script applied and every step of every channel is empty. Usually a script
that set a song up and then forgot its grid rows: the rows are the only lines that
write notes, and a line of `.` writes none.

**Fix:** write some grid rows, or a `note`/`chord` line. Check that `pattern N`
comes before the rows you meant, and that `tracks` is large enough for them.

### `pattern <n> is empty.`

The pattern is in the song and has no notes in it, so every bar of the order that
plays it is a bar of silence.

**Fix:** write rows after `pattern <n>`, copy another pattern into it
(`copy 1 <n>`), or take it out of the `order`.

### `track <n> "<name>" has no notes.`

The channel is not muted and has no notes anywhere in the song, so it costs a
voice and makes no sound. This is the commonest thing a summary catches: a channel
that was planned and then never written.

**Fix:** write notes for it, `mute <n>` it until they exist, or use fewer
channels (`tracks N`).

### `track <n> "<name>" stacks <layers> layers all at full gain, so it is much louder than one - turn one down, e.g. "layer <n> 3 gain 40".`

Three or more layers, every one of them at full gain. Layers ADD UP rather than
blend in, so this channel is several decibels louder than a single-layer one, and
it is the usual reason a stacked song leans on the limiter.

**Fix:** it is a decision rather than an error — but turn one layer down
(`layer <n> 3 gain 40`) unless you meant it, and check where the song sits with
`F5` or `volume`.

### `track <n> "<name>" adds up past full scale at this level and stack - it may clip; turn the fader down, e.g. "track <n> level 70".`

A channel's mix fader and its layers MULTIPLY, and each is a percentage of full
scale, so a fader at 100 over a stack whose gains add past 100 asks for more
amplitude than a channel has. This is the same problem as the all-at-full-gain
observation above, said more generally — the two never both fire — so it catches
the shapes that one cannot: two layers at full, three with one turned down, or any
of those under a group whose own fader is up.

**Fix:** it is a decision rather than an error — but turn the channel down
(`track <n> level 70`), turn a layer down (`layer <n> 3 gain 40`), or lower the
group it sits on (`bus DRUMS 70`).

### `the song defines sections but its order is not an arrangement of them - one "arrange ..." line writes the form.`

The song names its bars (`section …`) and plays a plain `order`, so the names exist
and are not being used. Usually a script that wrote its sections and never reached
its `arrange`, or a song whose order was edited by hand in `F3` — which forgets the
arrangement on purpose, because a label that no longer matches the bars is worse
than none.

**Fix:** write the form in one line — `arrange VERSE CHORUS VERSE` — and each bar
of `F3` wears the section that put it there again.

### `section "<name>" is defined but the arrangement never plays it.`

The section is defined and the arrangement does not name it, so none of its bars
are in the song. A part saved for later, or a chorus written twice by mistake.

**Fix:** add the name to an `arrange` line where you want it to play, or leave it
— an unplayed section costs nothing and is there when you want it.

---

## The three rules behind almost every error

1. **Rows count from 0. Tracks count from 1.** If a diagnostic is about a number,
   check which one you are giving.
2. **Lines take effect in order.** If a line is rejected for something that
   "obviously exists", it probably comes *after* the statement that would have
   created it. Move `tracks`, `track`, `steps` and `pattern` earlier.
3. **The grid is only as long as `steps` says.** Sixteen rows by default. A
   script that writes a 32-step melody needs `steps 32` above it, and the same
   number is the ceiling for `note` / `erase` rows.

### `sample load needs a path, e.g. sample load "samples/break.wav".`

A bare `sample load` with nothing after it. `sample` is the one word with two
statements under it: `load` fetches a file from a path the app can reach, and
`import` opens the browser's file dialog.

```
sample load
```

**Fix:** `sample load "samples/break.wav"` — quoted or not, since the path is
joined back into one string either way. Leave off the leading slash to mean
"beside the page", which is what a file in the app's own folder is.

### `sample needs "load" or "import", e.g. sample load "samples/break.wav". To give a CHANNEL one, write it on its track line: track 2 "HOOK" sample BRK. It got "<x>".`

The word after `sample` is neither `load` nor `import` — usually because the line
was meant to be a `track` line, which is the other half of the same idea.

```
sample BRK02
track 2 "HOOK" sample BRK02      # what was meant
```

**Fix:** `sample load "…"` or `sample import` to bring a recording in, and
`sample NAME` on a track line to give one to a channel. Nothing between them is
song data: the song names the sound, the app holds it.

### `sample needs a name: <why>. Or "sample <none>" to leave the one this channel is on.`

The `sample` setting on a `track` line has a value that cannot be a name: a name
is one word starting with a letter, up to 16 characters of letters, digits `-`
and `_`. A space ENDS the value, so `sample my break` is read before this message
can be about it — this is for the shapes a single token can still take.

### `pad sample needs a name: <why>. Or "sample <none>" to leave the one this pad is on.`

The `sample` setting on a `pad` line has a value that cannot be a name, for the
same reason and under the same rules a channel's has: one word, starting with a
letter, up to 16 characters of letters, digits `-` and `_`. A pad names a
recording of your own exactly as a channel does, and a name the app has not
loaded is the fallback — the pad plays its built-in one-shot — rather than this.

```
track 2 "HOOK" sample 02-brk
track 2 "HOOK" sample "my break"
```

**Fix:** one word: `track 2 "HOOK" sample BRK02`. `sample none` takes the
reference back off, which is the same as not writing it.

### `sample needs the name of a recording YOU have loaded, e.g. "sample BRK02" (or "sample <none>" to leave the one this channel is on). Import a .wav under F2 first; a channel on "wave sample" plays it, and falls back to the built-in one-shot when the app does not have that name. The name is ONE word. To name a channel SAMPLE, quote it: track <N> "SAMPLE" wave sine.`

A bare `sample` was left with nothing after it, or was sitting where the channel's
NAME should be — the same shape of mistake as a bare `wave` or `shape`.

```
track 2 "HOOK" sample
track 2 SAMPLE wave sine
```

**Fix:** `track 2 "HOOK" sample BRK02` (a setting), or `track 2 "SAMPLE" wave sine`
(a name). Note what this message does NOT do: it does not check the name against
the bank. The bank is the app's and the name is the song's, so a song naming a
recording this machine does not have plays the built-in one-shot — see §9 of
`09-song-files.md`.

## The recorder and its takes

`record` captures a take and shapes the window it plays through. A take is **app
state**, never song data, so a name the takes do not have is NOT an error — it is
reported in a status line, not refused here. These are the refusals that are about
the SHAPE of the line.

### `record needs a take name to capture, e.g. record HOOK. To shape a take you have, write record trim HOOK 0.1 2.0 or record loop HOOK 1.0 3.0. A take is app state and never part of the song.`

A bare `record` with nothing after it. `record` is a word with four statements
under it: a capture, `trim`, `loop` and `select`.

```
record
```

**Fix:** name the take — `record HOOK` — or shape one you already have:
`record trim HOOK 0.1 2.0`.

### `record trim needs a take name and two times in seconds, e.g. record trim HOOK 0.2 4.8.`

`record trim` (or `record loop`) was given the wrong number of values. It takes
exactly a name and two times.

```
record trim HOOK
record loop HOOK 1.0
```

**Fix:** `record trim HOOK 0.2 4.8` — a name, then the start and the end in
seconds from the take's own start.

### `record trim names a take: <why>.`

`record trim` (or `record loop`) has a value that cannot be a take name: a name is
one word starting with a letter, up to 16 characters of letters, digits `-` and
`_`, the same rule a sample name follows.

```
record trim 02-brk 0.1 2.0
```

**Fix:** a name that starts with a letter — `record trim BRK02 0.1 2.0`.

### `record trim takes two times in seconds from the take's own start, 0..30, e.g. record trim HOOK 0.2 4.8; got "<x>" and "<y>".`

The two times after a name are not both numbers in `0..30` seconds. A take is a
few seconds long — the bank holds recordings up to 30 seconds — so a time outside
that is not a window.

```
record trim HOOK 0.1
record trim HOOK -1 2
record loop HOOK start 3.0
```

**Fix:** two numbers in seconds, either order — `record trim HOOK 0.1 2.0`.

### `record select needs a take name, e.g. record select HOOK - which take the RECORDER page shows.`

`record select` was given no name (or more than one value).

```
record select
```

**Fix:** `record select HOOK` — the take the RECORDER page shows next.

### `record select names a take: <why>.`

`record select` has a value that cannot be a take name, under the same rule every
take name follows: one word, starting with a letter, up to 16 characters of
letters, digits `-` and `_`.

```
record select 2nd-take
```

**Fix:** a name that starts with a letter — `record select TAKE2`.

### `record takes one take name to capture, e.g. record HOOK; got <n>. To shape a take you have, write record trim NAME 0.1 2.0 or record loop NAME 1.0 3.0.`

A capture line was given more than one value. One `record NAME` captures one take.

```
record HOOK TAKE2
```

**Fix:** `record HOOK`, one name. To shape a take, use `record trim` or
`record loop`.

### `record names a take: <why>.`

A capture line's name cannot be a take name: one word, starting with a letter, up
to 16 characters of letters, digits `-` and `_`.

```
record 02brk
```

**Fix:** `record BRK02`.

## The drum machine

`machine` sets up the song-level drum machine and `pad` writes one of its lanes —
see §3 of `03-script-reference.md`. The refusals are about the SHAPE of a line,
because the values are the same percentages and closed lists as everywhere else.

### `machine takes its settings in pairs - level 80, pan 20, swing 50, steps 16, beat 4, pads 6, bars 3, pattern 2, bus DRUMS, verb 40, echo 20, duck 30, an effect like drive 40, a bare "on"/"off", or "order 1 1 2 1".`

An odd number of tokens after `machine`: one of the settings was left without a
value, or a stray word was written on its own.

**Fix:** write each setting as a `word value` pair, in any order.

### `machine steps is a whole number <…>..<…> of steps in one bar; got "<…>". 16 is one bar of sixteenths.`

`machine steps` was given something that is not a whole number in `1..64`.

**Fix:** `machine steps 32` for a two-bar machine, or leave it out for 16.

### `machine pads is a whole number 1..<…> (a machine holds at most <…> pads); got "<…>". Growing fills in kit pads, and shrinking drops the last ones.`

`machine pads N` was given something that is not a whole number of pads. This is
what `+ ADD PAD` and `DEL PAD` change: growing fills in kit pads, and shrinking
drops the last ones and takes their rows off every bar.

**Fix:** `machine pads 6` for a six-pad kit, or leave it out for four.

### `machine bars is a whole number 1..<…> (a machine holds at most <…> bars); got "<…>". Growing copies the last bar, and shrinking drops the last ones.`

`machine bars N` was given something that is not a whole number of bars. This is
what `+ BAR` and `- BAR` change: growing COPIES the last bar (a variation, not a
blank), and shrinking drops from the end.

**Fix:** `machine bars 3` for a three-bar machine. Bar 1 is the machine and never
goes.

### `machine beat is a whole number <…>..<…> of steps in one beat; got "<…>".`

`machine beat` was given something that is not a whole number in `1..16`.

**Fix:** `machine beat 4` — the same four-to-the-beat the song uses.

### `machine pan must be a place between the speakers <…>..<…>: "pan -40", "pan L40" or "pan C". Got "<…>".`

`machine pan` was given something that is not a place left to right.

**Fix:** `machine pan -30`, `machine pan R30` or `machine pan C`.

### `machine <key> is a send, a percentage <…>..<…>; got "<…>". <…> sends all of the machine in, <…> keeps it dry.`

The `verb`/`echo` amount on a `machine` line is a send, and it was out of range.

**Fix:** a percentage `0..100`; `100` is the default and `0` keeps the machine dry.

### `machine joins a bus the song does not have: "<wanted>" — <have>. Declare it above: "bus DRUMS 70" then "machine bus DRUMS".`

`machine bus NAME` named a group the song has not declared. A bus is defined
ABOVE the line that joins it.

**Fix:** write `bus DRUMS 70` above, or drop the clause.

### `machine pattern is a bar number 1..<…>; got "<…>". The pads BELOW it write into that bar.`

`machine pattern N` was given something that is not a whole bar number.

**Fix:** `machine pattern 2` selects the second bar; the `pad` lines below it write
into that bar.

### `machine order takes a list of bar numbers 1..<…>, e.g. "machine order 1 1 2 1" - which bar of the machine plays in each bar of the song.`

`machine order` was given no bar numbers, or one outside the range.

**Fix:** a list of bar numbers, e.g. `machine order 1 1 2 1`. Its length is its own
loop: a four-bar order plays over four bars of the song.

### `machine does not take "<word>". It takes level, pan, swing, steps, beat, pads, bars, pattern, bus, verb, echo, duck, an effect (drive, crush, cab, tape, radio, vinyl, chorus, punch, tilt, gate), a bare "on"/"off", or "order 1 1 2 1".`

A word on a `machine` line that is not one of its settings.

**Fix:** use one of the settings listed, or the machine's own `pad` lines for a
pad's sound.

### `pad number must be 1..<max> (a machine has at most <max> pads); got "<x>".`

`pad N` named a lane outside `1..8`.

**Fix:** `pad 1` through `pad 8`.

### `pad pan must be a place between the speakers <…>..<…>: "pan -40", "pan L40" or "pan C". Got "<…>".`

`pad pan` was given something that is not a place left to right.

**Fix:** `pad 3 HAT pan R20`, or leave the pad centred.

### `pad level is a percentage <…>..<…>; got "<…>".`

`pad level` was out of range.

**Fix:** a percentage `0..100`; `100` is full and the default.

### `pad tune is a whole number of semitones <…>..<…>; got "<…>".`

`pad tune` was out of range.

**Fix:** a whole number of semitones `-24..24`, e.g. `pad 5 TOM tune -2`.

### `a pad name may be at most <n> characters; "<x>" is <n>.`

A pad's name was longer than sixteen characters.

**Fix:** shorten it, or use fewer words.

### `pad "<n>" has a <n>-step pattern but the machine has <n>. Write at most <n> characters, or widen the machine first: "machine steps <n>".`

A `pad … pattern "…"` string was longer than the machine's `steps`.

**Fix:** widen the machine with `machine steps N` above the pad, or write a
shorter pattern — the tail of a shorter one is rests.

### `pad "<n>": "<x>" is not a hit. A pad pattern is "." for a rest and 1-9 for how hard the hit lands, e.g. "9...9...9...9...".`

A character in a pad pattern was neither `.` nor a digit `1`–`9`.

**Fix:** `.` for a rest, `1`–`9` for how hard the hit lands.

## Non-parser messages the app may show

These come from the app, not the language. They are behaviour guidance, not
mistakes in a script:

| Message | Meaning |
| --- | --- |
| `SCRIPT APPLIED  n TRACKS  n NOTES` | Success; the song was replaced. |
| `NOTHING TO UNDO` / `NOTHING TO REDO` | The history is empty in that direction. |
| `ADD A NOTE FIRST` | PLAY was pressed on a pattern with no notes. |
| `FIRST PATTERN` | You tried to step before the first pattern. |
| `MAX 8 TRACKS` | The channel list is full. |
| `ONE TRACK IS THE MINIMUM` | The last channel cannot be removed. |
| `ALREADY EMPTY` | `CLEAR PATTERN` on a pattern with no notes. |
| `SCRIPT` panel, `APPLY` greyed out | The script has an error, or the box is empty. |
| `COULD NOT LOAD  <file>` | A `.sf2` that is not a soundfont, is truncated, or holds no playable presets. The font you already had stays loaded. |
| `COULD NOT OPEN  <file>` | A `.mid`, script or song file that is not what it claims to be. The song is untouched. |
| `LOADED  NAME · 0.42s · 44.1kHz` | A `.wav` joined the sample bank. The status line under it says which `sample` line to write. |
| `COULD NOT LOAD  <file>` (a sample) | The file is not a WAV this app reads — compressed, 12-bit, or not a WAV at all. The bank and the song are untouched. |
| `SAVED  <channel>.patch.json` | One channel's sound was written out. The two lines under it say what is IN the patch, and that the level, the pan and the group deliberately are not. |
| `COULD NOT READ  <file>` (a patch) | The file is not a patch, and it says why: a song file is named as a song (`its "format" is "tracklet-song"`), a file from a newer build says so, and a value the reader will not guess at gets its own sentence. A patch whose numbers are merely out of RANGE is not an error at all — it is clamped and loads. The channel is untouched either way. |
| `LOADED  <name>  ONTO CHANNEL <n>  <CHANNEL>` | A patch's sound arrived on a channel, as ONE `Ctrl+Z`. Nothing about the mix moved. |

The `APPLY` button is **disabled while anything is wrong** and enabled the moment
the whole script parses. If `APPLY` will not light up, the verdict area below the
paste box names the line.
