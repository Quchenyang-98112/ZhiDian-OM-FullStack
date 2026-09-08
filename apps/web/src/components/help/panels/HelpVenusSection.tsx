import { Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HelpMonoBlocks } from './HelpMonoBlocks';
import { HelpNumberedSteps } from './HelpNumberedSteps';
import { HelpSectionShell } from './HelpSectionShell';
import { VenusFlowList } from './VenusFlowList';

const VENUS_ARCH = ['venusArch1', 'venusArch2', 'venusArch3', 'venusArch4', 'venusArch5'] as const;
const VENUS_DBUS = [
  'venusDbus1',
  'venusDbus2',
  'venusDbus3',
  'venusDbus4',
  'venusDbus5',
  'venusDbus6',
  'venusDbus7',
] as const;
const VENUS_MQTT = ['venusMqtt1', 'venusMqtt2', 'venusMqtt3', 'venusMqtt4', 'venusMqtt5'] as const;

/** Venus OS and Node-RED integration section in the Help guide. */
export const HelpVenusSection = () => {
  const { t } = useTranslation();

  return (
    <HelpSectionShell
      icon={Network}
      iconClassName="bg-purple-500/15 text-purple-400"
      title={t('help.venusTitle')}
    >
      <p className="mb-4 text-(--color-muted) text-sm leading-relaxed">{t('help.venusIntro')}</p>
      <h4 className="mb-2 font-medium text-sm">{t('help.venusArchitecture')}</h4>
      <HelpNumberedSteps keys={[...VENUS_ARCH]} badgeClassName="bg-purple-500/15 text-purple-400" />
      <h4 className="mb-2 font-medium text-sm">{t('help.venusDbusTitle')}</h4>
      <div className="mb-4">
        <HelpMonoBlocks keys={[...VENUS_DBUS]} />
      </div>
      <h4 className="mb-2 font-medium text-sm">{t('help.venusNodeRed')}</h4>
      <p className="mb-3 text-(--color-muted) text-xs leading-relaxed">
        {t('help.venusNodeRedDesc')}
      </p>
      <h4 className="mb-2 font-medium text-sm">{t('help.venusNodeRedFlows')}</h4>
      <VenusFlowList />
      <h4 className="mb-2 font-medium text-sm">{t('help.venusMqttTopics')}</h4>
      <HelpMonoBlocks keys={[...VENUS_MQTT]} />
    </HelpSectionShell>
  );
};
