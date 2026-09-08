import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/tests/**', '**/*.config.ts', 'dist/'],
      thresholds: {
        // Baseline measured on the current suite (F-05a): 75.07 stmts /
        // 53.08 branch / 79.45 funcs / 75.85 lines. Floors sit ~2pts below to
        // absorb V8 jitter. Raise as coverage improves; never lower.
        statements: 73,
        branches: 51,
        functions: 77,
        lines: 73,
      },
    },
  },
});
