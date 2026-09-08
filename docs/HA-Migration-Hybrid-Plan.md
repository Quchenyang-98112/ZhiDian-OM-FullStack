# Home Assistant ↔ Nexus-HEMS: Migration & Hybrid Integration Plan

> Exactly-specified steps for three integration scenarios:
> 1. **Hybrid Mode** — Nexus as energy backend, HA as automation frontend (recommended)
> 2. **Migration** — full transition from HA energy management to Nexus
> 3. **Dual-Run** — parallel operation during transition with zero downtime

---

## Executive Summary

| Scenario | When to Use | Effort | Risk |
|----------|-------------|--------|------|
| **Hybrid (Nexus + HA)** | HA already in use for automations; want superior energy analytics | Low | Low |
| **Migration to Nexus** | Want single-pane-of-glass for energy management | Medium | Medium |
| **Dual-Run** | Want no-downtime cutover with rollback capability | High | Low |

**Recommendation for most users:** Start with Hybrid. Nexus handles energy optimization, tariff data,
MPC scheduling, and the Sankey visualization. HA continues handling lighting, access control, scene
management, and non-energy automations.

---

## Architecture Decision

### Why Nexus instead of HA Energy Management?

| Capability | HA Energy Dashboard | Nexus-HEMS |
|-----------|:---:|:---:|
| Update frequency | 10–60 s | 500 ms |
| Multi-protocol adapters | HA integrations only | 13 adapters (Victron, KNX, OCPP, EEBUS, Modbus, evcc, OpenEMS, OpenADR…) |
| MPC day-ahead optimizer | ❌ | ✅ (LP optimizer, aWATTar, Tibber) |
| §14a EnWG compliance | ❌ | ✅ |
| Real D3 Sankey (sub-second) | ❌ | ✅ (Web Worker) |
| AI forecast (7 providers) | ❌ | ✅ |
| Offline PWA | ❌ | ✅ |
| WCAG 2.2 AA | ⚠️ | ✅ |
| Hardware registry (190 devices) | Via integrations | ✅ Native |

### Why Keep HA?

| Capability | HA | Nexus |
|-----------|:---:|:---:|
| Lighting control | ✅ | ❌ |
| Camera / doorbell | ✅ | ❌ |
| Smart locks | ✅ | ❌ |
| Scene automations | ✅ | ❌ |
| Voice assistants (Alexa/Google) | ✅ | ❌ |
| Zigbee / Z-Wave devices | ✅ (ZHA/Z2M) | Via Zigbee2MQTTAdapter |
| Matter / Thread | ✅ | Via MatterThreadAdapter |
| Mobile notifications | ✅ | ⚠️ Capacitor only |

**Conclusion:** Hybrid is the optimal long-term architecture for most smart homes.

---

## Scenario 1 — Hybrid Mode (Nexus + HA)

```
┌──────────────────────────────────────────────────────────────┐
│                       Your Smart Home                        │
│                                                              │
│  ┌─────────────────┐         ┌─────────────────────────┐    │
│  │  Home Assistant │         │     Nexus-HEMS-Dash      │    │
│  │                 │ MQTT    │                          │    │
│  │  • Lighting     │◄───────►│  • Energy Optimization   │    │
│  │  • Security     │  State  │  • Tariff Intelligence   │    │
│  │  • Cameras      │  Topics │  • MPC Scheduler         │    │
│  │  • Scenes       │         │  • Sankey Visualization  │    │
│  │  • Zigbee/ZWave │         │  • §14a Compliance       │    │
│  │                 │         │  • 13 Protocol Adapters  │    │
│  └─────────┬───────┘         └──────────────────────────┘    │
│            │                                                  │
│  ┌─────────┴─────────────────────────────────────────────┐   │
│  │              Mosquitto MQTT Broker                      │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Step-by-Step Setup

#### Phase H1 — Shared MQTT Broker (30 min)

1. Install Mosquitto via HA Add-on (see [Home Assistant Integration Guide](./Home-Assistant-Integration-Guide.md))
2. Enable the WebSocket listener on port 1884
3. Create a dedicated MQTT user for Nexus: `nexus-mqtt-user`
4. Verify HA publishes energy entities to MQTT:
   ```bash
   mosquitto_sub -h ha.local -p 1883 -u nexus-mqtt-user -P pass -t 'homeassistant/sensor/+/state' -v
   ```

#### Phase H2 — Enable HomeAssistantMQTTAdapter in Nexus (15 min)

1. Nexus Settings → Adapters → Find "Home Assistant MQTT"
2. Configure host, port, credentials, and entity map (see [Integration Guide](./Home-Assistant-Integration-Guide.md))
3. Click Save & Connect — verify green status in Monitoring

#### Phase H3 — Configure HA to React to Nexus Decisions (Optional, 30 min)

Nexus MPC optimizer makes energy routing decisions. Publish these decisions to MQTT so HA
automations can react (e.g., start dishwasher when "cheap tariff" signal is active):

```yaml
# HA automation: react to Nexus tariff state
automation:
  - alias: "Nexus: Start dishwasher on cheap tariff"
    trigger:
      - platform: mqtt
        topic: nexus/hems/tariff/state
        payload: "off_peak"
    action:
      - service: switch.turn_on
        target:
          entity_id: switch.dishwasher
```

For Nexus to publish tariff signals, configure the MQTT output in Nexus Settings →
Optimization → MQTT Publish (requires `mqttOutputEnabled: true`).

#### Phase H4 — Shared Dashboard (Optional, 1 h)

Embed the Nexus dashboard inside HA using the Webpage card:

```yaml
# HA Lovelace dashboard card
type: iframe
url: http://nexus.local:5173/Nexus-HEMS-Dash/energy-flow
aspect_ratio: "16:9"
```

Or use a full Lovelace view:

```yaml
# whole Lovelace view → Nexus
views:
  - title: Energy
    path: energy
    badges: []
    cards:
      - type: iframe
        url: http://nexus.local:5173/Nexus-HEMS-Dash/
        aspect_ratio: "70%"
```

---

## Scenario 2 — Full Migration to Nexus

Use this path when moving energy management entirely to Nexus.

### Pre-Migration Checklist

- [ ] All energy devices accessible via supported Nexus protocol (Victron, Modbus, OCPP, KNX, EEBUS, REST)
- [ ] Hardware listed in [Hardware Compatibility Matrix](./Hardware-Compatibility-Matrix.md)
- [ ] HA automations using energy data identified and documented (will need to be ported or eliminated)
- [ ] Backup HA snapshot created
- [ ] Nexus running in Dual-Run mode (parallel) for at least 1 week of data collection

### Migration Steps

#### M1 — Inventory Phase (1–2 days)

```
Current HA Energy Setup:
  [ ] Solar inverter integration: _________________
  [ ] Battery storage integration: _______________
  [ ] Grid/smart meter integration: ______________
  [ ] EV charger integration: ____________________
  [ ] Heat pump integration: _____________________
  [ ] Custom energy sensors: ____________________
```

For each device, find the corresponding Nexus adapter or hardware registry entry.

#### M2 — Direct Protocol Migration (1–2 days per device type)

| HA Integration | Nexus Replacement | Protocol |
|----------------|-------------------|----------|
| `victron_ess` | VictronMQTTAdapter | MQTT/dbus |
| `fronius` | ModbusSunSpecAdapter | SunSpec/Modbus TCP |
| `sma` | ModbusSunSpecAdapter | SunSpec/Modbus TCP |
| `huawei_solar` | ModbusSunSpecAdapter (via custom register map) | Modbus TCP |
| `solaredge` | ModbusSunSpecAdapter (SunSpec) | SunSpec |
| all other | HomeAssistantMQTTAdapter (bridge mode) | MQTT |
| `ocpp` | OCPP21Adapter | OCPP 2.1 |
| `eebus` | EEBUSAdapter | EEBUS/SPINE |

#### M3 — Dual-Run Validation (1 week minimum)

Run both HA Energy and Nexus in parallel. Compare readings daily:

```bash
# Query Nexus API for current PV power
curl -s http://nexus.local:3000/api/v1/history?metric=pvPower&window=1h

# Compare with HA entity history via HA long-term statistics API
curl -s http://ha.local:8123/api/history/period \
  -H "Authorization: Bearer $HA_API_TOKEN" \
  -d '{"filter_entity_id": "sensor.solar_power"}'
```

Acceptable variance: ±2% for power readings, ±5% for daily energy totals.

#### M4 — Automation Port

HA automations that react to energy conditions must be ported to Nexus Energy Controllers:

| HA Automation | Nexus Equivalent |
|---------------|------------------|
| "Charge battery when PV surplus" | `SelfConsumptionController` (automatic) |
| "Discharge battery at peak tariff" | `GridOptimizedChargeController` |
| "Limit EV charge during peak" | `EVSmartChargeController` (§14a) |
| "SG Ready signal for heat pump" | `HeatPumpSGReadyController` |
| "Reserve battery for blackout" | `EmergencyCapacityController` |

#### M5 — Cutover

1. Disable HA energy integrations (not delete — keep as fallback):
   ```yaml
   # HA configuration.yaml — comment out energy integrations
   # fronius:
   # sma:
   # victron_ess:
   ```
2. Enable all Nexus adapters and verify 24 h clean run
3. Disable HA Energy Dashboard (but keep HA for automations, lighting, etc.)
4. Update monitoring dashboards (Grafana → use Nexus Prometheus metrics)

#### M6 — Post-Migration Verification

- [ ] All Nexus adapters show green in Monitoring
- [ ] MPC optimizer making correct daily schedule decisions
- [ ] §14a EnWG power cap enforced (4.2 kW grid charge max)
- [ ] Tariff data updating (Tibber/aWATTar/Octopus)
- [ ] PWA installed and offline mode working
- [ ] Lighthouse CI ≥ 85% Performance on production URL

---

## Scenario 3 — Dual-Run (Zero-Downtime Transition)

For production smart homes where downtime is unacceptable.

### Dual-Run Architecture

```
Week 1–4: Dual-Run
  HA Energy → Main system (decisions active)
  Nexus     → Shadow mode (reading only, no actuator commands)

Week 4+: Switch
  HA Energy → Shadow mode (read-only monitoring)
  Nexus     → Main system (decisions active, actuator commands)

Week 8+: Decommission HA Energy
  HA        → Automation only (lighting, security, cameras)
  Nexus     → Full HEMS control
```

### Shadow Mode Configuration

In Nexus Settings → System → Operation Mode, enable **"Shadow Mode"**:
- All adapters read data ✅
- Energy controllers compute optimal actions ✅
- Actuator commands are **logged but NOT executed** ✅
- Optimizer recommendations visible in UI ✅

This allows teams to validate Nexus decisions against HA's actual actions for 2–4 weeks
before committing to full operation.

---

## Rollback Plan

If migration fails or issues arise:

```bash
# 1. Re-enable HA energy integrations
# Edit HA configuration.yaml → uncomment integrations → restart HA

# 2. Set Nexus to Shadow Mode
# Settings → System → Operation Mode → Shadow Mode

# 3. Restore HA devices (if re-pairing needed)
# Settings → Devices & Services → Re-add integration

# 4. Rollback timeline: < 30 minutes for Hybrid/Shadow Mode
```

---

## Monitoring Both Systems

During dual-run, monitor both in parallel via Grafana:

```yaml
# Grafana dashboard: Nexus vs. HA comparison panel
panels:
  - title: PV Power Comparison
    type: timeseries
    targets:
      - target: nexus.pv_power   # Prometheus: Nexus
        legendFormat: Nexus PV
      - target: ha.solar_power   # MQTT → Prometheus: HA
        legendFormat: HA PV
    fieldConfig:
      defaults:
        custom:
          lineWidth: 2
```

---

## FAQ

**Q: Can Nexus send automation commands back to HA?**
A: Not directly in v1.1.0. The HA MQTT adapter is read-only. In v1.2.0, bidirectional control via
HA REST API is planned (see ADR-010).

**Q: What happens if Nexus goes offline?**
A: In Hybrid mode, HA continues operating independently. Nexus does not sit in the critical path
of HA automations. Circuit Breaker in Nexus handles reconnection automatically.

**Q: Do I need two MQTT brokers?**
A: No. Use HA's Mosquitto add-on as the shared broker. Both Nexus and HA connect to the same broker.

**Q: Can I run Nexus and HA on the same hardware?**
A: Yes. Nexus requires ~512 MB RAM (Docker). A Raspberry Pi 4 (4GB) comfortably runs both.
For NUC/x86 hardware, resource limits are negligible.

**Q: How do I migrate automations that use `input_number` energy setpoints?**
A: Map these to Nexus Settings → Energy Controllers → Custom Setpoints, then remove them from HA.

---

*See also: [Home Assistant Integration Guide](./Home-Assistant-Integration-Guide.md) · [HA Custom Cards](./HA-Custom-Cards-Sankey.md) · [Hardware Compatibility Matrix](./Hardware-Compatibility-Matrix.md)*
