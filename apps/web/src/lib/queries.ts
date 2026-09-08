import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Comlink from 'comlink';
import type { EnergyData } from '../types';
import type { AIWorkerAPI } from '../workers/worker-types';
import type { TariffProvider } from './predictive-ai';

// Singleton AI worker for query hooks — shared across all usePriceForecast calls
let _aiWorker: Comlink.Remote<AIWorkerAPI> | null = null;
function getAIWorkerProxy(): Comlink.Remote<AIWorkerAPI> {
  if (!_aiWorker) {
    const w = new Worker(new URL('../workers/ai-worker.ts', import.meta.url), {
      type: 'module',
    });
    _aiWorker = Comlink.wrap<AIWorkerAPI>(w);
  }
  return _aiWorker;
}

// ─── Live Energy Data (push-based via useAdapterBridge) ──────────────

/**
 * Hook to read live energy data from the TanStack Query cache.
 *
 * Data is pushed into the cache by useAdapterBridge via queryClient.setQueryData.
 * staleTime: Infinity ensures React Query **never** refetches on its own —
 * Zustand + adapters are the single source of truth for real-time data.
 *
 * Use this hook when components need TanStack Query benefits (Suspense,
 * error boundaries, devtools inspection) alongside Zustand.
 */
export function useEnergyLive() {
  return useQuery<EnergyData | null>({
    queryKey: ['energy-live'],
    queryFn: () => null, // Never called — data arrives via setQueryData
    staleTime: Infinity, // Push-based: adapters update cache directly
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 min after unmount
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

// ─── Tariff Price Forecast ───────────────────────────────────────────

/**
 * Hook to fetch tariff price forecast for the next 24 hours.
 * Price history generation + forecast analysis run in the AI Web Worker.
 */
export function usePriceForecast(provider: TariffProvider = 'tibber') {
  return useQuery({
    queryKey: ['price-forecast', provider],
    queryFn: async () => {
      const api = getAIWorkerProxy();
      const prices = await api.computePriceHistory(24);
      const forecast = await api.computeForecast(prices);
      return {
        prices: prices.map((p) => ({ ...p, timestamp: new Date(p.timestamp) })),
        forecast,
      };
    },
    staleTime: 1000 * 60 * 15, // 15 min — tariff data changes infrequently
    gcTime: 1000 * 60 * 60, // 1 h cache
    retry: 3,
  });
}

// ─── Weather Forecast ────────────────────────────────────────────────

/**
 * Hook to fetch weather forecast data for PV prediction.
 * Uses Open-Meteo free API (no API key needed).
 */
export function useWeatherForecast(lat: number = 52.52, lon: number = 13.405) {
  return useQuery<{
    hourly: {
      time: string[];
      temperature_2m: number[];
      cloudcover: number[];
      shortwave_radiation: number[];
      relative_humidity_2m?: number[];
      cloud_cover?: number[];
      direct_radiation?: number[];
      diffuse_radiation?: number[];
    };
  }>({
    queryKey: ['weather-forecast', lat, lon],
    queryFn: async () => {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,cloudcover,shortwave_radiation&forecast_days=7`,
      );
      if (!response.ok) throw new Error('Weather API failed');
      return response.json();
    },
    staleTime: 1000 * 60 * 60, // 1 h — weather data is slow-changing
    gcTime: 1000 * 60 * 60 * 2, // 2 h cache
    retry: 2,
  });
}

// ─── Offline Energy Snapshot ─────────────────────────────────────────

/**
 * Hook to get latest cached energy snapshot for offline fallback.
 * Snapshots are pushed by useAdapterBridge into ['energy-snapshot', timestamp].
 */
export function useLatestEnergySnapshot() {
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryCache();

  return useQuery({
    queryKey: ['latest-energy-snapshot'],
    queryFn: () => {
      const snapshots = cache
        .findAll({ queryKey: ['energy-snapshot'] })
        .filter((query) => query.state.data)
        .sort((a, b) => {
          const timestampA = (a.queryKey[1] as number) || 0;
          const timestampB = (b.queryKey[1] as number) || 0;
          return timestampB - timestampA;
        });

      if (snapshots.length === 0) return null;

      const latest = snapshots[0];
      const timestamp = latest.queryKey[1] as number;
      const age = Date.now() - timestamp;

      return {
        data: latest.state.data,
        timestamp,
        age,
        ageMinutes: Math.floor(age / 1000 / 60),
      };
    },
    staleTime: Infinity, // Only refetch manually when needed
    gcTime: 1000 * 60 * 5,
  });
}
