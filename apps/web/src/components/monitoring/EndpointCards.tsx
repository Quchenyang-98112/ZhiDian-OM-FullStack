import { useTranslation } from 'react-i18next';

export function EndpointCards() {
  const { t } = useTranslation();
  const endpoints = [
    { label: t('monitoring.prometheusScrape'), path: 'GET /metrics' },
    { label: t('monitoring.jsonApi'), path: 'GET /api/metrics/json' },
    { label: t('monitoring.healthCheck'), path: 'GET /health' },
  ];

  return (
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {endpoints.map(({ label, path }) => (
        <div key={label} className="rounded-xl bg-white/5 px-3 py-2">
          <p className="text-(--color-muted) text-[10px]">{label}</p>
          <code className="truncate font-mono text-(--color-primary) text-xs">{path}</code>
        </div>
      ))}
    </div>
  );
}
