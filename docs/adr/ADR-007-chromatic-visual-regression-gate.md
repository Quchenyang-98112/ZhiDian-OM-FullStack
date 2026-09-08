# ADR-007: Chromatic Visual Regression Gate

- **Status:** Accepted
- **Date:** 2026-04-25
- **Deciders:** @qnbs
- **Supersedes:** Chromatic without `failOnChanges` (unblocking, advisory only)

## Context

Storybook 10 is configured with co-located `*.stories.tsx` files. The `chromatic.yml` workflow
exists but currently:

- Publishes Storybook snapshots to Chromatic
- Does **not** fail PRs on visual changes (`failOnChanges: false` or unset)
- Has no Interaction Tests (Playwright Component Testing)

This means visual regressions in components (theme changes, layout shifts, broken animations) go
undetected until manual review or user reports.

## Decision

Configure Chromatic as a **mandatory visual regression gate**:

1. **`failOnChanges: true`** — any unreviewed visual change blocks merge
2. **Interaction Tests** — add `@storybook/addon-interactions` for automated component behavior
3. **Scope control** — stories tagged `@chromatic-skip` excluded from CI (e.g., animation-heavy)
4. **Token requirement** — `CHROMATIC_PROJECT_TOKEN` GitHub Secret must be set

### CI integration

```yaml
# chromatic.yml
- uses: chromaui/action@v11
  with:
    projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
    buildScriptName: build-storybook
    exitOnceUploaded: false      # wait for checks
    onlyChanged: true            # TurboSnap — only diff changed components
    exitZeroOnChanges: false     # fail on unreviewed changes
```

### When to approve vs reject

| Change type | Action |
|-------------|--------|
| Intentional theme/design update | Approve in Chromatic UI |
| Unexpected layout shift | Reject, fix component |
| Snapshot diff from different render | Accept or mark as stale |
| New story (first snapshot) | Auto-approve (baseline) |

## Rationale

- **Design system protection** — catches glass-panel, neon-glow, fluid-typography regressions
- **5 themes** — ensures all Tailwind v4 `@theme` tokens render correctly across themes
- **TurboSnap** — only processes changed components; fast on incremental builds
- **Interaction Tests** — replaces manual browser testing of component interactions

## Consequences

**Positive:**
- Visual regressions caught before merge
- Design system changes require explicit approval
- Interaction tests run as part of CI (no separate browser needed)

**Negative:**
- Requires Chromatic account and `CHROMATIC_PROJECT_TOKEN` secret
- First-run snapshot baseline building takes ~10–20 min
- All unreviewed changes block PRs until approved

## Setup Instructions

1. Create Chromatic project at https://www.chromatic.com/
2. Add `CHROMATIC_PROJECT_TOKEN` to GitHub repository secrets
3. Run first baseline: `pnpm chromatic --project-token=<token>`
4. Subsequent PRs: automatic via `chromatic.yml`

## Related Files

- `.github/workflows/chromatic.yml` — CI workflow
- `apps/web/.storybook/main.ts` — Storybook config
- `apps/web/.storybook/preview.ts` — global decorators
- `apps/web/src/components/**/*.stories.tsx` — component stories
