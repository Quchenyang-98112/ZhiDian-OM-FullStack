# Settings & Help — Perfection Plan (Post-Audit Delta)

**Date:** 2026-07-05  
**Baseline:** `main` @ v1.10.0 (`4748342`) — Command Palette Phase 5a merged  
**Prior audit:** `docs/Settings-Help-Audit-2026-07-04.md`  
**Remediation shipped:** CHANGELOG Phase 1–4 (#260) — import validation, HA UI, Help refactor, adapter save wire-up

This document supersedes the *roadmap section* of the 2026-07-04 audit with an honest
post-remediation delta, a perfection vision, phased execution plan, technical specification,
and maintenance rules.

---

## 1. Executive summary

Settings and Help were heavily remediated in the v1.10.0 wave. **Critical correctness gaps
(C1–C3, H1–H4) are largely closed.** Help was refactored from a monolith into modular panels
with working deep links, keyboard navigation, and `package.json` version sourcing.

**Remaining perfection work** clusters into five themes:

| Theme | Severity | Examples |
|-------|----------|----------|
| Read-Only Mode breadth | High | Banner exists; many hardware inputs still editable |
| Adapter/HA config round-trip | High | Save works; UI does not hydrate from registry/credentials |
| URL state sync | Medium | Settings `?tab=` and Unified `?section=` mount-only `useState` |
| Help content depth | Medium | Glossary/integration gaps for contrib protocols; FAQ version interpolation |
| Extensibility & a11y polish | Medium–Low | Search index manual; contrib adapter settings pattern; SR semantics |

---

## 2. Updated audit report (delta vs 2026-07-04)

Legend: ✅ Fixed · ⚠️ Partial · ❌ Open · ➖ Deferred (unchanged)

### 2.1 Critical (P0)

| ID | Finding | Status | Evidence / notes |
|----|---------|--------|------------------|
| **C1** | Settings import unvalidated | ✅ Fixed | `settings-transfer.ts` + `stored-settings-schema.ts` Zod `.strict()` on import ✅; `store.ts` `persist.merge` uses `sanitizePersistedSettings()` (#276) ✅ |
| **C2** | AdapterConfigPanel Save no-op | ✅ Fixed | Save pipeline + panel hydration from registry/credentials (#276); `adapter-config-panel-hydrate.test.ts` ✅ |
| **C3** | SystemTab MQTT dead inputs | ✅ Fixed | MQTT moved to `HomeAssistantSettingsSection` / `HaConnectionFields.tsx`; `SystemTab` shows live connection status only |

### 2.2 High (P0/P1)

| ID | Finding | Status | Evidence / notes |
|----|---------|--------|------------------|
| **H1** | Cosmetic global Save | ✅ Fixed | Removed from `Settings.tsx`; live `updateSettings` per field |
| **H2** | StorageTab dead button + fake stats | ✅ Fixed | `clearAllData()` + `getLocalStorageStats()` wired |
| **H3** | Hardcoded connection statuses | ✅ Fixed | `SystemTab.tsx` reads `useEnergyStore` adapter status + `wsConnected` |
| **H4** | `influxToken` masked default | ✅ Fixed | Default `''`; password field + session Dexie persist |
| **H5** | No Read-Only Mode in Settings | ⚠️ Partial | `ReadOnlySettingsBanner` + HA/adapter **save** blocked ✅; Controllers, Energy, EmergencyStop, adapter field inputs not disabled ❌ |
| **H6** | Stale Help content | ✅ Fixed | Version from `package.json` ✅; contrib glossary + integration in `help-content-manifest.ts` (#277/#279) ✅; FAQ `{ version }` in `HelpFaqPanel.tsx` ✅ |
| **H7** | Tab/section URL desync | ✅ Fixed | `Settings.tsx` + `SettingsUnified.tsx` use `useSearchParams` (#276) ✅; embedded Help preserves `section=help` via `applyHelpTabParam` ✅ |

### 2.3 Medium (P1/P2)

| ID | Finding | Status | Evidence / notes |
|----|---------|--------|------------------|
| **M1** | No HA discovery UI | ✅ Fixed | `HomeAssistantSettingsSection` + `HaEntityRolesEditor` + hydration (`homeassistant-settings-hydrate.ts`) (#277) ✅ |
| **M2** | `helpTab` deep-linking dead | ✅ Fixed | `PageCrossLinks` → `SetupProgressSection` → `/help?tab=…`; `Help.tsx` reads param |
| **M3** | Hardcoded Help strings | ⚠️ Partial | Protocol pills i18n ✅; `HelpHardwareRequirementsList` product names + `HelpAboutPanel` AI provider names still EN-hardcoded ❌ |
| **M4** | Manual search index subset | ✅ Fixed | `help-content-manifest.ts` drives search via `help-search-entries.ts` (#279) ✅ |
| **M5** | Help tab keyboard a11y | ✅ Fixed | `help-tab-keyboard.ts` + roving tabindex in `HelpTabNav.tsx` |
| **M6** | Adapter panel 5 types only | ⚠️ Partial | `settings-section-registry.ts` + HA template (#279) ✅; other contrib adapters lack per-instance config surface ❌ |
| **M7** | Missing component tests | ⚠️ Partial | `adapter-config-panel.test.tsx`, `adapter-config-panel-save.test.ts`, HA tests ✅; `CertificateManagement` still thin ❌ |
| **M8** | Mixed-language AdvancedTab fallbacks | ❌ Open | German inline defaults on EN keys |

### 2.4 Low (P2)

| ID | Finding | Status |
|----|---------|--------|
| **L1** | E2E gaps (theme persist, adapter activation, Help FAQ) | ❌ Open |
| **L2** | Help bespoke header vs `PageHeader` | ✅ Fixed | `HelpPageHeader` delegates to `PageHeader` (#279) |
| **L3** | Search `listbox` / `aria-live` | ✅ Fixed | `HelpSearchBox` combobox + `HelpSearchResultsPanel` + `isOpen` keyboard guard (#278/#279) |
| **L4** | EEBUS config split adapters vs certificates | ❌ Open (UX consolidation) |

**Deferred (unchanged):** Settings search across 11 tabs.

### 2.5 New findings (2026-07-05)

| ID | Finding | Severity | Notes |
|----|---------|----------|-------|
| **N1** | Embedded Help clobbers `section=help` | ✅ Fixed | `applyHelpTabParam(..., { embedded: true })` preserves `section=help` (#276) |
| **N2** | `faqWhatIsAnswer` renders `v{{version}}` literally | ✅ Fixed | `HelpFaqPanel.tsx` passes `{ version: appVersion }` (#277) |
| **N3** | Command Palette covers settings nav but not contextual help | ✅ Fixed | `help-commands.ts` adds per-tab `/help?tab=` shortcuts (Phase 5a, #280) |
| **N4** | `HardwareRegistryPage` vs Settings adapters overlap | Low | Two adapter entry points — document when to use which |

---

## 3. Vision — perfected Settings & Help

### Settings = professional control center

- Every control reflects **live system truth** (adapters, read-only, mock/live, health).
- **Validate → persist → confirm** on every path (import, adapter save, HA config).
- **Draft-free live persistence** with subtle saved feedback (current direction — keep).
- **Adapter-extensible**: contrib adapters register a settings section via a stable contract.
- **Safety-first**: Read-Only Mode disables or annotates every hardware-affecting control.

### Help = living knowledge base

- **Version-aware** content sourced from build metadata.
- **Deep-linkable** every tab and major section (`/help?tab=…#anchor`).
- **Search covers all user-facing help strings** (generated index).
- **i18n-complete** (EN + DE); no hardcoded product strings in components.
- **Contextual**: cross-links from every major route; optional contextual help from Settings fields.

---

## 4. Phased perfection roadmap

Stacked PRs; sequential local verification (`type-check` → `lint` → targeted tests).

### Phase 0 — Audit baseline ✅ (this document)

**Goal:** Honest delta audit + agreed roadmap.  
**Deliverables:** This file + stakeholder sign-off.  
**Success:** All P0 items classified; no unknown stale Help version strings.

### Phase 1 — Critical consistency & safety (P0 residual)

**Goal:** Close remaining correctness and safety gaps.

| Work item | IDs | Key files |
|-----------|-----|-----------|
| Zod-guard `persist.merge` hydration | C1 | `store.ts`, `stored-settings-schema.ts` |
| Adapter panel hydrate from registry/credentials | C2 | `AdapterConfigPanel.tsx`, `adapter-config-panel-save.ts` |
| Read-Only propagate to all hardware surfaces | H5 | `ControllersTab`, `EnergyTab`, `AdvancedTab`, `AdapterConfigEntrySection`, `EmergencyStop` |
| Settings URL sync via `useSearchParams` | H7 | `Settings.tsx`, `SettingsUnified.tsx` |

**Success metrics:**

- Import + corrupt localStorage cannot inject unknown keys.
- Adapter panel shows saved config after reload.
- With `READ_ONLY_MODE=true`, zero enabled hardware toggles in Settings.
- Browser back/forward updates Settings tab and Unified section.

**Risk:** Medium (read-only touches control-adjacent UI; no new hardware commands).

### Phase 2 — Completeness & accuracy (Help + HA)

**Goal:** Content truth-sync and HA panel completeness.

| Work item | IDs | Key files |
|-----------|-----|-----------|
| HA form hydration + `entityRoles[]` editor | M1 | `use-home-assistant-settings-form.ts`, new `HaEntityRolesEditor.tsx` |
| Glossary + integration sections for contrib protocols | H6 | `HelpLexiconPanel.tsx`, new integration sub-panels |
| Fix FAQ version interpolation | N2 | `HelpFaqPanel.tsx`, `help-search-entries.ts` |
| i18n hardware list + AI provider metadata | M3 | `HelpHardwareRequirementsList.tsx`, `HelpAboutPanel.tsx`, `en.ts`/`de.ts` |
| Embedded Help URL merge | N1 | `Help.tsx` `selectTab` preserves `section` when embedded |

**Success metrics:**

- HA round-trip: save → reload Settings → fields match registry.
- Glossary contains EEBUS, HA, Matter/Thread, evcc, OpenEMS, OpenADR.
- FAQ shows `v1.10.0` (not `v{{version}}`).
- `/settings?section=help&tab=faq` survives tab switches.

### Phase 3 — UX & accessibility excellence

**Goal:** WCAG 2.2 AA+ polish.

| Work item | IDs | Key files |
|-----------|-----|-----------|
| Help search combobox + `aria-live` | L3 | `HelpSearchBox.tsx` |
| Align `HelpPageHeader` with `PageHeader` | L2 | `HelpPageHeader.tsx`, `Help.tsx` |
| Normalize AdvancedTab i18n fallbacks | M8 | `AdvancedTab.tsx` |
| Field-level save/error toasts consistency | — | all `*Tab.tsx` |
| Mobile tab scroll + focus management audit | — | `Settings.tsx`, `HelpTabNav.tsx` |

**Success metrics:**

- axe / `test:a11y` clean on Settings + Help.
- Screen reader announces search result count.
- `#main-content h1` pattern consistent on standalone Help.

### Phase 4 — Extensibility & future-proofing

**Goal:** Patterns for new adapters and settings without monolith growth.

| Work item | IDs | Key files |
|-----------|-----|-----------|
| `AdapterSettingsSection` contract (contrib) | M6 | `core/adapters/settings-section-registry.ts` (new) |
| Generate help search index from manifest | M4 | `help-content-manifest.ts`, `help-search-entries.ts` |
| Contrib adapter settings plugins (HA template) | M6 | `contrib/*` adapters |
| EEBUS pairing flow consolidation | L4 | `CertificateManagement.tsx`, `AdapterConfigPanel` |
| CertificateManagement unit tests | M7 | `tests/certificate-management.test.tsx` |

**Success metrics:**

- New contrib adapter can register a settings section in <50 LOC.
- Search finds any glossary term without manual index edit.
- EEBUS pairing documented in one coherent flow.

### Phase 5 — Integration & polish

**Goal:** Cross-app consistency and documentation.

| Work item | IDs | Key files |
|-----------|-----|-----------|
| Command Palette contextual help commands | N3 | `help-commands.ts` or extend `navigation-commands.ts` |
| E2E: settings tab deep links, Help FAQ, read-only banner | L1 | `tests/e2e/settings-navigation.spec.ts`, new Help spec |
| Update `FEATURE_STATUS.md`, ADR if settings contract added | — | docs |
| Settings/Help maintainer guide (below) | — | `docs/Settings-Help-Dev-Guide.md` |

**Success metrics:**

- E2E covers `/settings?tab=adapters`, `/help?tab=faq`, read-only banner visible.
- Command Palette: "Open Help — Troubleshooting" when adapter errors exist (mirrors AI suggest pattern).

---

## 5. Technical specification

### 5.1 Architecture (target state)

```
/settings                    → SettingsUnified (?section=)
  ├─ section=settings        → Settings (?tab=) — 11 tabs
  ├─ section=plugins         → PluginsPage
  └─ section=help            → Help (embedded, ?tab=)

/help                        → Help (standalone, ?tab=)

State:
  useAppStore.settings       → StoredSettings (Zod on import + merge)
  useAppStore (session)      → influxToken, adapterMode flags
  useEnergyStore.adapters    → runtime adapter config + status
  secure credential vault    → per-adapter secrets (Dexie)

Safety:
  useReadOnlyModeActive()    → disables hardware controls app-wide
  isLiveHardwareBuildAllowed → gates adapter connect on save
```

### 5.2 URL state contract (single source of truth)

| Route | Params | Driver |
|-------|--------|--------|
| `/settings` | `?tab=<tab>` | `useSearchParams` — no `useState` seed |
| `/settings` | `?section=plugins\|help` | `useSearchParams` |
| `/settings` | `?section=help&tab=<helpTab>` | merge on all `setSearchParams` |
| `/help` | `?tab=<helpTab>` | already `useSearchParams` in `Help.tsx` |

**Implementation pattern:**

```typescript
const [searchParams, setSearchParams] = useSearchParams();
const activeTab = resolveSettingsTab(searchParams.get('tab'));
const setTab = (tab: SettingsTab) => {
  const next = new URLSearchParams(searchParams);
  if (tab === 'appearance') next.delete('tab');
  else next.set('tab', tab);
  setSearchParams(next, { replace: true });
};
```

### 5.3 Read-Only Mode contract

```typescript
// lib/settings-read-only.ts (new)
export function useSettingsReadOnly(): boolean {
  return useReadOnlyModeActive();
}

// Apply to every hardware-affecting control:
<Button disabled={isReadOnly} aria-describedby={isReadOnly ? 'readonly-hint' : undefined} />
```

**Surfaces requiring gating (checklist):**

- [ ] `AdapterConfigPanel` — all inputs + enable toggle + remove
- [ ] `ControllersTab` — MPC/OCPP/EV control fields
- [ ] `EnergyTab` — tariff override actions
- [ ] `AdvancedTab` — Emergency Stop, live mode toggle
- [ ] `HomeAssistantSettingsSection` — partial ✅
- [ ] `CertificateManagement` — pairing actions

### 5.4 Adapter settings extensibility contract (Phase 4)

```typescript
// Proposed: apps/web/src/core/adapters/settings-section-registry.ts
export interface AdapterSettingsSection {
  adapterId: string;
  order: number;
  Component: React.ComponentType<{ adapterId: string; isReadOnly: boolean }>;
}

export function registerAdapterSettingsSection(section: AdapterSettingsSection): void;
```

Rendered inside `AdapterConfigPanel` or a new `ContribAdapterSettings` region — HA becomes
the reference implementation.

### 5.5 Help content manifest (Phase 4)

```typescript
// apps/web/src/lib/help-content-manifest.ts
export const HELP_CONTENT_MANIFEST = [
  { tab: 'faq', keys: ['help.faqWhatIs', 'help.faqWhatIsAnswer', ...] },
  { tab: 'lexicon', keys: ['help.lexicon.eebus', ...] },
] as const;

// help-search-entries.ts generates entries at build time or module init
```

### 5.6 Persistence validation layers

| Layer | Validation | On failure |
|-------|------------|------------|
| Import file | `storedSettingsImportSchema.strict()` | Reject + toast |
| localStorage merge | same schema `.partial().strict()` or full pick | Reset to defaults + warn |
| Adapter save | `adapter-config-schemas.ts` per type | Inline field errors |
| HA save | `homeassistantSettingsSchema` (extend) | Toast + no connect |

---

## 6. Help content structure (target)

```
help/
├── getting-started     Quick start, setup progress links
├── integration         Per-protocol setup (add sections):
│   ├── victron         (existing Cerbo/Venus)
│   ├── knx             (existing)
│   ├── homeassistant   NEW — WS API vs MQTT, entity roles
│   ├── eebus           NEW — pairing, trust store, certs tab link
│   ├── evcc / openems  NEW — REST/WS endpoints
│   ├── matter-thread   NEW — commissioning note
│   └── openadr         NEW — VEN client
├── features            Shipped feature cards + protocol chips ✅
├── lexicon             Terms for all 14 adapters + HEMS concepts
├── faq                 Mock/live, read-only, API, versioned answers
├── shortcuts           Keyboard + Command Palette (sync with palette registry)
├── troubleshooting     Per-adapter error patterns + read-only
└── about               Version from package.json, credits i18n, AI ack
```

**Anchor convention:** `id="help-<section>"` on each `HelpSectionShell` for future `#fragment` links.

---

## 7. Consistency rules (Settings ↔ Help ↔ Code)

1. **Version:** Always `import packageJson from '../../package.json'` — never hardcode in locales.
2. **Adapter count:** Help FAQ/features count must match `AdapterRegistry` built-in + contrib list.
3. **Read-Only:** If `mode.readOnlyBannerWarning` exists in UI, Help `faqReadOnly` must describe same behavior as `apps/api` `READ_ONLY_MODE`.
4. **Mock/Live:** Settings `AdvancedTab` labels must match Help `faqMockLive` and header simulation badge.
5. **Deep links:** Every `page-relations.ts` `helpTab` value must exist in `VALID_HELP_TABS`.
6. **i18n:** New user string → `en.ts` + `de.ts` same key path; English inline fallback only.
7. **Command Palette:** New settings route → add `navigation-commands.ts` entry same release.
8. **Safety:** Settings control that sends hardware command → must use `useSafeCommand` or backend gate; document in Help troubleshooting.

---

## 8. Developer guide — extending Settings & Help

### Add a Settings tab

1. Add key to `SettingsTab` union in `SettingsTabPanels.tsx`.
2. Add entry in `settings-tab-definitions.tsx`.
3. Create `components/settings/MyTab.tsx`; wire in `SettingsTabPanels.tsx`.
4. Add any new fields to `StoredSettings` + `stored-settings-schema.ts`.
5. i18n: `settings.myTab*` in EN + DE.
6. Tests: extend `settings-tabs.test.tsx`.
7. Optional: `navigation-commands.ts` + `page-relations.ts` cross-links.

### Add a contrib adapter settings section

1. Implement `AdapterSettingsSection` (Phase 4 registry) or extend HA pattern.
2. Zod schema in `adapter-config-schemas.ts`.
3. Save via `saveAdapterPanelEntry` pattern or dedicated save module.
4. Help: integration subsection + glossary term + FAQ if user-facing.
5. `FEATURE_STATUS.md` row update.

### Add Help content

1. Add i18n keys under `help.*` (EN + DE).
2. Add panel section component under `components/help/panels/`.
3. Register in `help-tab-definitions.tsx` if new tab (rare).
4. Add keys to `help-content-manifest.ts` for search (Phase 4).
5. Test: panel render smoke in `help-panels-cross-links.test.tsx` or dedicated test.

### Settings import/export

- Export: `triggerSettingsExport` — never include secrets (`influxToken` excluded by design).
- Import: always `parseStoredSettingsImport` — never `updateSettings(raw)`.

---

## 9. Final validation checklist

### Settings

- [ ] Import rejects invalid JSON, unknown keys, out-of-range values
- [ ] Import accepts valid fixture; fields appear in UI
- [ ] Export → import round-trip (minus secrets)
- [ ] localStorage corrupt blob resets safely
- [ ] Each tab: all inputs bound to store or adapter state
- [ ] Adapter save persists; reload shows same config
- [ ] HA save + reconnect in mock mode; blocked in read-only
- [ ] `READ_ONLY_MODE=true`: banner visible; hardware controls disabled
- [ ] `?tab=` deep links work; back/forward syncs tab
- [ ] `?section=help&tab=` preserved on Help tab change
- [ ] Storage clear cache works with confirm
- [ ] Storage stats reflect real Dexie + `navigator.storage`

### Help

- [ ] `/help?tab=faq` lands on FAQ (standalone + embedded)
- [ ] PageCrossLinks setup progress opens correct help tab
- [ ] Version matches `package.json` on About
- [ ] FAQ answers include correct version string
- [ ] Glossary contains all shipped adapters
- [ ] Search finds new glossary terms (post Phase 4)
- [ ] Tab arrow keys + roving focus work
- [ ] Search announces results to screen readers
- [ ] No hardcoded EN strings in DE locale render
- [ ] axe clean on all 8 tabs

### Integration

- [ ] Command Palette opens settings tabs and help tabs
- [ ] Read-only state consistent: header banner = settings banner = command block
- [ ] `FEATURE_STATUS.md` matches Help feature cards
- [ ] `docs/Settings-Help-Audit-2026-07-04.md` cross-references this plan

### CI

- [ ] `pnpm type-check` + `pnpm lint`
- [ ] `settings-tabs`, `settings-export-import`, `adapter-config-panel*`, `help-*` tests
- [ ] E2E settings navigation + Help accessibility spec extensions
- [ ] Bundle size within budget (Help i18n additions monitored)

---

## 10. Recommended first PR (Phase 1 kickoff)

**Title:** `fix(settings): URL sync, persist validation, read-only gating (Phase 1a)`

**Scope (smallest high-impact slice):**

1. `Settings.tsx` + `SettingsUnified.tsx` → `useSearchParams` driven tabs/sections
2. `store.ts` persist merge → `storedSettingsImportSchema.safeParse` strip unknown
3. `Help.tsx` embedded `selectTab` → merge `section=help`
4. Tests for URL sync + merge validation

**Defer to Phase 1b:** Adapter panel hydration + full read-only gating (larger diff).

---

## References

- `docs/Settings-Help-Audit-2026-07-04.md` — original findings
- `CHANGELOG.md` — Phase 1–4 (#260) shipped items
- `apps/web/src/core/stored-settings-schema.ts` — import Zod
- `apps/web/src/core/adapter-config-panel-save.ts` — adapter save pipeline
- `apps/web/src/components/settings/HomeAssistantSettingsSection.tsx` — HA UI
- `apps/web/src/pages/Help.tsx` — modular help orchestrator
- `docs/Safety-Certification-Notice.md` — read-only / live hardware policy
