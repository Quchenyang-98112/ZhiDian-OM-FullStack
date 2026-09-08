/**
 * HeatPumpAdapter unit tests
 * Uses a mock modbus-serial client to avoid real network connections.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadHoldingRegisters = vi.fn();
const mockWriteRegister = vi.fn().mockResolvedValue(undefined);
const mockConnectTCP = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn((cb?: () => void) => cb?.());
const mockSetID = vi.fn();

vi.mock('modbus-serial', () => {
  return {
    default: class MockModbusRTU {
      setID = mockSetID;
      connectTCP = mockConnectTCP;
      readHoldingRegisters = mockReadHoldingRegisters;
      writeRegister = mockWriteRegister;
      close = mockClose;
    },
  };
});

import { HeatPumpAdapter } from './HeatPumpAdapter.js';

describe('HeatPumpAdapter', () => {
  let adapter: HeatPumpAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new HeatPumpAdapter({
      manufacturer: 'viessmann',
      host: '192.168.1.50',
      pollIntervalMs: 100,
    });
  });

  afterEach(async () => {
    await adapter.disconnect().catch(() => {});
  });

  it('connects via Modbus TCP with manufacturer default port', async () => {
    await adapter.connect();
    expect(mockConnectTCP).toHaveBeenCalledWith('192.168.1.50', { port: 4000 });
    expect(mockSetID).toHaveBeenCalledWith(1);
    const health = await adapter.healthCheck();
    expect(health.status).toBe('healthy');
  });

  it('rejects connect when TCP fails', async () => {
    mockConnectTCP.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(adapter.connect()).rejects.toThrow('ECONNREFUSED');
    const health = await adapter.healthCheck();
    expect(health.status).toBe('offline');
  });

  it('disconnect sets health to offline', async () => {
    await adapter.connect();
    await adapter.disconnect();
    const health = await adapter.healthCheck();
    expect(health.status).toBe('offline');
  });

  it('disconnect clears poll timer without hanging', async () => {
    mockReadHoldingRegisters.mockResolvedValue({ data: [0] });
    await adapter.connect();
    await adapter.disconnect();
    expect(mockClose).toHaveBeenCalled();
  });

  it('writes SG Ready mode for SET_HEAT_PUMP_MODE', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_HEAT_PUMP_MODE', value: 3 });
    expect(result.success).toBe(true);
    expect(mockWriteRegister).toHaveBeenCalledWith(5010, 3);
  });

  it('rejects invalid SET_HEAT_PUMP_MODE values', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_HEAT_PUMP_MODE', value: 0 });
    expect(result.success).toBe(false);
    expect(mockWriteRegister).not.toHaveBeenCalled();
  });

  it('maps SET_HEAT_PUMP_POWER to nearest SG Ready mode', async () => {
    await adapter.connect();
    const result = await adapter.sendCommand({ type: 'SET_HEAT_PUMP_POWER', value: 5000 });
    expect(result.success).toBe(true);
    expect(mockWriteRegister).toHaveBeenCalled();
  });
});
