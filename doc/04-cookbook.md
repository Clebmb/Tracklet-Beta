# 04 — Cookbook

Every block below is a **complete script** and is verified by the test suite
(`tracklet/src/__tests__/docs.test.ts` extracts every ```script block in this
folder and applies it). Paste one into the SCRIPT panel, press APPLY, press
SPACE. Then change one number and do it again — that is the fastest way to learn
what each part does.

Blocks fenced as ```text are illustrations, not scripts.

Every recipe below is written out in full, because that is how the notation is
learned. When you would rather START from a working song than from a blank one,
`start house`, `start lofi`, `start ballad`, `start rock`, `start emo`,
`start vaporwave`, `start synthwave`, `start shoegaze` and `start dnb` write a
whole skeleton — channels, sounds, a beat, a chord loop and a form — and
`F2 → STARTERS…` is the same nine by hand. See
[the reference](03-script-reference.md#start-name--begin-from-a-whole-worked-skeleton);
recipe 23 below is the shape they are built on, and
recipe 24 takes the first three of them apart.

Every block gives each channel a **voice** — a named instrument (`kick`, `bass`,
`pad`, `hat`, …) rather than a bare waveform. That is the sound; if you want to
hear the same thing as a list you can click, press **`F4`** in the app. Many also
give each channel a **level** — how far forward it sits in the mix — which is
what **`F5`** shows as a bar per channel; see
[recipe 9](#9-balancing-the-mix) for how to choose one.

---

## 1. Four to the floor

The most useful starting point: a kick on every beat, a bass note on every beat,
a chord stab on every beat, and hats on the offbeats. One bar, 128 BPM.

```script
new
song "FOUR TO THE FLOOR"
tempo 128
tracks 4

track 1 "KICK"  voice kick
track 2 "BASS"  voice bass
track 3 "CHORD" voice strings hold 4
track 4 "HAT"   voice hat

pattern 1 "MAIN"
C-1 C-2 C-4 C-6
.   .   .   .
.   .   .   C-6
.   .   .   .
C-1 C-2 E-4 C-6
.   .   .   .
.   .   .   C-6
.   .   .   .
C-1 C-2 G-4 C-6
.   .   .   .
.   .   .   C-6
.   .   .   .
C-1 C-2 C-4 C-6
.   .   .   .
.   .   .   C-6
.   .   .   .
```

**Why it works:** the kick and bass agree on the beats (steps 0, 4, 8, 12), the
chord walks `C → E → G → C` so the ear hears movement without a melody, and the
hat is on the offbeats (2, 6, 10, 14), which is what makes it sound like it is
moving forward.

**Change one thing:** `tempo 128` → `tempo 124`, or swap `track 3 "CHORD" voice
strings` for `voice pad` (or add `bright 30`) to hear how much of a channel's
character is its voice rather than its notes.

---

## 2. A slow minor ballad

Three melodic channels and a pad, moving through `Am → F → C → G` at one chord
per beat, 84 BPM. Notice how much of the sound is *the arpeggio* rather than a
chord — four channels cannot hold a real four-note chord and a melody at once.

```script
new
song "QUIET ROOM"
tempo 84
tracks 4

track 1 "BASS" wave triangle
track 2 "ARP"  wave sine
track 3 "LEAD" wave square
track 4 "PAD"  wave saw

pattern 1 "VERSE"
A-2 A-3 E-4 E-3
.   C-4 .   .
.   E-4 .   .
.   C-4 .   .
F-2 F-3 C-5 C-4
.   A-3 .   .
.   C-4 .   .
.   A-3 .   .
C-3 C-4 G-4 G-3
.   E-4 .   .
.   G-4 .   .
.   E-4 .   .
G-2 G-3 D-5 D-4
.   B-3 .   .
.   D-4 .   .
.   B-3 .   .
```

**Why it works:** every channel is in A natural minor, the bass stays in octave
2, the arpeggio sits in octaves 3–4 and the lead in 5 — three separate registers
that do not fight. The pad only speaks on the beat, so it reads as a chord
rather than a drone.

---

## 3. A pentatonic melody

Five notes that cannot sound wrong: `A C D E G`. Use this shape whenever you
want a melody and do not want to think about harmony.

```script
new
song "PENTA"
key A pentatonic
tempo 100
tracks 2

track 1 "BASS" wave triangle
track 2 "LEAD" wave square

pattern 1 "MELODY"
A-2 A-4
.   .
.   C-5
.   .
E-2 D-5
.   .
.   E-5
.   .
A-2 D-5
.   .
.   C-5
.   .
E-2 A-4
.   .
.   G-4
.   .
```

**Why it works:** every melody note belongs to A minor pentatonic, so any note
follows any other. The bass alternates `A` and `E` — root, then its fifth — which
is the cheapest way to imply a chord without playing one.

**Change one thing:** delete a melody note (replace it with `.`) and hear how
much a rest adds.

---

## 4. A beat out of nothing

No drum samples, no percussion channel — just notes used as clicks. This is how
trackers did it before samplers were cheap, and it still works.

```script
new
song "TICK TOCK"
tempo 124
tracks 3

track 1 "DRUM" wave square
track 2 "BASS" wave triangle
track 3 "KEYS" wave sine

pattern 1 "BEAT"
C-1 C-2 C-5
.   .   .
C-6 .   .
.   .   .
C-1 C-2 E-5
.   .   .
C-6 .   .
.   .   .
C-1 A-2 C-5
.   .   .
C-6 .   .
.   .   .
C-1 C-2 D-5
.   .   .
C-6 .   .
.   .   .
```

**Why it works:** `C-1` is low enough to read as a thump (a kick), `C-6` is high
and short enough to read as a tick (a hat), and the square waveform is bright so
both are audible on laptop speakers. The offbeat ticks are what make it a groove
instead of a metronome.

---

## 5. One bar into two sections with `copy`

`copy` is the arranging statement. Write one good bar, copy it, then patch a few
cells — that is a chorus.

```script
new
song "TWO SECTIONS"
tempo 118
tracks 3

track 1 "BASS"  wave triangle
track 2 "CHORD" wave saw
track 3 "TICK"  wave square

pattern 1 "A"
A-2 A-3 C-6
.   .   .
.   .   C-6
.   .   .
F-2 F-3 C-6
.   .   .
.   .   C-6
.   .   .
C-3 C-4 C-6
.   .   .
.   .   C-6
.   .   .
G-2 G-3 C-6
.   .   .
.   .   C-6
.   .   .

copy 1 2
pattern 2 "B"
note 0 2 G-5
note 6 2 E-5
note 8 2 E-5
note 14 2 D-5
```

**Why it works:** section B is section A with four cells moved up an octave, so
the two sections are obviously the same piece of music. That is what makes a
song feel composed rather than assembled.

**Note the order:** `copy 1 2` copies pattern 1 as it stands *at that line*, so
it comes after the grid rows and before the edits to pattern 2.

---

## 6. A rising line for tension

An octave climb is the cheapest way to make eight bars feel like they are going
somewhere. This is the C major scale walked up one step at a time.

```script
new
song "CLIMB"
tempo 140
tracks 2

track 1 "LEAD" wave saw
track 2 "SUB"  wave sine

pattern 1 "RISE"
C-4 C-2
C-4 .
D-4 C-2
D-4 .
E-4 C-2
E-4 .
F-4 C-2
F-4 .
G-4 C-2
G-4 .
A-4 C-2
A-4 .
B-4 C-2
B-4 .
C-5 C-2
C-5 .
```

**Why it works:** the bass never moves (a pedal point), so all the motion is in
the top line — which makes the climb feel deliberate rather than busy.

**Change one thing:** reach the top and stop. Replace the last four lead cells
with `.` and the loop ends on the peak.

---

## 7. Thickening one part with two channels

One channel is one oscillator, which can sound thin on a bass. Play the same
notes on two channels with different waveforms and the part gains body — the
honest, provider-free version of a synth's detune/unison.

```script
new
song "HALF LIGHT"
tempo 112
tracks 4

track 1 "BASS"  wave triangle
track 2 "BASS2" wave saw
track 3 "CHORD" wave saw
track 4 "LEAD"  wave square

pattern 1 "A"
C-2 C-2 C-4 C-5
.   .   .   .
.   .   .   .
.   .   .   .
A-2 A-2 A-3 A-4
.   .   .   .
.   .   .   .
.   .   .   .
F-2 F-2 F-3 F-4
.   .   .   .
.   .   .   .
.   .   .   .
G-2 G-2 G-3 G-4
.   .   .   .
.   .   .   .
.   .   .   .
```

**Why it works:** the triangle gives the note its pitch and the sawtooth adds
harmonics on top, so the bass is louder *and* brighter without being a different
line. Keep the two channels' notes identical or the part turns to mud.

**Do not do this to every channel.** Doubling three parts at once is the fastest
way to fill the master output; double the one part the song leans on.

> **Mutes are per channel, not per pattern.** `mute 2` silences channel 2 for
the whole song, in every pattern. There is no way to say "mute only in the
chorus", because a channel has one mute flag and the patterns share it. If a
part should not play in a section, do not write notes for it there.

---

## 8. Two bars in one pattern

A phrase needs more than a bar to finish. `steps 32` turns the grid into two bars
— the same sixteen steps, twice over, at the same tempo — which is how a melody
gets a chance to answer itself. Everything after the 16th grid row is the second
bar.

```script
new
song "TWO BARS"
tempo 112
steps 32
beat 4
tracks 3

track 1 "BASS" wave triangle
track 2 "LEAD" wave square
track 3 "TICK" wave sine

pattern 1 "PHRASE"
A-2 A-4 C-6
.   .   .
.   C-5 C-6
.   .   .
E-2 A-4 C-6
.   .   .
.   C-5 C-6
.   .   .
F-2 D-5 C-6
.   .   .
.   C-5 C-6
.   .   .
C-3 A-4 C-6
.   .   .
.   G-4 C-6
.   .   .
C-3 E-5 C-6
.   .   .
.   D-5 C-6
.   .   .
G-2 C-5 C-6
.   .   .
.   B-4 C-6
.   .   .
A-2 A-4 C-6
.   .   .
.   C-5 C-6
.   .   .
E-2 A-4 C-6
.   .   .
.   C-5 C-6
.   .   .
```

**Why it works:** bars 1 and 2 of the grid are the same bass figure, and the lead
climbs `A C A C` in the first bar and `C D C B` in the second — one step higher,
which is the smallest possible way to make a two-bar phrase feel like it is going
somewhere. Bars 3 and 4 return to the start, so the loop closes.

**Remember:** `steps` is one number for the whole song, and it trims or pads
every pattern. Decide it before writing, or write it before the rows it affects.
The app's grid pages through a pattern this long; the scroll bar is down the
right edge and the panel title names the visible rows.

---

## 9. Balancing the mix

Four channels at full volume is four people talking at once. The fix is one line
per channel — `level 0`–`100` — and it is the difference between a song that
sounds generated and one that sounds finished.

```script
new
song "BALANCED"
tempo 120
tracks 4

track 1 "LEAD" voice lead  level 100
track 2 "BASS" voice bass  level 65
track 3 "PAD"  voice pad   hold 4 level 45
track 4 "HAT"  voice hat   level 30

pattern 1 "A"
C-5 C-2 C-4 C-6
.   .   .   .
A-4 .   .   C-6
.   .   .   .
F-4 F-1 F-3 C-6
.   .   .   .
G-4 G-1 G-3 C-6
.   .   .   .
```

**Why it works:** the melody is the only thing at 100, so it is the only thing
you are meant to notice. The bass at 65 is felt; the pad at 45 is the bed under
both; the hats at 30 are texture. Delete the four `level` clauses and paste it
again — the notes are identical and it sounds like a traffic jam.

**Starting points**, by what the channel is doing:

| Channel | `level` |
| --- | --- |
| Lead / melody | `100` |
| Bass | `60`–`70` |
| Chords / pad | `40`–`55` |
| Kick / snare | `70`–`85` |
| Hi-hat / shaker / wind | `25`–`40` |

**To find a level by ear**, open the song and press **`F5`**: `SOLO` the channel
you are unsure about, `←`/`→` its bar until it sits right against the others,
then unsolo. `SOLO` is not saved and costs no undo step — it is only how you are
listening — while the `level` you set IS saved with the song.

**Remember:** `level` is per CHANNEL. If one note needs to be quieter than the
rest of its channel, write it on its own channel instead.

---

## 10. Make it swing

The same four-to-the-floor loop, straight and then swung. Nothing about the notes
changes — one line does.

```script
new
song "SWUNG"
tempo 124
swing 58
tracks 3

track 1 "BASS" voice bass level 70
track 2 "HAT"  voice hat  level 35
track 3 "CHORD" voice strings hold 4 level 45

pattern 1 "A"
C-2 .   C-4
C-6 .   .
.   C-2 .
C-6 .   .
F-2 .   F-3
C-6 .   .
.   F-2 .
C-6 .   .
G-2 .   G-3
C-6 .   .
.   G-2 .
C-6 .   .
C-2 .   C-4
C-6 .   .
.   C-2 .
C-6 .   .
```

**Why it works:** the hats are on every OTHER step (`C-6` on rows 1, 3, 5, 7 …),
so the swung step is the one they are NOT on — which means the hats stay where a
listener expects the beat and the lilt comes from the bass and the chords
shifting under them. Change `swing 58` to `swing 0` and paste it again: same
notes, same tempo, and the groove is gone.

**To find a good value**, play the song and drag the `SWING` slider in the
transport. `40`–`60` is the range most dance music lives in; above `80` you are
in triplet territory, which suits a shuffle or a waltz-feel bar and is too much
for a straight house beat. The slider never changes the tempo, so you cannot
break the song by exploring it.

**Remember:** swing is a property of the SONG, like `tempo` — one number for all
channels. `track 2 swing 60` does not set anything; it names channel 2 `SWING 60`.

---

## 11. Make it a console

One line turns a plain song into hardware. This is a two-bar NES loop: the chip
line gives the four channels their machine sounds, and the `track` lines only set
how loud each one is.

```script
new
song "NES RUNNER"
key A minor
tempo 150
tracks 4
chip nes

track 1 "PULSE"  level 72
track 2 "PULSE2" level 58
track 3 "BASS"   level 66
track 4 "DRUM"   level 50

pattern 1 "A"
A-4 A-3 A-2 C-6
.   .   .   .
C-5 .   .   .
.   .   .   C-6
E-5 E-3 E-2 .
.   .   .   .
C-5 .   .   C-6
.   .   .   .
F-4 F-3 F-2 .
.   .   .   C-6
C-5 .   .   .
.   C-4 .   .
G-4 G-3 G-2 .
.   .   .   C-6
B-4 .   B-2 .
.   .   .   .
```

**Why it works:** `chip nes` sets channels 1 and 2 to narrowed pulses, channel 3
to the triangle bass and channel 4 to the noise register, so the drum column
(`C-6`) is chip noise rather than a tone — and the low `A-2`/`E-2` bass notes on
the triangle are the one place a NES could put a clear low note. Try `chip gb` in
its place for a brighter, more nasal take, or `chip snes` for a smooth, sustained
one.

**Order matters:** `tracks 4` comes BEFORE `chip nes`, because `chip` sets the
channels that exist when it runs. On a song still narrower than the console, a
`tracks N` AFTER the chip line would add the extra channels with their neutral
sound rather than the machine's.

**A chip is a starting point.** It changes each channel's SOUND and nothing else,
so after it you can tune one channel away from the profile — `track 1 bright 95`
after the chip line is a brighter lead — and the rest stay. The console is not a
mode you are stuck in.

---

## 12. Thicken a part with layers

A channel's sound is its VOICE plus a **stack** of up to three layers above it.
This recipe is the one that pays off first: three saws a few cents apart on the
lead, an octave below the sub, and a second pad layer for width. Every layer
starts as a copy of the one under it, so a stack is a few short lines rather than
a second instrument built from nothing.

```script
new
song "THREE SAWS"
key A minor
tempo 126
tracks 4

track 1 "LEAD" wave sawtooth bright 80
layer 1 2 detune -11 gain 55
layer 1 3 detune 12  gain 55

track 2 "BASS" voice sub
layer 2 2 wave triangle octave -1 gain 50

track 3 "PAD"  voice pad hold 8
layer 3 2 wave sine detune 9 gain 45

track 4 "HAT"  voice hat

pattern 1 "A"
A-4 A-2 A-3 C-6
.   .   .   .
C-5 .   .   C-6
.   .   .   .
E-5 .   .   .
.   .   .   C-6
D-5 .   .   .
.   .   .   .
C-5 C-3 C-4 C-6
.   .   .   .
E-5 .   .   .
.   .   .   C-6
G-4 B-2 .   .
.   .   .   C-6
B-4 .   .   .
.   .   .   .
```

**Why it works:** the lead's two extra layers are the same saw at `-11` and
`+12` cents, which is the whole trick behind a supersaw — the three copies beat
slowly against each other, so one note sounds like several players. The bass adds
a triangle an octave down at `gain 50`, which thickens the bottom without
muddying the mid; the pad adds a second sine `9` cents out for width. Note that
every layer line says only what DIFFERS from the one below it: `layer 1 2 detune
-11 gain 55` inherits the lead's waveform, brightness and envelope, which is why
five words are enough.

**Watch the level.** A stack adds up rather than blending in: the voice is at
full gain, so three layers at `100` is a channel about ten decibels louder than
one. Turn the copies down (`gain 55` here) and check the whole thing against the
other channels — `level` on the `track` line is the channel's place in the mix,
and `gain` on a layer is only its share of the instrument. A stack of three
layers all left at full gain comes back as an advisory after APPLY.

**`thick` is the one-knob version of this.** The `thick` knob already detunes a
second copy of the wave, which is the cheapest way to widen a sound. Reach for it
first; reach for a layer when you want to choose the copy's waveform, put it an
octave away, or set its level yourself.

**Order and removal:** `layer 1 2 clear` takes a layer off and shifts any above
it down, so a stack is edited like any other list in this app. And because a stack
belongs to the CHANNEL, the fastest way to hear what one is doing is to clear it
and listen to the voice alone.

**Doing it by hand.** Every line above has a mouse: press **`F7`** on the channel
and the stack is laid out as a row of chips with the waveform, `OCTAVE`, `DETUNE`,
`GAIN` and the nine knobs of whichever layer you pick. `INS` stacks a copy of the
selected layer, `DEL` takes one out, and one `Ctrl+Z` undoes the whole visit — so
the fastest way to find the `-11` and `+12` above is to stack two copies, detune
them by ear, and let the app write the numbers down when you save the song. The
channel's row in the list shows `+2` while a stack is there, and `F4` shows the
same chips beside its `SOUND` heading.

---

## 13. Make a part bite

A layer changes what a channel is MADE of. An **effect** changes what happens to
that sound on its way out — nine of them, each a percentage on the `track` line
and a dial on `F7`'s `FX` page. This recipe is the six that are worth knowing
first: drive and cab on the lead, drive and crush on the bass, punch on the kick,
and chorus and tape on the pad. The other three are for the moment the ask stops
being "make this better" and starts being "make this somewhere else" — see the
paragraphs under the example.

```script
new
song "BITTER SWEET"
key D minor
tempo 118
tracks 4

track 1 "LEAD" voice lead   drive 45 cab 60 tilt 20
layer 1 2 detune -9 gain 55

track 2 "BASS" voice bass   drive 30 crush 15

track 3 "KICK" voice kick   punch 65

track 4 "PAD"  voice pad    chorus 55 tape 30 hold 8

pattern 1 "A"
D-5 D-3 .   D-4
.   .   .   .
F-5 .   .   A-4
.   .   .   .
A-5 .   .   D-5
.   .   .   .
F-5 .   .   A-4
.   .   .   .
C-5 C-3 .   D-4
.   .   .   .
E-5 .   .   A-4
.   .   .   .
D-5 .   .   F-4
.   .   .   .
A-4 .   .   D-5
.   .   .   .
```

**Why it works:** each effect does one thing to one channel, and none of them is
turned up past where it still sounds like the instrument. `drive 45` gives the
lead an edge without turning it into a wall of fuzz, and `cab 60` is what turns
that edge into an AMP: it closes the top and pushes the middle back, so what you
hear is the whole chain — distorted, speaker, wooden box — rather than a shape
sitting in front of the channel. `crush 15` under the bass's drive is the lo-fi
dust a low part wants, and `0` there would sound just as clean; `punch 65` on the
kick is what makes a drum sit in front of a bass that is on the same beat;
`chorus 55` widens the pad, which is the one channel where "wider" is the whole
point — and `tape 30` beside it is what makes the same part sound PRINTED: the
peaks round off, the pitch wanders a hair, and a hiss sits under it.

**`0` is off, not "a little".** Every effect defaults to `0`, and a channel with
all eight at `0` is built through exactly the same audio graph it was built through
before these existed. That is what makes them safe to add to a song: a number you
did not write cost you nothing, and the one you did is the only change you hear.

**Turn one up at a time.** Two effects on one channel are two things that can
fight: `tilt` next to `crush` brightens the grit that `crush` just made, and
`gate` next to `punch` gives a hit that is both short and loud. When a channel
stops sounding like the instrument you chose, take the newest number out and
listen again — `F7`'s `FX` page is built for exactly that, since the header counts
the ones that are on.

**`radio` is a place, not a polish.** It narrows a part to a telephone's band and
makes the signal inside it coarse — so it is the answer to "like it is coming out
of a phone", "an AM intro", "a voice on a radio", and it is almost always put on
ONE part rather than on a record: a whole mix down a telephone line reads as a
broken radio rather than as a mix. Two things worth knowing. It has no make-up
gain, on purpose, so narrowing a part can leave it quiet — that is what the
channel's own `level` is for, and putting the gain inside the effect would make
the fader a liar. And it pairs with `tape` in the other direction: `tape` ages a
part by making it worn, `radio` relocates it by making it narrow, and a hook that
is both is a sample of an old broadcast. Here is the smallest version of each —
one part relocated, one part aged:

```script
new
song "ON THE LINE"
key A minor
tempo 96
tracks 2

track 1 "VOX"  voice lead wave formant radio 70 level 62
track 2 "KEYS" voice organ   hold 8 poly 3 tape 20 level 45

pattern 1 "A"
E-4 A-3,C-4,E-4
.   .
.   .
.   .
A-4 .
.   .
C-5 .
.   .
```

**Why it works:** `radio 70` is doing two things to the voice at once — a band
that only keeps what a telephone keeps, and a signal inside it coarse enough to
hear as a codec — and `level 62` is there because `radio` deliberately does not
compensate for the energy a narrow band removes. The organ underneath is aged
instead of narrowed: `tape 20` is the same machine as `start lofi`'s, just quieter,
which is the difference between a part that is somewhere else and a part that is
somewhen else. Put both on the same channel and a hook becomes a sample of an old
broadcast — which is a whole genre, and it is two numbers.

**`tape` is the one to reach for when the ask is "make it sound old".** It is not
a filter — it is the machine: saturation, a transport that wanders slightly in
pitch, and a hiss bed, all from one number. `15`–`30` is the range where a mix
sounds AGED rather than processed, which is why `start lofi` and
`start vaporwave` both put `master tape 25` on the whole record. Put it on the
MIX rather than on one part when the brief is a decade rather than an instrument:
a clean arrangement with a taped mix is the whole sound of a lo-fi record.

**`vinyl` is a record UNDER the part, not a filter on it.** Where `tape` puts the
music ON a medium, `vinyl` is the medium it was FOUND off: the channel itself is
untouched and a quiet surface hiss with the odd crackle is summed in beside it, so
`vinyl 10` dulls nothing — it just makes the part sound like it came off a record.
That is why it is safe on a whole mix (`master tape 25 vinyl 12` is `start lofi`'s
record, and the crackle is what tells you it was sampled). Reach for it when the
ask is "like an old record" rather than "like an old tape".

**`cab` goes after `drive`, never instead of it.** A speaker box does not add
anything — it takes the top away and pushes the middle up — so on a clean channel
it sounds like a blanket, and the same number after `drive 45` sounds like a
stack of amps. That is not a rule of this app but of the thing it models, and it
is why a rock rhythm part is `drive` FIRST and `cab` second: the fuzz is what the
box is filtering.

**The same effects on the whole mix.** A channel's effect shapes one part; the `master`
line shapes everything at once, which is the difference between a part that bites
and a record that sounds like a record. One line, near the top beside `tempo`:

```script
new
song "PRINTED"
key A minor
tempo 124
tracks 2
master drive 20 tilt 12

track 1 "LEAD" voice lead

track 2 "BASS" voice bass

pattern 1 "A"
A-4 A-2
.   .
C-5 C-3
.   .
E-5 E-3
.   .
C-5 C-3
.   .
G-4 G-2
.   .
B-4 B-2
.   .
A-4 A-2
.   .
E-4 E-2
.   .
```

**Why it works:** `drive` on the mix does not make one instrument louder or
fuzzier, it rounds the peaks of everything together, so the parts sound like they
were played in the same room on the same day — the reason a demo and a record of
the same arrangement sound different. `tilt 12` leans the whole thing a little
brighter, which is the other half of that trick.

**Keep it small.** `10`–`25` of `drive` and `10`–`20` of `tilt` is the useful
range for glue; past `40` you are no longer gluing the mix, you are distorting it,
and it will fight the effects you set on individual channels. If a channel already
has `drive 45`, the mix needs less, not more: one guitar pedal into one amp.

**The one that is not a filter:** `gate` shortens every note on the channel (`100`
is a quarter of the note), and on the `master` line it shortens every note in the
SONG, multiplying with each channel's own gate. It is the effect to reach for when the ARRANGEMENT
needs a shorter note — staccato strings, a choppy pad — rather than when the mix
does.

**`chorus` was a knob once.** Before these effects existed, `chorus` was another
name for the `thick` knob. It is the effect now, so a script that wants the KNOB
writes `thick` (or `width`); see
[section 9 of the reference](03-script-reference.md#9-what-a-script-can-control)
for the full list of words.

**Doing it by hand.** Press **`F7`**, then `Tab` (or the `FX` button): the nine
sit as dials beside the layer stack, on the same channel, with the sentence under
them saying what the one you are on is for. `←`/`→` changes it by ten, `[`/`]` by
fifty, and clicking a bar lands where you clicked. One `Ctrl+Z` takes back a whole
visit, menu still open, and `F6` lists the same nine with the genres each one is
reached for in.

---

## 14. Make the kick pump the mix

A **duck** is one channel telling the rest of the mix to step back while it
plays. It is the sound of house, of most pop since the eighties, and of any
record where a kick and a bass occupy the same low end and neither sounds
muddy — and it is one number on the channel that hits.

```script
new
song "PUMP"
tempo 124
tracks 4

track 1 "KICK" voice kick   duck 70

track 2 "BASS" voice bass   hold 4

track 3 "CHORD" voice pad   hold 4 echo 30

track 4 "HAT"  voice hat    pan R25 verb 20

pattern 1 "A"
C-3 .   C-4 C-6
.   .   .   .
C-3 .   .   .
.   .   .   C-6
C-3 .   C-4 .
.   .   .   .
C-3 .   .   C-6
.   .   .   .
C-3 .   C-4 C-6
.   .   .   .
C-3 .   .   .
.   .   .   C-6
C-3 .   C-4 .
.   .   .   .
C-3 C-2 .   C-6
.   .   .   .
```

**Why it works:** the bass and the chord are on the beat with the kick, which
normally means the low end turns to mud. With `duck 70` on the kick, every time
channel 1 sounds a note the other three are turned down by 70% — and they come
back up over the length of that hit, so the drop and the recovery are the rhythm
rather than a separate pattern. The mix breathes in time with the drums, which is
what "the record pumps" means.

**One channel ducks.** It is the kick here; a snare or a lead vocal does it just
as well, and a vocal is the same trick for a different reason: the bed drops back
while the voice is singing, which is why a pop vocal sits so far forward without
being any louder.

**`0` is off**, and it is what every channel starts at. Nothing in the song
changes until you give one channel a duck, so a song that never mentions the word
is built through exactly the graph it was built through before the control
existed. Try this recipe twice: once with `duck 70`, once with `duck 0`, and the
difference is the whole trick.

**Doing it by hand.** Press **`F5`** and look at the last column of the selected
channel's row: `DUCK`, drawn in the warning colour because it is the one bar on
the mixer that moves the other rows. Click the bar to land where you clicked, or
press `P` (for the pump) to walk the value up (`0` → `10` → … → `100` → `0`). One
`Ctrl+Z` takes
back the whole visit.

---

## 15. Build a riser that lands on the drop

A rise is not notes. It is one value walking from one number to another across
the bars before a drop, which is what a LANE is for — and it is the reason a song
can have a build-up without spending a channel on it.

```script
new
song "BUILD"
tempo 126
tracks 3

track 1 "KICK" voice kick
track 2 "BASS" voice bass  hold 4
track 3 "LEAD" voice lead  hold 2 echo 25

automate 3 bright 10 100 bars 1 to 8
automate 3 level  55 85  bars 1 to 8

automate 3 bright 100 35 bars 9 to 16
automate 3 gate   0 70   bars 9 to 16

pattern 1 "A"
C-3 .   C-5
.   .   .
C-3 .   E-5
.   .   .
C-3 .   C-5
.   .   .
C-3 C-2 G-5
.   .   .

order 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
```

**Why it works:** eight bars of the lead opening up (`bright 10` → `100`) as it
gets louder (`level 55` → `85`) is a build-up you can hear coming. Then the two
lanes at bar 9 do the opposite on purpose: the tone closes back down and `gate`
rises, so the notes shorten and the part gets clipped and dry over the second
half. Two numbers rising and two falling, the same lead and the same notes.

**The value STAYS where a lane leaves it**, which is why the build does not snap
back at bar 9 — the second pair of lanes takes over from there, and the last lane
in force is the one you hear.

**Lanes are read against the order, not against the pattern.** `bars 1 to 8`
means the first eight slots of the order, so a sixteen-bar song written as one
pattern is still a sixteen-bar song to a lane. Change the order and the lane moves
with it.

**What a lane cannot move:** the effects, `pan` and the sends. Each of them
is a node in the audio graph that exists only when its amount is above zero, so a
curve could not fade one in from nothing — the app refuses the line and says so,
and `track 3 drive 30` is how you set one instead.

---

## 16. Write the whole song's form at once

A song is a FORM before it is a performance: two bars of verse, a chorus, the
verse again, the chorus twice, an ending. Write that with **sections** and an
**arrangement** and the shape of the song is one line you can check at a glance —
and every bar of it is still a pattern you write normally.

```script
new
song "SHAPE"
tempo 124
tracks 4

section VERSE 1 1 2 1
section CHORUS 3 3 4 4
section OUTRO 5
arrange VERSE VERSE CHORUS VERSE CHORUS OUTRO

track 1 "KICK" voice kick
track 2 "BASS" voice bass  hold 4
track 3 "CHORD" voice pad  hold 4 echo 30
track 4 "LEAD" voice lead

automate 4 bright 20 100 bars 9 to 16

pattern 1 "V"
C-3 C-2 C-4 .
.   .   .   .
C-3 C-2 .   .
.   .   .   .
C-3 C-2 C-4 .
.   .   .   .
C-3 C-2 .   E-4
.   .   .   .

pattern 2 "V2"
C-3 C-2 F-4 .
.   .   .   .
C-3 C-2 .   .
.   .   .   .
C-3 C-2 F-4 .
.   .   .   .
C-3 C-2 .   G-4
.   .   .   .

pattern 3 "C"
C-3 C-2 A-4 .
.   .   .   .
C-3 C-2 .   C-5
.   .   .   .
C-3 C-2 A-4 .
.   .   .   .
C-3 C-2 .   G-4
.   .   .   .

pattern 4 "C2"
C-3 C-2 F-4 .
.   .   .   .
C-3 C-2 .   A-4
.   .   .   .
C-3 C-2 F-4 .
.   .   .   .
C-3 C-2 C-5 .
.   .   .   .

pattern 5 "END"
C-3 C-2 C-4 C-4
.   .   .   .
.   .   .   .
.   .   .   .
```

**Why it works:** `section VERSE 1 1 2 1` says the verse is four bars built from
two patterns — the second bar of each pair is the variation — and the arrangement
says the song plays it twice, then a chorus, then the verse again, then the chorus
twice, then the outro. Reading it back is reading the song.

**The same bars, twice.** The chorus is `3 3 4 4` rather than a new pattern for
every bar: a section is a LIST, so a repeated bar is a repeated number. When the
last chorus should differ, point one of its bars at a new pattern inside the
order (`F3`, then `PAT +`).

**The build is a lane, not a section.** `automate 4 bright 20 100 bars 9 to 16`
opens the lead's tone across the second half of the song, which is a thing no
section can say: a section names BARS, a lane moves a VALUE.

**Change the form by changing one line.** A radio edit that drops the second verse
is `arrange VERSE CHORUS VERSE CHORUS OUTRO`. The patterns do not move, the lanes
keep their bars, and `Ctrl+Z` takes the whole change back.

---

## 17. One fader for a kit

A drum kit is four channels that have to move together. Balance them once, put
them on a **bus**, and from then on "the drums are too loud" is one number instead
of four:

```script
new
song "GROUPED"
tempo 124
tracks 4

bus DRUMS 70
track 1 "KICK"  voice kick  level 85 bus DRUMS
track 2 "SNARE" voice snare level 75 bus DRUMS
track 3 "HAT"   voice hat   level 40 bus DRUMS
track 4 "BASS"  voice bass  level 65

pattern 1 "A"
C-2 D-3 C-6 C-2
.   .   .   .
C-2 D-3 C-6 .
.   .   .   G-1
C-2 D-3 C-6 C-2
.   .   .   .
C-2 D-3 C-6 .
.   .   .   G-1
```

**Why it works:** the three drum channels kept the levels that balance them
against EACH OTHER — 85, 75, 40 — and the group multiplies all three by 0.7, which
is the part a hand would otherwise fiddle with four times. `bus DRUMS 55` moves the
whole kit down without disturbing that balance; `bus DRUMS none` on a channel puts
that one drum back on its own fader.

**The room hears the group too.** A bus scales the channel itself, sends and all,
so a quieter kit is quieter *in the reverb* as well — which is what a group fader
on a real desk does, and the reason it is not the same thing as turning down four
levels in a room with a long tail.

**When to reach for one:** drums (always), several pads that should duck together,
a stack of backing channels under a lead. **When not to:** two channels that are
balanced one at a time, or anything you want to move independently — a group of one
is just that channel's fader, and `level` already exists.

---

## 18. One chord, eight notes

**The idiom:** the arpeggio and the strum, both from one line, because a chord
that is *spread* is a chord that moves.

```script
new
song "SPREAD"
key A minor
tempo 124
tracks 4
track 1 "ARP"  voice pluck hold 1  level 70
track 2 "KEYS" voice bell  hold 4  level 55  verb 30
track 3 "BASS" voice bass  hold 2  level 65
track 4 "HAT"  voice hat   hold 1  level 35

pattern 1 "VERSE"
chord 0 1 Am arp up 8
chord 0 2 Am arp
A-1 . E-2 .
.   . .   A-6

pattern 2 "CHORUS"
chord 0 1 F arp updown 8
chord 0 2 F arp 4
F-1 . C-2 .
.   . .   A-6*3

section VERSE 1 1
section CHORUS 2 2
arrange VERSE CHORUS repeat 3 VERSE
```

**What each line is doing.** `chord 0 1 Am arp up 8` writes A C E A C E A C — the
chord's tones, one per step, climbing an octave every time the tones run out — on
channel 1 alone. It is the same three notes the plain `chord 0 1 Am` would have
written, with a direction instead of three channels.

**Three recipes in one word, chosen by the CHANNEL, not the line:**

| The channel | What you hear |
| --- | --- |
| `hold 1` | an **arpeggio**: each note gives way to the next |
| `hold 4` | a **strum**: the notes ring over each other, which is what a guitar does |
| `hold 1` + `track 1 glide 40` | a **run** with the notes leaning into each other (a synth lead, an 808) |

The second channel's `chord 0 2 Am arp` is the same chord with no direction and no
count: one step per note, the run a hand plays when it names a chord. Underneath
it the bass moves once a bar and the top line has a `*3` on the last hit, so the
bar ends with the ear expecting the chorus.

**Off the beaten path:**

- **`arp down 6`** is the same run read backwards, so a descent starts at the top
  rather than at the root. `arp updown 8` walks up and back, A C E C A C E C, and
the whole walk climbs an octave each time round.
- **`arp 8 up`** — the direction and the count may be written in either order, and
  `asc`/`descending`/`both` are aliases for the three words.
- **`repeat 4`** on an `arrange` line plays the section before it four times in
  all, which is how a four-bar chorus becomes a chorus.
- **A last-beat fill** is not a word yet: write it as a roll — `A-6*8` on a channel
  with `hold 4` is eight hits across the bar — or as a run of `note` lines.

---

## 19. A fill in one line

**What you want:** the last beat of a bar to be a roll, without typing the same
hit four times — and a phrase in the second half that answers the first an octave
up, without transposing it by hand.

```script
new
song "ONE LINE FILL"
key A minor
tempo 128
tracks 4

track 1 "KICK"  voice kick
track 2 "SNARE" voice snare level 80
track 3 "HAT"   voice hat level 45
track 4 "BASS"  voice bass level 65 hold 2

pattern 1 "GROOVE"
C-1 .   C-6 A-2
.   .   .   .
C-1 .   .   .
.   .   C-6 .
C-1 .   C-6 A-2
.   .   .   .
C-1 .   .   .
.   .   C-6 .
C-1 .   C-6 A-2
.   .   .   .
C-1 .   .   .
.   .   C-6 .
note 12 2 C-3 60       # the fill, written ONCE...
rows 12 to 12 repeat 4  # ...and played on all four steps of the last beat
```

**What each line is doing.** The grid is three bars of the same groove, and the
last beat of the fourth is the only thing that changes. `note 12 2 C-3 60` writes
one soft snare on the first step of that beat — and `rows 12 to 12 repeat 4` says
"that one row, four times in all", so the same hit lands on steps 12, 13, 14 and
15. Four rows of typing became one row and one line.

The count is how many times the figure plays **in all**, not how many extra copies
it gets: `repeat 4` of a one-row figure is four steps, and `repeat 4` of a
four-row figure is a sixteen-row bar. That is also the check worth doing in your
head before you paste it — four rows played four times needs sixteen rows, and a
pattern only has `steps` of them.

**Off the beaten path:**

```text
rows 0 to 3 octave up      # the same four steps, an octave higher
rows 8 to 15 octave down   # the second half, an octave lower
rows 0 to 1 repeat 8       # a two-row figure tiled across the whole bar
rows 12 to 15 roll         # the last four steps, four hits inside each
```

- **The other transformation is `octave`.** `rows 0 to 3 octave up` moves the
  PITCH and nothing else — the velocities, the slides and the rolls all travel
  with the notes — which is how you write an answering phrase without retyping it.
  A note that would leave `C-0`..`B-8` is clamped into it rather than refused.
- **The loud one is `roll`.** `rows 12 to 15 roll` is a `*4` written on every hit
  of those four steps at once — a snare fill, a drum roll, a trap hat — and
  `rows 12 to 15 roll 6` says how many hits each step becomes (2–8, four by
  default). It is the same field the `*N` suffix sets, so it sounds the same, and
  a step with no hit in it is left empty: a roll ornaments a figure rather than
  inventing one. Put the hits where you want them first, then roll the range.
- **A range acts on the pattern `pattern` selected**, the way `note` and `erase`
  do, and it has to stay inside the grid. If the bar is longer than sixteen steps,
  write `steps 32` ABOVE the `rows` line.
- **`repeat` here is not `arrange … repeat`.** One tiles rows inside a pattern; the
  other plays a SECTION again in the song's form. Same word, two scopes.
- **A range and a grid row can be combined** in one bar: write the figure as grid
  rows for the part a person reads, and use `repeat` for the part that is
  obviously the same thing again.

---

## 20. A triad in one cell

**What you want:** a piano, an organ or a pad that plays chords — and one channel
to do it with, rather than the three a triad used to cost.

```script
new
song "ONE HAND"
key C major
tempo 96
tracks 4

track 1 "KEYS"  voice pluck hold 4 poly 4 level 65 verb 25
layer 1 2 wave sine octave 1 gain 40
track 2 "BASS"  voice bass  hold 2 level 70
track 3 "PAD"   voice pad   hold 16 level 35

track 1 poly 4

pattern 1 "VERSE"
C-4,E-4,G-4 . . .
A-3,C-4,E-4 . . .
F-3,A-3,C-4 . . .
G-3,B-3,D-4 . . .
```

**What each line is doing.** `track 1 poly 4` says the channel may hold four notes
at once — the one setting a chord in a cell needs. `C-4,E-4,G-4` is then ONE cell
of three notes rather than three columns of one, and because the channel's `hold`
is 4 the chord rings for four steps: a hand resting on a chord rather than a
machine stabbing three parts at the same instant.

The order of those two things matters. The `poly` line is read where it is
written, so it goes **above** the chords; below them the language refuses:

```text
tracks 1
C-4,E-4,G-4           # -> this cell holds 3 notes, but channel 1 sounds 1 at a time…
track 1 poly 3        # too late — this line is below the chord
```

The refusal is the point of the feature rather than an obstacle to it: a cell is
one EVENT, so its notes are either heard together or not at all, and a channel
holding one note would play the top of the triad and drop the other two with no
sound of anything being wrong.

**Off the beaten path:**

- **`chord 0 1 Am` writes the same cell.** On a channel wide enough for the whole
  chord, the chord tool puts its notes in ONE cell; on a channel that holds one
  note at a time it spreads them across the channels after the root, exactly as it
  always did. One line, and the channel's width decides which.
- **A chord is just notes, so the range statements move it whole.**
  `rows 0 to 3 octave up` transposes all three notes of every chord in those rows,
  which is how a four-chord verse becomes a chorus without retyping it.
- **Up to 8 notes**, the same ceiling a channel has, and no pitch twice: `C-4,C-4`
  is one note, not a doubled one.
- **The grid shows `C-4+2`.** Three characters hold one pitch, so a chord wears
  `+N` for the notes beside it, and the inspector under the grid spells the whole
  cell out — `KEYS · STEP 00 · C-4 E-4 G-4` — which is where you look to see the
  voicing you wrote.
- **Pressing a key writes ONE note.** Typing over a chord replaces it, the same way
  it replaces a slide: a cell is written whole, so a hand pressing a key never
  finds the old chord still under the new note. With `CHORDS` on, the key writes
  the chord — into one cell when the channel is wide, across channels when it is
  not.

**An open tuning is this, plus a `hold`.** A tracker has no strings and no
fretboard, so "tuned to FACGCE" cannot mean here what it means on a guitar — and
it does not have to, because the thing a player is after is one cell: the open
pitches sounding together on a channel wide enough to hold them and long enough
to let them ring, while the shapes move on another channel. That is midwest emo's
whole texture, and it needs no new word:

```script
new
song "OPEN STRINGS"
key C major
tempo 96
tracks 3

track 1 "STRINGS" voice glass  poly 6 hold 16 level 40 verb 50
track 2 "TAPS"    voice pluck  poly 3 hold 2  level 62
track 3 "BASS"    voice bass   hold 4        level 68

pattern 1 "VERSE"
F-2,A-2,C-3,G-3,C-4,E-4   D-4,E-4,F-4   C-3
.                          .             .
.                          .             .
.                          .             .
F-2,A-2,C-3,G-3,C-4,E-4   D-4,F-4,A-4   G-2
.                          .             .
.                          E-4,G-4,B-4   .
.                          .             .
```

**What each line is doing.** `track 1 poly 6 hold 16` is the whole "open tuning":
the six pitches FACGCE written as ONE cell, ringing for the sixteen steps of the
pattern, which is what a hand does when it lets the strings go. `track 2` is the
finger picking a shape out above them — `poly 3` because the tapping is in
three-note clusters, `hold 2` because a tap is short — and because it is a
DIFFERENT channel, its notes never compete with the drone for a voice: the open
strings are an instrument of their own here, which is exactly how an alternate
tuning behaves in a room.

Two things follow from that, and both are worth knowing before reaching for a
character effect to fix what is really an arrangement problem:

- **The drone is a channel, so it can be mixed, panned and widened like one.**
  `verb 50` on the strings and `hold 2` on the taps is the emo space, and neither
  number is doing anything subtle.
- **Retune by editing the cell, not by adding a control.** Change those six
  pitches and the same taps sit over DADGAD; that is one line of text and no
  engine work at all.

---

## 21. A whole kit on one channel

**What you want:** a beat that reads like a drummer wrote it — and one channel to
hold the whole kit, rather than one fader per drum.

```script
new
song "ONE CHANNEL KIT"
tempo 124
kit 808
tracks 2

track 1 "DRUMS" level 80
track 2 "BASS"  voice bass hold 2 level 70

pattern 1 "BEAT"
kick  C-2
.     .
snare C-2
.     .
kick  .
kick  .
snare .
hat*3 .
```

**What each line is doing.** `kick`, `snare`, `hat` and `wind` are the four words
a cell may use instead of a pitch: each NAMES its sound, so ONE channel plays the
whole set. The kit's own note is written for you — a kick is MIDI 36, a snare 38 —
which is why the grid prints `KCK` and `SNR` rather than pitches nobody can hear,
and why an export to MIDI needs no translation at all. `hat*3` is the trap roll:
three ticks inside one step, the last one landing where the note would have ended.

**Off the beaten path:**

- **`kit 808` chooses the drums.** The line above the channels says the whole set
  at once: a long deep kick, a tight snare, a crisp tick. `kit brush` is the same
  beat played with wire brushes and `kit rock` the same beat on a big live kit —
  no note moves, because a kit changes the SOUND and never the pitch. `kit studio`
  is the four presets, which is also what a song that says nothing gets.
- **A hit takes a force**, exactly like a note: `snare~70` is a soft backbeat and
  `kick~100` the accent that carries the bar. The ghost notes are where a beat
  stops sounding programmed.
- **The `drum` statement patches ONE cell** of a pattern you already have —
  `drum 8 1 hat *3` is the same hit, addressed by row and channel, and it is handy
  after `copy`. On a `drum` LINE the gesture is its own value; the attached
  spelling (`hat*3`) belongs to a grid row.
- **A drum has no pitch to move.** `rows 0 to 3 octave up` transposes the notes of
  a range and leaves the hits exactly where they are — what a real arrangement does
  when a section rises.
- **The long way still works.** A channel with `voice kick` is a kick, and three of
  them are a kit one drum per channel — still the right answer when each drum wants
  its own level, pan or room. A kit channel is for when the beat belongs together.
- **Read it as lanes.** A row of `kick . snare .` is a beat as words; `F8` on the
  kit channel is the same beat as four lanes of marks, and a click in a lane writes
  that hit on that step. Same song, two ways of looking at it — the script for a
  file you are sending, the lanes for a beat you are counting out loud.

---

## 22. Your own recording on a channel

```script
new
song "SOMEBODY ELSE'S DRUM"
tempo 96
steps 16
tracks 3

# Bring YOUR file into the app, then name it on a channel.
sample load "samples/break.wav"

track 1 "BREAK" wave sample duty 10 sample break
track 2 "BASS"  voice bass
track 3 "KEYS"  voice pluck

pattern 1 "A"
C-4 .   .
.   .   .
.   E-2 .
.   .   G-3
C-4 .   .
.   .   .
.   B-1 .
.   .   C-4
```

**What it does.** `sample load` reads a `.wav` into the app, and then the channel
is an ordinary tracker channel that happens to play YOUR audio: `sample break`
naming the file, `wave sample` saying which of the channel's layers plays a
one-shot. The break is transposed exactly like a sample in any tracker — `C-4`
plays the file as recorded, `D-4` is the same break a whole tone up.

**Where the file goes.** Nowhere near the song. (`sample load` is the script door;
`F2 → SAMPLES…` is the other one, where the first row picks the file and `Enter`
on a loaded recording gives it to the channel the cursor is on.) The audio lives in the app (8
recordings at most, 30 seconds each) and the song holds the name `break`, which is
why the script above is four lines of text you can send to somebody rather than a
five-megabyte attachment. Open it on a machine that has never seen
`samples/break.wav` and every channel still plays — the break channel falls back
to the built-in one-shot for its `duty`, so the beat is a different colour rather
than silence.

**Points worth knowing.**

- **Name the wave too.** `wave sample` a channel and give it a `sample` name; a
  channel on `voice pad` ignores the reference, so a stack keeps its own sound.
- **`duty` is still doing something**: it picks the sound you hear when the file
  is missing. Set it to whatever the built-in one-shot nearest your recording is,
  and the fallback stops sounding like a mistake.
- **The interesting half is the seams.** A loaded break plus `rows` is a
  chopper: `rows 0 to 3 repeat 2` plays the first beat twice, and `*3` rolls any
  hit inside a step.
- **No root-note knob, on purpose.** A WAV does not say what note it is, so the
  app assumes middle C for every sample — the same assumption its built-in
  one-shots make — and the tune is decided by where you write the notes.
- **Mono.** A stereo file arrives folded to one channel, because the channel
  already has a `pan`.

---

## 22b. Record a hook and render a chorus

```script
new
song "HOOK AND CHORUS"
key A minor
tempo 110
steps 16
tracks 3

# Capture a hook, shape it, and give it to a channel.
record HOOK                     # the microphone, on the RECORDER page
record trim HOOK 0.1 2.0
record loop HOOK 0.5 1.5

track 1 "HOOK" wave sample duty 10 sample HOOK
track 2 "BASS" voice bass level 68
track 3 "PAD"  voice pad  level 45 hold 4 poly 2

pattern 1 "A"
A-4 .   A-2,E-3
.   .   .
C-5 .   C-3,E-3
.   .   .

# Mark what an export renders and how loud, then leave the recorder showing.
export bars 1 to 1 loud -14
page recorder
```

**What it does.** `record HOOK` captures from the microphone, `record trim` and
`record loop` shape the take's window in seconds from its own start, and then the
channel plays it exactly like a loaded file (`sample HOOK` on a `wave sample`
layer). The last two lines are the OUT half: the region and loudness the three
export buttons use, and `page recorder` so the screen it applies to is the one the
take was made on.

**The take is APP state, and so is the recording.** Neither is in the song: the
bytes live beside the sample bank, `Ctrl+Z` never banks a capture, and
`SAVE AS SCRIPT` writes the `sample HOOK` REFERENCE rather than the audio. So the
script above is a few lines you can hand somebody — and on a machine that has no
take called `HOOK`, the channel simply falls back to the built-in one-shot for its
`duty`, exactly as a missing sample always does.

**Points worth knowing.**

- **A capture needs a browser and a microphone**. A build without one refuses the
  line in words rather than doing nothing; `record trim`/`record loop` still apply
  to a take you already have (they only need the app's take list).
- **The trim is a WINDOW, not a cut.** Your `.wav` is untouched; the window is
  applied whenever the take plays.
- **The page is the other door.** `page recorder` draws the same numbers as a
  waveform with handles you drag, and its `EXPORT WAV` / `STEMS ZIP` / `EXPORT
  MIDI` buttons run the identical exports `F2 → EXPORT…` runs.

---

## 23. One chord loop under the whole song

The recipe that saves the most typing: four chords written ONCE, and every part
that plays them hanging on that one line. Sixteen bars of harmony in three lines.

```script
new
song "ONE LOOP, FOUR PARTS"
tempo 100
tracks 4

# the loop: i - VI - iv - v in A minor, one chord a beat
progression 1 6 4 5

track 1 "KEYS" voice pad  hold 8 poly 3 level 45
track 2 "BASS" voice bass level 70
track 3 "LEAD" voice pluck level 90
track 4 "HAT"  voice hat  level 30

chord 0 1 follow      # A, F, D, E — one chord a beat, ringing into the next
note  0 2 follow      # the same four roots underneath it

pattern 1 "A"
. . E-5 .
. . .   .
. . .   C-6
. . .   .
. . C-5 .
. . .   .
. . .   C-6
. . .   .
. . D-5 .
. . .   .
. . .   C-6
. . .   .
. . B-4 .
. . .   .
. . .   C-6
. . .   .
```

**What it does.** `progression 1 6 4 5` is the loop, said in the SONG'S KEY rather
than by name: in A minor that is Am, F, Dm, Em — and the same four numbers are the
same four chords in any key the song is later moved to. `chord 0 1 follow` writes
those chords on channel 1, `note 0 2 follow` writes their roots on channel 2, and
the lead and hat are ordinary grid rows on top. The keyboard channel says `poly 3`
because a follower writes each chord into ONE cell, and `hold 8` on it is what
makes each chord ring over the beat that follows.

**Change one thing.** `progression 1 6 4 5` → `progression 1 6 4 5 hold 8` halves
the rate: two chords to the bar, sixteen bars of harmony out of one 16-step
pattern. Or set `steps 32` and let the loop play twice.

**Points worth knowing.**

- **The `progression` line goes ABOVE its followers.** A follower snapshots the
  loop where it stands, so the loop it plays is the one the lines above it said.
- **`hold N` is a number of STEPS, and it goes last.** The default is 4 — one beat
  at the default grid — which is what makes four chords fit one bar.
- **A follower writes to the END of the pattern**, one chord every `hold` steps.
  `chord 4 1 follow` starts the loop halfway in, which is how a chorus gets the
  second half of a progression.
- **The notes are real notes.** The loop writes cells, so the grid, the note count,
  `Ctrl+Z`, `SAVE AS SCRIPT` and a MIDI export all see an ordinary song — the loop
  is what YOU keep working on, and what comes back from a follower is a part.
- **No loop, no problem.** A song with no `progression` is unchanged, byte for
  byte; `progression none` is the line that takes one back off.

---

## 24. Starting from a genre

A blank grid with eight voices, a drum kit, a chord loop and an arrangement
available is a studio with no song in it, and that is the hardest place to begin.
So nine whole songs ship with the app, one word each. The first three are the
ones to meet first:

```script
start house
```

```script
start lofi
```

```script
start ballad
```

and the other six are the genre shelf — the same mechanic aimed at rock, emo and
the electronic end of the eighties:

```text
start rock        start emo         start vaporwave
start synthwave   start shoegaze    start dnb
```

Each one writes a **complete, working song** — a key, a tempo, a feel, a kit,
named channels with the right sounds on them, a beat, a chord loop and a form —
using the statements every other recipe here uses, so there is nothing new to
learn to read it. `start house` and then `Space` is a track rather than an
exercise; press **`SAVE AS SCRIPT`** afterwards and the skeleton comes back as
lines you can edit. (`F2 → STARTERS…` is the same three by hand, and
[the reference](03-script-reference.md#start-name--begin-from-a-whole-worked-skeleton)
is the statement itself.)

**A starter is a beginning, not a mode.** It writes ordinary lines, so
everything in this file applies to what it leaves: move a cell, change a number,
delete a channel, paste another recipe over the top. There is no starter file
format and no hidden preset — a song that began from one saves as the version its
own features need.

**What each one decides, in one line:**

| Start with | What lands on the grid |
| --- | --- |
| `start house` | 124 BPM, `groove offbeat`, an 808 kit shared through one `bus DRUMS`, four on the floor with a clap on 2 and 4, an offbeat stab, a `poly 3` pad playing `Am F C G` a chord a beat, and a 52-bar form with a drums-only break in it. |
| `start lofi` | 78 BPM, `swing 55`, `groove laid-back`, brushed drums, a bass that walks the roots, a `poly 4` organ on `Am7 Dm7 Fmaj7 Cmaj7`, `tape 40` on the keys under `master tape 25 vinyl 12`, and a form that repeats the loop instead of going anywhere. |
| `start ballad` | 72 BPM, `steps 32`, one kit channel for the whole beat, a `glass` piano on the loop with strings under it — both written by the two followers — and a hand-written flute melody above. |
| `start rock` | 140 BPM, `groove backbeat`, the `rock` kit behind one `bus DRUMS`, a `pluck` channel with `drive 55 cab 65` and `poly 3` whose POWER CHORDS are written by the loop, an eighth-note `bass` with `drive 30` under it, and a `lead` for the hook. |
| `start emo` | 96 BPM, `swing 52`, `groove laid-back`, brushed drums, and a `glass` channel with `hold 4` that a `chord … arp up 8` climbs — the tap, which rings because the channel holds. |
| `start vaporwave` | 62 BPM and half time, an 808 kit, a `poly 4` pad on `AM7 F#m7 DM7 E7` at `verb 65 tape 30`, a `sub` bass on the roots, a `bell` melody with `hold 4 tape 20`, and `master tape 25` over the lot. |
| `start synthwave` | 108 BPM, `groove backbeat`, four on the floor, a `strings` pad at `chorus 65` holding the loop, and a `pluck` arpeggio (`chord 0 6 Am arp up 8`, then `F arp down 8`). |
| `start shoegaze` | 88 BPM, a `strings` WALL with `drive 35`, `cab 45` and `chorus 70` under `hold 8` major-seventh chords, a slow kit, and a `glass` melody at `verb 55` inside the noise. |
| `start dnb` | 174 BPM, an 808 kit on a BROKEN beat, a `lead` with `shape nasal gate 60` for the stab, a `sub` bass on the roots, and a `glass` channel at `hold 16` under all of it. |

**`start house`** — the dance skeleton. The first three channels are one unit: a
kick, a hat and a clap on `bus DRUMS 80`, so "the drums are too loud" is one
number rather than three ([recipe 17](#17-one-fader-for-a-kit)). The kick is on
every beat, the hat on every offbeat (that is the pocket `groove offbeat` leans
into), and the clap on beats 2 and 4, where a room would clap. Under it the bass
is `voice sub` on the chord roots and the pad is `poly 3`, because a follower
writes each chord into ONE cell and `hold 8` is what makes that cell ring over
the beat that follows ([recipe 23](#23-one-chord-loop-under-the-whole-song)); the
sixth channel is the house gesture — three or four stab notes on the offbeats and
no melody at all. The form is a drums-only bar, twenty-four bars of groove, two
bars of break, twenty-four more and a turnaround, which is one `arrange` line and
a break pattern ([recipe 16](#16-write-the-whole-songs-form-at-once)).

**Change these first:** `tempo`; the `STAB` notes, which are the hook; how long
each groove runs (`repeat 6`); and the loop itself — a new `progression` line only
reaches the grid if a `chord … follow` line reads it
([recipe 23](#23-one-chord-loop-under-the-whole-song)). One trap is worth knowing
before you try that: a starter leaves the cursor on the LAST pattern it wrote
(`start house` on the break, `start ballad` on the chorus), so a follower added
after the starter writes THERE until you select the pattern you meant. **The habit:** a house record is a TRACK,
not a song — the same bar for a minute with one break and one turnaround is the
genre. Before you add a pattern, take something out.

**`start lofi`** — the loop that repeats. Three words are most of the genre:
`swing 55`, `groove laid-back`, `kit brush`. Its chords are written by NAME
(`Am7 Dm7 Fmaj7 Cmaj7`) rather than by degree, so the loop means exactly those
four chords wherever the song's key later goes — `progression 1 6 4 5` would
follow the key instead. The bass walks their roots, one per bar, hand-written,
because a lofi bass is a player rather than a copy of the chord above. The beat
is kick on 1 and 3, snare on 2 and 4, hat on every offbeat, and the chorus bar
adds a second kick and an extra snare instead of new notes: the same bar, played
a little harder. It is also the starter with both MEDIUMS on it — `tape 40` on the
keys and `master tape 25 vinyl 12` over the record — which is the fourth thing
most of the genre is: the tape makes it warm, and the light `vinyl` under it is
what makes it sound FOUND rather than merely recorded.
**Change these first:** `swing` (the feel IS the song),
the keys' `verb 45` and `tape`, and whether the loop is four seventh chords or four triads —
a `poly 4` channel is what lets a seventh fit in one cell
([recipe 20](#20-a-triad-in-one-cell)). **The habit:** lofi is a mood, and the
mood lives in the kit, the swing and the reverb rather than in the notes. Set
`kit 808` and `swing 0` on the same four bars and it is a different record.

**`start ballad`** — the loop, played by hand. `steps 32` makes the pattern two
bars, which is what gives a phrase room to finish
([recipe 8](#8-two-bars-in-one-pattern)). One channel holds the whole kit and the
beat is written as the words `kick`, `hat` and `snare` in a single column
([recipe 21](#21-a-whole-kit-on-one-channel)), so the drums cost one fader rather
than four. Then the same loop feeds two parts from two lines: `chord 0 3 follow`
puts its chords on the piano (`voice glass`, `hold 8`, `poly 3`) and
`note 0 4 follow` puts its roots on the strings (`hold 16`). `octave 3` sits above
them because a follower writes at whatever octave the script is standing in, and
that one number is the difference between a piano and a piccolo. The bass moves
once a bar and the melody speaks only in the second half of each bar, where a
singer would breathe. **Change these first:** the melody notes — that is the song
— then `swing 45` and the chord names in the loop. **The habit:** in a slow piece
everything except the loop must be sparser than it feels like it should be. Four
chords held a bar with one melody note over each is a ballad; the same chords with
a channel playing every step is a wash.

**Same skeleton, another genre.** Because a starter is only lines, the fastest
remix is a few song-level numbers on top of one. Four lines turn the house
skeleton into a slow broken beat — the notes do not move, the kit and the pocket
do:

```script
start house
tempo 82
swing 55
kit brush
groove laid-back
```

And a lane is the other half of a skeleton: `start ballad` plus one `automate`
line opens the piano's tone across the back half of the song, which no number in
the starter could say ([recipe 15](#15-build-a-riser-that-lands-on-the-drop)):

```script
start ballad
automate 3 bright 20 100 bars 5 to 16
```

**What a starter will not do.**

- **It will not merge.** Every starter begins with `new`, so `start house` placed
  under lines of your own DISCARDS them, exactly as typing `new` there would —
  which is why a starter always produces the same song no matter what was on
  screen, and why a file's meaning never depends on what happened to be open.
- **It does not remember that it was one.** `SAVE AS SCRIPT` writes the SONG
  back out — patterns, loop, form, all of it — and never the word `start`, so a
  file that began from a starter reads as an ordinary script. See
  [song files](09-song-files.md).
- **It brings no file version of its own.** A started song is saved at whatever
  version its own features need, and the starter is what the song STARTED as
  rather than what it is.
- **It is not the only way in.** Recipes 1–23 and 25 are one idea at a time, which is
  how the parts are learned; a starter is the parts already assembled, which is
  how the SHAPE is learned. [The examples](06-examples.md) are whole songs
  written by hand, for the reader who would rather see it spelled out.

---

## 25. A beat on the drum machine

**What you want:** a four-on-the-floor beat with a trap hat, on an instrument of
its own rather than one channel per drum — and a bassline under it.

```script
new
song "MACHINE BEAT"
tempo 124
tracks 2

track 1 "BASS" voice bass  level 70
track 2 "STAB" voice strings level 45 hold 2

machine steps 16 beat 4 level 85 duck 30
pad 1 "KICK"  voice kick  level 100 pattern "9...9...9...9..."
pad 2 "SNARE" voice snare level 90  pattern "....9.......9..."
pad 3 "HAT"   voice hat   level 55  pattern "9.9.9.9.9.9.9.9."
pad 5 "TOM"   wave membrane tune -4 pattern "............9..9"

pattern 1 "A"
C-2 .
.   C-4
C-2 .
.   E-4
```

**What each line is doing.** `machine …` sets up the instrument — its own fader,
its own swing, its own sends — and every `pad N …` is one LANE of it: a sound, a
place in the mix, and a row of hits. The row is the same `1`–`9`-or-`.` string the
tab draws: `9...9...9...9...` is a kick on every beat, `9.9.9.9.9.9.9.9.` is a hat
on every eighth, and the two hits in the tom's row on steps 12 and 15 are the
flourish. `duck 30` is the house gesture: the machine pushes the rest of the mix
down while it plays, which is what makes the bass feel like it is pumping.

**A pad is a sound, not a drum.** `pad 5 "TOM" wave membrane tune -4` is a tom
built from a wave and a tuning rather than a name on the kit's list — the machine
can hold a crash, a clap, a rim, anything the nine knobs make. `tune` is measured
from that pad's kit pitch, so the tom's own note stays the tom's note and `-4`
moves it four semitones down.

**Why it beats four channels.** The whole beat is one instrument, so it has one
fader, one swing, one duck and one set of effects — you tune the beat as a unit
instead of balancing a kick against a snare against a hat. Reach for one channel
per drum (recipe 21) when each drum wants its own room; reach for the machine
when the beat belongs together.

**Change one thing:** `pad 3 "HAT" … pattern "9.9.9.9.9.9.9.9."` →
`pattern "9.9.9.9.9.9.9.9.9.9.9.9.9.9.9.9"` for sixteenth hats, or add
`pad 6 "CLAP" wave noise bright 85` for a clap on 2 and 4. In the tab, `X` widens
the pattern and a digit key sets a hit's force without touching the row.

---

## 26. A build you can see

A build is written with `automate` (recipe 15), and the **ARRANGER** page is where
you see it: the form as section bands, one row per channel with a pattern block
and a note preview each bar, and the lane drawn as a curve over the same bar grid.
Ending the script with `page arranger` opens the timeline, so the movement you
just wrote is the thing on screen rather than a line to hunt for.

```script
new
song "SEE THE BUILD"
tempo 126
tracks 3

track 1 "PAD"  voice pad  hold 4 level 45
track 2 "BASS" voice bass hold 2 level 65
track 3 "LEAD" voice lead level 100

section VERSE 1 1 2 1
section CHORUS 3 4 3 4
arrange VERSE VERSE CHORUS CHORUS

# the filter opens across the second verse, and HOLDS open into the chorus
automate 1 bright 15 95 bars 3 to 6

pattern 1 "V"
C-3 C-2 E-4
.   .   .
E-3 A-1 G-4
.   .   .

pattern 2 "V2"
C-3 C-2 C-5
.   .   .
E-3 A-1 B-4
.   .   .

pattern 3 "C"
A-3 A-1 A-4
.   .   .
C-4 C-2 C-5
.   .   .

pattern 4 "C2"
G-3 G-1 G-4
.   .   .
A-3 A-1 A-4
.   .   .

page arranger
```

**What the timeline shows.** Four section bands, `VERSE (01-04)` then `CHORUS
(05-08)`; the `BAR` and `PATTERN` rows agreeing with the `arrange` you wrote; a row
per channel — PAD, BASS, LEAD — each bar a block labelled with its pattern number
and a preview of that channel's notes; and, under `AUTOMATION · PAD · BRIGHT`, a
line climbing from bar 3 to bar 6 and then holding flat at 95 to the last bar.
That flat tail is the point of a lane: the chorus arrives bright and stays it.

**Change one thing:** drag either handle to reshape the build (one `Ctrl+Z`), or
change `automate 1 bright 15 95 bars 3 to 6` to `automate 1 level 20 100 bars 5 to
8` for a fade-in instead. `TAB` cycles the target the editor is showing; `+ ADD
LANE` adds one beside it. The page writes exactly the lane `automate` writes, so
`F2 → SAVE AS SCRIPT` prints it back as a line, not as a special case.

---

## 27. Habits worth copying

Not a script to paste — a checklist to keep. These five habits are what
distinguish a loop that sounds composed from one that sounds generated:

```text
# 1. write one bar that works on its own
# 2. copy it, then patch 2-4 cells for the second section
# 3. keep a register free for the lead
# 4. leave at least one silent step in every channel
# 5. write ONE line that moves, and let everything else hold still
```

Points 3 and 4 are the ones machine-written loops get wrong most often. Two
channels in the same octave, both playing every step, always sounds like noise,
no matter how correct the notes are. And point 5 is the musician's answer to
point 4: a pedal bass with a moving melody reads as arrangement; two busy
channels read as a mistake.

---

## 28. A live set you can launch

Playing a song live is a different job from writing one. The **LIVE** page is a
launch grid: one row per **scene**, each row a pattern per channel plus the
drum-machine bar it performs. Press a row's play button and it QUEUES; it takes
over on the next bar (or whatever `live quantize` asks for), so a launch lands on
the beat rather than mid-bar. A scene is a VIEW of the song's own patterns —
nothing is copied — so editing a pattern changes every scene that plays it.

```script
new
song "LIVE DEMO"
key A minor
tempo 124
tracks 2
track 1 "LEAD" voice lead
track 2 "BASS" voice bass
pattern 1 "VERSE"
A-5 A-2
pattern 2 "CHORUS"
C-6 C-3
scene VERSE 1 1
scene CHORUS 2 2
live quantize 4
page live
```

**What the lines did:** the two `scene` rows are the two launch rows — `VERSE`
plays pattern 1 on both channels, `CHORUS` plays pattern 2 on both — and
`live quantize 4` makes a launch wait for the next four bars. `page live` opens the
grid, the same screen the tab dropdown shows.

**Change one thing:** `scene BREAK 1 -` adds a third row whose second channel is
silent, so a scene can drop a part without touching the pattern. A `kit 2` on any
row makes that scene perform drum-machine bar 2 as well, and `kit off` sits the
beat out for it.

**By hand:** on the LIVE page, `ARROWS` (or `WASD`) select a cell, `SPACE`
launches its scene, `ENTER` auditions the selected clip, `[` and `]` step a clip
through the patterns, `DEL` silences it, `Q` walks the quantize and `E` flips
between PERFORM and EDIT. `N` adds a scene, `+ SCENE` at the foot of the grid does
the same, and `STOP ALL` returns to the song's own `order` at the quantized
boundary. Everything you launch is a performance — it is never saved to the song.

---

## 29. A chord loop you can hear as a run

**What you want:** to DIAL an arpeggio — try a direction, a range, a speed — and
hear it before committing it, the way you would turn a knob on a synth rather
than type a line and hope. The **ARP** page is that: five dials, a live preview,
and one button that writes the run you have been listening to.

```script
new
song "ARP DEMO"
key A minor
tempo 120
tracks 1
track 1 "KEYS" voice pluck hold 1 level 70
pattern 1 "A"
arp direction updown
arp octaves 3 rate 2 gate 60
arp write 0 1 Am
arp hear on
page arp
```

**What each line did.** The three `arp …` lines STORE the dials in the song — the
settings the page draws — and `arp write 0 1 Am` commits the run those dials
describe into the cursor's cell: the same notes `chord 0 1 Am arp up 8` writes, but
taken from the song rather than from the line, so the settings can be reopened and
tuned later. `arp hear on` is a SESSION switch (like `page`): with it on, the page
auditions the run as its dials move, so you dial by ear. `page arp` opens the
screen. A song that stores any dials writes an `arp` key at file version `42`.

**Change one thing:** `arp mode source` makes the run walk the song's own
`progression` loop instead of the chord under the cursor. `arp off` clears the
stored dials, leaving the notes where they are — an arp is cells once written, not
a link back to its dials — so the song writes the file it did before you ever
opened the page.

**By hand:** on the ARP page, `UP`/`DOWN` (or `LEFT`/`RIGHT`) pick a dial, `[` and
`]` move it, `ENTER` auditions the whole run note by note, `W` writes it into the
grid in ONE undo step, and `ESC` returns to the tracker. The PREVIEW on the right
redraws from the same `generateArp` a `write` commits, so what you see is exactly
what you will get. Nothing on the page is a performance: the dials are song data
and the run is ordinary cells.
