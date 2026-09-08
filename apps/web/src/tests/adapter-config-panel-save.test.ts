import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AdapterPanelSaveInput,
  panelTypeToRegistryId,
  saveAdapterPanelEntry,
  validateAdapterPanelEntry,
} from '../core/adapter-config-panel-save';

const mockUpdateSettings = vi.fn();
const mockReconfigureAdapter = vi.fn();
const mockAttachAdapterEntry = vi.fn();
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
  saveAdapterCredentials: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../core/useEnergyStore', () => ({
  useEnergyStoreBase: {
    getState: () => ({
      adapters: {
        'victron-mqtt': { adapter: { connect: mockConnect } },
        'modbus-sunspec': { adapter: { connect: mockConnect } },
        knx: { adapter: { connect: mockConnect } },
        'ocpp-21': { adapter: { connect: mockConnect } },
        eebus: { adapter: { connect: mockConnect } },
      },
      reconfigureAdapter: mockReconfigureAdapter,
    }),
  },
  attachAdapterEntry: (...args: unknown[]) => mockAttachAdapterEntry(...args),
}));

const validVictron: AdapterPanelSaveInput = {
  id: 'victron-1',
  type: 'victron',
  name: 'Cerbo GX',
  enabled: false,
  host: '192.168.1.10',
  port: 1880,
  tls: false,
  authToken: '',
  pollIntervalMs: 3000,
  gatewayType: 'cerbo-gx',
};

const PEM_CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const PEM_KEY = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----';

describe('panelTypeToRegistryId', () => {
  it('maps panel types to registry ids', () => {
    expect(panelTypeToRegistryId('modbus')).toBe('modbus-sunspec');
    expect(panelTypeToRegistryId('ocpp')).toBe('ocpp-21');
  });
});

describe('validateAdapterPanelEntry', () => {
  it('accepts a valid Victron entry', () => {
    expect(validateAdapterPanelEntry(validVictron)).toEqual({ ok: true });
  });

  it('accepts valid KNX config', () => {
    expect(
      validateAdapterPanelEntry({
        id: 'knx-1',
        type: 'knx',
        name: 'KNX',
        enabled: false,
        host: '192.168.1.40',
        port: 3671,
        tls: false,
        authToken: '',
        pollIntervalMs: 1000,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects empty host', () => {
    expect(validateAdapterPanelEntry({ ...validVictron, host: '' }).ok).toBe(false);
  });

  it('rejects invalid OCPP security profile', () => {
    expect(
      validateAdapterPanelEntry({
        id: 'ocpp-1',
        type: 'ocpp',
        name: 'EVSE',
        enabled: false,
        host: 'csms.example.com',
        port: 443,
        tls: true,
        authToken: 'secret',
        pollIntervalMs: 5000,
        securityProfile: 9 as 0,
        stationId: 'CP001',
      }).ok,
    ).toBe(false);
  });
});

describe('saveAdapterPanelEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanConnect.mockReturnValue(true);
  });

  it('persists Victron settings and reconfigures the registry slot', async () => {
    const result = await saveAdapterPanelEntry(validVictron);
    expect(result.ok).toBe(true);
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      victronIp: '192.168.1.10',
      wsPort: 1880,
      gatewayType: 'cerbo-gx',
    });
    expect(mockReconfigureAdapter).toHaveBeenCalledWith(
      'victron-mqtt',
      expect.objectContaining({ host: '192.168.1.10', port: 1880 }),
      false,
    );
    expect(mockAttachAdapterEntry).toHaveBeenCalledWith('victron-mqtt');
  });

  it('maps Venus GX gateway type to cerbo-gx-mk2', async () => {
    const result = await saveAdapterPanelEntry({ ...validVictron, gatewayType: 'venus-gx' });
    expect(result.ok).toBe(true);
    expect(mockReconfigureAdapter).toHaveBeenCalledWith(
      'victron-mqtt',
      expect.objectContaining({ gatewayType: 'cerbo-gx-mk2' }),
      false,
    );
  });

  it('maps Raspberry Pi gateway type', async () => {
    const result = await saveAdapterPanelEntry({ ...validVictron, gatewayType: 'rpi-victron' });
    expect(result.ok).toBe(true);
    expect(mockUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ gatewayType: 'raspberry-pi' }),
    );
  });

  it('persists KNX IP in settings', async () => {
    const result = await saveAdapterPanelEntry({
      id: 'knx-1',
      type: 'knx',
      name: 'KNX Router',
      enabled: false,
      host: '192.168.1.40',
      port: 3671,
      tls: false,
      authToken: '',
      pollIntervalMs: 1000,
    });
    expect(result.ok).toBe(true);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ knxIp: '192.168.1.40' });
  });

  it('persists Modbus adapter config', async () => {
    const result = await saveAdapterPanelEntry({
      id: 'modbus-1',
      type: 'modbus',
      name: 'Inverter',
      enabled: false,
      host: '192.168.1.55',
      port: 502,
      tls: false,
      authToken: '',
      pollIntervalMs: 2000,
    });
    expect(result.ok).toBe(true);
    expect(mockReconfigureAdapter).toHaveBeenCalledWith(
      'modbus-sunspec',
      expect.objectContaining({ host: '192.168.1.55' }),
      false,
    );
  });

  it('connects enabled OCPP adapters when live mode is allowed', async () => {
    const result = await saveAdapterPanelEntry({
      id: 'ocpp-1',
      type: 'ocpp',
      name: 'Wallbox',
      enabled: true,
      host: 'csms.example.com',
      port: 443,
      tls: true,
      authToken: 'secret',
      pollIntervalMs: 5000,
      securityProfile: 2,
      stationId: 'WB-01',
      iso15118: true,
    });
    expect(result.ok).toBe(true);
    expect(mockReconfigureAdapter).toHaveBeenCalledWith(
      'ocpp-21',
      expect.objectContaining({ iso15118: true }),
      true,
    );
    expect(mockConnect).toHaveBeenCalled();
  });

  it('saves EEBUS credentials when provided', async () => {
    const result = await saveAdapterPanelEntry({
      id: 'eebus-1',
      type: 'eebus',
      name: 'Heat pump',
      enabled: false,
      host: '192.168.1.50',
      port: 4712,
      tls: true,
      authToken: '',
      pollIntervalMs: 3000,
      skiFingerprint: 'a'.repeat(40),
      clientCert: PEM_CERT,
      clientKey: PEM_KEY,
    });
    expect(result.ok).toBe(true);
    expect(mockReconfigureAdapter).toHaveBeenCalledWith(
      'eebus',
      expect.objectContaining({ tls: true }),
      false,
    );
  });

  it('skips credential vault writes when no secrets are provided', async () => {
    const { saveAdapterCredentials } = await import('../lib/secure-store');
    vi.mocked(saveAdapterCredentials).mockClear();
    await saveAdapterPanelEntry(validVictron);
    expect(saveAdapterCredentials).not.toHaveBeenCalled();
  });

  it('persists auth tokens to the vault when provided', async () => {
    const { saveAdapterCredentials } = await import('../lib/secure-store');
    const result = await saveAdapterPanelEntry({
      ...validVictron,
      authToken: 'mqtt-secret',
    });
    expect(result.ok).toBe(true);
    expect(saveAdapterCredentials).toHaveBeenCalled();
  });

  it('returns validation errors without touching the registry', async () => {
    const result = await saveAdapterPanelEntry({ ...validVictron, host: '' });
    expect(result.ok).toBe(false);
    expect(mockReconfigureAdapter).not.toHaveBeenCalled();
  });

  it('skips connect when live hardware is disabled', async () => {
    mockCanConnect.mockReturnValue(false);

    const result = await saveAdapterPanelEntry({ ...validVictron, enabled: true });
    expect(result.ok).toBe(true);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('returns an error when registry slot is missing', async () => {
    const { useEnergyStoreBase } = await import('../core/useEnergyStore');
    vi.spyOn(useEnergyStoreBase, 'getState').mockReturnValue({
      adapters: {},
      reconfigureAdapter: mockReconfigureAdapter,
    } as never);

    const result = await saveAdapterPanelEntry(validVictron);
    expect(result.ok).toBe(false);
  });
});
