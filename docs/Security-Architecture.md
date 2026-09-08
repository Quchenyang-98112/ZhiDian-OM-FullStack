# Security Architecture — Nexus-HEMS-Dash

> Version 1.5 · May 2026 (JWT dual-key, trust proxy, shares API)

---

## Table of Contents

1. [Threat Model](#threat-model)
2. [Authentication & Authorization](#authentication--authorization)
3. [Encryption & Key Management](#encryption--key-management)
4. [Network Security](#network-security)
5. [Adapter Security](#adapter-security)
6. [Supply Chain Security](#supply-chain-security)
7. [Client-Side Security](#client-side-security)
8. [Audit & Logging](#audit--logging)
9. [Incident Response](#incident-response)

---

## Threat Model

### Attack Surface

```
┌────────────────────────────────────────────────────────────────┐
│                      Browser / PWA                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ React SPA   │  │ IndexedDB    │  │ Service Worker        │ │
│  │ + Zustand   │  │ (Dexie.js)   │  │ (Workbox)             │ │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬───────────┘ │
├─────────┼────────────────┼──────────────────────┼─────────────┤
│         │    WebSocket / HTTPS / MQTT-over-WS    │             │
├─────────┼────────────────┼──────────────────────┼─────────────┤
│  ┌──────▼──────┐  ┌──────▼───────┐  ┌───────────▼───────────┐ │
│  │ Express     │  │ Victron/KNX  │  │ External APIs         │ │
│  │ API Server  │  │ Gateways     │  │ Tibber/aWATTar/AI     │ │
│  └─────────────┘  └──────────────┘  └───────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### STRIDE Analysis

| Threat              | Mitigation                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------- |
| **Spoofing**        | mTLS for EEBUS SPINE/SHIP; JWT for API auth                                              |
| **Tampering**       | CSP headers; integrity checks on service worker cache                                    |
| **Repudiation**     | Command audit trail in `BaseAdapter`; structured logging                                 |
| **Info Disclosure** | AES-GCM encrypted keys in IndexedDB; no env-var secrets                                  |
| **Denial of Svc**   | Express rate limiting (global/API/auth); nginx `limit_conn`; circuit breaker per adapter |
| **Priv. Elevation** | Read-only Docker containers; non-root nginx; strict CSP                                  |

---

## Authentication & Authorization

### API Server (Express 5)

- **Helmet.js** — sets security headers (HSTS, X-Frame-Options, X-Content-Type-Options, COEP `credentialless`)
- **express-rate-limit** — three tiers: global (100 req/min), API (60 req/min), strict auth bucket (5 req/min) on `/api/auth/token`, `/refresh`, `/revoke`, `/rotate-key`
  - **Trust proxy:** `TRUST_PROXY` configures Express `trust proxy` (default `1`) so `req.ip` reflects the real client behind CDN/reverse-proxy chains (see `Deployment-Guide.md`)
  - `RATE_LIMIT_TRUSTED_IPS` env var allows load-balancer IPs to bypass rate limits
  - Window randomized ±15 s to mitigate timing attacks
- **Zod** — runtime schema validation on all API endpoints and WebSocket commands
- **JWT** (`jose`) — stateless auth tokens, HS256, 24 h expiry; secret entropy validated at startup
  - `apps/api/src/jwt-utils.ts`: warns on low-entropy secrets (< 128 bits), short keys (< 64 chars), dictionary words
  - Secret sources: `JWT_SECRET` env var → Docker secrets file → auto-generated (dev only)
  - `jti`, `iss`, `aud` claims added to all tokens; JTI revocation via `POST /api/auth/revoke`
  - Zero-downtime rotation: `JWT_SECRET` + optional `JWT_SECRET_NEW` / `JWT_SECRET_NEW_FILE`; signing prefers the new secret while legacy tokens verify; reload without restart via **`POST /api/auth/rotate-key`** (admin JWT) calling `reloadJwtKeysFromEnv()`; optional fixed header ids `JWT_KID_PRIMARY` / `JWT_KID_NEW`
  - Prometheus counters for JWT verify failures, JTI revocations, key reload, EEBUS handshake outcomes (`apps/api/src/middleware/security-metrics.ts`)
- **JWT Scopes** — three-tier authorization model:

| Scope       | Token Issuance                     | Permitted Operations                                  |
| ----------- | ---------------------------------- | ----------------------------------------------------- |
| `read`      | Default for anonymous/public flows | Receive WebSocket `ENERGY_UPDATE` messages only        |
| `readwrite` | `POST /api/auth/token` default     | Send control commands (`SET_EV_POWER`, etc.)           |
| `admin`     | Requires elevated API key          | EEBUS pairing, token revocation, system configuration |

- **Single-use WS Tickets** — `POST /api/auth/ws-ticket` issues 60-second single-use tickets; WebSocket connections prefer `?ticket=` over `?token=` to avoid long-lived tokens in URLs
- **Dashboard shares (MED-06)** — `POST /api/shares` (JWT) creates opaque `shareId` + single-use redeem secret; `POST /api/shares/:shareId/redeem` validates server-side; avoids persisting raw share secrets in browser storage when API + auth token are available
- **Per-IP WebSocket Limit** — maximum 10 concurrent WebSocket connections per IP address; excess connections rejected with HTTP 429
- No session storage; tokens validated per request
- Production baseline runs on Node.js 24 LTS

### EEBUS SPINE/SHIP

- **TLS 1.3** with mutual TLS (mTLS) — both client and server certificates
- **Trust store:** default persistent JSON file (`EEBUS_TRUST_FILE`); optional **`EEBUS_TRUST_BACKEND=redis`** with `REDIS_URL` for multi-replica API deployments
- mDNS-SD service discovery (local network only)
- VDE-AR-E 2829-6 compliant pairing flow

### OCPP 2.1

- WebSocket with Basic Auth or certificate-based auth
- ISO 15118 Plug & Charge certificate chain validation
- §14a EnWG compliance for grid operator control signals

---

## Encryption & Key Management

### AI API Keys — AES-GCM in IndexedDB

```
User enters API key → derive AES-256 key via PBKDF2 (600 000 iterations)
   → encrypt with AES-GCM (random 96-bit IV)
   → store { ciphertext, iv, salt } in Dexie.js
   → key material never leaves browser
```

**Implementation**: `apps/web/src/lib/ai-keys.ts` + `apps/web/src/lib/crypto.ts`

| Property       | Value                              |
| -------------- | ---------------------------------- |
| Algorithm      | AES-256-GCM                        |
| Key Derivation | PBKDF2 (SHA-256, 600 000 iter)     |
| IV             | 96-bit, cryptographically random   |
| Storage        | IndexedDB via Dexie.js             |
| Key Rotation   | Manual (user re-enters key)        |

### Credential Vault Pattern

All adapter credentials (Victron IP, MQTT user/pass, KNX gateway, EEBUS certs) are stored encrypted in IndexedDB using the same AES-GCM vault. See `apps/web/src/lib/secure-store.ts`.

**Never stored:**

- Environment variables
- Plain-text files
- localStorage (except non-sensitive UI preferences)
- Git history

---

## Network Security

### TLS Configuration

| Connection             | Protocol      | Auth              |
| ---------------------- | ------------- | ----------------- |
| External APIs (Tibber) | HTTPS/TLS 1.3 | API key in header |
| MQTT (Victron)         | WSS (TLS)     | User/Pass + TLS   |
| KNX/IP                 | WS (local)    | Network isolation |
| EEBUS SPINE/SHIP       | TLS 1.3 mTLS  | Client cert       |
| OCPP 2.1               | WSS           | Basic/Cert        |
| Open-Meteo Weather API | HTTPS         | None (public)     |

### Content Security Policy (CSP)

Enforced via Helmet.js, the static SPA `index.html`, and Tauri CSP. The static web build
uses a Vite-injected nonce for its small bootstrap scripts and fallback style block;
Google Fonts are self-hosted under `apps/web/public/fonts/` with SRI preload tags, so no
remote font origins are needed.

```
default-src 'self';
script-src 'self' 'nonce-{vite-build-nonce}';
style-src 'self' 'nonce-{vite-build-nonce}';
connect-src 'self' wss://localhost:* wss://127.0.0.1:* https://api.tibber.com https://api.awattar.de
  https://api.open-meteo.com https://generativelanguage.googleapis.com;
img-src 'self' data: blob:;
font-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
cross-origin-embedder-policy: credentialless;
```

> **Production**: `ws://localhost:*` is replaced by the `WS_ORIGINS` env var. Never expose development WebSocket origins in production.

### CORS

- Express CORS middleware restricts origins to deployment domain + `CORS_ORIGINS` env var
- No wildcard `*` origins in production

### nginx Connection Limits

`nginx.conf` enforces per-IP connection limits:

```nginx
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
limit_conn conn_limit 50;   # max 50 concurrent connections per IP
client_max_body_size 1m;    # request body limit
```

Prevents connection-exhaustion DoS without impacting legitimate users.

---

## Adapter Security

### Mock-by-Default / Double Opt-In for Live Hardware

| Layer | Module | Env vars | Effective live when |
| ----- | ------ | -------- | ------------------- |
| Backend | `apps/api/src/config/adapter-mode.ts` | `ADAPTER_MODE`, `ALLOW_LIVE_HARDWARE` | Both `live` + `true` |
| Frontend | `apps/web/src/lib/adapter-mode.ts` | `VITE_ADAPTER_MODE`, `VITE_ALLOW_LIVE_HARDWARE` | Both `live` + `true` **and** adapter enabled in Settings |

Without full acknowledgement, protocol adapters do not start (backend) and `useAdapterBridge` does not call `connect()` (frontend). Health checks use **effective** mode — `ADAPTER_MODE=live` alone still reports `mode: "mock"` and `status: "healthy"`.

See `docs/Safety-Certification-Notice.md` for the pre-deployment checklist.

### Circuit Breaker

Each adapter uses `apps/web/src/core/circuit-breaker.ts`:

- **Closed** → normal operation
- **Open** → after 5 consecutive failures, blocks calls for 30 s
- **Half-Open** → single probe request to test recovery
- Prevents cascade failures across adapter aggregation layer

### Command Safety

`apps/web/src/core/command-safety.ts` enforces:

- **Rate limiting** — max commands per minute per adapter
- **Confirmation** — dangerous commands require user confirmation via `ConfirmDialog`
- **Audit trail** — every command logged with timestamp, user, adapter, result
- **Emergency stop** — immediate disconnect of all adapters

### Read-Only Mode

`READ_ONLY_MODE=true` is a global, environment-level safety switch that blocks **all** hardware-affecting mutations at the API boundary, regardless of JWT scope or adapter configuration. It is implemented by `apps/api/src/config/read-only-mode.ts` and enforced via:

- `apps/api/src/middleware/require-not-read-only.ts` — reusable Express middleware for REST routes
- `apps/api/src/ws/energy.ws.ts` — WebSocket command gateway rejection
- `apps/api/src/ws/proxy-readonly-guard.ts` — proxy WebSocket closure
- `apps/api/src/routes/modbus.routes.ts` — SunSpec register writes
- `apps/web/src/core/command-safety.ts` — frontend command dispatch gate

Enforced routes include:

| Route | Operation blocked in read-only mode |
|-------|-------------------------------------|
| WebSocket `/ws` control commands | All `SET_*`, `RESET_*`, emergency stop |
| `POST /api/modbus/write` | Modbus register writes |
| `POST /api/eebus/pair` | EEBUS SHIP handshake initiation |
| `POST /api/eebus/pair/pin` | EEBUS PIN submission |
| `POST /api/eebus/discover/register` | EEBUS device registration |
| `DELETE /api/eebus/trust/:ski` | EEBUS trust-store removal |
| `PUT /api/eebus/tls/revocation` | EEBUS revocation policy update |
| `POST /api/ocpp/proxy-session` | OCPP mTLS proxy session issuance |
| `POST /api/openadr/events/:eventId/acknowledge` | OpenADR event opt-in/opt-out |
| `POST /api/openadr/reports` | OpenADR telemetry report submission |
| `POST /api/exec/command` | ExecAdapter command dispatch |

Use `READ_ONLY_MODE=true` for commissioning, incident investigation, certification-grade deployments, and maintenance windows. The setting is reported in `GET /api/health` as `readOnly` and surfaced in the UI via `useReadOnlyModeActive()`.

### Reconnect Strategy

`apps/web/src/core/useReconnect.ts`:

- Exponential backoff: 1 s → 2 s → 4 s → 8 s → max 30 s
- Jitter: ±25% to prevent thundering herd
- Max retries: 10 (configurable)
- Dead letter: after max retries, adapter marked `error` + user notified

### SSRF Prevention (ModbusSunSpec)

`apps/web/src/core/adapters/ModbusSunSpecAdapter.ts`:

- Host validation restricts connections to RFC 1918 / link-local / localhost addresses
- Rejects public IPs to prevent server-side request forgery via adapter configuration
- Patterns: `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`, `127.x`, `::1`, `fe80::`, `.local`

### EEBUS Connection Timeout

`apps/web/src/core/adapters/EEBUSAdapter.ts`:

- 30-second connection timeout on WebSocket open
- Prevents indefinite hang if SPINE/SHIP peer is unreachable
- Auto-close + error status on timeout

---

## Supply Chain Security

### CI/CD Pipeline (14 workflows)

| Tool                   | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| **CodeQL**             | Static analysis (JavaScript/TypeScript)                               |
| **Syft SBOM**          | SPDX SBOM generation for frontend/backend images and source (`sbom-scan.yml`) |
| **pnpm audit**         | Production dependency audit (`sbom-scan.yml`, `--audit-level=high`)           |
| **Grype / Snyk**       | Container/filesystem CVE scanning — Grype in `sbom-scan.yml` + `container-publish.yml` (critical, blocking, `.grype.yaml` targeted ignores) |
| **Grype policy**       | `.grype.yaml` + `docs/Supply-Chain-Grype-Policy.md` — CVE-specific exceptions only (no global `only-fixed`) |
| **Cosign**             | Keyless image signing + SLSA provenance on GHCR publish (`container-publish.yml`) |
| **Gitleaks**           | Secret detection (pre-commit + CI)                                    |
| **anti-trojan-source** | Unicode Bidi character detection                                      |
| **pnpm audit**         | Dependency vulnerability check                                        |
| **OpenSSF Scorecard**  | Supply chain security rating                                          |
| **Renovate**           | Automated dependency updates                                          |
| **Chromatic**          | Visual regression + Storybook CI                                      |

#### Grype exception policy

Blocking scans use **full critical severity** (not `only-fixed: true`). Known upstream won't-fix CVEs are whitelisted individually in `.grype.yaml` with documented `reason` fields. See `docs/Supply-Chain-Grype-Policy.md` and registry entry **SUPPLY-02**. CI runs `scripts/verify-grype-policy.sh` to cap ignore-rule growth.

### Runtime Governance

- Production containers and release workflows are pinned to Node.js 24 LTS
- Deploy workflow requires explicit manual confirmation token before GitHub Pages rollout
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` environment variable set across all CI workflows

### Dependency Pinning

- All GitHub Actions pinned to commit SHA (not tags)
- `pnpm-lock.yaml` committed; `pnpm install --frozen-lockfile` in CI
- Renovate auto-updates with lockfile maintenance
- Helm chart supports immutable digest-based image references (`repository@sha256:...`) for auditable rollouts

### Docker Security

```dockerfile
# Multi-stage build
FROM node:24-alpine AS build    # Build stage (discarded)
FROM nginx:1.29-alpine AS prod  # Minimal runtime

# Security hardening
USER nginx                      # Non-root
read_only: true                 # Read-only filesystem
tmpfs: [/tmp, /var/cache/nginx] # Writable tmpfs only
no-new-privileges: true         # No privilege escalation
healthcheck: curl -f http://localhost/
```

---

## Client-Side Security

### XSS Prevention

- React's JSX auto-escapes all interpolated values
- i18next `escapeValue: false` — safe because React handles escaping
- No `dangerouslySetInnerHTML` usage
- CSP blocks inline scripts

### IndexedDB Security

- Dexie.js stores encrypted blobs only
- No sensitive data in localStorage (only UI preferences: theme, locale, sidebar position)
- Service Worker cache: only static assets + API responses (no keys)

### Trusted Types (Tauri)

- Tauri v2 enforces strict CSP with Trusted Types
- No dynamic script/style injection

---

## Audit & Logging

### Command Audit Trail

Every adapter command is logged:

```typescript
{
  timestamp: ISO8601,
  adapterId: string,
  command: string,
  params: Record<string, unknown>,
  result: 'success' | 'error' | 'timeout',
  userId: string | 'anonymous',
  source: 'ui' | 'automation' | 'api'
}
```

### Metrics Collection

`apps/web/src/core/useMetrics.ts` + `apps/web/src/lib/metrics.ts`:

- Adapter connection duration, error rates, message throughput
- Prometheus-compatible `/metrics` endpoint on Express server
- Grafana-ready labels: `adapter_id`, `status`, `protocol`

### Monitoring Panel

`apps/web/src/components/MonitoringPanel.tsx`:

- Real-time adapter health status
- Circuit breaker state visualization
- WebSocket connection quality indicators

---

## Incident Response

### Emergency Stop

`apps/web/src/components/EmergencyStop.tsx`:

1. Immediate disconnect of all active adapters
2. All pending commands cancelled
3. Circuit breakers forced open
4. User notified via toast + audit log entry
5. Located in Settings → Danger Zone for authorized access

### Vulnerability Response SLA

| Severity | Acknowledgement | Patch        | Disclosure  |
| -------- | --------------- | ------------ | ----------- |
| Critical | 24 h            | 72 h         | After patch |
| High     | 48 h            | 7 days       | After patch |
| Medium   | 7 days          | 30 days      | Coordinated |
| Low      | 14 days         | Next release | Changelog   |

See [SECURITY.md](../SECURITY.md) for reporting instructions.

---

## References

- [OWASP Top 10 (2021)](https://owasp.org/Top10/)
- [EEBUS SPINE/SHIP Protocol Security](https://www.eebus.org/)
- [VDE-AR-E 2829-6](https://www.vde.com/)
- [§14a EnWG — Steuerbare Verbrauchseinrichtungen](https://www.gesetze-im-internet.de/enwg_2005/)
- [OpenSSF Supply Chain Security](https://openssf.org/)
