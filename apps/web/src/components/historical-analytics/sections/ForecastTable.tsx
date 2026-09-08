import { CheckCircle, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AIForecastRecord } from '../../../lib/db';

function r2Color(r2: number): string {
  if (r2 >= 0.8) return 'text-green-400';
  if (r2 >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

function ForecastRow({ forecast }: { forecast: AIForecastRecord }) {
  const { t } = useTranslation();
  return (
    <tr className="border-(--color-border)/50 border-b">
      <td className="px-3 py-2 text-(--color-text)">{forecast.metric}</td>
      <td className="px-3 py-2 text-(--color-muted)">{forecast.model}</td>
      <td className="px-3 py-2 text-(--color-muted)">
        {new Date(forecast.createdAt).toLocaleString('de-DE')}
      </td>
      <td className="px-3 py-2">
        <span className={r2Color(forecast.accuracy.r2)}>
          {(forecast.accuracy.r2 * 100).toFixed(1)}%
        </span>
      </td>
      <td className="px-3 py-2 text-(--color-muted)">{forecast.accuracy.mape.toFixed(1)}%</td>
      <td className="px-3 py-2">
        {forecast.persistedToInflux ? (
          <CheckCircle
            size={14}
            className="text-green-400"
            role="img"
            aria-label={t('historicalAnalytics.forecastSyncedLabel')}
          />
        ) : (
          <Clock
            size={14}
            className="text-(--color-muted)"
            role="img"
            aria-label={t('historicalAnalytics.forecastPendingLabel')}
          />
        )}
      </td>
    </tr>
  );
}

export function ForecastTable({ forecasts }: { forecasts: AIForecastRecord[] }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-lg border border-(--color-border)">
      <table
        className="w-full text-left text-xs"
        aria-label={t('historicalAnalytics.forecastTable')}
      >
        <thead>
          <tr className="border-(--color-border) border-b bg-(--color-surface)/50">
            <th className="px-3 py-2 font-medium text-(--color-muted)">
              {t('historicalAnalytics.metric')}
            </th>
            <th className="px-3 py-2 font-medium text-(--color-muted)">
              {t('historicalAnalytics.model')}
            </th>
            <th className="px-3 py-2 font-medium text-(--color-muted)">
              {t('historicalAnalytics.created')}
            </th>
            <th className="px-3 py-2 font-medium text-(--color-muted)">R²</th>
            <th className="px-3 py-2 font-medium text-(--color-muted)">MAPE</th>
            <th className="px-3 py-2 font-medium text-(--color-muted)">InfluxDB</th>
          </tr>
        </thead>
        <tbody>
          {forecasts.slice(0, 10).map((f) => (
            <ForecastRow key={f.id ?? f.createdAt} forecast={f} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
