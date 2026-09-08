import { getAdapterSettingsSection } from '../../core/adapters/settings-section-registry';
import { useReadOnlyModeActive } from '../../lib/use-read-only-mode';

/** Renders a registered contrib adapter settings section by adapter id. */
export const RegisteredAdapterSettingsSection = ({ adapterId }: { adapterId: string }) => {
  const isReadOnly = useReadOnlyModeActive();
  const section = getAdapterSettingsSection(adapterId);
  if (!section) {
    if (import.meta.env.DEV) {
      console.warn(`No settings section registered for adapterId "${adapterId}"`);
    }
    return null;
  }

  const { Component } = section;
  return <Component adapterId={adapterId} isReadOnly={isReadOnly} />;
};
