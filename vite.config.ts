import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Serve optional local music assets during development/preview only.
 * Personal storage is never copied into the production website bundle.
 */
function kitStorage(): Plugin {
  const root = resolve(fileURLToPath(new URL('./storage', import.meta.url)));

  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const asked = decodeURIComponent((req.url ?? '').split(/[?#]/)[0]);
    const file = resolve(join(root, asked));
    if (file !== root && !file.startsWith(root + sep)) { next(); return; }
    if (!existsSync(file) || !statSync(file).isFile()) { next(); return; }
    res.setHeader('Content-Type', CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  };

  return {
    name: 'doodadarium-kit-storage',
    configureServer: (server) => { server.middlewares.use('/storage', handler); },
    configurePreviewServer: (server) => { server.middlewares.use('/storage', handler); },
  };
}

/** What the few file kinds a song script names are served as. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.sf2': 'application/octet-stream',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
};

const uiSrc = fileURLToPath(new URL('./vendor/phaser-ui-canvas/src', import.meta.url));
const phaserEsm = fileURLToPath(new URL('./node_modules/phaser/dist/phaser.esm.js', import.meta.url));
const phaserEsmMin = fileURLToPath(new URL('./node_modules/phaser/dist/phaser.esm.min.js', import.meta.url));

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [kitStorage()],
  resolve: {
    alias: [
      { find: /^phaser-ui-canvas$/, replacement: `${uiSrc}/index.ts` },
      { find: /^phaser-ui-canvas\/(.*)$/, replacement: `${uiSrc}/$1` },
      { find: /^phaser$/, replacement: command === 'serve' ? phaserEsmMin : phaserEsm },
    ],
    dedupe: ['phaser'],
  },
  server: {
    port: 5200,
    strictPort: false,
    fs: { allow: ['.'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
