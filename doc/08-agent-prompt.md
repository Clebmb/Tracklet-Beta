# 08 — Getting an AI agent to write songs

This is the file to read first if your goal is *"I want an AI to write me music."*
It is the handoff: what to give an agent, what to ask for, what you get back, and
what to do when the SCRIPT panel complains.

Nothing here is required to use Tracklet yourself — it is the shortest path from
a language model to a song you can hear.

---

## The handoff, in one paragraph

An agent needs **one file**. [`../SKILL.md`](../SKILL.md) is the short one: the
whole language, every closed list and every limit, on a single page — start
there. [`03-script-reference.md`](03-script-reference.md) is the same contract
argued out in full, and [`07-agent-guide.md`](07-agent-guide.md) is the working
procedure. Give it one of them (the skill page is the one to start with) plus the
musical brief (tempo, key, mood, how long), and ask for **one fenced
` ```script ` block**. The agent returns
text; you paste it into the app's SCRIPT panel; the panel parses it *before*
anything changes and either says `READY TO APPLY` or lists the mistakes by line
number. Press APPLY, press SPACE, and you have music. Nothing is written until
you press APPLY, and one `Ctrl+Z` takes the whole thing back, so trying something
is free.

---

## Prompt 1 — the agent can read this repository

Copy this, fill in the brief, paste it as a single message:

```text
Write a Tracklet song as a Tracklet Script.

Read these files first, in this order:
  SKILL.md                     the whole language on one page — start here
  doc/03-script-reference.md   the complete language reference — the grammar
  doc/07-agent-guide.md        the working procedure and pre-flight checklist
  doc/02-music-primer.md       only what you need for scale, chords and octave choices
  doc/04-cookbook.md           worked recipes, if you want a starting shape

Brief: <FILL THIS IN — see the examples below>

Rules for your answer:
- Return ONE fenced code block tagged `script` and nothing else, unless I ask for
  commentary. The block must be a complete song: start it with `new`.
- It must parse with zero errors. Run the checklist in doc/07 section 4 against
  your own output before answering.
- Rows count from 0, tracks count from 1, one grid-row line per step, at most
  `tracks` tokens per line, `.` for an empty cell.
- Put `tempo`, `steps`, `tracks` and every `track N ...` line ABOVE the grid rows
  that depend on them.
- One note per channel per step. A channel is one voice, so a three-note chord
  needs three channels.
- Keep `steps` at its default 16 unless the phrase genuinely needs more; if you
  use more, write at least that many grid rows.
- Channel names are at most 16 characters. `volume` is a percentage, 0–100.
```

## Prompt 2 — the agent cannot read files (chat window, no tools)

Paste the *whole* of [`../SKILL.md`](../SKILL.md) (or
[`03-script-reference.md`](03-script-reference.md) if you would rather paste the
exhaustive one) under a line that says `LANGUAGE REFERENCE:`, then this:

```text
Using ONLY the language in the reference above, write a Tracklet song.

Brief: <what you want>

Return one fenced code block tagged `script`, containing a complete song starting
with `new`. No other output. It must contain zero mistakes: rows count from 0,
tracks count from 1, one `script` grid line per step with at most `tracks`
tokens, `.` for an empty cell, and `tempo`/`steps`/`tracks`/`track` lines above
the rows that depend on them. If any line of your script would be rejected, fix
it before answering rather than explaining it.
```

> If the agent has no file access and you do not paste the reference, expect
> confident nonsense: the most common failure is an agent inventing a syntax that
> looks like other trackers. The reference is short — paste it.

---

## Writing a good brief

Vague briefs produce loops with no key and no register plan. These are the
details that change the output:

| Say | Why it matters |
| --- | --- |
| **Genre and tempo** — "house, 126 BPM" | Sets `tempo`, and the drum pattern that goes with it. |
| **Key and mode** — "A minor", "C major, sad" | Every channel lands in one scale instead of twelve random notes. |
| **Length** — "one bar", "four bars", "a 64-step phrase" | Decides `steps`. Four bars is `steps 64`. |
| **Instrumentation** — "bass, chords, hats; no lead" | Decides `tracks` and each channel's VOICE (`kick`, `bass`, `pad`, `hat`, …). |
| **What should NOT happen** — "no fast notes", "keep it sparse", "no melody" | Agents default to filling every step. Constraints are what make it listenable. |
| **Structure** — "verse and chorus", "A A B A" | Decides how many patterns, and where `copy` is used. |

Weak: *"write me a song"*.
Strong: *"A four-bar A-minor house loop at 126 BPM. Channel 1 kick on every beat,
2 bass on the roots in octave 2, 3 a chord stab on the offbeats, 4 closed hats on
every offbeat. No lead. Keep `steps 64`. Sparse: no channel should play on every
step."*

Weak: *"make it better"*.
Strong: *"Same song, but the bass is in octave 3 and the chords move Am–F–C–G one
per bar instead of one per beat."*

---

## What a good answer looks like

The agent should hand back exactly this kind of thing — a complete, parseable
script, with the header lines first:

```script
new
song "FOUR TO THE FLOOR"
tempo 126
tracks 4

track 1 "KICK"  voice kick
track 2 "BASS"  voice bass
track 3 "CHORD" voice strings
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

You can tell at a glance that it is right: `new` first, the header lines above the
grid, sixteen grid rows, four columns for four tracks, every token either a note
or a `.`, and each channel doing one clear job.

---

## The loop you will actually be in

1. Ask for a script (Prompt 1 or 2).
2. In the app, press **SCRIPT** → paste → read the verdict under the box.
3. If it says `FIX THESE (n)`, **paste those lines back to the agent** — they are
   written to be actionable, e.g. `LINE 06  this grid row has 5 notes but the song
   has 4 tracks. Add "tracks 5" or remove a column.` See
   [`05-error-catalogue.md`](05-error-catalogue.md) for what each one means.
4. When it says `READY TO APPLY`, press APPLY, then SPACE.
5. Ask for one change at a time, then APPLY again. `Ctrl+Z` undoes a whole apply
   in one step, so comparing two versions is cheap.
6. When one bar is right, ask for structure: *"copy pattern 1 into 2 and add a
   lead melody to pattern 2"*.

Two habits that make this work well:

- **Ask for one focused change per round.** "Make the bass an octave lower" is
  testable in ten seconds; "rewrite it, but better" is not.
- **Ask for alternatives when you cannot describe what you want.** *"Give me three
  different 16-step A-minor basslines as three separate ```script blocks."* Paste
  each one, press SPACE, keep the one you like.

---

## What the agent cannot do

It can write notes; it cannot hear them. Be explicit about the things that need
ears:

- Whether the loop is *good* — that is your judgement and it is the only reliable
  one. The agent can tell you the notes are in A minor; only you can tell whether
  they are any use.
- Whether the mix is muddy — every channel has its own `voice`, `level`, `pan`,
  six effects and sends, so a balance can be *planned*; what cannot be judged is
  whether the parts fight for the same octave. If it sounds cluttered, ask for
  **fewer notes**, not different ones.
- Whether it is in time with something else — the app can follow a MIDI clock and
  record what you play (`EXPORT… → MIDI IN`), but nothing listens back and
  nothing checks the result for you. Tempo and the grid are the only clock an
  agent can reason about.

Everything else — the grammar, the limits, the diagnostics, the octave of every
note — is checkable, and the app checks it before it changes a single cell.

---

## Quick answers to the obvious questions

**Can an agent write an entire song?** Yes: `steps 512` is 32 bars in one
pattern, and up to 64 patterns is available, so a whole arrangement fits in one
script. Practically, longer is not better for a first pass — ask for one bar, then
grow it.

**Can it change a song I already have?** A script replaces the whole song, so it
has to describe all of it. If you want a small edit, do it by hand in the grid
(rather than regenerating) — or ask the agent for the complete script again with
the change in it.

**Is the output deterministic?** Yes. The same script always produces the same
song: same notes, same sounds, same tempo. Nothing is randomised, so a script
you like is a script you can keep.

**Can I keep it?** Yes — a script is 20–80 lines of text. Save it in a file, or
paste it into the box again later: the panel remembers the text you last pasted.
