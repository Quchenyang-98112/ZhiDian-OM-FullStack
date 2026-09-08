import { MotionConfig } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter as Router } from 'react-router-dom';
import { AppRouterTree } from './components/AppRouterTree';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAdapterBridge, useServerWebSocket } from './core/useEnergyStore';
import { isBackendWsEnabled } from './lib/adapter-mode';
import { logError } from './lib/db';
import { useAppBootstrapEffects } from './lib/use-app-bootstrap-effects';
import { useBackendHealthPoll } from './lib/use-backend-health-poll';
import { useNotifications } from './lib/useNotifications';
import { useAppStoreShallow } from './store';

/**
 * Nexus-HEMS root application shell and route provider.
 *
 * Wires backend health polling, adapter bridge, notifications, and SPA routes.
 */
export default function App() {
  const { i18n, t } = useTranslation();
  const {
    theme,
    locale,
    setTheme,
    themePreference,
    fontScale,
    reducedMotion,
    highContrast,
    compactMode,
    glowEffects,
    animations,
  } = useAppStoreShallow((s) => ({
    theme: s.theme,
    locale: s.locale,
    setTheme: s.setTheme,
    themePreference: s.themePreference,
    fontScale: s.settings.fontScale,
    reducedMotion: s.settings.reducedMotion,
    highContrast: s.settings.highContrast,
    compactMode: s.settings.compactMode,
    glowEffects: s.settings.glowEffects,
    animations: s.settings.animations,
  }));

  useBackendHealthPoll();
  useAdapterBridge();
  useServerWebSocket(isBackendWsEnabled());
  useNotifications();

  useAppBootstrapEffects({
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
  });

  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary
        onError={(error, errorInfo) => {
          logError(error, errorInfo.componentStack ?? undefined, 'high').catch(console.error);
        }}
      >
        <Router basename={import.meta.env.BASE_URL}>
          <AppRouterTree theme={theme} />
        </Router>
      </ErrorBoundary>
    </MotionConfig>
  );
}
