# Tracklet Core API

A stable, described, JSON-shaped **front for Tracklet's own model**, so that
something which is not this app can write and read its music.

Tracklet already has a core: `src/model/` is pure — no Phaser, no DOM, no audio —
and it is covered by over a thousand tests. But it is a library FOR the app: you
have to know that `applyScript` returns a `ScriptApplyResult`, that `songToJson`
is the file writer, that `Song` is the object, and which of the forty modules owns
which name. This folder adds nothing to the music and everything to the interface:

> **the same model, as named operations with JSON in and JSON out.**

That single shape is why this is useful four ways at once. The [CLI](bin/tracklet-api.ts)
runs an operation from a shell. A TypeScript caller gets `tracklet.script.apply(…)`.
The [server](bin/tracklet-server.ts) answers the same operations as JSON-RPC over
HTTP, so a program that is not this one — an agent with a fetch tool, an editor
plugin — can use them. And the same endpoint speaks **MCP**, so an AI agent gets
every operation as a tool. **One registry, four consumers, no second description
of anything to drift.**

```text
API/
  README.md          this file
  bin/
    tracklet-api.ts    the CLI entry point
    tracklet-server.ts the HTTP entry point (you start it)
    tracklet-mcp.ts    the stdio entry point (a client starts it)
  src/
    index.ts         the public import: everything below
    identity.ts      name, version, port, routes — no imports, so the app can read it
    api.ts           callOperation(name, input) and createTrackletApi()
    operation.ts     what an operation IS (name, summary, input schema, run)
    result.ts        the one envelope, and the refusal codes
    input.ts         reading an operation's arguments
    songAccess.ts    accepting a song as an object or JSON, and describing it
    library.ts       the example songs on disk, contained and parsed
    rpc.ts           JSON-RPC 2.0 over a parsed message, and the code mapping
    mcp.ts           the same registry as MCP tools, over Streamable HTTP
    stdio.ts         the same messages over stdin and stdout, for a client
    server.ts        the HTTP routes, the body limit, the loopback default
    cli.ts           argv parsing and output
    ops/
      index.ts       the registry — every operation, in one list
      language.ts    what this build speaks: capabilities, catalog, words
      songs.ts       create, describe, analyze, grid, JSON in and out
      script.ts      validate, apply, format, parse a file
      library.ts     list, read and open the songs in this repository
      export.ts      MIDI, stems, the export plan, and an honest refusal
      machine.ts     the drum machine, read back
      recorder.ts    the recorder takes, a capture plan, and two honest refusals
      arp.ts         the arp dials read back, and a run committed into cells
      workspace.ts   the arranger timeline, and the whole workspace
  tests/
    api.test.ts        the contract, tested the way a consumer uses it
    transport.test.ts  the JSON-RPC envelope and the HTTP routes
    write.test.ts      the write rules, and one real write that cleans up
    mcp.test.ts        the MCP handshake, the tool list, and the read-only CORS
    recorder.test.ts   the recorder reads, the capture plan and the refusals
    arp.test.ts        the arp reads, the run it writes, the edits and a diff
    stdio.test.ts      the stdio channel, through two real streams
```

## The one rule that makes it pleasant

Every operation answers with the same envelope, and **nothing throws at you**:

```json
{ "ok": true,  "result": { … } }
{ "ok": false, "error": { "code": "script_refused", "message": "…", "details": ["line 7: …"] } }
```

`code` is a closed set you can branch on — `invalid_input`, `script_refused`,
`file_refused`, `not_found`, `unsupported`, `internal` — `message` is a sentence,
and `details` is a list of problems with their line numbers where the parser gave
them. An operation raises a refusal with `refuse(code, message, details)`; the
dispatcher turns it into the failure branch. So an operation reads like ordinary
code and a caller only ever handles one shape.

## Quick start

From TypeScript:

```ts
import { createTrackletApi } from './API/src/index';

const tracklet = createTrackletApi();

// What does this build speak? Ask before writing a line.
const limits = await tracklet.language.limits();

// Write a song, checking it first (the safe call — it changes nothing).
const checked = await tracklet.script.validate({ script });
if (checked.ok && checked.result.valid) {
  const made = await tracklet.script.apply({ script });
  if (made.ok) console.log(made.result.summary);
}

// Read one of the songs in this repository and print a pattern of it.
const opened = await tracklet.library.open({ path: 'scripts/deepseek/06-sunrise-set.txt' });
const grid = await tracklet.song.grid({ song: opened.result.song, pattern: 3 });

// Change ONE thing about it, without writing it again — and get back what moved.
const tweaked = await tracklet.song.edit({
  song: opened.result.song,
  edits: [
    { op: 'song.set', bpm: 96 },
    { op: 'track.set', track: 2, level: 70 },
    { op: 'cell.set', pattern: 3, row: 0, track: 1, note: 'F-4' },
  ],
});
// tweaked.result.edits: [{ edit: 1, target: 'tempo', from: '124', to: '96', changed: true }, …]
```

From a shell (`npm run api -- …`):

```bash
npm run api -- --list                         # every operation
npm run api -- api.describe                   # the whole surface, as JSON
npm run api -- language.search '{"query":"bass"}'
npm run api -- library.list '{"query":"deepseek"}'
npm run api -- library.open '{"path":"scripts/deepseek/06-sunrise-set.txt"}'
npm run api -- export.midi '{"song":{…}}'

# A refusal exits 1, a result exits 0, and the pipe carries JSON:
echo '{"script":"new\nsong \"X\"\ntracks 3\ntrack 1 \"LEAD\" voice lead\npattern 1 \"A\"\nA-4 .\n"}' \
  | npm run api -- script.validate -
```

By name, when you would rather not hold a facade:

```ts
import { callOperation } from './API/src/index';
const result = await callOperation('song.create', { title: 'IDEA', key: 'A minor', tracks: 5 });
```

## Over the wire

`npm run api:server` (add `-- --port 0` for a free port, `--host 0.0.0.0` to be
reachable from elsewhere, `--quiet` for no log line per call) starts a JSON-RPC
2.0 endpoint. It binds to **loopback** unless you say otherwise.

```bash
npm run api:server                              # http://127.0.0.1:4590
curl -s http://127.0.0.1:4590/health
curl -s http://127.0.0.1:4590/operations        # the api.describe payload

curl -s http://127.0.0.1:4590/rpc -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"language.limits"}'

# a batch, with a notification in it — the notification gets no reply
curl -s http://127.0.0.1:4590/rpc -H 'content-type: application/json' \
  -d '[{"jsonrpc":"2.0","id":"a","method":"api.version"},
       {"jsonrpc":"2.0","method":"api.version"}]'
```

```json
{ "jsonrpc": "2.0", "id": 1, "result": { … } }
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32001, "message": "…", "data": { "code": "script_refused", "details": ["line 3: …"] } } }
```

**A method is an operation name.** `script.apply` is both, so `api.describe`
lists every method this server has — there is no second list to keep in step.

**A refused call is HTTP 200.** The conversation worked; the script did not. The
protocol's error codes are used where they mean something (`-32601` no such
method, `-32602` bad arguments, `-32700` the body was not JSON), and the API's own
stable code travels alongside in `data.code` — so a client can branch on
`script_refused` instead of on a number:

| API code | JSON-RPC | when |
| --- | --- | --- |
| `invalid_input` | `-32602` | the arguments were missing or the wrong shape |
| `script_refused` | `-32001` | the script parsed and was refused; `data.details` has the lines |
| `file_refused` | `-32002` | a song file was read and refused |
| `unsupported` | `-32003` | this build cannot do it (audio rendering in Node) |
| `not_found` | `-32004` | a valid method could not find the thing it was asked for |
| `internal` | `-32603` | an operation's own bug |

Only a failure of the **transport** — a 404 route, a 405 verb, a 415 content
type, a 413 body over the limit — gets a status of its own and a plain
`{ "error": { … } }` body. Requests are capped at 8 MB, and a body with no `id` is
a notification and is answered with `204` and nothing else.

**A page on this machine may read, never write.** The `GET` routes answer with an
`Access-Control-Allow-Origin` when the `Origin` header is a loopback origin —
`localhost`, `127.0.0.1` or `::1`, any port — which is what lets Tracklet's own
MCP page ask the server whether it is running. The `POST` routes never carry that
header, so a random web page can send a request but can never read the answer, and
cannot use this API as an oracle for the songs on your disk.

The server also reports what it carried, which is most of the debugging:

```text
✓ language.limits               2ms
✗ script.apply                  4ms  script_refused
```

## The operations

Forty-six of them, in twelve groups. `api.describe` prints them all with their input
schemas and a runnable example; `--list` prints the names and summaries. Every one
is also an MCP tool — the count is the same number in both places, because it is
the same list.

**`language.*` — ask the build.** `capabilities` (the whole manifest),
`limits`, `vocabulary`, `commands`, `catalog`, `quick_reference`, `example`,
`starters`, `starter`, `search`. Call one of these first; it is how you avoid
writing a line this build does not speak.

**`song.*` — make one, change it, look at it.** `create` (a correct header,
applied), `edit` (change ONE thing — a cell, a channel, the tempo, the order, the
drum machine — and get the song back with a line per edit saying what moved),
`diff` (two songs in, the edits between them out — the same list `edit` takes, so a
diff REPLAYS), `describe`, `analyze`, `grid` (a pattern as text — the closest an
agent gets to looking at the screen), `to_json`, `from_json`.

The `edit` vocabulary is a small closed set: `song.set`, `track.set`, `cell.set`,
`cell.clear`, `pattern.clear` and `order.set`, plus the FORM's own `section.set`,
`section.clear` and `arrange.set`, plus the MIXER's own `bus.set` and `master.set`,
plus the drum machine's own `machine.set`, `pad.set`, `pad.step` and
`machine.clear`, plus the ARRANGER's own `automation.set` and `automation.clear`,
plus the ARP page's own `arp.set` and `arp.clear`.
A machine edit changes a pad's row one hit at a time (`pad.step`)
or a field at a time (`pad.set`), which is the difference between an agent that
regenerates a beat and one that fixes a hi-hat. A machine can hold several **bars**
(variations of its beat): give `pad.set`, `pad.step` or `machine.clear` a `bar` to
reach any of them (bar 1, the pads' own rows, is the default), and give
`machine.set` an `order` — the list saying which bar plays in each song bar, e.g.
`[1, 1, 2, 2]`; `[]` plays bar 1 everywhere. `machine.describe` reports `barCount`,
`order` and every bar's rows.

The **mixer** is reachable as edits too: `track.set` carries a channel's `level`,
`pan`, `verb`, `echo`, `duck`, the `bus` group it joins (`""` leaves every group)
and its ten `effects` (`{"drive":40,"cab":60}`), `bus.set` defines or moves a
GROUP fader (`{"name":"DRUMS","level":70}`), and `master.set` puts effects on the
WHOLE MIX (`{"effects":{"tape":25}}`). `song.set` already carries the room's
`room` and `echo`. Everything but `muted`/`solo` is song data; solo is a way of
listening and never reaches a file.

`machine.set` also takes `pads N` and `bars N` — how many pads and bars the
machine HAS, the two things the drum machine page changes with `+ ADD PAD` /
`DEL PAD` and `+ BAR` / `- BAR`. Growing pads fills in kit pads; shrinking drops
the last ones and takes their rows off every bar. Growing bars COPIES the last
bar (a variation, not a blank); shrinking drops from the end, and bar 1 never goes.

The **arranger's automation lanes** are editable too, as `automation.set` and
`automation.clear`. A lane is addressed by its 1-based POSITION in the list: set a
whole lane with `{op:"automation.set", track, target, from, to, startBar, endBar}`
— add an `index` to move the lane already at that position, or leave it out to
append — and drop one with `{op:"automation.clear", index}`, or every lane when
`index` is omitted. Values and bars are clamped the way the language clamps them,
and `song.diff` emits these same edits, so a moved lane is one `automation.set`
rather than a clear-and-re-add.

The **LIVE launch grid** is editable as `scene.set`, `scene.add`, `scene.rename`,
`scene.duplicate` and `scene.clear`. `scene.set` defines or REPLACES a scene by
name — `{op:"scene.set", name:"VERSE", clips:[1, 1, null], machine:2}`, where
`clips` is one entry per channel (a 1-based pattern number, or `null`/`"-"` for a
channel that is silent) and the optional `machine` names the drum-machine bar the
scene performs; `clips` is fitted to the song's channel count. `scene.add`
appends an empty row (name it with `name`, or let the model pick `SCENE N`),
`scene.rename` takes `{name, to}`, and `scene.duplicate` copies a scene right after
itself (`{name}` for a fresh name, or `{name, to}`). `scene.clear` drops one scene
by `name`, or EVERY scene when `name` is omitted, the counterpart of
`automation.clear`. A name beyond the 16-character budget, a non-list `clips`, and
a song already holding 32 scenes are all refused.

Both a channel and a pad take `sample NAME` — a recording of yours, by name,
played on a `wave sample` layer; write `""` to clear it. The bank is the APP's, so
a name it has not loaded is the FALLBACK (the built-in one-shot), never an error —
the same promise `sample NAME` on a line makes.

The form is written the way a script writes it: `section.set` defines a named
group of bars (`{op:"section.set", name:"VERSE", bars:[1,1,2,1]}`, with an
optional `machine` naming which drum-machine bar that part plays), `section.clear`
drops one, and `arrange.set` writes the order as a list of those names
(`{op:"arrange.set", sections:["VERSE","CHORUS","VERSE"]}`) — define the sections
first, then arrange them. An empty `sections` list drops the arrangement without
touching the order.

**`script.*` — the language.** `validate` (parse, change nothing), `apply`
(all-or-nothing, to a blank song or one you pass in), `format` (a song back out
as the script that reproduces it), `parse_file` (a `.txt` or a `.json`).

**`library.*` — the songs on this machine, and where a new one goes.** `list`
(every script under `scripts/` and `storage/songs/`, each applied, with whether it
parsed), `read`, `open`, `write` (a new song into `storage/songs/agent/`, where the
app can open it), `update` (edit a draft IN PLACE, sending only the changes — the
same edit list `song.edit` takes), and `folders` (where songs are read from, the
one folder they are written to, and the rules a writer follows).

**`arranger.*` — the song timeline.** `describe` (the ARRANGER page as data: the
bars of the order with the section each came from, one row per channel, and every
automation lane grouped by channel and target with the value it resolves to on each
bar it spans). The edits that change a lane are in `song.edit` above.

**`workspace.*` — the whole workspace.** `describe` (the full screens this build
has — `tracker`, `machine`, `mixer`, `arranger`, `arp`, `live`, `recorder` — a one-line
model summary of each, and which page the caller says is showing), so one call
answers "what is this app doing" instead of four. The recorder's summary says
plainly that your TAKES are app state this API cannot see; the region and
loudness it bounces at are in the song.

**`live.*` — the LIVE launch grid.** `describe` (the LIVE page as data: every
scene, its per-channel clips with the pattern names they play and the notes each
channel sounds, and the drum-machine bar it performs, plus the rows as a `script`
block you can paste back; it reports `performing: null` and says which scene is
performing is session state it cannot see) and `launch` (resolve one scene by name
and answer what a running app would queue at the next quantize boundary — the wait,
the row it would play and the `quantize` — WITHOUT changing the song, because a
launch is a performance, not a file change). The edits that change a scene are
`scene.*` in `song.edit` above.

**`machine.*` — the drum machine.** `describe` (a song's machine as data: its mix
and clock, and each pad's row as both hit velocities and the pattern string a
script writes; null when the song has none). The edits that change it are in
`song.edit` above, and `script.apply` writes one whole.

**`recorder.*` — audio IN.** The RECORDER page is where audio comes in and goes
out; the OUT half (the region and the loudness) is song data and is read by
`export.plan`, and this group is the IN half. A recording and its take are **app
state** — the bytes live in the browser session's sample bank, and this API is a
different process that has none — so the surface is split the honest way. `describe`
resolves the takes you HAND IT (their window and loop, through the model's own
arithmetic) with every recording a song references and the bank's limits;
`plan` answers what a capture WOULD do (the input, the length, the name and where
it lands) without recording; and `capture` plus `sample.load` **refuse**, with the
reason, exactly as `export.audio` refuses on the way out. The two sound alike
because they are the same boundary told twice: a microphone and a live bank are a
browser's, not Node's.

**`arp.*` — the ARP page.** `describe` (the stored dials and their label, and — for
a pattern, a row and a channel — the run `generateArp` would produce over the chord
in that cell, as notes, so a caller can preview exactly what a write would commit)
and `generate` (write that run into the pattern as ordinary cells, one note per
step, and hand the changed song back). The dials are song data, so the edits that
change them are `arp.set` and `arp.clear` in `song.edit` above; `arp.generate`
optionally STORES the dials it used with `stored: true`.

**`export.*` — get it out.** `midi` (base64 bytes plus the export summary),
`stems` (the plan — which channel becomes which file), `plan` (the loop region
and the loudness target, as the statements that set them), `loudness` (the four
published targets), and `audio`.

**`api.*` — the API itself.** `describe`, `version`.

## As an MCP server

The same registry is an **MCP server**, for an AI client. It is the shortest path
from "write a song" to "check the song": the agent calls the parser this
repository already tests instead of re-implementing it.

There are two ways in, because clients want one or the other — and the same tools
come out of both:

```bash
# 1. the client dials a URL: you start the server first
npm run api:server
curl -s http://127.0.0.1:4590/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

```json
{ "mcpServers": { "tracklet": { "type": "http", "url": "http://127.0.0.1:4590/mcp" } } }
```

```bash
# 2. the client spawns a process and talks over stdin/stdout
npm run mcp
```

```json
{ "mcpServers": { "tracklet": { "command": "npm", "args": ["run", "mcp"] } } }
```

The stdio one is what most desktop clients want, and it is the same messages over
another pipe: nothing is remembered between calls, **stdout carries the protocol
and nothing else** (a log line would be a parse error the client cannot report, so
`--verbose` sends them to stderr), and answers come back in the order they were
asked. It is also the one Tracklet's own MCP page offers with a `COPY CMD` button.

`initialize`, `ping`, `tools/list` and `tools/call` are served, and everything
else is `-32601` — the protocol's own "I do not claim that". **A tool IS an
operation**: `script.apply` is the tool name, its `description` is the operation's
title and summary, and its `inputSchema` is the operation's own schema, so the
tool list cannot describe something the registry does not have. A client that
cannot spell a dot may send `script_apply`; both resolve.

Three things about it are deliberate:

- **A refused call is a TOOL error, not a protocol error**: the answer is
  `isError: true` with the refusal's sentence and its line-numbered diagnostics as
  text, so a model reads `line 7: unknown command` and tries again.
- **It is stateless.** No `Mcp-Session-Id` is ever issued, so any request can go to
  any process and a call needs no setup or teardown.
- **It cannot see the song in the editor.** The server is another process working
  on files; a person pastes the script it hands back into the app's SCRIPT box,
  which is why the app's MCP button lives in that box.

## Read wide, write narrow

`library.write` is the only operation in this API that changes anything on disk,
and it changes as little as it can:

- **One folder.** A new song goes into `storage/songs/agent/`, which is where this
  repository already keeps songs that are not the app's own examples. Not
  `scripts/` — every song under `scripts/` is a curated example, and
  `songs.test.ts` holds each one to fifty notes, two patterns and three channels.
  An agent's one-bar draft would fail those rules, and a feature that breaks the
  repository's own test suite is a feature nobody can leave switched on.
- **The extension picks the format**, and it has to be one the app opens
  (`.txt` or `.json`), so a written song can be opened rather than merely stored.
- **Nothing is replaced** unless the call passes `"overwrite": true`, and a path
  that leaves the folder — `../`, an absolute path, a symlink's worth of dots — is
  refused rather than resolved.
- **It reads back what it wrote** before returning. A file the app cannot open is a
  writer's bug, and finding that out at write time makes it a bug report instead of
  a mystery.

`library.update` is the same folder, one step on: a draft that has already been
saved can be changed by sending only the edits, so reviewing one with an agent is a
conversation rather than a re-upload. It reads the file, applies the edits in
memory, and writes it back — and because the edits go through the same atomic list
`song.edit` uses, **a call with one bad edit leaves the file byte-for-byte as it
was**. The format is picked by the extension, so a `.json` draft is rewritten as
`.json`, and a path outside the one folder is refused exactly as a write is.

Read wide, write narrow: the reader browses the whole repository, the writer has
one folder and one rule.

## What is deliberately not here

- **Audio rendering.** `export.audio` refuses, and the refusal names the reason:
  rendering uses the app's `OfflineAudioContext`, which does not exist in Node.
  Inventing a second renderer that does not sound like the app would be worse than
  saying so. Use the app to render a `.wav`; use `export.midi` for the notes.
- **A second model.** Nothing in this folder decides what a legal script, song or
  file is. `song.create` writes a header as a script and applies it through the
  parser; `song.from_json` calls the app's own file reader; the operation list is
  the only thing here that is new, and it is deliberately thin.
- **Authentication, TLS, and a second protocol.** The server is a local tool: it
  binds to loopback and trusts whoever can reach the socket, which is what an
  agent running on the same machine already is. Putting it on a network is a
  deliberate `--host`, and a deliberate decision about who may write songs.

## Adding an operation

One place to change: declare it in the right file under `src/ops/`, and the
registry, the facade, `api.describe`, the CLI, the HTTP server and (soon) the MCP
server all learn it at once — nothing is registered twice.

```ts
{
  name: 'song.count_notes',
  title: 'Count the notes',
  summary: 'How many notes a song plays, per channel.',
  category: 'song',
  example: {},
  input: schema({ song: field('object', 'The song to count.') }),
  run: (input) => ok(countSongNotes(songFromInput(input) ?? createSong())),
}
```

Three conventions worth keeping: refusals go through `refuse(...)` rather than
`return fail(...)` (so the envelope is built in one place); a song is accepted
with `songFromInput` (object or JSON, validated by the file reader); and the
summary is written for a model that cannot listen.
