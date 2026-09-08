import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '../../ui/Disclosure';
import { HelpTooltip } from '../../ui/HelpTooltip';
import { metricCards } from '../data/metricCards';
import { useCommandHubMetrics } from '../hooks/useCommandHubMetrics';
import { HubMetricCard } from './HubMetricCard';

/** The 4 primary metric tiles plus an expandable disclosure of the rest. */
export function MetricsOverviewSection() {
  const { t } = useTranslation();
  const metrics = useCommandHubMetrics();
  const [showAllMetrics, setShowAllMetrics] = useState(false);

  return (
    <section aria-label={t('commandHub.metricsOverview')} className="@container">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold text-(--color-muted) text-xs uppercase tracking-widest">
          {t('commandHub.metricsOverview')}
        </h2>
        <HelpTooltip content={t('tour.hub.metricsHelp')} />
      </div>
      <motion.div
        className="grid @md:grid-cols-3 @xl:grid-cols-4 grid-cols-2 gap-3"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        {metricCards.slice(0, 4).map((card) => (
          <HubMetricCard key={card.id} card={card} metrics={metrics} />
        ))}
      </motion.div>

      <Disclosure
        variant="glass"
        className="mt-3"
        open={showAllMetrics}
        onOpenChange={setShowAllMetrics}
        title={t('commandHub.secondaryMetrics')}
        subtitle={showAllMetrics ? undefined : t('commandHub.showMoreMetrics')}
      >
        <div className="grid @md:grid-cols-3 @xl:grid-cols-4 grid-cols-2 gap-3">
          {metricCards.slice(4).map((card) => (
            <HubMetricCard key={card.id} card={card} metrics={metrics} />
          ))}
        </div>
      </Disclosure>
    </section>
  );
}
