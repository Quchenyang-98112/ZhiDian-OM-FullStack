# Audit Verification Report — 2026-07-04 (Cloud Agent)

**Repository:** `qnbs/Nexus-HEMS-Dash`  
**Branch:** `cursor/audit-remediation-f380`  
**Baseline HEAD (pre-remediation):** `91c53d94960504627c7511d5efbe78cea294ba41` (later than audit `5d42769`)  
**Package version:** `1.9.0` (unchanged — manual release policy ADR-015)  
**Agent:** Cursor Cloud Agent (Composer 2.5)  
**Remediation scope:** Post-v1.9.0 audit residual gaps WS-1 … WS-6

---

## Executive summary

| Workstream | Result | Commit |
|------------|--------|--------|
| WS-1 AnalyticsPage complexity | ✅ Complexity ≤25; dead suppression removed | `refactor(web): reduce AnalyticsPage complexity…` |
| WS-2 Adapter inventory truth-sync | ✅ Prose aligned to **13 (7 core + 6 contrib)** | `docs: correct adapter inventory…` |
| WS-3 GitHub Pages 403 | ✅ Site HTTP **200** at verify time; runbook + CI verify job added | `ci(deploy): harden Pages deployment…` |
| WS-4 Biome warn → error ratchet | ⏸️ **Deferred** — 4 CSS warnings remain (see §4) | *(no commit)* |
| WS-5 Security re-verification | ✅ All five controls present in code | `docs(security): record 2026-07-04…` |
| WS-6 Hygiene | ✅ TODO ticketed; CHANGELOG `[Unreleased]` sane; `act()` wrap | `chore: minor hygiene…` |

**Regression gate:** All mandatory checks green; test count **1418** (1048 web + 370 api), **0 failing**.

---

## 1 · Baseline vs closing gates

### Environment

```text
node -v          → v24.18.0 (via nvm; VM default /exec-daemon/node is v22 — use nvm PATH)
pnpm -v          → 10.33.0
package version  → 1.9.0
```

### Before remediation (baseline)

| Gate | Result |
|------|--------|
| `pnpm install --frozen-lockfile` | ✅ |
| `pnpm type-check` | ✅ 0 errors |
| `pnpm lint` | ✅ exit 0, **6 Biome warnings** (2× AnalyticsPage + 4× `index.css` noDescendingSpecificity) |
| `pnpm test:run` | ✅ **1418** passed (1048 web / 370 api) |
| `pnpm build` | ✅ |
| `pnpm audit --prod` | ✅ No known vulnerabilities |

### After remediation (closing)

```bash
pnpm install --frozen-lockfile   # ✅ Done in 1.5s
pnpm type-check                  # ✅ Tasks: 4 successful, 4 total — 0 errors
pnpm lint                        # ✅ exit 0 — 4 warnings (index.css only; AnalyticsPage clean)
pnpm test:run                    # ✅ 1418 passed, 0 failed
pnpm build                       # ✅ Tasks: 3 successful
pnpm audit --prod                # ✅ No known vulnerabilities
pnpm --filter @nexus-hems/web exec vitest run src/tests/i18n.test.ts src/tests/i18n-sync.test.ts
                                 # ✅ 2 files, 9 tests passed — EN/DE parity intact
```

**Lint delta:** AnalyticsPage `noExcessiveCognitiveComplexity` (31) and `suppressions/unused` **eliminated**. Remaining 4 warnings are `lint/style/noDescendingSpecificity` in `apps/web/src/index.css` (pre-existing).

**Test delta:** 1418 → 1418 (no regression).

---

## 2 · Adapter inventory (code anchor)

| Category | Count | Modules (`apps/web/src/core/adapters/`) |
|----------|-------|----------------------------------------|
| Core | **7** | VictronMQTT, ModbusSunSpec, KNX, OCPP21, EEBUS, Evcc, OpenEMS |
| Contrib (shipped) | **6** | exec-adapter, homeassistant-mqtt, matter-thread, openadr-3-1, shelly-rest, zigbee2mqtt |
| Template (not shipped) | 1 | `contrib/example-contrib.ts` |
| **Total shipped** | **13** | Matches README badge `Adapters-13_(7+6)` |

---

## 3 · Security posture — code-anchored evidence

### CRIT-03 — JWT production-fatal entropy (`apps/api/src/jwt-utils.ts`)

```209:243:apps/api/src/jwt-utils.ts
export function checkSecretEntropy(secret: string, source: string, isProd: boolean): void {
  // ...
  if (hasWeakPattern) {
    if (isProd) {
      throw new Error(
        `[JWT] FATAL: ${source} contains a known-weak pattern. Refusing to start in production. ` +
```

```237:243:apps/api/src/jwt-utils.ts
  if (estimatedEntropy < 128) {
    if (isProd) {
      throw new Error(
        `[JWT] FATAL: ${source} has insufficient entropy for production. Refusing to start. ` +
```

- Production: **throws** on weak pattern or entropy `< 128` bits.
- Dev/test: `console.error` warn-only (lines 231–234, 244+).
- Messages never log secret, length, or entropy (documented lines 205–206, 240).

### CSWSH — WebSocket origin verification (`apps/api/src/index.ts`, `ws-origins.ts`)

```88:107:apps/api/src/index.ts
  const wsOriginAllowlist = parseWsOrigins(process.env.WS_ORIGINS);
  const wss = new WebSocketServer({
    server,
    maxPayload: 64 * 1024,
    verifyClient: ({ origin }, cb) => {
      if (!origin) {
        cb(true);
        return;
      }
      if (isAllowedWsOrigin(origin, wsOriginAllowlist)) {
        cb(true);
        return;
      }
      if (isDev && wsOriginAllowlist.length === 0) {
        cb(true);
        return;
      }
      logger.warn('Rejected WebSocket upgrade from disallowed origin', { origin });
      cb(false, 403, 'Forbidden origin');
    },
  });
```

```50:54:apps/api/src/config/ws-origins.ts
export function isAllowedWsOrigin(origin: string, allowlist: string[]): boolean {
  const normOrigin = normalizeOrigin(origin);
  if (!normOrigin) return false;
  return allowlist.some((entry) => normalizeOrigin(entry) === normOrigin);
}
```

- Present-but-disallowed browser origins → **`cb(false, 403)`**.
- Empty allowlist in production → `isAllowedWsOrigin` returns **false** for any normalised origin → 403 (fail-closed for browser clients).
- **Missing `Origin` header** → allowed (`cb(true)`) for non-browser WS clients — documented in `ws-origins.ts` lines 46–48.

### ADR-026 — Non-extractable vault key (`apps/web/src/lib/crypto.ts`, `secure-store.ts`, `ai-keys.ts`)

```74:77:apps/web/src/lib/crypto.ts
export async function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
```

- Second argument `extractable: false` — raw key bytes cannot be exported.
- `secure-store.ts` persists opaque `CryptoKey` handle in IndexedDB; `ai-keys.ts` encrypts BYOK material with vault key.

### SSRF DNS pinning (`apps/api/src/services/OcppProxyRelay.ts`, `private-host.ts`)

```27:44:apps/api/src/services/OcppProxyRelay.ts
async function resolvePinnedTarget(
  host: string,
): Promise<{ connectHost: string; servername?: string } | null> {
  // ...
    const records = await lookup(host, { all: true });
    if (records.length === 0 || !records.every((r) => isPrivateHost(r.address))) {
      return null;
    }
```

```3:7:apps/api/src/config/private-host.ts
// Note: 169.254.0.0/16 (link-local) is deliberately NOT allowed. It covers the
// cloud metadata endpoint 169.254.169.254 (SSRF against IMDS)
```

- `isPrivateHost('169.254.169.254')` → **false** (test: `eebus-revocation-host.test.ts`).
- Shelly/OpenADR/EEBUS routes also gate on `isPrivateHost` (`shelly-webhook.routes.ts`, `openadr.routes.ts`, `eebus.routes.ts`).

### CSP — production `unsafe-inline` drop (AUD-02)

```87:104:apps/api/src/middleware/security.ts
// AUD-02: production drops style-src 'unsafe-inline' when buildNonce is present
export function configureHelmet(app: Express, isDev: boolean, buildNonce?: string): void {
  // ...
        ? {
            directives: {
              // dev: styleSrc includes 'unsafe-inline'
```

- Production path uses `buildProductionStyleSrc(buildNonce)` from `csp-nonce.ts` (no `unsafe-inline` when nonce present).
- `apps/web/scripts/sync-tauri-csp.ts` + `tauri-csp.test.ts` — Tauri prod nonce sync.
- `apps/web/scripts/smoke-prod-build.mjs` — asserts meta CSP has no `unsafe-inline`.
- Tests: `helmet-csp.test.ts`, `csp-nonce.test.ts`.

**Security verdict:** ✅ No downgrade detected. All five controls verified in source.

---

## 4 · WS-4 — Biome warning ratchet (deferred)

Post WS-1 measurement:

```bash
npx biome check apps/web/src apps/api/src 2>&1 | grep -c "lint/"
# → 4
```

All 4 are `lint/style/noDescendingSpecificity` in `apps/web/src/index.css` (lines ~1880, 1926, 1945, 2040).

**Decision:** Do **not** add `--error-on-warnings` to the web `lint` script in this pass — would turn a green gate red without addressing root CSS ordering.

**Follow-up ratchet plan:**

1. Reorder conflicting selectors in `index.css` (or split into scoped layers) to clear 4 warnings.
2. Re-run `npx biome check apps/web/src` → expect 0 warnings.
3. Add `--error-on-warnings` to `apps/web/package.json` `"lint": "biome check --error-on-warnings src/ && …"`.

---

## 5 · GitHub Pages 403 status

| Check | Result (2026-07-04 ~07:15 UTC) |
|-------|--------------------------------|
| `curl -sI https://qnbs.github.io/Nexus-HEMS-Dash/` | **HTTP 200** |
| `gh api repos/.../pages` | `build_type: workflow`, `public: true` |
| Latest Deploy run | `28698466590` — **success** |

Audit-time 403 was likely transient or environment-related. Maintainer runbook: `docs/runbooks/Pages-403-Remediation.md`. CI now includes `verify-pages` job post-deploy.

---

## 6 · Hygiene notes

| Item | Action |
|------|--------|
| Sole `TODO` in `apps/web/src` / `apps/api/src` | Ticketed **LOW-11** in `docs/Technical-Debt-Registry.md` (`energy-controllers.ts:107`) |
| `[Unreleased]` CHANGELOG | Accurate — CRIT-03, AUD-02, WS-8, LOW-08, MED-12, HIGH-12, ADR-015 documented; left untagged per policy |
| `query-client.test.ts` `act()` warnings | Wrapped `QueryProvider` render in `act()` — cosmetic React 19 suspend noise reduced |

---

## 7 · Maintainer action items

| Priority | Item | Owner |
|----------|------|-------|
| 🟡 | Clear 4 `index.css` Biome warnings, then enable `--error-on-warnings` | Dev |
| 🟢 | If Pages 403 recurs despite green Deploy → follow `docs/runbooks/Pages-403-Remediation.md` | Maintainer |
| 🟢 | LOW-11: wire ESS `maxChargePower` from device registry | Backlog |

No 🔴 STOP-AND-ASK items — no coverage threshold reductions, no security downgrades, no version bumps.

---

*Generated by Cursor Cloud Agent remediation run 2026-07-04.*
