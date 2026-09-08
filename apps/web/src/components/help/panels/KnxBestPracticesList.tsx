import { useTranslation } from 'react-i18next';

const KNX_BP = ['knxBP1', 'knxBP2', 'knxBP3', 'knxBP4', 'knxBP5'] as const;

/** KNX best-practices bullet list. */
export const KnxBestPracticesList = () => {
  const { t } = useTranslation();

  return (
    <ul className="ml-4 space-y-1.5 text-(--color-muted) text-xs">
      {KNX_BP.map((k) => (
        <li key={k}>• {t(`help.${k}`)}</li>
      ))}
    </ul>
  );
};
