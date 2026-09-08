import { Activity, Battery, Car, Home, Leaf, Sun, Thermometer, Zap } from 'lucide-react';
import type { CommandHubMetrics } from '../hooks/useCommandHubMetrics';

export interface MetricDef {
  id: string;
  labelKey: string;
  icon: React.ReactNode;
  getValue: (d: CommandHubMetrics) => number;
  unit: string;
  format: 'power' | 'energy' | 'percent' | 'currency';
  link: string;
  variant: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  getDetail: (d: CommandHubMetrics) => string;
}

const METRIC_DETAIL_KEYS = new Set([
  'import',
  'export',
  'batteryCharging',
  'batteryDischarging',
  'batteryIdle',
]);

/** Resolve a card's detail line into a translated string (or undefined). */
export function formatMetricDetail(
  card: MetricDef,
  metrics: CommandHubMetrics,
  t: (key: string) => string,
): string | undefined {
  const detail = card.getDetail(metrics);
  if (!detail) return undefined;
  if (card.id === 'pv') {
    return `${t('commandHub.pvDetail')}: ${detail}`;
  }
  if (METRIC_DETAIL_KEYS.has(detail)) {
    return t(`metrics.${detail}`);
  }
  return detail;
}

export const metricCards: MetricDef[] = [
  {
    id: 'pv',
    labelKey: 'metrics.pvGeneration',
    icon: <Sun size={18} className="text-yellow-400" aria-hidden="true" />,
    getValue: (d) => d.pvKW,
    unit: 'kW',
    format: 'power',
    link: '/energy-flow',
    variant: 'success',
    getDetail: (d) => `${d.energyData.pvYieldToday.toFixed(1)} kWh`,
  },
  {
    id: 'battery',
    labelKey: 'metrics.battery',
    icon: <Battery size={18} className="text-emerald-400" aria-hidden="true" />,
    getValue: (d) => d.energyData.batterySoC,
    unit: '%',
    format: 'percent',
    link: '/energy-flow',
    variant: 'success',
    getDetail: (d) =>
      d.battKW < -0.05 ? 'batteryCharging' : d.battKW > 0.05 ? 'batteryDischarging' : 'batteryIdle',
  },
  {
    id: 'house',
    labelKey: 'metrics.houseLoad',
    icon: <Home size={18} className="text-blue-400" aria-hidden="true" />,
    getValue: (d) => d.houseKW,
    unit: 'kW',
    format: 'power',
    link: '/energy-flow',
    variant: 'primary',
    getDetail: () => '',
  },
  {
    id: 'grid',
    labelKey: 'metrics.grid',
    icon: <Zap size={18} className="text-red-400" aria-hidden="true" />,
    getValue: (d) => Math.abs(d.gridKW),
    unit: 'kW',
    format: 'power',
    link: '/energy-flow',
    variant: 'danger',
    getDetail: (d) => (d.gridKW > 0 ? 'import' : 'export'),
  },
  {
    id: 'selfSufficiency',
    labelKey: 'metrics.autonomy',
    icon: <Leaf size={18} className="text-emerald-400" aria-hidden="true" />,
    getValue: (d) => d.selfSufficiency,
    unit: '%',
    format: 'percent',
    link: '/analytics',
    variant: 'success',
    getDetail: () => '',
  },
  {
    id: 'heatPump',
    labelKey: 'dashboard.heatPump',
    icon: <Thermometer size={18} className="text-orange-400" aria-hidden="true" />,
    getValue: (d) => d.hpKW,
    unit: 'kW',
    format: 'power',
    link: '/devices',
    variant: 'warning',
    getDetail: () => '',
  },
  {
    id: 'ev',
    labelKey: 'dashboard.evCharging',
    icon: <Car size={18} className="text-cyan-400" aria-hidden="true" />,
    getValue: (d) => d.evKW,
    unit: 'kW',
    format: 'power',
    link: '/devices',
    variant: 'primary',
    getDetail: () => '',
  },
  {
    id: 'price',
    labelKey: 'metrics.tariff',
    icon: <Activity size={18} className="text-purple-400" aria-hidden="true" />,
    getValue: (d) => d.energyData.priceCurrent * 100,
    unit: 'ct/kWh',
    format: 'currency',
    link: '/tariffs',
    variant: 'neutral',
    getDetail: () => '',
  },
];
