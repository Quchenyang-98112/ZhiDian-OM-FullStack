import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveHomeAssistantSettings } from '../core/homeassistant-settings-save';
import { FIXTURE_MQTT_AUTH } from './fixtures/credential-fixtures';

const mockUpdateSettings = vi.fn();
const mockReconfigureAdapter = vi.fn();
const mockAddContribAdapter = vi.fn().mockReturnValue(true);
const mockAttachAdapterEntry = vi.fn();
const mockLoadContrib = vi.fn().mockResolvedValue(true);
const mockSaveCreds = vi.fn().mockResolvedValue(undefined);
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockCanConnect = vi.fn().mockReturnValue(true);

vi.mock('../lib/adapter-mode', () => ({
  canConnectHardwareAdapter: (...args: unknown[]) => mockCanConnect(...args),
}));

vi.mock('../store', () => ({
  useAppStore: {
    getState: () => ({ updateSettings: mockUpdateSettings }),
  },
}));

vi.mock('../lib/secure-store', () => ({
  saveAdapterCredentials: (...args: unknown[]) => mockSaveCreds(...args),
}));

vi.mock('../core/adapters/adapter-registry', () => ({
  loadContribAdapter: (...args: unknown[]) => mockLoadContrib(...args),
}));

vi.mock('../core/useEnergyStore', () => ({
  useEnergyStoreBase: {
    getState: () => ({
      adapters: { 'homeassistant-mqtt': { adapter: { connect: mockConnect } } },
      addContribAdapter: mockAddContribAdapter,
      reconfigureAdapter: mockReconfigureAdapter,
    }),
  },
  attachAdapterEntry: (...args: unknown[]) => mockAttachAdapterEntry(...args),
}));

describe('saveHomeAssistantSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadContrib.mockResolvedValue(true);
    mockAddContribAdapter.mockReturnValue(true);
    mockCanConnect.mockReturnValue(true);
  });

  it('rejects ha-ws-api without token', async () => {
    const result = await saveHomeAssistantSettings({
      enabled: false,
      haMode: 'ha-ws-api',
      haBaseUrl: 'http://192.168.1.10:8123',
      haToken: '',
      mqttHost: '',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: true,
    });
    expect(result.ok).toBe(false);
    expect(mockLoadContrib).not.toHaveBeenCalled();
  });

  it('rejects invalid ha-ws-api base URL', async () => {
    const result = await saveHomeAssistantSettings({
      enabled: false,
      haMode: 'ha-ws-api',
      haBaseUrl: '',
      haToken: 'token',
      mqttHost: '',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: true,
    });
    expect(result.ok).toBe(false);
  });

  it('persists ha-ws-api config and loads contrib adapter', async () => {
    const result = await saveHomeAssistantSettings({
      enabled: true,
      haMode: 'ha-ws-api',
      haBaseUrl: 'http://192.168.1.10:8123',
      haToken: 'long-lived-token',
      mqttHost: '',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: true,
    });
    expect(result.ok).toBe(true);
    expect(mockLoadContrib).toHaveBeenCalledWith('homeassistant-mqtt');
    expect(mockSaveCreds).toHaveBeenCalled();
    expect(mockReconfigureAdapter).toHaveBeenCalled();
    expect(mockAttachAdapterEntry).toHaveBeenCalledWith('homeassistant-mqtt');
    expect(mockConnect).toHaveBeenCalled();
    expect(mockUpdateSettings).toHaveBeenCalledWith({ mqttAutoDiscovery: true });
  });

  it('validates mqtt broker host', async () => {
    const result = await saveHomeAssistantSettings({
      enabled: false,
      haMode: 'mqtt-broker',
      haBaseUrl: '',
      haToken: '',
      mqttHost: '',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: false,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid mqtt port', async () => {
    const result = await saveHomeAssistantSettings({
      enabled: false,
      haMode: 'mqtt-broker',
      haBaseUrl: '',
      haToken: '',
      mqttHost: 'broker.local',
      mqttPort: 0,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: false,
    });
    expect(result.ok).toBe(false);
  });

  it('persists mqtt-broker mode', async () => {
    const result = await saveHomeAssistantSettings({
      enabled: true,
      haMode: 'mqtt-broker',
      haBaseUrl: '',
      haToken: '',
      mqttHost: '192.168.1.20',
      mqttPort: 1883,
      mqttUser: 'mqtt',
      mqttBrokerAuth: FIXTURE_MQTT_AUTH,
      mqttAutoDiscovery: false,
    });
    expect(result.ok).toBe(true);
    expect(mockReconfigureAdapter).toHaveBeenCalledWith(
      'homeassistant-mqtt',
      expect.objectContaining({ haMode: 'mqtt-broker', host: '192.168.1.20' }),
      true,
    );
  });

  it('fails when contrib adapter cannot be loaded', async () => {
    mockLoadContrib.mockResolvedValue(false);
    const result = await saveHomeAssistantSettings({
      enabled: true,
      haMode: 'ha-ws-api',
      haBaseUrl: 'http://192.168.1.10:8123',
      haToken: 'token',
      mqttHost: '',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: true,
    });
    expect(result.ok).toBe(false);
  });

  it('parses https Home Assistant URLs', async () => {
    const result = await saveHomeAssistantSettings({
      enabled: false,
      haMode: 'ha-ws-api',
      haBaseUrl: 'https://ha.example.com:8123',
      haToken: 'token',
      mqttHost: '',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: true,
    });
    expect(result.ok).toBe(true);
    expect(mockReconfigureAdapter).toHaveBeenCalledWith(
      'homeassistant-mqtt',
      expect.objectContaining({ tls: true, host: 'ha.example.com', port: 8123 }),
      false,
    );
  });

  it('fails when contrib adapter cannot be registered', async () => {
    mockAddContribAdapter.mockReturnValue(false);
    const { useEnergyStoreBase } = await import('../core/useEnergyStore');
    vi.spyOn(useEnergyStoreBase, 'getState').mockReturnValue({
      adapters: {},
      addContribAdapter: mockAddContribAdapter,
      reconfigureAdapter: mockReconfigureAdapter,
    } as never);

    const result = await saveHomeAssistantSettings({
      enabled: true,
      haMode: 'mqtt-broker',
      haBaseUrl: '',
      haToken: '',
      mqttHost: '192.168.1.20',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: false,
    });
    expect(result.ok).toBe(false);
  });

  it('skips connect when live hardware is disabled', async () => {
    mockCanConnect.mockReturnValue(false);

    const result = await saveHomeAssistantSettings({
      enabled: true,
      haMode: 'ha-ws-api',
      haBaseUrl: 'http://192.168.1.10:8123',
      haToken: 'token',
      mqttHost: '',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: true,
    });
    expect(result.ok).toBe(true);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('parses https Home Assistant URLs', async () => {
    const result = await saveHomeAssistantSettings({
      enabled: false,
      haMode: 'ha-ws-api',
      haBaseUrl: 'https://ha.example.com',
      haToken: 'token',
      mqttHost: '',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: true,
    });
    expect(result.ok).toBe(true);
    expect(mockReconfigureAdapter).toHaveBeenCalledWith(
      'homeassistant-mqtt',
      expect.objectContaining({ tls: true, host: 'ha.example.com', port: 443 }),
      false,
    );
  });

  it('parses wss Home Assistant URLs', async () => {
    const result = await saveHomeAssistantSettings({
      enabled: false,
      haMode: 'ha-ws-api',
      haBaseUrl: 'wss://ha.example.com:8123',
      haToken: 'token',
      mqttHost: '',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: true,
    });
    expect(result.ok).toBe(true);
    expect(mockReconfigureAdapter).toHaveBeenCalledWith(
      'homeassistant-mqtt',
      expect.objectContaining({ tls: true, port: 8123 }),
      false,
    );
  });

  it('stores mqtt credentials when provided', async () => {
    const result = await saveHomeAssistantSettings({
      enabled: false,
      haMode: 'mqtt-broker',
      haBaseUrl: '',
      haToken: '',
      mqttHost: 'broker.local',
      mqttPort: 1883,
      mqttUser: 'user',
      mqttBrokerAuth: FIXTURE_MQTT_AUTH,
      mqttAutoDiscovery: true,
    });
    expect(result.ok).toBe(true);
    expect(mockSaveCreds).toHaveBeenCalled();
  });

  it('rejects mqtt hosts with invalid characters', async () => {
    const result = await saveHomeAssistantSettings({
      enabled: false,
      haMode: 'mqtt-broker',
      haBaseUrl: '',
      haToken: '',
      mqttHost: 'bad host',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: false,
    });
    expect(result.ok).toBe(false);
  });

  it('registers adapter when missing from store', async () => {
    const { useEnergyStoreBase } = await import('../core/useEnergyStore');
    vi.spyOn(useEnergyStoreBase, 'getState').mockReturnValue({
      adapters: {},
      addContribAdapter: mockAddContribAdapter,
      reconfigureAdapter: mockReconfigureAdapter,
    } as never);

    const result = await saveHomeAssistantSettings({
      enabled: true,
      haMode: 'mqtt-broker',
      haBaseUrl: '',
      haToken: '',
      mqttHost: '192.168.1.20',
      mqttPort: 1883,
      mqttUser: '',
      mqttBrokerAuth: '',
      mqttAutoDiscovery: false,
    });
    expect(result.ok).toBe(true);
    expect(mockAddContribAdapter).toHaveBeenCalled();
  });
});
