import { afterEach, describe, expect, it, vi } from 'vitest';

describe('isAdapterWorkerEnabled (MED-12)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is false unless live hardware and VITE_ADAPTER_WORKER are both enabled', async () => {
    vi.stubEnv('VITE_ADAPTER_MODE', 'mock');
    vi.stubEnv('VITE_ALLOW_LIVE_HARDWARE', 'true');
    vi.stubEnv('VITE_ADAPTER_WORKER', 'true');
    const { isAdapterWorkerEnabled } = await import('../lib/adapter-mode');
    expect(isAdapterWorkerEnabled()).toBe(false);

    vi.stubEnv('VITE_ADAPTER_MODE', 'live');
    vi.stubEnv('VITE_ALLOW_LIVE_HARDWARE', 'false');
    vi.stubEnv('VITE_ADAPTER_WORKER', 'true');
    vi.resetModules();
    const mod2 = await import('../lib/adapter-mode');
    expect(mod2.isAdapterWorkerEnabled()).toBe(false);

    vi.stubEnv('VITE_ADAPTER_MODE', 'live');
    vi.stubEnv('VITE_ALLOW_LIVE_HARDWARE', 'true');
    vi.stubEnv('VITE_ADAPTER_WORKER', 'true');
    vi.resetModules();
    const mod3 = await import('../lib/adapter-mode');
    expect(mod3.isAdapterWorkerEnabled()).toBe(true);
  });
});
