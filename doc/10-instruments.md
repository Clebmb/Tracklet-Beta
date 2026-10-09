# Instruments — playing somebody else's recordings

Everything else in Tracklet is **synthesized**: a wave, nine knobs and a promise
that the same numbers make the same sound on every machine. This page is about
the other kind of sound — recordings — and about the **instrument list** that
holds them.

An instrument here is a **sampled instrument**: a set of recordings, grouped into
presets, played back by key range. There are two ways to get one, and they are the
same thing arriving by two roads:

| Where it comes from | How you get it | In the file menu |
| --- | --- | --- |
| A **SoundFont** (`.sf2`) | somebody else's compiled instrument | `F2 → LOAD SOUNDFONT` |
| A **SoundFont** at a PATH | the same thing, fetched by a script | `instrument load "….sf2"` |
| A **Noislet instrument** (`.instrument.json`) | a sound pack you designed in Noislet | `F2 → IMPORT FROM NOISLET` |
| A **Noislet instrument** at a PATH | the same thing, fetched by a script | `instrument load "….instrument.json"` |

Both land in the same list, and both are played the same way: put a channel on
`wave font` and the notes come out of whichever instrument is **selected**.

```text
Noislet                                      Tracklet
FILE → EXPORT AS TRACKLET INSTRUMENT  →  F2 → IMPORT FROM NOISLET
                                          F2 → INSTRUMENTS (pick one)
                                          track 1 wave font  (play it)
```

## The short version, if you are in a hurry

```script
instrument use 1            # or: instrument use "GRAVEL KIT"
track 1 WALK wave font duty 0
pattern 1
C-4 .
C-4 .
D-4 .
```

- The **notes** choose the pitch, and the recording is not stretched to fit: the
  instrument says which key each sound was recorded at, and a note plays that
  sound at the rate which moves its root key onto the note. Most instruments are
  ONE recording played across the whole keyboard, so most notes are transposition
  — which is why a line two octaves above its sample's root key sounds like a
  strained version of the instrument. The cleanest font songs keep a line within
  about an octave of where its sound actually sounds.
- A recording played **faster** than it was made has a top that no longer fits in
  the output band, and a playback rate does not filter what it cannot carry — the
  overtones fold back down as a gritty edge. So those notes are filtered at the
  frequency that would have folded, and a note at or below its root key takes no
  filter at all, because a recording played slower has nothing to fold.
- The **`duty`** knob chooses WHICH SOUND of the instrument, spreading evenly
  across its sounds — the same knob that picks a soundfont's preset.
- A note plays the recording **once** (a pitched one-shot) unless the instrument
  says a sound should loop.
- `F2 → INSTRUMENTS` shows what you have and marks the one in use.

## The instrument list

The list is **app state, not song data**, and that is worth understanding rather
than memorising, because it explains everything else about this feature:

- a **song** says `wave font` and nothing more. It never names an instrument, so
  a song stays a few kilobytes of text and stays shareable;
- an **instrument** is megabytes of somebody's recordings, so it lives where you
  put it, like the samples in a real sampler;
- the consequence: **the same song through a different instrument is a different
  performance.** That is the point of a sampler, and it is also the one thing
  that can surprise you. `F2 → INSTRUMENTS` is where you check.

Importing and switching are **not song edits**: no `Ctrl+Z`, no `●` unsaved
marker, and the change takes effect on the NEXT note rather than cutting the one
that is ringing.

Both imports **add** to the list — neither one replaces it. Importing a file whose
instrument name is already in the list **replaces that entry**, which is the round
trip this feature exists for: tweak the sound in Noislet, export, import again,
and the instrument a channel is pointing at is the new one. The status line says
`REPLACED THE PREVIOUS "…"` when that happens.

`F2 → INSTRUMENTS` → **`Del`** takes an instrument back out, which is the answer
to having imported the wrong file. It takes **two presses**: the first says
`PRESS DEL AGAIN TO REMOVE "GRAVEL KIT" FROM THE LIST` and the second does it.
Two rather than one because this is the only action in any of the menus that is
expected to be safe by habit and is not — there is no `Ctrl+Z` for app state, and
a soundfont may be a download from an hour ago you would have to find again. Any
move of the highlight, or leaving the chooser, drops the waiting press, so the
second `Del` can only ever remove the row you armed and are still looking at.

Removing cannot leave the list empty-handed: taking out the instrument `wave font`
is using selects its neighbour, and removing the last one puts every `wave font`
channel back on the built-in samples — the same thing that happens on a fresh
start.

The list lives in memory for the session: reload and it is empty. Nothing is
written to disk and nothing is written into a song.

## What a Noislet sound becomes

`noislet/doc/instrument-format.md` is the file's contract; this is what Tracklet
does with it.

| In the `.instrument.json` | In Tracklet |
| --- | --- |
| the file's `instrument` name | the name in the instrument list |
| each **sound** | one **preset**, so `duty` can pick it |
| the sound's `name` | the preset's name (shown in the status line after an import) |
| the sound's `pcm` (base64 16-bit) | the sample's frames, read straight into the engine's own 16-bit table |
| the sound's `rootKey` | the key that plays it unaltered (`60` = middle C) |
| the sound's `channels` | the font's width: 2 if any sound is stereo, and a mono one is widened to match |
| the sound's `loop` | whether a held note sustains the sound or plays it once (Noislet writes it for `export instrument "..." loop`) |
| the file's `sampleRate` | kept exactly — nothing is resampled on import |

Two things worth knowing about the conversion:

- **No new playback code.** A Noislet pack becomes a `SoundFont` and goes into the
  engine untouched, so `duty`, the key-range lookup, looping, per-sample rates and
  the sample cache all behave exactly as they do for a `.sf2`. If you know how a
  soundfont plays in this app, you know how an imported pack plays.
- **One frame width per instrument.** `start`, `end` and the loop points are
  FRAME indexes into one flat 16-bit table, so every sample in an instrument
  shares a channel count. A file that mixes mono and stereo sounds is imported at
  the wider of the two, with the mono ones copied to both sides — lossless, and
  the only layout that can be indexed at all.
- **The level is the file's.** A sample plays at unity, so an imported pack
  arrives as loud as Noislet rendered it — the file's own peak, times the
  channel's `level`. Nothing is normalised on import and nothing is turned down,
  which is the same promise a `wave sample` note makes and the reason a quiet
  import is a quiet EXPORT (Noislet's master gain and its normaliser decide it).
  If a pack sits under a synth in the mix, the channel's `level` and the pack's
  master gain are the two knobs, and looking for a fault in the import is looking
  in the wrong app.

A damaged sound inside an otherwise good pack is **dropped with a sentence**
(`"FIRE HIT" has sample data that is not base64 — skipped it.`) rather than
failing the import, and a file with nothing playable left in it is refused
outright. A damaged instrument is worse than a damaged project: a project is
somebody's work in progress and must load anyway, while an instrument that came
back subtly wrong plays the wrong thing forever.

## From a script

| Statement | What it does |
| --- | --- |
| `instrument use 2` | the second instrument in the list becomes the one `wave font` plays |
| `instrument use "GRAVEL KIT"` | the same, by name (quote a name with spaces) |
| `instrument import` | opens the file picker for a `.instrument.json` |
| `instrument load "storage/soundfonts/dkc/font.sf2"` | fetches that soundfont, puts it in the list and plays it |
| `instrument load "storage/instruments/frog/frog-pond.instrument.json"` | the same, for a Noislet pack — the file's own bytes say which it is |

### A script that loads its own font

```script
instrument load "storage/soundfonts/dkc/Donkey Kong Country 2012.sf2"

track 1 WALK wave font duty 8 hold 1 level 75
pattern 1 "A"
C-4 .
C-4 .
D-4 .
C-4 .
```

`instrument load` is the one instrument statement that needs nobody: the other
two assume the font is already there or that a person is about to pick one. The
path is a URL — resolved against the page the app is served from, which is why
the kit's own spelling is `storage/…` — and a load **selects** what it loaded, so
no `instrument use` line is needed unless you want to say which one you mean.

**Either kind of instrument loads this way**, and the file's own bytes decide
which reader opens it — a Noislet pack opens with `{` and a soundfont with
`RIFF`, exactly the way the song formats are told apart by their first character
rather than by their extension. So one statement covers both, a path may point at
a `.sf2` or a `.instrument.json`, and a song written around a pack you designed
in Noislet is as self-contained as one written around somebody's soundfont.

```script
instrument load "storage/instruments/frog/frog-pond.instrument.json"

track 1 RIBBIT wave font duty 0 hold 1 level 84
pattern 1 "A"
C-4 .
G-3 .
```

Used together, the statements are applied IN ORDER: a load is asynchronous, so an
`instrument use` beside one is settled when the font arrives rather than before
it. A load that fails is not a script error — the song still applies, and the app
says `COULD NOT LOAD …` on the status line, because a `wave font` channel with
nothing behind it plays the built-in samples and therefore sounds plausible.

This is the only way to write a song that arrives knowing what it should sound
like. It works because an instrument is the app's, not the song's: the SONG still
records nothing but `wave font`.

A name that is not in the list is **not** an error: the song still applies, and
the app says `NO INSTRUMENT CALLED "X"` afterwards. Only the app knows what you
have imported, and throwing away the song a script just built over a name you have
not imported yet would be a bad trade.

## If you are an AI agent, the short version

1. **`wave font` + `instrument use` + `duty` is the whole interface.** Notes pick
   the pitch, `duty` picks which sound, `instrument use` picks which instrument.
2. **Never assume an instrument is loaded.** `wave font` with nothing imported is
   legal and falls back to the built-in samples, so a song that depends on an
   imported instrument sounds different — not broken — without one. Say which
   instrument you expect in a comment, and use `instrument use` at the top of a
   script so the reader knows the performance you intended. If you know where the
   file is, `instrument load` is strictly better: it removes the assumption
   instead of documenting it, and one script then carries both the music and the
   sound.
3. **`duty` is a spread, not an index.** With `n` sounds, `duty 0` is the first
   and every `100/n` steps to the next; `duty 100` clamps to the last. For four
   sounds that is roughly `0`, `25`, `50`, `75`.
4. **Instruments are not in the song file.** If you write a song that needs one,
   the instrument must exist in the app — do not expect a song you saved on one
   machine to carry its instrument to another.
5. **Do not touch the list from a script beyond `use`, `import` and `load`.**
   There is no `instrument list` statement: the language writes settings and never
   reads app state, and a script that could read the list would be a script that
   behaves differently on two machines. (`load` does not read the list either — it
   names a file.)
6. The **Noislet side** of the contract — the file's fields, the rules a reader
   relies on, and the export command — is
   `noislet/doc/instrument-format.md`. Read it before changing anything about the
   format above.

## Worked example

A two-channel piece where the drums come from a Noislet pack and the bass is
still a synth — the ordinary case, and the reason the instrument is worth having
at all.

```script
song "WORKING LOOP"
key D minor
tempo 104
beat 4
steps 16

instrument use "GRAVEL KIT"

track 1 STEPS wave font duty 0 hold 1 level 70
track 2 BASS  voice bass level 60

pattern 1 "A"
C-4 .
C-4 .
.   D-2
C-4 .
D-4 .
.   D-2
C-4 .
.   F-2

order 1 1 1 1
```

Change `instrument use` to another kit and the same eight bars become a different
piece of music with the synth bass unchanged, which is exactly what a sampler is
for.

## A real file, and what guards this format

The kit ships two: `scripts/noislet/ex/footstep-kit.instrument.json`, written by
the example script beside it — three sounds at 22050 Hz, one panned and two
centred, so it shows the rule nobody notices until it is wrong, that the
instrument has ONE frame width and the two mono sounds therefore arrive as two
identical sides in a stereo table. And `scripts/noislet/ex/drone-loop.instrument.json`,
one sustaining sound, which is the only place `loop` is exercised end to end.

Those files are also how a change here gets caught. Noislet's suite re-runs
the script and requires byte-identical output; this app's
`src/__tests__/noisletFixture.test.ts` reads the same bytes and pins the presets,
the width, the rate, the root keys, the `duty` spread and which frames are still
panned. So changing the reader fails there, changing the writer fails in Noislet,
and regenerating the fixture (`npm run script --` in `noislet`, with `--out
../scripts/noislet/ex`) is a decision that has to be made on both sides — which is
the point, because a file format two apps share is not one app's to change.

## See also

| Page | Read it when |
| --- | --- |
| [03-script-reference.md](./03-script-reference.md) | you want the exact syntax of `instrument`, `track` and `pattern` |
| [09-song-files.md](./09-song-files.md) | you are wondering what IS in the song file (and therefore what is not) |
| [07-agent-guide.md](./07-agent-guide.md) | you are writing songs as a model and want the house rules |
| `noislet/doc/instrument-format.md` | you are producing an instrument rather than playing one |
