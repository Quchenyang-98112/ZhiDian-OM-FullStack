/**
 * useEnergyStore — Central adapter aggregation store
 *
 * This Zustand store manages adapter lifecycle, merges data from all active
 * adapters into a single UnifiedEnergyModel, and bridges backwards to the
 * existing useAppStore for 100% compatibility with current components.
 *
 * Performance: useEnergyStore() uses useShallow by default so components
 * only re-render when their selected slice actually changes (shallow compare).
 *
 * Usage in pages:
 *   const { pv, battery } = useEnergyStore((s) => ({ pv: s.unified.pv, battery: s.unified.battery }));
 *
 * Page-level adapter selection:
 *   const evCharger = useEnergyStore((s) => s.unified.evCharger);
 */

import {
  sanitizeObjectStrings,
  sanitizeUntrustedText,
  WSMessageSchema,
} from '@nexus-hems/shared-types';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  canConnectHardwareAdapter,
  isAdapterWorkerEnabled,
  isBuiltinAdapterEnabledByDefault,
} from '../lib/adapter-mode';
import { persistSnapshot } from '../lib/db';
import { logger } from '../lib/logger';
import { queryClient } from '../lib/query-client';
import { useAppStore } from '../store';
import { createRegisteredAdapter, registerBuiltinAdapters } from './adapters/adapter-registry';
import type { BaseAdapter } from './adapters/BaseAdapter';
import type {
  AdapterCommand,
  AdapterConnectionConfig,
  AdapterStatus,
  EnergyAdapter,
  UnifiedEnergyModel,
} from './adapters/EnergyAdapter';
import { ModbusSunSpecAdapter } from './adapters/ModbusSunSpecAdapter';
import type { CircuitState } from './circuit-breaker';
import { unregisterCommandProvider } from './commands/command-registry';
import { mapServerEnergyDataToUnified } from './server-energy-mapping';
import { useAdapterWorker } from './useAdapterWorker';

// ─── Adapter registry ────────────────────────────────────────────────

/** Built-in adapter identifiers */
export type BuiltinAdapterId = 'victron-mqtt' | 'modbus-sunspec' | 'knx' | 'ocpp-21' | 'eebus';

/** Adapter ID — built-in or dynamically registered contrib/npm adapter */
export type AdapterId = BuiltinAdapterId | (string & {});

export interface AdapterEntry {
  adapter: EnergyAdapter;
  enabled: boolean;
  status: AdapterStatus;
  error?: string | undefined;
  circuitState: CircuitState;
}

/** One time-series snapshot appended to the ring buffer on every 250 ms flush */
export type HistoryPoint = UnifiedEnergyModel & { ts: number };

export interface EnergyStoreState {
  /** Merged model from all adapters */
  unified: UnifiedEnergyModel;
  /** Per-adapter status */
  adapters: Record<AdapterId, AdapterEntry>;
  /** Whether at least one adapter is connected */
  anyConnected: boolean;
  /** Timestamp of last data update */
  lastUpdated: number | null;
  /** Sliding-window ring buffer — up to 1 000 flushed snapshots, newest last */
  history: HistoryPoint[];
  /**
   * Whether the optional backend WebSocket consumer (`useServerWebSocket`,
   * gated by `VITE_BACKEND_WS`) is currently connected. `false` for the
   * default client-side-adapter build where the socket is never opened.
   */
  serverWsConnected: boolean;

  // Actions
  mergeData: (adapterId: string, data: Partial<UnifiedEnergyModel>) => void;
  /** Reflect the backend WebSocket connection state (see `useServerWebSocket`) */
  setServerWsConnected: (connected: boolean) => void;
  setAdapterStatus: (adapterId: AdapterId, status: AdapterStatus, error?: string) => void;
  enableAdapter: (adapterId: AdapterId, enabled: boolean) => void;
  /** Replace a built-in adapter instance with a new config (e.g. after Settings save). */
  reconfigureAdapter: (
    adapterId: AdapterId,
    config: Partial<AdapterConnectionConfig> & Record<string, unknown>,
    enabled: boolean,
  ) => void;
  /** Add a dynamically loaded contrib/npm adapter to the store */
  addContribAdapter: (id: string, config?: Partial<AdapterConnectionConfig>) => boolean;
  /** Remove a contrib adapter from the store */
  removeContribAdapter: (id: string) => boolean;
}

// ─── Default empty model ─────────────────────────────────────────────

const emptyModel: UnifiedEnergyModel = {
  timestamp: 0,
  pv: { totalPowerW: 0, yieldTodayKWh: 0 },
  battery: { powerW: 0, socPercent: 0, voltageV: 51.2, currentA: 0 },
  grid: { powerW: 0, voltageV: 230 },
  load: { totalPowerW: 0, heatPumpPowerW: 0, evPowerW: 0, otherPowerW: 0 },
};

// ─── Adapter factory ─────────────────────────────────────────────────

// Ensure built-in adapters are registered in the global registry
registerBuiltinAdapters();

function createAdapterInstance(
  id: AdapterId,
  config?: Partial<AdapterConnectionConfig>,
): EnergyAdapter {
  // Use the global adapter registry (built-in + contrib/npm adapters)
  const adapter = createRegisteredAdapter(id, config);
  if (adapter) return adapter;

  throw new Error(
    `[useEnergyStore] Unknown adapter id: "${id}". Register it via registerAdapter() first.`,
  );
}

function createDefaultAdapters(): Record<AdapterId, AdapterEntry> {
  const enabledByDefault = isBuiltinAdapterEnabledByDefault();

  return {
    'victron-mqtt': {
      adapter: createAdapterInstance('victron-mqtt'),
      enabled: enabledByDefault,
      status: 'disconnected',
      circuitState: 'closed',
    },
    'modbus-sunspec': {
      adapter: createAdapterInstance('modbus-sunspec', { host: 'localhost' }),
      enabled: false,
      status: 'disconnected',
      circuitState: 'closed',
    },
    knx: {
      adapter: createAdapterInstance('knx', { host: 'localhost' }),
      enabled: false,
      status: 'disconnected',
      circuitState: 'closed',
    },
    'ocpp-21': {
      adapter: createAdapterInstance('ocpp-21'),
      enabled: false,
      status: 'disconnected',
      circuitState: 'closed',
    },
    eebus: {
      adapter: createAdapterInstance('eebus', { host: 'localhost' }),
      enabled: false,
      status: 'disconnected',
      circuitState: 'closed',
    },
  };
}

// ─── 250 ms UI-throttle accumulator ─────────────────────────────────
// WS frames can arrive every 10–100 ms. Accumulate all incoming partials
// and flush to Zustand at most once per UI_THROTTLE_MS to keep re-render
// pressure off the main thread.

const UI_THROTTLE_MS = 250;

/**
 * Per-adapter maximum ring-buffer snapshot count.
 * Replaces the fixed 1 000-item global cap — reduces memory ~80% for typical
 * 10-adapter setups by only keeping as many points as each adapter needs.
 * The effective global ring buffer max is the sum of sizes for all *enabled* adapters.
 */
export const RING_BUFFER_SIZES: Readonly<Record<string, number>> = {
  'ocpp-21': 500,
  'victron-mqtt': 200,
  eebus: 200,
  'modbus-sunspec': 150,
  knx: 100,
  'homeassistant-mqtt': 200,
  zigbee2mqtt: 150,
  'shelly-rest': 100,
  'matter-thread': 100,
  default: 100,
};

/** Compute the effective ring-buffer cap from all enabled adapters. */
function computeHistoryMax(adapters: Record<string, AdapterEntry>): number {
  let total = 0;
  for (const [id, entry] of Object.entries(adapters)) {
    if (entry.enabled) {
      total += RING_BUFFER_SIZES[id] ?? RING_BUFFER_SIZES.default;
    }
  }
  // Fallback: if no adapter is enabled yet, use a sensible default
  return total > 0 ? total : RING_BUFFER_SIZES.default;
}

let _pendingMerge: Partial<UnifiedEnergyModel> | null = null;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Store ───────────────────────────────────────────────────────────

export const useEnergyStoreBase = create<EnergyStoreState>()((set) => ({
  unified: { ...emptyModel },
  adapters: createDefaultAdapters(),
  anyConnected: false,
  lastUpdated: null,
  history: [],
  serverWsConnected: false,

  mergeData: (_adapterId, data) => {
    const sanitizedData = sanitizeObjectStrings(data, 128);
    // Accumulate into pending buffer; single flush dispatched per 250 ms window
    if (_pendingMerge) {
      accumulatePending(_pendingMerge, sanitizedData);
    } else {
      _pendingMerge = { ...sanitizedData };
    }
    if (_flushTimer === null) {
      _flushTimer = setTimeout(flushMerge, UI_THROTTLE_MS);
    }
  },

  setServerWsConnected: (connected) => {
    set((state) =>
      state.serverWsConnected === connected ? state : { serverWsConnected: connected },
    );
  },

  setAdapterStatus: (adapterId, status, error) => {
    const sanitizedError = error ? sanitizeUntrustedText(error, 160) : undefined;
    set((state) => {
      const entry = state.adapters[adapterId];
      if (!entry) return state;
      // Skip update if status hasn't changed
      if (entry.status === status && entry.error === sanitizedError) return state;

      const newAdapters = {
        ...state.adapters,
        [adapterId]: { ...entry, status, error: sanitizedError },
      };

      const anyConnected = Object.values(newAdapters).some(
        (a) => a.enabled && a.status === 'connected',
      );

      return { adapters: newAdapters, anyConnected };
    });
  },

  enableAdapter: (adapterId, enabled) => {
    set((state) => {
      const entry = state.adapters[adapterId];
      if (!entry) return state;
      return {
        adapters: {
          ...state.adapters,
          [adapterId]: { ...entry, enabled },
        },
      };
    });
  },

  reconfigureAdapter: (adapterId, config, enabled) => {
    const state = useEnergyStoreBase.getState();
    const entry = state.adapters[adapterId];
    if (!entry) return;

    entry.adapter.destroy();

    const connectionConfig: AdapterConnectionConfig = {
      name: typeof config.name === 'string' ? config.name : adapterId,
      host: typeof config.host === 'string' ? config.host : 'localhost',
      port: typeof config.port === 'number' ? config.port : 80,
      ...config,
    };

    const adapter = createAdapterInstance(adapterId, connectionConfig);
    set((s) => ({
      adapters: {
        ...s.adapters,
        [adapterId]: {
          adapter,
          enabled,
          status: 'disconnected' as AdapterStatus,
          circuitState: 'closed' as CircuitState,
        },
      },
    }));
  },

  addContribAdapter: (id, config) => {
    const state = useEnergyStoreBase.getState();
    if (state.adapters[id]) return false; // Already exists

    try {
      const adapter = createAdapterInstance(id, config);
      set((s) => ({
        adapters: {
          ...s.adapters,
          [id]: {
            adapter,
            enabled: false,
            status: 'disconnected' as AdapterStatus,
            circuitState: 'closed' as CircuitState,
          },
        },
      }));
      return true;
    } catch {
      return false;
    }
  },

  removeContribAdapter: (id) => {
    const BUILTIN_IDS: BuiltinAdapterId[] = [
      'victron-mqtt',
      'modbus-sunspec',
      'knx',
      'ocpp-21',
      'eebus',
    ];
    if ((BUILTIN_IDS as string[]).includes(id)) return false;

    const state = useEnergyStoreBase.getState();
    const entry = state.adapters[id];
    if (!entry) return false;

    try {
      entry.adapter.destroy();
    } catch (err) {
      logger.warn(
        'Adapter destroy failed during contrib removal; continuing cleanup',
        'useEnergyStore',
        {
          adapterId: id,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }
    unregisterCommandProvider(id);
    set((s) => {
      const newAdapters = { ...s.adapters };
      delete newAdapters[id];
      return { adapters: newAdapters };
    });
    return true;
  },
}));

// ─── Throttle flush & accumulator ────────────────────────────────────
// Declared with `function` so declarations are hoisted above the
// store's create() call — mergeData() can reference them before they
// appear in the source text.

/** Deep-merge incoming partial into a pending accumulator in place. */
function accumulatePending(
  p: Partial<UnifiedEnergyModel>,
  data: Partial<UnifiedEnergyModel>,
): void {
  if (data.pv) p.pv = p.pv ? { ...p.pv, ...data.pv } : data.pv;
  if (data.battery) p.battery = p.battery ? { ...p.battery, ...data.battery } : data.battery;
  if (data.grid) p.grid = p.grid ? { ...p.grid, ...data.grid } : data.grid;
  if (data.load) p.load = p.load ? { ...p.load, ...data.load } : data.load;
  if (data.timestamp !== undefined) p.timestamp = data.timestamp;
  if (data.evCharger !== undefined) p.evCharger = data.evCharger;
  if (data.knx !== undefined) p.knx = data.knx;
  if (data.tariff !== undefined) p.tariff = data.tariff;
}

function flushMerge(): void {
  _flushTimer = null;
  const pending = _pendingMerge;
  _pendingMerge = null;
  if (!pending) return;
  useEnergyStoreBase.setState((state) => {
    const merged = deepMergeModel(state.unified, pending);
    if (merged === state.unified) return state;
    const ts = Date.now();
    const point: HistoryPoint = { ...merged, ts };
    // Ring buffer: adaptive max based on enabled adapters' RING_BUFFER_SIZES
    const maxPoints = computeHistoryMax(state.adapters);
    const history =
      state.history.length >= maxPoints
        ? [...state.history.slice(1), point]
        : [...state.history, point];
    return { unified: merged, lastUpdated: ts, history };
  });
  flushBridgeSideEffects();
}

/** Throttled bridge: app store, React Query cache, Dexie — once per 250 ms flush. */
function flushBridgeSideEffects(): void {
  const unified = useEnergyStoreBase.getState().unified;
  const legacySnapshot = unifiedToLegacy(unified);

  bridgeToAppStore(unified, useAppStore.getState().setEnergyData);

  queryClient.setQueryData(['energy-live'], legacySnapshot);
  queryClient.setQueryData(['energy-snapshot', Date.now()], legacySnapshot);

  if (unified.timestamp) {
    void persistSnapshot(legacySnapshot);
  }
}

// ─── Deep merge helper (referentially stable) ───────────────────────

/** Shallow-merge two objects, returning the original if nothing changed. */
function stableMerge<T extends object>(base: T, partial: Partial<T>): T {
  const keys = Object.keys(partial) as (keyof T)[];
  if (keys.every((k) => base[k] === partial[k])) return base;
  return { ...base, ...partial };
}

/**
 * Deep-merge adapter data into the unified model.
 * Returns the original `base` reference (===) if no values actually changed,
 * which lets Zustand's shallow selectors skip re-renders.
 */
function deepMergeModel(
  base: UnifiedEnergyModel,
  partial: Partial<UnifiedEnergyModel>,
): UnifiedEnergyModel {
  const pv = partial.pv ? stableMerge(base.pv, partial.pv) : base.pv;
  const battery = partial.battery ? stableMerge(base.battery, partial.battery) : base.battery;
  const grid = partial.grid ? stableMerge(base.grid, partial.grid) : base.grid;
  const load = partial.load ? stableMerge(base.load, partial.load) : base.load;
  const timestamp = partial.timestamp ?? base.timestamp;
  const evCharger = partial.evCharger ?? base.evCharger;
  const knx = partial.knx ?? base.knx;
  const tariff = partial.tariff ?? base.tariff;

  // If every sub-object is the same reference, skip the update
  if (
    pv === base.pv &&
    battery === base.battery &&
    grid === base.grid &&
    load === base.load &&
    timestamp === base.timestamp &&
    evCharger === base.evCharger &&
    knx === base.knx &&
    tariff === base.tariff
  ) {
    return base;
  }

  return { timestamp, pv, battery, grid, load, evCharger, knx, tariff };
}

// ─── Standalone command dispatcher ───────────────────────────────────

/**
 * sendAdapterCommand — Sends a command to connected adapters.
 * When `command.targetAdapterId` is set, only that adapter receives the command.
 * Each adapter's BaseAdapter.sendCommand() runs the full validation
 * pipeline (Zod schema, rate limit, circuit breaker, audit trail).
 *
 * No outer pre-check is performed here on purpose: it would consume a
 * second rate-limit slot per command, halving the documented 30 cmd/min.
 *
 * Returns the real dispatch outcome (resolves true iff at least one connected
 * adapter accepted the command) so callers can surface the true result instead
 * of an optimistic "executed". The authoritative per-adapter audit row is
 * written inside BaseAdapter.sendCommand; this dispatcher does not audit.
 */
export async function sendAdapterCommand(command: AdapterCommand): Promise<boolean> {
  const entries = Object.entries(useEnergyStoreBase.getState().adapters) as [
    AdapterId,
    AdapterEntry,
  ][];
  const dispatches: Promise<boolean>[] = [];
  for (const [id, entry] of entries) {
    if (command.targetAdapterId && id !== command.targetAdapterId) continue;
    if (entry.enabled && entry.status === 'connected') {
      // BaseAdapter.sendCommand() handles CB + validation + confirm + audit internally.
      // A user-cancel throws CommandCancelledError — treat any rejection as "not accepted".
      dispatches.push(Promise.resolve(entry.adapter.sendCommand(command)).catch(() => false));
    }
  }
  if (dispatches.length === 0) return false;
  const results = await Promise.all(dispatches);
  return results.some((accepted) => accepted);
}

// ─── Per-adapter listener wiring (bridge + post-save reconfigure) ────

export interface AttachAdapterEntryOptions {
  sunspecAdapter?: ModbusSunSpecAdapter | null;
  startSunSpecPolling?: (
    adapterId: AdapterId,
    target: ReturnType<ModbusSunSpecAdapter['getWorkerPollConfig']>,
  ) => void;
}

/**
 * Wire circuit-breaker, data, and status callbacks for one adapter entry.
 * Used by useAdapterBridge on mount and after AdapterConfigPanel save.
 */
export function attachAdapterEntry(adapterId: AdapterId, opts?: AttachAdapterEntryOptions): void {
  const entry = useEnergyStoreBase.getState().adapters[adapterId];
  if (!entry) return;

  const { mergeData, setAdapterStatus } = useEnergyStoreBase.getState();
  const baseAdapter = entry.adapter as BaseAdapter;

  baseAdapter.circuitBreaker.onStateChange((circuitState) => {
    useEnergyStoreBase.setState((state) => {
      const existing = state.adapters[adapterId];
      if (!existing) return state;
      return {
        adapters: {
          ...state.adapters,
          [adapterId]: { ...existing, circuitState },
        },
      };
    });

    if (circuitState === 'open') {
      toast.error(`Adapter "${adapterId}" circuit breaker OPEN — too many errors`, {
        id: `cb-open-${adapterId}`,
        duration: 10000,
      });
    } else if (circuitState === 'closed') {
      toast.dismiss(`cb-open-${adapterId}`);
      toast.success(`Adapter "${adapterId}" reconnected`, { duration: 4000 });
    }
  });

  entry.adapter.onData((data) => {
    mergeData(adapterId, data);
  });

  entry.adapter.onStatus((status, error) => {
    setAdapterStatus(adapterId, status, error);

    const currentAdapters = useEnergyStoreBase.getState().adapters;
    const anyConn = Object.values(currentAdapters).some(
      (a) => a.enabled && a.status === 'connected',
    );
    useAppStore.getState().setConnected(anyConn);
  });

  if (opts?.sunspecAdapter && opts.startSunSpecPolling) {
    setAdapterStatus(adapterId, 'connecting');
    opts.startSunSpecPolling(adapterId, opts.sunspecAdapter.getWorkerPollConfig());
    return;
  }

  if (canConnectHardwareAdapter(entry.enabled) && baseAdapter.circuitBreaker.canExecute()) {
    void entry.adapter.connect();
  }
}

// ─── Bridge hook: syncs adapters ↔ old store ─────────────────────────

/**
 * useAdapterBridge — React hook that:
 * 1. Connects enabled adapters on mount
 * 2. Merges adapter data into useEnergyStore
 * 3. Bridges data to useAppStore (backwards compat)
 * 4. Syncs to TanStack Query cache (queryClient.setQueryData)
 * 5. Persists snapshots to Dexie.js
 *
 * Mount this ONCE in App.tsx (replaces the old useWebSocket hook).
 * Uses getState() for actions to avoid full-store subscription.
 */
export function useAdapterBridge() {
  const { startSunSpecPolling, stopPolling } = useAdapterWorker();
  const workerAdapterIdsRef = useRef<AdapterId[]>([]);

  // Zustand actions are stable — no hook subscriptions needed.
  // Retrieve via getState() inside callbacks to avoid stale closures.
  useEffect(() => {
    const { adapters } = useEnergyStoreBase.getState();
    const entries = Object.entries(adapters) as [AdapterId, AdapterEntry][];
    const workerEnabled = isAdapterWorkerEnabled();

    for (const [id, entry] of entries) {
      if (!canConnectHardwareAdapter(entry.enabled)) continue;

      const sunspecAdapter =
        workerEnabled && entry.adapter instanceof ModbusSunSpecAdapter ? entry.adapter : null;

      if (sunspecAdapter) {
        sunspecAdapter.setDelegatePollingToWorker(true);
        workerAdapterIdsRef.current.push(id);
      }

      attachAdapterEntry(id, {
        sunspecAdapter,
        startSunSpecPolling,
      });
    }

    return () => {
      for (const workerId of workerAdapterIdsRef.current) {
        stopPolling(workerId);
      }
      workerAdapterIdsRef.current = [];
      for (const [, entry] of entries) {
        entry.adapter.destroy();
      }
    };
  }, [startSunSpecPolling, stopPolling]); // Only on mount — adapters are stable references, callbacks via refs
}

// ─── Legacy bridge helpers ───────────────────────────────────────────

/** Convert UnifiedEnergyModel → legacy EnergyData for useAppStore */
function unifiedToLegacy(model: UnifiedEnergyModel) {
  return {
    gridPower: model.grid.powerW,
    pvPower: model.pv.totalPowerW,
    batteryPower: model.battery.powerW,
    houseLoad: model.load.totalPowerW,
    batterySoC: model.battery.socPercent,
    heatPumpPower: model.load.heatPumpPowerW,
    evPower: model.load.evPowerW,
    gridVoltage: model.grid.voltageV,
    batteryVoltage: model.battery.voltageV,
    pvYieldToday: model.pv.yieldTodayKWh,
    priceCurrent: model.tariff?.currentPriceEurKWh ?? 0,
  };
}

/** Bridge Partial<UnifiedEnergyModel> → setEnergyData */
function bridgeToAppStore(
  data: Partial<UnifiedEnergyModel>,
  setEnergyData: (d: Record<string, number>) => void,
) {
  const legacy: Record<string, number> = {};

  if (data.pv) {
    legacy.pvPower = data.pv.totalPowerW;
    legacy.pvYieldToday = data.pv.yieldTodayKWh;
  }
  if (data.battery) {
    legacy.batteryPower = data.battery.powerW;
    legacy.batterySoC = data.battery.socPercent;
    legacy.batteryVoltage = data.battery.voltageV;
  }
  if (data.grid) {
    legacy.gridPower = data.grid.powerW;
    legacy.gridVoltage = data.grid.voltageV;
  }
  if (data.load) {
    legacy.houseLoad = data.load.totalPowerW;
    legacy.heatPumpPower = data.load.heatPumpPowerW;
    legacy.evPower = data.load.evPowerW;
  }
  if (data.tariff) {
    legacy.priceCurrent = data.tariff.currentPriceEurKWh;
  }

  if (Object.keys(legacy).length > 0) {
    setEnergyData(legacy);
  }
}

// ─── Convenience selectors ───────────────────────────────────────────

/** Selector: get EV charger data (for Devices page) */
export const selectEVCharger = (state: EnergyStoreState) => state.unified.evCharger;

/** Selector: get KNX room data (for Devices page) */
export const selectKNXRooms = (state: EnergyStoreState) => state.unified.knx?.rooms ?? [];

/** Selector: get PV data (for Live Energy Flow page) */
export const selectPV = (state: EnergyStoreState) => state.unified.pv;

/** Selector: get battery data (for Live Energy Flow page) */
export const selectBattery = (state: EnergyStoreState) => state.unified.battery;

/** Selector: get grid data (for Live Energy Flow page) */
export const selectGrid = (state: EnergyStoreState) => state.unified.grid;

/** Selector: get tariff data (for Tariffs page) */
export const selectTariff = (state: EnergyStoreState) => state.unified.tariff;

/** Selector: get sliding-window history ring buffer (for time-series charts) */
export const selectHistory = (state: EnergyStoreState) => state.history;

/** Selector: get adapter status map (memoized — stable reference when values unchanged) */
let _prevAdapters: Record<AdapterId, AdapterEntry> | null = null;
let _cachedStatuses: Record<
  string,
  { status: AdapterStatus; enabled: boolean; name: string; error?: string | undefined }
> | null = null;

export const selectAdapterStatuses = (state: EnergyStoreState) => {
  if (state.adapters === _prevAdapters && _cachedStatuses) return _cachedStatuses;
  _prevAdapters = state.adapters;
  _cachedStatuses = Object.fromEntries(
    Object.entries(state.adapters).map(([id, entry]) => [
      id,
      {
        status: entry.status,
        enabled: entry.enabled,
        name: sanitizeUntrustedText(entry.adapter.name, 80),
        error: entry.error,
      },
    ]),
  );
  return _cachedStatuses;
};

// ─── useShallow-wrapped store access ─────────────────────────────────

/**
 * useEnergyStore — Shallow-comparing wrapper for useEnergyStoreBase.
 *
 * Prevents unnecessary re-renders by doing shallow comparison on the
 * selected slice. Use this instead of useEnergyStoreBase in components.
 *
 * Examples:
 *   // Only re-renders when pv or battery values change (shallow compare):
 *   const { pv, battery } = useEnergyStore((s) => ({ pv: s.unified.pv, battery: s.unified.battery }));
 *
 *   // Single value — shallow compare on primitive:
 *   const anyConnected = useEnergyStore((s) => s.anyConnected);
 */
export function useEnergyStore<T>(selector: (state: EnergyStoreState) => T): T {
  return useEnergyStoreBase(useShallow(selector));
}

// ─── useServerWebSocket ───────────────────────────────────────────────

const WS_BACKOFF_INITIAL_MS = 1_000;
const WS_BACKOFF_MAX_MS = 30_000;
const WS_BACKOFF_MULTIPLIER = 2;
/**
 * Liveness watchdog: the backend broadcasts an `ENERGY_UPDATE` every ~2 s
 * (`energy.ws.ts`). If no valid frame arrives within this window the socket is
 * treated as stale-but-open (half-open TCP, proxy timeout) and force-closed to
 * trigger the reconnect path — `onclose` alone cannot detect a silent stall.
 */
const WS_LIVENESS_TIMEOUT_MS = 6_000;

/** Virtual adapter id under which server-pushed snapshots are merged. */
const SERVER_ADAPTER_ID = 'server' as AdapterId;

/**
 * useServerWebSocket — opt-in browser consumer of the HEMS Express WebSocket
 * broadcast (HIGH-17 / ADR-018 / ADR-025).
 *
 * Connects with exponential backoff + jitter, **validates every inbound frame
 * with `WSMessageSchema`**, projects the flat wire `EnergyData` into the nested
 * `UnifiedEnergyModel` via {@link mapServerEnergyDataToUnified}, and merges it
 * into the store under the `'server'` virtual adapter. A liveness watchdog
 * reconnects on a silent stall, and `serverWsConnected` reflects socket state.
 *
 * Disabled by default — pass `enabled={isBackendWsEnabled()}`. In the default
 * client-side-adapter build the socket is never opened (gh-pages static demo
 * behaviour is unchanged).
 *
 * Reconnect schedule: 1 s → 2 s → 4 s → 8 s → 16 s → 30 s (max), ±25 % jitter.
 * Mount once — e.g. in App.tsx alongside useAdapterBridge().
 */
export function useServerWebSocket(enabled: boolean): void {
  const wsRef = useRef<WebSocket | null>(null);
  const retryDelayRef = useRef(WS_BACKOFF_INITIAL_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    destroyedRef.current = false;

    function clearWatchdog(): void {
      if (watchdogTimerRef.current !== null) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    }

    /** (Re)arm the stall detector; a silent socket is force-closed to reconnect. */
    function kickWatchdog(): void {
      clearWatchdog();
      if (destroyedRef.current) return;
      watchdogTimerRef.current = setTimeout(() => {
        logger.warn('Backend WS stalled — forcing reconnect', 'useServerWebSocket');
        wsRef.current?.close();
      }, WS_LIVENESS_TIMEOUT_MS);
    }

    function connect(): void {
      if (destroyedRef.current) return;
      if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        retryDelayRef.current = WS_BACKOFF_INITIAL_MS;
        useEnergyStoreBase.getState().setServerWsConnected(true);
        kickWatchdog();
      };

      ws.onmessage = (event: MessageEvent) => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(event.data));
        } catch {
          logger.warn('Dropped non-JSON WS frame', 'useServerWebSocket');
          return;
        }
        // Validate against the shared discriminated-union contract; drop
        // anything that does not match rather than trusting the wire.
        const parsed = WSMessageSchema.safeParse(raw);
        if (!parsed.success) {
          logger.warn('Dropped WS frame failing schema validation', 'useServerWebSocket');
          return;
        }
        if (parsed.data.type === 'ENERGY_UPDATE') {
          // Project flat wire EnergyData → nested UnifiedEnergyModel before merge.
          useEnergyStoreBase
            .getState()
            .mergeData(SERVER_ADAPTER_ID, mapServerEnergyDataToUnified(parsed.data.data));
          kickWatchdog();
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        clearWatchdog();
        useEnergyStoreBase.getState().setServerWsConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    function scheduleReconnect(): void {
      if (destroyedRef.current) return;
      const jitter = 0.75 + Math.random() * 0.5; // ±25 %
      const delay = Math.min(retryDelayRef.current * jitter, WS_BACKOFF_MAX_MS);
      retryDelayRef.current = Math.min(
        retryDelayRef.current * WS_BACKOFF_MULTIPLIER,
        WS_BACKOFF_MAX_MS,
      );
      retryTimerRef.current = setTimeout(connect, delay);
    }

    connect();

    return () => {
      destroyedRef.current = true;
      clearWatchdog();
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      retryDelayRef.current = WS_BACKOFF_INITIAL_MS;
      useEnergyStoreBase.getState().setServerWsConnected(false);
    };
  }, [enabled]);
}
