# 02 — A music primer for writing tracklets

Everything here is the *usable* subset: the parts that change whether a pattern
sounds like a mistake or like music. No notation, no history.

## 1. Pitch: the numbers

Tracklet names notes the tracker way — a letter, an optional `#` (sharp) or `b`
(flat), then the octave. A dash is a separator and is optional:

```
C-4   C4   c-4      the same note (case does not matter)
C#4   Db4           the black key above C-4 (both are spelled validly)
A-4   A4            A above middle C
```

Octave numbers follow scientific pitch: **MIDI 60 is middle C, written `C-4`**.
Every octave is twelve notes:

```
octave 3   C-3 C#3 D-3 D#3 E-3 F-3 F#3 G-3 G#3 A-3 A#3 B-3
octave 4   C-4 C#4 D-4 D#4 E-4 F-4 F#4 G-4 G#4 A-4 A#4 B-4
```

The full name→MIDI mapping, which is what the app actually stores:

| Note | MIDI | | Note | MIDI | | Note | MIDI |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `C-0` | 12 | | `C-3` | 48 | | `C-6` | 84 |
| `C-1` | 24 | | `C-4` | 60 | | `C-7` | 96 |
| `C-2` | 36 | | `C-5` | 72 | | `C-8` | 108 |

Formula: `midi = (octave + 1) × 12 + semitone`, where `C=0, C#=1, D=2, D#=3,
E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11`.

**Usable range:** `C-0` (MIDI 12) to `B-8` (MIDI 119). Anything outside is
rejected by the parser, which is a kindness — a note you cannot hear is a bug.

**Where things live.** These registers are worth internalising, because "it
sounds wrong" is usually "it is in the wrong octave":

| Octave | Role |
| --- | --- |
| 0–1 | Sub bass; felt more than heard on laptop speakers. A kick drum thump. |
| 2 | Bass. The root of your harmony. |
| 3 | Bass and low chords; cello-ish. |
| 4 | The middle. Chords, arpeggios, melody that sits under a voice. |
| 5 | Lead melody. The most comfortable register to hum. |
| 6 | Bright lead, and short percussion clicks. |
| 7–8 | Very sharp; use for ticks and accents, not sustained melody. |

## 2. Rhythm: the grid

A pattern is **16 steps by default**, and **4 steps = 1 beat**. So:

```
step  00 01 02 03 | 04 05 06 07 | 08 09 10 11 | 12 13 14 15
beat  1     .     | 2     .     | 3     .     | 4     .
```

That is one bar of 4/4. The grid can be longer — `steps 32`, `steps 64`, up to
`steps 512` — and every extra sixteen steps is another bar at the same
resolution:

```
steps 16    1 bar       steps 64    4 bars
steps 32    2 bars      steps 128   8 bars      steps 512   32 bars
```

Neither the tempo nor the meaning of a step changes when the grid grows; only
how much music fits in one pattern. Longer patterns are for melodies and
counter-lines that need more than a bar to say their piece. Two rules that keep
them readable:

- **Keep the bar structure visible.** Land your chords and bass on steps 0, 4,
  8, 12 of *every* bar, not just the first.
- **Change something between bars.** On a 64-step grid, a bar that repeats
  verbatim four times is not a 4-bar phrase, it is a 1-bar phrase with padding.

The other knob is `beat`: how many steps make one beat, so it decides how many
steps a bar is. The default `beat 4` gives the one-bar-per-16-steps grid above.

| `beat` | Steps per beat | Steps in a 4/4 bar | A 16-step pattern is… |
| --- | --- | --- | --- |
| `2` | 2 (eighth notes) | 8 | two bars |
| `4` (default) | 4 (sixteenth notes) | 16 | one bar |
| `8` | 8 (thirty-second notes) | 32 | half a bar |
| `16` | 16 | 64 | a quarter of a bar |

Raising `beat` makes each step shorter and therefore the whole pattern faster,
without changing the tempo: a beat is always `60 / bpm` seconds. So `beat 8` is a
way to fit twice as much detail in the same time. Change `beat` only if you have
a reason — you can always use more steps instead.

- **Downbeat** — steps 0, 4, 8, 12. The strongest place for a bass or kick.
- **Backbeat** — steps 4 and 12. Where a snare/clap lands in most pop music.
- **Offbeat** — steps 2, 6, 10, 14. Where "and" falls; hats and skanks live here.
- **Sixteenths** — every step. Fills and hi-hats.

Tempo guidance:

| BPM | Feel | Typical use |
| --- | --- | --- |
| 70–90 | Slow | Ballads, hip-hop, ambience |
| 100–120 | Mid | Pop, rock |
| 125–135 | Four-to-the-floor | House, disco |
| 140–175 | Fast | Drum & bass, hardcore |

A step lasts `60 / (bpm × beat)` seconds. At 128 BPM with the default `beat 4`
that is 0.117 s, and a 16-step loop is 1.875 s. At the default resolution **one
bar of 4/4 is one pattern of 16 steps**; a `steps 64` pattern is four bars.

### Rhythm and feel: swing and groove

A grid is mechanical, and mechanical is what makes programmed music sound
programmed. Every drum machine and every tracker has the same fix, and it is one
number: **swing**. Drag the `SWING` slider in the transport and every SECOND step
of each pair moves a little later, so the beat stops being even and starts to
lilt:

```text
straight    |....|....|....|....|      even, even, even, even
swung       |......|..|......|..|      LONG-short, LONG-short
```

At `swing 0` (the readout says `STRAIGHT`) nothing moves. At `60` you have the
shuffle most drum machines mean by the word. At `100` the pair lasts two thirds
and one third — a triplet feel, the deepest lilt the app offers.

Two things follow from how it is built, and both are the reason it is safe to
reach for:

- **The tempo does not change.** The first step of a pair grows by exactly what
  the second shrinks by, so a bar is the same length whether or not it swings.
  You are moving notes, not slowing the song down.
- **It applies to the whole song**, like `tempo`. Swing is what a player does
  with a bar; a band that swung only its hats would just be a band with a
  problem.

What to swing: hats, shakers, a bassline, a plucked lead — anything with a
repeated short note. What not to swing: a pad or a held chord, because a note
that lasts a bar cannot lilt.

Swing is the half of a feel that fits in one number. The other half is where the
weight is, and that is the **`GROOVE` button** beside `KEY` in the transport —
seven named feels, one press apart:

| Feel | What it does | Sounds like |
| --- | --- | --- |
| `STRAIGHT` | nothing at all | the default, and most music |
| `BACKBEAT` | beats 2 and 4 firm, the rest softer | rock, pop, soul |
| `OFFBEAT` | the notes between the beats firm | reggae, ska, house |
| `SHUFFLE` | the offbeat eighths late and soft | blues, boogie |
| `LAID BACK` | everything a hair behind the beat | soul, anything unhurried |
| `PUSHED` | everything a hair ahead | punk, new wave |
| `HUMAN` | every note a hair off, each its own way | a part that sounds played |

The two compose, so `swing 40` with `groove backbeat` is a lilting backbeat —
which is most of what a drummer does in a bar. And the reason any feel is safe to
press on a finished song: **no feel can move a note past the one after it, and
none can make a note louder than you wrote it.** An accent in a groove is the
notes that keep their velocity while the others give way, so turning a feel on can
shift the emphasis of a bar but can never rewrite it.

A song can also change its actual speed, not just its feel. The `TEMPO` control
in the transport sets one number for the whole song, and a script can add a few
**changes** on top of it: `tempo 160 at 5` makes the tempo 160 from bar 5 on,
and `tempo 90 by 9` leans evenly down to 90 as bar 9 arrives. They are the two
ways people actually mean it out loud — "the chorus is faster" and "slow down
into the ending" — and a song with no changes is one tempo from the first bar to
the last, exactly as it always was. Changes are counted in BARS (the same slots
`order` uses), and there can be one per bar.

### How long a note lasts, what it sounds like, and how loud it is

Four different questions, and Tracklet keeps them apart on purpose:

- **How LONG** a note lasts is the channel's `hold`: one step by default, up to
  sixteen. `track 3 "PAD" hold 8` makes every note on channel 3 ring for half a
  bar, so one written chord breathes instead of clicking. Left at 1, a note
  sounds for **90% of its step** and decays — which is exactly what a melody or a
  drum wants.
- **What it SOUNDS like** is the channel's voice. Press **F4**, pick an
  instrument, and the channel IS that instrument.
- **How LOUD it sits** is the channel's level: **F5**, and every channel has a bar
  you can click plus a `MUTE` and a `SOLO` box. See "Balancing", below.
- **How HARD one note is hit** is that note's **velocity**, written `C-4~40` in a
  grid row: softer than the notes around it. This is the one of the four that can
  differ from note to note rather than belonging to the whole channel — a level
  is where a channel sits, but a velocity is the force of a single hit.

Two more belong to the channel and are about how a line is PLAYED rather than
what any one note is:

- **`glide`** slides each note up or down into pitch from the one before it — the
  scoop of a singer or a fretless bass. A little (`glide 15`) on a bass or a lead
  is the difference between a line that sounds played and one that sounds typed.
- **`vibrato`** makes a held note wobble, which is what a wind player or a singer
  does without thinking. It fades in over the note, so a long pad starts clean and
  ends alive. Leave both off and every note starts exactly in tune, which is how
  every song in the app played before they existed.

The familiar jobs, each now one word:

- **kick** — `voice kick`, one low note on the downbeat, nothing else there — or
  the word `kick` in a grid cell, which is the same sound on a channel that can
  play the whole kit.
- **hi-hat** — `voice hat` and a high note (`C-6`) on the offbeats, or `hat` in a
  cell.
- **pad** — `voice pad` with `hold 8`, so a written chord rings.
- **bass** — `voice bass` on the roots, octaves 1–3.

A drum hit can also be written as its own word — `kick`, `snare`, `hat`, `wind` —
so ONE channel can be the whole kit instead of three channels that happen to play
at once, and `kit 808` / `kit brush` / `kit rock` says what those four drums sound
like. See [`03`](03-script-reference.md) for the words and
[`04`](04-cookbook.md) recipe 21 for a beat written that way.

Staccato is free; legato needs `hold`, or a voice that rings on its own.

**Accents are what make a groove.** A hat on every offbeat at the same level is a
metronome; the same hat with `C-6~100` on the beat and `C-6~40` between is a
pattern. The same goes for a bass line that pushes on one note, or a melody whose
high note is the loudest thing in the bar. Write `~40` or `~70` on the notes that
should sit back, and leave the ones you want to hear at full force.

## 3. Harmony: scales

A scale is the set of notes that will not sound wrong together. Learn three and
you can write anything in this app.

**C major** — happy, plain, the white keys.
```
C  D  E  F  G  A  B
```
In intervals from the root: `0 2 4 5 7 9 11` semitones.

**A natural minor** — sad, serious, the same white keys starting on A.
```
A  B  C  D  E  F  G
```
Intervals: `0 2 3 5 7 8 10`.

**A minor pentatonic** — five notes, almost impossible to make ugly. The safest
choice for an automatically generated melody.
```
A  C  D  E  G
```
Intervals: `0 3 5 7 10`.

Transposing a scale means adding the same number of semitones to every note. In
Tracklet you just write different names — there is no transpose operator except
`copy` (which copies a pattern whole).

### Tell the app your key, and stop counting semitones

You do not have to hold any of this in your head. Say the key once — by hand in
the **KEY** control in the transport, or in a script:

```script
new
song "IN THE KEY OF D MINOR"
key D minor              # the seven notes the piano will light up
tempo 90
tracks 1
pattern 1
D-4
F-4
A-4
D-5                      # a D minor arpeggio, all four notes in key
```

The app then shows you the scale on the piano: the seven notes that belong are
drawn normally, everything else is dimmed, and the tonic (the note the key is
named after) is marked. You do not need to know what a D is to use it — press the
bright keys and the notes will agree with each other.

Eight scales are built in: **major**, **minor**, **harmonic minor**, **dorian**,
**mixolydian**, **phrygian**, **blues** and **pentatonic**. A few are worth a
minute even if you never learned their names:

- **Dorian** is minor with one note raised — the hopeful-sad sound in a lot of
  jazz, folk and film music.
- **Mixolydian** is major with one note LOWERED (the seventh). It is the sound of
  a chord that never quite resolves, which is most of blues-rock and funk.
- **Phrygian** is minor with its second note lowered instead. That one semitone
  is the whole of flamenco and a lot of metal.
- **Blues** is the five-note pentatonic plus the flat fifth — the passing note a
  rock or blues solo leans on.
- **Pentatonic** is five notes instead of seven, and it is genuinely hard to play
  a wrong one. If you want a melody to be good on the first try, put your key in
  pentatonic and press keys at random. This is not cheating; it is how a lot of
  pop melodies are written.

What the key is **not**: a leash. Tracklet never blocks, snaps or corrects a
note. The key only changes what SHINES, and the moment a note outside it is what
you want — a seventh on the last chord, a passing tone between two steps, a
borrowed chord in a chorus — the app will not stand in your way. Every one of
the example songs in `scripts/` plays notes outside its own declared key, and
most of them would be duller if it did not.

### Which notes, concretely

| Scale | Octave 4 spellings | Octave 5 spellings |
| --- | --- | --- |
| C major | `C-4 D-4 E-4 F-4 G-4 A-4 B-4` | `C-5 D-5 E-5 F-5 G-5 A-5 B-5` |
| A natural minor | `A-3 B-3 C-4 D-4 E-4 F-4 G-4` | `A-4 B-4 C-5 D-5 E-5 F-5 G-5` |
| A minor pentatonic | `A-3 C-4 D-4 E-4 G-4` | `A-4 C-5 D-5 E-5 G-5` |

### Tuning: the twelve notes do not have to be equal

One more thing about the key, and it is the deepest fact in this whole app: the
twelve notes of an octave are a COMPROMISE. Split the octave into twelve equal
steps — equal temperament, the piano's tuning — and every key works, but no
interval is quite pure. Tune to the SOUND instead and the thirds and fifths ring
purely, at the cost of only being pure in one key.

`tuning` chooses which bargain the song makes:

| Tuning | What it does |
| --- | --- |
| `equal` | the default: twelve equal steps, every key usable |
| `just` | pure thirds and fifths in the song's key |
| `pythagorean` | pure fifths, wide thirds: the medieval sound |
| `meantone` | quarter-comma: pure thirds from narrowed fifths |
| `septimal` | 7-limit: a flat seventh, the blue note |

It is read against the key, so `tuning just` in D is pure in D, and the key note
itself never moves. Nothing about the instruments changes — only how they are
tuned. You hear it most on a sustained chord: play a D minor triad on a `voice
organ` under `tuning just`, then under `tuning equal`.

## 4. Harmony: chords

A triad is three notes with a gap: root, third, fifth. In semitones from the
root:

| Chord | Semitones | C major | A minor | Written in octave 4 |
| --- | --- | --- | --- | --- |
| Major | 0 4 7 | C E G | — | `C-4 E-4 G-4` |
| Minor | 0 3 7 | — | A C E | `A-3 C-4 E-4` |
| Major 7 | 0 4 7 11 | C E G B | — | `C-4 E-4 G-4 B-4` |

**Remember: one note per channel per step.** A three-note chord therefore wants
three channels — one note each, on the same step:

```
C-4 E-4 G-4      <- C major: root, third, fifth, one per channel
A-3 C-4 E-4      <- A minor: the same idea, a different shape
```

Those two lines are consecutive steps: step 0 is a C major stab and step 1 is
an A minor one. That is already a usable pad, provided the channels use a soft
waveform (`track 1 wave sine`, `track 2 wave triangle`).

**A chord can also live in ONE cell**, spelled with commas — `C-4,E-4,G-4` — which
is what you want when the whole chord is one instrument (a piano, an organ, a pad)
rather than three players. It needs the channel to say how many notes it can hold
at once:

```script
track 1 "PIANO" voice pluck hold 4
track 1 poly 3
C-4,E-4,G-4      # step 0: three notes, one channel, sounding together
A-3,C-4,E-4      # step 1: the same idea, a different shape
```

Either way you are describing the same three notes. Spread over three channels is
three parts that happen to line up; in one cell it is one player playing a chord,
and it costs one fader instead of three.

For a **moving chord**, repeat the shape on each beat and change the notes:

```
C-4 E-4 G-4      <- beat 1: C major
.   .   .
.   .   .
.   .   .
F-4 A-4 C-5      <- beat 2: F major
.   .   .
.   .   .
.   .   .
```

### Let the app build the chord

You never have to work out whether a chord is major or minor. Click `CHORDS` in
the `THIS CELL` panel until it says `1 KEY = A TRIAD` (a second click makes it a
four-note `7TH`), then click a piano key, and the app writes the chord that key
belongs to across the channels after the cursor. In C major, press **D** and you
get `D F A`; press **G** and you get `G B D`. The shape is taken from the **key**
you set — every other note of its scale — so the chords always fit together, and
you can hear the difference between them before you can name it.

While chord mode is on, every piano key is relabelled with the chord it would
write: `C`, `Dm`, `Em`, `F`, `G`, `Am`, `Bo` across one octave of C major (`CM7`,
`Dm7`, `G7`, … with the `7TH` setting). That line — the seven chords of a key, in
order — is the single most useful thing to know about harmony, and it is drawn on
the keys.

Two small print-cases worth knowing. In the **pentatonic** scale there are only
five notes, so "every other note" does not make a standard triad; the keys keep
their note names and the chords are simply stacks of notes that sound good
together. And an out-of-key key still gets a chord, borrowing the shape of the
key note below it — that is how you reach a borrowed chord like `A7` in a minor
key, and it is the one chord you might want that the key itself cannot supply.

A script asks for a chord the same way, and can name one exactly:

```
key C major
chord 0 1 Dm        # step 0: D F A, by name
chord 4 1 5         # step 4: the fifth chord of the key (G B D)
chord 8 1 G7        # step 8: G B D F
```

`chord ROW TRACK CHORD` writes the notes to that channel and the next two (or
three, for a seventh), one note each, on the same step — which is exactly the
`C-4 E-4 G-4` above, spelled out for you. The degree form (`4 1 5`) is the one
to reach for while learning: it can only ever produce notes that belong to the
key, so it is impossible to get wrong.

### Chord progressions that always work

Four bars, one chord per bar — but in Tracklet one pattern is one bar, so this
is four patterns (or four beats inside one pattern):

| Progression | Chords (A minor) | Chords (C major) |
| --- | --- | --- |
| i – VI – III – VII | Am F C G | — |
| I – V – vi – IV | — | C G Am F |
| i – iv – v – i | Am Dm Em Am | — |
| I – vi – IV – V | — | C Am F G |

The single most useful trick: **keep one note common between neighbouring
chords** so the ear hears a line rather than blocks. In `Am F C G`, the note
`C-4` lives in Am, F and C.

## 5. The four channels (and what they are for)

The default channel waveforms are chosen so a first song is legible by ear:

| Track | Default wave | Sounds like | Do this with it |
| --- | --- | --- | --- |
| 1 | `square` | bright, buzzy | Lead melody, or a percussive stab |
| 2 | `triangle` | soft, hollow | Bass — triangle keeps low notes clear |
| 3 | `sawtooth` | reedy, aggressive | Chords, pads, or a bass that has to bite |
| 4 | `sine` | pure, round | Pads, sub bass, and soft percussion |
| 5–8 | repeats the cycle | | A second layer of any of the above |

A `square` is really a **pulse**, and the `duty` knob narrows it: `100` is the
full hollow square, and dropping toward `0` makes it thin and reedy — the classic
chip lead sound. It is the one knob to reach for when a square should sound like
a NES rather than a synth, and it is heard only on a `square` wave. (See
[the script reference](03-script-reference.md).)

There is also a `noise` wave — not a tone but the chip's own noise channel, which
grits instead of ringing. Write a low note for a rumble, a high one for a fine
hiss, and it becomes drums, breath or wind that sound like hardware rather than a
filtered hiss.

And a `table` wave — the chip wavetable a Game Boy or a PC Engine uses for its
"wave" channel. It is a bank of named shapes and the `DUTY` knob picks one
(`HOLLOW`, `GLASS`, `REED`, `BUZZ`, `ORGAN`), so one channel can be a hollow
tooting lead and the next a nasal reed without leaving the grid.

Finally a `sample` wave — a short ONE-SHOT the note triggers, the way a Super NES
plays back percussion. It sounds once and dies on its own, so `hold` cannot
stretch it, and it is pitched by the note. `DUTY` picks the sound: `BLIP`,
`PLUCK`, `WOOD`, `CLAP`, `TOM`, `BELL`.

And an `fm` wave — two-operator FM, the way a Genesis or an AdLib makes its
voices: a sine carrier, bent by a second oscillator an octave above. The `DUTY`
knob is how hard the modulator pushes, from a pure sine at `0` to a bright
metallic tone at `100`, so it is the wave to reach for a hollower, more electric
lead or bass than a pulse can give.

And a `string` wave — a plucked string, from first principles: a burst of noise
ringing through a delay line, which is the Karplus-Strong trick. It sounds once
and dies on its own, so `hold` cannot stretch a pluck, and its pitch follows the
note. `DUTY` picks the string: `PLUCK`, `STEEL`, `NYLON`, `HARP`, `KOTO`.

And a `formant` wave — a vowel, from first principles: a steady glottal tone
shaped by three resonant peaks, which is how the mouth turns the buzz of the
vocal folds into speech. Unlike `sample` and `string` it SUSTAINS, so `hold`
stretches it and `glide` slides from one vowel to the next. `DUTY` picks the
vowel: `AH`, `EH`, `EE`, `OH`, `OO`.

And an `organ` wave — a drawbar organ, from first principles: nine pure sines
added together at the musical intervals a tonewheel organ uses, from a sub-octave
below the note up to several octaves above. `DUTY` picks the registration: which
of the nine bars are pulled out, from a single `FLUTE` stop to the `FULL` organ.
It sustains, so `hold` rings a chord for as long as you write it.

And a `granular` wave — granular synthesis: the note is treated as a CLOUD of
tiny grains a few milliseconds long, sprayed out and left to overlap, rather than
as a wave. `DUTY` picks the character, from a `CRACKLE` of tiny sparse grains
through a `BUZZ` to a `SMEAR` of grains so long they merge. It sustains too, and
its grains come from a fixed seed, so the texture is the same every time.

And a `font` wave — recorded sound: somebody else's samples, rather than a sound
this app makes. It is the one wave that is not part of the song, and there are two
ways to load one: `LOAD SOUNDFONT (.sf2)` in the `F2` menu for somebody else's
compiled instrument, or `IMPORT FROM NOISLET (.instrument.json)` for a pack you
designed yourself in Noislet. Either way every channel on `wave font` plays it. `DUTY` picks which of the font's PRESETS (a
piano, a violin, a whole orchestra's worth), and the KEY you write picks which of
that preset's recordings answers — a real sampler swaps samples across the
keyboard rather than stretching one. With no font loaded the wave falls back to
the app's own one-shots, so the note always sounds.

And a `reed` wave — a reed instrument, from first principles: a buzzing exciter
blown through a resonant tube, the way a clarinet or an oboe makes its sound. It is
the exciter family's first member, and it does what the plucked waves cannot: it
SUSTAINS, so `hold` rings a melody and `glide` slides between notes like a player
breathing. `DUTY` picks which reed, from the hollow `CLARINET` through a bright
`OBOE` and a deep `BASSOON` to a `SAX`, a `HARMONICA` and a locked `BAGPIPE`.

And a `brass` wave — the same two-part machine, with a LIP for an exciter: a
player's lips buzzing into a flared metal bore. The model is the reed's; the
numbers are what make it brass. A conical bore keeps BOTH harmonic families —
nothing here is hollow the way a clarinet is — and the flared bell keeps the tone
bright as the note climbs. `DUTY` picks the instrument: `TRUMPET`, `TROMBONE`,
`HORN`, `TUBA`, `FLUGEL` and a harmon-`MUTED` trumpet that is thin and nasal while
the tube behind it is unchanged.

And a `bow` wave — the same machine with a bow for an exciter: a stick-slip drag
across a string, ringing through a hollow body. A body is not a tube — it is a box
with a low air resonance and a broad "bridge hill" up top — so its peaks sit low
and wide. It SUSTAINS, which is the whole difference from `string`: a pluck is over
as soon as it starts, and a bow holds a note for as long as you write one. `DUTY`
picks the instrument: `VIOLIN`, `VIOLA`, `CELLO`, `BASS`, an `ERHU`, and `STRINGS`
for a whole section.

And a `mallet` wave — the other family: a STRUCK bar rather than a blown or bowed
one, and the first wave whose overtones are INHARMONIC. Hit a metal bar and its
overtones land near 2.76 and 5.4 times the note rather than at 2, 3 and 4, and
that gap is the whole reason a glockenspiel sounds like a glockenspiel. It is a
struck ONE-SHOT like `sample` and `string` — it sounds once and rings down; `DUTY`
picks the bar: `MARIMBA`, `XYLOPHONE`, `VIBRAPHONE`, `GLOCKENSPIEL`, `MUSIC BOX`
and `KALIMBA`.

And a `membrane` wave — the other half of the struck family, and the one everyone
already has an ear for: a drum SKIN rather than a wooden or metal bar. A circle's
overtones are even denser and closer than a bar's — 1, 1.59, 2.14, 2.30, 2.65 … —
so instead of a chord you hear a single thud with a pitch. And a skin RELAXES
where a bar keeps its tuning, so the note starts a little high and droops down to
where it belongs, which is what makes a tom sound like a drum and not like a
box being hit. It is a struck ONE-SHOT like `mallet`. `DUTY` picks the drum:
`TOM`, `TIMPANI`, `CONGA`, `TABLA`, `DJEMBE` and `FRAME`.

And a `plate` wave — the third struck body, and the most METALLIC: a bell, a gong
or a cymbal rather than a bar or a skin. Its overtones are SPARSE and spread far
apart — a bell rings at a hum an octave below its strike tone, a tierce a minor
third above it, a nominal an octave up — and they ring for seconds, far longer
than any bar, which is the whole difference between a woodblock and a church bell.
It is a struck ONE-SHOT like `mallet` and `membrane`. `DUTY` picks the plate:
`BELL`, `CHIME`, `GONG`, `TAM-TAM`, `ANVIL` and `CRASH`.

And when you want a whole machine at once, `chip nes` (or `gb`, `pce`, `snes`,
`gba`, `genesis`, `opl`) gives each channel the sound that console is remembered
for in a single line — two narrowed pulses, a triangle bass and a noise drum, in
the NES's case.
It only sets the SOUND, so it is a starting point you tune away from rather than a
mode. See [the cookbook](04-cookbook.md) for a worked example.

A conventional four-channel split:

- **1 = drums.** High notes (`C-6`, `D-6`) for hats/ticks; piling 2–3 low notes
  together on a step makes a thicker thump.
- **2 = bass.** Root notes of the chords, octaves 1–3, one note per beat or step.
- **3 = harmony.** Chord tones repeating every beat, octaves 3–5.
- **4 = lead.** One line, sparse, longer notes for the top of the mix.

**Do this with it** is above all about NOTE LENGTH. A channel with `HOLD: 1` (the
default) sounds a one-step blip on every step you write, which is what drums and
a fast melody want. Set `HOLD: 4` or `HOLD: 8` on the pad channel and one written
chord rings for a beat or half a bar, so a four-bar pad is four `chord` lines
instead of sixty-four. A longer hold only ever affects the channel you set it on,
and a new note on the same channel replaces the one still ringing.

**The waveform column is only where a channel STARTS.** Press `F4` and pick a
voice — `lead`, `bass`, `pad`, `hat` — and the channel becomes that instrument in
one click, which is almost always faster and better than reasoning about
waveforms. The next section is what the voices are.

Two rules that fix most muddy mixes:

1. **Keep registers apart.** Bass at 1–3, harmony at 3–5, lead at 5–6. When two
   channels play in the same octave, turn one down.
2. **Leave space.** Not every channel needs a note on every step. The empties
   are what make the notes audible.

### Balancing: the ways to make a channel quieter

A mix that sounds muddy usually has one problem — everything is fighting to be the
loudest — and there are several different tools for it, in the order you should
try them:

| Tool | Where | It means | Saved in the song? |
| --- | --- | --- | --- |
| **Register** | which octave you write in | a bass at octave 2 never fights a lead at octave 5 | it *is* the song |
| **Level** | `F5`, or `level 65` | how far this channel sits forward | **yes** |
| **Pan** | `F5`, or `pan L30` | which side this channel sits on | **yes** |
| **Send** | `F5`, or `verb 0` | how much of this channel is in the room | **yes** |
| **Mute** | the box on the channel row, or `mute 2` | do not play this channel at all | **yes** |
| **Solo** | `F5` | hear ONLY this channel for a moment | **no** — it is how you listen |

Press **`F5`** and every channel gets a strip of its own: **LEVEL**,
**PAN**, and the two **sends** — **VERB** and **ECHO** — that decide how much of
this channel is standing in the room, plus the group it joins. Click any of them
to set it wherever you clicked, or nudge your way to it with the keyboard (ten
percent a press); press `C` to snap a channel's pan back to centre, and `Ctrl+C`
then `Ctrl+V` to give one channel another channel's whole mix — the starting point
for eight channels, rather than six numbers typed eight times. The `ROOM` panel
underneath has the song's **REVERB** and **ECHO**, which
is how big that room is. Two rules of thumb from a hundred dance records:

- **Nothing but the drums wants 100.** A bass at `60`–`70`, chords at `40`–`55`
  and hats at `25`–`40` under a lead at `100` is a mix that sounds finished,
  because the lead is the thing you are meant to notice.- **Solo is a question, not a setting.** `SOLO` the bass and the hats one at a
time to hear what each is actually playing, then unsolo and rebalance. It does
not touch the song — nothing is saved, and `Ctrl+Z` has nothing to undo.
- **Send the things you want to hear ring.** Reverb on a bell, a snare or a lead
in a big hall is the whole point of having a hall; the bass and the kick usually
want none of it, because a wet low end is a mushy one. That is what the two send
bars are for: one room, and each channel in it by its own amount.

A level of `0` is silent but NOT muted: the channel is still there, and one press
of `→` brings it back. That distinction is deliberate — mute answers "is this
channel in the song?", level answers "how loud is it?" — and the `F5` menu shows
the two differently, so you can always tell which one you are looking at.

## 6. Sound: voices, then knobs

The fastest way to make a channel sound like an instrument is the **`F4` voice
menu**. A voice is a named sound — what it is FOR, not how it is built — and the
list is short on purpose, because a list of hundreds is a list nobody reads:

| Family | Voices | Reach for it when you want |
| --- | --- | --- |
| Lead | `lead`, `pluck`, `bell`, `glass` | the top line: cutting, plucked, ringing, fragile |
| Low | `bass`, `sub` | the bottom: round and low, or pure sub |
| Harmony | `pad`, `strings`, `organ`, `flute` | chords: slow and wide, bowed, steady, breathy |
| Drums & fx | `kick`, `snare`, `hat`, `wind` | rhythm and weather |

Every voice also comes with a one-line blurb in the menu, in the same voice as a
scale's, so the list teaches while you choose.

### The nine knobs, in plain words

Under the voices are **nine percentages**. They are named after what you HEAR,
not what the machine does, which is what makes them dialable by ear:

| Knob | 0 is | 100 is | Turn it up to… |
| --- | --- | --- | --- |
| `bright` | dark, muffled | open, buzzing | cut through a mix |
| `sweep` | a steady, flat tone | a big wah, opening then closing | give a pluck its bite or a bow its swell |
| `duty` | a thin, reedy pulse | the full hollow square | make a square sound like a chip lead |
| `noise` | a pure tone | all hiss | make a drum, a breath or wind |
| `attack` | an instant pluck or hit | a slow swell | sound bowed or dreamy |
| `decay` | a snappy drop to the held level | a slow, gradual fall | make the level ease down rather than snap |
| `ring` | dies the moment it starts | holds its level | make a pad; read it with `hold` |
| `release` | stops the moment it ends | keeps ringing on | let a bell or a pad tail away |
| `thick` | one thin voice | wide, slightly detuned | sound like more than one player |

The four in the middle — `attack`, `decay`, `ring`, `release` — are the whole
ADSR a synth asks for, spelled out as what you hear: how fast a note arrives,
how quickly it settles to the level it holds, how much it holds, and how long it
lingers after it ends.

Because every value is 0–100, the worst you can do is hear something you did not
want and slide it back: **the range is the guarantee**, and nothing you can dial
is silent, painful or invalid. `hold` (how long) and `ring` (the instrument) are
deliberately separate, which is what lets one `pad` voice play a long chord
without every voice having to invent a length.

### More than one layer

A voice is one layer of sound. A channel can also have up to three more stacked
above it, each with its own waveform, knobs, octave and level — and the whole
stack plays every note on that channel together. The **`F7`** design menu is where
a hand stacks them: `INS` adds a copy of the layer you are on, and the arrows move
it. In a script it is one line per layer:

```
track 1 "LEAD" voice pluck
layer 1 2 wave saw detune -11 gain 55
layer 1 3 wave saw octave -1 gain 45
```

Read those two lines as a sentence: *the lead is a pluck, plus the same sound as
a saw eleven cents flat, plus a saw an octave below at half level.* The three
sounds play as one note, which is how an instrument sounds like more than one
thing — an organ is two octaves at once, a bell is a bright tone and a dull one
together, and a supersaw is three copies a few cents apart. The first layer IS the
channel's voice, so `layer 1 1 wave saw` and `track 1 wave saw` are the same edit.

The three things a layer has that a voice does not are **where it sits**:
`octave` (how far up or down), `detune` (how far out of tune, in cents) and `gain`
(how loud it is inside the instrument). Start with a copy of what you have, move
it, and turn it down until the part sounds bigger rather than louder — the level
is the part everyone gets wrong, because a stack adds up. `thick` is the same idea
with one knob already turned for you.

### The waveforms underneath

The voice picks a waveform for you; these are the four TONAL ones it picks, if
you want to choose one by hand (`track 1 wave saw`). The chip waves above
(`noise`, `table`, `sample`, `fm`, `string`, `formant`, `organ`, `granular`, `reed`,
`brass`, `bow`, `mallet`, `membrane`, `plate`) and the `font` wave are chosen the
same way, by naming them:

| Wave | Harmonics | Best for | Avoid for |
| --- | --- | --- | --- |
| `square` | odd, hollow, "video game" | Leads, bass with presence, ticks | Dense chords — it turns to mush |
| `triangle` | few, soft | Bass, mellow pads, sub lines | Leads that must cut through |
| `sawtooth` | many, bright, buzzy | Aggressive leads, chords, strings | Sub bass (it muddies lows) |
| `sine` | one, pure | Sub bass, soft pads, clean tones | Anything that must be noticed |

Each note is one oscillator — two, if `thick` is up, and one per layer once you
stack any — through its own filter, so **fewer notes at once still sounds better
than more**. Two channels playing a
clear figure beat four channels playing a thick one.

### Placing channels, and the room

Level decides how far forward a channel sits; **pan** decides WHICH SIDE it sits
on. They are the two halves of a mix, and the second one is easy to forget: a
song where everything is dead centre is a song where everything is stacked in one
spot. Spread a pad and a lead apart, nudge a hat a little to one side, and leave
the kick and the bass centred — low notes carry almost no direction, so pulling a
bass off-centre just makes the whole mix lean.

The `F5` menu has a **PAN** bar per channel (`L30` is a little left, `R70` is far
right, `C` is centre), and below the channels sits the **room**: two song-wide
amounts, **REVERB** and **ECHO**. These are not per channel — there is one room,
and every channel plays in it — which is why they sit on their own row rather
than in a channel column.

- **Reverb** puts a short hall behind the band. It glues a mix together and makes
a dry, close sound feel like a place. A little goes a long way: `20`–`40` is
usually enough, and `0` is genuinely dry.
- **Echo** is one repeat, timed to a beat, so it stays in time when you change the
tempo. `15`–`30` on a lead is the classic. `0` is off.

Both are part of the **song** (`reverb 40`, `echo 25`), so they travel in the file
and come back when it is opened. They also both start at `0` — a song written
without asking for a room sounds exactly as it always did.

The room is one place; a **send** is how much of one instrument is standing in
it. Every channel sends all of itself by default (`FULL` on the `F5` bar, or
`verb 100`), so turning the reverb up puts the whole band in the hall — and then
`verb 0` on the bass and the kick takes the two of them back out, keeping the low
end close and dry while the rest rings. Put the other way round: **the room says
how big the space is, and the sends say who is in it.**

## 7. Turning one bar into a song

A pattern is a bar by default; `copy` is the whole arranging toolkit:

```
pattern 1 "VERSE"
… your bar …
copy 1 2
pattern 2 "CHORUS"
note 0 4 G-5          # change a few cells and you have a second section
copy 1 4
pattern 4 "VERSE 2"
clear 3               # pattern 3 stays empty as a breather
```

Practical shape for a 4-pattern track: `1 verse · 2 chorus · 3 break (sparse) ·
4 verse again`. Even a single empty pattern between two busy ones reads as
intentional structure.

## 8. A composition checklist

Before you paste a script, walk this list:

1. **Tempo** suits the genre (see the table above).
2. **Key** chosen, and every channel in it (see the scale tables).
3. **Bass** on the roots, octaves 1–3, on the strong beats.
4. **Harmony** in chord tones, above the bass, one octave gap minimum.
5. **Lead** mostly on the beat, in octave 5–6, with rests.
6. **Percussion** (if any) on a channel of its own, high and short.
7. **Registers do not overlap** between bass and chord channels.
8. At least one **step is silent** somewhere — a gap the ear can rest in.
9. `tempo`, `tracks` and every `track N` line come **before** the grid rows that
   depend on them.
10. `pattern N` appears **before** the rows destined for that pattern.
