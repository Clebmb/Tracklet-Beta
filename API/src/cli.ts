/**
 * cli — the Core API from a shell.
 *
 * A tool that only a TypeScript program can call is a tool half its audience
 * cannot use, so every operation is reachable from the command line too:
 *
 *   npx vite-node API/src/cli.ts api.describe
 *   npx vite-node API/src/cli.ts language.search '{"query":"bass"}'
 *   npx vite-node API/src/cli.ts library.list
 *   npx vite-node API/src/cli.ts script.apply '{"script":"new\nsong \"X\"\ntracks 3\n…"}'
 *   cat tune.txt | npx vite-node API/src/cli.ts script.validate -
 *
 * The input is JSON, the output is the envelope as JSON, and the exit code is 0
 * for a result and 1 for a refusal — which is all a shell needs to branch on. A
 * pipeline of these is a reasonable way to check a folder of songs, and it is
 * exactly what an agent that can only run commands needs.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { API_NAME, API_VERSION, OPERATIONS, operationNames } from './ops/index';
import { callOperation } from './api';
import type { ApiInput } from './input';
import type { ApiResult } from './result';

const USAGE = `Tracklet Core API ${API_VERSION}

Usage
  npx vite-node API/bin/tracklet-api.ts <operation> [json] [options]

  <operation>   one of the names listed by --list
  [json]        the operation's arguments as a JSON object (default: {})
                "-" reads the JSON from stdin

Options
  -h, --help          this text
  -l, --list          every operation, with its one-line summary
  -c, --compact       print the result on one line
  -o, --out <path>    write the result JSON to a file as well as stdout

Examples
  npx vite-node API/bin/tracklet-api.ts api.describe
  npx vite-node API/bin/tracklet-api.ts language.limits
  npx vite-node API/bin/tracklet-api.ts language.search '{"query":"bass"}'
  npx vite-node API/bin/tracklet-api.ts library.list
  npx vite-node API/bin/tracklet-api.ts library.open '{"path":"scripts/deepseek/06-sunrise-set.txt"}'
  npx vite-node API/bin/tracklet-api.ts script.validate '{"script":"new\\nsong \\\"X\\\"\\ntracks 3\\ntrack 1 \\\"LEAD\\\" voice lead\\npattern 1 \\\"A\\\"\\nA-4 .\\n"}'
  echo '{"script":"new"}' | npx vite-node API/bin/tracklet-api.ts script.validate -
`;

function flag(argv: string[], ...names: string[]): boolean {
  return names.some((name) => argv.includes(name));
}

/** The value after a flag, or null. */
function flagValue(argv: string[], ...names: string[]): string | null {
  for (const name of names) {
    const index = argv.indexOf(name);
    if (index >= 0 && index + 1 < argv.length) return argv[index + 1] ?? null;
  }
  return null;
}

/** Pretty or compact JSON, so a person and a pipe are both served. */
function stringify(value: unknown, compact: boolean): string {
  return JSON.stringify(value, null, compact ? 0 : 2);
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

export async function runCli(argv: string[]): Promise<number> {
  const args = argv.slice();
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);

  if (args.length === 0 || flag(args, '-h', '--help')) {
    out(USAGE);
    return 0;
  }
  if (flag(args, '-l', '--list')) {
    const width = Math.max(...operationNames().map((name) => name.length));
    for (const operation of OPERATIONS) {
      out(`${operation.name.padEnd(width + 2)}${operation.summary}\n`);
    }
    return 0;
  }

  // The first argument that is not a flag's value is the operation name. Flags
  // are parsed after, so `cli --compact song.grid '{…}'` and `cli song.grid '{…}'
  // --compact` both work, which is what a person expects from a CLI.
  const consumed = new Set<string>();
  for (const name of ['-o', '--out']) {
    const index = args.indexOf(name);
    if (index >= 0) consumed.add(args[index + 1] ?? '');
  }
  const operation = args.find((arg) => !arg.startsWith('-') && !consumed.has(arg));
  if (!operation) {
    err('no operation given.\n\n');
    err(USAGE);
    return 1;
  }

  const inputArg = args.find((arg) => arg !== operation && !arg.startsWith('-') && !consumed.has(arg));
  let raw = '{}';
  if (inputArg === '-') raw = readStdin() || '{}';
  else if (inputArg !== undefined) raw = inputArg;

  let input: ApiInput;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('the arguments must be a JSON object');
    }
    input = parsed as ApiInput;
  } catch (error) {
    err(`could not read the arguments as JSON: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const result: ApiResult<unknown> = await callOperation(operation, input);
  const compact = flag(args, '-c', '--compact');
  if (result.ok) {
    out(`${stringify(result.result, compact)}\n`);
  } else {
    err(`${stringify(result.error, compact)}\n`);
  }

  const outPath = flagValue(args, '-o', '--out');
  if (outPath) {
    try {
      writeFileSync(outPath, stringify(result.ok ? result.result : result.error, false));
    } catch (error) {
      err(`could not write "${outPath}": ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
  return result.ok ? 0 : 1;
}

export { USAGE, API_NAME, API_VERSION };
