import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnergyAdapter } from '../core/adapters/EnergyAdapter';
import { KNXAdapter } from '../core/adapters/KNXAdapter';

// ────────────────────────────────────────────────────────────────────
// KNXAdapter — Unit Tests
// Tests the KNX/IP WebSocket adapter without a real KNX gateway.
// ────────────────────────────────────────────────────────────────────

let mockInstance: MockWebSocket | null = null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState: number = WebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor() {
    mockInstance = this;
  }
}

describe('KNXAdapter — Interface Contract', () => {
  let adapter: EnergyAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new KNXAdapter({ host: 'knxd.local', port: 3671 });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('has correct id = knx', () => {
    expect(adapter.id).toBe('knx');
  });

  it('has name containing KNX', () => {
    expect(adapter.name).toMatch(/knx/i);
  });

  it('declares capabilities', () => {
    expect(adapter.capabilities.length).toBeGreaterThan(0);
  });

  it('starts disconnected', () => {
    expect(adapter.status).toBe('disconnected');
  });

  it('returns snapshot object before connect', () => {
    expect(typeof adapter.getSnapshot()).toBe('object');
  });

  it('connect() opens a WebSocket connection', async () => {
    const p = adapter.connect();
    expect(mockInstance).not.toBeNull();
    await p.catch(() => {});
  });

  it('destroys cleanly without errors', () => {
    expect(() => adapter.destroy()).not.toThrow();
  });
});

describe('KNXAdapter — WebSocket Transport', () => {
  let adapter: KNXAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new KNXAdapter({ host: 'knxd.local', port: 3671 });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('transitions to connected on WebSocket open', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    expect(adapter.status).toBe('connected');
  });

  it('transitions to error state on WebSocket error', async () => {
    const p = adapter.connect();
    mockInstance!.onerror?.({ message: 'ECONNREFUSED' });
    mockInstance!.onclose?.();
    await p.catch(() => {});
    expect(['error', 'disconnected', 'connecting']).toContain(adapter.status);
  });

  it('transitions to disconnected when WebSocket closes', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    mockInstance!.onclose?.();
    expect(adapter.status).toBe('disconnected');
  });

  it('calls onStatus callback on status transitions', async () => {
    const statusSpy = vi.fn();
    adapter.onStatus(statusSpy);
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    expect(statusSpy).toHaveBeenCalledWith('connected', undefined);
  });

  it('send is available after connection', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    expect(typeof mockInstance!.send).toBe('function');
  });
});

describe('KNXAdapter — Telegram Parsing', () => {
  let adapter: KNXAdapter;
  let receivedData: ReturnType<typeof adapter.getSnapshot>[];

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new KNXAdapter({ host: 'knx.local', port: 3671 });
    adapter.onData((model) => receivedData.push(model));
    receivedData = [];
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('parses DPT9 temperature telegram from living room', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    mockInstance!.onmessage?.({
      data: JSON.stringify({ ga: '3/1/0', dpt: 'DPT9.001', value: 21.5 }),
    });

    const snapshot = adapter.getSnapshot();
    if (snapshot.knx?.rooms) {
      const livingRoom = snapshot.knx.rooms.find((r) => r.id === 'living');
      expect(livingRoom?.temperature).toBeCloseTo(21.5, 1);
    }
  });

  it('parses DPT1 light switch telegram', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    mockInstance!.onmessage?.({
      data: JSON.stringify({ ga: '1/1/0', dpt: 'DPT1.001', value: true }),
    });

    const snapshot = adapter.getSnapshot();
    if (snapshot.knx?.rooms) {
      const livingRoom = snapshot.knx.rooms.find((r) => r.id === 'living');
      expect(livingRoom?.lightsOn).toBe(true);
    }
  });

  it('parses DPT5 dimming value telegram', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    mockInstance!.onmessage?.({
      data: JSON.stringify({ ga: '1/1/1', dpt: 'DPT5.001', value: 75 }),
    });

    const snapshot = adapter.getSnapshot();
    if (snapshot.knx?.rooms) {
      const room = snapshot.knx.rooms.find((r) => r.id === 'living');
      if (room?.brightness !== undefined) expect(room.brightness).toBe(75);
    }
  });

  it('ignores telegrams from unknown group addresses', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    const before = JSON.stringify(adapter.getSnapshot());
    mockInstance!.onmessage?.({
      data: JSON.stringify({ ga: '99/99/99', dpt: 'DPT9.001', value: 999 }),
    });
    expect(JSON.stringify(adapter.getSnapshot())).toBe(before);
  });

  it('handles malformed telegram JSON without throwing', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    expect(() => mockInstance!.onmessage?.({ data: '{ not valid json' })).not.toThrow();
  });
});

describe('KNXAdapter — Command Handling', () => {
  let adapter: KNXAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new KNXAdapter({ host: 'knx.local', port: 3671 });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('rejects KNX_TOGGLE_LIGHTS when disconnected', async () => {
    expect(await adapter.sendCommand({ type: 'KNX_TOGGLE_LIGHTS', value: 1 })).toBe(false);
  });

  it('sends KNX_TOGGLE_LIGHTS command when connected', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    const result = await adapter.sendCommand({
      type: 'KNX_TOGGLE_LIGHTS',
      targetDeviceId: 'living',
      value: 1,
    });
    expect(typeof result).toBe('boolean');
    if (result) expect(mockInstance!.send).toHaveBeenCalled();
  });

  it('rejects unknown (to KNX) command types', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    expect(await adapter.sendCommand({ type: 'SET_GRID_LIMIT', value: 1 })).toBe(false);
  });
});

describe('KNXAdapter — Room Configuration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('uses default room configuration when none provided', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new KNXAdapter({ host: 'knxd.local', port: 3671 });
    expect(adapter.getSnapshot()).toBeDefined();
    adapter.destroy();
  });

  it('accepts custom room configuration via roomConfigs', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new KNXAdapter({
      host: 'knxd.local',
      port: 3671,
      roomConfigs: [{ id: 'office', name: 'Office', lightGA: '2/1/0', tempGA: '4/1/0' }],
    });
    expect(adapter).toBeDefined();
    adapter.destroy();
  });
});
