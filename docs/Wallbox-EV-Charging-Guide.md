# Wallbox & EV Charging Guide

> OCPP 2.1 (frontend), evcc backend, and §14a EnWG grid limits.

## OCPP 2.1 adapter (frontend)

![Wallbox / EV devices panel](./images/operators/wallbox-evcc-link.png)
*Devices → EV section (OCPP / evcc quick actions)*

**Settings → Adapters → OCPP 2.1**

- CSMS WebSocket URL, charge point ID, ISO 15118 options.
- **§14a:** `SET_GRID_LIMIT` uses watts (W), not percent.
- V2X commands: `SET_EV_TARGET_SOC`, `SET_EV_PHASES`, `SET_EV_MIN_CURRENT`, `SET_SMART_COST_LIMIT`.
- V2H: `sendDischargeToHome()` when vehicle supports it.

Danger commands route through `useSafeCommand` — confirmation required in UI.

## evcc backend

When evcc is the site controller:

1. Enable **evcc** adapter with `baseUrl` (e.g. `http://evcc.local:7070`).
2. Loadpoints, PV, grid, and battery map from `/api/state` + `/ws`.
3. Hardware registry lists 95%+ evcc templates under `/settings/hardware`.

## Backend EVCC protocol adapter

```bash
EVCC_BASE_URL=http://127.0.0.1:7070
ADAPTER_MODE=live
ALLOW_LIVE_HARDWARE=true
```

## §14a EnWG dimming

When the DSO signals limitation:

- Grid import cap ~4.2 kW.
- MPC optimizer and OCPP adapter coordinate EV + heat pump deferral.
- Audit trail in IndexedDB (`command-safety.ts`).

## Verification

| Check | Location |
|-------|----------|
| EV power on Sankey | Live Energy Flow |
| OCPP session state | Devices → EV detail |
| Grid limit active | Monitoring → OCPP metrics |

See: `docs/V2G-Integration-Guide.md`, `OCPP21Adapter.ts`, `EvccAdapter.ts`.
