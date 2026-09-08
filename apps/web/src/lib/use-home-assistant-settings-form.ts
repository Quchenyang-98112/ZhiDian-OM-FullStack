import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { HAEntityRoleRow } from '../components/settings/HaEntityRolesEditor';
import type {
  HAConnectionMode,
  HomeAssistantMQTTConfig,
} from '../core/adapters/contrib/homeassistant-mqtt';
import { saveHomeAssistantSettings } from '../core/homeassistant-settings-save';
import { useEnergyStore } from '../core/useEnergyStore';
import { useAppStoreShallow } from '../store';
import { hydrateHomeAssistantSettingsFromAdapter } from './homeassistant-settings-hydrate';
import { getAdapterCredentials } from './secure-store';
import { useReadOnlyModeActive } from './use-read-only-mode';

const HA_ADAPTER_ID = 'homeassistant-mqtt';

const toEntityRoleRows = (
  roles: { entityId: string; role: HAEntityRoleRow['role'] }[],
): HAEntityRoleRow[] => roles.map((role) => ({ ...role, rowId: crypto.randomUUID() }));

export const useHomeAssistantSettingsForm = (options?: { isReadOnly?: boolean }) => {
  const { t } = useTranslation();
  const readOnlyFromHook = useReadOnlyModeActive();
  const isReadOnly = options?.isReadOnly ?? readOnlyFromHook;
  const haEntry = useEnergyStore((s) => s.adapters[HA_ADAPTER_ID]);
  const haEnabled = haEntry?.enabled ?? false;
  const { settings, updateSettings } = useAppStoreShallow((s) => ({
    settings: s.settings,
    updateSettings: s.updateSettings,
  }));

  const haEntryRef = useRef(haEntry);
  haEntryRef.current = haEntry;

  const [hydrated, setHydrated] = useState(false);
  const [haMode, setHaMode] = useState<HAConnectionMode>('ha-ws-api');
  const [haBaseUrl, setHaBaseUrl] = useState('http://homeassistant.local:8123');
  const [haToken, setHaToken] = useState('');
  const [mqttHost, setMqttHost] = useState('');
  const [mqttPort, setMqttPort] = useState(1883);
  const [mqttUser, setMqttUser] = useState('');
  const [mqttBrokerAuth, setMqttBrokerAuth] = useState('');
  const [entityRoles, setEntityRoles] = useState<HAEntityRoleRow[]>([]);
  const [enabled, setEnabled] = useState(haEnabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hydrated) return;

    let cancelled = false;

    void (async () => {
      try {
        const credentials = await getAdapterCredentials(HA_ADAPTER_ID);
        if (cancelled) return;

        const entry = haEntryRef.current;
        const config = (entry?.adapter?.getConnectionConfig?.() ??
          null) as HomeAssistantMQTTConfig | null;
        const next = hydrateHomeAssistantSettingsFromAdapter(
          config,
          credentials,
          entry?.enabled ?? false,
        );
        setHaMode(next.haMode);
        setHaBaseUrl(next.haBaseUrl);
        setHaToken(next.haToken);
        setMqttHost(next.mqttHost);
        setMqttPort(next.mqttPort);
        setMqttUser(next.mqttUser);
        setMqttBrokerAuth(next.mqttBrokerAuth);
        setEntityRoles(toEntityRoleRows(next.entityRoles));
        setEnabled(next.enabled);
      } catch {
        if (!cancelled) setEnabled(haEntryRef.current?.enabled ?? false);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const handleSave = async () => {
    if (isReadOnly) {
      toast.error(t('mode.readOnlyBlocked'));
      return;
    }

    setSaving(true);
    try {
      const result = await saveHomeAssistantSettings({
        enabled,
        haMode,
        haBaseUrl,
        haToken,
        mqttHost,
        mqttPort,
        mqttUser,
        mqttBrokerAuth,
        mqttAutoDiscovery: settings.mqttAutoDiscovery ?? true,
        entityRoles: entityRoles.map(({ entityId, role }) => ({ entityId, role })),
      });
      if (!result.ok) {
        toast.error(t('settings.haSaveFailed', { error: result.error }));
        return;
      }
      toast.success(t('settings.haSaveSuccess'));
    } catch {
      toast.error(t('settings.haSaveFailed', { error: t('common.error') }));
    } finally {
      setSaving(false);
    }
  };

  return {
    isReadOnly,
    haMode,
    setHaMode,
    haBaseUrl,
    setHaBaseUrl,
    haToken,
    setHaToken,
    mqttHost,
    setMqttHost,
    mqttPort,
    setMqttPort,
    mqttUser,
    setMqttUser,
    mqttBrokerAuth,
    setMqttBrokerAuth,
    entityRoles,
    setEntityRoles,
    enabled,
    setEnabled,
    saving,
    handleSave,
    mqttAutoDiscovery: settings.mqttAutoDiscovery ?? true,
    updateMqttAutoDiscovery: (value: boolean) => updateSettings({ mqttAutoDiscovery: value }),
    t,
  };
};
