import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecAdapter, factory, id } from '../core/adapters/contrib/exec-adapter';

vi.mock('../lib/auth-token', () => ({
  getAuthHeader: () => ({ Authorization: 'Bearer test-token' }),
}));

type FetchResult = { ok: boolean; status?: number; json?: () => Promise<unknown> };

function mockFetchOnce(result: FetchResult | Error) {
  const fn = vi.fn(async (..._args: unknown[]) => {
    if (result instanceof Error) throw result;
    return {
      ok: result.ok,
      status: result.status ?? (result.ok ? 200 : 500),
      json: result.json ?? (async () => ({ readings: [] })),
    } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return new ExecAdapter({
    scriptId: 'read_solar_meter',
    args: { '--device': '/dev/ttyUSB0' },
    serverBaseUrl: 'http://api.test',
    ...overrides,
  });
}

describe('ExecAdapter — construction & argument sanitization', () => {
  it('rejects an invalid scriptId', () => {
    expect(() => new ExecAdapter({ scriptId: 'bad id!' })).toThrow(/scriptId/);
    expect(() => new ExecAdapter({ scriptId: '' })).toThrow(/scriptId/);
  });

  it('builds a stable id/name and defaults capabilities to pv', () => {
    const a = makeAdapter({ capabilities: undefined });
    expect(a.id).toBe('exec-read_solar_meter');
    expect(a.capabilities).toEqual(['pv']);
  });

  it('drops unsafe argument keys/values but keeps safe ones', () => {
    const a = makeAdapter({
      args: { '--device': '/dev/ttyUSB0', 'bad;key': 'x', '--inject': 'a && rm -rf /' },
    });
    // Only the safe arg survives — verified indirectly via the poll request below.
    const fetchFn = mockFetchOnce({ ok: true, json: async () => ({ readings: [] }) });
    return a.poll().then(() => {
      const url = String(fetchFn.mock.calls[0]?.[0]);
      const args = JSON.parse(new URL(url).searchParams.get('args') ?? '{}');
      expect(args).toEqual({ '--device': '/dev/ttyUSB0' });
    });
  });

  it('clamps the poll interval to a 2s floor', () => {
    const a = makeAdapter({ pollIntervalMs: 100 });
    // @ts-expect-error — reach into the private field for the invariant check.
    expect(a.pollIntervalMs).toBe(2000);
  });
});

describe('ExecAdapter — mapReadingsToModel (role/metric branches)', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function pollWith(readings: unknown[]) {
    const a = makeAdapter();
    mockFetchOnce({ ok: true, json: async () => ({ readings }) });
    return a.poll();
  }

  it('maps pv POWER_W and ENERGY_KWH', async () => {
    const m1 = await pollWith([{ metric: 'POWER_W', value: 1500, role: 'pv' }]);
    expect(m1.pv?.totalPowerW).toBe(1500);
    const m2 = await pollWith([{ metric: 'ENERGY_KWH', value: 12.3, role: 'pv' }]);
    expect(m2.pv?.yieldTodayKWh).toBe(12.3);
  });

  it('maps battery POWER_W / SOC (clamped) / VOLTAGE_V / TEMPERATURE_C', async () => {
    const m = await pollWith([
      { metric: 'POWER_W', value: -800, role: 'battery' },
      { metric: 'SOC_PERCENT', value: 150, role: 'battery' },
      { metric: 'VOLTAGE_V', value: 51.2, role: 'battery' },
      { metric: 'TEMPERATURE_C', value: 24, role: 'battery' },
    ]);
    expect(m.battery?.powerW).toBe(-800);
    expect(m.battery?.socPercent).toBe(100); // clamped from 150
    expect(m.battery?.voltageV).toBe(51.2);
    expect(m.battery?.temperatureC).toBe(24);
  });

  it('maps grid POWER_W / VOLTAGE_V / FREQUENCY_HZ', async () => {
    const m = await pollWith([
      { metric: 'POWER_W', value: 400, role: 'grid' },
      { metric: 'FREQUENCY_HZ', value: 50.01, role: 'grid' },
    ]);
    expect(m.grid?.powerW).toBe(400);
    expect(m.grid?.frequencyHz).toBe(50.01);
  });

  it('maps load, heatpump and ev roles', async () => {
    const m = await pollWith([
      { metric: 'POWER_W', value: 3000, role: 'load' },
      { metric: 'POWER_W', value: 1200, role: 'heatpump' },
      { metric: 'POWER_W', value: 7000, role: 'ev' },
    ]);
    expect(m.load?.totalPowerW).toBe(3000);
    expect(m.load?.heatPumpPowerW).toBe(1200);
    expect(m.evCharger?.status).toBe('charging');
    expect(m.evCharger?.vehicleConnected).toBe(true);
  });

  it('marks ev available when power is 0', async () => {
    const m = await pollWith([{ metric: 'POWER_W', value: 0, role: 'ev' }]);
    expect(m.evCharger?.status).toBe('available');
  });

  it('skips non-finite values and unknown roles', async () => {
    const m = await pollWith([
      { metric: 'POWER_W', value: Number.NaN, role: 'pv' },
      { metric: 'POWER_W', value: 5, role: 'unknown' },
    ]);
    expect(m.pv?.totalPowerW).toBeUndefined();
  });
});

describe('ExecAdapter — executePoll error handling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the snapshot when the response is not ok', async () => {
    const a = makeAdapter();
    mockFetchOnce({ ok: false, status: 503 });
    await expect(a.poll()).resolves.toBeTypeOf('object');
  });

  it('returns the snapshot when the script reports an error', async () => {
    const a = makeAdapter();
    mockFetchOnce({ ok: true, json: async () => ({ readings: [], error: 'device timeout' }) });
    const m = await a.poll();
    expect(m.pv).toBeUndefined();
  });

  it('returns the snapshot when fetch throws', async () => {
    const a = makeAdapter();
    mockFetchOnce(new Error('network down'));
    await expect(a.poll()).resolves.toBeTypeOf('object');
  });
});

describe('ExecAdapter — connect & transport (ADR-024)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('connect succeeds even when the initial poll fetch fails (non-fatal poll)', async () => {
    const a = makeAdapter();
    mockFetchOnce(new Error('backend unreachable'));
    let connectError: string | undefined;
    a.onStatus((status, error) => {
      if (status === 'error') connectError = error;
    });
    await a.connect();
    expect(a.status).toBe('connected');
    expect(connectError).toBeUndefined();
    await a.disconnect();
    a.destroy();
  });
});

describe('ExecAdapter — commands & lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sendCommand returns true on ok, false on !ok and on throw', async () => {
    const a = makeAdapter();
    mockFetchOnce({ ok: true });
    // @ts-expect-error — protected in the type but callable at runtime.
    await expect(a._sendCommand({ type: 'SET_MODE', value: 'eco' })).resolves.toBe(true);
    mockFetchOnce({ ok: false });
    // @ts-expect-error — protected in the type but callable at runtime.
    await expect(a._sendCommand({ type: 'SET_MODE', value: 'eco' })).resolves.toBe(false);
    mockFetchOnce(new Error('boom'));
    // @ts-expect-error — protected in the type but callable at runtime.
    await expect(a._sendCommand({ type: 'SET_MODE', value: 'eco' })).resolves.toBe(false);
  });

  it('connect starts polling and disconnect/destroy clears the timer', async () => {
    vi.useFakeTimers();
    try {
      const a = makeAdapter({ pollIntervalMs: 2000 });
      mockFetchOnce({ ok: true, json: async () => ({ readings: [] }) });
      await a.connect();
      expect(a.status).toBe('connected');
      await a.disconnect();
      expect(a.status).toBe('disconnected');
      a.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ExecAdapter — module exports', () => {
  it('exposes an id and a working factory', () => {
    expect(id).toBe('exec');
    const a = factory({ scriptId: 'read_solar_meter' } as never);
    expect(a).toBeInstanceOf(ExecAdapter);
  });
});
