/**
 * chart-sampling.test.ts — Unit tests for LTTB chart downsampling
 */

import { describe, expect, it } from 'vitest';
import { lttbSample, sampleIfNeeded } from '../lib/chart-sampling';

// Helper to generate a linear time series
function makeLinear(n: number): Array<{ ts: number; value: number }> {
  return Array.from({ length: n }, (_, i) => ({ ts: i * 1000, value: i }));
}

function makeTimestampLinear(n: number): Array<{ timestamp: number; value: number }> {
  return Array.from({ length: n }, (_, i) => ({ timestamp: i * 1000, value: i }));
}

// Sinusoidal series for shape-preservation testing
function makeSine(n: number): Array<{ ts: number; pvPower: number }> {
  return Array.from({ length: n }, (_, i) => ({
    ts: i * 1000,
    pvPower: Math.sin((i / n) * 2 * Math.PI) * 100,
  }));
}

describe('lttbSample', () => {
  it('returns input unchanged if length ≤ threshold', () => {
    const data = makeLinear(100);
    const result = lttbSample(data, 200);
    expect(result).toBe(data);
  });

  it('exact output length equals threshold', () => {
    const data = makeLinear(1000);
    const result = lttbSample(data, 300);
    expect(result).toHaveLength(300);
  });

  it('always retains first and last points', () => {
    const data = makeLinear(500);
    const result = lttbSample(data, 50);
    expect(result[0]).toBe(data[0]);
    expect(result[result.length - 1]).toBe(data[data.length - 1]);
  });

  it('handles threshold < 2 (edge case)', () => {
    const data = makeLinear(100);
    const result = lttbSample(data, 1);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(data[0]);
    expect(result[1]).toBe(data[99]);
  });

  it('handles exactly 2 data points', () => {
    const data = makeLinear(2);
    const result = lttbSample(data, 5);
    expect(result).toBe(data);
  });

  it('works with explicit yKey', () => {
    const data = makeSine(800);
    const result = lttbSample(data, 100, 'pvPower');
    expect(result).toHaveLength(100);
  });

  it('output is a subset of input points', () => {
    const data: Array<{ ts: number; value: number }> = makeLinear(600);
    const result = lttbSample(data, 100);
    for (const point of result) {
      expect(data).toContain(point);
    }
  });

  it('preserves monotonic timestamps (ascending order)', () => {
    const data = makeLinear(800);
    const result = lttbSample(data, 200);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].ts).toBeGreaterThanOrEqual(result[i - 1].ts);
    }
  });

  it('shape preservation: extreme (max/min) value is included', () => {
    // Series with a clear spike at index 250
    const data = makeLinear(1000).map((p, i) => ({
      ...p,
      value: i === 250 ? 9999 : p.value,
    }));
    const result = lttbSample(data, 100);
    const maxResultValue = Math.max(...result.map((p) => p.value));
    // The spike should have been selected since it forms the largest triangle
    expect(maxResultValue).toBe(9999);
  });

  it('selects from auto-resolved yKey when none is given', () => {
    const data = Array.from({ length: 400 }, (_, i) => ({
      ts: i,
      pvPower: Math.sin(i),
      gridPower: Math.cos(i),
    }));
    // Should not throw even without explicit yKey
    const result = lttbSample(data, 50);
    expect(result).toHaveLength(50);
  });

  it('supports timestamp-based series used by historical charts', () => {
    const data = makeTimestampLinear(800);
    const result = lttbSample(data, 120);
    expect(result).toHaveLength(120);
    expect(result[0]).toBe(data[0]);
    expect(result[result.length - 1]).toBe(data[data.length - 1]);
  });
});

describe('sampleIfNeeded', () => {
  it('returns input unchanged if below threshold', () => {
    const data = makeLinear(400);
    const result = sampleIfNeeded(data, 500, 300);
    expect(result).toBe(data);
  });

  it('applies LTTB sampling when above threshold', () => {
    const data = makeLinear(600);
    const result = sampleIfNeeded(data, 500, 300);
    expect(result).toHaveLength(300);
  });

  it('default parameters work', () => {
    const data = makeLinear(600);
    const result = sampleIfNeeded(data);
    // default threshold=500, outputSize=300
    expect(result.length).toBeLessThanOrEqual(300);
  });

  it('empty array does not throw', () => {
    expect(() => sampleIfNeeded([])).not.toThrow();
    expect(sampleIfNeeded([])).toHaveLength(0);
  });
});
