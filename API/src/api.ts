/**
 * api — the two ways to call an operation.
 *
 * `callOperation(name, input)` is the dispatch: one function, a name and a JSON
 * object in, an envelope out. That is the shape an MCP server wants, a CLI wants,
 * and a JSON-over-HTTP transport wants, and it knows nothing about Tracklet.
 *
 * `createTrackletApi()` is the same list turned into namespaces, so ordinary
 * TypeScript gets autocomplete-shaped calls:
 *
 *   const tracklet = createTrackletApi();
 *   const plan = await tracklet.language.limits();
 *   const made = await tracklet.script.apply({ script: '…' });
 *
 * Both are built from the SAME registry, so a new operation is reachable both
 * ways the moment it is declared — there is no second place to register it, which
 * is the only reason the two can never disagree.
 */

import { API_NAME, API_VERSION, OPERATIONS, operationNamed, operationNames } from './ops/index';
import type { ApiInput } from './input';
import { ApiError, fail, type ApiResult } from './result';
import type { ApiOperation } from './operation';

/**
 * One operation, called by name.
 *
 * An operation's `run` RETURNS the envelope — it calls `ok(...)`, or throws with
 * `refuse(...)` — so this dispatch does two things and only two: find the
 * operation, and turn a throw into the failure branch. Wrapping the return value
 * again here would double it, which is the one bug this shape invites.
 */
export async function callOperation(name: string, input: ApiInput = {}): Promise<ApiResult<unknown>> {
  const operation = operationNamed(name);
  if (!operation) {
    return fail('not_found', `there is no operation called "${name}".`, [
      'call api.describe for the list, or api.version for the versions.',
      nearestNames(name),
    ]);
  }
  try {
    return await operation.run(input);
  } catch (error) {
    if (error instanceof ApiError) return fail(error.code, error.message, error.details);
    return fail('internal', error instanceof Error ? error.message : String(error));
  }
}

/**
 * The names closest to a typo'd one, so a refusal can be acted on.
 *
 * Exported because more than one caller has to say "that is not an operation":
 * the dispatcher below, and the JSON-RPC transport, which must answer with the
 * protocol's own method-not-found code while still being as helpful.
 */
export function nearOperationNames(name: string): string[] {
  const wanted = name.toLowerCase();
  return operationNames().filter((candidate) => {
    const short = candidate.slice(candidate.lastIndexOf('.') + 1);
    return candidate.toLowerCase().includes(wanted) || wanted.includes(short);
  });
}

/** The same list, as the one line a refusal's `details` carries. */
function nearestNames(name: string): string {
  const near = nearOperationNames(name);
  return near.length > 0 ? `did you mean: ${near.join(', ')}?` : 'api.describe lists them all.';
}

/** A namespaced call: `tracklet.script.apply({…})`. */
export type OperationCall = (input?: ApiInput) => Promise<ApiResult<unknown>>;

export interface TrackletApi {
  /** Call any operation by its full name. */
  call: (name: string, input?: ApiInput) => Promise<ApiResult<unknown>>;
  /** The operations, as descriptors — names, summaries, schemas. */
  operations: () => readonly ApiOperation[];
  /** The operation names, in registry order. */
  names: () => string[];
  /** `api.describe` and `api.version`, and every domain, as callable groups. */
  api: Record<string, OperationCall>;
  language: Record<string, OperationCall>;
  song: Record<string, OperationCall>;
  script: Record<string, OperationCall>;
  library: Record<string, OperationCall>;
  machine: Record<string, OperationCall>;
  export: Record<string, OperationCall>;
}

/**
 * The registry, as callable namespaces.
 *
 * Built by splitting each operation's name on its dot rather than by listing the
 * groups by hand: a caller gets `tracklet.script.apply` because the operation is
 * called `script.apply`, so the facade is a VIEW of the registry and not a
 * parallel description of it.
 */
export function createTrackletApi(): TrackletApi {
  const groups: Record<string, Record<string, OperationCall>> = {};
  for (const operation of OPERATIONS) {
    const dot = operation.name.indexOf('.');
    const namespace = operation.name.slice(0, dot);
    const method = operation.name.slice(dot + 1);
    const group = (groups[namespace] ??= {});
    group[method] = (input: ApiInput = {}) => callOperation(operation.name, input);
  }
  // Every namespace is present even when empty, so destructuring a group can
  // never blow up on a build with fewer operations compiled in.
  for (const namespace of ['api', 'language', 'song', 'script', 'library', 'machine', 'export']) {
    groups[namespace] ??= {};
  }
  return {
    call: callOperation,
    operations: () => OPERATIONS,
    names: () => operationNames(),
    api: groups.api as Record<string, OperationCall>,
    language: groups.language as Record<string, OperationCall>,
    song: groups.song as Record<string, OperationCall>,
    script: groups.script as Record<string, OperationCall>,
    library: groups.library as Record<string, OperationCall>,
    machine: groups.machine as Record<string, OperationCall>,
    export: groups.export as Record<string, OperationCall>,
  };
}

/** The identity of the running API, for a handshake or a footer. */
export function apiIdentity(): { name: string; version: string } {
  return { name: API_NAME, version: API_VERSION };
}
