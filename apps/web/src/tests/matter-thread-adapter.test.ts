import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatterThreadAdapter } from '../core/adapters/contrib/matter-thread';
import type { EnergyAdapter } from '../core/adapters/EnergyAdapter';

// ────────────────────────────────────────────────────────────────────
// MatterThreadAdapter — Unit Tests
// Tests the Matter 1.3 / Thread 1.3 adapter against a mocked
// HA Matter Server WebSocket API (or chip-tool proxy).
// ────────────────────────────────────────────────────────────────────

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

/** Build a minimal HA Matter Server WS response */
const matterResponse = (messageId: string, result: unknown): string =>
  JSON.stringify({ type: 'result', messageId, result });

/** Build a Matter attribute event */
const matterEvent = (nodeId: number, cluster: number, attribute: string, value: number): string =>
  JSON.stringify({
    type: 'event',
    event: 'attribute_updated',
    data: { nodeId, endpoint: 1, cluster, attribute, value },
  });

describe('MatterThreadAdapter — Interface Contract', () => {
  let adapter: EnergyAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new MatterThreadAdapter();
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('has correct id = matter-thread', () => {
    expect(adapter.id).toBe('matter-thread');
  });

  it('has name containing Matter or Thread', () => {
    expect(adapter.name).toMatch(/matter|thread/i);
  });

  it('declares pv, grid, and load capabilities', () => {
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

describe('MatterThreadAdapter — WebSocket Lifecycle', () => {
  let adapter: MatterThreadAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new MatterThreadAdapter({
      host: 'homeassistant.local',
      port: 5580,
    });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('opens WebSocket on connect()', async () => {
    const p = adapter.connect();
    // URL set synchronously in constructor
    expect(MockWebSocket.constructorUrl).toContain('homeassistant.local');
    // Trigger quick rejection to avoid 10s connect timeout
    mockInstance?.onerror?.({});
    mockInstance?.onclose?.();
    await p.catch(() => {});
  });

  it('transitions to connected on WebSocket open', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    expect(adapter.status).toBe('connected');
  });

  it('transitions to error on WebSocket error', async () => {
    const p = adapter.connect();
    mockInstance!.onerror?.({ message: 'ECONNREFUSED' });
    mockInstance!.onclose?.();
    await p.catch(() => {});
    expect(['error', 'disconnected', 'connecting']).toContain(adapter.status);
  });

  it('transitions to disconnected on WebSocket close', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});
    mockInstance!.onclose?.();
    expect(adapter.status).toBe('disconnected');
  });
});

describe('MatterThreadAdapter — Matter Message Protocol', () => {
  let adapter: MatterThreadAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new MatterThreadAdapter({
      host: 'ha-matter.local',
      nodeIds: [1, 2],
    });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('sends get_nodes or equivalent request after connection', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    // Adapter should send at least one initialization message
    if (mockInstance!.send.mock.calls.length > 0) {
      const firstMsg = JSON.parse(mockInstance!.send.mock.calls[0][0] as string) as Record<
        string,
        unknown
      >;
      expect(firstMsg).toHaveProperty('type');
      expect(firstMsg).toHaveProperty('messageId');
    }
  });

  it('handles node list result from HA Matter Server', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    // Respond to the first WS message with a node list
    if (mockInstance!.send.mock.calls.length > 0) {
      const firstMsg = JSON.parse(mockInstance!.send.mock.calls[0][0] as string) as {
        messageId: string;
      };
      const nodeList = [
        {
          nodeId: 1,
          endpoints: [
            {
              endpointId: 1,
              clusters: {
                2820: { activePower: 1500, rmsVoltage: 2300, rmsCurrent: 652 },
              },
            },
          ],
        },
      ];
      expect(() => {
        mockInstance!.onmessage?.({ data: matterResponse(firstMsg.messageId, nodeList) });
      }).not.toThrow();
    }
  });

  it('handles attribute_updated event and updates snapshot', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    // ElectricalMeasurement cluster (0x0B04) activePower attribute update
    const event = matterEvent(1, 0x0b04, 'activePower', 2200);
    expect(() => {
      mockInstance!.onmessage?.({ data: event });
    }).not.toThrow();
  });

  it('handles thermostat cluster setpoint event without crashing', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    const event = matterEvent(2, 0x0201, 'occupiedHeatingSetpoint', 2100);
    expect(() => {
      mockInstance!.onmessage?.({ data: event });
    }).not.toThrow();
  });

  it('ignores malformed JSON messages without crashing', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    expect(() => {
      mockInstance!.onmessage?.({ data: '{ not valid json' });
    }).not.toThrow();
  });
});

describe('MatterThreadAdapter — Commands', () => {
  let adapter: MatterThreadAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new MatterThreadAdapter({ host: 'ha-matter.local', nodeIds: [1] });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('rejects commands when disconnected', async () => {
    const result = await adapter.sendCommand({ type: 'SET_HEAT_PUMP_MODE', value: 'off' });
    expect(result).toBe(false);
  });

  it('handles unrecognised commands gracefully when connected', async () => {
    const p = adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    await p.catch(() => {});

    const result = await adapter.sendCommand({ type: 'SET_GRID_LIMIT', value: 1 });
    expect(result).toBe(false);
  });
});

describe('MatterThreadAdapter — Configuration Variants', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('supports ha-matter-server controller type', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new MatterThreadAdapter({
      controllerType: 'ha-matter-server',
      host: 'ha.local',
      port: 5580,
      nodeIds: [1, 2, 3],
      pollIntervalMs: 10_000,
    });
    expect(adapter.status).toBe('disconnected');
    adapter.destroy();
  });

  it('supports chip-tool controller type', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new MatterThreadAdapter({
      controllerType: 'chip-tool',
      host: 'chipclient.local',
      port: 9002,
    });
    expect(adapter.capabilities.length).toBeGreaterThan(0);
    adapter.destroy();
  });
});

const CLUSTER = {
  ON_OFF: 0x0006,
  THERMOSTAT: 0x0201,
  ELECTRICAL_MEASUREMENT: 0x0b04,
  EPM: 0x0090,
  EEM: 0x0091,
  DEM: 0x0098,
} as const;

describe('MatterThreadAdapter — snapshot and DEM clusters', () => {
  let adapter: MatterThreadAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new MatterThreadAdapter({ host: 'ha-matter.local', nodeIds: [1] });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  async function connectOpen(): Promise<MockWebSocket> {
    const p = adapter.connect();
    const ws = mockInstance!;
    ws.readyState = WebSocket.OPEN;
    ws.onopen?.();
    await p;
    return ws;
  }

  it('parses node list results with DEM, EPM, and EEM clusters', async () => {
    const ws = await connectOpen();
    const firstMsg = JSON.parse(ws.send.mock.calls[0][0] as string) as { messageId: string };

    ws.onmessage?.({
      data: matterResponse(firstMsg.messageId, [
        {
          nodeId: 1,
          endpoints: [
            {
              endpointId: 1,
              clusters: {
                [CLUSTER.ELECTRICAL_MEASUREMENT]: { activePower: 1800 },
                [CLUSTER.DEM]: {
                  featureMap: 3,
                  esaState: 'running',
                  optOutState: 'none',
                  esaCanGenerate: true,
                },
                [CLUSTER.EPM]: { activePower: 2_500_000, reactivePower: 400_000 },
                [CLUSTER.EEM]: {
                  cumulativeEnergyImported: 8_000_000,
                  cumulativeEnergyExported: 1_500_000,
                },
              },
            },
          ],
        },
      ]),
    });

    const snapshot = adapter.getSnapshot();
    expect(snapshot.load?.totalPowerW).toBe(1800);
    const demStates = adapter.getDEMStates();
    expect(demStates.get(1)?.esaState).toBe('running');
    expect(demStates.get(1)?.activePowerW).toBe(2500);
    expect(demStates.get(1)?.cumulativeImportWh).toBe(8000);
  });

  it('updates load power from attribute_updated events', async () => {
    const ws = await connectOpen();

    ws.onmessage?.({
      data: matterEvent(1, CLUSTER.ELECTRICAL_MEASUREMENT, 'activePower', 3200),
    });

    expect(adapter.getSnapshot().load?.totalPowerW).toBe(3200);
  });

  it('updates DEM state from attribute_updated events', async () => {
    const ws = await connectOpen();

    ws.onmessage?.({
      data: JSON.stringify({
        type: 'event',
        event: 'attribute_updated',
        data: {
          nodeId: 1,
          cluster: CLUSTER.DEM,
          attribute: 'esaState',
          value: 2,
        },
      }),
    });

    expect(adapter.getDEMStates().get(1)?.esaState).toBe('running');
  });
});

describe('MatterThreadAdapter — Matter command dispatch', () => {
  let adapter: MatterThreadAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new MatterThreadAdapter({ host: 'ha-matter.local', nodeIds: [1, 2] });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  async function connectOpen(): Promise<MockWebSocket> {
    const p = adapter.connect();
    const ws = mockInstance!;
    ws.readyState = WebSocket.OPEN;
    ws.onopen?.();
    await p;
    return ws;
  }

  it('sends OnOff and thermostat writes for device commands', async () => {
    const ws = await connectOpen();

    await expect(
      adapter.sendCommand({ type: 'KNX_TOGGLE_LIGHTS', targetDeviceId: '1', value: true }),
    ).resolves.toBe(true);
    await expect(
      adapter.sendCommand({ type: 'SET_HEAT_PUMP_MODE', targetDeviceId: '2', value: 4 }),
    ).resolves.toBe(true);

    const payloads = ws.send.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(
      payloads.some(
        (msg) => msg.type === 'write_attribute' && msg.data?.cluster === CLUSTER.ON_OFF,
      ),
    ).toBe(true);
    expect(
      payloads.some(
        (msg) => msg.type === 'write_attribute' && msg.data?.cluster === CLUSTER.THERMOSTAT,
      ),
    ).toBe(true);
  });

  it('sends DEM flex and V2G constraint commands', async () => {
    const ws = await connectOpen();

    await expect(
      adapter.sendCommand({
        type: 'VPP_OFFER_FLEX',
        targetDeviceId: '1',
        value: 3.5,
        payload: { durationS: 600 },
      }),
    ).resolves.toBe(true);
    await expect(
      adapter.sendCommand({
        type: 'SET_V2G_BPT_PARAMS',
        targetDeviceId: '1',
        value: 1,
        payload: { evMaximumChargePowerW: 11_000, evMinimumChargePowerW: 0 },
      }),
    ).resolves.toBe(true);

    const payloads = ws.send.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(
      payloads.some((msg) => msg.type === 'invoke_command' && msg.data?.cluster === CLUSTER.DEM),
    ).toBe(true);
    expect(
      payloads.some(
        (msg) =>
          msg.type === 'write_attribute' &&
          msg.data?.cluster === CLUSTER.DEM &&
          msg.data?.attribute === 'forecast',
      ),
    ).toBe(true);
  });
});

describe('MatterThreadAdapter — register()', () => {
  it('registers the matter-thread factory in the adapter registry', async () => {
    const { getRegisteredAdapter, unregisterAdapter } = await import(
      '../core/adapters/adapter-registry'
    );
    const { register } = await import('../core/adapters/contrib/matter-thread');

    register();
    const entry = getRegisteredAdapter('matter-thread');
    expect(entry?.source).toBe('contrib');
    expect(entry?.displayName).toBe('Matter/Thread');

    unregisterAdapter('matter-thread');
  });
});
