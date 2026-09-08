import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAuthToken } = vi.hoisted(() => ({
  getAuthToken: vi.fn<() => string | null>(),
}));

vi.mock('../lib/auth-token', () => ({
  getAuthToken,
}));

import {
  createSharedDashboard,
  generateShareLink,
  joinSharedDashboard,
  listSharedDashboards,
} from '../lib/sharing';

describe('Dashboard Sharing', () => {
  beforeEach(() => {
    localStorage.clear();
    getAuthToken.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('generateShareLink', () => {
    it('should generate a valid share URL with query params', () => {
      const link = generateShareLink('dash-123', 'token-abc');
      expect(link).toContain('shared=dash-123');
      expect(link).toContain('token=token-abc');
    });

    it('should use current origin', () => {
      const link = generateShareLink('id', 'tok');
      expect(link).toMatch(/^https?:\/\//);
    });
  });

  describe('createSharedDashboard', () => {
    it('should create and persist a dashboard', async () => {
      const dashboard = await createSharedDashboard('My Home', 'user@test.com');
      expect(dashboard.name).toBe('My Home');
      expect(dashboard.ownerEmail).toBe('user@test.com');
      expect(dashboard.permissions).toBe('admin');
      expect(dashboard.households).toContain('user@test.com');
      expect(dashboard.shareToken).toBeTruthy();
      expect(dashboard.id).toBeTruthy();

      // Verify it was persisted
      const stored = localStorage.getItem(`shared-dashboard-${dashboard.id}`);
      expect(stored).toBeTruthy();
    });

    it('creates server-backed share when JWT is available', async () => {
      getAuthToken.mockReturnValue('share-jwt');
      vi.stubEnv('VITE_API_URL', 'http://localhost:3000');
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ shareId: 'srv-share-1', redeemToken: 'redeem-secret' }), {
          status: 200,
        }),
      );

      const dashboard = await createSharedDashboard('Community Solar', 'owner@test.com');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/shares',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer share-jwt',
          }),
        }),
      );
      expect(dashboard.id).toBe('srv-share-1');
      expect(dashboard.shareToken).toBe('redeem-secret');

      const stored = JSON.parse(localStorage.getItem(`shared-dashboard-${dashboard.id}`)!);
      expect(stored.serverBacked).toBe(true);
      expect(stored.shareToken).toBeUndefined();
    });

    it('falls back to local demo share when server call fails', async () => {
      getAuthToken.mockReturnValue('share-jwt');
      vi.stubEnv('VITE_API_URL', 'http://localhost:3000');
      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 500 }));

      const dashboard = await createSharedDashboard('Offline Demo', 'owner@test.com');

      expect(dashboard.shareToken).toBeTruthy();
      const stored = JSON.parse(localStorage.getItem(`shared-dashboard-${dashboard.id}`)!);
      expect(stored.serverBacked).toBeUndefined();
      expect(stored.shareToken).toBeTruthy();
    });
  });

  describe('joinSharedDashboard', () => {
    it('should allow joining with valid token', async () => {
      const created = await createSharedDashboard('Energy HQ', 'owner@test.com');
      const joined = await joinSharedDashboard(created.id, created.shareToken, 'guest@test.com');
      expect(joined).not.toBeNull();
      expect(joined!.households).toContain('guest@test.com');
    });

    it('should return null for non-existent dashboard', async () => {
      const result = await joinSharedDashboard('nonexistent', 'token', 'user@test.com');
      expect(result).toBeNull();
    });

    it('should throw on invalid token', async () => {
      const created = await createSharedDashboard('Test', 'owner@test.com');
      await expect(joinSharedDashboard(created.id, 'wrong-token', 'user@test.com')).rejects.toThrow(
        'Invalid share token',
      );
    });

    it('redeems server-backed share via API', async () => {
      vi.stubEnv('VITE_API_URL', 'http://localhost:3000');
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'srv-share-9',
            name: 'Grid Pool',
            permissions: 'view',
            expiresAt: Date.now() + 86_400_000,
          }),
          { status: 200 },
        ),
      );

      const joined = await joinSharedDashboard('srv-share-9', 'redeem-tok', 'guest@test.com');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/shares/srv-share-9/redeem',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(joined).not.toBeNull();
      expect(joined!.permissions).toBe('view');
      expect(joined!.households).toContain('guest@test.com');
    });

    it('should not duplicate household entries', async () => {
      const created = await createSharedDashboard('Test', 'owner@test.com');
      await joinSharedDashboard(created.id, created.shareToken, 'guest@test.com');
      await joinSharedDashboard(created.id, created.shareToken, 'guest@test.com');
      const stored = JSON.parse(localStorage.getItem(`shared-dashboard-${created.id}`)!);
      const guestCount = stored.households.filter((h: string) => h === 'guest@test.com').length;
      expect(guestCount).toBe(1);
    });
  });

  describe('listSharedDashboards', () => {
    it('should list dashboards for a user', async () => {
      const d1 = await createSharedDashboard('Home 1', 'user@test.com');
      await createSharedDashboard('Home 2', 'other@test.com');
      await joinSharedDashboard(d1.id, d1.shareToken, 'user@test.com');

      const dashboards = await listSharedDashboards('user@test.com');
      expect(dashboards.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty list for unknown user', async () => {
      const dashboards = await listSharedDashboards('nobody@test.com');
      expect(dashboards).toEqual([]);
    });
  });
});
