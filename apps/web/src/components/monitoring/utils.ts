import type { AlertRule, Status } from './types';

export function statusColor(status: Status): string {
  return status === 'crit'
    ? 'text-red-400'
    : status === 'warn'
      ? 'text-yellow-400'
      : 'text-emerald-400';
}

export function statusBg(status: Status): string {
  return status === 'crit'
    ? 'bg-red-500/10'
    : status === 'warn'
      ? 'bg-yellow-500/10'
      : 'bg-emerald-500/10';
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function severityClasses(severity: AlertRule['severity']): string {
  return severity === 'critical'
    ? 'bg-red-500/15 text-red-400'
    : severity === 'warning'
      ? 'bg-orange-500/15 text-orange-400'
      : 'bg-blue-500/15 text-blue-400';
}

export function generateSystemLoadHistory(currentLoad: number) {
  const now = new Date();
  const currentHour = now.getHours();
  return Array.from({ length: 24 }, (_, hourIndex) => {
    const hour = hourIndex;
    const dayFactor =
      hour >= 6 && hour <= 22
        ? 0.6 + Math.sin(((hour - 6) / 16) * Math.PI) * 0.35
        : 0.3 + (hour % 3) * 0.05;
    const load = Math.round(currentLoad * dayFactor * (0.85 + (hour % 7) * 0.03));
    const cpu = Math.round(15 + dayFactor * 40 + (hour % 5) * 2);
    const mem = Math.round(45 + dayFactor * 25 + (hour % 4) * 1.5);
    return {
      hour: `${String(hour).padStart(2, '0')}:00`,
      load,
      cpu,
      memory: mem,
      isFuture: hour > currentHour,
    };
  });
}

function gridStatus(gridPower: number): Status {
  if (gridPower > 4200) return 'crit';
  if (gridPower > 3000) return 'warn';
  return 'ok';
}

function batteryStatus(batterySoC: number): Status {
  if (batterySoC < 10) return 'crit';
  if (batterySoC < 20) return 'warn';
  return 'ok';
}

function voltageStatus(voltage: number): Status {
  if (voltage < 210 || voltage > 250) return 'crit';
  if (voltage < 220 || voltage > 240) return 'warn';
  return 'ok';
}

function priceStatus(price: number): Status {
  if (price > 0.4) return 'crit';
  if (price > 0.3) return 'warn';
  return 'ok';
}

// skipcq: JS-R1005
export function calculateStatuses(
  gridPower: number,
  batterySoC: number,
  voltage: number,
  price: number,
): { gridStatus: Status; batteryStatus: Status; voltageStatus: Status; priceStatus: Status } {
  return {
    gridStatus: gridStatus(gridPower),
    batteryStatus: batteryStatus(batterySoC),
    voltageStatus: voltageStatus(voltage),
    priceStatus: priceStatus(price),
  };
}
