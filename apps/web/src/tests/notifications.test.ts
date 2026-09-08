/**
 * Notifications — pure utility function coverage
 *
 * Tests:
 *  - isInQuietHours() — day-only, overnight, disabled
 *  - isPermissionGranted() — browser Notification.permission stub
 *  - isCoolingDown() / markSent() — cooldown map logic
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCategory } from '../lib/notifications';
import {
  isCoolingDown,
  isInQuietHours,
  isPermissionGranted,
  markSent,
  requestPermission,
  showNotification,
} from '../lib/notifications';

// ─── isInQuietHours ──────────────────────────────────────────────────

describe('isInQuietHours()', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function setCurrentTime(hh: number, mm: number): void {
    const now = new Date();
    now.setHours(hh, mm, 0, 0);
    vi.useFakeTimers({ now });
  }

  it('returns false when quiet hours are disabled', () => {
    setCurrentTime(23, 0); // midnight — inside most quiet windows
    expect(isInQuietHours(false, '22:00', '07:00')).toBe(false);
  });

  it('returns true inside a same-day window (09:00–17:00) at 12:00', () => {
    setCurrentTime(12, 0);
    expect(isInQuietHours(true, '09:00', '17:00')).toBe(true);
  });

  it('returns false outside a same-day window (09:00–17:00) at 08:00', () => {
    setCurrentTime(8, 0);
    expect(isInQuietHours(true, '09:00', '17:00')).toBe(false);
  });

  it('returns false outside a same-day window at exactly end time (17:00)', () => {
    setCurrentTime(17, 0);
    expect(isInQuietHours(true, '09:00', '17:00')).toBe(false); // exclusive end
  });

  it('returns true inside an overnight window (22:00–07:00) at 23:00', () => {
    setCurrentTime(23, 0);
    expect(isInQuietHours(true, '22:00', '07:00')).toBe(true);
  });

  it('returns true inside an overnight window (22:00–07:00) at 03:00', () => {
    setCurrentTime(3, 0);
    expect(isInQuietHours(true, '22:00', '07:00')).toBe(true);
  });

  it('returns false outside an overnight window (22:00–07:00) at 12:00', () => {
    setCurrentTime(12, 0);
    expect(isInQuietHours(true, '22:00', '07:00')).toBe(false);
  });

  it('handles exact start boundary of overnight window (22:00)', () => {
    setCurrentTime(22, 0);
    expect(isInQuietHours(true, '22:00', '07:00')).toBe(true);
  });

  it('handles minutes correctly — 22:30 inside 22:00–07:00', () => {
    setCurrentTime(22, 30);
    expect(isInQuietHours(true, '22:00', '07:00')).toBe(true);
  });

  it('handles minutes correctly — 06:59 inside 22:00–07:00', () => {
    setCurrentTime(6, 59);
    expect(isInQuietHours(true, '22:00', '07:00')).toBe(true);
  });
});

// ─── isCoolingDown / markSent ────────────────────────────────────────

describe('isCoolingDown() / markSent()', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const categories: NotificationCategory[] = [
    'ev-ready',
    'ev-fault',
    'tariff-spike',
    'tariff-drop',
    'battery-low',
    'grid-anomaly',
    'update',
  ];

  it('is not cooling down for a fresh category', () => {
    // Use unique test categories by testing "ev-fault" freshness
    // (cooldown map is module-level state; use fake timers to override)
    vi.useFakeTimers({ now: 1_000_000 }); // arbitrary timestamp
    // At this timestamp the cooldown should not be active unless already set —
    // check with an unlikely timestamp no other test will have used
    expect(isCoolingDown('update')).toBe(false);
  });

  it('is cooling down immediately after markSent()', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    markSent('ev-ready');
    expect(isCoolingDown('ev-ready')).toBe(true);
  });

  it('is no longer cooling down after the cooldown window expires', () => {
    vi.useFakeTimers();
    const start = 2_000_000_000; // fixed epoch ms
    vi.setSystemTime(start);

    markSent('ev-fault'); // 5-min cooldown
    expect(isCoolingDown('ev-fault')).toBe(true);

    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(isCoolingDown('ev-fault')).toBe(false);
  });

  it('tariff-spike has a 15-minute cooldown', () => {
    vi.useFakeTimers();
    const start = 3_000_000_000;
    vi.setSystemTime(start);

    markSent('tariff-spike');

    vi.advanceTimersByTime(14 * 60_000 + 59_000); // 14:59 — still cooling
    expect(isCoolingDown('tariff-spike')).toBe(true);

    vi.advanceTimersByTime(2000); // 15:01 — expired
    expect(isCoolingDown('tariff-spike')).toBe(false);
  });

  it('update has a 60-minute cooldown', () => {
    vi.useFakeTimers();
    const start = 4_000_000_000;
    vi.setSystemTime(start);

    markSent('update');

    vi.advanceTimersByTime(59 * 60_000 + 59_000); // 59:59
    expect(isCoolingDown('update')).toBe(true);

    vi.advanceTimersByTime(2000); // 60:01
    expect(isCoolingDown('update')).toBe(false);
  });

  it('each category has independent cooldown state', () => {
    vi.useFakeTimers();
    const start = 5_000_000_000;
    vi.setSystemTime(start);

    markSent('battery-low');

    // grid-anomaly was NOT sent — should not be cooling
    expect(isCoolingDown('battery-low')).toBe(true);
    expect(isCoolingDown('grid-anomaly')).toBe(false);
  });

  it('all defined categories are accepted by isCoolingDown()', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());
    // Just verify no TypeScript error and no throw
    for (const cat of categories) {
      expect(() => isCoolingDown(cat)).not.toThrow();
    }
  });
});

// ─── Permission + delivery ───────────────────────────────────────────

describe('isPermissionGranted()', () => {
  const originalNotification = globalThis.Notification;

  afterEach(() => {
    if (originalNotification) {
      Object.defineProperty(globalThis, 'Notification', {
        configurable: true,
        writable: true,
        value: originalNotification,
      });
    } else {
      Reflect.deleteProperty(globalThis, 'Notification');
    }
  });

  it('returns true when browser permission is granted', () => {
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: { permission: 'granted' },
    });
    expect(isPermissionGranted()).toBe(true);
  });

  it('returns false when Notification API is unavailable', () => {
    Reflect.deleteProperty(globalThis, 'Notification');
    expect(isPermissionGranted()).toBe(false);
  });
});

describe('requestPermission()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'Notification');
  });

  it('returns true when permission is already granted', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: {
        permission: 'granted',
        requestPermission: vi.fn(),
      },
    });
    await expect(requestPermission()).resolves.toBe(true);
  });

  it('returns false when permission is denied', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: {
        permission: 'denied',
        requestPermission: vi.fn(),
      },
    });
    await expect(requestPermission()).resolves.toBe(false);
  });

  it('requests permission when status is default', async () => {
    const requestPermissionMock = vi.fn().mockResolvedValue('granted');
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: {
        permission: 'default',
        requestPermission: requestPermissionMock,
      },
    });
    await expect(requestPermission()).resolves.toBe(true);
    expect(requestPermissionMock).toHaveBeenCalled();
  });
});

describe('showNotification()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'Notification');
  });

  it('uses the Notification constructor when service workers are unavailable', async () => {
    const notificationCtor = vi.fn();
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: Object.assign(notificationCtor, { permission: 'granted' }),
    });

    await showNotification({
      id: '1',
      category: 'battery-low',
      title: 'Battery low',
      body: 'SoC below threshold',
      icon: '/icon.png',
    });

    expect(notificationCtor).toHaveBeenCalledWith(
      'Battery low',
      expect.objectContaining({
        body: 'SoC below threshold',
        icon: '/icon.png',
        tag: 'battery-low',
      }),
    );
  });

  it('no-ops when Notification permission is not granted', async () => {
    const notificationCtor = vi.fn();
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: Object.assign(notificationCtor, { permission: 'denied' }),
    });

    await showNotification({
      id: '2',
      category: 'update',
      title: 'Update',
      body: 'New version',
    });

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it('prefers service worker notifications when registration is ready', async () => {
    const showViaSw = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ showNotification: showViaSw }),
      },
    });
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: { permission: 'granted' },
    });

    await showNotification({
      id: '3',
      category: 'tariff-drop',
      title: 'Price drop',
      body: 'Charge now',
      icon: '/icon.png',
      tag: 'custom-tag',
    });

    expect(showViaSw).toHaveBeenCalledWith(
      'Price drop',
      expect.objectContaining({
        body: 'Charge now',
        icon: '/icon.png',
        badge: '/icon.png',
        tag: 'custom-tag',
      }),
    );
  });
});
