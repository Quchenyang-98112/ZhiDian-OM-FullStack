# Testing Coverage Strategy — Nexus-HEMS-Dash

> **Status:** Active
> **Last Updated:** 2026-04-26
> **Target:** 85% coverage (statements, branches, functions, lines)

This document defines the strategy for reaching and maintaining the 85% test coverage target,
covering test types, priorities, tooling, and step-by-step implementation plan.

---

## Current State (web PRF-03 baseline 78/72/70/80; API P1-05 gate 55/46/62/55)

| Metric | Current Enforced Thresholds | Stage 1 Target | Stage 2 | Stage 3 |
|--------|-----------------------------|----------------|---------|---------|
| Statements | Web **78%** / API **55%** (enforced) | **60%** | 75% | 85% |
| Branches | Web **72%** / API **46%** (enforced) | **55%** | 70% | 85% |
| Functions | Web **70%** / API **62%** (enforced) | **62%** | 76% | 85% |
| Lines | Web **80%** / API **55%** (enforced) | **62%** | 76% | 85% |

**60+ existing test/spec files across web, api, and E2E** — infrastructure is solid, coverage gap is primarily in:
- Page-level components (no tests)
- Library utilities (partial coverage)
- New Phase 2/3 modules (no tests yet)

---

## Test Architecture

### Test Types

| Type | Tool | Location | Purpose |
|------|------|----------|---------|
| Unit | Vitest v4 + jsdom | `apps/web/src/tests/` | Functions, hooks, stores, adapters |
| Integration | Vitest v4 | `apps/web/src/tests/` | Multi-module interactions |
| E2E | Playwright | `apps/web/tests/e2e/` | User flows, routing, offline |
| A11y | @axe-core/playwright | `apps/web/tests/e2e/accessibility.spec.ts` | WCAG 2.2 AA |
| Visual regression | Chromatic | `.github/workflows/chromatic.yml` | Design system |
| Property-based | fast-check | `apps/web/src/tests/fuzz/` | Schema edge cases |
| Security fuzz | fast-check + Zod | `apps/web/src/tests/fuzz/` | Protocol boundaries |

Current config truth:

- `apps/web/vitest.config.ts` enforces `78 / 72 / 70 / 80` (statements / branches / functions / lines) — PRF-03 baseline, web branches raised to 72% 2026-07-02
- `apps/api/vitest.config.ts` enforces `55 / 46 / 62 / 55` (statements / branches / functions / lines) — P1-05 target met 2026-07-02
- The stage targets below are roadmap goals and should only be described as active once the config is raised accordingly.

### Coverage Collection

```typescript
// apps/web/vitest.config.ts — current enforced thresholds
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html', 'lcov'],  // lcov for Codecov
  thresholds: {
    statements: 78,
    branches: 72,
    functions: 70,
    lines: 80,
  },
}
```

---

## Priority Test Areas

### Priority 1 — Zero coverage (highest impact)

| Module | File | Test file |
|--------|------|-----------|
| Downsampling service | `lib/downsampling-service.ts` | `tests/downsampling-service.test.ts` |
| Chart sampling (LTTB) | `lib/chart-sampling.ts` | `tests/chart-sampling.test.ts` |
| PII sanitization | `core/aiClient.ts` | `tests/pii-sanitization.test.ts` |
| Hardware registry | `core/hardware-registry.ts` | `tests/hardware-registry.test.ts` |
| Grid operator API | `lib/grid-operator-api.ts` | `tests/grid-operator-api.test.ts` |

### Priority 2 — Low coverage (<30%)

| Module | File | Test file |
|--------|------|-----------|
| Sankey diagram | `components/SankeyDiagram.tsx` | `tests/sankey-diagram.test.tsx` |
| Command Hub page | `pages/CommandHub.tsx` | `tests/command-hub.test.tsx` |
| Analytics page | `pages/Analytics.tsx` | `tests/analytics-page.test.tsx` |
| OptimizationAI page | `pages/OptimizationAI.tsx` | `tests/optimization-ai.test.tsx` |
| DevicesAutomation page | `pages/DevicesAutomation.tsx` | `tests/devices-automation.test.tsx` |

### Priority 3 — Extend existing tests (~50–70%)

| Module | Existing file | Extension |
|--------|-------------|-----------|
| Tariff providers | `tests/tariff-providers.test.ts` | Add §14a, aWATTar AT, Octopus |
| Energy controllers | `tests/energy-controllers.test.ts` | Add edge cases, §14a paths |
| MPC optimizer | `tests/mpc-optimizer.test.ts` | Add constraint violations |
| DB migrations | `tests/db-migration.test.ts` | Add v10→v11 migration |

---

## Property-Based Testing (fast-check)

### Zod Schema Fuzzing

```typescript
// apps/web/src/tests/fuzz/protocol-schemas.test.ts
import fc from 'fast-check';
import { EnergyDataSchema } from '@nexus-hems/shared-types';

describe('EnergyDataSchema property-based tests', () => {
  it('rejects non-numeric power values', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        expect(() =>
          EnergyDataSchema.parse({ pvPower: value })
        ).toThrow();
      }),
    );
  });

  it('accepts valid numeric ranges', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100_000, noNaN: true }),
        (pvPower) => {
          expect(() =>
            EnergyDataSchema.parse({ pvPower, gridPower: 0, housePower: 0 })
          ).not.toThrow();
        },
      ),
    );
  });
});
```

### JWT Fuzzing

```typescript
// apps/web/src/tests/fuzz/jwt-edge-cases.test.ts
import fc from 'fast-check';
import { sanitizeForPrompt } from '../../core/aiClient';

describe('sanitizeForPrompt property-based tests', () => {
  it('always returns a string <= maxLength', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 256 }), (input, maxLen) => {
        const result = sanitizeForPrompt(input, maxLen);
        expect(result.length).toBeLessThanOrEqual(maxLen);
        expect(typeof result).toBe('string');
      }),
    );
  });

  it('never contains Unicode control characters in output', () => {
    fc.assert(
      fc.property(fc.unicodeString(), (input) => {
        const result = sanitizeForPrompt(input);
        expect(result).not.toMatch(/\p{Cc}/u);
      }),
    );
  });
});
```

---

## Stage 1 Implementation Plan (48% → 60%)

### New test files to create

1. `apps/web/src/tests/downsampling-service.test.ts`
   - Tests: `startDownsamplingService()`, `runDownsamplingCycle()`, bucket arithmetic, idempotency
   - Mocks: Dexie tables (in-memory)

2. `apps/web/src/tests/chart-sampling.test.ts`
   - Tests: `lttbSample()` — output length ≤ threshold, preserves first/last, handles edge cases
   - Property: `∀ data.length > threshold → output.length === threshold`

3. `apps/web/src/tests/pii-sanitization.test.ts`
   - Tests: email masking, phone masking, IBAN masking, IP masking, control chars
   - Property: output always ≤ maxLength, never contains control chars

4. `apps/web/src/tests/hardware-registry.test.ts`
   - Tests: `getAllDevices()`, category filters, mDNS field presence, schema validation
   - Snapshots: device count per category

5. `apps/web/src/tests/command-hub.test.tsx`
   - Tests: render, KPI cards present, quick-nav links, connection status display
   - Mocks: `useAppStore`, `useEnergyStore`

6. `apps/web/src/tests/sankey-diagram.test.tsx`
   - Tests: render with mock EnergyData, ARIA attributes, SR-only table, worker invocation
   - Mocks: `workers/sankey-worker.ts` (Comlink mock)

7. `apps/web/src/tests/analytics-page.test.tsx`
   - Tests: render, time range selector, empty state, chart data loading
   - Mocks: TanStack Query, Dexie

8. `apps/web/src/tests/optimization-ai.test.tsx`
   - Tests: wizard steps, AI call mock, optimizer output rendering
   - Mocks: `callAI()`, MPC optimizer

9. `apps/web/src/tests/devices-automation.test.tsx`
   - Tests: category filters, device cards, floorplan lazy load, device command dispatch
   - Mocks: `useAppStore`, command safety layer

### Threshold timeline

| Stage | Target % | Trigger | Estimated new tests |
|-------|----------|---------|---------------------|
| Stage 1 | 60% | Phase 4 implementation | +9 files |
| Stage 2 | 75% | 4 weeks after Stage 1 | +8 more files |
| Stage 3 | 85% | 8 weeks after Stage 1 | +6 more files |

---

## E2E Testing Policy

### Local

```bash
pnpm test:e2e  # Chromium only — intentionally lightweight
```

### CI

```yaml
# ci.yml — matrix runs Chromium + Firefox
strategy:
  matrix:
    browser: [chromium, firefox]
```

### GitHub Pages Route Testing

Always use base-relative navigation to preserve the `/Nexus-HEMS-Dash/` basename:

```typescript
// Correct
await page.goto('./unknown-route');

// Wrong — bypasses React Router basename
await page.goto('/unknown-route');
```

---

## Test Utilities & Mocking Patterns

### Zustand store mocking

```typescript
// Preferred pattern for store mocking
import { act } from 'react';
import { useAppStore } from '../../store';

beforeEach(() => {
  act(() => {
    useAppStore.setState({
      energyData: mockEnergyData,
      settings: defaultSettings,
    });
  });
});

afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
});
```

### Dexie in-memory mocking

```typescript
// apps/web/src/tests/setup.ts already imports fake-indexeddb
// For per-test Dexie isolation:
import { resetDatabase } from '../lib/db';

beforeEach(async () => {
  await resetDatabase();
});
```

### TanStack Query in tests

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

---

## CI Coverage Upload

After Stage 1 threshold implementation, integrate Codecov:

```yaml
# ci.yml — add after test:coverage step
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    file: ./apps/web/coverage/lcov.info
    flags: frontend
    token: ${{ secrets.CODECOV_TOKEN }}
```

Add the coverage badge to `README.md`:
```markdown
[![Coverage](https://codecov.io/gh/qnbs/Nexus-HEMS-Dash/branch/main/graph/badge.svg)](https://codecov.io/gh/qnbs/Nexus-HEMS-Dash)
```

---

## Related Documents

- `docs/adr/ADR-007-chromatic-visual-regression-gate.md` — visual testing strategy
- `apps/web/vitest.config.ts` — coverage configuration
- `apps/web/playwright.config.ts` — E2E configuration
- `.github/workflows/ci.yml` — CI test gates
- `.github/workflows/fuzz.yml` — security fuzz tests
