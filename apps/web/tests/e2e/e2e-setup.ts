import type { Page } from '@playwright/test';

/** Shape of `/api/health` used by Playwright route mocks. */
export interface MockHealthBody {
  status: string;
  mode: 'mock' | 'live';
  readOnly: boolean;
  adapters: string[];
}

/** Default `/api/health` payload for Playwright route mocks. */
export const MOCK_HEALTH_BODY: MockHealthBody = {
  status: 'healthy',
  mode: 'mock',
  readOnly: false,
  adapters: [],
};

/**
 * Mock `GET /api/health` for safety/mode E2E scenarios.
 */
export async function mockBackendHealth(
  page: Page,
  overrides: Partial<MockHealthBody> = {},
): Promise<void> {
  const body = { ...MOCK_HEALTH_BODY, ...overrides };
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/**
 * Navigate and wait until the health poll has completed.
 */
export async function gotoAndWaitForHealth(page: Page, path = './'): Promise<void> {
  const healthResponse = page.waitForResponse((res) => res.url().includes('/api/health'));
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await healthResponse;
}

/**
 * Replace WebSocket with a controllable mock for backend WS consumer E2E tests.
 * Requires `VITE_BACKEND_WS=true` at build time.
 */
export function setupMockBackendWebSocket(): void {
  class MockWebSocket implements WebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = MockWebSocket.CONNECTING;
    readonly OPEN = MockWebSocket.OPEN;
    readonly CLOSING = MockWebSocket.CLOSING;
    readonly CLOSED = MockWebSocket.CLOSED;

    binaryType: BinaryType = 'blob';
    bufferedAmount = 0;
    extensions = '';
    protocol = '';
    url: string;
    readyState = MockWebSocket.CONNECTING;

    onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
    onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
    onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
    onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;

    constructor(url: string | URL, _protocols?: string | string[]) {
      this.url = typeof url === 'string' ? url : url.href;
      (window as Window & { __mockBackendWs?: MockWebSocket }).__mockBackendWs = this;
      setTimeout(() => {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.call(this, new Event('open'));
      }, 0);
    }

    close(_code?: number, _reason?: string): void {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.call(this, new CloseEvent('close'));
    }

    send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      /* consumer is receive-only for ENERGY_UPDATE */
    }

    addEventListener(): void {
      /* E2E mock — handlers wired via on* properties */
    }

    removeEventListener(): void {
      /* E2E mock */
    }

    dispatchEvent(): boolean {
      return true;
    }
  }

  window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
}

/**
 * Shared E2E setup: seed the persisted store in localStorage.
 * Call this inside addInitScript() in every test's beforeEach.
 */
export function setupLocalStorage(): void {
  localStorage.setItem('nexus-hems-store', JSON.stringify({ state: {}, version: 0 }));
}

/** Minimal JWT-shaped token with a future `exp` for offline-sync E2E mocks. */
export function seedE2eAuthToken(): void {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      sub: 'e2e-user',
      scope: 'readwrite',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  localStorage.setItem('nexus-hems-auth-token', `${header}.${payload}.e2e-signature`);
}

/**
 * Seed a conflicted `syncState` row in Dexie after the app has opened IndexedDB.
 * Dispatches the sync-conflict event so `OfflineSyncConflictBanner` refreshes.
 */
export async function seedSyncConflictState(): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('nexus-hems-dash');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('syncState', 'readwrite');
    tx.objectStore('syncState').put({
      key: 'settings',
      lastSyncedAt: Date.now() - 60_000,
      serverVersion: '10',
      localRevision: 0,
      hasConflict: true,
      updatedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('syncState write failed'));
  });

  db.close();
  window.dispatchEvent(
    new CustomEvent('nexus-hems-sync-conflict', { detail: { domain: 'settings' } }),
  );
}

/** Console errors that are benign in preview/E2E (meta-CSP limitations, etc.). */
const IGNORED_CONSOLE_ERRORS = [
  "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.",
  'Content Security Policy directive',
];

/**
 * Attach listeners that collect uncaught page errors and React render errors
 * (React #185 / boundary logs — which are swallowed by error boundaries and so
 * never fire `pageerror`). Returns the live arrays for assertions. Shared by the
 * monitoring + animation-crash-sweep specs so the capture regex stays in sync.
 */
export function attachReactErrorWatcher(page: Page): {
  pageErrors: string[];
  reactErrors: string[];
} {
  const pageErrors: string[] = [];
  const reactErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(`${error.name}: ${error.message}\n${error.stack ?? '(no stack)'}`);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Minified React error #\d+|Maximum update depth|\[ErrorBoundary\]/.test(text)) {
      reactErrors.push(text);
    }
  });
  return { pageErrors, reactErrors };
}

/**
 * Attach page-error listeners that fail the current test on uncaught
 * exceptions. Console errors are logged only — strict CSP preview builds
 * emit benign style-src noise from third-party libs (axe, motion).
 */
export function attachPageErrorHandler(page: Page): void {
  page.on('pageerror', (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (IGNORED_CONSOLE_ERRORS.some((ignored) => text.includes(ignored))) {
        return;
      }
      // Log but do not fail — CSP meta-tag and inline-style warnings are expected in preview.
      console.warn(`[e2e console] ${text}`);
    }
  });
}
