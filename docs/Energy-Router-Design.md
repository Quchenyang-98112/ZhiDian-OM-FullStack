# EnergyRouter Service Design

> **Status:** Implemented (Phase 5) | **Last Updated:** 2026-04-25

The `EnergyRouterService` is the autonomous optimization engine of the Nexus-HEMS backend. It
fetches Day-Ahead electricity prices, runs a linear programming heuristic, and logs all automated
decisions to a persistent audit trail.

---

## Responsibilities

1. **Price Fetching** — Hourly fetch of aWATTar DE Day-Ahead prices (no API key required)
2. **LP Optimization** — Classify current price position, compare with SoC, emit recommendation
3. **Audit Trail** — Every decision persisted to InfluxDB `decisions` measurement (SQLite fallback)
4. **Prometheus Metrics** — Expose decision counts and current price for Grafana dashboards
5. **Safety Enforcement** — Never exceed inverter capacity limits from `device-map.json`

---

## aWATTar DE API

```
Base URL: https://api.awattar.de/v1/marketdata
Method: GET (no authentication required)
Refresh: Every 60 minutes (new prices published daily ~14:00 CET for next day)

Response shape:
{
  "object": "list",
  "data": [
    {
      "start_timestamp": 1714000000000,  // Unix ms — hour start
      "end_timestamp":   1714003600000,  // Unix ms — hour end
      "marketprice": 8247.5,             // ct/MWh (divide by 10000 for €/kWh)
      "unit": "Eur/MWh"
    }
  ],
  "url": "/api/marketdata?..."
}

Conversion: €/kWh = marketprice ÷ 10000
Example: 8247.5 ct/MWh ÷ 10000 = 0.08248 €/kWh (pure wholesale, without taxes/fees)
```

---

## LP Optimization Algorithm

### Input Parameters

```typescript
interface OptimizationInput {
  pricesEurKwh: HourlyPrice[];    // 24-hour Day-Ahead prices
  currentSocPercent: number;      // Latest battery SoC from EventBus
  inverterMaxWatts: number;       // From device-map.json (safety cap)
  pvPowerWatts: number;           // Current PV generation
  houseLoadWatts: number;         // Current house consumption
}
```

### Decision Logic

```
Step 1: Compute price statistics
  sortedPrices = sort(prices)
  lowerQuartile = sortedPrices[floor(len * 0.25)]
  upperQuartile = sortedPrices[floor(len * 0.75)]
  currentPrice = prices[currentHour]

Step 2: Evaluate conditions
  isCheap = currentPrice <= lowerQuartile
  isExpensive = currentPrice >= upperQuartile
  batteryLow = currentSoC < 50
  batteryHigh = currentSoC > 80
  pvSurplus = pvPower > houseLoad * 1.1  (10% headroom)

Step 3: Recommendation
  if isCheap AND batteryLow:
    → FORCE_CHARGE (from grid, up to min(inverterMaxW, 3680W §14a limit))
  elif pvSurplus AND batteryLow:
    → MAXIMIZE_SELF_CONSUMPTION (charge from PV)
  elif isExpensive AND batteryHigh:
    → DISCHARGE_PEAK_SHAVING (reduce grid import)
  else:
    → HOLD (no change)

Step 4: Log decision regardless of recommendation
Step 5: Emit Prometheus metrics
```

### Safety Constraints

- Charge power cap: `min(chargeCommand, device.inverterMaxWatts)`
- §14a EnWG compliance: hard cap at 4 200 W (grid-side) for residential connections
- No commands sent in Phase 3 (Read-Only) — recommendations logged only
- Phase 3b: commands sent via Modbus write queue through Command Safety Layer

---

## Audit Trail Schema

### InfluxDB Measurement: `decisions`

| Field/Tag | Type | Example |
|-----------|------|---------|
| `_measurement` | string | `decisions` |
| `action` (tag) | string | `FORCE_CHARGE` |
| `reason` (tag) | string | `cheap_price_low_soc` |
| `price_eur_kwh` (field) | float | `0.082` |
| `soc_percent` (field) | float | `42.5` |
| `pv_power_w` (field) | float | `2340.0` |
| `inverter_limit_w` (field) | float | `5000.0` |
| `_time` | timestamp | ISO 8601 |

### SQLite Table (Fallback): `automated_decisions`

```sql
CREATE TABLE IF NOT EXISTS automated_decisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,      -- Unix ms
  action     TEXT    NOT NULL,      -- FORCE_CHARGE | DISCHARGE_PEAK_SHAVING | HOLD | ...
  reason     TEXT    NOT NULL,      -- Human-readable reason string
  price_eur_kwh REAL NOT NULL,
  soc_percent   REAL NOT NULL,
  pv_power_w    REAL NOT NULL,
  inverter_limit_w REAL NOT NULL
);
-- Retention: max 10 000 rows; oldest rows deleted when exceeded
```

---

## Prometheus Metrics

| Metric Name | Type | Description |
|-------------|------|-------------|
| `energy_router_decisions_total` | Counter | Total optimization decisions made (labels: action) |
| `energy_router_last_price_eur_kwh` | Gauge | Latest fetched aWATTar market price |
| `energy_router_lower_quartile_eur_kwh` | Gauge | Today's lower quartile price threshold |
| `energy_router_battery_soc_percent` | Gauge | Last known battery SoC used for decision |

---

## Scheduling

```
Startup:
  1. Fetch today's prices from aWATTar
  2. Run optimization loop once
  3. Start hourly price refresh timer
  4. Start 5-minute optimization loop

Every 60 minutes:
  - fetchAndCachePrices()

Every 5 minutes:
  - runOptimizationCycle()
  - log decision
  - update Prometheus gauges

Graceful shutdown:
  - Clear all intervals
  - Flush pending audit writes
```

---

## Future Extension — Write Commands (Phase 3b)

When Phase 3b is implemented, `FORCE_CHARGE` will trigger a Modbus write via `ModbusAdapter`:

```typescript
// Phase 3b only — not active in current implementation
if (recommendation === 'FORCE_CHARGE') {
  const chargeWatts = Math.min(targetChargeW, device.inverterMaxWatts, MAX_GRID_CHARGE_W);
  await modbusAdapter.writeRegister(device, FORCE_CHARGE_REGISTER, chargeWatts);
  await commandSafetyLayer.audit('FORCE_CHARGE', chargeWatts, reason);
}
```

The Command Safety Layer (`apps/web/src/core/command-safety.ts`) provides:
- Zod schema validation of all commands
- Rate limiting (30 cmd/min)
- IndexedDB audit trail on the frontend
- Danger command confirmation dialog for high-power writes
