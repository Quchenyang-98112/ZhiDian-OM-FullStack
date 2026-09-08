/**
 * Verifies HA MQTT command-handler registration in startProtocolAdapters (Phase 6).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus.js';
import { getProtocolCommandHandlerCount } from './ProtocolCommandRouter.js';

const mockConnect = vi.fn();
const mockDisconnect = vi.fn().mockResolvedValue(undefined);

const mockHaMqttAdapter = {
  id: 'ha-mqtt-reg-test',
  protocol: 'homeassistant-mqtt' as const,
  connect: mockConnect,
  disconnect: mockDisconnect,
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
  async *getDataStream() {
    for (const _item of [] as const) {
      yield _item;
    }
  },
  supportsCommand: () => true,
  sendCommand: async () => ({ handled: true, success: true, adapterId: 'ha-mqtt-reg-test' }),
};

vi.mock('../config/adapter-mode.js', () => ({
  getEffectiveAdapterMode: () => 'live',
  isLiveHardwareAllowed: () => true,
  logAdapterModeStartup: vi.fn(),
}));

vi.mock('./homeassistant/HomeAssistantMqttProtocolAdapter.js', () => ({
  createHomeAssistantMqttAdapterFromEnv: () => mockHaMqttAdapter,
}));

import { startProtocolAdapters, stopProtocolAdapters } from './index.js';

describe('startProtocolAdapters — HA MQTT command registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await stopProtocolAdapters();
  });

  it('registers HA MQTT adapter with ProtocolCommandRouter after connect succeeds', async () => {
    const bus = new EventBus();
    await startProtocolAdapters(bus);
    await vi.waitFor(() => {
      expect(getProtocolCommandHandlerCount()).toBe(1);
    });
    expect(mockConnect).toHaveBeenCalled();
  });

  it('unregisters HA MQTT adapter when connect fails', async () => {
    mockConnect.mockRejectedValueOnce(new Error('broker down'));
    const bus = new EventBus();
    await startProtocolAdapters(bus);
    await vi.waitFor(() => {
      expect(mockConnect).toHaveBeenCalled();
    });
    expect(getProtocolCommandHandlerCount()).toBe(0);
  });
});
