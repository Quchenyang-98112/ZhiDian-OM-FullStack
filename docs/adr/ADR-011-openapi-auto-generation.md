# ADR-011: OpenAPI Auto-Generation for Backend API

- **Status:** Proposed — not yet scheduled (verified unimplemented as of v1.10.0; no `openapi`/`swagger` tooling in `apps/api`)
- **Date:** 2026-04-25
- **Deciders:** Nexus-HEMS Core Team
- **Target release:** TBD (originally v1.3.0; not implemented as of v1.10.0)

---

## Context and Problem Statement

The Express 5 backend (`apps/api`) currently lacks a machine-readable API contract. This means:

1. There is no API documentation other than `docs/API-Reference.md` (maintained manually, may drift from implementation).
2. The frontend must import types from `@nexus-hems/shared-types` and infer endpoint shapes manually.
3. External tool integrations (Prometheus, Grafana, postman collections) cannot auto-discover API capabilities.
4. API regressions are only caught by manual E2E tests, not by contract testing.

---

## Decision Drivers

- **Single source of truth:** Zod schemas in `@nexus-hems/shared-types` already define request/response shapes — OpenAPI should be derived from them, not duplicated.
- **Developer experience:** Auto-generated client SDKs for both the web app and external integrators.
- **Lightweight:** Avoid heavy framework lock-in (Nest.js, tsoa); keep Express 5 as the router.
- **Zero runtime cost option:** Generation at build time; no schema validation middleware added to hot paths unless configured explicitly.

---

## Considered Options

### Option 1 — Manual OpenAPI YAML

- Maintain `openapi.yml` by hand alongside the code
- Pro: Full control, no tooling dependency
- Con: Drifts from implementation; high maintenance burden; already failing for `API-Reference.md`

### Option 2 — `@anatine/zod-openapi` (Zod → OpenAPI at build time)

- Extend existing Zod schemas in `@nexus-hems/shared-types` with `.openapi()` metadata
- Generate OpenAPI 3.1 spec via a build script
- Pro: Single source of truth (Zod schemas); no codegen at runtime; integrates with existing type system
- Con: Requires adding `.openapi()` calls to all schemas; tooling is community-maintained

### Option 3 — `@asteasolutions/zod-to-openapi`

- Similar to Option 2; OpenAPIRegistry pattern with explicit route registration
- Pro: More structured; designed specifically for Express-style apps
- Con: Requires a registry + manual route registration alongside Express Router definitions

### Option 4 — `hono` or `elysia` as router replacement

- Both include built-in OpenAPI generation
- Pro: First-class OpenAPI support
- Con: **Discarded** — replacing Express 5 is out of scope and violates the "never deviate from core stack" rule

---

## Decision

**Adopt Option 3 (`@asteasolutions/zod-to-openapi`)** as a non-breaking additive change (originally targeted v1.3.0; not yet implemented as of v1.10.0).

Implementation plan:

1. Add `@asteasolutions/zod-to-openapi` to `apps/api` dev dependencies.
2. Create `apps/api/src/openapi.ts` — an `OpenAPIRegistry` that re-registers schemas from `@nexus-hems/shared-types` with `.openapi()` metadata.
3. Register each Express Router path explicitly in `openapi.ts` (not in the route files — no coupling).
4. Build script `scripts/generate-openapi.ts` emits `openapi.yml` and `openapi.json` to `apps/api/public/`.
5. Serve via `GET /api/openapi.json` and Swagger UI at `GET /api/docs` (development only).
6. CI: add `pnpm generate:openapi && git diff --exit-code apps/api/public/openapi.yml` to detect spec drift.

---

## Consequences

### Positive

- Auto-generated Swagger UI for frontend devs and external integrators
- Contract test: OpenAPI spec is committed and diff-checked in CI — drift detected automatically
- Client SDK generation possible via `openapi-typescript` → typed fetch client in `apps/web`
- `docs/API-Reference.md` becomes the human-readable narrative; OpenAPI is the machine-readable contract

### Negative

- Requires maintaining a parallel `OpenAPIRegistry` alongside Express Router definitions
- `@asteasolutions/zod-to-openapi` is community-maintained (not official Zod package)
- WebSocket protocol (`/ws`) is not representable in OpenAPI 3.1 — AsyncAPI would be needed for WS docs (deferred)

### Neutral

- Swagger UI is disabled in production (only available behind `NODE_ENV=development`)
- JWT auth is documented as `securitySchemes.BearerAuth` in the generated spec

---

## Implementation Checklist

- [ ] Add `@asteasolutions/zod-to-openapi` to `apps/api/package.json`
- [ ] Create `apps/api/src/openapi.ts` (registry + route registration)
- [ ] Create `scripts/generate-openapi.ts`
- [ ] Add `generate:openapi` script to `apps/api/package.json`
- [ ] Add spec drift check to `.github/workflows/ci.yml`
- [ ] Serve `/api/docs` Swagger UI in dev mode
- [ ] Auto-generate `apps/web/src/lib/api-client.ts` from OpenAPI via `openapi-typescript`
- [ ] Update `docs/API-Reference.md` to link to `/api/docs`

---

## References

- [@asteasolutions/zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi)
- [openapi-typescript](https://github.com/drwpow/openapi-typescript)
- [ADR-001 Biome-First Toolchain](ADR-001-biome-first-toolchain.md)
- [API-Reference.md](../API-Reference.md)
