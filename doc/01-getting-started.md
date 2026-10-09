# 01 — Getting started

## Running it

```bash
cd tracklet
npm install
npm run dev          # http://localhost:5200
```

`npm run typecheck`, `npm test` and `npm run build` are the other commands.
`npm test` runs the pure model tests (the song, the editor rules, and the whole
script language) with no browser involved.

## The screen, region by region

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TRACKLET                  FIRST SCRIPT · PAT 1 · 16 STEPS · …  TAB TRACKER ▾│  HEADER
├───────────┬────────────────────────────────────┬─────────────────────────────┤
│ TRACKS    │ PATTERN                            │ THIS CELL                   │
│ ● LEAD SQR│  LEAD   BASS    PAD    HAT         │ NOW WRITING                 │
│ ● BASS TRI│ 00 A-4  A-2     E-4    C-6         │ A-4                         │
│ ● PAD  SIN│ 01 C-5  ···     ···    ···         │ LEAD · STEP 00              │
│ ● HAT  SAW│ 02 E-5  ···     ···    C-6         │ PRESS N                     │
│ + ADD     │ …                                  │ [x] HEAR NOTES AS I MOVE    │
│ - DEL     │                                    │ [UNDO]  [REDO]              │
│           │                                    │ [SCRIPT][MACHINE]           │
│           │                                    │ [CLEAR PATTERN]             │
├───────────┴────────────────────────────────────┴─────────────────────────────┤
│ PIANO - CLICK A KEY OR TYPE                                                  │
│ OCT 4 │ C-4 │ C#4 │ … │ B-5 │                                                │
│  - +  │  Z  │  S  │ … │  U  │                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▶ PLAY  STOP   < PAT 1/1 >  KEY < D > MINOR          PLAYING                │
│ TEMPO ▬▬▬▬ 128 BPM    VOLUME ▬▬▬▬ 70%    SWING ▬▬ 60%                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### The pages (header)

The header's far corner holds a **tab dropdown** — `TAB TRACKER ▾` — which
switches between the app's full screens. There are five: **TRACKER** (the grid and
the panel layout above), **DRUM MACHINE** (a pad × step grid that plays beside the
channels), **MIXER** (a strip per channel — fader, pan, sends, the group it joins
and the pump — plus the song's room and the effects on the whole mix),
**ARRANGER** (the song's bars across, its channels down, with the automation
lanes drawn as curves you can grab; see **Making something move** below),
**LIVE** (a launch grid for playing the song — one row per scene, each a pattern
per channel plus the drum-machine bar it performs; see **The LIVE page** below)
**RECORDER** (audio IN and OUT — record a take and shape it, then render the
song; see **The RECORDER page** below) and **ARP** (a visual arpeggiator — dial a
run over the chord under the cursor and hear it before you write it).
Click it
and pick a page; the list is where more pages will join. A script can switch it
too, with one line: `page tracker`, `page machine`, `page mixer`, `page arranger`,
`page live`, `page recorder` or `page arp`. The header itself — the wordmark, the song title, the dropdown —
stays up on every page, so the way back is always in the same place.

### TRACKS (left)

One row per channel: a colour chip, the channel name, a **sound chip** and a mute
box. The chip is three letters — `PAD`, `STR`, `SNA`… when the channel is a named
voice, or `SQR`/`TRI`/`SAW`/`SIN` when it is a plain waveform.

- Click **the name** → just select that channel, which is what a click on a name
  almost always means when you are choosing where to write.
- **Shift+click the name** → select it *and* open a box to rename it. Type, then
  press `Enter` to keep it, `Esc` to throw it away, or click anywhere else to
  keep it and move on. Names are shown in capitals and can be up to 16
  characters. Shift+click is the same deliberate modifier the pattern grid uses
  to clear a cell, so neither one can happen while you are just navigating.
- Click anywhere else on the row → just select that channel (the pattern cursor
  moves to its column).
- Click the **sound chip** → cycle the channel's waveform: square → triangle →
  sawtooth → sine → square.
- Press **`F4`** → the sound menu: pick a named **voice** (`pad`, `pluck`, `hat`, …)
  and turn the nine percentage knobs (`bright`, `sweep`, `duty`, `noise`,
  `attack`, `decay`, `ring`, `release`, `thick`). This is where a channel stops
  being a buzzer. If the channel has layers stacked under that voice, the menu
  shows them as a strip of chips beside the `SOUND` heading — click the strip to
  go where they are edited (`F7`).
- Press **`F5`** → the mixer page: one strip per channel (a vertical `LEVEL` fader, a `PAN` bar, a `MUTE` and a `SOLO` box, the `VERB`/`ECHO` sends, the group it joins, and a `DUCK` bar that makes this channel push the REST of the mix down while it plays), the drum machine's own strip beside them, the song's `GROUPS`, the shared `ROOM`, the effects on the `WHOLE MIX`, and a `THIS CHANNEL` panel showing the selected one. This is where four channels stop fighting.
- Click the **box at the right edge** → mute/unmute that channel.
- `+ ADD` / `- DEL` → grow or shrink the channel list (1 to 8).

A thin bar runs along the foot of each channel row: that is the channel's level,
drawn in its own colour. A row that is greyed out is a row you will not HEAR —
muted, or held quiet by another channel's solo.

A channel's colour is the same everywhere: its chip in the list, its notes in
the grid, and its keys on the piano when the song plays.

### PATTERN (middle)

The song itself. Each **row is a step**; the gutter on the left numbers them,
with every fourth step brightened because four steps make one beat. Each
**column is a channel**, headed by the channel's name.

The panel heading names the **channel** the grid belongs to — the answer to
"whose notes am I writing?" without looking left at the track list. **Shift-click
it to rename that channel**, the same gesture and the same one undo step as a
shift-click on its track-list row. In `F8`'s drum and piano readings the heading
adds what the view is (`KIT  LEAD`, `PIANO  LEAD`), naming the same channel.

A pattern is 16 steps by default, which is one bar. It can be up to **512 steps**
(32 bars) when a script asks for it with `steps 64`, and the grid then pages: it
shows as many rows as fit legibly and scrolls with the cursor and the playhead,
with the visible range in the heading (`LEAD  ROWS 32-63 OF 512`).

When the pattern is longer than the window, the strip down the right edge becomes
a **map of the whole pattern**: every step that carries a note gets a mark,
brighter the more notes it holds, so a wall of beats or a quiet intro reads as a
shape. The lit band over it is the window you are looking through. **Click or
drag the strip to jump** to that step — the fastest way to the chorus of a
32-bar song is to look at the map and click where the music is.

- Click a cell → move the edit cursor there.
- **Right-click** a cell → clear it. (Shift-click does the same, for trackpads.)
- The lit band on the left is the **edit cursor**; the moving band across the
  grid during playback is the **playhead**.
- There is exactly one pattern in the grid at a time. `<` / `>` in the
  transport, or `Page Up` / `Page Down`, step between patterns; walking past the
  last one creates the next.

### THIS CELL (right)

Three answers, always: **which note** is under the cursor, **where** it is
(track + step), and **which key would type it**. That last line is the point of
the whole app: press a key, get a note, and see the connection.

Beside the note are the two things that belong to THIS note rather than to its
channel: its **velocity** (`[ ] VEL 100` — the two keys that move it, then the
number) and how it is **played** (`> * ART SLIDE + STUTTER x3` — again the keys,
then what the note is doing). Both read `--` on an empty step, and both are
changed with those keys rather than with a button anywhere: `[`/`]` softens or
accents the note, `>` slides into it and `*` steps the stutter round `2`…`8` and
back to a plain note. The read-out carries its own keys for the same reason the
piano carries its own letters — there is nowhere else to learn them.

- `HEAR NOTES AS I MOVE` auditions each cell as you arrow through a pattern.
- `UNDO` / `REDO` step through every edit, including track changes and applying
  a script.
- **`SCRIPT`** opens the paste-a-script panel (see `03-script-reference.md`).
- **`MACHINE`** opens the **DRUM MACHINE** page: pads and a step grid that play
  BESIDE the channels rather than inside one of them (see
  `03-script-reference.md`). It is a full screen, switched to from the header's
  tab dropdown, not a window over the tracker — `Escape` or the tab dropdown
  brings you back. The button sits beside `SCRIPT` because both are ways to write
  something that is not a cell on the grid.

  The page is five panels. **MACHINE** across the top carries the machine's own
  mix (`MIX`, `DUCK`, `SWING`, `VERB`, `ECHO`), its on/off switch, and the `BAR`
  and `PADS` steppers. **SEQUENCER** is the tall panel on the left: one row per
  pad with its colour chip, its name, an `M` (mute) and an `S` (solo) key, and a
  column per step. `STEPS`, `BEAT`, `< PAD` / `PAD >` and the `BAR n/m` button sit
  on its header row; its footer is the machine's `ORDER`.

  A machine may have more than one **bar** (a variation of its beat): `Page Up` /
  `Page Down` or the `BAR` steppers walk the bars, `+ BAR` / `- BAR` add and drop
  one, and the header always reads which bar is showing so two similar bars are
  never confused. `+ BAR` starts as a COPY of the last bar — a variation begins as
  the beat — and a pad's sound, level, pan and pitch are shared by every bar. With
  more than one bar the `ORDER` row appears: one slot per song bar saying which bar
  of the machine plays there (`2 2 1`). Click a slot to walk it forward through
  the bars and right-click to step back; `+ SLOT` / `- SLOT` lengthen or shorten
  the loop, and an empty order means bar 1 everywhere. A `▸ SECTION` mark appears at
  the row's end when a section names its own machine bar (`section CHORUS 3 4
  machine 2`), so the form's effect on the beat is visible from the beat's own
  page.

  While the song plays, a **playhead** column lights the step the transport is
  passing through, and goes dark the moment it stops — the lit column and the
  sounding step are the same calculation, so a beat you watch is a beat you hear.
  The grid also **follows the playing bar**: as the song moves into a bar that
  plays a different machine bar, the grid switches to it, so you are always
  editing the beat you are hearing. Choosing a bar by hand stops the following
  (the row then reads `MANUAL`); `F` asks for it back.

  **THIS PAD**, on the right, is the selected pad's own instrument — its sample
  and its `LEVEL`, `PAN`, `TUNE`, `DECAY`, `FILTER`, `DRIVE` and two sends, each a
  groove you click. **PAD PARAMETERS**, under the sequencer, is the same pad
  edited by tab: `SAMPLE` shows the sample field, the `BROWSE` / `TRIM` buttons
  and a waveform preview, while `AMP`, `PITCH`, `FILTER`, `ENVELOPE` and `FX` each
  show four of the pad's own knobs (the same nine a channel's voice has). The
  column on its right holds two switches and two fields. **TRANSPORT**,
  **PATTERN** and **SHORTCUTS** run along the bottom: `PLAY` / `STOP` drive the
  song, `+ ADD PAD` / `DEL PAD` change the kit, and the bar stepper walks the
  machine's bars. `Space` plays and stops from here, and `M` mutes the cursor's
  row.
- `CLEAR PATTERN` empties the pattern on screen.
- The `SHORTCUTS` legend names the keys the panels cannot teach by example —
  `Space`, backspace, shift-click to rename, **`F4`**/**`F5`** for a channel's
  sound and its level, and **`F7`**/**`F8`** for its layers and the three ways
  the pattern can be shown.
  The menu keys ride the legend's title row (`MENUS F1-F7 F9`), and **`F1`**
  itself lists every control in the app.

### PIANO (bottom)

A real two-octave keyboard, playable with the mouse, each key labelled with the
note it writes and the computer key that types it. The `-` / `+` buttons change
octave (also `-` / `=` on the keyboard). During playback the sounding keys light
up in their channel's colour.

The piano also shows the song's **key**: the notes that belong to it are drawn
normally and the rest are dimmed, with the tonic marked. Seven keys stand out of
twelve, which is the whole answer to "which notes go together" — see
[`02-music-primer.md`](02-music-primer.md#3-harmony-scales). Nothing is locked or
corrected; the dimming is a hint, not a rule.

### TRANSPORT (very bottom)

`PLAY` / `STOP`, the pattern stepper, `TEMPO` (40–300 BPM), `VOLUME`, `SWING`,
and `KEY`.

`SWING` is the song's **feel**: drag it and every second step moves a little
later, so a straight beat becomes a lilt. At `0` the readout says `STRAIGHT`,
which is the word for the grid everything else assumes. It never changes the
tempo — the steps move, the song does not stretch — and it is the fastest way to
make a programmed beat sound played. See
[`02-music-primer.md`](02-music-primer.md#rhythm-and-feel-swing).

The `GROOVE` button beside it is the same idea with names (`SHUFFLE`, `LAID
BACK`, `HUMAN`…), and it belongs to the **song**. A **part** can disagree: in a
script, `track 4 "HAT" groove shuffle humanize 40` gives one channel its own feel
and a little looseness, so a straight song can carry a shuffled hat.

The `KEY` control is three presses wide: `<` and `>` walk the tonic a semitone at
a time, and the button beside them cycles the five scales (`MAJOR`, `MINOR`,
`HARMONIC MINOR`, `DORIAN`, `PENTATONIC`), each with a one-line description in a
toast. The piano and the cell inspector redraw as you press, so you hear and see
the change at once — no menus, no theory required.

## Keyboard

| Keys | Action |
| --- | --- |
| `Z X C V G B H N J M` and `Q 2 W 3 E R 5 T 6 Y 7 U` | Write a note on the two octaves, then step down one row |
| `↑ ↓` / `← →` | Move between steps / channels |
| `Space` | Play / stop |
| `Esc` | Stop |
| `Backspace`, `Delete`, or right-clicking a cell | Clear the cell |
| `Shift`+clicking a channel's name | Rename that channel |
| `Shift`+clicking the song title in the top bar | Rename the song |
| `Page Up` / `Page Down` | Previous / next pattern |
| `-` / `=` | Octave down / up |
| `[` / `]` | Soften / accent the note under the cursor (its velocity) |
| `>` / `*` | Slide into that note / step its stutter round 2…8 and back |
| `Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y` | Undo / redo |
| `F1` | Show the controls menu — every key, click and button |
| `F2` | Show the file menu — new, open, save |
| `F3` | Show the song's order — which bars play, and when. `L` marks the bars an export renders |
| `F4` | Show the sound menu — a voice, nine knobs, `SAVE AS`, and a stack if there is one |
| `F5` | Show the MIXER page — every channel as a strip (level, pan, sends, duck, mute, solo, group) beside the drum machine, the groups, the room and the whole mix. `←`/`→` pick a channel, `↑`/`↓` a control, `-`/`=` change it, `Tab` pages the effects, `P` walks the pump, `C` centres the pan, `G` adds a group, `B` flips between two whole balances (A/B), `Ctrl+C`/`Ctrl+V` copy a whole channel's mix onto another |
| `F6` | Browse the instruments — every wave, knob, voice and console |
| `F7` | Show the design menu — stack up to four layers into one channel's sound, and set the channel's effects |
| `F8` | Change WHAT the pattern panel shows — the note grid, DRUM LANES (one row per drum), or a PIANO ROLL — cycling through the three |
| `F9` | Show the appearance menu — choose a theme, and the text size |
| `F10` | Show the HISTORY — the steps you took, newest first, to jump back to one |
| The `KEY` control: `<` / `>` / the scale button | Move the tonic, cycle the scale |
| `Tab` (in the APPEARANCE menu) | Cycle the text size |
| `Ctrl+Enter` (in the SCRIPT panel) | Apply the script |
| `Esc` (in the SCRIPT panel) | Close it without applying |
| `Enter` / `Esc` (in a name box) | Keep / discard the channel name |

Forget one of these? Press **`F1`** at any time. It opens a menu listing every
control in the app, organised by what you are trying to do, and `F1`, `Esc` or a
click anywhere closes it again. **`F2`** (files), **`F6`** (instruments), **`F7`**
(design) and **`F9`** (appearance) open their menus the same way, and while any
menu is up the app is paused behind it — typing cannot reach the song through a
menu.

**`F10`** is the undo **history**: the state on screen now, then every step back
with what it changed written beside it (`TEMPO 120 -> 140`, `CHANNEL 2 - BASS`,
`NOTES +6`). Arrows move, `Enter` jumps back to the highlighted step, `Esc`
closes. A jump is the same thing `Ctrl+Z` does, run several times in a row, so it
leaves the redo branch exactly where that many single presses would — and editing
after a jump discards it, as always.

While the `F6` browser is open, arrows scroll the list and `Esc` closes it. It is
a **reference**, not an edit: it shows what the app can sound like — the nine
waves, the nine knobs, the voices by family, the effects, the pump, the four
filter SHAPES, and what each console's channels are — so you can answer "what is
a wavetable?", "which voice is for bass?" or "which shape makes a telephone
vocal?" without touching a channel.

Press **`/`** to search it. Everything you type then narrows the list to the
entries whose name OR whose description contains what you typed — so "ring"
finds the knobs and voices that ring, not just the ones with `ring` in the name —
and the title shows how many are left. While a search is being typed the letters
go into the query rather than walking the list, so a word starting with `w`, `a`,
`s` or `d` does not also scroll it; `Enter` keeps the result and hands the arrows
back, `Backspace` deletes, and `Esc` clears the search (a second `Esc` closes the
browser).

Inside the other menus — `F2` and `F9` — the keys are the same wherever you are:
**arrows or `W A S D`** move the highlight (it wraps at both ends), **`Home`** and
**`End`** jump to the top and the bottom, **`Enter`** or **`Space`** takes the
highlighted item, and **`Esc`** closes. `W A S D` are note keys the rest of the
time, which is safe here because a menu owns the whole keyboard while it is open.

With the mouse: click a cell to move the cursor, right-click one to clear it,
click a channel's **name** to select it, **shift+click** that name to rename it,
click its **chip** to change its waveform, press **`F4`** for its whole sound,
press **`F7`** to stack layers under it, press **`F5`** to set how loud it sits and where it sits,
and click its **box** to mute it.
**Shift+click the song's title** in the top bar to rename the song, exactly the
way a script's `song "..."` does it. Every setting the app has — including the ones
that are about your SESSION rather than the song, such as the master volume and
which channels are soloed — can also be written in text: see
[section 9 of the reference](03-script-reference.md#9-what-a-script-can-control)
for the complete table, and for the handful of things only a hand can do.

## Files (F2)

`F2` is the app's whole relationship with files:

| Item | What it does |
| --- | --- |
| `NEW SONG` | Start over from a blank song. |
| `STARTERS…` | Begin from a whole worked skeleton — `HOUSE`, `LOFI` or `BALLAD` — and edit it instead of inventing it. Like `NEW SONG`, it replaces the song, and one `Ctrl+Z` brings back the one you had. |
| `OPEN FILE…` | Read a `.txt` Tracklet Script, a `.json` song file or a `.mid` MIDI file. |
| `IMPORT FROM NOISLET (.instrument.json)` | Load a sound pack you designed in Noislet as an instrument for channels on `wave font`. Does NOT touch the song. |
| `LOAD SOUNDFONT (.sf2)` | Load a recorded-instrument file for channels on `wave font`. Does NOT touch the song. |
| `INSTRUMENTS (n)…` | The instruments you have loaded, and which one `wave font` plays. `Del` twice removes one. |
| `SAMPLES (n)…` | The recordings YOU have loaded — a page with `LOAD A RECORDING (.wav)…`, then one row per recording. `Enter` gives the recording to the selected channel (one `Ctrl+Z`); `Del` twice takes it out of the bank. |
| `DRUM MACHINE…` | Open the drum-machine page — pads and a step grid that play beside the channels. Opening it on a song that has no machine creates one, so this is also how a machine begins. Same as the `MACHINE` button in the inspector. |
| `SAVE AS SCRIPT (.txt)` | Write this song out as the text the `SCRIPT` panel takes. |
| `SAVE AS JSON (.json)` | Write this song out as plain data. |
| `SOUND FILES…` | The two small documents that carry a sound. `SAVE PATCH <CHANNEL>` writes ONE channel's sound as a `.patch.json` — the voice, the layers, the filter, the effects, how long its notes ring, how far they slide and how much of it stands in the room — and `LOAD PATCH ONTO <CHANNEL>…` reads one back as one `Ctrl+Z`; a patch carries NOTHING about the mix (no level, no pan, no group, no pocket), which is what makes it safe to try somebody else's sound in your own song. `SAVE KIT <NAME>` writes the song's four DRUMS as a `.kit.json`, and `LOAD KIT…` reads one back — it becomes the song's drums AND joins your kits, so `kit MYHOUSE` plays it in any song. The name comes from the song's title. |
| `EXPORT…` | A page with the three ways a song leaves, the two rows that say WHAT goes and HOW LOUD, and one row for what comes IN by hand.  `EXPORT AUDIO (WAV)` renders the mix to a `.wav`; `EXPORT STEMS (.zip)` writes one `.wav` per channel, zipped, for anybody who mixes somewhere else; `EXPORT MIDI (.mid)` writes the notes out for another program, without the sound, the effects or the feel. `RENDER: THE WHOLE SONG` is the region those three write — press it to go back to the whole song after `L` in `F3` marked a few bars, or after a script said `export bars 8 to 15`. `LOUDNESS: OFF` is the level audio exports arrive at — press it to walk `-23` broadcast, `-16` podcast, `-14` streaming and `-9` loud before it goes back to `OFF`, or say `export loud -14` in a script. `MIDI IN: OFF` is a real keyboard: press it to walk `OFF` → `LISTENING` (what you play sounds on the channel under the cursor) → `RECORDING` (it also lands in the bar the playhead is on while the song runs); a clock from the same device also drives the tempo and the start and stop. See [`09-song-files.md`](09-song-files.md). |

The arrows or `W A S D` move through the items, `Enter` or `Space` chooses one,
and `Esc` (or a click) closes the menu. `SAVE` names the file after the song's title, so
`RAINY WINDOW LOOP` becomes `rainy-window-loop.txt`, and the stems of that song
arrive as `rainy-window-loop-stems.zip` with a
`rainy-window-loop-01-drums.wav` inside it per channel. Nothing is ever lost:
`NEW SONG` and `OPEN FILE…` are each one `Ctrl+Z`, and the song you are working
on — with your octave, solo, chord mode and export choices — is saved by itself a
second after you stop editing, so closing the tab and coming back puts you where
you were (see [`09-song-files.md`](09-song-files.md)).

Where a page is what an item opens, the panel says so in its own heading:
`STARTERS` (a whole song to begin from), `SAMPLES` (the recordings you loaded),
`INSTRUMENTS` (what `wave font` plays), `SOUND FILES` (a channel's sound and the
song's drums, out and back) and `EXPORT` (the three writers). `Esc` leaves a page back to the menu it
came from, and the last row of each page is the way back by hand.

The two IMPORTS and the instrument list are the items that are **not** undo steps:
they load an INSTRUMENT rather than a piece of music, so the song on screen is left
exactly as it was. What you loaded lives in the app, not in the song — reading
[`10-instruments.md`](10-instruments.md) is worth the two minutes it takes, because
that one fact explains everything surprising about the feature.

The two formats are the same song written two ways — one for people and models,
one for programs. Both are described in [`09-song-files.md`](09-song-files.md).

## Starting from a genre

The fastest way to a song is not a blank grid. `F2 → STARTERS…` offers three,
and they are the same three a script can name:

```script
start lofi
```

Each one is a complete, playable skeleton — a key, a tempo, a feel, a kit, named
channels with sounds on them, a drum figure, a chord loop and an arrangement — and
pressing `Space` after picking one plays it. From there you change things: a
tempo, a voice, a drum hit, the chords, the form. The list is in
[the script reference](03-script-reference.md#start-name--begin-from-a-whole-worked-skeleton).

Two things are worth saying plainly, because both are deliberate:

- **A starter REPLACES the song.** It begins with `new`, so the song you had is
gone — and one `Ctrl+Z` brings it back, exactly as `NEW SONG` does.
- **A starter is not a preset, it is a SCRIPT.** Press `F2 → SAVE AS SCRIPT` after
starting from one and the whole skeleton prints out as the lines it is made of:
the commands, the channels, the rows. Reading your own starting point is the
quickest way to learn what this notation does — and a starter can never use any
feature you could not have typed yourself.

## Appearance (F9)

`F9` chooses the app's theme. Every colour Tracklet draws — the panels, the
text, the pattern grid, the piano, the playhead band, each channel's colour —
comes from the theme, so a switch changes the whole screen at once.

The menu lists the ten themes the UI framework ships, each with its own accent
colour beside it, and shows a **live preview** of the highlighted one: a small
panel drawn in that theme's own palette, so you can see its frame, its fill, its
trim and its text before choosing. The arrows — or `W A S D` — browse the list,
and it **wraps**, so holding `↓` (or `S`) past the last theme returns you to the
first; `Home` and `End` jump to either end, and `Enter`, `Space` or a click
applies. `Esc` closes. The list
opens on the theme you are actually wearing, so the `ON` mark and the highlight
agree the moment it appears. The one you pick is remembered and comes back on
the next load.

A script can choose it too — `theme forge` — because it is one of the session
settings [`03-script-reference.md` §9](03-script-reference.md#9-what-a-script-can-control)
lists. Unlike the master volume, a theme is **never written to a file**: opening
someone else's song can change what you hear, never how your app looks.

Under the preview the menu prints a **contrast reading** for the theme the
highlight is on: its primary text against its own panel, as the WCAG ratio and
the bar that ratio clears — `13.5:1  AAA`, or `AA-LARGE`, or `LOW` when a pair
clears none of the three. It is there because a list of ten looks hides the two
things that decide whether you can read one: the single theme that is dark text on
a light panel (`PARCHMENT`, which exists for working over a bright map), and any
pair that is only comfortable at a large size. The grade is drawn in the accent
colour, so a look you cannot read says so before you choose it. Nothing is
refused — every one of these shipped as somebody's look, and the number belongs
where the choice is made rather than behind a lock.

The second control is the **text size**. `Tab` — or the `TEXT` button beside
`CLOSE` — cycles three words, `NORMAL`, `LARGE` and `HUGE`, and the line above
says which one is on. `NORMAL` is the size the app has always used, and it is
remembered like the theme.

What it changes is the app's **text boxes**: the `SCRIPT` editor and the little
name box you get by shift-clicking a channel — the two places a person reads and
writes a lot of text at once. It deliberately does **not** change the drawn
screen, and that is a limit rather than an oversight: the app draws its grid on a
fixed 720x405 canvas and the framework already scales that to your window, so
bigger drawn chrome would mean re-laying-out every panel in the app. The menu
says as much in its own status line.

| Theme | In one line | Text on panel |
| --- | --- | --- |
| `RELIQUARY` | Stone, ooze and ward: the framework as it shipped. | `13.5:1` AAA |
| `MOORLAND` | Cold slate and moss: a stormy plain's own light. | `15.0:1` AAA |
| `THE DEEP` | Ink teal and aqua, for hours underwater. | `15.3:1` AAA |
| `OSSUARY` | Bone and amber on brown-black, for the catacombs. | `14.1:1` AAA |
| `UNDERGLOW` | Indigo and magenta: a living glow in the dark. | `14.5:1` AAA |
| `FORGE` | Iron panels and an ember accent. | `14.3:1` AAA |
| `MYCELIUM` | Spore pink in a violet dark, lit from inside. | `15.3:1` AAA |
| `BOGHOLLOW` | Swamp ochre and dank green, for wading in. | `14.7:1` AAA |
| `NEST` | Chitin and glass-wing pale. | `14.7:1` AAA |
| `PARCHMENT` | Bone panels and ink: light on purpose, for working over something dark. | `10.0:1` AAA |

The last column is the theme's primary text against its own panel, computed by
[`../src/ui/contrast.ts`](../src/ui/contrast.ts) and held there by
[`../src/__tests__/contrast.test.ts`](../src/__tests__/contrast.test.ts), which
reads the framework's palettes and refuses a build whose body text falls under
AA. Every one of the ten clears **AAA** for body text today; the tightest dim
label in the set is `PARCHMENT`'s at `3.7:1`, which is the floor the test
enforces for the second rank of text.

A theme is a palette, not a skin: it is the same ten or so colours the framework
uses for every panel, control and label, so a theme that looks wrong on a
Tracklet screen would look wrong on any other screen built from the framework.
That is also why a theme cannot be "slightly off" here — there is nothing in
this app to get out of step with it.

## Layers (F7)

One channel usually needs one sound, and `F4` gives it one. But a sound can also
be several stacked on top of each other — up to four — and that is what turns one
oscillator into an organ, a bell, a twelve-string or a choir. **`F7`** is where you
stack them, and every layer plays every note of the channel together.

Two other places tell you a channel is stacked: its row in the channel list wears
`+2` beside the sound chip, and `F4` draws the layers as a strip of chips beside
the `SOUND` heading. Either one is a signpost — clicking the strip in `F4` opens
the design screen on that channel.

Across the top is the stack itself, one chip per layer: `1 VOICE SQR`, `2 SAW`.
**Layer 1 is the voice** — the instrument `F4` gave the channel — so it is the only
layer a song written before this menu ever had. The rest are layers you added.
Under the chips, the left column is the waveform plus the three things a layer has
that a voice does not (`OCTAVE`, `DETUNE`, `GAIN`), and the right column is the
nine sound knobs, in the same order `F4` shows them.

| Keys | Action |
| --- | --- |
| `↑` `↓` (or `W` `S`) | Move between the controls |
| `←` `→` (or `A` `D`) | Change the one you are on. On the stack row it picks which layer you are editing |
| `[` `]`, `-` `+` | The same, five times as far |
| `Ins` | Stack a copy of the selected layer above it |
| `Del` | Take the selected layer out and close the gap |
| `Enter` | Hear the channel |
| `Tab`, or the `LAYERS` / `FX` buttons | Show the other half of the screen |
| `Z` / `X` | Previous / next channel |
| `Esc` or `F7` | Close |

A new layer is a **copy of the one below it**, so you hear it the moment it
exists — and the first thing to do is MOVE it. Two moves cover almost everything:

- **Detune it a few cents** and the two copies beat against each other: a wide,
  warm pad, or a plucked string with a shimmer on it.
- **Drop it an octave** (`OCTAVE` at `-1`) under a lead for weight, or raise it
  (`+1`) for an organ or a bell.

Every layer plays at once, so a stack is LOUDER as well as thicker. Turn the
copies down — `GAIN` at 60 or so on the layer you added — and the sound grows
instead of the mix moving under you.

Layer 1 has no `OCTAVE`, `DETUNE` or `GAIN` of its own: a voice is in tune with
itself, at full level, by definition. The three rows are still shown on layer 1,
with the reason in the value column rather than hidden. That rule is also what
keeps every song written before this menu sounding exactly as it did.

One `Ctrl+Z` puts back a whole visit to this menu, so you can try three stacks and
keep the one you liked. It works with the menu still open — the press belongs to
the song, not to the screen you are looking at.

**Keeping a stack.** Press `F4` and `SAVE AS…` saves the channel's whole sound —
its voice and the layers above it — so a stack you built here becomes an
instrument you can use again: it appears at the top of the `MY SOUNDS` list marked
`+2`, and one click later any channel is that sound.

## Effects (F7's FX page)

The other half of the `F7` screen — press `Tab`, or the `FX` button — is ten
dials for the channel you are on, and they are a different kind of thing from a
layer: a layer is what the channel is **made of**, and an effect is what happens
to the sound on its way to the speakers.

| Dial | `0` means | `100` means | Reach for it when |
| --- | --- | --- | --- |
| `DRIVE` | clean | crushed | a guitar, a bass or a 303 has to bite |
| `CRUSH` | pure | gritty | you want lo-fi grit, chip dust or a telephone voice |
| `CAB` | open | boxed | a driven part should sound like an AMP rather than a fuzzbox |
| `TAPE` | clean | worn | the part should sound OLD — lo-fi, chillhop, vaporwave, a tape-saturated rock mix |
| `RADIO` | full | tinny | a telephone voice, an AM intro, a hook that should arrive through a speaker |
| `VINYL` | silent | crackling | a part should sound like it came OFF A RECORD — lo-fi, chillhop, a sampled hook |
| `CHORUS` | dry | wide | one synth should sound like two; a pad should fill the room |
| `PUNCH` | flat | snappy | a kick, a bass or a vocal has to jump out of the mix |
| `TILT` | flat | bright | a hat has to sit above the drums, or a pad has to step back |
| `GATE` | open | tight | you want staccato strings or a bass that stops dead |

Every one of them starts at `0`, and **`0` is not "a little" — it is off**: a
channel whose ten dials are all off is built exactly the way it was built before
these dials existed, which is what keeps every song already written sounding
identical. So the way to use them is to reach for ONE, turn it up until it does
the thing you wanted, and stop.

The dials belong to the CHANNEL, not to the sound: the same pad wants no drive
under a singer and a lot of it under a solo, and two channels can share one saved
sound with two different effects. The header counts the ones that are on, and the
sentence under the dials explains the one you are on and where it is usually
reached for. Press `F6` for the same list with two example songs each.

## The mix's own effects (the mixer's `WHOLE MIX` panel)

Every one of those effects also exists on the **whole mix** at once, and the
favourite trick of every mixing desk there has ever been lives there: not one
part biting, but the whole record sounding like a record. Press **`F5`** (the
mixer): the `WHOLE MIX` panel at the bottom right holds the same ten effects on
everything at once, and its own pager turns it over to the rest.

- `DRIVE` at 10–25 is the one to try first. It is what makes a song sound
  printed rather than rendered, and the reason a demo and a record of the same
  arrangement sound different.
- `TILT` at 10–20 leans the whole thing brighter, which is the other half of
  that trick.
- `PUNCH` on the mix makes everything jump a little; `CHORUS` widens everything
  at once, which is usually too much and occasionally exactly right.
- `GATE` on the mix shortens **every note in the song**, and it multiplies with
  each channel's own gate.

The same rule holds as on a channel: **`0` is not "a little", it is off**, so a
song whose mix is untouched is built through exactly the graph it was built
through before this page existed — and the header tells you how many are on.

All of them are one line of text for a script, which is how you would write it
to a friend: `master drive 20 tilt 15`, near the top beside `tempo`.

## The pump (the mixer's `DUCK` control)

The last column of the mixer is the one that makes a dance record sound like a
dance record, and it is the only control in the app whose effect lands on the
channels it is **not** on. `DUCK` is how far THIS channel pushes the rest of the
mix down while it plays:

```
track 1 "KICK"  duck 70
```

That is the whole idea. Every time channel 1 sounds a note, the other channels
are turned down by 70% and come back up over the length of the hit. The kick no
longer has to fight the bass for the same low end — the bass steps back exactly
when it would have collided, and the mix breathes in time with the drums.

- **One channel ducks, and it is usually the drums** — a kick under everything,
  or a snare if the snare is the loudest thing in the room. A lead vocal can do
  it too: the bed drops back a little for as long as the voice is singing, which
  is why the voice sits so far forward on a pop record without being louder.
- **`0` is off**, and it is what every channel starts at. Nothing in the song
  changes at all until you turn one up, which means this is a safe column to
  ignore completely until a mix sounds muddy.
- **The others come back by themselves.** The release is the length of the note
  that caused the dip, so nothing has to be timed: a one-step hit gives a quick
  pump, a long pad gives a long slow one.
- **By hand:** `F5`, pick the channel with the arrows, then press `P` (for the
  pump) to walk the value up (`0` → `10` → … → `100` → `0`), or click anywhere on
  that channel's or the panel's `DUCK` bar to land there. It is drawn in the
  warning colour because it is the one bar on the screen that moves the other
  rows. One `Ctrl+Z` takes back the whole gesture, like every other control in
  the mixer.

## One fader for the kit (bus)

Eight faders is a mixer; eight faders you have to remember is homework. A **bus**
is a name for a group of channels and ONE level over all of them, so a drum kit
moves together:

```script
new
tracks 4
bus DRUMS 70
track 1 "KICK"  voice kick  bus DRUMS
track 2 "SNARE" voice snare bus DRUMS
track 3 "HAT"   voice hat   level 45 bus DRUMS
track 4 "BASS"  voice bass

pattern 1 "BEAT"
C-2 .   C-6 C-2
.   D-3 .   .
C-2 .   C-6 .
.   D-3 .   G-1
```

Three channels, one fader. `bus DRUMS 70` says the kit sits at 70%, and each
drum channel joins it by naming it on its own line. Nothing else in the song
changes: the kick, snare and hat keep their own levels, and the group multiplies
them.

- **A channel's loudness is its own `level` times its bus's `level`.** A group at
  `70` over a channel at `50` is `35`, and a group at `100` — which is what every
  channel has when it is in no group at all — changes nothing. So adding a bus to
  an old song is not a remix: it is a second hand on a fader you already set.
- **The room hears it too.** A group fader scales the channel itself, including
  its reverb and echo sends, so pulling `DRUMS` down makes the drums quieter
  *everywhere* rather than leaving their tails ringing in the hall.
- **A group is defined above the channels that join it.** A script is read top to
  bottom, so `bus DRUMS 70` comes first — the same rule `tracks 4` follows, and a
  channel that names a group nothing has defined is refused with the list of ones
  that exist.
- **`track 3 bus none`** takes a channel back off its group, and `bus DRUMS 45`
  later in the same script just moves the whole kit.
- **A bus has one knob**, a level: no mute, no solo, no effects. Muting is still a
  channel's own business, and soloing is still about listening. A song may have at
  most four groups, which is as many as eight channels can use without a group of
  one.
- **By hand:** through the `SCRIPT` button and a line of text — `bus DRUMS 70`,
  then `bus DRUMS` on each drum's `track` line — or from a saved `.txt`, exactly
  like every other setting in the language. The mixer screen has no group page
  yet; that is the next piece of this feature, and the setting already travels in
  a file, survives `Ctrl+Z`, and is cleared by `new` like any other.

## A beat you can see (drum lanes)

A kit channel is a channel whose steps are HITS rather than notes: `KCK`, `SNR`,
`HAT`, `WND`. Three characters per step is enough to read a beat and not enough
to see one, so the pattern panel has more than one way of showing it. Put the
cursor on the kit channel and press **`F8`** once: the channel columns become
four LANES — one per drum of the kit — and the panel's title says which channel
you are looking at.

```script
new
tracks 2
kit 808
track 1 "BEAT" voice kick
track 2 "BASS" voice bass

pattern 1 "A"
kick  C-2
.     .
hat   G-1
.     .
snare C-2
.     .
hat   G-1
.     .
```

Read that pattern in the note grid and each hit is a word. Read it with `F8` and
the same eight steps are four rows of marks, a kick and a hat landing on the same
step in the same column of the eye rather than two words a line apart. `drum 0 1
kick` is the same hit written as a statement, and it is what a click on a lane
records.

- **A hit is a mark**, `x`, in its own lane; the other three lanes show the same
  `...` an empty step always shows. Force is the mark's weight and its number: a
  soft hit reads `x~40`, and a full-force one says nothing, so a plain beat stays
  three characters wide.
- **Click a lane to hit that drum** on that step, of the channel under the
  cursor. That click is one undo step, and it is the only way a drum gets into a
  song without writing a script line — the same click as picking a cell in the
  note grid, one gesture further in.
- **Right-click a lane** takes that hit back out — but only if the step IS that
  drum. Right-clicking the empty lane next to a kick is not a request to delete
the kick.
- **A step holds one hit.** Clicking `SNR` on a step that is a kick moves the hit
  rather than stacking two; the place for two drums at once is two kit channels.
- **`F8` is a way of LOOKING, never an edit.** Nothing about the song changes
  when you press it: no undo step, nothing saved, and a file opens in the note
  grid. The cursor, the playhead and your undo history all carry straight across.
- **A melodic note on a kit channel** — a bass line sharing the channel, say — is
  shown in every lane, dimmer than a hit, because it belongs to no drum. `F8`
  again spells it out as the note it is.

## A melody you can see (piano roll)

The note grid is a tracker, and a tracker is the right way to WRITE a melody and
a slow way to LOOK at one: a note is three characters in a cell, and a line
climbing a scale is a shape you hear rather than see. Press **`F8`** once more and
the pattern panel becomes a **piano roll** — time across, pitch up — so the line
you were typing becomes the line you can look at.

```script
new
song "ROLL"
key C major
tracks 1
track 1 "LEAD" wave sawtooth

pattern 1 "A"
C-4
E-4
G-4
E-4
D-4
F-4
A-4
G-4
```

Where the title read `PATTERN` it now reads `PIANO  LEAD`: the same notes, drawn
at their own height instead of spelled out in cells. The gutter down the left is
a keyboard — white rows and black rows, every `C` labelled — so a step and a
semitone read as a position rather than a code, and the tune above shows at once
as an arch.

- **One channel at a time.** The roll draws the channel under the cursor — the
  same one the drum lanes would — and the title names it. Arrow to another
  channel and the roll follows.
- **Its own range.** The roll grows to fit the notes this channel actually plays:
  a part that stays inside an octave is drawn inside an octave, so it is not a
  thin line lost in three of them, and it never reaches past three octaves, where
  a row would be a hairline. A channel with no notes yet opens around middle C.
- **The rows are tinted for the key,** exactly as the piano is: the notes the
  song's key uses are lighter and the rest darker, with the tonic marked on the
  gutter. It is a hint, not a rule — nothing is locked or corrected.
- **Click to write a note, right-click to clear one.** A click in the body writes
  the pitch at that height on that step — one undo step, the cursor following it,
  exactly like clicking a cell in the grid — and a right-click takes that note
  back out, but only when that step really holds that pitch. It is the mouse's
  `C-4`, and `E-4` a beat later.
- **A long pattern scrolls sideways.** A 16-step bar fills the panel with roomy
  columns; a song too long to fit stops narrowing its columns and follows the
  cursor instead — the same bargain the note grid makes downwards.
- **A click in the roll is an EDIT; pressing `F8` is not.** Writing a note is a
  real note and enters the undo history like any other; the view itself records
  nothing, saves nothing, and a file always opens in the note grid. The cursor,
  the playhead and your undo history carry straight across.

`F8` cycles the three readings — the note grid, the DRUM LANES, the piano roll —
and back to the grid. The toast says which one you are in.

## Making something move (automate)

Every knob so far is a VALUE: a channel's `bright` is 40 until you change it, and
the song plays at 40 from beginning to end. A song also has to be able to SAY
when something changes — the riser before a drop, the filter opening across a
build, the fade at the end — and that is a **lane**:

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

Read the first lane the way you would say it: *channel 3, `bright`, from 10 to
95, over bars 1 to 4.* The pad starts dull, and by bar 4 it is wide open — and
then **it stays** there, which is the part that makes a lane useful rather than a
detour. The drop at bar 5 is the bright one. The second lane fades the same pad
in underneath, and the third walks it back down again, which is why two lanes are
how a rise and a fall are written.

- **Bars are the bars of the song**, the same 1-based numbers the order uses — so
  a lane is written against the form you can see in the pattern view, not against
  a step number nobody counts in.
- **A lane may move one of nine sound knobs, the channel's `level`, or its `gate`**
  (how much of each note is heard). Those cover every rise, fade, sweep and
  thinning music asks for by name. The effects, `pan` and the sends are
  deliberately not on the list, and the app says why if you try: each of them is a
  piece of the audio graph that only exists when its amount is above zero, so a
  curve cannot fade one in from nothing.
- **`Ctrl+Z` takes a lane back**, like any other edit, because lanes are part of
  the song and not part of your session.

## Drawing a lane (the ARRANGER)

The **ARRANGER** is the screen for exactly this. Pick it from the header dropdown
(the fourth row, beside TRACKER, DRUM MACHINE and MIXER) or write
`page arranger`, and the song opens as a timeline — bars across, channels down:

```text
   INTRO (01-04)    VERSE (05-08)    CHORUS (09-12)   OUTRO (13-16)
   BAR      01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16
   PATTERN  P1 P1 P1 P1 P2 P2 P2 P2 P3 P3 P3 P3 P4 P4 P4 P4
   LEAD      REST  REST  P2·~  P3·~     P4
   BASS     P1····  P2····  P3····  P4····
   PAD      P1====  P2====  P3====  P4====
   ARP       REST  P2··~  P3··~    REST
   AUTOMATION · LEAD · BRIGHT  ─── a line from bar 05 to bar 08, then holds
```

- **The form is bands, not a list.** Each run of bars wears the **section** it
  came from (`INTRO`, `VERSE`, …) with the bars it covers, so an `arrange` is
  something you read at a glance. The `BAR` row numbers every bar and the
  `PATTERN` row shows which pattern the shared `order` plays in each.
- **One row per channel**, in the song's own order, wearing the channel's colour
  and name and the **voice** it is set to (`PLUCK`, `SUB`, `STRINGS`, `BELL`).
  Each bar is a **pattern block** labelled with its pattern number, plus a **note
  preview** — a dash per note, placed where the step sits in the bar and how high
  the pitch sits in the block — so a bar's shape reads without opening it. A bar
  with nothing on that channel says **REST**. An export region is bracketed above
  the bands in the same accent `F3` uses.
- **The lane editor shares the grid.** Below the rows, the selected channel and
  **target** (cycle it with `TAB`, or the `<`/`>` stepper) draw their lanes on a
  value axis — the top of the strip is the target's maximum — as a line from
  `(startBar, from)` to `(endBar, to)`, with a **handle** at each end and a flat
  line holding `to` out to the last bar. That is the rule `03-script-reference.md`
  states, drawn.
- **The inspector reads and writes the numbers.** The right panel shows `START
  BAR`, `END BAR`, `FROM` and `TO` — each a box whose **left third steps down and
  right third steps up** — so a lane is readable and typable, not only draggable.
  `< PREV`/`NEXT >` walk the lanes of this channel and target, `+ ADD LANE` writes
  one for the current target, and `REMOVE LANE` takes the selected one back.
- **One `Ctrl+Z` per gesture.** A drag banks a single undo step for the whole
  gesture, exactly as a click does. `INS`/`DEL` add and remove, `[`/`]` step the
  selection, the arrows nudge a value by 5, `,`/`.` move a lane a bar and `;`/`'`
  change its end. `SPACE` plays; `ESC` (or the dropdown) goes back.

The page edits the song and nothing else: a lane drawn here is the very lane an
`automate` line writes, so `F2 → SAVE AS SCRIPT` prints it back as `automate …`
and no file version moves. Songs that move nothing are exactly the songs they
always were — no lane, no `automate` line, nothing to find.

## The shape of a song (sections)

So far every song has been a list of bars. That is fine for eight bars and
useless for a hundred: an order like
`order 1 1 2 1 1 1 2 1 3 4 1 1 2 1 3 4` is a form nobody can read. `F3` shows
it — the bars it plays, one row each — and two statements let you say the same
thing with names:

```script
new
song "SHAPE"
tempo 128
tracks 3

section VERSE 1 1 2 1
section CHORUS 3 4 3 5
section OUTRO 4
arrange VERSE VERSE CHORUS VERSE CHORUS OUTRO

pattern 1 "V"
C-4 C-2 E-3
.   .   .
C-4 C-2 .
.   .   .

pattern 2 "V2"
G-4 C-2 E-3
.   .   .
E-4 C-2 .
.   .   .

pattern 3 "C"
A-4 A-2 C-4
.   .   .
C-5 A-2 C-4
.   .   .

pattern 4 "END"
F-4 F-2 A-3
.   .   .
.   .   .
.   .   .
```

Read it out loud: *the verse is patterns 1, 1, 2, 1; the chorus is 3, 4, 3, 5;
the outro is pattern 4; and the song plays verse, verse, chorus, verse, chorus,
outro.* That is the whole feature, and it plays exactly the bars the same `order`
line would have played — `arrange` builds the order rather than describing it,
which is why nothing else in the app had to change for it.

- **A section is a list of patterns, not a stretch of bars.** A chorus that is
  `3 4 3 5` — four bars with one of them returning — is one section.
- **A name is one word** (`VERSE`, `CHORUS`, `MIDDLE8`). It has to be, because an
  arrangement is read as a list of them.
- **`L` marks an export region.** In `F3`, `L` on a bar starts the loop region and
  `L` on another bar ends it; the bars it covers wear brackets, and a third press
  on the bar it ends at takes it off. `EXPORT…` renders only those bars, so a
  chorus can be bounced without cutting the file up afterwards. It is a setting
  about what you are DOING, not part of the song: nothing is saved, and replacing
  the song clears it.
- **`LOUDNESS:` in `EXPORT…` sets how loud an audio export arrives.** `OFF` writes
  the level you hear; a target measures the finished render the way a streaming
  service does — ITU-R BS.1770, in LUFS — and applies the one gain that lands it
  there, stopping at -1 dBFS rather than clipping and saying so when it does.
  `-14` is what the services normalise to. It is a level rather than a property of
  one song, so unlike a region it stays set when you start another one; `MIDI`
  carries no level and ignores it.
- **`MIDI IN:` in `EXPORT…` plays a real keyboard into the app.** It has three
  stops: `OFF` asks the browser for nothing; `LISTENING` sounds what you play on
  the channel under the cursor and writes nothing; `RECORDING` also lands each
  note in the bar the playhead is on while the song runs, and the whole take is
  one `Ctrl+Z`. If the device sends a **clock**, the app follows its tempo and its
  start and stop — the transport's word becomes `SYNC 128`, or `RECORDING`, or
  `NO MIDI` when a mode is on but nothing is behind it. Web MIDI is Chrome, Edge
  and Opera; a browser without it, or a refused prompt, reads `UNAVAILABLE` with
  the reason shown.
- **`F3` shows the form.** Press it and each bar of the order wears the section
  it came from, so you can see the chorus arrive. A section that names the drum
  machine bar it plays shows it beside the name (`CHORUS m2`), and `M` (or the
  `DRUM BAR` button) walks that bar from `off` through the bars the machine has,
  so a chorus can switch beats without a `machine order` line. Edit the order by
  hand in `F3` and the labels disappear, because the form is no longer a
  description of what plays — the sections themselves stay, and one `arrange`
  line brings the form back.
- **`order` still works**, and the last of the two that a script writes is the one
  that counts.
- **The app mentions a form you are not using.** Under the summary after a script
  applies, a section the arrangement never plays is named, and a song that defines
  sections and plays a plain order is told that one `arrange` line writes the form
  back. Observations, never errors — an unused part is a decision you are allowed
  to make.
- **The app notices things while you work.** Those same observations — an empty
  pattern, a channel with no notes, a stack of layers turned up loud enough to
  clip, a form nobody arranged, an export range past the end of the song — are
  said out loud the moment they become true, in the toast at the right of the
  screen, whether you wrote the song with the mouse or with a script. Something
  that is still true is never repeated, so a remark means a CHANGE. The line under
  the header readout keeps the ones still true (`NOTICED 1 / 2 · TRACK 3 HAS NO
  NOTES`); click it to walk the list, and each click shows the whole sentence,
  including the example of how to fix it. The line is not there when there is
  nothing to say, which is what makes its presence worth a look.

## The loop a song hangs on (progression)

The other half of a song's shape is what the chords are doing while the form
repeats. A **progression** is that as an object on the song: a list of chords and
how long each one lasts, written once, with the parts that play it FOLLOWING it.

```script
new
song "FOUR CHORDS"
tempo 96
tracks 2
progression 1 6 4 5

track 1 "KEYS" voice pad  poly 3
track 2 "BASS" voice bass

chord 0 1 follow      # the loop's chords, one a beat
note  0 2 follow      # the same four roots underneath
```

- **Nothing plays it on its own.** Like a `section`, a `progression` line is a
  DEFINITION: on its own it changes nothing you can hear.
- **Two lines use it.** `chord ROW TRACK follow` writes the loop's CHORDS from
  that row on, one chord per chord of the loop, each held for its own length;
  `note ROW TRACK follow` writes the loop's ROOTS — the bass line under it. Both
  WRITE NOTES, so what you end up editing is an ordinary grid, and the loop is
  what you keep working on.
- **A chord is named two ways**, exactly as `chord` names one: by NAME (`Am`,
  `F#7`, `Cmaj7`), or by DEGREE (`1`–`7`, the chord on that step of the song's
  key). `progression 1 6 4 5` is A minor's `Am F Dm Em` — and the same four
  numbers are the right four chords in any key you move the song to.
- **`hold N` says how many steps each chord lasts** (1–64, and last on the line).
  The default is four — one beat — which is what fits four chords in one bar.
  `hold 8` is two chords to the bar.
- **A `chord … follow` channel needs `poly` at least as wide as the widest chord**
  (3 for a triad, 4 for a seventh); otherwise the line is refused and says so.
- **The loop is one for the whole song.** A song that changes progression writes
  the change as `chord` lines, or hangs it all on a longer loop.

## The RECORDER page (audio in and out)

The RECORDER is the one page about AUDIO rather than notes, and its two halves are
the two doors a recording has always had — brought onto one screen.

**INPUT.** The top row is the microphone: a device you pick, a live level meter
with a `dBFS` readout and a `CLIP` lamp, and `● RECORD` (or `R`). The microphone is
opened only when YOU ask for it — clicking the meter, the device row, or `RECORD`
— and it is released when you leave the page, so nothing listens behind your back.
A build without a microphone says so in words rather than showing a dead meter.

**TAKES.** The left panel lists the takes the app holds, each with a waveform
preview and where it came from (`RECORDED` or `IMPORTED`); `+ IMPORT AUDIO` loads
a `.wav` into the bank and the list alike.

**WAVEFORM.** The centre panel is the selected take drawn from its decoded
samples, with four handles: the two green **TRIM** ends choose the part that is
USED, and the two purple **LOOP** points choose the part that repeats inside it.
Drag a handle, or step it from the `THIS TAKE` fields beside the waveform; `TAB`,
`[` and `]` walk the handles, `-` `=` zoom and `0` fits. `▶ HEAR TAKE` plays the
window through the selected channel's strip — trimmed, and looped when
`⟲ LOOP ON` is lit — and `RESET TRIM` puts the handles back.

**USE IN SONG.** Pick a channel, then `▶ GIVE TO CHANNEL` points it at the
take's recording. That is the ONE action here that touches the song, and it is one
`Ctrl+Z`. `REMOVE TAKE` drops it from the bank (press twice).

```
record HOOK                # capture a take (a browser needs a microphone)
record trim HOOK 0.1 2.0   # use 0.1s..2.0s of it, from its own start
record loop HOOK 1.0 3.0   # loop 1.0s..3.0s inside that window
record select HOOK         # which take the page shows
```

**A take is APP state.** The bytes live beside the sample bank, never in the
song: `SAVE AS SCRIPT` does not write one, `Ctrl+Z` does not bank one, and a file
never carries one. The song holds only the NAME a channel writes with `sample
BRK02`, so a take recorded here plays on any `wave sample` channel — and a name
the app does not have plays the built-in one-shot, exactly as any missing sample
does. A trim is a WINDOW the take plays through, never a cut to your `.wav` — and
it is a window that PLAYS: a channel given the take sounds its trim and its loop
during playback and in the audio exports, so the shape drawn here is the shape
heard.

**EXPORT SONG.** The band along the bottom is the same export `F2 → EXPORT…`
runs. `WHOLE SONG` renders all of it and `BAR RANGE` renders the bars you set with
the `START`/`END` steppers; `LOUDNESS TARGET` walks the same ladder (it applies to
the audio exports only, since MIDI carries no level). `EXPORT WAV`, `STEMS ZIP`
and `EXPORT MIDI` call the identical producers — so the file that lands on disk is
the same whichever screen asked. See [`09-song-files.md`](09-song-files.md) for
what each export writes.

## Hearing something in 30 seconds

1. Press **SCRIPT**.
2. Press **LOAD EXAMPLE**.
3. Press **APPLY**.
4. Press **SPACE**.

You now have a four-channel bar playing — and the piano has lit up seven keys,
because the example declares `key A minor`. Press a dimmed key and the inspector
will tell you it is `NOT IN A MINOR`. That is the whole guide: the bright keys
agree with each other, and you never have to count semitones. Change `tempo 128`, or `steps 32` to
turn the bar into two, or a single note, then press `Ctrl+Z` and APPLY again to
compare.

When you have something worth keeping, press **`F2`** and `SAVE AS SCRIPT`. What
lands on disk is the same text you just pasted, so it can be edited in any text
editor, mailed to a friend, or pasted back in tomorrow.

The **`MCP`** button in the same box answers the other half of that: instead of
typing the script yourself, let an AI agent write it. The page tells you the one
command that starts the agent server and the endpoint to give your MCP client;
the agent then has this whole language as tools — it can ask what words this build
speaks, check a script, apply one, read the songs already on your disk, and write
a `.mid`. It can also SAVE a song of its own, which lands in `storage/songs/agent/`
as an ordinary file: open it with `F2` → `OPEN`, or paste what the agent hands back
into the box and press `APPLY`, exactly as above.

## The words, defined

- **Song** — the whole thing: a title, a tempo, a list of channels, a list of
  patterns.
- **Track / channel** — one INSTRUMENT. It has a name, a SOUND (a named voice or
  a waveform plus nine knobs), a mute state, and one note per step at most.
  Channels 1–8, and a channel may be **polyphonic** (`track 3 poly 6`), holding up
to eight notes at once, so notes that overlap in TIME ring through each other
  rather than each new one cutting the last.
- **Step / row** — one slice of time, numbered from 0. Four steps make one beat
  by default, so 16 steps is one bar of 4/4.
- **Pattern** — a grid of steps across all channels: **16 steps by default, up to
  512**. A song may hold up to 64 of them. Only one is shown at a time.
- **Cell** — the meeting of one step and one channel. It is either empty or it
  holds one note.
- **Starter** — a whole worked skeleton of a genre (`start house`), which the app
  applies the way it applies any script: the same lines, one undo step, editable
  everywhere. See [Starting from a genre](#starting-from-a-genre).
- **Progression** — the chord LOOP a song hangs on: a list of chords and how
  many steps each lasts, written once with `progression` and played by a channel
  that `follow`s it. See
  [The loop a song hangs on](#the-loop-a-song-hangs-on-progression).
- **Follower** — a line that WRITES a progression's notes into cells: `chord 0 1
  follow` for the chords, `note 0 4 follow` for the roots. The notes it writes are
  ordinary cells, so the grid stays the song.
- **Note** — a pitch, written the tracker way: `C-4`, `C#4`, `A#3`. Always three
  characters so columns line up.
- **Waveform** — the shape the synthesizer plays: square (bright, buzzing),
  triangle (soft, hollow), sawtooth (reedy, buzzy), sine (pure, round).
- **Layer** — one oscillator of a channel's sound. A channel has between one and
  four, stacked, and they all play together; layer 1 is the channel's voice. See
  [Layers (F7)](#layers-f7).
- **Effect** — something done to a channel's sound on its way out: drive, crush,
  chorus, punch, tilt or gate. Each is a percentage where `0` is off. See
  [Effects (F7's FX page)](#effects-f7s-fx-page).
- **Channel name** — a label of up to 16 capitals, set by clicking it in the
  TRACKS panel or by a script's `track 2 "BASS"`.
- **Key** — which notes belong to the song, as a note plus one of eight scales
  (`major`, `minor`, `harmonic minor`, `dorian`, `mixolydian`, `phrygian`,
  `blues`, `pentatonic`). Set it in the
  transport's `KEY` control or with `key D minor`. It is a map, not a rule:
  nothing is ever snapped, blocked or refused.
- **BPM** — beats per minute. At the default four steps per beat a step lasts
  `60 / (bpm × 4)` seconds: at 120 BPM a step is 0.125 s and the 16-step loop
  lasts exactly 2 seconds.
- **Beat (grid resolution)** — how many steps make one beat. Four by default;
  a script can change it with `beat 8`, or say the same thing in note values:
  `grid 8t` is eighth-note triplets (three to the beat) and `meter 7 8` is seven
eighth notes to the bar. Those two are sugar over `steps` and `beat` — a bar is
  still two numbers underneath, so a song shaped with `meter 7 8` saves as
  `steps 14` and `beat 2`.
- **Lane** — one value that MOVES over bars instead of simply being: the riser, the
  fade, the filter opening. Written with `automate 3 bright 10 95 bars 1 to 4`,
  drawn on the **ARRANGER**, saved in the song. See
  [Making something move](#making-something-move-automate).
- **Page** — one full screen of the app (TRACKER, DRUM MACHINE, MIXER, ARRANGER,
  LIVE, RECORDER), chosen from the header dropdown or with `page arranger`. A
  session setting: no file carries one.
- **Take** — a recording you captured on the **RECORDER**, as app state: it lives
  beside the sample bank, never in the song, and a channel reaches it with
  `sample NAME`. `record HOOK` captures one, `record trim`/`record loop` shape its
  window, `record select` picks the one the page shows.

Next: [`02-music-primer.md`](02-music-primer.md) for the musical vocabulary, or
straight to [`03-script-reference.md`](03-script-reference.md) if you already
read music.
