import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAdapterPanelEntriesFromState,
  fetchAdapterPanelCredentials,
} from '../core/adapter-config-panel-hydrate';
import type { EnergyAdapter } from '../core/adapters/EnergyAdapter';
import { defaultSettings } from '../store';

vi.mock('../lib/secure-store', () => ({
  getAdapterCredentials: vi.fn(),
}));

import { getAdapterCredentials } from '../lib/secure-store';

const mockGetAdapterCredentials = vi.mocked(getAdapterCredentials);

const mockAdapter = (config: Record<string, unknown>): EnergyAdapter =>
  ({
    id: 'victron-mqtt',
    getConnectionConfig: () => ({
      name: 'Cerbo',
      host: config.host as string,
      port: config.port as number,
      tls: false,
      pollIntervalMs: 3000,
      ...config,
    }),
  }) as EnergyAdapter;

describe('buildAdapterPanelEntriesFromState', () => {
  it('hydrates a Victron entry from settings and registry config', () => {
    const entries = buildAdapterPanelEntriesFromState({
      settings: { ...defaultSettings, victronIp: '192.168.1.55', wsPort: 1883 },
      adapters: {
        'victron-mqtt': {
          enabled: true,
          adapter: mockAdapter({ host: '192.168.1.55', port: 1883, name: 'Cerbo GX' }),
        },
      },
      credentials: {},
      defaultName: (type) => `default-${type}`,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: 'victron',
      host: '192.168.1.55',
      port: 1883,
      enabled: true,
      name: 'Cerbo GX',
    });
  });

  it('skips adapters without host, credentials, or enablement', () => {
    const entries = buildAdapterPanelEntriesFromState({
      settings: defaultSettings,
      adapters: {
        'modbus-sunspec': {
          enabled: false,
          adapter: mockAdapter({ host: 'localhost', port: 502 }),
        },
      },
      credentials: {},
      defaultName: (type) => type,
    });

    expect(entries).toHaveLength(0);
  });
});

describe('fetchAdapterPanelCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only credential vault entries that exist', async () => {
    mockGetAdapterCredentials.mockImplementation(async (id) => {
      if (id === 'victron-mqtt') {
        return { authToken: 'token' };
      }
      return null;
    });

    await expect(fetchAdapterPanelCredentials()).resolves.toEqual({
      'victron-mqtt': { authToken: 'token' },
    });
    expect(mockGetAdapterCredentials).toHaveBeenCalled();
  });
});
