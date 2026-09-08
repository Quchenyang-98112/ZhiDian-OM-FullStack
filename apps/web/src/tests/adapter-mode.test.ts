import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canConnectHardwareAdapter,
  fetchBackendAdapterMode,
  fetchBackendHealthStatus,
  isAdapterWorkerEnabled,
  isBackendWsEnabled,
  isBuiltinAdapterEnabledByDefault,
  isLiveHardwareBuildAllowed,
  isLiveSafetyMode,
  isReadOnlyModeActive,
  resolveConnectionPresentation,
  resolveFrontendAdapterMode,
  setRuntimeBackendReadOnly,
} from '../lib/adapter-mode';

describe('adapter-mode (frontend)', () => {
  it('defaults to mock when VITE_ADAPTER_MODE is unset', () => {
    expect(resolveFrontendAdapterMode()).toBe('mock');
    expect(isBuiltinAdapterEnabledByDefault()).toBe(false);
    expect(isLiveHardwareBuildAllowed()).toBe(false);
  });

  it('resolves live mode and hardware acknowledgement from env', () => {
    vi.stubEnv('VITE_ADAPTER_MODE', 'live');
    vi.stubEnv('VITE_ALLOW_LIVE_HARDWARE', 'true');
    expect(resolveFrontendAdapterMode()).toBe('live');
    expect(isLiveHardwareBuildAllowed()).toBe(true);
    expect(canConnectHardwareAdapter(true)).toBe(true);
    expect(canConnectHardwareAdapter(false)).toBe(false);
    vi.unstubAllEnvs();
  });

  it('warns and falls back to mock for invalid VITE_ADAPTER_MODE in dev', () => {
    vi.stubEnv('VITE_ADAPTER_MODE', 'bogus');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveFrontendAdapterMode()).toBe('mock');
    if (import.meta.env.DEV) {
      expect(warn).toHaveBeenCalled();
    }
    warn.mockRestore();
    vi.unstubAllEnvs();
  });

  it('does not connect hardware without live build acknowledgement', () => {
    expect(canConnectHardwareAdapter(true)).toBe(false);
    expect(canConnectHardwareAdapter(false)).toBe(false);
  });
});

describe('isLiveSafetyMode', () => {
  // Build flag is unset in tests, so only an explicit backend 'live' is live.
  it('treats only an explicit backend live mode as live', () => {
    expect(isLiveSafetyMode('live')).toBe(true);
    expect(isLiveSafetyMode('mock')).toBe(false);
    expect(isLiveSafetyMode('unknown')).toBe(false);
  });
});

describe('fetchBackendHealthStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setRuntimeBackendReadOnly(false);
  });

  function mockFetch(value: { ok: boolean; body: unknown } | Error): void {
    if (value instanceof Error) {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(value)),
      );
      return;
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: value.ok,
          json: () => Promise.resolve(value.body),
        } as Response),
      ),
    );
  }

  it('returns readOnly when the backend reports it', async () => {
    mockFetch({ ok: true, body: { mode: 'mock', readOnly: true } });
    await expect(fetchBackendHealthStatus()).resolves.toEqual({ mode: 'mock', readOnly: true });
  });

  it('returns live mode with readOnly false when backend is live', async () => {
    mockFetch({ ok: true, body: { mode: 'live', readOnly: false } });
    await expect(fetchBackendHealthStatus()).resolves.toEqual({ mode: 'live', readOnly: false });
  });

  it('defaults readOnly to false on network failure', async () => {
    mockFetch(new Error('offline'));
    await expect(fetchBackendHealthStatus()).resolves.toEqual({
      mode: 'unknown',
      readOnly: false,
    });
  });
});

describe('fetchBackendAdapterMode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(value: { ok: boolean; body: unknown } | Error): void {
    if (value instanceof Error) {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(value)),
      );
      return;
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: value.ok,
          json: () => Promise.resolve(value.body),
        } as Response),
      ),
    );
  }

  it('returns the backend mock mode', async () => {
    mockFetch({ ok: true, body: { mode: 'mock' } });
    expect(await fetchBackendAdapterMode()).toBe('mock');
  });

  it('returns live even on a 503 degraded response (parses body, not status)', async () => {
    mockFetch({ ok: false, body: { mode: 'live' } });
    expect(await fetchBackendAdapterMode()).toBe('live');
  });

  it('returns unknown on a network error', async () => {
    mockFetch(new Error('network down'));
    expect(await fetchBackendAdapterMode()).toBe('unknown');
  });

  it('returns unknown when the body has no recognised mode', async () => {
    mockFetch({ ok: true, body: { status: 'healthy' } });
    expect(await fetchBackendAdapterMode()).toBe('unknown');
  });
});

describe('resolveConnectionPresentation', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_WS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns connected when any adapter is connected', () => {
    expect(resolveConnectionPresentation(true, 'mock')).toBe('connected');
    expect(resolveConnectionPresentation(true, 'live')).toBe('connected');
  });

  it('returns connected when the backend WebSocket consumer is linked', () => {
    vi.stubEnv('VITE_BACKEND_WS', 'true');
    expect(resolveConnectionPresentation(false, 'live', true)).toBe('connected');
  });

  it('ignores serverWsConnected when the backend WebSocket consumer is disabled', () => {
    expect(resolveConnectionPresentation(false, 'live', true)).toBe('disconnected');
  });

  it('returns simulation on static demo deployments (no backend WS, not live)', () => {
    expect(resolveConnectionPresentation(false, 'mock')).toBe('simulation');
    expect(resolveConnectionPresentation(false, 'unknown')).toBe('simulation');
  });

  it('returns simulation for mock mode when backend WS consumer is enabled but offline', () => {
    vi.stubEnv('VITE_BACKEND_WS', 'true');
    expect(resolveConnectionPresentation(false, 'mock', false)).toBe('simulation');
  });

  it('returns disconnected for unknown mode when backend WS consumer is enabled', () => {
    vi.stubEnv('VITE_BACKEND_WS', 'true');
    expect(resolveConnectionPresentation(false, 'unknown', false)).toBe('disconnected');
  });

  it('returns disconnected when live mode is active but adapters are offline', () => {
    expect(resolveConnectionPresentation(false, 'live')).toBe('disconnected');
  });
});

describe('isReadOnlyModeActive', () => {
  afterEach(() => {
    setRuntimeBackendReadOnly(false);
    vi.unstubAllEnvs();
  });

  it('returns false in test environment (VITE_READ_ONLY_MODE not set)', () => {
    expect(isReadOnlyModeActive()).toBe(false);
  });

  it('returns true when the build sets VITE_READ_ONLY_MODE', () => {
    vi.stubEnv('VITE_READ_ONLY_MODE', 'true');
    expect(isReadOnlyModeActive()).toBe(true);
  });

  it('returns true when backend health reports readOnly', () => {
    setRuntimeBackendReadOnly(true);
    expect(isReadOnlyModeActive()).toBe(true);
  });
});

describe('isBackendWsEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true only when VITE_BACKEND_WS is true', () => {
    expect(isBackendWsEnabled()).toBe(false);
    vi.stubEnv('VITE_BACKEND_WS', 'true');
    expect(isBackendWsEnabled()).toBe(true);
  });
});

describe('isAdapterWorkerEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires live hardware acknowledgement and VITE_ADAPTER_WORKER', () => {
    vi.stubEnv('VITE_ADAPTER_MODE', 'live');
    vi.stubEnv('VITE_ALLOW_LIVE_HARDWARE', 'true');
    vi.stubEnv('VITE_ADAPTER_WORKER', 'true');
    expect(isAdapterWorkerEnabled()).toBe(true);
  });

  it('returns false without live hardware acknowledgement', () => {
    vi.stubEnv('VITE_ADAPTER_WORKER', 'true');
    expect(isAdapterWorkerEnabled()).toBe(false);
  });
});
