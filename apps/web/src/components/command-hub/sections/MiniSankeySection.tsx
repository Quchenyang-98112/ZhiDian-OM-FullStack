import { Activity, ChevronRight, Leaf } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useEnergyContext } from '../../../core/EnergyContext';
import { OptimizedSankey } from '../../energy/OptimizedSankey';
import { EmptyState } from '../../ui/EmptyState';

/** Real-time energy flow mini-Sankey, or an empty state when no data flows. */
export function MiniSankeySection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: energyData, detailPanel, selfSufficiencyPercent, isExporting } = useEnergyContext();

  if (energyData.pvPower === 0 && energyData.houseLoad === 0 && energyData.gridPower === 0) {
    return (
      <EmptyState
        icon={Activity}
        title={t('empty.noEnergyData')}
        description={t('empty.noEnergyDataDesc')}
        pulse
        action={
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="focus-ring rounded-xl bg-(--color-primary)/15 px-4 py-2 font-medium text-(--color-primary) text-sm transition-colors hover:bg-(--color-primary)/25"
          >
            {t('empty.goToSettings')}
          </button>
        }
      />
    );
  }

  return (
    <motion.section
      className="glass-panel-strong hover-lift overflow-hidden rounded-2xl"
      aria-labelledby="hub-sankey-title"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <div className="flex items-center justify-between border-(--color-border)/30 border-b px-5 py-3">
        <h2 id="hub-sankey-title" className="fluid-text-base flex items-center gap-2 font-medium">
          <Activity size={18} className="text-(--color-secondary)" aria-hidden="true" />
          {t('dashboard.realtimeFlow')}
        </h2>
        <div className="flex items-center gap-3 text-(--color-muted) text-xs">
          <span className="flex items-center gap-1.5">
            <Leaf size={12} className={isExporting ? 'text-emerald-400' : 'text-(--color-muted)'} />
            {selfSufficiencyPercent}% {t('commandHub.autonomous')}
          </span>
          <Link
            to="/energy-flow"
            className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary)/10"
          >
            {t('nav.viewAll')}
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>
      <div className="h-60 p-4 sm:h-80">
        <OptimizedSankey
          data={energyData}
          detailOpen={detailPanel.open}
          onDetailClose={detailPanel.close}
          allowFullscreen
          className="h-full"
        />
      </div>
    </motion.section>
  );
}
