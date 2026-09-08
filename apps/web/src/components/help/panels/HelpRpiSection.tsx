import { Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HelpChecklist } from './HelpChecklist';
import { HelpNumberedSteps } from './HelpNumberedSteps';
import { HelpSectionShell } from './HelpSectionShell';
import { RpiComparisonTable } from './RpiComparisonTable';
import { RpiPerfList } from './RpiPerfList';

const RPI_HARDWARE = [
  'rpiModel',
  'rpiPower',
  'rpiStorage',
  'rpiNetwork',
  'rpiHat',
  'rpiCan',
] as const;
const RPI_SETUP = [
  'rpiSetup1',
  'rpiSetup2',
  'rpiSetup3',
  'rpiSetup4',
  'rpiSetup5',
  'rpiSetup6',
  'rpiSetup7',
] as const;

/** Raspberry Pi integration section in the Help integration guide. */
export const HelpRpiSection = () => {
  const { t } = useTranslation();

  return (
    <HelpSectionShell
      icon={Cpu}
      iconClassName="bg-green-500/15 text-green-400"
      title={t('help.rpiTitle')}
    >
      <p className="mb-4 text-(--color-muted) text-sm leading-relaxed">{t('help.rpiIntro')}</p>
      <h4 className="mb-2 font-medium text-sm">{t('help.rpiRecommended')}</h4>
      <HelpChecklist keys={[...RPI_HARDWARE]} iconClassName="text-green-400" />
      <h4 className="mb-2 font-medium text-sm">{t('help.rpiSetup')}</h4>
      <HelpNumberedSteps keys={[...RPI_SETUP]} badgeClassName="bg-green-500/15 text-green-400" />
      <h4 className="mb-2 font-medium text-sm">{t('help.rpiPerformance')}</h4>
      <RpiPerfList />
      <h4 className="mb-2 font-medium text-sm">{t('help.rpiVsGx')}</h4>
      <RpiComparisonTable />
    </HelpSectionShell>
  );
};
