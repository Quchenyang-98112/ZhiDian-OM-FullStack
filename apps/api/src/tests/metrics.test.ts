/**
 * metrics.test.ts — Unit tests for Prometheus metrics module.
 *
 * Covers:
 * - setMetric / getServerMetrics
 * - renderPrometheusText format
 * - Label deduplication (same labels update in place)
 * - Multiple label combinations stored separately
 */

import { beforeEach, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-unit-tests-that-is-long-enough-for-hs256-algo';

const { setMetric, getServerMetrics, renderPrometheusText } = await import(
  '../middleware/metrics.js'
);

beforeEach(() => {
  // Clear metrics between tests by accessing internal map
  const metrics = getServerMetrics();
  metrics.clear();
});

describe('setMetric', () => {
  it('stores a new metric', () => {
    setMetric('test_metric', 'A test metric', 'gauge', 42);
    const samples = getServerMetrics().get('test_metric');
    expect(samples).toBeDefined();
    expect(samples![0].value).toBe(42);
  });

  it('updates existing metric with same labels', () => {
    setMetric('counter_a', 'Counter A', 'counter', 1, { adapter: 'victron' });
    setMetric('counter_a', 'Counter A', 'counter', 5, { adapter: 'victron' });
    const samples = getServerMetrics().get('counter_a');
    expect(samples!.length).toBe(1);
    expect(samples![0].value).toBe(5);
  });

  it('stores separate samples for different labels', () => {
    setMetric('adapter_status', 'Adapter status', 'gauge', 1, { adapter: 'victron' });
    setMetric('adapter_status', 'Adapter status', 'gauge', 0, { adapter: 'modbus' });
    const samples = getServerMetrics().get('adapter_status');
    expect(samples!.length).toBe(2);
    const victron = samples!.find((s) => s.labels.adapter === 'victron');
    const modbus = samples!.find((s) => s.labels.adapter === 'modbus');
    expect(victron!.value).toBe(1);
    expect(modbus!.value).toBe(0);
  });

  it('includes timestamp in metric sample', () => {
    const before = Date.now();
    setMetric('ts_metric', 'A metric with timestamp', 'gauge', 99);
    const after = Date.now();
    const samples = getServerMetrics().get('ts_metric');
    expect(samples![0].timestamp).toBeGreaterThanOrEqual(before);
    expect(samples![0].timestamp).toBeLessThanOrEqual(after);
  });
});

describe('renderPrometheusText', () => {
  it('produces valid Prometheus text format', () => {
    setMetric('pv_power', 'PV power watts', 'gauge', 3500);
    const output = renderPrometheusText();
    expect(output).toContain('# HELP pv_power');
    expect(output).toContain('# TYPE pv_power gauge');
    expect(output).toContain('pv_power 3500');
  });

  it('includes label format in output', () => {
    setMetric('adapter_errors', 'Adapter errors', 'counter', 2, { adapter_id: 'knx' });
    const output = renderPrometheusText();
    expect(output).toContain('adapter_id="knx"');
    expect(output).toContain('adapter_errors{');
  });

  it('returns empty string when no metrics registered', () => {
    const output = renderPrometheusText();
    expect(output.trim()).toBe('');
  });
});

describe('getServerMetrics', () => {
  it('returns the mutable metrics map', () => {
    const metrics = getServerMetrics();
    expect(metrics instanceof Map).toBe(true);
  });

  it('reflects changes after setMetric', () => {
    setMetric('battery_soc', 'Battery SoC %', 'gauge', 75);
    const metrics = getServerMetrics();
    expect(metrics.has('battery_soc')).toBe(true);
    expect(metrics.get('battery_soc')![0].value).toBe(75);
  });
});
