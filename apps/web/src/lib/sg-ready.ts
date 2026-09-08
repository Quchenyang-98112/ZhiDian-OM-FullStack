import type { HpMode } from '../types';

/** Target electrical power (W) for each SG Ready mode. */
export const SG_READY_POWER_W: Record<HpMode, number> = {
  '1': 0,
  '2': 800,
  '3': 1500,
  '4': 2500,
};
