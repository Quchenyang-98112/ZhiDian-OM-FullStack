import { useTranslation } from 'react-i18next';

export function SystemInfoRows() {
  const { t } = useTranslation();
  const rows = [
    { label: t('monitoring.nodeJs'), value: t('monitoring.nodeJsVersion') },
    { label: t('monitoring.runtime'), value: t('monitoring.runtimeVersion') },
    { label: t('monitoring.os'), value: t('monitoring.osVersion') },
  ];

  return (
    <div className="mt-4 space-y-1.5 text-(--color-muted) text-[10px]">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex justify-between">
          <span>{label}</span>
          <span className="font-mono">{value}</span>
        </div>
      ))}
    </div>
  );
}
