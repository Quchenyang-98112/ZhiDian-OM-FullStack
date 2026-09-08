import { useTranslation } from 'react-i18next';

interface HelpNumberedStepsProps {
  keys: string[];
  badgeClassName: string;
}

/** Numbered setup/architecture steps for integration guide sections. */
export const HelpNumberedSteps = ({ keys, badgeClassName }: HelpNumberedStepsProps) => {
  const { t } = useTranslation();

  return (
    <ol className="mb-4 space-y-2 text-(--color-muted) text-xs">
      {keys.map((k, i) => (
        <li key={k} className="flex gap-2">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-bold text-[10px] ${badgeClassName}`}
          >
            {i + 1}
          </span>
          <span className="leading-relaxed">{t(`help.${k}`)}</span>
        </li>
      ))}
    </ol>
  );
};
