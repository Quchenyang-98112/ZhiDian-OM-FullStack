import { BrainCircuit, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { AIForecastRecord } from '../../../lib/db';
import { ForecastAccuracyChart } from '../charts/ForecastAccuracyChart';
import type { ForecastAccuracyRow } from '../types';
import { ForecastTable } from './ForecastTable';

interface ForecastHistorySectionProps {
  forecastHistory: AIForecastRecord[];
  accuracyData: ForecastAccuracyRow[];
  unsyncedCount: number;
  canSync: boolean;
  syncing: boolean;
  syncResult: number | null;
  onSync: () => void;
}

function SyncControls({
  unsyncedCount,
  canSync,
  syncing,
  syncResult,
  onSync,
}: Omit<ForecastHistorySectionProps, 'forecastHistory' | 'accuracyData'>) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      {unsyncedCount > 0 && canSync && (
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="focus-ring flex items-center gap-1.5 rounded-lg bg-(--color-primary)/10 px-3 py-1.5 font-medium text-(--color-primary) text-xs transition-colors hover:bg-(--color-primary)/20 disabled:opacity-50"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} aria-hidden="true" />
          {t('historicalAnalytics.syncToInflux', { count: unsyncedCount })}
        </button>
      )}
      {syncResult !== null && (
        <span className="text-green-400 text-xs">
          {t('historicalAnalytics.synced', { count: syncResult })}
        </span>
      )}
    </div>
  );
}

export function ForecastHistorySection({
  forecastHistory,
  accuracyData,
  unsyncedCount,
  canSync,
  syncing,
  syncResult,
  onSync,
}: ForecastHistorySectionProps) {
  const { t } = useTranslation();
  return (
    <motion.section
      className="glass-panel rounded-xl p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-(--color-text) text-lg">
          <BrainCircuit size={20} className="text-(--color-neon-green)" aria-hidden="true" />
          {t('historicalAnalytics.aiForecastHistory')}
        </h2>
        <SyncControls
          unsyncedCount={unsyncedCount}
          canSync={canSync}
          syncing={syncing}
          syncResult={syncResult}
          onSync={onSync}
        />
      </div>

      {forecastHistory.length > 0 ? (
        <div className="space-y-3">
          <div
            className="h-48 sm:h-56"
            role="img"
            aria-label={t('historicalAnalytics.forecastAccuracyAria')}
          >
            <ForecastAccuracyChart data={accuracyData} />
          </div>
          <ForecastTable forecasts={forecastHistory} />
        </div>
      ) : (
        <p className="py-8 text-center text-(--color-muted) text-sm">
          {t('historicalAnalytics.noForecasts')}
        </p>
      )}
    </motion.section>
  );
}
