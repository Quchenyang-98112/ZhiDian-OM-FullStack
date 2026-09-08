/**
 * Client-side settings key categorization (mirrors API settings-sync-keys.ts).
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

export function classifySettingsKey(key: string): SettingsSyncCategory {
  return USER_PREFERENCE_KEYS.has(key) ? 'userPreferences' : 'deviceSettings';
}
