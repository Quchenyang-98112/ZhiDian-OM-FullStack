import { Eye } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import {
  AdapterHealthSection,
  AlertRulesSection,
  EventLogSection,
  GrafanaSection,
  LoadChartSection,
  MetricCardsGrid,
  PageActions,
  ResourceSection,
  SystemHealthBanner,
} from '../components/monitoring';
import { useMonitoringData } from '../components/monitoring/hooks/useMonitoringData';
import { PageCrossLinks } from '../components/ui/PageCrossLinks';

/**
 * @param embedded When rendered as a tab panel inside the unified Monitoring
 *   wrapper, the wrapper supplies the page header + cross-links footer; this
 *   page suppresses its own to avoid a duplicate <h1> and duplicate panels.
 */
export default function MonitoringPageComponent({ embedded = false }: { embedded?: boolean }) {
  const {
    t,
    error,
    uptime,
    lastUpdated,
    connected,
    activeAlerts,
    metricCards,
    loadHistory,
    cpuUsage,
    memUsage,
    diskUsage,
    networkIO,
    adapters,
    contribAdapters,
    get,
    alertRules,
    eventLog,
  } = useMonitoringData();

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title={t('monitoring.pageTitle', 'Monitoring')}
          subtitle={t('monitoring.pageDescription')}
          icon={<Eye size={22} aria-hidden="true" />}
          actions={<PageActions error={error} activeAlerts={activeAlerts} />}
        />
      )}

      <SystemHealthBanner
        error={error}
        uptime={uptime}
        lastUpdated={lastUpdated}
        connected={connected}
      />
      <MetricCardsGrid cards={metricCards} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <LoadChartSection loadHistory={loadHistory} />
        <ResourceSection
          cpuUsage={cpuUsage}
          memUsage={memUsage}
          diskUsage={diskUsage}
          networkIO={networkIO}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdapterHealthSection adapters={adapters} contribAdapters={contribAdapters} get={get} />
        <AlertRulesSection alertRules={alertRules} />
      </div>

      <EventLogSection eventLog={eventLog} />
      <GrafanaSection />

      {!embedded && <PageCrossLinks />}
    </div>
  );
}
