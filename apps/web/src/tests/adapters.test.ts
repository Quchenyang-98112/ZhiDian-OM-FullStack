import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EEBUSAdapter } from '../core/adapters/EEBUSAdapter';
import type {
  AdapterDataCallback,
  AdapterStatusCallback,
  EnergyAdapter,
  UnifiedEnergyModel,
} from '../core/adapters/EnergyAdapter';

// ────────────────────────────────────────────────────────────────────
// Test the adapter interface contract using the EEBUSAdapter (simplest)
// and mock-based tests for the VictronMQTTAdapter WebSocket flow.
// ────────────────────────────────────────────────────────────────────

describe('EnergyAdapter Interface (EEBUSAdapter stub)', () => {
  let adapter: EnergyAdapter;

  beforeEach(() => {
    adapter = new EEBUSAdapter({ host: 'eebus.local', port: 4712, mock: true });
  });

  it('should have correct id and name', () => {
    expect(adapter.id).toBe('eebus');
    expect(adapter.name).toContain('EEBUS');
  });

  it('should have capabilities', () => {
    expect(adapter.capabilities).toContain('evCharger');
    expect(adapter.capabilities).toContain('load');
  });

  it('should start disconnected', () => {
    expect(adapter.status).toBe('disconnected');
  });

  it('should transition to connected in mock mode when connect is called', async () => {
    await adapter.connect();
    expect(adapter.status).toBe('connected');
  });

  it('should return empty snapshot', () => {
    const snapshot = adapter.getSnapshot();
    expect(snapshot).toEqual({});
  });

  it('should reject commands', async () => {
    const result = await adapter.sendCommand({ type: 'START_CHARGING', value: 1 });
    expect(result).toBe(false);
  });

  it('should destroy without errors', () => {
    expect(() => adapter.destroy()).not.toThrow();
  });
});

describe('VictronMQTTAdapter (without real WebSocket)', () => {
  // We test the adapter logic by mocking WebSocket at the global level
  let mockWsSend: ReturnType<typeof vi.fn>;
  let mockWsClose: ReturnType<typeof vi.fn>;
  let onMessageCallback: ((event: { data: string }) => void) | null = null;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    mockWsSend = vi.fn();
    mockWsClose = vi.fn();
    onMessageCallback = null;

    // Mock WebSocket globally
    vi.stubGlobal(
      'WebSocket',
      class MockWebSocket {
        static OPEN = 1;
        readyState = 1;
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        onerror: (() => void) | null = null;

        constructor() {
          setTimeout(() => {
            onMessageCallback = this.onmessage;
            this.onopen?.();
          }, 0);
        }

        send = mockWsSend;
        close = mockWsClose;
      },
    );
  });

  it('should connect and emit connected status', async () => {
    const { VictronMQTTAdapter } = await import('../core/adapters/VictronMQTTAdapter');
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const statusCb = vi.fn() as unknown as AdapterStatusCallback;
    adapter.onStatus(statusCb);

    await adapter.connect();

    // Wait for async WebSocket mock
    await new Promise((r) => setTimeout(r, 10));

    expect(statusCb).toHaveBeenCalledWith('connecting', undefined);
    expect(statusCb).toHaveBeenCalledWith('connected', undefined);
    expect(adapter.status).toBe('connected');

    adapter.destroy();
  });

  it('should parse ENERGY_UPDATE messages into UnifiedEnergyModel', async () => {
    const { VictronMQTTAdapter } = await import('../core/adapters/VictronMQTTAdapter');
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    const dataCb = vi.fn() as unknown as AdapterDataCallback;
    adapter.onData(dataCb);

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    // Simulate ENERGY_UPDATE message
    const message = {
      type: 'ENERGY_UPDATE',
      data: {
        gridPower: 500,
        pvPower: 3500,
        batteryPower: -1000,
        houseLoad: 2000,
        batterySoC: 85,
        evPower: 7400,
        heatPumpPower: 1200,
        gridVoltage: 232,
        batteryVoltage: 52.1,
        pvYieldToday: 12.5,
        priceCurrent: 0.22,
      },
    };

    onMessageCallback?.({ data: JSON.stringify(message) });

    expect(dataCb).toHaveBeenCalledTimes(1);
    const model = (dataCb as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Partial<UnifiedEnergyModel>;

    expect(model.pv?.totalPowerW).toBe(3500);
    expect(model.pv?.yieldTodayKWh).toBe(12.5);
    expect(model.battery?.powerW).toBe(-1000);
    expect(model.battery?.socPercent).toBe(85);
    expect(model.grid?.powerW).toBe(500);
    expect(model.grid?.voltageV).toBe(232);
    expect(model.load?.totalPowerW).toBe(2000);
    expect(model.load?.evPowerW).toBe(7400);
    expect(model.load?.heatPumpPowerW).toBe(1200);
    expect(model.tariff?.currentPriceEurKWh).toBe(0.22);

    adapter.destroy();
  });

  it('should return snapshot of last received data', async () => {
    const { VictronMQTTAdapter } = await import('../core/adapters/VictronMQTTAdapter');
    const adapter = new VictronMQTTAdapter({
      host: 'localhost',
      port: 8080,
      mode: 'websocket-legacy',
    });

    adapter.onData(() => {}); // register listener

    await adapter.connect();
    await new Promise((r) => setTimeout(r, 10));

    onMessageCallback?.({
      data: JSON.stringify({
        type: 'ENERGY_UPDATE',
        data: { pvPower: 1234 },
      }),
    });

    const snapshot = adapter.getSnapshot();
    expect(snapshot.pv?.totalPowerW).toBe(1234);

    adapter.destroy();
  });
});

describe('Adapter capabilities', () => {
  it('VictronMQTTAdapter should cover pv, battery, grid, load', async () => {
    const { VictronMQTTAdapter } = await import('../core/adapters/VictronMQTTAdapter');
    const adapter = new VictronMQTTAdapter();
    expect(adapter.capabilities).toEqual(['pv', 'battery', 'grid', 'load']);
  });

  it('ModbusSunSpecAdapter should cover pv, battery, grid', async () => {
    const { ModbusSunSpecAdapter } = await import('../core/adapters/ModbusSunSpecAdapter');
    const adapter = new ModbusSunSpecAdapter({ host: 'modbus.local', port: 502 });
    expect(adapter.capabilities).toEqual(['pv', 'battery', 'grid']);
  });

  it('KNXAdapter should cover knx', async () => {
    const { KNXAdapter } = await import('../core/adapters/KNXAdapter');
    const adapter = new KNXAdapter({ host: 'knxd.local', port: 3671 });
    expect(adapter.capabilities).toEqual(['knx']);
  });

  it('OCPP21Adapter should cover evCharger', async () => {
    const { OCPP21Adapter } = await import('../core/adapters/OCPP21Adapter');
    const adapter = new OCPP21Adapter({ securityProfile: 0, tls: false });
    expect(adapter.capabilities).toEqual(['evCharger']);
  });

  it('EEBUSAdapter should cover evCharger, load', async () => {
    const { EEBUSAdapter } = await import('../core/adapters/EEBUSAdapter');
    const adapter = new EEBUSAdapter({ host: 'eebus.local', port: 4712 });
    expect(adapter.capabilities).toEqual(['evCharger', 'load', 'grid']);
  });
});
