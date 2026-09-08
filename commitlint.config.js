// Commitlint configuration — Conventional Commits
// https://www.conventionalcommits.org/
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // ─── Type ────────────────────────────────────────────────────
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation only
        'style', // Formatting, missing semicolons, etc.
        'refactor', // Code change that neither fixes nor adds
        'perf', // Performance improvement
        'test', // Adding or correcting tests
        'build', // Build system or external deps
        'ci', // CI configuration
        'chore', // Maintenance tasks
        'revert', // Revert a previous commit
        'security', // Security fix or hardening
        'a11y', // Accessibility improvement
        'i18n', // Internationalization / localization
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // ─── Scope (optional, project-specific) ──────────────────────
    'scope-enum': [
      1,
      'always',
      [
        'sankey', // D3 Sankey energy flow
        'floorplan', // KNX floorplan
        'adapter', // Protocol adapters (Victron, KNX, EEBUS, OCPP, Modbus)
        'victron', // Victron Cerbo GX / MQTT
        'knx', // KNX/IP
        'eebus', // EEBUS SPINE/SHIP
        'ocpp', // OCPP 2.1 / EV charging
        'modbus', // ModbusSunSpec
        'tariff', // Tibber / aWATTar tariffs
        'ai', // AI optimizer, predictive, aiClient
        'pwa', // PWA, offline, service worker
        'store', // Zustand stores
        'ui', // UI components, design system
        'settings', // Settings page
        'auth', // Authentication
        'db', // Dexie / IndexedDB
        'e2e', // End-to-end tests
        'deps', // Dependencies
        'docker', // Docker / deployment
        'ci', // GitHub Actions CI/CD
        'theme', // Theming / design tokens
      ],
    ],
    'scope-case': [2, 'always', 'lower-case'],

    // ─── Subject ─────────────────────────────────────────────────
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-max-length': [2, 'always', 100],

    // ─── Header ──────────────────────────────────────────────────
    'header-max-length': [2, 'always', 120],

    // ─── Body ────────────────────────────────────────────────────
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 200],

    // ─── Footer ──────────────────────────────────────────────────
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 200],
  },
};
