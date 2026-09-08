/**
 * ModbusAdapter unit tests
 * Tests use a mock modbus-serial client to avoid real network connections.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock modbus-serial before importing the adapter
// ---------------------------------------------------------------------------

const mockReadHoldingRegisters = vi.fn();
const mockConnectTCP = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn((cb?: () => void) => cb?.());
const mockSetID = vi.fn();
const mockSetTimeout = vi.fn();

vi.mock('modbus-serial', () => {
  return {
    default: class MockModbusRTU {
      setID = mockSetID;
      setTimeout = mockSetTimeout;
      connectTCP = mockConnectTCP;
      readHoldingRegisters = mockReadHoldingRegisters;
      close = mockClose;
    },
  };
});

import { type DeviceConfig, ModbusAdapter } from '../modbus/ModbusAdapter.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const testDevice: DeviceConfig = {
  deviceId: 'test-inverter-01',
  label: 'Test Inverter',
  host: '192.168.1.100',
  port: 502,
  protocol: 'modbus-sunspec',
  unitId: 1,
  pollIntervalMs: 100,
  inverterMaxWatts: 5000,
  registers: [
    {
      address: 40083,
      metric: 'POWER_W',
      scale: 1,
      unit: 'W',
      dataType: 'INT16',
      byteOrder: 'BE',
      label: 'AC Power',
    },
    {
      address: 840,
      metric: 'SOC_PERCENT',
      scale: 0.1,
      unit: '%',
      dataType: 'UINT16',
      byteOrder: 'BE',
      label: 'Battery SoC',
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModbusAdapter', () => {
  let adapter: ModbusAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ModbusAdapter(testDevice);
  });

  afterEach(async () => {
    await adapter.disconnect().catch(() => {
      /* ignore */
    });
  });

  it('has the correct id and protocol', () => {
    expect(adapter.id).toBe('test-inverter-01');
    expect(adapter.protocol).toBe('modbus-sunspec');
  });

  it('reports offline health before connect', async () => {
    const health = await adapter.healthCheck();
    expect(health.status).toBe('offline');
  });

  it('connects via TCP and reports healthy', async () => {
    await adapter.connect();
    const health = await adapter.healthCheck();
    expect(health.status).toBe('healthy');
    expect(mockConnectTCP).toHaveBeenCalledWith('192.168.1.100', { port: 502 });
  });

  it('reads INT16 register and applies scale 1', async () => {
    await adapter.connect();

    // Mock returns buffer with INT16 value 3450
    const buf = Buffer.alloc(2);
    buf.writeInt16BE(3450, 0);
    mockReadHoldingRegisters.mockResolvedValueOnce({ buffer: buf });

    const stream = adapter.getDataStream();
    const dp = await stream.next();

    await adapter.disconnect();

    expect(dp.done).toBe(false);
    expect(dp.value?.metric).toBe('POWER_W');
    expect(dp.value?.value).toBe(3450);
    expect(dp.value?.qualityIndicator).toBe('GOOD');
    expect(dp.value?.deviceId).toBe('test-inverter-01');
  });

  it('reads UINT16 register and applies scale 0.1 for SoC', async () => {
    await adapter.connect();

    // SoC register: 0.1 scale, value 850 → 85%
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(850, 0);
    // First call is for POWER_W (INT16), second for SOC_PERCENT (UINT16)
    const powerBuf = Buffer.alloc(2);
    powerBuf.writeInt16BE(0, 0);
    mockReadHoldingRegisters
      .mockResolvedValueOnce({ buffer: powerBuf })
      .mockResolvedValueOnce({ buffer: buf });

    const stream = adapter.getDataStream();
    // Skip the POWER_W datapoint
    await stream.next();
    const soc = await stream.next();
    await adapter.disconnect();

    expect(soc.value?.metric).toBe('SOC_PERCENT');
    expect(soc.value?.value).toBeCloseTo(85, 1);
  });

  it('disconnects cleanly', async () => {
    await adapter.connect();
    await adapter.disconnect();
    expect(mockClose).toHaveBeenCalled();
  });
});
