import { useTranslation } from 'react-i18next';
import packageJson from '../../../../package.json';
import { Disclosure } from '../../ui/Disclosure';
import { HelpTabPanelShell } from '../HelpTabPanelShell';

export const HelpFaqPanel = () => {
  const { t } = useTranslation();
  const appVersion = packageJson.version;

  return (
    <HelpTabPanelShell tabKey="faq">
      <div className="glass-panel-strong rounded-2xl p-6">
        <h2 className="mb-6 font-semibold text-xl">{t('help.faqTitle')}</h2>

        {/* General */}
        <h3 className="mb-3 font-semibold text-(--color-muted) text-sm uppercase tracking-widest">
          {t('help.faqGeneral')}
        </h3>
        <div className="mb-6 space-y-3">
          <Disclosure title={t('help.faqWhatIs')} defaultOpen>
            {t('help.faqWhatIsAnswer', { version: appVersion })}
          </Disclosure>
          <Disclosure title={t('help.faqPowerOutage')}>{t('help.faqPowerOutageAnswer')}</Disclosure>
          <Disclosure title={t('help.faqOffline')}>{t('help.faqOfflineAnswer')}</Disclosure>
          <Disclosure title={t('help.faqMockMode')}>{t('help.faqMockModeAnswer')}</Disclosure>
          <Disclosure title={t('help.faqCerboVsRpi')}>{t('help.faqCerboVsRpiAnswer')}</Disclosure>
        </div>

        {/* Energy & Tariffs */}
        <h3 className="mb-3 font-semibold text-(--color-muted) text-sm uppercase tracking-widest">
          {t('help.faqEnergySection')}
        </h3>
        <div className="mb-6 space-y-3">
          <Disclosure title={t('help.faqEnwg')}>{t('help.faqEnwgAnswer')}</Disclosure>
          <Disclosure title={t('help.faqTariff')}>{t('help.faqTariffAnswer')}</Disclosure>
          <Disclosure title={t('help.faqSgReady')}>{t('help.faqSgReadyAnswer')}</Disclosure>
        </div>

        {/* Security */}
        <h3 className="mb-3 font-semibold text-(--color-muted) text-sm uppercase tracking-widest">
          {t('help.faqSecuritySection')}
        </h3>
        <div className="mb-6 space-y-3">
          <Disclosure title={t('help.faqSecurity')}>{t('help.faqSecurityAnswer')}</Disclosure>
          <Disclosure title={t('help.faqDataStorage')}>{t('help.faqDataStorageAnswer')}</Disclosure>
          <Disclosure title={t('help.faqReadOnly')}>{t('help.faqReadOnlyAnswer')}</Disclosure>
        </div>

        {/* Technical */}
        <h3 className="mb-3 font-semibold text-(--color-muted) text-sm uppercase tracking-widest">
          {t('help.faqTechnical')}
        </h3>
        <div className="space-y-3">
          <Disclosure title={t('help.faqBrowsers')}>{t('help.faqBrowsersAnswer')}</Disclosure>
          <Disclosure title={t('help.faqMobile')}>{t('help.faqMobileAnswer')}</Disclosure>
          <Disclosure title={t('help.faqApi')}>{t('help.faqApiAnswer')}</Disclosure>
        </div>
      </div>
    </HelpTabPanelShell>
  );
};
