import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket, WebSocketServer } from 'ws';
import { isReadOnlyMode } from '../config/read-only-mode.js';
import type { AuthenticatedClient } from '../middleware/auth.js';
import {
  checkScopeAuthorization,
  checkWsRateLimit,
  filterMockData,
  handleSubscribeCommand,
  handleWsCommand,
  sanitizeOutgoingWsPayload,
  validateWSCommand,
} from '../ws/energy.ws.js';

vi.mock('../protocols/ProtocolCommandRouter.js', () => ({
  dispatchProtocolCommand: vi.fn(),
}));

import { dispatchProtocolCommand } from '../protocols/ProtocolCommandRouter.js';

describe('validateWSCommand', () => {
  it('accepts a valid hardware command', () => {
    const result = validateWSCommand({ type: 'SET_GRID_LIMIT', value: 4200 });
    expect(result.valid).toBe(true);
  });

  it('rejects SET_EV_CURRENT above 80 A', () => {
    const result = validateWSCommand({ type: 'SET_EV_CURRENT', value: 81 });
    expect(result.valid).toBe(false);
  });

  it('rejects SET_HEAT_PUMP_MODE outside SG Ready 1–4', () => {
    const result = validateWSCommand({ type: 'SET_HEAT_PUMP_MODE', value: 0 });
    expect(result.valid).toBe(false);
  });

  it('rejects fractional SET_HEAT_PUMP_MODE', () => {
    const result = validateWSCommand({ type: 'SET_HEAT_PUMP_MODE', value: 2.5 });
    expect(result.valid).toBe(false);
  });

  it('rejects KNX_SET_TEMPERATURE outside 5–35 °C', () => {
    const result = validateWSCommand({ type: 'KNX_SET_TEMPERATURE', value: 2 });
    expect(result.valid).toBe(false);
  });

  it('rejects non-boolean KNX_TOGGLE_LIGHTS', () => {
    const result = validateWSCommand({ type: 'KNX_TOGGLE_LIGHTS', value: 'on' });
    expect(result.valid).toBe(false);
  });

  it('rejects SET_EV_POWER above 22 kW', () => {
    const result = validateWSCommand({ type: 'SET_EV_POWER', value: 22_001 });
    expect(result.valid).toBe(false);
  });

  it('rejects NaN SET_BATTERY_POWER and KNX_SET_TEMPERATURE', () => {
    expect(validateWSCommand({ type: 'SET_BATTERY_POWER', value: Number.NaN }).valid).toBe(false);
    expect(validateWSCommand({ type: 'KNX_SET_TEMPERATURE', value: Number.NaN }).valid).toBe(false);
  });

  it('rejects commands with invalid shape', () => {
    const result = validateWSCommand({ type: 123, value: 'nope' });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('filterMockData', () => {
  it('returns only subscribed metric keys', () => {
    const data = { pvPower: 100, batteryPower: -50, gridPower: 10, houseLoad: 80 };
    const filtered = filterMockData(data, new Set(['pvPower', 'gridPower']));
    expect(filtered).toEqual({ pvPower: 100, gridPower: 10 });
  });

  it('ignores keys not present in the payload', () => {
    const filtered = filterMockData({ pvPower: 1 }, new Set(['pvPower', 'evPower']));
    expect(filtered).toEqual({ pvPower: 1 });
  });
});

describe('sanitizeOutgoingWsPayload', () => {
  it('masks PII inside outbound websocket payloads', () => {
    const sanitized = sanitizeOutgoingWsPayload({
      type: 'ERROR',
      error: 'Reach admin@example.com at 192.168.1.42',
      data: {
        label: 'Room owner@example.com',
      },
    }) as {
      error: string;
      data: { label: string };
    };

    expect(sanitized.error).toContain('[EMAIL]');
    expect(sanitized.error).toContain('[IP]');
    expect(sanitized.error).not.toContain('admin@example.com');
    expect(sanitized.data.label).toContain('[EMAIL]');
  });
});

describe('checkWsRateLimit', () => {
  const originalWsRateLimit = process.env.WS_RATE_LIMIT;

  afterEach(() => {
    if (originalWsRateLimit === undefined) delete process.env.WS_RATE_LIMIT;
    else process.env.WS_RATE_LIMIT = originalWsRateLimit;
  });

  it('returns true up to the limit and false afterwards', () => {
    process.env.WS_RATE_LIMIT = '2';
    const ws = {} as WebSocket;
    const limits = new WeakMap<WebSocket, { count: number; resetAt: number }>();

    // First two calls are within the limit
    expect(checkWsRateLimit(ws, limits)).toBe(true);
    expect(checkWsRateLimit(ws, limits)).toBe(true);
    // Third call exceeds the limit
    expect(checkWsRateLimit(ws, limits)).toBe(false);
    // Subsequent calls stay blocked in the same window
    expect(checkWsRateLimit(ws, limits)).toBe(false);
  });

  it('resets the counter after the window expires', () => {
    process.env.WS_RATE_LIMIT = '1';
    const ws = {} as WebSocket;
    const limits = new WeakMap<WebSocket, { count: number; resetAt: number }>();

    expect(checkWsRateLimit(ws, limits)).toBe(true);
    expect(checkWsRateLimit(ws, limits)).toBe(false);

    // Simulate an expired window by moving resetAt to the past
    const entry = limits.get(ws);
    expect(entry).toBeDefined();
    if (entry) {
      entry.resetAt = Date.now() - 1;
    }

    // A new window should start and allow one more command
    expect(checkWsRateLimit(ws, limits)).toBe(true);
  });
});

describe('handleSubscribeCommand', () => {
  function mockWs(): WebSocket & { sent: unknown[] } {
    return {
      sent: [],
      send(payload: string) {
        this.sent.push(JSON.parse(payload));
      },
    } as WebSocket & { sent: unknown[] };
  }

  it('acks valid metric subscriptions', () => {
    const ws = mockWs();
    const subs = new WeakMap<WebSocket, Set<string>>();
    const ok = handleSubscribeCommand(
      ws,
      { type: 'SUBSCRIBE', metrics: ['pvPower', 'gridPower'] },
      subs,
    );
    expect(ok).toBe(true);
    expect(subs.get(ws)?.has('pvPower')).toBe(true);
    expect(ws.sent[0]).toEqual({
      type: 'SUBSCRIBE_ACK',
      metrics: ['pvPower', 'gridPower'],
    });
  });

  it('rejects invalid subscribe payloads', () => {
    const ws = mockWs();
    const subs = new WeakMap<WebSocket, Set<string>>();
    expect(handleSubscribeCommand(ws, { type: 'SUBSCRIBE', metrics: [1, 2] }, subs)).toBe(false);
    expect(handleSubscribeCommand(ws, { type: 'OTHER' }, subs)).toBe(false);
  });
});

describe('checkScopeAuthorization', () => {
  function mockWs(): WebSocket & { sent: unknown[] } {
    return {
      sent: [],
      send(payload: string) {
        this.sent.push(JSON.parse(payload));
      },
    } as WebSocket & { sent: unknown[] };
  }

  it('rejects read scope for readwrite hardware commands', () => {
    const ws = mockWs();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    auth.set(ws, { clientId: 'reader', scope: 'read' });
    expect(checkScopeAuthorization(ws, 'SET_BATTERY_POWER', auth)).toBe(false);
    expect((ws.sent[0] as { error: string }).error).toMatch(/readwrite/i);
  });

  it('rejects readwrite scope for admin-only grid limit', () => {
    const ws = mockWs();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    auth.set(ws, { clientId: 'writer', scope: 'readwrite' });
    expect(checkScopeAuthorization(ws, 'SET_GRID_LIMIT', auth)).toBe(false);
    expect((ws.sent[0] as { error: string }).error).toMatch(/admin/i);
  });

  it('allows readwrite scope for hardware commands', () => {
    const ws = mockWs();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    auth.set(ws, { clientId: 'writer', scope: 'readwrite' });
    expect(checkScopeAuthorization(ws, 'SET_BATTERY_POWER', auth)).toBe(true);
    expect(ws.sent).toHaveLength(0);
  });

  it('allows admin scope for grid limit commands', () => {
    const ws = mockWs();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    auth.set(ws, { clientId: 'admin', scope: 'admin' });
    expect(checkScopeAuthorization(ws, 'SET_GRID_LIMIT', auth)).toBe(true);
  });
});

describe('handleWsCommand', () => {
  const originalReadOnly = process.env.READ_ONLY_MODE;
  const originalAdapterMode = process.env.ADAPTER_MODE;
  const originalAllowLive = process.env.ALLOW_LIVE_HARDWARE;
  const mockedDispatch = vi.mocked(dispatchProtocolCommand);

  function mockWs(): WebSocket & { sent: unknown[] } {
    return {
      sent: [],
      send(payload: string) {
        this.sent.push(JSON.parse(payload));
      },
    } as WebSocket & { sent: unknown[] };
  }

  afterEach(() => {
    if (originalReadOnly === undefined) delete process.env.READ_ONLY_MODE;
    else process.env.READ_ONLY_MODE = originalReadOnly;
    if (originalAdapterMode === undefined) delete process.env.ADAPTER_MODE;
    else process.env.ADAPTER_MODE = originalAdapterMode;
    if (originalAllowLive === undefined) delete process.env.ALLOW_LIVE_HARDWARE;
    else process.env.ALLOW_LIVE_HARDWARE = originalAllowLive;
    mockedDispatch.mockReset();
  });

  it('routes invalid commands to SUBSCRIBE handler when applicable', async () => {
    const ws = mockWs();
    const subs = new WeakMap<WebSocket, Set<string>>();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    const wss = { clients: new Set<WebSocket>() } as WebSocketServer;

    await handleWsCommand(ws, { type: 'SUBSCRIBE', metrics: ['pvPower'] }, subs, auth, wss);
    expect(subs.get(ws)?.has('pvPower')).toBe(true);
  });

  it('blocks hardware commands when READ_ONLY_MODE is active', async () => {
    process.env.READ_ONLY_MODE = 'true';
    const ws = mockWs();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    auth.set(ws, { clientId: 'writer', scope: 'readwrite' });
    const wss = { clients: new Set<WebSocket>() } as WebSocketServer;

    await handleWsCommand(ws, { type: 'SET_EV_POWER', value: 1500 }, new WeakMap(), auth, wss);
    expect((ws.sent[0] as { type: string }).type).toBe('ERROR');
  });

  it('applies SET_BATTERY_POWER and broadcasts ENERGY_UPDATE', async () => {
    delete process.env.READ_ONLY_MODE;
    const ws = mockWs();
    const peer = mockWs();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    auth.set(ws, { clientId: 'writer', scope: 'readwrite' });
    const wss = { clients: new Set<WebSocket>([ws, peer]) } as WebSocketServer;
    Object.defineProperty(ws, 'readyState', { value: 1 });
    Object.defineProperty(peer, 'readyState', { value: 1 });

    await handleWsCommand(ws, { type: 'SET_BATTERY_POWER', value: -500 }, new WeakMap(), auth, wss);
    expect(peer.sent.some((msg) => (msg as { type: string }).type === 'ENERGY_UPDATE')).toBe(true);
  });

  it('skips duplicate mock mutation when idempotencyKey repeats', async () => {
    const { clearWsIdempotencyCacheForTests } = await import('../data/idempotency-cache.js');
    clearWsIdempotencyCacheForTests();
    delete process.env.READ_ONLY_MODE;
    const { mockData } = await import('../data/mock-data.js');
    mockData.evPower = 0;

    const ws = mockWs();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    auth.set(ws, { clientId: 'writer', scope: 'readwrite' });
    const wss = { clients: new Set<WebSocket>() } as WebSocketServer;

    const cmd = { type: 'SET_EV_POWER', value: 3000, idempotencyKey: 'ws-dup-1' };
    await handleWsCommand(ws, cmd, new WeakMap(), auth, wss);
    expect(mockData.evPower).toBe(3000);

    await handleWsCommand(ws, { ...cmd, value: 9000 }, new WeakMap(), auth, wss);
    expect(mockData.evPower).toBe(3000);
  });

  it('dispatches EV commands to live protocol adapters in live mode', async () => {
    delete process.env.READ_ONLY_MODE;
    process.env.ADAPTER_MODE = 'live';
    process.env.ALLOW_LIVE_HARDWARE = 'true';
    mockedDispatch.mockResolvedValue({ handled: true, success: true, adapterId: 'ocpp-csms-01' });

    const ws = mockWs();
    const peer = mockWs();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    auth.set(ws, { clientId: 'writer', scope: 'readwrite' });
    const wss = { clients: new Set<WebSocket>([ws, peer]) } as WebSocketServer;
    Object.defineProperty(ws, 'readyState', { value: 1 });
    Object.defineProperty(peer, 'readyState', { value: 1 });

    await handleWsCommand(ws, { type: 'SET_EV_POWER', value: 7200 }, new WeakMap(), auth, wss);

    await vi.waitFor(() => {
      expect(mockedDispatch).toHaveBeenCalledWith({ type: 'SET_EV_POWER', value: 7200 });
    });
    await vi.waitFor(() => {
      expect(peer.sent.some((msg) => (msg as { type: string }).type === 'ENERGY_UPDATE')).toBe(
        true,
      );
    });
  });

  it('returns ERROR in live mode when no adapter handles the command', async () => {
    delete process.env.READ_ONLY_MODE;
    process.env.ADAPTER_MODE = 'live';
    process.env.ALLOW_LIVE_HARDWARE = 'true';
    mockedDispatch.mockResolvedValue({ handled: false, success: false });

    const ws = mockWs();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    auth.set(ws, { clientId: 'writer', scope: 'readwrite' });
    const wss = { clients: new Set<WebSocket>() } as WebSocketServer;

    await handleWsCommand(ws, { type: 'SET_EV_POWER', value: 7200 }, new WeakMap(), auth, wss);

    await vi.waitFor(() => {
      expect((ws.sent[0] as { error: string }).error).toContain('No live adapter');
    });
  });

  it('records rejected_dispatch outcome when protocol dispatch fails', async () => {
    delete process.env.READ_ONLY_MODE;
    process.env.ADAPTER_MODE = 'live';
    process.env.ALLOW_LIVE_HARDWARE = 'true';
    mockedDispatch.mockResolvedValue({
      handled: true,
      success: false,
      error: 'No charge point connected',
    });

    const ws = mockWs();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    auth.set(ws, { clientId: 'writer', scope: 'readwrite' });
    const wss = { clients: new Set<WebSocket>() } as WebSocketServer;

    await handleWsCommand(ws, { type: 'START_CHARGING', value: true }, new WeakMap(), auth, wss);

    await vi.waitFor(() => {
      expect((ws.sent[0] as { error: string }).error).toContain('No charge point');
    });
  });

  it('applies mock EV and heat-pump mutations in mock mode', async () => {
    delete process.env.READ_ONLY_MODE;
    delete process.env.ADAPTER_MODE;

    const ws = mockWs();
    const peer = mockWs();
    const auth = new WeakMap<WebSocket, AuthenticatedClient>();
    auth.set(ws, { clientId: 'writer', scope: 'readwrite' });
    const wss = { clients: new Set<WebSocket>([ws, peer]) } as WebSocketServer;
    Object.defineProperty(peer, 'readyState', { value: 1 });

    await handleWsCommand(ws, { type: 'SET_EV_POWER', value: 4200 }, new WeakMap(), auth, wss);
    await handleWsCommand(
      ws,
      { type: 'SET_HEAT_PUMP_POWER', value: 900 },
      new WeakMap(),
      auth,
      wss,
    );

    expect(peer.sent.some((msg) => (msg as { type: string }).type === 'ENERGY_UPDATE')).toBe(true);
  });
});

describe('isReadOnlyMode', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.READ_ONLY_MODE = originalEnv.READ_ONLY_MODE;
  });

  it('returns false when READ_ONLY_MODE is not set', () => {
    delete process.env.READ_ONLY_MODE;
    expect(isReadOnlyMode()).toBe(false);
  });

  it('returns true when READ_ONLY_MODE=true', () => {
    process.env.READ_ONLY_MODE = 'true';
    expect(isReadOnlyMode()).toBe(true);
  });

  it('returns false when READ_ONLY_MODE=false', () => {
    process.env.READ_ONLY_MODE = 'false';
    expect(isReadOnlyMode()).toBe(false);
  });
});
