/**
 * operation — the shape every call in this API takes.
 *
 * An operation is a NAME, a sentence about what it is for, a description of its
 * arguments, and a function. Nothing else. That small a contract is the whole
 * reason this folder can be one library, one CLI and one MCP server at the same
 * time: the MCP server exposes these names as tools, the CLI runs them by name
 * from a shell, a test calls the function directly, and none of the three knows
 * about the other two.
 *
 * `input` is not a full JSON Schema implementation. It is the subset a tool
 * registry actually needs — object, properties, which are required, an optional
 * enum — so that `api.describe` can hand a model enough to call the operation
 * without guessing, and so a CLI can print a usage line. Values are still
 * validated by the operation itself (`input.ts`), which is the only place that
 * knows what a field MEANS.
 */

import type { ApiInput } from './input';
import type { ApiResult } from './result';

export type ApiCategory = 'language' | 'song' | 'script' | 'library' | 'export' | 'machine' | 'arranger' | 'live' | 'recorder' | 'arp' | 'workspace' | 'meta';

export interface InputProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  /** The closed set of values, when the field is a choice. */
  enum?: readonly string[];
  /** A sensible value, so an example can be shown without a required field. */
  default?: unknown;
}

export interface JsonSchema {
  type: 'object';
  properties: Record<string, InputProperty>;
  required?: readonly string[];
}

export interface ApiOperation {
  /** The stable name a caller uses: `script.apply`, `song.describe`. */
  name: string;
  /** A short human title, for a menu or a log line. */
  title: string;
  /** One sentence: what it is for and what it hands back. */
  summary: string;
  category: ApiCategory;
  /** A ready-to-run set of arguments, shown by `api.describe` and the CLI. */
  example: ApiInput;
  input: JsonSchema;
  run(input: ApiInput): ApiResult<unknown> | Promise<ApiResult<unknown>>;
}

/** A tiny builder so an operation's schema reads like the call it describes. */
export function schema(properties: Record<string, InputProperty>, required: string[] = []): JsonSchema {
  return required.length > 0 ? { type: 'object', properties, required } : { type: 'object', properties };
}

/** Shorthand for the commonest property: a described string. */
export function field(type: InputProperty['type'], description: string, extra: Partial<InputProperty> = {}): InputProperty {
  return { type, description, ...extra };
}
