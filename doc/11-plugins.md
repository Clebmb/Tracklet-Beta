# 11 — Plugins: the author's handbook

A Tracklet plugin is a TypeScript module plus a manifest: its id, name,
version, kind, entry point, the host API it targets, and the knobs (params)
it wants the host to own. Plugins are Tracklet's answer to VSTs — first and
foremost **virtual instruments** (a new sound for a channel or pad to play),
on an API deliberately generic enough for effects, note generators, custom
panels, and import/export tools later.

If you are an **agent** rather than a person, the fastest truth is the running
app, not this page: read `window.__tracklet.trackletPlugins` in a development build
(one row per installed plugin — manifest plus one example line). That object
is built from the same tables the host reads, the way
`window.__tracklet.capabilities` is built from the tables the parser reads.
This page is the reasoning behind it; the app in front of you is the version.

## What exists today (host v1, milestone M0)

The M0 host can **discover, validate, register, enable/disable, and list**
plugins. It cannot seat them into the audio path yet — no channel plays a
plugin sound until M1. What you can build right now is a plugin that installs
cleanly, declares honest params, and shows up in the dev hook and (soon) the
browser. That is the whole of M0, and it is on purpose: the socket before the
lamp.

## The manifest

Every plugin carries one. It is validated **before** anything loads
(parse before apply — the same rule as Tracklet Script), and one mistake
means zero effect plus one named error: plugin id, field, fix.

```json
{
  "id": "com.example.hello-panel",
  "name": "Hello Panel",
  "version": "1.0.0",
  "kind": "panel",
  "entry": "./index.ts",
  "apiVersion": 1,
  "params": [
    { "id": "amount", "label": "Amount", "min": 0, "max": 100, "default": 50 }
  ],
  "description": "The smallest plugin that loads.",
  "author": "Example Author",
  "license": "MIT"
}
```

| Field | Rule |
| --- | --- |
| `id` | Reverse-DNS, lowercase, at least one dot: `com.example.supersaw`. This is what songs pin — pick it once and never rename it. |
| `name` | 1–32 characters, shown in the browser and menus. |
| `version` | `MAJOR.MINOR.PATCH`, all digits. Songs pin major.minor; a newer minor migrates forward, an older one warns. |
| `kind` | One of `instrument`, `effect`, `generator`, `panel`, `io`. The host seats each kind differently; M0 accepts all five but runs none into audio. |
| `entry` | Module path the host dynamically imports. Never `eval`. |
| `apiVersion` | The host API this plugin targets (today: `1`). Older keeps working; newer than the build is refused in words. |
| `params` | At most 32 knobs. Every number is 0–100 (never 0–1 — the same rule as Tracklet Script percentages). `default` must sit inside `min`–`max`. |
| `description`, `author`, `license` | Optional text. |

A corrupt manifest is refused with lines like these (each names the plugin,
the field, and the fix):

```text
plugin id "HELLO" is not reverse-DNS. Use lowercase letters, digits and hyphens with at least one dot, e.g. "com.example.supersaw".
plugin "com.example.hello-panel" has kind "vst". Pick one of: instrument, effect, generator, panel, io.
plugin "com.example.hello-panel" param "amount" has a default outside min-max. Put it between 0 and 100.
```

## Params: the knobs contract

Params are the **only** per-song plugin state. The host owns their values —
clamping, preset save/load, automation lanes (from M6), and slider UI — and
the plugin owns the DSP mapping of value to sound. No hidden internal state
may affect the render: same song + same plugin versions = same sound, on
every machine. That determinism is non-negotiable, and it is why the audio
path gets a **seeded RNG** from the host (`seededRandom` in
`src/plugins/host.ts`) instead of `Math.random()`.

## Permissions: capabilities, not globals

A plugin never reaches for `fetch`, `localStorage`, or the DOM directly. The
host passes a small `PluginHost` object — seeded random, scoped log, and
whatever the manifest declared and the user granted. Anything not on that
object is not available. Audio-path code must be pure
(`params, note, time` in, sound out): no async, no I/O, no DOM.

A crashing plugin is isolated per channel: the engine catches, mutes that
channel, shows a notice, and the transport keeps running. Disabling a plugin
never edits the song — the song falls back to a built-in voice and says so
in words (the same bargain as `wave font` and `sample` today), and
re-enabling restores it as written.

A plugin declares what it asks for in its manifest — `permissions`, any of
`network` (fetch through the host) and `storage` (a namespaced scope):

```text
permissions: ["storage"]
```

Absent is none, and none is everything the audio path needs. The claim is
visible before it is enforced: the browser's detail line names it (`needs
storage`), so the ask is on screen at install time. Today the host hands
every plugin the same small surface — seeded random, scoped log — so a
permission is a promise the grant screen will keep, not a key that turns yet.

The answers live in `src/plugins/grants.ts` and start denied: `network` and
`storage` stay off until granted, one word at a time (`grantPermission`,
`denyPermission`), and a denial takes one word back — the last one forgets
the plugin's row, keeping the map sparse. `pendingPermissions` is what one
plugin still needs deciding (its declaration minus the stored answers, in
manifest order), which is exactly the grant screen's to-do list. The answers
are person-level choices under their own key (`tracklet.pluginGrants` in
`src/pluginLibrary.ts`): never written into a song, never packed into a
bundle, and forgotten beside an uninstall — a reinstall asks again, so a
decision made for one copy never silently covers its replacement. The words
are `plugin allow <id> <word>` and `plugin deny <id> <word>` — session
settings like `plugin install`, so writing the line is the approval and no
file carries one: the scene answers through `grantPermission` /
`denyPermission`, persists the map, and toasts whether the decision changed
anything. Granting is no longer write-only; the grant-screen view still is
the future.

## The smallest plugin (hello-panel)

`examples/plugins/hello-panel/` holds the whole thing: a manifest, one
module, and nothing else. It installs, declares one param (`amount`), logs
one line, and unloads without breaking playback. Copy it as the starting
point for any kind — the manifest's `kind` is the only line that changes.

## Instruments: the render contract (M1, first half)

An instrument plugin is one pure function:

```text
renderNote(params, note, sampleRate) -> mono samples, or one bus per output
```

`params` are the host-clamped 0–100 values, `note` is `{ midi (12–119),
velocity (0–100), startStep (rows from 0), holdSteps, seed }`, and the answer
is a `Float32Array` starting at the attack. The rules that keep live and
export identical:

- **Pure DSP only.** No `AudioContext`, no nodes, no async, no `Math.random()`.
  Variation comes from `note.seed` through a seeded stream (`pluginNoteRandom`
  in `src/plugins/instrument.ts`). Same inputs, same samples, every machine.
- **Bounded and finite.** Roughly ±1; the host applies level, pan, sends and
effects downstream, where a built-in voice would sit.
- **A track names it as `plugin:<id>`** (e.g. `track 1 voice
plugin:com.example.supersaw` once the parser learns the spelling). A missing
or disabled plugin resolves to the built-in voice with a notice naming the id
— fallback with words, never silence.

`examples/plugins/supersaw/` is the proof: three detuned saws through a fast
attack and exponential tail, rendering-shaped and determinism-pinned by
`src/__tests__/pluginInstruments.test.ts`.

## Seating a plugin on a channel (M1, second half)

A channel names a plugin with the same `voice` word that names anything else:

```script
new
song "PLUGIN SEAT"
tracks 1
track 1 voice plugin:com.example.supersaw
pattern 1 "A"
C-4
```

Any well-formed id parses — the registry is never consulted, so a song written
where the plugin lives opens where it does not. The channel keeps its own
sound underneath as the fallback: knobs on the same line shape that fallback
(`track 1 voice plugin:com.example.supersaw bright 90`), and a machine without
the plugin plays it with a notice naming the id. The file writes version `43`
and a `"plugin": "<id>"` reference beside the voice; songs that name none are
byte-for-byte the songs they always were.

## Hearing it (M1, final step)

A seated plugin sounds: the live engine (`src/audio/engine.ts`, `playNote`) and
the offline exporter (`src/audio/render.ts`) both resolve the channel once per
song (`src/audio/pluginVoice.ts`, the sample bank's bargain) and play the same
pure samples through a buffer source into the channel's own input — so level,
pan, sends, effects and duck treat a plugin exactly like a built-in voice, and
an export is the song you heard. A render that throws or comes back empty
unseats the channel and falls through to its built-in voice: one silent note
at most, never a silent song. `src/plugins/builtIn.ts` carries the instruments
that ship with the app (the supersaw, the EP piano), wired into both clocks by
the scene.

## Building one (M2 SDK)

`src/plugins/sdk.ts` is the whole third-party surface: `defineInstrument({ manifest,
renderNote })` seats a module or refuses it in words, `checkInstrumentModule`
is the install-time trust gate, and `goldenRender` hashes the golden note
(A4, full force) so a render that moves across machines is caught here rather
than in a mix. `src/plugins/loader.ts` is the one place arriving code is
trusted (`seatInstrumentModule`); fetching the bytes stays the caller's
business. Copy `examples/plugins/hello-panel/` for the shape and
`examples/plugins/ep-piano/` for FM DSP.

## Effects: note buffers, not streams (M3, first half)

An effect plugin is one pure function — `processBlock(input, params,
sampleRate)` — and it processes NOTE BUFFERS, not streams: the live engine
cannot call JavaScript per sample-block without an AudioWorklet (a second
module, a second clock, a second chance to disagree with the export), so
effects run where instruments already do, at schedule time on the note's own
samples. Stateless per note by rule: tails live inside the returned buffer
(which may outgrow the input), never in memory of the note before. The host
mixes wet over dry (`amount`, 0 = OFF). `examples/plugins/bitcrush-plus/` is
the proof: fewer bits on a slower clock, degradation-pinned by
`src/__tests__/pluginEffects.test.ts`.

## Seating an effect on a channel (M3, second half)

A channel seats inserts with a statement of its own, beside `layer`:

```script
new
song "SEATED EFFECT"
tracks 1
track 1 voice plugin:com.example.supersaw
fx 1 com.example.bitcrush-plus 45
pattern 1 "A"
C-4
```

The chain is an order — the first entry processes the note's samples first —
with a ceiling of four. `fx 1 <id> clear` takes one slot off, `fx 1 clear`
takes the chain off, and seating an id the chain already names retunes it. Any
well-formed id parses and any unknown id is kept: the code is the app's, so a
song written where the effect lives opens where it does not, playing dry for
that slot. The file writes version `44` and an `"fx": [{"id", "amount"}]`
chain beside the voice; songs that seat none are byte-for-byte the songs they
always were. Both clocks resolve the chain once per song (`src/audio/pluginFx.ts`)
and process each plugin render through it before the source is built — a slot
that throws or answers with non-finite samples is skipped and the dry survives.
Inserts process plugin renders; a chain seated on a channel with no plugin
instrument is kept but inert until synth-to-buffer lands.

## Generators: plugins that write music (M4)

A generator plugin is one pure function — `expand(input, params, seed)` — and
it writes MUSIC rather than sound: a rhythm for a pad, a bassline for a
channel. Pure means no song mutation and no I/O, and the seed is the only
randomness: the same inputs always write the same notes (the strictest
determinism rule in this project — a composer that disagrees with itself is
broken). The host previews the edits before committing them as one undo step
(parse before apply, the same rule as the script language).

Every generator declares its mode: CONSTRUCTIVE writes cells the song keeps
(like `arp write`), INTERPRETIVE is played live without writing (like
`arp hear on`). This build seats constructive generators only — an
interpretive module is refused with the milestone that seats it, never a
crash.

```script
new
song "SEATED GENERATORS"
key A minor
tempo 128
tracks 2
track 1 "LEAD" voice lead
track 2 "BASS" voice bass
progression Am F C G
machine steps 16
generate euclid pad 1 5
generate bass 0 2
pattern 1 "A"
C-4 .
E-4 .
```

`examples/plugins/euclid-drums/` is the first proof (a Euclidean rhythm —
`E(3, 8)` is `9..9..9.` — sharing its one function with the script word and
the API op, so the three can never disagree), and
`examples/plugins/bass-follow/` the second (the loop's roots under `four`,
`half` and `offbeat` rhythms). The same two composers answer
`generator.describe` and `generator.generate` over the API (and the MCP tools
those become), so an agent composes headlessly with the functions the script
calls.

## Panels: plugins with UI (M5)

A panel plugin is one mount — `mount(el, api)` — and it SHOWS something: a
meter, an editor, a whole page. `el` is the panel's OWN box, floating over the
canvas the way the script panel floats over the tracker; the panel may fill
that box and nothing else (no `document`, no selectors that escape the
subtree, no global CSS — one plugin's styles cannot leak onto another's, or
onto the app). It hands back its teardown: `unmount` empties the box and
leaves siblings alone, so uninstalling a plugin cannot break the seven
built-in pages, and `update` repaints on a song replace, a theme change or a
text-scale change, so a panel survives all three without remounting.

The api is capabilities, not access: a read-only digest of the song (names and
counts, never cells), the theme tokens the panel must honor (F9 themes plus
text scale — the host digests its own `textPrimary`/`panelFill`/`ooze` into
CSS, held to body-at-AA and accent-at-AA-large on every shipped theme, so a
panel cannot go illegible where the app stays readable), its own params, a
read-only transport snapshot, a notice line, and a `close` that asks the host
to put the panel away. A panel never edits the song and never drives
transport — it reads, it shows, and it closes.

```script
new
song "PANEL PAGE"
key A minor
tempo 128
tracks 1
track 1 "LEAD" voice lead
pattern 1 "A"
C-4
page plugin:com.example.meter-panel
```

`examples/plugins/meter-panel/` is the proof: the song as a meter, one bar
per channel, rendered as pure data (a string in, a string out) so the text it
shows is unit tested rather than eyeballed. It opens with
`page plugin:<id>` — spelling-checked like a voice and resolved when it
opens, so an id this machine has no code for leaves the tracker up with a
notice naming the id — or straight from the page dropdown, which lists every
known panel after the seven screens and names the open overlay on its button.
The same reference travels as a session setting (no file carries one), and
`definePanel` / `seatPanelModule` are the trust gates that seat third-party
panels.

Installed panels load their code at boot: one dynamic `import()` of the entry
path the install wrote down, each through the trust gate, with refusals and
throwing imports leaving the manifest's dropdown row in place (it opens to
the code-missing notice rather than a panel that half arrived). While one is
open it repaints live — motion and bar changes reach `update` once per frame,
which is what keeps the meter's own "playing bar N" line honest — beside the
song, theme and text-scale repaints it already survives.

## Installing a plugin (M6, first half)

A `.tracklet-plugin` is a zip of two flat files — `manifest.json` plus the
entry module its `entry` names — stored uncompressed, the layout
`src/audio/zip.ts` writes. `src/plugins/install.ts` opens it: the reader
takes store-only archives and refuses everything else in words (a compressed
entry, a climb-out name, a checksum mismatch — see the catalogue), the
manifest registers through the registry's own validation, and the module
crosses from text to code through one Blob URL fed to a dynamic `import()`
(never `eval`), then seats through the loader's trust gates.

Registration and seating stay apart: a manifest that validates registers even
when its code will not seat, so songs may pin it and the dropdown lists it
while it falls back in words. Manifests persist in `tracklet.plugins`;
module sources persist in `tracklet.pluginCode` only when seating passed, so
a reload re-seats exactly the code that played. Installed instruments answer
`voice plugin:<id>`, installed effects answer `fx`, installed panels answer
`page plugin:<id>` — the bundle always wins an id clash, and reinstalling is
an upgrade, never a duplicate. A third-party generator verifies and
registers, but the `generate` word only spells the two built-ins, so it has
no in-app stage yet.

Remote installs arrive through the script, not a dialog: `plugin install
"https://example.com/reverb.tracklet-plugin"` fetches the zip and runs the
same pipeline — the line IS the approval (remote installs are off by
default, so nothing fetches unasked), only `http:`/`https:` go out, and a
fetch that fails is a notice naming the URL, never a broken song. Every
install remembers where it came from in `tracklet.pluginSources` — the URL
a remote install fetched, the bundle that carried a bundled one. A missing
source installs exactly like a named one, and uninstalling forgets the
origin beside the manifest and the code, so a reinstall says where from.
Each install also weighs its module (`fingerprintPluginCode`, eight hex
digits over the source text) into `tracklet.pluginFingerprints`, and the
boot re-seat seats only what still matches — bitrot, a hand-edit, or a
swapped zip seats nothing and says which id changed. Code installed before
fingerprints existed seats as before: remembering must never brick an old
install. The weight is integrity, not authentication — no keys in v1, so a
changed fingerprint means "not the installed code", never "signed by".

A song that names plugins can pin them: saving writes `pluginVersions`
(`com.example.supersaw` at `1.0.0`, file version `45`), and opening holds
each pin against what the machine holds — missing falls back with a notice,
older warns, a newer minor notes the upgrade, a different major warns
loudly, a match is silence. And a song can travel WITH its code: EXPORT
BUNDLE packs its JSON, every named third-party plugin's manifest plus
source, and every named sample as a `.wav` into `<name>.tracklet-bundle.zip`
— opening one installs the plugins, loads the samples, then opens the song,
so a bundle moved to another browser plays instead of falling back.

## Trust: what a plugin may do, and how it is stopped

Three levels, reviewed differently:

- **Bundled** (the supersaw, the meter panel): reviewed with the app itself,
  versioned with it, never re-fetched.
- **Installed** (your zip): code you chose from a source you chose. It runs
  with host capabilities only — the audio path stays pure (no network, no
  storage, no DOM), a panel stays inside its own box — and the gates check
  it at seating, not at sounding.
- **Remote** (a URL): not in this half. URL installs arrive behind an
  explicit per-install approval, and there is deliberately no store, no
  directory listing, no silent fetch in v1.

The kill-switch is the registry: disabling keeps the song's references and
falls back to built-ins in words, so stopping a plugin never edits the song
and re-enabling restores it as written. Uninstalling forgets everything
together — the manifest, the remembered source, its origin, its answers,
and its weight — through one door (`uninstallPluginEverywhere` in
`src/plugins/uninstall.ts`), so no shelf keeps what the rest forgot and a
reinstall asks everything again. The word is `plugin uninstall <id>` — a
session setting like `plugin install`, so writing the line is the approval
and no file carries one: the scene forgets through the door, unseats the
live code from the banks both clocks read, and the song falls back with a
notice, never an edit.

And the rule the roadmap keeps: **no silent auto-update**. A song pins
`id@major.minor` plus param values; seating a newer minor is an upgrade the
registry records, never a background swap — a song that played yesterday
plays tomorrow, with a notice when its plugin moved on.

## Turning the knobs

Live values travel beside the declarations (`src/plugins/params.ts`):
`coerceParamValues` clamps any raw object into exactly the declared knobs
(unknown ids dropped, missing at defaults, never throws), `paramRows` draws
one slider row per knob, and `parsePreset` reads a preset that names its own
plugin. The engine (`setPluginParams`) and the exporter
(`RenderOptions.pluginParams`) read the same per-channel list, so a tweak you
hear is the tweak you bounce; a channel with no entry plays manifest defaults.

The values are the SONG's, stored per channel (`Track.pluginParams`) — only
the knobs a channel turned, so an untouched channel is byte-for-byte the
channel it always was:

- **Words:** `params 1 cutoff 70` turns one knob (`params 1 <knob> clear` takes
  one back to its default, `params 1 clear` takes every override off). An id no
  manifest declares is kept and moves nothing, the sample's bargain one scope
  over.
- **Lanes:** `automate 1 param.cutoff 20 90 bars 8 to 15` moves one knob across
  bars, over the channel's own values — a lane moves only the knob it names,
  walked `0..100` and coerced against the real range per note, live and export
  alike.
- **Files:** a `.pluginpatch.json` preset (`src/model/presetfile.ts`) carries
  one plugin's values — `SAVE PRESET` writes the cursor channel's, `LOAD
  PRESET` turns them onto a channel (pointing it at the preset's plugin when
  it plays another, as one undo step). `applyPresetValues` keeps the transfer
  sparse: unknown knobs dropped, each kept value clamped to its own range, and
  a preset for code this machine lacks still loads, its values waiting for the
  install.
- **Song files:** a channel that turns a knob writes a `pluginParams` key at
  file version `46`; a channel that turns none writes nothing.

## What a plugin costs

Every instrument render is timed where it runs (`renderPluginBuffer` in
`src/audio/pluginVoice.ts`, both clocks into one record), and the totals land
in `src/plugins/meter.ts`: renders, average milliseconds per render, the worst
one. The browser row says the average (`Supersaw instrument 0.9.0 0.4ms`) and
`OVER` past the 16ms budget — about one frame of DSP per note on average, past
which dense parts start eating the scheduler's 120ms look-ahead. The budget is a
threshold for a person to read, not a line the engine enforces: nothing mutes,
bypasses or refuses on cost, because changing the music without asking is
exactly the decision this app leaves to a person. Effect-chain time is not
split out: an effected channel reads as its instrument, chain included.

## Latency: saying it late, hearing it on time

Some instruments cannot start at their attack: a lookahead compressor or an
oversampled saturator eats a few milliseconds before its transient lands. A
plugin that knows says so in its manifest — `latencyMs`, whole milliseconds,
at most 100 — and the host starts its notes early by that much on BOTH clocks
(`compensatedStartAt` in `src/audio/pluginVoice.ts`, inside the shared buffer
path, so live and export cannot disagree). Absent is 0: most renders start at
their attack and claim nothing. A claim past 100ms is refused at install,
because the scheduler's ~120ms look-ahead could not honour it; a note earlier
than its own latency (the downbeat of a latent plugin) starts at 0 rather
than before the song. The browser's detail line says `lat 12ms` when there is
a claim to read — reporting, like the CPU meter, never enforcement.

## Multi-out: one render, several buses

A drum kit is not one sound: `renderNote` may return one `Float32Array` per
output bus instead of one mono buffer. Bus 0 is the MAIN — the mix a mono
host would have heard — and the rest follow in manifest `outs` order (a kit's
`thump`, `click`), or `out1..N` when the manifest declares none. Buses may be
different lengths; the host pads the short with silence, so a plugin never
length-matches by hand. Each bus runs the channel's insert chain on its own,
and both clocks hold one multichannel buffer per note (`renderPluginBuffer` in
`src/audio/pluginVoice.ts`), so a stereo kit plays in full live and on
export. `EXPORT STEMS` separates them: a channel with two or more DECLARED
outs becomes one `.wav` per bus (`my-tune-03-drums-kick.wav` beside
`my-tune-03-drums-click.wav`), each rendered alone through the same graph the
mix came out of — and a bus the render does not have is silence for that note
rather than a refusal, so a missing bus is an empty file, never a failed
export. Only declared outs split (only declared names can be file names); an
undeclared multi-out render still reaches the mix whole, and still plays whole
live.

## Where the code lives

```text
src/plugins/manifest.ts   the manifest schema, the strict check, the lenient stored-library reader
src/plugins/meter.ts      the CPU meter: per-plugin render totals, the 16ms budget, busiest-first stats
src/plugins/registry.ts   the in-memory list: register / unregister / enable / disable / lookup
src/plugins/host.ts       PluginHost, version negotiation, the seeded RNG
src/pluginLibrary.ts      persistence: one localStorage key, validated on read, silent on failure
src/ui/pluginBoard.ts     the browser's decisions (rows, selection, toggle, grant keys), Phaser-free beside its view
src/ui/PluginBrowser.ts   the grant screen: installed rows, ENTER/X/DEL, opened from the F2 menu
src/main.ts               dev hook: window.__tracklet.trackletPlugins beside catalog and capabilities
src/__tests__/plugins.test.ts      the M0 suite: validation, registry, determinism, storage
src/__tests__/pluginBoard.test.ts  the browser suite: rows, selection, toggle, grant keys
```

## The browser (M0 decisions, G32 view)

The plugin browser lists one row per registered plugin — `ON name kind
version` — with `NO PLUGINS INSTALLED` and the hello-panel pointer when there
is nothing to list. Its decisions live in `src/ui/pluginBoard.ts`, Phaser-free
beside the `PluginBrowser` view that draws them (the `mixerBoard.ts` pattern):
selection clamps into the rows and stops at the walls. The browser opens from
the F2 menu's PLUGINS row, because every `F` key is spoken for, and lists one
row per registered plugin with its meter cost. Each row carries its pending
permissions, the detail line reads `needs` for the pending half and `allows`
for the granted half, and one keypress answers one word — ENTER allows the
next pending word, X takes back the next granted word (`nextGrantAt` / `nextDenyAt`, applied and
persisted beside the library, each said in words beside the repaint). Two
presses of DEL forget the row entirely (the `removalArm` bargain: the second
press removes what the first armed), through the uninstall door, so the song
keeps naming it and falls back. There is deliberately no enable/disable key:
enabled flags are session-only (the library persists manifests, not
switches), and a switch that silently resets on reload would be a trap. An
install says the ask in its own toast (`It asks for storage - nothing
granted yet.`), so the question is on screen before the screen that
answers it.

## Ground rules that never change

- **Validate before load.** One mistake in the manifest means zero effect and
  one named error — never a half-loaded plugin.
- **Deterministic.** Seeded randomness only; same inputs, same render.
- **Live == export.** Plugin DSP serves both clocks from one function. A
  plugin that sounds different on export is broken.
- **Songs carry params, not code.** Uninstalling never edits a song; missing
  plugins fall back with a notice, never silence.
- **No silent auto-update.** A song pins its plugins; upgrades are recorded,
  never backgrounded.
- **Docs travel with code.** Every new export, behavior, refusal, and file
  field updates `doc/11-plugins.md`, `doc/12-plugin-api.md`, and the roadmap
  log in the same change — see `12-plugin-api.md` for the contract.
