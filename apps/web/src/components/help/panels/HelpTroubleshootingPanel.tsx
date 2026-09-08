import { Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HelpTabPanelShell } from '../HelpTabPanelShell';
import { HelpPerfTip } from './HelpPerfTip';
import { HelpTroubleshootingDisclosures } from './HelpTroubleshootingDisclosures';

const PERF_TIP_KEYS = ['help.perf1', 'help.perf2', 'help.perf3', 'help.perf4'] as const;

/** Troubleshooting FAQ and performance tips panel on the Help page. */
export const HelpTroubleshootingPanel = () => {
  const { t } = useTranslation();

  return (
    <HelpTabPanelShell tabKey="troubleshooting">
      <div className="glass-panel-strong rounded-2xl p-6">
        <h2 className="mb-6 font-semibold text-xl">{t('help.troubleshootingTitle')}</h2>
        <HelpTroubleshootingDisclosures />
      </div>

      <div className="glass-panel-strong rounded-2xl p-6">
        <h3 className="mb-4 flex items-center gap-2 font-medium text-lg">
          <Gauge size={20} className="text-indigo-400" />
          {t('help.perfTips')}
        </h3>
        <div className="space-y-3 text-(--color-muted) text-sm">
          {PERF_TIP_KEYS.map((key) => (
            <HelpPerfTip key={key} text={t(key)} />
          ))}
        </div>
      </div>
    </HelpTabPanelShell>
  );
};
