/**
 * HomeAssistantMqttProtocolAdapter unit tests — mock mqtt client.
 */

import EventEmitter from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockMqttClient extends EventEmitter {
  connected = true;
  publish = vi.fn(
    (_topic: string, _payload: string, _opts: unknown, cb?: (err: Error | null) => void) => {
      cb?.(null);
      return this;
    },
  );
  subscribe = vi.fn((_topic: string, _opts: unknown, cb?: (err: Error | null) => void) => {
    cb?.(null);
    return this;
  });
  end = vi.fn((_force: boolean, _opts: unknown, cb?: () => void) => {
    this.connected = false;
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

vi.mock('../../middleware/adapter-metrics.js', () => ({
  recordAdapterDlq: vi.fn(),
  recordAdapterError: vi.fn(),
  recordAdapterReconnect: vi.fn(),
}));

import { recordAdapterError } from '../../middleware/adapter-metrics.js';
import {
  createHomeAssistantMqttAdapterFromEnv,
  HomeAssistantMqttProtocolAdapter,
  type HomeAssistantMqttProtocolAdapterConfig,
} from './HomeAssistantMqttProtocolAdapter.js';

const testConfig: HomeAssistantMqttProtocolAdapterConfig = {
  id: 'test-ha-mqtt-01',
  brokerUrl: 'mqtt://localhost:1883',
  topicPrefix: 'homeassistant',
  deviceId: 'ha-home',
  entityMappings: [{ entityId: 'sensor.solar_power', metric: 'POWER_W', role: 'pv' }],
};

describe('HomeAssistantMqttProtocolAdapter', () => {
  let adapter: HomeAssistantMqttProtocolAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    adapter = new HomeAssistantMqttProtocolAdapter(testConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect().catch(() => {
      /* ignore */
    });
  });

  it('has correct id and protocol', () => {
    expect(adapter.id).toBe('test-ha-mqtt-01');
    expect(adapter.protocol).toBe('homeassistant-mqtt');
  });

  it('yields datapoints from static entity state topics', async () => {
    const stream = adapter.getDataStream();
    const nextPromise = stream.next();

    mockClientInstance.emit(
      'message',
      'homeassistant/sensor/solar_power/state',
      Buffer.from('4200'),
    );

    const result = await nextPromise;
    await adapter.disconnect();

    expect(result.value).toMatchObject({
      protocol: 'homeassistant-mqtt',
      metric: 'POWER_W',
      role: 'pv',
      value: 4200,
      deviceId: 'ha-home:sensor.solar_power',
    });
  });

  it('discovers entities from MQTT discovery config payloads', async () => {
    const stream = adapter.getDataStream();
    const nextPromise = stream.next();

    mockClientInstance.emit(
      'message',
      'homeassistant/sensor/grid_power/config',
      Buffer.from(
        JSON.stringify({
          unique_id: 'sensor.grid_power',
          state_topic: 'homeassistant/sensor/grid_power/state',
          device_class: 'grid_power',
          unit_of_measurement: 'W',
        }),
      ),
    );

    mockClientInstance.emit(
      'message',
      'homeassistant/sensor/grid_power/state',
      Buffer.from('1500'),
    );

    const result = await nextPromise;
    await adapter.disconnect();

    expect(result.value?.role).toBe('grid');
    expect(result.value?.value).toBe(1500);
  });

  it('createHomeAssistantMqttAdapterFromEnv returns null without broker URL', () => {
    expect(createHomeAssistantMqttAdapterFromEnv({})).toBeNull();
    expect(
      createHomeAssistantMqttAdapterFromEnv({ HA_MQTT_BROKER_URL: 'mqtt://localhost:1883' }),
    ).not.toBeNull();
  });

  it('tracks repeated MQTT client errors after connect', async () => {
    mockClientInstance.emit('error', new Error('broker hiccup'));
    mockClientInstance.emit('error', new Error('broker hiccup again'));

    expect(recordAdapterError).toHaveBeenCalledTimes(2);
    const health = await adapter.healthCheck();
    expect(health.consecutiveErrors).toBe(2);
  });

  it('publishes MQTT service call for START_CHARGING when entities configured', async () => {
    const cmdAdapter = new HomeAssistantMqttProtocolAdapter({
      ...testConfig,
      wallboxSwitchEntityId: 'switch.wallbox_charging',
    });
    await cmdAdapter.connect();

    const result = await cmdAdapter.sendCommand({ type: 'START_CHARGING', value: true });
    expect(result).toEqual({ handled: true, success: true, adapterId: 'test-ha-mqtt-01' });
    expect(mockClientInstance.publish).toHaveBeenCalledWith(
      'homeassistant/switch/turn_on',
      JSON.stringify({ entity_id: 'switch.wallbox_charging' }),
      { qos: 1 },
      expect.any(Function),
    );

    await cmdAdapter.disconnect();
  });

  it('returns configuration error when wallbox entities are missing', async () => {
    const result = await adapter.sendCommand({ type: 'SET_EV_CURRENT', value: 16 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('HA_WALLBOX_CURRENT_ENTITY');
  });

  it('returns handled:false for unsupported command types', async () => {
    const result = await adapter.sendCommand({ type: 'SET_BATTERY_POWER', value: 1000 });
    expect(result).toEqual({ handled: false, success: false });
  });

  it('reports not connected when MQTT client is down', async () => {
    await adapter.disconnect();
    const result = await adapter.sendCommand({ type: 'START_CHARGING', value: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('publishes STOP_CHARGING and SET_EV_POWER when entities are configured', async () => {
    const cmdAdapter = new HomeAssistantMqttProtocolAdapter({
      ...testConfig,
      wallboxSwitchEntityId: 'switch.wallbox_charging',
      wallboxCurrentEntityId: 'number.wallbox_max_current',
    });
    await cmdAdapter.connect();

    await cmdAdapter.sendCommand({ type: 'STOP_CHARGING', value: false });
    await cmdAdapter.sendCommand({ type: 'SET_EV_POWER', value: 6900 });

    expect(mockClientInstance.publish).toHaveBeenCalledWith(
      'homeassistant/switch/turn_off',
      JSON.stringify({ entity_id: 'switch.wallbox_charging' }),
      { qos: 1 },
      expect.any(Function),
    );
    expect(mockClientInstance.publish).toHaveBeenCalledWith(
      'homeassistant/number/set_value',
      JSON.stringify({ entity_id: 'number.wallbox_max_current', value: 30 }),
      { qos: 1 },
      expect.any(Function),
    );

    await cmdAdapter.disconnect();
  });

  it('publishes SET_HEAT_PUMP_MODE when SG Ready number entity is configured', async () => {
    const cmdAdapter = new HomeAssistantMqttProtocolAdapter({
      ...testConfig,
      heatPumpModeEntityId: 'number.heat_pump_sg_ready',
    });
    await cmdAdapter.connect();

    const result = await cmdAdapter.sendCommand({ type: 'SET_HEAT_PUMP_MODE', value: 2 });
    expect(result.success).toBe(true);
    expect(mockClientInstance.publish).toHaveBeenCalledWith(
      'homeassistant/number/set_value',
      JSON.stringify({ entity_id: 'number.heat_pump_sg_ready', value: 2 }),
      { qos: 1 },
      expect.any(Function),
    );

    await cmdAdapter.disconnect();
  });

  it('returns publish error when MQTT broker rejects the service call', async () => {
    const failingClient = new MockMqttClient();
    failingClient.publish = vi.fn(
      (_topic: string, _payload: string, _opts: unknown, cb?: (err: Error | null) => void) => {
        cb?.(new Error('publish denied'));
        return failingClient;
      },
    );

    const mqtt = await import('mqtt');
    vi.mocked(mqtt.default.connect).mockImplementationOnce(() => {
      setTimeout(() => failingClient.emit('connect'), 0);
      return failingClient as unknown as ReturnType<typeof mqtt.default.connect>;
    });

    const cmdAdapter = new HomeAssistantMqttProtocolAdapter({
      ...testConfig,
      wallboxSwitchEntityId: 'switch.wallbox_charging',
    });
    await cmdAdapter.connect();

    const result = await cmdAdapter.sendCommand({ type: 'START_CHARGING', value: true });
    expect(result.success).toBe(false);
    expect(result.error).toBe('publish denied');

    await cmdAdapter.disconnect();
  });

  it('rejects SET_HEAT_PUMP_MODE via adapter when climate entity is configured', async () => {
    const cmdAdapter = new HomeAssistantMqttProtocolAdapter({
      ...testConfig,
      heatPumpModeEntityId: 'climate.heat_pump',
    });
    await cmdAdapter.connect();

    const result = await cmdAdapter.sendCommand({ type: 'SET_HEAT_PUMP_MODE', value: 2 });
    expect(result).toMatchObject({
      handled: true,
      success: false,
      error: expect.stringContaining('full domain.entity_id'),
    });
    expect(mockClientInstance.publish).not.toHaveBeenCalled();

    await cmdAdapter.disconnect();
  });

  it('rejects SET_HEAT_PUMP_MODE via adapter for bare domain without object_id', async () => {
    const cmdAdapter = new HomeAssistantMqttProtocolAdapter({
      ...testConfig,
      heatPumpModeEntityId: 'number',
    });
    await cmdAdapter.connect();

    const result = await cmdAdapter.sendCommand({ type: 'SET_HEAT_PUMP_MODE', value: 2 });
    expect(result).toMatchObject({
      handled: true,
      success: false,
      error: expect.stringContaining('full domain.entity_id'),
    });
    expect(mockClientInstance.publish).not.toHaveBeenCalled();

    await cmdAdapter.disconnect();
  });

  it('createHomeAssistantMqttAdapterFromEnv ignores invalid heat pump entity domain', async () => {
    const adapter = createHomeAssistantMqttAdapterFromEnv({
      HA_MQTT_BROKER_URL: 'mqtt://localhost:1883',
      HA_HEAT_PUMP_MODE_ENTITY: 'climate.heat_pump',
    });
    expect(adapter).not.toBeNull();
    expect(adapter?.supportsCommand('SET_HEAT_PUMP_MODE')).toBe(true);

    await adapter!.connect();
    const result = await adapter!.sendCommand({ type: 'SET_HEAT_PUMP_MODE', value: 2 });
    expect(result).toMatchObject({
      handled: true,
      success: false,
      error: 'HA_HEAT_PUMP_MODE_ENTITY not configured',
    });
    expect(mockClientInstance.publish).not.toHaveBeenCalled();
    await adapter!.disconnect();
  });

  it('createHomeAssistantMqttAdapterFromEnv passes wallbox and heat-pump env vars', () => {
    const adapter = createHomeAssistantMqttAdapterFromEnv({
      HA_MQTT_BROKER_URL: 'mqtt://localhost:1883',
      HA_WALLBOX_CURRENT_ENTITY: 'number.ev_amps',
      HA_WALLBOX_SWITCH_ENTITY: 'switch.ev_charge',
      HA_HEAT_PUMP_MODE_ENTITY: 'number.hp_sg_ready',
      HA_WALLBOX_MAINS_VOLTAGE: '400',
    });
    expect(adapter).not.toBeNull();
    expect(adapter?.supportsCommand('SET_EV_POWER')).toBe(true);
  });

  it('createHomeAssistantMqttAdapterFromEnv ignores invalid mains voltage and defaults to 230', async () => {
    const adapter = createHomeAssistantMqttAdapterFromEnv({
      HA_MQTT_BROKER_URL: 'mqtt://localhost:1883',
      HA_WALLBOX_CURRENT_ENTITY: 'number.ev_amps',
      HA_WALLBOX_MAINS_VOLTAGE: 'not-a-number',
    });
    expect(adapter).not.toBeNull();
    await adapter!.connect();

    const result = await adapter!.sendCommand({ type: 'SET_EV_POWER', value: 6900 });
    expect(result.success).toBe(true);
    expect(mockClientInstance.publish).toHaveBeenCalledWith(
      'homeassistant/number/set_value',
      JSON.stringify({ entity_id: 'number.ev_amps', value: 30 }),
      { qos: 1 },
      expect.any(Function),
    );

    await adapter!.disconnect();
  });
});
