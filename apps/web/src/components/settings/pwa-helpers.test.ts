import { describe, expect, it } from 'vitest';
import {
  installStatusDescriptionKey,
  type SWStatus,
  swBadgeClass,
  swDotClass,
  swStatusDescriptionKey,
  swStatusLabelKey,
  updateStatusDescriptionKey,
} from './pwa-helpers';

const SW_STATUSES: SWStatus[] = ['active', 'waiting', 'none'];

describe('pwa-helpers', () => {
  describe('swBadgeClass', () => {
    it('returns a distinct class per status', () => {
      expect(swBadgeClass('active')).toContain('emerald');
      expect(swBadgeClass('waiting')).toContain('amber');
      expect(swBadgeClass('none')).toContain('--color-border');
    });
    it('never returns an empty string', () => {
      for (const s of SW_STATUSES) expect(swBadgeClass(s).length).toBeGreaterThan(0);
    });
  });

  describe('swDotClass', () => {
    it('maps each status to its dot color', () => {
      expect(swDotClass('active')).toBe('bg-emerald-400');
      expect(swDotClass('waiting')).toBe('bg-amber-400');
      expect(swDotClass('none')).toBe('bg-(--color-muted)');
    });
  });

  describe('swStatusLabelKey', () => {
    it('maps each status to its label key', () => {
      expect(swStatusLabelKey('active')).toBe('common.active');
      expect(swStatusLabelKey('waiting')).toBe('common.waiting');
      expect(swStatusLabelKey('none')).toBe('common.inactive');
    });
  });

  describe('swStatusDescriptionKey', () => {
    it('maps each status to its description key', () => {
      expect(swStatusDescriptionKey('active')).toBe('settings_pwa.swActive');
      expect(swStatusDescriptionKey('waiting')).toBe('settings_pwa.swWaiting');
      expect(swStatusDescriptionKey('none')).toBe('settings_pwa.swNone');
    });
  });

  describe('installStatusDescriptionKey', () => {
    const base = { isInstalled: false, isIOSDevice: false, canInstall: false };
    it('prioritises installed over every other flag', () => {
      expect(
        installStatusDescriptionKey({ isInstalled: true, isIOSDevice: true, canInstall: true }),
      ).toBe('settings_pwa.installed');
    });
    it('falls back to the iOS hint when not installed', () => {
      expect(installStatusDescriptionKey({ ...base, isIOSDevice: true })).toBe(
        'settings_pwa.iosHint',
      );
    });
    it('offers install when supported and not iOS', () => {
      expect(installStatusDescriptionKey({ ...base, canInstall: true })).toBe(
        'settings_pwa.canInstall',
      );
    });
    it('reports not-available when no capability is present', () => {
      expect(installStatusDescriptionKey(base)).toBe('settings_pwa.notAvailable');
    });
  });

  describe('updateStatusDescriptionKey', () => {
    it('maps active check states to their keys', () => {
      expect(updateStatusDescriptionKey('checking')).toBe('settings_pwa.forceUpdateChecking');
      expect(updateStatusDescriptionKey('found')).toBe('settings_pwa.forceUpdateFound');
      expect(updateStatusDescriptionKey('none')).toBe('settings_pwa.forceUpdateNone');
    });
    it('returns null when idle so the panel shows the version string', () => {
      expect(updateStatusDescriptionKey('idle')).toBeNull();
    });
  });
});
