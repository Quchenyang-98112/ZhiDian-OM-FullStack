import { Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InfluxTokenField } from './InfluxTokenField';
import { inputClass, sectionClass, sectionHeaderClass } from './styles';

export const InfluxDbSettingsSection = ({
  influxUrl,
  influxToken,
  historyDays,
  showInfluxToken,
  onInfluxUrlChange,
  onInfluxTokenChange,
  onHistoryDaysChange,
  onToggleShowToken,
}: {
  influxUrl: string;
  influxToken: string;
  historyDays: number;
  showInfluxToken: boolean;
  onInfluxUrlChange: (value: string) => void;
  onInfluxTokenChange: (value: string) => void;
  onHistoryDaysChange: (value: number) => void;
  onToggleShowToken: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <section className={sectionClass}>
      <h2 className={sectionHeaderClass}>
        <Database size={20} className="text-purple-400" />
        {t('settings.storage')}
      </h2>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="settings-influx-url" className="font-medium text-sm">
            {t('settings.influxUrl')}
          </label>
          <input
            id="settings-influx-url"
            type="text"
            value={influxUrl}
            onChange={(e) => onInfluxUrlChange(e.target.value)}
            className={inputClass}
          />
        </div>
        <InfluxTokenField
          value={influxToken}
          showToken={showInfluxToken}
          onToggleShow={onToggleShowToken}
          onChange={onInfluxTokenChange}
        />
        <div className="space-y-2">
          <label htmlFor="settings-history-days" className="font-medium text-sm">
            {t('settings.historyDays')}
          </label>
          <input
            id="settings-history-days"
            type="number"
            value={historyDays}
            onChange={(e) => onHistoryDaysChange(Number(e.target.value))}
            className={inputClass}
            min={1}
            max={365}
          />
          <p className="text-(--color-muted) text-xs">{t('settings.historyHint')}</p>
        </div>
      </div>
    </section>
  );
};
