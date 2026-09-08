import { HomeAssistantSettingsSection } from '../../components/settings/HomeAssistantSettingsSection';
import { registerAdapterSettingsSection } from './settings-section-registry';

let registered = false;

/** Register built-in adapter settings sections. Safe to call multiple times. */
export function registerBuiltinAdapterSettingsSections(): void {
  if (registered) return;
  registered = true;
  registerAdapterSettingsSection({
    adapterId: 'homeassistant-mqtt',
    order: 10,
    Component: HomeAssistantSettingsSection,
  });
}
