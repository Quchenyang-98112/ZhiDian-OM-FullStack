import { Plus, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { GAMappingEntry } from './adapter-config-types';

export const ToggleSwitch = ({
  checked,
  onChange,
  label,
  id,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id: string;
  disabled?: boolean;
}) => (
  <label
    htmlFor={id}
    className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
  >
    <input
      id={id}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="peer sr-only"
    />
    <span className="sr-only">{label}</span>
    <div className="h-6 w-11 rounded-full border border-(--color-border) bg-(--color-surface) transition-colors duration-300 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-300 peer-checked:bg-(--color-primary) peer-checked:after:translate-x-5 peer-focus:ring-(--color-primary)/30 peer-focus:ring-2" />
  </label>
);

export const AdapterHelpItem = ({ titleKey, descKey }: { titleKey: string; descKey: string }) => {
  const { t } = useTranslation();
  return (
    <li className="rounded-lg border border-(--color-border)/60 bg-(--color-surface)/40 px-3 py-2">
      <p className="font-medium text-(--color-text) text-xs">{t(titleKey)}</p>
      <p className="mt-0.5 text-(--color-muted) text-[10px] leading-relaxed">{t(descKey)}</p>
    </li>
  );
};

export const GAMappingPanel = ({
  mapping,
  onChange,
}: {
  mapping: GAMappingEntry[];
  onChange: (m: GAMappingEntry[]) => void;
}) => {
  const { t } = useTranslation();
  const inputClass =
    'w-full bg-(--color-surface) border border-(--color-border) rounded-lg px-3 py-1.5 text-xs text-(--color-text) focus:outline-none focus:border-(--color-primary)/70 focus:ring-1 focus:ring-(--color-primary)/20 transition-all placeholder:text-(--color-muted) font-mono';

  const addRoom = () => {
    onChange([
      ...mapping,
      {
        roomId: `room-${mapping.length + 1}`,
        roomName: '',
        lightGA: '',
        dimmerGA: '',
        temperatureGA: '',
        setpointGA: '',
        windowGA: '',
        humidityGA: '',
      },
    ]);
  };

  const removeRoom = (idx: number) => {
    onChange(mapping.filter((_, i) => i !== idx));
  };

  const updateRoom = (idx: number, field: keyof GAMappingEntry, value: string) => {
    const updated = [...mapping];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{t('adapterConfig.gaMapping')}</p>
        <motion.button
          type="button"
          onClick={addRoom}
          className="focus-ring flex items-center gap-1 rounded-lg border border-(--color-border) bg-(--color-surface-strong) px-2.5 py-1.5 text-(--color-muted) text-xs transition-colors hover:border-(--color-primary)/30 hover:text-(--color-primary)"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Plus size={12} />
          {t('adapterConfig.addRoom')}
        </motion.button>
      </div>
      <p className="text-(--color-muted) text-xs">{t('adapterConfig.gaMappingHint')}</p>

      {mapping.length === 0 && (
        <div className="rounded-lg border border-(--color-border) border-dashed p-4 text-center text-(--color-muted) text-xs">
          {t('adapterConfig.noRooms')}
        </div>
      )}

      <AnimatePresence>
        {mapping.map((room, idx) => (
          <motion.div
            key={room.roomId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-(--color-border) bg-(--color-surface)/50 p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--color-primary)/15 font-medium text-(--color-primary) text-xs">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={room.roomName}
                  onChange={(e) => updateRoom(idx, 'roomName', e.target.value)}
                  placeholder={t('adapterConfig.roomName')}
                  className="border-transparent border-b bg-transparent px-1 py-0.5 font-medium text-(--color-text) text-sm transition-colors focus:border-(--color-primary) focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRoom(idx)}
                className="p-1 text-(--color-muted) transition-colors hover:text-rose-400"
                aria-label={t('common.cancel')}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(
                [
                  ['lightGA', 'adapterConfig.lightGA'],
                  ['dimmerGA', 'adapterConfig.dimmerGA'],
                  ['temperatureGA', 'adapterConfig.temperatureGA'],
                  ['setpointGA', 'adapterConfig.setpointGA'],
                  ['windowGA', 'adapterConfig.windowGA'],
                  ['humidityGA', 'adapterConfig.humidityGA'],
                ] as [keyof GAMappingEntry, string][]
              ).map(([field, labelKey]) => (
                <div key={field} className="space-y-1">
                  <label
                    htmlFor={`room-${room.roomId}-${field}`}
                    className="font-medium text-(--color-muted) text-[10px] uppercase tracking-wider"
                  >
                    {t(labelKey)}
                  </label>
                  <input
                    id={`room-${room.roomId}-${field}`}
                    type="text"
                    value={room[field]}
                    onChange={(e) => updateRoom(idx, field, e.target.value)}
                    placeholder="x/y/z"
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
