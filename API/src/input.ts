/**
 * input — reading an operation's arguments without a schema library.
 *
 * An operation receives `Record<string, unknown>` — whatever JSON the caller
 * sent — and has to be both forgiving and honest: forgiving about the small
 * conveniences a person expects (a number written as `"16"`, a flag left off),
 * honest about the things that cannot be guessed (a missing script, a variable
 * name that means nothing here).
 *
 * So these helpers do three things and nothing else:
 *
 *   • read a field, or say what was expected when it is the wrong shape,
 *   • treat `undefined`/`null`/absent as "not given" everywhere,
 *   • coerce numbers and booleans written as strings, once, in one place.
 *
 * The messages they raise are the API's, not the model's: a caller that sent
 * `{ tempo: "fast" }` should be told that, not handed a parser error.
 */

import { badInput } from './result';

/** The raw arguments of an operation, exactly as they arrived from JSON. */
export type ApiInput = Record<string, unknown>;

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/** A required string, trimmed. */
export function str(input: ApiInput, key: string): string {
  const value = input[key];
  if (typeof value !== 'string') badInput(`"${key}" is required and must be a string.`);
  return value;
}

/** A required string that will not be trimmed — a script, a file body. */
export function text(input: ApiInput, key: string): string {
  const value = input[key];
  if (typeof value !== 'string') badInput(`"${key}" is required and must be a string.`);
  return value;
}

/** An optional string: `null` when it was not given. */
export function maybeStr(input: ApiInput, key: string): string | null {
  const value = input[key];
  if (!present(value)) return null;
  if (typeof value !== 'string') badInput(`"${key}", when given, must be a string.`);
  return value;
}

/** An optional number, accepting the `"16"` a form or a shell will send. */
export function maybeNumber(input: ApiInput, key: string): number | null {
  const value = input[key];
  if (!present(value)) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  badInput(`"${key}", when given, must be a number.`);
}

/** An optional flag, accepting `true`, `"true"`, `1` and `"1"`. */
export function maybeBool(input: ApiInput, key: string): boolean | null {
  const value = input[key];
  if (!present(value)) return null;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  badInput(`"${key}", when given, must be true or false.`);
}

/** An optional list of strings. */
export function maybeStringList(input: ApiInput, key: string): string[] | null {
  const value = input[key];
  if (!present(value)) return null;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    badInput(`"${key}", when given, must be a list of strings.`);
  }
  return value as string[];
}

/** An optional list of plain objects — used for a list of takes given inline. */
export function maybeObjectList(input: ApiInput, key: string): Record<string, unknown>[] | null {
  const value = input[key];
  if (!present(value)) return null;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'object' || entry === null || Array.isArray(entry))) {
    badInput(`"${key}", when given, must be a list of objects.`);
  }
  return value as Record<string, unknown>[];
}

/** An optional plain object — used for a song given inline. */
export function maybeObject(input: ApiInput, key: string): Record<string, unknown> | null {
  const value = input[key];
  if (!present(value)) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    badInput(`"${key}", when given, must be an object.`);
  }
  return value as Record<string, unknown>;
}

/**
 * A number that must be one of a closed set.
 *
 * Used where the model has a fixed choice — the tier of a command, the pattern a
 * grid shows — so the refusal names the set instead of letting a bad value fall
 * through to some later, worse error.
 */
export function oneOf<T extends string>(value: string | null, allowed: readonly T[], key: string): T | null {
  if (value === null) return null;
  if (!(allowed as readonly string[]).includes(value)) {
    badInput(`"${key}" must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}
