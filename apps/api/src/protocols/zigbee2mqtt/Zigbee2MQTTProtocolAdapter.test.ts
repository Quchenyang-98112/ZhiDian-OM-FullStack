/**
 * Zigbee2MQTTProtocolAdapter unit tests — mock mqtt client, no real broker.
 */

import EventEmitter from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockMqttClient extends EventEmitter {
  subscribe = vi.fn((_topic: string, _opts: unknown, cb?: (err: Error | null) => void) => {
    cb?.(null);
    return this;
  });
  end = vi.fn((_force: boolean, _opts: unknown, cb?: () => void) => {
    cb?.();
    return this;
  });
}

let mockClientInstance: MockMqttClient;

vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn(() => {
      mockClientInstance = new MockMqttClient();
      setTimeout(() => mockClientInstance.emit('connect'), 0);
      return mockClientInstance;
    }),
  },
}));

import {
  createZigbee2MQTTAdapterFromEnv,
  Zigbee2MQTTProtocolAdapter,
  type Zigbee2MQTTProtocolAdapterConfig,
} from './Zigbee2MQTTProtocolAdapter.js';

const testConfig: Zigbee2MQTTProtocolAdapterConfig = {
  id: 'test-z2m-01',
  brokerUrl: 'mqtt://localhost:1883',
  baseTopic: 'zigbee2mqtt',
  deviceId: 'z2m-home',
  deviceMappings: [{ friendlyName: 'grid_meter', role: 'grid' }],
};

describe('Zigbee2MQTTProtocolAdapter', () => {
  let adapter: Zigbee2MQTTProtocolAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    adapter = new Zigbee2MQTTProtocolAdapter(testConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect().catch(() => {
      /* ignore */
    });
  });

  it('has correct id and protocol', () => {
    expect(adapter.id).toBe('test-z2m-01');
    expect(adapter.protocol).toBe('zigbee2mqtt');
  });

  it('yields power datapoints from device state messages', async () => {
    const stream = adapter.getDataStream();
    const nextPromise = stream.next();

    mockClientInstance.emit(
      'message',
      'zigbee2mqtt/grid_meter',
      Buffer.from(JSON.stringify({ power: 1250 })),
      { retain: false },
    );

    const result = await nextPromise;
    await adapter.disconnect();

    expect(result.done).toBe(false);
    expect(result.value).toMatchObject({
      protocol: 'zigbee2mqtt',
      metric: 'POWER_W',
      role: 'grid',
      value: 1250,
      deviceId: 'z2m-home:grid_meter',
    });
  });

  it('auto-discovers energy devices from bridge/devices', async () => {
    const stream = adapter.getDataStream();
    const nextPromise = stream.next();

    mockClientInstance.emit(
      'message',
      'zigbee2mqtt/bridge/devices',
      Buffer.from(
        JSON.stringify([
          {
            friendly_name: 'heat_pump_plug',
            type: 'EndDevice',
            definition: {
              exposes: [
                { type: 'switch', name: 'state' },
                { type: 'numeric', name: 'power' },
              ],
            },
          },
        ]),
      ),
      { retain: false },
    );

    mockClientInstance.emit(
      'message',
      'zigbee2mqtt/heat_pump_plug',
      Buffer.from(JSON.stringify({ power: 800 })),
      { retain: false },
    );

    const result = await nextPromise;
    await adapter.disconnect();

    expect(result.value?.role).toBe('heatpump');
    expect(result.value?.value).toBe(800);
  });

  it('auto-discovers multiple energy devices from one bridge/devices payload', async () => {
    const stream = adapter.getDataStream();
    const firstPromise = stream.next();
    const secondPromise = stream.next();

    mockClientInstance.emit(
      'message',
      'zigbee2mqtt/bridge/devices',
      Buffer.from(
        JSON.stringify([
          {
            friendly_name: 'heat_pump_plug',
            type: 'EndDevice',
            definition: {
              exposes: [
                { type: 'switch', name: 'state' },
                { type: 'numeric', name: 'power' },
              ],
            },
          },
          {
            friendly_name: 'grid_meter',
            type: 'EndDevice',
            definition: {
              description: 'Energy meter',
              exposes: [
                { type: 'numeric', name: 'power' },
                { type: 'numeric', name: 'energy' },
              ],
            },
          },
        ]),
      ),
      { retain: false },
    );

    mockClientInstance.emit(
      'message',
      'zigbee2mqtt/heat_pump_plug',
      Buffer.from(JSON.stringify({ power: 800 })),
      { retain: false },
    );
    mockClientInstance.emit(
      'message',
      'zigbee2mqtt/grid_meter',
      Buffer.from(JSON.stringify({ power: 1500 })),
      { retain: false },
    );

    const first = await firstPromise;
    const second = await secondPromise;
    await adapter.disconnect();

    const roles = [first.value?.role, second.value?.role].sort();
    expect(roles).toEqual(['grid', 'heatpump']);
  });

  it('filters unconfigured devices when energyDevices allowlist is set', async () => {
    const filteredAdapter = new Zigbee2MQTTProtocolAdapter({
      ...testConfig,
      energyDevices: ['grid_meter'],
    });
    await filteredAdapter.connect();

    const stream = filteredAdapter.getDataStream();
    const collectPromise = (async () => {
      const values = [];
      for await (const dp of stream) {
        values.push(dp);
      }
      return values;
    })();

    mockClientInstance.emit(
      'message',
      'zigbee2mqtt/bridge/devices',
      Buffer.from(
        JSON.stringify([
          {
            friendly_name: 'heat_pump_plug',
            type: 'EndDevice',
            definition: {
              exposes: [
                { type: 'switch', name: 'state' },
                { type: 'numeric', name: 'power' },
              ],
            },
          },
          {
            friendly_name: 'grid_meter',
            type: 'EndDevice',
            definition: {
              description: 'Energy meter',
              exposes: [
                { type: 'numeric', name: 'power' },
                { type: 'numeric', name: 'energy' },
              ],
            },
          },
        ]),
      ),
      { retain: false },
    );

    mockClientInstance.emit(
      'message',
      'zigbee2mqtt/grid_meter',
      Buffer.from(JSON.stringify({ power: 1500 })),
      { retain: false },
    );
    mockClientInstance.emit(
      'message',
      'zigbee2mqtt/heat_pump_plug',
      Buffer.from(JSON.stringify({ power: 800 })),
      { retain: false },
    );

    await filteredAdapter.disconnect();
    const values = await collectPromise;

    expect(values).toHaveLength(1);
    expect(values[0]?.role).toBe('grid');
    expect(values[0]?.value).toBe(1500);
  });

  it('skips offline devices after availability topic reports offline', async () => {
    const stream = adapter.getDataStream();
    const collectPromise = (async () => {
      const values = [];
      for await (const dp of stream) {
        values.push(dp);
      }
      return values;
    })();

    mockClientInstance.emit(
      'message',
      'zigbee2mqtt/grid_meter/availability',
      Buffer.from('offline'),
      { retain: false },
    );
    mockClientInstance.emit(
      'message',
      'zigbee2mqtt/grid_meter',
      Buffer.from(JSON.stringify({ power: 1250 })),
      { retain: false },
    );

    await adapter.disconnect();
    const values = await collectPromise;
    expect(values).toHaveLength(0);
  });

  it('createZigbee2MQTTAdapterFromEnv returns null without broker URL', () => {
    expect(createZigbee2MQTTAdapterFromEnv({})).toBeNull();
    expect(
      createZigbee2MQTTAdapterFromEnv({ Z2M_BROKER_URL: 'mqtt://localhost:1883' }),
    ).not.toBeNull();
  });

  it('rejects non-finite SET_EV_POWER values', async () => {
    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: Number.NaN });
    expect(result.success).toBe(false);
    expect(result.error).toContain('finite');
  });
});
