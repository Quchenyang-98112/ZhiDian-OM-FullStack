# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nexus-HEMS Dashboard is a production-grade, real-time Home Energy Management System dashboard. It consolidates 13 protocol adapters (7 core: Victron MQTT, Modbus/SunSpec, KNX, OCPP 2.1, EEBUS/SPINE, evcc, OpenEMS; 6 shipped contrib: Home Assistant, Matter/Thread, Zigbee2MQTT, Shelly, OpenADR 3.1, ExecAdapter; plus an Example contrib template) into a unified React 19 SPA served by an Express 5 backend. Deployable as PWA, Docker container, Tauri desktop app, Helm/Kubernetes release, or Capacitor mobile app. Current package version: `1.11.0`.

**Safety note:** This system controls safety-critical electrical hardware. No regulatory certification (VDE, IEC, CE) has been obtained. See `docs/Safety-Certification-Notice.md` before connecting to live hardware. Always use `ADAPTER_MODE=mock` for development; switch to `live` only after reviewing the pre-deployment checklist in that document.

The current shipped release line is **1.11.0**. Releases are **manual-only** (ADR-015 amended 2026-07-03). See [CHANGELOG.md](CHANGELOG.md), [docs/Release-History.md](docs/Release-History.md), and [docs/Technical-Debt-Registry.md](docs/Technical-Debt-Registry.md).

> ## ⚠️ Hardware Profile & Cloud-First CI Policy (read before running anything)
>
> **The maintainer's local machine is a low-end / RAM-constrained workstation.** Heavy or parallel work locally causes OOM kills, system lag, and stalled shells. This policy is non-negotiable; treat any deviation as a bug to fix.
>
> ### Hard rules (DO)
> 1. **Run local checks one at a time, sequentially.** No parallel `Bash` tool calls when the commands are heavyweight (linters, vitest, type-check, build, install, Playwright). One foreground command finishes before the next starts.
> 2. **Cloud-first for heavy gates.** Full `pnpm test:run`, `pnpm test:e2e` (any browser), `pnpm lighthouse`, full `pnpm test:coverage`, `pnpm build` of all packages, container image scans, and CodeQL/Scorecard runs are CI workflows. Trust those workflows; don't recreate them locally unless CI is unavailable or the user explicitly asks.
> 3. **Local loop is `type-check → lint → targeted tests` only.** Targeted means a single test file or a focused workspace (`pnpm --filter @nexus-hems/web exec vitest run path/to/foo.test.ts`), not the whole suite.
> 4. **Use generous timeouts** (180–300 s for vitest, ≥300 s for `pnpm install`, ≥600 s for `pnpm build`). Don't fight slow hardware with shorter timeouts.
> 5. **Use `--concurrent false` (or the equivalent) on every tool that supports it** — `lint-staged --concurrent false`, `turbo run --concurrency=1`, etc.
> 6. **For docs/config-only changes** (`*.md`, JSON/YAML configs not touching code paths), skip local heavy verification entirely and let cloud CI verify.
>
> ### Anti-patterns (DON'T)
> - Spawning multiple `Bash` calls or `Monitor` tasks in the same turn for unrelated commands.
> - Running `pnpm test:run` (full suite) locally to "make sure" — that's CI's job.
> - Running `pnpm lint`, `pnpm type-check`, `pnpm test`, and `pnpm build` in the same turn.
> - Using `run_in_background: true` for a long-running command and then starting another one before the first finishes.
> - Re-running the same heavy check after a small fix when CI will catch it on the next push.
>
> ### When in doubt
> Push the change, watch CI with `GH_PAGER=cat PAGER=cat gh run list --branch main --limit 5`, and iterate from CI logs. Cloud CPU/RAM is cheaper than the maintainer's machine, and CI runs everything on the project's actual baseline (Node 24 LTS, full deps).

**Repository structure:** pnpm workspace monorepo managed by Turborepo.

```
apps/api/        — @nexus-hems/api   — Express 5 backend (entry: apps/api/index.ts)
apps/web/        — @nexus-hems/web   — React 19 Vite SPA  (entry: apps/web/src/main.tsx)
packages/shared-types/ — @nexus-hems/shared-types — Zod schemas + inferred types
packages/ai-core/      — @nexus-hems/ai-core      — AI orchestrator, prompt-sanitizer, providers
```

## Commands

```bash
# Development (from repo root)
pnpm dev               # turbo dev → starts apps/api (port 3000) + apps/web (port 5173)
pnpm build             # turbo build → production builds for all packages
pnpm preview           # Preview apps/web production build

# Verification (staged; do not run heavyweight checks in parallel locally)
pnpm verify:basis      # turbo type-check lint test:run (full local gate)
pnpm type-check        # tsc --noEmit across all workspaces (strict mode)
pnpm lint              # turbo lint: per-package biome check (src/) + eslint --max-warnings 0
pnpm lint:all          # biome ci . — WHOLE-REPO gate (config/test/scripts too); blocking in CI (F-02)
pnpm lint:fix          # biome check --write + eslint --fix
pnpm format            # biome format --write apps/ packages/
pnpm format:check      # biome format apps/ packages/ (Biome 2.5 read-only)
pnpm check:adapters    # regenerate + diff-check the README adapter count (F-04 drift guard; blocking in CI)

# Testing
pnpm test:run          # All unit tests, one-shot
pnpm test:coverage     # With V8 coverage report
pnpm test:fuzz         # Security fuzz tests only
pnpm test:e2e          # Playwright (local Chromium-only; CI runs Chromium + Firefox)
pnpm test:e2e:ui       # Playwright interactive UI mode (for debugging E2E locally)
pnpm test:a11y         # Accessibility spec only

# Run a single test file (unit)
pnpm --filter @nexus-hems/web exec vitest run src/path/to/file.test.ts
pnpm --filter @nexus-hems/api exec vitest run src/path/to/file.test.ts

# Run a single E2E spec file
pnpm --filter @nexus-hems/web exec playwright test tests/e2e/accessibility.spec.ts

# Workspace-targeted scripts
pnpm --filter @nexus-hems/web <script>
pnpm --filter @nexus-hems/api <script>

# Docker
pnpm docker:build && pnpm docker:up   # Build and run on port 8080

# Storybook (component development, port 6006)
pnpm storybook         # Dev server
pnpm storybook:build   # Static build

# Bundle size check (enforced in CI)
pnpm size              # size-limit against gzipped bundles

# Capacitor mobile (config: apps/web/capacitor.config.ts)
pnpm --filter @nexus-hems/web cap:sync    # npx cap sync (sync web build → native shells)
pnpm --filter @nexus-hems/web cap:build   # pnpm build && npx cap sync

# Local prod-build smoke test + Vitest interactive UI (web only)
pnpm --filter @nexus-hems/web smoke:prod  # scripts/smoke-prod-build.mjs
pnpm --filter @nexus-hems/web test:ui     # vitest --ui
```

**Local verification order:** `type-check` → `lint` → targeted unit tests. Do not run heavy checks in parallel on local hardware. Full E2E/Lighthouse/security scans are CI-first; only run locally when CI is unavailable or explicitly requested.

**Playwright policy:** local `pnpm test:e2e` is intentionally Chromium-only. CI installs and runs Chromium + Firefox. For GitHub Pages route tests, always use base-relative navigation (`page.goto('./')`, `page.goto('./settings')`) — never `page.goto('/')` or `page.goto('/settings')`. The `baseURL` is `http://127.0.0.1:4173/Nexus-HEMS-Dash/`; an absolute path like `/settings` strips the base and lands on the wrong origin path.

**Writing new E2E tests:** Every `test.describe` block must call `await page.addInitScript(setupLocalStorage)` in `beforeEach` (imported from `./e2e-setup`). This seeds the persisted Zustand store with an empty state so tests start from a clean, known baseline.

**`VITE_E2E_TESTING`:** When `VITE_E2E_TESTING=true` is set at build time (both CI workflows do this), the service-worker `controllerchange` auto-reload in `main.tsx` is disabled. This prevents mid-test page reloads caused by the SW installing fresh in each browser context. Do not remove this guard.

## Architecture

### Monorepo Layout

| Package | Name | Description |
|---|---|---|
| `apps/api` | `@nexus-hems/api` | Express 5 + WebSocket backend. Entry: `apps/api/index.ts` → `apps/api/src/index.ts` |
| `apps/web` | `@nexus-hems/web` | React 19 Vite SPA. Entry: `apps/web/src/main.tsx` |
| `packages/shared-types` | `@nexus-hems/shared-types` | Zod schemas + TS types shared between api and web |
| `packages/ai-core` | `@nexus-hems/ai-core` | AI orchestration used by the web AI client — see **AI Core** below |

**Key monorepo files:** `pnpm-workspace.yaml` · `turbo.json` · `tsconfig.base.json` (ultra-strict root). Shared dependency versions are single-sourced in the pnpm **catalog** (`pnpm-workspace.yaml` `catalog:` — e.g. `react`, `zod`, `typescript`, `vitest`); reference them as `"vitest": "catalog:"`, don't hardcode versions in workspace `package.json`s.

In dev: `apps/web` (Vite, port 5173) proxies `/api/*`, `/metrics`, `/ws` → `apps/api` (Express, port 3000).

### Stack

React 19 · TypeScript ~5.8.3 (strict) · Vite 8.1 (Rolldown) · Tailwind CSS v4 · Zustand 5 · TanStack Query v5 · React Router DOM v7 · Dexie.js v4 · Express 5 · Zod · jose · MQTT · D3 + d3-sankey · Recharts · motion (Framer Motion successor) · Radix UI · Lucide React

### Dual Zustand Store Pattern (critical)

- **`useAppStore`** (`apps/web/src/store.ts`) — UI/settings with `persist` middleware → localStorage. Holds `EnergyData`, `FloorplanState`, `StoredSettings`, locale, theme.
- **`useEnergyStore`** (`apps/web/src/core/useEnergyStore.ts`) — adapter aggregation into `UnifiedEnergyModel`; no persistence. Synced back via `useAdapterBridge()`.
- Settings/UI state → `useAppStore`. Real-time energy data → `useEnergyStore`.
- Use `useAppStoreShallow` for multiple selectors — never two separate `useAppStore` calls in the same render path.

### Adapter System

All adapters implement `EnergyAdapter` interface (`apps/web/src/core/adapters/EnergyAdapter.ts`). Adapters extending `BaseAdapter` get circuit breaker, Zod validation, and reconnect logic for free.

**7 core adapters** (`apps/web/src/core/adapters/`):
- `VictronMQTTAdapter` — Victron Cerbo GX / Venus OS via MQTT-over-WebSocket
- `ModbusSunSpecAdapter` — SunSpec Models 103/124/201 via REST bridge. Register→scalar decoding lives in the shared `apps/web/src/core/sunspec-transforms.ts` (MED-12), used by **both** the main-thread adapter and the off-thread `adapter-worker.ts` so parity is a single code path (enforced by `sunspec-transform-parity.test.ts`). Change the transform there, not in two places.
- `KNXAdapter` — KNX/IP via knxd WebSocket bridge
- `OCPP21Adapter` — EV charging, V2X, ISO 15118, §14a EnWG
- `EEBUSAdapter` — EEBUS SPINE/SHIP, mDNS, TLS 1.3 mTLS
- `EvccAdapter` — evcc backend (95%+ hardware support) via REST + WebSocket
- `OpenEMSAdapter` — OpenEMS Edge via JSON-RPC 2.0 over WebSocket

**6 shipped contrib adapters** (`apps/web/src/core/adapters/contrib/`; plus `example-contrib.ts` template):
- `HomeAssistantMQTTAdapter`, `MatterThreadAdapter`, `Zigbee2MQTTAdapter`, `ShellyRESTAdapter`
- `OpenADR31Adapter` — OpenADR 3.1.0 VEN client for demand-response events
- `ExecAdapter` (`exec-adapter.ts`) — whitelisted custom script execution via the backend ExecService
- `ExampleContribAdapter` — template for custom adapter development

`AdapterRegistry` (`apps/web/src/core/adapters/adapter-registry.ts`) handles three registration paths:
```typescript
registerAdapter('my-adapter', (config) => new MyAdapter(config));  // static
await loadContribAdapter('homeassistant-mqtt');                      // dynamic
const ids = await loadAllContribAdapters();                         // load all contrib
```

Plugin lifecycle (OSGi-inspired): install → resolve → start → stop → uninstall. Hot-loading from Settings UI supported. Activation timeout: 10 s. External adapters should export `{ id, factory }` or register through the local adapter registry; do not document a non-existent `@nexus-hems/adapter-registry` package.

**Adapter-count drift guard (F-04):** the README's "13 adapters (7 core + 6 contrib)" is generated between `<!-- ADAPTERS-EN/DE:START -->` markers from `registerBuiltinAdapters()` call sites + `contrib/*.ts` (minus `example-contrib`). After adding/removing an adapter, run `pnpm sync:adapters` and commit — CI's `pnpm check:adapters` fails on stale markers. Don't hand-edit the count.

### Key Infrastructure

- **Circuit Breaker** (`apps/web/src/core/circuit-breaker.ts`): FSM CLOSED → OPEN → HALF_OPEN. Failure threshold 5, cooldown 30 s, half-open success threshold 2. Built into BaseAdapter.
- **Command Safety** (`apps/web/src/core/command-safety.ts`): All hardware commands go through Zod schema validation, rate limiting (30 cmd/min), IndexedDB audit trail.
- **Web Workers**: AI inference (`ai-worker.ts`), Sankey layout (`sankey-worker.ts`), REST polling (`adapter-worker.ts`, SSRF-hardened URL allowlist).
- **MPC Optimizer** (`apps/web/src/lib/optimizer.ts`): EMHASS-inspired LP day-ahead scheduler with PV/load forecasting, battery constraints, tariff-aware cost minimization.
- **AI Client** (`apps/web/src/core/aiClient.ts`): thin web wrapper over **`@nexus-hems/ai-core`** (`packages/ai-core`). API keys encrypted AES-GCM 256-bit in IndexedDB via `apps/web/src/lib/ai-keys.ts` — never in env vars or plain text.
- **AI Core** (`packages/ai-core`): the provider-agnostic AI layer — `UnifiedAIOrchestrator` (`orchestrator.ts`) with a fallback chain, cloud providers (OpenAI/Anthropic/Gemini/…), and the non-destructive `prompt-sanitizer.ts` (`sanitizeRequest` returns `{ request, verdict }`; PII redaction + injection **flagging**, fails closed on oversized `context`). **Local in-browser LLM engines (WebLLM/Transformers.js/ONNX) are deferred (ADR-029):** their `isAvailable()` returns `false` unless `VITE_ENABLE_LOCAL_LLM=true`, and their heavy runtime packages are intentionally NOT in `dependencies` — do not re-add them or wire a resolver without an ADR (would reopen the `unsafe-inline`-free CSP). Default AI path is the local heuristic engine.
- **Shared Types** (`packages/shared-types/src/protocol.ts`): Zod schemas for `EnergyData`, `WSCommand`, `AuthToken`, `UnifiedEnergyModel`, etc. Import as `@nexus-hems/shared-types`.
- **VPP Service** (`apps/web/src/core/vpp-service.ts`): Virtual Power Plant aggregation per UC 2.6.2 / VDE-AR-E 2829-6 — composes flex offers from battery/EV/heat-pump, submits via OpenADR 3.1 API proxy.
- **UC26 Translator** (`apps/web/src/core/uc26-translator.ts`): Matter↔OpenADR 3.1 interworking (UC 2.6.1–2.6.3) — translates DR events to Matter DEM cluster commands.

### App Shell Structure

`AppShell` (`apps/web/src/components/layout/AppShell.tsx`) renders a `<main id="main-content">` that wraps all route content. All page components render their `<h1>` inside this element via `PageHeader`. E2E tests should use `page.locator('#main-content h1')` to target page-specific headings rather than a bare `h1` selector.

The app has no onboarding gate — `AppShell` renders directly without any `inert`/overlay mechanism. New users land directly on `CommandHub`.

The app header is `position: fixed` with a JS-measured `--header-height` CSS variable driving the matching top padding on the content column (fixes a scroll-away regression where a custom `@layer utilities` rule in `index.css` could override Tailwind's `sticky`/`fixed` by source order). Do not switch the header back to `sticky`/`relative`, and be careful adding position utilities in `index.css` `@layer utilities` — they can silently win over Tailwind classes.

### Server

- `apps/api/index.ts` thin wrapper → `startServer()` in `apps/api/src/index.ts`
- All routes are Express Router factories (`createXxxRoutes()`) mounted via `app.use()`
- `requireJWT` protects all endpoints except `/api/health`
- JWT utilities: `apps/api/src/jwt-utils.ts`
- `ADAPTER_MODE=mock|live` controls mock vs live adapter data (default: `mock`; live requires `ALLOW_LIVE_HARDWARE=true`)
- `READ_ONLY_MODE=true` (SAF-05) globally blocks **all** hardware control commands at both the API (WebSocket, `apps/api/src/ws/energy.ws.ts`) and frontend (`command-safety.ts`) levels, regardless of scope or adapter config — for certification-grade deployments, incident investigation, and commissioning. Helpers: `isReadOnlyMode()` (`apps/api/src/config/read-only-mode.ts`), `isReadOnlyModeActive()` (`apps/web/src/lib/adapter-mode.ts`). Blocked commands log the `rejected_readonly` audit outcome.
- **OCPP Security Profile 3 mTLS proxy:** the browser never holds CSMS client certificates. The web client POSTs mTLS credentials to `POST /api/ocpp/proxy-session` (`ocpp.routes.ts`) over HTTPS+JWT, receiving a single-use session id (`ocpp-session-store.ts`); it then opens `/ws/ocpp?ticket=<uuid>&session=<uuid>` (`ws/ocpp-proxy.ws.ts`) with a single-use WS ticket (**readwrite** scope minimum). The server consumes the session, enforces the target is a **private/local host** (`isPrivateHost`), opens the mTLS `wss://` upstream (`OcppProxyRelay.ts`, TLS ≥1.2, `rejectUnauthorized`), and relays frames bidirectionally. Frontend helpers: `apps/web/src/lib/ocpp-proxy.ts`.
- **CSP nonce (AUD-02):** production Helmet + nginx drop `style-src 'unsafe-inline'`. `apps/api/src/config/csp-nonce.ts` extracts the Vite build-time nonce from `index.html` and builds `style-src`/`script-src` with `'nonce-…'`; keep the Tauri CSP in sync via `apps/web/scripts/sync-tauri-csp.ts` (guarded by `tauri-csp.test.ts`).
- Production requires `JWT_SECRET`, `API_KEYS`, `WS_ORIGINS` env vars

### Backend Protocol Adapters

Distinct from the frontend adapter system. Lives in `apps/api/src/protocols/` and runs on edge hardware (Raspberry Pi / NUC) with direct network access.

Data flow: `Hardware → IProtocolAdapter → EventBus (500ms buffer) → InfluxDB + LiveEnergyAggregator → WebSocket Gateway → React UI`

- Implement `IProtocolAdapter` from `@nexus-hems/shared-types` (not `EnergyAdapter` — that's the frontend interface)
- Validate every datapoint with `energyDatapointSchema.safeParse()` before emitting; route failures to Dead-Letter Queue
- Register adapters in `apps/api/src/protocols/index.ts`
- Modbus-based adapters must also update `device-map.json`
- **EventBus → WebSocket bridge (HIGH-17, ADR-018):** `LiveEnergyAggregator` (`apps/api/src/services/LiveEnergyAggregator.ts`) subscribes to the EventBus and folds metric-centric, role-tagged `UnifiedEnergyDatapoint`s into the role-centric `EnergyData` snapshot the browser consumes. `energy.ws.ts` (`resolveBroadcastData()`) broadcasts that snapshot only when the effective adapter mode is `live` **and** fresh live data exists (30 s window); otherwise it falls back to the mock stream. Untagged/unmapped datapoints still flow to InfluxDB + the optimizer but do not reach the UI.
- **Per-adapter metrics (MED-18):** `apps/api/src/middleware/adapter-metrics.ts` exposes per-adapter Prometheus counters/gauges via `/metrics` (`metrics.routes.ts`).
- See `docs/Protocol-Adapter-Guide-Backend.md` for reconnect patterns, DLQ, and full testing checklist

### React Compiler

Auto-memoization via `babel-plugin-react-compiler`. Never add manual `useCallback`/`useMemo` unless confirmed React Compiler cannot handle the case.

## Toolchain Rules

**Biome 2.5.2 is the primary linter and formatter.** ESLint is retained only for React plugins Biome cannot replace: `react-compiler/react-compiler`, `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`, `react-refresh/only-export-components`.

**Do NOT re-add:** `prettier`, `prettier-plugin-tailwindcss`, `eslint-plugin-prettier`, `eslint-config-prettier`, `@eslint/js`, `typescript-eslint`, `@typescript-eslint/*`, `globals`, `eslint-plugin-react`.

Biome settings: line width 100, 2-space indent, LF, single quotes, trailing commas, semicolons always. `noExplicitAny`: error — use `unknown`, precise interfaces, or discriminated unions instead.

Current enforced coverage thresholds are package-specific:
- `apps/web/vitest.config.ts`: 78 statements / 72 branches / 70 functions / 80 lines (PRF-03 baseline)
- `apps/api/vitest.config.ts`: 55 statements / 46 branches / 62 functions / 55 lines (P1-05 staged raise from the v1.3.0 33% baseline)
- `packages/ai-core/vitest.config.ts`: 73 statements / 51 branches / 77 functions / 73 lines (F-05a baseline)
- The hard floor is `scripts/check-coverage-baseline.mjs <workspaceDir…>` (`pnpm check:coverage-baseline` guards **web + ai-core**, each with a committed `coverage-baseline.json`); Codecov never blocks. `docs/Testing-Coverage-Strategy.md` holds the higher staged roadmap targets — do not assume those are already enforced in config. Never lower a threshold to make a change pass.

Biome 2.5.2 note: use `biome format apps/ packages/` for the read-only `format:check` script. Do not use `biome format --write=false`; this version rejects that flag/value combination.

Use `pnpm.overrides` (never top-level `"overrides"`) for dependency overrides. Keep `pnpm.onlyBuiltDependencies` in sync with approved native/postinstall packages (`@google/genai`, `esbuild`, `better-sqlite3`, serialport bindings, `core-js`, `protobufjs`, and all `@rolldown/binding-*` platform packages).

## Critical Constraints

- **Never break** `SankeyDiagram.tsx` (D3 Sankey energy flow) or `Floorplan.tsx` (KNX floorplan).
- **Never introduce** Redux, MobX, or alternative state libraries.
- **Never use** Tailwind v3 syntax (`@apply` in arbitrary selectors, `tailwind.config.js` as sole config) — use Tailwind v4 `@theme` / `@import 'tailwindcss'` syntax.
- **Never store** API keys in env vars or unencrypted.
- **Never skip i18n** — every user-visible string uses `t()`. Author English copy in `en.ts` first, then `de.ts` (German is the runtime fallback locale). No inline German/English `t('key', 'fallback')` strings in components — keys only.
- **Never remove** accessibility features. WCAG 2.2 AA mandatory. `type="button"` on all non-submit buttons; `aria-hidden` on decorative icons.
- All lazy-loaded pages use `React.lazy` + `Suspense`.

## Unified App Sections

8 primary routes across 7 navigation sections (legacy routes redirect to unified equivalents):

| Route | Page | Description |
|---|---|---|
| `/` | `CommandHub` | KPI cards, mini Sankey, quick-nav |
| `/energy-flow` | `LiveEnergyFlow` | Full Sankey + production/storage/grid tabs |
| `/devices` | `DevicesAutomation` | EV/OCPP, floorplan, controllers, plugins |
| `/optimization-ai` | `OptimizationAI` | MPC optimizer, schedules, AI forecast |
| `/tariffs` | `TariffsPage` | Live prices, tariff comparison, cost analytics |
| `/analytics` | `Analytics` | Historical charts, export/sharing |
| `/monitoring` | `Monitoring` | Adapter status, circuit breakers, system health |
| `/settings` | `SettingsUnified` | Config, adapters, language, theme |
| `/plugins` | `PluginsPage` | Adapter plugin browser & hot-loading (SettingsLayout) |
| `/settings/ai` | `AISettingsPage` | AI provider keys & model config (SettingsLayout) |
| `/settings/hardware` | `HardwareRegistryPage` | Hardware registry browser + add-adapter wizard (MED-19); legacy `/hardware` redirects here |
| `/help` | `Help` | Docs, FAQ, about, AI acknowledgments (SettingsLayout) |

## Design System

5 themes in `apps/web/src/design-tokens.ts`: `energy-dark`, `solar-light`, `ocean-dark` (default), `nature-green`, `minimal-white`. CSS custom properties via Tailwind v4 `@theme` in `apps/web/src/index.css`. Brand utilities: `glass-panel`, `neon-glow-green/blue/orange`, `energy-pulse`, `focus-ring`. See `DESIGN-SYSTEM.md` for full catalog.

Prefer the branded selector primitives over raw native controls: `ChoiceCardGroup`, `SelectField`, `Disclosure`, and `SgReadyModeSelector` (`apps/web/src/components/ui/`) replaced the gray native `<select>`/radio pickers across settings and wizards (#200/#201). Reach for these when adding new option/toggle UIs so the theme and a11y wiring stay consistent.

## Performance Budgets

Enforced by `pnpm size` (size-limit) and Lighthouse CI. Do not exceed:

| Metric | Budget |
|---|---|
| Total JS (gzipped) | ≤ 1130 KB |
| Total CSS (gzipped) | ≤ 27 KB |
| Framework chunk | ≤ 85 KB |
| Vendor Recharts | ≤ 110 KB |
| FCP | ≤ 3000 ms |
| LCP | ≤ 4000 ms |
| TBT | ≤ 400 ms (Lighthouse error) |
| CLS | ≤ 0.1 (Lighthouse error) |
| Perf score | ≥ 85% |
| A11y score | ≥ 90% |

## Commit Convention

Conventional Commits enforced by commitlint. Types: `feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert, security, a11y, i18n`. Scopes include: `sankey, floorplan, adapter, victron, knx, eebus, ocpp, modbus, tariff, ai, pwa, store, ui, settings, auth, db, e2e, deps, docker, ci, theme`.

**Create an ADR** (`docs/adr/ADR-NNN-title.md`) when a change affects: state management approach, new external dependency >50 KB gzipped, protocol adapter architecture, security model, or build toolchain.

**Releases are manual-only** (ADR-015 amended 2026-07-03). `release.yml` runs semantic-release on **manual workflow dispatch only** — never on `push → main` (auto-release caused version churn: three releases in one evening). All version fields (root/workspace/Tauri `package.json`, `helm/nexus-hems/Chart.yaml`) must stay in sync; `.releaserc.json` commits them together. Desktop binaries are owned solely by `tauri-build.yml`. Do not re-enable push-triggered releases. Canonical timeline + incident log: `docs/Release-History.md`.

## Workflow for Every Change

1. Read relevant files before modifying: affected components, adapter interfaces, both Zustand stores.
2. Implement changes following all rules above.
3. Add/update i18n keys in both `apps/web/src/locales/en.ts` and `apps/web/src/locales/de.ts`.
4. Verify with staged, non-parallel checks: `time pnpm type-check` → `pnpm lint` → targeted tests. For docs/config-only changes, prefer targeted Markdown/diff checks plus CI instead of exhausting local hardware.
5. **Before merge:** reach **review quiescence** on the PR — every actionable bot/human comment (including nitpicks and CodeRabbit outside-diff items) fixed or declined; loop until no new actionable comments on the latest SHA. Canonical process: `docs/runbooks/pr-review-correction-loop.md`.

When CI is the source of truth, push focused commits and monitor GitHub Actions with non-interactive `gh` commands (`GH_PAGER=cat PAGER=cat gh run view ...`). Avoid terminal UI commands such as `gh run watch` in this workspace because they can leave control sequences in the shell.

**GitHub operations:** Prefer the authenticated `gh` CLI over GitHub MCP tools (e.g. `create_pull_request`) when creating PRs, issues, or comments. The MCP integration can fail with authentication errors in this environment, while `gh` uses the local keyring token.

## Key Docs

- [`docs/README.md`](docs/README.md) — **documentation hub**: index of all docs by task + the canonical status legend; start here
- [`docs/Environment-Variables.md`](docs/Environment-Variables.md) — every env var (scope · default · required); pairs with `.env.example`
- [`docs/Developer-Scripts-Reference.md`](docs/Developer-Scripts-Reference.md) — what each npm/pnpm script does
- `AGENTS.md` — Cursor Cloud agent VM specifics (complements this file)
- `FEATURE_STATUS.md` — shipped vs partial vs planned feature matrix
- `docs/Technical-Debt-Registry.md` — canonical debt/backlog tracker
- `docs/Release-History.md` — canonical tag timeline + manual-release procedure (ADR-015)
- `docs/Manual-Workflow-Triggers.md` — how to dispatch release/Tauri/heavy CI workflows by hand
- `docs/Safety-Certification-Notice.md` — **read before live hardware** — safety hazards, certification status, mock-vs-live delta, Tauri updater guide
- `docs/Adapter-Dev-Guide.md` — how to write new frontend adapters
- `docs/Protocol-Adapter-Guide-Backend.md` — backend `IProtocolAdapter` implementation guide
- `docs/Toolchain-Architecture.md` — living toolchain reference
- `docs/Security-Architecture.md` — threat model, STRIDE, GDPR
- `docs/Deployment-Guide.md` — Docker/Helm/Tauri deployment
- `DEVOPS.md` — CI/CD + code-quality-platform layering (see below)

## Code-Quality Platforms

Quality feedback is layered (full matrix + ownership in `DEVOPS.md`, ADR-027):

- **Blocking (Layer 1):** `ci.yml` (lint, type-check, unit tests + `check-coverage-baseline.mjs`, build, size, E2E, fuzz) and `security-full.yml` (single CodeQL/Semgrep, Gitleaks, dep audit). These alone gate merges.
- **Advisory signals (Layer 2):** **DeepSource** (`.deepsource.toml`) + **Codecov** (`.codecov.yml`, `informational`, flags web/api). The hard coverage floor stays `check-coverage-baseline.mjs` — Codecov never blocks.
- **Advisory AI review (Layer 3):** **CodeRabbit** (`.coderabbit.yaml`) + **CodeAnt.ai** (`.codeant/`). Analyzers are de-duplicated so each signal has one owner.

When acting on any platform's findings: never auto-apply fixes to control logic, adapters, auth, rate limits, or safety guardrails — surface for human review. Dependency updates: **Renovate** owns npm/docker/cargo, **Dependabot** owns github-actions only. Never re-add a duplicate CodeQL/Semgrep/Scorecard definition — they are single-sourced (`security-full.yml` / `scorecard.yml`).

## graphify

This project has a graphify knowledge graph at graphify-out/.

### Quick Start

```bash
# Generate the knowledge graph (AST-only, no API cost)
pnpm graphify .

# Or use the full pipeline directly
python -c "
import json
from graphify.detect import detect
from graphify.extract import collect_files, extract
from graphify.build import build_from_json
from graphify.cluster import cluster
from graphify.analyze import god_nodes, surprising_connections
from graphify.report import generate
from pathlib import Path

# Detect files
result = detect(Path('.'))
code_files = []
for f in result.get('files', {}).get('code', []):
    p = Path(f)
    code_files.extend(collect_files(p) if p.is_dir() else [p])

# Extract AST
extraction = extract(code_files) if code_files else {'nodes': [], 'edges': []}

# Build and cluster
G = build_from_json(extraction)
communities = cluster(G)
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

# Generate report. graphifyy 0.9.2 signature: (..., detection_result, token_cost, root)
# detection_result must be the detect() output (has total_files/total_words/warning).
report = generate(G, communities, {}, {}, gods, surprises, result, {}, '.')
Path('graphify-out/GRAPH_REPORT.md').write_text(report)
Path('graphify-out/graph.json').write_text(json.dumps({'nodes': extraction['nodes'], 'edges': extraction['edges']}, indent=2))
print(f'Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities')
"
```

### Rules

- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

### Safety-Critical Analysis

The knowledge graph helps identify:
- **Control paths**: Trace energy flow from sensors → controllers → actuators
- **Danger commands**: All hardware commands requiring user confirmation
- **Adapter interfaces**: Protocol adapter contracts and implementations
- **Safety guardrails**: Validation points in the command chain
- **God nodes**: Architectural hotspots that may need refactoring
