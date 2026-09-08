import { useTranslation } from 'react-i18next';

/** Software requirement bullets for the getting-started tab. */
export const HelpSoftwareRequirementsList = () => {
  const { t } = useTranslation();

  return (
    <ul className="space-y-1.5 text-(--color-muted) text-xs">
      <li>• {t('help.modernBrowser')}</li>
      <li>• {t('help.pwaSupport')}</li>
      <li>
        • Tibber / aWATTar {t('help.account')} ({t('help.optional')})
      </li>
      <li>• AI API Key ({t('help.optional')})</li>
    </ul>
  );
};
