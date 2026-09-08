import { useTranslation } from 'react-i18next';
import { HelpAiProviderCard } from './HelpAiProviderCard';

/** License, credits, and AI acknowledgment blocks on the About tab. */
export const HelpAboutFooterSections = ({
  aiProviders,
}: {
  aiProviders: { name: string; provider: string; desc: string; color: string }[];
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="mt-6 border-(--color-border) border-t pt-6">
        <h3 className="mb-3 font-medium">{t('help.a11yTitle')}</h3>
        <p className="text-(--color-muted) text-sm leading-relaxed">{t('help.a11yDesc')}</p>
      </div>

      <div className="mt-6 border-(--color-border) border-t pt-6">
        <h3 className="mb-3 font-medium">{t('help.license')}</h3>
        <p className="text-(--color-muted) text-sm leading-relaxed">{t('help.licenseDesc')}</p>
      </div>

      <div className="mt-6 border-(--color-border) border-t pt-6">
        <h3 className="mb-3 font-medium">{t('help.credits')}</h3>
        <div className="space-y-1 text-(--color-muted) text-sm">
          <p>• {t('help.creditVictron')}</p>
          <p>• {t('help.creditKnx')}</p>
          <p>• {t('help.creditTariffs')}</p>
          <p>• {t('help.creditD3')}</p>
          <p>• {t('help.creditGoogle')}</p>
          <p>• {t('help.creditEmhass')}</p>
          <p>• {t('help.creditOpenEms')}</p>
          <p>• {t('help.creditContrib')}</p>
        </div>
      </div>

      <div className="mt-6 border-(--color-border) border-t pt-6">
        <h3 className="mb-3 font-medium">{t('help.aiAcknowledgments')}</h3>
        <p className="mb-4 text-(--color-muted) text-sm leading-relaxed">
          {t('help.aiAcknowledgmentsDesc')}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {aiProviders.map((ai) => (
            <HelpAiProviderCard key={ai.name} {...ai} />
          ))}
        </div>
      </div>
    </>
  );
};
