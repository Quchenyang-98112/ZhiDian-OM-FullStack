import { beforeAll, describe, expect, it } from 'vitest';
import i18n, { i18nReady } from '../i18n';
import { de } from '../locales/de';
import { en } from '../locales/en';

describe('i18n Configuration', () => {
  beforeAll(async () => {
    await i18nReady;
  });

  it('should initialize with German as fallback', () => {
    expect(i18n.options.fallbackLng).toContain('de');
  });

  it('should support de and en', () => {
    expect(i18n.options.supportedLngs).toContain('de');
    expect(i18n.options.supportedLngs).toContain('en');
  });

  it('should load both locale bundles before first render via i18nReady', async () => {
    await i18nReady;
    expect(i18n.hasResourceBundle('de', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    await i18n.changeLanguage('en');
    expect(i18n.t('commandHub.title', { lng: 'en' })).toBe('Command Hub');
  });

  it('should translate a known key in German', async () => {
    await i18n.changeLanguage('de');
    const val = i18n.t('dashboard.realtimeFlow');
    expect(val).toBeTruthy();
    expect(val).not.toBe('dashboard.realtimeFlow');
  });

  it('should translate the same key in English', async () => {
    await i18n.changeLanguage('en');
    const val = i18n.t('dashboard.realtimeFlow');
    expect(val).toBeTruthy();
    expect(val).not.toBe('dashboard.realtimeFlow');
  });

  it('should have matching keys between de and en (recursive)', () => {
    const collectKeys = (obj: Record<string, unknown>, prefix = ''): string[] => {
      const keys: string[] = [];
      for (const [key, val] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        keys.push(fullKey);
        if (typeof val === 'object' && val !== null) {
          keys.push(...collectKeys(val as Record<string, unknown>, fullKey));
        }
      }
      return keys;
    };
    const deKeys = collectKeys(de as unknown as Record<string, unknown>).sort();
    const enKeys = collectKeys(en as unknown as Record<string, unknown>).sort();
    expect(deKeys).toEqual(enKeys);
  });

  it('should not have empty translation values', () => {
    const check = (obj: Record<string, unknown>, path: string) => {
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'string') {
          expect(val.trim().length, `${path}.${key} is empty`).toBeGreaterThan(0);
        } else if (typeof val === 'object' && val !== null) {
          check(val as Record<string, unknown>, `${path}.${key}`);
        }
      }
    };
    check(de as unknown as Record<string, unknown>, 'de');
    check(en as unknown as Record<string, unknown>, 'en');
  });
});
