import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PageActions({
  error,
  activeAlerts,
}: {
  error: string | null;
  activeAlerts: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-[10px] uppercase tracking-wider ${
          error ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
        }`}
      >
        <span
          className={`energy-pulse h-1.5 w-1.5 rounded-full ${error ? 'bg-red-400' : 'bg-emerald-400'}`}
        />
        {error ? t('monitoring.error') : t('monitoring.live')}
      </span>
      {activeAlerts > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1.5 font-semibold text-[10px] text-orange-400 uppercase tracking-wider">
          <AlertTriangle size={10} aria-hidden="true" />
          {activeAlerts} {t('monitoring.activeAlerts')}
        </span>
      )}
    </div>
  );
}
