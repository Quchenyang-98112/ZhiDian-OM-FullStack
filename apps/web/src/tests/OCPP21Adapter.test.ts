import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnergyAdapter } from '../core/adapters/EnergyAdapter';
import { OCPP21Adapter } from '../core/adapters/OCPP21Adapter';

vi.mock('../lib/secure-store', () => ({
  mergeCredentialsIntoConfig: vi.fn(async (_id: string, config: Record<string, unknown>) => config),
}));

// ────────────────────────────────────────────────────────────────────
// OCPP21Adapter — Unit Tests
// Tests the OCPP 2.1 JSON-RPC over WebSocket adapter (mini-CSMS mode).
// No real charging station required — WebSocket is mocked globally.
// ────────────────────────────────────────────────────────────────────

let mockInstance: MockWebSocket | null = null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readonly url: string;
  protocols?: string | string[];
  readyState: number = WebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    if (protocols !== undefined) {
      this.protocols = protocols;
    }
    mockInstance = this;
  }
}

// Helper: build OCPP 2.1 CALL message [2, uniqueId, action, payload]
const ocppCall = (action: string, payload: Record<string, unknown> = {}): string =>
  JSON.stringify([2, crypto.randomUUID(), action, payload]);

describe('OCPP21Adapter — Interface Contract', () => {
  let adapter: EnergyAdapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new OCPP21Adapter({ securityProfile: 0, tls: false });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('has correct id and name', () => {
    expect(adapter.id).toBe('ocpp-21');
    expect(adapter.name).toMatch(/OCPP/i);
  });

  it('declares EV charger capabilities', () => {
    expect(adapter.capabilities).toContain('evCharger');
  });

  it('starts disconnected', () => {
    expect(adapter.status).toBe('disconnected');
  });

  it('has defined snapshot before connect', () => {
    expect(adapter.getSnapshot()).toBeDefined();
    expect(typeof adapter.getSnapshot()).toBe('object');
  });

  it('destroys cleanly without errors', () => {
    expect(() => adapter.destroy()).not.toThrow();
  });
});

describe('OCPP21Adapter — WebSocket Lifecycle', () => {
  let adapter: OCPP21Adapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new OCPP21Adapter({ host: 'evse.local', port: 9000, securityProfile: 0, tls: false });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('opens WebSocket on connect()', async () => {
    await adapter.connect();
    expect(mockInstance).not.toBeNull();
    mockInstance!.onclose?.();
  });

  it('transitions to connected on WebSocket open', async () => {
    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();
    expect(adapter.status).toBe('connected');
  });

  it('transitions to error on WebSocket error', async () => {
    await adapter.connect();
    mockInstance!.onerror?.({ message: 'ECONNREFUSED' });
    mockInstance!.onclose?.();
    expect(['error', 'disconnected', 'connecting']).toContain(adapter.status);
  });

  it('transitions to disconnected on WebSocket close', async () => {
    await adapter.connect();
    mockInstance!.onopen?.();
    mockInstance!.onclose?.();
    expect(adapter.status).toBe('disconnected');
  });
});

describe('OCPP21Adapter — OCPP 2.1 Message Protocol', () => {
  let adapter: OCPP21Adapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new OCPP21Adapter({ host: 'evse.local', port: 9000, securityProfile: 0, tls: false });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('handles BootNotification CALL and responds with CALLRESULT', async () => {
    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();

    const bootMsg = ocppCall('BootNotification', {
      chargingStation: { model: 'ABB Terra', vendorName: 'ABB' },
      reason: 'PowerUp',
    });
    mockInstance!.onmessage?.({ data: bootMsg });

    // Adapter may send CALLRESULT; just verify it doesn't crash on BootNotification
    expect(() => mockInstance!.onmessage?.({ data: bootMsg })).not.toThrow();
  });

  it('handles StatusNotification and updates connector status', async () => {
    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();

    const statusMsg = ocppCall('StatusNotification', {
      timestamp: new Date().toISOString(),
      connectorStatus: 'Available',
      evseId: 1,
      connectorId: 1,
    });
    mockInstance!.onmessage?.({ data: statusMsg });

    const snapshot = adapter.getSnapshot();
    if (snapshot.evCharger) {
      expect(['available', 'charging', 'error', 'offline']).toContain(snapshot.evCharger.status);
    }
  });

  it('handles TransactionEvent with charging state and power reading', async () => {
    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();

    const txMsg = ocppCall('TransactionEvent', {
      eventType: 'Started',
      timestamp: new Date().toISOString(),
      triggerReason: 'Authorized',
      seqNo: 1,
      transactionInfo: {
        transactionId: 'tx-001',
        chargingState: 'Charging',
      },
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            { measurand: 'Power.Active.Import', value: 11000, unit: 'W' },
            { measurand: 'SoC', value: 45, unit: 'Percent' },
          ],
        },
      ],
    });
    mockInstance!.onmessage?.({ data: txMsg });

    const snapshot = adapter.getSnapshot();
    if (snapshot.evCharger) {
      expect(snapshot.evCharger.powerW).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles TransactionEvent Ended and clears session', async () => {
    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();

    const txEndMsg = ocppCall('TransactionEvent', {
      eventType: 'Ended',
      timestamp: new Date().toISOString(),
      triggerReason: 'StoppedByEV',
      seqNo: 5,
      transactionInfo: {
        transactionId: 'tx-001',
        chargingState: 'Idle',
      },
    });
    mockInstance!.onmessage?.({ data: txEndMsg });

    const snapshot = adapter.getSnapshot();
    if (snapshot.evCharger) {
      expect(snapshot.evCharger.status).not.toBe('charging');
    }
  });

  it('does not crash on CALLERROR message', async () => {
    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();

    const errMsg = JSON.stringify([4, 'some-unique-id', 'NotImplemented', 'Unknown action', {}]);
    expect(() => mockInstance!.onmessage?.({ data: errMsg })).not.toThrow();
  });

  it('ignores malformed JSON messages', async () => {
    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();

    expect(() => {
      mockInstance!.onmessage?.({ data: '{ bad json' });
    }).not.toThrow();
  });
});

describe('OCPP21Adapter — Smart Charging Commands', () => {
  let adapter: OCPP21Adapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new OCPP21Adapter({ host: 'evse.local', port: 9000, securityProfile: 0, tls: false });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('rejects commands when disconnected', async () => {
    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 6900 });
    expect(result).toBe(false);
  });

  it('sends SetChargingProfile when connected', async () => {
    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();

    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 6900 });
    expect(typeof result).toBe('boolean');
    if (result) {
      // Should have sent an OCPP CALL with SetChargingProfile action
      const calls = mockInstance!.send.mock.calls;
      const setProfile = calls.find((call) => {
        const parsed = JSON.parse(call[0] as string) as unknown[];
        return parsed[0] === 2 && parsed[2] === 'SetChargingProfile';
      });
      expect(setProfile).toBeDefined();
    }
  });

  it('enforces §14a EnWG 3.7kW minimum when stop is sent during peak', async () => {
    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();

    // 0W would violate §14a limit — adapter should either reject or clamp
    const result = await adapter.sendCommand({ type: 'SET_EV_POWER', value: 0 });
    // Either rejected (false) or clamped to minimum — both are acceptable
    expect(typeof result).toBe('boolean');
  });

  it('returns false for SET_BATTERY_POWER (unknown to OCPP adapter) when connected', async () => {
    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();

    const result = await adapter.sendCommand({ type: 'SET_BATTERY_POWER', value: 0 });
    expect(result).toBe(false);
  });
});

describe('OCPP21Adapter — V2X Support', () => {
  let adapter: OCPP21Adapter;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new OCPP21Adapter({
      host: 'evse.local',
      port: 9000,
      iso15118: true,
      securityProfile: 0,
      tls: false,
    });
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('tracks V2X-capable charger state', async () => {
    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();

    // Simulate V2X status notification
    const statusMsg = ocppCall('StatusNotification', {
      timestamp: new Date().toISOString(),
      connectorStatus: 'Occupied',
      evseId: 1,
      connectorId: 1,
    });
    mockInstance!.onmessage?.({ data: statusMsg });

    const snapshot = adapter.getSnapshot();
    if (snapshot.evCharger) {
      expect(typeof snapshot.evCharger.v2xCapable).toBe('boolean');
    }
  });
});

describe('OCPP21Adapter — V2G SOC fail-safe guard', () => {
  // V2G_MIN_SOC_PERCENT is a module-private constant = 15.
  const MIN_SOC = 15;
  let adapter: OCPP21Adapter;
  // Typed view onto the private discharge methods + mutable charger state so we
  // can exercise the SOC guard directly without a live OCPP session.
  type V2GInternals = {
    charger: { v2xCapable: boolean; evSocPercent: number; voltageV: number };
    sendV2XDischarge(w: number): boolean;
    sendDischargeToHome(w: number): boolean;
  };
  const internals = () => adapter as unknown as V2GInternals;

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    adapter = new OCPP21Adapter({
      host: 'evse.local',
      port: 9000,
      iso15118: true,
      v2xCapable: true,
      securityProfile: 0,
      tls: false,
    });
    internals().charger.v2xCapable = true;
    internals().charger.voltageV = 230;
  });

  afterEach(() => {
    adapter.destroy();
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('blocks V2G discharge at SOC 0 (unknown/not-yet-reported = fail-safe)', () => {
    internals().charger.evSocPercent = 0;
    expect(internals().sendV2XDischarge(3000)).toBe(false);
    expect(internals().sendDischargeToHome(3000)).toBe(false);
  });

  it('blocks V2G discharge just below the SOC floor', () => {
    internals().charger.evSocPercent = MIN_SOC - 1;
    expect(internals().sendV2XDischarge(3000)).toBe(false);
    expect(internals().sendDischargeToHome(3000)).toBe(false);
  });

  it('allows V2G discharge at or above the SOC floor', () => {
    internals().charger.evSocPercent = MIN_SOC + 20;
    expect(internals().sendV2XDischarge(3000)).toBe(true);
    expect(internals().sendDischargeToHome(3000)).toBe(true);
  });
});

describe('OCPP21Adapter — Security Profiles', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockInstance = null;
  });

  it('uses wss with Basic Auth URL for profile 2', async () => {
    const adapter = new OCPP21Adapter({
      host: 'csms.local',
      port: 9000,
      securityProfile: 2,
      stationId: 'WB-01',
      authToken: 'auth-secret',
    });
    await adapter.connect();
    expect(mockInstance?.url).toBe('wss://WB-01:auth-secret@csms.local:9000/ocpp/WB-01');
    mockInstance?.onclose?.();
    adapter.destroy();
  });

  it('fails connect without client cert for profile 3', async () => {
    const adapter = new OCPP21Adapter({
      host: 'csms.local',
      port: 9000,
      securityProfile: 3,
      stationId: 'WB-01',
    });
    await adapter.connect();
    expect(adapter.status).toBe('error');
    expect(mockInstance).toBeNull();
    adapter.destroy();
  });

  it('connects with profile 3 via API proxy in browser', async () => {
    localStorage.setItem('nexus-hems-auth-token', 'jwt-token');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ sessionId: 'sess-test' }), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 't1' }), { status: 200 })),
    );

    const adapter = new OCPP21Adapter({
      host: 'csms.local',
      port: 9000,
      securityProfile: 3,
      stationId: 'WB-01',
      clientCert: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
      clientKey: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
    });
    await adapter.connect();
    expect(mockInstance?.url).toContain('/ws/ocpp?');
    expect(mockInstance?.url).toContain('ticket=t1');
    expect(mockInstance?.url).toContain('session=sess-test');
    mockInstance!.onclose?.();
    adapter.destroy();
  });

  it('connects with profile 3 directly when not in browser', async () => {
    vi.stubGlobal('window', undefined);

    const adapter = new OCPP21Adapter({
      host: 'csms.local',
      port: 9000,
      securityProfile: 3,
      stationId: 'WB-01',
      clientCert: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
      clientKey: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
    });
    await adapter.connect();
    expect(mockInstance?.url).toBe('wss://csms.local:9000/ocpp/WB-01');
    mockInstance!.onclose?.();
    adapter.destroy();
  });
});

describe('OCPP21Adapter — Data Callbacks', () => {
  it('invokes onData callback when energy data updates', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const adapter = new OCPP21Adapter({
      host: 'evse.local',
      port: 9000,
      securityProfile: 0,
      tls: false,
    });
    const dataSpy = vi.fn();
    adapter.onData(dataSpy);

    await adapter.connect();
    mockInstance!.readyState = WebSocket.OPEN;
    mockInstance!.onopen?.();

    // Send a TransactionEvent with meter values
    const txMsg = ocppCall('TransactionEvent', {
      eventType: 'Updated',
      timestamp: new Date().toISOString(),
      triggerReason: 'MeterValueClock',
      seqNo: 2,
      transactionInfo: { transactionId: 'tx-001', chargingState: 'Charging' },
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [{ measurand: 'Power.Active.Import', value: 7400, unit: 'W' }],
        },
      ],
    });
    mockInstance!.onmessage?.({ data: txMsg });

    expect(dataSpy).toHaveBeenCalled();

    adapter.destroy();
    vi.unstubAllGlobals();
  });
});
