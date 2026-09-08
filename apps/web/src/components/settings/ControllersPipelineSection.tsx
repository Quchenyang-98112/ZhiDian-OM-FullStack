import { Cpu, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { sectionClass, sectionHeaderClass } from './styles';

type ControllerPriority = 'critical' | 'high' | 'normal';

type ControllerPipelineConfig = {
  id: string;
  nameKey: string;
  nameDefault: string;
  descKey: string;
  descDefault: string;
  priority: ControllerPriority;
  icon: string;
};

const CONTROLLER_PIPELINE: ControllerPipelineConfig[] = [
  {
    id: 'ess-symmetric',
    nameKey: 'settings.ctrl_essSym',
    nameDefault: 'ESS Symmetric Controller',
    descKey: 'settings.ctrl_essSymDesc',
    descDefault: 'PID grid-balance, zero-grid-power target',
    priority: 'high',
    icon: '⚡',
  },
  {
    id: 'peak-shaving',
    nameKey: 'settings.ctrl_peakShaving',
    nameDefault: 'Peak Shaving Controller',
    descKey: 'settings.ctrl_peakShavingDesc',
    descDefault: 'Grid import capping with hysteresis band',
    priority: 'critical',
    icon: '📉',
  },
  {
    id: 'grid-optimized-charge',
    nameKey: 'settings.ctrl_gridCharge',
    nameDefault: 'Grid-Optimized Charge',
    descKey: 'settings.ctrl_gridChargeDesc',
    descDefault: 'Tariff-based battery charge/discharge scheduling',
    priority: 'normal',
    icon: '💰',
  },
  {
    id: 'self-consumption',
    nameKey: 'settings.ctrl_selfConsumption',
    nameDefault: 'Self-Consumption',
    descKey: 'settings.ctrl_selfConsumptionDesc',
    descDefault: 'Maximize PV self-consumption, absorb surplus',
    priority: 'normal',
    icon: '\u2600',
  },
  {
    id: 'emergency-capacity',
    nameKey: 'settings.ctrl_emergency',
    nameDefault: 'Emergency Capacity',
    descKey: 'settings.ctrl_emergencyDesc',
    descDefault: 'Reserve SoC backup for grid outages',
    priority: 'critical',
    icon: '🔋',
  },
  {
    id: 'heatpump-sg-ready',
    nameKey: 'settings.ctrl_heatpump',
    nameDefault: 'Heat Pump SG Ready',
    descKey: 'settings.ctrl_heatpumpDesc',
    descDefault: 'SG Ready mode 1–4 based on PV surplus & tariff',
    priority: 'normal',
    icon: '\uD83C\uDF21',
  },
  {
    id: 'ev-smart-charge',
    nameKey: 'settings.ctrl_evSmart',
    nameDefault: 'EV Smart Charge',
    descKey: 'settings.ctrl_evSmartDesc',
    descDefault: 'PV surplus charging, tariff optimization, §14a EnWG',
    priority: 'normal',
    icon: '🚗',
  },
];

function priorityClass(priority: ControllerPriority): string {
  if (priority === 'critical') {
    return 'bg-rose-500/15 text-rose-400';
  }
  if (priority === 'high') {
    return 'bg-amber-500/15 text-amber-400';
  }
  return 'bg-blue-500/15 text-blue-400';
}

function ControllerPipelineCard({
  ctrl,
  name,
  desc,
}: {
  ctrl: ControllerPipelineConfig;
  name: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-(--color-border) bg-(--color-surface) p-4 transition-all hover:border-(--color-primary)/30">
      <span className="text-xl" aria-hidden="true">
        {ctrl.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium text-sm">
          {name}
          <span
            className={`rounded-full px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wider ${priorityClass(ctrl.priority)}`}
          >
            {ctrl.priority}
          </span>
        </p>
        <p className="mt-0.5 text-(--color-muted) text-xs">{desc}</p>
      </div>
    </div>
  );
}

/** Controller pipeline overview for the Controllers settings tab. */
export function ControllersPipelineSection() {
  const { t } = useTranslation();

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <Cpu size={20} className="text-cyan-400" />
        {t('settings.controllerPipeline', 'Controller Pipeline')}
      </h2>
      <p className="text-(--color-muted) text-xs">
        {t(
          'settings.controllerPipelineHint',
          'Seven real-time energy control loops inspired by EMHASS, OpenEMS & evcc. Controllers run in priority order (critical → low) and merge their outputs.',
        )}
      </p>

      <div className="space-y-3">
        {CONTROLLER_PIPELINE.map((ctrl) => (
          <ControllerPipelineCard
            key={ctrl.id}
            ctrl={ctrl}
            name={t(ctrl.nameKey, ctrl.nameDefault)}
            desc={t(ctrl.descKey, ctrl.descDefault)}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-(--color-primary)/20 bg-(--color-primary)/5 px-4 py-3 text-sm">
        <Info size={16} className="shrink-0 text-(--color-primary)" />
        <span>
          {t(
            'settings.controllerManageHint',
            'Manage controller states, enable/disable, and view live outputs on the',
          )}{' '}
          <Link
            to="/devices"
            className="font-medium text-(--color-primary) underline-offset-2 hover:underline"
          >
            {t('nav.controllers', 'Controllers')}
          </Link>{' '}
          {t('common.page', 'page')}.
        </span>
      </div>
    </section>
  );
}
