import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SyncState } from '../lib/db';
import { resolveSyncConflict } from '../lib/sync-conflict';

interface SyncConflictDialogProps {
  conflict: SyncState | null;
  isOpen: boolean;
  onClose: () => void;
  onResolved: () => void;
}

function formatSyncTime(timestamp: number, locale: string, fallback: string): string {
  if (!timestamp) return fallback;
  return new Date(timestamp).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function SyncConflictDialog({
  conflict,
  isOpen,
  onClose,
  onResolved,
}: SyncConflictDialogProps) {
  const { t, i18n } = useTranslation();
  const [resolveError, setResolveError] = useState<string | null>(null);

  if (!conflict) return null;

  const handleResolve = async (resolution: 'local' | 'server') => {
    try {
      setResolveError(null);
      await resolveSyncConflict(conflict.key, resolution);
      onResolved();
      onClose();
    } catch {
      setResolveError(t('offline.syncConflictResolveError'));
    }
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-modal-backdrop bg-black/80 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Content
          className="glass-panel focus-ring fixed top-1/2 left-1/2 z-modal w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-(--color-border) p-6 shadow-2xl data-[state=closed]:animate-out data-[state=open]:animate-in"
          aria-describedby="sync-conflict-description"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-(--state-warning-bg)/15 p-2">
                <AlertTriangle className="h-5 w-5 text-(--state-warning-fg)" aria-hidden="true" />
              </div>
              <Dialog.Title className="font-semibold text-(--color-text) text-lg">
                {t('offline.syncConflictTitle')}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="focus-ring rounded-lg p-1 text-(--color-text-muted) hover:bg-(--color-surface-hover)"
                aria-label={t('common.close')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description
            id="sync-conflict-description"
            className="mb-4 text-(--color-text-muted) text-sm"
          >
            {t('offline.syncConflictDescription')}
          </Dialog.Description>

          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3">
              <p className="mb-1 font-medium text-(--color-text) text-sm">
                {t('offline.localVersion')}
              </p>
              <p className="text-(--color-text-muted) text-xs">
                {t('offline.localVersionTime', {
                  time: formatSyncTime(conflict.lastSyncedAt, i18n.language, t('common.noData')),
                })}
              </p>
            </div>
            <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-3">
              <p className="mb-1 font-medium text-(--color-text) text-sm">
                {t('offline.serverVersion')}
              </p>
              <p className="text-(--color-text-muted) text-xs">
                {t('offline.serverVersionValue', {
                  version: conflict.serverVersion || t('common.noData'),
                })}
              </p>
            </div>
          </div>

          {resolveError ? (
            <p className="mb-4 text-(--state-error-fg) text-sm" role="alert">
              {resolveError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => void handleResolve('server')}
              className="focus-ring rounded-lg border border-(--color-border) px-4 py-2 font-medium text-(--color-text) text-sm hover:bg-(--color-surface-hover)"
            >
              {t('offline.acceptServer')}
            </button>
            <button
              type="button"
              onClick={() => void handleResolve('local')}
              className="focus-ring rounded-lg bg-(--color-accent) px-4 py-2 font-semibold text-(--color-accent-on) text-sm hover:opacity-90"
            >
              {t('offline.keepLocal')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
