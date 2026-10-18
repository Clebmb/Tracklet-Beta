import { defineConfig } from 'vitest/config';

/**
 * The model layer is Phaser-free on purpose, so the tests need no canvas, no
 * aliases and no browser environment — they are plain arithmetic. Plugins
 * keep their own tests beside their own code (`examples/**`), so a plugin
 * is one folder: manifest, module, docs, presets, tests.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts', 'API/**/*.test.ts', 'examples/**/*.test.ts'],
  },
});
