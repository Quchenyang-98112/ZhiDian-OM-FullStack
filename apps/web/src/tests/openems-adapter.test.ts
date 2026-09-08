import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenEMSAdapter } from '../core/adapters/OpenEMSAdapter';

let mockInstance: MockWebSocket | null = null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static constructorUrl = '';
  readyState: number = WebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(url: string) {
    MockWebSocket.constructorUrl = url;
    mockInstance = this;
  }
}

function lastSentRpc(): { id: string; method: string; params: Record<string, unknown> } {
  const raw = mockInstance!.send.mock.calls.at(-1)?.[0];
  return JSON.parse(String(raw));
}

function replyRpc(
  id: string,
  result?: Record<string, unknown>,
  error?: { code: number; message: string },
): void {
  mockInstance!.onmessage?.({
    data: JSON.stringify({
      jsonrpc: '2.0',
      id,
      ...(error ? { error } : { result: result ?? {} }),
    }),
  });
}

describe('OpenEMSAdapter — interface', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('has id openems and expected capabilities', () => {
    const adapter = new OpenEMSAdapter();
    expect(adapter.id).toBe('openems');
    expect(adapter.capabilities).toEqual(
      expect.arrayContaining(['pv', 'battery', 'grid', 'load', 'evCharger']),
    );
    adapter.destroy();
  });
});

describe('OpenEMSAdapter — connect failure (ADR-024 non-throwing)', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('sets status error when WebSocket errors', async () => {
    const adapter = new OpenEMSAdapter({ host: 'openems.local', port: 8085 });
    let connectError: string | undefined;
    adapter.onStatus((status, error) => {
      if (status === 'error') connectError = error;
    });

    const p = adapter.connect();
    expect(MockWebSocket.constructorUrl).toBe('ws://openems.local:8085/websocket');
    mockInstance!.onerror?.({});
    await p;

    expect(adapter.status).toBe('error');
    expect(connectError).toMatch(/WebSocket error/i);
    adapter.destroy();
  });

  it('sets status error when authentication RPC fails', async () => {
    const adapter = new OpenEMSAdapter({ host: 'openems.local', port: 8085 });
    let connectError: string | undefined;
    adapter.onStatus((status, error) => {
      if (status === 'error') connectError = error;
    });

    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await vi.waitFor(() => expect(mockInstance!.send).toHaveBeenCalled());
    const { id } = lastSentRpc();
    replyRpc(id, undefined, { code: -32000, message: 'Invalid password' });
    await p;

    expect(adapter.status).toBe('error');
    expect(connectError).toMatch(/Invalid password/i);
    adapter.destroy();
  });
});

describe('OpenEMSAdapter — successful connect', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  async function completeOpenEMSHandshake(): Promise<void> {
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    for (let i = 0; i < 3; i++) {
      await vi.waitFor(() => expect(mockInstance!.send.mock.calls.length).toBeGreaterThan(i));
      const { id, method } = lastSentRpc();
      if (method === 'authenticateWithPassword') {
        replyRpc(id, { token: 'session-token' });
      } else if (method === 'getEdgeConfig') {
        replyRpc(id, {
          components: {
            evcs0: {
              factoryId: 'Evcs.Alpitronic',
              alias: 'EVCS',
              properties: {},
              channels: {},
            },
          },
        });
      } else if (method === 'subscribeChannels') {
        replyRpc(id, {});
      }
    }
  }

  it('authenticates, discovers components, and reaches connected', async () => {
    const adapter = new OpenEMSAdapter({ host: 'openems.local', port: 8085 });
    const p = adapter.connect();
    await completeOpenEMSHandshake();
    await p;
    expect(adapter.status).toBe('connected');
    expect(adapter.getComponents().length).toBeGreaterThan(0);
    adapter.destroy();
  });
});

describe('OpenEMSAdapter — additionalWritableProperties (LOW-02)', () => {
  it('accepts per-component extra writable property names in config', () => {
    const adapter = new OpenEMSAdapter({
      host: 'openems.local',
      additionalWritableProperties: {
        customController0: ['targetPower', 'enable'],
      },
    });
    expect(adapter.id).toBe('openems');
    expect(
      (
        adapter as unknown as {
          config?: { additionalWritableProperties?: Record<string, string[]> };
        }
      ).config?.additionalWritableProperties?.customController0,
    ).toEqual(['targetPower', 'enable']);
  });
});
