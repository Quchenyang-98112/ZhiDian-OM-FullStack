# API Reference

Nexus HEMS server exposes REST endpoints and a real-time WebSocket interface.
All schemas are defined with Zod in `packages/shared-types/src/protocol.ts` (importable as `@nexus-hems/shared-types`).

---

## REST Endpoints

### `GET /api/health`

Health check (no auth required).

**Response** `200 OK`

```json
{
  "status": "ok",
  "uptime": 3600,
  "adapters": [{ "id": "victron-mqtt", "status": "connected" }]
}
```

> JWT metadata fields (`kid`, `rotationDueIn`) were removed from the health response to prevent information disclosure (security remediation MED-05).

### `POST /api/auth/token`

Request a JWT for WebSocket authentication.

> **Production**: Requires a valid API key set in the `API_KEYS` env var (comma-separated). In development, anonymous access is accepted.
> **Rate limit**: 10 req/min per IP (brute-force protection). Trusted IPs in `RATE_LIMIT_TRUSTED_IPS` bypass this limit.

**Body** (validated by `AuthTokenRequestSchema`)

```json
{ "clientId": "dashboard-1", "scope": "readwrite" }
```

**Response** `200 OK`

```json
{ "token": "eyJ…", "expiresIn": "24h" }
```

### `POST /api/auth/refresh`

Refresh an existing JWT via `Authorization: Bearer <token>`.

**Response** `200 OK`

```json
{ "token": "eyJ…", "expiresIn": "24h" }
```

### `POST /api/auth/ws-ticket`

Issue a single-use, short-lived WebSocket authentication ticket. Prefer this over passing a long-lived JWT as a URL query parameter.

> **Auth required**: `Authorization: Bearer <JWT>`
> **Rate limit**: 10 req/min per IP (same limiter as other auth endpoints).

**Body**

```json
{ "clientId": "dashboard-1" }
```

**Response** `200 OK`

```json
{ "ticket": "t_abc123…", "expiresIn": "60s" }
```

The ticket is consumed on first WebSocket connection (`?ticket=<ticket>`) and expires automatically after 60 seconds. Unused tickets are garbage-collected server-side.

### `POST /api/auth/revoke`

Revoke a JWT by its JTI claim. Revoked tokens are immediately rejected by all guarded endpoints.

> **Auth required**: `Authorization: Bearer <JWT>` (the token to revoke, or an admin-scoped token)

**Body**

```json
{ "jti": "550e8400-e29b-41d4-a716-446655440000" }
```

**Response** `200 OK`

```json
{ "revoked": true }
```

### `GET /metrics`

Prometheus scrape endpoint. Returns `text/plain; version=0.0.4` with all `hems_*` metrics.

### `GET /api/metrics/json`

Same metrics in JSON format for the in-app monitoring dashboard.

**Response**

```json
{
  "families": [
    {
      "name": "hems_pv_power_watts",
      "help": "Current PV generation power in watts",
      "type": "gauge",
      "samples": [
        { "labels": { "inverter": "primary" }, "value": 3200, "timestamp": 1719000000000 }
      ]
    }
  ],
  "health": { "uptime": 3600, "connections": 2 }
}
```

### `POST /api/ocpp/proxy-session`

Issue a short-lived (60 s) single-use OCPP mTLS proxy session for browser Security Profile 3 connections. Credentials are stored server-side and consumed when the client opens `/ws/ocpp`.

**Auth:** JWT with `readwrite` or `admin` scope.

**Body** (validated by `OcppProxySessionRequestSchema`)

```json
{
  "host": "192.168.1.100",
  "port": 9000,
  "stationId": "CP001",
  "clientCert": "-----BEGIN CERTIFICATE-----\\n...",
  "clientKey": "-----BEGIN PRIVATE KEY-----\\n...",
  "caCert": "-----BEGIN CERTIFICATE-----\\n...",
  "revocationCheck": "off"
}
```

**Response**

```json
{ "sessionId": "<uuid>", "expiresIn": 60 }
```

**SSRF guard:** `host` must be a private/local network address.

### `GET /api/eebus/discover`

List EEBUS devices found via mDNS (`_ship._tcp`).

### `POST /api/eebus/pair`

Pair an EEBUS device by SKI (validated by `EEBUSPairRequestSchema`).

**Body**

```json
{ "ski": "ABC123…" }
```

### `GET /api/grafana/dashboard`

Returns a Grafana dashboard JSON model pre-configured for all `hems_*` metrics.

---

## WebSocket Protocol

### Energy gateway (`/ws`)

Connect to `ws://host:port/ws` (or `ws://host:port` depending on deployment) with authentication:

- **Recommended**: Query parameter `?ticket=<single-use-ticket>` (obtain from `POST /api/auth/ws-ticket`)
- **Fallback**: Query parameter `?token=<JWT>` (long-lived token in URL — less secure)
- Header: `Authorization: Bearer <JWT>` (not available for initial WS handshake in all browsers)

In production (`NODE_ENV=production`) authentication is **required**; in development anonymous connections are accepted.

### EEBUS SHIP proxy (`/ws/eebus`)

Browser clients connect with a WS ticket; the API terminates mTLS to the device.

```
ws://host/ws/eebus?ticket=<uuid>&ski=<hex>&host=<hostname>&port=4712
```

Requires `readwrite` scope. `ski` is mandatory; `host` may be omitted when the device is in the trust store.

### OCPP 2.1 mTLS proxy (`/ws/ocpp`)

Browser Security Profile 3 clients connect after `POST /api/ocpp/proxy-session`:

```
ws://host/ws/ocpp?ticket=<uuid>&session=<uuid>
```

Requires `readwrite` scope. The `session` id is single-use and holds client certificate material server-side.

> **Per-IP connection limit**: Maximum 10 concurrent WebSocket connections per IP address. Excess connections are rejected with HTTP 429.

### JWT Scopes

| Scope       | Allowed Operations                                                          |
| ----------- | --------------------------------------------------------------------------- |
| `read`      | Receive `ENERGY_UPDATE` messages only; all write commands rejected           |
| `readwrite` | Receive updates + send `SET_EV_POWER`, `SET_HEAT_PUMP_POWER`, `SET_BATTERY_POWER` |
| `admin`     | All `readwrite` permissions + admin operations (EEBUS pairing, token revocation) |

### Server → Client Messages

| `type`          | Payload                         | Frequency           |
| --------------- | ------------------------------- | ------------------- |
| `ENERGY_UPDATE` | `EnergyData` object (see below) | Every 2 s           |
| `ERROR`         | `{ error: string }`             | On invalid commands |

#### `EnergyData` Fields

| Field            | Type   | Unit                  |
| ---------------- | ------ | --------------------- |
| `gridPower`      | number | W (positive = import) |
| `pvPower`        | number | W                     |
| `batteryPower`   | number | W (positive = charge) |
| `houseLoad`      | number | W                     |
| `batterySoC`     | number | % (0–100)             |
| `heatPumpPower`  | number | W                     |
| `evPower`        | number | W                     |
| `gridVoltage`    | number | V                     |
| `batteryVoltage` | number | V                     |
| `pvYieldToday`   | number | kWh                   |
| `priceCurrent`   | number | €/kWh                 |

### Client → Server Commands

Validated by `WSCommandSchema`. Rate-limited to **30 commands/min** per client.

Required scope: `SET_EV_POWER`, `SET_HEAT_PUMP_POWER`, `SET_BATTERY_POWER` require `readwrite` or `admin` scope. Commands from `read`-only tokens are rejected.

| `type`                | `value` | Range                                          |
| --------------------- | ------- | ---------------------------------------------- |
| `SET_EV_POWER`        | watts   | 0 – 25 000 (§14a EnWG residential power cap)   |
| `SET_HEAT_PUMP_POWER` | watts   | 0 – 25 000 (§14a EnWG residential power cap)   |
| `SET_BATTERY_POWER`   | watts   | −25 000 – 25 000 (§14a EnWG residential limit) |

---

## Prometheus Metrics

| Metric                              | Type    | Labels       |
| ----------------------------------- | ------- | ------------ |
| `hems_pv_power_watts`               | gauge   | `inverter`   |
| `hems_battery_power_watts`          | gauge   | `battery_id` |
| `hems_grid_power_watts`             | gauge   | `phase`      |
| `hems_house_load_watts`             | gauge   | —            |
| `hems_ev_charger_power_watts`       | gauge   | `charger_id` |
| `hems_heat_pump_power_watts`        | gauge   | —            |
| `hems_battery_soc_percent`          | gauge   | `battery_id` |
| `hems_grid_voltage_volts`           | gauge   | `phase`      |
| `hems_battery_voltage_volts`        | gauge   | `battery_id` |
| `hems_pv_yield_today_kwh`           | counter | —            |
| `hems_tariff_price_eur_per_kwh`     | gauge   | `provider`   |
| `hems_uptime_seconds`               | counter | —            |
| `hems_websocket_messages_total`     | counter | `direction`  |
| `hems_websocket_connections_active` | gauge   | —            |

### Per-adapter metrics (MED-18)

Emitted by `apps/api/src/middleware/adapter-metrics.ts` for each backend protocol adapter instance, all labelled `{ adapter, protocol }`:

| Metric                                 | Type    | Labels              |
| -------------------------------------- | ------- | ------------------- |
| `hems_adapter_connected`               | gauge   | `adapter, protocol` |
| `hems_adapter_latency_seconds`         | gauge   | `adapter, protocol` |
| `hems_adapter_data_freshness_seconds`  | gauge   | `adapter, protocol` |
| `hems_adapter_data_updates_total`      | counter | `adapter, protocol` |
| `hems_adapter_errors_total`            | counter | `adapter, protocol` |
| `hems_adapter_reconnects_total`        | counter | `adapter, protocol` |
| `hems_adapter_dlq_total`               | counter | `adapter, protocol` |

---

## Security

- **Helmet** CSP, HSTS, X-Frame-Options: DENY, Cross-Origin-Embedder-Policy: `credentialless`
- **CORS** allowlist (configurable via `CORS_ORIGINS` env var; no wildcard `*` in production)
- **Rate limiting** (three tiers, window randomized ±15 s):
  - Global: 100 req/min per IP
  - API (`/api/*`): 60 req/min per IP
  - Auth (`/api/auth/token`, `/api/auth/refresh`): 10 req/min per IP
  - WebSocket commands: 30 cmd/min per client
  - Trusted IPs bypass all limiters via `RATE_LIMIT_TRUSTED_IPS` env var
- **JWT**: HS256, 24 h expiry; entropy-validated at startup (warns on weak secrets)
- **WebSocket**: 64 KB max payload, Zod command validation, JWT required in production
- **Input validation**: All request bodies validated with Zod schemas
