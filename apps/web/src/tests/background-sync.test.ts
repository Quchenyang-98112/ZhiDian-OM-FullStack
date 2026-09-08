import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAuthHeader, isAuthTokenValid } = vi.hoisted(() => ({
  getAuthHeader: vi.fn<() => Record<string, string> | null>(),
  isAuthTokenValid: vi.fn(() => true),
}));

vi.mock('../lib/auth-token', () => ({
  getAuthHeader,
  isAuthTokenValid,
}));

vi.mock('../lib/sync-client', () => ({
  detectSyncConflict: vi.fn().mockResolvedValue(false),
  fetchServerSyncVersion: vi.fn().mockResolvedValue(null),
  recordServerSyncVersion: vi.fn().mockResolvedValue(undefined),
}));

const { markSyncConflict } = vi.hoisted(() => ({
  markSyncConflict: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/sync-conflict', () => ({
  markSyncConflict,
}));

vi.mock('../lib/db', () => ({
  getPendingActions: vi.fn().mockResolvedValue([]),
  updateActionStatus: vi.fn().mockResolvedValue(undefined),
  cleanupCompletedActions: vi.fn().mockResolvedValue(undefined),
  persistSettings: vi.fn(),
}));

import { backgroundSyncService } from '../lib/background-sync';

type PendingAction = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
  status: string;
  idempotencyKey?: string;
  retryCount?: number;
};

describe('BackgroundSyncService', () => {
  let onlineHandler: (() => void) | null = null;

  beforeEach(async () => {
    backgroundSyncService.destroy();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    getAuthHeader.mockReset();
    isAuthTokenValid.mockReset();
    isAuthTokenValid.mockReturnValue(true);
    const { getPendingActions, updateActionStatus } = await import('../lib/db');
    vi.mocked(getPendingActions).mockReset();
    vi.mocked(getPendingActions).mockResolvedValue([]);
    vi.mocked(updateActionStatus).mockReset();
    vi.mocked(updateActionStatus).mockResolvedValue(undefined);
    markSyncConflict.mockClear();
    const { detectSyncConflict } = await import('../lib/sync-client');
    vi.mocked(detectSyncConflict).mockResolvedValue(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    onlineHandler = null;
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:5173' },
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'online') onlineHandler = handler;
      }),
      removeEventListener: vi.fn(),
      setInterval: vi.fn((handler: () => void, ms: number) => setInterval(handler, ms)),
      clearInterval: vi.fn((id: number) => clearInterval(id)),
    });
  });

  afterEach(() => {
    backgroundSyncService.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should initialize without throwing', () => {
    expect(() => backgroundSyncService.init()).not.toThrow();
  });

  it('should be safely destroyable', () => {
    backgroundSyncService.init();
    expect(() => backgroundSyncService.destroy()).not.toThrow();
  });

  it('should sync pending actions when online', async () => {
    const { getPendingActions } = await import('../lib/db');
    backgroundSyncService.init();
    await backgroundSyncService.syncPendingActions();
    expect(getPendingActions).toHaveBeenCalled();
  });

  it('should skip sync when offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });
    const { getPendingActions } = await import('../lib/db');
    (getPendingActions as ReturnType<typeof vi.fn>).mockClear();
    await backgroundSyncService.syncPendingActions();
    expect(getPendingActions).not.toHaveBeenCalled();
  });

  it('attaches Authorization header when auth token is present', async () => {
    getAuthHeader.mockReturnValue({ Authorization: 'Bearer sync-jwt' });
    const { getPendingActions, updateActionStatus } = await import('../lib/db');
    (getPendingActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 1,
        type: 'battery-control',
        payload: { powerW: 2000 },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
        idempotencyKey: 'battery-1',
      },
    ]);

    await backgroundSyncService.syncPendingActions();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5173/api/commands/replay',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sync-jwt',
          'X-Idempotency-Key': 'battery-1',
        }),
        body: JSON.stringify({
          type: 'battery-control',
          payload: { powerW: 2000 },
        }),
      }),
    );
    expect(updateActionStatus).toHaveBeenCalledWith(1, 'completed');
  });

  it('marks action failed when no auth token is available', async () => {
    getAuthHeader.mockReturnValue(null);
    const { getPendingActions, updateActionStatus } = await import('../lib/db');
    (getPendingActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 2,
        type: 'ev-control',
        payload: { currentA: 16 },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      },
    ]);

    await backgroundSyncService.syncPendingActions();

    expect(fetch).not.toHaveBeenCalled();
    expect(updateActionStatus).toHaveBeenCalledWith(
      2,
      'failed',
      expect.stringMatching(/No auth token available/i),
    );
  });

  it('getSyncStatus reports pending count and online state', async () => {
    const { getPendingActions } = await import('../lib/db');
    (getPendingActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 10,
        type: 'settings',
        payload: {},
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      },
    ]);

    const status = await backgroundSyncService.getSyncStatus();

    expect(status.pendingCount).toBe(1);
    expect(status.isOnline).toBe(true);
    expect(status.isSyncing).toBe(false);
  });

  it('syncs ev-control, hp-control, settings, and ai-optimize actions', async () => {
    getAuthHeader.mockReturnValue({ Authorization: 'Bearer sync-jwt' });
    const { getPendingActions, updateActionStatus } = await import('../lib/db');

    const actions: PendingAction[] = [
      {
        id: 11,
        type: 'ev-control',
        payload: { currentA: 16 },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      },
      {
        id: 12,
        type: 'hp-control',
        payload: { mode: 'heat' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      },
      {
        id: 13,
        type: 'settings',
        payload: { theme: 'dark' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      },
      {
        id: 14,
        type: 'ai-optimize',
        payload: { horizonH: 24 },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      },
    ];

    (getPendingActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce(actions);

    await backgroundSyncService.syncPendingActions();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5173/api/commands/replay',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5173/api/commands/replay',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5173/api/settings',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5173/api/ai/optimize',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(updateActionStatus).toHaveBeenCalledWith(11, 'completed');
    expect(updateActionStatus).toHaveBeenCalledWith(14, 'completed');
  });

  it('marks unknown action types as failed', async () => {
    getAuthHeader.mockReturnValue({ Authorization: 'Bearer sync-jwt' });
    const { getPendingActions, updateActionStatus } = await import('../lib/db');
    (getPendingActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 15,
        type: 'unsupported-action',
        payload: {},
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      },
    ]);

    await backgroundSyncService.syncPendingActions();

    expect(updateActionStatus).toHaveBeenCalledWith(
      15,
      'failed',
      expect.stringMatching(/Unknown action type/i),
    );
  });

  it('marks actions failed when max retries are exceeded', async () => {
    const { getPendingActions, updateActionStatus } = await import('../lib/db');
    (getPendingActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 16,
        type: 'battery-control',
        payload: { powerW: 1000 },
        timestamp: Date.now(),
        retries: 5,
        status: 'pending',
      },
    ]);

    await backgroundSyncService.syncPendingActions();

    expect(fetch).not.toHaveBeenCalled();
    expect(updateActionStatus).toHaveBeenCalledWith(16, 'failed', 'Max retries exceeded');
  });

  it('skips sync when already syncing', async () => {
    getAuthHeader.mockReturnValue({ Authorization: 'Bearer sync-jwt' });
    const { getPendingActions } = await import('../lib/db');
    let fetchCalls = 0;
    (getPendingActions as ReturnType<typeof vi.fn>).mockImplementation(() => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Promise(() => {
          /* keep isSyncing true */
        });
      }
      return Promise.resolve([]);
    });

    void backgroundSyncService.syncPendingActions();
    await backgroundSyncService.syncPendingActions();

    expect(fetchCalls).toBe(1);
  });

  it('registers an online listener that triggers sync', () => {
    const syncSpy = vi.spyOn(backgroundSyncService, 'syncPendingActions').mockResolvedValue(true);
    backgroundSyncService.init();

    expect(onlineHandler).toBeTypeOf('function');
    onlineHandler?.();

    expect(syncSpy).toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  it('skips replay when the auth token is expired', async () => {
    isAuthTokenValid.mockReturnValue(false);
    const { getPendingActions, updateActionStatus } = await import('../lib/db');
    (getPendingActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 20,
        type: 'battery-control',
        payload: { powerW: 500 },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      },
    ]);

    await backgroundSyncService.syncPendingActions();

    expect(fetch).not.toHaveBeenCalled();
    expect(updateActionStatus).not.toHaveBeenCalled();
  });

  it('expires stale hardware commands instead of replaying them', async () => {
    getAuthHeader.mockReturnValue({ Authorization: 'Bearer sync-jwt' });
    const { getPendingActions, updateActionStatus } = await import('../lib/db');
    const { OFFLINE_HARDWARE_COMMAND_TTL_MS } = await import('../lib/background-sync');
    (getPendingActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 21,
        type: 'ev-control',
        payload: { currentA: 16 },
        timestamp: Date.now() - OFFLINE_HARDWARE_COMMAND_TTL_MS - 1,
        retries: 0,
        status: 'pending',
      },
    ]);

    await backgroundSyncService.syncPendingActions();

    expect(fetch).not.toHaveBeenCalled();
    expect(updateActionStatus).toHaveBeenCalledWith(21, 'failed', 'Command expired (TTL exceeded)');
  });

  it('defers replay when a sync conflict is detected', async () => {
    getAuthHeader.mockReturnValue({ Authorization: 'Bearer sync-jwt' });
    const { getPendingActions, updateActionStatus } = await import('../lib/db');
    const { detectSyncConflict, fetchServerSyncVersion, recordServerSyncVersion } = await import(
      '../lib/sync-client'
    );
    vi.mocked(detectSyncConflict).mockResolvedValue(true);
    vi.mocked(fetchServerSyncVersion).mockResolvedValue(42);
    (getPendingActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 30,
        type: 'settings',
        payload: { theme: 'ocean-dark' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      },
    ]);

    await backgroundSyncService.syncPendingActions();

    expect(markSyncConflict).toHaveBeenCalledWith('settings');
    expect(fetch).not.toHaveBeenCalled();
    expect(updateActionStatus).not.toHaveBeenCalled();
    expect(recordServerSyncVersion).not.toHaveBeenCalled();
  });

  it('replays hardware commands when only settings has a sync conflict', async () => {
    getAuthHeader.mockReturnValue({ Authorization: 'Bearer sync-jwt' });
    const { getPendingActions, updateActionStatus } = await import('../lib/db');
    const { detectSyncConflict } = await import('../lib/sync-client');
    vi.mocked(detectSyncConflict).mockResolvedValueOnce(true).mockResolvedValue(false);
    (getPendingActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 31,
        type: 'settings',
        payload: { theme: 'ocean-dark' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      },
      {
        id: 32,
        type: 'battery-control',
        payload: { powerW: 1000 },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      },
    ]);

    await backgroundSyncService.syncPendingActions();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5173/api/commands/replay',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(updateActionStatus).toHaveBeenCalledWith(32, 'completed');
  });
});
