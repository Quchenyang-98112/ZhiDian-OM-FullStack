import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatTariffPrice, tariffFormatLocale } from '../../../lib/format-tariff-price';
import { EnergyCard } from '../../ui/EnergyCard';
import { LiveMetric } from '../../ui/LiveMetric';
import { formatMetricDetail, type MetricDef } from '../data/metricCards';
import type { CommandHubMetrics } from '../hooks/useCommandHubMetrics';

interface HubMetricCardProps {
  card: MetricDef;
  metrics: CommandHubMetrics;
}

/** A single metric tile linking to its detail route. Shared by the primary grid
 *  and the expandable secondary grid so the markup lives in exactly one place. */
export function HubMetricCard({ card, metrics }: HubMetricCardProps) {
  const { t, i18n } = useTranslation();
  const tariffLocale = tariffFormatLocale(i18n.resolvedLanguage ?? i18n.language);
  const isPriceCard = card.id === 'price';
  const priceDisplay = isPriceCard
    ? formatTariffPrice(metrics.energyData.priceCurrent, {
        style: 'compact',
        locale: tariffLocale,
        unit: t('units.ctPerKwh'),
      })
    : null;

  return (
    <Link to={card.link} className="group focus-ring rounded-2xl">
      <EnergyCard
        variant={card.variant}
        details={
          card.getDetail(metrics) ? (
            <p className="text-(--color-muted) text-xs">{formatMetricDetail(card, metrics, t)}</p>
          ) : undefined
        }
      >
        <span className="shrink-0">{card.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-(--color-muted) text-[11px] uppercase tracking-wide">
            {t(card.labelKey)}
          </p>
          {isPriceCard && priceDisplay ? (
            <LiveMetric
              value={metrics.energyData.priceCurrent * 100}
              formattedDisplay={priceDisplay}
              format="custom"
              size="sm"
              precision={1}
            />
          ) : (
            <LiveMetric
              value={card.getValue(metrics)}
              unit={card.unit}
              format={card.format}
              size="sm"
              precision={card.format === 'percent' ? 0 : card.format === 'currency' ? 1 : 2}
            />
          )}
        </div>
        <ChevronRight
          size={14}
          className="shrink-0 text-(--color-muted) opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      </EnergyCard>
    </Link>
  );
}
