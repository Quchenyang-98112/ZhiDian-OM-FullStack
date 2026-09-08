import { RefreshCw, Save } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { ignorePromiseRejection } from '../../lib/ignore-promise-rejection';
import { ToggleSwitch } from './ToggleSwitch';

export const HaSettingsFooter = ({
  enabled,
  mqttAutoDiscovery,
  isReadOnly,
  saving,
  onEnabledChange,
  onMqttAutoDiscoveryChange,
  onSave,
}: {
  enabled: boolean;
  mqttAutoDiscovery: boolean;
  isReadOnly: boolean;
  saving: boolean;
  onEnabledChange: (value: boolean) => void;
  onMqttAutoDiscoveryChange: (value: boolean) => void;
  onSave: () => Promise<void>;
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-(--color-border) border-t pt-4">
      <div className="flex items-center gap-4">
        <ToggleSwitch
          id="ha-adapter-enabled"
          checked={enabled}
          onChange={(v) => !isReadOnly && onEnabledChange(v)}
          label={t('settings.haEnableAdapter')}
        />
        <ToggleSwitch
          id="mqtt-auto"
          checked={mqttAutoDiscovery}
          onChange={(v) => !isReadOnly && onMqttAutoDiscoveryChange(v)}
          label={t('mqtt.autoDiscovery')}
        />
      </div>
      <motion.button
        type="button"
        onClick={() => {
          onSave().catch(ignorePromiseRejection);
        }}
        disabled={isReadOnly || saving}
        className="focus-ring flex items-center gap-2 rounded-xl bg-(--color-text) px-4 py-2 font-medium text-(--color-background) text-sm disabled:cursor-not-allowed disabled:opacity-50"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
        {saving ? t('common.saving') : t('common.save')}
      </motion.button>
    </div>
  );
};
