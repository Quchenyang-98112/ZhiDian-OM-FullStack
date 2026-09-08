# Environment Variables Reference

Every environment variable read by **Nexus-HEMS-Dash**, grouped by subsystem.
See [`.env.example`](../.env.example) for a copy-paste starter and
[`Safety-Certification-Notice.md`](Safety-Certification-Notice.md) before enabling
live hardware.

**Scope**

- **API** — backend (`apps/api`, read from `process.env` at runtime).
- **Web** — frontend, read from `import.meta.env` and **inlined at build time**
  (Vite): a `VITE_*` value is baked into the bundle, so it is *not* a runtime
  secret and must never hold a private key.
- **Build/CI** — tooling only.

**Required**: ✅ = required in production · ⚠️ = required only for that feature/live
mode · — = optional. AI provider keys are **not** environment variables — they
are stored AES-GCM-encrypted in the browser (BYOK, `/settings/ai`).

## Core Server (API)

| Variable | Default | Required | Description |
|----------|---------|:--------:|-------------|
| `NODE_ENV` | `development` | — | `production` enables prod security posture (fatal weak-secret check, no auth fail-open). |
| `PORT` | `3000` | — | HTTP/WebSocket listen port. |
| `LOG_LEVEL` | `info` | — | `error` \| `warn` \| `info` \| `debug`. |
| `WEB_DIST_PATH` | `../web/dist` | — | Path the API serves the built SPA from. |
| `NEXUS_API_RUNTIME_DIR` | OS temp | — | Writable dir for runtime state (audit NDJSON, EEBUS trust store). |
| `TRUST_PROXY` | `false` | ⚠️ behind proxy | Trust `X-Forwarded-*` (set when behind nginx/K8s ingress). See `docs/Deployment-Guide.md` §2.1. |

## Authentication & JWT (API)

| Variable | Default | Required | Description |
|----------|---------|:--------:|-------------|
| `JWT_SECRET` | dev: random per run | ✅ | HMAC-SHA256 signing secret (≥ 32 chars, 64+ recommended). Production boot **aborts** on weak/low-entropy values (CRIT-03). |
| `JWT_SECRET_FILE` | `/run/secrets/jwt_secret` | — | File source for `JWT_SECRET` (preferred over env in Docker/K8s). |
| `JWT_SECRET_NEW` / `JWT_SECRET_NEW_FILE` | — | — | Second key for zero-downtime rotation (HIGH-07); both keys verify, new key signs. |
| `JWT_KID_PRIMARY` / `JWT_KID_NEW` | — | — | Key-IDs stamped in the JWT header during rotation. |
| `API_KEYS` | `''` | ✅ (prod) | Comma-separated keys accepted by `POST /api/auth/token`. Dev allows anonymous; production requires ≥ 1 strong key. |
| `API_KEY_SCOPES` | `''` | ✅ (prod) | Per-key max scope, e.g. `monitor:read,operator:readwrite,admin:admin`. |

## Network, CORS, WebSocket & Rate Limiting (API)

| Variable | Default | Required | Description |
|----------|---------|:--------:|-------------|
| `CORS_ORIGINS` | `''` | ⚠️ prod | Extra allowed CORS origins (comma-separated). |
| `WS_ORIGINS` | `''` | ✅ (prod, WS) | Allowed WebSocket origins for the CSP `connect-src` and CSWSH origin check. |
| `WS_RATE_LIMIT` | `30` | — | Max hardware commands per client per minute. |
| `WS_MAX_CONNECTIONS_PER_IP` | `50` | — | Concurrent WS connections per IP. |
| `RATE_LIMIT_TRUSTED_IPS` | `''` | — | Comma-separated IPs bypassing HTTP rate limits. |

## Adapter Mode & Safety (API + Web)

Both layers default to **mock**; live hardware requires an explicit double opt-in.
See `docs/Protocol-Adapter-Guide-Backend.md`.

| Variable | Scope | Default | Required | Description |
|----------|:-----:|---------|:--------:|-------------|
| `ADAPTER_MODE` | API | `mock` | — | `mock` \| `live`. The resolved mode is `live`, but live hardware remains disabled unless `ALLOW_LIVE_HARDWARE=true` is also set (checked separately before startup). |
| `ALLOW_LIVE_HARDWARE` | API | unset | ⚠️ live | Must be `true` alongside `ADAPTER_MODE=live` to start hardware adapters. |
| `READ_ONLY_MODE` | API | `false` | — | `true` blocks **all** hardware commands at the WS gateway (SAF-05). |
| `VITE_ADAPTER_MODE` | Web | `mock` | — | Frontend adapter mode (build-time). |
| `VITE_ALLOW_LIVE_HARDWARE` | Web | unset | ⚠️ live | Frontend live opt-in. |
| `VITE_READ_ONLY_MODE` | Web | `false` | — | Frontend read-only enforcement + banner. |
| `VITE_BACKEND_WS` | Web | `false` | — | Opt into the backend WebSocket consumer (ADR-025); off for static gh-pages demo. |
| `VITE_ADAPTER_WORKER` | Web | `false` | — | Poll REST adapters off-thread in `adapter-worker` (MED-12). |

## Persistence — InfluxDB & Redis (API)

| Variable | Default | Required | Description |
|----------|---------|:--------:|-------------|
| `INFLUXDB_URL` | `http://influxdb:8086` | ⚠️ live | Time-series database endpoint. |
| `INFLUXDB_TOKEN` | `nexus-hems-influx-token` | ⚠️ live | InfluxDB API token (**change in production**). |
| `INFLUXDB_ORG` | `nexus-hems` | — | InfluxDB org. |
| `INFLUXDB_BUCKET` | `nexus-hems` | — | InfluxDB bucket. |
| `REDIS_URL` | — | — | Optional. Shared Redis for JTI revocation (ADR-003) and the EEBUS trust store (`EEBUS_TRUST_BACKEND=redis`). Falls back to in-memory JTI revocation + the file trust store when unset. |

## Backend Protocol Adapters (live mode only)

Each backend adapter starts only when `ADAPTER_MODE=live` + `ALLOW_LIVE_HARDWARE=true`
and its required configuration is set (a connection var, or `device-map.json` for
Modbus / `EXEC_SCRIPTS_CONFIG` for Exec). Verbose per-component/entity/command override vars
(marked *"+ overrides"*) are listed compactly in [`.env.example`](../.env.example)
and the adapter source under `apps/api/src/protocols/`.

| Adapter | Primary vars (default) | Notes |
|---------|------------------------|-------|
| **Victron MQTT** | `MQTT_BROKER_URL`; `MQTT_USERNAME` / `MQTT_PASSWORD`; `MQTT_CA_CERT` / `MQTT_CLIENT_CERT` / `MQTT_CLIENT_KEY` | TLS client-cert auth optional. |
| **Modbus/SunSpec** | (via `device-map.json`) | Devices declared in `device-map.json`, not env; empty by default. |
| **KNX/IP** | `KNX_BRIDGE_WS_URL` | knxd WebSocket-JSON bridge. |
| **evcc** | `EVCC_BASE_URL`; `EVCC_AUTH_TOKEN`; `EVCC_DEVICE_ID` | REST `/api/state` + `/ws`. |
| **EEBUS** | `EEBUS_DISABLE`; `EEBUS_CERT_FILE` (`data/eebus-server.cert.pem`); `EEBUS_KEY_FILE` (`…key.pem`); `EEBUS_CA_FILE`; `EEBUS_TRUST_BACKEND` (`file`); `EEBUS_TRUST_FILE` (`data/eebus-trust.json`) | mTLS SHIP; `EEBUS_TRUST_BACKEND=redis` uses `REDIS_URL`. |
| **HeatPump** | `HEATPUMP_HOST`; `HEATPUMP_PORT`; `HEATPUMP_UNIT_ID`; `HEATPUMP_MANUFACTURER` (`generic`); `HEATPUMP_POLL_MS` | 6 manufacturer profiles. |
| **OpenEMS** | `OPENEMS_HOST`; `OPENEMS_PORT`; `OPENEMS_TLS`; `OPENEMS_AUTH_TOKEN`; `OPENEMS_DEVICE_ID`; `OPENEMS_POLL_MS` *+ controller-ID & command overrides* (`OPENEMS_*_CTRL_ID`, `OPENEMS_*_COMMANDS`, `OPENEMS_WRITABLE_COMPONENT_RULES`) | JSON-RPC/WebSocket. |
| **OCPP CSMS** | `OCPP_CSMS_PORT`; `OCPP_CSMS_HOST`; `OCPP_CSMS_PATH` *+ `OCPP_SESSION_PREFIX`, `OCPP_SESSION_TTL_SEC`, `OCPP_EV_COMMANDS`* | CSMS gateway; SP3 mTLS proxy is separate (`/ws/ocpp`). |
| **Home Assistant** | `HA_HOST`; `HA_PORT`; `HA_TLS`; `HA_TOKEN`; `HA_DEVICE_ID` *+ entity-map & command overrides* (`HA_ENTITY_MAP_PATH`, `HA_WALLBOX_*`, `HA_HEAT_PUMP_MODE_ENTITY`, `HA_EV_COMMANDS`) | `ha-ws-api` transport (ADR-023). |
| **Home Assistant (MQTT)** | `HA_MQTT_BROKER_URL` *+ `HA_MQTT_TOPIC_PREFIX`, `HA_MQTT_EV_COMMANDS`, `HA_MQTT_ADAPTER_ID`* | `mqtt-broker` transport (ADR-023). |
| **Matter/Thread** | `MATTER_BRIDGE_HOST`; `MATTER_BRIDGE_PORT`; `MATTER_BRIDGE_TLS` *+ `MATTER_NODE_IDS`, `MATTER_NODE_MAP_PATH`, `MATTER_DEVICE_ID`, **`MATTER_HEAT_PUMP_NODE_ID` (required for `SET_HEAT_PUMP_MODE`)*** | Phase 2: WS telemetry + SG Ready write (ADR-022). |
| **Zigbee2MQTT** | `Z2M_BROKER_URL` *+ `Z2M_BASE_TOPIC`, `Z2M_HEAT_PUMP_DEVICE`, `Z2M_EV_DEVICE`, `Z2M_HEAT_PUMP_HINTS`, `Z2M_EV_HINTS`* | MQTT bridge telemetry + command publish for heat pump / EV plugs. |
| **Exec** | `EXEC_SCRIPTS_CONFIG` | JSON string or path to a whitelist of runnable scripts (ADR-021). |

## Demand Response, VPP & Tariffs

| Variable | Scope | Default | Required | Description |
|----------|:-----:|---------|:--------:|-------------|
| `OPENADR_VTN_URL` | API | `''` | ⚠️ | OpenADR 3.1 VTN base URL for the VEN proxy. |
| `OPENADR_CLIENT_ID` / `OPENADR_CLIENT_SECRET` | API | `''` | ⚠️ | OAuth2 client credentials for the VTN. |
| `AWATTAR_BASE_URL` | API | `https://api.awattar.de/v1` | — | aWATTar price API base (proxy). |
| `VITE_TIBBER_API_TOKEN` | Web | `''` | — | Tibber token (build-time). |
| `VITE_AWATTAR_COUNTRY` | Web | `DE` | — | `DE` \| `AT`. |

## Frontend Adapter Config (Web, build-time)

Example IP/port values in `.env.example` are illustrative, not defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | (relative) | Override the API base URL. |
| `VITE_VICTRON_WS_HOST` / `_PORT` / `_TLS` | — | Victron Cerbo GX WebSocket. |
| `VITE_MODBUS_HOST` / `_PORT` / `_POLL_INTERVAL_MS` | — | Modbus/SunSpec REST gateway. |
| `VITE_KNX_HOST` / `_PORT` | — | KNX/IP gateway. |
| `VITE_OCPP_HOST` / `_PORT` / `_TLS` / `VITE_OCPP_CHARGE_POINT_ID` | — | OCPP CSMS + charge-point identity. |
| `VITE_MQTT_BROKER_URL` | — | Home Assistant MQTT (WS). |
| `VITE_SENTRY_DSN` | — | Optional Sentry DSN for the SPA. |

## Build, Test & Tooling

| Variable | Scope | Description |
|----------|:-----:|-------------|
| `VITE_E2E_TESTING` | Web/CI | `true` at build disables the SW auto-reload for stable Playwright runs (both CI workflows set it). |
| `VITE_E2E_ANIMATIONS` | Web/CI | Toggle animations under E2E. |
| `VITE_ENABLE_LOCAL_LLM` | Web build | `true` opts into the deferred in-browser LLM engines (WebLLM / Transformers.js / ONNX). Off by default — the engines are experimental and cannot load under the production CSP; see ADR-029. Also requires re-adding the peer package to `packages/ai-core`. |
| `ENABLE_LOCAL_LLM` | API/Node | Node-side equivalent of the above (`isLocalLlmEnabled()` reads `VITE_ENABLE_LOCAL_LLM` first, then this). |
| `GEMINI_API_KEY` | Build | Optional key used by build-analysis tooling only (never shipped). |
| `DISABLE_HMR` | Web dev | Disable Vite HMR. |
| `SMOKE_DEBUG` | Build | Verbose output for `smoke:prod`. |
| `CI` / `NO_COLOR` / `FORCE_COLOR` | CI | Standard CI/output toggles. |

> Vite exposes read-only built-ins `import.meta.env.DEV` / `PROD` / `MODE` /
> `BASE_URL`, and Vitest adds `VITEST` — these are set by the toolchain, not
> configured by you.

---

_When you add a new **project-configurable** `process.env` / `import.meta.env`
read (i.e. not a toolchain built-in like `DEV` / `PROD` / `MODE` / `VITEST`), add it here and to
[`.env.example`](../.env.example)._
