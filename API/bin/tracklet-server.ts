/**
 * The Core API, over HTTP: `npm run api:server -- --port 4590`.
 *
 * The same relationship to `src/server.ts` that `bin/tracklet-api.ts` has to
 * `src/cli.ts`: this file only decides to RUN, and only parses a command line.
 * Everything it prints comes from the transport, so the banner cannot describe a
 * server that is not the one starting.
 *
 *   npx vite-node API/bin/tracklet-server.ts
 *   npx vite-node API/bin/tracklet-server.ts --port 0        # a free port, printed
 *   npx vite-node API/bin/tracklet-server.ts --host 0.0.0.0  # deliberately public
 *   npx vite-node API/bin/tracklet-server.ts --quiet         # no line per call
 *
 * Ctrl-C stops it. The process exits 0, so a shell script that started it and
 * killed it is not left believing something went wrong.
 */

import { DEFAULT_PORT, startTrackletServer } from '../src/server';
import { mcpEndpoint } from '../src/mcp';
import { API_NAME, API_VERSION, OPERATIONS } from '../src/ops/index';

const USAGE = `Tracklet Core API ${API_VERSION} — JSON-RPC over HTTP

Usage
  npx vite-node API/bin/tracklet-server.ts [options]

Options
  -p, --port <n>    the port to bind (default ${DEFAULT_PORT}; 0 asks for a free one)
      --host <addr> the interface to bind (default 127.0.0.1 — this machine only)
      --quiet       do not log a line per call
  -h, --help        this text

Endpoints
  POST /rpc          a JSON-RPC 2.0 call, or a batch of them
  POST /mcp          the same registry as an MCP server, for an AI agent
  GET  /health       liveness and identity
  GET  /operations   every method, with its input schema and an example
  GET  /             the same summary, as JSON

The environment variable TRACKLET_API_PORT sets the default port, so a project can
keep its choice in one place without wrapping the command.

Examples
  curl -s http://127.0.0.1:${DEFAULT_PORT}/health
  curl -s http://127.0.0.1:${DEFAULT_PORT}/rpc -H 'content-type: application/json' \\
    -d '{"jsonrpc":"2.0","id":1,"method":"language.limits"}'
  curl -s http://127.0.0.1:${DEFAULT_PORT}/rpc -H 'content-type: application/json' \\
    -d '{"jsonrpc":"2.0","id":2,"method":"library.list","params":{"query":"deepseek"}}'

MCP (what an AI client is pointed at)
  curl -s http://127.0.0.1:${DEFAULT_PORT}/mcp -H 'content-type: application/json' \\
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  # in a client's config: { "mcpServers": { "tracklet": { "type": "http", "url": "http://127.0.0.1:${DEFAULT_PORT}/mcp" } } }
`;

/** The value after a flag, or null. */
function flagValue(argv: string[], ...names: string[]): string | null {
  for (const name of names) {
    const index = argv.indexOf(name);
    if (index >= 0 && index + 1 < argv.length) return argv[index + 1] ?? null;
  }
  return null;
}

async function main(argv: string[]): Promise<number> {
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);

  if (argv.includes('-h') || argv.includes('--help')) {
    out(USAGE);
    return 0;
  }

  const rawPort = flagValue(argv, '-p', '--port');
  let port: number | undefined;
  if (rawPort !== null) {
    const parsed = Number(rawPort);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
      err(`--port must be a whole number between 0 and 65535, not "${rawPort}".\n`);
      return 2;
    }
    port = parsed;
  }

  const quiet = argv.includes('--quiet');
  const host = flagValue(argv, '--host');
  const handle = await startTrackletServer({
    ...(port === undefined ? {} : { port }),
    ...(host === null ? {} : { host }),
    ...(quiet ? {} : { log: (line) => out(`${line}\n`) }),
  });

  out(`${API_NAME} ${API_VERSION} — ${OPERATIONS.length} operations, listening on ${handle.url}\n\n`);
  out(`  POST /rpc          JSON-RPC 2.0, one call or a batch\n`);
  out(`  POST /mcp           MCP, for an AI agent (tools/list, tools/call)\n`);
  out(`  GET  /health       liveness and identity\n`);
  out(`  GET  /operations   every method, with its input schema\n`);
  out(`  GET  /             the same summary, as JSON\n\n`);
  out(`  try: curl -s ${handle.url}/health\n`);
  out(`  mcp: ${mcpEndpoint(handle.port)}\n`);
  out(`  stop: Ctrl-C\n`);

  return await new Promise<number>((resolve) => {
    const stop = () => {
      out('\nstopping…\n');
      void handle.close().then(() => resolve(0));
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (error && typeof error === 'object' && (error as { code?: string }).code === 'EADDRINUSE') {
      process.stderr.write(`that port is already taken. Try --port 0 for a free one.\n`);
    } else {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    }
    process.exitCode = 1;
  },
);
