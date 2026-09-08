// Shared types for the Historical Analytics page and its extracted components.

export type TimeRange = '24h' | '7d' | '30d' | '90d' | '365d';

/** A single merged energy sample plotted on the history charts. */
export interface TimeSeriesPoint {
  timestamp: number;
  time: string;
  pvPower: number;
  gridPower: number;
  batteryPower: number;
  houseLoad: number;
  batterySoC: number;
}

/** A row of the AI-forecast accuracy comparison chart. */
export interface ForecastAccuracyRow {
  timestamp: number;
  label: string;
  r2: number;
  mape: number;
  model: string;
  synced: boolean;
}
