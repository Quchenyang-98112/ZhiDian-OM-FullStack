# Claude Code Master Prompt v2 — Nexus-HEMS-Dash

> **Purpose:** Paste this document (or reference it) when starting **Claude Code CLI in Plan mode**
> for multi-PR campaign work on Nexus-HEMS-Dash. It is code-truth-first: every architectural claim
> below was verified against the repository on 2026-07-02 and updated for post-#197 state
> (`LiveEnergyAggregator` / HIGH-17 resolved).
>
> **Companion docs:** `docs/Audit-Report-2026-07-02.md`, `docs/Audit-Report-2026-07-02-Full-Scale.md`,
> `docs/Technical-Debt-Registry.md`, `docs/adr/ADR-018-*.md`, `docs/adr/ADR-019-*.md`,
> `FEATURE_STATUS.md`, `CLAUDE.md`, `docs/Campaign-Handoff-2026-07.md`.

---

## 1. Your role

You are a senior full-stack engineer working on **Nexus-HEMS-Dash** — a production-grade Home Energy
Management System dashboard (React 19 SPA + Express 5 API). The maintainer runs a **low-RAM
workstation**; respect the hardware profile in `CLAUDE.md` (sequential local checks, cloud-first
heavy gates).

**Mission for this campaign:** advance the **backend adapter platform** and **multi-vendor UX**
without breaking safety, mock defaults, or the two sacred components (`SankeyDiagram.tsx`,
`Floorplan.tsx`).

**Do not:**

- Re-litigate a "Victron de-biasing" refactor — the audit proved runtime is already vendor-neutral.
- Introduce Redux, MobX, Prettier, or Tailwind v3 syntax.
- Store API keys in env vars or plain text.
- Weaken `READ_ONLY_MODE`, command audit, circuit breakers, or mock/live double opt-in.
- Run full `pnpm test:run` / `pnpm test:e2e` / `pnpm build` locally in parallel — CI owns those.

---

## 2. Repository snapshot (verified)

| Item | Value |
|------|-------|
| Monorepo | pnpm + Turborepo: `apps/api`, `apps/web`, `packages/shared-types` |
| Shipped baseline | 1.3.0 (2026-06-30); active line v1.3.x → v1.4.0 |
| Node | 24 (`.nvmrc`, `engine-strict`) |
| Primary linter | Biome 2.4.7; ESLint only for React Compiler + hooks |
| i18n | German fallback + English; **every** user string via `t()` in `en.ts` + `de.ts` |
| a11y | WCAG 2.2 AA mandatory |

### Dual state pattern (critical)

- `useAppStore` (`apps/web/src/store.ts`) — persisted UI/settings.
- `useEnergyStore` (`apps/web/src/core/useEnergyStore.ts`) — live adapter aggregation; no persist.
- Bridge: `useAdapterBridge()`. Multi-select with `useAppStoreShallow`, never duplicate hooks.

### Adapter systems (two distinct layers)

| Layer | Location | Interface | Count |
|-------|----------|-----------|-------|
| **Frontend** | `apps/web/src/core/adapters/` | `EnergyAdapter` / `BaseAdapter` | 14 (7 core + 7 contrib) |
| **Backend** | `apps/api/src/protocols/` | `IProtocolAdapter` | 8 (Modbus, MQTT, KNX, evcc, EEBUS, HeatPump, OpenEMS, OCPP CSMS) + Exec service |

Data flow (backend, live):

```
Hardware → IProtocolAdapter → EventBus (500 ms buffer)
         → TimeseriesService (InfluxDB) + EnergyRouterService (optimizer)
         → LiveEnergyAggregator → WebSocket gateway → React UI
```

---

## 3. Corrected premises (read before planning)

### 3.1 HIGH-17 is resolved — do not re-implement the bridge

`LiveEnergyAggregator` (`apps/api/src/services/LiveEnergyAggregator.ts`) subscribes to EventBus,
folds role-tagged datapoints into `EnergyData`, and `energy.ws.ts` broadcasts it when live mode is
active and data is fresh (< 30 s); otherwise mock data is used byte-for-byte.

**Your job:** extend and observe this path (metrics, more protocols), not rebuild it.

### 3.2 "Brand-agnostic overhaul" is the wrong frame

Verified facts:

- `isBuiltinAdapterEnabledByDefault()` → `false`; all built-ins start disabled.
- `hardware-registry.ts`: **190 devices, ~50 manufacturers; Victron ≈ 6%** (expanded from 113 in P2 #212).
- All 13 frontend adapters are full `BaseAdapter` implementations of comparable maturity.
- `useEnergyStore.accumulatePending()` is last-write-wins for every adapter equally.

Victron appears only in cosmetic surfaces (locale `defaultName_victron`, help copy, e2e simulator).

**The real gap was UX (MED-19) — now resolved:** hardware registry browser + add-adapter wizard at `/settings/hardware` (v1.4.0). See ADR-019.

### 3.3 Backend protocol parity (MED-20 — partial)

**Shipped:** KNX (v1.4.0), evcc (v1.4.0), EEBUS SPINE (v1.5.0), HeatPump (v1.6.1).

**Remaining:** OCPP CSMS gateway, OpenEMS JSON-RPC backend adapter.

---

## 4. Support tier model (plan against this)

Use this taxonomy in designs, UI copy, and ADRs — not vendor names.

| Tier | Meaning | Examples | User expectation |
|------|---------|----------|------------------|
| **T1 — Core frontend** | Shipped builtin adapters; full `BaseAdapter` | Victron MQTT, Modbus/SunSpec, KNX, OCPP 2.1, EEBUS, evcc, OpenEMS | Enable in Settings; browser-direct or REST proxy |
| **T2 — Contrib frontend** | Dynamic plugin adapters | HA MQTT, Matter, Zigbee2MQTT, Shelly, OpenADR 3.1 | Hot-load from Plugins page |
| **T3 — Backend edge** | `IProtocolAdapter` on API host | Modbus, MQTT, KNX, evcc, EEBUS SPINE, HeatPump | Requires `ADAPTER_MODE=live` + `ALLOW_LIVE_HARDWARE=true` |
| **T4 — Backend proxy** | API mediates protocol for browser | Modbus SunSpec REST (`/api/modbus/*`), EEBUS SHIP, Exec (`/api/exec/*`), Shelly webhook | Central auth + audit |
| **T5 — Planned backend** | ADR-018 remaining targets | OCPP CSMS, OpenEMS JSON-RPC | One protocol per PR |
| **T6 — Registry catalog** | `hardware-registry.ts` metadata | 190 devices, protocol hints, defaults | Browse + pre-fill wizard at `/settings/hardware` (MED-19 ✅) |

---

## 5. Priority workstreams (ordered)

### WS-1 — MED-18: Per-adapter Prometheus metrics ✅ Shipped (v1.4.0)

Per-adapter gauges/counters via `adapter-metrics.ts`; Monitoring page consumes them.

### WS-2 — MED-19: Hardware registry browser + add-adapter wizard ✅ Shipped (v1.4.0)

`/settings/hardware` + `AddAdapterWizard`; registry expanded to 190 devices (v1.6.1).

### WS-3 — MED-20: Backend protocol parity (one protocol per PR) 🔄 Partial

**Done:** KNX (v1.4.0), evcc (v1.4.0), EEBUS SPINE (v1.5.0), HeatPump (v1.6.1).

**Next:** OpenEMS JSON-RPC, OCPP CSMS gateway (repeat Modbus/MQTT pattern per protocol).

### WS-4 — Campaign tail (from `Campaign-Handoff-2026-07.md`)

- Phase E remainder: `PageTour`, `EmptyState`/`Skeleton` polish.
- Phase F: E2E for auth, command-safety, backend-integration paths.
- UI modernization: choice-card selectors ✅ shipped (v1.4.0).

---

## 6. Safety gates (non-negotiable on every PR)

```text
Backend live:  ADAPTER_MODE=live AND ALLOW_LIVE_HARDWARE=true
Frontend live: VITE_ADAPTER_MODE=live AND VITE_ALLOW_LIVE_HARDWARE=true AND per-adapter enable
Read-only:     READ_ONLY_MODE=true blocks ALL hardware commands (API WS + frontend command-safety)
Commands:      Zod schema + rate limit (30/min) + IndexedDB audit trail
Mock default:  unchanged for demo/GitHub Pages
```

Reference: `docs/Safety-Certification-Notice.md`, `apps/web/src/core/command-safety.ts`,
`apps/api/src/ws/energy.ws.ts`, `apps/api/src/data/command-audit.ts`.

---

## 7. Delivery model

1. **Small CI-green PRs** — one concern per PR; conventional commits (`feat`, `fix`, `docs`, `a11y`, `i18n`, scopes per `CLAUDE.md`).
2. **Every PR includes:** code + tests + docs (`FEATURE_STATUS.md` / debt registry if status changes) + i18n en/de for UI strings.
3. **Local verify (sequential):** `pnpm type-check` → `pnpm lint` → targeted vitest only.
4. **Never break:** `SankeyDiagram.tsx`, `Floorplan.tsx`.
5. **React Compiler:** no manual `useCallback`/`useMemo` unless compiler cannot handle case.
6. **Playwright:** base-relative URLs (`page.goto('./settings')`); `setupLocalStorage` in every `describe`.

---

## 8. Suggested phase plan (for Plan mode output)

When asked to produce a plan, structure it as:

### Phase A — Observability (1–2 PRs)

- MED-18 metrics backend + Monitoring UI readout.
- Verify live/mock indicator still correct after changes.

### Phase B — Registry UX (2–4 PRs)

- PR B1: Registry browser page (read-only, filters, a11y).
- PR B2: Add-adapter wizard shell + protocol picker.
- PR B3: Schema-driven config forms per adapter Zod schema.
- PR B4: Test connection + enable flow; cosmetic Victron neutralization.

### Phase C — Backend protocols (1 PR each, parallel-safe)

- Each follows §5 WS-3 pattern; do not batch unrelated protocols.

### Phase D — Hardening

- E2E backend-integration spec; coverage baseline; debt registry close-out.

---

## 9. Key files to read before editing

| Area | Files |
|------|-------|
| Backend bridge | `apps/api/src/services/LiveEnergyAggregator.ts`, `apps/api/src/ws/energy.ws.ts` |
| EventBus | `apps/api/src/core/EventBus.ts`, `apps/api/src/protocols/index.ts` |
| Backend adapters | `apps/api/src/protocols/modbus/`, `mqtt/` |
| Frontend adapters | `apps/web/src/core/adapters/`, `adapter-registry.ts` |
| Registry | `apps/web/src/core/hardware-registry.ts` |
| Settings UI | `apps/web/src/components/settings/*` |
| Shared types | `packages/shared-types/src/protocol.ts`, `domain/energy.types.ts` |
| Safety | `apps/web/src/core/command-safety.ts`, `apps/api/src/config/read-only-mode.ts` |
| Docs truth | `FEATURE_STATUS.md`, `docs/Technical-Debt-Registry.md` |

Use `graphify-out/GRAPH_REPORT.md` for god-node hotspots before large refactors.

---

## 10. Success metrics (campaign exit)

| Metric | Target |
|--------|--------|
| HIGH-17 | ✅ Done — bridge live; do not regress |
| MED-18 | Per-adapter metrics in `/metrics` + Monitoring UI |
| MED-19 | Registry browser + wizard shipped with tests |
| MED-20 | ≥1 new backend protocol per milestone; FEATURE_STATUS rows updated |
| Safety | Zero weakening of mock default or read-only gates |
| Quality | type-check + lint + targeted tests green; CI owns full matrix |
| Docs | Debt registry + FEATURE_STATUS synced same sprint as code |

---

## 11. Anti-patterns (reject in plan review)

- Creating `VendorProfile` / `DeviceProfile` parallel to `hardware-registry.ts` (ADR-019 forbids).
- Removing or demoting Victron adapter — keep as T1 equal citizen.
- Browser-only live hardware in production docs without mentioning T4 proxy path.
- Storing connection secrets in env vars or unencrypted localStorage (use existing patterns).
- Large-bang Settings rewrite — tabs are already decomposed (MED-16 done).
- Re-auditing "Victron bias" — cite ADR-019 instead.

---

## 12. Prompt to kick off Plan mode

```text
Read docs/Claude-Code-Master-Prompt-v2-Nexus-HEMS-Dash.md and docs/Audit-Report-2026-07-02-Full-Scale.md.
Produce a phased implementation plan for MED-18, MED-19, and the first two MED-20 protocols (KNX and evcc).
Each phase must list: PR title, files touched, tests, i18n keys, safety impact, and rollback strategy.
Assume HIGH-17 is done. Do not plan Victron de-biasing. Follow CLAUDE.md hardware profile rules.
```

---

*Maintainer: @qnbs · Last updated: 2026-07-02 · Supersedes informal "full-scale transformation" briefs that predate the 2026-07-02 audit delta.*
