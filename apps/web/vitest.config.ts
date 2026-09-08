import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'threads',
    maxWorkers: 2,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    setupFiles: ['./src/tests/setup.ts'],
    css: true,
    exclude: ['node_modules', 'dist', 'e2e', 'tests/e2e', '**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      exclude: ['node_modules/', 'src/tests/', '*.config.ts', 'dist/'],
      thresholds: {
        statements: 78,
        // 72 restored (2026-07-08): the page-monolith split series had diluted
        // the global V8 branch ratio to ~71.3% via phantom JSX ternaries. Rather
        // than keep the gate lowered, we covered the real hole — the OCPP/EEBUS
        // adapter config field groups were at 0% branches — lifting measured
        // branches to ~72.7%. See docs/Test-Coverage-TODO.md.
        branches: 72,
        functions: 70,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
