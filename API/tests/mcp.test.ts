/**
 * The MCP server, tested the way a client talks to it.
 *
 * The interesting assertions are the ones about SHAPE, because MCP is a contract
 * with somebody else's client: a tool has to have a name, a description and an
 * input schema; a call has to answer with content even when it failed; an
 * `initialize` has to answer with a version, capabilities and instructions; and a
 * notification has to be answered with 202 and nothing else. A handshake that is
 * merely *close* is a client that refuses to connect, so these check the envelope
 * rather than the music — the music is `api.test.ts`'s job.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleMcpMessage, handleMcpPayload, handleMcpText, MCP_PROTOCOL_VERSION, mcpTools, operationForTool } from '../src/mcp';
import { DEFAULT_PORT, startTrackletServer, type TrackletServerHandle } from '../src/server';
import { API_DEFAULT_PORT, API_HEALTH_PATH, API_MCP_CLIENT_KEY, API_MCP_PATH } from '../src/identity';
import { OPERATIONS } from '../src/ops/index';
import type { JsonRpcFailure, JsonRpcResponse } from '../src/rpc';

function single(answer: JsonRpcResponse | null): JsonRpcResponse {
  if (answer === null) throw new Error('expected a response, got nothing (a notification?)');
  return answer;
}

function resultOf(answer: JsonRpcResponse | null): Record<string, unknown> {
  const one = single(answer);
  if ('error' in one) throw new Error(`expected a result, got: ${JSON.stringify(one.error)}`);
  return one.result as Record<string, unknown>;
}

function failureOf(answer: JsonRpcResponse | null): JsonRpcFailure {
  const one = single(answer);
  if (!('error' in one)) throw new Error(`expected a failure, got a result`);
  return one;
}

function call(method: string, params?: unknown, id: number | string = 1) {
  return handleMcpMessage({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
}

/** The `initialize` a real client sends before anything else. */
function initialize(id = 1) {
  return call('initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  }, id);
}

describe('the tool list', () => {
  it('publishes one tool per operation, named the same thing', () => {
    const tools = mcpTools();
    expect(tools.map((tool) => tool.name)).toEqual(OPERATIONS.map((operation) => operation.name));
  });

  it('gives every tool a description and an object input schema', () => {
    let withArguments = 0;
    for (const tool of mcpTools()) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
      const properties = (tool.inputSchema as { properties: Record<string, unknown> }).properties;
      expect(typeof properties).toBe('object');
      // Several operations genuinely take nothing (`api.version`, the manifests),
      // and an empty `properties` is the honest schema for them rather than a
      // missing one — a client can tell "no arguments" from "an unknown shape".
      if (Object.keys(properties).length > 0) withArguments += 1;
    }
    expect(withArguments).toBeGreaterThan(15);
  });

  it('resolves a tool name in either spelling, so a client that dislikes the dot still works', () => {
    expect(operationForTool('song.to_json')?.name).toBe('song.to_json');
    expect(operationForTool('song_to_json')?.name).toBe('song.to_json');
    expect(operationForTool('script_apply')?.name).toBe('script.apply');
    expect(operationForTool('script.nothing')).toBeUndefined();
  });

  it('is the same list as api.describe, so the two cannot disagree', async () => {
    const described = resultOf(await call('tools/call', { name: 'api.describe', arguments: {} })) as {
      structuredContent: { operations: { name: string }[] };
    };
    expect(described.structuredContent.operations.map((entry) => entry.name)).toEqual(mcpTools().map((tool) => tool.name));
  });
});

describe('the handshake', () => {
  it('answers initialize with a version, a capability and instructions', async () => {
    const result = resultOf(await initialize());
    expect(result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(result.serverInfo).toMatchObject({ name: 'tracklet' });
    expect(String(result.instructions)).toContain('language.capabilities');
  });

  it('agrees to an older version it knows, and names its own when it does not', async () => {
    const older = resultOf(await call('initialize', { protocolVersion: '2024-11-05' }));
    expect(older.protocolVersion).toBe('2024-11-05');
    const stranger = resultOf(await call('initialize', { protocolVersion: '2099-01-01' }));
    expect(stranger.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
  });

  it('answers a notification with 202 and no body', async () => {
    const answer = await handleMcpPayload({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(answer.status).toBe(202);
    expect(answer.payload).toBeNull();
    // Even one it has never heard of: there is no way to say so.
    const unknown = await handleMcpPayload({ jsonrpc: '2.0', method: 'notifications/whatever' });
    expect(unknown.status).toBe(202);
    expect(unknown.payload).toBeNull();
  });

  it('answers ping with an empty result', async () => {
    expect(resultOf(await call('ping'))).toEqual({});
  });

  it('refuses a capability it does not claim with −32601', async () => {
    for (const method of ['resources/list', 'prompts/list', 'completion/complete']) {
      const refused = failureOf(await call(method));
      expect(refused.error.code).toBe(-32601);
    }
  });

  it('refuses a body that is not JSON, and one that is not a request', async () => {
    const answers = await handleMcpText('{ nope');
    expect((answers.payload as JsonRpcFailure).error.code).toBe(-32700);
    const notARequest = await handleMcpPayload('hello');
    expect((notARequest.payload as JsonRpcFailure).error.code).toBe(-32600);
  });
});

describe('calling a tool', () => {
  it('runs a read-only operation and returns its result as text and as structure', async () => {
    const result = resultOf(await call('tools/call', { name: 'language.limits', arguments: {} }));
    const content = result.content as { type: string; text: string }[];
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe('text');
    const parsed = JSON.parse(content[0]?.text ?? '') as { tracks: { max: number } };
    expect(parsed.tracks.max).toBeGreaterThan(0);
    expect(result.structuredContent).toEqual(parsed);
    expect(result.isError).toBeUndefined();
  });

  it('answers a refused call with isError and the diagnostics, not a protocol error', async () => {
    const result = resultOf(await call('tools/call', { name: 'script.apply', arguments: { script: 'new\nnonsense here\n' } }));
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0]?.text ?? '';
    expect(text).toContain('refused');
    expect(text).toMatch(/line \d+:/);
  });

  it('answers a tool that does not exist with a method-not-found', async () => {
    const refused = failureOf(await call('tools/call', { name: 'song.explode', arguments: {} }));
    expect(refused.error.code).toBe(-32601);
    expect(refused.error.message).toContain('song.explode');
  });

  it('refuses a call with no name, or with positional arguments', async () => {
    expect(failureOf(await call('tools/call', {})).error.code).toBe(-32602);
    expect(failureOf(await call('tools/call', { name: 'language.limits', arguments: [] })).error.code).toBe(-32602);
    expect(failureOf(await call('tools/call', 'language.limits')).error.code).toBe(-32602);
  });

  it('treats missing arguments as none, and accepts the underscore spelling', async () => {
    const result = resultOf(await call('tools/call', { name: 'script_validate', arguments: { script: 'new' } }));
    expect(result.isError).toBeUndefined();
    expect((result.structuredContent as { valid: boolean }).valid).toBe(true);
  });

  it('carries a batch: notifications dropped, answers kept in order', async () => {
    const answer = await handleMcpPayload([
      { jsonrpc: '2.0', id: 'a', method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 'b', method: 'tools/list' },
    ]);
    expect(answer.status).toBe(200);
    const batch = answer.payload as JsonRpcResponse[];
    expect(batch.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});

describe('over HTTP', () => {
  let handle: TrackletServerHandle;

  beforeAll(async () => {
    handle = await startTrackletServer({ port: 0 });
  });

  afterAll(async () => {
    await handle.close();
  });

  const post = (body: string) =>
    fetch(`${handle.url}${API_MCP_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body,
    });

  it('serves /mcp and reports its own endpoint in health', async () => {
    const health = (await (await fetch(`${handle.url}${API_HEALTH_PATH}`)).json()) as {
      mcp: { endpoint: string; protocolVersion: string; tools: number };
    };
    expect(health.mcp.endpoint).toBe(`${handle.url}${API_MCP_PATH}`);
    expect(health.mcp.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(health.mcp.tools).toBe(OPERATIONS.length);
  });

  it('advertises the MCP endpoint on the landing page too', async () => {
    const landing = (await (await fetch(`${handle.url}/`)).json()) as { mcp: { endpoint: string }; endpoints: Record<string, string> };
    expect(landing.endpoints.mcp).toBe('POST /mcp');
    expect(landing.mcp.endpoint).toBe(`${handle.url}${API_MCP_PATH}`);
  });

  it('completes a whole handshake and a tool call over one connection', async () => {
    const initialized = (await (await post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }))).json()) as {
      result: { protocolVersion: string };
    };
    expect(initialized.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);

    const notified = await post(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    expect(notified.status).toBe(202);
    expect(await notified.text()).toBe('');

    const listed = (await (await post(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }))).json()) as {
      result: { tools: { name: string }[] };
    };
    expect(listed.result.tools.length).toBe(OPERATIONS.length);

    const called = (await (
      await post(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'song.describe', arguments: {} } }))
    ).json()) as { result: { content: { text: string }[] } };
    expect(called.result.content[0]?.text).toContain('title');
  });

  it('never issues a session, so a call needs no state', async () => {
    const response = await post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
    expect(response.headers.get('mcp-session-id')).toBeNull();
  });

  it('says 405 to a GET, which would be a stream it does not offer', async () => {
    const response = await fetch(`${handle.url}${API_MCP_PATH}`);
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('lets a page on this machine READ the health, and gives a stranger nothing', async () => {
    const allowed = await fetch(`${handle.url}${API_HEALTH_PATH}`, { headers: { origin: 'http://localhost:5200' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5200');

    const elsewhere = await fetch(`${handle.url}${API_HEALTH_PATH}`, { headers: { origin: 'https://example.com' } });
    expect(elsewhere.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('never lets a page WRITE: the call routes carry no CORS header at all', async () => {
    const response = await fetch(`${handle.url}${API_MCP_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5200' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('the shared identity', () => {
  it('is the port the server binds, so the panel cannot teach the wrong command', () => {
    expect(API_DEFAULT_PORT).toBe(DEFAULT_PORT);
  });

  it('names the config key an MCP client stores this server under', () => {
    expect(API_MCP_CLIENT_KEY).toBe('tracklet');
  });
});
