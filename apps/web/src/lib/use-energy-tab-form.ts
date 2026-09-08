import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStoreShallow } from '../store';
import { useReadOnlyModeActive } from './use-read-only-mode';

/** Shared Energy tab form state for section subcomponents. */
export function useEnergyTabForm() {
  const { t } = useTranslation();
  const { settings, updateSettings: applySettings } = useAppStoreShallow((s) => ({
    settings: s.settings,
    updateSettings: s.updateSettings,
  }));
  const isReadOnly = useReadOnlyModeActive();
  const setIfEditable = (patch: Parameters<typeof applySettings>[0]) => {
    if (!isReadOnly) applySettings(patch);
  };
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const toggleTokenVisibility = (key: string) =>
    setShowTokens((prev) => ({ ...prev, [key]: !prev[key] }));

  return {
    t,
    settings,
    isReadOnly,
    setIfEditable,
    showTokens,
    toggleTokenVisibility,
  };
}
