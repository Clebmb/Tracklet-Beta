/**
 * mcpAgent — what the MCP panel says, and where those words come from.
 *
 * The Script modal answers "how do I write music as text?". This is the page
 * beside it that answers the next question: "how do I get SOMETHING ELSE to write
 * it?". The answer is the Core API in `API/`, which serves this app's own model as
 * MCP tools, and the panel's job is to be the one place in the app that says how to
 * turn that on and where to point the agent.
 *
 * Pure and Phaser-free, like `overview.ts` and `historyRows.ts`, so the sentences,
 * the config and the status line are all checkable without a canvas.
 *
 * ## Why it imports from `API/`
 *
 * The port and the route are the SERVER'S facts, not the panel's. If this file
 * printed a hand-typed `4590`, then the day the server's default moved the panel
 * would quietly start teaching the wrong command — and no test could catch it,
 * because the two numbers would be in different languages. So they are imported
 * from `API/src/identity.ts`, the one module in that folder with no imports at
 * all, which is exactly what lets a browser bundle use it. `mcpAgent.test.ts`
 * reads that file and fails if an import ever appears in it, because that is how
 * this arrangement would break.
 *
 * ## What it does NOT promise
 *
 * The server is a separate process and the song in the editor has never been saved
 * to disk, so an agent CANNOT see or touch the song you are looking at. It can
 * read the songs already on this machine, speak the whole language, and hand back
 * a script or a `.mid`. The last step of the round trip is a person pasting that
 * script into the box next door — which is why this button lives in that modal
 * rather than somewhere that would imply more.
 */

import {
  API_DEFAULT_PORT,
  API_HEALTH_PATH,
  API_MCP_CLIENT_KEY,
  API_MCP_PATH,
  API_SERVER_COMMAND,
  MCP_SERVER_SCRIPT,
  apiBaseUrl,
  apiEndpoint,
} from '../../API/src/identity';

/** How long to wait for an answer before calling it unreachable. */
export const AGENT_PROBE_TIMEOUT_MS = 1500;

/** The three things the panel can be showing. */
export type AgentStatus = 'checking' | 'running' | 'unreachable';

/** What the panel knows about the agent server right now. */
export interface AgentState {
  status: AgentStatus;
  /** The base URL that was asked, `http://127.0.0.1:4590`. */
  url: string;
  /** The endpoint an MCP client is pointed at. */
  endpoint: string;
  /** The build that answered, when one did. */
  version: string | null;
  /** How many operations it publishes, when one answered. */
  operations: number | null;
  /** Why it could not be reached, in a sentence, when it could not. */
  reason: string | null;
}

/** The base URL the panel probes and the config points at. */
export function agentBaseUrl(port: number = API_DEFAULT_PORT): string {
  return apiBaseUrl(port);
}

/** The MCP endpoint. One URL, used by the status line and the config alike. */
export function agentEndpoint(port: number = API_DEFAULT_PORT): string {
  return apiEndpoint(API_MCP_PATH, port);
}

/** The liveness route the panel asks. */
export function agentHealthUrl(port: number = API_DEFAULT_PORT): string {
  return apiEndpoint(API_HEALTH_PATH, port);
}

/** How to start it, with the port spelled out so the command and the config agree. */
export function agentStartCommand(port: number = API_DEFAULT_PORT): string {
  return `${API_SERVER_COMMAND} -- --port ${port}`;
}

/** The state before the first answer arrives. */
export function checkingAgentState(port: number = API_DEFAULT_PORT): AgentState {
  return { status: 'checking', url: agentBaseUrl(port), endpoint: agentEndpoint(port), version: null, operations: null, reason: null };
}

/** The state when nothing answered. */
export function unreachableAgentState(reason: string, port: number = API_DEFAULT_PORT): AgentState {
  return { status: 'unreachable', url: agentBaseUrl(port), endpoint: agentEndpoint(port), version: null, operations: null, reason };
}

/**
 * Read a `/health` body into a state.
 *
 * A server that answers with something OTHER than this API's health shape counts
 * as unreachable rather than as running: something is on the port, but it is not
 * the thing the panel is about to tell you to connect to, and saying "connected"
 * would be the more expensive mistake.
 */
export function agentStateFromHealth(health: unknown, port: number = API_DEFAULT_PORT): AgentState {
  const base = checkingAgentState(port);
  if (health === null || typeof health !== 'object') {
    return { ...base, status: 'unreachable', reason: 'something answered, but not with this API\'s health.' };
  }
  const body = health as { ok?: unknown; apiVersion?: unknown; operations?: unknown };
  if (body.ok !== true || typeof body.apiVersion !== 'string' || typeof body.operations !== 'number') {
    return { ...base, status: 'unreachable', reason: 'something answered, but not with this API\'s health.' };
  }
  return { ...base, status: 'running', version: body.apiVersion, operations: body.operations };
}

/** The one-line verdict, in the panel's own voice. */
export function agentStatusLine(state: AgentState): string {
  if (state.status === 'checking') return 'CHECKING...';
  if (state.status === 'running') {
    return `RUNNING  -  v${state.version ?? '?'}  -  ${state.operations ?? '?'} OPERATIONS`;
  }
  return 'NOT REACHABLE';
}

/**
 * The sentence under the verdict: what to do about it, or what it means.
 *
 * Two lines, two jobs. The verdict says WHETHER; this says WHAT NEXT, and for a
 * server that is not up that is the one thing a reader does not have to be told —
 * the command is in its own labelled line right below, so repeating it here (and
 * with the arguments spelled differently) would be a second version of one fact.
 */
export function agentStatusDetail(state: AgentState): string {
  if (state.status === 'checking') return `ASKING ${state.url}${API_HEALTH_PATH}`;
  if (state.status === 'running') {
    return 'AN AGENT CAN CONNECT NOW. ASK IT FOR A SONG, THEN OPEN THE FILE OR PASTE IT HERE.';
  }
  return 'NOTHING IS LISTENING YET. START IT IN THE PROJECT FOLDER, THEN CHECK AGAIN.';
}

/**
 * The two shapes of client config, because clients want one or the other.
 *
 * A client that can dial a URL is pointed at the endpoint; one that would rather
 * spawn a process is given a command. Both launch the SAME tools — the difference
 * is only who starts the server, and getting this wrong is the most common way
 * an MCP setup fails, so both are on the page with a copy button each rather than
 * one of them being "the docs".
 */
export const AGENT_HTTP_LABEL = 'IF YOUR CLIENT TAKES A URL, PASTE THIS';
export const AGENT_STDIO_LABEL = 'OR, IF IT WOULD RATHER RUN A COMMAND';

/**
 * Why the two blocks above have buttons instead of being typed out.
 *
 * JSON keys are case-sensitive and the app's font is small capitals, so
 * `mcpServers` is DRAWN as `MCPSERVERS` with the case flattened away. Anyone who
 * retypes it from the screen gets the key wrong, and a client with a wrong key
 * looks exactly like a server that is not running. The note costs one dim line and
 * names the reason, because "use the button" with no reason is the sort of
 * instruction people skip.
 */
export const AGENT_RETYPE_NOTE = 'COPY RATHER THAN RETYPE - THIS FONT HIDES THE CASE.';

/** The URL config: the client dials, so the server must already be running. */
export function agentHttpConfigText(port: number = API_DEFAULT_PORT): string {
  return JSON.stringify(
    { mcpServers: { [API_MCP_CLIENT_KEY]: { type: 'http', url: agentEndpoint(port) } } },
    null,
    2,
  );
}

/** The same text, one line at a time, for a canvas that draws lines. */
export function agentHttpConfigLines(port: number = API_DEFAULT_PORT): string[] {
  return agentHttpConfigText(port).split('\n');
}

/**
 * The command config: the client starts the server itself, over stdio.
 *
 * Written out by hand rather than through `JSON.stringify`, because the pretty
 * printer expands `args` onto four lines — twenty per cent more panel for two
 * short strings — while a hand-built block says the same thing in four. It is
 * still ordinary JSON, and a test parses it back to prove that.
 *
 * The package manager is `npm`: every command in this repository's own docs is
 * `npm run …`, including the one the panel shows above.
 */
export function agentStdioConfigText(): string {
  return [
    '{',
    '  "mcpServers": {',
    `    "${API_MCP_CLIENT_KEY}": { "command": "npm", "args": ["run", "${MCP_SERVER_SCRIPT}"] }`,
    '  }',
    '}',
  ].join('\n');
}

/** The same text, one line at a time, for a canvas that draws lines. */
export function agentStdioConfigLines(): string[] {
  return agentStdioConfigText().split('\n');
}

/**
 * The left column: what the panel is for, in the order a person does it.
 *
 * Three steps, each a label and the action beneath it, because the order is the
 * part that is easy to get wrong — pointing a client at a server that is not
 * running looks exactly like a broken config.
 */
export const AGENT_STEPS: { label: string; text: string }[] = [
  { label: '1  START THE SERVER', text: 'IN THE PROJECT FOLDER' },
  { label: '2  POINT YOUR CLIENT', text: 'AT THE ENDPOINT' },
  { label: '3  ASK FOR A SONG', text: 'PASTE IT, OR OPEN THE FILE' },
];

/** What the agent gets, one line at a time, so nobody has to guess at the reach. */
export const AGENT_SURFACE: string[] = [
  'WHAT IT GETS',
  'EVERY OPERATION',
  'api.describe LISTS THEM',
  'AND A PLACE TO SAVE',
  'SONGS YOU CAN OPEN',
];

/**
 * The one thing the panel must not let anybody assume.
 *
 * It is tempting to read "an agent is connected" as "an agent can see my song".
 * It cannot: the server is another process, the song in the editor has not been
 * written to disk, and nothing here shares memory across the two. What it CAN do
 * is save a song into the folder the API writes into, which the app then opens
 * like any other file — so the last step is a person either way, and there are two
 * ways to take it.
 */
export const AGENT_CAVEAT =
  'AN AGENT WRITES FILES, NOT YOUR SCREEN: OPEN WHAT IT SAVES, OR PASTE WHAT IT HANDS BACK.';

/**
 * Ask the agent server whether it is up.
 *
 * `fetch` is a parameter so this can be tested by handing it a fake, and the
 * timeout is the panel's rather than the browser's: a probe that hangs for thirty
 * seconds is a button that looks broken.
 */
export async function probeAgentServer(
  port: number = API_DEFAULT_PORT,
  fetcher: (input: string, init?: RequestInit) => Promise<Response> = (input, init) => fetch(input, init),
): Promise<AgentState> {
  try {
    const response = await fetcher(agentHealthUrl(port), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(AGENT_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return unreachableAgentState(`it answered with HTTP ${response.status}.`, port);
    }
    return agentStateFromHealth(await response.json(), port);
  } catch (error) {
    // A refused connection, a CORS refusal and a timeout all land here, and they
    // are all "nothing usable is at that address" — which is what the panel says.
    return unreachableAgentState(error instanceof Error ? error.message : String(error), port);
  }
}
