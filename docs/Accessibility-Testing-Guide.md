# Accessibility Testing Guide — Nexus-HEMS-Dash

> **Standard:** WCAG 2.2 AA (mandatory) · WCAG 2.2 AAA (target)
> **Status:** Active
> **Last Updated:** 2026-07-01

This guide covers automated and manual accessibility testing for Nexus-HEMS-Dash, including
WCAG criteria, tooling, browser/AT combinations, and test checklists.

---

## Automated Testing (CI)

### axe-core via Playwright

All 9 unified sections are scanned on every CI run:

```typescript
// apps/web/tests/e2e/accessibility.spec.ts
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const route of routes) {
  test(`${route} - no automatic WCAG 2.2 AA violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS_AA).analyze();
    expect(results.violations).toEqual([]);
  });
}
```

### WCAG AAA Supplemental Scan

```typescript
// apps/web/tests/e2e/accessibility.spec.ts (WCAG 2.2 AA — canonical E2E a11y gate)
// Optional AAA tags can be added locally: 'wcag2aaa', 'wcag21aaa'
const WCAG_TAGS_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Known AAA criteria for energy dashboards:
// 1.4.6 Contrast Enhanced (7:1 ratio)
// 2.4.9 Link Purpose — every link has unique purpose without context
// 2.5.5 Target Size Minimum — 44×44 CSS px for all interactive elements
// 3.1.3 Unusual Words — glossary available (implemented in /help)
// 3.3.4 Error Prevention — form submissions have confirmation steps
```

---

## Manual Testing Checklist

### Keyboard Navigation

- [ ] Skip-to-content link visible on first Tab press
- [ ] All navigation items reachable with Tab/Arrow keys
- [ ] Focus visible on all interactive elements (`.focus-ring:focus-visible`)
- [ ] Modal dialogs trap focus (Radix Dialog natively; custom modals/sheets via
      the shared `useFocusTrap` hook — `CommandPalette`, `MobileNavigation`)
- [ ] `Escape` closes all modals/dropdowns
- [ ] Command palette (Cmd+K / Ctrl+K) openable and closeable via keyboard
- [ ] Theme switcher operable via keyboard
- [ ] Sankey diagram has an sr-only data-table alternative + `aria-live` updates
- [ ] Historical chart (Recharts) has an sr-only data-table alternative

### Color & Contrast — measured per-theme verification

Measured WCAG 2.x contrast ratios for the key token pairs, computed from the
theme values in `apps/web/src/index.css` (sRGB relative-luminance formula).
**Verified 2026-07-01.** Body text and button labels target AA 4.5:1; the
safety-critical `danger`/`live` surfaces target ≥7:1.

| Theme | text / bg | muted / bg | on-primary / primary | danger-fg / bg |
|-------|:---------:|:----------:|:--------------------:|:--------------:|
| `ocean-dark` | 15.4 | 7.3 | 9.4 | 9.8 |
| `energy-dark` | 16.3 | 7.2 | 15.1 | 9.7 |
| `nature-green` | 15.2 | 7.0 | 11.2 | 9.4 |
| `solar-light` | 13.9 | 7.2 | 6.5 | 7.9 |
| `minimal-white` | 17.7 | 4.8 | 17.7 | 8.3 |

All pairs ≥ 4.5:1 (AA) in every theme; `danger-fg` ≥ 7:1 in every theme
(light-theme `--state-danger-fg` uses red-800 `#991b1b` to clear the safety
target). `warning`/`success`/`info` text pairs range 4.8–12.9:1 (AA in all
themes; AAA in the three dark themes).

**Theme-independent state solids** (`-on` text on solid `-bg`):

| Pair | Ratio | Target |
|------|:-----:|:------:|
| `danger-on` / `danger-bg` (white on `#dc2626`) | 4.8 | 4.5 |
| `warning-on` / `warning-bg` (`#1c1206` on `#f59e0b`) | 8.6 | 4.5 |
| `success-on` / `success-bg` (white on `#047857`) | 5.5 | 4.5 |
| `info-on` / `info-bg` (white on `#0369a1`) | 5.9 | 4.5 |
| `live-on` / `live-bg` (white on `#b91c1c`) — real-hardware banner | 6.5 | 6.0 |
| `offline-on` / `offline-bg` (white on `#c2410c`) | 5.2 | 4.5 |

> Re-verify after any token change by re-running the sRGB contrast computation
> over the `[data-theme='…']` blocks in `index.css`, or via `pnpm storybook` →
> addon-a11y panel → color-contrast rule. The CI axe scan
> (`accessibility.spec.ts`) also enforces `color-contrast` on the live DOM.

### Screen Reader Testing Matrix

| Criterion | Tool | Platform | Target result |
|-----------|------|----------|---------------|
| Navigation landmarks | VoiceOver | macOS Safari | All 7 nav items announced |
| Sankey diagram | NVDA | Windows Firefox | "Energy flow" role=img + description announced |
| EV charging controls | JAWS | Windows Chrome | Control type, label, and state announced |
| Real-time updates | VoiceOver | macOS Safari | ARIA live region announces at ≤5 s intervals |
| Error messages | NVDA | Windows Firefox | `role="alert"` — announced immediately |
| Loading states | VoiceOver | macOS Safari | `aria-busy="true"` conveyed |
| Progress indicators | JAWS | Windows Chrome | `role="progressbar"` + `aria-valuenow` read |

---

## VoiceOver Testing (macOS)

### Setup

1. Enable VoiceOver: `Cmd + F5` or System Settings → Accessibility → VoiceOver
2. Open Safari (VoiceOver + Safari = best macOS a11y combo)
3. Navigate to `http://localhost:5173/`

### Test Script

```
1. Press Cmd+F5 → VoiceOver starts
2. Tab → should hear "Skip to main content" link
3. Activate skip link → focus moves to main content
4. Press Ctrl+Option+U → Web Rotor opens
5. Check Landmarks: header, nav, main, complementary sections present
6. Navigate to /energy-flow → Sankey should announce title + description
7. Navigate to /devices → device cards should have full label + status
8. Open theme dropdown → VoiceOver should read all 5 theme options
9. Activate Command Palette (Cmd+K) → focus moves to search input
10. Close with Escape → focus returns to trigger element
```

### Expected Announcements

| Element | Expected VoiceOver output |
|---------|--------------------------|
| Skip link | "Skip to main content, link" |
| Sidebar nav item | "Energy Flow, navigation, link" |
| PV power card | "Solar Generation, 4.2 kW, status" |
| Sankey diagram | "Energy flow diagram, image, Shows current energy flow: 4.2 kW Solar…" |
| EV charging toggle | "EV Charging Strategy, collapsed, button" |
| Loading spinner | "Loading, busy" |
| Error banner | "Error: Connection failed. Retrying in 30 seconds., alert" |

---

## NVDA Testing (Windows)

### Setup

1. Download NVDA from https://www.nvaccess.org/
2. Install and start NVDA (Insert+N)
3. Open Firefox (NVDA + Firefox = best Windows a11y combo)
4. Navigate to `http://localhost:5173/`

### Test Script

```
1. NVDA starts → Firefox announces page title "Nexus-HEMS Dashboard"
2. Press H → cycle through headings (should find: Nexus-HEMS, Command Center, sections)
3. Press L → cycle through landmarks
4. Press Tab → all interactive elements reachable
5. Navigate to Tariffs page → live price should update with aria-live announcement
6. Open Settings → language dropdown → cycle with Arrow keys, selection announced
7. Test form inputs → labels associated correctly via aria-labelledby or for/id
```

---

## JAWS Testing (Windows)

### Setup

1. Download JAWS trial from https://www.freedomscientific.com/
2. Start JAWS → open Chrome
3. Navigate to app URL

### Key Commands

| Action | JAWS command |
|--------|-------------|
| Read page | Insert+Down |
| List headings | Insert+F6 |
| List links | Insert+F7 |
| List form fields | Insert+F5 |
| Read current element | Insert+Num Pad 5 |
| Stop speaking | Ctrl |

---

## WCAG 2.2 Success Criteria Reference

### Level AA (Mandatory — all must pass)

| SC | Criterion | Implementation |
|----|-----------|---------------|
| 1.1.1 | Non-text Content | All icons: `aria-hidden="true"` on decorative; `aria-label` on functional |
| 1.3.1 | Info and Relationships | Semantic HTML: nav, main, header, section, article |
| 1.3.3 | Sensory Characteristics | Instructions don't rely on shape/color/position alone |
| 1.4.1 | Use of Color | Color never the only means of conveying information |
| 1.4.3 | Contrast (Minimum) | 4.5:1 for text, 3:1 for large text |
| 1.4.4 | Resize Text | 200% zoom without content/functionality loss |
| 1.4.10 | Reflow | Single column at 320px width |
| 1.4.11 | Non-text Contrast | UI components 3:1 against adjacent colors |
| 1.4.12 | Text Spacing | No loss of content with 1.5× line height etc. |
| 1.4.13 | Content on Hover or Focus | Hover/focus content dismissible, hoverable, persistent |
| 2.1.1 | Keyboard | All functionality via keyboard |
| 2.1.2 | No Keyboard Trap | Focus not trapped (except intentional modal) |
| 2.4.1 | Bypass Blocks | Skip-to-content link |
| 2.4.2 | Page Titled | Unique `<title>` per page |
| 2.4.3 | Focus Order | Logical focus sequence |
| 2.4.4 | Link Purpose | Link text meaningful in context |
| 2.4.6 | Headings and Labels | Descriptive headings and labels |
| 2.4.7 | Focus Visible | Focus indicator visible (`.focus-ring:focus-visible`) |
| 2.5.3 | Label in Name | Accessible name includes visible label text |
| 2.5.8 | Target Size (WCAG 2.2) | Interactive targets ≥24×24 CSS px |
| 3.1.1 | Language of Page | `<html lang="de">` / `lang="en"` set correctly |
| 3.1.2 | Language of Parts | Language changes marked with `lang` attribute |
| 3.2.1 | On Focus | No context change on focus |
| 3.2.2 | On Input | No unexpected context change on input |
| 3.3.1 | Error Identification | Form errors identified and described in text |
| 3.3.2 | Labels or Instructions | All inputs have labels |
| 4.1.2 | Name, Role, Value | All UI components have proper ARIA |
| 4.1.3 | Status Messages | Status messages via `aria-live` (WCAG 2.1) |

### Level AAA (Target — best effort)

| SC | Criterion | Status |
|----|-----------|--------|
| 1.4.6 | Contrast Enhanced (7:1) | Body text ≥7:1 in all 5 themes; `danger`/`live` safety surfaces ≥7:1 in all themes (see contrast table) |
| 2.4.9 | Link Purpose (Link Only) | All links unique without surrounding context |
| 2.5.5 | Target Size (44×44 px) | AA 2.5.8 (24×24) enforced in CI; most primary buttons also meet the AAA 44×44 |
| 3.1.3 | Unusual Words | Glossary in /help page |
| 3.3.4 | Error Prevention | Confirmation dialogs for destructive actions |

---

## Automated Coverage Summary

axe-core rules tested per page — **no rules disabled**. `target-size`
(WCAG 2.2 AA 2.5.8) is enforced across all routes as of 2026-07-01; the scan runs
the full AA rule set:

```typescript
const WCAG_TAGS_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// No .disableRules(...) — target-size now passes on every route.
```

| Page | WCAG 2.2 AA | axe violations target |
|------|------------|----------------------|
| `/` CommandHub | Full scan | 0 |
| `/energy-flow` | Full scan | 0 |
| `/devices` | Full scan | 0 |
| `/optimization-ai` | Full scan | 0 |
| `/tariffs` | Full scan | 0 |
| `/analytics` | Full scan | 0 |
| `/monitoring` | Full scan | 0 |
| `/settings` | Full scan | 0 |
| `/help` | Full scan | 0 |

---

## Reporting & Tracking

Open accessibility issues with label: `a11y`, scope tag from: `sankey`, `floorplan`, `ui`, `settings`, etc.

Reference WCAG Success Criterion number in issue title: e.g., "a11y: 2.4.7 Focus visible missing on EV control button".

Automated violations from CI always include axe rule ID + impact level.
