/**
 * adapter-metrics.test.ts — Unit tests for per-adapter Prometheus metrics (MED-18).
 */

import { beforeEach, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-unit-tests-that-is-long-enough-for-hs256-algo';

const {
  connectionGaugeValue,
  getAdapterMetricStateForTests,
  publishAllAdapterMetrics,
  recordAdapterConnection,
  recordAdapterDatapoint,
  recordAdapterDlq,
  recordAdapterError,
  recordAdapterHealthSnapshot,
  recordAdapterPollLatency,
  recordAdapterReconnect,
  resetAdapterMetricsForTests,
} = await import('../middleware/adapter-metrics.js');

const { getServerMetrics } = await import('../middleware/metrics.js');

beforeEach(() => {
  resetAdapterMetricsForTests();
  getServerMetrics().clear();
});

describe('connectionGaugeValue', () => {
  it('returns 1 for connected and degraded', () => {
    expect(connectionGaugeValue('connected')).toBe(1);
    expect(connectionGaugeValue('degraded')).toBe(1);
  });

  it('returns 0 for disconnected and failed', () => {
    expect(connectionGaugeValue('disconnected')).toBe(0);
    expect(connectionGaugeValue('failed')).toBe(0);
  });
});

describe('recordAdapterConnection', () => {
  it('publishes hems_adapter_connected gauge with adapter label', () => {
    recordAdapterConnection('inverter-01', 'modbus-sunspec', 'connected');
    publishAllAdapterMetrics();

    const samples = getServerMetrics().get('hems_adapter_connected');
    expect(samples).toBeDefined();
    expect(samples!.find((s) => s.labels.adapter === 'inverter-01')?.value).toBe(1);
  });
});

describe('recordAdapterPollLatency', () => {
  it('stores latency in seconds on hems_adapter_latency_seconds', () => {
    recordAdapterPollLatency('inverter-01', 'modbus-sunspec', 250);
    publishAllAdapterMetrics();

    const samples = getServerMetrics().get('hems_adapter_latency_seconds');
    expect(samples?.find((s) => s.labels.adapter === 'inverter-01')?.value).toBeCloseTo(0.25);
  });
});

describe('recordAdapterDatapoint', () => {
  it('increments datapoint counter and resets freshness', () => {
    recordAdapterDatapoint('mqtt-01', 'victron-mqtt');
    publishAllAdapterMetrics();

    const updates = getServerMetrics().get('hems_adapter_data_updates_total');
    expect(updates?.find((s) => s.labels.adapter === 'mqtt-01')?.value).toBe(1);

    const freshness = getServerMetrics().get('hems_adapter_data_freshness_seconds');
    expect(freshness?.find((s) => s.labels.adapter === 'mqtt-01')?.value).toBe(0);
  });
});

describe('recordAdapterError', () => {
  it('increments hems_adapter_errors_total with error_type label', () => {
    recordAdapterError('inverter-01', 'modbus-sunspec', 'poll');
    recordAdapterError('inverter-01', 'modbus-sunspec', 'poll');

    const samples = getServerMetrics().get('hems_adapter_errors_total');
    const sample = samples?.find(
      (s) => s.labels.adapter === 'inverter-01' && s.labels.error_type === 'poll',
    );
    expect(sample?.value).toBe(2);
  });
});

describe('recordAdapterHealthSnapshot', () => {
  it('marks adapter degraded when consecutive errors are present', () => {
    recordAdapterHealthSnapshot('inverter-01', 'modbus-sunspec', {
      status: 'degraded',
      consecutiveErrors: 2,
      lastSuccessMs: Date.now() - 5000,
    });
    publishAllAdapterMetrics();

    const state = getAdapterMetricStateForTests('inverter-01');
    expect(state?.connected).toBe('degraded');

    const freshness = getServerMetrics().get('hems_adapter_data_freshness_seconds');
    expect(freshness?.find((s) => s.labels.adapter === 'inverter-01')?.value).toBeGreaterThan(4);
  });
});

describe('recordAdapterReconnect', () => {
  it('increments hems_adapter_reconnects_total with adapter and protocol labels', () => {
    recordAdapterReconnect('heatpump-01', 'modbus-heatpump');
    recordAdapterReconnect('heatpump-01', 'modbus-heatpump');

    const samples = getServerMetrics().get('hems_adapter_reconnects_total');
    const sample = samples?.find(
      (s) => s.labels.adapter === 'heatpump-01' && s.labels.protocol === 'modbus-heatpump',
    );
    expect(sample?.value).toBe(2);
  });
});

describe('recordAdapterDlq', () => {
  it('increments hems_adapter_dlq_total with adapter and protocol labels', () => {
    recordAdapterDlq('mqtt-01', 'victron-mqtt');

    const samples = getServerMetrics().get('hems_adapter_dlq_total');
    const sample = samples?.find(
      (s) => s.labels.adapter === 'mqtt-01' && s.labels.protocol === 'victron-mqtt',
    );
    expect(sample?.value).toBe(1);
  });
});
