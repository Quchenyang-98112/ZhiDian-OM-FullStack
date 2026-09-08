# EEBUS Integration Guide

> SPINE/SHIP pairing, mTLS certificates, and §14a load control via the `eebus` adapter (frontend) and `EebusProtocolAdapter` (backend).

> Operator screenshots: see `docs/Operator-Screenshots.md` for capture checklist.

## Quick start

![EEBUS certificates tab](./images/operators/eebus-certificates.png)
*Settings → EEBUS → Certificates (trust store + import)*

1. **Settings → EEBUS Certs** — generate or import client certificate; note SKI.

![EEBUS pairing — import certificate dialog](./images/operators/eebus-pairing-wizard.png)
*Import certificate wizard (pairing step)*

2. **Pair device** — use the EEBUS pairing wizard; approve trust on the heat pump / EVSE / energy manager.
3. **Enable adapter** — Settings → Adapters → EEBUS → live mode requires double opt-in (`ADAPTER_MODE=live` + `ALLOW_LIVE_HARDWARE=true`).
4. **Verify** — Monitoring shows SHIP session health; Live Energy Flow shows grid/limit datapoints when LPC/MGCP use cases are active.

## Supported use cases

| Use case | Description |
|----------|-------------|
| MPC | Measurement power consumption |
| MGCP | Microgrid control profile |
| LPC | Limitation of power consumption (§14a EnWG) |
| EV charging | ISO 15118 / SPINE load control |
| Heat pump | SG Ready via SPINE limits |

## Backend (edge)

Set trust store path and enable in `apps/api/src/protocols/index.ts`. Backend adapter polls trust store for newly paired devices.

Env reference: see `docs/Protocol-Adapter-Guide-Backend.md` EEBUS section.

## Security

- mTLS 1.3 required for SHIP; only **private-network** hosts allowed (SSRF guard).
- Never deploy without reviewing `docs/Safety-Certification-Notice.md`.
- Certificate revocation: remove SKI from trust store and restart adapter.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Pairing timeout | Firewall UDP/TCP SHIP ports; same subnet |
| `auth_invalid` / TLS error | Clock skew, expired cert, wrong SKI |
| No UI data in mock mode | Expected — enable live mode + fresh aggregator window (30 s) |

See also: `EebusProtocolAdapter.test.ts`, `apps/web/src/components/settings/CertificateManagement.tsx`.
