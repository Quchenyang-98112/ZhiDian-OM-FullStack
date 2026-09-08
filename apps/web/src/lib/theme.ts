/**
 * Enhanced Theme System with System Preference Detection
 */

export type ThemeName =
  | 'energy-dark'
  | 'solar-light'
  | 'ocean-dark'
  | 'nature-green'
  | 'minimal-white';
export type ThemePreference = ThemeName | 'system';

/**
 * Detects the user's system theme preference
 */
export function detectSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  return mediaQuery.matches ? 'dark' : 'light';
}

/**
 * Maps system preference to theme name
 */
export function getThemeFromSystemPreference(): ThemeName {
  const systemTheme = detectSystemTheme();
  return systemTheme === 'dark' ? 'ocean-dark' : 'minimal-white';
}

/**
 * Resolves theme preference to actual theme
 */
export function resolveTheme(preference: ThemePreference): ThemeName {
  if (preference === 'system') {
    return getThemeFromSystemPreference();
  }
  return preference;
}

/**
 * Listens for system theme changes
 */
export function watchSystemTheme(callback: (theme: 'dark' | 'light') => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches ? 'dark' : 'light');
  };

  mediaQuery.addEventListener('change', handler);

  return () => {
    mediaQuery.removeEventListener('change', handler);
  };
}
