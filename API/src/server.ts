/**
 * server — the Core API behind a socket.
 *
 * `rpc.ts` turns an operation into one JSON-RPC call. This file puts that on
 * HTTP, which is the smallest thing that lets a program that is NOT this one use
 * Tracklet: a model harness with a fetch tool, an editor plugin, a shell script
 * with `curl`, the MCP server's own tests.
 *
 *   POST /rpc          a JSON-RPC 2.0 call, or a batch of them
 *   POST /mcp          the same registry as an MCP server (see `mcp.ts`)
 *   GET  /health       liveness, identity, how long it has been up
 *   GET  /operations   every method, with its input schema and an example
 *   GET  /             the same summary a bare request deserves
 *
 * Node's built-in `http`, no dependencies, for the same reason the model layer
 * has none: a transport this thin has nothing to gain from a framework, and the
 * only thing in this project's `package.json` is Phaser.
 *
 * Five decisions, each of which is a promise:
 *
 *   • IT BINDS TO LOOPBACK unless told otherwise. Starting it is not publishing
 *     it: the default is `127.0.0.1`, and reaching it from another machine is a
 *     deliberate `--host`.
 *   • A JSON-RPC ANSWER IS ALWAYS HTTP 200. A refused call is a successful
 *     conversation — the protocol says so — so the mistake is described in the
 *     body and the status stays out of it. Only a failure of the TRANSPORT (a
 *     body too large, a route that does not exist, a method that does not apply)
 *     gets a plain JSON error and a status of its own.
 *   • REQUESTS ARE BOUNDED. A body over `maxBytes` is refused instead of
 *     buffered; this server holds a song library in memory, not a hostage.
 *   • A PAGE ON THIS MACHINE MAY READ, NEVER WRITE. The two GET routes that
 *     describe the server answer with an `Access-Control-Allow-Origin` when the
 *     request comes from a loopback origin — which is what lets the app's own MCP
 *     panel ask "are you running?". `POST` gets no such header, so a random web
 *     page can still send a request but can never read the answer, and cannot use
 *     this API as an oracle for the songs on your disk. Reads open, writes shut.
 *   • NO AUTHENTICATION. Whoever can reach the socket is trusted, which is what
 *     a process on this machine already is. `--host 0.0.0.0` is therefore a
 *     decision about who may write your songs, not a convenience.
 */

import { createServer, type IncomingMessage, type RequestListener, type Server, type ServerResponse } from 'node:http';

import { callLogLine, callLogWidth, handleRpcText, type RpcObserver } from './rpc';
import { handleMcpText, MCP_PROTOCOL_VERSION, mcpEndpoint } from './mcp';
import { callOperation } from './api';
import {
  API_DEFAULT_PORT,
  API_HEALTH_PATH,
  API_HOST,
  API_MCP_PATH,
  API_NAME,
  API_OPERATIONS_PATH,
  API_PORT_ENV,
  API_PROTOCOL,
  API_RPC_PATH,
  API_VERSION,
} from './identity';
import { OPERATIONS, operationNames } from './ops/index';

/** Where it listens unless told otherwise: this machine, not the network. */
export const DEFAULT_HOST = API_HOST;

/**
 * The port it takes unless told otherwise.
 *
 * 5200 is the app's dev server, so this deliberately is not that; 4590 is not
 * claimed by anything in this project and is easy to say out loud. Override with
 * `--port`, `port: 0` (a free one, printed on startup), or `TRACKLET_API_PORT`.
 *
 * The number itself lives in `identity.ts`, because the app's MCP panel prints it
 * as the port to start the server on: one declaration is the only way those two
 * cannot disagree.
 */
export const DEFAULT_PORT = API_DEFAULT_PORT;

/** How much body to accept. A song .json is kilobytes; a mistake is not. */
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export interface TrackletServerOptions {
  /** The port to bind. 0 asks the OS for a free one. */
  port?: number;
  /** The interface to bind. Defaults to loopback. */
  host?: string;
  /** The largest request body to accept, in bytes. */
  maxBytes?: number;
  /** One line per call, for a terminal. Omit for a silent server. */
  log?: (line: string) => void;
}

/** A running server, with the port it actually got. */
export interface TrackletServerHandle {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  /** `http://host:port` — what to paste into curl. */
  readonly url: string;
  /** Stop listening and let the in-flight requests finish. */
  close(): Promise<void>;
}

const startedAt = Date.now();

/** A trailing slash is not a different route, except at the root. */
function routeOf(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

/**
 * The origin a request came from, if it is a page served from THIS machine.
 *
 * Only `localhost`, `127.0.0.1` and `::1` — any port, because a dev server picks
 * its own — which is what makes it safe to answer: the page is already running on
 * the machine that owns these songs. Anything else returns null and gets no CORS
 * header at all, so the browser refuses to hand it the response.
 */
function loopbackOrigin(request: IncomingMessage): string | null {
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || origin === '') return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const bare = url.hostname.replace(/^\[|\]$/g, '');
    return bare === 'localhost' || bare === '127.0.0.1' || bare === '::1' ? origin : null;
  } catch {
    return null;
  }
}

/** A problem with the TRANSPORT, not with the call. Never a JSON-RPC envelope. */
function sendTransportError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): void {
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  sendJson(response, status, { error: { status, code, message, ...extra } });
}

/**
 * 405: the route exists, the verb does not.
 *
 * The allowed verbs go in BOTH places on purpose — the `Allow` header, which is
 * where HTTP keeps them and what a client actually reads, and the body, so that a
 * person looking at the JSON with curl is told as well.
 */
function sendMethodNotAllowed(response: ServerResponse, message: string, allow: string): void {
  sendTransportError(response, 405, 'method_not_allowed', message, { allow }, { allow });
}

/** Read a request body, refusing the moment it is over the limit. */
function readBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new PayloadTooLarge(size));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

/** Internal: the one reason `readBody` rejects that is not the client hanging up. */
class PayloadTooLarge extends Error {
  constructor(readonly size: number) {
    super(`the body was over the limit`);
    this.name = 'PayloadTooLarge';
  }
}

/**
 * What a bare `GET /` answers: enough to use the server without reading a README.
 *
 * The method NAMES are in here on purpose — a tool that can only GET should still
 * be able to learn the surface, and `api.describe` (available at
 * `GET /operations`, or as a call) adds the schemas.
 */
export function describeTrackletServer(port: number = DEFAULT_PORT): Record<string, unknown> {
  return {
    name: API_NAME,
    apiVersion: API_VERSION,
    transport: API_PROTOCOL,
    endpoints: {
      rpc: `POST ${API_RPC_PATH}`,
      mcp: `POST ${API_MCP_PATH}`,
      operations: `GET ${API_OPERATIONS_PATH}`,
      health: `GET ${API_HEALTH_PATH}`,
    },
    operationCount: OPERATIONS.length,
    methods: operationNames(),
    mcp: { endpoint: mcpEndpoint(port), protocolVersion: MCP_PROTOCOL_VERSION, tools: OPERATIONS.length },
    call: { jsonrpc: '2.0', id: 1, method: 'api.describe', params: {} },
    hint: 'one method per operation; api.describe lists them all with their input schemas.',
  };
}

/**
 * The health payload. Cheap enough to poll, honest enough to trust.
 *
 * The MCP block is here rather than only in the landing page because this is the
 * route the app's own panel reads: a panel that had to fetch two routes to learn
 * whether an agent can connect would be answering the question twice.
 */
export function trackletServerHealth(port: number = DEFAULT_PORT): Record<string, unknown> {
  return {
    ok: true,
    name: API_NAME,
    apiVersion: API_VERSION,
    operations: OPERATIONS.length,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    mcp: { endpoint: mcpEndpoint(port), protocolVersion: MCP_PROTOCOL_VERSION, tools: OPERATIONS.length },
  };
}

/**
 * The request handler, on its own.
 *
 * Separated from `startTrackletServer` so it can be mounted inside a server this
 * project does not own — a dev helper with its own routes, or a test that wants
 * to drive the routes without a port.
 */
export function createTrackletHandler(
  options: TrackletServerOptions = {},
  /**
   * Where it is actually listening, read on every request.
   *
   * A function rather than a number because it is not known when the handler is
   * built: `port: 0` asks the OS for a free one, and the answer only exists after
   * `listen`. A handler holding the number it requested would advertise endpoint
   * URLs — the MCP one especially — at a port nobody is on.
   */
  boundPort: () => number = () => resolveTrackletPort(options.port),
): RequestListener {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const width = callLogWidth();
  const observe: RpcObserver | undefined = options.log
    ? (report) => options.log!(callLogLine(report, width))
    : undefined;

  return (request, response) => {
    void (async () => {
      const method = request.method ?? 'GET';
      const path = routeOf(new URL(request.url ?? '/', 'http://localhost').pathname);
      const known = path === '/' || path === API_RPC_PATH || path === API_MCP_PATH || path === API_HEALTH_PATH || path === API_OPERATIONS_PATH;

      if (!known) {
        sendTransportError(response, 404, 'no_route', `there is nothing at "${path}".`, {
          routes: [`GET /`, `GET ${API_HEALTH_PATH}`, `GET ${API_OPERATIONS_PATH}`, `POST ${API_RPC_PATH}`, `POST ${API_MCP_PATH}`],
        });
        return;
      }

      if (method === 'GET' || method === 'HEAD') {
        // Reads may be read by a page served from this machine (see the header
        // comment): without this the app's own MCP panel could not ask whether the
        // server is up. Writes never get it — this is inside the GET branch only.
        const origin = loopbackOrigin(request);
        if (origin !== null) {
          response.setHeader('access-control-allow-origin', origin);
          response.setHeader('vary', 'Origin');
        }
        if (path === API_HEALTH_PATH) {
          sendJson(response, 200, trackletServerHealth(boundPort()));
          return;
        }
        if (path === API_OPERATIONS_PATH) {
          const described = await callOperation('api.describe', {});
          sendJson(response, described.ok ? 200 : 500, described.ok ? described.result : described.error);
          return;
        }
        if (path === '/') {
          sendJson(response, 200, describeTrackletServer(boundPort()));
          return;
        }
        sendMethodNotAllowed(response, `"GET ${path}" does not exist; a call is a POST.`, 'POST');
        return;
      }

      if (method !== 'POST') {
        sendMethodNotAllowed(response, `${method} is not supported here; use GET or POST.`, 'GET, HEAD, POST');
        return;
      }

      if (path !== '/' && path !== API_RPC_PATH && path !== API_MCP_PATH) {
        sendMethodNotAllowed(response, `"POST ${path}" does not exist; post the call to ${API_RPC_PATH}.`, 'GET, HEAD');
        return;
      }

      const contentType = request.headers['content-type'];
      if (contentType && !contentType.includes('json')) {
        sendTransportError(response, 415, 'unsupported_media_type', 'the body must be JSON; set "content-type: application/json".');
        return;
      }

      let body: string;
      try {
        body = await readBody(request, maxBytes);
      } catch (error) {
        if (error instanceof PayloadTooLarge) {
          sendTransportError(response, 413, 'payload_too_large', `the body must be at most ${maxBytes} bytes.`, { maxBytes });
          return;
        }
        throw error;
      }

      if (path === API_MCP_PATH) {
        // The MCP transport decides the status itself: 200 for an answer, 202 for a
        // notification, which is the protocol's "received, nothing to say".
        const answer = await handleMcpText(body, observe);
        if (answer.payload === null) {
          response.writeHead(answer.status, { 'cache-control': 'no-store' });
          response.end();
          return;
        }
        sendJson(response, answer.status, answer.payload);
        return;
      }

      // An empty body is not special-cased: `JSON.parse('')` throws, and the
      // protocol already has the right answer for that (a parse error, id null).
      const answer = await handleRpcText(body, observe);
      if (answer === null) {
        // Every message was a notification: the spec wants no reply at all.
        response.writeHead(204, { 'cache-control': 'no-store' });
        response.end();
        return;
      }
      sendJson(response, 200, answer);
    })().catch((error: unknown) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      sendTransportError(response, 500, 'internal', error instanceof Error ? error.message : String(error));
    });
  };
}

/**
 * The port to bind: what was asked for, then the environment, then the default.
 *
 * Split out to be testable, because the interesting case is the one that is easy
 * to get wrong: an UNSET `TRACKLET_API_PORT` is not the number zero. `Number('')`
 * is 0, and 0 means "any free port", so reading the variable without checking
 * that it is actually set starts the server somewhere unpredictable instead of at
 * `DEFAULT_PORT`. A variable that is set but nonsense falls back the same way.
 */
export function resolveTrackletPort(requested?: number): number {
  if (requested !== undefined) return requested;
  const raw = process.env[API_PORT_ENV];
  const fromEnv = raw === undefined || raw.trim() === '' ? null : Number(raw);
  return fromEnv !== null && Number.isInteger(fromEnv) && fromEnv >= 0 && fromEnv <= 65535 ? fromEnv : DEFAULT_PORT;
}

/**
 * Listen, and hand back where.
 *
 * Resolves with the port the OS actually gave, so `port: 0` (which a test, or a
 * second copy on a busy machine, wants) can be used and reported.
 */
export async function startTrackletServer(options: TrackletServerOptions = {}): Promise<TrackletServerHandle> {
  const host = options.host ?? DEFAULT_HOST;
  const port = resolveTrackletPort(options.port);
  // Reassigned once the socket is bound, so the endpoints this server reports are
  // the ones it is really on — which is the whole point when `port` was 0.
  let bound = port;
  const server = createServer(createTrackletHandler(options, () => bound));

  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => reject(error);
    server.once('error', failed);
    server.listen(port, host, () => {
      server.off('error', failed);
      resolve();
    });
  });

  const address = server.address();
  bound = typeof address === 'object' && address !== null ? address.port : port;

  return {
    server,
    host,
    port: bound,
    url: `http://${host}:${bound}`,
    // Node closes idle keep-alive sockets for us here, so this resolves as soon
    // as the in-flight requests finish rather than waiting on a parked client.
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export { API_NAME, API_VERSION };
