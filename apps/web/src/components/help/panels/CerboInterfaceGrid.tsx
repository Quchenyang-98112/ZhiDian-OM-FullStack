import { useTranslation } from 'react-i18next';

const CERBO_INTERFACES = [
  'cerboGxInt1',
  'cerboGxInt2',
  'cerboGxInt3',
  'cerboGxInt4',
  'cerboGxInt5',
  'cerboGxInt6',
] as const;

/** Grid of Cerbo GX interface labels in the integration guide. */
export const CerboInterfaceGrid = () => {
  const { t } = useTranslation();

  return (
    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {CERBO_INTERFACES.map((k) => (
        <div
          key={k}
          className="rounded-lg border border-(--color-border) bg-(--color-surface) p-2.5 text-(--color-muted) text-xs"
        >
          {t(`help.${k}`)}
        </div>
      ))}
    </div>
  );
};
