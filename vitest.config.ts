import { defineConfig } from 'vitest/config';

/**
 * The model layer is Phaser-free on purpose, so the tests need no canvas, no
 * aliases and no browser environment — they are plain arithmetic.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts', 'API/**/*.test.ts'],
  },
});
