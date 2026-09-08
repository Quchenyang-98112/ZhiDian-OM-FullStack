# Campaign Handoff — v1.3.x → v1.4.0 Audit / UI-UX Perfection

> **Status:** Phases A–D + G complete; F substantial; E partially done.
> **Snapshot:** 2026-07-02 · `main` after the data-viz / Settings-decomposition / a11y-flake / docs work.
> **Purpose:** resumable to-do + roadmap for the remaining tail of the campaign.
> **Related:** `docs/Perfection-Roadmap.md`, `docs/Technical-Debt-Registry.md`, `CHANGELOG.md` (`[Unreleased]`), `docs/adr/ADR-016..019`, `docs/Audit-Report-2026-07-02.md` (delta audit + backend-track sequence).

Delivery model (unchanged): small CI-green PRs; `main` is ruleset-protected → merge
with `gh pr merge <N> --squash --admin --delete-branch`; **every PR carries its tests
+ docs**; i18n en+de for every user-visible string; safety-first (never weaken command
caps / circuit breakers / mock default / `READ_ONLY_MODE`); never break
`SankeyDiagram.tsx` or `Floorplan.tsx`.

---

## ✅ Done in this campaign

- **Phase A — Safety re-verify + truth-sync** (ADR-016 Tauri, debt/coverage doc fixes).
- **Phase B — Accessibility deep-dive** (form ARIA, Recharts sr-only table, reusable
  `useFocusTrap`, `target-size` enforced, 11 biome a11y rules → error, per-theme
  contrast recorded, light-theme danger-fg → 7:1).
- **Phase C — Visual perfection** (complete):
  - Theme-aware data-viz palette `--chart-1..7` (7 = solar/PV gold) + 4-stop
    `--price-low/mid/elevated/high`, each ≥3:1 WCAG 1.4.11 per theme.
  - All Recharts surfaces migrated series **and** chrome off raw hex →
    `--chart-*` / `--price-*` / `--color-*` (HistoricalChart, Tariffs, Analytics,
    HistoricalAnalytics, Monitoring, PredictiveForecast).
  - Glassmorphism perf: `blur(64px)`→`blur(24px)` on workhorse surfaces +
    `@media (prefers-reduced-transparency: reduce)` solid fallback.
  - Calmer glow: neon/border + per-theme `--color-glow` softened ~25–30 % (hues kept).
- **A11y E2E flake — root-fixed** (three layers): `emulateMedia({reducedMotion})` (CSS),
  Web-Animations settle (WAAPI tweens), and the definitive `<MotionConfig skipAnimations>`
  gated on `VITE_E2E_TESTING` (framer springs). See `project_pr_merge_rulesets` memory.
- **Phase D — Maintainability** (complete):
  - **MED-16 Settings.tsx decomposition:** **3,663 → 512 LOC (−86%)**. Ten tabs are
    self-contained modules in `apps/web/src/components/settings/` (Appearance, System,
    Energy, Controllers, Security, Storage, Notifications, Advanced) + atoms
    (`ToggleSwitch`, `ThemePreviewCard`, `SettingsFeatureBar`), `PWASettingsSection`,
    shared `styles.ts`. `adapters`/`ai` stay one-line delegations. `Settings()` is now
    the nav shell + header + JSON export/import + lazy AI route. 21 unit tests in
    `apps/web/src/tests/settings-tabs.test.tsx`.
  - **MED-12 adapter worker:** SSRF/URL normalization extracted to pure exported
    `normalizePollTarget()` + 12 unit tests; production activation documented as
    **safety-gated** (needs a worker↔adapter parity harness — see debt registry).
- **Phase G — DevOps/Graphify** (complete): ADR-017 (knowledge-graph self-reflection
  practice), `Perfection-Roadmap.md` Milestone 2.3 truth-sync, CHANGELOG `[Unreleased]`.
- **Phase F — Testing** (substantial): new suites `settings-tabs` (21),
  `adapter-worker-target` (12), `hardware-registry` (11), `use-safe-command` (3);
  Storybook stories for `ToggleSwitch` + `ThemePreviewCard`.
- **Phase E — UX flows** (started): **command feedback toasts** — `useSafeCommand`
  now surfaces reject/fail/success via sonner (i18n `safety.command*`) + tests.

### Settings-tab extraction pattern (for the remaining tabs / future work)
Each tab reads `settings`/`updateSettings` (and theme state for Appearance,
`adapterMode` for Advanced) directly from the global Zustand store via
`useAppStoreShallow`, owns its local UI state (no prop-drilling / no shared form hook),
and `Settings()` keeps the `motion.div` tabpanel wrapper. For big blocks: verbatim
`sed -n START,ENDp` extract into the component shell, then `biome check --write` to
normalise; watch for orphaned lucide imports (biome flags; `noUnusedImports` is an
"unsafe" fix) and inline `import('../types')` paths that need `../../types` from the
new location.

---

## ⬜ Remaining — to-do (priority order)

### Phase E — UX flows (largest remaining)
1. **Per-page coachmarks / PageTour.** Revive `PageTour.tsx` from git `655141e`
   (`git show 655141e:apps/web/src/components/PageTour.tsx`), gate behind
   `VITE_E2E_TESTING`, add a reset control in Settings, expand `tour.*` i18n (en+de),
   per-route tour content. Non-blocking overlay. Substantial feature — its own 1–2 PRs.
2. **Consistent EmptyState / Skeleton.** Drive the existing `EmptyState`/`Skeleton`/
   `TabSkeleton` through the gaps: Floorplan custom spinner (⚠ `Floorplan.tsx` is
   PROTECTED — verify each change can't break the KNX floorplan), Analytics/Monitoring
   loading states, Settings/Monitoring empties. Small, per-surface PRs + a11y check.

### Phase F — Testing / coverage (cloud-first)
3. **Coverage-threshold bump.** The 47 new tests likely moved coverage up, but the
   enforced thresholds (`apps/web/vitest.config.ts` 70/70/68/70, `apps/api` 33/30/38/33)
   should only be raised **after reading a real CI coverage report** (`pnpm test:coverage`
   is CI-first; don't guess and risk a red gate). Target Stage-1 60 % per
   `docs/Testing-Coverage-Strategy.md`.
4. **More Storybook stories** — SankeyDiagram, the stateful Settings tabs (need a
   store/router decorator like the test mocks), `AdapterConfigPanel`, ×5 themes.
5. **Expand E2E** — chart keyboard-nav, Settings tab navigation, form validation.

### Backlog (from Technical-Debt-Registry — not in original campaign scope)
- HIGH-12 OCPP Security Profile 3 (browser mTLS limited).
- ARCH-04 evcc/OpenEMS registry; PERF-05 `useDeviceStore`; PERF-03 MPC → `ai-worker.ts`.
  (ARCH-03 `targetAdapterId` and MED-15 in-memory stores resolved in #193.)

### Backend-adapter track (2026-07-02 audit delta — **largely complete**)
The 2026-07-02 audit (`docs/Audit-Report-2026-07-02.md`) identified the keystone gap: backend
adapter data not reaching the UI. **Resolved items:** HIGH-17 (#197), MED-18 (#203), MED-19 (#204),
KNX/evcc/EEBUS-SPINE backend adapters (MED-20 partial, #205/#206/#210). **Remaining MED-20:**
OCPP CSMS gateway, OpenEMS backend adapter. Each PR keeps the safety gates
(`ADAPTER_MODE`/`ALLOW_LIVE_HARDWARE`/`READ_ONLY_MODE` + command audit) and carries tests + docs
+ i18n (en/de).

---

## How to resume

1. `git checkout main && git pull --ff-only` (if `origin/main` ref looks stale, `git fetch origin main` first — a known transient here).
2. Pick the top open to-do above; branch `feat|test|refactor|docs/<slug>`.
3. Implement + **tests + docs (en/de) in the same PR**; local loop `type-check → biome →
   targeted vitest` (heavy gates are CI-first on this low-end machine — one Bash call at a time).
4. Push; watch CI with `GH_PAGER=cat gh pr checks <N>`; admin-squash-merge when the 3
   required checks (`✅ CI Passed`, `lighthouse`, `🎭 E2E Tests`) are green.
5. Commit gotchas: subject must start lowercase; no `#token`/hex in the commit body
   (footer-leading-blank); `scope` warn-only.
