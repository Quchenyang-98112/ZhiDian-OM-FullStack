import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { PageMeta } from '../../../lib/page-relations';

interface RelatedPageCardProps {
  page: PageMeta;
}

export const RelatedPageCard = ({ page }: RelatedPageCardProps) => {
  const { t } = useTranslation();
  const Icon = page.icon;

  return (
    <Link
      to={page.path}
      className="focus-ring group flex items-center gap-3 rounded-xl border border-(--color-border)/30 bg-white/5 p-3 transition-all hover:border-(--color-primary)/40 hover:bg-white/10"
    >
      <div className="rounded-lg border border-(--color-border)/20 bg-white/5 p-2">
        <Icon
          size={16}
          className="text-(--color-primary) transition-transform group-hover:scale-110"
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-(--color-text) text-sm">{t(page.i18nKey)}</p>
        <p className="truncate text-(--color-muted) text-[10px]">
          {t(`crossLinks.desc.${page.id}`)}
        </p>
      </div>
      <ChevronRight
        size={14}
        className="shrink-0 text-(--color-muted) opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      />
    </Link>
  );
};
