import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReadOnlyModeActive } from '../../lib/use-read-only-mode';

export const ReadOnlySettingsBanner = () => {
  const { t } = useTranslation();
  if (!useReadOnlyModeActive()) return null;

  return (
    <div
      className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
      role="status"
    >
      <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
      <div>
        <p className="font-medium text-amber-300 text-sm">{t('mode.readOnlyBannerWarning')}</p>
        <p className="mt-1 text-(--color-muted) text-xs">{t('settings.readOnlyHint')}</p>
      </div>
    </div>
  );
};
