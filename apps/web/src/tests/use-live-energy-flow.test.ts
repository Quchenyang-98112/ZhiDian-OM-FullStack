import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const energyContextState = vi.hoisted(() => ({
  connected: false,
}));

const energyStoreState = vi.hoisted(() => ({
  serverWsConnected: false,
}));

const appStoreState = vi.hoisted(() => ({
  adapterMode: 'mock' as 'mock' | 'live',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('../core/EnergyContext', () => ({
  useEnergyContext: () => ({
    data: {
      pvPower: 0,
      houseLoad: 0,
      gridPower: 0,
      batteryPower: 0,
      batterySoC: 0,
      heatPumpPower: 0,
      evPower: 0,
      pvYieldToday: 0,
      priceCurrent: 0,
    },
    connected: energyContextState.connected,
    selfSufficiencyPercent: 0,
    isExporting: false,
  }),
}));

vi.mock('../core/useLegacySendCommand', () => ({
  useLegacySendCommand: () => ({ sendCommand: vi.fn(), ConfirmationDialog: () => null }),
}));

vi.mock('../core/useEnergyStore', () => ({
  useEnergyStoreBase: (selector: (state: typeof energyStoreState) => unknown) =>
    selector(energyStoreState),
}));

vi.mock('../store', () => ({
  useAppStore: (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
}));

import { useLiveEnergyFlow } from '../components/live-energy-flow/hooks/useLiveEnergyFlow';

describe('useLiveEnergyFlow', () => {
  beforeEach(() => {
    energyContextState.connected = false;
    energyStoreState.serverWsConnected = false;
    appStoreState.adapterMode = 'mock';
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_BACKEND_WS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses simulation presentation on static demo deployments', () => {
    const { result } = renderHook(() => useLiveEnergyFlow());
    expect(result.current.connectionPresentation).toBe('simulation');
  });

  it('treats backend WebSocket link as connected presentation', () => {
    vi.stubEnv('VITE_BACKEND_WS', 'true');
    appStoreState.adapterMode = 'live';
    energyStoreState.serverWsConnected = true;

    const { result } = renderHook(() => useLiveEnergyFlow());
    expect(result.current.connectionPresentation).toBe('connected');
  });
});
