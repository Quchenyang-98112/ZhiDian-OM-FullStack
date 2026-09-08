import { Info, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CerboInterfaceGrid } from './CerboInterfaceGrid';
import { HelpChecklist } from './HelpChecklist';
import { HelpNumberedSteps } from './HelpNumberedSteps';
import { HelpSectionShell } from './HelpSectionShell';

const CERBO_SPECS = [
  'cerboGxSpec1',
  'cerboGxSpec2',
  'cerboGxSpec3',
  'cerboGxSpec4',
  'cerboGxSpec5',
  'cerboGxSpec6',
] as const;

const CERBO_SETUP = [
  'cerboGxSetup1',
  'cerboGxSetup2',
  'cerboGxSetup3',
  'cerboGxSetup4',
  'cerboGxSetup5',
  'cerboGxSetup6',
  'cerboGxSetup7',
] as const;

/** Cerbo GX / MK2 integration section in the Help integration guide. */
export const HelpCerboGxSection = () => {
  const { t } = useTranslation();

  return (
    <HelpSectionShell
      icon={Server}
      iconClassName="bg-blue-500/15 text-blue-400"
      title={t('help.cerboGxTitle')}
    >
      <p className="mb-4 text-(--color-muted) text-sm leading-relaxed">{t('help.cerboGxIntro')}</p>
      <h4 className="mb-2 font-medium text-sm">{t('help.cerboGxSpecs')}</h4>
      <HelpChecklist keys={[...CERBO_SPECS]} iconClassName="text-emerald-400" />
      <h4 className="mb-2 font-medium text-sm">{t('help.cerboGxInterfaces')}</h4>
      <CerboInterfaceGrid />
      <h4 className="mb-2 font-medium text-sm">{t('help.cerboGxSetup')}</h4>
      <HelpNumberedSteps
        keys={[...CERBO_SETUP]}
        badgeClassName="bg-(--color-primary)/15 text-(--color-primary)"
      />
      <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-blue-400" />
        <p className="text-(--color-muted) text-xs">{t('help.cerboGxNote')}</p>
      </div>
    </HelpSectionShell>
  );
};
