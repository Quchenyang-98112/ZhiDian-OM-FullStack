import { Battery, Car, Gauge, HardDrive, Plus, Search, Thermometer, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AddAdapterWizard } from '../components/hardware/AddAdapterWizard';
import { PageHeader } from '../components/layout/PageHeader';
import { PageCrossLinks } from '../components/ui/PageCrossLinks';
import { SelectField } from '../components/ui/SelectField';
import {
  type DeviceCategory,
  type DeviceDefinition,
  type DeviceProtocol,
  getAllDevices,
  getDeviceStats,
  getManufacturers,
  searchDevices,
} from '../core/hardware-registry';

const CATEGORY_ORDER: DeviceCategory[] = ['inverter', 'battery', 'wallbox', 'meter', 'heatpump'];

const CATEGORY_ICONS: Record<DeviceCategory, typeof Zap> = {
  inverter: Zap,
  battery: Battery,
  wallbox: Car,
  meter: Gauge,
  heatpump: Thermometer,
};

function collectProtocols(devices: DeviceDefinition[]): DeviceProtocol[] {
  const set = new Set<DeviceProtocol>();
  for (const device of devices) {
    for (const protocol of device.protocols) set.add(protocol);
  }
  return [...set].sort();
}

function DeviceCard({
  device,
  onConfigure,
}: {
  device: DeviceDefinition;
  onConfigure: (device: DeviceDefinition) => void;
}) {
  const { t } = useTranslation();
  const Icon = CATEGORY_ICONS[device.category];

  return (
    <article className="glass-panel hover-lift flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--color-primary)/10 text-(--color-primary)">
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-(--color-text) text-sm">{device.model}</h3>
          <p className="text-(--color-muted) text-xs">{device.manufacturer}</p>
        </div>
      </div>
      {device.description ? (
        <p className="line-clamp-2 text-(--color-muted) text-xs">{device.description}</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {device.protocols.slice(0, 4).map((protocol) => (
          <span
            key={protocol}
            className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-(--color-muted) text-[10px]"
          >
            {protocol}
          </span>
        ))}
        {device.protocols.length > 4 ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-(--color-muted) text-[10px]">
            +{device.protocols.length - 4}
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-(--color-border) border-t pt-3">
        <span className="text-(--color-muted) text-[10px]">
          {device.ratedPowerW
            ? `${(device.ratedPowerW / 1000).toFixed(1)} kW`
            : device.capacityKWh
              ? `${device.capacityKWh} kWh`
              : t(`hardwareRegistry.categories.${device.category}`)}
        </span>
        <button
          type="button"
          onClick={() => onConfigure(device)}
          className="focus-ring rounded-lg bg-(--color-primary)/15 px-3 py-1.5 font-medium text-(--color-primary) text-xs"
        >
          {t('hardwareRegistry.configure')}
        </button>
      </div>
    </article>
  );
}

export default function HardwareRegistryPage() {
  const { t } = useTranslation();
  const allDevices = useMemo(() => getAllDevices(), []);
  const manufacturers = useMemo(() => getManufacturers().sort(), []);
  const stats = useMemo(() => getDeviceStats(), []);
  const protocols = useMemo(() => collectProtocols(allDevices), [allDevices]);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<DeviceCategory | 'all'>('all');
  const [manufacturer, setManufacturer] = useState('all');
  const [protocol, setProtocol] = useState<DeviceProtocol | 'all'>('all');
  const [wizardDevice, setWizardDevice] = useState<DeviceDefinition | null | undefined>(undefined);

  const filtered = useMemo(() => {
    const base = query.trim() ? searchDevices(query.trim()) : allDevices;
    return base.filter((device) => {
      if (category !== 'all' && device.category !== category) return false;
      if (
        manufacturer !== 'all' &&
        !device.manufacturer.toLowerCase().includes(manufacturer.toLowerCase())
      ) {
        return false;
      }
      if (protocol !== 'all' && !device.protocols.includes(protocol)) return false;
      return true;
    });
  }, [allDevices, category, manufacturer, protocol, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('hardwareRegistry.title')}
        subtitle={t('hardwareRegistry.subtitle')}
        icon={<HardDrive size={22} aria-hidden="true" />}
        actions={
          <button
            type="button"
            onClick={() => setWizardDevice(null)}
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-(--color-primary)/15 px-4 py-2 font-medium text-(--color-primary) text-sm"
          >
            <Plus size={16} aria-hidden="true" />
            {t('hardwareRegistry.addAdapter')}
          </button>
        }
      />

      {wizardDevice !== undefined ? (
        <AddAdapterWizard
          {...(wizardDevice !== null ? { device: wizardDevice } : {})}
          onClose={() => setWizardDevice(undefined)}
        />
      ) : null}

      <motion.section
        className="glass-panel-strong grid grid-cols-2 gap-3 p-4 sm:grid-cols-5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <p className="font-semibold text-(--color-text) text-2xl">{allDevices.length}</p>
          <p className="text-(--color-muted) text-xs">{t('hardwareRegistry.statsDevices')}</p>
        </div>
        <div>
          <p className="font-semibold text-(--color-text) text-2xl">{manufacturers.length}</p>
          <p className="text-(--color-muted) text-xs">{t('hardwareRegistry.statsBrands')}</p>
        </div>
        {CATEGORY_ORDER.map((cat) => (
          <div key={cat}>
            <p className="font-semibold text-(--color-text) text-2xl">{stats[cat]}</p>
            <p className="text-(--color-muted) text-xs">
              {t(`hardwareRegistry.categories.${cat}`)}
            </p>
          </div>
        ))}
      </motion.section>

      <section className="glass-panel space-y-4 p-4">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--color-muted)"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('hardwareRegistry.searchPlaceholder')}
            aria-label={t('hardwareRegistry.searchPlaceholder')}
            className="focus-ring w-full rounded-xl border border-(--color-border) bg-(--color-surface) py-2.5 pr-3 pl-9 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SelectField
            id="hw-category"
            label={t('hardwareRegistry.filterCategory')}
            value={category}
            onChange={(e) => setCategory(e.target.value as DeviceCategory | 'all')}
          >
            <option value="all">{t('hardwareRegistry.filterAll')}</option>
            {CATEGORY_ORDER.map((cat) => (
              <option key={cat} value={cat}>
                {t(`hardwareRegistry.categories.${cat}`)}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="hw-manufacturer"
            label={t('hardwareRegistry.filterManufacturer')}
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
          >
            <option value="all">{t('hardwareRegistry.filterAll')}</option>
            {manufacturers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="hw-protocol"
            label={t('hardwareRegistry.filterProtocol')}
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as DeviceProtocol | 'all')}
          >
            <option value="all">{t('hardwareRegistry.filterAll')}</option>
            {protocols.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectField>
        </div>
      </section>

      <p className="text-(--color-muted) text-sm">
        {t('hardwareRegistry.resultsCount', { count: filtered.length })}
      </p>

      {filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-(--color-muted) text-sm">{t('hardwareRegistry.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((device) => (
            <DeviceCard key={device.id} device={device} onConfigure={setWizardDevice} />
          ))}
        </div>
      )}

      <PageCrossLinks />
    </div>
  );
}
