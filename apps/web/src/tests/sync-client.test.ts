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

describe('sync-client', () => {
  beforeEach(async () => {
    storage.clear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
    const { nexusDb } = await import('../lib/db');
    await nexusDb.syncState.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchServerSyncVersion returns null without auth', async () => {
    const { fetchServerSyncVersion } = await import('../lib/sync-client');
    await expect(fetchServerSyncVersion()).resolves.toBeNull();
  });

  it('fetchServerSyncVersion returns the server version when authenticated', async () => {
    const { setAuthToken } = await import('../lib/auth-token');
    setAuthToken('jwt');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ version: 99 }), { status: 200 }),
    );

    const { fetchServerSyncVersion } = await import('../lib/sync-client');
    await expect(fetchServerSyncVersion()).resolves.toBe(99);
  });

  it('detectSyncConflict returns true when server version is newer', async () => {
    const { setAuthToken } = await import('../lib/auth-token');
    const { updateSyncState } = await import('../lib/db');
    setAuthToken('jwt');
    await updateSyncState('settings', '10', false);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ version: 42 }), { status: 200 }),
    );

    const { detectSyncConflict } = await import('../lib/sync-client');
    await expect(detectSyncConflict('settings')).resolves.toBe(true);
  });

  it('detectSyncConflict bootstraps version on first contact without conflict', async () => {
    const { setAuthToken } = await import('../lib/auth-token');
    const { getSyncState } = await import('../lib/db');
    setAuthToken('jwt');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ version: 42 }), { status: 200 }),
    );

    const { detectSyncConflict } = await import('../lib/sync-client');
    await expect(detectSyncConflict('settings')).resolves.toBe(false);

    const state = await getSyncState('settings');
    expect(state.serverVersion).toBe('42');
    expect(state.hasConflict).toBe(false);
  });
});
