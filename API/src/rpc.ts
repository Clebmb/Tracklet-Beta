/**
 * rpc — the Core API as JSON-RPC 2.0.
 *
 * The registry is callable from TypeScript and from a shell. This file makes it
 * callable from a PROCESS: one method name, one JSON object of arguments, one
 * JSON object back. That is the shape a language model, an editor plugin, or
 * another program on this machine can drive, and it is why anything built on top
 * — the MCP server next, a browser tool, a test harness — never has to import
 * this repository.
 *
 * JSON-RPC 2.0 rather than a bespoke route because the protocol already answers
 * the questions a transport has to answer, and its answers are better tested than
 * ours would be:
 *
 *   →  { "jsonrpc": "2.0", "id": 1, "method": "script.apply", "params": { … } }
 *   ←  { "jsonrpc": "2.0", "id": 1, "result": { … } }
 *   ←  { "jsonrpc": "2.0", "id": 1, "error": { "code": -32602, "message": "…", "data": { … } } }
 *
 * Three decisions worth knowing:
 *
 *   • A method IS an operation name. `script.apply` is both, so `api.describe`
 *     teaches a caller every method this server has — there is no second list.
 *   • A request with NO `id` is a notification and gets no reply, as the spec
 *     says, so a fire-and-forget caller is not forced into a lie about wanting
 *     an answer.
 *   • The protocol's error codes are used where they MEAN something, and the
 *     operation's own code travels alongside them in `data.code`, so a caller can
 *     branch on the stable small set (`invalid_input`, `script_refused`, …)
 *     instead of on a number, which is what the API promises everywhere else.
 *
 * Nothing here decides anything about music: it validates the ENVELOPE, hands the
 * arguments to `callOperation`, and translates the answer. That is the whole job,
 * and it is why this file can be trusted to change nothing.
 */

import { callOperation, nearOperationNames } from './api';
import { operationNamed, operationNames } from './ops/index';
import type { ApiErrorCode } from './result';

/** A JSON-RPC id: a string, a number, or null. Never an object. */
export type JsonRpcId = string | number | null;

/** One call. `id` absent means a notification; `params` absent means `{}`. */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

/** What an error carries. `code` is protocol-level; `data.code` is the API's. */
export interface JsonRpcErrorBody {
  code: number;
  message: string;
  data?: RpcErrorData;
}

/** The extra, honest detail a refusal can carry without inventing a new channel. */
export interface RpcErrorData {
  /** The API's own closed-set code, when the refusal came from an operation. */
  code?: ApiErrorCode;
  /** One string per problem, with line numbers where the parser gave them. */
  details?: string[];
  /** Near-miss method names, when the method was the problem. */
  suggestions?: string[];
  /** Which operation was being run, for a batch or a log. */
  operation?: string;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: JsonRpcErrorBody;
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

/**
 * The codes this transport can answer with.
 *
 * `parse`, `invalidRequest`, `methodNotFound` and `internal` are the spec's own
 * −32700…−32603 and are used exactly as it defines them. The four in the server
 * range −32001…−32004 are WHERE THE API'S CODES BECOME NUMBERS: a refusal is not a
 * protocol mistake, so it must not be dressed as `invalidRequest` when the
 * request was perfectly well formed and the SCRIPT was wrong.
 */
export const RPC_ERROR = {
  /** The body was not JSON at all. */
  parse: -32700,
  /** JSON, but not a request: no `jsonrpc`, no `method`, a bad `id`. */
  invalidRequest: -32600,
  /** No operation has that name. */
  methodNotFound: -32601,
  /** `params` was not an object of named arguments. */
  invalidParams: -32602,
  /** An operation's own bug. Should never happen; says so rather than hiding. */
  internal: -32603,
  /** A script was parsed and refused. `data.details` holds the diagnostics. */
  scriptRefused: -32001,
  /** A song file was read and refused. `data.details` holds the reasons. */
  fileRefused: -32002,
  /** This build cannot do it (audio rendering in Node, say). */
  unsupported: -32003,
  /** A valid method could not find the thing it was asked for. */
  notFound: -32004,
} as const;

/** The API's closed set, as JSON-RPC numbers. The only place the two meet. */
const RPC_CODE_FOR: Record<ApiErrorCode, number> = {
  invalid_input: RPC_ERROR.invalidParams,
  script_refused: RPC_ERROR.scriptRefused,
  file_refused: RPC_ERROR.fileRefused,
  not_found: RPC_ERROR.notFound,
  unsupported: RPC_ERROR.unsupported,
  internal: RPC_ERROR.internal,
};

/** What one dispatched call looked like, for the server's log line. */
export interface RpcCallReport {
  method: string;
  ok: boolean;
  /** The API code, when the call was refused. */
  code?: ApiErrorCode;
  ms: number;
}

/** A transport that wants to see every call it carries — the CLI's log line. */
export type RpcObserver = (report: RpcCallReport) => void;

/**
 * One call, as the line a terminal shows.
 *
 * Shared by the two transports rather than written twice, because it is the same
 * sentence about the same thing: "what did it just do, did it work, how long did
 * it take". The width is passed in so a whole session's lines line up.
 */
export function callLogLine(report: RpcCallReport, width = 0): string {
  return `${report.ok ? '✓' : '✗'} ${report.method.padEnd(width)}  ${String(report.ms).padStart(5)}ms${
    report.code ? `  ${report.code}` : ''
  }`;
}

/** The widest operation name, so `callLogLine` can align its columns. */
export function callLogWidth(): number {
  return Math.max(...operationNames().map((name) => name.length));
}

/** The failure branch, assembled rather than thrown. */
export function rpcFailure(id: JsonRpcId, code: number, message: string, data?: RpcErrorData): JsonRpcFailure {
  return { jsonrpc: '2.0', id, error: data ? { code, message, data } : { code, message } };
}

/** A number, string or null; anything else is not an id. */
function isRpcId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Run ONE message.
 *
 * Returns null for a notification, which is the spec's way of saying "there is
 * nothing to send back" — the caller writes no body at all.
 */
export async function handleRpcMessage(message: unknown, observe?: RpcObserver): Promise<JsonRpcResponse | null> {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return rpcFailure(null, RPC_ERROR.invalidRequest, 'a request must be a JSON object with "jsonrpc", "method" and "id".');
  }
  const request = message as Record<string, unknown>;

  if (request.jsonrpc !== '2.0') {
    return rpcFailure(null, RPC_ERROR.invalidRequest, '"jsonrpc" must be exactly the string "2.0".');
  }

  const notification = !('id' in request) || request.id === undefined;
  if (!notification && !isRpcId(request.id)) {
    return rpcFailure(
      null,
      RPC_ERROR.invalidRequest,
      'an "id" must be a string, a number, or null — or left out entirely, which makes this a notification.',
    );
  }
  const id: JsonRpcId = notification ? null : (request.id as JsonRpcId);

  if (typeof request.method !== 'string' || request.method === '') {
    return rpcFailure(notification ? null : id, RPC_ERROR.invalidRequest, '"method" is required and must be a non-empty string.');
  }
  const method = request.method;

  // `params` is an object of NAMED arguments, because that is what the operations
  // take. A positional array cannot be mapped onto named fields without guessing,
  // so it is refused by name rather than silently misread as `{}`.
  const rawParams = request.params;
  let params: Record<string, unknown> = {};
  if (rawParams !== undefined && rawParams !== null) {
    if (typeof rawParams !== 'object' || Array.isArray(rawParams)) {
      observe?.({ method, ok: false, code: 'invalid_input', ms: 0 });
      const failure = rpcFailure(
        id,
        RPC_ERROR.invalidParams,
        `"params" must be an object of named arguments, not ${Array.isArray(rawParams) ? 'an array' : typeof rawParams}.`,
        { code: 'invalid_input', operation: method },
      );
      return notification ? null : failure;
    }
    params = rawParams as Record<string, unknown>;
  }

  if (!operationNamed(method)) {
    const suggestions = nearOperationNames(method);
    observe?.({ method, ok: false, code: 'not_found', ms: 0 });
    const failure = rpcFailure(id, RPC_ERROR.methodNotFound, `there is no method called "${method}".`, {
      code: 'not_found',
      operation: method,
      ...(suggestions.length > 0 ? { suggestions } : {}),
      details: [suggestions.length > 0 ? `did you mean: ${suggestions.join(', ')}?` : 'call api.describe for the list.'],
    });
    return notification ? null : failure;
  }

  const started = Date.now();
  const result = await callOperation(method, params);
  observe?.({
    method,
    ok: result.ok,
    ms: Date.now() - started,
    ...(result.ok ? {} : { code: result.error.code }),
  });
  if (notification) return null;

  if (result.ok) return { jsonrpc: '2.0', id, result: result.result };
  return rpcFailure(id, RPC_CODE_FOR[result.error.code], result.error.message, {
    code: result.error.code,
    operation: method,
    ...(result.error.details ? { details: result.error.details } : {}),
  });
}

/**
 * Run a parsed body: one message, or an array of them (a batch).
 *
 * A batch answers with an array in the same order, minus its notifications. A
 * batch of nothing but notifications has no body to send, and this says so by
 * returning null rather than an empty array, which the spec forbids.
 */
export async function handleRpcPayload(
  payload: unknown,
  observe?: RpcObserver,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (!Array.isArray(payload)) return handleRpcMessage(payload, observe);
  if (payload.length === 0) {
    return rpcFailure(null, RPC_ERROR.invalidRequest, 'an empty batch is not a valid request.');
  }
  const answers = await Promise.all(payload.map((message) => handleRpcMessage(message, observe)));
  const kept = answers.filter((answer): answer is JsonRpcResponse => answer !== null);
  return kept.length === 0 ? null : kept;
}

/** Run a body that arrived as text, so a parse failure is a protocol answer. */
export async function handleRpcText(
  body: string,
  observe?: RpcObserver,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    return rpcFailure(
      null,
      RPC_ERROR.parse,
      `the body was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return handleRpcPayload(payload, observe);
}
