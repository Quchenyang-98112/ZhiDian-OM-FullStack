/**
 * Push notification service for HEMS energy events.
 *
 * Works in three runtimes:
 *  - PWA / Browser  → Web Notifications API
 *  - Tauri Desktop  → tauri-plugin-notification
 *  - Tauri Mobile   → tauri-plugin-notification (Android/iOS native)
 *
 * The service checks quiet-hours, deduplicates via cooldown windows,
 * and respects all per-category toggles from StoredSettings.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationCategory =
  | 'ev-ready'
  | 'ev-fault'
  | 'tariff-spike'
  | 'tariff-drop'
  | 'battery-low'
  | 'grid-anomaly'
  | 'update';

export interface HemsNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  icon?: string;
  tag?: string;
}

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

interface TauriNotificationModule {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<string>;
  sendNotification: (opts: { title: string; body: string }) => void;
}

// Tauri plugin module path — kept as a variable so TypeScript
// does not attempt to resolve the optional native dependency.
const TAURI_NOTIFICATION_MODULE = '@tauri-apps/plugin-notification';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

export async function requestPermission(): Promise<boolean> {
  if (isTauri()) {
    try {
      const { isPermissionGranted, requestPermission: tauriReq } = (await import(
        /* @vite-ignore */ TAURI_NOTIFICATION_MODULE
      )) as TauriNotificationModule;
      let granted = await isPermissionGranted();
      if (!granted) {
        const result = await tauriReq();
        granted = result === 'granted';
      }
      return granted;
    } catch {
      // Plugin not available — fall through to web
    }
  }

  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function isPermissionGranted(): boolean {
  if (typeof Notification !== 'undefined') {
    return Notification.permission === 'granted';
  }
  return false;
}

// ---------------------------------------------------------------------------
// Show notification (cross-runtime)
// ---------------------------------------------------------------------------

export async function showNotification(n: HemsNotification): Promise<void> {
  if (isTauri()) {
    try {
      const mod = (await import(
        /* @vite-ignore */ TAURI_NOTIFICATION_MODULE
      )) as TauriNotificationModule;
      mod.sendNotification({ title: n.title, body: n.body });
      return;
    } catch {
      // fall through to web
    }
  }

  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  // Use service worker notification if available (works when tab is backgrounded)
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(n.title, {
      body: n.body,
      ...(n.icon != null && { icon: n.icon }),
      tag: n.tag ?? n.category,
      ...(n.icon != null && { badge: n.icon }),
    });
    return;
  }

  // Fallback: basic Notification constructor
  new Notification(n.title, {
    body: n.body,
    ...(n.icon != null && { icon: n.icon }),
    tag: n.tag ?? n.category,
  });
}

// ---------------------------------------------------------------------------
// Quiet-hours check
// ---------------------------------------------------------------------------

export function isInQuietHours(enabled: boolean, start: string, end: string): boolean {
  if (!enabled) return false;
  const now = new Date();
  const hhmm = now.getHours() * 60 + now.getMinutes();

  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  // Handles overnight ranges (e.g. 22:00 – 07:00)
  if (startMin <= endMin) {
    return hhmm >= startMin && hhmm < endMin;
  }
  return hhmm >= startMin || hhmm < endMin;
}

// ---------------------------------------------------------------------------
// Cooldown map — prevents notification spam
// ---------------------------------------------------------------------------

const cooldowns = new Map<NotificationCategory, number>();
const COOLDOWN_MS: Record<NotificationCategory, number> = {
  'ev-ready': 10 * 60_000, // 10 min
  'ev-fault': 5 * 60_000,
  'tariff-spike': 15 * 60_000,
  'tariff-drop': 15 * 60_000,
  'battery-low': 10 * 60_000,
  'grid-anomaly': 5 * 60_000,
  update: 60 * 60_000,
};

export function isCoolingDown(category: NotificationCategory): boolean {
  const last = cooldowns.get(category);
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS[category];
}

export function markSent(category: NotificationCategory): void {
  cooldowns.set(category, Date.now());
}
