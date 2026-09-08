export type ThemeName =
  | 'energy-dark'
  | 'solar-light'
  | 'ocean-dark'
  | 'nature-green'
  | 'minimal-white';

export interface ThemeDefinition {
  name: ThemeName;
  label: string;
  isDark: boolean;
  previewColors: [string, string, string];
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    surfaceStrong: string;
    text: string;
    muted: string;
    border: string;
    glow: string;
  };
}

export const neoEnergyPalette = {
  neonGreen: '#22ff88',
  electricBlue: '#00f0ff',
  powerOrange: '#ff8800',
  deepSpace: '#07111f',
  voidBlue: '#0c1f34',
  polarMist: '#eaf7ff',
  solarSand: '#fff3dc',
  midnight: '#030712',
} as const;

export const themeDefinitions: Record<ThemeName, ThemeDefinition> = {
  'energy-dark': {
    name: 'energy-dark',
    label: 'Energy Dark',
    isDark: true,
    previewColors: ['#22ff88', '#00d4e0', '#0a1520'],
    colors: {
      primary: '#22ff88',
      secondary: '#00d4e0',
      accent: '#ff8800',
      background: '#0a1520',
      surface: 'rgba(12, 28, 44, 0.72)',
      surfaceStrong: 'rgba(14, 34, 54, 0.88)',
      text: '#e8f4f0',
      muted: '#94a3b8',
      border: 'rgba(34, 255, 136, 0.14)',
      glow: 'rgba(34, 255, 136, 0.25)',
    },
  },
  'solar-light': {
    name: 'solar-light',
    label: 'Solar Light',
    isDark: false,
    previewColors: ['#0bbf73', '#0084ff', '#fef9ef'],
    colors: {
      primary: '#0bbf73',
      secondary: '#0084ff',
      accent: '#ff8800',
      background: '#fef9ef',
      surface: 'rgba(255, 255, 255, 0.75)',
      surfaceStrong: 'rgba(255, 250, 235, 0.94)',
      text: '#1a2a3a',
      muted: '#4b5563',
      border: 'rgba(0, 132, 255, 0.14)',
      glow: 'rgba(255, 136, 0, 0.18)',
    },
  },
  'ocean-dark': {
    name: 'ocean-dark',
    label: 'Ocean Deep',
    isDark: true,
    previewColors: ['#38bdf8', '#818cf8', '#0c1222'],
    colors: {
      primary: '#38bdf8',
      secondary: '#818cf8',
      accent: '#fb923c',
      background: '#0c1222',
      surface: 'rgba(14, 22, 42, 0.76)',
      surfaceStrong: 'rgba(18, 28, 52, 0.9)',
      text: '#e2eaf4',
      muted: '#94a3b8',
      border: 'rgba(56, 189, 248, 0.14)',
      glow: 'rgba(56, 189, 248, 0.2)',
    },
  },
  'nature-green': {
    name: 'nature-green',
    label: 'Forest',
    isDark: true,
    previewColors: ['#4ade80', '#a3e635', '#0f1a12'],
    colors: {
      primary: '#4ade80',
      secondary: '#a3e635',
      accent: '#fbbf24',
      background: '#0f1a12',
      surface: 'rgba(16, 30, 18, 0.76)',
      surfaceStrong: 'rgba(20, 38, 22, 0.9)',
      text: '#e4f0e6',
      muted: '#8aaa8e',
      border: 'rgba(74, 222, 128, 0.14)',
      glow: 'rgba(74, 222, 128, 0.2)',
    },
  },
  'minimal-white': {
    name: 'minimal-white',
    label: 'Minimal',
    isDark: false,
    previewColors: ['#111827', '#6366f1', '#ffffff'],
    colors: {
      primary: '#111827',
      secondary: '#6366f1',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: 'rgba(249, 250, 251, 0.8)',
      surfaceStrong: 'rgba(243, 244, 246, 0.95)',
      text: '#111827',
      muted: '#6b7280',
      border: 'rgba(209, 213, 219, 0.5)',
      glow: 'rgba(99, 102, 241, 0.12)',
    },
  },
};

export const themeOrder: ThemeName[] = [
  'energy-dark',
  'ocean-dark',
  'nature-green',
  'solar-light',
  'minimal-white',
];

// ========== Unified UI Principles v1 — Component Tokens ==========

/** Card hierarchy z-index and elevation mapping */
export const cardHierarchy = {
  /** Level 0: KPI/Glance — single metric display */
  metricCard: {
    minHeight: '96px',
    padding: '1rem',
    paddingSm: '1.5rem',
    borderRadius: '1.5rem',
    blur: '64px',
  },
  /** Level 1: Summary + expandable details for energy subsystems */
  energyCard: {
    minHeight: '160px',
    padding: '1.25rem',
    paddingSm: '1.5rem',
    borderRadius: '1.5rem',
    blur: '64px',
    detailsGap: '0.75rem',
  },
  /** Level 2: Full control surface for config/settings */
  controlPanel: {
    maxWidth: '64rem',
    padding: '1.5rem',
    paddingSm: '2rem',
    borderRadius: '1.5rem',
    blur: '64px',
    headerHeight: '3.5rem',
  },
} as const;

/** Floating action bar tokens */
export const floatingActionBar = {
  height: '3.5rem',
  maxWidth: '32rem',
  blur: '48px',
  borderRadius: '9999px',
  paddingX: '1.5rem',
  gap: '0.75rem',
  /** z-index tier: matches z-notification (60) */
  zIndex: 60,
} as const;

/** Wizard step tokens */
export const wizardStep = {
  indicatorSize: '2.5rem',
  indicatorBorderWidth: '2px',
  contentMinHeight: '12rem',
  gap: '1.5rem',
} as const;

/** Live metric display tokens */
export const liveMetric = {
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
  /** Default fluid size — override with fluid-text-* */
  defaultSize: 'fluid-text-2xl',
} as const;

/** Contextual panel (right drawer) tokens */
export const contextualPanel = {
  width: '28rem',
  maxWidthMobile: '100vw',
  blur: '64px',
} as const;

// ========== Foundation Scales (mirror the CSS custom properties in index.css) ==========
// CSS variables in index.css are the source of truth for styling; these TS mirrors
// exist for the rare cases that need the raw values in JS. Keep them in sync.

/** Elevation / shadow scale — consolidates the previously inlined box-shadow patterns. */
export const shadowScale = {
  sm: '0 2px 6px rgba(0, 0, 0, 0.08)',
  md: '0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
  lg: '0 12px 48px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.1)',
  xl: '0 24px 64px rgba(0, 0, 0, 0.24), 0 8px 24px rgba(0, 0, 0, 0.12)',
} as const;

/** Border-radius scale. */
export const radiusScale = {
  xs: '0.375rem', // 6px
  sm: '0.5rem', // 8px — tooltips, small badges
  md: '0.75rem', // 12px
  lg: '1rem', // 16px
  xl: '1.5rem', // 24px — cards, panels, buttons
  full: '9999px', // pills, badges
} as const;

/** Motion tokens — durations + easing curves for consistent transitions/animations. */
export const motionTokens = {
  duration: { fast: '0.15s', normal: '0.3s', slow: '0.6s' },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

/**
 * Semantic state / severity names. The colours live as `--state-{name}-{bg,fg,border}`
 * CSS custom properties in index.css (tuned per dark/light theme, like `--badge-*`).
 * Use via Tailwind arbitrary properties, e.g. `text-(--state-danger-fg)`.
 */
export const stateSeverities = ['danger', 'warning', 'success', 'info', 'live', 'offline'] as const;
export type StateSeverity = (typeof stateSeverities)[number];
