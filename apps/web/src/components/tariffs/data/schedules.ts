import type { DeviceSchedule } from '../types';
import { PRICE_AVG, PRICE_MIN } from './constants';

/** Device scheduling recommendations */
export const DEVICE_SCHEDULES: DeviceSchedule[] = [
  {
    device: 'ev',
    icon: 'Car',
    time: '02:00–05:00',
    price: PRICE_MIN,
    savings: 3.8,
    priority: 'high',
  },
  {
    device: 'battery',
    icon: 'Battery',
    time: '01:00–06:00',
    price: PRICE_MIN + 0.01,
    savings: 2.4,
    priority: 'high',
  },
  {
    device: 'heatPump',
    icon: 'Flame',
    time: '12:00–14:00',
    price: PRICE_AVG * 0.8,
    savings: 1.2,
    priority: 'medium',
  },
  {
    device: 'washer',
    icon: 'Activity',
    time: '13:00–15:00',
    price: PRICE_AVG * 0.75,
    savings: 0.6,
    priority: 'low',
  },
];
