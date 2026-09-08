# Neo-Energy Design System

## 🎨 Color Tokens

### Primary Palette

- `neon-green`: `#22ff88` (Primary actions, success states)
- `electric-blue`: `#00f0ff` (Secondary elements, info states)
- `power-orange`: `#ff8800` (Accent elements, warnings)

### Backgrounds

- `deep-space`: `#07111f` (Dark mode backgrounds)
- `void-blue`: `#0c1f34` (Alternative dark surfaces)
- `midnight`: `#030712` (Night mode backgrounds)
- `polar-mist`: `#eaf7ff` (Light mode backgrounds)
- `solar-sand`: `#fff3dc` (Light mode surfaces)

### Semantic State / Severity Tokens

For status, validation, alert and safety surfaces — **always prefer these over raw
`red/amber/emerald` Tailwind utilities** so colours stay theme-aware and meet WCAG
contrast. Defined as CSS custom properties in `index.css` (`:root` dark defaults; the
two light themes override the `*-fg`), and mirrored as `stateSeverities` in
`design-tokens.ts`. Severities: `danger`, `warning`, `success`, `info`, `live`, `offline`.

Each severity exposes four roles:

| Role | CSS var | Use |
| :--- | :--- | :--- |
| `-fg` | `--state-danger-fg` | text/icon on a **neutral** surface or a low-opacity tint (theme-tuned; ≥4.5:1) |
| `-on` | `--state-danger-on` | text/icon on the **solid** `-bg` (buttons/banners; danger/live ≥6:1) |
| `-bg` | `--state-danger-bg` | solid action/fill colour, or a tint via `/10`–`/20` opacity |
| `-border` | `--state-danger-border` | accent border for tinted areas (strengthened under `high-contrast`) |

```tsx
// tinted status badge
<span className="border border-(--state-success-border) bg-(--state-success-bg)/10 text-(--state-success-fg)">OK</span>
// solid action button
<button className="bg-(--state-danger-bg) text-(--state-danger-on) hover:opacity-90">Delete</button>
```

> The older `--badge-{ok,warn,danger,info}-fg` tokens are the `-fg` ancestors of this
> family and remain valid. `EmergencyStop` deliberately keeps its own deep-red ramp
> (it must read unmistakably red in every theme).

### Data-Visualisation Palette

Colours for **chart data identity** — deliberately **separate** from `--state-*`
(which conveys status/severity). Theme-tuned so every series/tier meets WCAG 1.4.11
non-text contrast (≥3:1) against the theme background: bright hues on dark themes,
darker hues on the two light themes.

| Family | Tokens | Use |
| :--- | :--- | :--- |
| Categorical series | `--chart-1` … `--chart-7` | Distinct data series (green/blue/orange/purple/pink/teal + `--chart-7` solar-gold for PV) |
| Price tiers | `--price-low` · `--price-mid` · `--price-elevated` · `--price-high` | Tariff cost windows, cheap → peak (4-stop heat scale) |

```tsx
// Recharts accepts CSS custom properties in stroke/fill:
<Area dataKey="pvProduction" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.19} />
<Line dataKey="price" stroke="var(--price-high)" />

// For tinted price-heat cells/legends, mix a tier token with transparency
// (Tailwind's `/opacity` modifier can't apply to a CSS-var colour):
style={{ backgroundColor: 'color-mix(in srgb, var(--price-elevated) 45%, transparent)' }}
```

> The price scale is a **4-stop heat ramp** (`low` → `mid` → `elevated` → `high`)
> so tariff visualisations (`TariffsPage` price bars, 7×24 heatmap, budget gauge)
> keep a smooth gradient; the `elevated` (orange) stop reuses the WCAG-verified
> `--chart-3` hues per theme.

> Chart **chrome** (grid, axes, tooltip) reuses the core `--color-*` tokens
> (`--color-border`, `--color-muted`, `--color-surface-strong`, `--color-text`)
> rather than bespoke values, so charts follow the active theme automatically.

### Foundation Scales (`index.css :root`)

Theme-independent scales — kept out of Tailwind's `@theme` so they don't override the
built-in `shadow-*` / `rounded-*` utilities. Use via arbitrary properties.

| Family | Tokens | Example |
| :--- | :--- | :--- |
| Elevation | `--shadow-sm` · `--shadow-md` · `--shadow-lg` · `--shadow-xl` | `shadow-(--shadow-md)` |
| Radius | `--radius-xs` (6px) · `sm` (8px) · `md` (12px) · `lg` (16px) · `xl` (24px) · `full` | `rounded-(--radius-xl)` |
| Motion duration | `--duration-fast` (.15s) · `--duration-normal` (.3s) · `--duration-slow` (.6s) | `duration-(--duration-fast)` |
| Motion easing | `--ease-standard` · `--ease-decelerate` · `--ease-accelerate` | `ease-(--ease-standard)` |

## Utility Classes

### Glassmorphism

```tsx
<div className="glass-panel">
  <!-- Rounded 3xl, backdrop-blur-3xl, theme-aware border -->
</div>
<div className="glass-panel-strong">
  <!-- Higher opacity, blur-3xl + bg-opacity for modals/dropdowns -->
</div>
<div className="glass-panel-hover">
  <!-- glass-panel + hover:bg-white/10 + transition for interactive cards -->
</div>
```

> **Performance & preferences.** The backdrop blur is capped at `blur(24px)` —
> past that the frosting is visually indistinguishable but the GPU cost keeps
> climbing (a real mobile budget hit). Under `@media (prefers-reduced-transparency:
> reduce)` (also what battery-saver / low-power devices signal) the glass surfaces
> drop the backdrop-filter entirely and paint a solid `--color-surface-strong`,
> matching the `html.high-contrast` and `forced-colors` fallbacks.

### Neon Glow Text

```tsx
<h1 className="neon-glow-green">Energy Flow</h1>
<h2 className="neon-glow-blue">Status</h2>
<span className="neon-glow-orange">Alert</span>
```

### Neon Borders

```tsx
<div className="neon-border-green"><!-- Green glow border --></div>
<div className="neon-border-blue"><!-- Blue glow border --></div>
<div className="neon-border-orange"><!-- Orange glow border --></div>
```

### Animations

```tsx
<!-- Energy pulse (for live indicators) -->
<div className="energy-pulse">⚡</div>

<!-- Cyber shimmer (loading states) -->
<div className="cyber-shimmer">Loading...</div>

<!-- Skeleton loader -->
<div className="skeleton h-24 w-full" />
```

### Pattern Grid

```tsx
<div className="pattern-grid">
  <!-- Subtle grid pattern background -->
</div>
```

### Navigation

```tsx
<button className="nav-pill">Dashboard</button>
<button className="nav-pill nav-pill-active">Settings</button>
```

### Buttons

```tsx
<button className="btn-primary">Optimize Now</button>
<button className="btn-secondary">Cancel</button>
```

### Status Indicators

```tsx
<span className="status-indicator status-online" />
<span className="status-indicator status-offline" />
```

### Metric Cards

```tsx
<div className="metric-card">
  <h3>PV Generation</h3>
  <p>3.2 kW</p>
</div>
```

### Labels

```tsx
<span className="eyebrow">Live Data</span>
<span className="price-pill">0.18 €/kWh</span>
```

### Accessibility

```tsx
<!-- WCAG 2.2 AA compliant focus ring -->
<button className="focus-ring">Accessible Button</button>
```

## Themes

### Available Themes (5)

| Label         | ID              | Mode  | Aesthetic                                      |
| :------------ | :-------------- | :---- | :--------------------------------------------- |
| Ocean Deep    | `ocean-dark`    | Dark  | Deep ocean blues + neon accents **(default)**  |
| Energy Dark   | `energy-dark`   | Dark  | Vibrant greens + electric highlights           |
| Solar Light   | `solar-light`   | Light | Warm solar tones                               |
| Minimal       | `minimal-white` | Light | Ultra-clean minimalism with slate grays        |
| Forest        | `nature-green`  | Dark  | Forest greens + earth tones                    |

### Theme Features

- System preference detection (`prefers-color-scheme`)
- Animated dot-style theme switcher with spring transitions
- `isDark` property on each theme for conditional rendering
- `previewColors` for theme preview dots in the UI

### Theme Switching

```tsx
import { useAppStore } from '@/store';

function ThemeSwitcher() {
  const setTheme = useAppStore((state) => state.setTheme);

  return <button onClick={() => setTheme('solar-light')}>Switch to Light Mode</button>;
}
```

### CSS Variables

Each theme provides CSS variables:

- `--color-primary` - Primary brand color
- `--color-secondary` - Secondary brand color
- `--color-accent` - Accent color
- `--color-background` - Page background
- `--color-surface` - Card/panel backgrounds
- `--color-surface-strong` - Strong surface (modals, dropdowns)
- `--color-text` - Primary text color
- `--color-muted` - Muted/secondary text
- `--color-border` - Border color
- `--color-glow` - Glow effect color

### Using CSS Variables

```tsx
<div className="bg-(--color-background) text-(--color-text)">Dynamic theme-aware content</div>
```

## Spacing

### 8pt Grid System

All spacing values are multiples of 8 pt for visual rhythm:

| Token        | Value   | CSS Custom Property |
| :----------- | :------ | :------------------ |
| `space-xs`   | 4px     | `--space-xs`        |
| `space-sm`   | 8px     | `--space-sm`        |
| `space-md`   | 16px    | `--space-md`        |
| `space-lg`   | 24px    | `--space-lg`        |
| `space-xl`   | 32px    | `--space-xl`        |
| `space-2xl`  | 48px    | `--space-2xl`       |
| `space-3xl`  | 64px    | `--space-3xl`       |

### Extended Spacing

- `spacing-18`: `4.5rem`
- `spacing-88`: `22rem`
- `spacing-100`: `25rem`
- `spacing-112`: `28rem`
- `spacing-128`: `32rem`

### Border Radius

- `rounded-4xl`: `2rem`
- `rounded-5xl`: `2.5rem`

## ⏱️ Animations

### Keyframes

- `energy-pulse` - 2.5s infinite pulse (for live data indicators)
- `cyber-shimmer` - 2s infinite shimmer (loading states)
- `fade-in` - 0.45s ease-out
- `slide-up` - 0.4s ease-out
- `slide-down` - 0.4s ease-out
- `scale-in` - 0.35s ease-out

### Usage

```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.45 }}
  className="animate-fade-in"
>
  Content
</motion.div>
```

## Typography

### Fluid Type Scale

All headings and body text use `clamp()`-based fluid type — scales smoothly between viewport widths:

| Class             | Formula (clamp)                     | Approximate range |
| :---------------- | :---------------------------------- | :---------------- |
| `fluid-text-xs`   | `clamp(0.65rem, 1.5vw, 0.75rem)`   | 10.4 – 12px       |
| `fluid-text-sm`   | `clamp(0.75rem, 1.8vw, 0.875rem)`  | 12 – 14px         |
| `fluid-text-base` | `clamp(0.875rem, 2vw, 1rem)`       | 14 – 16px         |
| `fluid-text-lg`   | `clamp(1rem, 2.5vw, 1.125rem)`     | 16 – 18px         |
| `fluid-text-xl`   | `clamp(1.125rem, 3vw, 1.25rem)`    | 18 – 20px         |
| `fluid-text-2xl`  | `clamp(1.25rem, 4vw, 1.5rem)`      | 20 – 24px         |
| `fluid-text-3xl`  | `clamp(1.5rem, 5vw, 1.875rem)`     | 24 – 30px         |
| `fluid-text-4xl`  | `clamp(1.875rem, 6vw, 2.25rem)`    | 30 – 36px         |
| `fluid-text-5xl`  | `clamp(2.25rem, 8vw, 3rem)`        | 36 – 48px         |

### Font Families

- `font-sans`: Inter (body text)
- `font-mono`: JetBrains Mono (code, numbers)

### Usage

```tsx
<h1 className="font-sans text-4xl font-bold">Nexus-HEMS</h1>
<code className="font-mono text-sm">192.168.1.100</code>
```

## 🎯 Best Practices

1. **Always use CSS variables** for colors to ensure theme-switching works
2. **Use `.glass-panel`** for cards instead of custom styles
3. **Apply `.focus-ring`** to interactive elements for WCAG 2.2 AA compliance
4. **Use `.energy-pulse`** for real-time data indicators
5. **Apply `.cyber-shimmer`** or `.skeleton`\*\* for loading states
6. **Prefer `.btn-primary`** and `.btn-secondary`\*\* over custom button styles

## 📱 Responsive Design

### Mobile-First Breakpoints

- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

### Example

```tsx
<div className="p-4 sm:p-6 lg:p-8">
  <!-- Mobile: 1rem, Tablet: 1.5rem, Desktop: 2rem -->
</div>
```

---

## 🔍 Full Utility Class Audit (as of 2026-03-17)

### Actively Used Classes (24)

| Class                                                                                     | Usage                                            | Files                                                                         |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `glass-panel`                                                                             | Card/panel surfaces, backdrop-blur + gradient bg | LiveEnergyFlow, OptimizationAI, Monitoring, App, ConfirmDialog                |
| `glass-panel-strong`                                                                      | Higher-opacity surfaces (modals, overlays)       | LiveEnergyFlow, OptimizationAI, DevicesAutomation                             |
| `glass-panel-hover`                                                                       | Hover lift + glow transition for panels          | CSS-only definition, auto-applied via hover                                   |
| `energy-pulse`                                                                            | Pulsing dot/icon for live status                 | LiveEnergyFlow, Monitoring, DevicesAutomation, Analytics, Sidebar, CommandHub |
| `cyber-shimmer`                                                                           | Loading spinner gradient                         | App.tsx                                                                       |
| `metric-card`                                                                             | KPI/metric display cards                         | Monitoring, Analytics, CommandHub                                             |
| `btn-primary`                                                                             | Primary CTA buttons                              | Settings, AISettingsPage, NotFoundPage                                        |
| `btn-secondary`                                                                           | Secondary action buttons                         | AISettingsPage                                                                |
| `eyebrow`                                                                                 | Small uppercase label                            | LivePriceWidget, AIOptimizerPanel                                             |
| `price-pill`                                                                              | Tariff/price badge                               | LiveEnergyFlow, TariffsPage, App                                              |
| `focus-ring`                                                                              | WCAG 2.2 AA focus indicator                      | 20+ files (all interactive elements)                                          |
| `hover-lift`                                                                              | Subtle translateY on hover                       | LiveEnergyFlow, Monitoring, DevicesAutomation                                 |
| `header-accent-line`                                                                      | Gradient accent on sticky header                 | App.tsx                                                                       |
| `scrollbar-hide`                                                                          | Hide scrollbar (tabs, breadcrumbs)               | App, Settings, Help                                                           |
| `fluid-text-*`                                                                            | Responsive clamp-based typography                | All pages                                                                     |
| `pattern-grid`                                                                            | Subtle grid background                           | App.tsx main content                                                          |
| `energy-flow-path`                                                                        | SVG stroke animation for Sankey                  | SankeyDiagram                                                                 |
| `battery-charging` / `battery-discharging`                                                | Battery state animations                         | CommandHub                                                                    |
| `spotlight`                                                                               | Mouse-tracking radial gradient                   | NeonCard                                                                      |
| `gradient-border`                                                                         | Animated gradient border                         | NeonCard                                                                      |
| `sidebar-link` / `sidebar-link-active`                                                    | Sidebar nav item styles                          | Sidebar                                                                       |
| `z-sticky` / `z-modal` / `z-modal-backdrop` / `z-notification` / `z-priority` / `z-fixed` | Z-index layering system                          | App, PWAUpdateNotification, Onboarding, CommandPalette, MobileNavigation      |
| `cv-auto` / `cv-auto-sm` / `cv-auto-lg`                                                   | Content-visibility optimization                  | Monitoring, other pages                                                       |
| `reduced-motion` / `high-contrast` / `compact-mode` / `no-glow` / `no-animations`         | Accessibility overrides                          | Root-level toggle classes                                                     |

### Defined But Not Used in Components

| Class                                                           | Purpose                                                |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `neon-glow-green` / `neon-glow-blue` / `neon-glow-orange`       | Text shadow glow                                       |
| `neon-border-green` / `neon-border-blue` / `neon-border-orange` | Box shadow glow borders                                |
| `skeleton`                                                      | Shimmer loading placeholder                            |
| `nav-pill` / `nav-pill-active`                                  | Pill-shaped nav buttons                                |
| `status-indicator` / `status-online` / `status-offline`         | Status dot with ping                                   |
| `section-divider`                                               | Gradient horizontal rule                               |
| `hover-glow` / `hover-scale` / `hover-rotate`                   | Hover effect modifiers                                 |
| `text-gradient`                                                 | Gradient text fill                                     |
| `stagger-fade-in`                                               | Staggered entrance animation                           |
| `scroll-fade-in` / `scroll-scale-in`                            | Scroll-linked animations (`@supports scroll-timeline`) |
| `animated-underline`                                            | Animated underline on hover                            |
| `icon-float`                                                    | Gentle floating animation                              |

### Keyframe Animations (12)

`energy-pulse` · `energy-dash` · `stagger-item` · `btn-shimmer` · `ping` · `cyber-shimmer` · `scroll-fade-in` · `scroll-scale-in` · `battery-pulse-charging` · `battery-pulse-discharging` · `icon-float` · `pulse-slow`

### CSS Custom Properties (10 theme vars)

`--color-primary` · `--color-secondary` · `--color-accent` · `--color-background` · `--color-surface` · `--color-surface-strong` · `--color-text` · `--color-muted` · `--color-border` · `--color-glow`

### Static Color Tokens (@theme)

`--color-neon-green` · `--color-electric-blue` · `--color-power-orange` · `--color-deep-space` · `--color-void-blue` · `--color-polar-mist` · `--color-solar-sand` · `--color-midnight`

### Themes (5)

| Theme           | Label       | Dark | Preview                       |
| --------------- | ----------- | ---- | ----------------------------- |
| `energy-dark`   | Energy Dark | ✓    | `#22ff88` `#00d4e0` `#0a1520` |
| `ocean-dark`    | Ocean Deep  | ✓    | `#38bdf8` `#818cf8` `#0c1222` |
| `nature-green`  | Forest      | ✓    | `#4ade80` `#a3e635` `#0f1a12` |
| `solar-light`   | Solar Light | ✗    | `#0bbf73` `#0084ff` `#fef9ef` |
| `minimal-white` | Minimal     | ✗    | `#111827` `#6366f1` `#ffffff` |

### Container Queries

| Container       | Breakpoints                                    |
| --------------- | ---------------------------------------------- |
| `cq-kpi-grid`   | 32rem → 3 cols, 56rem → 5 cols                 |
| `cq-panel-grid` | 40rem → 2 cols, 64rem → 3 cols                 |
| `cq-card-grid`  | 24rem → 2 cols, 40rem → 3 cols, 56rem → 4 cols |

### Container Sizes (Tailwind)

`dashboard: 80rem` · `panel: 40rem` · `card: 24rem` · `sidebar: 16rem` · `kpi: 56rem`

---

## 🧩 Shared Primitives & Layout Shell

### Component primitives

Prefer these branded primitives (`apps/web/src/components/ui/`) over raw native controls so theme tokens and a11y wiring stay consistent:

- **`Disclosure`** — glass-panel expandable section with an a11y-safe trigger/actions split; the canonical building block for the Progressive Disclosure principle below. Used across Help, Command Hub, Monitoring, Plugins, Tariffs, adapter config and ErrorBoundary dev details.
- **`SelectField`** — styled wrapper around a native `<select>` (keeps native keyboard/mobile behaviour; restyled to the theme).
- **`ChoiceCardGroup`** — accessible radio-group rendered as selectable cards; replaces gray native pickers where options benefit from richer labels/descriptions (Settings, Analytics, Command Hub, Devices, Tariffs, AI settings, adapter config, command palette).
- **`SgReadyModeSelector`** — domain selector for heat-pump SG-Ready modes, built on `ChoiceCardGroup` + `lib/sg-ready.ts`.

All four keep user-visible strings in i18n (`t()`); the generic primitives receive already-translated text via props.

### Layout shell — fixed header

The app header is `position: fixed` (sidebar-aware via `lg:left-64`) with a JS-measured `--header-height` CSS variable that reserves exactly the matching top padding on the content column (`AppShell.tsx`, `index.css`). Do **not** revert it to `sticky`/`relative`, and avoid adding `position` utilities inside `@layer utilities` in `index.css` — by source order they can silently override Tailwind position classes (the root cause of the pre-fix scroll-away bug). A `prefers-reduced-transparency` solid fallback and a scroll-triggered elevation shadow are included; regression-guarded by `header-fixed.spec.ts`.

---

## 🏗️ Unified UI Principles v1

### 1. Progressive Disclosure

Reveal complexity gradually. Default views show summarized data; details expand on demand.

**Rules:**

1. **Level 0 — Glance**: Show the single most important metric per card (e.g. "3.2 kW"). Use `metric-card` or `live-metric`.
2. **Level 1 — Summary**: On hover or tap, reveal secondary details (trend arrow, %-change). Use `energy-card` with a collapsible details slot.
3. **Level 2 — Full Detail**: Expand into a modal, drawer, or dedicated page. Use `control-panel` with section headers.
4. **Never auto-expand** content that pushes other content off-screen on mobile.
5. **Lazy-load** Level 2 content; keep Level 0 data in the Zustand store for instant rendering.

```tsx
{/* Level 0 */}
<div className="metric-card">
  <span className="eyebrow">PV Generation</span>
  <span className="live-metric">3.2 kW</span>
</div>

{/* Level 1 — expands on click */}
<div className="energy-card">
  <span className="eyebrow">PV Generation</span>
  <span className="live-metric">3.2 kW</span>
  <div className="energy-card-details">
    <span>+12% vs yesterday</span>
    <MiniSparkline data={pvHistory} />
  </div>
</div>

{/* Level 2 — full control */}
<div className="control-panel">
  <h2>Solar Array Configuration</h2>
  <!-- Full settings, charts, adapter config -->
</div>
```

### 2. Consistent Card Hierarchy

Three tiers of content containers, each building on the previous:

#### `metric-card` — KPI / Glance (Existing)

- **Purpose**: Single value display for dashboards and summary grids.
- **Content**: One primary value, optional eyebrow label, optional icon.
- **Behavior**: Hover shows top-border glow accent; click navigates or expands.
- **Grid**: Use inside `cq-kpi-grid` or `cq-card-grid`.

#### `energy-card` — Summary + Details (New)

- **Purpose**: Mid-level card for energy subsystems (PV, battery, grid, EV).
- **Content**: Primary metric + secondary details slot + optional mini-chart.
- **Behavior**: Collapsible details section; neon-border accent on active state.
- **Sizing**: Min-height 160px; respects `@container` breakpoints.
- **Composition**: Wraps a `metric-card` header + expandable body.

```tsx
<div className="energy-card">
  <div className="energy-card-header">
    <Zap className="h-5 w-5" />
    <span className="eyebrow">Battery</span>
    <span className="live-metric">78%</span>
  </div>
  <div className="energy-card-details">
    <p>Charging · 1.4 kW · ETA 14:30</p>
  </div>
</div>
```

#### `control-panel` — Full Control (New)

- **Purpose**: Top-level container for settings, configuration, and detailed views.
- **Content**: Section header + form controls / charts / tables.
- **Behavior**: Fixed width (max 64rem); internal scroll if content overflows.
- **Decoration**: Stronger glass effect (`glass-panel-strong` base), subtle top-border gradient.
- **Sections**: Use `section-divider` between logical groups.

```tsx
<div className="control-panel">
  <div className="control-panel-header">
    <h2>Adapter Configuration</h2>
  </div>
  <div className="section-divider" />
  <div className="control-panel-body">
    <!-- Form fields, toggles, etc. -->
  </div>
</div>
```

### 3. Global Action Bar (`floating-action-bar`)

A persistent action bar for page-level actions (save, apply, reset).

**Rules:**

1. Appears **only** when the user has unsaved changes or pending actions.
2. Fixed to the bottom of the viewport, centered, with `z-notification` layering.
3. Semi-transparent glass background with blur, slides up on entry (`slide-up` animation).
4. Maximum 3 actions: one primary (`btn-primary`), up to two secondary (`btn-secondary`).
5. **Dismiss**: Auto-hides when changes are saved; can be manually dismissed.
6. **Mobile**: Full-width with `safe-area-inset-bottom` padding.

```tsx
<div className="floating-action-bar">
  <button className="btn-secondary">Reset</button>
  <button className="btn-primary">Save Changes</button>
</div>
```

### 4. Sidebar + Contextual Panels

**Sidebar Rules (main navigation):**

1. Use `sidebar-link` / `sidebar-link-active` for nav items.
2. Desktop: persistent, 16rem width (`@container sidebar`). Collapsible to icon-only (4rem).
3. Mobile: hidden by default, opens as overlay with `z-modal` + backdrop.
4. Active route indicated by `sidebar-link-active` (primary color accent + fill).
5. Group links by category with small uppercase section labels (`eyebrow`).

**Contextual Panels (detail drawers):**

1. Slide in from the right, max-width 28rem, `glass-panel-strong` background.
2. Push content on desktop (≥ lg), overlay on mobile.
3. Close via Escape key, backdrop click, or explicit close button.
4. Use for: adapter detail, device config, AI insights, notification detail.
5. Apply `z-modal` layering when open.

```tsx
{/* Contextual panel: adapter detail */}
<aside className="glass-panel-strong fixed right-0 top-0 h-full w-[28rem] z-modal">
  <header className="control-panel-header">
    <h3>Victron Cerbo GX</h3>
    <button className="focus-ring" aria-label="Close">
      <X className="w-5 h-5" />
    </button>
  </header>
  <div className="control-panel-body">
    <!-- Adapter details -->
  </div>
</aside>
```

### 5. Wizard Steps (`wizard-step`)

Multi-step flows (onboarding, adapter setup, export config).

**Rules:**

1. Each step is a `wizard-step` container with step indicator, title, and content area.
2. Step indicator shows completed (checkmark), current (primary ring), and upcoming (muted) states.
3. Navigation via Next / Back buttons in a `floating-action-bar` at the bottom.
4. Validate the current step before allowing progression.
5. Step content uses `control-panel-body` layout internally.

```tsx
<div className="wizard-step" data-step="active">
  <div className="wizard-step-indicator">
    <span className="wizard-step-number">2</span>
    <span>Configure Adapter</span>
  </div>
  <div className="wizard-step-content">
    <!-- Step form content -->
  </div>
</div>
```

### 6. Live Metric Display (`live-metric`)

Specialized typography for real-time numeric values.

**Rules:**

1. Monospace font (`font-mono`) for stable digit width — no layout shifts.
2. Tabular-nums (`font-variant-numeric: tabular-nums`) for aligned columns.
3. Subtle `energy-pulse` animation when value changes (controlled via `data-changing` attribute).
4. Size scales with container via `fluid-text-2xl` by default.

```tsx
<span className="live-metric" data-changing="true">3.247 kW</span>
<span className="live-metric fluid-text-xl">78 %</span>
```

### 7. New Utility Class Reference

| Class                   | Purpose                         | Base                                   |
| ----------------------- | ------------------------------- | -------------------------------------- |
| `energy-card`           | Mid-level energy subsystem card | `glass-panel` + collapsible body       |
| `energy-card-header`    | Header row inside energy-card   | Flex row, gap, align-center            |
| `energy-card-details`   | Collapsible detail section      | Grid, reveal on expand                 |
| `control-panel`         | Full-control container          | `glass-panel-strong` + max-width       |
| `control-panel-header`  | Header inside control-panel     | Flex, sticky, border-bottom            |
| `control-panel-body`    | Scrollable body                 | Padding, overflow-y auto               |
| `floating-action-bar`   | Bottom-fixed action bar         | Fixed, glass, z-notification, slide-up |
| `wizard-step`           | Multi-step wizard container     | Flex column, step indicator            |
| `wizard-step-indicator` | Step progress indicator         | Flex row, numbered circles             |
| `wizard-step-number`    | Circle with step number         | Rounded-full, primary border           |
| `wizard-step-content`   | Step body content               | Padding, min-height                    |
| `live-metric`           | Real-time numeric readout       | Mono, tabular-nums, fluid-text-2xl     |

---

## How to Add New Features in 1 Day

This section is a practical checklist for adding a new feature — from idea to deployed — within a single working day. The design system, adapter architecture, and tooling are specifically designed to make this possible.

### Morning: Foundation (2 hours)

#### 1. Create the Page Component

```bash
# New page file
touch apps/web/src/pages/MyFeature.tsx
```

```tsx
import { useTranslation } from 'react-i18next';
import { MyIcon } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { PageTour } from '../components/ui/PageTour';
import { HelpTooltip } from '../components/ui/HelpTooltip';
import { EmptyState } from '../components/ui/EmptyState';
import { DemoBadge } from '../components/DemoBadge';

export default function MyFeature() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageTour tourId="my-feature" steps={TOUR_STEPS} />
      <DemoBadge />
      <PageHeader
        title={t('myFeature.title')}
        subtitle={t('myFeature.subtitle')}
        icon={<MyIcon size={22} />}
      />
      {/* Your feature content using glass-panel, energy-card, etc. */}
    </div>
  );
}
```

#### 2. Add Route and Lazy Loading

In `apps/web/src/App.tsx`:

```tsx
const MyFeature = lazy(() => import('./pages/MyFeature'));

// Inside the appropriate section layout:
<Route path="/my-feature" element={<MyFeature />} />;
```

#### 3. Add i18n Keys

Add keys to **both** `apps/web/src/locales/de.ts` and `apps/web/src/locales/en.ts`:

```typescript
myFeature: {
  title: 'Mein Feature',
  subtitle: 'Beschreibung des Features',
},
```

#### 4. Add Sidebar Navigation

In `apps/web/src/components/layout/Sidebar.tsx`, add to the appropriate section group:

```tsx
{ path: '/my-feature', labelKey: 'nav.myFeature', icon: <MyIcon size={20} /> }
```

### Midday: Real-Time Data (2 hours)

#### 5. Connect to Energy Data

Use the dual-store architecture:

```tsx
import { useAppStoreShallow } from '../store';
import { useEnergyStore } from '../core/useEnergyStore';

// UI settings from useAppStore
const settings = useAppStoreShallow((s) => s.settings);

// Real-time data from useEnergyStore
const unified = useEnergyStore((s) => s.unified);
```

#### 6. Use Design System Components

| Need            | Use                                                                               |
| :-------------- | :-------------------------------------------------------------------------------- |
| Data container  | `<div className="glass-panel rounded-2xl p-4">`                                   |
| Metric display  | `<span className="live-metric">3.2 kW</span>`                                     |
| Device card     | `<div className="energy-card">` with `energy-card-header` + `energy-card-details` |
| Action bar      | `<FloatingActionBar>` at bottom                                                   |
| Multi-step flow | `<WizardStepper>` + `<WizardContent>`                                             |
| Empty state     | `<EmptyState icon={Search} title={t('...')} pulse />`                             |
| Contextual help | `<HelpTooltip content={t('...')} />`                                              |

#### 7. Charts with Recharts

```tsx
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

<ResponsiveContainer width="100%" height={200}>
  <AreaChart data={data}>
    <XAxis dataKey="time" />
    <YAxis />
    <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', border: 'none' }} />
    <Area
      type="monotone"
      dataKey="value"
      stroke="var(--color-primary)"
      fill="var(--color-primary)"
      fillOpacity={0.15}
    />
  </AreaChart>
</ResponsiveContainer>;
```

### Afternoon: Polish & Quality (3 hours)

#### 8. Add Guided Tour

```tsx
const TOUR_STEPS: TourStep[] = [
  {
    icon: MyIcon,
    titleKey: 'tour.myFeature.step1Title',
    descKey: 'tour.myFeature.step1Desc',
    color: '#00f0ff',
  },
  {
    icon: Sparkles,
    titleKey: 'tour.myFeature.step2Title',
    descKey: 'tour.myFeature.step2Desc',
    color: '#22ff88',
  },
];
```

#### 9. Accessibility Checklist

- [ ] All buttons have `type="button"`
- [ ] Decorative icons have `aria-hidden="true"`
- [ ] Interactive elements have `aria-label` or visible labels
- [ ] Focus rings via `.focus-ring` class
- [ ] Semantic HTML (`<nav>`, `<main>`, `<section>`)
- [ ] No hardcoded text — all strings use `t()`

#### 10. Write Tests

```bash
# Unit test
touch apps/web/src/tests/MyFeature.test.tsx
```

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('MyFeature', () => {
  it('renders title', () => {
    render(<MyFeature />);
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });
});
```

#### 11. Create Storybook Story

```bash
touch apps/web/src/components/MyFeature.stories.tsx
```

#### 12. Verify & Deploy

```bash
time pnpm type-check      # TypeScript check with elapsed time
pnpm lint                 # Biome + React ESLint zero-warning policy
pnpm test:run             # Unit tests
pnpm build                # Bundle size < 600 KB
git add -A && git commit -m "feat: add MyFeature page"
git push                  # Cloud CI runs browser E2E, Lighthouse, security, Docker
```

### Design System Rules Summary

| Rule             | Enforcement                                       |
| :--------------- | :------------------------------------------------ |
| No inline colors | Use `var(--color-*)` CSS variables                |
| No manual memo   | React Compiler handles it                         |
| No Redux/MobX    | Zustand only (useAppStore + useEnergyStore)       |
| No Tailwind v3   | Use v4 `@theme` syntax                            |
| All strings i18n | `t()` for every user-facing string                |
| WCAG 2.2 AA      | axe-core + Playwright a11y tests                  |
| Lazy loading     | `React.lazy()` + `Suspense` for all pages         |
| 5 themes         | All components use CSS variables, never hardcoded |
