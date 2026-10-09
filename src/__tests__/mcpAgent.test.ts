import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  AGENT_CAVEAT,
  AGENT_HTTP_LABEL,
  AGENT_RETYPE_NOTE,
  AGENT_STDIO_LABEL,
  AGENT_STEPS,
  AGENT_SURFACE,
  agentEndpoint,
  agentHealthUrl,
  agentHttpConfigLines,
  agentHttpConfigText,
  agentStartCommand,
  agentStateFromHealth,
  agentStatusDetail,
  agentStatusLine,
  agentStdioConfigLines,
  agentStdioConfigText,
  checkingAgentState,
  probeAgentServer,
  unreachableAgentState,
} from '../ui/mcpAgent';
import {
  API_DEFAULT_PORT,
  API_MCP_CLIENT_KEY,
  API_SERVER_COMMAND,
  API_SERVER_SCRIPT,
  MCP_SERVER_SCRIPT,
} from '../../API/src/identity';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A fake `Response`, so the probe is checked without a server. */
function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

/**
 * What a real `/health` answers. Pinned here rather than imported from the server
 * so that the panel is checked against the SHAPE it will meet on the wire: if the
 * server ever stopped sending `operations`, this test would fail here rather than
 * the panel quietly showing a green line with nothing in it.
 */
const HEALTH = { ok: true, name: 'tracklet-core-api', apiVersion: '0.1.0', operations: 30, uptimeSeconds: 4 };

describe('the shared identity', () => {
  it('has no imports at all, which is what lets a browser bundle use it', () => {
    // The whole arrangement rests on this file being a dependency-free leaf: the
    // server needs `node:http` and the ops need the model, so a constant shared
    // between the server and the app can only live somewhere with neither. An
    // import added here would break the browser build, loudly and far away.
    const source = readFileSync(join(ROOT, 'API', 'src', 'identity.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\bfrom\s+['"]/);
  });

  it('is the port and the endpoint the panel prints', () => {
    expect(agentEndpoint()).toBe(`http://127.0.0.1:${API_DEFAULT_PORT}/mcp`);
    expect(agentHealthUrl()).toBe(`http://127.0.0.1:${API_DEFAULT_PORT}/health`);
  });

  it('tells the port to whoever starts the server, so the command and the config agree', () => {
    const command = agentStartCommand();
    expect(command).toContain(API_SERVER_COMMAND);
    expect(command).toContain(String(API_DEFAULT_PORT));
    expect(agentStartCommand(5000)).toContain('5000');
    expect(agentEndpoint(5000)).toContain('5000');
  });

  it('names scripts that package.json actually has', () => {
    // The panel puts these names into a config somebody pastes into a client. A
    // "start it with" line naming a script this repository does not have is a dead
    // end that reads as a broken install, so the names are checked against the
    // manifest rather than trusted.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(Object.keys(pkg.scripts)).toContain(API_SERVER_SCRIPT);
    expect(Object.keys(pkg.scripts)).toContain(MCP_SERVER_SCRIPT);
  });
});

describe('the panel copy', () => {
  /**
   * The left column is 160px of an 8px font — roughly thirty characters, which is
   * the same budget `helpOverlay.test.ts` counts for a row of the F1 screen. A
   * line that outgrows it does not wrap, it runs into the column beside it.
   */
  const LEFT_BUDGET = 30;
  /** The right column is 440px wide: the config block is the widest thing in it. */
  const RIGHT_BUDGET = 78;

  it('keeps every step inside the left column', () => {
    for (const step of AGENT_STEPS) {
      expect(step.label.length).toBeLessThanOrEqual(LEFT_BUDGET);
      expect(step.text.length).toBeLessThanOrEqual(LEFT_BUDGET);
    }
    expect(AGENT_SURFACE.every((line) => line.length <= LEFT_BUDGET)).toBe(true);
  });

  it('names the three steps in the order the mistake happens in', () => {
    // Pointing a client at a server that was never started looks exactly like a
    // broken config, so starting one is step one.
    expect(AGENT_STEPS).toHaveLength(3);
    expect(AGENT_STEPS[0]?.label).toContain('1');
    expect(AGENT_STEPS[0]?.label.toLowerCase()).toContain('start');
    expect(AGENT_STEPS[1]?.label.toLowerCase()).toContain('point');
    expect(AGENT_STEPS[2]?.label.toLowerCase()).toContain('ask');
  });

  it('says the last step is a person, because nothing shares memory with an agent', () => {
    expect(AGENT_CAVEAT).toContain('PASTE');
    expect(AGENT_STEPS[2]?.text).toContain('PASTE');
  });

  it('keeps both configs inside the right column, and both are valid JSON', () => {
    for (const lines of [agentHttpConfigLines(), agentStdioConfigLines()]) {
      expect(lines.every((line) => line.length <= RIGHT_BUDGET)).toBe(true);
      expect(lines.length).toBeGreaterThan(3);
    }
    expect(() => JSON.parse(agentHttpConfigText())).not.toThrow();
    expect(() => JSON.parse(agentStdioConfigText())).not.toThrow();
  });

  it('offers both ways to connect, since which one works is up to the client', () => {
    expect(AGENT_HTTP_LABEL).toContain('URL');
    expect(AGENT_STDIO_LABEL).toContain('COMMAND');
    expect(AGENT_HTTP_LABEL.length).toBeLessThanOrEqual(RIGHT_BUDGET);
    expect(AGENT_STDIO_LABEL.length).toBeLessThanOrEqual(RIGHT_BUDGET);
  });

  it('says why the blocks are copied rather than read off the screen', () => {
    // The font is small capitals, so `mcpServers` is drawn as `MCPSERVERS`: anyone
    // who retypes it gets the key wrong, and a wrong key in a client looks exactly
    // like a server that is not running.
    expect(AGENT_RETYPE_NOTE).toContain('COPY');
    expect(AGENT_RETYPE_NOTE.length).toBeLessThanOrEqual(RIGHT_BUDGET);
  });

  it('writes the URL config a client that dials actually reads', () => {
    const config = JSON.parse(agentHttpConfigText()) as {
      mcpServers: Record<string, { type: string; url: string }>;
    };
    const server = config.mcpServers[API_MCP_CLIENT_KEY];
    expect(server?.type).toBe('http');
    expect(server?.url).toBe(agentEndpoint());
  });

  it('writes the command config a client that spawns a process actually reads', () => {
    const config = JSON.parse(agentStdioConfigText()) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    const server = config.mcpServers[API_MCP_CLIENT_KEY];
    expect(server?.command).toBe('npm');
    expect(server?.args).toEqual(['run', MCP_SERVER_SCRIPT]);
  });

  it('spells the two configs differently, so a client cannot be given the wrong one', () => {
    // The failure this guards: a URL config pasted into a client that expects a
    // command (or the reverse) looks exactly like a server that is not running.
    expect(agentStdioConfigText()).not.toContain('http');
    expect(agentHttpConfigText()).not.toContain('command');
  });
});

describe('the status line', () => {
  it('says what it is doing, then what it found', () => {
    expect(agentStatusLine(checkingAgentState())).toBe('CHECKING...');
    const running = agentStateFromHealth(HEALTH);
    expect(agentStatusLine(running)).toBe('RUNNING  -  v0.1.0  -  30 OPERATIONS');
    expect(agentStatusLine(unreachableAgentState('nope'))).toBe('NOT REACHABLE');
  });

  it('tells you what to do when it is not up, and where the command is', () => {
    const detail = agentStatusDetail(unreachableAgentState('nope'));
    expect(detail).toContain('CHECK AGAIN');
    expect(detail.toLowerCase()).toContain('project folder');
    // The command itself is on its own labelled line, spelled the way a person
    // types it — so it appears once, in one form, rather than two.
    expect(detail).not.toContain(API_SERVER_COMMAND);
    expect(agentStartCommand()).toContain(String(API_DEFAULT_PORT));
  });

  it('says the round trip out loud when it IS up', () => {
    const detail = agentStatusDetail(agentStateFromHealth(HEALTH));
    expect(detail).toContain('PASTE');
  });
});

describe('reading the health answer', () => {
  it('takes a good answer as running, with the build and the count', () => {
    const state = agentStateFromHealth(HEALTH);
    expect(state.status).toBe('running');
    expect(state.version).toBe('0.1.0');
    expect(state.operations).toBe(30);
    expect(state.reason).toBeNull();
  });

  it('treats something else on the port as unreachable rather than as running', () => {
    // "Connected" is the more expensive mistake: the panel is about to tell
    // somebody to paste a URL, and a green line about the wrong process would
    // send them looking for the fault in their client.
    for (const wrong of [null, 'ok', {}, { ok: false }, { ok: true }, { ok: true, apiVersion: '0.1.0' }]) {
      const state = agentStateFromHealth(wrong);
      expect(state.status).toBe('unreachable');
      expect(state.reason).toBeTruthy();
    }
  });

  it('does not ask the health route for anything it does not need', async () => {
    const calls: string[] = [];
    await probeAgentServer(API_DEFAULT_PORT, async (url) => {
      calls.push(url);
      return fakeResponse(HEALTH);
    });
    expect(calls).toEqual([agentHealthUrl()]);
  });
});

describe('probing the server', () => {
  it('reports a running server', async () => {
    const state = await probeAgentServer(API_DEFAULT_PORT, async () => fakeResponse(HEALTH));
    expect(state.status).toBe('running');
    expect(state.endpoint).toBe(agentEndpoint());
  });

  it('reports a port that refuses the connection', async () => {
    const state = await probeAgentServer(API_DEFAULT_PORT, async () => {
      throw new TypeError('fetch failed');
    });
    expect(state.status).toBe('unreachable');
    expect(state.reason).toContain('fetch failed');
    // The endpoint is still the one to paste: the panel's job is to say where to
    // point the client whether or not the server is up yet.
    expect(state.endpoint).toBe(agentEndpoint());
  });

  it('reports a server that answers with an error', async () => {
    const state = await probeAgentServer(API_DEFAULT_PORT, async () => fakeResponse({}, false, 502));
    expect(state.status).toBe('unreachable');
    expect(state.reason).toContain('502');
  });

  it('as a timeout, because a probe that hangs is a button that looks broken', async () => {
    const state = await probeAgentServer(API_DEFAULT_PORT, async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    expect(state.status).toBe('unreachable');
    expect(state.reason).toBeTruthy();
  });

  it('asks a port other than the default when it is told to', async () => {
    let asked = '';
    await probeAgentServer(5000, async (url) => {
      asked = url;
      return fakeResponse(HEALTH);
    });
    expect(asked).toBe('http://127.0.0.1:5000/health');
  });
});
