import { useEffect } from 'react';
import { useAppStore } from '../store';
import { fetchBackendHealthStatus, setRuntimeBackendReadOnly } from './adapter-mode';
import { ignorePromiseRejection } from './ignore-promise-rejection';

/**
 * Poll `/api/health` once on mount for global safety indicators (mode + read-only).
 *
 * Writes adapter mode and read-only state into Zustand for reactive UI consumers.
 */
export const useBackendHealthPoll = (): void => {
  useEffect(() => {
    const { setAdapterMode, setBackendReadOnly } = useAppStore.getState();
    const controller = new AbortController();
    fetchBackendHealthStatus(controller.signal)
      .then(({ mode, readOnly }) => {
        setAdapterMode(mode);
        setBackendReadOnly(readOnly);
        // Non-React command-safety path reads the module flag synchronously.
        setRuntimeBackendReadOnly(readOnly);
      })
      .catch(ignorePromiseRejection);
    return () => {
      controller.abort();
    };
  }, []);
};
