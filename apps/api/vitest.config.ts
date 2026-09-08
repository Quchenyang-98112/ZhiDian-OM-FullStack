import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    pool: 'threads',
    maxWorkers: 2,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // json-summary powers Codecov flag uploads + tooling parity with apps/web
      // (which already emits it for scripts/check-coverage-baseline.mjs).
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/data/**'],
      // Staged raise: v1.6.1 measured ~55% statements / 63% functions (P1-05 complete)
      thresholds: {
        statements: 55,
        branches: 46,
        functions: 62,
        lines: 55,
      },
    },
  },
});
