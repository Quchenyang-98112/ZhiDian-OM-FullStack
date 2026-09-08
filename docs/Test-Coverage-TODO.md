# Test & Coverage — Finalization TODO & Roadmap

**Status:** ✅ Web baseline restored — branch floor 72% re-restored (2026-07-08)
**Owner:** @qnbs
**Related:** `docs/Testing-Coverage-Strategy.md`, MED-01 in `docs/Technical-Debt-Registry.md`

---

## Resolution summary (2026-07-02)

The temporary gate reductions from PRs #207/#208/#209 are **fully reversed** for statements, functions, and lines; branches restored to **72%** stretch target (measured 72.00%, 2026-07-02).

| Metric | Measured (CI, 2026-07-08) | Enforced floor (vitest + baseline) | Original target |
| ------ | ------------- | -------------------------------- | --------------- |
| Statements | 81.44 % | **78 %** | 78 % |
| Branches | 72.69 % | **72 %** | 72 % (stretch) |
| Functions | 77.13 % | **70 %** | 70 % |
| Lines | 86.36 % | **80 %** | 80 % |

Gates live in `apps/web/vitest.config.ts` and `apps/web/coverage-baseline.json` (PRF-03).

---

## V8 branch artifact after page splits (2026-07-08)

The page-monolith modularization series (HistoricalAnalytics → LiveEnergyFlow →
DevicesAutomation → TariffsPage) moved four large presentational pages into many
small section components. The **V8** coverage provider counts JSX `className`
ternaries and framework wrappers (`motion.*` spreads, per-component prop
destructuring) as branch points that cannot be exercised both ways by any test —
they render one way per DOM state. Each split therefore lowers the **global
branch ratio** even though statements/functions/lines stay high and every real
**logic** branch is covered.

TariffsPage is the most ternary-dense page (12 sections: price zones, window
categories, device priorities, budget-gauge colours), so its split finally
pushed the global branch ratio from ~71.9% to a measured **71.31%** — verified
uncoverable: rendering every section with all prop-variants added **0.00%**.

The floor was briefly lowered **72 → 71.2%** to absorb the artifact.

**Resolution (2026-07-08): floor restored to 72%, honestly.** Rather than keep
the gate lowered, we covered the real hole instead of the phantom one. Two levers:

1. **Covered the untested config UI.** The OCPP/EEBUS adapter config field groups
   (`AdapterConfigOcppFields`, `AdapterConfigEebusFields`, `AdapterConfigOcppMtlsFields`)
   were at **0% branch coverage** (~209 uncovered branches, dominated by per-field
   nullish-coalescing). `adapter-config-fields.test.tsx` renders each in its empty
   and populated variants (plus the `securityProfile === 3` conditional), taking all
   three to **100%** and lifting global branches **71.27 → 72.69%**.
2. **Extracted phantom ternaries into pure helpers.** `PWASettingsSection`'s
   service-worker / install / update status→class/key ternaries moved into
   `settings/pwa-helpers.ts`, fully covered by `pwa-helpers.test.ts`.

Removing the orphaned `MonitoringPanel.tsx` (a never-imported duplicate) was correct
cleanup but, notably, did **not** move coverage — Vitest's `coverage.all` only counts
imported files, so covering real imported code was the effective lever.

**Floor:** branches restored **71.2 → 72%** in `vitest.config.ts` +
`coverage-baseline.json`; statements (78), functions (70), lines (80) unchanged.

### Tests landed for the restore

- `adapter-config-fields.test.tsx` — OCPP/EEBUS config field groups 0% → 100% (2026-07-08)
- `settings/pwa-helpers.test.ts` — PWA status helper branches (2026-07-08)
- `openems-adapter.test.ts` — connect-failure + JSON-RPC handshake (G-1)
- `exec-adapter.test.ts` — transport/poll negative path (G-2)
- `homeassistant-mqtt-adapter.test.ts` — ha-ws-api auth, discovery, state_changed (G-3)
- `example-contrib-adapter.test.ts` — template smoke (G-4)

---

## Remaining roadmap (folded from former phases)

### Web — branch stretch to 72 %

- [x] Extend nav/UI tests (`CommandPalette`, `MobileNavigation`, `Sidebar`, `Disclosure`, `ChoiceCardGroup`, `ConfirmDialog`, `ErrorBoundary`) for remaining active-state branches.
- [x] Bump `coverage-baseline.json` `branches` 70 → 72 (measured 72.00%, 2026-07-02).

### Web — quality gaps (not blocking gates)

- [x] Cover `co2-report.ts` PDF export + annual edge cases (2026-09-01, #TBD).
- [x] Cover `ai-keys.ts` error paths (`isKeyStorageAvailable`, decrypt failure, active provider) (2026-09-01, #TBD).
- [x] Cover `auth-token.ts` error paths (localStorage failures, no_api_base, malformed JWT) (2026-09-01, #345).
- [ ] Page-level tests for historical analytics pages.

### API backend coverage (separate track, MED-01)

- [x] `apps/api` vitest gate at **55/46/62/55** — measured ~66/59/71/68 (2026-09-01, slice 4 tests).
- [ ] Stretch toward roadmap targets in `docs/Testing-Coverage-Strategy.md` (OpenADR routes, services layer).
- [x] Sync slice 4 route/store tests (`sync.routes`, `settings-store`, `sync-diff-store`, `settings-sync-keys`).

### E2E / quality

- [ ] Prefer behavioural assertions over render-only smoke when filling coverage.
- [x] E2E offline sync conflict scenario (`tests/e2e/offline-sync-conflict.spec.ts`, 2026-09-01).
- [ ] E2E for auth flows, command-safety, backend-integration per `FEATURE_STATUS.md`.

---

## Guardrails

- **Never** lower a gate to hide a real regression.
- Keep `vitest.config.ts`, `coverage-baseline.json`, and all docs quoting coverage numbers in sync.
