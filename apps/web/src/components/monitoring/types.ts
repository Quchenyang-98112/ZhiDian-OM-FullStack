export type EventLogEntry = {
  time: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  msg: string;
};

export type Status = 'ok' | 'warn' | 'crit';

export type AdapterItem = {
  name: string;
  protocol: string;
  id: string;
  icon: React.ReactNode;
  desc: string;
};

export type MetricCardItem = {
  label: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  status: Status;
  color: string;
  bg: string;
};

export type AlertRule = {
  name: string;
  expr: string;
  for: string;
  severity: 'critical' | 'warning' | 'info';
  desc: string;
  active: boolean;
};
