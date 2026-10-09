/**
 * The Core API as an MCP server a CLIENT starts: `npm run mcp`.
 *
 * Same relationship to `src/stdio.ts` that the other two `bin/` entries have to
 * their modules: this file only decides to RUN, and only reads two flags.
 *
 * There is deliberately no banner on startup. Stdout is the protocol, so a
 * friendly greeting would be the first thing to break a client — the help text
 * goes to stderr, and so does every log line, and by default there are none.
 */

import { serveStdio, stdioUsage } from '../src/stdio';

const argv = process.argv.slice(2);

if (argv.includes('-h') || argv.includes('--help')) {
  process.stderr.write(stdioUsage());
  process.exitCode = 0;
} else {
  const verbose = argv.includes('-v') || argv.includes('--verbose');
  const server = serveStdio({
    log: verbose ? (line) => process.stderr.write(`${line}\n`) : undefined,
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => server.stop());
  }

  server.done.then(
    () => {
      process.exitCode = 0;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
