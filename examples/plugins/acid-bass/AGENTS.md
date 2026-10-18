# Acid Bass — agent handbook

A squelchy resonant bassline instrument (`com.example.acid-bass`). Saw/square
through an accent-driven resonant lowpass plus tanh drive. Deterministic pure
DSP: the same note renders bit-identically on the live clock and the export
clock, so what you audition is what the song keeps.

This whole plugin is one folder: `manifest.json` (the knobs), `index.ts`
(the sound), two factory presets, this file, and `acid.test.ts` (the proof).
Nothing about it lives anywhere else.

## The knobs (all 0–100)

| Knob     | Default | What it does                                                        |
|----------|---------|---------------------------------------------------------------------|
| `cutoff` | 65      | Filter base, ~90 Hz–6 kHz exponential. At low reso parks dark/dimes bright; with reso up the peak dominates (see Demo). |
| `reso`    | 55      | Resonance Q up to ~12. Past ~70 it screams its own harmonics.       |
| `envmod`  | 70      | How far the accent envelope opens the filter (up to +3 octaves).    |
| `accent`  | 60      | How much velocity opens the filter. Hard hits squelch, soft thump.  |
| `drive`   | 25      | Tanh squeeze after the filter. Bounded — cannot clip the mix.       |
| `wave`    | 0       | Saw (0) into square (100).                                          |
| `decay`   | 45      | Note length and filter fall, ~0.1–1.2 s.                            |

Three honest limits: **no legato slide** (one render sees one note — write
overlapping notes and let the engine sum them), **naive oscillators**
(fine at 40–200 Hz; documented in `index.ts`, not hidden), and **no control
panel** (`PanelApi` is deliberately read-only — a panel shows its own
manifest's defaults, never the channel's live knobs, so a knob-mirror panel
would lie; drive it from script/MCP instead).

## Drive it from script

Seat it, turn knobs, move one across bars, load a preset file:

```
track 1 voice plugin:com.example.acid-bass
params 1 cutoff 70
params 1 reso 75
automate 1 param.cutoff 20 90 bars 8 to 15
```

`params 1 <knob> clear` takes one knob back to its manifest default,
`params 1 clear` takes them all off. A preset (`SAVE PRESET` in the F2 menu,
or `LOAD PRESET ONTO 1...` from a `.pluginpatch.json`) names its plugin, so
loading acid values onto a channel that plays another instrument is a refusal
rather than a retune. Factory presets ship beside this file:
`acid-squelch.pluginpatch.json` (the scream) and
`deep-roller.pluginpatch.json` (the sub).

## Drive it from MCP

No plugin-specific tools needed — the language tools already reach every
knob. The loop an agent runs headlessly:

1. `script.apply` with the lines above (seat, knobs, lanes).
2. `export.audio` to render the song, `export.loudness` to check it is not
   silence and not clipping.
3. `generator.generate` writes the pattern first if there is no bassline yet
   (`generate bass 0 2` hangs roots on the chord loop); the acid voice then
   plays what the composer wrote — two plugins, one song, no person.

`language.capabilities` confirms the words this build speaks;
`window.__tracklet.trackletPlugins` (dev) lists what is installed.

## Demo: the 8-bar squelch roller

The canonical show-off — paste as-is, it plays a parked squelch that opens
into a full-body scream:

```
track 1 voice plugin:com.example.acid-bass
params 1 reso 75
params 1 envmod 85
params 1 accent 80
automate 1 param.cutoff 30 90 bars 1 to 8
```

The export clock (`export.audio`) renders it through the same
`renderPluginBuffer` path the live engine plays, with the lane merged per
step — what the automation promises is what the file contains. No new MCP
ops were needed for any of this: `script.apply` seats the voice and writes
the lane, `export.audio` renders it.

Voicing note (measured, not lore): with the reso up, the parked filter's
resonant peak rings through the fat low harmonics, so the sustain reads
brighter parked than open — the squelch character lives down low, and
opening the cutoff trades nasal scream for attack sizzle plus body (RMS
rises). If you want the textbook "brighter as it opens" sweep, park the
reso near 0, where the cutoff owns 9 dB of treble end to end.

## Install it

In the app: zip this folder as a `.tracklet-plugin` (`manifest.json` plus
`index.ts`) and install from the F2 menu, or `plugin install "<url>"` with
the line as the approval. Headless: `defineInstrument({ manifest, renderNote })`
from `src/plugins/sdk.ts` seats it; `goldenRender` proves determinism.
Permissions: none declared, none needed — the audio path is pure.
