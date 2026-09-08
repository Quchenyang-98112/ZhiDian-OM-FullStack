import { FileBarChart, ShieldAlert, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FloatingActionBar } from '../../ui/FloatingActionBar';

/** Persistent quick-actions bar: optimize, export report, emergency stop. */
export function QuickActionsBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <FloatingActionBar
      open
      ariaLabel={t('commandHub.quickActions')}
      primaryAction={
        <button
          type="button"
          onClick={() => navigate('/optimization-ai')}
          className="btn-primary focus-ring inline-flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Sparkles size={16} aria-hidden="true" />
          {t('ai.optimizeNow')}
        </button>
      }
      secondaryAction={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/analytics')}
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface-strong) px-3 py-2 font-medium text-(--color-text) text-sm transition-colors hover:bg-white/5"
          >
            <FileBarChart size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{t('command.exportReport')}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 font-medium text-red-400 text-sm transition-colors hover:bg-red-500/20"
          >
            <ShieldAlert size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{t('safety.emergencyStopShort')}</span>
          </button>
        </div>
      }
    />
  );
}
