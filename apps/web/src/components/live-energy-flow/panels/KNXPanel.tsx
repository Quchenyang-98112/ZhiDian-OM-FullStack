import { Blinds, Lightbulb, ThermometerSun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEnergyContext } from '../../../core/EnergyContext';
import { hapticClick } from '../../../lib/haptics';
import type { CommandType } from '../../../types';
import { ControlPanelSection } from '../../ui/ControlPanel';

type SendCommand = (type: CommandType, value: number) => void;

function LightControls({ sendCommand }: { sendCommand: SendCommand }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => {
          hapticClick();
          sendCommand('TOGGLE_KNX_LIGHTS', 1);
        }}
        className="btn-secondary focus-ring flex flex-1 items-center justify-center gap-1 text-xs"
      >
        <Lightbulb size={12} /> {t('liveEnergy.lightsOn')}
      </button>
      <button
        type="button"
        onClick={() => {
          hapticClick();
          sendCommand('TOGGLE_KNX_LIGHTS', 0);
        }}
        className="btn-secondary focus-ring flex flex-1 items-center justify-center gap-1 text-xs"
      >
        <Lightbulb size={12} /> {t('liveEnergy.lightsOff')}
      </button>
    </div>
  );
}

function BlindControls({ sendCommand }: { sendCommand: SendCommand }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => {
          hapticClick();
          sendCommand('TOGGLE_KNX_WINDOW', 1);
        }}
        className="btn-secondary focus-ring flex flex-1 items-center justify-center gap-1 text-xs"
      >
        <Blinds size={12} /> {t('liveEnergy.blindsUp')}
      </button>
      <button
        type="button"
        onClick={() => {
          hapticClick();
          sendCommand('TOGGLE_KNX_WINDOW', 0);
        }}
        className="btn-secondary focus-ring flex flex-1 items-center justify-center gap-1 text-xs"
      >
        <Blinds size={12} /> {t('liveEnergy.blindsDown')}
      </button>
    </div>
  );
}

export function KNXPanel({ sendCommand }: { sendCommand: SendCommand }) {
  const { t } = useTranslation();
  const { unified } = useEnergyContext();
  const rooms = unified?.knx?.rooms ?? [];

  if (rooms.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-(--color-muted) text-xs">{t('liveEnergy.noKnxRooms')}</p>
        <ControlPanelSection>
          <LightControls sendCommand={sendCommand} />
        </ControlPanelSection>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rooms.map((room, i) => (
        <ControlPanelSection key={room.name ?? i} title={room.name ?? `Room ${i + 1}`}>
          <div className="space-y-2">
            {room.temperature !== undefined && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-(--color-muted)">
                  <ThermometerSun size={14} className="text-orange-400" />{' '}
                  {t('liveEnergy.temperature')}
                </span>
                <span className="font-mono">{room.temperature.toFixed(1)}°C</span>
              </div>
            )}
            <LightControls sendCommand={sendCommand} />
            <BlindControls sendCommand={sendCommand} />
          </div>
        </ControlPanelSection>
      ))}
    </div>
  );
}
