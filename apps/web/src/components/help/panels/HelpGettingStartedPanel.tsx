import { Activity, Download, Server, Sparkles, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HelpTabPanelShell } from '../HelpTabPanelShell';
import { HelpQuickStartSection } from './HelpQuickStartSection';
import { HelpRequirementsSection } from './HelpRequirementsSection';

/** Getting started quick-start steps and system requirements. */
export const HelpGettingStartedPanel = () => {
  const { t } = useTranslation();

  const quickStartSteps = [
    {
      step: 1,
      title: t('help.step1Title'),
      desc: t('help.step1Desc'),
      icon: <Server size={18} aria-hidden="true" />,
      link: '/settings?tab=adapters',
    },
    {
      step: 2,
      title: t('help.step2Title'),
      desc: t('help.step2Desc'),
      icon: <Zap size={18} aria-hidden="true" />,
      link: '/settings?tab=energy',
    },
    {
      step: 3,
      title: t('help.step3Title'),
      desc: t('help.step3Desc'),
      icon: <Activity size={18} aria-hidden="true" />,
      link: '/monitoring',
    },
    {
      step: 4,
      title: t('help.step4Title'),
      desc: t('help.step4Desc'),
      icon: <Sparkles size={18} aria-hidden="true" />,
      link: '/settings/ai',
    },
    {
      step: 5,
      title: t('help.step5Title'),
      desc: t('help.step5Desc'),
      icon: <Download size={18} aria-hidden="true" />,
      link: '/',
    },
  ];

  return (
    <HelpTabPanelShell tabKey="getting-started">
      <HelpQuickStartSection steps={quickStartSteps} />
      <HelpRequirementsSection />
    </HelpTabPanelShell>
  );
};
