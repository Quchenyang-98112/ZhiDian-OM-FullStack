import { Maximize2, Minimize2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type HTMLAttributes, type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EnergyData } from '../../types';
import { SankeyDiagram } from '../SankeyDiagram';

export interface OptimizedSankeyProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Current energy data to visualize */
  data: EnergyData;
  /** Optional floating detail panel rendered beside the Sankey */
  detailPanel?: ReactNode;
  /** Whether the detail panel is open */
  detailOpen?: boolean;
  /** Callback to close the detail panel */
  onDetailClose?: () => void;
  /** Enable fullscreen toggle button */
  allowFullscreen?: boolean;
  /** Optional header actions (e.g. timeframe selector) */
  headerActions?: ReactNode;
}

/**
 * Enhanced wrapper around the existing D3 SankeyDiagram.
 *
 * Adds:
 * - Floating contextual detail panel (slides in from the right)
 * - Fullscreen toggle for immersive energy flow viewing
 * - Accessible header with optional actions
 * - Responsive layout that adapts panel placement for mobile
 *
 * @example
 * ```tsx
 * <OptimizedSankey
 *   data={energyData}
 *   detailPanel={<AdapterDetail adapter={selected} />}
 *   detailOpen={!!selected}
 *   onDetailClose={() => setSelected(null)}
 *   allowFullscreen
 * />
 * ```
 */
export function OptimizedSankey({
  data,
  detailPanel,
  detailOpen = false,
  onDetailClose,
  allowFullscreen = false,
  headerActions,
  className = '',
  ...props
}: OptimizedSankeyProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col ${isFullscreen ? 'bg-(--color-background)' : ''} ${className}`}
      {...props}
    >
      {/* Optional header bar */}
      {(allowFullscreen || headerActions) && (
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <div className="flex items-center gap-2">{headerActions}</div>
          {allowFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-(--color-muted) transition-colors hover:bg-(--color-surface) hover:text-(--color-text)"
              aria-label={isFullscreen ? t('sankey.exitFullscreen') : t('sankey.enterFullscreen')}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      )}

      {/* Main content: Sankey + optional side panel */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Sankey canvas — shrinks when detail panel is open on desktop */}
        <div
          className={`relative flex-1 transition-all duration-300 ${detailOpen ? 'lg:mr-112' : ''}`}
        >
          <SankeyDiagram data={data} />
        </div>

        {/* Floating detail panel */}
        <AnimatePresence>
          {detailOpen && detailPanel && (
            <>
              {/* Mobile backdrop */}
              <motion.div
                className="fixed inset-0 z-modal-backdrop bg-black/40 backdrop-blur-sm lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onDetailClose}
                aria-hidden="true"
              />

              {/* Panel */}
              <motion.aside
                className="glass-panel-strong fixed top-0 right-0 z-modal flex h-full w-full max-w-md flex-col lg:absolute"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                role="complementary"
                aria-label={t('sankey.detailPanel')}
              >
                {/* Panel header with close */}
                <div className="flex items-center justify-between border-(--color-border) border-b px-4 py-3">
                  <span className="eyebrow text-(--color-muted)">{t('sankey.details')}</span>
                  {onDetailClose && (
                    <button
                      type="button"
                      onClick={onDetailClose}
                      className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-(--color-muted) transition-colors hover:bg-(--color-surface) hover:text-(--color-text)"
                      aria-label={t('common.close')}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Panel body — scrollable */}
                <div className="flex-1 overflow-y-auto p-4">{detailPanel}</div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
