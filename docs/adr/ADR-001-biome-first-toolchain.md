# ADR-001: Biome-First Toolchain

- **Status:** Accepted
- **Date:** 2026-04-25
- **Deciders:** @qnbs
- **Supersedes:** —

## Context

The project initially used Prettier for formatting and typescript-eslint for TypeScript linting. This
created a dual-tool problem: ESLint and Prettier often conflicted on formatting decisions, required
separate config files, and took ~15–30 s for large codebases.

## Decision

Adopt **Biome 2.4.7** as the primary linter and formatter, replacing:
- `prettier` + `prettier-plugin-tailwindcss`
- `eslint-config-prettier` + `eslint-plugin-prettier`
- `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`
- `@eslint/js` + `globals`
- `eslint-plugin-react`
- `eslint-plugin-anti-trojan-source`

ESLint is retained **only** for three React-specific plugins with no Biome equivalent:
- `react-compiler/react-compiler` (error)
- `react-hooks/rules-of-hooks` (error)
- `react-hooks/exhaustive-deps` (warn)
- `react-refresh/only-export-components` (warn)

## Rationale

- **~10× faster** than ESLint + Prettier combined (Rust-native, single process)
- **Single config** (`biome.json`) covers JS, TS, JSON, CSS, HTML, Markdown, YAML
- **Consistent formatting** — no Prettier/ESLint conflicts
- **`noExplicitAny: error`** — enforces project-wide no-any policy
- **`useSortedClasses`** — Tailwind class sorting (nursery, warn)
- **Trojan-source protection** — Biome handles Unicode bidi via pre-commit hooks

## Consequences

**Positive:**
- Local `pnpm lint` runs in ~3 s vs formerly ~30 s
- Pre-commit hooks complete in <5 s
- Single source of truth for lint + format config

**Negative:**
- Some ESLint plugins must remain (React Compiler, hooks)
- Biome nursery rules may change between minor versions; pin version strictly

## Migration Log

- 2026-04-01: Initial Biome migration (see `docs/Biome-Migration-Roadmap.md`)
- 2026-04-25: Confirmed Biome 2.4.7, `noExplicitAny: error`, Tailwind class sorting enabled

## Related Files

- `biome.json` — primary config
- `eslint.config.js` — slim React-only config
- `docs/Biome-Migration-Roadmap.md` — full migration log
- `docs/Toolchain-Architecture.md` — living reference
