/**
 * useServerWebSocket — opt-in backend WebSocket consumer.
 *
 * Covers connect/backoff, Zod validation of inbound frames, flat→nested merge,
 * the liveness watchdog, reconnection, and cleanup. The singleton store is
 * reset before each case; all adapter/db/store side-imports are mocked so the
 * store module imports cleanly (mirrors energy-store.test.ts).
 */

import type { EnergyData } from '@nexus-hems/shared-types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createMockAdapterClass(id: string, name: string) {
  return class {
    id = id;
    name = name;
    status = 'disconnected';
    capabilities = ['pv', 'battery', 'grid', 'load'];
    connect = vi.fn();
    disconnect = vi.fn();
    destroy = vi.fn();
    sendCommand = vi.fn();
    onData = vi.fn();
    onStatus = vi.fn();
  };
}

vi.mock('../core/adapters/VictronMQTTAdapter', () => ({
  VictronMQTTAdapter: createMockAdapterClass('victron-mqtt', 'Victron MQTT'),
}));
vi.mock('../core/adapters/ModbusSunSpecAdapter', () => ({
  ModbusSunSpecAdapter: createMockAdapterClass('modbus-sunspec', 'Modbus SunSpec'),
}));
vi.mock('../core/adapters/KNXAdapter', () => ({
  KNXAdapter: createMockAdapterClass('knx', 'KNX'),
}));
vi.mock('../core/adapters/OCPP21Adapter', () => ({
  OCPP21Adapter: createMockAdapterClass('ocpp-21', 'OCPP 2.1'),
}));
vi.mock('../core/adapters/EEBUSAdapter', () => ({
  EEBUSAdapter: createMockAdapterClass('eebus', 'EEBUS'),
}));
vi.mock('../lib/db', () => ({ persistSnapshot: vi.fn() }));
vi.mock('../store', () => ({
  useAppStore: Object.assign(
    vi.fn(() => vi.fn()),
    {
      getState: vi.fn(() => ({ setEnergyData: vi.fn(), setConnected: vi.fn() })),
    },
  ),
}));

import { useEnergyStoreBase, useServerWebSocket } from '../core/useEnergyStore';

// ─── MockWebSocket ────────────────────────────────────────────────────
let mockInstance: MockWebSocket | null = null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static constructorUrl = '';
  readyState: number = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  });
  constructor(url: string) {
    MockWebSocket.constructorUrl = url;
    mockInstance = this;
  }
}

const validData: EnergyData = {
  gridPower: 1200,
  pvPower: 3400,
  batteryPower: -800,
  houseLoad: 2600,
  batterySoC: 72,
  heatPumpPower: 900,
  evPower: 1100,
  gridVoltage: 230,
  batteryVoltage: 51.2,
  pvYieldToday: 18.5,
  priceCurrent: 0.284,
};

function resetStore(): void {
  useEnergyStoreBase.setState({
    unified: {
      timestamp: 0,
      pv: { totalPowerW: 0, yieldTodayKWh: 0 },
      battery: { powerW: 0, socPercent: 0, voltageV: 51.2, currentA: 0 },
      grid: { powerW: 0, voltageV: 230 },
      load: { totalPowerW: 0, heatPumpPowerW: 0, evPowerW: 0, otherPowerW: 0 },
    },
    serverWsConnected: false,
    lastUpdated: null,
  });
}

describe('useServerWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInstance = null;
    vi.stubGlobal('WebSocket', MockWebSocket);
    resetStore();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not open a socket when disabled', () => {
    renderHook(() => useServerWebSocket(false));
    expect(mockInstance).toBeNull();
  });

  it('opens a socket and marks serverWsConnected on open', () => {
    renderHook(() => useServerWebSocket(true));
    expect(mockInstance).not.toBeNull();
    expect(MockWebSocket.constructorUrl).toMatch(/^wss?:\/\//);

    act(() => {
      mockInstance!.readyState = MockWebSocket.OPEN;
      mockInstance!.onopen?.();
    });
    expect(useEnergyStoreBase.getState().serverWsConnected).toBe(true);
  });

  it('validates + merges a well-formed ENERGY_UPDATE frame', () => {
    renderHook(() => useServerWebSocket(true));
    act(() => mockInstance!.onopen?.());

    act(() => {
      mockInstance!.onmessage?.({
        data: JSON.stringify({ type: 'ENERGY_UPDATE', data: validData }),
      });
    });
    // mergeData is throttled to 250 ms — flush it.
    act(() => vi.advanceTimersByTime(300));

    const { unified } = useEnergyStoreBase.getState();
    expect(unified.pv.totalPowerW).toBe(3400);
    expect(unified.grid.powerW).toBe(1200);
    expect(unified.load.heatPumpPowerW).toBe(900);
  });

  it('drops a frame that fails schema validation (no merge)', () => {
    renderHook(() => useServerWebSocket(true));
    act(() => mockInstance!.onopen?.());

    act(() => {
      mockInstance!.onmessage?.({
        data: JSON.stringify({ type: 'ENERGY_UPDATE', data: { pvPower: 'not-a-number' } }),
      });
    });
    act(() => vi.advanceTimersByTime(300));

    expect(useEnergyStoreBase.getState().unified.pv.totalPowerW).toBe(0);
  });

  it('ignores a non-JSON frame without throwing', () => {
    renderHook(() => useServerWebSocket(true));
    act(() => mockInstance!.onopen?.());

    expect(() => {
      act(() => mockInstance!.onmessage?.({ data: 'definitely-not-json{' }));
    }).not.toThrow();
    act(() => vi.advanceTimersByTime(300));
    expect(useEnergyStoreBase.getState().unified.pv.totalPowerW).toBe(0);
  });

  it('force-closes a stalled socket via the liveness watchdog', () => {
    renderHook(() => useServerWebSocket(true));
    const socket = mockInstance!;
    act(() => socket.onopen?.());

    // No message arrives → watchdog (6 s) should close the socket.
    act(() => vi.advanceTimersByTime(6_100));
    expect(socket.close).toHaveBeenCalled();
    expect(useEnergyStoreBase.getState().serverWsConnected).toBe(false);
  });

  it('reconnects after the socket closes', () => {
    renderHook(() => useServerWebSocket(true));
    const first = mockInstance!;
    act(() => first.onopen?.());

    act(() => first.onclose?.());
    expect(useEnergyStoreBase.getState().serverWsConnected).toBe(false);

    // Backoff schedules a reconnect within ~1.25 s.
    act(() => vi.advanceTimersByTime(1_300));
    expect(mockInstance).not.toBe(first);
  });

  it('closes the socket and resets state on unmount', () => {
    const { unmount } = renderHook(() => useServerWebSocket(true));
    const socket = mockInstance!;
    act(() => socket.onopen?.());
    expect(useEnergyStoreBase.getState().serverWsConnected).toBe(true);

    act(() => unmount());
    expect(socket.close).toHaveBeenCalled();
    expect(useEnergyStoreBase.getState().serverWsConnected).toBe(false);
  });
});
