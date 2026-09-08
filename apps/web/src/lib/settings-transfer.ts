import type { TFunction } from 'i18next';
import type { useConfirmDialog } from '../components/ConfirmDialog';
import { parseStoredSettingsImport } from '../core/stored-settings-schema';
import type { StoredSettings } from '../types';

type ConfirmApi = ReturnType<typeof useConfirmDialog>;

export function triggerSettingsExport(
  settings: StoredSettings,
  confirm: ConfirmApi,
  t: TFunction,
  onExported: () => void,
): void {
  confirm.openDialog({
    title: t('settings.confirmExportTitle'),
    message: t('settings.confirmExportMessage'),
    confirmText: t('settings.confirmExportAction'),
    variant: 'info',
    onConfirm: () => {
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nexus-hems-settings.json';
      a.click();
      URL.revokeObjectURL(url);
      onExported();
    },
  });
}

export function triggerSettingsImport(
  updateSettings: (settings: Partial<StoredSettings>) => void,
  confirm: ConfirmApi,
  t: TFunction,
  onImported: () => void,
): void {
  confirm.openDialog({
    title: t('settings.confirmImportTitle'),
    message: t('settings.confirmImportMessage'),
    confirmText: t('settings.confirmImportAction'),
    variant: 'warning',
    onConfirm: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        if (file.size > 1024 * 1024) {
          confirm.openDialog({
            title: t('common.error'),
            message: t('settings.importFileTooLarge'),
            confirmText: t('common.dismiss'),
            variant: 'danger',
            onConfirm: () => {},
          });
          return;
        }
        try {
          const data = JSON.parse(await file.text());
          if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            throw new Error('invalid');
          }
          const parsed = parseStoredSettingsImport(data);
          if (!parsed) throw new Error('invalid');
          updateSettings(parsed);
          onImported();
        } catch {
          confirm.openDialog({
            title: t('common.error'),
            message: t('common.importError'),
            confirmText: t('common.dismiss'),
            variant: 'danger',
            onConfirm: () => {},
          });
        }
      };
      input.click();
    },
  });
}
