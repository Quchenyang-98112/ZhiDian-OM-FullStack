import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
});

vi.mock('../lib/auth-token', () => ({
  getApiBaseUrl: vi.fn(() => 'http://localhost:3000'),
  getAuthHeader: vi.fn(() => ({ Authorization: 'Bearer test' })),
}));

describe('sync-reconcile', () => {
  beforeEach(async () => {
    storage.clear();
    vi.stubGlobal('fetch', vi.fn());
    const { nexusDb } = await import('../lib/db');
    await nexusDb.syncState.clear();
    await nexusDb.settings.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchSyncDiff returns null without auth header mock failure', async () => {
    const auth = await import('../lib/auth-token');
    vi.mocked(auth.getAuthHeader).mockReturnValueOnce(null);

    const { fetchSyncDiff } = await import('../lib/sync-reconcile');
    await expect(fetchSyncDiff(0)).resolves.toBeNull();
  });

  it('applyServerSyncDiff updates store settings from diff entries', async () => {
    const { useAppStore, defaultSettings } = await import('../store');
    useAppStore.setState({ settings: { ...defaultSettings, animations: true } });

    const { applyServerSyncDiff } = await import('../lib/sync-reconcile');
    await applyServerSyncDiff([
      {
        key: 'animations',
        value: false,
        updatedAt: 1000,
        category: 'userPreferences',
        version: 101,
      },
      {
        key: 'victronIp',
        value: '10.0.0.42',
        updatedAt: 1001,
        category: 'deviceSettings',
        version: 102,
      },
    ]);

    expect(useAppStore.getState().settings.animations).toBe(false);
    expect(useAppStore.getState().settings.victronIp).toBe('10.0.0.42');
  });

  it('reconcileServerSettings fetches diff and applies changes', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: 200,
          changes: [
            {
              key: 'compactMode',
              value: true,
              updatedAt: 1,
              category: 'userPreferences',
              version: 200,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const { reconcileServerSettings } = await import('../lib/sync-reconcile');
    const { useAppStore } = await import('../store');

    await expect(reconcileServerSettings(10)).resolves.toBe(200);
    expect(useAppStore.getState().settings.compactMode).toBe(true);
  });
});
