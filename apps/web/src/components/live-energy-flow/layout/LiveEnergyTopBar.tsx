import { Activity, Home, Maximize2, Minimize2, Sun, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConnectionPresentation } from '../../../lib/adapter-mode';
import { formatPower } from '../../../lib/format';
import { formatTariffPriceFull, tariffFormatLocale } from '../../../lib/format-tariff-price';
import { HelpTooltip } from '../../ui/HelpTooltip';

interface TopBarEnergy {
  pvPower: number;
  houseLoad: number;
  gridPower: number;
  priceCurrent: number;
}

export function LiveEnergyTopBar({
  connectionPresentation,
  isFullscreen,
  onToggleFullscreen,
  energyData,
  locale,
}: {
  connectionPresentation: ConnectionPresentation;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  energyData: TopBarEnergy;
  locale: string;
}) {
  const { t } = useTranslation();
  const tariffLocale = tariffFormatLocale(locale);
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2">
      <div className="flex items-center gap-3">
        <Activity size={18} className="text-(--color-primary)" aria-hidden="true" />
        <h1 className="fluid-text-lg font-semibold text-(--color-text)">{t('liveEnergy.title')}</h1>
        <HelpTooltip content={t('tour.liveEnergy.help')} />
        <span
          role="status"
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs ${
            connectionPresentation === 'connected'
              ? 'bg-emerald-500/10 text-emerald-400'
              : connectionPresentation === 'simulation'
                ? 'border border-(--color-border) bg-(--color-surface-strong) text-(--color-muted)'
                : 'bg-rose-500/10 text-rose-400'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              connectionPresentation === 'connected'
                ? 'energy-pulse bg-emerald-400'
                : connectionPresentation === 'simulation'
                  ? 'bg-(--color-primary)'
                  : 'bg-rose-400'
            }`}
            aria-hidden="true"
          />
          {connectionPresentation === 'connected'
            ? t('common.live')
            : connectionPresentation === 'simulation'
              ? t('mode.simulationBadge')
              : t('common.disconnected')}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-3 text-xs lg:flex">
          <span className="flex items-center gap-1 text-yellow-400">
            <Sun size={14} aria-hidden="true" /> {formatPower(energyData.pvPower, locale)}
          </span>
          <span className="flex items-center gap-1 text-cyan-400">
            <Home size={14} aria-hidden="true" /> {formatPower(energyData.houseLoad, locale)}
          </span>
          <span
            className={`flex items-center gap-1 ${energyData.gridPower > 0 ? 'text-red-400' : 'text-emerald-400'}`}
          >
            <Zap size={14} aria-hidden="true" />{' '}
            {formatPower(Math.abs(energyData.gridPower), locale)}
          </span>
          <span className="price-pill">
            {formatTariffPriceFull(energyData.priceCurrent, tariffLocale, t('units.euroPerKwh'))}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-(--color-muted) transition-colors hover:bg-(--color-surface) hover:text-(--color-text)"
          aria-label={isFullscreen ? t('sankey.exitFullscreen') : t('sankey.enterFullscreen')}
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
