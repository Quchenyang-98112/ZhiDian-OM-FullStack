# Home Assistant Integration Guide

> **Nexus-HEMS-Dash** integrates with Home Assistant via the `homeassistant-mqtt` contrib adapter.
> Two connection modes are supported: **ha-ws-api** (recommended) and **mqtt-broker** (legacy).

---

## Connection Modes

| Mode | When to use | Requirements |
|------|-------------|--------------|
| **ha-ws-api** (default) | HA 2023.9+, direct WebSocket API | Long-Lived Access Token (`haToken`), port 8123 |
| **mqtt-broker** | Existing Mosquitto/MQTT Discovery setup | MQTT WebSocket port (typically 1884) |

### ha-ws-api (recommended)

![Home Assistant adapter settings — ha-ws-api mode](./images/operators/ha-ws-api-settings.png)
*Settings → Adapters → Home Assistant MQTT contrib card (ocean-dark, v1.6.1)*

1. In Home Assistant: **Profile → Security → Long-Lived Access Tokens** → Create token.
2. In Nexus: **Settings → Adapters → Home Assistant** → set:
   - `haMode`: `ha-ws-api`
   - `host`: HA hostname or IP (e.g. `homeassistant.local`)
   - `port`: `8123`
   - `haToken`: your token (stored locally, never sent to third parties)
   - Optional: enable **auto-discover energy entities** by `device_class`
3. Verify: Monitoring → adapter status **connected**; Command Hub shows live PV/battery/grid if entities are mapped.

> **Security:** Anonymous WebSocket connections are **not** supported. If `haToken` is missing, the adapter rejects `auth_required` and surfaces an error.

### mqtt-broker (legacy)

![MQTT broker mode — contrib adapter card](./images/operators/ha-mqtt-broker.png)
*Settings → Adapters → load contrib adapters for MQTT Discovery setup*

See sections below for Mosquitto broker setup and MQTT Discovery topic subscription.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Step 1 — Enable MQTT in Home Assistant](#step-1--enable-mqtt-in-home-assistant)
4. [Step 2 — Configure Mosquitto Broker](#step-2--configure-mosquitto-broker)
5. [Step 3 — Configure the Nexus HA MQTT Adapter](#step-3--configure-the-nexus-ha-mqtt-adapter)
6. [Step 4 — Entity Mapping](#step-4--entity-mapping)
7. [Step 5 — Verify the Connection](#step-5--verify-the-connection)
8. [Advanced: Custom Topic Prefix](#advanced-custom-topic-prefix)
9. [Advanced: HA Energy Dashboard Entities](#advanced-ha-energy-dashboard-entities)
10. [Troubleshooting](#troubleshooting)
11. [Security Considerations](#security-considerations)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Home Assistant                                          │
│  ┌─────────────────┐    MQTT Discovery Topics           │
│  │ Energy Sensors  │ ──────────────────────────────┐    │
│  │ (PV, Battery,   │    homeassistant/sensor/*/     │    │
│  │  Grid, EV, …)   │    config + state              │    │
│  └─────────────────┘                                │    │
│           │                                         │    │
│  ┌────────┴────────┐                                │    │
│  │ MQTT Integration│                                │    │
│  └────────┬────────┘                                │    │
│           │ WebSocket (port 1884)                   │    │
└───────────┴─────────────────────────────────────────┘    │
            │                                              │
            ▼                                              │
  ┌─────────────────────────────┐                         │
  │  Mosquitto Broker           │ ◄───────────────────────┘
  │  (or any MQTT broker)       │
  └─────────────────────────────┘
            │ MQTT over WebSocket
            ▼
  ┌─────────────────────────────┐
  │  Nexus-HEMS-Dash            │
  │  HomeAssistantMQTTAdapter   │
  │  (contrib adapter)          │
  │                             │
  │  Reads: pvPower, battery,   │
  │  grid, house, EV, …         │
  └─────────────────────────────┘
```

The **HomeAssistantMQTTAdapter** connects directly to your Mosquitto broker via WebSocket (port 1884)
and subscribes to HA MQTT Discovery state topics. It does **not** communicate with the HA REST API —
this keeps it broker-only with no HA Supervisor dependency.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Home Assistant | 2024.1+ | MQTT integration must be enabled |
| Mosquitto Broker | 2.0+ | Via HA add-on or standalone Docker |
| MQTT WebSocket port | 1884 | Configurable; see Step 2 |
| Energy entities | Any | PV, battery, grid sensors in HA energy dashboard |
| Nexus-HEMS-Dash | 1.1.0+ | Settings → Adapters → Home Assistant MQTT |

---

## Step 1 — Enable MQTT in Home Assistant

### Option A: Mosquitto Add-on (Recommended)

1. Navigate to **Settings → Add-ons → Add-on Store**
2. Search for **"Mosquitto broker"** and install it
3. In the Mosquitto add-on configuration, enable the WebSocket listener:

```yaml
# Mosquitto add-on configuration
logins: []
customize:
  active: true
  folder: mosquitto
certfile: fullchain.pem
keyfile: privkey.pem
require_certificate: false
```

4. Create an MQTT user: **Settings → People → Users** → add a user with "Administrator" role disabled
   — or use the Mosquitto add-on "Logins" section.

5. Restart the add-on.

### Option B: External Mosquitto (Docker / Linux)

```yaml
# docker-compose.yml — Mosquitto with WebSocket
services:
  mosquitto:
    image: eclipse-mosquitto:2.0
    ports:
      - "1883:1883"   # standard MQTT
      - "1884:1884"   # MQTT over WebSocket
    volumes:
      - ./mosquitto/config:/mosquitto/config
      - ./mosquitto/data:/mosquitto/data
```

`mosquitto/config/mosquitto.conf`:

```conf
listener 1883
listener 1884
protocol websockets

allow_anonymous false
password_file /mosquitto/config/passwd

persistence true
persistence_location /mosquitto/data/

log_dest stdout
log_type all
```

Create credentials:

```bash
mosquitto_passwd -c /mosquitto/config/passwd homeassistant
```

### Enable MQTT Integration in HA

Go to **Settings → Devices & Services → Add Integration → MQTT**.
Enter broker host, port `1883`, username, and password.

---

## Step 2 — Configure Mosquitto Broker

Ensure the **WebSocket listener** is active on port `1884` (or your custom port).

For the Mosquitto HA add-on, the WebSocket port is `1884` by default.
For external Mosquitto, add to `mosquitto.conf`:

```conf
listener 1884
protocol websockets
```

**Firewall / Docker network**: Nexus must be able to reach `<ha-host>:1884`.
For Docker Compose deployments, ensure both containers are on the same network.

---

## Step 3 — Configure the Nexus HA MQTT Adapter

1. Open Nexus Settings: **HTTP(S) → `/settings`** or click the gear icon
2. Navigate to the **Adapters** tab
3. Find **"Home Assistant MQTT"** and click **Configure**
4. Fill in the connection fields:

| Field | Value | Example |
|-------|-------|---------|
| **Host** | HA / Mosquitto hostname or IP | `homeassistant.local` |
| **Port** | WebSocket port | `1884` |
| **TLS** | Enable for production | `false` (dev) / `true` (prod) |
| **MQTT Username** | MQTT user created in Step 1 | `homeassistant` |
| **MQTT Password** | MQTT password | `your-secure-password` |
| **Topic Prefix** | HA Discovery prefix | `homeassistant` (default) |

5. Click **Save & Connect**.

### Programmatic Configuration (Advanced)

If you prefer code-based configuration via the adapter registry:

```typescript
import { registerAdapter } from '@/core/adapters/adapter-registry';
import { HomeAssistantMQTTAdapter } from '@/core/adapters/contrib/homeassistant-mqtt';

registerAdapter('homeassistant-mqtt', (config) => new HomeAssistantMQTTAdapter(config));

// Activate via AdapterRegistry:
const registry = getAdapterRegistry();
await registry.start('homeassistant-mqtt', {
  host: 'homeassistant.local',
  port: 1884,
  tls: false,
  mqttUser: 'homeassistant',
  mqttPassword: 'your_mqtt_password',
  topicPrefix: 'homeassistant',
});
```

---

## Step 4 — Entity Mapping

The adapter reads HA sensor state topics using a configurable entity map.

### Default Entity Map

| HEMS Field | Default HA Entity | Example Topic |
|------------|-------------------|---------------|
| `pvPower` | `sensor.solar_power` | `homeassistant/sensor/solar_power/state` |
| `pvEnergyToday` | `sensor.solar_energy_today` | `homeassistant/sensor/solar_energy_today/state` |
| `batteryPower` | `sensor.battery_power` | `homeassistant/sensor/battery_power/state` |
| `batterySoc` | `sensor.battery_soc` | `homeassistant/sensor/battery_soc/state` |
| `gridPower` | `sensor.grid_power` | `homeassistant/sensor/grid_power/state` |
| `housePower` | `sensor.house_power` | `homeassistant/sensor/house_power/state` |
| `evPower` | `sensor.wallbox_power` | `homeassistant/sensor/wallbox_power/state` |
| `evSoc` | `sensor.ev_soc` | `homeassistant/sensor/ev_soc/state` |
| `evStatus` | `sensor.wallbox_status` | `homeassistant/sensor/wallbox_status/state` |

### Custom Entity Mapping

If your HA entities use different names (e.g., from a Fronius, SMA, or Victron HA integration),
override the map in Settings → Adapters → Home Assistant MQTT → Entity Mapping:

```json
{
  "pvPower": "sensor.fronius_symo_ac_power",
  "batteryPower": "sensor.byd_hvs_battery_power",
  "batterySoc": "sensor.byd_hvs_battery_state_of_charge",
  "gridPower": "sensor.eastron_sdm630_total_active_power",
  "housePower": "sensor.house_consumption_power",
  "evPower": "sensor.go_e_charger_power",
  "evSoc": "sensor.bmw_ix_battery_level"
}
```

### Common HA Integration Entity Names

**Fronius Solar (HA integration `fronius`):**
```
sensor.fronius_symo_ac_power        → pvPower
sensor.fronius_symo_energy_day      → pvEnergyToday
sensor.fronius_smart_meter_power    → gridPower
```

**SMA Sunny Boy (`sma`):**
```
sensor.sunny_boy_ac_power           → pvPower
sensor.sunny_boy_daily_yield        → pvEnergyToday
```

**Victron Venus OS (`victron_ess`):**
```
sensor.victron_pv_power             → pvPower
sensor.victron_battery_power        → batteryPower
sensor.victron_battery_soc          → batterySoc
sensor.victron_grid_power           → gridPower
```

**go-e Charger (`go_e`):**
```
sensor.go_e_charger_power           → evPower
sensor.go_e_charger_status          → evStatus
```

---

## Step 5 — Verify the Connection

### In Nexus Settings

1. Go to **Settings → Adapters** — the HA MQTT adapter shows a green **Connected** badge
2. Navigate to **Monitoring** — shows adapter status, data freshness, circuit breaker state
3. Navigate to **Energy Flow** — PV, battery, grid, EV nodes should show live values

### Via MQTT CLI (Debug)

Subscribe to state topics to verify HA publishes them:

```bash
# Install mosquitto-clients
sudo apt install -y mosquitto-clients

# Subscribe to all sensor state updates
mosquitto_sub -h homeassistant.local -p 1883 \
  -u homeassistant -P your_mqtt_password \
  -t 'homeassistant/sensor/+/state' -v

# Expected output:
# homeassistant/sensor/solar_power/state 3450
# homeassistant/sensor/battery_soc/state 72.3
# homeassistant/sensor/grid_power/state -850
```

### In MQTT Explorer

[MQTT Explorer](https://mqtt-explorer.com/) is a GUI tool for browsing MQTT broker topics.
Connect to `mqtt://homeassistant.local:1883` and browse the `homeassistant/sensor/` tree.

---

## Advanced: Custom Topic Prefix

If HA is configured with a custom discovery prefix (e.g., `ha` instead of `homeassistant`),
set the `topicPrefix` field accordingly. The adapter subscribes to:

```
{topicPrefix}/sensor/{entity_id}/state
```

Example with prefix `ha`:
```
ha/sensor/solar_power/state
ha/sensor/battery_soc/state
```

---

## Advanced: HA Energy Dashboard Entities

For the best integration, use entities that are already configured in your HA Energy Dashboard:

1. **Settings → Energy** in Home Assistant
2. Copy entity IDs from each configured field:
   - Solar panels → PV production entity
   - Battery storage → charge/discharge + SoC entities
   - Grid connection → import/export entities
   - Individual devices → EV charger entity

These entities are guaranteed to be in consistent units (W for power, kWh for energy, % for SoC).

---

## Troubleshooting

### Adapter shows "Disconnected"

**Cause 1:** WebSocket port not reachable.

```bash
# Test WebSocket port from Nexus host:
curl -v "http://homeassistant.local:1884" 2>&1 | grep -i "websocket\|101\|upgrade"
```

**Cause 2:** Mosquitto WebSocket listener not enabled.
Add `protocol websockets` to the `listener 1884` block in `mosquitto.conf`.

**Cause 3:** MQTT credentials wrong.
Test MQTT auth: `mosquitto_sub -h homeassistant.local -p 1883 -u USER -P PASS -t '#' -C 1`

---

### Values show 0 or N/A

**Cause:** Entity names don't match. Use MQTT Explorer to find the exact topic path,
then update the entity map in Settings → Adapters.

**Debug:** Enable adapter debug logging:

```typescript
// In browser console (dev mode):
localStorage.setItem('nexus-adapter-debug', 'homeassistant-mqtt');
```

---

### Circuit Breaker is OPEN

The circuit breaker opens after 5 consecutive connection failures (30 s cooldown).

In Settings → Monitoring → Circuit Breakers, click **Reset** on the HA MQTT adapter.

---

### TLS Certificate Errors

If using TLS (port 8884), ensure the Mosquitto TLS certificate is trusted:

```conf
# mosquitto.conf
listener 8884
protocol websockets
cafile /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
```

For self-signed certs, import the CA to the Nexus host's trust store.

---

## Security Considerations

1. **Never use `allow_anonymous true`** in production — always require MQTT credentials.
2. **TLS in production**: Use port 8884 with valid certificates (Let's Encrypt via cert-manager).
3. **MQTT credentials** stored in Nexus Settings are kept in the browser's encrypted Dexie.js vault
   (AES-GCM 256-bit) — they are never stored in `localStorage` in plain text.
4. **Network isolation**: In Docker deployments, place the MQTT broker and Nexus on an isolated
   internal network. Do not expose port 1884 to the internet.
5. **Read-only access**: The HA MQTT adapter only subscribes to state topics — it never publishes
   commands back to HA (read-only by design in the current implementation).

---

*See also: [HA Migration & Hybrid Plan](./HA-Migration-Hybrid-Plan.md) · [HA Custom Cards](./HA-Custom-Cards-Sankey.md) · [Troubleshooting](./Troubleshooting.md)*
