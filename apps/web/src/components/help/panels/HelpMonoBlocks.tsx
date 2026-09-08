import { useTranslation } from 'react-i18next';

interface HelpMonoBlocksProps {
  keys: string[];
}

/** Monospace code/path blocks for integration guide sections. */
export const HelpMonoBlocks = ({ keys }: HelpMonoBlocksProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-1.5">
      {keys.map((k) => (
        <div
          key={k}
          className="rounded-lg border border-(--color-border) bg-(--color-surface) p-2 font-mono text-(--color-muted) text-xs"
        >
          {t(`help.${k}`)}
        </div>
      ))}
    </div>
  );
};
