# ADR-010: Home Assistant Integration Architecture

- **Status:** Accepted
- **Date:** 2026-04-25
- **Deciders:** Nexus-HEMS Core Team
- **Supersedes:** None
- **Extended-by:** ADR-023 (Home Assistant dual transport), ADR-021 (HA/Exec adapter patterns)

---

## Context and Problem Statement

Nexus-HEMS targets both native protocol deployments (MQTT, Modbus, KNX, EEBUS) and environments where Home Assistant already aggregates home automation data. Users who have invested heavily in a Home Assistant setup should be able to use Nexus-HEMS as a visualization and optimization layer on top of HA — without duplicating device integrations.

The question is how deeply Nexus-HEMS should integrate with Home Assistant and through which mechanism.

---

## Decision Drivers

- **DRY principle:** Users should not re-configure devices they have already integrated in HA
- **Protocol coverage:** HA supports 3,000+ integrations — far exceeding what native adapters cover
- **No hard dependency:** HA is optional; the core system must work without it
- **Security:** HA credentials should never be stored in plaintext; HA API tokens are encrypted at rest
- **Read-only default:** Nexus-HEMS reads energy data from HA; it does not write commands back to HA by default (risk separation)
- **MQTT as preferred transport:** Lower latency than HA REST API; Mosquitto broker is a common HA add-on

---

## Considered Options

### Option 1 — HA REST API Integration (Long-Polling)

- Poll `GET /api/states` every 1–5 seconds
- Pro: Simple, no broker needed, works with HA Cloud
- Con: High latency (1–5s delay), API rate limits, HTTP overhead per entity

### Option 2 — HA WebSocket API (Native HA WebSocket)

- Subscribe to `subscribe_states` events
- Pro: Real-time push, official HA API
- Con: Custom protocol, hard to test offline, HA-specific dependency

### Option 3 — MQTT Discovery + Mosquitto (chosen)

- HA publishes entity state to `homeassistant/<domain>/<slug>/state`
- Nexus-HEMS subscribes via the `HomeAssistantMQTTAdapter`
- Pro: Real-time, standard MQTT protocol, broker easily self-hosted, works independently of HA (any MQTT source)
- Con: Requires Mosquitto broker; MQTT discovery topic format must match HA convention

---

## Decision

**Use MQTT Discovery (Option 3)** as the primary HA integration mechanism.

Rationale:

1. The `HomeAssistantMQTTAdapter` is already implemented and tested against real HA instances.
2. MQTT is a broadly supported standard — the adapter works with any broker publishing HA discovery format, not just HA itself.
3. If users disable HA, the adapter degrades gracefully (circuit breaker opens, fallback to other adapters).
4. Read-only design aligns with the security principle: Nexus-HEMS never publishes to HA's command topics by default.

---

## Consequences

### Positive

- Instant access to all HA-integrated devices (3,000+ integrations become available)
- MQTT bridge pattern is extensible: if HA publishes a new device type, the adapter picks it up via its configurable entity map
- Energy data from HA feeds the MPC optimizer identically to native adapters
- The hybrid deployment scenario enables gradual migration from HA → native adapters

### Negative

- Requires a running Mosquitto broker (HA Mosquitto add-on or standalone)
- Discovery topic format depends on HA's naming convention — may require manual entity ID mapping for non-standard HA setups
- Initial latency for entity discovery (HA republishes discovery on `homeassistant/` prefix on birth)

### Neutral

- The `HomeAssistantMQTTAdapter` is a contrib adapter (not a core adapter) to keep the core adapter set minimal and protocol-focused

---

## Implementation Notes

- Adapter source: `apps/web/src/core/adapters/contrib/homeassistant-mqtt.ts`
- Configuration: `host`, `port`, `mqttUser`, `mqttPassword`, `topicPrefix`, `entityMap`
- Entity map defaults: `pvPower`, `batteryPower`, `batterySoC`, `gridPower`, `evPower`, `housePower`, `heatPumpPower`
- Authentication: HA long-lived access token (stored encrypted in IndexedDB via `ai-keys.ts`)
- Full guide: [Home-Assistant-Integration-Guide.md](../Home-Assistant-Integration-Guide.md)

---

## References

- [HA MQTT Discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery)
- [HomeAssistantMQTTAdapter source](../../apps/web/src/core/adapters/contrib/homeassistant-mqtt.ts)
- [HA Migration Plan](../HA-Migration-Hybrid-Plan.md)
- [ADR-002 Zustand Dual-Store Pattern](ADR-002-zustand-dual-store-pattern.md)
