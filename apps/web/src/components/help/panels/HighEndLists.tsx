import { CheckCircle2, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const HIGH_END_SW = ['highEndSW1', 'highEndSW2', 'highEndSW3', 'highEndSW4', 'highEndSW5'] as const;
const HIGH_END_NET = [
  'highEndNet1',
  'highEndNet2',
  'highEndNet3',
  'highEndNet4',
  'highEndNet5',
] as const;

/** High-end software checklist items. */
export const HighEndSoftwareList = () => {
  const { t } = useTranslation();

  return (
    <ul className="mb-4 ml-4 space-y-1.5 text-(--color-muted) text-xs">
      {HIGH_END_SW.map((k) => (
        <li key={k} className="flex gap-2">
          <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-purple-400" />
          {t(`help.${k}`)}
        </li>
      ))}
    </ul>
  );
};

/** High-end network security checklist items. */
export const HighEndNetworkList = () => {
  const { t } = useTranslation();

  return (
    <ul className="ml-4 space-y-1.5 text-(--color-muted) text-xs">
      {HIGH_END_NET.map((k) => (
        <li key={k} className="flex gap-2">
          <Shield size={12} className="mt-0.5 shrink-0 text-cyan-400" />
          {t(`help.${k}`)}
        </li>
      ))}
    </ul>
  );
};
