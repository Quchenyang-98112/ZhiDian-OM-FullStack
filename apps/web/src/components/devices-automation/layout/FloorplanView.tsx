import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

// Heavy interactive SVG — kept lazy so it only loads for the floorplan view.
const Floorplan = lazy(() => import('../../Floorplan').then((m) => ({ default: m.Floorplan })));

export function FloorplanView() {
  const { t } = useTranslation();
  return (
    <section
      className="glass-panel-strong overflow-hidden rounded-2xl p-4 sm:p-6"
      aria-label={t('dashboard.floorplan')}
    >
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center" role="status">
            <div className="h-6 w-6 animate-spin rounded-full border-(--color-primary) border-2 border-t-transparent" />
          </div>
        }
      >
        <Floorplan />
      </Suspense>
    </section>
  );
}
