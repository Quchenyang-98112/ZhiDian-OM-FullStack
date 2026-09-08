import { useTranslation } from 'react-i18next';
import { HELP_GLOSSARY_ENTRIES } from '../../../lib/help-content-manifest';
import { HelpTabPanelShell } from '../HelpTabPanelShell';

export const HelpLexiconPanel = () => {
  const { t } = useTranslation();

  return (
    <HelpTabPanelShell tabKey="lexicon">
      <div className="glass-panel-strong rounded-2xl p-6">
        <h2 className="mb-6 font-semibold text-xl">{t('help.glossaryTitle')}</h2>
        <dl className="space-y-4">
          {HELP_GLOSSARY_ENTRIES.map((entry) => (
            <div
              key={entry.termKey}
              className="border-(--color-border) border-b pb-4 last:border-0"
            >
              <dt className="font-medium text-(--color-primary) text-sm">{t(entry.termKey)}</dt>
              <dd className="mt-1 text-(--color-muted) text-sm leading-relaxed">
                {t(entry.descKey)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </HelpTabPanelShell>
  );
};
