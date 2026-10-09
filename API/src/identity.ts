/**
 * identity — the handful of facts about this API that OTHER code has to know.
 *
 * Almost everything in this folder is internally consistent by construction: the
 * registry lists the operations, the facade is a view of that list, the MCP tools
 * are the same list again. But three facts have to escape: the API's NAME, its
 * VERSION, and WHERE IT LISTENS. They escape because something outside Node needs
 * them — the app's own MCP panel, which shows a person the port to start the
 * server on and the URL to paste into an agent's config. If the panel printed a
 * hand-typed `4590` and the server's default ever moved, the panel would be
 * teaching the wrong command, and no test could catch it because the two numbers
 * would live in different languages.
 *
 * So they live here, and this file is deliberately EMPTY OF IMPORTS.
 *
 * That is not a micro-optimisation, it is the whole reason the module exists.
 * `server.ts` needs `node:http`, and `ops/` reaches the app's model; the app is a
 * BROWSER bundle, which cannot have either. A dependency-free leaf is the one kind
 * of module that both sides can import, so this is the only place a constant can
 * live and be true in both. `identity.test.ts`-style checks in
 * `src/__tests__/mcpAgent.test.ts` read this file and fail if an import ever
 * appears here, because that is exactly how this arrangement would break — and it
 * would break the browser build, loudly, at the worst possible moment.
 */

/** The name this API answers to, in a handshake or a log line. */
export const API_NAME = 'tracklet-core-api';

/** This API's own version. Moves when the OPERATION surface changes. */
export const API_VERSION = '0.1.0';

/** The protocol the HTTP endpoint speaks, for a banner. */
export const API_PROTOCOL = 'json-rpc 2.0';

/** Where it listens unless told otherwise. */
export const API_HOST = '127.0.0.1';
export const API_DEFAULT_PORT = 4590;

/** The variable that overrides `API_DEFAULT_PORT` without a flag. */
export const API_PORT_ENV = 'TRACKLET_API_PORT';

/** The routes. One definition, so the app's panel and the server cannot disagree. */
export const API_RPC_PATH = '/rpc';
export const API_HEALTH_PATH = '/health';
export const API_OPERATIONS_PATH = '/operations';
export const API_MCP_PATH = '/mcp';

/**
 * How to start it, as a person would type it.
 *
 * The SCRIPT NAME is exported separately from the command for one reason: the
 * app's MCP panel puts the name into a config file, and a test reads
 * `package.json` to check that every script this file promises actually exists.
 * A panel telling somebody to run `npm run mcp` in a repository where the script
 * is called something else is a dead end nobody can debug from the error message.
 */
export const API_SERVER_SCRIPT = 'api:server';
export const API_SERVER_COMMAND = `npm run ${API_SERVER_SCRIPT}`;

/**
 * The MCP server a CLIENT starts itself.
 *
 * Same registry, over stdin and stdout instead of a socket, for the clients that
 * spawn a process rather than dial a URL. `MCP_SERVER_SCRIPT` is what the config
 * block hands them.
 */
export const MCP_SERVER_SCRIPT = 'mcp';
export const MCP_SERVER_COMMAND = `npm run ${MCP_SERVER_SCRIPT}`;

/** The key an MCP client's config file puts this server under. */
export const API_MCP_CLIENT_KEY = 'tracklet';

/** `http://127.0.0.1:4590` — the base URL, with no trailing slash. */
export function apiBaseUrl(port: number = API_DEFAULT_PORT, host: string = API_HOST): string {
  return `http://${host}:${port}`;
}

/** `http://127.0.0.1:4590/rpc`, for a caller that wants the call endpoint spelled out. */
export function apiEndpoint(path: string, port: number = API_DEFAULT_PORT, host: string = API_HOST): string {
  return `${apiBaseUrl(port, host)}${path}`;
}
