# Developer Scripts Reference

The npm/pnpm scripts you'll actually run, and what each does. Run from the repo
root unless noted. Most delegate to **Turborepo**, which fans out across
`apps/*` and `packages/*`.

> **Local hardware note:** this repo is developed on RAM-constrained hardware.
> Run heavy checks **one at a time** — the local loop is `type-check → lint →
> targeted tests`. Full suites (`test:run`, `test:e2e`, `lighthouse`, `build`)
> are CI-first. See `CLAUDE.md`.

## Develop & Build

| Script | Command | What it does |
|--------|---------|--------------|
| `pnpm dev` | `turbo dev` | Start API (`:3000`) + web (`:5173`) with the Vite proxy. |
| `pnpm build` | `turbo build` | Production build of all packages. |
| `pnpm build:analyze` | `turbo build` + stats hint | Build, then point to `apps/web/dist/bundle-stats.html`. |
| `pnpm preview` | web `preview` | Serve the built SPA locally. |
| `pnpm start` | api `start` | Run the built API only. |
| `pnpm clean` | — | Remove `dist/` across workspaces. |

## Verify (staged, non-parallel locally)

| Script | Command | What it does |
|--------|---------|--------------|
| `pnpm type-check` | `turbo type-check` | `tsc --noEmit` across all workspaces (strict). |
| `pnpm lint` | `turbo lint` | Biome check + slim ESLint (`--max-warnings 0`), read-only. Per-package (`src/`-scoped). |
| `pnpm lint:all` | `biome ci .` | **Whole-repo** Biome gate (all 900+ files incl. config/test/scripts). Blocking in CI (F-02). |
| `pnpm lint:fix` | `turbo lint:fix` | Biome `--write` + ESLint `--fix`. |
| `pnpm format` / `pnpm format:check` | Biome | Format write / read-only check (`biome format apps/ packages/`). |
| `pnpm check:adapters` | `sync-adapter-counts.mjs` + `git diff --exit-code README.md` | Fail if the README adapter count drifts from the code (F-04). `pnpm sync:adapters` regenerates it. |
| `pnpm verify:basis` | `turbo type-check lint test:run` | Full local gate (heavy — prefer CI). |

## Test

| Script | Command | What it does |
|--------|---------|--------------|
| `pnpm test:run` | `turbo test:run` | All unit tests, one-shot. |
| `pnpm test:coverage` | web | Unit tests with V8 coverage. (`@nexus-hems/ai-core` has its own `test:coverage`; `apps/api` too.) |
| `pnpm check:coverage-baseline` | `check-coverage-baseline.mjs apps/web packages/ai-core` | Fail if coverage drops below the committed per-workspace baseline (runs after `test:coverage` in CI; PRF-03 + F-05a). |
| `pnpm test:fuzz` | web | Security fuzz tests only. |
| `pnpm test:e2e` / `:ui` | web (Playwright) | E2E (local Chromium-only; CI adds Firefox). `:ui` is interactive. |
| `pnpm test:a11y` | web | Accessibility spec only. |
| **single file** | `pnpm --filter @nexus-hems/web exec vitest run src/path/to/foo.test.ts` | Run one unit test file (preferred local loop). |
| `pnpm --filter @nexus-hems/web smoke:prod` | web | Prod-build smoke test (`SMOKE_DEBUG=1` for verbose). |

## Security & Supply Chain

| Script | Command | What it does |
|--------|---------|--------------|
| `pnpm security:trojan` | `anti-trojan-source …` | Detect Unicode bidi / Trojan-Source in source. |
| `pnpm security:secrets` | `node scripts/run-gitleaks.mjs git` | Gitleaks secret scan (native/Docker preferred; limited regex fallback). |
| `pnpm security:secrets:staged` | `… --pre-commit --staged` | Secret scan of staged changes only. |
| `pnpm size` | web (size-limit) | Enforce gzipped bundle budgets (CI gate). |

## Performance, Visual & Docs

| Script | Command | What it does |
|--------|---------|--------------|
| `pnpm lighthouse` | web | Lighthouse CI (CI-first). |
| `pnpm storybook` / `pnpm storybook:build` | web | Component workshop (`:6006`) / static build. |
| `pnpm graphify` / `pnpm graphify .` | Python | Regenerate the code knowledge graph under `graphify-out/` (AST-only, no API cost). |

## Release, Docker & Mobile

| Script | Command | What it does |
|--------|---------|--------------|
| `pnpm release` / `pnpm release:dry` | semantic-release | **Manual dispatch only** (ADR-015); `:dry` previews. |
| `pnpm docker:build` / `pnpm docker:up` / `pnpm docker:down` | Docker | Build image / run on `:8080` / stop. |
| `pnpm --filter @nexus-hems/web cap:sync` / `cap:build` | Capacitor | Sync web build into native shells / build + sync. |

---

_See [`Environment-Variables.md`](Environment-Variables.md) for configuration and
[`docs/README.md`](README.md) for the full documentation index._
