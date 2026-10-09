# 09 — Saving and opening songs

Press **`F2`** and you get the app's whole relationship with files. The four that
are about the song itself:

| Item | What it does |
| --- | --- |
| `NEW SONG` | Throws the current song away and starts from a blank one. |
| `STARTERS…` | Throws it away and starts from a whole WORKED skeleton instead — `HOUSE`, `LOFI` or `BALLAD`. One undo step, like NEW. |
| `OPEN FILE…` | Reads a `.txt` Tracklet Script, a `.json` song file or a `.mid`/`.midi` MIDI file from disk. |
| `SAVE AS SCRIPT (.txt)` | Writes the song out as Tracklet Script. |
| `SAVE AS JSON (.json)` | Writes the song out as plain data. |
| `EXPORT…` | A PAGE holding the three ways a song leaves — `EXPORT AUDIO (WAV)`, `EXPORT STEMS (.zip)`, `EXPORT MIDI (.mid)` — and the `RENDER` row that says WHICH BARS they write. |

`F2` again, `Esc`, or a click anywhere closes the menu. While it is up the app
is paused behind it, so nothing you type can reach the song.

`STARTERS…` is the fourth way to get a song into the app and the only one that
writes one for you: it opens a page listing the genre starters, and picking one
applies it — the same line a script would write (`start house`), which is why the
result is an ordinary song rather than a special kind of file. A starter carries
**no file format of its own**: it writes statements the language already has, so a
song that began from one saves as the version its own features need (a ballad with
a `progression` in it is version `28`, not a version about ballads) and opens
anywhere this build is.

There is no "are you sure?". `NEW SONG`, `STARTERS…` and `OPEN FILE…` are each
**one undo
step**, so `Ctrl+Z` is the confirmation — and unlike a dialog, it also un-does
the times you were sure.

## A song has two shapes on disk

Both formats hold **the whole song**: its title, its key, its tempo (and any
TEMPO MAP that changes it), grid length,
grid resolution, its FEEL (`groove`, and how much it `swing`s), its ROOM
(`reverb`/`echo`), every channel
(name, SOUND, LEVEL, PAN, EXPRESSION, SENDS, mute) and
every pattern with every note. A channel's sound is its voice — a waveform and the nine knobs — so a
hand-tweaked instrument travels with the song, and its LEVEL travels with it too,
so a balanced song arrives balanced. (Solo does not: it says how you were
listening, not what the song is.) Neither is a project format with hidden state,
and neither needs the app
to interpret anything: a script is the app's own notation, and the JSON is the
app's own data.

The **master volume** is the one setting that is not part of a song AND still
travels in a file — a song is notes and structure, and the level is a property of
the room. It appears in both formats and is simply absent when you have never
moved the slider, in which case opening the file leaves your current level alone.
The other five session settings a SCRIPT can set — the octave, the theme, the
solo, what one key writes, and whether notes are auditioned — never travel in a
file at all, because they are how YOU are working rather than what the music is:
see [what is deliberately not in a file](#what-is-deliberately-not-in-a-file).

### Tracklet Script (`.txt`) — the readable one

This is the same text the `SCRIPT` panel takes, written the way a person would
write it by hand: a comment banner, then the header statements, then one grid
row per step.

```script
new
song "TWO BARS OF NOTHING MUCH"
tempo 124
beat 4
steps 32
swing 45
groove backbeat
reverb 30
tracks 3

track 1 "KEYS"  voice glass level 100 glide 20 vibrato 25
// the bass stays dry and out of the echo; the tick is a little right and wet
track 2 "BASS"  voice sub   level 65 pan L20 verb 0 echo 0
track 3 "TICK"  voice hat   level 40 pan R35 echo 60
mute 3

pattern 1 "A"
C-4 B-2 .  
E-4 .   .  
G-4~60 B-2 C-6
E-4 .   .  

pattern 2 "B"
copy 1 2
note 0 1 A-4
note 8 1 C-5
```

Rules worth knowing, because a file you write by hand has to obey them too:

- Every line starts with a **command word**, a **pitch**, or nothing. A line
  whose first token is not a command word is a **grid row**, one step per line,
  one column per channel.
- `.`, `..`, `...`, `-`, `--`, `---` and `_` all mean "this step is empty".
- Rows count **from 0**, tracks count **from 1**.
- A `#` starts a comment when it BEGINS a word; `//` starts one anywhere. So
  `C#4` is a note and `# notes` is a comment.
- The file **replaces** the whole song when it is opened, exactly as if it began
  with `new`. A file without `new` still replaces — a file's meaning must not
  depend on what happened to be on screen.

A song with a chord LOOP writes one `progression` line above its patterns —
`progression Am F C G hold 8` — and the channels that follow it are written as the
NOTES they wrote, like every other part. So a saved script is still a flat grid:
the loop is what the author can keep working on, and the followers are what the
song actually plays.

The full grammar is [the script reference](03-script-reference.md); the recipes
are in [the cookbook](04-cookbook.md).

`SAVE AS SCRIPT` is the exact inverse of the language, and the test suite proves
it: a song written out and read back is compared note for note, channel for
channel, including a channel named `OFF`, a shift-clicked `DEEP WAVE`, a mute, a channel
turned down to `level 45` and a non-default `beat`.

One case is worth knowing. A channel whose sound is one of the **built-in
voices** is written by NAME (`voice pad`, `voice hat`), because those exist
everywhere. A sound the user SAVED (`F4` → `SAVE AS…`) is written as its
WAVEFORM AND KNOBS instead, because the name lives in that one browser and a file
must not depend on it. Both are exact: the song sounds identical wherever it is
opened — a saved sound's NAME is simply not part of the music, so it is the one
thing a file does not carry.

That holds for a saved sound that carried LAYERS too. The `stack` a channel has is
the same whether the layers were dialed in by hand or handed over by a name, so a
song built from a saved supersaw writes that supersaw out and opens correctly on a
machine that has never heard of it — and a file naming a saved sound whose stack
differs from the one in the channel is still refused rather than half-opened.

### The song file (`.json`) — the lossless one

Numbers in, numbers out, no notation in between. Nothing here depends on the
language being expressive enough to spell something, so this is what a tool
should read and write.

```json
{
  "format": "tracklet-song",
  "version": 12,
  "volume": 70,
  "title": "TWO BARS OF NOTHING MUCH",
  "bpm": 124,
  "stepsPerBeat": 4,
  "steps": 32,
  "tempoMap": [{ "slot": 2, "bpm": 90, "slide": true }],
  "swing": 45,
  "groove": "backbeat",
  "reverb": 30,
  "tracks": [
    { "name": "KEYS", "voice": { "wave": "triangle", "bright": 90, "sweep": 40, "noise": 12, "attack": 8, "ring": 85, "thick": 60 }, "muted": false, "level": 100, "glide": 20, "vibrato": 25 },
    { "name": "BASS", "voice": { "wave": "sine", "bright": 12, "noise": 0, "attack": 5, "ring": 95, "thick": 0 }, "muted": false, "level": 65, "pan": -20, "verb": 0, "echo": 0 },
    { "name": "TICK", "voice": { "wave": "square", "bright": 100, "duty": 25, "noise": 90, "attack": 0, "ring": 6, "thick": 0 }, "muted": true, "level": 40, "pan": 35, "echo": 60 }
  ],
  "patterns": [
    { "name": "A", "steps": [[60, 35, null], [64, null, null], [[67, 60], 35, 72]] },
    { "name": "B", "steps": [[69, 35, null], [72, null, null]] }
  ]
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `format` | string | Always `"tracklet-song"`. What makes a file recognisable. |
| `version` | number | The format version. This build writes `12` for a plain song, `13` for one that STACKS LAYERS, `14` for one whose channels carry EFFECTS, `15` for one whose MIX does, `16` for one where a channel DUCKS, `17` for one where a value MOVES over bars, `18` for one whose bars have NAMES, `19` for one where a PART has a feel of its own `20` for one with a POLYPHONIC channel and `21` for one whose channels FILTER differently, `22` for one whose channels are mixed in GROUPS, `23` for one where a NOTE says how it is played, `24` for one where a CELL holds a chord, `25` for one where a cell NAMES a DRUM, `26` for one whose DRUMS play a named KIT, `27` for one that names a SAMPLE of yours, `28` for one that hangs on a chord PROGRESSION, `29` for one whose drums are a KIT OF YOUR OWN, `30` for one that puts the CABINET effect (`cab`) on a channel or on the mix, `31` for one that puts the TAPE machine (`tape`) anywhere, `32` for one that sends a part down a TELEPHONE (`radio`), `33` for one that lays a RECORD (`vinyl`) under a channel or the mix, `34` for one whose channels VARY their hits (`robin`) or their tone by velocity (`touch`), `35` for one whose channels WANDER (`drift`), `36` for one played at a master `speed` other than normal, `37`, `38`, `39` and `40` for a song with a DRUM MACHINE (a bar, more than one bar, a pad naming a recording, and a section naming a bar) `41` for a song with SCENES — the LIVE page's launch rows — and `42` for a song with the ARP page's DIALS, and it reads all of them. `13` was the first version that is not just "more optional fields", and the reason is the reason for all of them: an older build reading a `stack` it has never heard of would ignore it and play the channel's voice alone — half the sound, with no complaint at all — so a stacked song says `13` and is refused in words ("written by a newer Tracklet") rather than opened wrong. A song that stacks nothing, shapes no channel and shapes no mix still writes `12`; a version-1 file (which has a bare `wave` instead of a `voice`), a version-2 file (which has no room or pan), a version-3 file (which has no velocities), a version-4 file (which has no glide or vibrato), a version-5 file (which has no sends), a version-6 file (which has no groove), a version-7 file (which has no tempo map), a version-8 file (which has no pulse duty), a version-9 file (which has no filter sweep), a version-10 file (which has no amp decay or release) and a version-11 file (which has no tuning) all still open, sounding exactly as they always did. A newer number is refused rather than guessed at. |
| `volume` | number, optional | The master level, 0–100. Omit it to leave the reader's level alone. |
| `title` | string | The song's title. At most 32 characters, the room the header bar has. |
| `key` | object, optional | The song's key: `{ "root": "D", "scale": "minor" }`. `root` is any note name; `scale` is `major`, `minor`, `harmonic-minor`, `dorian`, `mixolydian`, `phrygian`, `blues` or `pentatonic`, and defaults to major. Omit the whole object and the song opens in C major. |
| `bpm` | number | 40–300. Clamped if it is outside. |
| `stepsPerBeat` | number | Grid resolution: how many steps make one beat. 1–16, clamped. |
| `steps` | number | How many steps every pattern has. 1–512, clamped. |
| `tempoMap` | array, optional | Where and how the tempo CHANGES: `{ slot, bpm, slide }`, at most 32 of them. `slot` is the bar it lands on, 1–64, the same 1-based slot `order` counts; `bpm` is 40–300 (clamped); `slide` is `true` to lean evenly into the bar from the previous change and omitted (a step) to change on the bar line. Two points on one bar are allowed and the later one wins. Omit the field and the song holds its `bpm` from the first bar to the last, which is what every file written before tempo maps means — absent and empty mean the same thing. A point whose bar is not a whole bar in range, or whose `bpm` is not a number, is **refused**, because a tempo that silently disappears is a song at the wrong speed. |
| `swing` | number, optional | How much the song lilts, 0–100. Clamped. Omit it and the song is STRAIGHT, which is what every file written before swing means. |
| `speed` | number, optional | The master tape speed, 25–400 (clamped), as a percent of the written speed. One number that moves pitch and time TOGETHER: `50` plays the song twice as long and an octave lower, `200` twice as short and an octave higher. Omit it and the song plays as written, which is what every file written before a transport could be moved means — and `"speed": 100` is the same value, so it is not written. A song with one is written as version `36`, so an older build refuses it rather than playing it at the wrong speed. |
| `groove` | string, optional | The named feel the song is played with: `backbeat`, `offbeat`, `shuffle`, `laid-back`, `pushed` or `human`. Omit it and the song is `straight`, which is what every file written before grooves means. A name rather than a number — **an unknown one is refused with the list**, because a groove nobody knows is not a taste with bad arithmetic but a file that meant something else. |
| `kit` | string, optional | Which four patches the song's drum hits play: `studio` (the four presets, and the default), `808`, `brush`, `rock`, `metal` or `dusty`. Omit it and the drums are the presets, which is what every file written before kits means — and `"kit": "studio"` is the same value, so it is not written. A name rather than a table of patches, because a kit is chosen rather than dialled; an unknown one is **refused with the list**, because the wrong kit plays the right beat on the wrong drums and nothing in the notes would ever say so. A song that names one is written as version `26`, so an older build refuses it rather than saving the presets back over it. |
| `reverb` | number, optional | How much of the song is fed to the room reverb, 0–100. Clamped. Omit it and the song is DRY, which is what every file written before the room existed means. |
| `echo` | number, optional | How much of the song is fed to the beat-synced echo, 0–100. Clamped. Omit it and the song has no echo, again meaning every older file. |
| `poly` | number, optional, per channel | How many notes this channel may hold AT ONCE, `1`–`8` (clamped). `1` is monophonic and is what a channel without the field means, so a song with no wide channel writes no `poly` key at all and stays at version 12. `version` is `20` whenever any channel is wider than one. A value that is not a number is refused rather than guessed at. The reason this is a version rather than a decoration is the sharpest one here: an older build reading `poly 4` would cut every overlap back to one note — not ignore a setting, but play a quarter of the chord, and sound perfectly fine doing it. When the notes run out the OLDEST gives way, and the quietest among notes that began together, which is the same rule the app plays by. |
| `shape` | string, optional, per channel | Which PART of the sound survives this channel's filter: `round` (the low-pass, and the default), `sharp` (a high-pass), `nasal` (a band-pass) or `hollow` (a notch). Aliases are accepted in a file exactly as they are in a script (`lowpass`, `hp`, `bandpass`, `notch`), and writing `round` is the same as omitting it. Omit the field and the channel is the low-pass every note here has always been, so a song that names no shape writes no `shape` key at all and stays at version 12; `version` is `21` whenever any channel names one, because an older build reading `hollow` would play the channel through the filter it has always had — a different instrument with nothing in the sound to say so. An unknown name is **refused** rather than ignored, for the same reason a refused `groove` is. |
| `groove` | string, optional, per channel | This channel's OWN feel, overriding the song's `groove` for this part alone: one of `straight`, `backbeat`, `offbeat`, `shuffle`, `laid-back`, `pushed`, `human` (aliases accepted). Omit it and the channel follows the song, which is what every file written before a part could have a feel means. Only channels that disagree with the song carry one, and `version` is `19` whenever any does. An unknown name is **refused** rather than ignored, because falling back to the song's groove would play something other than what the file asked for, with nothing to say so. |
| `humanize` | number, optional, per channel | How much this channel is PLAYED rather than typed, `0`–`100` (clamped). `0` is a machine and is what a channel without the field means, so a song nobody humanises writes no `humanize` key at all. The wobble is a seeded hash of the step and the channel, so it is the same wobble in every render and two humanised parts do not move in lockstep. A value that is not a number is refused rather than guessed at. |
| `duck` | number, optional, per channel | How far this channel pushes the rest of the mix down while it plays, `0`–`100` (clamped). `0` is off and is what a channel without the field means, so a song nobody pumps writes no `duck` key at all and stays at version 12. Only the channels that duck carry one, and `version` is `16` whenever any channel does. A value that is not a number is refused rather than guessed at, because a duck that quietly became full-on would reshape a mix nobody asked to change. |
| `sections` | array, optional | The song's FORM: `{ "name": "VERSE", "bars": [1, 1, 2, 1] }`, at most 24 of them. `name` is one word — letters, digits, `-`, `_`, up to 12 characters (tidied: upper-cased and cut, because a long label is not a song that plays wrong), and `bars` is the pattern numbers that section plays, 1–64 (clamped), at least one of them. An optional `"machine"` names the drum machine BAR the section plays (1–16, clamped), which is how a beat follows the form; omit it and the machine's own `order` decides. Omit the field and the song has no names for its bars, which is what every file written before form existed means — and a song with no sections writes no `sections` key and no `arrangement` key at all, so it stays at version `12`. A section with no name, no bars, or a bar that is not a number is **refused**, because a form that silently loses a bar is a song whose names no longer mean anything. |
| `arrangement` | array, optional | The section NAMES the `order` was laid out from: `["VERSE", "VERSE", "CHORUS"]`, in playing order, each one a section this file defines. It is a CLAIM about the order rather than a second order — `order` is what plays — so it is kept only when it expands to exactly the same bars, and DROPPED (not refused) when it has drifted, because a label is not music. A name the file does not define is **refused**: that is a file written by something that meant something else. Only written when it is there, so a song whose form was never named writes neither key. |
| `scenes` | array, optional | The LIVE page's LAUNCH GRID: `{ "name": "VERSE", "clips": [1, 1, null], "machine": 2 }`, at most 32 of them. `name` is one word — letters, digits, `-`, `_`, up to 16 characters (tidied: upper-cased and cut) — and `clips` is one entry per channel, a 1-based PATTERN number or `null` for a channel that is silent; a row is fitted to the file's own channel count, so a file that names fewer clips leaves the rest silent, and a pattern number that is not one this file has falls back to silence. The optional `"machine"` names the drum-machine BAR the scene performs (1–16, clamped), which is the machine column of the grid; `null` (or absent) sits the machine out. Omit the field and the song has no live set, which is what every file written before scenes means — a song with no scenes writes no `scenes` key at all, so it stays at version `12`. A song with one is written as version `41`, for the drum machine's reason: an older build would drop the key and save the set away, so a live set is a version rather than one more optional field. Which scene is PLAYING is **not** here — a launch is a performance, like `solo`, and it never travels. |
| `arp` | object, optional | The ARP page's DIALS: `{ "direction": "updown", "octaves": 3, "rate": 2, "gate": 60, "mode": "source" }`. `direction` is `up`, `down` or `updown` (the chord modifier's own spellings, with `asc`/`desc`/`both` read as aliases) and `mode` is `chord` or `source`; both are **refused by name** when unknown, the rule a `groove` follows. `octaves` is how many octaves the walk climbs, `1`–`4` (clamped); `rate` is how many steps each note occupies, `1`–`4` (clamped); `gate` is how hard each note lands, `0`–`100` (clamped), which a `write` records as the cell's velocity. Every field defaults when omitted, so a partial object is read rather than refused. Omit the whole field and the song has no dials, which is what every file written before the page means — a song with none writes no `arp` key at all and stays at version `12`. A song with one is written as version `42`, for the drum machine's and the scene's reason: an older build would drop the key, keep the NOTES a `write` already put in `patterns`, and save back a song whose run can no longer be re-dialed. The written notes are ordinary cells, so nothing else in the file changes. |
| `progression` | object, optional | The chord LOOP the song hangs on: `{ "chords": ["Am", "F", "C", "G"], "hold": 8 }`, at most 16 chords. Each chord is written as a NAME (`Am`, `F#7`, `Cmaj7`) or a scale DEGREE (`1`..`7`), the same two spellings the language takes and parsed by the same two parsers, so a file and a script can never disagree about what `Dm7` means; `hold` is how many STEPS each chord lasts, `1`–`64` (clamped), and defaults to 4, one beat at the default grid. Omit the field and the song has no loop, which is what every file written before progressions means — a song without one writes no `progression` key at all and stays at version `12`. Written as the chords themselves rather than as resolved notes, because a loop is a decision about HARMONY and not a claim about a register: which octave the bass plays them in is the follower's line, and a file storing `A2 C3 E3` would have made that decision for it. A song with one is written as version `28` — a version rather than one more optional field, for the drum's and the sample's reason: an older build would drop the key, keep the cells the followers WROTE, and save back a song with the right notes and no way to write the next bar of them. Nothing reads the loop unless a line asks to follow it, so the NOTES are always in `patterns` like any other, and a file whose loop changed but whose grid did not sounds exactly the same. |
| `buses` | array, optional | The mix's GROUPS: `{ "name": "DRUMS", "level": 70 }`, at most 4 of them. `name` is one word — letters, digits, `-`, `_`, up to 12 characters (tidied: upper-cased and cut) — and it may not be `none`, which is the word that takes a channel back off a group. `level` is `0`–`100` (clamped), and it MULTIPLIES the channels on it: a group at `70` on a channel at `50` is `35`, and a group at `100` is the identity. Omit the field and every channel is on its own fader, which is what every file written before groups means — a song with no groups writes no `buses` key at all and stays at version `12`. A group whose name is not a word, or whose level is not a number, is **refused**. |
| `tracks[].sample` | string, optional, per channel | The NAME of a recording of yours this channel plays, e.g. `"BRK02"`. Omit it and the channel plays its own built-in sound, which is what every file written before samples existed means, so a song that names none writes no `sample` key and stays at version 12. A song with one is written as version `27` — a version rather than another optional field for the bus's reason: an older build would drop the key and save the channel as the built-in one-shot, so a part the author chose would come back as a different sound with nothing to say so. **The audio is not in the file** — a WAV is megabytes and a song is a few kilobytes of text — so this is a REFERENCE to something the app holds (`sample load`, or `sample import`), and the one key here that is checked for SPELLING and not against a list: a name this machine has no file for is not a broken file but a song written somewhere else, and the channel plays its built-in one-shot until the file arrives. Only a malformed name (a space, a leading digit, more than 16 characters) is refused. |
| `tracks[].bus` | string, optional, per channel | The group this channel is mixed with, by name: it must be a bus this file defines. Omit it and the channel is on its own fader, which is what every file written before groups means. A name this file has no bus for is **refused** rather than dropped, because falling back to "no group" would play the channel LOUDER than the file asked for, with nothing in the sound to say why. A song whose channels are grouped — or that defines a bus for channels added later — is written as version `22`. |
| `automation` | array, optional | The LANES that move a value over bars: `{ track, target, from, to, bars }`. `track` is a channel number 1–8, `target` is any of `bright`, `sweep`, `duty`, `noise`, `attack`, `decay`, `ring`, `release`, `thick`, `level` or `gate`, `from` and `to` are that target's own range (`0`–`100`, clamped) and `bars` is `[first, last]`, 1–64, the same 1-based slots `order` uses. Omit the field and nothing moves, which is what every file written before lanes existed means — absent and empty mean the same thing — and a song that moves nothing writes no `automation` key at all, so it stays at version `12`. A song with one is written as version `17`. Two lanes on one channel and one target compose: the later one takes over where it starts, and list order is preserved rather than sorted away. A lane whose `track` is not a channel this file has, whose `target` is not one of the eleven words, whose `bars` is not a pair, or that runs backwards is **refused**, because a rise that quietly disappears is a song that does not do what it says; a `from`/`to` outside the range is clamped like every other out-of-range number here. The effects, `pan` and the sends are deliberately NOT lane targets: each is a node that exists only above zero, so a curve cannot fade one in from nothing. |
| `master` | object, optional | The EFFECTS on the whole mix, by name: `{ "drive": 20, "tilt": 15 }`. Any of `drive`, `crush`, `cab`, `tape`, `radio`, `vinyl`, `chorus`, `punch`, `tilt`, `gate`, each 0–100 (clamped), each OFF at 0. Omit the field and the mix is clean, which is what every file written before a mix could be shaped means — and a clean mix writes no `master` key at all, so it stays at version 12. Only the effects that are ON are written, and `version` is `15` whenever any of the first six is — `cab`, `tape`, `radio` and `vinyl` are newer, so a mix using one of those writes `30`, `31`, `32` or `33` instead. |
| `tuning` | string, optional | The TEMPERAMENT the song is tuned by: `equal`, `just`, `pythagorean`, `meantone` or `septimal`. Omit it and the song is EQUAL-tempered, which is the frequency every note in every file written before tunings existed already played. A name rather than a table of numbers — **an unknown one is refused with the list**, like `groove`. The temperament is read against the song's `key`, so `just` in C is pure in C and the same file moved to D is pure in D; the tonic itself never moves. |
| `tracks` | array | 1–8 channels: `{ name, voice, stack, muted, hold, level, pan, glide, vibrato, strum, robin, touch, drift, verb, echo }`. `stack` is OPTIONAL and is the layers ABOVE the voice — a list of at most 3 of them, in playing order, each `{ wave, octave, detune, gain, bright, sweep, duty, noise, attack, decay, ring, release, thick }`. The channel's sound is its `voice` (which IS layer 1) plus this list, capped at 4 layers in all. `octave` is `-4`–`4` (clamped), `detune` is `-100`–`100` cents (clamped) and `gain` is `0`–`100` percent (clamped); omit any of the three and the layer is in unison, in tune and at full level. Omit `stack` entirely and the channel is the one-layer channel this app has always played, which is what every file written before layers means. A layer's nine knobs mean exactly what the voice's do, and any knob you omit takes the neutral default; `voice` is `{ wave, bright, sweep, duty, noise, attack, decay, ring, release, thick }` — the waveform and the nine 0–100 knobs. `wave` is one of `square`, `triangle`, `sawtooth`, `sine`, `noise` (the chip noise channel), `table` (the chip wavetable), `sample` (a one-shot from the built-in bank), `fm` (two-operator FM), `string` (a plucked Karplus-Strong string), `formant` (a vowel shaped by three resonances), `organ` (additive drawbar tonewheels, sustained), `granular` (a cloud of short grains, sustained), `font` (a soundfont's recorded instruments, which a channel plays only when one is loaded — see below), `reed` (a reed instrument: a buzzing exciter in a resonant tube, sustained), `brass` (a lip buzzing into a flared metal bore, sustained), `bow` (a bow dragging a string into a hollow body, sustained) or `mallet` (a struck bar with inharmonic partials, a one-shot) or `membrane` (a struck skin whose dense overtones thud and whose pitch droops, a one-shot) or `plate` (a struck plate whose few spread partials ring longest of all, a one-shot) — note that these are the SHAPES, distinct from the `noise` knob that mixes in hiss. `duty` means something different on each of them: the pulse width on a square, the register length on noise, the bank choice on a table, the slot on a sample, the modulation index on fm, the bank choice on a string, the vowel on a formant, the registration on an organ, the character on a granular, the preset on a font, the reed on a `reed`, the brass instrument on a `brass`, the bowed string on a `bow`, the bar on a `mallet`, the skin on a `membrane` and the plate on a `plate`. `duty` narrows a `square` into a pulse (`0` is a thin 12.5% pulse, `100` the full square) and is heard only on a square wave; Omit it and it is `100`, which is the full square every earlier file's square channels already played. `sweep` is the filter envelope: how far the brightness moves over a note, `0` being the steady tone every earlier file was already playing, so it too is omitted at its default. `attack`, `decay`, `ring` and `release` are the amp envelope — how the note arrives, how it settles, what level it holds and how long it rings on — and `decay` and `release` are likewise omitted at their default of `0`, which is the envelope every earlier file was already playing. Knobs are clamped if they are out of range, and any you omit take the neutral default. A bare `wave` string (with no `voice`) is still read, and means that shape with the neutral knobs. `hold` is how many steps a note on the channel rings for (1–16, clamped); omit it and the channel sounds a note per step, which is what every file written before note lengths means. `level` is where the channel sits in the mix (0–100, clamped); omit it and the channel is at full volume, which is what every file written before levels means. `pan` is where the channel sits between the speakers: `0` centre, negative left, positive right, −100–100 (clamped). Omit it and the channel is CENTRED, which is what every file written before panning means. `glide` is how far the channel slides from one note into the next, 0–100 (clamped); `vibrato` is how far its pitch wobbles, 0–100 (clamped); `strum` is how far its CHORD rolls, in steps 0–4 (clamped). Omit any of them and the channel is steady, does not slide and plays its chords as blocks, which is what every file written before expression means. `robin` is how much the channel's successive hits differ from one another, 0–100 (clamped), walking a fixed four-hit cycle; `touch` is how much a hit's TONE follows its velocity, 0–100 (clamped), darkening a soft note. Omit either and every hit is the hit exactly as written, which is what every file written before variation means; a song whose channels set either is written as version `34`. `drift` is how far the channel's pitch WANDERS — the wow and flutter of a worn transport, 0–100 (clamped), a slow wow at two rates plus a fast flutter. Omit it and every note holds the pitch it was written at, which is what every file written before drift means; a song whose channels wander is written as version `35`. `verb` and `echo` are the channel's SENDS — how much of it is fed to the song's reverb and echo, 0–100 (clamped). Omit either and the channel sends ALL of itself, which is what every file written before sends means (the room then reaches every channel as it always did); `0` is what keeps an instrument out of the hall. |
| `order` | array, optional | The bars the song plays, as 1-based pattern numbers: `[1, 2, 1]`. 1–64 slots, each naming a pattern this file has. Omit it and the song plays its first pattern, which is what every file written before the order existed means. |
| `patterns` | array | 1–64 patterns: `{ name, steps }`. |
| `patterns[].steps` | array of arrays | The grid. `steps[row][column]` is the MIDI note number, or `[note, velocity]` when the note is not played at full force, or `null` for an empty step — where "note" may be a **LIST of pitches** when the cell holds a CHORD: `[[60, 64, 67], 100]` is a C major triad at one step on one channel. A chord always carries its velocity, because a bare list would be a cell whose LENGTH said something. A cell wider than the channel it lands on — more notes than that channel's `poly` — is **refused**, because a cell is one event and a narrow channel would play the top of the chord and drop the rest in silence. A cell holding a chord is written as version `24`, which an older build refuses outright rather than reading as a pitch it cannot spell. A cell may also hold the NAME of a **DRUM** — `"kick"`, or `["kick", 80]` when the hit is not at full force, or `["kick", 100, ">"]` with a gesture — where the word is one of `kick`, `snare`, `hat`, `wind`. The pitch the hit is played at is the kit's own and is NOT stored, because it is a fact about the kit rather than about this song (which four patches that kit PLAYS is the song's own `kit` field); a word the kit does not have is **refused** by name, because a silently dropped drum is a beat with a hole in it. A cell naming a drum is written as version `25`, for the reason a chord is written as 24: an older build finds a string where every earlier file had a number. Notes are 12–119; a velocity is 0–100 and clamped; up to `8` pitches fit in one cell; a pitch named twice is one note. A note that says how it is PLAYED carries a third slot: `[note, velocity, "articulation"]`, where the articulation is the suffix the script writes — `">"` slides into the pitch, `"*3"` is three hits inside the one step, `"!"` flams a grace hit into the beat and `"!!"` drags two, `"^2"` scoops up onto the note from a whole tone below and `"v2"` falls a whole tone away from it, `">*3"` is both — and the velocity is written out even at full force, so `[60, 100, ">"]` can never be mistaken for `[60, ">"]` meaning a velocity. A cell with an articulation is written as version `23`: an older build would refuse the whole file rather than play a stutter as a plain note, and "a step must be null, a note, or `[note, velocity]`" is a sentence about the wrong thing where "written by a newer Tracklet" says what happened. A suffix this build cannot play is **refused** by name, and a cell whose third slot is not a string is refused too. |

Notes are MIDI numbers rather than note names on purpose: `60` is middle C, and
a note name would make the file depend on a spelling. (The app *displays*
`C-4`.)

## What OPEN will refuse, and what it will repair

A file is untrusted input, so `OPEN` is somewhere between strict and forgiving,
and the line is drawn where a person would draw it:

- **Repaired:** a tempo of `400` (in `bpm` or in a `tempoMap` point), a `steps` of
  `9000`, a grid resolution of `99`,
  any of the nine sound knobs written past 0–100, a `reverb`/`echo` past 0–100,
  a `verb`/`echo` send past 0–100, a `pan` past the ends of the stereo field,
  a LAYER's `octave`, `detune` or `gain` past its ends, a lane's `from`/`to`
  or `bars` past the ends of its own range,  a section name past its 12
  characters (cut, and upper-cased), a section's bars past 1–64, and a bus's
  `level` past 0–100.
  Out of range is a slider nudged too far; a groove nobody knows is refused, not
  repaired. A person nudges a slider; the
  number is clamped and the song opens.
- **Refused, with the fix:** a note outside `12..119` (or not a whole number), a
  waveform the synthesizer cannot play, a `voice` that is not an object or a
  knob that is not a number, a channel name longer than 16 characters, a title
  longer than 32, a key whose root or scale Tracklet cannot name, more than 8
  channels or 64 patterns, a missing grid, a tempo-map point that is not a shape
  at all or lands on a bar outside 1–64, a `stack` that is not a list of layers
  (or holds more than a channel can carry), a layer with no waveform,
  an `automation` lane that names a channel the file does not have, a target no
  lane can move, bars that are not a `[first, last]` pair, or a lane that runs
  backwards,  a section with no name, no bars, or a bar that is not a number,
  more than 24 sections, an `arrangement` naming a section the file does not
  define, more than 4 groups, a group whose name is not a word (or is `none`),
  a group whose `level` is not a number, a channel joining a bus the file does
  not have,  a `progression` that is not an object, an empty `chords` list, a
  chord that is not a name or a degree (`"H7"`), a chord written as something
  other than a string, more than 16 of them, or a `hold` outside `1`–`64`,  a
  step naming a drum the kit does not have, a `kit` naming a set of
  drums this build does not have, a `sample` that is not a name (a space, a
  leading digit, or more than 16 characters — a name this machine has no file
  for is NOT refused, because that is the fallback the whole design leans on),
  a file from a newer Tracklet, and
  anything that is not JSON or not a Tracklet Script. A malformed stack is refused
  rather than trimmed because dropping a layer quietly would open a song that
  sounds thinner than the file says — a lie about the music rather than a repair
  of it. Each
  complaint is reported — up to a dozen of them — in the menu's status area, and
  nothing is loaded.

That last part matters: `OPEN` is **all or nothing**, like applying a script. A
file that is wrong does not half-load, so the song you had is still the song you
have.

## MIDI, both ways

`OPEN FILE…` reads a **`.mid`** (or `.midi`) and `EXPORT MIDI` writes one — a
Standard MIDI File, the binary format every other sequencer in the world reads
and writes. It is how music comes IN and how it goes OUT, and the two halves are
inverses of each other on purpose: the writer is checked in the tests by writing a
song out and reading it straight back with the reader.

### Importing a MIDI file


The mapping is deliberately simple, and worth knowing before you look at an
import:

| A MIDI file's… | becomes… |
| --- | --- |
| each melodic channel (1–16) | one Tracklet channel, named `CH 1`… and given the voice its GM instrument suggests |
| the drum channel (10) | up to three channels — `KICK`, `SNARE`, `HAT` — by the pitch of each hit |
| a note's start | the NEAREST step of a sixteen-step bar (16th notes at four steps a beat) |
| a note's velocity (0–127) | a Tracklet velocity (0–100) |
| a channel's note lengths | that channel's `hold`, its MEDIAN length in steps |
| the first tempo event | the song's `bpm` (120 if the file never says) |
| the first track name | the song's title (else the file's own name) |
| each bar | one pattern, played in bar order |

The transpose is a QUANTIZATION: a file that swings hard or plays rubato comes in
on the grid, because a tracker has a grid and pretending otherwise would be a
lie about what was written. Everything the import cannot hold — a file longer
than 64 bars, a filter sweep, a controller — is dropped, and the OPEN result says
how many notes did not fit rather than leaving a silent gap.

If the file is not really a MIDI file, is truncated, or uses SMPTE time (frames
rather than beats), nothing is replaced: the reader refuses it in words, the same
way a corrupt script or song file is refused.

### Exporting a MIDI file

`EXPORT MIDI (.mid)` writes the song out for everything else: a DAW, a notation
program, a video editor, somebody else's sequencer. It is the same mapping read
the other way round.

| Tracklet's… | becomes… |
| --- | --- |
| every channel that has a note | one MIDI track, after a first track holding the tempo |
| a channel's notes | note-ons and note-offs on its own MIDI channel |
| a channel's SOUND | the General MIDI instrument its voice is nearest (a program change) |
| a KICK, SNARE or HAT channel — or any channel whose own hits NAME drums (`drum 0 4 kick`) | a hit on MIDI's drum channel (`36` / `38` / `42` / `44`), which is where a drum belongs |
| a channel's `hold` | how long its notes last, in steps |
| a note's velocity (0–100) | a MIDI velocity (1–127) |
| `steps` and `beat` | the grid: a step is a 16th on the default, and the ticks are written to match |
| the `bpm` and the TEMPO MAP | tempo events, one where each bar changes speed |
| the song's title and each channel's name | the file's track names |
| the ORDER | time: only the bars the song actually plays are written |
| the DRUM MACHINE's hits | one more MIDI track on the drum channel (`9`), each hit a short note at its pad's own pitch — so a beat made on the machine leaves the app too |

Two rules are worth knowing because they are what makes the file SOUND like the
app rather than merely count like it. A **monophonic** channel's note ends where
its next note begins, because that channel gives way to the note that follows it —
the length written is the length you heard, not the length typed. A **polyphonic**
channel (`track 3 poly 6`) keeps every note whole, so the overlap that a piano part
is made of is still there when the file is opened elsewhere.

What does **not** cross, and cannot: the sound itself (layer stacks, the six
effects, pan, the sends, the ROOM), the FEEL (`swing`, and a channel's `groove` and
`humanize`), automation lanes, named sections, and mix groups (a `.mid` has one
volume per channel and no vocabulary for a fader over four of them). A `.mid` holds notes, tempo and
instruments — it has no vocabulary for a filter sweep or a swing, and a writer that
pretended otherwise would be lying to whoever opened the file. The song is in the
`.json`; the MIDI file is the notes.

A song with no notes in it is **refused** rather than written as an empty file,
because this app's own reader will not open one ("this MIDI file has no notes in
it") and a download that cannot come back is worse than a sentence saying so. The
status line then tells you what left: `SAVED  rainy-window-loop.mid` and `64 notes
over 8 bars`.

And a round trip is real rather than approximate: a song exported and opened again
comes back with the same notes, on the same steps, at the same velocities, with the
same tempo, the same voices and the same `hold` — except where a channel's notes are
closer together than its `hold`, in which case the shortened lengths it comes back
with play exactly what the file played. That is the property the test suite asserts
— not a resemblance.

Two things a round trip does **not** keep, and both are the reader's rules rather
than the writer's. A melodic channel's name comes back as `CH 1`, `CH 2` … because
that is what an importer can know about somebody else's file (only the first track
name is read, as the song's title) — a drum keeps its name, because `KICK` is
recognised from its pitch. And a song that interleaves percussion with melodic
parts comes back with the drums LAST, since the drum channel is read after the
melodic ones. Nothing plays differently; only where it sits in the channel list.

## MIDI in, and the clock

A `.mid` is somebody's finished music arriving as bytes. Plug a keyboard into the
USB port and the OTHER kind of MIDI arrives — live, as you play it, plus the
pulses that say where the beat is. `F2 → EXPORT…` has one row for it, **`MIDI IN:`**,
and it has three stops you cycle by pressing it: `OFF`, `LISTENING`, `RECORDING`.

### The three stops

- **`OFF`** — the app asks the browser for nothing and lets go of any keyboard it
  had. This is where every session starts: nothing pops a permission dialog until
  you ask for one.
- **`LISTENING`** — what you play sounds on the channel under the cursor, and
  nothing is written. Plug the keyboard in to hear it through the song's sound.
- **`RECORDING`** — the same sound, and the note also lands IN the bar the
  playhead is on, on the channel under the cursor, while the song is running. A
  note played at a stopped playhead is heard and not written, because a live take
  is played to a running song — writing at a still playhead would stack every
  note on top of the last one. A whole take is one `Ctrl+Z`.

Turning the row on the first time asks the browser for MIDI access. The row turns
straight away and the sentence arrives when the browser answers; if the browser
has no Web MIDI at all (Safari and Firefox do not) or you click "deny", the row
reads `UNAVAILABLE` with the reason beneath it and the app carries on being a
tracker. A keyboard plugged in later simply appears — the app is already
listening.

### What arrives

| A MIDI message's… | becomes… |
| --- | --- |
| a note-on, with a real velocity | a note played on the chosen channel — and, while `RECORDING`, a cell in the bar the playhead is on |
| a note-on at velocity 0 | a note-OFF, which is the trick every synth uses |
| a note's velocity (1–127) | the cell's velocity (1–100), never 0 — the lightest touch is still a note |
| a clock pulse | a tempo measurement (24 to every quarter note / beat) |
| `start`, `continue` | the song begins, if it was stopped |
| `stop` | the song stops, if it was playing |
| a control change, pitch bend or program change | read and dropped — this model has nowhere for them to land, and a decoder that half-honoured them would be lying about what it read |

### The clock

The clock is the other half of "in sync": a device that plays a click can drive
the app's tempo and transport, so two machines run together rather than merely at
the same speed. The arithmetic is in `src/model/midiIn.ts`, and it is the part
worth knowing because it is where the care goes:

- **The tempo is the MEDIAN of the last beat's worth of pulse gaps**, not the last
  gap. A clock is a measurement and measurements jitter: one late pulse from a
  busy USB bus would move a mean by a whole BPM and a median by nothing. Gaps
  outside 2–250 ms are dropped first, so a clock that just started or just stopped
  cannot poison the reading, and the answer is clamped to the range a song's `bpm`
  may hold.
- **24 pulses make a quarter note**, so a tempo is `60000 / (median gap × 24)`.
- **A silent clock is noticed.** Nothing is sent when a clock goes quiet, so
  silence itself is polled four times a second; the `SYNC` word disappears within
  about a quarter of a second of the last pulse.

**What the app does NOT do is slave its audio scheduler to the pulses.** Playing
is scheduled against the audio clock — the one thing that actually keeps two
sounds together — so the app follows the clock's tempo and its start and stop, and
not the pulse train itself. That is a deliberate limit rather than a missing
feature: a tracker whose sample-accurate timing could be dragged around by a
jittery USB clock would sound worse, not more in sync.

### On screen

The **transport's status line** shows the MIDI word instead of `PLAYING`/`STOPPED`
while there is one worth showing: `RECORDING` while a take is armed and the song
is running, `SYNC 128` while a clock is arriving (with the tempo it is playing
at), and `NO MIDI` when a mode is on but no keyboard or clock is behind it — the
difference between "listening" and "waiting for a cable". The `F2` row itself
shows the mode and the input's name. Only one word fits beside `GROOVE`, which is
why the MIDI word replaces the transport word rather than crowding it.

## Exporting part of a song

All three exporters write the whole order by default. When you want a chorus
rather than a song, mark a **loop region** and they write only those bars:

- **By hand:** `F3` lists the bars, and `L` on a bar begins a region. `L` on the
  bar it ends at finishes it, the bars it covers wear `[` `]` brackets, and a
  third press on that end bar takes it off. The status line says what the region
  is after every press.
- **From a script:** `export bars 8 to 15` sets it, `export all` puts the whole
  song back. The two numbers count from 1, exactly as the `F3` list numbers them.
- **On screen before you export:** `F2 → EXPORT…` has a `RENDER:` row naming the
  region — `RENDER: THE WHOLE SONG` or `RENDER: BARS 8-15` — and pressing it goes
  back to the whole song. That row is the answer to "why is my export two
  seconds long?", which is the only way this feature can surprise anybody.

**A region is not part of the song.** The song is the whole song whether you
bounce four bars of it or all of it, so a region is session state like the master
`volume`, the `theme` and the solo: it is not in a `.json` file, `SAVE AS SCRIPT`
never writes the line back, and replacing the song (a `NEW SONG`, an `OPEN`, a
`starter`) clears it. Nothing in the song moves either — no mute, no shortened
pattern, no rearranged order; the exporters simply walk part of the order.

**A region is fitted to the song when it is used, and the fit is said out loud.**
A script may write `export bars 8 to 15` above the `arrange` line that makes the
order long enough to hold it, so the range is clamped rather than refused — and a
range that reaches past the last bar comes back with an advisory under the
summary saying which bars the export became. Nothing else about it is adjusted:
a region never changes what a bar CONTAINS.

**What a region does to each file.** The audio exports and the MIDI writer begin
at the region's first step, so `bars 8 to 15` is a file whose own bar 1 is the
song's bar 8: the timing, the tempo map and the swing are still the song's, and
the file simply starts later. That is what makes a bounced chorus line up when it
is dropped back into a project at that bar's time.

## At a target loudness

A `.wav` leaves at whatever the master fader happened to be. When the file has to
sit next to everything else in somebody's playlist — or a podcast feed, or a
broadcast chain — you want a **loudness target** instead:

- **From a script:** `export loud -14` normalises the audio exports to -14 LUFS,
  and `export loud off` hands the level back to the master fader. A target and a
  region are two clauses of one statement, either order: `export bars 8 to 15
  loud -14`.
- **By hand:** `F2 → EXPORT…` has a `LOUDNESS:` row. `ENTER` walks the ladder the
  services publish — `OFF`, `-23` broadcast, `-16` podcast, `-14` streaming, `-9`
  loud, and back to `OFF`.
- **MIDI ignores it**, because a file of notes has no level.

**The number means what it means everywhere else.** The measurement is ITU-R
BS.1770: the audio is frequency-weighted, averaged over 400 ms blocks, and the
quiet blocks are gated out, so `-14 LUFS` here is `-14 LUFS` in any service's own
meter. The calibration signal every chain is lined up with — a 1 kHz tone at -20
dBFS — reads -23.0 LUFS, and the weighting filter is built for the render's own
sample rate and checked against the coefficients the standard publishes for
48 kHz. Both of those are assertions in the test suite, not sentences in a
comment.

**A normalise is a gain, applied after the render.** It is linear, so it moves how
loud the file is and nothing else about it — no note, no level, no pan, no room —
and the same song normalised twice produces the same file both times. It is
also why a normalised export of a song with a `master` effect or a compressor in
the room is not the same performance normalised at the input: the effects saw the
level the song was written at, which is the only level at which "the same song"
means anything.

**A target the peak cannot reach is not reached.** Turning a quiet mix up to -14
may want a gain whose peak passes full scale. The app stops the gain at -1 dBFS
rather than writing a clipped file, and the status line says so —
`NORMALISED TO THE CEILING ... stopped before clipping`. An export that silently
clips would be worse than one that lands a decibel low, and one that refuses
outright would be useless on real material.

**A stem set normalises to ONE gain, decided by the mix.** Normalising each part
on its own would land each one on the target, which would leave the parts no
longer summing to the mix — and summing to the mix is the whole point of stems.
So a normalised stems export renders the mix first, measures that once, and
applies the single gain to every part. It is the one extra render this costs.

**A target is not part of the song, and unlike a region it survives one.** A
region names BARS of one song, so it is dropped when the song is replaced; a
target is a LEVEL, which is the thing a person prefers about everywhere their
music goes, so a `NEW SONG` keeps it exactly as it keeps the master volume. It is
in no file either way: `SAVE AS SCRIPT` does not write the line back, and no
`.json` carries one.

## Stems (`.zip`)

`EXPORT… → EXPORT STEMS (.zip)` writes the song **one `.wav` per channel**, in one
archive \u2014 the whole mix taken apart, for anybody who mixes somewhere else: a DAW,
a video editor, a collaborator, a mastering engineer. It is the export for the
person who does not want the app's mix, only the app's sound.

| The song's\u2026 | becomes\u2026 |
| --- | --- |
| every channel that carries a note | one stereo `.wav` of its own \u2014 that channel through the same synth, the same six effects, the same level, pan and sends |
| its FORM | the same: a stem is the whole `order`, played once, with the same tail |
| each channel's name | its file name: `night-bus-01-kick.wav`, `night-bus-02-bass.wav` |
| a song with no notes in it | a sentence rather than an archive |

**A stem is the part as it is HEARD.** Each file is one channel rendered alone
through the identical graph the mix came out of, which is what makes it a part
rather than an approximation of one: a channel with a stack sounds stacked, a
channel with a `duck` on it still pumps, and a channel that somebody else's kick
pumps is still pumped in its own file, because the pump is part of how that part
was played. Rendering every channel on its own is also why a stem export takes
longer than an audio export \u2014 it is the song, once per channel.

**What the parts add up to.** Put every stem in another program at 0 dB and you
have the mix back, with two exceptions, both of them at the very end of the chain
and both said out loud rather than hidden:

- A `master` effect (`drive`, `crush`) is not linear, so per stem it shapes ONE
  channel where the mix applied it to the sum of them. A song with a clean mix bus
  is unaffected.
- The compressor that holds a hot mix inside full scale is a compressor, so each
  stem gets its own gain smoothing instead of one pass over the sum. On a modest
  song that is under a half of one percent of the peak (about \u221265 dBFS); it grows
  only as the mix itself approaches full scale.

Neither moves a note, a level or a pan, and neither is audible on anything but a
song that is already at the ceiling. Nothing else about a stem set is approximate:
the notes, the timing, the sound, the effects, the level, the pan and the sends
are the app's own, produced by the app's own code.

**Which channels are in it.** The ones that CARRY something, in channel order. A
channel with no note anywhere is not a stem \u2014 it is an empty file that makes an
archive look broken \u2014 so it is left out, which is the same rule the MIDI writer
follows. The number in the file name is the CHANNEL, zero-padded (`01`, `02`, \u2026
`08`) so a folder sorts the way the song does rather than the way an alphabet
does, and the word after it is the channel's name reduced to lower case letters,
digits and hyphens, falling back to `track` for a channel nobody named.

**A `.zip` is a way OUT, not a format this app has.** Nothing here reads one
back: the archive is opened by the program you take it to, and the audio inside
is the same boring 16-bit PCM a single export writes, produced by the same
two-hundred-line encoder. There is no `stems` statement and no file version for
one: a stem set is what you DO with a song, not something a song is.

## A patch (`.patch.json`) — one channel's sound

A song is portable: `.txt` or `.json`, and either one opens on somebody else's
machine and plays. The SOUND inside it was not. A channel's sound lived in the
song that used it and in the library `F4` keeps on this machine, and neither
travels — so the supersaw you spent an evening on could be described in a message
and not handed over. `F2 → SOUND FILES…` writes ONE CHANNEL'S SOUND to a small JSON
document, and reads one back onto a channel.

**A patch is the sound, and nothing about the mix.** That is the line, and it is
worth reading twice because it decides every field:

| In the file | Left behind |
| --- | --- |
| the voice, and the layers stacked above it | the channel's `name` |
| the filter's `shape` | `level`, `pan`, `muted` — where it sits in the mix |
| the effects (`drive`, `chorus`, `crush`, `cab`, `tape`, `radio`, `vinyl`, `punch`, `tilt`, `gate`) | `bus` — which group it is mixed with |
| `hold` — how long a note rings | `duck` — a relationship with the OTHER channels |
| `glide` and `vibrato` — how the notes connect, how far they move | `groove` and `humanize` — the FEEL, which is how a part is played rather than what it sounds like |
| `verb` and `echo` — how much of it stands in the room | `poly` — a part's role in the arrangement |
| the NAME of the recording it plays | the room itself, the kit, the tuning, the form |

A patch that carried a level would silently re-mix a song the moment somebody
tried the sound in it, with nothing on screen to explain why. So a level you set,
a pan you placed and a group you joined all survive somebody else's sound
arriving — which is what makes a patch safe to try.

**It is not the same thing as a saved voice.** `F4`'s library is the INSTRUMENT:
a voice and a stack, saved with a name and reachable from a script (`track 1
voice MYPAD`). A patch file is the whole SOUND including its shaping, because a
sound that came back with its `drive`, its filter and its room stripped off would
not be the sound you saved — and nothing in the file would say which parts had
been dropped. One is a palette for the song you are writing; the other is the
thing you send to somebody.

**By hand:** `F2 → SOUND FILES…`. `SAVE PATCH <CHANNEL>` writes
`<channel>.patch.json` — the name comes from the CHANNEL, because that is the name
you already gave the sound. `LOAD PATCH ONTO <CHANNEL>…` reads one back, as ONE
`Ctrl+Z`. Both rows name the channel they will act on: the one the cursor is in.

**What is in the document.** `format` and `version` come first, so a reader knows
what it has before it reads a value: a `.patch.json` handed to `OPEN FILE…` is
refused in words rather than read as a song with no channels, and a song file
handed to the patch reader says which format it is instead. Then the sound —
written by the SAME functions a song file uses for its channels, so a channel
looks the same in both and there is one place to change if a knob is ever
renamed. Everything at its neutral value is left out, so the smallest patch is a
four-line header and a wave.

```
{
  "format": "tracklet-patch",
  "version": 1,
  "name": "LEAD",
  "voice": { "wave": "sawtooth", "bright": 62, "sweep": 35, "attack": 12, "ring": 40, "thick": 25 },
  "stack": [ { "wave": "sawtooth", "octave": 1, "detune": 7, "gain": 70 } ],
  "shape": "nasal",
  "hold": 8,
  "glide": 40,
  "verb": 25,
  "drive": 35
}
```

**A patch names audio and never carries it.** Its `sample` is a NAME, exactly as
a song's is — the recording lives in the app — so a patch naming one you do not
have plays that channel's built-in fallback instead. A shared patch still makes a
sound on a machine that never saw the file.

**A version of its own, at 1.** `PATCH_FILE_VERSION` is not `SONG_FILE_VERSION`:
these are two formats that share a vocabulary, and a future song-only field must
not make every patch in the world look stale. A file from a NEWER build is
refused in words rather than guessed at, which is also what happens to a knob
outside the range it clamps into — a number that is merely too big is a taste
with bad arithmetic, while a layer that is not an object is a file written by
something that does not know the format.

## A kit (`.kit.json`) — the song's drums as a file

A patch makes one channel's sound portable; a kit is the same promise one scope
out. A **kit** is the four patches every drum hit in a song plays — a kick, a
snare, a hat and a wind, at their own General MIDI pitches, `36/38/42/44`. Four
of them ship inside the app (`studio`, `808`, `brush`, `rock`, `metal`, `dusty`),
and a kit of your
OWN was stuck the same way a sound was: it lived only in the song that happened
to be playing it. `F2 → SOUND FILES…` writes the song's drums to a `.kit.json`,
and reads one back as the drums of any song.

**What is in the document:** the FOUR VOICES, and nothing else — a wave and nine
knobs each, written by the same function a `.json` song writes a channel's voice
with. There is no mix here, for the reason a patch has none only more so: a kit
is not even a channel. Pitches are not in the file either, because a kit never
moves them — a kit changes the SOUND, and a file that carried pitches could
disagree with the grid that reads them.

```
{
  "format": "tracklet-kit",
  "version": 1,
  "name": "MYHOUSE",
  "voices": {
    "kick":  { "wave": "sine", "bright": 5, "ring": 60 },
    "snare": { "wave": "triangle", "bright": 44, "noise": 70, "ring": 9 },
    "hat":   { "wave": "square", "bright": 91, "noise": 88, "ring": 3 },
    "wind":  { "wave": "square", "bright": 100, "noise": 100, "ring": 30, "attack": 20 }
  }
}
```

**The name has to be ADDRESSABLE, which is where a kit differs from a patch.** A
patch's name is only ever read on a row, so it may have spaces. A kit's name is
how a SCRIPT says it — `kit MYHOUSE` — so it is one token: upper case, letters,
digits, `-` and `_`, at most sixteen characters. It may not be one of the four
built-in words, because `kit 808` would then mean two different kits. A song's
title is turned into one for you (the stock title `UNTITLED SONG` becomes
`UNTITLED-SONG`), and a number is appended when that name is taken.

**By hand:** `F2 → SOUND FILES…`. `SAVE KIT <NAME>` writes the four voices the
song's drums ACTUALLY play — so capturing the built-in `808` and editing the file
is a way to build on it — and `LOAD KIT…` reads one back. Loading does TWO things:
the kit joins YOUR KITS (a library the app keeps, like the saved voices in `F4`)
and the song starts playing it, as ONE `Ctrl+Z`. The library outlives the undo,
which is the point: "no, not this one" does not mean "forget it".

**Switching kits needs no file:** `kit 808` chooses a built-in and
`kit MYHOUSE` chooses one of yours, so a script is the way to audition the drums
you have. The built-in words are still a closed list and still win a tie,
which is why `kit 808` is the drum machine and a kit of your own has to be called
something else.

**A kit names its four voices and never carries them.** A song stores the kit's
NAME, exactly as it stores a recording's name — the voices live in the app — so a
song naming a kit this machine does not have plays the four PRESETS rather than
refusing to open. That is the same bargain a missing sample makes, and it is why
the song file has a version of its own for a kit of your own (see below): an
older build would refuse the name, and — before the version check — would play
the presets and save the song onto them.

**A version of its own, at 1.** Like a patch, `KIT_FILE_VERSION` is not
`SONG_FILE_VERSION`: three formats share a vocabulary and a future song-only
field must not make every kit in the world look stale. A file from a NEWER build
is refused in words rather than guessed at, and so is a kit missing a DRUM —
every drum is present in a kit, or a hit is silent.

## The drum machine in a file

The **drum machine** is the one instrument in a song that is not a channel: pads
you design, a step grid you draw one hit at a time, and its own level, pan, swing,
sends, duck and effects. It plays BESIDE the tracks rather than inside one of
them, and a song either has one or has none — there is no empty machine.

**It is a field of the song, not a file of its own.** A machine lives in `machine`
at the top level of the `.json`, next to `tracks` and `patterns`, because it
belongs to the same song: it is not a document you open, and it is not a session
setting — it is music, and it is saved, undone and exported with everything
else. The script writes the same thing with `machine …` for its mix and `pad N …`
for each lane.

```
  "machine": {
    "enabled": true,
    "steps": 16,
    "beat": 4,
    "swing": 25,
    "level": 85,
    "pan": 15,
    "duck": 30,
    "verb": 20,
    "pads": [
      { "name": "KICK", "level": 100, "pan": 0, "pitch": 36, "steps": [100,0,0,0,100,0,0,0,100,0,0,0,100,0,0,0] },
      { "name": "TOM",  "wave": "membrane", "pitch": 41, "steps": [0,0,0,0,0,0,0,0,100,0,0,100,0,0,0,0] }
    ]
  }
```

**Absent means absent.** A song with no machine writes no `machine` key at all and
is byte-for-byte the file it always was, which is what keeps every song written
before the machine sounding — and reading — exactly as it did. A file that HAS
one carries `"version": 37`, because an older build would otherwise open the
song, ignore the machine and then save over it, losing the beat silently. The
version climbs to `38` when the machine has more than one bar (`bars` and
`order`), to `39` when a pad names a recording, and to `40` when a section names a
machine bar — each one the same reason one
step out: an older build would drop the field and save the song without it.

**A pad's row is written as NUMBERS, and its pitch as an absolute.** The row is a
velocity per step because the file is the lossless one — the `pattern` STRING a
script writes rounds a velocity to ninths, which is right for a beat typed by
hand and wrong for one saved and reloaded. Pitch is the MIDI note the pad sounds;
a script's `tune` is measured from the pad's KIT drum, which is why `tune -4` on a
tom here is `"pitch": 41` (the tom sits at 45). A reader still accepts the older
`pattern` string and a `tune`, so a hand-written file is read leniently: a
character that is not a hit is a rest, a broken sound falls back to the kit drum,
and a name that is too long is cut rather than refused.

**A pad can name a recording.** A pad may carry `"sample": "BRK"` — the same
reference a channel carries, and the same bargain: the bytes live in the APP and
the song holds only the name, so a pad on a recording the app does not have plays
the built-in one-shot its `voice` selects rather than falling silent. A pad plays
its recording when its wave is `sample`; every other wave ignores the name, so a
pad can carry the reference and its own generator at once.

**The machine reaches the exports.** It is part of the mix, so it is in a `.wav`
and under `EXPORT STEMS` as a part of its own. `EXPORT MIDI` writes it too, as one
more MIDI track on the drum channel: a pad is a hit on a grid rather than a note
with a length, so each hit becomes a short note at the pad's own pitch
(`kick` 36, `snare` 38, `hat` 42) — which is what lets a machine-only song export
as a beat rather than as silence.

## Soundfonts (`.sf2`)

A **soundfont** is somebody else's recorded instruments — a piano, a violin, a
whole orchestra — in one binary file. `LOAD SOUNDFONT (.sf2)` in the `F2` menu
loads one, and any channel on `wave font` then plays it: `duty` picks which of
the font's PRESETS, and the note picks which of that preset's RECORDINGS.

An instrument is the one kind of thing on the shelf that lives in the app rather
than in the song, and it is worth being clear about why: a font is megabytes of
sample data, while a song file has to stay a few kilobytes of text that anybody
can mail. So a song records only that a channel is on `wave font` — the
instrument's name is not in the file, because a song that needed a particular
download before it would play would not be shareable, which is the whole point of
these formats.

There are **three ways in**, and they land in the same list: a soundfont from
`LOAD SOUNDFONT (.sf2)`, a pack you designed yourself in Noislet from
`IMPORT FROM NOISLET (.instrument.json)`, and a soundfont a SCRIPT fetches by
path with `instrument load "storage/…"` — a soundfont or a Noislet
`.instrument.json`, since the file says which it is — the one of the
three that needs nobody at a menu, which is what lets a song script set up its
own sound. `F2 → INSTRUMENTS` shows all of them, marks which one `wave font`
plays, and `Del` (twice) takes one back out. The Noislet one is this app's own
format, so it has its own page: [`10-instruments.md`](10-instruments.md).

Consequences worth knowing:

- A song that uses an instrument sounds like whatever YOU have loaded, and with
  none loaded it plays the built-in one-shots instead. Nothing about that
  changes the song, so it is not undoable and not saved.
- Neither import touches the song. Neither is an `OPEN` and neither has a
  `Ctrl+Z` step: an instrument was loaded, not a piece of music.
- The list itself is per SESSION. Reload the app and it is empty, and a song you
  reopen is a song whose channels are on `wave font` with nothing behind them
  until you load an instrument again.

The reader is deliberately partial. It understands which recording a key range
plays, the root key it sounds at, its loop points, its tuning and its sample rate
— the five things a playable instrument needs. It ignores LFOs, envelope
modulators, filters and the rest of the modulation matrix, because Tracklet
already HAS a filter and an envelope, and a second set written by somebody's 1994
editor would be a second truth about what a channel sounds like. The text format
`.sfz` is not read at all: it references loose `.wav` files rather than
containing its samples, so supporting it would mean asking for a folder as well
as a file.

## The session, which saves itself

A saved file is a deliberate act. This is the other half: what you were just
working on is written back **by itself**, about a second after you stop editing,
and put back when you open the app again — the song on screen and the handful of
settings that travel beside it, with a `WELCOME BACK  ·  <title>` in the corner to
say so.

What comes back:

- **The whole song**, as the same `.json` `SAVE AS JSON` would write, read back
  through the same reader a file is — so a session a newer build wrote, or one
  cut in half by a closed tab, is refused by the format's own rules rather than
  trusted for being the app's own.
- **The session settings a file does not carry**: the octave, the solo, the chord
  mode, the audition toggle, and the two export choices (the loop region and the
  loudness target). The master level rides inside the song text; the theme has its
  own memory in the appearance menu.

What it is **not**: a file. There is nothing to name and nothing to browse, and
no list of past sessions — `SAVE AS JSON` (or `SAVE AS SCRIPT`) is still how you
keep something on purpose. The session is one key in the browser's own storage
and is replaced wholesale each time, so `NEW SONG` clears it the same way it
clears the screen. And a window that forgets everything on reload — private
browsing, or storage blocked — is not a broken app: every write is best-effort and
silent, and the session simply works for as long as the tab is open.

## How the formats are told apart

By the first character, not the extension. A JSON object opens with `{`, and no
Tracklet Script can (a `{` is neither a command word nor a note). So a song saved
as `.txt` on one machine and renamed on another still opens. A byte-order mark —
the invisible thing other editors like to put at the front of a UTF-8 file — is
ignored for the same reason. A MIDI file is the exception: it is BINARY, so it is
recognised by its extension (`.mid`/`.midi`) and then by its `MThd` header, which
is what tells a `.mid` from anything else that got renamed to look like one. A
soundfont is binary too, and the same in two steps: `.sf2` by extension, then
`RIFF` … `sfbk` in the bytes. A stem archive (`.zip`) is the one binary file the
app never has to recognise, because the app only ever writes one \u2014 which is the
reason it can be as plain as it is.

A song, a patch and a kit are all JSON objects and are told apart by their
`format` key, which is the first thing every reader looks at: `tracklet-song`,
`tracklet-patch`, `tracklet-kit`. That is the honest place for it, because the
formats deliberately share a vocabulary \u2014 a patch is a channel object with a
different header, and a kit carries the same voice objects a channel does \u2014 so
the extension cannot be the only thing that says which is which. Each reader also
refuses the OTHER two by name, so a `.patch.json` dropped on the kit picker says
which format it actually is rather than reporting a missing `voices` key.

## What is deliberately not in a file

Which pattern you were looking at, where the cursor was, whether playback was
running, the window size, and the chosen theme. Those are the state of the
person using the app, not of the music, and a song that moved your cursor out
from under you on load would be a bug rather than a feature.

The same goes for the rest of what a script can put in `settings`: the octave,
the solo, the chord mode, the audition toggle, the `page` — which full screen
is showing (`page arranger`) — and the `record` takes, are yours, not the song's. A
**take** is the clearest case: it is a recording captured on the RECORDER, and it
lives beside the sample bank as app state, so a `record trim`/`record loop`/`record
select` line shapes a take the app holds and never writes one into a file. The
audio is not in the file either — a song carries a recording only as the NAME a
channel writes with `sample BRK02`, the same reference a `wave font` carries to a
soundfont. A
file carries the music and the things that belong to the room it is played in —
the master volume, each channel's level, PAN and SENDS, and the ROOM itself
(`reverb` and `echo`) — but nothing about how your screen is set up.

**Drawing a lane changes nothing about a file.** The ARRANGER page edits the very
`automation` array the `automate` statement writes (see the table above), so a lane
dragged on screen saves as exactly the lane a script writes: the same keys, the
same version `17`, and no new field. A build with no arranger opens and plays such
a song unchanged.

## File names

`SAVE` names the file after the song's title, reduced to lower-case letters,
digits and single hyphens: `RAINY WINDOW LOOP` becomes
`rainy-window-loop.txt`, and a title that reduces to nothing becomes
`tracklet-song.json`. Every operating system agrees about that alphabet, which is
more than can be said for the characters people put in song titles.

Stems follow the same rule one level down, because a set of them is a whole
FOLDER of files: the song's stem, then the channel's number, then its name \u2014
`rainy-window-loop-01-kick.wav`, and the archive they arrive in is
`rainy-window-loop-stems.zip`. A channel nobody has named is `track`, so no file
is ever called `-03.wav`.

A patch is named after its CHANNEL rather than after the song, because the sound
belongs to the channel and the channel's name is the name its author already gave
it: channel `LEAD` saves as `lead.patch.json`. A name a file does not carry is
recovered from the filename, so a patch written by hand still arrives with
something on the row.

A kit is named after the SONG instead, and there is a reason rather than a
symmetry: a kit is not about one channel, so it has no channel name to borrow —
the song's title is the only name its author has given this music. So the kit of
`Rainy Window Loop` saves as `rainy-window-loop.kit.json`, and inside the file
the name is the token a script needs: `RAINY-WINDOW-LOOP`.

## For an agent

- **To write a song:** emit Tracklet Script and apply it in the `SCRIPT` panel.
  That is the documented, checked path.
- **To read a song:** take the `.json`. It is the model's own shape, so no
  notation has to be parsed, and `steps[row][column]` is already a MIDI number.
- **To round-trip one:** a file written by either `SAVE` and read by `OPEN` is
  the same song. If it is not, that is a bug in the app, not in your reading.
- **To move a SOUND between songs:** read the `.patch.json`. It is a channel's
  own object with a header, so a tool that reads a song's channels already reads
  patches; the model's `soundFromTrack`, `patchToJson`, `patchFromJson` and
  `applySoundToTrack` are that whole path, and `patchAbout(sound)` is the one-line
  summary a status bar prints.
- **To move the DRUMS between songs:** read the `.kit.json`, whose `voices` are
  four of those same channel objects under the four drum names. `kitFromJson` reads
  one, `kitToJson` writes one, `captureKit(name, kit)` reads the four voices a
  song's drums actually play, and `kitVoice(kit, drum, library)` is how a name
  resolves to a sound — a name nothing knows falls back to the presets. The drum
  names and their pitches are `model/drum.ts`.
