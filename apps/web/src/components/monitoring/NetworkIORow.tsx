import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function NetworkIORow({ networkIO }: { networkIO: number }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 text-(--color-muted)">
          <Activity size={14} className="text-emerald-400" aria-hidden="true" />
          {t('monitoring.networkIO')}
        </span>
        <span className="font-medium text-(--color-text)">{networkIO} KB/s</span>
      </div>
    </div>
  );
}
