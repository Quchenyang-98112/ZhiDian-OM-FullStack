import { describe, expect, it, vi } from 'vitest';
import { syncI18nLanguage } from './i18n-language-sync';

describe('syncI18nLanguage', () => {
  it('changes language when i18n differs from the store locale', () => {
    const changeLanguage = vi.fn(() => Promise.resolve());
    syncI18nLanguage({ language: 'de', changeLanguage }, 'en');
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });

  it('is a no-op when already in sync', () => {
    const changeLanguage = vi.fn(() => Promise.resolve());
    syncI18nLanguage({ language: 'en', changeLanguage }, 'en');
    expect(changeLanguage).not.toHaveBeenCalled();
  });

  it('still switches back once i18n.language has updated (round-trip regression)', () => {
    // The old `resolvedLanguage` guard lagged the async locale-bundle load, so
    // the second toggle was skipped ("switches once, won't switch back").
    const changeLanguage = vi.fn(() => Promise.resolve());
    syncI18nLanguage({ language: 'de', changeLanguage }, 'en');
    syncI18nLanguage({ language: 'en', changeLanguage }, 'de');
    expect(changeLanguage).toHaveBeenNthCalledWith(1, 'en');
    expect(changeLanguage).toHaveBeenNthCalledWith(2, 'de');
  });

  it('swallows a rejected changeLanguage call without throwing', async () => {
    const changeLanguage = vi.fn(() => Promise.reject(new Error('boom')));
    expect(() => syncI18nLanguage({ language: 'de', changeLanguage }, 'en')).not.toThrow();
    // Flush the microtask queue so the .catch(ignorePromiseRejection) branch runs
    // and no unhandled rejection escapes the test.
    await Promise.resolve();
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });
});
