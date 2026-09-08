# Tariff Providers Setup Guide

Nexus-HEMS integrates 5 dynamic electricity tariff providers. This guide walks through the configuration for each provider.

> **Source:** `apps/web/src/lib/tariff-providers.ts` · **Key functions:** `getDynamicGridFee()`, `isPeakHour()`, `getGridFeeSchedule()`, `applyDynamicGridFees()`

---

## Supported Providers

| Provider | Region | API Type | Pricing | Real-Time |
|----------|--------|----------|---------|-----------|
| **Tibber** | DE / NO / SE / NL / ES | GraphQL | Spot + surcharge | ✅ Hourly push |
| **aWATTar DE** | Germany | REST JSON | EPEX Spot DE | ✅ Hourly REST |
| **aWATTar AT** | Austria | REST JSON | EPEX Spot AT | ✅ Hourly REST |
| **Octopus Energy** | UK / DE | REST JSON | Agile Tariff | ✅ 30-min slots |
| **Nordpool** | EU Markets | REST JSON | Day-ahead market | ✅ Day-ahead |

---

## 1. Tibber

### Prerequisites

- Tibber account: [tibber.com/signup](https://tibber.com)
- Smart meter or Tibber Pulse attached to your meter
- Access Token from the [Tibber Developer Portal](https://developer.tibber.com)

### Configuration

1. Open **Settings → Tariffs & Pricing** in the Nexus-HEMS UI.
2. Select **Tibber** as your tariff provider.
3. Paste your **API Token** (stored encrypted in IndexedDB — never in env vars).
4. Click **Verify Token** to confirm connectivity.
5. Select your **Home ID** if you have multiple locations.

### GraphQL Endpoint

```
https://api.tibber.com/v1-beta/gql
Authorization: Bearer <token>
```

### What It Provides

- `priceInfo.current.total` — current total price (€/kWh incl. taxes)
- `priceInfo.today[]` — 24 hourly prices for today
- `priceInfo.tomorrow[]` — next-day prices (available from ~13:00 CET)
- Level: `VERY_CHEAP`, `CHEAP`, `NORMAL`, `EXPENSIVE`, `VERY_EXPENSIVE`

### Optimizer Integration

The MPC optimizer uses Tibber tomorrow prices to pre-charge batteries when prices are minimal. If tomorrow's prices are unavailable (before ~13:00), it falls back to today's average.

---

## 2. aWATTar Germany

### Prerequisites

- No account required for basic pricing
- Optional: aWATTar tariff contract for full cost breakdown

### Configuration

1. **Settings → Tariffs & Pricing** → select **aWATTar DE**.
2. Optionally enter your network fee (Netzentgelt, €/kWh) and taxes if not bundled.
3. Set your **markup percentage** (aWATTar charges a fixed markup on EPEX spot).

### REST Endpoint

```
GET https://api.awattar.de/v1/marketdata
?start=<unix_ms>&end=<unix_ms>
```

Response: 1-hour resolution EPEX SPOT prices in €/MWh. Nexus-HEMS automatically converts to €/kWh and applies the §14a EnWG dynamic grid fee schedule.

### §14a EnWG Grid Fee Reduction

When **§14a EnWG** mode is enabled (Settings → Grid Operator Integration):
- Grid operator can send price signals to reduce grid fees by up to 60%
- `getDynamicGridFee()` detects the active signal and reduces fees accordingly
- Savings are logged to IndexedDB for monthly reporting

---

## 3. aWATTar Austria

Configuration is identical to aWATTar Germany. Only the REST endpoint differs:

```
GET https://api.awattar.at/v1/marketdata
```

Austrian market uses EPEX SPOT AT prices in €/MWh.

---

## 4. Octopus Energy (UK / DE)

### Prerequisites

- Active Octopus Energy account
- Agile Octopus tariff enrollment
- API key from account dashboard: **Account → Developers**

### Configuration

1. **Settings → Tariffs → Octopus Energy**
2. Enter your **API Key** and **Account Number**
3. Select your **Distribution Network Operator (DNO) region** (affects Agile prices)
4. Enable **Half-Hourly Optimization** to schedule loads at 30-minute resolution

### REST Endpoint

```
GET https://api.octopus.energy/v1/products/AGILE-23-12-06/electricity-tariffs/
    E-1R-AGILE-23-12-06-<REGION>/standard-unit-rates/
Authorization: Basic <base64(api_key:)>
```

### Tips

- Agile prices are published by 16:00 for the following day.
- Negative prices (you get paid to consume) can happen overnight — the optimizer will schedule battery charging automatically.
- Import and export prices differ if you have an export tariff.

---

## 5. Nordpool (Day-Ahead Markets)

### Prerequisites

- No authentication required for public pricing data
- Configure your **bidding zone** (e.g., DE-LU, AT, NO1, SE1-4)

### Configuration

1. **Settings → Tariffs → Nordpool**
2. Select your **bidding zone / price area**
3. Optionally configure local network fees and surcharges

### REST Endpoint (unofficial)

```
GET https://www.nordpoolgroup.com/api/marketdata/page/10
?currency=EUR&endDate=<YYYY-MM-DD>&entityName=<zone>
```

Day-ahead prices are published daily at ~12:00 CET.

---

## Peak Hour Configuration

Nexus-HEMS defines three peak windows used for cost optimization:

```
Morning peak:    07:00 – 09:00
Midday peak:     12:00 – 14:00
Evening peak:    17:00 – 21:00
```

These windows are configurable in **Settings → Optimization → Peak Hours**.

`isPeakHour()` returns `true` during these windows, triggering:
- Battery dispatch for self-consumption
- EV charging pause (unless emergency)
- Heat pump load deferral via SG Ready

---

## Grid Fee Schedule

`getGridFeeSchedule()` returns a 24-element array of hourly grid fees in €/kWh. This is combined with spot prices for total cost-of-energy calculation sent to the MPC optimizer.

**Example typical German HT/NT schedule:**

| Time | Grid Fee (€/kWh) | Category |
|------|-----------------|---------|
| 00:00 – 06:00 | 0.0620 | NT (off-peak) |
| 06:00 – 22:00 | 0.0890 | HT (high tariff) |
| 22:00 – 24:00 | 0.0620 | NT (off-peak) |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "No prices available" | API rate limit or quota | Wait 15 min, check API key |
| Optimizer uses static prices | Tomorrow prices not yet published | Expected before ~13:00 CET |
| Negative aWATTar price ignored | §14a mode off | Enable grid operator integration |
| "Invalid API key" with Tibber | Token expired or revoked | Re-generate at [developer.tibber.com](https://developer.tibber.com) |
| Octopus prices wrong region | Wrong DNO configured | Re-select region code in Settings |

---

*See also: [AI-Providers-Setup.md](./AI-Providers-Setup.md) · [Master-Improvement-Roadmap.md](./Master-Improvement-Roadmap.md)*
