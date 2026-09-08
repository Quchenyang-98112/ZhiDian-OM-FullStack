import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModbusSunSpecAdapter } from '../core/adapters/ModbusSunSpecAdapter';
import { useAdapterWorker } from '../core/useAdapterWorker';

const mocks = vi.hoisted(() => ({
  mergeData: vi.fn(),
  setAdapterStatus: vi.fn(),
  setConnected: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  recordAdapterError: vi.fn(),
  recordAdapterStatus: vi.fn(),
}));

let testAdapter: ModbusSunSpecAdapter;

vi.mock('../core/useEnergyStore', () => ({
  useEnergyStoreBase: {
    getState: () => ({
      mergeData: mocks.mergeData,
      setAdapterStatus: mocks.setAdapterStatus,
      get adapters() {
        return { 'modbus-sunspec': { adapter: testAdapter } };
      },
    }),
  },
}));

vi.mock('../store', () => ({
  useAppStore: {
    getState: () => ({ setConnected: mocks.setConnected }),
  },
}));

vi.mock('../lib/metrics', () => ({
  metricsCollector: {
    recordAdapterError: mocks.recordAdapterError,
    recordAdapterStatus: mocks.recordAdapterStatus,
  },
}));

class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    MockWorker.instances.push(this);
  }
}

describe('useAdapterWorker', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    testAdapter = new ModbusSunSpecAdapter({ host: '127.0.0.1' });
    vi.spyOn(testAdapter.circuitBreaker, 'recordSuccess').mockImplementation(mocks.recordSuccess);
    vi.spyOn(testAdapter.circuitBreaker, 'recordFailure').mockImplementation(mocks.recordFailure);
    mocks.mergeData.mockReset();
    mocks.setAdapterStatus.mockReset();
    mocks.setConnected.mockReset();
    mocks.recordSuccess.mockReset();
    mocks.recordFailure.mockReset();
    mocks.recordAdapterError.mockReset();
    mocks.recordAdapterStatus.mockReset();
    vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts polling with normalized targets and routes worker messages to the store', () => {
    const { result, unmount } = renderHook(() => useAdapterWorker());
    const worker = MockWorker.instances[0];
    expect(worker).toBeDefined();

    act(() => {
      result.current.startPolling('modbus-sunspec', 'http://192.168.1.50/api/modbus/sunspec');
      result.current.transform('modbus-sunspec', '{"W":1000}', 'sunspec-inverter');
      result.current.stopPolling('modbus-sunspec');
      result.current.stopAll();
    });

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'poll',
        adapterId: 'modbus-sunspec',
        target: expect.objectContaining({ host: '192.168.1.50' }),
      }),
    );
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transform', adapterId: 'modbus-sunspec' }),
    );
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stop', adapterId: 'modbus-sunspec' });
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stopAll' });

    act(() => {
      worker.onmessage?.({
        data: { type: 'data', adapterId: 'modbus-sunspec', result: { totalPowerW: 1200 } },
      } as MessageEvent);
      worker.onmessage?.({
        data: { type: 'error', adapterId: 'modbus-sunspec', error: 'HTTP 500' },
      } as MessageEvent);
      worker.onmessage?.({
        data: { type: 'latency', adapterId: 'modbus-sunspec', ms: 42 },
      } as MessageEvent);
    });

    expect(mocks.mergeData).toHaveBeenCalledWith('modbus-sunspec', { totalPowerW: 1200 });
    expect(mocks.setAdapterStatus).toHaveBeenCalledWith('modbus-sunspec', 'connected');
    expect(mocks.recordSuccess).toHaveBeenCalled();
    expect(mocks.recordAdapterError).toHaveBeenCalledWith('modbus-sunspec', 'HTTP 500');
    expect(mocks.recordFailure).toHaveBeenCalled();
    expect(mocks.setAdapterStatus).toHaveBeenCalledWith('modbus-sunspec', 'error', 'HTTP 500');
    expect(mocks.recordAdapterStatus).toHaveBeenCalledWith(
      'modbus-sunspec',
      'modbus-sunspec',
      true,
      42,
    );

    unmount();
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('ignores invalid poll targets and sends stop for the adapter id', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useAdapterWorker());
    const worker = MockWorker.instances[0];

    act(() => {
      result.current.startPolling('modbus-sunspec', 'ftp://192.168.1.50/forbidden');
    });

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stop', adapterId: 'modbus-sunspec' });
    warnSpy.mockRestore();
  });
});
