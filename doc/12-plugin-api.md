# 12 — Plugin API reference

The exhaustive reference for the plugin host. `11-plugins.md` is the handbook
(how to build one); this page is the contract (exactly what each function
takes, returns, and refuses). It is generated-checked from the types: a test
fails if a public export in `src/plugins/` has no section here, so if the
build says a function exists, this page describes it.

## The docs contract (enforced by tests)

1. New public export in `src/plugins/` → new section here.
2. New user-facing behavior → new `11-plugins.md` example, executed by tests.
3. New refusal string → new `05-error-catalogue.md` entry quoting it.
4. New song/file field → version rung + round-trip test + documented fallback.
5. Roadmap log row + refreshed `%` in the same generation.

## manifest.ts

- `HOST_API_VERSION` — the host API this build speaks (`1`). Plugins target it
  with `apiVersion`; older keeps working, newer is refused.
- `PLUGIN_KINDS` — `instrument`, `effect`, `generator`, `panel`, `io`.
- `isPluginKind(value)` — whether the value names a seatable kind.
- `pluginManifestProblem(raw)` — the ONE problem with a manifest, or `null`
  when it loads. Strict: the install path, where a named refusal is cheap.
- `validatePluginManifest(raw)` — `{ ok: true, manifest }` with trimmed text
  and copied params, or `{ ok: false, error }` with the named fix. Never
  returns the input object.
- `parsePluginManifests(raw)` — lenient stored-library read: drops bad rows
  and duplicate ids, keeps the rest (the `parseUserKits` policy).
- `pluginExample(manifest)` — the one example line per kind published on
  `window.__tracklet.trackletPlugins` (`track 1 voice plugin:<id>` for instruments,
  `track 1 fx <id> 45` for effects, `generate <id>`, `page <id>`,
  `import <id>`).
- Limits: `MAX_PLUGIN_NAME` (32), `MAX_PLUGIN_PARAMS` (32),
  `MAX_PLUGIN_PARAM_ID` (24), `MAX_PLUGIN_PARAM_LABEL` (32),
  `MAX_PLUGIN_LATENCY_MS` (100). Ids are
  reverse-DNS lowercase with a dot (max 64 chars); versions are
  `MAJOR.MINOR.PATCH`; params are 0–100 with `min < max` and `default`
  inside; `latencyMs` is 0–100 whole milliseconds, absent is 0.
- `pluginLatencyProblem(id, value)` — the one problem with a latency claim,
  or `null` when it stands (absent included).
- `pluginLatencySec(manifest)` — the claim in seconds, clamped 0–100ms:
  the lenient read for hand-built manifests past the validated path.
- `pluginOutsProblem(id, value)` / `MAX_PLUGIN_OUTS` (8) /
  `MAX_PLUGIN_OUT_NAME` (24) — the output-names claim: 1–8 unique file-safe
  words, absent is undeclared.
- `pluginOutName(manifest, index)` — the bus's declared name, or `out1..N`
  undeclared: what per-out stems will be called.
- `pluginPermissionsProblem(id, value)` / `PLUGIN_PERMISSIONS`
  (`network`, `storage`) — the permission claim: absent or empty is none,
  anything else names only what the host grants, each once.

## registry.ts

Pure in-memory list; every function copies, none mutates. Storage lives in
`src/pluginLibrary.ts`, never here.

- `createRegistry()` — the empty registry.
- `registerPlugin(registry, raw)` — validates first, then stores. Success
  returns the new registry plus the entry; failure returns the UNCHANGED
  registry plus the named error. Re-registering an id upgrades its manifest
  and keeps its enabled flag.
- `unregisterPlugin(registry, id)` — forgets the id; unknown ids are a no-op.
- `enablePlugin(registry, id)` / `disablePlugin(registry, id)` — may-run
  switch. Disabling keeps song references intact; unknown ids are a no-op.
- `pluginFromId(registry, id)` — the entry or `null`.
- `enabledPlugins(registry)` — manifests that may run right now.
- `pluginIds(registry)` — comma-joined ids, for messages that list them.

## host.ts

- `PluginHost` — `{ apiVersion, random(), log(message) }`. The whole of what
  a plugin may touch.
- `LoadedPlugin` — `{ manifest, enabled }`: a known plugin plus its switch.
- `negotiateApiVersion(wanted)` — `{ ok: true }` for any whole 1–current,
  `{ ok: false, error }` otherwise (non-numbers and newer-than-build refused
  in words).
- `seededRandom(seed)` — mulberry32. Same seed, same sequence, every machine;
  the only randomness the audio path may use.
- `makePluginHost(pluginId, seed, onLog?)` — builds the surface: seeded RNG
  plus id-prefixed log lines (`[com.example.x] ready`).

## pluginLibrary.ts

- `PLUGIN_LIBRARY_STORAGE_KEY` — `tracklet.plugins`, one namespaced key.
- `loadPluginLibrary(store?)` — installed manifests or `[]`. Never throws:
  corrupt JSON, blocked storage, and half-written lists come back as whatever
  COULD be read.
- `savePluginLibrary(library, store?)` — writes the whole list, returns
  whether it was written (a session that cannot persist still works).
- `PLUGIN_CODE_STORAGE_KEY` — `tracklet.pluginCode`, `{ id: moduleText }`.
- `loadInstalledPluginCode(store?)` / `saveInstalledPluginCode(id, text, store?)`
  / `forgetInstalledPluginCode(id, store?)` — remembered sources, validated on
  read, silent on failure. Only seated code is saved, so a reload re-seats
  exactly what played.
- `PLUGIN_SOURCES_STORAGE_KEY` — `tracklet.pluginSources`, `{ id: source }`.
- `loadPluginSources(store?)` / `savePluginSource(id, source, store?)` /
  `forgetPluginSource(id, store?)` — remembered origins, cleaned on read,
  silent on failure. A blank source writes no row; a reinstall says where
  from.
- `PLUGIN_FINGERPRINTS_STORAGE_KEY` — `tracklet.pluginFingerprints`.
- `loadPluginFingerprints(store?)` / `savePluginFingerprint(id, print, store?)`
  / `forgetPluginFingerprint(id, store?)` — remembered weights, hex-checked
  on read and write, silent on failure.
- `pluginCodeMatchesFingerprint(id, text, prints)` — the re-seat's question:
  a missing weight seats (old install), a match seats, anything else
  refuses.
- `PLUGIN_GRANTS_STORAGE_KEY` — `tracklet.pluginGrants`, `{ id: [...] }`.
- `loadPluginGrants(store?)` / `savePluginGrants(grants, store?)` — remembered
  answers, lenient on read (bad rows and words dropped), silent on failure.
  A decision that cannot be read is denied.

## grants.ts

Pure decisions; every function copies, none mutates. Storage lives in
`src/pluginLibrary.ts`, never here.

- `PluginGrants` — `{ id: [...] }`, sparse: only ids with something granted.
- `createGrants()` — no decisions yet.
- `isPluginPermission(value)` — whether the word is one the host grants.
- `grantedPermissions(grants, id)` — the stored words, or `[]`. A misshapen
  row reads as none: a read never invents permission.
- `grantPermission(grants, id, word)` — a copy with the word granted. A word
  no host grants, or a second granting, changes nothing.
- `denyPermission(grants, id, word)` — a copy without the word; the last
  denial forgets the id. Unknown ids are a no-op.
- `forgetPluginGrants(grants, id)` — forgets the id beside an uninstall, so a
  reinstall asks again.
- `pendingPermissions(manifest, grants)` — the declaration minus the answers,
  in manifest order: the grant screen's to-do list.
- `parsePluginGrants(raw)` — lenient stored read: drops bad rows and words,
  dedupes, keeps the rest.
- The scene's answerer (`applyPluginGrant` in `src/scenes/TrackerScene.ts`)
  loads the map, answers one word through `grantPermission` /
  `denyPermission`, persists it, and toasts whether anything changed:
  the words `plugin allow <id> <word>` / `plugin deny <id> <word>` (a v55
  session setting, last one wins, so no file carries one).

## uninstall.ts

Pure forgetting; every function copies, none mutates. Persisting stays the
caller's business, never here.

- `PluginStoredState` — `{ registry, code, sources, grants, fingerprints }`:
  everything one install remembers, as plain values off the shelves.
- `createPluginStoredState()` — nothing remembered anywhere.
- `uninstallPluginEverywhere(state, id)` — forgets the id on all five
  shelves at once, so no shelf keeps what the rest forgot. Unknown ids
  return copies unchanged; a reinstall asks everything again.
- The scene's coordinator (`uninstallPluginById` in
  `src/scenes/TrackerScene.ts`) loads the five shelves, forgets through the
  door, persists the five next-states, unseats the live banks and re-pushes
  both clocks: the word `plugin uninstall <id>` (a v55 session setting, so
  no file carries one and writing the line is the approval). The song is
  never edited; an unknown id toasts a notice naming it.

## pluginBoard.ts (src/ui/)

Phaser-free browser decisions; the `PluginBrowser` view draws what these answer.

- `pluginRows(registry, stats?, grants?)` — one `{ id, name, kind, version,
  enabled, pending }` per registered plugin, in registration order.
  Built-ins never appear: they are not plugins and are browsed in F6.
  `pending` is the manifest's ask minus the stored answers.
- `emptyPluginText()` — the no-rows line, with the hello-panel pointer.
- `clampPluginSelection(selection, rowCount)` / `movePluginSelection(...)` —
  clamped index; moves stop at the walls, never wrap.
- `togglePluginAt(registry, selection)` — flips the selected row through
  `enablePlugin`/`disablePlugin`; stale indexes are a no-op.
- `pluginRowLabel(row)` — `ON name kind version` as the browser draws it.
- `pluginDetail(entry, example, grants?)` — `id@version params — e.g.
  example` under the selection, with `needs` for the pending half and
  `allows` for the granted half (both in manifest order).
- `nextGrantAt(registry, grants, selection)` — the ENTER key's answer: the
  selected row's first pending word in manifest order, or null when there is
  nothing to allow. Applying stays the caller's job.
- `nextDenyAt(registry, grants, selection)` — the X key's answer: the
  selected row's first granted word in manifest order (grant order never
  shows), or null when there is nothing to take back.
- `toggleGrantAt(registry, grants, selection, word)` — flips one permission
  word for the selected row through the grants module; stale indexes and
  unknown words are a no-op. The caller persists what comes back.
- `pendingGrantNote(manifest, grants)` — the install's ask as one sentence
  (`It asks for storage - nothing granted yet.`), or nothing when decided.

## PluginBrowser.ts (src/ui/)

The grant screen: installed bundles as rows, opened from the F2 menu's
PLUGINS row (every `F` key is spoken for). Dumb on purpose, the F6
browser's bargain — the scene hands it `{ id, label, detail }` rows and it
owns layout, selection, scroll and the DEL arm, nothing else.

- `PLUGIN_BROWSER_DETAIL_CHARS` / `PLUGIN_BROWSER_DETAIL_LINES` — the detail
  pane's measure, exported so the scene wraps to it rather than guessing.
- `setRows(rows)` — the list replaced wholesale from a fresh read; the
  selection clamps, the arm survives only while its id does.
- Keys: arrows/Home/End browse, ENTER allows the row's next pending word,
  X takes back the next granted word, DEL forgets the `removalArm` way
  (the second press removes the row the first press armed), ESC closes.
  No enable/disable key: enabled flags are session-only, and a switch that
  resets on reload would be a trap, not a control.
- The scene (`refreshPluginBrowser`, `allow/deny/deletePluginById` in
  `src/scenes/TrackerScene.ts`) repaints after every open and every action;
  answering persists through the grants key, forgetting through the
  uninstall door, each said in words beside the repaint.

## instrument.ts

- `PLUGIN_VOICE_PREFIX` — `plugin:`, the prefix a track's voice word carries.
- `PluginParamValues` / `PluginNoteEvent` — clamped 0–100 params; `{ midi,
  velocity, startStep, holdSteps, seed }`.
- `InstrumentPlugin` — `{ manifest, renderNote(params, note, sampleRate) }`:
  pure samples, deterministic, finite, roughly ±1 — mono, or one bus per
  output (`PluginRenderOut`).
- `renderOutBuses(rendered)` — the buses of a render, bus 0 the main:
  mono in, one bus out; strangers and empty lists read as no buses.
- `pluginVoiceRef(id)` / `isPluginVoiceRef(word)` / `parsePluginVoiceRef(word)`
  — write, spot, and read `plugin:<id>`; malformed means "not a plugin word",
  never an error.
- `resolvePluginVoice(ref, known)` — `{ kind: 'plugin', id }` when registered
  and enabled, else `{ kind: 'builtin-fallback', id, notice }` with the line
  the app shows.
- `pluginMidiHz(midi)` / `pluginNoteRandom(seed)` — shared tuning and the
  per-note seeded stream.
- `defaultPluginParams(manifest)` — every knob at its default: the sound
  before presets (M6) exist.
- `pluginNoteSeed(track, step, midi)` — one stable seed per note occurrence
  (previews vary by pitch alone).

## pluginVoice.ts (src/audio/)

- `pluginForTrack(id, plugins)` / `resolveTrackPlugins(ids, plugins)` — one
  plugin per channel, resolved once per song; missing is null (fallback).
- `pluginEventFor(track, step, midi, velocity, holdSteps)` — the event a note
  is, clamped and seeded.
- `renderPluginBuffer(ctx, plugin, note, sampleRate, at, values?, fx?)` —
  samples as an unconnected buffer source, processed through the channel's
  insert chain when one is seated; the caller wires source → envelope → input.
  One buffer channel per out bus (short buses padded with silence, each bus
  through the chain on its own; mono renders hold exactly the old path).
  Timed in a `finally` and filed by plugin id into the CPU meter — a throwing
  render still files what it cost. Starts early by the manifest's latency
  claim, so the transient lands on `at` on both clocks.
- `compensatedStartAt(at, manifest)` — the pure start-time arithmetic both
  clocks share through the buffer path: `at` minus the claim, clamped at 0.
- `pluginCpuStats()` / `resetPluginCpu()` — the live meter read (busiest
  first) and its reset, for the browser and a test.

## builtIn.ts (src/plugins/)

- `BUILT_IN_INSTRUMENTS` — the instruments shipped in the bundle (the
  supersaw, the EP piano), validated loudly at import: a broken built-in
  throws, because silent fallbacks are for other machines' songs, not this build.
- `builtInPluginIds()` — the ids, for messages that list them.
- `BUILT_IN_EFFECTS` — the effects shipped in the bundle (bitcrush-plus),
  seated the same loud way: what a channel's `fx` chain can name today.
- `builtInEffectIds()` — the effect ids, for messages that list them.

## sdk.ts

- `defineInstrument({ manifest, renderNote })` — validate + seat, or refuse
  with the named reason. Wrong kinds are refused with the milestone that
  seats them, never a crash.
- `checkInstrumentModule(manifest, module)` — the install-time gate: null when
  trusted, the reason when not.
- `goldenRender(plugin, params?, sampleRate?)` — the golden note (A4, full
  force) rendered and hashed (`golden:<frames>:<hex>`): the third-party
  `golden.test.ts` pattern. A moving hash is a broken render.
- `GOLDEN_NOTE` — the fixed event the harness renders.

## loader.ts

- `seatInstrumentModule(manifestJson, module)` — the ONE place code is
  trusted: validate, check, seat (`{ plugin, trusted }`) or refuse in words.
  Fetching bytes (folder, zip, approved URL) is the caller's business; this
  module never touches network, DOM, or storage.
- `seatEffectModule(manifestJson, module)` — the same gate for effects:
  validate, check `processBlock`, seat (`{ plugin, trusted }`) or refuse.
- `defineEffect({ manifest, processBlock })` / `checkEffectModule(manifest,
  module)` — the SDK half of the same gate (in `sdk.ts`): wrong kinds are
  refused with the milestone that seats them, never a crash.

## params.ts

- `coerceParamValues(manifest, raw)` — live values: every knob clamped, unknown
  ids dropped, missing knobs at defaults. Never throws.
- `paramRows(manifest, values)` / `paramRowLabel(row)` — one `{ id, label, min,
  max, value }` per knob, and the line the browser draws it as.
- `parsePreset(manifest, raw)` — a preset for THIS plugin or null (another
  plugin's preset, or rubbish, is not an error — it is not ours).
- `applyPresetValues(manifest | null, raw)` — the values a preset file's map
  turns into on a channel: SPARSE (only turned knobs travel, so a default is
  never written), each kept value clamped to its own range, unknown knobs
  dropped; a null manifest passes the map through, so values for missing code
  wait for the install.

## meter.ts

- `createCpuRecord` / `recordCpu(record, id, ms)` / `resetCpu(record)` — the
  per-plugin totals: renders, total and worst milliseconds. Non-measurements
  dropped, never throws.
- `cpuStats(record)` — every measured plugin busiest first: `{ id, renders,
  avgMs, maxMs, overBudget }`, averages to one decimal for the row.
- `PLUGIN_CPU_BUDGET_AVG_MS` (16) — the average past which a row says OVER. A
  display threshold, not an enforcement line: nothing mutes or bypasses on cost.

## effect.ts

- `EffectPlugin` — `{ manifest, processBlock(input, params, sampleRate) }`:
  pure wet signal (same length, or longer with a tail), deterministic,
  finite, roughly ±1. Stateless per note: no memory may cross notes.
- `effectMix(amount, dry, wet)` — the host's wet-over-dry (0 = OFF, 100 = wet);
  a wet tail outlives the dry note.

## generator.ts

- `GeneratorMode` — `constructive` (writes cells the song keeps) or
  `interpretive` (played live without writing; refused by this build with the
  milestone that seats it).
- `GeneratorPlugin` — `{ manifest, mode, expand(input, params, seed) }`: one
  pure expansion, deterministic, side-effect free; the host previews the edits
  and commits them as one undo step.
- `GeneratorInput` / `GeneratorEdits` — what an expansion may be asked for and
  what it hands back (`euclid` hits plus their pattern string; `bass` rows plus
  their roots).
- `euclidPattern(pulses, steps, rotate?)` / `euclidPatternString(...)` — the
  Bjorklund distribution (`E(3, 8)` is `9..9..9.`) and the string a `pad` line
  writes; no RNG, so the same three numbers always write the same beat.
- `BASS_RHYTHMS` (`four`, `half`, `offbeat`) / `isBassRhythm(value)` — the
  named bass templates and their check.
- `bassFollowNotes(progression, key, octave, rows, from?, rhythm?)` — the
  loop's roots on the rows the rhythm keeps, at the octave; the lowest note of
  each chord, so a bassline cannot drift from the keyboard above it.
- `MAX_EUCLID_STEPS` (64) — the most steps one rhythm may span.

## sdk.ts generators

- `defineGenerator({ manifest, expand, mode? })` — validate + seat, or refuse
  with the named reason. Wrong kinds and interpretive modes are refused with
  the milestone that seats them, never a crash.
- `checkGeneratorModule(manifest, module)` — the install-time gate: null when
  trusted, the reason when not.

## loader.ts generators

- `seatGeneratorModule(manifestJson, module)` — the ONE place generator code
  is trusted: validate, check `expand`, seat (`{ plugin, trusted }`) or refuse
  in words.

## builtIn.ts generators

- `BUILT_IN_GENERATORS` — the composers shipped in the bundle (euclid-drums,
  bass-follow), validated loudly at import like the instruments and effects.
- `builtInGeneratorIds()` — the ids, for messages that list them.

## generator ops (API/src/ops/generator.ts)

- `generator.describe` — the seated composers with their ranges, and whether
  the song at hand has a machine and a loop to write into.
- `generator.generate` — ask `euclid` for a rhythm (pad, pulses, rotate, bar)
  or `bass` for a bassline (pattern, row, track, rhythm, octave): written into
  the song as ordinary rows and cells, handed back with exactly what was
  written.

## panel.ts

- `PanelPlugin` — `{ manifest, mount(el, api) }`: one mount into the panel's
  OWN box, handing back `{ unmount, update? }`. Scoped (only the box's
  subtree), deterministic (same api, same box), total (an empty song renders).
- `PanelApi` — `{ song, theme, params, transport, notify, close }`: a read-only
  song digest (names and counts, never cells), F9 theme tokens plus text
  scale, host-clamped params, read-only transport, a notice line, and a close
  ask. No song edits, no transport driving.
- `MountedPanel` — `{ unmount, update? }`: teardown plus repaint on song,
  theme or text-scale change.
- `PANEL_PAGE_PREFIX` (`plugin:`) / `panelPageRef(id)` / `isPanelPageRef(value)`
  / `parsePanelRef(value)` — write, spot and read `plugin:<id>`; malformed
  means "not a panel word", never an error.
- `resolvePanelRef(ref, known)` — `{ kind: 'panel', id }` when known and
  enabled, else `{ kind: 'tracker-fallback', id, notice }`: no built-in screen
  to fall back to, so the tracker stays up and says so.
- `panelClass(id)` / `scopePanelElement(el, id)` — the `tpl-p-<slug>` class plus
  `data-tracklet-panel`, so a mount proves it stayed inside.
- `describePanel(plugin)` — `id@version N params` under a panel row.
- `PanelCodeBank` / `createPanelCodeBank()` / `seatPanelCode(bank, plugin)` —
  installed code seated this session (same-id reseating replaces); the scene
  reads the bundle first and the bank second, so a bundled panel wins a clash.
- `unseatPanelCode(bank, id)` — the id leaves the bank beside an uninstall,
  so naming it falls back instead of playing remembered code. Unknown ids
  are a no-op.
- `findPanelCode(bank, builtIn, id)` — the code behind an id, or null when
  neither carries it ("installed but unloaded", said in words by the caller).
- `panelCodeIds(bank, builtIn)` — every id with code behind it, bundle first:
  what the dropdown may offer.
- `panelTransport(playing, sounding, rows)` — the one transport reading: bar 1
  stopped or rowless, else `1 + floor(sounding / rows)`. The overlay api and
  the once-per-frame repaint both read it, so box and transport agree.

## sdk.ts panels

- `definePanel({ manifest, mount })` — validate + seat, or refuse with the
  named reason. Wrong kinds are refused with the milestone that seats them.
- `checkPanelModule(manifest, module)` — the install-time gate: null when
  trusted, the reason when not.

## loader.ts panels

- `seatPanelModule(manifestJson, module)` — the ONE place panel code is
  trusted: validate, check `mount`, seat (`{ plugin, trusted }`) or refuse.

## install.ts

Bytes in, answers out; the Blob-URL crossing is injected, never assumed.

- `readZipStore(bytes)` — a store-only zip as files in archive order.
  Anything else (non-zip, truncation, compression, encryption, descriptor,
  size lies, checksum mismatch, climb-out names, folders, oversize) refuses
  naming the file.
- `parsePluginBundle(files)` / `bundleFromZipBytes(bytes)` — `manifest.json`
  plus the module its `entry` names (`{ manifestJson, moduleText, entry }`).
  Extra files are ignored room; a missing manifest, bad JSON, missing entry
  name, or entry with no file refuses.
- `seatModuleForKind(manifestJson, module)` — the four loader gates behind
  one door (`{ kind, plugin }`); a kind with no milestone (`io`) is refused
  with the milestone, not a crash.
- `importModuleText(text)` — the browser crossing: source to Blob URL to
  dynamic `import()`, revoked after. The default the scene leaves; tests fake.
- `installPluginBundle(zipBytes, registry, { importModule, source }?)` —
  open, register, import, seat. Only a corrupt archive or a bad manifest
  fails; unloadable code installs registered-but-unseated with the reason,
  plus the source for the caller to persist when seating passed. The result
  carries `source`: where it came from, or null when nobody said.
- `installBundledPlugin(registry, manifestJson, moduleText, importModule?, entry?, source?)`
  — one plugin from an already-opened manifest plus source: the shared tail
  of a zip and a song bundle's `plugins/` folder, so both install alike.
- `normalizePluginSource(value)` / `MAX_PLUGIN_SOURCE_LENGTH` (512) —
  where-from cleaned for remembering: trimmed and capped, or null for
  blanks and non-strings. Informational only: never a refusal.
- `fingerprintPluginCode(text)` — what the module weighed: FNV-1a over the
  UTF-8 bytes, eight hex digits. Integrity, not authentication — a changed
  weight refuses the seat, it names no signer.
- `fetchPluginBundle(url, fetcher?)` — a `.tracklet-plugin` zip from a URL
  the user approved, as bytes. Only `http:`/`https:` go out; anything else,
  a dead server, a bad status, or a stopped download refuses naming the URL.
- `songPluginIds(song)` — every plugin id a song names (instruments plus
  insert ids, deduped): what the lockfile pins and the bundle packs.
- `pluginMigrationNotices(locked, known)` — one line per pinned plugin held
  against this machine: missing, disabled, older, upgraded minor, moved
  major, mangled pin. A match is silence.

## bundle.ts

Bytes in, answers out; the scene collects the parts and acts on them.

- `BUNDLE_SONG_NAME` (`song.json`) / `BUNDLE_PLUGIN_DIR` (`plugins`) /
  `BUNDLE_SAMPLE_DIR` (`samples`) / `BUNDLE_KIT_DIR` (`kits`) — the flat layout:
  the song, one `manifest.json` plus module source per `plugins/<id>/`, one `.wav`
  per `samples/<NAME>.wav`, and one `kits/<NAME>.json` for a KIT OF YOUR OWN the
  song names. The kit is packed because a song carries only its kit's NAME: without
  the voices a bundle arrived with the right name and the wrong drums, falling back
  to a preset and saying nothing. A kit file that does not parse refuses the whole
  bundle, which is the plugins' rule one folder over.
- `songBundleFileName(stem)` — `<stem>.tracklet-bundle.zip`, beside `<stem>.json`.
- `bundleSampleName(name)` — the file a recording travels under, path
  characters folded.
- `buildSongBundle({ songJson, plugins, samples, kits })` — pack the four (kits
  optional); a song naming nothing packs its JSON alone and still opens.
- `parseSongBundle(bytes)` — the song, each plugin's manifest plus source,
  each sample's wav. Exact or refused: a missing song, a non-song `song.json`,
  a plugin folder with no manifest or no module each name the break — one bad
  folder never costs the rest their hearing, because nothing half-opens.
- `bundleFileKind(bytes)` — `song-bundle`, `plugin-bundle`, or `other`: what
  a picked `.zip` is before anything opens it.

## builtIn.ts panels

- `BUILT_IN_PANELS` — the pages shipped in the bundle (the meter panel),
  validated loudly at import like every built-in.
- `builtInPanelIds()` — the ids, for messages that list them.

## pluginPanel.ts (src/ui/)

Phaser-free overlay session; the scene owns the box, this owns "what is showing".

- `PluginPanelSession` — `open(ref, known)` resolves (a refusal changes
  nothing showing), `close()` forgets, `current` names the open reference.
- `panelCodeMissingNotice(id)` — installed but unloaded here, said in words
  with the tracker staying up.
- `panelDropdownRows(known)` — one `{ ref, label }` per known panel (manifest
  name in dropdown caps, id when nameless): the rows after the seven screens.
- `routePageSelection(id)` — a `plugin:<id>` pick opens its overlay, any other
  id switches screens; malformed references stay pages.
- `panelThemeDigest(colors, textScale)` — the theme digest one mounted panel
  reads (body text, fill, accent as CSS plus the scale factor); pure, so the
  contrast guard holds every shipped theme through the panel's actual tokens
  (body at AA, accent at AA-large) without a scene.
- `loadInstalledPanelCode(manifests, bank, importer?)` — one dynamic `import()`
  per installed panel manifest through `seatPanelModule`, reporting
  `{ seated, refused, missing }` per id. No importer means all missing; a
  refusal or a throwing import seats nothing, so one bad panel never costs
  the rest.
- Page-menu hooks (`src/ui/PageMenu.ts`) — optional `panelRows` /
  `panelCurrent` / `selectPanel`: the list grows past the screens, the button
  names the open overlay, and picking a built-in screen puts any overlay away.

## engine.ts / render.ts seating

- `engine.setPluginVoices(ids, plugins)` + `engine.pluginVoiceBank` — resolve
  once per song (the `setSamples` pattern), inspectable by tests.
- `engine.setPluginParams(values)` + `engine.pluginParamBank` — live knob
  values per channel (null plays manifest defaults); `RenderOptions.pluginParams`
  is the export's copy of the same list. Per-note `param.<knob>` lanes merge
  over the bank (`automatedPluginParams` in `model/automation.ts`), live and
  export alike — the scene pushes the song's maps once, the lanes move them
  per step.
- `playNote(..., step, holdSteps)` — plugin channels render through a buffer
  source into their own input; a throwing render unseats and falls through.
- `RenderOptions.plugins` — the library an export resolves against; missing
  exports the built-in voice the app would have played.
- `engine.setPluginFx(chains, plugins)` + `engine.pluginFxBank` — one insert
  chain per channel, resolved once per song; missing names play dry.
  `RenderOptions.fxPlugins` is the export's copy of the library.
- `RenderOptions.onlyBus` + `renderPluginBuffer(..., onlyBus?)` — one bus of
  the stemmed channel as a mono buffer (silence where the render has no such
  bus, never fallback); the render branch isolates the stemmed channel only.
- `renderOutStemsToPcm(song, requests, options)` — every entry of a stem plan
  in plan order, whole channels and isolated buses alike; `stemRequests(plan)`
  is what the renderer is asked for, so names and audio cannot drift apart.

## pluginFx.ts (src/audio/)

- `resolveTrackFx(chains, plugins)` — one chain per channel, index-aligned
  with the tracks; unknown names are dropped (dry), never refused.
- `applyTrackFx(samples, chain, sampleRate)` — each slot above 0 renders wet
  through its pure `processBlock` (at manifest defaults) and mixes it over
  the dry with `effectMix`; a throwing slot is skipped and the dry survives.

## song.ts fx model

- `TrackFx` — `{ id, amount }`: one seated insert, 0..100 with 0 meaning OFF.
- `Track.fx` — the chain in order; empty plays dry. `MAX_TRACK_FX` is 4.
- `setTrackFx(track, id, amount)` / `removeTrackFx(track, id)` — seat or
  retune (a full chain retunes but never grows), take one slot off.
- `clampTrackFxAmount(amount)` — the range every insert shares.

## window.__tracklet.trackletPlugins

Development builds publish one row per installed plugin: `{ manifest,
example }`. An agent reads this instead of memorizing `11-plugins.md` —
same rule as capabilities: ask the build in front of you.
