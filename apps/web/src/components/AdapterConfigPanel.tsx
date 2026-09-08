/**
 * AdapterConfigPanel — Settings UI for all 5 protocol adapters
 *
 * Provides per-adapter configuration for:
 *   - Victron MQTT (host, port, gateway type, auth)
 *   - Modbus SunSpec (host, port, polling interval, auth)
 *   - KNX/IP (host, port, transport, GA mapping)
 *   - OCPP 2.1 (endpoint, security profile, station ID, mTLS)
 *   - EEBUS SPINE/SHIP (host, port, SKI, mTLS)
 */

import { Check, Download, Gauge, Package, Plus, Radio, Server, Wifi } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { saveAdapterPanelEntry } from '../core/adapter-config-panel-save';
import { listRegisteredAdapters, loadAllContribAdapters } from '../core/adapters/adapter-registry';
import { useEnergyStore } from '../core/useEnergyStore';
import { ignorePromiseRejection } from '../lib/ignore-promise-rejection';
import { useAdapterPanelHydration } from '../lib/use-adapter-panel-hydration';
import { useReadOnlyModeActive } from '../lib/use-read-only-mode';
import { useAppStore } from '../store';
import { ComplianceChecklist } from './AdapterComplianceChecklist';
import { AdapterConfigEntrySection } from './AdapterConfigEntrySection';
import { AdapterHelpItem } from './adapter-config-shared';
import {
  ADAPTER_DEFAULTS,
  ADAPTER_META,
  type AdapterEntry,
  type AdapterType,
  type GAMappingEntry,
} from './adapter-config-types';
import { ReadOnlySettingsBanner } from './settings/ReadOnlySettingsBanner';
import { Disclosure } from './ui/Disclosure';

export { AdapterHelpItem, GAMappingPanel, ToggleSwitch } from './adapter-config-shared';
export type { AdapterEntry, AdapterType, GAMappingEntry };

// ─── Contrib Adapter Section ─────────────────────────────────────────

const CONTRIB_ADAPTERS = [
  {
    id: 'homeassistant-mqtt',
    nameKey: 'monitoring.contribHomeAssistantMqtt',
    descKey: 'monitoring.contribHomeAssistantMqttDesc',
    icon: Server,
    color: 'text-cyan-400',
    capabilities: ['pv', 'battery', 'grid', 'load', 'evCharger'],
  },
  {
    id: 'matter-thread',
    nameKey: 'monitoring.contribMatterThread',
    descKey: 'monitoring.contribMatterThreadDesc',
    icon: Radio,
    color: 'text-violet-400',
    capabilities: ['pv', 'grid', 'load'],
  },
  {
    id: 'zigbee2mqtt',
    nameKey: 'monitoring.contribZigbee2mqtt',
    descKey: 'monitoring.contribZigbee2mqttDesc',
    icon: Wifi,
    color: 'text-amber-400',
    capabilities: ['load', 'grid'],
  },
  {
    id: 'shelly-rest',
    nameKey: 'monitoring.contribShellyRest',
    descKey: 'monitoring.contribShellyRestDesc',
    icon: Gauge,
    color: 'text-emerald-400',
    capabilities: ['grid', 'load'],
  },
] as const;

const CONTRIB_HELP_IDS = new Set(['zigbee2mqtt', 'shelly-rest']);

const ContribAdapterHelpPanel = ({ adapterId }: { adapterId: string }) => {
  const { t } = useTranslation();

  if (adapterId === 'zigbee2mqtt') {
    return (
      <Disclosure
        variant="nested"
        title={t('adapterConfig.zigbeeSpecific')}
        subtitle={t('adapterConfig.zigbeeHelpIntro')}
        className="mt-3"
      >
        <ul className="space-y-2">
          <AdapterHelpItem
            titleKey="adapterConfig.zigbeeBaseTopic"
            descKey="adapterConfig.zigbeeBaseTopicHint"
          />
          <AdapterHelpItem
            titleKey="adapterConfig.zigbeeMqttAuth"
            descKey="adapterConfig.zigbeeMqttAuthHint"
          />
          <AdapterHelpItem
            titleKey="adapterConfig.zigbeeEnergyDevices"
            descKey="adapterConfig.zigbeeEnergyDevicesHint"
          />
          <AdapterHelpItem
            titleKey="adapterConfig.zigbeeRoleHints"
            descKey="adapterConfig.zigbeeRoleHintsDesc"
          />
          <AdapterHelpItem
            titleKey="adapterConfig.zigbeeCommands"
            descKey="adapterConfig.zigbeeCommandsDesc"
          />
          <AdapterHelpItem
            titleKey="adapterConfig.zigbeeAvailability"
            descKey="adapterConfig.zigbeeAvailabilityHint"
          />
        </ul>
      </Disclosure>
    );
  }

  if (adapterId === 'shelly-rest') {
    return (
      <Disclosure
        variant="nested"
        title={t('adapterConfig.shellySpecific')}
        subtitle={t('adapterConfig.shellyHelpIntro')}
        className="mt-3"
      >
        <ul className="space-y-2">
          <AdapterHelpItem
            titleKey="adapterConfig.shellyGenSupport"
            descKey="adapterConfig.shellyGenSupportDesc"
          />
          <AdapterHelpItem
            titleKey="adapterConfig.shellyWebhook"
            descKey="adapterConfig.shellyWebhookHint"
          />
          <AdapterHelpItem
            titleKey="adapterConfig.shellyPhases"
            descKey="adapterConfig.shellyPhasesHint"
          />
          <AdapterHelpItem
            titleKey="adapterConfig.shellyPvCapability"
            descKey="adapterConfig.shellyPvCapabilityHint"
          />
          <AdapterHelpItem
            titleKey="adapterConfig.shellyRelayCommand"
            descKey="adapterConfig.shellyRelayCommandHint"
          />
        </ul>
      </Disclosure>
    );
  }

  return null;
};

const ContribAdapterSection = () => {
  const { t } = useTranslation();
  const [loadedIds, setLoadedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleLoadAll = async () => {
    setLoading(true);
    try {
      const ids = await loadAllContribAdapters();
      setLoadedIds(ids);
    } catch {
      // Error handled by registry
    } finally {
      setLoading(false);
    }
  };

  const registeredAdapters = listRegisteredAdapters();
  const contribRegistered = registeredAdapters.filter((a) => a.source === 'contrib');

  return (
    <section className="glass-panel-strong space-y-6 rounded-2xl p-6">
      <div className="flex items-center justify-between border-(--color-border) border-b pb-4">
        <h2 className="fluid-text-lg flex items-center gap-2 font-medium">
          <Package size={20} className="text-(--color-primary)" />
          {t('monitoring.contribAdapters')}
        </h2>
        <motion.button
          type="button"
          onClick={handleLoadAll}
          disabled={loading}
          className="focus-ring flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface-strong) px-3 py-2 text-xs transition-colors hover:border-(--color-primary)/30 hover:bg-(--color-primary)/5 disabled:opacity-50"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Download size={14} />
          {t('monitoring.loadAllContrib')}
        </motion.button>
      </div>
      <p className="text-(--color-muted) text-sm">{t('monitoring.contribAdaptersDesc')}</p>

      {loadedIds.length > 0 && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-emerald-400 text-xs">
          {t('monitoring.contribLoaded', { ids: loadedIds.join(', ') })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CONTRIB_ADAPTERS.map((adapter) => {
          const Icon = adapter.icon;
          const isRegistered =
            contribRegistered.some((r) => r.id === adapter.id) || loadedIds.includes(adapter.id);
          return (
            <div
              key={adapter.id}
              className="flex items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-surface)/50 p-4 transition-colors hover:bg-(--color-surface)"
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-surface-strong) ${adapter.color}`}
              >
                <Icon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-(--color-text) text-sm">
                    {t(adapter.nameKey)}
                  </span>
                  {isRegistered && <Check size={14} className="shrink-0 text-emerald-400" />}
                </div>
                <p className="truncate text-(--color-muted) text-[10px]">{t(adapter.descKey)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {adapter.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="rounded bg-(--color-primary)/10 px-1.5 py-0.5 text-(--color-primary) text-[9px]"
                    >
                      {t(`adapterConfig.cap_${cap}`)}
                    </span>
                  ))}
                </div>
                {CONTRIB_HELP_IDS.has(adapter.id) && (
                  <ContribAdapterHelpPanel adapterId={adapter.id} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-(--color-primary)/20 bg-(--color-primary)/5 p-3 text-(--color-muted) text-xs">
        <span className="font-medium text-(--color-primary)">💡 </span>
        {t('monitoring.pluginDynamicLoad')} · {t('monitoring.pluginNpmFormat')}
      </div>
    </section>
  );
};

// ─── AdapterConfigPanel ──────────────────────────────────────────────

export const AdapterConfigPanel = () => {
  const { t } = useTranslation();
  const isReadOnly = useReadOnlyModeActive();
  const settings = useAppStore((s) => s.settings);
  const energyAdapters = useEnergyStore((s) => s.adapters);
  const [adapters, setAdapters] = useState<AdapterEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const adapterCounter = useRef(0);

  useAdapterPanelHydration({
    hydrated,
    setHydrated,
    setAdapters,
    adapterCounter,
    settings,
    adapters: energyAdapters,
    defaultName: (type) => t(`adapterConfig.defaultName_${type}`),
  });

  const inputClass =
    'w-full bg-(--color-surface) border border-(--color-border) rounded-xl px-4 py-2.5 text-(--color-text) focus:outline-none focus:border-(--color-primary)/70 focus:ring-2 focus:ring-(--color-primary)/20 transition-all duration-300 placeholder:text-(--color-muted)';

  const addAdapter = (type: AdapterType) => {
    if (isReadOnly) {
      toast.error(t('mode.readOnlyBlocked'));
      return;
    }
    adapterCounter.current += 1;
    const id = `${type}-${adapterCounter.current}`;
    const defaults = ADAPTER_DEFAULTS[type];
    const entry: AdapterEntry = {
      id,
      type,
      name: t(`adapterConfig.defaultName_${type}`),
      enabled: true,
      host: '',
      port: defaults.port ?? 1880,
      tls: defaults.tls ?? false,
      authToken: '',
      pollIntervalMs: defaults.pollIntervalMs ?? 3000,
      ...defaults,
    };
    setAdapters((prev) => [...prev, entry]);
    setExpandedId(id);
  };

  const removeAdapter = (id: string) => {
    if (isReadOnly) {
      toast.error(t('mode.readOnlyBlocked'));
      return;
    }
    setAdapters((prev) => prev.filter((a) => a.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const updateAdapter = (id: string, patch: Partial<AdapterEntry>) => {
    setAdapters((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const handleSave = async (id: string) => {
    if (isReadOnly) {
      toast.error(t('mode.readOnlyBlocked'));
      return;
    }

    const entry = adapters.find((a) => a.id === id);
    if (!entry) return;

    setSavingId(id);
    try {
      const result = await saveAdapterPanelEntry(entry);
      if (!result.ok) {
        toast.error(t('adapterConfig.saveFailed', { error: result.error }));
        return;
      }
      setSavedId(id);
      toast.success(t('adapterConfig.saveSuccess'));
      setTimeout(() => setSavedId(null), 2000);
    } catch {
      toast.error(t('adapterConfig.saveFailed', { error: t('common.error') }));
    } finally {
      setSavingId(null);
    }
  };

  const toggleToken = (id: string) => {
    setShowTokens((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const sectionClass = 'glass-panel-strong p-6 rounded-2xl space-y-6';
  const sectionHeaderClass =
    'text-lg fluid-text-lg font-medium flex items-center gap-2 border-b border-(--color-border) pb-4';

  return (
    <div className="space-y-6">
      <ReadOnlySettingsBanner />
      {/* Header */}
      <section className={sectionClass}>
        <h2 className={sectionHeaderClass}>
          <Server size={20} className="text-(--color-primary)" />
          {t('adapterConfig.title')}
        </h2>
        <p className="text-(--color-muted) text-sm">{t('adapterConfig.description')}</p>

        {/* Add Adapter Buttons */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ADAPTER_META) as AdapterType[]).map((type) => {
            const meta = ADAPTER_META[type];
            const Icon = meta.icon;
            return (
              <motion.button
                key={type}
                type="button"
                onClick={() => addAdapter(type)}
                disabled={isReadOnly}
                className="focus-ring flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface-strong) px-3 py-2 text-sm transition-colors hover:border-(--color-primary)/30 hover:bg-(--color-primary)/5 disabled:cursor-not-allowed disabled:opacity-50"
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
              >
                <Icon size={16} className={meta.color} />
                <span>{t(`adapterConfig.type_${type}`)}</span>
                <Plus size={14} className="text-(--color-muted)" />
              </motion.button>
            );
          })}
        </div>

        {/* Capability Legend */}
        <div className="flex flex-wrap gap-3 rounded-lg border border-(--color-border) bg-(--color-surface)/50 px-3 py-2 text-(--color-muted) text-xs">
          {['pv', 'battery', 'grid', 'load', 'evCharger', 'knx'].map((cap) => (
            <span key={cap} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-(--color-primary)/60" />
              {t(`adapterConfig.cap_${cap}`)}
            </span>
          ))}
        </div>
      </section>

      {/* Adapter List */}
      {adapters.length === 0 && (
        <div className="rounded-2xl border border-(--color-border) border-dashed p-8 text-center">
          <Server size={32} className="mx-auto mb-3 text-(--color-muted)" />
          <p className="font-medium text-(--color-muted) text-sm">
            {t('adapterConfig.noAdapters')}
          </p>
          <p className="mt-1 text-(--color-muted) text-xs">{t('adapterConfig.noAdaptersHint')}</p>
        </div>
      )}

      <AnimatePresence>
        {adapters.map((adapter) => (
          <AdapterConfigEntrySection
            key={adapter.id}
            adapter={adapter}
            isExpanded={expandedId === adapter.id}
            onExpandChange={(open) => setExpandedId(open ? adapter.id : null)}
            onUpdate={(patch) => updateAdapter(adapter.id, patch)}
            showToken={showTokens[adapter.id] ?? false}
            onToggleToken={() => toggleToken(adapter.id)}
            onRemove={() => removeAdapter(adapter.id)}
            onSave={() => {
              handleSave(adapter.id).catch(ignorePromiseRejection);
            }}
            isReadOnly={isReadOnly}
            isSaving={savingId === adapter.id}
            isSaved={savedId === adapter.id}
            inputClass={inputClass}
            sectionClass={sectionClass}
            t={t}
          />
        ))}
      </AnimatePresence>

      {/* Contrib / Community Adapters */}
      <ContribAdapterSection />

      {/* §14a EnWG + VDE-AR-N 4105 Compliance Checklist */}
      <ComplianceChecklist activeAdapters={adapters.map((a) => a.type)} />
    </div>
  );
};
