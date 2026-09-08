import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModbusSunSpecAdapter } from '../core/adapters/ModbusSunSpecAdapter';

const COMMON_BLOCK = { Mn: 'SMA', Md: 'SUN-5000', SN: 'SN-001', Vr: '1.0' };
const INVERTER_REGS = { W: 4200, WH: 15_000, W_SF: 0, WH_SF: -1, PhVphA: 230, A: 12 };
const BATTERY_REGS = { W: -500, SoC: 80, V: 52, A: -10, W_SF: 0, SoC_SF: 0 };
const METER_REGS = { W: 1200, PhV: 230, TotWhImp: 50_000, TotWh_SF: -1 };

let mockFetch: ReturnType<typeof vi.fn>;

function setupFetchMock(): void {
  mockFetch = vi.fn().mockImplementation(async (url: string) => {
    if (String(url).includes('model=common')) {
      return { ok: true, json: async () => COMMON_BLOCK, status: 200 };
    }
    if (String(url).includes('model=inverter')) {
      return { ok: true, json: async () => INVERTER_REGS, status: 200 };
    }
    if (String(url).includes('model=battery')) {
      return { ok: true, json: async () => BATTERY_REGS, status: 200 };
    }
    if (String(url).includes('model=meter')) {
      return { ok: true, json: async () => METER_REGS, status: 200 };
    }
    if (String(url).includes('/api/modbus/write')) {
      return { ok: true, json: async () => ({ ok: true }), status: 200 };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', mockFetch);
}

describe('ModbusSunSpecAdapter — host allowlist', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects public hosts during construction', () => {
    expect(() => new ModbusSunSpecAdapter({ host: '8.8.8.8', port: 8080 })).toThrow(
      /not a local\/private address/i,
    );
  });

  it('requires an explicit host', () => {
    expect(() => new ModbusSunSpecAdapter()).toThrow(/host is required/i);
  });
});

describe('ModbusSunSpecAdapter — connect and poll', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('discovers SunSpec models and emits a unified snapshot', async () => {
    const adapter = new ModbusSunSpecAdapter({
      host: '192.168.1.50',
      port: 8080,
      pollIntervalMs: 60_000,
    });
    const dataSpy = vi.fn();
    adapter.onData(dataSpy);

    await adapter.connect();

    expect(adapter.status).toBe('connected');
    expect(adapter.deviceInfo?.manufacturer).toBe('SMA');

    const snapshot = await adapter.poll();
    expect(snapshot.pv?.totalPowerW).toBe(4200);
    expect(snapshot.battery?.socPercent).toBe(80);
    expect(snapshot.grid?.powerW).toBe(1200);
    expect(dataSpy).toHaveBeenCalled();

    await adapter.disconnect();
    adapter.destroy();
  });

  it('writes battery power commands through the REST bridge', async () => {
    setupFetchMock();
    const adapter = new ModbusSunSpecAdapter({
      host: 'inverter.local',
      port: 8080,
      pollIntervalMs: 60_000,
    });

    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_BATTERY_POWER', value: 1500 });
    expect(result).toBe(true);

    const writeCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes('/api/modbus/write'),
    );
    expect(writeCall?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ register: 'WChaMax', value: 1500, model: 124 }),
    });

    adapter.destroy();
  });
});
