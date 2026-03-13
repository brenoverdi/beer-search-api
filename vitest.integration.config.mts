/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.spec.ts'],
    testTimeout: 30000, // Integration tests need more time for real HTTP calls
    hookTimeout: 30000,
    // Run integration tests sequentially to avoid rate limiting
    sequence: {
      concurrent: false,
    },
    maxConcurrency: 1,
  },
});
