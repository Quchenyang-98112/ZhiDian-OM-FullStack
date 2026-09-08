import type { PageId } from '../../../lib/page-relations';
import { PAGE_REGISTRY, PAGE_RELATIONS } from '../../../lib/page-relations';

/** Resolve cross-link footer data for the current route, or null when hidden. */
export const resolvePageCrossLinks = (pathname: string) => {
  const clean = pathname.replace(/\/$/, '') || '/';
  let pageId: PageId | null = null;
  for (const [id, meta] of Object.entries(PAGE_REGISTRY) as [
    PageId,
    (typeof PAGE_REGISTRY)[PageId],
  ][]) {
    if (meta.path === clean) {
      pageId = id;
      break;
    }
  }
  if (!pageId || !PAGE_RELATIONS[pageId]) return null;
  if (pageId === 'settings' || pageId === 'help' || pageId === 'ai-settings') return null;

  const relations = PAGE_RELATIONS[pageId];
  const relatedPages = relations.related.map((id) => PAGE_REGISTRY[id]).filter(Boolean);

  return { relations, relatedPages };
};
