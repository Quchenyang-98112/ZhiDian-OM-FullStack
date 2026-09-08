# Top-5 Custom Cards for Home Assistant — Nexus-Style Energy Sankey

> Curated list of HA custom cards that recreate the Nexus-HEMS Sankey energy flow diagram.
> Includes installation, configuration examples, and a comparison matrix.

---

## Comparison Matrix

| Card | Energy Sankey | Real-Time | Animation | History | Customization | Maintenance | License |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **energy-flow-card-plus** | ✅ Full | ✅ | ✅ | ⚠️ Limited | ✅ High | ✅ Active | MIT |
| **power-flow-card-plus** | ✅ Full | ✅ | ✅ | ✅ | ✅ High | ✅ Active | MIT |
| **sankey-chart-card** | ✅ Full Sankey | ✅ | ✅ | ✅ | ✅ High | ✅ Active | MIT |
| **apexcharts-card** | ⚠️ Bar/Line only | ✅ | ✅ | ✅ Full | ✅ Very High | ✅ Active | MIT |
| **mini-graph-card** | ❌ Line only | ✅ | ⚠️ | ✅ | ⚠️ Medium | ✅ Active | MIT |

**Recommendation for Nexus-closest experience:** `sankey-chart-card` + `power-flow-card-plus` combo.

---

## 1. energy-flow-card-plus

**GitHub:** [flixlix/energy-flow-card-plus](https://github.com/flixlix/energy-flow-card-plus)
**HACS:** ✅ Available
**Stars:** 700+

The closest visual match to the Nexus energy flow diagram. Renders an animated power flow
diagram with circular nodes and animated arrows showing energy direction.

### Installation

```yaml
# via HACS → Frontend → Search "Energy Flow Card Plus"
# or manually:
resources:
  - url: /hacsfiles/energy-flow-card-plus/energy-flow-card-plus.js
    type: module
```

### Configuration Example

```yaml
type: custom:energy-flow-card-plus
title: Energy Flow (Nexus-style)
entities:
  grid:
    entity: sensor.grid_power
    display_zero_lines: true
    invert_state: true
  solar:
    entity: sensor.solar_power
  battery:
    entity: sensor.battery_power
    state_of_charge: sensor.battery_soc
  home:
    entity: sensor.house_power

# Visual options (match Nexus Neo-Energy theme):
display_zero_lines: false
use_new_flow_rate_model: true
color_icons:
  solar: "#22ff88"       # neon-green
  battery: "#00f0ff"     # electric-blue
  grid: "#ff8800"        # power-orange
  home: "#a78bfa"        # violet-400
```

### Limitations

- No drill-down on node click (unlike Nexus)
- History view requires additional `history-graph` card
- Refresh rate limited to HA state update interval (typically 10–30 s)

---

## 2. power-flow-card-plus

**GitHub:** [ulic75/power-flow-card-plus](https://github.com/ulic75/power-flow-card-plus)
**HACS:** ✅ Available
**Stars:** 1200+

Most popular power flow card. Highly customizable with support for EV charger, heat pump,
individual appliances, and grid tariff display — closely matching Nexus's 7-node Sankey.

### Installation

```yaml
# via HACS → Frontend → Search "Power Flow Card Plus"
resources:
  - url: /hacsfiles/power-flow-card-plus/power-flow-card-plus.js
    type: module
```

### Configuration Example (Full Nexus Match)

```yaml
type: custom:power-flow-card-plus
title: Nexus Power Flow
entities:
  grid:
    entity: sensor.grid_power
    name: Grid
    color_threshold:
      - value: 0
        color: "#22ff88"   # export: neon-green
      - value: 1
        color: "#ff8800"   # import: power-orange
  solar:
    entity: sensor.solar_power
    name: Solar PV
    color: "#22ff88"
    display_state: two_way
  battery:
    entity: sensor.battery_power
    name: Battery
    state_of_charge: sensor.battery_soc
    state_of_charge_unit_white_space: false
    color: "#00f0ff"
  home:
    entity: sensor.house_power
    name: House
  ev_charger:
    entity: sensor.wallbox_power
    name: EV Charger
    color: "#00f0ff"
  heat_pump:
    entity: sensor.heat_pump_power
    name: Heat Pump

# Update interval
update_interval: 2000   # ms — closest to Nexus 500ms EventBus

# Colors
circle_size: 50
line_size: 2
clickable_entities: true  # enable drill-down

# Background (match Nexus ocean-dark theme):
card_mod:
  style: |
    ha-card {
      background: rgba(7, 17, 31, 0.85);
      border: 1px solid rgba(0, 240, 255, 0.2);
    }
```

### Why This Card

- **EV Charger node** built-in (matches Nexus OCPP integration)
- **Heat Pump node** built-in (matches Nexus SG Ready integration)
- **Clickable entities** for drill-down (partial match to Nexus node-click)
- **Color thresholds** for grid import vs. export direction

---

## 3. sankey-chart-card

**GitHub:** [MindFreeze/ha-sankey-chart](https://github.com/MindFreeze/ha-sankey-chart)
**HACS:** ✅ Available
**Stars:** 300+

The **most architecturally similar** card to Nexus's D3 Sankey diagram. Uses an actual
Sankey chart layout with controllable node widths proportional to power flow.

### Installation

```yaml
resources:
  - url: /hacsfiles/ha-sankey-chart/ha-sankey-chart.js
    type: module
```

### Configuration Example

```yaml
type: custom:sankey-chart
title: Energy Sankey (Nexus-style)
sections:
  - entities:
      - entity_id: sensor.solar_power
        name: Solar PV
        color: "#22ff88"
  - entities:
      - entity_id: sensor.battery_power
        name: Battery
        color: "#00f0ff"
      - entity_id: sensor.grid_power
        name: Grid
        color: "#ff8800"
  - entities:
      - entity_id: sensor.house_power
        name: House Loads
        color: "#a78bfa"
      - entity_id: sensor.wallbox_power
        name: EV Charger
        color: "#00f0ff"
      - entity_id: sensor.heat_pump_power
        name: Heat Pump
        color: "#22ff88"

# Sizing
min_box_size: 5
min_box_distance: 5
layout_type: linear
```

### Why This Card for Nexus Users

- **True Sankey layout** — flow width proportional to power (exactly like Nexus D3 Sankey)
- **Multi-section** support (Production → Storage/Grid → Consumption)
- Units directly overlaid on nodes

### Limitation

- Not animated (static snapshot vs. Nexus animated arrows)
- Requires manual layout tweaking for complex setups

---

## 4. ApexCharts Card

**GitHub:** [RomRider/apexcharts-card](https://github.com/RomRider/apexcharts-card)
**HACS:** ✅ Available
**Stars:** 2200+

The most powerful chart card in HACS. Best used for the **Analytics** equivalent of Nexus
(time-series charts, not Sankey flow). Use for historical data visualization.

### Configuration Example — Nexus Analytics Style

```yaml
type: custom:apexcharts-card
graph_span: 24h
header:
  title: Energy Overview (24h)
  show: true
series:
  - entity: sensor.solar_power
    name: Solar PV
    color: "#22ff88"
    type: area
    opacity: 0.3
    fill_raw: "zero"
  - entity: sensor.battery_power
    name: Battery
    color: "#00f0ff"
    type: line
  - entity: sensor.grid_power
    name: Grid
    color: "#ff8800"
    type: area
    opacity: 0.2
    fill_raw: "zero"
  - entity: sensor.house_power
    name: House Load
    color: "#a78bfa"
    type: area
    opacity: 0.15

# Recharts-style layout (matching Nexus Analytics tab):
apex_config:
  chart:
    background: "rgba(7,17,31,0.8)"
    foreColor: "#94a3b8"
  tooltip:
    theme: dark
  grid:
    borderColor: "rgba(255,255,255,0.05)"
```

### Best Use Case

- Historical data (7-day, 30-day views) matching Nexus **Analytics** section
- Cost overlay with tariff data
- Self-sufficiency ratio time series

---

## 5. mini-graph-card

**GitHub:** [kalkih/mini-graph-card](https://github.com/kalkih/mini-graph-card)
**HACS:** ✅ Available
**Stars:** 2700+

Lightweight, compact graph cards for compact dashboards. Best for Nexus-style **KPI cards**
with sparklines (matching Nexus `CommandHub` metric cards).

### Configuration Example — Nexus KPI Cards

```yaml
# Solar Power KPI Card
type: custom:mini-graph-card
entities:
  - entity: sensor.solar_power
    name: Solar PV
color: "#22ff88"
line_width: 2
show:
  average: true
  extrema: true
  graph: line
  icon: true
  labels: true
  points: false
hours_to_show: 24
aggregate_func: max

# Battery SoC with colored threshold
type: custom:mini-graph-card
entities:
  - entity: sensor.battery_soc
    name: Battery SoC
color_thresholds:
  - value: 20
    color: "#ef4444"   # red: critical
  - value: 50
    color: "#ff8800"   # orange: medium
  - value: 80
    color: "#22ff88"   # green: good
show:
  fill: true
  extrema: true
```

---

## Recommended Dashboard Layout

Combining all cards for a full **Nexus-equivalent HA dashboard**:

```yaml
title: HEMS Dashboard (Nexus-style)
views:
  - title: Overview
    cards:
      # Row 1: KPI sparklines (matching Nexus CommandHub)
      - type: horizontal-stack
        cards:
          - type: custom:mini-graph-card
            entities: [{entity: sensor.solar_power}]
          - type: custom:mini-graph-card
            entities: [{entity: sensor.battery_soc}]
          - type: custom:mini-graph-card
            entities: [{entity: sensor.grid_power}]

      # Row 2: Main Power Flow (pick one)
      - type: custom:power-flow-card-plus   # best overall
        # OR:
      - type: custom:sankey-chart           # closest to Nexus Sankey

      # Row 3: 24h Time Series (Nexus Analytics equivalent)
      - type: custom:apexcharts-card
        graph_span: 24h
```

---

## Why Nexus > HA Custom Cards

| Feature | Nexus D3 Sankey | Best HA Custom Card |
|---------|:---:|:---:|
| Sub-second updates (500 ms) | ✅ | ❌ (10–30 s) |
| Web Worker offloaded layout | ✅ | ❌ |
| Interactive drill-down | ✅ | ⚠️ Partial |
| WCAG 2.2 AA accessible | ✅ | ⚠️ Varies |
| Multi-protocol adapters | ✅ | ❌ HA only |
| MPC optimizer integration | ✅ | ❌ |
| §14a EnWG compliance | ✅ | ❌ |
| Offline PWA | ✅ | ❌ |

Use HA custom cards as a **lightweight companion** when full Nexus isn't deployed, or to embed
Nexus-level functionality into an existing HA dashboard.

---

*See also: [Home Assistant Integration Guide](./Home-Assistant-Integration-Guide.md) · [HA Migration Plan](./HA-Migration-Hybrid-Plan.md)*
