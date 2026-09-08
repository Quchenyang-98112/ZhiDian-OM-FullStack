# Feature Status — Nexus-HEMS-Dash

**Version:** 1.11.1 tagged (2026-09-01); `main` @ `c4e7939` unreleased (+15 commits after tag)  
**Last updated:** 2026-09-02 (Stream F protocol depth + review follow-ups; offline sync Stream C)  
**Purpose:** Single source of truth for what is actually implemented, partial, or planned. Use this file to keep README/marketing claims synchronized with the codebase.

> **Operational note (2026-09-02):** Tag `v1.11.1` (`1716a42`) covers the Sep 2026 post-freeze campaign (#329–#341). **`main` is ahead** with offline sync Stream C (#354), protocol depth Stream F (#355–#356), demo i18n (#353), and CI/review policy work (#347–#351). Do not equate the live Pages demo version footer (`v1.11.1`) with current `main` HEAD. See `docs/Campaign-Handoff-2026-09.md` and `docs/Release-History.md`.
>
> **Rule:** Any PR that changes a feature's implementation status must update this file and the relevant docs before merging.

---

## Legend

| Symbol | Meaning |
| ------ | ------- |
| ✅ Shipped | Implemented and covered by tests in `main` |
| ⚠️ Partial | Core pieces exist but not end-to-end complete |
| 🔄 In Progress | Active work in current sprint/phase |
| ⏳ Planned | Roadmap item, not yet implemented |
| ❌ Not Planned | Explicitly deferred or removed |

---

## Protocol Adapters

| Protocol | Frontend Adapter | Backend Adapter | Notes |
| :------- | :--------------- | :-------------- | :---- |
| Victron MQTT (Cerbo GX / Venus OS) | ✅ | ✅ | Browser adapter supports direct MQTT-over-WebSocket. Backend `MqttAdapter` (`apps/api/src/protocols/mqtt/MqttAdapter.ts`) subscribes role-tagged Victron Venus OS topic patterns and emits Zod-validated datapoints to the EventBus; in live mode these reach the UI via the `LiveEnergyAggregator` WebSocket bridge (HIGH-17). |
| Modbus/SunSpec (103/124/201) | ✅ | ✅ | `GET /api/modbus/sunspec` + `POST /api/modbus/write` REST proxy (`routes/modbus.routes.ts`) serves the in-browser `ModbusSunSpecAdapter` a mock SunSpec gateway (validated, audited writes; live register writes via an external bridge). The backend `ModbusAdapter` polls `device-map.json` into the EventBus; role-tagged registers reach the UI in live mode via the `LiveEnergyAggregator` bridge (HIGH-17). |
| KNX/IP floorplan | ✅ | ✅ | Browser adapter for floorplan/room control. Backend `KnxAdapter` (`apps/api/src/protocols/knx/KnxAdapter.ts`) connects to a knxd/custom WebSocket JSON bridge, maps group addresses from `knx-ga-map.json`, and emits Zod-validated datapoints to the EventBus (MED-20). Enable with `KNX_BRIDGE_WS_URL` + live mode. |
| OCPP 2.1 V2X (ISO 15118) | ✅ (P1 enhanced) | ✅ | Frontend adapter + backend `OcppCsmsProtocolAdapter` CSMS gateway (SP0) with outbound EV commands (`SetChargingProfile`, `RequestStart/StopTransaction`, `SET_V2X_DISCHARGE`, `SET_GRID_LIMIT`) via `ProtocolCommandRouter` (Phase 7). SP3 mTLS via `/ws/ocpp` API proxy (HIGH-12). |
| EEBUS SPINE/SHIP | ✅ | ✅ | Full backend `IProtocolAdapter` (`apps/api/src/protocols/eebus/EebusProtocolAdapter.ts`) connects to all trusted devices in the trust store, maintains persistent SHIP sessions, parses SPINE `measurementListData` + `loadControlLimitListData` datagrams, and emits role-tagged `UnifiedEnergyDatapoint` to the EventBus. Registered in `protocols/index.ts`. Frontend `CertificateManagement.tsx` wired into Settings → EEBUS Certs tab. Supported use cases: MPC, MGCP, LPC (§14a EnWG), EV charging, heat pump. Trust-store polling for newly paired devices. Unit tests: `EebusProtocolAdapter.test.ts` (17 cases). |
| evcc backend | ✅ | ✅ | Browser adapter for direct REST+WS. Backend `EvccAdapter` (`apps/api/src/protocols/evcc/EvccAdapter.ts`) polls `/api/state` and subscribes to `/ws`, emitting role-tagged datapoints to the EventBus (MED-20). Enable with `EVCC_BASE_URL` in live mode. |
| OpenEMS Edge (JSON-RPC) | ✅ | ✅ | Browser `OpenEMSAdapter` + backend `OpenEMSProtocolAdapter` with EV + battery/heat-pump/grid writes via `ProtocolCommandRouter` (Phase 5–6). Configurable `OPENEMS_*_CTRL_ID` env vars. |
| Home Assistant MQTT | ✅ (contrib, dual-mode) | ⚠️ | Frontend: ha-ws-api + MQTT discovery, commands. Backend: **ha-ws-api** telemetry + EV/heat-pump `call_service`; returns `handled: false` when command entities are not configured so other adapters can serve the command. **MQTT broker** telemetry + MQTT service publish (`HomeAssistantMqttProtocolAdapter`, Phase 6). |
| ExecAdapter (Custom Scripts) | ✅ (contrib, new) | ✅ (new) | Safe shell script integration: whitelisted scripts only (`EXEC_SCRIPTS_CONFIG`), argv-array execution (no shell), 30s timeout, 64 KB output cap, `READ_ONLY_MODE` compliance. Frontend `ExecAdapter`, backend `ExecService` + `/api/exec/*` routes. |
| Matter/Thread | ✅ (contrib) | ⚠️ | Frontend contrib adapter. Backend **Phase 2** (`MatterProtocolAdapter`): WS telemetry + `SET_HEAT_PUMP_MODE` write via `MATTER_BRIDGE_HOST` and **required** `MATTER_HEAT_PUMP_NODE_ID` (no first-node fallback). |
| Zigbee2MQTT | ✅ (contrib, P1 enhanced) | ⚠️ | Frontend: role classification, EV/heat-pump plugs, availability tracking. Backend **Phase 2** (`Zigbee2MQTTProtocolAdapter`): mqtt.js bridge + `SET_HEAT_PUMP_MODE` / `SET_HEAT_PUMP_POWER` / `SET_EV_POWER` via `Z2M_HEAT_PUMP_DEVICE` / `Z2M_EV_DEVICE`; rejects non-finite power values. |
| Shelly REST (Gen1/2/3) | ✅ (contrib, P1 enhanced) | ✅ (webhook route) | Gen1 support (GET /status); auto-detect generation; SET_RELAY command; pv capability; 3-phase phases[] disaggregation; /api/shelly/webhook push receiver (ShellyWebhookBus). |
| OpenADR 3.1 VEN | ✅ (contrib) | ⚠️ | Frontend contrib adapter + backend OAuth2 proxy (`routes/openadr.routes.ts`): token, events, programs, webhook buffer (demo), reports, ack; VTN relay bounded by 15s timeout. DR events aggregate LOAD_CONTROL limits and dispatch `SET_HEAT_PUMP_MODE` / `SET_HEAT_PUMP_POWER` / `SET_EV_POWER` via `openadr-hardware-dispatch.ts`. |
| Example template | ✅ (contrib) | ⏳ | Template for custom adapters — not counted in the shipped 13-adapter inventory. |

> **Shipped frontend count:** 13 adapters (7 core + 6 contrib). The Example row above is a development template only (`example-contrib.ts`).

> **Backend keystone (HIGH-17, ADR-018) — RESOLVED:** the WebSocket gateway now subscribes to the
> EventBus via `LiveEnergyAggregator` (`apps/api/src/services/LiveEnergyAggregator.ts`), which folds
> role-tagged datapoints into the `EnergyData` snapshot. In live mode with fresh data the gateway
> broadcasts real adapter data; otherwise it falls back to mock byte-for-byte. This unblocks backend
> protocol parity (MED-20) and per-adapter metrics (MED-18). See `docs/Audit-Report-2026-07-02.md`.

---

## Core Application

| Feature | Status | Evidence / Notes |
| :------ | :----- | :--------------- |
| Unified Command Center (7 sections, 8 routes) | ✅ | `apps/web/src/App.tsx` |
| PWA offline-first | ✅ | `vite-plugin-pwa`, service worker handling in `main.tsx`, Dexie cache |
| 5 themes | ✅ | `apps/web/src/design-tokens.ts` |
| Full i18n DE/EN | ✅ | `apps/web/src/locales/en.ts`, `de.ts`; parity test |
| WCAG 2.2 AA automated | ✅ | axe-core Playwright tests |
| WCAG 2.2 AA manual screen-reader pass | ⏳ | Documented in `docs/Accessibility-Testing-Guide.md`; no executed run evidenced |
| Real-time D3.js Sankey flow | ✅ | `apps/web/src/components/SankeyDiagram.tsx` |
| AI optimizer (multi-provider BYOK) | ✅ | `apps/web/src/core/aiClient.ts`, encrypted key storage |
| MPC day-ahead optimizer | ✅ | `apps/web/src/lib/optimizer.ts` |
| 8 real-time controllers | ✅ | `apps/web/src/core/energy-controllers.ts` |
| 24h/7d predictive forecast | ✅ | `apps/web/src/components/PredictiveForecast.tsx`, `lib/ml-forecast.ts` |
| Live tariff widget (Tibber/aWATTar/Octopus/Nordpool) | ✅ | `apps/web/src/lib/tariff-providers.ts` |
| Smart EV charging (§14a EnWG) | ✅ | Frontend OCPP P1 + backend CSMS gateway with outbound smart-charging + V2G/grid-limit commands (Phase 5–7); SP3 mTLS via API proxy |
| SG Ready heat pump control | ✅ | UI sends `SET_HEAT_PUMP_MODE` (modes 1–4); `HeatPumpSGReadyController` → `controller-command-bridge`; backend `HeatPumpAdapter` Modbus write + HA WS/MQTT/EEBUS/Matter/Zigbee parity |
| Hardware registry (190 devices, ~50 brands) | ✅ | Catalog browser at `/settings/hardware` (`HardwareRegistryPage.tsx`) with search + category/manufacturer/protocol filters and add-adapter wizard (`AddAdapterWizard.tsx`, `hardware-adapter-map.ts`) — connection test + enable flow (MED-19). |
| PDF reports + QR sharing | ✅ | `apps/web/src/components/ExportAndSharing.tsx`, `lib/sharing.ts` |
| Prometheus monitoring | ✅ | `apps/api/src/middleware/metrics.ts`, `routes/metrics.routes.ts`; per-backend-adapter series via `adapter-metrics.ts` (MED-18) |
| Adapter health endpoint | ✅ | `GET /api/health` returns mode, overall status, and per-adapter state (`apps/api/src/routes/health.routes.ts`) |
| Live/Mock mode safety indicator | ✅ | Header simulation badge + `resolveConnectionPresentation()` labels static GitHub Pages deploys **Simulation** (not false **Disconnected**); counts `serverWsConnected` as **Live** when `VITE_BACKEND_WS` is on; live banner + read-only banner when applicable (`apps/web/src/lib/adapter-mode.ts`, `AppShell.tsx`) |
| GitHub Pages static demo honesty | ✅ | `AppShell.tsx` header KPI ticker and `EnergyContext` routed charts call `getDisplayData()` only when `resolveConnectionPresentation()` is **simulation**; live+disconnected shows raw store values (`apps/web/src/lib/demo-data.ts`) |
| Opt-in backend WebSocket consumer | ✅ | `VITE_BACKEND_WS` flag mounts `useServerWebSocket` (ADR-025); maps server `EnergyData` → `UnifiedEnergyModel`; Monitoring shows `serverWsConnected` pill |
| Built-in adapters disabled by default | ✅ | `isBuiltinAdapterEnabledByDefault()` returns `false`; user enables adapters in Settings (`apps/web/src/lib/adapter-mode.ts`) |
| Demo data without hardware | ✅ | Mock/simulated energy data when effective adapter mode is `mock` (`apps/api/src/data/mock-data.ts`, `EnergyContext`) |

---

## Security

| Feature | Status | Evidence / Notes |
| :------ | :----- | :--------------- |
| JWT signing/verification | ✅ | `apps/api/src/jwt-utils.ts` |
| JWT dual-key rotation (zero-downtime) | ✅ | `reloadJwtKeysFromEnv()`, `POST /api/auth/rotate-key` |
| JTI revocation (Redis + in-memory fallback) | ✅ | `apps/api/src/jwt-utils.ts` |
| JWT scopes (read/readwrite/admin) | ✅ | `apps/api/src/middleware/auth.ts` |
| API key scope clamping | ✅ | `clampScope()` in `apps/api/src/middleware/auth.ts` |
| Helmet CSP (dev + prod) | ✅ | `apps/api/src/middleware/security.ts` |
| CORS origin filtering (localhost removed in prod) | ✅ | `configureCors()` in `apps/api/src/middleware/security.ts` |
| Rate limiting (HTTP + WS) | ✅ | Express rate-limit + WS command rate limiter |
| Server-side command audit log | ✅ | `apps/api/src/data/command-audit.ts` — every WS command (accepted / rejected-validation / rejected-scope / rejected-ratelimit) appended to NDJSON with clientId, scope, and effective mode; `GET /api/v1/command-audit` (admin scope) |
| Trust proxy config | ✅ | `TRUST_PROXY` env via `resolveTrustProxy()` (`apps/api/src/config/trust-proxy.ts`); documented in Deployment Guide (MED-10) |
| BYOK AI vault (AES-GCM 256) | ✅ | `apps/web/src/lib/ai-keys.ts` |
| PII sanitization | ✅ | `@nexus-hems/shared-types/src/sanitize-text.ts` |
| Adapter mode mock default (double opt-in for live) | ✅ | Backend: `ADAPTER_MODE` + `ALLOW_LIVE_HARDWARE`; frontend: `VITE_ADAPTER_MODE` + `VITE_ALLOW_LIVE_HARDWARE` + Settings toggle (`adapter-mode.ts` both sides) |
| SLSA build attestation | ✅ | `actions/attest-build-provenance` in `ci.yml` |
| SBOM generation (syft SPDX) | ✅ | `.github/workflows/sbom-scan.yml` — frontend, backend, and source images |
| Container CVE scan (Grype) in CI | ✅ | `sbom-scan.yml` + `container-publish.yml` — critical cutoff, blocking; `.grype.yaml` targeted ignores (`docs/Supply-Chain-Grype-Policy.md`) |
| Cosign image signing in CI | ✅ | `container-publish.yml` — keyless cosign + SLSA provenance on GHCR push (`ghcr.io/qnbs/nexus-hems-dash`, `nexus-hems-server`) |
| OpenSSF Scorecard | ✅ | `.github/workflows/scorecard.yml` |
| DeepSource static analysis | ⚠️ | `.deepsource.toml` connected; **advisory only** (not a merge gate). JavaScript analyzer removed 2026-07-07 (#299/#301); secrets, Docker, and test-coverage analyzers remain (see PRF-01) |
| Unified PR feedback comment | ✅ | `.github/workflows/pr-feedback-summary.yml` |
| Multi-user RBAC | ⏳ | ADR-009 deferred |

---

## Testing & Quality

| Feature | Status | Evidence / Notes |
| :------ | :----- | :--------------- |
| Unit tests (web) | ✅ | 55+ test files; v1.3.x campaign added `settings-tabs` (21), `adapter-worker-target` (12), `hardware-registry` (11), `use-safe-command` (3); #194 added contrib-adapter tests |
| Unit tests (api) | ✅ | 10+ test files |
| E2E tests (Playwright) | ✅ | 18 spec files including `sg-ready-heat-pump`, `openadr-demo-event`, `auth-jwt`, `read-only-commands`, `adapter-mode-indicators`, `backend-websocket-live`, `safety-indicators` |
| Fuzz/property tests | ✅ | `apps/web/src/tests/security-fuzz.test.ts` |
| i18n parity test | ✅ | `apps/web/src/tests/i18n-sync.test.ts` |
| Coverage gates | ✅ | `check:coverage-baseline` enforces web (**78/72/70/80**) + ai-core (**73/51/77/73**, F-05a) via `apps/web/coverage-baseline.json` and `packages/ai-core/coverage-baseline.json`. API thresholds live in `apps/api/vitest.config.ts` but are not part of the baseline checker. |
| Lighthouse CI | ✅ | `.github/workflows/lighthouse.yml` |
| Chromatic visual regression | ✅ | `.github/workflows/chromatic.yml` |

---

## Deployment & Operations

| Feature | Status | Evidence / Notes |
| :------ | :----- | :--------------- |
| Docker frontend image | ✅ | `Dockerfile` |
| Docker server image | ✅ | `Dockerfile.server` |
| Helm chart | ✅ | `helm/nexus-hems/` — frontend `WS_ORIGINS` via `frontend.wsOrigins` (defaults to `wss://<ingress.host>`, Phase 8) |
| GitHub Pages deploy | ✅ | `.github/workflows/deploy.yml` |
| Automated container registry push | ✅ | `container-publish.yml` — GHCR push + Grype gate + cosign sign on tag/main |
| Automated Helm chart lint in CI | ✅ | `ci.yml` `helm-chart` job — `helm lint` + `helm template` smoke |
| Tauri desktop build | ⚠️ | Icons + mobile-plugin gating fixed (#236); verify via **Tauri Desktop Build** workflow (`version=1.11.0`) |
| Capacitor mobile build | ⚠️ | Core/cli at 8.x, plugins aligned in `package.json`; verify with `cap sync` |

---

## Deferred / Removed

| Feature | Status | Reason |
| :------ | :----- | :----- |
| Tauri auto-updater | ❌ Removed | Key-management overhead disproportionate for single-maintainer homelab project |
| Multi-user RBAC | ⏳ Deferred | ADR-009; planned for future release |

---

## How to update this file

1. After implementing a feature, change its status symbol and add evidence.
2. If a feature moves from ⏳ to ✅ or ⚠️, update README.md and any affected docs.
3. If a feature is removed, mark ❌ and explain why.
