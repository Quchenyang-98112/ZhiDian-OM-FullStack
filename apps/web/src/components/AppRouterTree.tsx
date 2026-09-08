import { Toaster } from 'sonner';
import { EnergyProvider } from '../core/EnergyContext';
import type { ThemeName } from '../design-tokens';
import { themeDefinitions } from '../design-tokens';
import { AppRoutes } from './AppRoutes';
import { ErrorBoundary } from './ErrorBoundary';
import { AppShell } from './layout/AppShell';
import { OfflineBanner } from './OfflineBanner';
import { OfflineSyncConflictBanner } from './OfflineSyncConflictBanner';
import { PWAInstallPrompt } from './PWAInstallPrompt';
import { PWAUpdateNotification } from './PWAUpdateNotification';
import { ScrollToTop } from './ScrollToTop';
import { ZhidianAssistant } from './ZhidianAssistant';

/**
 * Router-scoped shell: PWA chrome, energy provider, and routed page content.
 *
 * @param props.theme - Active theme used for toast styling.
 */
export const AppRouterTree = ({ theme }: { theme: ThemeName }) => (
  <>
    <ScrollToTop />
    {!import.meta.env.VITE_E2E_TESTING && <PWAUpdateNotification />}
    <OfflineBanner />
    <OfflineSyncConflictBanner />
    {!import.meta.env.VITE_E2E_TESTING && <PWAInstallPrompt />}
    <Toaster
      position="bottom-right"
      theme={themeDefinitions[theme].isDark ? 'dark' : 'light'}
      richColors
      closeButton
      duration={5000}
    />
    <EnergyProvider>
      <AppShell>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </AppShell>
      <ZhidianAssistant />
    </EnergyProvider>
  </>
);
