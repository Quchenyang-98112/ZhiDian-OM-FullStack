import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @sentry/react before importing sentry.ts
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({})),
  replayIntegration: vi.fn(() => ({})),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

describe('Sentry Module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should export sentryEnabled as false in test/dev environment', async () => {
    const mod = await import('../lib/sentry');
    // In tests (not production, no DSN), sentryEnabled should be false
    expect(mod.sentryEnabled).toBe(false);
  });

  it('should export initSentry function', async () => {
    const mod = await import('../lib/sentry');
    expect(typeof mod.initSentry).toBe('function');
  });

  it('should export Sentry namespace', async () => {
    const mod = await import('../lib/sentry');
    expect(mod.Sentry).toBeDefined();
    expect(typeof mod.Sentry.init).toBe('function');
  });

  it('should no-op initSentry when not in production', async () => {
    const { initSentry } = await import('../lib/sentry');
    const sentry = await import('@sentry/react');
    // Should not throw and should not call Sentry.init (not prod)
    expect(() => initSentry()).not.toThrow();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('initializes Sentry in production and scrubs sensitive headers', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example.ingest.sentry.io/123');
    vi.stubGlobal('__APP_VERSION__', '1.3.0-test');
    vi.resetModules();

    const sentry = await import('@sentry/react');
    const { initSentry } = await import('../lib/sentry');

    initSentry();

    expect(sentry.init).toHaveBeenCalledTimes(1);
    const options = vi.mocked(sentry.init).mock.calls[0]?.[0];
    expect(options?.dsn).toBe('https://example.ingest.sentry.io/123');

    const scrubbed = options?.beforeSend?.(
      {
        type: undefined,
        request: { headers: { Authorization: 'Bearer secret', Cookie: 'sid=abc' } },
      } as Parameters<NonNullable<typeof options.beforeSend>>[0],
      {} as Parameters<NonNullable<typeof options.beforeSend>>[1],
    ) as { request?: { headers?: Record<string, string> } } | null | undefined;

    expect(scrubbed?.request?.headers?.Authorization).toBeUndefined();
    expect(scrubbed?.request?.headers?.Cookie).toBeUndefined();

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
