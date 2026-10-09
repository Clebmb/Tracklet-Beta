/**
 * stdio — the MCP server a CLIENT starts, instead of one you start for it.
 *
 * `server.ts` serves the same registry over a socket, which is right for a tool
 * that can dial a URL. But most desktop AI clients do not dial anything: they
 * launch a command and talk to it over stdin and stdout. That is the whole
 * difference between this file and the HTTP one — the messages are identical,
 * because they are `handleMcpText`'s, and only the pipe changes.
 *
 * The protocol is newline-delimited JSON-RPC: one message per line, in and out.
 * Three rules follow from that, and each of them is a way to break a client if
 * you get it wrong:
 *
 *   • STDOUT IS THE PROTOCOL. Nothing else may be written to it — not a banner,
 *     not a warning, not a progress dot. A single stray character is a parse
 *     error the client cannot report, so every log line goes to stderr, and by
 *     default there are none at all.
 *   • ANSWERS COME BACK IN THE ORDER THEY WERE ASKED. A client sends
 *     `initialize` and `tools/list` together and reads the replies in order, so
 *     messages are dispatched through one queue rather than in parallel. Both are
 *     cheap; nothing here is worth reordering for.
 *   • A LINE ARRIVES IN PIECES. A pipe does not respect message boundaries, so
 *     bytes are buffered until a newline and only then dispatched — and a line
 *     that grows past `maxLine` is refused and dropped rather than buffered
 *     forever, because a client that never sends a newline should not be able to
 *     end this process by exhausting its memory.
 *
 * It is stateless in the same way the HTTP endpoint is: no session, no handshake
 * to keep, and the process holds nothing but the buffer it is mid-way through.
 */

import { API_VERSION, MCP_SERVER_COMMAND } from './identity';
import { MCP_PROTOCOL_VERSION, MCP_SERVER_NAME, handleMcpText } from './mcp';
import { RPC_ERROR, callLogLine, callLogWidth, rpcFailure, type RpcObserver } from './rpc';

/** How long a single line may grow before it is refused. A song is kilobytes. */
export const DEFAULT_MAX_LINE = 8 * 1024 * 1024;

export interface StdioServerOptions {
  /** Where messages are read. Defaults to stdin. */
  input?: NodeJS.ReadableStream;
  /** Where answers are written. Defaults to stdout — and NOTHING else may go here. */
  output?: NodeJS.WritableStream;
  /** A line per call, for a person watching. Never stdout. */
  log?: (line: string) => void;
  /** The longest line to accept before refusing it. */
  maxLine?: number;
}

export interface StdioServer {
  /** Resolves when the input ends, with how many messages were answered. */
  done: Promise<number>;
  /** Stop reading and finish. Answers already queued are still written. */
  stop(): void;
}

/**
 * Serve MCP over a pair of streams.
 *
 * Streams rather than process.stdin/stdout directly, so a test can drive the whole
 * thing — handshake, tools, a refusal — through two `PassThrough`s with no process
 * and no port. The only thing a real client adds is the pipe.
 */
export function serveStdio(options: StdioServerOptions = {}): StdioServer {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const maxLine = options.maxLine ?? DEFAULT_MAX_LINE;
  const width = callLogWidth();
  const observe: RpcObserver | undefined = options.log ? (report) => options.log!(callLogLine(report, width)) : undefined;

  let buffer = '';
  let answered = 0;
  let stopped = false;
  let settle: (count: number) => void = () => undefined;
  const done = new Promise<number>((resolve) => {
    settle = resolve;
  });

  // One queue for every message, so the order the client asked in is the order it
  // reads back. A rejected dispatch is already impossible — an operation's throw
  // becomes an envelope, and a broken line becomes a parse error — so nothing the
  // queue carries can reject it.
  let queue: Promise<void> = Promise.resolve();

  const write = (payload: unknown): void => {
    answered += 1;
    output.write(`${JSON.stringify(payload)}\n`);
  };

  /**
   * Put work at the back of the one queue.
   *
   * Everything written goes through here — an answer to a message, and a refusal
   * of a line that was too long to be one — so the output is in the order the
   * input arrived, whatever went wrong along the way. Work already queued still
   * runs after a `stop`, which is what makes a signal a clean exit rather than a
   * dropped reply.
   */
  const enqueue = (work: () => Promise<void> | void): void => {
    queue = queue.then(async () => {
      await work();
    });
  };

  const handle = (line: string): void => {
    enqueue(async () => {
      const answer = await handleMcpText(line, observe);
      // `status` is the HTTP transport's business; over a pipe, an answer with no
      // body is simply a notification, and silence is the whole of the reply.
      if (answer.payload !== null) write(answer.payload);
    });
  };

  const onData = (chunk: Buffer | string): void => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line !== '') handle(line);
      newline = buffer.indexOf('\n');
    }
    if (buffer.length > maxLine) {
      buffer = '';
      enqueue(() =>
        write(
          rpcFailure(
            null,
            RPC_ERROR.invalidRequest,
            `a message may not be longer than ${maxLine} bytes; it was dropped and the connection is still open.`,
          ),
        ),
      );
    }
  };

  /** Stop reading, let the queue drain, and report. Safe to call twice. */
  function finish(): void {
    if (stopped) return;
    stopped = true;
    input.removeListener('data', onData);
    input.removeListener('end', onEnd);
    input.removeListener('error', onEnd);
    void queue.then(() => settle(answered));
  }

  function onEnd(): void {
    finish();
  }

  input.on('data', onData);
  input.on('end', onEnd);
  input.on('error', onEnd);

  return { done, stop: finish };
}

/** The banner a person sees on `--help`, which is the one thing stderr is for here. */
export function stdioUsage(): string {
  return [
    `${MCP_SERVER_NAME} — the Tracklet Core API as an MCP server, over stdio`,
    '',
    'Usage',
    '  npx vite-node API/bin/tracklet-mcp.ts [options]',
    '',
    'This process speaks newline-delimited JSON-RPC on stdin and stdout, so it is',
    'meant to be started by an MCP client rather than by hand. A client config:',
    '',
    '  { "mcpServers": { "tracklet": { "command": "npm", "args": ["run", "mcp"] } } }',
    '',
    'By hand, to watch it answer',
    `  echo '{"jsonrpc":"2.0","id":1,"method":"ping"}' | ${MCP_SERVER_COMMAND}`,
    '',
    'Options',
    '  -v, --verbose   log one line per call TO STDERR (stdout is the protocol)',
    '  -h, --help      this text, on stderr',
    '',
    `It serves ${MCP_PROTOCOL_VERSION}, publishes the same tools as the HTTP`,
    `endpoint, and reports version ${API_VERSION} to whoever asks.`,
    '',
  ].join('\n');
}
