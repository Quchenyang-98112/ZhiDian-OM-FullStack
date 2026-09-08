# AGENTS.md

Quick-reference for AI coding agents working on **Nexus-HEMS Dashboard**.  
For the full architectural rulebook, read [`CLAUDE.md`](CLAUDE.md) first; this file adds a project-wide orientation and agent-specific notes.

---

## 1. Project overview

**Nexus-HEMS Dashboard** (`v1.11.0`) is a production-oriented, real-time Home Energy Management System dashboard. It consolidates **13 protocol adapters** (7 core + 6 contrib) into a unified React 19 SPA served by an Express 5 backend.

It is a **pnpm + Turborepo monorepo** with three workspaces:

| Path | Package | Runtime | Entry point |
|---|---|---|---|
| `apps/api` | `@nexus-hems/api` | Express 5 + WebSocket (port 3000) | `apps/api/index.ts` → `apps/api/src/index.ts` |
| `apps/web` | `@nexus-hems/web` | React 19 + Vite 8 SPA (port 5173 in dev) | `apps/web/index.html` → `apps/web/src/main.tsx` |
| `packages/shared-types` | `@nexus-hems/shared-types` | Zod schemas + TypeScript types (no build artifact) | `packages/shared-types/src/index.ts` |

> **Safety note:** This project controls safety-critical electrical hardware. No regulatory certification (VDE, IEC, CE) has been obtained. Always keep `ADAPTER_MODE=mock` for development; enable `live` only after reading [`docs/Safety-Certification-Notice.md`](docs/Safety-Certification-Notice.md).

---

## 2. Language policy (mandatory)

**English only** for all repository output, regardless of the human's chat language:

| Surface | Rule |
|---|---|
| User-facing UI copy | `t()` keys in `apps/web/src/locales/en.ts` / `de.ts` — **author `en.ts` first**; German is the i18n fallback locale, not the authoring language. |
| Commit messages | English, [Conventional Commits](https://www.conventionalcommits.org/). |
| PR titles & bodies | English. |
| Code comments & JSDoc | English. |
| New docs & ADRs | English (unless an existing doc is explicitly DE-only). |

Do not embed German (or other) inline `t('key', 'fallback')` strings in components. Do not write German commit messages because the prompt was in German.

---

## 3. Repository layout & key configuration files

### Monorepo orchestration

| File | Purpose |
|---|---|
| `package.json` | Root manifest; defines shared scripts, `packageManager: "pnpm@10.34.4"`, `pnpm.overrides`, `engines`. |
| `pnpm-workspace.yaml` | Workspaces `apps/*` and `packages/*`; pnpm **catalog** for shared dependency versions (`react`, `react-dom`, `typescript`, `zod`, `jose`, `mqtt`, `tsx`, `@types/node`). |
| `turbo.json` | Turborepo task graph (`build`, `dev`, `type-check`, `lint`, `test:run`, `test:e2e`, `size`, etc.). |
| `tsconfig.base.json` | Ultra-strict base: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals`, `declarationMap`, `sourceMap`. |
| `biome.json` | Primary linter/formatter (Biome 2.5.2): line width 100, 2-space indent, LF, single quotes, trailing commas, semicolons always; a11y rules; `noExplicitAny: error`; sorted Tailwind classes. |
| `eslint.config.js` | React-only supplemental rules (`react-compiler`, `react-hooks`, `react-refresh`) for `apps/web/src/**/*.tsx`. Biome handles everything else. |
| `commitlint.config.js` | Conventional Commits with project types (`feat`, `fix`, `security`, `a11y`, `i18n`, …) and scopes (`sankey`, `floorplan`, `adapter`, `ocpp`, `eebus`, `ui`, …). |
| `lint-staged.config.js` | Staged `biome check --write` for TS/TSX; ESLint --fix for web TSX; Biome format for JSON/CSS/YAML in `apps/` / `packages/`. |
| `.nvmrc` | Node 24 (two lines, both `24`). |
| `.npmrc` | `engine-strict=true`, `strict-peer-dependencies=true`, `prefer-frozen-lockfile=true`, `package-manager-strict=true`, `prefer-workspace-packages=true`, hoisting enabled. |
| `.releaserc.json` | Manual semantic-release config; syncs version across root, workspace, Tauri, and Helm manifests. |

### Per-workspace key files

| Workspace | Config files |
|---|---|
| `apps/api` | `package.json`, `tsconfig.json` (NodeNext, `outDir: dist`), `vitest.config.ts` (Node env, coverage thresholds). |
| `apps/web` | `package.json`, `vite.config.ts`, `tsconfig.json` (bundler, `jsx: react-jsx`), `vitest.config.ts` (jsdom, React Compiler), `playwright.config.ts`, `tailwind.config.ts`, `lighthouserc.json`, `capacitor.config.ts`, `.storybook/main.ts`, `src-tauri/tauri.conf.json` + `Cargo.toml`. |
| `packages/shared-types` | `package.json`, `tsconfig.json` (`noEmit: true`, `allowImportingTsExtensions: true`, exports `./src/index.ts`). |

---

## 4. Technology stack

| Layer | Choices |
|---|---|
| Language | TypeScript ~5.8.3 (strict), ESM only (`"type": "module"`). |
| Runtime | Node.js 24 LTS production baseline; minimum `>=22.22.1`. |
| Package manager | pnpm 10.34.4 via Corepack. |
| Frontend framework | React 19.2.7, React Router DOM v7, TanStack Query v5, Zustand 5. |
| Build tool | Vite 8 (Rolldown), `vite-plugin-pwa`, React Compiler via `@rolldown/plugin-babel`. |
| Styling | Tailwind CSS v4 (`@import 'tailwindcss'` in `apps/web/src/index.css`), design tokens in `apps/web/src/design-tokens.ts`. |
| Charts / viz | D3 + `d3-sankey`, Recharts, Motion (Framer Motion successor). |
| UI primitives | Radix UI, Lucide React, Sonner toasts. |
| Storage | Dexie.js v4 (IndexedDB), localStorage for persisted app settings. |
| Backend | Express 5.2.1, `ws`, `jose`, `helmet`, `express-rate-limit`, `cors`, `zod`. |
| Protocols | MQTT, Modbus TCP (`modbus-serial`), InfluxDB v2 client, Redis (`ioredis`). |
| Testing | Vitest v4, `@vitest/coverage-v8`, Playwright, `@axe-core/playwright`, `fast-check`, `supertest`. |
| Tooling | Biome 2.5.2, ESLint 9 (React-only), Husky, lint-staged, semantic-release. |

---

## 5. Development environment

```bash
# One-time
corepack enable

# Install
pnpm install

# Start both dev servers
pnpm dev
```

- `apps/api` runs on **http://localhost:3000** (`tsx --watch index.ts`).
- `apps/web` runs on **http://localhost:5173** and proxies `/api/*`, `/metrics`, `/ws` to the API.
- **No `.env` is required for dev.** The API auto-generates a JWT secret per run and allows anonymous access; adapters default to mock mode.
- Verify health:
  ```bash
  curl http://localhost:3000/api/health
  curl http://localhost:5173/api/health
  ```
  Expected JSON contains `{"status":"healthy","mode":"mock",...}`.

> **Harmless startup noise:** the API may log `ValidationError: ... ERR_ERL_KEY_GEN_IPV6` from `express-rate-limit`. It is non-fatal; the server still starts.

---

## 6. Build, test and lint commands

All commands run from the repository root unless noted.

### Development & build

| Command | What it does |
|---|---|
| `pnpm dev` | Turbo starts `apps/api` + `apps/web` concurrently. |
| `pnpm build` | Turbo builds all workspaces in dependency order. |
| `pnpm preview` | Preview the production web build. |
| `pnpm start` | Start the built API (`node dist/index.js`). |
| `pnpm clean` | Remove `dist/` directories. |

### Verification

| Command | What it does |
|---|---|
| `pnpm type-check` | `tsc --noEmit` across all workspaces. |
| `pnpm lint` | Biome check + ESLint (read-only, zero warnings). |
| `pnpm lint:fix` | Biome check --write + ESLint --fix. |
| `pnpm format` | Turbo format --write. |
| `pnpm format:check` | Biome format read-only over `apps/` and `packages/`. |
| `pnpm verify:basis` | `turbo type-check lint test:run` (full local gate). |

### Testing

| Command | Scope |
|---|---|
| `pnpm test` | Vitest watch mode across workspaces. |
| `pnpm test:run` | All unit tests, one-shot. |
| `pnpm test:coverage` | Web V8 coverage report only (`apps/web`). |
| `pnpm test:fuzz` | Security fuzz tests (`apps/web/src/tests/security-fuzz.test.ts`). |
| `pnpm test:e2e` | Playwright E2E, **Chromium only** locally. |
| `pnpm test:e2e:ui` | Playwright interactive UI mode. |
| `pnpm test:a11y` | Playwright accessibility spec only. |

### Targeted testing

```bash
# Single web unit test
pnpm --filter @nexus-hems/web exec vitest run src/path/to/file.test.ts

# Single API unit test
pnpm --filter @nexus-hems/api exec vitest run src/path/to/file.test.ts

# Single E2E spec
pnpm --filter @nexus-hems/web exec playwright test tests/e2e/accessibility.spec.ts
```

### Other useful commands

| Command | Purpose |
|---|---|
| `pnpm size` | Enforce gzipped bundle budgets via `@size-limit/file`. |
| `pnpm lighthouse` | Lighthouse CI (`apps/web/lighthouserc.json`). |
| `pnpm storybook` | Storybook dev server on port 6006. |
| `pnpm storybook:build` | Static Storybook build. |
| `pnpm docker:build` | Build the frontend Docker image. |
| `pnpm docker:up` | Run `docker compose up -d`. |
| `pnpm security:trojan` | Anti-Trojan-Source scan of first-party TS/JS. |
| `pnpm security:secrets` | Gitleaks wrapper (native/Docker preferred, limited regex fallback). |
| `pnpm release` | Manual semantic-release (workflow is `workflow_dispatch` only). |

### Local verification order

Prefer a staged, non-parallel loop:

```bash
pnpm type-check
pnpm lint
# then targeted unit tests only
```

Heavy gates (full `test:run`, E2E, Lighthouse, image scans) are **cloud-first**; run them locally only when CI is unavailable or explicitly requested. See the "Hardware Profile & Cloud-First CI Policy" in `CLAUDE.md`.

---

## 7. Code style & conventions

### Linting and formatting

- **Biome 2.5.2** is the single source of truth for formatting and most linting.
- **ESLint** is kept only for React-specific rules (`react-compiler/react-compiler`, `react-hooks/*`, `react-refresh/only-export-components`).
- Do **not** re-add Prettier, `typescript-eslint`, `@typescript-eslint/*`, `eslint-plugin-react`, etc.
- Key Biome settings: line width 100, 2-space spaces, LF, single quotes, trailing commas, semicolons always; `noExplicitAny: error`; complexity cap 25; sorted Tailwind classes via `useSortedClasses`.

### TypeScript

- All packages extend `tsconfig.base.json` and run in **strict mode**.
- Avoid `any`; use `unknown`, precise interfaces, or discriminated unions.
- `apps/api` uses `NodeNext` module resolution; `apps/web` uses `bundler` resolution with `@/*` alias.

### Commits

- Conventional Commits are enforced by Husky + commitlint.
- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `security`, `a11y`, `i18n`.
- Scopes include: `sankey`, `floorplan`, `adapter`, `victron`, `knx`, `eebus`, `ocpp`, `modbus`, `tariff`, `ai`, `pwa`, `store`, `ui`, `settings`, `auth`, `db`, `e2e`, `deps`, `docker`, `ci`, `theme`.
- Create an ADR in `docs/adr/ADR-NNN-title.md` when changing state management, adding a dependency >50 KB gzipped, protocol adapter architecture, security model, or build toolchain.

### Internationalization

- Every user-visible string goes through `t('key')`.
- Author English keys in `apps/web/src/locales/en.ts` first, then German in `apps/web/src/locales/de.ts` (fallback locale).
- Do not put inline fallback strings inside components.
- Inspector mode: `localStorage.setItem('i18n-inspector', 'true')`.

### State management

Two Zustand stores, deliberately separated:

- `useAppStore` (`apps/web/src/store.ts`) — UI/settings, persisted to `localStorage` via Zustand `persist`. Use `useAppStoreShallow` for multiple selectors; never call `useAppStore` twice in the same render path.
- `useEnergyStore` (`apps/web/src/core/useEnergyStore.ts`) — real-time adapter aggregation into `UnifiedEnergyModel`; **not persisted**.

### Adapters

- Frontend adapters implement `EnergyAdapter` (`apps/web/src/core/adapters/EnergyAdapter.ts`).
- `BaseAdapter` (`apps/web/src/core/adapters/BaseAdapter.ts`) gives circuit breaker, Zod validation, reconnect logic, and metrics.
- Register adapters via `AdapterRegistry` (`apps/web/src/core/adapters/adapter-registry.ts`):
  - Static: `registerAdapter('id', factory)`
  - Dynamic: `await loadContribAdapter('homeassistant-mqtt')`
  - All contrib: `await loadAllContribAdapters()`
- Backend protocol adapters live in `apps/api/src/protocols/` and implement `IProtocolAdapter` from `@nexus-hems/shared-types`.

### Styling & design system

- Tailwind CSS v4: use `@theme` in `apps/web/src/index.css`, not `tailwind.config.js` as the sole config.
- 5 themes in `apps/web/src/design-tokens.ts`: `ocean-dark` (default), `energy-dark`, `solar-light`, `nature-green`, `minimal-white`.
- Use branded selector primitives (`ChoiceCardGroup`, `SelectField`, `Disclosure`, `SgReadyModeSelector`) instead of native controls.
- Keep accessibility features: WCAG 2.2 AA is mandatory; `type="button"` on non-submit buttons; `aria-hidden` on decorative icons.

### React Compiler

- Auto-memoization via `babel-plugin-react-compiler`.
- Do not add manual `useCallback`/`useMemo` unless you have confirmed React Compiler cannot handle the case.

### Lazy loading & chunks

- All route pages are lazy-loaded with `React.lazy` + `Suspense`.
- Vite `manualChunks` split adapters, D3, Recharts, Motion, icons, AI SDK, PDF/QR, query, etc.

---

## 8. Testing strategy

| Type | Tool | Config | Notes |
|---|---|---|---|
| Unit / integration | Vitest v4 | `apps/web/vitest.config.ts` (jsdom, globals, React Compiler), `apps/api/vitest.config.ts` (Node env) | Web tests in `src/tests/*.test.{ts,tsx}`; API tests co-located or in `src/tests/`. |
| Coverage | `@vitest/coverage-v8` | Web: statements 78%, branches 71.9%, functions 70%, lines 80%. API: statements 55%, branches 46%, functions 62%, lines 55%. | Web coverage is enforced in CI via `check-coverage-baseline.mjs`; API coverage thresholds are in config but ratcheting is tracked separately. |
| E2E | Playwright | `apps/web/playwright.config.ts` | Local Chromium only; CI runs Chromium + Firefox. Base URL `http://127.0.0.1:4173/Nexus-HEMS-Dash/`. Service workers blocked; reduced motion. |
| a11y | `@axe-core/playwright` | `tests/e2e/accessibility.spec.ts` | WCAG 2.2 AA scans. |
| Fuzz / property-based | `fast-check` | `apps/web/src/tests/security-fuzz.test.ts` | Runs with `pnpm test:fuzz`. |
| Lighthouse | Lighthouse CI | `apps/web/lighthouserc.json` | Performance ≥ 85%, accessibility ≥ 90%, best-practices ≥ 90%, SEO ≥ 92%; FCP ≤ 3000 ms, LCP ≤ 4000 ms, TBT ≤ 400 ms, CLS ≤ 0.1. |
| Bundle size | `@size-limit/file` | `apps/web/package.json` `"size-limit"` | Framework 85 kB, App Entry 95 kB, Adapters 85 kB, D3 30 kB, Recharts 110 kB, Motion 45 kB, Icons 20 kB, Total JS 1171 kB, Total CSS 25 kB — all gzipped. |

### E2E conventions

- Every `test.describe` block must call `await page.addInitScript(setupLocalStorage)` in `beforeEach` (from `tests/e2e/e2e-setup.ts`) to seed a clean Zustand store.
- Use base-relative navigation: `page.goto('./')`, `page.goto('./settings')` — never `page.goto('/')` or `page.goto('/settings')` on GitHub Pages.
- `VITE_E2E_TESTING=true` disables service-worker `controllerchange` auto-reload so tests do not reload mid-run.

---

## 9. Security & safety considerations

### Mock vs live hardware (double opt-in)

- Default is **mock** mode. No real hardware is contacted.
- To enable live backend adapters, set **both**:
  - `ADAPTER_MODE=live`
  - `ALLOW_LIVE_HARDWARE=true`
- Frontend build-time mirrors:
  - `VITE_ADAPTER_MODE=live`
  - `VITE_ALLOW_LIVE_HARDWARE=true`
- Per-adapter enablement is also required in Settings.

### Read-only safety mode

- `READ_ONLY_MODE=true` globally blocks **all** hardware control commands at both the API/WebSocket layer and the frontend (`command-safety.ts`).
- Use this for certification-grade deployments, incident investigation, and commissioning.

### Authentication & authorization

- Dev: anonymous / auto-accept API keys.
- Production: `JWT_SECRET`, `API_KEYS`, and `WS_ORIGINS` are required; `API_KEY_SCOPES` binds keys to `read` / `readwrite` / `admin`.
- JWTs are HS256 via `jose`, with `iss`/`aud`, `jti`, `kid`, and optional dual-key rotation (`JWT_SECRET` + `JWT_SECRET_NEW`).
- WebSocket auth uses JWT or single-use `?ticket=` tokens; origin allowlist enforced via `WS_ORIGINS`.

### Rate limiting & CSP

- Express rate limits: global 100/min, API 60/min, auth 5/min, hardware control 5/min.
- Helmet + nonce-aware CSP; `style-src 'unsafe-inline'` is dropped in production.
- Permissions-Policy locks camera/USB/bluetooth/etc.

### AI keys & sensitive data

- AI provider API keys are managed in the UI (`/settings/ai`) and encrypted with **AES-GCM 256-bit** in IndexedDB (`apps/web/src/lib/secure-store.ts`).
- Never store API keys in env vars or plain text.
- PII sanitization flows through `@nexus-hems/shared-types` (`sanitize-text.ts`).

### Command safety

- All hardware commands pass through `apps/web/src/core/command-safety.ts`:
  - Zod schema validation
  - Rate limiting (30 cmd/min)
  - IndexedDB audit trail via Dexie
  - Read-only mode guard

### Protocol-specific proxies

- **OCPP:** browser posts mTLS credentials to `POST /api/ocpp/proxy-session`, then opens `/ws/ocpp?ticket=…&session=…` for a server-side mTLS relay.
- **EEBUS:** mTLS proxy at `/ws/eebus` with trust-store management.

### Supply chain

- `pnpm audit` gates in CI; security workflows run CodeQL, Semgrep, Gitleaks, anti-trojan-source, and SBOM/Grype scans.
- SLSA Level 3 build-provenance attestations on `main` builds.
- SHA-pinned GitHub Actions; Renovate owns npm/docker/cargo updates, Dependabot owns Actions only.

---

## 10. Deployment & runtime architecture

### Development data flow

```text
Browser ←── Vite dev server (5173) proxies /api, /metrics, /ws ──→ Express API (3000)
```

### Production deployment targets

| Target | Files / commands |
|---|---|
| **Docker frontend** | `Dockerfile` → multi-stage build (Node 24 → `nginxinc/nginx-unprivileged:1.31-alpine-slim`), serves on port 8080. Entrypoint: `apps/web/docker-entrypoint.sh` validates `WS_ORIGINS` and extracts CSP nonce. |
| **Docker backend** | `Dockerfile.server` → distroless Node 24 (`gcr.io/distroless/nodejs24-debian13:nonroot`), runs `node --import tsx index.ts` on port 3000. |
| **Docker Compose** | `docker-compose.yml` (frontend + API + adapter-bridge + optional monitoring profile); `docker-compose.prod.yml` hardened production stack. |
| **Helm / Kubernetes** | `helm/nexus-hems/` — Chart v1.11.0, frontend + server Deployments, ingress, HPA, NetworkPolicy, PDB, Pod Security Standards `restricted`, ServiceMonitor + PrometheusRule, cert-manager for EEBUS mTLS. |
| **GitHub Pages** | Auto-deployed from `main` via `.github/workflows/deploy.yml`; base path `/Nexus-HEMS-Dash/`. |
| **Tauri desktop** | `apps/web/src-tauri/tauri.conf.json` + `Cargo.toml` — Linux/macOS/Windows builds via `.github/workflows/tauri-build.yml`. |
| **Capacitor mobile** | `apps/web/capacitor.config.ts` — iOS/Android wrappers. |
| **PWA** | `apps/web/public/manifest.json`, Workbox via `vite-plugin-pwa`, offline-first IndexedDB cache. |
| **Monitoring** | Prometheus + Grafana + Alertmanager + InfluxDB via `docker-compose.yml --profile monitoring`; per-adapter Prometheus metrics exposed at `/metrics`. |

### Runtime networks (Docker Compose)

- `frontend` — public-facing nginx dashboard.
- `backend` — internal API/WebSocket/metrics.
- `adapters` — isolated physical-device network.

---

## 11. CI/CD & code-quality platforms

Quality signals are layered (see `DEVOPS.md` and `docs/adr/ADR-027-layered-quality-platforms.md`):

| Layer | Tools | Authority |
|---|---|---|
| **1. Deterministic gates** | `ci.yml` (lint, type-check, unit tests, coverage baseline, build, size-limit, E2E, fuzz), `security-full.yml` (CodeQL, Semgrep, Gitleaks, anti-trojan-source, dependency audit), Helm lint | **Blocking** |
| **2. Structured signals** | DeepSource, Codecov | Advisory |
| **3. AI contextual review** | CodeRabbit (`.coderabbit.yaml`), CodeAnt.ai (`.codeant/`) | Advisory |

### Main workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | push/PR `main`, `develop` | Primary gate: lint/type-check, unit tests + coverage baseline, build + SLSA attestation + size-limit, E2E, fuzz, security audit, rollup `ci-passed`. |
| `security-full.yml` | push/PR `main`, weekly | CodeQL, Semgrep, Gitleaks, anti-trojan-source, dependency audit, license + full dev-dep audit on schedule. |
| `sbom-scan.yml` | push `main`, PR, manual | Syft SBOMs + Grype critical scans for frontend/backend/source. |
| `container-publish.yml` | push `main`, tags `v*`, manual | Build images, Grype gate, push to GHCR, cosign keyless sign + SLSA provenance. |
| `deploy.yml` | push `main`, manual (`DEPLOY`) | GitHub Pages live demo with deployment pruning. |
| `release.yml` | manual (`RELEASE`) only | semantic-release; versions synced across manifests. |
| `tauri-build.yml` | manual, release published | Cross-platform desktop binaries. |
| `lighthouse.yml` | PR, manual | Lighthouse CI budgets. |
| `chromatic.yml` | PR, manual | Storybook visual regression. |
| `scorecard.yml` | weekly | OpenSSF Scorecard. |
| `renovate.yml` | daily | Self-hosted Renovate. |
| `coderabbit-rereview.yml` | PR push | Requests CodeRabbit re-review automatically. |

### PR review automation (CodeRabbit)

- Agent tokens cannot post PR comments (`403 Resource not accessible by integration`). Do not rely on `gh pr comment … @coderabbitai review`.
- Prefer `gh pr create`, `gh issue create`, etc. over GitHub MCP tools (e.g. `create_pull_request`); the local `gh` CLI is authenticated via keyring, whereas MCP calls may return `Authentication Failed`.
- On every non-draft PR push, `.github/workflows/coderabbit-rereview.yml` posts `@coderabbitai review` when the head commit has no CodeRabbit review yet (deduped per SHA).
- Push fix commits — the workflow requests re-review automatically.

---

## 12. Environment variables

All variables are optional in dev. Production requirements are marked below.

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | **Production required.** HS256 secret (≥64 chars random). |
| `API_KEYS` | **Production required.** Comma-separated keys for `/api/auth/token`. |
| `API_KEY_SCOPES` | Bind API keys to `read` / `readwrite` / `admin`. |
| `CORS_ORIGINS` | Additional allowed CORS origins. |
| `WS_ORIGINS` | **Production required.** Allowed WebSocket origins for CSP connect-src. |
| `ADAPTER_MODE` | `mock` (default) or `live`. |
| `ALLOW_LIVE_HARDWARE` | `true` required together with `ADAPTER_MODE=live`. |
| `READ_ONLY_MODE` | `true` blocks all hardware control commands. |
| `RATE_LIMIT_TRUSTED_IPS` | IPs exempt from rate limiting. |
| `TRUST_PROXY` | Express trust-proxy hops. |
| `JWT_SECRET_NEW` | In-rotation HS256 secret for key rotation. |
| `PROMETHEUS_BEARER_TOKEN` | Bearer token for `/metrics` auth. |
| `INFLUXDB_URL`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG`, `INFLUXDB_BUCKET` | InfluxDB v2 time-series config. |
| `VITE_ADAPTER_MODE` | Frontend build-time mirror of `ADAPTER_MODE`. |
| `VITE_ALLOW_LIVE_HARDWARE` | Frontend build-time mirror of `ALLOW_LIVE_HARDWARE`. |
| `VITE_BACKEND_WS` | Browser consumes backend EventBus→WebSocket broadcast. |
| `VITE_E2E_TESTING` | Disables SW auto-reload for E2E builds. |

See `.env.example` for the full list, including per-adapter host/port settings.

---

## 13. Common agent tasks — where to start

| Task | Start here |
|---|---|
| Feature shipped vs planned | `FEATURE_STATUS.md` |
| Known debt / backlog | `docs/Technical-Debt-Registry.md` |
| Full audit + roadmap | `docs/Audit-Report-2026-06-29.md`, `docs/Perfection-Roadmap.md` |
| Safety before live hardware | `docs/Safety-Certification-Notice.md` |
| Frontend adapter development | `docs/Adapter-Dev-Guide.md`, `apps/web/src/core/adapters/contrib/README.md` |
| Backend protocol adapters | `docs/Protocol-Adapter-Guide-Backend.md` |
| CI / required checks | `.github/CI-AUDIT.md` |
| DevOps & quality platform layering | `DEVOPS.md`, `docs/adr/ADR-027-layered-quality-platforms.md` |
| PR review correction loops | `docs/runbooks/pr-review-correction-loop.md` |
| Toolchain architecture | `docs/Toolchain-Architecture.md` |
| Security architecture | `docs/Security-Architecture.md`, `SECURITY.md` |
| Deployment options | `docs/Deployment-Guide.md` |
| Design system | `DESIGN-SYSTEM.md` |
| Knowledge graph | `graphify-out/GRAPH_REPORT.md`, `CLAUDE.md` §graphify |

---

## 14. PR merge gate — review quiescence (mandatory)

**Never merge a PR to `main` until review quiescence is reached.**

| Step | Action |
|------|--------|
| 1 | All required CI checks green on latest commit |
| 2 | All review bots **finished** on that SHA (not queued/in progress) |
| 3 | Collect **all** actionable comments: GitHub unresolved threads **+** `./scripts/fetch-coderabbit-outside-diff.sh <pr>` |
| 4 | Fix or decline **every** item — **nitpicks included** — resolve threads |
| 5 | Push → repeat steps 1–4 until **no new actionable comments** appear (quiescence) |

Canonical runbook: [`docs/runbooks/pr-review-correction-loop.md`](docs/runbooks/pr-review-correction-loop.md).

Cloud agents: do not mark a PR complete after first green CI. Do not merge without explicit
user instruction **and** quiescence. CodeRabbit outside-diff comments are **not** optional.

---

*Last updated: 2026-09-01. If you change tooling, scripts, deployment targets, or safety guardrails, update this file to keep it accurate.*
