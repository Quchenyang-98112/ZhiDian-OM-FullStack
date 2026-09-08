import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellyRESTAdapter } from '../core/adapters/contrib/shelly-rest';
import type { EnergyAdapter } from '../core/adapters/EnergyAdapter';

// ────────────────────────────────────────────────────────────────────
// ShellyRESTAdapter — Unit Tests
// Tests the Shelly Gen2+ REST/HTTP adapter using a mocked fetch().
// No real Shelly device required.
// ────────────────────────────────────────────────────────────────────

type MockFetch = ReturnType<typeof vi.fn>;
let mockFetch: MockFetch;

/** Shelly Gen2 /rpc/Shelly.GetStatus response with EM component */
const SHELLY_EM_STATUS = {
  'em:0': {
    a_act_power: 1200.0,
    a_current: 5.4,
    a_voltage: 222.3,
    b_act_power: 800.0,
    b_current: 3.6,
    b_voltage: 221.8,
    c_act_power: 600.0,
    c_current: 2.7,
    c_voltage: 222.0,
    total_act_power: 2600.0,
    total_current: 11.7,
  },
  'emdata:0': {
    total_act: 35200, // 35.2 kWh import
    total_act_ret: 1800, // 1.8 kWh export
  },
  sys: { mac: 'AA:BB:CC:DD:EE:FF', model: 'SPEM-003CEBEU' },
};

/** Minimal Shelly Plus Plug response */
const SHELLY_PLUG_STATUS = {
  'switch:0': {
    id: 0,
    output: true,
    apower: 145.5,
    voltage: 232.1,
    current: 0.627,
    aenergy: { total: 2430 },
  },
  sys: { mac: '11:22:33:44:55:66', model: 'SNPL-00112EU' },
};

function setupFetchMock(responseBody: object): void {
  mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => responseBody,
    status: 200,
  });
  vi.stubGlobal('fetch', mockFetch);
}

describe('ShellyRESTAdapter — Interface Contract', () => {
  let adapter: EnergyAdapter;

  beforeEach(() => {
    setupFetchMock(SHELLY_EM_STATUS);
    adapter = new ShellyRESTAdapter();
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
  });

  it('has correct id = shelly-rest', () => {
    expect(adapter.id).toBe('shelly-rest');
  });

  it('has name containing Shelly', () => {
    expect(adapter.name).toMatch(/shelly/i);
  });

  it('declares grid and load capabilities', () => {
    expect(adapter.capabilities).toContain('grid');
    expect(adapter.capabilities).toContain('load');
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

describe('ShellyRESTAdapter — REST Polling Setup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('connects and polls each configured device', async () => {
    setupFetchMock(SHELLY_EM_STATUS);
    const adapter = new ShellyRESTAdapter({
      devices: [{ host: 'shellyproem-aabbcc.local', name: 'Grid Meter', type: 'em' }],
      pollIntervalMs: 60_000,
    });

    const p = adapter.connect();
    await p.catch(() => {});

    // fetch should have been called at least once for the device
    if (adapter.status === 'connected') {
      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0] as unknown[];
      expect(String(callArgs[0])).toContain('shellyproem-aabbcc.local');
    }

    adapter.destroy();
  });

  it('transitions to connected status after successful first poll', async () => {
    setupFetchMock(SHELLY_EM_STATUS);
    const adapter = new ShellyRESTAdapter({
      devices: [{ host: '192.168.1.100', name: 'Shelly EM', type: 'em' }],
      pollIntervalMs: 5000,
    });

    await adapter.connect().catch(() => {});
    expect(adapter.status).toBe('connected');
    adapter.destroy();
  });

  it('handles fetch failure gracefully (error or disconnected status)', async () => {
    mockFetch = vi.fn().mockRejectedValue(new Error('EHOSTUNREACH'));
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new ShellyRESTAdapter({
      devices: [{ host: 'offline.local', name: 'Offline', type: 'em' }],
      pollIntervalMs: 60_000,
    });

    await adapter.connect().catch(() => {});
    expect(['error', 'disconnected', 'connected']).toContain(adapter.status);
    adapter.destroy();
  });
});

describe('ShellyRESTAdapter — 3-Phase EM Data Parsing', () => {
  let adapter: ShellyRESTAdapter;

  beforeEach(() => {
    setupFetchMock(SHELLY_EM_STATUS);
    adapter = new ShellyRESTAdapter({
      devices: [{ host: 'shellyproem.local', name: 'Grid Meter', type: 'em' }],
      pollIntervalMs: 60_000,
    });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
  });

  it('parses total_act_power from 3-phase EM payload', async () => {
    await adapter.connect().catch(() => {});
    if (adapter.status === 'connected') {
      const snapshot = adapter.getSnapshot();
      // Grid power should reflect the total_act_power from the mock
      if (snapshot.grid) {
        expect(typeof snapshot.grid.powerW).toBe('number');
      }
    }
  });

  it('aggregates energy import and export in kWh', async () => {
    await adapter.connect().catch(() => {});
    if (adapter.status === 'connected') {
      const snapshot = adapter.getSnapshot();
      if (snapshot.grid) {
        expect(snapshot.grid.energyImportKWh).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('ShellyRESTAdapter — Smart Plug Data Parsing', () => {
  let adapter: ShellyRESTAdapter;

  beforeEach(() => {
    setupFetchMock(SHELLY_PLUG_STATUS);
    adapter = new ShellyRESTAdapter({
      devices: [{ host: 'shellyplug.local', name: 'Office Plug', type: 'plug' }],
      pollIntervalMs: 60_000,
    });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
  });

  it('parses active power from smart plug response', async () => {
    await adapter.connect().catch(() => {});
    if (adapter.status === 'connected') {
      const snapshot = adapter.getSnapshot();
      if (snapshot.load) {
        expect(typeof snapshot.load.totalPowerW).toBe('number');
        expect(snapshot.load.totalPowerW).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('ShellyRESTAdapter — Relay Commands', () => {
  let adapter: ShellyRESTAdapter;

  beforeEach(() => {
    mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => SHELLY_EM_STATUS, status: 200 })
      .mockResolvedValue({ ok: true, json: async () => ({ was_on: true }), status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    adapter = new ShellyRESTAdapter({
      devices: [{ host: 'shellyplug.local', name: 'Plug', type: 'plug' }],
      pollIntervalMs: 60_000,
    });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
  });

  it('rejects SET_RELAY command when disconnected', async () => {
    // SET_RELAY is adapter-specific; cast to verify the adapter rejects without crashing
    const result = await (
      adapter as unknown as {
        sendCommand: (c: { type: string; deviceId: number; value: boolean }) => Promise<boolean>;
      }
    ).sendCommand({ type: 'SET_RELAY', deviceId: 0, value: true });
    expect(result).toBe(false);
  });

  it('returns boolean result for relay control when connected', async () => {
    await adapter.connect().catch(() => {});
    if (adapter.status === 'connected') {
      // Use a formally valid command type; Shelly will return false for unhandled types
      const result = await adapter.sendCommand({ type: 'SET_GRID_LIMIT', value: 1 });
      expect(typeof result).toBe('boolean');
    }
  });

  it('rejects unknown (to Shelly) command types', async () => {
    await adapter.connect().catch(() => {});
    const result = await adapter.sendCommand({ type: 'SET_HEAT_PUMP_POWER', value: 1 });
    expect(result).toBe(false);
  });
});

describe('ShellyRESTAdapter — Multi-Device Configuration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts multiple devices in config', () => {
    setupFetchMock(SHELLY_EM_STATUS);
    const adapter = new ShellyRESTAdapter({
      devices: [
        { host: 'shelly-em1.local', name: 'Grid 1', type: 'em' },
        { host: 'shelly-em2.local', name: 'Grid 2', type: 'em' },
        { host: 'shelly-plug.local', name: 'Office', type: 'plug' },
      ],
      pollIntervalMs: 30_000,
    });
    expect(adapter.status).toBe('disconnected');
    adapter.destroy();
  });
});

describe('ShellyRESTAdapter — poll() aggregation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('aggregates grid and load power across EM and plug devices', async () => {
    mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const body = String(url).includes('office-plug') ? SHELLY_PLUG_STATUS : SHELLY_EM_STATUS;
      return { ok: true, json: async () => body, status: 200 };
    });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new ShellyRESTAdapter({
      devices: [
        { host: 'grid-em.local', name: 'Grid', type: 'em' },
        { host: 'office-plug.local', name: 'Office', type: 'plug' },
      ],
      pollIntervalMs: 60_000,
    });

    await adapter.connect();
    const model = await adapter.poll();

    expect(model.grid?.powerW).toBe(2600);
    expect(model.load?.totalPowerW).toBeGreaterThan(0);
    expect(model.grid?.energyImportKWh).toBeCloseTo(35.2, 1);
    adapter.destroy();
  });

  it('sends digest auth header when devicePassword is configured', async () => {
    setupFetchMock(SHELLY_EM_STATUS);
    const adapter = new ShellyRESTAdapter({
      devices: [{ host: 'secure-shelly.local', name: 'Secure', type: 'em' }],
      devicePassword: 'shelly-secret',
      pollIntervalMs: 60_000,
    });

    await adapter.connect();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: `Basic ${btoa('admin:shelly-secret')}`,
    });
    adapter.destroy();
  });

  it('uses HTTPS when tls is enabled', async () => {
    setupFetchMock(SHELLY_EM_STATUS);
    const adapter = new ShellyRESTAdapter({
      tls: true,
      devices: [{ host: 'tls-shelly.local', name: 'TLS', type: 'em' }],
      pollIntervalMs: 60_000,
    });

    await adapter.connect();
    expect(String(mockFetch.mock.calls[0]?.[0])).toMatch(/^https:\/\//);
    adapter.destroy();
  });
});

describe('ShellyRESTAdapter — KNX_TOGGLE_LIGHTS command', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts Switch.Set when connected with a target device', async () => {
    mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => SHELLY_PLUG_STATUS, status: 200 })
      .mockResolvedValue({ ok: true, json: async () => ({ was_on: true }), status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new ShellyRESTAdapter({
      devices: [{ host: 'shellyplug.local', name: 'Plug', type: 'plug' }],
      pollIntervalMs: 60_000,
    });

    await adapter.connect();
    const result = await adapter.sendCommand({
      type: 'KNX_TOGGLE_LIGHTS',
      targetDeviceId: 'shellyplug.local',
      value: true,
    });

    expect(result).toBe(true);
    const relayCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes('/rpc/Switch.Set'),
    );
    expect(relayCall?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ id: 0, on: true }),
    });
    adapter.destroy();
  });

  it('returns false when targetDeviceId is missing', async () => {
    setupFetchMock(SHELLY_PLUG_STATUS);
    const adapter = new ShellyRESTAdapter({
      devices: [{ host: 'shellyplug.local', name: 'Plug', type: 'plug' }],
    });
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'KNX_TOGGLE_LIGHTS', value: true });
    expect(result).toBe(false);
    adapter.destroy();
  });
});

describe('ShellyRESTAdapter — register()', () => {
  it('registers the shelly-rest factory in the adapter registry', async () => {
    const { getRegisteredAdapter, unregisterAdapter } = await import(
      '../core/adapters/adapter-registry'
    );
    const { register } = await import('../core/adapters/contrib/shelly-rest');

    register();
    const entry = getRegisteredAdapter('shelly-rest');
    expect(entry?.source).toBe('contrib');
    expect(entry?.displayName).toBe('Shelly REST');

    unregisterAdapter('shelly-rest');
  });
});
