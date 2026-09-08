import { AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SyncState } from '../lib/db';
import { getConflictedSyncStates, SYNC_CONFLICT_EVENT } from '../lib/sync-conflict';
import { SyncConflictDialog } from './SyncConflictDialog';

export function OfflineSyncConflictBanner() {
  const { t } = useTranslation();
  const [conflicts, setConflicts] = useState<SyncState[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeConflict, setActiveConflict] = useState<SyncState | null>(null);
  const refreshSeq = useRef(0);

  const refreshConflicts = useCallback(async () => {
    const seq = ++refreshSeq.current;
    if (!navigator.onLine) {
      if (seq === refreshSeq.current) setConflicts([]);
      return;
    }
    const rows = await getConflictedSyncStates();
    if (seq !== refreshSeq.current) return;
    setConflicts(rows);
    if (rows.length === 0) {
      setDialogOpen(false);
      setActiveConflict(null);
    }
  }, []);

  useEffect(() => {
    void refreshConflicts();

    const onConflict = () => {
      void refreshConflicts();
    };
    const onOnline = () => {
      void refreshConflicts();
    };

    window.addEventListener(SYNC_CONFLICT_EVENT, onConflict);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener(SYNC_CONFLICT_EVENT, onConflict);
      window.removeEventListener('online', onOnline);
    };
  }, [refreshConflicts]);

  const openDetails = () => {
    const first = conflicts[0] ?? null;
    setActiveConflict(first);
    setDialogOpen(true);
  };

  if (conflicts.length === 0) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          className="fixed top-0 right-0 left-0 z-notification border-(--state-warning-fg)/30 border-b bg-(--state-warning-bg)/95 px-4 py-3 text-(--state-warning-on) shadow-lg backdrop-blur-3xl"
          role="alert"
          aria-atomic="true"
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="font-semibold text-sm sm:text-base">
                {t('offline.conflictsDetected', { count: conflicts.length })}
              </p>
            </div>
            <button
              type="button"
              onClick={openDetails}
              className="focus-ring shrink-0 rounded-lg bg-black/15 px-4 py-2 font-medium text-sm hover:bg-black/25"
            >
              {t('offline.viewConflicts')}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      <SyncConflictDialog
        conflict={activeConflict}
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onResolved={() => void refreshConflicts()}
      />
    </>
  );
}
