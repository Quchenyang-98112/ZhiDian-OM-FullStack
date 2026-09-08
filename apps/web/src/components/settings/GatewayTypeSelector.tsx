import { useTranslation } from 'react-i18next';

type GatewayType = 'cerbo-gx' | 'cerbo-gx-mk2' | 'raspberry-pi';

const GATEWAY_OPTIONS: { value: GatewayType; label: string; hintKey: string }[] = [
  { value: 'cerbo-gx', label: 'Cerbo GX', hintKey: 'settings.gatewayTypeCerboHint' },
  { value: 'cerbo-gx-mk2', label: 'Cerbo GX MK2', hintKey: 'settings.gatewayTypeMk2Hint' },
  { value: 'raspberry-pi', label: 'Raspberry Pi', hintKey: 'settings.gatewayTypeRpiHint' },
];

const GatewayOptionCard = ({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`rounded-xl border-2 p-3 text-left transition-all ${
      selected
        ? 'border-(--color-primary) bg-(--color-primary)/10'
        : 'border-(--color-border) bg-(--color-surface) hover:border-(--color-primary)/40'
    }`}
    aria-pressed={selected}
  >
    <span className="font-medium text-sm">{label}</span>
    <span className="mt-1 block text-(--color-muted) text-xs">{hint}</span>
  </button>
);

export const GatewayTypeSelector = ({
  value,
  onChange,
}: {
  value: GatewayType;
  onChange: (gatewayType: GatewayType) => void;
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 md:col-span-2">
      <p className="font-medium text-sm">{t('settings.gatewayType')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {GATEWAY_OPTIONS.map((gw) => (
          <GatewayOptionCard
            key={gw.value}
            label={gw.label}
            hint={t(gw.hintKey)}
            selected={value === gw.value}
            onSelect={() => onChange(gw.value)}
          />
        ))}
      </div>
    </div>
  );
};
