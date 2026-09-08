/** Settings → Energy tab: tariff provider/token, system presets, PV strings, grid limits, feed-in. */

import {
  EnergyBatterySection,
  EnergyConsumersSection,
  EnergyGridExtrasSection,
  EnergyInverterSection,
  EnergyLocationSection,
  EnergyPvSection,
  EnergySystemPresetSection,
  EnergyTariffSection,
} from './energy-tab-sections';
import { SettingsFeatureBar } from './SettingsFeatureBar';

export function EnergyTab() {
  return (
    <>
      <SettingsFeatureBar tabId="energy" />
      <EnergyTariffSection />
      <EnergySystemPresetSection />
      <EnergyInverterSection />
      <EnergyPvSection />
      <EnergyBatterySection />
      <EnergyConsumersSection />
      <EnergyLocationSection />
      <EnergyGridExtrasSection />
    </>
  );
}
