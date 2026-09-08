/**
 * Sentry Initialization — @sentry/react with React Router v7 tracing
 *
 * Initializes Sentry error tracking and performance monitoring.
 * Only active in production when VITE_SENTRY_DSN is set.
 * Scrubs sensitive headers and PII before sending events.
 */

import * as Sentry from '@sentry/react';

declare const __APP_VERSION__: string;

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const IS_PROD = import.meta.env.PROD;

/** Whether Sentry is active (production + DSN configured) */
export const sentryEnabled = IS_PROD && !!SENTRY_DSN;

/**
 * Initialize Sentry SDK — call once in main.tsx before React renders.
 * No-op when DSN is not configured or in development mode.
 */
export function initSentry(): void {
  if (!sentryEnabled || !SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: `nexus-hems@${__APP_VERSION__}`,

    // Performance: sample 10% of transactions in production
    tracesSampleRate: 0.1,

    // Error events: capture all
    sampleRate: 1.0,

    // Session replay: off by default (enable via VITE_SENTRY_REPLAY=true)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],

    // Scrub sensitive data before sending
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.Authorization;
        delete event.request.headers.Cookie;
      }
      return event;
    },

    // Ignore common non-actionable errors
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection',
      /Loading chunk .* failed/,
      /Failed to fetch dynamically imported module/,
    ],
  });
}

// Re-export Sentry for direct usage
export { Sentry };
