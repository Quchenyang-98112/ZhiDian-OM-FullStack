/**
 * Mobile push notification bridge for Nexus HEMS.
 *
 * Provides a unified push notification API across three runtimes:
 *  - Capacitor (iOS/Android via FCM + APNs)
 *  - Tauri Mobile (Android/iOS via tauri-plugin-notification)
 *  - Web (Service Worker Push API)
 *
 * Notification channels:
 *  - ev-ready     : EV charging complete
 *  - tariff-spike : Price exceeds threshold
 *  - tariff-drop  : Price drops below threshold
 *  - battery-low  : Battery SoC below minimum
 *  - grid-anomaly : Voltage out of range
 *  - system       : App updates, connectivity
 */

import type { NotificationCategory } from './notifications';

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

export type MobileRuntime = 'capacitor' | 'tauri' | 'web';

export function detectRuntime(): MobileRuntime {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) return 'tauri';
  if (typeof window !== 'undefined' && 'Capacitor' in window) return 'capacitor';
  return 'web';
}

// ---------------------------------------------------------------------------
// Push token management
// ---------------------------------------------------------------------------

export interface PushToken {
  value: string;
  runtime: MobileRuntime;
  timestamp: number;
}

let cachedToken: PushToken | null = null;

/**
 * Registers the device for push notifications and returns the device token.
 * For Capacitor: uses @capacitor/push-notifications (FCM/APNs).
 * For Tauri: uses tauri-plugin-notification (local only, no remote push).
 * For Web: uses Web Push API via service worker.
 */
export async function registerForPush(): Promise<PushToken | null> {
  const runtime = detectRuntime();

  if (runtime === 'capacitor') {
    return registerCapacitorPush();
  }

  if (runtime === 'tauri') {
    // Tauri mobile uses local notifications — no FCM token needed
    return { value: 'tauri-local', runtime: 'tauri', timestamp: Date.now() };
  }

  // Web Push
  return registerWebPush();
}

async function registerCapacitorPush(): Promise<PushToken | null> {
  try {
    const mod = await import(/* @vite-ignore */ '@capacitor/push-notifications');
    const PushNotifications = mod.PushNotifications;

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return null;

    await PushNotifications.register();

    return new Promise((resolve) => {
      PushNotifications.addListener('registration', (token: { value: string }) => {
        cachedToken = { value: token.value, runtime: 'capacitor', timestamp: Date.now() };
        resolve(cachedToken);
      });

      PushNotifications.addListener('registrationError', () => {
        resolve(null);
      });
    });
  } catch {
    return null;
  }
}

async function registerWebPush(): Promise<PushToken | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(getVapidPublicKey()) as BufferSource,
    });

    const token = JSON.stringify(subscription.toJSON());
    cachedToken = { value: token, runtime: 'web', timestamp: Date.now() };
    return cachedToken;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Notification channels (Android)
// ---------------------------------------------------------------------------

export interface NotificationChannel {
  id: NotificationCategory | 'system';
  name: string;
  description: string;
  importance: 1 | 2 | 3 | 4 | 5;
  sound?: string;
  vibration?: boolean;
}

const CHANNELS: NotificationChannel[] = [
  {
    id: 'ev-ready',
    name: 'EV Charging',
    description: 'EV charging complete and fault notifications',
    importance: 4,
    vibration: true,
  },
  {
    id: 'tariff-spike',
    name: 'Tariff Alerts',
    description: 'Price spike and drop notifications',
    importance: 3,
    vibration: false,
  },
  {
    id: 'tariff-drop',
    name: 'Low Tariff',
    description: 'Low electricity price alerts',
    importance: 3,
    vibration: false,
  },
  {
    id: 'battery-low',
    name: 'Battery Alerts',
    description: 'Battery state of charge warnings',
    importance: 4,
    vibration: true,
  },
  {
    id: 'grid-anomaly',
    name: 'Grid Alerts',
    description: 'Grid voltage anomaly notifications',
    importance: 5,
    vibration: true,
  },
  {
    id: 'system',
    name: 'System',
    description: 'App updates and connectivity',
    importance: 2,
    vibration: false,
  },
];

/**
 * Creates Android notification channels (required for Android 8+).
 * No-op on iOS and Web.
 */
export async function createNotificationChannels(): Promise<void> {
  const runtime = detectRuntime();

  if (runtime === 'capacitor') {
    try {
      const mod = await import(/* @vite-ignore */ '@capacitor/local-notifications');
      const LocalNotifications = mod.LocalNotifications;
      for (const channel of CHANNELS) {
        await LocalNotifications.createChannel({
          id: channel.id,
          name: channel.name,
          description: channel.description,
          importance: channel.importance,
          visibility: 1,
          vibration: channel.vibration ?? false,
        });
      }
    } catch {
      // Local notifications plugin not available
    }
  }
}

// ---------------------------------------------------------------------------
// Show mobile notification (cross-runtime)
// ---------------------------------------------------------------------------

export interface MobileNotificationPayload {
  id: number;
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Record<string, string>;
}

let notificationIdCounter = 1;

/**
 * Shows a local notification on the device.
 * Uses Capacitor LocalNotifications on mobile or falls back to the
 * existing web notification system.
 */
export async function showMobileNotification(
  payload: Omit<MobileNotificationPayload, 'id'>,
): Promise<void> {
  const runtime = detectRuntime();
  const id = notificationIdCounter++;

  if (runtime === 'capacitor') {
    try {
      const mod = await import(/* @vite-ignore */ '@capacitor/local-notifications');
      const LocalNotifications = mod.LocalNotifications;
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: payload.title,
            body: payload.body,
            channelId: payload.category,
            extra: payload.data,
          },
        ],
      });
      return;
    } catch {
      // Fall through to web
    }
  }

  // Tauri and Web are handled by the existing notifications.ts
  const { showNotification } = await import('./notifications');
  await showNotification({
    id: `mobile-${id}`,
    category: payload.category,
    title: payload.title,
    body: payload.body,
  });
}

// ---------------------------------------------------------------------------
// Capacitor push event listeners
// ---------------------------------------------------------------------------

type PushHandler = (notification: {
  title?: string;
  body?: string;
  data?: Record<string, string>;
}) => void;

let pushListenersAttached = false;

/**
 * Attaches listeners for incoming push notifications (Capacitor only).
 * Calls the handler when a push notification is received while the app is in foreground.
 */
export async function attachPushListeners(onReceive: PushHandler): Promise<() => void> {
  if (pushListenersAttached) return () => {};
  const runtime = detectRuntime();

  if (runtime !== 'capacitor') return () => {};

  try {
    const mod = await import(/* @vite-ignore */ '@capacitor/push-notifications');
    const PushNotifications = mod.PushNotifications;

    const received = await PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: { title?: string; body?: string; data?: Record<string, unknown> }) => {
        onReceive({
          ...(notification.title != null && { title: notification.title }),
          ...(notification.body != null && { body: notification.body }),
          ...(notification.data != null && { data: notification.data as Record<string, string> }),
        });
      },
    );

    const actionPerformed = await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: {
        notification: { title?: string; body?: string; data?: Record<string, unknown> };
      }) => {
        onReceive({
          ...(action.notification.title != null && { title: action.notification.title }),
          ...(action.notification.body != null && { body: action.notification.body }),
          ...(action.notification.data != null && {
            data: action.notification.data as Record<string, string>,
          }),
        });
      },
    );

    pushListenersAttached = true;

    return () => {
      received.remove();
      actionPerformed.remove();
      pushListenersAttached = false;
    };
  } catch {
    return () => {};
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getVapidPublicKey(): string {
  // In production, replace with your VAPID public key from the server
  return 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkOs-N_Brjb_TqVah1DQNxO-98sCCRY0tlkQPKp5HY';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

/** Returns the cached push token if available */
export function getCachedToken(): PushToken | null {
  return cachedToken;
}
