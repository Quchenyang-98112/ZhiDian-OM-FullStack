/**
 * useSecureStore — React hook for per-adapter encrypted credential management
 *
 * Provides reactive state for the BYOK credential vault:
 *   - Save/load/delete per-adapter credentials (AES-GCM 256-bit)
 *   - Lists stored adapters without decrypting
 *   - Vault status (locked / unlocked based on session)
 *
 * Usage:
 *   const { save, load, remove, storedAdapters, vaultReady } = useSecureStore();
 *   await save('ocpp-21', { authToken: 'secret', clientCert: pemBase64 });
 */

import { useEffect, useState } from 'react';
import type { AdapterCredentialId, AdapterCredentials } from '../lib/secure-store';
import {
  clearVault,
  getAdapterCredentials,
  listAdapterCredentials,
  removeAdapterCredentials,
  saveAdapterCredentials,
} from '../lib/secure-store';

interface StoredAdapterInfo {
  adapterId: AdapterCredentialId;
  updatedAt: number;
}

interface SecureStoreState {
  storedAdapters: StoredAdapterInfo[];
  vaultReady: boolean;
  loading: boolean;
  error: string | null;
}

export function useSecureStore() {
  const [state, setState] = useState<SecureStoreState>({
    storedAdapters: [],
    vaultReady: false,
    loading: true,
    error: null,
  });

  // Load stored adapter list on mount
  useEffect(() => {
    const init = async () => {
      try {
        const adapters = await listAdapterCredentials();
        setState({
          storedAdapters: adapters,
          vaultReady: typeof crypto?.subtle !== 'undefined',
          loading: false,
          error: null,
        });
      } catch {
        setState((prev) => ({
          ...prev,
          vaultReady: false,
          loading: false,
          error: 'Failed to initialize secure store',
        }));
      }
    };
    void init();
  }, []);

  const refresh = async () => {
    const adapters = await listAdapterCredentials();
    setState((prev) => ({ ...prev, storedAdapters: adapters }));
  };

  const save = async (
    adapterId: AdapterCredentialId,
    credentials: AdapterCredentials,
  ): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await saveAdapterCredentials(adapterId, credentials);
      await refresh();
      setState((prev) => ({ ...prev, loading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to save credentials',
      }));
    }
  };

  const load = async (adapterId: AdapterCredentialId): Promise<AdapterCredentials | null> => {
    try {
      return await getAdapterCredentials(adapterId);
    } catch {
      return null;
    }
  };

  const remove = async (adapterId: AdapterCredentialId): Promise<void> => {
    await removeAdapterCredentials(adapterId);
    await refresh();
  };

  const resetVault = async (): Promise<void> => {
    await clearVault();
    setState({
      storedAdapters: [],
      vaultReady: typeof crypto?.subtle !== 'undefined',
      loading: false,
      error: null,
    });
  };

  return {
    save,
    load,
    remove,
    resetVault,
    storedAdapters: state.storedAdapters,
    vaultReady: state.vaultReady,
    loading: state.loading,
    error: state.error,
  };
}
