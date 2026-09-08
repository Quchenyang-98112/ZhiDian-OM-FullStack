# Contributing to Nexus-HEMS Dash

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone and install
git clone https://github.com/qnbs/Nexus-HEMS-Dash.git
cd Nexus-HEMS-Dash
corepack enable
pnpm install

# Start dev server
pnpm dev
```

### Prerequisites

- Node.js 24+
- pnpm 10+

## Monorepo Structure

This repository is a **pnpm workspace monorepo** managed by Turborepo.

```text
apps/api/                   # @nexus-hems/api — Express 5 backend
├── index.ts                #   Entry point → src/index.ts
└── src/
    ├── index.ts            #   startServer() + middleware setup
    ├── config/trust-proxy.ts # TRUST_PROXY → Express trust proxy (CDN/multi-hop)
    ├── jwt-utils.ts        #   JWT signing / verification / dual-key rotation
    ├── middleware/         #   auth.ts, security.ts, metrics.ts, security-metrics.ts
    ├── routes/             #   auth, shares, grafana, metrics, eebus
    ├── ws/                 #   energy.ws.ts (WebSocket handler)
    └── data/               #   mock-data.ts

apps/web/                   # @nexus-hems/web — React 19 Vite SPA
├── index.html
├── src/
│   ├── components/         #   React components (UI, panels, widgets)
│   │   └── ui/             #   Shared UI primitives (Gauge, NeonCard, etc.)
│   ├── core/               #   Adapter pattern (EnergyAdapter, UnifiedEnergyModel)
│   │   └── adapters/       #   Protocol adapters (Victron, Modbus, KNX, OCPP, EEBUS)
│   ├── lib/                #   Utilities (db, crypto, format, optimizer, etc.)
│   ├── locales/            #   i18n translations (en.ts, de.ts)
│   ├── pages/              #   Route-level page components
│   ├── tests/              #   Vitest unit tests
│   ├── store.ts            #   Zustand global store
│   ├── types.ts            #   Frontend TypeScript types
│   └── i18n.ts             #   react-i18next configuration
├── tests/e2e/              #   Playwright E2E tests
└── src-tauri/              #   Tauri desktop app config + Rust

packages/shared-types/      # @nexus-hems/shared-types — Zod schemas + types
└── src/
    ├── protocol.ts         #   EnergyData, WSCommand, AuthToken, UnifiedEnergyModel
    ├── share.ts            #   Dashboard share create/redeem (MED-06)
    └── index.ts            #   Re-exports

pnpm-workspace.yaml         # Workspace roots: apps/* and packages/*
turbo.json                  # Turborepo task pipeline
tsconfig.base.json          # Ultra-strict root TypeScript config (inherited by all)
```

## Development Guidelines

### Tech Stack (Do Not Change)

- **React 19** + **Vite 8** — No Next.js, no Remix
- **Zustand** — No Redux, no MobX
- **D3.js** for Sankey — No alternative charting for energy flow
- **Tailwind CSS 4** — Neo-Energy Cyber-Glassmorphism design system
- **Dexie.js** — IndexedDB for offline-first persistence
- **motion** — All animations

### Code Quality

The project uses **Biome** as the primary linter and formatter, with a minimal ESLint configuration for React-specific rules that have no Biome equivalent.

```bash
pnpm lint             # Biome check + React ESLint (zero-warning policy)
pnpm lint:fix         # Biome auto-fix + ESLint fix
pnpm format           # Biome format --write (all src files)
pnpm type-check       # TypeScript strict mode
pnpm test:run         # Unit tests (all must pass)
pnpm build            # Production build
pnpm verify:basis     # Full local loop via Turbo: type-check + lint + test:run
```

> `pnpm lint` subsumes format checking — `format:check` does not need to be run separately.

**Toolchain architecture:**

| Tool                | Role                                                                       |
| ------------------- | -------------------------------------------------------------------------- |
| **Biome 2.x**       | Primary linter + formatter (Rust-native, ~10× faster than ESLint+Prettier) |
| **ESLint 9** (slim) | React-only rules: `react-compiler`, `react-hooks`, `react-refresh`         |
| **tsc**             | Type checking only                                                         |

See [docs/Toolchain-Architecture.md](docs/Toolchain-Architecture.md) for the full architecture reference and [docs/Biome-Migration-Roadmap.md](docs/Biome-Migration-Roadmap.md) for migration context.

### GitHub Actions CI

- **Primary merge gate:** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs on pull requests to `main` and on pushes to `main` / `develop` (lint, typecheck, unit tests with coverage, production build, Playwright E2E on Chromium + Firefox, blocking production dependency audit for HIGH/CRITICAL).
- **Experimental pipeline:** [.github/workflows/perf-optimized-ci.yml](.github/workflows/perf-optimized-ci.yml) runs **only** via `workflow_dispatch` (manual run in the Actions tab). It mirrors an optimized layout for benchmarks without triggering a second full CI on every push.
- **Local check:** `pnpm verify:basis` before opening or updating a PR; run `pnpm build` when anything affecting the production bundle or CI build steps changed.

Shared Node/pnpm install steps for several workflows live in [.github/actions/setup-node-pnpm/action.yml](.github/actions/setup-node-pnpm/action.yml).

### i18n

All user-facing text must be translated in both locales:

- [apps/web/src/locales/de.ts](apps/web/src/locales/de.ts) — German (**fallback locale** — always complete; missing keys fall back to German)
- [apps/web/src/locales/en.ts](apps/web/src/locales/en.ts) — English

Use `useTranslation()` hook, never hardcode strings. Both files must be updated simultaneously.

**Parity is CI-enforced (MED-08):** `apps/web/src/tests/i18n-sync.test.ts` recursively diffs the key paths of `en.ts` and `de.ts` and fails the unit-test gate on any drift (a key present in only one locale). A missing translation therefore breaks CI rather than silently falling back — add the key to **both** files.

### Accessibility (WCAG 2.2 AA)

- Semantic HTML (`<nav>`, `<main>`, `<button>`, etc.)
- ARIA labels on all interactive elements
- Focus-visible styles (`.focus-ring` utility)
- Keyboard navigation (Tab, Enter, Escape)
- Screen reader support (`aria-live` for real-time data)

### React Compiler Compliance

This project uses the **React Compiler** (`babel-plugin-react-compiler`) for automatic memoization.

- **Never add** `useMemo`, `useCallback`, or `memo()` unless you have confirmed the React Compiler cannot handle the specific case
- Run `pnpm lint` — `react-compiler/react-compiler` rule will flag any Compiler-incompatible patterns
- See [React Compiler docs](https://react.dev/learn/react-compiler) for the Rules of React

### Themes

5 themes are available (IDs: `ocean-dark`, `energy-dark`, `solar-light`, `minimal-white`, `nature-green`). Always use CSS variables (`var(--color-*)`) instead of hardcoded colors. See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

### Security

- **No API keys in source code or environment variables** — Use BYOK settings (`/settings/ai`)
- All AI keys are encrypted with AES-GCM 256-bit before IndexedDB storage
- Validate all external input, sanitize user data
- No `dangerouslySetInnerHTML` without sanitization

## Pull Request Process

1. Branch from the latest `main`
2. Create a focused branch such as `feat/my-feature`, `fix/my-bug`, or `docs/my-update`
3. Make your changes following the guidelines above
4. Ensure the staged local gate passes: `pnpm verify:basis`; run `pnpm build` when build/runtime paths changed
5. Commit with Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`, `perf:`, `ci:`

   Common scopes (optional; commitlint warns on unknown scopes):

   | Scope | Use for |
   |-------|---------|
   | `adapter` | Protocol adapters (general) |
   | `victron`, `knx`, `eebus`, `ocpp`, `modbus` | Protocol-specific adapter work |
   | `sankey`, `floorplan` | D3 Sankey / KNX floorplan (do not break) |
   | `store` | Zustand stores |
   | `ui`, `theme`, `settings` | Components, design tokens, settings |
   | `auth`, `db`, `tariff`, `ai`, `pwa` | Security, IndexedDB, tariffs, AI, offline |
   | `e2e`, `ci`, `deps`, `docker` | Tests, workflows, dependencies, containers |

   Omit scope when the change spans multiple areas: `feat: add backend WS health pill`.

   Examples:
   - `feat(adapter): add Zigbee2MQTT retry logic`
   - `fix(sankey): correct node label overlap at narrow viewport`
   - `docs(security): update PBKDF2 iterations to 600k`

6. Open a PR against `main`
7. Resolve all review threads and keep the branch up to date with `main`

## GitHub Codespaces

The fastest way to start contributing is via Codespaces:

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/qnbs/Nexus-HEMS-Dash?quickstart=1)

**Recommended machine type:** 4-core / 8 GB RAM

The dev container includes Node.js 24, pnpm, Playwright (Chromium), Docker, and all VS Code extensions. Dependencies are installed automatically via `postCreateCommand`.

### Codespaces Secrets

Optional secrets you can configure in your [Codespaces settings](https://github.com/settings/codespaces):

| Secret                    | Purpose                     | Required         |
| ------------------------- | --------------------------- | ---------------- |
| `TIBBER_API_TOKEN`        | Tibber tariff API access    | No               |
| `CHROMATIC_PROJECT_TOKEN` | Storybook visual regression | No (Maintainers) |
| `SENTRY_AUTH_TOKEN`       | Error reporting source maps | No (Maintainers) |

AI API keys (OpenAI, Anthropic, Gemini, etc.) are managed through the in-app BYOK Settings page with AES-GCM 256-bit encryption — never store them as environment variables.

### Forwarded Ports

| Port | Service                              | Auto-Forward |
| ---- | ------------------------------------ | ------------ |
| 5173 | Vite Dev Server                      | Notify       |
| 3000 | Backend Server (Express + WebSocket) | Silent       |
| 6006 | Storybook                            | Silent       |
| 9090 | Prometheus                           | Ignore       |

## Branching Strategy

- `main` is the protected production branch. Direct pushes, force pushes, and deletions are not part of the normal workflow.
- All work starts in a short-lived branch created from the latest `main`.
- Preferred branch prefixes: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`, `perf/`, `hotfix/`.
- Open a pull request back to `main` as soon as the change is reviewable. Draft PRs are encouraged for early feedback.
- Keep PRs focused. Large mixed PRs make Code Owner review, CodeQL findings, and release notes materially worse.

## Merge Strategy

- Squash merge is the default and recommended merge method.
- Rebase and merge is acceptable for a clean, already well-structured commit series.
- Merge commits should stay disabled on `main` to preserve linear history.
- This repository currently runs in a single-maintainer mode: approvals are optional and not a hard merge gate.
- **Merge readiness requires review quiescence** — see
  [`docs/runbooks/pr-review-correction-loop.md`](docs/runbooks/pr-review-correction-loop.md) §1.1.
  All actionable review comments from every bot (including nitpicks and CodeRabbit outside-diff
  range comments) must be fixed or explicitly declined with rationale and threads resolved
  before merge. Repeat correction loops until no new actionable comments appear on the latest SHA.
- If the maintainer team grows, re-enable required approvals and Code Owner review as a policy hardening step.

## Pull Request Expectations

- Target branch: always `main`
- Required status checks: primary workflow `ci.yml` (includes lint, typecheck, unit tests, build, E2E, security audit), plus additional workflows configured on the repo (e.g. Lighthouse, supply-chain scans). The optimized CI workflow is manual-only and is not part of the default push gate.
- **Required review hygiene (mandatory):** review **quiescence** before merge — zero unresolved conversations and zero unaddressed bot findings on the latest commit. Full checklist: `docs/runbooks/pr-review-correction-loop.md`.
- Copilot review may be auto-requested for draft PRs and subsequent pushes; treat it as an additional review signal

## Pull Request Feedback & Quality Checks

This repository uses a layered feedback system to make PR reviews fast, actionable, and educational. The full architecture (which tool owns which signal, and why) is in [`DEVOPS.md`](DEVOPS.md) and [ADR-027](docs/adr/ADR-027-layered-quality-platforms.md).

### Tooling overview

| Tool               | Role                                                | Blocking?                                                                  |
| ------------------ | --------------------------------------------------- | -------------------------------------------------------------------------- |
| **Biome + ESLint** | Lint, format, React rules                           | Yes                                                                        |
| **TypeScript**     | Strict type checking                                | Yes                                                                        |
| **DeepSource**     | Static analysis, secrets detection, coverage diff   | Advisory initially; JavaScript + Secrets will become required after tuning |
| **Codecov**        | Coverage %/delta vs base (flags: web, api)          | Advisory (`informational`); hard floor is `check-coverage-baseline.mjs`    |
| **CodeRabbit**     | AI contextual review (logic, architecture, tests)   | Advisory                                                                   |
| **CodeAnt.ai**     | AI-powered architectural / maintainability feedback | Advisory                                                                   |
| **Lighthouse CI**  | Performance, accessibility, PWA budgets             | Yes                                                                        |
| **Chromatic**      | Visual regression                                   | Yes (when configured)                                                      |

### When a check fails

1. Click the failing check in the PR checks tab.
2. Read the error message or inline annotation.
3. Find the matching runbook in `docs/runbooks/` or the central guide in `docs/PR-FEEDBACK-PLAYBOOK.md`.
4. Fix locally, push, and verify.
5. Resolve review threads once the check is green.

### Important safety rule

Never auto-apply lint, formatter, or AI suggestions to files involved in device control, command validation, adapters, auth, rate limits, or safety guardrails without explicit human review. See `docs/PR-FEEDBACK-PLAYBOOK.md` for the full autofix policy.

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix      | Usage                                  |
| ----------- | -------------------------------------- |
| `feat:`     | New feature                            |
| `fix:`      | Bug fix                                |
| `test:`     | Adding or updating tests               |
| `docs:`     | Documentation changes                  |
| `refactor:` | Code restructuring (no feature change) |
| `perf:`     | Performance improvement                |
| `chore:`    | Build, CI, dependency updates          |

## Architecture Decision Records (ADRs)

Major technical decisions are documented as ADRs in `docs/adr/`. When proposing a change that affects:

- State management approach
- New external dependency (>50 KB gzipped)
- Protocol adapter architecture
- Security model changes
- Build toolchain changes

Create an ADR using this template:

```markdown
# ADR-NNN: Title

**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** YYYY-MM-DD
**Context:** Why is this decision needed?
**Decision:** What was decided?
**Consequences:** What are the trade-offs?
```

## Testing Strategy

| Layer        | Tool                                         | Threshold                           | Focus                                                                                       |
| ------------ | -------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| **Unit**     | Vitest + jsdom                               | Web **78/72/70/80**; API **55/46/62/55** stmts/branches/fns/lines | Store, adapters, API routes; see `vitest.config.ts` + `coverage-baseline.json` |
| **E2E**      | Playwright (Chromium local; + Firefox in CI) | All specs pass                      | User flows, navigation, settings                                                            |
| **A11y**     | @axe-core/playwright                         | WCAG 2.2 AA on all routes           | Keyboard nav, contrast, ARIA                                                                |
| **Visual**   | Chromatic + Storybook                        | No unreviewed changes               | Component regression                                                                        |
| **Security** | security-fuzz.test.ts + CodeQL               | Zero critical/high in runtime       | Input validation, injection                                                                 |

**When to write tests:**

- New adapter → unit test for connect/disconnect/data-flow + E2E smoke
- New utility/service → unit tests covering the happy path, error branches, and edge cases
- New UI component → Storybook story + a11y check
- Bug fix → regression test proving the fix
- Security change → fuzz test + hardening test

**Test file map** (`apps/web/src/tests/`) — selected key files (50+ total):

| File                                 | Source module                                       | Focus                                            |
| ------------------------------------ | --------------------------------------------------- | ------------------------------------------------ |
| `circuit-breaker.test.ts`            | `apps/web/src/core/circuit-breaker.ts`              | FSM states, execute(), callbacks                 |
| `tariff-providers.test.ts`           | `apps/web/src/lib/tariff-providers.ts`              | §14a grid fees, peak hours, applyDynamicGridFees |
| `notifications.test.ts`              | `apps/web/src/lib/notifications.ts`                 | Quiet hours, cooldown windows                    |
| `energy-context.test.tsx`            | `apps/web/src/core/EnergyContext.tsx`               | Provider state, derived values                   |
| `energy-store.test.ts`               | `apps/web/src/core/useEnergyStore.ts`               | Adapter bridge, getState() contract              |
| `energy-controllers.test.ts`         | `apps/web/src/core/energy-controllers.ts`           | 8 control loop FSMs + ControllerPipeline         |
| `ev-v2g-controller.test.ts`          | `apps/web/src/core/energy-controllers.ts`           | V2G discharge loop, SOC guardrails               |
| `store.test.ts`                      | `apps/web/src/store.ts`                             | Zustand selectors, equality-skip guards          |
| `adapters.test.ts`                   | `apps/web/src/core/adapters/`                       | Protocol adapter contracts                       |
| `adapter-registry.test.ts`           | `apps/web/src/core/adapters/adapter-registry.ts`    | Registration, dynamic loading, lifecycle         |
| `plugin-system.test.ts`              | `apps/web/src/core/plugin-system.ts`                | OSGi-inspired plugin lifecycle                   |
| `homeassistant-mqtt-adapter.test.ts` | `apps/web/src/core/adapters/contrib/`               | HA MQTT adapter                                  |
| `matter-thread-adapter.test.ts`      | `apps/web/src/core/adapters/contrib/`               | Matter/Thread adapter                            |
| `zigbee2mqtt-adapter.test.ts`        | `apps/web/src/core/adapters/contrib/`               | Zigbee2MQTT adapter                              |
| `shelly-rest-adapter.test.ts`        | `apps/web/src/core/adapters/contrib/`               | Shelly REST adapter                              |
| `openadr-adapter.test.ts`            | `apps/web/src/core/adapters/contrib/openadr-3-1.ts` | OpenADR 3.1 VEN client, DR event handling        |
| `uc26-translator.test.ts`            | `apps/web/src/core/uc26-translator.ts`              | Matter↔OpenADR UC 2.6.1–2.6.3 translation        |
| `send-command.test.ts`               | `apps/web/src/core/command-safety.ts`               | OCPP/Victron pipeline, rate limiting             |
| `security-fuzz.test.ts`              | multiple                                            | Input validation, injection resistance           |
| `security-hardening.test.ts`         | multiple                                            | Rate limits, CSP, auth                           |
| `ai-keys.test.ts`                    | `apps/web/src/lib/ai-keys.ts`                       | AES-GCM 256-bit key vault                        |
| `optimizer.test.ts`                  | `apps/web/src/lib/optimizer.ts`                     | LP schedule optimizer                            |
| `mpc-optimizer.test.ts`              | `apps/web/src/lib/mpc-optimizer.ts`                 | EMHASS-inspired MPC                              |
| `predictive-ai.test.ts`              | `apps/web/src/lib/predictive-ai.ts`                 | AI forecast pipeline                             |
| `pdf-report.test.ts`                 | `apps/web/src/lib/pdf-report.ts`                    | PDF generation                                   |
| `sharing.test.ts`                    | `apps/web/src/lib/sharing.ts`                       | Export/share flows                               |

## Performance Budgets

| Metric              | Budget   | Enforcement           |
| ------------------- | -------- | --------------------- |
| Total JS (gzipped)  | ≤1120 KB | `pnpm size` in CI     |
| Total CSS (gzipped) | ≤25 KB   | `pnpm size` in CI     |
| Framework chunk     | ≤85 KB   | size-limit            |
| Vendor Recharts     | ≤110 KB  | size-limit            |
| FCP                 | ≤3000 ms | Lighthouse CI         |
| LCP                 | ≤4000 ms | Lighthouse CI         |
| TBT                 | ≤400 ms  | Lighthouse CI (error) |
| CLS                 | ≤0.1     | Lighthouse CI (error) |
| Perf score          | ≥85%     | Lighthouse CI         |
| A11y score          | ≥90%     | Lighthouse CI         |

## Adding a Backend Protocol Adapter

The backend (`apps/api/src/protocols/`) hosts server-side adapters that run on Edge hardware with
direct network access. These differ from frontend adapters:

```
Frontend Adapter (apps/web/src/core/adapters/)
  → Runs in browser
  → Connects via browser-accessible WebSocket / HTTP
  → Implements EnergyAdapter interface
  → Updates useEnergyStore

Backend Adapter (apps/api/src/protocols/)
  → Runs on Edge hardware (Raspberry Pi / Intel NUC)
  → Direct Modbus TCP, MQTT mTLS, serial port access
  → Implements IProtocolAdapter interface
  → Feeds EventBus → InfluxDB
```

### Architecture Flow

```mermaid
flowchart LR
  HW["Hardware\n(Inverter/Sensor)"]
  A["IProtocolAdapter\nimplements"]
  EB["EventBus\n500ms buffer"]
  TS["TimeseriesService\nInfluxDB write"]
  WS["WebSocket Gateway\nfiltered broadcast"]
  UI["React Dashboard"]

  HW -->|raw data| A
  A -->|UnifiedEnergyDatapoint| EB
  EB -->|batch flush| TS
  EB -->|live metrics| WS
  WS -->|JSON| UI
```

### Step-by-Step

1. **Create the adapter file** in `apps/api/src/protocols/<protocol>/MyAdapter.ts`

2. **Implement `IProtocolAdapter`** from `@nexus-hems/shared-types`:

   ```typescript
   import type {
     IProtocolAdapter,
     UnifiedEnergyDatapoint,
   } from "@nexus-hems/shared-types";

   export class MyAdapter implements IProtocolAdapter {
     readonly id = "my-adapter-01";
     readonly protocol = "modbus-sunspec" as const;

     async connect(): Promise<void> {
       /* ... */
     }
     async disconnect(): Promise<void> {
       /* ... */
     }
     async healthCheck(): Promise<AdapterHealth> {
       /* ... */
     }
     async *getDataStream(): AsyncGenerator<UnifiedEnergyDatapoint> {
       /* ... */
     }
   }
   ```

3. **Validate all datapoints** before emitting to the EventBus:

   ```typescript
   import { energyDatapointSchema } from "@nexus-hems/shared-types";
   const result = energyDatapointSchema.safeParse(rawData);
   if (!result.success) {
     /* route to DLQ */ return;
   }
   eventBus.emit(result.data);
   ```

4. **Register the adapter** in `apps/api/src/protocols/index.ts`

5. **Write unit tests** in `apps/api/src/protocols/<protocol>/MyAdapter.test.ts` mocking the
   hardware client

6. **Update `device-map.json`** if the adapter is Modbus-based

7. **Run the verification suite:**

   ```bash
   pnpm verify:basis
   ```

See [docs/Protocol-Adapter-Guide-Backend.md](docs/Protocol-Adapter-Guide-Backend.md) for the full
implementation reference including reconnect patterns, Dead-Letter Queue, and testing checklist.

---

## Security Advisory Process

If you discover a security vulnerability:

1. **Do NOT open a public issue** — this exposes active vulnerabilities
2. Use [GitHub Security Advisories](https://github.com/qnbs/Nexus-HEMS-Dash/security/advisories/new)
3. Include: affected component, CVSS estimate, reproduction steps, impact assessment
4. Maintainer response within SLA defined in [SECURITY.md](SECURITY.md)
5. A coordinated disclosure will follow after the patch is ready

Protocol-specific vulnerability severity guidelines are in `SECURITY.md` (SLA Matrix section).

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
