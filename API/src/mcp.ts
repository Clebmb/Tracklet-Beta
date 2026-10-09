/**
 * mcp — the same registry, as an MCP server.
 *
 * MCP (the Model Context Protocol) is how an AI agent finds tools it can call.
 * Its whole vocabulary is "list your tools", "call this one with these
 * arguments", and an answer made of content — so a registry of DESCRIBED
 * operations with JSON arguments is not merely adaptable to it, it already is
 * it. That is why this file is short, and why it contains no music and no
 * description of an operation: `tools/list` is `OPERATIONS`, and `tools/call` is
 * `callOperation`. A tool cannot drift from the operation behind it because a tool
 * is not a thing that exists — it is a rendering of one.
 *
 * Three decisions:
 *
 *   • THE TOOL NAME IS THE OPERATION NAME — `script.apply`, dot and all. That
 *     keeps one vocabulary across TypeScript, the shell, JSON-RPC and MCP, so a
 *     model that read `api.describe` already knows what to call. A client that
 *     dislikes a dot in a name may send `script_apply` instead: both spellings
 *     resolve, so the convention costs nothing to be compatible with.
 *   • A REFUSED CALL IS A TOOL ERROR, NOT A PROTOCOL ERROR. `isError: true` with
 *     the refusal's own sentence and its line-numbered details as text. That is
 *     what MCP means by a tool that failed — the model should read "line 7: ..."
 *     and try again, not have its transport throw.
 *   • IT IS STATELESS. No `Mcp-Session-Id` is ever issued, so any request can go
 *     to any process and nothing has to be remembered between them. A tool call
 *     here has no setup and no teardown; a session would only be state that could
 *     disagree with the song.
 *
 * The transport is the spec's Streamable HTTP: one POST of JSON-RPC to `/mcp`,
 * answered with one JSON body. Notifications — `notifications/initialized` and
 * everything else without an `id` — are answered with `202 Accepted` and no body,
 * which is the protocol's way of saying "received, nothing to say back".
 */

import { callOperation } from './api';
import { API_MCP_PATH, API_NAME, API_VERSION, apiEndpoint } from './identity';
import { OPERATIONS } from './ops/index';
import { RPC_ERROR, rpcFailure, type JsonRpcId, type JsonRpcResponse, type RpcObserver } from './rpc';
import type { ApiOperation } from './operation';

/**
 * The protocol revision this server speaks, and the older ones it still answers.
 *
 * `initialize` echoes the client's version when this build knows it and otherwise
 * names its own, which is what the spec asks for: a client that cannot speak the
 * server's version is expected to disconnect on its own, and it can only do that
 * if it is told the truth rather than agreed with.
 */
export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SUPPORTED_VERSIONS: readonly string[] = ['2025-06-18', '2025-03-26', '2024-11-05'];

/** The name an MCP client sees in its tool list. */
export const MCP_SERVER_NAME = 'tracklet';

/**
 * What the server tells a model to do first.
 *
 * This is the one paragraph of prose in the protocol, and it is the difference
 * between a model that guesses at the language and one that reads the manifest.
 * It names the two calls that are not obvious from a schema — ask what this build
 * speaks, and check before applying — because those are the mistakes that cost a
 * song rather than a round trip.
 */
export const MCP_INSTRUCTIONS = [
  'Tracklet writes music as text. Call language.capabilities first: it reports the script version, the limits and every word this build speaks, so you write lines it accepts.',
  'script.validate parses a script and changes nothing; script.apply replaces the whole song and is all-or-nothing, so validate first and read the line-numbered diagnostics when it refuses.',
  'song.grid prints a pattern as text — the closest thing to seeing the screen. library.list reads the songs already on this machine, and export.midi writes the notes out as a .mid.',
  'machine.describe reads a song\'s drum machine — its pads, their rows, its bars, its order and its mix — and song.edit changes it one field at a time with machine.set, pad.set, pad.step and machine.clear; a `bar` on pad.set, pad.step and machine.clear reaches any of the machine\'s bars (bar 1 is the default), and machine.set takes `order`, the list saying which bar plays in each song bar, plus `pads` and `bars` — how many pads and bars the machine has (growing pads fills in kit pads and shrinking drops the last ones; growing bars copies the last bar and shrinking drops from the end).',
  'The MIXER is song data too, so song.edit can move every fader: track.set takes a channel\'s duck, the bus group it joins (an empty string leaves every group) and its ten effects; bus.set defines or moves a GROUP fader by name; and master.set puts effects on the whole mix. A bus must be defined with bus.set BEFORE a track.set joins it.',
  'The FORM is editable too: a section.set names a group of bars (and, with machine, which drum-machine bar that part plays) while arrange.set writes the song\'s order as a list of those names — define the sections first, then arrange them.',
  'The ARRANGER\'s automation lanes are song data: arranger.describe reads the song timeline — the bars of the order with their section names, one row per channel, and every lane grouped by channel and target with its value on each bar — and song.edit changes one with automation.set (track, target, from, to, startBar, endBar; an optional 1-based index moves an existing lane, and no index appends a new one) or drops one with automation.clear (an index, or every lane when none is given). workspace.describe lists the full screens this build has (tracker, machine, mixer, arranger, live, recorder, arp) with a one-line summary of each.',
  'The RECORDER page is where audio comes IN and goes OUT. The OUT half is song data: export.plan reads the render region and the loudness target. The IN half — a recorded take — is APP state, so recorder.describe resolves the takes you hand it (their trim and loop as data) and recorder.plan says what a capture would do; recorder.capture and sample.load REFUSE here, because a microphone and a live sample bank are a browser\'s, not Node\'s.',
  'The ARP page dials a run and commits it: arp.describe reads the stored dials and, for a pattern, row and channel, the run it would produce over the chord in that cell, while arp.generate writes that run into cells — the same notes `arp write` or `chord … arp` commits. The dials are song data too, so song.edit can set them one field at a time with arp.set (direction, octaves, rate, gate, mode; a direction or a mode it was never taught is refused by name, and the numbers are clamped) or clear them with arp.clear.',
  'Every call answers with {"ok":true,"result":...} or {"ok":false,"error":{"code","message","details"}}. Branch on the code, not on the message.',
].join(' ');

/** One MCP tool, as `tools/list` publishes it. */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

/** What one MCP message produced: an HTTP status and its body. */
export interface McpAnswer {
  /** 200 with a body, or 202 with none for a notification. */
  status: number;
  payload: unknown | null;
}

/**
 * The registry, as tools.
 *
 * `inputSchema` is the operation's own schema passed through untouched. It is a
 * subset of JSON Schema rather than the whole of it — object, properties,
 * required, an enum — which is exactly the part a client needs to build a form or
 * a model needs to write arguments, and the part this project can describe
 * without a schema library.
 */
export function mcpTools(): McpTool[] {
  return OPERATIONS.map((operation) => ({
    name: operation.name,
    description: `${operation.title}. ${operation.summary}`,
    inputSchema: operation.input,
  }));
}

/**
 * The operation behind a tool name, accepting either spelling.
 *
 * `song.to_json` and `song_to_json` both resolve, because the protocol's own
 * naming guidance dislikes a dot and this registry's names all have one. The two
 * spellings cannot collide: every operation name contains a dot, and the
 * underscore form of one is never the name of another.
 */
export function operationForTool(name: string): ApiOperation | undefined {
  const exact = OPERATIONS.find((operation) => operation.name === name);
  if (exact) return exact;
  return OPERATIONS.find((operation) => operation.name.replace(/\./g, '_') === name);
}

/** The client config that connects an MCP client to this server at `url`. */
export function mcpClientConfig(url: string, key: string): Record<string, unknown> {
  return { mcpServers: { [key]: { type: 'http', url } } };
}

/** A tool's answer: the result as readable JSON, and structured for a program. */
function toolContent(text: string, structured?: unknown): Record<string, unknown> {
  const content = [{ type: 'text', text }];
  return structured === undefined ? { content } : { content, structuredContent: structured };
}

/** The text of a refusal: the sentence, then one line per problem it names. */
function refusalText(message: string, details: string[] | undefined): string {
  return details && details.length > 0 ? `${message}\n\n${details.join('\n')}` : message;
}

/** Run one `tools/call`. Never a protocol failure: a bad tool is a tool error. */
async function callMcpTool(id: JsonRpcId, params: unknown, observe?: RpcObserver): Promise<JsonRpcResponse> {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return rpcFailure(id, RPC_ERROR.invalidParams, 'a "tools/call" needs an object of params with a "name".', {
      code: 'invalid_input',
    });
  }
  const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
  if (typeof name !== 'string' || name === '') {
    return rpcFailure(id, RPC_ERROR.invalidParams, 'a "tools/call" needs "name": which tool to run.', {
      code: 'invalid_input',
    });
  }
  const operation = operationForTool(name);
  if (!operation) {
    return rpcFailure(id, RPC_ERROR.methodNotFound, `there is no tool called "${name}".`, {
      code: 'not_found',
      operation: name,
      details: ['call tools/list for the tools this server has.'],
    });
  }

  let input: Record<string, unknown> = {};
  if (args !== undefined && args !== null) {
    if (typeof args !== 'object' || Array.isArray(args)) {
      return rpcFailure(id, RPC_ERROR.invalidParams, `"arguments" must be an object, not ${Array.isArray(args) ? 'an array' : typeof args}.`, {
        code: 'invalid_input',
        operation: name,
      });
    }
    input = args as Record<string, unknown>;
  }

  const started = Date.now();
  const result = await callOperation(operation.name, input);
  observe?.({ method: operation.name, ok: result.ok, ms: Date.now() - started, ...(result.ok ? {} : { code: result.error.code }) });

  if (result.ok) {
    return {
      jsonrpc: '2.0',
      id,
      result: toolContent(JSON.stringify(result.result, null, 2), result.result),
    };
  }
  // `isError: true` rather than a JSON-RPC error: the CALL worked, the tool said
  // no, and a model reading "line 7: unknown command" can act on that.
  return {
    jsonrpc: '2.0',
    id,
    result: { ...toolContent(refusalText(result.error.message, result.error.details)), isError: true },
  };
}

/**
 * Run one MCP message. Null means a notification, which needs no answer.
 *
 * Unlike the JSON-RPC transport, a message without an `id` is a normal and
 * expected event here — `notifications/initialized` is the second thing every
 * client says — so this returns null rather than treating it as odd.
 */
export async function handleMcpMessage(message: unknown, observe?: RpcObserver): Promise<JsonRpcResponse | null> {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return rpcFailure(null, RPC_ERROR.invalidRequest, 'a message must be a JSON object with "jsonrpc" and "method".');
  }
  const request = message as Record<string, unknown>;
  if (request.jsonrpc !== '2.0') {
    return rpcFailure(null, RPC_ERROR.invalidRequest, '"jsonrpc" must be exactly the string "2.0".');
  }
  if (typeof request.method !== 'string' || request.method === '') {
    return rpcFailure(null, RPC_ERROR.invalidRequest, '"method" is required and must be a non-empty string.');
  }

  const notification = !('id' in request) || request.id === undefined;
  const id: JsonRpcId = notification ? null : (request.id as JsonRpcId);
  const params = request.params;
  const method = request.method;

  // A notification is answered with silence whatever it is — including one this
  // server has never heard of, because there is no way to say so.
  if (notification) {
    if (method === 'tools/call') await callMcpTool(id, params, observe);
    return null;
  }

  if (method === 'initialize') {
    const asked = params && typeof params === 'object' ? (params as { protocolVersion?: unknown }).protocolVersion : undefined;
    const agreed = typeof asked === 'string' && MCP_SUPPORTED_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSION;
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: agreed,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: MCP_SERVER_NAME, version: API_VERSION, title: API_NAME },
        instructions: MCP_INSTRUCTIONS,
      },
    };
  }

  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: mcpTools() } };

  if (method === 'tools/call') return callMcpTool(id, params, observe);

  // Everything else is a capability this server does not claim. `-32601` is the
  // protocol's own answer, and the one a client is written to expect.
  return rpcFailure(id, RPC_ERROR.methodNotFound, `this server has no method "${method}".`, {
    details: ['it serves: initialize, ping, tools/list, tools/call.'],
  });
}

/** Run a parsed body: one message, or a batch. */
export async function handleMcpPayload(payload: unknown, observe?: RpcObserver): Promise<McpAnswer> {
  if (!Array.isArray(payload)) {
    const answer = await handleMcpMessage(payload, observe);
    return answer === null ? { status: 202, payload: null } : { status: 200, payload: answer };
  }
  if (payload.length === 0) {
    return { status: 200, payload: rpcFailure(null, RPC_ERROR.invalidRequest, 'an empty batch is not a valid request.') };
  }
  const answers = (await Promise.all(payload.map((message) => handleMcpMessage(message, observe)))).filter(
    (answer): answer is JsonRpcResponse => answer !== null,
  );
  return answers.length === 0 ? { status: 202, payload: null } : { status: 200, payload: answers };
}

/** Run a body that arrived as text, so a parse failure is a protocol answer. */
export async function handleMcpText(body: string, observe?: RpcObserver): Promise<McpAnswer> {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    return {
      status: 200,
      payload: rpcFailure(null, RPC_ERROR.parse, `the body was not valid JSON: ${error instanceof Error ? error.message : String(error)}`),
    };
  }
  return handleMcpPayload(payload, observe);
}

/** The endpoint an MCP client should be pointed at, for a banner or a config. */
export function mcpEndpoint(port: number): string {
  return apiEndpoint(API_MCP_PATH, port);
}
