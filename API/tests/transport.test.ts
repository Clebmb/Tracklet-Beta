/**
 * The transport, tested the way a client uses it.
 *
 * Two layers, two ways of testing them, because they fail differently:
 *
 *   • the JSON-RPC layer is tested by handing it a PARSED message and reading the
 *     answer, which is how a client with a JSON library reaches it;
 *   • the HTTP layer is tested over a REAL socket on port 0, because the thing
 *     under test is the status code, the header and the route, and none of those
 *     exist without a request.
 *
 * The assertions that matter most are the ones about the boundary: a refused call
 * is HTTP 200 (the conversation worked), an unknown method is −32601 while a
 * failed lookup is −32004 (the request was fine), and a notification gets no reply
 * at all.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { handleRpcMessage, handleRpcPayload, handleRpcText, RPC_ERROR } from '../src/rpc';
import { DEFAULT_PORT, resolveTrackletPort, startTrackletServer, type TrackletServerHandle } from '../src/server';
import type { JsonRpcFailure, JsonRpcResponse, RpcCallReport } from '../src/rpc';

/** One response, or a readable failure if the shape is not what we expected. */
function single(answer: JsonRpcResponse | JsonRpcResponse[] | null): JsonRpcResponse {
  if (answer === null) throw new Error('expected a response, got nothing (a notification?)');
  if (Array.isArray(answer)) throw new Error(`expected one response, got ${answer.length}`);
  return answer;
}

function failure(answer: JsonRpcResponse | JsonRpcResponse[] | null): JsonRpcFailure {
  const one = single(answer);
  if (!('error' in one)) throw new Error(`expected a failure, got a result: ${JSON.stringify(one.result)}`);
  return one;
}

function value(answer: JsonRpcResponse | JsonRpcResponse[] | null): unknown {
  const one = single(answer);
  if ('error' in one) throw new Error(`expected a result, got: ${JSON.stringify(one.error)}`);
  return one.result;
}

function call(method: string, params?: unknown, id: number | string | null = 1) {
  return handleRpcPayload({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
}

describe('the JSON-RPC envelope', () => {
  it('answers with the protocol shape, not the API envelope', async () => {
    const answer = single(await call('api.version', undefined, 7));
    expect(answer.jsonrpc).toBe('2.0');
    expect(answer.id).toBe(7);
    if ('error' in answer) throw new Error('api.version refused');
    expect(answer.result).toMatchObject({ name: 'tracklet-core-api' });
    // The `{ ok: true, result }` wrapper is the API's; the transport unwraps it,
    // which is the whole reason the two shapes do not leak into each other.
    expect(answer.result).not.toHaveProperty('ok');
  });

  it('carries the id through, including a string and zero', async () => {
    expect(single(await call('api.version', undefined, 'abc')).id).toBe('abc');
    expect(single(await call('api.version', undefined, 0)).id).toBe(0);
  });

  it('treats a message with no id as a notification and answers nothing', async () => {
    const answer = await handleRpcMessage({ jsonrpc: '2.0', method: 'api.version' });
    expect(answer).toBeNull();
  });

  it('drops the notifications out of a batch and keeps the order', async () => {
    const answer = await handleRpcPayload([
      { jsonrpc: '2.0', id: 'a', method: 'api.version' },
      { jsonrpc: '2.0', method: 'api.version' },
      { jsonrpc: '2.0', id: 'b', method: 'no.such.method' },
    ]);
    expect(Array.isArray(answer)).toBe(true);
    const batch = answer as JsonRpcResponse[];
    expect(batch.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(batch[1]).toHaveProperty('error');
  });

  it('answers a batch of only notifications with nothing at all', async () => {
    const answer = await handleRpcPayload([{ jsonrpc: '2.0', method: 'api.version' }]);
    expect(answer).toBeNull();
  });

  it('refuses an empty batch', async () => {
    const refused = failure(await handleRpcPayload([]));
    expect(refused.error.code).toBe(RPC_ERROR.invalidRequest);
    expect(refused.id).toBeNull();
  });

  it('refuses a body that is not a request at all', async () => {
    for (const payload of [42, 'hello', null, true]) {
      const refused = failure(await handleRpcPayload(payload));
      expect(refused.error.code).toBe(RPC_ERROR.invalidRequest);
      expect(refused.id).toBeNull();
    }
  });

  it('answers one refusal per entry when a batch holds no requests', async () => {
    const answer = (await handleRpcPayload([1, 2])) as JsonRpcResponse[];
    expect(answer).toHaveLength(2);
    for (const entry of answer) {
      expect(entry).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: RPC_ERROR.invalidRequest } });
    }
  });

  it('refuses the wrong protocol version and a missing method', async () => {
    expect(failure(await handleRpcPayload({ jsonrpc: '1.0', id: 1, method: 'api.version' })).error.code).toBe(
      RPC_ERROR.invalidRequest,
    );
    expect(failure(await handleRpcPayload({ jsonrpc: '2.0', id: 1 })).error.code).toBe(RPC_ERROR.invalidRequest);
    expect(failure(await handleRpcPayload({ jsonrpc: '2.0', id: 1, method: '' })).error.code).toBe(RPC_ERROR.invalidRequest);
  });

  it('refuses a bad id, since a client that cannot be answered is a mistake', async () => {
    const refused = failure(await handleRpcPayload({ jsonrpc: '2.0', id: { nested: true }, method: 'api.version' }));
    expect(refused.error.code).toBe(RPC_ERROR.invalidRequest);
    expect(refused.id).toBeNull();
  });

  it('treats omitted params as no arguments', async () => {
    const answer = value(await call('api.version'));
    expect(answer).toMatchObject({ name: 'tracklet-core-api' });
    const fromNull = value(await call('api.version', null));
    expect(fromNull).toMatchObject({ name: 'tracklet-core-api' });
  });

  it('refuses positional params by name, because the arguments are named', async () => {
    const refused = failure(await call('language.search', ['bass']));
    expect(refused.error.code).toBe(RPC_ERROR.invalidParams);
    expect(refused.error.message).toContain('object of named arguments');
    expect(refused.error.data?.code).toBe('invalid_input');
  });

  it('reports a parse failure as −32700 with a null id', async () => {
    const refused = failure(await handleRpcText('{ this is not json'));
    expect(refused.error.code).toBe(RPC_ERROR.parse);
    expect(refused.id).toBeNull();
  });
});

describe('a method is an operation', () => {
  it('answers an unknown method with −32601 and near misses', async () => {
    const refused = failure(await call('api.vers'));
    expect(refused.error.code).toBe(RPC_ERROR.methodNotFound);
    expect(refused.error.data?.operation).toBe('api.vers');
    expect(refused.error.data?.suggestions).toContain('api.version');
    expect(refused.error.message).toContain('api.vers');
  });

  it('has no suggestions to offer for a name from nowhere', async () => {
    const refused = failure(await call('zzz.zzz'));
    expect(refused.error.code).toBe(RPC_ERROR.methodNotFound);
    expect(refused.error.data?.suggestions).toBeUndefined();
    expect(refused.error.data?.details?.join(' ')).toContain('api.describe');
  });

  it('reaches every operation in the registry, api.describe among them', async () => {
    const described = value(await call('api.describe')) as { operations: { name: string; input: { type: string } }[] };
    expect(described.operations.length).toBeGreaterThanOrEqual(30);
    for (const operation of described.operations) {
      expect(operation.input.type).toBe('object');
      // Every one of them is a method with no translation step in between.
      const answer = await call(operation.name);
      expect(single(answer).jsonrpc).toBe('2.0');
    }
  });
});

describe("the API's codes, as numbers", () => {
  it('maps invalid_input to −32602 and keeps the API code in data', async () => {
    const refused = failure(await call('song.create', { key: 'H major' }));
    expect(refused.error.code).toBe(RPC_ERROR.invalidParams);
    expect(refused.error.data?.code).toBe('invalid_input');
    expect(refused.error.message.length).toBeGreaterThan(10);
  });

  it('maps a refused script to −32001, with the diagnostics intact', async () => {
    const refused = failure(await call('script.apply', { script: 'new\nsong "X"\nnonsense here\n' }));
    expect(refused.error.code).toBe(RPC_ERROR.scriptRefused);
    expect(refused.error.data?.code).toBe('script_refused');
    expect(refused.error.data?.details?.some((line) => /line \d+/.test(line))).toBe(true);
  });

  it('maps a failed lookup to −32004, which is not the same as an unknown method', async () => {
    const refused = failure(await call('language.starter', { id: 'not-a-genre' }));
    expect(refused.error.code).toBe(RPC_ERROR.notFound);
    expect(refused.error.data?.code).toBe('not_found');
    expect(refused.error.code).not.toBe(RPC_ERROR.methodNotFound);
  });

  it('maps a build that cannot do it to −32003, and says why', async () => {
    const refused = failure(await call('export.audio', {}));
    expect(refused.error.code).toBe(RPC_ERROR.unsupported);
    expect(refused.error.data?.code).toBe('unsupported');
    expect(refused.error.message).toContain('OfflineAudioContext');
  });
});

describe('the port', () => {
  const original = process.env['TRACKLET_API_PORT'];

  afterEach(() => {
    if (original === undefined) delete process.env['TRACKLET_API_PORT'];
    else process.env['TRACKLET_API_PORT'] = original;
  });

  it('prefers what was asked for, then the environment, then the default', () => {
    delete process.env['TRACKLET_API_PORT'];
    expect(resolveTrackletPort()).toBe(DEFAULT_PORT);
    expect(resolveTrackletPort(0)).toBe(0);
    process.env['TRACKLET_API_PORT'] = '4711';
    expect(resolveTrackletPort()).toBe(4711);
    expect(resolveTrackletPort(1234)).toBe(1234);
  });

  it('does not mistake an unset variable for port zero', () => {
    // `Number('')` is 0 and 0 means "any free port", so this is the bug the check
    // exists for: it would have started the server somewhere unpredictable.
    delete process.env['TRACKLET_API_PORT'];
    expect(resolveTrackletPort()).not.toBe(0);
    process.env['TRACKLET_API_PORT'] = '';
    expect(resolveTrackletPort()).toBe(DEFAULT_PORT);
  });

  it('falls back on a variable that is not a port', () => {
    for (const nonsense of ['fast', '-1', '70000', '12.5']) {
      process.env['TRACKLET_API_PORT'] = nonsense;
      expect(resolveTrackletPort()).toBe(DEFAULT_PORT);
    }
  });
});

describe('over HTTP', () => {
  let handle: TrackletServerHandle;
  let logged: string[] = [];

  beforeAll(async () => {
    handle = await startTrackletServer({ port: 0, log: (line) => logged.push(line) });
  });

  afterAll(async () => {
    await handle.close();
  });

  const post = (body: string, init: RequestInit = {}) =>
    fetch(`${handle.url}/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      ...init,
    });

  it('binds loopback by default, and reports the port it got', () => {
    expect(handle.host).toBe('127.0.0.1');
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}`);
  });

  it('answers GET /health', async () => {
    const response = await fetch(`${handle.url}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const health = (await response.json()) as { ok: boolean; name: string; operations: number };
    expect(health.ok).toBe(true);
    expect(health.name).toBe('tracklet-core-api');
    expect(health.operations).toBeGreaterThanOrEqual(30);
  });

  it('answers GET / with the routes and the method names', async () => {
    const landing = (await (await fetch(`${handle.url}/`)).json()) as {
      transport: string;
      endpoints: Record<string, string>;
      methods: string[];
    };
    expect(landing.transport).toBe('json-rpc 2.0');
    expect(landing.endpoints.rpc).toBe('POST /rpc');
    expect(landing.methods).toContain('script.apply');
  });

  it('answers GET /operations with the same thing api.describe does', async () => {
    const listed = (await (await fetch(`${handle.url}/operations`)).json()) as { operations: { name: string }[] };
    expect(listed.operations.map((entry) => entry.name)).toContain('export.midi');
  });

  it('runs a call posted to /rpc, and to / as well', async () => {
    const response = await post('{"jsonrpc":"2.0","id":1,"method":"api.version"}');
    expect(response.status).toBe(200);
    const answer = (await response.json()) as { id: number; result: { scriptVersion: number } };
    expect(answer.id).toBe(1);
    expect(answer.result.scriptVersion).toBeGreaterThanOrEqual(21);

    const atRoot = await fetch(`${handle.url}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"jsonrpc":"2.0","id":2,"method":"api.version"}',
    });
    expect(atRoot.status).toBe(200);
  });

  it('answers a refused call with HTTP 200, because the conversation worked', async () => {
    const response = await post('{"jsonrpc":"2.0","id":3,"method":"library.read","params":{"path":"../../../etc/passwd"}}');
    expect(response.status).toBe(200);
    const answer = (await response.json()) as JsonRpcFailure;
    expect(answer.error.code).toBe(RPC_ERROR.invalidParams);
    expect(answer.error.data?.code).toBe('invalid_input');
  });

  it('answers a malformed body with a parse error, still 200', async () => {
    const response = await post('{ nope');
    expect(response.status).toBe(200);
    const answer = (await response.json()) as JsonRpcFailure;
    expect(answer.error.code).toBe(RPC_ERROR.parse);
    expect(answer.id).toBeNull();
  });

  it('answers a notification with 204 and no body', async () => {
    const response = await post('{"jsonrpc":"2.0","method":"api.version"}');
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('refuses a body that is not JSON at the door', async () => {
    const response = await post('id=1&method=api.version', { headers: { 'content-type': 'text/plain' } });
    expect(response.status).toBe(415);
    const refused = (await response.json()) as { error: { code: string } };
    expect(refused.error.code).toBe('unsupported_media_type');
  });

  it('404s an unknown route, 405s a wrong method, and says what is allowed', async () => {
    const missing = await fetch(`${handle.url}/songs`);
    expect(missing.status).toBe(404);
    expect((await missing.json()) as object).toHaveProperty('error');

    const wrongVerb = await fetch(`${handle.url}/rpc`);
    expect(wrongVerb.status).toBe(405);
    expect(wrongVerb.headers.get('allow')).toBe('POST');

    const deleted = await fetch(`${handle.url}/health`, { method: 'DELETE' });
    expect(deleted.status).toBe(405);
    expect(deleted.headers.get('allow')).toContain('GET');
  });

  it('accepts a HEAD, since Node drops the body for one', async () => {
    const response = await fetch(`${handle.url}/health`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('logs one line per call, without logging the arguments', async () => {
    logged = [];
    await post('{"jsonrpc":"2.0","id":9,"method":"song.create","params":{"key":"H major"}}');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('song.create');
    expect(logged[0]).toContain('invalid_input');
    expect(logged[0]).not.toContain('H major');
  });

  it('refuses a body over the limit instead of buffering it', async () => {
    const small = await startTrackletServer({ port: 0, maxBytes: 200 });
    try {
      const response = await fetch(`${small.url}/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'script.apply', params: { script: 'x'.repeat(4000) } }),
      });
      expect(response.status).toBe(413);
      const refused = (await response.json()) as { error: { code: string; maxBytes: number } };
      expect(refused.error.code).toBe('payload_too_large');
      expect(refused.error.maxBytes).toBe(200);
    } finally {
      await small.close();
    }
  });

  it('hands back the port when it stops, so the next one can have it', async () => {
    const first = await startTrackletServer({ port: 0 });
    const port = first.port;
    await first.close();
    const second = await startTrackletServer({ port });
    try {
      expect(second.port).toBe(port);
    } finally {
      await second.close();
    }
  });

  it('tells a second server that the port is taken, rather than pretending', async () => {
    await expect(startTrackletServer({ port: handle.port })).rejects.toThrow();
  });
});

describe('the observer', () => {
  it('sees every call it carried, with the code when it was refused', async () => {
    const seen: RpcCallReport[] = [];
    await handleRpcPayload(
      [
        { jsonrpc: '2.0', id: 1, method: 'api.version' },
        { jsonrpc: '2.0', id: 2, method: 'song.create', params: { key: 'H major' } },
      ],
      (report) => seen.push(report),
    );
    // Reported as each call finishes, so a batch's reports are not in send order —
    // which is honest, since that is the order the answers come back in.
    const byMethod = new Map(seen.map((report) => [report.method, report]));
    expect([...byMethod.keys()].sort()).toEqual(['api.version', 'song.create']);
    expect(byMethod.get('api.version')?.ok).toBe(true);
    expect(byMethod.get('api.version')?.code).toBeUndefined();
    expect(byMethod.get('song.create')?.ok).toBe(false);
    expect(byMethod.get('song.create')?.code).toBe('invalid_input');
    for (const report of seen) expect(report.ms).toBeGreaterThanOrEqual(0);
  });
});
