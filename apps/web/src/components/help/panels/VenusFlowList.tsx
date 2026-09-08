import { useTranslation } from 'react-i18next';

const VENUS_FLOWS = ['venusFlow1', 'venusFlow2', 'venusFlow3', 'venusFlow4', 'venusFlow5'] as const;

/** Node-RED flow bullet list for the Venus OS integration section. */
export const VenusFlowList = () => {
  const { t } = useTranslation();

  return (
    <ul className="mb-4 ml-4 space-y-1.5 text-(--color-muted) text-xs">
      {VENUS_FLOWS.map((k) => (
        <li key={k}>• {t(`help.${k}`)}</li>
      ))}
    </ul>
  );
};
