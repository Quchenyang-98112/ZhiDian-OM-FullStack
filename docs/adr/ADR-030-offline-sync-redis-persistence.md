# ADR-030: Offline Sync State — Optional Redis Backend

- **Status:** Accepted
- **Date:** 2026-09-02
- **Deciders:** @qnbs
- **Supersedes:** Process-local-only sync/idempotency stores (offline sync slices 1–4)

## Context

Offline sync slices 1–4 shipped idempotency, sync version, settings replay, and diff endpoints
using **in-memory, process-local** stores (`sync-version-store.ts`, `settings-store.ts`,
`sync-diff-store.ts`, `idempotency-cache.ts`). This is correct for single-instance edge
deployments (Raspberry Pi, Docker Compose with one API pod) but breaks when:

- The API **restarts** — sync version and settings changelog reset
- **Multiple server replicas** run without shared state — idempotency misses, version drift, lost settings

Helm defaults to `server: 2` replicas. Without shared storage, offline replay and conflict
detection are unreliable across pods.

## Decision

Extend offline sync persistence using the same pattern as ADR-003 (JTI revocation) and
`ws-ticket-store.ts`:

1. **Default (no `REDIS_URL`):** in-memory stores — unchanged behavior, zero dependencies
2. **With `REDIS_URL`:** Redis-backed persistence via `getOptionalRedisClient()`
3. **Graceful degradation:** Redis connection failure → in-memory fallback with warning log

### Redis key layout

| Key | Type | Purpose |
|-----|------|---------|
| `nexus:sync:version` | string (counter) | Monotonic sync version |
| `nexus:sync:settings` | string (JSON) | Server settings hash |
| `nexus:sync:diff` | string (JSON array) | Versioned settings changelog (capped) |
| `nexus:idempotency:http:{key}` | string (JSON) | HTTP idempotency record, TTL 300 s |
| `nexus:idempotency:ws:{key}` | string | WS command dedupe marker, TTL 300 s |

### API surface

Store modules export **async** functions (`getSyncVersion`, `bumpSyncVersion`, etc.).
Route handlers and middleware `await` them. Memory-only paths resolve immediately.

### Write-route idempotency expansion

`idempotencyMiddleware` supports `POST`, `PUT`, and `PATCH` when `X-Idempotency-Key` is present.
Applied to hardware mutating routes: Modbus write (existing), settings PUT, exec command,
OCPP proxy session, Shelly webhook, OpenADR VEN callbacks.

### Hardware offline replay

`POST /api/commands/replay` accepts offline queue action types (`ev-control`, `hp-control`,
`battery-control`) and dispatches through the same mock/live command path as WebSocket control.
Replaces phantom `/api/ev/control` URLs in `background-sync.ts`.

### Live WebSocket idempotency

Remove the `mode !== 'live'` guard on WS idempotency dedupe so live hardware commands are also
protected from duplicate delivery.

## Rationale

- **No mandatory infrastructure change** — single-instance deployments unaffected
- **HA / multi-replica** deployments get durable sync + idempotency by setting `REDIS_URL`
- Reuses existing `ioredis` optional dependency and `redis-client.ts` connection pool
- Helm chart documents the `server.replicaCount > 1` → `REDIS_URL` requirement

## Consequences

**Positive:**

- Production multi-pod deployments get reliable offline sync and command dedupe
- API restarts no longer reset sync version when Redis is configured
- Unified hardware replay endpoint closes the phantom-route gap

**Negative:**

- Store APIs become async — route handlers must await
- Redis unavailability in HA mode silently degrades to per-pod memory (logged)

## Related Files

- `apps/api/src/services/sync-persistence.ts` — Redis/memory backend
- `apps/api/src/data/sync-version-store.ts`, `settings-store.ts`, `sync-diff-store.ts`, `idempotency-cache.ts`
- `apps/api/src/routes/commands.routes.ts` — hardware offline replay
- `apps/api/src/middleware/idempotency.ts`
- `apps/web/src/lib/background-sync.ts`
- `helm/nexus-hems/values.yaml`, `helm/nexus-hems/templates/NOTES.txt`

## Supporting Links

- [ADR-003: JTI Revocation — Optional Redis Backend](./ADR-003-jti-revocation-redis-fallback.md)
- [Offline Sync Design](../Offline-Sync-Design.md)
