/**
 * The stdio transport, driven through two real streams.
 *
 * No port and no process: `serveStdio` takes its streams as options precisely so
 * the whole conversation — handshake, tools, a refusal, a broken line — can be
 * held in a test. The pipe a real client adds is the one part that cannot break
 * anything this file does not already cover.
 *
 * The assertions that matter most are about the OUTPUT CHANNEL, because that is
 * what a client parses: every line has to be exactly one JSON-RPC message, the
 * answers have to come back in the order the questions were asked, and a
 * notification has to produce no line at all.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { serveStdio, stdioUsage, DEFAULT_MAX_LINE } from '../src/stdio';
import { MCP_PROTOCOL_VERSION, MCP_SERVER_NAME } from '../src/mcp';
import { MCP_SERVER_COMMAND, MCP_SERVER_SCRIPT } from '../src/identity';
import { OPERATIONS } from '../src/ops/index';
import type { JsonRpcResponse } from '../src/rpc';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Let whatever was queued run, without ending the input. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface Harness {
  input: PassThrough;
  /** Every line written to the output, split on newlines. */
  lines: string[];
  done: Promise<number>;
  send(...messages: unknown[]): void;
  /** Raw bytes, so a message can be split across chunks on purpose. */
  raw(text: string): void;
  end(): void;
  stop(): void;
}

function harness(options: { maxLine?: number; log?: (line: string) => void } = {}): Harness {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: string[] = [];
  let pending = '';
  output.on('data', (chunk: Buffer) => {
    pending += chunk.toString('utf8');
    let newline = pending.indexOf('\n');
    while (newline >= 0) {
      lines.push(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      newline = pending.indexOf('\n');
    }
  });

  const server = serveStdio({ input, output, ...options });
  return {
    input,
    lines,
    done: server.done,
    send: (...messages) => input.write(messages.map((message) => JSON.stringify(message)).join('\n') + '\n'),
    raw: (text) => input.write(text),
    end: () => input.end(),
    stop: () => server.stop(),
  };
}

/** Every line as parsed JSON, so a broken line fails loudly here. */
function parsed(lines: string[]): JsonRpcResponse[] {
  return lines.map((line) => {
    const value: unknown = JSON.parse(line);
    if (value === null || typeof value !== 'object') throw new Error(`not an object: ${line}`);
    return value as JsonRpcResponse;
  });
}

const INITIALIZE = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION } };
const INITIALIZED = { jsonrpc: '2.0', method: 'notifications/initialized' };
const TOOLS = { jsonrpc: '2.0', id: 2, method: 'tools/list' };

describe('a message on a line', () => {
  it('answers initialize, and answers a notification with nothing at all', async () => {
    const io = harness();
    io.send(INITIALIZE, INITIALIZED);
    io.end();
    await io.done;

    expect(io.lines).toHaveLength(1);
    const [answer] = parsed(io.lines);
    if (!answer || 'error' in answer) throw new Error('initialize was refused');
    expect(answer.result).toMatchObject({ protocolVersion: MCP_PROTOCOL_VERSION, serverInfo: { name: MCP_SERVER_NAME } });
  });

  it('answers in the order it was asked, when the questions arrive together', async () => {
    const io = harness();
    io.send(INITIALIZE, TOOLS, { jsonrpc: '2.0', id: 3, method: 'ping' });
    io.end();
    await io.done;
    expect(parsed(io.lines).map((answer) => answer.id)).toEqual([1, 2, 3]);
  });

  it('waits for a newline, so a message split across chunks is still one message', async () => {
    const io = harness();
    const body = JSON.stringify(TOOLS);
    io.raw(body.slice(0, 10));
    io.raw(body.slice(10, 25));
    expect(io.lines).toHaveLength(0);
    io.raw(`${body.slice(25)}\n`);
    io.end();
    await io.done;
    const [answer] = parsed(io.lines);
    expect(answer?.id).toBe(2);
  });

  it('ignores blank lines, which a trailing newline always produces', async () => {
    const io = harness();
    io.raw(`\n\n${JSON.stringify(TOOLS)}\n\n`);
    io.end();
    const count = await io.done;
    expect(count).toBe(1);
    expect(io.lines).toHaveLength(1);
  });

  it('hands back thirty tools with their schemas', async () => {
    const io = harness();
    io.send(TOOLS);
    io.end();
    await io.done;
    const answer = parsed(io.lines)[0];
    if (!answer || 'error' in answer) throw new Error('tools/list was refused');
    const tools = (answer.result as { tools: { name: string; description: string; inputSchema: unknown }[] }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(OPERATIONS.map((operation) => operation.name));
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });
});

describe('a line that is not a message', () => {
  it('is refused, and the next one is still answered', async () => {
    const io = harness();
    io.raw('{ nope\n');
    io.send(TOOLS);
    io.end();
    await io.done;

    expect(io.lines).toHaveLength(2);
    const [refused, answered] = parsed(io.lines);
    expect(refused && 'error' in refused && refused.error.code).toBe(-32700);
    expect(refused?.id).toBeNull();
    // The point: one bad line does not end the conversation.
    expect(answered?.id).toBe(2);
  });

  it('is refused when it grows past the limit, and the buffer recovers', async () => {
    const io = harness({ maxLine: 64 });
    io.raw(`{"jsonrpc":"2.0","id":9,"method":"tools/list","params":{"pad":"${'x'.repeat(200)}`); // no newline
    io.raw('\n');
    io.send(TOOLS);
    io.end();
    await io.done;

    const answers = parsed(io.lines);
    expect(answers).toHaveLength(2);
    const refused = answers[0];
    if (!refused || !('error' in refused)) throw new Error('expected the long line to be refused');
    expect(refused.error.code).toBe(-32600);
    expect(refused.error.message).toContain(String(64));
    // The over-long line was dropped rather than dispatched: the next full message
    // is answered, and the truncated one never appears as an answer.
    expect(answers[1]?.id).toBe(2);
  });
});

describe('calling a tool over the pipe', () => {
  it('runs a read-only operation and hands back its result', async () => {
    const io = harness();
    io.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'language.limits', arguments: {} } });
    io.end();
    await io.done;
    const answer = parsed(io.lines)[0];
    if (!answer || 'error' in answer) throw new Error('the tool call was refused');
    const result = answer.result as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.text ?? '')).toMatchObject({ tracks: { max: 8 } });
  });

  it('answers a refused script as a tool error with its line numbers', async () => {
    const io = harness();
    io.send({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'script.apply', arguments: { script: 'new\nnonsense here\n' } },
    });
    io.end();
    await io.done;
    const answer = parsed(io.lines)[0];
    if (!answer || 'error' in answer) throw new Error('expected a tool error, not a protocol error');
    const result = answer.result as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/line \d+:/);
  });

  it('accepts the underscore spelling of a tool name', async () => {
    const io = harness();
    io.send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'script_validate', arguments: { script: 'new' } } });
    io.end();
    await io.done;
    const answer = parsed(io.lines)[0];
    if (!answer || 'error' in answer) throw new Error('the tool call was refused');
    expect((answer.result as { structuredContent: { valid: boolean } }).structuredContent.valid).toBe(true);
  });
});

describe('the channel itself', () => {
  it('writes nothing but one JSON message per line', async () => {
    const io = harness();
    io.send(INITIALIZE, INITIALIZED, TOOLS, { jsonrpc: '2.0', id: 8, method: 'nonsense/method' });
    io.end();
    await io.done;
    for (const line of io.lines) {
      expect(line.startsWith('{')).toBe(true);
      expect(() => JSON.parse(line)).not.toThrow();
      expect(line).not.toContain('\n');
      expect(line).not.toContain('\r');
    }
  });

  it('sends its log lines to the observer, never to the output', async () => {
    const logged: string[] = [];
    const io = harness({ log: (line) => logged.push(line) });
    io.send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'song.create', arguments: { key: 'H major' } } });
    io.end();
    await io.done;
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('song.create');
    expect(logged[0]).toContain('invalid_input');
    // The log is a line of prose; the output is a protocol. Keeping them apart is
    // the one thing a stdio server may not get wrong.
    expect(io.lines.every((line) => JSON.parse(line) !== undefined)).toBe(true);
    expect(logged[0]?.startsWith('{')).toBe(false);
  });

  it('finishes when the input ends, and says how many it answered', async () => {
    const io = harness();
    io.send(INITIALIZE, INITIALIZED, TOOLS);
    io.end();
    expect(await io.done).toBe(2);
  });

  it('finishes on stop(), answering what was already asked and reading nothing more', async () => {
    const io = harness();
    io.send(TOOLS);
    await tick();
    io.stop();
    // A reply already in flight is written: a signal should be a clean exit, not
    // a dropped answer.
    expect(await io.done).toBe(1);
    expect(io.lines).toHaveLength(1);
    // And nothing arriving afterwards starts new work.
    io.send(TOOLS);
    await tick();
    expect(io.lines).toHaveLength(1);
  });

  it('defaults to eight megabytes of line, which is a lot of song', () => {
    expect(DEFAULT_MAX_LINE).toBe(8 * 1024 * 1024);
  });
});

describe('the help a person reads', () => {
  it('names the command, the config and both flags', () => {
    const usage = stdioUsage();
    expect(usage).toContain('stdin');
    expect(usage).toContain('--verbose');
    expect(usage).toContain(MCP_SERVER_COMMAND);
    expect(usage).toContain('"args"');
    expect(usage).toContain(MCP_PROTOCOL_VERSION);
  });

  it('tells you to run a script that actually exists', () => {
    // The panel puts this string in a config file somebody will paste, so it names
    // a real `package.json` script rather than one this file invented.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(Object.keys(pkg.scripts)).toContain(MCP_SERVER_SCRIPT);
    expect(MCP_SERVER_COMMAND).toBe(`npm run ${MCP_SERVER_SCRIPT}`);
  });
});
