import type { i18n as I18nInstance, TFunction } from 'i18next';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { ThemeName } from '../design-tokens';
import { themeDefinitions } from '../design-tokens';
import { backgroundSyncService } from './background-sync';
import { syncI18nLanguage } from './i18n-language-sync';
import { monitorOfflineStorageQuota } from './offline-cache';
import type { ThemePreference } from './theme';
import { resolveTheme, watchSystemTheme } from './theme';

/**
 * DOM + theme preference side effects for the root app shell.
 *
 * @param options - Theme, locale, accessibility toggles, and i18n instances.
 */
export const useAppBootstrapEffects = ({
  theme,
  locale,
  themePreference,
  fontScale,
  reducedMotion,
  highContrast,
  compactMode,
  glowEffects,
  animations,
  setTheme,
  i18n,
  t,
}: {
  theme: ThemeName;
  locale: string;
  themePreference: ThemePreference;
  fontScale: number | undefined;
  reducedMotion: boolean | undefined;
  highContrast: boolean | undefined;
  compactMode: boolean | undefined;
  glowEffects: boolean | undefined;
  animations: boolean | undefined;
  setTheme: (theme: ThemeName) => void;
  i18n: I18nInstance;
  t: TFunction;
}): void => {
  const themeDefinition = themeDefinitions[theme];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale;
    document.documentElement.style.colorScheme = themeDefinitions[theme].isDark ? 'dark' : 'light';
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', themeDefinition.colors.background);
    }
    return undefined;
  }, [locale, theme, themeDefinition.colors.background]);

  useEffect(() => {
    const scale = fontScale ?? 1.0;
    document.documentElement.style.fontSize = `${scale * 100}%`;
    return undefined;
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', reducedMotion ?? false);
    return undefined;
  }, [reducedMotion]);

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast ?? false);
    return undefined;
  }, [highContrast]);

  useEffect(() => {
    document.documentElement.classList.toggle('compact-mode', compactMode ?? false);
    return undefined;
  }, [compactMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('no-glow', !(glowEffects ?? true));
    return undefined;
  }, [glowEffects]);

  useEffect(() => {
    document.documentElement.classList.toggle('no-animations', !(animations ?? true));
    return undefined;
  }, [animations]);

  useEffect(() => {
    syncI18nLanguage(i18n, locale);
    return undefined;
  }, [i18n, locale]);

  const themeInitRef = useRef(false);
  useEffect(() => {
    if (themeInitRef.current) return undefined;
    themeInitRef.current = true;
    if (themePreference === 'system') {
      setTheme(resolveTheme('system'));
    }
    return undefined;
  }, [themePreference, setTheme]);

  useEffect(() => {
    if (themePreference !== 'system') return undefined;
    const unwatch = watchSystemTheme(() => {
      setTheme(resolveTheme('system'));
    });
    return () => {
      unwatch();
    };
  }, [themePreference, setTheme]);

  useEffect(() => {
    if (import.meta.env.VITE_E2E_TESTING === 'true') return undefined;
    let stopBridge: (() => void) | undefined;
    void import('../core/useControllerCommandBridge').then(({ startControllerCommandBridge }) => {
      stopBridge = startControllerCommandBridge();
    });
    return () => {
      stopBridge?.();
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.VITE_E2E_TESTING === 'true') return undefined;
    backgroundSyncService.init();
    return () => {
      backgroundSyncService.destroy();
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.VITE_E2E_TESTING === 'true') return undefined;
    return monitorOfflineStorageQuota({
      checkIntervalMs: 60_000,
      onWarning: (usage) => {
        toast.warning(
          t('offline.storageQuotaWarning', { percent: Math.round(usage.ratio * 100) }),
          {
            description: t('offline.storageQuotaWarningDesc'),
            duration: 8000,
          },
        );
      },
    });
  }, [t]);
};
