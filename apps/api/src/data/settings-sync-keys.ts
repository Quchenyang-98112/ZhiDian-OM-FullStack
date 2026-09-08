/**
 * Settings key categorization for offline sync reconciliation (slice 4).
 * userPreferences → last-write-wins; deviceSettings → server-wins.
 */

export type SettingsSyncCategory = 'userPreferences' | 'deviceSettings';

const USER_PREFERENCE_KEYS = new Set<string>([
  'animations',
  'compactMode',
  'glowEffects',
  'units',
  'dateFormat',
  'currency',
  'fontScale',
  'reducedMotion',
  'highContrast',
  'pushNotifications',
  'priceAlerts',
  'batteryAlerts',
  'gridAlerts',
  'updateNotifications',
  'batteryAlertThreshold',
  'priceAlertThreshold',
  'quietHoursEnabled',
  'quietHoursStart',
  'quietHoursEnd',
  'dashboardRefreshSec',
  'sidebarPosition',
  'debugMode',
  'experimentalFeatures',
  'performanceMode',
  'autoBackup',
  'keyboardShortcuts',
]);

/** Classify a settings patch key for sync diff metadata. */
export function classifySettingsKey(key: string): SettingsSyncCategory {
  return USER_PREFERENCE_KEYS.has(key) ? 'userPreferences' : 'deviceSettings';
}
