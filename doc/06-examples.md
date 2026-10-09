# 06 — Complete examples

Whole songs, top to bottom. Every block is a valid script and is checked by
`tracklet/src/__tests__/docs.test.ts`, so nothing here has quietly rotted.

Each one is followed by the reasoning — *why* these notes in this order — because
the notes are the easy part to copy and the reasoning is the part that transfers.

---

## Example 1 — The shipped example

This is what the SCRIPT panel's **LOAD EXAMPLE** button loads: one bar of
`Am → F → C → G` with a lead on top. Start here.

```script
# TRACKLET SCRIPT - paste this box and press APPLY.
# A line with no command word is a GRID ROW: one step per line,
# one column per track. "." leaves that column empty for that step.

new
song "FIRST SCRIPT"
key A minor
tempo 128
tracks 4

track 1 "LEAD" voice lead
track 2 "BASS" voice bass level 65
track 3 "PAD"  voice pad hold 4 level 45
track 4 "HAT"  voice hat

pattern 1 "VERSE"

A-4 A-2 E-4 C-6
C-5 .   .   .
E-5 .   .   C-6
C-5 .   .   .
F-4 F-2 C-5 C-6
A-4 .   .   .
C-5 .   .   C-6
A-4 .   .   .
C-5 C-3 G-4 C-6
E-5 .   .   .
G-5 .   .   C-6
E-5 .   .   .
G-4 G-2 D-5 C-6
B-4 .   .   .
D-5 .   .   C-6
B-4 .   .   .
```

**What is going on**

| Step | Channel 1 (LEAD) | Channel 2 (BASS) | Channel 3 (PAD) | Channel 4 (HAT) |
| --- | --- | --- | --- | --- |
| 0 | `A-4` | `A-2` | `E-4` | `C-6` |
| 1 | `C-5` | — | — | — |
| 2 | `E-5` | — | — | `C-6` |

- **Every beat (steps 0, 4, 8, 12)** all four channels can speak: the bass states
  the root, the pad states a chord tone, the hat ticks, and the lead starts a new
  figure.
- **The lead walks a chord tone per beat**: `A → F → C → G` underneath, so
  `A-4 / F-4 / C-5 / G-4` all sit on their chord. Nothing clashes because every
  melody note is a chord tone.
- **`C-6` on the hat is on the offbeats** (2, 6, 10, 14) or the downbeat — a tick
  on every step would be a woodpecker.
- **Bare 4 × 4 structure**: four beats, one chord each. Sixteen steps (the
default grid), four channels, and you can hear both. A two-bar version of this
bar is one `steps 32` line and sixteen more grid rows.

**Try:** change `tempo 128` to `tempo 100`. Then change `track 3 "PAD" voice pad`
to `voice strings`, or add `bright 30` to a line, and hear the bar change
instrument. Every channel's sound is a voice plus nine knobs — press `F4` in the
app to see the same thing as a list.

---

## Example 2 — A three-section arrangement

One bar is a loop. This is a **piece**: a verse, a hook that adds a lead line, and
a sparse break, built by writing one good bar and using `copy` twice.

```script
new
song "NEON STAIRS"
tempo 124
tracks 4

track 1 "BASS"  wave triangle
track 2 "CHORD" wave saw
track 3 "LEAD"  wave square
track 4 "TICK"  wave sine

# --- section A: bass, chord stab and tick, no lead -------------------------
pattern 1 "VERSE"
A-2 E-4 . C-6
.   .   . .
.   .   . C-6
.   .   . .
F-2 C-5 . C-6
.   .   . .
A-3 .   . C-6
.   .   . .
C-3 G-4 . C-6
.   .   . .
.   .   . C-6
.   .   . .
G-2 D-5 . C-6
.   .   . .
G-3 .   . C-6
.   .   . .

# --- section B: the same bar, plus a lead ----------------------------------
copy 1 2
pattern 2 "HOOK"
note 0 3 A-4
note 2 3 C-5
note 4 3 C-5
note 6 3 A-4
note 8 3 G-4
note 10 3 E-5
note 12 3 D-5
note 14 3 B-4

# --- section C: strip it back to the floor ---------------------------------
copy 1 3
pattern 3 "BREAK"
clear 3
A-2 . . C-6
.   . . .
.   . . .
.   . . .
.   . . C-6
.   . . .
.   . . .
.   . . .
F-2 . . C-6
.   . . .
.   . . .
.   . . .
.   . . C-6
.   . . .
.   . . .
.   . . .
```

**How it is built, in order**

1. **`pattern 1 "VERSE"`** and a full bar. This is the only bar written by hand;
   the rest is derived.
2. **`copy 1 2`** duplicates it, *then* `pattern 2 "HOOK"` selects the copy so the
   `note` statements land in the right place. Order matters — `copy` takes a
   snapshot at the line it appears on.
3. **Eight `note` lines** add the lead, one cell each. `note ROW TRACK PITCH` with
   rows 0-based and channels 1-based; channel 3 is `LEAD`.
4. **`copy 1 3` + `clear 3` + a fresh set of grid rows** makes the break: root
   notes on alternate beats and a tick, with the chord and lead channels left
   empty.

**Why it works**

- The three sections are recognisably the same music: same chords, same bass
  shape, same tick. Only the *density* changes — that is arranging.
- `BREAK` leaves the lead and chord channels empty, so when the hook returns the
  ear hears it as an arrival.
- The bass uses `A-3` and `G-3` (an octave above the root) on steps 6 and 14 to
  push into the next beat — one small movement in an otherwise static part.

Bad orderings that produce errors here, for reference:

```text
pattern 2 "HOOK"     # select first...
copy 1 2             # ...then copy: the copy OVERWRITES the notes above
```

---

## Example 3 — One channel, one minute

The smallest thing that is still music. Useful when you want to hear an idea
without arranging it.

One channel, and every second step empty. Note that a grid row on a one-channel
song has exactly one token — a row written for four channels would be the
"grid row has 4 notes but the song has 1 track" error:

```text
C-4 . . .      wrong: four columns, but this song has one channel
C-4            right
```

```script
new
song "SINGLE LINE"
tempo 96
tracks 1

track 1 "SOLO" wave triangle

pattern 1 "LINE"
A-3
. 
C-4
. 
E-4
. 
C-4
. 
D-4
. 
F-4
. 
D-4
. 
E-4
. 
```

**Why it works:** every other step is a rest, so the line breathes. With one
channel there is nothing to hide behind, which makes it the best way to check
whether a melody is any good before you add anything to it.

---

## Example 4 — The same bar, three ways

Not a song — a demonstration that *arrangement is mostly volume and register*.
The notes of the bass are identical in all three; the rest changes.

```script
# 1. EMPTY: only the bass. Everything is clear and nothing is happening.
new
song "ONE"
tempo 120
tracks 4
track 1 "BASS" wave triangle
pattern 1 "A"
C-2 . . .
.   . . .
.   . . .
.   . . .
A-2 . . .
.   . . .
.   . . .
.   . . .
F-2 . . .
.   . . .
.   . . .
.   . . .
G-2 . . .
.   . . .
.   . . .
.   . . .
```

```script
# 2. PLUS a chord on the beat: the harmony arrives, the bass is now a root.
new
song "TWO"
tempo 120
tracks 4
track 1 "BASS"  wave triangle
track 2 "CHORD" wave saw
pattern 1 "A"
C-2 C-4 . .
.   .   . .
.   .   . .
.   .   . .
A-2 A-3 . .
.   .   . .
.   .   . .
.   .   . .
F-2 F-3 . .
.   .   . .
.   .   . .
.   .   . .
G-2 G-3 . .
.   .   . .
.   .   . .
.   .   . .
```

```script
# 3. PLUS a lead an octave above: the register gap is what makes it a song.
new
song "THREE"
tempo 120
tracks 4
track 1 "BASS"  wave triangle
track 2 "CHORD" wave saw
track 3 "LEAD"  wave square
pattern 1 "A"
C-2 C-4 C-5 .
.   .   .   .
.   .   .   .
.   .   .   .
A-2 A-3 A-4 .
.   .   .   .
.   .   .   .
.   .   .   .
F-2 F-3 F-4 .
.   .   .   .
.   .   .   .
.   .   .   .
G-2 G-3 G-4 .
.   .   .   .
.   .   .   .
.   .   .   .
```

**The lesson:** layer 3 is not "more notes" than layer 1 by much — it is the same
three notes on three channels, one per octave. What changed is the *spread*.
That is the whole trick, and it is the reason the earlier warning about keeping
registers apart matters more than note choice.
