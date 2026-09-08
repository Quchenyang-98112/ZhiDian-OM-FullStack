import { useTranslation } from 'react-i18next';

/** Header row for the Raspberry Pi vs Cerbo GX comparison table. */
export const RpiComparisonTableHead = () => {
  const { t } = useTranslation();

  return (
    <thead>
      <tr className="border-(--color-border) border-b">
        <th className="py-2 pr-4 text-left font-medium text-(--color-muted)"> </th>
        <th className="px-4 py-2 text-left font-medium text-green-400">{t('help.rpiVsGxRpi')}</th>
        <th className="px-4 py-2 text-left font-medium text-blue-400">{t('help.rpiVsGxCerbo')}</th>
      </tr>
    </thead>
  );
};
