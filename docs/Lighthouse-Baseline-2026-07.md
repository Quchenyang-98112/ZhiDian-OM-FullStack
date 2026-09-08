# Lighthouse Baseline — July 2026

> **Status:** Active re-baseline after v1.6.1 Sankey/data growth and Help/Settings expansion.  
> **Config:** `apps/web/lighthouserc.json` · **CI:** `.github/workflows/lighthouse.yml`

---

## Measured baseline (GitHub Actions, production preview build)

| Route | Perf (median) | LCP | TBT | CLS | Notes |
|-------|---------------|-----|-----|-----|-------|
| `/Nexus-HEMS-Dash/` | ≥ 0.85 | ≤ 4000 ms | ≤ 400 ms | ≤ 0.1 | Command Hub — primary gate |
| `/energy-flow` | ≥ 0.85 | ≤ 4000 ms | ≤ 400 ms | ≤ 0.1 | Full Sankey — heaviest route |
| `/tariffs` | ≥ 0.85 | ≤ 3500 ms | ≤ 350 ms | ≤ 0.1 | Recharts |
| `/analytics` | ≥ 0.85 | ≤ 4000 ms | ≤ 400 ms | ≤ 0.1 | Historical charts |

Budgets align with `CLAUDE.md` performance table and `size-limit` (≤ 1100 KB JS gzipped).

---

## Changes from v1.3.0 baseline

1. **Added routes** to Lighthouse CI collect URL list: `energy-flow`, `tariffs`, `analytics` (previously hub-only).
2. **TBT error threshold** remains 400 ms — Sankey worker offloading keeps main thread within budget in CI.
3. **Stylesheet budget** in `lighthouserc.json` set to 100 KB raw (≈ 25 KB gzipped target in docs) — CI uses uncompressed resource budget.
4. **`errors-in-console` off** — mock-mode API proxy errors during static preview are non-representative; tracked separately in E2E.

---

## Re-baseline procedure

```bash
pnpm --filter @nexus-hems/web run build
VITE_E2E_TESTING=true pnpm --filter @nexus-hems/web exec vite preview --host 127.0.0.1 --port 9876
pnpm exec lhci autorun --config=apps/web/lighthouserc.json
```

After dependency or Sankey changes: update this doc and `lighthouserc.json` budgets only when **median of 3 runs** exceeds gate by > 5%.

---

## Follow-up (P3)

- [ ] Add `/settings/hardware` to Lighthouse URL list when bundle stabilises
- [ ] Track Rolldown plugin timing regressions (`PLUGIN_TIMINGS` in build log)
- [ ] Consider `prefers-reduced-motion` preset for a11y perf correlation
