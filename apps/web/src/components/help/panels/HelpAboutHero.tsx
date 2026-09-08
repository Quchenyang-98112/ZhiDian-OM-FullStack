import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import packageJson from '../../../../package.json';

/** Hero block with app icon and version for the Help About tab. */
export const HelpAboutHero = () => {
  const appVersion = packageJson.version;
  const { t } = useTranslation();

  return (
    <div className="mb-6 flex items-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-(--color-primary)/30 bg-(--color-primary)/15">
        <Zap size={32} className="text-(--color-primary)" aria-hidden="true" />
      </div>
      <div>
        <h2 className="font-semibold text-xl">{t('common.appName')}</h2>
        <p className="text-(--color-muted) text-sm">
          {t('help.versionFull', { version: appVersion })}
        </p>
      </div>
    </div>
  );
};
