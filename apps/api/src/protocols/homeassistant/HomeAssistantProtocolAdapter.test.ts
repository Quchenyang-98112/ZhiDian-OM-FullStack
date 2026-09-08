/**
 * HomeAssistantProtocolAdapter unit tests — mock WebSocket, no real HA instance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWsHolder = vi.hoisted(() => ({
  current: null as {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    removeAllListeners: ReturnType<typeof vi.fn>;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
  } | null,
}));

vi.mock('ws', () => {
  class MockWebSocket {
    private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    send = vi.fn();
    close = vi.fn();
    removeAllListeners = vi.fn(() => this.listeners.clear());

    constructor(_url: string) {
      mockWsHolder.current = this;
    }

    on(event: string, cb: (...args: unknown[]) => void): void {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event)?.add(cb);
    }

    emit(event: string, ...args: unknown[]): void {
      for (const cb of this.listeners.get(event) ?? []) {
        cb(...args);
      }
    }
  }

  return { WebSocket: MockWebSocket };
});

import {
  createHomeAssistantAdapterFromEnv,
  HomeAssistantProtocolAdapter,
  type HomeAssistantProtocolAdapterConfig,
} from './HomeAssistantProtocolAdapter.js';

const testConfig: HomeAssistantProtocolAdapterConfig = {
  id: 'test-ha-01',
  host: 'homeassistant.local',
  port: 8123,
  token: 'test-token',
  deviceId: 'ha-home',
  entityMappings: [
    { entityId: 'sensor.solar_power', metric: 'POWER_W', role: 'pv' },
    { entityId: 'sensor.battery_soc', metric: 'SOC_PERCENT', role: 'battery' },
    { entityId: 'number.wallbox_max_current', metric: 'POWER_W', role: 'ev' },
    { entityId: 'switch.wallbox_charging', metric: 'POWER_W', role: 'ev' },
  ],
  wallboxCurrentEntityId: 'number.wallbox_max_current',
  wallboxSwitchEntityId: 'switch.wallbox_charging',
};

async function connectAdapter(
  adapter: HomeAssistantProtocolAdapter,
): Promise<NonNullable<typeof mockWsHolder.current>> {
  const connectPromise = adapter.connect();
  await vi.waitFor(() => expect(mockWsHolder.current).not.toBeNull());
  const ws = mockWsHolder.current!;
  ws.emit('message', JSON.stringify({ type: 'auth_required' }));
  ws.emit('message', JSON.stringify({ type: 'auth_ok' }));
  await connectPromise;
  return ws;
}

function resolveLastServiceCall(
  ws: NonNullable<typeof mockWsHolder.current>,
  success = true,
): void {
  const serviceCall = ws.send.mock.calls
    .map((call) => JSON.parse(String(call[0])) as { id?: number; type: string })
    .findLast((payload) => payload.type === 'call_service');
  expect(serviceCall?.id).toBeDefined();
  ws.emit(
    'message',
    JSON.stringify({
      id: serviceCall?.id,
      type: 'result',
      success,
      ...(success ? {} : { error: { code: 'homeassistant', message: 'service failed' } }),
    }),
  );
}

describe('HomeAssistantProtocolAdapter', () => {
  let adapter: HomeAssistantProtocolAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new HomeAssistantProtocolAdapter(testConfig);
  });

  afterEach(async () => {
    await adapter.disconnect().catch(() => {
      /* ignore */
    });
  });

  it('has correct id and protocol', () => {
    expect(adapter.id).toBe('test-ha-01');
    expect(adapter.protocol).toBe('homeassistant-mqtt');
  });

  it('connects via HA auth handshake and yields mapped state_changed datapoints', async () => {
    const stream = adapter.getDataStream();
    const nextPromise = stream.next();

    const connectPromise = adapter.connect();

    await vi.waitFor(() => {
      expect(mockWsHolder.current).not.toBeNull();
    });

    const ws = mockWsHolder.current;
    ws?.emit('message', JSON.stringify({ type: 'auth_required' }));
    expect(ws?.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'auth', access_token: 'test-token' }),
    );

    ws?.emit('message', JSON.stringify({ type: 'auth_ok' }));
    await connectPromise;

    ws?.emit(
      'message',
      JSON.stringify({
        type: 'event',
        event: {
          event_type: 'state_changed',
          data: {
            entity_id: 'sensor.solar_power',
            new_state: {
              state: '4200',
              attributes: { unit_of_measurement: 'W', device_class: 'power' },
            },
          },
        },
      }),
    );

    const result = await nextPromise;
    expect(result.done).toBe(false);
    expect(result.value).toMatchObject({
      protocol: 'homeassistant-mqtt',
      metric: 'POWER_W',
      role: 'pv',
      value: 4200,
      deviceId: 'ha-home:sensor.solar_power',
    });

    await adapter.disconnect();
    await stream.next();
  });

  it('reports offline health before connect', async () => {
    const health = await adapter.healthCheck();
    expect(health.status).toBe('offline');
  });

  it('createHomeAssistantAdapterFromEnv returns null without host/token', () => {
    expect(createHomeAssistantAdapterFromEnv({})).toBeNull();
    expect(
      createHomeAssistantAdapterFromEnv({ HA_HOST: 'ha.local', HA_TOKEN: 'secret' }),
    ).not.toBeNull();
  });

  it('createHomeAssistantAdapterFromEnv parses HA_WALLBOX_MAINS_VOLTAGE via Zod', async () => {
    const envAdapter = createHomeAssistantAdapterFromEnv({
      HA_HOST: 'ha.local',
      HA_TOKEN: 'secret',
      HA_WALLBOX_CURRENT_ENTITY: 'number.wallbox_max_current',
      HA_WALLBOX_MAINS_VOLTAGE: '400',
    });
    expect(envAdapter).not.toBeNull();

    const ws = await connectAdapter(envAdapter!);
    const powerPromise = envAdapter!.sendCommand({ type: 'SET_EV_POWER', value: 8000 });
    resolveLastServiceCall(ws);
    await powerPromise;

    const powerCall = ws.send.mock.calls
      .map(
        (call) =>
          JSON.parse(String(call[0])) as {
            type: string;
            service_data?: { value: number };
          },
      )
      .findLast((payload) => payload.type === 'call_service' && payload.service_data?.value !== 16);
    expect(powerCall?.service_data?.value).toBe(20);
    await envAdapter!.disconnect();
  });

  it('createHomeAssistantAdapterFromEnv ignores invalid HA_WALLBOX_MAINS_VOLTAGE', async () => {
    const envAdapter = createHomeAssistantAdapterFromEnv({
      HA_HOST: 'ha.local',
      HA_TOKEN: 'secret',
      HA_WALLBOX_CURRENT_ENTITY: 'number.wallbox_max_current',
      HA_WALLBOX_MAINS_VOLTAGE: 'not-a-number',
    });
    expect(envAdapter).not.toBeNull();

    const ws = await connectAdapter(envAdapter!);
    const powerPromise = envAdapter!.sendCommand({ type: 'SET_EV_POWER', value: 2300 });
    resolveLastServiceCall(ws);
    await powerPromise;

    const powerCall = ws.send.mock.calls
      .map(
        (call) =>
          JSON.parse(String(call[0])) as {
            type: string;
            service_data?: { value: number };
          },
      )
      .findLast((payload) => payload.type === 'call_service');
    expect(powerCall?.service_data?.value).toBe(10);
    await envAdapter!.disconnect();
  });

  it('sends call_service for START_CHARGING when connected', async () => {
    const ws = await connectAdapter(adapter);

    const resultPromise = adapter.sendCommand({ type: 'START_CHARGING', value: true });
    resolveLastServiceCall(ws);
    const result = await resultPromise;
    expect(result).toEqual({ handled: true, success: true, adapterId: 'test-ha-01' });

    const serviceCall = ws.send.mock.calls.find((call) => {
      const payload = JSON.parse(String(call[0])) as { type: string };
      return payload.type === 'call_service';
    });
    expect(serviceCall).toBeDefined();
    const payload = JSON.parse(String(serviceCall?.[0])) as {
      type: string;
      domain: string;
      service: string;
      target: { entity_id: string };
    };
    expect(payload.domain).toBe('switch');
    expect(payload.service).toBe('turn_on');
    expect(payload.target.entity_id).toBe('switch.wallbox_charging');
  });

  it('sends number.set_value for SET_EV_CURRENT and converts SET_EV_POWER to amps', async () => {
    const ws = await connectAdapter(adapter);

    const currentPromise = adapter.sendCommand({ type: 'SET_EV_CURRENT', value: 16 });
    resolveLastServiceCall(ws);
    await currentPromise;

    const powerPromise = adapter.sendCommand({ type: 'SET_EV_POWER', value: 2300 });
    resolveLastServiceCall(ws);
    await powerPromise;

    const currentCall = ws.send.mock.calls
      .map(
        (call) =>
          JSON.parse(String(call[0])) as { service: string; service_data?: { value: number } },
      )
      .find((payload) => payload.service === 'set_value' && payload.service_data?.value === 16);
    expect(currentCall).toBeDefined();

    const powerCall = ws.send.mock.calls
      .map((call) => JSON.parse(String(call[0])) as { service_data?: { value: number } })
      .find((payload) => payload.service_data?.value === 10);
    expect(powerCall).toBeDefined();
  });

  it('uses configured mains voltage for SET_EV_POWER conversion', async () => {
    const custom = new HomeAssistantProtocolAdapter({
      ...testConfig,
      id: 'ha-custom-voltage',
      mainsVoltage: 400,
    });
    const ws = await connectAdapter(custom);

    const powerPromise = custom.sendCommand({ type: 'SET_EV_POWER', value: 4000 });
    resolveLastServiceCall(ws);
    await powerPromise;

    const powerCall = ws.send.mock.calls
      .map((call) => JSON.parse(String(call[0])) as { service_data?: { value: number } })
      .find((payload) => payload.service_data?.value === 10);
    expect(powerCall).toBeDefined();
    await custom.disconnect();
  });

  it('sends switch.turn_off for STOP_CHARGING', async () => {
    const ws = await connectAdapter(adapter);

    const resultPromise = adapter.sendCommand({ type: 'STOP_CHARGING', value: true });
    resolveLastServiceCall(ws);
    const result = await resultPromise;
    expect(result.success).toBe(true);

    const payload = ws.send.mock.calls
      .map((call) => JSON.parse(String(call[0])) as { service: string })
      .find((entry) => entry.service === 'turn_off');
    expect(payload).toBeDefined();
  });

  it('fails when HA returns an unsuccessful call_service result', async () => {
    const ws = await connectAdapter(adapter);

    const resultPromise = adapter.sendCommand({ type: 'START_CHARGING', value: true });
    resolveLastServiceCall(ws, false);
    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('service failed');
  });

  it('rejects non-numeric SET_EV_CURRENT values', async () => {
    await connectAdapter(adapter);
    const result = await adapter.sendCommand({
      type: 'SET_EV_CURRENT',
      value: '16' as unknown as number,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('non-negative number');
  });

  it('returns not-connected error before auth completes', async () => {
    const result = await adapter.sendCommand({ type: 'START_CHARGING', value: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('fails when wallbox entities are not configured', async () => {
    const bare = new HomeAssistantProtocolAdapter({
      id: 'bare-ha',
      host: 'ha.local',
      token: 'token',
      deviceId: 'ha-home',
      entityMappings: [{ entityId: 'sensor.solar_power', metric: 'POWER_W', role: 'pv' }],
    });

    await connectAdapter(bare);

    const result = await bare.sendCommand({ type: 'SET_EV_CURRENT', value: 16 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
    await bare.disconnect();
  });

  it('does not cross-match sensor entities as wallbox controls', async () => {
    const mapped = new HomeAssistantProtocolAdapter({
      id: 'ha-map-only',
      host: 'ha.local',
      token: 'token',
      entityMappings: [
        { entityId: 'sensor.ev_charger_current', metric: 'POWER_W', role: 'ev' },
        { entityId: 'sensor.ev_charging_state', metric: 'POWER_W', role: 'ev' },
      ],
    });

    await connectAdapter(mapped);
    const result = await mapped.sendCommand({ type: 'SET_EV_CURRENT', value: 16 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
    await mapped.disconnect();
  });
});
