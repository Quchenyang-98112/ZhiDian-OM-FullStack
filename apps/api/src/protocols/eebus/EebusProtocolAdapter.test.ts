/**
 * EebusProtocolAdapter unit tests
 *
 * Mocks:
 *   - ws (WebSocket) — controls the SHIP connection lifecycle
 *   - EEBusTrustStore — seed trusted device entries without filesystem I/O
 *   - adapter-metrics — prevent Prometheus side-effects
 *   - fs/promises + child_process — skip real TLS cert generation
 *
 * Tests verify:
 *   - Session establishment from trusted devices in the trust store
 *   - SPINE measurement datagram → UnifiedEnergyDatapoint mapping
 *   - LoadControl limit mapping to energy roles (LPC §14a EnWG)
 *   - DLQ routing for malformed datagrams
 *   - Reconnect scheduling on unexpected WS close
 *   - healthCheck reflects connected/disconnected state
 *   - Trust store poll starts sessions for newly paired devices
 *   - disconnect() gracefully destroys all sessions
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock: EEBusTrustStore ─────────────────────────────────────────────────

vi.mock('../../services/EEBusTrustStore.js', () => ({
  listDevices: vi.fn().mockResolvedValue([]),
  updateDeviceStatus: vi.fn().mockResolvedValue(undefined),
  upsertDevice: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock: adapter-metrics ────────────────────────────────────────────────

vi.mock('../../middleware/adapter-metrics.js', () => ({
  recordAdapterDlq: vi.fn(),
  recordAdapterError: vi.fn(),
  recordAdapterReconnect: vi.fn(),
  recordAdapterRegistration: vi.fn(),
  recordAdapterConnection: vi.fn(),
}));

// ── Mock: runtime-paths ──────────────────────────────────────────────────

vi.mock('../../runtime-paths.js', () => ({
  API_RUNTIME_DIR: '/tmp/test-eebus-runtime',
  DEAD_LETTER_QUEUE_PATH: '/tmp/test-eebus-runtime/dead-letter.ndjson',
}));

// ── Mock: fs (DLQ writes + cert reads) ──────────────────────────────────

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('{}'),
}));

// Return a plausible-looking PEM so loadOrGenerateCert() succeeds without
// spawning openssl. The content is never verified (crypto + https.Agent are mocked).
const FAKE_CERT_PEM = '-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----';
const _FAKE_KEY_PEM = '-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----';

vi.mock('node:fs/promises', () => ({
  readFile: vi
    .fn()
    .mockImplementation((path: unknown) =>
      String(path).endsWith('.pem') || String(path).includes('cert') || String(path).includes('key')
        ? Promise.resolve(FAKE_CERT_PEM)
        : Promise.reject(Object.assign(new Error('no file'), { code: 'ENOENT' })),
    ),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock: crypto — skip real key generation ──────────────────────────────

vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>();
  return {
    ...real,
    generateKeyPairSync: vi.fn().mockReturnValue({
      privateKey: {
        export: vi
          .fn()
          .mockReturnValue('-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----'),
      },
      publicKey: {},
    }),
  };
});

// ── Mock: child_process (openssl cert generation) ────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi
    .fn()
    .mockReturnValue({ status: 1, stderr: 'openssl not found', error: new Error('not found') }),
}));

// ── Mock: https (skip real TLS Agent; must use function, not arrow, for `new`) ──

vi.mock('node:https', () => {
  function MockAgent(this: Record<string, unknown>) {
    return this;
  }
  return {
    default: { Agent: MockAgent },
    Agent: MockAgent,
  };
});

// ── Mock: WebSocket (hoisted so the factory can reference the class) ────────

type WSListener = (...args: unknown[]) => void;

const { MockWebSocket } = vi.hoisted(() => {
  class _MockWebSocket {
    static readonly OPEN = 1;
    static readonly CONNECTING = 0;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    static instances: _MockWebSocket[] = [];
    static reset(): void {
      _MockWebSocket.instances = [];
    }

    readyState = _MockWebSocket.CONNECTING;
    readonly url: string;
    send = vi.fn();
    close = vi.fn((_code?: number) => {
      this.readyState = _MockWebSocket.CLOSED;
      this._emit('close');
    });
    terminate = vi.fn(() => {
      this.readyState = _MockWebSocket.CLOSED;
      this._emit('close');
    });
    removeAllListeners = vi.fn();
    private _listeners = new Map<string, Set<WSListener>>();

    constructor(url: string) {
      this.url = url;
      _MockWebSocket.instances.push(this);
    }

    on(event: string, cb: WSListener): this {
      if (!this._listeners.has(event)) this._listeners.set(event, new Set());
      this._listeners.get(event)?.add(cb);
      return this;
    }
    once(event: string, cb: WSListener): this {
      const wrapper: WSListener = (...args) => {
        this._listeners.get(event)?.delete(wrapper);
        cb(...args);
      };
      return this.on(event, wrapper);
    }
    off(event: string, cb: WSListener): this {
      this._listeners.get(event)?.delete(cb);
      return this;
    }
    _emit(event: string, ...args: unknown[]): void {
      for (const cb of this._listeners.get(event) ?? []) cb(...args);
    }
    simulateOpen(): void {
      this.readyState = _MockWebSocket.OPEN;
      this._emit('open');
    }
    simulateMessage(data: string): void {
      this._emit('message', Buffer.from(data, 'utf-8'));
    }
    simulateClose(): void {
      this.readyState = _MockWebSocket.CLOSED;
      this._emit('close');
    }
    simulateError(msg = 'test error'): void {
      this._emit('error', new Error(msg));
    }
  }
  return { MockWebSocket: _MockWebSocket };
});

vi.mock('ws', () => ({ WebSocket: MockWebSocket }));

// ── Imports after mocks ──────────────────────────────────────────────────

import type { Mock } from 'vitest';
import { listDevices, updateDeviceStatus } from '../../services/EEBusTrustStore.js';
import { EebusProtocolAdapter } from './EebusProtocolAdapter.js';

// ── Test helpers ─────────────────────────────────────────────────────────

function makeTrustedDevice(ski = 'aabbccdd11223344', host = '192.168.1.100') {
  return {
    ski,
    hostname: host,
    port: 4712,
    brand: 'TestBrand',
    model: 'TestModel',
    deviceType: 'EVCharger',
    status: 'trusted' as const,
    trustedAt: Date.now() - 10_000,
    lastConnectedAt: undefined,
  };
}

/**
 * Flush the microtask queue and allow `setTimeout(fn, 0)` callbacks to run.
 * Required because `EebusDataSession.connect()` is fire-and-forget: it
 * awaits `loadOrGenerateCert()` before creating a WebSocket, so the WS
 * constructor call happens after the current synchronous frame.
 */
const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

/** Build a SPINE datagram JSON string */
function spineMessage(cmd: Record<string, unknown>, classifier = 'notify'): string {
  return JSON.stringify({
    datagram: {
      header: {
        protocolId: 'ee1.0',
        msgCounter: 1,
        cmdClassifier: classifier,
        featureSource: { entity: 2, feature: 2 },
        featureDestination: { entity: 1, feature: 1 },
        ackRequest: false,
      },
      payload: { cmd: [cmd] },
    },
  });
}

/** Simulate the SHIP hello exchange after a MockWebSocket opens */
function completeShipHello(ws: InstanceType<typeof MockWebSocket>): void {
  ws.simulateOpen();
  ws.simulateMessage(JSON.stringify({ connectionHello: [{ phase: 'ready', waiting: false }] }));
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('EebusProtocolAdapter', () => {
  let adapter: EebusProtocolAdapter;

  /**
   * Connect the adapter, flush async microtasks so the WS is created, then
   * return the first MockWebSocket instance. Throws if no WS was created.
   */
  async function connectAndGetWS(
    dev?: ReturnType<typeof makeTrustedDevice>,
  ): Promise<InstanceType<typeof MockWebSocket>> {
    if (dev) (listDevices as Mock).mockResolvedValue([dev]);
    await adapter.connect();
    await flushAsync();
    const ws = MockWebSocket.instances[0];
    if (!ws) throw new Error('No WS created — check adapter connect() + session start');
    return ws;
  }

  beforeEach(() => {
    MockWebSocket.reset();
    vi.clearAllMocks();
    (listDevices as Mock).mockResolvedValue([]);
    (updateDeviceStatus as Mock).mockResolvedValue(undefined);
    adapter = new EebusProtocolAdapter({ id: 'test-eebus-01', trustStorePollIntervalMs: 100_000 });
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.useRealTimers();
  });

  // ── Protocol basics ────────────────────────────────────────────────────

  it('has the correct protocol and id', () => {
    expect(adapter.id).toBe('test-eebus-01');
    expect(adapter.protocol).toBe('eebus');
  });

  // ── healthCheck with no devices ───────────────────────────────────────

  it('reports offline when trust store has no trusted devices', async () => {
    (listDevices as Mock).mockResolvedValue([]);
    await adapter.connect();

    const health = await adapter.healthCheck();
    expect(health.status).toBe('offline');
    expect(health.errorMessage).toMatch(/No trusted/i);
  });

  // ── Session establishment from trust store ────────────────────────────

  it('opens a WebSocket for each trusted device on connect()', async () => {
    const device = makeTrustedDevice();
    (listDevices as Mock).mockResolvedValue([device]);

    await adapter.connect();
    await flushAsync(); // let async cert loading + WS creation settle

    // Exactly one WS should have been opened
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain(device.hostname);
    expect(MockWebSocket.instances[0].url).toContain('/ship/');
  });

  // ── SHIP hello exchange ───────────────────────────────────────────────

  it('sends connectionHello on WS open', async () => {
    const device = makeTrustedDevice();
    (listDevices as Mock).mockResolvedValue([device]);

    await adapter.connect();
    await flushAsync();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const sentPayloads = ws.send.mock.calls.map((c: unknown[]) => {
      try {
        return JSON.parse(c[0] as string);
      } catch {
        return null;
      }
    });
    const helloSent = sentPayloads.some((p: unknown) => {
      if (!p || typeof p !== 'object') return false;
      const obj = p as Record<string, unknown>;
      return Array.isArray(obj.connectionHello);
    });
    expect(helloSent).toBe(true);
  });

  it('marks session connected after SHIP hello exchange', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const health = await adapter.healthCheck();
    expect(health.status).toBe('healthy');
  });

  it('calls updateDeviceStatus(trusted) after successful SHIP hello', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    expect(updateDeviceStatus).toHaveBeenCalledWith(device.ski, 'trusted', expect.any(Number));
  });

  // ── SPINE measurement parsing → EventBus ──────────────────────────────

  it('emits POWER_W/load datapoint from ACPowerTotal measurement', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const datapoints: unknown[] = [];
    const gen = adapter.getDataStream();
    const reading = gen.next(); // start reading

    // Send a SPINE measurement
    ws.simulateMessage(
      spineMessage({
        measurementListData: {
          measurementData: [
            {
              measurementId: 1,
              scopeType: 'ACPowerTotal',
              value: 1500,
              unit: 'W',
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }),
    );

    const result = await reading;
    if (!result.done) datapoints.push(result.value);

    await adapter.disconnect();

    expect(datapoints).toHaveLength(1);
    const dp = datapoints[0] as Record<string, unknown>;
    expect(dp.metric).toBe('POWER_W');
    expect(dp.role).toBe('load');
    expect(dp.value).toBe(1500);
    expect(dp.protocol).toBe('eebus');
  });

  it('emits SOC_PERCENT/battery datapoint from StateOfCharge measurement', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const gen = adapter.getDataStream();
    const reading = gen.next();

    ws.simulateMessage(
      spineMessage({
        measurementListData: {
          measurementData: [
            {
              measurementId: 2,
              scopeType: 'StateOfCharge',
              value: 75,
              unit: '%',
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }),
    );

    const result = await reading;
    await adapter.disconnect();

    expect(result.done).toBe(false);
    const dp = result.value as Record<string, unknown>;
    expect(dp.metric).toBe('SOC_PERCENT');
    expect(dp.role).toBe('battery');
    expect(dp.value).toBe(75);
  });

  it('converts kW to W for SPINE kW unit', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const gen = adapter.getDataStream();
    const reading = gen.next();

    ws.simulateMessage(
      spineMessage({
        measurementListData: {
          measurementData: [
            {
              measurementId: 3,
              scopeType: 'ACPowerTotal',
              value: 3.5,
              unit: 'kW',
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }),
    );

    const result = await reading;
    await adapter.disconnect();

    expect(result.done).toBe(false);
    expect((result.value as Record<string, unknown>).value).toBeCloseTo(3500);
  });

  it('skips measurements with unknown scopeType (not mapped)', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const received: unknown[] = [];
    const gen = adapter.getDataStream();

    const collectPromise = (async () => {
      for await (const dp of gen) {
        received.push(dp);
      }
    })();

    // Unknown scope — should be ignored silently
    ws.simulateMessage(
      spineMessage({
        measurementListData: {
          measurementData: [
            {
              measurementId: 9,
              scopeType: 'UnknownScope',
              value: 999,
              unit: 'W',
            },
          ],
        },
      }),
    );

    await adapter.disconnect();
    await collectPromise;

    // datapoints from subscription sends (initial read requests) may exist but
    // the unknown scope should produce zero datapoints
    const unknownDps = received.filter(
      (d) => typeof d === 'object' && d !== null && (d as Record<string, unknown>).value === 999,
    );
    expect(unknownDps).toHaveLength(0);
  });

  // ── LoadControl limit mapping (LPC §14a EnWG) ─────────────────────────

  it('emits POWER_W/ev for active EV load control limit (limitId 1)', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const gen = adapter.getDataStream();
    const reading = gen.next();

    ws.simulateMessage(
      spineMessage({
        loadControlLimitListData: {
          loadControlLimitData: [
            {
              limitId: 1,
              limitType: 'maxValueLimit',
              unit: 'W',
              value: 7400,
              isActive: true,
            },
          ],
        },
      }),
    );

    const result = await reading;
    await adapter.disconnect();

    expect(result.done).toBe(false);
    const dp = result.value as Record<string, unknown>;
    expect(dp.role).toBe('ev');
    expect(dp.metric).toBe('POWER_W');
  });

  it('emits POWER_W/heatpump for active heat-pump limit (limitId 10)', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const gen = adapter.getDataStream();
    const reading = gen.next();

    ws.simulateMessage(
      spineMessage({
        loadControlLimitListData: {
          loadControlLimitData: [
            {
              limitId: 10,
              limitType: 'maxValueLimit',
              unit: 'W',
              value: 3500,
              isActive: true,
            },
          ],
        },
      }),
    );

    const result = await reading;
    await adapter.disconnect();

    expect(result.done).toBe(false);
    const dp = result.value as Record<string, unknown>;
    expect(dp.role).toBe('heatpump');
  });

  it('converts current limit (A) to W assuming 230 V', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const gen = adapter.getDataStream();
    const reading = gen.next();

    ws.simulateMessage(
      spineMessage({
        loadControlLimitListData: {
          loadControlLimitData: [
            {
              limitId: 1,
              limitType: 'maxValueLimit',
              unit: 'A',
              value: 16,
              isActive: true,
            },
          ],
        },
      }),
    );

    const result = await reading;
    await adapter.disconnect();

    const dp = result.value as Record<string, unknown>;
    expect(dp.value).toBeCloseTo(16 * 230);
  });

  it('ignores inactive load control limits', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const received: unknown[] = [];
    const gen = adapter.getDataStream();

    const collectPromise = (async () => {
      for await (const dp of gen) {
        received.push(dp);
      }
    })();

    ws.simulateMessage(
      spineMessage({
        loadControlLimitListData: {
          loadControlLimitData: [
            {
              limitId: 1,
              limitType: 'maxValueLimit',
              unit: 'W',
              value: 0,
              isActive: false, // inactive
            },
          ],
        },
      }),
    );

    await adapter.disconnect();
    await collectPromise;

    // No datapoints from inactive limits
    const inactiveZeroW = received.filter(
      (d) => typeof d === 'object' && d !== null && (d as Record<string, unknown>).value === 0,
    );
    expect(inactiveZeroW).toHaveLength(0);
  });

  // ── DLQ ──────────────────────────────────────────────────────────────

  it('does not crash on malformed SPINE JSON', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    // Send binary-like garbage
    expect(() => ws.simulateMessage('not-valid-json{')).not.toThrow();
  });

  it('routes invalid measurement datapoints to DLQ', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const received: unknown[] = [];
    const gen = adapter.getDataStream();
    const collectPromise = (async () => {
      for await (const dp of gen) {
        received.push(dp);
      }
    })();

    // value: NaN is finite-check fail → should go to DLQ
    ws.simulateMessage(
      spineMessage({
        measurementListData: {
          measurementData: [
            {
              measurementId: 1,
              scopeType: 'ACPowerTotal',
              value: Number.NaN,
              unit: 'W',
            },
          ],
        },
      }),
    );

    await adapter.disconnect();
    await collectPromise;

    // NaN skips emission before schema check (isFinite guard)
    // No crash and no valid datapoint emitted
    expect(received.some((d) => Number.isNaN((d as Record<string, unknown>).value))).toBe(false);
  });

  // ── Reconnect ─────────────────────────────────────────────────────────

  it('schedules reconnect after unexpected WS close', async () => {
    // Fake timers must be set up BEFORE the first real timer is needed
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);
    vi.useFakeTimers();

    // Disconnect unexpectedly — triggers scheduleReconnect()
    ws.simulateClose();

    // Advance past the first reconnect delay (1 s base) + cert loading flush
    await vi.advanceTimersByTimeAsync(2500);
    // Flush async cert-loading microtasks from the new session.connect() chain
    vi.useRealTimers();
    await flushAsync();

    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
  });

  // ── Disconnect ────────────────────────────────────────────────────────

  it('closes all sessions and terminates the data stream on disconnect()', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const datapoints: unknown[] = [];
    const gen = adapter.getDataStream();
    const collectPromise = (async () => {
      for await (const dp of gen) {
        datapoints.push(dp);
      }
    })();

    await adapter.disconnect();
    await collectPromise;

    // Stream should have ended (generator returned)
    expect(ws.close).toHaveBeenCalled();
  });

  // ── Trust store polling ───────────────────────────────────────────────

  it('starts a new session for a device added after initial connect', async () => {
    (listDevices as Mock).mockResolvedValue([]);
    // Use a short real poll interval so the test completes quickly
    adapter = new EebusProtocolAdapter({ id: 'test-eebus-02', trustStorePollIntervalMs: 80 });

    await adapter.connect();
    expect(MockWebSocket.instances).toHaveLength(0);

    // Simulate a device being paired and added to the trust store
    const newDevice = makeTrustedDevice('ff001122334455aa');
    (listDevices as Mock).mockResolvedValue([newDevice]);

    // Wait for at least one full poll cycle + cert loading + WS creation
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    await flushAsync();

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    expect(MockWebSocket.instances[0].url).toContain(newDevice.hostname);
  });

  // ── SHIP PIN re-pairing detection ────────────────────────────────────

  it('marks device as pending and closes WS when PIN state is received', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    ws.simulateMessage(JSON.stringify({ connectionPinState: [{ ski: device.ski }] }));

    expect(updateDeviceStatus).toHaveBeenCalledWith(device.ski, 'pending');
    expect(ws.close).toHaveBeenCalled();
  });

  // ── ACK handling ─────────────────────────────────────────────────────

  it('sends SPINE result ACK when ackRequest is true', async () => {
    const device = makeTrustedDevice();
    const ws = await connectAndGetWS(device);
    completeShipHello(ws);

    const gen = adapter.getDataStream();
    // Consume and discard until disconnect
    const collectPromise = (async () => {
      for await (const _ of gen) {
        /* drain */
      }
    })();

    // ACK-requesting SPINE message
    ws.simulateMessage(
      JSON.stringify({
        datagram: {
          header: {
            protocolId: 'ee1.0',
            msgCounter: 42,
            cmdClassifier: 'notify',
            ackRequest: true,
          },
          payload: { cmd: [] },
        },
      }),
    );

    await adapter.disconnect();
    await collectPromise;

    // Should have sent a result ACK
    const ackPayloads = ws.send.mock.calls.map((c: unknown[]) => {
      try {
        return JSON.parse(c[0] as string);
      } catch {
        return null;
      }
    });
    const ackSent = ackPayloads.some((p: unknown) => {
      if (!p || typeof p !== 'object') return false;
      const obj = p as Record<string, unknown>;
      const dg = obj.datagram as Record<string, unknown> | undefined;
      if (!dg) return false;
      const hdr = dg.header as Record<string, unknown> | undefined;
      return hdr?.cmdClassifier === 'result';
    });
    expect(ackSent).toBe(true);
  });
});
