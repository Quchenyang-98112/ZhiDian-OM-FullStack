import type { TFunction } from 'i18next';
import { Check, Server, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

export interface AdapterConfigEntryActionsProps {
  onRemove: () => void;
  onSave: () => void;
  isReadOnly: boolean;
  isSaving: boolean;
  isSaved: boolean;
  t: TFunction;
}

/** Remove and save action buttons for one adapter config entry. */
export const AdapterConfigEntryActions = ({
  onRemove,
  onSave,
  isReadOnly,
  isSaving,
  isSaved,
  t,
}: AdapterConfigEntryActionsProps) => (
  <div className="flex items-center justify-between border-(--color-border) border-t pt-4">
    <motion.button
      type="button"
      onClick={onRemove}
      disabled={isReadOnly}
      className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-rose-400 text-xs transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Trash2 size={14} />
      {t('adapterConfig.remove')}
    </motion.button>
    <motion.button
      type="button"
      onClick={onSave}
      disabled={isReadOnly || isSaving}
      className="flex items-center gap-2 rounded-xl bg-(--color-text) px-4 py-2 font-medium text-(--color-background) text-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
    >
      {isSaved ? <Check size={16} /> : <Server size={16} />}
      {isSaved ? t('common.saved') : isSaving ? t('common.saving') : t('common.save')}
    </motion.button>
  </div>
);
