/** Runtime read-only flag from backend `GET /api/health` (not persisted). */
let runtimeBackendReadOnly = false;

/** Update the runtime read-only flag after a successful health poll. */
export const setRuntimeBackendReadOnly = (readOnly: boolean): void => {
  runtimeBackendReadOnly = readOnly;
};

/**
 * Frontend adapter mode — mirrors backend safety defaults.
 *
 * VITE_ADAPTER_MODE defaults to `mock`. Hardware adapters do not auto-connect
 * unless the user explicitly enables them AND live mode is acknowledged.
 *
 * Build-time: VITE_ADAPTER_MODE=live + VITE_ALLOW_LIVE_HARDWARE=true
 * Runtime: user enables adapter in Settings (enableAdapter).
 */

export type FrontendAdapterMode = 'mock' | 'live';

const LIVE_HARDWARE_ACK = 'true';

function normalizeMode(value: string | undefined): string {
  return (value ?? 'mock').trim().toLowerCase();
}

/** Resolved build-time adapter mode (defaults to mock). */
export function resolveFrontendAdapterMode(): FrontendAdapterMode {
  const raw = normalizeMode(import.meta.env.VITE_ADAPTER_MODE);
  if (raw === 'live') return 'live';
  if (raw !== 'mock' && import.meta.env.DEV) {
    console.warn(`[Adapters] Invalid VITE_ADAPTER_MODE="${raw}" — using "mock".`);
  }
  return 'mock';
}

/** Whether the build explicitly allows hardware adapter connections. */
export function isLiveHardwareBuildAllowed(): boolean {
  if (resolveFrontendAdapterMode() !== 'live') return false;
  return import.meta.env.VITE_ALLOW_LIVE_HARDWARE?.trim().toLowerCase() === LIVE_HARDWARE_ACK;
}

/**
 * Default enabled state for built-in adapters on first load.
 * All adapters start disabled — demo data is served via EnergyContext.
 */
export function isBuiltinAdapterEnabledByDefault(): boolean {
  return false;
}

/**
 * Whether an enabled adapter may attempt a hardware connection.
 * Requires live build acknowledgement; user must still enable the adapter.
 */
export function canConnectHardwareAdapter(adapterEnabled: boolean): boolean {
  if (!adapterEnabled) return false;
  return isLiveHardwareBuildAllowed();
}

export type BackendAdapterMode = 'mock' | 'live' | 'unknown';

/** Parsed fields from `GET /api/health` used for global safety indicators. */
export interface BackendHealthStatus {
  mode: BackendAdapterMode;
  readOnly: boolean;
}

/**
 * Fetch backend health status from `GET /api/health`.
 *
 * Parses body regardless of HTTP status — a live backend with no adapters
 * configured returns 503 but is still `live`. Network/parse failures resolve
 * to `{ mode: 'unknown', readOnly: false }`.
 */
export async function fetchBackendHealthStatus(signal?: AbortSignal): Promise<BackendHealthStatus> {
  try {
    const res = await fetch('/api/health', {
      signal: signal ?? null,
      headers: { Accept: 'application/json' },
    });
    const data = (await res.json().catch(() => null)) as {
      mode?: unknown;
      readOnly?: unknown;
    } | null;
    const mode: BackendAdapterMode =
      data?.mode === 'live' ? 'live' : data?.mode === 'mock' ? 'mock' : 'unknown';
    return { mode, readOnly: data?.readOnly === true };
  } catch {
    return { mode: 'unknown', readOnly: false };
  }
}

/** @deprecated Prefer {@link fetchBackendHealthStatus} — mode slice only. */
export async function fetchBackendAdapterMode(signal?: AbortSignal): Promise<BackendAdapterMode> {
  return (await fetchBackendHealthStatus(signal)).mode;
}

/**
 * Whether the global safety indicator should treat the system as driving LIVE
 * hardware. True when the backend reports `live` OR the frontend build itself
 * permits hardware connections. Everything else (mock / unknown) is simulation.
 */
export function isLiveSafetyMode(backendMode: BackendAdapterMode): boolean {
  return backendMode === 'live' || isLiveHardwareBuildAllowed();
}

/**
 * Check if read-only mode is active (blocks all control commands).
 *
 * True when either the build sets `VITE_READ_ONLY_MODE=true` or the backend
 * reports `readOnly: true` on `/api/health` (runtime `READ_ONLY_MODE`).
 */
export function isReadOnlyModeActive(): boolean {
  if (import.meta.env.VITE_READ_ONLY_MODE?.trim().toLowerCase() === LIVE_HARDWARE_ACK) {
    return true;
  }
  return runtimeBackendReadOnly;
}

/**
 * Whether the browser should open a WebSocket to the HEMS backend to consume
 * server-pushed `ENERGY_UPDATE` broadcasts (HIGH-17 / ADR-018 live path).
 *
 * Default OFF: the GitHub Pages static demo and standard PWA builds run the
 * protocol adapters client-side (see `useAdapterBridge`) and never open this
 * socket. Full-stack deployments where the Express API is reachable set
 * `VITE_BACKEND_WS=true` to consume the backend
 * EventBus → LiveEnergyAggregator broadcast instead.
 */
export function isBackendWsEnabled(): boolean {
  return import.meta.env.VITE_BACKEND_WS?.trim().toLowerCase() === LIVE_HARDWARE_ACK;
}

/** How the chrome should label adapter connectivity (sidebar, page headers). */
export type ConnectionPresentation = 'connected' | 'disconnected' | 'simulation';

/**
 * Resolve connection chrome for static demos and mock backends: when live
 * hardware is not active, show "Simulation" instead of a false "Disconnected"
 * alarm. Full-stack builds with `VITE_BACKEND_WS` keep `unknown` as
 * disconnected until `/api/health` resolves to `mock`. Only `live` backend mode
 * (or a live-capable frontend build) shows disconnected while adapters and the
 * optional backend WebSocket are offline.
 */
export function resolveConnectionPresentation(
  connected: boolean,
  backendMode: BackendAdapterMode,
  serverWsConnected = false,
): ConnectionPresentation {
  if (connected || (isBackendWsEnabled() && serverWsConnected)) return 'connected';
  if (backendMode === 'unknown' && isBackendWsEnabled()) return 'disconnected';
  if (!isLiveSafetyMode(backendMode)) return 'simulation';
  return 'disconnected';
}

/**
 * Whether the browser should offload Modbus SunSpec REST polling to the
 * adapter Web Worker (MED-12). Requires live hardware acknowledgement — same
 * safety gate as `canConnectHardwareAdapter`.
 */
export function isAdapterWorkerEnabled(): boolean {
  if (!isLiveHardwareBuildAllowed()) return false;
  return import.meta.env.VITE_ADAPTER_WORKER?.trim().toLowerCase() === LIVE_HARDWARE_ACK;
}
