## Description

<!-- A clear and concise description of the changes in this PR. -->

Fixes #<!-- issue number -->

## Type of Change

- [ ] 🐛 Bug fix (non-breaking, fixes an issue)
- [ ] ✨ New feature (non-breaking, adds functionality)
- [ ] 💥 Breaking change (fix or feature that changes existing behavior)
- [ ] 📝 Documentation update
- [ ] ♻️ Refactor (no functional change)
- [ ] 🎨 Style / UI (CSS, layout, design)
- [ ] ⚡ Performance improvement
- [ ] 🔒 Security fix
- [ ] ♿ Accessibility (a11y)
- [ ] 🌐 Localization (i18n)
- [ ] 🧪 Tests
- [ ] 🔧 CI / Build / Tooling

## Checklist

### General

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my code
- [ ] My commit follows [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, etc.)

### Quality

- [ ] `pnpm type-check` — no TypeScript errors
- [ ] `pnpm lint` — zero Biome + ESLint warnings (`--max-warnings 0`)
- [ ] Existing tests pass
- [ ] I have written new tests for my changes (if applicable)

### Review quiescence (mandatory before merge)

- [ ] All required CI checks green on the **latest** commit
- [ ] All review bots finished on latest SHA (CodeRabbit, CodeAnt, DeepSource, etc.)
- [ ] **Zero** unresolved GitHub review threads (including nitpicks)
- [ ] CodeRabbit outside-diff comments fetched (`./scripts/fetch-coderabbit-outside-diff.sh <pr>`) and addressed
- [ ] Correction loop repeated until **no new actionable comments** on latest SHA ([runbook](docs/runbooks/pr-review-correction-loop.md))

### i18n / a11y (mandatory)

- [ ] All new user-facing strings are localized in both `apps/web/src/locales/de.ts` and `apps/web/src/locales/en.ts` using `t()`
- [ ] WCAG 2.2 AA: correct ARIA attributes, keyboard navigation, color contrast
- [ ] No hardcoded display strings in components

### Specific (if applicable)

- [ ] Sankey diagram / D3.js: not broken
- [ ] KNX floorplan: not broken
- [ ] Zustand store: new state added to `useAppStore` (UI/settings) or `useEnergyStore` (energy data)
- [ ] Adapter: implements `EnergyAdapter` interface
- [ ] PWA: offline functionality tested

## Screenshots / Demo

<!-- If applicable, add before/after screenshots or a short demo. -->

| Before | After |
| ------ | ----- |
|        |       |

## Additional Notes

<!-- Information for the reviewer: risks, open questions, dependencies. -->
