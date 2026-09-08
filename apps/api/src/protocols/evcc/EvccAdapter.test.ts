/**
 * EvccAdapter unit tests — mock fetch + WebSocket, no real evcc instance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const EVCC_STATE = {
  result: {
    gridPower: 500,
    pvPower: 3000,
    batteryPower: -1000,
    batterySoc: 75,
    homePower: 2500,
    loadpoints: [{ chargePower: 7000 }],
  },
};

const mockWsHolder = vi.hoisted(() => ({
  current: null as {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    once: (event: string, cb: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
    close: ReturnType<typeof vi.fn>;
    removeAllListeners: ReturnType<typeof vi.fn>;
  } | null,
}));

vi.mock('ws', () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  class MockWebSocket {
    static readonly OPEN = 1;
    close = vi.fn();
    removeAllListeners = vi.fn(() => listeners.clear());

    constructor(_url: string, _opts?: unknown) {
      mockWsHolder.current = this;
      setTimeout(() => this.emit('open'), 0);
    }

    on(event: string, cb: (...args: unknown[]) => void): void {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(cb);
    }

    once(event: string, cb: (...args: unknown[]) => void): void {
      const wrapper = (...args: unknown[]) => {
        listeners.get(event)?.delete(wrapper);
        cb(...args);
      };
      this.on(event, wrapper);
    }

    emit(event: string, ...args: unknown[]): void {
      for (const cb of listeners.get(event) ?? []) {
        cb(...args);
      }
    }
  }

  return { WebSocket: MockWebSocket };
});

import { EvccAdapter, type EvccAdapterConfig } from '../evcc/EvccAdapter.js';

const testConfig: EvccAdapterConfig = {
  id: 'test-evcc-01',
  baseUrl: 'http://192.168.1.50:7070',
  pollIntervalMs: 60_000,
  deviceId: 'evcc-home',
};

function mockEvccFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith('/api/state')) {
        return new Response(JSON.stringify(EVCC_STATE), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

describe('EvccAdapter', () => {
  let adapter: EvccAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEvccFetch();
    adapter = new EvccAdapter(testConfig);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await adapter.disconnect().catch(() => {
      /* ignore */
    });
  });

  it('has correct id and protocol', () => {
    expect(adapter.id).toBe('test-evcc-01');
    expect(adapter.protocol).toBe('evcc');
  });

  it('reports healthy after connect', async () => {
    await adapter.connect();
    const health = await adapter.healthCheck();
    expect(health.status).toBe('healthy');
  });

  it('yields role-tagged datapoints from initial poll', async () => {
    const stream = adapter.getDataStream();
    const connectPromise = adapter.connect();
    const collected: string[] = [];

    for (let i = 0; i < 6; i++) {
      const next = await stream.next();
      if (next.done) break;
      collected.push(`${next.value?.role}:${next.value?.metric}:${next.value?.value}`);
    }

    await connectPromise;
    await adapter.disconnect();

    expect(collected).toContain('pv:POWER_W:3000');
    expect(collected).toContain('battery:POWER_W:-1000');
    expect(collected).toContain('battery:SOC_PERCENT:75');
    expect(collected).toContain('grid:POWER_W:500');
    expect(collected).toContain('load:POWER_W:2500');
    expect(collected).toContain('ev:POWER_W:7000');
  });

  it('yields datapoints from WebSocket push updates', async () => {
    const stream = adapter.getDataStream();
    await adapter.connect();
    // Drain initial poll batch
    for (let i = 0; i < 6; i++) {
      await stream.next();
    }

    const dpPromise = stream.next();
    mockWsHolder.current?.emit(
      'message',
      JSON.stringify({ result: { ...EVCC_STATE.result, pvPower: 4200 } }),
    );

    const result = await dpPromise;
    await adapter.disconnect();

    expect(result.value?.role).toBe('pv');
    expect(result.value?.value).toBe(4200);
  });

  it('uses configured deviceId on emitted datapoints', async () => {
    const stream = adapter.getDataStream();
    await adapter.connect();
    const next = await stream.next();
    await adapter.disconnect();
    expect(next.value?.deviceId).toBe('evcc-home');
  });
});
