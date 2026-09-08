import { useTranslation } from 'react-i18next';
import type { PanelId } from '../types';

export function PanelTitle({ id }: { id: PanelId }) {
  const { t } = useTranslation();
  const titles: Record<PanelId, string> = {
    ev: t('control.evTitle'),
    heatpump: t('control.hpTitle'),
    battery: t('control.batteryTitle'),
    knx: t('liveEnergy.knxRooms'),
    stats: t('liveEnergy.statistics'),
  };
  return titles[id];
}
