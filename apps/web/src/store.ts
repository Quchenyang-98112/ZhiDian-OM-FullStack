import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { CommandPalettePreferences } from './core/commands/types';
import { sanitizePersistedSettings } from './core/stored-settings-schema';
import type { ThemeName } from './design-tokens';
import type { BackendAdapterMode } from './lib/adapter-mode';
import { persistSettings } from './lib/db';
import type { ThemePreference } from './lib/theme';
import type { EnergyData, FloorplanState, LocaleCode, StoredSettings } from './types';
import { SYSTEM_PRESETS } from './types';

export type { BackendAdapterMode };

/** The product demo always starts in Simplified Chinese. */
export function resolveInitialLocale(): LocaleCode {
  return 'zh';
}

export interface AppState {
  energyData: EnergyData;
  connected: boolean;
  lastUpdated: number | null;
  locale: LocaleCode;
  theme: ThemeName;
  themePreference: ThemePreference;
  themeTransitionKey: number;
  floorplan: FloorplanState;
  settings: StoredSettings;
  /** Effective backend hardware mode (runtime-only, never persisted). */
  adapterMode: BackendAdapterMode;
  /** Runtime read-only flag from `GET /api/health` (not persisted). */
  backendReadOnly: boolean;
  commandPalette: CommandPalettePreferences;
  setEnergyData: (data: Partial<EnergyData>) => void;
  setConnected: (status: boolean) => void;
  setAdapterMode: (mode: BackendAdapterMode) => void;
  setBackendReadOnly: (readOnly: boolean) => void;
  setLocale: (locale: LocaleCode) => void;
  setTheme: (theme: ThemeName) => void;
  setThemePreference: (preference: ThemePreference) => void;
  updateFloorplan: (data: Partial<FloorplanState>) => void;
  updateSettings: (data: Partial<StoredSettings>) => void;
  recordCommandUsage: (commandId: string) => void;
  toggleCommandFavorite: (commandId: string) => void;
}

const defaultEnergyData: EnergyData = {
  gridPower: 0,
  pvPower: 0,
  batteryPower: 0,
  houseLoad: 0,
  batterySoC: 0,
  heatPumpPower: 0,
  evPower: 0,
  gridVoltage: 230,
  batteryVoltage: 51.2,
  pvYieldToday: 0,
  priceCurrent: 0.18,
};

export const defaultSettings: StoredSettings = {
  gatewayType: 'cerbo-gx',
  systemConfig: { ...SYSTEM_PRESETS['victron-3mp2-standard']! },
  victronIp: '192.168.1.100',
  knxIp: '192.168.1.101',
  wsPort: 1880,
  refreshRateMs: 2000,
  // In E2E builds default to the offline provider to avoid any external
  // tariff API calls that can slow down or fail in CI.
  tariffProvider: import.meta.env.VITE_E2E_TESTING === 'true' ? 'none' : 'tibber',
  tariffRegion: 'DE',
  dynamicGridFees: true,
  gridOperatorName: '',
  chargeThreshold: 0.15,
  maxGridImportKw: 4.2,
  mtls: true,
  telemetryDisabled: true,
  twoFactor: true,
  influxUrl: 'http://192.168.1.102:8086',
  influxToken: '',
  historyDays: 30,
  location: { lat: 53.5511, lon: 9.9937 },
  gridPriceAvg: 0.25,
  animations: true,
  compactMode: false,
  glowEffects: true,
  units: 'metric',
  dateFormat: 'dd.mm.yyyy',
  currency: 'eur',
  mqttAutoDiscovery: true,
  fontScale: 1.0,
  reducedMotion: false,
  highContrast: false,
  pushNotifications: true,
  priceAlerts: true,
  batteryAlerts: true,
  gridAlerts: false,
  updateNotifications: true,
  batteryAlertThreshold: 15,
  priceAlertThreshold: 0.1,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  feedInTariff: 0.082,
  gridOperator: '',
  monthlyBudget: 80,
  pvPeakKw: 10,
  batteryCapacityKWh: 10,
  batteryMaxChargeKW: 5,
  batteryMinSoC: 10,
  evMaxPowerKW: 11,
  heatPumpPowerKW: 6,
  feedInTariffEurKWh: 0.082,
  dashboardRefreshSec: 5,
  sidebarPosition: 'left',
  debugMode: false,
  experimentalFeatures: false,
  performanceMode: false,
  autoBackup: false,
  keyboardShortcuts: true,
};

const defaultCommandPalette: CommandPalettePreferences = {
  recent: [],
  favorites: [],
};

type PersistedKey =
  | 'locale'
  | 'theme'
  | 'themePreference'
  | 'themeTransitionKey'
  | 'floorplan'
  | 'settings'
  | 'commandPalette';

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      energyData: defaultEnergyData,
      connected: false,
      lastUpdated: null as number | null,
      locale: resolveInitialLocale(),
      theme: 'ocean-dark',
      themePreference: 'ocean-dark',
      themeTransitionKey: 0,
      floorplan: {
        lightsOn: true,
        windowOpen: false,
        roomTemperature: 21.5,
      },
      settings: defaultSettings,
      adapterMode: 'unknown' as BackendAdapterMode,
      backendReadOnly: false,
      commandPalette: { ...defaultCommandPalette },
      setEnergyData: (data) =>
        set((state) => {
          // Skip update if all incoming values match current state
          const cur = state.energyData;
          const keys = Object.keys(data) as (keyof EnergyData)[];
          if (keys.length > 0 && keys.every((k) => cur[k] === data[k])) return state;
          return {
            energyData: { ...cur, ...data },
            lastUpdated: Date.now(),
          };
        }),
      setConnected: (status) =>
        set((state) => (state.connected === status ? state : { connected: status })),
      setAdapterMode: (mode) =>
        set((state) => (state.adapterMode === mode ? state : { adapterMode: mode })),
      setBackendReadOnly: (readOnly) =>
        set((state) =>
          state.backendReadOnly === readOnly ? state : { backendReadOnly: readOnly },
        ),
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) =>
        set((state) => ({ theme, themeTransitionKey: state.themeTransitionKey + 1 })),
      setThemePreference: (preference) =>
        set((state) => ({
          themePreference: preference,
          themeTransitionKey: state.themeTransitionKey + 1,
        })),
      updateFloorplan: (data) =>
        set((state) => {
          const cur = state.floorplan;
          const keys = Object.keys(data) as (keyof FloorplanState)[];
          if (keys.length > 0 && keys.every((k) => cur[k] === data[k])) return state;
          return { floorplan: { ...cur, ...data } };
        }),
      updateSettings: (data) => {
        const cur = get().settings;
        const keys = Object.keys(data) as (keyof StoredSettings)[];
        if (keys.length > 0 && keys.every((k) => cur[k] === data[k])) return;
        const nextSettings = { ...cur, ...data };
        set({ settings: nextSettings });
        void persistSettings(nextSettings);
      },
      recordCommandUsage: (commandId) =>
        set((state) => {
          const now = Date.now();
          const filtered = state.commandPalette.recent.filter((r) => r.id !== commandId);
          const recent = [{ id: commandId, ts: now }, ...filtered].slice(0, 8);
          return { commandPalette: { ...state.commandPalette, recent } };
        }),
      toggleCommandFavorite: (commandId) =>
        set((state) => {
          const favs = new Set(state.commandPalette.favorites);
          if (favs.has(commandId)) favs.delete(commandId);
          else favs.add(commandId);
          return { commandPalette: { ...state.commandPalette, favorites: [...favs] } };
        }),
    }),
    {
      name: 'nexus-hems-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state): Pick<AppState, PersistedKey> => {
        // HIGH-01: Exclude influxToken and influxUrl from localStorage persistence.
        // These credentials are stored in the encrypted Dexie vault via secure-store.ts.
        const {
          influxToken: _influxToken,
          influxUrl: _influxUrl,
          ...safeSettings
        } = state.settings;
        void _influxToken;
        void _influxUrl;
        return {
          locale: state.locale,
          theme: state.theme,
          themePreference: state.themePreference,
          themeTransitionKey: state.themeTransitionKey,
          floorplan: state.floorplan,
          settings: safeSettings as StoredSettings,
          commandPalette: state.commandPalette,
        };
      },
      // Deep-merge persisted settings with defaults so newly added keys
      // are always present even when the user has stale localStorage data.
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState> | undefined;
        if (!p) return current;
        const validatedSettings = p.settings ? sanitizePersistedSettings(p.settings) : {};
        return {
          ...current,
          ...p,
          settings: { ...defaultSettings, ...current.settings, ...validatedSettings },
          floorplan: { ...current.floorplan, ...(p.floorplan ?? {}) },
          commandPalette: { ...defaultCommandPalette, ...(p.commandPalette ?? {}) },
        };
      },
    },
  ),
);

// ─── useShallow-wrapped store access ─────────────────────────────────

/**
 * useAppStoreShallow — Shallow-comparing wrapper for useAppStore.
 *
 * Use when selecting multiple values into an object to prevent
 * unnecessary re-renders (shallow compare instead of referential).
 *
 * Example:
 *   const { theme, locale } = useAppStoreShallow((s) => ({ theme: s.theme, locale: s.locale }));
 */
export function useAppStoreShallow<T>(selector: (state: AppState) => T): T {
  return useAppStore(useShallow(selector));
}

// Expose store for E2E / Playwright tests.
// Available in dev mode AND in production builds flagged with VITE_E2E_TESTING=true
// (set via env in CI E2E jobs so Playwright can inject energy data via the store).
if (import.meta.env.DEV || import.meta.env.VITE_E2E_TESTING === 'true') {
  (window as unknown as Record<string, unknown>).__NEXUS_STORE__ = useAppStore;
}
