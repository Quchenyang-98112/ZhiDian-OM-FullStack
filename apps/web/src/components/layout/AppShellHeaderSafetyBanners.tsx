import { AlertTriangle, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Props for {@link AppShellHeaderSafetyBanners}. */
export interface AppShellHeaderSafetyBannersProps {
  /** Whether live adapter mode is active. */
  isLive: boolean;
  /** Whether the backend enforces read-only mode. */
  isReadOnly: boolean;
}

/**
 * Live-hardware and read-only safety banners shown above the header row.
 */
export function AppShellHeaderSafetyBanners({
  isLive,
  isReadOnly,
}: AppShellHeaderSafetyBannersProps) {
  const { t } = useTranslation();

  return (
    <>
      {isLive && (
        <div
          role="alert"
          className="-mx-3 -mt-1.5 mb-2 flex items-center justify-center gap-2 bg-(--state-live-bg) px-3 py-1 text-center font-bold text-(--state-live-on) text-xs uppercase tracking-wider sm:-mx-6 sm:-mt-3 sm:mb-3"
        >
          <AlertTriangle size={14} aria-hidden="true" />
          {t('mode.liveBannerWarning')}
        </div>
      )}

      {isReadOnly && (
        <div
          role="status"
          className="-mx-3 -mt-1.5 mb-2 flex items-center justify-center gap-2 border-(--state-warning-border) border-b bg-(--state-warning-bg)/20 px-3 py-1 text-center font-semibold text-(--state-warning-fg) text-xs uppercase tracking-wider sm:-mx-6 sm:-mt-3 sm:mb-3"
        >
          <Lock size={14} aria-hidden="true" />
          {t('mode.readOnlyBannerWarning')}
        </div>
      )}
    </>
  );
}
