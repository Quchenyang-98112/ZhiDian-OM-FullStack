import { useTranslation } from 'react-i18next';
import type { UnifiedEnergyModel } from '../../../core/adapters/EnergyAdapter';
import { hapticClick } from '../../../lib/haptics';
import type { SendCommand } from '../types';

export function BuildingDetail({
  unified,
  sendCommand,
}: {
  unified: UnifiedEnergyModel;
  sendCommand: SendCommand;
}) {
  const { t } = useTranslation();
  const rooms = unified.knx?.rooms ?? [];

  return (
    <div className="space-y-3">
      {rooms.length === 0 && (
        <p className="text-(--color-muted) text-sm">{t('devicesAuto.noKnxRooms')}</p>
      )}
      {rooms.map((room) => (
        <div
          key={room.name}
          className="flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2"
        >
          <div>
            <span className="font-medium text-(--color-text) text-sm">{room.name}</span>
            <span className="ml-2 text-(--color-muted) text-xs">
              {room.temperature.toFixed(1)} °C
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                hapticClick();
                sendCommand('TOGGLE_KNX_LIGHTS', room.lightsOn ? 0 : 1);
              }}
              className={`focus-ring rounded-md px-2 py-1 font-medium text-xs transition-colors ${
                room.lightsOn
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-(--color-surface) text-(--color-muted) hover:text-(--color-text)'
              }`}
              aria-label={`${t('floorplan.lights')} ${room.name}`}
            >
              {t('floorplan.lights')} {room.lightsOn ? '●' : '○'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
