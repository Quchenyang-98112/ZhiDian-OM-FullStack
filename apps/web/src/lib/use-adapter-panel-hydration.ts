import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import type { AdapterEntry, AdapterType } from '../components/adapter-config-types';
import {
  buildAdapterPanelEntriesFromState,
  fetchAdapterPanelCredentials,
} from '../core/adapter-config-panel-hydrate';
import type { EnergyAdapter } from '../core/adapters/EnergyAdapter';
import type { StoredSettings } from '../types';

type HydrationInput = {
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  setAdapters: (entries: AdapterEntry[]) => void;
  adapterCounter: MutableRefObject<number>;
  settings: StoredSettings;
  adapters: Record<string, { enabled: boolean; adapter: EnergyAdapter }>;
  defaultName: (type: AdapterType) => string;
};

/** Hydrate adapter panel entries from registry state and credential vault (once per mount). */
export function useAdapterPanelHydration({
  hydrated,
  setHydrated,
  setAdapters,
  adapterCounter,
  settings,
  adapters,
  defaultName,
}: HydrationInput): void {
  const settingsRef = useRef(settings);
  const adaptersRef = useRef(adapters);
  const defaultNameRef = useRef(defaultName);

  settingsRef.current = settings;
  adaptersRef.current = adapters;
  defaultNameRef.current = defaultName;

  useEffect(() => {
    if (hydrated) return;

    let cancelled = false;

    void (async () => {
      try {
        const credentials = await fetchAdapterPanelCredentials();
        if (cancelled) return;
        const entries = buildAdapterPanelEntriesFromState({
          settings: settingsRef.current,
          adapters: adaptersRef.current,
          credentials,
          defaultName: (type) => defaultNameRef.current(type),
        });
        adapterCounter.current = entries.length;
        setAdapters(entries);
        setHydrated(true);
      } catch {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adapterCounter, hydrated, setAdapters, setHydrated]);
}
