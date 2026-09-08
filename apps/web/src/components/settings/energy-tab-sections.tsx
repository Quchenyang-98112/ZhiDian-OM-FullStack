import { Gauge, HardDrive, MapPin, Server, Zap } from 'lucide-react';
import { useEnergyTabForm } from '../../lib/use-energy-tab-form';
import { type PVConfig, SYSTEM_PRESETS } from '../../types';
import { SelectField } from '../ui/SelectField';
import {
  EnergyApiTokenField,
  EnergyDynamicGridFeesField,
  EnergyRangeField,
} from './energy-tab-field-primitives';
import { EnergySectionHeader, EnergyTariffProviderField } from './energy-tariff-fields';
import { inputClass, sectionClass, sectionHeaderClass } from './styles';

export function EnergyTariffSection() {
  const { t, settings, isReadOnly, setIfEditable, showTokens, toggleTokenVisibility } =
    useEnergyTabForm();

  return (
    <section className={sectionClass}>
      <EnergySectionHeader
        icon={Zap}
        iconClassName="text-yellow-400"
        title={t('settings.energy')}
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <EnergyTariffProviderField
          t={t}
          value={settings.tariffProvider}
          isReadOnly={isReadOnly}
          onChange={(provider) => setIfEditable({ tariffProvider: provider })}
        />
        <EnergyApiTokenField
          t={t}
          isReadOnly={isReadOnly}
          visible={Boolean(showTokens.tariff)}
          onToggle={() => toggleTokenVisibility('tariff')}
        />
        <EnergyRangeField
          id="settings-charge-threshold"
          label={t('settings.chargeThreshold')}
          value={settings.chargeThreshold}
          min={0}
          max={1}
          step={0.01}
          valueText={`${settings.chargeThreshold.toFixed(2)} €`}
          ariaValuetext={`${settings.chargeThreshold.toFixed(2)} €/kWh`}
          isReadOnly={isReadOnly}
          onChange={(value) => setIfEditable({ chargeThreshold: value })}
        />
        <EnergyRangeField
          id="settings-max-grid"
          label={t('settings.maxGrid')}
          value={settings.maxGridImportKw}
          min={1}
          max={15}
          step={0.1}
          valueText={`${settings.maxGridImportKw.toFixed(1)} kW`}
          ariaValuetext={`${settings.maxGridImportKw.toFixed(1)} kW`}
          isReadOnly={isReadOnly}
          onChange={(value) => setIfEditable({ maxGridImportKw: value })}
          hint={t('settings.maxGridHint', '§14a EnWG limit: 4.2 kW for controllable consumers')}
        />
        <EnergyDynamicGridFeesField
          t={t}
          enabled={settings.dynamicGridFees}
          isReadOnly={isReadOnly}
          onToggle={() => setIfEditable({ dynamicGridFees: !settings.dynamicGridFees })}
        />
        <div className="space-y-2">
          <label htmlFor="settings-grid-operator" className="font-medium text-sm">
            {t('settings.gridOperatorLabel')}
          </label>
          <input
            id="settings-grid-operator"
            type="text"
            disabled={isReadOnly}
            className={inputClass}
            value={settings.gridOperatorName}
            onChange={(e) => setIfEditable({ gridOperatorName: e.target.value })}
            placeholder={t('settings.gridOperatorInputPlaceholder')}
          />
        </div>
      </div>
    </section>
  );
}

export function EnergySystemPresetSection() {
  const { t, settings, isReadOnly, setIfEditable } = useEnergyTabForm();

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <Server size={20} className="text-cyan-400" />
        {t('settings.systemPreset')}
      </h2>
      <p className="mb-4 text-(--color-muted) text-xs">{t('settings.systemPresetHint')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Object.values(SYSTEM_PRESETS).map((preset) => (
          <button
            key={preset.presetId}
            type="button"
            disabled={isReadOnly}
            onClick={() => setIfEditable({ systemConfig: { ...preset } })}
            className={`rounded-xl border-2 p-3 text-left transition-all ${
              settings.systemConfig.presetId === preset.presetId
                ? 'border-(--color-primary) bg-(--color-primary)/10'
                : 'border-(--color-border) bg-(--color-surface) hover:border-(--color-primary)/40'
            }`}
            aria-pressed={settings.systemConfig.presetId === preset.presetId}
          >
            <span className="font-medium text-sm">{preset.presetName}</span>
            {preset.presetId !== 'custom' && (
              <p className="mt-1 text-(--color-muted) text-xs">
                {preset.inverter.count}× {preset.inverter.ratedPowerW / 1000} kW ·{' '}
                {preset.pv.peakPowerKWp} kWp · {preset.battery.capacityKWh} kWh
              </p>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

export function EnergyInverterSection() {
  const { t, settings, isReadOnly, setIfEditable } = useEnergyTabForm();

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <Zap size={20} className="text-amber-400" />
        {t('settings.inverterConfig')}
      </h2>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="settings-inverter-model" className="font-medium text-sm">
            {t('settings.inverterModel')}
          </label>
          <input
            id="settings-inverter-model"
            type="text"
            value={settings.systemConfig.inverter.model}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  inverter: {
                    ...settings.systemConfig.inverter,
                    model: e.target.value,
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
            placeholder="Victron MultiPlus-II 48/5000/70-50"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-inverter-count" className="font-medium text-sm">
            {t('settings.inverterCount')}
          </label>
          <input
            id="settings-inverter-count"
            type="number"
            min={1}
            max={12}
            value={settings.systemConfig.inverter.count}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  inverter: {
                    ...settings.systemConfig.inverter,
                    count: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
          <p className="text-(--color-muted) text-xs">{t('settings.inverterCountHint')}</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-inverter-power" className="font-medium text-sm">
            {t('settings.inverterPower')}
          </label>
          <input
            id="settings-inverter-power"
            type="number"
            step={100}
            min={500}
            max={15000}
            value={settings.systemConfig.inverter.ratedPowerW}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  inverter: {
                    ...settings.systemConfig.inverter,
                    ratedPowerW: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
          <p className="text-(--color-muted) text-xs">
            {t('settings.totalPower')}:{' '}
            {(
              (settings.systemConfig.inverter.count * settings.systemConfig.inverter.ratedPowerW) /
              1000
            ).toFixed(1)}{' '}
            kW
          </p>
        </div>
        <SelectField
          id="settings-inv-mode"
          label={t('settings.inverterMode')}
          value={settings.systemConfig.inverter.mode}
          disabled={isReadOnly}
          onChange={(e) =>
            setIfEditable({
              systemConfig: {
                ...settings.systemConfig,
                presetId: 'custom',
                presetName: 'Custom',
                inverter: {
                  ...settings.systemConfig.inverter,
                  mode: e.target.value as 'single' | 'parallel' | 'three-phase',
                },
              },
            })
          }
        >
          <option value="single">{t('settings.modeSingle')}</option>
          <option value="parallel">{t('settings.modeParallel')}</option>
          <option value="three-phase">{t('settings.modeThreePhase')}</option>
        </SelectField>
      </div>
    </section>
  );
}

export function EnergyPvSection() {
  const { t, settings, isReadOnly, setIfEditable } = useEnergyTabForm();

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <Zap size={20} className="text-yellow-400" />
        {t('settings.pvSystem', 'PV System')}
      </h2>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="settings-pv-peak-power" className="font-medium text-sm">
            {t('settings.pvPeakPower', 'Peak power (kWp)')}
          </label>
          <input
            id="settings-pv-peak-power"
            type="number"
            step={0.1}
            value={settings.systemConfig.pv.peakPowerKWp}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  pv: {
                    ...settings.systemConfig.pv,
                    peakPowerKWp: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <SelectField
          id="settings-orientation"
          label={t('settings.pvOrientation', 'Orientation')}
          value={settings.systemConfig.pv.orientation}
          disabled={isReadOnly}
          onChange={(e) =>
            setIfEditable({
              systemConfig: {
                ...settings.systemConfig,
                presetId: 'custom',
                presetName: 'Custom',
                pv: {
                  ...settings.systemConfig.pv,
                  orientation: e.target.value as PVConfig['orientation'],
                },
              },
            })
          }
        >
          <option value="south">{t('settings.south', 'South')}</option>
          <option value="east-west">{t('settings.eastWest', 'East/West')}</option>
          <option value="east">{t('settings.east', 'East')}</option>
          <option value="west">{t('settings.west', 'West')}</option>
        </SelectField>
        <div className="space-y-2">
          <label htmlFor="settings-pv-tilt" className="font-medium text-sm">
            {t('settings.pvTilt', 'Tilt angle (°)')}
          </label>
          <input
            id="settings-pv-tilt"
            type="number"
            min={0}
            max={90}
            value={settings.systemConfig.pv.tiltDeg}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  pv: {
                    ...settings.systemConfig.pv,
                    tiltDeg: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-pv-strings" className="font-medium text-sm">
            {t('settings.pvStrings')}
          </label>
          <input
            id="settings-pv-strings"
            type="number"
            min={1}
            max={20}
            value={settings.systemConfig.pv.strings}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  pv: {
                    ...settings.systemConfig.pv,
                    strings: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="pv-mppt-count" className="font-medium text-sm">
            {t('settings.mpptCount')}
          </label>
          <input
            id="pv-mppt-count"
            type="number"
            min={1}
            max={8}
            value={settings.systemConfig.pv.mpptCount}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  pv: {
                    ...settings.systemConfig.pv,
                    mpptCount: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
      </div>
    </section>
  );
}

export function EnergyBatterySection() {
  const { t, settings, isReadOnly, setIfEditable } = useEnergyTabForm();

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <HardDrive size={20} className="text-purple-400" />
        {t('settings.batteryConfig', 'Battery Configuration')}
      </h2>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="settings-battery-model" className="font-medium text-sm">
            {t('settings.batteryModel')}
          </label>
          <input
            id="settings-battery-model"
            type="text"
            value={settings.systemConfig.battery.model}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  battery: {
                    ...settings.systemConfig.battery,
                    model: e.target.value,
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
            placeholder="BYD Battery-Box Premium HVS"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-battery-capacity" className="font-medium text-sm">
            {t('settings.batteryCapacity', 'Capacity (kWh)')}
          </label>
          <input
            id="settings-battery-capacity"
            type="number"
            step={0.1}
            value={settings.systemConfig.battery.capacityKWh}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  battery: {
                    ...settings.systemConfig.battery,
                    capacityKWh: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-battery-modules" className="font-medium text-sm">
            {t('settings.batteryModules')}
          </label>
          <input
            id="settings-battery-modules"
            type="number"
            min={1}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  battery: {
                    ...settings.systemConfig.battery,
                    modules: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-battery-voltage" className="font-medium text-sm">
            {t('settings.batteryVoltage')}
          </label>
          <input
            id="settings-battery-voltage"
            type="number"
            step={0.1}
            value={settings.systemConfig.battery.nominalVoltageV}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  battery: {
                    ...settings.systemConfig.battery,
                    nominalVoltageV: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-battery-max-charge" className="font-medium text-sm">
            {t('settings.batteryMaxCharge', 'Max charge rate (kW)')}
          </label>
          <input
            id="settings-battery-max-charge"
            type="number"
            step={0.1}
            value={settings.systemConfig.battery.maxChargeRateKW}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  battery: {
                    ...settings.systemConfig.battery,
                    maxChargeRateKW: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-battery-max-discharge" className="font-medium text-sm">
            {t('settings.batteryMaxDischarge')}
          </label>
          <input
            id="settings-battery-max-discharge"
            type="number"
            step={0.1}
            value={settings.systemConfig.battery.maxDischargeRateKW}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  battery: {
                    ...settings.systemConfig.battery,
                    maxDischargeRateKW: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-battery-min-soc" className="font-medium text-sm">
            {t('settings.batteryMinSoC', 'Minimum SoC (%)')}
          </label>
          <input
            id="settings-battery-min-soc"
            type="number"
            min={5}
            max={50}
            value={settings.systemConfig.battery.minSoCPercent}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  battery: {
                    ...settings.systemConfig.battery,
                    minSoCPercent: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <SelectField
          id="settings-strategy"
          label={t('settings.batteryStrategy', 'Default strategy')}
          value={settings.systemConfig.battery.strategy}
          disabled={isReadOnly}
          onChange={(e) =>
            setIfEditable({
              systemConfig: {
                ...settings.systemConfig,
                presetId: 'custom',
                presetName: 'Custom',
                battery: {
                  ...settings.systemConfig.battery,
                  strategy: e.target.value as
                    | 'self-consumption'
                    | 'force-charge'
                    | 'time-of-use'
                    | 'auto',
                },
              },
            })
          }
        >
          <option value="self-consumption">{t('control.selfConsumption')}</option>
          <option value="force-charge">{t('control.forceCharge')}</option>
          <option value="time-of-use">{t('settings.timeOfUse')}</option>
          <option value="auto">{t('control.auto')}</option>
        </SelectField>
      </div>
    </section>
  );
}

export function EnergyConsumersSection() {
  const { t, settings, isReadOnly, setIfEditable } = useEnergyTabForm();

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <Gauge size={20} className="text-emerald-400" />
        {t('settings.consumersConfig')}
      </h2>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="settings-ev-charger-model" className="font-medium text-sm">
            {t('settings.evChargerModel')}
          </label>
          <input
            id="settings-ev-charger-model"
            type="text"
            value={settings.systemConfig.evCharger.model}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  evCharger: {
                    ...settings.systemConfig.evCharger,
                    model: e.target.value,
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-ev-max-power" className="font-medium text-sm">
            {t('settings.evMaxPower')}
          </label>
          <input
            id="settings-ev-max-power"
            type="number"
            step={0.1}
            min={1}
            max={50}
            value={settings.systemConfig.evCharger.maxPowerKW}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  evCharger: {
                    ...settings.systemConfig.evCharger,
                    maxPowerKW: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-heat-pump-model" className="font-medium text-sm">
            {t('settings.heatPumpModel')}
          </label>
          <input
            id="settings-heat-pump-model"
            type="text"
            value={settings.systemConfig.heatPump.model}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  heatPump: {
                    ...settings.systemConfig.heatPump,
                    model: e.target.value,
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-heat-pump-power" className="font-medium text-sm">
            {t('settings.heatPumpPower')}
          </label>
          <input
            id="settings-heat-pump-power"
            type="number"
            step={0.1}
            min={1}
            max={30}
            value={settings.systemConfig.heatPump.ratedPowerKW}
            onChange={(e) =>
              setIfEditable({
                systemConfig: {
                  ...settings.systemConfig,
                  presetId: 'custom',
                  presetName: 'Custom',
                  heatPump: {
                    ...settings.systemConfig.heatPump,
                    ratedPowerKW: Number(e.target.value),
                  },
                },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
          />
        </div>
      </div>
    </section>
  );
}

export function EnergyLocationSection() {
  const { t, settings, isReadOnly, setIfEditable } = useEnergyTabForm();

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <MapPin size={20} className="text-rose-400" />
        {t('settings.locationTitle', 'Location & Weather')}
      </h2>
      <p className="-mt-2 text-(--color-muted) text-xs">
        {t(
          'settings.locationHint',
          'Used for solar forecast, weather data, and sunrise/sunset calculations',
        )}
      </p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="settings-lat" className="font-medium text-sm">
            {t('settings.latitude', 'Latitude')}
          </label>
          <input
            id="settings-lat"
            type="number"
            step={0.0001}
            min={-90}
            max={90}
            value={settings.location.lat}
            onChange={(e) =>
              setIfEditable({
                location: { ...settings.location, lat: Number(e.target.value) },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
            placeholder="53.5511"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="settings-lon" className="font-medium text-sm">
            {t('settings.longitude', 'Longitude')}
          </label>
          <input
            id="settings-lon"
            type="number"
            step={0.0001}
            min={-180}
            max={180}
            value={settings.location.lon}
            onChange={(e) =>
              setIfEditable({
                location: { ...settings.location, lon: Number(e.target.value) },
              })
            }
            disabled={isReadOnly}
            className={inputClass}
            placeholder="9.9937"
          />
        </div>
      </div>
    </section>
  );
}

export function EnergyGridExtrasSection() {
  const { t, settings, isReadOnly, setIfEditable } = useEnergyTabForm();

  return (
    <section className={sectionClass}>
      <EnergySectionHeader
        icon={Zap}
        iconClassName="text-orange-400"
        title={t('settings.gridExtrasTitle', 'Grid & Tariff Details')}
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <EnergyRangeField
          id="settings-grid-price"
          label={t('settings.gridPriceAvg', 'Avg. grid price (€/kWh)')}
          value={settings.gridPriceAvg}
          min={0.1}
          max={0.6}
          step={0.01}
          valueText={`${settings.gridPriceAvg.toFixed(2)} €`}
          ariaValuetext={`${settings.gridPriceAvg.toFixed(2)} €/kWh`}
          isReadOnly={isReadOnly}
          onChange={(value) => setIfEditable({ gridPriceAvg: value })}
        />
        <EnergyRangeField
          id="settings-feedin"
          label={t('settings.feedInTariff', 'Feed-in tariff (€/kWh)')}
          value={settings.feedInTariff ?? 0.082}
          min={0}
          max={0.2}
          step={0.001}
          valueText={`${(settings.feedInTariff ?? 0.082).toFixed(3)} €`}
          ariaValuetext={`${(settings.feedInTariff ?? 0.082).toFixed(3)} €/kWh`}
          isReadOnly={isReadOnly}
          onChange={(value) => setIfEditable({ feedInTariff: value })}
          hint={t('settings.feedInTariffHint', 'EEG feed-in compensation per kWh')}
        />
        <div className="space-y-2">
          <label htmlFor="settings-grid-operator" className="font-medium text-sm">
            {t('settings.gridOperator', 'Grid operator')}
          </label>
          <input
            id="settings-grid-operator"
            type="text"
            value={settings.gridOperator ?? ''}
            onChange={(e) => setIfEditable({ gridOperator: e.target.value })}
            disabled={isReadOnly}
            className={inputClass}
            placeholder={t('settings.gridOperatorPlaceholder', 'e.g. Stromnetz Hamburg')}
          />
        </div>
        <EnergyRangeField
          id="settings-budget"
          label={t('settings.monthlyBudget', 'Monthly energy budget (€)')}
          value={settings.monthlyBudget ?? 80}
          min={20}
          max={500}
          step={5}
          valueText={`${settings.monthlyBudget ?? 80} €`}
          ariaValuetext={`${settings.monthlyBudget ?? 80} €`}
          isReadOnly={isReadOnly}
          onChange={(value) => setIfEditable({ monthlyBudget: value })}
          hint={t(
            'settings.monthlyBudgetHint',
            'Target monthly electricity cost for budget tracking',
          )}
        />
      </div>
    </section>
  );
}
