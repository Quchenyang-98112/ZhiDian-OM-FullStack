import { Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PageMeta } from '../../../lib/page-relations';
import { RelatedPageCard } from './RelatedPageCard';

export interface RelatedPagesSectionProps {
  relatedPages: PageMeta[];
}

/** Grid of related feature pages shown at the bottom of each route. */
export const RelatedPagesSection = ({ relatedPages }: RelatedPagesSectionProps) => {
  const { t } = useTranslation();

  if (relatedPages.length === 0) return null;

  return (
    <section className="glass-panel-strong rounded-2xl p-5">
      <div className="mb-4 flex items-center gap-2">
        <Lightbulb size={16} className="text-(--color-primary)" aria-hidden="true" />
        <h3 className="font-semibold text-(--color-text) text-sm">
          {t('crossLinks.relatedTitle')}
        </h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {relatedPages.map((page) => (
          <RelatedPageCard key={page.id} page={page} />
        ))}
      </div>
    </section>
  );
};
