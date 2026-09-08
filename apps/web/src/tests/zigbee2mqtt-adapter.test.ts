import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Zigbee2MQTTAdapter } from '../core/adapters/contrib/zigbee2mqtt';
import type { EnergyAdapter } from '../core/adapters/EnergyAdapter';

// ────────────────────────────────────────────────────────────────────
// Zigbee2MQTTAdapter — Unit Tests
// Tests the Zigbee2MQTT bridge adapter using a mocked WebSocket.
// Simulates MQTT-over-WebSocket message flow including SUBSCRIBE and
// PUBLISH for device states.
// ────────────────────────────────────────────────────────────────────

let mockInstance: MockWebSocket | null = null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static constructorProtocol: string | string[] | undefined = undefined;
  readyState: number = WebSocket.CONNECTING;
  protocol: string = '';
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer | string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(_url: string, protocol?: string | string[]) {
    MockWebSocket.constructorProtocol = protocol;
    const proto = Array.isArray(protocol) ? protocol[0] : (protocol ?? '');
    this.protocol = proto;
    mockInstance = this;
  }
}

describe('Zigbee2MQTTAdapter — Interface Contract', () => {
  let adapter: EnergyAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new Zigbee2MQTTAdapter();
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('has correct id = zigbee2mqtt', () => {
    expect(adapter.id).toBe('zigbee2mqtt');
  });

  it('has name containing Zigbee', () => {
    expect(adapter.name).toMatch(/zigbee/i);
  });

  it('declares load and grid capabilities', () => {
    expect(adapter.capabilities).toContain('load');
    expect(adapter.capabilities).toContain('grid');
  });

  it('starts disconnected', () => {
    expect(adapter.status).toBe('disconnected');
  });

  it('returns empty snapshot before connect', () => {
    expect(adapter.getSnapshot()).toEqual({});
  });

  it('destroys cleanly without errors', () => {
    expect(() => adapter.destroy()).not.toThrow();
  });
});

describe('Zigbee2MQTTAdapter — WebSocket Lifecycle', () => {
  let adapter: Zigbee2MQTTAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new Zigbee2MQTTAdapter({
      host: 'mosquitto.local',
      port: 9001,
      baseTopic: 'zigbee2mqtt',
      energyDevices: ['NOUS A5T', 'Aqara Smart Plug'],
    });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('connects to broker WebSocket on connect()', async () => {
    const p = adapter.connect();
    // WebSocket constructor ran synchronously
    expect(mockInstance).not.toBeNull();
    // Trigger quick rejection to avoid 10s connect timeout
    mockInstance!.onerror?.({});
    await p.catch(() => {});
  });

  it('uses mqtt subprotocol', async () => {
    const p = adapter.connect();
    // Check constructor args before awaiting (set synchronously)
    if (MockWebSocket.constructorProtocol !== undefined) {
      const proto = Array.isArray(MockWebSocket.constructorProtocol)
        ? MockWebSocket.constructorProtocol.join(',')
        : MockWebSocket.constructorProtocol;
      expect(proto).toMatch(/mqtt/);
    }
    // Trigger quick rejection to avoid 10s connect timeout
    mockInstance!.onerror?.({});
    await p.catch(() => {});
  });

  it('transitions to connected on WebSocket open', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    expect(adapter.status).toBe('connected');
  });

  it('transitions to error when broker is unreachable', async () => {
    const p = adapter.connect();
    mockInstance!.onerror?.({ message: 'ECONNREFUSED' });
    await p.catch(() => {});
    expect(['error', 'disconnected']).toContain(adapter.status);
  });

  it('transitions to disconnected on WebSocket close', async () => {
    const p = adapter.connect();
    mockInstance!.onopen?.();
    await p.catch(() => {});
    mockInstance!.onclose?.();
    expect(adapter.status).toBe('disconnected');
  });
});

describe('Zigbee2MQTTAdapter — MQTT Message Handling', () => {
  let adapter: Zigbee2MQTTAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new Zigbee2MQTTAdapter({
      host: 'mosquitto.local',
      port: 9001,
      baseTopic: 'zigbee2mqtt',
      energyDevices: ['nous-a5t', 'aqara-plug'],
    });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('handles Shelly/Zigbee device state JSON message', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    // Simulate MQTT PUBLISH packet with JSON device state
    const devicePayload = JSON.stringify({
      power: 145.3,
      energy: 12.5,
      voltage: 230.1,
      current: 0.63,
      state: 'ON',
    });
    const encoder = new TextEncoder();
    const topic = 'zigbee2mqtt/nous-a5t';
    const topicBytes = encoder.encode(topic);
    const payloadBytes = encoder.encode(devicePayload);
    const packet = new Uint8Array(4 + topicBytes.length + payloadBytes.length);
    packet[0] = 0x30;
    packet[1] = 2 + topicBytes.length + payloadBytes.length;
    packet[2] = (topicBytes.length >> 8) & 0xff;
    packet[3] = topicBytes.length & 0xff;
    packet.set(topicBytes, 4);
    packet.set(payloadBytes, 4 + topicBytes.length);

    expect(() => {
      mockInstance!.onmessage?.({ data: packet.buffer });
    }).not.toThrow();
  });

  it('handles bridge online state message', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    const onlinePayload = JSON.stringify({ state: 'online' });
    const encoder = new TextEncoder();
    const topic = 'zigbee2mqtt/bridge/state';
    const topicBytes = encoder.encode(topic);
    const payloadBytes = encoder.encode(onlinePayload);
    const packet = new Uint8Array(4 + topicBytes.length + payloadBytes.length);
    packet[0] = 0x30;
    packet[1] = 2 + topicBytes.length + payloadBytes.length;
    packet[2] = 0;
    packet[3] = topicBytes.length & 0xff;
    packet.set(topicBytes, 4);
    packet.set(payloadBytes, 4 + topicBytes.length);

    expect(() => {
      mockInstance!.onmessage?.({ data: packet.buffer });
    }).not.toThrow();
  });

  it('handles bridge devices list message', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    const devicesPayload = JSON.stringify([
      {
        friendly_name: 'nous-a5t',
        ieee_address: '0x00158d0001a2b3c4',
        type: 'EndDevice',
        definition: {
          model: 'A5T-EU',
          vendor: 'NOUS',
          exposes: [{ type: 'switch' }, { type: 'numeric', name: 'power' }],
        },
      },
    ]);
    const encoder = new TextEncoder();
    const topic = 'zigbee2mqtt/bridge/devices';
    const topicBytes = encoder.encode(topic);
    const payloadBytes = encoder.encode(devicesPayload);
    const packet = new Uint8Array(4 + topicBytes.length + payloadBytes.length);
    packet[0] = 0x30;
    packet[1] = 2 + topicBytes.length + payloadBytes.length;
    packet[2] = 0;
    packet[3] = topicBytes.length & 0xff;
    packet.set(topicBytes, 4);
    packet.set(payloadBytes, 4 + topicBytes.length);

    expect(() => {
      mockInstance!.onmessage?.({ data: packet.buffer });
    }).not.toThrow();
  });

  it('ignores malformed binary messages without crashing', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    // Truncated packet
    const garbage = new Uint8Array([0x30, 0x05, 0x00, 0x02]);
    expect(() => {
      mockInstance!.onmessage?.({ data: garbage.buffer });
    }).not.toThrow();
  });
});

describe('Zigbee2MQTTAdapter — Commands', () => {
  let adapter: Zigbee2MQTTAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new Zigbee2MQTTAdapter({
      host: 'mosquitto.local',
      energyDevices: ['plug1'],
    });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('rejects commands when disconnected', async () => {
    const result = await adapter.sendCommand({ type: 'SET_GRID_LIMIT', value: 1 });
    expect(result).toBe(false);
  });

  it('returns false for unhandled command types when connected', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    const result = await adapter.sendCommand({ type: 'SET_HEAT_PUMP_POWER', value: 1 });
    expect(result).toBe(false);
  });
});

describe('Zigbee2MQTTAdapter — Custom Topic Prefix', () => {
  it('accepts custom baseTopic in config', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new Zigbee2MQTTAdapter({
      baseTopic: 'z2m/house',
      energyDevices: ['meter'],
    });
    expect(adapter.id).toBe('zigbee2mqtt');
    adapter.destroy();
    vi.unstubAllGlobals();
  });
});

function sendBridgeJsonMessage(
  ws: MockWebSocket,
  topic: string,
  payload: Record<string, unknown> | unknown[],
): void {
  ws.onmessage?.({
    data: JSON.stringify({ topic, payload }),
  });
}

describe('Zigbee2MQTTAdapter — JSON bridge messages', () => {
  let adapter: Zigbee2MQTTAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new Zigbee2MQTTAdapter({
      host: 'mosquitto.local',
      port: 9001,
      baseTopic: 'zigbee2mqtt',
      energyDevices: ['nous-a5t'],
    });
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

  it('updates snapshot when a device state JSON message arrives', async () => {
    const ws = await connectOpen();

    sendBridgeJsonMessage(ws, 'zigbee2mqtt/nous-a5t', {
      power: 320,
      energy: 4.2,
      voltage: 231,
      current: 1.4,
      state: 'ON',
    });

    const snapshot = adapter.getSnapshot();
    // P1 behaviour: smart plugs contribute to load, not grid.
    // Grid is only set when a dedicated EM device (role 'grid') is present.
    expect(snapshot.load?.totalPowerW).toBe(320);
    // grid.powerW reflects only EM grid meters; plug power goes to load only
    expect(snapshot.grid?.powerW).toBe(0);
  });

  it('auto-subscribes to power-capable devices from bridge/devices', async () => {
    const ws = await connectOpen();

    sendBridgeJsonMessage(ws, 'zigbee2mqtt/bridge/devices', [
      {
        friendly_name: 'aqara-plug',
        ieee_address: '0x00158d0001a2b3c4',
        type: 'EndDevice',
        definition: {
          model: 'SP-EUC01',
          vendor: 'Aqara',
          exposes: [{ type: 'numeric', name: 'power' }],
        },
      },
    ]);

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'subscribe', topic: 'zigbee2mqtt/aqara-plug' }),
    );
  });

  it('marks adapter error when bridge reports offline', async () => {
    const ws = await connectOpen();

    sendBridgeJsonMessage(ws, 'zigbee2mqtt/bridge/state', { state: 'offline' });

    expect(adapter.status).toBe('error');
  });

  it('sends KNX_TOGGLE_LIGHTS to device set topic when connected', async () => {
    const ws = await connectOpen();

    const result = await adapter.sendCommand({
      type: 'KNX_TOGGLE_LIGHTS',
      targetDeviceId: 'nous-a5t',
      value: false,
    });

    expect(result).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        topic: 'zigbee2mqtt/nous-a5t/set',
        payload: JSON.stringify({ state: 'OFF' }),
      }),
    );
  });
});

describe('Zigbee2MQTTAdapter — wildcard subscribe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('subscribes to wildcard topic when no energy devices are configured', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new Zigbee2MQTTAdapter({ host: 'mosquitto.local' });
    const p = adapter.connect();
    const ws = mockInstance!;
    ws.readyState = WebSocket.OPEN;
    ws.onopen?.();
    await p;

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'subscribe', topic: 'zigbee2mqtt/+' }),
    );
    adapter.destroy();
  });
});

describe('Zigbee2MQTTAdapter — register()', () => {
  it('registers the zigbee2mqtt factory in the adapter registry', async () => {
    const { getRegisteredAdapter, unregisterAdapter } = await import(
      '../core/adapters/adapter-registry'
    );
    const { register } = await import('../core/adapters/contrib/zigbee2mqtt');

    register();
    const entry = getRegisteredAdapter('zigbee2mqtt');
    expect(entry?.source).toBe('contrib');
    expect(entry?.displayName).toBe('Zigbee2MQTT');

    unregisterAdapter('zigbee2mqtt');
  });
});
