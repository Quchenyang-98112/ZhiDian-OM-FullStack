/**
 * OpenEMSProtocolAdapter unit tests — mock WebSocket JSON-RPC, no real Edge instance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWsHolder = vi.hoisted(() => ({
  current: null as {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    removeAllListeners: ReturnType<typeof vi.fn>;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
    readyState: number;
  } | null,
}));

vi.mock('ws', () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  class MockWebSocket {
    static readonly OPEN = 1;
    static readonly CONNECTING = 0;
    readyState = MockWebSocket.CONNECTING;
    send = vi.fn((payload: string) => {
      const req = JSON.parse(payload) as { id: string; method: string };
      if (req.method === 'authenticateWithPassword') {
        setTimeout(
          () =>
            this.emit(
              'message',
              JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { token: 'sess' } }),
            ),
          0,
        );
      } else if (req.method === 'subscribeChannels') {
        setTimeout(
          () => this.emit('message', JSON.stringify({ jsonrpc: '2.0', id: req.id, result: {} })),
          0,
        );
      } else if (req.method === 'updateComponentConfig') {
        setTimeout(
          () => this.emit('message', JSON.stringify({ jsonrpc: '2.0', id: req.id, result: {} })),
          0,
        );
      }
    });
    close = vi.fn();
    removeAllListeners = vi.fn(() => listeners.clear());

    constructor(_url: string) {
      mockWsHolder.current = this;
      setTimeout(() => {
        this.readyState = MockWebSocket.OPEN;
        this.emit('open');
      }, 0);
    }

    on(event: string, cb: (...args: unknown[]) => void): void {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(cb);
    }

    emit(event: string, ...args: unknown[]): void {
      for (const cb of listeners.get(event) ?? []) {
        cb(...args);
      }
    }
  }

  return { WebSocket: MockWebSocket };
});

import {
  createOpenEMSAdapterFromEnv,
  OpenEMSProtocolAdapter,
  type OpenEMSProtocolAdapterConfig,
} from './OpenEMSProtocolAdapter.js';

const testConfig: OpenEMSProtocolAdapterConfig = {
  id: 'test-openems-01',
  host: '192.168.1.60',
  port: 8085,
  authToken: 'user',
  deviceId: 'openems-home',
  pollIntervalMs: 60_000,
  evcsComponentId: 'evcs0',
  evcsControllerId: 'ctrlEvcs0',
};

describe('OpenEMSProtocolAdapter', () => {
  let adapter: OpenEMSProtocolAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpenEMSProtocolAdapter(testConfig);
  });

  afterEach(async () => {
    await adapter.disconnect().catch(() => {
      /* ignore */
    });
  });

  it('has correct id and protocol', () => {
    expect(adapter.id).toBe('test-openems-01');
    expect(adapter.protocol).toBe('openems');
  });

  it('reports healthy after connect', async () => {
    await adapter.connect();
    const health = await adapter.healthCheck();
    expect(health.status).toBe('healthy');
  });

  it('yields role-tagged datapoints from currentData notifications', async () => {
    const stream = adapter.getDataStream();
    const connectPromise = adapter.connect();
    await connectPromise;

    const dpPromise = stream.next();
    mockWsHolder.current?.emit(
      'message',
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'currentData',
        params: {
          channels: [
            { address: '_sum/ProductionActivePower', value: 4200 },
            { address: '_sum/EssSoc', value: 67 },
            { address: '_sum/GridActivePower', value: 300 },
          ],
        },
      }),
    );

    const collected: string[] = [];
    for (let i = 0; i < 3; i++) {
      const next = i === 0 ? await dpPromise : await stream.next();
      if (next.done) break;
      collected.push(`${next.value?.role}:${next.value?.metric}:${next.value?.value}`);
    }

    await adapter.disconnect();

    expect(collected).toContain('pv:POWER_W:4200');
    expect(collected).toContain('battery:SOC_PERCENT:67');
    expect(collected).toContain('grid:POWER_W:300');
  });

  it('uses configured deviceId on emitted datapoints', async () => {
    const stream = adapter.getDataStream();
    await adapter.connect();

    const dpPromise = stream.next();
    mockWsHolder.current?.emit(
      'message',
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'currentData',
        params: {
          channels: [{ address: '_sum/ProductionActivePower', value: 100 }],
        },
      }),
    );

    const next = await dpPromise;
    await adapter.disconnect();
    expect(next.value?.deviceId).toBe('openems-home');
  });

  it('createOpenEMSAdapterFromEnv returns null without OPENEMS_HOST', () => {
    expect(createOpenEMSAdapterFromEnv({})).toBeNull();
  });

  it('createOpenEMSAdapterFromEnv builds adapter from env', () => {
    const a = createOpenEMSAdapterFromEnv({
      OPENEMS_HOST: 'edge.local',
      OPENEMS_PORT: '9090',
      OPENEMS_DEVICE_ID: 'site-a',
      OPENEMS_EVCS_COMPONENT_ID: 'evcs1',
      OPENEMS_EVCS_CTRL_ID: 'ctrlEvcs1',
    });
    expect(a?.id).toBe('openems-01');
    expect(a?.protocol).toBe('openems');
  });

  it('sends updateComponentConfig for SET_EV_POWER when connected', async () => {
    await adapter.connect();

    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 11000 });
    expect(result).toEqual({ handled: true, success: true, adapterId: 'test-openems-01' });

    const updateCall = mockWsHolder.current?.send.mock.calls.find((call) => {
      const payload = JSON.parse(String(call[0])) as { method: string };
      return payload.method === 'updateComponentConfig';
    });
    expect(updateCall).toBeDefined();
    const request = JSON.parse(String(updateCall?.[0])) as {
      method: string;
      params: { componentId: string; properties: { name: string; value: number }[] };
    };
    expect(request.params.componentId).toBe('evcs0');
    expect(request.params.properties[0]).toEqual({ name: 'setChargePowerLimit', value: 11000 });
  });

  it('writes enabledCharging for START_CHARGING and STOP_CHARGING', async () => {
    await adapter.connect();

    await adapter.sendCommand({ type: 'START_CHARGING', value: true });
    await adapter.sendCommand({ type: 'STOP_CHARGING', value: false });

    const methods = mockWsHolder.current?.send.mock.calls.map(
      (call) => JSON.parse(String(call[0])).method as string,
    );
    expect(methods?.filter((method) => method === 'updateComponentConfig').length).toBe(2);
  });

  it('converts SET_EV_CURRENT into charge power watts', async () => {
    await adapter.connect();
    await adapter.sendCommand({ type: 'SET_EV_CURRENT', value: 16 });

    const updateCall = mockWsHolder.current?.send.mock.calls.find((call) => {
      const payload = JSON.parse(String(call[0])) as { method: string };
      return payload.method === 'updateComponentConfig';
    });
    const request = JSON.parse(String(updateCall?.[0])) as {
      params: { properties: { value: number }[] };
    };
    expect(request.params.properties[0]?.value).toBe(16 * 230 * 3);
  });

  it('returns not-connected error when websocket is down', async () => {
    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 5000 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('returns false when updateComponentConfig RPC fails', async () => {
    await adapter.connect();
    mockWsHolder.current!.send = vi.fn((payload: string) => {
      const req = JSON.parse(payload) as { id: string; method: string };
      if (req.method === 'updateComponentConfig') {
        setTimeout(
          () =>
            mockWsHolder.current?.emit(
              'message',
              JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { message: 'denied' } }),
            ),
          0,
        );
      }
    });

    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 1000 });
    expect(result.success).toBe(false);
  });

  it('rejects SET_EV_POWER above 22 kW before RPC', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 25_000 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('22000');
  });

  it('rejects SET_EV_CURRENT above 80 A before RPC', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_EV_CURRENT', value: 81 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('80');
  });

  it('rejects invalid SET_EV_POWER values before RPC', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({
      type: 'SET_EV_POWER',
      value: 'bad' as unknown as number,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('22000');
  });

  it('rejects invalid SET_EV_CURRENT values before RPC', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({
      type: 'SET_EV_CURRENT',
      value: Number.NaN,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('80');
  });

  it('supports battery and heat-pump command types', () => {
    expect(adapter.supportsCommand('SET_BATTERY_POWER')).toBe(true);
    expect(adapter.supportsCommand('SET_HEAT_PUMP_MODE')).toBe(true);
    expect(adapter.supportsCommand('SET_GRID_LIMIT')).toBe(true);
  });

  it('writes ESS power and mode for SET_BATTERY_POWER', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_BATTERY_POWER', value: -3000 });
    expect(result.success).toBe(true);

    const updateCall = mockWsHolder.current?.send.mock.calls.find((call) => {
      const payload = JSON.parse(String(call[0])) as { method: string };
      return payload.method === 'updateComponentConfig';
    });
    const request = JSON.parse(String(updateCall?.[0])) as {
      params: { componentId: string; properties: { name: string; value: unknown }[] };
    };
    expect(request.params.componentId).toBe('ctrlEssFixActivePower0');
    expect(request.params.properties).toEqual(
      expect.arrayContaining([
        { name: 'power', value: -3000 },
        { name: 'mode', value: 'DISCHARGE_TO_GRID' },
      ]),
    );
  });

  it('writes SG Ready mode for SET_HEAT_PUMP_MODE', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_HEAT_PUMP_MODE', value: 2 });
    expect(result.success).toBe(true);

    const updateCall = mockWsHolder.current?.send.mock.calls.find((call) => {
      const payload = JSON.parse(String(call[0])) as {
        method: string;
        params: { componentId: string };
      };
      return (
        payload.method === 'updateComponentConfig' &&
        payload.params.componentId === 'ctrlIoHeatPumpSgReady0'
      );
    });
    expect(updateCall).toBeDefined();
  });

  it('rejects out-of-range SET_BATTERY_POWER values', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_BATTERY_POWER', value: 30_000 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('25000');
  });

  it('writes CHARGE_GRID mode for positive SET_BATTERY_POWER', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_BATTERY_POWER', value: 4000 });
    expect(result.success).toBe(true);

    const updateCall = mockWsHolder.current?.send.mock.calls.find((call) => {
      const payload = JSON.parse(String(call[0])) as { method: string };
      return payload.method === 'updateComponentConfig';
    });
    const request = JSON.parse(String(updateCall?.[0])) as {
      params: { properties: { name: string; value: unknown }[] };
    };
    expect(request.params.properties).toEqual(
      expect.arrayContaining([
        { name: 'power', value: 4000 },
        { name: 'mode', value: 'CHARGE_GRID' },
      ]),
    );
  });

  it('maps SET_BATTERY_MODE charge and discharge aliases', async () => {
    await adapter.connect();
    await adapter.sendCommand({ type: 'SET_BATTERY_MODE', value: 'charge' });
    await adapter.sendCommand({ type: 'SET_BATTERY_MODE', value: 'discharge' });

    const modeValues = mockWsHolder.current?.send.mock.calls
      .map(
        (call) =>
          JSON.parse(String(call[0])) as {
            method: string;
            params?: { properties?: { name: string; value: unknown }[] };
          },
      )
      .filter((req) => req.method === 'updateComponentConfig')
      .flatMap((req) => req.params?.properties ?? [])
      .filter((property) => property.name === 'mode')
      .map((property) => property.value);

    expect(modeValues).toContain('CHARGE_GRID');
    expect(modeValues).toContain('DISCHARGE_TO_GRID');
  });

  it('writes peak shaving limit for SET_GRID_LIMIT in watts', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_GRID_LIMIT', value: 4.2 });
    expect(result.success).toBe(true);

    const updateCall = mockWsHolder.current?.send.mock.calls.find((call) => {
      const payload = JSON.parse(String(call[0])) as {
        method: string;
        params: { componentId: string; properties: { value: number }[] };
      };
      return (
        payload.method === 'updateComponentConfig' &&
        payload.params.componentId === 'ctrlPeakShaving0'
      );
    });
    const request = JSON.parse(String(updateCall?.[0])) as {
      params: { properties: { value: number }[] };
    };
    expect(request.params.properties[0]?.value).toBe(4200);
  });

  it('passes through SET_GRID_LIMIT values outside kW range', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_GRID_LIMIT', value: -1 });
    expect(result.handled).toBe(false);
    expect(result.success).toBe(false);
  });

  it('passes through OCPP-watt SET_GRID_LIMIT when disconnected', async () => {
    const result = await adapter.sendCommand({ type: 'SET_GRID_LIMIT', value: 4200 });
    expect(result.handled).toBe(false);
    expect(result.success).toBe(false);
  });

  it('rejects invalid SET_BATTERY_MODE values', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({
      type: 'SET_BATTERY_MODE',
      value: 'self-consumption',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('charge or discharge');
  });

  it('rejects invalid SET_HEAT_PUMP_MODE values', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({
      type: 'SET_HEAT_PUMP_MODE',
      value: 'off' as unknown as number,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('SG Ready mode between 1 and 4');
  });

  it('returns handled:false for unsupported command types', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({
      type: 'KNX_TOGGLE_LIGHTS',
      value: true,
    });
    expect(result).toEqual({ handled: false, success: false });
  });
});
