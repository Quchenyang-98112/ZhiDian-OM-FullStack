# Settings & Help — Comprehensive Audit Report

**Date:** 2026-07-04
**Scope:** `apps/web` Settings (`/settings`, `/settings/*`) and Help (`/help`) areas.
**Status:** Audit deliverable only — **no functional code changes** accompany this report.

## Context

After large refactors (extraction of `NotificationsTab`, `SystemTab`, `SecurityTab`,
`StorageTab`, `PWASettingsSection`, …) and new protocol support (EEBUS, Home Assistant,
evcc, OpenEMS, Matter/Thread, extended device registry), the **Settings** and **Help**
areas were audited end-to-end. This document lists severity-ranked findings with exact
file/line references, a recommended remediation for each, and a gated, stacked-PR roadmap
for when execution is approved.

**Recorded execution preferences** (for the future remediation phases): the
`AdapterConfigPanel` no-op Save should be **fully wired incl. activation**; in-scope
extensions are the **Home Assistant discovery UI**, **Read-Only-mode gating**, and **Help
deep-linking + content refresh**. A **Settings search** across tabs is **deferred**.

**Method:** three read-only exploration passes mapped (1) the Settings shell + tabs, (2) the
Help page, (3) cross-cutting tests / adapter integration / design-system primitives.
Findings were spot-verified against the live code.

## Architecture recap (as-built)

- `/settings` → `SettingsUnified.tsx` (section shell: `?section=settings|plugins|help`,
  lazy-loads `Settings`, `PluginsPage`, `Help`).
- Tabs live in `pages/Settings.tsx` (`?tab=` with 11 tabs), rendering an `AnimatePresence`
  if-chain. Tab bodies: `components/settings/*` plus `AdapterConfigPanel.tsx` (adapters),
  `CertificateManagement.tsx` (certificates/EEBUS), `AISettingsPage.tsx` (ai).
- `/help` → `Help.tsx` (`Help({ embedded })`), a single ~1,395-line file with 8 internal
  tabs; also embedded as the `help` section of `SettingsUnified`.
- Store: `useAppStore` (`store.ts`) + `StoredSettings` (`types.ts:211-278`); writes via
  `updateSettings(partial)` → live Dexie persist. There is **no `useEnergyStore` by that
  name**; energy data lives on `useAppStore.energyData` +
  `core/adapters/adapter-registry.ts`.
- **No Zod anywhere for settings.** Adapter Zod schemas exist
  (`core/adapter-config-schemas.ts`) but are imported by nobody.

## Findings by severity

### 🔴 CRITICAL (P0 — correctness / security)

**C1 — Settings import is unvalidated (arbitrary object merged into store).**
`pages/Settings.tsx:146-154`: `JSON.parse(text)` → `typeof === 'object'` check only →
`updateSettings(data)`. Has a 1 MB size guard + array rejection, but **no field/type
validation**, so a crafted file injects arbitrary keys/types into `StoredSettings` (which is
then persisted and deep-merged over defaults on every load).
→ *Fix:* author a `StoredSettings` Zod schema (new, in `packages/shared-types` or
`apps/web/src/core/`), `safeParse` on import, reject/report invalid; reuse for the
`persist.merge` path.

**C2 — AdapterConfigPanel "Save" is a no-op.**
`components/AdapterConfigPanel.tsx:752-755`: `handleSave` only flashes a "saved" badge — it
does **not** persist, does **not** call `AdapterRegistry`, and never uses the Zod schemas
(`validateAdapterCredentials`/`eebusConfigSchema`). All adapter config is transient
`useState`. EEBUS config is additionally **split** across this panel (SKI/cert/key,
`:1189-1290`) and the `certificates` tab (`CertificateManagement.tsx` live SHIP pairing).
→ *Fix (chosen: FULL WIRE):* validate via the existing schemas → persist config →
`createRegisteredAdapter` / `enableAdapter` through the registry, **gated by the
live-hardware guardrails** (`lib/adapter-mode.ts` `isLiveHardwareBuildAllowed()`; mock path
stays safe). This touches the control path → **its own PR + careful human review**
(CLAUDE.md safety rule). Add the missing `AdapterConfigPanel` unit test.

**C3 — SystemTab MQTT inputs are dead.**
`components/settings/SystemTab.tsx:170-214`: broker URL / port / username / password inputs
have **no `value`/`onChange`** (placeholder/`defaultValue` only) — MQTT/Home-Assistant
connection settings cannot be saved. Only the `mqttAutoDiscovery` toggle (`:223-228`) is
wired.
→ *Fix:* bind to store fields (add typed keys to `StoredSettings`) or fold into the new HA
discovery UI (see M1). Validate port range.

### 🟠 HIGH (P0/P1)

**H1 — Global Save button is cosmetic/misleading.** `Settings.tsx:89-93` `handleSave` only
flashes "Saved"; real persistence is already live via `updateSettings`. The prominent Save
button (`:520-529`) implies unsaved state that doesn't exist. → *Fix:* remove it, or adopt
an explicit draft→apply model. Recommend removal + a subtle "changes saved" affordance.

**H2 — StorageTab: dead button + fake stats.** "Clear local cache"
(`StorageTab.tsx:101-108`) has **no `onClick`**; storage stats (`:86-99`) are static
literals (`~2.4`, `847`, `30`). → *Fix:* wire clear-cache to the Dexie/`lib/db.ts` API (with
confirm dialog); compute real stats via `navigator.storage.estimate()` + Dexie counts.

**H3 — SystemTab connection statuses hardcoded.** `SystemTab.tsx:141-160` shows fixed
`true/false` per device. → *Fix:* derive from live adapter/registry state.

**H4 — `influxToken` default is a masked placeholder used as a real value.**
`store.ts:72` seeds `'••••••••••••••••'` as the actual token; the input renders/edits the
bullets literally. → *Fix:* default to empty; mask via input type/visibility toggle only.

**H5 — No `READ_ONLY_MODE` reflection in the Settings UI.** *(chosen extension)* Backend
`READ_ONLY_MODE` (SAF-05) exists (`apps/api/src/config/read-only-mode.ts`,
`lib/adapter-mode.ts`) but **no settings input is disabled/annotated** when active; the
`AdvancedTab` adapter-mode badge (`:305-346`) doesn't gate anything. → *Fix:* read read-only
state, disable + annotate all hardware-control inputs, show a banner.

**H6 — Help content is stale.** *(chosen extension: content refresh)* Version hardcoded
**v1.6.1** vs shipped **1.9.0** (`help.version`, `help.versionFull`, `aboutDesc`,
`aboutSubtitle` in `locales/en.ts` ~872/1124/899/935). No Integration-Guide / glossary / FAQ
coverage for **EEBUS, Home Assistant, Matter/Thread, evcc, OpenEMS, OpenADR**; **Read-Only
mode is absent** from the entire `help.*` block; stale "Claude Opus 4" label
(`Help.tsx:1361`). → *Fix:* source version from `package.json`; add sections + glossary
terms; update model labels.

**H7 — Tab/section URL desync.** Both `SettingsUnified` (`?section=`) and `Settings`
(`?tab=`) seed active state from the URL **only on mount** (`useState`), so browser
back/forward that changes the param won't resync. Help has the same issue (see M2).
→ *Fix:* drive from `useSearchParams` (single source of truth).

### 🟡 MEDIUM (P1/P2)

**M1 — No Home Assistant discovery/config UI.** *(chosen extension)* Only a generic
`mqttAutoDiscovery` toggle exists; `HomeAssistantMQTTAdapter` config (`mode`
`ha-ws-api|mqtt-broker`, `baseUrl`, `entityRoles[]`, broker creds) is unreachable from
Settings. → *Fix:* dedicated HA panel wired to the contrib adapter via `loadContribAdapter`;
subsumes C3's MQTT fields.

**M2 — `helpTab` deep-linking is dead.** `page-relations.ts` defines a per-page `helpTab`,
but `PageCrossLinks.tsx:271` hardcodes `to="/help"` and never uses it; `Help.tsx` doesn't
read `useSearchParams`, so `/help?tab=faq` can't preselect a tab (always lands on
`getting-started`). *(chosen extension)* → *Fix:* `helpTab` → `/help?tab=…`; add
`useSearchParams` selection in Help.

**M3 — Hardcoded/English-only Help content.** Protocol pills (`Help.tsx:891-908`), hardware
bullets (`:346-350`), Credits (`:1334-1341`), AI-ack card names/providers (`:1352-1370`)
bypass `t()` — render identically in German. → *Fix:* move to i18n keys (EN + DE).

**M4 — Help search index is a hand-maintained ~10-entry subset** (`Help.tsx:124-147`) —
silently omits most sections. → *Fix:* generate the index from the content maps.

**M5 — Help tablist lacks roving-tabindex / arrow-key nav** (WAI-ARIA tabs pattern);
click/Enter only (`Help.tsx:224-250`). → *Fix:* add arrow-key handler + roving tabindex.

**M6 — AdapterConfigPanel hardcodes 5 types** (`victron|modbus|knx|ocpp|eebus`); contrib
adapters (HA, Zigbee2MQTT, Shelly, Matter, OpenADR, evcc, OpenEMS) have no per-instance
config surface beyond the wizard's host/port. → *Fix (with C2):* generalize or add contrib
config sections.

**M7 — No unit tests for `AdapterConfigPanel` or `CertificateManagement`** (only Storybook +
E2E render/axe). → *Fix:* add component tests (reuse the `settings-tabs.test.tsx` store/i18n
mock pattern).

**M8 — Mixed-language i18n default fallbacks in `AdvancedTab`** (German defaults on English
keys, e.g. `:229`, `:240`, `:357`). Resolves fine via locale files but violates the
English-default convention. → *Fix:* normalize inline defaults to English.

### 🟢 LOW (P2 — polish)

- **L1 — E2E gaps:** theme *persistence* round-trip, adapter activation end-to-end
  (`/settings/hardware` wizard → enable → `?tab=adapters`), language DE↔EN round-trip, EEBUS
  PIN dialog / cert import-revoke, Help FAQ interaction. (`tests/e2e/*`).
- **L2 — Help standalone header** is bespoke (`Help.tsx:165-182`) instead of the shared
  `PageHeader` (`#main-content h1`) pattern.
- **L3 — Help search results** lack `role="listbox"`/`aria-live` (no SR result-count
  announcement).
- **L4 — EEBUS config split** across `adapters` (SKI/cert) and `certificates` (pairing) tabs
  — consider consolidating for a coherent pairing flow.

**Deferred (out of scope):** Settings search across the 11 tabs.

## Recommended remediation roadmap (gated, stacked PRs)

Sequenced for this hardware (sequential local checks) and the ~100-file CodeAnt review cap;
i18n edits fan out (EN+DE) so Help gets its own PR. Each PR ends with the CodeAnt correction
loop to quiescent. This roadmap is advisory — each phase is planned in detail when its
execution is approved.

| Phase | Contents | Risk | Gate |
|---|---|---|---|
| **1 — P0 correctness** | C1 (Zod import validation + `StoredSettings` schema), C3 (MQTT wiring¹), H1 (Save honesty), H2/H3/H4 | Low (no control path) | type-check → lint → targeted tests; CI green |
| **2 — Adapter full-wire** | C2 + M6 (validate/persist/activate via registry behind live-hardware guardrails) + `AdapterConfigPanel` tests | **Higher (control path)** | mock-mode verified; no live activation without `ALLOW_LIVE_HARDWARE`; human review |
| **3 — Read-Only + HA UI** | H5 + M1 (M1 subsumes C3's MQTT fields) | Medium | inputs disabled under read-only; HA panel round-trips config |
| **4 — Help refresh + deep-linking** | H6, H7(help), M2, M3, M4, M5 | Low (i18n-heavy, own PR) | version from `package.json`; deep links work; a11y checks |
| **5 — Tests & polish** | M7, M8, L1–L4, H7(settings URL sync) | Low | CI green |

¹ C3 may be folded into Phase 3's HA discovery UI rather than fixed standalone in Phase 1.

**Reusable primitives (don't reinvent):** `ChoiceCardGroup` / `SelectField` / `Disclosure` /
`SgReadyModeSelector` (`components/ui/`), `useFocusTrap` (`lib/useFocusTrap.ts`),
`ToggleSwitch`, `ThemePreviewCard`, theme helpers (`lib/theme.ts`, `design-tokens.ts`),
adapter Zod schemas (`core/adapter-config-schemas.ts`), `hardware-adapter-map.ts`,
`AddAdapterWizard` activation flow. Test mock patterns: `tests/settings-tabs.test.tsx` (store
+ i18n echo mocks). Note `ChoiceCardGroup` holds internal state → controlled use needs a
`key` remount (as `SelectField` does).
