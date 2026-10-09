/**
 * The Core API, from a shell: `npx vite-node API/bin/tracklet-api.ts …`.
 *
 * This file exists only to have a top-level entry. `src/cli.ts` holds the logic
 * and is importable — a test or another tool can call `runCli(argv)` directly —
 * but a module that runs itself on import cannot also be imported safely, so the
 * decision to RUN is separated from the decision to write output, and it lives
 * here where there is nothing else to do.
 */

import { runCli } from '../src/cli';

runCli(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
