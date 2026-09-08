import { HardDrive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HelpChecklist } from './HelpChecklist';
import { HelpSectionShell } from './HelpSectionShell';
import { HighEndNetworkList, HighEndSoftwareList } from './HighEndLists';

const HIGH_END_HW = [
  'highEndHW1',
  'highEndHW2',
  'highEndHW3',
  'highEndHW4',
  'highEndHW5',
  'highEndHW6',
  'highEndHW7',
  'highEndHW8',
  'highEndHW9',
] as const;

/** High-end hardware configuration section in the Help integration guide. */
export const HelpHighEndSection = () => {
  const { t } = useTranslation();

  return (
    <HelpSectionShell
      icon={HardDrive}
      iconClassName="bg-rose-500/15 text-rose-400"
      title={t('help.highEndTitle')}
    >
      <p className="mb-4 text-(--color-muted) text-sm leading-relaxed">{t('help.highEndIntro')}</p>
      <h4 className="mb-2 font-medium text-sm">{t('help.highEndHardware')}</h4>
      <HelpChecklist keys={[...HIGH_END_HW]} iconClassName="text-rose-400" />
      <h4 className="mb-2 font-medium text-sm">{t('help.highEndSoftware')}</h4>
      <HighEndSoftwareList />
      <h4 className="mb-2 font-medium text-sm">{t('help.highEndNetwork')}</h4>
      <HighEndNetworkList />
    </HelpSectionShell>
  );
};
