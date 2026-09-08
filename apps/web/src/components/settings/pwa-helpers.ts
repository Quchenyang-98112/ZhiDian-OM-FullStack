/**
 * Pure presentational helpers for {@link PWASettingsSection}.
 *
 * Extracting these condition→class / condition→i18n-key mappings out of the JSX
 * keeps every branch unit-testable (see `pwa-helpers.test.ts`) instead of living
 * as phantom, hard-to-exercise ternaries inside the component tree.
 */

/** Service-worker registration state surfaced in the PWA settings panel. */
export type SWStatus = 'active' | 'waiting' | 'none';

/** Force-update check state. */
export type UpdateStatus = 'idle' | 'checking' | 'found' | 'none';

/** Badge container classes for the service-worker status pill. */
export function swBadgeClass(status: SWStatus): string {
  switch (status) {
    case 'active':
      return 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    case 'waiting':
      return 'border border-amber-500/30 bg-amber-500/10 text-amber-400';
    default:
      return 'border border-(--color-border) bg-(--color-surface-strong) text-(--color-muted)';
  }
}

/** Indicator-dot color for the service-worker status pill. */
export function swDotClass(status: SWStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-400';
    case 'waiting':
      return 'bg-amber-400';
    default:
      return 'bg-(--color-muted)';
  }
}

/** i18n key for the short service-worker status label (Active / Waiting / Inactive). */
export function swStatusLabelKey(status: SWStatus): string {
  switch (status) {
    case 'active':
      return 'common.active';
    case 'waiting':
      return 'common.waiting';
    default:
      return 'common.inactive';
  }
}

/** i18n key for the service-worker status description line. */
export function swStatusDescriptionKey(status: SWStatus): string {
  switch (status) {
    case 'active':
      return 'settings_pwa.swActive';
    case 'waiting':
      return 'settings_pwa.swWaiting';
    default:
      return 'settings_pwa.swNone';
  }
}

/** i18n key for the install-status description, resolved from install capability flags. */
export function installStatusDescriptionKey(flags: {
  isInstalled: boolean;
  isIOSDevice: boolean;
  canInstall: boolean;
}): string {
  if (flags.isInstalled) return 'settings_pwa.installed';
  if (flags.isIOSDevice) return 'settings_pwa.iosHint';
  if (flags.canInstall) return 'settings_pwa.canInstall';
  return 'settings_pwa.notAvailable';
}

/**
 * i18n key for the force-update description line, or `null` when idle (the panel
 * shows the app version string in that case rather than a status message).
 */
export function updateStatusDescriptionKey(status: UpdateStatus): string | null {
  switch (status) {
    case 'checking':
      return 'settings_pwa.forceUpdateChecking';
    case 'found':
      return 'settings_pwa.forceUpdateFound';
    case 'none':
      return 'settings_pwa.forceUpdateNone';
    default:
      return null;
  }
}
