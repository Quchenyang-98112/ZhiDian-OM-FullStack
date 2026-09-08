import { ChevronRight, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

const routeLabels: Record<string, string> = {
  '/': 'nav.home',
  '/energy-flow': 'nav.energyFlow',
  '/devices': 'nav.devicesOverview',
  '/optimization-ai': 'nav.aiOptimizer',
  '/agent-collaboration': 'nav.agentCollaboration',
  '/agent-collaboration/monitoring': 'nav.monitoringAgent',
  '/agent-collaboration/diagnosis': 'nav.diagnosisAgent',
  '/agent-collaboration/decision': 'nav.decisionAgent',
  '/knowledge-base': 'nav.knowledgeBase',
  '/tariffs': 'nav.tariffs',
  '/analytics': 'nav.analytics',
  '/carbon-reduction': 'nav.carbonReduction',
  '/energy-absorption': 'nav.energyAbsorption',
  '/analytics/realtime': 'nav.analytics',
  '/analytics/historical': 'nav.historicalAnalytics',
  '/monitoring': 'nav.monitoring',
  '/monitoring/full': 'nav.monitoring',
  '/settings': 'nav.settings',
  '/settings/ai': 'nav.aiKeys',
  '/settings/hardware': 'nav.hardware',
  '/settings/config': 'nav.settings',
  '/plugins': 'nav.plugins',
  '/help': 'nav.help',
};

function BreadcrumbsComponent() {
  const { t } = useTranslation();
  const location = useLocation();

  if (location.pathname === '/') return null;

  const segments = location.pathname.split('/').filter(Boolean);

  return (
    <nav
      aria-label={t('nav.breadcrumbs', 'Breadcrumbs')}
      className="mb-4 flex min-w-0 items-center gap-1.5 overflow-hidden text-(--color-muted) text-sm"
    >
      <Link
        to="/"
        className="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:text-(--color-text)"
      >
        <Home size={14} aria-hidden="true" />
        <span>{t('nav.home', 'Home')}</span>
      </Link>

      {segments.map((segment, index) => {
        const path = `/${segments.slice(0, index + 1).join('/')}`;
        const isLast = index === segments.length - 1;
        const labelKey = routeLabels[path] || segment;

        return (
          <span key={path} className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
            <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-(--color-border)" />
            {isLast ? (
              <span
                className="truncate rounded-md px-1.5 py-0.5 font-medium text-(--color-text)"
                aria-current="page"
              >
                {t(labelKey, segment)}
              </span>
            ) : (
              <Link
                to={path}
                className="focus-ring truncate rounded-md px-1.5 py-0.5 transition-colors hover:text-(--color-text)"
              >
                {t(labelKey, segment)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export const Breadcrumbs = BreadcrumbsComponent;
