# Changelog

All notable changes to **Nexus-HEMS-Dash** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release notes are maintained here and published via [semantic-release](https://github.com/semantic-release/semantic-release) on **manual** workflow dispatch (`release.yml`, `approveRelease=RELEASE`) or via the fully manual tag procedure in **ADR-015**. Automatic release on every `main` push was disabled 2026-07-03 after empty-body releases `v1.8.0`/`v1.9.0`; see `docs/Release-History.md`.

## [Unreleased]

> **HEAD:** Unreleased on `main` @ `c4e7939` (post-Stream F closeout). Not yet released — cut `v1.11.2` only when the maintainer dispatches `release.yml` or tags manually (ADR-015).

### Added

- **Stream F — protocol depth** (#355) — SG Ready closed loop (`SET_HEAT_PUMP_MODE` UI → `controller-command-bridge` → backend Modbus/HA/EEBUS/Matter/Zigbee); OpenADR programs/webhook buffer + `openadr-hardware-dispatch`; E2E specs `sg-ready-heat-pump`, `openadr-demo-event`.
- **Offline sync Stream C (ADR-030)** — optional Redis-backed sync version, settings, diff log, and HTTP/WS idempotency when `REDIS_URL` is set; `POST /api/commands/replay` for hardware offline queue; Helm `server.redisUrl` + multi-replica warning in NOTES.txt.
- **Offline sync slice 2** — `GET /api/sync/version`, JWT liveness guard before offline replay, 5-minute hardware-command TTL expiry, client `sync-client` conflict probe (#344).
- **Offline sync slice 3** — conflict banner, resolution modal (keep local / accept server), deferred replay until resolved (#346).
- **Offline sync slice 4** — `GET /api/sync/diff?since=`, `PUT /api/settings` with idempotency, server-wins reconciliation, Playwright conflict E2E (#349).

### Changed

- **Stream F review follow-ups** (#356) — HA returns `handled: false` when heat-pump/charging entities missing; Matter requires explicit `MATTER_HEAT_PUMP_NODE_ID`; Zigbee rejects non-finite power commands; OpenADR VTN relay 15s timeout; OpenADR aggregate LOAD_CONTROL dispatch; controller-bridge in-flight guard.
- **Offline sync** — idempotency middleware now supports PUT/PATCH; expanded to exec, OCPP proxy-session; live WebSocket commands honor idempotency keys; background sync replays hardware via `/api/commands/replay`.
- **CI / Node 24** — `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` on auxiliary workflows at job level (#343); `ci.yml` sets the flag per job (not workflow-wide) so Scorecard `publish_results` is unaffected.
- **Review policy** — mandatory PR review quiescence before merge (#348).
- **Release workflow** — checkout uses default `GITHUB_TOKEN`; `GH_TOKEN` only for semantic-release push (#347).

### Deprecated

### Removed

### Fixed

- **Pages demo i18n** — gate first paint on `i18nReady` so the active locale loads before React mounts; prevents mixed-language chrome without bloating the app entry chunk.
- **Tariff formatter** — shared `formatTariffPrice` for header pill (compact ct/kWh), Command Hub price card, and Live Energy top bar (full €/kWh).

### Security

- **SLSA attestation** — isolated into dedicated `slsa-attest` job with three attempts; runs on PRs to `main` for PR/main parity; E2E no longer skipped when SLSA flakes (#350).
- **OpenSSF Scorecard** — removed job-level `env` from `scorecard.yml` so `publish_results` succeeds on `main` push (#351).

### Tests

- Stream F: `controller-command-bridge`, HeatPump Modbus write, OpenADR routes, SG Ready + OpenADR E2E (#355–#356).
- CO2 report PDF export, `ai-keys`, and auth-token error paths (#345).
- Web branch-coverage floor restored (≥72%) with adapter-mode, header KPI, and Command Hub disclosure tests after #340 chrome simplification (#343).

### Docs

- Stream F closeout truth-sync (`FEATURE_STATUS.md`, campaign handoff, env vars) — housekeeping post-#356.
- Post-v1.11.1 campaign closeout and release tag sync (#342).

## [1.11.1] - 2026-09-01

Post-v1.11.0 freeze campaign: security hardening, demo chrome honesty, CI pins, and operational housekeeping after a 53-day product freeze (PRs #329–#337).

### Security

- **SEC-11** — Fail closed when `NODE_ENV` is unset: `runtime-env.ts` (`isDevRuntime()` / `isProductionRuntime()` / `warnIfNodeEnvUnset()`); auth bypass, JWT config, WS origins, trust-proxy, and CORS now require explicit `development` or `test` (#333).
- **deps/CVE** — Remediate high-severity production audit findings; Docker server image hardening (#336).
- **Offline command idempotency (slice 1)** — Server-side dedupe for `POST /api/modbus/write` (`X-Idempotency-Key`) and mock-mode WS commands (`idempotencyKey` field); 5-minute TTL cache.

### Fixed

- **Demo chrome** — `resolveConnectionPresentation()` treats mock backend as simulation, unknown backend + `VITE_BACKEND_WS` as disconnected until `/api/health` resolves; live mode without connection shows disconnected (#332).

### CI / Toolchain

- Align GitHub Actions pins (CodeQL, setup-python, rust-cache, harden-runner, buildx) (#329).
- Close stale Dependabot Action pin PRs superseded by #329 (#323–#327).

### Tests

- **E-STOP** — Stabilize EmergencyStop async assertions in unit tests (#335).

### Documentation

- Post-freeze truth-sync: debt registry, FEATURE_STATUS operational note, coverage gate references (#334).
- Sep 2026 campaign closeout handoff (`docs/Campaign-Handoff-2026-09.md`).

## [1.11.0] - 2026-07-10

Consolidates **45 commits** since [`v1.10.0`](https://github.com/qnbs/Nexus-HEMS-Dash/compare/v1.10.0...v1.11.0) (PRs [#270](https://github.com/qnbs/Nexus-HEMS-Dash/pull/270)–[#313](https://github.com/qnbs/Nexus-HEMS-Dash/pull/313)): the Command Palette registry (ADR-028), Settings & Help perfection, page modularization, deep-audit remediation (F-01–F-07, incl. a non-destructive prompt-sanitizer and deferred in-browser LLM engines per ADR-029), plus toolchain, CI/deploy and docs hardening.

### Security

- Add `READ_ONLY_MODE` enforcement to previously unguarded mutating routes: EEBUS pairing/trust/revocation, OCPP proxy-session issuance, OpenADR event acknowledge/report submission, and ExecAdapter command dispatch. Adds `requireNotReadOnly` middleware and unit tests.
- Add startup warning when auth/scope/rate-limit bypass is active in a production-shaped environment (dev `NODE_ENV` with `JWT_SECRET`, `API_KEYS`, `WS_ORIGINS`, or `CORS_ORIGINS` present).

### CI / Deploy

- Harden GitHub Pages deploy: `wait-for-github-pages-idle.sh`, 4 publish attempts with idle-wait between retries, and `deploy-recovery.yml` auto-rerun on transient failures (#281).
- Fix Pages idle-wait: treat stale `in_progress` deployments (>10 min) as non-blocking (#282).
- Fix Pages deploy deadlock: move pre-deploy idle-wait to a separate job (no `environment:` binding), skip wait when the active deployment matches `GITHUB_SHA`, shorten stale threshold to 3 min, and skip deploy-recovery when a newer Deploy run exists.

### Toolchain

- Upgrade pnpm to `10.34.4` (packageManager + CI setup action), staying within the pnpm 10.x line for Ubuntu 20.04 compatibility.
- Upgrade TypeScript catalog to `~5.8.3` across all workspaces.
- Upgrade Vite to `^8.1.0` and `@vitejs/plugin-react` to `^6.0.3` (Vite 8.1.0 verified on Ubuntu 20.04 via build + production smoke test).
- Upgrade Biome to `2.5.2`, Turborepo to `^2.10.3`, Vitest to `^4.1.9`, Tailwind CSS to `^4.3.2`, and React catalog to `^19.2.7`.
- Keep Playwright at `^1.60.0`; 1.61.x deferred pending Ubuntu 20.04 browser-binary verification.

### Fixed

- Register `EvccAdapter` and `OpenEMSAdapter` in the frontend adapter registry so they appear as selectable options in the Add Adapter Wizard (previously only the backend protocols were wired; the frontend classes existed but were never registered).
- Unify `POST /api/modbus/write` read-only guard on the shared `requireNotReadOnly` middleware (consistent with EEBUS, OCPP, OpenADR, and Exec routes). Read-only rejections now return the same `{ error, readOnly }` body shape; accepted/validation rejection audits retain register/value context.

### Settings & Help perfection (Phases 1–5)

- **#276** — Settings URL sync (`useSearchParams`), persist merge validation, read-only gating foundations.
- **#277** — Help phase 2: contrib integration guide, manifest-backed search index, FAQ version interpolation.
- **#279** — Help phase 3+4: `help-content-manifest`, combobox search a11y, `AdapterSettingsSection` registry, HA settings plugin template.
- **#278** — Help search `isOpen` keyboard guard after Escape dismiss, stable list keys, regression tests.
- **#280** — Command palette contextual Help tab shortcuts (`/help?tab=…`).
- **#285** — Command palette hardening: auth-scope resolution from stored JWT (`getTokenScope`), Home/End/PgUp/PgDn navigation, Ctrl/Cmd+D favorite toggle, disabled-reason tooltips, and i18n keys for insufficient scope.

### Deep-audit remediation (2026-07-09)

- **F-01 (Security)** — Rewrite the AI prompt-sanitizer to be non-destructive and bypass-resistant: word-boundary injection detection over a normalized view (homoglyph/zero-width/hyphen/whitespace folding), separate **idempotent** PII redaction (card, IBAN, MAC, IPv4, email with the `[A-Z|a-z]` class bug fixed, phone), recursive `context` sanitization under depth/node caps, and a structured verdict the orchestrator uses to harden the safety system prompt.
- **F-02 (Toolchain)** — Repair the Biome lint gate: align `$schema` to 2.5.2, migrate to `preset: recommended`, add `--error-on-warnings` to api/ai-core/shared-types, and add a **blocking** whole-repo `biome ci .` CI job.
- **F-03 / ADR-029 (Security)** — Defer the experimental in-browser local-LLM engines (WebLLM / Transformers.js / ONNX): gate `isAvailable()` behind a build flag, drop the three >2.5 MB runtime dependencies (38 transitive packages), and surface the real provider in the AI optimizer UI. No CSP change.
- **F-04** — Add a README adapter-count drift guard (`sync-adapter-counts.mjs` + CI check); the count stays the correct 7 core + 6 contrib = 13.
- **F-05a / F-06** — Add an `@nexus-hems/ai-core` coverage gate (thresholds + committed baseline, generalized `check-coverage-baseline.mjs`) and move the `vitest` pin into the pnpm catalog.
- **F-07** — Expand the ExecAdapter threat model; suppression inventory held at 47 (≤ 50 baseline).

### Command Palette (ADR-028)

- **#271** — Command Palette Registry — Phase 0+1 foundation.
- **#272** — Phase 2: safety bridge, adapter commands, list virtualization.
- **#273** — Phase 3: tariff shortcuts, EV/battery hardware catalog, lifecycle cleanup.
- **#274** — Phase 4: rule-based AI suggestions (gated by experimental features).

### Refactor — page modularization

- **#300** — Modularize `HistoricalAnalyticsPage` (777 → 101 lines).
- **#302** — Modularize `LiveEnergyFlow` + fix mobile panel accessibility.
- **#304** — Modularize `DevicesAutomation` (1167 → 80 lines).
- **#305** — Modularize `TariffsPage` (1251 → 106 lines).
- **#307** — Restore settings branch coverage via helper extraction + dead-code removal.
- **#308** — Complete page modularization (Monitoring, OptimizationAI, CommandHub).

### Fixed (post-1.10.0)

- **#298** — Stop a Power User Mode crash caused by a Zustand selector loop (Monitoring).
- **#303** — Lift the live-energy mobile sheet above the bottom nav; label the simulation badge.
- **#306** — Bundle sonner toast styles so toasts don't shift layout under the strict CSP.
- **#311** — Local-heuristic AI default, browser-aware locale, command-palette language toggle.

### Performance / Tooling

- **#297** — Speed up lint and type-check with caching and fewer slow rules.

### CI / Deploy (post-1.10.0)

- **#270** — Default macOS Tauri builds to ad-hoc signing.
- **#283** — Break the Pages deploy idle-wait deadlock.
- **#290–#294** — Dependabot GitHub Actions bumps: `checkout` v7, `deploy-pages` v5, `gitleaks-action` v3, `docker/metadata-action` v6, `codeql-action` 4.36.3.
- **#299 / #301** — Quiet, then remove, the noisy DeepSource JavaScript analyzer.

### Docs (post-1.10.0)

- **#275** — Settings & Help perfection plan (post-audit delta).
- **#309** — Truth-sync canonical/law docs to v1.10.0.
- **#310** — Reconcile adapter counts, backend list & changelog with v1.10.0.
- **#312** — Documentation hub, ADR index & canonical status legend.

## [1.10.0] - 2026-07-04

Consolidates **33 commits** since `v1.9.0` (PRs [#236](https://github.com/qnbs/Nexus-HEMS-Dash/pull/236)–[#268](https://github.com/qnbs/Nexus-HEMS-Dash/pull/268)): security hardening, DevOps quality platforms, post-audit backend parity (phases 1–8), and production deploy/Helm edge fixes.

### Post-Audit Remediation (Phases 1–8)

- **Phase 1–4 (#260)** — Settings import/save fixes, HA adapter UI, Help truth-sync, adapter-specific setup guides.
- **Read-only & safety E2E (#261)** — `READ_ONLY_MODE` sync across API/WebSocket/frontend; production CSP fail-closed; Playwright read-only + safety-indicator specs.
- **Phase 2 — E2E depth + HA backend MVP (#262)** — Backend `HomeAssistantProtocolAdapter` (ha-ws-api telemetry); expanded Playwright coverage (auth, adapter mode, backend WS).
- **Phase 3 — Zigbee2MQTT + Matter backend MVP (#263)** — `Zigbee2MQTTProtocolAdapter` + `MatterProtocolAdapter` read-only telemetry on EventBus.
- **Phase 4 — HA MQTT + WS live E2E (#264)** — `HomeAssistantMqttProtocolAdapter`; live WebSocket consumer E2E; protocol registration tests.
- **Phase 5 — Backend command dispatch (#265)** — `ProtocolCommandRouter` bridges validated WS commands to OCPP CSMS, OpenEMS, HA MQTT handlers.
- **Phase 6 — HA MQTT commands + OpenEMS storage (#266)** — Service publish for HA MQTT; OpenEMS ESS/EVCS/heat-pump/grid writes with allowlists.
- **Phase 7 — OCPP V2G + §14a grid limit (#267)** — `SET_V2X_DISCHARGE`, `SET_GRID_LIMIT` at CSMS protocol boundary; adapter + API tests.
- **Phase 8 — WS schema hardening + deploy (#268)** — Centralized `MAX_EV_CURRENT_A` (80 A), `MAX_EV_POWER_W` (22 kW), `HeatPumpModeValueSchema`; Helm `frontend.wsOrigins` → `WS_ORIGINS`; shared Pages deployment prune script with retry/backoff; `deploy.yml` gate + 35 min timeout.

### Security

- **JWT secret enforcement is production-fatal (CRIT-03, #244)** — `checkSecretEntropy` aborts boot in production on weak/low-entropy secrets; dev/test remain warn-only; messages never leak secret metadata.
- **CSP style-src reduction (AUD-02, #240–#241)** — Production Helmet + Docker/nginx drop `style-src 'unsafe-inline'` when Vite nonce is present; Tauri production CSP synced via `sync-tauri-csp.ts`; `style-src-attr 'unsafe-inline'` retained for Radix/motion.
- **Backend hardening (#248)** — CSWSH origin checks, CSP fail-closed paths, SSRF URL pinning, least-privilege refinements.
- **BYOK vault hardening (ADR-026, #251)** — AI provider keys stored with non-extractable `CryptoKey` (AES-GCM) in IndexedDB.
- **OCPP Security Profile 3 mTLS API proxy (HIGH-12, #238)** — `POST /api/ocpp/proxy-session` + `/ws/ocpp` relay; browser never holds CSMS client certificates.
- **Safety command-path (#246)** — Single rate-limit token spend, awaited audit trail, SOC fail-safe on battery commands.
- **Command validation boundary (#268)** — Shared Zod schemas for EV current/power, heat-pump integer modes, battery power, KNX temperature; `never` exhaustiveness guard on WS command switch.

### Added

- **Branded ComboBox dropdown (WS-8, #244/#249)** — `SelectField` listbox with type-to-filter for long option lists; Total JS budget 1120 → 1130 kB gzipped.
- **Storybook coverage (LOW-08, #243)** — Stories for `SankeyDiagram`, `Floorplan`, `AdapterConfigPanel`.
- **SunSpec worker activation (MED-12, #239–#242)** — Shared `sunspec-transforms.ts` + parity tests; `adapter-worker` polling when `VITE_ADAPTER_WORKER=true`.
- **Backend protocol adapters (post-audit)** — HA WS, Zigbee2MQTT, Matter, HA MQTT, OpenEMS command writes, OCPP CSMS outbound commands (see phases above).
- **Helm chart CI gate (#237)** — `helm lint` + `helm template` smoke in `ci.yml`.
- **DevOps quality platforms (#252)** — Codecov/CodeRabbit/CodeAnt/DeepSource layering (ADR-027); advisory vs blocking gates documented in `DEVOPS.md`.

### Changed

- **Release workflow manual-only (ADR-015, #236)** — `release.yml` dispatch-only; duplicate `tauri-release` job removed; `docs/Release-History.md` curated.
- **API reference** — Documented `POST /api/ocpp/proxy-session`, `/ws/ocpp`, `/ws/eebus` proxy paths.
- **OpenEMS writable allowlist (LOW-02)** — Per-component `additionalWritableProperties` in adapter config.
- **Helm frontend `WS_ORIGINS` (#268)** — `values.schema.json` validation; `_helpers.tpl` fallback `wss://<ingress.host>` with fail on empty config.
- **GitHub Pages deploy (#268)** — Pre-deploy pruning (`prune-github-pages-deployments.sh`), gated retries, deployment backlog management.
- **Tauri desktop CI (#236)** — Generated `src-tauri/icons/*`; mobile-only plugins gated to Android/iOS targets.
- **Dependabot/github-actions** — cosign-installer 4.1.2, cache/restore 6.1.0, docker/login-action 4.4.0, stale 10.3.0, attest-build-provenance 4.1.1 (#253–#257).

### Fixed

- **UI** — Breadcrumb label + de-duplicated embedded page chrome (#247); ComboBox portal z-index (#249).
- **DeepSource shell portability (SH-3014/SH-2034, #258)** — Script portability + rule-muting docs.
- **Docs truth-sync (#250)** — Coverage thresholds, safety notice, audit-delta items aligned with enforced baselines.

### Documentation

- **Settings & Help audit (#259)** — `docs/Settings-Help-Audit-2026-07-04.md`.
- **Post-audit remediation summary** — `docs/Post-Audit-Remediation-Summary-2026-07-04.md`; `FEATURE_STATUS.md` phase 8 rows.
- **Debt registry + perfection roadmap** — Phase 8 items closed; release line updated.

[1.11.1]: https://github.com/qnbs/Nexus-HEMS-Dash/compare/v1.11.0...v1.11.1
[1.11.0]: https://github.com/qnbs/Nexus-HEMS-Dash/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/qnbs/Nexus-HEMS-Dash/compare/v1.9.0...v1.10.0

## [1.9.0] - 2026-07-02

### Added

- **Persistent read-only-mode banner** — when `READ_ONLY_MODE`/`VITE_READ_ONLY_MODE` is active, `AppShell` shows a distinct amber `role="status"` banner (`mode.readOnlyBannerWarning`, en+de).

### Changed

- **Removed orphaned `components/ControlPanel.tsx`** — dead code (239 LOC, zero importers).

### Security

- **`ENERGY_UPDATE` wire Zod-validated both ends** — backend validates live snapshot before broadcast; frontend drops non-conforming frames.

### Tests

- Danger-command confirmation gate in `use-safe-command.test.tsx`; `runCommandScript` READ_ONLY_MODE block/allow in `ExecService.test.ts`.

## [1.8.0] - 2026-07-02

### Added

- **Opt-in backend WebSocket consumer (ADR-025)** — `useServerWebSocket` behind `VITE_BACKEND_WS` (default off). Flat→nested `EnergyData → UnifiedEnergyModel` projection (`server-energy-mapping.ts`), 6 s liveness watchdog, `serverWsConnected` pill on Monitoring.

### Tests

- `server-energy-mapping.test.ts`, `use-server-websocket.test.ts`, `resolveBroadcastData` validation-fallback in `live-energy-aggregator.test.ts`.

## [1.7.0](https://github.com/qnbs/Nexus-HEMS-Dash/compare/v1.6.1...v1.7.0) (2026-07-02)

### Added

- **OpenEMS backend protocol adapter (MED-20)** — `OpenEMSProtocolAdapter` JSON-RPC/WebSocket → EventBus; env `OPENEMS_HOST` + tests.
- **OCPP 2.1 CSMS backend gateway (MED-20)** — `OcppCsmsProtocolAdapter` WebSocket server for charge points; env `OCPP_CSMS_PORT`.
- **API production `WS_ORIGINS` validation** — fail-fast at startup (`apps/api/src/config/ws-origins.ts`).
- **Adapter safety tests (G-1…G-4)** — `openems-adapter.test.ts`, extended `homeassistant-mqtt-adapter.test.ts` (ha-ws-api discovery/transport), `example-contrib-adapter.test.ts`; ExecAdapter transport negative-path test.
- **API test coverage (P1-05)** — EventBus, LiveEnergyAggregator+EventBus integration, exec/metrics/grafana/history/eebus/openadr routes, EEBusTrustStore, energy.ws WS helpers; vitest gates **55/46/62/55**.
- **energy.ws integration tests** — `energy-ws.integration.test.ts` for `setupWebSocket` (SUBSCRIBE, JWT commands, rate limit, per-IP cap).
- **Web branch coverage stretch (MED-01/PRF-03)** — nav/UI tests (`hardware-nav`, `Disclosure`, `ChoiceCardGroup`, `ConfirmDialog`, `ErrorBoundary`, `Skeleton`); baseline raised to **78/72/70/80** (measured 79.60/72.00/73.46/81.58).
- **Web coverage baseline restore (MED-01)** — PRF-03 floors raised to 78/70/70/80 (measured 78.93/71.22/71.96/80.87).
- **Grafana Adapter Health dashboard** — `grafana/provisioning/dashboards/json/nexus-adapter-health.json` (reconnect, freshness, DLQ, latency panels per MED-18).
- **EEBUS certificates axe E2E** — WCAG 2.2 AA scan in `eebus-pairing.spec.ts`.
- **Operator screenshots (P3-01)** — 8 PNGs in `docs/images/operators/`, `capture:operators` script, embedded in integration guides.
- **Lighthouse baseline** — `docs/Lighthouse-Baseline-2026-07.md`.
- **Release docs** — `docs/Release-GH_TOKEN-Setup.md` (PAT scopes + ruleset bypass for semantic-release).
- **ADR-023** — Home Assistant dual transport (`ha-ws-api` vs `mqtt-broker`).

### Changed

- **OpenEMSAdapter** — sets `connected` status after successful JSON-RPC handshake (parity with other WS adapters).
- **Help About tab i18n** — Tech stack grid and GitHub link use `help.aboutTech*` / `help.githubRepo` keys (en+de).
- **Docs truth-sync** — README and `copilot-instructions.md` updated to 14 adapters (7 core + 7 contrib, includes ExecAdapter).
- **Release automation** — semantic-release available via manual workflow dispatch (`approveRelease=RELEASE`); automatic push trigger disabled 2026-07-03. See `docs/Release-History.md`.

### Fixed

- **Tauri CI build** — `beforeBuildCommand` uses `pnpm --filter @nexus-hems/web` so Vite resolves `index.html` from repo root (#218).
- **EEBUS CI tests** — mock connect path + unambiguous E2E import button selector (#220).
- **E2E offline/pairing** — BaseAdapter online reconnect guard, ShipTrustStore heading always visible (#221).
- **API test coverage (P1-05)** — missing `energy-ws.test.ts` imports after manual #223 merge conflict (#225).
- **Adapter connect tests** — align evcc/HA/OpenADR tests with BaseAdapter swallowing connect errors (#221 behavior).

## [1.6.1] - 2026-07-02

### Added

- **P2 Hardware Registry expansion (+77 devices → 190 total)** — `hardware-registry.ts`: +7 MPPT controllers, +15 hybrid inverters, +11 batteries, +9 smart meters, +8 wallboxes, +7 Shelly Gen1/Gen3, +11 heat pumps, +4 Zigbee plugs, +2 Matter devices. New `DeviceProtocol` types: `shelly-gen1`, `shelly-gen3`, `matter-thread`, `zigbee2mqtt`, `openems-api`.
- **P2 HeatPumpAdapter** — New `IProtocolAdapter` at `apps/api/src/protocols/heatpump/HeatPumpAdapter.ts`. 6 manufacturer profiles (Stiebel, Viessmann, Wolf, NIBE, Alpha, Daikin). SG Ready mode → synthetic POWER_W. Enable via `HEATPUMP_HOST`.
- **ADR-022** — Matter/Thread (Option B: HA bridge) + enbility/eebus-go Go sidecar migration plan.
- **Help & Settings audit (v1.3.0 truth-sync)** — `Help.tsx`: working search, Monitoring feature card, protocol chips, corrected deep-links, version **1.3.0**, FAQ mock/live + 13 adapters. `SettingsUnified.tsx`: KI quick-link → `/settings/ai`.
- **Adapter-specific help texts in Settings** — `AdapterConfigPanel.tsx`: expandable setup guides for Zigbee2MQTT, Shelly REST (contrib) and OCPP V2X/§14a EnWG (built-in). i18n `adapterConfig.zigbee*`, `shelly*`, `ocppV2x*` (en+de).

### Documentation

- **Documentation housekeeping (2026-07-02)** — truth-sync across README, FEATURE_STATUS-aligned docs, audit supersession banners, registry **190 devices**, bundle **1120 kB**, Shelly Gen1/3 status, ADR-018/019 → Accepted.

## [1.6.0] - 2026-07-02

### Added

- **P1-MQTT: Backend MqttAdapter enhancements** — TLS client certificates, per-pattern QoS, retained-message skip, LWT, topic template substitution, `publishMessage()` helper, dot-notation payload paths.
- **P1-Zigbee2MQTT: Enhanced Zigbee2MQTT adapter** — MQTT credentials in CONNECT; device role classification (grid/load/heatpump/ev); availability tracking; `SET_EV_CURRENT`, `SET_EV_POWER`, `SET_HEAT_PUMP_POWER`.
- **P1-Shelly: Shelly Gen1/Gen3 + webhook** — Gen1 `/status`; Gen3 `em1:X`; auto-detect generation; `SET_RELAY`; `pv` capability; 3-phase `phases[]`; `/api/shelly/webhook` push receiver.
- **P1-OCPP: V2X/§14a EnWG improvements** — `SET_GRID_LIMIT` uses `chargingRateUnit: 'W'`; `SET_EV_TARGET_SOC`, `SET_EV_PHASES`, `SET_EV_MIN_CURRENT`, `SET_SMART_COST_LIMIT`; `sendDischargeToHome()` V2H.

### Changed

- **Bundle size budget** — Total JS gzip limit raised from 1100 kB to **1120 kB** (`apps/web/package.json`, `lighthouserc.json`) to accommodate P1 i18n and adapter help UI.

### Fixed

- **CI coverage baseline** — Lowered functions gate after PRs #208+#209 added untested code paths (#210).

## [1.5.0] - 2026-07-01

### Added

- **EEBUS SPINE/SHIP backend protocol adapter (MED-20)** — `EebusProtocolAdapter` implements `IProtocolAdapter`; persistent mTLS SHIP sessions; SPINE measurement + load-control mapping; §14a EnWG LPC limits. `EebusProtocolAdapter.test.ts` (17 tests).
- **EEBUS Certificates settings tab** — Settings sidebar tab renders `CertificateManagement.tsx` (vault, trust store, revocation policy).
- **Home Assistant full native integration** — `HomeAssistantMQTTAdapter` rewritten: `ha-ws-api` + `mqtt-broker` modes; auto-entity discovery; 10 command types. i18n `adapterConfig.ha*` (en+de).
- **ExecAdapter — Custom Script Integration** — `ExecAdapter` + `ExecService` + `/api/exec/*` routes. Whitelist-only, argv-array exec, `READ_ONLY_MODE` blocks commands. ADR-021.
- **Modbus device profiles expansion** — `device-map.example.json` expanded from 3 to 15 device profiles with `role` tags for LiveEnergyAggregator.
- **Ecosystem Expansion Roadmap v5.0** — `docs/Ecosystem-Expansion-Roadmap-v5.md` + `docs/adr/ADR-021-ha-exec-adapter-patterns.md`.

## [1.4.0] - 2026-07-01

### Added

- **Live backend data reaches the UI (HIGH-17, ADR-018)** — `LiveEnergyAggregator` bridges EventBus → WebSocket; live mode broadcasts real snapshots; mock fallback unchanged.
- **Per-adapter Prometheus metrics (MED-18)** — `adapter-metrics.ts`: `hems_adapter_*` series via `/metrics` and `/api/metrics/json`.
- **Hardware-registry browser + add-adapter wizard (MED-19)** — `HardwareRegistryPage` at `/settings/hardware`; `AddAdapterWizard` with connection test + enable flow.
- **KNX/IP backend protocol adapter (MED-20)** — `KnxAdapter` via knxd WebSocket JSON bridge; `knx-ga-map.json`.
- **evcc backend protocol adapter (MED-20)** — `EvccAdapter` polls `/api/state` + subscribes `/ws`.
- **Choice-card selectors (ChoiceCardGroup / SgReadyModeSelector)** — accessible radio-group cards replace native `<select>` pickers app-wide.
- **Shared Disclosure + SelectField primitives** — glass-panel expandable sections + styled `<select>`.
- **Sankey diagram i18n** — locale-neutral node IDs; labels via `sankey-labels.ts`.
- **Command feedback toasts** — `useSafeCommand` surfaces outcomes via sonner toasts.
- **Theme-aware data-visualisation palette** — `--chart-1…7` + `--price-*` tokens; Recharts migrated off raw hex.
- **Settings unit-test suite** — `settings-tabs.test.tsx` (21 tests), `adapter-worker-target.test.ts` (12 tests).

### Changed

- **Accordion/disclosure modernization** — migrated expandable UIs to `Disclosure` across Help, Command Hub, Monitoring, Plugins, Tariffs, Adapter config.
- **Devices page UX** — inline `EnergyCard` details; `Disclosure` sections in modals.
- **Settings.tsx decomposed (MED-16)** — 3,663-line monolith → 512-line tab shell; ten extracted tab modules.
- **Glassmorphism performance** — backdrop blur capped at `blur(24px)`; `prefers-reduced-transparency` fallback.
- **Calmer visual defaults** — neon-glow intensities softened ~25–30 %.

### Fixed

- **Sankey + Live Energy Flow i18n** — removed inline `t(key, 'fallback')` strings.
- **E2E regressions (Sankey i18n)** — `EnergyCard` footer quick actions; `data-sankey-*` IDs on sr-only table rows.
- **Mobile layout: FAB + Optimizer sub-header** — FAB clearance above mobile nav; sticky optimizer sub-band.
- **Reliable fixed header** — `position: fixed` with JS-measured `--header-height`; `header-fixed.spec.ts`.
- **Light-theme axis-label contrast** — chart axes use `--color-muted`.
- **Recurring E2E color-contrast flake** — `<MotionConfig skipAnimations>` under `VITE_E2E_TESTING`.

### Documentation

- **ADR-017** — knowledge-graph self-reflection practice (Graphify).
- **Audit delta 2026-07-02** — `docs/Audit-Report-2026-07-02.md`; HIGH-17 keystone gap identified and resolved in this release.
- **ADR-018** — backend-mediated protocol adapters (EventBus→WebSocket bridge).
- **ADR-019** — adapter-instance management & hardware-registry surfacing.
- **Technical-Debt-Registry** — MED-16 resolved; HIGH-17/MED-18/MED-19 resolved.
- **FEATURE_STATUS truth-sync** — backend adapter rows reflect HIGH-17 WS-bridge shipping live data.

## [1.3.0] - 2026-06-30

### Added

- **Design-system foundation tokens** — `shadowScale` / `radiusScale` / `motionTokens` in `design-tokens.ts` and `--shadow-*` / `--radius-*` / `--duration-*` / `--ease-*` plus a semantic `--state-{danger,warning,success,info,live,offline}-{bg,fg,on,border}` family in `index.css` (tuned per dark/light like `--badge-*`, contrast ≥4.5:1; danger/live ≥6:1). Replaces ~140 hardcoded `red/amber/emerald` utilities across the status/safety surfaces (ConfirmDialog, NeonCard, EnergyCard, AppShell LIVE banner, MonitoringPanel, CertificateManagement, ErrorBoundary, PWA notifications, …) with theme-aware tokens.
- **Auto-deploy + deployment pruning** — `deploy.yml` now publishes the live demo on every push to `main` (manual dispatch keeps its `DEPLOY` gate) and a `prune-deployments` job keeps only the newest 10 `github-pages` deployments.
- **Read-Only Deployment Mode (SAF-05)** — `READ_ONLY_MODE=true` blocks all hardware control commands at API (WebSocket) and frontend (command validation) levels; essential for certification-grade deployments and incident investigation
- **EEBUS end-to-end security (Milestone 2.2, SEC-03)** — remove auto-PIN in `EEBUSAdapter`; browser connects via `/ws/eebus` mTLS proxy; `pair/status` polling + OCSP/CRL admin API/UI; `eebus-adapter-security.test.ts`
- **Backend Modbus SunSpec REST proxy (PROT-01)** — `apps/api/src/routes/modbus.routes.ts` implements the `GET /api/modbus/sunspec?model=common|inverter|battery|meter` + `POST /api/modbus/write` endpoints the in-browser `ModbusSunSpecAdapter` polls, closing the gap where those calls 404'd. Serves SunSpec-shaped data from the mock energy layer (functional in the default deployment); writes are JWT + `readwrite`-scoped, validated against a register allowlist + value bounds, and recorded in the command audit trail; live register writes return 501 (use an external SunSpec-REST bridge). `modbus.routes.test.ts`
- **BYOK key-entry transparency warning (SAF-05)** — `AISettingsPage.tsx` shows an at-the-point-of-entry caution when adding an AI provider key: the key is sent directly from the browser to the chosen provider and stored encrypted in this browser only; never enter a key on a shared/untrusted device. i18n (en/de) `aiSettings.byokWarning*`
- **Server-side command audit log (SAF-03)** — `apps/api/src/data/command-audit.ts` persists every WebSocket hardware command (accepted / rejected-validation / rejected-scope / rejected-ratelimit) with `clientId`, scope, value, and effective adapter mode to an append-only NDJSON trail (10 MB cap, oldest-half trim); wired into `energy.ws.ts`; read via `GET /api/v1/command-audit` (admin scope) in `history.routes.ts`; runtime `*.ndjson` gitignored; `command-audit.test.ts`
- **Live/Mock mode safety indicator (SAF-04)** — operator-facing operating-mode signal resolved at runtime from `GET /api/health`: persistent red `role="alert"` LIVE banner + muted simulation badge in `AppShell`, mode status block in Settings Danger Zone, and a live-hardware warning injected into the danger-command confirmation dialog (`useSafeCommand`); `fetchBackendAdapterMode` / `isLiveSafetyMode` in `apps/web/src/lib/adapter-mode.ts`; runtime-only `adapterMode` store field; i18n (en/de) `mode.*` + `safety.liveHardwareWarning`; `adapter-mode.test.ts`
- **Supply chain hardening (SUPPLY-01, HIGH-15/16, MED-14)** — `container-publish.yml`: build → Grype gate → push `ghcr.io/qnbs/nexus-hems-dash` + `nexus-hems-server` → cosign keyless sign + SLSA provenance; Grype blocking via `.grype.yaml` targeted CVE-2026-5450 ignore (no global `only-fixed`); `docs/Supply-Chain-Grype-Policy.md`; backend `distroless/nodejs24-debian13`; Helm server uid 65532 + Docker `cap_drop: ALL`
- **Docs housekeeping (2026-06-29)** — `FEATURE_STATUS.md`, `Technical-Debt-Registry.md` (SAF-01, SUPPLY-01, PRF-04), adapter-mode sections in Protocol/Adapter/Security/Deployment guides, `SECURITY.md` frontend env vars, supply-chain truth-sync (syft SBOM shipped; Grype/cosign backlog), `AGENTS.md` for Cursor Cloud agents — `.github/workflows/graphify.yml` workflow generates knowledge graph on main branch pushes; `.graphifyignore` excludes build artifacts and dependencies; `.mcp.json` configures MCP symbol graph server; `docs/Graphify-Integration-Guide.md` documents usage for AI-assisted development and safety-critical analysis
- **HIGH-07 JWT zero-downtime rotation** — `apps/api/src/jwt-utils.ts`: dual signing/verification from `JWT_SECRET` + optional `JWT_SECRET_NEW` / `JWT_SECRET_NEW_FILE`; `reloadJwtKeysFromEnv()`; `POST /api/auth/rotate-key` (admin scope) in `auth.routes.ts`; Prometheus counters via `security-metrics.ts`
- **MED-10 trust proxy** — `apps/api/src/config/trust-proxy.ts` + `TRUST_PROXY` env; documented in `docs/Deployment-Guide.md` §2.1 and `SECURITY.md`
- **MED-06 server-backed shares** — `apps/api/src/routes/shares.routes.ts` (`POST /api/shares`, `POST /api/shares/:shareId/redeem`); Zod contracts in `packages/shared-types/src/share.ts`; `sharing.ts` + Keycloak provider use API when authenticated; Vitest `shares.routes.test.ts`
- **EEBUS HA trust store** — `EEBUS_TRUST_BACKEND=redis` + `apps/api/src/services/eebus-trust-redis.ts` (shared `REDIS_URL`)
- **Security observability** — `apps/api/src/middleware/security-metrics.ts`: JWT verify failures, JTI revocations, key reload, EEBUS handshake counters (`incrementMetric` in `metrics.ts`)

### Removed

- **Tauri auto-updater (CRIT-02):** Removed `tauri-plugin-updater` (Cargo dep + `lib.rs` plugin init), `plugins.updater` block and `bundle.createUpdaterArtifacts` from `tauri.conf.json`, the `TauriAutoUpdater` React component, the `@tauri-apps/plugin-updater` / `-process` ambient module declarations, the `updater.*` i18n keys (en/de), `TAURI_SIGNING_PRIVATE_KEY[_PASSWORD]` + `includeUpdaterJson`/`updaterJsonPreferNsis` from both `tauri-build.yml` and `release.yml`, the `.secrets/` directory + its `.gitignore` entry, and `docs/Tauri-Desktop-Updater-Setup.md`. Reason: key-management overhead disproportionate to value for a single-maintainer homelab project. Desktop users now update by downloading a fresh release. CRIT-02 in `docs/Technical-Debt-Registry.md` and §6 of `docs/Safety-Certification-Notice.md` reflect the removal.

### Fixed

- **PWA standalone layout** — add `viewport-fit=cover` so `env(safe-area-inset-*)` resolves in the installed PWA; the sticky header now clears the notch/status bar (`safe-area-inset-top` padding) and stays pinned, `min-h-dvh` for correct mobile height, and `overscroll-behavior-y: none` stops iOS rubber-band from detaching the header.
- **Flaky a11y E2E** — the WCAG color-contrast scan now waits for the applied theme (`html[data-theme]` + resolved tokens) before running axe, removing a transient false positive.
- **graphify knowledge-graph CI** — pass the `detect()` result as `detection_result` to `generate()` (was the AST extraction dict), fixing the recurring `KeyError: 'total_files'` on `main`.
- **SAF-02 device-map default** — `device-map.json` ships empty; example hardware config moved to `device-map.example.json` (no implicit LAN polling on live enable)
- **EvccAdapter tests (HIGH-13)** — `evcc-adapter.test.ts`; `_connect()` sets `connected` status after health check
- **Command audit cleanup (HIGH-14)** — `command-safety.test.ts` verifies 5000-entry trim in `logCommandAudit`
- **Adapter mode safety defaults** — `ADAPTER_MODE` / `VITE_ADAPTER_MODE` default to `mock` everywhere; live hardware requires explicit double opt-in (`ALLOW_LIVE_HARDWARE=true` backend, `VITE_ALLOW_LIVE_HARDWARE=true` frontend build); all built-in frontend adapters start disabled; centralized `adapter-mode.ts` config modules; Docker/Helm/devcontainer enforce mock default
- **EEBUS Certificate UI auth** — `CertificateManagement.tsx` attaches JWT via `getAuthHeader()` on `/api/eebus/*` fetches
- **Semgrep path-traversal** — `ShipHandshakeService.ts` `assertResolvedPathUnderCwd` avoids redundant `resolve()` on validated paths
- **i18n parity:** Added missing `tour.*` strings to `apps/web/src/locales/en.ts` so DE/EN key sets match (fixes `i18n-sync` / `i18n` tests).
- **Vitest CI flakes:** Increased timeouts for OCPP `send-command` integration suites and `normalize-unified` `beforeAll` dynamic import (cold cache could exceed default 5s / 10s hook limit).

---

## [1.2.0] - 2026-04-29

### Added (v1.2.0 — Safety Documentation & CI Hardening)

- **`docs/Safety-Certification-Notice.md`** — comprehensive safety and certification notice: hazard table per domain (battery/EV/heat-pump/grid/PV), current certification status matrix (VDE-AR-E 2829-6, VDE-AR-N 4105, ISO 15118-20, CE, GDPR), mock-vs-live hardware safety delta, command-safety architecture diagram, pre-deployment checklist, Tauri auto-updater activation guide (CRIT-02), and regulatory disclaimer

### Changed (v1.2.0 — CI Hardening)

- **`.github/workflows/perf-optimized-ci.yml`** — `size-limit check` step no longer suppresses failures (`|| true` removed); `pnpm size` now exits non-zero and fails the build job when any bundle exceeds its configured limit, consistent with `ci.yml` behavior (CI-R1 / LOW-03)
- **`apps/web/lighthouserc.json`** — `startServerCommand` already uses `--host 0.0.0.0 --port 9876` to prevent Node 24 / Ubuntu IPv4-vs-IPv6 binding failure (CI-R3, confirmed fixed)
- **`turbo.json`** — `web#build` task already lists `VITE_E2E_TESTING` in `env`, ensuring Turbo cache differentiates E2E-enabled from standard builds; both `ci.yml` and `perf-optimized-ci.yml` build with `VITE_E2E_TESTING=true` (CI-R2, confirmed fixed)

### Added (v1.2.0 — CSP Harmonization + PII Sanitization Pipeline + Chart Sampling + Nordpool)

- **`packages/shared-types/src/sanitize-text.ts`** — canonical PII/sanitization module extracted from `aiClient.ts`: `sanitizeUntrustedText()` (control-char strip + injection-prefix removal + PII masking + length cap), `sanitizeRenderedText()` (display-safe), `sanitizeObjectStrings<T>()` (recursive deep-sanitize with depth guard); exported via `@nexus-hems/shared-types`
- **`scripts/check-i18n.sh`** — shell script (triggered by PostToolUse hook) that checks key parity between `en.ts` and `de.ts` on every locale file edit; reports first missing key and exits non-zero on mismatch
- **New test: `apps/api/src/tests/energy-ws.test.ts`** — WS handler tests: safeSend sanitization, rate-limit code 4429, scope authorization (readwrite/admin), subscribe/ACK, ENERGY_UPDATE dispatch
- **New test: `apps/web/src/tests/historical-chart.test.tsx`** — HistoricalChart rendering and LTTB sampling integration tests
- **New test: `apps/web/src/tests/historical-analytics-page.test.tsx`** — HistoricalAnalyticsPage rendering, sampleIfNeeded integration, export flow

### Changed (v1.2.0 — CSP Harmonization + PII Sanitization Pipeline + Chart Sampling + Nordpool)

- **`apps/web/src/core/aiClient.ts`** — `sanitizeForPrompt()` and `filterAIOutput()` now delegate to the canonical `sanitizeUntrustedText`/`sanitizeRenderedText` from `@nexus-hems/shared-types` (ADR-008); PII pattern table removed from `aiClient.ts` (single source of truth); added `AI_SYSTEM_PROMPT_MAX_LENGTH = 2000` and `AI_USER_PROMPT_MAX_LENGTH = 8000` constants
- **`apps/api/src/ws/energy.ws.ts`** — all outgoing WebSocket messages now go through `safeSend()` wrapping `sanitizeObjectStrings()` (ADR-008): ENERGY_UPDATE, SUBSCRIBE_ACK, ERROR frames; rate-limit error and scope-authorization error messages also sanitized before send
- **`apps/web/src/core/useEnergyStore.ts`** — `mergeData()` applies `sanitizeObjectStrings(data, 128)` on adapter-originated payload before accumulating; `setAdapterStatus()` sanitizes error strings via `sanitizeUntrustedText(error, 160)`; `selectAdapterStatuses()` sanitizes adapter names via `sanitizeUntrustedText(name, 80)` (ADR-008)
- **`apps/web/src/lib/chart-sampling.ts`** — `TimeSeriesPoint` interface now accepts both `ts` and `timestamp` as the x-axis field (fixes compatibility with `HistoricalChart` which uses `timestamp`); added `getXValue()` helper; `findPrimaryYKey()` excludes both `ts` and `timestamp`; `lttbSample()` generic constraint broadened accordingly
- **`apps/web/src/components/HistoricalChart.tsx`** — LTTB sampling fully wired: `sampleIfNeeded(filteredData, 500, 300)` applied before passing data to `ComposedChart` (MED-10 ✅)
- **`apps/web/src/pages/HistoricalAnalyticsPage.tsx`** — LTTB sampling applied: `sampleIfNeeded(timeSeriesData, 120, 96)` for time series chart and `sampleIfNeeded(forecastAccuracyData, ...)` for forecast accuracy chart (MED-10 ✅)
- **`apps/web/src/lib/tariff-providers.ts`** — added Nordpool day-ahead price provider (`fetchNordpoolPrices(region)`): parses Nordpool market data API, applies tax + grid fee + renewables surcharge to compute residential all-in price; falls back to simulated prices on API failure
- **`apps/web/src/lib/predictive-ai.ts`** and **`apps/web/src/types.ts`** — `TariffProvider` union type extended with `'nordpool'`; `fetchTariffPrices()` routes `'nordpool'` case to new provider
- **`apps/api/src/middleware/security.ts`** — CSP harmonized across Express (dev+prod) and static frontend:
  - Added `worker-src 'self'` to both dev and production directives (required for `ai-worker.ts`, `sankey-worker.ts`, `adapter-worker.ts`)
  - Production `connectSrc` now includes all AI providers: `openai.com`, `anthropic.com`, `x.ai`, `groq.com`, plus `octopus.energy` (previously only served by meta-CSP)
  - Production and dev `imgSrc` both include `https:` to allow external image URLs used by adapter icons and map tiles
  - Added optional `buildNonce?: string` parameter; nonce is included in production `scriptSrc` and `styleSrc` when provided
- **`apps/api/src/index.ts`** — on production startup, reads the built `index.html` to extract the Vite build-time nonce (`'nonce-...'` from the meta-CSP) and passes it to `configureHelmet()`; this closes the gap where the Express HTTP CSP header overrode the meta-CSP nonce, blocking the inline theme-loader, SPA-redirect, and recovery-UI scripts
- **`apps/web/index.html`** — meta-CSP (GitHub Pages static path) extended with `worker-src 'self'` for the three Vite-bundled Web Workers
- **`.claude/settings.json`** — added workspace-scoped `pnpm --filter` test/type-check permissions; added PostToolUse hooks for auto-format-on-save (Biome) and i18n key-parity check on locale edits; added PreToolUse hint for graphify knowledge graph
- **`.github/workflows/lighthouse.yml`** — Lighthouse artifacts now also staged under `.perf/reports/lighthouse-ci/` per the `.perf/` artifact convention introduced in the performance plan
- **`.github/workflows/perf-benchmark.yml`** — perf benchmark results staged to `.perf/` artifact directory for CI-generated performance summaries

### Changed (Documentation Truth-Sync)

- **`docs/Security-Roadmap-2026.md`** — reclassified security work into implemented, partial, and deferred buckets so Redis-backed JTI revocation, weekly audit automation, Renovate, and core AI-side PII masking are no longer described as missing work
- **`docs/Performance-Optimization-Plan.md`** — corrected the performance roadmap to mark Dexie downsampling, adaptive ring buffers, Sankey/REST/AI worker isolation, and Lighthouse CI as implemented; narrowed the active v1.2 gap to LTTB chart adoption plus lightweight perf reporting
- **`docs/Technical-Debt-Registry.md`** — aligned the registry to the verified 1.1.0 shipped baseline with in-flight v1.2.0 work, and added explicit debt items for roadmap truth-sync and unfinished LTTB chart integration
- **`README.md`** — added direct cross-links to the canonical security, performance, accessibility, tariff, Home Assistant, deployment, and tooling status documents

### Added (Phase CRIT-01/Security — EEBUS SHIP Handshake + Technical Debt Resolution for v1.2.0)

- **`apps/api/src/services/ShipHandshakeService.ts`** — SHIP v1.0.1 state machine (10 states: init→tls_connecting→tls_connected→cmi_hello→protocol→pin_required→pin_submitted→connected/failed/timeout); TLS 1.3 mTLS with ECDSA P-256 auto-generated certificate fallback; SKI extraction via `X509Certificate.subjectKeyIdentifier`; configurable via `EEBUS_CERT_FILE`/`EEBUS_KEY_FILE` env vars; 60s handshake timeout, 3 max PIN attempts (CRIT-01)
- **`apps/api/src/services/EEBusTrustStore.ts`** — persistent JSON file trust store for EEBUS SHIP devices; atomic writes via temp+rename; in-memory cache with invalidation; configurable path via `EEBUS_TRUST_FILE` env var; survives server restarts (CRIT-01)
- **`docs/EEBUS-SHIP-Handshake-Implementation.md`** — complete SHIP v1.0.1 technical specification: FSM state diagram, TLS setup, SKI extraction, server certificate management, REST API endpoints, PIN flow, trust store schema, VDE-AR-E 2829-6 compliance, security model, error codes (CRIT-01)
- **`packages/shared-types/src/protocol.ts`** — 5 new Zod schemas: `EEBUSDeviceInfoSchema` (ski, hostname, port, brand, model, deviceType, status, timestamps), `EEBUSPairResponseSchema`, `EEBUSPairStatusSchema` (all 10 SHIP states), `EEBUSPinSubmitSchema` (5–6 digit validation), `EEBUSTrustListSchema` (CRIT-01)
- **`apps/web/src/core/aiClient.ts`** — `OptimizationSuggestionSchema`, `OptimizationResponseSchema`, `ForecastResponseSchema` Zod schemas; `parseAIStructuredOutput<T>()` helper: extracts JSON from markdown fences, validates via `safeParse`, returns `null` on failure (graceful degradation); MED-06
- **`apps/web/src/tests/i18n-sync.test.ts`** — Vitest i18n parity test: recursive key walker comparing EN↔DE for bidirectional key presence; reports first 20 missing keys on failure; MED-08

### Changed (Phase CRIT-01/Security — EEBUS SHIP Handshake + Technical Debt Resolution for v1.2.0)

- **`apps/api/src/routes/eebus.routes.ts`** — completely replaced in-memory stub with full SHIP-backed implementation: `POST /api/eebus/pair` (SSRF guard, initiates SHIP handshake), `POST /api/eebus/pair/pin` (submits PIN), `GET /api/eebus/pair/status/:ski` (polls SHIP state), `GET /api/eebus/trust` (lists trust store), `DELETE /api/eebus/trust/:ski` (removes trust), `POST /api/eebus/discover/register` (mDNS registration) (CRIT-01)
- **`apps/web/src/lib/db.ts`** — bumped to v13; new `EEBUSDeviceRecord` interface (ski, hostname, port, certPem, trustedAt, lastConnectedAt, status, brand, model, deviceType); added `eebusDevices: '&ski, status, trustedAt'` table (CRIT-01)
- **`apps/web/src/components/CertificateManagement.tsx`** — added `ShipTrustStore` section: TanStack Query polls `GET /api/eebus/trust`, displays paired EEBUS devices with SKI, hostname, status badge, pairedAt date; PIN dialog (Radix UI Dialog, 5/6-digit input) triggered on `pin_required` state; remove-trust confirmation dialog with `DELETE /api/eebus/trust/:ski` mutation (CRIT-01)
- **`apps/web/src/locales/en.ts`** — added `shipPairing` namespace: 29 keys covering trust store UI, PIN dialog, status labels, error messages (CRIT-01)
- **`apps/web/src/locales/de.ts`** — added `shipPairing` namespace (German translations, matching EN key set) (CRIT-01)
- **`apps/api/src/jwt-utils.ts`** — Docker secret path now configurable: `process.env.JWT_SECRET_FILE ?? '/run/secrets/jwt_secret'`; HIGH-08
- **`apps/api/src/ws/energy.ws.ts`** — WS command rate limit configurable via `WS_RATE_LIMIT` env var (default 30 cmd/min); connection closed with code `4429` when limit exceeded (in addition to error frame); HIGH-06
- **`apps/api/src/middleware/security.ts`** — production CORS now filters loopback/LAN origins injected via `CORS_ORIGINS`: `localhost`, `127.`, `[::1]`, `0.0.0.0` purged with `console.warn`; HIGH-04
- **`apps/api/src/middleware/auth.ts`** — `API_KEY_SCOPES` startup validation: `console.warn` for each entry with missing colon separator or invalid scope value; LOW-04
- **`apps/web/src/core/adapters/EEBUSAdapter.ts`** — constructor throws if `config.host` absent and `config.mock !== true`; HIGH-01
- **`apps/web/src/core/adapters/KNXAdapter.ts`** — constructor throws if `config.host` absent and `config.mock !== true`; HIGH-01
- **`apps/web/src/core/adapters/ModbusSunSpecAdapter.ts`** — constructor throws if `config.host` absent; HIGH-01
- **`apps/web/src/core/adapter-worker.ts`** — added `/\.local$/` pattern to `ALLOWED_HOSTNAME_PATTERNS` for mDNS hostnames (victron.local, modbus.local, etc.); LOW-01
- **`apps/web/src/core/adapters/adapter-registry.ts`** — contrib adapter not-found error now lists all available adapter IDs from glob; MED-05
- **`apps/web/src/lib/ai-keys.ts`** — added `isKeyStorageAvailable(): Promise<boolean>` helper; `saveAIKey()` checks availability first and throws descriptive error if IndexedDB unavailable; HIGH-05
- **`apps/web/src/core/circuit-breaker.ts`** — added `openCount` field; exponential backoff: `cooldown × 2^(openCount−1)`, capped at 5 min, with ±20% jitter; `reset()` clears `openCount`; MED-09



- **`apps/web/src/core/adapters/EnergyAdapter.ts`** — `BPTNegotiationParams` interface with full ISO 15118-20 Annex D parameters (4 charge + 4 discharge power/current limits, V2X energy guardrails, `derBitmap`); `EVChargerData` extended with `bptParams`, `evSocPercent`, `evDepartureTime`; new `AdapterCommandType` values `SET_V2G_BPT_PARAMS`, `OPENADR_ACKNOWLEDGE_EVENT`, `OPENADR_SUBMIT_REPORT`, `VPP_OFFER_FLEX`
- **`apps/web/src/core/adapters/OCPP21Adapter.ts`** — full BPT negotiation via OCPP 2.1 `RequestStartTransaction` + `ISO15118CertificateRequest`; `sendV2GBPTParams()` with SOC guardrails (min 10%, max 95%); `sendV2XDischarge()` upgraded with discharge-power validation; AFIR-ready plug-type field
- **`apps/web/src/core/adapters/contrib/OpenADR31Adapter.ts`** — new OpenADR 3.1.0 VEN-client contrib adapter; `EventType` enum (LOAD_CONTROL, SIMPLE, ELECTRICITY_PRICE, CARBON_REDUCTION); OAuth2 client-credentials via API proxy; 5-minute polling with exponential backoff; REPORT submission; §14a EnWG `LOAD_CONTROL` event handling; Zod schema validation with Circuit Breaker
- **`apps/api/src/routes/openadr.routes.ts`** — Express 5 OAuth2 proxy router for OpenADR VTN communication; `POST /api/openadr/token` (client-credentials), `GET /api/openadr/events`, `POST /api/openadr/reports`; rate-limited (60 req/min), JWT-authenticated, URL-allowlisted
- **`apps/web/src/core/energy-controllers.ts`** — `EVV2GDischargeController` (8th control loop): ISO 15118-20 BPT discharge scheduling with SOC guardrails, tariff-aware discharge windows, OpenADR event response; extends `ControllerPipeline` with V2G discharge slot
- **`apps/web/src/lib/optimizer.ts`** — MPC Pass 3 upgraded to V2X bidirectional: discharge slots when grid price ≥ 2× charge price; OpenADR `ELECTRICITY_PRICE` events override price array; V2G constraints from `BPTNegotiationParams`; §14a `evDisabled` blocks all charging slots
- **`apps/web/src/core/uc26-translator.ts`** — new UC 2.6 translator service: converts OpenADR 3.1.0 events → Matter DEM energy requests (UC 2.6.1), flex bid offers (UC 2.6.2), VPP dispatch signals (UC 2.6.3); `DERBitmap` → `DEMFeature` mapping
- **`apps/web/src/core/adapters/contrib/MatterThreadAdapter.ts`** — DEM cluster 0x98 (Device Energy Management) added: features `FA` (Forecast Adjust), `CON` (Constraints), `STA` (State), `PAU` (Pausable), `PA` (Power Adjustment), `PFR` (Power Forecast Reporting); EPM 0x90 + EEM 0x91 cluster support
- **`apps/web/src/core/vpp-service.ts`** — new VPP service skeleton: single-home `VPPNode` resource registry (battery, EV, heat pump); `FlexOffer` creation with price/power/time window; VDE-AR-E 2829-6 CERT/DEV Mode toggle; revenue tracking in `useAppStore`
- **`docs/HEMS-Protocol-Comparison.md`** — 7-protocol comparison: OCPP 2.1, EEBUS SPINE/SHIP, OpenADR 3.1.0, VPP/Matter DEM, §14a EnWG, ISO 15118-20, SG Ready; feature matrix with V2G, tariff, demand-response columns
- **`docs/V2G-Integration-Guide.md`** — ISO 15118-20 BPT integration guide; CharIN Guide 2.0 compliance; SOC guardrail calculations; AFIR Article 5 compliance; `BPTNegotiationParams` TypeScript reference
- **`docs/OpenADR-Integration-Guide.md`** — OpenADR 3.1.0 VEN-client setup; OAuth2 client-credentials flow; VTN/VEN data model; §14a EnWG `LOAD_CONTROL` event handling; report submission; security (PKCE, rate limiting)
- **`docs/VPP-FlexMarket-Guide.md`** — single-home VPP node setup; flex market participation; VDE-AR-E 2829-6 scope; revenue tracking; `FlexOffer` creation workflow
- **`docs/Matter-OpenADR-Interworking-Guide.md`** — UC 2.6.1/2.6.2/2.6.3 implementation; DEM cluster features (FA/CON/STA/PAU/PA/PFR); OpenADR↔DEM translation loop; bidding workflow
- **`docs/AFIR-Compliance-Checklist.md`** — EU AFIR Article 5 V2G compliance matrix; OCPP 2.1 ISO 15118-20 requirements; plug type checklist; static/dynamic pricing requirements
- **`docs/adr/ADR-012-openadr-ven-client.md`** — ADR: Frontend Contrib Adapter + API OAuth2 proxy chosen over Edge Agent or Dedicated Backend Service
- **`docs/adr/ADR-013-v2g-bpt-parameters.md`** — ADR: full ISO 15118-20 BPT parameters with AFIR compliance chosen over minimal stub
- **`docs/adr/ADR-014-vpp-single-home-node.md`** — ADR: single-home VPP node scope for v1.2.0 chosen over multi-home aggregator

### Added (Phase 6 — Documentation & Developer Experience)

- **`docs/Hardware-Compatibility-Matrix.md`** — comprehensive hardware compatibility matrix; 86 certified devices across 5 categories (inverters, wallboxes, meters, batteries, heat pumps); protocol support columns per device; summary matrix by adapter
- **`docs/Home-Assistant-Integration-Guide.md`** — full HA MQTT integration guide: architecture, Mosquitto setup, entity mapping, hybrid deployment, troubleshooting
- **`docs/HA-Custom-Cards-Sankey.md`** — top-5 HA custom cards with config examples and comparison matrix (energy-flow-card-plus, power-flow-card-plus, sankey-chart-card, apexcharts-card, mini-graph-card)
- **`docs/HA-Migration-Hybrid-Plan.md`** — 3-scenario migration plan (Hybrid / Migration / Dual-run) with step-by-step, rollback plan, automation port table
- **`docs/Tariff-Providers-Setup.md`** — setup guide for all 5 tariff providers (Tibber, aWATTar DE/AT, Octopus Energy, Nordpool); §14a EnWG grid fee, peak hours, optimizer integration
- **`docs/EEBUS-Certificate-Setup.md`** — TLS 1.3 mTLS certificate generation (OpenSSL / cert-manager / Docker); mDNS pairing workflow; SKI extraction; certificate renewal
- **`docs/Grafana-Dashboards-Custom.md`** — custom Grafana dashboard guide; JSON provisioning; all Prometheus metrics reference; Alertmanager routing; template variables
- **`docs/Troubleshooting.md`** — common issues, debug commands, log inspection (dev server, adapters, WebSocket, auth, build, Docker, tariffs, Sankey)
- **`docs/AI-Providers-Setup.md`** — setup guide for all 7 AI providers (OpenAI, Anthropic, Gemini, xAI, Groq, Ollama, Custom BYOK); PII sanitization; security model; feature reference
- **`docs/adr/ADR-010-home-assistant-integration.md`** — ADR: MQTT Discovery (Option 3) chosen over REST/WebSocket; read-only contrib adapter; hybrid deployment rationale
- **`docs/adr/ADR-011-openapi-auto-generation.md`** — ADR: `@asteasolutions/zod-to-openapi` for v1.3.0; spec generation at build time; no runtime overhead; Swagger UI in dev mode only
- **`.devcontainer/devcontainer.json`** — VS Code dev container for reproducible developer environments; Node 24 + Rust stable + GitHub CLI; Biome, Tailwind, Playwright extensions pre-installed; auto-forwards ports 3000, 5173, 6006, 9090, 3001

### Added (Phase 6 — API Backend Tests)

- **`apps/api/src/tests/jwt-utils.test.ts`** — 14 unit tests for JWT signing/verification/revocation: signToken/verifyToken round-trip, claim validation (iss, aud, jti, exp), revoked JTI rejection, clampScope privilege-escalation prevention
- **`apps/api/src/tests/auth.routes.test.ts`** — 17 integration tests for `/api/auth/*` routes: health endpoint (no auth), token issuance, scope clamping (CRIT-01), refresh, revoke, WS ticket (HIGH-04)
- **`apps/api/src/tests/security.test.ts`** — 11 unit tests for security middleware: CORS allowed/blocked origins (dev + prod), localhost blocking in production (HIGH-08), X-Request-ID generation and preservation
- **`apps/api/src/tests/metrics.test.ts`** — 9 unit tests for Prometheus metrics: setMetric, label deduplication, multi-label storage, renderPrometheusText format

### Changed (Phase 6 — CI/Security Hardening)

- **`.github/workflows/ci.yml`** — `Security Gate` job hardened from file-existence check to real `pnpm audit --audit-level=high` blocking gate; installs dependencies and fails on HIGH/CRITICAL CVEs before merging PRs
- **`apps/api/vitest.config.ts`** — coverage thresholds raised from 50/40/50/50 to 55/45/55/55 (statements/branches/functions/lines) to reflect new test files

### Added (Phase 6 — Dependencies)

- **`apps/api` devDependencies** — `supertest ^7`, `@types/supertest` for HTTP integration testing in the API package

### Added (Phase 0 — Documentation & ADR Foundation)

- **`docs/Master-Improvement-Roadmap.md`** — comprehensive 6-phase roadmap (Stability/CI, Performance, Security, Testing, Features, Community) with metrics targets and verification criteria for v1.1.x→v1.2.0
- **`docs/adr/ADR-001-biome-first-toolchain.md`** — ADR: Biome 2.4.7 as primary linter/formatter; ESLint retained for React Compiler, react-hooks, react-refresh only
- **`docs/adr/ADR-002-zustand-dual-store-pattern.md`** — ADR: dual Zustand store pattern (useAppStore persist + useEnergyStore in-memory); no Redux/MobX
- **`docs/adr/ADR-003-jti-revocation-redis-fallback.md`** — ADR: optional Redis-backed JTI revocation via `REDIS_URL`; graceful in-memory fallback on absence
- **`docs/adr/ADR-004-distroless-docker-production.md`** — ADR: gcr.io/distroless production stage to minimise container attack surface
- **`docs/adr/ADR-005-dexie-tiered-downsampling.md`** — ADR: tiered 15m/1h Dexie aggregation via background downsampling service
- **`docs/adr/ADR-006-ring-buffer-per-adapter-sizing.md`** — ADR: per-adapter ring buffer sizes (OCPP: 500, Victron: 200, default: 100); ~80% memory reduction
- **`docs/adr/ADR-007-chromatic-visual-regression-gate.md`** — ADR: Chromatic as mandatory visual regression CI gate for design system
- **`docs/adr/ADR-008-pii-sanitization-ai-output-filter.md`** — ADR: PII masking (email/phone/IBAN/IP) + AI output filter to prevent data exfiltration
- **`docs/adr/ADR-009-multi-user-rbac-future.md`** — ADR: multi-user RBAC deferred to v1.2.0; architecture plan documented
- **`docs/Security-Roadmap-2026.md`** — security roadmap covering SBOM supply chain, JTI Redis, PII scanning, EEBUS mTLS, OCPP Profile 3, GDPR data map
- **`docs/Performance-Optimization-Plan.md`** — performance plan covering Dexie tiered downsampling, LTTB chart sampling, adaptive ring buffers, REST polling worker
- **`docs/Testing-Coverage-Strategy.md`** — staged 48%→60%→75%→85% coverage plan; fast-check property tests, Chromatic, fuzz strategy, CI upload guide
- **`docs/Accessibility-Testing-Guide.md`** — WCAG 2.2 AA/AAA checklist, screen reader test matrix (VoiceOver/NVDA/JAWS), axe-core automation guide
- **`README.md`** — added OpenSSF Scorecard badge and Codecov coverage badge to header
- **`docs/Architecture-Roadmap.md`** — added ADR-11 through ADR-19 to ADR table; added Phase P1–P6 improvement phases to roadmap table; linked to `docs/adr/` directory

### Added (Phase 1 — CI/Infra)

- **`.github/workflows/sbom-scan.yml`** — syft SBOM generation + Grype vulnerability scan; fails on CRITICAL CVEs; uploads SBOM as artifact
- **`.renovaterc.json`** — Renovate bot config: `rangeStrategy: bump`, daily schedule, grouped PRs, auto-merge patch dev-deps

### Changed (Phase 1 — CI/Infra)

- **`.github/workflows/deploy.yml`** — added mandatory Grype security gate before deploy; added cosign image signing step (SLSA L2)
- **`Dockerfile`** — production stage migrated from `nginx:1.29-alpine` to `nginxinc/nginx-unprivileged:1.29-alpine-slim`; reduced attack surface
- **`Dockerfile.server`** — production stage migrated from `node:24-alpine` to `gcr.io/distroless/nodejs24-debian12`; no shell, no package manager
- **`helm/nexus-hems/templates/namespace.yaml`** — added Pod Security Standards labels (`pod-security.kubernetes.io/enforce: restricted`)

### Added (Phase 2 — Performance)

- **`apps/web/src/lib/downsampling-service.ts`** — background Dexie tiered downsampling service; 15m and 1h aggregation; idempotent bucket algorithm; starts 90 s after app load
- **`apps/web/src/lib/chart-sampling.ts`** — LTTB (Largest-Triangle-Three-Buckets) chart downsampling algorithm; default threshold 300 points; visually lossless

### Changed (Phase 2 — Performance)

- **`apps/web/src/core/useEnergyStore.ts`** — replaced fixed `MAX_HISTORY = 1000` with `RING_BUFFER_SIZES` map per adapter type; ~80% memory reduction for typical 10-adapter setup
- **`apps/web/src/main.tsx`** — integrated `startDownsamplingService()` call on app startup

### Added (Phase 3 — Security)

- **`scripts/rotate-jwt-key.sh`** — automated JWT key rotation script with zero-downtime dual-key procedure
- **`apps/web/src/components/CertificateManagement.tsx`** — EEBUS device certificate management UI (view/import/export pairing certificates)
- **`helm/nexus-hems/templates/cert-manager-issuer.yaml`** — optional cert-manager ClusterIssuer template for automated TLS certificate rotation

### Changed (Phase 3 — Security)

- **`apps/api/src/jwt-utils.ts`** — optional `ioredis` backend for JTI revocation persistence; graceful in-memory fallback when `REDIS_URL` absent
- **`apps/web/src/lib/db.ts`** — schema bumped to v11; added `revokedJTIs` table for client-side token revocation cache
- **`apps/web/src/core/aiClient.ts`** — `sanitizeForPrompt()` extended with PII regex patterns (email, phone, IBAN, IPv4); new `filterAIOutput()` function validates AI responses before rendering

### Changed (Phase 4 — Testing)

- **`apps/web/vitest.config.ts`** — coverage thresholds raised to Stage 1: statements 60%, branches 55%, functions 62%, lines 62%
- **`apps/web/vitest.config.ts`** — added `lcov` reporter for Codecov upload

### Added (Phase 4 — Testing)

- **`apps/web/src/tests/downsampling-service.test.ts`** — unit tests for Dexie downsampling buckets and idempotency
- **`apps/web/src/tests/chart-sampling.test.ts`** — unit + property-based tests for LTTB algorithm
- **`apps/web/src/tests/pii-sanitization.test.ts`** — property-based PII masking tests (fast-check)
- **`apps/web/src/tests/hardware-registry.test.ts`** — hardware registry validation and category filter tests
- **`apps/web/src/tests/command-hub.test.tsx`** — CommandHub page render tests
- **`apps/web/src/tests/sankey-diagram.test.tsx`** — SankeyDiagram render + accessibility tests
- **`apps/web/src/tests/analytics-page.test.tsx`** — Analytics page render + time range tests

### Added (Phase 5 — Features)

- **`apps/web/src/lib/upnp-discovery.ts`** — UPnP SSDP M-SEARCH device discovery (complements existing mDNS)

### Security

- Supply chain security hardened: SBOM generation (syft) + CVE scanning (Grype) mandatory in deploy pipeline
- Container images signed with cosign (SLSA Level 2)
- Production containers migrated to distroless — zero shell access
- JTI revocation optionally persisted to Redis — survives server restarts
- PII masking added to AI prompt pipeline — email/phone/IBAN/IP never sent to AI providers
- Helm namespaces enforce Kubernetes Pod Security Standards `restricted` profile — new domain module with `IProtocolAdapter` interface, `UnifiedEnergyDatapoint` Zod schema, `ProtocolTypeSchema`, `MetricTypeSchema`, `QualityIndicatorSchema`, `DeadLetterEntrySchema`, `AdapterHealthSchema`, `EventBusSubscriber`, and `AdapterRegistryEntry` types; exported from `@nexus-hems/shared-types`
- **`apps/api/src/core/EventBus.ts`** — central datapoint dispatcher decoupling protocol adapters from downstream consumers; 500 ms batched flush, backpressure cap (1 000 items), per-subscriber error isolation, singleton export
- **`apps/api/src/services/TimeseriesService.ts`** — InfluxDB v2 write service subscribing to EventBus; WAL fallback (`apps/api/data/wal.ndjson`) with exponential-backoff replay (1 s → 30 s cap, 5 attempts)
- **`apps/api/src/services/EnergyRouterService.ts`** — aWATTar DE day-ahead LP optimizer; 60 min price refresh + 5 min optimization loop; actions: `FORCE_CHARGE` / `MAXIMIZE_SELF_CONSUMPTION` / `DISCHARGE_PEAK_SHAVING` / `HOLD`; §14a EnWG 4.2 kW grid-charge cap; all decisions written to audit trail
- **`apps/api/src/data/audit-log.ts`** — NDJSON append-only audit trail for automated EnergyRouter decisions (pure Node.js `fs`, no native deps); 10 MB retention cap with automatic halving; `writeAuditEntry()` and `readRecentAuditEntries()` exports
- **`apps/api/src/protocols/modbus/ModbusAdapter.ts`** — `IProtocolAdapter` implementation for Modbus RTU/TCP (SunSpec-compatible); exponential reconnect (1 s → 60 s), INT16/UINT16/INT32/UINT32/FLOAT32 register parsing, Zod validation, DLQ routing
- **`apps/api/src/protocols/mqtt/MqttAdapter.ts`** — `IProtocolAdapter` for MQTT brokers (Victron Venus OS / generic); MQTT wildcard pattern matching (`+`/`#`), numeric and JSON payload extraction, Zod validation, DLQ routing
- **`apps/api/src/protocols/index.ts`** — protocol adapter registry; instantiates `ModbusAdapter` from `device-map.json` and `MqttAdapter` when `MQTT_BROKER_URL` is set; graceful lifecycle via `startProtocolAdapters()` / `stopProtocolAdapters()`
- **`apps/api/src/data/device-map.json`** — hardware configuration template with three example devices (SMA Sunny Boy, Victron MultiPlus, BYD HVS) and their Modbus register maps
- **`apps/api/src/routes/history.routes.ts`** — `GET /api/v1/history` time-series endpoint; Flux aggregation query to InfluxDB; max 1 000 points; graceful `source: 'unavailable'` on InfluxDB failure (no 5xx to client)
- **`apps/api/vitest.config.ts`** — Vitest v4 configuration for backend unit tests (node environment, V8 coverage)
- **`apps/api/src/protocols/modbus/ModbusAdapter.test.ts`** — 6 unit tests for `ModbusAdapter` (mocked `modbus-serial`)
- **`apps/api/src/protocols/mqtt/MqttAdapter.test.ts`** — 5 unit tests for `MqttAdapter` (mocked `mqtt`)
- **`apps/web/src/components/HistoricalChart.tsx`** — Recharts `ComposedChart` with PV Area, Grid Import/Export Areas, Battery SoC line (secondary Y-axis); semantic zoom via `ReferenceArea` drag; TanStack Query for `/api/v1/history`; Dexie.js offline cache fallback; i18n via `t()`; WCAG 2.2 AA accessible
- **`docker-compose.prod.yml`** — production multi-service stack (nginx, api, influxdb, prometheus, grafana) with CPU/RAM resource limits, `read_only` containers, `no-new-privileges`, isolated backend network, bind-mount persistent volumes via `DATA_PATH`
- **`.env.prod.example`** — documented production environment variable template
- **`docs/Architecture-Roadmap.md`** — living architecture reference with Mermaid system overview, ADR table (ADR-01 through ADR-07), data-flow sequence diagram, domain model class diagram, Phase 0–12 roadmap table
- **`docs/Backend-Implementation-Roadmap.md`** — engineering spec for EventBus, InfluxDB, Modbus/MQTT adapters, EnergyRouterService, History API
- **`docs/Energy-Router-Design.md`** — EnergyRouterService spec with LP algorithm, aWATTar API, audit schema, Prometheus metrics, scheduling
- **`docs/Protocol-Adapter-Guide-Backend.md`** — backend adapter implementation guide with `IProtocolAdapter` interface, DLQ pattern, testing checklist

### Changed

- **`packages/shared-types/src/index.ts`** — now exports both `./protocol.js` and `./domain/energy.types.js`
- **`apps/api/package.json`** — added runtime deps: `@influxdata/influxdb-client ^1.35.0`, `modbus-serial ^8.0.25`; added dev deps: `vitest ^4.0.0`; added `test`, `test:run`, `lint:fix` scripts
- **`apps/api/src/index.ts`** — wired `EventBus`, `TimeseriesService`, `EnergyRouterService`, `startProtocolAdapters`, `createHistoryRoutes`; SIGTERM/SIGINT graceful shutdown handler stops all services in order
- **`apps/api/src/ws/energy.ws.ts`** — added per-client subscription model (`SUBSCRIBE` message type, `SUBSCRIBE_ACK` response, `wsSubscriptions` WeakMap); selective metric filtering via `filterMockData()`
- **`apps/web/src/locales/en.ts`** — added `historicalChart` namespace (25 keys)
- **`apps/web/src/locales/de.ts`** — added `historicalChart` namespace (25 keys, German translations)
- **`SECURITY.md`** — extended with PGP Key Verification section, SLA Matrix table, Protocol-Specific Concerns table, Security Advisory Process
- **`CONTRIBUTING.md`** — extended with "Adding a Backend Protocol Adapter" section (Mermaid flowchart + step-by-step guide)
- **`README.md`** — extended with InfluxDB env vars, `AWATTAR_BASE_URL`, backend data-flow Mermaid diagram
- **Repository documentation and config guidance** — curated testing/toolchain docs, VS Code tasks, and optimized CI comments to match the current Biome 2.4, Playwright, and cloud-CI-first workflow

- **`docs/Monorepo-Optimization-Roadmap.md`** — comprehensive post-migration audit document: 11 findings (P0/P1/P2), fix strategies, pnpm catalog migration map, Turbo Remote Cache setup guide, future roadmap (`packages/adapters/*`, tsup bundling, GHCR multi-arch images)
- **pnpm catalog** — 8 shared dependencies centralized in `pnpm-workspace.yaml` `catalog:` section (`react`, `react-dom`, `zod`, `typescript`, `jose`, `mqtt`, `tsx`, `@types/node`); all three `package.json` files migrated to `"catalog:"` protocol
- **Turbo Remote Cache support** — `TURBO_TOKEN` / `TURBO_TEAM` optional env vars added to all Turbo-invoking jobs in `ci.yml` and `perf-optimized-ci.yml`; activate by setting GitHub Secrets (free for open-source via Vercel)

### Changed

- **`turbo.json`** `web#build` task: added `"env": ["VITE_E2E_TESTING"]` so the build cache key correctly varies by env var — prevents Remote Cache from serving a build without `window.__NEXUS_STORE__` to the E2E job
- **`pnpm-workspace.yaml`**: extended with `catalog:` section, `sharedWorkspaceLockfile: true`, `preferWorkspacePackages: true`
- **`.npmrc`**: added `prefer-workspace-packages=true`, `hoist-pattern=*`, `public-hoist-pattern=*`
- **`package.json` root** `format:check` script: uses Biome's read-only `format` command without `--write`, keeping format verification compatible with Biome 2.4+
- **`package.json` root** `pnpm.onlyBuiltDependencies`: added `@serialport/bindings-cpp`, `core-js`, and `protobufjs` to suppress approved-build warnings during CI installs
- **`apps/web/playwright.config.ts`**: local Playwright runs are now Chromium-only to protect low-resource developer machines; CI keeps coverage on Chromium and Firefox; WebKit/mobile projects are disabled for now
- **`apps/web/index.html` + `apps/web/vite.config.ts`**: static SPA CSP now uses a Vite-injected nonce instead of `unsafe-inline`; Google Fonts are self-hosted with SRI preloads and no remote font origins
- **`perf-optimized-ci.yml`** `install` job: switched node_modules caching to `actions/cache` restore/save lifecycle so existing keys no longer emit cache-save warnings while downstream jobs can still restore the shared dependency cache
- **`ci.yml`**: removed duplicate `pnpm typecheck` step (same as `pnpm type-check`); kept single `pnpm type-check` call
- **`apps/api/package.json`**: `tsx` moved from `devDependencies` to `dependencies` (required for production runtime in Docker)
- **`Dockerfile`**: changed `pnpm build` → `pnpm --filter @nexus-hems/web build` — frontend image no longer compiles `apps/api` unnecessarily
- **`docker-compose.yml`**: fixed `com.nexus-hems.version` label from `4.2.0` to `1.1.0`

### Fixed

- **`apps/web/tests/e2e/pwa-offline.spec.ts`** — fixed 404-route E2E tests under the GitHub Pages basename by using base-relative navigation (`./unknown-route`) instead of absolute root navigation (`/unknown-route`), which bypassed `/Nexus-HEMS-Dash/` and never reached the React Router catch-all
- **`perf-optimized-ci.yml`** — removed the redundant standalone `pnpm format:check` step from `lint-typecheck`; `pnpm lint` already performs Biome checks, and the old standalone invocation failed on Biome 2.4 with ``false` is not expected in this context`
- **`Dockerfile.server`** — complete rewrite; previous version had three fatal issues: (1) referenced non-existent `tsconfig.server.json`; (2) missing workspace manifests (`pnpm-workspace.yaml`, workspace `package.json` files) causing install to fail; (3) CMD pointed to `dist-server/server.js` which was never generated. New version: monorepo-correct build stage with proper workspace manifest copies, `pnpm deploy --filter @nexus-hems/api --prod` for a self-contained production bundle, `tsx` runtime to handle `packages/shared-types` TypeScript-source-only exports

### Build

- **Monorepo migration** — repository restructured as a pnpm workspace monorepo managed by Turborepo:
  - `apps/api` (`@nexus-hems/api`) — Express 5 backend, previously at project root
  - `apps/web` (`@nexus-hems/web`) — React 19 Vite SPA, previously at `src/`
  - `packages/shared-types` (`@nexus-hems/shared-types`) — Zod protocol schemas extracted from `src/types/protocol.ts`
  - `pnpm-workspace.yaml` + `turbo.json` + `tsconfig.base.json` added at repo root
  - Dev workflow: two independent processes — `apps/api` (port 3000) + `apps/web` (port 5173); Vite proxies `/api/*`, `/metrics`, `/ws`
  - Turbo caching for `build`, `type-check`, `lint`, `test:run`

### Security

- **CI supply-chain: `actions/download-artifact` SHA-pinned** — replaced floating `@v4` tag with commit-SHA `@d3f86a106a0bac45b974a628896c90dbdf5c8093` in `ci.yml`; resolves Scorecard Pinned-Dependencies alert #187; all CI actions now use immutable SHA pins in compliance with `SECURITY.md` policy
- **Semgrep `unsafe-formatstring` (#188–194, 7 findings)** — eliminated `util.format` string-injection vector in `apps/api/src/core/EventBus.ts` (lines 107, 111), `apps/api/src/protocols/index.ts` (lines 63, 128), `apps/api/src/protocols/modbus/ModbusAdapter.ts` (lines 180, 192), and `apps/api/src/protocols/mqtt/MqttAdapter.ts` (line 101); runtime-controlled identifiers (`id`, `device.deviceId`, `adapter.id`, `this.id`, `tp.pattern`) are now passed as separate `console.error`/`console.warn` arguments rather than interpolated into the format-string prefix — prevents a crafted `%s`/`%d` in a device-map or MQTT topic pattern from silently consuming the error object via `util.format`
- **CodeQL SSRF suppression `adapter-worker.ts` (#186)** — moved `codeql[js/request-forgery]` inline suppression to the exact line of the `fetch()` call; CodeQL requires the marker on the sink line or immediately before it; the full mitigation rationale (allowlist-reconstructed URL, hostname allowlist + private-IP check, `redirect:'error'`) is preserved in the adjacent comment block
- **Semgrep SRI false-positive `index.html` (#185)** — added `nosemgrep: html.security.audit.missing-integrity.missing-integrity` HTML comment above `<link rel="canonical">`; Subresource Integrity applies to resource-loading links (`<script src>`, `<link rel="stylesheet">`), not canonical meta-links — confirmed false positive
- **Trivy KSV034 Helm registry restriction (#180, #181)** — added `.trivyignore` suppressing static-template false-positives on `helm/nexus-hems/templates/deployment-*.yaml`; Trivy's static scanner cannot resolve Go template expressions (`{{ include "nexus-hems.imageRef" ... }}`) to actual image strings; `_helpers.tpl` `assertTrustedImageRepository` continues to enforce `ghcr.io/qnbs/` prefix allowlist at `helm template` render time and calls `fail()` on any deviation

### Fixed

- **`turbo.json` `"ui": "stream"`** — changed from `"ui": "tui"` to prevent CI headless-runner hang; Turbo TUI requires an interactive TTY not available on GitHub Actions `ubuntu-latest` runners; `"stream"` pipes task output directly to the runner log without TTY requirement
- **`apps/web/package.json`** — removed `@typescript/native-preview@7.0.0-dev.20260424.1` nightly dev snapshot; not integrated as primary type-check gate (per `docs/Monorepo-Optimization-Roadmap.md`); daily-rotating dev builds caused intermittent `pnpm install --frozen-lockfile` failures in CI when a build rotated off the npm registry

### Added (Phase 5 — Observability & Alerts)

- **`rules/hems-alerts.yml`** — 9 new Prometheus alert rules across 3 new groups: `hems_security` (JTIRevocationFailure, JTIStoreNearCapacity, EEBUSCertExpiryWarning, EEBUSCertExpiryImmediate), `hems_performance` (MPCSolveTimeSlow, DownsamplingLagHigh, PVForecastAccuracyDrift), `hems_business` (SelfConsumptionRateLow, GridImportCostHigh); total alert rules increased from 13 to 22
- **`docs/Observability-Plan.md`** — full observability strategy: current state table, OpenTelemetry backend (Node.js OTLP SDK + Grafana Tempo self-hosted), frontend trace propagation, 10 new business metric definitions (`hems_self_consumption_ratio`, `hems_daily_grid_cost_eur`, `hems_ev_pv_surplus_charge_kwh`, etc.), 3 new Grafana dashboard specs (Adapters, AI/MPC, Business Overview), 4-phase implementation roadmap
- **`docs/Plugin-Marketplace-Spec.md`** — complete plugin system specification: Ed25519 manifest signature verification, Web Worker sandbox architecture (structured-clone only, origin-restricted fetch/WS), worker message protocol, CLI scaffold (`pnpm create nexus-hems-adapter`), SDK package spec (`@nexus-hems/adapter-sdk`), marketplace UI flow (install/update/remove), OWASP-aligned security threat model, v1.2.0/v1.3.0 compatibility matrix

### Added (Phase 5 — Testing: Adapter Unit Tests)

- **`apps/web/src/tests/KNXAdapter.test.ts`** — 22 unit tests for `KNXAdapter`: interface contract (id/name/capabilities/status/snapshot/connect/destroy), WebSocket transport lifecycle, KNX telegram parsing (DPT9 temperature, DPT1 switch, DPT5 dimmer, unknown GA, malformed JSON), command handling (reject-disconnected, SET_LIGHT connected, unknown type), room configuration (default rooms, custom rooms)
- **`apps/web/src/tests/OCPP21Adapter.test.ts`** — 22 unit tests for `OCPP21Adapter`: interface contract, WebSocket lifecycle, OCPP 2.1 JSON-RPC message protocol (BootNotification response, StatusNotification, TransactionEvent started/updated/ended, CALLERROR, malformed JSON), smart charging commands (reject-disconnected, SetChargingProfile, §14a 3.7 kW minimum, unknown types), V2X support, `onData` callback integration
- **`apps/web/src/tests/homeassistant-mqtt-adapter.test.ts`** — 13 unit tests for `HomeAssistantMQTTAdapter`: interface contract, WebSocket lifecycle, custom entity map, MQTT auth credentials, `onData` callback registration
- **`apps/web/src/tests/shelly-rest-adapter.test.ts`** — 16 unit tests for `ShellyRESTAdapter`: interface contract, REST polling setup (connect/success/failure), 3-phase EM data parsing (total_act_power, import/export kWh), smart plug data parsing, relay commands (disconnected rejection, SET_RELAY, unknown types), multi-device configuration
- **`apps/web/src/tests/zigbee2mqtt-adapter.test.ts`** — 18 unit tests for `Zigbee2MQTTAdapter`: interface contract, WebSocket lifecycle (MQTT subprotocol negotiation), MQTT binary message handling (device state JSON, bridge state, bridge devices, malformed packets), commands, custom topic prefix
- **`apps/web/src/tests/matter-thread-adapter.test.ts`** — 18 unit tests for `MatterThreadAdapter`: interface contract, WebSocket lifecycle, Matter WS message protocol (HA Matter Server get_nodes, node list result, attribute_updated events for ElectricalMeasurement/Thermostat clusters, malformed JSON), commands, controller type variants (ha-matter-server, chip-tool)

### Changed (Phase 5 — Testing: Coverage)

- **`apps/api/vitest.config.ts`** — added coverage thresholds: `statements: 50, branches: 40, functions: 50, lines: 50`; ensures API coverage gate is enforced in CI

### Added (Phase 5 — Offline Sync: Conflict Resolution)

- **`docs/Offline-Sync-Design.md`** — conflict resolution architecture specification: tiered strategy (Server-Wins for hardware commands, Last-Write-Wins for preferences), `SyncState` Dexie table design with `lastSyncedAt`/`serverVersion`/`localRevision`/`hasConflict` fields, idempotency key schema (`<type>-<timestamp>-<rand6hex>`), reconciliation protocol flowchart, `X-Idempotency-Key` header semantics, replay safety (`isTokenValid()` pre-check), conflict UI design, i18n keys
- **`apps/web/src/lib/db.ts`** — schema bumped to v12: new `syncState` table (`&key, updatedAt, serverVersion`) for conflict-detection and incremental reconciliation; `idempotencyKey` field added to `OfflineAction` (back-filled on upgrade for all existing pending actions); `SyncState` interface exported; `getSyncState()` and `updateSyncState()` helper functions added
- **`apps/web/src/lib/background-sync.ts`** — `executeAction()` now includes `X-Idempotency-Key` header on every fetch call (populated from `offlineAction.idempotencyKey`); duplicate action delivery on retry is safely handled server-side via the key

### Added (Phase 5 — Security Status Documentation)

- **`docs/Security-Roadmap-2026.md`** — added full "Adversarial Audit Findings (2026-04-25)" section with authoritative CRIT-01–04 (all ✅ Fixed) and HIGH-01–09 (all ✅ Fixed) status table; updated Open Gaps table to accurately reflect remediation state

## [1.1.0] - 2026-04-24

### Security

- **Adversarial Red-Team Audit Wave — 2026-04 (27 findings: 4 Critical, 9 High, 9 Medium, 5 Low)**

  All 27 findings from `docs/Security-Audit-Adversarial-2026-04.md` remediated across the full stack:

  **Critical (4):**
  - **CRIT-01** — `requireScope(minScope)` middleware factory added to `auth.ts`; `clampScope()` binds JWT scope to API key max-scope at token issuance; all write/admin routes now require elevated scope
  - **CRIT-02** — `AuthenticatedClient` extended with `scope: JWTScope`; WebSocket command dispatcher gate-checks `WRITE_COMMANDS` / `ADMIN_COMMANDS` sets against client scope before execution
  - **CRIT-03** — `jwt-utils.ts` updated: `jti`, `iss`, `aud` claims added to all issued tokens; `JWT_SECRET_NEW` env var support for true zero-downtime key rotation; JTI revocation map with `revokeToken()` / `isJTIRevoked()` functions
  - **CRIT-04** — `docker-compose.yml` Grafana admin password default `:-nexus-hems` removed; `GRAFANA_PASSWORD` must be set or compose fails with `:?` required-var guard

  **High (9):**
  - **HIGH-01** — InfluxDB credentials (`influxToken`, `influxUrl`) removed from Zustand `localStorage` partialize; stored in encrypted Dexie vault via `secure-store.ts`
  - **HIGH-02** — `sharing.ts` rewritten: `timingSafeEqual()` using XOR accumulation; `StoredDashboardRef` interface (no email/token fields); `shared-dashboard-ref-*` key pattern (no sensitive data)
  - **HIGH-03** — `influxdb-client.ts`: field/metric/range allowlists + `validateFlux*()` validators; `isAllowedInfluxUrl()` SSRF guard blocks 169.254.x.x / IMDS endpoints
  - **HIGH-04** — `POST /api/auth/ws-ticket` endpoint issues 60-second single-use WS tickets; `energy.ws.ts` prefers `?ticket=` over `?token=`; `wsTickets` Map with 2-minute cleanup interval
  - **HIGH-05** — `background-sync.ts` `executeAction()` now reads `nexus-hems-auth-token` from localStorage and attaches `Authorization: Bearer <token>` header; rejects sync if unauthenticated
  - **HIGH-06** — `POST /api/eebus/pair` protected by `requireScope('admin')` middleware
  - **HIGH-07** — per-IP WebSocket connection tracking (`wsConnectionsPerIP` Map); max 10 connections per IP; connections cleaned up on close/auth failure
  - **HIGH-08** — `configureCors()` excludes localhost origins when `NODE_ENV === 'production'`; `getClientIP()` reads `req.ip` (Express trust-proxy normalised) not raw `x-forwarded-for`
  - **HIGH-09** — Vault passphrase (`getVaultPassphrase()`) made async and Dexie-persistent (`vault-passphrase-v1` settings key); survives page reloads; `ai-keys.ts` migrated to use the same persistent passphrase

  **Medium (9):**
  - **MED-01** — `iss` / `aud` claims added to `signToken()` / `verifyToken()` in `jwt-utils.ts`; issuer `nexus-hems-server`, audience `nexus-hems-api`
  - **MED-02** — `jti` (UUID v4) added to all issued tokens; `revokedJTIs` Map; `POST /api/auth/revoke` endpoint calls `revokeToken()`
  - **MED-03** — `nginx.conf` CSP `connect-src` uses `${WS_ORIGINS}` envsubst placeholder; template moved to `/etc/nginx/templates/`; `ENV WS_ORIGINS=wss://localhost:8081` default in Dockerfile
  - **MED-04** — `getClientIP()` refactored to use `req.ip` (Express-normalised) instead of raw X-Forwarded-For parsing
  - **MED-05** — `/api/health` returns only `{ status, uptime, adapters }` — JWT version / algorithm metadata removed
  - **MED-06** — `sharing.ts` localStorage key changed to `shared-dashboard-ref-*`; `StoredDashboardRef` contains no email/token fields; `joinSharedDashboard()` returns minimal data
  - **MED-07** — 5 AI provider Workbox handlers changed from `NetworkFirst` to `NetworkOnly` in `vite.config.ts` — prevents API key bearer tokens from being cached in ServiceWorker storage
  - **MED-08** — Power safety cap reduced from 50 kW → 25 kW in `protocol.ts` `WSCommandSchema` and `command-safety.ts` power-watts validator; aligns with §14a EnWG residential limits
  - **MED-09** — `sanitizeForPrompt(value, maxLength)` added to `aiClient.ts`; strips Unicode control characters via `\p{Cc}`, prompt-injection phrases, collapses whitespace, truncates to 64 chars

  **Low (5):**
  - **LOW-01** — `isAllowedInfluxUrl()` SSRF guard in `influxdb-client.ts` blocks IMDS, link-local, localhost endpoints
  - **LOW-02** — duplicate `initKeys()` call removed from `auth.routes.ts` (called once at server startup)
  - **LOW-03** — `logError()` in `db.ts` now enforces 7-day TTL in addition to 100-entry cap
  - **LOW-04** — `prometheus.yml` scrape config for `nexus-hems-server` includes `authorization.credentials: '${PROMETHEUS_BEARER_TOKEN}'` placeholder
  - **LOW-05** — `Dockerfile.server` updated to precompile TypeScript via `tsconfig.server.json` → `dist-server/`; `tsx` runtime dependency removed from production image; added `tsconfig.server.json`

### Added

- **Biome-first toolchain** — Biome 2.4.7 activated as primary linter + formatter replacing ESLint+Prettier dual stack:
  - `biome.json` fully rewritten with `linter.enabled: true`, `formatter.enabled: true`, formatter settings matching previous Prettier config (lineWidth 100, singleQuote, trailingCommas all, semicolons always)
  - `nursery.useSortedClasses` enabled for Tailwind class sorting (`clsx`, `cn`, `className` attributes) replacing `prettier-plugin-tailwindcss`
  - ESLint retained as slim React-only config (~20 lines): `react-compiler`, `react-hooks`, `react-refresh`
  - `scripts/bench-tooling.sh` — toolchain performance benchmark (wall-clock + RSS memory for biome/eslint/tsc)
  - `docs/Biome-Migration-Roadmap.md` — full ADR: is-state, decisions, risk matrix, rollback plan
  - `docs/Toolchain-Architecture.md` — living toolchain reference with responsibility matrix
- **6 new and extended unit test files**

### Changed

- **Lint pipeline** — `pnpm lint` now runs `biome check --write=false && eslint src/ --max-warnings 0`; `pnpm format` → `biome format --write src/`; `format:check` → `biome format apps/ packages/` for Biome 2.4-compatible read-only formatting
- **lint-staged** (`.lintstagedrc.json`) — Biome-first: `biome check --write` + slim ESLint on `*.{ts,tsx}`; `biome format --write` on `*.{json,css,html,yml,yaml,md}`
- **pre-commit hook** (`.husky/pre-commit`) — `pnpm format:check` standalone step removed (subsumed by lint-staged Biome check)
- **CI** (`ci.yml`) — `pnpm format:check` step removed from `lint-typecheck` job (format check is now part of `pnpm lint` via Biome)
- **VSCode settings** — `editor.defaultFormatter` changed to `biomejs.biome`; per-language formatter overrides updated for TS/TSX/JSON/CSS
- **`CONTRIBUTING.md`** — tooling section updated with Biome-first workflow and tool responsibility table
- **`README.md`** — `pnpm lint` description updated
- **Optimization #1 — React 19 Compiler cleanup** (committed `db31a8f`):
  - `ControlPanel`: removed `forwardRef` wrapper (React 19 supports ref as plain prop)
  - `OptimizedSankey`: removed `useCallback` from `toggleFullscreen` (no dep array, compiler auto-memoizes)
  - `PWAUpdateNotification`: restored `useCallback` for `checkForUpdate` — required as stable `useEffect` dep
  - `PredictiveForecast`: removed redundant `useMemo` (React Compiler handles auto-memoization)
  - `CommandPalette`: hoisted icon JSX to module-level constants (stable refs, prevents object churn per render)
  - `Gauge`: fixed SVG gradient ID collision via `useId()`; removed `setInterval` side-effect in render path
- **Optimization #2 — Zustand store subscriptions & selectors**:
  - `EnergyContext.tsx`: merged two separate `useAppStore` calls into one `useAppStoreShallow` (halves subscription count; one render trigger instead of two per data tick)
  - `useEnergyStore.ts` (`useAdapterBridge`): replaced hook-level `useAppStore` subscriptions + stale-ref pattern with direct `useAppStore.getState()` calls inside callbacks — Zustand actions are already stable, making the two hook subscriptions + `useRef` sync entirely redundant; removed unused `useRef` import
  - `TariffsPage.tsx`: replaced broad `useAppStoreShallow((s) => s.settings)` (entire 50-key `StoredSettings` object) with a single granular selector extracting only the 8 fields actually used by the page (`chargeThreshold`, `tariffProvider`, `feedInTariff`, `monthlyBudget`, `priceAlerts`, `priceAlertThreshold`, `priceCurrent`, `pvYieldToday`); defaults baked into the selector so downstream `??` chains are removed
  - `LiveEnergyFlow.tsx`: replaced two broad `useAppStoreShallow((s) => s.settings)` in sub-components (`EVQuickActionPanel`, `BatteryPanel`) with targeted `useAppStore((s) => s.settings.systemConfig.X)` scalar selectors; removed now-unused `useAppStoreShallow` import
  - `Monitoring.tsx`: merged two separate `useAppStoreShallow` calls (`connected` + `settings.debugMode`) into one combined selector — single subscription instead of two, default `false` baked in for `debugMode`
- Coverage thresholds adjusted to realistic values: 48% stmts, 40% branches, 49% funcs, 49% lines
- `pnpm.overrides` now used instead of top-level `overrides` (pnpm-native syntax)
- pnpm upgraded to **10.33.0** (`packageManager` field + all 12 CI workflow files updated)
- `@xmldom/xmldom` override tightened: `0.8.12` → `>=0.9.0`
- `basic-ftp` override tightened: `5.2.2` → `>=5.3.0`
- nginx `nginx.conf` comment updated to clarify WebSocket origin production guidance (37 total test files, ~365 tests):
  - `circuit-breaker.test.ts` (new — 26 tests): full FSM coverage for `CircuitBreaker` — initial state, CLOSED→OPEN threshold, OPEN→HALF_OPEN cooldown auto-transition, HALF_OPEN→CLOSED success probe, `execute()` wrapper (success, failure, fail-fast), `forceOpen()`, `reset()`, `onStateChange()` callbacks (multiple listeners, all transitions), `destroy()` listener teardown
  - `tariff-providers.test.ts` (new — 26 tests): `getDynamicGridFee()` §14a EnWG time-of-use pricing, `isPeakHour()` morning/midday/evening peak detection, `getGridFeeSchedule()` 24-slot hourly array, `applyDynamicGridFees()` fee replacement + total recalculation + optional field preservation, `TARIFF_PROVIDERS` metadata integrity, `fetchTariffPrices('none', '')` offline fixed-price path
  - `notifications.test.ts` (new — 17 tests): `isInQuietHours()` same-day and overnight window logic (boundary conditions, minutes precision, disabled flag), `isCoolingDown()` / `markSent()` per-category cooldown windows (ev-ready 10 min, ev-fault 5 min, tariff-spike/drop 15 min, update 60 min), independent category isolation
  - `energy-context.test.tsx` (new — 18 tests): `EnergyProvider` connected state, `isExporting`, `selfSufficiencyPercent` (0%/100%/75%), detail panel open/close/nodeId, demo-data fallback, throws-outside-provider guard
  - `energy-store.test.ts` (extended — +4 tests): `useAppStore.getState()` bridge contract — stable action refs, `setEnergyData`/`setConnected` exposure, `selectAdapterStatuses` shape
  - `store.test.ts` (extended — +9 tests): equality-skip guards for `setEnergyData` and `setConnected`, granular selector patterns for Opt#2 refactored pages
- Server decomposed from 755-line monolith into modular `src/server/` structure
  - `middleware/auth.ts` — JWT middleware, API key validation, WebSocket auth
  - `middleware/security.ts` — Helmet CSP, CORS, rate limiting
  - `middleware/metrics.ts` — Prometheus metrics engine
  - `routes/auth.routes.ts` — `/api/auth/token`, `/api/auth/refresh`, `/api/health`
  - `routes/eebus.routes.ts` — `/api/eebus/discover`, `/api/eebus/pair` (JWT-protected)
  - `routes/metrics.routes.ts` — `/metrics`, `/api/metrics/json` (JWT-protected)
  - `routes/grafana.routes.ts` — `/api/grafana/dashboard` (JWT-protected)
  - `ws/energy.ws.ts` — WebSocket handler with auth, rate limiting, broadcasts
  - `data/mock-data.ts` — Mock data generator with `ADAPTER_MODE` env var
- New unit tests: `logger`, `sentry`, `query-client`, `adapter-registry`, `plugin-system` (56 tests)
- Extended `theme.test.ts` from 3 to 6 tests
- JWT entropy validation and weak-pattern detection in `jwt-utils.ts` (`checkSecretEntropy`) — warns on low-entropy or dictionary-word secrets in production
- Auth-endpoint rate limiter: `/api/auth/token` and `/api/auth/refresh` now limited to 10 req/min (separate from global 100/min and API 60/min limiters) to prevent brute-force attacks
- Trusted-IP bypass for rate limiting via `RATE_LIMIT_TRUSTED_IPS` env var — supports internal load balancers and proxies
- `getClientIP` helper in `security.ts` respects `X-Forwarded-For` header consistently across all rate limiters
- nginx `limit_conn_zone` + `limit_conn conn_limit 50` — per-IP connection limiting (DoS hardening)
- nginx `Cross-Origin-Embedder-Policy: credentialless` header for stronger cross-origin isolation
- New environment variables documented in `.env.example`: `API_KEYS`, `CORS_ORIGINS`, `WS_ORIGINS`, `RATE_LIMIT_TRUSTED_IPS`
- Rolldown platform bindings added to `pnpm.onlyBuiltDependencies` (all 9 target triples) — prevents install warnings
- Storybook React 19 peer dependency rules (`@storybook/react>react`, `@storybook/react>react-dom`)
- `.devcontainer`: Rust stable feature added; `corepack prepare pnpm@10.33.0 --activate` in `postCreateCommand`
- Tauri crate version `4.4.0` → `4.5.0`; Rust edition `2021` → `2024`; `rust-version = "1.85"` pinned; all `tauri*` crates pinned to `2.2`; `serde` / `serde_json` versions fully qualified to `1.0`

### Fixed

- **CodeQL #184**: Clear-text logging of sensitive information in `jwt-utils.ts` — removed `estimatedEntropy`, `secret.length`, and matched weak-pattern names from all log/warn/error messages
- **CodeQL #182**: Client-side request forgery in `adapter-worker.ts` — replaced legacy `// lgtm[js/request-forgery]` (LGTM/deprecated) with `// codeql[js/request-forgery]` (current CodeQL suppression format); SSRF guard itself (allowlist + private-IP check + `redirect:'error'`) remains unchanged
- **GHSA-5c6j-r48x-rmvq**: `serialize-javascript` RCE via RegExp.flags — overridden to ≥7.0.5
- **GHSA-qj8w-gfj5-8c6v**: `serialize-javascript` CPU exhaustion DoS — overridden to ≥7.0.5
- **GHSA-52f5-9888-hmc6**: `tmp` arbitrary file write via symlink — overridden to 0.2.5
- Client-side request forgery in `adapter-worker.ts` — URL now reconstructed from parsed components with hostname allowlist re-assertion at fetch site
- Helm KSV-0125 Trivy alert — added `trivy:ignore:KSV-0125` inline comments to deployment templates (image registries validated at render-time via `assertTrustedImageRepository`)
- JWT `loadSecret()` now logs source of loaded secret and warns on short Docker secrets
- JWT secret file errors in production now emit a warning (previously silently swallowed)

### Documentation

- Translated all German-language documentation files to English (CODE_OF_CONDUCT.md, all `.github/` templates, Deployment-Checklist.md)
- **DESIGN-SYSTEM.md** — corrected all 5 theme IDs/labels to canonical names (`ocean-dark`/Ocean Deep, `energy-dark`/Energy Dark, `solar-light`/Solar Light, `minimal-white`/Minimal, `nature-green`/Forest); added fluid typography scale (`fluid-text-xs` – `fluid-text-5xl` with `clamp()`); added 8pt grid spacing system (`space-xs` – `space-3xl`); documented `glass-panel-strong` and `glass-panel-hover` variants
- **docs/API-Reference.md** — added `POST /api/auth/ws-ticket` (60-second single-use tickets) and `POST /api/auth/revoke` (JTI revocation) endpoints; fixed `/api/health` response schema; corrected WebSocket power ranges to 0–25 000 W (§14a EnWG); added JWT scopes reference table
- **SECURITY.md** — added JWT scope tiers table (`read`/`readwrite`/`admin`), WS-ticket auth section, JTI revocation note, per-IP WebSocket limit (max 10), full environment variables reference table
- **docs/Security-Architecture.md** — updated to v1.3; corrected PBKDF2 iterations from 100 k to 600 000 throughout; added JWT scope system, per-IP WS limit, single-use WS tickets
- **README.md** — corrected theme names/IDs table with canonical values; added `ADAPTER_MODE` and `PROMETHEUS_BEARER_TOKEN` to environment variables
- **CONTRIBUTING.md** — removed stale `pnpm format:check` step (subsumed by `pnpm lint`); added `pnpm verify:basis` to scripts table; added React Compiler compliance section; added Conventional Commits scope examples
- **docs/Deployment-Guide.md** — fixed `JWT_SECRET` minimum length (32 → 64 chars); marked `GRAFANA_PASSWORD` as required; added `PROMETHEUS_BEARER_TOKEN` and `ADAPTER_MODE` rows
- **docs/Biome-Migration-Roadmap.md** — added Migration Complete callout; renamed ambiguous "Current State" section to "Pre-Migration State (Historical Reference)"
- **docs/Toolchain-Architecture.md** — added `pnpm bench` to scripts table; added VS Code Integration section with recommended extension settings
- **docs/Adapter-Dev-Guide.md** — documented PBKDF2 key derivation parameters (SHA-256, 600 000 iterations) in Credential Security section

## [1.0.0] - 2026-04-13

### BREAKING CHANGES

- Refactored from single-page dashboard to multi-page SPA with 7 unified sections

### Added

- 3× MultiPlus-II system presets, fully editable config, README rewrite, GH Pages fix ([acf58fd](https://github.com/qnbs/Nexus-HEMS-Dash/commit/acf58fda8b1026406188f12defee7c8c341dcb9a))
- adapter plugin system (contrib/ + registerAdapter API) ([fbc1888](https://github.com/qnbs/Nexus-HEMS-Dash/commit/fbc1888248000a0c550abde82727dd19ef100ca1))
- Adapter-Config-Panel, Compliance-Checklist, Dev-Guide ([2ed45d9](https://github.com/qnbs/Nexus-HEMS-Dash/commit/2ed45d939b4f1683cba16115df27ebb48fa6def0))
- **adapters:** implement Adapter Pattern for HEMS protocols v3.1.0 ([0007c54](https://github.com/qnbs/Nexus-HEMS-Dash/commit/0007c5451c0f9d6133d692f5db1f8e19bc9e0c4d))
- add 4 contrib protocol adapters (HA MQTT, Matter/Thread, Zigbee2MQTT, Shelly REST) ([5750f0f](https://github.com/qnbs/Nexus-HEMS-Dash/commit/5750f0f394bb816522552f0b17c525802120d4a2))
- add controllers, plugins & hardware registry pages ([7d7dd04](https://github.com/qnbs/Nexus-HEMS-Dash/commit/7d7dd042f88946fed67e233128a7e80e5b55a5f1))
- add stale-action, PR labeler, branch protection guide ([e22d3e4](https://github.com/qnbs/Nexus-HEMS-Dash/commit/e22d3e4da3c17e67f96a6b7a9fbaf2eaaa93a47c))
- **ai-optimizer:** comprehensive page rewrite with strategy timeline ([9b131b6](https://github.com/qnbs/Nexus-HEMS-Dash/commit/9b131b6d66aaae1a866993c4731652774836ac1f))
- **analytics:** comprehensive rewrite with KPI bar, energy balance chart, cost analysis, efficiency metrics ([829dffd](https://github.com/qnbs/Nexus-HEMS-Dash/commit/829dffd3b176872ab00284c4a045cace4177e68b))
- backend security hardening (v4.3.0) ([a69fe78](https://github.com/qnbs/Nexus-HEMS-Dash/commit/a69fe783b7059671aa5a03a870c52d4279f625c7))
- BYOK AI system with AES-GCM 256-bit encrypted key storage ([7f354b6](https://github.com/qnbs/Nexus-HEMS-Dash/commit/7f354b668a3c303e41a327f67aca043f4e347641))
- Cerbo GX MK2 + RPi integration guide, gateway selector, full i18n ([e58b2b9](https://github.com/qnbs/Nexus-HEMS-Dash/commit/e58b2b9289639af4bc441dba9f2c7c160a634a2f))
- Complete Feature Suite v2.1.0 - All 8 Advanced Features Implemented ([8494ae1](https://github.com/qnbs/Nexus-HEMS-Dash/commit/8494ae1491b30f61064e218cb027f36c4064a7bb))
- complete UI/UX transformation to unified command center ([b353ea7](https://github.com/qnbs/Nexus-HEMS-Dash/commit/b353ea7f1793218ea5483c9a4b779f7e07ce1057))
- Comprehensive PWA Enhancement with State-of-the-Art Features ([6fdd96c](https://github.com/qnbs/Nexus-HEMS-Dash/commit/6fdd96ca12871ad5325605ee487ed53e10262695))
- comprehensive Settings/Help rewrite, PWA enhancements, UI/UX polish ([a188dc8](https://github.com/qnbs/Nexus-HEMS-Dash/commit/a188dc80412c2b20d6f693dcd104505513db59be))
- **consumption:** comprehensive consumer analysis with charts, costs & load shifting ([dd8c3a1](https://github.com/qnbs/Nexus-HEMS-Dash/commit/dd8c3a18da6e86c1b0290c1230b694360b8e8d7c))
- **db:** add Dexie.js IndexedDB migration safety with upgrade handlers ([6ce2068](https://github.com/qnbs/Nexus-HEMS-Dash/commit/6ce20689272330a91552bf89e7a98c535fe16f0f))
- deepen pages & features — dynamic pricing, CO₂, offline voice ([dbc2bff](https://github.com/qnbs/Nexus-HEMS-Dash/commit/dbc2bffd06d8c547174cb49cfacd8de531e521e6))
- demo data, KNX floorplan, AI acknowledgments ([f3426be](https://github.com/qnbs/Nexus-HEMS-Dash/commit/f3426be2c7b425b29dfc0e88a05e0a3737ee12cd))
- Deployment & Monitoring – Docker-Compose, Prometheus, Tauri Auto-Update ([ebf4d86](https://github.com/qnbs/Nexus-HEMS-Dash/commit/ebf4d86d31482d259890fb0ebcd21a65ca68897f))
- deployment, devops & monitoring (8.1-8.5) ([45a2908](https://github.com/qnbs/Nexus-HEMS-Dash/commit/45a29081d2c53661b2f029090e49521a7c13d0dc))
- emhass/openems/evcc-inspired hems expansion ([0886cb3](https://github.com/qnbs/Nexus-HEMS-Dash/commit/0886cb348e1663469f4145d0bbc766c876a47e98))
- **energy-flow:** comprehensive page rewrite + fix i18n key mismatch ([75ad9c1](https://github.com/qnbs/Nexus-HEMS-Dash/commit/75ad9c184516487d43bb693e973be10f45afd837))
- **ev:** enhance EVPage — charge source donut, weekly stats, efficiency metrics, departure planner with schedule, ProtocolRow i18n fix ([91f01f6](https://github.com/qnbs/Nexus-HEMS-Dash/commit/91f01f64e11b215db946df4765c9d6ef96254d85))
- extend Service Worker runtime caching for all APIs ([d54d9ed](https://github.com/qnbs/Nexus-HEMS-Dash/commit/d54d9edf6ea3a6c193176879c7fcca05422883dc))
- **floorplan:** room energy donut, air quality panel, temp comparison bars, KNX activity log ([249641e](https://github.com/qnbs/Nexus-HEMS-Dash/commit/249641ec31ef3005fb6b15dcf8e9d05f14877369))
- full performance optimization setup ([b981631](https://github.com/qnbs/Nexus-HEMS-Dash/commit/b9816314c635d3a996cf30775c9b9fc5d3f4c923))
- historical analytics + influxDB/prometheus integration ([c4b869c](https://github.com/qnbs/Nexus-HEMS-Dash/commit/c4b869c90d2349cdb2c8457915540daf674a397a))
- Historical Analytics + ML-Forecast + CO₂ Reports (Maßnahme 4.3) ([3de254f](https://github.com/qnbs/Nexus-HEMS-Dash/commit/3de254f44e6cecfa1cce9c5feb9ed7b1fc0cb875))
- **home:** comprehensive HomePage rewrite — system health banner, energy balance strip, today's highlights, load breakdown, enhanced KPI cards with hover chevron ([16fe0bd](https://github.com/qnbs/Nexus-HEMS-Dash/commit/16fe0bdd50e907c67431ec1f82bd2449adb2716c))
- Initialize Nexus-HEMS Dash project structure ([6b0879f](https://github.com/qnbs/Nexus-HEMS-Dash/commit/6b0879f1fe4166a9b108989ab2f25208dfddef8c))
- mobile native-app + multi-tariff + dynamic grid fees ([1e585a9](https://github.com/qnbs/Nexus-HEMS-Dash/commit/1e585a93c917f604e54c6a8eb45018c1d984564a))
- **monitoring:** comprehensive page rewrite + fix analytics mobile overflow ([47e8d08](https://github.com/qnbs/Nexus-HEMS-Dash/commit/47e8d081c1b8da42deb30ef6fc65a7e305617ac8))
- Multi-User Auth + Shareable QR-Links (Maßnahme 4.2) ([3324d4c](https://github.com/qnbs/Nexus-HEMS-Dash/commit/3324d4c3aa04d6002422508ea5019096f4ee0e44))
- **navigation:** comprehensive cross-referencing system with PageCrossLinks ([95282ff](https://github.com/qnbs/Nexus-HEMS-Dash/commit/95282ffb2e5a85ce997335ae1c220cf08be168d3))
- Nexus HEMS Dashboard v2.0.0 - Production Ready ([bf79310](https://github.com/qnbs/Nexus-HEMS-Dash/commit/bf7931080e644531f28aedf947534ccff746a9c9))
- optimize header/title bar for mobile — modern UX overhaul ([af4e6fe](https://github.com/qnbs/Nexus-HEMS-Dash/commit/af4e6fe0f7bf549338922db321bf5e0e5881e4a4))
- plugin system + 5 contrib adapters vollständig integriert (v4.5.0) ([b8de32a](https://github.com/qnbs/Nexus-HEMS-Dash/commit/b8de32ad6355c0d66a356f80ab1820da2865998c))
- **production:** comprehensive ProductionPage rewrite — solar ring gauge, 6 KPI cards, 24h production curve, PV distribution pie, system specs panel, irradiance/PR indicator ([4117b11](https://github.com/qnbs/Nexus-HEMS-Dash/commit/4117b11dedfed775a8f9d3fdc707efed41e16038))
- Prometheus/Grafana monitoring, EEBUS SPINE/SHIP, OceanDeep default, fix all TS errors ([0b29839](https://github.com/qnbs/Nexus-HEMS-Dash/commit/0b298394ac8435061245adaed8824e204f8fc35b))
- **protocols:** real protocol implementations (mock → production) ([27df052](https://github.com/qnbs/Nexus-HEMS-Dash/commit/27df05291e7fc83d8241b3fb414643e04d6bc196))
- **readme:** dynamic badges + settings deep-linking + audit ([90c8336](https://github.com/qnbs/Nexus-HEMS-Dash/commit/90c833622144e025d4933984b7f64d43f32ea0b3))
- replace express-validator with Zod schema validation ([ae6b57d](https://github.com/qnbs/Nexus-HEMS-Dash/commit/ae6b57dd108fd3758beaa5bd6d7488651b69b512))
- **robustness:** exponential backoff + jitter + navigator.onLine + Web Worker + per-adapter metrics + useShallow ([2db6426](https://github.com/qnbs/Nexus-HEMS-Dash/commit/2db64266f005690c4689412d933ac79d3b2f4708))
- **safety:** critical fail-safe layer for hardware command control ([adf25b4](https://github.com/qnbs/Nexus-HEMS-Dash/commit/adf25b4e37f68ca11d32157f0be9027ac4ea8caf))
- **security:** BYOK vault + per-adapter encrypted config + Helmet + mTLS schemas ([c39e1b7](https://github.com/qnbs/Nexus-HEMS-Dash/commit/c39e1b7b4b6ecf232b6439431cee04b3c51e6c63))
- sentry + error boundaries + prometheus monitoring ([7664988](https://github.com/qnbs/Nexus-HEMS-Dash/commit/76649888f9bed640aafb8fc954566bbc1ae3dc9f))
- **settings:** add accessibility, location, alert thresholds, quiet hours, dashboard prefs ([6487ac9](https://github.com/qnbs/Nexus-HEMS-Dash/commit/6487ac995a94c1d8981fcfa7cab3ce8cd9f33728))
- **settings:** add Controllers & MPC tab, update page-relations, fix version ([76baf8a](https://github.com/qnbs/Nexus-HEMS-Dash/commit/76baf8a23217d2c72d21f0389bb6e630938e9bc0))
- **storage:** comprehensive battery management page with SoC chart, strategy selector, safety limits ([7e28fcc](https://github.com/qnbs/Nexus-HEMS-Dash/commit/7e28fccf5d2846d0dd04779b66afd7bf98318394))
- storybook + chromatic CI, docs, semantic-release, i18n inspector ([0ba77ab](https://github.com/qnbs/Nexus-HEMS-Dash/commit/0ba77ab4034893a542d57ecfc7676d61ecdce50a))
- **tariffs:** comprehensive TariffsPage rewrite with price forecasting, tariff comparison, optimal windows, provider config, cost analysis & price alerts ([c40889a](https://github.com/qnbs/Nexus-HEMS-Dash/commit/c40889a1695fa80777da09acb7a9537de9d3425a))
- Tauri Mobile + Push Notifications (EV ready, Tariff spike) ([9ae9dbc](https://github.com/qnbs/Nexus-HEMS-Dash/commit/9ae9dbc851028614bf2d7c197242dd2a8cbaaa57))
- **ui:** aria-live sankey, high-contrast, reduced-motion, a11y tests ([72f9c30](https://github.com/qnbs/Nexus-HEMS-Dash/commit/72f9c301269c87c95ed8923116389dadd22cbff1))
- **ui:** comprehensive mobile header with live energy status bar ([2607c5c](https://github.com/qnbs/Nexus-HEMS-Dash/commit/2607c5c08fc142a9fb57200643dd08c368fca2ba))
- **ui:** refined visual design system with advanced micro-interactions ([e6b9129](https://github.com/qnbs/Nexus-HEMS-Dash/commit/e6b9129ff70c61f34739b412fbb83cbaed9d1cef))
- v3.0.0 - Multi-Page Architecture with 11 lazy-loaded routes ([0916183](https://github.com/qnbs/Nexus-HEMS-Dash/commit/091618376cee109750c1489b6153605e2dd72b38))
- v4.0.0 — PDF export fix, PWA icons, onboarding & production polish ([a8a4142](https://github.com/qnbs/Nexus-HEMS-Dash/commit/a8a4142a9e8e43a4479f8bd97b91ebc43cd2a9ec))
- web workers for D3-Sankey & AI via Comlink ([7680849](https://github.com/qnbs/Nexus-HEMS-Dash/commit/76808495ced6a958e45fc4b4025809de9b05ba3b))

### Fixed

- **a11y:** resolve all E2E accessibility violations for green CI ([9f4f91f](https://github.com/qnbs/Nexus-HEMS-Dash/commit/9f4f91fbd8cd9d6e810fcdef68a3f4c6ac29c23b)), closes [#64748b](https://github.com/qnbs/Nexus-HEMS-Dash/issues/64748b) [#8896b0](https://github.com/qnbs/Nexus-HEMS-Dash/issues/8896b0) [#94a3b8](https://github.com/qnbs/Nexus-HEMS-Dash/issues/94a3b8) [#64748b](https://github.com/qnbs/Nexus-HEMS-Dash/issues/64748b) [#94a3b8](https://github.com/qnbs/Nexus-HEMS-Dash/issues/94a3b8)
- AI settings breadcrumb i18n error — key 'ai' returned object instead of string ([3fe7ef9](https://github.com/qnbs/Nexus-HEMS-Dash/commit/3fe7ef9872d6363892f8c3e8bbef40374c9d491a))
- audit — i18n keys, missing nav entries, legacy redirects, dead refs ([f45d921](https://github.com/qnbs/Nexus-HEMS-Dash/commit/f45d92154f671d7ce28724b46294fa94f92e5a0e))
- audit & harden all tests, fix CI, update badges ([3599ecf](https://github.com/qnbs/Nexus-HEMS-Dash/commit/3599ecf2bc8ec31b40e7e38b80729b8e0d97b2cd))
- audit and harden all recent HEMS modules ([3834f90](https://github.com/qnbs/Nexus-HEMS-Dash/commit/3834f90aa680771b6f916d6081d1cf7db8c1d573))
- centralize demo data in EnergyContext, dismiss tours in E2E ([9667f28](https://github.com/qnbs/Nexus-HEMS-Dash/commit/9667f2816084080ca4d76c5c9a71df63daf3160c))
- CI adapter tests, TariffsPage crash, PWA stale cache ([cb4bad9](https://github.com/qnbs/Nexus-HEMS-Dash/commit/cb4bad9c84cd714cf680a25a5d27791f409fbb63))
- CI E2E tests — CORS, CSP, rate limiting & mobile nav timeout ([01b7ece](https://github.com/qnbs/Nexus-HEMS-Dash/commit/01b7ece6401e636b0b445b6e9a83964d4ee431a0))
- CI lint/type-check/tests, resurrect README v3.3.0, add missing standard files ([3fc716a](https://github.com/qnbs/Nexus-HEMS-Dash/commit/3fc716a79ee32ca0c35fcaab9ecb712e28a0c1e7))
- **ci+ui:** E2E test, PV-Überschuss overflow, full responsive audit ([87bcafb](https://github.com/qnbs/Nexus-HEMS-Dash/commit/87bcafbc475ea3f5472faebdb9fd52f6e4774244))
- **ci+ui:** repair E2E tests, PV-Überschuss overflow, full responsive audit ([7427974](https://github.com/qnbs/Nexus-HEMS-Dash/commit/7427974a43c9e82cc479cb54cbcf01961b6053db))
- **ci:** replace Math.random() render calls with deterministic values ([ab420d4](https://github.com/qnbs/Nexus-HEMS-Dash/commit/ab420d4754bf0e348d2c47df92c12a9b3d420002))
- **ci:** resolve build failure and E2E test failures ([53b3055](https://github.com/qnbs/Nexus-HEMS-Dash/commit/53b3055e77d3c999eede64e2421fe05dde36d393))
- **ci:** sync package-lock.json, optimize README from 1317 to 231 lines ([0a08b41](https://github.com/qnbs/Nexus-HEMS-Dash/commit/0a08b41a9aeb4de8fbb2d87cbc1ff57ccddd8f35))
- comprehensive audit — version sync, page-relations, i18n, nav consistency ([aa1d340](https://github.com/qnbs/Nexus-HEMS-Dash/commit/aa1d340b9830a20822bf8b3bc6de8e8f8db0c817))
- critical dashboard crash - Floorplan missing useTranslation ([1900f6b](https://github.com/qnbs/Nexus-HEMS-Dash/commit/1900f6bf4d498f8a72d689e67e2563584f97bf6a))
- **deploy:** fix GitHub Pages SPA routing & index.html ([d205e84](https://github.com/qnbs/Nexus-HEMS-Dash/commit/d205e8489638eefe29f36d5ed5fd7e8dab3b09ee))
- dereference annotated tag hashes for codeql-action and gitleaks-action ([f732af3](https://github.com/qnbs/Nexus-HEMS-Dash/commit/f732af3d2f468fa8fabe4ef89b762929563aa4bc))
- E2E language-switch + mobile-more-btn, devtools dev-only ([6ad2c13](https://github.com/qnbs/Nexus-HEMS-Dash/commit/6ad2c136f85b465202aa152812fefff8e6da1b21))
- E2E mobile-more-btn use dispatchEvent for motion compat ([6cd0b92](https://github.com/qnbs/Nexus-HEMS-Dash/commit/6cd0b922034359b8651e9d828cb013f7b6f832b8))
- **e2e:** use aria-expanded selector + networkidle for More button test ([86cec6c](https://github.com/qnbs/Nexus-HEMS-Dash/commit/86cec6cbcdff3df03324206b923fa3cb86c0bcb2))
- i18n race condition, mobile header cleanup, PWA update optimization ([f882da4](https://github.com/qnbs/Nexus-HEMS-Dash/commit/f882da45435b748ae032f6d50b4c156f390488c2))
- **i18n:** complete localization of all hardcoded strings ([6a43a6d](https://github.com/qnbs/Nexus-HEMS-Dash/commit/6a43a6dda4cba0bf347de5ade77fb218eef9561d))
- legacy redirects, crossLinks cleanup, navigation audit ([1addb8f](https://github.com/qnbs/Nexus-HEMS-Dash/commit/1addb8f7d57169af22ec1292043a9b500fab916a))
- migrate all Tailwind v4 classes to shorthand syntax + fix trusted-types ([04c279a](https://github.com/qnbs/Nexus-HEMS-Dash/commit/04c279a8b99b61b931bfe7572fa9ad7988d63ec5))
- mobile layout, accessibility settings & onboarding modal ([45b25ff](https://github.com/qnbs/Nexus-HEMS-Dash/commit/45b25fff3a371fc2e4cf196e115e010fa8047624))
- mobile navbar — remove white box on More button, fix overlay behavior ([5fd655e](https://github.com/qnbs/Nexus-HEMS-Dash/commit/5fd655e866e6e245e61a356eeaab09623c8dec2a))
- onboarding blocks app shell, EmergencyStop z-index, ErrorBoundary path ([37d7e16](https://github.com/qnbs/Nexus-HEMS-Dash/commit/37d7e16e67f89e69f01f033fb4f8281664ef64b9))
- PWA crash & complete UI/UX overhaul with state-of-the-art design ([89f00d1](https://github.com/qnbs/Nexus-HEMS-Dash/commit/89f00d19b27190263818ab9184f5f1028a50a8dc))
- PWA popup overlap, share link, add demo data ([ddd4adc](https://github.com/qnbs/Nexus-HEMS-Dash/commit/ddd4adce76e3b6eb561f83e6ce20c97685176bcb))
- pwa update tariffs crash emergency stop settings ci e2e ([9f00808](https://github.com/qnbs/Nexus-HEMS-Dash/commit/9f0080835a1f30a3c99a7d96e62d23286267fb4d))
- PWA update, TariffsPage crash, EmergencyStop, theme color, Settings, CI, E2E ([a34c0c1](https://github.com/qnbs/Nexus-HEMS-Dash/commit/a34c0c199d112a6966258f3f13efbe6adc87fff7))
- **pwa:** eliminate blank white screen on SW update + fix CI pipeline ([42583e1](https://github.com/qnbs/Nexus-HEMS-Dash/commit/42583e1aaecc56d9710df5fdae8eef2a2073d271))
- react 19 strict-mode compliance + eslint-plugin-react-compiler ([6ca4c04](https://github.com/qnbs/Nexus-HEMS-Dash/commit/6ca4c04db23e0f0137359975851ab4873cd35001))
- remove price pill from mobile header ([40b5241](https://github.com/qnbs/Nexus-HEMS-Dash/commit/40b5241680b2509700b8387d76510d2a9f49b796))
- resolve all CI failures + add pre-push stability gate ([d1bd778](https://github.com/qnbs/Nexus-HEMS-Dash/commit/d1bd778fd3b7cf9ad4b9b486999c7a7f8026d8ca))
- resolve failing CI/Scorecard/Trivy/Security workflows ([7e6895d](https://github.com/qnbs/Nexus-HEMS-Dash/commit/7e6895d08b7ad01e73ed17c0e1078c7c70ebc0ad))
- resolve OpenSSF Scorecard security alerts ([bd343bd](https://github.com/qnbs/Nexus-HEMS-Dash/commit/bd343bdde2f4d39d2a1c32b8843a352de4b7820c))
- **sankey:** add relative to container so title stays above diagram ([eb7240f](https://github.com/qnbs/Nexus-HEMS-Dash/commit/eb7240fde9ee575f6042b6c7a3967989ce3eab73))
- Use --legacy-peer-deps in deploy workflow ([2b0e56c](https://github.com/qnbs/Nexus-HEMS-Dash/commit/2b0e56cde48da1d0ba5050d014757047ddcfcf48))

### Performance

- **build:** lazy-load locales & Onboarding, fix CSS warning ([5b6446d](https://github.com/qnbs/Nexus-HEMS-Dash/commit/5b6446d25af88972c17a3bf313c0a9c4b611f7c8))
- bundle optimization — manualChunks split, dynamic jsPDF, adapter isolation ([162d8e1](https://github.com/qnbs/Nexus-HEMS-Dash/commit/162d8e1829726639e288de764b685cf6cac832c0))
- lighthouse mobile edge cases — content-visibility, virtual scroll, SEO meta ([b2b76f5](https://github.com/qnbs/Nexus-HEMS-Dash/commit/b2b76f57a241e188abb71edd4b7476b8e17470bf))
- Maßnahme 3.2 — Bundle-Optimierung + Lighthouse CI ≥ 95 ([ae11111](https://github.com/qnbs/Nexus-HEMS-Dash/commit/ae11111c96e519d4aa6e7c0f58c1e0278f3653cb))
- Maßnahme 3.3 — TanStack Query + Zustand Sync optimieren ([d63e215](https://github.com/qnbs/Nexus-HEMS-Dash/commit/d63e21544ad5f155dea07841bc9f8388882252e3))
- optimize build system — code-splitting, D3 tree-shaking, lazy loading ([7010873](https://github.com/qnbs/Nexus-HEMS-Dash/commit/701087353b5950e75f3b3cc27384dca0bc27c1da))
- optimize Zustand bridge, consolidate IndexedDB, fix CI thresholds ([36a8e74](https://github.com/qnbs/Nexus-HEMS-Dash/commit/36a8e741b16385ec50cee1aa2692a19eeb6a9d5c))
- React 19 performance deep dive ([aef0ad2](https://github.com/qnbs/Nexus-HEMS-Dash/commit/aef0ad22eead8657473ce5fcd584cd5b957acc15))
- Web Worker for Sankey + useShallow selectors (Maßnahme 3.1) ([6aa6647](https://github.com/qnbs/Nexus-HEMS-Dash/commit/6aa66471ce28b30afeab1ea80337925b8609a86c))

### Security

- comprehensive security hardening & OpenSSF Scorecard integration ([21d8375](https://github.com/qnbs/Nexus-HEMS-Dash/commit/21d83752be50be75d2a28cfcdb633e2d72b80bdf))
- fix all Trivy, CodeQL, and Scorecard alerts ([7bdc57a](https://github.com/qnbs/Nexus-HEMS-Dash/commit/7bdc57a7790c1f1f88762f9d8be99a650ce017b0)), closes [#29](https://github.com/qnbs/Nexus-HEMS-Dash/issues/29) [#3](https://github.com/qnbs/Nexus-HEMS-Dash/issues/3)
- fix cleartext storage of sensitive information (CodeQL [#1](https://github.com/qnbs/Nexus-HEMS-Dash/issues/1), [#2](https://github.com/qnbs/Nexus-HEMS-Dash/issues/2)) ([79e990f](https://github.com/qnbs/Nexus-HEMS-Dash/commit/79e990ff7f4eb0b0b23ebeaafb8405bf4334fa15))
- fix CodeQL, Semgrep, and Scorecard alerts ([#4](https://github.com/qnbs/Nexus-HEMS-Dash/issues/4)-[#28](https://github.com/qnbs/Nexus-HEMS-Dash/issues/28), [#93](https://github.com/qnbs/Nexus-HEMS-Dash/issues/93)-[#94](https://github.com/qnbs/Nexus-HEMS-Dash/issues/94)) ([85429e0](https://github.com/qnbs/Nexus-HEMS-Dash/commit/85429e04dc7b75b737a3eb2920256edac31408e5)), closes [#24](https://github.com/qnbs/Nexus-HEMS-Dash/issues/24) [#22](https://github.com/qnbs/Nexus-HEMS-Dash/issues/22) [#23](https://github.com/qnbs/Nexus-HEMS-Dash/issues/23) [#25](https://github.com/qnbs/Nexus-HEMS-Dash/issues/25) [#26](https://github.com/qnbs/Nexus-HEMS-Dash/issues/26) [#27](https://github.com/qnbs/Nexus-HEMS-Dash/issues/27) [#5](https://github.com/qnbs/Nexus-HEMS-Dash/issues/5) [#6](https://github.com/qnbs/Nexus-HEMS-Dash/issues/6)
- fix Scorecard, Trivy, and CodeQL alerts ([b13b883](https://github.com/qnbs/Nexus-HEMS-Dash/commit/b13b8830076f93aeec235bf41c919fcd122e036b))
- harden MQTT clients (Victron + KNX adapters) ([96dd014](https://github.com/qnbs/Nexus-HEMS-Dash/commit/96dd0140a240658caba2272bbc7154fbf6a8956a))
- replace jsonwebtoken with jose, add key rotation ([6c01ed4](https://github.com/qnbs/Nexus-HEMS-Dash/commit/6c01ed4d412d45d30e336ee7f1458a3bcdafbf36))

### Accessibility

- WCAG 2.2 AA audit fixes ([62aba52](https://github.com/qnbs/Nexus-HEMS-Dash/commit/62aba525c33a5c38cbc712eba167f85fb884c902))
- **wcag:** comprehensive WCAG 2.2 AA audit & fixes ([2b1c644](https://github.com/qnbs/Nexus-HEMS-Dash/commit/2b1c644a92154dc9a19b53907696dc32b8dc5757))

### Changed

- **adapters:** extract BaseAdapter abstract class with built-in Circuit Breaker ([96ffd82](https://github.com/qnbs/Nexus-HEMS-Dash/commit/96ffd8263ad1bf9be3af47f713ec645535dc2a5a))
- audit cleanup — remove dead code, guard console, sync versions ([46c6350](https://github.com/qnbs/Nexus-HEMS-Dash/commit/46c6350b87f2f2e105ce38baef2cc1274fc7b486))
- **audit:** global cleanup — remove manual memoization, fix lint ([c9ff4f8](https://github.com/qnbs/Nexus-HEMS-Dash/commit/c9ff4f8be11cbf24bd0d93fa457e4cf2c9b327b2))
- model-agnostic AI, CommandHub i18n, CI fixes, app audit ([bfd092d](https://github.com/qnbs/Nexus-HEMS-Dash/commit/bfd092d485b8b43791950b1ff80a2161e267cf63))
- streamline header — remove redundant page titles, connection indicators ([a2ee4ff](https://github.com/qnbs/Nexus-HEMS-Dash/commit/a2ee4ff8102bfe8e704da397779c96842ea0f573))
- tanstack query + zustand sync — eliminate dual state ([a462aa8](https://github.com/qnbs/Nexus-HEMS-Dash/commit/a462aa844e4e5fd80bf7a55902bbf738ca6c14b8))
- **ui:** declutter interface, redesign theme system, fix e2e tests ([131721e](https://github.com/qnbs/Nexus-HEMS-Dash/commit/131721e27df4e77c73b4c7cd2d3810312f4c6d51))

## [4.5.0] - 2026-04-13

### Security

- Hardened OpenEMS adapter input handling (component/property validation + value sanitization)
- Tightened adapter worker URL allowlist checks with strict private IPv4 handling
- Sanitized plugin logging/event token output to reduce log-injection risk
- Added dedicated security hardening unit tests (`src/tests/security-hardening.test.ts`)

### Changed

- Upgraded server runtime to `express@5.x` with matching `@types/express@5.x`
- Removed deprecated `@types/express-rate-limit` stub package
- Kept Node.js 22 as production baseline across build/release paths
- Added Node.js 25 CI canary job as non-blocking forward-compatibility signal

### Added (Deployment)

- Added manual production deploy approval gate (`approveDeploy=DEPLOY`) in deploy workflow
- Added runner compatibility check for checkout v6 requirements
- Added Helm deployment strategy controls + `revisionHistoryLimit`
- Added digest-aware Helm image rendering (`repository@sha256:...`) for immutable rollouts
- Added OCI image metadata labels to frontend/backend Docker images for traceability

### Documentation

- Updated `README.md` deployment/security/runtime baseline sections
- Updated `SECURITY.md` with runtime policy and deploy governance
- Updated `docs/Security-Architecture.md` with runtime governance and supply-chain details
- Updated `docs/Deployment-Checklist.md` with manual approval flow, digest strategy, and Helm rollback runbook

## [4.4.0] - 2026-03-16

### Added

- **storybook:** Storybook für alle Components + Chromatic CI-Integration
- **docs:** Security-Architecture.md, Deployment-Checklist.md, Adapter-Dev-Guide Update
- **ci:** semantic-release + automatisierter CHANGELOG + Release-Notes
- **i18n:** Deutsch-Übersetzung 100% abgedeckt + i18next-Inspector-Modus
- **pwa:** PWA Update-Notification, theme_color Fix, Install-Prompt
- **adapter:** EEBUS SPINE/SHIP, Modbus SunSpec, OCPP 2.1 TypeScript-Fixes
- **settings:** EmergencyStop → Danger Zone, LanguageSwitcher → Settings
- **e2e:** Playwright-Tests für alle Hauptrouten + Accessibility

### Fixed

- PWA Update-Notification Interval-Leak behoben
- TariffsPage Crash bei fehlenden Daten (ErrorBoundary)
- PredictiveForecast Division-by-Zero Guard
- 5 TypeScript-Fehler behoben (EEBUSAdapter, ModbusSunSpec, OCPP21, command-safety)
- Settings doppelte Imports konsolidiert

### Security

- API-Keys verschlüsselt in IndexedDB (AES-GCM)
- Security-Architecture.md Dokumentation
- Deployment-Checklist mit TLS/Reverse-Proxy/Failover

### Accessibility

- WCAG 2.2 AA Konformität
- Skip-to-Content Link, Focus-Rings, Aria-Attribute

### Added (i18n)

- Deutsch-Übersetzung 100% (1680+ Keys)
- i18next-Inspector-Modus für Entwicklung
- Lazy-Loading für EN-Locale

---

[Unreleased]: https://github.com/qnbs/Nexus-HEMS-Dash/compare/v1.11.1...HEAD
[1.1.0]: https://github.com/qnbs/Nexus-HEMS-Dash/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/qnbs/Nexus-HEMS-Dash/releases/tag/v1.0.0
