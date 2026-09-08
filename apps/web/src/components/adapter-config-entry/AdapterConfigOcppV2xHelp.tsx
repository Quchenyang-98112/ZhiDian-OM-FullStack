import { Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AdapterHelpItem } from '../adapter-config-shared';
import { Disclosure } from '../ui/Disclosure';

/** Collapsible OCPP V2X / §14a help items for adapter configuration. */
export const AdapterConfigOcppV2xHelp = () => {
  const { t } = useTranslation();

  return (
    <Disclosure
      variant="nested"
      title={t('adapterConfig.ocppV2xSection')}
      subtitle={t('adapterConfig.ocppV2xIntro')}
      icon={<Shield size={14} className="text-cyan-400" aria-hidden />}
    >
      <ul className="space-y-2">
        <AdapterHelpItem
          titleKey="adapterConfig.ocppV2xS14a"
          descKey="adapterConfig.ocppV2xS14aDesc"
        />
        <AdapterHelpItem
          titleKey="adapterConfig.ocppPhaseConfig"
          descKey="adapterConfig.ocppPhaseConfigDesc"
        />
        <AdapterHelpItem
          titleKey="adapterConfig.ocppTargetSoc"
          descKey="adapterConfig.ocppTargetSocDesc"
        />
        <AdapterHelpItem
          titleKey="adapterConfig.ocppSmartCost"
          descKey="adapterConfig.ocppSmartCostDesc"
        />
        <AdapterHelpItem
          titleKey="adapterConfig.ocppMinCurrent"
          descKey="adapterConfig.ocppMinCurrentDesc"
        />
        <AdapterHelpItem
          titleKey="adapterConfig.ocppV2xV2h"
          descKey="adapterConfig.ocppV2xV2hDesc"
        />
        <AdapterHelpItem
          titleKey="adapterConfig.ocppV2xV2g"
          descKey="adapterConfig.ocppV2xV2gDesc"
        />
      </ul>
    </Disclosure>
  );
};
