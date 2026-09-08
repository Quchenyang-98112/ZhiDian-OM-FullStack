# Security Roadmap 2026 — Nexus-HEMS-Dash

> **Status:** Active
> **Last Updated:** 2026-05-11
> **Horizon:** Q2–Q4 2026

This document consolidates all security-related planning, findings, and remediation actions for
Nexus-HEMS-Dash. It supplements `docs/Security-Architecture.md` (threat model) and
`docs/Security-Remediation-2026-04.md` (past fixes).

## Scope Classification (Verified 2026-04-26)

This roadmap now distinguishes between work that is already implemented, work that is only
partially complete, and work that is intentionally deferred beyond the current v1.2.0 completion
slice.

| Topic | Classification | Notes |
|------|----------------|-------|
| Redis-backed JTI revocation | Implemented | `jwt-utils.ts` supports Redis with in-memory fallback; production hardening is now operational/documentation work, not a missing feature |
| Weekly dependency audit automation | Implemented | GitHub Actions already runs `pnpm audit` plus SBOM/scan workflows |
| Renovate dependency management | Implemented | `.renovaterc.json` is active; remaining work is policy tuning and report hygiene |
| PII masking in AI pipeline | ✅ Implemented | Canonical `sanitizeUntrustedText`/`sanitizeObjectStrings` in `@nexus-hems/shared-types`; wired at AI client, WS egress (`safeSend`), and energy-store adapter ingress (v1.2.0) |
| CSP hardening | ✅ Implemented (v1.2.0) | Express and meta-CSP harmonized: `worker-src 'self'`, all AI provider connect-src, `img-src https:`, build-nonce bridge for Express-served HTML inline scripts |
| EEBUS mTLS certificate UX | Partially complete | SHIP trust store and certificate-management surface exist; lifecycle automation remains later work |
| OCPP Security Profile 3 | Partial scaffolding | Schemas and config surface exist; full certificate lifecycle and revocation remain out of scope for the initial completion slice |

---

## Current Security Posture (Baseline)

### Strengths

| Control | Implementation | Maturity |
|---------|---------------|---------|
| JWT dual-key rotation | `apps/api/src/jwt-utils.ts` | HIGH |
| JWT entropy validation | Warns on weak/short secrets | HIGH |
| AES-GCM 256-bit AI key vault | `apps/web/src/lib/ai-keys.ts` | HIGH |
| Helmet CSP (strict prod) | `apps/api/src/middleware/security.ts` | HIGH |
| Rate limiting (global + per-endpoint) | 100/min global, 5/min auth endpoints | HIGH |
| CORS allowlist | Prod: GitHub Pages only | HIGH |
| Command Safety Layer | Zod validation + rate limit + audit trail | HIGH |
| Zod schema validation | All WebSocket commands + API boundaries | HIGH |
| Pre-commit secret detection | gitleaks v8.24.3 | HIGH |
| Anti-Trojan-Source | Unicode bidi homoglyph prevention | HIGH |
| CodeQL SAST | Weekly + PR triggers | HIGH |
| Semgrep SAST | Weekly + PR triggers | HIGH |
| OpenSSF Scorecard | Weekly score tracking | MEDIUM |
| Container hardening | non-root, read_only, no-new-privileges, seccomp | HIGH |
| NetworkPolicy (Helm) | Pod-to-pod isolation | HIGH |
| Permissions-Policy | ~15 browser APIs blocked | HIGH |

### Adversarial Audit Findings (2026-04-25) — Post-Remediation Status

An adversarial audit was conducted on 2026-04-25 identifying 27 findings (4 CRIT, 9 HIGH, 9 MED, 5 LOW).
All critical and most high-severity findings have been remediated. See also
`docs/Security-Audit-Adversarial-2026-04.md` and `docs/Security-Remediation-2026-04.md`.

#### Critical Findings — ALL FIXED ✅

| ID | Finding | Remediation | Status |
|----|---------|-------------|--------|
| **CRIT-01** | API key could request any scope (privilege escalation) | `API_KEY_SCOPE_MAP` + `clampScope()` in `auth.ts`; `clampScope()` called in `auth.routes.ts` | ✅ Fixed |
| **CRIT-02** | WebSocket commands bypassed JWT scope checks | `checkScopeAuthorization()` in `energy.ws.ts`; scope extracted in `authenticateWS()` | ✅ Fixed |
| **CRIT-03** | JWT_SECRET_NEW never loaded — rotation was cosmetic | `loadSecret(preferNew=true)` in `jwt-utils.ts`; `rotateIfNeeded()` uses `JWT_SECRET_NEW` | ✅ Fixed |
| **CRIT-04** | Grafana default password `nexus-hems` in public repo | `${GRAFANA_PASSWORD:?error}` shell expansion — fails if unset | ✅ Fixed |

#### High Findings — ALL FIXED ✅

| ID | Finding | Remediation | Status |
|----|---------|-------------|--------|
| **HIGH-01** | InfluxDB token in localStorage | Excluded from Zustand persist middleware; refs removed from serialized state | ✅ Fixed |
| **HIGH-02** | Timing-unsafe share token comparison | `timingSafeEqual()` constant-time XOR in `sharing.ts` | ✅ Fixed |
| **HIGH-03** | Flux query injection (no field allowlist) | `ALLOWED_ENERGY_FIELDS` Set + `validateFluxField()` in `influxdb-client.ts` | ✅ Fixed |
| **HIGH-04** | JWT in WebSocket URL (logs/history) | WS ticket system (`/api/auth/ws-ticket`, 60s single-use UUID) | ✅ Fixed |
| **HIGH-05** | Background sync unauthenticated commands | `getAuthHeader()` required; throws if no token; `Authorization` on every fetch | ✅ Fixed |
| **HIGH-06** | EEBUS trust store in-memory only | Scope-guarded EEBUS routes + certificate UI planned (Phase 3) | ✅ Fixed (partial) |
| **HIGH-07** | No per-IP WS connection rate limit | `WS_MAX_CONNECTIONS_PER_IP = 10`, enforced in `energy.ws.ts` | ✅ Fixed |
| **HIGH-08** | CORS allows localhost in production | `HIGH-08` conditional: localhost only in non-production | ✅ Fixed |
| **HIGH-09** | AI API keys lost on reload | Vault passphrase persists in Dexie `settings` table via `secure-store.ts` | ✅ Fixed |

#### Medium Findings — Partially Addressed

| ID | Finding | Status |
|----|---------|--------|
| **MED-01** | JWT missing `iss`/`aud` claims | ✅ Fixed — both present |
| **MED-02** | No JTI revocation | ✅ Fixed — Redis + in-memory fallback (ADR-003) |
| **MED-03** | nginx CSP `wss://localhost:*` in production | ✅ Fixed — `WS_ORIGINS` env var |
| **MED-04** | Rate limit bypass via X-Forwarded-For | ✅ Fixed — uses `req.ip` |
| **MED-05** | Health endpoint leaks JWT metadata | ✅ Fixed — removed kid/rotationDueIn |
| **MED-06** | Share tokens + emails in localStorage | ✅ Mitigated (v1.3.0) — `POST /api/shares` + single-use redeem; client stores minimal ref when JWT present; Keycloak links use `shareId:token` composite |
| **MED-07** | Service Worker caches AI API responses | ✅ Fixed — NetworkOnly strategy |
| **MED-08** | WSCommand cap mismatch (50kW vs 25kW) | ✅ Fixed — aligned to 25kW |
| **MED-09** | AI prompt injection via adapters | ✅ Fixed — `sanitizeForPrompt()` |

### Open Gaps (Updated 2026-04-25)

| ID | Gap | Severity | Fix Phase |
|----|-----|----------|-----------|
| G-01 | JTI Revocation in-memory only | HIGH | ✅ Phase 3 Done |
| G-02 | Grype/cosign not wired in CI (syft SBOM + pnpm audit only) | HIGH | ⏳ SUPPLY-01 |
| G-03 | Distroless not used in production | MEDIUM | ✅ Phase 1 Done |
| G-07 | PII scanning missing in AI prompts | MEDIUM | ✅ Phase 3 Done |
| G-08 | Helm PSS Labels (K8s PSP deprecated) | MEDIUM | ✅ Phase 1 Done |
| NEW-01 | MED-06 residual (offline demo mode) | LOW | Demo/localStorage fallback only |
| NEW-02 | Observability: JTI/JWT/EEBUS Prometheus counters | LOW | ✅ Added `security-metrics.ts` (v1.3.0) |

---

## JWT Key Rotation

### Current Implementation

- **Algorithm:** HMAC-SHA256 (`HS256`)
- **Dual-key support:** `JWT_SECRET` (current) + `JWT_SECRET_NEW` (in-rotation)
- **Key ID (`kid`):** SHA-256 prefix of secret or optional `JWT_KID_PRIMARY` / `JWT_KID_NEW`
- **Verification priority:** header `kid` hint when present; else signing secret then legacy `JWT_SECRET`
- **Rotation trigger:** env/file reload via `POST /api/auth/rotate-key` (admin) or process restart

### Target Implementation (Phase 3)

- **Automated rotation:** optional cron/script calling admin reload endpoint
- **Zero-downtime:** dual-key window (`JWT_SECRET` + `JWT_SECRET_NEW`) — shipped v1.3.0
- **Redis-backed JTI revocation:** revoked tokens survive server restarts (see ADR-003)

```bash
# Cron entry (run as CI/CD service account)
0 2 1 * * /opt/nexus-hems/scripts/rotate-jwt-key.sh >> /var/log/jwt-rotation.log 2>&1
```

### Rotation Procedure

1. `JWT_SECRET_NEW=<new_64_byte_hex>` → add to `.env.prod` / Docker secrets
2. Deploy (server now accepts both old and new tokens)
3. Wait 24 h (all tokens issued with old key expire naturally)
4. `JWT_SECRET=<new>` → remove `JWT_SECRET_NEW`
5. Re-deploy (rotation complete)

---

## Container Supply Chain Security

### SBOM & Vulnerability Scanning (Phase 1)

```yaml
# .github/workflows/sbom-scan.yml
- name: Generate SBOM (syft)
  uses: anchore/sbom-action@v0
  with:
    image: nexus-hems-dash:${{ github.sha }}
    format: spdx-json
    output-file: sbom.spdx.json

- name: Scan vulnerabilities (grype)
  uses: anchore/scan-action@v3
  with:
    image: nexus-hems-dash:${{ github.sha }}
    fail-build: true
    severity-cutoff: critical
```

### Image Signing (SLSA L2)

```yaml
# deploy.yml — post-build step
- name: Sign image (cosign)
  uses: sigstore/cosign-installer@v3
  run: |
    cosign sign --yes ${{ env.REGISTRY }}/nexus-hems-dash@${{ steps.build.outputs.digest }}
```

### Distroless Migration (Phase 1, ADR-004)

- **Backend:** `gcr.io/distroless/nodejs24-debian13` — no shell, no package manager
- **Frontend:** `nginxinc/nginx-unprivileged:1.29-alpine-slim` — tighter permissions
- **Attack surface reduction:** ~80% fewer OS packages in production image

---

## AI Security (Phase 3)

### Prompt Injection Prevention

**Current:** `sanitizeForPrompt()` and `filterAIOutput()` already mask core PII classes
(email, phone, IBAN, IPv4) and filter model output before rendering.

**Remaining v1.2 completion work (ADR-008):**
1. Apply the same sanitization policy consistently to adapter-originated labels and free-text fields
2. Sanitize WebSocket-visible outbound payload fields that may surface human-entered device names or labels
3. Verify that optimization prompts stay numeric/context-scoped by default and document the boundary clearly

### API Key Security

- Keys encrypted AES-GCM 256-bit in Dexie IndexedDB
- Never in environment variables, localStorage, or sessionStorage
- Vault passphrase origin-isolated (HIGH-09 fix, 2026-04)

---

## EEBUS mTLS Certificate Management (Phase 3)

### Current State

- TLS 1.3 mTLS is declared in `EEBUSAdapter.ts`
- SHIP trust-store routes and persistent trust storage are implemented
- `CertificateManagement.tsx` already exposes the current trust-store and pairing UI surface
- Automated certificate rotation and broader lifecycle automation are still not implemented

### Remaining Work

1. Finish operator-facing documentation for public PKI vs LAN/self-signed deployments
2. Tighten certificate import/export and rotation workflows around the existing UI
3. Keep `cert-manager-issuer.yaml` optional and documented, not assumed as default runtime infrastructure
4. Defer full automated certificate lifecycle management to a later release if it would expand beyond the current v1.2.0 slice

---

## OCPP 2.1 Security Profile 3

### Status: Partial Scaffold, Not Full v1.2.0 Completion

OCPP 2.1 defines three security profiles:
- **Profile 0:** No security (dev/testing only)
- **Profile 1:** HTTP Basic Auth
- **Profile 2:** TLS 1.2+ with server certificates
- **Profile 3:** TLS 1.3 + client certificates (mTLS)

Current implementation exposes security-profile configuration and mTLS-related schema surface, but
full Profile 3 operational completeness is not finished. Remaining requirements include:
- Client certificate management (see EEBUS mTLS above)
- Certificate rotation automation
- Revocation via CRL or OCSP

Recommended v1.2.0 boundary: configuration validation and certificate-management UX only. Full
revocation and lifecycle automation should be tracked as follow-up work unless they become an
explicit release gate.

---

## Dependency Security

### Active Overrides

All `pnpm.overrides` in `package.json` are actively maintained for CVE mitigation:

| Package | Override | Reason |
|---------|----------|--------|
| `protobufjs` | `>=7.5.5` | Prototype pollution CVE-2022-25878 |
| `undici` | `>=7.0.0` | HTTP request smuggling CVEs |
| `cross-spawn` | `>=7.0.6` | Shell escape vulnerability |
| `@xmldom/xmldom` | `>=0.9.0` | XML BOM handling fix |
| `basic-ftp` | `>=5.3.0` | Buffer overflow |
| `serialize-javascript` | `>=7.0.5` | Prototype pollution |

### Renovate Hardening

`.renovaterc.json` configured with:
- `rangeStrategy: "bump"` — always update to newest non-breaking version
- Weekly Monday schedule with immediate vulnerability-alert handling
- Group: production deps and dev deps separately
- Auto-merge: patch and minor updates after CI; major updates remain manual review

### Additional Scanners

- **Socket.dev:** Supply chain risk scoring (npm package trust score)
- **pnpm audit:** Production-only audit on every push/PR via the `security` job in `ci.yml` and the `dependency-check` job in `security-full.yml` (single push gate after Phase-2 consolidation, May 2026). Full audit incl. dev-deps runs weekly (Mon 05:00 UTC) via `security-full.yml` — folded in from the deleted `security-scan.yml` (ADR-027).
- **Snyk:** Container + code scanning (token required: `SNYK_TOKEN` secret)

---

## Compliance Notes

### GDPR (EU) Implications

| Data type | Storage | Retention | GDPR basis |
|-----------|---------|-----------|-----------|
| Energy snapshots | IndexedDB (local) | 50 000 items (~30 days) | Legitimate interest |
| AI keys | Encrypted IndexedDB | Until deleted by user | User consent |
| Command audit trail | IndexedDB | 10 000 entries | Legal obligation |
| JTI revocation | In-memory / Redis | TTL = token expiry | Security obligation |

**No personal data is transmitted to external servers** without user-provided AI API keys.
The AI key vault stores keys encrypted locally — never synced to any external service.

### §14a EnWG (Germany — Smart EV Charging)

Nexus-HEMS implements §14a EnWG compliance:
- 4.2 kW grid charge cap during Sperrzeiten
- SG-Ready signals for heat pump control
- Dynamic grid fee integration (Tibber, aWATTar)

See `docs/adr/ADR-003` and `apps/web/src/lib/tariff-providers.ts` for implementation.

---

## Security Contacts

- **Security reports:** See `SECURITY.md` for responsible disclosure policy
- **PGP Key:** See `SECURITY.md` PGP Key Verification section
- **SLA:** Critical: 48 h, High: 2 weeks, Medium: 30 days (see `SECURITY.md` SLA Matrix)

---

## Upcoming Reviews

| Date | Scope | Trigger |
|------|-------|---------|
| 2026-05-01 | Phase 1 validation (SBOM, Grype, Distroless) | Post-Phase-1 implementation |
| 2026-06-01 | Sanitization and CSP completion review | After adapter/WebSocket boundary hardening |
| 2026-Q3 | EEBUS mTLS + OCPP Profile 3 follow-up planning | After v1.2.0 completion scope is closed |
| 2026-Q4 | Multi-user RBAC threat model | v1.2.0 pre-implementation |
