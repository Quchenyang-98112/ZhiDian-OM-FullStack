export type View48h = 'price' | 'renewable';
export type WindowCategory = 'optimal' | 'good' | 'acceptable';
export type SchedulePriority = 'high' | 'medium' | 'low';

export interface PriceSlot {
  time: string;
  label: string;
  price: number;
  pvForecast: number;
  renewable: number;
  isToday: boolean;
}

export interface HeatmapRow {
  day: string;
  date: string;
  hours: number[];
}

export interface PriceBin {
  range: string;
  rangeEnd: string;
  count: number;
  label: string;
}

export interface ChargeWindow {
  start: string;
  end: string;
  avgPrice: number;
  savings: number;
  duration: number;
  category: WindowCategory;
  renewable: number;
}

export interface DeviceSchedule {
  device: string;
  icon: string;
  time: string;
  price: number;
  savings: number;
  priority: SchedulePriority;
}

export interface MonthlyDay {
  day: string;
  actual: number;
  optimized: number;
  savings: number;
}
