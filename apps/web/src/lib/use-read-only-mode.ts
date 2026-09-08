import { useAppStore } from '../store';

const LIVE_HARDWARE_ACK = 'true';

/**
 * Pure read-only resolver — use when `backendReadOnly` is already selected from the store.
 */
export function resolveReadOnlyModeActive(backendReadOnly: boolean): boolean {
  if (import.meta.env.VITE_READ_ONLY_MODE?.trim().toLowerCase() === LIVE_HARDWARE_ACK) {
    return true;
  }
  return backendReadOnly;
}

/**
 * React hook — re-renders when the backend health poll updates read-only state.
 *
 * Prefer this in components; use {@link isReadOnlyModeActive} in non-React code paths.
 */
export function useReadOnlyModeActive(): boolean {
  const backendReadOnly = useAppStore((s) => s.backendReadOnly);
  return resolveReadOnlyModeActive(backendReadOnly);
}
