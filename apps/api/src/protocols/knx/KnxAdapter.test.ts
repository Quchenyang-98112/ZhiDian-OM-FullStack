/**
 * KnxAdapter unit tests — mock WebSocket bridge, no real KNX network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWsHolder = vi.hoisted(() => ({
  current: null as {
    readyState: number;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    removeAllListeners: ReturnType<typeof vi.fn>;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    once: (event: string, cb: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
  } | null,
}));

vi.mock('ws', () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  class MockWebSocket {
    static readonly OPEN = 1;
    static readonly CONNECTING = 0;
    static readonly CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close');
    });
    removeAllListeners = vi.fn(() => {
      listeners.clear();
    });

    constructor(_url: string) {
      mockWsHolder.current = this;
      setTimeout(() => {
        this.readyState = MockWebSocket.OPEN;
        this.emit('open');
      }, 0);
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

import { KnxAdapter, type KnxAdapterConfig } from '../knx/KnxAdapter.js';

const testConfig: KnxAdapterConfig = {
  id: 'test-knx-01',
  wsUrl: 'ws://192.168.1.101:3671',
  mappings: [
    {
      deviceId: 'knx-living',
      ga: '3/1/0',
      metric: 'TEMPERATURE_C',
      role: 'heatpump',
    },
    {
      deviceId: 'knx-meter',
      ga: '6/0/1',
      metric: 'POWER_W',
      role: 'load',
    },
  ],
};

describe('KnxAdapter', () => {
  let adapter: KnxAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    adapter = new KnxAdapter(testConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect().catch(() => {
      /* ignore */
    });
  });

  it('has correct id and protocol', () => {
    expect(adapter.id).toBe('test-knx-01');
    expect(adapter.protocol).toBe('knx');
  });

  it('reports healthy after connect', async () => {
    const health = await adapter.healthCheck();
    expect(health.status).toBe('healthy');
  });

  it('sends READ requests for configured group addresses on connect', () => {
    const ws = mockWsHolder.current;
    expect(ws?.send).toHaveBeenCalledWith(JSON.stringify({ type: 'READ', ga: '3/1/0' }));
    expect(ws?.send).toHaveBeenCalledWith(JSON.stringify({ type: 'READ', ga: '6/0/1' }));
  });

  it('yields temperature datapoint from matching telegram', async () => {
    const stream = adapter.getDataStream();
    const dpPromise = stream.next();

    mockWsHolder.current?.emit(
      'message',
      JSON.stringify({ ga: '3/1/0', dpt: 'DPT9.001', value: 21.5 }),
    );

    const result = await dpPromise;
    await adapter.disconnect();

    expect(result.done).toBe(false);
    expect(result.value?.metric).toBe('TEMPERATURE_C');
    expect(result.value?.value).toBe(21.5);
    expect(result.value?.deviceId).toBe('knx-living');
    expect(result.value?.role).toBe('heatpump');
  });

  it('yields power datapoint with role load', async () => {
    const stream = adapter.getDataStream();
    const dpPromise = stream.next();

    mockWsHolder.current?.emit('message', JSON.stringify({ ga: '6/0/1', value: 1250 }));

    const result = await dpPromise;
    await adapter.disconnect();

    expect(result.value?.metric).toBe('POWER_W');
    expect(result.value?.value).toBe(1250);
    expect(result.value?.role).toBe('load');
  });

  it('ignores telegrams for unmapped group addresses', async () => {
    const stream = adapter.getDataStream();
    let yielded = false;

    const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 50));
    const dpPromise = stream.next().then(() => {
      yielded = true;
    });

    mockWsHolder.current?.emit('message', JSON.stringify({ ga: '9/9/9', value: 42 }));

    await timeoutPromise;
    await adapter.disconnect();
    void dpPromise;

    expect(yielded).toBe(false);
  });

  it('converts boolean telegram values to 0/1', async () => {
    const boolAdapter = new KnxAdapter({
      id: 'test-knx-bool',
      wsUrl: 'ws://localhost:1',
      mappings: [{ deviceId: 'knx-switch', ga: '1/1/0', metric: 'POWER_W' }],
    });
    await boolAdapter.connect();

    const stream = boolAdapter.getDataStream();
    const dpPromise = stream.next();
    mockWsHolder.current?.emit('message', JSON.stringify({ ga: '1/1/0', value: true }));

    const result = await dpPromise;
    await boolAdapter.disconnect();

    expect(result.value?.value).toBe(1);
  });
});
