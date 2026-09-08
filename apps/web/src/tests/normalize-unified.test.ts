/**
 * normalizeToUnified — 100% branch coverage tests
 *
 * Tests for VictronMQTTAdapter.legacyToUnifiedModel() and emitCurrentModel()
 * (data normalization from Venus OS MQTT → UnifiedEnergyModel), and
 * OCPP21Adapter data normalization (StatusNotification, TransactionEvent,
 * MeterValues → EVChargerData).
 *
 * Uses the VictronSimulator and OCPPMockServer HiL mocks.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdapterDataCallback,
  AdapterStatusCallback,
  UnifiedEnergyModel,
} from '../core/adapters/EnergyAdapter';
import { OCPPMockServer } from './mocks/ocpp-mock-server';
import { VictronSimulator } from './mocks/victron-simulator';

vi.mock('../lib/secure-store', () => ({
  mergeCredentialsIntoConfig: vi.fn(async (_id: string, config: Record<string, unknown>) => config),
}));

const OCPP_TEST_CONFIG = { host: 'localhost', port: 9000, securityProfile: 0 as const, tls: false };

// ─── Victron normalizeToUnified (Legacy Mode) ────────────────────────

// Cold Victron module transform/import can exceed default hook timeout on CI.
const LEGACY_NORMALIZE_HOOK_MS = 30_000;

describe('VictronMQTTAdapter — normalizeToUnified (Legacy)', () => {
  // Hoist module import into beforeAll so the first dynamic load happens outside
  // the per-test 5000ms timeout window. All tests share the cached module.
  let VictronMQTTAdapter: Awaited<
    typeof import('../core/adapters/VictronMQTTAdapter')
  >['VictronMQTTAdapter'];

  beforeAll(async () => {
    ({ VictronMQTTAdapter } = await import('../core/adapters/VictronMQTTAdapter'));
  }, LEGACY_NORMALIZE_HOOK_MS);

  let sim: VictronSimulator;

  beforeEach(() => {
    sim = new VictronSimulator();
    sim.start();
  });

  afterEach(() => {
    sim.stop();
  });

  it('should normalize full ENERGY_UPDATE to UnifiedEnergyModel', async () => {
    // VictronMQTTAdapter pre-loaded in beforeAll
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    sim.setPV(4200, 18.5);
    sim.setBattery(-1200, 78, 52.4);
    sim.setGrid(350, 232);
    sim.publishLegacyUpdate();

    expect(dataCb).toHaveBeenCalled();
    const model = (dataCb as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Partial<UnifiedEnergyModel>;

    // PV
    expect(model.pv?.totalPowerW).toBe(4200);
    expect(model.pv?.yieldTodayKWh).toBe(18.5);

    // Battery
    expect(model.battery?.powerW).toBe(-1200);
    expect(model.battery?.socPercent).toBe(78);
    expect(model.battery?.voltageV).toBe(52.4);
    // currentA = batteryPower / batteryVoltage
    expect(model.battery?.currentA).toBeCloseTo(-1200 / 52.4, 1);

    // Grid
    expect(model.grid?.powerW).toBe(350);
    expect(model.grid?.voltageV).toBe(232);

    // Load
    expect(model.load?.totalPowerW).toBeGreaterThan(0);

    // Tariff
    expect(model.tariff?.currentPriceEurKWh).toBe(0.28);
    expect(model.tariff?.provider).toBe('tibber');

    // Timestamp
    expect(model.timestamp).toBeGreaterThan(0);

    adapter.destroy();
  });

  it('should handle all-zero values gracefully', async () => {
    // VictronMQTTAdapter pre-loaded in beforeAll
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    // Publish with zero state
    sim.publishLegacyUpdate();

    const model = (dataCb as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Partial<UnifiedEnergyModel>;

    expect(model.pv?.totalPowerW).toBe(0);
    expect(model.pv?.yieldTodayKWh).toBe(0);
    expect(model.battery?.powerW).toBe(0);
    expect(model.battery?.socPercent).toBe(50); // default from simulator
    expect(model.grid?.powerW).toBe(0);
    expect(model.load?.totalPowerW).toBe(0);
    expect(model.load?.otherPowerW).toBe(0);

    adapter.destroy();
  });

  it('should handle missing optional fields (null/undefined)', async () => {
    // VictronMQTTAdapter pre-loaded in beforeAll
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    // Send partial message with only pvPower
    sim.ws!.onmessage!({
      data: JSON.stringify({
        type: 'ENERGY_UPDATE',
        data: { pvPower: 1234 },
      }),
    });

    const model = (dataCb as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Partial<UnifiedEnergyModel>;

    expect(model.pv?.totalPowerW).toBe(1234);
    expect(model.pv?.yieldTodayKWh).toBe(0); // default
    expect(model.battery?.powerW).toBe(0);
    expect(model.battery?.voltageV).toBe(51.2); // fallback default
    expect(model.grid?.voltageV).toBe(230); // fallback default
    // No tariff when priceCurrent is undefined
    expect(model.tariff).toBeUndefined();

    adapter.destroy();
  });

  it('should calculate otherPowerW = houseLoad - heatPump - ev', async () => {
    // VictronMQTTAdapter pre-loaded in beforeAll
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    sim.ws!.onmessage!({
      data: JSON.stringify({
        type: 'ENERGY_UPDATE',
        data: {
          houseLoad: 5000,
          heatPumpPower: 2000,
          evPower: 1500,
        },
      }),
    });

    const model = (dataCb as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Partial<UnifiedEnergyModel>;

    expect(model.load?.totalPowerW).toBe(5000);
    expect(model.load?.heatPumpPowerW).toBe(2000);
    expect(model.load?.evPowerW).toBe(1500);
    expect(model.load?.otherPowerW).toBe(1500); // 5000 - 2000 - 1500

    adapter.destroy();
  });

  it('should clamp otherPowerW to 0 when negative', async () => {
    // VictronMQTTAdapter pre-loaded in beforeAll
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    // heatPump + ev > houseLoad → otherPower should be 0
    sim.ws!.onmessage!({
      data: JSON.stringify({
        type: 'ENERGY_UPDATE',
        data: {
          houseLoad: 3000,
          heatPumpPower: 2000,
          evPower: 2000,
        },
      }),
    });

    const model = (dataCb as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Partial<UnifiedEnergyModel>;

    expect(model.load?.otherPowerW).toBe(0); // Max(0, 3000-2000-2000)

    adapter.destroy();
  });

  it('should calculate currentA from power/voltage with fallback', async () => {
    // VictronMQTTAdapter pre-loaded in beforeAll
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    // batteryVoltage = 0 → should use 51.2 fallback
    sim.ws!.onmessage!({
      data: JSON.stringify({
        type: 'ENERGY_UPDATE',
        data: {
          batteryPower: 500,
          batteryVoltage: 0,
        },
      }),
    });

    const model = (dataCb as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Partial<UnifiedEnergyModel>;

    // With voltage=0, fallback is 51.2: currentA = 500 / 51.2
    expect(model.battery?.currentA).toBeCloseTo(500 / 51.2, 1);

    adapter.destroy();
  });

  it('should include priceCurrent tariff when provided', async () => {
    // VictronMQTTAdapter pre-loaded in beforeAll
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    sim.ws!.onmessage!({
      data: JSON.stringify({
        type: 'ENERGY_UPDATE',
        data: { priceCurrent: 0.35 },
      }),
    });

    const model = (dataCb as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Partial<UnifiedEnergyModel>;

    expect(model.tariff?.currentPriceEurKWh).toBe(0.35);
    expect(model.tariff?.provider).toBe('tibber');

    adapter.destroy();
  });

  it('should ignore non-ENERGY_UPDATE messages', async () => {
    // VictronMQTTAdapter pre-loaded in beforeAll
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    sim.ws!.onmessage!({
      data: JSON.stringify({ type: 'UNKNOWN_TYPE', data: {} }),
    });

    expect(dataCb).not.toHaveBeenCalled();

    adapter.destroy();
  });

  it('should handle malformed JSON gracefully', async () => {
    // VictronMQTTAdapter pre-loaded in beforeAll
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    // Should not throw
    sim.ws!.onmessage!({ data: 'not-json{{{' });

    expect(dataCb).not.toHaveBeenCalled();

    adapter.destroy();
  });

  it('should update snapshot on data emission', async () => {
    // VictronMQTTAdapter pre-loaded in beforeAll
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    adapter.onData(() => {});

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    sim.ws!.onmessage!({
      data: JSON.stringify({
        type: 'ENERGY_UPDATE',
        data: { pvPower: 9999 },
      }),
    });

    const snapshot = adapter.getSnapshot();
    expect(snapshot.pv?.totalPowerW).toBe(9999);

    adapter.destroy();
  });

  it('should transition status: connecting → connected → disconnected', async () => {
    // VictronMQTTAdapter pre-loaded in beforeAll
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const statusCb = vi.fn() as unknown as AdapterStatusCallback;
    adapter.onStatus(statusCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    expect(statusCb).toHaveBeenCalledWith('connecting', undefined);
    expect(statusCb).toHaveBeenCalledWith('connected', undefined);

    adapter.destroy();
  });
});

// ─── OCPP normalizeToUnified ─────────────────────────────────────────

describe('OCPP21Adapter — normalizeToUnified', () => {
  let OCPP21Adapter: Awaited<typeof import('../core/adapters/OCPP21Adapter')>['OCPP21Adapter'];

  beforeAll(async () => {
    ({ OCPP21Adapter } = await import('../core/adapters/OCPP21Adapter'));
  });

  let server: OCPPMockServer;

  beforeEach(() => {
    server = new OCPPMockServer();
    server.start();
  });

  afterEach(() => {
    server.stop();
  });

  it('should normalize StatusNotification → EVChargerData', async () => {
    // OCPP21Adapter pre-loaded in beforeAll
    const adapter = new OCPP21Adapter(OCPP_TEST_CONFIG);

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    // Simulate plug-in
    server.simulatePlugIn();

    expect(dataCb).toHaveBeenCalled();
    const model = (dataCb as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Partial<UnifiedEnergyModel>;

    expect(model.evCharger?.status).toBe('charging'); // Occupied → charging
    expect(model.evCharger?.vehicleConnected).toBe(true);

    adapter.destroy();
  });

  it('should normalize TransactionEvent Started with meter values', async () => {
    // OCPP21Adapter pre-loaded in beforeAll
    const adapter = new OCPP21Adapter(OCPP_TEST_CONFIG);

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    server.simulateChargingStart({
      powerW: 11000,
      energyKWh: 0,
      soc: 25,
      currentA: 16,
      voltageV: 400,
    });

    const calls = (dataCb as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const lastModel = calls[calls.length - 1][0] as Partial<UnifiedEnergyModel>;

    expect(lastModel.evCharger?.powerW).toBe(11000);
    expect(lastModel.evCharger?.energySessionKWh).toBe(0);
    expect(lastModel.evCharger?.socPercent).toBe(25);
    expect(lastModel.evCharger?.currentA).toBe(16);
    expect(lastModel.evCharger?.voltageV).toBe(400);
    expect(lastModel.evCharger?.vehicleConnected).toBe(true);

    adapter.destroy();
  });

  it('should normalize TransactionEvent Updated with incremental energy', async () => {
    // OCPP21Adapter pre-loaded in beforeAll
    const adapter = new OCPP21Adapter(OCPP_TEST_CONFIG);

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    server.simulateChargingStart({ powerW: 7400 });
    server.simulateChargingUpdate({
      powerW: 7400,
      energyKWh: 5.2,
      soc: 42,
    });

    const calls = (dataCb as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const lastModel = calls[calls.length - 1][0] as Partial<UnifiedEnergyModel>;

    expect(lastModel.evCharger?.powerW).toBe(7400);
    expect(lastModel.evCharger?.energySessionKWh).toBe(5.2);
    expect(lastModel.evCharger?.socPercent).toBe(42);

    adapter.destroy();
  });

  it('should normalize TransactionEvent Ended → zero power', async () => {
    // OCPP21Adapter pre-loaded in beforeAll
    const adapter = new OCPP21Adapter(OCPP_TEST_CONFIG);

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    server.simulateChargingStart({ powerW: 11000 });
    server.simulateChargingEnd(15.5);

    const calls = (dataCb as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const lastModel = calls[calls.length - 1][0] as Partial<UnifiedEnergyModel>;

    expect(lastModel.evCharger?.powerW).toBe(0);
    expect(lastModel.evCharger?.currentA).toBeUndefined(); // 0 → undefined

    adapter.destroy();
  });

  it('should normalize MeterValues independently', async () => {
    // OCPP21Adapter pre-loaded in beforeAll
    const adapter = new OCPP21Adapter(OCPP_TEST_CONFIG);

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    server.simulateMeterValues({ powerW: 3700 });

    const calls = (dataCb as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const lastModel = calls[calls.length - 1][0] as Partial<UnifiedEnergyModel>;

    expect(lastModel.evCharger?.powerW).toBe(3700);

    adapter.destroy();
  });

  it('should map all OCPP connector statuses correctly', async () => {
    // OCPP21Adapter pre-loaded in beforeAll
    const adapter = new OCPP21Adapter(OCPP_TEST_CONFIG);

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    const statusMap: [string, string][] = [
      ['Available', 'available'],
      ['Occupied', 'charging'],
      ['Reserved', 'preparing'],
      ['Unavailable', 'suspended'],
      ['Faulted', 'faulted'],
    ];

    for (const [ocppStatus, expectedStatus] of statusMap) {
      server.sendCall('StatusNotification', {
        timestamp: new Date().toISOString(),
        connectorStatus: ocppStatus,
        evseId: 1,
        connectorId: 1,
      });

      const calls = (dataCb as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const lastModel = calls[calls.length - 1][0] as Partial<UnifiedEnergyModel>;
      expect(lastModel.evCharger?.status).toBe(expectedStatus);
    }

    adapter.destroy();
  });

  it('should handle Heartbeat response', async () => {
    // OCPP21Adapter pre-loaded in beforeAll
    const adapter = new OCPP21Adapter(OCPP_TEST_CONFIG);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    // Heartbeat should not throw
    server.simulateHeartbeat();

    // Adapter should send time response
    const sendCalls = (server.ws!.send as ReturnType<typeof vi.fn>).mock.calls;
    // CallResult for heartbeat should be present
    const responses = sendCalls
      .map((c: unknown[]) => JSON.parse(c[0] as string))
      .filter((m: unknown[]) => m[0] === 3); // CALLRESULT
    expect(responses.length).toBeGreaterThan(0);

    adapter.destroy();
  });

  it('should handle Authorize with auto-accept', async () => {
    // OCPP21Adapter pre-loaded in beforeAll
    const adapter = new OCPP21Adapter(OCPP_TEST_CONFIG);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    server.sendCall('Authorize', {
      idToken: { idToken: 'test-token', type: 'Central' },
    });

    const sendCalls = (server.ws!.send as ReturnType<typeof vi.fn>).mock.calls;
    const responses = sendCalls
      .map((c: unknown[]) => JSON.parse(c[0] as string))
      .filter((m: unknown[]) => m[0] === 3);

    // Find authorize response
    const authResponse = responses.find(
      (m: unknown[]) =>
        m[2] && typeof m[2] === 'object' && (m[2] as Record<string, unknown>).idTokenInfo,
    );
    expect(authResponse).toBeDefined();

    adapter.destroy();
  });

  it('should respond NotImplemented for unknown actions', async () => {
    // OCPP21Adapter pre-loaded in beforeAll
    const adapter = new OCPP21Adapter(OCPP_TEST_CONFIG);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    server.sendCall('UnknownAction', { foo: 'bar' });

    const sendCalls = (server.ws!.send as ReturnType<typeof vi.fn>).mock.calls;
    const errors = sendCalls
      .map((c: unknown[]) => JSON.parse(c[0] as string))
      .filter((m: unknown[]) => m[0] === 4); // CALLERROR

    expect(errors.length).toBeGreaterThan(0);

    adapter.destroy();
  });

  it('should return correct snapshot', async () => {
    // OCPP21Adapter pre-loaded in beforeAll
    const adapter = new OCPP21Adapter(OCPP_TEST_CONFIG);

    adapter.onData(() => {});

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    server.simulatePlugIn();
    server.simulateChargingStart({ powerW: 22000, soc: 30 });

    const snapshot = adapter.getSnapshot();
    expect(snapshot.evCharger).toBeDefined();
    expect(snapshot.evCharger?.powerW).toBe(22000);
    expect(snapshot.evCharger?.socPercent).toBe(30);

    adapter.destroy();
  });

  it('should handle full charging session lifecycle', async () => {
    // OCPP21Adapter pre-loaded in beforeAll
    const adapter = new OCPP21Adapter(OCPP_TEST_CONFIG);

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    // Full session: plug-in → start → update → end → plug-out
    await server.simulateFullSession({ powerW: 11000, energyKWh: 12.5, soc: 80 });

    const calls = (dataCb as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(4); // At least: plug-in, start, update, end, plug-out

    // Final state should be available (after plug-out)
    const lastModel = calls[calls.length - 1][0] as Partial<UnifiedEnergyModel>;
    expect(lastModel.evCharger?.status).toBe('available');

    adapter.destroy();
  });
});
