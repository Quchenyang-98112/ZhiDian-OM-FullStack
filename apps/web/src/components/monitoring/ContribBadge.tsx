import { useTranslation } from 'react-i18next';

export function ContribBadge({ contrib }: { contrib?: boolean | undefined }) {
  const { t } = useTranslation();
  if (!contrib) return null;
  return (
    <span className="shrink-0 rounded bg-(--color-primary)/10 px-1.5 py-0.5 text-(--color-primary) text-[9px]">
      {t('monitoring.contribBadge')}
    </span>
  );
}
