import { useTranslation } from 'react-i18next';

interface StorageStatsCardsProps {
  usageMb: number;
  snapshots: number;
  historyDays: number;
}

export const StorageStatsCards = ({ usageMb, snapshots, historyDays }: StorageStatsCardsProps) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 text-center">
        <p className="font-bold text-(--color-primary) text-2xl">{usageMb.toFixed(1)}</p>
        <p className="text-(--color-muted) text-xs">MB IndexedDB</p>
      </div>
      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 text-center">
        <p className="font-bold text-(--color-secondary) text-2xl">{snapshots}</p>
        <p className="text-(--color-muted) text-xs">{t('settings.snapshots', 'Snapshots')}</p>
      </div>
      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4 text-center">
        <p className="font-bold text-2xl text-amber-400">{historyDays}</p>
        <p className="text-(--color-muted) text-xs">
          {t('settings.daysRetention', 'Days retention')}
        </p>
      </div>
    </div>
  );
};
