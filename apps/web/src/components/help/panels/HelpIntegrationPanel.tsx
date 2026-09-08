import { useTranslation } from 'react-i18next';
import { HelpTabPanelShell } from '../HelpTabPanelShell';
import { HelpCerboGxSection } from './HelpCerboGxSection';
import { HelpContribProtocolsSection } from './HelpContribProtocolsSection';
import { HelpHighEndSection } from './HelpHighEndSection';
import { HelpKnxSection } from './HelpKnxSection';
import { HelpRpiSection } from './HelpRpiSection';
import { HelpVenusSection } from './HelpVenusSection';

/** Hardware integration guide (Cerbo, RPi, Venus, KNX, high-end). */
export const HelpIntegrationPanel = () => {
  const { t } = useTranslation();

  return (
    <HelpTabPanelShell tabKey="integration">
      <div className="glass-panel-strong rounded-2xl p-6">
        <h2 className="fluid-text-xl mb-2 font-semibold">{t('help.integrationGuideTitle')}</h2>
        <p className="text-(--color-muted) text-sm leading-relaxed">
          {t('help.integrationGuideIntro')}
        </p>
      </div>
      <HelpCerboGxSection />
      <HelpRpiSection />
      <HelpVenusSection />
      <HelpKnxSection />
      <HelpContribProtocolsSection />
      <HelpHighEndSection />
    </HelpTabPanelShell>
  );
};
