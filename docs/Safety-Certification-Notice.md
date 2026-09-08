# Safety & Certification Notice — Nexus-HEMS-Dash

**Last updated:** 2026-07-10
**Applies to:** All versions (current release line **1.11.0**)

---

## 1. Safety-Critical Context

Nexus-HEMS-Dash controls or monitors safety-critical electrical infrastructure:

| Domain | Typical hazard | Regulatory scope |
|---|---|---|
| Battery storage (LFP, NMC) | Overcharge / thermal runaway | IEC 62619, VDE 0510-11 |
| EV charging / V2G (OCPP, ISO 15118) | Grid instability, EV battery damage | IEC 61851, ISO 15118 |
| Heat pump (SG Ready, EEBUS) | Comfort loss, freeze damage | EN 14511, VDE-AR-N 4105 |
| Grid feed-in / §14a EnWG | Regulatory non-compliance | EnWG §14a, NAV §20 |
| Photovoltaic inverter (SunSpec/Modbus) | Anti-islanding, overvoltage | VDE-AR-N 4105, IEC 62116 |

**Any software that sends commands to these systems operates in a safety-critical domain.** Failures can cause property damage, electrical fires, injuries, or regulatory penalties.

---

## 2. Current Certification Status

> **No regulatory certification has been obtained for any version of Nexus-HEMS-Dash.**

| Standard | Status | Notes |
|---|---|---|
| VDE-AR-E 2829-6 (EEBUS/HEMS) | ❌ Not certified | SHIP handshake implemented; TÜV/DEKRA audit pending |
| VDE-AR-N 4105 (grid feed-in) | ❌ Not certified | Adapter configuration only; no SIL assessment |
| ISO 15118-20 (V2G / BPT) | ❌ Not certified | BPT parameters implemented; CharIN conformance testing not performed |
| IEC 62619 (battery safety) | ❌ Not applicable | Application layer only; cell/BMS hardware certified separately |
| CE marking | ❌ Not assessed | No EU Declaration of Conformity |
| GDPR Art. 25 (privacy by design) | 🔄 Partial | PII masking implemented; formal DPIA not performed |

### What "production-grade" means for this project

The label **production-grade** refers to software quality attributes:

- Strict TypeScript, zero linting warnings, WCAG 2.2 AA accessibility
- Automated security gates (syft SBOM, `pnpm audit` dependency scan, CodeQL/Semgrep SAST)
- Circuit-breaker patterns, dead-letter queues, structured logging
- SLSA build-provenance attestations on CI builds; GHCR container images are Grype-gated and **cosign keyless-signed** at publish (`container-publish.yml`, shipped v1.3.0 — SUPPLY-01)
- OCPP 2.1 / EEBUS SHIP / OpenADR 3.1 protocol compliance at the implementation level

It does **not** imply regulatory approval, functional safety assessment (IEC 61508 / EN 50128 SIL), or approval for safety-critical use without independent certification.

---

## 3. Mock Mode vs. Live Hardware

The `ADAPTER_MODE=mock` default is intentional for developer onboarding and CI. **Critical differences:**

| Property | Mock mode | Live hardware |
|---|---|---|
| Data source | Random/simulated | Real inverters, EV chargers, heat pumps |
| Commands executed | Logged only | Sent to hardware |
| Failure modes | None | Thermal runaway, overcurrent, grid violations |
| Circuit breaker | Present but trivially exercised | Must be validated under real fault conditions |
| Latency | Synthetic | Protocol-dependent (MQTT ≤ 500 ms, Modbus RTU ~100 ms) |

**Before switching to live hardware on real equipment:**

1. Set `ADAPTER_MODE=live` **and** `ALLOW_LIVE_HARDWARE=true` (backend) or `VITE_ADAPTER_MODE=live` **and** `VITE_ALLOW_LIVE_HARDWARE=true` (frontend build).
2. Review `docs/Adapter-Dev-Guide.md` and `docs/Protocol-Adapter-Guide-Backend.md` end-to-end.
3. Validate every adapter config against the `Hardware-Compatibility-Matrix.md`.
4. Confirm all rate limits, SOC guardrails, and §14a power caps are correctly configured.
5. Run with hardware **read-only** first (disable write commands in adapter config) and monitor `apps/api/data/audit-log.ndjson` for 24–48 hours.
6. Engage a qualified electrician and, where required, a certified energy system integrator.

---

## 4. Command Safety Architecture

The following layers are implemented to reduce — but not eliminate — risk:

```
User UI / AI Suggestion
  │
  ▼
READ-ONLY MODE kill-switch (SAF-05) ── blocks ALL control commands when enabled
  │        frontend: VITE_READ_ONLY_MODE (command-safety.ts)
  │        backend:  READ_ONLY_MODE (energy.ws.ts) → audit outcome "rejected_readonly"
  ▼
Zod schema validation (packages/shared-types)
  │
  ▼
Rate limiting: 30 cmd/min (single token spend at the dispatch boundary)
  │
  ▼
IndexedDB audit trail (apps/web/src/core/command-safety.ts)
  │
  ▼
SOC guardrails: V2G/V2H discharge blocked below 15% AND when SOC is
unknown/0 (fail-safe, OCPP21Adapter); §14a cap 4.2 kW grid charge
  │
  ▼
Circuit breaker: CLOSED → OPEN after 5 failures, 30s cooldown
  │
  ▼
Hardware adapter (OCPP SP3 mTLS / Modbus / MQTT / EEBUS SHIP mTLS)
  │
  ▼
Physical hardware (inverter / wallbox / heat pump / battery)
```

These layers are software-only. They do not replace hardware-level protection devices (fuses, MCBs, RCDs, BMS overcurrent protection).

**Read-only mode is a two-flag control (deployment footgun).** Backend `READ_ONLY_MODE=true` blocks commands only at the API / WebSocket layer — it does **not** stop browser-side adapter commands issued directly from the SPA. Certification-grade, provably-read-only deployments **must set both** `READ_ONLY_MODE=true` (backend) **and** build-time `VITE_READ_ONLY_MODE=true` (frontend). See DOC-03 in the Technical Debt Registry.

**Live backend data path (HIGH-17 / ADR-018).** When the backend runs in `ADAPTER_MODE=live` with fresh data, `LiveEnergyAggregator` folds EventBus datapoints into the `EnergyData` snapshot broadcast over WebSocket; otherwise the mock stream is served unchanged. The browser consumer is opt-in behind `VITE_BACKEND_WS` (ADR-025). OCPP Security Profile 3 and EEBUS SHIP use server-held mTLS via the backend proxy (HIGH-12) — the browser never holds CSMS client certificates.

---

## 5. What Must Be Done Before a Safety-Critical Deployment

### Mandatory steps

- [ ] **Professional electrical installation review** by a licensed electrician
- [ ] **VDE-AR-N 4105 compliance check** for grid feed-in (if applicable, Germany)
- [ ] **Grid operator notification** for battery storage ≥ 600 W (NAV §20)
- [ ] **Hardware BMS independence** — battery safety must not depend solely on this software
- [ ] **Failsafe hardware interlock** — ensure the physical system can operate safely if the HEMS dashboard becomes unavailable (network outage, server restart)

### Strongly recommended

- [ ] Penetration test before exposing any API endpoint to the internet
- [ ] Separate VLAN for HEMS devices, isolated from general home network
- [ ] Regular `pnpm audit` + syft SBOM review (at minimum before each live deployment); the Grype image/source scan is wired in CI (`sbom-scan.yml`, `container-publish.yml` — SUPPLY-01)
- [ ] Set **both** `READ_ONLY_MODE=true` (backend) and `VITE_READ_ONLY_MODE=true` (frontend) for commissioning / incident investigation — a single flag does not fully disable control (see §4)
- [ ] Monitoring alerts on circuit-breaker OPEN events (Prometheus → Alertmanager)
- [ ] Backup power for the server running the API (UPS)

---

## 6. Tauri Desktop App — Updates

The Tauri auto-updater has been **removed** from this project. Desktop builds (`apps/web/src-tauri/`) ship without an in-app update mechanism; users update by downloading a new release from GitHub. This eliminates the Minisign signing-key burden and removes the failure mode of unsigned/mismatched updater artifacts.

If signed auto-updates become a requirement again, re-introduce `tauri-plugin-updater`, `plugins.updater` in `tauri.conf.json`, and the `TAURI_SIGNING_*` CI secrets following the official Tauri v2 docs.

---

## 7. Regulatory & Liability Disclaimer

This software is provided "as is" under the MIT License. The authors:

- Make no warranties regarding fitness for safety-critical use
- Accept no liability for property damage, personal injury, or regulatory penalties arising from use in live electrical systems
- Do not represent that any version is certified under VDE, IEC, ISO, CE, or equivalent standards

End users and integrators are solely responsible for ensuring compliance with applicable local regulations, grid operator requirements, and safety standards before deploying this software with real hardware.

---

## 8. Reporting Safety Issues

Security and safety vulnerabilities should be reported via the coordinated disclosure process described in `SECURITY.md`. Do **not** open public GitHub issues for safety-critical bugs until a patch is available.

For imminent safety hazards in live deployments, shut down the system immediately and contact your hardware vendor and local grid operator.

---

*This notice is reviewed before each minor release. Open a PR against this file to suggest corrections.*
