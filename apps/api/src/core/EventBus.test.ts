/**
 * EventBus unit tests — buffer, flush cadence, backpressure, subscriber lifecycle.
 */

import type { UnifiedEnergyDatapoint } from '@nexus-hems/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from './EventBus.js';

function sampleDatapoint(value: number): UnifiedEnergyDatapoint {
  return {
    timestamp: Date.now(),
    deviceId: 'dev-1',
    protocol: 'modbus-sunspec',
    metric: 'POWER_W',
    value,
    qualityIndicator: 'GOOD',
    role: 'pv',
  };
}

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new EventBus();
  });

  afterEach(() => {
    bus.destroy();
    vi.useRealTimers();
  });

  it('buffers datapoints until the flush interval', () => {
    const batches: UnifiedEnergyDatapoint[][] = [];
    bus.subscribe('agg', {
      onBatch: (batch) => {
        batches.push(batch);
      },
    });

    bus.emit(sampleDatapoint(100));
    bus.emit(sampleDatapoint(200));
    expect(batches).toHaveLength(0);

    vi.advanceTimersByTime(500);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0]![0]!.value).toBe(100);
  });

  it('unsubscribe stops delivery', () => {
    const batches: number[] = [];
    bus.subscribe('agg', { onBatch: (b) => batches.push(b.length) });
    bus.unsubscribe('agg');

    bus.emit(sampleDatapoint(1));
    vi.advanceTimersByTime(500);
    expect(batches).toHaveLength(0);
  });

  it('reports stats including subscriber count', () => {
    bus.subscribe('a', { onBatch: () => {} });
    bus.subscribe('b', { onBatch: () => {} });
    bus.emit(sampleDatapoint(1));

    const stats = bus.getStats();
    expect(stats.subscribers).toBe(2);
    expect(stats.buffered).toBe(1);
    expect(stats.flushed).toBe(0);
  });

  it('increments dropped counter when buffer exceeds MAX_BUFFER_SIZE', () => {
    bus.subscribe('agg', { onBatch: () => {} });

    for (let i = 0; i < 1001; i++) {
      bus.emit(sampleDatapoint(i));
    }

    const stats = bus.getStats();
    expect(stats.dropped).toBeGreaterThanOrEqual(1);
    expect(stats.flushed).toBeGreaterThanOrEqual(1000);
  });

  it('destroy flushes remaining buffer synchronously', () => {
    const batches: UnifiedEnergyDatapoint[][] = [];
    bus.subscribe('agg', { onBatch: (b) => batches.push(b) });
    bus.emit(sampleDatapoint(42));

    bus.destroy();
    expect(batches).toHaveLength(1);
    expect(batches[0]![0]!.value).toBe(42);
    expect(bus.getStats().buffered).toBe(0);
  });

  it('isolates subscriber sync errors', () => {
    const ok: number[] = [];
    bus.subscribe('bad', {
      onBatch: () => {
        throw new Error('subscriber boom');
      },
    });
    bus.subscribe('good', {
      onBatch: (b) => ok.push(b.length),
    });

    bus.emit(sampleDatapoint(1));
    vi.advanceTimersByTime(500);
    expect(ok).toEqual([1]);
  });

  it('handles async subscriber rejections without crashing', async () => {
    bus.subscribe('async-bad', {
      onBatch: () => Promise.reject(new Error('async fail')),
    });
    bus.emit(sampleDatapoint(1));
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(bus.getStats().flushed).toBe(1);
  });
});
