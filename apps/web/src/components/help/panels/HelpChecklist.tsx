import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface HelpChecklistProps {
  keys: string[];
  iconClassName?: string;
}

/** Checklist with optional icon color for integration guide sections. */
export const HelpChecklist = ({ keys, iconClassName = 'text-emerald-400' }: HelpChecklistProps) => {
  const { t } = useTranslation();

  return (
    <ul className="mb-4 ml-4 space-y-1.5 text-(--color-muted) text-xs">
      {keys.map((k) => (
        <li key={k} className="flex gap-2">
          <CheckCircle2 size={12} className={`mt-0.5 shrink-0 ${iconClassName}`} />
          {t(`help.${k}`)}
        </li>
      ))}
    </ul>
  );
};
