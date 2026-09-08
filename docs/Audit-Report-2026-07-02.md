> **Supersession (2026-07-02):** HIGH-17 (EventBus→WebSocket bridge) and MED-19 (registry browser + wizard) are **resolved** (PRs #197/#203/#204). Registry expanded to **190 devices** (P2 #212). P1 adapter enhancements (#211): Shelly Gen1/3, Zigbee2MQTT roles, OCPP §14a W-unit. This report remains a historical snapshot of the 2026-07-02 baseline.

# Nexus-HEMS-Dash — Audit Delta Report (2026-07-02)

**Version:** 2026-07-02 (delta addendum to `docs/Audit-Report-2026-06-29.md`)
**Repository baseline:** `main` @ `e60e7f7` (2026-07-02, after PR #194)
**Shipped release line:** 1.3.0 (2026-06-30)
**Active work line:** v1.3.x → v1.4.0 campaign (`docs/Campaign-Handoff-2026-07.md`)
**Auditor:** Claude Code (3 parallel `Explore` agents over backend/frontend/docs + direct file reads)
**Standards referenced:** as in the 2026-06-29 report (OWASP, CWE, WCAG 2.2 AA, React 19 Compiler, VDE-AR-E 2829-6 / ISO 15118-20 domain context)

> **This is a delta.** It does **not** re-derive the 46-finding catalogue in
> `docs/Audit-Report-2026-06-29.md`. It records (1) what changed since that audit, (2) two
> premises from a proposed "full-scale transformation" brief that the code contradicts, and
> (3) the new findings + forward sequence. Tracked items live in
> `docs/Technical-Debt-Registry.md` (2026-07-02 audit-delta section).

---

## 1. Why this audit, and how it was done

A proposed master brief called for a multi-week transformation: backend adapters for all
protocols, a "brand-agnostic overhaul," and holistic perfection. Before planning against it,
the *actual* repository state was verified by three parallel read-only exploration agents
(backend protocol layer, frontend adapters + vendor-bias reality, docs/campaign/debt state)
followed by direct reads of the canonical files. The brief's snapshot proved partly stale, so
this report corrects it and re-scopes the work honestly.

**Headline:** the foundation is as strong as the 2026-06-29 audit found — and stronger after
the A–G campaign. The single highest-value technical gap is **not** in the brief: real backend
adapter data never reaches the UI. The brief's "brand-agnostic" premise is **largely false**.

---

## 2. What changed since 2026-06-29

- **v1.3.0 shipped (2026-06-30):** read-only mode (SAF-05), EEBUS end-to-end mTLS proxy,
  Modbus SunSpec REST proxy (PROT-01), server-side command audit, live/mock safety indicator,
  supply-chain hardening (Grype gate + cosign + SLSA in CI), JWT zero-downtime rotation. These
  close many HIGH/SUPPLY items open in the prior audit (SEC-06/07, SUPPLY-01, SAF-05, HIGH-07).
- **A–G campaign (per `docs/Campaign-Handoff-2026-07.md`):**
  - **A/B/C/D/G complete** — safety re-verify + truth-sync; a11y deep-dive (11 biome a11y
    rules → error, `useFocusTrap`, Recharts sr-only tables, target-size, 7:1 light-theme
    danger-fg); visual perfection (`--chart-1..7` + `--price-*` tokens, all Recharts off raw
    hex, `blur(64px)→blur(24px)`, calmer glow); maintainability (**MED-16: Settings.tsx
    3,663 → 512 LOC, ten tab modules**); DevOps/Graphify (ADR-017).
  - **F substantial** — 47 new tests (`settings-tabs` 21, `adapter-worker-target` 12,
    `hardware-registry` 11, `use-safe-command` 3).
  - **E partial** — command feedback toasts shipped; PageTour + EmptyState/Skeleton remain.
- **Post-1.3.0 hardening merged after #191 (this baseline):** #192 production auth scopes +
  safety warnings + CI hardening; #193 `targetAdapterId` command routing (**ARCH-03 resolved**)
  + production Redis-backed WS-ticket/share stores (**MED-15 resolved**); #194 offline-cache
  quota warning (**LOW-05 resolved**), web coverage raised (70/63/58/70 + baseline gate) and
  contrib-adapter tests. None of these touch the HIGH-17 keystone below — `energy.ws.ts` still
  broadcasts mock in both modes (re-verified against `main` @ e60e7f7).
- **Net effect:** the brief's "verify recent polish" asks (Settings decomposition, token
  migration, a11y) are **already done** on `main` and need no rework.

---

## 3. Corrected premises (evidence-based)

### 3.1 CORRECTION — the real keystone the brief missed: backend data never reaches the UI

`apps/api/src/protocols/` has exactly two real adapters — `modbus/ModbusAdapter.ts` and
`mqtt/MqttAdapter.ts` — both implementing `IProtocolAdapter`
(`packages/shared-types/src/domain/energy.types.ts`), Zod-validating datapoints, writing a DLQ,
and piping into `EventBus` (`apps/api/src/core/EventBus.ts`). EventBus fans out to
`TimeseriesService` (InfluxDB) and `EnergyRouterService` (optimizer).

**The WebSocket gateway (`apps/api/src/ws/energy.ws.ts`) never subscribes to EventBus.** It
broadcasts `apps/api/src/data/mock-data.ts` on a 2 s loop in **both mock and live mode**. So:

- Real adapter output is stored and optimized against, but **never sent to the browser**.
- "Live mode" today shows the operator **simulated data** — a correctness/trust gap, not just
  a missing feature.
- The entire backend adapter layer is a **dead-end for the UI**.

Crucially, `docs/Backend-Implementation-Roadmap.md` §1 already **designed** the WS gateway as
an EventBus subscriber (the fan-out diagram lists it) — this is unfinished wiring, not a new
architecture. Wiring it is the keystone that unblocks every future backend protocol.
→ Tracked as **HIGH-17**; direction recorded in **ADR-018**.

### 3.2 CORRECTION — "Victron fixation / lack of brand-agnosticism" is largely false

The runtime is already vendor-neutral:

| Claim in brief | Ground truth |
|---|---|
| Victron is the default / center | No default adapter — `isBuiltinAdapterEnabledByDefault()` returns `false`; all built-ins start disabled |
| Registry is Victron-skewed | `hardware-registry.ts`: **113 devices, ~30 manufacturers; Victron = 7 (~6%)**, with tested query helpers |
| Config UIs are Victron-first | Settings tabs + 7 controller pipelines are protocol-agnostic |
| Other adapters are thin | All 13 frontend adapters are real, full `BaseAdapter` implementations of comparable maturity |
| Merge favors Victron | `useEnergyStore.accumulatePending()` is last-write-wins, identical for every adapter |

Victron appears only in **cosmetic** surfaces: locale display name `defaultName_victron`,
educational help copy, and the e2e mock simulator. **There is no runtime bias to remove.**

The real gap under the framing is UX: **no "add adapter instance" wizard**, and the 113-device
registry is **never surfaced in a browsable UI**. → Tracked as **MED-19**; redirect recorded in
**ADR-019** (which explicitly rejects a parallel `DeviceProfile` abstraction as duplicative).

---

## 4. Adapter maturity matrices

### 4.1 Frontend adapters (`apps/web/src/core/adapters/`) — all real

| Adapter | Kind | LOC | Connection | Maturity |
|---|---|---|---|---|
| victron-mqtt | builtin | 583 | Browser → Venus OS (ws/wss:9001) | Prod |
| modbus-sunspec | builtin | 521 | Browser → REST bridge / proxy | Prod |
| ocpp-21 | builtin | 691 | Browser → EVSE/CSMS (ws) | Prod |
| eebus | builtin | 892 | Browser → SPINE/SHIP (TLS) | Prod |
| knx | builtin | 450 | Browser → KNXnet/IP tunnel | Prod |
| openems | builtin | 705 | Browser → OpenEMS Edge (JSON-RPC ws) | Prod |
| evcc | builtin | 450 | Browser → evcc REST + ws | Prod |
| homeassistant-mqtt | contrib | 355 | Browser → HA MQTT | Prod |
| matter-thread | contrib | 535 | Browser → Matter/Thread | Prod |
| zigbee2mqtt | contrib | — | Browser → Zigbee bridge | Prod |
| shelly-rest | contrib | 352 | Browser → Shelly REST | Prod |
| openadr-3-1 | contrib | 618 | Browser → OpenADR VTN | Prod |
| example-contrib | contrib | 141 | HTTP polling | Template |

All extend `BaseAdapter` (circuit breaker, Zod, reconnect, per-adapter metrics, audit).

### 4.2 Backend adapters (`apps/api/src/protocols/`) — two real, **none WS-wired**

| Protocol | Backend status | IProtocolAdapter | Zod | DLQ | Metrics | Feeds UI? |
|---|---|---|---|---|---|---|
| modbus-sunspec | Complete | ✅ | ✅ | ✅ | ❌ | ❌ (EventBus→WS not wired) |
| victron-mqtt | Complete | ✅ | ✅ | ✅ | ❌ | ❌ (EventBus→WS not wired) |
| knx, ocpp, eebus-SPINE, evcc, openems | Stub / none | ❌ | — | — | — | — |

EEBUS has backend SHIP handshake + trust store + REST (v1.3.0) but no continuous SPINE data
adapter; OpenADR has a backend OAuth2 proxy. Per-adapter Prometheus metrics do not exist
anywhere (only platform-level gauges in `middleware/metrics.ts`).

---

## 5. New findings (2026-07-02) — tracked in the debt registry

| ID | Sev | Finding | Evidence | Fix direction |
|---|---|---|---|---|
| **HIGH-17** | HIGH | Backend adapter data not bridged to WebSocket; live mode serves mock to UI | `ws/energy.ws.ts` broadcast loop; `core/EventBus.ts` subscribers | Subscribe WS gateway to EventBus, gated on resolved live mode (ADR-018) |
| **MED-18** | MED | No per-adapter Prometheus metrics (only platform gauges) | `middleware/metrics.ts`; adapters emit none | Per-instance connect/latency/age/error metrics (ADR-018) |
| **MED-19** | MED | No add-adapter-instance UI; hardware registry not surfaced | `hardware-registry.ts` (used only by tests); no Settings surface | Registry browser + schema-driven wizard (ADR-019) |
| **MED-20** | MED | Backend protocol parity gap (KNX/OCPP-CSMS/EEBUS-SPINE/evcc/OpenEMS) | `protocols/` has only modbus + mqtt | Backend `IProtocolAdapter` per protocol + proxy mode (ADR-018); cross-ref HIGH-12 |

---

## 6. Forward sequence (campaign, after E/F)

The brief's Section-5 phases are a genuine 1–2 month, many-PR effort matching
`docs/Perfection-Roadmap.md` Phase 2–3. Recommended order once the current campaign's E/F tail
lands:

1. **HIGH-17 — EventBus → WS bridge** (keystone; unblocks everything below). ADR-018.
2. **MED-18 — per-adapter metrics** (ship alongside the bridge for observability). ADR-018.
3. **MED-19 — registry browser + add-adapter wizard** (the real "flexibility" win). ADR-019.
4. **MED-20 — backend protocol parity**, one protocol per PR, Modbus/MQTT pattern + proxy
   mode; fold in HIGH-12 (OCPP Profile 3). ADR-018.

Each step keeps the safety gates (`ADAPTER_MODE`/`ALLOW_LIVE_HARDWARE`/`READ_ONLY_MODE`,
command audit) intact and carries its tests + docs + i18n (en/de), per the campaign delivery
model.

---

## 7. Still excellent (unchanged from 2026-06-29, re-affirmed)

Post-adversarial security culture; the `BaseAdapter` plugin architecture; CI depth (SLSA L3,
dual-browser E2E, size-limit gate, supply-chain scanning now *in* CI); documentation volume;
accessibility investment (now further hardened in campaign Phase B); strict Biome/React-Compiler
toolchain; energy-domain depth (OCPP BPT, OpenADR 3.1, VPP, §14a EnWG).

No new Critical findings. The safety posture is intact and improved.

---

## 8. Related documents

| Document | Purpose |
|---|---|
| `docs/Audit-Report-2026-06-29.md` | Full prior audit (46-finding catalogue) — this report is its delta |
| `docs/Technical-Debt-Registry.md` | Canonical tracker (2026-07-02 audit-delta section) |
| `docs/Backend-Implementation-Roadmap.md` | Pre-specified backend/EventBus architecture (WS bridge designed here) |
| `docs/adr/ADR-018-backend-mediated-protocol-adapters.md` | Keystone architecture decision |
| `docs/adr/ADR-019-adapter-instance-management-and-registry-surfacing.md` | Registry/wizard redirect decision |
| `docs/Campaign-Handoff-2026-07.md` | A–G campaign status + resume |
| `docs/Perfection-Roadmap.md` | Phased plan; backend parity is Phase 2–3 |

*Next scheduled full review: 2026-09-29 (per the 2026-06-29 report's quarterly cadence).*
