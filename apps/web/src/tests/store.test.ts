import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, resolveInitialLocale, useAppStore, useAppStoreShallow } from '../store';

// Mock persistSettings to avoid Dexie in unit tests
vi.mock('../lib/db', () => ({
  persistSettings: vi.fn(),
}));

describe('resolveInitialLocale', () => {
  afterEach(() => {
    // Remove the per-test shadow so the jsdom prototype getter is restored.
    Reflect.deleteProperty(navigator, 'languages');
  });

  function setBrowserLanguages(langs: string[]) {
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => langs });
  }

  it('defaults to German when the browser prefers German', () => {
    setBrowserLanguages(['de-DE', 'en-US']);
    expect(resolveInitialLocale()).toBe('de');
  });

  it('defaults to English for a non-German browser', () => {
    setBrowserLanguages(['fr-FR', 'en']);
    expect(resolveInitialLocale()).toBe('en');
  });

  it('defaults to English when no German entry is present', () => {
    setBrowserLanguages(['en-US']);
    expect(resolveInitialLocale()).toBe('en');
  });
});

describe('Zustand Store', () => {
  beforeEach(() => {
    // Reset store state between tests
    useAppStore.setState({
      energyData: {
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
      },
      connected: false,
      lastUpdated: null,
      locale: 'de',
      theme: 'energy-dark',
    });
  });

  it('should have default energy data', () => {
    const { energyData } = useAppStore.getState();
    expect(energyData.pvPower).toBe(0);
    expect(energyData.gridVoltage).toBe(230);
    expect(energyData.priceCurrent).toBe(0.18);
  });

  it('should update energy data partially', () => {
    useAppStore.getState().setEnergyData({ pvPower: 3500, batterySoC: 72 });
    const { energyData, lastUpdated } = useAppStore.getState();
    expect(energyData.pvPower).toBe(3500);
    expect(energyData.batterySoC).toBe(72);
    expect(energyData.gridVoltage).toBe(230); // unchanged
    expect(lastUpdated).toBeTypeOf('number');
  });

  it('should toggle connected status', () => {
    expect(useAppStore.getState().connected).toBe(false);
    useAppStore.getState().setConnected(true);
    expect(useAppStore.getState().connected).toBe(true);
  });

  it('should switch locale', () => {
    useAppStore.getState().setLocale('en');
    expect(useAppStore.getState().locale).toBe('en');
  });

  it('should switch theme and increment transition key', () => {
    const keyBefore = useAppStore.getState().themeTransitionKey;
    useAppStore.getState().setTheme('solar-light');
    expect(useAppStore.getState().theme).toBe('solar-light');
    expect(useAppStore.getState().themeTransitionKey).toBe(keyBefore + 1);
  });

  it('should update floorplan partially', () => {
    useAppStore.getState().updateFloorplan({ roomTemperature: 23 });
    expect(useAppStore.getState().floorplan.roomTemperature).toBe(23);
    expect(useAppStore.getState().floorplan.lightsOn).toBe(true); // unchanged
  });

  it('skips floorplan updates when values are unchanged', () => {
    const stateBefore = useAppStore.getState();
    useAppStore.getState().updateFloorplan({ lightsOn: true });
    expect(useAppStore.getState()).toBe(stateBefore);
  });

  it('should update settings and persist', async () => {
    const db = await import('../lib/db');
    useAppStore.getState().updateSettings({ chargeThreshold: 0.12 });
    expect(useAppStore.getState().settings.chargeThreshold).toBe(0.12);
    expect(db.persistSettings).toHaveBeenCalled();
  });

  it('skips settings persistence when values are unchanged', async () => {
    const db = await import('../lib/db');
    vi.mocked(db.persistSettings).mockClear();
    const before = useAppStore.getState().settings.chargeThreshold;
    useAppStore.getState().updateSettings({ chargeThreshold: before });
    expect(db.persistSettings).not.toHaveBeenCalled();
  });

  it('updates adapter mode and skips when unchanged', () => {
    useAppStore.getState().setAdapterMode('mock');
    expect(useAppStore.getState().adapterMode).toBe('mock');
    const stateBefore = useAppStore.getState();
    useAppStore.getState().setAdapterMode('mock');
    expect(useAppStore.getState()).toBe(stateBefore);
    useAppStore.getState().setAdapterMode('live');
    expect(useAppStore.getState().adapterMode).toBe('live');
  });

  it('updates theme preference and bumps the transition key', () => {
    const keyBefore = useAppStore.getState().themeTransitionKey;
    useAppStore.getState().setThemePreference('system');
    expect(useAppStore.getState().themePreference).toBe('system');
    expect(useAppStore.getState().themeTransitionKey).toBe(keyBefore + 1);
  });

  it('selects multiple fields via useAppStoreShallow without throwing', () => {
    const { result } = renderHook(() =>
      useAppStoreShallow((s) => ({
        connected: s.connected,
        locale: s.locale,
      })),
    );
    expect(result.current.connected).toBe(false);
    expect(result.current.locale).toBe('de');
  });
});

// ─── Equality-skip guards (Opt #2) ───────────────────────────────────

describe('setEnergyData equality-skip guard', () => {
  beforeEach(() => {
    useAppStore.setState({
      energyData: {
        gridPower: 0,
        pvPower: 3000,
        batteryPower: 0,
        houseLoad: 2000,
        batterySoC: 60,
        heatPumpPower: 0,
        evPower: 0,
        gridVoltage: 230,
        batteryVoltage: 51.2,
        pvYieldToday: 10,
        priceCurrent: 0.18,
      },
      lastUpdated: null,
    });
  });

  it('updates lastUpdated when data changes', () => {
    useAppStore.getState().setEnergyData({ pvPower: 5000 });
    expect(useAppStore.getState().lastUpdated).toBeTypeOf('number');
    expect(useAppStore.getState().energyData.pvPower).toBe(5000);
  });

  it('merges partial data without overwriting unchanged fields', () => {
    useAppStore.getState().setEnergyData({ batterySoC: 85 });
    const { energyData } = useAppStore.getState();
    expect(energyData.batterySoC).toBe(85);
    expect(energyData.pvPower).toBe(3000); // unchanged
    expect(energyData.houseLoad).toBe(2000); // unchanged
  });

  it('returns the same state reference when incoming energy data is identical', () => {
    const stateBefore = useAppStore.getState();
    useAppStore.getState().setEnergyData({ pvPower: 3000, batterySoC: 60 });
    expect(useAppStore.getState()).toBe(stateBefore);
  });
});

describe('setConnected equality-skip guard', () => {
  beforeEach(() => {
    useAppStore.setState({ connected: false });
  });

  it('updates connected to true', () => {
    useAppStore.getState().setConnected(true);
    expect(useAppStore.getState().connected).toBe(true);
  });

  it('returns same state reference when value unchanged (no re-render)', () => {
    // Zustand won't trigger subscribers when state reference is identical.
    // We test the guard indirectly: calling setConnected(false) on an already-false store
    // should not mutate lastUpdated or trigger side effects.
    const stateBefore = useAppStore.getState();
    useAppStore.getState().setConnected(false); // already false
    const stateAfter = useAppStore.getState();
    // connected remains false and the state object is the same reference
    expect(stateAfter.connected).toBe(false);
    expect(stateAfter).toBe(stateBefore);
  });
});

// ─── Granular selector patterns (Opt #2) ─────────────────────────────
// Hooks (useAppStoreShallow / useAppStore) require a React component context.
// We validate the selector shapes by calling the selector function directly
// against getState() — which is exactly what the hook does under the hood.

describe('Granular selector patterns (Opt #2)', () => {
  beforeEach(() => {
    useAppStore.setState({
      connected: false,
      energyData: {
        gridPower: 0,
        pvPower: 0,
        batteryPower: 0,
        houseLoad: 0,
        batterySoC: 0,
        heatPumpPower: 0,
        evPower: 0,
        gridVoltage: 230,
        batteryVoltage: 51.2,
        pvYieldToday: 5,
        priceCurrent: 0.25,
      },
      settings: { ...defaultSettings },
    });
  });

  it('TariffsPage pattern: selects only tariff-relevant fields', () => {
    const s = useAppStore.getState();
    const result = {
      priceCurrent: s.energyData.priceCurrent,
      pvYieldToday: s.energyData.pvYieldToday,
      chargeThreshold: s.settings.chargeThreshold ?? 0.15,
      tariffProvider: s.settings.tariffProvider,
      feedInTariff: s.settings.feedInTariff ?? 0.082,
      monthlyBudget: s.settings.monthlyBudget ?? 80,
      priceAlerts: s.settings.priceAlerts,
      priceAlertThreshold: s.settings.priceAlertThreshold ?? 0.1,
    };

    expect(result.priceCurrent).toBe(0.25);
    expect(result.pvYieldToday).toBe(5);
    expect(result.chargeThreshold).toBe(defaultSettings.chargeThreshold);
    expect(result.tariffProvider).toBe(defaultSettings.tariffProvider);
    expect(result.feedInTariff).toBe(defaultSettings.feedInTariff ?? 0.082);
    expect(result.monthlyBudget).toBe(defaultSettings.monthlyBudget ?? 80);
    expect(result.priceAlerts).toBe(defaultSettings.priceAlerts);
    expect(result.priceAlertThreshold).toBe(defaultSettings.priceAlertThreshold ?? 0.1);
  });

  it('EnergyContext pattern: combined energyData + connected in one selector', () => {
    useAppStore.setState({ connected: true });
    const s = useAppStore.getState();
    const result = {
      energyData: s.energyData,
      connected: s.connected,
    };
    expect(result.connected).toBe(true);
    expect(result.energyData.priceCurrent).toBe(0.25);
  });

  it('Monitoring pattern: combined connected + debugMode in one selector', () => {
    const s = useAppStore.getState();
    const result = {
      connected: s.connected,
      debugMode: s.settings.debugMode ?? false,
    };
    expect(result.connected).toBe(false);
    expect(result.debugMode).toBe(defaultSettings.debugMode ?? false);
  });

  it('LiveEnergyFlow EVPanel pattern: scalar evCharger.maxPowerKW', () => {
    const s = useAppStore.getState();
    const maxPower = s.settings.systemConfig.evCharger.maxPowerKW;
    expect(typeof maxPower).toBe('number');
    expect(maxPower).toBeGreaterThan(0);
  });

  it('LiveEnergyFlow BatteryPanel pattern: scalar battery.maxChargeRateKW', () => {
    const s = useAppStore.getState();
    const maxCharge = s.settings.systemConfig.battery.maxChargeRateKW;
    expect(typeof maxCharge).toBe('number');
    expect(maxCharge).toBeGreaterThan(0);
  });
});
