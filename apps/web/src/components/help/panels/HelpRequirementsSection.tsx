import { Globe, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HelpHardwareRequirementsList } from './HelpHardwareRequirementsList';
import { HelpRequirementCard } from './HelpRequirementCard';
import { HelpSoftwareRequirementsList } from './HelpSoftwareRequirementsList';

/** Hardware and software requirement cards on the getting-started tab. */
export const HelpRequirementsSection = () => {
  const { t } = useTranslation();

  return (
    <div className="glass-panel-strong rounded-2xl p-6">
      <h3 className="fluid-text-lg mb-4 font-medium">{t('help.requirements')}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HelpRequirementCard
          icon={<Monitor size={16} className="text-blue-400" aria-hidden="true" />}
          title={t('help.hardware')}
        >
          <HelpHardwareRequirementsList />
        </HelpRequirementCard>
        <HelpRequirementCard
          icon={<Globe size={16} className="text-cyan-400" aria-hidden="true" />}
          title={t('help.software')}
        >
          <HelpSoftwareRequirementsList />
        </HelpRequirementCard>
      </div>
    </div>
  );
};
