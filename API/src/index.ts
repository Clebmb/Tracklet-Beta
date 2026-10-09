/**
 * Tracklet Core API — the whole surface, from one import.
 *
 * Tracklet already HAS a core: `src/model/` is pure, Phaser-free, DOM-free, and
 * covered by more than a thousand tests. This folder is not a second model. It is
 * a stable, described, JSON-shaped FRONT for that one, so that something which is
 * not this app — an MCP server, a script, a language model, a shell — can use it
 * without knowing which function is where, what a `ScriptApplyResult` is, or how
 * to turn a `Song` into bytes.
 *
 * Four entry points, one registry:
 *
 *   import { createTrackletApi } from './API/src/index';
 *   const tracklet = createTrackletApi();
 *   await tracklet.script.apply({ script });        // namespaced
 *
 *   import { callOperation } from './API/src/index';
 *   await callOperation('script.apply', { script }); // by name
 *
 *   npx vite-node API/bin/tracklet-api.ts script.apply '{…}'  // from a shell
 *   npx vite-node API/bin/tracklet-server.ts --port 4590      // over HTTP, as JSON-RPC
 *
 * The operation list itself is `OPERATIONS`; `api.describe` prints it as JSON.
 *
 * Everything here is Node-only by nature — the CLI reads files and the server
 * opens a socket — so importing this barrel from a browser bundle is not a thing
 * to do; `callOperation` alone is what a browser-side tool would want, and it has
 * no Node dependency of its own.
 */

export * from './identity';
export * from './result';
export * from './operation';
export * from './input';
export * from './songAccess';
export * from './edits';
export * from './diff';
export * from './library';
export * from './ops/index';
export * from './api';
export * from './rpc';
export * from './mcp';
export * from './stdio';
export * from './server';
