# MPPT & Hybrid Inverter Guide

> SunSpec Modbus (frontend `modbus-sunspec`) and backend `ModbusAdapter` for PV, battery, and grid metering.

## Frontend adapter

![Live energy flow — PV / MPPT Sankey](./images/operators/mppt-modbus-live.png)
*Energy Flow → production & storage nodes*

**Settings → Adapters → Modbus SunSpec**

| Field | Example |
|-------|---------|
| Bridge URL | `http://192.168.1.10:8080` (ssrf-hardened worker) |
| Device map | SunSpec models 103 (inverter), 124 (storage), 201 (meter) |

Registers are validated with Zod before entering `UnifiedEnergyModel`.

## Backend adapter (edge)

Configure `device-map.json` and env:

```bash
ADAPTER_MODE=live
ALLOW_LIVE_HARDWARE=true
MODBUS_DEVICES_CONFIG=/etc/nexus/device-map.json
```

Each device entry specifies `host`, `port`, `unitId`, `registers[]` with `metric`, `scale`, `dataType` (`INT16`/`UINT16`).

## MPPT-specific notes

- Many hybrid inverters expose MPPT strings as separate SunSpec blocks — map `POWER_W` per string or aggregate at inverter level.
- UINT16 power registers must use `dataType: 'UINT16'` (see HeatPump guide for same pattern).
- Poll interval: 5–15 s typical; respect inverter Modbus connection limits.

## Verification

1. `curl http://localhost:3000/api/health` — adapter listed, status healthy.
2. `/metrics` — `nexus_adapter_errors_total{adapter="modbus-..."}` should stay near zero.
3. Live Energy Flow — PV and battery nodes update within 30 s.

See: `docs/Protocol-Adapter-Guide-Backend.md`, `ModbusAdapter.test.ts`, `apps/web/src/core/hardware-registry.ts` for supported brands.
