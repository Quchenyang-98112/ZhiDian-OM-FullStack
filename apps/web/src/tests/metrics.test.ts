import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEMS_METRICS, MetricsCollector } from '../lib/metrics';
import type { EnergyData } from '../types';

const SAMPLE_ENERGY: EnergyData = {
  pvPower: 5200,
  gridPower: -800,
  batteryPower: -1500,
  houseLoad: 2900,
  batterySoC: 68,
  heatPumpPower: 600,
  evPower: 7400,
  gridVoltage: 231.5,
  batteryVoltage: 52.4,
  pvYieldToday: 24.3,
  priceCurrent: 0.15,
};

describe('HEMS_METRICS definitions', () => {
  it('should define all metric definitions', () => {
    expect(HEMS_METRICS.length).toBeGreaterThanOrEqual(25);
  });

  it('should follow Prometheus naming conventions (snake_case)', () => {
    for (const m of HEMS_METRICS) {
      expect(m.name).toMatch(/^[a-z][a-z0-9_]+$/);
    }
  });

  it('should have valid metric types', () => {
    const validTypes = ['gauge', 'counter', 'histogram', 'summary'];
    for (const m of HEMS_METRICS) {
      expect(validTypes).toContain(m.type);
    }
  });

  it('should have help text for every metric', () => {
    for (const m of HEMS_METRICS) {
      expect(m.help.length).toBeGreaterThan(0);
    }
  });
});

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    vi.useFakeTimers();
    collector = new MetricsCollector();
  });

  afterEach(() => {
    collector.stop();
    vi.useRealTimers();
  });

  it('should record energy data and retrieve metric values', () => {
    collector.recordEnergyData(SAMPLE_ENERGY);

    expect(collector.getMetricValue('hems_pv_power_watts', { inverter: 'primary' })).toBe(5200);
    expect(collector.getMetricValue('hems_battery_soc_percent', { battery_id: 'main' })).toBe(68);
    expect(collector.getMetricValue('hems_house_load_watts')).toBe(2900);
    expect(collector.getMetricValue('hems_pv_yield_today_kwh')).toBe(24.3);
  });

  it('should return null for non-existent metrics', () => {
    expect(collector.getMetricValue('non_existent_metric')).toBeNull();
  });

  it('should record adapter status', () => {
    collector.recordAdapterStatus('victron-mqtt', 'Victron', true, 42);

    expect(collector.getMetricValue('hems_adapter_connected', { adapter: 'victron-mqtt' })).toBe(1);
    expect(
      collector.getMetricValue('hems_adapter_latency_seconds', { adapter: 'victron-mqtt' }),
    ).toBeCloseTo(0.042);
  });

  it('should track adapter errors', () => {
    collector.recordAdapterStatus('knx', 'KNX', true);
    collector.recordAdapterError('knx', 'timeout');
    collector.recordAdapterError('knx', 'timeout');

    const health = collector.getHealthStatus();
    const knxHealth = health.adapters.find((a) => a.id === 'knx');
    expect(knxHealth?.errorCount).toBe(2);
    expect(knxHealth?.status).toBe('error');
  });

  it('should track health status', () => {
    collector.recordAdapterStatus('victron-mqtt', 'Victron', true, 10);
    const health = collector.getHealthStatus();

    expect(health.status).toBe('healthy');
    expect(health.uptime).toBeGreaterThanOrEqual(0);
    expect(health.adapters).toHaveLength(1);
  });

  it('should report degraded when adapter disconnected', () => {
    collector.recordAdapterStatus('victron-mqtt', 'Victron', false);
    const health = collector.getHealthStatus();
    expect(health.status).toBe('degraded');
  });

  it('should report unhealthy when adapter has errors', () => {
    collector.recordAdapterStatus('victron-mqtt', 'Victron', true);
    collector.recordAdapterError('victron-mqtt', 'parse_error');
    const health = collector.getHealthStatus();
    expect(health.status).toBe('unhealthy');
  });

  it('should record WebSocket messages', () => {
    collector.recordMessage('inbound');
    collector.recordMessage('inbound');
    collector.recordMessage('outbound');

    expect(
      collector.getMetricValue('hems_websocket_messages_total', { direction: 'inbound' }),
    ).toBe(2);
    expect(
      collector.getMetricValue('hems_websocket_messages_total', { direction: 'outbound' }),
    ).toBe(1);
  });

  it('should record load control state', () => {
    collector.recordLoadControl(4200, true);

    expect(
      collector.getMetricValue('hems_load_control_limit_watts', { limit_type: '14a_enwg' }),
    ).toBe(4200);
    expect(collector.getMetricValue('hems_load_control_active')).toBe(1);
  });

  it('should record SG Ready state', () => {
    collector.recordSGReadyState(3);
    expect(collector.getMetricValue('hems_sg_ready_state')).toBe(3);
  });

  it('should export Prometheus text format', () => {
    collector.recordEnergyData(SAMPLE_ENERGY);
    const text = collector.toPrometheusText();

    expect(text).toContain('# HELP hems_pv_power_watts');
    expect(text).toContain('# TYPE hems_pv_power_watts gauge');
    expect(text).toContain('hems_pv_power_watts{inverter="primary"} 5200');
  });

  it('should export JSON metric families', () => {
    collector.recordEnergyData(SAMPLE_ENERGY);
    const families = collector.toJSON();

    expect(families.length).toBeGreaterThan(0);
    const pvFamily = families.find((f) => f.definition.name === 'hems_pv_power_watts');
    expect(pvFamily).toBeDefined();
    expect(pvFamily!.samples[0].value).toBe(5200);
  });

  it('should return metric history', () => {
    collector.recordEnergyData(SAMPLE_ENERGY);
    collector.recordEnergyData({ ...SAMPLE_ENERGY, pvPower: 6000 });

    const history = collector.getMetricHistory('hems_pv_power_watts');
    expect(history).toHaveLength(1); // Same labels → replaced
    expect(history[0].value).toBe(6000);
  });

  it('should notify listeners on start interval', () => {
    const listener = vi.fn();
    collector.onMetrics(listener);

    collector.recordEnergyData(SAMPLE_ENERGY);
    collector.start(1000);

    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('should unsubscribe listeners', () => {
    const listener = vi.fn();
    const unsub = collector.onMetrics(listener);

    collector.start(1000);
    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(1); // Not called again
  });

  it('should not start twice', () => {
    const listener = vi.fn();
    collector.onMetrics(listener);

    collector.start(1000);
    collector.start(1000); // second call should be no-op

    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(1); // Only one interval
  });

  it('should stop metric collection', () => {
    const listener = vi.fn();
    collector.onMetrics(listener);
    collector.start(1000);

    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(1);

    collector.stop();
    vi.advanceTimersByTime(2000);
    expect(listener).toHaveBeenCalledTimes(1); // No more calls
  });

  it('should use custom tariff provider label', () => {
    collector.recordEnergyData(SAMPLE_ENERGY, 'awattar');
    expect(collector.getMetricValue('hems_tariff_price_eur_per_kwh', { provider: 'awattar' })).toBe(
      0.15,
    );
  });
});
