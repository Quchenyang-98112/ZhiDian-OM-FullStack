import { useTranslation } from 'react-i18next';
import type { CommandPreview } from '../../core/commands/types';

interface CommandPalettePreviewBodyProps {
  previewData: CommandPreview;
}

export function CommandPalettePreviewBody({ previewData }: CommandPalettePreviewBodyProps) {
  const { t } = useTranslation();

  return (
    <>
      <h3 className="font-medium text-sm">{t(previewData.titleKey)}</h3>
      {previewData.bodyKey ? (
        <p className="mt-1 text-(--color-muted) text-xs">{t(previewData.bodyKey)}</p>
      ) : null}
      {previewData.metrics?.length ? (
        <dl className="mt-3 space-y-2">
          {previewData.metrics.map((m) => (
            <div key={m.labelKey} className="flex justify-between gap-2 text-xs">
              <dt className="text-(--color-muted)">{t(m.labelKey)}</dt>
              <dd className="font-mono">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {previewData.impactKey ? (
        <p className="mt-3 text-amber-400 text-xs">{t(previewData.impactKey)}</p>
      ) : null}
    </>
  );
}
