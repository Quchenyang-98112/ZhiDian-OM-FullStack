import { Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AiRecommendationSection,
  MetricsOverviewSection,
  MiniSankeySection,
  QuickActionsBar,
} from '../components/command-hub';
import { PageHeader } from '../components/layout/PageHeader';

function CommandHubComponent() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('commandHub.title')}
        subtitle={t('commandHub.subtitle')}
        icon={<Home size={22} aria-hidden="true" />}
      />

      <MetricsOverviewSection />
      <MiniSankeySection />
      <AiRecommendationSection />
      <QuickActionsBar />
    </div>
  );
}

export const CommandHub = CommandHubComponent;
export default CommandHub;
