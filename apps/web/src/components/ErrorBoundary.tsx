/**
 * Error Boundary Component
 * Catches JavaScript errors in component tree and displays fallback
 */

import i18next from 'i18next';
import { AlertTriangle, Bug, Home, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../lib/logger';
import { metricsCollector } from '../lib/metrics';
import { Sentry, sentryEnabled } from '../lib/sentry';
import { Disclosure } from './ui/Disclosure';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // Record to Prometheus metrics
    metricsCollector.recordErrorBoundaryCatch('ErrorBoundary');
    metricsCollector.recordFrontendError('ErrorBoundary', 'error');

    // Log to structured logger
    logger.error('Uncaught component error', error, 'ErrorBoundary', {
      componentStack: errorInfo.componentStack ?? undefined,
    });

    // Report to Sentry with component stack context
    if (sentryEnabled) {
      Sentry.withScope((scope) => {
        scope.setTag('boundary', 'ErrorBoundary');
        scope.setContext('react', {
          componentStack: errorInfo.componentStack ?? undefined,
        });
        Sentry.captureException(error);
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = import.meta.env.BASE_URL;
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex min-h-screen items-center justify-center bg-(--color-bg) p-4"
          role="alert"
          aria-live="assertive"
        >
          <div className="glass-panel w-full max-w-2xl p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-(--state-danger-bg)/15">
                <AlertTriangle className="h-8 w-8 text-(--state-danger-fg)" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h1 className="font-bold text-(--color-text) text-2xl">
                  {i18next.t('error.title')}
                </h1>
                <p className="mt-2 text-(--color-muted)">{i18next.t('error.description')}</p>

                {/* Error Details (only in development) */}
                {import.meta.env.DEV && this.state.error && (
                  <Disclosure
                    variant="nested"
                    className="mt-4 border border-(--state-danger-border) bg-(--state-danger-bg)/5"
                    title={i18next.t('error.details')}
                    defaultOpen={false}
                  >
                    <div className="space-y-2">
                      <div>
                        <p className="font-medium text-(--state-danger-fg) text-xs">
                          {i18next.t('error.message')}
                        </p>
                        <p className="mt-1 font-mono text-(--state-danger-fg) text-xs">
                          {this.state.error.message}
                        </p>
                      </div>
                      {this.state.error.stack && (
                        <div>
                          <p className="font-medium text-(--state-danger-fg) text-xs">
                            {i18next.t('error.stack')}
                          </p>
                          <pre className="mt-1 overflow-x-auto font-mono text-(--state-danger-fg) text-xs">
                            {this.state.error.stack}
                          </pre>
                        </div>
                      )}
                      {this.state.errorInfo?.componentStack && (
                        <div>
                          <p className="font-medium text-(--state-danger-fg) text-xs">
                            {i18next.t('error.componentStack')}
                          </p>
                          <pre className="mt-1 overflow-x-auto font-mono text-(--state-danger-fg) text-xs">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </div>
                      )}
                    </div>
                  </Disclosure>
                )}

                {/* Actions */}
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={this.handleReset}
                    className="btn-primary focus-ring flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {i18next.t('error.tryAgain')}
                  </button>
                  <button
                    type="button"
                    onClick={this.handleReload}
                    className="btn-secondary focus-ring flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {i18next.t('error.reload')}
                  </button>
                  <button
                    type="button"
                    onClick={this.handleGoHome}
                    className="btn-secondary focus-ring flex items-center gap-2"
                  >
                    <Home className="h-4 w-4" aria-hidden="true" />
                    {i18next.t('error.goHome')}
                  </button>
                </div>

                {/* Sentry User Feedback */}
                {sentryEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      const sentryEventId = Sentry.lastEventId();
                      Sentry.showReportDialog({
                        ...(sentryEventId !== undefined && { eventId: sentryEventId }),
                        title: i18next.t('error.reportTitle'),
                        subtitle: i18next.t('error.reportSubtitle'),
                        labelSubmit: i18next.t('error.reportSubmit'),
                      });
                    }}
                    className="btn-secondary focus-ring flex items-center gap-2"
                  >
                    <Bug className="h-4 w-4" aria-hidden="true" />
                    {i18next.t('error.reportBug')}
                  </button>
                )}

                {/* Additional Help */}
                <div className="mt-6 rounded-xl border border-(--color-border) bg-(--color-surface)/50 p-4">
                  <p className="text-(--color-muted) text-sm">
                    <strong className="text-(--color-text)">{i18next.t('error.helpTitle')}</strong>
                    <br />
                    {i18next.t('error.helpText')}{' '}
                    <a
                      href="mailto:support@nexus-hems.com"
                      className="text-(--color-primary) underline hover:text-(--color-secondary)"
                    >
                      support@nexus-hems.com
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
