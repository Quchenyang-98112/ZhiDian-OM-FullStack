# ADR-003: JTI Revocation — Optional Redis Backend

- **Status:** Accepted
- **Date:** 2026-04-25
- **Deciders:** @qnbs
- **Supersedes:** In-memory-only revocation (pre-2026-04-25)

## Context

JWT token revocation (via `/api/auth/revoke`) currently stores revoked JTIs in an in-memory
`Map<string, number>` (max 10 000 entries, LRU eviction). This means:

- **Server restart** → all revoked JTIs are forgotten → revoked tokens can be replayed
- **Multi-instance** deployments cannot share revocation state

The fix must not introduce a hard infrastructure dependency — many deployments are single-instance
Raspberry Pi / edge devices without Redis.

## Decision

Implement an **optional persistence layer** for JTI revocation:

1. **Default (no config):** in-memory map — unchanged behavior, zero dependencies
2. **With `REDIS_URL`:** `ioredis` client used as backing store; in-memory map remains as L1 cache
3. **Graceful degradation:** if Redis connection fails, fall back to in-memory with warning log

### Interface

```typescript
// apps/api/src/jwt-utils.ts
export function configureRedisRevocationStore(redisUrl: string): void;
export function revokeToken(jti: string, expiresAtMs: number): void;  // unchanged public API
function isJTIRevoked(jti: string): boolean;                          // checks Redis if configured
```

### Redis key format
```
nexus-hems:revoked-jti:<jti>  →  value: "1"  EX: <ttl-seconds>
```

## Rationale

- **No mandatory infrastructure change** — single-instance deployments unaffected
- **HA deployments** get full revocation persistence by setting `REDIS_URL`
- **Short JWT TTL** (24 h default) limits worst-case replay window without Redis
- **LRU + lazy cleanup** already bounds memory usage on in-memory path

## Consequences

**Positive:**
- Production HA deployments get reliable revocation
- Optional — no impact on Docker single-instance / Raspberry Pi / Tauri/Capacitor deployments
- Redis TTL auto-expiration prevents unbounded growth

**Negative:**
- `ioredis` added as optional dependency (not loaded unless `REDIS_URL` is set)
- Redis connection errors must be handled gracefully

## Key Rotation Script

A companion `scripts/rotate-jwt-key.sh` script automates 30-day JWT key rotation:
- Copies `JWT_SECRET` → `JWT_SECRET_NEW` in the `.env` or secrets file
- Generates a new random 64-byte hex secret
- Sends `SIGUSR1` to the server process to hot-reload keys without restart

## Related Files

- `apps/api/src/jwt-utils.ts` — implementation
- `scripts/rotate-jwt-key.sh` — rotation automation
- `apps/web/src/lib/db.ts` — client-side `revokedJTIs` table (v11)

## Supporting Links

- [OWASP JWT Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
