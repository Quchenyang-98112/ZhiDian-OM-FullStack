import { describe, expect, it, vi } from 'vitest';
import type { ThemeName } from '../lib/theme';
import {
  detectSystemTheme,
  getThemeFromSystemPreference,
  resolveTheme,
  watchSystemTheme,
} from '../lib/theme';

describe('Theme System', () => {
  it('should resolve system theme to actual theme', () => {
    const resolved = resolveTheme('system');
    expect(['energy-dark', 'solar-light', 'ocean-dark', 'nature-green', 'minimal-white']).toContain(
      resolved,
    );
  });

  it('should pass through non-system themes', () => {
    expect(resolveTheme('energy-dark')).toBe('energy-dark');
    expect(resolveTheme('solar-light')).toBe('solar-light');
    expect(resolveTheme('ocean-dark')).toBe('ocean-dark');
    expect(resolveTheme('nature-green')).toBe('nature-green');
    expect(resolveTheme('minimal-white')).toBe('minimal-white');
  });

  it('should detect system theme', () => {
    const detected = detectSystemTheme();
    expect(['dark', 'light']).toContain(detected);
  });

  it('maps dark and light system preferences to theme names', () => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    expect(detectSystemTheme()).toBe('dark');
    expect(getThemeFromSystemPreference()).toBe('ocean-dark');

    matchMedia.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    expect(detectSystemTheme()).toBe('light');
    expect(getThemeFromSystemPreference()).toBe('minimal-white');

    vi.unstubAllGlobals();
  });

  it('notifies listeners when the system theme changes', () => {
    let changeHandler: ((event: MediaQueryListEvent) => void) | undefined;
    const matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn((_event: string, handler: (event: MediaQueryListEvent) => void) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    const callback = vi.fn();
    const cleanup = watchSystemTheme(callback);
    changeHandler?.({ matches: false } as MediaQueryListEvent);
    expect(callback).toHaveBeenCalledWith('light');
    cleanup();

    vi.unstubAllGlobals();
  });

  it('should map system preference to theme name', () => {
    const theme = getThemeFromSystemPreference();
    const validNames: ThemeName[] = [
      'energy-dark',
      'solar-light',
      'ocean-dark',
      'nature-green',
      'minimal-white',
    ];
    expect(validNames).toContain(theme);
  });

  it('should return a cleanup function from watchSystemTheme', () => {
    const callback = vi.fn();
    const cleanup = watchSystemTheme(callback);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('should accept all valid theme preference values', () => {
    const preferences = [
      'energy-dark',
      'solar-light',
      'ocean-dark',
      'nature-green',
      'minimal-white',
      'system',
    ] as const;
    for (const pref of preferences) {
      const resolved = resolveTheme(pref);
      expect(typeof resolved).toBe('string');
    }
  });
});
