import { useTranslation } from 'react-i18next';

export const ConnectionStatusCards = ({
  devices,
}: {
  devices: { name: string; status: boolean }[];
}) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {devices.map((device) => (
        <div
          key={device.name}
          className="flex items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) p-3"
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${device.status ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-rose-400'}`}
          />
          <div>
            <p className="font-medium text-sm">{device.name}</p>
            <p className="text-(--color-muted) text-xs">
              {device.status ? t('common.connected') : t('common.disconnected')}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
