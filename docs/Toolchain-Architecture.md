# Toolchain Architecture — Nexus-HEMS-Dash

**Last updated:** 2026-07-08
**Status:** Active (post-Biome-migration, post-monorepo-migration)

---

## Overview

The project uses a **Biome-first** toolchain for maximum speed and minimal resource usage while preserving React-specific linting via a minimal ESLint configuration.

```
Source Files (*.ts, *.tsx, *.json, *.css, *.html, *.md, *.yml)
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  Biome 2.5.2  (Rust, single process)                 │
│  • Linter — TS/JS rules, security, style, nursery    │
│  • Formatter — TS/JS/JSON/CSS/HTML/YAML/MD           │
│  • Assist — organize imports                         │
└──────────────────────┬───────────────────────────────┘
                       │  *.ts, *.tsx only
                       ▼
┌──────────────────────────────────────────────────────┐
│  ESLint 9 (slim React-only)                          │
│  • react-compiler/react-compiler → error             │
│  • react-hooks/rules-of-hooks    → error             │
│  • react-hooks/exhaustive-deps   → warn              │
│  • react-refresh/only-export-components → warn       │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│  TypeScript Compiler (tsc --noEmit)                  │
│  • Type checking only — no emit                      │
│  • Strict mode: noImplicitAny, noUnusedLocals, etc.  │
└──────────────────────────────────────────────────────┘
```

---

## Tool Responsibilities Matrix

| Concern                         | Tool               | Config                                                 |
| ------------------------------- | ------------------ | ------------------------------------------------------ |
| **TS/JS formatting**            | Biome              | `biome.json` → `formatter`                             |
| **JSON formatting**             | Biome              | `biome.json` → `formatter` (json overrides)            |
| **CSS/HTML/YAML/MD formatting** | Biome              | `biome.json` → `formatter`                             |
| **TS/JS linting**               | Biome              | `biome.json` → `linter.rules`                          |
| **Import organization**         | Biome              | `biome.json` → `assist.actions.source.organizeImports` |
| **Tailwind class sorting**      | Biome              | `nursery.useSortedClasses` (warn)                      |
| **React Compiler violations**   | ESLint (slim)      | `eslint.config.js`                                     |
| **React Hooks rules**           | ESLint (slim)      | `eslint.config.js`                                     |
| **HMR compatibility**           | ESLint (slim)      | `eslint.config.js`                                     |
| **Type checking**               | tsc                | `tsconfig.json`                                        |
| **Secret detection**            | Gitleaks           | `.gitleaks.toml` + pre-commit                          |
| **Unicode bidi**                | anti-trojan-source | `.pre-commit-config.yaml`                              |

---

## Developer Workflow

### Installed ESLint Packages (Minimal Set)

```json
"eslint": "^9.x",
"eslint-plugin-react-compiler": "^19.x",
"eslint-plugin-react-hooks": "^7.x",
"eslint-plugin-react-refresh": "^0.5.x"
```

### Scripts Reference

All root scripts delegate to Turborepo; Turbo fan-outs across `apps/*` and `packages/*`:

| Script              | Command (root)                                                       | Runs                             |
| ------------------- | -------------------------------------------------------------------- | -------------------------------- |
| `pnpm lint`         | `turbo lint` → `biome check && eslint --max-warnings 0` | Biome check (read-only by default) + React ESLint in each workspace |
| `pnpm lint:fix`     | `turbo lint:fix` → `biome check --write && eslint --fix`             | Biome fix + ESLint fix in each workspace |
| `pnpm format`       | `turbo format` → `biome format --write apps/ packages/`              | Biome format all workspaces      |
| `pnpm format:check` | `biome format apps/ packages/`                                       | Biome format check (read-only)   |
| `pnpm type-check`   | `turbo type-check` → `tsc --noEmit` in each workspace                | TypeScript type checking across all 3 packages |
| `pnpm verify:basis` | `turbo type-check lint test:run`                                      | Full local verification          |
| `pnpm bench`        | `./scripts/bench-tooling.sh`                                         | Toolchain wall-clock + RSS bench |

---

## GitHub Actions CI

| Workflow | Trigger | Role |
| -------- | ------- | ---- |
| `.github/workflows/ci.yml` | Pull requests to `main`; pushes to `main` / `develop` | **Primary gate** — lint, typecheck, unit tests + coverage, build + size limits, E2E (Chromium + Firefox), blocking `pnpm audit --audit-level=high --prod` |
| `.github/workflows/perf-optimized-ci.yml` | `workflow_dispatch` only | Optional parallel/cached layout for experiments; does not run on push (avoids duplicate CI) |

Shared setup (pnpm pin, Node 24, `corepack enable`, `pnpm install --frozen-lockfile`) is implemented as a composite action at `.github/actions/setup-node-pnpm/action.yml` and is the canonical setup for all workflows that need Node + pnpm (`ci.yml`, `deploy.yml`, `security-full.yml`, `release.yml`, `tauri-build.yml`, `chromatic.yml`, `lighthouse.yml`, `fuzz.yml`, `perf-benchmark.yml`, `perf-optimized-ci.yml`, `sbom-scan.yml`). Pass `with: install: 'false'` to skip `pnpm install` in jobs that restore `node_modules` from a cache.

---

## VS Code Integration

Recommended extensions (`.vscode/extensions.json`):

- **`biomejs.biome`** — Biome language server (formatter + linter); set as `editor.defaultFormatter` for TS/TSX/JSON/CSS
- **`dbaeumer.vscode-eslint`** — ESLint extension for React-specific rule highlighting

Settings (`settings.json` in workspace):

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports.biome": "explicit"
  },
  "[typescript]": { "editor.defaultFormatter": "biomejs.biome" },
  "[typescriptreact]": { "editor.defaultFormatter": "biomejs.biome" },
  "[json]": { "editor.defaultFormatter": "biomejs.biome" }
}
```

---

## Pre-commit Hook Pipeline

```
.husky/pre-commit
  │
  ├─ pre-commit framework (if installed)
  │    ├─ trailing-whitespace
  │    ├─ end-of-file-fixer
  │    ├─ check-yaml
  │    ├─ check-json
  │    ├─ detect-private-key
  │    ├─ check-merge-conflict
  │    ├─ check-added-large-files (max 500 kB)
  │    ├─ gitleaks (secret detection)
  │    └─ anti-trojan-source (Unicode bidi detection)
  │
  └─ lint-staged
       ├─ *.{ts,tsx}  → biome check --write + eslint --fix
       ├─ *.{json,css,html,yml,yaml}  → biome format --write
       └─ *.md  → biome format --write
```

---

## CI Pipelines

Two complementary CI pipelines in `.github/workflows/`:

### ci.yml (primary gate — runs on push/PR to main)

```
lint-typecheck
  ├─ pnpm audit --audit-level=high
  ├─ turbo lint       (biome check + slim eslint across all workspaces)
  └─ turbo type-check (tsc --noEmit across apps/api + apps/web + packages/shared-types)

unit-tests (needs: lint-typecheck)
  └─ turbo test:coverage → vitest run --coverage (apps/web)

build (needs: lint-typecheck)
  └─ VITE_E2E_TESTING=true turbo build → packages/shared-types → apps/api + apps/web
     → bundle size check (600 KB index budget) → size-limit → sentry source maps (main only)

e2e-tests (needs: build)
  └─ playwright test (Chromium + Firefox in CI; local runs Chromium only)

docker-build (needs: build)
  └─ docker build --target production

security  (needs: lint-typecheck)
  └─ pnpm audit --audit-level=high --prod

ci-passed (always, needs: lint-typecheck + unit-tests + build + e2e-tests + security)
  └─ gate: every job in the workflow must succeed
```

### perf-optimized-ci.yml (50–80% faster — fan-out/fan-in with shared dep cache)

```
install          → cache node_modules (keyed on pnpm-lock.yaml)
  ├─ lint        → restore cache → biome check + eslint + tsc
  ├─ test        → restore cache → vitest coverage
  └─ build       → restore cache → VITE_E2E_TESTING=true vite build → cache dist/
        ├─ e2e   → restore dist + Playwright browsers (cached) → playwright test
        └─ security → verify security workflow / audit gate

ci-passed (always, needs: lint + test + build + e2e + security)
  └─ gate: every optimized CI job must succeed
```

---

## Biome Version Policy

- Biome version is **pinned** in `package.json` devDependencies (no `^` range in CI context)
- Schema URL in `biome.json` must match the installed version
- Upgrade process: update version → update `$schema` URL → run `biome check --write` for any new autofixes → commit
- Biome upgrades are treated as `build(toolchain):` commits

---

## Adding New Rules

### Biome Rule

1. Find the rule in [Biome rule reference](https://biomejs.dev/linter/rules/)
2. Add to appropriate `linter.rules.<group>.<ruleName>` section in `biome.json`
3. Test: `pnpm lint` must pass cleanly (read-only by default — no `--write` flag needed)

### ESLint React Rule

Only add ESLint rules if they target React/JSX-specific behaviour with no Biome equivalent:

1. Verify no Biome equivalent exists
2. Add to the `rules` section in `eslint.config.js`
3. Document in this file under the Tool Responsibilities Matrix

---

## Performance Benchmarks

Run `./scripts/bench-tooling.sh` to collect baseline metrics.

Benchmark reports are stored in `.perf/toolchain-bench-YYYYMMDD.json`.

See [docs/Biome-Migration-Roadmap.md](./Biome-Migration-Roadmap.md) for full migration context, risk assessment, and rollback procedure.
