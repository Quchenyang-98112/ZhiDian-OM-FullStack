import { useTranslation } from 'react-i18next';

const RPI_PERF = ['rpiPerf1', 'rpiPerf2', 'rpiPerf3', 'rpiPerf4', 'rpiPerf5'] as const;

/** Raspberry Pi performance tip bullet list. */
export const RpiPerfList = () => {
  const { t } = useTranslation();

  return (
    <ul className="mb-4 ml-4 space-y-1.5 text-(--color-muted) text-xs">
      {RPI_PERF.map((k) => (
        <li key={k}>• {t(`help.${k}`)}</li>
      ))}
    </ul>
  );
};
