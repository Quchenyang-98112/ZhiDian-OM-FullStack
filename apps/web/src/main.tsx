import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { i18nReady } from './i18n';
import { startDownsamplingService } from './lib/downsampling-service';
import { QueryProvider } from './lib/query-client.tsx';
import { initSentry } from './lib/sentry';
import './index.css';
// Bundle sonner's stylesheet from 'self' so the toaster is styled/positioned
// under the strict CSP (AUD-02). sonner injects its CSS via a runtime <style>
// tag with no nonce, which style-src blocks — without the bundled copy the
// toaster loses `position: fixed` and renders inline at the top of the tree,
// shifting the whole page down on every toast until it auto-dismisses.
import 'sonner/dist/styles.css';

// Initialize Sentry before React renders (no-op without VITE_SENTRY_DSN)
initSentry();

// Handle service worker controller change (auto-reload on SW update)
// Disabled during E2E testing to prevent mid-test reloads caused by SW installation.
if ('serviceWorker' in navigator && !import.meta.env.VITE_E2E_TESTING) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function mountApp(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryProvider>
        {/* Under E2E, skip all framer-motion animations so values snap to their final
            state instantly. Entrance opacity/spring fades otherwise race the axe scan
            and trip transient color-contrast violations (spring animations are JS-driven
            and invisible to `document.getAnimations()`, so the test-side settle can't
            catch them). `skipAnimations` is framer's documented E2E switch; gated on
            VITE_E2E_TESTING → zero production impact.

            Escape hatch: VITE_E2E_ANIMATIONS=true keeps E2E mode (SW-reload guard,
            background-service opt-out) but runs animations, so animation-gated crashes
            — e.g. a recharts ResponsiveContainer looping inside a height:0 → auto
            reveal (React #185), which this flag previously MASKED in CI — are exposed.
            Used by the animation-crash-sweep E2E job. */}
        <MotionConfig
          skipAnimations={
            import.meta.env.VITE_E2E_TESTING === 'true' &&
            import.meta.env.VITE_E2E_ANIMATIONS !== 'true'
          }
        >
          <App />
        </MotionConfig>
      </QueryProvider>
    </StrictMode>,
  );

  if (import.meta.env.VITE_E2E_TESTING !== 'true') {
    startDownsamplingService();
  }
}

void i18nReady
  .catch((error: unknown) => {
    console.error('[i18n] locale bootstrap failed; mounting with German fallback', error);
  })
  .then(() => {
    mountApp();
  });
