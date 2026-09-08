import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnergyAdapter } from '../core/adapters/EnergyAdapter';
import { EvccAdapter } from '../core/adapters/EvccAdapter';

const EVCC_STATE = {
  result: {
    gridPower: 500,
    gridCurrents: [2, 2, 2],
    gridEnergy: 10_000,
    pvPower: 3000,
    pvEnergy: 5000,
    batteryPower: -1000,
    batterySoc: 75,
    batteryCapacity: 10_000,
    batteryEnergy: 7500,
    homePower: 2500,
    tariffGrid: 0.28,
    tariffFeedIn: 0.08,
    tariffEffectivePrice: 0.25,
    tariffCo2: 350,
    siteTitle: 'Home',
    currency: 'EUR',
    savingsTotalAmount: 120,
    loadpoints: [
      {
        title: 'Wallbox',
        mode: 'pv' as const,
        charging: true,
        connected: true,
        enabled: true,
        chargePower: 7000,
        chargedEnergy: 15_000,
        chargeDuration: 3600,
        vehicleSoc: 45,
        vehicleRange: 200,
        vehicleName: 'EV',
        chargerFeatureIntegratedDevice: false,
        chargerFeatureHeating: false,
        phasesActive: 3,
        phasesEnabled: 3,
        maxCurrent: 16,
        minCurrent: 6,
        targetSoc: 80,
        planActive: false,
        planProjectedStart: '',
        effectivePlanTime: '',
        smartCostActive: false,
        smartCostLimit: 0,
        limitEnergy: 0,
        limitSoc: 80,
      },
    ],
    vehicles: {},
    statistics: {
      total: { avgPrice: 0.3, avgCo2: 400, chargedKWh: 1000, solarPercentage: 60 },
      thisYear: { avgPrice: 0.28, avgCo2: 380, chargedKWh: 500, solarPercentage: 65 },
      '30d': { avgPrice: 0.27, avgCo2: 360, chargedKWh: 100, solarPercentage: 70 },
    },
  },
};

type MockFetch = ReturnType<typeof vi.fn>;
let mockFetch: MockFetch;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = WebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

function setupEvccFetch(state: typeof EVCC_STATE = EVCC_STATE): void {
  mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes('/api/health')) {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (url.includes('/api/state')) {
      return { ok: true, json: async () => state };
    }
    if (url.includes('/api/tariff/')) {
      return { ok: true, json: async () => ({ result: { rates: [] } }) };
    }
    if (init?.method === 'POST') {
      return { ok: true, json: async () => ({}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', mockFetch);
}

describe('EvccAdapter — Interface Contract', () => {
  let adapter: EnergyAdapter;

  beforeEach(() => {
    setupEvccFetch();
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new EvccAdapter({ host: '192.168.1.50', port: 7070 });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('has correct id and capabilities', () => {
    expect(adapter.id).toBe('evcc');
    expect(adapter.name).toMatch(/evcc/i);
    expect(adapter.capabilities).toEqual(
      expect.arrayContaining(['pv', 'battery', 'grid', 'load', 'evCharger', 'tariff']),
    );
  });

  it('starts disconnected', () => {
    expect(adapter.status).toBe('disconnected');
  });

  it('returns empty snapshot before connect', () => {
    expect(adapter.getSnapshot()).toEqual({});
  });
});

describe('EvccAdapter — connect and state mapping', () => {
  let adapter: EvccAdapter;

  beforeEach(() => {
    setupEvccFetch();
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new EvccAdapter({ host: '192.168.1.50', port: 7070 });
  });

  afterEach(async () => {
    await adapter.disconnect();
    adapter.destroy();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('connects and maps evcc state into UnifiedEnergyModel', async () => {
    await adapter.connect();
    expect(adapter.status).toBe('connected');

    const snap = adapter.getSnapshot();
    expect(snap.pv?.totalPowerW).toBe(3000);
    expect(snap.battery?.socPercent).toBe(75);
    expect(snap.grid?.powerW).toBe(500);
    expect(snap.evCharger?.powerW).toBe(7000);
    expect(snap.evCharger?.status).toBe('charging');
  });

  it('exposes statistics and tariff rates after connect', async () => {
    await adapter.connect();
    expect(adapter.getStatistics()?.currency).toBe('EUR');
    expect(adapter.getTariffRates()?.grid).toBe(0.28);
    expect(adapter.getLoadpointCount()).toBe(1);
  });

  it('fails connect when health endpoint is unreachable', async () => {
    mockFetch.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    let connectError: string | undefined;
    adapter.onStatus((status, error) => {
      if (status === 'error') connectError = error;
    });
    await adapter.connect();
    expect(adapter.status).toBe('error');
    expect(connectError).toMatch(/not reachable/i);
  });
});

describe('EvccAdapter — sendCommand', () => {
  let adapter: EvccAdapter;

  beforeEach(async () => {
    setupEvccFetch();
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new EvccAdapter({ host: '192.168.1.50', port: 7070 });
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
    adapter.destroy();
    vi.unstubAllGlobals();
  });

  it('POSTs START_CHARGING to loadpoint mode/now', async () => {
    const ok = await adapter.sendCommand({
      type: 'START_CHARGING',
      value: true,
      targetDeviceId: '1',
    });
    expect(ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/loadpoints/1/mode/now'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('POSTs SET_EV_CURRENT to maxcurrent endpoint', async () => {
    const ok = await adapter.sendCommand({
      type: 'SET_EV_CURRENT',
      value: 16,
      targetDeviceId: '1',
    });
    expect(ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/loadpoints/1/maxcurrent/16'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns false for unsupported command types', async () => {
    const ok = await adapter.sendCommand({
      type: 'SET_GRID_LIMIT' as Parameters<typeof adapter.sendCommand>[0]['type'],
      value: 5000,
    });
    expect(ok).toBe(false);
  });
});
