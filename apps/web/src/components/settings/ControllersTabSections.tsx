import { useReadOnlyModeActive } from '../../lib/use-read-only-mode';
import { useAppStoreShallow } from '../../store';
import {
  ControllersCommandSafetySection,
  ControllersFeatureLinksSection,
} from './ControllersAuxSections';
import { ControllersMpcSection } from './ControllersMpcSection';
import { ControllersPipelineSection } from './ControllersPipelineSection';
import { SettingsFeatureBar } from './SettingsFeatureBar';

/** Controllers tab body — extracted to keep ControllersTab JSX shallow for static analysis. */
export function ControllersTabSections() {
  const { settings, updateSettings } = useAppStoreShallow((s) => ({
    settings: s.settings,
    updateSettings: s.updateSettings,
  }));
  const isReadOnly = useReadOnlyModeActive();

  return (
    <>
      <SettingsFeatureBar tabId="controllers" />
      <ControllersPipelineSection />
      <ControllersMpcSection
        settings={settings}
        updateSettings={updateSettings}
        isReadOnly={isReadOnly}
      />
      <ControllersCommandSafetySection />
      <ControllersFeatureLinksSection />
    </>
  );
}
