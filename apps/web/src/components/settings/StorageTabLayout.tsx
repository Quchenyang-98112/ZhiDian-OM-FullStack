import { ConfirmDialog, type useConfirmDialog } from '../ConfirmDialog';
import { InfluxDbSettingsSection } from './InfluxDbSettingsSection';
import { LocalStorageSection } from './LocalStorageSection';
import { SettingsFeatureBar } from './SettingsFeatureBar';

export const StorageTabLayout = ({
  settings,
  showInfluxToken,
  usageMb,
  snapshots,
  onInfluxUrlChange,
  onInfluxTokenChange,
  onHistoryDaysChange,
  onToggleShowToken,
  onClearCache,
  confirm,
}: {
  settings: { influxUrl: string; influxToken: string; historyDays: number };
  showInfluxToken: boolean;
  usageMb: number;
  snapshots: number;
  onInfluxUrlChange: (value: string) => void;
  onInfluxTokenChange: (value: string) => void;
  onHistoryDaysChange: (value: number) => void;
  onToggleShowToken: () => void;
  onClearCache: () => void;
  confirm: ReturnType<typeof useConfirmDialog>;
}) => (
  <>
    <SettingsFeatureBar tabId="storage" />
    <InfluxDbSettingsSection
      influxUrl={settings.influxUrl}
      influxToken={settings.influxToken}
      historyDays={settings.historyDays}
      showInfluxToken={showInfluxToken}
      onInfluxUrlChange={onInfluxUrlChange}
      onInfluxTokenChange={onInfluxTokenChange}
      onHistoryDaysChange={onHistoryDaysChange}
      onToggleShowToken={onToggleShowToken}
    />
    <LocalStorageSection
      usageMb={usageMb}
      snapshots={snapshots}
      historyDays={settings.historyDays}
      onClearCache={onClearCache}
    />
    <ConfirmDialog {...confirm.dialogProps} />
  </>
);
