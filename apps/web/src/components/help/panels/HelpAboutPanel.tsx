import { useTranslation } from 'react-i18next';
import packageJson from '../../../../package.json';
import { HelpTabPanelShell } from '../HelpTabPanelShell';
import { HelpAboutFooterSections } from './HelpAboutFooterSections';
import { HelpAboutGithubLink } from './HelpAboutGithubLink';
import { HelpAboutHero } from './HelpAboutHero';
import { HelpAboutTechStackGrid } from './HelpAboutTechStackGrid';

/** About tab: version, tech stack, license, credits, and AI acknowledgments. */
export const HelpAboutPanel = () => {
  const appVersion = packageJson.version;
  const { t } = useTranslation();

  const techStack = [
    { category: t('help.aboutTechFrontend'), items: t('help.aboutTechFrontendItems') },
    { category: t('help.aboutTechState'), items: t('help.aboutTechStateItems') },
    { category: t('help.visualization'), items: t('help.aboutTechVisualizationItems') },
    { category: t('help.aboutTechBackend'), items: t('help.aboutTechBackendItems') },
    { category: t('help.aboutTechAi'), items: t('help.aboutTechAiItems') },
    { category: t('help.aboutTechPwa'), items: t('help.aboutTechPwaItems') },
    { category: t('help.protocols'), items: t('help.aboutTechProtocolsItems') },
    { category: t('help.testing'), items: t('help.aboutTechTestingItems') },
  ];

  const aiProviders = [
    {
      name: t('help.aiGeminiName'),
      provider: t('help.aiGeminiProvider'),
      desc: t('help.aiGeminiDesc'),
      color: '#4285F4',
    },
    {
      name: t('help.aiClaudeName'),
      provider: t('help.aiClaudeProvider'),
      desc: t('help.aiClaudeDesc'),
      color: '#D97706',
    },
    {
      name: t('help.aiGrokName'),
      provider: t('help.aiGrokProvider'),
      desc: t('help.aiGrokDesc'),
      color: '#10B981',
    },
  ];

  return (
    <HelpTabPanelShell tabKey="about">
      <div className="glass-panel-strong rounded-2xl p-6">
        <HelpAboutHero />

        <p className="mb-6 text-(--color-muted) leading-relaxed">
          {t('help.aboutDesc', { version: appVersion })}
        </p>

        <HelpAboutGithubLink />

        <HelpAboutTechStackGrid techStack={techStack} />

        <HelpAboutFooterSections aiProviders={aiProviders} />
      </div>
    </HelpTabPanelShell>
  );
};
