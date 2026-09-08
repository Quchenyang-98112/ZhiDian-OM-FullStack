import { Activity, Battery, Car, Flame } from 'lucide-react';
import type { ReactNode } from 'react';

/** Icon lookup for device-schedule rows (keyed by the schedule's `icon` field). */
export const DEVICE_ICONS: Record<string, ReactNode> = {
  Car: <Car className="h-5 w-5" aria-hidden="true" />,
  Battery: <Battery className="h-5 w-5" aria-hidden="true" />,
  Flame: <Flame className="h-5 w-5" aria-hidden="true" />,
  Activity: <Activity className="h-5 w-5" aria-hidden="true" />,
};

/** Shared section entrance animation. */
export const sectionAnim = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, type: 'spring' as const, bounce: 0.15 },
};
