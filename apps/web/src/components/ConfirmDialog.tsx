/**
 * Confirmation Dialog Component — Radix UI Dialog primitive
 * Provides proper focus trapping, Escape handling, portal rendering, and ARIA
 */

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
}

const variantStyles = {
  danger: {
    icon: AlertTriangle,
    iconBg: 'bg-(--state-danger-bg)/15',
    iconColor: 'text-(--state-danger-fg)',
    confirmButton: 'bg-(--state-danger-bg) text-(--state-danger-on) hover:opacity-90',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-(--state-warning-bg)/15',
    iconColor: 'text-(--state-warning-fg)',
    confirmButton: 'bg-(--state-warning-bg) text-(--state-warning-on) hover:opacity-90',
  },
  info: {
    icon: Info,
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
    confirmButton: 'bg-(--color-text) hover:opacity-90 text-(--color-background) font-bold',
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'info',
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const styles = variantStyles[variant];
  const Icon = styles.icon;

  const handleConfirm = async () => {
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('[ConfirmDialog] Confirmation action failed:', error);
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
          className="glass-panel fixed top-1/2 left-1/2 z-modal mx-4 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl"
          aria-describedby="confirm-dialog-message"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="flex items-start gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${styles.iconBg}`}
            >
              <Icon className={`h-6 w-6 ${styles.iconColor}`} aria-hidden="true" />
            </div>
            <div className="flex-1">
              <Dialog.Title
                id="confirm-dialog-title"
                className="font-semibold text-(--color-text) text-lg"
              >
                {title}
              </Dialog.Title>
              <Dialog.Description
                className="mt-2 text-(--color-muted) text-sm"
                id="confirm-dialog-message"
              >
                {typeof message === 'string' ? message : <div>{message}</div>}
              </Dialog.Description>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button
                disabled={loading}
                className="btn-secondary focus-ring px-4 py-2"
                type="button"
              >
                {cancelText || t('common.cancel', 'Cancel')}
              </button>
            </Dialog.Close>
            <button
              onClick={handleConfirm}
              disabled={loading}
              aria-busy={loading}
              className={`focus-ring rounded-xl px-4 py-2 font-medium transition-colors disabled:opacity-50 ${styles.confirmButton}`}
              type="button"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {t('common.processing', 'Processing...')}
                </span>
              ) : (
                confirmText || t('common.confirm', 'Confirm')
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Hook for managing confirmation dialogs
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useConfirmDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [dialogProps, setDialogProps] = useState<Omit<ConfirmDialogProps, 'isOpen' | 'onClose'>>({
    onConfirm: () => {},
    title: '',
    message: '',
  });

  const openDialog = (props: Omit<ConfirmDialogProps, 'isOpen' | 'onClose'>) => {
    setDialogProps(props);
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
  };

  return {
    isOpen,
    openDialog,
    closeDialog,
    dialogProps: {
      ...dialogProps,
      isOpen,
      onClose: closeDialog,
    },
  };
}
