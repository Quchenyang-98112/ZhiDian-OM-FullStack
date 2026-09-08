import { useTranslation } from 'react-i18next';

/**
 * A small badge shown when the dashboard displays demo/mock data.
 */
export function DemoBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-(--state-warning-border) bg-(--state-warning-bg)/10 px-2.5 py-1 font-medium text-(--state-warning-fg) text-xs">
      <span className="h-1.5 w-1.5 rounded-full bg-(--state-warning-fg)" aria-hidden="true" />
      {t('common.demoMode', 'Demo')}
    </span>
  );
}
