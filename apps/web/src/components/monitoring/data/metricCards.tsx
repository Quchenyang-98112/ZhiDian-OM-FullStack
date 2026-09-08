import { Activity, BarChart3, Gauge, ThermometerSun, Wifi, Zap } from 'lucide-react';
import type { MetricCardItem, Status } from '../types';
import { statusBg, statusColor } from '../utils';

/** Build the 10 live metric cards from resolved metric values + derived statuses. */
export function buildMetricCards(
  t: (key: string) => string,
  values: {
    pvPower: number;
    gridPower: number;
    batteryPower: number;
    batterySoC: number;
    houseLoad: number;
    evPower: number;
    heatPump: number;
    voltage: number;
    price: number;
    connections: number;
  },
  statuses: {
    gridStatus: Status;
    batteryStatus: Status;
    voltageStatus: Status;
    priceStatus: Status;
  },
): MetricCardItem[] {
  return [
    {
      label: t('monitoring.pvPower'),
      value: `${values.pvPower.toFixed(0)}`,
      unit: 'W',
      icon: <ThermometerSun size={16} />,
      status: 'ok',
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
    },
    {
      label: t('monitoring.gridPower'),
      value: `${values.gridPower.toFixed(0)}`,
      unit: 'W',
      icon: <Zap size={16} />,
      status: statuses.gridStatus,
      color: statusColor(statuses.gridStatus),
      bg: statusBg(statuses.gridStatus),
    },
    {
      label: t('monitoring.batteryPower'),
      value: `${values.batteryPower.toFixed(0)}`,
      unit: 'W',
      icon: <Activity size={16} />,
      status: 'ok',
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: t('monitoring.batterySoC'),
      value: `${values.batterySoC.toFixed(0)}`,
      unit: '%',
      icon: <Gauge size={16} />,
      status: statuses.batteryStatus,
      color: statusColor(statuses.batteryStatus),
      bg: statusBg(statuses.batteryStatus),
    },
    {
      label: t('monitoring.houseLoad'),
      value: `${values.houseLoad.toFixed(0)}`,
      unit: 'W',
      icon: <Activity size={16} />,
      status: 'ok',
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
    {
      label: t('monitoring.evCharger'),
      value: `${values.evPower.toFixed(0)}`,
      unit: 'W',
      icon: <Zap size={16} />,
      status: 'ok',
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
    },
    {
      label: t('monitoring.heatPump'),
      value: `${values.heatPump.toFixed(0)}`,
      unit: 'W',
      icon: <ThermometerSun size={16} />,
      status: 'ok',
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
    },
    {
      label: t('monitoring.gridVoltage'),
      value: `${values.voltage.toFixed(1)}`,
      unit: 'V',
      icon: <Gauge size={16} />,
      status: statuses.voltageStatus,
      color: statusColor(statuses.voltageStatus),
      bg: statusBg(statuses.voltageStatus),
    },
    {
      label: t('monitoring.price'),
      value: `${(values.price * 100).toFixed(1)}`,
      unit: 'ct/kWh',
      icon: <BarChart3 size={16} />,
      status: statuses.priceStatus,
      color: statusColor(statuses.priceStatus),
      bg: statusBg(statuses.priceStatus),
    },
    {
      label: t('monitoring.connections'),
      value: `${values.connections}`,
      unit: 'WS',
      icon: <Wifi size={16} />,
      status: 'ok',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
  ];
}
