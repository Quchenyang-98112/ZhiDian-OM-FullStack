import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { inputClass } from './styles';

const InfluxTokenToggle = ({
  showToken,
  onToggle,
}: {
  showToken: boolean;
  onToggle: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-(--color-muted) hover:text-(--color-text)"
      aria-label={showToken ? t('settings.hideToken') : t('settings.showToken')}
    >
      {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
};

export const InfluxTokenField = ({
  value,
  showToken,
  onToggleShow,
  onChange,
}: {
  value: string;
  showToken: boolean;
  onToggleShow: () => void;
  onChange: (value: string) => void;
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <label htmlFor="settings-influx-token" className="font-medium text-sm">
        {t('settings.influxToken')}
      </label>
      <div className="relative">
        <input
          id="settings-influx-token"
          type={showToken ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} pr-10`}
        />
        <InfluxTokenToggle showToken={showToken} onToggle={onToggleShow} />
      </div>
    </div>
  );
};
