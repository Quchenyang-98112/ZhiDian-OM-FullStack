import { useTranslation } from 'react-i18next';

const HARDWARE_REQ_KEYS = [
  'help.hardwareReqVictron',
  'help.hardwareReqRpi',
  'help.hardwareReqKnx',
  'help.hardwareReqNodeRed',
  'help.hardwareReqNetwork',
] as const;

/** Hardware requirement bullets for the getting-started tab. */
export const HelpHardwareRequirementsList = () => {
  const { t } = useTranslation();

  return (
    <ul className="space-y-1.5 text-(--color-muted) text-xs">
      {HARDWARE_REQ_KEYS.map((key) => (
        <li key={key}>• {t(key)}</li>
      ))}
    </ul>
  );
};
