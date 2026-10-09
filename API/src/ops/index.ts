/**
 * ops — the registry: every operation this API has, in one list.
 *
 * The list is the single source of truth for three consumers, and that is the
 * whole architecture: the MCP server will expose one tool per entry, the CLI
 * runs one by name, and `api.describe` prints the list as JSON so a model can
 * discover the surface without reading this repository. Adding an operation in
 * any of the domain files below means all three learn it at once.
 *
 * The two `api.*` operations are built here rather than in a domain file because
 * they describe the registry itself, and a registry cannot describe itself until
 * it exists. They run later, so the closure reads the finished list.
 */

import { CATALOG_VERSION, SCRIPT_VERSION, scriptCapabilities } from '../../../src/model';
import { API_NAME, API_VERSION } from '../identity';
import { ok } from '../result';
import { schema, type ApiOperation } from '../operation';

import { arpOperations } from './arp';
import { editOperations } from './edit';
import { exportOperations } from './export';
import { languageOperations } from './language';
import { libraryOperations } from './library';
import { liveOperations } from './live';
import { machineOperations } from './machine';
import { recorderOperations } from './recorder';
import { scriptOperations } from './script';
import { songOperations } from './songs';
import { workspaceOperations } from './workspace';

/**
 * The API's name and version, re-exported from `identity.ts`.
 *
 * They are declared there rather than here because the app's MCP panel has to
 * print the SAME name and version, and it is a browser bundle that cannot import
 * this file — `ops/` reaches the model, and there is no reason for the identity of
 * the API to be behind that. One declaration, two importers, no drift.
 */
export { API_NAME, API_VERSION };

const domainOperations: ApiOperation[] = [
  ...languageOperations,
  ...songOperations,
  ...editOperations,
  ...machineOperations,
  ...liveOperations,
  ...recorderOperations,
  ...arpOperations,
  ...scriptOperations,
  ...libraryOperations,
  ...exportOperations,
  ...workspaceOperations,
];

const metaOperations: ApiOperation[] = [
  {
    name: 'api.describe',
    title: 'Describe this API',
    summary: 'Every operation: its name, what it is for, its arguments, and a runnable example. The discovery call an MCP server or a model makes first.',
    category: 'meta',
    example: {},
    input: schema({}),
    run: () =>
      ok({
        name: API_NAME,
        apiVersion: API_VERSION,
        scriptVersion: SCRIPT_VERSION,
        operations: OPERATIONS.map((operation) => ({
          name: operation.name,
          title: operation.title,
          summary: operation.summary,
          category: operation.category,
          input: operation.input,
          example: operation.example,
        })),
      }),
  },
  {
    name: 'api.version',
    title: 'Versions',
    summary: 'This API\'s version, the language version it speaks, and the song-file versions it reads.',
    category: 'meta',
    example: {},
    input: schema({}),
    run: () => {
      const capabilities = scriptCapabilities();
      return ok({
        name: API_NAME,
        apiVersion: API_VERSION,
        scriptVersion: capabilities.scriptVersion,
        fileVersions: capabilities.fileVersions,
        catalog: { format: 'tracklet-instruments', version: CATALOG_VERSION },
      });
    },
  },
];

/** Every operation, in a stable order: the domains, then the meta calls. */
export const OPERATIONS: ApiOperation[] = [...domainOperations, ...metaOperations];

/** One operation by name, or undefined. */
export function operationNamed(name: string): ApiOperation | undefined {
  return OPERATIONS.find((operation) => operation.name === name);
}

/** Every operation name, for a help line or a "did you mean". */
export function operationNames(): string[] {
  return OPERATIONS.map((operation) => operation.name);
}
