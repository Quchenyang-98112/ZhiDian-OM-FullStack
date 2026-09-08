import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type WorkerOutMessage =
  | { type: 'data'; adapterId: string; result: unknown }
  | { type: 'error'; adapterId: string; error: string }
  | { type: 'latency'; adapterId: string; ms: number };

describe('adapter-worker message handler', () => {
  const posted: WorkerOutMessage[] = [];
  let onmessage: ((event: MessageEvent) => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    posted.length = 0;
    onmessage = null;

    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('performance', { now: () => 0 });
    vi.stubGlobal('self', {
      postMessage: (msg: WorkerOutMessage) => posted.push(msg),
      location: { origin: 'http://localhost' },
      get onmessage() {
        return onmessage;
      },
      set onmessage(handler: ((event: MessageEvent) => void) | null) {
        onmessage = handler;
      },
    });

    await import('../core/adapter-worker');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function dispatch(data: unknown, origin = ''): void {
    if (!onmessage) throw new Error('adapter-worker onmessage handler not registered');
    onmessage({ data, origin } as MessageEvent);
  }

  it('transforms SunSpec inverter payloads off the main thread', () => {
    dispatch({
      type: 'transform',
      adapterId: 'modbus',
      rawData: JSON.stringify({ W: 100, W_SF: 1, WH: 5000, WH_SF: 0 }),
      format: 'sunspec-inverter',
    });

    expect(posted).toContainEqual({
      type: 'data',
      adapterId: 'modbus',
      result: expect.objectContaining({
        totalPowerW: 1000,
        yieldTodayKWh: 5,
      }),
    });
  });

  it('transforms SunSpec battery and meter payloads', () => {
    dispatch({
      type: 'transform',
      adapterId: 'battery',
      rawData: JSON.stringify({ W: -200, SoC: 80, W_SF: 0, SoC_SF: 0 }),
      format: 'sunspec-battery',
    });
    dispatch({
      type: 'transform',
      adapterId: 'meter',
      rawData: JSON.stringify({ W: 1500, W_SF: 0, TotWhImp: 12_000, TotWh_SF: -1 }),
      format: 'sunspec-meter',
    });

    expect(posted).toContainEqual({
      type: 'data',
      adapterId: 'battery',
      result: expect.objectContaining({ powerW: -200, socPercent: 80 }),
    });
    expect(posted).toContainEqual({
      type: 'data',
      adapterId: 'meter',
      result: expect.objectContaining({ powerW: 1500, energyImportKWh: 1.2 }),
    });
  });

  it('returns transform errors for malformed JSON', () => {
    dispatch({
      type: 'transform',
      adapterId: 'broken',
      rawData: '{ invalid json',
      format: 'json',
    });

    expect(posted.some((msg) => msg.type === 'error' && msg.adapterId === 'broken')).toBe(true);
  });

  it('blocks invalid poll targets before fetch', async () => {
    dispatch({
      type: 'poll',
      adapterId: 'unsafe',
      target: { protocol: 'https', host: '8.8.8.8', path: '/api' },
    });

    expect(posted).toContainEqual({
      type: 'error',
      adapterId: 'unsafe',
      error: 'Request blocked: invalid poll target',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('polls allowed targets and emits latency + data messages', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    } as Response);

    dispatch({
      type: 'poll',
      adapterId: 'modbus',
      target: { protocol: 'http', host: '192.168.1.50', path: '/api/modbus/sunspec' },
      headers: { Authorization: 'Bearer local-token', Host: 'evil.example' },
      intervalMs: 60_000,
    });

    await vi.waitFor(() => {
      expect(posted.some((msg) => msg.type === 'latency' && msg.adapterId === 'modbus')).toBe(true);
      expect(posted).toContainEqual({
        type: 'data',
        adapterId: 'modbus',
        result: { status: 'ok' },
      });
    });

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(String(fetchCall?.[0])).toBe('http://192.168.1.50/api/modbus/sunspec');
    expect(fetchCall?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer local-token' },
      redirect: 'error',
    });
  });

  it('polls SunSpec models and emits merged unified data', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('model=inverter')) {
        return {
          ok: true,
          json: async () => ({ W: 100, W_SF: 1, WH: 5000, WH_SF: 0 }),
        } as Response;
      }
      if (url.includes('model=battery')) {
        return {
          ok: true,
          json: async () => ({ W: -200, SoC: 80, W_SF: 0, SoC_SF: 0 }),
        } as Response;
      }
      if (url.includes('model=meter')) {
        return {
          ok: true,
          json: async () => ({ W: 1500, W_SF: 0, TotWhImp: 12_000, TotWh_SF: -1 }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    dispatch({
      type: 'sunspecPoll',
      adapterId: 'modbus-sunspec',
      target: { protocol: 'http', host: '192.168.1.50', path: '/api/modbus/sunspec' },
      intervalMs: 60_000,
    });

    await vi.waitFor(() => {
      expect(posted).toContainEqual({
        type: 'data',
        adapterId: 'modbus-sunspec',
        result: expect.objectContaining({
          pv: expect.objectContaining({ totalPowerW: 1000 }),
          battery: expect.objectContaining({ socPercent: 80 }),
          grid: expect.objectContaining({ energyImportKWh: 1.2 }),
        }),
      });
    });
  });

  it('clears all pollers on stopAll', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    dispatch({
      type: 'poll',
      adapterId: 'adapter-a',
      target: { protocol: 'http', host: '192.168.1.10', path: '/a' },
      intervalMs: 1000,
    });
    dispatch({
      type: 'poll',
      adapterId: 'adapter-b',
      target: { protocol: 'http', host: '192.168.1.11', path: '/b' },
      intervalMs: 1000,
    });

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    dispatch({ type: 'stopAll' });
    const callsAfterStop = vi.mocked(fetch).mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(callsAfterStop);
  });
});
