import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpQuickStartStep } from './HelpQuickStartStep';

/** Numbered quick-start step list on the getting-started tab. */
export const HelpQuickStartSection = ({
  steps,
}: {
  steps: {
    step: number;
    title: string;
    desc: string;
    icon: ReactNode;
    link: string;
  }[];
}) => {
  const { t } = useTranslation();

  return (
    <div className="glass-panel-strong rounded-2xl p-6">
      <h2 className="fluid-text-xl mb-4 font-semibold">{t('help.welcomeTitle')}</h2>
      <p className="mb-6 text-(--color-muted) leading-relaxed">{t('help.welcomeIntro')}</p>
      <h3 className="fluid-text-lg mb-4 font-medium">{t('help.quickStart')}</h3>
      <div className="space-y-4">
        {steps.map((item) => (
          <HelpQuickStartStep key={item.step} {...item} />
        ))}
      </div>
    </div>
  );
};
