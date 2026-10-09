/**
 * result — one envelope for every operation.
 *
 * The Core API is a set of OPERATIONS: named, described, JSON-in and JSON-out.
 * Whatever the caller is — the CLI in this folder, an MCP server, a browser tool,
 * a test — it gets the same shape back, and it never has to catch an exception to
 * learn that something was refused:
 *
 *   { ok: true,  result: … }
 *   { ok: false, error: { code, message, details? } }   // an ApiFailure
 *
 * The two hard rules that make it pleasant to consume:
 *
 *   • An operation THROWS to say "no" — `refuse('invalid_input', …)` — and the
 *     runner turns every throw into the failure branch. So an operation reads
 *     like ordinary code, and a caller still only ever sees one envelope.
 *   • A refusal is never a stack trace. `code` is a small closed set a caller can
 *     branch on, `message` is a sentence a person can read, and `details` is the
 *     same list a refused SCRIPT prints — one line per problem, each with its own
 *     line number where the parser gave one.
 *
 * Tracklet's own model already speaks this way in places (`applyScript` returns
 * `{ ok, errors }`, `songFromJson` returns `{ ok, errors }`); this file is the one
 * place that folds those shapes into the envelope, so no caller has to know which
 * of them it is holding.
 */

/** The kinds of refusal a caller can branch on. A closed set, by design. */
export type ApiErrorCode =
  /** The caller's arguments were missing or the wrong shape. */
  | 'invalid_input'
  /** A script was parsed and refused; `details` holds the diagnostics. */
  | 'script_refused'
  /** A song FILE was read and refused; `details` holds the reasons. */
  | 'file_refused'
  /** A name — a song, a starter, a path — matched nothing. */
  | 'not_found'
  /** The request is real but this build cannot do it (audio in Node, say). */
  | 'unsupported'
  /** An operation's own bug. Should never happen; says so rather than hiding. */
  | 'internal';

/** The failure payload — what `error` holds when `ok` is false. */
export interface ApiFailure {
  code: ApiErrorCode;
  message: string;
  /** One string per problem, in the order they were found. */
  details?: string[];
}

export type ApiResult<T> = { ok: true; result: T } | { ok: false; error: ApiFailure };

/** The success branch. */
export function ok<T>(result: T): ApiResult<T> {
  return { ok: true, result };
}

/** The failure branch, assembled rather than thrown. */
export function fail(code: ApiErrorCode, message: string, details?: string[]): ApiResult<never> {
  return { ok: false, error: details && details.length > 0 ? { code, message, details } : { code, message } };
}

/**
 * A refusal, raised where it is found.
 *
 * Operations call this the way they would call `throw new Error`, and `runOperation`
 * catches it — the point being that the happy path stays a straight line and the
 * envelope is built in exactly one place.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: string[] | undefined;

  constructor(code: ApiErrorCode, message: string, details?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/** Throw a refusal for bad arguments. */
export function refuse(code: ApiErrorCode, message: string, details?: string[]): never {
  throw new ApiError(code, message, details);
}

/** Shorthand for the commonest refusal: the caller's arguments do not fit. */
export function badInput(message: string): never {
  refuse('invalid_input', message);
}

/**
 * Run an operation function and hand back an envelope, whatever happens.
 *
 * Anything that is not an `ApiError` becomes `internal` and keeps its message —
 * a bug in an operation should be visible as a bug, not laundered into
 * `invalid_input`, so that a caller can tell "you asked wrong" from "we are
 * broken", which is the only distinction a consumer can act on.
 */
export async function enclose<T>(body: () => T | Promise<T>): Promise<ApiResult<T>> {
  try {
    return ok(await body());
  } catch (error) {
    if (error instanceof ApiError) return fail(error.code, error.message, error.details);
    return fail('internal', error instanceof Error ? error.message : String(error));
  }
}
