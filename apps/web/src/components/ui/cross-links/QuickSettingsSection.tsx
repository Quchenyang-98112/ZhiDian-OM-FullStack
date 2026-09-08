import { ArrowRight, Circle, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { PageRelation } from '../../../lib/page-relations';

export interface QuickSettingsSectionProps {
  settingsLinks: PageRelation['settingsLinks'];
  setupReqs: PageRelation['setupRequirements'];
}

/** Settings shortcuts and pending setup requirements for the current page. */
export const QuickSettingsSection = ({ settingsLinks, setupReqs }: QuickSettingsSectionProps) => {
  const { t } = useTranslation();

  if (settingsLinks.length === 0 && setupReqs.length === 0) return null;

  return (
    <section className="rounded-2xl border border-(--color-border) bg-(--color-surface)/50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <ExternalLink size={14} className="text-(--color-muted)" aria-hidden="true" />
        <h3 className="font-semibold text-(--color-text) text-sm">
          {t('crossLinks.quickSettings')}
        </h3>
      </div>
      <div className="space-y-2">
        {settingsLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.tab}
              to={`/settings?tab=${link.tab}`}
              className="focus-ring flex items-center gap-3 rounded-lg border border-(--color-border)/20 bg-white/3 p-2.5 text-sm transition-colors hover:bg-white/8"
            >
              <Icon size={14} className="shrink-0 text-(--color-primary)" aria-hidden="true" />
              <span className="flex-1 text-(--color-text)">{t(link.i18nKey)}</span>
              <ArrowRight size={12} className="shrink-0 text-(--color-muted)" aria-hidden="true" />
            </Link>
          );
        })}
        {setupReqs.map((req) => (
          <Link
            key={req.settingsTab + req.i18nKey}
            to={`/settings?tab=${req.settingsTab}`}
            className="focus-ring flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-sm transition-colors hover:bg-amber-500/10"
          >
            <Circle size={12} className="shrink-0 text-amber-400" aria-hidden="true" />
            <span className="flex-1 text-amber-300/80">{t(req.i18nKey)}</span>
            <ArrowRight size={12} className="shrink-0 text-amber-400/60" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
};
