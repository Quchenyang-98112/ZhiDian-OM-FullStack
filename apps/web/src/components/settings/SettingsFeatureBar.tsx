import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PAGE_REGISTRY, SETTINGS_TABS, type SettingsTabId } from '../../lib/page-relations';

/** Cross-link bar surfacing the app pages each Settings tab affects. */
export function SettingsFeatureBar({ tabId }: { tabId: SettingsTabId }) {
  const { t } = useTranslation();
  const meta = SETTINGS_TABS[tabId];
  if (!meta || meta.relatedPages.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-(--color-primary)/15 bg-(--color-primary)/5 p-3">
      <p className="mb-2 font-semibold text-(--color-primary) text-[10px] uppercase tracking-wider">
        {t('crossLinks.affectedFeatures')}
      </p>
      <div className="flex flex-wrap gap-2">
        {meta.relatedPages.map((pageId) => {
          const page = PAGE_REGISTRY[pageId];
          if (!page) return null;
          const Icon = page.icon;
          return (
            <Link
              key={pageId}
              to={page.path}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-(--color-border)/30 bg-white/5 px-2.5 py-1.5 text-(--color-text) text-xs transition-colors hover:bg-white/10 hover:text-(--color-primary)"
            >
              <Icon size={12} aria-hidden="true" />
              {t(page.i18nKey)}
              <ArrowRight size={10} className="text-(--color-muted)" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
