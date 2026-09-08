/**
 * Adapter mode resolution — safety-critical default.
 *
 * ADAPTER_MODE defaults to `mock` everywhere. Live hardware requires an
 * explicit double opt-in: ADAPTER_MODE=live AND ALLOW_LIVE_HARDWARE=true.
 *
 * See docs/Safety-Certification-Notice.md before enabling live mode.
 */

export type AdapterMode = 'mock' | 'live';

const LIVE_HARDWARE_ACK = 'true';

function normalizeRawMode(value: string | undefined): string {
  return (value ?? 'mock').trim().toLowerCase();
}

/**
 * Resolve the effective adapter mode from environment variables.
 * Unknown values fall back to `mock` with a warning.
 */
export function resolveAdapterMode(env: NodeJS.ProcessEnv = process.env): AdapterMode {
  const raw = normalizeRawMode(env.ADAPTER_MODE);

  if (raw === 'mock') return 'mock';
  if (raw === 'live') return 'live';

  console.warn(
    `[Adapters] Invalid ADAPTER_MODE="${env.ADAPTER_MODE ?? ''}" — falling back to "mock".`,
  );
  return 'mock';
}

/**
 * Whether live hardware adapters are permitted to start.
 * Requires both ADAPTER_MODE=live and ALLOW_LIVE_HARDWARE=true.
 */
export function isLiveHardwareAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (resolveAdapterMode(env) !== 'live') return false;
  return env.ALLOW_LIVE_HARDWARE?.trim().toLowerCase() === LIVE_HARDWARE_ACK;
}

export function isMockAdapterMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isLiveHardwareAllowed(env);
}

/**
 * Log startup guidance when live mode is requested but not fully acknowledged.
 */
export function logAdapterModeStartup(env: NodeJS.ProcessEnv = process.env): AdapterMode {
  const requested = resolveAdapterMode(env);

  if (requested === 'mock') {
    console.log('[Adapters] ADAPTER_MODE=mock — hardware adapters disabled (safe default).');
    return 'mock';
  }

  if (!isLiveHardwareAllowed(env)) {
    console.warn(
      '[Adapters] ADAPTER_MODE=live requested but ALLOW_LIVE_HARDWARE is not set to "true".',
    );
    console.warn(
      '[Adapters] Hardware adapters will NOT start. Set ALLOW_LIVE_HARDWARE=true only after',
    );
    console.warn(
      '[Adapters] completing the pre-deployment checklist in docs/Safety-Certification-Notice.md',
    );
    return 'mock';
  }

  console.warn(
    '[Adapters] LIVE HARDWARE MODE ACTIVE — no regulatory certification. Proceed with caution.',
  );
  return 'live';
}

/**
 * Effective mode used by protocol adapters and health checks.
 */
export function getEffectiveAdapterMode(env: NodeJS.ProcessEnv = process.env): AdapterMode {
  return isLiveHardwareAllowed(env) ? 'live' : 'mock';
}
