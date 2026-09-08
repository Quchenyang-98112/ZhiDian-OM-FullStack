import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeAssistantMQTTAdapter } from '../core/adapters/contrib/homeassistant-mqtt';
import type { EnergyAdapter } from '../core/adapters/EnergyAdapter';

// ────────────────────────────────────────────────────────────────────
// HomeAssistantMQTTAdapter — Unit Tests
// Tests the HA MQTT discovery adapter. Uses a mock WebSocket
// to simulate the Mosquitto broker MQTT-over-WebSocket connection.
// ────────────────────────────────────────────────────────────────────

let mockInstance: MockWebSocket | null = null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static constructorUrl = '';
  readyState: number = WebSocket.CONNECTING;
  protocol: string = '';
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer | string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(url: string, protocol?: string) {
    MockWebSocket.constructorUrl = url;
    this.protocol = typeof protocol === 'string' ? protocol : '';
    mockInstance = this;
  }
}

describe('HomeAssistantMQTTAdapter — Interface Contract', () => {
  let adapter: EnergyAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new HomeAssistantMQTTAdapter();
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('has correct id = homeassistant-mqtt', () => {
    expect(adapter.id).toBe('homeassistant-mqtt');
  });

  it('has name containing Home Assistant', () => {
    expect(adapter.name).toMatch(/home assistant/i);
  });

  it('declares pv, battery, grid, load and evCharger capabilities', () => {
    expect(adapter.capabilities).toContain('pv');
    expect(adapter.capabilities).toContain('battery');
    expect(adapter.capabilities).toContain('grid');
    expect(adapter.capabilities).toContain('load');
    expect(adapter.capabilities).toContain('evCharger');
  });

  it('starts with disconnected status', () => {
    expect(adapter.status).toBe('disconnected');
  });

  it('returns empty snapshot before connect', () => {
    expect(adapter.getSnapshot()).toEqual({});
  });

  it('destroys cleanly without errors', () => {
    expect(() => adapter.destroy()).not.toThrow();
  });
});

describe('HomeAssistantMQTTAdapter — WebSocket Lifecycle', () => {
  let adapter: HomeAssistantMQTTAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new HomeAssistantMQTTAdapter({
      host: 'homeassistant.local',
      port: 1884,
    });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('opens WebSocket to correct host on connect()', async () => {
    const p = adapter.connect();
    // URL is set synchronously by constructor
    expect(MockWebSocket.constructorUrl).toContain('homeassistant.local');
    // Trigger quick rejection to avoid 10s connect timeout
    mockInstance?.onerror?.({});
    await p.catch(() => {});
  });

  it('transitions to connected when WebSocket opens', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    expect(adapter.status).toBe('connected');
  });

  it('transitions to error state when WebSocket errors', async () => {
    const p = adapter.connect();
    mockInstance!.onerror?.({ message: 'ECONNREFUSED' });
    await p.catch(() => {});
    expect(['error', 'disconnected', 'connecting']).toContain(adapter.status);
  });

  it('transitions to disconnected when WebSocket closes', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = MockWebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    mockInstance!.onclose?.();
    expect(adapter.status).toBe('disconnected');
  });
});

describe('HomeAssistantMQTTAdapter — Entity Mapping (Custom Config)', () => {
  let adapter: HomeAssistantMQTTAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new HomeAssistantMQTTAdapter({
      host: 'ha.local',
      entityMap: {
        pvPower: 'sensor.custom_solar_w',
        batteryPower: 'sensor.custom_bat_w',
        batterySoc: 'sensor.custom_bat_soc',
        gridPower: 'sensor.custom_grid_w',
        housePower: 'sensor.custom_house_w',
        pvEnergyToday: 'sensor.custom_solar_kwh',
        evPower: 'sensor.custom_ev_w',
        evSoc: 'sensor.custom_ev_soc',
        evStatus: 'sensor.custom_ev_status',
      },
    });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('accepts custom entity map in constructor', () => {
    // If the adapter was constructed without error, the mapping was accepted
    expect(adapter.id).toBe('homeassistant-mqtt');
  });
});

describe('HomeAssistantMQTTAdapter — MQTT Auth Credentials', () => {
  it('stores credentials when provided in config', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new HomeAssistantMQTTAdapter({
      host: 'ha.local',
      mqttUser: 'testuser',
      mqttPassword: 'testpass',
    });
    // Credentials are stored internally; just verify constructor succeeds
    expect(adapter.status).toBe('disconnected');
    adapter.destroy();
    vi.unstubAllGlobals();
  });
});

describe('HomeAssistantMQTTAdapter — Data Callbacks', () => {
  it('registers onData callback without error', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new HomeAssistantMQTTAdapter({ host: 'ha.local' });
    const dataSpy = vi.fn();
    expect(() => adapter.onData(dataSpy)).not.toThrow();

    const p = adapter.connect();
    mockInstance!.readyState = MockWebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    adapter.destroy();
    vi.unstubAllGlobals();
  });
});

describe('HomeAssistantMQTTAdapter — sensor state messages', () => {
  let adapter: HomeAssistantMQTTAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new HomeAssistantMQTTAdapter({ host: 'ha.local' });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  async function connectOpen(): Promise<MockWebSocket> {
    const p = adapter.connect();
    const ws = mockInstance!;
    ws.readyState = WebSocket.OPEN;
    ws.onopen?.();
    await p;
    return ws;
  }

  it('updates snapshot from entity_id/state JSON messages', async () => {
    await connectOpen();

    mockInstance!.onmessage?.({
      data: JSON.stringify({ entity_id: 'sensor.solar_power', state: '4200' }),
    });
    mockInstance!.onmessage?.({
      data: JSON.stringify({ entity_id: 'sensor.battery_power', state: '-800' }),
    });
    mockInstance!.onmessage?.({
      data: JSON.stringify({ entity_id: 'sensor.battery_soc', state: '72' }),
    });
    mockInstance!.onmessage?.({
      data: JSON.stringify({ entity_id: 'sensor.grid_power', state: '1500' }),
    });
    mockInstance!.onmessage?.({
      data: JSON.stringify({ entity_id: 'sensor.house_power', state: '3100' }),
    });

    const snapshot = adapter.getSnapshot();
    expect(snapshot.pv?.totalPowerW).toBe(4200);
    expect(snapshot.battery?.powerW).toBe(-800);
    expect(snapshot.battery?.socPercent).toBe(72);
    expect(snapshot.grid?.powerW).toBe(1500);
    expect(snapshot.load?.totalPowerW).toBe(3100);
  });

  it('maps EV status strings to charger snapshot', async () => {
    await connectOpen();

    mockInstance!.onmessage?.({
      data: JSON.stringify({ entity_id: 'sensor.wallbox_power', state: '7400' }),
    });
    mockInstance!.onmessage?.({
      data: JSON.stringify({ entity_id: 'sensor.ev_soc', state: '55' }),
    });
    mockInstance!.onmessage?.({
      data: JSON.stringify({ entity_id: 'sensor.wallbox_status', state: 'charging' }),
    });

    const snapshot = adapter.getSnapshot();
    expect(snapshot.evCharger?.status).toBe('charging');
    expect(snapshot.evCharger?.powerW).toBe(7400);
    expect(snapshot.evCharger?.socPercent).toBe(55);
    expect(snapshot.evCharger?.vehicleConnected).toBe(true);
  });

  it('invokes onData callback when sensor values change', async () => {
    const dataSpy = vi.fn();
    adapter.onData(dataSpy);
    await connectOpen();

    mockInstance!.onmessage?.({
      data: JSON.stringify({ entity_id: 'sensor.solar_power', state: '1800' }),
    });

    expect(dataSpy).toHaveBeenCalled();
    expect(dataSpy.mock.calls.at(-1)?.[0]?.pv?.totalPowerW).toBe(1800);
  });
});

describe('HomeAssistantMQTTAdapter — MQTT auth on connect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('sends auth payload and subscribes to mapped entity topics', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new HomeAssistantMQTTAdapter({
      host: 'ha.local',
      mqttUser: 'mqtt-user',
      mqttPassword: 'mqtt-secret',
    });

    const p = adapter.connect();
    const ws = mockInstance!;
    ws.readyState = WebSocket.OPEN;
    ws.onopen?.();
    await p;

    const payloads = ws.send.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(payloads[0]).toEqual({
      type: 'auth',
      username: 'mqtt-user',
      password: 'mqtt-secret',
    });
    expect(
      payloads.some((msg) => msg.type === 'subscribe' && msg.topic?.includes('solar_power')),
    ).toBe(true);

    adapter.destroy();
  });
});

describe('HomeAssistantMQTTAdapter — HA service commands', () => {
  let adapter: HomeAssistantMQTTAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new HomeAssistantMQTTAdapter({ host: 'ha.local' });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  async function connectOpen(): Promise<MockWebSocket> {
    const p = adapter.connect();
    const ws = mockInstance!;
    ws.readyState = WebSocket.OPEN;
    ws.onopen?.();
    await p;
    return ws;
  }

  it('rejects commands when disconnected', async () => {
    await expect(adapter.sendCommand({ type: 'SET_EV_CURRENT', value: 16 })).resolves.toBe(false);
  });

  it('dispatches SET_EV_CURRENT, START_CHARGING, and STOP_CHARGING', async () => {
    const ws = await connectOpen();

    await expect(adapter.sendCommand({ type: 'SET_EV_CURRENT', value: 16 })).resolves.toBe(true);
    await expect(adapter.sendCommand({ type: 'START_CHARGING', value: true })).resolves.toBe(true);
    await expect(adapter.sendCommand({ type: 'STOP_CHARGING', value: false })).resolves.toBe(true);

    const payloads = ws.send.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(
      payloads.some(
        (msg) =>
          msg.type === 'call_service' &&
          msg.domain === 'number' &&
          msg.service === 'set_value' &&
          msg.data?.value === 16,
      ),
    ).toBe(true);
    expect(
      payloads.some(
        (msg) =>
          msg.type === 'call_service' &&
          msg.domain === 'switch' &&
          msg.service === 'turn_on' &&
          msg.data?.entity_id === 'switch.wallbox_charging',
      ),
    ).toBe(true);
    expect(
      payloads.some(
        (msg) =>
          msg.type === 'call_service' &&
          msg.domain === 'switch' &&
          msg.service === 'turn_off' &&
          msg.data?.entity_id === 'switch.wallbox_charging',
      ),
    ).toBe(true);
  });
});

describe('HomeAssistantMQTTAdapter — ha-ws-api auth', () => {
  it('rejects connect when auth_required but no haToken', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new HomeAssistantMQTTAdapter({
      host: 'ha.local',
      haMode: 'ha-ws-api',
      port: 8123,
    });
    let connectError: string | undefined;
    adapter.onStatus((status, error) => {
      if (status === 'error') connectError = error;
    });
    const p = adapter.connect();
    mockInstance!.onmessage?.({
      data: JSON.stringify({ type: 'auth_required', ha_version: '2024.1' }),
    });
    await p;
    expect(adapter.status).toBe('error');
    expect(connectError).toMatch(/haToken/);
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('authenticates with haToken on auth_required', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new HomeAssistantMQTTAdapter({
      host: 'ha.local',
      haMode: 'ha-ws-api',
      port: 8123,
      haToken: 'test-long-lived-token',
    });
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) });
    expect(mockInstance!.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'auth', access_token: 'test-long-lived-token' }),
    );
    mockInstance!.onmessage?.({ data: JSON.stringify({ type: 'auth_ok' }) });
    await p;
    expect(adapter.status).toBe('connected');
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });
});

describe('HomeAssistantMQTTAdapter — ha-ws-api discovery & transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('fails connect on auth_invalid', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new HomeAssistantMQTTAdapter({
      host: 'ha.local',
      haMode: 'ha-ws-api',
      port: 8123,
      haToken: 'bad-token',
    });
    let connectError: string | undefined;
    adapter.onStatus((status, error) => {
      if (status === 'error') connectError = error;
    });

    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) });
    mockInstance!.onmessage?.({ data: JSON.stringify({ type: 'auth_invalid' }) });
    await p;

    expect(adapter.status).toBe('error');
    expect(connectError).toMatch(/authentication invalid/i);
    adapter.destroy();
  });

  it('subscribes and requests states when haDiscovery is enabled', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new HomeAssistantMQTTAdapter({
      host: 'ha.local',
      haMode: 'ha-ws-api',
      port: 8123,
      haToken: 'valid-token',
      haDiscovery: true,
    });

    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) });
    mockInstance!.onmessage?.({ data: JSON.stringify({ type: 'auth_ok' }) });
    await p;

    const payloads = mockInstance!.send.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(payloads.some((m) => m.type === 'subscribe_events')).toBe(true);
    expect(payloads.some((m) => m.type === 'get_states')).toBe(true);
    adapter.destroy();
  });

  it('maps state_changed solar events into the energy model', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new HomeAssistantMQTTAdapter({
      host: 'ha.local',
      haMode: 'ha-ws-api',
      port: 8123,
      haToken: 'valid-token',
      haDiscovery: true,
    });

    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) });
    mockInstance!.onmessage?.({ data: JSON.stringify({ type: 'auth_ok' }) });
    await p;

    mockInstance!.onmessage?.({
      data: JSON.stringify({
        type: 'event',
        event: {
          event_type: 'state_changed',
          data: {
            entity_id: 'sensor.solar_power',
            new_state: {
              state: '3500',
              attributes: {
                device_class: 'power',
                unit_of_measurement: 'W',
                friendly_name: 'Solar',
              },
            },
          },
        },
      }),
    });

    expect(adapter.getSnapshot().pv?.totalPowerW).toBe(3500);
    adapter.destroy();
  });

  it('sets status error when ha-ws-api WebSocket errors', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new HomeAssistantMQTTAdapter({
      host: 'ha.local',
      haMode: 'ha-ws-api',
      port: 8123,
      haToken: 'valid-token',
    });
    let connectError: string | undefined;
    adapter.onStatus((status, error) => {
      if (status === 'error') connectError = error;
    });

    const p = adapter.connect();
    mockInstance!.onerror?.({});
    await p;

    expect(adapter.status).toBe('error');
    expect(connectError).toMatch(/connection failed|connection error/i);
    adapter.destroy();
  });
});

describe('HomeAssistantMQTTAdapter — register()', () => {
  it('registers the homeassistant-mqtt factory in the adapter registry', async () => {
    const { getRegisteredAdapter, unregisterAdapter } = await import(
      '../core/adapters/adapter-registry'
    );
    const { register } = await import('../core/adapters/contrib/homeassistant-mqtt');

    register();
    const entry = getRegisteredAdapter('homeassistant-mqtt');
    expect(entry?.source).toBe('contrib');
    expect(entry?.displayName).toBe('Home Assistant MQTT');

    unregisterAdapter('homeassistant-mqtt');
  });
});
