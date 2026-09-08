# ADR-023: Home Assistant Dual Transport (ha-ws-api vs mqtt-broker)

- **Status:** Accepted
- **Date:** 2026-07-02
- **Related:** ADR-010 (extends the MQTT-only decision), ADR-021 (HA/Exec adapter patterns), `HomeAssistantMQTTAdapter`, `docs/Home-Assistant-Integration-Guide.md`

---

## Context

ADR-010 (2026-04-25) chose **MQTT Discovery** as the sole Home Assistant integration path. Since v1.5.0 the frontend ships a **dual-mode** `HomeAssistantMQTTAdapter`:

| Mode | Transport | Default |
|------|-----------|---------|
| `ha-ws-api` | Home Assistant WebSocket API (`subscribe_states`) | **Yes** |
| `mqtt-broker` | Mosquitto / MQTT Discovery topics | Legacy fallback |

Operators with HA 2023.9+ and a Long-Lived Access Token benefit from lower setup friction (no separate MQTT broker). MQTT remains required for air-gapped or broker-centric deployments.

**Security change (v1.6.1):** Anonymous continuation after `auth_required` without `haToken` is **rejected** — operators must configure a token.

---

## Decision

1. **Default to `ha-ws-api`** in adapter settings and documentation.
2. **Retain `mqtt-broker`** without deprecation until ADR-010 consumers confirm migration (minimum one major release: v1.7.0 review).
3. **Single adapter class** (`homeassistant-mqtt.ts`) implements both modes behind `haMode` config — no second adapter ID.
4. **No backend HA proxy** in v1.6.x — browser connects directly to HA host (CORS/WebSocket) or MQTT WS; SSRF guards apply to configured hosts.
5. **Read-only by default** — HA commands are not written unless explicitly enabled in a future scoped feature.

---

## Consequences

### Positive

- Matches shipped product behaviour and Help/Settings UX.
- Token-required path closes silent anonymous downgrade.
- MQTT path unchanged for existing installs.

### Negative / risks

- Two code paths increase test matrix (unit + E2E).
- `ha-ws-api` requires valid TLS/host allowlisting for remote HA.
- ADR-010 narrative is outdated — this ADR documents the intentional expansion.

---

## Compliance

| Requirement | ha-ws-api | mqtt-broker |
|-------------|-----------|-------------|
| Token / credentials | `haToken` required | MQTT user/pass optional |
| Real-time push | WebSocket `state_changed` | MQTT retained messages |
| Offline dev | Mock adapter | Mock adapter |
| i18n setup strings | `adapterConfig.haWs*` keys | `adapterConfig.haMqtt*` keys |

---

## Migration notes

Existing users on MQTT: **no action required**. New installs: prefer `ha-ws-api` per `docs/Home-Assistant-Integration-Guide.md`.

---

*Review target: v1.7.0 — evaluate deprecating mqtt-broker default in docs if ha-ws-api adoption > 80% in telemetry-free community feedback.*
